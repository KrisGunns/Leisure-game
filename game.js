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
    const baseMap = { dog: 20, elephant: 50, squirrel: 10, chicken: 15, bee: 15, bear: 40 };
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
    return { food: Math.floor(reqValue * 0.5), water: Math.floor(reqValue * 0.5) };
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

const input = {
    up: false,
    down: false,
    left: false,
    right: false
};

let feedInterval = null;
let feedTurboTimeout = null;
let feedHoldCounter = 0;

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
}

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
            petsData: {}
        };

        for (let r in petsByRegion) {
            petsByRegion[r].forEach(pet => {
                stateMatrix.petsData[pet.type] = {
                    level: pet.level,
                    label: pet.label,
                    foodEaten: pet.foodEaten,
                    waterEaten: pet.waterEaten,
                    honeyCarried: pet.honeyCarried || 0,
                    fishingTimer: pet.fishingTimer || 0
                };
            });
        }

        localStorage.setItem('just_a_little_leisure_save', JSON.stringify(stateMatrix));
    } catch (e) {
        console.error("Auto-save failed:", e);
    }
}

function loadGameProgress() {
    try {
        const savedData = localStorage.getItem('just_a_little_leisure_save');
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

        if (stateMatrix.currentRegion) {
            currentRegion = stateMatrix.currentRegion;
            if (regionSelector) regionSelector.value = currentRegion;
            foods = regionalItems[currentRegion].foods;
            waters = regionalItems[currentRegion].waters;
            flowers = regionalItems[currentRegion].flowers;
        }

        if (stateMatrix.petsData) {
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
    } catch (e) {
        console.error("Loading save failed:", e);
    }
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.size = 32;
        this.speed = 150;
    }

    update(dt) {
        let moveX = 0;
        let moveY = 0;

        if (input.up) moveY -= 1;
        if (input.down) moveY += 1;
        if (input.left) moveX -= 1;
        if (input.right) moveX += 1;

        if (moveX !== 0 && moveY !== 0) {
            let length = Math.sqrt(moveX * moveX + moveY * moveY);
            moveX /= length;
            moveY /= length;
        }

        this.x += moveX * this.speed * dt;
        this.y += moveY * this.speed * dt;

        let padding = 20;
        if (this.x < padding) this.x = padding;
        if (this.y < padding) this.y = padding;
        if (this.x + this.size > canvas.width - padding) this.x = canvas.width - padding - this.size;
        if (this.y + this.size > canvas.height - padding) this.y = canvas.height - padding - this.size;
    }

    draw() {
        ctx.fillStyle = '#3e2723';
        ctx.fillRect(this.x + 4, this.y, 24, 12);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(this.x + 2, this.y + 12, 28, 20);
        ctx.fillStyle = '#ffcc80';
        ctx.fillRect(this.x + 8, this.y + 4, 16, 10);
        ctx.fillStyle = '#000000';
        ctx.fillRect(this.x + 12, this.y + 7, 2, 2);
        ctx.fillRect(this.x + 18, this.y + 7, 2, 2);
    }
}
class Item {
    constructor(type) {
        this.type = type;
        let padding = 50;
        this.x = Math.random() * (canvas.width - padding * 2) + padding;
        this.y = Math.random() * (canvas.height - padding * 2) + padding;
    }

    draw() {
        if (this.type === 'food') {
            ctx.fillStyle = '#d35400';
            ctx.beginPath();
            ctx.arc(this.x, this.y, 8, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#3e2723';
            ctx.fillRect(this.x - 4, this.y - 4, 2, 2);
            ctx.fillRect(this.x + 2, this.y + 2, 2, 2);
        } else {
            ctx.fillStyle = '#3498db';
            ctx.beginPath();
            ctx.moveTo(this.x, this.y - 8);
            ctx.lineTo(this.x + 6, this.y + 4);
            ctx.lineTo(this.x - 6, this.y + 4);
            ctx.closePath();
            ctx.fill();
        }
    }
}

class Flower {
    constructor() {
        let padding = 50;
        this.x = Math.random() * (canvas.width - padding * 2) + padding;
        this.y = Math.random() * (canvas.height - padding * 2) + padding;
        this.isTargeted = false;
        this.size = 20;
    }

    draw() {
        ctx.strokeStyle = '#2ecc71';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.x, this.y + 15);
        ctx.stroke();
        
        ctx.fillStyle = '#fd79a8';
        for (let i = 0; i < 5; i++) {
            ctx.beginPath();
            ctx.arc(this.x + Math.cos(i * Math.PI * 0.4) * 6, this.y + Math.sin(i * Math.PI * 0.4) * 6, 4, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.fillStyle = '#f1c40f';
        ctx.beginPath();
        ctx.arc(this.x, this.y, 3, 0, Math.PI * 2);
        ctx.fill();
    }
}

class Pet {
    constructor(type, label, color) {
        this.type = type;
        this.label = label;
        this.color = color;
        this.x = 200;
        this.y = 200;
        this.size = 36;
        this.level = 1;
        this.foodEaten = 0;
        this.waterEaten = 0;
        this.state = 'wander'; 
        this.stateTimer = 0;
        this.targetX = this.x;
        this.targetY = this.y;
        this.speed = 80; 
    }

