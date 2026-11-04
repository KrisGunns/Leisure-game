// ============================================================
// fishing.js — Region 5 fishing mini-game.
// Stand at the edge of the lake (or on the sides / end of the wooden dock) and a 🎣 FISH button appears.
// It opens a tall ocean-blue bar in the middle of the screen with a hook and a fish. TAP to kick the hook
// upwards (gravity pulls it back down); the fish keeps swimming away. A patch of algae green surrounds the fish:
// keep the hook inside it for FISHING_HOLD_SECONDS to land the fish.
// Depends on: state.js, world.js (getRegionObstacles, getLakeShape), ui.js (showInfoToast), tutorial.js.
// ============================================================

const FISHING_HOLD_SECONDS = 3;        // hook must stay in the green zone this long to catch the fish
const FISHING_LOSE_RATE = 0.5;         // while outside the zone the progress drains at this fraction of the fill rate
const FISHING_TIME_LIMIT = 40;         // seconds before the fish gets away
const FISHING_ZONE_SIZE = 0.26;        // green zone height, as a fraction of the bar
const FISHING_GRAVITY = 1.5;           // bar-heights per second squared pulling the hook down
const FISHING_TAP_KICK = 0.62;         // upward speed (bar-heights/second) one tap gives the hook
const FISHING_FISH_PER_CATCH = 1;      // fish added to the bag per catch (also +1 XP)
const FISHING_REACH = 26;              // how close (px) to open water the player must stand

const fishingGame = { active: false, hookY: 0.8, hookV: 0, fishY: 0.5, fishTarget: 0.5, retarget: 1, progress: 0, timeLeft: 0, lastT: 0, ending: false, raf: 0 };
let fishBtnEl = null, fishOverlayEl = null, fishCanvasEl = null, fishMsgEl = null, fishBarH = 400;

// Is the player standing at the water's edge (lake shore, or beside / at the end of the dock)?
function isNearWater() {
    if (currentRegion !== 5) return false;
    const list = getRegionObstacles(5);
    const water = list.find(o => o.water);
    if (!water) return false;
    const fx = player.x + player.size / 2, fy = player.y + player.size;
    for (let a = 0; a < 16; a++) {
        const ang = a / 16 * Math.PI * 2;
        for (const d of [14, FISHING_REACH]) {
            if (pointInObstacle(water, fx + Math.cos(ang) * d, fy + Math.sin(ang) * d, 0)) return true;
        }
    }
    return false;
}

function ensureFishButton() {
    if (fishBtnEl) return fishBtnEl;
    const wrap = document.getElementById('canvasWrapper');
    if (!wrap) return null;
    fishBtnEl = document.createElement('button');
    fishBtnEl.id = 'fishBtn';
    fishBtnEl.className = 'utilBtn';
    fishBtnEl.textContent = '🎣 FISH';
    fishBtnEl.style.display = 'none';
    wrap.appendChild(fishBtnEl);
    addTap(fishBtnEl, (e) => { if (e && e.preventDefault) e.preventDefault(); startFishing(); });
    return fishBtnEl;
}

// Called every frame from main.js.
function updateFishingButton() {
    const btn = ensureFishButton();
    if (!btn) return;
    const show = currentRegion === 5 && !fishingGame.active && isNearWater();
    const want = show ? 'block' : 'none';
    if (btn.style.display !== want) btn.style.display = want;
}

