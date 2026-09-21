// ============================================================
// world.js — Region/world data: the player instance, item spawn
// pools per region, pet roster per region, canvas resizing,
// collision detection, and item respawn scheduling.
// Depends on: state.js, entities.js. Load AFTER those.
// ============================================================

const player = new Player(100, 100);
const respawnQueue = [];

const regionalItems = {
    1: { foods: [], waters: [], flowers: [], bananas: [] },
    2: { foods: [], waters: [], flowers: [], bananas: [] },
    3: { foods: [], waters: [], flowers: [], bananas: [] },
    4: { foods: [], waters: [], flowers: [], bananas: [] },
    5: { foods: [], waters: [], flowers: [], bananas: [] },
    6: { foods: [], waters: [], flowers: [], bananas: [] },
    7: { foods: [], waters: [], flowers: [], bananas: [] },
    8: { foods: [], waters: [], flowers: [], bananas: [] },
    // Region 9 (Bedroom) has no spawnable resources at all — the entry only exists so the
    // per-region lookups (checkCollisions(), the region switcher, the render loop) work
    // for it exactly like every other region.
    9: { foods: [], waters: [], flowers: [], bananas: [] }
};

// Regions whose food/water item pools get topped up by processSpawns() — Region 4 gets
// flowers instead (bees), Region 5 (bear) gets neither (fishes at the lake instead),
// Region 8 (monkeys) gets bananas instead (its own dedicated pool, handled the same
// way flowers are for Region 4 — see processSpawns() below).
const FOOD_WATER_REGIONS = [1, 2, 3, 6, 7];

// All regions the bird's Lv20 excursion perk can randomly fly to — deliberately does NOT
// include Region 7 or Region 8: both are gated behind a much higher unlock condition
// (every other pet at Lv10+/Lv5+ — see isJungleTierUnlocked()) than the bird itself needs
// to start excursions (just its own Lv20), so letting it wander into either before the
// player has actually unlocked them would be a strange inconsistency.
// Region 9 is left out for the same reason (it's a "jungle tier" region, see
// isJungleTierUnlocked()).
const ALL_REGIONS = [1, 2, 3, 4, 5, 6];

// ------------------------------------------------------------------
// SUGAR GLIDERS (Region 9) — shared constants. The AI itself is Pet.updateGlider() in
// entities.js; the list of gliders, Take/Drop, the region buffs and the bedroom layout are
// further down this file.
// ------------------------------------------------------------------
// Where a dropped glider forages food + water (1 stamina per object picked up).
const GLIDER_FORAGE_REGIONS = [1, 2, 3, 6, 7];
// Where a dropped glider gives its buff instead, at the cost of 1 stamina every
// GLIDER_DRAIN_SECONDS seconds spent there.
const GLIDER_DRAIN_REGIONS = [4, 5, 8];
const GLIDER_DRAIN_SECONDS = 2;
// Resting inside a Region 9 tree opening: +1 stamina every GLIDER_REST_SECONDS seconds.
const GLIDER_REST_SECONDS = 2;
// How close (centre to centre, px) the player must be to Take a glider — the same reach as
// feeding a pet with GIVE.
const GLIDER_TAKE_RANGE = 80;
// Buff each active glider (dropped in that region, stamina > 0) adds, per region:
// +50% honey from bees (4), +25% bear fishing speed (5), +50% monkey forage yield (8).
// Several gliders in one region add up (1 + 0.5 x gliders).
const GLIDER_BUFF_PER_GLIDER = { 4: 0.50, 5: 0.25, 8: 0.50 };

// Glider stamina timers run on the real wall clock, NOT the game loop's `dt` — gameLoop()'s
// dt over-counts elapsed time on some devices (documented in the changelog under the shop
// buffs), which would make "every 2 seconds" come out shorter than 2 real seconds. Ticked
// once per frame from gameLoop() (main.js); a gap over 0.25s (app backgrounded/frozen) is
// clamped so stamina doesn't jump. Same approach as tickShopBuffs() in state.js.
let gliderRealDt = 0;
let gliderLastRealTick = null;
function tickGliderClock() {
    const now = performance.now();
    const d = (gliderLastRealTick === null) ? 0 : (now - gliderLastRealTick) / 1000;
    gliderLastRealTick = now;
    gliderRealDt = Math.min(Math.max(d, 0), 0.25);
}

// Bird excursion fly-away/landing visual effects — simple one-shot expanding+fading poof
// bursts. Not attached to any pet object, since the bird literally isn't present in a
// region at the instant these fire (it's either just vanished or just appeared) — kept
// as their own small list here instead. See entities.js's `excursionActive` handling.
let regionFX = [];
function spawnRegionFX(region, x, y, type) {
    regionFX.push({ region: region, x: x, y: y, type: type, age: 0, life: 0.6 });
}
function updateRegionFX(dt) {
    for (let i = regionFX.length - 1; i >= 0; i--) {
        regionFX[i].age += dt;
        if (regionFX[i].age >= regionFX[i].life) regionFX.splice(i, 1);
    }
}
function drawRegionFX() {
    regionFX.forEach(fx => {
        if (fx.region !== currentRegion) return;
        let t = fx.age / fx.life; // 0 -> 1
        let radius = 6 + t * 26;
        let alpha = 1 - t;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = fx.type === 'depart' ? '#2c3e50' : '#f1c40f';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        // A few little feather/sparkle flecks radiating outward from the burst
        ctx.fillStyle = fx.type === 'depart' ? '#34495e' : '#f39c12';
        for (let i = 0; i < 5; i++) {
            let ang = (i / 5) * Math.PI * 2 + t * 2;
            let fxx = fx.x + Math.cos(ang) * radius;
            let fxy = fx.y + Math.sin(ang) * radius;
            ctx.fillRect(fxx - 2, fxy - 2, 4, 4);
        }
        ctx.restore();
    });
}

// "Bamboo Fever" minigame (Panda Lv20 perk, Region 7). See ui.js's
// showBambooFeverPicker() for the Play/Starve choice, and entities.js for the panda's
// own 'full' (Play) / 'abandoned' (Starve) states that run alongside this. This piece
// only tracks the actual collectible bamboo stalks on the map and the running count
// during an active 30s round — deliberately NOT persisted across a reload, same
// simplification approach as the bird's excursion state.
let bambooFever = { active: false, timer: 0, collected: 0, panda: null };
let bambooItems = [];

