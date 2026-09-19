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
    elephant: [ [1, 1, 2], [5, 2, 3], [10, 3, 4], [20, 5, 7] ],
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
    xp: 0
};

// Calculate exponential player XP progression thresholds (No level cap ceiling)
function getCharacterNextXP(currentLevel) {
    return Math.floor(100 * Math.pow(currentLevel, 0.6)); // Scaled curve scaling boundaries
}

// Character-level perk bonuses (stack cumulatively as milestones are reached):
// Lv5/15/35/45: +30% food & water gained from pets. Lv10/30: +25% honey.
// Lv20/40: +25% fish. Lv25/50: +25% coin. Plus the flat +10%/level manual gather bonus.
// Single source of truth — entities.js (pet foraging) and world.js (manual pickup) both
// call this instead of each keeping their own copy of the thresholds, and the Character
// screen (ui.js) reads it too, so the displayed bonuses can never drift out of sync with
// what's actually applied in gameplay.
function getCharacterBonuses(level) {
    let petFoodWater = 1.0;
    if (level >= 5) petFoodWater += 0.30;
    if (level >= 15) petFoodWater += 0.30;
    if (level >= 35) petFoodWater += 0.30;
    if (level >= 45) petFoodWater += 0.30;

    let petHoney = 1.0;
    if (level >= 10) petHoney += 0.25;
    if (level >= 30) petHoney += 0.25;

    let petFish = 1.0;
    if (level >= 20) petFish += 0.25;
    if (level >= 40) petFish += 0.25;

    let coin = 1.0;
    if (level >= 25) coin += 0.25;
    if (level >= 50) coin += 0.25;

    return {
        petFoodWater: petFoodWater,
        petHoney: petHoney,
        petFish: petFish,
        coin: coin,
        manualGather: 1 + (level * 0.10)
    };
}

// Ordered milestone list backing the Character screen's perk checklist — kept as data
// (rather than re-deriving from getCharacterBonuses' if-checks) so the screen can show
// each individual unlock as its own line item instead of just the cumulative totals.
const CHARACTER_LEVEL_PERKS = [
    { level: 5,  text: '+30% food & water gained by pets' },
    { level: 10, text: '+25% honey gained from pets' },
    { level: 15, text: '+30% food & water gained from pets' },
    { level: 20, text: '+25% fish gained from pets' },
    { level: 25, text: '+25% coin gained' },
    { level: 30, text: '+25% honey gained from pets' },
    { level: 35, text: '+30% food & water gained from pets' },
    { level: 40, text: '+25% fish gained from pets' },
    { level: 45, text: '+30% food & water gained by pets' },
    { level: 50, text: '+25% coin gained' }
];

// Global Core XP Injection Engine Function
function gainPlayerXP(amount) {
    if (typeof amount !== 'number' || isNaN(amount)) return;

    character.xp += amount;
    let nextNeeded = getCharacterNextXP(character.level);
    let leveledUp = false;

    // Evaluate level ups silently inside memory first to prevent layout locks
    while (character.xp >= nextNeeded) {
        character.xp -= nextNeeded;
        character.level++;
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
        if (charXP) charXP.textContent = character.xp;
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

        // FIXED: Fully restore and link Character Level and XP to the HUD on page load
        if (stateMatrix.characterData) {
            character = stateMatrix.characterData;
            if (!character.name) character.name = 'Player'; // older saves predate the name field
            
            const charLevel = document.getElementById('charLevel');
            const charXP = document.getElementById('charXP');
            const charNextXP = document.getElementById('charNextXP');
            
            if (charLevel) charLevel.textContent = character.level;
            if (charXP) charXP.textContent = character.xp;
            if (charNextXP) charNextXP.textContent = getCharacterNextXP(character.level);
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
        
        // Refresh display layers immediately after unpacking variables
        updateUI();
        if (typeof updateCodexData === 'function') updateCodexData();

    } catch (e) {
        console.error("Loading save failed:", e);
    }
}

