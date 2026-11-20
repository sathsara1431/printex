// =====================================================================
//  inventory.js – INVENTORY SCREEN (Owner and Manager)
// ---------------------------------------------------------------------
//  An "at a glance" view of the stock:
//    • Three boxes at the top: how many items, which ones need buying,
//      and the one that will run out first (worked out from the last
//      7 days of sales).
//    • One row per item, problems first: a gauge (full = 3 × the
//      low-stock warning level), OK / Low / Below zero, the amount in
//      stock (in packs when easier, e.g. "2.8 reams"), and how much was
//      used in the last 7 days with "about N days left".
//
//  For each item you can:
//    • Update stock – bought more, something was wasted, or you
//      counted it and want the website to match your count. A note is
//      always needed so everyone knows why.
//    • History – the latest changes (sales take stock away by themselves).
//      A manual change made by mistake can be undone here.
//    • Edit – name, units (e.g. sheet / ream of 500), low-stock level and
//      picture (from js/icons.js; suggested from the name when adding).
//
//  The amount left is NEVER typed in directly: the database works it out
//  from all the changes, so it can't be fiddled.
// =====================================================================

import {
  escapeHtml, formatDate, formatTime, formatNumber,
  parseNumberInput, showNotice,
} from '../helpers.js';
import { ICONS, iconSvg, guessIcon } from '../icons.js';

// Shown if the database hasn't had update 001 (the "icon" column) yet.
const NEEDS_UPDATE = 'The database needs a small update first: run supabase/updates/001_stock_item_icons.sql ' +
  'in the Supabase SQL Editor, then refresh this page.';
const isMissingIconColumn = (error) =>
  ['42703', 'PGRST204'].includes(error?.code) || /icon/i.test(error?.message || '');

// "sheet" → "sheets" (short units like "ml" or "kg" stay the same).
function unitWord(unit, amount) {
  const u = unit || '';
  if (Math.abs(amount) === 1 || u.length <= 2 || u.endsWith('s')) return u;
  return u + 's';
}

// "1,250 sheets (2 reams + 250 sheets)"
function amountText(amount, item) {
  const main = `${formatNumber(amount)} ${unitWord(item.base_unit, amount)}`;
  if (!item.pack_unit || !item.pack_size || amount <= 0) return main;
  const packs = Math.floor(amount / item.pack_size);
  const rest = Math.round((amount - packs * item.pack_size) * 1000) / 1000;
  if (packs === 0) return main;
  const packPart = `${formatNumber(packs)} ${unitWord(item.pack_unit, packs)}`;
  return `${main} (${packPart}${rest ? ` + ${formatNumber(rest)} ${unitWord(item.base_unit, rest)}` : ''})`;
}

const isLow = (item) => Number(item.quantity) <= Number(item.low_stock_level);

// 'below' (red), 'low' (orange) or 'ok' (green).
function statusOf(item) {
  if (item.quantity < 0) return 'below';
  return isLow(item) ? 'low' : 'ok';
}
const STATUS_WORDS = { below: 'Below zero', low: 'Low', ok: 'OK' };

// The big amount, in packs when that's easier to read: "2.8 reams" (else "480 sheets").
function bigAmount(item) {
  const q = item.quantity;
  if (item.pack_unit && item.pack_size && Math.abs(q) >= item.pack_size) {
    const packs = Math.round((q / item.pack_size) * 10) / 10;
    return `${formatNumber(packs)} ${unitWord(item.pack_unit, packs)}`;
  }
  return `${formatNumber(q)} ${unitWord(item.base_unit, q)}`;
}

// How full the gauge is (0 to 1). "Full" = 3 × the low-stock warning level.
function fullness(item) {
  if (item.quantity <= 0) return 0;
  const full = item.low_stock_level > 0 ? item.low_stock_level * 3 : item.quantity;
  return Math.min(1, item.quantity / full);
}

