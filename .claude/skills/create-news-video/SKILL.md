---
name: create-news-video
description: Tạo video tin tức ngắn 9:16 (~60s) từ URL bài báo hoặc file .txt tiếng Việt. Mặc định theme "maicrypto" — phong cách ảnh (@oncoinx2 / MAI Crypto): mỗi cảnh là 1 ảnh minh hoạ (hoặc AI-gen), nền chart nến ở hook, credit nguồn động, không phụ đề. Trigger khi user yêu cầu tạo video tin tức, short news, bản tin video, TikTok tin tức, video kiểu oncoinx / MAI Crypto. Output: video.mp4 + voice.mp3 + script.txt cho CapCut.
---

# Create News Video Skill

Generate a Vietnamese 9:16 motion-graphic news video from a URL or .txt file.

---

## ⭐ DEFAULT MODE: image-driven (MAI Crypto / @oncoinx2 style)

The pipeline defaults to `VIDEO_THEME=maicrypto`. In this mode the video is
**image-driven and minimal** — matching the `@oncoinx2` channel:

- Every beat shows a **relevant image** (blurred fill + Ken Burns) — NOT text cards.
  A beat can also carry a real **video clip** (`video: { query }`) pulled from
  related pages/stock and auto-normalised to the beat length.
- The opening is a **hook-split** (mặc định): nửa trên là ảnh chủ đề với chủ thể
  cắt rời tràn qua ranh giới, nửa dưới là nền tối + quầng sáng thương hiệu chứa
  logo kênh cỡ lớn và CÂU TÓM TẮT in hoa. (`hook-collage` ghép 2–3 ảnh và
  `finance-hook` nền nến vẫn dùng được.)
- Only chrome: top-center **dynamic source credit** (`Tổng hợp bởi <source>`) and the
  sun logo + `MAI Crypto` wordmark. **No karaoke captions, no ticker.**
- Closes on a sun-branded **outro** card.

**So when authoring `script.json` for this mode, use these templates and give each
scene an `image` (a `prompt` to AI-generate, or a `src` URL/path):**

| Scene | `type` | `templateData.template` | media |
|---|---|---|---|
| 1 (opening) | `hook` | **`hook-split`** (or `hook-collage` / `finance-hook`) | `image` = nền, `images[0]` = chủ thể cắt rời |
| 2…N (body) | `body` | `image` (default) or `document` | **yes** (`image`; thêm `video` nếu muốn clip) |
| last | `outro` | `brand-outro` | no |

Opening shape (mặc định — hook-split):
```json
{ "id": "1", "type": "hook",
  "voiceText": "…câu hook nói tiếng Việt…",
  "templateData": {
    "template": "hook-split",
    "summary": "CÂU TÓM TẮT IN HOA, CÓ THỂ DÀI 1-3 DÒNG Ý",
    "badge": "TIN NÓNG",
    "kicker": "CHUYÊN MỤC · NGÀY",
    "highlight": ["TỪ", "NHẤN"],
    "priceTags": [{ "label": "BTC", "value": "89.420$", "tone": "down" }]
  },
  "image":  { "query": "english keywords for the background photo", "fit": "cover" },
  "images": [{ "query": "english keywords for the cut-out subject", "fit": "contain" }] }
```

Opening shape (phương án 2 — collage):
```json
{ "id": "1", "type": "hook",
  "voiceText": "…câu hook nói tiếng Việt…",
  "templateData": {
    "template": "hook-collage",
    "badge": "TIN NÓNG",
    "kicker": "THỊ TRƯỜNG · 24 GIỜ QUA",
    "headline": "TIÊU ĐỀ IN HOA NGẮN GỌN",
    "highlight": ["TỪ", "NHẤN"],
    "cellLabels": ["Chú thích ô 1", "Chú thích ô 2", "Chú thích ô 3"],
    "priceTags": [{ "label": "BTC", "value": "89.420$", "tone": "down" }]
  },
  "images": [
    { "query": "english keywords for photo 1", "fit": "cover", "kenBurns": "zoom-in" },
    { "query": "english keywords for photo 2", "fit": "cover", "kenBurns": "pan-right" },
    { "query": "english keywords for photo 3", "fit": "cover", "kenBurns": "zoom-out" }
  ] }
```

