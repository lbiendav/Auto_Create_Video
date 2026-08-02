/**
 * Video sourcing for scene clips — the same idea as `image-search.ts` but for
 * MOVING footage: search the keyword, open the related pages (news articles,
 * stock libraries), and pull whatever playable clip they expose
 * (`og:video`, `<video src>`, `<source>`, or a bare .mp4 link).
 *
 * Sources (tried in `order`, default = articles first):
 *  - "articles" : DuckDuckGo web search → open top results → og:video / <video>.
 *                 This is the "clip from related platforms" behaviour.
 *  - "youtube"  : YouTube Data API v3 — CHỈ video licence Creative Commons
 *                 (`videoLicense=creativeCommon`), tức tác giả đã cho phép tái
 *                 sử dụng kể cả thương mại, miễn ghi nguồn. Cần YOUTUBE_API_KEY
 *                 và `yt-dlp` (API không trả file, chỉ trả metadata).
 *  - "pexels"   : Pexels video API — free key (PEXELS_API_KEY), portrait first.
 *  - "pixabay"  : Pixabay video API — free key (PIXABAY_API_KEY).
 *  - "wikimedia": Wikimedia Commons — không cần key, giấy phép tự do.
 *
 * Every hit carries `sourcePage` + `credit` so you can attribute the clip.
 * You are responsible for the licensing of any footage you publish.
 */
import axios from "axios";
import type { VideoSearchConfig } from "../config.js";
import { log } from "../utils/logger.js";

export interface VideoHit {
  /**
   * Với hầu hết nguồn: URL file mp4/webm tải thẳng được.
   * Với `kind: "youtube"`: URL trang watch — phải tải qua yt-dlp, axios sẽ chỉ
   * nhận về HTML.
   */
  url: string;
  /** "file" (mặc định) = tải bằng HTTP; "youtube" = phải dùng yt-dlp */
  kind?: "file" | "youtube";
  /** page the clip was found on (for attribution / rights checking) */
  sourcePage?: string;
  /** short human credit string, e.g. "vnexpress.net" or "Pexels — Jane Doe" */
  credit?: string;
  license?: string;
  /** pixel width when the source reports it (used to prefer bigger clips) */
  width?: number;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/** Platforms that only serve DRM/streaming players — never yield a plain file. */
const SKIP_HOSTS = /(youtube\.com|youtu\.be|facebook\.com|instagram\.com|tiktok\.com|netflix\.com|twitch\.tv)/i;

/** Playlist/streaming manifests we cannot feed straight into ffmpeg reliably. */
const BAD_EXT = /\.(m3u8|mpd)(\?|$)/i;

export async function searchVideoCandidates(query: string, cfg: VideoSearchConfig): Promise<VideoHit[]> {
  const q = query.trim();
  if (!q) return [];
  const out: VideoHit[] = [];

  for (const src of cfg.order) {
    try {
      let hits: VideoHit[] = [];
      if (src === "articles") hits = await fromWebArticles(q);
      else if (src === "youtube" && cfg.youtubeKey) hits = await fromYouTube(q, cfg);
      else if (src === "pexels" && cfg.pexelsKey) hits = await fromPexelsVideos(q, cfg.pexelsKey);
      else if (src === "pixabay" && cfg.pixabayKey) hits = await fromPixabayVideos(q, cfg.pixabayKey);
      else if (src === "wikimedia") hits = await fromWikimediaVideos(q);

      hits = hits.filter((h) => h.url && (h.kind === "youtube" || !BAD_EXT.test(h.url)));
      if (hits.length) {
        log.info(`    [video:${src}] ${hits.length} candidate(s)`);
        out.push(...hits);
        if (out.length >= 6) break;
      }
    } catch (e: any) {
      log.warn(`    video source [${src}] failed: ${e?.message ?? e}`);
    }
  }
  return out;
}

// ── ARTICLES: search → open results → og:video / <video> / .mp4 ─────────────
async function fromWebArticles(q: string): Promise<VideoHit[]> {
  const html = (
    await axios.get("https://html.duckduckgo.com/html/", {
      params: { q: `${q} video` },
      headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
      timeout: 20000,
      responseType: "text",
    })
  ).data as string;

  const links: string[] = [];
  const re = /class="result__a"[^>]*href="([^"]+)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) && links.length < 12) {
    let href = m[1];
    if (href.startsWith("//")) href = "https:" + href;
    const uddg = /[?&]uddg=([^&]+)/.exec(href);
    if (uddg) href = decodeURIComponent(uddg[1]);
    if (/^https?:\/\//.test(href) && !SKIP_HOSTS.test(href) && !links.includes(href)) links.push(href);
  }

  const hits: VideoHit[] = [];
  for (const link of links) {
    if (hits.length >= 5) break;
    try {
      const page = (
        await axios.get(link, {
          headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
          timeout: 15000,
          responseType: "text",
          maxRedirects: 3,
          maxContentLength: 8_000_000,
        })
      ).data as string;
      const vid = extractVideoUrl(page, link);
      if (vid) {
        let domain = "";
        try {
          domain = new URL(link).hostname.replace(/^www\./, "");
        } catch {
          /* ignore */
        }
        hits.push({ url: vid, sourcePage: link, credit: domain, license: "web (check rights)" });
      }
    } catch {
      /* skip unreachable page */
    }
  }
  return hits;
}

