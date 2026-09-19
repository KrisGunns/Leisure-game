// ============================================================
// world.js — Region/world data: the player instance, item spawn
// pools per region, pet roster per region, canvas resizing,
// collision detection, and item respawn scheduling.
// Depends on: state.js, entities.js. Load AFTER those.
// ============================================================

const player = new Player(100, 100);
const respawnQueue = [];

const regionalItems = {
    1: { foods: [], waters: [], flowers: [] },
    2: { foods: [], waters: [], flowers: [] },
    3: { foods: [], waters: [], flowers: [] },
    4: { foods: [], waters: [], flowers: [] },
    5: { foods: [], waters: [], flowers: [] },
    6: { foods: [], waters: [], flowers: [] },
    7: { foods: [], waters: [], flowers: [] }
};

// Regions whose food/water item pools get topped up by processSpawns() — Region 4 gets
// flowers instead (bees), Region 5 (bear) gets neither (fishes at the lake instead).
const FOOD_WATER_REGIONS = [1, 2, 3, 6, 7];

// All regions the bird's Lv20 excursion perk can randomly fly to — deliberately does NOT
// include Region 7: it's gated behind a much higher unlock condition (every other pet at
// Lv10+) than the bird itself needs to start excursions (just its own Lv20), so letting
// it wander in there before the player has actually unlocked the panda's habitat would be
// a strange inconsistency. Update this if a Region 8+ is added and should be eligible.
const ALL_REGIONS = [1, 2, 3, 4, 5, 6];

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

const region4Hive = { x: 225, y: 75 };

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
    2: [new Pet('elephant', 'Elephant', '#95a5a6')],
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
    7: [ createPanda('Panda', 200, 220) ]
};

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
for (let r = 1; r <= 7; r++) {
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

// Region 7 (panda) unlock condition — single source of truth used by main.js (render
// gating), input.js (region-select gate), and ui.js (Codex lock display) so the rule
// can't drift out of sync between them: pets in Regions 1-3 must be Level 10+, and
// pets in Regions 4-6 must be Level 5+.
function isRegion7Unlocked() {
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
    if (r === 7) return isRegion7Unlocked();
    if (r >= 4 && r <= 6) return areRegions1to3Tamed();
    return false;
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
                respawnQueue.push({ type: 'food', time: Date.now() + 10000 });

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
                respawnQueue.push({ type: 'water', time: Date.now() + 10000 });

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

    // 4. 🐝 Dynamic Proximity Distance Hive Button Trigger
    const spawnBeeBtn = document.getElementById('spawnBeeBtn');
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
        } else {
            spawnBeeBtn.style.display = 'none';
        }
    } else if (spawnBeeBtn) {
        spawnBeeBtn.style.display = 'none';
    }

}

function processSpawns(dt) {
    let now = Date.now();
    for (let i = respawnQueue.length - 1; i >= 0; i--) {
        if (now >= respawnQueue[i].time) {
            let type = respawnQueue[i].type;
            if (type === 'flower') {
                if (regionalItems[4].flowers.length < 5) {
                    regionalItems[4].flowers.push(new Flower());
                }
            } else {
                for (let ri = 0; ri < FOOD_WATER_REGIONS.length; ri++) {
                    let rItems = regionalItems[FOOD_WATER_REGIONS[ri]];
                    if (type === 'food' && rItems.foods.length < 5) {
                        rItems.foods.push(new Item('food'));
                        break;
                    } else if (type === 'water' && rItems.waters.length < 5) {
                        rItems.waters.push(new Item('water'));
                        break;
                    }
                }
            }
            respawnQueue.splice(i, 1);
        }
    }

    spawnTimer += dt;
    if (spawnTimer >= 10) {
        for (let r = 1; r <= 7; r++) {
            if (r === 4) {
                if (regionalItems[r].flowers.length < 5) regionalItems[r].flowers.push(new Flower());
            } else if (FOOD_WATER_REGIONS.indexOf(r) !== -1) {
                if (regionalItems[r].foods.length < 5) regionalItems[r].foods.push(new Item('food'));
                if (regionalItems[r].waters.length < 5) regionalItems[r].waters.push(new Item('water'));
            }
        }
        spawnTimer = 0;
    }
}

