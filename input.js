// ============================================================
// input.js — All player input handling: virtual joystick, the
// GIVE/PLAY interact button (hold-to-feed), whistle button,
// region selector, and keyboard controls.
// Depends on: state.js, entities.js, world.js. Load AFTER those.
// ============================================================

const joyContainer = document.getElementById('joystickContainer');
const joyHandle = document.getElementById('joystickHandle');

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
}

if (joyContainer) {
    joyContainer.addEventListener('touchstart', (e) => {
        e.preventDefault();
        if (joyActive) return; // already tracking a touch on the joystick, ignore any extra one
        const touch = e.changedTouches[0];
        joyActive = true;
        joyTouchId = touch.identifier;
        const rect = joyContainer.getBoundingClientRect();
        joyOriginX = rect.left + rect.width / 2;
        joyOriginY = rect.top + rect.height / 2;
        handleJoystickMove(touch.clientX, touch.clientY);
    }, { passive: false });

    joyContainer.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!joyActive) return;
        // Find the joystick's own touch by identifier rather than assuming touches[0] —
        // with a second finger down elsewhere (e.g. holding GIVE), touches[0] can be
        // that OTHER touch, which was dragging the handle toward wherever that finger
        // was instead of tracking the finger actually on the joystick.
        const touch = findTouchById(e.touches, joyTouchId);
        if (!touch) return;
        handleJoystickMove(touch.clientX, touch.clientY);
    }, { passive: false });
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

if (interactBtnElement) {
    interactBtnElement.addEventListener('pointerdown', (e) => {
        e.preventDefault();

        // Cat's Schrödinger box takes priority over the normal GIVE action — updateUI()
        // (ui.js) only sets this while the player is standing near a boxed cat.
        if (typeof activeSchrodingerCat !== 'undefined' && activeSchrodingerCat) {
            if (typeof showSchrodingerPicker === 'function') showSchrodingerPicker(activeSchrodingerCat);
            return;
        }

        feedHoldCounter = 0; 
        executeContinuousFeed();
        
        feedInterval = setInterval(() => {
            feedHoldCounter++;
            executeContinuousFeed();
        }, 100); 
    });

    interactBtnElement.addEventListener('pointerup', haltFeedTimers);
    interactBtnElement.addEventListener('pointerleave', haltFeedTimers);
    interactBtnElement.addEventListener('pointercancel', haltFeedTimers);
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
        let eligiblePets = activePets.filter(pet => pet.type !== 'bee' && pet.level >= 2);

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

        if (selectedRegion === 7) {
            let allLv10 = true;
            for (let r = 1; r <= 6; r++) {
                if (Array.isArray(petsByRegion[r])) {
                    petsByRegion[r].forEach(pet => {
                        if (pet.level < 10) allLv10 = false;
                    });
                }
            }

            if (!allLv10) {
                alert("🔒 Region locked! Every pet in Regions 1-6 must reach Level 10+ to unlock the Panda's habitat.");
                regionSelector.value = currentRegion;
                return;
            }
        } else if (selectedRegion >= 4) {
            let allTamed = true;
            for (let r = 1; r <= 3; r++) {
                if (Array.isArray(petsByRegion[r])) {
                    petsByRegion[r].forEach(pet => {
                        if (pet.level < 2) {
                            allTamed = false;
                        }
                    });
                }
            }
            
            if (!allTamed) {
                alert("🔒 Region locked! You must tame all pets in Regions 1-3 (reach Level 2+) to unlock this area.");
                regionSelector.value = currentRegion;
                return;
            }
        }
        
        currentRegion = selectedRegion;
        foods = regionalItems[currentRegion].foods;
        waters = regionalItems[currentRegion].waters;
        flowers = regionalItems[currentRegion].flowers;
        if (whistleBtn) whistleBtn.textContent = 'WHISTLE';
        if (typeof hideWhistlePicker === 'function') hideWhistlePicker();
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
        executeContinuousFeed();
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowUp' || e.key === 'w') input.up = false;
    if (e.key === 'ArrowDown' || e.key === 's') input.down = false;
    if (e.key === 'ArrowLeft' || e.key === 'a') input.left = false;
    if (e.key === 'ArrowRight' || e.key === 'd') input.right = false;
});

function executeContinuousFeed() {
    let activePets = petsByRegion[currentRegion];
    if (!Array.isArray(activePets)) return;

        activePets.forEach(pet => {
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
            let feedAmount = 1;

            if (feedHoldCounter > 30) feedAmount = 25;      
            else if (feedHoldCounter > 15) feedAmount = 8;  
            else if (feedHoldCounter > 5) feedAmount = 3;

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

