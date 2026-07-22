// Enterprise State Management
let inventoryMap = new Map(); // ID -> Item Object
let auditLogs = [];
let allUsers = []; // Loaded from /api/users (admin use)
let currentUser = null;
let currentView = 'overview';

// Catalog Pagination & Filter State
let currentPage = 1;
const pageSize = 10;
let catalogSearchQuery = '';
let catalogCategoryFilter = 'ALL';
let catalogSortMode = 'ID_ASC';
let lowStockOnly = false;

// DOM Elements - Auth & Shell
const authOverlay = document.getElementById('auth-overlay');
const appWrapper = document.getElementById('app-wrapper');
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
let pendingProfilePic = null;
let profileModalInitialized = false;
let inventoryListenersInitialized = false;

const userAvatar = document.getElementById('user-avatar');
const avatarInitials = document.getElementById('avatar-initials');
const avatarImg = document.getElementById('avatar-img');
const userDisplayName = document.getElementById('user-display-name');
const userDisplayRole = document.getElementById('user-display-role');
const btnLogout = document.getElementById('btn-logout');

// Command Palette DOM
const cmdKModal = document.getElementById('cmd-k-modal');
const cmdKBtn = document.getElementById('cmd-k-btn');
const cmdKInput = document.getElementById('cmd-k-input');
const cmdKResults = document.getElementById('cmd-k-results');

// Views & Navigation
const navItems = document.querySelectorAll('.nav-item');
const viewSections = document.querySelectorAll('.view-section');

// Catalog DOM Elements
const catalogTbody = document.getElementById('catalog-tbody');
const catalogSearch = document.getElementById('catalog-search');
const catalogCategorySelect = document.getElementById('catalog-category-filter');
const catalogSortSelect = document.getElementById('catalog-sort-select');
const btnToggleLow = document.getElementById('btn-toggle-low');
const binaryVisualizer = document.getElementById('binary-visualizer');
const binaryStepsContainer = document.getElementById('binary-steps-container');

// Pagination DOM
const pageStart = document.getElementById('page-start');
const pageEnd = document.getElementById('page-end');
const pageTotal = document.getElementById('page-total');
const pageIndicator = document.getElementById('page-indicator');
const btnPrevPage = document.getElementById('btn-prev-page');
const btnNextPage = document.getElementById('btn-next-page');

// Modal Elements
const itemModal = document.getElementById('item-modal');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const itemForm = document.getElementById('item-form');
const formMode = document.getElementById('form-mode');
const inputId = document.getElementById('item-id');
const inputName = document.getElementById('item-name');
const inputCategory = document.getElementById('item-category');
const inputPrice = document.getElementById('item-price');
const inputQty = document.getElementById('item-qty');
const inputReorder = document.getElementById('item-reorder');

// Toast Notification Helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `${type === 'success' ? '✅' : '❌'} <span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(100%)';
    setTimeout(() => toast.remove(), 300);
  }, 3200);
}

// Initial Seed Fallback Data
const seedItems = [
  { id: 101, name: "MacBook Pro 16", category: "Electronics", price: 2499.99, quantity: 12, reorderLevel: 5 },
  { id: 102, name: "Dell XPS 15", category: "Electronics", price: 1899.50, quantity: 8, reorderLevel: 3 },
  { id: 103, name: "Ergonomic Office Chair", category: "Furniture", price: 349.00, quantity: 4, reorderLevel: 5 },
  { id: 104, name: "Mechanical Keyboard", category: "Accessories", price: 129.99, quantity: 25, reorderLevel: 10 },
  { id: 105, name: "Wireless Gaming Mouse", category: "Accessories", price: 79.95, quantity: 3, reorderLevel: 5 },
  { id: 106, name: "4K UHD Monitor 27 inch", category: "Electronics", price: 449.99, quantity: 2, reorderLevel: 4 },
  { id: 107, name: "USB-C Multiport Dock", category: "Accessories", price: 59.99, quantity: 18, reorderLevel: 8 },
  { id: 108, name: "Standing Desk Frame", category: "Furniture", price: 499.00, quantity: 1, reorderLevel: 2 },
  { id: 200, name: "Wireless Earbuds", category: "Accessories", price: 149.99, quantity: 13, reorderLevel: 5 }
];

// App Initialization
document.addEventListener('DOMContentLoaded', () => {
  setupAuthListeners();
  setupNavigationListeners();
  setupCommandPalette();
  initAuth();
});

async function initAuth() {
  try {
    const res = await apiFetch('/api/auth/me');
    const data = await res.json();
    if (res.ok && data.user) {
      currentUser = data.user;
      await showMainApp();
      return;
    }
  } catch (err) {
    console.warn('No active local session:', err);
  }

  currentUser = null;
  showAuthOverlay('manager-login');
}

async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  return fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin'
  });
}

function showAuthSetupError(message) {
  authOverlay.style.display = 'flex';
  appWrapper.style.display = 'none';
  authOverlay.innerHTML = `
    <div class="auth-card" style="text-align: center;">
      <div style="font-size: 42px; margin-bottom: 8px;">🔐</div>
      <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 8px;">Authentication Error</h2>
      <p style="color: var(--text-muted); font-size: 14px; line-height: 1.6;">
        ${escapeHtml(message)}
      </p>
    </div>
  `;
}

