// Nicole Lee portfolio — interaction layer.
// Built on Apple's fluid-interface rules: respond on press, track 1:1, springs that start from the
// current on-screen value, hand off velocity, and can be grabbed and reversed at any moment.
// Everything is progressive: the site reads fine without JS.
(() => {
  const doc = document.documentElement;
  doc.classList.add("js");

  // Always open a page at the top (unless a #section was linked). Some hosts and browsers
  // carry the previous page's scroll position over when you follow a link.
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  const toTop = () => { if (!location.hash || location.hash.startsWith("#room=")) window.scrollTo({ top: 0, left: 0, behavior: "instant" }); };
  toTop();
  addEventListener("DOMContentLoaded", toTop);
  addEventListener("load", toTop);
  addEventListener("pageshow", (e) => { if (e.persisted) toTop(); });
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const finePointer = matchMedia("(hover: hover) and (pointer: fine)").matches;

  // iOS only applies :active on press when a touch listener exists. Feedback must start on press.
  addEventListener("touchstart", () => {}, { passive: true });

  // ---------------------------------------------------------------------------
  // Spring: Apple's two designer parameters. damping 1 = no overshoot; response = seconds to settle-ish.
  // Always continues from its current value and velocity, so a new target never causes a jump.
  class Spring {
    constructor(value, { damping = 1, response = 0.4 } = {}) {
      this.x = value; this.v = 0; this.target = value; this.set(damping, response);
      this.raf = 0; this.onUpdate = null; this.onRest = null;
    }
    set(damping, response) {
      this.k = Math.pow((2 * Math.PI) / response, 2);
      this.c = (4 * Math.PI * damping) / response;
      return this;
    }
    to(target, velocity) {
      this.target = target;
      if (velocity !== undefined) this.v = velocity;
      if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame((t) => this.tick(t)); }
    }
    jump(value) { this.stop(); this.x = this.target = value; this.v = 0; this.onUpdate?.(this.x); }
    stop() { cancelAnimationFrame(this.raf); this.raf = 0; }
    tick(now) {
      let dt = Math.min(0.064, (now - this.last) / 1000); this.last = now;
      while (dt > 0) { // fixed small sub-steps keep it stable on slow frames
        const h = Math.min(dt, 1 / 240);
        const a = -this.k * (this.x - this.target) - this.c * this.v;
        this.v += a * h; this.x += this.v * h; dt -= h;
      }
      const scale = Math.max(1, Math.abs(this.target));
      if (Math.abs(this.x - this.target) < 0.0005 * scale && Math.abs(this.v) < 0.01 * scale) {
        this.x = this.target; this.v = 0; this.raf = 0; this.onUpdate?.(this.x); this.onRest?.(this.x); return;
      }
      this.onUpdate?.(this.x);
      this.raf = requestAnimationFrame((t) => this.tick(t));
    }
  }
  // Where a flick would come to rest (Apple's projection, scroll-like deceleration).
  const project = (v, d = 0.998) => ((v / 1000) * d) / (1 - d);
  // Soft edge: the further past the bound, the less it follows.
  const rubberband = (over, dim, c = 0.55) => (over * dim * c) / (dim + c * Math.abs(over));

  // ---------------------------------------------------------------------------
  // 1. Hero: selection frame lands once the name has written itself in.
  const heroSel = document.querySelector("[data-hero-select]");
  if (heroSel) setTimeout(() => heroSel.classList.add("is-selected"), reduce ? 0 : 900);

  // 2. Scroll reveals, once, with a short stagger inside each group.
  const items = document.querySelectorAll(".reveal, .wipe");
  document.querySelectorAll("[data-stagger]").forEach((group) => {
    group.querySelectorAll(":scope > .reveal").forEach((el, i) => el.style.setProperty("--i", Math.min(i, 6)));
  });
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("in"); io.unobserve(e.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    items.forEach((el) => io.observe(el));
  } else items.forEach((el) => el.classList.add("in"));

  // 3. Header material: the scroll-edge shade only appears once content is actually underneath it.
  const head = document.querySelector(".site-head");
  if (head) {
    const onScroll = () => head.classList.toggle("is-scrolled", scrollY > 8);
    addEventListener("scroll", onScroll, { passive: true }); onScroll();
  }

  // 4. Nav wayfinding: the link for the section you're reading is marked current.
  //    "Reading" = the last section whose top has passed a line near the top of the screen,
  //    so the highlight always matches the heading you jumped to.
  const navLinks = [...document.querySelectorAll(".nav a")].filter((a) => {
    const u = new URL(a.href, location.href);
    return u.pathname === location.pathname && u.hash && document.getElementById(u.hash.slice(1));
  });
  const spyTargets = navLinks.map((a) => [a, document.getElementById(new URL(a.href, location.href).hash.slice(1))])
    .sort((x, y) => x[1].getBoundingClientRect().top - y[1].getBoundingClientRect().top);
  if (spyTargets.length) {
    let lockUntil = 0, ticking = false;
    const mark = (active) => {
      navLinks.forEach((a) => a.removeAttribute("aria-current"));
      if (active) active.setAttribute("aria-current", "location");
      const parentPage = document.querySelector('.nav > a[href$="' + location.pathname.split("/").pop() + '#top"]');
    };
    const update = () => {
      ticking = false;
      if (performance.now() < lockUntil) return;
      const line = Math.min(innerHeight * 0.3, 260);
      let active = null;
      for (const [a, s] of spyTargets) if (s.getBoundingClientRect().top <= line) active = a;
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) active = spyTargets[spyTargets.length - 1][0];
      mark(active);
    };
    addEventListener("scroll", () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
    navLinks.forEach((a) => a.addEventListener("click", () => { mark(a); lockUntil = performance.now() + 900; setTimeout(update, 950); }));
    addEventListener("load", update); update();
  }

  // 5. Cursor readout: two independent critically damped springs (x and y never desync).
  const readout = document.querySelector(".readout");
  if (readout && finePointer) {
    const xs = readout.querySelector("[data-x]"), ys = readout.querySelector("[data-y]");
    const sx = new Spring(0, { damping: 1, response: 0.3 }), sy = new Spring(0, { damping: 1, response: 0.3 });
    sx.onUpdate = (v) => (xs.textContent = String(Math.round(v)).padStart(4, "0"));
    sy.onUpdate = (v) => (ys.textContent = String(Math.round(v)).padStart(4, "0"));
    addEventListener("pointermove", (e) => {
      if (reduce) { sx.jump(e.clientX); sy.jump(e.clientY + scrollY); return; }
      sx.to(e.clientX); sy.to(e.clientY + scrollY);
    }, { passive: true });
  }

  // 6. Work card layer tab shows the real rendered size, like Figma's W × H.
  document.querySelectorAll(".card").forEach((card) => {
    const media = card.querySelector(".card__media"), tab = card.querySelector(".sel__tab [data-size]");
    if (!media || !tab) return;
    const set = () => { const r = media.getBoundingClientRect(); tab.textContent = `${Math.round(r.width)}×${Math.round(r.height)}`; };
    card.addEventListener("pointerenter", set); card.addEventListener("focus", set);
  });

  // 7. Copy email: confirmation appears beside the button that caused it.
  document.querySelectorAll("[data-copy]").forEach((btn) => {
    const note = btn.parentElement.querySelector(".copied");
    btn.addEventListener("click", async () => {
      try {
        await navigator.clipboard.writeText(btn.dataset.copy);
        if (note) { note.classList.add("show"); setTimeout(() => note.classList.remove("show"), 1600); }
      } catch { location.href = "mailto:" + btn.dataset.copy; }
    });
  });

  // 8. Case study contents: highlight the section in view.
  //    The active section is the last one whose top has passed a reading line near the top of
  //    the screen, so the highlight always matches the heading you're looking at.
  const toc = [...document.querySelectorAll(".toc a")];
  const tocTargets = toc.map((a) => [a, document.getElementById(a.getAttribute("href").slice(1))]).filter(([, s]) => s);
  if (tocTargets.length) {
    let ticking = false, current = null;
    const update = () => {
      ticking = false;
      const head = document.querySelector(".site-head");
      const headH = head && getComputedStyle(head).position === "sticky" ? head.offsetHeight : 0;
      const line = headH + Math.min(innerHeight * 0.25, 220);
      let active = tocTargets[0][0];
      for (const [a, s] of tocTargets) { if (s.getBoundingClientRect().top <= line) active = a; else break; }
      // At the very bottom, short last sections can never reach the line: select the last one.
      if (innerHeight + scrollY >= document.documentElement.scrollHeight - 4) active = tocTargets[tocTargets.length - 1][0];
      if (active !== current) {
        toc.forEach((a) => { a.classList.remove("active"); a.removeAttribute("aria-current"); });
        active.classList.add("active"); active.setAttribute("aria-current", "location"); current = active;
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    addEventListener("scroll", onScroll, { passive: true });
    addEventListener("resize", onScroll);
    update();
  }

  // 9. Image viewer.
  //    Opens out of the image you tapped and closes back into it (same path both ways).
  //    Drag it 1:1 from where you grabbed it; flick down or up to dismiss (momentum is projected);
  //    let go gently and it springs home. Grab it mid-close and it follows your finger again.
  // 8b. Slide deck viewer: swipe/scroll-snap track, prev/next buttons, arrow keys, live counter.
  document.querySelectorAll("[data-deck]").forEach((deck) => {
    const track = deck.querySelector(".deck__track"), slides = [...track.children];
    const prev = deck.querySelector("[data-prev]"), next = deck.querySelector("[data-next]"), cur = deck.querySelector("[data-cur]");
    let i = 0;
    const sync = () => {
      i = Math.round(track.scrollLeft / track.clientWidth);
      cur.textContent = i + 1; prev.disabled = i === 0; next.disabled = i === slides.length - 1;
    };
    const go = (n) => { n = Math.max(0, Math.min(slides.length - 1, n)); track.scrollTo({ left: n * track.clientWidth, behavior: reduce ? "auto" : "smooth" }); };
    prev.addEventListener("click", () => go(i - 1));
    next.addEventListener("click", () => go(i + 1));
    track.addEventListener("keydown", (e) => { if (e.key === "ArrowRight") { e.preventDefault(); go(i + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); go(i - 1); } });
    let t; track.addEventListener("scroll", () => { cancelAnimationFrame(t); t = requestAnimationFrame(sync); }, { passive: true });
    addEventListener("resize", () => go(i));
    sync();
  });

  const zoomables = document.querySelectorAll(".cs-cover img, .figure img, .cs-hero + .wrap img, .pair img, .wf img, .print img, .page img");
  if (zoomables.length) {
    const lb = document.createElement("div");
    lb.className = "lb"; lb.hidden = true;
    lb.setAttribute("role", "dialog"); lb.setAttribute("aria-modal", "true"); lb.setAttribute("aria-label", "Image viewer");
    lb.innerHTML = '<div class="lb__scrim"></div><img class="lb__img" alt="" draggable="false"><button class="lb__close" type="button">Close</button><p class="lb__hint">Drag down to close</p>';
    document.body.append(lb);
    const scrim = lb.querySelector(".lb__scrim"), big = lb.querySelector(".lb__img"), closeBtn = lb.querySelector(".lb__close");

    let source = null, from = null, lastFocus = null;
    const p = new Spring(0, { damping: 1, response: 0.42 }); // 0 = sitting on the page, 1 = open
    const dy = new Spring(0, { damping: 1, response: 0.35 }); // vertical drag offset in px

    const fitRect = () => {
      const r = source.getBoundingClientRect();
      const nw = source.naturalWidth || r.width, nh = source.naturalHeight || r.height;
      const maxW = innerWidth * (innerWidth < 640 ? 0.94 : 0.86), maxH = innerHeight * 0.84;
      const s = Math.min(maxW / nw, maxH / nh, 2);
      const w = nw * s, h = nh * s;
      return { left: (innerWidth - w) / 2, top: (innerHeight - h) / 2, width: w, height: h };
    };
    const render = () => {
      const k = p.x, off = dy.x;
      const pull = Math.min(Math.abs(off) / (innerHeight * 0.5), 1);
      const tx = from.dx * (1 - k), ty = from.dy * (1 - k) + off;
      const s = (from.s + (1 - from.s) * k) * (1 - pull * 0.18);
      big.style.transform = `translate3d(${tx}px, ${ty}px, 0) scale(${s})`;
      big.style.borderRadius = `${(1 - k) * 14 + 10}px`;
      const shown = Math.max(0, Math.min(1, k)) * (1 - pull * 0.75);
      scrim.style.opacity = shown;
      closeBtn.style.opacity = lb.querySelector(".lb__hint").style.opacity = Math.max(0, Math.min(1, k * 2 - 1)) * (1 - pull);
    };
    p.onUpdate = render; dy.onUpdate = render;
    p.onRest = (v) => { if (v === 0 && p.target === 0) finish(); };

    const measure = () => {
      const f = fitRect(), r = source.getBoundingClientRect();
      Object.assign(big.style, { left: f.left + "px", top: f.top + "px", width: f.width + "px", height: f.height + "px" });
      from = { dx: r.left + r.width / 2 - (f.left + f.width / 2), dy: r.top + r.height / 2 - (f.top + f.height / 2), s: r.width / f.width };
    };
    const open = (img) => {
      if (!lb.hidden && source === img) return;
      source = img; lastFocus = document.activeElement;
      big.src = img.currentSrc || img.src; big.alt = img.alt;
      lb.hidden = false; doc.classList.add("lb-open");
      measure(); dy.jump(0); p.jump(0);
      source.style.visibility = "hidden";
      if (reduce) { lb.classList.add("lb--fade"); requestAnimationFrame(() => { p.jump(1); lb.classList.add("lb--in"); }); }
      else p.to(1);
      closeBtn.focus({ preventScroll: true });
    };
    const close = (velocity = 0) => {
      if (reduce) { lb.classList.remove("lb--in"); setTimeout(finish, 200); return; }
      measure(); // the page may have moved; close back into where the image is now
      p.to(0, velocity);
      dy.to(0);
    };
    const finish = () => {
      if (lb.hidden) return;
      lb.hidden = true; lb.classList.remove("lb--fade", "lb--in"); doc.classList.remove("lb-open");
      if (source) source.style.visibility = "";
      lastFocus?.focus?.({ preventScroll: true });
    };

    zoomables.forEach((img) => {
      img.classList.add("zoomable"); img.tabIndex = 0; img.setAttribute("role", "button");
      img.setAttribute("aria-label", `View larger: ${img.alt || "image"}`);
      img.addEventListener("click", () => open(img));
      img.addEventListener("keydown", (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); open(img); } });
    });
    closeBtn.addEventListener("click", () => close());
    scrim.addEventListener("click", () => close());
    addEventListener("keydown", (e) => {
      if (lb.hidden) return;
      if (e.key === "Escape") close();
      if (e.key === "Tab") { e.preventDefault(); closeBtn.focus(); } // only one control inside; keep focus here
    });
    addEventListener("resize", () => { if (!lb.hidden && p.target === 1) { measure(); render(); } });

    // Drag: pointer capture, grab offset kept, short history for release velocity.
    let drag = null;
    big.addEventListener("pointerdown", (e) => {
      if (lb.hidden) return;
      e.preventDefault();
      big.setPointerCapture(e.pointerId);
      if (p.target === 0) { p.to(1); } // grabbed mid-close: it comes back to you
      dy.stop();
      drag = { id: e.pointerId, y0: e.clientY, base: dy.x, raw: dy.x, live: false, hist: [[e.clientY, e.timeStamp]] };
    });
    big.addEventListener("pointermove", (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const moved = e.clientY - drag.y0;
      if (!drag.live && Math.abs(moved) < 10) return; // 10px hysteresis before committing to a drag
      if (!drag.live) { drag.live = true; drag.y0 = e.clientY; drag.base = dy.x; }
      drag.raw = drag.base + (e.clientY - drag.y0);
      const limit = innerHeight * 0.6; // beyond this the image resists
      const shown = Math.abs(drag.raw) > limit ? Math.sign(drag.raw) * (limit + rubberband(Math.abs(drag.raw) - limit, innerHeight)) : drag.raw;
      dy.jump(shown);
      drag.hist.push([e.clientY, e.timeStamp]); if (drag.hist.length > 6) drag.hist.shift();
    });
    const release = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const d = drag; drag = null;
      if (!d.live) return;
      const h = d.hist, a = h[0], b = h[h.length - 1];
      const v = b[1] > a[1] ? ((b[0] - a[0]) / (b[1] - a[1])) * 1000 : 0; // px/s
      const landing = dy.x + project(v);
      if (Math.abs(landing) > innerHeight * 0.22) {
        // Throw: carry the finger's speed into the close.
        dy.v = v; close(-Math.min(Math.abs(v) / 900, 6));
      } else {
        // Not far enough: spring home, with a touch of bounce because the drag carried momentum.
        dy.set(0.8, 0.3).to(0, v); dy.onRest = () => { dy.set(1, 0.35); dy.onRest = null; };
      }
    };
    big.addEventListener("pointerup", release);
    big.addEventListener("pointercancel", release);
  }

  // 10. Opening curtain: plays once per visit; click or any key skips it.
  const intro = document.querySelector(".intro");
  if (intro && !doc.classList.contains("intro-done")) {
    const done = () => { doc.classList.add("intro-done"); try { sessionStorage.setItem("nel-intro", "1"); } catch (e) {} };
    intro.addEventListener("animationend", (e) => { if (e.animationName === "introOut") done(); });
    const skip = () => { done(); removeEventListener("keydown", skip); };
    intro.addEventListener("click", skip); addEventListener("keydown", skip, { once: true });
    setTimeout(done, 3600);
  }

  // 11. Year in footer.
  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));
})();

