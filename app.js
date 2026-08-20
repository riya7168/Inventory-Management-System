// =============================================================
// InventoryOS Pro • Enterprise Stock Management Platform
// Architecture: Native ES6 Frontend with Local DB Persistence
// Zero External Keys • Self-Contained JSON & CSV Engine
// =============================================================

// Browser-only guard: this file must never run in Node.js / Vercel serverless
if (typeof window === 'undefined') {
  // Running in Node.js — do nothing (file is served as static text, not executed)
  // This guard prevents ReferenceError: localStorage is not defined on Vercel
} else {

// Enterprise State Management
let inventoryMap = new Map(); // SKU ID -> Product Object
let auditLogs = [];
let allUsers = []; // Registered user accounts (for Admin view)
let currentUser = null;
let currentView = 'overview';
let sessionToken = localStorage.getItem('inventory_session_token') || '';


// Catalog Pagination & Filtering State
let currentPage = 1;
const pageSize = 8;
let catalogSearchQuery = '';
let catalogCategoryFilter = 'ALL';
let catalogStatusFilter = 'ALL';
let catalogSortMode = 'ID_ASC';
let lowStockOnly = false;

// Profile & Modals State
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
let pendingProfilePic = null;
let pendingCsvItems = [];
let profileModalInitialized = false;
let inventoryListenersInitialized = false;
let csvModalInitialized = false;
let barcodeModalInitialized = false;

// DOM Elements - Shell & Auth
const authOverlay = document.getElementById('auth-overlay');
const appWrapper = document.getElementById('app-wrapper');
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
const catalogStatusSelect = document.getElementById('catalog-status-filter');
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

// Modal Elements - Item Add/Edit
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

// Initial Fallback Seed Inventory
const seedItems = [
  { id: 101, name: 'MacBook Pro 16" M3 Max', category: 'Electronics', price: 2499.99, quantity: 14, reorderLevel: 5 },
  { id: 102, name: 'Dell XPS 15 OLED', category: 'Electronics', price: 1899.50, quantity: 8, reorderLevel: 4 },
  { id: 103, name: 'Ergonomic Herman Miller Chair', category: 'Furniture', price: 899.00, quantity: 12, reorderLevel: 5 },
  { id: 104, name: 'Mechanical RGB Keyboard Pro', category: 'Accessories', price: 149.99, quantity: 28, reorderLevel: 10 },
  { id: 105, name: 'Wireless Precision Gaming Mouse', category: 'Accessories', price: 79.95, quantity: 18, reorderLevel: 6 },
  { id: 106, name: '4K UHD HDR Studio Monitor 27"', category: 'Electronics', price: 549.99, quantity: 3, reorderLevel: 5 },
  { id: 107, name: 'Thunderbolt 4 Multiport Docking Station', category: 'Accessories', price: 129.99, quantity: 22, reorderLevel: 8 },
  { id: 108, name: 'Dual-Motor Standing Desk Frame', category: 'Furniture', price: 699.00, quantity: 7, reorderLevel: 4 },
  { id: 109, name: 'Active Noise-Cancelling Earbuds Pro', category: 'Audio', price: 199.99, quantity: 15, reorderLevel: 5 },
  { id: 110, name: 'Wireless Hi-Fi Studio Speaker', category: 'Audio', price: 299.00, quantity: 2, reorderLevel: 6 },
  { id: 111, name: 'Logitech 4K Pro Webcam', category: 'Accessories', price: 169.99, quantity: 0, reorderLevel: 5 }
];

// Toast Notification System
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  const icon = type === 'success' ? '✅' : type === 'error' ? '❌' : 'ℹ️';
  toast.innerHTML = `<span>${icon}</span> <span>${escapeHtml(message)}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(12px) scale(0.95)';
    setTimeout(() => toast.remove(), 250);
  }, 3200);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// REST API Fetch with Session Token & Cookie Credentials
async function apiFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  if (options.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (sessionToken && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${sessionToken}`);
  }
  headers.set('X-Session-Token', sessionToken);

  return fetch(url, {
    ...options,
    headers,
    credentials: 'same-origin'
  });
}

// =============================================================
// APP INITIALIZATION & AUTH LIFECYCLE
// =============================================================
document.addEventListener('DOMContentLoaded', () => {
  setupNavigationListeners();
  setupCommandPalette();
  setupMobileDrawer();
  setupSettingsButtons();
  initAuth();
});

async function initAuth() {
  try {
    const res = await apiFetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        currentUser = data.user;
        if (data.token) {
          sessionToken = data.token;
          localStorage.setItem('inventory_session_token', sessionToken);
        }
        await showMainApp();
        return;
      }
    }
  } catch (err) {
    console.warn('Session verification fallback to login screen');
  }

  currentUser = null;
  showAuthOverlay('manager-login');
}

