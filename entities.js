// ============================================================
// entities.js — Player, Item, Flower, and Pet classes.
// Depends on: state.js (canvas, ctx, inventory, character,
// getLevelRequirement, saveGameProgress). Load AFTER state.js.
// ============================================================

// ------------------------------------------------------------------
// THE PLAYER'S SPRITE — two selectable models (see character.model / the CHAR window's
// switch button): the original chibi girl in a white sundress, and a chibi boy in a blue
// t-shirt and dark pants. Each is a small pixel map so the art lives in code like everything
// else. Every frame is 16 columns x 24 rows of palette letters ('.' = transparent);
// Player.draw() paints them at PLAYER_SPRITE_SCALE (2 => a 32 x 48 px character; the hitbox
// stays 32 x 32) using whichever model's frames/palette match player.model.
//   idle: front-facing (2 frames — the girl's hand bobs while waving; the boy blinks)
//   walk: 4-frame cycle facing RIGHT, mirrored when walking left. Near leg/foot uses the
//         light skin/pants tone, the far one the shaded tone.
// To tweak a model's look, edit its palette below — nothing else needs to change. To add a
// third model: add its PLAYER_PALETTE_<NAME>/PLAYER_FRAMES_<NAME>, add it to
// PLAYER_MODELS below, and it's selectable everywhere (getPlayerSprite, the switch button).
// ------------------------------------------------------------------
const PLAYER_SPRITE_SCALE = 2;
const PLAYER_SPRITE_COLS = 16;
const PLAYER_SPRITE_ROWS = 24;
const PLAYER_STEP_PIXELS = 18;   // distance walked per walk-cycle frame (feet stay in step with the ground)
const PLAYER_WAVE_SECONDS = 0.45; // how long each idle waving pose lasts

const PLAYER_PALETTE_FEMALE = {
    K: '#141418',   // hair
    h: '#40404e',   // hair shine
    S: '#f9cfae',   // skin
    s: '#e3a684',   // skin, shaded (far arm/leg)
    B: '#f19696',   // blush
    M: '#d6404f',   // mouth
    E: '#2b2226',   // eyes (a soft dark brown-black, gentler than the hair)
    W: '#ffffff',   // dress
    w: '#dde4ef',   // dress shading
    o: '#aab6cc',   // dress outline (keeps the white dress readable on light ground)
    C: '#4b6fd6',   // hair clips
    T: '#cf9760',   // sandals
    t: '#8f5c35'    // sandal soles
};

const PLAYER_PALETTE_MALE = {
    K: '#5a4130',   // hair
    h: '#7a5a3f',   // hair highlight
    S: '#f0bd91',   // skin
    s: '#d99f71',   // skin, shaded (far arm/leg)
    E: '#241b15',   // eyes
    M: '#7a3b2e',   // mouth (open, happy)
    U: '#3f7fe0',   // t-shirt
    u: '#2f62b8',   // t-shirt shading
    P: '#26262e',   // pants
    p: '#1a1a20',   // pants shading (far leg)
    F: '#e9e9ee',   // shoes
    f: '#a7a7b0'    // shoe soles
};

const PLAYER_FRAMES_FEMALE = {
    idle: [
        [
            '...KKKKKKKKKK...',
            '..KKKhhKKKKhKK..',
            '..KKKKKKKKKKKC..',
            '..KKKKKKKKKKKK..',
            '..KKKKSSSSKKKC..',
            '..KKSSSSSSSSKK..',
            '..KSSSSSSSSSSK..',
            '..KSSESSSSESSK..',
            '..KSESESSESESK..',
            '..KSBSSMMSSBSSS.',
            '...KKSSSSSSKKSS.',
            '...KKKKSSKKKSS..',
            '..KKSSSSSSSSSK..',
            '..KKSWSSSSWSKK..',
            '..KKSWWWWWWKKK..',
            '..KKSWWWWWWKKK..',
            '..KKSSWWWWWWKK..',
            '..KoWWWWwWWWoK..',
            '..oWWWwWWwWWWo..',
            '.owwwwwwwwwwwwo.',
            '.....SS..SS.....',
            '.....SS..SS.....',
            '....TTT..TTT....',
            '....ttt..ttt....',
        ],
        [
            '...KKKKKKKKKK...',
            '..KKKhhKKKKhKK..',
            '..KKKKKKKKKKKC..',
            '..KKKKKKKKKKKK..',
            '..KKKKSSSSKKKC..',
            '..KKSSSSSSSSKK..',
            '..KSSSSSSSSSSK..',
            '..KSSESSSSESSK..',
            '..KSESESSESESK..',
            '..KSBSSMMSSBSK..',
            '...KKSSSSSSKKSS.',
            '...KKKKSSKKKKSS.',
            '..KKSSSSSSSSSK..',
            '..KKSWSSSSWSKK..',
            '..KKSWWWWWWKKK..',
            '..KKSWWWWWWKKK..',
            '..KKSSWWWWWWKK..',
            '..KoWWWWwWWWoK..',
            '..oWWWwWWwWWWo..',
            '.owwwwwwwwwwwwo.',
            '.....SS..SS.....',
            '.....SS..SS.....',
            '....TTT..TTT....',
            '....ttt..ttt....',
        ],
    ],
    walk: [
        [
            '...KKKKKKKKKK...',
            '..KKKhhKKKKhKK..',
            '..KKKKKKKKKKKK..',
            '..KKKKKKKKKKKC..',
            '..KKKKKKKSSSKC..',
            '..KKKKKKSSSSSK..',
            '..KKKKKSSSSSSK..',
            '..KKKKKSSESESK..',
            '..KKKKKSBSSSMK..',
            '..KKKKKKSSSSSK..',
            '..KKKKKKKSSSK...',
            '..KKKKKKKKSSKK..',
            '..KKSSSSSSSSKK..',
            '..KKSWSSSSWSKK..',
            '..KSKWWWWWWKSK..',
            '..KSKWWWWWWKSK..',
            '..KSKWWWWWWKSK..',
            '..KoWWWWwWWWoK..',
            '..oWWWwWWwWWWo..',
            '.owwwwwwwwwwwwo.',
            '....ss....SS....',
            '....ss....SS....',
            '...TTT....TTT...',
            '...ttt....ttt...',
        ],
        [
            '...KKKKKKKKKK...',
            '..KKKhhKKKKhKK..',
            '..KKKKKKKKKKKK..',
            '..KKKKKKKKKKKC..',
            '..KKKKKKKSSSKC..',
            '..KKKKKKSSSSSK..',
            '..KKKKKSSSSSSK..',
            '..KKKKKSSESESK..',
            '..KKKKKSBSSSMK..',
            '..KKKKKKSSSSSK..',
            '..KKKKKKKSSSK...',
            '..KKKKKKKKSSKK..',
            '..KKSSSSSSSSKK..',
            '..KKSWSSSSWSKK..',
            '..KKSWWWWWWSKK..',
            '..KKSWWWWWWSKK..',
            '..KKSWWWWWWSKK..',
            '..KoWWWWwWWWoK..',
            '..oWWWwWWwWWWo..',
            '.owwwwwwwwwwwwo.',
            '......ssSS......',
            '......ssSS......',
            '.....TTTTTT.....',
            '.....tttttt.....',
        ],
        [
            '...KKKKKKKKKK...',
            '..KKKhhKKKKhKK..',
            '..KKKKKKKKKKKK..',
            '..KKKKKKKKKKKC..',
            '..KKKKKKKSSSKC..',
            '..KKKKKKSSSSSK..',
            '..KKKKKSSSSSSK..',
            '..KKKKKSSESESK..',
            '..KKKKKSBSSSMK..',
            '..KKKKKKSSSSSK..',
            '..KKKKKKKSSSK...',
            '..KKKKKKKKSSKK..',
            '..KKSSSSSSSSKK..',
            '..KKSWSSSSWSKK..',
            '..KKKSWWWWSKKK..',
            '..KKKSWWWWSKKK..',
            '..KKKSWWWWSKKK..',
            '..KoWWWWwWWWoK..',
            '..oWWWwWWwWWWo..',
            '.owwwwwwwwwwwwo.',
            '....SS....ss....',
            '....SS....ss....',
            '...TTT....TTT...',
            '...ttt....ttt...',
        ],
        [
            '...KKKKKKKKKK...',
            '..KKKhhKKKKhKK..',
            '..KKKKKKKKKKKK..',
            '..KKKKKKKKKKKC..',
            '..KKKKKKKSSSKC..',
            '..KKKKKKSSSSSK..',
            '..KKKKKSSSSSSK..',
            '..KKKKKSSESESK..',
            '..KKKKKSBSSSMK..',
            '..KKKKKKSSSSSK..',
            '..KKKKKKKSSSK...',
            '..KKKKKKKKSSKK..',
            '..KKSSSSSSSSKK..',
            '..KKSWSSSSWSKK..',
            '..KKSWWWWWWSKK..',
            '..KKSWWWWWWSKK..',
            '..KKSWWWWWWSKK..',
            '..KoWWWWwWWWoK..',
            '..oWWWwWWwWWWo..',
            '.owwwwwwwwwwwwo.',
            '......ssSS......',
            '......ssSS......',
            '.....TTTTTT.....',
            '.....tttttt.....',
        ],
    ],
};

const PLAYER_FRAMES_MALE = {
    idle: [
        [
            '....KKKKKKKK....',
            '...KKKhKKhKKK...',
            '..KKKKKKKKKKK...',
            '..KKKKKKKKKKKK..',
            '..KKSSSSSSSKKK..',
            '..KSSSSSSSSSK...',
            '..KSSSSSSSSSK...',
            '..KSSESSSSESK...',
            '..KSSSSSSSSSK...',
            '..KSSSMMMSSSK...',
            '...KSSSSSSSK....',
            '....SSSSSSS.....',
            '...UUUUUUUUU....',
            '..UUUUUUUUUUU...',
            '..sUUUUUUUUUS...',
            '..sUUuUUUUUUS...',
            '..sUUuUUUUUUS...',
            '...UUUUUUUUU....',
            '...UUU...UUU....',
            '...PPP...PPP....',
            '...PPP...PPP....',
            '...PPP...PPP....',
            '...FFF...FFF....',
            '...fff...fff....',
        ],
        [
            '....KKKKKKKK....',
            '...KKKhKKhKKK...',
            '..KKKKKKKKKKK...',
            '..KKKKKKKKKKKK..',
            '..KKSSSSSSSKKK..',
            '..KSSSSSSSSSK...',
            '..KSSSSSSSSSK...',
            '..KSSESSSSESK...',
            '..KSSSSSSSSSK...',
            '..KSSSMMMSSSK...',
            '...KSSSSSSSK....',
            '....SSSSSSS.....',
            '...UUUUUUUUU....',
            '..UUUUUUUUUUU...',
            '..SUUUUUUUUUu...',
            '..SUUUUUUUuUu...',
            '..SUUUUUUUuUu...',
            '...UUUUUUUUU....',
            '...UUU...UUU....',
            '...PPP...PPP....',
            '...PPP...PPP....',
            '...PPP...PPP....',
            '...FFF...FFF....',
            '...fff...fff....',
        ],
    ],
    walk: [
        [
            '....KKKKKKKK....',
            '...KKKhKKhKKK...',
            '..KKKKKKKKKKK...',
            '..KKKKKKKKKKKK..',
            '..KKSSSSSSSKKK..',
            '..KSSSSSSSSSK...',
            '..KSSSSSSSSSK...',
            '..KSSESSSSESK...',
            '..KSSSSSSSSSK...',
            '..KSSSMMMSSSK...',
            '...KSSSSSSSK....',
            '....SSSSSSS.....',
            '...UUUUUUUUU....',
            '..UUUUUUUUUUU...',
            '..sUUUUUUUUUS...',
            '..sUUuUUUUUUS...',
            '..sUUuUUUUUUS...',
            '...UUUUUUUUU....',
            '....UUU.UUU.....',
            '...pPP...PPp....',
            '..pPP.....PPp...',
            '.pPP.......PPp..',
            'FFF.........FFF.',
            'fff.........fff.',
        ],
        [
            '....KKKKKKKK....',
            '...KKKhKKhKKK...',
            '..KKKKKKKKKKK...',
            '..KKKKKKKKKKKK..',
            '..KKSSSSSSSKKK..',
            '..KSSSSSSSSSK...',
            '..KSSSSSSSSSK...',
            '..KSSESSSSESK...',
            '..KSSSSSSSSSK...',
            '..KSSSMMMSSSK...',
            '...KSSSSSSSK....',
            '....SSSSSSS.....',
            '...UUUUUUUUU....',
            '..UUUUUUUUUUU...',
            '..sUUUUUUUUUS...',
            '..sUUuUUUUUUS...',
            '..sUUuUUUUUUS...',
            '...UUUUUUUUU....',
            '....UUU.UUU.....',
            '....PPP.PPP.....',
            '....PPP.PPP.....',
            '....PPP.PPP.....',
            '....FFF.FFF.....',
            '....fff.fff.....',
        ],
        [
            '....KKKKKKKK....',
            '...KKKhKKhKKK...',
            '..KKKKKKKKKKK...',
            '..KKKKKKKKKKKK..',
            '..KKSSSSSSSKKK..',
            '..KSSSSSSSSSK...',
            '..KSSSSSSSSSK...',
            '..KSSESSSSESK...',
            '..KSSSSSSSSSK...',
            '..KSSSMMMSSSK...',
            '...KSSSSSSSK....',
            '....SSSSSSS.....',
            '...UUUUUUUUU....',
            '..UUUUUUUUUUU...',
            '..SUUUUUUUUUs...',
            '..SUUUuUUUUus...',
            '..SUUUuUUUUus...',
            '...UUUUUUUUU....',
            '....UUU.UUU.....',
            '...Ppp...ppP....',
            '..Ppp.....ppP...',
            '.Ppp.......ppP..',
            'FFF.........FFF.',
            'fff.........fff.',
        ],
        [
            '....KKKKKKKK....',
            '...KKKhKKhKKK...',
            '..KKKKKKKKKKK...',
            '..KKKKKKKKKKKK..',
            '..KKSSSSSSSKKK..',
            '..KSSSSSSSSSK...',
            '..KSSSSSSSSSK...',
            '..KSSESSSSESK...',
            '..KSSSSSSSSSK...',
            '..KSSSMMMSSSK...',
            '...KSSSSSSSK....',
            '....SSSSSSS.....',
            '...UUUUUUUUU....',
            '..UUUUUUUUUUU...',
            '..sUUUUUUUUUS...',
            '..sUUuUUUUUUS...',
            '..sUUuUUUUUUS...',
            '...UUUUUUUUU....',
            '....UUU.UUU.....',
            '....PPP.PPP.....',
            '....PPP.PPP.....',
            '....PPP.PPP.....',
            '....FFF.FFF.....',
            '....fff.fff.....',
        ],
    ],
};

// Which model a name selects — add an entry here (and its PLAYER_PALETTE_<NAME> /
// PLAYER_FRAMES_<NAME> above) to make a new character model selectable.
const PLAYER_MODELS = {
    female: { palette: PLAYER_PALETTE_FEMALE, frames: PLAYER_FRAMES_FEMALE },
    male: { palette: PLAYER_PALETTE_MALE, frames: PLAYER_FRAMES_MALE }
};

// Each frame is rendered once per model into its own small offscreen canvas (built on first
// use), so drawing the player is a single drawImage() per frame instead of ~400 fillRects.
const playerSpriteCache = {};
function getPlayerSprite(kind, index, model) {
    const modelKey = PLAYER_MODELS[model] ? model : 'female';
    const key = modelKey + ':' + kind + index;
    if (playerSpriteCache[key]) return playerSpriteCache[key];
    const { palette, frames } = PLAYER_MODELS[modelKey];
    const rows = frames[kind][index];
    const c = document.createElement('canvas');
    c.width = PLAYER_SPRITE_COLS * PLAYER_SPRITE_SCALE;
    c.height = PLAYER_SPRITE_ROWS * PLAYER_SPRITE_SCALE;
    const cx = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
            const color = palette[rows[y][x]];
            if (!color) continue;
            cx.fillStyle = color;

            cx.fillRect(x * PLAYER_SPRITE_SCALE, y * PLAYER_SPRITE_SCALE, PLAYER_SPRITE_SCALE, PLAYER_SPRITE_SCALE);
        }
    }
    playerSpriteCache[key] = c;
    return c;
}

