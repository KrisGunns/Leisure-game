// ============================================================
// main.js — The game loop (background draw, physics/AI update,
// render) and startup sequence (load save, initial item spawns,
// kick off the loop). Depends on ALL other files. Load LAST.
// ============================================================

// Frame errors seen so far (see the try/catch in gameLoop). Logged for the first few and then once
// in a while, so a bug that throws every frame can't flood the console.
let frameErrorCount = 0;

function gameLoop(timestamp) {
    // One thrown error in a frame must NOT end the game: the next frame is always scheduled (the
    // `finally` below), and anything the failed frame left half-done on the canvas is reset.
    try {
        runGameFrame(timestamp);
    } catch (err) {
        frameErrorCount++;
        if (frameErrorCount <= 10 || frameErrorCount % 600 === 0) {
            console.error('Game frame failed (frame error #' + frameErrorCount + '), carrying on:', err);
        }
        try {
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.globalAlpha = 1;
            ctx.imageSmoothingEnabled = true;
        } catch (e2) { /* nothing to reset */ }
    } finally {
        requestAnimationFrame(gameLoop);
    }
}

// Timestamp of the last frame that actually ran. dt below is measured from this: the old code used
// the throttle clock (`lastTime`, which is moved back by the leftover time) as the reference, so on
// screens faster than 60Hz the leftover was counted again by the next frame and pet timers ran
// ~1.2-1.5x too fast.
let prevFrameTs = 0;
function runGameFrame(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let elapsed = timestamp - lastTime;

    if (elapsed >= frameInterval) {
        let dt = (prevFrameTs ? (timestamp - prevFrameTs) : elapsed) / 1000;
        prevFrameTs = timestamp;
        
        // FIXED: Re-calculated clean animation interval steps
        lastTime = timestamp - (elapsed % frameInterval);
        
        // FIXED: Strict time step delta ceiling cap boundary! 
        // This physically prevents browser alert freezes or lag spikes from accelerating your pet action loops.
        if (dt > 0.1) dt = 0.1;

        // Shop buffs (Cake / Wisdom Potion) count down in real time (see tickShopBuffs in
        // state.js for why this doesn't use `dt`).
        tickShopBuffs();
        // Sugar-glider stamina timers use the same wall-clock approach (see world.js).
        tickGliderClock();
        // Region 10 flower-garden timers (growth, thirst, withering) run on that same real clock.
        tickGarden();
        beginPetText(); // pet labels are queued while drawing and flushed onto the crisp overlay below

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // --- REGION GRID BACKGROUNDS RENDERING LAYER ---
        // Regions 1-8: detailed scenery painted once into a cache and blitted here (backgrounds.js).
        if (currentRegion <= 8) {
            drawRegionBackground(currentRegion);
        } else if (currentRegion === 9) {
            // Bedroom: wooden floor, back wall with a window, bed, desk, rug and two small
            // artificial trees with an opening (world.js — the layout is shared with the gliders).
            drawBedroomBackground();
        } else if (currentRegion === 10) {
            // Flower garden: lawn, hedge, meadow flowers and the raised bed with the 12 plots
            // (world.js). Plots are part of the ground, so they are drawn here, under the pets.
            drawGardenBackground();
            drawGardenPlots();
        }


        // --- CORE LOGIC STEP PHYSICS HANDLERS ---
        processSpawns(dt);
        player.update(dt);
        checkCollisions();
        checkTutorialTriggers();   // perk-point / fully-grown-pet tips (tutorial.js)
        updateGardenButtons();   // Buy Plot / Fertilize / Water button (Region 10)
        updateFeederButton();    // Deposit Food button (feeder boxes)
        if (isGardenBoostActive()) {
            const gb = Math.round(countWateredBlooms() * GARDEN_BOOST * 100);
            drawPetText(`🌸 Garden bonus: +${gb}% coins · bees +${gb}% faster`, canvas.width / 2, 64, { size: 10, color: '#ffd1e8' });
        }

        drawFeeder();   // feeder box (every region except 4 and 10)

        // --- MAP LOOT ELEMENT DISPLAY DRAWS ---
        if (currentRegion === 4) {
            // Check to protect the flower array reference from crashing if empty
            let currentRItems = regionalItems[currentRegion];
            if (currentRItems && currentRItems.flowers) {
                currentRItems.flowers.forEach(fl => fl.draw());
            }
        } else if (currentRegion === 8) {
            // Region 8 only ever spawns bananas — no food/water here.
            let currentRItems = regionalItems[currentRegion];
            if (currentRItems && currentRItems.bananas) {
                currentRItems.bananas.forEach(b => b.draw());
            }
        } else {
            let currentRItems = regionalItems[currentRegion];
            if (currentRItems) {
                if (currentRItems.foods) currentRItems.foods.forEach(f => f.draw());
                if (currentRItems.waters) currentRItems.waters.forEach(w => w.draw());
            }
            
            if (currentRegion === 3 && currentRItems && currentRItems.eggs) {
                currentRItems.eggs.forEach(egg => {
                    ctx.fillStyle = '#ffffff';
                    ctx.beginPath();
                    ctx.ellipse(egg.x, egg.y, 6, 8, 0, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#dcdde1';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                });
            }
        }

        // --- AUTOMATED PET STATE PHYSICS & DRAWS ---
        for (let r = 1; r <= 10; r++) {
            if (!isRegionUnlocked(r)) continue;

            let activePets = petsByRegion[r];
            if (Array.isArray(activePets)) {
                activePets.forEach(pet => {
                    // Pull mapping structures safely from the unified regionalItems matrix dictionary data slots
                    // Region 8 has no real "food"/"water" of its own — its bananas are
                    // fed into the food slot so monkeys can reuse the exact same generic
                    // nearest-item forage targeting every other forager already uses.
                    let rFood = (r === 8)
                        ? (regionalItems[8] ? regionalItems[8].bananas : [])
                        : (regionalItems[r] ? regionalItems[r].foods : []);
                    let rWater = regionalItems[r] ? regionalItems[r].waters : [];
                    let rFlower = regionalItems[r] ? regionalItems[r].flowers : [];
                    
                    // Squirrel's speed boost, the bird's excursion-visit boost, and any
                    // Lv10+ gliders dropped here all apply to whatever pets are in this
                    // region right now.
                    pet._regionSpeedMult = getRegionSpeedBoost(r) * getBirdVisitSpeedBoost(r) * getGliderSpeedBoost(r);
                    // Region 10 flower garden: bees move 10% faster while a bloom is watered.
                    if (pet.type === 'bee') pet._regionSpeedMult *= getGardenBeeBoost();
                    pet.update(dt, rFood, rWater, rFlower);
                    
                    if (r === currentRegion) {
                        pet.draw();
                    }
                });
            }
        }

        // Sugar gliders (Region 9's pets) live in their own list, and each one is updated in
        // whichever region it was dropped in (`regionNow`) — using THAT region's items — no
        // matter which region the player is looking at, exactly like the pets above. The
        // region-unlock rule applies the same way (a locked region is frozen). A glider the
        // player is carrying isn't updated or drawn here — it's drawn with the player below.
        gliderPets.forEach(g => {
            if (g.held) return;
            let gr = g.regionNow;
            if (!isRegionUnlocked(gr)) return;
            let gFood = (gr === 8)
                ? (regionalItems[8] ? regionalItems[8].bananas : [])
                : (regionalItems[gr] ? regionalItems[gr].foods : []);
            let gWater = regionalItems[gr] ? regionalItems[gr].waters : [];
            let gFlower = regionalItems[gr] ? regionalItems[gr].flowers : [];

            g._regionSpeedMult = getRegionSpeedBoost(gr) * getBirdVisitSpeedBoost(gr) * getGliderSpeedBoost(gr);
            g.update(dt, gFood, gWater, gFlower);

            if (gr === currentRegion) {
                g.draw();
            }
        });

        player.draw();
        drawHeldGlider();

        // Bird excursion fly-away/landing poof effects (world.js) — drawn last so they
        // sit on top of everything else in whichever region they were spawned in.
        updateRegionFX(dt);
        drawRegionFX();

        // Floating "+N coins" popups (world.js) — same idea, drawn on top.
        updateCoinPopups(dt);
        drawCoinPopups();

        // Bamboo Fever minigame (Panda Lv20 perk) — countdown/collision runs regardless
        // of region (it's a hard 30s window), drawing is gated to Region 7 internally.
        updateBambooFever(dt);
        drawBambooItems();

        // Runs every frame (not just after feed/forage events) so the interactBtn
        // label reacts immediately as the player walks toward/away from a boxed cat —
        // proximity has to be checked continuously, unlike the elephant's PLAY check
        // which doesn't depend on distance.
        updateUI();

        // Draw this frame's queued pet labels onto the full-resolution overlay (world.js).
        flushPetText();
    } // This bracket cleanly closes the frameInterval condition block scope layer
}

// Ensure your game startup chain initializes your Codex masks tightly at launch:
loadGameProgress();
updateUI();
// Brand-new game: show the welcome guide (saves from before the tutorial existed are skipped in loadGameProgress).
if (!tutorialSeen.intro) showTutorial('intro');
if (typeof updateCodexData === 'function') updateCodexData(); // FIXED: Synchronizes canvas masks on load

setInterval(saveGameProgress, 10000);

// Also save the moment the app is sent to the background, switched away from, or closed: on a phone
// the WebView can be frozen or killed at that point, and the 10-second timer above would never run
// again (everything since the last tick would be lost). `visibilitychange` (hidden) is the reliable
// one on mobile; `pagehide` covers closing/navigating away. saveGameProgress() does nothing while
// a save wipe is in progress (saveDisabled), so these can't undo a wipe.
document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') saveGameProgress();
});
window.addEventListener('pagehide', saveGameProgress);

FOOD_WATER_REGIONS.forEach(r => {
    for (let i = 0; i < 3; i++) {
        regionalItems[r].foods.push(new Item('food'));
        regionalItems[r].waters.push(new Item('water'));
    }
});

// Region 8 has no food/water — seed it with starting bananas instead, same idea as
// the loop above. Seeded to 6 (not 3) to mirror a standard food/water region's total
// starting item count (3 food + 3 water = 6 items), since bananas are Region 8's only
// resource and need to carry that same "combined" quantity on their own.
for (let i = 0; i < 6; i++) {
    regionalItems[8].bananas.push(new Item('banana'));
}

// Adds the Region 6 (Pig Sty) option to the region dropdown in JS, so no index.html
// edit is needed — same "build it in JS" approach as the level-up toast and whistle
// picker. Only added if it isn't already there (e.g. if it's later added to the HTML
// directly), so this stays a no-op rather than creating a duplicate option.
if (regionSelector && !regionSelector.querySelector('option[value="6"]')) {
    let pigOption = document.createElement('option');
    pigOption.value = '6';
    pigOption.textContent = 'Region 6';
    regionSelector.appendChild(pigOption);
}

// Same approach for Region 7 (Panda habitat).
if (regionSelector && !regionSelector.querySelector('option[value="7"]')) {
    let pandaOption = document.createElement('option');
    pandaOption.value = '7';
    pandaOption.textContent = 'Region 7';
    regionSelector.appendChild(pandaOption);
}

// Same approach for Region 8 (Monkey jungle).
if (regionSelector && !regionSelector.querySelector('option[value="8"]')) {
    let monkeyOption = document.createElement('option');
    monkeyOption.value = '8';
    monkeyOption.textContent = 'Region 8';
    regionSelector.appendChild(monkeyOption);
}

// Same approach for Region 9 (Bedroom).
if (regionSelector && !regionSelector.querySelector('option[value="9"]')) {
    let bedroomOption = document.createElement('option');
    bedroomOption.value = '9';
    bedroomOption.textContent = 'Region 9';
    regionSelector.appendChild(bedroomOption);
}

// Same approach for Region 10 (Flower Garden).
if (regionSelector && !regionSelector.querySelector('option[value="10"]')) {
    let gardenOption = document.createElement('option');
    gardenOption.value = '10';
    gardenOption.textContent = 'Region 10';
    regionSelector.appendChild(gardenOption);
}

// The saved game is loaded before the Region 6-10 options above exist, so a save made while
// standing in one of them left the dropdown showing "Region 1" after a reload even though the
// game resumed in that region. Sync it now that every option is present.
if (regionSelector && typeof currentRegion !== 'undefined') {
    regionSelector.value = String(currentRegion);
}

// (The joystick is floating now — it stays hidden until the player touches the field; see input.js.)
if (document.getElementById('interactBtn')) document.getElementById('interactBtn').style.display = 'flex';

requestAnimationFrame(gameLoop);
