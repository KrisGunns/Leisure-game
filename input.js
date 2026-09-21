// ============================================================
// input.js — All player input handling: floating virtual joystick, the
// GIVE/PLAY interact button (hold-to-feed), whistle button,
// region selector, and keyboard controls.
// Depends on: state.js, entities.js, world.js. Load AFTER those.
// ============================================================

const joyContainer = document.getElementById('joystickContainer');
const joyHandle = document.getElementById('joystickHandle');
// The whole play area. The joystick is FLOATING: it isn't drawn until the player puts a finger
// down on the game field, then appears right under that finger and works from there until the
// finger lifts (it can be started anywhere, not from a fixed corner spot).
const joyArea = document.getElementById('canvasWrapper');

let joyActive = false;
let joyTouchId = null; // identifier of the specific touch driving the joystick
let joyOriginX = 0;
let joyOriginY = 0;

function findTouchById(touchList, id) {
    for (let i = 0; i < touchList.length; i++) {
        if (touchList[i].identifier === id) return touchList[i];
    }
    return null;
}

function resetJoystick() {
    joyActive = false;
    joyTouchId = null;
    input.up = false;
    input.down = false;
    input.left = false;
    input.right = false;
    if (joyHandle) joyHandle.style.transform = 'translate(0px, 0px)';
    if (joyContainer) joyContainer.style.display = 'none'; // floating: only visible while held
}

// Only a touch that lands on the bare game field starts the joystick. A touch that lands on a
// button or other control (GIVE/TAKE, whistle, buy bee, MENU, the mini-game pickers, ...) is that
// control's own business — the joystick must not appear under it or steal the press.
function isJoystickSurface(target) {
    return target === joyArea || (target && target.id === 'gameCanvas');
}

// Centres the joystick base on a screen point (coordinates are relative to the play area,
// which is the joystick's positioned parent).
function placeJoystickAt(clientX, clientY) {
    if (!joyContainer || !joyArea) return;
    joyContainer.style.display = 'flex'; // must be displayed before its size can be read
    const areaRect = joyArea.getBoundingClientRect();
    joyContainer.style.left = (clientX - areaRect.left - joyContainer.offsetWidth / 2) + 'px';
    joyContainer.style.top = (clientY - areaRect.top - joyContainer.offsetHeight / 2) + 'px';
    joyContainer.style.bottom = 'auto';
}

if (joyArea) {
    joyArea.addEventListener('touchstart', (e) => {
        if (!isJoystickSurface(e.target)) return; // a control's own touch — leave it alone
        e.preventDefault();
        if (joyActive) return; // already tracking a touch on the joystick, ignore any extra one
        const touch = e.changedTouches[0];
        joyActive = true;
        joyTouchId = touch.identifier;
        // The joystick's centre is wherever the finger first came down, so nothing moves until
        // the finger is dragged away from that spot.
        joyOriginX = touch.clientX;
        joyOriginY = touch.clientY;
        placeJoystickAt(touch.clientX, touch.clientY);
        handleJoystickMove(touch.clientX, touch.clientY);
    }, { passive: false });

    // A touch keeps reporting to the element it STARTED on, so the move events arrive on the
    // play area (they bubble up from the canvas) for as long as that finger is down.
    joyArea.addEventListener('touchmove', (e) => {
        if (!joyActive) return;
        // Find the joystick's own touch by identifier rather than assuming touches[0] —
        // with a second finger down elsewhere (e.g. holding GIVE), touches[0] can be
        // that OTHER touch, which was dragging the handle toward wherever that finger
        // was instead of tracking the finger actually on the joystick.
        const touch = findTouchById(e.touches, joyTouchId);
        if (!touch) return;
        e.preventDefault();
        handleJoystickMove(touch.clientX, touch.clientY);
    }, { passive: false });

    // A long press on the field would otherwise pop the browser/WebView's context menu.
    joyArea.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Listen on window (not just the joystick) so lifting the finger anywhere still
// releases the joystick, but only reset when it's actually the joystick's own touch
// ending — otherwise lifting a different finger (e.g. GIVE) would wrongly cancel it.
window.addEventListener('touchend', (e) => {
    if (!joyActive) return;
    if (findTouchById(e.changedTouches, joyTouchId)) resetJoystick();
});

// touchcancel was previously unhandled: if the OS/WebView cancels the touch instead of
// sending touchend (common in APK wrapper WebViews, e.g. WebIntoApp), joyActive/input
// would stay stuck at their last values forever, walking the character in that
// direction indefinitely. This is very likely what caused the "joystick stuck after
// lifting finger" bug seen in the APK build.
window.addEventListener('touchcancel', (e) => {
    if (!joyActive) return;
    if (findTouchById(e.changedTouches, joyTouchId)) resetJoystick();
});

// Extra safety nets, mirroring the GIVE button's haltFeedTimers pattern below —
// guarantees the joystick can never get stuck pushing a direction even if no
// touch-ending event ever arrives at all (app backgrounded, dialog steals input, etc.)
window.addEventListener('blur', resetJoystick);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) resetJoystick();
});

