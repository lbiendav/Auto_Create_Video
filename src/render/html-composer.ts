import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Script, TemplateDataType } from "./script-schema.js";
import type { TiktokConfig } from "../config.js";
import type { CaptionChunk } from "./captions.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TPL_DIR = join(__dirname, "templates");

// Default TikTok config (used if not passed)
const DEFAULT_TIKTOK: TiktokConfig = {
  displayName: "Công nghệ 24h",
  handle: "@congnghe24h",
  followers: "1.2M followers",
};

export interface SceneAudio {
  id: string;
  durationSec: number;
}

export interface ComposeArgs {
  script: Script;
  sceneAudio: SceneAudio[];
  gapSec: number;
  bgImageRelPath: string | null;   // null => no image available
  audioRelPath: string;
  /** TikTok follow card config (injected into outro scene). Optional — defaults used if omitted. */
  tiktok?: TiktokConfig;
  /** Relative path to avatar image inside the output dir (e.g. "tiktok-avatar.jpg"). */
  tiktokAvatarRelPath?: string;
  /** Extra seconds added to outro scene visual duration after voice ends (TikTok card hold). Default 3. */
  outroHoldSec?: number;
  /** Pre-blurred ambient background (e.g. "images/bg-blur.jpg"). null/omitted → gradient blobs. */
  ambientImageRelPath?: string | null;
  /** Karaoke caption chunks per scene id. Omitted/empty → captions not rendered. */
  captionsByScene?: Record<string, CaptionChunk[]>;
}

export function composeHtml(args: ComposeArgs): string {
  const { script, sceneAudio, gapSec, bgImageRelPath, audioRelPath } = args;
  const tiktok = args.tiktok ?? DEFAULT_TIKTOK;
  const tiktokAvatar = args.tiktokAvatarRelPath ?? "tiktok-avatar.jpg";
  const outroHoldSec = args.outroHoldSec ?? 3;
  const captionsEnabled = script.captions?.enabled ?? true;
  const captionsByScene = captionsEnabled ? (args.captionsByScene ?? {}) : {};

  // Compute timing per scene. Outro scene gets extra HOLD seconds so the
  // TikTok follow card stays visible after the voice ends.
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

  // Render scenes
  const sceneHtml = timing.map(({ scene, start, duration }) => {
    const caps = captionsByScene[scene.id] ?? [];
    return renderScene(scene, start, duration, bgImageRelPath, tiktok, tiktokAvatar, caps);
  }).join("\n");

  // Persistent shell — broadcast frame (ambient bg, breaking bar, ticker, progress)
  const shellHtml = renderShell(script, tiktok, args.ambientImageRelPath ?? null);

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

// ── PERSISTENT SHELL ───────────────────────────────────────────────────────
function renderShell(script: Script, tiktok: TiktokConfig, ambientRelPath: string | null): string {
  const metadata = script.metadata;
  const channel = escapeHtml(metadata.channel);
  const domain = escapeHtml(metadata.source.domain);
  const handle = escapeHtml(tiktok.handle);

  // Ambient layer: pre-blurred article image, else drifting neon blobs
  const ambientHtml = ambientRelPath
    ? `<div class="shell-ambient" style="background-image: url('${ambientRelPath}')"></div>`
    : `<div class="shell-blob blob-a"></div>\n<div class="shell-blob blob-b"></div>`;

  // Broadcast date stamp (dd/MM) — build-time is fine for a news short
  const now = new Date();
  const dateStamp = `${String(now.getDate()).padStart(2, "0")}/${String(now.getMonth() + 1).padStart(2, "0")}`;

  // News ticker: authored items or derived from metadata
  const tickerItems = (script.ticker && script.ticker.length > 0)
    ? script.ticker
    : [
        metadata.title,
        `NGUỒN: ${metadata.source.domain}`,
        `THEO DÕI ${metadata.channel}`,
        "CẬP NHẬT TIN NÓNG 24/7",
      ];
  const tickerGroup = tickerItems
    .map((t) => `<span class="ticker-item">${escapeHtml(t)}</span><span class="ticker-sep">◆</span>`)
    .join("");

  return `
<!-- Shell: persistent broadcast frame (no data-start → always visible) -->
<div class="shell-bg"></div>
${ambientHtml}
<div class="shell-grid"></div>

<div class="brand-shell-header">
<div class="brand-icon">
  <i class="fa-solid fa-bolt fa-xl"></i>
</div>  <div class="brand-text">
    <div class="brand-name">${channel}</div>
    <div class="brand-tag">Tóm tắt chuyển động Crypto 24/7</div>
  </div>
</div>

<div class="shell-breaking">
  <span class="live-dot"></span>
  <span class="breaking-text">TRỰC TIẾP</span>
  <span class="breaking-date">${dateStamp}</span>
</div>

<div class="brand-shell-handle">
  <span class="handle-music">&#9835;</span>
  <span class="handle-text">${handle}</span>
</div>

<div class="shell-vignette"></div>

<div class="shell-progress"><div class="progress-fill"></div></div>

<div class="shell-ticker">
  <div class="ticker-label"><i class="fa-solid fa-bolt"></i>&nbsp;TIN NÓNG</div>
  <div class="ticker-viewport">
    <div class="ticker-track">
      <span class="ticker-group">${tickerGroup}</span>
      <span class="ticker-group">${tickerGroup}</span>
    </div>
  </div>
  <div class="ticker-domain">${domain}</div>
</div>

<div class="fx-flash"></div>
`.trim();
}

// ── SCENE DISPATCH ─────────────────────────────────────────────────────────
function renderScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
  bgImageRelPath: string | null,
  tiktok: TiktokConfig,
  tiktokAvatarRelPath: string,
  captionChunks: CaptionChunk[],
): string {
  const td = scene.templateData;

  let inner: string;
  let layoutName: string;

  switch (td.template) {
    case "hook":
      inner = renderHookInner(td, bgImageRelPath);
      layoutName = "hook";
      break;
    case "comparison":
      inner = renderComparisonInner(td);
      layoutName = "comparison";
      break;
    case "stat-hero":
      inner = renderStatHeroInner(td);
      layoutName = "stat-hero";
      break;
    case "feature-list":
      inner = renderFeatureListInner(td);
      layoutName = "feature-list";
      break;
    case "callout":
      inner = renderCalloutInner(td);
      layoutName = "callout";
      break;
    case "chart":
      inner = renderChartInner(td);
      layoutName = "chart";
      break;
    case "outro":
      inner = renderOutroInner(td, tiktok, tiktokAvatarRelPath);
      layoutName = "outro";
      break;
    default: {
      const _never: never = td;
      throw new Error(`Unknown template: ${(_never as any).template}`);
    }
  }

  // Karaoke captions ride inside the scene (outro keeps the zone clean for the follow card)
  const capsHtml = scene.type === "outro" ? "" : renderCaptions(captionChunks);

  return buildScene(scene, start, duration, layoutName, `${inner}\n  ${capsHtml}`);
}

