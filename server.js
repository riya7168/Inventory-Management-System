const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const os = require('os');

loadEnvFile(path.join(__dirname, '.env'));
loadEnvFile(path.join(__dirname, '.env.local'), true);

const PORT = Number(process.env.PORT || 3000);
const CSV_PATH = path.join(__dirname, 'inventory.csv');
const USERS_PATH = path.join(__dirname, 'users.json');
const AUDIT_PATH = path.join(__dirname, 'audit_logs.json');
const SESSION_COOKIE = 'inventory_session';
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const MAX_JSON_BODY_BYTES = 3 * 1024 * 1024;
const MAX_PROFILE_PHOTO_BYTES = 2 * 1024 * 1024;
const ALLOWED_ACCOUNT_MODES = new Set(['Store Manager', 'Inventory Operator', 'Stock Auditor']);
const sessions = new Map();

let inMemoryUsers = null;
let inMemoryAudit = null;
let inMemoryInventory = null;

function loadEnvFile(filePath, override = false) {
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
}

function safeReadFile(filename) {
  const tmpPath = path.join(os.tmpdir(), filename);
  if (fs.existsSync(tmpPath)) {
    try {
      return fs.readFileSync(tmpPath, 'utf8');
    } catch (e) {}
  }
  const localPath = path.join(__dirname, filename);
  if (fs.existsSync(localPath)) {
    try {
      return fs.readFileSync(localPath, 'utf8');
    } catch (e) {}
  }
  return null;
}

function safeWriteFile(filename, content) {
  const localPath = path.join(__dirname, filename);
  const tmpPath = path.join(os.tmpdir(), filename);

  try {
    fs.writeFileSync(localPath, content, 'utf8');
    return;
  } catch (err) {
    // Read-only file system in Vercel serverless lambda; fallback to tmp
  }

  try {
    fs.writeFileSync(tmpPath, content, 'utf8');
  } catch (err) {
    console.error(`Failed writing ${filename}:`, err);
  }
}

function jsonResponse(res, statusCode, data) {
  res.writeHead(statusCode, { 'Content-Type': 'application/json' });
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
    return authHeader.slice(7).trim();
  }

  const cookies = parseCookies(req.headers.cookie);
  return cookies[SESSION_COOKIE] || '';
}

function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString('hex');
  sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; Max-Age=${Math.floor(SESSION_TTL_MS / 1000)}; HttpOnly; SameSite=Lax`
  );
}

function clearSession(req, res) {
  const token = getSessionToken(req);
  if (token) sessions.delete(token);
  res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax`);
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
      return inMemoryUsers;
    } catch (err) {
      console.error('Error reading users.json:', err);
    }
  }
  inMemoryUsers = [];
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
  return { session, localUser };
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
      return inMemoryAudit;
    } catch (err) {
      console.error('Error reading audit_logs.json:', err);
    }
  }
  inMemoryAudit = [];
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
    return inMemoryInventory;
  }
  inMemoryInventory = [];
  return inMemoryInventory;
}

function saveInventoryItems(items) {
  inMemoryInventory = items;
  const csvContent = formatCSV(items);
  safeWriteFile('inventory.csv', csvContent);
}

async function handleRequest(req, res) {
  // CORS Headers
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, Cookie');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = requestUrl.pathname;

  if (pathname === '/api/config' && req.method === 'GET') {
    jsonResponse(res, 200, { authProvider: 'node', profilePhotoMaxBytes: MAX_PROFILE_PHOTO_BYTES });
    return;
  }

  // --- AUTHENTICATION API ENDPOINTS (LOCAL NODE SESSIONS) ---
  if (pathname === '/api/auth/me' && req.method === 'GET') {
    const auth = await requireActiveUser(req, res);
    if (!auth) return;
    jsonResponse(res, 200, { success: true, user: toSafeUser(auth.localUser) });
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

      createSession(user.id, res);
      jsonResponse(res, 200, { success: true, user: toSafeUser(user) });
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

      createSession(user.id, res);
      jsonResponse(res, 200, { success: true, user: toSafeUser(user) });
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

  // Static File Serving (for local environment or serverless execution)
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

  const filePath = path.join(__dirname, staticPathname);
  const ext = path.extname(filePath);
  let contentType = 'text/html';

  if (ext === '.css') contentType = 'text/css';
  if (ext === '.js') contentType = 'text/javascript';

  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/html' });
        res.end('<h1>404 Not Found</h1>');
      } else {
        res.writeHead(500);
        res.end(`Server Error: ${err.code}`);
      }
    } else {
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf8');
    }
  });
}

module.exports = handleRequest;

if (require.main === module) {
  const server = http.createServer(handleRequest);
  server.listen(PORT, () => {
    console.log(`Inventory OS Pro Server running at http://localhost:${PORT}`);
  });
}
