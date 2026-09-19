// ============================================================
// ui.js — All HUD/overlay rendering and UI wiring: the main
// updateUI() refresh, mini-pet codex canvases, the pet Codex
// overlay, the settings/dev panel, pet renaming, the bag
// overlay, and the bee-purchase button.
// Depends on: state.js, entities.js, world.js. Load AFTER those.
// ============================================================

// Explicitly declared instead of relying on the browser's implicit "elements with an
// id attribute become bare global variables" behavior — that worked, but is fragile
// (breaks under 'use strict' or ES modules) and made these harder to spot at a glance.
const bagOverlay = document.getElementById('bagOverlay');
const openBagBtn = document.getElementById('openBagBtn');
const bagClose = document.getElementById('bagClose');
const spawnBeeBtn = document.getElementById('spawnBeeBtn');

// Built dynamically in JS (same technique as showLevelUpToast in state.js) rather than
// declared in index.html, so no HTML changes are needed to add this. Shown by the
// whistle button in input.js when a region has more than one eligible pet — lets the
// player pick which pet(s) to call instead of whistling everyone in the region at once.
function showWhistlePicker(pets) {
    let picker = document.getElementById('whistlePicker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'whistlePicker';
        picker.style.cssText = `
            position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); border: 2px solid #f1c40f; border-radius: 10px;
            padding: 10px; z-index: 9998; font-family: monospace; color: #fff;
            display: flex; flex-direction: column; gap: 6px; min-width: 170px;
        `;
        document.body.appendChild(picker);
    }

    // Clear and rebuild each time so button labels stay in sync with pet state
    // (e.g. after tapping one, it flips from "Call" to "Return").
    while (picker.firstChild) picker.removeChild(picker.firstChild);

    let title = document.createElement('div');
    title.textContent = 'Whistle Which Pet?';
    title.style.cssText = 'font-weight:bold; text-align:center; margin-bottom:4px; color:#f1c40f;';
    picker.appendChild(title);

    pets.forEach(pet => {
        let btn = document.createElement('button');
        let isCalled = pet.state === 'whistled';
        btn.textContent = isCalled ? `${pet.label} — Return` : `${pet.label} — Call`;
        btn.style.cssText = `
            padding: 8px 10px; border-radius: 6px; border: none; cursor: pointer;
            font-family: monospace; font-weight: bold; font-size: 13px;
            background: ${isCalled ? '#e67e22' : '#27ae60'}; color: #fff;
        `;
        const toggle = (e) => {
            if (e) e.preventDefault();
            if (pet.state !== 'whistled') {
                pet.state = 'whistled';
            } else {
                pet.state = 'wander';
                pet.pickNewWanderTarget();
            }
            showWhistlePicker(pets); // rebuild so the label/color reflect the new state
        };
        btn.addEventListener('touchstart', toggle, { passive: false });
        btn.addEventListener('mousedown', toggle);
        picker.appendChild(btn);
    });

    let closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
        padding: 6px 10px; border-radius: 6px; border: none; cursor: pointer;
        font-family: monospace; background: #555; color: #fff; margin-top: 4px;
    `;
    const closeHandler = (e) => { if (e) e.preventDefault(); hideWhistlePicker(); };
    closeBtn.addEventListener('touchstart', closeHandler, { passive: false });
    closeBtn.addEventListener('mousedown', closeHandler);
    picker.appendChild(closeBtn);

    picker.style.display = 'flex';
}

function hideWhistlePicker() {
    let picker = document.getElementById('whistlePicker');
    if (picker) picker.style.display = 'none';
}

// Set by updateUI() every frame to the Schrödinger-state cat the player is currently
// standing close enough to, or null otherwise. input.js reads this on PLAY press to
// decide whether to open the picker below instead of the normal feed action.
let activeSchrodingerCat = null;

// Built dynamically in JS (same technique as showWhistlePicker) — opened from the PLAY
// button when the player is near a cat in the Schrödinger state. Presents a "Dead or
// Alive?" choice; correct guess pays out 10 coins, either way the box resolves and the
// cat goes back to wandering.
function showSchrodingerPicker(cat) {
    let picker = document.getElementById('schrodingerPicker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'schrodingerPicker';
        picker.style.cssText = `
            position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); border: 2px solid #9b59b6; border-radius: 10px;
            padding: 10px; z-index: 9998; font-family: monospace; color: #fff;
            display: flex; flex-direction: column; gap: 6px; min-width: 170px;
        `;
        document.body.appendChild(picker);
    }

    while (picker.firstChild) picker.removeChild(picker.firstChild);

    let title = document.createElement('div');
    title.textContent = `${cat.label}: Dead or Alive?`;
    title.style.cssText = 'font-weight:bold; text-align:center; margin-bottom:4px; color:#9b59b6;';
    picker.appendChild(title);

    const resolve = (guess) => (e) => {
        if (e) e.preventDefault();
        let correct = (guess === cat.schrodingerOutcome);
        if (correct) {
            let catCoinsEarned = 10;
            inventory.coins += catCoinsEarned;
            if (typeof spawnCoinPopup === 'function') spawnCoinPopup(cat.homeRegion || 1, cat.x + cat.size / 2, cat.y, catCoinsEarned);
            saveGameProgress();
        }
        hideSchrodingerPicker();
        showSchrodingerResultToast(correct, cat.schrodingerOutcome);
        cat.state = 'wander';
        cat.schrodingerOutcome = null;
        cat.pickNewWanderTarget();
        activeSchrodingerCat = null;
        updateUI();
    };

    [['alive', 'Alive', '#27ae60'], ['dead', 'Dead', '#7f8c8d']].forEach(([value, label, color]) => {
        let btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding: 8px 10px; border-radius: 6px; border: none; cursor: pointer;
            font-family: monospace; font-weight: bold; font-size: 13px;
            background: ${color}; color: #fff;
        `;
        const handler = resolve(value);
        btn.addEventListener('touchstart', handler, { passive: false });
        btn.addEventListener('mousedown', handler);
        picker.appendChild(btn);
    });

    let closeBtn = document.createElement('button');
    closeBtn.textContent = 'Close';
    closeBtn.style.cssText = `
        padding: 6px 10px; border-radius: 6px; border: none; cursor: pointer;
        font-family: monospace; background: #555; color: #fff; margin-top: 4px;
    `;
    const closeHandler = (e) => { if (e) e.preventDefault(); hideSchrodingerPicker(); };
    closeBtn.addEventListener('touchstart', closeHandler, { passive: false });
    closeBtn.addEventListener('mousedown', closeHandler);
    picker.appendChild(closeBtn);

    picker.style.display = 'flex';
}

function hideSchrodingerPicker() {
    let picker = document.getElementById('schrodingerPicker');
    if (picker) picker.style.display = 'none';
}

// Opened from the panda's Lv20 "Bamboo Fever" trigger (entities.js). Presents a
// Play/Starve choice; Play starts the 30s bamboo-collection minigame (world.js) and
// puts the panda to sleep for 20s, Starve makes it flee the player (crying) for 30s.
function showBambooFeverPicker(panda) {
    let picker = document.getElementById('bambooFeverPicker');
    if (!picker) {
        picker = document.createElement('div');
        picker.id = 'bambooFeverPicker';
        picker.style.cssText = `
            position: fixed; bottom: 90px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); border: 2px solid #8bc34a; border-radius: 10px;
            padding: 10px; z-index: 9998; font-family: monospace; color: #fff;
            display: flex; flex-direction: column; gap: 6px; min-width: 190px;
        `;
        document.body.appendChild(picker);
    }

    while (picker.firstChild) picker.removeChild(picker.firstChild);

    let title = document.createElement('div');
    title.textContent = `🎍 ${panda.label} wants bamboo!`;
    title.style.cssText = 'font-weight:bold; text-align:center; margin-bottom:4px; color:#8bc34a;';
    picker.appendChild(title);

    const resolve = (choice) => (e) => {
        if (e) e.preventDefault();
        hideBambooFeverPicker();
        if (choice === 'play') {
            // Resume normal behavior while the 30s minigame plays out — the panda goes
            // to sleep (the 'full' state) only once the round actually finishes, over
            // in updateBambooFever()'s completion block (world.js).
            panda.state = 'wander';
            panda.pickNewWanderTarget();
            if (typeof startBambooFever === 'function') startBambooFever(panda);
        } else {
            panda.state = 'abandoned';
            panda.stateTimer = 30.0;
        }
        updateUI();
        saveGameProgress();
    };

    [['play', 'Play 🎍', '#8bc34a'], ['starve', 'Starve', '#7f8c8d']].forEach(([value, label, color]) => {
        let btn = document.createElement('button');
        btn.textContent = label;
        btn.style.cssText = `
            padding: 8px 10px; border-radius: 6px; border: none; cursor: pointer;
            font-family: monospace; font-weight: bold; font-size: 13px;
            background: ${color}; color: #fff;
        `;
        const handler = resolve(value);
        btn.addEventListener('touchstart', handler, { passive: false });
        btn.addEventListener('mousedown', handler);
        picker.appendChild(btn);
    });

    picker.style.display = 'flex';
}

