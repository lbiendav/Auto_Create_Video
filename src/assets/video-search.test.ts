import { describe, it, expect } from "vitest";
import { parseIsoDuration, pickYouTubeHits } from "./video-search.js";

describe("parseIsoDuration", () => {
  it("doc duoc gio/phut/giay", () => {
    expect(parseIsoDuration("PT30S")).toBe(30);
    expect(parseIsoDuration("PT1M30S")).toBe(90);
    expect(parseIsoDuration("PT1H2M3S")).toBe(3723);
    expect(parseIsoDuration("PT2M")).toBe(120);
  });
  it("tra 0 khi khong doc duoc", () => {
    expect(parseIsoDuration("")).toBe(0);
    expect(parseIsoDuration("rac")).toBe(0);
  });
});

const mk = (id: string, license: string, duration: string, definition = "hd") => ({
  id,
  status: { license },
  contentDetails: { duration, definition },
  snippet: { channelTitle: `kenh-${id}` },
});

describe("pickYouTubeHits", () => {
  it("LOAI video khong phai creativeCommon", () => {
    const { hits } = pickYouTubeHits([mk("a", "youtube", "PT30S"), mk("b", "creativeCommon", "PT30S")], 240);
    expect(hits).toHaveLength(1);
    expect(hits[0].url).toContain("b");
  });

  it("loai clip dai qua nguong", () => {
    const { hits } = pickYouTubeHits([mk("a", "creativeCommon", "PT10M")], 240);
    expect(hits).toHaveLength(0);
  });

  it("danh dau kind=youtube de pipeline biet phai dung yt-dlp", () => {
    const { hits } = pickYouTubeHits([mk("a", "creativeCommon", "PT30S")], 240);
    expect(hits[0].kind).toBe("youtube");
    expect(hits[0].url).toBe("https://www.youtube.com/watch?v=a");
  });

  it("credit ghi ro CC BY va ten kenh (bat buoc cua licence)", () => {
    const { hits } = pickYouTubeHits([mk("a", "creativeCommon", "PT30S")], 240);
    expect(hits[0].credit).toBe("YouTube — kenh-a (CC BY)");
    expect(hits[0].license).toBe("CC BY 3.0");
  });

  it("uu tien HD truoc, roi den clip ngan hon", () => {
    const { hits } = pickYouTubeHits(
      [
        mk("dai", "creativeCommon", "PT3M", "hd"),
        mk("sd", "creativeCommon", "PT10S", "sd"),
        mk("ngan", "creativeCommon", "PT20S", "hd"),
      ],
      240,
    );
    expect(hits.map((h) => h.url.split("=")[1])).toEqual(["ngan", "dai", "sd"]);
  });

  it("bo qua item thieu du lieu, khong nem loi", () => {
    expect(pickYouTubeHits([null, {}, { id: "x" }] as any, 240).hits).toHaveLength(0);
    expect(pickYouTubeHits(undefined as any, 240).hits).toHaveLength(0);
  });
});

describe("pickYouTubeHits — so lieu chan doan", () => {
  it("tach rieng ly do loai: khong-CC vs qua-dai", () => {
    const r = pickYouTubeHits(
      [
        mk("a", "youtube", "PT30S"),        // khong CC
        mk("b", "youtube", "PT30S"),        // khong CC
        mk("c", "creativeCommon", "PT10M"), // CC nhung dai
        mk("d", "creativeCommon", "PT30S"), // giu
      ],
      240,
    );
    expect(r.notCC).toBe(2);
    expect(r.tooLong).toBe(1);
    expect(r.hits).toHaveLength(1);
  });

  it("goi y nguong moi dua tren clip ngan nhat trong so bi loai", () => {
    const r = pickYouTubeHits(
      [mk("a", "creativeCommon", "PT20M"), mk("b", "creativeCommon", "PT5M")],
      240,
    );
    expect(r.tooLongSecs).toEqual([300, 1200]);
  });
});
