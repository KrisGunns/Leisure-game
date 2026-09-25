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
          sit_0.png … sit_3.png     (4-frame idle)
          walk_0.png … walk_5.png   (6-frame walk cycle)
          portrait.png

The game references these by relative path (assets/pets/dog/sit_0.png etc.), exactly
the same way index.html already references entities.js — so as long as the assets
folder sits next to index.html, no other setup is needed. Nothing to configure, no
build step.

What happens if they're missing
--------------------------------
If a file 404s, or hasn't been deployed yet, the dog just keeps using its old hand-drawn
sprite for that animation — the game never breaks or shows a blank pet, it just quietly
falls back. So it's safe to deploy entities.js/ui.js before the assets folder if that's
easier for your workflow; the dog will look like before until the images land too.

What's in this set (replaces the pilot's first sit_0/1.png + walk_0/1.png)
----------------------------------------------------------------------------
- sit_0.png … sit_3.png — 4-frame idle, from the second reference sheet's fuller IDLE
  row. Also fixes a bug from the pilot: those first sprites had a few px of transparent
  padding left under the dog's feet by the cropping step, which made it look like it was
  hovering just above the ground. This batch is cropped flush to the feet.
- walk_0.png … walk_5.png — 6-frame walk cycle (was 2), for a noticeably smoother stride.
- portrait.png — unchanged from the pilot; still the larger pose used only for the
  Codex/pet-detail screens.
- Digging still has no matching pose on any reference sheet sent so far, so it's
  unchanged — still the old hand-drawn art.