// A half-circle gauge made of 12 little bars, coloured by status.
function gaugeSvg(item) {
  const bars = 12;
  const lit = Math.round(fullness(item) * bars);
  let lines = '';
  for (let i = 0; i < bars; i++) {
    const angle = Math.PI - (i / (bars - 1)) * Math.PI;   // left → right
    const x1 = 30 + Math.cos(angle) * 17, y1 = 30 - Math.sin(angle) * 17;
    const x2 = 30 + Math.cos(angle) * 26, y2 = 30 - Math.sin(angle) * 26;
    lines += `<line x1="${x1.toFixed(1)}" y1="${y1.toFixed(1)}" x2="${x2.toFixed(1)}" y2="${y2.toFixed(1)}"
      class="${i < lit ? 'lit' : ''}"/>`;
  }
  return `<svg class="gauge ${statusOf(item)}" viewBox="0 0 60 34" aria-hidden="true">${lines}</svg>`;
}

// Small line icons for the buttons.
const BUTTON_ICONS = {
  history: '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  edit: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M14 6l4 4"/></svg>',
};

const REASONS = {
  purchase:   { label: 'Bought more',          hint: 'e.g. Bought from ABC Stationers' },
  waste:      { label: 'Spoiled or wasted',    hint: 'e.g. Paper jam, damaged in rain' },
  correction: { label: 'I counted the stock',  hint: 'e.g. Monthly count' },
};
const HISTORY_LABELS = { sale: 'Sale', purchase: 'Bought', waste: 'Wasted', correction: 'Count correction' };