function showAuthOverlay(mode = 'manager-login') {
  authOverlay.style.display = 'flex';
  appWrapper.style.display = 'none';

  const isManagerLogin = mode === 'manager-login';
  const isSignup = mode === 'signup';
  const isAdminLogin = mode === 'admin-login';

  authOverlay.innerHTML = `
    <div class="auth-card auth-card-wide">
      <div class="auth-header">
        <div class="auth-logo">📦</div>
        <h2>Inventory OS Access</h2>
        <p>${isAdminLogin ? 'Admin control center' : isSignup ? 'Request store manager access' : 'Store manager login'}</p>
      </div>

      <div class="auth-tabs" role="tablist">
        <button type="button" class="auth-tab ${isManagerLogin ? 'active' : ''}" data-auth-mode="manager-login">Manager Login</button>
        <button type="button" class="auth-tab ${isSignup ? 'active' : ''}" data-auth-mode="signup">Signup</button>
        <button type="button" class="auth-tab ${isAdminLogin ? 'active' : ''}" data-auth-mode="admin-login">Admin Login</button>
      </div>

      <form class="auth-form ${isManagerLogin ? 'active' : ''}" id="manager-login-form">
        <div class="form-group">
          <label for="manager-login-username">Username</label>
          <input type="text" id="manager-login-username" autocomplete="username" required>
        </div>
        <div class="form-group">
          <label for="manager-login-password">Password</label>
          <input type="password" id="manager-login-password" autocomplete="current-password" required>
        </div>
        <button type="submit" class="btn-pro btn-pro-primary auth-submit">Login as Manager</button>
      </form>

      <form class="auth-form ${isSignup ? 'active' : ''}" id="manager-signup-form">
        <div class="form-group">
          <label for="signup-name">Full Name</label>
          <input type="text" id="signup-name" autocomplete="name" required>
        </div>
        <div class="form-group">
          <label for="signup-username">Username</label>
          <input type="text" id="signup-username" autocomplete="username" required>
        </div>
        <div class="form-group">
          <label for="signup-email">Email</label>
          <input type="email" id="signup-email" autocomplete="email">
        </div>
        <div class="form-group">
          <label for="signup-mode">Account Mode</label>
          <select id="signup-mode" class="select-pro" required>
            <option value="Store Manager">Store Manager</option>
            <option value="Inventory Operator">Inventory Operator</option>
            <option value="Stock Auditor">Stock Auditor</option>
          </select>
        </div>
        <div class="form-group">
          <label for="signup-password">Password</label>
          <input type="password" id="signup-password" autocomplete="new-password" minlength="6" required>
        </div>
        <div class="form-group">
          <label for="signup-confirm-password">Confirm Password</label>
          <input type="password" id="signup-confirm-password" autocomplete="new-password" minlength="6" required>
        </div>
        <button type="submit" class="btn-pro btn-pro-primary auth-submit">Request Approval</button>
      </form>

      <form class="auth-form ${isAdminLogin ? 'active' : ''}" id="admin-login-form">
        <div class="form-group">
          <label for="admin-login-username">Admin Username</label>
          <input type="text" id="admin-login-username" autocomplete="username" required>
        </div>
        <div class="form-group">
          <label for="admin-login-password">Admin Password</label>
          <input type="password" id="admin-login-password" autocomplete="current-password" required>
        </div>
        <button type="submit" class="btn-pro btn-pro-primary auth-submit">Login as Admin</button>
      </form>
    </div>
  `;

  bindAuthOverlayEvents();
}

function bindAuthOverlayEvents() {
  authOverlay.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.addEventListener('click', () => showAuthOverlay(button.dataset.authMode));
  });

  document.getElementById('manager-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitLogin('/api/auth/login', {
      username: document.getElementById('manager-login-username').value,
      password: document.getElementById('manager-login-password').value
    });
  });

  document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await submitLogin('/api/auth/admin-login', {
      username: document.getElementById('admin-login-username').value,
      password: document.getElementById('admin-login-password').value
    });
  });

  document.getElementById('manager-signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    try {
      const res = await apiFetch('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          name: document.getElementById('signup-name').value,
          username: document.getElementById('signup-username').value,
          email: document.getElementById('signup-email').value,
          mode: document.getElementById('signup-mode').value,
          password
        })
      });
      const data = await res.json();
      if (res.ok && data.user) {
        showPendingScreen(data.user.name);
      } else {
        showToast(data.error || 'Signup failed', 'error');
      }
    } catch (err) {
      showToast('Network error during signup', 'error');
    }
  });
}

async function submitLogin(endpoint, payload) {
  try {
    const res = await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();

    if (res.ok && data.user) {
      currentUser = data.user;
      await showMainApp();
      return;
    }

    if (data.status === 'pending') {
      showPendingScreen(data.name || payload.username);
      return;
    }

    showToast(data.error || 'Login failed', 'error');
  } catch (err) {
    showToast('Network error during login', 'error');
  }
}

async function showMainApp() {
  authOverlay.style.display = 'none';
  appWrapper.style.display = 'flex';

  if (currentUser) {
    userDisplayName.textContent = currentUser.name || currentUser.username;
    userDisplayRole.textContent = currentUser.mode || currentUser.role || 'Member';
    updateAvatarDisplay(currentUser.profilePic || null, currentUser.name);

    // Show admin-only nav items
    const adminNavItems = document.querySelectorAll('.admin-only-nav');
    adminNavItems.forEach(el => {
      el.style.display = currentUser.role === 'Admin' ? 'flex' : 'none';
    });

    if (currentUser.role !== 'Admin' && currentView === 'team') {
      switchView('overview');
    }
  }

  await Promise.all([fetchInventoryData(), fetchAuditLogs(), fetchUsers()]);
  populateCategories();
  renderAllViews();
  setupInventoryModalListeners();
  setupProfileModal();
}

// Update Avatar Display (sidebar pill + profile modal)
function updateAvatarDisplay(picDataUrl, name) {
  const initials = avatarInitials;
  const img = avatarImg;
  const letter = name ? name.charAt(0).toUpperCase() : 'U';

  if (picDataUrl) {
    img.src = picDataUrl;
    img.style.display = 'block';
    initials.style.display = 'none';
  } else {
    img.style.display = 'none';
    initials.style.display = 'block';
    initials.textContent = letter;
  }
}

// Setup User Profile Modal
function setupProfileModal() {
  const userCardClickable = document.getElementById('user-card-clickable');
  if (userCardClickable && !userCardClickable.dataset.profileBound) {
    userCardClickable.dataset.profileBound = 'true';
    userCardClickable.addEventListener('click', (e) => {
      if (e.target.closest('#btn-logout')) return;
      openProfileModal();
    });
  }

  if (profileModalInitialized) return;
  profileModalInitialized = true;

  const profileModal = document.getElementById('profile-modal');
  const fileInput = document.getElementById('profile-pic-input');
  const closeProfileModal = () => profileModal.classList.remove('open');

  document.getElementById('profile-modal-close')?.addEventListener('click', closeProfileModal);
  document.getElementById('profile-modal-cancel')?.addEventListener('click', closeProfileModal);
  profileModal?.addEventListener('click', (e) => {
    if (e.target === profileModal) closeProfileModal();
  });

  document.getElementById('btn-remove-avatar')?.addEventListener('click', () => {
    pendingProfilePic = null;
    updateProfilePreview(null);
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file', 'error');
      fileInput.value = '';
      return;
    }
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      showToast('Profile photo must be 2MB or smaller', 'error');
      fileInput.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      pendingProfilePic = reader.result;
      updateProfilePreview(pendingProfilePic);
    };
    reader.onerror = () => showToast('Could not read that photo', 'error');
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-save-profile')?.addEventListener('click', saveProfileChanges);
}