function buildFishingOverlay() {
    if (fishOverlayEl) return;
    fishOverlayEl = document.createElement('div');
    fishOverlayEl.id = 'fishingOverlay';
    fishOverlayEl.style.cssText = 'position:fixed; inset:0; z-index:9500; display:none; background:rgba(5,25,45,0.72); ' +
        'flex-direction:column; align-items:center; justify-content:center; font-family:monospace; color:#fff; touch-action:none; user-select:none; -webkit-user-select:none;';
    const title = document.createElement('div');
    title.textContent = '🎣 Fishing';
    title.style.cssText = 'font-size:18px; font-weight:bold; margin-bottom:4px;';
    fishMsgEl = document.createElement('div');
    fishMsgEl.style.cssText = 'font-size:12px; color:#bfe3ff; margin-bottom:8px; min-height:16px; text-align:center; padding:0 16px;';
    fishCanvasEl = document.createElement('canvas');
    fishCanvasEl.style.cssText = 'display:block;';
    const cancel = document.createElement('button');
    cancel.id = 'fishingCancel';
    cancel.textContent = 'Give up';
    cancel.style.cssText = 'margin-top:10px; padding:9px 22px; border:none; border-radius:8px; background:#7f8c8d; color:#fff; font-family:monospace; font-size:14px; font-weight:bold;';
    cancel.addEventListener('click', (e) => { e.stopPropagation(); endFishing(false, 'You reeled in the line.'); });
    cancel.addEventListener('pointerdown', (e) => e.stopPropagation());
    fishOverlayEl.appendChild(title);
    fishOverlayEl.appendChild(fishMsgEl);
    fishOverlayEl.appendChild(fishCanvasEl);
    fishOverlayEl.appendChild(cancel);
    // Any tap on the overlay kicks the hook up.
    fishOverlayEl.addEventListener('pointerdown', (e) => { e.preventDefault(); fishingTap(); });
    fishOverlayEl.addEventListener('touchstart', (e) => { if (e.cancelable) e.preventDefault(); }, { passive: false });
    document.body.appendChild(fishOverlayEl);
}

function fishingTap() {
    if (!fishingGame.active || fishingGame.ending) return;
    fishingGame.hookV = -FISHING_TAP_KICK;
}
window.addEventListener('keydown', (e) => {
    if (fishingGame.active && (e.key === ' ' || e.key === 'e')) { e.preventDefault(); if (!e.repeat) fishingTap(); }
});

function startFishing() {
    if (fishingGame.active || !isNearWater()) return;
    // First time: show the how-to and let the player press FISH again once they've read it.
    if (!tutorialSeen.mini_fishing && typeof showTutorial === 'function') { showTutorial('mini_fishing'); return; }
    if (typeof resetJoystick === 'function') resetJoystick();
    if (typeof haltFeedTimers === 'function') haltFeedTimers();
    buildFishingOverlay();
    fishBarH = Math.max(220, Math.min(Math.round(window.innerHeight * 0.6), 460));
    const dpr = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    const cssW = 150;
    fishCanvasEl.style.width = cssW + 'px';
    fishCanvasEl.style.height = fishBarH + 'px';
    fishCanvasEl.width = Math.round(cssW * dpr);
    fishCanvasEl.height = Math.round(fishBarH * dpr);
    fishCanvasEl._dpr = dpr;
    const g = fishingGame;
    g.active = true; g.ending = false;
    g.hookY = 0.85; g.hookV = 0;
    g.fishY = 0.45; g.fishTarget = 0.45; g.retarget = 0.8;
    g.progress = 0; g.timeLeft = FISHING_TIME_LIMIT;
    g.lastT = performance.now();
    fishMsgEl.textContent = 'Tap to lift the hook — keep it in the green for ' + FISHING_HOLD_SECONDS + ' seconds!';
    fishOverlayEl.style.display = 'flex';
    if (fishBtnEl) fishBtnEl.style.display = 'none';
    g.raf = requestAnimationFrame(fishingFrame);
}

function endFishing(caught, message) {
    const g = fishingGame;
    if (!g.active || g.ending) return;
    g.ending = true;
    fishMsgEl.textContent = message;
    if (caught) {
        inventory.fish += FISHING_FISH_PER_CATCH;
        gameStats.fishCaught += FISHING_FISH_PER_CATCH;   // Go Fish achievement
        gainPlayerXP(FISHING_FISH_PER_CATCH);
        updateUI();
        saveGameProgress();
    }
    drawFishing();
    setTimeout(() => {
        g.active = false; g.ending = false;
        cancelAnimationFrame(g.raf);
        if (fishOverlayEl) fishOverlayEl.style.display = 'none';
        if (caught && typeof showInfoToast === 'function') showInfoToast('🐟 You caught a fish! (+' + FISHING_FISH_PER_CATCH + ')');
    }, caught ? 1100 : 700);
}

