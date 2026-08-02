/**
 * Kiểm tra nhanh nguồn video YouTube (CC-BY) đầu-cuối.
 *
 *   npx tsx scripts/check-youtube.ts             # từ khoá mặc định
 *   npx tsx scripts/check-youtube.ts "bitcoin etf"
 *
 * Script chạy đúng code mà pipeline dùng thật (`searchVideoCandidates`), nên nếu
 * nó xanh thì scene có `video: { query }` cũng sẽ chạy được.
 *
 * Ba thứ được kiểm:
 *   1. YOUTUBE_API_KEY hợp lệ + API đã bật
 *   2. Parse đúng response thật của Google, và LỌC ĐÚNG licence Creative Commons
 *   3. yt-dlp tải được file, ffprobe đọc ra luồng hình
 */
import "dotenv/config";
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, statSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { searchVideoCandidates } from "../src/assets/video-search.js";
import { normalise, YT_FORMAT } from "../src/assets/scene-videos.js";
import type { VideoSearchConfig } from "../src/config.js";

const query = process.argv.slice(2).join(" ") || "bitcoin";
const ytdlpPath = process.env.YTDLP_PATH || "yt-dlp";

const cfg: VideoSearchConfig = {
  enabled: true,
  order: ["youtube"],
  youtubeKey: process.env.YOUTUBE_API_KEY,
  ytdlpPath,
  youtubeMaxSec: Number(process.env.YOUTUBE_MAX_SEC ?? 1200),
  maxClipSec: Number(process.env.SCENE_VIDEO_MAX_SEC ?? 12),
};

function ok(m: string) {
  console.log(`\x1b[32m  ✓\x1b[0m ${m}`);
}
function bad(m: string) {
  console.log(`\x1b[31m  ✗\x1b[0m ${m}`);
}

// ── 1. key ───────────────────────────────────────────────────────────────────
console.log("\n1) YOUTUBE_API_KEY");
if (!cfg.youtubeKey) {
  bad("chưa có trong .env — thêm YOUTUBE_API_KEY=... rồi chạy lại");
  process.exit(1);
}
ok(`đã nạp (…${cfg.youtubeKey.slice(-6)})`);

// ── 2. tìm kiếm ──────────────────────────────────────────────────────────────
console.log(`\n2) Tìm clip Creative Commons cho "${query}"`);
const hits = await searchVideoCandidates(query, cfg);
if (!hits.length) {
  bad("không có kết quả.");
  console.log(
    `     Đọc dòng log ngay phía trên để biết lý do — hai nguyên nhân cần xử lý ngược nhau:\n` +
      `       · "không phải Creative Commons"  → chịu, chủ đề này không có clip dùng lại được.\n` +
      `                                          Thử từ khoá khác/rộng hơn, hoặc thêm PEXELS_API_KEY.\n` +
      `       · "dài quá ${cfg.youtubeMaxSec}s"${" ".repeat(Math.max(0, 8 - String(cfg.youtubeMaxSec).length))}          → nới YOUTUBE_MAX_SEC trong .env theo số gợi ý.\n` +
      `     Nếu MỌI từ khoá đều trắng vì lý do thứ nhất thì đó là bản chất kho CC-BY, không phải lỗi cấu hình.`,
  );
  process.exit(1);
}
ok(`${hits.length} clip`);
for (const h of hits) {
  console.log(`     • ${h.credit}`);
  console.log(`       ${h.license}  ·  ${h.url}`);
  if (h.license !== "CC BY 3.0") bad(`       licence lạ — đáng lẽ bộ lọc phải chặn: ${h.license}`);
}

// ── 3. yt-dlp ────────────────────────────────────────────────────────────────
console.log("\n3) yt-dlp");
let ver = "";
try {
  ver = execSync(`${ytdlpPath} --version`, { encoding: "utf8" }).trim();
  ok(`có sẵn (bản ${ver})`);
} catch {
  bad(`không tìm thấy "${ytdlpPath}"`);
  console.log("     Cài: brew install yt-dlp");
  console.log("     Không có nó thì nguồn youtube tự bị bỏ qua (pipeline vẫn chạy, dùng ảnh tĩnh).");
  process.exit(1);
}

// ── 4. tải thử ───────────────────────────────────────────────────────────────
console.log("\n4) Tải thử clip đầu tiên");
const dir = join(tmpdir(), "acv-yt-check");
mkdirSync(dir, { recursive: true });
const out = join(dir, "probe.mp4");
rmSync(out, { force: true });
const fmt = YT_FORMAT; // dùng đúng chuỗi format của pipeline, không chép lại
const cmd =
  `${ytdlpPath} --no-playlist --no-progress --socket-timeout 30 ` +
  `--max-filesize 120M --force-overwrites --remux-video mp4 ` +
  `-f "${fmt}" -o "${out}" "${hits[0].url}"`;