Beat có clip (tuỳ chọn, dùng cho 1–2 beat mạnh nhất):
```json
"video": { "query": "english keywords for the footage", "fit": "contain", "chip": "CLIP" }
```

Minimal per-scene shape:
```json
{ "id": "2", "type": "body",
  "voiceText": "…câu văn nói tiếng Việt (số viết chữ)…",
  "templateData": { "template": "image", "label": "(tuỳ chọn) chú thích ngắn" },
  "image": { "prompt": "english scene description for the illustration", "kenBurns": "pan-right" } }
```

Set `metadata.source.name` (e.g. `"VnExpress"`) so the credit reads
*Tổng hợp bởi VnExpress*. Write good `image.prompt`s in English describing a
photo/illustration for that beat (people, gold bars, charts, screenshots…).

**Full spec + a complete example:** see `docs/MAI-CRYPTO-THEME.md` and the ready
sample `output/sample-maicrypto/script.json`. The Vietnamese TTS number/phonetic
rules below STILL APPLY to every `voiceText`.

> The older text-card look (comparison / stat-hero / feature-list / callout / chart +
> karaoke captions + ticker) is still available via `VIDEO_THEME=broadcast` and is
> what the rest of this document describes.

### ⚠️ "fit": "cover" TRÊN ẢNH NGANG = MẤT CHỮ

`cover` phóng ảnh lấp đầy khung 1080×1920 rồi CẮT. Ảnh ngang (ảnh báo, biểu đồ,
logo, screenshot) mất 60–70% bề ngang — chữ trong ảnh đứt cả hai đầu.

- Cảnh **body**: LUÔN để mặc định (`contain`). Đừng ghi `"fit": "cover"`.
- Cảnh **hook**: `cover` OK **chỉ khi ảnh lấy từ `query`** (ảnh chụp thật,
  không có chữ trong ảnh). Ảnh chụp cắt 68% bề ngang vẫn ra hình đẹp.
- ⛔ **`"src"` (ảnh og của bài báo) thì BẮT BUỘC `contain`**, kể cả ở hook.
  Ảnh og gần như luôn là title-card 16:9 có dòng tiêu đề NUNG SẴN trải hết bề
  ngang — không khung cắt 9:16 nào giữ nổi. Riêng `hook-split` nghe tên tưởng
  ảnh chỉ chiếm nửa trên, nhưng ảnh trải NGUYÊN khung, panel chữ chỉ phủ từ
  `splitAt` (~0.51) xuống nên nửa trên là ảnh trần, cắt bao nhiêu thấy hết.

Pipeline tự chuyển cover-ảnh-ngang về `contain` và `log.warn` (áp dụng cho
body, và cho hook-split khi ảnh đến từ `src`), nhưng viết đúng từ đầu vẫn hơn.

### 🚨 ĐỌC KỸ TRƯỚC KHI DÙNG PHẦN CÒN LẠI CỦA TÀI LIỆU NÀY

`VIDEO_THEME` mặc định là **`maicrypto`**, và `.env` hiện KHÔNG đặt biến này —
nghĩa là mọi lần chạy đều là maicrypto. Trong theme đó, `maicrypto-composer.ts`
CHỈ vẽ riêng 6 template:

    hook-split · hook-collage · finance-hook · image · document · brand-outro

Mọi template khác rơi vào nhánh fallback. JSON vẫn hợp lệ, pipeline KHÔNG báo
lỗi, nhưng hình ra không phải thứ tài liệu này mô tả:

| Template | Thực tế trong theme maicrypto |
|---|---|
| `stat-hero` | → ảnh + headline `"value — label"`. Trường `context` **bị bỏ** |
| `callout` | → ảnh + headline = `statement`. Trường `tag` **bị bỏ** |
| `comparison` | → nhánh `default:` → ảnh **KHÔNG có chữ nào**. Dữ liệu **mất sạch** |
| `chart` | → không có layout riêng; `points` không được vẽ |
| `feature-list` | → không có layout riêng; các `bullets` không hiện |

⇒ Muốn một con số lớn hay một câu trích dẫn trong theme maicrypto: dùng
`{"template":"image","headline":"..."}`. Nó cho đúng kết quả đó và không âm thầm
nuốt mất trường nào.