// ------------------------------------------------------------------
// PET SPRITES — the same pixel-art approach as the player above: small letter maps (one letter
// per pixel, '.' = transparent) painted at PET_SPRITE_SCALE and cached as offscreen canvases.
// Every frame FACES RIGHT and is mirrored for left-moving pets. Each type has a few named
// animations; frames can be different sizes (the sprite is anchored by its bottom-centre).
//   dog: walk (4 frames), sit (front-facing, tail wags, 2 frames — also the Codex portrait),
//        dig (2 frames: scratching with a front paw, used with the dirt particles)
//   cat: walk (4 frames), sleep (curled loaf + zzz, 2 frames — what it does whenever it's
//        standing still, so a wild cat that isn't moving yet is asleep)
//   elephant / elephantBow: idle (front-facing sway+blink, 2 frames — also the Codex
//        portrait), walk (side-profile 4-frame leg cycle, used for ordinary movement),
//        jump (front-facing hop, 2 frames — reserved for the Lv20 tag minigame)
//   squirrel: idle (sitting with an acorn, 2 frames — ear-twitch on frame 1), scamper
//        (4-frame leap cycle — the only movement animation; used instead of a walk cycle)
//   chicken: idle (2 frames, blink), walk (4-frame side-profile cycle), hop (2 frames,
//        the JUMP + FLAP reference poses — a periodic 2/10 stand-in for walk while moving)
// To add another pet: add a palette letter if needed, add its frames to PET_SPRITES, and draw it
// with drawPetSprite() from Pet.draw() / renderMiniPet() the way the dog and cat do.
// ------------------------------------------------------------------
const PET_SPRITE_SCALE = 2;
const PET_SPRITE_BOTTOM = 34;      // where the feet sit inside a pet's 36px box (px below the box top)
const PET_STEP_PIXELS = 10;        // distance walked per walk-cycle frame

const PET_SPRITE_PALETTE = {
    g: '#e8b55c',   // dog fur
    l: '#f6dc9d',   // dog cream (chest, paws, muzzle)
    d: '#b87b3c',   // dog fur shade (ear, far legs)
    D: '#8c5828',   // dog paw shade
    b: '#5478cf',   // collar / bow
    n: '#1e1a1c',   // nose / mouth
    p: '#ee7884',   // tongue
    e: '#1e1a1c',   // eyes
    w: '#ffffff',   // white
    o: '#e98c2c',   // cat orange
    r: '#c4611c',   // cat stripes
    c: '#fadaa0',   // cat cream
    i: '#e796a0',   // cat pink (ears, nose)
    k: '#8a4a1f',   // cat far legs
    z: '#786054',   // zzz
    G: '#a9adb0',   // elephant body gray
    H: '#c9ccd0',   // elephant light gray (belly, trunk highlight, forehead)
    S: '#7c8185',   // elephant shade gray (ear inner, trunk shadow, legs)
    Y: '#f4a7ba',   // elephant pink (ears, cheeks)
    T: '#f0e6d2',   // elephant toenails
    Q: '#5d6265',   // elephant bow knot/shadow
    B: '#914f28',   // squirrel fur
    F: '#4f2316',   // squirrel fur shade (ears, tail edge, feet)
    C: '#f3d090',   // squirrel cream (belly, muzzle)
    N: '#ab7b53',   // squirrel acorn / paw highlight
    m: '#3c1e14',   // squirrel nose
    W: '#ffffff',   // chicken white
    A: '#e3e3e3',   // chicken shade gray
    O: '#ffd14a',   // chicken beak / feet
    R: '#f6252a',   // chicken comb / wattle
    P: '#ffb3c1'    // chicken cheek blush
};

