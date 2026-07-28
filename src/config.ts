import "dotenv/config";

export type TtsProvider = "lucylab" | "elevenlabs";

/** Visual theme. `maicrypto` = image-driven @oncoinx2-style (default). `broadcast` = the neon news chrome. */
export type VideoTheme = "maicrypto" | "broadcast";

export interface TiktokConfig {
  displayName: string;
  handle: string;
  followers: string;
  /** URL to download avatar JPG. If undefined, the bundled `assets/avatar.jpg` is used. */
  avatarUrl?: string;
}

/** MAI Crypto branding — sun logo + wordmark + dynamic source-credit prefix. */
export interface BrandConfig {
  /** Channel wordmark shown top-right + on the outro card. */
  name: string;
  /** @handle shown on the outro card. */
  handle: string;
  /** Logo asset filename inside assets/ (the sun line-art). jpg/png/webp/svg. */
  logoFile: string;
  /**
   * Dynamic credit prefix. Rendered top-center as "<prefix> <source>",
   * e.g. "Tổng hợp bởi VnExpress". The <source> part is per-video
   * (metadata.source.name || metadata.source.domain).
   */
  creditPrefix: string;
}

/** Per-scene image generation (Pollinations — free, no key). Used when a scene supplies a `prompt`. */
export interface ImageGenConfig {
  enabled: boolean;
  /** Base endpoint. Default Pollinations text→image. */
  endpoint: string;
  /** Style suffix appended to every prompt for a consistent look. */
  stylePrompt: string;
}

/** Web image search for REAL photos by keyword (prefers real news imagery over AI). */
export interface ImageSearchConfig {
  /** sources to try in order, e.g. ["duckduckgo","openverse","wikimedia"] (+ "pexels"/"unsplash" if keyed). */
  order: string[];
  pexelsKey?: string;
  unsplashKey?: string;
}

/** Cau hinh xuat video cuoi cung (hyperframes -> ffmpeg/libx264). */
export interface RenderConfig {
  /** 24 | 30 | 60. TikTok chap nhan ca ba; 60 muot hon cho animation. */
  fps: number;
  /** draft = ultrafast/CRF28, standard = medium/CRF18, high = slow/CRF15. */
  quality: "draft" | "standard" | "high";
  /**
   * Bitrate muc tieu, vi du "20M". Khi co gia tri, encoder dung `-b:v` (ABR)
   * thay cho CRF -> dam bao du bit de video con net sau khi TikTok nen lai.
   * Dat rong ("") de quay ve che do CRF.
   */
  videoBitrate?: string;
  /** Override CRF truc tiep. Neu set thi videoBitrate bi bo qua. */
  crf?: number;
  /** Dung GPU encode (h264_videotoolbox tren macOS): nhanh hon, chat luong thap hon libx264. */
  gpu: boolean;
  /** Nguong canh bao bitrate (Mbps) o buoc verify sau render. */
  minMbps: number;
}

export interface Config {
  ttsProvider: TtsProvider;

  // LucyLab
  lucylabApiKey?: string;
  lucylabVoiceId?: string;
  lucylabEndpoint: string;
  lucylabPollIntervalMs: number;
  lucylabPollTimeoutMs: number;

  // ElevenLabs
  elevenlabsApiKey?: string;
  elevenlabsVoiceId?: string;
  elevenlabsModelId: string;
  elevenlabsEndpoint: string;

  // Visual theme + branding
  theme: VideoTheme;
  brand: BrandConfig;
  imageGen: ImageGenConfig;
  imageSearch: ImageSearchConfig;

  // TikTok follow card (outro) — broadcast theme only
  tiktok: TiktokConfig;

  // Thong so xuat video (1080x1920 H.264 MP4)
  render: RenderConfig;

  ttsConcurrency: number;

  // Background music bed (assets/music, ducked under voice)
  music: {
    enabled: boolean;
    /** Default bed volume 0–1 when script.json doesn't specify */
    volume: number;
    /** Absolute path override — use this exact file for every video */
    file?: string;
  };
}

function intDefault(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseInt(v, 10);
  if (isNaN(n)) throw new Error(`Env var ${name} must be integer, got "${v}"`);
  return n;
}

function floatDefault(name: string, def: number): number {
  const v = process.env[name];
  if (!v) return def;
  const n = parseFloat(v);
  if (isNaN(n)) throw new Error(`Env var ${name} must be a number, got "${v}"`);
  return n;
}