// -------------------------------------------------------------
// CREATIVE FULL-SCREEN AUTHENTICATION PORTAL
// -------------------------------------------------------------
function showAuthOverlay(mode = 'manager-login') {
  authOverlay.style.display = 'flex';
  appWrapper.style.display = 'none';

  const isManagerLogin = mode === 'manager-login';
  const isSignup = mode === 'signup';
  const isAdminLogin = mode === 'admin-login';

  authOverlay.innerHTML = `
    <div class="auth-split-wrapper">
      <!-- Left Hero Showcase -->
      <div class="auth-hero-pane">
        <div class="auth-hero-top">
          <div class="auth-hero-brand">
            <div class="auth-hero-logo">📦</div>
            <div>
              <h1>InventoryOS</h1>
              <span>Enterprise Suite v2.5</span>
            </div>
          </div>
          <div class="auth-hero-title">
            High-Performance <br>
            <span class="gradient-text">Warehouse Intelligence</span>
          </div>
          <p class="auth-hero-desc">
            Professional stock control system with real-time valuation, C++ core search algorithms, and 100% self-contained local database.
          </p>

          <div class="auth-features-list">
            <div class="auth-feature-item">
              <div class="auth-feature-icon">⚡</div>
              <div><strong>C++ Binary Search Simulation</strong> — Instant O(log N) SKU lookups</div>
            </div>
            <div class="auth-feature-item">
              <div class="auth-feature-icon">💾</div>
              <div><strong>Local DB Engine</strong> — Zero external keys, crypto hashed JSON + CSV</div>
            </div>
            <div class="auth-feature-item">
              <div class="auth-feature-icon">📊</div>
              <div><strong>Real-Time Financial Valuation</strong> — Live category asset distribution</div>
            </div>
            <div class="auth-feature-item">
              <div class="auth-feature-icon">🛡️</div>
              <div><strong>Role-Based Security</strong> — Store Manager & System Admin workflows</div>
            </div>
          </div>
        </div>

        <div class="auth-demo-section">
          <div class="auth-demo-title">⚡ 1-Click Quick Demo Login</div>
          <div class="auth-demo-chips">
            <button type="button" class="auth-demo-chip" onclick="quickDemoFill('admin')">
              <span>👑</span> Admin Demo
            </button>
            <button type="button" class="auth-demo-chip" onclick="quickDemoFill('alex')">
              <span>🏪</span> Manager (Alex)
            </button>
            <button type="button" class="auth-demo-chip" onclick="quickDemoFill('riya')">
              <span>🏪</span> Manager (Riya)
            </button>
            <button type="button" class="auth-demo-chip" onclick="quickDemoFill('signup')">
              <span>📝</span> Test Signup Request
            </button>
          </div>
          <div class="auth-trust-badge">
            <span>🔒</span> Zero Config Keys Required • 100% Self-Contained Database
          </div>
        </div>
      </div>

      <!-- Right Interactive Auth Card -->
      <div class="auth-form-pane">
        <div class="auth-tabs" role="tablist">
          <button type="button" class="auth-tab ${isManagerLogin ? 'active' : ''}" data-auth-mode="manager-login">Store Manager</button>
          <button type="button" class="auth-tab ${isAdminLogin ? 'active' : ''}" data-auth-mode="admin-login">System Admin</button>
          <button type="button" class="auth-tab ${isSignup ? 'active' : ''}" data-auth-mode="signup">Request Account</button>
        </div>

        <!-- Manager Login Form -->
        <form class="auth-form ${isManagerLogin ? 'active' : ''}" id="manager-login-form">
          <div>
            <h3 style="font-size:18px; font-weight:800; color:#fff;">Store Manager Portal</h3>
            <p style="font-size:12.5px; color:var(--text-muted); margin-top:2px;">Access inventory catalog, adjust quantities & export CSV</p>
          </div>
          <div class="form-group">
            <label for="manager-login-username">Manager Username</label>
            <div class="input-with-icon">
              <span class="input-icon">👤</span>
              <input type="text" id="manager-login-username" autocomplete="username" placeholder="e.g. alex or riya06" required>
            </div>
          </div>
          <div class="form-group">
            <label for="manager-login-password">Password</label>
            <div class="input-with-icon">
              <span class="input-icon">🔒</span>
              <input type="password" id="manager-login-password" autocomplete="current-password" placeholder="••••••••" required>
              <button type="button" class="btn-password-toggle" onclick="togglePasswordVisibility('manager-login-password', this)" aria-label="Show password">👁️</button>
            </div>
          </div>
          <button type="submit" class="btn-pro btn-pro-primary auth-submit" id="btn-submit-manager">
            <span>Login as Store Manager ➔</span>
          </button>
        </form>

        <!-- Admin Login Form -->
        <form class="auth-form ${isAdminLogin ? 'active' : ''}" id="admin-login-form">
          <div>
            <h3 style="font-size:18px; font-weight:800; color:#fff;">System Administrator</h3>
            <p style="font-size:12.5px; color:var(--text-muted); margin-top:2px;">Control center: User approvals, full audit logs & system reports</p>
          </div>
          <div class="form-group">
            <label for="admin-login-username">Admin Username</label>
            <div class="input-with-icon">
              <span class="input-icon">👑</span>
              <input type="text" id="admin-login-username" autocomplete="username" placeholder="admin" required>
            </div>
          </div>
          <div class="form-group">
            <label for="admin-login-password">Admin Master Key / Password</label>
            <div class="input-with-icon">
              <span class="input-icon">🔒</span>
              <input type="password" id="admin-login-password" autocomplete="current-password" placeholder="••••••••" required>
              <button type="button" class="btn-password-toggle" onclick="togglePasswordVisibility('admin-login-password', this)" aria-label="Show password">👁️</button>
            </div>
          </div>
          <button type="submit" class="btn-pro btn-pro-primary auth-submit" id="btn-submit-admin">
            <span>Authorize Admin Access ➔</span>
          </button>
        </form>

        <!-- Signup Request Form -->
        <form class="auth-form ${isSignup ? 'active' : ''}" id="manager-signup-form">
          <div>
            <h3 style="font-size:18px; font-weight:800; color:#fff;">Request Staff Account</h3>
            <p style="font-size:12.5px; color:var(--text-muted); margin-top:2px;">Submitted accounts are activated after System Admin approval</p>
          </div>
          <div class="form-group">
            <label for="signup-name">Full Name</label>
            <div class="input-with-icon">
              <span class="input-icon">📛</span>
              <input type="text" id="signup-name" autocomplete="name" placeholder="e.g. Jordan Lee" required>
            </div>
          </div>
          <div class="form-group">
            <label for="signup-username">Desired Username</label>
            <div class="input-with-icon">
              <span class="input-icon">👤</span>
              <input type="text" id="signup-username" autocomplete="username" placeholder="e.g. jordan_stock" required>
            </div>
          </div>
          <div class="form-group">
            <label for="signup-email">Work Email (Optional)</label>
            <div class="input-with-icon">
              <span class="input-icon">✉️</span>
              <input type="email" id="signup-email" autocomplete="email" placeholder="jordan@company.com">
            </div>
          </div>
          <div class="form-group">
            <label for="signup-mode">Assigned Role / Mode</label>
            <select id="signup-mode" class="select-pro has-left-icon" required>
              <option value="Store Manager">Store Manager (Catalog & Restock)</option>
              <option value="Inventory Operator">Inventory Operator (Stock Adjustments)</option>
              <option value="Stock Auditor">Stock Auditor (Audit & Reporting)</option>
            </select>
          </div>
          <div class="form-group">
            <label for="signup-password">Create Password</label>
            <div class="input-with-icon">
              <span class="input-icon">🔒</span>
              <input type="password" id="signup-password" autocomplete="new-password" minlength="6" placeholder="Minimum 6 characters" required>
              <button type="button" class="btn-password-toggle" onclick="togglePasswordVisibility('signup-password', this)">👁️</button>
            </div>
            <div class="password-strength-box">
              <div class="strength-bar-bg"><div class="strength-bar-fill" id="strength-bar-fill"></div></div>
              <div class="strength-label"><span>Strength</span><span id="strength-text">Enter password</span></div>
            </div>
          </div>
          <div class="form-group">
            <label for="signup-confirm-password">Confirm Password</label>
            <div class="input-with-icon">
              <span class="input-icon">🔒</span>
              <input type="password" id="signup-confirm-password" autocomplete="new-password" minlength="6" placeholder="Repeat password" required>
              <button type="button" class="btn-password-toggle" onclick="togglePasswordVisibility('signup-confirm-password', this)">👁️</button>
            </div>
          </div>
          <button type="submit" class="btn-pro btn-pro-primary auth-submit" id="btn-submit-signup">
            <span>Submit Access Request ➔</span>
          </button>
        </form>
      </div>
    </div>
  `;

  bindAuthOverlayEvents();
}

// Toggle password text visibility
window.togglePasswordVisibility = function(inputId, btn) {
  const input = document.getElementById(inputId);
  if (!input) return;
  if (input.type === 'password') {
    input.type = 'text';
    btn.textContent = '🙈';
  } else {
    input.type = 'password';
    btn.textContent = '👁️';
  }
};

// 1-Click Quick Demo Credentials Helper
window.quickDemoFill = function(type) {
  if (type === 'admin') {
    showAuthOverlay('admin-login');
    setTimeout(() => {
      const u = document.getElementById('admin-login-username');
      const p = document.getElementById('admin-login-password');
      if (u && p) {
        u.value = 'admin';
        p.value = 'admin123';
        showToast('Filled Admin demo credentials (admin / admin123)', 'info');
      }
    }, 50);
  } else if (type === 'alex') {
    showAuthOverlay('manager-login');
    setTimeout(() => {
      const u = document.getElementById('manager-login-username');
      const p = document.getElementById('manager-login-password');
      if (u && p) {
        u.value = 'alex';
        p.value = 'alex123';
        showToast('Filled Store Manager credentials (alex / alex123)', 'info');
      }
    }, 50);
  } else if (type === 'riya') {
    showAuthOverlay('manager-login');
    setTimeout(() => {
      const u = document.getElementById('manager-login-username');
      const p = document.getElementById('manager-login-password');
      if (u && p) {
        u.value = 'riya06';
        p.value = 'riya123';
        showToast('Filled Store Manager credentials (riya06 / riya123)', 'info');
      }
    }, 50);
  } else if (type === 'signup') {
    showAuthOverlay('signup');
    setTimeout(() => {
      const n = document.getElementById('signup-name');
      const u = document.getElementById('signup-username');
      const e = document.getElementById('signup-email');
      const p = document.getElementById('signup-password');
      const cp = document.getElementById('signup-confirm-password');
      const rand = Math.floor(100 + Math.random() * 900);
      if (n && u && p && cp) {
        n.value = 'Test Operator';
        u.value = `operator_${rand}`;
        if (e) e.value = `test${rand}@example.com`;
        p.value = 'operator123';
        cp.value = 'operator123';
        evaluatePasswordStrength('operator123');
        showToast('Filled Signup test request', 'info');
      }
    }, 50);
  }
};

function bindAuthOverlayEvents() {
  authOverlay.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.addEventListener('click', () => showAuthOverlay(button.dataset.authMode));
  });

  // Password strength listener
  const signupPassInput = document.getElementById('signup-password');
  signupPassInput?.addEventListener('input', (e) => {
    evaluatePasswordStrength(e.target.value);
  });

  // Manager Login Submit
  document.getElementById('manager-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-manager');
    setButtonLoading(btn, true);
    await submitLogin('/api/auth/login', {
      username: document.getElementById('manager-login-username').value,
      password: document.getElementById('manager-login-password').value
    }, btn);
  });

  // Admin Login Submit
  document.getElementById('admin-login-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = document.getElementById('btn-submit-admin');
    setButtonLoading(btn, true);
    await submitLogin('/api/auth/admin-login', {
      username: document.getElementById('admin-login-username').value,
      password: document.getElementById('admin-login-password').value
    }, btn);
  });

  // Signup Submit
  document.getElementById('manager-signup-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = document.getElementById('signup-password').value;
    const confirmPassword = document.getElementById('signup-confirm-password').value;
    if (password !== confirmPassword) {
      showToast('Passwords do not match', 'error');
      return;
    }

    const btn = document.getElementById('btn-submit-signup');
    setButtonLoading(btn, true);

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
      setButtonLoading(btn, false);

      if (res.ok && data.user) {
        showPendingScreen(data.user.name);
      } else {
        showToast(data.error || 'Signup request failed', 'error');
      }
    } catch (err) {
      setButtonLoading(btn, false);
      showToast('Network error during signup', 'error');
    }
  });
}

