// =====================================================================
//  settings.js – SETTINGS SCREEN (Owner and Manager)
// ---------------------------------------------------------------------
//  Two parts:
//
//  1. EXPENSE CATEGORIES (Rent, Ink, ...)
//     Add, rename, remove. A category already used by an expense can't
//     be deleted, so it is HIDDEN instead (old expenses keep it). Hidden
//     categories can be brought back.
//
//  2. DISCOUNTS (named, fixed rupee amounts, e.g. "Student – Rs. 50")
//     Add, edit, switch on/off, remove. A discount already used on a sale
//     is SWITCHED OFF instead of deleted. Changing an amount only affects
//     new sales; past sales keep the amount they were given.
// =====================================================================

import { escapeHtml, formatMoney, parseMoneyInput, showNotice } from '../helpers.js';

// Turn a database error into a plain message.
function problemText(error, thing) {
  if (error.code === '23505') return `A ${thing} with that name already exists.`;
  if (error.code === '23514') return 'Please check what you typed and try again.';
  return 'Could not save. Please check your internet connection and try again.';
}

export async function render(main, { db }) {
  main.innerHTML = `
    <h1>Settings</h1>
    <div id="settings-message" class="notice" role="status" hidden></div>

    <section class="section">
      <h2>Expense categories</h2>
      <p class="muted small">Used when recording expenses.</p>
      <form id="add-category" class="add-form">
        <label>New category
          <input type="text" name="name" maxlength="60" required>
        </label>
        <button type="submit" class="button primary">Add</button>
      </form>
      <div id="category-list"><p class="muted">Loading…</p></div>
      <details id="hidden-categories" class="card help" hidden></details>
    </section>

    <section class="section">
      <h2>Discounts</h2>
      <p class="muted small">Fixed rupee discounts that can be chosen on a sale.
        Changing an amount only affects new sales; past sales keep the discount they were given.</p>
      <form id="add-discount" class="add-form">
        <label>Discount name
          <input type="text" name="name" maxlength="60" placeholder="e.g. Student" required>
        </label>
        <label class="narrow">Amount (Rs.)
          <input type="text" name="amount" inputmode="decimal" placeholder="e.g. 50" required>
        </label>
        <button type="submit" class="button primary">Add</button>
      </form>
      <div id="discount-list"><p class="muted">Loading…</p></div>
    </section>`;

  const messageBox = main.querySelector('#settings-message');
  const say = (text, type = 'good') => showNotice(messageBox, text, type);

  // Open / close an inline edit form under a row.
  function wireEditToggle(row) {
    const form = row.querySelector('form');
    const editButton = row.querySelector('.edit');
    editButton.onclick = () => {
      form.hidden = false;
      editButton.hidden = true;
      form.querySelector('input').focus();
    };
    form.querySelector('.cancel').onclick = () => {
      form.reset();
      form.hidden = true;
      editButton.hidden = false;
    };
  }

  // A Save button shows "Saving…" while it works.
  async function whileSaving(button, work) {
    const label = button.textContent;
    button.disabled = true;
    button.textContent = 'Saving…';
    try { return await work(); }
    finally { button.disabled = false; button.textContent = label; }
  }

  // =================================================================
  //  1. EXPENSE CATEGORIES
  // =================================================================

  let categories = [];

  async function loadCategories() {
    const { data, error } = await db.from('expense_categories')
      .select('id, name, archived, sort_order')
      .order('sort_order').order('name');
    const listBox = main.querySelector('#category-list');
    if (error) {
      listBox.innerHTML = '<div class="card">Could not load the categories. Please refresh the page.</div>';
      return;
    }
    categories = data;
    const shown = data.filter((c) => !c.archived);
    const hidden = data.filter((c) => c.archived);

    listBox.innerHTML = shown.length
      ? `<div class="list">${shown.map(categoryRow).join('')}</div>`
      : '<div class="card muted">No categories yet. Add one above.</div>';

    shown.forEach((c) => {
      const row = listBox.querySelector(`[data-id="${c.id}"]`);
      wireEditToggle(row);
      row.querySelector('form').onsubmit = (e) => { e.preventDefault(); renameCategory(c, row); };
      row.querySelector('.remove').onclick = () => removeCategory(c);
    });

    // Hidden categories, in a box that opens and closes.
    const hiddenBox = main.querySelector('#hidden-categories');
    hiddenBox.hidden = hidden.length === 0;
    hiddenBox.innerHTML = `
      <summary>Hidden categories (${hidden.length})</summary>
      <p class="muted small">These are used by past expenses, so they were hidden instead of deleted.</p>
      <div class="list">${hidden.map((c) => `
        <div class="list-row" data-id="${c.id}">
          <div class="row-main">
            <div class="row-title">${escapeHtml(c.name)}</div>
            <div class="row-side"><button type="button" class="button small restore">Bring back</button></div>
          </div>
        </div>`).join('')}</div>`;
    hidden.forEach((c) => {
      hiddenBox.querySelector(`[data-id="${c.id}"] .restore`).onclick = () => restoreCategory(c);
    });
  }

  function categoryRow(c) {
    return `
      <div class="list-row" data-id="${c.id}">
        <div class="row-main">
          <div class="row-title">${escapeHtml(c.name)}</div>
          <div class="row-side">
            <button type="button" class="button small edit">Rename</button>
            <button type="button" class="button small remove">Remove</button>
          </div>
        </div>
        <form class="row-form" hidden>
          <label>Name
            <input type="text" name="name" value="${escapeHtml(c.name)}" maxlength="60" required>
          </label>
          <div class="button-row">
            <button type="submit" class="button primary">Save</button>
            <button type="button" class="button cancel">Cancel</button>
          </div>
        </form>
      </div>`;
  }

  main.querySelector('#add-category').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const name = form.name.value.trim();
    if (!name) return say('Please type a category name.', 'error');
    const nextOrder = Math.max(0, ...categories.map((c) => c.sort_order)) + 1;

    const { error } = await whileSaving(form.querySelector('button'), () =>
      db.from('expense_categories').insert({ name, sort_order: nextOrder }));
    if (error) {
      const isHidden = error.code === '23505' && categories.some((c) => c.archived && c.name === name);
      return say(isHidden
        ? `"${name}" already exists but is hidden. Open "Hidden categories" below and click Bring back.`
        : problemText(error, 'category'), 'error');
    }
    form.reset();
    say(`Added "${name}".`);
    loadCategories();
  };

  async function renameCategory(c, row) {
    const form = row.querySelector('form');
    const name = form.name.value.trim();
    if (!name) return say('Please type a category name.', 'error');
    const { error } = await whileSaving(form.querySelector('[type="submit"]'), () =>
      db.from('expense_categories').update({ name }).eq('id', c.id));
    if (error) return say(problemText(error, 'category'), 'error');
    say(`Renamed to "${name}".`);
    loadCategories();
  }

  async function removeCategory(c) {
    if (!confirm(`Remove the category "${c.name}"?`)) return;
    const { error } = await db.from('expense_categories').delete().eq('id', c.id);
    if (error && error.code === '23503') {
      // Used by past expenses → hide it instead.
      const hide = await db.from('expense_categories').update({ archived: true }).eq('id', c.id);
      if (hide.error) return say(problemText(hide.error, 'category'), 'error');
      say(`"${c.name}" is used by past expenses, so it was hidden instead of deleted. ` +
          'Old expenses keep it. You can bring it back under "Hidden categories".');
    } else if (error) {
      return say(problemText(error, 'category'), 'error');
    } else {
      say(`Removed "${c.name}".`);
    }
    loadCategories();
  }

  async function restoreCategory(c) {
    const { error } = await db.from('expense_categories').update({ archived: false }).eq('id', c.id);
    if (error) return say(problemText(error, 'category'), 'error');
    say(`"${c.name}" is back in the list.`);
    loadCategories();
  }

  // =================================================================
  //  2. DISCOUNTS
  // =================================================================

  async function loadDiscounts() {
    const { data, error } = await db.from('discounts')
      .select('id, name, amount, active')
      .order('active', { ascending: false }).order('name');
    const listBox = main.querySelector('#discount-list');
    if (error) {
      listBox.innerHTML = '<div class="card">Could not load the discounts. Please refresh the page.</div>';
      return;
    }
    listBox.innerHTML = data.length
      ? `<div class="list">${data.map(discountRow).join('')}</div>`
      : '<div class="card muted">No discounts yet. Add one above.</div>';

    data.forEach((d) => {
      const row = listBox.querySelector(`[data-id="${d.id}"]`);
      wireEditToggle(row);
      row.querySelector('form').onsubmit = (e) => { e.preventDefault(); saveDiscount(d, row); };
      row.querySelector('.remove').onclick = () => removeDiscount(d);
    });
  }

  function discountRow(d) {
    return `
      <div class="list-row" data-id="${d.id}">
        <div class="row-main">
          <div>
            <div class="row-title">${escapeHtml(d.name)}</div>
            <div class="muted small">${formatMoney(d.amount)} off</div>
          </div>
          <div class="row-side">
            <span class="badge ${d.active ? 'good' : 'off'}">${d.active ? 'On' : 'Off'}</span>
            <button type="button" class="button small edit">Edit</button>
            <button type="button" class="button small remove">Remove</button>
          </div>
        </div>
        <form class="row-form" hidden>
          <label>Name
            <input type="text" name="name" value="${escapeHtml(d.name)}" maxlength="60" required>
          </label>
          <label>Amount (Rs.)
            <input type="text" name="amount" inputmode="decimal" value="${Number(d.amount).toFixed(2)}" required>
          </label>
          <label class="checkbox">
            <input type="checkbox" name="active" ${d.active ? 'checked' : ''}> On (can be chosen on new sales)
          </label>
          <div class="button-row">
            <button type="submit" class="button primary">Save</button>
            <button type="button" class="button cancel">Cancel</button>
          </div>
        </form>
      </div>`;
  }

  // Check a discount's name and amount; returns the values, or null after showing a message.
  function readDiscountForm(form) {
    const name = form.name.value.trim();
    const amount = parseMoneyInput(form.amount.value);
    if (!name) { say('Please type a discount name.', 'error'); return null; }
    if (amount === null || amount <= 0) {
      say('Please type the discount amount in rupees, e.g. 50 or 75.50.', 'error');
      return null;
    }
    return { name, amount };
  }

  main.querySelector('#add-discount').onsubmit = async (e) => {
    e.preventDefault();
    const form = e.target;
    const values = readDiscountForm(form);
    if (!values) return;
    const { error } = await whileSaving(form.querySelector('button'), () =>
      db.from('discounts').insert(values));
    if (error) return say(problemText(error, 'discount'), 'error');
    form.reset();
    say(`Added "${values.name}" (${formatMoney(values.amount)} off).`);
    loadDiscounts();
  };

  async function saveDiscount(d, row) {
    const form = row.querySelector('form');
    const values = readDiscountForm(form);
    if (!values) return;
    values.active = form.active.checked;
    const { error } = await whileSaving(form.querySelector('[type="submit"]'), () =>
      db.from('discounts').update(values).eq('id', d.id));
    if (error) return say(problemText(error, 'discount'), 'error');
    say(`Saved "${values.name}".`);
    loadDiscounts();
  }

  async function removeDiscount(d) {
    if (!confirm(`Remove the discount "${d.name}"?`)) return;
    const { error } = await db.from('discounts').delete().eq('id', d.id);
    if (error && error.code === '23503') {
      // Already used on sales → switch it off instead.
      const off = await db.from('discounts').update({ active: false }).eq('id', d.id);
      if (off.error) return say(problemText(off.error, 'discount'), 'error');
      say(`"${d.name}" has been used on sales, so it was switched off instead of deleted. ` +
          'It can no longer be chosen on new sales.');
    } else if (error) {
      return say(problemText(error, 'discount'), 'error');
    } else {
      say(`Removed "${d.name}".`);
    }
    loadDiscounts();
  }

  await Promise.all([loadCategories(), loadDiscounts()]);
}
