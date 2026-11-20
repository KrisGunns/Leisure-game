// ============================================================
// drone.js - the helper drone (unlocked when the first pet reaches Lv50).
// A left-side button starts it for 5 minutes (a stand-in for "watch an ad"; see DRONE_AD_HOOK). While active the drone flies
// from region to region on its own: it fills feeder boxes from the player's food, picks up eggs (Region 3) and
// waters thirsty blooms (Region 10) from the player's water. Every region is simulated even when it is not on screen;
// it is only drawn while the player is looking at the region it is in.
// Depends on: state.js, world.js. Load BEFORE main.js. Hooks: tickDrone(dt) from tickShopBuffs (state.js),
// drawDrone() from main.js, droneSaveData()/droneLoadData() from the save code (state.js).
// ============================================================
const DRONE_DURATION = 300;            // seconds of flight per activation
const DRONE_UNLOCK_LEVEL = 50;
const DRONE_SPEED = 300;               // px / s inside a region
const DRONE_TRANSIT = 1.1;             // seconds to fly between regions
const DRONE_WORK = 0.7;                // seconds spent hovering over a job
const DRONE_ROUTE = [1, 2, 3, 5, 6, 7, 8, 9, 10];

const drone = { unlocked: false, time: 0, region: 1, x: 0, y: 0, mode: 'idle', job: null, timer: 0, rotor: 0, scan: 0 };

// Ads are not set up yet, so the button just starts the drone. Later: call the ad SDK here and run droneActivate() in its reward callback.
function DRONE_AD_HOOK() { droneActivate(); }

function droneActive() { return drone.time > 0; }

function droneActivate() {
    if (!drone.unlocked) return;
    if (droneActive()) { showInfoToast('🚁 The drone is already flying (' + formatBuffTime(drone.time) + ').'); return; }
    drone.time = DRONE_DURATION;
    drone.mode = 'idle'; drone.job = null; drone.timer = 0;
    drone.region = currentRegion; drone.x = -30; drone.y = canvas.height * 0.4;
    updateDroneButton();
    saveGameProgress();
}

function droneCheckUnlock() {
    if (drone.unlocked) return;
    let ok = false;
    try { ok = getCodexPets().some(p => p.level >= DRONE_UNLOCK_LEVEL); } catch (e) { ok = false; }
    if (!ok) return;
    drone.unlocked = true;
    showInfoToast('🚁 A pet reached Lv50 - the Drone is unlocked! Tap the button on the left.');
    updateDroneButton();
    saveGameProgress();
}

// ---- finding work --------------------------------------------------------------------------
function droneThirstyPlot() {
    if (typeof gardenPlots === 'undefined') return -1;
    for (let i = 0; i < gardenPlots.length; i++) {
        const p = gardenPlots[i];
        if (isGardenPlotOwned(i) && p.stage === 3 && !p.watered && inventory.water >= getGardenWaterCost(p)) return i;
    }
    return -1;
}
// The next job in `region`, or null. Position is in canvas pixels.
function droneJobIn(region) {
    if (region === GARDEN_REGION) {
        const i = droneThirstyPlot();
        if (i < 0) return null;
        const r = getGardenLayout().plots[i];
        return { kind: 'water', plot: i, x: r.x + r.s / 2, y: r.y + r.s * 0.3 };
    }
    const eggs = regionalItems[region] && regionalItems[region].eggs;
    if (region === 3 && eggs && eggs.length) return { kind: 'egg', x: eggs[0].x, y: eggs[0].y, egg: eggs[0] };
    if (hasFeeder(region) && inventory.food >= 1 && (feederFood[region] || 0) < getFeederCapacity()) {
        const sp = getFeederSpot(region);
        return { kind: 'feed', x: sp.x, y: sp.y - 40 };
    }
    return null;
}

