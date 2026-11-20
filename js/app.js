// =====================================================================
//  app.js – STARTS THE WEBSITE
// ---------------------------------------------------------------------
//  1. Checks if you are already signed in; if not, shows the login form.
//  2. After sign-in, asks the database which screens you may use
//     (my_menu) and builds the menu from that list only.
//  3. Opens the screen named in the address (e.g. ...#sales). If that
//     screen isn't in your list, it quietly opens your start screen
//     (the first one in your list) instead.
//  4. Handles the Sign out buttons.
// =====================================================================

import { db, isConfigured, usingSecretKey } from './supabase.js';
import { el } from './helpers.js';
import { SCREENS, buildMenu, highlightMenu } from './menu.js';
import { loginEmailFrom, loginNameFromEmail } from './usernames.js';

// One message for a wrong username, wrong email OR wrong password,
// so nobody can find out which usernames exist.
const WRONG_LOGIN = 'Wrong username, email or password. Please try again.';

// The website's version number, taken from the "?v=" on app.js in index.html.
// Screen files are loaded with the same "?v=", so a new version is always downloaded fresh.
const APP_VERSION = new URL(import.meta.url).searchParams.get('v') || 'dev';

let allowedScreens = null;   // the list from my_menu(); null when signed out
let currentUser = null;
let routeCounter = 0;        // makes sure only the latest screen request is shown

// ---------- Show one view, hide the others ----------
function showView(name) {
  for (const view of ['loading', 'login', 'inactive', 'app']) {
    el('#view-' + view).hidden = view !== name;
  }
}

// ---------- Login form ----------
function showLogin() {
  allowedScreens = null;
  currentUser = null;
  el('#login-message').hidden = true;
  el('#login-password').value = '';
  showView('login');
  el('#login-email').focus();
}

function showLoginMessage(text) {
  const box = el('#login-message');
  box.textContent = text;
  box.hidden = false;
}

// Turn Supabase's technical error into a plain message.
function friendlyLoginError(error) {
  const code = error.code || '';
  const text = (error.message || '').toLowerCase();
  if (code === 'email_not_confirmed' || text.includes('email not confirmed')) {
    return 'This account is not confirmed yet. Please contact the owner.';
  }
  if (code === 'invalid_credentials' || text.includes('invalid login credentials')
      || code === 'validation_failed' || error.status === 400) {
    return WRONG_LOGIN;
  }
  if (error.status === 0 || text.includes('fetch') || text.includes('network')) {
    return "Can't connect. Please check your internet connection and try again.";
  }
  if (error.status === 429) {
    return 'Too many attempts. Please wait a few minutes and try again.';
  }
  return 'Sign in did not work. Please try again.';
}

async function handleLogin(event) {
  event.preventDefault();
  const typed = el('#login-email').value.trim();
  const password = el('#login-password').value;
  if (!typed || !password) {
    showLoginMessage('Please enter your username (or email) and password.');
    return;
  }

  // "kamal" → "kamal@printex.invalid"; a normal email stays as it is.
  const email = loginEmailFrom(typed);
  if (!email) {
    showLoginMessage(WRONG_LOGIN);   // not a possible username, so it can't be right
    return;
  }

  const button = el('#login-button');
  button.disabled = true;
  button.textContent = 'Signing in…';
  el('#login-message').hidden = true;

  try {
    const { data, error } = await db.auth.signInWithPassword({ email, password });
    if (error) {
      showLoginMessage(friendlyLoginError(error));
      return;
    }
    await startApp(data.user);
  } catch (error) {
    showLoginMessage(friendlyLoginError(error));
  } finally {
    button.disabled = false;
    button.textContent = 'Sign in';
  }
}

