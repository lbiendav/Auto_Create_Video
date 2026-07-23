/**
 * Karaoke caption engine — builds word-level caption timelines per scene.
 *
 * Timing sources (best → worst):
 *   1. Per-scene SRT from the TTS provider (LucyLab returns srtUrl) —
 *      words are distributed inside each cue span by character weight.
 *   2. No SRT → whole voiceText distributed across the scene's audio
 *      duration by character weight (Vietnamese syllables are close to
 *      uniform, so char weight tracks speech rate well).
 *
 * Output is renderer-agnostic: html-composer renders chunk/word DOM,
 * animations.js drives the highlight through the GSAP timeline so the
 * result is deterministic under HyperFrames frame scrubbing.
 */

export interface SrtCue {
  startSec: number;
  endSec: number;
  text: string;
}

/** Emphasis classes rendered as caption word colors. */
export type EmphasisKind = "num" | "neg" | "pos" | null;

export interface CaptionWord {
  /** Display text (trailing . , ; : stripped — ? ! kept for punch) */
  text: string;
  /** Seconds relative to SCENE start */
  startSec: number;
  endSec: number;
  emphasis: EmphasisKind;
  /** Original word ended a sentence (. ? ! …) — forces a chunk break after it */
  sentenceEnd: boolean;
}

export interface CaptionChunk {
  words: CaptionWord[];
  startSec: number;
  endSec: number;
}

export interface BuildCaptionArgs {
  voiceText: string;
  /** Duration of this scene's voice audio in seconds (without scene gap) */
  audioDurationSec: number;
  /** Raw SRT content for this scene, if the TTS provider produced one */
  srtText?: string | null;
  /** Max words per caption chunk (viral standard: 3-4) */
  maxWordsPerChunk?: number;
  /** Max characters per caption chunk */
  maxCharsPerChunk?: number;
}

// ── SRT parsing ────────────────────────────────────────────────────────────

const SRT_TIME = /(\d{1,2}):(\d{2}):(\d{2})[,.](\d{1,3})/;

function srtTimeToSec(t: string): number | null {
  const m = SRT_TIME.exec(t);
  if (!m) return null;
  const [, hh, mm, ss, ms] = m;
  return (
    parseInt(hh, 10) * 3600 +
    parseInt(mm, 10) * 60 +
    parseInt(ss, 10) +
    parseInt(ms.padEnd(3, "0"), 10) / 1000
  );
}

export function parseSrt(srt: string): SrtCue[] {
  const cues: SrtCue[] = [];
  // Split on blank lines; tolerate \r\n and missing sequence numbers
  const blocks = srt.replace(/\r/g, "").split(/\n\s*\n/);
  for (const block of blocks) {
    const lines = block.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length === 0) continue;
    const timeLineIdx = lines.findIndex((l) => l.includes("-->"));
    if (timeLineIdx === -1) continue;
    const [rawStart, rawEnd] = lines[timeLineIdx].split("-->").map((s) => s.trim());
    const startSec = srtTimeToSec(rawStart);
    const endSec = srtTimeToSec(rawEnd);
    if (startSec === null || endSec === null || endSec <= startSec) continue;
    const text = lines.slice(timeLineIdx + 1).join(" ").trim();
    if (!text) continue;
    cues.push({ startSec, endSec, text });
  }
  return cues;
}

// ── Emphasis classification ────────────────────────────────────────────────
// Crypto/news vocabulary. Matched on lowercase, punctuation-stripped tokens;
// two-word phrases are matched as bigrams and mark both words.

const NEG_UNIGRAMS = new Set([
  "giảm", "sụt", "sập", "rơi", "mất", "lao", "dốc", "cháy", "thủng", "gãy",
  "cảnh", "báo", "nguy", "hiểm", "khủng", "hoảng", "lỗ", "âm", "đỏ", "xả",
  "cấm", "sốc", "lừa", "đảo", "hack", "lụi", "tàn", "chết", "toang", "bể",
  "thất", "bại", "phá", "sản", "bác", "bỏ", "tháo", "loạn", "tệ", "xấu",
]);
const NEG_BIGRAMS = new Set([
  "rủi ro", "bán tháo", "đỏ lửa", "thanh lý", "sập sàn", "phá sản",
  "cảnh báo", "báo động", "lao dốc", "rơi tự", "bốc hơi", "quay lưng",
  "tiêu cực", "áp lực", "khủng hoảng", "thất bại", "bác bỏ", "đầu cơ",
]);
const POS_UNIGRAMS = new Set([
  "tăng", "vượt", "đỉnh", "bùng", "nổ", "xanh", "lãi", "lời", "gom",
  "thắng", "moon", "bơm", "hồi", "phục", "mạnh", "sốt", "nóng", "vọt",
  "kỷ", "lục", "đột", "phá",
]);
const POS_BIGRAMS = new Set([
  "kỷ lục", "phá đỉnh", "bùng nổ", "tăng vọt", "nhảy vọt", "hồi phục",
  "phục hồi", "tích cực", "đột phá", "thành công", "lập đỉnh", "tăng mạnh",
  "all time",
]);

