// ============================================================================
// account.js — ⚙️ SETTINGS menu + ☁️ ACCOUNT (email sign-in with cloud save)
//
// The gear button opens a small Settings menu with two buttons:
//   ☁️ Account    — create an account / sign in with an email + password, and keep the save
//                   backed up in the cloud so progress follows the player to a new phone.
//   🛠️ Developer  — the old dev console (still behind the code word, see openDeveloperPanel in ui.js).
//
// How the cloud save works (no libraries — plain fetch, so it works inside the Android APK):
//   • Sign-in/sign-up uses the Firebase Authentication REST API (email + password).
//   • The save (the exact JSON text already kept in localStorage under SAVE_KEY) is stored as one
//     Firestore document at  saves/{uid}  via the Firestore REST API.
//   • While signed in the game uploads the save automatically (about once a minute when it changed,
//     and whenever the app is hidden). Sync now / Download cloud save buttons are also provided.
//   • Signing in on a device that already has a different local save asks which one to keep —
//     nothing is overwritten without a choice.
//
// ONE-TIME SETUP (see CHANGELOG): create a free Firebase project, enable Email/Password sign-in,
// create a Firestore database, then paste the Web API key and Project ID below. Until both are
// filled in, the Account screen says cloud saving is not set up yet and the game plays as before.
// ============================================================================

const FIREBASE_API_KEY = 'AIzaSyANK_0f3ry_Sz70NNJyZAN_FvJtw-hjtoo';      // Firebase console -> Project settings -> General -> Web API Key
const FIREBASE_PROJECT_ID = 'jall-a6adf';   // Firebase console -> Project settings -> General -> Project ID

const ACCOUNT_KEY = 'just_a_little_leisure_account_v1';
const CLOUD_AUTOSAVE_MS = 60 * 1000;

function cloudConfigured() { return !!(FIREBASE_API_KEY && FIREBASE_PROJECT_ID); }

// ---- account session (kept in localStorage) --------------------------------
let account = null;   // { email, uid, idToken, refreshToken, expiresAt, lastUploadedRaw, lastSyncAt }
function loadAccount() {
    try { account = JSON.parse(localStorage.getItem(ACCOUNT_KEY) || 'null'); } catch (e) { account = null; }
}
function persistAccount() {
    try {
        if (account) localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
        else localStorage.removeItem(ACCOUNT_KEY);
    } catch (e) { /* storage unavailable */ }
}
loadAccount();

// ---- Firebase REST helpers -------------------------------------------------
const FRIENDLY_AUTH_ERRORS = {
    EMAIL_EXISTS: 'That email already has an account — try Sign In.',
    INVALID_EMAIL: 'That email address doesn\'t look right.',
    WEAK_PASSWORD: 'Password is too weak — use at least 6 characters.',
    MISSING_PASSWORD: 'Please enter a password.',
    EMAIL_NOT_FOUND: 'No account with that email.',
    INVALID_PASSWORD: 'Wrong email or password.',
    INVALID_LOGIN_CREDENTIALS: 'Wrong email or password.',
    USER_DISABLED: 'This account has been disabled.',
    TOO_MANY_ATTEMPTS_TRY_LATER: 'Too many attempts — wait a few minutes and try again.'
};

async function firebaseFetch(url, method, body, token) {
    let res;
    try {
        res = await fetch(url, {
            method,
            headers: Object.assign({ 'Content-Type': 'application/json' }, token ? { Authorization: 'Bearer ' + token } : {}),
            body: body ? JSON.stringify(body) : undefined
        });
    } catch (e) {
        throw new Error('No internet connection.');
    }
    let json = null;
    try { json = await res.json(); } catch (e) { /* empty body */ }
    if (!res.ok) {
        const raw = (json && json.error && json.error.message) || ('HTTP ' + res.status);
        const code = String(raw).split(' ')[0].split(':')[0];
        const err = new Error(FRIENDLY_AUTH_ERRORS[code] || ('Something went wrong (' + raw + ').'));
        err.status = res.status;
        throw err;
    }
    return json;
}

function authUrl(endpoint) {
    return 'https://identitytoolkit.googleapis.com/v1/accounts:' + endpoint + '?key=' + encodeURIComponent(FIREBASE_API_KEY);
}

