// Cyberpunk Visual Engine — Fast, snappy, aggressive tech motion
// HyperFrames dùng window.__timelines["news-video"] để kéo từng khung hình!

window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["news-video"] = tl;

(function () {
  // Inject bột shimmer khớp hoạt ảnh nền
  document.querySelectorAll(".shimmer-sweep-target").forEach((el) => {
    if (!el.querySelector(".shimmer-mask")) {
      const mask = document.createElement("div");
      mask.className = "shimmer-mask";
      el.appendChild(mask);
    }
  });

  const stage = document.getElementById("stage");
  const scenes = Array.from(stage.querySelectorAll(".scene"));

  // ── Điều phối chuyển cảnh ──────────────────────────────────────────
  scenes.forEach((scene) => {
    const start = parseFloat(scene.dataset.start);
    const dur   = parseFloat(scene.dataset.duration);
    const layout = scene.dataset.layout;

    // Bật tắt Scene theo chuẩn quy định HyperFrames
    tl.set(scene, { opacity: 1 }, start);
    tl.set(scene, { opacity: 0 }, start + dur);

    // Truy xuất đúng thành phần class từ html-composer.ts sinh ra
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
    } else if (layout === "outro") {
      animateOutro(scene, tl, start, dur);
    }
  });

  // ── HOOK ──────────────────────────────────────────────────────────────
  function animateHook(scene, tl, start) {
    const headline = scene.querySelector(".hook-headline");
    if (headline) {
      tl.fromTo(headline, { scale: 1.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "power4.out" }, start + 0.1);
      const mask = headline.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-100%" }, { x: "100%", duration: 0.6 }, start + 0.55);
      }
    }

    const subhead = scene.querySelector(".hook-subhead");
    if (subhead) {
      tl.fromTo(subhead, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.25, ease: "power2.out" }, start + 0.4);
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
  }

  // ── STAT HERO ─────────────────────────────────────────────────────────
  function animateStatHero(scene, tl, start) {
    const value = scene.querySelector(".stat-value");
    if (value) {
      tl.fromTo(value, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35, ease: "power4.out" }, start + 0.1);
      const mask = value.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-100%" }, { x: "100%", duration: 0.6 }, start + 0.5);
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
    });
  }

  // ── CALLOUT ───────────────────────────────────────────────────────────
  function animateCallout(scene, tl, start) {
    const card = scene.querySelector(".callout-card");
    if (card) {
      tl.fromTo(card, { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.35, ease: "power4.out" }, start + 0.1);
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