function setButtonLoading(btn, isLoading) {
  if (!btn) return;
  btn.disabled = isLoading;
  btn.style.opacity = isLoading ? '0.7' : '1';
}

function evaluatePasswordStrength(pass) {
  const fill = document.getElementById('strength-bar-fill');
  const text = document.getElementById('strength-text');
  if (!fill || !text) return;

  if (!pass || pass.length === 0) {
    fill.style.width = '0%';
    text.textContent = 'Enter password';
    text.style.color = 'var(--text-muted)';
    return;
  }

  let score = 0;
  if (pass.length >= 6) score += 1;
  if (pass.length >= 10) score += 1;
  if (/[0-9]/.test(pass)) score += 1;
  if (/[^A-Za-z0-9]/.test(pass)) score += 1;

  if (score <= 1) {
    fill.style.width = '25%';
    fill.style.background = 'var(--rose-danger)';
    text.textContent = 'Weak';
    text.style.color = 'var(--rose-danger)';
  } else if (score === 2) {
    fill.style.width = '50%';
    fill.style.background = 'var(--amber-warning)';
    text.textContent = 'Fair';
    text.style.color = 'var(--amber-warning)';
  } else if (score === 3) {
    fill.style.width = '75%';
    fill.style.background = 'var(--cyan-accent)';
    text.textContent = 'Strong';
    text.style.color = 'var(--cyan-accent)';
  } else {
    fill.style.width = '100%';
    fill.style.background = 'var(--emerald-success)';
    text.textContent = 'Enterprise Grade ✓';
    text.style.color = 'var(--emerald-success)';
  }
}

