// =====================================================================
//  inventory.js – INVENTORY SCREEN (Owner and Manager)
// ---------------------------------------------------------------------
//  Shows every stock item (paper, ink, ...) with how much is left,
//  and warns when it is low or below zero.
//
//  For each item you can:
//    • Add / remove stock – bought more, something was wasted, or you
//      counted it and want the website to match your count. A note is
//      always needed so everyone knows why.
//    • History – the latest changes (sales take stock away by themselves).
//      A manual change made by mistake can be undone here.
//    • Edit – name, units (e.g. sheet / ream of 500) and low-stock level.
//
//  The amount left is NEVER typed in directly: the database works it out
//  from all the changes, so it can't be fiddled.
// =====================================================================

import {
  escapeHtml, formatDate, formatTime, formatNumber,
  parseNumberInput, showNotice,
} from '../helpers.js';

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

const REASONS = {
  purchase:   { label: 'Bought more',          hint: 'e.g. Bought from ABC Stationers' },
  waste:      { label: 'Spoiled or wasted',    hint: 'e.g. Paper jam, damaged in rain' },
  correction: { label: 'I counted the stock',  hint: 'e.g. Monthly count' },
};
const HISTORY_LABELS = { sale: 'Sale', purchase: 'Bought', waste: 'Wasted', correction: 'Count correction' };

export async function render(main, { db }) {
  main.innerHTML = `
    <h1>Inventory</h1>
    <div id="inv-message" class="notice" role="status" hidden></div>
    <div id="inv-summary"></div>
    <details id="inv-add" class="card add-panel">
      <summary>+ Add a stock item</summary>
      <form class="item-form">${itemFields({})}
        <div class="button-row"><button type="submit" class="button primary">Add item</button></div>
      </form>
    </details>
    <div id="inv-list"><p class="muted">Loading…</p></div>
    <details id="inv-off" class="card help" hidden></details>`;

  const messageBox = main.querySelector('#inv-message');
  const say = (text, type = 'good') => showNotice(messageBox, text, type);
  let names = {};   // user id → name, for the History lists

  // ---------- Loading ----------
  async function loadItems() {
    const { data, error } = await db.from('stock_items')
      .select('id, name, base_unit, pack_unit, pack_size, quantity, low_stock_level, active')
      .order('name');
    const listBox = main.querySelector('#inv-list');
    if (error) {
      listBox.innerHTML = '<div class="card">Could not load the stock. Please refresh the page.</div>';
      return;
    }
    const items = data.map((i) => ({
      ...i,
      quantity: Number(i.quantity),
      low_stock_level: Number(i.low_stock_level),
      pack_size: i.pack_size === null ? null : Number(i.pack_size),
    }));
    const active = items.filter((i) => i.active);
    const off = items.filter((i) => !i.active);

    // Summary of problems at the top.
    const low = active.filter(isLow);
    main.querySelector('#inv-summary').innerHTML = low.length
      ? `<div class="notice error">Low on stock: ${low.map((i) => escapeHtml(i.name)).join(', ')}</div>`
      : '';

    listBox.innerHTML = active.length
      ? `<div class="list">${active.map(itemRow).join('')}</div>`
      : '<div class="card muted">No stock items yet. Add one above.</div>';
    active.forEach((item) => wireRow(listBox.querySelector(`[data-id="${item.id}"]`), item));

    const offBox = main.querySelector('#inv-off');
    offBox.hidden = off.length === 0;
    offBox.innerHTML = `
      <summary>Switched-off items (${off.length})</summary>
      <p class="muted small">These have history, so they were switched off instead of deleted.</p>
      <div class="list">${off.map(itemRow).join('')}</div>`;
    off.forEach((item) => wireRow(offBox.querySelector(`[data-id="${item.id}"]`), item));
  }

  async function loadNames() {
    const { data } = await db.from('profiles').select('id, full_name');
    names = Object.fromEntries((data || []).map((p) => [p.id, p.full_name]));
  }

  // ---------- One stock item ----------
  function itemRow(item) {
    const badges = [];
    if (item.quantity < 0) badges.push('<span class="badge off">Below zero – please count and correct</span>');
    else if (isLow(item)) badges.push('<span class="badge off">Low stock</span>');

    const packOptions = item.pack_unit && item.pack_size
      ? `<option value="pack">${escapeHtml(unitWord(item.pack_unit, 2))} (${formatNumber(item.pack_size)} each)</option>` : '';

    return `
      <div class="list-row" data-id="${item.id}">
        <div class="row-main">
          <div>
            <div class="row-title">${escapeHtml(item.name)}</div>
            <div class="${item.quantity < 0 ? 'error-text' : ''}">${escapeHtml(amountText(item.quantity, item))} left</div>
            <div class="muted small">Warn at ${escapeHtml(amountText(item.low_stock_level, item))} or less</div>
          </div>
          <div class="row-side">
            ${badges.join('')}
            ${item.active ? '<button type="button" class="button small open-adjust">Add / remove stock</button>' : ''}
            <button type="button" class="button small open-history">History</button>
            <button type="button" class="button small open-edit">Edit</button>
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
    if (error) {
      return say(error.code === '23505' ? 'A stock item with that name already exists.'
        : 'Could not save. Please check your internet connection and try again.', 'error');
    }
    form.reset();
    main.querySelector('#inv-add').open = false;
    say(`Added ${values.name}. Use "Add / remove stock" → "I counted the stock" to enter how much you have now.`);
    loadItems();
  };

  async function saveItem(item, form) {
    const values = readItemForm(form);
    if (!values) return;
    values.active = form.active.checked;
    const { error } = await db.from('stock_items').update(values).eq('id', item.id);
    if (error) {
      return say(error.code === '23505' ? 'A stock item with that name already exists.'
        : 'Could not save. Please check your internet connection and try again.', 'error');
    }
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

  await Promise.all([loadNames(), loadItems()]);
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
    </label>`;
}