const PET_SPRITES = {
    dog: {
        walk: [
            [
                '........................',
                '..llg...................',
                '..ggl............ggg....',
                '..gg............ddgggg..',
                '..gg...........gddgegg..',
                '..gg..........ggddgggggn',
                '..ggg..gggggggggddgggggn',
                '...gggggggggggggdgggglll',
                '....gggggggggggggggg..p.',
                '....ggggggggllgbbg....p.',
                '.....gggggllllgbbb......',
                '.....ggggddlddllggb.....',
                '.....gg.lddldd..gg......',
                '.....gg..dd.dd..gg......',
                '.....gg..dd.dd..gg......',
                '.....gg..DD.dd..ll......',
                '.....ll.....DD..........',
            ],
            [
                '........................',
                '..llg...................',
                '..ggl............ggg....',
                '..gg............ddgggg..',
                '..gg...........gddgegg..',
                '..gg..........ggddgggggn',
                '..ggg..gggggggggddgggggn',
                '...gggggggggggggdgggglll',
                '....gggggggggggggggg..p.',
                '....ggggggggllgbbg....p.',
                '.....gggggllllgbbb......',
                '......gggddlllggbbb.....',
                '.......ggddll.gg........',
                '.......ggdd...gg........',
                '.......ggdd...gg........',
                '.......ggdd...gg........',
                '.......llDD...ll........',
            ],
            [
                '........................',
                '..llg...................',
                '..ggl............ggg....',
                '..gg............ddgggg..',
                '..gg...........gddgegg..',
                '..gg..........ggddgggggn',
                '..ggg..gggggggggddgggggn',
                '...gggggggggggggdgggglll',
                '....gggggggggggggggg..p.',
                '....ggggggggllgbbg....p.',
                '.....gggggllllgbbb......',
                '.....ddgggglggllddb.....',
                '.....dd.lgglgg..dd......',
                '.....dd..gg.gg..dd......',
                '.....dd..gg.gg..dd......',
                '.....dd..ll.gg..DD......',
                '.....DD.....ll..........',
            ],
            [
                '........................',
                '..llg...................',
                '..ggl............ggg....',
                '..gg............ddgggg..',
                '..gg...........gddgegg..',
                '..gg..........ggddgggggn',
                '..ggg..gggggggggddgggggn',
                '...gggggggggggggdgggglll',
                '....gggggggggggggggg..p.',
                '....ggggggggllgbbg....p.',
                '.....gggggllllgbbb......',
                '......gggddlllggbbb.....',
                '.......ggddll.gg........',
                '.......ggdd...gg........',
                '.......ggdd...gg........',
                '.......ggdd...gg........',
                '.......llDD...ll........',
            ],
        ],
        sit: [
            [
                '.................',
                '......ggggg......',
                '..dd.ggggggg..dd.',
                '..ddggggggggg.dd.',
                '..ddggeggggeg.dd.',
                '..ddgggglgggg.dd.',
                '..ddggllnnlgg.dd.',
                '..ddgglllllgg.dd.',
                '..dd.glnnnng..dd.',
                '......ggppg....ll',
                '....bbbbbbbbbb.gg',
                '....gglllllbbbbgg',
                '...gggllllbbbbbgg',
                '...ggggllllggg.gg',
                '...ggggllllgggggg',
                '....ggggggggggggg',
                '..ggggggggggggg..',
                '.ggggllggggllgg..',
                '.....llggg.ll....',
            ],
            [
                '.................',
                '......ggggg......',
                '..dd.ggggggg..dd.',
                '..ddggggggggg.dd.',
                '..ddggeggggeg.dd.',
                '..ddgggglgggg.dd.',
                '..ddggllnnlgg.dd.',
                '..ddgglllllgg.dd.',
                '..dd.glnnnng..dd.',
                '......ggppg......',
                '....bbbbbbbbbb...',
                '....gglllllbbbbll',
                '...gggllllbbbbbgg',
                '...ggggllllggg.gg',
                '...ggggllllggg.gg',
                '....ggggggggggggg',
                '..ggggggggggggggg',
                '.ggggllggggllgg..',
                '.....llggg.ll....',
            ],
        ],
        dig: [
            [
                '........................',
                '..llg...................',
                '..ggl............ggg....',
                '..gg............ddgggg..',
                '..gg...........gddgegg..',
                '..gg..........ggddgggggn',
                '..ggg..gggggggggddgggggn',
                '...gggggggggggggdgggglll',
                '....gggggggggggggggg..p.',
                '....ggggggggllgbbg....p.',
                '.....gggggllllgbbb......',
                '......gggddlllggbbb.....',
                '.......ggddll...gg......',
                '.......ggdd.....ggl.....',
                '.......ggdd......ll.....',
                '.......ggdd.............',
                '.......llDD.............',
            ],
            [
                '........................',
                '..llg...................',
                '..ggl............ggg....',
                '..gg............ddgggg..',
                '..gg...........gddgegg..',
                '..gg..........ggddgggggn',
                '..ggg..gggggggggddgggggn',
                '...gggggggggggggdgggglll',
                '....gggggggggggggggg..p.',
                '....ggggggggllgbbg....p.',
                '.....gggggllllgbbb......',
                '......gggddlllggbbb.....',
                '.......ggddll.gg........',
                '.......ggdd...gg........',
                '.......ggdd...gg........',
                '.......ggdd...gg........',
                '.......llDD...ll........',
            ],
        ],
    },
    cat: {
        walk: [
            [
                '........................',
                '.occ..............o.o...',
                '.roo.............oi.io..',
                '.oo..............ooroo..',
                '.oo..............ooooo..',
                '.ro.............ooooeoe.',
                '.oo....rorororoooooooo..',
                '.oroooororororooooroccci',
                '..oooooooorooorooorocccc',
                '....oooooooooooccco.....',
                '.....ooooooooooccc......',
                '.....ooockkckkccoo......',
                '.....oo..kk.kk..oo......',
                '.....oo..kk.kk..oo......',
                '.....oo..kk.kk..oo......',
                '.....oo..kk.kk..cc......',
                '.....cc.....kk..........',
            ],
            [
                '........................',
                '.occ..............o.o...',
                '.roo.............oi.io..',
                '.oo..............ooroo..',
                '.oo..............ooooo..',
                '.ro.............ooooeoe.',
                '.oo....rorororoooooooo..',
                '.oroooororororooooroccci',
                '..oooooooorooorooorocccc',
                '....oooooooooooccco.....',
                '.....ooooooooooccc......',
                '.......ookkcccoo........',
                '.......ookk...oo........',
                '.......ookk...oo........',
                '.......ookk...oo........',
                '.......ookk...oo........',
                '.......cckk...cc........',
            ],
            [
                '........................',
                '.occ..............o.o...',
                '.roo.............oi.io..',
                '.oo..............ooroo..',
                '.oo..............ooooo..',
                '.ro.............ooooeoe.',
                '.oo....rorororoooooooo..',
                '.oroooororororooooroccci',
                '..oooooooorooorooorocccc',
                '....oooooooooooccco.....',
                '.....ooooooooooccc......',
                '.....kkocoocoocckk......',
                '.....kk..oo.oo..kk......',
                '.....kk..oo.oo..kk......',
                '.....kk..oo.oo..kk......',
                '.....kk..cc.oo..kk......',
                '.....kk.....cc..........',
            ],
            [
                '........................',
                '.occ..............o.o...',
                '.roo.............oi.io..',
                '.oo..............ooroo..',
                '.oo..............ooooo..',
                '.ro.............ooooeoe.',
                '.oo....rorororoooooooo..',
                '.oroooororororooooroccci',
                '..oooooooorooorooorocccc',
                '....oooooooooooccco.....',
                '.....ooooooooooccc......',
                '.......ookkcccoo........',
                '.......ookk...oo........',
                '.......ookk...oo........',
                '.......ookk...oo........',
                '.......ookk...oo........',
                '.......cckk...cc........',
            ],
        ],
        sleep: [
            [
                '......................',
                '...................zz.',
                '....................z.',
                '...................zz.',
                '...............o..o...',
                '.....ooooooooooi..io..',
                '...orororororoooor.o..',
                '..oorororororooooooo..',
                '..oooooooooooooooeeo..',
                '..oooooooooooooooooci.',
                '...oooooooooooooroocc.',
                '...oooooooooooooccccc.',
                '...oooooooooooooo.....',
                '......................',
            ],
            [
                '..................zzz.',
                '...................z..',
                '..................zzz.',
                '......................',
                '...............o..o...',
                '.....ooooooooooi..io..',
                '...orororororoooor.o..',
                '..oorororororooooooo..',
                '..oooooooooooooooeeo..',
                '..oooooooooooooooooci.',
                '...oooooooooooooroocc.',
                '...oooooooooooooccccc.',
                '...oooooooooooooo.....',
                '......................',
            ],
        ],
    },
    elephant: {
        idle: [
            [
                '........................',
                '........................',
                '...GGG............GGG...',
                '..GGGGG..GHHHHG..GGGGG..',
                '.GYYYGSGGGGGGGGGGSGYYYG.',
                'GGYYYSGGGGGGGGGGGGSYYYGG',
                'GGGGGSGGGGGGGGGGGGSGGGGG',
                'GGGGGSGGGewGGweGGGSGGGGG',
                'GGGGGSGGGeeGGeeGGGSGGGGG',
                'GGGGGSGYYGGGGGGYYGSGGGGG',
                '.GGGGSSGGGGHSGGGGSSGGGG.',
                '..GGGSS.GGGHSGGG.SSGGG..',
                '...GGGS..GGHSGG..SGGG...',
                '....GGGGGGGHSGGGGGGG....',
                '......GGGGGHSGGGGG......',
                '......GGGHHHSHHGGG......',
                '......GGGHHSSHHGGG......',
                '.......GGHHSSSHGG.......',
                '.......GGG..SSGGG.......',
                '.......TTT....TTT.......',
            ],
            [
                '........................',
                '........................',
                '...GGG............GGG...',
                '..GGGGG..GHHHHG..GGGGG..',
                '.GYYYGSGGGGGGGGGGSGYYYG.',
                'GGYYYSGGGGGGGGGGGGSYYYGG',
                'GGGGGSGGGGGGGGGGGGSGGGGG',
                'GGGGGSGGGewGGweGGGSGGGGG',
                'GGGGGSGGGeeGGeeGGGSGGGGG',
                'GGGGGSGYYGGGGGGYYGSGGGGG',
                '.GGGGSSGGGGHSGGGGSSGGGG.',
                '..GGGSS.GGGHSGGG.SSGGG..',
                '...GGGS..GGHSGG..SGGG...',
                '....GGGGGGGHSGGGGGGG....',
                '......GGGGGHSGGGGG......',
                '......GGGHHS.HHGGG......',
                '......GGGSS..HHGGG......',
                '.......GGSHGGHHGG.......',
                '.......GGG....GGG.......',
                '.......TTT....TTT.......',
            ],
        ],
        // Side-profile 4-frame walk cycle (see PET_STEP_PIXELS) — legs swing through two
        // contact poses (frames 0 and 2) either side of a shared "passing" mid-pose (frames
        // 1 and 3, identical), same 4-frame convention as the dog/cat walk cycles above.
        // Upper body (ear/head/trunk/tail) stays fixed; only the four legs move per frame.
        walk: [
            [
                '........................',
                '............GGGG........',
                '..........GGGGGGGG......',
                '..........GGYYYYGG......',
                '.........GGYYYYYGGG.....',
                '.........GGYYYYYGGGGG...',
                '......GGGGGGGGYGGHHHHG..',
                '....GGGGGGGGGGGGHHHHHHG.',
                '...GGGGGGGGGGGGGHHHeHHG.',
                '..GGGGGGGGGGGGGGYYHHHGG.',
                '.SSGGGGHHHHHHGGYYYYGGGG.',
                'SSGGGGHHHHHHHHGYYYYGGGG.',
                'SSGGGHHHHHHHHHHGYYGGGG..',
                '...GGHHHHHHHHHHGGGGGGG..',
                '....GGHHHHHHHHGG...GG...',
                '.....SSGGGHGGGSS...GG...',
                '.....SSGGG.GGGSS...GGG..',
                '.....SSGGG.GGGSS........',
                '.....TTGGG.GGGTT........',
                '.......TTT.TTT..........',
            ],
            [
                '........................',
                '............GGGG........',
                '..........GGGGGGGG......',
                '..........GGYYYYGG......',
                '.........GGYYYYYGGG.....',
                '.........GGYYYYYGGGGG...',
                '......GGGGGGGGYGGHHHHG..',
                '....GGGGGGGGGGGGHHHHHHG.',
                '...GGGGGGGGGGGGGHHHeHHG.',
                '..GGGGGGGGGGGGGGYYHHHGG.',
                '.SSGGGGHHHHHHGGYYYYGGGG.',
                'SSGGGGHHHHHHHHGYYYYGGGG.',
                'SSGGGHHHHHHHHHHGYYGGGG..',
                '...GGHHHHHHHHHHGGGGGGG..',
                '....GGHHHHHHHHGG...GG...',
                '......SSGGGHSSGGG..GG...',
                '......SSGGG.SSGGG..GGG..',
                '......SSGGG.SSGGG.......',
                '......TTTTT.TTTTT.......',
                '........................',
            ],
            [
                '........................',
                '............GGGG........',
                '..........GGGGGGGG......',
                '..........GGYYYYGG......',
                '.........GGYYYYYGGG.....',
                '.........GGYYYYYGGGGG...',
                '......GGGGGGGGYGGHHHHG..',
                '....GGGGGGGGGGGGHHHHHHG.',
                '...GGGGGGGGGGGGGHHHeHHG.',
                '..GGGGGGGGGGGGGGYYHHHGG.',
                '.SSGGGGHHHHHHGGYYYYGGGG.',
                'SSGGGGHHHHHHHHGYYYYGGGG.',
                'SSGGGHHHHHHHHHHGYYGGGG..',
                '...GGHHHHHHHHHHGGGGGGG..',
                '....GGHHHHHHHHGG...GG...',
                '.....GGGSSHSSGGG...GG...',
                '.....GGGSS.SSGGG...GGG..',
                '.....GGGSS.SSGGG........',
                '.....GGGTT.TTGGG........',
                '.....TTT.....TTT........',
            ],
            [
                '........................',
                '............GGGG........',
                '..........GGGGGGGG......',
                '..........GGYYYYGG......',
                '.........GGYYYYYGGG.....',
                '.........GGYYYYYGGGGG...',
                '......GGGGGGGGYGGHHHHG..',
                '....GGGGGGGGGGGGHHHHHHG.',
                '...GGGGGGGGGGGGGHHHeHHG.',
                '..GGGGGGGGGGGGGGYYHHHGG.',
                '.SSGGGGHHHHHHGGYYYYGGGG.',
                'SSGGGGHHHHHHHHGYYYYGGGG.',
                'SSGGGHHHHHHHHHHGYYGGGG..',
                '...GGHHHHHHHHHHGGGGGGG..',
                '....GGHHHHHHHHGG...GG...',
                '......SSGGGHSSGGG..GG...',
                '......SSGGG.SSGGG..GGG..',
                '......SSGGG.SSGGG.......',
                '......TTTTT.TTTTT.......',
                '........................',
            ],
        ],
        jump: [
            [
                '........................',
                '........................',
                '...GGG............GGG...',
                '..GGGGG..GHHHHG..GGGGG..',
                '.GYYYGSGGGGGGGGGHSGYYYG.',
                'GGYYYSGGGGGGGGGHSGSYYYGG',
                'GGGGGSGGGGGGGGHSGGSGGGGG',
                'GGGGGSGGGewGGHSGGGSGGGGG',
                'GGGGGSGGGeeGHSeGGGSGGGGG',
                'GGGGGSGYYGGHSGGYYGSGGGGG',
                '.GGGGSSGGGGnnGGGGSSGGGG.',
                '..GGGSS.GGGGGGGG.SSGGG..',
                '...GGGS..GGGGGG..SGGG...',
                '....GGGGGGG..GGGGGGG....',
                '......GGGGG..GGGGG......',
                '......GGGHH..HHGGG......',
                '......GGGHH..HHGGG......',
                '.......GGHHGGHHGG.......',
                '.......GGG....GGG.......',
                '.......TTT....TTT.......',
            ],
            [
                '........................',
                '........................',
                '...GGG............GGG...',
                '..GGGGG..GHHHHG..GGGGG..',
                '.GYYYGSGGGGGGGGGHSGYYYG.',
                'GGYYYSGGGGGGGGGHSGSYYYGG',
                'GGGGGSGGGGGGGGHSGGSGGGGG',
                'GGGGGSGGGSSGGSSGGGSGGGGG',
                'GGGGGSGGG..GH..GGGSGGGGG',
                'GGGGGSGYYGGHSGGYYGSGGGGG',
                '.GGGGSSGGGGnnGGGGSSGGGG.',
                '..GGGSS.GGGGGGGG.SSGGG..',
                '...GGGS..GGGGGG..SGGG...',
                '....GGGGGGG..GGGGGGG....',
                '......GGGGG..GGGGG......',
                '......GGGHH..HHGGG......',
                '......GGGHH..HHGGG......',
                '.......GGHHGGHHGG.......',
                '.......GGG....GGG.......',
                '.......TTT....TTT.......',
            ],
        ],
    },
    elephantBow: {
        // Same side-profile walk cycle as the plain elephant above, with the bow baked
        // onto the head (two white wings + a dark knot) so it stays on through every frame.
        walk: [
            [
                '........................',
                '............GGwww..www..',
                '..........GGGGwwwQQQwww.',
                '..........GGYYYwwG..ww..',
                '.........GGYYYYYGGG.....',
                '.........GGYYYYYGGGGG...',
                '......GGGGGGGGYGGHHHHG..',
                '....GGGGGGGGGGGGHHHHHHG.',
                '...GGGGGGGGGGGGGHHHeHHG.',
                '..GGGGGGGGGGGGGGYYHHHGG.',
                '.SSGGGGHHHHHHGGYYYYGGGG.',
                'SSGGGGHHHHHHHHGYYYYGGGG.',
                'SSGGGHHHHHHHHHHGYYGGGG..',
                '...GGHHHHHHHHHHGGGGGGG..',
                '....GGHHHHHHHHGG...GG...',
                '.....SSGGGHGGGSS...GG...',
                '.....SSGGG.GGGSS...GGG..',
                '.....SSGGG.GGGSS........',
                '.....TTGGG.GGGTT........',
                '.......TTT.TTT..........',
            ],
            [
                '........................',
                '............GGwww..www..',
                '..........GGGGwwwQQQwww.',
                '..........GGYYYwwG..ww..',
                '.........GGYYYYYGGG.....',
                '.........GGYYYYYGGGGG...',
                '......GGGGGGGGYGGHHHHG..',
                '....GGGGGGGGGGGGHHHHHHG.',
                '...GGGGGGGGGGGGGHHHeHHG.',
                '..GGGGGGGGGGGGGGYYHHHGG.',
                '.SSGGGGHHHHHHGGYYYYGGGG.',
                'SSGGGGHHHHHHHHGYYYYGGGG.',
                'SSGGGHHHHHHHHHHGYYGGGG..',
                '...GGHHHHHHHHHHGGGGGGG..',
                '....GGHHHHHHHHGG...GG...',
                '......SSGGGHSSGGG..GG...',
                '......SSGGG.SSGGG..GGG..',
                '......SSGGG.SSGGG.......',
                '......TTTTT.TTTTT.......',
                '........................',
            ],
            [
                '........................',
                '............GGwww..www..',
                '..........GGGGwwwQQQwww.',
                '..........GGYYYwwG..ww..',
                '.........GGYYYYYGGG.....',
                '.........GGYYYYYGGGGG...',
                '......GGGGGGGGYGGHHHHG..',
                '....GGGGGGGGGGGGHHHHHHG.',
                '...GGGGGGGGGGGGGHHHeHHG.',
                '..GGGGGGGGGGGGGGYYHHHGG.',
                '.SSGGGGHHHHHHGGYYYYGGGG.',
                'SSGGGGHHHHHHHHGYYYYGGGG.',
                'SSGGGHHHHHHHHHHGYYGGGG..',
                '...GGHHHHHHHHHHGGGGGGG..',
                '....GGHHHHHHHHGG...GG...',
                '.....GGGSSHSSGGG...GG...',
                '.....GGGSS.SSGGG...GGG..',
                '.....GGGSS.SSGGG........',
                '.....GGGTT.TTGGG........',
                '.....TTT.....TTT........',
            ],
            [
                '........................',
                '............GGwww..www..',
                '..........GGGGwwwQQQwww.',
                '..........GGYYYwwG..ww..',
                '.........GGYYYYYGGG.....',
                '.........GGYYYYYGGGGG...',
                '......GGGGGGGGYGGHHHHG..',
                '....GGGGGGGGGGGGHHHHHHG.',
                '...GGGGGGGGGGGGGHHHeHHG.',
                '..GGGGGGGGGGGGGGYYHHHGG.',
                '.SSGGGGHHHHHHGGYYYYGGGG.',
                'SSGGGGHHHHHHHHGYYYYGGGG.',
                'SSGGGHHHHHHHHHHGYYGGGG..',
                '...GGHHHHHHHHHHGGGGGGG..',
                '....GGHHHHHHHHGG...GG...',
                '......SSGGGHSSGGG..GG...',
                '......SSGGG.SSGGG..GGG..',
                '......SSGGG.SSGGG.......',
                '......TTTTT.TTTTT.......',
                '........................',
            ],
        ],
        idle: [
            [
                '........ww....ww........',
                '.......wwwwQQwwww.......',
                '...GGG..wQQQQw....GGG...',
                '..GGGGG..GHHHHG..GGGGG..',
                '.GYYYGSGGGGGGGGGGSGYYYG.',
                'GGYYYSGGGGGGGGGGGGSYYYGG',
                'GGGGGSGGGGGGGGGGGGSGGGGG',
                'GGGGGSGGGewGGweGGGSGGGGG',
                'GGGGGSGGGeeGGeeGGGSGGGGG',
                'GGGGGSGYYGGGGGGYYGSGGGGG',
                '.GGGGSSGGGGHSGGGGSSGGGG.',
                '..GGGSS.GGGHSGGG.SSGGG..',
                '...GGGS..GGHSGG..SGGG...',
                '....GGGGGGGHSGGGGGGG....',
                '......GGGGGHSGGGGG......',
                '......GGGHHHSHHGGG......',
                '......GGGHHSSHHGGG......',
                '.......GGHHSSSHGG.......',
                '.......GGG..SSGGG.......',
                '.......TTT....TTT.......',
            ],
            [
                '........ww....ww........',
                '.......wwwwQQwwww.......',
                '...GGG..wQQQQw....GGG...',
                '..GGGGG..GHHHHG..GGGGG..',
                '.GYYYGSGGGGGGGGGGSGYYYG.',
                'GGYYYSGGGGGGGGGGGGSYYYGG',
                'GGGGGSGGGGGGGGGGGGSGGGGG',
                'GGGGGSGGGewGGweGGGSGGGGG',
                'GGGGGSGGGeeGGeeGGGSGGGGG',
                'GGGGGSGYYGGGGGGYYGSGGGGG',
                '.GGGGSSGGGGHSGGGGSSGGGG.',
                '..GGGSS.GGGHSGGG.SSGGG..',
                '...GGGS..GGHSGG..SGGG...',
                '....GGGGGGGHSGGGGGGG....',
                '......GGGGGHSGGGGG......',
                '......GGGHHS.HHGGG......',
                '......GGGSS..HHGGG......',
                '.......GGSHGGHHGG.......',
                '.......GGG....GGG.......',
                '.......TTT....TTT.......',
            ],
        ],
        jump: [
            [
                '........ww....ww........',
                '.......wwwwQQwwww.......',
                '...GGG..wQQQQw....GGG...',
                '..GGGGG..GHHHHG..GGGGG..',
                '.GYYYGSGGGGGGGGGHSGYYYG.',
                'GGYYYSGGGGGGGGGHSGSYYYGG',
                'GGGGGSGGGGGGGGHSGGSGGGGG',
                'GGGGGSGGGewGGHSGGGSGGGGG',
                'GGGGGSGGGeeGHSeGGGSGGGGG',
                'GGGGGSGYYGGHSGGYYGSGGGGG',
                '.GGGGSSGGGGnnGGGGSSGGGG.',
                '..GGGSS.GGGGGGGG.SSGGG..',
                '...GGGS..GGGGGG..SGGG...',
                '....GGGGGGG..GGGGGGG....',
                '......GGGGG..GGGGG......',
                '......GGGHH..HHGGG......',
                '......GGGHH..HHGGG......',
                '.......GGHHGGHHGG.......',
                '.......GGG....GGG.......',
                '.......TTT....TTT.......',
            ],
            [
                '........ww....ww........',
                '.......wwwwQQwwww.......',
                '...GGG..wQQQQw....GGG...',
                '..GGGGG..GHHHHG..GGGGG..',
                '.GYYYGSGGGGGGGGGHSGYYYG.',
                'GGYYYSGGGGGGGGGHSGSYYYGG',
                'GGGGGSGGGGGGGGHSGGSGGGGG',
                'GGGGGSGGGSSGGSSGGGSGGGGG',
                'GGGGGSGGG..GH..GGGSGGGGG',
                'GGGGGSGYYGGHSGGYYGSGGGGG',
                '.GGGGSSGGGGnnGGGGSSGGGG.',
                '..GGGSS.GGGGGGGG.SSGGG..',
                '...GGGS..GGGGGG..SGGG...',
                '....GGGGGGG..GGGGGGG....',
                '......GGGGG..GGGGG......',
                '......GGGHH..HHGGG......',
                '......GGGHH..HHGGG......',
                '.......GGHHGGHHGG.......',
                '.......GGG....GGG.......',
                '.......TTT....TTT.......',
            ],
        ],
    },
    squirrel: {
        // Idle: sitting upright with an acorn (2 frames — ear-twitch on frame 1).
        // Scamper is the only movement animation (see draw()): used whenever the
        // squirrel is actually moving, in place of a walk cycle.
        idle: [
        // idle v0
            [
                '..............FFFF......',
                '.........FF..FFBBBF.....',
                '...FF...FBBBFFBFFFBF....',
                '..FBBB..FBBBFBFFFFFB....',
                '..FBBBBBFBBBFBFFFFFB....',
                '..FBBBBBBFFBFBFFFFFB....',
                '...FFBBBBBBBFFBFFFBF....',
                '..BCCCeBBBBBBFFBBBF.....',
                '..CCCCCCCBBBB.FFFF......',
                '..mmCCCCCBBBBB..........',
                '..CCCCCCCBBBBBB.........',
                '..CCCCCCBBBBBBBB........',
                '....CCCBFFFCBBBB........',
                '....BBCCFFFCCBBB........',
                '....BBCNNNNNCBBB........',
                '....BBCNNNNNCBBB........',
                '.....BCNNNNNCBB.........',
                '......BCNNNCBB..........',
                '......FFFCCFFF..........',
                '......FFF..FFF..........',
            ],
        // idle v1
            [
                '.F.....F......FFFF......',
                '.........FF..FFBBBF.....',
                '...FF...FBBBFFBFFFBF....',
                '..FBBB..FBBBFBFFFFFB....',
                '..FBBBBBFBBBFBFFFFFB....',
                '..FBBBBBBFFBFBFFFFFB....',
                '...FFBBBBBBBFFBFFFBF....',
                '..BCCCeBBBBBBFFBBBF.....',
                '..CCCCCCCBBBB.FFFF......',
                '..mmCCCCCBBBBB..........',
                '..CCCCCCCBBBBBB.........',
                '..CCCCCCBBBBBBBB........',
                '....CCCBFFFCBBBB........',
                '....BBCCFFFCCBBB........',
                '....BBCNNNNNCBBB........',
                '....BBCNNNNNCBBB........',
                '.....BCNNNNNCBB.........',
                '......BCNNNCBB..........',
                '......FFFCCFFF..........',
                '......FFF..FFF..........',
            ],
        ],
        scamper: [
        // scamper f0
            [
                '...........FFFFF........',
                '..........FFBBBBFF......',
                '.........FBBFFFFBFF.....',
                '.........FBFFFFFFBF.....',
                '.........FBFFFFFFBF.....',
                '.........FFBFFFFBFF.....',
                '..........FFBBBBFBBB....',
                '............FFFFBFFFB...',
                '...............BBFFFFB..',
                '......BBBBBBBB.BBCCeBB..',
                '....BBBBBBBBBBBBCCCCBmm.',
                '...BBBBCCCCCBBBBCCCCBB..',
                '...BBCCCCCCCCCBBBCCBB...',
                '...BBCCCCCCCCCBBBBBB....',
                '....BCCCCCCCCCBBB.......',
                '.....FFFCCCCFFF.........',
                '.....FFF....FFF.........',
                '.....FFF....FFF.........',
                '.....FFF................',
                '........................',
            ],
        // scamper f1
            [
                '...........FFFFF........',
                '..........FFBBBBFF......',
                '.........FBBFFFFBFF.....',
                '.........FBFFFFFFBF.....',
                '.........FBFFFFFFBF.....',
                '.........FFBFFFFBFF.....',
                '..........FFBBBBFBBB....',
                '............FFFFBFFFB...',
                '...............BBFFFFB..',
                '......BBBBBBBB.BBCCeBB..',
                '....BBBBBBBBBBBBCCCCBmm.',
                '...BBBBCCCCCBBBBCCCCBB..',
                '...BBCCCCCCCCCBBBCCBB...',
                '...BBCCCCCCCCCBBBBBB....',
                '....BCCCCCCCCCBBB.......',
                '....FFFCCCCCBFFF........',
                '....FFF......FFF........',
                '....FFF......FFF........',
                '.............FFF........',
                '........................',
            ],
        // scamper f2
            [
                '...........FFFFF........',
                '..........FFBBBBFF......',
                '.........FBBFFFFBFF.....',
                '.........FBFFFFFFBF.....',
                '.........FBFFFFFFBF.....',
                '.........FFBFFFFBFF.....',
                '..........FFBBBBFBBB....',
                '............FFFFBFFFB...',
                '...............BBFFFFB..',
                '......BBBBBBBB.BBCCeBB..',
                '....BBBBBBBBBBBBCCCCBmm.',
                '...BBBBCCCCCBBBBCCCCBB..',
                '...BBCCCCCCCCCBBBCCBB...',
                '...BBCCCCCCCCCBBBBBB....',
                '....BCCCCCCCCCBBB.......',
                '.....FFFCCCCFFF.........',
                '.....FFF....FFF.........',
                '.....FFF....FFF.........',
                '.....FFF................',
                '........................',
            ],
        // scamper f3
            [
                '...........FFFFF........',
                '..........FFBBBBFF......',
                '.........FBBFFFFBFF.....',
                '.........FBFFFFFFBF.....',
                '.........FBFFFFFFBF.....',
                '.........FFBFFFFBFF.....',
                '..........FFBBBBFBBB....',
                '............FFFFBFFFB...',
                '...............BBFFFFB..',
                '......BBBBBBBB.BBCCeBB..',
                '....BBBBBBBBBBBBCCCCBmm.',
                '...BBBBCCCCCBBBBCCCCBB..',
                '...BBCCCCCCCCCBBBCCBB...',
                '...BBCCCCCCCCCBBBBBB....',
                '....BCCCCCCCCCBBB.......',
                '....FFFCCCCCBFFF........',
                '....FFF......FFF........',
                '....FFF......FFF........',
                '.............FFF........',
                '........................',
            ],
        ],
    },
    chicken: {
        // Idle (2 frames, blink) and walk (4-frame side-profile cycle) are the two
        // everyday animations. hop (2 frames: JUMP pose + FLAP pose from the reference
        // sheet) plays instead of walk for occasional bursts while moving -- see
        // Pet.draw(): a 2-in-10 roll every ~1.5s of movement switches to hop for that
        // stretch, purely cosmetic (no effect on movement speed or game state).
        idle: [
        // idle v0
            [
                '.........R.R..........',
                '.........RRR..........',
                '........RRRRR.........',
                '........WWWWW.........',
                '.......WWWWWWWW.......',
                '......WWWWWWWWWW......',
                '......WeWeWWeWeW......',
                '.....WWeeeWWeeeWW.....',
                '.....WWeeeWWeeeWW.....',
                '....WWPPWWOOWWPPWW....',
                '....WWWWWWOOWWWWWA....',
                '....WAAWWWWWWWWWWWA...',
                '....AAAAWWWWWWWWWWA...',
                '....AAAAWWWWWWAWWAA...',
                '....AAAAWWWWWWAAAAA...',
                '....AAAAWWWWWWWAAA....',
                '....AAAAWWWWWWW.......',
                '.....AAOOOWWOOO.......',
                '.......OOO..OOO.......',
                '.......OOO..OOO.......',
            ],
        // idle v1
            [
                '.........R.R..........',
                '.........RRR..........',
                '........RRRRR.........',
                '........WWWWW.........',
                '.......WWWWWWWW.......',
                '......WWWWWWWWWW......',
                '......WeWeWWeWeW......',
                '.....WWeeeWWeeeWW.....',
                '.....WWeeeWWeeeWW.....',
                '....WWPPWWOOWWPPWW....',
                '....WWWWWWOOWWWWWA....',
                '....WAAWWWWWWWWWWWA...',
                '....AAAAWWWWWWWWWWA...',
                '....AAAAWWWWWWAWWAA...',
                '....AAAAWWWWWWAAAAA...',
                '....AAAAWWWWWWWAAA....',
                '....AAAAWWWWWWW.......',
                '.....AAOOOWWOOO.......',
                '.......OOO..OOO.......',
                '.......OOO..OOO.......',
            ],
        ],
        walk: [
        // walk f0
            [
                '..............RRR.....',
                '.............RRRRR....',
                '.............RRRRR....',
                '..............RRWWW...',
                '..AAA..........WWWWW..',
                '.AAAAA........WWWWWWW.',
                '.AAAAA.WWWWWW.WWWWeeW.',
                '.AAAAAWWWWWWWWWWWWWWOO',
                '.AAAAAWWWWWWWWWWWPWWOO',
                '..AAAAAWWWWWWWWWWWW...',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWW......',
                '...AAAAAWWWWWWW.......',
                '....AAOOWWWOO.........',
                '......OO...OO.........',
                '......OOO..OO.........',
                '.......OO..OOO........',
                '............OO........',
            ],
        // walk f1
            [
                '..............RRR.....',
                '.............RRRRR....',
                '.............RRRRR....',
                '..............RRWWW...',
                '..AAA..........WWWWW..',
                '.AAAAA........WWWWWWW.',
                '.AAAAA.WWWWWW.WWWWeeW.',
                '.AAAAAWWWWWWWWWWWWWWOO',
                '.AAAAAWWWWWWWWWWWPWWOO',
                '..AAAAAWWWWWWWWWWWW...',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWW......',
                '...AAAAAWWWWWWW.......',
                '....AAOOWWWOO.........',
                '......OO...OO.........',
                '......OO...OO.........',
                '......OO...OO.........',
                '......................',
            ],
        // walk f2
            [
                '..............RRR.....',
                '.............RRRRR....',
                '.............RRRRR....',
                '..............RRWWW...',
                '..AAA..........WWWWW..',
                '.AAAAA........WWWWWWW.',
                '.AAAAA.WWWWWW.WWWWeeW.',
                '.AAAAAWWWWWWWWWWWWWWOO',
                '.AAAAAWWWWWWWWWWWPWWOO',
                '..AAAAAWWWWWWWWWWWW...',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWW......',
                '...AAAAAWWWWWWW.......',
                '....AAOOWWWOO.........',
                '......OO...OO.........',
                '......OO...OOO........',
                '.....OOO....OO........',
                '.....OO...............',
            ],
        // walk f3
            [
                '..............RRR.....',
                '.............RRRRR....',
                '.............RRRRR....',
                '..............RRWWW...',
                '..AAA..........WWWWW..',
                '.AAAAA........WWWWWWW.',
                '.AAAAA.WWWWWW.WWWWeeW.',
                '.AAAAAWWWWWWWWWWWWWWOO',
                '.AAAAAWWWWWWWWWWWPWWOO',
                '..AAAAAWWWWWWWWWWWW...',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWWW.....',
                '...AAAAAWWWWWWWW......',
                '...AAAAAWWWWWWW.......',
                '....AAOOWWWOO.........',
                '......OO...OO.........',
                '......OO...OO.........',
                '......OO...OO.........',
                '......................',
            ],
        ],
        hop: [
        // hop jump
            [
                '..........RRR.........',
                '.........RRRRR........',
                '.........RRRRR........',
                '.........WWWW.........',
                '........WWWWWW........',
                '..WWW..WWWWWWWW..WWW..',
                '.WWWWW.WeeWWeeW.WWWWW.',
                'WWAAAWPPWWWWWWPPWAAAWW',
                'WAAAAAWWWOOOOWWWAAAAAW',
                'WAAAAAWWWOOOOWWWAAAAAW',
                '.WAAAWWWWWWWWWWWWAAAW.',
                '..WWW.WAAWWWWWWW.WWW..',
                '......AAAAWWWWWW......',
                '......AAAAWWWWWW......',
                '......AAAAWWWWW.......',
                '......AAAAWWWW........',
                '.......AAWWWW.........',
                '........OO..OO........',
                '........OO..OO........',
                '......................',
            ],
        // hop flap
            [
                '..........RRR.........',
                '.........RRRRR........',
                '.........RRRRR........',
                '..WWW....WWWW....WWW..',
                '.WWWWW..WWWWWW..WWWWW.',
                'WWAAAWWWWWWWWWWWWAAAWW',
                'WAAAAAWWeeWWeeWWAAAAAW',
                'WAAAAAPPWWWWWWPPAAAAAW',
                'WAAAAAWWWOOOOWWWAAAAAW',
                '.WAAAWWWWOOOOWWWWAAAW.',
                '..WWW.WWWWWWWWWW.WWW..',
                '......WAAWWWWWWW......',
                '......AAAAWWWWWW......',
                '......AAAAWWWWWW......',
                '......AAAAWWWWW.......',
                '......AAAAWWWW........',
                '.......AAWWWW.........',
                '......OO......OO......',
                '......OO......OO......',
                '......OO......OO......',
            ],
        ],
    },
};