async function submitLogin(endpoint, payload, btn) {
  try {
    const res = await apiFetch(endpoint, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    setButtonLoading(btn, false);

    if (res.ok && data.user) {
      currentUser = data.user;
      if (data.token) {
        sessionToken = data.token;
        localStorage.setItem('inventory_session_token', sessionToken);
      }
      showToast(`Welcome back, ${currentUser.name || currentUser.username}!`);
      await showMainApp();
      return;
    }

    if (data.status === 'pending') {
      showPendingScreen(data.name || payload.username);
      return;
    }

    showToast(data.error || 'Authentication failed', 'error');
  } catch (err) {
    setButtonLoading(btn, false);
    showToast('Could not reach local server', 'error');
  }
}

function showPendingScreen(userName) {
  authOverlay.style.display = 'flex';
  appWrapper.style.display = 'none';

  authOverlay.innerHTML = `
    <div class="modal" style="max-width: 440px; text-align: center; margin: auto;">
      <div class="pending-screen-card">
        <div class="pending-pulse-ring">⏳</div>
        <h2 style="font-size: 20px; font-weight: 800; color: #fff;">Account Awaiting Approval</h2>
        <p style="color: var(--text-secondary); font-size: 13.5px; line-height: 1.6;">
          Hello <strong style="color:#fff;">${escapeHtml(userName)}</strong>, your registration request has been securely recorded in the local database. A System Admin must approve your access before you can log in.
        </p>
        <div style="width:100%; display:flex; flex-direction:column; gap:10px; margin-top:8px;">
          <button class="btn-pro btn-pro-primary" onclick="showAuthOverlay('manager-login')">
            <span>Return to Login</span>
          </button>
          <button class="btn-pro btn-pro-secondary" onclick="quickDemoFill('admin')">
            <span>Log In as Admin to Approve ➔</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// MAIN APPLICATION WORKSPACE
// -------------------------------------------------------------
async function showMainApp() {
  authOverlay.style.display = 'none';
  appWrapper.style.display = 'flex';

  if (currentUser) {
    userDisplayName.textContent = currentUser.name || currentUser.username;
    userDisplayRole.textContent = currentUser.mode || currentUser.role || 'Member';
    updateAvatarDisplay(currentUser.profilePic || null, currentUser.name);

    // Show or hide admin-only nav sections
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
  setupCsvModal();
  setupBarcodeModal();
}

function updateAvatarDisplay(picDataUrl, name) {
  const letter = name ? name.charAt(0).toUpperCase() : 'U';
  const mobileAvatar = document.getElementById('mobile-user-avatar');
  if (mobileAvatar) mobileAvatar.textContent = letter;

  if (picDataUrl) {
    avatarImg.src = picDataUrl;
    avatarImg.style.display = 'block';
    avatarInitials.style.display = 'none';
  } else {
    avatarImg.removeAttribute('src');
    avatarImg.style.display = 'none';
    avatarInitials.style.display = 'block';
    avatarInitials.textContent = letter;
  }
}

// -------------------------------------------------------------
// DATA FETCHING & SYNCHRONIZATION
// -------------------------------------------------------------
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

async function fetchInventoryData() {
  try {
    const res = await apiFetch('/api/inventory');
    if (res.ok) {
      const data = await res.json();
      inventoryMap.clear();
      data.forEach(item => inventoryMap.set(Number(item.id), item));
      document.getElementById('status-text').textContent = 'Local DB Synced (inventory.csv)';
      return;
    }
  } catch (err) {
    console.warn('Server offline, loading browser storage fallback');
    document.getElementById('status-text').textContent = 'Local Browser Mode';
  }

  const localData = localStorage.getItem('inventory_data');
  const items = localData ? JSON.parse(localData) : seedItems;
  inventoryMap.clear();
  items.forEach(item => inventoryMap.set(Number(item.id), item));
}

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

async function persistData() {
  const itemsList = Array.from(inventoryMap.values());
  localStorage.setItem('inventory_data', JSON.stringify(itemsList));

  try {
    await apiFetch('/api/inventory', {
      method: 'POST',
      body: JSON.stringify(itemsList)
    });
  } catch (err) {
    console.warn('Failed saving to /api/inventory');
  }

  populateCategories();
  renderAllViews();
}

// -------------------------------------------------------------
// NAVIGATION & VIEW CONTROLLER
// -------------------------------------------------------------
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

  // Close mobile sidebar if open
  document.getElementById('app-sidebar')?.classList.remove('mobile-open');

  if (viewName === 'analytics') {
    drawCategoryChart();
  }
};

function setupNavigationListeners() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const view = item.getAttribute('data-view');
      switchView(view);
    });
  });

  btnLogout?.addEventListener('click', async () => {
    try {
      await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) {}
    localStorage.removeItem('inventory_session_token');
    sessionToken = '';
    currentUser = null;
    showToast('Logged out successfully');
    showAuthOverlay('manager-login');
  });
}

function setupMobileDrawer() {
  const btn = document.getElementById('btn-mobile-menu');
  const sidebar = document.getElementById('app-sidebar');
  btn?.addEventListener('click', () => {
    sidebar?.classList.toggle('mobile-open');
  });
}

// Render All Views
function renderAllViews() {
  renderOverviewView();
  renderCatalogView();
  renderAnalyticsView();
  renderAuditLogView();
  if (currentUser && currentUser.role === 'Admin') {
    renderTeamView();
  }
}

// =============================================================
// VIEW 1: EXECUTIVE OVERVIEW DASHBOARD
// =============================================================
function renderOverviewView() {
  const items = Array.from(inventoryMap.values());
  const totalSkus = items.length;
  const totalUnits = items.reduce((acc, i) => acc + Number(i.quantity), 0);
  const totalVal = items.reduce((acc, i) => acc + (Number(i.price) * Number(i.quantity)), 0);
  
  const lowItems = items.filter(i => Number(i.quantity) <= Number(i.reorderLevel));
  const outOfStockItems = items.filter(i => Number(i.quantity) === 0);

  document.getElementById('overview-total-skus').textContent = totalSkus;
  document.getElementById('overview-total-units').textContent = totalUnits.toLocaleString();
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

  // Stock Health Distribution Bar
  const okCount = totalSkus - lowItems.length;
  const warnCount = lowItems.length - outOfStockItems.length;
  const dangerCount = outOfStockItems.length;

  const okPct = totalSkus > 0 ? (okCount / totalSkus) * 100 : 100;
  const warnPct = totalSkus > 0 ? (warnCount / totalSkus) * 100 : 0;
  const dangerPct = totalSkus > 0 ? (dangerCount / totalSkus) * 100 : 0;

  document.getElementById('health-bar-ok').style.width = `${okPct}%`;
  document.getElementById('health-bar-warn').style.width = `${warnPct}%`;
  document.getElementById('health-bar-danger').style.width = `${dangerPct}%`;

  document.getElementById('health-count-ok').textContent = `${okCount} products`;
  document.getElementById('health-count-warn').textContent = `${warnCount} products`;
  document.getElementById('health-count-danger').textContent = `${dangerCount} products`;
  document.getElementById('health-percentage').textContent = `${Math.round(okPct)}% Healthy`;

  // Urgent Watchlist Table
  const watchlistTbody = document.getElementById('overview-watchlist-tbody');
  if (lowItems.length === 0) {
    watchlistTbody.innerHTML = `
      <tr>
        <td colspan="5" style="text-align: center; padding: 24px; color: var(--emerald-success); font-weight: 600;">
          ✓ All inventory stock levels are healthy!
        </td>
      </tr>
    `;
  } else {
    watchlistTbody.innerHTML = lowItems.slice(0, 5).map(item => `
      <tr>
        <td><span class="sku-pill">#${item.id}</span></td>
        <td style="font-weight: 700; color:#fff;">${escapeHtml(item.name)}</td>
        <td style="font-weight: 800; color: ${item.quantity === 0 ? 'var(--rose-danger)' : 'var(--amber-warning)'};">${item.quantity}</td>
        <td>${item.reorderLevel}</td>
        <td>
          <button class="btn-mini" onclick="quickRestock(${item.id}, 10)">+10 Restock</button>
        </td>
      </tr>
    `).join('');
  }

  // Quick Restock All Low Button
  const btnRestockAll = document.getElementById('btn-quick-restock-all');
  if (btnRestockAll) {
    btnRestockAll.style.display = lowItems.length > 0 ? 'inline-flex' : 'none';
    btnRestockAll.onclick = quickRestockAllLow;
  }
}

window.quickRestock = async function(itemId, qty = 10) {
  const item = inventoryMap.get(Number(itemId));
  if (!item) return;
  item.quantity = Number(item.quantity) + qty;
  inventoryMap.set(item.id, item);
  await recordAuditLog('STOCK_UPDATE', `Restocked '${item.name}' (#${item.id}) by +${qty} (Now ${item.quantity})`);
  await persistData();
  showToast(`Restocked ${item.name} (+${qty})`);
};

window.quickRestockAllLow = async function() {
  const items = Array.from(inventoryMap.values());
  const lowItems = items.filter(i => Number(i.quantity) <= Number(i.reorderLevel));
  if (lowItems.length === 0) return;

  lowItems.forEach(i => {
    i.quantity = Math.max(Number(i.reorderLevel) + 10, Number(i.quantity) + 10);
    inventoryMap.set(i.id, i);
  });

  await recordAuditLog('STOCK_UPDATE', `Bulk restocked ${lowItems.length} low-stock items`);
  await persistData();
  showToast(`Successfully restocked ${lowItems.length} items!`);
};

// =============================================================
// VIEW 2: INVENTORY CATALOG & BINARY SEARCH VISUALIZER
// =============================================================
function populateCategories() {
  const items = Array.from(inventoryMap.values());
  const categories = Array.from(new Set(items.map(i => i.category || 'General'))).sort();
  
  if (catalogCategorySelect) {
    const current = catalogCategorySelect.value;
    catalogCategorySelect.innerHTML = '<option value="ALL">All Categories</option>' + 
      categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
    if (categories.includes(current)) catalogCategorySelect.value = current;
  }
}

function renderCatalogView() {
  let items = Array.from(inventoryMap.values());

  // 1. Category Filter
  if (catalogCategoryFilter !== 'ALL') {
    items = items.filter(i => i.category === catalogCategoryFilter);
  }

  // 2. Stock Status Filter
  if (catalogStatusFilter === 'IN_STOCK') {
    items = items.filter(i => Number(i.quantity) > Number(i.reorderLevel));
  } else if (catalogStatusFilter === 'LOW') {
    items = items.filter(i => Number(i.quantity) <= Number(i.reorderLevel) && Number(i.quantity) > 0);
  } else if (catalogStatusFilter === 'OUT_OF_STOCK') {
    items = items.filter(i => Number(i.quantity) === 0);
  }

  if (lowStockOnly) {
    items = items.filter(i => Number(i.quantity) <= Number(i.reorderLevel));
  }

  // 3. Binary Search Simulation
  items = simulateBinarySearch(catalogSearchQuery, items);

  // 4. Sorting
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

  // 5. Pagination
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
        <td colspan="9" style="text-align: center; padding: 48px 20px; color: var(--text-muted);">
          <div style="font-size: 28px; margin-bottom: 8px;">🔍</div>
          <div style="font-weight: 700; color:#fff;">No products found</div>
          <div style="font-size: 12px; margin-top: 4px;">Try adjusting your search keywords or filter criteria.</div>
        </td>
      </tr>
    `;
    return;
  }

  catalogTbody.innerHTML = pagedItems.map(item => {
    const isLow = Number(item.quantity) <= Number(item.reorderLevel) && Number(item.quantity) > 0;
    const isCritical = Number(item.quantity) === 0;
    const itemTotalVal = (Number(item.price) * Number(item.quantity)).toFixed(2);

    let statusPill = `<span class="status-pill status-pill-ok">🟢 In Stock</span>`;
    if (isCritical) statusPill = `<span class="status-pill status-pill-danger">🔴 Out of Stock</span>`;
    else if (isLow) statusPill = `<span class="status-pill status-pill-warning">🟡 Low Stock</span>`;

    return `
      <tr>
        <td><span class="sku-pill">#${item.id}</span></td>
        <td style="font-weight: 700; color: #fff;">${escapeHtml(item.name)}</td>
        <td><span class="category-tag">${escapeHtml(item.category || 'General')}</span></td>
        <td style="font-family: var(--font-mono); font-weight:600;">₹${Number(item.price).toFixed(2)}</td>
        <td>
          <div class="qty-control">
            <button class="qty-btn" onclick="adjustQty(${item.id}, -1)" title="Decrease quantity">-</button>
            <span style="font-weight: 800; min-width: 26px; text-align: center; color: ${isCritical ? 'var(--rose-danger)' : isLow ? 'var(--amber-warning)' : '#fff'};">${item.quantity}</span>
            <button class="qty-btn" onclick="adjustQty(${item.id}, 1)" title="Increase quantity">+</button>
          </div>
        </td>
        <td style="font-family: var(--font-mono);">${item.reorderLevel}</td>
        <td style="font-family: var(--font-mono); font-weight: 700; color: var(--text-primary);">₹${itemTotalVal}</td>
        <td>${statusPill}</td>
        <td style="text-align: right;">
          <div style="display: inline-flex; gap: 6px;">
            <button class="btn-mini" onclick="openBarcodeModal(${item.id})" title="Generate Barcode">🏷️</button>
            <button class="btn-mini" onclick="editItem(${item.id})" title="Edit Product">✏️</button>
            <button class="btn-mini" style="color: var(--rose-danger);" onclick="deleteItem(${item.id})" title="Delete">🗑️</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');
}

// In-line quantity adjustment
window.adjustQty = async function(id, delta) {
  const item = inventoryMap.get(Number(id));
  if (!item) return;
  const newQty = Math.max(0, Number(item.quantity) + delta);
  if (newQty === item.quantity) return;
  item.quantity = newQty;
  inventoryMap.set(item.id, item);
  await recordAuditLog('STOCK_UPDATE', `Adjusted stock for '${item.name}' (#${item.id}) to ${newQty}`);
  await persistData();
};

// C++ STL std::lower_bound Binary Search Simulation
function simulateBinarySearch(queryStr, sortedArray) {
  if (!queryStr || !queryStr.trim()) {
    binaryVisualizer.classList.remove('active');
    return sortedArray;
  }

  const query = queryStr.toLowerCase().trim();
  const sortedByName = [...sortedArray].sort((a, b) => 
    a.name.toLowerCase().localeCompare(b.name.toLowerCase())
  );

  let low = 0;
  let high = sortedByName.length - 1;
  const steps = [];

  while (low <= high && steps.length < 5) {
    const mid = Math.floor((low + high) / 2);
    const midName = sortedByName[mid].name.toLowerCase();
    
    steps.push(`Range [${low}...${high}] ➔ Mid ${mid}: "${sortedByName[mid].name}"`);

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
    item.name.toLowerCase().includes(query) || 
    String(item.id).includes(query) ||
    (item.category && item.category.toLowerCase().includes(query))
  );
}

// -------------------------------------------------------------
// VIEW 3: ANALYTICS & CANVAS GRAPH
// -------------------------------------------------------------
function renderAnalyticsView() {
  const items = Array.from(inventoryMap.values());
  const categoryMap = new Map();

  items.forEach(item => {
    const cat = item.category || 'General';
    const currentVal = categoryMap.get(cat) || { count: 0, totalVal: 0, totalQty: 0 };
    currentVal.count += 1;
    currentVal.totalQty += Number(item.quantity);
    currentVal.totalVal += (Number(item.price) * Number(item.quantity));
    categoryMap.set(cat, currentVal);
  });

  const categoryListContainer = document.getElementById('category-analytics-list');
  const catEntries = Array.from(categoryMap.entries());

  const totalValAll = items.reduce((acc, i) => acc + (Number(i.price) * Number(i.quantity)), 0);
  document.getElementById('analytics-total-val').textContent = `₹${totalValAll.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  if (catEntries.length === 0) {
    categoryListContainer.innerHTML = '<div style="color: var(--text-muted);">No category data available</div>';
  } else {
    const maxVal = Math.max(...catEntries.map(([_, v]) => v.totalVal)) || 1;
    categoryListContainer.innerHTML = catEntries.map(([cat, val]) => {
      const pct = totalValAll > 0 ? ((val.totalVal / totalValAll) * 100).toFixed(1) : 0;
      return `
        <div>
          <div style="display: flex; justify-content: space-between; font-size: 13px; font-weight: 700; margin-bottom: 6px;">
            <span>${escapeHtml(cat)} <span style="font-size:11px; color:var(--text-muted); font-weight:normal;">(${val.count} SKUs, ${val.totalQty} units)</span></span>
            <span style="font-family:var(--font-mono);">₹${val.totalVal.toFixed(2)} (${pct}%)</span>
          </div>
          <div class="progress-bar-bg" style="height: 8px;">
            <div class="progress-bar-fill fill-emerald" style="width: ${(val.totalVal / maxVal) * 100}%;"></div>
          </div>
        </div>
      `;
    }).join('');
  }

  // Financial Highlights
  if (items.length > 0) {
    const sortedByPrice = [...items].sort((a, b) => b.price - a.price);
    const sortedByQty = [...items].sort((a, b) => b.quantity - a.quantity);
    const highest = sortedByPrice[0];
    const lowest = sortedByPrice[sortedByPrice.length - 1];
    const mostStocked = sortedByQty[0];

    document.getElementById('analytics-highest-item').textContent = `${highest.name} (₹${highest.price.toFixed(2)})`;
    document.getElementById('analytics-lowest-item').textContent = `${lowest.name} (₹${lowest.price.toFixed(2)})`;
    document.getElementById('analytics-highest-stock').textContent = `${mostStocked.name} (${mostStocked.quantity} units)`;
  }

  drawCategoryChart();
}

function drawCategoryChart() {
  const canvas = document.getElementById('category-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const width = canvas.width;
  const height = canvas.height;
  ctx.clearRect(0, 0, width, height);

  const items = Array.from(inventoryMap.values());
  const categoryMap = new Map();
  items.forEach(i => {
    const cat = i.category || 'General';
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + (Number(i.price) * Number(i.quantity)));
  });

  const entries = Array.from(categoryMap.entries()).slice(0, 5);
  if (entries.length === 0) return;

  const total = entries.reduce((acc, [_, v]) => acc + v, 0) || 1;
  const colors = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#8b5cf6'];
  const barHeight = 22;
  const startY = 10;
  const gap = 12;

  entries.forEach(([name, val], idx) => {
    const y = startY + idx * (barHeight + gap);
    const barWidth = Math.max(10, ((val / total) * (width - 150)));
    const color = colors[idx % colors.length];

    // Label
    ctx.fillStyle = '#94a3b8';
    ctx.font = '600 11px Plus Jakarta Sans, sans-serif';
    ctx.fillText(name.slice(0, 14), 10, y + 15);

    // Bar background
    ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.beginPath();
    ctx.roundRect(110, y, width - 180, barHeight, 4);
    ctx.fill();

    // Bar fill
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(110, y, barWidth, barHeight, 4);
    ctx.fill();

    // Value text
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 11px JetBrains Mono, monospace';
    ctx.fillText(`₹${Math.round(val)}`, 110 + barWidth + 8, y + 15);
  });
}

// -------------------------------------------------------------
// VIEW 4: AUDIT ACTIVITY LOG
// -------------------------------------------------------------
function renderAuditLogView() {
  const container = document.getElementById('audit-feed-container');
  const filterSelect = document.getElementById('audit-filter-action');
  const selectedAction = filterSelect ? filterSelect.value : 'ALL';

  let filtered = auditLogs;
  if (selectedAction !== 'ALL') {
    filtered = filtered.filter(l => l.action === selectedAction);
  }

  if (!container) return;

  if (filtered.length === 0) {
    container.innerHTML = `
      <div style="text-align: center; padding: 40px; color: var(--text-muted); background: var(--bg-card); border-radius: var(--radius-lg);">
        No audit log operations recorded yet.
      </div>
    `;
    return;
  }

  container.innerHTML = filtered.map(log => {
    let badgeClass = 'audit-badge-update';
    let badgeText = log.action || 'UPDATE';

    if (log.action === 'ITEM_ADD') { badgeClass = 'audit-badge-add'; badgeText = 'ADDED'; }
    else if (log.action === 'ITEM_DELETE') { badgeClass = 'audit-badge-delete'; badgeText = 'DELETED'; }
    else if (log.action === 'STOCK_UPDATE') { badgeClass = 'audit-badge-update'; badgeText = 'STOCK'; }
    else if (log.action === 'USER_APPROVAL') { badgeClass = 'audit-badge-user'; badgeText = 'APPROVAL'; }

    const dateStr = log.timestamp ? new Date(log.timestamp).toLocaleString() : 'Just now';

    return `
      <div class="audit-item">
        <div class="audit-left">
          <span class="audit-badge ${badgeClass}">${badgeText}</span>
          <div class="audit-text">
            <strong class="audit-user">${escapeHtml(log.user || 'System')}</strong>: ${escapeHtml(log.details || '')}
          </div>
        </div>
        <div class="audit-time">${dateStr}</div>
      </div>
    `;
  }).join('');
}

// -------------------------------------------------------------
// VIEW 6: TEAM MANAGEMENT & REPORTS (ADMIN ONLY)
// -------------------------------------------------------------
function renderTeamView() {
  if (!currentUser || currentUser.role !== 'Admin') return;

  const pendingUsers = allUsers.filter(u => u.status === 'pending');
  const activeUsers = allUsers.filter(u => u.status === 'active');
  const activeManagers = activeUsers.filter(u => u.role === 'Store Manager');

  document.getElementById('team-total-users').textContent = allUsers.length;
  document.getElementById('team-total-managers').textContent = activeManagers.length;
  document.getElementById('team-total-entries').textContent = auditLogs.length;

  // Sidebar admin pending badge
  const sidebarTeamBadge = document.getElementById('sidebar-team-badge');
  if (sidebarTeamBadge) {
    if (pendingUsers.length > 0) {
      sidebarTeamBadge.style.display = 'inline-block';
      sidebarTeamBadge.textContent = `${pendingUsers.length} Pending`;
    } else {
      sidebarTeamBadge.style.display = 'none';
    }
  }

  // Pending Approvals Panel
  const pendingWrapper = document.getElementById('pending-approvals-wrapper');
  if (pendingWrapper) {
    if (pendingUsers.length > 0) {
      pendingWrapper.innerHTML = `
        <div class="pending-approvals-panel">
          <div class="pending-approvals-header">
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="font-size:18px;">⚠️</span>
              <strong style="color:#fff; font-size:14px;">${pendingUsers.length} Registration Request(s) Pending Review</strong>
            </div>
            <span class="badge-subtle" style="color:var(--amber-warning);">Action Required</span>
          </div>
          <div class="pending-approvals-list">
            ${pendingUsers.map(u => `
              <div class="pending-approval-card">
                <div>
                  <div style="font-weight:800; color:#fff;">${escapeHtml(u.name)} <span style="font-family:var(--font-mono); font-size:12px; color:var(--cyan-accent);">(@${escapeHtml(u.username)})</span></div>
                  <div style="font-size:12px; color:var(--text-muted); margin-top:2px;">Requested Role: <strong>${escapeHtml(u.mode || u.role)}</strong> ${u.email ? '• ' + escapeHtml(u.email) : ''}</div>
                </div>
                <div class="pending-actions">
                  <button class="btn-approve" onclick="approveUser('${u.id}')">✓ Approve Access</button>
                  <button class="btn-reject" onclick="rejectUser('${u.id}')">✕ Reject</button>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      pendingWrapper.innerHTML = '';
    }
  }

  // Manager Roster
  const rosterContainer = document.getElementById('team-manager-cards');
  if (rosterContainer) {
    document.getElementById('team-manager-count-label').textContent = `${activeUsers.length} members`;
    rosterContainer.innerHTML = activeUsers.map(u => `
      <div class="team-user-row">
        <div style="display:flex; align-items:center; gap:10px;">
          <div class="user-avatar-pill" style="width:32px; height:32px; font-size:12px;">
            ${u.name ? u.name.charAt(0).toUpperCase() : 'U'}
          </div>
          <div>
            <div style="font-weight:700; color:#fff; font-size:13px;">${escapeHtml(u.name)}</div>
            <div style="font-size:11px; color:var(--text-muted);">@${escapeHtml(u.username)}</div>
          </div>
        </div>
        <span class="badge-subtle" style="color: ${u.role === 'Admin' ? 'var(--cyan-accent)' : 'var(--emerald-success)'};">
          ${u.role === 'Admin' ? '👑 Admin' : '🏪 ' + (u.mode || u.role)}
        </span>
      </div>
    `).join('');
  }

  // Activity breakdown
  const activityContainer = document.getElementById('team-activity-chart');
  if (activityContainer) {
    const userLogCount = {};
    auditLogs.forEach(l => {
      const name = l.user || 'System';
      userLogCount[name] = (userLogCount[name] || 0) + 1;
    });

    const entries = Object.entries(userLogCount);
    if (entries.length > 0) {
      document.getElementById('team-most-active').textContent = entries.sort((a, b) => b[1] - a[1])[0][0];
      const maxLogs = Math.max(...entries.map(e => e[1])) || 1;
      activityContainer.innerHTML = entries.map(([name, count]) => `
        <div>
          <div style="display:flex; justify-content:space-between; font-size:12px; font-weight:700; margin-bottom:4px;">
            <span>${escapeHtml(name)}</span>
            <span>${count} operations</span>
          </div>
          <div class="progress-bar-bg" style="height:6px;">
            <div class="progress-bar-fill fill-emerald" style="width:${(count / maxLogs) * 100}%;"></div>
          </div>
        </div>
      `).join('');
    } else {
      activityContainer.innerHTML = '<div style="color:var(--text-muted); font-size:12px;">No activity yet</div>';
    }
  }

  // Full detailed report table
  renderReportTable();
}

function renderReportTable() {
  const tbody = document.getElementById('report-tbody');
  const userFilter = document.getElementById('report-filter-user')?.value || 'ALL';
  const actionFilter = document.getElementById('report-filter-action')?.value || 'ALL';

  if (!tbody) return;

  let filtered = auditLogs;
  if (userFilter !== 'ALL') filtered = filtered.filter(l => l.user === userFilter);
  if (actionFilter !== 'ALL') filtered = filtered.filter(l => l.action === actionFilter);

  if (filtered.length === 0) {
    tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px; color:var(--text-muted);">No report entries found</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.slice(0, 30).map((log, idx) => `
    <tr>
      <td style="font-family:var(--font-mono);">#${idx + 1}</td>
      <td style="font-weight:700; color:#fff;">${escapeHtml(log.user)}</td>
      <td><span class="badge-subtle">${escapeHtml(log.action)}</span></td>
      <td>${escapeHtml(log.details)}</td>
      <td style="font-family:var(--font-mono); font-size:11.5px;">${new Date(log.timestamp).toLocaleString()}</td>
    </tr>
  `).join('');
}

window.approveUser = async function(userId) {
  try {
    const res = await apiFetch(`/api/users/${encodeURIComponent(userId)}/approve`, { method: 'PATCH' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'User approved successfully');
      await fetchUsers();
      await recordAuditLog('USER_APPROVAL', `Approved staff account for user #${userId}`);
      renderTeamView();
    } else {
      showToast(data.error || 'Approval failed', 'error');
    }
  } catch (err) {
    showToast('Network error during approval', 'error');
  }
};

window.rejectUser = async function(userId) {
  if (!confirm('Are you sure you want to reject and remove this registration request?')) return;
  try {
    const res = await apiFetch(`/api/users/${encodeURIComponent(userId)}/reject`, { method: 'PATCH' });
    const data = await res.json();
    if (res.ok) {
      showToast(data.message || 'User request rejected');
      await fetchUsers();
      renderTeamView();
    } else {
      showToast(data.error || 'Rejection failed', 'error');
    }
  } catch (err) {
    showToast('Network error during rejection', 'error');
  }
};

// =============================================================
// BARCODE / SKU TAG GENERATOR MODAL
// =============================================================
function setupBarcodeModal() {
  if (barcodeModalInitialized) return;
  barcodeModalInitialized = true;

  const modal = document.getElementById('barcode-modal');
  const close = () => modal?.classList.remove('open');
  document.getElementById('barcode-modal-close')?.addEventListener('click', close);
  document.getElementById('barcode-modal-cancel')?.addEventListener('click', close);
  document.getElementById('btn-print-barcode')?.addEventListener('click', () => window.print());
}

window.openBarcodeModal = function(itemId) {
  const item = inventoryMap.get(Number(itemId));
  if (!item) return;

  document.getElementById('barcode-item-name').textContent = item.name;
  document.getElementById('barcode-item-cat').textContent = `Category: ${item.category || 'General'}`;
  document.getElementById('barcode-item-price').textContent = `₹${Number(item.price).toFixed(2)}`;
  document.getElementById('barcode-sku-text').textContent = `SKU #${String(item.id).padStart(6, '0')}`;

  // Generate SVG Barcode Pattern
  const wrapper = document.getElementById('barcode-graphic-wrapper');
  wrapper.innerHTML = generateBarcodeSVG(item.id);

  document.getElementById('barcode-modal')?.classList.add('open');
};

function generateBarcodeSVG(skuId) {
  const codeStr = String(skuId).padStart(6, '0');
  let svg = '<svg width="280" height="70" viewBox="0 0 280 70" xmlns="http://www.w3.org/2000/svg">';
  svg += '<rect width="280" height="70" fill="#ffffff"/>';
  
  // Guard bars start
  let x = 20;
  svg += `<rect x="${x}" y="5" width="3" height="55" fill="#0f172a"/>`; x += 5;
  svg += `<rect x="${x}" y="5" width="2" height="55" fill="#0f172a"/>`; x += 6;

  // Render bars based on digits
  for (let i = 0; i < codeStr.length; i++) {
    const digit = parseInt(codeStr[i]) || 0;
    const w1 = (digit % 3) + 1.5;
    const w2 = ((digit + 1) % 2) + 1.5;
    const w3 = ((digit + 2) % 4) + 1.5;

    svg += `<rect x="${x}" y="5" width="${w1}" height="50" fill="#0f172a"/>`; x += w1 + 3;
    svg += `<rect x="${x}" y="5" width="${w2}" height="50" fill="#0f172a"/>`; x += w2 + 4;
    svg += `<rect x="${x}" y="5" width="${w3}" height="50" fill="#0f172a"/>`; x += w3 + 3;
  }

  // Guard bars end
  svg += `<rect x="${x}" y="5" width="2" height="55" fill="#0f172a"/>`; x += 5;
  svg += `<rect x="${x}" y="5" width="3" height="55" fill="#0f172a"/>`;
  svg += '</svg>';
  return svg;
}

// =============================================================
// CSV IMPORT & EXPORT SYSTEM
// =============================================================
function setupCsvModal() {
  if (csvModalInitialized) return;
  csvModalInitialized = true;

  const modal = document.getElementById('csv-modal');
  const close = () => {
    modal?.classList.remove('open');
    pendingCsvItems = [];
    document.getElementById('csv-preview-section').style.display = 'none';
    document.getElementById('btn-confirm-csv-import').disabled = true;
  };

  document.getElementById('csv-modal-close')?.addEventListener('click', close);
  document.getElementById('csv-modal-cancel')?.addEventListener('click', close);
  document.getElementById('btn-open-csv-import')?.addEventListener('click', openCsvImportModal);
  document.getElementById('btn-catalog-import')?.addEventListener('click', openCsvImportModal);

  const fileInput = document.getElementById('csv-file-input');
  const dropzone = document.getElementById('csv-dropzone');

  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone?.addEventListener('dragleave', () => dropzone.classList.remove('dragover'));

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    const file = e.dataTransfer?.files?.[0];
    if (file) handleCsvFile(file);
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (file) handleCsvFile(file);
  });

  document.getElementById('btn-confirm-csv-import')?.addEventListener('click', async () => {
    if (pendingCsvItems.length === 0) return;
    pendingCsvItems.forEach(item => inventoryMap.set(Number(item.id), item));
    await recordAuditLog('ITEM_ADD', `Bulk imported ${pendingCsvItems.length} products from CSV`);
    await persistData();
    showToast(`Successfully imported ${pendingCsvItems.length} products!`);
    close();
  });

  document.getElementById('btn-download-csv-sample')?.addEventListener('click', (e) => {
    e.preventDefault();
    const sample = 'ID,Name,Category,Price,Quantity,ReorderLevel\n201,"Logitech MX Master 3S","Accessories",99.99,20,5\n202,"4K Ultra HD Webcam","Electronics",129.50,10,3';
    const blob = new Blob([sample], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'inventory_sample_format.csv';
    link.click();
  });

  // Export buttons
  document.getElementById('btn-export')?.addEventListener('click', exportCSV);
  document.getElementById('btn-catalog-export')?.addEventListener('click', exportCSV);
  document.getElementById('btn-settings-export')?.addEventListener('click', exportCSV);
}

window.openCsvImportModal = function() {
  document.getElementById('csv-modal')?.classList.add('open');
};

function handleCsvFile(file) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const text = e.target.result;
    const items = parseCsvText(text);
    if (items.length === 0) {
      showToast('No valid product rows detected in CSV', 'error');
      return;
    }
    pendingCsvItems = items;
    document.getElementById('csv-parsed-count').textContent = `✓ Found ${items.length} product(s) ready to import`;
    const tbody = document.getElementById('csv-preview-tbody');
    tbody.innerHTML = items.slice(0, 10).map(i => `
      <tr>
        <td>#${i.id}</td>
        <td>${escapeHtml(i.name)}</td>
        <td>${escapeHtml(i.category)}</td>
        <td>₹${i.price}</td>
        <td>${i.quantity}</td>
        <td>${i.reorderLevel}</td>
      </tr>
    `).join('');
    document.getElementById('csv-preview-section').style.display = 'block';
    document.getElementById('btn-confirm-csv-import').disabled = false;
  };
  reader.readAsText(file);
}

