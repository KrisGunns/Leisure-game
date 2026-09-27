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
          dog.png       (single static sprite — used for sit, walk AND dig)
          portrait.png

The game references these by relative path (assets/pets/dog/dog.png etc.), exactly
the same way index.html already references entities.js — so as long as the assets
folder sits next to index.html, no other setup is needed. Nothing to configure, no
build step.

What happens if they're missing
--------------------------------
If a file 404s, or hasn't been deployed yet, the dog just keeps using its old hand-drawn
sprite for that animation — the game never breaks or shows a blank pet, it just quietly
falls back.

2026-09-26: SWITCHED TO A SINGLE STATIC IMAGE (no more per-animation sprite sheets)
------------------------------------------------------------------------------------
Every previous multi-frame sprite sheet for the dog (walk cycle, idle cycle, digging
cycle — several revisions of each) is GONE. At the user's request, after repeated
rounds of sheets that looked fine frame-by-frame but still read as janky in motion (near
duplicate poses, or — in the most recent sheet — real pose variety that broke because
each frame got resized to a different scale, making the dog appear to change size
between frames), the dog now uses ONE picture for every state:

- dog.png is used for sit, walk, AND dig. There's no animation frame array to keep in
  sync anymore — sit/walk/dig in entities.js's PET_IMAGE_PATHS.dog all point at this same
  file. Movement is shown the way it always was for direction: the game already flips the
  sprite horizontally based on which way the dog is facing (drawPetSprite's `facing`
  argument), so the dog turning around and sliding across the ground still looks
  correct — it's only the "does the dog itself visibly animate in place" part that's
  gone.
- Digging still visibly reads as digging in-game: the dirt-particle burst effect (little
  flying dirt specks) is a separate physics effect layered on top of the sprite in
  Pet.update()/Pet.draw(), completely unrelated to which image is drawn underneath it, so
  it keeps working exactly as before.
- portrait.png is a separate, higher-resolution version of the exact same source image
  (same pose, same file, just not downscaled to the tiny 36px in-world sprite size),
  used for the bigger Codex/detail view (see renderMiniPet() in ui.js) so the portrait
  and the in-world sprite are unmistakably the same dog.

If you have old sit_0.png...sit_3.png, walk_0.png...walk_5.png, or dig_0.png...dig_5.png
files from a previous batch still sitting in your repo's assets/pets/dog/ folder,
DELETE THEM — nothing in entities.js references them anymore, so they're just dead
weight in the repo.

Cache-busting: entities.js appends "?v=v6" (PET_ASSET_VERSION) to the dog asset paths,
because these filenames have been re-used with different contents several times, which
can cause a browser or GitHub Pages' CDN to keep serving an old cached copy after a
deploy. If you ever replace dog.png or portrait.png again without renaming them, bump
PET_ASSET_VERSION in entities.js (e.g. 'v6' -> 'v7') so everyone's browser is forced to
fetch the new version.

If you want to bring animation back later
--------------------------------------------
This isn't a dead end — PET_IMAGE_PATHS.dog.walk (etc.) is still a normal array; give it
multiple frame paths again and the walk cycle animates again, no other code changes
needed. If you try that again, judge each candidate sheet by (1) zooming into the part
of the body that's supposed to move and confirming it's genuinely different frame to
frame — not just a different pixel-diff percentage — and (2) resizing all of an
animation's frames by ONE shared scale factor (derived from their average raw height),
never independently to a fixed height per frame, since real poses in a good sheet
legitimately have different raw sizes on purpose.
