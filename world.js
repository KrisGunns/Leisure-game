// ============================================================
// world.js — Region/world data: the player instance, item spawn
// pools per region, pet roster per region, canvas resizing,
// collision detection, and item respawn scheduling.
// Depends on: state.js, entities.js. Load AFTER those.
// ============================================================

const player = new Player(100, 100);

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
    9: { foods: [], waters: [], flowers: [], bananas: [] },
    // Region 10 (Flower Garden) has no spawnable resources either — its plots live in `gardenPlots`
    // (below). The entry just keeps the per-region lookups working.
    10: { foods: [], waters: [], flowers: [], bananas: [] }
};

// Regions whose food/water item pools get topped up by processSpawns() — Region 4 gets
// flowers instead (bees), Region 5 (bear) gets neither (fishes at the lake instead),
// Region 8 (monkeys) gets bananas instead (its own dedicated pool, handled the same
// way flowers are for Region 4 — see processSpawns() below).
const FOOD_WATER_REGIONS = [1, 2, 3, 6, 7];

// All regions the bird's Lv20 excursion perk can randomly fly to (its home Region 3 is
// filtered out separately — see the picker in entities.js). Every other region now has its
// own visit effect (see BIRD_VISIT_* below), so nothing is excluded here any more. The picker
// also only considers regions the player has actually bought — see isRegionUnlocked().
const ALL_REGIONS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

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

    // Also ticks the squirrel's regional speed boosts (below) on the same real clock, so a
    // "30 second" boost is 30 real seconds.
    for (const r in regionSpeedBoosts) {
        if (regionSpeedBoosts[r] > 0) regionSpeedBoosts[r] = Math.max(0, regionSpeedBoosts[r] - gliderRealDt);
    }
}

// The whole clock above is also what the bird's excursion uses (gliderRealDt is simply "real
// seconds since the last frame", not glider-specific) — see the excursion branch of
// Pet.update(). The name is historical.

// Region 6's mud patch — one definition shared by the visual (main.js draws the pit) and the
// gameplay check (entities.js only lets the pig's mud-play perk trigger while it's standing
// in this ellipse), so the playable area can never drift from what's actually drawn. Centered
// on the canvas, same as the pit main.js paints over the sty floor.
function getMudPatch() {
    return { cx: canvas.width / 2, cy: canvas.height / 2, rx: 65, ry: 38 };
}
function isInMudPatch(x, y) {
    const m = getMudPatch();
    const dx = (x - m.cx) / m.rx;
    const dy = (y - m.cy) / m.ry;
    return (dx * dx + dy * dy) <= 1;
}

// ------------------------------------------------------------------
// SQUIRREL SPEED BOOST (Lv20+ perk): a forage can start a boost that makes every pet currently
// in the squirrel's region move SQUIRREL_BOOST_MULT (+50%) faster for SQUIRREL_BOOST_SECONDS
// (10 real seconds). region -> seconds left. A proc while a boost is already running REFRESHES
// the timer back to the full SQUIRREL_BOOST_SECONDS rather than adding to it — so back-to-back
// procs keep the region boosted longer, but the boost itself never stacks (still just +50%).
// Not saved — like every other timed state it simply ends on a reload.
// main.js stamps each pet with getRegionSpeedBoost(its region) before updating it, and
// Pet.effectiveSpeed multiplies it in, so pets that are only visiting (the bird) or that were
// dropped there (gliders) follow the region they are actually IN.
// ------------------------------------------------------------------
const regionSpeedBoosts = {};
function getRegionSpeedBoost(region) {
    return (regionSpeedBoosts[region] > 0) ? SQUIRREL_BOOST_MULT : 1;
}
function startRegionSpeedBoost(region) {
    regionSpeedBoosts[region] = SQUIRREL_BOOST_SECONDS; // (re)start — refreshes if already running, never stacks
}

// ------------------------------------------------------------------
// BIRD (SPARROW) EXCURSION VISIT EFFECTS (Lv20+ perk — see entities.js for the trip itself):
// while away from home Region 3, the bird doesn't just forage or idle in the region it lands
// in — it actively buffs whatever lives there, differently per region. birdExcursionRegion
// mirrors the visiting bird's own `excursionRegion` (set on departure, cleared on return —
// see the excursion trigger/resolution in entities.js) so every system below can check "is
// the bird visiting my region right now?" in O(1) without scanning for it. Not saved — like
// the rest of the excursion, it simply ends (reverts to no boost) on a reload, same as before.
//   Regions 1, 2, 6, 7 (food/water) and 8 (monkeys): the bird just makes the pets already
//     there move BIRD_VISIT_PET_SPEED_MULT faster — folded into the same _regionSpeedMult
//     that carries the squirrel's boost (see getRegionSpeedBoost above / main.js), so it's
//     one multiplication, not a second system.
//   Region 4 (bees): BIRD_VISIT_BEE_SPEED_MULT bee speed (bigger than the flat pet-speed
//     bonus — also folded into _regionSpeedMult, see getBirdVisitSpeedBoost) AND
//     BIRD_VISIT_HONEY_GAIN_MULT more honey per hive deposit (entities.js, alongside the
//     glider honey buff).
//   Region 5 (bear): BIRD_VISIT_FISH_YIELD_MULT more fish per catch and
//     BIRD_VISIT_FISH_SPEED_MULT faster fishing cycle (both timers — entities.js, alongside
//     the glider fishing buff).
//   Region 9 (gliders): BIRD_VISIT_GLIDER_STAMINA_MULT faster stamina regen while resting
//     (entities.js).
// ------------------------------------------------------------------
let birdExcursionRegion = null;

const BIRD_VISIT_PET_SPEED_MULT = 1.25;      // Regions 1, 2, 6, 7, 8 — every pet already there
const BIRD_VISIT_BEE_SPEED_MULT = 1.50;      // Region 4 — bees themselves (bigger than the flat bonus)
const BIRD_VISIT_HONEY_GAIN_MULT = 1.25;     // Region 4 — honey banked per hive deposit
const BIRD_VISIT_FISH_YIELD_MULT = 1.25;     // Region 5 — bear's catch per cycle
const BIRD_VISIT_FISH_SPEED_MULT = 1.50;     // Region 5 — bear's fishing cycle (wait + active fishing)
const BIRD_VISIT_GLIDER_STAMINA_MULT = 2.00; // Region 9 — stamina regen while resting
const BIRD_VISIT_SPEED_REGIONS = [1, 2, 6, 7, 8]; // get the flat pet-speed bonus above