function parseCsvText(csvText) {
  const lines = csvText.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0);
  if (lines.length < 2) return [];

  const items = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const fields = [];
    let current = '';
    let inQuotes = false;

    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') {
        inQuotes = !inQuotes;
      } else if (c === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += c;
      }
    }
    fields.push(current);

    if (fields.length >= 6) {
      const id = parseInt(fields[0]);
      if (!isNaN(id)) {
        items.push({
          id,
          name: fields[1].replace(/^"|"$/g, ''),
          category: fields[2].replace(/^"|"$/g, '') || 'General',
          price: parseFloat(fields[3]) || 0,
          quantity: parseInt(fields[4]) || 0,
          reorderLevel: parseInt(fields[5]) || 5
        });
      }
    }
  }
  return items;
}

window.exportCSV = function() {
  const items = Array.from(inventoryMap.values());
  let csv = 'ID,Name,Category,Price,Quantity,ReorderLevel\n';
  items.forEach(i => {
    csv += `${i.id},"${i.name}","${i.category}",${Number(i.price).toFixed(2)},${i.quantity},${i.reorderLevel}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  const dateStr = new Date().toISOString().slice(0, 10);
  link.href = URL.createObjectURL(blob);
  link.download = `inventory_export_${dateStr}.csv`;
  link.click();
  showToast('Downloaded inventory.csv export');
};

// =============================================================
// ADD / EDIT PRODUCT MODAL
// =============================================================
function setupInventoryModalListeners() {
  if (inventoryListenersInitialized) return;
  inventoryListenersInitialized = true;

  const openAdd = () => {
    formMode.value = 'ADD';
    modalTitle.textContent = 'Add New Product';
    inputId.disabled = false;
    itemForm.reset();
    inputId.value = Math.max(...Array.from(inventoryMap.keys()), 100) + 1;
    itemModal.classList.add('open');
  };

  document.getElementById('btn-open-add-modal')?.addEventListener('click', openAdd);
  document.getElementById('btn-catalog-add')?.addEventListener('click', openAdd);

  const closeItemModal = () => itemModal.classList.remove('open');
  modalClose?.addEventListener('click', closeItemModal);
  modalCancel?.addEventListener('click', closeItemModal);

  itemForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number(inputId.value);
    const name = inputName.value.trim();
    const category = inputCategory.value.trim();
    const price = parseFloat(inputPrice.value);
    const quantity = parseInt(inputQty.value);
    const reorderLevel = parseInt(inputReorder.value);

    if (formMode.value === 'ADD' && inventoryMap.has(id)) {
      showToast(`Product SKU #${id} already exists!`, 'error');
      return;
    }

    const isEdit = formMode.value === 'EDIT';
    const item = { id, name, category, price, quantity, reorderLevel };
    inventoryMap.set(id, item);

    await recordAuditLog(isEdit ? 'STOCK_UPDATE' : 'ITEM_ADD', `${isEdit ? 'Updated' : 'Added'} product '${name}' (#${id})`);
    await persistData();
    showToast(`Successfully ${isEdit ? 'updated' : 'added'} ${name}!`);
    closeItemModal();
  });

  // Catalog Toolbar Filters
  catalogSearch?.addEventListener('input', (e) => {
    catalogSearchQuery = e.target.value;
    currentPage = 1;
    renderCatalogView();
  });

  catalogCategorySelect?.addEventListener('change', (e) => {
    catalogCategoryFilter = e.target.value;
    currentPage = 1;
    renderCatalogView();
  });

  catalogStatusSelect?.addEventListener('change', (e) => {
    catalogStatusFilter = e.target.value;
    currentPage = 1;
    renderCatalogView();
  });

  catalogSortSelect?.addEventListener('change', (e) => {
    catalogSortMode = e.target.value;
    renderCatalogView();
  });

  btnToggleLow?.addEventListener('click', () => {
    lowStockOnly = !lowStockOnly;
    btnToggleLow.style.background = lowStockOnly ? 'rgba(245, 158, 11, 0.25)' : '';
    btnToggleLow.style.borderColor = lowStockOnly ? 'var(--amber-warning)' : '';
    currentPage = 1;
    renderCatalogView();
  });

  btnPrevPage?.addEventListener('click', () => {
    if (currentPage > 1) { currentPage--; renderCatalogView(); }
  });

  btnNextPage?.addEventListener('click', () => {
    currentPage++; renderCatalogView();
  });

  document.getElementById('audit-filter-action')?.addEventListener('change', renderAuditLogView);
  document.getElementById('report-filter-user')?.addEventListener('change', renderReportTable);
  document.getElementById('report-filter-action')?.addEventListener('change', renderReportTable);
}

