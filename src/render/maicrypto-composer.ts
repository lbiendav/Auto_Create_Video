/**
 * MAI CRYPTO composer — image-driven, minimal-chrome video HTML in the
 * @oncoinx2 style. Every beat is a relevant image (blurred fill + Ken Burns)
 * or a finance-hook backdrop; the only persistent chrome is a top-center
 * dynamic source credit + a top-right sun logo / wordmark. No karaoke captions,
 * no ticker, no breaking bar. White-flash transitions between scenes.
 *
 * Produces the same HyperFrames-compatible structure as the broadcast composer
 * (paused GSAP timeline id="news-video", scenes toggled by data-start/duration)
 * so it renders through the identical hyperframes-runner.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Script, TemplateDataType } from "./script-schema.js";
import type { BrandConfig } from "../config.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "templates", "maicrypto");

/** Resolved per-scene image paths (relative to the output dir). */
export interface SceneImageResolved {
  /** foreground image (sharp), relative path, or null → themed/gradient bg */
  image: string | null;
  /** pre-blurred cover fill, relative path, or null */
  blur: string | null;
  fit: "contain" | "cover";
  kb: "zoom-in" | "zoom-out" | "pan-left" | "pan-right";
}

export interface MaiComposeArgs {
  script: Script;
  sceneAudio: { id: string; durationSec: number }[];
  gapSec: number;
  audioRelPath: string;
  brand: BrandConfig;
  /** Friendly source display for the dynamic credit, e.g. "VnExpress". */
  sourceName: string;
  /** Logo image copied into the output dir (e.g. "logo.png"). */
  logoRelPath: string;
  /** Extra seconds the outro visual holds after the voice ends. Default 1.2. */
  outroHoldSec?: number;
  /** Per-scene resolved images (by scene id). Missing → themed bg. */
  sceneImages: Record<string, SceneImageResolved>;
}

export function composeHtmlMaiCrypto(args: MaiComposeArgs): string {
  const { script, sceneAudio, gapSec, audioRelPath, brand, sourceName, logoRelPath } = args;
  const outroHoldSec = args.outroHoldSec ?? 1.2;

  // ── Timing: outro holds a little longer so the end card can be read ──
  let cursor = 0;
  const timing = script.scenes.map((scene) => {
    const audio = sceneAudio.find((a) => a.id === scene.id);
    if (!audio) throw new Error(`No audio entry for scene id=${scene.id}`);
    const isOutro = scene.type === "outro";
    const dur = audio.durationSec + gapSec + (isOutro ? outroHoldSec : 0);
    const start = cursor;
    cursor += dur;
    return { scene, start, duration: dur };
  });
  const totalDuration = cursor;

  const sceneHtml = timing
    .map(({ scene, start, duration }) =>
      renderScene(scene, start, duration, args.sceneImages[scene.id], brand, logoRelPath),
    )
    .join("\n");

  const shellHtml = renderShell(brand, sourceName, logoRelPath);
  const animJs = readFileSync(join(TPL_DIR, "animations.js"), "utf8");
  const tpl = readFileSync(join(TPL_DIR, "base.html.tmpl"), "utf8");

  return tpl
    .replace("{{TITLE}}", escapeHtml(script.metadata.title))
    .replace(/\{\{TOTAL_DURATION\}\}/g, totalDuration.toFixed(2))
    .replace("{{SHELL}}", shellHtml)
    .replace("{{SCENES}}", sceneHtml)
    .replace(/src="voice\.mp3"/g, `src="${audioRelPath}"`)
    .replace('<script src="animations.js"></script>', `<script>\n${animJs}\n</script>`);
}

// ── PERSISTENT SHELL (minimal) ──────────────────────────────────────────────
function renderShell(brand: BrandConfig, sourceName: string, logoRelPath: string): string {
  const credit = `${brand.creditPrefix} ${sourceName}`.trim();
  return `
<!-- Minimal persistent chrome: dark bg, vignette, source credit, brand, watermark, flash -->
<div class="mc-bg"></div>
<div class="mc-grain"></div>
<div class="mc-vignette"></div>

<div class="mc-credit">${escapeHtml(credit)}</div>

<div class="mc-brand">
  <img class="mc-brand-logo" src="${escapeHtml(logoRelPath)}" alt="logo" crossorigin="anonymous" />
  <span class="mc-brand-name">${escapeHtml(brand.name)}</span>
</div>

<div class="mc-watermark">
  <img class="mc-wm-logo" src="${escapeHtml(logoRelPath)}" alt="" crossorigin="anonymous" />
  <span class="mc-wm-name">${escapeHtml(brand.name)}</span>
</div>

<div class="mc-flash"></div>
`.trim();
}