// Folds into the same _regionSpeedMult that carries the squirrel's boost (see
// getRegionSpeedBoost / main.js's stamping loop) — one multiplication covers both.
function getBirdVisitSpeedBoost(region) {
    if (birdExcursionRegion !== region) return 1;
    if (region === 4) return BIRD_VISIT_BEE_SPEED_MULT;
    return BIRD_VISIT_SPEED_REGIONS.includes(region) ? BIRD_VISIT_PET_SPEED_MULT : 1;
}
function getBirdVisitHoneyGainBoost() { return birdExcursionRegion === 4 ? BIRD_VISIT_HONEY_GAIN_MULT : 1; }
function getBirdVisitFishYieldBoost() { return birdExcursionRegion === 5 ? BIRD_VISIT_FISH_YIELD_MULT : 1; }
function getBirdVisitFishSpeedBoost() { return birdExcursionRegion === 5 ? BIRD_VISIT_FISH_SPEED_MULT : 1; }
function getBirdVisitGliderStaminaBoost() { return birdExcursionRegion === 9 ? BIRD_VISIT_GLIDER_STAMINA_MULT : 1; }


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
                addTaskProgress('pandaFrenzy', 1);   // "Panda Frenzy" task
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
        let coinsEarned = Math.floor(bambooFever.collected / 5 * getCharacterBonuses(character.level).coin + 1e-9);   // Riches applies
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
    8: [ createMonkey('Monkey', 150, 200), createMonkey('Bow Monkey', 280, 200, { bowColor: '#2ecc71' }) ],
    // Region 9's pets are the two sugar gliders, but they are deliberately NOT stored here —
    // see `gliderPets` below. The (empty) array just keeps the region-indexed lookups uniform.
    9: [],
    10: []   // Region 10 (Flower Garden) has no pets
};

// The two sugar gliders, in their own list rather than in petsByRegion. They get carried
// between regions by the player, so a fixed [region][slot] position doesn't work for them,
// and keeping them out of petsByRegion means they can never skew the code that reads it
// (a level-1 glider dropped in Region 1 would otherwise count as an untamed pet there, the
// bee cap, the positional save format, the whistle, ...). Which region a
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
for (let r = 1; r <= 10; r++) {
    if (Array.isArray(petsByRegion[r])) {
        petsByRegion[r].forEach(pet => { if (!pet.homeRegion) pet.homeRegion = r; });
    }
}

// Pets that are bought separately in the shop (Unlockables tab) rather than coming with the
// game or with their region. The tag is the id of the matching UNLOCKABLES row (state.js);
// until it's owned the pet isn't updated, drawn, fed, whistled or shown in the Codex (see
// isPetAvailable()). They stay in their arrays the whole time, which keeps every positional
// save format and Codex slot exactly as it was. Pets NOT listed here come with the game
// (Dog, Elephant, Squirrel, Chicken) or with their region (Bee, Bear, Pig, Panda, Monkey,
// Sugar Glider), so for those only owning the region matters.
petsByRegion[1][1].shopId = 'pet_cat';
petsByRegion[2][1].shopId = 'pet_bowElephant';
birdPet.shopId = 'pet_bird';
petsByRegion[5][1].shopId = 'pet_bowBear';
petsByRegion[6][1].shopId = 'pet_mudPig';
petsByRegion[8][1].shopId = 'pet_bowMonkey';
gliderPets[1].shopId = 'pet_missGlider';

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

// Whether a given region is currently accessible to the player at all. Regions 1-3 are always
// open; Regions 4-10 are unlocked by buying them in the shop's Unlockables tab (UNLOCKABLES /
// unlockedIds in state.js) — pet levels no longer have anything to do with it. Single source of
// truth used by main.js (render/update gating), input.js (region-select gate), ui.js (Codex
// lock display) and entities.js (the bird's excursion target picker).
// How many BEES are in Region 4. Use this — not petsByRegion[4].length — for anything about the hive's
// bee cap or numbering: the bird's Lv20+ excursion puts the bird into that same array for a minute,
// and counting it made a 2-bee hive look full (refusing the 3rd bee and hiding Buy Bee).
function countHiveBees() {
    return Array.isArray(petsByRegion[4]) ? petsByRegion[4].filter(p => p.type === 'bee').length : 0;
}