function spawnBambooBatch() {
    bambooItems = [];
    for (let i = 0; i < 10; i++) {
        bambooItems.push({
            x: 40 + Math.random() * (canvas.width - 80),
            y: 40 + Math.random() * (canvas.height - 80)
        });
    }
}

function startBambooFever(panda) {
    bambooFever.active = true;
    bambooFever.timer = 30.0;
    bambooFever.collected = 0;
    bambooFever.panda = panda || null;
    spawnBambooBatch();
}

function updateBambooFever(dt) {
    if (!bambooFever.active) return;
    bambooFever.timer -= dt;

    // Collection only actually happens while standing in Region 7 — elsewhere the
    // bamboo simply isn't drawn/reachable, but the countdown itself keeps running
    // regardless (a hard 30s window, per spec), so wandering out just wastes time.
    if (currentRegion === 7) {
        for (let i = bambooItems.length - 1; i >= 0; i--) {
            let b = bambooItems[i];
            let dx = (player.x + player.size / 2) - b.x;
            let dy = (player.y + player.size / 2) - b.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist < player.size / 2 + 10) {
                bambooItems.splice(i, 1);
                bambooFever.collected++;
                updateUI();
                // Keep a steady supply on the map so there's always something to chase
                // for the whole 30s instead of it petering out early.
                bambooItems.push({
                    x: 40 + Math.random() * (canvas.width - 80),
                    y: 40 + Math.random() * (canvas.height - 80)
                });
            }
        }
    }

    if (bambooFever.timer <= 0) {
        bambooFever.active = false;
        bambooItems = [];
        let coinsEarned = Math.floor(bambooFever.collected / 5);
        inventory.coins += coinsEarned;
        if (typeof showBambooResultToast === 'function') showBambooResultToast(bambooFever.collected, coinsEarned);
        // The panda only actually goes to sleep (the 'full' state, 💤) now that the
        // round is over — this used to fire the instant Play was chosen, so the sleep
        // overlay showed *during* the minigame instead of as its aftermath.
        if (bambooFever.panda) {
            if (coinsEarned > 0) {
                spawnCoinPopup(bambooFever.panda.homeRegion || 7, bambooFever.panda.x + bambooFever.panda.size / 2, bambooFever.panda.y, coinsEarned);
            }
            bambooFever.panda.state = 'full';
            bambooFever.panda.stateTimer = 20.0;
            bambooFever.panda = null;
        }
        updateUI();
        saveGameProgress();
    }
}

function drawBambooItems() {
    if (!bambooFever.active || currentRegion !== 7) return;

    bambooItems.forEach(b => {
        ctx.fillStyle = '#8bc34a';
        ctx.fillRect(b.x - 3, b.y - 16, 6, 32);
        ctx.fillStyle = '#558b2f';
        ctx.fillRect(b.x - 3, b.y - 16, 6, 3);
        ctx.fillRect(b.x - 3, b.y - 3, 6, 3);
        ctx.fillRect(b.x - 3, b.y + 10, 6, 3);
        ctx.fillStyle = '#a5d6a7';
        ctx.beginPath();
        ctx.moveTo(b.x, b.y - 16);
        ctx.lineTo(b.x + 10, b.y - 22);
        ctx.lineTo(b.x + 2, b.y - 12);
        ctx.closePath();
        ctx.fill();
    });

    // Small HUD so the player can see the countdown and running total while it's live.
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(canvas.width / 2 - 90, 26, 180, 26);
    ctx.fillStyle = '#8bc34a';
    ctx.font = 'bold 13px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`🎍 ${bambooFever.collected}   ⏱️ ${Math.ceil(bambooFever.timer)}s`, canvas.width / 2, 44);
    ctx.textAlign = 'left';
    ctx.restore();
}

let foods = regionalItems[currentRegion].foods;
let waters = regionalItems[currentRegion].waters;
let flowers = regionalItems[currentRegion].flowers;
let bananas = regionalItems[currentRegion].bananas;

// `honey` is the hive's own stored honey pool — bees deposit into it (entities.js)
// instead of crediting the player's inventory directly, and the player collects it
// manually via GIVE while standing near the hive (input.js). No cap.
const region4Hive = { x: 225, y: 75, honey: 0 };

// Single source of truth for creating a bee. Used for the starter bee below AND for
// bees bought from the hive (ui.js) AND for reconstructing purchased bees on load
// (state.js) — previously the purchase handler duplicated this setup by hand and
// missed `honeyCarried`, which is why bought bees never capped out or returned honey.
function createBee(label, x, y) {
    let p = new Pet('bee', label, '#f1c40f');
    p.speed = 100;
    p.level = 1;
    p.state = 'wander';
    p.x = (typeof x === 'number') ? x : region4Hive.x - p.size / 2;
    p.y = (typeof y === 'number') ? y : region4Hive.y - p.size / 2;
    p.pickNewWanderTarget();
    return p;
}

// Same idea for bears. Not purchasable today, but factored out for consistency and
// so a future "buy a bear" feature (or save/load reconstruction) has one correct
// place to create one from. `options.female` builds the female variant (region 5's
// second bear): same brown color, same base Exp/fishing mechanic/fishing yield
// (all driven purely by type === 'bear' elsewhere, untouched here) — just a
// slightly smaller model with a pink bow, handled entirely in the draw layer via
// isFemaleBear (entities.js).
function createBear(label, x, y, options = {}) {
    let p = new Pet('bear', label, '#5a2a00');
    p.speed = 70;
    p.level = 1;
    p.state = 'wander';
    p.x = (typeof x === 'number') ? x : 200;
    p.y = (typeof y === 'number') ? y : 250;
    if (options.female) {
        p.isFemaleBear = true;
        p.size = 30; // slightly smaller than the default 36
    }
    p.setNextFishingCooldown();
    p.pickNewWanderTarget();
    return p;
}

// Same idea for pigs. Both pigs (pink + grey) are built through this so they behave
// identically — the only difference between them is color/label/starting position.
function createPig(label, color, x, y) {
    let p = new Pet('pig', label, color);
    p.speed = 75;
    p.level = 1;
    p.state = 'wander';
    p.x = (typeof x === 'number') ? x : 200;
    p.y = (typeof y === 'number') ? y : 250;
    p.pickNewWanderTarget();
    return p;
}