// ── SCENE DISPATCH ──────────────────────────────────────────────────────────
function renderScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
  img: SceneImageResolved | undefined,
  brand: BrandConfig,
  logoRelPath: string,
): string {
  const td = scene.templateData;
  let inner: string;
  let layout: string;
  let extraAttrs = "";

  switch (td.template) {
    case "finance-hook":
      inner = renderFinanceHook(td, img);
      layout = "finance-hook";
      extraAttrs = ` data-theme="${td.theme}" data-trend="${td.trend}"`;
      break;
    case "image":
      inner = renderImageScene(td, img);
      layout = "image";
      break;
    case "document":
      inner = renderDocument(td, img);
      layout = "document";
      break;
    case "brand-outro":
      inner = renderBrandOutro(td, brand, logoRelPath);
      layout = "brand-outro";
      break;
    // Graceful fallbacks so a mixed/legacy script still renders in this theme
    case "hook":
      inner = renderImageScene({ template: "image", headline: td.headline }, img);
      layout = "image";
      break;
    case "callout":
      inner = renderImageScene({ template: "image", headline: td.statement }, img);
      layout = "image";
      break;
    case "stat-hero":
      inner = renderImageScene({ template: "image", headline: td.value + " — " + td.label }, img);
      layout = "image";
      break;
    case "outro":
      inner = renderBrandOutro(
        { template: "brand-outro", cta: td.ctaTop, channelName: td.channelName, source: td.source },
        brand,
        logoRelPath,
      );
      layout = "brand-outro";
      break;
    default:
      inner = renderImageScene({ template: "image" }, img);
      layout = "image";
      break;
  }

  return `
<div class="mc-scene clip" id="scene-${escapeHtml(scene.id)}"
     data-start="${start.toFixed(2)}" data-duration="${duration.toFixed(2)}" data-active="0"
     data-layout="${layout}"${extraAttrs}>
  ${inner}
</div>`.trim();
}

// ── IMAGE SCENE (workhorse body) ────────────────────────────────────────────
function renderImageScene(
  td: { template: "image"; headline?: string; label?: string },
  img: SceneImageResolved | undefined,
): string {
  const parts: string[] = [];

  if (img?.blur) {
    parts.push(`<div class="mc-fill" style="background-image:url('${img.blur}')"></div>`);
  } else {
    parts.push(themedBackdrop());
  }

  if (img?.image) {
    const kb = img.kb ?? "zoom-in";
    const fitClass = img.fit === "cover" ? "mc-photo-cover" : "mc-photo-contain";
    parts.push(
      `<div class="mc-photo ${fitClass} kb-${kb}" data-kb="${kb}" style="background-image:url('${img.image}')"></div>`,
    );
  }

  parts.push(`<div class="mc-scrim"></div>`);

  if (td.headline) {
    const words = splitWords(td.headline);
    parts.push(`<div class="mc-overlay-headline"><div class="mc-oh-inner">${words}</div></div>`);
  }
  if (td.label) {
    parts.push(`<div class="mc-label"><span>${escapeHtml(td.label)}</span></div>`);
  }
  return parts.join("\n  ");
}

// ── DOCUMENT SCENE (evidence) ───────────────────────────────────────────────
function renderDocument(
  td: Extract<TemplateDataType, { template: "document" }>,
  img: SceneImageResolved | undefined,
): string {
  const parts: string[] = [];
  parts.push(img?.blur
    ? `<div class="mc-fill mc-fill-doc" style="background-image:url('${img.blur}')"></div>`
    : themedBackdrop());

  const kb = img?.kb ?? "zoom-in";
  if (img?.image) {
    parts.push(
      `<div class="mc-doc kb-${kb}" data-kb="${kb}" style="background-image:url('${img.image}')"></div>`,
    );
  }
  if (td.label) {
    parts.push(`<div class="mc-doc-chip">${escapeHtml(td.label)}</div>`);
  }
  return parts.join("\n  ");
}

// ── FINANCE HOOK (opening) ──────────────────────────────────────────────────
function renderFinanceHook(
  td: Extract<TemplateDataType, { template: "finance-hook" }>,
  img: SceneImageResolved | undefined,
): string {
  const candles = buildCandles(td.trend);
  const coins = buildCoins(td.theme);

  const subject = img?.image
    ? `<div class="mc-fin-subject" data-kb="zoom-in" style="background-image:url('${img.image}')"></div>`
    : "";

  const tags = td.priceTags
    .map(
      (t, i) =>
        `<div class="mc-tag tone-${t.tone}" data-idx="${i}">` +
        (t.label ? `<span class="mc-tag-label">${escapeHtml(t.label)}</span>` : "") +
        `<span class="mc-tag-value">${escapeHtml(t.value)}</span></div>`,
    )
    .join("\n      ");

  const headlineWords = splitWords(td.headline);

  return `
<div class="mc-fin-bg">
  ${candles}
  <div class="mc-coins">${coins}</div>
  <div class="mc-fin-glow"></div>
</div>
${subject}
<div class="mc-scrim mc-scrim-strong"></div>
<div class="mc-pricetags">
      ${tags}
</div>
<div class="mc-hook">
  <div class="mc-badge">${escapeHtml(td.badge)}</div>
  <div class="mc-headline"><div class="mc-hl-inner">${headlineWords}</div></div>
</div>`.trim();
}

