// ============================================================
// backbutton.js - Android BACK button / browser back behaviour.
// Loads after unlockfx.js, before main.js.
//  - BACK closes the top-most open screen/dialog/picker first (one per press).
//  - With nothing open, the first BACK shows "Press back again to exit"; a second BACK within 2.5 s leaves the game.
//  - Mini-games (fishing) are never exited by accident: BACK gives up the line, like the "Give up" button.
//  - Uses the Capacitor App plugin when the APK has it, otherwise a history trap (works in the APK WebView and in a browser).
// ============================================================
(function () {
    const EXIT_WINDOW_MS = 2500;
    let lastBackAt = 0;

    function shown(el) {
        if (!el) return false;
        const cs = getComputedStyle(el);
        return cs.display !== 'none' && cs.visibility !== 'hidden' && el.getClientRects().length > 0;
    }
    // Presses a close control the same way a finger would (addTap listens to mouse/touch, others to click).
    function press(el) {
        if (!el) return false;
        const r = el.getBoundingClientRect();
        const o = { bubbles: true, cancelable: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2, button: 0 };
        el.dispatchEvent(new MouseEvent('mousedown', o));
        el.dispatchEvent(new MouseEvent('mouseup', o));
        el.dispatchEvent(new MouseEvent('click', o));
        return true;
    }
    const byId = (id) => document.getElementById(id);

    // Top-most first. Each entry: [overlay id, how to close it].
    const LAYERS = [
        ['gameDialogOverlay', (el) => { el.remove(); }],
        ['tutorialOverlay', () => { /* must be read: BACK is swallowed, OK closes it */ return true; }],
        ['fishingOverlay', () => press(byId('fishingCancel'))],
        ['settingsOverlay', () => { if (typeof closeSettings === 'function') closeSettings(); }],
        ['petDetailOverlay', () => { if (typeof hidePetDetail === 'function') hidePetDetail(); }],
        ['whistlePicker', () => { if (typeof hideWhistlePicker === 'function') hideWhistlePicker(); }],
        ['schrodingerPicker', () => { if (typeof hideSchrodingerPicker === 'function') hideSchrodingerPicker(); }],
        ['bambooFeverPicker', () => { if (typeof hideBambooFeverPicker === 'function') hideBambooFeverPicker(); }],
        ['devPanel', () => press(byId('closeDev'))],
        ['bagOverlay', () => press(byId('bagClose'))],
        ['characterOverlay', () => press(byId('characterClose'))],
        ['shopOverlay', () => press(byId('shopClose'))],
        ['perkTreeOverlay', () => press(byId('perkTreeClose'))],
        ['achievementsOverlay', () => press(byId('achievementsClose'))],
        ['statsOverlay', () => press(byId('statsClose'))],
        ['helpOverlay', () => press(byId('helpClose'))],
        ['tasksOverlay', () => press(byId('tasksClose'))],
        ['codexOverlay', () => press(byId('codexClose'))],
        ['regionsOverlay', () => press(byId('regionsClose'))],
        ['menuOverlay', () => press(byId('menuClose'))]
    ];

    function toast(text) {
        if (typeof showInfoToast === 'function') { showInfoToast(text); return; }
        let t = byId('backToast');
        if (!t) {
            t = document.createElement('div');
            t.id = 'backToast';
            t.style.cssText = 'position:fixed; left:50%; bottom:12%; transform:translateX(-50%); background:rgba(0,0,0,0.8); color:#fff; font:13px monospace; padding:8px 14px; border-radius:8px; z-index:30000;';
            document.body.appendChild(t);
        }
        t.textContent = text; t.style.display = 'block';
        clearTimeout(t._h); t._h = setTimeout(() => { t.style.display = 'none'; }, 1800);
    }

    function leaveGame() {
        try { if (typeof saveGameProgress === 'function') saveGameProgress(); } catch (e) { /* ignore */ }
        const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
        if (cap && cap.exitApp) { cap.exitApp(); return; }
        // Browser / plain WebView: step back past our own trap entries.
        trapActive = false;
        history.go(-2);
    }

    // Returns true if something was closed (or the press was intentionally swallowed).
    function handleBack() {
        for (const [id, close] of LAYERS) {
            const el = byId(id);
            if (shown(el)) { close(el); return true; }
        }
        const now = Date.now();
        if (now - lastBackAt < EXIT_WINDOW_MS) { leaveGame(); return true; }
        lastBackAt = now;
        toast('Press back again to exit');
        return true;
    }
    window.jallHandleBack = handleBack;   // handy for testing

    let trapActive = true;
    const cap = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.App;
    if (cap && cap.addListener) {
        cap.addListener('backButton', () => { handleBack(); });
    } else {
        // History trap: keep one extra entry ahead so BACK pops it (popstate) instead of leaving the page.
        try {
            history.replaceState({ jall: 0 }, '');
            history.pushState({ jall: 1 }, '');
            window.addEventListener('popstate', () => {
                if (!trapActive) return;
                history.pushState({ jall: 1 }, '');   // re-arm first, then act
                handleBack();
            });
        } catch (e) { /* history unavailable */ }
    }
})();
