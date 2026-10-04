// ============================================================
// tutorial.js — New-player tutorial, contextual tips, and the HELP screen.
// Every tip is a "group" of one or more pages in TUTORIAL_TIPS. showTutorial(id) pops the group up
// as a series of boxes the player closes with OK (once per group, ever — remembered in the save as
// `tutorialSeen`). The HELP screen (MENU -> ❓ HELP) lists every group already seen, page by page,
// with ◀ ▶ arrows. Depends on: state.js, world.js, ui.js. Load AFTER ui.js, BEFORE main.js.
// ============================================================

// Pages may be strings or functions returning strings (so numbers are read from the game's constants
// and can't drift from the real rules). \n becomes a line break.
const TUTORIAL_TIPS = [
    { id: 'intro', icon: '🌟', title: 'Welcome!', pages: [
        "Welcome to Just a Little Leisure! 🐾\n\nThe idea is simple: pick up 🍪 food and 💧 water lying around the map and feed it to your pets. Fed pets level up, and grown-up pets start working for you — gathering resources, earning coins and opening up new corners of the world.",
        "🕹️ How to play\n\n• Touch and drag anywhere on the field to move — a joystick appears under your finger.\n• Walk over 🍪 and 💧 to pick them up.\n• Stand next to a pet and HOLD the GIVE button to feed it (the longer you hold, the faster it goes).\n• Tap WHISTLE to call your tamed pets over to you.",
        "🐶 Taming and levelling up\n\nNew pets start out wild (Lv.1) and stay put. Feed one until it reaches Lv.2 and it is tamed: it wanders around and gathers food and water for you on its own. Keep feeding to level it up — higher levels gather more and unlock special perks. Feeding pets also earns YOU experience.",
        "🔓 Unlocking more pets and regions\n\nOpen ☰ MENU → 🛒 SHOP → Unlockables. Regions 1–3 are free; Regions 4–10 and extra pets (Cat, Bird, the 'Bow' pets…) are bought with 🪙 coins. Earn coins from your pets' special perks, from mini-games, and by selling eggs, fish (and spare gold for 💎) in the Shop's Sell tab. Use the 🗺️ dropdown at the top right to travel to regions you own.",
        "🍖 Feeder boxes\n\nFully grown pets (Lv.30) get hungry and stop moving if they run out of food. Every region except Regions 4 and 10 has a wooden feeder box: stand next to it, tap Deposit Food to fill it, and hungry pets will walk over and eat from it by themselves. You'll get a full guide when your first pet is fully grown.",
        "📚 More to explore\n\n☰ MENU holds your 🎒 Bag, 🧑 Tamers, 🌳 Perk Tree, 📋 Tasks (they unlock once you own Regions 1–9), 🏆 Achievements and 📊 Statistics. Every tip you see is saved in ❓ HELP, so you can read it again any time. The game saves automatically — have fun!"
    ] },
    { id: 'perks', icon: '🌳', title: 'Perk points', pages: [
        "You earned a perk point! ✨\n\nEvery time YOU level up you get a perk point. Spend them in ☰ MENU → 🌳 PERK TREE to unlock permanent bonuses — like more food and water from your pets, or extra coins."
    ] },
    { id: 'feeder', icon: '🍖', title: 'Hunger and feeder boxes', pages: [
        () => `Your pet is fully grown! 🎉\n\nPets at max level (Lv.${MAX_PET_LEVEL}) get a hunger bar over their head. It drops by 1 every ${HUNGER_SECONDS_PER_POINT} seconds, and when it reaches 0 the pet stops dead and does nothing until it is fed again. (Bees never get hungry.)`,
        () => `How to keep them fed\n\n• HOLD GIVE next to a pet: ${HUNGER_FOOD_PER_POINT} food refills 1 point, so ${HUNGER_MAX * HUNGER_FOOD_PER_POINT} food fills a whole bar.\n• Or fill a feeder box: stand next to the wooden box and tap Deposit Food (it holds ${FEEDER_CAPACITY}). Pets at ${HUNGER_SEEK_BELOW} hunger or less walk over and eat from it on their own — so you can leave them.\n• A pet at 0 can't walk, so feed it by hand with GIVE.\nEvery region has its own feeder, except Regions 4 and 10.`
    ] },
    { id: 'mini_elephant', icon: '🐘', title: 'Mini-game: Elephant tag', pages: [
        "The elephant wants to play tag! 🐘\n\nWhen it walks up to you, the GIVE button changes to PLAY.\n1. Tap PLAY — the elephant backs away a few steps.\n2. Start moving with the joystick — it chases you!\n3. If it catches you, you win 5 🪙 coins.\nThe game ends after 60 seconds or if you leave Region 2."
    ] },
    { id: 'mini_cat', icon: '🐱', title: 'Mini-game: Dead or Alive', pages: [
        "Your cat froze and is flickering! 📦\n\nIt has climbed into Schrödinger's box. Walk up close to it (the button changes to PLAY), tap PLAY and guess: Dead or Alive? A right guess wins 10 🪙 coins. It only happens while you are in Region 1."
    ] },
    { id: 'mini_panda', icon: '🎍', title: 'Mini-game: Bamboo Fever', pages: [
        "The panda wants bamboo! 🎍\n\nPick Play to start a 30-second round in Region 7: run around collecting the bamboo stalks (new ones keep appearing). Every 5 stalks earns 1 🪙 coin, and the panda naps afterwards. Pick Starve to skip the round — the panda just wanders off for a while."
    ] },
    { id: 'region_4', icon: '🐝', title: 'Region 4 — Beehive', pages: [
        () => `You unlocked the Hive and your first Bee! 🐝\n\nBees collect honey from flowers and carry it back to the hive. Stand near the hive and tap GIVE to collect the 🍯 honey stored there. Tap Buy Bee for more bees (${BEE_COST}🪙 each, up to ${HIVE_MAX_BEES}). Honey feeds the bears in Region 5 and the sugar gliders.`
    ] },
    { id: 'region_5', icon: '🐻', title: 'Region 5 — Bear Lake', pages: [
        "Meet the bears! 🐻\n\nBears eat 🍯 honey (from your bees) instead of food and water. From Lv.5 they go fishing in the lake on their own and bring back 🐟 fish — sell fish in the Shop's Sell tab for coins."
    ] },
    { id: 'region_6', icon: '🐷', title: 'Region 6 — Pig Sty', pages: [
        "Meet the pigs! 🐷\n\nPigs gather food and water like your first pets. At higher levels they sometimes roll around in the mud patch in the middle of the sty — and pay you coins for it."
    ] },
    { id: 'region_7', icon: '🐼', title: 'Region 7 — Panda Habitat', pages: [
        "Meet the panda! 🐼\n\nThe panda gathers food and water like your other pets. At Lv.20 it can ask you to play Bamboo Fever, a bamboo-collecting mini-game — you'll get a short guide when it happens."
    ] },
    { id: 'region_8', icon: '🐵', title: 'Region 8 — Monkey Jungle', pages: [
        "Meet the monkeys! 🐵\n\nMonkeys eat 🍌 bananas, which grow in this jungle — walk over them to pick them up, then feed the monkeys. Bananas are also a favourite treat of sugar gliders."
    ] },
    { id: 'region_9', icon: '🛏️', title: 'Region 9 — Sugar Gliders', pages: [
        "Welcome to the Bedroom! 🛏️\n\nThis is home to the Sugar Gliders. They're tame from the start: stand next to one and the main button becomes TAKE — tap it to pick the glider up and carry it around, and tap DROP to set it down in whichever region you're standing in. (A small blue GIVE button appears so you can still feed it.)",
        () => `What gliders do\n\n• Feed them treats (🍯 honey or 🍌 bananas) plus 💧 water to level them up.\n• Dropped in Regions 1, 2, 3, 6 or 7 they gather food and water for you.\n• Dropped in Region 4 they give +${Math.round(GLIDER_BUFF_PER_GLIDER[4] * 100)}% honey, in Region 5 +${Math.round(GLIDER_BUFF_PER_GLIDER[5] * 100)}% bear fishing speed, in Region 8 +${Math.round(GLIDER_BUFF_PER_GLIDER[8] * 100)}% monkey yield.\n• Every glider has stamina ⚡. Working drains it; at 0 it stops. Bring it home to Region 9 and it rests in a tree to recharge.\n• Gliders can't be dropped in Region 10.`
    ] },
    { id: 'region_10', icon: '🌸', title: 'Region 10 — Flower Garden', pages: [
        () => `Welcome to the Flower Garden! 🌸\n\nGrow hydrangeas on up to 12 plots. Every fully grown flower that is currently watered gives +${Math.round(GARDEN_BOOST * 100)}% coins from everything you earn AND makes your bees ${Math.round(GARDEN_BOOST * 100)}% faster — and the bonus stacks with every flower!`,
        () => `🌱 Getting started\n\n1. Buy 🪴 Soil (3 uses per bag) and 🌱 Flower Seeds in ☰ MENU → 🛒 SHOP → Buy.\n2. Walk onto a plot — one is free. Tap Fertilize: it uses 1 soil and 1 seed.\n3. Tap Water. Watering costs 💧 water from your supplies at the top of the screen.\n4. More plots cost 🪙 coins (${GARDEN_PLOT_PRICE_STEP}, ${GARDEN_PLOT_PRICE_STEP * 2}, ${GARDEN_PLOT_PRICE_STEP * 3}…) — walk onto a locked plot and tap Buy Plot.`,
        () => `⏱️ Growing\n\n• Seed: needs ${GARDEN_STAGE_WATER[1]} 💧 → becomes a shoot after ${GARDEN_STAGE_SECONDS[1] / 60} min.\n• Shoot: needs ${GARDEN_STAGE_WATER[2]} 💧 → blossoms after ${GARDEN_STAGE_SECONDS[2] / 60} min.\n• Hydrangea: needs ${GARDEN_STAGE_WATER[3]} 💧 → stays watered for ${GARDEN_STAGE_SECONDS[3] / 60} min, then ${GARDEN_REWATER_COST} 💧 every ${GARDEN_STAGE_SECONDS[3] / 60} min.\nA pop-up tells you when flowers need water.`,
        () => `⚠️ Don't let it dry out\n\nOnce a hydrangea has bloomed and been watered, you have ${GARDEN_GRACE_SECONDS} seconds after it dries out to water it again — otherwise it withers and the plot goes back to hard clay. The bar under each plot shows the time left (blue) or the time before it withers (red). Timers only run while the game is open, so stock up on 💧 water before you visit!`
    ] }
];

