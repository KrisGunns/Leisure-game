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

// Returns the level-perk checklist for a pet type as an ordered array of
// { level, text }. Pulls the numeric tiers straight from FORAGE_TIERS (state.js) so
// this list never drifts out of sync with the actual yield numbers, then appends the
// non-numeric perks (digging, egg-laying, play minigame, mud-play, honey capacity,
// fishing speed) by hand since those aren't expressible as a table row.
function getPetPerkDescriptions(type) {
    let perks = [];
    const tiers = (typeof FORAGE_TIERS !== 'undefined') ? FORAGE_TIERS[type] : null;

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
        perks.push({ level: 1, text: '5% chance per forage to play in the mud for 5s (+2 coins, 5% chance to double to +4)' });
    } else if (type === 'bee') {
        perks.push({ level: 1, text: 'Carries 1 honey load before returning to the hive' });
        perks.push({ level: 5, text: 'Honey capacity increases to 2' });
        perks.push({ level: 10, text: 'Honey capacity increases to 3' });
        perks.push({ level: 20, text: 'Honey capacity increases to 5, plus a 10% chance of double honey' });
    } else if (type === 'bear') {
        perks.push({ level: 2, text: 'Starts fishing at the lake' });
        perks.push({ level: 3, text: 'Fishing cycle speeds up' });
        perks.push({ level: 5, text: 'Fishing cycle speeds up further' });
        perks.push({ level: 20, text: '10% chance of a double catch' });
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
    if (typeof FORAGE_TIERS !== 'undefined' && FORAGE_TIERS[pet.type]) {
        let y = getForageYield(pet.type, pet.level);
        yieldSection.innerHTML = `<strong>Current Forage Yield</strong><br>🍪 +${y.food} food &nbsp; 💧 +${y.water} water`;
    } else if (pet.type === 'bee') {
        let cap = pet.level >= 20 ? 5 : pet.level >= 10 ? 3 : pet.level >= 5 ? 2 : 1;
        yieldSection.innerHTML = `<strong>Honey Capacity</strong><br>🍯 carries up to ${cap} before returning to the hive`;
    } else if (pet.type === 'bear') {
        yieldSection.innerHTML = `<strong>Fishing</strong><br>🐟 catches fish periodically, faster at higher levels`;
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
        li.textContent = `Lv.${p.level}: ${p.text}${reached ? ' ✓' : ''}`;
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

    const interactBtn = document.getElementById('interactBtn');
    if (interactBtn) {
        let elephantPlaying = false;
        if (typeof petsByRegion !== 'undefined' && petsByRegion && petsByRegion[2] && petsByRegion[2][0]) {
            let elState = petsByRegion[2][0].state;
            if (elState && (elState.startsWith('playing') || elState === 'playing_wait_for_move')) {
                elephantPlaying = true;
            }
        }
        interactBtn.textContent = elephantPlaying ? 'PLAY' : 'GIVE';
    }

    const charLevel = document.getElementById('charLevel');
    const charXP = document.getElementById('charXP');
    const charNextXP = document.getElementById('charNextXP');

    if (charLevel) charLevel.textContent = character.level;
    if (charXP) charXP.textContent = character.xp;
    if (charNextXP) charNextXP.textContent = getCharacterNextXP(character.level);
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
        miniCanvas.removeEventListener('touchstart', miniCanvas._detailHandler);
        miniCanvas.removeEventListener('mousedown', miniCanvas._detailHandler);
    }
    const openDetail = (e) => {
        if (e) e.preventDefault();
        if (typeof showPetDetail === 'function') showPetDetail(pet);
    };
    miniCanvas._detailHandler = openDetail;
    miniCanvas.style.cursor = 'pointer';
    miniCanvas.addEventListener('touchstart', openDetail, { passive: false });
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
        }
    }

