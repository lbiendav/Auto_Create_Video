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
    scene.querySelectorAll("[data-kb]").forEach((el) => animateKenBurns(el, tl, start, dur, sceneIdx));

    if (layout === "finance-hook") animateFinanceHook(scene, tl, start, dur);
    else if (layout === "image") animateImage(scene, tl, start);
    else if (layout === "document") animateDocument(scene, tl, start);
    else if (layout === "brand-outro") animateOutro(scene, tl, start, dur);
  });

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
    const words = scene.querySelectorAll(".mc-overlay-headline .mc-w");
    words.forEach((w, i) => {
      tl.fromTo(w, { y: 54, opacity: 0 }, { y: 0, opacity: 1, duration: 0.28, ease: "back.out(1.7)" }, start + 0.15 + i * 0.06);
    });
    const label = scene.querySelector(".mc-label");
    if (label) tl.fromTo(label, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, start + 0.2);
  }

  // ── DOCUMENT SCENE ───────────────────────────────────────────────────────
  function animateDocument(scene, tl, start) {
    const chip = scene.querySelector(".mc-doc-chip");
    if (chip) tl.fromTo(chip, { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.3, ease: "power2.out" }, start + 0.15);
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