function openProfileModal() {
  if (!currentUser) return;
  pendingProfilePic = currentUser.profilePic || null;

  document.getElementById('profile-info-name').textContent = currentUser.name || '—';
  document.getElementById('profile-info-username').textContent = currentUser.username || '—';
  document.getElementById('profile-info-role').textContent = currentUser.mode || currentUser.role || '—';
  document.getElementById('profile-pic-input').value = '';
  updateProfilePreview(pendingProfilePic);
  document.getElementById('profile-modal').classList.add('open');
}

function updateProfilePreview(picDataUrl) {
  const initials = document.getElementById('profile-avatar-initials');
  const img = document.getElementById('profile-avatar-img');
  const letter = currentUser?.name ? currentUser.name.charAt(0).toUpperCase() : 'U';

  if (picDataUrl) {
    img.src = picDataUrl;
    img.style.display = 'block';
    initials.style.display = 'none';
  } else {
    img.removeAttribute('src');
    img.style.display = 'none';
    initials.style.display = 'block';
    initials.textContent = letter;
  }
}

async function saveProfileChanges() {
  try {
    const res = await apiFetch('/api/me/profile', {
      method: 'PATCH',
      body: JSON.stringify({ profilePic: pendingProfilePic })
    });
    const data = await res.json();
    if (!res.ok) {
      showToast(data.error || 'Profile update failed', 'error');
      return;
    }

    currentUser = data.user;
    updateAvatarDisplay(currentUser.profilePic || null, currentUser.name);
    document.getElementById('profile-modal').classList.remove('open');
    showToast('Profile photo updated');
  } catch (err) {
    showToast('Could not save profile photo', 'error');
  }
}

// Fetch All Users (for admin team view)
async function fetchUsers() {
  if (!currentUser || currentUser.role !== 'Admin') {
    allUsers = [];
    return;
  }

  try {
    const res = await apiFetch('/api/users');
    if (res.ok) {
      allUsers = await res.json();
    }
  } catch (err) {
    allUsers = [];
  }
}

// Fetch Inventory Data from Server API
async function fetchInventoryData() {
  try {
    const res = await apiFetch('/api/inventory');
    if (res.ok) {
      const data = await res.json();
      inventoryMap.clear();
      data.forEach(item => inventoryMap.set(Number(item.id), item));
      document.getElementById('status-text').textContent = 'Synced with inventory.csv';
      return;
    }
  } catch (err) {
    console.warn('Server offline, loading browser storage');
    document.getElementById('status-text').textContent = 'Local Browser Mode';
  }

  const localData = localStorage.getItem('inventory_data');
  const items = localData ? JSON.parse(localData) : seedItems;
  inventoryMap.clear();
  items.forEach(item => inventoryMap.set(Number(item.id), item));
}

// Fetch Audit Logs
async function fetchAuditLogs() {
  try {
    const res = await apiFetch('/api/audit');
    if (res.ok) {
      auditLogs = await res.json();
      return;
    }
  } catch (err) {}

  auditLogs = JSON.parse(localStorage.getItem('inventory_audit_logs') || '[]');
}

// Record Audit Log
async function recordAuditLog(action, details) {
  const entry = {
    user: currentUser ? currentUser.name : 'System',
    action,
    details
  };

  try {
    const res = await apiFetch('/api/audit', {
      method: 'POST',
      body: JSON.stringify(entry)
    });
    if (res.ok) {
      const data = await res.json();
      auditLogs.unshift(data.log);
      renderAuditLogView();
      return;
    }
  } catch (err) {}

  entry.id = `log_${Date.now()}`;
  entry.timestamp = new Date().toISOString();
  auditLogs.unshift(entry);
  localStorage.setItem('inventory_audit_logs', JSON.stringify(auditLogs));
  renderAuditLogView();
}

// Sync Data back to CSV File
async function persistData() {
  const itemsList = Array.from(inventoryMap.values());
  localStorage.setItem('inventory_data', JSON.stringify(itemsList));

  try {
    await apiFetch('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(itemsList)
    });
  } catch (err) {
    console.warn('Post to sync server failed');
  }

  populateCategories();
  renderAllViews();
}

// View Switching Logic
window.switchView = function(viewName) {
  currentView = viewName;
  navItems.forEach(item => {
    if (item.getAttribute('data-view') === viewName) {
      item.classList.add('active');
    } else {
      item.classList.remove('active');
    }
  });

  viewSections.forEach(sec => {
    if (sec.id === `view-${viewName}`) {
      sec.classList.add('active');
    } else {
      sec.classList.remove('active');
    }
  });
};

function setupNavigationListeners() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.getAttribute('data-view');
      switchView(view);
    });
  });
}

// Render All Enterprise Views
function renderAllViews() {
  renderOverviewView();
  renderCatalogView();
  renderAnalyticsView();
  renderAuditLogView();
  if (currentUser && currentUser.role === 'Admin') {
    renderTeamView();
  }
}

