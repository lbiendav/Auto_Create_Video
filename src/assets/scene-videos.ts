/**
 * Per-scene VIDEO resolution for the MAI Crypto theme.
 *
 * For every scene that supplies a `video` (a direct `src`, or a `query` to
 * search related platforms), this:
 *   1. downloads the raw clip to <outputDir>/videos/raw-scene-<id>.mp4 (cached),
 *   2. normalises it with ffmpeg into <outputDir>/videos/scene-<id>.mp4 —
 *      exactly 1080×1920, exactly the scene's duration (looped if the source is
 *      shorter), muted, constant fps, with a blurred cover-fill behind the
 *      letterboxed subject (the @oncoinx2 look, baked in so the browser does
 *      zero per-frame blur work),
 *   3. extracts a poster frame used as the still fallback / first-frame paint.
 *
 * Everything is deterministic: HyperFrames scrubs frame-by-frame, so the clip
 * must be a plain, seekable, constant-fps mp4.
 */
import { join } from "node:path";
import { existsSync, mkdirSync, statSync } from "node:fs";
import { copyFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import axios from "axios";
import { createWriteStream } from "node:fs";
import { pipeline } from "node:stream/promises";
import { readdirSync, unlinkSync } from "node:fs";
import { searchVideoCandidates } from "./video-search.js";
import type { VideoHit } from "./video-search.js";
import type { Script } from "../render/script-schema.js";
import type { VideoSearchConfig } from "../config.js";
import { log } from "../utils/logger.js";

export interface ResolvedSceneVideo {
  /** relative path to the normalised 1080×1920 mp4 */
  video: string;
  /** relative path to the extracted poster jpg (first frame) */
  poster: string | null;
  /** where the clip came from, e.g. "vnexpress.net" / "Pexels — Jane Doe" */
  credit?: string;
  /** small red marker text drawn over the beat (undefined = no marker) */
  chip?: string;
  fit: "cover" | "contain";
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Download a video to disk (streamed, size-capped). */
async function download(url: string, outAbs: string, timeoutMs = 60000): Promise<boolean> {
  try {
    const resp = await axios.get(url, {
      responseType: "stream",
      timeout: timeoutMs,
      maxRedirects: 4,
      headers: { "User-Agent": UA, Accept: "video/mp4,video/*;q=0.9,*/*;q=0.5" },
      validateStatus: (s) => s < 400,
    });
    const ct = String(resp.headers["content-type"] ?? "");
    if (ct && !/^(video\/|application\/(octet-stream|mp4))/i.test(ct)) {
      log.warn(`    non-video content-type: ${ct}`);
      return false;
    }
    const len = Number(resp.headers["content-length"] ?? 0);
    if (len > 120_000_000) {
      log.warn(`    clip too large (${(len / 1e6).toFixed(0)} MB) — skipped`);
      return false;
    }
    await pipeline(resp.data, createWriteStream(outAbs));
    return existsSync(outAbs) && statSync(outAbs).size > 40_000;
  } catch (e: any) {
    log.warn(`    download failed: ${e?.message ?? e}`);
    return false;
  }
}

/**
 * yt-dlp có sẵn trong máy không? Nhớ kết quả để khỏi spawn lại mỗi scene.
 *
 * Vì sao cần yt-dlp: YouTube Data API chỉ trả metadata (videoId, tiêu đề,
 * thumbnail) — nó KHÔNG trả file mp4. Muốn đưa clip vào ffmpeg thì phải có một
 * công cụ tải riêng.
 */
let ytdlpOk: boolean | null = null;
function hasYtDlp(bin: string): boolean {
  if (ytdlpOk !== null) return ytdlpOk;
  try {
    execSync(`${bin} --version`, { stdio: "ignore" });
    ytdlpOk = true;
  } catch {
    ytdlpOk = false;
    log.warn(
      `    KHÔNG tìm thấy "${bin}" — nguồn youtube sẽ bị bỏ qua.\n` +
        `      Cài: brew install yt-dlp   (hoặc  pipx install yt-dlp)\n` +
        `      Hoặc trỏ YTDLP_PATH=/đường/dẫn/yt-dlp trong .env`,
    );
  }
  return ytdlpOk;
}

/**
 * Ưu tiên H.264 (`avc1`) một cách CÓ CHỦ Ý.
 *
 * Để yt-dlp tự chọn thì nó hay trả về AV1 — nén tốt hơn nhưng giải mã bằng CPU
 * chậm hơn H.264 nhiều lần. `normalise()` phải decode toàn bộ clip để encode
 * lại, và renderer thì quét từng khung ở 60fps, nên AV1 làm chậm cả pipeline mà
 * không được lợi gì: đầu ra vốn đã bị encode lại thành H.264.
 *
 * Thứ tự: avc1 → mp4 bất kỳ → gì cũng được. Chỉ lấy luồng hình (`bv*`) vì
 * `normalise()` bỏ audio bằng `-an`.
 */
export const YT_FORMAT =
  "bv*[vcodec^=avc1][height<=1920]/bv*[vcodec^=avc1]/" +
  "bv*[height<=1920][ext=mp4]/bv*[ext=mp4]/bv*/b[ext=mp4]/b";

/**
 * Tải một clip YouTube về `outAbs`.
 *
 * Chỉ lấy luồng HÌNH (`bv*`): `normalise()` phía dưới vốn đã bỏ audio bằng
 * `-an`, nên tải cả tiếng chỉ tốn băng thông và bắt yt-dlp phải merge.
 */
function downloadYouTube(url: string, outAbs: string, bin: string): boolean {
  if (!hasYtDlp(bin)) return false;
  const fmt = YT_FORMAT;
  try {
    execSync(
      `${bin} --no-playlist --no-warnings --no-progress --socket-timeout 30 ` +
        `--max-filesize 120M --force-overwrites --remux-video mp4 ` +
        `-f "${fmt}" -o "${outAbs}" "${url}"`,
      { stdio: "ignore", timeout: 180000 },
    );
  } catch (e: any) {
    log.warn(`    yt-dlp thất bại: ${e?.message ?? e}`);
  }
  if (existsSync(outAbs) && statSync(outAbs).size > 40_000) return true;

  // yt-dlp đôi khi ghi ra đuôi khác (.webm/.mkv) nếu remux không chạy — nhặt lại.
  try {
    const dir = outAbs.slice(0, outAbs.lastIndexOf("/"));
    const stem = outAbs.slice(outAbs.lastIndexOf("/") + 1).replace(/\.mp4$/, "");
    const stray = readdirSync(dir).find((f) => f.startsWith(stem) && f !== `${stem}.mp4`);
    if (stray) {
      execSync(`ffmpeg -y -i "${dir}/${stray}" -c copy "${outAbs}"`, { stdio: "ignore" });
      unlinkSync(`${dir}/${stray}`);
      return existsSync(outAbs) && statSync(outAbs).size > 40_000;
    }
  } catch {
    /* bỏ qua */
  }
  return false;
}

/** Tải một ứng viên bất kỳ — tự chọn yt-dlp hay HTTP tuỳ nguồn. */
async function fetchCandidate(hit: VideoHit, outAbs: string, cfg: VideoSearchConfig): Promise<boolean> {
  if (hit.kind === "youtube") return downloadYouTube(hit.url, outAbs, cfg.ytdlpPath);
  return download(hit.url, outAbs);
}

/** True when ffmpeg can actually decode a video stream out of the file. */
function hasVideoStream(abs: string): boolean {
  try {
    const out = execSync(
      `ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of csv=p=0 "${abs}"`,
      { encoding: "utf8" },
    );
    return out.trim().startsWith("video");
  } catch {
    return false;
  }
}

/**
 * Normalise any source clip into a deterministic 1080×1920 beat of exactly
 * `durationSec`, muted, at `fps`. `contain` letterboxes the subject over its own
 * blurred fill; `cover` crops to fill.
 */
export function normalise(
  srcAbs: string,
  outAbs: string,
  opts: { durationSec: number; startSec: number; fps: number; fit: "cover" | "contain"; speed: number },
): boolean {
  const { durationSec, startSec, fps, fit, speed } = opts;
  const pts = speed !== 1 ? `setpts=PTS/${speed},` : "";

  const filter =
    fit === "cover"
      ? `[0:v]${pts}scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,fps=${fps},format=yuv420p[v]`
      : `[0:v]${pts}split=2[bg][fg];` +
        `[bg]scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,gblur=sigma=26,eq=brightness=-0.12:saturation=1.2[bgb];` +
        `[fg]scale=1080:1920:force_original_aspect_ratio=decrease[fgs];` +
        `[bgb][fgs]overlay=(W-w)/2:(H-h)/2,fps=${fps},format=yuv420p[v]`;

  try {
    execSync(
      `ffmpeg -y -ss ${startSec.toFixed(2)} -stream_loop -1 -i "${srcAbs}" -t ${durationSec.toFixed(2)} ` +
        `-filter_complex "${filter}" -map "[v]" -an ` +
        `-c:v libx264 -preset veryfast -crf 18 -pix_fmt yuv420p -g ${fps} -movflags +faststart "${outAbs}"`,
      { stdio: "ignore" },
    );
    return existsSync(outAbs) && statSync(outAbs).size > 20_000;
  } catch (e) {
    log.warn(`    ffmpeg normalise failed: ${e}`);
    return false;
  }
}

/** Grab the first frame as a still (poster / fallback paint). */
function extractPoster(videoAbs: string, outAbs: string): boolean {
  try {
    execSync(`ffmpeg -y -i "${videoAbs}" -frames:v 1 -q:v 3 "${outAbs}"`, { stdio: "ignore" });
    return existsSync(outAbs);
  } catch {
    return false;
  }
}

export async function resolveSceneVideos(
  script: Script,
  outputDir: string,
  sceneDurations: Record<string, number>,
  cfg: VideoSearchConfig,
  fps: number,
): Promise<Record<string, ResolvedSceneVideo>> {
  const out: Record<string, ResolvedSceneVideo> = {};
  const wanted = script.scenes.filter((s) => s.video && (s.video.src || s.video.query));
  if (!wanted.length) return out;

  if (!cfg.enabled) {
    log.info("  scene videos: disabled (SCENE_VIDEO_ENABLED=0) — using stills");
    return out;
  }

  const vidDir = join(outputDir, "videos");
  mkdirSync(vidDir, { recursive: true });

  for (const scene of wanted) {
    const spec = scene.video!;
    const dur = sceneDurations[scene.id];
    if (!dur || dur <= 0) continue;

    const rawAbs = join(vidDir, `raw-scene-${scene.id}.mp4`);
    const outAbs = join(vidDir, `scene-${scene.id}.mp4`);
    const posterAbs = join(vidDir, `scene-${scene.id}.jpg`);
    let credit: string | undefined;

    // 1) raw source — cached (delete raw-scene-<id>.mp4 to force a refetch)
    let haveRaw = existsSync(rawAbs) && hasVideoStream(rawAbs);
    if (haveRaw) {
      log.info(`  scene ${scene.id}: REUSE raw clip (delete to refetch)`);
    } else if (spec.src && !/^https?:\/\//i.test(spec.src)) {
      const localAbs = spec.src.startsWith("/") ? spec.src : join(outputDir, spec.src);
      if (existsSync(localAbs)) {
        await copyFile(localAbs, rawAbs);
        haveRaw = hasVideoStream(rawAbs);
        credit = "local";
      } else {
        log.warn(`  scene ${scene.id}: local clip not found: ${localAbs}`);
      }
    } else if (spec.src) {
      haveRaw = (await download(spec.src, rawAbs)) && hasVideoStream(rawAbs);
      if (haveRaw) {
        try {
          credit = new URL(spec.src).hostname.replace(/^www\./, "");
        } catch {
          /* ignore */
        }
      }
    }

    // 2) search related platforms by keyword
    if (!haveRaw && spec.query) {
      log.info(`  scene ${scene.id}: searching clips for "${spec.query}"…`);
      const candidates = await searchVideoCandidates(spec.query, cfg);
      for (const hit of candidates) {
        if (await fetchCandidate(hit, rawAbs, cfg)) {
          if (hasVideoStream(rawAbs)) {
            haveRaw = true;
            credit = hit.credit ?? hit.sourcePage;
            log.info(`  scene ${scene.id}: clip ← ${credit ?? "web"}`);
            break;
          }
        }
      }
      if (!haveRaw) {
        log.warn(
          `  scene ${scene.id}: KHÔNG tìm được clip cho "${spec.query}" → dùng ảnh tĩnh thay thế.` +
            (cfg.youtubeKey || cfg.pexelsKey || cfg.pixabayKey
              ? cfg.youtubeKey && !cfg.pexelsKey && !cfg.pixabayKey
                ? ` Mẹo: kho Creative Commons trên YouTube khá nhỏ — thêm PEXELS_API_KEY (miễn phí, pexels.com/api) làm nguồn dự phòng.`
                : ""
              : ` Mẹo: thêm YOUTUBE_API_KEY, PEXELS_API_KEY (miễn phí, pexels.com/api) hoặc PIXABAY_API_KEY vào .env để có kho clip ổn định.`),
        );
      }
    }

    if (!haveRaw) continue;

    // 3) normalise to the exact beat length + frame size
    const ok = normalise(rawAbs, outAbs, {
      durationSec: Math.min(dur, Math.max(dur, 0)), // full beat; loops if source is shorter
      startSec: spec.startSec ?? 0,
      fps,
      fit: spec.fit ?? "contain",
      speed: spec.speed ?? 1,
    });
    if (!ok) continue;

    const posterOk = extractPoster(outAbs, posterAbs);
    out[scene.id] = {
      video: `videos/scene-${scene.id}.mp4`,
      poster: posterOk ? `videos/scene-${scene.id}.jpg` : null,
      credit,
      chip: spec.chip,
      fit: spec.fit ?? "contain",
    };
    log.info(`  scene ${scene.id}: video ready (${dur.toFixed(2)}s, ${spec.fit ?? "contain"})`);
  }

  log.info(`  scene videos: ${Object.keys(out).length}/${wanted.length} resolved`);
  return out;
}