function fishingFrame(t) {
    const g = fishingGame;
    if (!g.active) return;
    g.raf = requestAnimationFrame(fishingFrame);
    let dt = (t - g.lastT) / 1000;
    g.lastT = t;
    if (!(dt > 0)) return;
    dt = Math.min(dt, 0.05);
    if (g.ending) { drawFishing(); return; }

    // hook: gravity + bounce-less floor/ceiling
    g.hookV += FISHING_GRAVITY * dt;
    g.hookY += g.hookV * dt;
    if (g.hookY < 0.03) { g.hookY = 0.03; g.hookV = Math.max(0, g.hookV); }
    if (g.hookY > 0.97) { g.hookY = 0.97; g.hookV = 0; }

    // fish: swims to a target, picks a new one every so often - half the time the far side from the hook
    g.retarget -= dt;
    if (g.retarget <= 0) {
        g.retarget = 0.7 + Math.random() * 0.9;
        const far = g.hookY < 0.5 ? 0.6 + Math.random() * 0.35 : 0.05 + Math.random() * 0.35;
        g.fishTarget = Math.random() < 0.5 ? far : 0.06 + Math.random() * 0.88;
    }
    const sp = 0.34;
    const d = g.fishTarget - g.fishY;
    g.fishY += Math.sign(d) * Math.min(Math.abs(d), sp * dt);

    // progress: fills while the hook is inside the green zone, drains (slower) while outside
    const half = FISHING_ZONE_SIZE / 2;
    const inside = Math.abs(g.hookY - g.fishY) <= half;
    g.progress += (inside ? 1 : -FISHING_LOSE_RATE) * dt / FISHING_HOLD_SECONDS;
    g.progress = Math.max(0, Math.min(1, g.progress));
    g.timeLeft -= dt;
    g._inside = inside;
    drawFishing();
    if (g.progress >= 1) endFishing(true, '🐟 Caught one!');
    else if (g.timeLeft <= 0) endFishing(false, 'The fish got away…');
}

