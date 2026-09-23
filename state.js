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
const regionSelector = document.getElementById('regionSelector');
const whistleBtn = document.getElementById('whistleBtn');

// The highest level any pet can reach. Everything that used to hard-code 20 (feeding stops,
// progress bars, the Codex's "x/20", the dev insta-max, save validation...) reads this instead.
const MAX_PET_LEVEL = 30;

// New Core Dynamic Math Formula Engine (scaling factor is Level ^ 1.2, so it keeps working
// unchanged up to MAX_PET_LEVEL)
function getLevelRequirement(type, currentLevel) {
    const baseMap = { dog: 20, elephant: 35, squirrel: 10, chicken: 15, bee: 8, bear: 15, pig: 80, cat: 40, bird: 50, panda: 120, monkey: 50 };
    let base = baseMap[type] || 20;
    
    // Safety fallback: If currentLevel is accidentally passed as an object or undefined, default to 1
    let lvl = (typeof currentLevel === 'number') ? currentLevel : 1;
    
    // Sugar gliders (Region 9) are the only pets fed THREE different resources: Base Exp is
    // 40 honey + 40 bananas + 20 water at level 1, each scaled by the same Level ^ 1.2 curve
    // as everything else. All three must be met to level up (like food AND water for the
    // rest of the pets). Returns { honey, bananas, water } — see the glider branches in
    // input.js (feeding), ui.js (codex) and entities.js (progress bar).
    if (type === 'glider') {
        const curve = Math.pow(lvl, 1.2);
        return {
            honey:   Math.floor(40 * curve),
            bananas: Math.floor(40 * curve),
            water:   Math.floor(20 * curve)
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
    dog:      [ [1, 1, 1], [5, 2, 2], [10, 3, 3], [15, 4, 4], [20, 6, 6], [25, 7, 7], [30, 9, 9] ],
    cat:      [ [1, 1, 1], [5, 2, 2], [10, 3, 3], [15, 4, 4], [20, 5, 5], [25, 6, 6], [30, 7, 7] ],
    bird:     [ [1, 1, 1], [5, 2, 1], [10, 2, 2], [15, 3, 2], [20, 4, 3], [25, 5, 4], [30, 7, 6] ],
    panda:    [ [1, 3, 2], [5, 4, 3], [10, 5, 4], [15, 6, 5], [20, 8, 6], [25, 9, 8], [30, 10, 9] ],
    pig:      [ [1, 2, 2], [5, 3, 2], [10, 4, 3], [15, 5, 4], [20, 7, 6], [25, 7, 7], [30, 8, 9] ],
    // Both elephants share this row (the tiers are per type). Water is always the bigger number.
    elephant: [ [1, 1, 2], [5, 2, 4], [10, 3, 5], [15, 3, 6], [20, 5, 9], [25, 6, 10], [30, 8, 13] ],
    squirrel: [ [1, 1, 0], [5, 3, 1], [10, 5, 2], [15, 7, 2], [20, 9, 3], [25, 11, 3], [30, 13, 4] ],
    chicken:  [ [1, 1, 1], [5, 2, 1], [10, 3, 2], [15, 4, 2], [20, 5, 3], [25, 6, 3], [30, 8, 5] ],
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
    dogDig:         [ [20, 0.10], [30, 0.20] ],   // dog: dig for a bonus coin (Lv30 chance doubles the Lv20 one)
    catDouble:      [ [15, 0.10], [25, 0.12] ],   // cat: double the food/water gained
    catSchrodinger: [ [20, 0.03], [30, 0.04] ],   // cat: enter Schrodinger's box
    elephantPlay:   [ [20, 0.10] ],               // elephants: "catch me" minigame
    squirrelBoost:  [ [20, 0.10], [30, 0.15] ],   // squirrel: speed boost for the whole region
    chickenEgg:     [ [20, 0.10] ],               // chicken: base chance to lay an egg (chain eggs add to this at Lv30)
    birdFly:        [ [20, 0.05], [30, 0.08] ],   // bird: fly off to another region
    pigMud:         [ [20, 0.05], [30, 0.08] ],   // pig: play in the mud
    pandaFever:     [ [20, 0.05], [30, 0.08] ],   // panda: Bamboo Fever
    monkeySwing:    [ [20, 0.05], [30, 0.08] ],   // monkey: swing on the vines
    beeDoubleHoney: [ [20, 0.10], [30, 0.12] ],   // bee: double honey when dropping off
    beeDoubleExp:   [ [30, 0.10] ],               // bee: double flower exp
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

// Chicken "chain egg" (Lv30): after a forage lays an egg, the NEXT forage gets this much extra
// egg chance on top of the base; every further egg in a row adds it again, up to the cap. A
// forage that lays no egg resets it. See the chicken branch of Pet.update().
const CHAIN_EGG_STEP = 0.10;
const CHAIN_EGG_MAX = 0.60;
const CHAIN_EGG_MIN_LEVEL = 30;

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
let spawnTimer = 0;
let lastTime = 0;
const frameInterval = 1000 / 60;

const inventory = {
    food: 0,
    water: 0,
    honey: 0,
    fish: 0,
    coins: 0,
    eggs: 0,
    bananas: 0
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

// Calculate exponential player XP progression thresholds (No level cap ceiling)
function getCharacterNextXP(currentLevel) {
    return Math.floor(100 * Math.pow(currentLevel, 0.6)); // Scaled curve scaling boundaries
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
    basicResource: { name: 'Basic Resource', icon: '🍪💧', cost: 5,  stat: 'petFoodWater', add: 0.30, text: '+30% food & water gained from pets' },
    glazed:        { name: 'Glazed',         icon: '🍯',   cost: 10, stat: 'petHoney',     add: 0.25, text: '+25% honey gained from pets' },
    fishyBusiness: { name: 'Fishy Business', icon: '🐟',   cost: 8,  stat: 'petFish',      add: 0.25, text: '+25% fish gained from pets' },
    riches:        { name: 'Riches',         icon: '🪙',   cost: 20, stat: 'coin',         add: 0.25, text: '+25% coin gained' },
    bananas:       { name: 'Bananas!',       icon: '🍌',   cost: 6,  stat: 'petBanana',    add: 0.20, text: '+20% bananas gained from pets' }
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
    { id: 'bananas_c4t3',       type: 'bananas',       tier: 3, col: 4, requires: ['glazed_c4t2'] }
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

    { id: 'region_4',        kind: 'region', region: 4, icon: '🐝', name: 'Region 4 — Beehive',    cost: 60,  desc: 'Unlocks Region 4 and comes with your first Bee. More bees can be bought at the hive (30 🪙 each, max 3).' },

    { id: 'region_5',        kind: 'region', region: 5, icon: '🐻', name: 'Region 5 — Bear Lake',  cost: 150, desc: 'Unlocks Region 5 and comes with the Bear (Lv1 — needs Lv2 to be tamed).' },
    { id: 'pet_bowBear',     kind: 'pet',    region: 5, icon: '🐻', name: 'Bow Bear',     cost: 100, desc: 'Joins Region 5. Arrives wild (Lv1).' },

    { id: 'region_6',        kind: 'region', region: 6, icon: '🐷', name: 'Region 6 — Pig Sty',    cost: 150, desc: 'Unlocks Region 6 and comes with the Pig (Lv1 — needs Lv2 to be tamed).' },
    { id: 'pet_mudPig',      kind: 'pet',    region: 6, icon: '🐖', name: 'Mud Pig',      cost: 100, desc: 'Joins Region 6. Arrives wild (Lv1).' },

    { id: 'region_7',        kind: 'region', region: 7, icon: '🐼', name: 'Region 7 — Panda Habitat', cost: 300, desc: 'Unlocks Region 7 and comes with the Panda (Lv1 — needs Lv2 to be tamed).' },

    { id: 'region_8',        kind: 'region', region: 8, icon: '🐵', name: 'Region 8 — Monkey Jungle', cost: 250, desc: 'Unlocks Region 8 and comes with the Monkey (Lv1 — needs Lv2 to be tamed).' },
    { id: 'pet_bowMonkey',   kind: 'pet',    region: 8, icon: '🙈', name: 'Bow Monkey',   cost: 150, desc: 'Joins Region 8 (green bow). Arrives wild (Lv1).' },

    { id: 'region_9',        kind: 'region', region: 9, icon: '🛏️', name: 'Region 9 — Bedroom',    cost: 500, desc: 'Unlocks Region 9 and comes with the Sugar Glider, already tamed at Lv1.' },
    { id: 'pet_missGlider',  kind: 'pet',    region: 9, icon: '🎀', name: 'Miss Glider',  cost: 350, desc: 'A second sugar glider with a red bow, already tamed at Lv1.' }
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
// other two cost this each.
const BEE_COST = 30;

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

const input = {
    up: false,
    down: false,
    left: false,
    right: false
};

let feedInterval = null;
let feedTurboTimeout = null;
let feedHoldCounter = 0;


function saveGameProgress() {
    try {
        const stateMatrix = {
            inventory: {
                food: inventory.food,
                water: inventory.water,
                honey: inventory.honey,
                fish: inventory.fish,
                coins: inventory.coins,
                eggs: inventory.eggs,
                bananas: inventory.bananas
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
                    fishingTimer: pet.fishingTimer || 0
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
                waterEaten: birdPet.waterEaten
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
                stamina: g.stamina,
                region: g.regionNow,
                held: !!g.held
            }));
        }

        stateMatrix.characterData = character;

        stateMatrix.shopBuffs = {
            cake: shopBuffs.cake,
            wisdomPotion: shopBuffs.wisdomPotion
        };

        localStorage.setItem('just_a_little_leisure_save_v2', JSON.stringify(stateMatrix));
    } catch (e) {
        console.error("Auto-save failed:", e);
    }
}

function loadGameProgress() {
    try {
        const savedData = localStorage.getItem('just_a_little_leisure_save_v2');
        if (!savedData) return;

        const stateMatrix = JSON.parse(savedData);

        if (stateMatrix.inventory) {
            inventory.food = stateMatrix.inventory.food || 0;
            inventory.water = stateMatrix.inventory.water || 0;
            inventory.honey = stateMatrix.inventory.honey || 0;
            inventory.fish = stateMatrix.inventory.fish || 0;
            inventory.coins = stateMatrix.inventory.coins || 0;
            inventory.eggs = stateMatrix.inventory.eggs || 0;
            inventory.bananas = stateMatrix.inventory.bananas || 0;
        }

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

        // FIXED: Fully restore and link Character Level and XP to the HUD on page load
        if (stateMatrix.characterData) {
            character = stateMatrix.characterData;
            if (!character.name) character.name = 'Player'; // older saves predate the name field
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

        // Shop buff time remaining. Saves from before this existed (including the short-lived
        // permanent-purchase `shopPurchases` format) simply don't have this key -> nothing
        // active. Values are validated and capped at the item's duration.
        if (stateMatrix.shopBuffs) {
            SHOP_ITEMS.forEach(item => {
                let remaining = Number(stateMatrix.shopBuffs[item.id]);
                shopBuffs[item.id] = (isFinite(remaining) && remaining > 0) ? Math.min(remaining, item.duration) : 0;
            });
        }

        if (stateMatrix.currentRegion) {
            currentRegion = stateMatrix.currentRegion;
            if (regionSelector) regionSelector.value = currentRegion;
            foods = regionalItems[currentRegion].foods;
            waters = regionalItems[currentRegion].waters;
            flowers = regionalItems[currentRegion].flowers;
            bananas = regionalItems[currentRegion].bananas;
        }

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

                    pet.level = savedPet.level || 1;
                    pet.label = savedPet.label || pet.label;
                    // The second monkey used to be called "Coco"; its default name is now "Bow Monkey".
                    // Saves still carrying the old default name are moved over (a name the player
                    // chose themselves is left alone).
                    if (pet.type === 'monkey' && pet.label === 'Coco') pet.label = 'Bow Monkey';
                    pet.foodEaten = savedPet.foodEaten || 0;
                    pet.waterEaten = savedPet.waterEaten || 0;
                    pet.honeyCarried = savedPet.honeyCarried || 0;
                    if (pet.type === 'bear') pet.fishingTimer = savedPet.fishingTimer || 0;
                });
            }

            // Bird: restore persistent stats only. Deliberately does NOT attempt to
            // resume an in-progress excursion (region, timer, any bee-speed boost it had
            // applied) across a reload — it always comes back home, at rest. See the
            // matching note in saveGameProgress().
            if (stateMatrix.birdData && typeof birdPet !== 'undefined' && birdPet) {
                birdPet.level = stateMatrix.birdData.level || 1;
                birdPet.label = stateMatrix.birdData.label || birdPet.label;
                birdPet.foodEaten = stateMatrix.birdData.foodEaten || 0;
                birdPet.waterEaten = stateMatrix.birdData.waterEaten || 0;
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
                        pet.level = savedPet.level || 1;
                        pet.label = savedPet.label || pet.label;
                        pet.foodEaten = savedPet.foodEaten || 0;
                        pet.waterEaten = savedPet.waterEaten || 0;
                        if (typeof pet.honeyCarried !== 'undefined') pet.honeyCarried = savedPet.honeyCarried || 0;
                    }
                });
            }
        }
        
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

        // Refresh display layers immediately after unpacking variables
        updateUI();
        if (typeof updateCodexData === 'function') updateCodexData();

    } catch (e) {
        console.error("Loading save failed:", e);
    }
}

