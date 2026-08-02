// MAI CRYPTO motion engine — @oncoinx2 style.
// All time-based motion lives in a PAUSED GSAP timeline because HyperFrames
// scrubs the timeline frame-by-frame (deterministic). CSS holds static state.

window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["news-video"] = tl;

(function () {
  const stage = document.getElementById("stage");
  const totalDur = parseFloat(stage.dataset.duration) || 60;
  const scenes = Array.from(stage.querySelectorAll(".mc-scene"));
  const flash = stage.querySelector(".mc-flash");

  // Subtle life on the persistent centre watermark
  const wm = stage.querySelector(".mc-watermark");
  if (wm) tl.fromTo(wm, { opacity: 0.06 }, { opacity: 0.12, duration: totalDur, ease: "none" }, 0);

  scenes.forEach((scene, sceneIdx) => {
    const start = parseFloat(scene.dataset.start);
    const dur = parseFloat(scene.dataset.duration);
    const layout = scene.dataset.layout;

    // Scene on/off (HyperFrames opacity contract)
    tl.set(scene, { opacity: 1 }, start);
    tl.set(scene, { opacity: 0 }, start + dur);

    // White-flash cut + gentle zoom-punch on the image band (skip very first)
    if (sceneIdx > 0 && flash) {
      tl.fromTo(flash, { opacity: 0.9 }, { opacity: 0, duration: 0.26, ease: "power2.out", immediateRender: false }, start);
    }

    // Blurred fill parallax (slow push-in)
    const fill = scene.querySelector(".mc-fill");
    if (fill && !fill.classList.contains("mc-fill-gradient")) {
      tl.fromTo(fill, { scale: 1.14 }, { scale: 1.24, duration: Math.max(0.5, dur), ease: "none" }, start);
    }

    // Ken Burns on any [data-kb] element (photo / doc / subject)
    scene.querySelectorAll("[data-kb]:not(.mc-cell)").forEach((el) => animateKenBurns(el, tl, start, dur, sceneIdx));

    if (layout === "hook-split") animateHookSplit(scene, tl, start, dur);
    else if (layout === "hook-collage") animateHookCollage(scene, tl, start, dur);
    else if (layout === "finance-hook") animateFinanceHook(scene, tl, start, dur);
    else if (layout === "image") animateImage(scene, tl, start);
    else if (layout === "document") animateDocument(scene, tl, start);
    else if (layout === "brand-outro") animateOutro(scene, tl, start, dur);
  });

  // ── HOOK SPLIT ───────────────────────────────────────────────────────────
  // Ảnh nửa trên đứng yên trôi nhẹ (Ken Burns chung lo), khối màu trượt lên,
  // logo kênh hiện ra, rồi câu tóm tắt chạy vào từng chữ.
  function animateHookSplit(scene, tl, start, dur) {
    const veil = scene.querySelector(".mc-split-veil");
    if (veil) tl.fromTo(veil, { opacity: 0, yPercent: 8 }, { opacity: 1, yPercent: 0, duration: 0.55, ease: "power2.out" }, start + 0.05);

    const wm = scene.querySelector(".mc-split-wordmark");
    if (wm) tl.fromTo(wm, { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.36, ease: "power3.out" }, start + 0.34);

    const badge = scene.querySelector(".mc-split-panel .mc-badge");
    if (badge) {
      tl.fromTo(badge, { scale: 1.8, opacity: 0, rotation: -5 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.24, ease: "power4.in" }, start + 0.5);
      tl.to(badge, { scale: 1.06, duration: 0.5, yoyo: true, repeat: Math.max(1, Math.floor(dur / 1.2)), ease: "sine.inOut" }, start + 0.8);
    }
    const kicker = scene.querySelector(".mc-split-panel .mc-kicker");
    if (kicker) tl.fromTo(kicker, { x: -22, opacity: 0 }, { x: 0, opacity: 1, duration: 0.26, ease: "power2.out" }, start + 0.6);

    const words = scene.querySelectorAll(".mc-split-summary .mc-w");
    words.forEach((w, i) => {
      tl.fromTo(w, { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "back.out(1.5)" }, start + 0.6 + i * 0.045);
    });

    // chủ thể cắt rời trồi lên qua ranh giới
    const subject = scene.querySelector(".mc-split-subject");
    if (subject) tl.fromTo(subject, { y: 54, opacity: 0, scale: 1.04 }, { y: 0, opacity: 1, scale: 1, duration: 0.5, ease: "power3.out" }, start + 0.02);

    // đồng xu ở đáy trôi rất chậm
    scene.querySelectorAll(".mc-split-coin").forEach((c, i) => {
      const dx = (i % 2 ? 1 : -1) * (10 + (i % 3) * 6);
      const dy = (i % 2 ? -1 : 1) * (12 + (i % 4) * 5);
      tl.fromTo(c, { x: 0, y: 0 }, { x: dx, y: dy, duration: Math.max(2, dur), yoyo: true, repeat: 1, ease: "sine.inOut" }, start);
    });

    const tags = scene.querySelectorAll(".mc-pricetags-split .mc-tag");
    tags.forEach((t, i) => {
      tl.fromTo(t, { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "back.out(1.6)" }, start + 0.45 + i * 0.12);
    });
  }

  // ── HOOK COLLAGE ─────────────────────────────────────────────────────────
  // Cells wipe in one after another, gold seams draw, then the bottom brand
  // panel builds: rule → badge → kicker → headline words → price tags.
  function animateHookCollage(scene, tl, start, dur) {
    const cells = scene.querySelectorAll(".mc-cell");
    cells.forEach((c, i) => {
      // direction alternates so the collage assembles rather than pops
      const dx = i === 0 ? -90 : i === 1 ? 90 : 0;
      const dy = i === 2 ? 90 : 0;
      tl.fromTo(
        c,
        { x: dx, y: dy, opacity: 0, scale: 1.16 },
        { x: 0, y: 0, opacity: 1, scale: 1.06, duration: 0.42, ease: "power3.out" },
        start + i * 0.11,
      );
      // slow drift for the rest of the beat (its own Ken Burns)
      const kb = c.dataset.kb || "zoom-in";
      const rest = Math.max(0.6, dur - 0.5);
      if (kb === "zoom-out") {
        tl.to(c, { scale: 1.0, duration: rest, ease: "none" }, start + 0.45);
      } else if (kb === "pan-right") {
        tl.fromTo(c, { xPercent: -2.5 }, { xPercent: 2.5, duration: rest, ease: "none" }, start + 0.45);
      } else if (kb === "pan-left") {
        tl.fromTo(c, { xPercent: 2.5 }, { xPercent: -2.5, duration: rest, ease: "none" }, start + 0.45);
      } else {
        tl.to(c, { scale: 1.15, duration: rest, ease: "none" }, start + 0.45);
      }
    });

    // gold seams draw in
    scene.querySelectorAll(".mc-seam-v").forEach((sm, i) => {
      tl.fromTo(sm, { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.34, ease: "power2.out", transformOrigin: "50% 0%" }, start + 0.3 + i * 0.06);
    });
    scene.querySelectorAll(".mc-seam-h").forEach((sm, i) => {
      tl.fromTo(sm, { scaleX: 0, opacity: 0 }, { scaleX: 1, opacity: 1, duration: 0.34, ease: "power2.out", transformOrigin: "0% 50%" }, start + 0.3 + i * 0.06);
    });

    // cell captions
    scene.querySelectorAll(".mc-cell-tag").forEach((t, i) => {
      tl.fromTo(t, { x: -24, opacity: 0 }, { x: 0, opacity: 1, duration: 0.26, ease: "power2.out" }, start + 0.5 + i * 0.08);
    });

    // bottom panel: gold rule wipes, then content stacks in
    const panel = scene.querySelector(".mc-hookpanel");
    if (panel) {
      tl.fromTo(panel, { y: 70, opacity: 0 }, { y: 0, opacity: 1, duration: 0.42, ease: "power3.out" }, start + 0.22);
    }
    const badge = scene.querySelector(".mc-badge");
    if (badge) {
      tl.fromTo(badge, { scale: 1.9, opacity: 0, rotation: -6 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.26, ease: "power4.in" }, start + 0.42);
      // heartbeat so the "TIN NÓNG" stamp keeps living through the beat
      tl.to(badge, { scale: 1.06, duration: 0.5, yoyo: true, repeat: Math.max(1, Math.floor(dur / 1.2)), ease: "sine.inOut" }, start + 0.75);
    }
    const kicker = scene.querySelector(".mc-kicker");
    if (kicker) tl.fromTo(kicker, { x: -26, opacity: 0 }, { x: 0, opacity: 1, duration: 0.28, ease: "power2.out" }, start + 0.55);

    const words = scene.querySelectorAll(".mc-hook-headline .mc-w");
    words.forEach((w, i) => {
      tl.fromTo(w, { y: 70, opacity: 0, rotationX: -35 }, { y: 0, opacity: 1, rotationX: 0, duration: 0.32, ease: "back.out(1.8)" }, start + 0.6 + i * 0.06);
    });

    const tags = scene.querySelectorAll(".mc-hook-tags .mc-tag");
    tags.forEach((t, i) => {
      tl.fromTo(t, { y: 26, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: "back.out(1.5)" }, start + 0.95 + i * 0.1);
    });
  }

  // ── KEN BURNS ────────────────────────────────────────────────────────────
  function animateKenBurns(el, tl, start, dur, sceneIdx) {
    const kind = el.dataset.kb || "zoom-in";
    const d = Math.max(0.5, dur);
    // First scene has no punch; later scenes get a small settle at the cut.
    const punch = sceneIdx > 0 ? 0.04 : 0;
    if (kind === "zoom-in") {
      tl.fromTo(el, { scale: 1.0 + punch }, { scale: 1.14, duration: d, ease: "none" }, start);
    } else if (kind === "zoom-out") {
      tl.fromTo(el, { scale: 1.16 }, { scale: 1.02, duration: d, ease: "none" }, start);
    } else if (kind === "pan-left") {
      tl.fromTo(el, { scale: 1.12, xPercent: 4 }, { scale: 1.12, xPercent: -4, duration: d, ease: "none" }, start);
    } else if (kind === "pan-right") {
      tl.fromTo(el, { scale: 1.12, xPercent: -4 }, { scale: 1.12, xPercent: 4, duration: d, ease: "none" }, start);
    }
  }

  // ── IMAGE SCENE ──────────────────────────────────────────────────────────
  function animateImage(scene, tl, start) {
    animateCaption(scene, tl, start);
  }

  // Caption dùng chung: mọi beat vào cùng một kiểu, cùng nhịp.
  function animateCaption(scene, tl, start) {
    scene.querySelectorAll(".mc-caption .mc-w").forEach((w, i) => {
      tl.fromTo(w, { y: 46, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: "back.out(1.6)" }, start + 0.16 + i * 0.055);
    });
  }

  // ── DOCUMENT SCENE ───────────────────────────────────────────────────────
  function animateDocument(scene, tl, start) {
    animateCaption(scene, tl, start);
  }

  // ── FINANCE HOOK ─────────────────────────────────────────────────────────
  function animateFinanceHook(scene, tl, start, dur) {
    // Candles grow up, staggered
    const bodies = scene.querySelectorAll(".mc-body");
    bodies.forEach((b, i) => {
      tl.fromTo(b, { scaleY: 0, opacity: 0 }, { scaleY: 1, opacity: 1, duration: 0.4, ease: "power2.out" }, start + 0.1 + i * 0.02);
    });

    // Coins drift slowly for the whole scene
    const coins = scene.querySelectorAll(".mc-coin");
    coins.forEach((c, i) => {
      const dx = (i % 2 ? 1 : -1) * (18 + (i % 3) * 10);
      const dy = (i % 2 ? -1 : 1) * (22 + (i % 4) * 8);
      tl.fromTo(c, { x: 0, y: 0 }, { x: dx, y: dy, duration: Math.max(2, dur), yoyo: true, repeat: 1, ease: "sine.inOut" }, start);
    });

    // Subject figure rise
    const subject = scene.querySelector(".mc-fin-subject");
    if (subject) tl.fromTo(subject, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, ease: "power3.out" }, start + 0.1);

    // Price tags pop in
    const tags = scene.querySelectorAll(".mc-tag");
    tags.forEach((t, i) => {
      tl.fromTo(t, { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.3, ease: "back.out(1.6)" }, start + 0.5 + i * 0.14);
    });

    // Badge slam
    const badge = scene.querySelector(".mc-badge");
    if (badge) {
      tl.fromTo(badge, { scale: 2.4, opacity: 0, rotation: -8 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.24, ease: "power4.in" }, start + 0.2);
    }

    // Headline word slam
    const words = scene.querySelectorAll(".mc-headline .mc-w");
    words.forEach((w, i) => {
      tl.fromTo(w, { y: 80, opacity: 0, rotationX: -40 }, { y: 0, opacity: 1, rotationX: 0, duration: 0.34, ease: "back.out(1.8)" }, start + 0.42 + i * 0.07);
    });
  }

  // ── BRAND OUTRO ──────────────────────────────────────────────────────────
  function animateOutro(scene, tl, start, dur) {
    const rays = scene.querySelector(".mc-out-rays");
    if (rays) tl.fromTo(rays, { rotation: 0, opacity: 0 }, { rotation: 40, opacity: 0.5, duration: Math.max(1, dur), ease: "none", transformOrigin: "50% 42%" }, start);

    const logo = scene.querySelector(".mc-out-logo");
    if (logo) {
      tl.fromTo(logo, { scale: 0.4, opacity: 0, rotation: -30 }, { scale: 1, opacity: 1, rotation: 0, duration: 0.5, ease: "back.out(1.7)" }, start + 0.1);
    }
    const name = scene.querySelector(".mc-out-name");
    if (name) tl.fromTo(name, { scale: 1.25, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "power4.out" }, start + 0.4);

    const handle = scene.querySelector(".mc-out-handle");
    if (handle) tl.fromTo(handle, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, start + 0.6);

    const underline = scene.querySelector(".mc-out-underline");
    if (underline) tl.fromTo(underline, { width: 0 }, { width: 420, duration: 0.4, ease: "power2.out" }, start + 0.7);

    const cta = scene.querySelector(".mc-out-cta");
    if (cta) tl.fromTo(cta, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, start + 0.85);

    const source = scene.querySelector(".mc-out-source");
    if (source) tl.fromTo(source, { opacity: 0 }, { opacity: 1, duration: 0.3 }, start + 1.05);
  }
})();
