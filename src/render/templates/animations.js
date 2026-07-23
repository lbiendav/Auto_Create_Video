// Viral Broadcast Motion Engine — mọi chuyển động THEO THỜI GIAN nằm trong
// GSAP timeline vì HyperFrames scrub timeline từng khung hình (deterministic).
// CSS animation chạy theo đồng hồ toàn cục nên KHÔNG dùng cho motion theo scene.

window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["news-video"] = tl;

(function () {
  // Inject shimmer mask cho các phần tử có hiệu ứng quét sáng
  document.querySelectorAll(".shimmer-sweep-target").forEach((el) => {
    if (!el.querySelector(".shimmer-mask")) {
      const mask = document.createElement("div");
      mask.className = "shimmer-mask";
      el.appendChild(mask);
    }
  });

  const stage = document.getElementById("stage");
  const totalDur = parseFloat(stage.dataset.duration) || 60;
  const scenes = Array.from(stage.querySelectorAll(".scene"));

  // ── SHELL: progress bar / ticker / live dot / ambient ─────────────────
  const progressFill = stage.querySelector(".progress-fill");
  if (progressFill) {
    tl.fromTo(progressFill, { scaleX: 0 }, { scaleX: 1, duration: totalDur, ease: "none" }, 0);
  }

  const tickerTrack = stage.querySelector(".ticker-track");
  if (tickerTrack) {
    const LOOP_SEC = 16; // nửa vòng (track chứa 2 group giống hệt → -50% là seamless)
    tl.fromTo(
      tickerTrack,
      { xPercent: 0 },
      { xPercent: -50, duration: LOOP_SEC, ease: "none", repeat: Math.ceil(totalDur / LOOP_SEC) },
      0
    );
  }

  const liveDot = stage.querySelector(".live-dot");
  if (liveDot) {
    tl.fromTo(
      liveDot,
      { opacity: 1 },
      { opacity: 0.2, duration: 0.55, yoyo: true, repeat: Math.ceil(totalDur / 0.55), ease: "sine.inOut" },
      0
    );
  }

  const ambient = stage.querySelector(".shell-ambient");
  if (ambient) {
    tl.fromTo(ambient, { scale: 1.02 }, { scale: 1.16, duration: totalDur, ease: "none" }, 0);
  }
  const blobA = stage.querySelector(".shell-blob.blob-a");
  const blobB = stage.querySelector(".shell-blob.blob-b");
  const drift = Math.max(8, totalDur / 2);
  if (blobA) tl.to(blobA, { x: 180, y: 140, duration: drift, yoyo: true, repeat: 1, ease: "sine.inOut" }, 0);
  if (blobB) tl.to(blobB, { x: -160, y: -170, duration: drift, yoyo: true, repeat: 1, ease: "sine.inOut" }, 0);

  const flash = stage.querySelector(".fx-flash");

  // Bảng màu phụ đề karaoke — khai báo TRƯỚC scenes.forEach (tránh lỗi TDZ
  // vì animateCaptions chạy ngay trong vòng lặp bên dưới).
  const CAP_COLORS = {
    num:  { chip: "#ffd600", chipText: "#111111", rest: "#ffd600" },
    neg:  { chip: "#ff2f55", chipText: "#ffffff", rest: "#ff5f7a" },
    pos:  { chip: "#00e5a0", chipText: "#04120c", rest: "#2bffc6" },
    base: { chip: "#ffd600", chipText: "#111111", rest: "#ffffff" },
  };

  // ── ĐIỀU PHỐI SCENE ───────────────────────────────────────────────────
  scenes.forEach((scene, sceneIdx) => {
    const start = parseFloat(scene.dataset.start);
    const dur   = parseFloat(scene.dataset.duration);
    const layout = scene.dataset.layout;

    // Bật tắt Scene theo chuẩn quy định HyperFrames
    tl.set(scene, { opacity: 1 }, start);
    tl.set(scene, { opacity: 0 }, start + dur);

    // Chuyển cảnh: flash + zoom-punch (bỏ qua scene đầu — hook có màn chào riêng)
    // immediateRender:false BẮT BUỘC — flash nằm trong shell luôn hiển thị,
    // nếu không GSAP áp opacity 0.85 ngay từ frame 0 làm trắng cả video.
    if (sceneIdx > 0) {
      if (flash) {
        tl.fromTo(flash, { opacity: 0.85 }, { opacity: 0, duration: 0.24, ease: "power2.out", immediateRender: false }, start);
      }
      const punch = scene.querySelector(".punch-target");
      if (punch) {
        tl.fromTo(punch, { scale: 1.05 }, { scale: 1, duration: 0.5, ease: "power3.out", immediateRender: false }, start + 0.02);
      }
    }

    // Ken Burns qua GSAP (data-kb) — chính xác theo thời gian scene
    animateKenBurns(scene, tl, start, dur);

    // Phụ đề karaoke
    animateCaptions(scene, tl, start);

    if (layout === "hook") {
      animateHook(scene, tl, start);
    } else if (layout === "comparison") {
      animateComparison(scene, tl, start);
    } else if (layout === "stat-hero") {
      animateStatHero(scene, tl, start);
    } else if (layout === "feature-list") {
      animateFeatureList(scene, tl, start);
    } else if (layout === "callout") {
      animateCallout(scene, tl, start);
    } else if (layout === "chart") {
      animateChart(scene, tl, start, dur);
    } else if (layout === "outro") {
      animateOutro(scene, tl, start, dur);
    }
  });

  // ── KEN BURNS ─────────────────────────────────────────────────────────
  function animateKenBurns(scene, tl, start, dur) {
    const bg = scene.querySelector(".bg[data-kb]");
    if (!bg) return;
    const kind = bg.dataset.kb;
    const d = Math.max(0.5, dur);
    if (kind === "zoom-in") {
      tl.fromTo(bg, { scale: 1.0 }, { scale: 1.18, duration: d, ease: "none" }, start);
    } else if (kind === "zoom-out") {
      tl.fromTo(bg, { scale: 1.18 }, { scale: 1.0, duration: d, ease: "none" }, start);
    } else if (kind === "pan-left") {
      tl.fromTo(bg, { scale: 1.12, xPercent: 3 }, { scale: 1.12, xPercent: -3, duration: d, ease: "none" }, start);
    } else if (kind === "pan-right") {
      tl.fromTo(bg, { scale: 1.12, xPercent: -3 }, { scale: 1.12, xPercent: 3, duration: d, ease: "none" }, start);
    }
  }

  // ── PHỤ ĐỀ KARAOKE ────────────────────────────────────────────────────
  // Chip màu nhảy theo từng chữ đang đọc (chuẩn CapCut viral).
  function animateCaptions(scene, tl, start) {
    const chunks = scene.querySelectorAll(".cap-chunk");
    chunks.forEach((chunk) => {
      const cs = start + parseFloat(chunk.dataset.cs);
      const ce = start + parseFloat(chunk.dataset.ce);

      tl.fromTo(
        chunk,
        { opacity: 0, y: 26, scale: 0.94 },
        { opacity: 1, y: 0, scale: 1, duration: 0.18, ease: "back.out(1.8)" },
        cs
      );
      tl.set(chunk, { opacity: 0 }, ce);

      chunk.querySelectorAll(".cap-word").forEach((word) => {
        const ws = start + parseFloat(word.dataset.ws);
        const we = Math.max(ws + 0.06, start + parseFloat(word.dataset.we));
        const c = CAP_COLORS[word.dataset.emph] || CAP_COLORS.base;

        // Chữ chưa đọc mờ → sáng hẳn khi được đọc, kèm pop
        // (immediateRender:false để chữ chưa đọc không bị phóng to sẵn 1.22)
        tl.set(word, { opacity: 1 }, ws);
        tl.fromTo(word, { scale: 1.22 }, { scale: 1, duration: 0.14, ease: "back.out(2.5)", immediateRender: false }, ws);
        // Chip highlight trong lúc đọc, sau đó giữ màu "đã đọc"
        tl.set(word, { backgroundColor: c.chip, color: c.chipText }, ws);
        tl.set(word, { backgroundColor: "rgba(0,0,0,0)", color: c.rest }, we);
      });
    });
  }

  // ── HOOK ──────────────────────────────────────────────────────────────
  function animateHook(scene, tl, start) {
    const badge = scene.querySelector(".hook-badge");
    if (badge) {
      // Con dấu "TIN NÓNG" đập xuống
      tl.fromTo(badge, { scale: 3, opacity: 0, rotation: -12 }, { scale: 1, opacity: 1, rotation: -3, duration: 0.22, ease: "power4.in" }, start + 0.05);
      tl.fromTo(badge, { y: -6 }, { y: 0, duration: 0.15, ease: "bounce.out" }, start + 0.27);
    }

    const headline = scene.querySelector(".hook-headline");
    if (headline) {
      tl.fromTo(headline, { scale: 0.94, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.22, ease: "power3.out" }, start + 0.18);
      // Từng chữ tiêu đề slam vào
      const words = headline.querySelectorAll(".hw");
      words.forEach((w, i) => {
        tl.fromTo(w, { y: 70, opacity: 0, rotation: 4 }, { y: 0, opacity: 1, rotation: 0, duration: 0.3, ease: "back.out(1.8)" }, start + 0.28 + i * 0.07);
      });
      const mask = headline.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-100%" }, { x: "100%", duration: 0.6 }, start + 0.3 + words.length * 0.07 + 0.2);
      }
    }

    const subhead = scene.querySelector(".hook-subhead");
    if (subhead) {
      tl.fromTo(subhead, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, start + 0.55);
    }
  }

  // ── COMPARISON ────────────────────────────────────────────────────────
  function animateComparison(scene, tl, start) {
    const leftCard = scene.querySelector(".cmp-left");
    if (leftCard) {
      tl.fromTo(leftCard, { x: -150, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "power4.out" }, start + 0.1);
    }

    const vs = scene.querySelector(".cmp-vs");
    if (vs) {
      tl.fromTo(vs, { scale: 2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.25, ease: "power3.out" }, start + 0.3);
    }

    const rightCard = scene.querySelector(".cmp-right");
    if (rightCard) {
      tl.fromTo(rightCard, { x: 150, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "power4.out" }, start + 0.4);
    }

    const winner = scene.querySelector(".cmp-winner-badge");
    if (winner) {
      tl.fromTo(winner, { scale: 2.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: "power4.in" }, start + 0.75);
    }
  }

  // ── STAT HERO (số đếm chạy) ───────────────────────────────────────────
  function animateStatHero(scene, tl, start) {
    const value = scene.querySelector(".stat-value");
    if (value) {
      tl.fromTo(value, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "power4.out" }, start + 0.1);
      setupCountUp(value, tl, start + 0.15);
      const mask = value.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-100%" }, { x: "100%", duration: 0.6 }, start + 1.15);
      }
    }

    const label = scene.querySelector(".stat-label");
    if (label) {
      tl.fromTo(label, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, start + 0.45);
    }

    const context = scene.querySelector(".stat-context");
    if (context) {
      tl.fromTo(context, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, start + 0.65);
    }
  }

  /**
   * Số đếm 0 → giá trị thật (data-cu-* do composer sinh).
   * Bọc text node vào span riêng để không phá shimmer-mask.
   */
  function setupCountUp(el, tl, at) {
    if (el.dataset.cu !== "1") return;
    const target = parseFloat(el.dataset.cuTarget);
    if (isNaN(target)) return;
    const dec = parseInt(el.dataset.cuDec || "0", 10);
    const group = el.dataset.cuGroup || "";
    const prefix = el.dataset.cuPrefix || "";
    const suffix = el.dataset.cuSuffix || "";
    const decSep = group === "." ? "," : ".";

    // Gom các text node hiện có vào 1 span (giữ shimmer-mask nguyên vẹn)
    const span = document.createElement("span");
    span.className = "cu-text";
    const textNodes = Array.from(el.childNodes).filter((n) => n.nodeType === 3);
    span.textContent = textNodes.map((n) => n.nodeValue).join("").trim();
    textNodes.forEach((n) => n.remove());
    el.insertBefore(span, el.firstChild);

    const fmt = (v) => {
      const neg = v < 0 ? "-" : "";
      const s = Math.abs(v).toFixed(dec);
      const parts = s.split(".");
      let intPart = parts[0];
      if (group) intPart = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, group);
      return prefix + neg + intPart + (parts[1] ? decSep + parts[1] : "") + suffix;
    };

    const proxy = { v: 0 };
    tl.fromTo(
      proxy,
      { v: 0 },
      {
        v: target,
        duration: 0.9,
        ease: "power2.out",
        onUpdate: () => { span.textContent = fmt(proxy.v); },
      },
      at
    );
  }

  // ── FEATURE LIST ──────────────────────────────────────────────────────
  function animateFeatureList(scene, tl, start) {
    const card = scene.querySelector(".feat-card");
    if (card) {
      tl.fromTo(card, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, start + 0.05);
    }

    const rule = scene.querySelector(".feat-rule");
    if (rule) {
      tl.fromTo(rule, { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1, duration: 0.25 }, start + 0.3);
    }

    const bullets = scene.querySelectorAll(".feat-bullet");
    bullets.forEach((b, i) => {
      tl.fromTo(b, { x: -30, opacity: 0 }, { x: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, start + 0.4 + i * 0.12);
      const dot = b.querySelector(".feat-dot");
      if (dot) {
        tl.fromTo(dot, { scale: 0 }, { scale: 1, duration: 0.2, ease: "back.out(3)" }, start + 0.42 + i * 0.12);
      }
    });
  }

  // ── CALLOUT ───────────────────────────────────────────────────────────
  function animateCallout(scene, tl, start) {
    const card = scene.querySelector(".callout-card");
    if (card) {
      tl.fromTo(card, { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power4.out" }, start + 0.1);
    }
    const tag = scene.querySelector(".callout-tag");
    if (tag) {
      tl.fromTo(tag, { scale: 1.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.2, ease: "power3.in" }, start + 0.3);
    }
  }

  // ── CHART (giá crypto) ────────────────────────────────────────────────
  function animateChart(scene, tl, start, dur) {
    const card = scene.querySelector(".chart-card");
    if (card) {
      tl.fromTo(card, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power3.out" }, start + 0.05);
    }

    const grids = scene.querySelectorAll(".chart-grid");
    grids.forEach((g, i) => {
      tl.fromTo(g, { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power2.out" }, start + 0.25 + i * 0.08);
    });

    const line = scene.querySelector(".chart-line");
    if (line && typeof line.getTotalLength === "function") {
      const L = line.getTotalLength();
      gsap.set(line, { strokeDasharray: L, strokeDashoffset: L });
      tl.to(line, { strokeDashoffset: 0, duration: 1.2, ease: "power2.inOut" }, start + 0.45);
    }

    const area = scene.querySelector(".chart-area");
    if (area) {
      tl.fromTo(area, { opacity: 0 }, { opacity: 1, duration: 0.45, ease: "power2.out" }, start + 1.2);
    }

    const dot = scene.querySelector(".chart-dot");
    if (dot) {
      tl.fromTo(dot, { opacity: 0, scale: 0, transformOrigin: "center center" }, { opacity: 1, scale: 1, duration: 0.25, ease: "back.out(2)" }, start + 1.6);
      const pulses = Math.max(1, Math.ceil((dur - 2.2) / 0.6));
      tl.to(dot, { scale: 1.45, duration: 0.6, yoyo: true, repeat: pulses, ease: "sine.inOut" }, start + 1.9);
    }

    const badge = scene.querySelector(".chart-badge");
    if (badge) {
      tl.fromTo(badge, { opacity: 0, scale: 2.2 }, { opacity: 1, scale: 1, duration: 0.22, ease: "power4.in" }, start + 1.65);
    }

    const label = scene.querySelector(".chart-label");
    if (label) {
      tl.fromTo(label, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, start + 1.0);
    }
  }

  // ── OUTRO ─────────────────────────────────────────────────────────────
  function animateOutro(scene, tl, start, dur) {
    const cta = scene.querySelector(".out-cta-top");
    if (cta) {
      tl.fromTo(cta, { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }, start + 0.1);
    }

    const channel = scene.querySelector(".out-channel");
    if (channel) {
      tl.fromTo(channel, { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.3, ease: "power4.out" }, start + 0.3);
    }

    const underline = scene.querySelector(".out-underline");
    if (underline) {
      tl.fromTo(underline, { width: 0 }, { width: "600px", duration: 0.35 }, start + 0.55);
    }

    const source = scene.querySelector(".out-source");
    if (source) {
      tl.fromTo(source, { opacity: 0, y: 15 }, { opacity: 1, y: 0, duration: 0.25, ease: "power2.out" }, start + 0.75);
    }

    // Thẻ TikTok Follow Card cuối video
    const ttCard = scene.querySelector("#tt-card");
    if (ttCard) {
      const ttBtn      = scene.querySelector("#tt-follow-btn");
      const ttFollow   = scene.querySelector("#tt-btn-follow");
      const ttFollwing = scene.querySelector("#tt-btn-following");
      const ttBase     = start + 1.1;

      tl.fromTo(ttCard, { opacity: 0, y: 200 }, { opacity: 1, y: 0, duration: 0.35, ease: "power4.out" }, ttBase);

      if (ttBtn) {
        tl.to(ttBtn, { scale: 0.9, duration: 0.1 }, ttBase + 0.6);
        tl.to(ttBtn, { scale: 1, duration: 0.2, ease: "power2.out" }, ttBase + 0.7);
      }

      if (ttFollow) {
        tl.to(ttFollow, { opacity: 0, duration: 0.05 }, ttBase + 0.7);
      }
      if (ttFollwing) {
        tl.to(ttFollwing, { opacity: 1, duration: 0.05 }, ttBase + 0.72);
      }

      const holdStart = ttBase + 0.85;
      const holdEnd   = start + dur - 0.05;
      const holdLen   = Math.max(0.2, holdEnd - holdStart);
      tl.to(ttCard, { scale: 1.05, duration: holdLen, ease: "none" }, holdStart);
    }
  }
})();
