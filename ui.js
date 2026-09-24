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

    // Adds one line per tier of a PERK_CHANCES entry (state.js): the first tier describes the perk,
    // later tiers say the chance went up. The numbers come straight from the table the game logic
    // rolls against, so this text can't disagree with what actually happens.
    const addChance = (key, firstText, raisedText) => {
        (PERK_CHANCES[key] || []).forEach((tier, i) => {
            let [lvl, chance] = tier;
            let pct = Math.round(chance * 100) + '%';
            perks.push({ level: lvl, text: i === 0 ? firstText(pct) : raisedText(pct) });
        });
    };

    if (type === 'dog') {
        // Written by hand (not addChance) so the Lv25 coin-bump line can sit between the
        // two dogDig chance tiers in level order. Every number still comes straight from
        // PERK_CHANCES.dogDig / DOG_DIG_BONUS_COIN_LEVEL / DOG_DIG_BONUS_COIN_AMOUNT
        // (state.js) — same "can't disagree with what actually happens" guarantee as addChance.
        const digTiers = PERK_CHANCES.dogDig || [];
        const [digLvl1, digChance1] = digTiers[0] || [20, 0];
        const [digLvl2, digChance2] = digTiers[1] || [30, 0];
        perks.push({ level: digLvl1, text: `${Math.round(digChance1 * 100)}% chance per forage to dig for a bonus coin` });
        perks.push({ level: DOG_DIG_BONUS_COIN_LEVEL, text: `Digging now awards ${DOG_DIG_BONUS_COIN_AMOUNT} coins instead of 1` });
        perks.push({ level: digLvl2, text: `Digging chance doubles to ${Math.round(digChance2 * 100)}%` });
    } else if (type === 'chicken') {
        addChance('chickenEgg', c => `${c} chance per forage to lay a collectible egg`, c => `Egg chance increases to ${c}`);
        perks.push({ level: CHAIN_EGG_MIN_LEVEL, text: `Chain egg: after laying an egg, the next forage gets +${Math.round(CHAIN_EGG_STEP * 100)}% egg chance, growing another +${Math.round(CHAIN_EGG_STEP * 100)}% with each egg in a row (up to +${Math.round(CHAIN_EGG_MAX * 100)}%). A forage with no egg resets it` });
    } else if (type === 'elephant') {
        addChance('elephantPlay', c => `${c} chance to start a "catch me" play minigame (+5 coins)`, c => `Play chance increases to ${c}`);
    } else if (type === 'squirrel') {
        addChance('squirrelBoost', c => `${c} chance per forage to make every pet in this region ${Math.round((SQUIRREL_BOOST_MULT - 1) * 100)}% faster for ${SQUIRREL_BOOST_SECONDS}s`, c => `Speed-boost chance increases to ${c}`);
    } else if (type === 'pig') {
        addChance('pigMud', c => `${c} chance per forage to play in mud +2 coins (only while standing in the mud patch)`, c => `Mud-play chance increases to ${c}`);
    } else if (type === 'cat') {
        addChance('catDouble', c => `${c} chance per forage to double the food/water gained`, c => `Double-forage chance increases to ${c}`);
        addChance('catSchrodinger', c => `${c} chance per forage to enter Schr\u00F6dinger's state`, c => `Schr\u00F6dinger's state chance increases to ${c}`);
    } else if (type === 'bird') {
        addChance('birdFly', c => `${c} chance per forage to fly off on a ${BIRD_EXCURSION_SECONDS}s excursion to a random unlocked region`, c => `Chance to fly off increases to ${c}`);
        perks.push({ level: 20, text: `Regions 1, 2, 6, 7: forages there like normal (its own yield plus your usual bonuses) and speeds up every pet already there by ${Math.round((BIRD_VISIT_PET_SPEED_MULT - 1) * 100)}%` });
        perks.push({ level: 20, text: `Region 4: speeds up the bees by ${Math.round((BIRD_VISIT_BEE_SPEED_MULT - 1) * 100)}% and boosts honey gained per hive trip by ${Math.round((BIRD_VISIT_HONEY_GAIN_MULT - 1) * 100)}%` });
        perks.push({ level: 20, text: `Region 5: boosts the bear's catch by ${Math.round((BIRD_VISIT_FISH_YIELD_MULT - 1) * 100)}% and speeds up its whole fishing cycle by ${Math.round((BIRD_VISIT_FISH_SPEED_MULT - 1) * 100)}%` });
        perks.push({ level: 20, text: `Region 8: speeds up the monkeys by ${Math.round((BIRD_VISIT_PET_SPEED_MULT - 1) * 100)}%` });
        perks.push({ level: 20, text: `Region 9: speeds up sugar gliders' stamina regen while resting by ${Math.round((BIRD_VISIT_GLIDER_STAMINA_MULT - 1) * 100)}%` });
    } else if (type === 'panda') {
        addChance('pandaFever', c => `${c} chance per forage (while you're in Region 7) to start "Bamboo Fever" -- choose Play to collect bamboo for coins while it naps, or Starve and it flees you for 30s`, c => `Bamboo Fever chance increases to ${c}`);
    } else if (type === 'bee') {
        perks.push({ level: 1, text: 'Carries 1 honey load before returning to the hive' });
        BEE_TIERS.forEach((tier, i) => {
            if (i === 0) return;
            let prev = BEE_TIERS[i - 1];
            let text = `Honey capacity increases to ${tier[1]}`;
            if (tier[2] !== prev[2]) text += `, and time to forage a flower decreases to ${tier[2].toFixed(1)}s`;
            perks.push({ level: tier[0], text: text });
        });
        addChance('beeDoubleHoney', c => `${c} chance of double honey`, c => `Double-honey chance increases to ${c}`);
        addChance('beeDoubleExp', c => `${c} chance for a flower to give double exp`, c => `Double-exp chance increases to ${c}`);
    } else if (type === 'bear') {
        perks.push({ level: 5, text: `Starts fishing at the lake: catches ${getBearFishPerCycle(5)} fish per cycle, then waits ${getBearWaitRange(5).base}-${getBearWaitRange(5).base + getBearWaitRange(5).spread}s before the next trip (fishing itself takes ${BEAR_FISHING_ACTION_SECONDS}s)` });
        perks.push({ level: 10, text: `Wait between trips shortens to ${getBearWaitRange(10).base}-${getBearWaitRange(10).base + getBearWaitRange(10).spread}s, and catch increases to ${getBearFishPerCycle(10)} fish per cycle` });
        perks.push({ level: 15, text: `Wait between trips shortens further, to ${getBearWaitRange(15).base}-${getBearWaitRange(15).base + getBearWaitRange(15).spread}s` });
        perks.push({ level: 20, text: `Catch is ${getBearFishPerCycle(20)} fish per cycle` });
        perks.push({ level: 25, text: `Catch is ${getBearFishPerCycle(25)} fish per cycle` });
        addChance('bearDoubleFish', c => `${c} chance of a double catch`, c => `Double-catch chance increases to ${c}`);
    } else if (type === 'monkey') {
        if (typeof FORAGE_TIERS !== 'undefined' && FORAGE_TIERS.monkey) {
            FORAGE_TIERS.monkey.forEach(tier => {
                let [lvl, bananas] = tier;
                if (lvl === 1) return; // level 1 is the base rate, not a milestone to list
                perks.push({ level: lvl, text: `Forage yield increases to +${bananas} banana${bananas === 1 ? '' : 's'} per forage` });
            });
        }
        addChance('monkeySwing', c => `${c} chance per forage to swing on the vines for 20s, then +5 coins`, c => `Vine-swing chance increases to ${c}`);
    } else if (type === 'glider') {
        // What it does depends on the region it's dropped in — all of it needs stamina above 0.
        perks.push({ level: 1, text: 'Dropped in Regions 1, 2, 3, 6 or 7: forages food & water (1 stamina per object picked up)' });
        perks.push({ level: 1, text: 'Dropped in Region 4: bees produce +50% honey (1 stamina per 2 seconds)' });
        perks.push({ level: 1, text: 'Dropped in Region 5: bears fish 25% faster (1 stamina per 2 seconds)' });
        perks.push({ level: 1, text: 'Dropped in Region 8: monkeys forage +50% more (1 stamina per 2 seconds)' });
        perks.push({ level: 1, text: 'Dropped in Region 9: rests in a tree to recharge (+1 stamina per 2 seconds)' });
        perks.push({ level: GLIDER_SPEED_BOOST_MIN_LEVEL, text: `Speeds up every pet in whatever region it's dropped in by +${Math.round(GLIDER_SPEED_BOOST_PER_GLIDER * 100)}%` });
        if (typeof GLIDER_STAMINA_TIERS !== 'undefined') {
            GLIDER_STAMINA_TIERS.forEach(tier => {
                let [lvl, maxStamina] = tier;
                if (lvl === 1) return; // level 1 is the base stamina, not a milestone to list
                perks.push({ level: lvl, text: `Max stamina increases to ${maxStamina}` });
            });
        }
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
    title.textContent = `${pet.label} — Lv.${pet.level}`;
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
        let cap = getBeeTier(pet.level).capacity;
        yieldSection.innerHTML = `<strong>Honey Capacity</strong><br>🍯 carries up to ${cap} before returning to the hive`;
    } else if (pet.type === 'bear') {
        let fishPerCycle = Math.max(1, getBearFishPerCycle(pet.level));
        let doubleChance = getPerkChance('bearDoubleFish', pet.level);
        yieldSection.innerHTML = `<strong>Fishing</strong><br>\u2022 catches ${fishPerCycle} fish per cycle (starts at Lv.5, cycle speeds up at Lv.10 and Lv.15${doubleChance > 0 ? ', ' + Math.round(doubleChance * 100) + '% chance of a double catch' : ''})`;
    }
    if (pet.type === 'glider') {
        // The generic food/water line above is what it forages in Regions 1, 2, 3, 6 and 7;
        // add its stamina (the resource every glider ability spends).
        yieldSection.innerHTML += `<br>⚡ Max stamina ${getGliderMaxStamina(pet.level)} (currently ${Math.floor(pet.stamina)})`;
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
        // Region 2 has two elephants, and either can start the tag game — check them all.
        let elephantPlaying = false;
        if (typeof petsByRegion !== 'undefined' && petsByRegion && Array.isArray(petsByRegion[2])) {
            elephantPlaying = petsByRegion[2].some(p => p.type === 'elephant' && isPetAvailable(p) && p.state &&
                (p.state.startsWith('playing') || p.state === 'playing_wait_for_move'));
        }

        // Cat's Schrödinger box: unlike the elephant check above (which doesn't care
        // about distance), the PLAY button here only shows once the player is actually
        // standing near the boxed cat — per spec, the player has to "go over to it".
        activeSchrodingerCat = null;
        if (typeof currentRegion !== 'undefined' && currentRegion === 1 &&
            typeof petsByRegion !== 'undefined' && petsByRegion && petsByRegion[1]) {
            petsByRegion[1].forEach(pet => {
                if (pet.type === 'cat' && isPetAvailable(pet) && pet.state === 'schrodinger') {
                    let dx = (pet.x + pet.size / 2) - (player.x + player.size / 2);
                    let dy = (pet.y + pet.size / 2) - (player.y + player.size / 2);
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist < 70) activeSchrodingerCat = pet;
                }
            });
        }

        const giveLabel = (activeSchrodingerCat || elephantPlaying) ? 'PLAY' : 'GIVE';

        // Sugar gliders (Region 9): when one is within reach the main button becomes TAKE, and
        // while the player is carrying one it becomes DROP (see getGliderButtonMode() in
        // world.js and handleGliderButton() in input.js). Since that takes the place of the
        // usual GIVE / PLAY, a small auxiliary button carrying the normal GIVE / PLAY label
        // appears beside it for as long as the main one is busy — otherwise a glider (or
        // anything else nearby) couldn't be fed, and the cat / elephant games couldn't be
        // played, while a glider is in reach or in hand.
        const gliderMode = (typeof getGliderButtonMode === 'function') ? getGliderButtonMode() : 'normal';
        if (gliderMode === 'take') interactBtn.textContent = 'TAKE';
        else if (gliderMode === 'drop') interactBtn.textContent = 'DROP';
        else interactBtn.textContent = giveLabel;

        const giveAuxBtn = document.getElementById('giveAuxBtn');
        if (giveAuxBtn) {
            giveAuxBtn.style.display = (gliderMode === 'normal') ? 'none' : 'flex';
            giveAuxBtn.textContent = giveLabel;
        }
    }

    const charLevel = document.getElementById('charLevel');
    const charXP = document.getElementById('charXP');
    const charNextXP = document.getElementById('charNextXP');
    const charXPBarFill = document.getElementById('charXPBarFill');

    if (charLevel) charLevel.textContent = character.level;
    // Floored: the Wisdom Potion's +50% can leave fractional XP (e.g. 1.5) internally.
    if (charXP) charXP.textContent = Math.floor(character.xp);
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

    // Same idea for the Shop: if it's open and something it displays changed (gold,
    // eggs, fish — e.g. a bear finishing a catch while the player is browsing), redraw it.
    const shopOverlayEl = document.getElementById('shopOverlay');
    if (shopOverlayEl && shopOverlayEl.style.display !== 'none' && typeof refreshShopIfChanged === 'function') {
        refreshShopIfChanged();
    }

    // ...and the Perk Tree (e.g. a level-up while it's open adds a perk point).
    const perkTreeOverlayEl = document.getElementById('perkTreeOverlay');
    if (perkTreeOverlayEl && perkTreeOverlayEl.style.display !== 'none' && typeof refreshPerkTreeIfChanged === 'function') {
        refreshPerkTreeIfChanged();
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
    } else if (pet && (pet.type === 'bee' || pet.type === 'glider')) {
        // Autonomous Bee unlocks immediately at Level 1+; so do the sugar gliders, which are
        // tamed from level 1 (their portrait is only masked by the explicit isLocked flag
        // that updateCodexData() passes while Region 9 is still locked).
        isLocked = (petLvl < 1);
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
            // Same sprite as in the world (front-facing sitting pose makes the best portrait).
            drawPetSprite(mctx, 'dog', 'sit', 0, ox, oy, 1);
        } else if (pet.type === 'elephant') {
            // Same sprite as in the world — idle frame 0 (see PET_SPRITES.elephant /
            // .elephantBow in entities.js), matching the dog/cat portraits above.
            drawPetSprite(mctx, pet.bowColor ? 'elephantBow' : 'elephant', 'idle', 0, ox, oy, 1);
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
            if (pet.bowColor) {
                mctx.fillStyle = pet.bowColor;
                mctx.beginPath();
                mctx.moveTo(ox + 18, oy - 1);
                mctx.lineTo(ox + 12, oy - 5);
                mctx.lineTo(ox + 12, oy + 2);
                mctx.closePath();
                mctx.fill();
                mctx.beginPath();
                mctx.moveTo(ox + 18, oy - 1);
                mctx.lineTo(ox + 24, oy - 5);
                mctx.lineTo(ox + 24, oy + 2);
                mctx.closePath();
                mctx.fill();
                mctx.fillStyle = '#1e8449';
                mctx.fillRect(ox + 16.5, oy - 3, 3, 3);
            }
        } else if (pet.type === 'cat') {
            drawPetSprite(mctx, 'cat', 'walk', 1, ox, oy, 1);
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
        } else if (pet.type === 'glider') {
            // One shared model (entities.js) — the codex portrait can't drift from the in-world
            // sprite, and Miss Glider's red bow comes along for free via bowColor.
            drawGliderModel(mctx, ox, oy, { bowColor: pet.bowColor });
        }
    }