// Same idea for the bird. Kept as a factory (even though there's only ever one) for
// consistency with the rest of this file, and so save/load has one correct place to
// re-derive a fresh bird instance from if that's ever needed.
function createBird(label, x, y) {
    let p = new Pet('bird', label, '#1c1c1c');
    p.speed = 95;
    p.level = 1;
    p.state = 'wander';
    p.x = (typeof x === 'number') ? x : 200;
    p.y = (typeof y === 'number') ? y : 200;
    p.homeRegion = 3;
    p.pickNewWanderTarget();
    return p;
}

// Same idea for the panda (Region 7).
function createPanda(label, x, y) {
    let p = new Pet('panda', label, '#ffffff');
    p.speed = 80;
    p.level = 1;
    p.state = 'wander';
    p.x = (typeof x === 'number') ? x : 200;
    p.y = (typeof y === 'number') ? y : 200;
    p.pickNewWanderTarget();
    return p;
}

// Same idea for monkeys (Region 8). Not purchasable, same as bear/panda — factored
// out purely for consistency with the rest of the factories. `options.bowColor` draws
// a small bow on its head (same idea as the female bear's pink bow) — purely cosmetic,
// doesn't affect stats/mechanics.
function createMonkey(label, x, y, options = {}) {
    let p = new Pet('monkey', label, '#8b5a2b');
    p.speed = 85;
    p.level = 1;
    p.state = 'wander';
    p.x = (typeof x === 'number') ? x : 200;
    p.y = (typeof y === 'number') ? y : 250;
    if (options.bowColor) {
        p.bowColor = options.bowColor;
    }
    p.pickNewWanderTarget();
    return p;
}

// Same idea for elephants (Region 2). `options.bowColor` draws a bow on the head (the
// Bow Elephant's white bow) — purely cosmetic, exactly like createMonkey's: everything
// else (taming requirements, forage yields, the tag mini-game) is driven by
// type === 'elephant' elsewhere, so both elephants share it and can never drift apart.
// With no x/y it keeps the Pet constructor's default position, so the original elephant
// starts exactly where it always did.
function createElephant(label, x, y, options = {}) {
    let p = new Pet('elephant', label, '#95a5a6');
    if (typeof x === 'number') p.x = x;
    if (typeof y === 'number') p.y = y;
    // Untamed pets sit still; like the constructor does, park the wander target on the
    // pet itself so nothing is set in motion until it's tamed.
    p.targetX = p.x;
    p.targetY = p.y;
    if (options.bowColor) {
        p.bowColor = options.bowColor;
    }
    return p;
}

// Same idea for the sugar gliders (Region 9). Gliders are tamed from level 1 (no taming step —
// unlike every other pet they respond, and can be taken, straight away), start with full
// stamina, and start out in Region 9. `options.bowColor` draws Miss Glider's small red bow —
// purely cosmetic, everything else is shared, driven by type === 'glider'.
function createGlider(label, x, y, options = {}) {
    let p = new Pet('glider', label, '#9aa1a8');
    p.speed = 90;
    p.level = 1;
    p.stamina = getGliderMaxStamina(1);
    p.regionNow = 9;
    p.x = (typeof x === 'number') ? x : 200;
    p.y = (typeof y === 'number') ? y : 380;
    p.state = 'idle';
    p.stateTimer = 0.5 + Math.random();
    if (options.bowColor) {
        p.bowColor = options.bowColor;
    }
    p.pickNewWanderTarget();
    return p;
}

const petsByRegion = {
    // Positioned well apart — untamed pets (level < 2) don't move at all (see the
    // `if (this.level < 2) return;` gate early in Pet.update()), so starting them
    // far apart is sufficient to guarantee their sprites never overlap pre-taming.
    1: [
        (() => {
            let p = new Pet('dog', 'Retriever', '#f1c40f');
            p.x = 110;
            p.y = 220;
            return p;
        })(),
        (() => {
            let p = new Pet('cat', 'Cat', '#e08a3e');
            p.x = 260;
            p.y = 220;
            return p;
        })()
    ],
    // Region 2's second elephant (white bow) is appended AFTER the original so the
    // original stays at index 0 (the codex, renaming and older saves are all positional).
    // It starts well away from the first (>160px) so feeding one never feeds both.
    2: [
        createElephant('Elephant'),
        createElephant('Bow Elephant', 90, 320, { bowColor: '#ffffff' })
    ],
    3: [
        (() => {
            let p = new Pet('squirrel', 'Squirrel', '#d35400');
            p.x = 130;
            p.y = 200;
            return p;
        })(),
        (() => {
            let p = new Pet('chicken', 'Chicken', '#ffffff');
            p.x = 280;
            p.y = 200;
            return p;
        })(),
        createBird('Sparrow', 140, 280)
    ],
    4: [ createBee('Bee', 200, 150) ],
    5: [ createBear('Bear', 200, 250), createBear('Bow Bear', 320, 250, { female: true }) ],
    6: [
        createPig('Pig', '#ffb6c1', 130, 460),
        createPig('Mud Pig', '#95a5a6', 280, 460)
    ],
    7: [ createPanda('Panda', 200, 220) ],
    8: [ createMonkey('Monkey', 150, 200), createMonkey('Coco', 280, 200, { bowColor: '#2ecc71' }) ],
    // Region 9's pets are the two sugar gliders, but they are deliberately NOT stored here —
    // see `gliderPets` below. The (empty) array just keeps the region-indexed lookups uniform.
    9: []
};

// The two sugar gliders, in their own list rather than in petsByRegion. They get carried
// between regions by the player, so a fixed [region][slot] position doesn't work for them,
// and keeping them out of petsByRegion means they can never skew the code that reads it
// (the region-unlock checks — a level-1 glider dropped in Region 1 must not re-lock
// Regions 4-8 — the bee cap, the positional save format, the whistle, ...). Which region a
// glider is in is `glider.regionNow`; main.js updates/draws them by that. Index 0 = Sugar
// Glider, 1 = Miss Glider (saves, codex and renaming all go by index).
const gliderPets = [
    createGlider('Sugar Glider', 120, 400),
    createGlider('Miss Glider', 250, 400, { bowColor: '#e0242f' })
];
gliderPets.forEach(g => { g.homeRegion = 9; });

// Permanent reference to the one bird instance, independent of which region's array it
// currently lives in (it physically moves between petsByRegion[r] arrays during its Lv20
// excursion perk — see entities.js — so `petsByRegion[3][2]` alone isn't reliable while
// it's away). Used by save/load in state.js to persist/restore it correctly regardless
// of where it happens to be at save time.
const birdPet = petsByRegion[3][2];