function normalizeToken(word: string): string {
  return word.toLowerCase().replace(/[.,;:!?"'“”‘’()\[\]…]/g, "").trim();
}

/**
 * Classify every word of a token list. Returns an array aligned with input.
 * Priority: number > negative > positive.
 */
export function classifyEmphasis(words: string[]): EmphasisKind[] {
  const norm = words.map(normalizeToken);
  const out: EmphasisKind[] = new Array(words.length).fill(null);

  // Bigram pass — mark both member words
  for (let i = 0; i < norm.length - 1; i++) {
    const bi = `${norm[i]} ${norm[i + 1]}`;
    if (NEG_BIGRAMS.has(bi)) { out[i] = out[i] ?? "neg"; out[i + 1] = out[i + 1] ?? "neg"; }
    else if (POS_BIGRAMS.has(bi)) { out[i] = out[i] ?? "pos"; out[i + 1] = out[i + 1] ?? "pos"; }
  }
  // Unigram pass
  for (let i = 0; i < norm.length; i++) {
    const w = norm[i];
    if (!w) continue;
    if (/\d/.test(w) || w === "%" || w === "$") out[i] = "num";
    else if (out[i] === null && NEG_UNIGRAMS.has(w)) out[i] = "neg";
    else if (out[i] === null && POS_UNIGRAMS.has(w)) out[i] = "pos";
  }
  return out;
}

// ── Word timing ────────────────────────────────────────────────────────────

/** Character weight: longer words take longer to say. +1 smooths short words. */
function charWeight(word: string): number {
  return normalizeToken(word).length + 1;
}

/** Strip display punctuation viral captions never show (keep ? and !). */
function displayText(word: string): string {
  return word.replace(/[.,;:…]+$/g, "").replace(/^[“”"'‘’]+|[“”"'‘’]+$/g, "");
}

function distributeWords(
  words: string[],
  emphasis: EmphasisKind[],
  spanStart: number,
  spanEnd: number,
): CaptionWord[] {
  const total = words.reduce((s, w) => s + charWeight(w), 0);
  const span = Math.max(0.01, spanEnd - spanStart);
  const out: CaptionWord[] = [];
  let cursor = spanStart;
  words.forEach((w, i) => {
    const dur = (charWeight(w) / total) * span;
    out.push({
      text: displayText(w),
      startSec: cursor,
      endSec: cursor + dur,
      emphasis: emphasis[i],
      sentenceEnd: /[.?!…]["'”’]?$/.test(w),
    });
    cursor += dur;
  });
  return out;
}

// ── Chunking ───────────────────────────────────────────────────────────────

function chunkWords(
  words: CaptionWord[],
  maxWords: number,
  maxChars: number,
): CaptionChunk[] {
  const chunks: CaptionChunk[] = [];
  let current: CaptionWord[] = [];
  let chars = 0;

  const flush = () => {
    if (current.length === 0) return;
    chunks.push({
      words: current,
      startSec: current[0].startSec,
      endSec: current[current.length - 1].endSec,
    });
    current = [];
    chars = 0;
  };

  for (const w of words) {
    const wLen = w.text.length;
    if (current.length > 0 && (current.length >= maxWords || chars + wLen + 1 > maxChars)) {
      flush();
    }
    current.push(w);
    chars += wLen + 1;
    if (w.sentenceEnd) flush();
  }
  flush();

  // Stretch chunk visibility: each chunk stays until the next chunk starts
  // (prevents dark gaps between chunks); last chunk holds a bit.
  for (let i = 0; i < chunks.length; i++) {
    if (i < chunks.length - 1) chunks[i].endSec = chunks[i + 1].startSec;
    else chunks[i].endSec = chunks[i].endSec + 0.45;
  }
  return chunks;
}

// ── Public builder ─────────────────────────────────────────────────────────

const LEAD_SEC = 0.1;   // TTS files start almost immediately
const TAIL_SEC = 0.25;  // trailing silence estimate when no SRT

export function buildCaptionChunks(args: BuildCaptionArgs): CaptionChunk[] {
  const maxWords = args.maxWordsPerChunk ?? 4;
  const maxChars = args.maxCharsPerChunk ?? 24;

  // Path 1 — SRT cues (ground truth of what is spoken, when)
  if (args.srtText) {
    const cues = parseSrt(args.srtText);
    if (cues.length > 0) {
      const allWords: CaptionWord[] = [];
      for (const cue of cues) {
        const words = cue.text.split(/\s+/).filter(Boolean);
        if (words.length === 0) continue;
        const emphasis = classifyEmphasis(words);
        // Clamp cue times into the audio span (defensive)
        const s = Math.max(0, Math.min(cue.startSec, args.audioDurationSec));
        const e = Math.max(s + 0.05, Math.min(cue.endSec, args.audioDurationSec));
        allWords.push(...distributeWords(words, emphasis, s, e));
      }
      if (allWords.length > 0) return chunkWords(allWords, maxWords, maxChars);
    }
  }

  // Path 2 — estimate across the audio duration
  const words = args.voiceText.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const emphasis = classifyEmphasis(words);
  const start = Math.min(LEAD_SEC, args.audioDurationSec * 0.05);
  const end = Math.max(start + 0.1, args.audioDurationSec - TAIL_SEC);
  const timed = distributeWords(words, emphasis, start, end);
  return chunkWords(timed, maxWords, maxChars);
}
