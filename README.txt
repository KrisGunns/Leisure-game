Where these go
--------------
Place the whole "assets" folder (this file's great-grandparent) at the ROOT of your
GitHub repo, alongside index.html / entities.js / ui.js / etc. — same level, not inside
any existing folder:

  your-repo/
    index.html
    entities.js
    ui.js
    ...
    assets/
      pets/
        dog/
          sit_0.png ... sit_3.png     (4-frame idle)
          walk_0.png ... walk_5.png   (6-frame walk cycle)
          dig_0.png ... dig_5.png     (6-frame digging cycle)
          portrait.png

The game references these by relative path (assets/pets/dog/sit_0.png etc.), exactly
the same way index.html already references entities.js — so as long as the assets
folder sits next to index.html, no other setup is needed. Nothing to configure, no
build step.

What happens if they're missing
--------------------------------
If a file 404s, or hasn't been deployed yet, the dog just keeps using its old hand-drawn
sprite for that animation — the game never breaks or shows a blank pet, it just quietly
falls back.

2026-09-26: COMPLETE REPLACEMENT — this is a new dog model
------------------------------------------------------------
Every file in this folder was replaced from scratch from a brand new reference sheet, at
the user's request, after several earlier sheets had walk/idle frames that looked
different in a raw pixel-diff percentage but turned out to be near-duplicate poses with
the legs/tail frozen in place (confirmed each time by zooming into the moving part, not
just trusting the percentage). This sheet is the first to pass that check on all three
animations:
- sit_0.png ... sit_3.png — 4-frame idle with real pose variety (mouth open, eyes closed,
  head down/curled, alert).
- walk_0.png ... walk_5.png — 6-frame walk cycle with the legs genuinely at a different
  point in the stride in every frame.
- dig_0.png ... dig_5.png — 6-frame digging cycle where the hole visibly deepens and
  widens across the sequence. The in-game dirt particle burst is a separate effect
  layered on top and is unaffected by this change.
- portrait.png — this sheet didn't include a dedicated portrait pose (a bigger, cleaner
  shot for the Codex/detail screens), so this is an upscaled copy of sit_0.png instead,
  kept on the same model/art style rather than reusing the previous portrait, which had a
  different (blue) collar and would have looked mismatched next to the rest.

Note this is a different model than every previous dog batch — most visibly, the collar
is now a plain gray/black collar with a square tag, instead of the earlier blue collar
with a round tag. If you have any old sit_2.png/sit_3.png/walk_2.png-walk_5.png files
from a prior batch still sitting in your repo, they're no longer referenced by
entities.js and can be deleted — nothing reads them anymore since every dog file in this
set was replaced.

Cache-busting: entities.js now appends "?v=v5" (PET_ASSET_VERSION) to every dog asset
path specifically because these filenames have been re-used with different contents
several times, which can cause a browser or GitHub Pages' CDN to keep serving an old
cached copy after a deploy. If you ever replace one of these PNGs again without renaming
it, bump PET_ASSET_VERSION in entities.js (e.g. 'v5' -> 'v6') so everyone's browser is
forced to fetch the new version.

2026-09-26 follow-up: fixed a sizing bug ("isn't transitioning smoothly / doesn't look
like the same dog")
-----------------------------------------------------------------------------------------
The first delivery of this sheet's art had a real bug, confirmed from your screen
recording of the live site: within EACH animation, every frame had been resized
independently to the exact same fixed pixel height (e.g. every idle frame forced to
48px tall, every dig frame forced to 40px tall), regardless of how tall that frame's
actual cropped artwork was before resizing. That's backwards — a frame that's naturally
a bit shorter (like the idle "head down/curled" pose, or the earliest dig frame before
the hole exists) got scaled UP more than a frame that's naturally taller, so the dog
visibly grew and shrank between consecutive frames of the same animation instead of
holding a consistent size.

The fix: each animation (sit/walk/dig) now uses ONE scale factor, applied uniformly to
every frame in that animation, derived from the average of that animation's frames'
natural (pre-resize) heights. This preserves real, intentional size differences between
poses — the idle curled-down frame is now correctly a bit smaller than the alert
sit-up-straight frames, and the dig hole/dog silhouette now grows smoothly across the
6 frames as it's meant to — while eliminating the frame-to-frame jitter that made it
look like the model kept changing. All 16 dog PNGs (sit/walk/dig) were regenerated this
way; portrait.png is unaffected structurally (still an upscaled sit_0.png) but was
regenerated from the corrected sit_0 source frame.

If you want a smoother animation from a future sheet
------------------------------------------------------
Judge each candidate sheet the same way this one was: zoom into the part of the body
that's supposed to move (legs for a walk cycle, the dug hole for digging, whatever
distinguishes the idle poses) and confirm it's genuinely different frame to frame. Don't
rely on a raw pixel-diff percentage between frames — image compression and shading noise
can make static frames look deceptively "different" in the numbers even when nothing
about the pose actually changed.
