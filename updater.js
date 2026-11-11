// ============================================================================
// updater.js - "Check for updates" button in Settings (testing aid).
// Compares the files this page loaded (the browser's cached copies) with what GitHub Pages serves right now.
// If any differ, "Update now" refreshes the cached files and reloads - no need to clear the browser cache by hand.
// Progress is never touched (the save lives in localStorage). In the Android app the files are bundled in the
// APK, so an update there means installing a new APK; the button says so.
// Loaded after account.js: it wraps openSettingsMenu() instead of editing account.js.
// ============================================================================
function updaterFileList() {
    const list = ['index.html'];
    document.querySelectorAll('script[src], link[rel="stylesheet"][href]').forEach(el => {
        const u = el.getAttribute('src') || el.getAttribute('href');
        if (u && !/^(https?:)?\/\//i.test(u) && list.indexOf(u) === -1) list.push(u);
    });
    if (list.indexOf('JallBone.ttf') === -1) list.push('JallBone.ttf');
    return list;
}
function updaterBust(u) { return u + (u.indexOf('?') === -1 ? '?' : '&') + '_u=' + Date.now(); }

async function updaterCheck() {
    const changed = [];
    for (const f of updaterFileList()) {
        if (/\.ttf(\?|$)/.test(f)) continue;                                   // binary: compared by size below
        let mine, fresh;
        try {
            const a = await fetch(f, { cache: 'force-cache' }); mine = a.ok ? await a.text() : null;
            const b = await fetch(updaterBust(f), { cache: 'no-store' }); fresh = b.ok ? await b.text() : null;
        } catch (e) { throw new Error('No internet connection.'); }
        if (fresh === null) throw new Error('Could not reach the server (' + f + ').');
        if (mine !== fresh) changed.push(f.split('?')[0]);
    }
    return changed;
}
async function updaterApply() {
    for (const f of updaterFileList()) { try { await fetch(f, { cache: 'reload' }); } catch (e) { /* offline */ } }
    try { if (navigator.serviceWorker) (await navigator.serviceWorker.getRegistrations()).forEach(r => r.unregister()); } catch (e) { /* none */ }
    try { if (window.caches) (await caches.keys()).forEach(k => caches.delete(k)); } catch (e) { /* none */ }
    try { saveGameProgress(); } catch (e) { /* ignore */ }
    location.reload();
}
function openUpdateScreen() {
    const card = acctOpenOverlay('🔄 UPDATE');
    const back = acctButton('← Back', '#7f8c8d', openSettingsMenu);
    back.style.marginTop = '0'; back.style.padding = '6px'; back.style.fontSize = '12px'; back.style.width = 'auto'; back.style.display = 'inline-block';
    card.appendChild(back);
    if (window.Capacitor) { acctText(card, 'This is the Android app: its files are inside the APK, so updates arrive by installing a new APK.\n\nIn the web version (GitHub Pages) this button checks for new files.'); return; }
    const status = acctText(card, 'Checking GitHub for new files…', '#f1c40f');
    const set = (t, col) => { status.textContent = t; status.style.color = col; };
    updaterCheck().then(changed => {
        if (!changed.length) { set('✅ You already have the newest files.', '#2ecc71'); return; }
        set('🆕 New files found:\n' + changed.join('\n'), '#2ecc71');
        card.appendChild(acctButton('Update now', '#27ae60', () => { set('Updating…', '#f1c40f'); updaterApply(); }));
    }).catch(e => set(e.message || 'Could not check for updates.', '#e74c3c'));
}
(function () {
    if (typeof openSettingsMenu !== 'function') return;
    const orig = openSettingsMenu;
    openSettingsMenu = function () {
        orig();
        const card = document.querySelector('#settingsOverlay > div');
        if (card) card.appendChild(acctButton('🔄 Check for updates (testing)', '#8e44ad', openUpdateScreen));
    };
})();
