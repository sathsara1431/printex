// =====================================================================
//  config.js – YOUR SUPABASE CONNECTION DETAILS
// ---------------------------------------------------------------------
//  Find these in Supabase: Project Settings → API Keys (or Data API).
//
//  ✅ SUPABASE_URL      : your "Project URL", e.g. https://abcdefgh.supabase.co
//  ✅ SUPABASE_ANON_KEY : the "anon public" key (or "publishable" key,
//                         starting with sb_publishable_). This key is SAFE to
//                         put here and upload to GitHub – the database rules
//                         protect your data.
//
//  ❌ NEVER put the "service_role" key or the "secret" key (sb_secret_...)
//     in this file or anywhere in this folder.
// =====================================================================

export const SUPABASE_URL = 'https://ixhrirxlxcvilagdzxar.supabase.co';
export const SUPABASE_ANON_KEY = 'sb_publishable_4YPanlrZgZC10gDxcm9Lbw_vUwdJx4w';

// =====================================================================
//  USERNAME LOGINS
// ---------------------------------------------------------------------
//  Supabase logins always need an email address. For people who sign in
//  with a USERNAME (e.g. "kamal"), the website quietly turns it into
//  "kamal@" + this made-up domain. ".invalid" is reserved worldwide and
//  can never receive mail, so these addresses are never real.
//
//  ⚠️ Don't change this after username accounts exist – their logins in
//     Supabase use this exact domain.
// =====================================================================

export const USERNAME_DOMAIN = 'printex.invalid';
