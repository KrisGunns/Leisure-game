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

// New Core Dynamic Math Formula Engine (Max Level 20 scaling factor)
function getLevelRequirement(type, currentLevel) {
    const baseMap = { dog: 20, elephant: 35, squirrel: 10, chicken: 15, bee: 8, bear: 15, pig: 80, cat: 40, bird: 50, panda: 120, monkey: 50 };
    let base = baseMap[type] || 20;
    
    // Safety fallback: If currentLevel is accidentally passed as an object or undefined, default to 1
    let lvl = (typeof currentLevel === 'number') ? currentLevel : 1;
    
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
    dog:      [ [1, 1, 1], [5, 2, 2], [10, 3, 3], [20, 5, 5] ],
    cat:      [ [1, 1, 1], [5, 2, 2], [10, 3, 3], [15, 4, 4], [20, 5, 5] ],
    bird:     [ [1, 1, 1], [5, 2, 1], [10, 2, 2], [15, 3, 2], [20, 4, 3] ],
    panda:    [ [1, 3, 2], [5, 4, 3], [10, 5, 4], [15, 6, 5], [20, 8, 6] ],
    pig:      [ [1, 2, 2], [5, 3, 2], [10, 4, 3], [15, 5, 4], [20, 7, 6] ],
    // Water yields: Lv5 +4, Lv10 +5, Lv15 +6, Lv20 +9 (both elephants — the tiers are per type).
    // Food is unchanged; Lv15 is a new tier row, and keeps the food yield it already had there.
    elephant: [ [1, 1, 2], [5, 2, 4], [10, 3, 5], [15, 3, 6], [20, 5, 9] ],
    squirrel: [ [1, 1, 0], [5, 3, 1], [10, 5, 1], [20, 8, 1] ],
    chicken:  [ [1, 1, 1], [5, 2, 1], [10, 3, 1], [20, 4, 2] ],
    // Single-resource forager (bananas only, Region 8 never spawns water) — the water
    // slot is always 0 and unused, kept only for shape consistency with getForageYield().
    monkey:   [ [1, 1, 0], [5, 2, 0], [10, 3, 0], [15, 4, 0], [20, 6, 0] ]
};

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

        // FIXED: Fully restore and link Character Level and XP to the HUD on page load
        if (stateMatrix.characterData) {
            character = stateMatrix.characterData;
            if (!character.name) character.name = 'Player'; // older saves predate the name field
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
        
        // Never resume standing in a locked region: pets in a locked region are neither
        // updated nor drawn (main.js), so the player would see an empty, frozen area. It can
        // happen when a save was made in an unlocked region and a later update added a pet to
        // Regions 1-3 (every unlock rule counts all pets there), which locks Regions 4-8 again
        // until that pet is tamed. This has to run AFTER the pets above are restored, since
        // the unlock rules depend on their levels. Regions 1-3 are always unlocked.
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