⇒ Các mục bên dưới mô tả template `chart`, `stat-hero`, `ticker`, karaoke
captions… CHỈ đúng khi bạn đặt `VIDEO_THEME=broadcast` trong `.env`.

---

## Input

Single argument: a news article URL (starts with `http://` or `https://`) OR a path to a `.txt` file.

## Workflow (MUST follow these steps in order)

### Step 1: Detect input type

- Starts with `http://` or `https://` → URL mode
- Otherwise → file mode

### Step 2: Fetch content

**URL mode:**
- Use `WebFetch` with prompt:
  ```
  Trích xuất từ trang này:
  - title (string): tiêu đề bài báo
  - content (string): nội dung chính, ~500-1500 từ
  - ogImage (string|null): URL ảnh og:image (meta og:image hoặc ảnh đầu bài)
  - domain (string): domain của URL (vd "vnexpress.net")
  Trả về JSON với 4 field trên.
  ```
- If WebFetch fails (paywall, JS-rendered, 4xx) → tell user to save content to a .txt file and pass that instead. Stop.

**File mode:**
- Use `Read` to read the .txt file
- Title = first non-empty line (strip whitespace, max 80 chars)
- Content = remaining lines joined
- ogImage = `null`
- domain = `"local"`

### Step 3: Create slug + output directory

- slug = lowercase ASCII (strip Vietnamese diacritics, đ→d), replace non-alphanumeric with `-`, trim dashes, max 40 chars
- timestamp = current local time as `YYYYMMDD-HHmm`
- outputDir = `output/<slug>-<timestamp>/`
- Use Bash: `mkdir -p <outputDir>`

### Step 4: Generate script.json

Following the schema in `docs/superpowers/specs/2026-04-29-auto-news-video-design.md` Section 4. Key rules:

**Script content (Vietnamese):**
- Total voiceText: ~150–200 words → ~55–65s spoken at speed 1.0
- Number of scenes: **5–8** (1 hook + 3–6 body + 1 outro)
- Each scene voiceText is 1-3 short sentences, văn nói (spoken style, not formal)
- No emoji, no markdown in voiceText

**⏱ OUTRO CHỈ ĐƯỢC CHỨA CÂU KÊU GỌI — KHÔNG BAO GIỜ CHỨA NỘI DUNG TIN.**

Thời lượng mỗi scene = ĐÚNG độ dài giọng đọc của scene đó. Thẻ outro là hình
tĩnh (logo + tên kênh), nên mỗi giây lời thoại thừa trong outro là một giây khán
giả nhìn logo đứng yên — cảm giác video đã hết mà vẫn còn người nói.

- `voiceText` của outro: **tối đa ~12 từ**, chỉ một câu CTA.
  > ✓ "Theo dõi MAI CRYPTO để không bỏ lỡ tin nóng mỗi ngày."
  > ✗ "Hồi tháng Năm, toà bác đơn kiện 150 tỷ đô… Theo dõi MAI CRYPTO." ← 9 giây logo đứng hình

- Còn dữ kiện chưa nói hết? **Thêm scene body** có `image` hoặc `video`, đừng dồn
  vào outro. Schema cho tới 12 scene — cứ dùng. Nói hết nội dung rồi mới sang outro.

Pipeline sẽ `log.warn` nếu giọng đọc outro vượt 6 giây.

### 🎭 VĂN PHONG: hài hước kiểu Việt (BẮT BUỘC cho mọi `voiceText`)

Tham chiếu: kênh TikTok **@geoscope22**. Giọng ở đây KHÔNG phải meme Gen-Z,
cũng không phải dí dỏm nhẹ nhàng — mà là **cà khịa + chơi chữ thành ngữ Việt**.

**Bốn kỹ thuật lấy từ kênh tham chiếu:**

1. **Mở bằng vế đùa, rồi mới tới tin.** Vế đầu là cú móc, vế sau là dữ kiện.
   > "Bố gây chiến, con vào lệnh: Barron Trump lãi gần ba tỷ đô từ dầu mỏ."

2. **Chơi chữ với thành ngữ / tục ngữ / tên tác phẩm quen thuộc.**
   > "Tắt đèn của Ngô Tất Tố" (cho tin cắt điện) · "nghịch ngu có thưởng"
   > · "úp bô" · "sờ gáy" · "gậy ông đập lưng ông" · "già néo đứt dây"

