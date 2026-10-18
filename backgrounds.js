// ============================================================
// backgrounds.js — Detailed scenery for Regions 1-8.
//
// Each region's ground is painted ONCE into an off-screen canvas (1px-level detail: grass blades,
// pebbles, flowers, fences, trees, water...) and then simply blitted every frame, so it costs
// next to nothing at run time. The cache is rebuilt whenever the canvas size changes (rotation /
// resize) and uses a seeded random generator, so a region always looks the same.
//
// Regions 9 (Bedroom) and 10 (Flower Garden) keep their own drawing code in world.js.
// Depends on: state.js / world.js (canvas, ctx, region4Hive, getMudPatch). Load BEFORE main.js.
// ============================================================

// ---------- tiny helpers -------------------------------------------------------------------
function bgRng(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
function bgPick(r, arr) { return arr[Math.floor(r() * arr.length)]; }

// Fine grain: lots of 1-2px specks in a palette.
function bgSpeckle(c, r, x0, y0, w, h, colors, count, maxW, maxH) {
    for (let i = 0; i < count; i++) {
        c.fillStyle = colors[Math.floor(r() * colors.length)];
        c.fillRect((x0 + r() * w) | 0, (y0 + r() * h) | 0, 1 + Math.floor(r() * (maxW || 2)), 1 + Math.floor(r() * (maxH || 1)));
    }
}
// Grass blades: a 1px stalk that bends over at the tip.
function bgBlades(c, r, x0, y0, w, h, colors, count, minH, maxH) {
    for (let i = 0; i < count; i++) {
        const x = (x0 + r() * w) | 0, y = (y0 + r() * h) | 0;
        const hh = Math.max(2, Math.round(minH + r() * (maxH - minH)));
        const lean = r() < 0.5 ? -1 : 1;
        const b = Math.max(1, Math.round(hh * 0.6));
        c.fillStyle = colors[Math.floor(r() * colors.length)];
        c.fillRect(x, y - b, 1, b);
        c.fillRect(x + (r() < 0.6 ? lean : 0), y - hh, 1, hh - b);
    }
}
function bgTuft(c, r, x, y, n, minH, maxH, colors) {
    for (let i = 0; i < n; i++) {
        const hh = Math.round(minH + r() * (maxH - minH));
        const dx = Math.round((i - (n - 1) / 2) * 1.6 + (r() - 0.5));
        const lean = dx < 0 ? -1 : (dx > 0 ? 1 : 0);
        c.fillStyle = colors[Math.floor(r() * colors.length)];
        c.fillRect(x + dx, y - hh + 2, 1, hh - 1);
        c.fillRect(x + dx + lean, y - hh, 1, 2);
    }
}
function bgShadow(c, x, y, rx, ry, a) {
    c.fillStyle = 'rgba(0,0,0,' + (a === undefined ? 0.22 : a) + ')';
    c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
function bgEllipse(c, x, y, rx, ry, col) {
    c.fillStyle = col; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
}
function bgCircle(c, x, y, rad, col) {
    c.fillStyle = col; c.beginPath(); c.arc(x, y, rad, 0, Math.PI * 2); c.fill();
}
// Soft darkening towards the edges + a few big pools of light (gives depth to flat ground).
function bgVignette(c, W, H, a) {
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + a + ')');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
}
function bgLightPools(c, r, W, H, n, alpha, col) {
    for (let i = 0; i < n; i++) {
        const x = r() * W, y = r() * H, rr = 26 + r() * 46;
        const g = c.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, 'rgba(' + col + ',' + alpha + ')');
        g.addColorStop(1, 'rgba(' + col + ',0)');
        c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
    }
}
// Small 5x5 flower seen from above.
function bgDaisy(c, x, y, petal, center) {
    x |= 0; y |= 0;
    c.fillStyle = petal;
    c.fillRect(x - 1, y - 2, 3, 1); c.fillRect(x - 1, y + 2, 3, 1);
    c.fillRect(x - 2, y - 1, 1, 3); c.fillRect(x + 2, y - 1, 1, 3);
    c.fillRect(x - 1, y - 1, 3, 3);
    c.fillStyle = center; c.fillRect(x, y, 1, 1);
}
function bgDot(c, x, y, col, hi) {
    x |= 0; y |= 0;
    c.fillStyle = col; c.fillRect(x - 1, y - 1, 3, 3);
    if (hi) { c.fillStyle = hi; c.fillRect(x - 1, y - 1, 1, 1); }
}
// A wobbly outline (for ponds / mud / lakes): factors are generated once so every layer matches.
function bgBlobFactors(r, n, amp) {
    const f = [];
    for (let i = 0; i < n; i++) f.push(1 + (r() - 0.5) * 2 * amp);
    return f;
}
function bgBlobPath(c, cx, cy, rx, ry, f, grow) {
    const n = f.length, pts = [];
    for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        pts.push([cx + Math.cos(a) * (rx * f[i] + grow), cy + Math.sin(a) * (ry * f[i] + grow)]);
    }
    c.beginPath();
    const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
    let m0 = mid(pts[n - 1], pts[0]);
    c.moveTo(m0[0], m0[1]);
    for (let i = 0; i < n; i++) {
        const p = pts[i], m = mid(p, pts[(i + 1) % n]);
        c.quadraticCurveTo(p[0], p[1], m[0], m[1]);
    }
    c.closePath();
}
function bgRock(c, r, x, y, s, pal) {
    pal = pal || ['#5d5f63', '#8a8d92', '#b4b8bd'];
    bgShadow(c, x + s * 0.08, y + s * 0.34, s * 0.58, s * 0.2, 0.28);
    bgEllipse(c, x, y, s * 0.55, s * 0.4, pal[0]);
    bgEllipse(c, x - s * 0.05, y - s * 0.06, s * 0.5, s * 0.34, pal[1]);
    bgEllipse(c, x - s * 0.15, y - s * 0.16, s * 0.26, s * 0.14, pal[2]);
    bgSpeckle(c, r, x - s * 0.4, y - s * 0.25, s * 0.8, s * 0.5, [pal[0], pal[2]], Math.round(s / 2.5), 1, 1);
}
function bgFlowerTop(c, x, y, rad, petal, center) {
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 - Math.PI / 2;
        bgCircle(c, x + Math.cos(a) * rad, y + Math.sin(a) * rad, rad * 0.8, petal);
    }
    bgCircle(c, x, y, rad * 0.65, center);
}