function hideBambooFeverPicker() {
    let picker = document.getElementById('bambooFeverPicker');
    if (picker) picker.style.display = 'none';
}

// Shown once the 30s bamboo-collection window ends (world.js's updateBambooFever()).
function showBambooResultToast(collected, coinsEarned) {
    let toast = document.getElementById('bambooToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'bambooToast';
        toast.style.cssText = `
            position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); color: #fff; font-family: monospace;
            padding: 8px 14px; border-radius: 8px; z-index: 9999; font-size: 13px;
            border: 2px solid #8bc34a;
        `;
        document.body.appendChild(toast);
    }
    toast.textContent = `🎍 Collected ${collected} bamboo — +${coinsEarned} coins!`;
    toast.style.display = 'block';
    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

// Small result toast so a correct/incorrect guess is legible feedback, not just a
// silent coin-count change. Same dynamically-built-element technique as the toast in
// state.js's showLevelUpToast.
function showSchrodingerResultToast(correct, outcome) {
    let toast = document.getElementById('schrodingerToast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'schrodingerToast';
        toast.style.cssText = `
            position: fixed; top: 70px; left: 50%; transform: translateX(-50%);
            background: rgba(0,0,0,0.85); color: #fff; font-family: monospace;
            padding: 8px 14px; border-radius: 8px; z-index: 9999; font-size: 13px;
            border: 2px solid #27ae60;
        `;
        document.body.appendChild(toast);
    }
    toast.style.borderColor = correct ? '#27ae60' : '#e74c3c';
    toast.textContent = correct
        ? `🐱 It was ${outcome}! +10 coins!`
        : `🐱 It was ${outcome}! Better luck next time.`;
    toast.style.display = 'block';
    clearTimeout(toast._hideTimeout);
    toast._hideTimeout = setTimeout(() => { toast.style.display = 'none'; }, 2500);
}

// Returns the level-perk checklist for a pet type as an ordered array of
// { level, text }. Pulls the numeric tiers straight from FORAGE_TIERS (state.js) so
// this list never drifts out of sync with the actual yield numbers, then appends the
// non-numeric perks (digging, egg-laying, play minigame, mud-play, honey capacity,
// fishing speed) by hand since those aren't expressible as a table row.
function getPetPerkDescriptions(type) {
    let perks = [];
    // Monkey is in FORAGE_TIERS too (for getForageYield()/getLevelRequirement() reuse),
    // but it's a single-resource forager (bananas, not food/water) — skip the generic
    // food/water tier text below and build its own bananas-only version instead.
    const tiers = (typeof FORAGE_TIERS !== 'undefined' && type !== 'monkey') ? FORAGE_TIERS[type] : null;

    if (tiers) {
        tiers.forEach(tier => {
            let [lvl, food, water] = tier;
            if (lvl === 1) return; // level 1 is the base rate, not a milestone to list
            perks.push({ level: lvl, text: `Forage yield increases to +${food} food / +${water} water per pickup` });
        });
    }

    if (type === 'dog') {
        perks.push({ level: 20, text: '10% chance per forage to dig for a bonus coin' });
    } else if (type === 'chicken') {
        perks.push({ level: 20, text: '5% chance per forage to lay a collectible egg' });
    } else if (type === 'elephant') {
        perks.push({ level: 20, text: '10% chance to start a "catch me" play minigame (+5 coins)' });
    } else if (type === 'pig') {
        perks.push({ level: 20, text: '5% chance per forage to play in mud +2 coins' });
    } else if (type === 'cat') {
        perks.push({ level: 15, text: '10% chance per forage to double the food/water gained' });
        perks.push({ level: 20, text: "3% chance per forage to enter Schrödinger's state" });
    } else if (type === 'bird') {
        perks.push({ level: 20, text: '5% chance per forage to fly off to a random region' });
    } else if (type === 'panda') {
        perks.push({ level: 20, text: '5% chance per forage (while you\'re in Region 7) to start "Bamboo Fever" — choose Play to collect bamboo for coins while it naps, or Starve and it flees you for 30s' });
    } else if (type === 'bee') {
        perks.push({ level: 1, text: 'Carries 1 honey load before returning to the hive' });
        perks.push({ level: 5, text: 'Honey capacity increases to 2, and time to forage a flower decreases to 4.5s' });
        perks.push({ level: 10, text: 'Honey capacity increases to 3, and time to forage a flower decreases to 4.0s' });
        perks.push({ level: 20, text: 'Honey capacity increases to 5, time to forage a flower decreases to 3.0s, plus a 10% chance of double honey' });
    } else if (type === 'bear') {
        perks.push({ level: 5, text: 'Starts fishing at the lake, catching 1 fish per cycle' });
        perks.push({ level: 10, text: 'Fishing cycle speeds up, and catch increases to 3 fish per cycle' });
        perks.push({ level: 15, text: 'Fishing cycle speeds up further' });
        perks.push({ level: 20, text: '10% chance of a double catch (up to 6 fish)' });
    } else if (type === 'monkey') {
        if (typeof FORAGE_TIERS !== 'undefined' && FORAGE_TIERS.monkey) {
            FORAGE_TIERS.monkey.forEach(tier => {
                let [lvl, bananas] = tier;
                if (lvl === 1) return; // level 1 is the base rate, not a milestone to list
                perks.push({ level: lvl, text: `Forage yield increases to +${bananas} banana${bananas === 1 ? '' : 's'} per forage` });
            });
        }
        perks.push({ level: 20, text: '5% chance per forage to swing on the vines for 20s, then +5 coins' });
    }

    perks.sort((a, b) => a.level - b.level);
    return perks;
}

// Built dynamically in JS (same technique as showWhistlePicker/showLevelUpToast) —
// shows a pet's name, level, current foraging yield, and a level-perk checklist with
// perks the pet has already reached highlighted. Opened by clicking a mini-portrait
// in the Codex (wired in renderMiniPet above).
function showPetDetail(pet) {
    if (!pet) return;
    let overlay = document.getElementById('petDetailOverlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'petDetailOverlay';
        overlay.style.cssText = `
            position: fixed; inset: 0; background: rgba(0,0,0,0.85);
            z-index: 10000; display: flex; align-items: center; justify-content: center;
            font-family: monospace; color: #fff; padding: 20px; box-sizing: border-box;
        `;
        document.body.appendChild(overlay);
    }
    while (overlay.firstChild) overlay.removeChild(overlay.firstChild);

    let card = document.createElement('div');
    card.style.cssText = `
        background: #1e272e; border: 3px solid #f1c40f; border-radius: 12px;
        padding: 18px; max-width: 320px; width: 100%; max-height: 82vh; overflow-y: auto;
        box-sizing: border-box;
    `;

    let closeBtn = document.createElement('button');
    closeBtn.textContent = '✕';
    closeBtn.style.cssText = `
        float: right; background: #e74c3c; color: #fff; border: none;
        border-radius: 6px; width: 28px; height: 28px; cursor: pointer;
        font-family: monospace; font-weight: bold;
    `;
    const closeHandler = (e) => { if (e) e.preventDefault(); hidePetDetail(); };
    closeBtn.addEventListener('touchstart', closeHandler, { passive: false });
    closeBtn.addEventListener('mousedown', closeHandler);
    card.appendChild(closeBtn);

    let title = document.createElement('h2');
    title.style.cssText = 'color:#f1c40f; margin: 0 0 4px 0; clear: both; font-size: 18px;';
    title.textContent = `${pet.label} — Lv.${pet.level}${pet.level >= 20 ? ' [MAX]' : ''}`;
    card.appendChild(title);

    let typeLine = document.createElement('div');
    typeLine.style.cssText = 'color:#95a5a6; margin-bottom: 12px; text-transform: capitalize;';
    typeLine.textContent = pet.type;
    card.appendChild(typeLine);

    let yieldSection = document.createElement('div');
    yieldSection.style.cssText = 'margin-bottom: 14px; line-height: 1.6;';
    if (pet.type === 'monkey') {
        // Checked before the generic FORAGE_TIERS branch below even though monkey is
        // also in that table (for getForageYield/getLevelRequirement reuse) — it's a
        // single-resource forager like the bee/bear, not a food/water one, so it needs
        // its own label here rather than the generic "food/water" line.
        let y = getForageYield('monkey', pet.level);
        yieldSection.innerHTML = `<strong>Current Forage Yield</strong><br>🍌 +${y.food} banana${y.food === 1 ? '' : 's'} per forage`;
    } else if (typeof FORAGE_TIERS !== 'undefined' && FORAGE_TIERS[pet.type]) {
        let y = getForageYield(pet.type, pet.level);
        yieldSection.innerHTML = `<strong>Current Forage Yield</strong><br>🍪 +${y.food} food &nbsp; 💧 +${y.water} water`;
    } else if (pet.type === 'bee') {
        let cap = pet.level >= 20 ? 5 : pet.level >= 10 ? 3 : pet.level >= 5 ? 2 : 1;
        yieldSection.innerHTML = `<strong>Honey Capacity</strong><br>🍯 carries up to ${cap} before returning to the hive`;
    } else if (pet.type === 'bear') {
        let fishPerCycle = pet.level >= 10 ? 3 : 1;
        yieldSection.innerHTML = `<strong>Fishing</strong><br>🐟 catches ${fishPerCycle} fish per cycle (starts at Lv.5, cycle speeds up at Lv.10 and Lv.15${pet.level >= 20 ? ', 10% chance of a double catch' : ''})`;
    }
    card.appendChild(yieldSection);

    let perksTitle = document.createElement('strong');
    perksTitle.textContent = 'Level Perks';
    card.appendChild(perksTitle);

    let perksList = document.createElement('ul');
    perksList.style.cssText = 'padding-left: 18px; margin: 6px 0 0 0; line-height: 1.5;';
    getPetPerkDescriptions(pet.type).forEach(p => {
        let li = document.createElement('li');
        let reached = pet.level >= p.level;
        li.style.color = reached ? '#2ecc71' : '#7f8c8d';
        li.textContent = `Lv.${p.level}: ${p.text}`;
        perksList.appendChild(li);
    });
    card.appendChild(perksList);

    overlay.appendChild(card);
    overlay.style.display = 'flex';
}

function hidePetDetail() {
    let overlay = document.getElementById('petDetailOverlay');
    if (overlay) overlay.style.display = 'none';
}

function updateUI() {
    // Pinned Playfield Resources
    if (lblFood) lblFood.textContent = inventory.food;
    if (lblWater) lblWater.textContent = inventory.water;
    
    // Hidden Tucked-Away Vault Resources
    if (bagCoins) bagCoins.textContent = inventory.coins;
    if (bagEggs) bagEggs.textContent = inventory.eggs;
    if (bagHoney) bagHoney.textContent = inventory.honey;
    if (bagFish) bagFish.textContent = inventory.fish;
    if (bagBananas) bagBananas.textContent = inventory.bananas;

    const interactBtn = document.getElementById('interactBtn');
    if (interactBtn) {
        let elephantPlaying = false;
        if (typeof petsByRegion !== 'undefined' && petsByRegion && petsByRegion[2] && petsByRegion[2][0]) {
            let elState = petsByRegion[2][0].state;
            if (elState && (elState.startsWith('playing') || elState === 'playing_wait_for_move')) {
                elephantPlaying = true;
            }
        }

        // Cat's Schrödinger box: unlike the elephant check above (which doesn't care
        // about distance), the PLAY button here only shows once the player is actually
        // standing near the boxed cat — per spec, the player has to "go over to it".
        activeSchrodingerCat = null;
        if (typeof currentRegion !== 'undefined' && currentRegion === 1 &&
            typeof petsByRegion !== 'undefined' && petsByRegion && petsByRegion[1]) {
            petsByRegion[1].forEach(pet => {
                if (pet.type === 'cat' && pet.state === 'schrodinger') {
                    let dx = (pet.x + pet.size / 2) - (player.x + player.size / 2);
                    let dy = (pet.y + pet.size / 2) - (player.y + player.size / 2);
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 70) activeSchrodingerCat = pet;
                }
            });
        }

        interactBtn.textContent = (activeSchrodingerCat || elephantPlaying) ? 'PLAY' : 'GIVE';
    }

    const charLevel = document.getElementById('charLevel');
    const charXP = document.getElementById('charXP');
    const charNextXP = document.getElementById('charNextXP');
    const charXPBarFill = document.getElementById('charXPBarFill');

    if (charLevel) charLevel.textContent = character.level;
    if (charXP) charXP.textContent = character.xp;
    if (charNextXP) charNextXP.textContent = getCharacterNextXP(character.level);
    if (charXPBarFill) {
        let nextNeeded = getCharacterNextXP(character.level);
        let ratio = nextNeeded > 0 ? (character.xp / nextNeeded) : 0;
        charXPBarFill.style.width = (Math.min(1, Math.max(0, ratio)) * 100) + '%';
    }

    // Keep the Character screen's level/bonus numbers live while it's open (e.g. if the
    // player levels up mid-session with the screen up) without redrawing it every frame
    // when it's closed.
    const characterOverlayEl = document.getElementById('characterOverlay');
    if (characterOverlayEl && characterOverlayEl.style.display !== 'none' && typeof updateCharacterScreen === 'function') {
        updateCharacterScreen();
    }
}
function renderMiniPet(pet, elementId) {
    const miniCanvas = document.getElementById(elementId);
    if (!miniCanvas) return;
    const mctx = miniCanvas.getContext('2d');
    
    // Hard canvas geometry reset completely flushes past painted layers clean
    miniCanvas.width = 70;
    miniCanvas.height = 70;
    mctx.clearRect(0, 0, 70, 70);
    
    // Safety Fallback: Extract level safely, defaulting to 1 if undefined or missing
    let petLvl = (pet && typeof pet.level === 'number') ? pet.level : 1;
    
    // FIXED: Explicitly handle explicit lock flags or uninitialized level boundaries
    let isLocked = false;
    if (pet && pet.isLocked) {
        isLocked = true;
    } else if (pet && pet.type === 'bee') {
        isLocked = (petLvl < 1); // Autonomous Bee unlocks immediately at Level 1+
    } else {
        isLocked = (petLvl < 2); // Standard pets stay masked until Wild Level 1 turns to Tamed Level 2
    }

    if (isLocked) {
        mctx.fillStyle = '#111';
        mctx.fillRect(0, 0, 70, 70);
        mctx.fillStyle = 'rgba(255,255,255,0.15)';
        mctx.font = '20px monospace';
        mctx.textAlign = 'center';
        mctx.textBaseline = 'middle';
        mctx.fillText('❓', 35, 35);
        return; // ABSOLUTE CUTOFF: Guarantees zero downstream asset paint leakage
    }

    // Clicking/tapping a revealed portrait opens the detailed pet info screen. Re-bound
    // on every render call (removing any prior listener first) so the closure always
    // points at the CURRENT pet object passed in — important because this same
    // elementId can be rendered once as a locked placeholder object and later as the
    // real pet, and we don't want the click handler stuck referencing the old one.
    if (miniCanvas._detailHandler) {
        miniCanvas.removeEventListener('touchstart', miniCanvas._detailTouchStart);
        miniCanvas.removeEventListener('touchmove', miniCanvas._detailTouchMove);
        miniCanvas.removeEventListener('touchend', miniCanvas._detailTouchEnd);
        miniCanvas.removeEventListener('touchcancel', miniCanvas._detailTouchCancel);
        miniCanvas.removeEventListener('mousedown', miniCanvas._detailHandler);
    }
    const openDetail = (e) => {
        if (e) e.preventDefault();
        if (typeof showPetDetail === 'function') showPetDetail(pet);
    };

    // Tap-vs-scroll detection: opening on touchstart used to fire the instant the
    // codex list was touched, so starting a scroll drag on a portrait would yank the
    // detail popup open before the finger ever moved. Instead we track the touch and
    // only treat it as a tap (and open the popup) if the finger stayed roughly in
    // place and was released quickly — a real scroll gets to move the list untouched.
    let detailTouchStartX = 0, detailTouchStartY = 0, detailTouchStartTime = 0, detailTouchMoved = false;
    const TAP_MOVE_THRESHOLD = 10; // px of finger travel before we call it a scroll, not a tap
    const TAP_MAX_DURATION = 500;  // ms - long holds are treated as a scroll/hold, not a tap

    const onTouchStart = (e) => {
        if (!e.touches || e.touches.length === 0) return;
        const t = e.touches[0];
        detailTouchStartX = t.clientX;
        detailTouchStartY = t.clientY;
        detailTouchStartTime = Date.now();
        detailTouchMoved = false;
        // Intentionally NOT calling preventDefault here so the list's native scroll
        // still gets to start normally if this turns out to be a drag.
    };
    const onTouchMove = (e) => {
        if (detailTouchMoved || !e.touches || e.touches.length === 0) return;
        const t = e.touches[0];
        const dx = t.clientX - detailTouchStartX;
        const dy = t.clientY - detailTouchStartY;
        if (Math.sqrt(dx * dx + dy * dy) > TAP_MOVE_THRESHOLD) detailTouchMoved = true;
    };
    const onTouchEnd = (e) => {
        if (!detailTouchMoved && (Date.now() - detailTouchStartTime) < TAP_MAX_DURATION) {
            openDetail(e); // genuine tap — preventDefault here also suppresses the trailing synthetic click/mousedown
        }
    };
    const onTouchCancel = () => { detailTouchMoved = true; };

    miniCanvas._detailHandler = openDetail;
    miniCanvas._detailTouchStart = onTouchStart;
    miniCanvas._detailTouchMove = onTouchMove;
    miniCanvas._detailTouchEnd = onTouchEnd;
    miniCanvas._detailTouchCancel = onTouchCancel;
    miniCanvas.style.cursor = 'pointer';
    miniCanvas.addEventListener('touchstart', onTouchStart, { passive: true });
    miniCanvas.addEventListener('touchmove', onTouchMove, { passive: true });
    miniCanvas.addEventListener('touchend', onTouchEnd, { passive: false });
    miniCanvas.addEventListener('touchcancel', onTouchCancel, { passive: true });
    miniCanvas.addEventListener('mousedown', openDetail);

    // --- REVELATION LAYER ---
    mctx.fillStyle = 'rgba(255,255,255,0.1)';
    mctx.fillRect(0, 0, 70, 70);

    let ox = 17;
    let oy = 17;

        if (pet.type === 'dog') {
            mctx.fillStyle = '#f1c40f'; 
            mctx.fillRect(ox + 4, oy + 10, 26, 16); 
            mctx.fillRect(ox + 18, oy + 2, 10, 10); 
            mctx.fillStyle = '#f39c12'; 
            mctx.fillRect(ox + 16, oy + 4, 4, 8);  
            mctx.fillStyle = '#000000'; 
            mctx.fillRect(ox + 25, oy + 4, 2, 2);   
            mctx.fillRect(ox + 27, oy + 6, 2, 2);   
            mctx.fillStyle = '#d35400'; 
            mctx.fillRect(ox + 6, oy + 26, 4, 6);   
            mctx.fillRect(ox + 22, oy + 26, 4, 6);
            mctx.fillStyle = '#f1c40f';
            mctx.beginPath();
            mctx.moveTo(ox + 4, oy + 12);
            mctx.quadraticCurveTo(ox - 6, oy + 4, ox - 4, oy);
            mctx.lineTo(ox - 1, oy + 1);
            mctx.quadraticCurveTo(ox - 3, oy + 6, ox + 6, oy + 14);
            mctx.closePath();
            mctx.fill();
        } else if (pet.type === 'elephant') {
            mctx.fillStyle = '#95a5a6'; 
            mctx.fillRect(ox + 6, oy + 8, 24, 18);  
            mctx.fillRect(ox + 22, oy + 2, 10, 10);     
            mctx.fillStyle = '#7f8c8d'; 
            mctx.fillRect(ox + 18, oy + 4, 6, 10);  
            mctx.fillStyle = '#000000'; 
            mctx.fillRect(ox + 28, oy + 4, 2, 2);   
            mctx.fillStyle = '#7f8c8d'; 
            mctx.fillRect(ox + 8, oy + 26, 5, 6);   
            mctx.fillRect(ox + 20, oy + 26, 5, 6);
            mctx.fillRect(ox + 5, oy + 14, 2, 6);
            mctx.fillStyle = '#95a5a6';
            mctx.beginPath();
            mctx.moveTo(ox + 30, oy + 10);
            mctx.lineTo(ox + 35, oy + 18);
            mctx.lineTo(ox + 33, oy + 19);
            mctx.lineTo(ox + 29, oy + 12);
            mctx.closePath();
            mctx.fill();
        } else if (pet.type === 'squirrel') {
            mctx.fillStyle = pet.color; 
            mctx.fillRect(ox + 8, oy + 14, 16, 12);  
            mctx.fillRect(ox + 14, oy + 6, 10, 10);  
            mctx.fillRect(ox + 20, oy + 2, 2, 4);       
            mctx.fillStyle = '#000000'; 
            mctx.fillRect(ox + 20, oy + 8, 2, 2);   
            mctx.fillStyle = pet.color === '#d35400' ? '#7f8c8d' : '#3d1d00';
            mctx.fillRect(ox + 10, oy + 26, 3, 4);  
            mctx.fillRect(ox + 18, oy + 26, 3, 4);
            mctx.fillStyle = pet.color;
            mctx.beginPath();
            mctx.moveTo(ox + 10, oy + 24);
            mctx.quadraticCurveTo(ox + 2, oy + 16, ox + 4, oy + 6);
            mctx.quadraticCurveTo(ox + 10, oy + 8, ox + 12, oy + 18);
            mctx.closePath();
            mctx.fill();
        } else if (pet.type === 'chicken') {
            mctx.fillStyle = '#ffffff';
            mctx.beginPath();
            mctx.arc(ox + 18, oy + 20, 12, 0, Math.PI * 2);
            mctx.fill();
            mctx.fillStyle = '#c0392b';
            mctx.fillRect(ox + 16, oy + 4, 5, 4);
            mctx.fillStyle = '#ffffff';
            mctx.beginPath();
            mctx.arc(ox + 20, oy + 10, 7, 0, Math.PI * 2);
            mctx.fill();
            mctx.fillStyle = '#f39c12';
            mctx.beginPath();
            mctx.moveTo(ox + 26, oy + 8);
            mctx.lineTo(ox + 32, oy + 11);
            mctx.lineTo(ox + 26, oy + 14);
            mctx.closePath();
            mctx.fill();
            mctx.fillStyle = '#000000';
            mctx.fillRect(ox + 22, oy + 8, 2, 2);
            mctx.fillStyle = '#f39c12';
            mctx.fillRect(ox + 12, oy + 30, 3, 6);
            mctx.fillRect(ox + 20, oy + 30, 3, 6);
        } else if (pet.type === 'bee') {
            mctx.fillStyle = '#f1c40f';
            mctx.beginPath();
            mctx.ellipse(ox + 18, oy + 18, 12, 8, 0, 0, Math.PI * 2);
            mctx.fill();
            mctx.strokeStyle = '#2c3e50';
            mctx.lineWidth = 3;
            mctx.beginPath();
            mctx.moveTo(ox + 14, oy + 10); mctx.lineTo(ox + 14, oy + 26);
            mctx.moveTo(ox + 22, oy + 10); mctx.lineTo(ox + 22, oy + 26);
            mctx.stroke();
            mctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            mctx.beginPath();
            mctx.ellipse(ox + 14, oy + 8, 4, 6, -Math.PI / 4, 0, Math.PI * 2);
            mctx.ellipse(ox + 22, oy + 8, 4, 6, Math.PI / 4, 0, Math.PI * 2);
            mctx.fill();
            mctx.fillStyle = '#000000';
            mctx.fillRect(ox + 26, oy + 15, 2, 2);
        } else if (pet.type === 'bear') {
            let isFemale = !!pet.isFemaleBear;
            mctx.save();
            if (isFemale) {
                let scale = 0.85;
                mctx.translate(ox, oy);
                mctx.scale(scale, scale);
                mctx.translate(-ox, -oy);
            }
            mctx.fillStyle = '#5a2a00'; 
            mctx.fillRect(ox + 4, oy + 8, 28, 20); 
            mctx.fillRect(ox + 10, oy + 0, 16, 12); 
            mctx.fillRect(ox + 8, oy - 4, 6, 6); 
            mctx.fillRect(ox + 22, oy - 4, 6, 6); 
            mctx.fillStyle = '#000000';
            mctx.fillRect(ox + 14, oy + 4, 2, 2); 
            mctx.fillRect(ox + 20, oy + 4, 2, 2); 
            mctx.fillStyle = '#3a1a00';
            mctx.fillRect(ox + 6, oy + 28, 6, 6); 
            mctx.fillRect(ox + 24, oy + 28, 6, 6);
            if (isFemale) {
                mctx.fillStyle = '#ff6fa5';
                mctx.beginPath();
                mctx.moveTo(ox + 18, oy - 6);
                mctx.lineTo(ox + 10, oy - 11);
                mctx.lineTo(ox + 10, oy - 1);
                mctx.closePath();
                mctx.fill();
                mctx.beginPath();
                mctx.moveTo(ox + 18, oy - 6);
                mctx.lineTo(ox + 26, oy - 11);
                mctx.lineTo(ox + 26, oy - 1);
                mctx.closePath();
                mctx.fill();
                mctx.fillStyle = '#e0559a';
                mctx.fillRect(ox + 16, oy - 8, 4, 4);
            }
            mctx.restore();
        } else if (pet.type === 'pig') {
            let accent = pet.color === '#ffb6c1' ? '#ff8fab' : '#7f8c8d';
            mctx.fillStyle = pet.color;
            mctx.fillRect(ox + 4, oy + 12, 28, 18);
            mctx.fillRect(ox + 20, oy + 4, 14, 12);
            mctx.fillStyle = accent;
            mctx.fillRect(ox + 20, oy, 5, 6);
            mctx.fillRect(ox + 29, oy, 5, 6);
            mctx.fillRect(ox + 28, oy + 10, 8, 6);
            mctx.fillStyle = '#000000';
            mctx.fillRect(ox + 30, oy + 12, 2, 2);
            mctx.fillRect(ox + 34, oy + 12, 2, 2);
            mctx.fillRect(ox + 26, oy + 7, 2, 2);
            mctx.fillStyle = pet.color;
            mctx.fillRect(ox + 8, oy + 28, 4, 6);
            mctx.fillRect(ox + 22, oy + 28, 4, 6);
        } else if (pet.type === 'monkey') {
            mctx.fillStyle = pet.color;
            mctx.fillRect(ox + 6, oy + 12, 22, 16);
            mctx.fillRect(ox + 10, oy + 2, 16, 12);
            mctx.fillStyle = '#c98a55';
            mctx.fillRect(ox + 13, oy + 7, 10, 7);
            mctx.fillStyle = pet.color;
            mctx.beginPath();
            mctx.arc(ox + 10, oy + 6, 4, 0, Math.PI * 2);
            mctx.arc(ox + 26, oy + 6, 4, 0, Math.PI * 2);
            mctx.fill();
            mctx.fillStyle = '#000000';
            mctx.fillRect(ox + 14, oy + 8, 2, 2);
            mctx.fillRect(ox + 20, oy + 8, 2, 2);
            mctx.fillStyle = pet.color;
            mctx.fillRect(ox + 2, oy + 14, 4, 12);
            mctx.fillRect(ox + 30, oy + 14, 4, 12);
            mctx.fillRect(ox + 10, oy + 28, 4, 6);
            mctx.fillRect(ox + 22, oy + 28, 4, 6);
        } else if (pet.type === 'cat') {
            mctx.fillStyle = pet.color;
            mctx.fillRect(ox + 4, oy + 12, 26, 16);
            mctx.fillRect(ox + 18, oy + 2, 12, 12);
            mctx.beginPath();
            mctx.moveTo(ox + 18, oy + 2);
            mctx.lineTo(ox + 20, oy - 5);
            mctx.lineTo(ox + 23, oy + 2);
            mctx.closePath();
            mctx.fill();
            mctx.beginPath();
            mctx.moveTo(ox + 26, oy + 2);
            mctx.lineTo(ox + 29, oy - 5);
            mctx.lineTo(ox + 31, oy + 2);
            mctx.closePath();
            mctx.fill();
            mctx.fillStyle = '#7a3d10';
            mctx.fillRect(ox + 8, oy + 12, 3, 16);
            mctx.fillRect(ox + 15, oy + 12, 3, 16);
            mctx.fillRect(ox + 21, oy + 4, 2, 8);
            mctx.fillRect(ox + 27, oy + 4, 2, 8);
            mctx.fillStyle = '#000000';
            mctx.fillRect(ox + 21, oy + 6, 2, 2);
            mctx.fillRect(ox + 27, oy + 6, 2, 2);
        } else if (pet.type === 'bird') {
            mctx.fillStyle = pet.color;
            mctx.beginPath();
            mctx.ellipse(ox + 16, oy + 20, 12, 9, 0, 0, Math.PI * 2);
            mctx.fill();
            mctx.beginPath();
            mctx.arc(ox + 26, oy + 12, 7, 0, Math.PI * 2);
            mctx.fill();
            mctx.fillStyle = '#f39c12';
            mctx.beginPath();
            mctx.moveTo(ox + 32, oy + 12);
            mctx.lineTo(ox + 38, oy + 14);
            mctx.lineTo(ox + 32, oy + 16);
            mctx.closePath();
            mctx.fill();
            mctx.fillStyle = '#000000';
            mctx.fillRect(ox + 27, oy + 9, 2, 2);
            mctx.fillStyle = '#2c2c2c';
            mctx.beginPath();
            mctx.ellipse(ox + 12, oy + 18, 7, 5, -0.4, 0, Math.PI * 2);
            mctx.fill();
        } else if (pet.type === 'panda') {
            mctx.fillStyle = '#ffffff';
            mctx.beginPath();
            mctx.ellipse(ox + 18, oy + 20, 15, 12, 0, 0, Math.PI * 2);
            mctx.fill();
            mctx.beginPath();
            mctx.arc(ox + 18, oy + 5, 11, 0, Math.PI * 2);
            mctx.fill();
            mctx.fillStyle = '#000000';
            mctx.beginPath();
            mctx.arc(ox + 9, oy - 3, 4, 0, Math.PI * 2);
            mctx.fill();
            mctx.beginPath();
            mctx.arc(ox + 27, oy - 3, 4, 0, Math.PI * 2);
            mctx.fill();
            mctx.beginPath();
            mctx.ellipse(ox + 12, oy + 5, 3.5, 4.5, -0.3, 0, Math.PI * 2);
            mctx.fill();
            mctx.beginPath();
            mctx.ellipse(ox + 24, oy + 5, 3.5, 4.5, 0.3, 0, Math.PI * 2);
            mctx.fill();
        }
    }

