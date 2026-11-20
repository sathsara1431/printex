// =====================================================================
//  icons.js – PICTURES FOR STOCK ITEMS
// ---------------------------------------------------------------------
//  A small set of line icons (paper, ink, toner, ...) shown next to each
//  stock item. The owner picks one when adding or editing an item; the
//  database only stores its name (e.g. "droplet").
//
//  iconSvg('droplet', 'cls') → the <svg> drawing, ready to put on the page
//  guessIcon('Black ink')    → 'droplet'  (a sensible first choice from the name)
//
//  The drawings come from Lucide (https://lucide.dev), version 0.460.0:
//
//  ISC License
//  Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as
//  part of Feather (MIT). All other copyright (c) for Lucide are held by
//  Lucide Contributors 2022.
//
//  Permission to use, copy, modify, and/or distribute this software for any
//  purpose with or without fee is hereby granted, provided that the above
//  copyright notice and this permission notice appear in all copies.
//
//  THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
//  WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
//  MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
//  ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
//  WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
//  ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
//  OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
// =====================================================================

// name → { label shown in the picker, svg drawing }
export const ICONS = {
  'file': { label: "Paper sheet", svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/> <path d="M14 2v4a2 2 0 0 0 2 2h4"/>' },
  'files': { label: "Paper stack", svg: '<path d="M20 7h-3a2 2 0 0 1-2-2V2"/> <path d="M9 18a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h7l4 4v10a2 2 0 0 1-2 2Z"/> <path d="M3 7.6v12.8A1.6 1.6 0 0 0 4.6 22h9.8"/>' },
  'file-text': { label: "Printed page", svg: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/> <path d="M14 2v4a2 2 0 0 0 2 2h4"/> <path d="M10 9H8"/> <path d="M16 13H8"/> <path d="M16 17H8"/>' },
  'image': { label: "Photo paper", svg: '<rect width="18" height="18" x="3" y="3" rx="2" ry="2"/> <circle cx="9" cy="9" r="2"/> <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>' },
  'droplet': { label: "Ink", svg: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/>' },
  'droplets': { label: "Colour ink", svg: '<path d="M7 16.3c2.2 0 4-1.83 4-4.05 0-1.16-.57-2.26-1.71-3.19S7.29 6.75 7 5.3c-.29 1.45-1.14 2.84-2.29 3.76S3 11.1 3 12.25c0 2.22 1.8 4.05 4 4.05z"/> <path d="M12.56 6.6A10.97 10.97 0 0 0 14 3.02c.5 2.5 2 4.9 4 6.5s3 3.5 3 5.5a6.98 6.98 0 0 1-11.91 4.97"/>' },
  'palette': { label: "Colours", svg: '<circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/> <circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/> <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/> <circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/> <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>' },
  'printer': { label: "Toner / printer", svg: '<path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/> <path d="M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6"/> <rect x="6" y="14" width="12" height="8" rx="1"/>' },
  'cylinder': { label: "Toner cartridge", svg: '<ellipse cx="12" cy="5" rx="9" ry="3"/> <path d="M3 5v14a9 3 0 0 0 18 0V5"/>' },
  'spray-can': { label: "Spray", svg: '<path d="M3 3h.01"/> <path d="M7 5h.01"/> <path d="M11 7h.01"/> <path d="M3 7h.01"/> <path d="M7 9h.01"/> <path d="M3 11h.01"/> <rect width="4" height="4" x="15" y="5"/> <path d="m19 9 2 2v10c0 .6-.4 1-1 1h-6c-.6 0-1-.4-1-1V11l2-2"/> <path d="m13 14 8-2"/> <path d="m13 19 8-2"/>' },
  'layers': { label: "Lamination", svg: '<path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z"/> <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65"/> <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65"/>' },
  'book-open': { label: "Binding", svg: '<path d="M12 7v14"/> <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"/>' },
  'notebook': { label: "Notebook", svg: '<path d="M2 6h4"/> <path d="M2 10h4"/> <path d="M2 14h4"/> <path d="M2 18h4"/> <rect width="16" height="20" x="4" y="2" rx="2"/> <path d="M16 2v20"/>' },
  'mail': { label: "Envelope", svg: '<rect width="20" height="16" x="2" y="4" rx="2"/> <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>' },
  'credit-card': { label: "Card", svg: '<rect width="20" height="14" x="2" y="5" rx="2"/> <line x1="2" x2="22" y1="10" y2="10"/>' },
  'sticky-note': { label: "Sticker", svg: '<path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8Z"/> <path d="M15 3v4a2 2 0 0 0 2 2h4"/>' },
  'scroll': { label: "Roll", svg: '<path d="M19 17V5a2 2 0 0 0-2-2H4"/> <path d="M8 21h12a2 2 0 0 0 2-2v-1a1 1 0 0 0-1-1H11a1 1 0 0 0-1 1v1a2 2 0 1 1-4 0V5a2 2 0 1 0-4 0v2a1 1 0 0 0 1 1h3"/>' },
  'package': { label: "Package", svg: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/> <path d="M12 22V12"/> <path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/> <path d="m7.5 4.27 9 5.15"/>' },
  'box': { label: "Box", svg: '<path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z"/> <path d="m3.3 7 8.7 5 8.7-5"/> <path d="M12 22V12"/>' },
  'paperclip': { label: "Clips", svg: '<path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/>' },
  'scissors': { label: "Cutting", svg: '<circle cx="6" cy="6" r="3"/> <path d="M8.12 8.12 12 12"/> <path d="M20 4 8.12 15.88"/> <circle cx="6" cy="18" r="3"/> <path d="M14.8 14.8 20 20"/>' },
  'pen-tool': { label: "Pen", svg: '<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/> <path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/> <path d="m2.3 2.3 7.286 7.286"/> <circle cx="11" cy="11" r="2"/>' },
  'stamp': { label: "Stamp", svg: '<path d="M5 22h14"/> <path d="M19.27 13.73A2.5 2.5 0 0 0 17.5 13h-11A2.5 2.5 0 0 0 4 15.5V17a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-1.5c0-.66-.26-1.3-.73-1.77Z"/> <path d="M14 13V8.5C14 7 15 7 15 5a3 3 0 0 0-3-3c-1.66 0-3 1-3 3s1 2 1 3.5V13"/>' },
  'tag': { label: "Label", svg: '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"/> <circle cx="7.5" cy="7.5" r=".5" fill="currentColor"/>' },
  'ruler': { label: "Ruler", svg: '<path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.41 2.41 0 0 1 0-3.4l2.6-2.6a2.41 2.41 0 0 1 3.4 0Z"/> <path d="m14.5 12.5 2-2"/> <path d="m11.5 9.5 2-2"/> <path d="m8.5 6.5 2-2"/> <path d="m17.5 15.5 2-2"/>' },
};

// The full <svg> for an icon name ('' if the name is unknown or empty).
export function iconSvg(name, className = '') {
  const icon = ICONS[name];
  if (!icon) return '';
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor"
    stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icon.svg}</svg>`;
}

// Words in an item's name → a sensible icon to start with.
const GUESSES = [
  [/colou?r\s*ink/i, 'droplets'],
  [/ink/i, 'droplet'],
  [/toner|cartridge/i, 'cylinder'],
  [/lamin/i, 'layers'],
  [/photo/i, 'image'],
  [/envelope/i, 'mail'],
  [/bind|comb|spiral/i, 'book-open'],
  [/sticker|label/i, 'sticky-note'],
  [/card|board|\bid\b/i, 'credit-card'],
  [/roll|banner|vinyl|flex/i, 'scroll'],
  [/clip|staple|pin/i, 'paperclip'],
  [/paper|sheet|a3|a4|a5|bond/i, 'file'],
];

export function guessIcon(itemName) {
  const hit = GUESSES.find(([pattern]) => pattern.test(itemName || ''));
  return hit ? hit[1] : '';
}
