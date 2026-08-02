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
import { fetchImage } from "./image-fetcher.js";
import { searchImageCandidates } from "./image-search.js";
import type { Script } from "../render/script-schema.js";
import type { ImageGenConfig, ImageSearchConfig } from "../config.js";
import { execSync } from "node:child_process";
import { log } from "../utils/logger.js";

export interface ResolvedSceneImage {
  /** relative path to the sharp foreground image, or null → themed/gradient bg */
  image: string | null;
  /** relative path to the pre-blurred cover-fill, or null */
  blur: string | null;
  fit: "contain" | "cover";
  kb: "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
  /**
   * Nhánh nào thực sự cho ra file ảnh. Quan trọng vì `src` (ảnh og/thumbnail
   * do người viết script chỉ định) hầu như luôn là TITLE-CARD có chữ nung sẵn,
   * còn `search`/`gen` cho ra ảnh chụp không chữ. Hai loại này chịu `cover`
   * khác hẳn nhau — xem guard trong resolveSceneImages().
   */
  source?: "src" | "search" | "gen" | null;
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

/** Resolve ONE image spec into <imgDir>/<stem>.jpg (+ pre-blurred companion). */
async function resolveOne(
  spec: { src?: string; query?: string; prompt?: string; fit?: "contain" | "cover"; kenBurns?: ResolvedSceneImage["kb"] },
  outputDir: string,
  stem: string,
  label: string,
  imageGen: ImageGenConfig,
  imageSearch: ImageSearchConfig,
): Promise<ResolvedSceneImage> {
  const imgDir = join(outputDir, "images");
  const fit = spec.fit ?? "contain";
  const kb = spec.kenBurns ?? "zoom-in";

  const imgRel = `images/${stem}.jpg`;
  const blurRel = `images/${stem}-blur.jpg`;
  const imgAbsFull = join(imgDir, `${stem}.jpg`);
  const blurAbsFull = join(imgDir, `${stem}-blur.jpg`);

  // IDEMPOTENT: reuse a previously fetched image (delete it to force refetch)
  if (existsSync(imgAbsFull)) {
    const blurOk = existsSync(blurAbsFull) || makeBlur(imgAbsFull, blurAbsFull);
    log.info(`  ${label}: REUSE image (delete to refetch)`);
    // Không biết lần trước nhánh nào thắng → suy từ spec. `src` được ưu tiên
    // cao nhất nên nếu có src thì nhiều khả năng chính nó đã cho ra file này.
    const guessed = spec.src ? "src" : spec.query ? "search" : spec.prompt ? "gen" : null;
    return { image: imgRel, blur: blurOk ? blurRel : null, fit, kb, source: guessed };
  }

  let ok = false;
  let source: ResolvedSceneImage["source"] = null;

  // 1) direct src that is a local file already on disk → copy in
  if (spec.src && !/^https?:\/\//i.test(spec.src)) {
    const localAbs = spec.src.startsWith("/") ? spec.src : join(outputDir, spec.src);
    if (existsSync(localAbs)) {
      try {
        await copyFile(localAbs, imgAbsFull);
        ok = true;
        source = "src";
      } catch (e) {
        log.warn(`  ${label}: could not copy local image ${spec.src}: ${e}`);
      }
    } else {
      log.warn(`  ${label}: local image not found: ${localAbs}`);
    }
  }

  // 2) direct src URL
  if (!ok && spec.src && /^https?:\/\//i.test(spec.src)) {
    const r = await fetchImage(spec.src, imgAbsFull);
    ok = r.success;
    if (ok) source = "src";
    else log.warn(`  ${label}: image src fetch failed (${r.reason})`);
  }

  // 2.5) REAL photo from related web ARTICLES (preferred)
  if (!ok && (spec.query || spec.prompt)) {
    const q = spec.query ?? deriveQuery(spec.prompt!);
    const candidates = await searchImageCandidates(q, imageSearch);
    for (const hit of candidates) {
      const r = await fetchImage(hit.url, imgAbsFull, 25000);
      if (r.success) {
        ok = true;
        source = "search";
        log.info(`  ${label}: real photo \u2190 ${hit.credit ?? hit.sourcePage ?? "web"}`);
        break;
      }
    }
    if (!ok) log.info(`  ${label}: no usable web image for "${q}" (tried ${candidates.length})`);
  }

  // 3) AI-generate from prompt (Pollinations)
  if (!ok && spec.prompt && imageGen.enabled) {
    const url = pollinationsUrl(spec.prompt, imageGen, hashSeed(stem + spec.prompt));
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      log.info(`  ${label}: generating image (attempt ${attempt}/3)…`);
      const r = await fetchImage(url, imgAbsFull, 45000 + (attempt - 1) * 25000);
      ok = r.success;
      if (ok) source = "gen";
      else log.warn(`  ${label}: gen attempt ${attempt} failed (${r.reason})`);
    }
    if (!ok) log.warn(`  ${label}: image generation failed after retries → themed backdrop`);
  }