// A round-canopy tree. (x, y) = where the trunk meets the ground, s = canopy diameter.
function bgTree(c, r, x, y, s, p) {
    bgShadow(c, x + s * 0.1, y + 2, s * 0.46, s * 0.13, 0.28);
    const tw = Math.max(5, Math.round(s * 0.15)), th = Math.round(s * 0.55);
    c.fillStyle = p.trunkD; c.fillRect((x - tw / 2) | 0, (y - th) | 0, tw, th);
    c.fillStyle = p.trunk;  c.fillRect((x - tw / 2) | 0, (y - th) | 0, Math.round(tw * 0.62), th);
    c.fillStyle = p.trunkD; c.fillRect((x - tw / 2 - 2) | 0, (y - 4) | 0, tw + 4, 4);
    for (let i = 0; i < th / 5; i++) {
        c.fillStyle = r() < 0.5 ? p.trunkD : p.trunkL;
        c.fillRect(((x - tw / 2) + 1 + r() * (tw - 3)) | 0, (y - th + r() * (th - 5)) | 0, 1, 3 + Math.floor(r() * 3));
    }
    const cy = y - th - s * 0.13, n = Math.round(s / 4) + 9, blobs = [];
    for (let i = 0; i < n; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s * 0.3;
        blobs.push([x + Math.cos(a) * d * 1.12, cy + Math.sin(a) * d * 0.9, s * (0.15 + r() * 0.12)]);
    }
    blobs.forEach(b => bgCircle(c, b[0] + s * 0.04, b[1] + s * 0.05, b[2], p.leafD));
    blobs.forEach(b => bgCircle(c, b[0], b[1], b[2] * 0.95, p.leafM));
    blobs.forEach(b => bgCircle(c, b[0] - s * 0.04, b[1] - s * 0.05, b[2] * 0.55, p.leafL));
    for (let i = 0; i < s * 1.1; i++) {
        const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s * 0.42;
        c.fillStyle = r() < 0.5 ? p.leafL : p.leafD;
        c.fillRect((x + Math.cos(a) * d * 1.05) | 0, (cy + Math.sin(a) * d * 0.85) | 0, 2, 1);
    }
    if (p.fruit) {
        for (let i = 0; i < 7; i++) {
            const a = r() * Math.PI * 2, d = Math.sqrt(r()) * s * 0.34;
            bgDot(c, x + Math.cos(a) * d, cy + Math.sin(a) * d * 0.85, p.fruit, '#ffffff');
        }
    }
}
function bgBush(c, r, x, y, s, p) {
    bgShadow(c, x + s * 0.06, y + s * 0.3, s * 0.55, s * 0.17, 0.28);
    const n = Math.round(s / 5) + 4, blobs = [];
    for (let i = 0; i < n; i++) blobs.push([x + (r() - 0.5) * s * 0.7, y + (r() - 0.5) * s * 0.3, s * (0.16 + r() * 0.1)]);
    blobs.forEach(b => bgCircle(c, b[0] + 1, b[1] + 2, b[2], p.leafD));
    blobs.forEach(b => bgCircle(c, b[0], b[1], b[2] * 0.95, p.leafM));
    blobs.forEach(b => bgCircle(c, b[0] - 1, b[1] - 2, b[2] * 0.5, p.leafL));
    if (p.fruit) for (let i = 0; i < Math.round(s / 4); i++) bgDot(c, x + (r() - 0.5) * s * 0.8, y + (r() - 0.5) * s * 0.4, p.fruit, '#ffffff');
}
// Wooden fence seen from the front. pointed = picket tops, grain = plank texture.
function bgFence(c, r, x, y, w, h, p, pointed) {
    c.fillStyle = 'rgba(0,0,0,0.2)'; c.fillRect(x, y + h, w, 4);
    c.fillStyle = p.rail;
    c.fillRect(x, (y + h * 0.26) | 0, w, 3); c.fillRect(x, (y + h * 0.66) | 0, w, 3);
    const pw = pointed ? 9 : 14, gap = pointed ? 5 : 1;
    for (let px = x; px < x + w; px += pw + gap) {
        const ww = Math.min(pw, x + w - px);
        c.fillStyle = p.dark;  c.fillRect(px, y + 3, ww, h - 3);
        c.fillStyle = p.main;  c.fillRect(px, y + 3, Math.max(1, ww - 2), h - 3);
        c.fillStyle = p.light; c.fillRect(px + 1, y + 5, 1, h - 7);
        if (pointed) {
            c.fillStyle = p.main;
            c.beginPath(); c.moveTo(px, y + 3.5); c.lineTo(px + ww / 2, y); c.lineTo(px + ww, y + 3.5); c.closePath(); c.fill();
        } else {
            c.fillStyle = p.dark; c.fillRect(px, y + 3, ww, 2);
            for (let k = 0; k < 3; k++) { c.fillStyle = p.dark; c.fillRect(px + 2 + Math.floor(r() * (ww - 5)), (y + 8 + r() * (h - 14)) | 0, 1, 4 + Math.floor(r() * 5)); }
        }
        c.fillStyle = p.nail;
        c.fillRect(px + Math.floor(ww / 2) - 1, (y + h * 0.26 + 1) | 0, 1, 1);
        c.fillRect(px + Math.floor(ww / 2) - 1, (y + h * 0.66 + 1) | 0, 1, 1);
    }
}
// Flat stepping stone.
function bgStone(c, r, x, y, rx, ry) {
    bgEllipse(c, x + 1, y + 2, rx, ry, 'rgba(0,0,0,0.25)');
    bgEllipse(c, x, y, rx, ry, '#8c9096');
    bgEllipse(c, x - 1, y - 1, rx - 1, ry - 1, '#aeb2b8');
    bgEllipse(c, x - rx * 0.25, y - ry * 0.35, rx * 0.5, ry * 0.3, '#c9ccd1');
    bgSpeckle(c, r, x - rx * 0.7, y - ry * 0.6, rx * 1.4, ry * 1.2, ['#8c9096', '#d2d5d9'], 5, 1, 1);
}
// One curved leaf / frond: base (x,y), direction ang (radians), length len, droop bends the tip.
function bgFrond(c, x, y, ang, len, wid, droop, col, rib) {
    const dx = Math.cos(ang), dy = Math.sin(ang), px = -dy, py = dx, steps = 14, L = [], R = [], mid = [];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps, w = wid * Math.pow(Math.sin(Math.PI * Math.min(1, t * 0.92 + 0.04)), 0.85);
        const cx = x + dx * len * t + px * droop * t * t * len * 0.5;
        const cy = y + dy * len * t + py * droop * t * t * len * 0.5 + droop * t * t * len * 0.35;
        mid.push([cx, cy]); L.push([cx + px * w, cy + py * w]); R.push([cx - px * w, cy - py * w]);
    }
    c.fillStyle = col; c.beginPath(); c.moveTo(L[0][0], L[0][1]);
    for (let i = 1; i <= steps; i++) c.lineTo(L[i][0], L[i][1]);
    for (let i = steps; i >= 0; i--) c.lineTo(R[i][0], R[i][1]);
    c.closePath(); c.fill();
    if (rib) {
        c.strokeStyle = rib; c.lineWidth = 1; c.beginPath(); c.moveTo(mid[0][0], mid[0][1]);
        for (let i = 1; i <= steps; i++) c.lineTo(mid[i][0], mid[i][1]);
        c.stroke();
    }
}
function bgFern(c, r, x, y, s, cols) {
    const n = 7;
    for (let i = 0; i < n; i++) {
        const a = -Math.PI / 2 + (i - (n - 1) / 2) * 0.42 + (r() - 0.5) * 0.15;
        bgFrond(c, x, y, a, s * (0.7 + r() * 0.3), s * 0.1, 0.9, cols[i % cols.length], cols[2]);
    }
}
function bgBamboo(c, r, x, y, h, w, withLeaves) {
    bgShadow(c, x + 2, y + 1, w * 1.4, 2.5, 0.3);
    c.fillStyle = '#4f8a2a'; c.fillRect((x - w / 2) | 0, y - h, w, h);
    c.fillStyle = '#74b83f'; c.fillRect((x - w / 2) | 0, y - h, w - 2, h);
    c.fillStyle = '#a7dd6c'; c.fillRect((x - w / 2 + 1) | 0, y - h, 1, h);
    const nodes = [];
    for (let ny = y - 10 - Math.floor(r() * 8); ny > y - h + 6; ny -= 14 + Math.floor(r() * 7)) {
        nodes.push(ny);
        c.fillStyle = '#35651b'; c.fillRect((x - w / 2 - 1) | 0, ny, w + 2, 2);
        c.fillStyle = '#9ad25a'; c.fillRect((x - w / 2 - 1) | 0, ny + 2, w + 2, 1);
    }
    if (withLeaves) {
        nodes.forEach((ny, i) => {
            if (i % 2 === 0 && ny < y - h * 0.4) {
                const side = r() < 0.5 ? -1 : 1;
                bgFrond(c, x, ny, side < 0 ? Math.PI * 0.85 : Math.PI * 0.15, 10 + r() * 6, 1.8, 0.6, '#5ea32c', '#3d7d1c');
            }
        });
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + (i - 2) * 0.55;
            bgFrond(c, x, y - h + 2, a, 14 + r() * 5, 2.2, 0.7, i % 2 ? '#6fb83a' : '#4f9a24', '#33701a');
        }
    }
}
function bgHayBale(c, r, x, y, w, h) {
    bgShadow(c, x + w / 2 + 2, y + h + 1, w / 2 + 4, 4, 0.3);
    c.fillStyle = '#b98a2c'; c.fillRect(x, y, w, h);
    c.fillStyle = '#e1b84f'; c.fillRect(x, y, w, h - 3);
    c.fillStyle = '#f0d27c'; c.fillRect(x, y, w, 3);
    for (let i = 0; i < w * h / 7; i++) {
        c.fillStyle = r() < 0.5 ? '#c99a3a' : '#f3dc8e';
        c.fillRect(x + ((r() * w) | 0), y + ((r() * h) | 0), 2 + Math.floor(r() * 3), 1);
    }
    c.fillStyle = '#6e4d1f';
    c.fillRect(x + (w * 0.28 | 0), y, 2, h); c.fillRect(x + (w * 0.7 | 0), y, 2, h);
}
function bgLily(c, r, x, y, rad) {
    bgEllipse(c, x + 1, y + 1, rad, rad * 0.65, 'rgba(0,40,60,0.35)');
    bgEllipse(c, x, y, rad, rad * 0.65, '#3f9a4b');
    bgEllipse(c, x - 1, y - 1, rad * 0.7, rad * 0.4, '#5fba62');
    c.fillStyle = '#2d7a3c'; c.fillRect((x + 1) | 0, (y - 1) | 0, rad, 1);
}