/** og:video → twitter:player:stream → <video src> → <source src> → bare .mp4 */
export function extractVideoUrl(html: string, base: string): string | null {
  const pats = [
    /<meta[^>]+property=["']og:video(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:video(?::secure_url|:url)?["']/i,
    /<meta[^>]+name=["']twitter:player:stream["'][^>]+content=["']([^"']+)["']/i,
    /<video[^>]+src=["']([^"']+\.(?:mp4|webm)[^"']*)["']/i,
    /<source[^>]+src=["']([^"']+\.(?:mp4|webm)[^"']*)["']/i,
    /["'](https?:\/\/[^"']+\.mp4(?:\?[^"']*)?)["']/i,
    /"contentUrl"\s*:\s*"([^"]+\.mp4[^"]*)"/i,
  ];
  for (const p of pats) {
    const m = p.exec(html);
    if (m && m[1]) {
      const u = absolutize(m[1].trim().replace(/\\\//g, "/"), base);
      if (u && !BAD_EXT.test(u) && !SKIP_HOSTS.test(u)) return u;
    }
  }
  return null;
}

function absolutize(u: string, base: string): string | null {
  try {
    if (/^https?:\/\//i.test(u)) return u;
    if (u.startsWith("//")) return "https:" + u;
    return new URL(u, base).href;
  } catch {
    return null;
  }
}

// ── Pexels videos (free key) ────────────────────────────────────────────────
// Endpoint đúng theo tài liệu: GET https://api.pexels.com/v1/videos/search
// (thiếu "/v1" là 404 — lỗi này đã từng làm cả nguồn Pexels chết câm).
async function fromPexelsVideos(q: string, key: string): Promise<VideoHit[]> {
  const r = await axios.get("https://api.pexels.com/v1/videos/search", {
    params: { query: q, per_page: 8, orientation: "portrait", size: "medium", locale: "en-US" },
    headers: { Authorization: key, "User-Agent": UA },
    timeout: 20000,
  });
  const videos: any[] = r.data?.videos ?? [];
  return videos
    // clip 4–25s là vừa cho một beat; clip quá dài thường là timelapse dài dòng
    .filter((v) => !v.duration || (v.duration >= 4 && v.duration <= 25))
    .map((v: any) => {
      const files: any[] = (v.video_files ?? []).filter((f: any) => f.file_type === "video/mp4");
      // ưu tiên file dọc, HD nhưng không quá 1920 chiều rộng (tải cho nhanh)
      files.sort((a, b) => {
        const portrait = (f: any) => ((f.height ?? 0) >= (f.width ?? 0) ? 0 : 1);
        return portrait(a) - portrait(b) || (b.width ?? 0) - (a.width ?? 0);
      });
      const pick = files.find((f) => (f.width ?? 0) <= 1920) ?? files[0];
      if (!pick) return null;
      return {
        url: pick.link,
        sourcePage: v.url,
        credit: `Pexels — ${v.user?.name ?? "unknown"}`,
        license: "Pexels License",
        width: pick.width,
      } as VideoHit;
    })
    .filter(Boolean) as VideoHit[];
}

// ── Pixabay videos (free key) ───────────────────────────────────────────────
async function fromPixabayVideos(q: string, key: string): Promise<VideoHit[]> {
  const r = await axios.get("https://pixabay.com/api/videos/", {
    params: { key, q, per_page: 6, safesearch: true },
    headers: { "User-Agent": UA },
    timeout: 20000,
  });
  return (r.data?.hits ?? [])
    .filter((h: any) => !h.duration || (h.duration >= 4 && h.duration <= 25))
    .map((h: any) => {
      const v = h.videos?.large ?? h.videos?.medium ?? h.videos?.small;
      if (!v?.url) return null;
      return {
        url: v.url,
        sourcePage: h.pageURL,
        credit: `Pixabay — ${h.user ?? "unknown"}`,
        license: "Pixabay Content License",
        width: v.width,
      } as VideoHit;
    })
    .filter(Boolean) as VideoHit[];
}

// ── Wikimedia Commons video (KHÔNG CẦN KEY, giấy phép tự do) ────────────────
// Dùng đúng API mà phần ảnh đã dùng, chỉ đổi filetype sang video. Đây là nguồn
// dự phòng duy nhất chạy được khi người dùng chưa có key stock nào.
async function fromWikimediaVideos(q: string): Promise<VideoHit[]> {
  const r = await axios.get("https://commons.wikimedia.org/w/api.php", {
    params: {
      action: "query",
      generator: "search",
      gsrsearch: `filetype:video ${q}`,
      gsrnamespace: 6,
      gsrlimit: 8,
      prop: "imageinfo",
      iiprop: "url|mime|size|extmetadata",
      format: "json",
      origin: "*",
    },
    headers: { "User-Agent": UA },
    timeout: 20000,
  });
  const pages = r.data?.query?.pages ?? {};
  return Object.values(pages)
    .map((pg: any) => pg?.imageinfo?.[0])
    .filter((info: any) => info?.url && /^video\//i.test(info.mime ?? ""))
    .slice(0, 5)
    .map((info: any) => ({
      url: info.url,
      sourcePage: info.descriptionurl,
      credit: "Wikimedia Commons",
      license: info.extmetadata?.LicenseShortName?.value ?? "free licence (check)",
    })) as VideoHit[];
}

// ── YouTube (Data API v3, CHỈ Creative Commons) ──────────────────────────────
//
// Hai điều cần nhớ về nguồn này:
//
//  1. API không trả file. `search.list` chỉ cho metadata + videoId, nên hit trả
//     về mang `kind: "youtube"` và phải để `scene-videos.ts` tải bằng yt-dlp.
//  2. Bộ lọc `videoLicense=creativeCommon` của search endpoint đôi lúc lọt lưới,
//     nên ta gọi thêm `videos.list` để đọc `status.license` và CHỈ giữ video
//     thật sự là creativeCommon. Đây là lớp bảo vệ bản quyền — đừng bỏ.
//
// Quota: search.list tốn 100 đơn vị/lần, hạn mức mặc định 10.000/ngày → khoảng
// 100 lượt tìm mỗi ngày. Mỗi scene có `video.query` là một lượt.

/** Đổi ISO-8601 duration ("PT1M30S") sang giây. Trả 0 nếu không đọc được. */
export function parseIsoDuration(iso: string): number {
  const m = /^P(?:([\d.]+)D)?T(?:([\d.]+)H)?(?:([\d.]+)M)?(?:([\d.]+)S)?$/.exec(iso ?? "");
  if (!m) return 0;
  const [, d, h, min, sec] = m;
  return (
    (parseFloat(d ?? "0") || 0) * 86400 +
    (parseFloat(h ?? "0") || 0) * 3600 +
    (parseFloat(min ?? "0") || 0) * 60 +
    (parseFloat(sec ?? "0") || 0)
  );
}

export interface YouTubePick {
  hits: VideoHit[];
  /** search endpoint tra ve nhung `status.license` khong phai CC — bo loc cua Google lot luoi */
  notCC: number;
  /** dung licence nhung dai qua `maxSec` */
  tooLong: number;
  /** do dai (giay) cua nhung clip bi loai vi qua dai — de goi y nguong moi */
  tooLongSecs: number[];
}

/**
 * Lọc + xếp hạng kết quả `videos.list`. Tách riêng khỏi phần gọi mạng để test
 * được: chỉ giữ licence creativeCommon, bỏ clip dài quá `maxSec`, ưu tiên clip
 * ngắn (dễ loop vừa beat) và độ phân giải cao.
 *
 * Trả kèm số liệu vì sao loại: hai nguyên nhân cần cách xử lý ngược nhau —
 * `notCC` thì chịu (không có clip hợp lệ), còn `tooLong` chỉ cần nới
 * YOUTUBE_MAX_SEC là ra kết quả.
 */
export function pickYouTubeHits(items: any[], maxSec: number): YouTubePick {
  const all = items ?? [];
  const cc = all.filter((v: any) => v?.id && v?.status?.license === "creativeCommon");
  const notCC = all.length - cc.length;
  const tooLongSecs: number[] = [];

  const hits = cc
    .map((v: any) => {
      const secs = parseIsoDuration(v?.contentDetails?.duration ?? "");
      const channel = v?.snippet?.channelTitle ?? "unknown";
      return {
        hit: {
          url: `https://www.youtube.com/watch?v=${v.id}`,
          kind: "youtube" as const,
          sourcePage: `https://www.youtube.com/watch?v=${v.id}`,
          // CC BY BẮT BUỘC ghi nguồn — chuỗi này chảy xuống ResolvedSceneVideo.credit
          credit: `YouTube — ${channel} (CC BY)`,
          license: "CC BY 3.0",
          width: v?.contentDetails?.definition === "hd" ? 1920 : 640,
        } satisfies VideoHit,
        secs,
        hd: v?.contentDetails?.definition === "hd" ? 0 : 1,
      };
    })
    .filter((x) => {
      if (x.secs > 0 && x.secs <= maxSec) return true;
      if (x.secs > maxSec) tooLongSecs.push(Math.round(x.secs));
      return false;
    })
    .sort((a, b) => a.hd - b.hd || a.secs - b.secs)
    .slice(0, 5)
    .map((x) => x.hit);

  return { hits, notCC, tooLong: tooLongSecs.length, tooLongSecs: tooLongSecs.sort((a, b) => a - b) };
}

async function fromYouTube(q: string, cfg: VideoSearchConfig): Promise<VideoHit[]> {
  const key = cfg.youtubeKey!;
  let ids: string[] = [];
  try {
    const s = await axios.get("https://www.googleapis.com/youtube/v3/search", {
      params: {
        key,
        q,
        part: "snippet",
        type: "video",
        videoLicense: "creativeCommon", // ← điểm mấu chốt: chỉ video được phép tái sử dụng
        videoEmbeddable: "true",
        maxResults: 12,
        order: "relevance",
        safeSearch: "moderate",
      },
      timeout: 20000,
    });
    ids = (s.data?.items ?? []).map((it: any) => it?.id?.videoId).filter(Boolean).slice(0, 12);
  } catch (e: any) {
    const reason = e?.response?.data?.error?.errors?.[0]?.reason;
    if (reason === "quotaExceeded")
      log.warn(`    [video:youtube] hết quota API hôm nay (search.list tốn 100 đơn vị/lượt)`);
    else if (e?.response?.status === 403)
      log.warn(`    [video:youtube] API từ chối (403) — kiểm tra YOUTUBE_API_KEY đã bật YouTube Data API v3 chưa`);
    else throw e;
    return [];
  }
  if (!ids.length) {
    log.info(`    [video:youtube] không có video Creative Commons nào cho "${q}"`);
    return [];
  }

  // xác minh lại licence — search filter không phải lúc nào cũng chuẩn
  const v = await axios.get("https://www.googleapis.com/youtube/v3/videos", {
    params: { key, id: ids.join(","), part: "status,contentDetails,snippet" },
    timeout: 20000,
  });
  const items = v.data?.items ?? [];
  const { hits, notCC, tooLong, tooLongSecs } = pickYouTubeHits(items, cfg.youtubeMaxSec);
  if (notCC > 0) log.info(`    [video:youtube] bỏ ${notCC} video không phải Creative Commons`);
  if (tooLong > 0) {
    const shortest = tooLongSecs[0];
    log.info(
      `    [video:youtube] bỏ ${tooLong} video dài quá ${cfg.youtubeMaxSec}s ` +
        `(ngắn nhất trong số đó: ${shortest}s → nới YOUTUBE_MAX_SEC=${shortest + 10} là nhận được)`,
    );
  }
  return hits;
}
