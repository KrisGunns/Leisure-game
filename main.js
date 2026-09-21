// ============================================================
// main.js — The game loop (background draw, physics/AI update,
// render) and startup sequence (load save, initial item spawns,
// kick off the loop). Depends on ALL other files. Load LAST.
// ============================================================

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let elapsed = timestamp - lastTime;

    if (elapsed >= frameInterval) {
        let dt = (timestamp - lastTime) / 1000;
        
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

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        // --- REGION GRID BACKGROUNDS RENDERING LAYER ---
        if (currentRegion === 1) {
            ctx.fillStyle = '#27ae60';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#2ecc71';
            for (let x = 40; x < canvas.width; x += 80) {
                for (let y = 40; y < canvas.height; y += 80) {
                    ctx.fillRect(x, y, 4, 12);
                    ctx.fillRect(x + 8, y + 4, 4, 8);
                }
            }
        } else if (currentRegion === 2) {
            ctx.fillStyle = '#f1c40f';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#e67e22';
            for (let x = 30; x < canvas.width; x += 70) {
                for (let y = 50; y < canvas.height; y += 70) {
                    ctx.fillRect(x, y, 6, 6);
                    ctx.fillRect(x + 12, y + 10, 4, 4);
                }
            }
        } else if (currentRegion === 3) {
            ctx.fillStyle = '#1e824c';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#3e2723';
            for (let x = 50; x < canvas.width; x += 90) {
                for (let y = 30; y < canvas.height; y += 90) {
                    ctx.fillRect(x, y, 8, 4);
                    ctx.fillRect(x + 15, y + 8, 4, 4);
                }
            }
        } else if (currentRegion === 4) {
            ctx.fillStyle = '#6c5ce7';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#a29bfe';
            for (let x = 45; x < canvas.width; x += 85) {
                for (let y = 35; y < canvas.height; y += 85) {
                    ctx.fillRect(x, y, 4, 4);
                    ctx.fillRect(x + 10, y + 6, 6, 2);
                }
            }
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.arc(region4Hive.x, region4Hive.y, 20, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#d35400';
            ctx.fillRect(region4Hive.x - 12, region4Hive.y + 4, 24, 6);
            ctx.fillStyle = '#2c3e50';
            ctx.beginPath();
            ctx.arc(region4Hive.x, region4Hive.y + 6, 4, 0, Math.PI * 2);
            ctx.fill();
        } else if (currentRegion === 5) {
            ctx.fillStyle = '#013220'; 
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#8b5a2b';
            for (let x = 50; x < canvas.width; x += 110) {
                ctx.fillRect(x, 40, 10, 25);
                ctx.fillStyle = '#228b22';
                ctx.beginPath(); ctx.arc(x + 5, 35, 22, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#8b5a2b';
            }
            ctx.fillStyle = '#2980b9';
            ctx.fillRect(30, canvas.height - 130, canvas.width - 60, 90);
            ctx.strokeStyle = '#3498db';
            ctx.lineWidth = 4;
            ctx.strokeRect(30, canvas.height - 130, canvas.width - 60, 90);
        } else if (currentRegion === 6) {
            // Pig sty: straw/dirt ground with wooden fence posts and a small muddy pit.
            ctx.fillStyle = '#c9a66b';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#b8905a';
            for (let x = 25; x < canvas.width; x += 55) {
                for (let y = 25; y < canvas.height; y += 55) {
                    ctx.fillRect(x, y, 3, 10); // straw flecks
                    ctx.fillRect(x + 6, y + 4, 3, 6);
                }
            }
            // Wooden fence border
            ctx.fillStyle = '#8b5a2b';
            for (let x = 20; x < canvas.width - 20; x += 40) {
                ctx.fillRect(x, 20, 8, 10);
                ctx.fillRect(x, canvas.height - 30, 8, 10);
            }
            // Small muddy area in the middle of the sty — purely visual flavor; pigs'
            // mud-play state can trigger anywhere in the region, not just here.
            let mudX = canvas.width / 2 - 60;
            let mudY = canvas.height / 2 - 35;
            ctx.fillStyle = '#5c4326';
            ctx.beginPath();
            ctx.ellipse(mudX + 60, mudY + 35, 65, 38, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#3e2f1c';
            ctx.beginPath();
            ctx.ellipse(mudX + 60, mudY + 35, 65, 38, 0, 0, Math.PI * 2);
            ctx.stroke();
            ctx.fillStyle = 'rgba(0,0,0,0.15)';
            ctx.beginPath();
            ctx.ellipse(mudX + 40, mudY + 25, 18, 10, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(mudX + 85, mudY + 45, 14, 8, 0, 0, Math.PI * 2);
            ctx.fill();
        } else if (currentRegion === 7) {
            // Panda habitat: soft forest green ground, bamboo groves, and a couple of
            // tree clusters (same tree-drawing style as Region 5's lake forest).
            ctx.fillStyle = '#356a3d';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#3f7a48';
            for (let x = 35; x < canvas.width; x += 75) {
                for (let y = 35; y < canvas.height; y += 75) {
                    ctx.fillRect(x, y, 4, 10);
                    ctx.fillRect(x + 8, y + 5, 4, 6);
                }
            }
            // Bamboo groves (tall segmented stalks) clustered in a few spots.
            ctx.fillStyle = '#8bc34a';
            let bambooSpots = [
                [40, 60], [55, 90], [canvas.width - 60, 70], [canvas.width - 40, 100],
                [40, canvas.height - 100], [canvas.width - 55, canvas.height - 90]
            ];
            bambooSpots.forEach(([bx, byy]) => {
                ctx.fillStyle = '#8bc34a';
                ctx.fillRect(bx - 3, byy - 30, 6, 60);
                ctx.fillStyle = '#558b2f';
                ctx.fillRect(bx - 3, byy - 30, 6, 4);
                ctx.fillRect(bx - 3, byy - 12, 6, 4);
                ctx.fillRect(bx - 3, byy + 6, 6, 4);
                ctx.fillRect(bx - 3, byy + 24, 6, 4);
            });
            // Tree clusters.
            ctx.fillStyle = '#5d4037';
            for (let x = 70; x < canvas.width; x += 130) {
                ctx.fillRect(x, 30, 10, 26);
                ctx.fillStyle = '#2e7d32';
                ctx.beginPath(); ctx.arc(x + 5, 25, 24, 0, Math.PI * 2); ctx.fill();
                ctx.fillStyle = '#5d4037';
            }
        } else if (currentRegion === 8) {
            // Jungle: deep green canopy-shadowed ground, several trees with vines
            // hanging down from their canopies.
            ctx.fillStyle = '#1b4d2e';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.fillStyle = '#225c38';
            for (let x = 30; x < canvas.width; x += 60) {
                for (let y = 30; y < canvas.height; y += 60) {
                    ctx.fillRect(x, y, 4, 10);
                    ctx.fillRect(x + 8, y + 5, 4, 6);
                }
            }
            // Trees (brown trunks, green canopies) with vines dangling from the canopy.
            let jungleTrees = [
                [55, 55], [canvas.width - 60, 65], [canvas.width / 2, 45],
                [50, canvas.height - 90], [canvas.width - 55, canvas.height - 100]
            ];
            jungleTrees.forEach(([tx, ty]) => {
                // Vines first, so the trunk/canopy draw on top of where they start.
                ctx.strokeStyle = '#4a7c2f';
                ctx.lineWidth = 3;
                [-14, 0, 14].forEach(offset => {
                    ctx.beginPath();
                    ctx.moveTo(tx + offset, ty + 10);
                    ctx.quadraticCurveTo(tx + offset + 5, ty + 45, tx + offset, ty + 80);
                    ctx.stroke();
                });
                ctx.fillStyle = '#5d4037'; // trunk
                ctx.fillRect(tx - 5, ty, 10, 26);
                ctx.fillStyle = '#2e7d32'; // canopy
                ctx.beginPath(); ctx.arc(tx, ty - 6, 26, 0, Math.PI * 2); ctx.fill();
            });
        } else if (currentRegion === 9) {
            // Bedroom: wooden floor, back wall with a window, bed, desk, rug and two small
            // artificial trees with an opening (world.js — the layout is shared with the gliders).
            drawBedroomBackground();
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

        // --- CORE LOGIC STEP PHYSICS HANDLERS ---
        processSpawns(dt);
        player.update(dt);
        checkCollisions();

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
        for (let r = 1; r <= 9; r++) {
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
    } // This bracket cleanly closes the frameInterval condition block scope layer

    // FIXED: Only requestAnimationFrame sits down here at the safe root level!
    requestAnimationFrame(gameLoop);
}

// Ensure your game startup chain initializes your Codex masks tightly at launch:
loadGameProgress();
updateUI();
if (typeof updateCodexData === 'function') updateCodexData(); // FIXED: Synchronizes canvas masks on load

setInterval(saveGameProgress, 10000);

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

// The saved game is loaded before the Region 6-9 options above exist, so a save made while
// standing in one of them left the dropdown showing "Region 1" after a reload even though the
// game resumed in that region. Sync it now that every option is present.
if (regionSelector && typeof currentRegion !== 'undefined') {
    regionSelector.value = String(currentRegion);
}

if (document.getElementById('joystickContainer')) document.getElementById('joystickContainer').style.display = 'flex';
if (document.getElementById('interactBtn')) document.getElementById('interactBtn').style.display = 'flex';

requestAnimationFrame(gameLoop);