function adoptAuthResult(r, keepSyncInfo) {
    account = {
        email: r.email,
        uid: r.localId,
        idToken: r.idToken,
        refreshToken: r.refreshToken,
        expiresAt: Date.now() + (parseInt(r.expiresIn, 10) || 3600) * 1000 - 60000,
        lastUploadedRaw: keepSyncInfo && account ? account.lastUploadedRaw : null,
        lastSyncAt: keepSyncInfo && account ? account.lastSyncAt : null
    };
    persistAccount();
}

async function accountSignUp(email, password) {
    adoptAuthResult(await firebaseFetch(authUrl('signUp'), 'POST', { email, password, returnSecureToken: true }), false);
}
async function accountSignIn(email, password) {
    adoptAuthResult(await firebaseFetch(authUrl('signInWithPassword'), 'POST', { email, password, returnSecureToken: true }), false);
}
async function accountResetPassword(email) {
    await firebaseFetch(authUrl('sendOobCode'), 'POST', { requestType: 'PASSWORD_RESET', email });
}
function accountSignOut() {
    account = null;
    persistAccount();
}

// Returns a valid ID token, refreshing it when it's about to expire.
async function getIdToken() {
    if (!account) throw new Error('Not signed in.');
    if (Date.now() < account.expiresAt) return account.idToken;
    const r = await firebaseFetch(
        'https://securetoken.googleapis.com/v1/token?key=' + encodeURIComponent(FIREBASE_API_KEY),
        'POST', { grant_type: 'refresh_token', refresh_token: account.refreshToken });
    account.idToken = r.id_token;
    account.refreshToken = r.refresh_token || account.refreshToken;
    account.expiresAt = Date.now() + (parseInt(r.expires_in, 10) || 3600) * 1000 - 60000;
    persistAccount();
    return account.idToken;
}

function saveDocUrl() {
    return 'https://firestore.googleapis.com/v1/projects/' + encodeURIComponent(FIREBASE_PROJECT_ID) +
        '/databases/(default)/documents/saves/' + encodeURIComponent(account.uid);
}

// Reads the cloud save: { data: '<json text>', updatedAt: ms } or null when none exists yet.
async function cloudRead() {
    const token = await getIdToken();
    try {
        const doc = await firebaseFetch(saveDocUrl(), 'GET', null, token);
        const f = doc.fields || {};
        return {
            data: f.data ? f.data.stringValue : null,
            updatedAt: f.updatedAt ? parseInt(f.updatedAt.integerValue, 10) : 0
        };
    } catch (e) {
        if (e.status === 404) return null;
        throw e;
    }
}

async function cloudWrite(raw) {
    const token = await getIdToken();
    const now = Date.now();
    await firebaseFetch(saveDocUrl() + '?updateMask.fieldPaths=data&updateMask.fieldPaths=updatedAt', 'PATCH',
        { fields: { data: { stringValue: raw }, updatedAt: { integerValue: String(now) } } }, token);
    account.lastUploadedRaw = raw;
    account.lastSyncAt = now;
    persistAccount();
}

// ---- save helpers ----------------------------------------------------------
function readLocalSaveRaw() {
    try { return localStorage.getItem(SAVE_KEY); } catch (e) { return null; }
}

// Short human summary of a save's JSON text, e.g. "Lv.12 · 3,450 coins".
function describeSave(raw) {
    try {
        const s = JSON.parse(raw);
        const parts = [];
        const lvl = s.character && s.character.level;
        if (lvl) parts.push('Lv.' + lvl);
        if (s.inventory && s.inventory.coins !== undefined) parts.push(Number(s.inventory.coins).toLocaleString() + ' coins');
        return parts.join(' · ') || 'saved game';
    } catch (e) { return 'saved game'; }
}

function formatWhen(ms) {
    if (!ms) return 'never';
    try { return new Date(ms).toLocaleString(); } catch (e) { return 'unknown'; }
}

// Replaces the local save with the cloud one and reloads the game so everything is rebuilt from it.
function applyCloudSaveAndReload(raw) {
    saveDisabled = true;   // nothing may write the old progress back between now and the reload
    try { localStorage.setItem(SAVE_KEY, raw); } catch (e) { /* ignore */ }
    if (account) { account.lastUploadedRaw = raw; persistAccount(); }
    location.reload();
}

