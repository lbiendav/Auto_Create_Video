# MAI Crypto theme — image-driven news shorts (@oncoinx2 style)

This project can now render videos in the clean, **image-driven** style of the
TikTok channel `@oncoinx2` (Oncoin X / "Tổng hợp bởi MoneyF"), rebranded as
**MAI Crypto** with the sun logo in `assets/avatar.png`.

It ships as a selectable **theme** on top of the existing pipeline:

| Theme | What it looks like |
|---|---|
| `maicrypto` *(default)* | Each beat is a relevant **image** (blurred fill + Ken Burns) or a finance **candlestick** hook. Minimal chrome: a top‑center dynamic source credit + the sun logo / wordmark. **No** karaoke captions, ticker, or breaking bar. White‑flash cuts. Sun‑branded outro card. |
| `broadcast` | The original neon "broadcast" look (text cards, ticker, karaoke captions, TikTok follow card). |

Switch with the `VIDEO_THEME` env var (`maicrypto` is the default).

---

## How it maps to @oncoinx2

| @oncoinx2 element | MAI Crypto implementation |
|---|---|
| "Tổng hợp bởi MoneyF" top credit | `mc-credit`, **dynamic**: `"<creditPrefix> <source>"` e.g. *Tổng hợp bởi VnExpress* (from `metadata.source.name`/`domain`) |
| "oncoin X" logo top‑right | sun logo (`assets/avatar.png`) + `BRAND_NAME` wordmark |
| Faint centre watermark | `mc-watermark` (logo + name, low opacity) |
| Opening title card (chart bg + big headline + price levels) | `finance-hook` template (animated candlesticks + drifting coins + price tags + slam‑in headline + badge) |
| Photo beats (blurred fill + subtle zoom) | `image` template (blurred cover fill + letterboxed photo + Ken Burns) |
| Document / evidence shots | `document` template (full, readable image + label chip) |
| White fade between shots | GSAP white‑flash on every cut |
| MoneyF end card | `brand-outro` (sun + MAI Crypto + handle + CTA + source) |

---

## Quick start

```bash
# 1) configure (once) — copy .env.example to .env.local and fill TTS keys
#    VIDEO_THEME=maicrypto is the default; branding defaults to MAI Crypto.

# 2) render the bundled sample
npm run pipeline -- output/sample-maicrypto/script.json

# 3) outputs land next to the script:
#    output/sample-maicrypto/video.mp4   ← the 9:16 video
#    output/sample-maicrypto/voice.mp3   ← voiceover (for CapCut)
#    output/sample-maicrypto/script.txt  ← transcript (for CapCut auto‑caption)
```

### See the look without rendering (no API keys)

```bash
npx tsx scripts/gen-preview.ts          # writes output/preview/index.html
```
Open `output/preview/index.html` in any browser — it autoplays the theme with
placeholder images so you can review layout/motion instantly.

---

## Configuration (env)

```bash
VIDEO_THEME=maicrypto              # or "broadcast"
BRAND_NAME=MAI Crypto              # wordmark (top-right + outro)
BRAND_HANDLE=@maicrypto            # shown on outro card
BRAND_LOGO_FILE=avatar.png         # logo in assets/ (the sun); jpg/png/webp/svg
BRAND_CREDIT_PREFIX=Tổng hợp bởi   # → "Tổng hợp bởi <source>" top-center

# Per-scene AI image generation (free, no key — Pollinations)
IMAGEGEN_ENABLED=1
IMAGEGEN_ENDPOINT=https://image.pollinations.ai/prompt
IMAGEGEN_STYLE=cinematic editorial news illustration, dramatic lighting, high detail, 9:16 vertical, realistic
```

The **source credit is dynamic per video**: set `metadata.source.name` (e.g.
`"VnExpress"`, `"CafeF"`) in the script and it appears as *Tổng hợp bởi VnExpress*.
If omitted, the domain is used.

---

## Script format (image-driven)

Same top‑level `script.json` as before, but body scenes use the new templates and
each scene carries an `image` (a URL, a local path, or an AI‑generation `prompt`).
Full working example: [`output/sample-maicrypto/script.json`](../output/sample-maicrypto/script.json).

### Scene templates