3. **Nói giảm mỉa mai, bỏ lửng.** Sức nặng nằm ở chỗ không nói ra.
   > "…và sau đó thì, à mà thôi, không còn sau đó nữa."

4. **Từ dân dã thay từ báo chí.** "bốc hơi" thay "sụt giảm", "ôm hàng" thay
   "nắm giữ", "gồng lỗ" thay "chịu thua lỗ", "toang" thay "thất bại".

**Liều lượng — quan trọng hơn kỹ thuật:**

- **Tối đa MỘT cú đùa mỗi scene.** Đùa liên tục thì nhàm và chôn mất tin.
- **Hook và outro gánh phần hài.** Các scene giữa mang số liệu nặng thì viết
  rõ ràng — người xem cần hiểu con số, không cần cười thêm lần nữa.
- Nếu tin có người chết, thiên tai, hoặc nạn nhân cụ thể → **bỏ hài, viết thẳng.**

**Ba lằn ranh KHÔNG được vượt:**

1. **Không bịa lời thoại gán cho người thật.** Chỉ dùng phát ngôn có trong bài.
   Đây là ranh giới giữa cà khịa và vu khống.
2. **Không đùa lên ngoại hình, gia đình, đời tư.** Cà khịa vào *hành động và
   logic* của nhân vật, không vào con người họ.
3. **Số liệu tuyệt đối không được bẻ cong để câu đùa đắt hơn.** Nếu câu đùa chỉ
   hay khi làm tròn 63,4 thành 60 thì bỏ câu đùa, giữ con số.

**Phạm vi:** hài chỉ nằm ở `voiceText`. Chữ trên màn hình (`summary`,
`headline`, `label`) giữ nghiêm túc, đúng số liệu. Tương phản giữa lời đọc tếu
và chữ hiện nghiêm khiến câu đùa đắt hơn, đồng thời giữ được độ tin cậy.

**Ví dụ — cùng một dữ kiện:**

```
✗ Khô (trước):
  "Strategy đã năm tuần liên tiếp không mua Bitcoin, thay vào đó tăng dự trữ
   tiền mặt lên ba phẩy bảy lăm tỷ đô."

✓ Có giọng:
  "Năm tuần rồi, ví của Saylor vẫn im như thóc. Tiền thì vẫn về, ba phẩy bảy
   lăm tỷ đô nằm đó, mà Bitcoin thì không thấy mua thêm đồng nào."
```

```
✗ Quá đà (bịa số cho vui, gán ý nghĩ cho người thật):
  "Saylor giờ chắc đang ôm mặt khóc vì lỗ chục tỷ đô."

✓ Đúng liều (cà khịa vào logic, số liệu giữ nguyên):
  "Bán cổ phiếu của mình, để mua lại cổ phiếu của mình. Logic thì hơi vòng,
   nhưng kho Bitcoin vẫn đang âm tám phẩy năm tỷ đô."
```

### ⚠️ CRITICAL: Vietnamese TTS Phonetic Rules

The `voiceText` field is read aloud by LucyLab/ElevenLabs Vietnamese TTS. **Numbers and symbols are read literally** — if you write "5.5", TTS may say "năm rưỡi" (five and a half — WRONG for version numbers). **Always spell out numbers in Vietnamese phonetic form** in `voiceText`. The `templateData` fields (visual text on screen) can keep the original "5.5" / "82.7%" formatting.

**Mandatory rules for `voiceText`:**