function updateCodexData() {
    const dog = petsByRegion[1][0];
    const elephant = petsByRegion[2][0];
    const squirrel = petsByRegion[3][0];
    const chicken = petsByRegion[3][1];
    const bee = petsByRegion[4][0];
    const bear = petsByRegion[5][0];

    renderMiniPet(dog, 'viewDog');
    renderMiniPet(elephant, 'viewElephant');
    renderMiniPet(squirrel, 'viewSquirrel');
    renderMiniPet(chicken, 'viewChicken');

    let dogReq = getLevelRequirement('dog', dog.level);
    document.getElementById('infoDog').innerHTML = `
        <strong>${dog.level >= 2 ? dog.label : '???'}</strong><br>
        Status: <span class="${dog.level >= 2 ? 'codexTamed' : 'codexWild'}">${dog.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${dog.level}/20<br>
        Next Req: ${dog.level < 20 ? '🍪' + dogReq.food + ' 💧' + dogReq.water : 'MAX'}
    `;

    document.getElementById('renameBoxDog').style.display = dog.level >= 2 ? 'block' : 'none';


    let elReq = getLevelRequirement('elephant', elephant.level);
    document.getElementById('infoElephant').innerHTML = `
        <strong>${elephant.level >= 2 ? elephant.label : '???'}</strong><br>
        Status: <span class="${elephant.level >= 2 ? 'codexTamed' : 'codexWild'}">${elephant.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${elephant.level}/20<br>
        Next Req: ${elephant.level < 20 ? '🍪' + elReq.food + ' 💧' + elReq.water : 'MAX'}
    `;

    document.getElementById('renameBoxElephant').style.display = elephant.level >= 2 ? 'block' : 'none';

    let sqReq = getLevelRequirement('squirrel', squirrel.level);
    document.getElementById('infoSquirrel').innerHTML = `
        <strong>${squirrel.level >= 2 ? squirrel.label : '???'}</strong><br>
        Status: <span class="${squirrel.level >= 2 ? 'codexTamed' : 'codexWild'}">${squirrel.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${squirrel.level}/20<br>
        Next Req: ${squirrel.level < 20 ? '🍪' + sqReq.food + ' 💧' + sqReq.water : 'MAX'}
    `;

    document.getElementById('renameBoxSquirrel').style.display = squirrel.level >= 2 ? 'block' : 'none';

    let chReq = getLevelRequirement('chicken', chicken.level);
    document.getElementById('infoChicken').innerHTML = `
        <strong>${chicken.level >= 2 ? chicken.label : '???'}</strong><br>
        Status: <span class="${chicken.level >= 2 ? 'codexTamed' : 'codexWild'}">${chicken.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${chicken.level}/20<br>
        Next Req: ${chicken.level < 20 ? '🍪' + chReq.food + ' 💧' + chReq.water : 'MAX'}
    `;

    document.getElementById('renameBoxChicken').style.display = chicken.level >= 2 ? 'block' : 'none';

        // FIXED: Ensure the loop strictly checks if data arrays are valid and populated before unlocking
    let region4Unlocked = true; 
    let checkCount = 0; // Tracks how many pets were successfully validated

    for (let r = 1; r <= 3; r++) {
        if (Array.isArray(petsByRegion[r]) && petsByRegion[r].length > 0) {
            petsByRegion[r].forEach(pet => {
                checkCount++;
                if (pet.level < 2) {
                    region4Unlocked = false; // Found an untamed pet!
                }
            });
        } else {
            // Safety Check: If any early region array is missing or empty, force lock it down!
            region4Unlocked = false; 
        }
    }

    // Secondary safety: If the script didn't evaluate all 4 core pets, keep it locked
    if (checkCount < 4) {
        region4Unlocked = false;
    }

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
    if (!region4Unlocked) {
        // 1. Forces the mini-canvas renderer to draw a hidden black card profile with a question mark
        renderMiniPet({ type: 'bear', level: 1, isLocked: true }, 'viewBear'); 
        
        // 2. Overrides the text box with mystery information at the start of the game
        document.getElementById('infoBear').innerHTML = `
            <strong>???</strong><br>
            Status: <span class="codexWild">LOCKED</span><br>
            Level: ?/20<br>
            Next Req: ???
        `;
    } else {
        // Displays full active taming metrics once the user breaks through the early zones!
        let bearReq = getLevelRequirement('bear', bear.level);
        renderMiniPet(bear, 'viewBear');
        
        document.getElementById('infoBear').innerHTML = `
            <strong>${bear.level >= 2 ? bear.label : '???'}</strong><br>
            Status: <span class="${bear.level >= 2 ? 'codexTamed' : 'codexWild'}">${bear.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
            Level: ${bear.level}/20<br>
            Next Req: ${bear.level < 20 ? '🍯 ' + bearReq + ' Honey' : 'MAX'}
        `;
    }
    document.getElementById('renameBoxBear').style.display = (region4Unlocked && bear.level >= 2) ? 'block' : 'none';

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
}

const codexOverlay = document.getElementById('codexOverlay');
const openCodexBtn = document.getElementById('openCodexBtn');
const codexClose = document.getElementById('codexClose');

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
bindPetRename('btnRenameElephant', 'inputElephant', 2, 0); // Region 2, Elephant
bindPetRename('btnRenameSquirrel', 'inputSquirrel', 3, 0); // Region 3, Squirrel
bindPetRename('btnRenameChicken', 'inputChicken', 3, 1);   // Region 3, Chicken
bindPetRename('btnRenameBee', 'inputBee', 4, 0);       // Region 4, Bee (Base)
bindPetRename('btnRenameBear', 'inputBear', 5, 0);     // Region 5, Bear
bindPetRename('btnRenamePig1', 'inputPig1', 6, 0);     // Region 6, Pig (pink)
bindPetRename('btnRenamePig2', 'inputPig2', 6, 1);     // Region 6, Mud Pig (grey)

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
