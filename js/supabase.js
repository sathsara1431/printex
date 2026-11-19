// =====================================================================
//  supabase.js – THE CONNECTION TO THE DATABASE
// ---------------------------------------------------------------------
//  Creates one Supabase connection that every other file uses:
//      import { db } from './supabase.js';
//  The Supabase library itself is loaded in index.html.
// =====================================================================

import { SUPABASE_URL, SUPABASE_ANON_KEY } from './config.js';

// True when config.js still has the placeholder text instead of real details.
export const isConfigured =
  SUPABASE_URL.startsWith('https://') && !SUPABASE_ANON_KEY.startsWith('PASTE-');

// Safety check: refuse to run if the SECRET / service_role key was pasted by
// mistake, because that key ignores all the database rules.
function isSecretKey(key) {
  if (key.startsWith('sb_secret_')) return true;
  try {
    // Older keys are "JWTs": the middle part says which role the key is for.
    const middle = key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(middle)).role === 'service_role';
  } catch {
    return false;
  }
}

export const usingSecretKey = isConfigured && isSecretKey(SUPABASE_ANON_KEY);

export const db = isConfigured && !usingSecretKey
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;