function handleJoystickMove(clientX, clientY) {
    let dx = clientX - joyOriginX;
    let dy = clientY - joyOriginY;
    let distance = Math.sqrt(dx * dx + dy * dy);
    let maxRadius = 35;

    if (distance > maxRadius) {
        dx = (dx / distance) * maxRadius;
        dy = (dy / distance) * maxRadius;
    }

    if (joyHandle) joyHandle.style.transform = `translate(${dx}px, ${dy}px)`;

    let threshold = 10;
    input.left = dx < -threshold;
    input.right = dx > threshold;
    input.up = dy < -threshold;
    input.down = dy > threshold;
}
const interactBtnElement = document.getElementById('interactBtn');
// Auxiliary GIVE / PLAY button. It is only visible while the main button is busy being
// TAKE or DROP (a sugar glider is in reach, or being carried — see updateUI() in ui.js), so
// feeding pets and the cat / elephant mini-games stay reachable in that situation.
const giveAuxBtnElement = document.getElementById('giveAuxBtn');

// The main button's Take / Drop action for the sugar gliders (Region 9's pets). Returns true if it
// did something. A single tap, not a hold. It mirrors getGliderButtonMode() (world.js), which
// is what labels the button.
function handleGliderButton() {
    if (getHeldGlider()) {
        dropGlider();
        return true;
    }
    const g = findTakeableGlider();
    if (g) {
        takeGlider(g);
        return true;
    }
    return false;
}

// One press of a GIVE / PLAY button (hold-to-feed). Shared by the main button (whenever it
// isn't currently Take / Drop) and the auxiliary GIVE button, so both behave identically.
function startGiveHold(buttonEl, e) {
    // Cat's Schrödinger box takes priority over the normal GIVE action — updateUI()
    // (ui.js) only sets this while the player is standing near a boxed cat.
    if (typeof activeSchrodingerCat !== 'undefined' && activeSchrodingerCat) {
        if (typeof showSchrodingerPicker === 'function') showSchrodingerPicker(activeSchrodingerCat);
        return;
    }

    // Capture the pointer to this button for the duration of the press. Without
    // this, a touch's natural micro-movement during a hold (a few px of finger
    // drift, still very much on the screen) fires a real `pointerleave` the moment
    // it crosses the button's edge — which haltFeedTimers() below was treating as
    // "the player let go," cutting the hold short or making a press feel like it
    // never registered in the first place. Capturing keeps every subsequent event
    // for this pointer targeted at the button regardless of where the finger
    // actually drifts, so the hold only ever ends on a genuine release.
    if (typeof buttonEl.setPointerCapture === 'function') {
        try { buttonEl.setPointerCapture(e.pointerId); } catch (err) { /* unsupported/already released — fine, falls back to normal hit-testing */ }
    }

    haltFeedTimers(); // never leave an earlier hold's interval running
    feedHoldCounter = 0; 
    executeContinuousFeed();
    
    feedInterval = setInterval(() => {
        feedHoldCounter++;
        executeContinuousFeed();
    }, 100); 
}

