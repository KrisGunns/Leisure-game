// ============================================================
// perktree.js — THE PERK TREE (edit costs / strengths / add perks here)
// ============================================================
// Loaded BEFORE state.js (see index.html). Nothing else lives here: state.js, ui.js and the
// balance simulator all read PERK_TYPES / PERK_TREE_LAYOUT / PERK_TREE / PERK_BY_ID from this file.
//
// HOW TO EDIT
//  - Change a price or strength: edit `cost` / `add` / `text` in PERK_TYPES (every node of that
//    type follows) — or add `cost: N` to ONE row of PERK_TREE_LAYOUT to price just that node.
//  - Add a perk node: append a row to PERK_TREE_LAYOUT with a NEW id, the next free `tier`/`col`,
//    and `requires: [<id of the node below it>]`. List it AFTER the node it requires.
//  - Add a new perk TYPE: add it to PERK_TYPES. `stat` must be a stat that getCharacterBonuses()
//    (state.js) understands: petFoodWater, petHoney, petFish, coin, petBanana. A brand-new stat also
//    needs a line in getCharacterBonuses() and wherever that stat is applied.
//  - NEVER rename or reuse an existing id: unlocked perks are saved by id.
// ------------------------------------------------------------

// ------------------------------------------------------------
// PERK TREE — character perks the player chooses to unlock (MENU -> 🌳 PERK TREE).
// ------------------------------------------------------------
// The player earns 1 perk point per character level gained and spends points to unlock a
// node. A node can be unlocked when BOTH hold (see getPerkStatus):
//   1. every perk in `requires` (the connected node(s) below it) is already unlocked, and
//   2. there are enough perk points for its `cost`.
// There are NO character-level requirements: a perk is locked only by the perk beneath it.
//
// Two tables:
//  - PERK_TYPES: what each named perk IS — name, icon, cost, and effect (`stat` + `add`).
//    Change a perk's price or strength here and every node of that type follows.
//  - PERK_TREE_LAYOUT: WHERE nodes sit. `tier` = row (0 = the bottom/root row, growing
//    upward), `col` = column (0..PERK_TREE_COLS-1, left to right), `requires` = the id of
//    the node it grows out of. A row can also override any type property (e.g. a different
//    `cost` for one specific node). To add perks (e.g. for later levels), append rows with
//    the next tier numbers — the tree screen (ui.js) sizes and scrolls itself.
// A node must be listed AFTER everything in its `requires` (normalizeCharacterPerks relies
// on it); sorting by tier already guarantees that.
const PERK_TREE_COLS = 5;

const PERK_TYPES = {
    // `desc` (no number) is what the Character screen's bulked perk summary uses — see
    // updateCharacterScreen() in ui.js — since that view combines every unlocked node of a
    // type into one line with a SUMMED percentage, so it can't just reuse `text`, which is
    // one specific node's own fixed +NN%. The Perk Tree screen itself still shows each
    // node's own individual `text` unchanged — this doesn't touch that.
    basicResource: { name: 'Basic Resource', icon: '🍪💧', cost: 1,  stat: 'petFoodWater', add: 0.15, text: '+15% food & water gained from pets', desc: 'food & water gained from pets' },
    glazed:        { name: 'Glazed',         icon: '🍯',   cost: 3,  stat: 'petHoney',     add: 0.10, text: '+10% honey gained from pets',        desc: 'honey gained from pets' },
    fishyBusiness: { name: 'Fishy Business', icon: '🐟',   cost: 2,  stat: 'petFish',      add: 0.12, text: '+12% fish gained from pets',         desc: 'fish gained from pets' },
    riches:        { name: 'Riches',         icon: '🪙',   cost: 5,  stat: 'coin',         add: 0.10, text: '+10% coin gained',                   desc: 'coin gained' },
    bananas:       { name: 'Bananas!',       icon: '🍌',   cost: 2,  stat: 'petBanana',    add: 0.12, text: '+12% bananas gained from pets',      desc: 'bananas gained from pets' }
};

