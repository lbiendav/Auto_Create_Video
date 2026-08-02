import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, copyFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { resolveSceneImages } from "./scene-images.js";

/**
 * Regression cover cho bug "ảnh hook mất chữ hai đầu".
 *
 * Ảnh og của bài báo là title-card 16:9 có tiêu đề nung sẵn. Đặt `fit: "cover"`
 * trong khung 9:16 thì chỉ giữ lại 1080/(1280*1920/720) = 31,6% bề ngang, chữ
 * cụt cả hai đầu. Guard trong resolveSceneImages() phải bắt được trường hợp
 * này ở `hook-split` — nhưng KHÔNG được đụng tới ảnh lấy từ `query` (ảnh chụp
 * không chữ), vì cover tràn khung chính là cái làm cảnh hook đẹp.
 */

const FIXT = join(tmpdir(), "scene-images-fixtures");
const LAND = join(FIXT, "land.jpg"); // 1280×720  → giữ 31,6%
const PORT = join(FIXT, "port.jpg"); // 1080×1920 → giữ 100%

// Dựng fixture ngay lúc COLLECT (không dùng beforeAll) vì `it.runIf` được
// đánh giá tại thời điểm collect — beforeAll chạy sau thì cờ luôn là true.
const hasFfmpeg = (() => {
  try {
    mkdirSync(FIXT, { recursive: true });
    if (!existsSync(LAND))
      execSync(`ffmpeg -v error -y -f lavfi -i color=c=navy:s=1280x720 -frames:v 1 "${LAND}"`);
    if (!existsSync(PORT))
      execSync(`ffmpeg -v error -y -f lavfi -i color=c=navy:s=1080x1920 -frames:v 1 "${PORT}"`);
    execSync(`ffprobe -v error -select_streams v:0 -show_entries stream=width -of csv=p=0 "${LAND}"`);
    return true;
  } catch {
    return false;
  }
})();

let tmp: string;
beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "scene-img-"));
  mkdirSync(join(tmp, "images"), { recursive: true });
});
afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const imageGen = { enabled: false } as any;
const imageSearch = {} as any;

const TD: Record<string, any> = {
  "hook-split": {
    template: "hook-split",
    summary: "X",
    splitAt: 0.51,
    panelTone: "brand",
    showWordmark: true,
    badge: "B",
    kicker: "K",
    highlight: [],
    priceTags: [],
  },
  image: { template: "image", headline: "H" },
  document: { template: "document", label: "L" },
  "finance-hook": { template: "finance-hook", headline: "H", theme: "finance", trend: "down", priceTags: [] },
};

/**
 * Đặt sẵn images/scene-1.jpg để resolveOne() đi vào nhánh REUSE — không đụng
 * mạng, nhưng vẫn chạy đúng ffprobe + guard thật.
 */
async function resolveWith(template: string, spec: any, fixture: string) {
  copyFileSync(fixture, join(tmp, "images", "scene-1.jpg"));
  const script: any = {
    scenes: [{ id: "1", type: "hook", voiceText: "v", templateData: TD[template], image: spec }],
  };
  const out = await resolveSceneImages(script, tmp, imageGen, imageSearch);
  return out["1"];
}

describe("resolveSceneImages – guard cover→contain", () => {
  it.runIf(hasFfmpeg)("hạ cover→contain khi hook-split dùng ảnh og (src) khổ ngang", async () => {
    const r = await resolveWith("hook-split", { src: "https://x/og.jpg", fit: "cover" }, LAND);
    expect(r.source).toBe("src");
    expect(r.fit).toBe("contain");
  });

  it.runIf(hasFfmpeg)("GIỮ cover khi hook-split dùng ảnh chụp từ query", async () => {
    const r = await resolveWith("hook-split", { query: "bitcoin trader", fit: "cover" }, LAND);
    expect(r.fit).toBe("cover");
  });

  it.runIf(hasFfmpeg)("GIỮ cover khi ảnh khổ dọc (cover không cắt bề ngang)", async () => {
    const r = await resolveWith("hook-split", { src: "https://x/og.jpg", fit: "cover" }, PORT);
    expect(r.fit).toBe("cover");
  });

  it.runIf(hasFfmpeg)("vẫn hạ cover→contain ở cảnh body (hành vi cũ, không hồi quy)", async () => {
    const r = await resolveWith("image", { query: "chart", fit: "cover" }, LAND);
    expect(r.fit).toBe("contain");
  });

  it.runIf(hasFfmpeg)("bỏ qua template phớt lờ fit (document)", async () => {
    const r = await resolveWith("document", { src: "https://x/doc.jpg", fit: "cover" }, LAND);
    expect(r.fit).toBe("cover");
  });

  it.runIf(hasFfmpeg)("bỏ qua finance-hook (ảnh chỉ là hoạ tiết nền)", async () => {
    const r = await resolveWith("finance-hook", { src: "https://x/og.jpg", fit: "cover" }, LAND);
    expect(r.fit).toBe("cover");
  });
});