**`finance-hook`** — the opening (scene 1, `type: "hook"`):
```json
{
  "id": "1", "type": "hook",
  "voiceText": "Bitcoin vừa lao dốc, thủng mốc chín mươi nghìn đô chỉ trong một đêm.",
  "templateData": {
    "template": "finance-hook",
    "headline": "BITCOIN THỦNG MỐC 90.000 ĐÔ CHỈ SAU MỘT ĐÊM",
    "badge": "TIN NÓNG",
    "theme": "finance",               
    "trend": "down",                  
    "priceTags": [
      { "label": "BTC", "value": "89.420$", "tone": "down" },
      { "label": "24H", "value": "-8,4%",  "tone": "down" },
      { "label": "VÀNG", "value": "5.500$", "tone": "up" }
    ]
  },
  "image": { "prompt": "falling red bitcoin candlestick chart, shattered gold coin, crisis mood" }
}
```
- `theme`: always `"finance"` — a single unified tint for finance/economy/crypto/stocks (blue-teal candlesticks + market glyphs).
- `trend`: `up` | `down` | `mixed` (candle bias)
- `priceTags`: 0–5 floating levels; `tone` = `up` (green) / `down` (red) / `neutral`
- `image` is optional here (adds a subject figure); omit for a pure chart backdrop.

**`image`** — the workhorse body beat (`type: "body"`):
```json
{
  "id": "2", "type": "body",
  "voiceText": "Các cá voi lớn đã bán tháo hơn mười hai nghìn Bitcoin.",
  "templateData": { "template": "image", "label": "Cá voi bán tháo" },
  "image": { "prompt": "giant whale over a sea of red charts", "kenBurns": "pan-right" }
}
```
- `label` (optional): a small caption strip. `headline` (optional): a bold overlay line.
- `image.fit`: `contain` (default, letterboxed like @oncoinx2) or `cover` (full‑bleed).
- `image.kenBurns`: `zoom-in` | `zoom-out` | `pan-left` | `pan-right` (vary per scene).

**`document`** — evidence / screenshot (`type: "body"`):
```json
{
  "id": "4", "type": "body",
  "voiceText": "Dữ liệu on-chain cho thấy dòng tiền rút khỏi các sàn.",
  "templateData": { "template": "document", "label": "Dữ liệu on-chain 24 giờ" },
  "image": { "prompt": "crypto exchange outflow dashboard screenshot, red bars, dark UI" }
}
```

**`brand-outro`** — the closing card (last scene, `type: "outro"`):
```json
{
  "id": "7", "type": "outro",
  "voiceText": "Theo dõi MAI Crypto để không bỏ lỡ tin nóng mỗi ngày.",
  "templateData": {
    "template": "brand-outro",
    "cta": "Theo dõi để cập nhật tin nóng mỗi ngày",
    "channelName": "MAI Crypto",
    "handle": "@maicrypto",
    "source": "vnexpress.net"
  }
}
```

### Per-scene images: four ways (real photos preferred)

0. **Real photo from related articles** (recommended — looks real): give the
   scene a `"image": { "query": "cambodia scam compound" }`. The pipeline
   **searches the web, opens the top related articles, and pulls each article's
   own lead image** (og:image) — e.g. the photo VnExpress/CafeF used. It keeps
   the first that downloads and logs the source domain so you can credit it
   ("Ảnh: vnexpress.net"). Order = `articles → duckduckgo → openverse → wikimedia`
   (+ Pexels/Unsplash if you add a free key). Override with `IMAGE_SOURCE`.
   You are responsible for the licensing of images you publish.
1. **AI‑generate** (matches @oncoinx2's illustrated look):
   `"image": { "prompt": "..." }` → generated free via Pollinations into
   `images/scene-<id>.jpg`.
2. **Direct URL**: `"image": { "src": "https://…/photo.jpg" }` (e.g. the article's photo).
3. **Local file**: `"image": { "src": "images/my-shot.png" }` (relative to the output dir) or an absolute path.

Each fetched image also gets a pre‑blurred companion (`…-blur.jpg`) used as the
cover fill behind the letterboxed photo. Images are cached — delete the file to
force a re‑fetch.

> **Vietnamese TTS note:** the number/phonetic rules in
> `.claude/skills/create-news-video/SKILL.md` still apply to every `voiceText`
> (spell numbers out: `90.000` → *chín mươi nghìn*, etc.). On‑screen text
> (`headline`, `priceTags`, `label`) keeps normal formatting.

---

## What changed in the codebase

| File | Change |
|---|---|
| `src/config.ts` | `VIDEO_THEME`, `brand`, `imageGen` config |
| `src/render/script-schema.ts` | new templates (`finance-hook`, `image`, `document`, `brand-outro`) + per‑scene `image` + `source.name` |
| `src/render/maicrypto-composer.ts` | new image‑driven composer + minimal shell |
| `src/render/templates/maicrypto/` | `base.html.tmpl`, `styles.css`, `animations.js` |
| `src/assets/scene-images.ts` | per‑scene image resolve (URL / local / AI) + pre‑blur |
| `src/pipeline.ts` | theme branch: resolves scene images, copies logo, picks composer/assets |
| `scripts/gen-preview.ts` | no‑API self‑contained preview generator |

The original `broadcast` theme is untouched and still available via
`VIDEO_THEME=broadcast`.