// 1. OVERVIEW DASHBOARD VIEW
function renderOverviewView() {
  const items = Array.from(inventoryMap.values());
  const totalSkus = items.length;
  const totalUnits = items.reduce((acc, i) => acc + Number(i.quantity), 0);
  const totalVal = items.reduce((acc, i) => acc + (Number(i.price) * Number(i.quantity)), 0);
  
  const lowItems = items.filter(i => Number(i.quantity) <= Number(i.reorderLevel));
  const outOfStockItems = items.filter(i => Number(i.quantity) === 0);

  document.getElementById('overview-total-skus').textContent = totalSkus;
  document.getElementById('overview-total-units').textContent = totalUnits;
  document.getElementById('overview-total-val').textContent = `₹${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  document.getElementById('overview-low-count').textContent = lowItems.length;

  // Sidebar Low Stock Badge
  const sidebarLowBadge = document.getElementById('sidebar-low-badge');
  if (lowItems.length > 0) {
    sidebarLowBadge.style.display = 'inline-block';
    sidebarLowBadge.textContent = `${lowItems.length} Low`;
  } else {
    sidebarLowBadge.style.display = 'none';
  }

  // Stock Health Bar Calculations
  const okCount = totalSkus - lowItems.length;
  const warnCount = lowItems.length - outOfStockItems.length;
  const dangerCount = outOfStockItems.length;

  const okPct = totalSkus > 0 ? (okCount / totalSkus) * 100 : 100;
  const warnPct = totalSkus > 0 ? (warnCount / totalSkus) * 100 : 0;
  const dangerPct = totalSkus > 0 ? (dangerCount / totalSkus) * 100 : 0;

  document.getElementById('health-bar-ok').style.width = `${okPct}%`;
  document.getElementById('health-bar-warn').style.width = `${warnPct}%`;
  document.getElementById('health-bar-danger').style.width = `${dangerPct}%`;

  document.getElementById('health-count-ok').textContent = `${okCount} items`;
  document.getElementById('health-count-warn').textContent = `${warnCount} items`;
  document.getElementById('health-count-danger').textContent = `${dangerCount} items`;
  document.getElementById('health-percentage').textContent = `${Math.round(okPct)}% Healthy`;

  // Urgent Watchlist Table
  const watchlistTbody = document.getElementById('overview-watchlist-tbody');
  if (lowItems.length === 0) {
    watchlistTbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 20px; color: var(--emerald-success);">
          ✓ All inventory stock levels are healthy!
        </td>
      </tr>
    `;
    return;
  }

  watchlistTbody.innerHTML = lowItems.slice(0, 5).map(item => `
    <tr>
      <td><span class="sku-pill">#${item.id}</span></td>
      <td style="font-weight: 600;">${escapeHtml(item.name)}</td>
      <td style="font-weight: 700; color: ${item.quantity === 0 ? 'var(--rose-danger)' : 'var(--amber-warning)'};">${item.quantity}</td>
      <td>${item.reorderLevel}</td>
      <td>
        <button class="btn-pro btn-pro-secondary btn-pro-sm" onclick="quickRestock(${item.id})">Restock +10</button>
      </td>
    </tr>
  `).join('');
}