// After signing in / creating an account: decide what to do with local vs cloud saves.
// Never overwrites anything without the player's choice when the two differ.
async function reconcileAfterSignIn(setStatus) {
    saveGameProgress();
    const local = readLocalSaveRaw();
    const cloud = await cloudRead();
    if (!cloud || !cloud.data) {
        if (local) { await cloudWrite(local); setStatus('☁️ Signed in. Your progress was saved to the cloud.'); }
        else setStatus('☁️ Signed in.');
        return;
    }
    if (!local || local === cloud.data) {
        if (!local) { applyCloudSaveAndReload(cloud.data); return; }
        account.lastUploadedRaw = local; account.lastSyncAt = cloud.updatedAt; persistAccount();
        setStatus('☁️ Signed in. Already up to date.');
        return;
    }
    showGameDialog({
        message: 'This account already has a cloud save (' + describeSave(cloud.data) + ', ' + formatWhen(cloud.updatedAt) +
            ').\n\nThis device has a different save (' + describeSave(local) + ').\n\nPress USE CLOUD to load the cloud save here (this device\'s save is replaced), or Cancel to keep this device\'s save and overwrite the cloud one later with Sync now.',
        okText: 'USE CLOUD', danger: true
    }, () => applyCloudSaveAndReload(cloud.data));
    setStatus('☁️ Signed in. Choose which save to keep.');
}

// ---- automatic upload ------------------------------------------------------
let cloudUploadBusy = false;
async function cloudAutoUpload() {
    if (!account || !cloudConfigured() || cloudUploadBusy || saveDisabled) return;
    const raw = readLocalSaveRaw();
    if (!raw || raw === account.lastUploadedRaw) return;
    cloudUploadBusy = true;
    try { await cloudWrite(raw); } catch (e) { console.warn('Cloud auto-save failed:', e.message); }
    cloudUploadBusy = false;
}
setInterval(cloudAutoUpload, CLOUD_AUTOSAVE_MS);
document.addEventListener('visibilitychange', () => {
    if (document.hidden) { try { saveGameProgress(); } catch (e) { /* ignore */ } cloudAutoUpload(); }
});

// ---- UI: tiny DOM helpers --------------------------------------------------
const ACCT_BTN_CSS = 'display:block; width:100%; border:none; border-radius:8px; padding:11px; margin-top:8px; font-family:monospace; font-size:14px; font-weight:bold; color:#fff; cursor:pointer;';
const ACCT_INPUT_CSS = 'display:block; width:100%; box-sizing:border-box; font-size:14px; padding:9px; margin-top:8px; border-radius:6px; border:2px solid #7f8c8d; font-family:monospace;';

function acctButton(label, color, fn) {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = ACCT_BTN_CSS + 'background:' + color + ';';
    b.addEventListener('click', fn);
    return b;
}

// Builds (or rebuilds) the shared full-screen overlay and returns its card element.
function acctOpenOverlay(title) {
    let ov = document.getElementById('settingsOverlay');
    if (!ov) {
        ov = document.createElement('div');
        ov.id = 'settingsOverlay';
        ov.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.75); z-index:15000; display:flex; align-items:center; justify-content:center; padding:20px; box-sizing:border-box; font-family:monospace;';
        document.body.appendChild(ov);
    }
    while (ov.firstChild) ov.removeChild(ov.firstChild);
    ov.style.display = 'flex';
    const card = document.createElement('div');
    card.style.cssText = 'background:#1e272e; border:3px solid #f1c40f; border-radius:12px; padding:16px; width:100%; max-width:340px; max-height:88vh; overflow-y:auto; box-sizing:border-box; color:#fff;';
    const close = document.createElement('button');
    close.textContent = '✕';
    close.style.cssText = 'float:right; background:#e74c3c; color:#fff; border:none; border-radius:6px; width:28px; height:28px; cursor:pointer; font-family:monospace; font-weight:bold;';
    close.addEventListener('click', closeSettings);
    card.appendChild(close);
    const h = document.createElement('h2');
    h.textContent = title;
    h.style.cssText = 'color:#f1c40f; margin:0 0 6px 0; font-size:18px;';
    card.appendChild(h);
    ov.appendChild(card);
    return card;
}

function closeSettings() {
    const ov = document.getElementById('settingsOverlay');
    if (ov) ov.style.display = 'none';
}

function acctText(card, text, color) {
    const d = document.createElement('div');
    d.textContent = text;
    d.style.cssText = 'font-size:12px; line-height:1.5; margin-top:8px; white-space:pre-line; color:' + (color || '#bdc3c7') + ';';
    card.appendChild(d);
    return d;
}

// ---- UI: Settings menu (the ⚙️ button) ------------------------------------
function openSettingsMenu() {
    const card = acctOpenOverlay('⚙️ SETTINGS');
    card.appendChild(acctButton(account ? '☁️ Account (' + account.email + ')' : '☁️ Account — save your progress', '#2980b9', openAccountScreen));
    card.appendChild(acctButton('🛠️ Developer', '#7f8c8d', () => { closeSettings(); openDeveloperPanel(); }));
}