function bindGiveButtonRelease(buttonEl) {
    buttonEl.addEventListener('pointerup', haltFeedTimers);
    buttonEl.addEventListener('pointerleave', haltFeedTimers);
    buttonEl.addEventListener('pointercancel', haltFeedTimers);
    // Fallback in case capture is released by the OS/browser without a matching
    // pointerup/pointercancel ever arriving (rare, but same spirit as the other
    // safety nets below) — makes sure the hold can't get stuck running forever.
    buttonEl.addEventListener('lostpointercapture', haltFeedTimers);
}

if (interactBtnElement) {
    interactBtnElement.addEventListener('pointerdown', (e) => {
        e.preventDefault();

        // TAKE / DROP for the sugar gliders comes first: when a glider is in reach (or being
        // carried) this button IS that action, and it's a single tap — no hold-to-feed.
        if (handleGliderButton()) {
            updateUI();
            return;
        }

        startGiveHold(interactBtnElement, e);
    });

    bindGiveButtonRelease(interactBtnElement);
}

if (giveAuxBtnElement) {
    giveAuxBtnElement.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        startGiveHold(giveAuxBtnElement, e);
    });

    bindGiveButtonRelease(giveAuxBtnElement);
}

// SAFETY NET: guarantees the feed-hold interval always stops, even if the button
// itself never receives its pointerup/pointercancel (e.g. a dialog steals the touch,
// the app is backgrounded, or the WebView used by the APK wrapper drops the event).
document.addEventListener('pointerup', haltFeedTimers);
document.addEventListener('pointercancel', haltFeedTimers);
window.addEventListener('blur', haltFeedTimers);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) haltFeedTimers();
});

function haltFeedTimers() {
    if (feedInterval) clearInterval(feedInterval);
    if (feedTurboTimeout) clearTimeout(feedTurboTimeout);
    feedInterval = null;
    feedTurboTimeout = null;
    feedHoldCounter = 0;
}
// INPUT HANDLER REGION
if (whistleBtn) {
    whistleBtn.addEventListener('click', () => {
        let activePets = petsByRegion[currentRegion];
        if (!Array.isArray(activePets)) return;

        // bee is excluded — it has its own hive-return autonomy, not whistle-recalled.
        // level < 2 pets aren't tamed enough to respond yet.
        let eligiblePets = activePets.filter(pet => pet.type !== 'bee' && pet.level >= 2 && isPetAvailable(pet));

        if (eligiblePets.length === 0) return;

        if (eligiblePets.length === 1) {
            // Only one eligible pet in this region — keep the original one-tap toggle.
            let pet = eligiblePets[0];
            if (pet.state !== 'whistled') {
                pet.state = 'whistled';
                whistleBtn.textContent = 'RETURN';
            } else {
                pet.state = 'wander';
                pet.pickNewWanderTarget();
                whistleBtn.textContent = 'WHISTLE';
            }
            if (typeof hideWhistlePicker === 'function') hideWhistlePicker();
        } else {
            // Multiple eligible pets (e.g. Region 3: Squirrel + Chicken) — let the
            // player pick which one(s) to call instead of whistling all of them at once.
            if (typeof showWhistlePicker === 'function') showWhistlePicker(eligiblePets);
        }
    });
}

// Paste this directly below your if (whistleBtn) { ... } listener block
if (regionSelector) {
    regionSelector.addEventListener('change', (e) => {
        let selectedRegion = parseInt(e.target.value);

        // Regions 4-9 have to be bought in the shop (Menu > Shop > Unlockables).
        if (!isRegionUnlocked(selectedRegion)) {
            const regionUnlockable = getUnlockable('region_' + selectedRegion);
            const price = regionUnlockable ? ` for ${regionUnlockable.cost} 🪙` : '';
            alert(`🔒 Region locked! You can unlock Region ${selectedRegion}${price} in the Shop (Menu → Shop → Unlockables).`);
            regionSelector.value = currentRegion;
            return;
        }

        currentRegion = selectedRegion;
        foods = regionalItems[currentRegion].foods;
        waters = regionalItems[currentRegion].waters;
        flowers = regionalItems[currentRegion].flowers;
        bananas = regionalItems[currentRegion].bananas;
        if (whistleBtn) whistleBtn.textContent = 'WHISTLE';
        if (typeof hideWhistlePicker === 'function') hideWhistlePicker();

        // Pending pet-choice pickers (Schrödinger, Bamboo Fever) are fixed-position DOM
        // overlays, not tied to the canvas — nothing was hiding them on a region switch,
        // so they used to stay on screen and follow the player to every other region.
        if (typeof hideSchrodingerPicker === 'function') hideSchrodingerPicker();
        if (typeof hideBambooFeverPicker === 'function') hideBambooFeverPicker();
        // Bamboo Fever's picker (unlike Schrödinger's) opens immediately with no
        // proximity-based re-open once dismissed — so if it's closed here before the
        // player actually answers it, also reset the panda out of 'bamboo_wait', or it
        // would stay frozen forever with no way to ever resume the choice.
        if (typeof petsByRegion !== 'undefined' && petsByRegion[7]) {
            petsByRegion[7].forEach(p => {
                if (p.type === 'panda' && p.state === 'bamboo_wait') {
                    p.state = 'wander';
                    if (typeof p.pickNewWanderTarget === 'function') p.pickNewWanderTarget();
                }
            });
        }

        saveGameProgress();
    });
}