  if (!ok) return { image: null, blur: null, fit, kb, source: null };
  const blurOk = makeBlur(imgAbsFull, blurAbsFull);
  return { image: imgRel, blur: blurOk ? blurRel : null, fit, kb, source };
}

/**
 * `cover` phóng ảnh lấp đầy khung 1080×1920 rồi CẮT phần thừa. Với ảnh NGANG
 * (ảnh báo, biểu đồ, logo, ảnh chụp màn hình) việc đó vứt đi phần lớn bề ngang
 * — chữ trong ảnh mất sạch hai đầu.
 *
 * Ví dụ thật: ảnh 3556×2000 (16:9) đặt `cover` → scale theo chiều cao còn
 * 3413px ngang → cắt xuống 1080 → GIỮ LẠI 32%, mất 68%.
 *
 * Hàm này trả về tỉ lệ bề ngang còn lại (0–1). >= 1 nghĩa là không cắt gì.
 */
const FRAME_ASPECT = 1080 / 1920; // 0.5625

function coverWidthKept(absPath: string): number | null {
  try {
    const out = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "${absPath}"`,
      { encoding: "utf8" },
    ).trim();
    const [w, h] = out.split(",").map(Number);
    if (!w || !h) return null;
    const srcAspect = w / h;
    // ảnh dọc hơn khung thì cover cắt chiều CAO, bề ngang giữ nguyên
    if (srcAspect <= FRAME_ASPECT) return 1;
    return FRAME_ASPECT / srcAspect;
  } catch {
    return null;
  }
}

/** Dưới ngưỡng này thì `cover` coi như phá hỏng ảnh. */
const COVER_MIN_KEPT = 0.72;

/**
 * Template mà ảnh CHỈ là hoạ tiết nền: hoặc bị khối chữ/ô lưới che gần hết,
 * hoặc CSS của nó phớt lờ `fit` luôn. Ở đây cắt là có chủ ý → bỏ qua guard.
 *
 *  - hook-collage : ảnh nằm trong các ô `.mc-cell`, đi qua resolveSceneCellImages
 *  - finance-hook : `.mc-fin-subject` hard-code `background-size: contain`
 *  - document     : `.mc-doc` hard-code contain
 *  - brand-outro / outro : không dùng ảnh scene
 *
 * Mọi template KHÁC đều đổ về renderImageScene hoặc renderHookSplit — hai chỗ
 * duy nhất thực sự đọc `img.fit` và vẽ ảnh phủ nguyên khung — nên phải kiểm
 * tra. Mặc định "có kiểm tra" là hướng an toàn: guard chỉ hạ cover→contain,
 * không bao giờ làm ngược lại.
 */
const FIT_AGNOSTIC_TEMPLATES = new Set([
  "hook-collage",
  "finance-hook",
  "document",
  "brand-outro",
  "outro",
]);

/**
 * `hook-split` là cảnh mở màn, `cover` tràn khung chính là cái làm nó đẹp — nên
 * KHÔNG hạ nó xuống contain một cách vô tội vạ. Chỉ hạ khi ảnh đến từ `src`,
 * tức URL do script chỉ định thẳng, mà trong thực tế gần như luôn là ảnh og /
 * thumbnail của bài báo: một title-card 16:9 có dòng tiêu đề NUNG SẴN trải hết
 * bề ngang. Chữ đó không có khung cắt 9:16 nào giữ nổi.
 *
 * Ảnh từ `search`/`gen` là ảnh chụp không chữ — cắt 68% bề ngang vẫn ra hình
 * đẹp, giữ nguyên `cover` cho chúng để hook các video khác không đổi diện mạo.
 */
function coverIsRiskyFor(template: string | undefined, source: ResolvedSceneImage["source"]): boolean {
  if (template && FIT_AGNOSTIC_TEMPLATES.has(template)) return false;
  if (template === "hook-split") return source === "src";
  return true;
}

export async function resolveSceneImages(
  script: Script,
  outputDir: string,
  imageGen: ImageGenConfig,
  imageSearch: ImageSearchConfig,
): Promise<Record<string, ResolvedSceneImage>> {
  const out: Record<string, ResolvedSceneImage> = {};

  for (const scene of script.scenes) {
    const spec = scene.image;
    if (!spec || (!spec.src && !spec.prompt && !spec.query)) {
      out[scene.id] = {
        image: null,
        blur: null,
        fit: spec?.fit ?? "contain",
        kb: spec?.kenBurns ?? "zoom-in",
      };
      continue;
    }
    const res = await resolveOne(spec, outputDir, `scene-${scene.id}`, `scene ${scene.id}`, imageGen, imageSearch);

    // Guard gate theo TEMPLATE + NGUỒN ẢNH, không theo scene.type nữa. Trước
    // đây mọi cảnh `type: "hook"` đều được miễn với lý do "ảnh hook chỉ là nền"
    // — đúng với hook-collage/finance-hook, nhưng SAI với hook-split: ở đó
    // `.mc-split-top` là inset:0 toàn khung và panel chỉ phủ từ `splitAt`
    // (~0.51) xuống, nên nửa trên là ảnh trần, cắt bao nhiêu người xem thấy hết.
    const template = scene.templateData?.template;
    if (res.fit === "cover" && res.image && coverIsRiskyFor(template, res.source)) {
      const kept = coverWidthKept(join(outputDir, res.image));
      if (kept !== null && kept < COVER_MIN_KEPT) {
        log.warn(
          `  scene ${scene.id} (${template ?? "?"}, nguồn: ${res.source ?? "?"}): "fit":"cover" ` +
            `trên ảnh ngang sẽ cắt mất ${Math.round((1 - kept) * 100)}% bề ngang ` +
            `(chữ trong ảnh mất hai đầu) → tự chuyển sang "contain".\n` +
            `      Muốn giữ cover thì đổi sang ảnh dọc, dùng "query" tìm ảnh chụp ` +
            `không chữ, hoặc dùng template "document".`,
        );
        res.fit = "contain";
      }
    }
    out[scene.id] = res;
  }

  const withImg = Object.values(out).filter((r) => r.image).length;
  log.info(`  scene images: ${withImg}/${script.scenes.length} resolved (rest use themed bg)`);
  return out;
}

/**
 * Resolve the EXTRA cell images used by multi-cell templates (hook-collage).
 * Each scene's `images[]` becomes images/scene-<id>-c<idx>.jpg. Scenes without
 * an `images` array are skipped (the collage then falls back to `image`).
 */
export async function resolveSceneCellImages(
  script: Script,
  outputDir: string,
  imageGen: ImageGenConfig,
  imageSearch: ImageSearchConfig,
): Promise<Record<string, ResolvedSceneImage[]>> {
  const out: Record<string, ResolvedSceneImage[]> = {};

  for (const scene of script.scenes) {
    const specs = scene.images;
    if (!specs?.length) continue;
    const cells: ResolvedSceneImage[] = [];
    for (let i = 0; i < specs.length; i++) {
      const spec = specs[i];
      if (!spec.src && !spec.prompt && !spec.query) {
        cells.push({ image: null, blur: null, fit: spec.fit ?? "cover", kb: spec.kenBurns ?? "zoom-in" });
        continue;
      }
      cells.push(
        await resolveOne(
          spec,
          outputDir,
          `scene-${scene.id}-c${i + 1}`,
          `scene ${scene.id} cell ${i + 1}`,
          imageGen,
          imageSearch,
        ),
      );
    }
    out[scene.id] = cells;
    log.info(`  scene ${scene.id}: collage cells ${cells.filter((c) => c.image).length}/${cells.length} resolved`);
  }
  return out;
}