        giveResources() {
        if (this.type === 'bee' || this.level >= 20) return;
        
        // FIXED: Dynamically pulls values from our math engine
        let req = getLevelRequirement(this.type, this.level);

        if (this.foodEaten < req.food && inventory.food > 0) {
            inventory.food--;
            this.foodEaten++;
        } else if (this.waterEaten < req.water && inventory.water > 0) {
            inventory.water--;
            this.waterEaten++;
        }

        if (this.foodEaten >= req.food && this.waterEaten >= req.water) {
            this.level++;
            this.foodEaten = 0;
            this.waterEaten = 0;
            this.pickNewWanderTarget();
            if (this.state === 'idle') this.state = 'wander';
            saveGameProgress();
        }
        updateUI();
    }

    pickNewWanderTarget() {
        let padding = 40;
        this.targetX = Math.random() * (canvas.width - this.size - padding * 2) + padding;
        this.targetY = Math.random() * (canvas.height - this.size - padding * 2) + padding;
    }

    update(dt, regionFoods, regionWaters, activeFlowers = []) {
        // --- BEE AI SYSTEM MATRIX ---
        if (this.type === 'bee') {
            if (this.state === 'whistled') this.state = 'wander';

            let maxCapacity = 1;
            if (this.level >= 20) maxCapacity = 5;
            else if (this.level >= 10) maxCapacity = 3;
            else if (this.level >= 5) maxCapacity = 2;

            if (this.state === 'wander') {
                if (this.honeyCarried >= maxCapacity) {
                    this.state = 'return_hive';
                } else if (!this.targetFlower && activeFlowers.length > 0) {
                    let freeFlower = activeFlowers.find(f => !f.isTargeted);
                    if (freeFlower) {
                        this.targetFlower = freeFlower;
                        freeFlower.isTargeted = true;
                        this.state = 'travel';
                    }
                }
                
                if (this.state === 'wander') {
                    let dx = this.targetX - this.x;
                    let dy = this.targetY - this.y;
                    let dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > 5) {
                        this.x += (dx / dist) * this.speed * dt;
                        this.y += (dy / dist) * this.speed * dt;
                    } else {
                        this.state = 'idle';
                        this.stateTimer = Math.random() * 3 + 1;
                    }
                }
            }

            if (this.state === 'idle') {
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) {
                    this.state = 'wander';
                    this.pickNewWanderTarget();
                }
                return;
            }

            if (this.state === 'travel' && this.targetFlower) {
                let dx = (this.targetFlower.x - this.size / 2) - this.x;
                let dy = (this.targetFlower.y - this.size / 2) - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    this.x += (dx / dist) * (this.speed * 1.5) * dt;
                    this.y += (dy / dist) * (this.speed * 1.5) * dt;
                } else {
                    this.state = 'forage';
                    if (this.level >= 20) this.stateTimer = 3.0;
                    else if (this.level >= 10) this.stateTimer = 4.0;
                    else if (this.level >= 5) this.stateTimer = 4.5;
                    else this.stateTimer = 5.0;
                }
            }

            if (this.state === 'forage') {
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) {
                    let idx = activeFlowers.indexOf(this.targetFlower);
                    if (idx > -1) {
                        activeFlowers.splice(idx, 1);
                        respawnQueue.push({ type: 'flower', time: Date.now() + 10000 });
                    }
                    this.targetFlower = null;
                    this.honeyCarried++;
                    this.foodEaten++; 

                    let reqFlowers = getLevelRequirement('bee', this.level);
                    if (this.level < 20 && this.foodEaten >= reqFlowers) {
                        this.level++;
                        this.foodEaten = 0;
                        saveGameProgress();
                    }
                    this.state = 'wander';
                    this.pickNewWanderTarget();
                }
            }

