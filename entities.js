// ============================================================
// entities.js — Player, Item, Flower, and Pet classes.
// Depends on: state.js (canvas, ctx, inventory, character,
// getLevelRequirement, saveGameProgress). Load AFTER state.js.
// ============================================================

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
            ctx.moveTo(this.x, this.y - 10);
            ctx.quadraticCurveTo(this.x + 7, this.y + 2, this.x + 7, this.y + 5);
            ctx.arc(this.x, this.y + 5, 7, 0, Math.PI, false);
            ctx.quadraticCurveTo(this.x - 7, this.y + 2, this.x, this.y - 10);
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
        this.digParticles = [];
        this.splashParticles = [];

        // Bee-only fields. Defaulted here (not just on the hand-built starter bee) so
        // ANY bee — including ones bought from the hive — behaves correctly: without
        // this, honeyCarried was undefined on purchased bees, so `honeyCarried >= maxCapacity`
        // was never true, they never capped out or returned to the hive to drop off honey.
        this.honeyCarried = 0;
        this.targetFlower = null;

        // Bear-only fields, defaulted for the same reason.
        this.fishingTimer = 0;
        this.fishingActionTimer = 0;
    }

    pickNewWanderTarget() {
        let padding = 40;
        this.targetX = Math.random() * (canvas.width - this.size - padding * 2) + padding;
        this.targetY = Math.random() * (canvas.height - this.size - padding * 2) + padding;
    }

    // Was previously attached as a one-off function property on the single hand-built
    // bear in world.js (`p.setNextFishingCooldown = function() {...}`), which meant any
    // other bear created another way (e.g. a future "buy a bear" feature, or save/load
    // reconstruction) wouldn't have this method at all. Now a real class method.
    setNextFishingCooldown() {
        if (this.level >= 5) this.fishingTimer = Math.random() * 30 + 50;
        else if (this.level >= 3) this.fishingTimer = Math.random() * 25 + 60;
        else this.fishingTimer = Math.random() * 20 + 70;
    }

    update(dt, regionFoods, regionWaters, activeFlowers = []) {

        let petFoodWaterBonus = 1.0;
        if (character.level >= 15) petFoodWaterBonus = 1.30; // +30% (Lv 5) + +30% (Lv 15) = 60%
        else if (character.level >= 5) petFoodWaterBonus = 1.30;

        let petHoneyBonus = (character.level >= 10) ? 1.25 : 1.0;
        let petFishBonus = (character.level >= 20) ? 1.25 : 1.0;
        let coinBonus = (character.level >= 25) ? 1.25 : 1.0;

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

            // Whistled: walk to the player and pause the fishing cycle until called back.
            // Placed before the fishingTimer countdown below so being whistled can't get
            // interrupted by the bear wandering off to fish mid-recall.
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
                
                // Continuous Splash Generation Loop: Fires while the bear is actively fishing
                if (this.fishingActionTimer > 0) {
                    // 10% chance per frame to generate a wide water ripple ring
                    if (Math.random() < 0.10) {
                        this.splashParticles.push({
                            type: 'ripple',
                            x: this.x + this.size / 2,
                            y: this.y + this.size - 4,
                            radius: 2,
                            maxRadius: Math.random() * 25 + 15,
                            growthRate: Math.random() * 20 + 15,
                            opacity: 1.0
                        });
                    }

                    // 15% chance per frame to generate vertical popping water droplets
                    if (Math.random() < 0.15) {
                        this.splashParticles.push({
                            type: 'droplet',
                            x: this.x + this.size / 2 + (Math.random() * 16 - 8),
                            y: this.y + this.size - 4,
                            vx: (Math.random() - 0.5) * 30,
                            vy: -(Math.random() * 40 + 30),
                            gravity: 100,
                            life: Math.random() * 0.4 + 0.3,
                            size: Math.random() * 3 + 2
                        });
                    }
                }

                // Update and animate active water splash particles
                if (this.splashParticles) {
                    for (let i = this.splashParticles.length - 1; i >= 0; i--) {
                        let p = this.splashParticles[i];
                        
                        if (p.type === 'ripple') {
                            p.radius += p.growthRate * dt;
                            p.opacity = 1.0 - (p.radius / p.maxRadius);
                            if (p.radius >= p.maxRadius || p.opacity <= 0) {
                                this.splashParticles.splice(i, 1);
                            }
                        } else if (p.type === 'droplet') {
                            p.life -= dt;
                            p.vy += p.gravity * dt;
                            p.x += p.vx * dt;
                            p.y += p.vy * dt;
                            if (p.life <= 0) {
                                this.splashParticles.splice(i, 1);
                            }
                        }
                    }
                }

                if (this.fishingActionTimer <= 0 && (!this.splashParticles || this.splashParticles.length === 0)) {
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

                // --- UPGRADED LEVEL 20 DOG VISUAL DIGGING SYSTEM ---
        if (this.state === 'digging') {
            this.stateTimer -= dt;

            // Continuous Dirt Burst Generation: Injects little dirt fragments while timer ticks down
            if (this.stateTimer > 0) {
                // Generate 2 new dirt particles per frame for a rich visual burst cluster effect
                for (let i = 0; i < 2; i++) {
                    this.digParticles.push({
                        x: this.x + this.size / 2,
                        y: this.y + this.size - 4,
                        // Throws dirt backward along a random horizontal/vertical arc trajectory vector
                        vx: (Math.random() - 0.8) * 60, 
                        vy: -(Math.random() * 50 + 20),
                        gravity: 120,
                        life: Math.random() * 0.4 + 0.2, // Particle lifespan in seconds
                        size: Math.random() * 3 + 2      // Randomized dust fragment dimensions
                    });
                }
            }

            // Update existing dirt particles
            for (let i = this.digParticles.length - 1; i >= 0; i--) {
                let p = this.digParticles[i];
                p.life -= dt;
                p.vy += p.gravity * dt; // Apply environmental physics downward pulling weight gravity
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                
                // Splice dead debris structures out of the tracking list to keep memory footprint flat
                if (p.life <= 0) {
                    this.digParticles.splice(i, 1);
                }
            }

            if (this.stateTimer <= 0 && this.digParticles.length === 0) {
                // Award the coin exactly once, after the timer AND the particle animation both finish
                inventory.coins += Math.round(1 * coinBonus); 
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
                            let y = getForageYield('dog', this.level);
                            if (targetItem.type === 'food') inventory.food += Math.round(y.food * petFoodWaterBonus);
                            else inventory.water += Math.round(y.water * petFoodWaterBonus);

                            if (this.level >= 20 && Math.random() < 0.10) {
                                this.state = 'digging';
                                this.stateTimer = 3.0;
                                return;
                            }
                        } else if (this.type === 'elephant') {
                            let y = getForageYield('elephant', this.level);
                            if (targetItem.type === 'food') inventory.food += Math.round(y.food * petFoodWaterBonus);
                            else inventory.water += Math.round(y.water * petFoodWaterBonus);
                        } else if (this.type === 'squirrel') {
                            let y = getForageYield('squirrel', this.level);
                            if (targetItem.type === 'food') inventory.food += Math.round(y.food * petFoodWaterBonus);
                            else inventory.water += Math.round(y.water * petFoodWaterBonus);
                            } else if (this.type === 'chicken') {
                            let y = getForageYield('chicken', this.level);
                            if (targetItem.type === 'food') inventory.food += Math.round(y.food * petFoodWaterBonus);
                            else inventory.water += Math.round(y.water * petFoodWaterBonus);

                            if (this.level >= 20 && Math.random() < 0.05) {
                                let currentRItems = regionalItems[currentRegion];
                                if (!currentRItems.eggs) currentRItems.eggs = [];
                                
                                // Spawns the egg coordinates cleanly right at the chicken's current location
                                currentRItems.eggs.push({ 
                                    x: this.x + this.size / 2, 
                                    y: this.y + this.size / 2 
                                });
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

        if (this.digParticles && this.digParticles.length > 0) {
            this.digParticles.forEach(p => {
                ctx.fillStyle = (p.life > 0.3) ? '#5c3d12' : '#8c6239';
                ctx.fillRect(p.x, p.y, p.size, p.size);
            });
        }

        // NEW: Visual Lakeside Water Splash Renderer Sweep Layer
        if (this.splashParticles && this.splashParticles.length > 0) {
            this.splashParticles.forEach(p => {
                if (p.type === 'ripple') {
                    ctx.strokeStyle = `rgba(255, 255, 255, ${p.opacity})`;
                    ctx.lineWidth = 2;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
                    ctx.stroke();
                } else if (p.type === 'droplet') {
                    // Light frothy cyan water droplet clods
                    ctx.fillStyle = '#7ed6df';
                    ctx.fillRect(p.x, p.y, p.size, p.size);
                }
            });
        }
    }
}