window.editItem = function(id) {
  const item = inventoryMap.get(Number(id));
  if (!item) return;

  formMode.value = 'EDIT';
  modalTitle.textContent = 'Edit Product';
  inputId.value = item.id;
  inputId.disabled = true;
  inputName.value = item.name;
  inputCategory.value = item.category || '';
  inputPrice.value = item.price;
  inputQty.value = item.quantity;
  inputReorder.value = item.reorderLevel;

  itemModal.classList.add('open');
};

window.deleteItem = async function(id) {
  const item = inventoryMap.get(Number(id));
  if (!item) return;
  if (!confirm(`Are you sure you want to permanently delete '${item.name}' (#${item.id})?`)) return;

  inventoryMap.delete(Number(id));
  await recordAuditLog('ITEM_DELETE', `Deleted product '${item.name}' (#${item.id})`);
  await persistData();
  showToast(`Deleted ${item.name}`);
};

// =============================================================
// COMMAND PALETTE ( / )
// =============================================================
function setupCommandPalette() {
  const openCmdK = () => {
    cmdKModal?.classList.add('open');
    cmdKInput.value = '';
    renderCmdKResults('');
    cmdKInput?.focus();
  };

  const closeCmdK = () => cmdKModal?.classList.remove('open');

  cmdKBtn?.addEventListener('click', openCmdK);

  window.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      cmdKModal?.classList.contains('open') ? closeCmdK() : openCmdK();
    } else if (e.key === 'Escape' && cmdKModal?.classList.contains('open')) {
      closeCmdK();
    }
  });

  cmdKModal?.addEventListener('click', (e) => {
    if (e.target === cmdKModal) closeCmdK();
  });

  cmdKInput?.addEventListener('input', (e) => {
    renderCmdKResults(e.target.value);
  });
}