const petSpriteCache = {};
function getPetSprite(type, anim, index) {
    const key = type + ':' + anim + ':' + index;
    if (petSpriteCache[key]) return petSpriteCache[key];
    const rows = PET_SPRITES[type][anim][index];
    const c = document.createElement('canvas');
    c.width = rows[0].length * PET_SPRITE_SCALE;
    c.height = rows.length * PET_SPRITE_SCALE;
    const cx = c.getContext('2d');
    for (let y = 0; y < rows.length; y++) {
        for (let x = 0; x < rows[y].length; x++) {
            const color = PET_SPRITE_PALETTE[rows[y][x]];
            if (!color) continue;
            cx.fillStyle = color;
            cx.fillRect(x * PET_SPRITE_SCALE, y * PET_SPRITE_SCALE, PET_SPRITE_SCALE, PET_SPRITE_SCALE);
        }
    }
    petSpriteCache[key] = c;
    return c;
}

// Draws one frame of a pet's sprite into the 36 x 36 box whose top-left is (boxX, boxY), on any
// 2D context (the game canvas, or the Codex portrait canvas). facing: 1 = right, -1 = left.
function drawPetSprite(c, type, anim, index, boxX, boxY, facing) {
    const sprite = getPetSprite(type, anim, index);
    const w = sprite.width;
    const h = sprite.height;
    const dx = Math.round(boxX + 18 - w / 2);
    const dy = Math.round(boxY + PET_SPRITE_BOTTOM - h);

    // soft ground shadow, like the player's
    c.fillStyle = 'rgba(0, 0, 0, 0.2)';
    c.beginPath();
    c.ellipse(boxX + 18, boxY + PET_SPRITE_BOTTOM, Math.min(16, w * 0.36), 3.2, 0, 0, Math.PI * 2);
    c.fill();

    const smoothing = c.imageSmoothingEnabled;
    c.imageSmoothingEnabled = false;
    if (facing < 0) {
        c.save();
        c.translate(dx + w, dy);
        c.scale(-1, 1);
        c.drawImage(sprite, 0, 0);
        c.restore();
    } else {
        c.drawImage(sprite, dx, dy);
    }
    c.imageSmoothingEnabled = smoothing;
}

class Player {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        // The hitbox (pickups, feeding range, hive distance...) stays 32 x 32 exactly as before;
        // the sprite is drawn taller than that (see draw()) so the character is easier to see.
        this.size = 32;
        this.speed = 150;

        // Animation state (see draw()). facing: 1 = right, -1 = left (last horizontal direction).
        this.facing = 1;
        this.moving = false;
        this.stepDistance = 0;   // total distance walked, drives the walk cycle
        this.idleTime = 0;       // seconds standing still, drives the idle wave

        // Which sprite set to draw (see PLAYER_MODELS): 'female' or 'male'. Kept in sync with
        // character.model — loadGameProgress() (state.js) sets this after restoring a save,
        // and the CHAR window's switch button (ui.js) sets it immediately on click. Defaults
        // to 'female' here purely so the player is never spriteless before that sync runs.
        this.model = 'female';
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

        const startX = this.x;
        const startY = this.y;

        this.x += moveX * this.speed * dt;
        this.y += moveY * this.speed * dt;

        let padding = 20;
        if (this.x < padding) this.x = padding;
        if (this.y < padding) this.y = padding;
        if (this.x + this.size > canvas.width - padding) this.x = canvas.width - padding - this.size;
        if (this.y + this.size > canvas.height - padding) this.y = canvas.height - padding - this.size;

