/**
 * Per-scene image resolution for the MAI Crypto (image-driven) theme.
 *
 * For every scene that supplies an `image` (a direct `src` URL/path, or a text
 * `prompt` to AI-generate), this downloads/copies the picture into
 * <outputDir>/images/scene-<id>.jpg and pre-blurs a cover-fill companion
 * <outputDir>/images/scene-<id>-blur.jpg (fast, one-time — CSS per-frame blur
 * is too slow for HyperFrames). Returns relative paths the composer consumes.
 */
import { join } from "node:path";
import { existsSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { fetchImage } from "./image-fetcher.js";
import { searchImageCandidates } from "./image-search.js";
import type { Script } from "../render/script-schema.js";
import type { ImageGenConfig, ImageSearchConfig } from "../config.js";
import { log } from "../utils/logger.js";

export interface ResolvedSceneImage {
  /** relative path to the sharp foreground image, or null → themed/gradient bg */
  image: string | null;
  /** relative path to the pre-blurred cover-fill, or null */
  blur: string | null;
  fit: "contain" | "cover";
  kb: "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
}

/** Stable non-negative hash for deterministic image seeds. */
function hashSeed(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 100000;
}

/** Build a Pollinations text→image URL (free, no API key). */
function pollinationsUrl(prompt: string, cfg: ImageGenConfig, seed: number): string {
  const full = `${prompt}. ${cfg.stylePrompt}`.trim();
  const base = cfg.endpoint.replace(/\/+$/, "");
  const qs = `width=1080&height=1350&nologo=true&enhance=true&model=flux&seed=${seed}`;
  return `${base}/${encodeURIComponent(full)}?${qs}`;
}

/** Pre-blur an image into a cover-fill companion. Returns true on success. */
function makeBlur(srcAbs: string, outAbs: string): boolean {
  try {
    execSync(
      `ffmpeg -y -i "${srcAbs}" -vf "scale=540:-2,gblur=sigma=26,eq=brightness=-0.10:saturation=1.25" -q:v 4 "${outAbs}"`,
      { stdio: "ignore" },
    );
    return existsSync(outAbs);
  } catch {
    return false;
  }
}

/** Turn a rich AI prompt into a short web-search query when no explicit query is given. */
function deriveQuery(prompt: string): string {
  const firstClause = prompt.split(/[,.:]/)[0] ?? prompt;
  return firstClause.split(/\s+/).filter(Boolean).slice(0, 8).join(" ");
}

export async function resolveSceneImages(
  script: Script,
  outputDir: string,
  imageGen: ImageGenConfig,
  imageSearch: ImageSearchConfig,
): Promise<Record<string, ResolvedSceneImage>> {
  const out: Record<string, ResolvedSceneImage> = {};
  const imgDir = join(outputDir, "images");

  for (const scene of script.scenes) {
    const spec = scene.image;
    const fit = spec?.fit ?? "contain";
    const kb = spec?.kenBurns ?? "zoom-in";

    if (!spec || (!spec.src && !spec.prompt && !spec.query)) {
      out[scene.id] = { image: null, blur: null, fit, kb };
      continue;
    }

    const imgRel = `images/scene-${scene.id}.jpg`;
    const blurRel = `images/scene-${scene.id}-blur.jpg`;
    const imgAbsFull = join(imgDir, `scene-${scene.id}.jpg`);
    const blurAbsFull = join(imgDir, `scene-${scene.id}-blur.jpg`);

    // IDEMPOTENT: reuse a previously fetched image (delete it to force refetch)
    if (existsSync(imgAbsFull)) {
      const blurOk = existsSync(blurAbsFull) || makeBlur(imgAbsFull, blurAbsFull);
      out[scene.id] = { image: imgRel, blur: blurOk ? blurRel : null, fit, kb };
      log.info(`  scene ${scene.id}: REUSE image (delete to refetch)`);
      continue;
    }

    let ok = false;

    // 1) direct src that is a local file already on disk → copy in
    if (spec.src && !/^https?:\/\//i.test(spec.src)) {
      const localAbs = spec.src.startsWith("/") ? spec.src : join(outputDir, spec.src);
      if (existsSync(localAbs)) {
        try {
          await copyFile(localAbs, imgAbsFull);
          ok = true;
        } catch (e) {
          log.warn(`  scene ${scene.id}: could not copy local image ${spec.src}: ${e}`);
        }
      } else {
        log.warn(`  scene ${scene.id}: local image not found: ${localAbs}`);
      }
    }

    // 2) direct src URL
    if (!ok && spec.src && /^https?:\/\//i.test(spec.src)) {
      const r = await fetchImage(spec.src, imgAbsFull);
      ok = r.success;
      if (!ok) log.warn(`  scene ${scene.id}: image src fetch failed (${r.reason})`);
    }

    // 2.5) REAL photo from related web ARTICLES (preferred). Search the query,
    //      open the result pages, pull each article's lead image (og:image), and
    //      keep the first that downloads. Source logged for credit ("Ảnh: <domain>").
    if (!ok && (spec.query || spec.prompt)) {
      const q = spec.query ?? deriveQuery(spec.prompt!);
      const candidates = await searchImageCandidates(q, imageSearch);
      for (const hit of candidates) {
        const r = await fetchImage(hit.url, imgAbsFull, 25000);
        if (r.success) {
          ok = true;
          log.info(`  scene ${scene.id}: real photo \u2190 ${hit.credit ?? hit.sourcePage ?? "web"}`);
          break;
        }
      }
      if (!ok) log.info(`  scene ${scene.id}: no usable web image for "${q}" (tried ${candidates.length})`);
    }

    // 3) AI-generate from prompt (Pollinations) — retry with longer timeouts;
    //    generation of the first request can take 20-40s, so be patient.
    if (!ok && spec.prompt && imageGen.enabled) {
      const url = pollinationsUrl(spec.prompt, imageGen, hashSeed(scene.id + spec.prompt));
      for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
        log.info(`  scene ${scene.id}: generating image (attempt ${attempt}/3)…`);
        const r = await fetchImage(url, imgAbsFull, 45000 + (attempt - 1) * 25000);
        ok = r.success;
        if (!ok) log.warn(`  scene ${scene.id}: gen attempt ${attempt} failed (${r.reason})`);
      }
      if (!ok) log.warn(`  scene ${scene.id}: image generation failed after retries → themed backdrop`);
    }

    if (ok) {
      const blurOk = makeBlur(imgAbsFull, blurAbsFull);
      out[scene.id] = { image: imgRel, blur: blurOk ? blurRel : null, fit, kb };
    } else {
      out[scene.id] = { image: null, blur: null, fit, kb };
    }
  }

  const withImg = Object.values(out).filter((r) => r.image).length;
  log.info(`  scene images: ${withImg}/${script.scenes.length} resolved (rest use themed bg)`);
  return out;
}
