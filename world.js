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
                let manualFoodMultiplier = 1 + (character.level * 0.01);
                inventory.food += Math.round(foodBaseGain * manualFoodMultiplier);
                
                gainPlayerXP(1); 
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
                let manualWaterMultiplier = 1 + (character.level * 0.01);
                inventory.water += Math.round(waterBaseGain * manualWaterMultiplier);
                
                gainPlayerXP(1); 
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