// ---------- REGION 1: FRONT LAWN -----------------------------------------------------------
function bgBuildLawn(c, W, H, r) {
    c.fillStyle = '#5eb85a'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 60) { c.fillStyle = 'rgba(255,255,255,0.055)'; c.fillRect(0, y, W, 30); }
    bgSpeckle(c, r, 0, 0, W, H, ['#53a64f', '#4c9c48', '#6ac864', '#76d06f', '#58ae54'], W * H / 6, 2, 1);
    bgBlades(c, r, 0, 4, W, H, ['#3f8f3d', '#48a044', '#7ede77', '#8be884', '#5cb857'], W * H / 140, 3, 7);
    // clover leaves
    for (let i = 0; i < 70; i++) {
        const x = r() * W | 0, y = r() * H | 0;
        c.fillStyle = '#3f9444'; c.fillRect(x, y, 2, 2); c.fillRect(x + 3, y + 1, 2, 2); c.fillRect(x + 1, y + 3, 2, 2);
        c.fillStyle = '#5fc062'; c.fillRect(x, y, 1, 1); c.fillRect(x + 3, y + 1, 1, 1); c.fillRect(x + 1, y + 3, 1, 1);
    }
    for (let i = 0; i < 38; i++) bgDaisy(c, r() * W, 40 + r() * (H - 40), '#ffffff', '#f6c93a');
    for (let i = 0; i < 16; i++) bgDot(c, r() * W, 40 + r() * (H - 40), '#f7d330', '#fff59a');
    for (let i = 0; i < 12; i++) bgDot(c, r() * W, 40 + r() * (H - 40), '#c7a6f2', '#eadcff');
    // flagstone path from the bottom towards the feeder
    let px = W / 2 + 6;
    for (let y = H - 14; y > 230; y -= 30) {
        px += (r() - 0.5) * 16;
        bgStone(c, r, px | 0, y, 18 + r() * 5, 10 + r() * 3);
        bgTuft(c, r, (px - 22) | 0, y + 4, 3, 3, 5, ['#3f8f3d', '#5cb857']);
        bgTuft(c, r, (px + 23) | 0, y + 3, 3, 3, 5, ['#3f8f3d', '#5cb857']);
    }
    // picket fence along the top, bushes at the corners
    bgFence(c, r, 0, 4, W, 34, { rail: '#d8d2c2', main: '#f6f3ea', dark: '#c9c3b2', light: '#ffffff', nail: '#8d8776' }, true);
    const hedge = { leafD: '#2c7a3a', leafM: '#3d9a4a', leafL: '#63c46a', fruit: '#ff8fb6' };
    bgBush(c, r, 26, 66, 46, hedge);
    bgBush(c, r, W - 28, 70, 50, { leafD: '#2c7a3a', leafM: '#3d9a4a', leafL: '#63c46a', fruit: '#ffd1e0' });
    bgRock(c, r, W - 30, H - 70, 16);
    bgRock(c, r, 30, H - 40, 12);
    bgLightPools(c, r, W, H, 7, 0.1, '255,255,210');
    bgVignette(c, W, H, 0.2);
}

