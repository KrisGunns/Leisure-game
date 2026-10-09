// ============================================================
// state.js — Core game state: inventory, character XP/level,
// save/load to localStorage. Load this file FIRST.
// ============================================================

const canvas = document.getElementById('gameCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

const lblFood = document.getElementById('lblFood');
const lblWater = document.getElementById('lblWater');
const bagHoney = document.getElementById('bagHoney');
const bagFish = document.getElementById('bagFish');
const bagCoins = document.getElementById('bagCoins');
const bagEggs = document.getElementById('bagEggs');
const bagBananas = document.getElementById('bagBananas');
const bagDiamonds = document.getElementById('bagDiamonds');
const regionSelector = document.getElementById('regionSelector');
const whistleBtn = document.getElementById('whistleBtn');

// The highest level any pet can reach. Everything that used to hard-code 20 (feeding stops,
// progress bars, the Codex's "x/20", the dev insta-max, save validation...) reads this instead.
const MAX_PET_LEVEL = 50;

// ------------------------------------------------------------------
// HUNGER + FEEDER BOXES. A pet at MAX_PET_LEVEL gets a hunger bar (0-100) that drops 1 point every
// HUNGER_SECONDS_PER_POINT seconds. At 0 the pet stops dead until it is fed (GIVE, or by walking to
// the feeder). A point costs HUNGER_FOOD_PER_POINT food (200 food = a full bar). Every region except
// Region 4 (bees) and Region 10 (garden) has a feeder box holding up to FEEDER_CAPACITY food; the
// player deposits food into it and hungry pets (below HUNGER_SEEK_BELOW) walk over and eat from it.
// Bees do not use hunger at all (their region has no feeder).
// ------------------------------------------------------------------
const HUNGER_MAX = 100;
const HUNGER_SECONDS_PER_POINT = 3;
const HUNGER_FOOD_PER_POINT = 2;
const HUNGER_SEEK_BELOW = 50;      // a pet at or below this heads for the feeder (if it has food)
// A pet at 0 hunger only freezes while it is in one of these plain states (see Pet.hungerStep in entities.js);
// mini-games and other special actions are left to finish.
const HUNGER_FREEZE_STATES = ['wander', 'idle', 'whistled', 'forage', 'travel'];
const WELL_FED_MIN_HUNGER = 50;    // "well fed" = a max-level pet whose hunger bar is at least this
const WELL_FED_SPEED_MULT = 1.10;  // ...moves 10% faster
const HUNGER_EAT_RATE = 10;        // points restored per second while eating at the feeder
const FEEDER_CAPACITY = 500;
const FEEDER_REGIONS = [1, 2, 3, 5, 6, 7, 8, 9];
// Tutorial tips the player has already been shown (id -> true); the HELP screen lists exactly these.
const tutorialSeen = {};
const feederFood = {};             // region -> food stored
FEEDER_REGIONS.forEach(r => { feederFood[r] = 0; });
const MAX_EGGS_ON_MAP = 25;   // chicken eggs lying in Region 3 (laying stops while the map is full)
const MAX_NAME_LENGTH = 20;   // pet / character names (inputs have maxlength too; loaded saves are clamped)
// Loaded-save helpers: a hand-edited or corrupt save can't put NaN, negatives, huge or non-string values into the game.
// Pets in the middle of a mini-game / special action (dog digging, pig mud-play, monkey swinging,
// cat in the Schrödinger box, panda Bamboo Fever or Starve, elephant tag, bear walking to / at the lake) can't be whistled — it would
// throw away the coin payout / penalty / box. See the whistle button in input.js.
function isPetBusy(pet) {
    const st = pet && pet.state;
    if (typeof st !== 'string') return false;
    return ['digging', 'mud_play', 'swinging', 'schrodinger', 'bamboo_wait', 'fishing_travel', 'fishing', 'full', 'abandoned'].indexOf(st) !== -1 ||
        st.indexOf('playing') === 0;
}
function cleanSavedName(v, fallback) {
    if (typeof v !== 'string') return fallback;
    const t = v.trim().slice(0, MAX_NAME_LENGTH);
    return t || fallback;
}
function cleanSavedNum(v, min, max, fallback) {
    const n = Number(v);
    if (!isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

// New Core Dynamic Math Formula Engine (scaling factor is Level ^ 1.2, so it keeps working
// unchanged up to MAX_PET_LEVEL)
function getLevelRequirement(type, currentLevel) {
    const baseMap = { dog: 20, elephant: 35, squirrel: 10, chicken: 15, bee: 8, bear: 10, pig: 80, cat: 40, bird: 50, panda: 120, monkey: 50 };
    let base = baseMap[type] || 20;
    
    // Safety fallback: If currentLevel is accidentally passed as an object or undefined, default to 1
    let lvl = (typeof currentLevel === 'number') ? currentLevel : 1;
    
    // Sugar gliders (Region 9) eat a "treat" — EITHER honey OR bananas, whichever the player
    // has (any mix counts) — AND water. Base Exp is 40 treats + 20 water at level 1, each
    // scaled by the same Level ^ 1.2 curve as everything else. Both must be met to level up
    // (like food AND water for the rest of the pets). Returns { treats, water } — see the
    // glider branches in input.js (feeding), ui.js (codex) and entities.js (progress bar).
    // Progress: treats eaten = honeyEaten + bananaEaten, water eaten = waterEaten.
    if (type === 'glider') {
        const curve = Math.pow(lvl, 1.2);
        return {
            treats: Math.floor(40 * curve),
            water:  Math.floor(20 * curve)
        };
    }

    // Base XP * (Level ^ 1.2) - Continuous scaling curve calculation matrix
    let reqValue = Math.floor(base * Math.pow(lvl, 1.2));
    
    // Single-resource pets (fed one item type, no food/water split): bee needs
    // flowers, bear needs honey, monkey needs bananas.
    if (type === 'bee' || type === 'bear' || type === 'monkey') {
        return reqValue;
    }
    
    if (type === 'elephant') {
        return { food: Math.floor(reqValue * 0.45), water: Math.floor(reqValue * 0.55) };
    }
    // Pig's spec'd requirement is 50 food / 30 water at level 1 (62.5%/37.5% split of the
    // base 80) rather than an even 50/50 split — everything else uses the same curve.
    if (type === 'pig') {
        return { food: Math.floor(reqValue * 0.625), water: Math.floor(reqValue * 0.375) };
    }
    return { food: Math.floor(reqValue * 0.5), water: Math.floor(reqValue * 0.5) };
}

// Pet foraging yield tiers: [minLevel, food, water]. To raise the level cap or tune
// balance, just add/edit a row here — order in the array doesn't matter, getForageYield()
// automatically finds the highest tier a pet's level qualifies for. Numeric yield only;
// non-numeric perks (dog digging, chicken egg-laying, pig mud-play, etc.) stay as their own
// `if (this.level >= X)` checks in Pet.update() since they're more than a food/water number.
const FORAGE_TIERS = {
    dog:      [ [1, 1, 1], [5, 2, 2], [10, 3, 3], [15, 4, 4], [20, 6, 6], [25, 7, 7], [30, 8, 8], [35, 9, 9], [40, 10, 10], [45, 11, 11], [50, 12, 12] ],
    cat:      [ [1, 1, 1], [5, 2, 2], [10, 3, 3], [15, 4, 4], [20, 5, 5], [25, 6, 6], [30, 7, 7], [35, 8, 8], [40, 9, 9], [45, 10, 10], [50, 10, 10] ],
    bird:     [ [1, 1, 1], [5, 2, 1], [10, 2, 2], [15, 3, 2], [20, 4, 3], [25, 5, 4], [30, 7, 6] ],
    panda:    [ [1, 3, 2], [5, 4, 3], [10, 5, 4], [15, 6, 5], [20, 8, 6], [25, 9, 8], [30, 10, 9] ],
    pig:      [ [1, 2, 2], [5, 3, 2], [10, 4, 3], [15, 5, 4], [20, 7, 6], [25, 7, 7], [30, 8, 9] ],
    // Both elephants share this row (the tiers are per type). Water is always the bigger number.
    elephant: [ [1, 1, 2], [5, 2, 4], [10, 3, 5], [15, 3, 6], [20, 5, 9], [25, 6, 10], [30, 7, 12], [35, 8, 13], [40, 8, 13], [45, 9, 14], [50, 10, 15] ],
    squirrel: [ [1, 1, 0], [5, 3, 1], [10, 5, 2], [15, 7, 2], [20, 9, 3], [25, 11, 3], [30, 13, 4] ],
    chicken:  [ [1, 1, 1], [5, 2, 1], [10, 2, 2], [15, 3, 2], [20, 3, 3], [25, 4, 3], [30, 5, 5], [35, 6, 5], [40, 6, 6], [45, 7, 6], [50, 8, 7] ],
    // Single-resource forager (bananas only, Region 8 never spawns water) -- the water
    // slot is always 0 and unused, kept only for shape consistency with getForageYield().
    monkey:   [ [1, 1, 0], [5, 2, 0], [10, 3, 0], [15, 4, 0], [20, 6, 0], [25, 7, 0], [30, 9, 0] ],
    // Sugar gliders (Region 9): food and water are always equal. Only used while a glider is
    // dropped in a food/water region (1, 2, 3, 6, 7) with stamina left -- see
    // GLIDER_FORAGE_REGIONS in world.js.
    glider:   [ [1, 2, 2], [5, 3, 3], [10, 4, 4], [15, 5, 5], [20, 7, 7], [25, 8, 8], [30, 10, 10] ]
};

// Special-perk chances, by pet perk and level: [minLevel, chance]. Same "highest tier the level
// qualifies for" lookup as FORAGE_TIERS (see getPerkChance). The code that rolls a perk and the
// Pet Detail text that describes it both read this, so a number can't drift between them.
const PERK_CHANCES = {
    dogDig:         [ [20, 0.10], [30, 0.15], [40, 0.20], [50, 0.25] ],   // dog: dig for a bonus coin
    dogDoubleCoin:  [ [30, 0.10], [40, 0.15], [50, 0.20] ],               // dog: chance a dig pays double coins
    catDouble:      [ [20, 0.10], [30, 0.12], [40, 0.15] ],               // cat: double the food/water gained
    catSchrodinger: [ [25, 0.03], [35, 0.04], [45, 0.05], [50, 0.06] ],   // cat: enter Schrodinger's box
    elephantPlay:   [ [20, 0.10], [30, 0.12] ],                           // elephants: "catch me" minigame
    squirrelBoost:  [ [20, 0.10], [30, 0.15] ],   // squirrel: speed boost for the whole region
    chickenEgg:     [ [20, 0.10], [35, 0.15], [45, 0.20] ],   // chicken: base chance to lay an egg (chain eggs add to this from Lv30)
    birdFly:        [ [20, 0.05], [30, 0.08] ],   // bird: fly off to another region
    pigMud:         [ [20, 0.05], [30, 0.08] ],   // pig: play in the mud
    pandaFever:     [ [20, 0.05], [30, 0.08] ],   // panda: Bamboo Fever
    monkeySwing:    [ [20, 0.05], [30, 0.08] ],   // monkey: swing on the vines
    beeDoubleHoney: [ [20, 0.10], [30, 0.12] ],   // bee: double honey when dropping off
    beeDoubleExp:   [ [20, 0.20] ],               // bee: double flower exp
    bearDoubleFish: [ [20, 0.10], [30, 0.15] ]    // bear: double catch
};

// The chance for one of the perks above at `level` (0 below its first tier).
function getPerkChance(key, level) {
    const tiers = PERK_CHANCES[key];
    if (!tiers) return 0;
    let chance = 0;
    for (let i = 0; i < tiers.length; i++) {
        if (level >= tiers[i][0]) chance = tiers[i][1];
    }
    return chance;
}

// How long the Lv20+ bird's trip to another region lasts, in REAL seconds (see the excursion
// branch of Pet.update()).
const BIRD_EXCURSION_SECONDS = 30;

// Squirrel's speed boost: how long it lasts (real seconds) and how much faster every pet in the
// region moves. See getRegionSpeedBoost() in world.js. Deliberately short, and a proc while a
// boost is already running is ignored (it does NOT extend it), so the region can never be kept
// boosted continuously — every boost ends before another can begin.
const SQUIRREL_BOOST_SECONDS = 10;
const SQUIRREL_BOOST_MULT = 1.5;

// Dog's dig perk (PERK_CHANCES.dogDig above): from Lv25 onward a successful dig awards this
// many coins instead of 1. See the 'digging' state payout in entities.js and the dog's Pet
// Detail perk list (getPetPerkDescriptions in ui.js) — both read these two constants so the
// level, the amount, and the description can't drift apart.
const DOG_DIG_BONUS_COIN_LEVEL = 25;
const DOG_DIG_BONUS_COIN_AMOUNT = 2;

// Elephant "catch me" game payout: [minLevel, coins] (highest tier the level reaches).
const ELEPHANT_PLAY_COIN_TIERS = [ [1, 5], [45, 6] ];
function getElephantPlayCoins(level) {
    let coins = ELEPHANT_PLAY_COIN_TIERS[0][1];
    for (let i = 0; i < ELEPHANT_PLAY_COIN_TIERS.length; i++) if (level >= ELEPHANT_PLAY_COIN_TIERS[i][0]) coins = ELEPHANT_PLAY_COIN_TIERS[i][1];
    return coins;
}

// Lv30 coin perk used by the pig's mud play (and, until the Lv50 rebalance, the dog's dig): from
// PLAY_COIN_PERK_LEVEL on there is a PLAY_COIN_PERK_DOUBLE_CHANCE chance the payout is doubled.
// Below the level, the caller's own base double chance applies (pig: 5%). The DOG now has its own
// PERK_CHANCES.dogDoubleCoin table (10% at Lv30 up to 20% at Lv50) instead of this constant.
const PLAY_COIN_PERK_LEVEL = 30;
const PLAY_COIN_PERK_DOUBLE_CHANCE = 0.25;

function getPlayCoinPayout(baseCoins, level, baseDoubleChance) {
    let coins = baseCoins;
    let doubleChance = baseDoubleChance || 0;
    if (level >= PLAY_COIN_PERK_LEVEL) doubleChance = PLAY_COIN_PERK_DOUBLE_CHANCE;
    if (Math.random() < doubleChance) coins *= 2;
    return coins;
}

// Chicken "chain egg": after a forage lays an egg, the NEXT forage gets `step` extra egg chance on
// top of the base; every further egg in a row adds it again, up to `max`. A forage that lays no
// egg resets it. Tiers: [minLevel, step, max] (highest tier the level reaches). See the chicken
// branch of Pet.update() and the chicken's perk list in ui.js.
const CHAIN_EGG_TIERS = [ [30, 0.10, 0.60], [40, 0.11, 0.70], [50, 0.12, 0.80] ];
const CHAIN_EGG_MIN_LEVEL = CHAIN_EGG_TIERS[0][0];
function getChainEgg(level) {
    let best = null;
    for (let i = 0; i < CHAIN_EGG_TIERS.length; i++) if (level >= CHAIN_EGG_TIERS[i][0]) best = CHAIN_EGG_TIERS[i];
    return best ? { step: best[1], max: best[2] } : null;
}

// Bee tiers: [minLevel, honeyCapacity, secondsToForageAFlower].
const BEE_TIERS = [ [1, 1, 5.0], [5, 2, 4.5], [10, 3, 4.0], [15, 4, 4.0], [20, 5, 3.5], [25, 6, 3.5], [30, 7, 3.0] ];
function getBeeTier(level) {
    let best = BEE_TIERS[0];
    for (let i = 0; i < BEE_TIERS.length; i++) {
        if (level >= BEE_TIERS[i][0]) best = BEE_TIERS[i];
    }
    return { capacity: best[1], forageSeconds: best[2] };
}

// Bear tiers: [minLevel, fishPerCycle] (before the double-catch chance / Fishy Business perk).
// Bears don't fish at all below Lv5.
const BEAR_FISH_TIERS = [ [5, 1], [10, 2], [20, 3], [25, 3], [30, 3] ];
function getBearFishPerCycle(level) {
    let fish = 0;
    for (let i = 0; i < BEAR_FISH_TIERS.length; i++) {
        if (level >= BEAR_FISH_TIERS[i][0]) fish = BEAR_FISH_TIERS[i][1];
    }
    return fish;
}

// How long the bear actively fishes once it reaches the lake (the 'fishing' state) — fixed,
// doesn't change by level.
const BEAR_FISHING_ACTION_SECONDS = 20;

// How long the bear waits between fishing trips: a random range of [base, base+spread]
// seconds that gets shorter at Lv10 and Lv15. Read by setNextFishingCooldown() (entities.js)
// and the bear's Pet Detail description (ui.js) so the numbers can't drift apart.
const BEAR_WAIT_TIERS = [ [1, 70, 20], [10, 60, 25], [15, 50, 30] ]; // [minLevel, base, spread]
function getBearWaitRange(level) {
    let range = BEAR_WAIT_TIERS[0];
    for (let i = 0; i < BEAR_WAIT_TIERS.length; i++) {
        if (level >= BEAR_WAIT_TIERS[i][0]) range = BEAR_WAIT_TIERS[i];
    }
    return { base: range[1], spread: range[2] };
}

// Sugar glider max stamina by level: [minLevel, maxStamina]. Same lookup idea as
// FORAGE_TIERS — add/edit a row to retune, order doesn't matter.
const GLIDER_STAMINA_TIERS = [ [1, 40], [5, 45], [10, 50], [15, 55], [20, 70], [25, 75], [30, 85] ];

function getGliderMaxStamina(level) {
    let best = GLIDER_STAMINA_TIERS[0];
    for (let i = 0; i < GLIDER_STAMINA_TIERS.length; i++) {
        if (level >= GLIDER_STAMINA_TIERS[i][0]) best = GLIDER_STAMINA_TIERS[i];
    }
    return best[1];
}

function getForageYield(type, level) {
    const tiers = FORAGE_TIERS[type];
    if (!tiers) return { food: 0, water: 0 };
    let best = tiers[0];
    for (let i = 0; i < tiers.length; i++) {
        if (level >= tiers[i][0]) best = tiers[i];
    }
    return { food: best[1], water: best[2] };
}

let currentRegion = 1;
let lastTime = 0;
const frameInterval = 1000 / 60;

// Lifetime totals (gameStats.lifetimeCoins / lifetimeDiamonds, shown on the Statistics screen) are
// kept by making `coins` and `diamonds` accessor properties: every `inventory.coins += n` anywhere in
// the game still works unchanged, and any INCREASE is also added to the lifetime total. Spending
// (a decrease) never lowers it. Loading a save or wiping sets the values with tracking paused (see
// lifetimeTrackingPaused), so a load never counts as "earning".
let lifetimeTrackingPaused = false;
// While true, the Region 10 coin bonus is skipped (see addCoinsUnboosted below).
let coinBoostSuspended = false;
// Adds coins WITHOUT the Region 10 garden bonus (shop sales, the dev +500 gold button). Still counts
// toward lifetime coins like any other income.
function addCoinsUnboosted(n) {
    coinBoostSuspended = true;
    try { inventory.coins += n; } finally { coinBoostSuspended = false; }
}
const inventory = {
    food: 0,
    water: 0,
    honey: 0,
    fish: 0,
    _coins: 0,
    eggs: 0,
    bananas: 0,
    soil: 0,        // 🪴 Region 10: soil CHARGES left (a bag from the shop adds 1; fertilizing a plot uses 1)
    seeds: 0,       // 🌱 Region 10: flower seeds (one is planted when a plot is fertilized)
    _coinCarry: 0,  // fractional part of the Flower Garden coin bonus, so a +10% on small payouts isn't lost
    _diamonds: 0,   // 💎 earned from achievements (see ANIMAL_TAMER_TIERS)
    get coins() { return this._coins; },
    set coins(v) {
        let gain = v - this._coins;
        // Region 10 bonus: +10% PER watered, fully grown hydrangea on every coin PAYOUT (a positive
        // change). Spending (negative change), loading a save (lifetimeTrackingPaused) and anything
        // wrapped in addCoinsUnboosted() (shop sales, the dev gold button) are never boosted. The extra counts toward lifetime coins too.
        if (gain > 0 && !lifetimeTrackingPaused && !coinBoostSuspended && typeof getGardenCoinBoost === 'function') {
            const m = getGardenCoinBoost();
            if (m > 1) {
                this._coinCarry += gain * (m - 1);
                const extra = Math.floor(this._coinCarry + 1e-9);
                if (extra > 0) { this._coinCarry -= extra; v += extra; gain += extra; }
            }
        }
        if (gain > 0 && !lifetimeTrackingPaused) gameStats.lifetimeCoins += gain;
        this._coins = v;
    },
    get diamonds() { return this._diamonds; },
    set diamonds(v) {
        const gain = v - this._diamonds;
        if (gain > 0 && !lifetimeTrackingPaused) gameStats.lifetimeDiamonds += gain;
        this._diamonds = v;
    }
};

// NEW: Core Character Database Profile Properties
let character = {
    name: 'Player',
    model: 'female', // which PLAYER_MODELS sprite set to draw (see entities.js); 'female' or 'male'
    level: 1,
    xp: 0,
    perkPoints: 0,   // unspent points — +1 per level gained (see gainPlayerXP)
    perks: []        // ids of unlocked PERK_TREE nodes
};

// Character XP needed to get from `currentLevel` to the next one. Level 1 needs the base (100 XP)
// and every level after that needs 300% of the BASE more than the one before (a straight line, not
// compounding): 100, 400, 700, 1,000 ... 3,100 at Lv11, 6,100 at Lv21, 10,300 at Lv35. History: the
// original was 100 x level^0.6; a compounding 1.5^(lvl-1) version reached ~97 million XP per level
// by Lv35 so it was replaced. The step is tuned with the balance simulation (balance/) so the whole
// Perk Tree (31 perks, 72 points = character Lv73) is unlocked at about the 10-hour mark of a full
// playthrough. Change CHARACTER_XP_BASE / CHARACTER_XP_STEP to rebalance, then re-run balance/report.js.
const CHARACTER_XP_BASE = 100;
const CHARACTER_XP_STEP = 3;     // each level adds this fraction of the base
function getCharacterNextXP(currentLevel) {
    const lvl = Math.max(1, Math.floor(Number(currentLevel)) || 1);
    return Math.floor(CHARACTER_XP_BASE * (1 + CHARACTER_XP_STEP * (lvl - 1)));
}

// ------------------------------------------------------------
// PERK TREE — character perks the player chooses to unlock (MENU -> 🌳 PERK TREE).
// ------------------------------------------------------------
// The player earns 1 perk point per character level gained and spends points to unlock a
// node. A node can be unlocked when BOTH hold (see getPerkStatus):
//   1. every perk in `requires` (the connected node(s) below it) is already unlocked, and
//   2. there are enough perk points for its `cost`.
// There are NO character-level requirements: a perk is locked only by the perk beneath it.
//
// Two tables:
//  - PERK_TYPES: what each named perk IS — name, icon, cost, and effect (`stat` + `add`).
//    Change a perk's price or strength here and every node of that type follows.
//  - PERK_TREE_LAYOUT: WHERE nodes sit. `tier` = row (0 = the bottom/root row, growing
//    upward), `col` = column (0..PERK_TREE_COLS-1, left to right), `requires` = the id of
//    the node it grows out of. A row can also override any type property (e.g. a different
//    `cost` for one specific node). To add perks (e.g. for later levels), append rows with
//    the next tier numbers — the tree screen (ui.js) sizes and scrolls itself.
// A node must be listed AFTER everything in its `requires` (normalizeCharacterPerks relies
// on it); sorting by tier already guarantees that.
const PERK_TREE_COLS = 5;

const PERK_TYPES = {
    // `desc` (no number) is what the Character screen's bulked perk summary uses — see
    // updateCharacterScreen() in ui.js — since that view combines every unlocked node of a
    // type into one line with a SUMMED percentage, so it can't just reuse `text`, which is
    // one specific node's own fixed +NN%. The Perk Tree screen itself still shows each
    // node's own individual `text` unchanged — this doesn't touch that.
    basicResource: { name: 'Basic Resource', icon: '🍪💧', cost: 1,  stat: 'petFoodWater', add: 0.15, text: '+15% food & water gained from pets', desc: 'food & water gained from pets' },
    glazed:        { name: 'Glazed',         icon: '🍯',   cost: 3,  stat: 'petHoney',     add: 0.10, text: '+10% honey gained from pets',        desc: 'honey gained from pets' },
    fishyBusiness: { name: 'Fishy Business', icon: '🐟',   cost: 2,  stat: 'petFish',      add: 0.12, text: '+12% fish gained from pets',         desc: 'fish gained from pets' },
    riches:        { name: 'Riches',         icon: '🪙',   cost: 5,  stat: 'coin',         add: 0.10, text: '+10% coin gained',                   desc: 'coin gained' },
    bananas:       { name: 'Bananas!',       icon: '🍌',   cost: 2,  stat: 'petBanana',    add: 0.12, text: '+12% bananas gained from pets',      desc: 'bananas gained from pets' }
};

// Ids are `<type>_c<col>t<tier>` (by the node's ORIGINAL position). They're stored in
// saves, so never reuse or rename one — add new nodes with new ids instead.
const PERK_TREE_LAYOUT = [
    // Tier 0 — the root, alone on its row. Everything else grows out of it.
    { id: 'basicResource_c2t0', type: 'basicResource', tier: 0, col: 2, requires: [] },

    // Tier 1 — five branch starters, all growing out of the root.
    { id: 'basicResource_c0t1', type: 'basicResource', tier: 1, col: 0, requires: ['basicResource_c2t0'] },
    { id: 'glazed_c1t1',        type: 'glazed',        tier: 1, col: 1, requires: ['basicResource_c2t0'] },
    { id: 'basicResource_c2t1', type: 'basicResource', tier: 1, col: 2, requires: ['basicResource_c2t0'] },
    { id: 'fishyBusiness_c3t1', type: 'fishyBusiness', tier: 1, col: 3, requires: ['basicResource_c2t0'] },
    { id: 'basicResource_c4t1', type: 'basicResource', tier: 1, col: 4, requires: ['basicResource_c2t0'] },

    // Tier 2 — each column continues straight upward.
    { id: 'bananas_c0t2',       type: 'bananas',       tier: 2, col: 0, requires: ['basicResource_c0t1'] },
    { id: 'riches_c1t2',        type: 'riches',        tier: 2, col: 1, requires: ['glazed_c1t1'] },
    { id: 'glazed_c2t2',        type: 'glazed',        tier: 2, col: 2, requires: ['basicResource_c2t1'] },
    { id: 'basicResource_c3t2', type: 'basicResource', tier: 2, col: 3, requires: ['fishyBusiness_c3t1'] },
    { id: 'glazed_c4t2',        type: 'glazed',        tier: 2, col: 4, requires: ['basicResource_c4t1'] },

    // Tier 3
    { id: 'riches_c0t3',        type: 'riches',        tier: 3, col: 0, requires: ['bananas_c0t2'] },
    { id: 'fishyBusiness_c1t3', type: 'fishyBusiness', tier: 3, col: 1, requires: ['riches_c1t2'] },
    { id: 'basicResource_c2t3', type: 'basicResource', tier: 3, col: 2, requires: ['glazed_c2t2'] },
    { id: 'riches_c3t3',        type: 'riches',        tier: 3, col: 3, requires: ['basicResource_c3t2'] },
    { id: 'bananas_c4t3',       type: 'bananas',       tier: 3, col: 4, requires: ['glazed_c4t2'] },

    // Tier 4 — Basic Resource / Glazed / Fishy Business / Bananas! / Glazed
    { id: 'basicResource_c0t4', type: 'basicResource', tier: 4, col: 0, requires: ['riches_c0t3'] },
    { id: 'glazed_c1t4',        type: 'glazed',        tier: 4, col: 1, requires: ['fishyBusiness_c1t3'] },
    { id: 'fishyBusiness_c2t4', type: 'fishyBusiness', tier: 4, col: 2, requires: ['basicResource_c2t3'] },
    { id: 'bananas_c3t4',       type: 'bananas',       tier: 4, col: 3, requires: ['riches_c3t3'] },
    { id: 'glazed_c4t4',        type: 'glazed',        tier: 4, col: 4, requires: ['bananas_c4t3'] },

    // Tier 5 — Fishy Business / Basic Resource / Glazed / Riches / Basic Resource
    { id: 'fishyBusiness_c0t5', type: 'fishyBusiness', tier: 5, col: 0, requires: ['basicResource_c0t4'] },
    { id: 'basicResource_c1t5', type: 'basicResource', tier: 5, col: 1, requires: ['glazed_c1t4'] },
    { id: 'glazed_c2t5',        type: 'glazed',        tier: 5, col: 2, requires: ['fishyBusiness_c2t4'] },
    { id: 'riches_c3t5',        type: 'riches',        tier: 5, col: 3, requires: ['bananas_c3t4'] },
    { id: 'basicResource_c4t5', type: 'basicResource', tier: 5, col: 4, requires: ['glazed_c4t4'] },

    // Tier 6 (top row) — Glazed / Basic Resource / Bananas! / Glazed / Fishy Business
    { id: 'glazed_c0t6',        type: 'glazed',        tier: 6, col: 0, requires: ['fishyBusiness_c0t5'] },
    { id: 'basicResource_c1t6', type: 'basicResource', tier: 6, col: 1, requires: ['basicResource_c1t5'] },
    { id: 'bananas_c2t6',       type: 'bananas',       tier: 6, col: 2, requires: ['glazed_c2t5'] },
    { id: 'glazed_c3t6',        type: 'glazed',        tier: 6, col: 3, requires: ['riches_c3t5'] },
    { id: 'fishyBusiness_c4t6', type: 'fishyBusiness', tier: 6, col: 4, requires: ['basicResource_c4t5'] }
];

// Flat list the rest of the game reads: each layout row merged over its type.
const PERK_TREE = PERK_TREE_LAYOUT.map(row => Object.assign({}, PERK_TYPES[row.type], row));

const PERK_BY_ID = {};
PERK_TREE.forEach(p => { PERK_BY_ID[p.id] = p; });

// Perk ids used by the first version of the tree, when perks were named by the character
// level they used to unlock at. Saves may still contain them; they're renamed on load.
const LEGACY_PERK_IDS = {
    lv5:  'basicResource_c2t0',
    lv10: 'glazed_c1t1',
    lv15: 'basicResource_c2t1',
    lv20: 'fishyBusiness_c3t1',
    lv25: 'riches_c1t2',
    lv30: 'glazed_c2t2',
    lv35: 'basicResource_c3t2',
    lv40: 'fishyBusiness_c1t3',
    lv45: 'basicResource_c2t3',
    lv50: 'riches_c3t3'
};

function hasPerk(id) {
    return character.perks.indexOf(id) !== -1;
}

// Why a perk can or can't be unlocked right now, in priority order:
//   'unlocked'    already taken
//   'locked'      the perk it grows out of (below it) hasn't been unlocked yet
//   'needsPoints' the perk below is unlocked but there aren't enough perk points
//   'available'   can be unlocked right now
function getPerkStatus(perk) {
    if (hasPerk(perk.id)) return 'unlocked';
    if (!perk.requires.every(hasPerk)) return 'locked';
    if (character.perkPoints < perk.cost) return 'needsPoints';
    return 'available';
}

// Spends the points and unlocks the perk. Returns true on success. Re-validates
// everything itself, so it's safe to call from anywhere (the UI's disabled button is a
// convenience, not the actual rule).
function unlockPerk(id) {
    const perk = PERK_BY_ID[id];
    if (!perk || getPerkStatus(perk) !== 'available') return false;
    character.perkPoints -= perk.cost;
    character.perks.push(perk.id);
    saveGameProgress();
    return true;
}

// Makes sure `character` has valid perk data — called after a save is loaded, because
// loading replaces the whole `character` object with whatever was stored.
//  - Saves from before the perk tree existed have no `perks` array. They get one point
//    for every level already gained (level - 1) and NO perks unlocked: the old automatic
//    level-milestone bonuses are gone, and the player now spends those points in the tree.
//  - Otherwise the stored data is sanity-checked: legacy "lvN" ids are renamed (see
//    LEGACY_PERK_IDS), unknown ids and duplicates are dropped, a perk whose prerequisite
//    isn't unlocked is dropped, and bad point counts become 0. Perks and points that are
//    already saved are kept as-is (unlocked perks aren't re-charged if prices change).
function normalizeCharacterPerks() {
    if (!Array.isArray(character.perks)) {
        character.perks = [];
        character.perkPoints = Math.max(0, Math.floor(Number(character.level) || 1) - 1);
        return;
    }
    const saved = new Set(character.perks.map(id => LEGACY_PERK_IDS[id] || id));
    const kept = [];
    PERK_TREE.forEach(p => {
        if (saved.has(p.id) && p.requires.every(r => kept.indexOf(r) !== -1)) kept.push(p.id);
    });
    character.perks = kept;

    const pts = Math.floor(Number(character.perkPoints));
    character.perkPoints = (isFinite(pts) && pts > 0) ? pts : 0;
}

// Character bonuses, as multipliers (1.0 = no bonus). The perk-driven ones are the sum of
// every UNLOCKED perk in PERK_TREE; manual gathering is the one non-perk bonus (a flat
// +10% per character level, always on).
// Single source of truth — entities.js (pet foraging) and world.js (manual pickup) both
// call this instead of each keeping their own copy, and the Character screen (ui.js)
// reads it too, so the displayed bonuses can never drift out of sync with what's
// actually applied in gameplay.
function getCharacterBonuses(level) {
    let bonuses = { petFoodWater: 1.0, petHoney: 1.0, petFish: 1.0, petBanana: 1.0, coin: 1.0 };

    character.perks.forEach(id => {
        const perk = PERK_BY_ID[id];
        if (perk && bonuses[perk.stat] !== undefined) bonuses[perk.stat] += perk.add;
    });

    bonuses.manualGather = 1 + (level * 0.10);
    return bonuses;
}

// Rounds x to a whole number so that the AVERAGE result equals x: 1.2 becomes 1, or 2 with a
// 20% chance. Used for the Bananas! perk, because the monkey's forage yields are tiny
// (1-6) and plain Math.round would make a +20% bonus do nothing at low yields.
function roundStochastic(x) {
    const whole = Math.floor(x);
    return whole + (Math.random() < (x - whole) ? 1 : 0);
}

// ------------------------------------------------------------
// SHOP — what's for sale, what's bought, and what selling pays.
// ------------------------------------------------------------
// Cake and Wisdom Potion are TIMED buffs: buying one starts a 3-minute countdown
// (`item.duration`, in seconds). `shopBuffs[id]` is the time remaining — 0 means inactive.
// It's ticked down once per frame by tickShopBuffs() from the game loop (main.js) using the
// real wall clock, so "3 minutes" is 3 real minutes. It only counts frames that actually
// render, so it pauses while the app is backgrounded/closed instead of draining.
// The remaining time is saved (see saveGameProgress/loadGameProgress below).
// A buff can't be re-bought while it's still active (the shop shows its countdown instead).
const shopBuffs = {
    cake: 0,
    wisdomPotion: 0
};

// Data-driven so adding a new item later is one new row here — ui.js builds the Buy tab
// straight from this list. `id` must match a key in `shopBuffs` above; `duration` is in seconds.
const SHOP_ITEMS = [
    { id: 'cake',         icon: '🍰', name: 'Cake',          cost: 200, duration: 180, desc: 'Increases all pets\' speed and foraging speed by 50%.' },
    { id: 'wisdomPotion', icon: '🧪', name: 'Wisdom Potion', cost: 500, duration: 180, desc: 'Increases the exp the character gains by 50%.' }
];

// Gold paid per unit sold. Keys are `inventory` keys, so the Sell tab (ui.js) can read
// the owned count and deduct straight from `inventory[key]`.
const SELL_ITEMS = [
    { key: 'eggs', icon: '🥚', name: 'Eggs', price: 1 },
    { key: 'fish', icon: '🐟', name: 'Fish', price: 2 }
];

// Consumables for the Region 10 flower garden, sold on the Buy tab. Unlike SHOP_ITEMS these are not
// timed buffs: buying adds `gives` units to `inventory[key]`. A bag of soil is 1 charge.
const SHOP_SUPPLIES = [
    { key: 'soil',  icon: '🪴', name: 'Bag of Soil',   cost: 200, gives: 1, desc: '1 use — each use turns one garden plot in Region 10 from hard clay into soil.' },
    { key: 'seeds', icon: '🌱', name: 'Flower Seed',   cost: 300, gives: 1, desc: 'One hydrangea seed. Planted when you fertilize a plot in Region 10.' }
];

// Selling gold in the shop: this much gold buys exactly 1 diamond.
const GOLD_PER_DIAMOND = 1000;

function isShopBuffActive(id) { return shopBuffs[id] > 0; }

// ------------------------------------------------------------------
// UNLOCKABLES — how regions and most extra pets are obtained (the shop's "Unlockables" tab).
// Nothing is unlocked by pet levels any more: the game starts with Regions 1-3 and only
// their first pets (Dog / Elephant / Squirrel + Chicken); everything else is bought with
// gold coins. Data-driven like SHOP_ITEMS above — the tab (ui.js) builds its rows from this
// list, so a new unlockable is one new row. Fields:
//   id      — key in `unlockedIds`, also what a pet's `shopId` (world.js) refers to
//   kind    — 'region' (opens the region AND brings its starter pet(s) along) or 'pet'
//             (one extra pet that lives in `region`)
//   region  — the region it opens / lives in
// A 'pet' in Region 4+ can only be bought once that region is owned (nothing would show it).
// ------------------------------------------------------------------
const UNLOCKABLES = [
    { id: 'pet_cat',         kind: 'pet',    region: 1, icon: '🐱', name: 'Cat',          cost: 100, desc: 'Joins Region 1. Arrives wild (Lv1) — tame it at Lv2 like the others.' },
    { id: 'pet_bowElephant', kind: 'pet',    region: 2, icon: '🐘', name: 'Bow Elephant', cost: 50,  desc: 'Joins Region 2 (white bow). Arrives wild (Lv1).' },
    { id: 'pet_bird',        kind: 'pet',    region: 3, icon: '🐦', name: 'Bird',         cost: 100, desc: 'Joins Region 3. Arrives wild (Lv1).' },

    { id: 'region_4',        kind: 'region', region: 4, icon: '🐝', name: 'Region 4 — Beehive',    cost: 60,  desc: 'Unlocks Region 4 and comes with your first Bee. More bees can be bought at the hive (30 🪙 each, max 5).' },

    { id: 'region_5',        kind: 'region', region: 5, icon: '🐻', name: 'Region 5 — Bear Lake',  cost: 150, desc: 'Unlocks Region 5 and comes with the Bear (Lv1 — needs Lv2 to be tamed).' },
    { id: 'pet_bowBear',     kind: 'pet',    region: 5, icon: '🐻', name: 'Bow Bear',     cost: 100, desc: 'Joins Region 5. Arrives wild (Lv1).' },

    { id: 'region_6',        kind: 'region', region: 6, icon: '🐷', name: 'Region 6 — Pig Sty',    cost: 150, desc: 'Unlocks Region 6 and comes with the Pig (Lv1 — needs Lv2 to be tamed).' },
    { id: 'pet_mudPig',      kind: 'pet',    region: 6, icon: '🐖', name: 'Mud Pig',      cost: 100, desc: 'Joins Region 6. Arrives wild (Lv1).' },

    { id: 'region_7',        kind: 'region', region: 7, icon: '🐼', name: 'Region 7 — Panda Habitat', cost: 300, desc: 'Unlocks Region 7 and comes with the Panda (Lv1 — needs Lv2 to be tamed).' },

    { id: 'region_8',        kind: 'region', region: 8, icon: '🐵', name: 'Region 8 — Monkey Jungle', cost: 250, desc: 'Unlocks Region 8 and comes with the Monkey (Lv1 — needs Lv2 to be tamed).' },
    { id: 'pet_bowMonkey',   kind: 'pet',    region: 8, icon: '🙈', name: 'Bow Monkey',   cost: 150, desc: 'Joins Region 8 (green bow). Arrives wild (Lv1).' },

    { id: 'region_9',        kind: 'region', region: 9, icon: '🛏️', name: 'Region 9 — Bedroom',    cost: 500, desc: 'Unlocks Region 9 and comes with the Sugar Glider, already tamed at Lv1.' },
    { id: 'pet_missGlider',  kind: 'pet',    region: 9, icon: '🎀', name: 'Miss Glider',  cost: 350, desc: 'A second sugar glider with a red bow, already tamed at Lv1.' },

    { id: 'region_10',       kind: 'region', region: 10, icon: '🌸', name: 'Region 10 — Flower Garden', cost: 1000, desc: 'Unlocks Region 10 with your first garden plot. Grow hydrangeas (soil + seeds from the Buy tab, plus lots of water) for +10% coins and +10% bee speed per watered flower (stacks). Gliders cannot be dropped here.' }
];

// Which unlockables the player owns: id -> true. Empty at the start of a new game.
// Saved as an array of ids (see saveGameProgress / loadGameProgress).
const unlockedIds = {};

function isUnlockOwned(id) { return !!unlockedIds[id]; }

function getUnlockable(id) {
    for (let i = 0; i < UNLOCKABLES.length; i++) {
        if (UNLOCKABLES[i].id === id) return UNLOCKABLES[i];
    }
    return null;
}

// Regions 1-3 are always open; every other region must have been bought.
function isRegionOwned(r) {
    return (r >= 1 && r <= 3) || isUnlockOwned('region_' + r);
}

// Whether a pet is in the game yet. Pets sold separately carry a `shopId` (tagged in
// world.js); one that hasn't been bought is not updated, drawn, fed, whistled or shown in the
// Codex. Pets without a shopId (the starters, and the ones that come with a region) are always
// "available" — whether they're reachable at all is then just down to their region.
function isPetAvailable(pet) {
    return !pet || !pet.shopId || isUnlockOwned(pet.shopId);
}

// Why an unlockable can't be bought right now, or null if it can. (The buttons are also
// disabled in the UI; this is the authoritative check.)
function getUnlockableBlockReason(u) {
    if (!u) return 'unknown';
    if (isUnlockOwned(u.id)) return 'owned';
    if (u.kind === 'pet' && !isRegionOwned(u.region)) return 'region';
    if (inventory.coins < u.cost) return 'coins';
    return null;
}

function buyUnlockable(id) {
    const u = getUnlockable(id);
    if (getUnlockableBlockReason(u) !== null) return false;
    inventory.coins -= u.cost;
    unlockedIds[id] = true;
    saveGameProgress();
    return true;
}

// Bees bought at the hive (Region 4): the first one comes with the region for free, the
// rest cost this each, up to HIVE_MAX_BEES total (see countHiveBees()/spawnBeeBtn wiring
// in world.js and ui.js — all four read this one constant, so the cap can't drift between
// the buy-button lock, its display toggle, and the shop's own description text below).
const BEE_COST = 30;
const HIVE_MAX_BEES = 5;

// The OLD unlock rules — regions used to open by pet levels. Kept ONLY so a save made
// before the shop existed can be grandfathered in (see loadGameProgress): a player who had
// already earned a region keeps it, and the pets in it, instead of being locked out or made to
// pay for something they already had.
function legacyRegionUnlocked(r) {
    if (r >= 1 && r <= 3) return true;
    const allAtLeast = (from, to, lvl) => {
        for (let rr = from; rr <= to; rr++) {
            if (!Array.isArray(petsByRegion[rr]) || petsByRegion[rr].length === 0) return false;
            for (let i = 0; i < petsByRegion[rr].length; i++) {
                if (petsByRegion[rr][i].level < lvl) return false;
            }
        }
        return true;
    };
    if (r >= 4 && r <= 6) return allAtLeast(1, 3, 2);
    if (r >= 7 && r <= 9) return allAtLeast(1, 3, 10) && allAtLeast(4, 6, 5);
    return false;
}

// Called once per frame from gameLoop(). Deliberately does NOT use the loop's own `dt`:
// gameLoop()'s dt over-counts elapsed time (it re-adds the leftover sub-frame remainder
// each frame, so game time can run noticeably faster than real time), which would make a
// "3 minute" buff last less than 3 real minutes. A gap bigger than 0.25s means the app was
// backgrounded/frozen, so it's clamped rather than allowed to drain the buff.
let shopBuffLastTick = null;
function tickShopBuffs() {
    const now = performance.now();
    let dt = (shopBuffLastTick === null) ? 0 : (now - shopBuffLastTick) / 1000;
    shopBuffLastTick = now;
    if (dt > 0.25) dt = 0.25;
    gameStats.playSeconds += dt;   // total time played: only frames that actually render, so it pauses while backgrounded
    tickTasks();

    SHOP_ITEMS.forEach(item => {
        if (shopBuffs[item.id] > 0) {
            shopBuffs[item.id] -= dt;
            if (shopBuffs[item.id] <= 0) {
                shopBuffs[item.id] = 0;
                showBuffExpiredToast(item);
            }
        }
    });
}

// 165.2 -> "2:46". Rounds up so the display never shows 0:00 while the buff is still on.
function formatBuffTime(seconds) {
    let s = Math.ceil(seconds);
    return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0');
}

// Non-blocking "it wore off" notice (same approach as showLevelUpToast below).
function showBuffExpiredToast(item) {
    let toast = document.getElementById('buffToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'buffToast';
        toast.style.cssText = `
            position: fixed; top: 26%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.85); color: #fff; font-family: monospace;
            font-weight: bold; font-size: 13px; padding: 9px 16px;
            border: 2px solid #95a5a6; border-radius: 8px; z-index: 9999;
            pointer-events: none; text-align: center;
            transition: opacity 0.35s ease; opacity: 0;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = `${item.icon} ${item.name} has worn off`;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 2200);
}

// Buff multipliers. Everything that needs to know whether a shop buff is active asks
// one of these instead of reading `shopBuffs` directly, so the "+50%" numbers live
// in exactly one place. (They read the timer live, so they switch off the instant it expires.)
function getPetSpeedMultiplier()   { return isShopBuffActive('cake') ? 1.5 : 1; }
function getPetForageMultiplier()  { return isShopBuffActive('cake') ? 1.5 : 1; }
function getXPMultiplier()         { return isShopBuffActive('wisdomPotion') ? 1.5 : 1; }

// Global Core XP Injection Engine Function
function gainPlayerXP(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return;

    // Wisdom Potion: +50% XP. character.xp is allowed to hold fractions (a 1-XP grant
    // becomes 1.5) — rounding each grant instead would erase the bonus on the common
    // "+1 per item" grants. Every place that *displays* xp floors it.
    amount *= getXPMultiplier();

    character.xp += amount;
    let nextNeeded = getCharacterNextXP(character.level);
    let leveledUp = false;

    // Evaluate level ups silently inside memory first to prevent layout locks
    while (character.xp >= nextNeeded) {
        character.xp -= nextNeeded;
        character.level++;
        character.perkPoints++;   // 1 perk point per level gained (spent in the Perk Tree)
        nextNeeded = getCharacterNextXP(character.level);
        leveledUp = true;
    }

    // Always update the UI/XP bar immediately — never skip or delay this.
    updateUI();

    if (leveledUp) {
        saveGameProgress();
        // Non-blocking toast instead of alert(): alert() freezes the JS thread and
        // steals touch focus, which was causing held-down feed/collect actions to
        // keep firing (draining resources) without granting XP while the dialog was up.
        showLevelUpToast(character.level);
    } else {
        const charXP = document.getElementById('charXP');
        if (charXP) charXP.textContent = Math.floor(character.xp);
    }
}

// Non-blocking level-up notification. Does not pause the game loop or steal input focus,
// so held buttons (e.g. GIVE) keep receiving their pointerup/touchend events normally.
function showLevelUpToast(level) {
    let toast = document.getElementById('levelUpToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'levelUpToast';
        toast.style.cssText = `
            position: fixed; top: 18%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.85); color: #f1c40f; font-family: monospace;
            font-weight: bold; font-size: 14px; padding: 10px 18px;
            border: 2px solid #f1c40f; border-radius: 8px; z-index: 9999;
            pointer-events: none; text-align: center;
            transition: opacity 0.35s ease; opacity: 0;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = `⭐ LEVEL UP! Character Level ${level}!`;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => {
        toast.style.opacity = '0';
    }, 1600);
}

// ------------------------------------------------------------
// ACHIEVEMENTS & STATISTICS (MENU -> 🏆 ACHIEVEMENTS / 📊 STATISTICS)
// ------------------------------------------------------------
// Diamonds 💎 are a new resource (inventory.diamonds) that achievements pay out. Nothing spends
// them yet. Rewards are NOT automatic: when a tier's goal is reached the Achievements screen shows
// it as a box the player taps to claim (claimAnimalTamerTier()).
//
// "Animal Tamer" is a ladder of tiers. Only the current tier shows: 0/1 -> at 1/1 the player claims
// it and the next tier starts at 1/3 (if that is already met too it is claimed next, and so on).
// `claimed` (saved) is how many tiers have been claimed; the
// number of pets tamed is NOT saved — it is recounted from the pets themselves, so it can never
// drift. Edit a row to retune a goal or a reward; add a row to add a tier.
const ANIMAL_TAMER_TIERS = [
    { goal: 1,  reward: 1 },
    { goal: 3,  reward: 2 },
    { goal: 5,  reward: 4 },
    { goal: 7,  reward: 6 },
    { goal: 9,  reward: 8 },
    { goal: 11, reward: 10 },
    { goal: 13, reward: 10 },
    { goal: 15, reward: 10 },
    { goal: 17, reward: 15 }
];

// "Schrodinger's Cat": guess correctly in the cat's Dead-or-Alive mini game. Same ladder idea; the
// count IS saved (gameStats.catGuessesCorrect) because it can't be recounted from anything.
const SCHRODINGER_TIERS = [
    { goal: 1,  reward: 1 },
    { goal: 3,  reward: 2 },
    { goal: 6,  reward: 3 },
    { goal: 10, reward: 5 },
    { goal: 15, reward: 5 },
    { goal: 20, reward: 5 },
    { goal: 30, reward: 5 },
    { goal: 45, reward: 10 },
    { goal: 70, reward: 15 }
];

// saved; playSeconds ticked by tickShopBuffs() below; lifetimeCoins/lifetimeDiamonds are fed by the
// inventory.coins / inventory.diamonds setters (top of this file)
const gameStats = { playSeconds: 0, catGuessesCorrect: 0, lifetimeCoins: 0, lifetimeDiamonds: 0 };

// Every achievement in the game. To add one: add its tier table + a row here (title, description,
// and getCount = how far along the player is); the Achievements/Statistics screens and the save
// code are all driven by this list. Each achievement's `claimed` (tiers already paid) is saved.
// The tiers of one achievement are levels of it, not separate achievements; it counts as
// accomplished (Statistics "x/ACHIEVEMENT_TOTAL") once every tier is claimed.
const ACHIEVEMENT_DEFS = [
    { id: 'animalTamer',     icon: '🐾', title: 'Animal Tamer',      tiers: ANIMAL_TAMER_TIERS,
      desc: 'Tame pets to earn 💎 diamonds. Tap a completed level to claim it.',
      getCount: () => getTamedPetCount() },
    { id: 'schrodingersCat', icon: '🐱', title: "Schrodinger's Cat", tiers: SCHRODINGER_TIERS,
      desc: "Guess correctly in the cat's Dead or Alive mini game. Tap a completed level to claim it.",
      getCount: () => gameStats.catGuessesCorrect }
];
const ACHIEVEMENT_TOTAL = ACHIEVEMENT_DEFS.length;

const achievements = {};   // saved (see saveGameProgress): { <id>: { claimed } }
ACHIEVEMENT_DEFS.forEach(d => { achievements[d.id] = { claimed: 0 }; });

// The 17 pets the Pets Codex lists: every pet in petsByRegion except the extra bees bought at the
// hive (only the starter bee is a Codex entry), with the bird taken from birdPet (it can be visiting
// another region's array while on an excursion) plus the two sugar gliders.
function getCodexPets() {
    const list = [];
    if (typeof petsByRegion === 'undefined') return list;
    for (const r in petsByRegion) {
        petsByRegion[r].forEach((p, i) => {
            if (p.type === 'bird') return;
            if (p.type === 'bee' && i > 0) return;
            list.push(p);
        });
    }
    if (typeof birdPet !== 'undefined' && birdPet) list.push(birdPet);
    if (typeof gliderPets !== 'undefined') gliderPets.forEach(g => list.push(g));
    return list;
}

// Same rule as the Pets Codex's TAMED label: pets that arrive wild (Lv1) are tamed at Lv2; the
// bee and the sugar gliders are tamed from the start. A pet that isn't in the game yet (its region
// or shop unlock isn't bought) is not tamed.
function isPetTamed(p) {
    if (!p || !isPetAvailable(p)) return false;
    const region = (p.type === 'glider') ? 9 : (p.homeRegion || p.region);
    if (region && !isRegionOwned(region)) return false;
    if (p.type === 'bee' || p.type === 'glider') return true;
    return p.level >= 2;
}

function getTamedPetCount() {
    return getCodexPets().filter(isPetTamed).length;
}

function getAchievementDef(id) {
    return ACHIEVEMENT_DEFS.find(d => d.id === id) || null;
}

// Where one achievement's ladder stands: `count` = progress so far, `claimed` = tiers paid, `tier` =
// the tier being worked on (null when every tier is done).
function getAchievementProgress(id) {
    const def = getAchievementDef(id);
    if (!def) return null;
    const count = Math.max(0, Math.floor(Number(def.getCount())) || 0);
    const claimed = Math.max(0, Math.min(def.tiers.length, Math.floor(Number(achievements[id].claimed)) || 0));
    return { def: def, count: count, claimed: claimed, tier: def.tiers[claimed] || null, done: claimed >= def.tiers.length,
             claimable: claimed < def.tiers.length && count >= def.tiers[claimed].goal };
}

function getAchievementsDoneCount() {
    return ACHIEVEMENT_DEFS.filter(d => getAchievementProgress(d.id).done).length;
}

// Claims the current tier of an achievement: only works once its goal has been reached, pays its
// diamonds, and moves on to the next tier (which may already be complete too — the player then
// claims that one as well, one tap per tier). Returns the diamonds paid (0 if nothing to claim).
// Rewards are NEVER paid automatically: the Achievements screen shows a completed tier as a box
// the player taps. A save from before an achievement existed simply finds its earned tiers waiting.
function claimAchievementTier(id) {
    if (typeof petsByRegion === 'undefined') return 0;
    const p = getAchievementProgress(id);
    if (!p || p.done || p.count < p.tier.goal) return 0;
    inventory.diamonds += p.tier.reward;
    achievements[id].claimed = p.claimed + 1;
    saveGameProgress();
    showAchievementToast(`🏆 ${p.def.title} ${p.tier.goal}/${p.tier.goal}  +${p.tier.reward} 💎`);
    updateUI();
    return p.tier.reward;
}

// Called by the cat's Dead-or-Alive mini game (ui.js) on every correct guess.
function recordCatGuessCorrect() {
    gameStats.catGuessesCorrect++;
    addTaskProgress('deadOrAlive', 1);
}

// ------------------------------------------------------------
// TASKS (MENU -> 📋 TASKS)
// ------------------------------------------------------------
// Three tasks are active at a time (one per slot), each worth diamonds. Finishing one pays its
// diamonds AUTOMATICALLY and starts a 3-hour REAL-TIME cooldown for that slot (it keeps counting
// while the game is closed — it's stored as a timestamp); when it ends the slot gets a new task,
// never one that another slot already has. An unfinished task never expires. The player can
// TRACK one task: it is then shown in a box under the MENU button on the main screen.
// To add a task: add a row here and call addTaskProgress('<id>', amount) where the thing happens.
const TASK_COOLDOWN_MS = 3 * 60 * 60 * 1000;
const TASK_SLOT_COUNT = 3;
const TASK_DEFS = [
    { id: 'deadOrAlive',   name: 'Dead or Alive',   desc: 'Guess correctly in the cat mini game', goal: 2,   reward: 2 },
    { id: 'playfulGiants', name: 'Playful Giants',  desc: 'Play with elephants',                  goal: 5,   reward: 1 },
    { id: 'easter',        name: 'Easter',          desc: 'Collect eggs',                         goal: 8,   reward: 1 },
    { id: 'pandaFrenzy',   name: 'Panda Frenzy',    desc: 'Feed the panda bamboo',                goal: 60,  reward: 2 },
    { id: 'getSomeRest',   name: 'Get some rest',   desc: 'Restore stamina for sugar gliders',    goal: 100, reward: 2 }
];

function getTaskDef(id) {
    return TASK_DEFS.find(t => t.id === id) || null;
}

// slot: { id, progress, readyAt }. readyAt = 0 -> the task is active; otherwise it is finished and
// the next task arrives at that timestamp (ms).
const taskState = { slots: [], tracked: null };

// A random task that none of the slots already hold (`avoidId` is also skipped when possible, so a
// finished task isn't immediately handed back).
function pickNewTaskId(avoidId) {
    const held = taskState.slots.map(s => s.id);
    let pool = TASK_DEFS.filter(t => held.indexOf(t.id) === -1 && t.id !== avoidId);
    if (pool.length === 0) pool = TASK_DEFS.filter(t => held.indexOf(t.id) === -1);
    if (pool.length === 0) pool = TASK_DEFS;
    return pool[Math.floor(Math.random() * pool.length)].id;
}

function resetTaskSlots() {
    taskState.slots = [];
    for (let i = 0; i < TASK_SLOT_COUNT; i++) {
        taskState.slots.push({ id: pickNewTaskId(null), progress: 0, readyAt: 0 });
    }
}
resetTaskSlots();

// Adds progress to the ACTIVE task with this id (if any); completing it pays it out.
function addTaskProgress(id, amount) {
    if (typeof areTasksUnlocked === 'function' && !areTasksUnlocked()) return;   // Tasks stay locked (and earn nothing) until Regions 1-9 are all unlocked
    const slot = taskState.slots.find(s => s.id === id && s.readyAt === 0);
    if (!slot) return;
    const def = getTaskDef(id);
    slot.progress = Math.min(def.goal, slot.progress + (amount || 1));
    if (slot.progress >= def.goal) {
        inventory.diamonds += def.reward;
        slot.readyAt = Date.now() + TASK_COOLDOWN_MS;
        if (taskState.tracked === id) taskState.tracked = null;
        showAchievementToast(`📋 ${def.name} complete!  +${def.reward} 💎`);
        saveGameProgress();
    }
}

// Called every frame (tickShopBuffs): hands a new task to any slot whose cooldown has ended.
function tickTasks() {
    const now = Date.now();
    taskState.slots.forEach(slot => {
        if (slot.readyAt > 0 && now >= slot.readyAt) {
            slot.id = pickNewTaskId(slot.id);
            slot.progress = 0;
            slot.readyAt = 0;
            if (typeof areTasksUnlocked !== 'function' || areTasksUnlocked()) showAchievementToast(`📋 New task: ${getTaskDef(slot.id).name}`);
            saveGameProgress();
        }
    });
}

// Non-blocking notice, same approach as showLevelUpToast().
function showAchievementToast(text) {
    let toast = document.getElementById('achievementToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'achievementToast';
        toast.style.cssText = `
            position: fixed; top: 30%; left: 50%; transform: translate(-50%, -50%);
            background: rgba(0,0,0,0.88); color: #5dade2; font-family: monospace;
            font-weight: bold; font-size: 13px; padding: 10px 16px;
            border: 2px solid #5dade2; border-radius: 8px; z-index: 9999;
            pointer-events: none; text-align: center;
            transition: opacity 0.35s ease; opacity: 0;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = text;
    toast.style.opacity = '1';
    clearTimeout(toast._hideTimer);
    toast._hideTimer = setTimeout(() => { toast.style.opacity = '0'; }, 3200);
}

const input = {
    up: false,
    down: false,
    left: false,
    right: false
};

let feedInterval = null;
let feedTurboTimeout = null;
let feedHoldCounter = 0;


// Set by the dev "Wipe Save" button (ui.js) so nothing — the 10-second autosave, a task completing,
// a claim — can write the old progress back into localStorage between the wipe and the page reload.
let saveDisabled = false;

// The localStorage key of the save, and of the one-time safety copy made when a save could not be
// (fully) read — the next autosave would otherwise overwrite the original with whatever half-loaded.
const SAVE_KEY = 'just_a_little_leisure_save_v2';
const SAVE_BACKUP_KEY = SAVE_KEY + '_backup';

// Copies the raw save text to SAVE_BACKUP_KEY — only if there is no backup yet, so the FIRST
// (original) copy is the one that survives repeated failures.
function backupSaveOnce(raw) {
    if (!raw) return;
    try {
        if (localStorage.getItem(SAVE_BACKUP_KEY) === null) localStorage.setItem(SAVE_BACKUP_KEY, raw);
    } catch (e) { /* storage full/unavailable: nothing more we can do */ }
}

function saveGameProgress() {
    if (saveDisabled) return;
    try {
        const stateMatrix = {
            inventory: {
                food: inventory.food,
                water: inventory.water,
                honey: inventory.honey,
                fish: inventory.fish,
                coins: inventory.coins,
                eggs: inventory.eggs,
                bananas: inventory.bananas,
                diamonds: inventory.diamonds,
                soil: inventory.soil,
                seeds: inventory.seeds
            },
            currentRegion: currentRegion,
            // The hive's own stored (uncollected) honey pool — separate from
            // inventory.honey, which is only what the player has actually collected.
            hiveHoney: (typeof region4Hive !== 'undefined' && region4Hive) ? region4Hive.honey : 0,
            // Saved as an array per region (not keyed by pet type) so multiple pets of
            // the same type — e.g. purchased worker bees — don't overwrite each other.
            petsByRegion: {}
        };

        for (let r in petsByRegion) {
            stateMatrix.petsByRegion[r] = petsByRegion[r]
                .filter(pet => pet.type !== 'bird') // saved separately below — see birdData
                .map(pet => ({
                    type: pet.type,
                    label: pet.label,
                    level: pet.level,
                    foodEaten: pet.foodEaten,
                    waterEaten: pet.waterEaten,
                    honeyCarried: pet.honeyCarried || 0,
                    fishingTimer: pet.fishingTimer || 0,
                    hunger: pet.hunger
                }));
        }

        // Bird is saved by itself rather than through the per-region arrays above,
        // because its Lv20 excursion perk physically moves it into a foreign region's
        // array for up to 60s — at the moment of an autosave it might not be sitting in
        // its home region 3 at index 2 at all. Only persistent stats are kept; an
        // in-progress excursion (and any bee-speed boost it applied) is intentionally
        // NOT resumed across a reload — see loadGameProgress().
        if (typeof birdPet !== 'undefined' && birdPet) {
            stateMatrix.birdData = {
                label: birdPet.label,
                level: birdPet.level,
                foodEaten: birdPet.foodEaten,
                waterEaten: birdPet.waterEaten,
                hunger: birdPet.hunger
            };
        }

        // Eggs lying on the Region 3 map (laid by a Lv20 chicken, waiting to be picked up). They
        // used to be lost on every refresh; they now stay until the player collects them.
        stateMatrix.eggsOnMap = (typeof regionalItems !== 'undefined' && regionalItems[3] && Array.isArray(regionalItems[3].eggs))
            ? regionalItems[3].eggs.map(e => ({ x: e.x, y: e.y }))
            : [];

        // Which regions / shop pets the player has bought (see UNLOCKABLES).
        stateMatrix.unlocks = Object.keys(unlockedIds).filter(id => unlockedIds[id]);

        // Sugar gliders (Region 9) live in their own list, `gliderPets` (world.js), NOT in
        // petsByRegion — they get carried between regions, and keeping them out of the
        // per-region arrays means they can't skew the region-unlock checks, the bee cap or
        // the positional save format above. Saved by index (0 = Sugar Glider, 1 = Miss Glider).
        // Everything is persisted, including which region each one was dropped in and
        // whether the player is currently carrying it.
        if (typeof gliderPets !== 'undefined' && Array.isArray(gliderPets)) {
            stateMatrix.gliderData = gliderPets.map(g => ({
                label: g.label,
                level: g.level,
                honeyEaten: g.honeyEaten,
                bananaEaten: g.bananaEaten,
                waterEaten: g.waterEaten,
                hunger: g.hunger,
                stamina: g.stamina,
                region: g.regionNow,
                held: !!g.held
            }));
        }

        stateMatrix.tutorialSeen = Object.keys(tutorialSeen).filter(id => tutorialSeen[id]);
        stateMatrix.feeders = {};
        FEEDER_REGIONS.forEach(r => { stateMatrix.feeders[r] = feederFood[r] || 0; });

        // Region 10 garden plots (world.js). Timers are real-clock seconds and only run while the game
        // is open and in the foreground, so a closed app never makes a flower die.
        if (typeof gardenPlots !== 'undefined' && Array.isArray(gardenPlots)) {
            stateMatrix.gardenData = gardenPlots.map(p => ({
                owned: !!p.owned, soil: !!p.soil, stage: p.stage, watered: !!p.watered,
                timer: p.timer, grace: p.grace, matured: !!p.matured
            }));
        }

        stateMatrix.achievements = {};
        ACHIEVEMENT_DEFS.forEach(d => { stateMatrix.achievements[d.id] = { claimed: achievements[d.id].claimed }; });
        stateMatrix.playSeconds = gameStats.playSeconds;
        stateMatrix.catGuessesCorrect = gameStats.catGuessesCorrect;
        stateMatrix.lifetimeCoins = gameStats.lifetimeCoins;
        stateMatrix.lifetimeDiamonds = gameStats.lifetimeDiamonds;
        stateMatrix.tasks = {
            slots: taskState.slots.map(s => ({ id: s.id, progress: s.progress, readyAt: s.readyAt })),
            tracked: taskState.tracked
        };

        stateMatrix.characterData = character;

        stateMatrix.shopBuffs = {
            cake: shopBuffs.cake,
            wisdomPotion: shopBuffs.wisdomPotion
        };

        localStorage.setItem(SAVE_KEY, JSON.stringify(stateMatrix));
    } catch (e) {
        console.error("Auto-save failed:", e);
    }
}

function loadGameProgress() {
    try {
        const savedData = localStorage.getItem(SAVE_KEY);
        if (!savedData) return;

        const stateMatrix = JSON.parse(savedData);

        // Each part of the save is restored on its own: if one part is bad it is skipped (and
        // logged) instead of aborting everything after it, and the untouched original save is
        // copied to a backup key before anything can overwrite it (see backupSaveOnce).
        const failedSections = [];
        const guard = (name, fn) => {
            try { fn(); } catch (e) { failedSections.push(name); console.error('Loading save: "' + name + '" failed:', e); }
        };

        guard('inventory', () => {
            lifetimeTrackingPaused = true;   // restoring the saved counts is not "earning" them
            try {
            if (stateMatrix.inventory) {
                const invNum = (v) => Math.floor(cleanSavedNum(v, 0, 1e12, 0));
                inventory.food = invNum(stateMatrix.inventory.food);
                inventory.water = invNum(stateMatrix.inventory.water);
                inventory.honey = invNum(stateMatrix.inventory.honey);
                inventory.fish = invNum(stateMatrix.inventory.fish);
                inventory.coins = invNum(stateMatrix.inventory.coins);
                inventory.eggs = invNum(stateMatrix.inventory.eggs);
                inventory.bananas = invNum(stateMatrix.inventory.bananas);
                inventory.diamonds = Math.max(0, Math.floor(Number(stateMatrix.inventory.diamonds)) || 0);   // older saves have none
                inventory.soil = invNum(stateMatrix.inventory.soil);     // older saves have none -> 0
                inventory.seeds = invNum(stateMatrix.inventory.seeds);
            }
            } finally {
                lifetimeTrackingPaused = false;
            }
            // Lifetime totals. Saves from before they existed start at what the player holds now (the
            // best available figure); a lifetime total is never lower than the current amount.
            const savedLifeCoins = Math.floor(Number(stateMatrix.lifetimeCoins));
            const savedLifeDiamonds = Math.floor(Number(stateMatrix.lifetimeDiamonds));
            gameStats.lifetimeCoins = Math.max(isFinite(savedLifeCoins) && savedLifeCoins > 0 ? savedLifeCoins : 0, inventory.coins);
            gameStats.lifetimeDiamonds = Math.max(isFinite(savedLifeDiamonds) && savedLifeDiamonds > 0 ? savedLifeDiamonds : 0, inventory.diamonds);

            if (typeof region4Hive !== 'undefined' && region4Hive) {
                region4Hive.honey = stateMatrix.hiveHoney || 0;
            }

            // Eggs that were lying on the Region 3 map. Each entry is validated (a bad one is just
            // skipped); saves from before this existed have no `eggsOnMap` and simply start with none.
            if (Array.isArray(stateMatrix.eggsOnMap) && typeof regionalItems !== 'undefined' && regionalItems[3]) {
                regionalItems[3].eggs = stateMatrix.eggsOnMap
                    .filter(e => e && isFinite(Number(e.x)) && isFinite(Number(e.y)))
                    .map(e => ({ x: Number(e.x), y: Number(e.y) }));
            }
        });

        guard('character', () => {
            // FIXED: Fully restore and link Character Level and XP to the HUD on page load
            if (stateMatrix.characterData) {
                const rawChar = (stateMatrix.characterData && typeof stateMatrix.characterData === 'object') ? stateMatrix.characterData : {};
                character = rawChar;
                character.level = Math.floor(cleanSavedNum(rawChar.level, 1, 1000, 1));
                character.xp = cleanSavedNum(rawChar.xp, 0, 1e12, 0);
                if (rawChar.perkPoints !== undefined) character.perkPoints = Math.floor(cleanSavedNum(rawChar.perkPoints, 0, 100000, 0));
                character.name = cleanSavedName(rawChar.name, 'Player'); // older saves predate the name field
                if (character.model !== 'male') character.model = 'female'; // older saves predate the model field
                if (typeof player !== 'undefined') player.model = character.model; // keep the on-screen sprite in sync
                normalizeCharacterPerks();                       // older saves predate the perk tree
            
                const charLevel = document.getElementById('charLevel');
                const charXP = document.getElementById('charXP');
                const charNextXP = document.getElementById('charNextXP');
            
                if (charLevel) charLevel.textContent = character.level;
                if (charXP) charXP.textContent = Math.floor(character.xp);
                if (charNextXP) charNextXP.textContent = getCharacterNextXP(character.level);
            }
        });

        guard('shopBuffs', () => {
            // Shop buff time remaining. Saves from before this existed (including the short-lived
            // permanent-purchase `shopPurchases` format) simply don't have this key -> nothing
            // active. Values are validated and capped at the item's duration.
            if (stateMatrix.shopBuffs) {
                SHOP_ITEMS.forEach(item => {
                    let remaining = Number(stateMatrix.shopBuffs[item.id]);
                    shopBuffs[item.id] = (isFinite(remaining) && remaining > 0) ? Math.min(remaining, item.duration) : 0;
                });
            }
        });

        guard('achievementsAndTasks', () => {
            // Achievements + total play time. Older saves have neither: claimed starts at 0 and any
            // tiers the save's pets have already earned are simply waiting to be claimed.
            ACHIEVEMENT_DEFS.forEach(d => {
                const saved = stateMatrix.achievements && stateMatrix.achievements[d.id];
                const c = saved ? Math.floor(Number(saved.claimed)) : 0;
                achievements[d.id].claimed = (isFinite(c) && c > 0) ? Math.min(c, d.tiers.length) : 0;
            });
            const savedPlay = Number(stateMatrix.playSeconds);
            gameStats.playSeconds = (isFinite(savedPlay) && savedPlay > 0) ? savedPlay : 0;
            const savedCatGuesses = Math.floor(Number(stateMatrix.catGuessesCorrect));
            gameStats.catGuessesCorrect = (isFinite(savedCatGuesses) && savedCatGuesses > 0) ? savedCatGuesses : 0;

            // Tasks: older saves have none (they keep the three random ones made at startup). Entries
            // with an unknown task id (e.g. a task removed in a later version) or a duplicate are
            // skipped and replaced by new random ones, progress is clamped to its goal, and a countdown
            // can never be longer than 3 hours (guards against a bad clock/edited save).
            if (stateMatrix.tasks && Array.isArray(stateMatrix.tasks.slots)) {
                const nowMs = Date.now();
                const restored = [];
                stateMatrix.tasks.slots.slice(0, TASK_SLOT_COUNT).forEach(sv => {
                    const def = (sv && typeof sv === 'object') ? getTaskDef(sv.id) : null;
                    if (!def || restored.some(r => r.id === def.id)) return;
                    const prog = Math.max(0, Math.min(def.goal, Math.floor(Number(sv.progress)) || 0));
                    let ready = Number(sv.readyAt);
                    ready = (isFinite(ready) && ready > 0) ? Math.min(ready, nowMs + TASK_COOLDOWN_MS) : 0;
                    restored.push({ id: def.id, progress: ready > 0 ? def.goal : Math.min(prog, def.goal - 1), readyAt: ready });
                });
                taskState.slots = restored;
                while (taskState.slots.length < TASK_SLOT_COUNT) {
                    taskState.slots.push({ id: pickNewTaskId(null), progress: 0, readyAt: 0 });
                }
                const trk = stateMatrix.tasks.tracked;
                taskState.tracked = taskState.slots.some(s => s.id === trk && s.readyAt === 0) ? trk : null;
            }
        });

        guard('region', () => {
            // The saved region must be a real one (1-9); anything else keeps the starting region.
            const savedRegion = Math.floor(Number(stateMatrix.currentRegion));
            if (isFinite(savedRegion) && regionalItems[savedRegion]) {
                currentRegion = savedRegion;
                if (regionSelector) regionSelector.value = currentRegion;
                foods = regionalItems[currentRegion].foods;
                waters = regionalItems[currentRegion].waters;
                flowers = regionalItems[currentRegion].flowers;
                bananas = regionalItems[currentRegion].bananas;
            }
        });

        guard('pets', () => {
            if (stateMatrix.petsByRegion) {
                // Current format: array per region, positional. Index 0..N-1 line up with
                // the default pets already in petsByRegion; anything beyond that (e.g. a
                // purchased worker bee) didn't exist yet and needs to be recreated.
                for (let r in petsByRegion) {
                    const savedArr = stateMatrix.petsByRegion[r];
                    if (!Array.isArray(savedArr)) continue;

                    savedArr.forEach((savedPet, i) => {
                        let pet = petsByRegion[r][i];

                        if (!pet) {
                            // No default slot at this index — this is an extra purchased pet.
                            // Only region 4 (bees) supports buying extras today; skip anything
                            // we don't have a factory for rather than guessing.
                            if (savedPet.type === 'bee' && typeof createBee === 'function') {
                                pet = createBee(savedPet.label);
                                petsByRegion[r].push(pet);
                            } else {
                                return;
                            }
                        }

                        pet.level = Math.floor(cleanSavedNum(savedPet.level, 1, MAX_PET_LEVEL, 1));
                        pet.label = cleanSavedName(savedPet.label, pet.label);
                        // The second monkey used to be called "Coco"; its default name is now "Bow Monkey".
                        // Saves still carrying the old default name are moved over (a name the player
                        // chose themselves is left alone).
                        if (pet.type === 'monkey' && pet.label === 'Coco') pet.label = 'Bow Monkey';
                        pet.foodEaten = cleanSavedNum(savedPet.foodEaten, 0, 1e9, 0);
                        pet.waterEaten = cleanSavedNum(savedPet.waterEaten, 0, 1e9, 0);
                        pet.hunger = cleanSavedNum(savedPet.hunger, 0, HUNGER_MAX, HUNGER_MAX);
                        pet.honeyCarried = cleanSavedNum(savedPet.honeyCarried, 0, 1e9, 0);
                        if (pet.type === 'bear') pet.fishingTimer = cleanSavedNum(savedPet.fishingTimer, 0, 1e6, 0);
                    });
                }

                // Bird: restore persistent stats only. Deliberately does NOT attempt to
                // resume an in-progress excursion (region, timer, any bee-speed boost it had
                // applied) across a reload — it always comes back home, at rest. See the
                // matching note in saveGameProgress().
                if (stateMatrix.birdData && typeof birdPet !== 'undefined' && birdPet) {
                    birdPet.level = Math.floor(cleanSavedNum(stateMatrix.birdData.level, 1, MAX_PET_LEVEL, 1));
                    birdPet.label = cleanSavedName(stateMatrix.birdData.label, birdPet.label);
                    birdPet.foodEaten = cleanSavedNum(stateMatrix.birdData.foodEaten, 0, 1e9, 0);
                    birdPet.waterEaten = cleanSavedNum(stateMatrix.birdData.waterEaten, 0, 1e9, 0);
                    birdPet.hunger = cleanSavedNum(stateMatrix.birdData.hunger, 0, HUNGER_MAX, HUNGER_MAX);
                    birdPet.excursionActive = false;
                    birdPet.excursionRegion = null;
                    birdPet.excursionTimer = 0;
                    birdPet.state = 'wander';
                }
            } else if (stateMatrix.petsData) {
                // Legacy format from before this fix (keyed by pet.type, so multiple bees
                // collided into one saved entry). Best-effort one-time read so existing
                // saves don't lose their dog/elephant/squirrel/chicken/bear progress —
                // any previously-purchased extra bees can't be recovered from this format,
                // but nothing else is lost, and every save from now on uses the array format above.
                for (let r in petsByRegion) {
                    petsByRegion[r].forEach(pet => {
                        const savedPet = stateMatrix.petsData[pet.type];
                        if (savedPet) {
                            pet.level = Math.floor(cleanSavedNum(savedPet.level, 1, MAX_PET_LEVEL, 1));
                            pet.label = cleanSavedName(savedPet.label, pet.label);
                            pet.foodEaten = cleanSavedNum(savedPet.foodEaten, 0, 1e9, 0);
                            pet.waterEaten = cleanSavedNum(savedPet.waterEaten, 0, 1e9, 0);
                        pet.hunger = cleanSavedNum(savedPet.hunger, 0, HUNGER_MAX, HUNGER_MAX);
                            if (typeof pet.honeyCarried !== 'undefined') pet.honeyCarried = cleanSavedNum(savedPet.honeyCarried, 0, 1e9, 0);
                        }
                    });
                }
            }
        
        });

        guard('gliders', () => {
            // Sugar gliders. Saves from before Region 9 have no gliderData, in which case both
            // gliders simply keep their defaults (Lv1, full stamina, resting place in Region 9).
            // Every value is validated: a hand-edited/corrupt save can't produce a glider with
            // NaN stamina, a level outside 1-MAX_PET_LEVEL or a region that doesn't exist.
            if (Array.isArray(stateMatrix.gliderData) && typeof gliderPets !== 'undefined') {
                let alreadyHolding = false;
                stateMatrix.gliderData.forEach((saved, i) => {
                    const g = gliderPets[i];
                    if (!g || !saved || typeof saved !== 'object') return;

                    let lvl = Math.floor(Number(saved.level));
                    g.level = (isFinite(lvl) && lvl >= 1) ? Math.min(lvl, MAX_PET_LEVEL) : 1;
                    if (typeof saved.label === 'string' && saved.label.trim()) g.label = saved.label;
                    g.honeyEaten = Math.max(0, Math.floor(Number(saved.honeyEaten)) || 0);
                    g.bananaEaten = Math.max(0, Math.floor(Number(saved.bananaEaten)) || 0);
                    g.waterEaten = Math.max(0, Math.floor(Number(saved.waterEaten)) || 0);
                    g.hunger = cleanSavedNum(saved.hunger, 0, HUNGER_MAX, HUNGER_MAX);

                    const maxStamina = getGliderMaxStamina(g.level);
                    let st = Number(saved.stamina);
                    g.stamina = (saved.stamina !== undefined && saved.stamina !== null && isFinite(st))
                        ? Math.min(maxStamina, Math.max(0, st)) : maxStamina;

                    let region = Math.floor(Number(saved.region));
                    g.regionNow = (isFinite(region) && region >= 1 && region <= 9) ? region : 9;

                    // Timers/reservations are never resumed — same simplification as every other
                    // pet's transient state (the bird's excursion, mini-games, etc.).
                    g.staminaDrainTimer = 0;
                    g.restTimer = 0;
                    g.restTree = -1;
                    g.pickNewWanderTarget();

                    if (saved.held && !alreadyHolding) {
                        // Still in the player's arms — one at a time.
                        alreadyHolding = true;
                        g.held = true;
                        g.state = 'held';
                    } else {
                        g.held = false;
                        g.state = 'idle';
                        g.stateTimer = 0.5;
                    }
                });
            }
        });

        guard('unlocks', () => {
            // Purchased regions / pets. A save from before the shop existed has no `unlocks`
            // list: grandfather it in by the OLD rules, so a player keeps every region they had
            // already unlocked (and the pets in them) rather than losing access or re-buying them.
            // This must run AFTER the pets above are restored, since the old rules read their levels.
            if (Array.isArray(stateMatrix.unlocks)) {
                stateMatrix.unlocks.forEach(id => {
                    if (typeof id === 'string' && getUnlockable(id)) unlockedIds[id] = true;
                });
            } else {
                UNLOCKABLES.forEach(u => {
                    if (legacyRegionUnlocked(u.region)) unlockedIds[u.id] = true;
                });
            }

            // Never resume standing in a locked region: pets in a locked region are neither
            // updated nor drawn (main.js), so the player would see an empty, frozen area. It can
            // happen if the save was made in a region that isn't owned (e.g. a hand-edited save).
            // This has to run AFTER the purchases above are restored. Regions 1-3 are always open.
            if (typeof isRegionUnlocked === 'function' && !isRegionUnlocked(currentRegion)) {
                currentRegion = 1;
                if (regionSelector) regionSelector.value = currentRegion;
                foods = regionalItems[currentRegion].foods;
                waters = regionalItems[currentRegion].waters;
                flowers = regionalItems[currentRegion].flowers;
                bananas = regionalItems[currentRegion].bananas;
            }
        });

        guard('tutorial', () => {
            if (Array.isArray(stateMatrix.tutorialSeen)) {
                stateMatrix.tutorialSeen.forEach(id => { if (typeof id === 'string') tutorialSeen[id] = true; });
            } else if (typeof grandfatherTutorial === 'function') {
                grandfatherTutorial();   // a save from before the tutorial existed: no new-player intro
            }
        });

        guard('feeders', () => {
            FEEDER_REGIONS.forEach(r => {
                const v = stateMatrix.feeders ? stateMatrix.feeders[r] : 0;
                feederFood[r] = Math.floor(cleanSavedNum(v, 0, FEEDER_CAPACITY, 0));
            });
        });

        guard('garden', () => {
            if (!Array.isArray(stateMatrix.gardenData) || typeof gardenPlots === 'undefined') return;
            gardenPlots.forEach((p, i) => {
                const sv = stateMatrix.gardenData[i];
                if (!sv || typeof sv !== 'object') return;
                p.owned = !!sv.owned;
                p.stage = Math.min(3, Math.max(0, Math.floor(Number(sv.stage)) || 0));
                p.soil = !!sv.soil && p.stage >= 0;
                if (p.stage >= 1) p.soil = true;                       // a planted plot always has soil
                p.watered = p.stage >= 1 && !!sv.watered;
                p.timer = p.watered ? cleanSavedNum(sv.timer, 0, 100000, 0) : 0;
                p.matured = p.stage === 3 && !!sv.matured;
                const g = Number(sv.grace);
                if (p.stage === 3 && p.matured && !p.watered) {
                    p.grace = (sv.grace !== null && sv.grace !== undefined && isFinite(g)) ? Math.min(GARDEN_GRACE_SECONDS, Math.max(1, g)) : GARDEN_GRACE_SECONDS;
                } else {
                    p.grace = null;
                }
                p.warned = false;
            });
        });

        if (failedSections.length) {
            console.error('Loading save: these parts could not be restored: ' + failedSections.join(', '));
            backupSaveOnce(savedData);
        }

        // Refresh display layers immediately after unpacking variables
        updateUI();
        if (typeof updateCodexData === 'function') updateCodexData();

    } catch (e) {
        console.error("Loading save failed:", e);
        try { backupSaveOnce(localStorage.getItem(SAVE_KEY)); } catch (e2) { /* storage unavailable */ }
    }
}

