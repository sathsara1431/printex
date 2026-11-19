// =====================================================================
//  menu.js – THE MENU
// ---------------------------------------------------------------------
//  Lists every screen the website has, and builds the menu showing ONLY
//  the screens the database says this person may use (from my_menu()).
// =====================================================================

import { escapeHtml } from './helpers.js';

// Every screen: its name (as my_menu() returns it), the menu label, and
// the file that draws it (in the js/screens folder).
export const SCREENS = {
  dashboard:  { label: 'Dashboard',    file: 'dashboard.js'  },
  sales:      { label: 'Sales',        file: 'sales.js'      },
  customers:  { label: 'Customers',    file: 'customers.js'  },
  attendance: { label: 'Attendance',   file: 'attendance.js' },
  expenses:   { label: 'Expenses',     file: 'expenses.js'   },
  inventory:  { label: 'Inventory',    file: 'inventory.js'  },
  price_list: { label: 'Price List',   file: 'pricelist.js'  },
  settings:   { label: 'Settings',     file: 'settings.js'   },
  users:      { label: 'Users',        file: 'users.js'      },
  activity:   { label: 'Activity Log', file: 'activity.js'   },
  backup:     { label: 'Backup',       file: 'backup.js'     },
};

// Draw the menu links. `allowed` is the list from my_menu().
export function buildMenu(navElement, allowed) {
  navElement.innerHTML = allowed
    .filter((name) => SCREENS[name])           // ignore anything we don't know
    .map((name) =>
      `<a href="#${name}" data-screen="${name}">${escapeHtml(SCREENS[name].label)}</a>`)
    .join('');
}

// Underline the menu link for the screen that is open now.
export function highlightMenu(navElement, current) {
  navElement.querySelectorAll('a').forEach((link) => {
    link.classList.toggle('active', link.dataset.screen === current);
  });
}
