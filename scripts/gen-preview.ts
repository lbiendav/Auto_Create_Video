/**
 * Generate a SELF-CONTAINED visual preview of the MAI Crypto theme — no TTS,
 * no HyperFrames, no API keys. Reuses the real composer, then swaps the paused
 * HyperFrames timeline for an autoplay+loop so it plays in any browser.
 *
 *   npx tsx scripts/gen-preview.ts
 *   → output/preview/index.html  (open in a browser)
 *
 * Body images use picsum (fast, deterministic) purely to validate layout/motion.
 * The real pipeline fills these from each scene's `image` (URL or AI prompt).
 */
import { readFileSync, mkdirSync, copyFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ScriptSchema } from "../src/render/script-schema.js";
import { composeHtmlMaiCrypto, type SceneImageResolved, type SceneVideoResolved } from "../src/render/maicrypto-composer.js";
import type { BrandConfig } from "../src/config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = process.cwd(); // run from project root
const scriptPath = process.argv[2]
  ? (process.argv[2].startsWith("/") ? process.argv[2] : join(ROOT, process.argv[2]))
  : join(ROOT, "output", "sample-maicrypto", "script.json");
const OUT = join(dirname(scriptPath), "preview");
mkdirSync(OUT, { recursive: true });

const script = ScriptSchema.parse(JSON.parse(readFileSync(scriptPath, "utf8")));

const brand: BrandConfig = {
  name: process.env.BRAND_NAME ?? "MAI CRYPTO",
  handle: process.env.BRAND_HANDLE ?? "@maicrypto.media",
  logoFile: "avatar.png",
  creditPrefix: "Tổng hợp bởi",
};

// Fake, even scene durations just for the preview timeline
const sceneAudio = script.scenes.map((s, i) => ({
  id: s.id,
  durationSec: s.type === "outro" ? 6 : 7 + (i % 2),
}));

// Placeholder images (picsum) so the layout is visible instantly.
// Hook keeps its candlestick backdrop (image:null) so it's clearly seen.
const STYLE = "cinematic editorial news illustration, dramatic lighting, high detail, 9:16 vertical, realistic";
const poll = (prompt: string, seed: string) =>
  `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt + ". " + STYLE)}?width=1080&height=1350&nologo=true&seed=${seed}`;
const pic = (seed: string) => `https://picsum.photos/seed/${seed}/1080/1350`;
const sceneImages: Record<string, SceneImageResolved> = {};
for (const s of script.scenes) {
  const td: any = s.templateData;
  const fit = (s.image?.fit as any) ?? "contain";
  const kb = (s.image?.kenBurns as any) ?? "zoom-in";
  let url: string | null = null;
  if (s.image?.src) url = s.image.src;
  else if (s.image?.prompt) url = poll(s.image.prompt, "mai-" + s.id);
  else if (td.template !== "finance-hook" && td.template !== "brand-outro") url = pic("mai-" + s.id);
  sceneImages[s.id] = { image: url, blur: url, fit, kb };
}

// Collage cells (hook-collage) — same placeholder strategy, one image per cell
const sceneCollageImages: Record<string, SceneImageResolved[]> = {};
for (const s of script.scenes) {
  if (!s.images?.length) continue;
  sceneCollageImages[s.id] = s.images.map((spec, i) => {
    const url = spec.src ?? (spec.prompt ? poll(spec.prompt, `mai-${s.id}-c${i}`) : pic(`mai-${s.id}-c${i}`));
    return {
      image: url,
      blur: url,
      fit: (spec.fit as any) ?? "cover",
      kb: (spec.kenBurns as any) ?? "zoom-in",
    };
  });
}

// Video beats — the preview has no ffmpeg step, so a scene declaring `video`
// falls back to its poster still unless a local file is already present.
const sceneVideos: Record<string, SceneVideoResolved> = {};
for (const s of script.scenes) {
  if (!s.video) continue;
  const local = join(dirname(scriptPath), "videos", `scene-${s.id}.mp4`);
  if (!existsSync(local)) continue;
  sceneVideos[s.id] = {
    video: `videos/scene-${s.id}.mp4`,
    poster: existsSync(join(dirname(scriptPath), "videos", `scene-${s.id}.jpg`))
      ? `videos/scene-${s.id}.jpg`
      : null,
    chip: s.video.chip,
    fit: (s.video.fit as any) ?? "contain",
  };
}

let html = composeHtmlMaiCrypto({
  script,
  sceneAudio,
  gapSec: 0.3,
  audioRelPath: "voice.mp3",
  brand,
  sourceName: script.metadata.source.name ?? script.metadata.source.domain,
  logoRelPath: "logo.png",
  outroHoldSec: 1.2,
  sceneImages,
  sceneCollageImages,
  sceneVideos,
});

// Remove the silent <audio> (no voice.mp3 in preview) and autoplay+loop the timeline.
html = html.replace(/<audio[\s\S]*?<\/audio>/, "");
const autoplay = `
<script>
  window.addEventListener('load', function () {
    var tl = window.__timelines && window.__timelines['news-video'];
    if (!tl) return;
    tl.play(0);
    tl.eventCallback('onComplete', function () { tl.restart(); });
    // expose for precise seeking during screenshot verification
    window.__seek = function (t) { tl.pause(); tl.time(t); };
  });
</script>`;
html = html.replace("</body>", autoplay + "\n</body>");

writeFileSync(join(OUT, "index.html"), html);
copyFileSync(join(ROOT, "src", "render", "templates", "maicrypto", "styles.css"), join(OUT, "styles.css"));

// Copy the sun logo → logo.png
const logoSrc = existsSync(join(ROOT, "assets", "avatar.png"))
  ? join(ROOT, "assets", "avatar.png")
  : join(ROOT, "assets", "avatar.jpg");
copyFileSync(logoSrc, join(OUT, "logo.png"));

// Also emit a fully SELF-CONTAINED single file (inline CSS + data-URI logo, scaled to fit)
const css = readFileSync(join(ROOT, "src", "render", "templates", "maicrypto", "styles.css"), "utf8");
const logoData = "data:image/png;base64," + readFileSync(logoSrc).toString("base64");
const standalone = html
  .replace('<link rel="stylesheet" href="styles.css">',
    "<style>\n" + css + "\n#stage{transform:scale(0.46);transform-origin:top left}\nhtml,body{background:#000}\n</style>")
  .replace(/src="logo\.png"/g, 'src="' + logoData + '"');
writeFileSync(join(OUT, "preview-standalone.html"), standalone);
console.log("Standalone written:", join(OUT, "preview-standalone.html"));

console.log("Preview written:", join(OUT, "index.html"));
console.log("Total scenes:", script.scenes.length);
