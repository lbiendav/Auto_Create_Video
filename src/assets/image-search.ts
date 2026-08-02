/**
 * Real-photo sourcing for scene images — the @oncoinx2 way: search the keyword
 * on the web, get the RELATED ARTICLES from many sources (VnExpress, CafeF, news
 * sites…), then pull each article's own lead image (og:image). Falls back to
 * image search / stock only if article scraping yields nothing.
 *
 * Every hit carries `sourcePage` + `credit` (the article's domain) so you can
 * attribute like "Ảnh: vnexpress.net". You are responsible for the licensing of
 * images you publish.
 *
 * Sources (tried in `order`, default = articles first):
 *  - "articles"  : DuckDuckGo web search → open top results → extract og:image.
 *                  This is the "images from related articles" behaviour.
 *  - "duckduckgo": DuckDuckGo image search (direct image results).
 *  - "openverse" : api.openverse.org — CC-licensed, no key.
 *  - "wikimedia" : Wikimedia Commons — freely licensed, no key.
 *  - "pexels"    : stock, needs a free PEXELS_API_KEY.
 *  - "unsplash"  : stock, needs a free UNSPLASH_ACCESS_KEY.
 */
import axios from "axios";
import type { ImageSearchConfig } from "../config.js";
import { log } from "../utils/logger.js";