// Tag every pet with the region it was created in. Used for gating things that must
// only happen/show while the player is actually looking at that pet's region — e.g.
// coin popups below — for the pets that don't already track this themselves (the
// bird already has `homeRegion`, left untouched since it's the same value anyway).
for (let r = 1; r <= 9; r++) {
    if (Array.isArray(petsByRegion[r])) {
        petsByRegion[r].forEach(pet => { if (!pet.homeRegion) pet.homeRegion = r; });
    }
}

// Floating "+N 🪙" popups shown above a pet right after it rewards the player with
// coins (dog digging, elephant tag, pig mud play, bird's excursion return, cat's
// correct Schrödinger guess, panda's Bamboo Fever payout). Same one-shot,
// region-filtered pattern as spawnRegionFX above — a pet's coin event can fire while
// the player is looking at an entirely different region (pets simulate in the
// background), so popups are tagged with the region they belong to and only drawn
// while the player is actually there to see them.
let coinPopups = [];
function spawnCoinPopup(region, x, y, amount) {
    coinPopups.push({ region: region, x: x, y: y, amount: amount, age: 0, life: 1.1 });
}
function updateCoinPopups(dt) {
    for (let i = coinPopups.length - 1; i >= 0; i--) {
        coinPopups[i].age += dt;
        if (coinPopups[i].age >= coinPopups[i].life) coinPopups.splice(i, 1);
    }
}
function drawCoinPopups() {
    coinPopups.forEach(p => {
        if (p.region !== currentRegion) return;
        let t = p.age / p.life; // 0 -> 1
        let riseY = p.y - t * 28;
        let alpha = t < 0.75 ? 1 : 1 - (t - 0.75) / 0.25;
        ctx.save();
        ctx.globalAlpha = Math.max(0, alpha);
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        let text = `+${p.amount} 🪙`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.65)';
        ctx.strokeText(text, p.x, riseY);
        ctx.fillStyle = '#f1c40f';
        ctx.fillText(text, p.x, riseY);
        ctx.restore();
    });
}

// Whether Regions 4-6 are unlocked: every pet across Regions 1-3 must be Level 2+
// (tamed). Single source of truth — used by main.js (render/update gating), input.js
// (region-select gate), ui.js (Codex lock display), and entities.js (the bird's
// excursion target picker, so it can't send the bird to a region the player hasn't
// actually unlocked yet).
function areRegions1to3Tamed() {
    for (let r = 1; r <= 3; r++) {
        if (!Array.isArray(petsByRegion[r]) || petsByRegion[r].length === 0) return false;
        for (let i = 0; i < petsByRegion[r].length; i++) {
            if (petsByRegion[r][i].level < 2) return false;
        }
    }
    return true;
}

// Region 7 (panda), Region 8 (monkeys) AND Region 9 (bedroom / sugar gliders) unlock
// condition — the three "jungle tier" regions share the exact same requirement by design. Single source of truth used by
// main.js (render gating), input.js (region-select gate), and ui.js (Codex lock
// display) so the rule can't drift out of sync between them: pets in Regions 1-3
// must be Level 10+, and pets in Regions 4-6 must be Level 5+.
function isJungleTierUnlocked() {
    for (let r = 1; r <= 3; r++) {
        if (!Array.isArray(petsByRegion[r]) || petsByRegion[r].length === 0) return false;
        for (let i = 0; i < petsByRegion[r].length; i++) {
            if (petsByRegion[r][i].level < 10) return false;
        }
    }
    for (let r = 4; r <= 6; r++) {
        if (!Array.isArray(petsByRegion[r]) || petsByRegion[r].length === 0) return false;
        for (let i = 0; i < petsByRegion[r].length; i++) {
            if (petsByRegion[r][i].level < 5) return false;
        }
    }
    return true;
}

// Whether a given region is currently accessible to the player at all. Wraps the two
// checks above into one lookup so callers (the render loop, the bird's excursion
// target picker, etc.) don't have to know the per-region-range rules themselves.
function isRegionUnlocked(r) {
    if (r >= 1 && r <= 3) return true;
    // Regions 7, 8 and 9 all share the jungle-tier condition (Region 9's requirements mirror 7 and 8).
    if (r === 7 || r === 8 || r === 9) return isJungleTierUnlocked();
    if (r >= 4 && r <= 6) return areRegions1to3Tamed();
    return false;
}

// ------------------------------------------------------------------
// SUGAR GLIDERS — buffs, Take / Drop, and the held glider
// ------------------------------------------------------------------

// How many gliders are currently doing their job in `region`: dropped there (not being
// carried) AND with stamina left. Glider abilities only work while stamina is above 0.
function countActiveGliders(region) {
    let n = 0;
    gliderPets.forEach(g => {
        if (!g.held && g.regionNow === region && g.stamina > 0) n++;
    });
    return n;
}

// Multiplier the gliders in `region` give to whatever that region's pets do (1 = no gliders).
// Bees (Region 4): honey yield; bears (5): fishing speed; monkeys (8): forage yield — each
// applied where those pets do the thing (entities.js). Every active glider adds its own
// bonus, so two gliders in Region 4 make +100% honey. (To make them NOT stack, cap the count
// at 1 here.)
function getGliderBuff(region) {
    const per = GLIDER_BUFF_PER_GLIDER[region];
    if (!per) return 1;
    return 1 + per * countActiveGliders(region);
}

function getHeldGlider() {
    for (let i = 0; i < gliderPets.length; i++) {
        if (gliderPets[i].held) return gliderPets[i];
    }
    return null;
}

// The glider the Take button would pick up right now: the nearest one in the region the
// player is standing in, within reach. A glider tucked inside a tree opening (state
// 'resting') can't be taken — it comes out by itself once its stamina is full. Returns null
// while the player is already carrying one (the button says Drop then).
function findTakeableGlider() {
    if (getHeldGlider()) return null;
    let best = null;
    let bestDist = GLIDER_TAKE_RANGE;
    gliderPets.forEach(g => {
        if (g.held || g.regionNow !== currentRegion || g.state === 'resting') return;
        let dx = (g.x + g.size / 2) - (player.x + player.size / 2);
        let dy = (g.y + g.size / 2) - (player.y + player.size / 2);
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) { bestDist = dist; best = g; }
    });
    return best;
}

