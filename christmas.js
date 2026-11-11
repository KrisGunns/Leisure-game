// ============================================================
// christmas.js - the purchasable "Christmas" theme (Shop > Unlockables > Themes, equip in the Bag).
//   * Regions 1-8 and 10: snow on the ground (cached overlay) + falling snowflakes (per frame).
//   * Region 9 (bedroom): NO snow. Sugar-glider trees become Christmas trees, a toy train set sits where the
//     blue beanbag was, ornaments hang on the walls, string lights blink along the wall, gifts under the trees.
// Backgrounds are cached, so changing theme clears the caches (onThemeChanged).
// ============================================================
function isChristmas() { return typeof activeTheme !== 'undefined' && activeTheme === 'christmas'; }

function onThemeChanged() {
    for (const k in REGION_BG_CACHE) delete REGION_BG_CACHE[k];
    for (const k in CHRISTMAS_OVERLAY_CACHE) delete CHRISTMAS_OVERLAY_CACHE[k];
    if (typeof obstacleCache !== 'undefined') obstacleCache.byRegion = {};
    try { warmRegionBackgrounds(); } catch (e) { /* drawn lazily otherwise */ }
}

const CHRISTMAS_OVERLAY_CACHE = {};

// Is a snow patch centred at (x, y) with half-width rx resting on open ground (not on a tree / the lake water)?
function christmasPatchOk(region, x, y, rx) {
    if (y < 78) return false;                                       // the back fence / wall band: nothing lies there
    if (typeof getRegionObstacles !== 'function') return true;
    const list = getRegionObstacles(region);
    for (let i = 0; i < list.length; i++) {
        const o = list[i];
        if (pointInObstacle(o, x, y, 8) || pointInObstacle(o, x - rx, y, 4) || pointInObstacle(o, x + rx, y, 4)) return false;
    }
    return true;
}
// A snow cap sitting ON TOP of a tree crown, plus a little drift round the trunk foot.
function christmasTreeSnow(c, region, r) {
    if (typeof getBackdropTrees !== 'function') return;
    getBackdropTrees(region).forEach(t => {
        const crown = treeObstacleShapes(t)[0];
        const cx = crown.cx, cy = crown.cy - crown.ry * 0.38, rx = crown.rx * 0.82, ry = crown.ry * 0.5;
        c.save();
        c.beginPath(); c.ellipse(crown.cx, crown.cy, crown.rx, crown.ry, 0, 0, Math.PI * 2); c.clip();     // snow only where the leaves are
        c.fillStyle = 'rgba(120,150,190,0.35)'; c.beginPath(); c.ellipse(cx + 2, cy + 3, rx, ry, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(250,253,255,0.96)'; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.fill();
        for (let i = 0; i < 6; i++) { c.beginPath(); c.ellipse(cx + (r() - 0.5) * rx * 1.4, cy + (r() - 0.2) * ry * 1.2, rx * 0.25, ry * 0.3, 0, 0, Math.PI * 2); c.fill(); }
        c.restore();
        const fx = t.x, fy = t.y + 2, w = Math.max(14, t.s * 0.28);
        c.fillStyle = 'rgba(120,150,190,0.3)'; c.beginPath(); c.ellipse(fx + 2, fy + 3, w, w * 0.32, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(250,253,255,0.95)'; c.beginPath(); c.ellipse(fx, fy, w, w * 0.3, 0, 0, Math.PI * 2); c.fill();
    });
}
// Snow lying on the ground: a cool tint, soft flat patches that only rest on open ground, tree caps. Painted once.
function christmasSnowGround(c, W, H, r, region) {
    c.fillStyle = 'rgba(205,225,255,0.16)'; c.fillRect(0, 0, W, H);
    let placed = 0;
    for (let tries = 0; tries < 400 && placed < 22; tries++) {
        const x = r() * W, y = 78 + r() * (H - 78), rx = 14 + r() * 26, ry = rx * (0.22 + r() * 0.1);
        if (!christmasPatchOk(region, x, y, rx)) continue;
        placed++;
        c.fillStyle = 'rgba(120,150,190,0.25)'; c.beginPath(); c.ellipse(x + 2, y + 2, rx, ry, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(250,253,255,0.92)'; c.beginPath(); c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = 'rgba(255,255,255,0.95)'; c.beginPath(); c.ellipse(x - rx * 0.12, y - ry * 0.2, rx * 0.6, ry * 0.55, 0, 0, Math.PI * 2); c.fill();
    }
    for (let i = 0; i < 160; i++) { const x = (r() * W) | 0, y = (78 + r() * (H - 78)) | 0; if (christmasPatchOk(region, x, y, 1)) { c.fillStyle = 'rgba(255,255,255,0.85)'; c.fillRect(x, y, 2, 1); } }
    // drifts along the bottom edge (the ground), none along the top
    for (let x = -20; x < W + 30; x += 26) {
        const h = 8 + r() * 9;
        c.fillStyle = 'rgba(250,253,255,0.95)'; c.beginPath(); c.ellipse(x, H, 30, h, 0, Math.PI, 0); c.fill();
    }
    christmasTreeSnow(c, region, r);
    const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.45, W / 2, H / 2, Math.max(W, H) * 0.75);
    g.addColorStop(0, 'rgba(255,255,255,0)'); g.addColorStop(1, 'rgba(235,245,255,0.3)');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
}
// Region 5: the lake is frozen. Ice over the water (the dock stays visible), cracks, shine and a snowy rim.
function christmasFreezeLake(c) {
    const L = getLakeShape(), d = getLakeDock();
    c.save();
    c.beginPath(); c.rect(0, 0, canvas.width, canvas.height); c.rect(d.x, d.y, d.w, d.h);
    c.clip('evenodd');
    const g = c.createLinearGradient(L.cx - L.rx, L.cy - L.ry, L.cx + L.rx * 0.6, L.cy + L.ry);
    g.addColorStop(0, '#e9f8ff'); g.addColorStop(0.5, '#bfe4f5'); g.addColorStop(1, '#8cc4e0');
    c.fillStyle = g; c.beginPath(); c.ellipse(L.cx, L.cy, L.rx * 1.02, L.ry * 1.02, 0, 0, Math.PI * 2); c.fill();
    c.clip();
    const r = bgRng(555);
    c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = 1;
    for (let i = 0; i < 9; i++) {
        let x = L.cx + (r() - 0.5) * L.rx * 1.6, y = L.cy + (r() - 0.5) * L.ry * 1.6;
        c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 4; k++) { x += (r() - 0.5) * 34; y += (r() - 0.5) * 18; c.lineTo(x, y); }
        c.stroke();
    }
    c.strokeStyle = 'rgba(90,150,190,0.45)';
    for (let i = 0; i < 6; i++) { const x = L.cx + (r() - 0.5) * L.rx * 1.5, y = L.cy + (r() - 0.5) * L.ry * 1.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 40, y + (r() - 0.5) * 16); c.stroke(); }
    for (let i = 0; i < 5; i++) { c.fillStyle = 'rgba(255,255,255,0.55)'; const x = L.cx + (r() - 0.5) * L.rx * 1.4, y = L.cy + (r() - 0.5) * L.ry * 1.3; c.beginPath(); c.ellipse(x, y, 14 + r() * 14, 3, -0.3, 0, Math.PI * 2); c.fill(); }
    c.restore();
    c.strokeStyle = 'rgba(250,253,255,0.95)'; c.lineWidth = 4; c.beginPath(); c.ellipse(L.cx, L.cy, L.rx * 1.02, L.ry * 1.02, 0, 0, Math.PI * 2); c.stroke();
}
// A transparent canvas holding the snow for one region (used on top of regions 1-8 backgrounds and the garden).
function getChristmasOverlay(region) {
    const W = canvas.width, H = canvas.height, hit = CHRISTMAS_OVERLAY_CACHE[region];
    if (hit && hit.w === W && hit.h === H) return hit.cv;
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    christmasSnowGround(cv.getContext('2d'), W, H, bgRng(region * 131 + 7), region);
    CHRISTMAS_OVERLAY_CACHE[region] = { w: W, h: H, cv: cv };
    return cv;
}

