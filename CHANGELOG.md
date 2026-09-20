# Leisure Game — Project Log

**Repo:** KrisGunns/Leisure-game
**Stack:** HTML5 Canvas + vanilla JavaScript + CSS3, hosted on GitHub Pages, wrapped into an Android APK via WebIntoApp.
**Save system:** Browser `localStorage`, key `just_a_little_leisure_save_v2`. Tied to the site's origin, not to file structure — safe to refactor JS files without wiping player progress, as long as the key name and saved data shape don't change. Pets are saved as a **per-region array** (positional), not keyed by type — this matters because Region 4 can hold multiple bees of the same type. `loadGameProgress()` also still reads the older type-keyed format for backward compatibility with saves made before 2026-09-15.

> **Note to Claude (start of a new chat):** Read this file first for full context before touching code. It describes current architecture, features, and known non-bugs so you don't need to re-derive them from scratch. Update the "Changelog" section at the bottom of this file whenever you make a meaningful fix or change, and update "Current Features" / "File Architecture" if behavior or structure changes.

---

## File Architecture

The game was originally one `game.js` file; it's now split into 6 files that must be loaded via `<script>` tags **in this exact order** (plain scripts, not ES modules — they share one global scope on purpose):

```html
<script src="state.js"></script>
<script src="entities.js"></script>
<script src="world.js"></script>
<script src="input.js"></script>
<script src="ui.js"></script>
<script src="main.js"></script>
```