try {
  // stderr PHẢI được giữ lại — nuốt nó đi thì script chẩn đoán thành vô dụng
  execSync(cmd, { stdio: ["ignore", "pipe", "pipe"], timeout: 180000, encoding: "utf8" });
} catch (e: any) {
  const err = String(e?.stderr ?? "") + String(e?.stdout ?? "");
  bad("yt-dlp không tải được. Nguyên văn lỗi:");
  console.log(
    err
      .trim()
      .split("\n")
      .slice(-12)
      .map((l) => `       ${l}`)
      .join("\n") || "       (không có output — có thể bị timeout)",
  );

  // đoán nguyên nhân theo từ khoá trong stderr
  console.log("");
  if (/larger than max-filesize|File is larger/i.test(err)) {
    console.log("     → Clip nặng hơn 120 MB. Đây là chốt chặn cố ý, không phải hỏng.");
    console.log("       Video CC-BY hay dài 20-60 phút nên luồng hình dễ vượt ngưỡng.");
    console.log("       Cách đúng là tải đúng đoạn cần (--download-sections) thay vì nới ngưỡng.");
  } else if (/Sign in to confirm|bot|cookies|403|429|unavailable/i.test(err)) {
    console.log("     → YouTube đang chặn yt-dlp (chống bot). Thử:");
    console.log(`       ${ytdlpPath} -U                      # cập nhật, thường là đủ`);
    console.log(`       ${ytdlpPath} --cookies-from-browser chrome ...   # nếu vẫn chặn`);
  } else if (/Requested format is not available/i.test(err)) {
    console.log("     → Không có định dạng khớp. Xem yt-dlp liệt kê được gì:");
    console.log(`       ${ytdlpPath} -F "${hits[0].url}"`);
  } else {
    console.log("     → Chạy tay lệnh dưới để xem đầy đủ:");
    console.log(`       ${cmd}`);
  }
  process.exit(1);
}
if (!existsSync(out) || statSync(out).size < 40_000) {
  bad("không ra file hợp lệ");
  process.exit(1);
}
ok(`tải xong ${(statSync(out).size / 1e6).toFixed(1)} MB`);

let codec = "";
try {
  const probe = execSync(
    `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height -of csv=p=0 "${out}"`,
    { encoding: "utf8" },
  ).trim();
  codec = probe.split(",")[0];
  ok(`ffprobe đọc được luồng hình: ${probe}`);
  if (codec === "av1")
    console.log(
      "     ⚠ AV1 — giải mã bằng CPU chậm hơn H.264 đáng kể.\n" +
        "       Kênh này không phát H.264 nên yt-dlp đành lấy AV1. Chạy được, chỉ chậm hơn.",
    );
} catch {
  bad("ffprobe không đọc ra luồng hình — file hỏng");
  process.exit(1);
}

// ── 5. normalise ─────────────────────────────────────────────────────────────
// Mắt xích cuối chưa được kiểm: ffmpeg có decode nổi clip này và chạy hết chuỗi
// filter (blur nền + letterbox) không. Gọi thẳng hàm pipeline dùng thật.
console.log("\n5) Chuẩn hoá về 1080×1920 (đúng hàm normalise của pipeline)");
const norm = join(dir, "beat.mp4");
const t0 = Date.now();
const normOk = normalise(out, norm, { durationSec: 4, startSec: 0, fps: 60, fit: "contain", speed: 1 });
const secs = ((Date.now() - t0) / 1000).toFixed(1);
if (!normOk) {
  bad("normalise thất bại — xem log ffmpeg phía trên");
  process.exit(1);
}
const dims = execSync(
  `ffprobe -v error -select_streams v:0 -show_entries stream=codec_name,width,height,r_frame_rate -of csv=p=0 "${norm}"`,
  { encoding: "utf8" },
).trim();
ok(`4 giây beat trong ${secs}s → ${dims}`);
if (Number(secs) > 12)
  console.log(
    `     ⚠ Chậm: ${secs}s cho 4 giây video. Mỗi scene sẽ tốn ngần này khi render.\n` +
      `       Thủ phạm thường là decode ${codec}. Cân nhắc ưu tiên pexels cho các scene dài.`,
  );
rmSync(dir, { recursive: true, force: true });

console.log("\n\x1b[32mTất cả OK.\x1b[0m Scene có `video: { query }` giờ sẽ lấy được clip từ YouTube.");
console.log("Nhớ: licence CC BY buộc phải giữ dòng credit trên video hoặc trong mô tả khi đăng.\n");