function renderCmdKResults(query) {
  const q = query.toLowerCase().trim();
  const results = [];

  // View Navigation Commands
  const commands = [
    { label: '📊 Jump to Overview Dashboard', action: () => switchView('overview') },
    { label: '📦 Open Inventory Catalog', action: () => switchView('catalog') },
    { label: '📈 View Analytics & Valuation', action: () => switchView('analytics') },
    { label: '📜 View Audit Activity Log', action: () => switchView('audit') },
    { label: '⚙️ System Settings & Sync', action: () => switchView('settings') },
    { label: '+ Add New Product', action: () => document.getElementById('btn-open-add-modal')?.click() },
    { label: '⬆️ Import CSV File', action: openCsvImportModal },
    { label: '⬇️ Export Inventory CSV', action: exportCSV }
  ];

  commands.forEach(cmd => {
    if (!q || cmd.label.toLowerCase().includes(q)) results.push(cmd);
  });

  // Matching Products
  if (q) {
    Array.from(inventoryMap.values()).forEach(item => {
      if (item.name.toLowerCase().includes(q) || String(item.id).includes(q)) {
        results.push({
          label: `📦 Product: ${item.name} (#${item.id}) — Stock: ${item.quantity}`,
          action: () => {
            switchView('catalog');
            catalogSearch.value = item.name;
            catalogSearchQuery = item.name;
            renderCatalogView();
          }
        });
      }
    });
  }

  cmdKResults.innerHTML = results.slice(0, 8).map((r, i) => `
    <div class="cmd-k-item ${i === 0 ? 'selected' : ''}" onclick="executeCmdK(${i})">
      <span>${escapeHtml(r.label)}</span>
      <span class="kbd-shortcut">↵</span>
    </div>
  `).join('');

  window._currentCmdKResults = results;
}