| Number form | WRONG (TTS misreads) | RIGHT (spell out in Vietnamese) |
|---|---|---|
| Decimal version | `GPT 5.5` → "năm rưỡi" ❌ | `GPT năm chấm năm` ✅ |
| Decimal stat | `82.7%` | `tám mươi hai phẩy bảy phần trăm` |
| Version | `iPhone 17` | `iPhone mười bảy` (or `iPhone 17` works for whole numbers) |
| Version with point | `iOS 18.2` | `iOS mười tám chấm hai` |
| Tech spec | `200MP` | `hai trăm megapixel` |
| Battery | `5000mAh` | `năm nghìn miliampe giờ` |
| Tokens | `1M tokens` / `1000000 tokens` | `một triệu token` |
| Price VND | `21 triệu đồng` | `hai mươi mốt triệu đồng` |
| Price USD | `$5` | `năm đô la` (or `năm đô`) |
| Multiplier | `2x` | `gấp đôi` (more natural than "hai lần") |
| Year | `2026` | `hai nghìn không trăm hai mươi sáu` (or just `năm 2026` reads OK) |
| Percentage with decimal | `30%` | `ba mươi phần trăm` |
| Time | `60 giây` | `sáu mươi giây` |
| Frequency | `5G` | `năm gờ` (be careful — TTS often says "năm-gờ") |

**Notation choices:**
- For decimal point use `chấm` (more spoken/natural) or `phẩy` (formal). Both work; pick consistent.
- For comma separator, use `phẩy` (e.g. "1,000" → "một nghìn")
- For ratio "3:1" → say `ba trên một` or `ba so với một`

**English brand names — keep as-is**, TTS handles them OK:
- `Apple`, `Google`, `OpenAI`, `Microsoft`, `TikTok`, `YouTube` ✅

**English acronyms — write phonetically if TTS misreads:**
- `AI` → usually OK, sometimes write `ây ai` for clarity
- `API` → write `ây pi ai` if matter
- `GPT` → usually OK; if not, write `gí pi tí`
- `iOS` → write `ai ô ét` if matter

**Symbols to AVOID in voiceText:**
- `→` `&` `%` `$` `#` `+` `=` (TTS may say literal name or skip)
- `!` `?` at end of sentence is OK — they create natural intonation
- Emoji: NEVER (TTS pronounces or skips inconsistently)
- URLs: NEVER (TTS reads dot/slash literally)

**End each `voiceText` sentence with `.` or `?`** for natural pause/intonation.

**Examples — full scene:**

WRONG (will sound bad):
```json
{ "voiceText": "GPT 5.5 đạt 82.7% trên Terminal-Bench, vượt GPT 5.4 (75.1%)." }
```
→ TTS reads: "GPT năm rưỡi đạt tám mươi hai chấm bảy phần trăm trên Terminal-Bench..."

RIGHT (natural):
```json
{ "voiceText": "GPT năm chấm năm đạt tám mươi hai phẩy bảy phần trăm trên Terminal Bench, vượt phiên bản năm chấm bốn ở mức bảy mươi lăm phẩy một." }
```

**Note**: `templateData` (text on screen) CAN use original formatting — the visual is separate from spoken:
```json
{
  "voiceText": "GPT năm chấm năm đạt tám mươi hai phẩy bảy phần trăm.",
  "templateData": {
    "template": "stat-hero",        ← chỉ hoạt động khi VIDEO_THEME=broadcast
    "value": "82.7%",                 ← Visual: keep readable formatting
    "label": "Terminal-Bench"
  }
}
```

**Hook (most important — gets first 3 seconds of viewer attention):**
- Must contain a claim, statistic, or curious question
- NEVER generic ("Hôm nay chúng ta sẽ nói về..." is wrong)
- ALWAYS include at least 1 effect: `flash-white-3f` or `particle-burst`
- Optional `badge` field (max 14 chars): stamp slammed over the hook.
  Default "TIN NÓNG". Match the story mood: `"ĐỘC QUYỀN"`, `"KHẨN CẤP"`, `"BREAKING"`, `"CẢNH BÁO"`.

### Viral engine v3 — new fields you SHOULD use

**Karaoke captions (automatic — no action needed):**
Every scene gets word-by-word karaoke captions synced to the voice (CapCut viral
style). The caption text IS the `voiceText`, so keep voiceText punchy — it's on
screen. Number words (`52`, `126,080`), negative words (sụt, giảm, sập, cảnh báo,
bán tháo...) and positive words (tăng, kỷ lục, lập đỉnh...) auto-highlight in
gold/red/green. Sentence punctuation controls caption line breaks — end sentences
with `.` or `?` and keep sentences short.

**`chart` template — ⚠ CHỈ VẼ ĐƯỢC KHI `VIDEO_THEME=broadcast`.**
Theme mặc định (maicrypto) không có layout cho nó; `points` sẽ không hiện.
Use for any price action, market move, or metric-over-time. An animated neon
line chart draws itself, with a pulsing endpoint and a stamped change badge.