// ── KARAOKE CAPTIONS ───────────────────────────────────────────────────────
function renderCaptions(chunks: CaptionChunk[]): string {
  if (chunks.length === 0) return "";
  const chunkHtml = chunks.map((c) => {
    const words = c.words.map((w) => {
      const emph = w.emphasis ? ` data-emph="${w.emphasis}"` : "";
      return `<span class="cap-word"${emph} data-ws="${w.startSec.toFixed(3)}" data-we="${w.endSec.toFixed(3)}">${escapeHtml(w.text)}</span>`;
    }).join(" ");
    return `<div class="cap-chunk" data-cs="${c.startSec.toFixed(3)}" data-ce="${c.endSec.toFixed(3)}">${words}</div>`;
  }).join("\n    ");
  return `<div class="caps">\n    ${chunkHtml}\n  </div>`;
}

// ── HOOK SCENE ─────────────────────────────────────────────────────────────
function renderHookInner(td: Extract<TemplateDataType, { template: "hook" }>, bgImageRelPath: string | null): string {
  // Background
  let bgHtml: string;
  if (td.bgSrc && bgImageRelPath) {
    // Ken Burns image — effect driven by GSAP (data-kb), deterministic under frame scrubbing
    const kbClass = td.kenBurns ?? "zoom-in";
    bgHtml = `<div class="bg kb-${kbClass}" data-kb="${kbClass}" style="background-image: url('${bgImageRelPath}')"></div>`;
  } else {
    bgHtml = `<div class="bg gradient-news-dark"></div>`;
  }
  const overlayHtml = `<div class="overlay" style="opacity: 0.55"></div>`;

  // Headline split into words for staggered slam-in
  const headlineWords = td.headline.split(/\s+/).filter(Boolean)
    .map((w) => `<span class="hw">${escapeHtml(w)}</span>`)
    .join(" ");
  const subhead = td.subhead ? escapeHtml(td.subhead) : "";
  const badge = escapeHtml(td.badge ?? "TIN NÓNG");

  return `${bgHtml}
  ${overlayHtml}
  <div class="layout-hook punch-target">
    <div class="hook-badge">${badge}</div>
    <div class="hook-headline shimmer-sweep-target">${headlineWords}</div>
    ${subhead ? `<div class="hook-subhead">${subhead}</div>` : ""}
  </div>`;
}

