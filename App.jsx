// App + Tweaks panel
const { useState: uS, useEffect: uE, useMemo: uM, useCallback: uC, useRef: uR } = React;

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "heroMode": "solid",
  "heroColor": "flytrap-red-deep",
  "aboutZone": "checker-black",
  "pressZone": "checker-black",
  "showRetail": true,
  "showPress": true,
  "rotationSeconds": 6
} /*EDITMODE-END*/;

// Second fly — a small electric-red accent that accompanies each section header as it
// scrolls through the viewport: right->left over About, left->right over Retail,
// right->left over News (press), then in from the right to park beside/above "Find us"
// in Location (visit). It rides the header row out in the side margins and lifts into
// the clear band above the text where its sweep would cross a glyph, so it never
// collides with the header. Sized to ~half the header text; transform/opacity eased.
function BackFly() {
  const ref = uR(null);
  const trailRef = uR(null);   // fixed SVG overlay that holds the trail dashes
  const dashesRef = uR(null);  // <g> pool of dash <line>s laid along the fly's path
  const POOL = 96;             // max simultaneous dashes (covers the longer trail on a wide screen)

  uE(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const svg = trailRef.current, dashesG = dashesRef.current;

    // sec: section whose header the fly rides; dir: 1 = L->R, -1 = R->L;
    // park: end beside the header instead of sweeping across. Always the red glyph.
    const TARGETS = [
      { sec: "#about",  dir: 1 },    // left -> right
      { sec: "#retail", dir: -1 },   // right -> left
      { sec: "#press",  dir: 1 },    // left -> right
      { sec: "#visit",  park: true } // in from the right, beside/above "Find us"
    ];

    let vw = 0, vh = 0;
    const measure = () => {
      vw = window.innerWidth; vh = window.innerHeight;
      // Match the SVG's user space to viewport pixels so trail points map 1:1.
      if (svg) { svg.setAttribute("viewBox", "0 0 " + vw + " " + vh); svg.setAttribute("width", vw); svg.setAttribute("height", vh); }
    };
    const clamp01 = (v) => Math.min(1, Math.max(0, v));

    // --- Fly trail: short dashes laid at fixed points along the fly's path. Each
    // dash stays where it was dropped, eases in behind the fly, holds, then eases
    // out — so the trail calmly traces the path instead of streaking. The visible
    // run is capped to 15% of the viewport width behind the fly, and coloured for
    // contrast against whatever section it crosses (light on dark, dark on light). ---
    const DASH_LIFE = 1800;          // ms a dash lives (slow appear + slow fade)
    const DASH_APPEAR = 0.24;        // life fraction spent easing in
    const DASH_FADE = 0.5;           // life fraction after which it eases out
    const DASH_GAP = 12;             // px of path between dashes (even spacing)
    const DASH_LEN = 7;              // px length of a dash (straight fallback at the ends)
    const DASH_BOW = 0.22;           // half-span (in segment param) of each curved dash
    const TRAIL_CAP = 0.32;          // visible trail spans <= 32% vw behind the fly (longer)
    const DASH_PEAK = 0.85;          // max dash opacity
    const dashes = [];               // { x, y, ang, born } laid along the path
    let lastX = null, lastPy = null, acc = 0;   // last fly PAGE position + path-distance accumulator
    let colorSel = null;             // section the trail colour was last sampled for
    let trailColor = "245,238,220";  // "r,g,b"; cream by default (assumes a dark bg)
    const nowMs = () => (window.performance && performance.now) ? performance.now() : Date.now();
    const smooth01 = (v) => { v = clamp01(v); return v * v * (3 - 2 * v); };
    // Dashes are anchored in PAGE space (y + scroll) and drawn back into the fixed
    // overlay minus the live scroll, so they ride the content — locked to the fly's
    // flight path — instead of hanging at a fixed viewport height as the page moves.
    const scrollTop = () => window.pageYOffset || document.documentElement.scrollTop || 0;
    // Sample the background under the fly and return a contrasting dash colour.
    const pickTrailColor = (x, y) => {
      let node = document.elementFromPoint(x, y), bg = null;
      while (node) {
        const m = getComputedStyle(node).backgroundColor.match(/rgba?\(([^)]+)\)/);
        if (m) { const p = m[1].split(",").map(parseFloat); const a = p[3] === undefined ? 1 : p[3]; if (a > 0.1) { bg = p; break; } }
        node = node.parentElement;
      }
      const L = bg ? (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255 : 0;
      return L < 0.5 ? "245,238,220" : "34,34,34";   // cream on dark, ink on light
    };
    // Lay evenly-spaced dashes along the path the fly just travelled.
    const layDashes = (x, y, t) => {
      const px = x, py = y + scrollTop();   // page coords (no horizontal page scroll, so px = x)
      if (lastX === null) { lastX = px; lastPy = py; return; }
      const dx = px - lastX, dpy = py - lastPy, d = Math.hypot(dx, dpy);
      if (d < 0.01) return;
      // Angle is the tangent of the PAGE-space path, so each dash lines up with the
      // content-locked trail it forms — not the fly's on-screen direction, which the
      // scroll skews.
      const ux = dx / d, uy = dpy / d, ang = Math.atan2(dpy, dx);
      acc += d;
      while (acc >= DASH_GAP) {
        acc -= DASH_GAP;
        dashes.push({ x: px - ux * acc, py: py - uy * acc, ang: ang, born: t });   // page-anchored spot on the path
      }
      if (dashes.length > POOL) dashes.splice(0, dashes.length - POOL);
      lastX = px; lastPy = py;
    };
    // Cull expired / out-of-cap dashes, then paint the pool with eased opacity.
    const drawTrail = (t, flyX) => {
      if (!dashesG) return;
      dashesG.setAttribute("transform", "translate(0," + (-scrollTop()).toFixed(1) + ")");  // page space -> viewport
      const cap = vw * TRAIL_CAP;
      for (let i = dashes.length - 1; i >= 0; i--) {
        if ((t - dashes[i].born) > DASH_LIFE || Math.abs(flyX - dashes[i].x) > cap) dashes.splice(i, 1);
      }
      const polys = dashesG.children;
      for (let i = 0; i < polys.length; i++) {
        const pl = polys[i], dsh = dashes[i];
        if (!dsh) { pl.setAttribute("points", ""); pl.setAttribute("stroke-opacity", "0"); continue; }
        // Curve each dash to the path: a quadratic through the neighbour midpoints with
        // this dash as the control point, sampled over its middle span. Ends fall back
        // to a straight segment along the stored tangent.
        const prev = dashes[i - 1], next = dashes[i + 1];
        let d3;
        if (prev && next) {
          const ax = (prev.x + dsh.x) / 2, ay = (prev.py + dsh.py) / 2;
          const bx = (dsh.x + next.x) / 2, by = (dsh.py + next.py) / 2;
          const q = (u) => { const m = 1 - u; return [m*m*ax + 2*m*u*dsh.x + u*u*bx, m*m*ay + 2*m*u*dsh.py + u*u*by]; };
          const a = q(0.5 - DASH_BOW), b = q(0.5), c = q(0.5 + DASH_BOW);
          d3 = a[0].toFixed(1)+","+a[1].toFixed(1)+" "+b[0].toFixed(1)+","+b[1].toFixed(1)+" "+c[0].toFixed(1)+","+c[1].toFixed(1);
        } else {
          const cx = Math.cos(dsh.ang) * DASH_LEN / 2, cy = Math.sin(dsh.ang) * DASH_LEN / 2;
          d3 = (dsh.x - cx).toFixed(1)+","+(dsh.py - cy).toFixed(1)+" "+(dsh.x + cx).toFixed(1)+","+(dsh.py + cy).toFixed(1);
        }
        const p = (t - dsh.born) / DASH_LIFE;
        const ein = smooth01(p / DASH_APPEAR);                        // slow in
        const eout = 1 - smooth01((p - DASH_FADE) / (1 - DASH_FADE)); // slow out
        const scap = 1 - smooth01((Math.abs(flyX - dsh.x) - cap * 0.6) / (cap * 0.4)); // gentle at the far edge
        pl.setAttribute("points", d3);
        pl.setAttribute("stroke", "rgb(" + trailColor + ")");
        pl.setAttribute("stroke-opacity", (DASH_PEAK * ein * clamp01(eout) * clamp01(scap)).toFixed(3));
      }
    };

    // Union box of a section's header text (eyebrow + title) — the region the fly must
    // never overlap. Viewport-relative.
    const headBox = (secSel) => {
      const sec = document.querySelector(secSel);
      if (!sec) return null;
      const rs = [sec.querySelector("h2.title"), sec.querySelector(".eyebrow")]
        .filter(Boolean).map((n) => n.getBoundingClientRect());
      if (!rs.length) return null;
      const top = Math.min.apply(null, rs.map((r) => r.top));
      const bottom = Math.max.apply(null, rs.map((r) => r.bottom));
      const left = Math.min.apply(null, rs.map((r) => r.left));
      const right = Math.max.apply(null, rs.map((r) => r.right));
      return { top: top, bottom: bottom, left: left, right: right, cy: (top + bottom) / 2 };
    };

    const headFont = (secSel, useEyebrow) => {
      const sec = document.querySelector(secSel);
      const node = sec && (useEyebrow
        ? (sec.querySelector(".eyebrow") || sec.querySelector("h2.title"))
        : (sec.querySelector("h2.title") || sec.querySelector(".eyebrow")));
      return node ? parseFloat(getComputedStyle(node).fontSize) : 32;
    };

    // Pick the section header nearest the viewport center; it owns the fly.
    const activeTarget = () => {
      let best = null, bestDist = Infinity;
      for (const tg of TARGETS) {
        const box = headBox(tg.sec);
        if (!box) continue;
        const dist = Math.abs(box.cy - vh * 0.5);
        if (dist < bestDist) { bestDist = dist; best = { tg: tg, box: box }; }
      }
      return best;
    };

    let curSel = null;
    let dispX = null, dispY = null, dispO = 0;
    let dispTilt = 0, prevX = 0, prevY = 0;   // eased bank angle + last position (for velocity)
    const FLY_EASE = 0.3;                       // follow-through on the sweep — lower = floatier/smoother
    let raf = 0;

    const frame = () => {
      raf = 0;
      const a = activeTarget();
      let tgtX = dispX, tgtY = dispY, tgtO = 0;

      if (a) {
        const tg = a.tg, box = a.box;
        // Size to ~half the text it accompanies (the eyebrow for the parked target,
        // the title otherwise) when a new section takes over.
        if (tg.sec !== curSel) {
          curSel = tg.sec;
          el.style.width = (headFont(tg.sec, tg.park) * 0.52).toFixed(1) + "px";
        }
        const fw = el.offsetWidth, fh = el.offsetHeight;
        // t: 0 as the header sits low in the viewport, 1 as it rises near the top.
        const t = clamp01((vh * 0.8 - box.top) / (vh * 0.8 - vh * 0.15));
        const left = vw * 0.08, right = vw * 0.92;

        if (tg.park) {
          const eb = document.querySelector(tg.sec + " .eyebrow").getBoundingClientRect();
          const endX = eb.right + fw * 0.7;                              // next to "Find us"
          tgtX = right + (endX - right) * clamp01(t / 0.8);              // in from the right, then hold
          tgtY = eb.top - fh * 0.25;                                     // slightly above the eyebrow
          tgtO = 0.92 * clamp01(t / 0.12) * (eb.top < vh * 0.12 ? clamp01(eb.top / (vh * 0.12)) : 1);
        } else {
          const sX = tg.dir > 0 ? left : right;
          const eX = tg.dir > 0 ? right : left;
          // Ease the sweep (smootherstep) so the fly drifts off the margin, gathers
          // speed across the middle, and eases in at the far side — never a constant
          // scroll-locked slide.
          const te = t * t * t * (t * (t * 6 - 15) + 10);
          tgtX = sX + (eX - sX) * te;
          // Flowing vertical undulation: two out-of-phase waves so the float never
          // repeats mechanically. Phase shifts per section (dir) for a little whimsy.
          const TAU = Math.PI * 2, ph = tg.dir > 0 ? 0 : 1.3;
          const undulate = fh * (Math.sin(t * TAU * 1.6 + ph) * 0.62 + Math.sin(t * TAU * 2.9 + ph) * 0.26);
          // Route through open space with a smooth arc: ride the header row out in the
          // side margins, rise into the clear band above the header as the sweep nears
          // the text, then settle back after. The rise is a smoothstep of horizontal
          // proximity — no hard step — so the motion stays natural and never overlaps a glyph.
          const pad = fw * 0.5 + Math.min(vw * 0.1, 120);
          const edge = Math.min(tgtX - (box.left - pad), (box.right + pad) - tgtX);
          const wRaw = clamp01(edge / pad);
          const w = wRaw * wRaw * (3 - 2 * wRaw);
          const baseY = box.cy + undulate;
          const overY = box.top - fh * 0.5 - 8;                        // clear band above the header
          tgtY = baseY + (overY - baseY) * w;
          tgtO = 0.92 * clamp01(Math.min(t, 1 - t) / 0.12);             // fade in and out at the band ends
        }
      }

      if (dispX === null) { dispX = tgtX; dispY = tgtY; prevX = tgtX; prevY = tgtY; }
      if (dispO < 0.05) { dispX = tgtX; dispY = tgtY; prevX = tgtX; prevY = tgtY; }  // teleport while invisible (no cross-screen slide)
      dispX += (tgtX - dispX) * FLY_EASE;
      dispY += (tgtY - dispY) * FLY_EASE;
      dispO += (tgtO - dispO) * 0.5;
      // Bank the fly into its flight — nose-up as it climbs, nose-down as it dives —
      // plus a faint position-driven flutter, so it reads alive and whimsical rather
      // than a sprite sliding flat. Tilt fades out with the fly and eases smoothly.
      const vx = dispX - prevX, vy = dispY - prevY;
      prevX = dispX; prevY = dispY;
      const bank = Math.max(-0.42, Math.min(0.42, Math.atan2(vy, Math.abs(vx) + 0.001)));
      const flutter = Math.sin((dispX + dispY) * 0.06) * 0.05;
      dispTilt += ((bank + flutter) * dispO - dispTilt) * 0.2;
      el.style.transform = "translate(" + (dispX - el.offsetWidth / 2).toFixed(1) + "px," + (dispY - el.offsetHeight / 2).toFixed(1) + "px) rotate(" + (dispTilt * 57.2958).toFixed(1) + "deg)";
      el.style.opacity = dispO.toFixed(3);

      // Lay the trail: drop fixed dashes where the fly has been while it's visible,
      // pause extending while it fades (existing dashes keep easing out), and clear
      // everything on a teleport so nothing streaks across a jump. Resample the
      // colour whenever the active section changes.
      const tnow = nowMs();
      if (dispO < 0.05) {
        dashes.length = 0; lastX = null; lastPy = null; acc = 0;
      } else if (dispO > 0.1) {
        if (curSel !== colorSel) { colorSel = curSel; trailColor = pickTrailColor(dispX, dispY); }
        layDashes(dispX, dispY, tnow);
      } else {
        lastX = null; lastPy = null;   // faint but not gone: stop extending, let dashes ease out
      }
      drawTrail(tnow, dispX);

      const flySettled = Math.abs(tgtX - dispX) < 0.3 && Math.abs(tgtY - dispY) < 0.3 && Math.abs(tgtO - dispO) < 0.01;
      const settled = flySettled && dashes.length === 0;   // keep the loop alive while the dashes ease out
      if (!settled) raf = requestAnimationFrame(frame);
    };

    const onScroll = () => { if (!raf) raf = requestAnimationFrame(frame); };
    const onResize = () => { measure(); if (!raf) raf = requestAnimationFrame(frame); };

    measure();
    frame();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onResize);
    window.addEventListener("load", onResize);
    const settle = setTimeout(onResize, 400);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("load", onResize);
      clearTimeout(settle);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <React.Fragment>
      <svg ref={trailRef} className="fly-trail" aria-hidden="true">
        <g ref={dashesRef}>
          {Array.from({ length: POOL }).map((_, i) =>
          <polyline key={i} points="" strokeOpacity="0" />
          )}
        </g>
      </svg>
      <img ref={ref} className="back-fly" src="assets/brand/fly-red.png" alt="" aria-hidden="true" />
    </React.Fragment>);

}

