// ============================================================
// wipe.js - "Wipe local data" + "Delete account" buttons in the Settings menu (restarts the game from fresh on THIS device).
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

// Where the policy page is hosted (GitHub Pages). Change this if the site moves; use the same URL in Play Console.
const PRIVACY_POLICY_URL = 'https://krisgunns.github.io/Leisure-game/privacy.html';

// ---- Delete account (Google Play requires an in-app way to delete the account AND its data) ----------------
// Signed-in players only. Asks for the password again (fresh sign-in proves it is really them), then deletes the
// cloud save document (saves/{uid}) and the Firebase login itself. The save kept on THIS device is NOT touched:
// the player keeps playing locally as a signed-out player. Order matters: save first, login second, so a failure
// never leaves a login-less orphan save in the cloud (the login is what proves ownership).
async function deleteAccountAndData(password) {
    if (typeof account === 'undefined' || !account) throw new Error('Not signed in.');
    const email = account.email;
    // 1) fresh sign-in = password check + a brand-new token (the stored one may be too old for delete)
    const r = await firebaseFetch(authUrl('signInWithPassword'), 'POST', { email: email, password: password, returnSecureToken: true });
    const idToken = r.idToken;
    // 2) cloud save (ignore "already gone")
    try { await firebaseFetch(saveDocUrl(), 'DELETE', null, idToken); }
    catch (e) { if (e.status !== 404) throw e; }
    // 3) the login itself
    await firebaseFetch(authUrl('delete'), 'POST', { idToken: idToken });
    // 4) forget the session on this device; keep the local save
    accountSignOut();
}

function openDeleteAccountDialog(card) {
    showGameDialog({
        message: '⚠️ DELETE ACCOUNT\n\nThis permanently deletes your login and your cloud save. It cannot be undone.\nThe progress on THIS device is kept.\n\nEnter your password to confirm:',
        input: true, okText: 'DELETE', danger: true
    }, async (pw) => {
        if (!pw) { showInfoToast('Enter your password to delete the account.'); return; }
        card.querySelectorAll('button').forEach(b => { b.disabled = true; });
        showInfoToast('Deleting account…');
        try {
            saveDisabled = true;   // nothing may re-upload while we delete
            await deleteAccountAndData(pw);
            try { window.location.reload(); } catch (e) { /* ignore */ }
        } catch (e) {
            saveDisabled = false;
            card.querySelectorAll('button').forEach(b => { b.disabled = false; });
            showInfoToast(e.message || 'Could not delete the account.');
        }
    });
}

(function () {
    if (typeof openSettingsMenu !== 'function') return;
    const original = openSettingsMenu;
    openSettingsMenu = function () {
        original.apply(this, arguments);
        const ov = document.getElementById('settingsOverlay');
        const card = ov && ov.firstChild;
        if (!card || typeof acctButton !== 'function') return;
        if (typeof account !== 'undefined' && account) {
            card.appendChild(acctButton('❌ Delete account & cloud data', '#7b241c', () => openDeleteAccountDialog(card)));
        }
        card.appendChild(acctButton('📄 Privacy policy', '#566573', () => {
            try { window.open(PRIVACY_POLICY_URL, '_blank'); } catch (e) { window.location.href = PRIVACY_POLICY_URL; }
        }));
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
