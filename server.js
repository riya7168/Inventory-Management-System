const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

// NOTE: loadEnvFile is defined below and called after its definition

const PORT = Number(process.env.PORT || 3000);
const SESSION_COOKIE = 'inventory_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 4 * 1024 * 1024;
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_ACCOUNT_MODES = new Set(['Store Manager', 'Inventory Operator', 'Stock Auditor']);
const sessions = new Map();

// Built-in Default Seed Data (Guarantees zero-failure on Vercel cold starts / empty storage)
const DEFAULT_USERS = [
  {
    id: 'u_admin',
    name: 'System Administrator',
    username: 'admin',
    email: 'admin@inventoryos.pro',
    passwordHash: '240be518fabd2724ddb6f04eeb1da5967448d7e831c08c8fa822809f74c720a9', // admin123
    role: 'Admin',
    mode: 'System Admin',
    status: 'active',
    createdAt: '2026-08-01T10:00:00.000Z',
    profilePic: null
  },
  {
    id: 'u_alex',
    name: 'Alex Rivers',
    username: 'alex',
    email: 'alex.rivers@inventoryos.pro',
    passwordHash: 'd9508122cd143d69df229bf3624b7bcb2b8ac81ed210a0c926455ef119c12abd', // alex123
    role: 'Store Manager',
    mode: 'Store Manager',
    status: 'active',
    createdAt: '2026-08-05T12:30:00.000Z',
    profilePic: null
  },
  {
    id: 'u_riya',
    name: 'Riya Sharma',
    username: 'riya06',
    email: 'riya.sharma@inventoryos.pro',
    passwordHash: 'bc97aaa7b5bde4bae9d3b658e6d4bf711b2d8bb5d7a27f17e95815efc6e0618d', // riya123
    role: 'Store Manager',
    mode: 'Store Manager',
    status: 'active',
    createdAt: '2026-08-10T14:15:00.000Z',
    profilePic: null
  },
  {
    id: 'u_auditor',
    name: 'Jordan Lee',
    username: 'auditor',
    email: 'jordan.auditor@inventoryos.pro',
    passwordHash: '5b92db4dfb561dc69c949f34d36f5db0f8b30811be3a2949d85c5001279e9b1a', // auditor123
    role: 'Store Manager',
    mode: 'Stock Auditor',
    status: 'active',
    createdAt: '2026-08-12T09:00:00.000Z',
    profilePic: null
  },
  {
    id: 'u_pending_jiya',
    name: 'Jiya Patel',
    username: 'jiya0331',
    email: 'jiya.patel@example.com',
    passwordHash: '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92', // 123456
    role: 'Store Manager',
    mode: 'Inventory Operator',
    status: 'pending',
    createdAt: '2026-08-18T16:20:00.000Z',
    profilePic: null
  }
];

const DEFAULT_INVENTORY = [
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

const DEFAULT_AUDIT_LOGS = [
  {
    id: 'log_seed_1',
    user: 'System Administrator',
    action: 'ITEM_ADD',
    details: "Initialized system catalog with default enterprise SKUs",
    timestamp: new Date(Date.now() - 3600000 * 24).toISOString()
  },
  {
    id: 'log_seed_2',
    user: 'Alex Rivers',
    action: 'STOCK_UPDATE',
    details: "Restocked 'Mechanical RGB Keyboard Pro' (#104) to 28 units",
    timestamp: new Date(Date.now() - 3600000 * 5).toISOString()
  },
  {
    id: 'log_seed_3',
    user: 'Riya Sharma',
    action: 'STOCK_UPDATE',
    details: "Adjusted 'Active Noise-Cancelling Earbuds Pro' (#109) to 15 units",
    timestamp: new Date(Date.now() - 3600000 * 2).toISOString()
  }
];

let inMemoryUsers = null;
let inMemoryAudit = null;
let inMemoryInventory = null;

function loadEnvFile(filePath, override = false) {
  try {
    if (!fs.existsSync(filePath)) return;
    const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
    lines.forEach(line => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      const equalsIndex = trimmed.indexOf('=');
      if (equalsIndex === -1) return;
      const key = trimmed.slice(0, equalsIndex).trim();
      let value = trimmed.slice(equalsIndex + 1).trim();
      value = value.replace(/^['"]|['"]$/g, '');
      if (key && (override || process.env[key] === undefined)) {
        process.env[key] = value;
      }
    });
  } catch (e) {}
}

// Call after definition
try { loadEnvFile(path.join(__dirname, '.env')); } catch(e) {}
try { loadEnvFile(path.join(__dirname, '.env.local'), true); } catch(e) {}

function safeReadFile(filename) {
  const tmpPath = path.join(os.tmpdir(), filename);
  if (fs.existsSync(tmpPath)) {
    try {
      return fs.readFileSync(tmpPath, 'utf8');
    } catch (e) {}
  }
  const cwdPath = path.join(process.cwd(), filename);
  if (fs.existsSync(cwdPath)) {
    try {
      return fs.readFileSync(cwdPath, 'utf8');
    } catch (e) {}
  }
  const localPath = path.join(__dirname, filename);
  if (fs.existsSync(localPath)) {
    try {
      return fs.readFileSync(localPath, 'utf8');
    } catch (e) {}
  }
  const parentPath = path.join(__dirname, '..', filename);
  if (fs.existsSync(parentPath)) {
    try {
      return fs.readFileSync(parentPath, 'utf8');
    } catch (e) {}
  }
  return null;
}

function safeWriteFile(filename, content) {
  const localPath = path.join(__dirname, filename);
  const tmpPath = path.join(os.tmpdir(), filename);
  const cwdPath = path.join(process.cwd(), filename);

  try {
    fs.writeFileSync(localPath, content, 'utf8');
    return;
  } catch (err) {}

  try {
    fs.writeFileSync(cwdPath, content, 'utf8');
    return;
  } catch (err) {}

  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
  } catch (err) {}
}

function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store, no-cache, must-revalidate'
  });
  res.end(JSON.stringify(data));
}