```json
{
  "id": "body-2", "type": "body",
  "voiceText": "Chỉ trong bảy ngày, Bitcoin đã bốc hơi hơn mười hai phần trăm giá trị.",
  "templateData": {
    "template": "chart",
    "title": "BITCOIN TUẦN QUA",
    "points": [104200, 101800, 99500, 96400, 97100, 93800, 91200],
    "label": "BTC / USD — 7 ngày",
    "changeText": "-12.5%",
    "trend": "down"
  }
}
```
- `points`: 4–60 raw numbers left→right (renderer normalizes scale).
  ⛔ **CHỈ dùng số liệu CÓ THẬT trong bài.** Không có đủ dãy số thì BỎ cảnh chart,
  đừng "vẽ một hình dạng hợp lý cho khớp câu chuyện" — đây là video tin tức, một
  biểu đồ giá tự chế là số liệu bịa, dù nhìn có vẻ vô hại.
  Bài chỉ cho một hai mốc giá? Dùng `image` + `headline` ghi đúng hai mốc đó.
- `trend`: `"down"` → red scheme, `"up"` → cyan/green scheme.
- `changeText`: short stamp near the line end ("-52%", "126,080$").
- Rule of thumb: if the story has price movement, include EXACTLY ONE chart scene.

**`ticker` (root-level, optional but recommended):**
Bottom news-ticker strip items (each ≤ 60 chars, max 8). Derived from
title/domain/channel if omitted. Write 3–5 punchy ALL-CAPS fragments:

```json
"ticker": [
  "BITCOIN THỦNG MỐC 91,000$",
  "CÁ VOI BÁN THÁO 12,000 BTC",
  "VÀNG LẬP ĐỈNH MỚI 5,500$",
  "THEO DÕI MAI CRYPTO — TIN NÓNG 24/7"
]
```

**`music` (root-level, optional):**
Background bed auto-ducks under the voice. Omit → auto-pick from `assets/music/`
(deterministic by title). `{ "name": "none" }` disables; `{ "volume": 0.2 }` adjusts.

**stat-hero count-up (automatic):**
`stat-hero.value` with a leading number ("52%", "126,080$", "5.5") animates as a
count-up from 0. Keep `value` in visual formatting (digits, not words).