export async function render(main, { db }) {
  main.innerHTML = `
    <div class="title-row">
      <h1>Inventory</h1>
      <button type="button" id="inv-add-toggle" class="button small">+ Add item</button>
    </div>
    <div id="inv-message" class="notice" role="status" hidden></div>
    <div id="inv-add" class="card add-panel" hidden>
      <h2>Add a stock item</h2>
      <form class="item-form">${itemFields({})}
        <div class="button-row">
          <button type="submit" class="button primary">Add item</button>
          <button type="button" class="button" id="inv-add-cancel">Cancel</button>
        </div>
      </form>
    </div>
    <div id="inv-summary" class="stat-strip"></div>
    <div id="inv-list"><p class="muted">Loading…</p></div>
    <details id="inv-off" class="card help" hidden></details>`;

  const messageBox = main.querySelector('#inv-message');
  const say = (text, type = 'good') => showNotice(messageBox, text, type);
  let names = {};   // user id → name, for the History lists
  let usedLastWeek = {};   // stock item id → amount taken by sales in the last 7 days

  const addBox = main.querySelector('#inv-add');
  main.querySelector('#inv-add-toggle').onclick = () => {
    addBox.hidden = !addBox.hidden;
    if (!addBox.hidden) addBox.querySelector('input').focus();
  };
  main.querySelector('#inv-add-cancel').onclick = () => {
    addBox.querySelector('form').reset();
    addBox.hidden = true;
  };

  // How much each item was used by sales in the last 7 days.
  async function loadUsage() {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const { data } = await db.from('stock_movements')
      .select('stock_item_id, change')
      .eq('reason', 'sale')
      .gte('created_at', since);
    usedLastWeek = {};
    (data || []).forEach((m) => {
      usedLastWeek[m.stock_item_id] = (usedLastWeek[m.stock_item_id] || 0) - Number(m.change);
    });
  }

  // "about 9 days left", from the last 7 days of sales.
  function daysLeft(item) {
    const perDay = (usedLastWeek[item.id] || 0) / 7;
    if (perDay <= 0 || item.quantity <= 0) return null;
    return Math.floor(item.quantity / perDay);
  }

  // ---------- Loading ----------
  let loadCounter = 0;   // only the newest refresh is shown (slow older answers are ignored)

  async function loadItems() {
    const myTurn = ++loadCounter;
    const { data, error } = await db.from('stock_items')
      .select('id, name, base_unit, pack_unit, pack_size, quantity, low_stock_level, active, icon')
      .order('name');
    if (myTurn !== loadCounter) return;
    const listBox = main.querySelector('#inv-list');
    if (error) {
      listBox.innerHTML = `<div class="card">${isMissingIconColumn(error)
        ? NEEDS_UPDATE : 'Could not load the stock. Please refresh the page.'}</div>`;
      return;
    }
    const items = data.map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      low_stock_level: Number(i.low_stock_level),
      pack_size: i.pack_size === null ? null : Number(i.pack_size),
    }));
    // Problems first: below zero, then low, then OK; then by name.
    const order = { below: 0, low: 1, ok: 2 };
    items.sort((a, b) => order[statusOf(a)] - order[statusOf(b)] || a.name.localeCompare(b.name));
    const active = items.filter((i) => i.active);
    const off = items.filter((i) => !i.active);

    showSummary(active);

    listBox.innerHTML = active.length
      ? `<div class="list stock-list">${active.map(itemRow).join('')}</div>`
      : '<div class="card muted">No stock items yet. Click "+ Add item" to add one.</div>';
    active.forEach((item) => wireRow(listBox.querySelector(`[data-id="${item.id}"]`), item));

    const offBox = main.querySelector('#inv-off');
    offBox.hidden = off.length === 0;
    offBox.innerHTML = `
      <summary>Switched-off items (${off.length})</summary>
      <p class="muted small">These have history, so they were switched off instead of deleted.</p>
      <div class="list stock-list">${off.map(itemRow).join('')}</div>`;
    off.forEach((item) => wireRow(offBox.querySelector(`[data-id="${item.id}"]`), item));
  }

  // The four boxes across the top.
  function showSummary(active) {
    const needBuying = active.filter((i) => statusOf(i) !== 'ok');
    const below = active.filter((i) => statusOf(i) === 'below').length;

    const soonest = active
      .map((i) => ({ item: i, days: daysLeft(i) }))
      .filter((x) => x.days !== null)
      .sort((a, b) => a.days - b.days)[0];

    const stat = (label, value, sub = '', cls = '') => `
      <div class="stat ${cls}">
        <div class="stat-label">${label}</div>
        <div class="stat-value">${value}</div>
        ${sub ? `<div class="muted small">${sub}</div>` : ''}
      </div>`;

    main.querySelector('#inv-summary').innerHTML = [
      stat('Stock items', formatNumber(active.length)),
      stat('Need buying', formatNumber(needBuying.length),
        needBuying.length ? escapeHtml(needBuying.map((i) => i.name).join(', ')) : 'all good',
        needBuying.length ? (below ? 'below' : 'low') : 'ok'),
      stat('Runs out first', soonest ? escapeHtml(soonest.item.name) : '—',
        soonest ? `about ${formatNumber(soonest.days)} day${soonest.days === 1 ? '' : 's'} left` : 'not enough sales yet'),
    ].join('');
  }

  async function loadNames() {
    const { data } = await db.from('profiles').select('id, full_name');
    names = Object.fromEntries((data || []).map((p) => [p.id, p.full_name]));
  }

  // ---------- One stock item ----------
  function itemRow(item) {
    const status = statusOf(item);
    const used = usedLastWeek[item.id] || 0;
    const days = daysLeft(item);
    const packOptions = item.pack_unit && item.pack_size
      ? `<option value="pack">${escapeHtml(unitWord(item.pack_unit, 2))} (${formatNumber(item.pack_size)} each)</option>` : '';

    return `
      <div class="list-row" data-id="${item.id}">
        <div class="stock-row">
          <div class="stock-name">
            <span class="stock-icon ${status}" aria-hidden="true">${ICONS[item.icon]
              ? iconSvg(item.icon)
              : escapeHtml(item.name.trim().charAt(0).toUpperCase())}</span>
            <div>
              <div class="row-title">${escapeHtml(item.name)}</div>
              <div class="muted small">Warn at ${escapeHtml(amountText(item.low_stock_level, item))}</div>
            </div>
          </div>

          <div class="stock-cell stock-level">
            ${gaugeSvg(item)}
            <span class="status-word ${status}">${STATUS_WORDS[status]}</span>
          </div>

          <div class="stock-cell">
            <div class="cell-label">In stock</div>
            <div class="cell-value ${status === 'below' ? 'error-text' : ''}">${escapeHtml(bigAmount(item))}</div>
            ${item.pack_unit && Math.abs(item.quantity) >= (item.pack_size || Infinity)
              ? `<div class="muted small">${escapeHtml(formatNumber(item.quantity) + ' ' + unitWord(item.base_unit, item.quantity))}</div>` : ''}
          </div>

          <div class="stock-cell">
            <div class="cell-label">Used (7 days)</div>
            <div class="cell-value">${used ? escapeHtml(formatNumber(used) + ' ' + unitWord(item.base_unit, used)) : '—'}</div>
            ${days !== null ? `<div class="muted small">about ${formatNumber(days)} day${days === 1 ? '' : 's'} left</div>` : ''}
          </div>

          <div class="stock-actions">
            ${item.active ? '<button type="button" class="button small primary open-adjust">Update stock</button>' : ''}
            <button type="button" class="icon-btn open-history" aria-label="History of ${escapeHtml(item.name)}" title="History">${BUTTON_ICONS.history}</button>
            <button type="button" class="icon-btn open-edit" aria-label="Edit ${escapeHtml(item.name)}" title="Edit">${BUTTON_ICONS.edit}</button>
          </div>
        </div>

        <form class="row-form panel-adjust" hidden>
          <label>What happened?
            <select name="reason">
              ${Object.entries(REASONS).map(([v, r]) => `<option value="${v}">${r.label}</option>`).join('')}
            </select>
          </label>
          <div class="field-pair">
            <label><span class="amount-label">How much?</span>
              <input type="text" name="amount" inputmode="decimal" required>
            </label>
            <label>Counted in
              <select name="unit">
                <option value="base">${escapeHtml(unitWord(item.base_unit, 2))}</option>
                ${packOptions}
              </select>
            </label>
          </div>
          <label>Note (why?)
            <input type="text" name="note" maxlength="200" required placeholder="${REASONS.purchase.hint}">
          </label>
          <div class="button-row">
            <button type="submit" class="button primary">Save</button>
            <button type="button" class="button close-panel">Cancel</button>
          </div>
        </form>

        <div class="row-form panel-history" hidden></div>

        <form class="row-form panel-edit" hidden>
          ${itemFields(item)}
          <label class="checkbox">
            <input type="checkbox" name="active" ${item.active ? 'checked' : ''}> In use (show in the main list)
          </label>
          <div class="button-row">
            <button type="submit" class="button primary">Save</button>
            <button type="button" class="button close-panel">Cancel</button>
            <button type="button" class="button remove push-right">Remove item</button>
          </div>
        </form>
      </div>`;
  }

  // Show one panel under a row (adjust / history / edit), hide the others.
  function openPanel(row, which) {
    row.querySelectorAll('.row-form').forEach((p) => {
      const show = p.classList.contains('panel-' + which) && p.hidden;
      p.hidden = !show;
    });
  }

  function wireRow(row, item) {
    row.querySelector('.open-adjust')?.addEventListener('click', () => openPanel(row, 'adjust'));
    row.querySelector('.open-edit').onclick = () => openPanel(row, 'edit');
    row.querySelector('.open-history').onclick = () => {
      openPanel(row, 'history');
      if (!row.querySelector('.panel-history').hidden) showHistory(row, item);
    };
    row.querySelectorAll('.close-panel').forEach((b) => {
      b.onclick = () => { b.closest('form').reset(); b.closest('form').hidden = true; };
    });

    // The wording changes with "What happened?"
    const adjust = row.querySelector('.panel-adjust');
    adjust.reason.onchange = () => {
      adjust.querySelector('.amount-label').textContent =
        adjust.reason.value === 'correction' ? 'How much is there now?' : 'How much?';
      adjust.note.placeholder = REASONS[adjust.reason.value].hint;
    };
    adjust.onsubmit = (e) => { e.preventDefault(); saveAdjustment(row, item); };

    const edit = row.querySelector('.panel-edit');
    edit.onsubmit = (e) => { e.preventDefault(); saveItem(item, edit); };
    edit.querySelector('.remove').onclick = () => removeItem(item);
  }

  // ---------- Add / remove stock ----------
  async function saveAdjustment(row, item) {
    const form = row.querySelector('.panel-adjust');
    const reason = form.reason.value;
    const amount = parseNumberInput(form.amount.value);
    const note = form.note.value.trim();
    const perUnit = form.unit.value === 'pack' ? item.pack_size : 1;

    if (amount === null || (reason !== 'correction' && amount === 0)) {
      return say('Please type how much, e.g. 2 or 500.', 'error');
    }
    if (!note) return say('Please add a note saying why.', 'error');

    let change;
    if (reason === 'purchase') change = amount * perUnit;
    if (reason === 'waste') change = -amount * perUnit;
    if (reason === 'correction') {
      // Use the very latest amount (a sale may have happened since this page opened).
      const { data, error } = await db.from('stock_items').select('quantity').eq('id', item.id).single();
      if (error) return say('Could not save. Please check your internet connection and try again.', 'error');
      change = amount * perUnit - Number(data.quantity);
      if (Math.abs(change) < 0.0005) {
        return say(`That matches what the website already shows for ${item.name}. Nothing to change.`);
      }
    }
    change = Math.round(change * 1000) / 1000;

    const button = form.querySelector('[type="submit"]');
    button.disabled = true;
    button.textContent = 'Saving…';
    const { error } = await db.from('stock_movements')
      .insert({ stock_item_id: item.id, change, reason, note });
    button.disabled = false;
    button.textContent = 'Save';

    if (error) return say('Could not save. Please check your internet connection and try again.', 'error');
    if (reason === 'correction') {
      say(`${item.name} now shows ${amountText(amount * perUnit, item)} – ` +
          `${formatNumber(Math.abs(change))} ${change > 0 ? 'more' : 'fewer'} than before.`);
    } else {
      const sign = change > 0 ? 'Added' : 'Took away';
      say(`${sign} ${amountText(Math.abs(change), item)} ${change > 0 ? 'to' : 'from'} ${item.name}.`);
    }
    loadItems();
  }

  // ---------- History ----------
  async function showHistory(row, item) {
    const box = row.querySelector('.panel-history');
    box.innerHTML = '<p class="muted">Loading…</p>';
    const { data, error } = await db.from('stock_movements')
      .select('id, change, reason, note, created_at, created_by')
      .eq('stock_item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(30);
    if (error) {
      box.innerHTML = '<p>Could not load the history. Please try again.</p>';
      return;
    }
    if (!data.length) {
      box.innerHTML = '<p class="muted">No changes yet.</p>';
      return;
    }
    box.innerHTML = `
      <p class="muted small">Latest 30 changes. Sales take stock away by themselves.</p>
      <div class="history">${data.map((m) => {
        const change = Number(m.change);
        return `
          <div class="history-row" data-id="${m.id}">
            <div>
              <b class="${change < 0 ? 'error-text' : 'good-text'}">${change > 0 ? '+' : '−'}${escapeHtml(amountText(Math.abs(change), item))}</b>
              · ${HISTORY_LABELS[m.reason] || m.reason}
              <div class="muted small">${formatDate(m.created_at)}, ${formatTime(m.created_at)}
                · ${escapeHtml(names[m.created_by] || '')}${m.note ? ' · ' + escapeHtml(m.note) : ''}</div>
            </div>
            ${m.reason !== 'sale' ? '<button type="button" class="button small undo">Undo</button>' : ''}
          </div>`;
      }).join('')}</div>`;

    data.filter((m) => m.reason !== 'sale').forEach((m) => {
      box.querySelector(`[data-id="${m.id}"] .undo`).onclick = () => undoMovement(m, item);
    });
  }

  async function undoMovement(m, item) {
    const change = Number(m.change);
    if (!confirm(`Undo this change (${change > 0 ? '+' : '−'}${amountText(Math.abs(change), item)})? ` +
                 'The stock will go back to what it was before it.')) return;
    const { error } = await db.from('stock_movements').delete().eq('id', m.id);
    if (error) return say('Could not undo. Please try again.', 'error');
    say(`Undone. ${item.name} is back to what it was before that change.`);
    loadItems();
  }

  // ---------- Add / edit / remove a stock item ----------
  function readItemForm(form) {
    const values = {
      name: form.name.value.trim(),
      base_unit: form.base_unit.value.trim().toLowerCase(),
      pack_unit: form.pack_unit.value.trim().toLowerCase() || null,
      pack_size: form.pack_size.value.trim() ? parseNumberInput(form.pack_size.value) : null,
      low_stock_level: parseNumberInput(form.low_stock_level.value || '0'),
      icon: ICONS[form.icon.value] ? form.icon.value : null,
    };
    if (!values.name) return say('Please type the item name.', 'error');
    if (!values.base_unit) return say('Please type what it is counted in, e.g. sheet or bottle.', 'error');
    if (form.pack_size.value.trim() && !values.pack_size) {
      return say('Please type how many are in one pack, e.g. 500.', 'error');
    }
    if (Boolean(values.pack_unit) !== Boolean(values.pack_size)) {
      return say('Fill in both the pack name and how many are in it, or leave both empty.', 'error');
    }
    if (values.low_stock_level === null) {
      return say('Please type the low-stock warning level as a number, e.g. 500.', 'error');
    }
    return values;
  }

  main.querySelector('#inv-add form').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const values = readItemForm(form);
    if (!values) return;
    const { error } = await db.from('stock_items').insert(values);
    if (error) return say(saveProblem(error), 'error');
    form.reset();
    delete form.dataset.iconChosen;
    addBox.hidden = true;
    say(`Added ${values.name}. Use "Update stock" → "I counted the stock" to enter how much you have now.`);
    loadItems();
  };

  // While adding an item, suggest a picture from its name (until one is picked by hand).
  const addForm = main.querySelector('#inv-add form');
  addForm.name.addEventListener('input', () => {
    if (addForm.dataset.iconChosen) return;
    const guess = guessIcon(addForm.name.value);
    addForm.querySelector(`input[name="icon"][value="${guess}"]`).checked = true;
  });
  addForm.querySelector('.icon-picker').addEventListener('change', () => {
    addForm.dataset.iconChosen = 'yes';
  });

  function saveProblem(error) {
    if (error.code === '23505') return 'A stock item with that name already exists.';
    if (isMissingIconColumn(error)) return NEEDS_UPDATE;
    return 'Could not save. Please check your internet connection and try again.';
  }

  async function saveItem(item, form) {
    const values = readItemForm(form);
    if (!values) return;
    values.active = form.active.checked;
    const { error } = await db.from('stock_items').update(values).eq('id', item.id);
    if (error) return say(saveProblem(error), 'error');
    say(`Saved ${values.name}.`);
    loadItems();
  }

  async function removeItem(item) {
    if (!confirm(`Remove ${item.name}?`)) return;
    const { error } = await db.from('stock_items').delete().eq('id', item.id);
    if (error && error.code === '23503') {
      // Has history or is linked to the price list → switch it off instead.
      const off = await db.from('stock_items').update({ active: false }).eq('id', item.id);
      if (off.error) return say('Could not save. Please try again.', 'error');
      say(`${item.name} has history or is used by the price list, so it was switched off instead of deleted.`);
    } else if (error) {
      return say('Could not remove. Please try again.', 'error');
    } else {
      say(`Removed ${item.name}.`);
    }
    loadItems();
  }

  await Promise.all([loadNames(), loadUsage()]);
  await loadItems();
}