// ── COMPARISON SCENE ───────────────────────────────────────────────────────
function renderComparisonInner(td: Extract<TemplateDataType, { template: "comparison" }>): string {
  const lColor = td.left.color;  // "cyan" | "purple"
  const rColor = td.right.color;
  const winnerClass = td.right.winner ? " card-winner" : "";

  return `
<div class="layout-comparison punch-target">
  <div class="cmp-card cmp-left color-${lColor}">
    <div class="cmp-label">${escapeHtml(td.left.label)}</div>
    <div class="cmp-value">${escapeHtml(td.left.value)}</div>
  </div>
  <div class="cmp-vs">VS</div>
  <div class="cmp-card cmp-right color-${rColor}${winnerClass}">
    <div class="cmp-label">${escapeHtml(td.right.label)}</div>
    <div class="cmp-value">${escapeHtml(td.right.value)}</div>
    ${td.right.winner ? '<div class="cmp-winner-badge">WINNER</div>' : ""}
  </div>
</div>`.trim();
}

// ── STAT HERO SCENE ────────────────────────────────────────────────────────

/**
 * Parse a display value like "52%", "126,080$", "-1.2M" into count-up parts.
 * Returns null when there is no leading number to animate.
 */
export function parseCountup(value: string): {
  target: number; decimals: number; group: string; prefix: string; suffix: string;
} | null {
  const m = /^([^\d\-]*)(-?[\d][\d.,]*)(.*)$/.exec(value.trim());
  if (!m) return null;
  const [, prefix, numRaw, suffix] = m;

  // Decide decimal vs thousands separator: a final . or , followed by 1-2 digits
  // is a decimal ("5.5", "82,7"); groups of 3 are thousands ("126,080").
  let intPart = numRaw;
  let decPart = "";
  const lastSep = Math.max(numRaw.lastIndexOf("."), numRaw.lastIndexOf(","));
  if (lastSep > -1) {
    const after = numRaw.slice(lastSep + 1);
    if (after.length > 0 && after.length <= 2) {
      decPart = after;
      intPart = numRaw.slice(0, lastSep);
    }
  }
  const group = /[.,]/.test(intPart) ? intPart.replace(/[\d-]/g, "").charAt(0) : "";
  const digits = intPart.replace(/[^\d-]/g, "");
  if (digits.replace("-", "").length === 0) return null;
  const target = parseFloat(digits + (decPart ? `.${decPart}` : ""));
  if (Number.isNaN(target)) return null;
  return { target, decimals: decPart.length, group, prefix, suffix };
}

function renderStatHeroInner(td: Extract<TemplateDataType, { template: "stat-hero" }>): string {
  const context = td.context ? `<div class="stat-context">${escapeHtml(td.context)}</div>` : "";
  const cu = parseCountup(td.value);
  const cuAttrs = cu
    ? ` data-cu="1" data-cu-target="${cu.target}" data-cu-dec="${cu.decimals}" data-cu-group="${escapeHtml(cu.group)}" data-cu-prefix="${escapeHtml(cu.prefix)}" data-cu-suffix="${escapeHtml(cu.suffix)}"`
    : "";
  return `
<div class="layout-stat-hero punch-target">
  <div class="stat-value shimmer-sweep-target"${cuAttrs}>${escapeHtml(td.value)}</div>
  <div class="stat-label">${escapeHtml(td.label)}</div>
  ${context}
</div>`.trim();
}

// ── FEATURE LIST SCENE ─────────────────────────────────────────────────────
function renderFeatureListInner(td: Extract<TemplateDataType, { template: "feature-list" }>): string {
  const bullets = td.bullets.map((b, i) =>
    `<div class="feat-bullet feat-bullet-${i}" data-idx="${i}">
      <div class="feat-dot"></div>
      <div class="feat-text">${escapeHtml(b)}</div>
    </div>`
  ).join("\n    ");

  return `
<div class="layout-feature-list punch-target">
  <div class="feat-card">
    <div class="feat-title">${escapeHtml(td.title)}</div>
    <div class="feat-rule"></div>
    <div class="feat-bullets">
      ${bullets}
    </div>
  </div>
</div>`.trim();
}

// ── CALLOUT SCENE ──────────────────────────────────────────────────────────
function renderCalloutInner(td: Extract<TemplateDataType, { template: "callout" }>): string {
  const tag = td.tag ? `<div class="callout-tag">${escapeHtml(td.tag)}</div>` : "";
  return `
<div class="layout-callout punch-target">
  <div class="callout-card">
    ${tag}
    <div class="callout-statement">${escapeHtml(td.statement)}</div>
  </div>
</div>`.trim();
}

