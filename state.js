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
const regionSelector = document.getElementById('regionSelector');
const whistleBtn = document.getElementById('whistleBtn');

// New Core Dynamic Math Formula Engine (Max Level 20 scaling factor)
function getLevelRequirement(type, currentLevel) {
    const baseMap = { dog: 20, elephant: 35, squirrel: 10, chicken: 15, bee: 8, bear: 15, pig: 80 };
    let base = baseMap[type] || 20;
    
    // Safety fallback: If currentLevel is accidentally passed as an object or undefined, default to 1
    let lvl = (typeof currentLevel === 'number') ? currentLevel : 1;
    
    // Base XP * (Level ^ 1.2) - Continuous scaling curve calculation matrix
    let reqValue = Math.floor(base * Math.pow(lvl, 1.2));
    
    if (type === 'bee' || type === 'bear') {
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
    pig:      [ [1, 2, 2], [5, 3, 2], [10, 4, 3], [15, 5, 4], [20, 7, 6] ],
    elephant: [ [1, 1, 2], [5, 2, 3], [10, 3, 4], [20, 5, 7] ],
    squirrel: [ [1, 1, 0], [5, 3, 1], [10, 5, 1], [20, 8, 1] ],
    chicken:  [ [1, 1, 1], [5, 2, 1], [10, 3, 1], [20, 4, 2] ]
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
    eggs: 0
};

// NEW: Core Character Database Profile Properties
let character = {
    level: 1,
    xp: 0
};

// Calculate exponential player XP progression thresholds (No level cap ceiling)
function getCharacterNextXP(currentLevel) {
    return Math.floor(100 * Math.pow(currentLevel, 0.6)); // Scaled curve scaling boundaries
}

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
                eggs: inventory.eggs
            },
            currentRegion: currentRegion,
            // Saved as an array per region (not keyed by pet type) so multiple pets of
            // the same type — e.g. purchased worker bees — don't overwrite each other.
            petsByRegion: {}
        };

        for (let r in petsByRegion) {
            stateMatrix.petsByRegion[r] = petsByRegion[r].map(pet => ({
                type: pet.type,
                label: pet.label,
                level: pet.level,
                foodEaten: pet.foodEaten,
                waterEaten: pet.waterEaten,
                honeyCarried: pet.honeyCarried || 0,
                fishingTimer: pet.fishingTimer || 0
            }));
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
        }

        // FIXED: Fully restore and link Character Level and XP to the HUD on page load
        if (stateMatrix.characterData) {
            character = stateMatrix.characterData;
            
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