function getTutorialTip(id) {
    for (let i = 0; i < TUTORIAL_TIPS.length; i++) if (TUTORIAL_TIPS[i].id === id) return TUTORIAL_TIPS[i];
    return null;
}
function tutorialPageText(p) { return (typeof p === 'function') ? p() : p; }

// Saves from before the tutorial existed: skip the new-player welcome and keep the guides for regions
// already owned (called from loadGameProgress). Anything else shows up the first time it matters.
function grandfatherTutorial() {
    tutorialSeen.intro = true;
    for (let r = 4; r <= 10; r++) if (isRegionOwned(r)) tutorialSeen['region_' + r] = true;
}

// ---- the pop-up (one box per page, closed with OK) ----
const tutorialQueue = [];
let tutorialOpen = false;

function showTutorial(id) {
    const tip = getTutorialTip(id);
    if (!tip || tutorialSeen[id]) return;
    tutorialSeen[id] = true;
    tip.pages.forEach((p, i) => tutorialQueue.push({ tip: tip, index: i }));
    if (typeof saveGameProgress === 'function') saveGameProgress();
    if (!tutorialOpen) showNextTutorialBox();
}

function showNextTutorialBox() {
    const item = tutorialQueue.shift();
    let ov = document.getElementById('tutorialOverlay');
    if (!item) {
        tutorialOpen = false;
        if (ov) ov.style.display = 'none';
        return;
    }
    tutorialOpen = true;
    // Let go of anything the player was holding when the box popped up.
    if (typeof resetJoystick === 'function') resetJoystick();
    if (typeof haltFeedTimers === 'function') haltFeedTimers();

    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'tutorialOverlay';
        ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.65); z-index:20500; display:none; align-items:center; justify-content:center;';
        const box = document.createElement('div');
        box.id = 'tutorialBox';
        box.style.cssText = 'background:#1f2a36; color:#fff; font-family:monospace; padding:16px; border-radius:12px; border:3px solid #f1c40f; width:86vw; max-width:360px; max-height:84vh; overflow-y:auto; box-shadow:0 8px 24px rgba(0,0,0,0.6);';
        const head = document.createElement('div');
        head.id = 'tutorialHead';
        head.style.cssText = 'font-size:16px; font-weight:bold; color:#f1c40f; margin-bottom:2px;';
        const step = document.createElement('div');
        step.id = 'tutorialStep';
        step.style.cssText = 'font-size:11px; color:#95a5a6; margin-bottom:10px;';
        const body = document.createElement('div');
        body.id = 'tutorialBody';
        body.style.cssText = 'font-size:13px; line-height:1.55; white-space:pre-line;';
        const ok = document.createElement('button');
        ok.id = 'tutorialOk';
        ok.textContent = 'OK';
        ok.style.cssText = 'display:block; margin:14px auto 0; min-width:120px; padding:10px 20px; border:none; border-radius:8px; background:#27ae60; color:#fff; font-family:monospace; font-size:15px; font-weight:bold; cursor:pointer;';
        const onOk = (e) => { if (e) e.preventDefault(); showNextTutorialBox(); };
        ok.addEventListener('click', onOk);
        box.appendChild(head); box.appendChild(step); box.appendChild(body); box.appendChild(ok);
        ov.appendChild(box);
        // Swallow stray touches so nothing underneath reacts while the box is open.
        ov.addEventListener('touchstart', (e) => { if (e.target === ov && e.cancelable) e.preventDefault(); }, { passive: false });
        document.body.appendChild(ov);
    }
    const total = item.tip.pages.length;
    document.getElementById('tutorialHead').textContent = `${item.tip.icon} ${item.tip.title}`;
    document.getElementById('tutorialStep').textContent = total > 1 ? `Tip ${item.index + 1} of ${total}` : 'Tip';
    document.getElementById('tutorialBody').textContent = tutorialPageText(item.tip.pages[item.index]);
    ov.style.display = 'flex';
}

