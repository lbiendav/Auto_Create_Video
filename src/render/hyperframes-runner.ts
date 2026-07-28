import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { statSync } from "node:fs";
import { log } from "../utils/logger.js";

export type RenderQuality = "draft" | "standard" | "high";

export interface RenderArgs {
  compositionDir: string;  // path to composition directory
  outputPath: string;      // path for .mp4
  /** 24 | 30 | 60. Default 60 (TikTok chấp nhận, mượt hơn). */
  fps?: number;
  /** x264 preset bucket: draft=ultrafast/CRF28, standard=medium/CRF18, high=slow/CRF15. Default "high". */
  quality?: RenderQuality;
  /**
   * Target video bitrate, e.g. "20M". Khi set, hyperframes dùng `-b:v` (ABR)
   * thay cho CRF → đảm bảo file đạt mức bitrate cao TikTok cần.
   * Loại trừ lẫn nhau với `crf`.
   */
  videoBitrate?: string;
  /** Override CRF trực tiếp. Loại trừ lẫn nhau với `videoBitrate`. */
  crf?: number;
  /** mp4 (H.264) | webm | mov. Default "mp4". */
  format?: "mp4" | "webm" | "mov";
  /** Dùng GPU encode (videotoolbox trên macOS). Nhanh hơn nhưng chất lượng/bit thấp hơn libx264. */
  gpu?: boolean;
  /** Ngưỡng cảnh báo bitrate (Mbps) ở bước verify sau render. Default 10. */
  minMbps?: number;
}

/** Chuẩn TikTok dọc — dùng để verify sau khi render. */
export const TIKTOK_TARGET = { width: 1080, height: 1920, codec: "h264" } as const;

export interface ProbeResult {
  codec: string;
  width: number;
  height: number;
  fps: number;
  /** Mbps, tính từ tổng dung lượng file / thời lượng (đáng tin hơn stream bit_rate). */
  mbps: number;
  durationSec: number;
  sizeMB: number;
  pixFmt: string;
}

/** Đọc thông số thực tế của file MP4. Trả về null nếu máy không có ffprobe. */
export function probeVideo(path: string): ProbeResult | null {
  try {
    const out = execFileSync(
      "ffprobe",
      [
        "-v", "error",
        "-select_streams", "v:0",
        "-show_entries", "stream=codec_name,width,height,avg_frame_rate,pix_fmt",
        "-show_entries", "format=duration",
        "-of", "json",
        path,
      ],
      { encoding: "utf8" }
    );
    const j = JSON.parse(out);
    const s = j.streams?.[0] ?? {};
    const [num, den] = String(s.avg_frame_rate ?? "0/1").split("/").map(Number);
    const durationSec = parseFloat(j.format?.duration ?? "0");
    const sizeBytes = statSync(path).size;
    return {
      codec: s.codec_name ?? "?",
      width: s.width ?? 0,
      height: s.height ?? 0,
      fps: den ? Math.round((num / den) * 100) / 100 : 0,
      mbps: durationSec > 0 ? Math.round(((sizeBytes * 8) / durationSec / 1e6) * 10) / 10 : 0,
      durationSec: Math.round(durationSec * 100) / 100,
      sizeMB: Math.round((sizeBytes / 1e6) * 10) / 10,
      pixFmt: s.pix_fmt ?? "?",
    };
  } catch {
    return null;
  }
}

/** Log thông số và cảnh báo nếu lệch chuẩn TikTok dọc. */
export function verifyForTiktok(path: string, minMbps = 10): ProbeResult | null {
  const p = probeVideo(path);
  if (!p) {
    log.warn("ffprobe khong co san — bo qua buoc verify video.");
    return null;
  }
  log.info(
    `Video: ${p.width}x${p.height} ${p.codec}/${p.pixFmt} ${p.fps}fps ` +
    `~${p.mbps} Mbps  ${p.sizeMB} MB  ${p.durationSec}s`
  );
  if (p.width !== TIKTOK_TARGET.width || p.height !== TIKTOK_TARGET.height) {
    log.warn(`Do phan giai ${p.width}x${p.height} != 1080x1920 (9:16) — TikTok se crop/scale.`);
  }
  if (p.codec !== TIKTOK_TARGET.codec) log.warn(`Codec ${p.codec} != h264.`);
  if (p.pixFmt !== "yuv420p") log.warn(`pix_fmt ${p.pixFmt} != yuv420p — mot so trinh duyet khong phat duoc.`);
  if (p.mbps < minMbps) log.warn(`Bitrate ${p.mbps} Mbps < ${minMbps} Mbps — video co the bi mo sau khi TikTok nen lai.`);
  return p;
}

export async function renderWithHyperframes(args: RenderArgs): Promise<void> {
  const {
    compositionDir,
    outputPath,
    fps = 60,
    quality = "high",
    videoBitrate = "20M",
    crf,
    format = "mp4",
    gpu = false,
    minMbps = 10,
  } = args;

  const spawnArgs = [
    "hyperframes",
    "render",
    compositionDir,
    "--output",
    outputPath,
    "--fps",
    String(fps),
    "--quality",
    quality,
    "--format",
    format,
  ];

  // --crf và --video-bitrate loại trừ lẫn nhau; crf được ưu tiên nếu cả hai được set.
  if (crf != null) {
    spawnArgs.push("--crf", String(crf));
  } else if (videoBitrate) {
    spawnArgs.push("--video-bitrate", videoBitrate);
  }

  if (gpu) spawnArgs.push("--gpu");

  log.info(
    `Render: ${fps}fps quality=${quality} ${crf != null ? `crf=${crf}` : `bitrate=${videoBitrate}`} format=${format}${gpu ? " gpu" : ""}`
  );

  await new Promise<void>((resolve, reject) => {
    const proc = spawn("npx", spawnArgs, {
      stdio: ["ignore", "inherit", "inherit"],
      shell: true,
    });

    proc.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `hyperframes render failed with exit code ${code}`
          )
        );
      }
    });

    proc.on("error", (err) => {
      reject(err);
    });
  });

  log.info(`Rendered: ${outputPath}`);
  verifyForTiktok(outputPath, minMbps);
}