**Visual rules:**
- For image scenes: `background.src = "$source.image"` (literal — CLI substitutes)
- Vary `kenBurns` across scenes (don't use `zoom-in` for every scene)
- Vary text `animation` (don't use `slide-up` for every line)
- Each line ≤ 25 characters
- Each scene 1-3 lines

**Outro (always fixed format):**
```json
{
  "id": "outro",
  "type": "outro",
  "voiceText": "Theo dõi Công nghệ 24h để xem bản tin mới mỗi ngày.",
  "visual": {
    "background": { "type": "gradient", "preset": "outro-purple" },
    "text": {
      "position": "center",
      "style": "outro-card",
      "lines": [
        { "content": "Xem bản tin mới mỗi ngày", "emphasis": "primary", "animation": "fade-in" },
        { "content": "Công nghệ 24h",            "emphasis": "channel", "animation": "scale-pop" },
        { "content": "Nguồn: <DOMAIN>",          "emphasis": "muted",   "animation": "fade-in-late" }
      ]
    }
  }
}
```
Replace `<DOMAIN>` with the actual domain string. Note: outro line 1 is shortened to fit 25-char schema rule (full CTA "Theo dõi để xem bản tin mới mỗi ngày" is 36 chars).

### Step 5: Self-validate before writing

Check:
- Total word count ~150-200
- Every line.content ≤ 25 chars
- 5-8 scenes total
- scenes[0].type === "hook"
- last scene type === "outro"
- All enum values valid (see spec Section 4.2)

If invalid, fix yourself silently. Up to 2 self-correction passes. After that, write anyway — the CLI's Zod validation will produce a precise error message that the user can act on.

### Step 6: Write script.json

Use the Write tool (not Bash) to write the validated JSON to `<outputDir>/script.json`.

### Step 7: Run the pipeline

Use Bash, **foreground** (not background), stream output:

```bash
npm run pipeline -- <outputDir>/script.json
```

If exit code != 0:
- Report the error message clearly
- Tell user the output dir path so they can inspect intermediate files

### Step 8: Report success

If successful, report to user with markdown links:

```markdown
✓ Video:  [video.mp4](output/<slug>-<timestamp>/video.mp4)
✓ Audio:  [voice.mp3](output/<slug>-<timestamp>/voice.mp3) — for CapCut
✓ Script: [script.txt](output/<slug>-<timestamp>/script.txt) — for CapCut auto-caption
Tổng thời lượng: XX.Xs
```

## Examples

### Example 1: URL with image (vnexpress)

User: `/create-news-video https://vnexpress.net/iphone-17-200mp`

Generated `script.json` (excerpt):
```json
{
  "version": "1.0",
  "metadata": {
    "title": "Apple ra mắt iPhone 17 với camera 200MP",
    "source": {
      "url": "https://vnexpress.net/iphone-17-200mp",
      "domain": "vnexpress.net",
      "image": "https://i1-vnexpress.vnecdn.net/iphone17.jpg"
    },
    "channel": "Công nghệ 24h"
  },
  "voice": { "provider": "lucylab", "voiceId": "${VIETNAMESE_VOICEID}", "speed": 1.0 },
  "scenes": [
    {
      "id": "hook", "type": "hook",
      "voiceText": "Apple vừa ra mắt iPhone 17 với camera hai trăm megapixel.",
      "visual": {
        "background": { "type": "image", "src": "$source.image", "kenBurns": "zoom-in" },
        "overlay":    { "darkness": 0.4 },
        "text": {
          "position": "center", "style": "hook-large",
          "lines": [
            { "content": "iPhone 17",     "emphasis": "primary", "animation": "scale-pop" },
            { "content": "Camera 200MP!", "emphasis": "accent",  "animation": "slide-up-bounce" }
          ]
        },
        "effects": ["flash-white-3f", "particle-burst"]
      }
    }
    /* ... 3 body scenes + outro ... */
  ]
}
```

### Example 2: .txt file with no image (local)

User: `/create-news-video news/agi-update.txt`

Generated `script.json` (excerpt):
```json
{
  "metadata": {
    "title": "OpenAI công bố mô hình mới với khả năng lập luận",
    "source": { "url": "local", "domain": "local", "image": null },
    "channel": "Công nghệ 24h"
  },
  "scenes": [
    {
      "id": "hook", "type": "hook",
      "voiceText": "OpenAI vừa công bố mô hình mới có khả năng lập luận như con người.",
      "visual": {
        "background": { "type": "gradient", "preset": "news-dark" },
        "text": {
          "position": "center", "style": "hook-large",
          "lines": [
            { "content": "Mô hình mới", "emphasis": "primary", "animation": "scale-pop" },
            { "content": "Lập luận!",  "emphasis": "accent",  "animation": "slide-up-bounce" }
          ]
        },
        "effects": ["flash-white-3f"]
      }
    }
    /* ... outro line 3 = "Nguồn: local" ... */
  ]
}
```
Note: when source has no image, every scene uses `background.type = "gradient"` (no image fallback at composer level needed).

## Sound Effects (SFX)

**You almost never need to set the `sfx` field.** The pipeline has a smart 3-tier selector that picks the right SFX for each scene automatically:

1. **If `scene.sfx` is set** → use exactly that (override).
2. **Else, scan `voiceText` for semantic keywords**:
   - `cảnh báo / rủi ro / nguy hiểm / warning` → `alert/`
   - `kỷ lục / vượt / xuất sắc / breakthrough / success` → `success/`
   - `thất bại / sai / lỗi / fail / wrong` → `fail/`
   - `ra mắt / công bố / lần đầu / launch / unveil` → `reveal/`
   - `đếm ngược / tích tắc / countdown` → `countdown/`
   - `hùng vĩ / hoành tráng / cinematic / epic` → `cinematic/`
   - `hồi hộp / chờ đợi / drumroll / suspense` → `drumroll/`
3. **Else, fall back to template default category**:
   - `hook` → `transition/` or `cinematic/`
   - `comparison` → `transition/` or `emphasis/`
   - `stat-hero` → `emphasis/` or `success/`
   - `feature-list` → `transition/` or `emphasis/`
   - `callout` → `alert/` or `drumroll/`
   - `outro` → `outro/` or `success/`

Within a category, the actual file is picked **deterministically** by hashing the scene id — same script gives same SFX (idempotent), but different scenes in the same video get different files (variety).

**This means:** in 95% of cases you should OMIT the `sfx` field entirely. Just write good Vietnamese voiceText with natural keywords (warning, breakthrough, launch, etc.) and the pipeline will pick the right sound.

### When to add explicit `sfx` override

Only when you want to FORCE a specific sound that the keyword matcher won't infer:
- Scene needs a particular signature sound (e.g., always a gong on important scenes)
- Disable SFX for a particular scene: `"sfx": { "name": "none" }`
- Use a specific file: `"sfx": { "name": "transition/whoosh-sfx", "volume": 0.4 }`

Example (rarely needed):
```json
{
  "id": "body-3",
  "voiceText": "...",
  "templateData": { ... },
  "sfx": { "name": "drumroll/snare-roll", "volume": 0.5, "startOffsetSec": 0.2 }
}
```

The pipeline auto-mixes a sound effect at each scene start based on the template type:

| Template | Default SFX | Sound character |
|---|---|---|
| `hook` | `transition/whoosh-soft` | Dramatic entrance |
| `comparison` | `transition/swoosh` | Side-by-side reveal |
| `stat-hero` | `emphasis/ding` | Number reveal |
| `feature-list` | `transition/pop` | Bullet appearance |
| `callout` | `alert/notification` | Important info |
| `outro` | `outro/tada` | Ending signature |

**You usually do NOT need to add a `sfx` field** — defaults work for 95% of cases.

**ONLY add an explicit `sfx` override when content STRONGLY suggests a different mood:**

| Content cue (in voiceText) | Override |
|---|---|
| "cảnh báo", "rủi ro", "đáng lo", "nguy hiểm" | `{ "name": "alert/notification", "volume": 0.4 }` |
| "vượt", "kỷ lục", "xuất sắc", "tăng mạnh" (positive stat) | `{ "name": "emphasis/chime", "volume": 0.35 }` |
| Want to disable SFX for this scene | `{ "name": "none" }` |

Place `sfx` at the same level as `voiceText` and `templateData`:

```json
{
  "id": "body-3",
  "type": "body",
  "voiceText": "Cảnh báo: AI tự chủ có thể đặt ra rủi ro về an ninh mạng.",
  "templateData": { "template": "callout", ... },
  "sfx": { "name": "alert/notification", "volume": 0.4 }
}
```

Available SFX categories (any `<name>` subfolder in `assets/sfx/<category>/<name>.mp3`):
- `transition/` — whoosh, swoosh, swish, pop, punch, page-flip, slide, riser
- `emphasis/` — ding, tick, chime, ping, bong, pop, punch
- `alert/` — notification, alert, alarm, warning
- `success/` — applepay, achievement, win, xbox, steam, jet-set
- `fail/` — wrong-answer-buzzer, incorrect, error, dank-meme
- `outro/` — tada, win31, noooo
- `reveal/` — magic-fairy, anime-girl, hey-female-voice
- `drumroll/` — snare, drum-roll, boom
- `countdown/` — beep, timer
- `cinematic/` — rise, impact

Browse `assets/sfx/<category>/` to see exact filenames. Reference WITHOUT the `.mp3` extension. Example:
```json
{ "sfx": { "name": "success/xbox-360-achievement-sound", "volume": 0.4 } }
```

## Edge cases

| Situation | Action |
|---|---|
| URL paywall / JS-rendered → WebFetch returns no content | Tell user: "Không đọc được URL (có thể do paywall hoặc JS). Hãy lưu nội dung vào file .txt rồi gọi lại." Stop. |
| URL content < 200 words | Warn "Tin gốc ngắn, video có thể không đủ chất liệu", continue anyway |
| URL content > 2000 words | Summarize to key points, fit ~150-200 words script |
| File mode + file empty/missing | Error message, don't create output dir |
| Pipeline fails | Report error message + output dir path; user can re-try `npm run pipeline -- <path>` after fixing |