// ---- UI: Account screen ----------------------------------------------------
let acctNotice = '';   // one-shot message shown at the top of the next Account screen
function openAccountScreen() {
    const card = acctOpenOverlay('☁️ ACCOUNT');
    const back = acctButton('← Back', '#7f8c8d', openSettingsMenu);
    back.style.marginTop = '0'; back.style.padding = '6px'; back.style.fontSize = '12px'; back.style.width = 'auto'; back.style.display = 'inline-block';
    card.appendChild(back);

    if (!cloudConfigured()) {
        acctText(card, 'Cloud saving isn\'t set up in this build yet.\n\nYour progress is still saved on this device automatically.');
        return;
    }

    const status = acctText(card, acctNotice, '#2ecc71');
    acctNotice = '';
    const setStatus = (t, bad) => { status.textContent = t; status.style.color = bad ? '#e74c3c' : '#2ecc71'; };
    // Runs an async action with the buttons disabled so a double tap can't fire it twice.
    const run = async (fn) => {
        card.querySelectorAll('button').forEach(b => { b.disabled = true; });
        setStatus('Working…');
        status.style.color = '#f1c40f';
        try { await fn(); } catch (e) { setStatus(e.message || 'Something went wrong.', true); }
        card.querySelectorAll('button').forEach(b => { b.disabled = false; });
    };

    if (account) {
        acctText(card, 'Signed in as\n' + account.email, '#fff');
        acctText(card, 'Last cloud save: ' + formatWhen(account.lastSyncAt) + '\nYour progress uploads automatically about once a minute.');
        card.appendChild(acctButton('☁️ Sync now (upload this device)', '#27ae60', () => run(async () => {
            saveGameProgress();
            await cloudWrite(readLocalSaveRaw());
            acctNotice = '☁️ Saved to the cloud.';
            openAccountScreen();
        })));
        card.appendChild(acctButton('⬇️ Load cloud save', '#2980b9', () => run(async () => {
            const cloud = await cloudRead();
            if (!cloud || !cloud.data) { setStatus('There is no cloud save yet.', true); return; }
            showGameDialog({
                message: 'Replace this device\'s save (' + describeSave(readLocalSaveRaw()) + ') with the cloud save (' + describeSave(cloud.data) + ', ' + formatWhen(cloud.updatedAt) + ')?',
                okText: 'LOAD', danger: true
            }, () => applyCloudSaveAndReload(cloud.data));
            setStatus('');
        })));
        card.appendChild(acctButton('Sign out', '#c0392b', () => {
            showGameDialog({ message: 'Sign out? Your progress stays on this device but stops uploading.', okText: 'SIGN OUT', danger: true }, () => {
                accountSignOut();
                openAccountScreen();
            });
        }));
        return;
    }

    acctText(card, 'Link an email to back up your progress and continue on another phone.');
    const email = document.createElement('input');
    email.type = 'email'; email.placeholder = 'Email'; email.autocomplete = 'email';
    email.style.cssText = ACCT_INPUT_CSS;
    const pass = document.createElement('input');
    pass.type = 'password'; pass.placeholder = 'Password (6+ characters)'; pass.autocomplete = 'current-password';
    pass.style.cssText = ACCT_INPUT_CSS;
    card.appendChild(email);
    card.appendChild(pass);
    const creds = () => {
        const e = email.value.trim(), p = pass.value;
        if (!e || !p) throw new Error('Enter your email and password.');
        return [e, p];
    };
    const afterAuth = async () => {
        let msg = '';
        await reconcileAfterSignIn(t => { msg = t; });
        acctNotice = msg;
        openAccountScreen();   // now shows the signed-in view (unless the page is reloading to load the cloud save)
    };
    card.appendChild(acctButton('Sign In', '#27ae60', () => run(async () => { const [e, p] = creds(); await accountSignIn(e, p); await afterAuth(); })));
    card.appendChild(acctButton('Create Account', '#2980b9', () => run(async () => { const [e, p] = creds(); await accountSignUp(e, p); await afterAuth(); })));
    card.appendChild(acctButton('Forgot password?', '#7f8c8d', () => run(async () => {
        const e = email.value.trim();
        if (!e) throw new Error('Enter your email first.');
        await accountResetPassword(e);
        setStatus('Password reset email sent — check your inbox.');
    })));
}
