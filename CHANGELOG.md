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
| `input.js` | Virtual joystick, GIVE/PLAY interact button (hold-to-feed with ramping `feedHoldCounter`), whistle button, region selector (+ region-lock check), keyboard controls, `executeContinuousFeed()` | `state.js`, `entities.js`, `world.js` |
| `ui.js` | `updateUI()`, `renderMiniPet()`, pet Codex overlay, settings/dev panel, pet renaming, bag overlay, bee-purchase button | `state.js`, `entities.js`, `world.js` |
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

**Other systems:**
- Joystick (touch) + WASD/arrow keys (desktop) movement, spacebar/E to feed.
- Whistle button: calls all eligible pets to the player.
- Pet Codex overlay: mini-canvas renders of each pet with their current stats.
- Settings/dev panel: add 50 food/water, wipe save, insta-max a region's pets to level 20 (dev/testing tools).
- Pet renaming via text inputs bound per pet slot.
- Bag overlay: shows "vault" resources (coins, eggs, honey, fish) separately from the pinned food/water HUD.
- Auto-save every 10 seconds, plus on most state-changing events (level-ups, pet levels, purchases).

---

## Changelog

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
