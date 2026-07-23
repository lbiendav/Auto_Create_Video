import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { composeHtml, parseCountup } from "./html-composer.js";
import { buildCaptionChunks } from "./captions.js";
import type { Script } from "./script-schema.js";

function loadFixture(): Script {
  return JSON.parse(readFileSync("tests/fixtures/sample-script-with-image.json", "utf8")) as Script;
}

const SCENE_AUDIO = [
  { id: "hook",   durationSec: 3.2 },
  { id: "body-1", durationSec: 11.5 },
  { id: "body-2", durationSec: 10.8 },
  { id: "body-3", durationSec: 12.1 },
  { id: "body-4", durationSec: 6.4 },
  { id: "outro",  durationSec: 3.4 },
];

describe("composeHtml", () => {
  it("produces deterministic HTML for sample script with image", () => {
    const script = loadFixture();
    const html = composeHtml({
      script,
      sceneAudio: SCENE_AUDIO,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
    });

    // ── HyperFrames structural requirements ──────────────────
    expect(html).toContain('id="stage"');
    expect(html).toContain('data-composition-id="news-video"');
    expect(html).toContain('data-width="1080"');
    expect(html).toContain('data-height="1920"');
    expect(html).toContain('data-start="0"');           // root composition timing
    expect(html).toContain('id="voice"');               // audio element discoverable by hyperframes
    expect(html).toContain('class="scene clip"');       // clip class required for hyperframes visibility
    expect(html).toContain('window.__timelines');       // timeline registry (inlined JS)

    // ── Persistent broadcast shell ────────────────────────────
    expect(html).toContain('class="brand-shell-header"');
    expect(html).toContain('class="brand-shell-handle"');
    expect(html).toContain('class="brand-name"');
    expect(html).toContain("Công nghệ 24h");
    // Breaking bar + live dot + date stamp
    expect(html).toContain('class="shell-breaking"');
    expect(html).toContain('class="live-dot"');
    expect(html).toContain("TRỰC TIẾP");
    // News ticker (derived from metadata when script.ticker missing)
    expect(html).toContain('class="shell-ticker"');
    expect(html).toContain('class="ticker-track"');
    expect(html).toContain("NGUỒN: vnexpress.net");
    // Seamless loop needs the item group duplicated
    expect(html.match(/class="ticker-group"/g)?.length).toBe(2);
    // Progress bar + vignette + transition flash layer
    expect(html).toContain('class="shell-progress"');
    expect(html).toContain('class="progress-fill"');
    expect(html).toContain('class="shell-vignette"');
    expect(html).toContain('class="fx-flash"');

    // ── Hook scene ─────────────────────────────────────────────
    expect(html).toContain('data-layout="hook"');
    expect(html).toContain('class="hook-badge"');
    expect(html).toContain("TIN NÓNG");                 // default badge
    // Headline split into stagger words
    expect(html).toContain('<span class="hw">iPhone</span>');
    expect(html).toContain('<span class="hw">17</span>');
    expect(html).toContain("Camera 200MP!");            // subhead content

    // Image background: Ken Burns driven via data-kb (GSAP)
    expect(html).toContain('class="bg kb-zoom-in" data-kb="zoom-in"');
    expect(html).toContain("background-image: url('images/bg.jpg')");

    // ── Body templates ─────────────────────────────────────────
    // body-1: stat-hero with count-up attrs
    expect(html).toContain('data-layout="stat-hero"');
    expect(html).toContain('data-cu="1"');
    expect(html).toContain('data-cu-target="200"');
    expect(html).toContain('data-cu-suffix="MP"');
    expect(html).toContain("200MP");

    // body-2: feature-list
    expect(html).toContain('data-layout="feature-list"');
    expect(html).toContain('class="feat-card"');
    expect(html).toContain("Nâng cấp lớn");

    // body-3: callout
    expect(html).toContain('data-layout="callout"');
    expect(html).toContain('class="callout-statement"');

    // body-4: chart (crypto/price template)
    expect(html).toContain('data-layout="chart"');
    expect(html).toContain('data-trend="up"');
    expect(html).toContain('class="chart-line"');
    expect(html).toContain('class="chart-area"');
    expect(html).toContain('class="chart-dot"');
    expect(html).toContain('class="chart-badge"');
    expect(html).toContain("+15%");
    expect(html).toContain("AAPL — 7 ngày");

    // ── Outro scene ────────────────────────────────────────────
    expect(html).toContain('data-layout="outro"');
    expect(html).toContain('class="out-channel"');
    expect(html).toContain("Theo dõi ngay");

    // Audio src
    expect(html).toContain('src="voice.mp3"');
    expect(html).toMatch(/data-duration="[\d.]+"/);

    // Google Fonts present
    expect(html).toContain("fonts.googleapis.com");

    // Every layout is a punch-target for scene transitions (6 scenes)
    expect(html.match(/class="layout-[a-z-]+ punch-target"/g)?.length).toBe(6);
  });

  it("falls back to gradient when bgImageRelPath is null", () => {
    const script = loadFixture();
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
    });
    // Hook scene with bgSrc but no bgImageRelPath → gradient fallback
    expect(html).toContain('class="bg gradient-news-dark"');
    expect(html).not.toContain("background-image: url");
    // No ambient image → drifting blobs fallback
    expect(html).toContain('class="shell-blob blob-a"');
    expect(html).toContain('class="shell-blob blob-b"');
  });

  it("renders ambient layer when ambientImageRelPath is provided", () => {
    const script = loadFixture();
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
      ambientImageRelPath: "images/bg-blur.jpg",
    });
    expect(html).toContain('class="shell-ambient"');
    expect(html).toContain("url('images/bg-blur.jpg')");
    expect(html).not.toContain('class="shell-blob blob-a"');
  });

  it("renders karaoke caption DOM with word timing attrs", () => {
    const script = loadFixture();
    const captionsByScene = Object.fromEntries(
      script.scenes.map((s, i) => [
        s.id,
        buildCaptionChunks({ voiceText: s.voiceText, audioDurationSec: SCENE_AUDIO[i].durationSec }),
      ]),
    );
    const html = composeHtml({
      script,
      sceneAudio: SCENE_AUDIO,
      gapSec: 0.3,
      bgImageRelPath: "images/bg.jpg",
      audioRelPath: "voice.mp3",
      captionsByScene,
    });
    expect(html).toContain('class="caps"');
    expect(html).toContain('class="cap-chunk"');
    expect(html).toMatch(/class="cap-word"[^>]*data-ws="[\d.]+" data-we="[\d.]+"/);
    // Emphasis attr present for number words ("17" in hook voiceText etc.)
    expect(html).toContain('data-emph="num"');
    // Outro never renders captions (keeps the follow-card zone clean)
    const outroSection = html.slice(html.indexOf('id="scene-outro"'));
    expect(outroSection).not.toContain('class="caps"');
  });

  it("uses authored ticker items when provided", () => {
    const script = loadFixture();
    (script as any).ticker = ["BTC LAO DỐC 52%", "VÀNG LẬP ĐỈNH"];
    const sceneAudio = script.scenes.map((s) => ({ id: s.id, durationSec: 5 }));
    const html = composeHtml({
      script,
      sceneAudio,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
    });
    expect(html).toContain("BTC LAO DỐC 52%");
    expect(html).toContain("VÀNG LẬP ĐỈNH");
    expect(html).not.toContain("NGUỒN: vnexpress.net"); // derived items replaced
  });

  it("omits captions when script.captions.enabled === false", () => {
    const script = loadFixture();
    (script as any).captions = { enabled: false };
    const captionsByScene = {
      hook: buildCaptionChunks({ voiceText: "Một hai ba bốn năm sáu", audioDurationSec: 3 }),
    };
    const html = composeHtml({
      script,
      sceneAudio: SCENE_AUDIO,
      gapSec: 0.3,
      bgImageRelPath: null,
      audioRelPath: "voice.mp3",
      captionsByScene,
    });
    expect(html).not.toContain('class="caps"');
  });
});

describe("parseCountup", () => {
  it("parses percent values", () => {
    expect(parseCountup("52%")).toEqual({ target: 52, decimals: 0, group: "", prefix: "", suffix: "%" });
  });
  it("parses grouped thousands with currency suffix", () => {
    expect(parseCountup("126,080$")).toEqual({ target: 126080, decimals: 0, group: ",", prefix: "", suffix: "$" });
  });
  it("parses decimals", () => {
    expect(parseCountup("5.5")).toEqual({ target: 5.5, decimals: 1, group: "", prefix: "", suffix: "" });
  });
  it("parses prefix + suffix", () => {
    expect(parseCountup("$1.2M")).toEqual({ target: 1.2, decimals: 1, group: "", prefix: "$", suffix: "M" });
  });
  it("parses negatives", () => {
    expect(parseCountup("-52%")).toEqual({ target: -52, decimals: 0, group: "", prefix: "", suffix: "%" });
  });
  it("returns null for non-numeric values", () => {
    expect(parseCountup("N/A")).toBeNull();
    expect(parseCountup("Sụt giảm")).toBeNull();
  });
});
