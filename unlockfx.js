// ============================================================
// unlockfx.js - celebration effect when something is unlocked (region, pet, drone, theme, tamer, perk, feeder upgrade).
// playUnlockFx({ icon, title, sub, big }) shows a flash, a burst of pixel confetti and a pop-in banner, then fades away.
// Never blocks input (pointer-events: none) and queues if several unlocks happen back to back.
// Load anywhere before main.js; callers guard with typeof playUnlockFx === 'function'.
// ============================================================
const unlockFxQueue = [];
let unlockFxBusy = false;

function playUnlockFx(opts) {
    unlockFxQueue.push(opts || {});
    if (!unlockFxBusy) unlockFxNext();
}

function unlockFxNext() {
    const o = unlockFxQueue.shift();
    if (!o) { unlockFxBusy = false; return; }
    unlockFxBusy = true;
    const host = document.getElementById('gameContainer') || document.body;
    const big = o.big !== false;
    const life = big ? 2.4 : 1.5;

    const root = document.createElement('div');
    root.style.cssText = 'position:absolute; inset:0; z-index:30000; pointer-events:none; overflow:hidden;';
    const cv = document.createElement('canvas');
    const W = host.clientWidth || 390, H = host.clientHeight || 700;
    cv.width = W; cv.height = H; cv.style.cssText = 'position:absolute; inset:0; width:100%; height:100%; image-rendering:pixelated;';
    root.appendChild(cv);

    if (big) {                                           // quick white-gold flash
        const fl = document.createElement('div');
        fl.style.cssText = 'position:absolute; inset:0; background:radial-gradient(circle at 50% 38%, rgba(255,244,190,0.85), rgba(255,244,190,0) 65%); opacity:1; transition:opacity 0.6s ease-out;';
        root.appendChild(fl);
        requestAnimationFrame(() => requestAnimationFrame(() => { fl.style.opacity = '0'; }));
    }

    const card = document.createElement('div');
    card.style.cssText = 'position:absolute; left:50%; top:' + (big ? '34%' : '22%') + '; transform:translate(-50%,-50%) scale(0.3); opacity:0;' +
        'min-width:200px; max-width:84%; text-align:center; padding:' + (big ? '16px 22px' : '9px 16px') + '; color:#fff; font-family:monospace;' +
        'background:rgba(20,16,40,0.9); border:3px solid #ffd54a; border-radius:14px; box-shadow:0 0 24px rgba(255,213,74,0.75);' +
        'transition:transform 0.38s cubic-bezier(0.2,1.6,0.4,1), opacity 0.25s;';
    const ic = o.icon ? '<div style="font-size:' + (big ? 46 : 26) + 'px; line-height:1.1;">' + o.icon + '</div>' : '';
    card.innerHTML = ic + '<div style="font-size:' + (big ? 13 : 11) + 'px; letter-spacing:3px; color:#ffd54a; font-weight:bold; margin-top:2px;">UNLOCKED!</div>' +
        '<div style="font-size:' + (big ? 17 : 13) + 'px; font-weight:bold; margin-top:3px;">' + String(o.title || '').replace(/</g, '&lt;') + '</div>' +
        (o.sub ? '<div style="font-size:11px; color:#c9d3df; margin-top:3px;">' + String(o.sub).replace(/</g, '&lt;') + '</div>' : '');
    root.appendChild(card);
    host.appendChild(root);
    requestAnimationFrame(() => requestAnimationFrame(() => { card.style.opacity = '1'; card.style.transform = 'translate(-50%,-50%) scale(1)'; }));

    // pixel confetti + sparkles, bursting from behind the banner
    const cols = ['#ffd54a', '#ff7eb6', '#6ec6ff', '#8dec7e', '#ffffff', '#ff9a4a', '#c39bff'];
    const n = big ? 90 : 34, cx = W / 2, cy = H * (big ? 0.34 : 0.22), parts = [];
    for (let i = 0; i < n; i++) {
        const a = Math.random() * Math.PI * 2, s = (big ? 90 : 60) + Math.random() * (big ? 330 : 190);
        parts.push({ x: cx, y: cy, vx: Math.cos(a) * s, vy: Math.sin(a) * s - 120, c: cols[i % cols.length], sz: 3 + Math.floor(Math.random() * 3) * 2, star: Math.random() < 0.25, t: 0.9 + Math.random() * 0.9 });
    }
    const g = cv.getContext('2d'); g.imageSmoothingEnabled = false;
    let last = performance.now(), age = 0;
    function frame(now) {
        const dt = Math.min(0.05, (now - last) / 1000); last = now; age += dt;
        g.clearRect(0, 0, W, H);
        parts.forEach(p => {
            p.t -= dt; if (p.t <= 0) return;
            p.vy += 520 * dt; p.vx *= (1 - 0.8 * dt); p.x += p.vx * dt; p.y += p.vy * dt;
            g.globalAlpha = Math.min(1, p.t * 2.2); g.fillStyle = p.c;
            const x = Math.round(p.x), y = Math.round(p.y), s = p.sz;
            if (p.star) { g.fillRect(x - s, y, s * 3, s); g.fillRect(x, y - s, s, s * 3); }   // plus-shaped sparkle
            else g.fillRect(x, y, s, s);
        });
        g.globalAlpha = 1;
        if (age > life - 0.4) root.style.opacity = String(Math.max(0, (life - age) / 0.4));
        if (age < life) requestAnimationFrame(frame);
        else { root.remove(); setTimeout(unlockFxNext, big ? 150 : 50); }
    }
    requestAnimationFrame(frame);
}