// What the main action button does right now: 'take' (a glider is in reach), 'drop' (the
// player is carrying one) or 'normal' (the usual GIVE / PLAY). updateUI() (ui.js) reads
// this every frame to label the button; the button handler (input.js) acts on it.
function getGliderButtonMode() {
    if (getHeldGlider()) return 'drop';
    if (findTakeableGlider()) return 'take';
    return 'normal';
}

// Pick a glider up. While carried it isn't updated at all — no foraging, no buffs, no stamina
// drain and no resting — it just rides along with the player (drawHeldGlider below).
function takeGlider(g) {
    if (!g || getHeldGlider()) return;
    g.held = true;
    g.state = 'held';
    g.restTree = -1;          // releases any tree it was heading for
    g.restTimer = 0;
    g.staminaDrainTimer = 0;
    saveGameProgress();
    updateUI();
}

// Put the carried glider down in the region the player is standing in, right next to them.
// From that moment it does whatever that region calls for (forage / buff / rest).
function dropGlider() {
    const g = getHeldGlider();
    if (!g) return;
    const pad = 24;
    g.held = false;
    g.regionNow = currentRegion;
    g.x = Math.max(pad, Math.min(canvas.width - g.size - pad, player.x + 22));
    g.y = Math.max(pad, Math.min(canvas.height - g.size - pad - 14, player.y - 10));
    g.state = 'idle';
    g.stateTimer = 0.4;
    g.staminaDrainTimer = 0;
    g.restTimer = 0;
    g.restTree = -1;
    g.pickNewWanderTarget();
    saveGameProgress();
    updateUI();
}

// Draws the carried glider riding on the player's shoulder (called after player.draw()).
// Its x/y are kept in sync so feeding it (distance check) works while it's carried.
function drawHeldGlider() {
    const g = getHeldGlider();
    if (!g) return;
    g.x = player.x + 22;
    g.y = player.y - 10;
    g.draw();
}

// ------------------------------------------------------------------
// REGION 9 — THE BEDROOM: layout, tree openings, background art
// ------------------------------------------------------------------
// Everything is derived from the canvas size (it changes with the device), and the SAME
// numbers drive both the artwork and the gliders' behaviour, so a glider always climbs into
// the opening that's actually drawn. Furniture is scenery only — nothing collides with it.
function getBedroomLayout() {
    const W = canvas.width, H = canvas.height;
    const wallH = Math.max(72, Math.round(H * 0.12));

    const bed = {
        x: 34, y: wallH + 4,
        w: Math.round(Math.min(150, W * 0.40)),
        h: Math.round(Math.min(178, H * 0.27))
    };
    const deskW = Math.round(Math.min(126, W * 0.34));
    const desk = {
        x: W - 34 - deskW, y: wallH + 4,
        w: deskW,
        h: Math.round(Math.min(56, H * 0.085))
    };

    // The two small artificial trees, in the open floor below the bed and desk. Scaled with
    // the screen height so they still fit on short screens.
    const k = Math.max(0.8, Math.min(1.05, H / 760));
    const baseY = Math.round(Math.max(bed.y + bed.h + 118 * k, H * 0.60));
    const potH = 16 * k, trunkH = 44 * k, trunkW = 28 * k, canopyR = 30 * k;
    const trees = [ { cx: W * 0.24, baseY: baseY }, { cx: W * 0.76, baseY: baseY + 28 * k } ].map(t => {
        const hollowY = t.baseY - potH - trunkH * 0.45;
        return {
            x: t.cx, baseY: t.baseY, k: k,
            potH: potH, trunkH: trunkH, trunkW: trunkW, canopyR: canopyR,
            // The opening in the trunk that a glider climbs into to rest.
            hollowX: t.cx, hollowY: hollowY,
            hollowRX: 10.5 * k, hollowRY: 14 * k
        };
    });

    return { W: W, H: H, wallH: wallH, bed: bed, desk: desk, trees: trees };
}

function getBedroomTrees() {
    return getBedroomLayout().trees;
}

// Index of the tree opening `glider` should head for: the nearest one that no OTHER glider is
// already resting in or walking to (each opening holds one glider). -1 if both are taken.
function findFreeBedroomTree(glider) {
    const trees = getBedroomTrees();
    let best = -1;
    let bestDist = Infinity;
    for (let i = 0; i < trees.length; i++) {
        const taken = gliderPets.some(o => o !== glider && !o.held && o.regionNow === 9 &&
            (o.state === 'to_rest' || o.state === 'resting') && o.restTree === i);
        if (taken) continue;
        let dx = trees[i].hollowX - (glider.x + glider.size / 2);
        let dy = trees[i].hollowY - (glider.y + glider.size / 2);
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < bestDist) { bestDist = dist; best = i; }
    }
    return best;
}

// Rounded-rectangle path built from arcs (not ctx.roundRect, which older Android WebViews —
// this game ships in one — don't have).
function bedroomRoundRect(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    c.beginPath();
    c.moveTo(x + r, y);
    c.lineTo(x + w - r, y);
    c.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    c.lineTo(x + w, y + h - r);
    c.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    c.lineTo(x + r, y + h);
    c.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    c.lineTo(x, y + r);
    c.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5);
    c.closePath();
}