window.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w') input.up = true;
    if (e.key === 'ArrowDown' || e.key === 's') input.down = true;
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = true;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = true;
    if (e.key === ' ' || e.key === 'e') {
        e.preventDefault();
        // Same as the main button: TAKE / DROP when a sugar glider is in reach or carried
        // (once per key press, not while held down), otherwise GIVE.
        if (getGliderButtonMode() !== 'normal') {
            if (!e.repeat) handleGliderButton();
        } else {
            executeContinuousFeed();
        }
    }
    // Keyboard equivalent of the auxiliary GIVE button (feeding while the main button is Take/Drop).
    if (e.key === 'f') {
        executeContinuousFeed();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w') input.up = false;
    if (e.key === 'ArrowDown' || e.key === 's') input.down = false;
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
});

// Fraction of a pet's remaining requirement given per 100ms tick, ramping up the longer
// GIVE has been held (thresholds in ticks: 0.5s / 1.5s). Shared by the normal pets and the
// sugar gliders so they always feed at the same speed.
function getFeedFraction() {
    if (feedHoldCounter > 15) return 0.0467;
    if (feedHoldCounter > 5) return 0.025;
    return 0.01;
}

// Feeds the sugar gliders in reach — the ones in the region the player is in, plus the one
// being carried. They aren't in petsByRegion (see gliderPets in world.js), so the loop in
// executeContinuousFeed() doesn't see them. Unlike every other pet they're fed THREE
// resources — honey, bananas and water — and need all three to level up (Base Exp 40 / 40 /
// 20 at level 1). Same +1 XP per unit given as everywhere else.
function feedGliders() {
    const feedFraction = getFeedFraction();

    gliderPets.forEach(g => {
        if (!isPetAvailable(g)) return;
        if (g.level >= 20) return;
        if (!g.held && g.regionNow !== currentRegion) return;

        let dx = (g.x + g.size / 2) - (player.x + player.size / 2);
        let dy = (g.y + g.size / 2) - (player.y + player.size / 2);
        if (Math.sqrt(dx * dx + dy * dy) >= 80) return;

        let req = getLevelRequirement('glider', g.level);
        let totalNeeded = req.honey + req.bananas + req.water;
        let feedAmount = Math.max(1, Math.ceil(totalNeeded * feedFraction));

        for (let i = 0; i < feedAmount; i++) {
            if (g.level >= 20) break;
            let cur = getLevelRequirement('glider', g.level);

            if (g.honeyEaten < cur.honey && inventory.honey > 0) {
                inventory.honey--;
                g.honeyEaten++;
                gainPlayerXP(1);
            } else if (g.bananaEaten < cur.bananas && inventory.bananas > 0) {
                inventory.bananas--;
                g.bananaEaten++;
                gainPlayerXP(1);
            } else if (g.waterEaten < cur.water && inventory.water > 0) {
                inventory.water--;
                g.waterEaten++;
                gainPlayerXP(1);
            } else {
                break;
            }

            if (g.honeyEaten >= cur.honey && g.bananaEaten >= cur.bananas && g.waterEaten >= cur.water) {
                g.level++;
                g.honeyEaten = 0;
                g.bananaEaten = 0;
                g.waterEaten = 0;
                // Its max stamina may have gone up (Lv5/10/15/20); the current stamina is left
                // as it is — updateGlider() only ever clamps it down to the max.
                saveGameProgress();
            }
        }
    });
    updateUI();
}