            if (this.state === 'return_hive') {
                let dx = (region4Hive.x - this.size / 2) - this.x;
                let dy = (region4Hive.y - this.size / 2) - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    this.x += (dx / dist) * this.speed * 1.5 * dt;
                    this.y += (dy / dist) * this.speed * 1.5 * dt;
                } else {
                    let dropCount = this.honeyCarried;
                    if (this.level >= 20 && Math.random() < 0.10) {
                        dropCount *= 2; 
                    }
                    inventory.honey += dropCount;
                    this.honeyCarried = 0;
                    updateUI();
                    saveGameProgress();
                    this.state = 'idle';
                    this.stateTimer = 2.0;
                }
            }
            return;
        }

            // --- BEAR AI SYSTEM MATRIX ---
            if (this.type === 'bear') {
            if (this.level < 2) {
                this.state = 'idle';
                this.stateTimer = 1.0;
                return; // Blocks ALL subsequent processing to guarantee zero movement
            }

            if (this.state === 'fishing_travel') {
                let lakeTargetX = canvas.width / 2 - this.size / 2;
                let lakeTargetY = canvas.height - 100;

            }

            if (this.state === 'fishing_travel') {
                let lakeTargetX = canvas.width / 2 - this.size / 2;
                let lakeTargetY = canvas.height - 100;
                let dx = lakeTargetX - this.x;
                let dy = lakeTargetY - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    this.x += (dx / dist) * (this.speed * 1.2) * dt;
                    this.y += (dy / dist) * (this.speed * 1.2) * dt;
                } else {
                    this.state = 'fishing';
                    this.fishingActionTimer = 20.0;
                }
                return;
            }

            if (this.state === 'fishing') {
                this.fishingActionTimer -= dt;
                if (this.fishingActionTimer <= 0) {
                    let fishCaught = 1;
                    if (this.level >= 20) {
                        fishCaught = 3;
                        if (Math.random() < 0.10) fishCaught *= 2; 
                    } else if (this.level >= 10) {
                        fishCaught = 3;
                    }
                    inventory.fish += fishCaught;
                    updateUI();
                    saveGameProgress();
                    this.setNextFishingCooldown();
                    this.state = 'wander';
                    this.pickNewWanderTarget();
                }
                return;
            }

            this.fishingTimer -= dt;
            if (this.fishingTimer <= 0) {
                this.state = 'fishing_travel';
                return;
            }

            if (this.state === 'idle') {
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) { this.state = 'wander'; this.pickNewWanderTarget(); }
            } else {
                let dx = this.targetX - this.x;
                let dy = this.targetY - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    this.x += (dx / dist) * this.speed * dt;
                    this.y += (dy / dist) * this.speed * dt;
                } else {
                    this.state = 'idle';
                    this.stateTimer = Math.random() * 3 + 1;
                }
            }
            return;
        }

        // --- SPECIAL ACTION PERK MECHANICS MAPPING (DOG & ELEPHANT) ---
        if (this.state === 'digging') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                inventory.coins += 1;
                updateUI();
                saveGameProgress();
                this.state = 'wander';
                this.pickNewWanderTarget();
            }
            return;
        }

                // --- MULTI-STEP ELEPHANT PLAY MECHANIC ENGINE ---
        if (this.type === 'elephant' && (this.state === 'playing_approach' || this.state === 'playing_retreat' || this.state === 'playing_chase')) {
            let dx = player.x - this.x;
            let dy = player.y - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            // Step 1: Calm approach to wait for the user to initiate the game
            if (this.state === 'playing_approach') {
                if (dist > 60) {
                    this.x += (dx / dist) * this.speed * dt;
                    this.y += (dy / dist) * this.speed * dt;
                }
                return;
            }

            // Step 2: Retreat a few spaces backwards away from the user
            if (this.state === 'playing_retreat') {
                let retreatTargetX = player.x - (dx / dist) * 120;
                let retreatTargetY = player.y - (dy / dist) * 120;
                
                let rdx = retreatTargetX - this.x;
                let rdy = retreatTargetY - this.y;
                let rdist = Math.sqrt(rdx * rdx + rdy * rdy);

                if (rdist > 10) {
                    this.x += (rdx / rdist) * (this.speed * 1.5) * dt;
                    this.y += (rdy / rdist) * (this.speed * 1.5) * dt;
                } else {
                    // Backed up enough! Wait for user input movement to launch
                    this.state = 'playing_wait_for_move';
                }
                return;
            }

            // Step 3: Full high-speed tag sprint!
            if (this.state === 'playing_chase') {
                if (dist > 15) {
                    this.x += (dx / dist) * (this.speed * 1.6) * dt;
                    this.y += (dy / dist) * (this.speed * 1.6) * dt;
                } else {
                    // Caught you! Award coins and reset
                    inventory.coins += 5;
                    updateUI();
                    saveGameProgress();
                    this.state = 'wander';
                    this.pickNewWanderTarget();
                }
                return;
            }
        }

        // Added: Wait state that listens for user player input vectors
        if (this.state === 'playing_wait_for_move') {
            if (input.up || input.down || input.left || input.right || joyActive) {
                this.state = 'playing_chase';
            }
            return;
        }

        if (this.level < 2) return;

        if (this.state === 'whistled') {
            let dx = player.x - this.x;
            let dy = player.y - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 60) {
                this.x += (dx / dist) * this.speed * dt;
                this.y += (dy / dist) * this.speed * dt;
            }
            return;
        }

        this.stateTimer -= dt;
        if (this.state === 'idle') {
            if (this.stateTimer <= 0) {
                this.state = 'wander';
                this.pickNewWanderTarget();
                
                // FIXED: Sets the exact matching sub-state string name 'playing_approach'
                if (this.type === 'elephant' && this.level >= 20 && currentRegion === 2 && Math.random() < 0.10) {
                    this.state = 'playing_approach';
                    updateUI();
                }
            }
            return; 
        }

        if (this.state === 'wander' || this.state === 'forage') {
            let targetItem = null;
            let minDist = 250; 

            regionFoods.forEach(f => {
                let d = Math.sqrt((f.x - this.x)**2 + (f.y - this.y)**2);
                if (d < minDist) { minDist = d; targetItem = { item: f, type: 'food', list: regionFoods }; }
            });
            regionWaters.forEach(w => {
                let d = Math.sqrt((w.x - this.x)**2 + (w.y - this.y)**2);
                if (d < minDist) { minDist = d; targetItem = { item: w, type: 'water', list: regionWaters }; }
            });

            if (targetItem) {
                this.state = 'forage';
                this.targetX = targetItem.item.x - this.size / 2;
                this.targetY = targetItem.item.y - this.size / 2;
                
                let dx = this.targetX - this.x;
                let dy = this.targetY - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);

                if (dist < 15) {
                    let idx = targetItem.list.indexOf(targetItem.item);
                    if (idx > -1) {
                        targetItem.list.splice(idx, 1);
                        respawnQueue.push({ type: targetItem.type, time: Date.now() + 10000 });
                        
                        if (this.type === 'dog') {
                            if (this.level >= 20) {
                                if (targetItem.type === 'food') inventory.food += 5;
                                else inventory.water += 5;
                                if (Math.random() < 0.10) {
                                    this.state = 'digging';
                                    this.stateTimer = 3.0;
                                    return;
                                }
                            } else if (this.level >= 10) {
                                if (targetItem.type === 'food') inventory.food += 3;
                                else inventory.water += 3;
                            } else if (this.level >= 5) {
                                if (targetItem.type === 'food') inventory.food += 2;
                                else inventory.water += 2;
                            } else {
                                if (targetItem.type === 'food') inventory.food += 1;
                                else inventory.water += 1;
                            }
                        } else if (this.type === 'elephant') {
                            if (this.level >= 20) {
                                if (targetItem.type === 'food') inventory.food += 6;
                                else inventory.water += 8;
                            } else if (this.level >= 10) {
                                if (targetItem.type === 'food') inventory.food += 3;
                                else inventory.water += 4;
                            } else if (this.level >= 5) {
                                if (targetItem.type === 'food') inventory.food += 2;
                                else inventory.water += 3;
                            } else {
                                if (targetItem.type === 'food') inventory.food += 1;
                                else inventory.water += 2;
                            }
                        } else if (this.type === 'squirrel') {
                            if (this.level >= 20) {
                                if (targetItem.type === 'food') inventory.food += 8;
                                else inventory.water += 1;
                            } else if (this.level >= 10) {
                                if (targetItem.type === 'food') inventory.food += 5;
                                else inventory.water += 1;
                            } else if (this.level >= 5) {
                                if (targetItem.type === 'food') inventory.food += 3;
                                else inventory.water += 1;
                            } else {
                                if (targetItem.type === 'food') inventory.food += 1;
                                else inventory.water += 0;
                            }
                            } else if (this.type === 'chicken') {
                            if (this.level >= 20) {
                                if (targetItem.type === 'food') inventory.food += 4;
                                else inventory.water += 2;
                                
                                if (Math.random() < 0.05) {
                                    let currentRItems = regionalItems[currentRegion];
                                    if (!currentRItems.eggs) currentRItems.eggs = [];
                                    
                                    // Spawns the egg coordinates cleanly right at the chicken's current location
                                    currentRItems.eggs.push({ 
                                        x: this.x + this.size / 2, 
                                        y: this.y + this.size / 2 
                                    });
                                }
                            } else if (this.level >= 10) {
                                if (targetItem.type === 'food') inventory.food += 3;
                                else inventory.water += 1;
                            } else if (this.level >= 5) {
                                if (targetItem.type === 'food') inventory.food += 2;
                                else inventory.water += 1;
                            } else {
                                if (targetItem.type === 'food') inventory.food += 1;
                                else inventory.water += 1;
                            }
                        }

                        updateUI();
                    }
                    this.state = 'idle';
                    this.stateTimer = Math.random() * 2 + 1; 
                    return;
                }
            } else if (this.state === 'forage') {
                this.state = 'wander';
                this.pickNewWanderTarget();
            }

            let dx = this.targetX - this.x;
            let dy = this.targetY - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);

            if (dist > 5) {
                this.x += (dx / dist) * this.speed * dt;
                this.y += (dy / dist) * this.speed * dt;
            } else if (this.state === 'wander') {
                this.state = 'idle';
                this.stateTimer = Math.random() * 3 + 1; 
            }
        }
    }



    draw() {
        if (this.type === 'dog') {
            ctx.fillStyle = '#f1c40f'; 
            ctx.fillRect(this.x + 4, this.y + 10, 26, 16); 
            ctx.fillRect(this.x + 18, this.y + 2, 10, 10); 
            ctx.fillStyle = '#f39c12'; 
            ctx.fillRect(this.x + 16, this.y + 4, 4, 8);  
            ctx.fillStyle = '#000000'; 
            ctx.fillRect(this.x + 25, this.y + 4, 2, 2);   
            ctx.fillRect(this.x + 27, this.y + 6, 2, 2);   
            ctx.fillStyle = '#d35400'; 
            ctx.fillRect(this.x + 6, this.y + 26, 4, 6);   
            ctx.fillRect(this.x + 22, this.y + 26, 4, 6);
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.moveTo(this.x + 4, this.y + 12);
            ctx.quadraticCurveTo(this.x - 6, this.y + 4, this.x - 4, this.y);
            ctx.lineTo(this.x - 1, this.y + 1);
            ctx.quadraticCurveTo(this.x - 3, this.y + 6, this.x + 6, this.y + 14);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'elephant') {
            ctx.fillStyle = '#95a5a6'; 
            ctx.fillRect(this.x + 6, this.y + 8, 24, 18);  
            ctx.fillRect(this.x + 22, this.y + 2, 10, 10);     
            ctx.fillStyle = '#7f8c8d'; 
            ctx.fillRect(this.x + 18, this.y + 4, 6, 10);  
            ctx.fillStyle = '#000000'; 
            ctx.fillRect(this.x + 28, this.y + 4, 2, 2);   
            ctx.fillStyle = '#7f8c8d'; 
            ctx.fillRect(this.x + 8, this.y + 26, 5, 6);   
            ctx.fillRect(this.x + 20, this.y + 26, 5, 6);
            ctx.fillRect(this.x + 5, this.y + 14, 2, 6);
            ctx.fillStyle = '#95a5a6';
            ctx.beginPath();
            ctx.moveTo(this.x + 30, this.y + 10);
            ctx.lineTo(this.x + 35, this.y + 18);
            ctx.lineTo(this.x + 33, this.y + 19);
            ctx.lineTo(this.x + 29, this.y + 12);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'squirrel') {
            ctx.fillStyle = this.color; 
            ctx.fillRect(this.x + 8, this.y + 14, 16, 12);  
            ctx.fillRect(this.x + 14, this.y + 6, 10, 10);  
            ctx.fillRect(this.x + 20, this.y + 2, 2, 4);       
            ctx.fillStyle = '#000000'; 
            ctx.fillRect(this.x + 20, this.y + 8, 2, 2);   
            ctx.fillStyle = this.color === '#d35400' ? '#7f8c8d' : '#3d1d00';
            ctx.fillRect(this.x + 10, this.y + 26, 3, 4);  
            ctx.fillRect(this.x + 18, this.y + 26, 3, 4);
            ctx.fillStyle = this.color;
            ctx.beginPath();
            ctx.moveTo(this.x + 10, this.y + 24);
            ctx.quadraticCurveTo(this.x + 2, this.y + 16, this.x + 4, this.y + 6);
            ctx.quadraticCurveTo(this.x + 10, this.y + 8, this.x + 12, this.y + 18);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'chicken') {
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x + 18, this.y + 20, 12, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#c0392b';
            ctx.fillRect(this.x + 16, this.y + 4, 5, 4);
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(this.x + 20, this.y + 10, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f39c12';
            ctx.beginPath();
            ctx.moveTo(this.x + 26, this.y + 8);
            ctx.lineTo(this.x + 32, this.y + 11);
            ctx.lineTo(this.x + 26, this.y + 14);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.fillRect(this.x + 22, this.y + 8, 2, 2);
            ctx.fillStyle = '#f39c12';
            ctx.fillRect(this.x + 12, this.y + 30, 3, 6);
            ctx.fillRect(this.x + 20, this.y + 30, 3, 6);
        } else if (this.type === 'bee') {
            ctx.fillStyle = '#f1c40f';
            ctx.beginPath();
            ctx.ellipse(this.x + 18, this.y + 18, 12, 8, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.strokeStyle = '#2c3e50';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(this.x + 14, this.y + 10); ctx.lineTo(this.x + 14, this.y + 26);
            ctx.moveTo(this.x + 22, this.y + 10); ctx.lineTo(this.x + 22, this.y + 26);
            ctx.stroke();
            ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.beginPath();
            ctx.ellipse(this.x + 14, this.y + 8, 4, 6, -Math.PI / 4, 0, Math.PI * 2);
            ctx.ellipse(this.x + 22, this.y + 8, 4, 6, Math.PI / 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';
            ctx.fillRect(this.x + 26, this.y + 15, 2, 2);
        } else if (this.type === 'bear' || (typeof pet !== 'undefined' && pet.type === 'bear')) {
            let bx = this.type === 'bear' ? this.x : ox;
            let by = this.type === 'bear' ? this.y : oy;
            ctx.fillStyle = '#5a2a00'; 
            ctx.fillRect(bx + 4, by + 8, 28, 20); 
            ctx.fillRect(bx + 10, by, 16, 12); 
            ctx.fillRect(bx + 8, by - 4, 6, 6); 
            ctx.fillRect(bx + 22, by - 4, 6, 6); 
            ctx.fillStyle = '#000000';
            ctx.fillRect(bx + 14, by + 4, 2, 2); 
            ctx.fillRect(bx + 20, by + 4, 2, 2); 
            ctx.fillStyle = '#3a1a00';
            ctx.fillRect(bx + 6, by + 28, 6, 6); 
            ctx.fillRect(bx + 24, by + 28, 6, 6);
        }

        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        
        let text = `${this.label} Lv.${this.level}`;
        if (this.level >= 20) {
            text += ' [MAX]';
        }
        
        if (this.state === 'whistled') {
            text += ' [WHISTLED]';
        } else if (this.level > 1 || this.type === 'bee' || this.type === 'bear') {
            // FIXED: Checks if Elephant is in any of its custom chase sub-states, keeping tag as [PLAYING]
            if (this.state.startsWith('playing') || this.state === 'playing_wait_for_move') {
                text += ' [PLAYING]';
            } else {
                text += ` [${this.state.toUpperCase()}]`;
            }
        }
        
        ctx.fillText(text, this.x + (this.size / 2), this.y - 16);

            if (this.level < 20) {
                let progressRatio = 0;
                if (this.type === 'bee' || this.type === 'bear') {
                    let totalReq = getLevelRequirement(this.type, this.level);
                    progressRatio = this.foodEaten / totalReq;
            } else {
                // FIXED: Uses our new math engine function instead of looking for the deleted data array
                let req = getLevelRequirement(this.type, this.level);
                let totalNeeded = req.food + req.water;
                let totalEaten = this.foodEaten + this.waterEaten;
                progressRatio = totalNeeded > 0 ? (totalEaten / totalNeeded) : 0;
            }

            let barWidth = this.size + 8;
            let barHeight = 4;
            let barX = this.x + (this.size / 2) - (barWidth / 2);
            let barY = this.y - 10;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            ctx.fillRect(barX, barY, barWidth, barHeight);

            let grad = ctx.createLinearGradient(barX, 0, barX + barWidth, 0);
            grad.addColorStop(0, '#e67e22');
            grad.addColorStop(1, '#f1c40f');
            ctx.fillStyle = grad;
            ctx.fillRect(barX, barY, barWidth * Math.min(1, Math.max(0, progressRatio)), barHeight);

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.lineWidth = 1;
            ctx.strokeRect(barX, barY, barWidth, barHeight);
        }
    }
}
const player = new Player(100, 100);
const respawnQueue = [];

const regionalItems = {
    1: { foods: [], waters: [], flowers: [] },
    2: { foods: [], waters: [], flowers: [] },
    3: { foods: [], waters: [], flowers: [] },
    4: { foods: [], waters: [], flowers: [] },
    5: { foods: [], waters: [], flowers: [] }
};

let foods = regionalItems[currentRegion].foods;
let waters = regionalItems[currentRegion].waters;
let flowers = regionalItems[currentRegion].flowers;

const region4Hive = { x: 225, y: 75 };

const petsByRegion = {
    1: [new Pet('dog', 'Retriever', '#f1c40f')],
    2: [new Pet('elephant', 'Elephant', '#95a5a6')],
    3: [
        new Pet('squirrel', 'Squirrel', '#d35400'),
        (() => {
            let p = new Pet('chicken', 'Chicken', '#ffffff');
            p.x = 260;
            p.y = 200;
            return p;
        })()
    ],
    4: [
        (() => {
            let p = new Pet('bee', 'Bee', '#f1c40f');
            p.x = 200;
            p.y = 150;
            p.speed = 100;
            p.level = 1;
            p.state = 'wander';
            p.honeyCarried = 0;
            p.pickNewWanderTarget();
            return p;
        })()
    ],
    5: [
        (() => {
            let p = new Pet('bear', 'Bear', '#5a2a00');
            p.x = 200;
            p.y = 250;
            p.speed = 70;
            p.level = 1;
            p.state = 'wander';
            p.fishingTimer = 0;
            p.fishingActionTimer = 0;
            p.setNextFishingCooldown = function() {
                if (this.level >= 5) this.fishingTimer = Math.random() * 30 + 50;
                else if (this.level >= 3) this.fishingTimer = Math.random() * 25 + 60;
                else this.fishingTimer = Math.random() * 20 + 70;
            };
            p.setNextFishingCooldown();
            p.pickNewWanderTarget();
            return p;
        })()
    ]
};

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
        // FIXED: Correctly targets the active region's egg structure
        let currentRItems = regionalItems[currentRegion];
        if (currentRegion === 3 && currentRItems && currentRItems.eggs) {
            for (let i = currentRItems.eggs.length - 1; i >= 0; i--) {
                let egg = currentRItems.eggs[i];
                if (player.x < egg.x + 12 && player.x + player.size > egg.x - 12 &&
                    player.y < egg.y + 12 && player.y + player.size > egg.y - 12) {
                    currentRItems.eggs.splice(i, 1);
                    inventory.eggs += 1;
                    updateUI();
                    saveGameProgress();
                }
            }
        }

    if (currentRegion === 4) {
        for (let i = flowers.length - 1; i >= 0; i--) {
            let fl = flowers[i];
            if (player.x < fl.x + 15 && player.x + player.size > fl.x - 15 &&
                player.y < fl.y + 15 && player.y + player.size > fl.y - 15) {
            }
        }
        return;
    }

    for (let i = foods.length - 1; i >= 0; i--) {
        let f = foods[i];
        if (player.x < f.x + 10 && player.x + player.size > f.x - 10 &&
            player.y < f.y + 10 && player.y + player.size > f.y - 10) {
            foods.splice(i, 1);
            inventory.food++;
            updateUI();
            respawnQueue.push({ type: 'food', time: Date.now() + 10000 });
        }
    }

    for (let i = waters.length - 1; i >= 0; i--) {
        let w = waters[i];
        if (player.x < w.x + 10 && player.x + player.size > w.x - 10 &&
            player.y < w.y + 10 && player.y + player.size > w.y - 10) {
            waters.splice(i, 1);
            inventory.water++;
            updateUI();
            respawnQueue.push({ type: 'water', time: Date.now() + 10000 });
        }
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
                for (let r = 1; r <= 3; r++) {
                    let rItems = regionalItems[r];
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
        for (let r = 1; r <= 5; r++) {
            if (r === 4) {
                if (regionalItems[r].flowers.length < 5) regionalItems[r].flowers.push(new Flower());
            } else if (r <= 3) {
                if (regionalItems[r].foods.length < 5) regionalItems[r].foods.push(new Item('food'));
                if (regionalItems[r].waters.length < 5) regionalItems[r].waters.push(new Item('water'));
            }
        }
        spawnTimer = 0;
    }
}

const joyContainer = document.getElementById('joystickContainer');
const joyHandle = document.getElementById('joystickHandle');

let joyActive = false;
let joyOriginX = 0;
let joyOriginY = 0;

if (joyContainer) {
    joyContainer.addEventListener('touchstart', (e) => {
        e.preventDefault();
        joyActive = true;
        const touch = e.touches[0]; // Restored single touch indexing
        const rect = joyContainer.getBoundingClientRect();
        joyOriginX = rect.left + rect.width / 2;
        joyOriginY = rect.top + rect.height / 2;
        handleJoystickMove(touch.clientX, touch.clientY);
    }, { passive: false });

    joyContainer.addEventListener('touchmove', (e) => {
        e.preventDefault();
        if (!joyActive) return;
        const touch = e.touches[0]; // Restored single touch indexing
        handleJoystickMove(touch.clientX, touch.clientY);
    }, { passive: false });
}

window.addEventListener('touchend', () => {
    if (!joyActive) return;
    joyActive = false;
    input.up = false;
    input.down = false;
    input.left = false;
    input.right = false;
    if (joyHandle) joyHandle.style.transform = 'translate(0px, 0px)';
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
const handleInteract = (e) => {
    if(e) e.preventDefault();
    let activePets = petsByRegion[currentRegion];
    if (Array.isArray(activePets)) {
        activePets.forEach(pet => {
            let dx = (pet.x + pet.size/2) - (player.x + player.size/2);
            let dy = (pet.y + pet.size/2) - (player.y + player.size/2);
            let dist = Math.sqrt(dx*dx + dy*dy);
            if (dist < 80) {
                pet.giveResources();
            }
        });
    }
};

const interactBtnElement = document.getElementById('interactBtn');

if (interactBtnElement) {
    interactBtnElement.addEventListener('pointerdown', (e) => {
        e.preventDefault();
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
        activePets.forEach(pet => {
            if (pet.type === 'bee' || pet.type === 'bear') return;
            if (pet.level < 2) return;
            if (pet.state !== 'whistled') {
                pet.state = 'whistled';
                whistleBtn.textContent = 'RETURN';
            } else {
                pet.state = 'wander';
                pet.pickNewWanderTarget();
                whistleBtn.textContent = 'WHISTLE';
            }
        });
    });
}

// Paste this directly below your if (whistleBtn) { ... } listener block
if (regionSelector) {
    regionSelector.addEventListener('change', (e) => {
        let selectedRegion = parseInt(e.target.value);
        
        if (selectedRegion >= 4) {
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
        // FIXED: Play button press now triggers Step 2 (The Retreat) instead of paying out early
        if (pet.type === 'elephant' && pet.state === 'playing_approach') {
            pet.state = 'playing_retreat';
            updateUI();
            return;
        }
        
        // FIXED: Play button press now triggers Step 2 (The Retreat) instead of paying out early
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
                    } else if (pet.waterEaten < currentReq.water && inventory.water > 0) {
                        inventory.water--;
                        pet.waterEaten++;
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

function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    let elapsed = timestamp - lastTime;

    if (elapsed >= frameInterval) {
        let dt = elapsed / 1000;
        if (dt > 0.1) dt = 0.1; 
        lastTime = timestamp - (elapsed % frameInterval);

        ctx.clearRect(0, 0, canvas.width, canvas.height);

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
        }

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 4;
        ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

        processSpawns(dt);
        player.update(dt);
        checkCollisions();

        if (currentRegion === 4) {
            flowers.forEach(fl => fl.draw());
        } else {
            foods.forEach(f => f.draw());
            waters.forEach(w => w.draw());
            
            // FIXED: Renders the white elliptical eggs inside Region 3 pulling from correct pathing references
            let currentRItems = regionalItems[currentRegion];
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

        let regions1to3Tamed = true;
        for (let checkR = 1; checkR <= 3; checkR++) {
            if (Array.isArray(petsByRegion[checkR])) {
                petsByRegion[checkR].forEach(pet => {
                    if (pet.level < 2) regions1to3Tamed = false;
                });
            }
        }

        for (let r = 1; r <= 5; r++) {
            if (r >= 4 && !regions1to3Tamed) continue;

            let activePets = petsByRegion[r];
            if (Array.isArray(activePets)) {
                activePets.forEach(pet => {
                    pet.update(dt, regionalItems[r].foods, regionalItems[r].waters, regionalItems[r].flowers);
                    if (r === currentRegion) {
                        pet.draw();
                    }
                });
            }
        }

        player.draw();
    }
    requestAnimationFrame(gameLoop);
}
function renderMiniPet(pet, elementId) {
    const miniCanvas = document.getElementById(elementId);
    if (!miniCanvas) return;
    const mctx = miniCanvas.getContext('2d');
    miniCanvas.width = 70;
    miniCanvas.height = 70;
    mctx.clearRect(0, 0, 70, 70);
    
    if (pet.type !== 'bee' && pet.level < 2) {
        mctx.fillStyle = '#111';
        mctx.fillRect(0, 0, 70, 70);
        mctx.fillStyle = 'rgba(255,255,255,0.15)';
        mctx.font = '20px monospace';
        mctx.textAlign = 'center';
        mctx.textBaseline = 'middle';
        mctx.fillText('❓', 35, 35);
    } else {
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
        }
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
    renderMiniPet(bee, 'viewBee');
    renderMiniPet(bear, 'viewBear');

        let dogReq = getLevelRequirement('dog', dog.level);
    document.getElementById('infoDog').innerHTML = `
        <strong>${dog.level >= 2 ? dog.label : '???'}</strong><br>
        Status: <span class="${dog.level >= 2 ? 'codexTamed' : 'codexWild'}">${dog.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${dog.level}/20<br>
        Next Req: ${dog.level < 20 ? '🍪' + dogReq.food + ' 💧' + dogReq.water : 'MAX'}
    `;

    let elReq = getLevelRequirement('elephant', elephant.level);
    document.getElementById('infoElephant').innerHTML = `
        <strong>${elephant.level >= 2 ? elephant.label : '???'}</strong><br>
        Status: <span class="${elephant.level >= 2 ? 'codexTamed' : 'codexWild'}">${elephant.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${elephant.level}/20<br>
        Next Req: ${elephant.level < 20 ? '🍪' + elReq.food + ' 💧' + elReq.water : 'MAX'}
    `;

    let sqReq = getLevelRequirement('squirrel', squirrel.level);
    document.getElementById('infoSquirrel').innerHTML = `
        <strong>${squirrel.level >= 2 ? squirrel.label : '???'}</strong><br>
        Status: <span class="${squirrel.level >= 2 ? 'codexTamed' : 'codexWild'}">${squirrel.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${squirrel.level}/20<br>
        Next Req: ${squirrel.level < 20 ? '🍪' + sqReq.food + ' 💧' + sqReq.water : 'MAX'}
    `;

    let chReq = getLevelRequirement('chicken', chicken.level);
    document.getElementById('infoChicken').innerHTML = `
        <strong>${chicken.level >= 2 ? chicken.label : '???'}</strong><br>
        Status: <span class="${chicken.level >= 2 ? 'codexTamed' : 'codexWild'}">${chicken.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${chicken.level}/20<br>
        Next Req: ${chicken.level < 20 ? '🍪' + chReq.food + ' 💧' + chReq.water : 'MAX'}
    `;

    let beeReq = getLevelRequirement('bee', bee.level);
    document.getElementById('infoBee').innerHTML = `
        <strong>${bee.label}</strong><br>
        Status: <span class="codexTamed">AUTONOMOUS</span><br>
        Level: ${bee.level}/20<br>
        Next Req: ${bee.level < 20 ? '🌸 ' + beeReq + ' Flowers' : 'MAX'}
    `;

    let bearReq = getLevelRequirement('bear', bear.level);
    document.getElementById('infoBear').innerHTML = `
        <strong>${bear.level >= 2 ? bear.label : '???'}</strong><br>
        Status: <span class="${bear.level >= 2 ? 'codexTamed' : 'codexWild'}">${bear.level >= 2 ? 'TAMED' : 'WILD'}</span><br>
        Level: ${bear.level}/20<br>
        Next Req: ${bear.level < 20 ? '🍯 ' + bearReq + ' Honey' : 'MAX'}
    `;

    document.getElementById('renameBoxBear').style.display = bear.level >= 2 ? 'block' : 'none';
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
        if (confirm("⚠️ WARNING: Are you absolutely sure you want to delete all saved progress? This will reset your game data!")) {
            localStorage.removeItem('just_a_little_leisure_save');
            inventory.food = 0;
            inventory.water = 0;
            inventory.honey = 0;
            inventory.fish = 0;
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

loadGameProgress();
updateUI();         

setInterval(saveGameProgress, 10000);

for (let r = 1; r <= 3; r++) {
    for (let i = 0; i < 3; i++) {
        regionalItems[r].foods.push(new Item('food'));
        regionalItems[r].waters.push(new Item('water'));
    }
}

if (document.getElementById('joystickContainer')) document.getElementById('joystickContainer').style.display = 'flex';
if (document.getElementById('interactBtn')) document.getElementById('interactBtn').style.display = 'flex';

requestAnimationFrame(gameLoop);