function isRegionUnlocked(r) {
    return isRegionOwned(r);
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

// Lv10+ gliders speed up every pet in whatever region they're currently dropped in by +25%
// each (stacks the same way getGliderBuff above does). Unlike getGliderBuff, this isn't
// limited to the drain regions (4/5/8) — it works in ANY region a Lv10+ glider is sitting in,
// whether it's foraging, draining stamina for its usual buff, or resting at home in Region 9.
// Folds into the same _regionSpeedMult the squirrel's and bird's boosts use (main.js's
// per-frame stamping loop), so it's one multiplication, not a separate system.
const GLIDER_SPEED_BOOST_MIN_LEVEL = 10;
const GLIDER_SPEED_BOOST_PER_GLIDER = 0.25;
function getGliderSpeedBoost(region) {
    let n = 0;
    gliderPets.forEach(g => {
        if (!g.held && g.regionNow === region && g.stamina > 0 && g.level >= GLIDER_SPEED_BOOST_MIN_LEVEL) n++;
    });
    return n > 0 ? 1 + GLIDER_SPEED_BOOST_PER_GLIDER * n : 1;
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
        if (!isPetAvailable(g)) return; // Miss Glider before she's been bought
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
    saveGameProgress();
    updateUI();
}

// Put the carried glider down in the region the player is standing in, right next to them.
// From that moment it does whatever that region calls for (forage / buff / rest).
function dropGlider() {
    const g = getHeldGlider();
    if (!g) return;
    // Region 10 (the flower garden) is off limits: the glider stays in the player's arms.
    if (currentRegion === GARDEN_REGION) {
        showInfoToast("🌸 Gliders can't be dropped in the flower garden — they'd trample the flowers!");
        return;
    }
    const pad = 24;
    g.held = false;
    g.regionNow = currentRegion;
    const hand = player.getHeldGliderPosition();
    g.x = Math.max(pad, Math.min(canvas.width - g.size - pad, hand.x));
    g.y = Math.max(pad, Math.min(canvas.height - g.size - pad - 14, hand.y));
    g.state = 'idle';
    g.stateTimer = 0.4;
    g.restTimer = 0;
    g.restTree = -1;
    g.pickNewWanderTarget();
    saveGameProgress();
    updateUI();
}

// Draws the carried glider beside the player, on the side they're facing (called after player.draw()).
// Its x/y are kept in sync so feeding it (distance check) works while it's carried.
function drawHeldGlider() {
    const g = getHeldGlider();
    if (!g) return;
    const hand = player.getHeldGliderPosition();
    g.x = hand.x;
    g.y = hand.y;
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

// ------------------------------------------------------------------
// CRISP PET TEXT. The game canvas is drawn at 1 logical px = 1 CSS px and then stretched by the
// browser to the screen's real pixel density, which is what made the text above the pets look
// soft on phones — and pet positions are fractional, so glyphs also landed between pixels. The
// pet name/level/state labels are therefore NOT drawn on the game canvas: Pet.draw() queues them
// (drawPetText) and main.js flushes the queue onto #labelCanvas, a transparent canvas stacked on
// top that is backed at the device's full pixel density and draws each string on a whole device
// pixel with a dark outline. Everything else keeps the game canvas's look.
// ------------------------------------------------------------------
const labelCanvas = document.getElementById('labelCanvas');
const labelCtx = labelCanvas ? labelCanvas.getContext('2d') : null;
let labelScale = 1;
let labelQueue = [];

function resizeLabelCanvas() {
    if (!labelCanvas || !labelCtx) return;
    labelScale = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
    labelCanvas.width = Math.round(canvas.width * labelScale);
    labelCanvas.height = Math.round(canvas.height * labelScale);
}

// Queue one line of text to be drawn centred at (x, y) in game-canvas coordinates.
//   opts.size (px, default 10), opts.color (default white)
function drawPetText(text, x, y, opts) {
    opts = opts || {};
    if (!labelCtx) {
        // No overlay available: fall back to drawing straight onto the game canvas.
        ctx.font = (opts.size || 10) + 'px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = opts.color || '#ffffff';
        ctx.fillText(text, x, y);
        ctx.textAlign = 'left';
        return;
    }
    labelQueue.push({ text: text, x: x, y: y, size: opts.size || 10, color: opts.color || '#ffffff' });
}

function beginPetText() {
    labelQueue.length = 0;
}

// Draws everything queued this frame (and clears whatever was there before).
function flushPetText() {
    if (!labelCtx) return;
    labelCtx.setTransform(1, 0, 0, 1, 0, 0);
    labelCtx.clearRect(0, 0, labelCanvas.width, labelCanvas.height);
    if (labelQueue.length === 0) return;

    labelCtx.textAlign = 'center';
    labelCtx.textBaseline = 'alphabetic';
    labelCtx.lineJoin = 'round';
    labelCtx.miterLimit = 2;
    labelCtx.lineWidth = 3 * labelScale;
    for (let i = 0; i < labelQueue.length; i++) {
        const t = labelQueue[i];
        // Work in device pixels and snap to a whole one, so glyph edges stay sharp.
        const px = Math.round(t.x * labelScale);
        const py = Math.round(t.y * labelScale);
        labelCtx.font = 'bold ' + Math.round(t.size * labelScale) + 'px monospace';
        labelCtx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        labelCtx.strokeText(t.text, px, py);
        labelCtx.fillStyle = t.color;
        labelCtx.fillText(t.text, px, py);
    }
    labelQueue.length = 0;
}

let canvasSizedOnce = false;
// Moves everything that has a map position to where it belongs in the new canvas size.
function rescaleWorld(sx, sy) {
    const fix = (o) => {
        if (!o) return;
        ['x', 'y', 'targetX', 'targetY'].forEach(k => {
            if (typeof o[k] === 'number' && isFinite(o[k])) o[k] *= (k === 'x' || k === 'targetX') ? sx : sy;
        });
    };
    try {
        Object.keys(regionalItems).forEach(r => {
            ['foods', 'waters', 'flowers', 'bananas', 'eggs'].forEach(k => {
                if (Array.isArray(regionalItems[r][k])) regionalItems[r][k].forEach(fix);
            });
        });
        Object.keys(petsByRegion).forEach(r => { if (Array.isArray(petsByRegion[r])) petsByRegion[r].forEach(fix); });
        if (typeof birdPet !== 'undefined') fix(birdPet);
        if (typeof gliderPets !== 'undefined') gliderPets.forEach(fix);
        if (typeof bambooItems !== 'undefined' && Array.isArray(bambooItems)) bambooItems.forEach(fix);
        fix(player);
    } catch (e) { /* never let a resize break the game */ }
}

function resizeCanvas() {
    const parent = canvas.parentElement;
    let w = parent ? parent.clientWidth : 0;
    let h = parent ? parent.clientHeight : 0;
    if (w < 100) w = window.innerWidth > 100 ? window.innerWidth : 400;
    if (h < 100) h = window.innerHeight > 100 ? window.innerHeight : 600;
    const oldW = canvas.width, oldH = canvas.height;
    canvas.width = w;
    canvas.height = h;
    // Items, pets and the player keep their relative place when the screen resizes or rotates
    // (they used to stay at their old pixel positions, possibly off-screen).
    if (canvasSizedOnce && oldW > 0 && oldH > 0 && (oldW !== w || oldH !== h)) rescaleWorld(w / oldW, h / oldH);
    canvasSizedOnce = true;
    resizeLabelCanvas();
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas();

// ------------------------------------------------------------------
// FEEDER BOXES (every region except 4 and 10 — see HUNGER_* / FEEDER_* in state.js)
// A wooden trough holding food (up to FEEDER_CAPACITY). The player deposits food with the Deposit
// button (above WHISTLE) when standing next to it; hungry max-level pets walk over and eat from it
// (Pet.hungerStep in entities.js).
// ------------------------------------------------------------------
function getFeederSpot(region) {
    const W = canvas.width, H = canvas.height;
    if (region === 9) return { x: W / 2, y: H * 0.40 };   // bedroom: open floor between the bed and the trees
    return { x: W / 2, y: 150 };
}
function hasFeeder(region) { return FEEDER_REGIONS.indexOf(region) !== -1; }

function drawFeeder() {
    if (!hasFeeder(currentRegion)) return;
    const c = ctx, sp = getFeederSpot(currentRegion);
    const food = feederFood[currentRegion] || 0, ratio = Math.min(1, food / FEEDER_CAPACITY);
    const w = 64, h = 30, x = sp.x - w / 2, y = sp.y - h / 2;
    c.fillStyle = 'rgba(0,0,0,0.22)';
    c.beginPath(); c.ellipse(sp.x, y + h + 3, w / 2 + 4, 6, 0, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#6d4526';                       // legs
    c.fillRect(x + 4, y + h - 4, 6, 9); c.fillRect(x + w - 10, y + h - 4, 6, 9);
    c.fillStyle = '#8b5a2b';                       // box
    c.fillRect(x, y, w, h);
    c.fillStyle = '#4a2f18';                       // hollow
    c.fillRect(x + 5, y + 5, w - 10, h - 12);
    if (food > 0) {                                // heap of food
        c.fillStyle = '#e8a33d';
        const n = 3 + Math.round(ratio * 9);
        for (let i = 0; i < n; i++) {
            c.beginPath();
            c.arc(x + 11 + (i % 6) * 8.4, y + 15 - Math.floor(i / 6) * (3 + ratio * 4), 4, 0, Math.PI * 2);
            c.fill();
        }
    }
    c.fillStyle = '#a06a35';                       // front rim
    c.fillRect(x, y + h - 9, w, 9);
    c.strokeStyle = '#3e2713'; c.lineWidth = 2;
    c.strokeRect(x, y, w, h);
    c.fillStyle = 'rgba(0,0,0,0.6)';               // fill bar above
    c.fillRect(x, y - 9, w, 5);
    c.fillStyle = ratio > 0.2 ? '#f1c40f' : '#e74c3c';
    c.fillRect(x, y - 9, w * ratio, 5);
    drawPetText(`🍖 ${food}/${FEEDER_CAPACITY}`, sp.x, y - 13, { size: 9 });
}

function isNearFeeder() {
    if (!hasFeeder(currentRegion)) return false;
    const sp = getFeederSpot(currentRegion);
    return Math.hypot(player.x + player.size / 2 - sp.x, player.y + player.size / 2 - sp.y) < 70;
}

function updateFeederButton() {
    const btn = document.getElementById('feederBtn');
    if (!btn) return;
    if (!isNearFeeder()) { if (btn.style.display !== 'none') btn.style.display = 'none'; return; }
    if (btn.style.display !== 'block') btn.style.display = 'block';
    const label = `Deposit Food (${feederFood[currentRegion] || 0}/${FEEDER_CAPACITY})`;
    if (btn.textContent !== label) btn.textContent = label;
}

function depositFeederFood() {
    if (!isNearFeeder()) return;
    const room = FEEDER_CAPACITY - (feederFood[currentRegion] || 0);
    if (room <= 0) { showInfoToast('🍖 The feeder is full!'); return; }
    if (inventory.food < 1) { showInfoToast('🍪 You have no food to deposit.'); return; }
    const amount = Math.min(room, inventory.food);
    inventory.food -= amount;
    feederFood[currentRegion] = (feederFood[currentRegion] || 0) + amount;
    saveGameProgress();
    updateUI();
    updateFeederButton();
}

// ------------------------------------------------------------------
// REGION 10 — THE FLOWER GARDEN
// Twelve plots in a raised bed. Plot 1 comes with the region; the others are bought with gold
// right at the plot (price = GARDEN_PLOT_PRICE_STEP x the number of plots already owned: 200,
// 400, 600 ...). A plot goes: clay -> (Fertilize: 1 soil charge + 1 seed) -> seed -> shoot ->
// hydrangea. Each stage needs watering with water from the bag:
//   seed  : 1000 water, then 2 min until it becomes a shoot
//   shoot : 3000 water, then 4 min until it blossoms
//   bloom : 8000 water the first time, then 1000 every time it dries out. A watering lasts
//           10 min; after that the flower has 1 minute to be watered again or it dies and the
//           plot goes back to clay.
// Each fully grown flower in its watered state adds +10% coins to every payout (inventory.coins
// setter, state.js; not shop sales or the dev gold button) and +10% bee movement + foraging speed.
// The bonuses stack: 12 watered flowers = +120%.
// All timers run on the real clock (gliderRealDt, clamped per frame), so they only advance
// while the game is open and in the foreground.
// ------------------------------------------------------------------
const GARDEN_REGION = 10;
const GARDEN_PLOT_COUNT = 12;
const GARDEN_PLOT_PRICE_STEP = 200;
const GARDEN_STAGE_WATER = { 1: 1000, 2: 3000, 3: 8000 };   // water needed to water a plot in that stage
const GARDEN_REWATER_COST = 1000;                            // every watering after the first bloom watering
const GARDEN_STAGE_SECONDS = { 1: 120, 2: 240, 3: 600 };    // how long a watering lasts (seed -> shoot -> bloom -> thirsty)
const GARDEN_GRACE_SECONDS = 60;                             // thirsty bloom dies after this long
const GARDEN_BOOST = 0.10;                                   // +10% coins and +10% bee speed PER watered bloom (stacks)

function createGardenPlot() {
    return { owned: false, soil: false, stage: 0, watered: false, timer: 0, grace: null, matured: false, warned: false };
}
const gardenPlots = [];
for (let i = 0; i < GARDEN_PLOT_COUNT; i++) gardenPlots.push(createGardenPlot());

function isGardenPlotOwned(i) {
    return i === 0 ? isRegionOwned(GARDEN_REGION) : !!gardenPlots[i].owned;
}
function countOwnedGardenPlots() {
    let n = 0;
    for (let i = 0; i < GARDEN_PLOT_COUNT; i++) if (isGardenPlotOwned(i)) n++;
    return n;
}
function getNextGardenPlotPrice() {
    return GARDEN_PLOT_PRICE_STEP * Math.max(1, countOwnedGardenPlots());
}
function getGardenWaterCost(p) {
    if (p.stage === 3 && p.matured) return GARDEN_REWATER_COST;
    return GARDEN_STAGE_WATER[p.stage] || 0;
}
function gardenPlotNeedsWater(p) { return p.stage >= 1 && !p.watered; }

// How many fully grown flowers are in their watered state right now. Each adds GARDEN_BOOST.
function countWateredBlooms() {
    if (!isRegionOwned(GARDEN_REGION)) return 0;
    let n = 0;
    for (let i = 0; i < GARDEN_PLOT_COUNT; i++) {
        const p = gardenPlots[i];
        if (p.stage === 3 && p.watered && isGardenPlotOwned(i)) n++;
    }
    return n;
}
function isGardenBoostActive() { return countWateredBlooms() > 0; }
function getGardenCoinBoost() { return 1 + GARDEN_BOOST * countWateredBlooms(); }
function getGardenBeeBoost() { return 1 + GARDEN_BOOST * countWateredBlooms(); }

function gardenNotify(msg) {
    if (typeof showGardenToast === 'function') showGardenToast(msg);
}

// Ticked once per frame from main.js (after tickGliderClock, which provides gliderRealDt).
function tickGarden() {
    if (!isRegionOwned(GARDEN_REGION)) return;
    const dt = gliderRealDt;
    if (!(dt > 0)) return;
    let needsWater = false, died = false, dying = false;
    for (let i = 0; i < GARDEN_PLOT_COUNT; i++) {
        const p = gardenPlots[i];
        if (p.stage < 1) continue;
        if (p.watered) {
            p.timer -= dt;
            if (p.timer <= 0) {
                p.watered = false;
                p.timer = 0;
                if (p.stage < 3) p.stage++;                      // seed -> shoot, shoot -> bloom
                else { p.grace = GARDEN_GRACE_SECONDS; p.warned = false; }   // bloom dried out
                needsWater = true;
            }
        } else if (p.stage === 3 && p.matured && p.grace !== null) {
            p.grace -= dt;
            if (p.grace <= 0) {                                  // withered: the plot goes back to hard clay
                gardenPlots[i] = createGardenPlot();
                gardenPlots[i].owned = p.owned;                  // the plot itself stays yours
                died = true;
            } else if (p.grace <= GARDEN_GRACE_SECONDS / 2 && !p.warned) {
                p.warned = true;
                dying = true;
            }
        }
    }
    if (died) { gardenNotify('🥀 A hydrangea withered away — its plot is back to hard clay.'); saveGameProgress(); }
    else if (needsWater || dying) {
        gardenNotify(dying && !needsWater ? '⚠️ A flower is about to wither — water your flowers in Region 10!' : '💧 Your flowers need water! Water them in Region 10.');
        saveGameProgress();
    }
}

function buyGardenPlot(i) {
    const p = gardenPlots[i];
    if (!p || isGardenPlotOwned(i)) return false;
    const price = getNextGardenPlotPrice();
    if (inventory.coins < price) { showInfoToast(`🪙 A new plot costs ${price} coins. (You have: ${inventory.coins})`); return false; }
    inventory.coins -= price;
    p.owned = true;
    saveGameProgress();
    updateUI();
    return true;
}
function fertilizeGardenPlot(i) {
    const p = gardenPlots[i];
    if (!p || !isGardenPlotOwned(i) || p.stage !== 0) return false;
    if (inventory.soil < 1) { showInfoToast('🪴 You need soil! Buy a Bag of Soil in the Shop (Menu → Shop → Buy).'); return false; }
    if (inventory.seeds < 1) { showInfoToast('🌱 You need a flower seed! Buy one in the Shop (Menu → Shop → Buy).'); return false; }
    inventory.soil -= 1;
    inventory.seeds -= 1;
    p.soil = true;
    p.stage = 1;
    p.watered = false;
    p.timer = 0;
    p.grace = null;
    p.matured = false;
    saveGameProgress();
    updateUI();
    return true;
}
function waterGardenPlot(i) {
    const p = gardenPlots[i];
    if (!p || !isGardenPlotOwned(i) || !gardenPlotNeedsWater(p)) return false;
    const cost = getGardenWaterCost(p);
    if (inventory.water < cost) { showInfoToast(`💧 Not enough water! This needs ${cost} (you have ${inventory.water}).`); return false; }
    inventory.water -= cost;
    p.watered = true;
    p.timer = GARDEN_STAGE_SECONDS[p.stage];
    if (p.stage === 3) { p.matured = true; p.grace = null; p.warned = false; }
    saveGameProgress();
    updateUI();
    return true;
}

// Which plot the player is standing at (nearest within reach), or -1. Region 10 only.
function getActiveGardenPlot() {
    if (currentRegion !== GARDEN_REGION) return -1;
    const L = getGardenLayout();
    const px = player.x + player.size / 2, py = player.y + player.size / 2;
    let best = -1, bestD = Infinity;
    for (let i = 0; i < L.plots.length; i++) {
        const r = L.plots[i];
        const reach = 18;
        if (px < r.x - reach || px > r.x + r.s + reach || py < r.y - reach || py > r.y + r.s + reach) continue;
        const d = Math.hypot(px - (r.x + r.s / 2), py - (r.y + r.s / 2));
        if (d < bestD) { bestD = d; best = i; }
    }
    return best;
}

// What the action button should offer for plot i: { kind, label } or null.
function getGardenPlotAction(i) {
    const p = gardenPlots[i];
    if (!p) return null;
    if (!isGardenPlotOwned(i)) return { kind: 'buy', label: `Buy Plot (${getNextGardenPlotPrice()}🪙)` };
    if (p.stage === 0) return { kind: 'fertilize', label: 'Fertilize' };
    if (gardenPlotNeedsWater(p)) return { kind: 'water', label: `Water (${getGardenWaterCost(p)}💧)` };
    return null;
}

function formatGardenTime(sec) {
    sec = Math.max(0, Math.ceil(sec));
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function getGardenPlotStatus(i) {
    const p = gardenPlots[i];
    if (!isGardenPlotOwned(i)) return 'Locked plot';
    if (p.stage === 0) return 'Hard clay';
    const name = p.stage === 1 ? 'Seed' : (p.stage === 2 ? 'Shoot' : 'Hydrangea');
    if (p.watered) return `${name} · ${p.stage === 3 ? 'watered' : 'growing'} ${formatGardenTime(p.timer)}`;
    if (p.stage === 3 && p.matured && p.grace !== null) return `${name} · thirsty! ${formatGardenTime(p.grace)}`;
    return `${name} · needs water`;
}

// Layout: a 3 x 4 grid of square plots inside a raised bed. Sized from the canvas so it fits any
// phone; the bottom is kept clear for the action buttons stacked above the whistle button.
let gardenLayoutCache = null;
function getGardenLayout() {
    const W = canvas.width, H = canvas.height;
    if (gardenLayoutCache && gardenLayoutCache.W === W && gardenLayoutCache.H === H) return gardenLayoutCache;
    const cols = 3, rows = 4;
    const bedX = 34, bedY = 78;
    const bedW = W - 68;
    const bedH = Math.max(220, H - bedY - 230);
    const cellW = (bedW - 16) / cols, cellH = (bedH - 16) / rows;
    const s = Math.max(34, Math.min(74, cellW - 14, cellH - 16));
    const plots = [];
    for (let i = 0; i < GARDEN_PLOT_COUNT; i++) {
        const c = i % cols, r = Math.floor(i / cols);
        plots.push({ x: bedX + 8 + c * cellW + (cellW - s) / 2, y: bedY + 8 + r * cellH + (cellH - s) / 2, s: s });
    }
    gardenLayoutCache = { W: W, H: H, bed: { x: bedX, y: bedY, w: bedW, h: bedH }, plots: plots, s: s };
    return gardenLayoutCache;
}

// ---- drawing ----
function gardenHash(a, b) {                   // deterministic scatter so the meadow never flickers
    let h = (a * 374761393 + b * 668265263) | 0;
    h = (h ^ (h >>> 13)) * 1274126177 | 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
const GARDEN_MEADOW_COLORS = ['#ff8fb1', '#ffffff', '#ffd54f', '#b39ddb', '#ff7043', '#81d4fa'];

function drawGardenFlowerSmall(c, x, y, r, col) {
    c.fillStyle = col;
    for (let k = 0; k < 5; k++) {
        const a = k / 5 * Math.PI * 2;
        c.beginPath(); c.arc(x + Math.cos(a) * r, y + Math.sin(a) * r, r * 0.8, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = '#f9a825';
    c.beginPath(); c.arc(x, y, r * 0.55, 0, Math.PI * 2); c.fill();
}

function drawGardenBackground() {
    const c = ctx, L = getGardenLayout(), W = L.W, H = L.H;
    // Lawn with mown stripes and grass tufts
    c.fillStyle = '#7ccb6e';
    c.fillRect(0, 0, W, H);
    c.fillStyle = '#73c166';
    for (let y = 0; y < H; y += 56) c.fillRect(0, y, W, 28);
    c.fillStyle = '#5fae55';
    for (let x = 20; x < W; x += 52) {
        for (let y = 24; y < H; y += 52) {
            const j = gardenHash(x, y);
            c.fillRect(x + j * 16, y + j * 12, 2, 7);
            c.fillRect(x + j * 16 + 5, y + j * 12 + 2, 2, 5);
        }
    }
    // Hedge along the top, dotted with blossoms
    c.fillStyle = '#2e7d3a';
    c.fillRect(0, 0, W, 34);
    c.fillStyle = '#3a944a';
    for (let x = 0; x < W + 20; x += 22) { c.beginPath(); c.arc(x, 30, 17, 0, Math.PI * 2); c.fill(); }
    for (let x = 6; x < W; x += 19) {
        const j = gardenHash(x, 7);
        c.fillStyle = GARDEN_MEADOW_COLORS[Math.floor(j * GARDEN_MEADOW_COLORS.length)];
        c.beginPath(); c.arc(x + j * 8, 10 + j * 18, 2.6, 0, Math.PI * 2); c.fill();
    }
    // Meadow flowers scattered around (kept off the raised bed)
    const bed = L.bed;
    for (let x = 30; x < W - 10; x += 46) {
        for (let y = 50; y < H - 10; y += 46) {
            const jx = gardenHash(x, y) * 30 - 15, jy = gardenHash(y, x) * 30 - 15;
            const fx = x + jx, fy = y + jy;
            if (fx > bed.x - 12 && fx < bed.x + bed.w + 12 && fy > bed.y - 12 && fy < bed.y + bed.h + 12) continue;
            if (gardenHash(x + 3, y + 9) < 0.45) continue;
            drawGardenFlowerSmall(c, fx, fy, 3, GARDEN_MEADOW_COLORS[Math.floor(gardenHash(x, y + 1) * GARDEN_MEADOW_COLORS.length)]);
        }
    }
    // Stepping stones leading to the bed
    c.fillStyle = '#b8bcc2';
    const sx = W / 2, sy0 = bed.y + bed.h + 14;
    for (let k = 0, y = sy0; y < H - 20; k++, y += 34) {
        c.beginPath(); c.ellipse(sx + (k % 2 ? 12 : -12), y, 17, 11, 0, 0, Math.PI * 2); c.fill();
    }
    c.fillStyle = 'rgba(255,255,255,0.35)';
    for (let k = 0, y = sy0; y < H - 20; k++, y += 34) {
        c.beginPath(); c.ellipse(sx + (k % 2 ? 12 : -12) - 4, y - 3, 8, 4, 0, 0, Math.PI * 2); c.fill();
    }
    // Raised wooden bed with dark earth between the plots
    c.fillStyle = 'rgba(0,0,0,0.2)';
    c.fillRect(bed.x + 4, bed.y + 5, bed.w, bed.h);
    c.fillStyle = '#7b5230';
    c.fillRect(bed.x - 6, bed.y - 6, bed.w + 12, bed.h + 12);
    c.fillStyle = '#9a6a3f';
    c.fillRect(bed.x - 6, bed.y - 6, bed.w + 12, 5);
    c.fillStyle = '#5e4129';
    c.fillRect(bed.x, bed.y, bed.w, bed.h);
    c.fillStyle = 'rgba(0,0,0,0.12)';
    for (let x = bed.x + 6; x < bed.x + bed.w - 6; x += 17) c.fillRect(x, bed.y + 3, 3, bed.h - 6);
}

function gardenRoundRect(c, x, y, w, h, r) {
    if (typeof bedroomRoundRect === 'function') bedroomRoundRect(c, x, y, w, h, r);
    else { c.beginPath(); c.rect(x, y, w, h); }
}

// A hydrangea: round "mophead" of many small four-petal florets on a stem with broad leaves.
const GARDEN_HYDRANGEA_COLORS = [ ['#5b7fe0', '#8fb0ff'], ['#9b6fd6', '#c9a6f2'], ['#e87fae', '#f7bdd5'], ['#6fa8e8', '#b6d6ff'] ];
function drawHydrangea(c, cx, baseY, s, pal, state, seed, t) {
    // state: 'watered' (vivid, swaying) or 'thirsty' (pale, drooping)
    const thirsty = state === 'thirsty';
    const sway = thirsty ? 0 : Math.sin(t * 1.6 + seed) * s * 0.025;
    const droop = thirsty ? s * 0.1 : 0;
    const headR = s * 0.3;
    const headX = cx + sway, headY = baseY - s * 0.5 + droop;
    // stem
    c.strokeStyle = thirsty ? '#8a9a52' : '#3f8f3a';
    c.lineWidth = Math.max(2, s * 0.06);
    c.beginPath(); c.moveTo(cx, baseY); c.quadraticCurveTo(cx + sway * 0.4, baseY - s * 0.25, headX, headY + headR * 0.5); c.stroke();
    // broad leaves
    c.fillStyle = thirsty ? '#9aa060' : '#4caf50';
    c.beginPath(); c.ellipse(cx - s * 0.2, baseY - s * 0.2 + droop * 0.6, s * 0.2, s * 0.1, thirsty ? 0.7 : -0.5, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(cx + s * 0.2, baseY - s * 0.22 + droop * 0.6, s * 0.2, s * 0.1, thirsty ? -0.7 : 0.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = thirsty ? '#858a50' : '#388e3c';
    c.fillRect(cx - s * 0.02, baseY - s * 0.2, s * 0.04, s * 0.02);
    // floret dome: rings of four-petal florets
    const c1 = thirsty ? '#a79aa8' : pal[0], c2 = thirsty ? '#c4b8c2' : pal[1];
    const rings = [[0, 1], [headR * 0.55, 6], [headR * 0.95, 11]];
    const pr = Math.max(1.6, s * 0.05);
    rings.forEach(([rad, n], ri) => {
        for (let k = 0; k < n; k++) {
            const a = (k / n) * Math.PI * 2 + ri * 0.5;
            const fx = headX + Math.cos(a) * rad, fy = headY + Math.sin(a) * rad * 0.85;
            c.fillStyle = (k + ri) % 2 ? c1 : c2;
            for (let q = 0; q < 4; q++) {
                const qa = q * Math.PI / 2 + Math.PI / 4;
                c.beginPath(); c.arc(fx + Math.cos(qa) * pr * 0.9, fy + Math.sin(qa) * pr * 0.9, pr, 0, Math.PI * 2); c.fill();
            }
            c.fillStyle = thirsty ? '#ddd2c0' : '#fff6c9';
            c.beginPath(); c.arc(fx, fy, pr * 0.35, 0, Math.PI * 2); c.fill();
        }
    });
}

function drawGardenPlots() {
    const c = ctx, L = getGardenLayout(), t = performance.now() / 1000;
    const active = getActiveGardenPlot();
    for (let i = 0; i < L.plots.length; i++) {
        const r = L.plots[i], p = gardenPlots[i], s = r.s;
        const owned = isGardenPlotOwned(i);
        const cx = r.x + s / 2, baseY = r.y + s * 0.82;
        // ground of the plot
        if (owned && p.stage >= 1) {
            c.fillStyle = '#3b2616';                                     // soil
            gardenRoundRect(c, r.x, r.y, s, s, 6); c.fill();
            c.fillStyle = '#4e3220';
            for (let k = 0; k < 9; k++) c.fillRect(r.x + 5 + gardenHash(i, k) * (s - 12), r.y + 5 + gardenHash(k, i) * (s - 12), 3, 2);
            c.fillStyle = '#2a1a0f';
            for (let k = 0; k < 6; k++) c.fillRect(r.x + 5 + gardenHash(i + 5, k) * (s - 12), r.y + 5 + gardenHash(k, i + 5) * (s - 12), 2, 2);
            if (p.watered) { c.fillStyle = 'rgba(20,10,5,0.35)'; gardenRoundRect(c, r.x, r.y, s, s, 6); c.fill(); }   // wet, darker soil
        } else {
            c.fillStyle = owned ? '#c8a272' : '#a98d68';                 // hard clay
            gardenRoundRect(c, r.x, r.y, s, s, 6); c.fill();
            c.strokeStyle = owned ? '#9c7a4e' : '#80684a';
            c.lineWidth = 1.5;
            c.beginPath();
            c.moveTo(r.x + s * 0.2, r.y + s * 0.1); c.lineTo(r.x + s * 0.35, r.y + s * 0.4); c.lineTo(r.x + s * 0.28, r.y + s * 0.65);
            c.moveTo(r.x + s * 0.35, r.y + s * 0.4); c.lineTo(r.x + s * 0.7, r.y + s * 0.5); c.lineTo(r.x + s * 0.85, r.y + s * 0.8);
            c.moveTo(r.x + s * 0.7, r.y + s * 0.5); c.lineTo(r.x + s * 0.62, r.y + s * 0.15);
            c.stroke();
        }
        c.strokeStyle = owned ? '#5a3e22' : '#4a3a28';
        c.lineWidth = 3;
        gardenRoundRect(c, r.x, r.y, s, s, 6); c.stroke();

        if (!owned) {                                                      // locked plot
            c.fillStyle = 'rgba(0,0,0,0.38)';
            gardenRoundRect(c, r.x, r.y, s, s, 6); c.fill();
            c.font = Math.round(s * 0.42) + 'px monospace';
            c.textAlign = 'center';
            c.fillStyle = '#fff';
            c.fillText('🔒', cx, r.y + s * 0.62);
            c.textAlign = 'left';
        } else if (p.stage === 1) {                                        // seed
            c.fillStyle = '#6b4a2b';
            c.beginPath(); c.ellipse(cx, r.y + s * 0.6, s * 0.2, s * 0.1, 0, 0, Math.PI * 2); c.fill();
            c.fillStyle = '#d9c9a0';
            c.beginPath(); c.ellipse(cx, r.y + s * 0.55, s * 0.07, s * 0.1, 0.4, 0, Math.PI * 2); c.fill();
        } else if (p.stage === 2) {                                        // shoot
            c.strokeStyle = '#4caf50'; c.lineWidth = Math.max(2, s * 0.06);
            c.beginPath(); c.moveTo(cx, r.y + s * 0.75); c.lineTo(cx, r.y + s * 0.4); c.stroke();
            c.fillStyle = '#66bb6a';
            c.beginPath(); c.ellipse(cx - s * 0.13, r.y + s * 0.42, s * 0.14, s * 0.07, -0.6, 0, Math.PI * 2); c.fill();
            c.beginPath(); c.ellipse(cx + s * 0.13, r.y + s * 0.38, s * 0.14, s * 0.07, 0.6, 0, Math.PI * 2); c.fill();
        } else if (p.stage === 3) {                                        // hydrangea
            drawHydrangea(c, cx, baseY, s, GARDEN_HYDRANGEA_COLORS[i % GARDEN_HYDRANGEA_COLORS.length], p.watered ? 'watered' : 'thirsty', i, t);
            if (p.watered) {                                               // little sparkle
                c.fillStyle = 'rgba(180,225,255,0.9)';
                const sp = (t * 0.8 + i * 0.37) % 1;
                c.beginPath(); c.arc(cx + Math.sin(i * 3.1) * s * 0.3, r.y + s * 0.3 - sp * s * 0.2, 2, 0, Math.PI * 2); c.fill();
            }
        }

        // timer bar under the plot: blue = time left watered, red = time left before it withers
        if (owned && p.stage >= 1) {
            let frac = 0, col = '#4fc3f7';
            if (p.watered) frac = p.timer / GARDEN_STAGE_SECONDS[p.stage];
            else if (p.stage === 3 && p.matured && p.grace !== null) { frac = p.grace / GARDEN_GRACE_SECONDS; col = '#e53935'; }
            c.fillStyle = 'rgba(0,0,0,0.55)'; c.fillRect(r.x, r.y + s + 3, s, 5);
            c.fillStyle = col; c.fillRect(r.x, r.y + s + 3, s * Math.max(0, Math.min(1, frac)), 5);
            if (gardenPlotNeedsWater(p)) {                                 // bouncing water-drop: this one needs watering
                c.font = Math.round(s * 0.3) + 'px monospace';
                c.textAlign = 'center';
                c.fillText('💧', cx, r.y - 3 - Math.abs(Math.sin(t * 3 + i)) * 4);
                c.textAlign = 'left';
            }
        }
        if (i === active) {                                                // highlight the plot you are at
            c.strokeStyle = '#fff176'; c.lineWidth = 3;
            gardenRoundRect(c, r.x - 3, r.y - 3, s + 6, s + 6, 8); c.stroke();
        }
    }
    if (active >= 0) {
        const r = L.plots[active];
        drawPetText(getGardenPlotStatus(active), r.x + r.s / 2, r.y - 14, { size: 10, color: '#fff176' });
    }
}

// ---- the action button (index.html #plotActionBtn), shown above the whistle button while the
// player stands at a plot that has something to offer: Buy Plot / Fertilize / Water ----
function updateGardenButtons() {
    const btn = document.getElementById('plotActionBtn');
    if (!btn) return;
    const i = getActiveGardenPlot();
    const act = i >= 0 ? getGardenPlotAction(i) : null;
    if (!act) { if (btn.style.display !== 'none') btn.style.display = 'none'; return; }
    if (btn.style.display !== 'block') btn.style.display = 'block';
    if (btn.textContent !== act.label) btn.textContent = act.label;
}

function handleGardenAction() {
    const i = getActiveGardenPlot();
    const act = i >= 0 ? getGardenPlotAction(i) : null;
    if (!act) return;
    if (act.kind === 'buy') buyGardenPlot(i);
    else if (act.kind === 'fertilize') fertilizeGardenPlot(i);
    else if (act.kind === 'water') waterGardenPlot(i);
    updateGardenButtons();
}

function checkCollisions() {
    let currentRItems = regionalItems[currentRegion];
    if (!currentRItems) return;

    // Eggs are saved as raw pixel positions, so a save loaded on a smaller screen could leave one
    // outside the playfield where the player can never reach it — pull any such egg back inside.
    if (currentRegion === 3 && currentRItems.eggs) {
        currentRItems.eggs.forEach(egg => {
            egg.x = Math.max(20, Math.min(canvas.width - 20, egg.x));
            egg.y = Math.max(20, Math.min(canvas.height - 20, egg.y));
        });
    }

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
                addTaskProgress('easter', 1);   // "Easter" task
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
                let foodGained = roundStochastic(foodBaseGain * manualFoodMultiplier);
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
                let waterGained = roundStochastic(waterBaseGain * manualWaterMultiplier);
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
                let bananaGained = roundStochastic(bananaBaseGain * manualBananaMultiplier);
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
            if (countHiveBees() < HIVE_MAX_BEES) {
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
    // Region 4 (bees): flowers, capped at 12 — same model as food/water/bananas below,
    // just its own bigger cap now (room for the hive's now-5 bees to all find one).
    let flowerPool = regionalItems[4].flowers;
    if (flowerPool.length >= 12) {
        regionRefillTimers[4] = undefined;
    } else if (regionRefillTimers[4] === undefined) {
        regionRefillTimers[4] = 2.0;
    } else {
        regionRefillTimers[4] -= dt;
        if (regionRefillTimers[4] <= 0) {
            while (flowerPool.length < 12) flowerPool.push(new Flower());
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