// ---------- REGION 2: SAFARI ---------------------------------------------------------------
function bgAcacia(c, r, x, y, s) {
    bgShadow(c, x + s * 0.12, y + 2, s * 0.5, s * 0.1, 0.25);
    c.strokeStyle = '#4a3220'; c.lineCap = 'round';
    c.lineWidth = Math.max(4, s * 0.09);
    c.beginPath(); c.moveTo(x, y); c.quadraticCurveTo(x - 2, y - s * 0.3, x - s * 0.04, y - s * 0.46); c.stroke();
    c.lineWidth = Math.max(3, s * 0.06);
    c.beginPath(); c.moveTo(x - s * 0.04, y - s * 0.4); c.lineTo(x - s * 0.3, y - s * 0.66); c.stroke();
    c.beginPath(); c.moveTo(x - s * 0.04, y - s * 0.42); c.lineTo(x + s * 0.28, y - s * 0.64); c.stroke();
    c.beginPath(); c.moveTo(x - s * 0.04, y - s * 0.44); c.lineTo(x - s * 0.02, y - s * 0.7); c.stroke();
    c.lineCap = 'butt';
    const tops = [[x - s * 0.3, y - s * 0.68, s * 0.34], [x + s * 0.28, y - s * 0.66, s * 0.32], [x - s * 0.02, y - s * 0.74, s * 0.38]];
    tops.forEach(t => { bgEllipse(c, t[0], t[1] + 3, t[2], t[2] * 0.3, '#4e6a2c'); });
    tops.forEach(t => { bgEllipse(c, t[0], t[1], t[2], t[2] * 0.3, '#6c8c3a'); });
    tops.forEach(t => { bgEllipse(c, t[0] - 2, t[1] - 3, t[2] * 0.82, t[2] * 0.18, '#8fb04e'); });
    tops.forEach(t => bgSpeckle(c, r, t[0] - t[2], t[1] - t[2] * 0.3, t[2] * 2, t[2] * 0.6, ['#4e6a2c', '#a8c862'], 26, 2, 1));
}
function bgBuildSafari(c, W, H, r) {
    c.fillStyle = '#dfb35c'; c.fillRect(0, 0, W, H);
    // soft sandy dunes (large, low contrast)
    for (let i = 0; i < 9; i++) {
        const y = r() * H, a = r() * 40 + 20;
        c.fillStyle = r() < 0.5 ? 'rgba(255,230,160,0.14)' : 'rgba(150,100,30,0.08)';
        c.beginPath(); c.moveTo(0, y);
        for (let x = 0; x <= W; x += 20) c.lineTo(x, y + Math.sin(x / 70 + i) * 10);
        c.lineTo(W, y + a); for (let x = W; x >= 0; x -= 20) c.lineTo(x, y + a + Math.sin(x / 55 + i) * 8); c.closePath(); c.fill();
    }
    bgSpeckle(c, r, 0, 0, W, H, ['#d2a24a', '#c99637', '#e8c273', '#efd085', '#d6a851'], W * H / 5, 2, 1);
    // wind ripples
    for (let i = 0; i < 70; i++) {
        const x = r() * W | 0, y = r() * H | 0, l = 8 + r() * 14 | 0;
        c.fillStyle = 'rgba(120,80,20,0.18)'; c.fillRect(x, y, l, 1);
        c.fillStyle = 'rgba(255,238,180,0.28)'; c.fillRect(x + 2, y + 1, l - 3, 1);
    }
    // cracked, dry earth patches
    [[0.22, 0.62, 70], [0.75, 0.42, 58], [0.5, 0.9, 64]].forEach(pt => {
        const cx = pt[0] * W, cy = pt[1] * H, rad = pt[2];
        c.fillStyle = 'rgba(160,110,50,0.18)'; c.beginPath(); c.ellipse(cx, cy, rad, rad * 0.55, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = 'rgba(100,60,20,0.5)'; c.lineWidth = 1;
        for (let k = 0; k < 14; k++) {
            let x = cx + (r() - 0.5) * rad * 1.4, y = cy + (r() - 0.5) * rad * 0.8;
            c.beginPath(); c.moveTo(x, y);
            for (let s = 0; s < 5; s++) { x += (r() - 0.5) * 18; y += (r() - 0.5) * 12; c.lineTo(x | 0, y | 0); }
            c.stroke();
        }
    });
    // pebbles and rocks
    for (let i = 0; i < 70; i++) bgEllipse(c, r() * W, r() * H, 1 + r() * 1.5, 1, r() < 0.5 ? '#b58a45' : '#f2d796');
    bgRock(c, r, W * 0.12, H * 0.36, 26, ['#7a6248', '#a8896a', '#cdb08d']);
    bgRock(c, r, W * 0.84, H * 0.7, 20, ['#7a6248', '#a8896a', '#cdb08d']);
    bgRock(c, r, W * 0.34, H * 0.86, 13, ['#7a6248', '#a8896a', '#cdb08d']);
    // dry grass tufts
    for (let i = 0; i < 90; i++) bgTuft(c, r, r() * W | 0, 30 + r() * (H - 30) | 0, 4 + Math.floor(r() * 3), 4, 10, ['#a89b45', '#8f8537', '#cbbd63', '#b3a24b']);
    // termite mound
    const mx = W * 0.8, my = H * 0.3;
    bgShadow(c, mx + 4, my + 4, 26, 7, 0.3);
    c.fillStyle = '#8a5a30'; c.beginPath(); c.moveTo(mx - 20, my + 2); c.lineTo(mx - 6, my - 34); c.lineTo(mx + 4, my - 30); c.lineTo(mx + 22, my + 2); c.closePath(); c.fill();
    c.fillStyle = '#b07a46'; c.beginPath(); c.moveTo(mx - 20, my + 2); c.lineTo(mx - 6, my - 34); c.lineTo(mx - 2, my - 32); c.lineTo(mx - 8, my + 2); c.closePath(); c.fill();
    bgSpeckle(c, r, mx - 18, my - 30, 38, 32, ['#6d4522', '#c9945c'], 50, 2, 1);
    // trees at the top
    bgAcacia(c, r, W * 0.2, 74, 96);
    bgAcacia(c, r, W * 0.88, 60, 80);
    bgAcacia(c, r, W * 0.6, 36, 56);
    bgVignette(c, W, H, 0.16);
    bgLightPools(c, r, W, H, 5, 0.1, '255,240,190');
}

// ---------- REGION 3: BACKYARD -------------------------------------------------------------
function bgBuildBackyard(c, W, H, r) {
    c.fillStyle = '#4ea455'; c.fillRect(0, 0, W, H);
    for (let x = 0; x < W; x += 70) { c.fillStyle = 'rgba(255,255,255,0.04)'; c.fillRect(x, 0, 35, H); }
    bgSpeckle(c, r, 0, 0, W, H, ['#448f4b', '#3d8644', '#5cbb62', '#66c56b', '#4ba052'], W * H / 6, 2, 1);
    bgBlades(c, r, 0, 4, W, H, ['#347a3c', '#3f8a46', '#74d37a', '#80dc85'], W * H / 150, 3, 7);
    for (let i = 0; i < 24; i++) bgDaisy(c, r() * W, 60 + r() * (H - 60), '#fff4c2', '#f0a020');
    // dark earth beneath the fence
    c.fillStyle = '#5b4030'; c.fillRect(0, 36, W, 6);
    bgSpeckle(c, r, 0, 36, W, 6, ['#4a3324', '#6e503c'], 90, 2, 1);
    // vegetable patch (bottom-left)
    const vx = 18, vy = H - 118, vw = 118, vh = 70;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(vx + 3, vy + 4, vw, vh);
    c.fillStyle = '#6a4a31'; c.fillRect(vx - 3, vy - 3, vw + 6, vh + 6);
    c.fillStyle = '#4a3322'; c.fillRect(vx, vy, vw, vh);
    for (let row = 0; row < 4; row++) {
        c.fillStyle = '#5c4029'; c.fillRect(vx + 2, vy + 5 + row * 17, vw - 4, 7);
        for (let k = 0; k < 6; k++) {
            const cx = vx + 10 + k * 19, cy = vy + 9 + row * 17;
            const kind = row % 2;
            if (kind === 0) { bgCircle(c, cx, cy, 5, '#2f8a3b'); bgCircle(c, cx - 1, cy - 1, 3.2, '#5cbf5f'); bgCircle(c, cx - 2, cy - 2, 1.4, '#9be39c'); }
            else { bgFrond(c, cx, cy + 3, -Math.PI / 2, 9, 2.4, 0.2, '#3d9a45', '#2a7433'); bgFrond(c, cx, cy + 3, -Math.PI / 2 - 0.5, 8, 2, 0.4, '#4cae52', null); bgFrond(c, cx, cy + 3, -Math.PI / 2 + 0.5, 8, 2, 0.4, '#4cae52', null); bgDot(c, cx, cy + 4, '#f08a2b', '#ffc27a'); }
        }
    }
    // flower bed along the fence (tulips)
    for (let x = 90; x < W - 90; x += 9) {
        const y = 52 + Math.sin(x / 11) * 2;
        c.fillStyle = '#2f8a3b'; c.fillRect(x | 0, y | 0, 1, 7); c.fillRect((x - 2) | 0, (y + 3) | 0, 2, 1); c.fillRect((x + 1) | 0, (y + 4) | 0, 2, 1);
        const col = bgPick(r, [['#e84a5f', '#ff8a9a'], ['#f7c53d', '#ffe685'], ['#ff8fb6', '#ffc6dc'], ['#b46ae8', '#d9a6ff']]);
        c.fillStyle = col[0]; c.fillRect((x - 1) | 0, (y - 4) | 0, 3, 5);
        c.fillStyle = col[1]; c.fillRect((x - 1) | 0, (y - 4) | 0, 1, 3);
    }
    // stepping stones in an S curve
    let sx = W * 0.62;
    for (let y = H - 20, k = 0; y > 250; y -= 34, k++) { sx = W * 0.62 + Math.sin(k * 0.9) * 40; bgStone(c, r, sx | 0, y, 17 + r() * 4, 10); }
    // stump with growth rings
    const tx = W - 52, ty = H - 56;
    bgShadow(c, tx + 3, ty + 12, 26, 8, 0.3);
    c.fillStyle = '#6b4526'; c.fillRect(tx - 20, ty - 2, 40, 14);
    bgEllipse(c, tx, ty + 12, 20, 7, '#6b4526');
    bgEllipse(c, tx, ty - 2, 20, 9, '#d3a66a');
    bgEllipse(c, tx, ty - 2, 15, 6.5, '#c0905a'); bgEllipse(c, tx, ty - 2, 10, 4.4, '#d3a66a'); bgEllipse(c, tx, ty - 2, 5, 2.4, '#bd8c55'); bgEllipse(c, tx, ty - 2, 1.5, 1, '#8a5f33');
    for (let i = 0; i < 8; i++) { c.fillStyle = '#573619'; c.fillRect((tx - 18 + i * 5) | 0, ty + 2, 1, 9); }
    // oak at the top-left, small bushes top-right
    bgFence(c, r, 0, 4, W, 38, { rail: '#7a5a3a', main: '#a47a4f', dark: '#7d5a38', light: '#c79d70', nail: '#3c2a1a' }, false);
    bgTree(c, r, 46, 104, 104, { trunk: '#7a5230', trunkD: '#523520', trunkL: '#9a6e42', leafD: '#2a7036', leafM: '#3b9148', leafL: '#6fcc72' });
    bgBush(c, r, W - 40, 72, 52, { leafD: '#2c7a3a', leafM: '#3d9a4a', leafL: '#63c46a', fruit: '#ff6f91' });
    bgRock(c, r, W * 0.3, H * 0.62, 14);
    bgLightPools(c, r, W, H, 6, 0.09, '255,255,210');
    bgVignette(c, W, H, 0.2);
}

// ---------- REGION 4: BEE YARD -------------------------------------------------------------
function bgDrawHive(c, hx, hy) {
    bgShadow(c, hx + 4, hy + 30, 30, 8, 0.32);
    c.fillStyle = '#5a3a1e'; c.fillRect(hx - 21, hy + 14, 5, 15); c.fillRect(hx + 16, hy + 14, 5, 15);
    c.fillStyle = '#7a5230'; c.fillRect(hx - 21, hy + 14, 2, 15); c.fillRect(hx + 16, hy + 14, 2, 15);
    c.fillStyle = '#6a4526'; c.fillRect(hx - 24, hy + 12, 48, 5);
    c.fillStyle = '#8b5e34'; c.fillRect(hx - 24, hy + 12, 48, 2);
    const tiers = [[hy - 21, '#f2c14e', '#d99a1f'], [hy - 8, '#f7d170', '#e0a826'], [hy + 4, '#f2c14e', '#d99a1f']];
    tiers.forEach((t, i) => {
        c.fillStyle = t[2]; c.fillRect(hx - 19, t[0], 38, 13);
        c.fillStyle = t[1]; c.fillRect(hx - 19, t[0], 33, 11);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(hx - 18, t[0] + 1, 31, 1);
        c.fillStyle = 'rgba(120,70,0,0.45)'; c.fillRect(hx - 19, t[0] + 12, 38, 1);
        c.fillStyle = '#9a6a1c'; c.fillRect(hx - 19, t[0] + 4, 38, 1); // wood grain lines
        c.fillStyle = '#b8801f'; c.fillRect(hx - 14 + i * 5, t[0] + 8, 9, 1);
        c.fillStyle = '#5a3a14'; c.fillRect(hx - 7, t[0] + 5, 4, 1); c.fillRect(hx + 4, t[0] + 6, 5, 1); // handles
    });
    c.fillStyle = '#2a1a0c'; c.fillRect(hx - 6, hy + 9, 12, 3);        // entrance slot
    c.fillStyle = '#c28a3f'; c.fillRect(hx - 9, hy + 12, 18, 2);        // landing board
    // sloped lid
    c.fillStyle = '#7d3f1c'; c.fillRect(hx - 23, hy - 29, 46, 8);
    c.fillStyle = '#b3612e'; c.fillRect(hx - 23, hy - 29, 46, 5);
    c.fillStyle = '#d98a52'; c.fillRect(hx - 22, hy - 29, 44, 1);
    c.fillStyle = '#5f2e12'; c.fillRect(hx - 23, hy - 22, 46, 1);
}
function bgBuildBeeYard(c, W, H, r) {
    c.fillStyle = '#5fa65a'; c.fillRect(0, 0, W, H);
    for (let y = 0; y < H; y += 70) { c.fillStyle = 'rgba(255,255,255,0.045)'; c.fillRect(0, y, W, 35); }
    bgSpeckle(c, r, 0, 0, W, H, ['#549a50', '#4a8f47', '#6fba68', '#7ac473', '#5fa65a'], W * H / 6, 2, 1);
    bgBlades(c, r, 0, 4, W, H, ['#3b8039', '#468e43', '#82d27c', '#8fdc88', '#aee68c'], W * H / 110, 4, 9);
    // wild flowers, tiny and pale so the big pink pollination flowers still stand out
    for (let i = 0; i < 90; i++) {
        const x = r() * W, y = r() * H, k = r();
        if (k < 0.34) bgDaisy(c, x, y, '#ffffff', '#f5c518');
        else if (k < 0.62) bgDot(c, x, y, '#ffe14d', '#fff7b0');
        else if (k < 0.84) bgDot(c, x, y, '#a9c7ff', '#e0ecff');
        else bgDot(c, x, y, '#cfa8ff', '#eddcff');
    }
    // lavender rows
    [H * 0.46, H * 0.66, H * 0.86].forEach((ry, bi) => {
        for (let x = 12 + bi * 6; x < W - 10; x += 7 + r() * 5) {
            const yy = ry + Math.sin(x / 26 + bi) * 5 + r() * 6, h = 9 + r() * 6 | 0;
            c.fillStyle = '#3f8b44'; c.fillRect(x | 0, yy - 2, 1, 4); c.fillRect((x - 1) | 0, yy - 1, 3, 1);
            c.fillStyle = '#6d58b8'; c.fillRect(x | 0, yy - h, 2, h - 2);
            c.fillStyle = '#9b83e6'; c.fillRect(x | 0, yy - h, 1, h - 3);
            c.fillStyle = '#c3b0ff'; c.fillRect(x | 0, yy - h - 1, 1, 2);
            c.fillStyle = '#2f7a38'; c.fillRect((x + 1) | 0, yy - 4, 1, 4);
        }
    });
    // little stone path to the hive
    for (let i = 0; i < 6; i++) bgStone(c, r, region4Hive.x - 10 + i * 5 + (r() - 0.5) * 6, region4Hive.y + 52 + i * 30, 12, 7);
    // apple trees at the top corners
    bgTree(c, r, 36, 66, 74, { trunk: '#7a5230', trunkD: '#523520', trunkL: '#9a6e42', leafD: '#2f7d3c', leafM: '#47a653', leafL: '#7ad680', fruit: '#ff9fbd' });
    bgTree(c, r, W - 36, 56, 66, { trunk: '#7a5230', trunkD: '#523520', trunkL: '#9a6e42', leafD: '#2f7d3c', leafM: '#47a653', leafL: '#7ad680', fruit: '#fff0f5' });
    bgRock(c, r, W * 0.12, H * 0.62, 14);
    bgDrawHive(c, region4Hive.x, region4Hive.y);
    bgLightPools(c, r, W, H, 7, 0.1, '255,255,200');
    bgVignette(c, W, H, 0.18);
}

// ---------- REGION 5: LAKE -----------------------------------------------------------------
function getLakeShape() {
    const W = canvas.width, H = canvas.height;
    return { cx: W / 2, cy: H - 86, rx: (W - 56) / 2 + 6, ry: 54 };
}
function bgBuildLake(c, W, H, r) {
    c.fillStyle = '#2f6e3c'; c.fillRect(0, 0, W, H);
    bgSpeckle(c, r, 0, 0, W, H, ['#295f35', '#357a43', '#3f8a4d', '#255730', '#4a9658'], W * H / 5, 2, 1);
    bgBlades(c, r, 0, 4, W, H, ['#255a31', '#3a8548', '#5cb06a', '#6cc17a'], W * H / 160, 3, 7);
    // leaf litter + tiny mushrooms + flowers
    for (let i = 0; i < 70; i++) { c.fillStyle = bgPick(r, ['#9a6a2a', '#c58b34', '#7a4f1f', '#d9a441']); c.fillRect(r() * W | 0, r() * (H - 160) | 0, 2, 1); }
    for (let i = 0; i < 14; i++) bgDot(c, r() * W, 90 + r() * (H - 260), bgPick(r, ['#ffffff', '#ffd966', '#ff9fb8']), '#ffffff');
    for (let i = 0; i < 6; i++) {
        const x = r() * W | 0, y = 110 + r() * (H - 300) | 0;
        c.fillStyle = '#efe6d0'; c.fillRect(x, y, 2, 3); bgEllipse(c, x + 1, y, 3.4, 2.2, '#d9483b'); c.fillStyle = '#fff'; c.fillRect(x - 1, y - 1, 1, 1); c.fillRect(x + 2, y, 1, 1);
    }
    // lake: shore -> wet bank -> water
    const L = getLakeShape(), f = bgBlobFactors(r, 22, 0.07);
    bgBlobPath(c, L.cx, L.cy, L.rx, L.ry, f, 13); c.fillStyle = '#7d6a43'; c.fill();       // dark bank
    bgBlobPath(c, L.cx, L.cy, L.rx, L.ry, f, 9);  c.fillStyle = '#d7c48d'; c.fill();        // sand
    bgSpeckle(c, r, L.cx - L.rx - 10, L.cy - L.ry - 10, L.rx * 2 + 20, L.ry * 2 + 20, ['#c4af76', '#e8d9a6', '#b09a63'], 400, 1, 1);
    bgBlobPath(c, L.cx, L.cy, L.rx, L.ry, f, 3);  c.fillStyle = '#6fb6d8'; c.fill();        // shallows
    c.save();
    bgBlobPath(c, L.cx, L.cy, L.rx, L.ry, f, 0); c.clip();
    const g = c.createLinearGradient(0, L.cy - L.ry, 0, L.cy + L.ry);
    g.addColorStop(0, '#3f98cc'); g.addColorStop(0.55, '#2879b4'); g.addColorStop(1, '#1d5f96');
    c.fillStyle = g; c.fillRect(L.cx - L.rx - 10, L.cy - L.ry - 10, L.rx * 2 + 20, L.ry * 2 + 20);
    // soft depth
    const dg = c.createRadialGradient(L.cx, L.cy, 4, L.cx, L.cy, L.rx * 0.8);
    dg.addColorStop(0, 'rgba(10,50,100,0.28)'); dg.addColorStop(1, 'rgba(10,50,100,0)');
    c.fillStyle = dg; c.fillRect(L.cx - L.rx, L.cy - L.ry, L.rx * 2, L.ry * 2);
    for (let i = 0; i < 90; i++) {   // ripples
        const x = L.cx + (r() - 0.5) * L.rx * 1.9, y = L.cy + (r() - 0.5) * L.ry * 1.8, l = 6 + r() * 12 | 0;
        c.fillStyle = 'rgba(255,255,255,0.22)'; c.fillRect(x | 0, y | 0, l, 1);
        c.fillStyle = 'rgba(0,40,90,0.2)'; c.fillRect((x + 3) | 0, (y + 1) | 0, l - 4, 1);
    }
    c.restore();
    // reeds and lilies
    [[0.08, 0.1], [0.12, 0.62], [0.9, 0.18], [0.88, 0.66], [0.3, -0.08], [0.72, 1.04]].forEach(pt => {
        const rx0 = L.cx - L.rx + pt[0] * L.rx * 2, ry0 = L.cy - L.ry + (pt[1] + 0.5) * L.ry * 0.9;
        for (let k = 0; k < 6; k++) {
            const x = rx0 + (k - 3) * 3 + (r() - 0.5) * 3, h = 14 + r() * 12 | 0;
            c.fillStyle = k % 2 ? '#3a8a3a' : '#2d7030'; c.fillRect(x | 0, ry0 - h, 1, h);
            if (k % 3 === 0) { c.fillStyle = '#6b3f1e'; c.fillRect((x - 1) | 0, ry0 - h - 5, 3, 6); c.fillStyle = '#8a5a2e'; c.fillRect((x - 1) | 0, ry0 - h - 5, 1, 6); }
        }
    });
    [[0.2, 0.3, 8], [0.28, 0.55, 6], [0.8, 0.38, 8], [0.68, 0.7, 6], [0.56, 0.2, 5]].forEach(p => {
        const x = L.cx - L.rx + p[0] * L.rx * 2, y = L.cy - L.ry * 0.6 + p[1] * L.ry * 1.1;
        bgLily(c, r, x, y, p[2]);
        if (p[2] >= 8) bgFlowerTop(c, x - 1, y - 1, 2.4, '#ffd0e6', '#ffd447');
    });
    // wooden dock where the bear fishes
    const dx = L.cx;
    c.fillStyle = 'rgba(0,30,60,0.35)'; c.fillRect(dx - 17, L.cy - L.ry - 4, 38, 62);
    for (let y = L.cy - L.ry - 12; y < L.cy + 6; y += 6) {
        c.fillStyle = '#7a5230'; c.fillRect(dx - 17, y, 34, 6);
        c.fillStyle = '#a77a4a'; c.fillRect(dx - 17, y, 34, 4);
        c.fillStyle = '#c99b66'; c.fillRect(dx - 16, y, 32, 1);
        c.fillStyle = '#4e3220'; c.fillRect(dx - 16, y + 2, 1, 1); c.fillRect(dx + 15, y + 2, 1, 1);
    }
    [[-19, -L.ry - 12], [17, -L.ry - 12], [-19, 4], [17, 4]].forEach(p => { c.fillStyle = '#4e3220'; c.fillRect(dx + p[0], L.cy + p[1], 4, 5); c.fillStyle = '#7a5230'; c.fillRect(dx + p[0], L.cy + p[1], 2, 5); });
    // forest along the top, rocks on the shore
    const pal = { trunk: '#6a4426', trunkD: '#46301c', trunkL: '#8a5e36', leafD: '#14502a', leafM: '#1f7a3c', leafL: '#46b060' };
    const pal2 = { trunk: '#6a4426', trunkD: '#46301c', trunkL: '#8a5e36', leafD: '#1b5e2f', leafM: '#2a8a45', leafL: '#5cc274' };
    for (let x = 22, k = 0; x < W + 30; x += 62, k++) bgTree(c, r, x + (r() - 0.5) * 18, 70 + (k % 2) * 8, 78 + r() * 18, k % 2 ? pal : pal2);
    bgBush(c, r, W * 0.2, 150, 34, pal2);
    bgBush(c, r, W * 0.86, 190, 40, pal);
    bgRock(c, r, 20, L.cy + L.ry + 24, 16);
    bgRock(c, r, W - 26, L.cy - L.ry - 16, 20);
    bgRock(c, r, W * 0.7, L.cy + L.ry + 20, 11);
    bgLightPools(c, r, W, H, 6, 0.09, '255,255,210');
    bgVignette(c, W, H, 0.22);
}

// ---------- REGION 6: PIG STY --------------------------------------------------------------
function bgBuildSty(c, W, H, r) {
    c.fillStyle = '#bc9157'; c.fillRect(0, 0, W, H);
    // trampled dirt patches
    for (let i = 0; i < 22; i++) bgEllipse(c, r() * W, r() * H, 22 + r() * 40, 10 + r() * 20, r() < 0.5 ? 'rgba(120,80,40,0.17)' : 'rgba(255,225,150,0.12)');
    bgSpeckle(c, r, 0, 0, W, H, ['#a77d48', '#b08650', '#caa166', '#d3ab6f', '#9a713d'], W * H / 5, 2, 1);
    // straw strands
    c.lineWidth = 1;
    for (let i = 0; i < W * H / 70; i++) {
        const x = r() * W, y = r() * H, l = 3 + r() * 6, a = (r() - 0.5) * 2.6;
        c.strokeStyle = bgPick(r, ['#e2c070', '#f0d58c', '#c99a4a', '#d9b165', '#a97d3a']);
        c.beginPath(); c.moveTo(x | 0, y | 0); c.lineTo((x + Math.cos(a) * l) | 0, (y + Math.sin(a) * l * 0.6) | 0); c.stroke();
    }
    // mud pit
    const M = getMudPatch(), f = bgBlobFactors(r, 18, 0.07);
    bgShadow(c, M.cx + 3, M.cy + 6, M.rx + 12, M.ry + 8, 0.2);
    bgBlobPath(c, M.cx, M.cy, M.rx, M.ry, f, 7); c.fillStyle = '#8b6a3f'; c.fill();      // damp rim
    bgBlobPath(c, M.cx, M.cy, M.rx, M.ry, f, 3); c.fillStyle = '#6b4a28'; c.fill();
    c.save(); bgBlobPath(c, M.cx, M.cy, M.rx, M.ry, f, 0); c.clip();
    const g = c.createRadialGradient(M.cx - 14, M.cy - 8, 4, M.cx, M.cy, M.rx);
    g.addColorStop(0, '#6a4a2a'); g.addColorStop(1, '#3e2b16');
    c.fillStyle = g; c.fillRect(M.cx - M.rx - 10, M.cy - M.ry - 10, M.rx * 2 + 20, M.ry * 2 + 20);
    bgSpeckle(c, r, M.cx - M.rx, M.cy - M.ry, M.rx * 2, M.ry * 2, ['#2f2010', '#55391d', '#7b5a35'], 260, 2, 1);
    for (let i = 0; i < 6; i++) {   // wet sheen
        const x = M.cx + (r() - 0.5) * M.rx * 1.4, y = M.cy + (r() - 0.5) * M.ry * 1.2;
        bgEllipse(c, x, y, 7 + r() * 8, 2 + r() * 2.5, 'rgba(210,175,120,0.22)');
    }
    for (let i = 0; i < 5; i++) {   // hoof prints
        const x = M.cx + (r() - 0.5) * M.rx * 1.3, y = M.cy + (r() - 0.5) * M.ry * 1.1;
        c.fillStyle = '#2b1c0d'; c.fillRect(x | 0, y | 0, 2, 3); c.fillRect((x + 3) | 0, y | 0, 2, 3);
    }
    c.restore();
    // pebbles & stray hay tufts
    for (let i = 0; i < 40; i++) bgEllipse(c, r() * W, r() * H, 1 + r(), 1, r() < 0.5 ? '#8c6a3a' : '#d9c08a');
    for (let i = 0; i < 24; i++) bgTuft(c, r, r() * W | 0, 50 + r() * (H - 50) | 0, 4, 3, 6, ['#e8c97a', '#d3a94f', '#f2dc9a']);
    // hay bales + fences
    bgHayBale(c, r, 10, 54, 46, 28);
    bgHayBale(c, r, 24, 78, 40, 24);
    bgHayBale(c, r, W - 60, H - 74, 46, 28);
    const fp = { rail: '#6f4a28', main: '#a06f3d', dark: '#764f28', light: '#c28b52', nail: '#3c2a1a' };
    bgFence(c, r, 0, 4, W, 36, fp, false);
    bgFence(c, r, 0, H - 40, W, 36, fp, false);
    // wooden posts every so often to break the line up
    for (let x = 0; x < W; x += 76) { c.fillStyle = '#4e3220'; c.fillRect(x, 2, 6, 40); c.fillStyle = '#7a5230'; c.fillRect(x, 2, 3, 40); c.fillRect(x, H - 42, 3, 40); c.fillStyle = '#4e3220'; c.fillRect(x, H - 42, 6, 40); c.fillStyle = '#7a5230'; c.fillRect(x, H - 42, 3, 40); }
    bgLightPools(c, r, W, H, 5, 0.1, '255,240,190');
    bgVignette(c, W, H, 0.2);
}

// ---------- REGION 7: BAMBOO FOREST ---------------------------------------------------------
function bgBuildBamboo(c, W, H, r) {
    c.fillStyle = '#3d7a47'; c.fillRect(0, 0, W, H);
    bgSpeckle(c, r, 0, 0, W, H, ['#36703f', '#438650', '#4b9358', '#2f6838', '#5aa267'], W * H / 5, 2, 1);
    bgBlades(c, r, 0, 4, W, H, ['#2b6535', '#3a8a48', '#62b974', '#74cc83'], W * H / 120, 3, 8);
    // moss patches
    for (let i = 0; i < 16; i++) bgEllipse(c, r() * W, r() * H, 20 + r() * 28, 8 + r() * 12, 'rgba(120,200,110,0.12)');
    // fallen leaves & tiny blossoms
    for (let i = 0; i < 80; i++) { c.fillStyle = bgPick(r, ['#9bc34a', '#cfe27a', '#7ba33a', '#b7d45f']); const x = r() * W | 0, y = r() * H | 0; c.fillRect(x, y, 3, 1); c.fillRect(x + 1, y + 1, 1, 1); }
    for (let i = 0; i < 18; i++) bgDot(c, r() * W, r() * H, '#ffffff', '#ffffff');
    // ferns
    for (let i = 0; i < 9; i++) bgFern(c, r, r() * W, 90 + r() * (H - 130), 20 + r() * 12, ['#3c9a4e', '#2f8040', '#1f6030']);
    // stepping path of flat stones
    for (let y = H - 14, k = 0; y > 250; y -= 36, k++) bgStone(c, r, W * 0.5 + Math.sin(k) * 22 | 0, y, 15, 9);
    // mossy rocks
    bgRock(c, r, W * 0.22, H * 0.55, 24, ['#4d5a50', '#7b8a7e', '#a8b8a8']);
    bgRock(c, r, W * 0.8, H * 0.78, 18, ['#4d5a50', '#7b8a7e', '#a8b8a8']);
    c.fillStyle = 'rgba(80,160,70,0.5)'; c.beginPath(); c.ellipse(W * 0.22 - 4, H * 0.55 - 10, 14, 4, 0, 0, Math.PI * 2); c.fill();
    // bamboo groves along the edges (back row first)
    const groves = [[16, 130, 4], [34, 110, 5], [58, 96, 4], [W - 18, 140, 4], [W - 40, 112, 5], [W - 64, 100, 4], [26, H - 120, 5], [48, H - 98, 4], [W - 26, H - 118, 5], [W - 50, H - 96, 4], [W * 0.5 - 90, 84, 4], [W * 0.5 + 80, 90, 4]];
    groves.sort((a, b) => a[0] * 0 + a[1] - b[1]);
    groves.forEach(g => bgBamboo(c, r, g[0], g[1], 90 + r() * 70, g[2] + 2, true));
    // light shafts
    for (let i = 0; i < 5; i++) {
        const x = 30 + r() * (W - 60);
        const g = c.createLinearGradient(x, 0, x + 70, H * 0.8);
        g.addColorStop(0, 'rgba(255,255,200,0.14)'); g.addColorStop(1, 'rgba(255,255,200,0)');
        c.fillStyle = g; c.beginPath(); c.moveTo(x, 0); c.lineTo(x + 26, 0); c.lineTo(x + 100, H * 0.85); c.lineTo(x + 56, H * 0.85); c.closePath(); c.fill();
    }
    bgVignette(c, W, H, 0.26);
}

// ---------- REGION 8: JUNGLE ---------------------------------------------------------------
function bgMonstera(c, r, x, y, s) {
    bgShadow(c, x + 2, y + 3, s * 0.6, s * 0.18, 0.25);
    for (let i = 0; i < 5; i++) {
        const a = -Math.PI * 0.95 + i * (Math.PI * 0.9 / 4);
        const lx = x + Math.cos(a) * s * 0.45, ly = y + Math.sin(a) * s * 0.28 - s * 0.05;
        c.strokeStyle = '#1f6a34'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(lx, ly); c.stroke();
        c.save(); c.translate(lx, ly); c.rotate(a + Math.PI / 2);
        bgEllipse(c, 0, -s * 0.12, s * 0.2, s * 0.26, '#1a6a30');
        bgEllipse(c, -1, -s * 0.14, s * 0.18, s * 0.23, '#2e9a4a');
        bgEllipse(c, -3, -s * 0.2, s * 0.08, s * 0.1, '#58c473');
        c.strokeStyle = '#175a28'; c.lineWidth = 1;
        for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(0, -s * 0.12 + k * s * 0.05); c.lineTo(s * 0.2 * (k % 2 ? 1 : -1), -s * 0.12 + k * s * 0.07); c.stroke(); }
        c.beginPath(); c.moveTo(0, 0); c.lineTo(0, -s * 0.36); c.stroke();
        c.restore();
    }
}
function bgJungleTree(c, r, x, y, s) {
    bgShadow(c, x + s * 0.1, y + 3, s * 0.5, s * 0.12, 0.32);
    const tw = Math.max(9, s * 0.17), th = s * 0.6;
    c.fillStyle = '#3d2a1a';   // buttress roots
    c.beginPath(); c.moveTo(x - tw * 1.1, y + 2); c.quadraticCurveTo(x - tw * 0.5, y - 6, x - tw * 0.5, y - 16); c.lineTo(x + tw * 0.5, y - 16); c.quadraticCurveTo(x + tw * 0.5, y - 6, x + tw * 1.1, y + 2); c.closePath(); c.fill();
    c.fillStyle = '#4e3622'; c.fillRect((x - tw / 2) | 0, (y - th) | 0, tw | 0, th | 0);
    c.fillStyle = '#6a4a2e'; c.fillRect((x - tw / 2) | 0, (y - th) | 0, (tw * 0.55) | 0, th | 0);
    for (let i = 0; i < th / 4; i++) { c.fillStyle = r() < 0.5 ? '#3a281a' : '#7a5a3a'; c.fillRect(((x - tw / 2) + 1 + r() * (tw - 3)) | 0, (y - th + r() * (th - 6)) | 0, 1, 3 + Math.floor(r() * 5)); }
    c.fillStyle = 'rgba(80,170,70,0.55)'; c.fillRect((x - tw / 2) | 0, (y - 12) | 0, tw | 0, 4);       // moss band
    const cy = y - th - s * 0.1;
    // palm-like canopy of big fronds around a leafy centre
    for (let i = 0; i < 9; i++) {
        const a = -Math.PI + (i / 8) * Math.PI + (r() - 0.5) * 0.2;
        bgFrond(c, x, cy + 4, a, s * (0.46 + r() * 0.12), s * 0.07, 0.8, i % 2 ? '#1c6b34' : '#237f3d', '#124d24');
    }
    for (let i = 0; i < 7; i++) {
        const a = -Math.PI * 0.95 + (i / 6) * Math.PI * 0.9;
        bgFrond(c, x, cy + 2, a, s * 0.34, s * 0.06, 0.4, '#2f9a4d', '#1a7a38');
    }
    bgCircle(c, x, cy, s * 0.1, '#1f7a38'); bgCircle(c, x - 2, cy - 2, s * 0.055, '#4cc069');
    // hanging vines
    for (let i = 0; i < 4; i++) {
        const vx = x + (i - 1.5) * s * 0.2, vl = 30 + r() * 40;
        c.strokeStyle = '#3f7a2c'; c.lineWidth = 2; c.beginPath(); c.moveTo(vx, cy + 8); c.quadraticCurveTo(vx + (r() - 0.5) * 14, cy + 8 + vl / 2, vx + (r() - 0.5) * 6, cy + 8 + vl); c.stroke();
        for (let k = 0; k < 5; k++) { c.fillStyle = k % 2 ? '#5fb24a' : '#2f7a2c'; c.fillRect((vx + (r() - 0.5) * 6) | 0, (cy + 10 + r() * vl) | 0, 3, 2); }
    }
    if (r() < 0.8) for (let i = 0; i < 4; i++) bgDot(c, x + (r() - 0.5) * s * 0.5, cy + (r() - 0.2) * s * 0.2, '#ff7a3d', '#ffc08a');
}
function bgBuildJungle(c, W, H, r) {
    c.fillStyle = '#1c4f31'; c.fillRect(0, 0, W, H);
    bgSpeckle(c, r, 0, 0, W, H, ['#17452a', '#245e3a', '#2b6b43', '#143c24', '#33784c'], W * H / 4, 2, 1);
    bgBlades(c, r, 0, 4, W, H, ['#14402a', '#2c7a44', '#4aa860', '#5cc073'], W * H / 100, 3, 9);
    for (let i = 0; i < 20; i++) bgEllipse(c, r() * W, r() * H, 18 + r() * 34, 7 + r() * 14, 'rgba(10,30,15,0.18)');
    for (let i = 0; i < 90; i++) { c.fillStyle = bgPick(r, ['#6d4f2b', '#8a6a3a', '#55401f', '#a58340']); c.fillRect(r() * W | 0, r() * H | 0, 3, 1); }
    // understory: ferns and big leaf plants
    for (let i = 0; i < 10; i++) bgFern(c, r, r() * W, 80 + r() * (H - 110), 22 + r() * 14, ['#2f9a4d', '#27843f', '#1a6a2f']);
    bgMonstera(c, r, W * 0.1, H * 0.46, 54);
    bgMonstera(c, r, W * 0.92, H * 0.58, 60);
    bgMonstera(c, r, W * 0.2, H - 28, 50);
    // orchids / hibiscus
    for (let i = 0; i < 12; i++) bgFlowerTop(c, r() * W, 90 + r() * (H - 130), 2.2, bgPick(r, ['#ff4f6e', '#ff9a3d', '#ffd23d', '#ff7ad9']), '#fff2a8');
    // mossy boulders and a fallen log
    bgRock(c, r, W * 0.74, H * 0.4, 26, ['#2f3f35', '#55695b', '#7f9684']);
    c.fillStyle = 'rgba(90,190,80,0.55)'; c.beginPath(); c.ellipse(W * 0.74 - 4, H * 0.4 - 10, 15, 5, 0, 0, Math.PI * 2); c.fill();
    bgRock(c, r, W * 0.3, H * 0.84, 18, ['#2f3f35', '#55695b', '#7f9684']);
    const lx = W * 0.58, ly = H * 0.9;
    bgShadow(c, lx + 3, ly + 10, 52, 8, 0.3);
    c.fillStyle = '#4a3320'; c.fillRect(lx - 48, ly - 8, 96, 18);
    c.fillStyle = '#6b4a2e'; c.fillRect(lx - 48, ly - 8, 96, 8);
    bgEllipse(c, lx - 48, ly + 1, 5, 9, '#3a2616'); bgEllipse(c, lx - 49, ly + 1, 3.5, 7, '#c79a62'); bgEllipse(c, lx - 49, ly + 1, 1.5, 3, '#9a6f3c');
    for (let i = 0; i < 12; i++) { c.fillStyle = r() < 0.5 ? '#3a2616' : '#8a6038'; c.fillRect((lx - 40 + r() * 86) | 0, (ly - 6 + r() * 14) | 0, 4 + Math.floor(r() * 6), 1); }
    c.fillStyle = 'rgba(90,190,80,0.6)'; c.fillRect(lx - 20, ly - 9, 30, 3); c.fillRect(lx + 20, ly - 8, 22, 2);
    // trees (back to front) with vines
    const trees = [[W * 0.5, 78, 94], [W * 0.14, 92, 108], [W * 0.88, 84, 100], [W * 0.3, 160, 80], [W * 0.78, H - 90, 84], [W * 0.1, H - 64, 76]];
    trees.sort((a, b) => a[1] - b[1]);
    trees.forEach(t => bgJungleTree(c, r, t[0], t[1], t[2]));
    bgLightPools(c, r, W, H, 8, 0.09, '200,255,170');
    for (let i = 0; i < 26; i++) { c.fillStyle = 'rgba(255,255,170,' + (0.4 + r() * 0.4) + ')'; c.fillRect(r() * W | 0, r() * H | 0, 1, 1); }
    bgVignette(c, W, H, 0.32);
}