// ---- Region 9 pieces (painted into the cached bedroom background) ----
function christmasStar(c, x, y, R, col) {
    c.fillStyle = col; c.beginPath();
    for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? R * 0.45 : R; c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    c.closePath(); c.fill();
}
// Replaces the leafy canopy of a bedroom tree: stacked green tiers, ornaments, tinsel, a golden star.
function christmasTreeCanopy(c, r, t, trunkTop) {
    const R = t.canopyR, cx = t.x, base = trunkTop + 6, top = trunkTop - R * 1.9;
    const tiers = 4;
    for (let i = 0; i < tiers; i++) {
        const f = i / tiers, y0 = top + (base - top) * f * 0.9, y1 = top + (base - top) * ((i + 1) / tiers) + 4, hw = R * (0.55 + 0.5 * (i + 1) / tiers);
        c.fillStyle = '#1f6a31'; c.beginPath(); c.moveTo(cx, y0 - 4); c.lineTo(cx + hw, y1); c.lineTo(cx - hw, y1); c.closePath(); c.fill();
        c.fillStyle = '#2f9a49'; c.beginPath(); c.moveTo(cx, y0 - 4); c.lineTo(cx - hw, y1); c.lineTo(cx - hw * 0.1, y1); c.closePath(); c.fill();
        c.fillStyle = '#f4f8ff'; c.beginPath(); c.moveTo(cx - hw, y1); c.quadraticCurveTo(cx, y1 - 9, cx + hw, y1); c.quadraticCurveTo(cx, y1 + 3, cx - hw, y1); c.fill();   // snowy edge
        // tinsel garland
        c.strokeStyle = '#f7d54a'; c.lineWidth = 1.5; c.beginPath(); c.moveTo(cx - hw * 0.8, y1 - 5); c.quadraticCurveTo(cx, y1 - 14, cx + hw * 0.8, y1 - 5); c.stroke();
    }
    const cols = ['#e8363c', '#4a90d9', '#f7c53d', '#c85cd9', '#ffffff'];
    for (let i = 0; i < 12; i++) {
        const f = 0.15 + r() * 0.8, y = top + (base - top) * f, hw = R * (0.5 + 0.5 * f) * 0.8, x = cx + (r() * 2 - 1) * hw;
        const col = cols[i % cols.length];
        bgSphere(c, x, y, 3.6, '#ffffff', col, '#00000044');
    }
    christmasStar(c, cx, top - 4, 9, '#ffd84a'); christmasStar(c, cx, top - 4, 5, '#fff3a8');
    // gifts at the foot of the tree
    [['#d63a3a', -R * 0.7, 0], ['#3a7bd6', R * 0.55, 3], ['#e8b73a', -R * 0.2, 8]].forEach(([col, ox, oy], i) => {
        const w = 12 + i * 2, h = 10, gx = cx + ox, gy = t.baseY + 6 + oy - h;
        c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(gx + 2, gy + h, w, 2);
        c.fillStyle = col; c.fillRect(gx, gy, w, h); c.fillStyle = '#fff'; c.fillRect(gx + w / 2 - 1, gy, 2, h); c.fillRect(gx, gy + h / 2 - 1, w, 2);
    });
}
// Toy train: oval track, engine, two carriages and a little tree beside it, where the beanbag used to be.
function christmasTrain(c, W, H) {
    const cx = W * 0.8, cy = H * 0.88 + 4, rx = 38, ry = 20;
    c.fillStyle = 'rgba(0,0,0,0.25)'; c.beginPath(); c.ellipse(cx + 3, cy + 6, rx + 8, ry + 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#f4f8ff'; c.beginPath(); c.ellipse(cx, cy, rx + 8, ry + 6, 0, 0, Math.PI * 2); c.fill();       // snowy board
    c.strokeStyle = '#6a4a2c'; c.lineWidth = 3; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#b8b8c0'; c.lineWidth = 1; c.beginPath(); c.ellipse(cx, cy, rx - 2, ry - 1.5, 0, 0, Math.PI * 2); c.stroke(); c.beginPath(); c.ellipse(cx, cy, rx + 2, ry + 1.5, 0, 0, Math.PI * 2); c.stroke();
    for (let a = 0; a < Math.PI * 2; a += 0.28) { c.fillStyle = '#4e3a22'; c.fillRect(cx + Math.cos(a) * rx - 2, cy + Math.sin(a) * ry - 1, 4, 2); }
    const car = (a, body, roof, eng) => {
        const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
        c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillRect(x - 7, y + 4, 15, 3);
        c.fillStyle = body; c.fillRect(x - 7, y - 6, 14, 10);
        c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x - 7, y - 6, 14, 2);
        c.fillStyle = roof; c.fillRect(x - 8, y - 8, 16, 3);
        if (eng) { c.fillStyle = '#222'; c.fillRect(x + 3, y - 11, 4, 6); c.fillStyle = '#f7c53d'; c.fillRect(x - 5, y - 4, 4, 3); }
        c.fillStyle = '#222'; c.fillRect(x - 6, y + 2, 4, 3); c.fillRect(x + 2, y + 2, 4, 3);
    };
    car(Math.PI * 0.95, '#2f8a4a', '#1d5a30', false); car(Math.PI * 0.72, '#d63a3a', '#8a1f1f', false); car(Math.PI * 0.5, '#2c5fb8', '#c43a3a', true);
    // little tree + gift on the board
    c.fillStyle = '#1f6a31'; c.beginPath(); c.moveTo(cx - 4, cy - 2); c.lineTo(cx + 8, cy + 4); c.lineTo(cx - 16, cy + 4); c.closePath(); c.fill();
    c.fillStyle = '#2f9a49'; c.beginPath(); c.moveTo(cx - 4, cy - 10); c.lineTo(cx + 5, cy + 1); c.lineTo(cx - 13, cy + 1); c.closePath(); c.fill();
    christmasStar(c, cx - 4, cy - 11, 3, '#ffd84a');
}
// Wall: garland, hanging ornaments, wreath, stockings and a string of lights. Returns the bulb list (for blinking).
let christmasBulbs = [];
function christmasBedroomDecor(c, r, W, H, wallH) {
    christmasBulbs = [];
    const cols = ['#ff4040', '#ffd840', '#40d860', '#4aa0ff'];
    // light string draped along the top of the wall
    c.strokeStyle = '#1c3a22'; c.lineWidth = 1.5; c.beginPath();
    const segs = 6, sw = W / segs;
    for (let i = 0; i < segs; i++) { c.moveTo(i * sw, 4); c.quadraticCurveTo(i * sw + sw / 2, 24, (i + 1) * sw, 4); }
    c.stroke();
    for (let i = 0; i < segs; i++) {
        for (let j = 1; j <= 4; j++) {
            const t = j / 5, x = i * sw + sw * t, y = (1 - t) * (1 - t) * 4 + 2 * (1 - t) * t * 24 + t * t * 4;
            const col = cols[(i * 4 + j) % cols.length];
            c.fillStyle = col; c.fillRect(x - 2, y, 4, 6); c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(x - 2, y, 1, 3);
            christmasBulbs.push({ x: x, y: y + 3, col: col, ph: (i * 4 + j) * 0.9 });
        }
    }
    // hanging ornaments on threads from the light string
    for (let i = 0; i < 9; i++) {
        const x = 14 + (W - 28) * (i + 0.5) / 9 + (r() - 0.5) * 8, len = 22 + r() * 22, col = ['#e8363c', '#f7c53d', '#4a90d9', '#c85cd9', '#40c070'][i % 5];
        c.strokeStyle = 'rgba(255,255,255,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x, 12); c.lineTo(x, 12 + len); c.stroke();
        bgSphere(c, x, 12 + len + 5, 6, '#ffffff', col, '#00000055');
        c.fillStyle = '#d8c070'; c.fillRect(x - 2, 12 + len - 2, 4, 3);
    }
    // wreath on the wall
    const wx = W * 0.5, wy = wallH * 0.52;
    c.strokeStyle = '#1f6a31'; c.lineWidth = 8; c.beginPath(); c.arc(wx, wy, 14, 0, Math.PI * 2); c.stroke();
    c.strokeStyle = '#3aa65a'; c.lineWidth = 3; c.beginPath(); c.arc(wx - 1, wy - 1, 14, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 7; i++) { const a = i / 7 * Math.PI * 2; c.fillStyle = '#e8363c'; c.fillRect(wx + Math.cos(a) * 14 - 1, wy + Math.sin(a) * 14 - 1, 3, 3); }
    c.fillStyle = '#d63a3a'; c.fillRect(wx - 7, wy + 12, 14, 4); c.fillRect(wx - 5, wy + 16, 4, 6); c.fillRect(wx + 1, wy + 16, 4, 6);
    // stockings
    [[W * 0.14, '#d63a3a'], [W * 0.86, '#2f8a4a']].forEach(([sx, col]) => {
        const sy = wallH * 0.62;
        c.fillStyle = '#6a4a2c'; c.fillRect(sx - 14, sy - 2, 28, 3);
        c.fillStyle = col; c.fillRect(sx - 6, sy + 1, 10, 16); c.fillRect(sx - 6, sy + 13, 15, 6);
        c.fillStyle = '#fff'; c.fillRect(sx - 7, sy + 1, 12, 4);
    });
}
// Per-frame: blinking light glow in the bedroom (cheap) and falling snow everywhere else.
const CHRISTMAS_FLAKES = [];
function drawChristmasForeground(region) {
    if (!isChristmas()) return;
    const W = canvas.width, H = canvas.height, t = performance.now() / 1000;
    if (region === 9) {
        for (let i = 0; i < christmasBulbs.length; i++) {
            const b = christmasBulbs[i], a = 0.5 + 0.5 * Math.sin(t * 3 + b.ph);
            ctx.globalAlpha = 0.18 + 0.4 * a; ctx.fillStyle = b.col;
            ctx.beginPath(); ctx.arc(b.x, b.y, 7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
        return;
    }
    if (!CHRISTMAS_FLAKES.length) for (let i = 0; i < 70; i++) CHRISTMAS_FLAKES.push({ x: Math.random(), y: Math.random(), s: 0.04 + Math.random() * 0.07, z: 1 + Math.random() * 1.6, ph: Math.random() * 6 });
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    for (let i = 0; i < CHRISTMAS_FLAKES.length; i++) {
        const f = CHRISTMAS_FLAKES[i];
        const x = ((f.x + Math.sin(t * 0.6 + f.ph) * 0.02) % 1 + 1) % 1 * W, y = ((f.y + t * f.s) % 1) * H;
        ctx.fillRect(x, y, f.z, f.z);
    }
}