// 2. INVENTORY CATALOG VIEW
function renderCatalogView() {
  let items = Array.from(inventoryMap.values());

  // Category Filter
  if (catalogCategoryFilter !== 'ALL') {
    items = items.filter(i => i.category === catalogCategoryFilter);
  }

  // Low Stock Filter
  if (lowStockOnly) {
    items = items.filter(i => Number(i.quantity) <= Number(i.reorderLevel));
  }

  // Search & Binary Search Visualizer
  items = simulateBinarySearch(catalogSearchQuery, items);

  // Sorting
  items.sort((a, b) => {
    switch (catalogSortMode) {
      case 'ID_ASC': return a.id - b.id;
      case 'ID_DESC': return b.id - a.id;
      case 'NAME_ASC': return a.name.localeCompare(b.name);
      case 'NAME_DESC': return b.name.localeCompare(a.name);
      case 'PRICE_ASC': return a.price - b.price;
      case 'PRICE_DESC': return b.price - a.price;
      case 'QTY_ASC': return a.quantity - b.quantity;
      case 'QTY_DESC': return b.quantity - a.quantity;
      default: return a.id - b.id;
    }
  });

  // Pagination Logic
  const totalRecords = items.length;
  const totalPages = Math.ceil(totalRecords / pageSize) || 1;
  if (currentPage > totalPages) currentPage = totalPages;

  const startIdx = (currentPage - 1) * pageSize;
  const pagedItems = items.slice(startIdx, startIdx + pageSize);

  pageStart.textContent = totalRecords === 0 ? 0 : startIdx + 1;
  pageEnd.textContent = Math.min(startIdx + pageSize, totalRecords);
  pageTotal.textContent = totalRecords;
  pageIndicator.textContent = `Page ${currentPage} of ${totalPages}`;

  btnPrevPage.disabled = currentPage === 1;
  btnNextPage.disabled = currentPage === totalPages;

  if (pagedItems.length === 0) {
    catalogTbody.innerHTML = `
      <tr>
        <td colspan="9" style="text-align: center; padding: 40px; color: var(--text-muted);">
          No products found matching your catalog filters.
        </td>
      </tr>
    `;
    return;
  }

  catalogTbody.innerHTML = pagedItems.map(item => {
    const isLow = Number(item.quantity) <= Number(item.reorderLevel);
    const isCritical = Number(item.quantity) === 0;
    const itemTotalVal = (Number(item.price) * Number(item.quantity)).toFixed(2);

    let statusPill = `<span class="status-pill status-pill-ok">🟢 In Stock</span>`;
    if (isCritical) statusPill = `<span class="status-pill status-pill-danger">🔴 Out of Stock</span>`;
    else if (isLow) statusPill = `<span class="status-pill status-pill-warning">🟡 Reorder</span>`;

    return `
      <tr>
        <td><span class="sku-pill">#${item.id}</span></td>
        <td style="font-weight: 700;">${escapeHtml(item.name)}</td>
        <td>${escapeHtml(item.category)}</td>
        <td>₹${Number(item.price).toFixed(2)}</td>
        <td>
          <div class="qty-control">
            <button class="btn-pro btn-pro-secondary btn-pro-sm" onclick="adjustQty(${item.id}, -1)">-</button>
            <span style="font-weight: 800; min-width: 24px; text-align: center;">${item.quantity}</span>
            <button class="btn-pro btn-pro-secondary btn-pro-sm" onclick="adjustQty(${item.id}, 1)">+</button>
          </div>
        </td>
        <td>${item.reorderLevel}</td>
        <td style="font-weight: 700; color: #fff;">₹${itemTotalVal}</td>
        <td>${statusPill}</td>
        <td>
          <div style="display: flex; gap: 6px;">
            <button class="btn-pro btn-pro-secondary btn-pro-sm" onclick="editItem(${item.id})">✏️ Edit</button>
            <button class="btn-pro btn-pro-secondary btn-pro-sm" style="color: var(--rose-danger);" onclick="deleteItem(${item.id})">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// Binary Search Visualizer Simulation
function simulateBinarySearch(queryStr, sortedArray) {
  if (!queryStr || !queryStr.trim()) {
    binaryVisualizer.classList.remove('active');
    return sortedArray;
  }

  const query = queryStr.toLowerCase();
  const sortedByName = [...sortedArray].sort((a, b) => 
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );

  let low = 0;
  let high = sortedByName.length - 1;
  const steps = [];

  while (low <= high) {
    const mid = Math.floor((low + high) / 2);
    const midName = sortedByName[mid].name.toLowerCase();
    
    steps.push(`Range [${low}...${high}] ➔ Evaluating Mid ${mid} ("${sortedByName[mid].name}")`);

    if (midName.includes(query) || midName.startsWith(query)) {
      break;
    } else if (midName < query) {
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  binaryVisualizer.classList.add('active');
  binaryStepsContainer.innerHTML = steps.map((s, idx) => `
    <div class="step-chip ${idx === steps.length - 1 ? 'highlight' : ''}">
      Step ${idx + 1}: ${s}
    </div>
  `).join('');

  return sortedArray.filter(item => 
    item.name.toLowerCase().includes(query) || String(item.id).includes(query)
  );
}

// 3. ANALYTICS VIEW
function renderAnalyticsView() {
  const items = Array.from(inventoryMap.values());
  const categoryMap = new Map();

  items.forEach(item => {
    const cat = item.category || 'Uncategorized';
    const currentVal = categoryMap.get(cat) || { count: 0, totalVal: 0 };
    currentVal.count += 1;
    currentVal.totalVal += (Number(item.price) * Number(item.quantity));
    categoryMap.set(cat, currentVal);
  });

  const categoryListContainer = document.getElementById('category-analytics-list');
  const catEntries = Array.from(categoryMap.entries());

  if (catEntries.length === 0) {
    categoryListContainer.innerHTML = '<div style="color: var(--text-muted);">No categories available</div>';
  } else {
    const maxVal = Math.max(...catEntries.map(([_, v]) => v.totalVal)) || 1;
    categoryListContainer.innerHTML = catEntries.map(([cat, val]) => `
      <div>
        <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; margin-bottom: 4px;">
          <span>${escapeHtml(cat)} (${val.count} SKUs)</span>
          <span>₹${val.totalVal.toFixed(2)}</span>
        </div>
        <div class="progress-bar-bg" style="height: 8px;">
          <div class="progress-bar-fill fill-emerald" style="width: ${(val.totalVal / maxVal) * 100}%;"></div>
        </div>
      </div>
    `).join('');
  }

  // Highest and Lowest Price Items
  if (items.length > 0) {
    const sortedByPrice = [...items].sort((a, b) => b.price - a.price);
    const highest = sortedByPrice[0];
    const lowest = sortedByPrice[sortedByPrice.length - 1];

    document.getElementById('analytics-highest-item').textContent = `${highest.name} (₹${highest.price.toFixed(2)})`;
    document.getElementById('analytics-lowest-item').textContent = `${lowest.name} (₹${lowest.price.toFixed(2)})`;
  }
}

// 5. TEAM & REPORTS VIEW (Admin Only)
function renderTeamView() {
  if (!currentUser || currentUser.role !== 'Admin') return;

  const pendingUsers = allUsers.filter(u => u.status === 'pending');
  const activeManagers = allUsers.filter(u => u.role === 'Store Manager' && u.status === 'active');
  const totalUsers = allUsers.filter(u => u.status === 'active').length;
  const totalManagers = activeManagers.length;
  const totalEntries = auditLogs.length;

  // Update nav badge for pending count
  const teamBadge = document.getElementById('sidebar-team-badge');
  if (pendingUsers.length > 0) {
    teamBadge.style.display = 'inline-block';
    teamBadge.textContent = `${pendingUsers.length} Pending`;
    teamBadge.style.background = 'rgba(245,158,11,0.2)';
    teamBadge.style.color = 'var(--amber-warning)';
    teamBadge.style.borderColor = 'rgba(245,158,11,0.4)';
  } else {
    teamBadge.style.display = 'none';
  }

  // Build per-user activity count from audit logs
  const activityMap = {};
  auditLogs.forEach(log => {
    const name = log.user || 'System';
    if (!activityMap[name]) activityMap[name] = { total: 0, ITEM_ADD: 0, ITEM_DELETE: 0, STOCK_UPDATE: 0 };
    activityMap[name].total += 1;
    if (activityMap[name][log.action] !== undefined) activityMap[name][log.action] += 1;
    else activityMap[name][log.action] = 1;
  });

  // Most active user
  let mostActive = '—';
  let maxCount = 0;
  Object.entries(activityMap).forEach(([name, data]) => {
    if (data.total > maxCount) { maxCount = data.total; mostActive = name; }
  });

  // KPI metrics
  document.getElementById('team-total-users').textContent = totalUsers;
  document.getElementById('team-total-managers').textContent = totalManagers;
  document.getElementById('team-total-entries').textContent = totalEntries;
  document.getElementById('team-most-active').textContent = mostActive;

  // ---- PENDING APPROVALS PANEL ----
  const pendingContainer = document.getElementById('pending-approvals-container');
  if (!pendingContainer) {
    // Insert pending panel above the metrics grid if not already there
    const metricsGrid = document.getElementById('team-metrics-grid');
    const panel = document.createElement('div');
    panel.id = 'pending-approvals-container';
    metricsGrid.parentNode.insertBefore(panel, metricsGrid);
  }
  const pendingEl = document.getElementById('pending-approvals-container');

  if (pendingUsers.length === 0) {
    pendingEl.innerHTML = '';
  } else {
    pendingEl.innerHTML = `
      <div class="pending-panel">
        <div class="pending-panel-header">
          <div style="display: flex; align-items: center; gap: 10px;">
            <span style="font-size: 20px;">⏳</span>
            <div>
              <div style="font-weight: 800; font-size: 15px;">Pending Account Approvals</div>
              <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">${pendingUsers.length} account${pendingUsers.length !== 1 ? 's' : ''} waiting for your review</div>
            </div>
          </div>
          <span class="pending-count-badge">${pendingUsers.length} Pending</span>
        </div>
        <div class="pending-cards">
          ${pendingUsers.map(u => {
            const joinDate = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Unknown';
            const initial = u.name ? u.name.charAt(0).toUpperCase() : '?';
            return `
              <div class="pending-user-card">
                <div class="pending-user-left">
                  <div class="pending-avatar">${initial}</div>
                  <div>
                    <div style="font-weight: 700; font-size: 14px;">${escapeHtml(u.name)}</div>
                    <div style="font-size: 11px; color: var(--text-muted); font-family: var(--font-mono);">@${escapeHtml(u.username)} &middot; Applied ${joinDate}</div>
                    <div style="margin-top: 4px;"><span class="role-badge-manager">${escapeHtml(u.mode || u.role)}</span></div>
                  </div>
                </div>
                <div style="display: flex; gap: 8px;">
                  <button class="btn-pro btn-approve" onclick="approveUser('${u.id}', '${escapeHtml(u.name)}')">✔️ Approve</button>
                  <button class="btn-pro btn-reject" onclick="rejectUser('${u.id}', '${escapeHtml(u.name)}')">❌ Reject</button>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;
  }

  // Manager Roster Cards (active only)
  const managerCardsEl = document.getElementById('team-manager-cards');
  document.getElementById('team-manager-count-label').textContent = `${totalManagers} manager${totalManagers !== 1 ? 's' : ''}`;

  if (activeManagers.length === 0) {
    managerCardsEl.innerHTML = `<div style="color: var(--text-muted); padding: 12px 0;">No active store managers yet.</div>`;
  } else {
    managerCardsEl.innerHTML = activeManagers.map(m => {
      const activity = activityMap[m.name] || { total: 0, ITEM_ADD: 0, ITEM_DELETE: 0, STOCK_UPDATE: 0 };
      const joinDate = m.createdAt ? new Date(m.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'N/A';
      const initial = m.name ? m.name.charAt(0).toUpperCase() : 'M';
      return `
        <div class="manager-card">
          <div class="manager-card-left">
            <div class="manager-avatar">${initial}</div>
            <div>
              <div class="manager-name">${escapeHtml(m.name)}</div>
              <div class="manager-meta">@${escapeHtml(m.username)} &middot; ${escapeHtml(m.mode || m.role || 'Store Manager')} &middot; Joined ${joinDate}</div>
            </div>
          </div>
          <div class="manager-stats">
            <div class="manager-stat-pill">${activity.total} actions</div>
            <div class="manager-stat-pill pill-add">${activity.ITEM_ADD || 0} added</div>
            <div class="manager-stat-pill pill-delete">${activity.ITEM_DELETE || 0} deleted</div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Activity Bar Chart (active users only)
  const chartEl = document.getElementById('team-activity-chart');
  const activeUsers = allUsers.filter(u => u.status === 'active');
  const allActors = activeUsers.map(u => u.name);
  Object.keys(activityMap).forEach(name => { if (!allActors.includes(name)) allActors.push(name); });

  const maxActivity = Math.max(...Object.values(activityMap).map(d => d.total), 1);
  if (allActors.length === 0) {
    chartEl.innerHTML = `<div style="color: var(--text-muted);">No activity recorded yet.</div>`;
  } else {
    chartEl.innerHTML = allActors.map(name => {
      const data = activityMap[name] || { total: 0 };
      const pct = (data.total / maxActivity) * 100;
      const user = allUsers.find(u => u.name === name);
      const rolePill = user ? `<span style="font-size: 10px; padding: 2px 6px; border-radius: 4px; background: ${user.role === 'Admin' ? 'rgba(99,102,241,0.2)' : 'rgba(16,185,129,0.15)'}; color: ${user.role === 'Admin' ? 'var(--indigo-primary)' : 'var(--emerald-success)'}; font-weight: 700;">${user.mode || user.role}</span>` : '';
      return `
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; margin-bottom: 5px;">
            <span style="display: flex; align-items: center; gap: 6px;">${escapeHtml(name)} ${rolePill}</span>
            <span style="color: var(--text-muted); font-weight: 600;">${data.total} actions</span>
          </div>
          <div class="progress-bar-bg" style="height: 8px;">
            <div class="progress-bar-fill fill-emerald" style="width: ${pct}%; transition: width 0.6s ease;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Populate user filter dropdown
  renderReportTable();
  populateReportUserFilter();
}

function populateReportUserFilter() {
  const select = document.getElementById('report-filter-user');
  const currentVal = select.value;
  select.innerHTML = '<option value="ALL">All Users</option>';
  const allActors = new Set(auditLogs.map(l => l.user).filter(Boolean));
  allActors.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    opt.textContent = name;
    if (name === currentVal) opt.selected = true;
    select.appendChild(opt);
  });
}

function renderReportTable() {
  const userFilter = document.getElementById('report-filter-user')?.value || 'ALL';
  const actionFilter = document.getElementById('report-filter-action')?.value || 'ALL';

  let logs = [...auditLogs];
  if (userFilter !== 'ALL') logs = logs.filter(l => l.user === userFilter);
  if (actionFilter !== 'ALL') logs = logs.filter(l => l.action === actionFilter);

  const tbody = document.getElementById('report-tbody');
  if (logs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align: center; padding: 30px; color: var(--text-muted);">No matching activity found.</td></tr>`;
    return;
  }

  tbody.innerHTML = logs.slice(0, 100).map((log, idx) => {
    let badgeClass = 'action-update';
    if (log.action === 'ITEM_ADD') badgeClass = 'action-add';
    if (log.action === 'ITEM_DELETE') badgeClass = 'action-delete';
    const timeStr = new Date(log.timestamp).toLocaleString('en-IN');
    return `
      <tr>
        <td style="color: var(--text-muted); font-size: 12px;">${idx + 1}</td>
        <td>
          <div style="display: flex; align-items: center; gap: 8px;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: linear-gradient(135deg, var(--indigo-primary), var(--cyan-accent)); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; flex-shrink: 0;">${(log.user || 'S').charAt(0).toUpperCase()}</div>
            <span style="font-weight: 600;">${escapeHtml(log.user || 'System')}</span>
          </div>
        </td>
        <td><span class="action-badge ${badgeClass}">${log.action}</span></td>
        <td style="font-size: 13px;">${escapeHtml(log.details)}</td>
        <td style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">${timeStr}</td>
      </tr>
    `;
  }).join('');
}

// 4. AUDIT LOG VIEW
function renderAuditLogView() {
  const container = document.getElementById('audit-feed-container');
  if (auditLogs.length === 0) {
    container.innerHTML = '<div style="padding: 20px; color: var(--text-muted);">No audit activity logged yet.</div>';
    return;
  }

  container.innerHTML = auditLogs.slice(0, 50).map(log => {
    let badgeClass = 'action-update';
    if (log.action === 'ITEM_ADD') badgeClass = 'action-add';
    if (log.action === 'ITEM_DELETE') badgeClass = 'action-delete';

    const timeFormatted = new Date(log.timestamp).toLocaleString();

    return `
      <div class="audit-item">
        <div class="audit-left">
          <span class="action-badge ${badgeClass}">${log.action}</span>
          <div>
            <div style="font-weight: 700;">${escapeHtml(log.details)}</div>
            <div style="font-size: 11px; color: var(--text-muted);">User: ${escapeHtml(log.user)}</div>
          </div>
        </div>
        <div style="font-family: var(--font-mono); font-size: 11px; color: var(--text-muted);">
          ${timeFormatted}
        </div>
      </div>
    `;
  }).join('');
}

// Quick Restock Function
window.quickRestock = function(id) {
  const item = inventoryMap.get(id);
  if (item) {
    item.quantity = Number(item.quantity) + 10;
    showToast(`Restocked '${item.name}' (+10 units)`);
    recordAuditLog('STOCK_UPDATE', `Restocked '${item.name}' (#${id}) by +10 units`);
    persistData();
  }
};

window.adjustQty = function(id, delta) {
  const item = inventoryMap.get(id);
  if (item) {
    const newQty = Math.max(0, Number(item.quantity) + delta);
    item.quantity = newQty;
    showToast(`Updated '${item.name}' stock to ${newQty}`);
    recordAuditLog('STOCK_UPDATE', `Adjusted '${item.name}' (#${id}) quantity to ${newQty}`);
    persistData();
  }
};

window.deleteItem = function(id) {
  const item = inventoryMap.get(id);
  if (item && confirm(`Are you sure you want to delete '${item.name}' (#${id})?`)) {
    inventoryMap.delete(id);
    showToast(`Product '${item.name}' deleted`);
    recordAuditLog('ITEM_DELETE', `Deleted item '${item.name}' (#${id})`);
    persistData();
  }
};

window.editItem = function(id) {
  const item = inventoryMap.get(id);
  if (!item) return;

  formMode.value = 'EDIT';
  modalTitle.textContent = `Edit Product #${item.id}`;
  inputId.value = item.id;
  inputId.disabled = true;
  inputName.value = item.name;
  inputCategory.value = item.category;
  inputPrice.value = item.price;
  inputQty.value = item.quantity;
  inputReorder.value = item.reorderLevel;

  itemModal.classList.add('open');
};

// Setup Command Palette (`Cmd + K`)
function setupCommandPalette() {
  const openCmdK = () => {
    cmdKModal.classList.add('open');
    cmdKInput.value = '';
    cmdKInput.focus();
    renderCmdKResults('');
  };

  const closeCmdK = () => cmdKModal.classList.remove('open');

  cmdKBtn.addEventListener('click', openCmdK);

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      cmdKModal.classList.contains('open') ? closeCmdK() : openCmdK();
    }
    if (e.key === 'Escape' && cmdKModal.classList.contains('open')) {
      closeCmdK();
    }
  });

  cmdKModal.addEventListener('click', (e) => {
    if (e.target === cmdKModal) closeCmdK();
  });

  cmdKInput.addEventListener('input', (e) => {
    renderCmdKResults(e.target.value);
  });
}

function renderCmdKResults(query) {
  const items = Array.from(inventoryMap.values());
  const q = query.toLowerCase().trim();

  let html = `
    <div class="cmd-k-result-item" onclick="switchView('overview'); document.getElementById('cmd-k-modal').classList.remove('open');">
      <span>📊 Jump to Executive Overview</span>
      <span class="kbd-shortcut">Overview</span>
    </div>
    <div class="cmd-k-result-item" onclick="switchView('catalog'); document.getElementById('cmd-k-modal').classList.remove('open');">
      <span>📦 Jump to Inventory Catalog</span>
      <span class="kbd-shortcut">Catalog</span>
    </div>
    <div class="cmd-k-result-item" onclick="switchView('analytics'); document.getElementById('cmd-k-modal').classList.remove('open');">
      <span>📈 Jump to Analytics</span>
      <span class="kbd-shortcut">Analytics</span>
    </div>
    <div class="cmd-k-result-item" onclick="switchView('audit'); document.getElementById('cmd-k-modal').classList.remove('open');">
      <span>📜 Jump to Audit Log</span>
      <span class="kbd-shortcut">Audit</span>
    </div>
  `;

  if (q.length > 0) {
    const matchingItems = items.filter(i => 
      i.name.toLowerCase().includes(q) || String(i.id).includes(q) || i.category.toLowerCase().includes(q)
    );

    if (matchingItems.length > 0) {
      html += `<div style="padding: 6px 14px; font-size: 11px; color: var(--text-muted); font-weight: 700; text-transform: uppercase;">Matching Products</div>`;
      html += matchingItems.slice(0, 6).map(item => `
        <div class="cmd-k-result-item" onclick="jumpToCatalogItem(${item.id})">
          <span>📦 #${item.id} - ${escapeHtml(item.name)} (₹${item.price.toFixed(2)})</span>
          <span class="sku-pill">${item.category}</span>
        </div>
      `).join('');
    }
  }

  cmdKResults.innerHTML = html;
}

window.jumpToCatalogItem = function(id) {
  cmdKModal.classList.remove('open');
  switchView('catalog');
  catalogSearchQuery = String(id);
  catalogSearch.value = String(id);
  renderCatalogView();
};

// Populate Category Filter
function populateCategories() {
  const categories = new Set();
  inventoryMap.forEach(item => categories.add(item.category));

  const currentSelection = catalogCategorySelect.value;
  catalogCategorySelect.innerHTML = '<option value="ALL">All Categories</option>';
  
  categories.forEach(cat => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    if (cat === currentSelection) opt.selected = true;
    catalogCategorySelect.appendChild(opt);
  });
}

// Listeners for Modal & Controls
function setupInventoryModalListeners() {
  if (inventoryListenersInitialized) return;
  inventoryListenersInitialized = true;
  catalogSearch.addEventListener('input', (e) => {
    catalogSearchQuery = e.target.value;
    currentPage = 1;
    renderCatalogView();
  });

  catalogCategorySelect.addEventListener('change', (e) => {
    catalogCategoryFilter = e.target.value;
    currentPage = 1;
    renderCatalogView();
  });

  catalogSortSelect.addEventListener('change', (e) => {
    catalogSortMode = e.target.value;
    renderCatalogView();
  });

  btnToggleLow.addEventListener('click', () => {
    lowStockOnly = !lowStockOnly;
    btnToggleLow.style.background = lowStockOnly ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.05)';
    btnToggleLow.style.borderColor = lowStockOnly ? 'var(--amber-warning)' : 'var(--border-subtle)';
    currentPage = 1;
    renderCatalogView();
  });

  btnPrevPage.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      renderCatalogView();
    }
  });

  btnNextPage.addEventListener('click', () => {
    currentPage++;
    renderCatalogView();
  });

  document.getElementById('btn-open-add-modal').onclick = () => {
    formMode.value = 'ADD';
    modalTitle.textContent = 'Add New Product';
    itemForm.reset();
    inputId.disabled = false;
    itemModal.classList.add('open');
  };

  const closeModal = () => itemModal.classList.remove('open');
  modalClose.onclick = closeModal;
  modalCancel.onclick = closeModal;

  itemForm.onsubmit = (e) => {
    e.preventDefault();
    const id = Number(inputId.value);
    
    if (formMode.value === 'ADD' && inventoryMap.has(id)) {
      showToast(`Error: SKU #${id} already exists!`, 'error');
      return;
    }

    const isAdd = formMode.value === 'ADD';
    const newItem = {
      id,
      name: inputName.value.trim(),
      category: inputCategory.value.trim(),
      price: parseFloat(inputPrice.value),
      quantity: parseInt(inputQty.value),
      reorderLevel: parseInt(inputReorder.value)
    };

    inventoryMap.set(id, newItem);
    closeModal();
    showToast(`Product '${newItem.name}' saved!`);
    recordAuditLog(isAdd ? 'ITEM_ADD' : 'STOCK_UPDATE', `${isAdd ? 'Created' : 'Updated'} item '${newItem.name}' (#${id})`);
    persistData();
  };

  const handleExport = () => {
    const items = Array.from(inventoryMap.values());
    let csv = 'ID,Name,Category,Price,Quantity,ReorderLevel\n';
    items.forEach(i => {
      csv += `${i.id},"${i.name}","${i.category}",${i.price},${i.quantity},${i.reorderLevel}\n`;
    });

    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'inventory_export.csv';
    a.click();
    showToast('Exported inventory.csv');
  };

  document.getElementById('btn-export').onclick = handleExport;
  document.getElementById('btn-settings-export').onclick = handleExport;

  // Report filters (Team view)
  document.getElementById('report-filter-user')?.addEventListener('change', renderReportTable);
  document.getElementById('report-filter-action')?.addEventListener('change', renderReportTable);

  // Export full team report as CSV
  document.getElementById('btn-export-report')?.addEventListener('click', () => {
    let csv = 'No,User,Action,Details,Timestamp\n';
    auditLogs.forEach((log, idx) => {
      csv += `${idx + 1},"${log.user || 'System'}","${log.action}","${log.details}","${new Date(log.timestamp).toLocaleString('en-IN')}"\n`;
    });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `team_activity_report_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    showToast('Team report exported!');
  });
}

// Auth Event Handlers
function setupAuthListeners() {
  const btnLogout = document.getElementById('btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
      } catch (err) {}
      currentUser = null;
      allUsers = [];
      showAuthOverlay('manager-login');
    });
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, function (m) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[m];
  });
}

// Show a full-screen pending approval waiting page
function showPendingScreen(name) {
  authOverlay.style.display = 'flex';
  appWrapper.style.display = 'none';
  authOverlay.innerHTML = `
    <div class="auth-card" style="text-align: center;">
      <div style="font-size: 56px; margin-bottom: 16px;">⏳</div>
      <h2 style="font-size: 22px; font-weight: 800; margin-bottom: 8px;">Awaiting Admin Approval</h2>
      <p style="color: var(--text-muted); font-size: 14px; line-height: 1.6; margin-bottom: 20px;">
        Hi <strong style="color: var(--text-primary);">${escapeHtml(name)}</strong>, your account request has been saved.
      </p>
      <div style="padding: 14px; background: rgba(245,158,11,0.1); border: 1px solid rgba(245,158,11,0.3); border-radius: var(--radius-md); margin-bottom: 20px; font-size: 13px; color: var(--amber-warning);">
        An admin must approve the account before login is allowed.
      </div>
      <button class="btn-pro btn-pro-secondary" id="btn-pending-login" style="width: 100%;">Back to Login</button>
    </div>
  `;
  document.getElementById('btn-pending-login').addEventListener('click', () => showAuthOverlay('manager-login'));
}

// Admin: Approve a pending user
window.approveUser = async function(userId, userName) {
  try {
    const res = await apiFetch(`/api/users/${encodeURIComponent(userId)}/approve`, { method: 'PATCH' });
    const data = await res.json();
    if (res.ok) {
      showToast(`✅ ${userName} approved! They can now log in.`);
      await fetchUsers();
      renderTeamView();
    } else {
      showToast(data.error || 'Approval failed', 'error');
    }
  } catch (err) {
    showToast('Failed to approve user', 'error');
  }
};

// Admin: Reject a pending user
window.rejectUser = async function(userId, userName) {
  if (!confirm(`Reject and delete account request from "${userName}"?`)) return;
  try {
    const res = await apiFetch(`/api/users/${encodeURIComponent(userId)}/reject`, { method: 'PATCH' });
    const data = await res.json();
    if (res.ok) {
      showToast(`🗑️ ${userName}'s request rejected and removed.`, 'error');
      await fetchUsers();
      renderTeamView();
    } else {
      showToast(data.error || 'Rejection failed', 'error');
    }
  } catch (err) {
    showToast('Failed to reject user', 'error');
  }
};