// ---------- After sign-in ----------
async function startApp(user) {
  currentUser = user;
  showView('loading');

  const { data, error } = await db.rpc('my_menu');
  if (error) {
    showView('app');
    el('#menu').innerHTML = '';
    el('#screen').innerHTML = `
      <div class="card">
        <p>Something went wrong while loading. Please check your internet connection.</p>
        <button type="button" class="button" id="retry">Try again</button>
      </div>`;
    el('#retry').onclick = () => startApp(user);
    return;
  }

  allowedScreens = (data || []).filter((name) => SCREENS[name]);

  // No screens at all = the account is switched off.
  if (allowedScreens.length === 0) {
    showView('inactive');
    return;
  }

  buildMenu(el('#menu'), allowedScreens);
  showView('app');
  showUserName(user);
  openScreenFromAddress();
}

// Show the person's name in the top bar (never their role).
async function showUserName(user) {
  el('#user-name').textContent = '';
  const { data } = await db.from('profiles').select('full_name').eq('id', user.id).maybeSingle();
  el('#user-name').textContent = data?.full_name || loginNameFromEmail(user.email);
}

// ---------- Opening screens ----------
async function openScreenFromAddress() {
  if (!allowedScreens) return;   // signed out

  let name = location.hash.replace('#', '');
  if (!allowedScreens.includes(name)) {
    // Not allowed or unknown: go to the start screen without any message.
    name = allowedScreens[0];
    history.replaceState(null, '', '#' + name);
  }

  closeMobileMenu();
  highlightMenu(el('#menu'), name);
  document.title = SCREENS[name].label + ' – Printex';

  const myTurn = ++routeCounter;
  const main = el('#screen');
  main.innerHTML = '<p class="muted">Loading…</p>';

  try {
    const screen = await import(`./screens/${SCREENS[name].file}?v=${APP_VERSION}`);
    if (myTurn !== routeCounter) return;   // the person already clicked something else
    main.innerHTML = '';
    await screen.render(main, { db, user: currentUser });
  } catch (error) {
    console.error(error);
    if (myTurn === routeCounter) {
      main.innerHTML = '<div class="card">This screen could not be loaded. Please refresh the page.</div>';
    }
  }
}

// ---------- Phone menu (☰ button) ----------
function toggleMobileMenu() {
  const open = el('#menu').classList.toggle('open');
  el('#menu-toggle').setAttribute('aria-expanded', String(open));
}
function closeMobileMenu() {
  el('#menu').classList.remove('open');
  el('#menu-toggle').setAttribute('aria-expanded', 'false');
}

// ---------- Sign out ----------
async function signOut() {
  allowedScreens = null;
  await db.auth.signOut();
  history.replaceState(null, '', location.pathname);
  showLogin();
}

// ---------- Start ----------
async function init() {
  // config.js not filled in yet, or the wrong key pasted.
  if (!isConfigured || usingSecretKey) {
    showView('login');
    const notice = el('#setup-notice');
    notice.textContent = usingSecretKey
      ? 'Setup problem: config.js contains the SECRET key. Replace it with the anon (publishable) key.'
      : 'Setup needed: please add your Supabase details to js/config.js.';
    notice.hidden = false;
    el('#login-button').disabled = true;
    return;
  }

  el('#login-form').addEventListener('submit', handleLogin);
  el('#login-show-password').addEventListener('change', (e) => {
    el('#login-password').type = e.target.checked ? 'text' : 'password';
  });
  document.querySelectorAll('.sign-out').forEach((b) => b.addEventListener('click', signOut));
  el('#menu-toggle').addEventListener('click', toggleMobileMenu);
  el('#menu').addEventListener('click', closeMobileMenu);   // also closes when tapping the screen you're on
  window.addEventListener('hashchange', openScreenFromAddress);

  // If the login runs out (e.g. signed out in another tab), go back to the login form.
  db.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && allowedScreens !== null) showLogin();
  });

  const { data } = await db.auth.getSession();
  if (data.session) {
    await startApp(data.session.user);
  } else {
    showLogin();
  }
}

init();