// Ids are `<type>_c<col>t<tier>` (by the node's ORIGINAL position). They're stored in
// saves, so never reuse or rename one — add new nodes with new ids instead.
const PERK_TREE_LAYOUT = [
    // Tier 0 — the root, alone on its row. Everything else grows out of it.
    { id: 'basicResource_c2t0', type: 'basicResource', tier: 0, col: 2, requires: [] },

    // Tier 1 — five branch starters, all growing out of the root.
    { id: 'basicResource_c0t1', type: 'basicResource', tier: 1, col: 0, requires: ['basicResource_c2t0'] },
    { id: 'glazed_c1t1',        type: 'glazed',        tier: 1, col: 1, requires: ['basicResource_c2t0'] },
    { id: 'basicResource_c2t1', type: 'basicResource', tier: 1, col: 2, requires: ['basicResource_c2t0'] },
    { id: 'fishyBusiness_c3t1', type: 'fishyBusiness', tier: 1, col: 3, requires: ['basicResource_c2t0'] },
    { id: 'basicResource_c4t1', type: 'basicResource', tier: 1, col: 4, requires: ['basicResource_c2t0'] },

    // Tier 2 — each column continues straight upward.
    { id: 'bananas_c0t2',       type: 'bananas',       tier: 2, col: 0, requires: ['basicResource_c0t1'] },
    { id: 'riches_c1t2',        type: 'riches',        tier: 2, col: 1, requires: ['glazed_c1t1'] },
    { id: 'glazed_c2t2',        type: 'glazed',        tier: 2, col: 2, requires: ['basicResource_c2t1'] },
    { id: 'basicResource_c3t2', type: 'basicResource', tier: 2, col: 3, requires: ['fishyBusiness_c3t1'] },
    { id: 'glazed_c4t2',        type: 'glazed',        tier: 2, col: 4, requires: ['basicResource_c4t1'] },

    // Tier 3
    { id: 'riches_c0t3',        type: 'riches',        tier: 3, col: 0, requires: ['bananas_c0t2'] },
    { id: 'fishyBusiness_c1t3', type: 'fishyBusiness', tier: 3, col: 1, requires: ['riches_c1t2'] },
    { id: 'basicResource_c2t3', type: 'basicResource', tier: 3, col: 2, requires: ['glazed_c2t2'] },
    { id: 'riches_c3t3',        type: 'riches',        tier: 3, col: 3, requires: ['basicResource_c3t2'] },
    { id: 'bananas_c4t3',       type: 'bananas',       tier: 3, col: 4, requires: ['glazed_c4t2'] },

    // Tier 4 — Basic Resource / Glazed / Fishy Business / Bananas! / Glazed
    { id: 'basicResource_c0t4', type: 'basicResource', tier: 4, col: 0, requires: ['riches_c0t3'] },
    { id: 'glazed_c1t4',        type: 'glazed',        tier: 4, col: 1, requires: ['fishyBusiness_c1t3'] },
    { id: 'fishyBusiness_c2t4', type: 'fishyBusiness', tier: 4, col: 2, requires: ['basicResource_c2t3'] },
    { id: 'bananas_c3t4',       type: 'bananas',       tier: 4, col: 3, requires: ['riches_c3t3'] },
    { id: 'glazed_c4t4',        type: 'glazed',        tier: 4, col: 4, requires: ['bananas_c4t3'] },

    // Tier 5 — Fishy Business / Basic Resource / Glazed / Riches / Basic Resource
    { id: 'fishyBusiness_c0t5', type: 'fishyBusiness', tier: 5, col: 0, requires: ['basicResource_c0t4'] },
    { id: 'basicResource_c1t5', type: 'basicResource', tier: 5, col: 1, requires: ['glazed_c1t4'] },
    { id: 'glazed_c2t5',        type: 'glazed',        tier: 5, col: 2, requires: ['fishyBusiness_c2t4'] },
    { id: 'riches_c3t5',        type: 'riches',        tier: 5, col: 3, requires: ['bananas_c3t4'] },
    { id: 'basicResource_c4t5', type: 'basicResource', tier: 5, col: 4, requires: ['glazed_c4t4'] },

    // Tier 6 (top row) — Glazed / Basic Resource / Bananas! / Glazed / Fishy Business
    { id: 'glazed_c0t6',        type: 'glazed',        tier: 6, col: 0, requires: ['fishyBusiness_c0t5'] },
    { id: 'basicResource_c1t6', type: 'basicResource', tier: 6, col: 1, requires: ['basicResource_c1t5'] },
    { id: 'bananas_c2t6',       type: 'bananas',       tier: 6, col: 2, requires: ['glazed_c2t5'] },
    { id: 'glazed_c3t6',        type: 'glazed',        tier: 6, col: 3, requires: ['riches_c3t5'] },
    { id: 'fishyBusiness_c4t6', type: 'fishyBusiness', tier: 6, col: 4, requires: ['basicResource_c4t5'] }
];

// Flat list the rest of the game reads: each layout row merged over its type.
const PERK_TREE = PERK_TREE_LAYOUT.map(row => Object.assign({}, PERK_TYPES[row.type], row));

const PERK_BY_ID = {};
PERK_TREE.forEach(p => { PERK_BY_ID[p.id] = p; });