function executeContinuousFeed() {
    let activePets = petsByRegion[currentRegion];
    if (!Array.isArray(activePets)) return;

    feedGliders();

        activePets.forEach(pet => {
        if (!isPetAvailable(pet)) return; // not bought yet — not in the world
        // Play button press triggers Step 2 (The Retreat) instead of paying out early
        if (pet.type === 'elephant' && pet.state === 'playing_approach') {
            pet.state = 'playing_retreat';
            updateUI();
            return;
        }
        
        // Prevent standard resource feeding or cheating payouts while any mini-game state is active
        if (pet.type === 'elephant' && (pet.state.startsWith('playing') || pet.state === 'playing_wait_for_move')) return;

        
        let dx = (pet.x + pet.size / 2) - (player.x + player.size / 2);
        let dy = (pet.y + pet.size / 2) - (player.y + player.size / 2);
        let dist = Math.sqrt(dx * dx + dy * dy);
        
        if (dist < 80) {
            let req = getLevelRequirement(pet.type, pet.level);

            // Feed speed scales with how much this pet's current level actually needs,
            // rather than a fixed unit count per tick — a flat rate meant a pet needing
            // a few hundred food/water at high levels took far longer to fill than one
            // needing a handful. These fractions (of the total still needed) are tuned
            // so holding at max speed fills the bar in ~3 seconds regardless of the
            // pet's actual requirement: roughly 1% per tick for the first 0.5s, 2.5%
            // per tick through 1.5s, then ~4.7% per tick from 1.5s onward (which is
            // also the sustained "max speed" rate for any overflow into further levels).
            let totalNeeded = (pet.type === 'bear' || pet.type === 'monkey') ? req : (req.food + req.water);
            if (!(totalNeeded > 0)) totalNeeded = 1;

            let feedFraction = getFeedFraction();

            let feedAmount = Math.max(1, Math.ceil(totalNeeded * feedFraction));

            for (let i = 0; i < feedAmount; i++) {
                if (pet.level >= 20) break;
                
                if (pet.type === 'bear') {
                    if (inventory.honey > 0) {
                        inventory.honey--;
                        pet.foodEaten++;
                        gainPlayerXP(1); // +1 XP per honey given, same as every other pet's per-unit feed
                        if (pet.foodEaten >= req) {
                            pet.level++;
                            pet.foodEaten = 0;
                            pet.pickNewWanderTarget();
                            if (pet.state === 'idle') pet.state = 'wander';
                            saveGameProgress();
                        }
                    } else {
                        break;
                    }
                } else if (pet.type === 'monkey') {
                    if (inventory.bananas > 0) {
                        inventory.bananas--;
                        pet.foodEaten++;
                        gainPlayerXP(1); // +1 XP per banana given, same as every other pet's per-unit feed
                        if (pet.foodEaten >= req) {
                            pet.level++;
                            pet.foodEaten = 0;
                            pet.pickNewWanderTarget();
                            if (pet.state === 'idle') pet.state = 'wander';
                            saveGameProgress();
                        }
                    } else {
                        break;
                    }
                } else {
                    let currentReq = getLevelRequirement(pet.type, pet.level);
                    if (pet.foodEaten < currentReq.food && inventory.food > 0) {
                        inventory.food--;
                        pet.foodEaten++;
                        gainPlayerXP(1);
                    } else if (pet.waterEaten < currentReq.water && inventory.water > 0) {
                        inventory.water--;
                        pet.waterEaten++;
                        gainPlayerXP(1);
                    } else {
                        break;
                    }

                    if (pet.foodEaten >= currentReq.food && pet.waterEaten >= currentReq.water) {
                        pet.level++;
                        pet.foodEaten = 0;
                        pet.waterEaten = 0;
                        pet.pickNewWanderTarget();
                        if (pet.state === 'idle') pet.state = 'wander';
                        saveGameProgress();
                    }
                }
            }
            updateUI();
        }
    });
}

