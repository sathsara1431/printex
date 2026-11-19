// =====================================================================
//  helpers.js – SMALL TOOLS USED ON EVERY SCREEN
// ---------------------------------------------------------------------
//  formatMoney(1250)            → "Rs. 1,250.00"
//  formatDate('2026-11-19')     → "19 Nov 2026"
//  formatTime('2026-11-19T04:00:00Z') → "9:30 AM"  (Sri Lanka time)
//  escapeHtml(text)             → makes text safe to put on the page
//  el('#id')                    → finds something on the page
// =====================================================================

const TIME_ZONE = 'Asia/Colombo';

const moneyFormat = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

// Money in Sri Lankan Rupees, e.g. "Rs. 1,250.00" or "-Rs. 50.00".
export function formatMoney(amount) {
  const n = Number(amount) || 0;
  const text = 'Rs. ' + moneyFormat.format(Math.abs(n));
  return n < 0 ? '-' + text : text;
}

// A date like "19 Nov 2026". Accepts "2026-11-19" or a full date-time.
export function formatDate(value) {
  if (!value) return '';
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  const d = dateOnly ? new Date(value + 'T00:00:00Z') : new Date(value);
  return d.toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
    timeZone: dateOnly ? 'UTC' : TIME_ZONE,   // a plain date has no time zone
  });
}

// A time like "9:30 AM", in Sri Lanka time.
export function formatTime(value) {
  if (!value) return '';
  return new Date(value).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit', timeZone: TIME_ZONE,
  });
}

// Make any text safe to show inside the page (stops odd characters breaking it).
export function escapeHtml(text) {
  return String(text ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

// Shortcut for finding one thing on the page.
export const el = (selector) => document.querySelector(selector);

// A simple "coming soon" box, used by screens that aren't built yet.
export function placeholderHtml(title) {
  return `
    <h1>${escapeHtml(title)}</h1>
    <div class="card muted">This screen is coming soon.</div>`;
}