// 12. Collapsible sidebar on desktop: hidden by default; open with the Menu button,
//     or by resting the pointer on the left edge. Esc, the scrim, or leaving it closes it.
(() => {
  const head = document.querySelector(".site-head");
  if (!head) return;
  const doc = document.documentElement;
  const mq = matchMedia("(min-width: 960px)");
  const btn = document.createElement("button");
  btn.className = "side-toggle"; btn.type = "button";
  btn.setAttribute("aria-expanded", "false"); btn.setAttribute("aria-controls", "site-nav");
  btn.innerHTML = '<span class="side-toggle__icon" aria-hidden="true"></span><span class="side-toggle__label">Menu</span>';
  btn.setAttribute("aria-label", "Open navigation");
  const zone = document.createElement("div"); zone.className = "side-zone";
  zone.style.top = "80px"; zone.setAttribute("aria-hidden", "true");
  const scrim = document.createElement("div"); scrim.className = "side-scrim"; scrim.setAttribute("aria-hidden", "true");
  head.id = head.id || "site-nav";
  document.body.append(scrim, zone, btn);
  let byHover = false, t = 0;
  const set = (open, hover = false) => {
    doc.classList.toggle("side-open", open); byHover = open && hover;
    btn.setAttribute("aria-expanded", String(open)); btn.setAttribute("aria-label", open ? "Close navigation" : "Open navigation");
    if (mq.matches) head.inert = !open;
  };
  const apply = () => { doc.classList.toggle("side-js", mq.matches); if (mq.matches) set(false); else { head.inert = false; doc.classList.remove("side-open"); } };
  apply(); mq.addEventListener("change", apply);
  btn.addEventListener("click", () => { clearTimeout(t); if (byHover) { set(true); return; } set(!doc.classList.contains("side-open")); });
  scrim.addEventListener("click", () => set(false));
  addEventListener("keydown", (e) => { if (e.key === "Escape" && doc.classList.contains("side-open")) { set(false); btn.focus(); } });
  zone.addEventListener("pointerenter", () => { clearTimeout(t); t = setTimeout(() => set(true, true), 120); });
  zone.addEventListener("pointerleave", () => clearTimeout(t));
  head.addEventListener("pointerleave", () => { if (byHover) t = setTimeout(() => set(false), 250); });
  head.addEventListener("pointerenter", () => clearTimeout(t));
  head.addEventListener("click", (e) => { if (e.target.closest("a")) set(false); });
})();
