// =====================================================================
//  users.js – USERS SCREEN (Owner only)
// ---------------------------------------------------------------------
//  Shows everyone who has a login: name, email, role, active or not,
//  and when they last signed in. The Owner can change a person's name,
//  role and whether they are active.
//
//  New logins are created in the Supabase dashboard (the website can't
//  create logins safely). They appear here automatically as inactive
//  Staff until the Owner switches them on.
//
//  This is the ONLY screen where roles are ever shown.
// =====================================================================

import { escapeHtml, formatDate, formatTime } from '../helpers.js';

const ROLES = [
  { value: 'owner',   label: 'Owner'   },
  { value: 'manager', label: 'Manager' },
  { value: 'staff',   label: 'Staff'   },
];
const roleLabel = (value) => ROLES.find((r) => r.value === value)?.label || value;

// "19 Nov 2026, 9:30 AM", or "Never" if they have not signed in yet.
function lastSignIn(value) {
  return value ? `${formatDate(value)}, ${formatTime(value)}` : 'Never';
}

export async function render(main, { db, user }) {
  main.innerHTML = `
    <h1>Users</h1>
    <div id="users-message" class="notice" role="status" hidden></div>
    <div id="users-list"><p class="muted">Loading…</p></div>
    <details class="card help">
      <summary>How to add a new person</summary>
      <ol>
        <li>In Supabase, open <b>Authentication → Users</b>.</li>
        <li>Click <b>Add user → Create new user</b>, enter their email and a password,
            tick <b>Auto Confirm User</b>, and click <b>Create user</b>.</li>
        <li>Come back here and refresh. They appear as <b>Inactive</b> Staff.</li>
        <li>Click <b>Edit</b>, type their name, choose their role, tick <b>Active</b>, and save.</li>
      </ol>
      <p class="muted">To remove someone, untick <b>Active</b>. Don't delete their login,
         because their sales, payments and attendance must stay linked to them.</p>
    </details>`;

  const listBox = main.querySelector('#users-list');
  const messageBox = main.querySelector('#users-message');

  function showMessage(text, type) {
    messageBox.textContent = text;
    messageBox.className = 'notice ' + type;
    messageBox.hidden = false;
    messageBox.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  async function loadUsers() {
    const { data, error } = await db.rpc('list_users');
    if (error) {
      listBox.innerHTML = '<div class="card">Could not load the users. Please check your internet connection and refresh.</div>';
      return;
    }
    listBox.innerHTML = data.length
      ? `<div class="list">${data.map(userRow).join('')}</div>`
      : '<div class="card muted">No users found.</div>';

    // Wire up each person's Edit / Save / Cancel buttons.
    data.forEach((person) => {
      const row = listBox.querySelector(`[data-id="${person.id}"]`);
      const form = row.querySelector('form');
      row.querySelector('.edit').onclick = () => {
        form.hidden = false;
        row.querySelector('.edit').hidden = true;
        form.querySelector('[name="full_name"]').focus();
      };
      form.querySelector('.cancel').onclick = () => {
        form.reset();
        form.hidden = true;
        row.querySelector('.edit').hidden = false;
      };
      form.onsubmit = (event) => {
        event.preventDefault();
        saveUser(person, form);
      };
    });
  }

  // One person in the list, with a hidden edit form underneath.
  function userRow(p) {
    const isMe = p.id === user.id;
    return `
      <div class="list-row" data-id="${p.id}">
        <div class="row-main">
          <div>
            <div class="row-title">${escapeHtml(p.full_name || '(no name)')}${isMe ? ' <span class="muted">(you)</span>' : ''}</div>
            <div class="muted small">${escapeHtml(p.email)}</div>
            <div class="muted small">Last sign-in: ${lastSignIn(p.last_sign_in_at)}</div>
          </div>
          <div class="row-side">
            <span class="badge">${escapeHtml(roleLabel(p.role))}</span>
            <span class="badge ${p.active ? 'good' : 'off'}">${p.active ? 'Active' : 'Inactive'}</span>
            <button type="button" class="button small edit">Edit</button>
          </div>
        </div>
        <form class="row-form" hidden>
          <label>Name
            <input type="text" name="full_name" value="${escapeHtml(p.full_name)}" required maxlength="80">
          </label>
          <label>Role
            <select name="role">
              ${ROLES.map((r) => `<option value="${r.value}" ${r.value === p.role ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
          </label>
          <label class="checkbox">
            <input type="checkbox" name="active" ${p.active ? 'checked' : ''}> Active (can sign in and use the website)
          </label>
          <div class="button-row">
            <button type="submit" class="button primary">Save</button>
            <button type="button" class="button cancel">Cancel</button>
          </div>
        </form>
      </div>`;
  }

  async function saveUser(person, form) {
    const changes = {
      full_name: form.full_name.value.trim(),
      role: form.role.value,
      active: form.active.checked,
    };
    if (!changes.full_name) {
      showMessage('Please enter a name.', 'error');
      return;
    }

    const saveButton = form.querySelector('[type="submit"]');
    saveButton.disabled = true;
    saveButton.textContent = 'Saving…';

    const { error } = await db.from('profiles').update(changes).eq('id', person.id);

    saveButton.disabled = false;
    saveButton.textContent = 'Save';

    if (error) {
      // The database refuses to remove or downgrade the last active Owner.
      showMessage(error.message.includes('at least one active owner')
        ? 'There must always be at least one active Owner. Make someone else an active Owner first.'
        : 'Could not save. Please try again.', 'error');
      return;
    }

    // If you changed your own account, reload so the menu matches.
    if (person.id === user.id && (changes.role !== person.role || !changes.active)) {
      location.reload();
      return;
    }

    showMessage(`Saved ${changes.full_name}.`, 'good');
    await loadUsers();
  }

  await loadUsers();
}