function App() {
  const [scrolled, setScrolled] = uS(false);
  const [pastHero, setPastHero] = uS(false);
  const [tweaks, setTweak] = window.useTweaks(TWEAK_DEFAULTS);

  uE(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 40);
      // Header lockup hands off from the hero wordmark: it fades in the moment the hero
      // "the fly trap" scrolls up past the nav's lower edge, and back out on scroll-up.
      const heroWm = document.querySelector(".hero-wordmark");
      if (heroWm) {
        // Shrink + lift + fade the hero logo off the page as you scroll through the hero,
        // handing off to the small nav lockup. Skipped under reduced-motion.
        if (!reduceMotion) {
          const heroEl = heroWm.closest(".hero");
          const heroH = heroEl ? heroEl.offsetHeight : window.innerHeight;
          const p = Math.min(1, Math.max(0, y / (heroH * 0.85)));
          heroWm.style.transformOrigin = "50% 0";
          heroWm.style.transform = "scale(" + (1 - 0.4 * p).toFixed(3) + ") translateY(" + (-p * 20).toFixed(1) + "px)";
          heroWm.style.opacity = (1 - p).toFixed(3);
        }
        const navEl = document.querySelector(".nav");
        const navB = navEl ? navEl.getBoundingClientRect().bottom : 70;
        setPastHero(heroWm.getBoundingClientRect().bottom <= navB);
      } else {
        setPastHero(y > window.innerHeight - 80);
      }
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Reveal-on-scroll observer
  uE(() => {
    const els = document.querySelectorAll(".reveal:not(.in)");
    if (!("IntersectionObserver" in window)) {
      els.forEach((e) => e.classList.add("in"));
      return;
    }
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (e.isIntersecting) {
          e.target.classList.add("in");
          io.unobserve(e.target);
        }
      });
    }, { rootMargin: "0px 0px -10% 0px" });
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
  }, [tweaks.showRetail, tweaks.showPress]);

  const navigate = (href) => {
    if (href === "#top") {
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const el = document.querySelector(href);
    if (el) window.scrollTo({ top: el.offsetTop - 70, behavior: "smooth" });
  };

  // Apply zone color overrides via inline styles
  const zoneColors = {
    terracotta: "var(--color-terracotta)",
    plum: "var(--color-plum)",
    "navy-slate": "var(--color-navy-slate)",
    "back-bar-mauve": "var(--color-back-bar-mauve)",
    butter: "var(--color-butter-yellow)",
    chartreuse: "var(--color-chartreuse)",
    "flytrap-red-deep": "var(--color-flytrap-red-deep)",
    "flytrap-red-bright": "var(--color-flytrap-red-bright)",
    "checker-black": "var(--color-checker-black)",
    "bg-white": "var(--color-bg-white)"
  };

  uE(() => {
    const aboutEl = document.querySelector("#about.about");
    if (aboutEl) aboutEl.style.background = zoneColors[tweaks.aboutZone] || "";
    const pressEl = document.querySelector("#press.press");
    if (pressEl) pressEl.style.background = zoneColors[tweaks.pressZone] || "";
  }, [tweaks.aboutZone, tweaks.pressZone]);

  return (
    <React.Fragment>
      <Nav scrolled={scrolled} pastHero={pastHero} onNavigate={navigate} />

      <main>
        <Hero onOpenMenu={() => navigate("#menu")} heroColor={tweaks.heroColor} />
        <Menu />
        <About />
        <DishScroll />
        {tweaks.showRetail ? <Retail /> : null}
        {tweaks.showPress ? <Press /> : null}
        <Visit />
        <Footer onNavigate={navigate} />
        <BackFly />
      </main>

      <window.TweaksPanel title="Tweaks">
        <window.TweakSection title="Hero">
          <window.TweakSelect
            label="Hero color"
            value={tweaks.heroColor}
            onChange={(v) => setTweak("heroColor", v)}
            options={[
            { value: "flytrap-red-deep", label: "Fly Trap red (deep)" },
            { value: "flytrap-red-bright", label: "Fly Trap red (bright)" },
            { value: "checker-black", label: "Checker black" },
            { value: "terracotta", label: "Terracotta" },
            { value: "plum", label: "Plum" },
            { value: "butter", label: "Butter yellow" },
            { value: "chartreuse", label: "Chartreuse" },
            { value: "back-bar-mauve", label: "Back-bar mauve" }]
            } />
          
        </window.TweakSection>

        <window.TweakSection title="Wall zones">
          <window.TweakSelect
            label="About section"
            value={tweaks.aboutZone}
            onChange={(v) => setTweak("aboutZone", v)}
            options={[
            { value: "bg-white", label: "White (hero match, default)" },
            { value: "flytrap-red-deep", label: "Fly Trap red" },
            { value: "checker-black", label: "Checker black" },
            { value: "terracotta", label: "Terracotta" },
            { value: "plum", label: "Plum" },
            { value: "butter", label: "Butter yellow" },
            { value: "back-bar-mauve", label: "Back-bar mauve" },
            { value: "navy-slate", label: "Navy slate" }]
            } />
          
          <window.TweakSelect
            label="Press section"
            value={tweaks.pressZone}
            onChange={(v) => setTweak("pressZone", v)}
            options={[
            { value: "checker-black", label: "Checker black (default)" },
            { value: "flytrap-red-deep", label: "Fly Trap red" },
            { value: "plum", label: "Plum" },
            { value: "navy-slate", label: "Navy slate" },
            { value: "back-bar-mauve", label: "Back-bar mauve" },
            { value: "terracotta", label: "Terracotta" }]
            } />
          
        </window.TweakSection>

        <window.TweakSection title="Sections">
          <window.TweakToggle label="Show retail" value={tweaks.showRetail} onChange={(v) => setTweak("showRetail", v)} />
          <window.TweakToggle label="Show press" value={tweaks.showPress} onChange={(v) => setTweak("showPress", v)} />
        </window.TweakSection>
      </window.TweaksPanel>
    </React.Fragment>);

}

