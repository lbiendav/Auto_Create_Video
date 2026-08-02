import { z } from "zod";

// ── Per-scene image source ─────────────────────────────────────────────────
/**
 * Image shown in a scene. Two ways to supply it:
 *  - `src`   : a direct URL (https://…) or a path already inside the output dir.
 *  - `prompt`: a text prompt → the pipeline AI-generates the image (Pollinations,
 *              free, no key) into images/scene-<id>.jpg. Great for the @oncoinx2
 *              look where each beat has its own generated illustration.
 * If both are given, `src` wins. If neither, the scene falls back to its
 * themed/gradient background.
 */
const SceneImage = z.object({
  src: z.string().optional(),
  /** keyword(s) → search the web for a REAL photo (preferred over AI). e.g. "cambodia scam compound" */
  query: z.string().max(120).optional(),
  prompt: z.string().max(400).optional(),
  /** contain = ảnh nằm trọn trên nền mờ của chính nó (mặc định, kiểu @oncoinx2); cover = lấp đầy + cắt */
  fit: z.enum(["contain", "cover"]).default("contain"),
  /** Ken Burns move applied to the foreground image */
  kenBurns: z.enum(["zoom-in", "zoom-out", "pan-left", "pan-right"]).default("zoom-in"),
});
export type SceneImageType = z.infer<typeof SceneImage>;

// ── Per-scene VIDEO source ─────────────────────────────────────────────────
/**
 * Short video clip shown in a scene (instead of, or on top of, the still).
 * Three ways to supply it:
 *  - `src`   : a direct mp4/webm URL, or a file already inside the output dir.
 *  - `query` : keyword(s) → the pipeline searches related platforms/pages
 *              (news articles, stock libraries) and pulls the first playable
 *              clip it finds. This is the "video from related content" mode.
 *  - nothing : the scene falls back to its image.
 * Every resolved clip is normalised by ffmpeg to 1080×1920 (blurred fill +
 * centred subject), trimmed/looped to the scene length, and muted — so the
 * HyperFrames frame-by-frame renderer stays deterministic.
 */
const SceneVideo = z.object({
  src: z.string().optional(),
  /** keyword(s) → search related pages/platforms for a clip. e.g. "bitcoin trading floor" */
  query: z.string().max(120).optional(),
  /** trim in-point inside the source clip (seconds) */
  startSec: z.number().min(0).max(600).default(0),
  /** cover = fill the 9:16 frame; contain = letterbox over a blurred fill (default) */
  fit: z.enum(["cover", "contain"]).default("contain"),
  /** playback speed applied at normalisation time (0.5 = slow-mo, 1 = normal) */
  speed: z.number().min(0.25).max(2).default(1),
  /** show the small red "CLIP" marker over the beat */
  chip: z.string().max(20).optional(),
});
export type SceneVideoType = z.infer<typeof SceneVideo>;

// ── Template data shapes (discriminated by template field) ─────────────────

const HookData = z.object({
  template: z.literal("hook"),
  headline: z.string().min(1).max(40),
  subhead: z.string().max(40).optional(),
  /** Breaking-news stamp slammed over the hook (e.g. "TIN NÓNG", "BREAKING"). */
  badge: z.string().max(14).default("TIN NÓNG"),
  /** background image path (literal "$source.image" → substituted at pipeline level) */
  bgSrc: z.string().optional(),
  /** Ken Burns effect class */
  kenBurns: z.enum(["zoom-in", "zoom-out", "pan-left", "pan-right"]).default("zoom-in"),
});

const ComparisonSide = z.object({
  label: z.string().min(1).max(30),
  value: z.string().min(1).max(20),
  color: z.enum(["cyan", "purple"]),
});

const ComparisonData = z.object({
  template: z.literal("comparison"),
  left: ComparisonSide,
  right: ComparisonSide.extend({ winner: z.boolean().optional() }),
});

const StatHeroData = z.object({
  template: z.literal("stat-hero"),
  value: z.string().min(1).max(20),
  label: z.string().min(1).max(40),
  context: z.string().max(50).optional(),
});

const FeatureListData = z.object({
  template: z.literal("feature-list"),
  title: z.string().min(1).max(40),
  bullets: z.array(z.string().min(1).max(50)).min(1).max(4),
  icon: z.string().optional(),
});

const CalloutData = z.object({
  template: z.literal("callout"),
  statement: z.string().min(1).max(80),
  tag: z.string().max(20).optional(),
});

const OutroData = z.object({
  template: z.literal("outro"),
  ctaTop: z.string().min(1).max(30),
  channelName: z.string().min(1).max(30),
  source: z.string().min(1).max(40),
});

/**
 * Animated price/metric line chart — designed for crypto price action.
 * `points` are raw values (any scale); the renderer normalizes them.
 * Trend drives the color scheme (up = cyan/green, down = red/pink).
 */