export interface ImageHit {
  /** direct image URL to download */
  url: string;
  /** page the image was found on (for attribution / rights checking) */
  sourcePage?: string;
  /** short human credit string, e.g. "vnexpress.net" or "Pexels — Jane Doe" */
  credit?: string;
  /** license label when known */
  license?: string;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

/**
 * Kho ảnh bán bản quyền: ảnh preview của họ LUÔN có watermark đè lên, dùng vào
 * video là hỏng khung hình. Chặn thẳng ở mọi nguồn.
 */
const WATERMARK_HOSTS =
  /(alamy|shutterstock|dreamstime|istockphoto|gettyimages|123rf|depositphotos|agefotostock|stockphoto|adobestock|stock\.adobe|canstockphoto|vectorstock|bigstockphoto|zumapress|imago-images)/i;

/** Đường dẫn ảnh có dấu hiệu watermark/preview. */
const WATERMARK_PATH = /(watermark|preview|comp\/|_comp_|-comp-)/i;

/**
 * Không phải ảnh báo chí: template tài liệu, clipart, icon, logo, vector, ảnh
 * mockup... Những thứ này lên khung hình là hỏng ngay (chữ Anh, nền trắng).
 */
const JUNK_PATH =
  /(template|clip-?art|\bicon\b|\blogo\b|vector|mockup|placeholder|illustration|cartoon|drawing|sample|diagram|infographic|thumb(nail)?_|\bsprite\b|favicon)/i;

/** Ảnh quá nhỏ / không phải ảnh chụp thì bỏ. */
const NON_PHOTO_EXT = /\.(svg|gif|ico|bmp)(\?|$)/i;

export function isJunkImage(url: string, sourcePage?: string): boolean {
  return JUNK_PATH.test(url) || NON_PHOTO_EXT.test(url) || (sourcePage ? JUNK_PATH.test(sourcePage) : false);
}

export function isWatermarked(url: string, sourcePage?: string): boolean {
  return (
    WATERMARK_HOSTS.test(url) ||
    WATERMARK_PATH.test(url) ||
    (sourcePage ? WATERMARK_HOSTS.test(sourcePage) : false)
  );
}

/** Domains that rarely yield a usable article lead image — skip them. */
const SKIP_HOSTS =
  /(youtube\.com|youtu\.be|facebook\.com|twitter\.com|x\.com|instagram\.com|tiktok\.com|pinterest\.|reddit\.com|alamy|shutterstock|dreamstime|istockphoto|gettyimages|123rf|depositphotos)/i;

/**
 * Gather ordered image candidates for a query. The caller downloads them in
 * order and keeps the first that succeeds.
 */
export async function searchImageCandidates(query: string, cfg: ImageSearchConfig): Promise<ImageHit[]> {
  const q = query.trim();
  if (!q) return [];
  const out: ImageHit[] = [];

  for (const src of cfg.order) {
    try {
      let hits: ImageHit[] = [];
      if (src === "articles") hits = await fromWebArticles(q);
      else if (src === "pexels" && cfg.pexelsKey) hits = await fromPexels(q, cfg.pexelsKey);
      else if (src === "unsplash" && cfg.unsplashKey) hits = await fromUnsplash(q, cfg.unsplashKey);
      else if (src === "duckduckgo") hits = await fromDuckDuckGo(q);
      else if (src === "openverse") hits = await fromOpenverse(q);
      else if (src === "wikimedia") hits = await fromWikimedia(q);
      const before = hits.length;
      hits = hits.filter((h) => !isWatermarked(h.url, h.sourcePage) && !isJunkImage(h.url, h.sourcePage));
      if (before > hits.length) log.info(`    [${src}] bỏ ${before - hits.length} ảnh watermark/template/clipart`);
      if (hits.length) {
        log.info(`    [${src}] ${hits.length} candidate(s)`);
        out.push(...hits);
        if (out.length >= 6) break;
      }
    } catch (e: any) {
      log.warn(`    image source [${src}] failed: ${e?.message ?? e}`);
    }
  }
  return out;
}

// ── ARTICLES: search → open results → og:image (the main behaviour) ──────────
async function fromWebArticles(q: string): Promise<ImageHit[]> {
  const html = (
    await axios.get("https://html.duckduckgo.com/html/", {
      params: { q },
      headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
      timeout: 20000,
      responseType: "text",
    })
  ).data as string;

  // collect result links (DuckDuckGo HTML wraps them in /l/?uddg=<encoded>)
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

  const hits: ImageHit[] = [];
  for (const link of links) {
    if (hits.length >= 5) break;
    try {
      const page = (
        await axios.get(link, {
          headers: { "User-Agent": UA, "Accept-Language": "vi,en;q=0.8" },
          timeout: 15000,
          responseType: "text",
          maxRedirects: 3,
          maxContentLength: 6_000_000,
        })
      ).data as string;
      const og = extractLeadImage(page, link);
      if (og) {
        let domain = "";
        try {
          domain = new URL(link).hostname.replace(/^www\./, "");
        } catch {
          /* ignore */
        }
        hits.push({ url: og, sourcePage: link, credit: domain, license: "web (check rights)" });
      }
    } catch {
      /* skip unreachable article */
    }
  }
  return hits;
}

/** Pull the article's main image: og:image → twitter:image → link rel=image_src. */
function extractLeadImage(html: string, base: string): string | null {
  const pats = [
    /<meta[^>]+property=["']og:image(?::secure_url|:url)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image(?::secure_url|:url)?["']/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["']/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["']/i,
  ];
  for (const p of pats) {
    const m = p.exec(html);
    if (m && m[1]) {
      const u = absolutize(m[1].trim(), base);
      if (u && /\.(jpe?g|png|webp)(\?|$)/i.test(u.split("?")[0] + (u.includes(".") ? "" : ""))) return u;
      if (u) return u; // many CDNs omit an extension; accept anyway
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

// ── DuckDuckGo image search (direct image results) ───────────────────────────
async function fromDuckDuckGo(q: string): Promise<ImageHit[]> {
  const html = (
    await axios.get("https://duckduckgo.com/", {
      params: { q, iar: "images", iax: "images", ia: "images" },
      headers: { "User-Agent": UA },
      timeout: 20000,
      responseType: "text",
    })
  ).data as string;
  const vqd =
    /vqd=["']([\d-]+)["']/.exec(html)?.[1] ??
    /vqd=([\d-]+)&/.exec(html)?.[1] ??
    /"vqd":"([\d-]+)"/.exec(html)?.[1];
  if (!vqd) return [];
  const r = await axios.get("https://duckduckgo.com/i.js", {
    params: { l: "us-en", o: "json", q, vqd, f: ",,,,,", p: "1" },
    headers: { "User-Agent": UA, Referer: "https://duckduckgo.com/", "x-requested-with": "XMLHttpRequest" },
    timeout: 20000,
  });
  const results: any[] = r.data?.results ?? [];
  return results
    .filter((x) => x.image && x.width >= 900 && x.height >= 600)
    // ảnh chụp (jpg) đứng trước đồ hoạ (png), ảnh to đứng trước
    .sort((a, b) => {
      const photo = (u: string) => (/\.jpe?g(\?|$)/i.test(u) ? 0 : 1);
      return photo(a.image) - photo(b.image) || (b.width ?? 0) - (a.width ?? 0);
    })
    .slice(0, 5)
    .map((x) => {
      let credit = "";
      try {
        credit = new URL(x.url ?? x.image).hostname.replace(/^www\./, "");
      } catch {
        /* ignore */
      }
      return { url: x.image, sourcePage: x.url, credit, license: "web (check rights)" };
    });
}

// ── Openverse (no key, CC) ───────────────────────────────────────────────────
async function fromOpenverse(q: string): Promise<ImageHit[]> {
  const r = await axios.get("https://api.openverse.org/v1/images/", {
    params: { q, page_size: 6, size: "large", mature: "false" },
    headers: { "User-Agent": UA },
    timeout: 20000,
  });
  return (r.data?.results ?? []).slice(0, 5).map((p: any) => ({
    url: p.url,
    sourcePage: p.foreign_landing_url,
    credit: `${p.source ?? "Openverse"} — ${p.creator ?? "unknown"}`,
    license: `${(p.license ?? "").toUpperCase()} ${p.license_version ?? ""}`.trim(),
  }));
}

// ── Wikimedia Commons (no key) ───────────────────────────────────────────────
async function fromWikimedia(q: string): Promise<ImageHit[]> {
  const r = await axios.get("https://commons.wikimedia.org/w/api.php", {
    params: {
      action: "query",
      generator: "search",
      gsrsearch: `filetype:bitmap ${q}`,
      gsrnamespace: 6,
      gsrlimit: 6,
      prop: "imageinfo",
      iiprop: "url|extmetadata",
      iiurlwidth: 1080,
      format: "json",
      origin: "*",
    },
    headers: { "User-Agent": UA },
    timeout: 20000,
  });
  const pages = r.data?.query?.pages ?? {};
  return Object.values(pages)
    .map((pg: any) => pg?.imageinfo?.[0])
    .filter(Boolean)
    .slice(0, 5)
    .map((info: any) => ({
      url: info.thumburl ?? info.url,
      sourcePage: info.descriptionurl,
      credit: "Wikimedia Commons",
      license: info.extmetadata?.LicenseShortName?.value,
    }));
}

// ── Pexels / Unsplash (need keys) ────────────────────────────────────────────
async function fromPexels(q: string, key: string): Promise<ImageHit[]> {
  const r = await axios.get("https://api.pexels.com/v1/search", {
    params: { query: q, per_page: 6, orientation: "portrait" },
    headers: { Authorization: key, "User-Agent": UA },
    timeout: 20000,
  });
  return (r.data?.photos ?? []).slice(0, 5).map((p: any) => ({
    url: p.src?.large2x ?? p.src?.large ?? p.src?.portrait ?? p.src?.original,
    sourcePage: p.url,
    credit: `Pexels — ${p.photographer ?? "unknown"}`,
    license: "Pexels License",
  }));
}

async function fromUnsplash(q: string, key: string): Promise<ImageHit[]> {
  const r = await axios.get("https://api.unsplash.com/search/photos", {
    params: { query: q, per_page: 6, orientation: "portrait" },
    headers: { Authorization: `Client-ID ${key}`, "User-Agent": UA },
    timeout: 20000,
  });
  return (r.data?.results ?? []).slice(0, 5).map((p: any) => ({
    url: p.urls?.regular ?? p.urls?.full,
    sourcePage: p.links?.html,
    credit: `Unsplash — ${p.user?.name ?? "unknown"}`,
    license: "Unsplash License",
  }));
}