window.executeCmdK = function(index) {
  const results = window._currentCmdKResults || [];
  if (results[index] && typeof results[index].action === 'function') {
    results[index].action();
    document.getElementById('cmd-k-modal')?.classList.remove('open');
  }
};

// =============================================================
// USER PROFILE MODAL & AVATAR UPLOAD
// =============================================================
function setupProfileModal() {
  const userCard = document.getElementById('user-card-clickable');
  if (userCard && !userCard.dataset.bound) {
    userCard.dataset.bound = 'true';
    userCard.addEventListener('click', (e) => {
      if (e.target.closest('#btn-logout')) return;
      openProfileModal();
    });
  }

  if (profileModalInitialized) return;
  profileModalInitialized = true;

  const modal = document.getElementById('profile-modal');
  const fileInput = document.getElementById('profile-pic-input');
  const close = () => modal?.classList.remove('open');

  document.getElementById('profile-modal-close')?.addEventListener('click', close);
  document.getElementById('profile-modal-cancel')?.addEventListener('click', close);

  document.getElementById('btn-remove-avatar')?.addEventListener('click', () => {
    pendingProfilePic = null;
    updateProfilePreview(null);
  });

  fileInput?.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    if (file.size > MAX_PROFILE_PHOTO_BYTES) {
      showToast('Profile photo must be 2MB or smaller', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      pendingProfilePic = reader.result;
      updateProfilePreview(pendingProfilePic);
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('btn-save-profile')?.addEventListener('click', async () => {
    try {
      const res = await apiFetch('/api/me/profile', {
        method: 'PATCH',
        body: JSON.stringify({ profilePic: pendingProfilePic })
      });
      const data = await res.json();
      if (res.ok && data.user) {
        currentUser = data.user;
        updateAvatarDisplay(currentUser.profilePic, currentUser.name);
        close();
        showToast('Profile photo updated');
      } else {
        showToast(data.error || 'Failed to update profile', 'error');
      }
    } catch (err) {
      showToast('Error updating profile photo', 'error');
    }
  });
}

function openProfileModal() {
  if (!currentUser) return;
  pendingProfilePic = currentUser.profilePic || null;
  document.getElementById('profile-info-name').textContent = currentUser.name || '—';
  document.getElementById('profile-info-username').textContent = currentUser.username || '—';
  document.getElementById('profile-info-role').textContent = currentUser.mode || currentUser.role || '—';
  updateProfilePreview(pendingProfilePic);
  document.getElementById('profile-modal')?.classList.add('open');
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

// =============================================================
// SETTINGS & EXECUTIVE REPORT PRINT
// =============================================================
function setupSettingsButtons() {
  document.getElementById('btn-settings-download-users')?.addEventListener('click', () => {
    const data = JSON.stringify(allUsers.length > 0 ? allUsers : [currentUser], null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'users_backup.json';
    link.click();
    showToast('Downloaded users.json backup');
  });

  document.getElementById('btn-settings-download-audit')?.addEventListener('click', () => {
    const data = JSON.stringify(auditLogs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = 'audit_logs_backup.json';
    link.click();
    showToast('Downloaded audit_logs.json backup');
  });

  document.getElementById('btn-export-report')?.addEventListener('click', exportExecutiveReport);
}

function exportExecutiveReport() {
  const items = Array.from(inventoryMap.values());
  const totalVal = items.reduce((acc, i) => acc + (Number(i.price) * Number(i.quantity)), 0);
  const totalUnits = items.reduce((acc, i) => acc + Number(i.quantity), 0);
  const lowItems = items.filter(i => Number(i.quantity) <= Number(i.reorderLevel));
  const dateStr = new Date().toLocaleString();

  const printContainer = document.getElementById('printable-report-container');
  if (!printContainer) return;

  printContainer.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding: 20px; line-height: 1.6;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px;">
        <div>
          <h1 style="margin:0; font-size: 24px; color: #0f172a;">📦 INVENTORY OS PRO • EXECUTIVE REPORT</h1>
          <p style="margin:4px 0 0 0; font-size: 13px; color: #475569;">Generated by: ${escapeHtml(currentUser?.name || 'Admin')} • ${dateStr}</p>
        </div>
        <div style="text-align: right;">
          <span style="padding: 4px 8px; background: #e2e8f0; font-weight: bold; border-radius: 4px; font-size: 12px;">CONFIDENTIAL</span>
        </div>
      </div>

      <div style="display:grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 24px;">
        <div style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold;">TOTAL ACTIVE SKUs</div>
          <div style="font-size: 20px; font-weight: bold; color: #0f172a;">${items.length}</div>
        </div>
        <div style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold;">TOTAL VALUATION</div>
          <div style="font-size: 20px; font-weight: bold; color: #059669;">₹${totalVal.toLocaleString('en-IN', { minimumFractionDigits: 2 })}</div>
        </div>
        <div style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold;">TOTAL STOCK UNITS</div>
          <div style="font-size: 20px; font-weight: bold; color: #0f172a;">${totalUnits}</div>
        </div>
        <div style="padding: 12px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px;">
          <div style="font-size: 11px; color: #64748b; font-weight: bold;">REORDER ALERTS</div>
          <div style="font-size: 20px; font-weight: bold; color: #d97706;">${lowItems.length}</div>
        </div>
      </div>

      <h3 style="font-size: 15px; margin-bottom: 8px; color: #0f172a;">Product Catalog Summary</h3>
      <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 24px;">
        <thead>
          <tr style="background: #f1f5f9; text-align: left;">
            <th style="padding: 8px; border: 1px solid #cbd5e1;">SKU</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Product Name</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Category</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Unit Price</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Quantity</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Reorder Level</th>
            <th style="padding: 8px; border: 1px solid #cbd5e1;">Total Worth</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(i => `
            <tr>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">#${i.id}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">${escapeHtml(i.name)}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${escapeHtml(i.category)}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">₹${Number(i.price).toFixed(2)}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${i.quantity}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1;">${i.reorderLevel}</td>
              <td style="padding: 6px 8px; border: 1px solid #cbd5e1; font-weight: bold;">₹${(i.price * i.quantity).toFixed(2)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="font-size: 11px; color: #94a3b8; text-align: center; margin-top: 30px; border-top: 1px solid #e2e8f0; padding-top: 10px;">
        InventoryOS Pro • Enterprise Inventory Management System • Local Hashed DB Engine
      </div>
    </div>
  `;

  window.print();
}

} // end browser-only guard