function droneFinishJob(j) {
    if (j.kind === 'feed') {
        const room = getFeederCapacity() - (feederFood[drone.region] || 0);
        const amount = Math.min(room, Math.floor(inventory.food));
        if (amount > 0) { inventory.food -= amount; feederFood[drone.region] = (feederFood[drone.region] || 0) + amount; }
    } else if (j.kind === 'egg') {
        const eggs = regionalItems[3].eggs, k = eggs.indexOf(j.egg);
        if (k >= 0) { eggs.splice(k, 1); inventory.eggs += 1; addTaskProgress('easter', 1); gainPlayerXP(1); }
    } else if (j.kind === 'water') {
        const p = gardenPlots[j.plot], cost = getGardenWaterCost(p);
        if (p && inventory.water >= cost && p.stage === 3 && !p.watered) {
            inventory.water -= cost; p.watered = true; p.timer = GARDEN_STAGE_SECONDS[3]; p.matured = true; p.grace = null; p.warned = false;
        }
    }
    saveGameProgress();
    updateUI();
}

// ---- per-frame brain (real-time dt from tickShopBuffs) ----------------------------------------
function tickDrone(dt) {
    drone.rotor += dt * 40;
    if (!drone.unlocked) { drone.scan -= dt; if (drone.scan <= 0) { drone.scan = 2; droneCheckUnlock(); } return; }
    if (!droneActive()) return;
    drone.time -= dt;
    if (drone.time <= 0) {
        drone.time = 0; drone.mode = 'idle'; drone.job = null;
        showInfoToast('🚁 The drone has landed. Tap the button to send it out again.');
        updateDroneButton(); saveGameProgress();
        return;
    }
    if (drone.mode === 'transit') {
        drone.timer -= dt;
        if (drone.timer <= 0) { drone.region = drone.job.region; drone.x = -30; drone.y = drone.job.y; drone.mode = 'fly'; }
    } else if (drone.mode === 'fly') {
        const j = drone.job, dx = j.x - drone.x, dy = j.y - drone.y, d = Math.hypot(dx, dy), step = DRONE_SPEED * dt;
        if (d <= step) { drone.x = j.x; drone.y = j.y; drone.mode = 'work'; drone.timer = DRONE_WORK; }
        else { drone.x += dx / d * step; drone.y += dy / d * step; }
    } else if (drone.mode === 'work') {
        drone.timer -= dt;
        if (drone.timer <= 0) { droneFinishJob(drone.job); drone.job = null; drone.mode = 'idle'; drone.timer = 0; }
    } else {                                              // idle: choose the next job - this region first, then round the route
        drone.timer -= dt;
        if (drone.timer > 0) return;
        let job = droneJobIn(drone.region);
        if (job) { job.region = drone.region; drone.job = job; drone.mode = 'fly'; return; }
        const start = Math.max(0, DRONE_ROUTE.indexOf(drone.region));
        for (let k = 1; k < DRONE_ROUTE.length; k++) {
            const r = DRONE_ROUTE[(start + k) % DRONE_ROUTE.length];
            job = droneJobIn(r);
            if (job) { job.region = r; drone.job = job; drone.mode = 'transit'; drone.timer = DRONE_TRANSIT; return; }
        }
        drone.timer = 1.5;                                // nothing to do anywhere: hover and look again shortly
    }
    // keep the button's countdown fresh (about 4x a second is plenty)
    drone.uiTick = (drone.uiTick || 0) + dt;
    if (drone.uiTick > 0.25) { drone.uiTick = 0; updateDroneButton(); }
}