function updateCodexData() {
    const dog = petsByRegion[1][0];
    const cat = petsByRegion[1][1];
    const elephant = petsByRegion[2][0];
    const squirrel = petsByRegion[3][0];
    const chicken = petsByRegion[3][1];
    const bird = (typeof birdPet !== 'undefined') ? birdPet : petsByRegion[3][2];
    const bee = petsByRegion[4][0];
    const panda = petsByRegion[7][0];

    renderMiniPet(dog, 'viewDog');
    renderMiniPet(cat, 'viewCat');
    renderMiniPet(elephant, 'viewElephant');
    renderMiniPet(squirrel, 'viewSquirrel');
    renderMiniPet(chicken, 'viewChicken');
    renderMiniPet(bird, 'viewBird');

    let dogReq = getLevelRequirement('dog', dog.level);
    document.getElementById('infoDog').innerHTML = `
        <strong>${dog.level >= 2 ? dog.label : '???'}</strong><br>
        Status: <span class="${dog.level >= 2 ? 'codexTamed' : 'codexWild'}">${dog.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${dog.level >= 2 ? dog.level + '/20' : '?/20'}<br>
        Next Req: ${dog.level < 2 ? '???' : (dog.level < 20 ? '🍪' + dogReq.food + ' 💧' + dogReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxDog').style.display = dog.level >= 2 ? 'block' : 'none';

    let catReq = getLevelRequirement('cat', cat.level);
    document.getElementById('infoCat').innerHTML = `
        <strong>${cat.level >= 2 ? cat.label : '???'}</strong><br>
        Status: <span class="${cat.level >= 2 ? 'codexTamed' : 'codexWild'}">${cat.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${cat.level >= 2 ? cat.level + '/20' : '?/20'}<br>
        Next Req: ${cat.level < 2 ? '???' : (cat.level < 20 ? '🍪' + catReq.food + ' 💧' + catReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxCat').style.display = cat.level >= 2 ? 'block' : 'none';

    let birdReq = getLevelRequirement('bird', bird.level);
    document.getElementById('infoBird').innerHTML = `
        <strong>${bird.level >= 2 ? bird.label : '???'}</strong><br>
        Status: <span class="${bird.level >= 2 ? 'codexTamed' : 'codexWild'}">${bird.level >= 2 ? 'TAMED' : 'WILD'}${bird.excursionActive ? ' (away)' : ''}</span><br>
        Level: ${bird.level >= 2 ? bird.level + '/20' : '?/20'}<br>
        Next Req: ${bird.level < 2 ? '???' : (bird.level < 20 ? '🍪' + birdReq.food + ' 💧' + birdReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxBird').style.display = bird.level >= 2 ? 'block' : 'none';


    let elReq = getLevelRequirement('elephant', elephant.level);
    document.getElementById('infoElephant').innerHTML = `
        <strong>${elephant.level >= 2 ? elephant.label : '???'}</strong><br>
        Status: <span class="${elephant.level >= 2 ? 'codexTamed' : 'codexWild'}">${elephant.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${elephant.level >= 2 ? elephant.level + '/20' : '?/20'}<br>
        Next Req: ${elephant.level < 2 ? '???' : (elephant.level < 20 ? '🍪' + elReq.food + ' 💧' + elReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxElephant').style.display = elephant.level >= 2 ? 'block' : 'none';

    let sqReq = getLevelRequirement('squirrel', squirrel.level);
    document.getElementById('infoSquirrel').innerHTML = `
        <strong>${squirrel.level >= 2 ? squirrel.label : '???'}</strong><br>
        Status: <span class="${squirrel.level >= 2 ? 'codexTamed' : 'codexWild'}">${squirrel.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${squirrel.level >= 2 ? squirrel.level + '/20' : '?/20'}<br>
        Next Req: ${squirrel.level < 2 ? '???' : (squirrel.level < 20 ? '🍪' + sqReq.food + ' 💧' + sqReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxSquirrel').style.display = squirrel.level >= 2 ? 'block' : 'none';

    let chReq = getLevelRequirement('chicken', chicken.level);
    document.getElementById('infoChicken').innerHTML = `
        <strong>${chicken.level >= 2 ? chicken.label : '???'}</strong><br>
        Status: <span class="${chicken.level >= 2 ? 'codexTamed' : 'codexWild'}">${chicken.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${chicken.level >= 2 ? chicken.level + '/20' : '?/20'}<br>
        Next Req: ${chicken.level < 2 ? '???' : (chicken.level < 20 ? '🍪' + chReq.food + ' 💧' + chReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxChicken').style.display = chicken.level >= 2 ? 'block' : 'none';

    // Region 4-6 unlock condition: every pet across Regions 1-3 at Lv2+ — see
    // areRegions1to3Tamed() in world.js (single source of truth, also used by
    // main.js and input.js).
    let region4Unlocked = areRegions1to3Tamed();

    // 2. FIXED: Re-render the mini pet canvas *only* if unlocked, otherwise pass a dummy locked object
    if (!region4Unlocked) {
        // 1. Forces the mini-canvas renderer to draw a hidden black card profile with a question mark
        renderMiniPet({ type: 'bee', level: 1, isLocked: true }, 'viewBee'); 
        
        // 2. Overrides the text box with mystery information at the start of the game
        document.getElementById('infoBee').innerHTML = `
            <strong>???</strong><br>
            Status: <span class="codexWild">LOCKED</span><br>
            Level: ?/20<br>
            Next Req: ???
        `;
    } else {
        // Displays full active taming metrics once the user breaks through the early zones!
        let beeReq = getLevelRequirement('bee', bee.level);
        renderMiniPet(bee, 'viewBee');
        
        document.getElementById('infoBee').innerHTML = `
            <strong>${bee.level >= 1 ? bee.label : '???'}</strong><br>
            Status: <span class="${bee.level >= 1 ? 'codexTamed' : 'codexWild'}">${bee.level >= 1 ? 'TAMED' : 'WILD'}</span><br>
            Level: ${bee.level}/20<br>
            Next Req: ${bee.level < 20 ? '🌸 ' + beeReq + ' Flowers' : 'MAX'}
        `;
    }
    document.getElementById('renameBoxBee').style.display = (region4Unlocked && bee.level >= 1) ? 'block' : 'none';

    // FIXED: Uses the region4Unlocked variable flag to determine if Region 5 is locked as well
    const bear1 = petsByRegion[5] ? petsByRegion[5][0] : null;
    const bear2 = petsByRegion[5] ? petsByRegion[5][1] : null;

    [ { bear: bear1, viewId: 'viewBear1', infoId: 'infoBear1', renameId: 'renameBoxBear1' },
      { bear: bear2, viewId: 'viewBear2', infoId: 'infoBear2', renameId: 'renameBoxBear2' }
    ].forEach(slot => {
        if (!slot.bear) return;

        if (!region4Unlocked) {
            // 1. Forces the mini-canvas renderer to draw a hidden black card profile with a question mark
            renderMiniPet({ type: 'bear', level: 1, isLocked: true }, slot.viewId);

            // 2. Overrides the text box with mystery information at the start of the game
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>???</strong><br>
                Status: <span class="codexWild">LOCKED</span><br>
                Level: ?/20<br>
                Next Req: ???
            `;
        } else {
            // Displays full active taming metrics once the user breaks through the early zones!
            let bearReq = getLevelRequirement('bear', slot.bear.level);
            renderMiniPet(slot.bear, slot.viewId);

            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>${slot.bear.level >= 2 ? slot.bear.label : '???'}</strong><br>
                Status: <span class="${slot.bear.level >= 2 ? 'codexTamed' : 'codexWild'}">${slot.bear.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
                Level: ${slot.bear.level}/20<br>
                Next Req: ${slot.bear.level < 20 ? '🍯 ' + bearReq + ' Honey' : 'MAX'}
            `;
        }
        let renameEl = document.getElementById(slot.renameId);
        if (renameEl) renameEl.style.display = (region4Unlocked && slot.bear.level >= 2) ? 'block' : 'none';
    });

    // Region 6 pigs — gated behind the same region4Unlocked lock as bee/bear, since
    // Region 6 is >= 4 and follows the same Regions 1-3 taming requirement.
    // Gracefully no-ops (via renderMiniPet's own `if (!miniCanvas) return;` and the
    // `document.getElementById(...)` calls below) until the corresponding elements
    // exist in index.html — see the HTML snippet for viewPig1/viewPig2 etc.
    const pig1 = petsByRegion[6] ? petsByRegion[6][0] : null;
    const pig2 = petsByRegion[6] ? petsByRegion[6][1] : null;

    [ { pig: pig1, viewId: 'viewPig1', infoId: 'infoPig1', renameId: 'renameBoxPig1' },
      { pig: pig2, viewId: 'viewPig2', infoId: 'infoPig2', renameId: 'renameBoxPig2' }
    ].forEach(slot => {
        if (!slot.pig) return;

        if (!region4Unlocked) {
            renderMiniPet({ type: 'pig', level: 1, isLocked: true }, slot.viewId);
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>???</strong><br>
                Status: <span class="codexWild">LOCKED</span><br>
                Level: ?/20<br>
                Next Req: ???
            `;
        } else {
            let pigReq = getLevelRequirement('pig', slot.pig.level);
            renderMiniPet(slot.pig, slot.viewId);
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>${slot.pig.level >= 2 ? slot.pig.label : '???'}</strong><br>
                Status: <span class="${slot.pig.level >= 2 ? 'codexTamed' : 'codexWild'}">${slot.pig.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
                Level: ${slot.pig.level}/20<br>
                Next Req: ${slot.pig.level < 20 ? '🍪' + pigReq.food + ' 💧' + pigReq.water : 'MAX'}
            `;
        }
        let renameEl = document.getElementById(slot.renameId);
        if (renameEl) renameEl.style.display = (region4Unlocked && slot.pig.level >= 2) ? 'block' : 'none';
    });

    // Region 7 panda AND Region 8 monkeys — both gated behind the same stricter unlock
    // condition: pets in Regions 1-3 at Lv10+ and pets in Regions 4-6 at Lv5+ — see
    // isJungleTierUnlocked() in world.js (single source of truth, also used by main.js
    // and input.js).
    let jungleTierUnlocked = isJungleTierUnlocked();

    if (panda) {
        if (!jungleTierUnlocked) {
            renderMiniPet({ type: 'panda', level: 1, isLocked: true }, 'viewPanda');
            document.getElementById('infoPanda').innerHTML = `
                <strong>???</strong><br>
                Status: <span class="codexWild">LOCKED</span><br>
                Level: ?/20<br>
                Next Req: ???
            `;
        } else {
            let pandaReq = getLevelRequirement('panda', panda.level);
            renderMiniPet(panda, 'viewPanda');
            document.getElementById('infoPanda').innerHTML = `
                <strong>${panda.level >= 2 ? panda.label : '???'}</strong><br>
                Status: <span class="${panda.level >= 2 ? 'codexTamed' : 'codexWild'}">${panda.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
                Level: ${panda.level}/20<br>
                Next Req: ${panda.level < 20 ? '🍪' + pandaReq.food + ' 💧' + pandaReq.water : 'MAX'}
            `;
        }
        document.getElementById('renameBoxPanda').style.display = (jungleTierUnlocked && panda.level >= 2) ? 'block' : 'none';
    }

    // Region 8 monkeys — same jungleTierUnlocked gate as the panda, same "single
    // resource" Codex format as the bears (bananas instead of food/water).
    const monkey1 = petsByRegion[8] ? petsByRegion[8][0] : null;
    const monkey2 = petsByRegion[8] ? petsByRegion[8][1] : null;

    [ { monkey: monkey1, viewId: 'viewMonkey1', infoId: 'infoMonkey1', renameId: 'renameBoxMonkey1' },
      { monkey: monkey2, viewId: 'viewMonkey2', infoId: 'infoMonkey2', renameId: 'renameBoxMonkey2' }
    ].forEach(slot => {
        if (!slot.monkey) return;

        if (!jungleTierUnlocked) {
            renderMiniPet({ type: 'monkey', level: 1, isLocked: true }, slot.viewId);
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>???</strong><br>
                Status: <span class="codexWild">LOCKED</span><br>
                Level: ?/20<br>
                Next Req: ???
            `;
        } else {
            let monkeyReq = getLevelRequirement('monkey', slot.monkey.level);
            renderMiniPet(slot.monkey, slot.viewId);
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>${slot.monkey.level >= 2 ? slot.monkey.label : '???'}</strong><br>
                Status: <span class="${slot.monkey.level >= 2 ? 'codexTamed' : 'codexWild'}">${slot.monkey.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
                Level: ${slot.monkey.level}/20<br>
                Next Req: ${slot.monkey.level < 20 ? '🍌 ' + monkeyReq + ' Bananas' : 'MAX'}
            `;
        }
        let renameEl = document.getElementById(slot.renameId);
        if (renameEl) renameEl.style.display = (jungleTierUnlocked && slot.monkey.level >= 2) ? 'block' : 'none';
    });
}

const codexOverlay = document.getElementById('codexOverlay');
const openCodexBtn = document.getElementById('openCodexBtn');
const codexClose = document.getElementById('codexClose');

// Consolidated MENU overlay — houses the PETS/BAG/CHAR buttons (still the same
// elements/ids above, just relocated into the menu). Opening one of them shows that
// screen layered on top of the menu (z-index 10000 vs. the menu's 9000); closing it
// reveals the menu again underneath, since this never hides the menu itself.
const menuOverlay = document.getElementById('menuOverlay');
const openMenuBtn = document.getElementById('openMenuBtn');
const menuClose = document.getElementById('menuClose');

const handleOpenMenu = (e) => {
    if (e) e.preventDefault();
    if (menuOverlay) menuOverlay.style.display = 'flex';
};

const handleCloseMenu = (e) => {
    if (e) e.preventDefault();
    if (menuOverlay) menuOverlay.style.display = 'none';
};

if (openMenuBtn) {
    openMenuBtn.addEventListener('touchstart', handleOpenMenu, { passive: false });
    openMenuBtn.addEventListener('mousedown', handleOpenMenu);
}
if (menuClose) {
    menuClose.addEventListener('touchstart', handleCloseMenu, { passive: false });
    menuClose.addEventListener('mousedown', handleCloseMenu);
}

const handleOpenCodex = (e) => {
    if (e) e.preventDefault();
    updateCodexData();
    if (codexOverlay) codexOverlay.style.display = 'flex';
};

const handleCloseCodex = (e) => {
    if (e) e.preventDefault();
    if (codexOverlay) codexOverlay.style.display = 'none';
};

if (openCodexBtn) {
    openCodexBtn.addEventListener('touchstart', handleOpenCodex, { passive: false });
    openCodexBtn.addEventListener('mousedown', handleOpenCodex);
}
if (codexClose) {
    codexClose.addEventListener('touchstart', handleCloseCodex, { passive: false });
    codexClose.addEventListener('mousedown', handleCloseCodex);
}

const characterOverlay = document.getElementById('characterOverlay');
const openCharacterBtn = document.getElementById('openCharacterBtn');
const characterClose = document.getElementById('characterClose');

// Renders the Character screen's live contents: name, level, the cumulative % bonuses
// currently in effect (straight from getCharacterBonuses() in state.js, so it can never
// drift from what's actually applied to foraging/gathering), and the full perk
// checklist with already-reached milestones highlighted — same visual treatment as a
// pet's Level Perks list in showPetDetail().
function updateCharacterScreen() {
    const nameDisplay = document.getElementById('characterNameDisplay');
    const levelValue = document.getElementById('characterLevelValue');
    const bonusList = document.getElementById('characterBonusList');
    const perksList = document.getElementById('characterPerksList');

    if (nameDisplay) nameDisplay.textContent = character.name || 'Player';
    if (levelValue) levelValue.textContent = character.level;

    if (bonusList && typeof getCharacterBonuses === 'function') {
        let b = getCharacterBonuses(character.level);
        const pct = (mult) => Math.round((mult - 1) * 100);
        bonusList.innerHTML = `
            🍪💧 Pet food/water gain: <strong>+${pct(b.petFoodWater)}%</strong><br>
            🍯 Pet honey gain: <strong>+${pct(b.petHoney)}%</strong><br>
            🐟 Pet fish gain: <strong>+${pct(b.petFish)}%</strong><br>
            🪙 Coin gain: <strong>+${pct(b.coin)}%</strong><br>
            🖐️ Manual gather (walking over food/water): <strong>+${pct(b.manualGather)}%</strong>
        `;
    }

    if (perksList && typeof CHARACTER_LEVEL_PERKS !== 'undefined') {
        while (perksList.firstChild) perksList.removeChild(perksList.firstChild);
        CHARACTER_LEVEL_PERKS.forEach(p => {
            let li = document.createElement('li');
            let reached = character.level >= p.level;
            li.style.color = reached ? '#2ecc71' : '#7f8c8d';
            li.textContent = `Lv.${p.level}: ${p.text}`;
            perksList.appendChild(li);
        });
    }
}

const handleOpenCharacter = (e) => {
    if (e) e.preventDefault();
    updateCharacterScreen();
    if (characterOverlay) characterOverlay.style.display = 'flex';
};

const handleCloseCharacter = (e) => {
    if (e) e.preventDefault();
    if (characterOverlay) characterOverlay.style.display = 'none';
};

if (openCharacterBtn) {
    openCharacterBtn.addEventListener('touchstart', handleOpenCharacter, { passive: false });
    openCharacterBtn.addEventListener('mousedown', handleOpenCharacter);
}
if (characterClose) {
    characterClose.addEventListener('touchstart', handleCloseCharacter, { passive: false });
    characterClose.addEventListener('mousedown', handleCloseCharacter);
}

// Renaming the character works the same way as renaming a pet (bindPetRename), just
// against character.name instead of a petsByRegion slot.
const btnRenameCharacter = document.getElementById('btnRenameCharacter');
const characterNameInput = document.getElementById('characterNameInput');
if (btnRenameCharacter && characterNameInput) {
    const handleCharacterRename = () => {
        let nameVal = characterNameInput.value.trim();
        if (nameVal) {
            character.name = nameVal;
            characterNameInput.value = '';
            saveGameProgress();
            updateCharacterScreen();
            alert(`✨ Name successfully updated to: ${nameVal}!`);
        }
    };
    btnRenameCharacter.addEventListener('click', handleCharacterRename);
}

const settingsBtn = document.getElementById('settingsBtn');
const devPanel = document.getElementById('devPanel');
const closeDev = document.getElementById('closeDev');

const handleSettings = (e) => {
    if (e) e.preventDefault();
    let pass = prompt("Enter developer authorization code word:");
    if (pass === "dev") {
        if (devPanel) devPanel.style.display = "flex";
    }
};

if (settingsBtn) {
    settingsBtn.addEventListener('touchstart', handleSettings, { passive: false });
    settingsBtn.addEventListener('mousedown', handleSettings);
}

if (closeDev && devPanel) {
    closeDev.addEventListener('click', () => { 
        devPanel.style.display = "none"; 
    });
}

const btnAddFood = document.getElementById('devAddFood');
const btnAddWater = document.getElementById('devAddWater');
const btnWipeSave = document.getElementById('devWipeSave');
const btnInstaTame = document.getElementById('devInstaTame');

if (btnAddFood) {
    btnAddFood.addEventListener('click', () => {
        inventory.food += 50;
        updateUI();
    });
}

if (btnAddWater) {
    btnAddWater.addEventListener('click', () => {
        inventory.water += 50;
        updateUI();
    });
}

if (btnWipeSave) {
    btnWipeSave.addEventListener('click', () => {
        if (confirm("⚠️ WARNING: Delete all save data? This resets everything!")) {
            // 1. Wipe the local storage cache completely clean
            localStorage.removeItem('just_a_little_leisure_save_v2');
            
            // 2. Zero out your active resource trackers securely
            inventory.food = 0; 
            inventory.water = 0; 
            inventory.honey = 0;
            inventory.fish = 0; 
            inventory.coins = 0; 
            inventory.eggs = 0;
            inventory.bananas = 0;
            if (typeof region4Hive !== 'undefined' && region4Hive) region4Hive.honey = 0;
            
            // 3. FIXED: Hard-reset all pet variables back to Level 1 wild status instantly
            for (let r in petsByRegion) {
                if (Array.isArray(petsByRegion[r])) {
                    petsByRegion[r].forEach(pet => {
                        pet.level = (pet.type === 'bee') ? 1 : 1; // Resets all levels to baseline
                        pet.foodEaten = 0;
                        pet.waterEaten = 0;
                        pet.state = 'wander';
                        pet.pickNewWanderTarget();
                    });
                }
            }

            // 4. Force a fresh interface drawing update to securely lock panels before reloading
            if (typeof updateCodexData === 'function') updateCodexData();
            updateUI();
            
            // 5. Hard reload the page layout to compile fresh files
            window.location.reload();
        }
    });
}

if (btnInstaTame) {
    btnInstaTame.addEventListener('click', () => {
        let activePets = petsByRegion[currentRegion];
        if (Array.isArray(activePets)) {
            activePets.forEach(pet => {
                // FIXED: Pushes your pets straight to your new maximum Level 20 cap!
                pet.level = 20; 
                pet.foodEaten = 0;
                pet.waterEaten = 0;
                pet.pickNewWanderTarget();
                if (pet.state === 'idle' || pet.state === 'whistled') {
                    pet.state = 'wander';
                }
            });
            updateUI();
            if (typeof updateCodexData === 'function') updateCodexData();
            saveGameProgress();
        }
    });
}

// --- FIXED & UNIFIED PET RENAMING HANDLERS ENGINE ---
function bindPetRename(btnId, inputId, regionIdx, petIdx) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    
    if (btn && input) {
        const handleRename = () => {
            let nameVal = input.value.trim();
            if (nameVal && petsByRegion && petsByRegion[regionIdx] && petsByRegion[regionIdx][petIdx]) {
                // Pushes the string straight into the live simulation memory array slot!
                petsByRegion[regionIdx][petIdx].label = nameVal;
                
                input.value = ''; // Flush input bar field
                
                saveGameProgress();
                updateUI();
                if (typeof updateCodexData === 'function') updateCodexData();
                
                alert(`✨ Name successfully updated to: ${nameVal}!`);
            }
        };
        btn.addEventListener('click', handleRename);
    }
}

// Bind all 8 pets securely to their exact 2D array coordinates mapping slots:
bindPetRename('btnRenameDog', 'inputDog', 1, 0);       // Region 1, Dog
bindPetRename('btnRenameCat', 'inputCat', 1, 1);       // Region 1, Cat
bindPetRename('btnRenameElephant', 'inputElephant', 2, 0); // Region 2, Elephant
bindPetRename('btnRenameSquirrel', 'inputSquirrel', 3, 0); // Region 3, Squirrel
bindPetRename('btnRenameChicken', 'inputChicken', 3, 1);   // Region 3, Chicken
bindPetRename('btnRenameBee', 'inputBee', 4, 0);       // Region 4, Bee (Base)
bindPetRename('btnRenameBear1', 'inputBear1', 5, 0);   // Region 5, Bear
bindPetRename('btnRenameBear2', 'inputBear2', 5, 1);   // Region 5, Bow Bear (female)
bindPetRename('btnRenameMonkey1', 'inputMonkey1', 8, 0); // Region 8, Monkey
bindPetRename('btnRenameMonkey2', 'inputMonkey2', 8, 1); // Region 8, Coco
bindPetRename('btnRenamePig1', 'inputPig1', 6, 0);     // Region 6, Pig (pink)
bindPetRename('btnRenamePig2', 'inputPig2', 6, 1);     // Region 6, Mud Pig (grey)
bindPetRename('btnRenamePanda', 'inputPanda', 7, 0);   // Region 7, Panda

// Bird uses its own handler rather than bindPetRename's fixed [regionIdx][petIdx] lookup,
// since it may be physically away on an excursion (not sitting at petsByRegion[3][2]) —
// renames the permanent birdPet reference (world.js) directly instead.
(function bindBirdRename() {
    const btn = document.getElementById('btnRenameBird');
    const input = document.getElementById('inputBird');
    if (btn && input) {
        btn.addEventListener('click', () => {
            let nameVal = input.value.trim();
            if (nameVal && typeof birdPet !== 'undefined' && birdPet) {
                birdPet.label = nameVal;
                input.value = '';
                saveGameProgress();
                updateUI();
                if (typeof updateCodexData === 'function') updateCodexData();
                alert(`✨ Name successfully updated to: ${nameVal}!`);
            }
        });
    }
})();

const handleOpenBag = (e) => {
    if (e) e.preventDefault();
    updateUI(); // Refreshes your item quantities right before displaying the card
    if (bagOverlay) bagOverlay.style.display = 'flex';
};

const handleCloseBag = (e) => {
    if (e) e.preventDefault();
    if (bagOverlay) bagOverlay.style.display = 'none';
};

// Bind touchstart and mousedown to make it feel highly responsive on Android touch devices
if (openBagBtn) {
    openBagBtn.addEventListener('touchstart', handleOpenBag, { passive: false });
    openBagBtn.addEventListener('mousedown', handleOpenBag);
}
if (bagClose) {
    bagClose.addEventListener('touchstart', handleCloseBag, { passive: false });
    bagClose.addEventListener('mousedown', handleCloseBag);
}

if (spawnBeeBtn) {
    const handlePurchaseBee = (e) => {
        if (e) e.preventDefault();
        
        // 1. Array Safeguard
        if (!petsByRegion[4]) petsByRegion[4] = [];
        
        // 2. Strict Capacity Threshold Lock
        if (petsByRegion[4].length >= 3) {
            alert("🍯 The Hive structure has reached its maximum capacity of 3 total bees!");
            spawnBeeBtn.style.display = 'none';
            return;
        }

        // 3. Financial Ledger Transaction Check
        if (inventory.coins < 10) {
            alert(`🪙 Insufficient Coins! Spawning a new bee costs 10 Coins. (You have: ${inventory.coins})`);
            return;
        }

        // 4. Process Checkout Deductions
        inventory.coins -= 10;
        updateUI();

        // 5. Extract Base Name Continuity Parameters
        let workerNumber = petsByRegion[4].length; 
        let cleanLabelName = `Worker Bee ${workerNumber}`;

        // 6. Create the new bee via the shared factory (same setup the starter bee
        // gets, including honeyCarried — this is the fix for bought bees never
        // capping out or dropping honey off at the hive).
        let newBeeCopy = createBee(cleanLabelName);

        // Push directly into the engine's active physics cycle loops
        petsByRegion[4].push(newBeeCopy);
        
        saveGameProgress();
        
        // Auto-hide the button immediately if this purchase hits the maximum capacity ceiling limit
        if (petsByRegion[4].length >= 3) {
            spawnBeeBtn.style.display = 'none';
        }
    };

    spawnBeeBtn.addEventListener('touchstart', handlePurchaseBee, { passive: false });
    spawnBeeBtn.addEventListener('mousedown', handlePurchaseBee);
}