| File | Responsibility | Depends on |
|---|---|---|
| `state.js` | `inventory`, `character` (level/xp/**perkPoints/perks**), `gainPlayerXP()`, `showLevelUpToast()`, `getLevelRequirement()`, `getCharacterNextXP()`, `FORAGE_TIERS` + `getForageYield()` (pet forage yield table), `saveGameProgress()`, `loadGameProgress()`, core DOM label refs, **perk tree data + rules** (`PERK_TREE`, `getPerkStatus()`, `unlockPerk()`, `normalizeCharacterPerks()`, `getCharacterBonuses()`), **shop data** (`shopBuffs`, `SHOP_ITEMS`, `SELL_ITEMS`), `tickShopBuffs()`, buff multipliers (`getPetSpeedMultiplier()`/`getPetForageMultiplier()`/`getXPMultiplier()`) | none (loads first) |
| `entities.js` | `Player`, `Item`, `Flower`, `Pet` classes (all pet AI/state-machine logic lives in `Pet.update()`) | `state.js` |
| `world.js` | The `player` instance, `regionalItems` (food/water/flower/banana/egg pools per region), `petsByRegion` (pet roster per region), `region4Hive`, `createBee()`/`createBear()`/`createMonkey()` factories, `isJungleTierUnlocked()`/`areRegions1to3Tamed()`/`isRegionUnlocked()` (region-lock single source of truth), `spawnCoinPopup()`/`spawnRegionFX()` (floating visual effects), `resizeCanvas()`, `checkCollisions()`, `processSpawns()` | `state.js`, `entities.js` |
| `input.js` | Virtual joystick, GIVE/PLAY interact button (hold-to-feed with ramping `feedHoldCounter`, pointer-capture for reliability), whistle button (single-tap toggle or multi-pet picker), region selector (+ region-lock check), keyboard controls, `executeContinuousFeed()` | `state.js`, `entities.js`, `world.js` |
| `ui.js` | `updateUI()`, `renderMiniPet()`, pet Codex overlay, settings/dev panel, pet renaming, bag overlay, bee-purchase button, whistle-picker overlay (`showWhistlePicker()`/`hideWhistlePicker()`), consolidated MENU overlay (`handleOpenMenu()`/`handleCloseMenu()`), **Shop screen** (`renderShop()`, `buyShopItem()`, `sellShopItem()`), **Perk Tree screen** (`renderPerkTree()`, `renderPerkDetail()`) | `state.js`, `entities.js`, `world.js` |
| `main.js` | `gameLoop()` (render + update loop), startup sequence (`loadGameProgress()`, initial item spawns, `requestAnimationFrame` kickoff) | all of the above (loads last) |

**Why this order works:** each file's *immediately-executing* top-level code (variable declarations, `new Pet(...)`, event listener registration) only references things defined in earlier-loaded files. Anything referenced "out of order" — like `state.js`'s `gainPlayerXP()` calling `ui.js`'s `updateUI()` — is inside a function body, which isn't actually run until later gameplay, by which point every file has finished loading.

**Known quirk (not a bug, don't "fix" without care):** `bagOverlay`, `openBagBtn`, `bagClose` in `ui.js` are used but never explicitly declared with `let`/`const`. They work via the browser's automatic "DOM id → global variable" behavior (elements with an `id` attribute become bare global identifiers in non-strict, non-module scripts). This breaks if the scripts are ever converted to ES modules or given `'use strict'`. Left as-is intentionally.

---

## Current Features

**Regions:** 8 total, selected via a dropdown.
- Regions 1–3: starter pets (dog, elephant, squirrel + chicken respectively), food/water item spawns.
- Region 3 also spawns collectible eggs (from chickens reaching level 20).
- Region 4: bee hive — locked until every pet in Regions 1–3 is level 2+. Bees forage flowers, carry honey back to the hive, and cost 10 coins to spawn (max 3 bees).
- Region 5: bears — locked behind the same Regions 1–3 requirement. 2 bears (the original male `Bear` and a smaller female `Bow Bear` — see 2026-09-18 (2)); both fish periodically for fish, identical stats/mechanics, purely a cosmetic variant.
- Region 6: **Pig Sty** — locked behind the same Regions 1–3 requirement (flagged as an assumption, not explicitly specified). 2 pigs (pink `Pig`, grey `Mud Pig`), spawns food/water like Regions 1-3. See "Pig specifics" below.
- Region 7: **Panda habitat** — locked behind the "jungle tier" condition: pets in Regions 1-3 must be Level 10+, **and** pets in Regions 4-6 must be Level 5+ (changed from the original "every pet in Regions 1-6 at Lv10+" — see 2026-09-17 (1)). Single source of truth is `isJungleTierUnlocked()` in `world.js` (renamed from `isRegion7Unlocked()` when Region 8 was added — see 2026-09-19 (1) — since it now gates two regions, not one). The player-facing locked-region alerts (`input.js`) deliberately describe only the *requirement*, never the region's identity/theme, so unlocking it stays a surprise.
- Region 8: **Monkey jungle** — locked behind the same `isJungleTierUnlocked()` condition as Region 7 (by design, per spec — see 2026-09-19 (1)). Jungle background: trees with hanging vines, brown color palette distinct from Region 7's bamboo forest. 2 brown monkeys forage a new resource, **bananas**, which only spawn in this region. See "Monkey specifics" below.

**New resource — bananas:** Region 8 only. Same manual-pickup pattern as food/water (1:1 XP with amount collected, same `manualGather` character bonus), own dedicated item pool/respawn queue (mirrors how Region 4 gets flowers instead of food/water), shown in the bag overlay.

**Pets:** dog, cat, elephant, squirrel, chicken, bird, bee, bear (×2 — male + female), pig, panda, monkey (×2). Each has its own AI state machine in `Pet.update()` (wander/idle/forage/whistled/etc., plus type-specific states like `digging`, `fishing`, `playing_*`, `schrodinger`, `mud_play`, `swinging`, the bird's excursion handling, and the panda's `bamboo_wait`/`full`/`abandoned`).

**Character progression:**
- Player has `level`/`xp`/`name` (editable, see Character screen below), separate from pet levels.
- Gains XP **1:1 with the amount of food/water/bananas actually collected** (post character-level multiplier) for walking over a drop on the map — e.g. collecting 3 water at once grants +3 XP, not a flat +1. Egg pickups and manually feeding a pet (holding the GIVE button) still grant a flat +1 XP per item/unit.
- Level-up shows a non-blocking on-screen toast (not a blocking `alert()` — see Changelog).
- **XP progress bar:** the LV./XP badge in the top HUD fills left-to-right with a light-blue gradient as XP approaches the next level (same visual language as a pet's forage-progress bar above its head — see 2026-09-18 (1)), driven by `character.xp / getCharacterNextXP(character.level)`, recalculated every `updateUI()` call.
- Character perks give pets passive bonuses to auto-foraged resource amounts (which perks are active is now the player's choice in the **Perk Tree**, see 2026-09-19 (7)), and manually-collected resources scale with `character.level * 0.10` (always on, not a perk). All of this is computed by a single shared function, `getCharacterBonuses(level)` in `state.js` — see the 2026-09-16 (6) changelog entry — so `entities.js`, `world.js`, and the Character screen can never disagree about what's actually in effect.
- **Character screen:** opened via the consolidated MENU overlay (☰ MENU button, top-left — see 2026-09-18 (3)), then the 🧑 CHAR button inside it. Shows the editable name, current level, the live % bonus totals from `getCharacterBonuses()`, and the full Lv5–50 perk checklist (from `PERK_TREE` in `state.js`) with the perks **unlocked in the Perk Tree** shown in green with a ✓. It never shows perk points.
- **Perk Tree** (🌳 PERK TREE in the MENU overlay — see 2026-09-19 (7)): a scrollable RPG skill tree; earn 1 perk point per character level, spend it to unlock perks along three branches.

**Pet leveling:** each pet requires cumulative food/water (or a single resource — honey for bear, bananas for monkey) to level up, calculated via `getLevelRequirement()`. Pets level up either passively (auto-foraging map items) or via manual feeding (holding GIVE near a pet, which drains the player's food/water/honey/banana inventory as appropriate).

**Pet-specific mechanics:** most coin payouts below also spawn a floating "+N 🪙" popup above the pet that earned it (`spawnCoinPopup()` in `world.js` — see 2026-09-18 (1)), region-tagged so it only renders while the player is actually looking at that region (pets simulate in the background regardless of which region is on-screen).
- **Dog** (level 20): 10% chance per successful forage to enter a `digging` state — plays a dirt-particle animation, then awards 1 coin.
- **Cat** (Region 1): Level 15+: 10% chance per forage to double the food/water it just collected. Level 20+: 3% chance per forage — **only while the player is standing in Region 1** — to enter a "Schrödinger" state — frozen in place, flickering between two visual states — until the player approaches (within 70px) and presses PLAY, opening a Dead/Alive picker; correct guess pays 10 coins either way the box resolves and it returns to wandering.
- **Elephant** (level 20, Region 2): 10% chance to trigger a multi-step "tag" minigame (approach → retreat → wait for player to move → chase) rewarding 5 coins if caught.
- **Chicken** (level 20): 5% chance per forage to lay an egg on the map (Region 3 only).
- **Bird** (Region 3, level 20): 5% chance per successful forage to fly off to a random other region for 60s — filtered to regions the player has actually **unlocked** (see 2026-09-18 (1); it used to consider all of Regions 1-6 regardless of the player's actual progress). Forages there with a +20% food/water bonus if it's a food/water region, fishes (10% chance/sec) if it lands in Region 5, or gives every bee in Region 4 a temporary +20% speed boost for the visit. Returns home after 60s with +2 coins. Fly-away/landing visual effects play in whichever region the player is currently viewing at each end of the trip. See the 2026-09-16 (8) changelog entry for full mechanics and the save/load handling this required.
- **Bee**: forages flowers, carries honey (capacity scales with level: 1/2/3/5 at levels 1/5/10/20); time to forage a single flower also drops with level (5.0s base → 4.5s at Lv5 → 4.0s at Lv10 → 3.0s at Lv20 — travel speed to/from the hive is unaffected by level). Returns to hive to deposit, then goes idle. Up to 3 bees total per save (the starter bee + 2 purchasable "Worker Bee" hires at 10 coins each via the hive's spawn button); all bees — starter or purchased — are built through the same `createBee()` factory so they behave identically.
- **Bear** (tames at level 2, but doesn't start fishing until level 5) — Region 5, 2 of them: travels to a lake, fishes for ~20s per cycle, catches 1 fish per cycle (3 from level 10). Fishing cycle cooldown speeds up at level 10 and again at level 15. 10% chance of a double catch (up to 6 fish) at level 20. The second bear, `Bow Bear` (female), is a purely cosmetic variant added 2026-09-18 (2): same brown color, same base Exp/fishing mechanic/fishing yield (both driven by `type === 'bear'`, untouched by the variant), just a ~15% smaller model with a pink bow drawn above its ears (`isFemaleBear` flag in `entities.js`, set by `createBear()`'s `options.female`).
- **Pig** (either color): forages food/water like dog/squirrel/chicken (see `FORAGE_TIERS.pig` in `state.js`). Level 20+: 5% chance per successful forage to enter a 5-second mud-play state, awarding 2 coins (5% chance to double to 4 — the Codex's one-line perk summary was simplified to "+2 coins" per request, but the underlying 5%-double roll is unchanged). Level-1 XP requirement is 50 food / 30 water (not a 50/50 split — see `getLevelRequirement()`'s pig-specific branch).
- **Panda** (Region 7): see the 2026-09-16 (10) entry for the full "Bamboo Fever" minigame. Two timing bugs fixed 2026-09-18 (1): the `full` (sleep) state now only shows *after* the minigame ends, not during it; and the `abandoned` (Starve) flee state no longer gets pinned in a screen corner — it steers away from walls instead of just running straight away from the player.
- **Monkey** (Region 8, brown, 2 of them): tames at level 2 exactly like dog/squirrel/pig, then autonomously forages bananas (the same "forage fills the player's inventory, GIVE converts inventory → level" pattern every other food/water forager uses — see `FORAGE_TIERS.monkey` in `state.js`). Base Exp 50 bananas; forage yield +1/+2/+3/+4/+6 bananas per successful forage at Lv1/5/10/15/20. Level 20+: 5% chance per forage to swing on a nearby vine for 20s (own `swinging` state, distinct hanging pose in `draw()`), then pays out 5 coins.

**Other systems:**
- Joystick (touch) + WASD/arrow keys (desktop) movement, spacebar/E to feed.
- **GIVE button**: holding it feeds the nearest eligible pet(s) in range; uses `setPointerCapture()` (added 2026-09-18 (3)) so a touch drifting a few px off the button mid-hold no longer drops the hold early. Feed speed scales with *percentage* of the pet's remaining requirement rather than a flat unit count, so holding at max speed fills the progress bar in ~3 seconds regardless of whether the pet needs 20 units or 2,000.
- Whistle button: calls eligible pets (non-bee, level 2+) to the player. In a region with one eligible pet, one tap toggles Call/Return directly. In a region with more than one (currently Region 3: Squirrel + Chicken), tapping whistle opens a picker so you can call specific pets independently rather than all at once.
- **MENU button** (☰, top-left — see 2026-09-18 (3)): a full-screen orange overlay consolidating the old separate PETS/BAG/CHAR buttons into one entry point. The game keeps simulating behind it (nothing is paused), it's just visually/interactively blocked while the menu is up. Tapping PETS/BAG/CHAR inside it opens that screen layered on top of the menu; closing that screen reveals the menu again underneath rather than dropping straight back to gameplay.
- Pet Codex overlay: mini-canvas renders of each pet with their current stats. Clicking/tapping any revealed portrait opens a detail screen (name, level, current forage yield, full level-perk checklist with reached perks checked off).
- Settings/dev panel: add 50 food/water, add 500 gold, wipe save, insta-max a region's pets to level 20 (dev/testing tools).
- **Shop** (🛒 SHOP in the MENU overlay — see 2026-09-19 (6)): Buy tab (Cake 200🪙, Wisdom Potion 500🪙 — each a 3-minute timed buff) and Sell tab (eggs 1🪙 each, fish 2🪙 each, with Sell 1 / Sell all).
- Pet renaming via text inputs bound per pet slot.
- Bag overlay: shows "vault" resources (coins, eggs, honey, fish, bananas) separately from the pinned food/water HUD.
- Auto-save every 10 seconds, plus on most state-changing events (level-ups, pet levels, purchases).

---

## Changelog

### 2026-09-19 (7) — Perk Tree: choose-your-own character perks, 1 perk point per level

**Added:**
- **🌳 PERK TREE button** in the MENU overlay (below SHOP) opening `#perkTreeOverlay`, a bottom-up RPG skill tree:
    - **Layout:** the **Lv.5 perk is the root, alone on the bottom row**; **three branches extend upward** from it. Tier 1 = Lv.10 / Lv.15 / Lv.20 (left / centre / right), then every other perk continues straight up those same three columns: tier 2 = Lv.25 / 30 / 35, tier 3 = Lv.40 / 45 / 50. Connector lines are gold where both ends are unlocked, light where a branch is open, dotted where it's out of reach. Node styles: gold = unlocked (✓), pulsing green = can be unlocked right now, grey outline = prerequisites done but level/points short, dark + 🔒 = a prerequisite perk isn't unlocked yet.
    - **Perk points are shown only on this screen, at the very top** (a fixed row under the title, so it never scrolls away). Not shown in the HUD, Character screen, bag, level-up toast or on the menu button (per spec).
    - **Scrollable like the pets codex** (own vertical scroll, momentum on iOS, `overscroll-behavior: contain`). Opens scrolled to the bottom (the root). The tree is sized from data, and when it's shorter than the panel it sits at the bottom (`margin-top: auto`), so **adding perks for levels past 50 is just appending rows to `PERK_TREE`** (`tier` = row, `col` = branch, `requires` = parent ids) — no UI changes needed.
    - **Tap a node** to select it; a detail panel pinned under the tree shows the perk, why it's locked (which prerequisite / what level) and an **Unlock · 1 pt** button — the button is what spends the point. Nodes use `click` (not touchstart) so a finger that starts on a node can still scroll the tree; verified with real touch drags.
- **Perk points:** `character.perkPoints` — **+1 for every character level gained**, awarded in the single place character level changes (`gainPlayerXP()`, so multi-level jumps award one per level). Perks: `character.perks` = array of unlocked ids. Both live on `character`, so they're saved in the existing `characterData` — no new save key.
- **Unlock rules** (`getPerkStatus()` / `unlockPerk()` in `state.js`, re-validated on every call so the UI is never the only guard): a perk needs (1) all `requires` perks unlocked, (2) **character level ≥ the perk's level** — each node keeps the level milestone it used to unlock automatically at, and (3) `cost` points (all currently 1; `cost` is per-perk data). Unlocked perks are permanent (no respec).

**Changed:**
- **Character perks are no longer automatic.** `getCharacterBonuses(level)` (same signature, same 4 callers in `entities.js`/`world.js`/`ui.js`) now sums the effects of the *unlocked* perks instead of checking level thresholds. `manualGather` (+10% per level) is not a perk and stays level-driven. `CHARACTER_LEVEL_PERKS` was replaced by `PERK_TREE` (each node carries its effect: `stat` + `add`, so data and behaviour can't drift). Effects/numbers are unchanged from the old milestones (+30% food & water at Lv5/15/35/45, +25% honey at Lv10/30, +25% fish at Lv20/40, +25% coin at Lv25/50; the Lv5/15/35/45 perk text now consistently says "from pets").
- **Character screen:** the checklist ("Perks (unlocked in the Perk Tree)") now marks perks green + ✓ when unlocked, not when the level is merely reached.
- `style.css` cache-buster `?v=1.3`; Shop's panel/header/points-row styles are now shared with the tree via grouped selectors.

**Existing saves (migration):** a save with no `character.perks` (anything from before this feature) gets **`level - 1` perk points and no perks unlocked** — i.e. the old automatic bonuses are gone until the player spends points in the tree (they always have enough points to re-take everything their level had qualified for). This deliberately follows "the user chooses" rather than auto-unlocking; if you'd rather grandfather existing players, auto-unlock every perk with `level <= character.level` inside the legacy branch of `normalizeCharacterPerks()` (and deduct the cost). On every load the stored data is sanity-checked: unknown/duplicate ids dropped, perks whose prerequisite isn't unlocked dropped, negative/garbage/fractional point values → 0/floored.

**Design calls worth knowing about (all easy to change):**
- *Level gate kept.* Perks require both the point and their original level (the "Lv.N perk" naming). Dropping the gate = delete the `needsLevel` line in `getPerkStatus()`.
- *Branch assignment is round-robin by level* (10→left, 15→centre, 20→right, 25→left, …), which keeps rows aligned with rising levels; branches therefore mix perk types (e.g. the left branch is honey → coin → fish). Re-theming a branch = change `col`/`requires` on the rows in `PERK_TREE`.
- Because 1 point is earned per level and there are only 10 perks costing 1 each, points won't be scarce yet; that's expected to change as perks/costs are added past Lv.50.

**Verification:** `node --check` on all touched files. **Equivalence proof:** a script loaded the *original* uploaded `getCharacterBonuses()` and the new tree-driven one and compared all five bonus values at every level 1–60 with every reached perk unlocked — identical, so no perk's numbers changed. Playwright (headless Chromium) end-to-end run against the real game: 77 assertions covering menu button, 10 nodes/4 rows/root alone/three aligned columns/9 connector lines, points at the top and nowhere else, point award per level incl. multi-level jumps, every gating rule (locked / level / points / double-unlock / unknown id / branch independence), bonuses applied and matching old totals, full click flow (select → detail → Unlock → point spent → styles update), Character screen sync, live refresh on level-up while open, save/reload, legacy-save migration and tampered/garbage saves, wheel **and real touch-drag scrolling** (including a drag that starts on a node — scrolls, doesn't select; control-tested against the pets codex), a runtime-added tier-4 perk growing the tree, tall-screen bottom alignment, and all 5 menu buttons fitting a 360×640 phone; plus the prior 72-assertion shop/timed-buff suite re-run with no regressions. Zero JS errors. (Harness note: Chromium's `Input.synthesizeScrollGesture` doesn't scroll anything in this headless setup even for the existing codex, so touch tests use raw `Input.dispatchTouchEvent` drags instead.)

---

### 2026-09-19 (6) — Shop (Buy/Sell), timed Cake + Wisdom Potion buffs, dev "+500 gold"

**Added:**
- **Dev panel: 🪙 +500 GOLD** (`devAddGold`) — adds 500 to `inventory.coins`, stacks per click.
- **🛒 SHOP button** in the MENU overlay (below CHAR) opening a new `#shopOverlay` (same dark-panel style/z-index as Bag/Codex/Character, so it layers over the menu and closing it returns to the menu). Shows current gold and two tabs:
    - **Buy**: `Cake` (200🪙) — all pets +50% movement speed **and** foraging speed. `Wisdom Potion` (500🪙) — character gains +50% XP. **Each lasts 3 minutes** (`duration: 180` in `SHOP_ITEMS`). While a buff is running its row shows a live "⏳ m:ss left" countdown and a green "Active" button; it **can't be re-bought until it expires** (no stacking/refreshing, so no accidental double-spend). When it ends a "<item> has worn off" toast appears (`showBuffExpiredToast()`) and the Buy button returns. Unaffordable items are disabled and show "need N more".
    - **Sell**: eggs (1🪙) and fish (2🪙) from the bag, each with **Sell 1** / **Sell all**, disabled at 0 stock. Sale price is flat — the character's "+% coin gained" perk deliberately does *not* apply to sales.
- Shop rows are built from data tables in `state.js` (`SHOP_ITEMS`, `SELL_ITEMS`), so a new item is one new row.
- `shopBuffs` (seconds remaining per buff, 0 = inactive) is saved/loaded as `stateMatrix.shopBuffs`. Remaining time is preserved across reloads and does **not** drain while the app is closed. Older saves without the key (incl. an interim build that stored permanent `shopPurchases` booleans, now ignored) load as "nothing active"; stored values are validated and capped at the item's duration. Dev "Wipe save" also clears it.

**How the buffs are applied (single source of truth = the three `get...Multiplier()` functions in `state.js`, which read the live timer so they switch off the instant a buff expires):**
- **Pet speed:** `Pet` gained an `effectiveSpeed` getter (`speed * getPetSpeedMultiplier()`); every movement read inside `Pet.update()` now uses it. `this.speed` itself stays the raw base value on purpose — the factories in `world.js` assign it absolutely, and the bird's Lv20 perk does `bee.speed *= 1.20` / `/= 1.20`; baking the Cake into `speed` would have corrupted one or the other. New pets (bought bees, save/load reconstruction) pick the buff up automatically. The player's own speed is untouched.
- **Foraging speed** (all sped up by 1.5x, so end-to-end gather throughput is +50% when combined with speed): bee time-at-flower ticks at `dt * 1.5`; land pets' rest pause after each forage is divided by 1.5; **bear fishing** (active-fishing timer and the cooldown between trips) ticks at `dt * 1.5`. Bear fishing was included because it's the bear's only gathering mechanic — flag if you'd rather it be excluded. Not affected: idle pauses unrelated to foraging, bird's 60s excursion, mini-game timers (mud-play, digging, Bamboo Fever, etc.).
- **XP:** `gainPlayerXP()` multiplies by `getXPMultiplier()`. `character.xp` may now hold fractions (a "+1" grant becomes 1.5) because rounding per-grant would erase the bonus on the common 1-XP grants; every display (`state.js` x2, `ui.js` `updateUI()`) uses `Math.floor()`. The XP bar and level-up loop use the exact value.

**Buff timer uses the wall clock, NOT the game loop's `dt` (important):** `tickShopBuffs()` (called once per frame from `gameLoop()` in `main.js`) measures its own `performance.now()` delta, clamped to 0.25s so a backgrounded/frozen app pauses the buff instead of draining it. Reason: **pre-existing quirk in `gameLoop()`** — it computes `dt` from the full elapsed time and then sets `lastTime = timestamp - (elapsed % frameInterval)`, which re-adds the leftover sub-frame remainder on the next frame, so game-time `dt` over-counts (measured 5.81s of summed `dt` in 3.0 real seconds in headless Chromium; a `lastTime = timestamp` variant measured 3.02s). Using that `dt` would have made "3 minutes" last well under 3 real minutes. The loop itself was intentionally **left unchanged** (fixing it would slow every pet timer/speed on affected devices); if you ever want it fixed, it's a one-line change plus a re-balance pass.

**UI notes:** the countdown text is updated in place once per frame (`updateShopTimers()`); the shop's DOM is only rebuilt when something structural changes (gold/eggs/fish, or a buff starting/ending), because rebuilding buttons every second would swallow taps. In-list buttons use `click` (not touchstart) so scrolling from a button works. `style.css` cache-buster bumped to `?v=1.2`.

**Verification:** `node --check` on all touched files, plus a Playwright (headless Chromium, phone viewport) end-to-end run against the real game: 72 assertions covering dev gold, menu -> shop navigation, buy/active-countdown/unaffordable/boundary (exactly 500)/no re-buy while active/expiry + toast/re-buy after expiry, real-time accuracy (4.00s real = 4.00s of buff) and freeze clamping, sell 1 / sell all / zero-stock, live refresh, XP (1->1.5, no rounding loss, fractional level-up carry, floored HUD), measured pet speed (80 -> 120 px/s), bee/bear timers, land-pet rest range, composition with the bird's speed boost, save/load round-trip of remaining time, legacy/corrupted save values, and menu layering. Zero JS errors. Caught and fixed during visual review: "Fishs" pluralization bug and menu text ghosting through the panel.

---

### 2026-09-19 (5) — New region: Region 8 (Monkey jungle) + New pet: Monkey (×2) + New resource: Banana

**Added:**
- **Region 8**, shown as "Region 8" in the dropdown, a jungle habitat (new background art in `main.js`: deep-green canopy-shadowed ground, five trees with three hanging vines each, brown trunks/green canopies — visually distinct from Region 7's bamboo forest). Locked behind the exact same condition as Region 7 (per spec) — see the `isJungleTierUnlocked()` rename below.
- **New resource: banana.** Spawns only in Region 8 (own dedicated pool/respawn-queue entry/10s top-up, mirroring how Region 4 gets flowers instead of food/water — `regionalItems[8].bananas`, `FOOD_WATER_REGIONS` deliberately does **not** include 8). New yellow-crescent visual in `Item.draw()`. Manual pickup is 1:1 XP with the amount collected, same `manualGather` character bonus as food/water (`world.js`'s `checkCollisions()`). Tracked in `inventory.bananas`, shown in the bag overlay (`bagBananas`), fully wired into save/load.
- **New pet: Monkey**, brown, 2 per save (`Monkey` + `Coco`) via a new `createMonkey()` factory (`world.js`). Tames at level 2 exactly like dog/squirrel/chicken/pig, then autonomously forages bananas — same "forage fills the player's inventory, GIVE converts inventory → level" pattern every other food/water forager already uses, so the existing generic nearest-item forage-targeting code in `Pet.update()` needed zero changes; Region 8's banana pool is fed into the pet-update loop's "food" slot specifically for Region 8 (`main.js`), letting monkeys reuse that code path unmodified. GIVE-button feeding consumes `inventory.bananas` one at a time via a new `pet.type === 'monkey'` branch in `executeContinuousFeed()` (`input.js`), same shape as how bear consumes honey.
- **Base Exp 50 bananas** (`baseMap.monkey = 50` in `getLevelRequirement()`, `state.js` — level-1 requirement lands exactly on 50 since `Math.pow(1, 1.2) === 1`). Single-resource pet (no food/water split), same bucket as bee/bear.
- **Forage yield** (`FORAGE_TIERS.monkey`): +1 banana base → +2 (Lv5) → +3 (Lv10) → +4 (Lv15) → +6 (Lv20), matching the spec exactly at every level boundary. The tier table's unused "water" slot is always 0, kept only for shape-compatibility with `getForageYield()`.
- **Lv20 perk — vine swinging:** 5% chance per successful forage to enter a new `swinging` state for 20s (own hanging-from-a-vine pose in `draw()` — both arms up gripping a vine drawn above it — vs. the normal resting pose), then pays out 5 coins via the existing `spawnCoinPopup()` system once the timer runs out.
- Codex: two new entries (`viewMonkey1`/`viewMonkey2`, `infoMonkey1`/`infoMonkey2`, `renameBoxMonkey1`/`renameBoxMonkey2` in `index.html`) mirroring the existing bear1/bear2 two-slot pattern — single-resource "🍌 X Bananas" requirement text, gated behind the same jungle-tier lock as the panda, `?/20`/`???` until tamed.

**Changed:**
- **`isRegion7Unlocked()` renamed to `isJungleTierUnlocked()`** (`world.js`) since it now gates two regions, not one — Region 7 and Region 8 share the exact same unlock condition by design (pets in Regions 1-3 at Lv10+, pets in Regions 4-6 at Lv5+). All call sites updated (`main.js`, `input.js`, `ui.js`); `isRegionUnlocked(r)` extended to route both `r === 7` and `r === 8` through it.
- Region loop bounds extended from `<= 7` to `<= 8` everywhere a region range was hardcoded (`main.js`'s render/update loop, `world.js`'s `homeRegion`-backfill loop and `processSpawns()`'s top-up loop).
- `ALL_REGIONS` (the bird's Lv20 excursion target list) deliberately still stops at 6 — Region 8 is excluded for the same reason Region 7 already was (gated behind a much higher unlock condition than the bird's own Lv20 requirement).
- Region 8 dropdown option and 3 starting bananas added via the same "build it in JS, no HTML edit needed" approach already used for Regions 6/7 (`main.js`, end of startup sequence).

**Verification:** `node --check` on every touched file, an HTML tag-balance parser pass on `index.html`, and a script that cross-referenced every `getElementById()` call across all JS files against `index.html`'s actual `id` attributes to confirm no Monkey-related lookup was left dangling.

---

### 2026-09-19 (4) — New pet: Bow Bear (female, Region 5)

**Added:**
- Second bear in Region 5, **Bow Bear** — same brown color, same `type: 'bear'` (so base Exp requirement, fishing start/cooldown/yield are all automatically identical to the original bear with zero extra code, since every bear mechanic is driven purely by `type === 'bear'`), a model scaled to ~85% size, and a pink bow (two triangles + a knot) drawn above its ears. New `isFemaleBear` flag on `Pet`, set via `createBear()`'s new `options.female` param (`world.js`); scale/bow rendering lives entirely in `entities.js`'s `draw()` and mirrored in `ui.js`'s `renderMiniPet()` for the Codex thumbnail.
- Codex split from one BEAR card into **BEAR 1 / BEAR 2** entries (`index.html`), mirroring the existing two-pig pattern in `ui.js`'s `updateCodexData()`. Rename bindings updated to match (`btnRenameBear1`/`btnRenameBear2`).
- Every pet is now tagged with a `homeRegion` at creation (`world.js`), used for gating things that must only happen/show while the player is looking at that pet's region.

**Verified:** positional per-region-array save/load (already generic, same mechanism that already handles the two pigs) needed **no changes** to persist the second bear — confirmed by trace rather than by adding redundant code.

---

### 2026-09-19 (3) — Consolidated PETS/BAG/CHAR into one MENU button

**Changed:**
- Replaced the three separate top-left buttons (🐾 PETS, 🎒 BAG, 🧑 CHAR) with a single **☰ MENU** button in PETS' old spot. Opens a new full-screen `#menuOverlay` (orange gradient background, sized to the entire `gameContainer` — covers the topBar too, not just the canvas) containing the same three buttons, unchanged element ids, so their existing `handleOpenCodex`/`handleOpenBag`/`handleOpenCharacter` logic needed **zero changes** — only their DOM location moved.
- The game loop keeps running behind the menu (pets keep foraging, timers keep ticking) — it's a purely visual/interactive block, not a pause. Opening PETS/BAG/CHAR from inside the menu layers that screen on top (`z-index: 10000` vs. the menu's `9000`); closing it reveals the menu again underneath rather than dropping straight back to gameplay, since the menu is never actually hidden while a sub-screen is open.
- New `handleOpenMenu()`/`handleCloseMenu()` in `ui.js`, bound the same `touchstart`/`mousedown` way as every other overlay button.

---

### 2026-09-19 (2) — Character XP progress bar, pet coin-reward popups, GIVE button reliability + feed speed

**Added:**
- **Character XP bar:** the LV./XP badge in the top HUD now fills left-to-right with a light-blue gradient as XP approaches the next level — same visual language as the progress bar already drawn above a pet's head. New `.charXPBarFill`/`.charBadgeContent` layered divs (`index.html`/`style.css`), width recalculated every `updateUI()` call (`ui.js`) from `character.xp / getCharacterNextXP(character.level)`.
- **Coin-reward popups:** a floating "+N 🪙" now appears above a pet right after it pays out coins — dog's dig (+1), elephant's tag catch (+5), pig's mud-play (+2/+4), bird's excursion return (+2), cat's correct Schrödinger guess (+10), panda's Bamboo Fever payout (variable). New `spawnCoinPopup()`/`updateCoinPopups()`/`drawCoinPopups()` in `world.js`, following the exact same one-shot/region-tagged pattern as the existing `spawnRegionFX()` — necessary because a pet's coin event can fire while the player is looking at a completely different region (pets simulate in the background), so popups only render once the player is actually looking at the region they belong to.

**Fixed:**
- **GIVE button intermittently not registering / stopping mid-hold.** Root cause: the button listened for `pointerleave` to end a hold, but on touch, ordinary finger micro-movement during a hold (still very much on the screen) fires a real `pointerleave` the instant it crosses the button's edge — read as "the player let go." Fixed by calling `setPointerCapture(e.pointerId)` on `pointerdown` (`input.js`), which keeps all subsequent events targeted at the button regardless of where the finger drifts; added a `lostpointercapture` listener as a fallback safety net.
- **Feed speed didn't scale with a pet's actual requirement.** Was a flat 1→3→8→25 units/tick ramp regardless of how much a pet's current level actually needed, so a high-level pet needing hundreds of food/water took noticeably longer to fill than a low one needing a handful. Replaced with **percentage-of-remaining-requirement** tiers (~1% → 2.5% → 4.7% per 100ms tick, at the same 0.5s/1.5s/3s hold thresholds as before) in `executeContinuousFeed()`, so holding at max speed fills the progress bar in ~3 seconds regardless of the pet's actual requirement size.

---

### 2026-09-19 (1) — Bug-fix batch: mini-game pickers following region switches, panda Bamboo Fever timing, panda flee-state corner-pinning, bird excursions to locked regions

**Fixed:**
- **Schrödinger/Bamboo Fever pickers stayed on screen and followed the player to other regions.** Both are fixed-position DOM overlays, not tied to the canvas — nothing was hiding them on a region switch (only the whistle picker already was). Added `hideSchrodingerPicker()`/`hideBambooFeverPicker()` calls to `input.js`'s region-select handler. Bamboo Fever's picker, unlike Schrödinger's, opens automatically with no proximity-based re-open once dismissed, so also reset any panda caught in `bamboo_wait` back to `wander` on switch-away — otherwise it would be stuck frozen forever with no way to resume the choice.
- **Panda's `full` (sleep) state showed *during* the Bamboo Fever minigame instead of after it finished.** Reordered: choosing Play now resumes normal wander/forage for the panda while the 30s round plays out; `world.js`'s `updateBambooFever()` sets `state = 'full'` (with the 💤 overlay) only once the round actually ends, via a `bambooFever.panda` reference stored when the round starts. Added a guard against a second Bamboo Fever re-triggering mid-round, now that the panda forages normally (and could otherwise re-roll the 5% chance) during it.
- **Panda's `abandoned` (Starve) flee state got pinned in a screen corner instead of continuing to evade.** "Directly away from the player" naturally funnels it into whichever corner happens to be opposite the player's position, and once both axes hit the wall it has nowhere left to go even as the player keeps closing the distance. Added a wall-repulsion term to the flee vector so it steers off/along edges instead of parking in one spot.
- **Bird's Lv20 excursion perk could fly to a region the player hadn't actually unlocked** (e.g. Region 6 before taming Regions 1-3) — it only checked its own Lv20 requirement, not the player's actual unlock progress. Filtered its destination-choice list through the (newly shared) `isRegionUnlocked()`.

**Changed:**
- New shared `isRegionUnlocked(r)`/`areRegions1to3Tamed()` helpers in `world.js`, replacing duplicated unlock-check logic that had drifted into three separate places (`main.js`'s render loop, `ui.js`'s Codex lock display) — same "single source of truth" pattern as `isRegion7Unlocked()`/`getCharacterBonuses()`.

**Verification:** `node --check` on every touched file, manual trace of the region-switch handler confirming both pickers and the panda's state reset correctly.

---

### 2026-09-17 (1) — Bug-fix batch: Schrödinger region gate, locked-region spoilers, Codex mystery state, resource XP ratio, Region 7 requirement, bee/bear state labels, cat/bear perk levels & copy

**Fixed:**
- **Cat's Schrödinger roll ignored the player's location.** The 3% Lv20 chance was rolling regardless of which region the player was actually standing in — inconsistent with the panda's Bamboo Fever, which correctly only rolls while the player is in Region 7. Added the same `currentRegion === 1` guard (the cat lives in Region 1) so the box can only open while the player is there to see it.
- **Locked-region alerts leaked the destination's theme.** The Region 7 alert said "...to unlock the Panda's habitat," naming the pet/theme before the player had ever unlocked it. Reworded both `input.js` alerts (Region 7 and the shared Region 4-6 one) to state only the numeric requirement and say "this region," never the region's identity.
- **Codex showed real level/requirement numbers for untamed starter pets.** Dog, cat, bird, elephant, squirrel, and chicken (the six pets that live in Regions 1-3) showed `Level: 1/20` and their real next-level food/water cost even while still `WILD` (untamed) — spoiling info that should stay hidden, and inconsistent with how bee/bear/pig/panda already show `?/20` / `???` while locked. All six now show `?/20` and `???` until Level 2+, matching the others.
- **Manual resource pickup always granted a flat +1 XP**, regardless of how much food/water the pickup actually granted (character-level bonuses can push a single pickup above 1). Changed `world.js`'s food/water collision handlers to call `gainPlayerXP()` with the actual post-multiplier amount collected, so a 3-water pickup grants +3 XP, not +1. (Egg pickups and per-unit feeding XP are unaffected — those were already 1:1 with a real unit each.)

**Changed:**
- **Region 7 unlock requirement reworked**: was "every pet in Regions 1-6 at Level 10+"; now **pets in Regions 1-3 must be Level 10+, and pets in Regions 4-6 must be Level 5+** — a deliberately lighter bar for the bee/bear/pig tier. Factored into a single new shared function, `isRegion7Unlocked()` in `world.js`, replacing three previously-separate (and now old-requirement) copies of this check in `main.js` (render/update gating), `input.js` (region-select gate + alert), and `ui.js` (Codex lock display) — same "single source of truth" pattern already used for `getCharacterBonuses()`.
- **Bee state label cleanup**: the on-map tag under a bee's name showed the raw internal state name — `[TRAVEL]` while flying to a flower, `[RETURN_HIVE]` while flying back to deposit honey. Both now display `[FORAGE]`, since from the player's perspective both legs are just "the bee is out foraging." Applies to all bees (starter + purchased), since it's handled once in the shared `Pet.draw()` label logic rather than per-instance.
- **Bear state label cleanup**: same idea — `[FISHING_TRAVEL]` (walking to the lake) now displays `[FISHING]`, matching the label already shown once it arrives and starts actually fishing.
- **Cat's double-yield perk moved from "always active" to Level 15+.** The 10% chance to double a forage's food/water was rolling from level 1 onward with no gate at all; it's now correctly gated behind `this.level >= 15`, and the Codex perk list entry moved from `Lv.1` to `Lv.15` to match.
- **Bear perks renumbered and fishing now actually gated to match:**
    - Lv.5 (was Lv.2 / effectively "as soon as tamed"): fishing itself doesn't start until now — below Lv.5 the bear is tame and wanders normally but never queues a fishing trip. Catches 1 fish per cycle.
    - Lv.10 (was Lv.3): fishing cycle cooldown speeds up; catch also increases to 3 fish per cycle (this fish-count threshold was already Lv.10 in the underlying code — only the cooldown-speedup level number moved to match it).
    - Lv.15 (was Lv.5): fishing cycle cooldown speeds up further.
    - Lv.20 (unchanged): 10% chance of a double catch (up to 6 fish).
    - The Codex's Fishing yield line now states the actual numbers ("catches 1 fish per cycle... 3 from level 10... 10% chance of a double catch" at 20) instead of the vague "faster at higher levels."
- **Perk-list copy simplified/corrected per request**, no mechanic change unless noted above:
    - Bird Lv.20: shortened to "5% chance per forage to fly off to a random region" (full mechanic — the +20% regional bonus, the Region 4/5 special cases, the +2 coin return — is unchanged and still documented above and in the 2026-09-16 (8) entry, just no longer spelled out in the short Codex perk line).
    - Pig Lv.20 (both colors): shortened to "5% chance per forage to play in mud +2 coins." The underlying 5%-chance-to-double-to-4 roll is **unchanged in code** — only the short Codex summary was trimmed.
    - Cat Lv.20: reworded to "3% chance per forage to enter Schrödinger's state" (was a longer sentence spelling out the Dead/Alive picker and coin payout).
    - Bee: Lv.5/10/20 perk lines now also call out that time-to-forage-a-flower drops at each of those levels (5.0s → 4.5s → 4.0s → 3.0s) alongside the existing honey-capacity increases. Travel speed to the flower and back to the hive is constant regardless of level, so that part was deliberately *not* claimed as reduced.

**Verification method:** `node --check` on every touched file (`entities.js`, `world.js`, `main.js`, `input.js`, `ui.js`), and a manual trace confirming `main.js`/`input.js`/`ui.js` all now call the same `isRegion7Unlocked()` rather than keeping their own copies of the threshold logic.

---

### 2026-09-16 (10) — New region: Region 7 (Panda habitat) + New pet: Panda + "Bamboo Fever" minigame

**Added:**
- **Region 7**, shown as "Region 7" in the dropdown, a bamboo/tree habitat (new background art in `main.js`: forest-green ground, six bamboo groves, and a row of trees reusing Region 5's tree-drawing style). Seeded with food/water spawns like Regions 1/2/3/6 (`FOOD_WATER_REGIONS` now includes 7).
- **New pet: Panda**, tames at level 2 and forages autonomously exactly like every other food/water-region pet — no new state-machine plumbing needed for that part.
- **Forage tiers** (`FORAGE_TIERS.panda`): +3/+2 base → +4/+3 (Lv5) → +5/+4 (Lv10) → +6/+5 (Lv15) → +8/+6 (Lv20), matching the spec exactly at every boundary. Level-1 requirement is 60 food / 60 water (`baseMap.panda = 120`, split 50/50).
- **New, stricter region-lock condition:** Region 7 requires **every pet across Regions 1-6** (not just Regions 1-3) to be **Level 10+** — separate from, and in addition to, the existing Regions-1-3-tamed gate that Regions 4-6 already use. Enforced in three places that all needed updating: `input.js` (the dropdown's `change` handler — blocks the switch with an explanatory alert), `main.js` (the pet update/draw loop — Region 7's pets simply don't animate until unlocked, mirroring how 4-6 already freeze if 1-3 aren't tamed), and `ui.js` (the Codex card shows a `???`/LOCKED placeholder, same visual treatment as the pigs before Region 6 unlocks).
- **Lv20 perk — "Bamboo Fever":** 5% chance per successful forage, but **only rolls while the player is standing in Region 7** (per spec — the chance itself is gated on the player's location, not just the event's visibility). Opens a Play/Starve picker (same dynamically-built pattern as the whistle/Schrödinger pickers) and freezes the panda (`bamboo_wait` state) until answered:
    - **Play:** starts a 30-second bamboo-collection round (`startBambooFever()` in `world.js`) — 10 bamboo stalks spawn on the map, replenished as collected so there's always something to chase; a small on-canvas HUD shows the running count and countdown. Every 5 collected pays 1 coin, calculated once at the end (`Math.floor(collected / 5)`), with a result toast. The panda itself enters a `full` state for 20 seconds in parallel — asleep, motionless, 💤 above its head.
    - **Starve:** panda enters an `abandoned` state for 30 seconds — 😢 above its head, continuously moves away from the player's current position (clamped to stay on-canvas) so it's always "running away" the closer the player gets, exactly as described.
- New panda sprite (white body, black ears/eye-patches/legs) — full-size (with the 💤/😢 state overlays) and Codex mini-portrait versions.
- New Codex card, perk description, and rename binding, following the existing per-pet pattern.

**Scope decisions worth flagging:**
- The bird's Lv20 excursion perk (2026-09-16 (8)) does **not** treat Region 7 as a valid random destination — it's gated behind a much higher unlock condition than the bird itself needs, so letting it wander in there before the player has actually unlocked the panda's habitat would be a strange inconsistency. `ALL_REGIONS` (the bird's candidate list) was deliberately left at `[1,2,3,4,5,6]`.
- Like the bird's excursion state and the cat's Schrödinger state before it, the panda's `bamboo_wait`/`full`/`abandoned` states and the live Bamboo Fever round (`bambooFever` in `world.js`) are **not persisted** — a reload mid-event simply resets the panda to `wander` and clears any in-progress round. This is consistent with how pet `state` has never been part of the save format for *any* pet (it already always resets to the constructor default on load), so this isn't a new category of simplification, just confirming the panda doesn't need special-casing here.

**Verification method:** `node --check` on every touched file, `index.html` div-balance and ID-existence checks, and a manual trace confirming the three separate Region 7 lock-condition checks (`input.js`/`main.js`/`ui.js`) all use the identical "every pet in Regions 1-6 at Lv10+" logic so they can't disagree about whether the region is actually unlocked.

---

### 2026-09-16 (9) — Polish pass: button sizing, cat defaults, spacing, Schrödinger gate, perk checkmarks

**Fixed:**
- **Cat's Schrödinger state had no level gate at all** (same class of bug as the pig mud-play fix in 2026-09-16 (5)) — could trigger starting at level 1 instead of level 20. Added the `this.level >= 20 &&` check, and corrected the Codex perk description from `level: 1` to `level: 20` to match.

**Changed:**
- 🧑 CHARACTER button label shortened to "🧑 CHAR" so its width matches 🎒 BAG (the overlay's own header still reads "CHARACTER" in full).
- Cat's default name changed from "Tabby" to "Cat".
- Squirrel/chicken default spacing in Region 3 now mirrors the pigs' pattern exactly — both at the same y with a 150px x-gap (130/280) — instead of the previous 60px gap (200/260). Bird's fixed spawn point (140, 280) was already clear of both at the old spacing and remains clear at the new one (200px y-gap between the bird and squirrel/chicken's row).
- Removed the ✓ checkmark from both the pet perk checklist (`showPetDetail()`) and the new Character screen's perk checklist — the green highlight color alone now signifies a reached milestone, per feedback that the two signals were redundant.

**Verification method:** `node --check` on all touched files, `index.html` div-balance check, and a `grep` confirming zero remaining ✓/✔ characters in `ui.js`.

---

### 2026-09-16 (8) — New pet: Bird (Region 3) + regional excursion mechanic

**Added:**
- **New pet: Bird**, Region 3 alongside the squirrel and chicken, spawned 60–90px clear of both (no sprite overlap). Tames at level 2 and forages food/water autonomously exactly like every other Regions 1–3 pet — no new state-machine plumbing needed for that part, same as the cat.
- **Forage tiers** (`FORAGE_TIERS.bird` in `state.js`): +1/+1 base, +2/+1 at Lv5, +2/+2 at Lv10, +3/+2 at Lv15, +4/+3 at Lv20 — matches the spec exactly at every boundary. Level-1 requirement is 25 food / 25 water (`baseMap.bird = 50` in `getLevelRequirement()`, split 50/50 — same trick used for the cat's 20/20).
- **Lv20 perk — regional excursion:** 5% chance per successful forage (checked only while at home, so it can't retrigger mid-trip) to fly to a random region other than its home (Region 3) for 60 seconds:
    - **Food/water regions (1, 2, 6):** forages normally there with a +20% bonus on top of the usual character-level bonus (stacks multiplicatively).
    - **Region 5 (bear's lake):** doesn't forage — instead rolls a 10% fish-catch chance **every whole second** it's present (accumulator-based so it can't skip rolls on a slow frame), for the full 60s. Not capped — can catch more than one fish per trip.
    - **Region 4 (hive):** applies a one-time +20% speed boost to every bee currently in the region for the duration of the visit (tracked per-bee via a `_birdBoosted` flag so it can't be double-applied or under-reverted), reverted the instant the bird leaves.
    - Always returns home after 60s with **+2 coins**, regardless of which region it visited.
- **Visual effects:** a small expanding/fading "poof" burst (`spawnRegionFX()`/`updateRegionFX()`/`drawRegionFX()`, new in `world.js`) fires at both ends of *every* leg of the trip — depart-burst wherever the bird just vanished from, arrive-burst wherever it just appeared — but only actually renders if the player is currently looking at that specific region. This means: proc while standing in Region 3 → you see it fly away; proc while standing in whatever region it randomly picked → you see it land; same pair plays symmetrically on the way back 60s later. Effects are a generic per-region list, not attached to the bird object (it isn't "in" a region at the exact instant a burst fires), drawn every frame alongside the pet loop in `main.js`.
- **How the "physically visiting another region" trick works:** the bird is spliced out of `petsByRegion[3]` and pushed into `petsByRegion[targetRegion]` for the duration, then spliced back on return. This isn't a special case — it's exactly how `main.js`'s existing per-region update/draw loop already expects pets to be organized, so the bird correctly forages using that region's actual food/water pools and is only drawn when the player is actually viewing wherever it currently, physically, is.
- **New pet-only sprite:** small round black body, dark wing, orange beak, pointed tail, subtle idle bob. Full-size and Codex mini-portrait versions added.
- **New Codex card** (`viewBird`/`infoBird`/`renameBoxBird` in `index.html`) — shows `(away)` next to its TAMED status while on an excursion. Rename button uses a dedicated handler (not the generic `bindPetRename()`) since it may not be sitting in its default array slot while away.

**Save/load — the one genuinely tricky part of this feature:**
- Every other pet lives at a fixed `[region][index]` slot forever. The bird doesn't — it's temporarily elsewhere for up to 60s at a time, which matters if an autosave (every 10s) lands mid-trip. Handled by giving the bird a **permanent reference** (`birdPet` in `world.js`, independent of which array currently holds it) and saving/restoring it **separately** from the normal per-region arrays rather than trying to make the positional save format account for a pet that moves: `saveGameProgress()` filters any `type === 'bird'` entry out of every region's array and writes a standalone `stateMatrix.birdData` (label/level/foodEaten/waterEaten only); `loadGameProgress()` applies that directly to the always-present default bird object.
- **Deliberate simplification:** an in-progress excursion (which region, remaining timer, any live bee-speed boost) is **not** resumed across a reload — the bird always comes back home at rest, `excursionActive: false`. Given a 60-second window, the odds of a reload landing mid-trip are low, and correctly resuming (including re-finding and re-verifying which bees still have a boost flag that's actually theirs) added meaningfully more risk than the feature's value justified. Flagging this explicitly in case a future request wants true resume-on-load.
- One more small correctness fix that fell out of this: a bird that teleports between regions mid-frame (inside its own `update()` call) would otherwise flash for exactly one frame at its new region's coordinates while the canvas is still showing the region it just left, because `main.js`'s draw call for that frame was already dispatched based on the pre-teleport region. Added a `_justTeleported` one-shot flag, checked at the top of `draw()`, to skip that single frame cleanly.

**Verification method:** manual trace of the state machine (confirmed the array-splice-during-forEach doesn't skip sibling pets, since the bird is always pushed to — and therefore spliced from — the *end* of whichever array it's in) plus `node --check` on every touched file and an `index.html` div-balance/ID-existence pass. No automated test harness was built for this round (none of this session's turns have used one) — noting this plainly since the pre-2026-09-16-session entries below describe a `vm`-based harness that hasn't been maintained or re-run since.

---

### 2026-09-16 (7) — New screen: Character (name, level, live bonuses, perk checklist)

**Added:**
- **🧑 CHARACTER button**, positioned directly beneath 🎒 BAG. Opens a new full-screen overlay (`characterOverlay` in `index.html`, styled to match the existing Codex/Bag overlays) showing:
    - **Editable name** — `character.name` (new field, defaults to `'Player'`; existing saves without it get backfilled on load) via the same rename-input-plus-button pattern already used for pets.
    - **Current level.**
    - **Live active bonuses** — food/water, honey, fish, and coin % gained from pets, plus the manual-gather %, read straight from `getCharacterBonuses(character.level)`.
    - **Full Lv5–50 perk checklist** (`CHARACTER_LEVEL_PERKS`, new in `state.js`) with already-reached milestones shown in green with a ✓ — same visual treatment as a pet's perk checklist in `showPetDetail()`.
- Screen refreshes live while open (guarded by a visibility check inside the already-every-frame `updateUI()` from the cat feature), so leveling up mid-session with it open updates immediately.

**Changed (refactor, no behavior change):**
- **Extracted the character-level bonus formulas into a single shared function**, `getCharacterBonuses(level)` in `state.js`, returning `{ petFoodWater, petHoney, petFish, coin, manualGather }`. `entities.js` (pet foraging bonuses) and `world.js` (manual pickup multiplier) were both duplicating this logic inline — now both call the shared function instead. This was done specifically so the new Character screen's displayed numbers are structurally guaranteed to match what's actually applied in gameplay, rather than being a second copy of the thresholds that could silently drift out of sync after a future balance change.
- Verified byte-for-byte equivalent output before/after the refactor at every threshold level (1, 4, 5, 14, 15, 24, 25, 29, 30, 34, 35, 39, 40, 44, 45, 49, 50).

---

### 2026-09-16 (6) — New pet: Cat (Region 1)

**Added:**
- **New pet: Cat**, Region 1 alongside the dog, spawned 150px clear (dog at x=110, cat at x=260, both y=220). Tames at level 2, forages food/water autonomously — same generic wander/forage pipeline every other land pet uses.
- **Forage tiers** (`FORAGE_TIERS.cat`): +1/+1 base → +2/+2 (Lv5) → +3/+3 (Lv10) → +4/+4 (Lv15) → +5/+5 (Lv20). Level-1 requirement is 20 food / 20 water (`baseMap.cat = 40`, split 50/50).
- **10% chance per forage to double** whatever food/water was just granted (applied after the character-level bonus, so e.g. a Lv20 cat's +5 water becomes +10 on a double).
- **3% chance per forage to enter a "Schrödinger" state** — freezes in place, alternates between two visual states (upright / flipped-upside-down via a canvas rotation, plus a purple glow ring) until the player approaches within 70px, at which point the interact button switches from GIVE to PLAY. Pressing it opens a Dead/Alive picker (built dynamically, same technique as the whistle picker); the outcome is randomized 50/50 the instant the box is entered (not when guessed). Correct guess: +10 coins and a result toast. Either way, the box resolves and the cat returns to wandering.
- **`updateUI()` now runs every single frame** (previously only after discrete events like feeding) — needed so the PLAY button appears/disappears in real time as the player walks toward/away from a boxed cat, rather than lagging until the next unrelated event. Confirmed cheap enough (a handful of `textContent` writes) to not be a performance concern, but flagging the change since it's a new "hot path" addition.
- New sprite (orange body, dark stripes, triangular ears) — full-size and Codex mini-portrait versions.
- New Codex card, perk descriptions, and rename binding, following the existing per-pet pattern exactly.

**Verification method:** `node --check` on every touched file, `index.html` div-balance and ID-existence checks, and a manual trace confirming the PLAY-button proximity check only fires while `currentRegion === 1` (so it can't falsely trigger from another region).

---

### 2026-09-16 (5) — Pig mud-play was missing its Lv20 gate

**Fixed:**
- **Pig's mud-play trigger had no level requirement at all** — `if (Math.random() < 0.05) { this.state = 'mud_play'; ... }` could fire starting at level 1, contradicting both the intended design (confirmed by the person) and the pattern every other rare-bonus-state pet uses (dog's digging, chicken's egg-laying — both explicitly gated at `level >= 20`). Added the missing `this.level >= 20 &&` check.
- Updated the pig's mud-play line in the Codex perk checklist (`getPetPerkDescriptions()`) from `level: 1` to `level: 20` to match, so the in-game description isn't contradicted by the actual behavior.

**Consulted, no change made (per explicit request):** whether confining mud-play to only trigger while the pig is standing inside the *visual* mud patch (currently purely decorative — mud-play can trigger anywhere in the region) would look good. Traced the actual fill colors: the mud patch (`#5c4326`/`#3e2f1c`) is very close in hue/luminance to the splash particles' own colors (`#6b4226`/`#3e2723`), so confining it there would likely make the effect harder to see, not easier, without also brightening the particle palette. Left the roam area exactly as-is per the person's decision.

---

### 2026-09-16 (4) — Touch input: joystick multitouch + Codex portrait scroll-vs-tap

**Fixed:**
- **Joystick would jump toward the GIVE button (or stop responding) whenever both were held at once.** Root cause: the joystick's `touchmove` handler blindly read `e.touches[0]` on every move, assuming that index always referred to its own finger — with a second touch down elsewhere (GIVE), `touches[0]` can be *that* touch instead, so the handle would visibly drag toward wherever GIVE was. Fixed by tracking the joystick's own touch via its `identifier` (captured on `touchstart`, matched explicitly on every subsequent `touchmove`/`touchend`/`touchcancel`) instead of assuming array position.
- **Joystick could get stuck pushing a direction indefinitely after lifting the finger, specifically in the APK build (WebIntoApp wrapper).** There was no `touchcancel` listener at all — only `touchend`. WebView wrappers commonly fire `touchcancel` instead of `touchend` when a touch is interrupted, so the direction flags never got reset. Added `touchcancel` handling, plus `blur`/`document.visibilitychange` listeners as a last-resort safety net (mirroring the pattern the GIVE button's hold-timer already used) so the joystick can't get stuck even if no touch-ending event ever arrives at all.
- **Pets Codex portrait would instantly open the detail popup the moment you touched it to start scrolling the list**, because it opened on raw `touchstart`. Replaced with real tap-vs-scroll detection: tracks finger position/time from `touchstart`, and only opens the popup on `touchend` if the finger stayed within ~10px and released within ~500ms (a genuine tap); anything that moves further is left alone to scroll normally.
- Added `touch-action: none` to `#interactBtn` in `style.css` so the browser/WebView can't intercept that touch as a page-gesture candidate, for the same multitouch-stability reasons as the joystick's existing `touch-action: none`.

**Verification method:** manual trace of the touch event sequence for the specific reported repro (hold GIVE, then touch joystick) confirming the identifier-based lookup returns the correct touch regardless of array order; `node --check` on all touched files.

---

### 2026-09-16 (3) — Region 6 Pig Sty Codex cards, restored 1%→10% level-bonus amendment, honey/fish bonus never applied

**Added:**
- The 2 pig Codex cards (`viewPig1`/`viewPig2` + info/rename boxes) that the 2026-09-16 Pig Sty entry below had flagged as the one remaining manual `index.html` step — added once the file was actually provided.

**Fixed:**
- **The person's earlier amendment to the character-level bonus system (multiplier per level: 1% → 10%) had only partially carried over into the files provided this session.** Cross-referenced against the full 10-milestone spec (Lv5/15/35/45 +30% food&water, Lv10/30 +25% honey, Lv20/40 +25% fish, Lv25/50 +25% coin) and found the actual code only had 4 of the 10 milestones, at the old lower percentages (5%/10% food-water, 3% honey, 3% fish, 1% coin) — rewrote the block to the full cumulative-stacking table. Separately, `world.js`'s manual-pickup multiplier was still literally `character.level * 0.01` — bumped to `0.10` to match "1% to 10%".
- **Real bug found while fixing the above, unrelated to the amendment itself: `petHoneyBonus` and `petFishBonus` were computed every tick but never actually multiplied into the honey/fish grants** — `inventory.honey += dropCount;` and `inventory.fish += fishCaught;` used the raw values, silently ignoring both bonus variables entirely. Fixed both lines to apply their respective bonus multiplier. This means the Lv10/20/30/40 honey/fish perks had never actually done anything until this fix, regardless of the 1%-vs-10% question.

**Verification method:** `node --check` on both touched files; manually recomputed the cumulative bonus at every milestone level (5, 10, 15, 20, 25, 30, 35, 40, 45, 50) against the spec table.

---

### 2026-09-16 (2) — Bear honey feeding granted no XP

**Fixed:**
- **Feeding the bear honey manually didn't grant character XP.** In `executeContinuousFeed()` (`input.js`), every other pet's manual-feed branch calls `gainPlayerXP(1)` once per resource unit actually given (matching pickup's 1:1 ratio). The bear branch was different: `gainPlayerXP(1)` was nested inside the "did this feed cause a level-up" check, so XP was only granted on the rare tick where a honey unit happened to be the one that crossed the level threshold — not per honey unit fed. Since a bear needs 30+ honey to level up at low levels, this made bear-feeding XP feel completely broken in normal play. Moved `gainPlayerXP(1)` out of the level-up conditional so it fires every time a honey unit is actually consumed, exactly matching the food/water branch's structure.

**Audited (per request) — confirmed sound, no changes needed:**
- All 6 XP-granting call sites (egg/food/water pickup in `world.js`; bear/food/water manual feed in `input.js`) now grant exactly `gainPlayerXP(1)` per resource unit, unconditionally, with zero coupling to any multiplier.
- `manualFoodMultiplier`/`manualWaterMultiplier` (`1 + character.level * 0.01`, in `checkCollisions()`) only scale the *inventory amount* gained per pickup — they've never touched the XP grant, which stays flat 1:1 per pickup event regardless of level.
- The auto-forage multipliers (`petFoodWaterBonus`, `petHoneyBonus`, `petFishBonus`, `coinBonus` — computed from `character.level` at the top of `Pet.update()`) only scale resource/coin amounts for *passive* pet foraging. `gainPlayerXP` is never called from `Pet.update()` at all — auto-forage has never granted player XP, by design (only manual pickup and manual feeding do), so there was no bonus/XP interaction to be unsound there.

**Verification method:** New permanent vm-harness test: feeds the bear a single honey unit (well below its level-up threshold) and confirms XP increases by exactly 1 immediately, repeats 3x to confirm it's not a one-off, and confirms honey consumption still matches 1:1. All 42 tests across the full suite pass, no regressions.

---

### 2026-09-16 — Pet Detail overlay + Region 6: Pig Sty

**Added — Pet Detail overlay (request: click a Codex portrait for details):**
- Clicking/tapping any revealed pet portrait in the Codex now opens a detail screen showing the pet's name, level, current foraging yield (or honey capacity / fishing for bee/bear), and a full level-perk checklist with perks the pet has already reached shown in green with a ✓.
- New in `ui.js`: `showPetDetail(pet)` / `hidePetDetail()` (built dynamically in JS, same technique as the whistle picker) and `getPetPerkDescriptions(type)`, which derives the numeric yield milestones straight from `FORAGE_TIERS` (so it can never drift out of sync with the real numbers) and appends the non-numeric perks (digging, egg-laying, play minigame, mud-play, honey capacity, fishing speed) by hand.
- Click/tap handlers are wired inside `renderMiniPet()` and rebuilt on every render call — deliberately not bound once-and-cached, because the same element ID can render a locked placeholder object first and the real pet object later, and a stale closure would keep pointing at the placeholder.
- **Works immediately for all 6 existing pets with zero HTML changes** — the portraits already exist in `index.html`; this just adds a listener to them.

**Added — Region 6: Pig Sty:**
- New region with 2 pigs (pink `Pig`, grey `Mud Pig`), spawning food/water the same way Regions 1-3 do. Locked behind the same "tame all Regions 1-3 pets to level 2+" requirement as Regions 4-5 (not explicitly specified either way — flagged in case a different unlock condition is wanted).
- **Leveling:** 50 food / 30 water required at level 1 (an intentional 62.5%/37.5% split, not the usual 50/50 or elephant's 45/55 — added as a `pig`-specific case in `getLevelRequirement()` in `state.js`), scaling up with the same level^1.2 curve as every other pet.
- **Forage yield tiers** (`FORAGE_TIERS.pig` in `state.js`): +2/+2 base, +3/+2 at Lv5, +4/+3 at Lv10, +5/+4 at Lv15, +7/+6 at Lv20 — exactly as specified, verified against the table at every boundary level.
- **Autonomous foraging** once tamed (level 2+) required zero new state-machine code — pigs reuse the exact same generic wander/forage/whistled pipeline every other land pet already uses, just with their own entry in the forage-yield chain.
- **Mud-play minigame:** 5% chance per successful forage to enter a 5-second `mud_play` state (mirrors the dog-digging architecture exactly — mud splash particles spawn during the countdown via a new `mudParticles` array, coins awarded exactly once at the end): 2 coins, with a 5% chance to double to 4.
- **Spawn positioning:** the two pigs start 150px apart (their sprite size is 36px, so more than 2x clearance) — verified untamed pets (level < 2) don't move *at all* until tamed (existing `if (this.level < 2) return;` gate in `Pet.update()`), so this spacing guarantees zero overlap before taming with no new collision-avoidance code needed.
- New `createPig()` factory in `world.js`, following the same "one factory, used everywhere a pig is created" pattern as `createBee()`/`createBear()`.
- Full-size and mini-portrait pig sprites added (pink/grey via the same "accent color" trick the squirrel sprite already uses for its two color variants).
- Region 6 pig-sty background (straw ground, fence posts, muddy pit) added to `main.js`'s per-region draw block.
- **Region 6 dropdown option is injected via JS** in `main.js`'s startup sequence (only if not already present) — consistent with this project's "build it in JS, don't require an HTML edit" pattern. **No `index.html` change needed to reach the region.**
- `processSpawns()`'s food/water refill logic was generalized from a hardcoded `r <= 3` range to a `FOOD_WATER_REGIONS = [1, 2, 3, 6]` array, so future regions with food/water don't need another hardcoded range edit.
- Save/load required **zero pig-specific code** — the per-region array save format (from the 2026-09-15 bee fix) already generically covers any region, and since pigs are a fixed 2-per-region (not purchasable/variable like bees), they don't need the "reconstruct extras beyond the default slots" logic either. Verified directly: saved a leveled/renamed pig, reloaded, confirmed it round-tripped correctly.
- **One HTML addition is still needed** (optional, gameplay works without it): the pig *Codex cards* — portrait canvas + info box + rename input — need 2 new elements in `index.html`, since the existing Codex is built around fixed per-species element IDs (`viewDog`, `infoDog`, etc.) rather than being fully data-driven. A copy-pasteable snippet is in `PIG_CODEX_HTML.md`. Until added, pigs simply don't appear in the Codex grid (safe no-op — `updateCodexData()`'s pig block checks for the elements before writing to them).

**Verification method:** vm-harness tests added for: forage yield at every tier boundary (1, 4, 5, 9, 10, 14, 15, 19, 20, 25) matching the spec exactly; level-1 requirement is exactly 50/30; the two pigs spawn >2x their size apart with different colors; an untamed pig's position is provably unchanged after 50 update ticks; a tamed pig's mud-play session ends with the state back to `wander`, awards either 2 or 4 coins, and finishes with zero leftover particles; the Region 6 dropdown option exists after boot without any HTML; clicking a mini-portrait opens the detail overlay with the correct name and level; and a full save→reload round-trip of pig level/label. All passing, alongside every prior round's tests (no regressions).

---

### 2026-09-15 (3) — Per-pet whistle picker

**Added:**
- **Whistle button now lets you choose which pet to call when a region has more than one eligible pet.** Previously `whistleBtn` toggled every non-bee, level-2+ pet in the current region at once. Region 3 (Squirrel + Chicken) is the only region with this today, but the fix is written generically so it applies automatically to any future region with 2+ pets. Behavior:
    - **1 eligible pet in the region:** unchanged — one tap toggles Call/Return directly, button text flips between `WHISTLE`/`RETURN` as before.
    - **2+ eligible pets:** tapping `WHISTLE` opens a small picker overlay listing each eligible pet by name with its own Call/Return button, so you can call just the squirrel, just the chicken, or both independently. A Close button dismisses it; switching regions also auto-hides it.
- New functions: `showWhistlePicker(pets)` / `hideWhistlePicker()` in `ui.js`. Built dynamically in JS (same technique as `showLevelUpToast()` in `state.js`) rather than declared in `index.html` — **no HTML changes needed** for this feature.
- `input.js`'s whistle click handler now filters to `eligiblePets` (non-bee, level ≥ 2) first, then branches on `eligiblePets.length` to decide direct-toggle vs. picker.

**Verified:** vm-harness test confirms clicking whistle in Region 3 does *not* call both pets at once, that tapping one pet's picker button doesn't affect the other, that both can be independently called, that the picker is hidden on region switch, and that single-pet regions (dog, bear) are unaffected — no regressions on the existing behavior.

---

### 2026-09-15 (2) — Bee capacity/hive bug, bear whistle, save-format redesign, forage tier table

**Fixed:**
- **Purchased bees never capped out or dropped honey at the hive.** Root cause: `Pet`'s constructor never initialized `honeyCarried`, so it only existed on the one hand-built starter bee — every bought bee had `honeyCarried === undefined`, and `undefined >= maxCapacity` is always `false`, so bought bees never entered the `return_hive` state. Fixed by giving `Pet` proper defaults (`honeyCarried`, `targetFlower`, `fishingTimer`, `fishingActionTimer`) in the constructor itself, and adding a shared `createBee()` factory in `world.js` so every bee — starter or purchased — is built identically. Also gave `Pet` a real `setNextFishingCooldown()` method and a `createBear()` factory (previously the bear's cooldown was a one-off function property hand-attached only to the single hardcoded bear instance).
- **Bear ignored the whistle button.** `input.js` explicitly excluded `bear` (alongside `bee`) from whistle handling, and the bear's AI block in `entities.js` had no `whistled`-state case at all — even if whistled, it would fall through to normal wander/fishing logic. Removed the exclusion and added a `whistled` handler to the bear block, placed before the fishing-timer countdown so being called back pauses the fishing cycle rather than getting overridden by it. Bee stays excluded (it has its own hive-return autonomy and already no-ops gracefully on `whistled`).
- **Bees vanishing / merging into each other on refresh.** `saveGameProgress()` stored pets in an object keyed by `pet.type` — since every bee shares type `'bee'`, each bee saved overwrote the previous one under the same key, so only the last bee processed actually got saved. On load, the sole surviving default bee took on whichever bee's stats were saved last (visually: "the main bee disappears, a worker bee stays" — it's actually the same object, relabeled), and any bees beyond the one hardcoded default were never recreated at all, since `petsByRegion[4]` is a fixed literal reset on every page load. Redesigned save/load to store pets as a **per-region array** (positional), and load now recreates any purchased pets beyond the default slots via `createBee()`. A legacy read-path was kept for saves made before this fix, so existing dog/elephant/squirrel/chicken/bear progress isn't lost — bee data from before this fix couldn't be recovered, since it was already corrupted by the type-key collision.
- **`bagOverlay` / `openBagBtn` / `bagClose` / `spawnBeeBtn`** in `ui.js` are now explicit `const document.getElementById(...)` declarations instead of relying on the browser's implicit "elements with an `id` become global variables" behavior.

**Changed:**
- **Forage yield tiers converted to a lookup table.** The repeated `if (level >= 20) ... else if (level >= 10) ...` chains for dog/elephant/squirrel/chicken forage amounts (~70 lines) became a `FORAGE_TIERS` table + `getForageYield(type, level)` helper in `state.js`. To raise the level cap or tune balance, add/edit a row in the table — no conditional restructuring needed. Perk logic that isn't just a food/water number (dog digging chance, chicken egg-laying) stays as its own `if (this.level >= X)` check in `Pet.update()`, since a table row can't express "10% chance to trigger a different state."

**Verification method:** Since this round touched save data and cross-pet interactions, I built a lightweight browser-DOM stub using Node's built-in `vm` module (no external dependencies — network access wasn't available to install a real headless-browser package) and ran the actual 6 game files through it, simulating: buying 2 worker bees, a bee filling up and flying home to drop off honey, whistling the bear, saving, simulating a full page refresh, and loading — 19 assertions, all passing, including one confirming a save made in the *old* format still loads correctly. I also brute-force-compared `getForageYield()` against the original if/else logic at every tier boundary (levels 1, 4, 5, 9, 10, 19, 20, 25) to confirm byte-identical output.

---

### 2026-09-15 — Level-up freeze fix + code cleanup + file split

**Fixed:**
- **Blocking `alert()` on character level-up** was the root cause of two reported symptoms: (1) resources draining without granting XP, and (2) pets appearing to "auto-consume" resources with no player input. `alert()` freezes the JS thread and steals touch focus; if the player was mid-hold on the GIVE button when it fired, the button's `pointerup` event was often lost, leaving the feed-hold `setInterval` running indefinitely, while `gainPlayerXP()`'s `isLevelingUp` guard silently dropped XP during the freeze. Replaced with a non-blocking on-screen toast (`showLevelUpToast()`) and removed the XP-dropping guard.
- Added safety-net event listeners (`pointerup`/`pointercancel` on `document`, `blur`, `visibilitychange`) so the feed-hold interval can never get stuck regardless of how the release event is lost.
- **Dog digging awarded 2 coins instead of 1**, and its dirt-particle animation never rendered — the payout block was gated on `stateTimer <= 0`, which made its own internal "spawn particles while timer > 0" check permanently unreachable. Restructured so particles play during the countdown and the coin is awarded exactly once at the end.
- **`updateUI()`** had a misplaced closing brace that nested the character level/XP display update inside the `interactBtn` existence check — harmless today (the button always exists) but fragile. Fixed.
- Removed dead code: `Pet.giveResources()` and `handleInteract()` were both completely unreferenced (confirmed via full-repo search) — `executeContinuousFeed()` is the actual, correct feeding implementation. Kept, unused, `giveResources()` never granted XP, so it was a landmine for reintroducing the original bug if anything ever called it.
- Removed two copy-paste duplicate blocks: an empty duplicate `fishing_travel` state check (bear), and a duplicated elephant "approach → retreat" transition block in `executeContinuousFeed()`.
- Removed a no-op loop in `checkCollisions()` (Region 4 flower proximity check that did nothing).

**Changed:**
- Split the single `game.js` (2300 lines) into 6 files by responsibility — see File Architecture above. Verified via diff that the split reproduces the original file exactly (whitespace only difference), and that each file plus the full concatenation pass `node --check`.

**Not changed (flagged for later, intentionally left alone):**
- The dog/elephant/squirrel/chicken foraging code has a repetitive `if level >= 20/10/5/else` pattern (~70 lines) that could collapse into a lookup table. Correct as-is, just verbose — deferred to avoid bundling a risky refactor into a bug-fix pass.
- The `bagOverlay`/`openBagBtn`/`bagClose` implicit-global quirk described above.
- The region-lock alert (`"Region locked!..."`) still uses blocking `alert()`. Lower risk than the level-up one since it's a single click, not a held interaction, but worth revisiting for consistency.
