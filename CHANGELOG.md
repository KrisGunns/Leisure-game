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
| `state.js` | `inventory`, `character` (level/xp), `gainPlayerXP()`, `showLevelUpToast()`, `getLevelRequirement()`, `getCharacterNextXP()`, `FORAGE_TIERS` + `getForageYield()` (pet forage yield table), `saveGameProgress()`, `loadGameProgress()`, core DOM label refs | none (loads first) |
| `entities.js` | `Player`, `Item`, `Flower`, `Pet` classes (all pet AI/state-machine logic lives in `Pet.update()`) | `state.js` |
| `world.js` | The `player` instance, `regionalItems` (food/water/flower/egg pools per region), `petsByRegion` (pet roster per region), `region4Hive`, `createBee()`/`createBear()` factories, `resizeCanvas()`, `checkCollisions()`, `processSpawns()` | `state.js`, `entities.js` |
| `input.js` | Virtual joystick, GIVE/PLAY interact button (hold-to-feed with ramping `feedHoldCounter`), whistle button (single-tap toggle or multi-pet picker), region selector (+ region-lock check), keyboard controls, `executeContinuousFeed()` | `state.js`, `entities.js`, `world.js` |
| `ui.js` | `updateUI()`, `renderMiniPet()`, pet Codex overlay, settings/dev panel, pet renaming, bag overlay, bee-purchase button, whistle-picker overlay (`showWhistlePicker()`/`hideWhistlePicker()`) | `state.js`, `entities.js`, `world.js` |
| `main.js` | `gameLoop()` (render + update loop), startup sequence (`loadGameProgress()`, initial item spawns, `requestAnimationFrame` kickoff) | all of the above (loads last) |

**Why this order works:** each file's *immediately-executing* top-level code (variable declarations, `new Pet(...)`, event listener registration) only references things defined in earlier-loaded files. Anything referenced "out of order" — like `state.js`'s `gainPlayerXP()` calling `ui.js`'s `updateUI()` — is inside a function body, which isn't actually run until later gameplay, by which point every file has finished loading.

**Known quirk (not a bug, don't "fix" without care):** `bagOverlay`, `openBagBtn`, `bagClose` in `ui.js` are used but never explicitly declared with `let`/`const`. They work via the browser's automatic "DOM id → global variable" behavior (elements with an `id` attribute become bare global identifiers in non-strict, non-module scripts). This breaks if the scripts are ever converted to ES modules or given `'use strict'`. Left as-is intentionally.

---

## Current Features

**Regions:** 5 total, selected via a dropdown.
- Regions 1–3: starter pets (dog, elephant, squirrel + chicken respectively), food/water item spawns.
- Region 3 also spawns collectible eggs (from chickens reaching level 20).
- Region 4: bee hive — locked until every pet in Regions 1–3 is level 2+. Bees forage flowers, carry honey back to the hive, and cost 10 coins to spawn (max 3 bees).
- Region 5: bear — locked behind the same Regions 1–3 requirement. Bear fishes periodically for fish.
- Region 6: **Pig Sty** — locked behind the same Regions 1–3 requirement (flagged as an assumption, not explicitly specified). 2 pigs (pink `Pig`, grey `Mud Pig`), spawns food/water like Regions 1-3. See "Pig specifics" below.

**Pets:** dog, elephant, squirrel, chicken, bee, bear. Each has its own AI state machine in `Pet.update()` (wander/idle/forage/whistled/etc., plus type-specific states like `digging`, `fishing`, `playing_*`).

**Character progression:**
- Player has `level`/`xp`, separate from pet levels.
- Gains **+1 XP** for: walking over a food/water/egg drop on the map, or manually feeding a pet (holding the GIVE button).
- Level-up shows a non-blocking on-screen toast (not a blocking `alert()` — see Changelog).
- At certain character levels, pets get small passive bonuses to auto-foraged resource amounts (e.g. +5% at level 5, +10% at level 15) and manually-collected resources scale slightly with `character.level * 0.01`.

**Pet leveling:** each pet requires cumulative food/water (or honey, for bear) to level up, calculated via `getLevelRequirement()`. Pets level up either passively (auto-foraging map items) or via manual feeding (holding GIVE near a pet, which drains the player's food/water inventory).

**Pet-specific mechanics:**
- **Dog** (level 20): 10% chance per successful forage to enter a `digging` state — plays a dirt-particle animation, then awards 1 coin.
- **Elephant** (level 20, Region 2): 10% chance to trigger a multi-step "tag" minigame (approach → retreat → wait for player to move → chase) rewarding 5 coins if caught.
- **Chicken** (level 20): 5% chance per forage to lay an egg on the map (Region 3 only).
- **Bee**: forages flowers, carries honey (capacity scales with level: 1/2/3/5 at levels 1/5/10/20), returns to hive to deposit, then goes idle. Up to 3 bees total per save (the starter bee + 2 purchasable "Worker Bee" hires at 10 coins each via the hive's spawn button); all bees — starter or purchased — are built through the same `createBee()` factory so they behave identically.
- **Bear** (level 2+): travels to a lake, fishes for ~20s per cycle, yields more fish at higher levels (10% chance of double catch at level 20).
- **Pig** (either color): forages food/water like dog/squirrel/chicken (see `FORAGE_TIERS.pig` in `state.js`), no level-gated tier for its special perk — 5% chance per successful forage to enter a 5-second mud-play state, awarding 2 coins (5% chance to double to 4). Level-1 XP requirement is 50 food / 30 water (not a 50/50 split — see `getLevelRequirement()`'s pig-specific branch).

**Other systems:**
- Joystick (touch) + WASD/arrow keys (desktop) movement, spacebar/E to feed.
- Whistle button: calls eligible pets (non-bee, level 2+) to the player. In a region with one eligible pet, one tap toggles Call/Return directly. In a region with more than one (currently Region 3: Squirrel + Chicken), tapping whistle opens a picker so you can call specific pets independently rather than all at once.
- Pet Codex overlay: mini-canvas renders of each pet with their current stats. Clicking/tapping any revealed portrait opens a detail screen (name, level, current forage yield, full level-perk checklist with reached perks checked off).
- Settings/dev panel: add 50 food/water, wipe save, insta-max a region's pets to level 20 (dev/testing tools).
- Pet renaming via text inputs bound per pet slot.
- Bag overlay: shows "vault" resources (coins, eggs, honey, fish) separately from the pinned food/water HUD.
- Auto-save every 10 seconds, plus on most state-changing events (level-ups, pet levels, purchases).

---

## Changelog

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