function updateCodexData() {
    const dog = petsByRegion[1][0];
    const cat = petsByRegion[1][1];
    const elephant1 = petsByRegion[2][0];
    const elephant2 = petsByRegion[2][1];   // the Bow Elephant
    const squirrel = petsByRegion[3][0];
    const chicken = petsByRegion[3][1];
    const bird = (typeof birdPet !== 'undefined') ? birdPet : petsByRegion[3][2];
    const bee = petsByRegion[4][0];
    const panda = petsByRegion[7][0];

    renderMiniPet(dog, 'viewDog');
    renderMiniPet(cat, 'viewCat');
    renderMiniPet(squirrel, 'viewSquirrel');
    renderMiniPet(chicken, 'viewChicken');
    renderMiniPet(bird, 'viewBird');

    let dogReq = getLevelRequirement('dog', dog.level);
    document.getElementById('infoDog').innerHTML = `
        <strong>${dog.level >= 2 ? dog.label : '???'}</strong><br>
        Status: <span class="${dog.level >= 2 ? 'codexTamed' : 'codexWild'}">${dog.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${dog.level >= 2 ? dog.level + '/' + MAX_PET_LEVEL : '?/' + MAX_PET_LEVEL}<br>
        Next Req: ${dog.level < 2 ? '???' : (dog.level < MAX_PET_LEVEL ? '🍪' + dogReq.food + ' 💧' + dogReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxDog').style.display = dog.level >= 2 ? 'block' : 'none';

    let catReq = getLevelRequirement('cat', cat.level);
    document.getElementById('infoCat').innerHTML = `
        <strong>${cat.level >= 2 ? cat.label : '???'}</strong><br>
        Status: <span class="${cat.level >= 2 ? 'codexTamed' : 'codexWild'}">${cat.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${cat.level >= 2 ? cat.level + '/' + MAX_PET_LEVEL : '?/' + MAX_PET_LEVEL}<br>
        Next Req: ${cat.level < 2 ? '???' : (cat.level < MAX_PET_LEVEL ? '🍪' + catReq.food + ' 💧' + catReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxCat').style.display = cat.level >= 2 ? 'block' : 'none';

    let birdReq = getLevelRequirement('bird', bird.level);
    document.getElementById('infoBird').innerHTML = `
        <strong>${bird.level >= 2 ? bird.label : '???'}</strong><br>
        Status: <span class="${bird.level >= 2 ? 'codexTamed' : 'codexWild'}">${bird.level >= 2 ? 'TAMED' : 'WILD'}${bird.excursionActive ? ' (away)' : ''}</span><br>
        Level: ${bird.level >= 2 ? bird.level + '/' + MAX_PET_LEVEL : '?/' + MAX_PET_LEVEL}<br>
        Next Req: ${bird.level < 2 ? '???' : (bird.level < MAX_PET_LEVEL ? '🍪' + birdReq.food + ' 💧' + birdReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxBird').style.display = bird.level >= 2 ? 'block' : 'none';


    // Both elephants use the same requirement curve (getLevelRequirement is per type).
    [ { pet: elephant1, viewId: 'viewElephant',  infoId: 'infoElephant',  renameId: 'renameBoxElephant' },
      { pet: elephant2, viewId: 'viewElephant2', infoId: 'infoElephant2', renameId: 'renameBoxElephant2' }
    ].forEach(slot => {
        if (!slot.pet) return;
        renderMiniPet(slot.pet, slot.viewId);

        let elReq = getLevelRequirement('elephant', slot.pet.level);
        let infoEl = document.getElementById(slot.infoId);
        if (infoEl) infoEl.innerHTML = `
            <strong>${slot.pet.level >= 2 ? slot.pet.label : '???'}</strong><br>
            Status: <span class="${slot.pet.level >= 2 ? 'codexTamed' : 'codexWild'}">${slot.pet.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
            Level: ${slot.pet.level >= 2 ? slot.pet.level + '/' + MAX_PET_LEVEL : '?/' + MAX_PET_LEVEL}<br>
            Next Req: ${slot.pet.level < 2 ? '???' : (slot.pet.level < MAX_PET_LEVEL ? '🍪' + elReq.food + ' 💧' + elReq.water : 'MAX')}
        `;

        let renameEl = document.getElementById(slot.renameId);
        if (renameEl) renameEl.style.display = slot.pet.level >= 2 ? 'block' : 'none';
    });

    let sqReq = getLevelRequirement('squirrel', squirrel.level);
    document.getElementById('infoSquirrel').innerHTML = `
        <strong>${squirrel.level >= 2 ? squirrel.label : '???'}</strong><br>
        Status: <span class="${squirrel.level >= 2 ? 'codexTamed' : 'codexWild'}">${squirrel.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${squirrel.level >= 2 ? squirrel.level + '/' + MAX_PET_LEVEL : '?/' + MAX_PET_LEVEL}<br>
        Next Req: ${squirrel.level < 2 ? '???' : (squirrel.level < MAX_PET_LEVEL ? '🍪' + sqReq.food + ' 💧' + sqReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxSquirrel').style.display = squirrel.level >= 2 ? 'block' : 'none';

    let chReq = getLevelRequirement('chicken', chicken.level);
    document.getElementById('infoChicken').innerHTML = `
        <strong>${chicken.level >= 2 ? chicken.label : '???'}</strong><br>
        Status: <span class="${chicken.level >= 2 ? 'codexTamed' : 'codexWild'}">${chicken.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${chicken.level >= 2 ? chicken.level + '/' + MAX_PET_LEVEL : '?/' + MAX_PET_LEVEL}<br>
        Next Req: ${chicken.level < 2 ? '???' : (chicken.level < MAX_PET_LEVEL ? '🍪' + chReq.food + ' 💧' + chReq.water : 'MAX')}
    `;

    document.getElementById('renameBoxChicken').style.display = chicken.level >= 2 ? 'block' : 'none';

    // Regions 4-9 are unlocked by buying them in the shop — see isRegionUnlocked() in
    // world.js (single source of truth, also used by main.js and input.js). Each region's
    // pets are hidden behind a "LOCKED" card until then.
    let region4Unlocked = isRegionUnlocked(4);
    let region5Unlocked = isRegionUnlocked(5);
    let region6Unlocked = isRegionUnlocked(6);
    let region7Unlocked = isRegionUnlocked(7);
    let region8Unlocked = isRegionUnlocked(8);
    let region9Unlocked = isRegionUnlocked(9);

    // 2. FIXED: Re-render the mini pet canvas *only* if unlocked, otherwise pass a dummy locked object
    if (!region4Unlocked) {
        // 1. Forces the mini-canvas renderer to draw a hidden black card profile with a question mark
        renderMiniPet({ type: 'bee', level: 1, isLocked: true }, 'viewBee'); 
        
        // 2. Overrides the text box with mystery information at the start of the game
        document.getElementById('infoBee').innerHTML = `
            <strong>???</strong><br>
            Status: <span class="codexWild">LOCKED</span><br>
            Level: ?/${MAX_PET_LEVEL}<br>
            Next Req: ???
        `;
    } else {
        // Displays full active taming metrics once the user breaks through the early zones!
        let beeReq = getLevelRequirement('bee', bee.level);
        renderMiniPet(bee, 'viewBee');
        
        document.getElementById('infoBee').innerHTML = `
            <strong>${bee.level >= 1 ? bee.label : '???'}</strong><br>
            Status: <span class="${bee.level >= 1 ? 'codexTamed' : 'codexWild'}">${bee.level >= 1 ? 'TAMED' : 'WILD'}</span><br>
            Level: ${bee.level}/${MAX_PET_LEVEL}<br>
            Next Req: ${bee.level < MAX_PET_LEVEL ? '🌸 ' + beeReq + ' Flowers' : 'MAX'}
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

        if (!region5Unlocked) {
            // 1. Forces the mini-canvas renderer to draw a hidden black card profile with a question mark
            renderMiniPet({ type: 'bear', level: 1, isLocked: true }, slot.viewId);

            // 2. Overrides the text box with mystery information at the start of the game
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>???</strong><br>
                Status: <span class="codexWild">LOCKED</span><br>
                Level: ?/${MAX_PET_LEVEL}<br>
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
                Level: ${slot.bear.level}/${MAX_PET_LEVEL}<br>
                Next Req: ${slot.bear.level < MAX_PET_LEVEL ? '🍯 ' + bearReq + ' Honey' : 'MAX'}
            `;
        }
        let renameEl = document.getElementById(slot.renameId);
        if (renameEl) renameEl.style.display = (region5Unlocked && slot.bear.level >= 2) ? 'block' : 'none';
    });

    // Region 6 pigs — gated behind region6Unlocked (Region 6 has to be bought in the shop).
    // Gracefully no-ops (via renderMiniPet's own `if (!miniCanvas) return;` and the
    // `document.getElementById(...)` calls below) until the corresponding elements
    // exist in index.html — see the HTML snippet for viewPig1/viewPig2 etc.
    const pig1 = petsByRegion[6] ? petsByRegion[6][0] : null;
    const pig2 = petsByRegion[6] ? petsByRegion[6][1] : null;

    [ { pig: pig1, viewId: 'viewPig1', infoId: 'infoPig1', renameId: 'renameBoxPig1' },
      { pig: pig2, viewId: 'viewPig2', infoId: 'infoPig2', renameId: 'renameBoxPig2' }
    ].forEach(slot => {
        if (!slot.pig) return;

        if (!region6Unlocked) {
            renderMiniPet({ type: 'pig', level: 1, isLocked: true }, slot.viewId);
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>???</strong><br>
                Status: <span class="codexWild">LOCKED</span><br>
                Level: ?/${MAX_PET_LEVEL}<br>
                Next Req: ???
            `;
        } else {
            let pigReq = getLevelRequirement('pig', slot.pig.level);
            renderMiniPet(slot.pig, slot.viewId);
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>${slot.pig.level >= 2 ? slot.pig.label : '???'}</strong><br>
                Status: <span class="${slot.pig.level >= 2 ? 'codexTamed' : 'codexWild'}">${slot.pig.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
                Level: ${slot.pig.level}/${MAX_PET_LEVEL}<br>
                Next Req: ${slot.pig.level < MAX_PET_LEVEL ? '🍪' + pigReq.food + ' 💧' + pigReq.water : 'MAX'}
            `;
        }
        let renameEl = document.getElementById(slot.renameId);
        if (renameEl) renameEl.style.display = (region6Unlocked && slot.pig.level >= 2) ? 'block' : 'none';
    });

    // Region 7 panda, Region 8 monkeys and Region 9 gliders — each behind its own purchase.

    if (panda) {
        if (!region7Unlocked) {
            renderMiniPet({ type: 'panda', level: 1, isLocked: true }, 'viewPanda');
            document.getElementById('infoPanda').innerHTML = `
                <strong>???</strong><br>
                Status: <span class="codexWild">LOCKED</span><br>
                Level: ?/${MAX_PET_LEVEL}<br>
                Next Req: ???
            `;
        } else {
            let pandaReq = getLevelRequirement('panda', panda.level);
            renderMiniPet(panda, 'viewPanda');
            document.getElementById('infoPanda').innerHTML = `
                <strong>${panda.level >= 2 ? panda.label : '???'}</strong><br>
                Status: <span class="${panda.level >= 2 ? 'codexTamed' : 'codexWild'}">${panda.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
                Level: ${panda.level}/${MAX_PET_LEVEL}<br>
                Next Req: ${panda.level < MAX_PET_LEVEL ? '🍪' + pandaReq.food + ' 💧' + pandaReq.water : 'MAX'}
            `;
        }
        document.getElementById('renameBoxPanda').style.display = (region7Unlocked && panda.level >= 2) ? 'block' : 'none';
    }

    // Region 8 monkeys — gated by region8Unlocked, same "single
    // resource" Codex format as the bears (bananas instead of food/water).
    const monkey1 = petsByRegion[8] ? petsByRegion[8][0] : null;
    const monkey2 = petsByRegion[8] ? petsByRegion[8][1] : null;

    [ { monkey: monkey1, viewId: 'viewMonkey1', infoId: 'infoMonkey1', renameId: 'renameBoxMonkey1' },
      { monkey: monkey2, viewId: 'viewMonkey2', infoId: 'infoMonkey2', renameId: 'renameBoxMonkey2' }
    ].forEach(slot => {
        if (!slot.monkey) return;

        if (!region8Unlocked) {
            renderMiniPet({ type: 'monkey', level: 1, isLocked: true }, slot.viewId);
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>???</strong><br>
                Status: <span class="codexWild">LOCKED</span><br>
                Level: ?/${MAX_PET_LEVEL}<br>
                Next Req: ???
            `;
        } else {
            let monkeyReq = getLevelRequirement('monkey', slot.monkey.level);
            renderMiniPet(slot.monkey, slot.viewId);
            let infoEl = document.getElementById(slot.infoId);
            if (infoEl) infoEl.innerHTML = `
                <strong>${slot.monkey.level >= 2 ? slot.monkey.label : '???'}</strong><br>
                Status: <span class="${slot.monkey.level >= 2 ? 'codexTamed' : 'codexWild'}">${slot.monkey.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
                Level: ${slot.monkey.level}/${MAX_PET_LEVEL}<br>
                Next Req: ${slot.monkey.level < MAX_PET_LEVEL ? '🍌 ' + monkeyReq + ' Bananas' : 'MAX'}
            `;
        }
        let renameEl = document.getElementById(slot.renameId);
        if (renameEl) renameEl.style.display = (region8Unlocked && slot.monkey.level >= 2) ? 'block' : 'none';
    });

    // Region 9 sugar gliders — gated by region9Unlocked. Unlike every
    // other pet they are tamed from level 1, so there's no WILD state: once Region 9 is
    // unlocked the card shows the real name, TAMED, and its three-resource requirement
    // (honey + bananas + water) plus its stamina. They live in gliderPets, not petsByRegion.
    if (typeof gliderPets !== 'undefined') {
        [ { glider: gliderPets[0], viewId: 'viewGlider1', infoId: 'infoGlider1', renameId: 'renameBoxGlider1' },
          { glider: gliderPets[1], viewId: 'viewGlider2', infoId: 'infoGlider2', renameId: 'renameBoxGlider2' }
        ].forEach(slot => {
            if (!slot.glider) return;

            if (!region9Unlocked) {
                renderMiniPet({ type: 'glider', level: 1, isLocked: true }, slot.viewId);
                let infoEl = document.getElementById(slot.infoId);
                if (infoEl) infoEl.innerHTML = `
                    <strong>???</strong><br>
                    Status: <span class="codexWild">LOCKED</span><br>
                    Level: ?/${MAX_PET_LEVEL}<br>
                    Next Req: ???
                `;
            } else {
                let gliderReq = getLevelRequirement('glider', slot.glider.level);
                renderMiniPet(slot.glider, slot.viewId);
                let infoEl = document.getElementById(slot.infoId);
                if (infoEl) infoEl.innerHTML = `
                    <strong>${slot.glider.label}</strong><br>
                    Status: <span class="codexTamed">TAMED</span><br>
                    Level: ${slot.glider.level}/${MAX_PET_LEVEL}<br>
                    Next Req: ${slot.glider.level < MAX_PET_LEVEL ? '🍯' + gliderReq.honey + ' 🍌' + gliderReq.bananas + ' 💧' + gliderReq.water : 'MAX'}<br>
                    ⚡ Stamina: ${Math.floor(slot.glider.stamina)}/${getGliderMaxStamina(slot.glider.level)}
                `;
            }
            let renameEl = document.getElementById(slot.renameId);
            if (renameEl) renameEl.style.display = region9Unlocked ? 'block' : 'none';
        });
    }

    // Pets sold separately in the shop (they carry a `shopId` — see world.js). If the pet's region
    // is open but the pet itself hasn't been bought, its card stays a mystery card that says
    // where to get it, and it can't be renamed. (When the whole region is still locked, the blocks
    // above already show the plain "LOCKED" card, so those are left alone.) Runs last so it
    // overrides whatever the per-pet blocks above rendered.
    [ { id: 'pet_cat',         type: 'cat',      region: 1, view: 'viewCat',      info: 'infoCat',      rename: 'renameBoxCat' },
      { id: 'pet_bowElephant', type: 'elephant', region: 2, view: 'viewElephant2', info: 'infoElephant2', rename: 'renameBoxElephant2', bow: '#ffffff' },
      { id: 'pet_bird',        type: 'bird',     region: 3, view: 'viewBird',     info: 'infoBird',     rename: 'renameBoxBird' },
      { id: 'pet_bowBear',     type: 'bear',     region: 5, view: 'viewBear2',    info: 'infoBear2',    rename: 'renameBoxBear2' },
      { id: 'pet_mudPig',      type: 'pig',      region: 6, view: 'viewPig2',     info: 'infoPig2',     rename: 'renameBoxPig2' },
      { id: 'pet_bowMonkey',   type: 'monkey',   region: 8, view: 'viewMonkey2',  info: 'infoMonkey2',  rename: 'renameBoxMonkey2' },
      { id: 'pet_missGlider',  type: 'glider',   region: 9, view: 'viewGlider2',  info: 'infoGlider2',  rename: 'renameBoxGlider2' }
    ].forEach(slot => {
        if (isUnlockOwned(slot.id) || !isRegionUnlocked(slot.region)) return;
        let u = getUnlockable(slot.id);
        renderMiniPet({ type: slot.type, level: 1, isLocked: true }, slot.view);
        let infoEl = document.getElementById(slot.info);
        if (infoEl) infoEl.innerHTML = `
            <strong>???</strong><br>
            Status: <span class="codexWild">LOCKED</span><br>
            Level: ?/${MAX_PET_LEVEL}<br>
            🛒 In the Shop${u ? ': 🪙' + u.cost : ''}
        `;
        let renameEl = document.getElementById(slot.rename);
        if (renameEl) renameEl.style.display = 'none';
    });

    // Pets in a region that hasn't been bought yet (Regions 4-9): the cards above are already
    // the plain mystery "LOCKED" card; replace its "Next Req: ???" line with where to get it and
    // what it costs, the same way the shop-only pets in Regions 1-3 do. A pet that comes WITH the
    // region shows the region's price; a pet sold separately (`id`) shows the region's price and
    // then its own, since the region has to be bought first.
    [ { region: 4, info: 'infoBee',     rename: 'renameBoxBee' },
      { region: 5, info: 'infoBear1',   rename: 'renameBoxBear1' },
      { region: 5, info: 'infoBear2',   rename: 'renameBoxBear2',   id: 'pet_bowBear' },
      { region: 6, info: 'infoPig1',    rename: 'renameBoxPig1' },
      { region: 6, info: 'infoPig2',    rename: 'renameBoxPig2',    id: 'pet_mudPig' },
      { region: 7, info: 'infoPanda',   rename: 'renameBoxPanda' },
      { region: 8, info: 'infoMonkey1', rename: 'renameBoxMonkey1' },
      { region: 8, info: 'infoMonkey2', rename: 'renameBoxMonkey2', id: 'pet_bowMonkey' },
      { region: 9, info: 'infoGlider1', rename: 'renameBoxGlider1' },
      { region: 9, info: 'infoGlider2', rename: 'renameBoxGlider2', id: 'pet_missGlider' }
    ].forEach(slot => {
        if (isRegionUnlocked(slot.region)) return;
        let regionRow = getUnlockable('region_' + slot.region);
        let petRow = slot.id ? getUnlockable(slot.id) : null;
        if (!regionRow) return;
        let shopLine = `🛒 Region ${slot.region}: 🪙${regionRow.cost}` + (petRow ? ` + 🪙${petRow.cost}` : '');
        let infoEl = document.getElementById(slot.info);
        if (infoEl) infoEl.innerHTML = `
            <strong>???</strong><br>
            Status: <span class="codexWild">LOCKED</span><br>
            Level: ?/${MAX_PET_LEVEL}<br>
            ${shopLine}
        `;
        let renameEl = document.getElementById(slot.rename);
        if (renameEl) renameEl.style.display = 'none';
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
// checklist with the perks unlocked in the Perk Tree highlighted — same visual treatment
// as a pet's Level Perks list in showPetDetail().
function updateCharacterScreen() {
    const nameDisplay = document.getElementById('characterNameDisplay');
    const levelValue = document.getElementById('characterLevelValue');
    const bonusList = document.getElementById('characterBonusList');
    const perksList = document.getElementById('characterPerksList');

    if (nameDisplay) nameDisplay.textContent = character.name || 'Player';
    if (levelValue) levelValue.textContent = character.level;

    // Tamers (character models — see PLAYER_MODELS in entities.js): one small card per
    // model, each with a live idle-pose preview. The equipped one is marked IN USE
    // (not clickable — nothing to do, it's already selected); every other one gets a USE
    // button that switches to it immediately (player.model updates the same frame, no
    // reload) and saves. Built from PLAYER_MODELS itself rather than two hardcoded cards,
    // so a third model added later just shows up here automatically.
    const tamersList = document.getElementById('characterTamersList');
    if (tamersList && typeof PLAYER_MODELS !== 'undefined' && typeof getPlayerSprite === 'function') {
        while (tamersList.firstChild) tamersList.removeChild(tamersList.firstChild);
        const currentModel = character.model === 'male' ? 'male' : 'female';
        const TAMER_LABELS = { female: 'Girl', male: 'Boy' };
        Object.keys(PLAYER_MODELS).forEach(m => {
            const inUse = currentModel === m;
            let card = document.createElement('div');
            card.style.cssText = 'display:flex; flex-direction:column; align-items:center; gap:4px; ' +
                'padding:6px 10px; border-radius:8px; background:rgba(255,255,255,0.06);' +
                (inUse ? ' box-shadow: 0 0 0 2px #2ecc71 inset;' : '');

            let previewCanvas = document.createElement('canvas');
            previewCanvas.width = 48;
            previewCanvas.height = 48;
            previewCanvas.style.imageRendering = 'pixelated';
            const pctx = previewCanvas.getContext('2d');
            pctx.imageSmoothingEnabled = false;
            const sprite = getPlayerSprite('idle', 0, m);
            pctx.drawImage(sprite, Math.round((48 - sprite.width) / 2), 48 - sprite.height - 1);

            let nameEl = document.createElement('span');
            nameEl.style.cssText = 'font-size: 11px; color: #ecf0f1;';
            nameEl.textContent = TAMER_LABELS[m] || m;

            let statusEl;
            if (inUse) {
                statusEl = document.createElement('span');
                statusEl.style.cssText = 'font-size: 10px; color: #2ecc71; font-weight: bold;';
                statusEl.textContent = '✓ IN USE';
            } else {
                statusEl = document.createElement('button');
                statusEl.style.cssText = 'font-size: 10px; padding: 3px 10px;';
                statusEl.textContent = 'USE';
                const handleSelect = (e) => { if (e) e.preventDefault(); selectCharacterModel(m); };
                statusEl.addEventListener('click', handleSelect);
                statusEl.addEventListener('touchstart', handleSelect, { passive: false });
            }

            card.appendChild(previewCanvas);
            card.appendChild(nameEl);
            card.appendChild(statusEl);
            tamersList.appendChild(card);
        });
    }

    if (bonusList && typeof getCharacterBonuses === 'function') {
        let b = getCharacterBonuses(character.level);
        const pct = (mult) => Math.round((mult - 1) * 100);
        bonusList.innerHTML = `
            🍪💧 Pet food/water gain: <strong>+${pct(b.petFoodWater)}%</strong><br>
            🍯 Pet honey gain: <strong>+${pct(b.petHoney)}%</strong><br>
            🐟 Pet fish gain: <strong>+${pct(b.petFish)}%</strong><br>
            🍌 Pet banana gain: <strong>+${pct(b.petBanana)}%</strong><br>
            🪙 Coin gain: <strong>+${pct(b.coin)}%</strong><br>
            🖐️ Manual gather (walking over food/water): <strong>+${pct(b.manualGather)}%</strong>
        `;
    }

    // Perk checklist, bulked by perk TYPE (see PERK_TYPES, state.js): several tree nodes
    // share a type (e.g. 5 separate "Basic Resource" nodes across different tiers/columns),
    // and this used to print one identical-looking "+30%" line per node once several were
    // unlocked. Now every node of a type folds into ONE line with the SUMMED percentage
    // from however many of that type are actually unlocked — green + ✓ once at least one is.
    if (perksList && typeof PERK_TREE !== 'undefined') {
        while (perksList.firstChild) perksList.removeChild(perksList.firstChild);
        const grouped = {};
        PERK_TREE.forEach(p => {
            if (!grouped[p.type]) {
                grouped[p.type] = { name: p.name, icon: p.icon, desc: p.desc, tier: p.tier, col: p.col, unlockedCount: 0, totalCount: 0, unlockedAdd: 0 };
            }
            let g = grouped[p.type];
            g.totalCount++;
            if (hasPerk(p.id)) { g.unlockedCount++; g.unlockedAdd += p.add; }
            // Group sorts by its earliest (lowest tier, then col) node — same reading order
            // the tree itself uses, so the list order doesn't jump around.
            if (p.tier < g.tier || (p.tier === g.tier && p.col < g.col)) { g.tier = p.tier; g.col = p.col; }
        });
        Object.values(grouped).sort((a, b) => (a.tier - b.tier) || (a.col - b.col)).forEach(g => {
            let li = document.createElement('li');
            let unlocked = g.unlockedCount > 0;
            li.style.color = unlocked ? '#2ecc71' : '#7f8c8d';
            let pct = Math.round(g.unlockedAdd * 100);
            li.textContent = `${unlocked ? '✓ ' : ''}${g.icon} ${g.name}: +${pct}% ${g.desc} (${g.unlockedCount}/${g.totalCount} unlocked)`;
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

// Character model selection (Tamers gallery, built in updateCharacterScreen above): picks
// a PLAYER_MODELS entry directly rather than toggling between exactly two, so it already
// works if a third model is ever added. Updates player.model immediately (the sprite
// changes on screen the instant you tap USE, no reload needed), and saves it the same way
// renaming does.
function selectCharacterModel(model) {
    if (typeof PLAYER_MODELS === 'undefined' || !PLAYER_MODELS[model]) return;
    if (character.model === model) return; // already equipped — USE isn't even shown for it
    character.model = model;
    if (typeof player !== 'undefined') player.model = model;
    saveGameProgress();
    updateCharacterScreen();
}

// ------------------------------------------------------------
// SHOP — opened from the MENU overlay (🛒 SHOP). Three tabs: Buy (SHOP_ITEMS in state.js,
// timed 3-minute buffs), Sell (SELL_ITEMS in state.js: eggs and fish from the bag) and
// Unlockables (UNLOCKABLES in state.js: every region and shop-only pet, with an "Owned"
// state once bought). Rows are built from those data tables, so new items need no changes here.
// ------------------------------------------------------------
const shopOverlay = document.getElementById('shopOverlay');
const openShopBtn = document.getElementById('openShopBtn');
const shopClose = document.getElementById('shopClose');
const shopContent = document.getElementById('shopContent');
const shopGoldValue = document.getElementById('shopGoldValue');
const shopTabBuy = document.getElementById('shopTabBuy');
const shopTabSell = document.getElementById('shopTabSell');
const shopTabUnlockables = document.getElementById('shopTabUnlockables');

let shopTab = 'buy';
let shopRenderedSignature = '';

// Everything the shop currently displays, flattened to a string. updateUI() runs every
// frame, so it must NOT rebuild the shop's DOM unconditionally — replacing a button
// between a finger going down and coming up swallows the tap. Instead it compares this
// signature and only redraws when something the shop shows actually changed.
function getShopSignature() {
    // Buff *active/inactive* is part of the signature, but not the seconds remaining —
    // the countdown text is updated in place by updateShopTimers() so the buttons aren't
    // rebuilt every second.
    // Which unlockables are owned is part of the signature so the Unlockables tab flips
    // to "Owned" as soon as something is bought.
    return [shopTab, inventory.coins, inventory.eggs, inventory.fish,
            isShopBuffActive('cake'), isShopBuffActive('wisdomPotion'),
            Object.keys(unlockedIds).sort().join(',')].join('|');
}

function refreshShopIfChanged() {
    if (getShopSignature() !== shopRenderedSignature) renderShop();
    else updateShopTimers();
}

// Updates the "⏳ 2:41 left" labels without touching the DOM structure.
function updateShopTimers() {
    if (!shopContent) return;
    shopContent.querySelectorAll('[data-buff-id]').forEach(el => {
        el.textContent = `⏳ ${formatBuffTime(shopBuffs[el.dataset.buffId])} left`;
    });
}

function buyShopItem(item) {
    if (isShopBuffActive(item.id)) return;         // still running — can't stack/refresh
    if (inventory.coins < item.cost) return;       // can't afford (button is disabled anyway)
    inventory.coins -= item.cost;
    shopBuffs[item.id] = item.duration;
    saveGameProgress();
    renderShop();
    updateUI();
}

// `amount` may be Infinity for "sell all" — clamped to what's actually owned.
function sellShopItem(item, amount) {
    let owned = inventory[item.key] || 0;
    let count = Math.min(amount, owned);
    if (count <= 0) return;
    inventory[item.key] -= count;
    inventory.coins += count * item.price;
    saveGameProgress();
    renderShop();
    updateUI();
}

function buyShopUnlockable(u) {
    if (!buyUnlockable(u.id)) return;
    renderShop();
    updateUI();
    if (typeof updateCodexData === 'function') updateCodexData();
}

function makeShopButton(label, extraClass, disabled, onClick) {
    let btn = document.createElement('button');
    btn.className = 'shopActionBtn' + (extraClass ? ' ' + extraClass : '');
    btn.textContent = label;
    btn.disabled = disabled;
    // `click` rather than touchstart/mousedown (which the overlay open/close buttons use):
    // these sit in a scrollable list, and touchstart+preventDefault would block scrolling
    // whenever a finger happens to start on a button.
    if (onClick) btn.addEventListener('click', onClick);
    return btn;
}

function makeShopRow(icon, name, desc, meta, buttons, metaBuffId) {
    let row = document.createElement('div');
    row.className = 'shopRow';

    let iconEl = document.createElement('div');
    iconEl.className = 'shopRowIcon';
    iconEl.textContent = icon;
    row.appendChild(iconEl);

    let info = document.createElement('div');
    info.className = 'shopRowInfo';
    let nameEl = document.createElement('div');
    nameEl.className = 'shopRowName';
    nameEl.textContent = name;
    info.appendChild(nameEl);
    if (desc) {
        let descEl = document.createElement('div');
        descEl.className = 'shopRowDesc';
        descEl.textContent = desc;
        info.appendChild(descEl);
    }
    let metaEl = document.createElement('div');
    metaEl.className = 'shopRowMeta';
    metaEl.textContent = meta;
    if (metaBuffId) {
        // Live countdown label — kept fresh by updateShopTimers().
        metaEl.dataset.buffId = metaBuffId;
        metaEl.classList.add('shopRowMetaActive');
    }
    info.appendChild(metaEl);
    row.appendChild(info);

    let actions = document.createElement('div');
    actions.className = 'shopRowActions';
    buttons.forEach(b => actions.appendChild(b));
    row.appendChild(actions);

    return row;
}

function renderShop() {
    if (!shopContent) return;

    if (shopGoldValue) shopGoldValue.textContent = inventory.coins;
    if (shopTabBuy) shopTabBuy.classList.toggle('shopTabActive', shopTab === 'buy');
    if (shopTabSell) shopTabSell.classList.toggle('shopTabActive', shopTab === 'sell');
    if (shopTabUnlockables) shopTabUnlockables.classList.toggle('shopTabActive', shopTab === 'unlockables');

    while (shopContent.firstChild) shopContent.removeChild(shopContent.firstChild);

    if (shopTab === 'buy') {
        SHOP_ITEMS.forEach(item => {
            let active = isShopBuffActive(item.id);
            let shortBy = item.cost - inventory.coins;
            let meta = active ? `⏳ ${formatBuffTime(shopBuffs[item.id])} left`
                : (shortBy > 0 ? `🪙 ${item.cost} (need ${shortBy} more)` : `🪙 ${item.cost}`);
            let btn = active
                ? makeShopButton('Active', 'shopActionBtnActive', true, null)
                : makeShopButton('Buy', '', shortBy > 0, () => buyShopItem(item));
            let desc = `${item.desc} Lasts ${Math.round(item.duration / 60)} minutes.`;
            shopContent.appendChild(makeShopRow(item.icon, item.name, desc, meta, [btn], active ? item.id : null));
        });
    } else if (shopTab === 'unlockables') {
        // Grouped by region. Regions 1-3 are open from the start, so they only get a plain
        // "Region N" heading (no "starts with ..." blurb — the player can just see the pet
        // rows below it) and the pets sold for them; Regions 4-9 are themselves for sale,
        // followed by any extra pet sold for that region.
        for (let r = 1; r <= 9; r++) {
            if (r <= 3) {
                let heading = document.createElement('div');
                heading.className = 'shopSectionHeading';
                heading.textContent = `Region ${r}`;
                shopContent.appendChild(heading);
            }
            UNLOCKABLES.filter(u => u.region === r).forEach(u => {
                let owned = isUnlockOwned(u.id);
                let reason = getUnlockableBlockReason(u);
                let shortBy = u.cost - inventory.coins;
                let meta;
                if (owned) meta = '✅ Owned';
                else if (reason === 'region') meta = `🔒 Unlock Region ${u.region} first · 🪙 ${u.cost}`;
                else meta = shortBy > 0 ? `🪙 ${u.cost} (need ${shortBy} more)` : `🪙 ${u.cost}`;

                let btn = owned
                    ? makeShopButton('Owned', 'shopActionBtnActive', true, null)
                    : makeShopButton('Buy', '', reason !== null, () => buyShopUnlockable(u));
                let row = makeShopRow(u.icon, u.name, u.desc, meta, [btn], null);
                if (owned) row.classList.add('shopRowOwned');
                if (u.kind === 'pet' && r > 3) row.classList.add('shopRowSub');
                shopContent.appendChild(row);
            });
        }
    } else {
        // Only things the player actually has show up here; with nothing to sell, a short
        // note replaces the list so the tab doesn't look broken.
        let sellable = SELL_ITEMS.filter(item => (inventory[item.key] || 0) > 0);
        if (sellable.length === 0) {
            let empty = document.createElement('div');
            empty.className = 'shopEmptyNote';
            empty.textContent = 'Nothing to sell yet.';
            shopContent.appendChild(empty);
        }
        sellable.forEach(item => {
            let owned = inventory[item.key] || 0;
            let meta = `You have ${owned} · sells for 🪙 ${item.price} each`;
            let sellOne = makeShopButton('Sell 1', 'shopActionBtnSell', owned < 1, () => sellShopItem(item, 1));
            let sellAll = makeShopButton('Sell all', 'shopActionBtnSell', owned < 1, () => sellShopItem(item, Infinity));
            shopContent.appendChild(makeShopRow(item.icon, item.name, null, meta, [sellOne, sellAll]));
        });
    }

    shopRenderedSignature = getShopSignature();
}

const handleOpenShop = (e) => {
    if (e) e.preventDefault();
    shopTab = 'buy';
    renderShop();
    if (shopOverlay) shopOverlay.style.display = 'flex';
};

const handleCloseShop = (e) => {
    if (e) e.preventDefault();
    if (shopOverlay) shopOverlay.style.display = 'none';
};

if (openShopBtn) {
    openShopBtn.addEventListener('touchstart', handleOpenShop, { passive: false });
    openShopBtn.addEventListener('mousedown', handleOpenShop);
}
if (shopClose) {
    shopClose.addEventListener('touchstart', handleCloseShop, { passive: false });
    shopClose.addEventListener('mousedown', handleCloseShop);
}
if (shopTabBuy) shopTabBuy.addEventListener('click', () => { shopTab = 'buy'; renderShop(); });
if (shopTabSell) shopTabSell.addEventListener('click', () => { shopTab = 'sell'; renderShop(); });
if (shopTabUnlockables) shopTabUnlockables.addEventListener('click', () => { shopTab = 'unlockables'; renderShop(); });

// ------------------------------------------------------------
// PERK TREE — opened from the MENU overlay (🌳 PERK TREE). A skill-tree screen built from
// PERK_TREE in state.js: the root at the BOTTOM, three branches growing upward, the
// player's unspent perk points at the very top, and a detail panel pinned underneath.
// The tree area scrolls (like the pets codex) and is sized from the data, so adding
// perks for levels past 50 is just adding rows to PERK_TREE. Tapping a node selects it;
// the Unlock button in the detail panel is what actually spends the point.
// (Perk points are deliberately shown ONLY on this screen.)
// ------------------------------------------------------------
const perkTreeOverlay = document.getElementById('perkTreeOverlay');
const openPerkTreeBtn = document.getElementById('openPerkTreeBtn');
const perkTreeClose = document.getElementById('perkTreeClose');
const perkPointsValue = document.getElementById('perkPointsValue');
const perkTreeScroll = document.getElementById('perkTreeScroll');
const perkTreeCanvas = document.getElementById('perkTreeCanvas');
const perkDetail = document.getElementById('perkDetail');

// (PERK_TREE_COLS — how many columns wide the tree is — lives in state.js with the data.)
const PERK_ROW_HEIGHT = 100;     // px between tiers
const PERK_CANVAS_PAD = 14;      // px above the top tier / below the root

let perkTreeSelectedId = null;
let perkTreeRenderedSignature = '';

// Same reasoning as the shop: updateUI() runs every frame, so an open tree is only redrawn
// when something it shows actually changed (points or unlocked perks) — never
// unconditionally, which would swallow taps by replacing buttons mid-press.
function getPerkTreeSignature() {
    return [character.perkPoints, character.perks.join(',')].join('|');
}

function refreshPerkTreeIfChanged() {
    if (getPerkTreeSignature() !== perkTreeRenderedSignature) renderPerkTree();
}

function perkNodeX(col) { return ((col + 0.5) / PERK_TREE_COLS * 100) + '%'; }
function perkNodeY(tier, maxTier) {
    return PERK_CANVAS_PAD + (maxTier - tier) * PERK_ROW_HEIGHT + PERK_ROW_HEIGHT / 2;
}

// status (state.js getPerkStatus) -> the node's visual style
const PERK_NODE_CLASS = {
    unlocked: 'perkNodeUnlocked',
    available: 'perkNodeAvailable',
    needsPoints: 'perkNodeReachable',   // perk below is done, but not enough points yet
    locked: 'perkNodeLocked'            // perk below isn't unlocked yet
};

function renderPerkTree() {
    if (!perkTreeCanvas || !perkTreeScroll) return;

    const prevScroll = perkTreeScroll.scrollTop;
    if (perkPointsValue) perkPointsValue.textContent = character.perkPoints;

    const maxTier = Math.max(...PERK_TREE.map(p => p.tier));
    const height = (maxTier + 1) * PERK_ROW_HEIGHT + PERK_CANVAS_PAD * 2;

    while (perkTreeCanvas.firstChild) perkTreeCanvas.removeChild(perkTreeCanvas.firstChild);
    perkTreeCanvas.style.height = height + 'px';
    // Each node is a square one column wide (minus a gap), so any number of columns fits the panel.
    perkTreeCanvas.style.setProperty('--perk-node-size', `calc(${100 / PERK_TREE_COLS}% - 8px)`);

    // Connector lines first (drawn beneath the nodes). Gold = both ends unlocked, light =
    // the parent is unlocked so this branch is open, dotted = still out of reach.
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('class', 'perkLines');
    svg.setAttribute('width', '100%');
    svg.setAttribute('height', height);
    PERK_TREE.forEach(child => {
        child.requires.forEach(parentId => {
            const parent = PERK_BY_ID[parentId];
            if (!parent) return;
            const line = document.createElementNS(svgNS, 'line');
            line.setAttribute('x1', perkNodeX(parent.col));
            line.setAttribute('y1', perkNodeY(parent.tier, maxTier));
            line.setAttribute('x2', perkNodeX(child.col));
            line.setAttribute('y2', perkNodeY(child.tier, maxTier));
            let cls = 'perkLine';
            if (hasPerk(parentId)) cls += hasPerk(child.id) ? ' perkLineActive' : ' perkLineOpen';
            line.setAttribute('class', cls);
            svg.appendChild(line);
        });
    });
    perkTreeCanvas.appendChild(svg);

    PERK_TREE.forEach(perk => {
        const status = getPerkStatus(perk);
        const node = document.createElement('button');
        node.className = 'perkNode ' + PERK_NODE_CLASS[status] +
            (perk.id === perkTreeSelectedId ? ' perkNodeSelected' : '');
        node.style.left = perkNodeX(perk.col);
        node.style.top = perkNodeY(perk.tier, maxTier) + 'px';
        node.dataset.perkId = perk.id;
        node.setAttribute('aria-label', `${perk.name}: ${perk.text} (${status})`);

        const icon = document.createElement('span');
        // Two-emoji icons (🍪💧) are drawn smaller so they fit inside a narrow node.
        icon.className = 'perkNodeIcon' + ([...perk.icon].length > 1 ? ' perkNodeIconPair' : '');
        icon.textContent = perk.icon;
        node.appendChild(icon);

        if (status === 'unlocked' || status === 'locked') {
            const badge = document.createElement('span');
            badge.className = 'perkNodeBadge';
            badge.textContent = status === 'unlocked' ? '✓' : '🔒';
            node.appendChild(badge);
        }

        // `click` (not touchstart) so a finger that starts on a node can still scroll the tree.
        node.addEventListener('click', () => {
            perkTreeSelectedId = perk.id;
            renderPerkTree();
        });
        perkTreeCanvas.appendChild(node);
    });

    perkTreeScroll.scrollTop = prevScroll;   // rebuilding must never jump the scroll position
    renderPerkDetail();
    perkTreeRenderedSignature = getPerkTreeSignature();
}

function renderPerkDetail() {
    if (!perkDetail) return;
    while (perkDetail.firstChild) perkDetail.removeChild(perkDetail.firstChild);

    const perk = PERK_BY_ID[perkTreeSelectedId];
    if (!perk) {
        const hint = document.createElement('div');
        hint.className = 'perkDetailHint';
        hint.textContent = 'Tap a perk to see what it does.';
        perkDetail.appendChild(hint);
        return;
    }

    const status = getPerkStatus(perk);
    let statusText;
    if (status === 'unlocked') {
        statusText = '✓ Unlocked';
    } else if (status === 'locked') {
        const missing = PERK_BY_ID[perk.requires.find(id => !hasPerk(id))];
        statusText = `🔒 Unlock the ${missing ? missing.name : 'previous'} perk below it first`;
    } else if (status === 'needsPoints') {
        const short = perk.cost - character.perkPoints;
        statusText = `Need ${short} more perk point${short === 1 ? '' : 's'}`;
    } else {
        statusText = 'Ready to unlock';
    }

    const info = document.createElement('div');
    info.className = 'perkDetailInfo';
    const title = document.createElement('div');
    title.className = 'perkDetailTitle';
    title.textContent = `${perk.icon} ${perk.name}`;
    const text = document.createElement('div');
    text.className = 'perkDetailText';
    text.textContent = perk.text;
    const st = document.createElement('div');
    st.className = 'perkDetailStatus' + ((status === 'unlocked' || status === 'available') ? ' perkDetailStatusOk' : '');
    st.textContent = statusText;
    info.appendChild(title);
    info.appendChild(text);
    info.appendChild(st);
    perkDetail.appendChild(info);

    const label = status === 'unlocked' ? 'Unlocked' : `Unlock · ${perk.cost} pt${perk.cost === 1 ? '' : 's'}`;
    const btn = makeShopButton(label, status === 'unlocked' ? 'shopActionBtnActive' : '', status !== 'available', () => {
        if (unlockPerk(perk.id)) {
            renderPerkTree();
            updateUI();   // Character screen / bonuses pick up the new perk
        }
    });
    perkDetail.appendChild(btn);
}

const handleOpenPerkTree = (e) => {
    if (e) e.preventDefault();
    perkTreeSelectedId = null;
    if (perkTreeOverlay) perkTreeOverlay.style.display = 'flex';
    renderPerkTree();
    // Start at the bottom of the tree: the root, where the player begins.
    if (perkTreeScroll) perkTreeScroll.scrollTop = perkTreeScroll.scrollHeight;
};

const handleClosePerkTree = (e) => {
    if (e) e.preventDefault();
    if (perkTreeOverlay) perkTreeOverlay.style.display = 'none';
};

if (openPerkTreeBtn) {
    openPerkTreeBtn.addEventListener('touchstart', handleOpenPerkTree, { passive: false });
    openPerkTreeBtn.addEventListener('mousedown', handleOpenPerkTree);
}
if (perkTreeClose) {
    perkTreeClose.addEventListener('touchstart', handleClosePerkTree, { passive: false });
    perkTreeClose.addEventListener('mousedown', handleClosePerkTree);
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
const btnAddGold = document.getElementById('devAddGold');

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

if (btnAddGold) {
    btnAddGold.addEventListener('click', () => {
        inventory.coins += 500;
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
            shopBuffs.cake = 0;
            shopBuffs.wisdomPotion = 0;
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

            Object.keys(unlockedIds).forEach(id => { delete unlockedIds[id]; });

            if (typeof gliderPets !== 'undefined') {
                gliderPets.forEach(g => {
                    g.level = 1;
                    g.honeyEaten = 0;
                    g.bananaEaten = 0;
                    g.waterEaten = 0;
                    g.stamina = getGliderMaxStamina(1);
                    g.regionNow = 9;
                    g.held = false;
                    g.state = 'idle';
                    g.stateTimer = 0.5;
                });
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
                if (!isPetAvailable(pet)) return; // not bought yet
                // FIXED: Pushes your pets straight to your new maximum level (MAX_PET_LEVEL)!
                pet.level = MAX_PET_LEVEL; 
                pet.foodEaten = 0;
                pet.waterEaten = 0;
                pet.pickNewWanderTarget();
                if (pet.state === 'idle' || pet.state === 'whistled') {
                    pet.state = 'wander';
                }
            });
            // Sugar gliders aren't in petsByRegion — level up the ones in this region, plus the
            // one being carried. (Stamina is left alone; it's only ever clamped to the new max.)
            if (typeof gliderPets !== 'undefined') {
                gliderPets.forEach(g => {
                    if (isPetAvailable(g) && (g.held || g.regionNow === currentRegion)) {
                        g.level = MAX_PET_LEVEL;
                        g.honeyEaten = 0;
                        g.bananaEaten = 0;
                        g.waterEaten = 0;
                    }
                });
            }
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

// Bind every pet to its exact [region][slot] position in petsByRegion:
bindPetRename('btnRenameDog', 'inputDog', 1, 0);       // Region 1, Dog
bindPetRename('btnRenameCat', 'inputCat', 1, 1);       // Region 1, Cat
bindPetRename('btnRenameElephant', 'inputElephant', 2, 0); // Region 2, Elephant
bindPetRename('btnRenameElephant2', 'inputElephant2', 2, 1); // Region 2, Bow Elephant
bindPetRename('btnRenameSquirrel', 'inputSquirrel', 3, 0); // Region 3, Squirrel
bindPetRename('btnRenameChicken', 'inputChicken', 3, 1);   // Region 3, Chicken
bindPetRename('btnRenameBee', 'inputBee', 4, 0);       // Region 4, Bee (Base)
bindPetRename('btnRenameBear1', 'inputBear1', 5, 0);   // Region 5, Bear
bindPetRename('btnRenameBear2', 'inputBear2', 5, 1);   // Region 5, Bow Bear (female)
bindPetRename('btnRenameMonkey1', 'inputMonkey1', 8, 0); // Region 8, Monkey
bindPetRename('btnRenameMonkey2', 'inputMonkey2', 8, 1); // Region 8, Bow Monkey
bindPetRename('btnRenamePig1', 'inputPig1', 6, 0);     // Region 6, Pig (pink)
bindPetRename('btnRenamePig2', 'inputPig2', 6, 1);     // Region 6, Mud Pig (grey)
bindPetRename('btnRenamePanda', 'inputPanda', 7, 0);   // Region 7, Panda

// Sugar gliders aren't in petsByRegion either (see gliderPets in world.js), so they get their own
// small binding, by index: 0 = Sugar Glider, 1 = Miss Glider.
function bindGliderRename(btnId, inputId, gliderIdx) {
    const btn = document.getElementById(btnId);
    const input = document.getElementById(inputId);
    if (btn && input) {
        btn.addEventListener('click', () => {
            let nameVal = input.value.trim();
            if (nameVal && typeof gliderPets !== 'undefined' && gliderPets[gliderIdx]) {
                gliderPets[gliderIdx].label = nameVal;
                input.value = '';
                saveGameProgress();
                updateUI();
                if (typeof updateCodexData === 'function') updateCodexData();
                alert(`✨ Name successfully updated to: ${nameVal}!`);
            }
        });
    }
}
bindGliderRename('btnRenameGlider1', 'inputGlider1', 0); // Sugar Glider
bindGliderRename('btnRenameGlider2', 'inputGlider2', 1); // Miss Glider

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
    spawnBeeBtn.textContent = `🐝 Buy Bee (${BEE_COST}🪙)`;
    const handlePurchaseBee = (e) => {
        if (e) e.preventDefault();
        
        // 1. Array Safeguard
        if (!petsByRegion[4]) petsByRegion[4] = [];
        
        // 2. Strict Capacity Threshold Lock
        if (countHiveBees() >= HIVE_MAX_BEES) {
            alert(`🍯 The Hive structure has reached its maximum capacity of ${HIVE_MAX_BEES} total bees!`);
            spawnBeeBtn.style.display = 'none';
            return;
        }

        // 3. Financial Ledger Transaction Check
        if (inventory.coins < BEE_COST) {
            alert(`🪙 Insufficient Coins! Buying a new bee costs ${BEE_COST} Coins. (You have: ${inventory.coins})`);
            return;
        }

        // 4. Process Checkout Deductions
        inventory.coins -= BEE_COST;
        updateUI();

        // 5. Extract Base Name Continuity Parameters
        let workerNumber = countHiveBees(); 
        let cleanLabelName = `Worker Bee ${workerNumber}`;

        // 6. Create the new bee via the shared factory (same setup the starter bee
        // gets, including honeyCarried — this is the fix for bought bees never
        // capping out or dropping honey off at the hive).
        let newBeeCopy = createBee(cleanLabelName);

        // Push directly into the engine's active physics cycle loops
        petsByRegion[4].push(newBeeCopy);
        
        saveGameProgress();
        
        // Auto-hide the button immediately if this purchase hits the maximum capacity ceiling limit
        if (countHiveBees() >= HIVE_MAX_BEES) {
            spawnBeeBtn.style.display = 'none';
        }
    };

    spawnBeeBtn.addEventListener('touchstart', handlePurchaseBee, { passive: false });
    spawnBeeBtn.addEventListener('mousedown', handlePurchaseBee);
}

const hiveHoneyLabel = document.getElementById('hiveHoneyLabel');
if (hiveHoneyLabel) {
    const handleCollectHiveHoney = (e) => {
        if (e) e.preventDefault();
        if (typeof region4Hive === 'undefined' || !region4Hive || region4Hive.honey <= 0) return;

        inventory.honey += region4Hive.honey;
        region4Hive.honey = 0;
        updateUI();
        saveGameProgress();
    };

    hiveHoneyLabel.addEventListener('touchstart', handleCollectHiveHoney, { passive: false });
    hiveHoneyLabel.addEventListener('mousedown', handleCollectHiveHoney);
}