function drawBedroomBackground() {
    const L = getBedroomLayout();
    const W = L.W, H = L.H, wallH = L.wallH;
    const c = ctx;

    // --- Wooden floor: alternating plank rows with staggered end joints ---
    c.fillStyle = '#c8945a';
    c.fillRect(0, 0, W, H);
    for (let y = wallH, row = 0; y < H; y += 30, row++) {
        c.fillStyle = (row % 2) ? '#c28d53' : '#cf9b61';
        c.fillRect(0, y, W, 30);
        c.fillStyle = 'rgba(90, 55, 25, 0.35)';
        c.fillRect(0, y, W, 1.5);
        for (let x = (row % 2) ? 55 : 0; x < W; x += 110) c.fillRect(x, y, 1.5, 30);
    }

    // --- Back wall: striped wallpaper, baseboard, window with curtains, a picture ---
    c.fillStyle = '#ddd3ec';
    c.fillRect(0, 0, W, wallH);
    c.fillStyle = '#d0c4e2';
    for (let x = 0; x < W; x += 28) c.fillRect(x, 0, 12, wallH);
    c.fillStyle = '#f4efe6';
    c.fillRect(0, wallH - 8, W, 8);
    c.fillStyle = 'rgba(0, 0, 0, 0.16)';
    c.fillRect(0, wallH, W, 4);

    const winW = 58, winH = Math.max(34, wallH - 44), winX = W / 2 - winW / 2, winY = 28;
    c.fillStyle = '#f4efe6';
    c.fillRect(winX - 4, winY - 4, winW + 8, winH + 8);
    c.fillStyle = '#a9d8f5';
    c.fillRect(winX, winY, winW, winH);
    c.fillStyle = 'rgba(255, 255, 255, 0.55)';
    c.fillRect(winX + 5, winY + 4, 12, winH * 0.55);
    c.fillStyle = '#f4efe6';
    c.fillRect(winX + winW / 2 - 1.5, winY, 3, winH);
    c.fillRect(winX, winY + winH / 2 - 1.5, winW, 3);
    c.fillStyle = '#e59db8';                       // curtains
    c.fillRect(winX - 14, winY - 6, 12, winH + 14);
    c.fillRect(winX + winW + 2, winY - 6, 12, winH + 14);
    c.fillStyle = 'rgba(255, 255, 255, 0.25)';
    c.fillRect(winX - 11, winY - 6, 2, winH + 14);
    c.fillRect(winX + winW + 5, winY - 6, 2, winH + 14);

    const picW = 34, picH = 26;
    const picX = Math.max(46, W * 0.17), picY = 32;
    c.fillStyle = '#7a4a24';
    c.fillRect(picX, picY, picW, picH);
    c.fillStyle = '#bfe3c7';
    c.fillRect(picX + 3, picY + 3, picW - 6, picH - 6);
    c.fillStyle = '#5fa36f';
    c.beginPath();
    c.moveTo(picX + 3, picY + picH - 3);
    c.lineTo(picX + 13, picY + 10);
    c.lineTo(picX + 22, picY + picH - 3);
    c.closePath();
    c.fill();

    // --- Rug in the middle of the room ---
    c.fillStyle = '#e8b4c4';
    c.beginPath();
    c.ellipse(W / 2, H * 0.47, W * 0.30, H * 0.085, 0, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = '#f7dbe4';
    c.lineWidth = 4;
    c.beginPath();
    c.ellipse(W / 2, H * 0.47, W * 0.30 - 9, H * 0.085 - 7, 0, 0, Math.PI * 2);
    c.stroke();

    // --- Bed (top-down): headboard against the wall, pillows, blanket, footboard ---
    const b = L.bed;
    c.fillStyle = 'rgba(0, 0, 0, 0.18)';
    c.fillRect(b.x + 5, b.y + 5, b.w, b.h);
    c.fillStyle = '#7a4a24';
    c.fillRect(b.x, b.y, b.w, b.h);
    c.fillStyle = '#f6f2ea';
    bedroomRoundRect(c, b.x + 6, b.y + 12, b.w - 12, b.h - 18, 6);
    c.fill();
    const pw = (b.w - 12 - 18) / 2, ph = Math.min(28, b.h * 0.17);
    [b.x + 10, b.x + 10 + pw + 8].forEach(px => {
        c.fillStyle = '#dfeaf7';
        bedroomRoundRect(c, px, b.y + 16, pw, ph, 6);
        c.fill();
        c.strokeStyle = '#b9cbe3';
        c.lineWidth = 1.5;
        c.stroke();
    });
    const blanketY = b.y + 16 + ph + 8;
    const blanketH = b.y + b.h - 8 - blanketY;
    c.fillStyle = '#7c8fd6';
    bedroomRoundRect(c, b.x + 6, blanketY, b.w - 12, blanketH, 5);
    c.fill();
    c.fillStyle = '#a5b4ee';                        // folded-over top edge
    c.fillRect(b.x + 6, blanketY, b.w - 12, 11);
    c.fillStyle = '#6b7fc9';                        // stripes
    for (let y = blanketY + 24; y < blanketY + blanketH - 6; y += 16) c.fillRect(b.x + 6, y, b.w - 12, 5);
    c.fillStyle = '#5e3717';                        // headboard + footboard
    c.fillRect(b.x - 4, b.y - 4, b.w + 8, 13);
    c.fillRect(b.x - 4, b.y + b.h - 8, b.w + 8, 11);

    // --- Desk (top-down) with a laptop, lamp, notepad and mug; chair pulled out below ---
    const d = L.desk;
    const chairW = 34, chairX = d.x + d.w / 2 - chairW / 2, chairY = d.y + d.h + 6;
    c.fillStyle = 'rgba(0, 0, 0, 0.18)';
    c.fillRect(d.x + 5, d.y + 5, d.w, d.h);
    c.fillStyle = '#8e3b46';                        // chair
    bedroomRoundRect(c, chairX, chairY, chairW, 32, 8);
    c.fill();
    c.fillStyle = '#6d2b35';
    bedroomRoundRect(c, chairX, chairY - 2, chairW, 8, 4);
    c.fill();
    c.fillStyle = '#a0672f';                        // desk top
    c.fillRect(d.x, d.y, d.w, d.h);
    c.strokeStyle = '#6f4520';
    c.lineWidth = 3;
    c.strokeRect(d.x + 1.5, d.y + 1.5, d.w - 3, d.h - 3);
    const lapW = Math.min(40, d.w * 0.34), lapH = d.h * 0.62;
    const lapX = d.x + d.w * 0.30, lapY = d.y + d.h * 0.2;
    c.fillStyle = '#b0b7bd';                        // laptop base
    c.fillRect(lapX, lapY + lapH * 0.42, lapW, lapH * 0.58);
    c.fillStyle = '#2c3e50';                        // screen
    c.fillRect(lapX + 2, lapY, lapW - 4, lapH * 0.44);
    c.fillStyle = '#5dade2';
    c.fillRect(lapX + 5, lapY + 3, lapW - 10, lapH * 0.44 - 6);
    c.fillStyle = '#f1c40f';                        // lamp
    c.beginPath(); c.arc(d.x + 12, d.y + d.h * 0.5, 6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fff3b0';
    c.beginPath(); c.arc(d.x + 12, d.y + d.h * 0.5, 3, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#fbfbf5';                        // notepad
    c.fillRect(d.x + d.w - 30, d.y + 8, 18, Math.max(16, d.h - 20));
    c.fillStyle = '#c9ced3';
    c.fillRect(d.x + d.w - 27, d.y + 13, 12, 2);
    c.fillRect(d.x + d.w - 27, d.y + 19, 12, 2);
    c.fillStyle = '#e74c3c';                        // mug
    c.beginPath(); c.arc(d.x + d.w - 40, d.y + d.h - 12, 5.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#5b3a29';
    c.beginPath(); c.arc(d.x + d.w - 40, d.y + d.h - 12, 3.5, 0, Math.PI * 2); c.fill();

    // --- The two small artificial trees: glossy white pot, faux-wood trunk with an opening,
    //     smooth too-perfect canopy of layered spheres with plastic highlights ---
    L.trees.forEach(t => {
        const k = t.k;
        c.fillStyle = 'rgba(0, 0, 0, 0.2)';
        c.beginPath(); c.ellipse(t.x, t.baseY + 2, 26 * k, 6 * k, 0, 0, Math.PI * 2); c.fill();

        c.fillStyle = '#f2efe8';                    // pot
        c.beginPath();
        c.moveTo(t.x - 18 * k, t.baseY - t.potH);
        c.lineTo(t.x + 18 * k, t.baseY - t.potH);
        c.lineTo(t.x + 13 * k, t.baseY);
        c.lineTo(t.x - 13 * k, t.baseY);
        c.closePath();
        c.fill();
        c.fillStyle = '#dcd7cc';
        c.fillRect(t.x - 20 * k, t.baseY - t.potH - 3 * k, 40 * k, 5 * k);
        c.fillStyle = '#bcb7ab';
        c.fillRect(t.x + 6 * k, t.baseY - t.potH + 2 * k, 3 * k, t.potH - 3 * k);
        c.fillStyle = '#3d6b3a';                    // moss "soil"
        c.beginPath(); c.ellipse(t.x, t.baseY - t.potH - 1 * k, 16 * k, 3 * k, 0, 0, Math.PI * 2); c.fill();

        const trunkTop = t.baseY - t.potH - t.trunkH;
        c.fillStyle = '#7b4f2b';                    // trunk
        c.fillRect(t.x - t.trunkW / 2, trunkTop, t.trunkW, t.trunkH + 2 * k);
        c.fillStyle = '#6a4224';
        c.fillRect(t.x + t.trunkW * 0.15, trunkTop, t.trunkW * 0.35, t.trunkH + 2 * k);
        c.fillStyle = '#5e3a1d';                    // wood-grain lines
        c.fillRect(t.x - t.trunkW * 0.38, trunkTop + 4 * k, 1.5, t.trunkH * 0.3);
        c.fillRect(t.x + t.trunkW * 0.3, trunkTop + t.trunkH * 0.6, 1.5, t.trunkH * 0.32);

        // The opening a glider climbs into.
        c.fillStyle = '#24160d';
        c.beginPath(); c.ellipse(t.hollowX, t.hollowY, t.hollowRX, t.hollowRY, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#120a05';
        c.beginPath(); c.ellipse(t.hollowX, t.hollowY - t.hollowRY * 0.3, t.hollowRX * 0.75, t.hollowRY * 0.55, 0, 0, Math.PI * 2); c.fill();
        c.strokeStyle = '#6b4526';
        c.lineWidth = 2;
        c.beginPath(); c.ellipse(t.hollowX, t.hollowY, t.hollowRX, t.hollowRY, 0, 0, Math.PI * 2); c.stroke();

        const R = t.canopyR;
        const cy = trunkTop - R * 0.45;
        const blobs = [
            [-0.72, 0.28, 0.66], [0.72, 0.28, 0.66], [0, -0.12, 1], [-0.42, -0.5, 0.6], [0.44, -0.5, 0.6]
        ];
        c.fillStyle = '#2f8a3f';                    // shaded layer
        blobs.forEach(([ox, oy, sc]) => { c.beginPath(); c.arc(t.x + ox * R, cy + oy * R + 3 * k, R * sc, 0, Math.PI * 2); c.fill(); });
        c.fillStyle = '#43ad53';                    // main layer
        blobs.forEach(([ox, oy, sc]) => { c.beginPath(); c.arc(t.x + ox * R, cy + oy * R, R * sc, 0, Math.PI * 2); c.fill(); });
        c.fillStyle = 'rgba(190, 255, 200, 0.35)';  // plastic sheen
        blobs.forEach(([ox, oy, sc]) => { c.beginPath(); c.arc(t.x + ox * R - R * 0.18 * sc, cy + oy * R - R * 0.2 * sc, R * sc * 0.42, 0, Math.PI * 2); c.fill(); });
    });
}

function resizeCanvas() {
    const parent = canvas.parentElement;
    let w = parent ? parent.clientWidth : 0;
    let h = parent ? parent.clientHeight : 0;
    if (w < 100) w = window.innerWidth > 100 ? window.innerWidth : 400;
    if (h < 100) h = window.innerHeight > 100 ? window.innerHeight : 600;
    canvas.width = w;
    canvas.height = h;
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

function checkCollisions() {
    let currentRItems = regionalItems[currentRegion];
    if (!currentRItems) return;

    // MASTER SECURITY GATE: Ensure only ONE single item collision check can register per frame pass
    let hasCollectedThisFrame = false;

    // 1. 🥚 Egg Item Collision Loop Check
    if (currentRegion === 3 && currentRItems.eggs) {
        for (let i = currentRItems.eggs.length - 1; i >= 0; i--) {
            let egg = currentRItems.eggs[i];
            if (player.x < egg.x + 12 && player.x + player.size > egg.x - 12 &&
                player.y < egg.y + 12 && player.y + player.size > egg.y - 12) {
                
                currentRItems.eggs.splice(i, 1); 
                inventory.eggs += 1;
                gainPlayerXP(1); 
                updateUI();
                saveGameProgress();
                
                hasCollectedThisFrame = true; // Lock the frame!
                break;
            }
        }
    }

    // Instantly break out if an egg was handled to prevent any background resource bleedthrough
    if (hasCollectedThisFrame) return;

    // 2. 🍉 Food Item Collision Loop Check
    if (currentRItems.foods) {
        for (let i = currentRItems.foods.length - 1; i >= 0; i--) {
            let item = currentRItems.foods[i];
            let dx = (player.x + player.size / 2) - item.x;
            let dy = (player.y + player.size / 2) - item.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < player.size / 2 + 8) {
                currentRItems.foods.splice(i, 1);

                let foodBaseGain = 1;
                let manualFoodMultiplier = getCharacterBonuses(character.level).manualGather;
                let foodGained = Math.round(foodBaseGain * manualFoodMultiplier);
                inventory.food += foodGained;
                
                gainPlayerXP(foodGained); // 1:1 with the amount actually collected (post-multiplier)
                updateUI();
                saveGameProgress();
                
                hasCollectedThisFrame = true; // Lock the frame!
                break;
            }
        }
    }

    // FIXED BRAKE PATH: If food was collected, stop completely and block water logic from executing!
    if (hasCollectedThisFrame) return;

    // 3. 💧 Water Droplet Collision Loop Check
    if (currentRItems.waters) {
        for (let i = currentRItems.waters.length - 1; i >= 0; i--) {
            let item = currentRItems.waters[i];
            let dx = (player.x + player.size / 2) - item.x;
            let dy = (player.y + player.size / 2) - item.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < player.size / 2 + 8) {
                currentRItems.waters.splice(i, 1);

                let waterBaseGain = 1;
                let manualWaterMultiplier = getCharacterBonuses(character.level).manualGather;
                let waterGained = Math.round(waterBaseGain * manualWaterMultiplier);
                inventory.water += waterGained;
                
                gainPlayerXP(waterGained); // 1:1 with the amount actually collected (post-multiplier)
                updateUI();
                saveGameProgress();
                hasCollectedThisFrame = true;
                break;
            }
        }
    }

    if (hasCollectedThisFrame) return;

    // 4. 🍌 Banana Item Collision Loop Check (Region 8 only)
    if (currentRItems.bananas) {
        for (let i = currentRItems.bananas.length - 1; i >= 0; i--) {
            let item = currentRItems.bananas[i];
            let dx = (player.x + player.size / 2) - item.x;
            let dy = (player.y + player.size / 2) - item.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < player.size / 2 + 8) {
                currentRItems.bananas.splice(i, 1);

                let bananaBaseGain = 1;
                let manualBananaMultiplier = getCharacterBonuses(character.level).manualGather;
                let bananaGained = Math.round(bananaBaseGain * manualBananaMultiplier);
                inventory.bananas += bananaGained;

                gainPlayerXP(bananaGained); // 1:1 with the amount actually collected (post-multiplier)
                updateUI();
                saveGameProgress();
                hasCollectedThisFrame = true;
                break;
            }
        }
    }

    if (hasCollectedThisFrame) return;

    // 5. 🐝 Dynamic Proximity Distance Hive Button Trigger
    const spawnBeeBtn = document.getElementById('spawnBeeBtn');
    const hiveHoneyLabel = document.getElementById('hiveHoneyLabel');
    if (currentRegion === 4 && typeof region4Hive !== 'undefined' && region4Hive && spawnBeeBtn) {
        let hx = region4Hive.x;
        let hy = region4Hive.y;
        let dx = (player.x + player.size / 2) - hx;
        let dy = (player.y + player.size / 2) - hy;
        let dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 65) {
            if (petsByRegion[4] && petsByRegion[4].length < 3) {
                spawnBeeBtn.style.display = 'block';
            } else {
                spawnBeeBtn.style.display = 'none';
            }
            // Shows the hive's currently-stored (uncollected) honey whenever the player
            // is close enough to collect it with GIVE — see executeContinuousFeed() in
            // input.js for the actual collection.
            if (hiveHoneyLabel) {
                hiveHoneyLabel.style.display = 'block';
                hiveHoneyLabel.textContent = `🍯 Hive: ${region4Hive.honey} (Tap to collect)`;
            }
        } else {
            spawnBeeBtn.style.display = 'none';
            if (hiveHoneyLabel) hiveHoneyLabel.style.display = 'none';
        }
    } else {
        if (spawnBeeBtn) spawnBeeBtn.style.display = 'none';
        if (hiveHoneyLabel) hiveHoneyLabel.style.display = 'none';
    }

}

// Per-region "refill window" countdowns for the count-driven resource spawn model
// below — keyed by region id. As soon as a region's resource count drops under its
// cap, a 2-second countdown starts (if one isn't already running); once it reaches 0,
// the region is topped straight back up to its max in one batch (not trickled
// item-by-item), and the countdown clears until the count drops below the cap again.
// Replaces the old fixed-10-second trickle and the old per-pickup 10-second individual
// respawnQueue timer for all four spawnable resources (food, water, bananas, and now
// flowers too) — all of which made refills feel like "everything pops back in at once
// every 10s" with long dry spells in between, rather than promptly topping back up.
let regionRefillTimers = {};

function processSpawns(dt) {
    // Region 4 (bees): flowers, capped at 5 — same model as food/water/bananas below,
    // just its own smaller cap (unchanged from before; only the *rate* changed).
    let flowerPool = regionalItems[4].flowers;
    if (flowerPool.length >= 5) {
        regionRefillTimers[4] = undefined;
    } else if (regionRefillTimers[4] === undefined) {
        regionRefillTimers[4] = 2.0;
    } else {
        regionRefillTimers[4] -= dt;
        if (regionRefillTimers[4] <= 0) {
            while (flowerPool.length < 5) flowerPool.push(new Flower());
            regionRefillTimers[4] = undefined;
        }
    }

    // Food/water regions (1, 2, 3, 6, 7): capped at 10 combined (5 food + 5 water).
    FOOD_WATER_REGIONS.forEach(r => {
        let items = regionalItems[r];
        let total = items.foods.length + items.waters.length;

        if (total >= 10) {
            regionRefillTimers[r] = undefined; // fully stocked — no countdown needed
            return;
        }

        if (regionRefillTimers[r] === undefined) {
            regionRefillTimers[r] = 2.0; // just dropped below cap — start the window
        } else {
            regionRefillTimers[r] -= dt;
            if (regionRefillTimers[r] <= 0) {
                while (items.foods.length < 5) items.foods.push(new Item('food'));
                while (items.waters.length < 5) items.waters.push(new Item('water'));
                regionRefillTimers[r] = undefined;
            }
        }
    });

    // Region 8 (monkeys): single resource, bananas, capped at 10 — same model as above.
    let bananaPool = regionalItems[8].bananas;
    if (bananaPool.length >= 10) {
        regionRefillTimers[8] = undefined;
    } else if (regionRefillTimers[8] === undefined) {
        regionRefillTimers[8] = 2.0;
    } else {
        regionRefillTimers[8] -= dt;
        if (regionRefillTimers[8] <= 0) {
            while (bananaPool.length < 10) bananaPool.push(new Item('banana'));
            regionRefillTimers[8] = undefined;
        }
    }
}

