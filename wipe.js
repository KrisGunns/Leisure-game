// ============================================================
// wipe.js - "Wipe local data" button in the Settings menu (restarts the game from fresh on THIS device).
// Loads after account.js. It wraps openSettingsMenu() to add the button, so account.js itself is untouched.
//  - Deletes only the save kept on this device (and its safety copy). The cloud save is NEVER touched or overwritten.
//  - If signed in, the device is signed out locally first and its one-device lock is released (no save data is
//    sent), otherwise the fresh game's autosave would overwrite the player's cloud save. They can sign in again
//    later and choose / load their cloud save as usual (Account -> sign in -> USE CLOUD).
// ============================================================
async function wipeReleaseLockOnly() {
    if (typeof account === 'undefined' || !account || typeof readCloudDoc !== 'function') return;
    try {
        const doc = await readCloudDoc();
        if (doc.exists && lockState(doc) === 'mine') {
            await patchCloudDoc(doc, { deviceId: { stringValue: '' }, lockAt: { integerValue: '0' } });   // lock only, never the save
        }
    } catch (e) { console.warn('Could not release the account lock (offline?):', e.message); }
}

function wipeLocalDataAndRestart() {
    saveDisabled = true;   // nothing may write the old progress back before the reload
    const signedIn = (typeof account !== 'undefined') && !!account;
    const finish = () => {
        try {
            localStorage.removeItem(SAVE_KEY);
            localStorage.removeItem(SAVE_BACKUP_KEY);
            if (typeof accountSignOut === 'function') accountSignOut();   // local sign-out only (clears the stored session)
        } catch (e) { /* storage unavailable */ }
        window.location.reload();
    };
    if (signedIn) wipeReleaseLockOnly().then(finish, finish); else finish();
}

(function () {
    if (typeof openSettingsMenu !== 'function') return;
    const original = openSettingsMenu;
    openSettingsMenu = function () {
        original.apply(this, arguments);
        const ov = document.getElementById('settingsOverlay');
        const card = ov && ov.firstChild;
        if (!card || typeof acctButton !== 'function') return;
        card.appendChild(acctButton('🗑️ Wipe local data', '#a93226', () => {
            const signedIn = (typeof account !== 'undefined') && !!account;
            const msg = signedIn
                ? '⚠️ Wipe the data on THIS device and start a fresh game?\n\nYour cloud save is NOT deleted. This device will be signed out; sign in again afterwards to load your cloud save.'
                : '⚠️ Wipe ALL data on this device and start a fresh game?\n\nYou are not signed in, so there is no cloud copy: this cannot be undone.';
            showGameDialog({ message: msg, okText: 'WIPE', danger: true }, () => {
                card.querySelectorAll('button').forEach(b => { b.disabled = true; });
                wipeLocalDataAndRestart();
            });
        }));
    };
})();
