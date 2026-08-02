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
| Opening card | **`hook-split`** *(mặc định — dựng theo đúng khung mở đầu của @oncoinx2)*: nửa trên ảnh chủ đề (chủ thể cắt rời tràn qua ranh giới), nửa dưới nền tối + quầng sáng thương hiệu, logo kênh lớn, CÂU TÓM TẮT in hoa, đáy có coin + sóng mờ |
| Opening card (phương án 2) | `hook-collage` — 2–3 ảnh ghép chia phần bằng đường vàng + panel thương hiệu (badge + kicker + headline slam + price tags). `finance-hook` vẫn dùng được cho nền nến. |
| Beat có tư liệu động | **`video`** per‑scene: clip lấy từ trang liên quan / stock, ffmpeg chuẩn hoá 1080×1920 đúng độ dài beat |
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

## Design system (v2 — "Gold Terminal")

Toàn bộ màu/typography nằm trong `:root` của `src/render/templates/maicrypto/styles.css`
— đổi 1 biến là đổi cả video.

| Token | Giá trị | Dùng cho |
|---|---|---|
| `--ink` / `--paper` / `--surface` | `#05070C` / `#0B0F17` / `#121A27` | 3 tầng nền (đáy → panel → thẻ nổi) |
| `--brand` / `--brand-hi` / `--brand-lo` | `#FFB020` / `#FFD75E` / `#C8811A` | mặt trời MAI CRYPTO: wordmark, đường chia collage, gạch vàng panel, chữ nhấn |
| `--up` / `--down` | `#0ECB81` / `#F6465D` | tăng/giảm giá, badge TIN NÓNG, chip CLIP |
| `--cool` | `#4C8DFF` | chiều sâu, dùng rất tiết chế |
| `--fg` / `--fg-2` / `--fg-3` | trắng 100 / 74 / 46 % | 3 cấp chữ |
| `--pad-x` `--safe-top` `--safe-bot` | 56 / 200 / 190 px | gutter + vùng an toàn tránh UI TikTok |

Chữ: **Be Vietnam Pro** (an toàn dấu tiếng Việt) cho mọi chữ Việt, **Barlow Condensed**
cho số/giá. Headline tự co theo độ dài (`data-size` = xl/l/m/s) nên tiêu đề dài
không bao giờ tràn khỏi panel.

---

### Scene templates

**`hook-split`** — khung mở đầu chia đôi *(mặc định cho scene 1)*:
```json
{
  "id": "1", "type": "hook",
  "voiceText": "…câu hook nói tiếng Việt…",
  "templateData": {
    "template": "hook-split",
    "summary": "SÁNG NAY 28/7, BITCOIN THỦNG MỐC 90.000 ĐÔ CHỈ SAU MỘT ĐÊM, NHÀ ĐẦU TƯ NÍN THỞ CHỜ QUAN SÁT",
    "splitAt": 0.51,
    "panelTone": "brand",
    "showWordmark": true,
    "badge": "TIN NÓNG",
    "kicker": "THỊ TRƯỜNG · 28/07",
    "highlight": ["90.000", "ĐÔ"],
    "priceTags": [{ "label": "BTC", "value": "89.420$", "tone": "down" }]
  },
  "image":  { "query": "bitcoin price crash red chart trader", "fit": "cover" },
  "images": [{ "query": "crypto trader portrait", "fit": "contain" }]
}
```
- `image` = ảnh nền nửa trên; `images[0]` = **chủ thể cắt rời** trồi lên và tràn
  qua ranh giới xuống khối dưới (bỏ trống cũng được).
- `summary` = câu tóm tắt in hoa (tối đa 220 ký tự, tự co cỡ chữ: 66 → 44px).
- `splitAt` = vị trí đường chia (0.42–0.62). `panelTone` = `brand` (vàng, mặc định)
  | `emerald` | `crimson` | `dark`.
- `showWordmark` = hiện logo + tên kênh cỡ lớn ngay đầu khối dưới.
- Chuyển động: chủ thể trồi lên → khối dưới trượt lên + quầng sáng bừng →
  logo kênh trượt vào → badge dập → câu tóm tắt chạy từng chữ → coin trôi chậm.