// Solid-color hero
window.Hero = function HeroWrap(props) {
  const isOpen = window.useOpenNow();

  // Compact hero: black field, electric-red original-form logo (the art includes
  // "a finer diner" and the fly). Shrink-on-scroll is driven from App's scroll
  // handler; menu/specials ride directly beneath.
  return (
    <header className="hero hero-solid" id="top" style={{ background: "var(--color-checker-black)", color: "var(--color-flytrap-red-bright)" }}>
      <div className="hero-content">
        <div className="hero-wordmark-wrap">
          <img className="hero-wordmark" src="assets/brand/flytrap-logo-original-red.png" alt="The Fly Trap — a finer diner" width="1003" height="401" fetchpriority="high" />
        </div>
        <div className="hero-actions">
          <a
            href="https://order.toasttab.com/online/the-fly-trap-ferndale-22950-woodward-avenue"
            className="btn btn-ghost hero-cta-mobile"
            style={{ color: "inherit", borderColor: "currentColor" }}
            target="_blank"
            rel="noopener"
          >Order Takeout →</a>
        </div>
      </div>

      <div className="hero-strip" style={{ color: "inherit" }}>
        <div className="grp">
          <span className={"open-now" + (isOpen ? "" : " closed")}><span className="dot" /> {isOpen ? "Open now" : "Closed"}</span>
          <span>Mon–Sun · 8a — 3p</span>
        </div>
        <div className="grp">
          <span>22950 Woodward Ave, Ferndale</span>
        </div>
      </div>
    </header>);

};

ReactDOM.createRoot(document.getElementById("root")).render(<App />);