const ChartData = z.object({
  template: z.literal("chart"),
  title: z.string().min(1).max(40),
  /** Raw series values, left → right (min 4 for a meaningful line) */
  points: z.array(z.number()).min(4).max(60),
  /** Label under the final value, e.g. "BTC / USD — 7 ngày" */
  label: z.string().max(40).optional(),
  /** Text stamped near the line end, e.g. "-52%" or "126,080$" */
  changeText: z.string().max(14).optional(),
  trend: z.enum(["up", "down"]).default("down"),
});

// ═══════════════════════════════════════════════════════════════════════════
//  MAI CRYPTO (image-driven, @oncoinx2 style) TEMPLATES
// ═══════════════════════════════════════════════════════════════════════════

/** A floating price/level tag (right side of the finance hook). */
const PriceTag = z.object({
  label: z.string().max(16).optional(),
  value: z.string().min(1).max(16),
  tone: z.enum(["up", "down", "neutral"]).default("neutral"),
});

/**
 * FINANCE HOOK — the opening beat. Bold uppercase headline burned in at the
 * bottom, over a dark finance backdrop (animated candlesticks + drifting crypto
 * coins). Optional subject image (contained figure) and floating price tags.
 */
const FinanceHookData = z.object({
  template: z.literal("finance-hook"),
  headline: z.string().min(1).max(120),
  badge: z.string().max(16).default("TIN NÓNG"),
  /** backdrop mood: tints the candlesticks + coin glyphs */
  /** Backdrop tint — unified single style for finance/economy/crypto/stocks. */
  theme: z.literal("finance").default("finance"),
  /** overall trend of the candlestick backdrop */
  trend: z.enum(["up", "down", "mixed"]).default("mixed"),
  /** floating price levels on the right edge (0–5) */
  priceTags: z.array(PriceTag).max(5).default([]),
});

/**
 * HOOK SPLIT — the opening card: khung chia đôi.
 *   nửa trên  = ảnh chủ đề (blurred fill + Ken Burns), hoà mềm xuống dưới
 *   nửa dưới  = khối màu thương hiệu: logo/wordmark kênh + CÂU TÓM TẮT in hoa
 * Đây là kiểu mở đầu mặc định.
 */
const HookSplitData = z.object({
  template: z.literal("hook-split"),
  /** Câu tóm tắt in hoa ở nửa dưới (có thể dài, tự co cỡ chữ theo độ dài) */
  summary: z.string().min(1).max(220),
  /** Vị trí đường chia (tỉ lệ chiều cao khung). 0.42–0.62, mặc định 0.51 */
  splitAt: z.number().min(0.42).max(0.62).default(0.51),
  /** Màu khối dưới: brand = vàng đậm (mặc định) | dark = đen ánh vàng | emerald | crimson */
  panelTone: z.enum(["brand", "dark", "emerald", "crimson"]).default("brand"),
  /** Hiện logo + tên kênh lớn ở đầu khối dưới (như bản gốc) */
  showWordmark: z.boolean().default(true),
  /** Nhãn nhỏ phía trên câu tóm tắt, vd "TIN NÓNG" (bỏ trống thì không hiện) */
  badge: z.string().max(16).optional(),
  /** Dòng nhỏ in hoa cạnh badge, vd "CHỨNG KHOÁN · 28/07" */
  kicker: z.string().max(48).optional(),
  /** Các từ được tô màu nhấn trong câu tóm tắt */
  highlight: z.array(z.string().max(30)).max(6).default([]),
  /** Thẻ giá nổi ở nửa trên (0–3) */
  priceTags: z.array(PriceTag).max(3).default([]),
});

/**
 * HOOK COLLAGE — the opening "chia phần" card (@oncoinx2 style).
 * Top ~62% of the frame is split into 2–3 image/video cells by gold seams;
 * the bottom ~38% is a brand panel carrying badge + kicker + big headline +
 * optional price tags. Cell media comes from the scene's `images` array
 * (falls back to the single `image`).
 */
const HookCollageData = z.object({
  template: z.literal("hook-collage"),
  headline: z.string().min(1).max(120),
  /** small uppercase line above the headline, e.g. "THỊ TRƯỜNG · 28/07" */
  kicker: z.string().max(48).optional(),
  badge: z.string().max(16).default("TIN NÓNG"),
  /**
   * Cell split geometry. `auto` picks by cell count:
   * 2 → duo-diagonal, 3 → trio-stack.
   */
  layout: z.enum(["auto", "duo-diagonal", "duo-stack", "trio-stack", "trio-column"]).default("auto"),
  /** tiny caption pinned inside each cell (index-matched to the images) */
  cellLabels: z.array(z.string().max(28)).max(3).default([]),
  /** words (case-insensitive) rendered in brand gold inside the headline */
  highlight: z.array(z.string().max(30)).max(4).default([]),
  /** floating price levels under the headline (0–3) */
  priceTags: z.array(PriceTag).max(3).default([]),
});

/**
 * IMAGE — the workhorse body beat. A relevant photo/illustration shown
 * "contained" over its own blurred fill, with a gentle Ken Burns move. No
 * karaoke captions (matches @oncoinx2). Optional tiny lower label.
 */