// ---- tips that depend on the game state rather than a single event ----
let tutorialCheckCounter = 0;
function checkTutorialTriggers() {
    if (++tutorialCheckCounter < 30) return;     // twice a second is plenty
    tutorialCheckCounter = 0;
    if (!tutorialSeen.perks && character.perkPoints >= 1) showTutorial('perks');
    if (!tutorialSeen.feeder) {
        const all = [];
        Object.keys(petsByRegion).forEach(r => { if (Array.isArray(petsByRegion[r])) all.push.apply(all, petsByRegion[r]); });
        gliderPets.forEach(g => all.push(g));
        if (all.some(p => p.type !== 'bee' && p.level >= MAX_PET_LEVEL && isPetAvailable(p))) showTutorial('feeder');
    }
}

// ---- HELP screen (MENU -> ❓ HELP) ----
let helpPageIndex = 0;
function getHelpPages() {
    const pages = [];
    TUTORIAL_TIPS.forEach(tip => {
        if (!tutorialSeen[tip.id]) return;
        tip.pages.forEach((p, i) => pages.push({ tip: tip, index: i, total: tip.pages.length, text: tutorialPageText(p) }));
    });
    return pages;
}
function renderHelp() {
    const pages = getHelpPages();
    const title = document.getElementById('helpTitle'), body = document.getElementById('helpBody');
    const num = document.getElementById('helpPageNum'), prev = document.getElementById('helpPrev'), next = document.getElementById('helpNext');
    const note = document.getElementById('helpLockedNote');
    if (!title || !body) return;
    if (pages.length === 0) {
        title.textContent = '❓ Help';
        body.textContent = 'Tips and guides will appear here as you play.';
        if (num) num.textContent = '0 / 0';
        if (prev) prev.disabled = true;
        if (next) next.disabled = true;
        return;
    }
    helpPageIndex = Math.max(0, Math.min(pages.length - 1, helpPageIndex));
    const pg = pages[helpPageIndex];
    title.textContent = `${pg.tip.icon} ${pg.tip.title}` + (pg.total > 1 ? ` (${pg.index + 1}/${pg.total})` : '');
    body.textContent = pg.text;
    if (num) num.textContent = `${helpPageIndex + 1} / ${pages.length}`;
    if (prev) prev.disabled = helpPageIndex === 0;
    if (next) next.disabled = helpPageIndex === pages.length - 1;
    if (note) {
        const hidden = TUTORIAL_TIPS.filter(t => !tutorialSeen[t.id]).length;
        note.textContent = hidden > 0 ? `🔒 ${hidden} more guide${hidden === 1 ? '' : 's'} will appear as you unlock regions and pets.` : '';
    }
    const scroller = document.getElementById('helpBodyWrap');
    if (scroller) scroller.scrollTop = 0;
}

(function wireHelp() {
    const overlay = document.getElementById('helpOverlay');
    bindOverlayButton(document.getElementById('openHelpBtn'), (e) => {
        if (e) e.preventDefault();
        helpPageIndex = 0;
        renderHelp();
        if (overlay) overlay.style.display = 'flex';
    });
    bindOverlayButton(document.getElementById('helpClose'), (e) => {
        if (e) e.preventDefault();
        if (overlay) overlay.style.display = 'none';
    });
    const prev = document.getElementById('helpPrev'), next = document.getElementById('helpNext');
    if (prev) prev.addEventListener('click', () => { helpPageIndex--; renderHelp(); });
    if (next) next.addEventListener('click', () => { helpPageIndex++; renderHelp(); });
})();