function readJsonBody(req, maxBytes = MAX_JSON_BODY_BYTES) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk.toString();
      if (Buffer.byteLength(body, 'utf8') > maxBytes) {
        reject(new Error('Request body too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!body) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(body));
      } catch (err) {
        reject(new Error('Malformed request body'));
      }
    });
    req.on('error', reject);
  });
}

function parseCookies(cookieHeader = '') {
  return cookieHeader.split(';').reduce((cookies, pair) => {
    const [name, ...parts] = pair.trim().split('=');
    if (!name) return cookies;
    cookies[name] = decodeURIComponent(parts.join('=') || '');
    return cookies;
  }, {});
}

function getSessionToken(req) {
  const authHeader = req.headers.authorization || '';
  if (authHeader.toLowerCase().startsWith('bearer ')) {
    const token = authHeader.slice(7).trim();
    if (token) return token;
  }
  const customHeader = req.headers['x-session-token'];
  if (customHeader) return String(customHeader).trim();

  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] || '';
}

function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; SameSite=Lax`
  );
  return token;
}

function clearSession(req, res) {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeUsername(value) {
  return normalizeText(value).toLowerCase();
}

function validateProfilePic(profilePic) {
  if (profilePic === null || profilePic === '') return null;
  if (typeof profilePic !== 'string') {
    throw new Error('Profile photo must be an image data URL');
  }

  const match = profilePic.match(/^data:image\/(png|jpe?g|gif|webp);base64,([A-Za-z0-9+/=]+)$/i);
  if (!match) {
    throw new Error('Profile photo must be a JPG, PNG, GIF, or WebP image');
  }

  const imageBytes = Buffer.from(match[2], 'base64').length;
  if (imageBytes > MAX_PROFILE_PHOTO_BYTES) {
    throw new Error('Profile photo must be 2MB or smaller');
  }

  return profilePic;
}

// Helper to hash passwords using SHA-256
function hashPassword(password) {
  return crypto.createHash('sha256').update(password).digest('hex');
}

// Read users from file or cache
function getUsers() {
  if (inMemoryUsers) return inMemoryUsers;
  const content = safeReadFile('users.json');
  if (content) {
    try {
      inMemoryUsers = JSON.parse(content);
      if (Array.isArray(inMemoryUsers) && inMemoryUsers.length > 0) {
        return inMemoryUsers;
      }
    } catch (err) {
      console.error('Error reading users.json:', err);
    }
  }
  inMemoryUsers = [...DEFAULT_USERS];
  return inMemoryUsers;
}

// Write users to file and cache
function saveUsers(users) {
  inMemoryUsers = users;
  safeWriteFile('users.json', JSON.stringify(users, null, 2));
}

function toSafeUser(user) {
  return {
    id: user.id,
    name: user.name,
    username: user.username,
    email: user.email || '',
    role: user.role,
    mode: user.mode || user.role || 'Store Manager',
    status: user.status || 'active',
    createdAt: user.createdAt,
    profilePic: user.profilePic || null
  };
}

function findUserByUsername(users, username) {
  const normalizedUsername = normalizeUsername(username);
  return users.find(user => normalizeUsername(user.username) === normalizedUsername);
}

function userMatchesPassword(user, password) {
  return Boolean(user && user.passwordHash && user.passwordHash === hashPassword(password));
}

function localUsersOnly(users) {
  return users.filter(user => user.passwordHash || user.role === 'Admin');
}

function getAuthContext(req) {
  const token = getSessionToken(req);
  if (!token) throw new Error('Missing session token');

  const session = sessions.get(token);
  if (!session || session.expiresAt <= Date.now()) {
    if (session) sessions.delete(token);
    throw new Error('Session expired');
  }

  session.expiresAt = Date.now() + SESSION_TTL_MS;
  const users = getUsers();
  const localUser = users.find(u => u.id === session.userId) || null;
  return { session, localUser, token };
}

async function requireActiveUser(req, res) {
  try {
    const auth = getAuthContext(req);
    if (!auth.localUser) {
      clearSession(req, res);
      jsonResponse(res, 401, { error: 'Authentication required' });
      return null;
    }
    if (auth.localUser.status !== 'active') {
      jsonResponse(res, 403, { error: 'Your account is awaiting admin approval.', status: auth.localUser.status });
      return null;
    }
    return auth;
  } catch (err) {
    jsonResponse(res, 401, { error: 'Authentication required' });
    return null;
  }
}

async function requireAdminUser(req, res) {
  const auth = await requireActiveUser(req, res);
  if (!auth) return null;
  if (auth.localUser.role !== 'Admin') {
    jsonResponse(res, 403, { error: 'Admin access required' });
    return null;
  }
  return auth;
}

// Read audit logs
function getAuditLogs() {
  if (inMemoryAudit) return inMemoryAudit;
  const content = safeReadFile('audit_logs.json');
  if (content) {
    try {
      inMemoryAudit = JSON.parse(content);
      if (Array.isArray(inMemoryAudit) && inMemoryAudit.length > 0) {
        return inMemoryAudit;
      }
    } catch (err) {
      console.error('Error reading audit_logs.json:', err);
    }
  }
  inMemoryAudit = [...DEFAULT_AUDIT_LOGS];
  return inMemoryAudit;
}

// Save audit logs
function saveAuditLogs(logs) {
  inMemoryAudit = logs;
  safeWriteFile('audit_logs.json', JSON.stringify(logs, null, 2));
}

// Helper to parse CSV into JSON objects
function parseCSV(csvText) {
  const lines = csvText.split('\n').map(l => l.trim()).filter(l => l.length > 0);
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
          category: fields[2].replace(/^"|"$/g, ''),
          price: parseFloat(fields[3]),
          quantity: parseInt(fields[4]),
          reorderLevel: parseInt(fields[5])
        });
      }
    }
  }
  return items;
}

// Helper to format JSON objects to CSV string
function formatCSV(items) {
  let csv = 'ID,Name,Category,Price,Quantity,ReorderLevel\n';
  items.forEach(item => {
    csv += `${item.id},"${item.name}","${item.category}",${Number(item.price).toFixed(2)},${item.quantity},${item.reorderLevel}\n`;
  });
  return csv;
}

function getInventoryItems() {
  if (inMemoryInventory) return inMemoryInventory;
  const content = safeReadFile('inventory.csv');
  if (content) {
    inMemoryInventory = parseCSV(content);
    if (Array.isArray(inMemoryInventory) && inMemoryInventory.length > 0) {
      return inMemoryInventory;
    }
  }
  inMemoryInventory = [...DEFAULT_INVENTORY];
  return inMemoryInventory;
}

function saveInventoryItems(items) {
  inMemoryInventory = items;
  const csvContent = formatCSV(items);
  safeWriteFile('inventory.csv', csvContent);
}

async function handleRequest(req, res) {
  try {
    // CORS Headers
    const origin = req.headers && req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      res.setHeader('Access-Control-Allow-Origin', '*');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie, X-Session-Token');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const pathname = (req.url || '/').split('?')[0];

    if (pathname === '/api/config' && req.method === 'GET') {
      jsonResponse(res, 200, {
        authProvider: 'local-db',
        dbType: 'Local JSON & CSV (Zero External Keys)',
        profilePhotoMaxBytes: MAX_PROFILE_PHOTO_BYTES,
        version: '2.5.0'
      });
      return;
    }


  // --- AUTHENTICATION API ENDPOINTS (LOCAL NODE SESSIONS) ---
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const auth = await requireActiveUser(req, res);
    if (!auth) return;
    jsonResponse(res, 200, { success: true, user: toSafeUser(auth.localUser), token: auth.token });
    return;
  }

  if (pathname === '/api/auth/signup' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const name = normalizeText(body.name);
      const username = normalizeText(body.username);
      const email = normalizeText(body.email);
      const password = String(body.password || '');
      const mode = ALLOWED_ACCOUNT_MODES.has(body.mode) ? body.mode : 'Store Manager';

      if (!name || !username || !password) {
        jsonResponse(res, 400, { error: 'Name, username, and password are required' });
        return;
      }
      if (password.length < 6) {
        jsonResponse(res, 400, { error: 'Password must be at least 6 characters' });
        return;
      }

      const users = getUsers();
      if (findUserByUsername(users, username)) {
        jsonResponse(res, 409, { error: 'Username is already registered' });
        return;
      }

      const newUser = {
        id: `u_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        name,
        username,
        email,
        passwordHash: hashPassword(password),
        role: 'Store Manager',
        mode,
        status: 'pending',
        createdAt: new Date().toISOString(),
        profilePic: null
      };
      users.push(newUser);
      saveUsers(users);

      jsonResponse(res, 201, { success: true, user: toSafeUser(newUser), message: 'Account request submitted for admin approval' });
    } catch (err) {
      jsonResponse(res, err.message === 'Request body too large' ? 413 : 400, { error: err.message || 'Signup failed' });
    }
    return;
  }

  if (pathname === '/api/auth/login' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const username = normalizeText(body.username);
      const password = String(body.password || '');
      const users = getUsers();
      const user = findUserByUsername(users, username);

      if (!user || user.role === 'Admin' || !userMatchesPassword(user, password)) {
        jsonResponse(res, 401, { error: 'Invalid store manager credentials' });
        return;
      }
      if (user.status !== 'active') {
        jsonResponse(res, 403, { error: 'Your account is awaiting admin approval.', status: user.status, name: user.name });
        return;
      }

      const token = createSession(user.id, res);
      jsonResponse(res, 200, { success: true, user: toSafeUser(user), token });
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || 'Login failed' });
    }
    return;
  }

  if (pathname === '/api/auth/admin-login' && req.method === 'POST') {
    try {
      const body = await readJsonBody(req);
      const username = normalizeText(body.username);
      const password = String(body.password || '');
      const users = getUsers();
      const user = findUserByUsername(users, username);

      if (!user || user.role !== 'Admin' || !userMatchesPassword(user, password) || user.status !== 'active') {
        jsonResponse(res, 401, { error: 'Invalid admin credentials' });
        return;
      }

      const token = createSession(user.id, res);
      jsonResponse(res, 200, { success: true, user: toSafeUser(user), token });
    } catch (err) {
      jsonResponse(res, 400, { error: err.message || 'Admin login failed' });
    }
    return;
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    clearSession(req, res);
    jsonResponse(res, 200, { success: true });
    return;
  }

  if (pathname === '/api/me/profile' && req.method === 'PATCH') {
    const auth = await requireActiveUser(req, res);
    if (!auth) return;

    try {
      const body = await readJsonBody(req);
      const profilePic = validateProfilePic(body.profilePic ?? null);
      const users = getUsers();
      const userIndex = users.findIndex(u => u.id === auth.localUser.id);
      if (userIndex === -1) {
        jsonResponse(res, 404, { error: 'User not found' });
        return;
      }

      users[userIndex].profilePic = profilePic;
      saveUsers(users);
      jsonResponse(res, 200, { success: true, user: toSafeUser(users[userIndex]) });
    } catch (err) {
      jsonResponse(res, err.message === 'Request body too large' ? 413 : 400, { error: err.message || 'Profile update failed' });
    }
    return;
  }

  // --- USERS API ENDPOINTS (Admin only - no password hashes returned) ---
  if (pathname === '/api/users' && req.method === 'GET') {
    const auth = await requireAdminUser(req, res);
    if (!auth) return;

    const users = localUsersOnly(getUsers());
    jsonResponse(res, 200, users.map(toSafeUser));
    return;
  }

  // Approve a pending user
  const approveMatch = pathname.match(/^\/api\/users\/([^/]+)\/approve$/);
  if (approveMatch && req.method === 'PATCH') {
    const auth = await requireAdminUser(req, res);
    if (!auth) return;

    const userId = decodeURIComponent(approveMatch[1]);
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      jsonResponse(res, 404, { error: 'User not found' });
      return;
    }
    if (!users[userIndex].passwordHash) {
      jsonResponse(res, 400, { error: 'This account must sign up again using local authentication.' });
      return;
    }
    users[userIndex].status = 'active';
    saveUsers(users);
    jsonResponse(res, 200, { success: true, message: `User ${users[userIndex].name} approved` });
    return;
  }

  // Reject (delete) a pending user
  const rejectMatch = pathname.match(/^\/api\/users\/([^/]+)\/reject$/);
  if (rejectMatch && req.method === 'PATCH') {
    const auth = await requireAdminUser(req, res);
    if (!auth) return;

    const userId = decodeURIComponent(rejectMatch[1]);
    const users = getUsers();
    const userIndex = users.findIndex(u => u.id === userId);
    if (userIndex === -1) {
      jsonResponse(res, 404, { error: 'User not found' });
      return;
    }
    const rejectedName = users[userIndex].name;
    users.splice(userIndex, 1);
    saveUsers(users);
    jsonResponse(res, 200, { success: true, message: `User ${rejectedName} rejected and removed` });
    return;
  }

  // --- AUDIT LOG API ENDPOINTS ---
  if (pathname === '/api/audit' && req.method === 'GET') {
    const auth = await requireActiveUser(req, res);
    if (!auth) return;

    const logs = getAuditLogs();
    jsonResponse(res, 200, logs);
    return;
  }

  if (pathname === '/api/audit' && req.method === 'POST') {
    const auth = await requireActiveUser(req, res);
    if (!auth) return;

    try {
      const logEntry = await readJsonBody(req);
      const logs = getAuditLogs();
      logEntry.id = `log_${Date.now()}`;
      logEntry.user = auth.localUser.name;
      logEntry.timestamp = new Date().toISOString();
      logs.unshift(logEntry);
      if (logs.length > 200) logs.pop();
      saveAuditLogs(logs);

      jsonResponse(res, 201, { success: true, log: logEntry });
    } catch (err) {
      jsonResponse(res, 400, { error: 'Failed to record audit log' });
    }
    return;
  }

  // --- INVENTORY DATA API ENDPOINTS ---
  if (pathname === '/api/inventory' && req.method === 'GET') {
    const auth = await requireActiveUser(req, res);
    if (!auth) return;

    const items = getInventoryItems();
    jsonResponse(res, 200, items);
    return;
  }

  if (pathname === '/api/inventory' && req.method === 'POST') {
    const auth = await requireActiveUser(req, res);
    if (!auth) return;

    try {
      const items = await readJsonBody(req);
      saveInventoryItems(items);
      jsonResponse(res, 200, { success: true, message: 'Updated inventory.csv successfully' });
    } catch (err) {
      jsonResponse(res, 400, { error: 'Invalid JSON body' });
    }
    return;
  }

  // Static File Serving (for local environment or fallback)
  if (pathname === '/favicon.ico') {
    res.writeHead(204);
    res.end();
    return;
  }

  const staticPathname = pathname === '/' ? '/index.html' : pathname;
  const allowedStaticFiles = new Set(['/index.html', '/style.css', '/app.js']);
  if (!allowedStaticFiles.has(staticPathname)) {
    res.writeHead(404, { 'Content-Type': 'text/html' });
    res.end('<h1>404 Not Found</h1>');
    return;
  }

  const cleanFilename = staticPathname.replace(/^\//, '');
  const content = safeReadFile(cleanFilename);
  if (content !== null) {
    const ext = path.extname(cleanFilename);
    let contentType = 'text/html; charset=utf-8';
    if (ext === '.css') contentType = 'text/css; charset=utf-8';
    if (ext === '.js') contentType = 'application/javascript; charset=utf-8';
    if (ext === '.json') contentType = 'application/json; charset=utf-8';
    if (ext === '.svg') contentType = 'image/svg+xml';
    res.writeHead(200, {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=0, must-revalidate'
    });
    res.end(content, 'utf8');
  } else {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404 Not Found</h1>');
  }
} catch (fatalErr) {
  console.error('Fatal request handler error:', fatalErr);
  if (!res.headersSent) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Internal Server Error', message: fatalErr.message }));
  }
}
}


module.exports = handleRequest;

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Inventory OS Pro Server running at http://localhost:${PORT}`);
  });
}