// ── CHART SCENE (crypto price action) ──────────────────────────────────────
const CHART_W = 900;
const CHART_H = 520;
const CHART_PAD = 40;

function renderChartInner(td: Extract<TemplateDataType, { template: "chart" }>): string {
  const pts = td.points;
  const min = Math.min(...pts);
  const max = Math.max(...pts);
  const span = max - min || 1;
  const innerW = CHART_W - CHART_PAD * 2;
  const innerH = CHART_H - CHART_PAD * 2;

  const coords = pts.map((v, i) => {
    const x = CHART_PAD + (i / (pts.length - 1)) * innerW;
    const y = CHART_PAD + (1 - (v - min) / span) * innerH;
    return { x: +x.toFixed(1), y: +y.toFixed(1) };
  });

  const lineD = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x} ${c.y}`).join(" ");
  const areaD = `${lineD} L${coords[coords.length - 1].x} ${CHART_H - CHART_PAD} L${coords[0].x} ${CHART_H - CHART_PAD} Z`;
  const last = coords[coords.length - 1];

  const gridLines = [0.25, 0.5, 0.75].map((f) => {
    const y = CHART_PAD + f * innerH;
    return `<line class="chart-grid" x1="${CHART_PAD}" y1="${y}" x2="${CHART_W - CHART_PAD}" y2="${y}" />`;
  }).join("\n      ");

  const changeBadge = td.changeText
    ? `<div class="chart-badge" style="left: ${((last.x / CHART_W) * 100).toFixed(1)}%; top: ${((last.y / CHART_H) * 100).toFixed(1)}%;">${escapeHtml(td.changeText)}</div>`
    : "";
  const label = td.label ? `<div class="chart-label">${escapeHtml(td.label)}</div>` : "";

  return `
<div class="layout-chart punch-target" data-trend="${td.trend}">
  <div class="chart-card">
    <div class="chart-title">${escapeHtml(td.title)}</div>
    <div class="chart-svg-wrap">
      <svg class="chart-svg" viewBox="0 0 ${CHART_W} ${CHART_H}" preserveAspectRatio="none">
        ${gridLines}
        <path class="chart-area" d="${areaD}" />
        <path class="chart-line" d="${lineD}" />
        <circle class="chart-dot" cx="${last.x}" cy="${last.y}" r="12" />
      </svg>
      ${changeBadge}
    </div>
    ${label}
  </div>
</div>`.trim();
}

// ── OUTRO SCENE ────────────────────────────────────────────────────────────
function renderOutroInner(
  td: Extract<TemplateDataType, { template: "outro" }>,
  tiktok: TiktokConfig,
  avatarRelPath: string,
): string {
  const ttCard = renderTiktokCard(tiktok, avatarRelPath);
  return `
<div class="layout-outro punch-target">
  <div class="out-cta-top">${escapeHtml(td.ctaTop)}</div>
  <div class="out-channel">${escapeHtml(td.channelName)}</div>
  <div class="out-underline"></div>
  <div class="out-source">Nguồn: ${escapeHtml(td.source)}</div>
</div>
${ttCard}`.trim();
}

/**
 * TikTok follow card — adapted from HyperFrames `tiktok-follow` block.
 * Slides up from bottom mid-outro. Animations are added by animations.js
 * targeting elements with id="tt-card", id="tt-follow-btn", etc.
 */
function renderTiktokCard(tiktok: TiktokConfig, avatarRelPath: string): string {
  return `
<div id="tt-card" class="tt-card">
  <img class="tt-avatar" src="${escapeHtml(avatarRelPath)}" alt="${escapeHtml(tiktok.displayName)}" crossorigin="anonymous" />
  <div class="tt-profile-info">
    <div class="tt-display-name">${escapeHtml(tiktok.displayName)}</div>
    <div class="tt-handle">${escapeHtml(tiktok.handle)}</div>
    <div class="tt-followers">${escapeHtml(tiktok.followers)}</div>
  </div>
  <div id="tt-follow-btn" class="tt-follow-btn">
    <span id="tt-btn-follow" class="tt-btn-text">Follow</span>
    <span id="tt-btn-following" class="tt-btn-text tt-btn-text-following">
      <span>Following</span>
      <span class="tt-check-icon"><svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>
    </span>
  </div>
</div>`.trim();
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function buildScene(
  scene: Script["scenes"][number],
  start: number,
  duration: number,
  layoutName: string,
  innerHtml: string,
): string {
  return `
<div class="scene clip" id="scene-${scene.id}"
     data-start="${start.toFixed(2)}" data-duration="${duration.toFixed(2)}" data-active="0"
     data-layout="${layoutName}">
  ${innerHtml}
</div>`.trim();
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