**`hook-collage`** — khung mở đầu ghép 2–3 ảnh *(phương án 2)*:
```json
{
  "id": "1", "type": "hook",
  "voiceText": "Bitcoin vừa lao dốc, thủng mốc chín mươi nghìn đô chỉ trong một đêm.",
  "templateData": {
    "template": "hook-collage",
    "badge": "TIN NÓNG",
    "kicker": "THỊ TRƯỜNG · 24 GIỜ QUA",
    "headline": "BITCOIN THỦNG MỐC 90.000 ĐÔ SAU MỘT ĐÊM",
    "highlight": ["90.000", "ĐÔ"],
    "layout": "auto",
    "cellLabels": ["Sàn giao dịch", "Cá voi bán tháo", "Vàng lập đỉnh"],
    "priceTags": [
      { "label": "BTC", "value": "89.420$", "tone": "down" },
      { "label": "24H", "value": "-8,4%",  "tone": "down" }
    ]
  },
  "images": [
    { "query": "bitcoin price crash red chart", "fit": "cover", "kenBurns": "zoom-in" },
    { "query": "crypto trader screens panic",   "fit": "cover", "kenBurns": "pan-right" },
    { "query": "gold bars record high",         "fit": "cover", "kenBurns": "zoom-out" }
  ]
}
```
- `images[]` (2–3 phần tử) = các ô ảnh; thiếu thì rơi về `image` đơn.
- `layout`: `auto` (2 ảnh → `duo-diagonal`, 3 ảnh → `trio-stack`) | `duo-diagonal`
  | `duo-stack` | `trio-stack` | `trio-column`.
- `highlight`: các từ được tô **vàng brand** trong headline (bỏ dấu câu khi so khớp).
- `kicker`: dòng nhỏ in hoa cạnh badge (chuyên mục / ngày).
- Chuyển động: ô ảnh lắp vào lệch nhau → đường vàng vẽ ra → panel trượt lên →
  badge dập → headline slam từng chữ → price tags bật lên.

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

### Per-scene VIDEO: tích hợp clip vào beat

Bất kỳ scene nào cũng có thể mang thêm `video`. Clip được tải về, rồi **ffmpeg
chuẩn hoá**: 1080×1920, tắt tiếng, fps cố định, cắt/loop **đúng bằng độ dài beat**,
và nền mờ được nướng sẵn vào file (trình duyệt không phải blur từng frame).

```json
{
  "id": "3", "type": "body",
  "voiceText": "Sàn giao dịch ghi nhận dòng tiền rút ra mạnh nhất kể từ đầu năm.",
  "templateData": { "template": "image", "headline": "DÒNG TIỀN RÚT MẠNH NHẤT NĂM" },
  "video": { "query": "stock market trading floor screens", "fit": "contain", "chip": "CLIP" }
}
```

| Trường | Ý nghĩa |
|---|---|
| `query` | từ khoá → tìm clip theo thứ tự **Pexels → Pixabay → Wikimedia Commons → quét trang tin** (`og:video` / `<video>` / link `.mp4`) |
| `src` | URL mp4 trực tiếp, hoặc file local (đường dẫn tương đối trong thư mục output) |
| `startSec` | điểm cắt vào trong clip gốc |
| `fit` | `contain` (mặc định — chủ thể nằm giữa trên nền mờ) hoặc `cover` (tràn khung) |
| `speed` | 0.25–2 (0.5 = slow‑mo) |
| `chip` | chữ trong marker đỏ nhỏ (vd `"CLIP"`), bỏ trống thì không hiện |

Ưu tiên nguồn đặt bằng `SCENE_VIDEO_SOURCE` (mặc định `pexels` → `pixabay` →
`wikimedia` → `articles`; hai nguồn đầu cần key miễn phí); tắt toàn bộ bằng `SCENE_VIDEO_ENABLED=0`. Clip thô được
cache tại `videos/raw-scene-<id>.mp4` — xoá file đó để tải lại. Nếu không tìm
được clip nào, scene tự động quay về dùng ảnh tĩnh. **Bạn chịu trách nhiệm về
bản quyền của mọi tư liệu đăng tải** — mỗi clip đều được log kèm nguồn.

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
| `src/assets/scene-images.ts` | per‑scene image resolve (URL / local / AI) + pre‑blur + **cell images cho collage** |
| `src/assets/video-search.ts` | **mới** — tìm clip trên trang liên quan / Pexels / Pixabay / Coverr |
| `src/assets/scene-videos.ts` | **mới** — tải + chuẩn hoá clip bằng ffmpeg đúng độ dài beat + poster |
| `src/pipeline.ts` | theme branch: resolves scene images, copies logo, picks composer/assets |
| `scripts/gen-preview.ts` | no‑API self‑contained preview generator |

The original `broadcast` theme is untouched and still available via
`VIDEO_THEME=broadcast`.
