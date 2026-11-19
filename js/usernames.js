// =====================================================================
//  usernames.js – USERNAME OR EMAIL LOGINS
// ---------------------------------------------------------------------
//  loginEmailFrom('Kamal ')                → 'kamal@printex.invalid'
//  loginEmailFrom('owner@gmail.com')       → 'owner@gmail.com'
//  loginEmailFrom('kamal silva')           → null  (not a valid username)
//  loginNameFromEmail('kamal@printex.invalid') → 'kamal'
//  loginNameFromEmail('owner@gmail.com')       → 'owner@gmail.com'
//
//  Usernames: lower-case letters, numbers, dots and underscores only.
// =====================================================================

import { USERNAME_DOMAIN } from './config.js';

const USERNAME_PATTERN = /^[a-z0-9._]{1,50}$/;
const USERNAME_ENDING = '@' + USERNAME_DOMAIN;

// What the person typed → the email Supabase should use (or null if it can't be valid).
export function loginEmailFrom(typed) {
  const text = String(typed || '').trim().toLowerCase();   // ignore capitals and outer spaces
  if (text.includes('@')) return text;                     // a normal email
  return USERNAME_PATTERN.test(text) ? text + USERNAME_ENDING : null;
}

// A login's email → what to show people (the username, or the real email).
export function loginNameFromEmail(email) {
  const text = String(email || '');
  return text.toLowerCase().endsWith(USERNAME_ENDING)
    ? text.slice(0, -USERNAME_ENDING.length)
    : text;
}

// True if this login is a username account.
export const isUsernameLogin = (email) =>
  String(email || '').toLowerCase().endsWith(USERNAME_ENDING);