// ---------- cache + public entry points -----------------------------------------------------
const REGION_BG_BUILDERS = {
    1: bgBuildLawn, 2: bgBuildSafari, 3: bgBuildBackyard, 4: bgBuildBeeYard,
    5: bgBuildLake, 6: bgBuildSty, 7: bgBuildBamboo, 8: bgBuildJungle
};
const REGION_BG_CACHE = {};

// The finished background (an off-screen canvas the size of the game canvas) for region 1-8, or null.
function getRegionBackground(region) {
    const build = REGION_BG_BUILDERS[region];
    if (!build) return null;
    const W = canvas.width, H = canvas.height;
    const hit = REGION_BG_CACHE[region];
    if (hit && hit.w === W && hit.h === H) return hit.cv;
    const cv = document.createElement('canvas');
    cv.width = W; cv.height = H;
    const c = cv.getContext('2d');
    try { build(c, W, H, bgRng(region * 7919 + 13)); }
    catch (err) { console.error('Background for region ' + region + ' failed:', err); c.fillStyle = '#3a7a3a'; c.fillRect(0, 0, W, H); }
    REGION_BG_CACHE[region] = { w: W, h: H, cv: cv };
    return cv;
}

// Draws region 1-8's ground (returns false for regions that draw themselves: 9 and 10).
function drawRegionBackground(region) {
    const cv = getRegionBackground(region);
    if (!cv) return false;
    ctx.drawImage(cv, 0, 0);
    // The lake sparkles: a few glints that twinkle on top of the cached water.
    if (region === 5) {
        const L = getLakeShape(), t = performance.now() / 1000;
        for (let i = 0; i < 16; i++) {
            const ph = (t * 0.9 + i * 0.37) % 1;
            if (ph > 0.5) continue;
            const a = Math.sin(ph / 0.5 * Math.PI);
            const x = L.cx + Math.cos(i * 2.399) * L.rx * (0.25 + 0.6 * ((i * 0.618) % 1));
            const y = L.cy + Math.sin(i * 2.399) * L.ry * (0.2 + 0.55 * ((i * 0.382) % 1));
            ctx.fillStyle = 'rgba(255,255,255,' + (0.65 * a).toFixed(2) + ')';
            ctx.fillRect(x | 0, y | 0, 2, 1); ctx.fillRect((x | 0) + 1, (y | 0) - 1, 1, 3);
        }
    }
    return true;
}

// Paint the regions in the background shortly after start-up (one every ~350ms), so the first
// visit to a region or the first opening of the Regions window never stutters on a slow phone.
(function prewarmBackgrounds() {
    let n = 1;
    function step() {
        if (n > 8) return;
        try { getRegionBackground(n); } catch (e) { /* the real draw will report it */ }
        n++;
        setTimeout(step, 350);
    }
    setTimeout(step, 1200);
})();
