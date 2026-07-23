import { describe, it, expect } from "vitest";
import { parseSrt, classifyEmphasis, buildCaptionChunks } from "./captions.js";

describe("parseSrt", () => {
  it("parses standard SRT blocks", () => {
    const srt = [
      "1",
      "00:00:00,120 --> 00:00:02,500",
      "Bitcoin vừa sụt giảm mạnh",
      "",
      "2",
      "00:00:02,600 --> 00:00:05,000",
      "trong phiên hôm nay",
      "",
    ].join("\n");
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(2);
    expect(cues[0].startSec).toBeCloseTo(0.12, 3);
    expect(cues[0].endSec).toBeCloseTo(2.5, 3);
    expect(cues[0].text).toBe("Bitcoin vừa sụt giảm mạnh");
    expect(cues[1].text).toBe("trong phiên hôm nay");
  });

  it("tolerates CRLF, dot ms separator and missing sequence numbers", () => {
    const srt = "00:00:01.000 --> 00:00:03.000\r\nXin chào\r\n\r\n";
    const cues = parseSrt(srt);
    expect(cues).toHaveLength(1);
    expect(cues[0].startSec).toBe(1);
    expect(cues[0].text).toBe("Xin chào");
  });

  it("skips malformed blocks", () => {
    const cues = parseSrt("garbage\nno timing here\n\n1\nbroken --> also broken\ntext\n");
    expect(cues).toHaveLength(0);
  });
});

describe("classifyEmphasis", () => {
  it("marks numbers as num", () => {
    const out = classifyEmphasis(["Bitcoin", "126,080", "đô", "52%"]);
    expect(out).toEqual([null, "num", null, "num"]);
  });

  it("marks negative crypto vocabulary", () => {
    const out = classifyEmphasis(["thị", "trường", "sụt", "giảm"]);
    expect(out[2]).toBe("neg");
    expect(out[3]).toBe("neg");
  });

  it("marks bigrams on both words", () => {
    const out = classifyEmphasis(["cực", "kỳ", "rủi", "ro"]);
    expect(out[2]).toBe("neg");
    expect(out[3]).toBe("neg");
  });

  it("marks positive vocabulary", () => {
    const out = classifyEmphasis(["vàng", "lập", "đỉnh", "lịch", "sử"]);
    expect(out[1]).toBe("pos");
    expect(out[2]).toBe("pos");
  });
});

describe("buildCaptionChunks — estimated timing (no SRT)", () => {
  const voiceText = "Tỷ phú Jeremy Grantham vừa đưa ra phát ngôn gây sốc. Bitcoin sẽ dần lụi tàn?";

  it("covers the audio span monotonically", () => {
    const chunks = buildCaptionChunks({ voiceText, audioDurationSec: 8 });
    expect(chunks.length).toBeGreaterThan(1);
    let prevEnd = -1;
    for (const c of chunks) {
      expect(c.startSec).toBeGreaterThanOrEqual(0);
      expect(c.startSec).toBeGreaterThanOrEqual(prevEnd - 0.001); // contiguous
      expect(c.words.length).toBeGreaterThan(0);
      expect(c.words.length).toBeLessThanOrEqual(4);
      for (const w of c.words) {
        expect(w.endSec).toBeGreaterThan(w.startSec);
      }
      prevEnd = c.endSec;
    }
    // Words must not overrun audio by more than the final hold
    const last = chunks[chunks.length - 1];
    expect(last.words[last.words.length - 1].endSec).toBeLessThanOrEqual(8);
  });

  it("breaks chunks at sentence boundaries", () => {
    const chunks = buildCaptionChunks({ voiceText, audioDurationSec: 8 });
    // "sốc." ends a sentence → some chunk must end with the word "sốc" (dot stripped)
    const boundaryChunk = chunks.find((c) => c.words[c.words.length - 1].text === "sốc");
    expect(boundaryChunk).toBeDefined();
    // "?" is kept for display punch
    const lastWord = chunks[chunks.length - 1].words.at(-1)!;
    expect(lastWord.text).toBe("tàn?");
  });

  it("strips display punctuation but keeps ?/!", () => {
    const chunks = buildCaptionChunks({ voiceText: "Tăng mạnh, rồi sập!", audioDurationSec: 3 });
    const words = chunks.flatMap((c) => c.words.map((w) => w.text));
    expect(words).toContain("mạnh"); // comma stripped
    expect(words).toContain("sập!");
  });

  it("returns empty for empty text", () => {
    expect(buildCaptionChunks({ voiceText: "   ", audioDurationSec: 5 })).toEqual([]);
  });
});

describe("buildCaptionChunks — SRT timing", () => {
  it("uses cue spans for word timing", () => {
    const srt = [
      "1",
      "00:00:00,500 --> 00:00:02,000",
      "Bitcoin sụt giảm",
      "",
      "2",
      "00:00:03,000 --> 00:00:05,000",
      "năm mươi hai phần trăm",
      "",
    ].join("\n");
    const chunks = buildCaptionChunks({
      voiceText: "ignored when srt present",
      audioDurationSec: 6,
      srtText: srt,
    });
    const words = chunks.flatMap((c) => c.words);
    expect(words[0].text).toBe("Bitcoin");
    expect(words[0].startSec).toBeCloseTo(0.5, 2);
    // First cue's words all end by cue end
    expect(words[2].endSec).toBeLessThanOrEqual(2.001);
    // Second cue starts at its own time
    const namWord = words.find((w) => w.text === "năm")!;
    expect(namWord.startSec).toBeCloseTo(3.0, 2);
  });

  it("falls back to estimation when SRT is unparseable", () => {
    const chunks = buildCaptionChunks({
      voiceText: "Một hai ba bốn năm",
      audioDurationSec: 4,
      srtText: "not an srt at all",
    });
    expect(chunks.length).toBeGreaterThan(0);
    expect(chunks[0].words[0].text).toBe("Một");
  });
});