        // Animation bookkeeping. Based on how far the player ACTUALLY moved (after the edge clamping
        // above), so pushing against a wall doesn't make the feet run on the spot.
        const movedX = this.x - startX;
        const movedY = this.y - startY;
        const moved = Math.sqrt(movedX * movedX + movedY * movedY);
        this.moving = moved > 0.01;
        if (moveX > 0) this.facing = 1;
        else if (moveX < 0) this.facing = -1;
        if (this.moving) {
            this.stepDistance += moved;
            this.idleTime = 0;
        } else {
            this.idleTime += dt;
        }
    }

    // Top-left of where a carried sugar glider is drawn — on the side the player is facing, at
    // shoulder height. Shared by drawHeldGlider() and dropGlider() (world.js).
    getHeldGliderPosition() {
        return {
            x: this.x + (this.facing > 0 ? 22 : -26),
            y: this.y - 2
        };
    }

    draw() {
        const w = PLAYER_SPRITE_COLS * PLAYER_SPRITE_SCALE;
        const h = PLAYER_SPRITE_ROWS * PLAYER_SPRITE_SCALE;

        let sprite;
        let bob = 0;
        if (this.moving) {
            // 4-frame walk cycle advanced by distance; the two "passing" frames also lift the body a pixel.
            const step = Math.floor(this.stepDistance / PLAYER_STEP_PIXELS) % 4;
            sprite = getPlayerSprite('walk', step, this.model);
            if (step % 2 === 1) bob = -PLAYER_SPRITE_SCALE;
        } else {
            sprite = getPlayerSprite('idle', Math.floor(this.idleTime / PLAYER_WAVE_SECONDS) % 2, this.model);
        }

        // The sprite is centred on the 32 x 32 hitbox (so it stands 8px taller above and 8px below it),
        // snapped to whole pixels to keep the pixel art crisp.
        const dx = Math.round(this.x + this.size / 2 - w / 2);
        const dy = Math.round(this.y + this.size / 2 - h / 2) + bob;

        // Soft ground shadow under the feet — helps the white dress stand out on light ground.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
        ctx.beginPath();
        ctx.ellipse(dx + w / 2, Math.round(this.y + this.size / 2 - h / 2) + h - 1, 12, 3.5, 0, 0, Math.PI * 2);
        ctx.fill();

        const smoothing = ctx.imageSmoothingEnabled;
        ctx.imageSmoothingEnabled = false;
        if (this.moving && this.facing < 0) {
            // The walk frames face right; mirror them for walking left.
            ctx.save();
            ctx.translate(dx + w, dy);
            ctx.scale(-1, 1);
            ctx.drawImage(sprite, 0, 0);
            ctx.restore();
        } else {
            ctx.drawImage(sprite, dx, dy);
        }
        ctx.imageSmoothingEnabled = smoothing;
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
        } else if (this.type === 'banana') {
            ctx.fillStyle = '#f5d020';
            ctx.beginPath();
            ctx.moveTo(this.x - 7, this.y + 6);
            ctx.quadraticCurveTo(this.x, this.y - 10, this.x + 8, this.y - 7);
            ctx.quadraticCurveTo(this.x + 1, this.y + 2, this.x - 4, this.y + 9);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#7a5c00';
            ctx.beginPath();
            ctx.arc(this.x + 8, this.y - 7, 1.5, 0, Math.PI * 2);
            ctx.fill();
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

// The elephant's white bow is no longer a separate overlay function — now that both
// elephants are PET_SPRITES pixel art (see 'elephant' / 'elephantBow' below), the Bow
// Elephant's bow is simply baked into its own frame set, the same way the dog's collar
// or the cat's stripes are baked into theirs. drawPetSprite() picks the right frame set
// via this.bowColor (Pet.draw()) / pet.bowColor (renderMiniPet in ui.js).

// The sugar glider model, front-facing with its gliding membrane spread. Takes a drawing
// context + the pet's top-left origin so ONE implementation serves both the in-world model
// (Pet.draw) and the codex portrait (renderMiniPet in ui.js), which keeps its own separate
// copy of every other model. Fits the
// pet's 36x36 box (the tail curls a couple of px below it).
//   opts.bowColor  — draws a small bow on the head (Miss Glider's red one)
//   opts.sleeping  — closed eyes, used while resting inside a tree
function drawGliderModel(c, x, y, opts) {
    opts = opts || {};
    c.save();
    c.lineJoin = 'round';
    c.lineCap = 'round';

    // Tail — bushy, curling out from behind the body and round to the right, dark tip.
    c.strokeStyle = '#7d848b';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(x + 21, y + 29);
    c.quadraticCurveTo(x + 35, y + 40, x + 36, y + 27);
    c.stroke();
    c.strokeStyle = '#3b3f44';
    c.lineWidth = 6;
    c.beginPath();
    c.moveTo(x + 35.6, y + 31);
    c.lineTo(x + 36, y + 27);
    c.stroke();

    // Gliding membrane (patagium) — the skin flap stretched between the front and hind
    // legs, with a scalloped lower edge. This is what reads as "sugar glider".
    c.fillStyle = '#8e959c';
    c.strokeStyle = '#c4cad0';
    c.lineWidth = 1.2;
    c.beginPath();
    c.moveTo(x + 3, y + 13);
    c.quadraticCurveTo(x + 0, y + 24, x + 6, y + 31);
    c.quadraticCurveTo(x + 18, y + 26, x + 30, y + 31);
    c.quadraticCurveTo(x + 36, y + 24, x + 33, y + 13);
    c.lineTo(x + 26, y + 17);
    c.lineTo(x + 10, y + 17);
    c.closePath();
    c.fill();
    c.stroke();

    // Cream belly.
    c.fillStyle = '#f3e9d2';
    c.beginPath();
    c.ellipse(x + 18, y + 22, 7.5, 9, 0, 0, Math.PI * 2);
    c.fill();

    // Front paws (at the membrane's wrists) and hind feet.
    c.fillStyle = '#e2b7a5';
    c.beginPath(); c.arc(x + 3.5, y + 13.5, 2.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 32.5, y + 13.5, 2.2, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + 7.5, y + 31, 3, 1.8, 0, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.ellipse(x + 28.5, y + 31, 3, 1.8, 0, 0, Math.PI * 2); c.fill();

    // Big round ears (grey outside, pink inside).
    c.fillStyle = '#8a9198';
    c.beginPath(); c.arc(x + 10.5, y + 5, 4.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 25.5, y + 5, 4.6, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e8a5b0';
    c.beginPath(); c.arc(x + 10.5, y + 5, 2.6, 0, Math.PI * 2); c.fill();
    c.beginPath(); c.arc(x + 25.5, y + 5, 2.6, 0, Math.PI * 2); c.fill();

    // Head, with a lighter muzzle.
    c.fillStyle = '#9aa1a8';
    c.beginPath(); c.arc(x + 18, y + 11.5, 8.5, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#e9e2d3';
    c.beginPath(); c.ellipse(x + 18, y + 15.2, 5, 3.6, 0, 0, Math.PI * 2); c.fill();

    // The dark stripe down the middle of the forehead — the other giveaway.
    c.fillStyle = '#3a3d42';
    c.beginPath();
    c.moveTo(x + 16.8, y + 3.4);
    c.lineTo(x + 19.2, y + 3.4);
    c.lineTo(x + 18.7, y + 11);
    c.lineTo(x + 17.3, y + 11);
    c.closePath();
    c.fill();

    // Huge dark eyes (or closed, when asleep).
    if (opts.sleeping) {
        c.strokeStyle = '#1b1b1b';
        c.lineWidth = 1.5;
        c.beginPath(); c.arc(x + 14, y + 10.5, 2.3, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
        c.beginPath(); c.arc(x + 22, y + 10.5, 2.3, Math.PI * 0.15, Math.PI * 0.85); c.stroke();
    } else {
        c.fillStyle = '#111111';
        c.beginPath(); c.ellipse(x + 14, y + 10.8, 2.6, 3.3, 0, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.ellipse(x + 22, y + 10.8, 2.6, 3.3, 0, 0, Math.PI * 2); c.fill();
        c.fillStyle = '#ffffff';
        c.beginPath(); c.arc(x + 13.3, y + 9.6, 0.9, 0, Math.PI * 2); c.fill();
        c.beginPath(); c.arc(x + 21.3, y + 9.6, 0.9, 0, Math.PI * 2); c.fill();
    }

    // Little pink nose.
    c.fillStyle = '#e58f9d';
    c.beginPath(); c.arc(x + 18, y + 14.8, 1.4, 0, Math.PI * 2); c.fill();

    // Miss Glider's small red bow, sat on top of the head between the ears.
    if (opts.bowColor) {
        c.fillStyle = opts.bowColor;
        c.beginPath();
        c.moveTo(x + 18, y + 3);
        c.lineTo(x + 12.5, y - 0.5);
        c.lineTo(x + 12.5, y + 6);
        c.closePath();
        c.fill();
        c.beginPath();
        c.moveTo(x + 18, y + 3);
        c.lineTo(x + 23.5, y - 0.5);
        c.lineTo(x + 23.5, y + 6);
        c.closePath();
        c.fill();
        c.fillStyle = '#a5141c';   // knot, a shade darker than the loops
        c.beginPath(); c.arc(x + 18, y + 3, 1.7, 0, Math.PI * 2); c.fill();
    }
    c.restore();
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

        // Bear-only fields, defaulted for the same reason. isFemaleBear controls the
        // smaller/scaled model + pink bow drawn in draw() below — set once by
        // createBear()'s `female` option in world.js, never changes after creation.
        this.fishingTimer = 0;
        this.fishingActionTimer = 0;
        this.isFemaleBear = false;

        // Pig-only field, same reasoning.
        this.mudParticles = [];

        // Monkey/elephant field, same reasoning. Set once by createMonkey()'s or
        // createElephant()'s `bowColor` option (world.js) — purely cosmetic, draws a small
        // bow on its head in draw() below (same idea as the female bear's pink bow).
        this.bowColor = null;

        // Cat-only fields, same reasoning. schrodingerOutcome is the (pre-determined,
        // 50/50) truth of whether the cat is "alive" or "dead" once observed — set the
        // moment it enters the box, revealed only once the player guesses.
        this.schrodingerOutcome = null;
        this.schrodingerVisible = true;
        this.schrodingerBlinkTimer = 0;

        // Bird-only fields, same reasoning. homeRegion is set once by createBird() in
        // world.js; the rest track its Lv20 "fly off to a random region" excursion perk.
        this.homeRegion = null;
        this.excursionActive = false;
        this.excursionRegion = null;
        this.excursionTimer = 0;

        // Panda-only fields, same reasoning — the Lv20 "Bamboo Fever" event.
        // stateTimer (already declared above for other pets) is reused for the
        // 'full'/'abandoned' durations.
        this.bambooChoicePending = false;

        // Sugar-glider-only fields, same reasoning (see updateGlider() below).
        //   honeyEaten/bananaEaten (+ the existing waterEaten) — progress toward the next level,
        //     since a glider is fed three different resources.
        //   stamina — current stamina; the max comes from getGliderMaxStamina(level).
        //   regionNow — the region the glider is currently in (gliders are carried around, so
        //     this is NOT fixed like homeRegion). held — true while the player is carrying it.
        //   staminaDrainTimer / restTimer — seconds toward the next -1 / +1 stamina tick.
        //   restTree — index of the Region 9 tree it's heading to / resting in (-1 = none).
        //   bowColor (shared with monkey/elephant) draws Miss Glider's red bow.
        this.honeyEaten = 0;
        this.bananaEaten = 0;
        // Chicken-only (Lv30 "chain egg"): the extra egg chance built up by consecutive eggs.
        this.chainEggBonus = 0;
        this.stamina = getGliderMaxStamina(1);
        this.regionNow = 9;
        this.held = false;
        this.staminaDrainTimer = 0;
        this.restTimer = 0;
        this.restTree = -1;
    }

    // Movement speed actually used by the AI in update(). `this.speed` stays the pet's raw
    // base speed (set by the factories in world.js, and nudged directly by the bird's
    // Lv20 bee-speed-boost perk) — the shop's Cake buff is layered on top here at read
    // time instead of being written into `this.speed`, so the two effects can never
    // overwrite/undo each other, and pets created later (bought bees, save/load
    // reconstruction) pick the buff up automatically.
    // Also multiplied by the squirrel's regional speed boost when one is running in the region this
    // pet is in (`_regionSpeedMult`, stamped by main.js every frame; 1 when there is none).
    get effectiveSpeed() {
        return this.speed * getPetSpeedMultiplier() * (this._regionSpeedMult || 1);
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
        const w = getBearWaitRange(this.level);
        this.fishingTimer = Math.random() * w.spread + w.base;
    }

    // ------------------------------------------------------------------
    // SUGAR GLIDER AI (Region 9's two pets). Gliders are tamed from level 1 and are carried
    // between regions by the player (Take / Drop — see world.js), so unlike every other pet
    // this doesn't go through the generic level-2 / wander / forage path below. What a glider
    // does depends on the region it was dropped in (this.regionNow), and only while it has
    // stamina:
    //   Regions 1,2,3,6,7  forages food + water (1 stamina per object picked up)
    //   Regions 4,5,8      passive buff (bees / bears / monkeys — applied in their own AI),
    //                      costs 1 stamina every 2 seconds
    //   Region 9           when stamina isn't full it climbs into a tree opening and rests
    //                      (+1 stamina every 2 seconds); when full it roams, waiting to be taken
    // Timers use the real wall clock (gliderRealDt, world.js) — "every 2 seconds" means 2 real
    // seconds, the same reasoning as the shop buffs (see tickShopBuffs in state.js).
    // ------------------------------------------------------------------
    gliderRoam(dt) {
        if (this.state === 'idle') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.state = 'wander';
                this.pickNewWanderTarget();
            }
            return;
        }
        if (this.state !== 'wander') {
            this.state = 'wander';
            this.pickNewWanderTarget();
        }
        let dx = this.targetX - this.x;
        let dy = this.targetY - this.y;
        let dist = Math.sqrt(dx * dx + dy * dy);
        if (dist > 5) {
            this.x += (dx / dist) * this.effectiveSpeed * dt;
            this.y += (dy / dist) * this.effectiveSpeed * dt;
        } else {
            this.state = 'idle';
            this.stateTimer = Math.random() * 3 + 1;
        }
    }

    updateGlider(dt, regionFoods, regionWaters, petFoodWaterBonus) {
        if (this.held) return; // a carried glider isn't in the update loop at all; belt and braces

        const region = this.regionNow;
        const maxStamina = getGliderMaxStamina(this.level);
        if (!(this.stamina >= 0)) this.stamina = 0;
        if (this.stamina > maxStamina) this.stamina = maxStamina;
        const clock = gliderRealDt;

        // ---------------- Region 9: rest to recharge, otherwise roam ----------------
        if (region === 9) {
            this.staminaDrainTimer = 0;
            const trees = getBedroomTrees();

            if (this.state === 'resting') {
                const tree = trees[this.restTree];
                if (!tree) {
                    this.restTree = -1;
                    this.state = 'idle';
                    this.stateTimer = 0.5;
                    return;
                }
                // Tucked inside the opening (recomputed each frame so it follows the tree if
                // the canvas is resized).
                this.x = tree.hollowX - this.size / 2;
                this.y = tree.hollowY - this.size / 2;

                // The bird's Lv20 excursion, while visiting Region 9, doubles how fast
                // restTimer fills (BIRD_VISIT_GLIDER_STAMINA_MULT, world.js) — the stamina
                // gained per tick (+1) is unchanged, the tick just arrives twice as often.
                this.restTimer += clock * getBirdVisitGliderStaminaBoost();
                while (this.restTimer >= GLIDER_REST_SECONDS && this.stamina < maxStamina) {
                    this.restTimer -= GLIDER_REST_SECONDS;
                    this.stamina += 1;
                }
                if (this.stamina >= maxStamina) {
                    // Fully rested — climb out at the foot of the tree and wander off,
                    // waiting to be picked up.
                    this.stamina = maxStamina;
                    this.restTimer = 0;
                    this.x = tree.x - this.size / 2;
                    this.y = tree.baseY - this.size / 2 + 10;
                    this.restTree = -1;
                    this.state = 'idle';
                    this.stateTimer = 1 + Math.random() * 2;
                    this.pickNewWanderTarget();
                }
                return;
            }

            if (this.stamina < maxStamina) {
                if (this.state !== 'to_rest') {
                    const idx = findFreeBedroomTree(this);
                    if (idx >= 0) {
                        this.restTree = idx;
                        this.state = 'to_rest';
                    }
                    // No free opening (both taken): just keep roaming until one is free.
                }
                if (this.state === 'to_rest') {
                    const tree = trees[this.restTree];
                    if (tree) {
                        let dx = tree.hollowX - (this.x + this.size / 2);
                        let dy = tree.hollowY - (this.y + this.size / 2);
                        let dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist > 6) {
                            this.x += (dx / dist) * this.effectiveSpeed * 1.2 * dt;
                            this.y += (dy / dist) * this.effectiveSpeed * 1.2 * dt;
                        } else {
                            this.state = 'resting';
                            this.restTimer = 0;
                            this.x = tree.hollowX - this.size / 2;
                            this.y = tree.hollowY - this.size / 2;
                        }
                        return;
                    }
                    this.restTree = -1;
                    this.state = 'idle';
                    this.stateTimer = 0.5;
                }
            } else if (this.state === 'to_rest') {
                // Got topped up some other way on the way there — never mind.
                this.restTree = -1;
                this.state = 'wander';
                this.pickNewWanderTarget();
            }

            this.gliderRoam(dt);
            return;
        }

        // ---------------- Everywhere else ----------------
        this.restTimer = 0;

        // Regions 4, 5, 8: stamina ticks down 1 per 2 seconds spent there (strict 2:1),
        // for as long as there's any left. The benefit itself is applied by the bees / bears /
        // monkeys' own code via getGliderBuff() (world.js), which also requires stamina > 0.
        if (GLIDER_DRAIN_REGIONS.indexOf(region) !== -1 && this.stamina > 0) {
            this.staminaDrainTimer += clock;
            while (this.staminaDrainTimer >= GLIDER_DRAIN_SECONDS && this.stamina > 0) {
                this.staminaDrainTimer -= GLIDER_DRAIN_SECONDS;
                this.stamina -= 1;
            }
            if (this.stamina <= 0) this.staminaDrainTimer = 0;
        } else {
            this.staminaDrainTimer = 0;
        }

        // Regions 1, 2, 3, 6, 7: forage food & water — only while there's stamina left.
        if (this.stamina > 0 && GLIDER_FORAGE_REGIONS.indexOf(region) !== -1) {
            if (this.state === 'idle') {
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) {
                    this.state = 'wander';
                    this.pickNewWanderTarget();
                }
                return;
            }

            let targetItem = null;
            let minDist = 250;
            regionFoods.forEach(f => {
                let d = Math.sqrt((f.x - this.x) ** 2 + (f.y - this.y) ** 2);
                if (d < minDist) { minDist = d; targetItem = { item: f, type: 'food', list: regionFoods }; }
            });
            regionWaters.forEach(w => {
                let d = Math.sqrt((w.x - this.x) ** 2 + (w.y - this.y) ** 2);
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
                        let y = getForageYield('glider', this.level);
                        if (targetItem.type === 'food') inventory.food += Math.round(y.food * petFoodWaterBonus);
                        else inventory.water += Math.round(y.water * petFoodWaterBonus);
                        // Strict 1:1 — one stamina per OBJECT picked up, no matter how many
                        // food/water that object was worth (level yield, perks, etc.).
                        this.stamina -= 1;
                        updateUI();
                    }
                    this.state = 'idle';
                    // Cake buff: shorter breather between forages, like every other forager.
                    this.stateTimer = (Math.random() * 2 + 1) / getPetForageMultiplier();
                    return;
                }
                this.x += (dx / dist) * this.effectiveSpeed * dt;
                this.y += (dy / dist) * this.effectiveSpeed * dt;
                return;
            }
        }

        // Nothing to do (buff regions, out of stamina, or no items nearby): just roam.
        this.gliderRoam(dt);
    }

    update(dt, regionFoods, regionWaters, activeFlowers = []) {
        // A pet sold in the shop that hasn't been bought yet isn't in the world — no AI, no
        // foraging, nothing (see isPetAvailable() in state.js and the shopId tags in world.js).
        if (!isPetAvailable(this)) return;

        // Character perk bonuses — from whichever perks the player has unlocked in the
        // Perk Tree; see getCharacterBonuses() in state.js (also the single source of
        // truth the Character screen reads).
        let charBonuses = getCharacterBonuses(character.level);
        let petFoodWaterBonus = charBonuses.petFoodWater;
        let petHoneyBonus = charBonuses.petHoney;
        let petFishBonus = charBonuses.petFish;
        let petBananaBonus = charBonuses.petBanana;
        let coinBonus = charBonuses.coin;

        // Sugar gliders have their own AI (tamed from level 1, carried between regions).
        if (this.type === 'glider') {
            this.updateGlider(dt, regionFoods, regionWaters, petFoodWaterBonus);
            return;
        }

        // --- BEE AI SYSTEM MATRIX ---
        if (this.type === 'bee') {
            if (this.state === 'whistled') this.state = 'wander';

            // Capacity and time-per-flower by level: BEE_TIERS in state.js.
            const beeTier = getBeeTier(this.level);
            let maxCapacity = beeTier.capacity;

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
                        this.x += (dx / dist) * this.effectiveSpeed * dt;
                        this.y += (dy / dist) * this.effectiveSpeed * dt;
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
                    this.x += (dx / dist) * (this.effectiveSpeed * 1.5) * dt;
                    this.y += (dy / dist) * (this.effectiveSpeed * 1.5) * dt;
                } else {
                    this.state = 'forage';
                    this.stateTimer = getBeeTier(this.level).forageSeconds;
                }
            }

            if (this.state === 'forage') {
                // Cake buff: the time spent gathering at a flower ticks down faster.
                this.stateTimer -= dt * getPetForageMultiplier();
                if (this.stateTimer <= 0) {
                    let idx = activeFlowers.indexOf(this.targetFlower);
                    if (idx > -1) {
                        activeFlowers.splice(idx, 1);
                        // No respawnQueue push here — Region 4's flowers are now
                        // refilled by processSpawns()'s count-driven "count < 5 → 2s →
                        // batch refill to 5" model (world.js), same as food/water/
                        // bananas, rather than a per-pickup 10-second timer.
                    }
                    this.targetFlower = null;
                    this.honeyCarried++;
                    // Lv30: a chance for a flower to count double toward the next level.
                    this.foodEaten += (Math.random() < getPerkChance('beeDoubleExp', this.level)) ? 2 : 1;

                    let reqFlowers = getLevelRequirement('bee', this.level);
                    if (this.level < MAX_PET_LEVEL && this.foodEaten >= reqFlowers) {
                        this.level++;
                        this.foodEaten = Math.max(0, this.foodEaten - reqFlowers); // keeps a double-exp overshoot
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
                    this.x += (dx / dist) * this.effectiveSpeed * 1.5 * dt;
                    this.y += (dy / dist) * this.effectiveSpeed * 1.5 * dt;
                } else {
                    let dropCount = this.honeyCarried;
                    if (Math.random() < getPerkChance('beeDoubleHoney', this.level)) {
                        dropCount *= 2; 
                    }
                    // Deposits into the hive's own stored pool now, not straight into the
                    // player's inventory — the player collects it manually with GIVE
                    // while standing near the hive (see executeContinuousFeed(), input.js).
                    let honeyDeposited = Math.round(dropCount * petHoneyBonus);
                    // Sugar gliders dropped in Region 4 (with stamina) boost the bees' honey
                    // yield by +50% each. roundStochastic() keeps the AVERAGE at exactly the
                    // boost even at tiny loads (a plain round of 1 x 1.5 would always be 2).
                    let gliderHoneyBuff = getGliderBuff(4);
                    if (gliderHoneyBuff > 1) honeyDeposited = roundStochastic(honeyDeposited * gliderHoneyBuff);
                    // The bird's Lv20 excursion, while visiting Region 4, adds another +25%
                    // (BIRD_VISIT_HONEY_GAIN_MULT, world.js) — independent of, and stacks
                    // with, the glider buff above.
                    let birdHoneyBuff = getBirdVisitHoneyGainBoost();
                    if (birdHoneyBuff > 1) honeyDeposited = roundStochastic(honeyDeposited * birdHoneyBuff);
                    region4Hive.honey += honeyDeposited;
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
                    this.x += (dx / dist) * this.effectiveSpeed * dt;
                    this.y += (dy / dist) * this.effectiveSpeed * dt;
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
                    this.x += (dx / dist) * (this.effectiveSpeed * 1.2) * dt;
                    this.y += (dy / dist) * (this.effectiveSpeed * 1.2) * dt;
                } else {
                    this.state = 'fishing';
                    this.fishingActionTimer = BEAR_FISHING_ACTION_SECONDS;
                }
                return;
            }

            if (this.state === 'fishing') {
                // Cake buff: fishing is the bear's foraging, so it ticks down faster too.
                // Sugar gliders in Region 5 (with stamina) speed fishing up by 25% each, and
                // the bird's Lv20 excursion, while visiting Region 5, adds another flat +50%
                // (BIRD_VISIT_FISH_SPEED_MULT, world.js) — independent of, and stacks with,
                // the glider buff.
                this.fishingActionTimer -= dt * getPetForageMultiplier() * getGliderBuff(5) * getBirdVisitFishSpeedBoost();
                
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
                    // Fish per cycle by level (BEAR_FISH_TIERS) and the double-catch chance
                    // (PERK_CHANCES.bearDoubleFish), both in state.js.
                    let fishCaught = Math.max(1, getBearFishPerCycle(this.level));
                    if (Math.random() < getPerkChance('bearDoubleFish', this.level)) fishCaught *= 2;
                    // The bird's Lv20 excursion, while visiting Region 5, adds a further +25%
                    // (BIRD_VISIT_FISH_YIELD_MULT, world.js) on top of the normal petFishBonus.
                    inventory.fish += Math.round(fishCaught * petFishBonus * getBirdVisitFishYieldBoost());
                    updateUI();
                    saveGameProgress();
                    this.setNextFishingCooldown();
                    this.state = 'wander';
                    this.pickNewWanderTarget();
                }
                return;
            }

            // Fishing itself doesn't start until Level 5 — below that the bear is tame
            // (Level 2+) and wanders normally, but never queues up a fishing trip.
            if (this.level >= 5) {
                this.fishingTimer -= dt * getPetForageMultiplier() * getGliderBuff(5) * getBirdVisitFishSpeedBoost(); // Cake buff + sugar gliders + visiting bird
                if (this.fishingTimer <= 0) {
                    this.state = 'fishing_travel';
                    return;
                }
            }

            if (this.state === 'idle') {
                this.stateTimer -= dt;
                if (this.stateTimer <= 0) { this.state = 'wander'; this.pickNewWanderTarget(); }
            } else {
                let dx = this.targetX - this.x;
                let dy = this.targetY - this.y;
                let dist = Math.sqrt(dx * dx + dy * dy);
                if (dist > 5) {
                    this.x += (dx / dist) * this.effectiveSpeed * dt;
                    this.y += (dy / dist) * this.effectiveSpeed * dt;
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
                // Award the coin exactly once, after the timer AND the particle animation both finish.
                // Lv25+ (DOG_DIG_BONUS_COIN_LEVEL, state.js): the dig awards DOG_DIG_BONUS_COIN_AMOUNT
                // coins instead of 1.
                let dogCoinsBase = (this.level >= DOG_DIG_BONUS_COIN_LEVEL) ? DOG_DIG_BONUS_COIN_AMOUNT : 1;
                let dogCoinsEarned = Math.round(dogCoinsBase * coinBonus);
                inventory.coins += dogCoinsEarned;
                if (typeof spawnCoinPopup === 'function') spawnCoinPopup(this.homeRegion, this.x + this.size / 2, this.y, dogCoinsEarned);
                updateUI();
                saveGameProgress();
                this.state = 'wander';
                this.pickNewWanderTarget();
            }
            return;
        }

                // --- BIRD EXCURSION IN PROGRESS (Lv20 perk): away from home Region 3 for
        // 30s (BIRD_EXCURSION_SECONDS). All of the actual region-specific buffs (pet speed,
        // bee speed/honey, bear fish yield/speed, glider stamina) are LIVE multipliers keyed
        // off birdExcursionRegion (world.js) and read directly wherever they apply, so there's
        // nothing to apply/revert here any more — birdExcursionRegion just needs to track
        // where the bird currently is, cleared the moment it leaves. Regions 1/2/6/7 need no
        // special-case here at all — the bird just falls through to the normal wander/forage
        // pipeline below like any other visitor, and the speed buff is folded into
        // _regionSpeedMult (main.js) the same way every pet there gets it. ---
        if (this.type === 'bird' && this.excursionActive) {
            // The trip's 30 seconds run on the REAL clock, not the game loop's `dt` — that
            // over-counts on some devices (see tickShopBuffs in state.js), which used to make
            // a "60 second" trip last about half that.
            this.excursionTimer -= gliderRealDt;

            if (this.excursionTimer <= 0) {
                // Leave the away region — show the fly-away visual there if the player
                // is currently looking at it.
                let awayArr = petsByRegion[this.excursionRegion];
                if (awayArr) {
                    let idx = awayArr.indexOf(this);
                    if (idx > -1) awayArr.splice(idx, 1);
                }
                if (typeof currentRegion !== 'undefined' && currentRegion === this.excursionRegion) {
                    spawnRegionFX(this.excursionRegion, this.x, this.y, 'depart');
                }

                // Arrive back home — show the landing visual there if the player is
                // currently looking at region 3. Clearing birdExcursionRegion here is what
                // switches every visit buff above back off.
                this.excursionActive = false;
                this.excursionRegion = null;
                birdExcursionRegion = null;
                petsByRegion[this.homeRegion].push(this);
                this.pickNewWanderTarget();
                this.x = this.targetX;
                this.y = this.targetY;
                this.state = 'wander';
                if (typeof currentRegion !== 'undefined' && currentRegion === this.homeRegion) {
                    spawnRegionFX(this.homeRegion, this.x, this.y, 'arrive');
                }

                let birdCoinsEarned = 2;
                inventory.coins += birdCoinsEarned;
                if (typeof spawnCoinPopup === 'function') spawnCoinPopup(this.homeRegion, this.x + this.size / 2, this.y, birdCoinsEarned);
                updateUI();
                saveGameProgress();
                this._justTeleported = true;
                return;
            }
        }

                // --- PANDA BAMBOO FEVER STATES ---
        // Frozen the instant the Play/Starve window opens, until the player answers it
        // (see the trigger in the forage branch below and the picker in ui.js).
        if (this.state === 'bamboo_wait') {
            return;
        }
        // Player chose Play: asleep for 20s with a 💤 above its head (drawn in draw()).
        if (this.state === 'full') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                this.state = 'wander';
                this.pickNewWanderTarget();
            }
            return; // stays completely still while asleep
        }
        // Player chose Starve: crying 😢 above its head, actively flees the player for 30s.
        if (this.state === 'abandoned') {
            this.stateTimer -= dt;

            // Flee directly away from the player...
            let dx = this.x - player.x;
            let dy = this.y - player.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            let fleeX = dx / dist;
            let fleeY = dy / dist;

            // ...plus a wall-repulsion term. Without this, "directly away from the
            // player" naturally funnels the panda into whichever corner happens to be
            // opposite wherever the player was standing when it started fleeing — and
            // once it's pinned against both edges of that corner, it has nowhere left
            // to go even as the player keeps closing the distance, so it just sits
            // there instead of continuing to run. Nudging the flee vector away from
            // any edge it's already close to keeps it actively evading along/off the
            // walls instead of getting stuck in one spot.
            const margin = 70;
            let minX = 10, maxX = canvas.width - this.size - 10;
            let minY = 10, maxY = canvas.height - this.size - 10;
            if (this.x - minX < margin) fleeX += (margin - (this.x - minX)) / margin;
            if (maxX - this.x < margin) fleeX -= (margin - (maxX - this.x)) / margin;
            if (this.y - minY < margin) fleeY += (margin - (this.y - minY)) / margin;
            if (maxY - this.y < margin) fleeY -= (margin - (maxY - this.y)) / margin;

            let fleeMag = Math.sqrt(fleeX * fleeX + fleeY * fleeY) || 1;
            fleeX /= fleeMag;
            fleeY /= fleeMag;

            let fleeSpeed = this.effectiveSpeed * 1.3;
            this.x += fleeX * fleeSpeed * dt;
            this.y += fleeY * fleeSpeed * dt;
            this.x = Math.max(minX, Math.min(maxX, this.x));
            this.y = Math.max(minY, Math.min(maxY, this.y));
            if (this.stateTimer <= 0) {
                this.state = 'wander';
                this.pickNewWanderTarget();
            }
            return;
        }

                // --- CAT SCHRÖDINGER BOX STATE: frozen in place, flickering between two
        // visual states, until the player approaches and resolves it via the PLAY
        // button (input.js) and the Dead/Alive picker (ui.js). ---
        if (this.state === 'schrodinger') {
            this.schrodingerBlinkTimer -= dt;
            if (this.schrodingerBlinkTimer <= 0) {
                this.schrodingerVisible = !this.schrodingerVisible;
                this.schrodingerBlinkTimer = 0.35;
            }
            return; // no movement, no foraging — stays put until the player observes it
        }

                // --- PIG MUD-PLAY VISUAL SYSTEM (5s timer, mirrors the dog dig system above) ---
        if (this.state === 'mud_play') {
            this.stateTimer -= dt;

            // Continuous mud splash generation while the 5-second timer counts down.
            if (this.stateTimer > 0) {
                for (let i = 0; i < 2; i++) {
                    this.mudParticles.push({
                        x: this.x + this.size / 2,
                        y: this.y + this.size - 4,
                        vx: (Math.random() - 0.5) * 70,
                        vy: -(Math.random() * 45 + 15),
                        gravity: 110,
                        life: Math.random() * 0.4 + 0.2,
                        size: Math.random() * 3 + 2
                    });
                }
            }

            // Update existing mud particles
            for (let i = this.mudParticles.length - 1; i >= 0; i--) {
                let p = this.mudParticles[i];
                p.life -= dt;
                p.vy += p.gravity * dt;
                p.x += p.vx * dt;
                p.y += p.vy * dt;
                if (p.life <= 0) {
                    this.mudParticles.splice(i, 1);
                }
            }

            if (this.stateTimer <= 0 && this.mudParticles.length === 0) {
                // 2 coins for the mud-play session, 5% chance to double to 4.
                let mudCoins = 2;
                if (Math.random() < 0.05) mudCoins *= 2;
                let pigCoinsEarned = Math.round(mudCoins * coinBonus);
                inventory.coins += pigCoinsEarned;
                if (typeof spawnCoinPopup === 'function') spawnCoinPopup(this.homeRegion, this.x + this.size / 2, this.y, pigCoinsEarned);
                updateUI();
                saveGameProgress();
                this.state = 'wander';
                this.pickNewWanderTarget();
            }
            return;
        }

                // --- MONKEY VINE-SWINGING STATE: Lv20 perk, 20s timer, swings from
        // vine to vine around the region (drawn hanging/mid-swing in draw() below),
        // pays out 5 coins once it's done. ---
        if (this.state === 'swinging') {
            this.stateTimer -= dt;
            if (this.stateTimer <= 0) {
                let monkeyCoinsEarned = Math.round(5 * coinBonus);
                inventory.coins += monkeyCoinsEarned;
                if (typeof spawnCoinPopup === 'function') spawnCoinPopup(this.homeRegion, this.x + this.size / 2, this.y, monkeyCoinsEarned);
                updateUI();
                saveGameProgress();
                this.state = 'wander';
                this.pickNewWanderTarget();
                return;
            }

            // Swings from spot to spot (a new "vine") at a boosted speed — arriving
            // immediately picks the next one, with no idle pause in between, for a
            // continuous swinging motion for the whole 20s.
            let dx = this.targetX - this.x;
            let dy = this.targetY - this.y;
            let dist = Math.sqrt(dx * dx + dy * dy);
            if (dist > 5) {
                this.x += (dx / dist) * (this.effectiveSpeed * 1.6) * dt;
                this.y += (dy / dist) * (this.effectiveSpeed * 1.6) * dt;
            } else {
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
                    this.x += (dx / dist) * this.effectiveSpeed * dt;
                    this.y += (dy / dist) * this.effectiveSpeed * dt;
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
                    this.x += (rdx / rdist) * (this.effectiveSpeed * 1.5) * dt;
                    this.y += (rdy / rdist) * (this.effectiveSpeed * 1.5) * dt;
                } else {
                    // Backed up enough! Wait for user input movement to launch
                    this.state = 'playing_wait_for_move';
                }
                return;
            }

            // Step 3: Full high-speed tag sprint!
            if (this.state === 'playing_chase') {
                if (dist > 15) {
                    this.x += (dx / dist) * (this.effectiveSpeed * 1.6) * dt;
                    this.y += (dy / dist) * (this.effectiveSpeed * 1.6) * dt;
                } else {
                    // Caught you! Award coins and reset
                    let elephantCoinsEarned = 5;
                    inventory.coins += elephantCoinsEarned;
                    if (typeof spawnCoinPopup === 'function') spawnCoinPopup(this.homeRegion, this.x + this.size / 2, this.y, elephantCoinsEarned);
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
                this.x += (dx / dist) * this.effectiveSpeed * dt;
                this.y += (dy / dist) * this.effectiveSpeed * dt;
            }
            return;
        }

        this.stateTimer -= dt;
        if (this.state === 'idle') {
            if (this.stateTimer <= 0) {
                this.state = 'wander';
                this.pickNewWanderTarget();
                
                // FIXED: Sets the exact matching sub-state string name 'playing_approach'
                if (this.type === 'elephant' && currentRegion === 2 && Math.random() < getPerkChance('elephantPlay', this.level)) {
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
                        // No respawnQueue push here — food/water/banana regions are now
                        // refilled by processSpawns()'s count-driven "count < 10 → 2s →
                        // batch refill to 10" model (world.js), which reacts to the pool
                        // shrinking regardless of whether the player or a pet (like this
                        // one) was the one who took the item. (Flowers, picked up by bees
                        // via a separate code path, still use the older per-item
                        // respawnQueue timer — untouched.)
                        
                        if (this.type === 'dog') {
                            let y = getForageYield('dog', this.level);
                            if (targetItem.type === 'food') inventory.food += Math.round(y.food * petFoodWaterBonus);
                            else inventory.water += Math.round(y.water * petFoodWaterBonus);

                            if (Math.random() < getPerkChance('dogDig', this.level)) {
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

                            // Lv20+: a chance per forage to speed up EVERY pet in this region by +50%
                            // for SQUIRREL_BOOST_SECONDS (chance in PERK_CHANCES.squirrelBoost; boosts
                            // don't stack, and a proc while one is running is ignored so it can never be chained).
                            if (Math.random() < getPerkChance('squirrelBoost', this.level)) {
                                startRegionSpeedBoost(this.homeRegion || 3);
                            }
                            } else if (this.type === 'chicken') {
                            let y = getForageYield('chicken', this.level);
                            if (targetItem.type === 'food') inventory.food += Math.round(y.food * petFoodWaterBonus);
                            else inventory.water += Math.round(y.water * petFoodWaterBonus);

                            // Lv20+: 10% chance per forage to lay an egg. At Lv30 the "chain egg" adds to
                            // that: once an egg has been laid, the NEXT forage gets +5% egg chance
                            // (15% total), and every further egg in a row raises the bonus another 5%
                            // (up to +50%). A forage that lays no egg resets the bonus to 0.
                            const chickenChain = (this.level >= CHAIN_EGG_MIN_LEVEL) ? this.chainEggBonus : 0;
                            const laysEgg = getPerkChance('chickenEgg', this.level) > 0 &&
                                            Math.random() < getPerkChance('chickenEgg', this.level) + chickenChain;
                            if (this.level >= CHAIN_EGG_MIN_LEVEL) {
                                this.chainEggBonus = laysEgg ? Math.min(CHAIN_EGG_MAX, this.chainEggBonus + CHAIN_EGG_STEP) : 0;
                            }
                            if (laysEgg) {
                                // The egg goes into the chicken's OWN region (Region 3), not whichever
                                // region the player happens to be looking at — pets keep foraging in the
                                // background, and an egg laid while the player was elsewhere used to be
                                // dropped into that other region's list, where nothing ever shows it.
                                let eggRItems = regionalItems[this.homeRegion || 3];
                                if (!eggRItems.eggs) eggRItems.eggs = [];

                                // Spawns the egg coordinates cleanly right at the chicken's current location
                                eggRItems.eggs.push({ 
                                    x: this.x + this.size / 2, 
                                    y: this.y + this.size / 2 
                                });
                                // Eggs on the map are part of the save (see eggsOnMap), so save now — a
                                // refresh before the next 10s autosave shouldn't lose it.
                                saveGameProgress();
                            }
                        } else if (this.type === 'pig') {
                            let y = getForageYield('pig', this.level);
                            if (targetItem.type === 'food') inventory.food += Math.round(y.food * petFoodWaterBonus);
                            else inventory.water += Math.round(y.water * petFoodWaterBonus);

                            // 5% chance to play in the mud for 5s after a successful forage
                            // (Level 20+ only — matches the dog/chicken rare-bonus pattern),
                            // but only while the pig is actually standing in the mud patch
                            // in the middle of the sty (getMudPatch()/isInMudPatch(), world.js —
                            // the same ellipse main.js draws, so this can't drift from it).
                            if (isInMudPatch(this.x + this.size / 2, this.y + this.size / 2) &&
                                Math.random() < getPerkChance('pigMud', this.level)) {
                                this.state = 'mud_play';
                                this.stateTimer = 5.0;
                                return;
                            }
                        } else if (this.type === 'monkey') {
                            // Bananas only — Region 8 never has anything in its "waters"
                            // slot, so `targetItem` here is always the banana it just
                            // picked up (fed in as this pet's regionFoods array by
                            // main.js, same plumbing every other forager uses).
                            let y = getForageYield('monkey', this.level);
                            // Bananas aren't "food & water", so the Basic Resource perk does NOT apply
                            // here — the only bonus is the "Bananas!" perk. roundStochastic() makes the
                            // average equal base x bonus even at these tiny yields (with no perk, the
                            // bonus is 1.0, so the result is exactly the base yield).
                            // Sugar gliders in Region 8 (with stamina) add +50% each on top.
                            inventory.bananas += roundStochastic(y.food * petBananaBonus * getGliderBuff(8));

                            // Level 20+: 5% chance per successful forage to swing from
                            // vine to vine around the region for 20s, paying out 5 coins
                            // once it's done (handled when the 'swinging' state's timer
                            // runs out, below).
                            if (Math.random() < getPerkChance('monkeySwing', this.level)) {
                                this.state = 'swinging';
                                this.stateTimer = 20.0;
                                this.pickNewWanderTarget(); // first vine to swing to
                                return;
                            }
                        } else if (this.type === 'cat') {
                            let y = getForageYield('cat', this.level);
                            let gain = (targetItem.type === 'food') ? y.food : y.water;
                            let finalGain = Math.round(gain * petFoodWaterBonus);
                            // Level 15+: 10% chance to double whatever was actually granted.
                            if (Math.random() < getPerkChance('catDouble', this.level)) finalGain *= 2;
                            if (targetItem.type === 'food') inventory.food += finalGain;
                            else inventory.water += finalGain;

                            // Level 20+: 3% chance per successful forage to enter the
                            // Schrödinger box — freezes in place until the player comes
                            // over and calls it. Only rolls while the player is actually
                            // standing in the cat's region (Region 1), matching the
                            // panda's Bamboo Fever "must be in the region" rule.
                            if (typeof currentRegion !== 'undefined' && currentRegion === 1 &&
                                Math.random() < getPerkChance('catSchrodinger', this.level)) {
                                this.state = 'schrodinger';
                                this.schrodingerOutcome = Math.random() < 0.5 ? 'alive' : 'dead';
                                this.schrodingerVisible = true;
                                this.schrodingerBlinkTimer = 0.35;
                                updateUI();
                                return;
                            }
                        } else if (this.type === 'bird') {
                            let y = getForageYield('bird', this.level);
                            let gain = (targetItem.type === 'food') ? y.food : y.water;
                            // Its own forage yield plus whatever the player's character-level
                            // bonuses are (petFoodWaterBonus) — same formula whether the bird
                            // is home in Region 3 or visiting one of the other food/water
                            // regions (1, 2, 6, 7) on an excursion. No extra excursion-only
                            // bonus any more — see BIRD_VISIT_* (world.js) for what visiting
                            // actually does instead (region-specific buffs, not its own yield).
                            let finalGain = Math.round(gain * petFoodWaterBonus);
                            if (targetItem.type === 'food') inventory.food += finalGain;
                            else inventory.water += finalGain;

                            // Lv20+: 5% chance per successful forage (from its home region
                            // only — can't trigger a new trip mid-excursion) to fly off to a
                            // random other *unlocked* region for BIRD_EXCURSION_SECONDS (30s).
                            // Filtering to unlocked regions matters because the bird only needs
                            // to be Lv20 itself — every other region can still be locked for
                            // the player at that point.
                            if (!this.excursionActive && Math.random() < getPerkChance('birdFly', this.level)) {
                                let choices = ALL_REGIONS.filter(r => r !== this.homeRegion &&
                                    (typeof isRegionUnlocked !== 'function' || isRegionUnlocked(r)));

                                if (choices.length > 0) {
                                    let target = choices[Math.floor(Math.random() * choices.length)];

                                    if (typeof currentRegion !== 'undefined' && currentRegion === this.homeRegion) {
                                        spawnRegionFX(this.homeRegion, this.x, this.y, 'depart');
                                    }

                                    let homeArr = petsByRegion[this.homeRegion];
                                    let idx = homeArr.indexOf(this);
                                    if (idx > -1) homeArr.splice(idx, 1);

                                    this.excursionActive = true;
                                    this.excursionRegion = target;
                                    this.excursionTimer = BIRD_EXCURSION_SECONDS;
                                    // Switches on whichever BIRD_VISIT_* buff applies to this
                                    // region (world.js) — bee speed/honey in 4, bear fish
                                    // yield/speed in 5, glider stamina in 9, or just the flat
                                    // pet-speed bonus everywhere else via _regionSpeedMult.
                                    birdExcursionRegion = target;
                                    this.pickNewWanderTarget();
                                    this.x = this.targetX;
                                    this.y = this.targetY;
                                    this.state = 'wander';
                                    petsByRegion[target].push(this);

                                    if (typeof currentRegion !== 'undefined' && currentRegion === target) {
                                        spawnRegionFX(target, this.x, this.y, 'arrive');
                                    }

                                    updateUI();
                                    saveGameProgress();
                                    this._justTeleported = true;
                                    return;
                                }
                            }
                        } else if (this.type === 'panda') {
                            let y = getForageYield('panda', this.level);
                            let gain = (targetItem.type === 'food') ? y.food : y.water;
                            let finalGain = Math.round(gain * petFoodWaterBonus);
                            if (targetItem.type === 'food') inventory.food += finalGain;
                            else inventory.water += finalGain;

                            // Lv20+: 5% chance per forage — only while the player is
                            // actually standing in Region 7, and only if a round isn't
                            // already running (now that Play lets the panda resume normal
                            // foraging during the minigame instead of freezing, it could
                            // otherwise re-roll and stack a second round on top).
                            if (typeof currentRegion !== 'undefined' && currentRegion === 7 &&
                                (typeof bambooFever === 'undefined' || !bambooFever.active) &&
                                Math.random() < getPerkChance('pandaFever', this.level)) {
                                this.state = 'bamboo_wait';
                                updateUI();
                                if (typeof showBambooFeverPicker === 'function') showBambooFeverPicker(this);
                                return;
                            }
                        }

                        updateUI();
                    }
                    this.state = 'idle';
                    // Cake buff: shorter breather between forages.
                    this.stateTimer = (Math.random() * 2 + 1) / getPetForageMultiplier(); 
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
                this.x += (dx / dist) * this.effectiveSpeed * dt;
                this.y += (dy / dist) * this.effectiveSpeed * dt;
            } else if (this.state === 'wander') {
                this.state = 'idle';
                this.stateTimer = Math.random() * 3 + 1; 
            }
        }
    }