// ── BRAND OUTRO (end card) ──────────────────────────────────────────────────
function renderBrandOutro(
  td: { template: "brand-outro"; cta?: string; channelName: string; handle?: string; source?: string },
  brand: BrandConfig,
  logoRelPath: string,
): string {
  const handle = td.handle ?? brand.handle;
  const cta = td.cta ?? "Theo dõi để cập nhật tin nóng mỗi ngày";
  const source = td.source ? `<div class="mc-out-source">Nguồn: ${escapeHtml(td.source)}</div>` : "";
  return `
<div class="mc-out-bg"></div>
<div class="mc-out-rays"></div>
<div class="mc-out-card">
  <img class="mc-out-logo" src="${escapeHtml(logoRelPath)}" alt="logo" crossorigin="anonymous" />
  <div class="mc-out-name">${escapeHtml(td.channelName || brand.name)}</div>
  <div class="mc-out-handle">${escapeHtml(handle)}</div>
  <div class="mc-out-underline"></div>
  <div class="mc-out-cta">${escapeHtml(cta)}</div>
  ${source}
</div>`.trim();
}

// ── CANDLESTICK BACKDROP (deterministic SVG) ────────────────────────────────
function buildCandles(trend: "up" | "down" | "mixed"): string {
  const W = 1080;
  const H = 1920;
  const n = 26;
  const step = W / (n - 2);
  // deterministic pseudo-random walk so renders are stable frame-to-frame
  let seed = trend === "up" ? 7 : trend === "down" ? 3 : 11;
  const rnd = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return (seed >>> 8) / 0x7fffff;
  };
  const drift = trend === "up" ? -1 : trend === "down" ? 1 : 0;
  let price = H * 0.66;
  const bodies: string[] = [];
  for (let i = 0; i < n; i++) {
    const open = price;
    const move = (rnd() - 0.5) * 150 + drift * 30;
    price = Math.max(H * 0.46, Math.min(H * 0.92, price + move));
    const close = price;
    const up = close <= open; // lower y = higher price → green when close above open
    const hi = Math.min(open, close) - rnd() * 60;
    const lo = Math.max(open, close) + rnd() * 60;
    const x = -step + i * step;
    const bodyY = Math.min(open, close);
    const bodyH = Math.max(6, Math.abs(close - open));
    const cls = up ? "mc-candle-up" : "mc-candle-down";
    bodies.push(
      `<line class="mc-wick ${cls}" x1="${x.toFixed(0)}" y1="${hi.toFixed(0)}" x2="${x.toFixed(0)}" y2="${lo.toFixed(0)}"/>` +
        `<rect class="mc-body ${cls}" x="${(x - 12).toFixed(0)}" y="${bodyY.toFixed(0)}" width="24" height="${bodyH.toFixed(0)}"/>`,
    );
  }
  return `<svg class="mc-candles" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid slice">${bodies.join("")}</svg>`;
}

// ── FLOATING COIN GLYPHS ────────────────────────────────────────────────────
function buildCoins(_theme: "finance" = "finance"): string {
  // Unified finance/economy/crypto/stocks glyph set.
  const glyphs = ["$", "%", "▲", "€", "▼", "₫", "₿", "¥"];
  // fixed positions (percent of frame) for a stable, balanced scatter
  const spots = [
    [14, 30, 120], [80, 24, 90], [26, 66, 150], [72, 58, 110],
    [46, 40, 80], [88, 74, 96], [10, 82, 84], [58, 78, 132],
  ];
  return spots
    .map(([x, y, s], i) => {
      const g = glyphs[i % glyphs.length];
      return `<span class="mc-coin" data-idx="${i}" style="left:${x}%;top:${y}%;font-size:${s}px">${g}</span>`;
    })
    .join("");
}

// Branded fallback backdrop for scenes whose image failed to load — never show
// a near-black empty frame. Reuses the finance candlestick/coin backdrop.
function themedBackdrop(): string {
  return `<div class="mc-fallback-bg" data-theme="finance" style="position:absolute;inset:0;z-index:1">
  <div class="mc-fin-bg">
    ${buildCandles("mixed")}
    <div class="mc-coins">${buildCoins("finance")}</div>
    <div class="mc-fin-glow"></div>
  </div>
</div>`;
}

// ── HELPERS ─────────────────────────────────────────────────────────────────
function splitWords(text: string): string {
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => `<span class="mc-w">${escapeHtml(w)}</span>`)
    .join(" ");
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