// ---- drawing (pixel sprite, 2x scaled blocks) --------------------------------------------------
function drawDrone() {
    if (!droneActive() || drone.region !== currentRegion || drone.mode === 'transit') return;
    const c = ctx, x = Math.round(drone.x), bob = Math.round(Math.sin(performance.now() / 180) * 2);
    const y = Math.round(drone.y) + bob;
    c.save();
    c.fillStyle = 'rgba(0,0,0,0.22)';                    // ground shadow
    c.beginPath(); c.ellipse(x, y + 34, 15, 5, 0, 0, Math.PI * 2); c.fill();
    const px = (dx, dy, w, h, col) => { c.fillStyle = col; c.fillRect(x + dx * 2, y + dy * 2, w * 2, h * 2); };
    px(-6, -3, 12, 6, '#2f3a46');                        // body
    px(-5, -4, 10, 1, '#4a5a6b'); px(-5, -3, 10, 1, '#8fa3b8'); px(-5, 1, 10, 2, '#1f2832');
    px(-2, -1, 4, 3, '#ffd23f'); px(-1, 0, 2, 1, '#fff6b0');   // camera / lamp
    px(-11, -2, 5, 1, '#2f3a46'); px(6, -2, 5, 1, '#2f3a46');   // arms
    px(-11, -5, 1, 3, '#2f3a46'); px(10, -5, 1, 3, '#2f3a46');  // rotor posts
    const on = Math.floor(drone.rotor) % 2 === 0;       // rotors blur between two poses
    [-11, 10].forEach(cx => {
        px(on ? cx - 4 : cx - 3, -6, on ? 9 : 7, 1, '#d7e4ef');
        px(on ? cx - 2 : cx - 4, -7, on ? 5 : 9, 1, 'rgba(215,228,239,0.55)');
    });
    px(-4, 3, 1, 2, '#1f2832'); px(3, 3, 1, 2, '#1f2832');     // skids
    if (drone.mode === 'work' && drone.job) {            // little progress sparkle under the drone
        const col = drone.job.kind === 'water' ? '#6ec6ff' : (drone.job.kind === 'egg' ? '#fff6d6' : '#ffb74d');
        c.fillStyle = col;
        for (let k = 0; k < 3; k++) c.fillRect(x - 4 + k * 4, y + 22 + ((performance.now() / 90 + k * 3) % 10), 2, 2);
    }
    c.restore();
}

// ---- button -------------------------------------------------------------------------------------
function updateDroneButton() {
    const b = document.getElementById('droneBtn');
    if (!b) return;
    b.style.display = drone.unlocked ? 'flex' : 'none';
    const l = document.getElementById('droneBtnLabel');
    const txt = droneActive() ? formatBuffTime(drone.time) : 'DRONE';
    if (l && l.textContent !== txt) { l.textContent = txt; l.setAttribute('data-text', txt); }
    b.classList.toggle('active', droneActive());
}
function initDroneButton() {
    const b = document.getElementById('droneBtn');
    if (!b) return;
    const cv = document.getElementById('droneBtnIcon');
    if (cv) {                                            // pixel icon, 16x10 drawn at 2x
        const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
        const r = (x, y, w, h, col) => { c.fillStyle = col; c.fillRect(x * 2, y * 2, w * 2, h * 2); };
        r(0, 0, 5, 1, '#dfeaf4'); r(11, 0, 5, 1, '#dfeaf4'); r(2, 1, 1, 3, '#2f3a46'); r(13, 1, 1, 3, '#2f3a46');
        r(2, 3, 12, 1, '#2f3a46'); r(4, 4, 8, 4, '#2f3a46'); r(5, 4, 6, 1, '#8fa3b8'); r(6, 5, 4, 2, '#ffd23f'); r(7, 5, 2, 1, '#fff6b0');
        r(5, 8, 1, 1, '#1f2832'); r(10, 8, 1, 1, '#1f2832');
    }
    b.addEventListener('click', function () { DRONE_AD_HOOK(); });
    updateDroneButton();
}

// ---- save / load (called from state.js) ---------------------------------------------------------
function droneSaveData() { return { unlocked: drone.unlocked, time: Math.max(0, Math.round(drone.time)) }; }
function droneLoadData(d) {
    if (!d || typeof d !== 'object') return;
    drone.unlocked = !!d.unlocked;
    const t = Number(d.time);
    drone.time = (isFinite(t) && t > 0) ? Math.min(DRONE_DURATION, t) : 0;
    drone.mode = 'idle'; drone.job = null; drone.timer = 0; drone.region = currentRegion; drone.x = -30; drone.y = canvas.height * 0.4;
    updateDroneButton();
}
document.addEventListener('DOMContentLoaded', initDroneButton);