export function loadConfig(): Config {
  const provider = (process.env.TTS_PROVIDER ?? "lucylab") as TtsProvider;
  if (provider !== "lucylab" && provider !== "elevenlabs") {
    throw new Error(`TTS_PROVIDER must be "lucylab" or "elevenlabs", got "${provider}"`);
  }

  const theme = (process.env.VIDEO_THEME ?? "maicrypto") as VideoTheme;
  if (theme !== "maicrypto" && theme !== "broadcast") {
    throw new Error(`VIDEO_THEME must be "maicrypto" or "broadcast", got "${theme}"`);
  }

  // Validate provider-specific required vars
  if (provider === "lucylab") {
    if (!process.env.VIETNAMESE_API_KEY || process.env.VIETNAMESE_API_KEY.trim() === "") {
      throw new Error(
        `Missing VIETNAMESE_API_KEY (required when TTS_PROVIDER=lucylab). ` +
        `Copy .env.example to .env.local and fill in your LucyLab API key.`
      );
    }
    if (!process.env.VIETNAMESE_VOICEID || process.env.VIETNAMESE_VOICEID.trim() === "") {
      throw new Error(
        `Missing VIETNAMESE_VOICEID (required when TTS_PROVIDER=lucylab). ` +
        `Copy .env.example to .env.local and fill in your LucyLab voice ID.`
      );
    }
  } else {
    if (!process.env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY.trim() === "") {
      throw new Error(
        `Missing ELEVENLABS_API_KEY (required when TTS_PROVIDER=elevenlabs). ` +
        `Copy .env.example to .env.local and fill in your ElevenLabs API key.`
      );
    }
    if (!process.env.ELEVENLABS_VOICE_ID || process.env.ELEVENLABS_VOICE_ID.trim() === "") {
      throw new Error(
        `Missing ELEVENLABS_VOICE_ID (required when TTS_PROVIDER=elevenlabs). ` +
        `Copy .env.example to .env.local and fill in your ElevenLabs voice ID.`
      );
    }
  }

  const pexelsKey = process.env.PEXELS_API_KEY || undefined;
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY || undefined;
  const imageSearch: ImageSearchConfig = (() => {
    let order: string[];
    if (process.env.IMAGE_SOURCE) {
      order = process.env.IMAGE_SOURCE.split(",").map((x) => x.trim()).filter(Boolean);
    } else {
      order = ["articles", "duckduckgo", "openverse", "wikimedia"];
      if (pexelsKey) order.push("pexels");
      if (unsplashKey) order.push("unsplash");
    }
    return { order, pexelsKey, unsplashKey };
  })();

  const fps = intDefault("VIDEO_FPS", 60);
  if (![24, 30, 60].includes(fps)) {
    throw new Error(`VIDEO_FPS must be 24, 30 or 60, got "${fps}"`);
  }

  const renderQuality = (process.env.VIDEO_QUALITY ?? "high") as RenderConfig["quality"];
  if (!["draft", "standard", "high"].includes(renderQuality)) {
    throw new Error(`VIDEO_QUALITY must be "draft", "standard" or "high", got "${renderQuality}"`);
  }

  // "" / "0" / "off" => tat ABR, quay ve CRF cua preset.
  const rawBitrate = (process.env.VIDEO_BITRATE ?? "20M").trim();
  const bitrateOff = ["", "0", "off", "false"].includes(rawBitrate.toLowerCase());
  if (!bitrateOff && !/^\d+(\.\d+)?[KMkm]$/.test(rawBitrate)) {
    throw new Error(`VIDEO_BITRATE must look like "20M" or "12000K", got "${rawBitrate}"`);
  }
  const videoBitrate = bitrateOff ? undefined : rawBitrate.toUpperCase();

  const rawCrf = process.env.VIDEO_CRF?.trim();
  let crf: number | undefined;
  if (rawCrf) {
    crf = parseInt(rawCrf, 10);
    if (isNaN(crf) || crf < 0 || crf > 51) {
      throw new Error(`VIDEO_CRF must be an integer 0-51, got "${rawCrf}"`);
    }
  }

  return {
    ttsProvider: provider,
    lucylabApiKey: process.env.VIETNAMESE_API_KEY,
    lucylabVoiceId: process.env.VIETNAMESE_VOICEID,
    lucylabEndpoint: process.env.LUCYLAB_ENDPOINT ?? "https://api.lucylab.io/json-rpc",
    lucylabPollIntervalMs: intDefault("LUCYLAB_POLL_INTERVAL_MS", 2000),
    lucylabPollTimeoutMs: intDefault("LUCYLAB_POLL_TIMEOUT_MS", 120000),
    elevenlabsApiKey: process.env.ELEVENLABS_API_KEY,
    elevenlabsVoiceId: process.env.ELEVENLABS_VOICE_ID,
    elevenlabsModelId: process.env.ELEVENLABS_MODEL_ID ?? "eleven_multilingual_v2",
    elevenlabsEndpoint: process.env.ELEVENLABS_ENDPOINT ?? "https://api.elevenlabs.io/v1",

    theme,
    brand: {
      name: process.env.BRAND_NAME ?? "MAI Crypto",
      handle: process.env.BRAND_HANDLE ?? "@maicrypto",
      logoFile: process.env.BRAND_LOGO_FILE ?? "avatar.png",
      creditPrefix: process.env.BRAND_CREDIT_PREFIX ?? "Tổng hợp bởi",
    },
    imageGen: {
      enabled: !["0", "false", "off"].includes((process.env.IMAGEGEN_ENABLED ?? "1").toLowerCase()),
      endpoint: process.env.IMAGEGEN_ENDPOINT ?? "https://image.pollinations.ai/prompt",
      stylePrompt:
        process.env.IMAGEGEN_STYLE ??
        "cinematic editorial news illustration, dramatic lighting, high detail, 9:16 vertical, realistic",
    },
    imageSearch,

    tiktok: {
      displayName: process.env.TIKTOK_DISPLAY_NAME ?? "Công nghệ 24h",
      handle: process.env.TIKTOK_HANDLE ?? "@congnghe24h",
      followers: process.env.TIKTOK_FOLLOWERS ?? "1.2M followers",
      avatarUrl: process.env.TIKTOK_AVATAR_URL || undefined,
    },
    render: {
      fps,
      quality: renderQuality,
      videoBitrate,
      crf,
      gpu: ["1", "true", "on"].includes((process.env.VIDEO_GPU ?? "0").toLowerCase()),
      minMbps: floatDefault("VIDEO_MIN_MBPS", 10),
    },
    ttsConcurrency: intDefault("TTS_CONCURRENCY", 1),
    music: {
      enabled: !["0", "false", "off"].includes((process.env.MUSIC_ENABLED ?? "1").toLowerCase()),
      volume: floatDefault("MUSIC_VOLUME", 0.16),
      file: process.env.MUSIC_FILE || undefined,
    },
  };
}
