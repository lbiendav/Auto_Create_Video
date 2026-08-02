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

/** A normalised, ffmpeg-baked clip for one scene (see assets/scene-videos.ts). */
export interface SceneVideoResolved {
  /** relative path to the 1080x1920 mp4 (exact scene length, muted) */
  video: string;
  /** relative path to the poster/first frame, used as the paint fallback */
  poster: string | null;
  /** small red marker text drawn over the beat */
  chip?: string;
  fit: "cover" | "contain";
  credit?: string;
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
  /** Extra cell images for multi-cell templates (hook-collage), by scene id. */
  sceneCollageImages?: Record<string, SceneImageResolved[]>;
  /** Per-scene normalised video clips (by scene id). Missing → still image. */
  sceneVideos?: Record<string, SceneVideoResolved>;
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
      renderScene(scene, start, duration, args.sceneImages[scene.id], brand, logoRelPath, {
        cells: args.sceneCollageImages?.[scene.id] ?? [],
        video: args.sceneVideos?.[scene.id],
      }),
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
  <img class="mc-logo-badge mc-brand-logo" src="${escapeHtml(logoRelPath)}" alt="logo" crossorigin="anonymous" />
  <span class="mc-brand-name">${escapeHtml(brand.name)}</span>
</div>

<div class="mc-watermark">
  <img class="mc-logo-badge mc-wm-logo" src="${escapeHtml(logoRelPath)}" alt="" crossorigin="anonymous" />
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
  extra: { cells: SceneImageResolved[]; video?: SceneVideoResolved } = { cells: [] },
): string {
  const td = scene.templateData;
  const vid = extra.video
    ? renderVideoLayer(scene.id, extra.video, start, duration)
    : "";
  let inner: string;
  let layout: string;
  let extraAttrs = "";

  switch (td.template) {
    case "hook-split":
      inner = renderHookSplit(td, img, brand, logoRelPath, vid, extra.cells[0]);
      layout = "hook-split";
      extraAttrs = ` data-tone="${td.panelTone}"`;
      break;
    case "hook-collage":
      inner = renderHookCollage(td, extra.cells.length ? extra.cells : img ? [img] : [], vid);
      layout = "hook-collage";
      extraAttrs = ` data-cells="${Math.max(1, extra.cells.length || (img ? 1 : 0))}"`;
      break;
    case "finance-hook":
      inner = renderFinanceHook(td, img);
      layout = "finance-hook";
      extraAttrs = ` data-theme="${td.theme}" data-trend="${td.trend}"`;
      break;
    case "image":
      inner = renderImageScene(td, img, vid, extra.video);
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
      inner = renderImageScene({ template: "image", headline: td.headline }, img, vid, extra.video);
      layout = "image";
      break;
    case "callout":
      inner = renderImageScene({ template: "image", headline: td.statement }, img, vid, extra.video);
      layout = "image";
      break;
    case "stat-hero":
      inner = renderImageScene({ template: "image", headline: td.value + " — " + td.label }, img, vid, extra.video);
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
      inner = renderImageScene({ template: "image" }, img, vid, extra.video);
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
  videoHtml = "",
  video?: SceneVideoResolved,
): string {
  const parts: string[] = [];

  if (video) {
    // The clip is already composited 1080x1920 (blurred fill baked in by ffmpeg).
    if (video.poster) {
      parts.push(`<div class="mc-fill" style="background-image:url('${video.poster}')"></div>`);
    }
    parts.push(videoHtml);
    if (video.chip) parts.push(`<div class="mc-vid-chip">${escapeHtml(video.chip)}</div>`);
    // Ghi nguồn clip. Với footage CC BY đây là NGHĨA VỤ của giấy phép, không
    // phải trang trí: bỏ dòng này đi là dùng chùa. Đặt sát đáy, dưới caption.
    if (video.credit) parts.push(`<div class="mc-vid-credit">${escapeHtml(video.credit)}</div>`);
    parts.push(`<div class="mc-scrim"></div>`);
    const capV = td.headline ?? td.label;
    if (capV) parts.push(renderCaption(capV));
    return parts.join("\n  ");
  }

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

  // MỘT caption duy nhất cho mỗi beat: headline được ưu tiên, không thì label.
  const cap = td.headline ?? td.label;
  if (cap) parts.push(renderCaption(cap));
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
  parts.push(`<div class="mc-doc-frame"></div>`);
  if (td.label) parts.push(renderCaption(td.label));
  return parts.join("\n  ");
}

// ── VIDEO LAYER ─────────────────────────────────────────────────────────────
/**
 * HyperFrames clip contract for video: `class="clip"` + data-start/duration on
 * the element itself, `muted playsinline` (audio always lives in the separate
 * <audio> track). The mp4 is already 1080x1920 and exactly the beat length, so
 * it plays from 0 with no trimming in the browser.
 */
function renderVideoLayer(
  sceneId: string,
  v: SceneVideoResolved,
  start: number,
  duration: number,
): string {
  const poster = v.poster ? ` poster="${escapeHtml(v.poster)}"` : "";
  return (
    `<video class="mc-video clip" id="vid-${escapeHtml(sceneId)}" ` +
    `data-start="${start.toFixed(2)}" data-duration="${duration.toFixed(2)}" ` +
    `data-media-start="0" data-track-index="1" ` +
    `src="${escapeHtml(v.video)}"${poster} muted playsinline preload="auto"></video>`
  );
}

// ── HOOK SPLIT (opening: nua tren anh / nua duoi khoi thuong hieu) ──────────
/**
 * Khung mo dau chia doi:
 *   - nua tren : anh chu de (nen mo phia sau + Ken Burns), co the la video clip
 *   - dai hoa  : gradient mem tu anh xuong khoi mau (khong co duong cat cung)
 *   - nua duoi : khoi mau thuong hieu -> logo + ten kenh, roi CAU TOM TAT in hoa
 */
function renderHookSplit(
  td: Extract<TemplateDataType, { template: "hook-split" }>,
  img: SceneImageResolved | undefined,
  brand: BrandConfig,
  logoRelPath: string,
  videoHtml = "",
  subject?: SceneImageResolved,
): string {
  // Màn phủ bắt đầu CAO HƠN ĐƯỜNG CHIA 28% và biên trên được mask về 0,
  // nên quầng sáng bên trong không bao giờ bị cắt thành vệt ngang.
  const veilTop = Math.max(0, td.splitAt * 100 - 28);
  const veilHeight = (100 - veilTop).toFixed(2);
  const panelHeight = (100 - td.splitAt * 100 + 4).toFixed(2);
  const parts: string[] = [];

  // — ẢNH PHỦ TOÀN KHUNG (nền mờ của chính nó lấp phần thừa) —
  const coverClass = img?.fit === "cover" ? " mc-split-photo-cover" : "";
  parts.push(
    `<div class="mc-split-top">` +
      (img?.blur
        ? `<div class="mc-fill" style="background-image:url('${img.blur}')"></div>`
        : `<div class="mc-fill mc-fill-gradient"></div>`) +
      (videoHtml ||
        (img?.image
          ? `<div class="mc-split-photo${coverClass}" data-kb="${img.kb}" style="background-image:url('${img.image}')"></div>`
          : "")) +
      `<div class="mc-split-topscrim"></div>` +
      `</div>`,
  );

  // — chủ thể tách nền (tuỳ chọn, đẹp nhất khi là PNG trong suốt) —
  if (subject?.image) {
    parts.push(
      `<div class="mc-split-subject" data-kb="zoom-in" ` +
        `style="top:${(td.splitAt * 100 - 30).toFixed(2)}%;height:46%;background-image:url('${subject.image}')"></div>`,
    );
  }

  // — thẻ giá nổi trên ảnh —
  if (td.priceTags.length) {
    parts.push(
      `<div class="mc-pricetags mc-pricetags-split">` +
        td.priceTags
          .map(
            (t, i) =>
              `<div class="mc-tag tone-${t.tone}" data-idx="${i}">` +
              (t.label ? `<span class="mc-tag-label">${escapeHtml(t.label)}</span>` : "") +
              `<span class="mc-tag-value">${escapeHtml(t.value)}</span></div>`,
          )
          .join("") +
        `</div>`,
    );
  }

  // — MÀN PHỦ MÀU trong suốt (ảnh vẫn nhìn xuyên qua) —
  parts.push(`<div class="mc-split-veil" style="height:${veilHeight}%"></div>`);

  // — chữ nằm trên màn phủ, không có nền riêng —
  const wordmark = td.showWordmark
    ? `<div class="mc-split-wordmark">
    <img class="mc-logo-badge mc-split-logo" src="${escapeHtml(logoRelPath)}" alt="" crossorigin="anonymous" />
    <span class="mc-split-name">${escapeHtml(brand.name)}</span>
  </div>`
    : "";

  const meta =
    td.badge || td.kicker
      ? `<div class="mc-hook-meta">` +
        (td.badge ? `<div class="mc-badge">${escapeHtml(td.badge)}</div>` : "") +
        (td.kicker ? `<div class="mc-kicker">${escapeHtml(td.kicker)}</div>` : "") +
        `</div>`
      : "";

  parts.push(
    `<div class="mc-split-panel" style="height:${panelHeight}%">
  ${splitDeco()}
  ${wordmark}
  ${meta}
  <div class="mc-split-summary" data-size="${summarySize(td.summary)}">${splitWords(td.summary, td.highlight)}</div>
</div>`,
  );

  return parts.join("\n  ");
}

/**
 * CAPTION — mọi chữ ở beat thân bài đi qua đúng hàm này: cùng vị trí, cùng cỡ,
 * cùng canh giữa, viền màu bao quanh chữ. Không còn nền pill đen mờ.
 */
function renderCaption(
  text: string,
  tone: "brand" | "up" | "down" | "cool" | "ink" = "brand",
  highlight: string[] = [],
): string {
  // brand = vàng (mặc định); các tông khác đổi màu viền
  const toneClass =
    tone === "up" ? " mc-caption-up"
    : tone === "down" ? " mc-caption-down"
    : tone === "cool" ? " mc-caption-cool"
    : tone === "ink" ? " mc-caption-ink"
    : "";
  return (
    `<div class="mc-caption${toneClass}" data-size="${captionSize(text)}">` +
    `${splitWords(text, highlight)}</div>`
  );
}

/** Cỡ chữ caption theo độ dài — luôn nằm gọn trong 968px, tối đa 3 dòng. */
function captionSize(text: string): "xl" | "l" | "m" | "s" {
  const n = text.trim().length;
  if (n <= 30) return "xl";
  if (n <= 48) return "l";
  if (n <= 72) return "m";
  return "s";
}

/** Trang trí đáy khối: đồng xu mờ + sóng line-art (đặc trưng của kiểu này). */
function splitDeco(): string {
  const coins = [
    [16, 40, 120, "\u20BF"],
    [43, 26, 92, "\u039E"],
    [67, 52, 108, "\u20BF"],
    [88, 30, 78, "\u0141"],
    [30, 74, 86, "\u20BF"],
  ] as const;
  const glyphs = coins
    .map(
      ([x, y, d, g], i) =>
        `<span class="mc-split-coin" data-idx="${i}" ` +
        `style="left:${x}%;top:${y}%;width:${d}px;height:${d}px;font-size:${Math.round(Number(d) * 0.42)}px">${g}</span>`,
    )
    .join("");
  const wave =
    `<svg class="mc-split-wave" viewBox="0 0 1080 420" preserveAspectRatio="none">` +
    `<path d="M0,300 C180,236 300,352 480,300 C660,248 780,340 1080,268" fill="none" stroke="currentColor" stroke-width="3" opacity="0.42"/>` +
    `<path d="M0,344 C200,290 320,392 520,344 C720,296 860,376 1080,318" fill="none" stroke="currentColor" stroke-width="2" opacity="0.28"/>` +
    `<path d="M0,254 C160,206 340,300 520,252 C700,204 900,282 1080,232" fill="none" stroke="currentColor" stroke-width="2" opacity="0.18"/>` +
    `</svg>`;
  return `<div class="mc-split-deco">${wave}${glyphs}</div>`;
}

/** Cỡ chữ cho câu tóm tắt nửa dưới — dài thì tự bước xuống, không bao giờ tràn. */
function summarySize(text: string): "xl" | "l" | "m" | "s" {
  const n = text.trim().length;
  if (n <= 70) return "xl";
  if (n <= 105) return "l";
  if (n <= 150) return "m";
  return "s";
}

// ── HOOK COLLAGE (opening "chia phan" card) ─────────────────────────────────
/**
 * Top ~62% of the frame is split into 2-3 media cells by gold seams; the bottom
 * ~38% is the brand panel (badge + kicker + slam-in headline + price tags).
 * Cell media comes from `cells` (scene.images) and falls back to a themed
 * gradient so a failed download never leaves an empty box.
 */
function renderHookCollage(
  td: Extract<TemplateDataType, { template: "hook-collage" }>,
  cells: SceneImageResolved[],
  videoHtml = "",
): string {
  const n = Math.min(3, Math.max(1, cells.length));
  const layout =
    td.layout !== "auto" ? td.layout : n >= 3 ? "trio-stack" : n === 2 ? "duo-diagonal" : "duo-stack";

  // Ken Burns directions alternate so the cells never drift in lockstep.
  const KB = ["zoom-in", "pan-right", "zoom-out"] as const;

  const cellHtml = Array.from({ length: Math.max(2, n) }, (_, i) => {
    const c = cells[i];
    const kb = c?.kb ?? KB[i % KB.length];
    const bg = c?.image
      ? ` style="background-image:url('${c.image}')"`
      : c?.blur
        ? ` style="background-image:url('${c.blur}')"`
        : "";
    const empty = c?.image || c?.blur ? "" : " mc-cell-empty";
    const label = td.cellLabels[i]
      ? `<div class="mc-cell-tag">${escapeHtml(td.cellLabels[i])}</div>`
      : "";
    return (
      `<div class="mc-cell mc-cell-${i + 1}${empty}" data-idx="${i}" data-kb="${kb}"${bg}>` +
      `${label}</div>`
    );
  }).join("\n    ");

  const seams =
    layout === "duo-diagonal" || layout === "trio-column"
      ? `<div class="mc-seam mc-seam-v"></div>`
      : layout === "duo-stack"
        ? `<div class="mc-seam mc-seam-h"></div>`
        : `<div class="mc-seam mc-seam-h"></div><div class="mc-seam mc-seam-v" style="top:57%;bottom:-8%"></div>`;

  const kicker = td.kicker ? `<div class="mc-kicker">${escapeHtml(td.kicker)}</div>` : "";
  const tags = td.priceTags.length
    ? `<div class="mc-hook-tags">${td.priceTags
        .map(
          (t, i) =>
            `<div class="mc-tag tone-${t.tone}" data-idx="${i}">` +
            (t.label ? `<span class="mc-tag-label">${escapeHtml(t.label)}</span>` : "") +
            `<span class="mc-tag-value">${escapeHtml(t.value)}</span></div>`,
        )
        .join("")}</div>`
    : "";

  return `
<div class="mc-collage" data-layout="${layout}">
    ${cellHtml}
    ${videoHtml}
  <div class="mc-seams">${seams}</div>
  <div class="mc-collage-glow"></div>
</div>
<div class="mc-hookpanel">
  <div class="mc-hook-meta">
    <div class="mc-badge">${escapeHtml(td.badge)}</div>
    ${kicker}
  </div>
  <div class="mc-hook-headline" data-size="${headlineSize(td.headline)}">${splitWords(td.headline, td.highlight)}</div>
  ${tags}
</div>`.trim();
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
  <div class="mc-headline" data-size="${headlineSize(td.headline)}"><div class="mc-hl-inner">${headlineWords}</div></div>
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
  <img class="mc-logo-badge mc-out-logo" src="${escapeHtml(logoRelPath)}" alt="logo" crossorigin="anonymous" />
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
/**
 * Pick a type size bucket for a headline so it always fits its block.
 * Measured against the 968px text column at Be Vietnam Pro 900 uppercase.
 */
function headlineSize(text: string): "xl" | "l" | "m" | "s" {
  const n = text.trim().length;
  if (n <= 42) return "xl";
  if (n <= 62) return "l";
  if (n <= 88) return "m";
  return "s";
}

function splitWords(text: string, highlight: string[] = []): string {
  const strip = (w: string) => w.replace(/[.,!?;:"'()\[\]]/g, "").toLocaleLowerCase("vi");
  const hl = highlight.map(strip);
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => {
      const sw = strip(w);
      const isHl = hl.length > 0 && hl.some((h) => h === sw || (h.includes(" ") && h.split(" ").includes(sw)));
      return `<span class="mc-w${isHl ? " hl" : ""}">${escapeHtml(w)}</span>`;
    })
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