// Works out, from how far the pet has moved since it was last DRAWN, whether it is walking, which
    // way it faces and how far along its walk cycle it is — so the sprite animation needs nothing from
    // the AI code. A jump bigger than a few pixels (the pet moved while its region wasn't on screen)
    // is ignored rather than treated as a sprint.
    trackSpriteMotion() {
        if (this._spriteX === undefined) { this._spriteX = this.x; this._spriteY = this.y; }
        const dx = this.x - this._spriteX;
        const dy = this.y - this._spriteY;
        const moved = Math.sqrt(dx * dx + dy * dy);
        this._spriteX = this.x;
        this._spriteY = this.y;
        const now = Date.now();
        if (moved > 0.05 && moved < 20) {
            this._spriteMovingUntil = now + 150;   // short hold so a 1-frame pause doesn't flicker
            this._spriteStep = (this._spriteStep || 0) + moved;
            if (Math.abs(dx) > 0.05) this.facing = dx > 0 ? 1 : -1;
        }
        return now < (this._spriteMovingUntil || 0);
    }

    draw() {
        // A pet sold in the shop that hasn't been bought yet isn't in the world (see isPetAvailable()).
        if (!isPetAvailable(this)) return;
        if (this._justTeleported) {
            this._justTeleported = false;
            return;
        }
        if (this.type === 'dog') {
            // Sprite animation (see PET_SPRITES): digging = scratching, walking = 4-frame walk cycle
            // driven by distance, otherwise sitting with a wagging tail.
            const walking = this.trackSpriteMotion();
            if (this.state === 'digging') {
                drawPetSprite(ctx, 'dog', 'dig', Math.floor(Date.now() / 250) % 2, this.x, this.y, this.facing || 1);
            } else if (walking) {
                drawPetSprite(ctx, 'dog', 'walk', Math.floor((this._spriteStep || 0) / PET_STEP_PIXELS) % 4, this.x, this.y, this.facing || 1);
            } else {
                drawPetSprite(ctx, 'dog', 'sit', Math.floor(Date.now() / 400) % 2, this.x, this.y, 1);
            }
        } else if (this.type === 'elephant') {
            // Sprite animation (see PET_SPRITES): 'idle' sways/blinks while standing still,
            // 'walk' is the real side-profile 4-frame leg cycle (driven by distance, same
            // PET_STEP_PIXELS convention as the dog/cat) while wandering/foraging, and
            // 'jump' (trunk raised, a little hop) is reserved for the Lv20 "catch me" tag
            // minigame (playing_approach/retreat/chase) so that chase still reads as an
            // excited hop rather than an ordinary walk. bowColor picks the separate
            // elephantBow sprite set (baked-in white bow) instead of drawing an overlay —
            // the Bow Elephant is always created with bowColor: '#ffffff' (see world.js),
            // so the actual color value isn't read, only whether one is set.
            const spriteType = this.bowColor ? 'elephantBow' : 'elephant';
            const walking = this.trackSpriteMotion();
            const playingTag = this.state && this.state.indexOf('playing') === 0;
            if (playingTag) {
                drawPetSprite(ctx, spriteType, 'jump', Math.floor(Date.now() / 220) % 2, this.x, this.y, this.facing || 1);
            } else if (walking) {
                drawPetSprite(ctx, spriteType, 'walk', Math.floor((this._spriteStep || 0) / PET_STEP_PIXELS) % 4, this.x, this.y, this.facing || 1);
            } else {
                drawPetSprite(ctx, spriteType, 'idle', Math.floor(Date.now() / 500) % 2, this.x, this.y, this.facing || 1);
            }
        } else if (this.type === 'squirrel') {
            // Idle (sitting with an acorn, 2 frames — ear-twitch on frame 1) while still;
            // scamper (4-frame leap cycle) is the only movement animation, used whenever
            // the squirrel is actually moving, in place of a walk cycle.
            const walking = this.trackSpriteMotion();
            if (walking) {
                drawPetSprite(ctx, 'squirrel', 'scamper', Math.floor((this._spriteStep || 0) / PET_STEP_PIXELS) % 4, this.x, this.y, this.facing || 1);
            } else {
                drawPetSprite(ctx, 'squirrel', 'idle', Math.floor(Date.now() / 500) % 2, this.x, this.y, this.facing || 1);
            }
        } else if (this.type === 'chicken') {
            // Idle (2-frame blink) and walk (4-frame side-profile cycle) are the everyday
            // animations. While moving, a bout timer rerolls every ~1.2-2s: 2/10 of the
            // time the chicken switches to 'hop' (the JUMP+FLAP pair from the reference
            // sheet) for that stretch instead of walking, then returns to walk on the next
            // roll. Purely cosmetic — doesn't touch movement speed, state, or the save.
            const walking = this.trackSpriteMotion();
            if (walking) {
                const now = Date.now();
                if (!this._chickenHopRollAt || now > this._chickenHopRollAt) {
                    this._chickenHopping = Math.random() < 0.2;
                    this._chickenHopRollAt = now + 1200 + Math.random() * 800;
                }
                if (this._chickenHopping) {
                    drawPetSprite(ctx, 'chicken', 'hop', Math.floor(Date.now() / 220) % 2, this.x, this.y, this.facing || 1);
                } else {
                    drawPetSprite(ctx, 'chicken', 'walk', Math.floor((this._spriteStep || 0) / PET_STEP_PIXELS) % 4, this.x, this.y, this.facing || 1);
                }
            } else {
                this._chickenHopRollAt = 0; // fresh roll next time it starts moving again
                drawPetSprite(ctx, 'chicken', 'idle', Math.floor(Date.now() / 500) % 2, this.x, this.y, this.facing || 1);
            }
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
            let isFemale = this.type === 'bear' && this.isFemaleBear;

            ctx.save();
            if (isFemale) {
                // Slightly smaller model — scale the whole drawing down around its own
                // top-left anchor (bx, by) so this.x/this.y/this.size (used for
                // collision, wander bounds, the progress bar, etc.) still line up with
                // what's actually drawn.
                let scale = 0.85;
                ctx.translate(bx, by);
                ctx.scale(scale, scale);
                ctx.translate(-bx, -by);
            }

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

            if (isFemale) {
                // Pink bow on the head — two triangular "loops" plus a small knot,
                // sat just above the ears.
                ctx.fillStyle = '#ff6fa5';
                ctx.beginPath();
                ctx.moveTo(bx + 18, by - 6);
                ctx.lineTo(bx + 10, by - 11);
                ctx.lineTo(bx + 10, by - 1);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(bx + 18, by - 6);
                ctx.lineTo(bx + 26, by - 11);
                ctx.lineTo(bx + 26, by - 1);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#e0559a';
                ctx.fillRect(bx + 16, by - 8, 4, 4);
            }

            ctx.restore();
        } else if (this.type === 'pig') {
            // Accent color for ears/snout/legs: a shade darker than the body color,
            // same trick squirrel uses to keep one draw routine work for two colors.
            let accent = this.color === '#ffb6c1' ? '#ff8fab' : '#7f8c8d';
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x + 4, this.y + 12, 28, 18);  // body
            ctx.fillRect(this.x + 20, this.y + 4, 14, 12);  // head
            ctx.fillStyle = accent;
            ctx.fillRect(this.x + 20, this.y, 5, 6);        // ear
            ctx.fillRect(this.x + 29, this.y, 5, 6);        // ear
            ctx.fillRect(this.x + 28, this.y + 10, 8, 6);   // snout
            ctx.fillStyle = '#000000';
            ctx.fillRect(this.x + 30, this.y + 12, 2, 2);   // nostril
            ctx.fillRect(this.x + 34, this.y + 12, 2, 2);   // nostril
            ctx.fillRect(this.x + 26, this.y + 7, 2, 2);    // eye
            ctx.fillStyle = this.color;
            ctx.fillRect(this.x + 8, this.y + 28, 4, 6);    // leg
            ctx.fillRect(this.x + 22, this.y + 28, 4, 6);   // leg
            ctx.strokeStyle = this.color;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.arc(this.x + 2, this.y + 14, 3, 0, Math.PI * 1.5); // curly tail
            ctx.stroke();
        } else if (this.type === 'monkey') {
            // Brown, same color regardless of level/state. `this.color` is set by
            // createMonkey() (world.js) to keep this consistent with how every other
            // pet's body color is threaded through.
            let swinging = this.state === 'swinging';

            if (swinging) {
                // Hanging from a vine dangling down from directly above it — draw the
                // vine first so the monkey sits in front of/at the end of it.
                ctx.strokeStyle = '#4a7c2f';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.moveTo(this.x + this.size / 2, this.y - 20);
                ctx.lineTo(this.x + this.size / 2, this.y + 2);
                ctx.stroke();
            }

            ctx.fillStyle = this.color;                         // body
            ctx.fillRect(this.x + 6, this.y + 12, 22, 16);
            ctx.fillRect(this.x + 10, this.y + 2, 16, 12);       // head
            ctx.fillStyle = '#c98a55';                           // muzzle patch
            ctx.fillRect(this.x + 13, this.y + 7, 10, 7);
            ctx.fillStyle = this.color;                          // ears
            ctx.beginPath();
            ctx.arc(this.x + 10, this.y + 6, 4, 0, Math.PI * 2);
            ctx.arc(this.x + 26, this.y + 6, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';                           // eyes
            ctx.fillRect(this.x + 14, this.y + 8, 2, 2);
            ctx.fillRect(this.x + 20, this.y + 8, 2, 2);
            ctx.fillStyle = this.color;                          // arms
            if (swinging) {
                // Both arms up, gripping the vine overhead.
                ctx.fillRect(this.x + 4, this.y - 2, 4, 16);
                ctx.fillRect(this.x + 28, this.y - 2, 4, 16);
            } else {
                ctx.fillRect(this.x + 2, this.y + 14, 4, 12);
                ctx.fillRect(this.x + 30, this.y + 14, 4, 12);
            }
            ctx.fillRect(this.x + 10, this.y + 28, 4, 6);        // legs
            ctx.fillRect(this.x + 22, this.y + 28, 4, 6);
            ctx.strokeStyle = this.color;                        // tail
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(this.x + 6, this.y + 20);
            ctx.quadraticCurveTo(this.x - 8, this.y + 22, this.x - 6, this.y + 10);
            ctx.stroke();

            if (this.bowColor) {
                // Small bow on the head — same two-triangle-plus-knot shape as the
                // female bear's, just smaller and positioned for the monkey's head.
                ctx.fillStyle = this.bowColor;
                ctx.beginPath();
                ctx.moveTo(this.x + 18, this.y - 1);
                ctx.lineTo(this.x + 12, this.y - 5);
                ctx.lineTo(this.x + 12, this.y + 2);
                ctx.closePath();
                ctx.fill();
                ctx.beginPath();
                ctx.moveTo(this.x + 18, this.y - 1);
                ctx.lineTo(this.x + 24, this.y - 5);
                ctx.lineTo(this.x + 24, this.y + 2);
                ctx.closePath();
                ctx.fill();
                ctx.fillStyle = '#1e8449';
                ctx.fillRect(this.x + 16.5, this.y - 3, 3, 3);
            }
        } else if (this.type === 'cat') {
            let boxed = this.state === 'schrodinger';
            let flipped = boxed && !this.schrodingerVisible;
            ctx.save();
            if (flipped) {
                // "Flipping in place" — mirror the cat upside down in alternating frames
                // rather than actually moving it, per the frozen-in-the-box behavior.
                let cx = this.x + this.size / 2;
                let cy = this.y + this.size / 2;
                ctx.translate(cx, cy);
                ctx.rotate(Math.PI);
                ctx.translate(-cx, -cy);
            }
            // Sprite animation: walking = 4-frame walk cycle, standing still = curled up asleep (with
            // zzz). Frozen in the Schrodinger box it just stands (the flip above turns it upside down).
            const walking = this.trackSpriteMotion();
            if (boxed) {
                drawPetSprite(ctx, 'cat', 'walk', 1, this.x, this.y, this.facing || 1);
            } else if (walking) {
                drawPetSprite(ctx, 'cat', 'walk', Math.floor((this._spriteStep || 0) / PET_STEP_PIXELS) % 4, this.x, this.y, this.facing || 1);
            } else {
                drawPetSprite(ctx, 'cat', 'sleep', Math.floor(Date.now() / 700) % 2, this.x, this.y, this.facing || 1);
            }
            ctx.restore();

            if (boxed) {
                // Subtle glow ring so the box state still reads clearly even in the
                // instant the flip makes the sprite look like an ordinary upright cat.
                ctx.strokeStyle = 'rgba(155, 89, 182, 0.6)';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(this.x + this.size / 2, this.y + this.size / 2, this.size / 2 + 5, this.size / 2 + 5, 0, 0, Math.PI * 2);
                ctx.stroke();
            }
        } else if (this.type === 'bird') {
            let bob = Math.sin(Date.now() / 180) * 2; // small idle bob, purely cosmetic
            let by = this.y + bob;
            ctx.fillStyle = this.color;                  // body
            ctx.beginPath();
            ctx.ellipse(this.x + 16, by + 20, 12, 9, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();                              // head
            ctx.arc(this.x + 26, by + 12, 7, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#f39c12';                    // beak
            ctx.beginPath();
            ctx.moveTo(this.x + 32, by + 12);
            ctx.lineTo(this.x + 38, by + 14);
            ctx.lineTo(this.x + 32, by + 16);
            ctx.closePath();
            ctx.fill();
            ctx.fillStyle = '#000000';                    // eye
            ctx.fillRect(this.x + 27, by + 9, 2, 2);
            ctx.fillStyle = '#2c2c2c';                     // wing
            ctx.beginPath();
            ctx.ellipse(this.x + 12, by + 18, 7, 5, -0.4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = this.color;                   // tail
            ctx.beginPath();
            ctx.moveTo(this.x + 4, by + 18);
            ctx.lineTo(this.x - 6, by + 12);
            ctx.lineTo(this.x - 6, by + 24);
            ctx.closePath();
            ctx.fill();
        } else if (this.type === 'panda') {
            ctx.fillStyle = '#ffffff';                    // body
            ctx.beginPath();
            ctx.ellipse(this.x + 18, this.y + 20, 15, 12, 0, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();                               // head
            ctx.arc(this.x + 18, this.y + 5, 11, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';                     // ears
            ctx.beginPath();
            ctx.arc(this.x + 9, this.y - 3, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.arc(this.x + 27, this.y - 3, 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';                     // eye patches
            ctx.beginPath();
            ctx.ellipse(this.x + 12, this.y + 5, 3.5, 4.5, -0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.beginPath();
            ctx.ellipse(this.x + 24, this.y + 5, 3.5, 4.5, 0.3, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#000000';                     // legs
            ctx.fillRect(this.x + 6, this.y + 28, 5, 7);
            ctx.fillRect(this.x + 25, this.y + 28, 5, 7);

            if (this.state === 'full') {
                ctx.font = '14px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('💤', this.x + 18, this.y - 12);
                ctx.textAlign = 'left';
            } else if (this.state === 'abandoned') {
                ctx.font = '14px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('😢', this.x + 18, this.y - 12);
                ctx.textAlign = 'left';
            }
        } else if (this.type === 'glider') {
            const tree = (this.state === 'resting') ? getBedroomTrees()[this.restTree] : null;
            if (tree) {
                // Resting: tucked inside the tree's opening — only the sleeping face shows,
                // clipped to the hollow's outline.
                ctx.save();
                ctx.beginPath();
                ctx.ellipse(tree.hollowX, tree.hollowY, tree.hollowRX, tree.hollowRY, 0, 0, Math.PI * 2);
                ctx.clip();
                ctx.fillStyle = '#24160d';
                ctx.fillRect(tree.hollowX - tree.hollowRX, tree.hollowY - tree.hollowRY, tree.hollowRX * 2, tree.hollowRY * 2);
                ctx.translate(tree.hollowX, tree.hollowY + 4);
                ctx.scale(0.62, 0.62);
                drawGliderModel(ctx, -18, -18, { bowColor: this.bowColor, sleeping: true });
                ctx.restore();
                // Re-stroke the opening's rim over the sprite so it reads as "inside".
                ctx.strokeStyle = '#6b4526';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.ellipse(tree.hollowX, tree.hollowY, tree.hollowRX, tree.hollowRY, 0, 0, Math.PI * 2);
                ctx.stroke();
                ctx.font = '12px monospace';
                ctx.textAlign = 'center';
                ctx.fillText('💤', tree.hollowX + tree.hollowRX + 6, tree.hollowY - tree.hollowRY + 4);
                ctx.textAlign = 'left';
            } else {
                drawGliderModel(ctx, this.x, this.y, { bowColor: this.bowColor });
            }
        }

        ctx.fillStyle = '#fff';
        ctx.font = '10px monospace';
        ctx.textAlign = 'center';
        
        let text = `${this.label} Lv.${this.level}`;
        
        if (this.state === 'whistled') {
            text += ' [WHISTLED]';
        } else if (this.level > 1 || this.type === 'bee' || this.type === 'bear' || this.type === 'glider') {
            // FIXED: Checks if Elephant is in any of its custom chase sub-states, keeping tag as [PLAYING]
            if (this.type === 'glider' && this.state === 'to_rest') {
                // Heading for a tree opening in Region 9 (the label becomes [RESTING] once inside).
                text += ' [TO TREE]';
            } else if (this.type === 'glider' && this.stamina <= 0 && this.regionNow !== 9 &&
                       this.state !== 'held' && this.state !== 'resting') {
                // Out of stamina away from Region 9: it does nothing until it's taken back to rest.
                text += ' [TIRED]';
            } else if (this.state.startsWith('playing') || this.state === 'playing_wait_for_move') {
                text += ' [PLAYING]';
            } else if (this.type === 'bee' && (this.state === 'travel' || this.state === 'return_hive')) {
                // Both legs of the bee's flower run (heading to a flower, or heading
                // back to the hive to drop off honey) read simply as foraging.
                text += ' [FORAGE]';
            } else if (this.type === 'bear' && this.state === 'fishing_travel') {
                // Heading to the lake is still just "fishing" from the player's view.
                text += ' [FISHING]';
            } else if (this.state === 'mud_play') {
                text += ' [MUD PLAY]';
            } else {
                text += ` [${this.state.toUpperCase()}]`;
            }
        }
        
        // A speed boost from the squirrel is running in this pet's region.
        if (this._regionSpeedMult > 1) text += ' \u26A1';

        // Drawn on the sharp overlay (see CRISP PET TEXT in world.js), not the game canvas.
        drawPetText(text, this.x + (this.size / 2), this.y - 16);

            if (this.level < MAX_PET_LEVEL) {
                let progressRatio = 0;
                if (this.type === 'bee' || this.type === 'bear' || this.type === 'monkey') {
                    let totalReq = getLevelRequirement(this.type, this.level);
                    progressRatio = this.foodEaten / totalReq;
            } else if (this.type === 'glider') {
                // Three resources (honey + bananas + water), same "total eaten / total needed" idea.
                let req = getLevelRequirement('glider', this.level);
                let totalNeeded = req.honey + req.bananas + req.water;
                let totalEaten = this.honeyEaten + this.bananaEaten + this.waterEaten;
                progressRatio = totalNeeded > 0 ? (totalEaten / totalNeeded) : 0;
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

        // Sugar glider stamina bar (+ number) under the model: teal while healthy, red when
        // it's nearly out.
        if (this.type === 'glider') {
            let maxStamina = getGliderMaxStamina(this.level);
            let ratio = maxStamina > 0 ? Math.min(1, Math.max(0, this.stamina / maxStamina)) : 0;
            let sBarWidth = this.size + 8;
            let sBarHeight = 5;
            let sBarX = this.x + (this.size / 2) - (sBarWidth / 2);
            let sBarY = this.y + this.size + 6;

            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
            ctx.fillRect(sBarX - 1, sBarY - 1, sBarWidth + 2, sBarHeight + 2);
            ctx.fillStyle = ratio < 0.25 ? '#e74c3c' : '#1abc9c';
            ctx.fillRect(sBarX, sBarY, sBarWidth * ratio, sBarHeight);

            drawPetText(`⚡${Math.floor(this.stamina)}/${maxStamina}`, this.x + this.size / 2, sBarY + sBarHeight + 10, { size: 9 });
        }

        if (this.digParticles && this.digParticles.length > 0) {
            this.digParticles.forEach(p => {
                ctx.fillStyle = (p.life > 0.3) ? '#5c3d12' : '#8c6239';
                ctx.fillRect(p.x, p.y, p.size, p.size);
            });
        }

        // Mud splash particles for the pig's mud-play state.
        if (this.mudParticles && this.mudParticles.length > 0) {
            this.mudParticles.forEach(p => {
                ctx.fillStyle = (p.life > 0.3) ? '#6b4226' : '#3e2723';
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