// The fields for adding or editing a stock item.
function itemFields(item) {
  const v = (x) => escapeHtml(x ?? '');
  return `
    <label>Item name
      <input type="text" name="name" value="${v(item.name)}" maxlength="60" required placeholder="e.g. A3 paper">
    </label>
    <label>Counted in (smallest unit)
      <input type="text" name="base_unit" value="${v(item.base_unit ?? 'sheet')}" maxlength="20" required placeholder="e.g. sheet, bottle, ml">
    </label>
    <div class="field-pair">
      <label>Bought in packs called <span class="muted">(optional)</span>
        <input type="text" name="pack_unit" value="${v(item.pack_unit)}" maxlength="20" placeholder="e.g. ream">
      </label>
      <label>How many in one pack
        <input type="text" name="pack_size" inputmode="decimal" value="${item.pack_size ? Number(item.pack_size) : ''}" placeholder="e.g. 500">
      </label>
    </div>
    <label>Warn me when it is at or below (in the smallest unit)
      <input type="text" name="low_stock_level" inputmode="decimal" value="${item.low_stock_level !== undefined ? Number(item.low_stock_level) : ''}" placeholder="e.g. 500">
    </label>
    ${iconPicker(item.icon)}`;
}

// A grid of pictures to choose from. "None" shows the item's first letter instead.
function iconPicker(current) {
  const chosen = ICONS[current] ? current : '';
  const choice = (value, picture, label) => `
    <label class="icon-choice" title="${escapeHtml(label)}">
      <input type="radio" name="icon" value="${value}" ${value === chosen ? 'checked' : ''}>
      <span class="icon-tile">${picture}</span>
      <span class="icon-name">${escapeHtml(label)}</span>
    </label>`;
  return `
    <fieldset class="icon-picker">
      <legend>Picture</legend>
      ${choice('', '<span class="icon-letter">Aa</span>', 'None')}
      ${Object.entries(ICONS).map(([name, icon]) => choice(name, iconSvg(name), icon.label)).join('')}
    </fieldset>`;
}