const ImageSceneData = z.object({
  template: z.literal("image"),
  /** small optional caption strip under the image (kept subtle; omit for clean look) */
  label: z.string().max(80).optional(),
  /** optional short bold overlay headline (e.g. a pulled quote / number) */
  headline: z.string().max(90).optional(),
});

/**
 * DOCUMENT — full-frame evidence shot (a screenshot, notice, or scanned doc)
 * with a slow zoom/pan so viewers can read it. Optional label chip.
 */
const DocumentData = z.object({
  template: z.literal("document"),
  label: z.string().max(60).optional(),
});

/**
 * BRAND OUTRO — the closing card. Sun logo + channel wordmark + handle +
 * dynamic source credit. Replaces the neon TikTok follow card in this theme.
 */
const BrandOutroData = z.object({
  template: z.literal("brand-outro"),
  cta: z.string().max(60).default("Theo dõi để cập nhật tin nóng mỗi ngày"),
  channelName: z.string().min(1).max(30),
  handle: z.string().max(30).optional(),
  source: z.string().max(60).optional(),
});

export const TemplateData = z.discriminatedUnion("template", [
  HookData,
  ComparisonData,
  StatHeroData,
  FeatureListData,
  CalloutData,
  ChartData,
  OutroData,
  // MAI Crypto image-driven set:
  HookSplitData,
  HookCollageData,
  FinanceHookData,
  ImageSceneData,
  DocumentData,
  BrandOutroData,
]);

export type TemplateDataType = z.infer<typeof TemplateData>;

// ── SFX schema ─────────────────────────────────────────────────────────────
/**
 * Per-scene sound effect override. If omitted, the pipeline picks a default
 * SFX based on the template type (see SKILL.md / pipeline DEFAULT_SFX).
 *
 * `name` examples: "transition/whoosh-soft", "emphasis/ding", "alert/notification"
 *   → resolves to assets/sfx/<name>.mp3
 * Set `name: "none"` to explicitly disable SFX for this scene.
 */
const SfxSpec = z.object({
  name: z.string().min(1),
  /** Volume 0–1, default 0.4 (so SFX doesn't drown the voice) */
  volume: z.number().min(0).max(1).default(0.4),
  /** Seconds offset from scene start (default 0). Negative = before scene. */
  startOffsetSec: z.number().default(0),
});

export type SfxSpecType = z.infer<typeof SfxSpec>;

// ── Scene schema ───────────────────────────────────────────────────────────

const Scene = z.object({
  id: z.string().min(1),
  type: z.enum(["hook", "body", "outro"]),
  voiceText: z.string().min(1),
  templateData: TemplateData,
  /** Per-scene image (URL, local path, or AI-generation prompt). @oncoinx2 style. */
  image: SceneImage.optional(),
  /**
   * Extra images for multi-cell templates (hook-collage). Index 0 = first cell.
   * If omitted, the collage falls back to the single `image`.
   */
  images: z.array(SceneImage).max(3).optional(),
  /** Per-scene video clip (direct src, or `query` → search related platforms). */
  video: SceneVideo.optional(),
  /** Optional sound effect override (else pipeline picks per template) */
  sfx: SfxSpec.optional(),
});

// ── Root schema ────────────────────────────────────────────────────────────

/**
 * Background music bed mixed under the voice with auto-ducking.
 * Omitted → pipeline picks deterministically from assets/music (if any).
 * `name: "none"` disables music for this video.
 */
const MusicSpec = z.object({
  /** File name inside assets/music WITHOUT extension, or "none" to disable */
  name: z.string().min(1).optional(),
  /** Music bed volume 0–1 (before ducking). Default 0.16. */
  volume: z.number().min(0).max(1).default(0.16),
});
export type MusicSpecType = z.infer<typeof MusicSpec>;

export const ScriptSchema = z.object({
  version: z.literal("1.0"),
  metadata: z.object({
    title: z.string().min(1),
    source: z.object({
      url: z.string(),
      domain: z.string(),
      image: z.string().url().nullable(),
      /** Friendly display name for the dynamic credit, e.g. "VnExpress". Falls back to domain. */
      name: z.string().max(40).optional(),
    }),
    channel: z.string().min(1),
  }),
  /**
   * News-ticker items scrolling at the bottom (broadcast theme only).
   * Ignored by the MAI Crypto theme. Omitted → composer derives from metadata.
   */
  ticker: z.array(z.string().min(1).max(60)).max(8).optional(),
  /** Karaoke word-by-word captions. Default: enabled (broadcast theme only). */
  captions: z.object({ enabled: z.boolean().default(true) }).default({ enabled: true }),
  music: MusicSpec.optional(),
  voice: z.object({
    provider: z.literal("lucylab"),
    voiceId: z.string().min(1),
    speed: z.number().min(0.5).max(2.0),
  }),
  scenes: z
    .array(Scene)
    .min(3)
    .max(12, "scenes must have at most 12 items")
    .refine(
      (s) => s[0]?.type === "hook",
      { message: "scenes[0] must be type=hook" }
    )
    .refine(
      (s) => s[s.length - 1]?.type === "outro",
      { message: "last scene must be type=outro" }
    ),
});

export type Script = z.infer<typeof ScriptSchema>;
