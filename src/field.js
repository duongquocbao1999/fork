/* forks — the field.
   One origin at the far left. Everything on screen is a branch of it.
   The tree keeps growing and shedding; it leans toward you when you type,
   carries signals while upstream thinks, lights the traced path when it answers,
   and sprouts a fork wherever you tap. */
(function () {
  'use strict';
  const RM = matchMedia('(prefers-reduced-motion: reduce)');
  const TAU = Math.PI * 2;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ease = t => 1 - Math.pow(1 - t, 3);

  function bz(P, t) {
    const u = 1 - t, a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
    return [a * P[0] + b * P[2] + c * P[4] + d * P[6], a * P[1] + b * P[3] + c * P[5] + d * P[7]];
  }
  function curve(x0, y0, x1, y1) { const dx = x1 - x0; return [x0, y0, x0 + dx * .6, y0, x0 + dx * .4, y1, x1, y1]; }

  class Field {
    constructor(canvas) {
      this.cv = canvas; this.ctx = canvas.getContext('2d');
      this.segs = []; this.pulses = []; this.sprouts = []; this.trace = null;
      this.mode = 'idle'; this.focus = null; this.dim = 0; this.dimTo = 0;
      this.seed = 1; this.t0 = performance.now(); this.last = this.t0;
      this.measure(); this.build();
      addEventListener('resize', () => { const w = this.W; this.measure(); if (Math.abs(w - this.W) > 80) this.build(); });
      matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => this.readColors());
      new MutationObserver(() => this.readColors()).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
      document.addEventListener('visibilitychange', () => { if (!document.hidden) { this.last = performance.now(); this.loop(); } });
      this.loop();
    }
    rnd() { this.seed = (this.seed * 16807) % 2147483647; return (this.seed - 1) / 2147483646; }
    readColors() {
      const cs = getComputedStyle(document.documentElement), g = n => cs.getPropertyValue(n).trim();
      this.c = { ink: g('--field-ink') || '#d6ded9', acc: g('--acc') || '#6ee7b7', bg: g('--bg') || '#0a0d0c' };
    }
    measure() {
      const dpr = Math.min(2, devicePixelRatio || 1);
      this.W = innerWidth; this.H = innerHeight; this.dpr = dpr;
      this.cv.width = Math.round(this.W * dpr); this.cv.height = Math.round(this.H * dpr);
      this.cv.style.width = this.W + 'px'; this.cv.style.height = this.H + 'px';
      this.small = this.W < 720;
      this.readColors();
    }
    // the canopy: recursive forks from a single origin off the left edge
    build() {
      this.segs = []; this.seed = 7;
      this.origin = { x: -40, y: this.H * (this.small ? .42 : .5) };
      this.max = this.small ? 130 : 260;
      const now = performance.now();
      const grow = (x, y, depth, spread, born) => {
        if (depth > (this.small ? 5 : 6) || this.segs.length > this.max) return;
        const n = depth === 0 ? 4 : (this.rnd() < .62 ? 2 : 1);
        for (let i = 0; i < n; i++) {
          const len = (this.W / (this.small ? 4.6 : 6.4)) * (.82 + this.rnd() * .4);
          const nx = x + len, ny = clamp(y + (n === 1 ? (this.rnd() - .5) * spread * .4 : (i / (n - 1) - .5) * spread) + (this.rnd() - .5) * 18, 20, this.H - 20);
          const s = { P: curve(x, y, nx, ny), depth, born: born + this.rnd() * 900, life: 1, dying: 0, glow: 0, id: this.segs.length };
          this.segs.push(s);
          grow(nx, ny, depth + 1, spread * .58, s.born + 700);
        }
      };
      grow(this.origin.x, this.origin.y, 0, this.H * .95, RM.matches ? now - 1e5 : now + 200);
      this.leaves = () => this.segs.filter(s => !s.dying && !this.segs.some(o => !o.dying && o.P[0] === s.P[6] && o.P[1] === s.P[7]));
    }
    // public API ---------------------------------------------------------
    setMode(mode, focus) { this.mode = mode; if (focus) this.focus = focus; this.loop(); }
    setFocus(rect) { this.focus = rect ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2, r: Math.max(rect.width, 160) } : null; }
    setDim(v) { this.dimTo = v; this.loop(); }
    tap(x, y) {
      if (RM.matches) return;
      // nearest branch point, then a small fork toward the tap
      let best = null, bd = 1e9;
      for (const s of this.segs) for (let k = 0; k <= 8; k++) { const p = bz(s.P, k / 8), d = Math.hypot(p[0] - x, p[1] - y); if (d < bd) { bd = d; best = p; } }
      const from = bd < 140 ? best : [x - 40, y];
      const now = performance.now();
      for (let i = 0; i < 3; i++) {
        const ex = x + 50 + Math.random() * 60, ey = y + (i - 1) * (26 + Math.random() * 14);
        this.sprouts.push({ P: curve(from[0], from[1], ex, ey), born: now + i * 70, d: 900 });
      }
      this.loop();
    }
    // light the path from origin to the branch tip nearest a point
    light(x, y) {
      if (!this.segs.length) return;
      let tip = null, bd = 1e9;
      for (const s of this.segs) { if (s.dying || s.P[6] > x + 8) continue; const d = Math.hypot(s.P[6] - x, (s.P[7] - y) * 1.4); if (d < bd) { bd = d; tip = s; } }
      if (!tip) return;
      const path = []; let cur = tip;
      while (cur) { path.unshift(cur); cur = this.segs.find(o => !o.dying && o.P[6] === cur.P[0] && o.P[7] === cur.P[1]); }
      this.trace = { path, t0: performance.now(), end: [x, y], from: [tip.P[6], tip.P[7]] };
      this.loop();
    }
    burst(x, y) {
      if (RM.matches) return;
      const now = performance.now();
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * .32; this.sprouts.push({ P: curve(x, y, x + Math.cos(a) * 70 + 40, y + Math.sin(a) * 70), born: now + i * 30, d: 1100, acc: true }); }
      this.loop();
    }
    // engine ------------------------------------------------------------
    loop() { if (!this.raf) this.raf = requestAnimationFrame(t => this.frame(t)); }
    frame(now) {
      this.raf = 0; if (document.hidden) return;
      const dt = Math.min(64, now - this.last); this.last = now;
      this.dim += (this.dimTo - this.dim) * Math.min(1, dt / 260);
      this.evolve(now);
      this.draw(now);
      if (!RM.matches || this.trace || this.sprouts.length || Math.abs(this.dim - this.dimTo) > .01) this.loop();
    }
    evolve(now) {
      if (RM.matches) return;
      // every few seconds: shed an old tip, grow a new fork elsewhere
      if (!this.nextGrow) this.nextGrow = now + 2200;
      if (now > this.nextGrow) {
        this.nextGrow = now + (this.mode === 'listening' ? 450 : this.mode === 'thinking' ? 300 : 1800);
        const leaves = this.leaves().filter(s => now > s.born + 1200);
        if (leaves.length) {
          if (this.segs.filter(s => !s.dying).length > this.max) { const old = leaves.sort((a, b) => a.born - b.born)[0]; old.dying = now; }
          let base;
          if (this.mode === 'listening' && this.focus) base = leaves.sort((a, b) => Math.hypot(a.P[6] - this.focus.x, a.P[7] - this.focus.y) - Math.hypot(b.P[6] - this.focus.x, b.P[7] - this.focus.y))[Math.floor(Math.random() * 3)];
          else base = leaves[Math.floor(Math.random() * leaves.length)];
          if (base && base.P[6] < this.W + 40) {
            const x = base.P[6], y = base.P[7], n = Math.random() < .6 ? 2 : 1;
            for (let i = 0; i < n; i++) {
              let tx = x + this.W / 7 * (.7 + Math.random() * .5), ty = clamp(y + (n === 1 ? (Math.random() - .5) * 80 : (i - .5) * (60 + Math.random() * 70)), 20, this.H - 20);
              if (this.mode === 'listening' && this.focus) { ty += (this.focus.y - ty) * .35; }
              this.segs.push({ P: curve(x, y, tx, ty), depth: base.depth + 1, born: now, life: 1, dying: 0, glow: 0 });
            }
          }
        }
      }
      // thinking: signals from the origin
      if (this.mode === 'thinking' && (!this.nextPulse || now > this.nextPulse)) {
        this.nextPulse = now + 160;
        const route = []; let cur = this.segs.find(s => s.depth === 0 && !s.dying && Math.random() < .5) || this.segs[0];
        while (cur) { route.push(cur); const kids = this.segs.filter(o => !o.dying && o.P[0] === cur.P[6] && o.P[1] === cur.P[7]); cur = kids.length ? kids[Math.floor(Math.random() * kids.length)] : null; }
        this.pulses.push({ route, t0: now, speed: 520 + Math.random() * 260 });
      }
      this.segs = this.segs.filter(s => !s.dying || now - s.dying < 1400);
      this.pulses = this.pulses.filter(p => now - p.t0 < p.route.length * p.speed + 200);
      this.sprouts = this.sprouts.filter(s => now - s.born < s.d + 1800);
      if (this.trace && now - this.trace.t0 > 5200) this.trace = null;
    }
    draw(now) {
      const x = this.ctx, c = this.c, f = this.focus;
      x.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      x.clearRect(0, 0, this.W, this.H);
      x.lineCap = 'round';
      const base = (this.small ? .16 : .19) * (1 - this.dim * .7);
      x.strokeStyle = c.ink;
      for (const s of this.segs) {
        const g = RM.matches ? 1 : ease(clamp((now - s.born) / 1100, 0, 1)); if (g <= 0) continue;
        let a = base * (1 - s.depth * .085);
        if (s.dying) a *= 1 - clamp((now - s.dying) / 1400, 0, 1);
        if (f && this.mode === 'listening') { const d = Math.hypot(s.P[6] - f.x, s.P[7] - f.y); a += clamp(1 - d / (f.r * 1.6), 0, 1) * .22; }
        if (a <= .004) continue;
        x.globalAlpha = clamp(a, 0, 1);
        x.lineWidth = Math.max(.7, 2.6 - s.depth * .34);
        x.beginPath(); x.moveTo(s.P[0], s.P[1]);
        if (g >= 1) x.bezierCurveTo(s.P[2], s.P[3], s.P[4], s.P[5], s.P[6], s.P[7]);
        else for (let i = 1; i <= 16; i++) { const q = bz(s.P, g * i / 16); x.lineTo(q[0], q[1]); }
        x.stroke();
        if (g >= 1 && s.depth < 4) { x.globalAlpha = clamp(a * 1.4, 0, 1); x.fillStyle = c.ink; x.beginPath(); x.arc(s.P[6], s.P[7], s.depth < 2 ? 2.4 : 1.6, 0, TAU); x.fill(); }
      }
      // origin
      x.globalAlpha = .6 * (1 - this.dim * .5); x.fillStyle = c.acc;
      x.beginPath(); x.arc(Math.max(6, this.origin.x + 46), this.origin.y, 3, 0, TAU); x.fill();
      // signals
      for (const p of this.pulses) {
        const tt = (now - p.t0) / p.speed, i = Math.floor(tt), q = tt - i, s = p.route[i]; if (!s) continue;
        const pt = bz(s.P, q);
        x.globalAlpha = .9; x.fillStyle = c.acc; x.beginPath(); x.arc(pt[0], pt[1], 2.2, 0, TAU); x.fill();
        x.globalAlpha = .25; x.beginPath(); x.arc(pt[0], pt[1], 6, 0, TAU); x.fill();
      }
      // the traced path
      if (this.trace) {
        const T = this.trace, k = (now - T.t0) / 1400, fade = 1 - clamp((now - T.t0 - 3400) / 1800, 0, 1);
        x.strokeStyle = c.acc; x.lineWidth = 2.2;
        T.path.forEach((s, i) => {
          const g = clamp(k * T.path.length - i, 0, 1); if (g <= 0) return;
          x.globalAlpha = .85 * fade; x.beginPath(); x.moveTo(s.P[0], s.P[1]);
          for (let j = 1; j <= 16; j++) { const q = bz(s.P, g * j / 16); x.lineTo(q[0], q[1]); } x.stroke();
          if (g >= 1) { x.fillStyle = c.acc; x.beginPath(); x.arc(s.P[6], s.P[7], 3, 0, TAU); x.fill(); }
        });
        const g2 = clamp(k * T.path.length - T.path.length, 0, 1);
        if (g2 > 0) { const P = curve(T.from[0], T.from[1], T.end[0], T.end[1]); x.globalAlpha = .7 * fade; x.setLineDash([2, 5]); x.beginPath(); x.moveTo(P[0], P[1]); for (let j = 1; j <= 16; j++) { const q = bz(P, g2 * j / 16); x.lineTo(q[0], q[1]); } x.stroke(); x.setLineDash([]); }
      }
      // sprouts from taps and answers
      for (const s of this.sprouts) {
        const g = ease(clamp((now - s.born) / s.d, 0, 1)); if (g <= 0) continue;
        const fade = 1 - clamp((now - s.born - s.d) / 1800, 0, 1);
        x.globalAlpha = (s.acc ? .8 : .55) * fade; x.strokeStyle = s.acc ? c.acc : c.ink; x.lineWidth = 1.4;
        x.beginPath(); x.moveTo(s.P[0], s.P[1]); for (let j = 1; j <= 14; j++) { const q = bz(s.P, g * j / 14); x.lineTo(q[0], q[1]); } x.stroke();
        if (g >= 1) { x.fillStyle = s.acc ? c.acc : c.ink; x.beginPath(); x.arc(s.P[6], s.P[7], 2, 0, TAU); x.fill(); }
      }
      x.globalAlpha = 1;
    }
  }
  window.ForksField = Field;
})();