function drawFishing() {
    const g = fishingGame, cv = fishCanvasEl;
    if (!cv) return;
    const c = cv.getContext('2d'), dpr = cv._dpr || 1;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    c.clearRect(0, 0, 150, fishBarH);
    const bx = 30, bw = 70, by = 0, bh = fishBarH, r = 14;
    const rr = (x, y, w, h, rad) => { c.beginPath(); c.moveTo(x + rad, y); c.arcTo(x + w, y, x + w, y + h, rad); c.arcTo(x + w, y + h, x, y + h, rad); c.arcTo(x, y + h, x, y, rad); c.arcTo(x, y, x + w, y, rad); c.closePath(); };
    // the ocean-blue bar
    c.save();
    rr(bx, by, bw, bh, r); c.clip();
    const grad = c.createLinearGradient(0, 0, 0, bh);
    grad.addColorStop(0, '#2f8fe0'); grad.addColorStop(0.5, '#1767b8'); grad.addColorStop(1, '#0b3f7d');
    c.fillStyle = grad; c.fillRect(bx, by, bw, bh);
    c.strokeStyle = 'rgba(255,255,255,0.12)'; c.lineWidth = 1.5;
    const tm = performance.now() / 700;
    for (let y = 18; y < bh; y += 26) {
        c.beginPath();
        for (let x = 0; x <= bw; x += 6) { const yy = y + Math.sin(x / 9 + tm + y) * 2; if (x === 0) c.moveTo(bx + x, yy); else c.lineTo(bx + x, yy); }
        c.stroke();
    }
    // the algae-green zone around the fish
    const zh = FISHING_ZONE_SIZE * bh, zy = g.fishY * bh - zh / 2;
    c.fillStyle = g._inside ? 'rgba(104,168,60,0.92)' : 'rgba(86,146,52,0.82)';   // algae green
    c.fillRect(bx, Math.max(0, zy), bw, Math.min(zh, bh - Math.max(0, zy), zh + Math.min(0, zy)));
    c.strokeStyle = 'rgba(40,90,30,0.7)'; c.lineWidth = 1;
    for (let k = 0; k < 7; k++) { const sx = bx + 8 + k * 9; c.beginPath(); c.moveTo(sx, zy + zh); c.quadraticCurveTo(sx + 3, zy + zh * 0.5, sx - 2, zy + 2); c.stroke(); }
    c.strokeStyle = '#b6e08a'; c.lineWidth = 2; c.strokeRect(bx + 1, zy, bw - 2, zh);
    c.restore();
    c.strokeStyle = '#d9f0ff'; c.lineWidth = 3; rr(bx, by, bw, bh, r); c.stroke();

    // the fish (an icon, drawn with paths so it never depends on emoji fonts)
    const fx = bx + bw / 2, fy = g.fishY * bh;
    c.fillStyle = '#ffb347';
    c.beginPath(); c.ellipse(fx, fy, 16, 9, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.moveTo(fx - 13, fy); c.lineTo(fx - 25, fy - 9); c.lineTo(fx - 25, fy + 9); c.closePath(); c.fill();
    c.fillStyle = '#ff8a3c'; c.beginPath(); c.moveTo(fx - 2, fy - 8); c.lineTo(fx + 4, fy - 15); c.lineTo(fx + 8, fy - 7); c.closePath(); c.fill();
    c.fillStyle = '#fff'; c.beginPath(); c.arc(fx + 9, fy - 2, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#111'; c.beginPath(); c.arc(fx + 10, fy - 2, 1.5, 0, Math.PI * 2); c.fill();

    // the hook, hanging on a line from the top of the bar
    const hx = bx + bw / 2 + 22, hy = g.hookY * bh;
    c.strokeStyle = 'rgba(255,255,255,0.85)'; c.lineWidth = 1.5;
    c.beginPath(); c.moveTo(hx, 0); c.lineTo(hx, hy - 8); c.stroke();
    c.strokeStyle = '#eef2f5'; c.lineWidth = 3; c.lineCap = 'round';
    c.beginPath(); c.moveTo(hx, hy - 8); c.lineTo(hx, hy + 4); c.arc(hx - 6, hy + 4, 6, 0, Math.PI * 0.95); c.stroke();
    c.beginPath(); c.moveTo(hx - 12, hy + 2); c.lineTo(hx - 9.5, hy - 2); c.stroke();
    c.fillStyle = '#e74c3c'; c.beginPath(); c.arc(hx, hy - 9, 3, 0, Math.PI * 2); c.fill();

    // progress meter to the right + seconds left
    const px = bx + bw + 14, pw = 14;
    c.fillStyle = 'rgba(0,0,0,0.5)'; rr(px, 0, pw, bh, 6); c.fill();
    c.save(); rr(px, 0, pw, bh, 6); c.clip();
    c.fillStyle = g.progress > 0.66 ? '#f1c40f' : '#58b24b';
    c.fillRect(px, bh * (1 - g.progress), pw, bh * g.progress);
    c.restore();
    c.strokeStyle = '#d9f0ff'; c.lineWidth = 2; rr(px, 0, pw, bh, 6); c.stroke();
    c.fillStyle = '#fff'; c.font = 'bold 11px monospace'; c.textAlign = 'center';
    c.fillText(Math.max(0, Math.ceil(g.timeLeft)) + 's', px + pw / 2, bh - 4 > 24 ? 14 : 14);
}
