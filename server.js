// Chick-fil-A Catering Portal & Kitchen Fulfillment System (KDS)
// Pure Node.js with built-in node:http and node:sqlite (no external dependencies needed)

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { DatabaseSync } = require('node:sqlite');
const crypto = require('node:crypto');

const PORT = process.env.PORT || 3000;
const DB_FILE = process.env.DB_PATH || path.join(__dirname, 'catering.db');
const PUBLIC_DIR = path.join(__dirname, 'public');
const KDS_PASSWORD = (process.env.KDS_PASSWORD || '').trim();
const KDS_API_KEY = (process.env.KDS_API_KEY || KDS_PASSWORD || '').trim();
const AUTH_COOKIE_TOKEN = KDS_PASSWORD
  ? crypto.createHash('sha256').update(`cfa-kds-auth:${KDS_PASSWORD}`).digest('hex')
  : '';

// Ensure parent directory exists when using a mounted volume like /data/catering.db on Railway
fs.mkdirSync(path.dirname(DB_FILE), { recursive: true });

// If using a custom DB_PATH (e.g. /data/catering.db on Railway) and it doesn't exist yet,
// seed it from the bundled catering.db so existing synced orders carry over automatically!
const BUNDLED_DB = path.join(__dirname, 'catering.db');
if (path.resolve(DB_FILE) !== path.resolve(BUNDLED_DB) && !fs.existsSync(DB_FILE) && fs.existsSync(BUNDLED_DB)) {
  try {
    fs.copyFileSync(BUNDLED_DB, DB_FILE);
    console.log(`Initialized ${DB_FILE} from bundled catering.db`);
  } catch (e) {}
}

// Initialize SQLite database
const db = new DatabaseSync(DB_FILE);

// Set pragmas
db.exec('PRAGMA foreign_keys = ON;');

// Create tables
db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id TEXT PRIMARY KEY,
    order_number TEXT NOT NULL UNIQUE,
    customer_name TEXT NOT NULL,
    customer_phone TEXT,
    organization TEXT,
    pickup_time TEXT NOT NULL,
    order_type TEXT DEFAULT 'Pickup',
    guest_count INTEGER DEFAULT 1,
    special_notes TEXT,
    status TEXT DEFAULT 'new', -- 'new', 'in_prep', 'ready', 'completed', 'cancelled', 'error'
    payment_status TEXT DEFAULT 'Payment Received',
    is_new_unseen INTEGER DEFAULT 0,
    has_unacknowledged_change INTEGER DEFAULT 0,
    alert_message TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS order_items (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    name TEXT NOT NULL,
    category TEXT DEFAULT 'General',
    quantity INTEGER NOT NULL DEFAULT 1,
    unit TEXT DEFAULT 'count',
    notes TEXT,
    is_verified INTEGER DEFAULT 0,
    verified_at TEXT,
    verified_by TEXT,
    is_recently_added INTEGER DEFAULT 0,
    added_at TEXT,
    created_at TEXT NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS order_activity_logs (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL,
    action TEXT NOT NULL,
    description TEXT NOT NULL,
    performed_by TEXT DEFAULT 'System',
    created_at TEXT NOT NULL,
    FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
  );
`);

// Safe column migrations for existing catering.db files
try {
  db.exec("ALTER TABLE orders ADD COLUMN payment_status TEXT DEFAULT 'Payment Received';");
} catch (e) {}
try {
  db.exec("ALTER TABLE orders ADD COLUMN is_new_unseen INTEGER DEFAULT 0;");
} catch (e) {}

// Sample Data Seeder if empty
function seedIfEmpty() {
  const countRow = db.prepare('SELECT COUNT(*) as count FROM orders').get();
  if (countRow.count === 0) {
    console.log('Seeding initial catering demo orders...');
    const now = new Date();
    
    // Order 1: Due in 45 minutes (Active & needs prep)
    const time1 = new Date(now.getTime() + 45 * 60 * 1000).toISOString();
    const order1Id = 'ord-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO orders (id, order_number, customer_name, customer_phone, organization, pickup_time, order_type, guest_count, special_notes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order1Id, '#CFA-8492', 'Sarah Jenkins', '555-234-8901', 'Memorial Medical Center',
      time1, 'Pickup', 35, 'Hospital event room 4B. Need extra wet wipes.', 'in_prep',
      now.toISOString(), now.toISOString()
    );

    const items1 = [
      { name: 'Nugget Tray (Medium - 120 ct)', category: 'Trays', quantity: 2, unit: 'Trays' },
      { name: 'Mac & Cheese Tray (Medium)', category: 'Sides', quantity: 2, unit: 'Trays' },
      { name: 'Fresh Fruit Tray (Small)', category: 'Trays', quantity: 1, unit: 'Tray' },
      { name: 'Sweet Tea Gallon', category: 'Beverages', quantity: 2, unit: 'Gallons' },
      { name: 'Chick-fil-A Sauce 8oz Bottle', category: 'Sauces', quantity: 3, unit: 'Bottles' },
      { name: 'Barbeque Sauce Packets', category: 'Sauces', quantity: 25, unit: 'Packets' },
      { name: 'Serving Utensils & Plates Kit', category: 'Paper Goods', quantity: 35, unit: 'Sets' }
    ];
    for (const it of items1) {
      db.prepare(`
        INSERT INTO order_items (id, order_id, name, category, quantity, unit, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('item-' + crypto.randomUUID().slice(0, 8), order1Id, it.name, it.category, it.quantity, it.unit, now.toISOString());
    }
    db.prepare(`
      INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('log-' + crypto.randomUUID().slice(0, 8), order1Id, 'order_created', 'Catering order booked for Memorial Medical Center', 'Order Desk', now.toISOString());

    // Order 2: Due in 2 hours
    const time2 = new Date(now.getTime() + 120 * 60 * 1000).toISOString();
    const order2Id = 'ord-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO orders (id, order_number, customer_name, customer_phone, organization, pickup_time, order_type, guest_count, special_notes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order2Id, '#CFA-8493', 'Coach Marcus Vance', '555-876-5432', 'Westlake High Varsity',
      time2, 'Delivery', 50, 'Deliver to Gym entrance. Call on arrival.', 'new',
      now.toISOString(), now.toISOString()
    );

    const items2 = [
      { name: 'Chick-n-Strips Tray (Large - 75 ct)', category: 'Trays', quantity: 2, unit: 'Trays' },
      { name: 'Grilled Cool Wrap Tray (Medium - 10 halves)', category: 'Trays', quantity: 2, unit: 'Trays' },
      { name: 'Lemonade Gallon', category: 'Beverages', quantity: 3, unit: 'Gallons' },
      { name: 'Polynesian Sauce Packets', category: 'Sauces', quantity: 40, unit: 'Packets' },
      { name: 'Garden Herb Ranch Packets', category: 'Sauces', quantity: 20, unit: 'Packets' },
      { name: 'Chocolate Chunk Cookie Platter', category: 'Desserts', quantity: 2, unit: 'Platters' }
    ];
    for (const it of items2) {
      db.prepare(`
        INSERT INTO order_items (id, order_id, name, category, quantity, unit, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run('item-' + crypto.randomUUID().slice(0, 8), order2Id, it.name, it.category, it.quantity, it.unit, now.toISOString());
    }
    db.prepare(`
      INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('log-' + crypto.randomUUID().slice(0, 8), order2Id, 'order_created', 'Catering order booked for Westlake High Varsity', 'Order Desk', now.toISOString());

    // Order 3: Ready for pickup
    const time3 = new Date(now.getTime() + 15 * 60 * 1000).toISOString();
    const order3Id = 'ord-' + crypto.randomUUID().slice(0, 8);
    db.prepare(`
      INSERT INTO orders (id, order_number, customer_name, customer_phone, organization, pickup_time, order_type, guest_count, special_notes, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      order3Id, '#CFA-8490', 'Emily Thompson', '555-334-1122', 'First Baptist Church',
      time3, 'Pickup', 20, 'Will arrive in white Ford Explorer.', 'ready',
      now.toISOString(), now.toISOString()
    );

    const items3 = [
      { name: 'Nugget Tray (Small - 64 ct)', category: 'Trays', quantity: 1, unit: 'Tray', is_verified: 1 },
      { name: 'Sunjoy Gallon (Tea/Lemonade blend)', category: 'Beverages', quantity: 2, unit: 'Gallons', is_verified: 1 },
      { name: 'Honey Mustard Sauce Packets', category: 'Sauces', quantity: 20, unit: 'Packets', is_verified: 1 }
    ];
    for (const it of items3) {
      db.prepare(`
        INSERT INTO order_items (id, order_id, name, category, quantity, unit, is_verified, verified_at, verified_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run('item-' + crypto.randomUUID().slice(0, 8), order3Id, it.name, it.category, it.quantity, it.unit, it.is_verified, now.toISOString(), 'Chef Dave', now.toISOString());
    }
    db.prepare(`
      INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run('log-' + crypto.randomUUID().slice(0, 8), order3Id, 'order_created', 'Order booked', 'Order Desk', now.toISOString());
  }
}
seedIfEmpty();

// Real-Time Server-Sent Events (SSE) Client Pool
const sseClients = new Set();

function broadcastEvent(type, data) {
  const payload = `event: ${type}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (err) {
      sseClients.delete(client);
    }
  }
}

// Keep SSE alive every 25s
setInterval(() => {
  for (const client of sseClients) {
    try {
      client.write(': ping\n\n');
    } catch {
      sseClients.delete(client);
    }
  }
}, 25000);

// Helper: Get complete order data with items & logs
function getFullOrder(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;
  const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY category ASC, name ASC').all(orderId);
  const logs = db.prepare('SELECT * FROM order_activity_logs WHERE order_id = ? ORDER BY created_at DESC LIMIT 20').all(orderId);
  return { ...order, items, logs };
}

// Helper: Get all orders (including already-synced orders that entered 'cancelled' or 'error' status so the kitchen sees the warning banner until removed)
function getAllOrders() {
  const orders = db.prepare('SELECT * FROM orders ORDER BY pickup_time ASC').all();
  return orders.map(order => {
    const items = db.prepare('SELECT * FROM order_items WHERE order_id = ? ORDER BY is_recently_added DESC, category ASC, name ASC').all(order.id);
    const logs = db.prepare('SELECT * FROM order_activity_logs WHERE order_id = ? ORDER BY created_at DESC LIMIT 5').all(order.id);
    const verifiedCount = items.filter(i => i.is_verified === 1).length;
    return {
      ...order,
      items,
      logs,
      total_items: items.length,
      verified_items: verifiedCount,
      prep_progress: items.length > 0 ? Math.round((verifiedCount / items.length) * 100) : 0
    };
  });
}

// Helper: Parse JSON body
function parseJsonBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

// Static MIME types
const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

// Authentication Helper (Only enforced when KDS_PASSWORD is set in environment, e.g. on Railway)
function parseCookies(req) {
  const list = {};
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return list;
  cookieHeader.split(';').forEach((cookie) => {
    const parts = cookie.split('=');
    const key = parts.shift().trim();
    const val = decodeURIComponent(parts.join('='));
    if (key) list[key] = val;
  });
  return list;
}

function isRequestAuthenticated(req, parsedUrl) {
  if (!KDS_PASSWORD) return true; // Local mode without password set

  const cookies = parseCookies(req);
  if (cookies.kds_auth && cookies.kds_auth === AUTH_COOKIE_TOKEN) {
    return true;
  }

  const headerKey = (req.headers['x-kds-key'] || '').trim();
  if (headerKey && (headerKey === KDS_API_KEY || headerKey === KDS_PASSWORD)) {
    return true;
  }

  const queryKey = (parsedUrl.searchParams.get('key') || '').trim();
  if (queryKey && (queryKey === KDS_API_KEY || queryKey === KDS_PASSWORD)) {
    return true;
  }

  return false;
}

function renderLoginPage(errorMsg = '') {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Sign In — Catering Kitchen KDS</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
    body {
      min-height: 100vh;
      background: linear-gradient(135deg, #0B0F17 0%, #1E293B 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 20px;
      color: #0F172A;
    }
    .login-card {
      background: #FFFFFF;
      width: 100%;
      max-width: 400px;
      border-radius: 16px;
      padding: 32px 28px;
      box-shadow: 0 25px 50px rgba(0,0,0,0.45);
      text-align: center;
    }
    .badge {
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: #E5173F;
      color: #FFF;
      font-size: 32px;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 16px;
      box-shadow: 0 8px 20px rgba(229, 23, 63, 0.35);
    }
    h1 { font-size: 1.4rem; font-weight: 800; color: #0F172A; margin-bottom: 6px; }
    p { font-size: 0.9rem; color: #64748B; margin-bottom: 22px; }
    .err {
      background: #FEF2F2;
      color: #DC2626;
      border: 1px solid #FECACA;
      padding: 10px 12px;
      border-radius: 8px;
      font-size: 0.85rem;
      font-weight: 700;
      margin-bottom: 16px;
    }
    input {
      width: 100%;
      padding: 12px 14px;
      border: 1.5px solid #CBD5E1;
      border-radius: 10px;
      font-size: 1rem;
      margin-bottom: 14px;
      outline: none;
      text-align: center;
      letter-spacing: 1px;
    }
    input:focus { border-color: #E5173F; box-shadow: 0 0 0 3px rgba(229, 23, 63, 0.15); }
    button {
      width: 100%;
      padding: 12px;
      border: none;
      border-radius: 10px;
      background: #E5173F;
      color: #FFF;
      font-size: 1rem;
      font-weight: 800;
      cursor: pointer;
    }
    button:hover { background: #C41230; }
  </style>
</head>
<body>
  <div class="login-card">
    <div class="badge">🐔</div>
    <h1>Catering Kitchen KDS</h1>
    <p>Enter your team PIN or password to view live orders</p>
    ${errorMsg ? `<div class="err">${errorMsg}</div>` : ''}
    <form method="POST" action="/api/auth/login">
      <input type="password" name="password" placeholder="Team Password / PIN" required autofocus />
      <button type="submit">Unlock Kitchen Display</button>
    </form>
  </div>
</body>
</html>`;
}

// HTTP Server
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;
  const method = req.method;

  // CORS headers (including Private Network Access & Extension Key for https://order-management.cfahome.com)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-KDS-Key');
  res.setHeader('Access-Control-Allow-Private-Network', 'true');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Login endpoint (Supports both HTML form POST and JSON POST)
  if (pathname === '/api/auth/login' && method === 'POST') {
    let rawBody = '';
    req.on('data', (chunk) => { rawBody += chunk.toString(); });
    req.on('end', () => {
      let submitted = '';
      try {
        if ((req.headers['content-type'] || '').includes('application/json')) {
          submitted = (JSON.parse(rawBody).password || '').trim();
        } else {
          const params = new URLSearchParams(rawBody);
          submitted = (params.get('password') || '').trim();
        }
      } catch (e) {}

      if (!KDS_PASSWORD || submitted === KDS_PASSWORD || submitted === KDS_API_KEY) {
        res.writeHead(302, {
          'Set-Cookie': `kds_auth=${AUTH_COOKIE_TOKEN}; Path=/; Max-Age=${60 * 60 * 24 * 30}; HttpOnly; SameSite=Lax`,
          'Location': '/'
        });
        res.end();
      } else {
        res.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(renderLoginPage('Invalid PIN or password. Please try again.'));
      }
    });
    return;
  }

  if (pathname === '/logout' && method === 'GET') {
    res.writeHead(302, {
      'Set-Cookie': 'kds_auth=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax',
      'Location': '/'
    });
    res.end();
    return;
  }

  // Enforce authentication when KDS_PASSWORD is configured
  if (!isRequestAuthenticated(req, parsedUrl)) {
    if (pathname.startsWith('/api/')) {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Unauthorized. Check KDS Password / API Key in Companion Extension.' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(renderLoginPage());
    return;
  }

  // --- API ROUTES ---

  // SSE Stream
  if (pathname === '/api/events' && method === 'GET') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('retry: 3000\n\n');
    res.write(': connected\n\n');
    sseClients.add(res);

    req.on('close', () => {
      sseClients.delete(res);
    });
    return;
  }

  // GET /api/orders
  if (pathname === '/api/orders' && method === 'GET') {
    const orders = getAllOrders();
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(orders));
    return;
  }

  // GET /api/orders/:id
  const orderIdMatch = pathname.match(/^\/api\/orders\/([^\/]+)$/);
  if (orderIdMatch && method === 'GET') {
    const orderId = orderIdMatch[1];
    const order = getFullOrder(orderId);
    if (!order) {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Order not found' }));
      return;
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(order));
    return;
  }

  // POST /api/orders (Create new catering order)
  if (pathname === '/api/orders' && method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const now = new Date().toISOString();
      const id = 'ord-' + crypto.randomUUID().slice(0, 8);
      const randomNum = Math.floor(1000 + Math.random() * 9000);
      const orderNumber = data.order_number || `#CFA-${randomNum}`;

      db.prepare(`
        INSERT INTO orders (id, order_number, customer_name, customer_phone, organization, pickup_time, order_type, guest_count, special_notes, status, payment_status, is_new_unseen, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
      `).run(
        id, orderNumber, data.customer_name || 'Valued Guest', data.customer_phone || '',
        data.organization || '', data.pickup_time || now, data.order_type || 'Pickup',
        Number(data.guest_count) || 1, data.special_notes || '', 'new',
        data.payment_status || 'Payment Received', now, now
      );

      // Insert items if provided
      if (Array.isArray(data.items)) {
        for (const item of data.items) {
          if (!item.name) continue;
          db.prepare(`
            INSERT INTO order_items (id, order_id, name, category, quantity, unit, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            'item-' + crypto.randomUUID().slice(0, 8), id, item.name, item.category || 'General',
            Number(item.quantity) || 1, item.unit || 'count', item.notes || '', now
          );
        }
      }

      // Activity log
      db.prepare(`
        INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-' + crypto.randomUUID().slice(0, 8), id, 'order_created',
        `New catering order created for ${data.customer_name || 'Guest'} (${orderNumber})`,
        data.created_by || 'Order Desk', now
      );

      const createdOrder = getFullOrder(id);
      broadcastEvent('order_created', { order: createdOrder, summary: `New Order: ${orderNumber}` });

      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(createdOrder));
    } catch (err) {
      console.error(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /api/orders/sync (Upsert order from order-management.cfahome.com Companion Extension)
  if (pathname === '/api/orders/sync' && method === 'POST') {
    try {
      const data = await parseJsonBody(req);
      const now = new Date().toISOString();
      const orderNumber = (data.order_number || '').trim() || `#CFA-${Math.floor(1000 + Math.random() * 9000)}`;

      const customerNameParam = (data.customer_name || '').trim();
      const incomingPaymentStatus = (data.payment_status || '').trim();
      const isCancelledPayment = /\b(cancell?ed|void)\b/i.test(incomingPaymentStatus);
      const isErrorPayment = /\b(error|failed|declined)\b/i.test(incomingPaymentStatus);
      const isBadPayment = isCancelledPayment || isErrorPayment;

      const existing = db.prepare(
        'SELECT * FROM orders WHERE order_number = ? OR (LOWER(customer_name) = LOWER(?) AND customer_name != \'\') LIMIT 1'
      ).get(orderNumber, customerNameParam);

      // If the order is NOT already synced on the KDS and has "Error" or "Cancelled" payment status, DO NOT SYNC IT!
      if (!existing && isBadPayment) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          mode: 'skipped_bad_payment',
          skipped: true,
          reason: incomingPaymentStatus
        }));
        return;
      }

      // If the order is NOT already on the KDS and its pickup_time is before current time, DO NOT SYNC IT!
      const incomingTimeMs = data.pickup_time ? new Date(data.pickup_time).getTime() : NaN;
      if (!existing && !isNaN(incomingTimeMs) && incomingTimeMs < Date.now()) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          mode: 'skipped_past_order',
          skipped: true,
          reason: 'Order pickup time is in the past'
        }));
        return;
      }

      if (existing) {
        // Order exists: update metadata and optionally append quick-add items or flash alert
        const customerName = data.customer_name || existing.customer_name;
        const customerPhone = data.customer_phone !== undefined && data.customer_phone !== '' ? data.customer_phone : existing.customer_phone;
        const organization = data.organization !== undefined && data.organization !== '' ? data.organization : existing.organization;
        const pickupTime = data.pickup_time || existing.pickup_time;
        const orderType = data.order_type || existing.order_type;
        const guestCount = Number(data.guest_count) || existing.guest_count;
        const specialNotes = data.special_notes !== undefined ? data.special_notes : existing.special_notes;
        const nextPaymentStatus = incomingPaymentStatus || existing.payment_status || 'Payment Received';

        const itemsAdded = [];

        if (Array.isArray(data.items) && data.items.length > 0) {
          if (data.sync_mode === 'sync' && !data.flash_kitchen) {
            // Cleanly replace base Food & Menu items from Order Summary while keeping manual Quick-Add items
            db.prepare("DELETE FROM order_items WHERE order_id = ? AND is_recently_added = 0").run(existing.id);
            for (const it of data.items) {
              if (!it.name) continue;
              db.prepare(`
                INSERT INTO order_items (id, order_id, name, category, quantity, unit, notes, is_recently_added, added_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
              `).run(
                'item-' + crypto.randomUUID().slice(0, 8), existing.id, it.name, it.category || 'Food & Menu',
                Number(it.quantity) || 1, it.unit || 'count', it.notes || '', now, now
              );
            }
          } else {
            // Quick-Add mode: append new items with flashing alert
            for (const it of data.items) {
              if (!it.name) continue;
              db.prepare(`
                INSERT INTO order_items (id, order_id, name, category, quantity, unit, notes, is_recently_added, added_at, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
              `).run(
                'item-' + crypto.randomUUID().slice(0, 8), existing.id, it.name, it.category || 'Sauces & Additions',
                Number(it.quantity) || 1, it.unit || 'count', it.notes || '', now, now
              );
              itemsAdded.push(`${it.quantity || 1}x ${it.name}`);
            }
          }
        }

        // If an already-synced order transitions to Cancelled or Error on CFA Home, immediately alert the Kitchen!
        let nextStatus = existing.status;
        let badPaymentAlertMsg = '';
        if (isCancelledPayment) {
          nextStatus = 'cancelled';
          badPaymentAlertMsg = `🚫 ORDER CANCELLED IN CMT (${incomingPaymentStatus.toUpperCase()}) — DO NOT PREP!`;
        } else if (isErrorPayment) {
          nextStatus = 'error';
          badPaymentAlertMsg = `⚠️ PAYMENT ERROR IN CMT (${incomingPaymentStatus.toUpperCase()}) — HOLD PREP!`;
        }

        const newlyEnteredBadPayment = isBadPayment && existing.status !== nextStatus;
        const shouldFlash = newlyEnteredBadPayment || (data.flash_kitchen === true && (itemsAdded.length > 0 || Boolean(data.custom_note)));
        const alertMsg = badPaymentAlertMsg
          ? badPaymentAlertMsg
          : itemsAdded.length > 0
          ? `⚡ CFA SYNC: ${itemsAdded.join(', ')}${data.custom_note ? ` — "${data.custom_note}"` : ''}`
          : (data.custom_note ? `⚡ CFA NOTE: "${data.custom_note}"` : existing.alert_message);

        db.prepare(`
          UPDATE orders
          SET customer_name = ?, customer_phone = ?, organization = ?, pickup_time = ?,
              order_type = ?, guest_count = ?, special_notes = ?, status = ?, payment_status = ?,
              has_unacknowledged_change = ?, alert_message = ?, updated_at = ?
          WHERE id = ?
        `).run(
          customerName, customerPhone, organization, pickupTime,
          orderType, guestCount, specialNotes, nextStatus, nextPaymentStatus,
          shouldFlash ? 1 : existing.has_unacknowledged_change,
          (shouldFlash || badPaymentAlertMsg) ? alertMsg : existing.alert_message,
          now, existing.id
        );

        db.prepare(`
          INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          'log-' + crypto.randomUUID().slice(0, 8), existing.id, 'cfahome_sync',
          alertMsg || `Synced update from order-management.cfahome.com`,
          data.submitted_by || 'CFA Home Companion', now
        );

        const updatedOrder = getFullOrder(existing.id);
        if (shouldFlash) {
          broadcastEvent('kitchen_alert', {
            orderId: existing.id,
            orderNumber: existing.order_number,
            customerName,
            alertMessage: alertMsg,
            urgency: 'urgent',
            itemsAdded,
            updatedOrder,
            timestamp: now
          });
        } else {
          broadcastEvent('order_created', { order: updatedOrder, summary: `Synced ${orderNumber}` });
        }

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, mode: 'updated', order: updatedOrder }));
      } else {
        // Create new order from CFA Home sync (starts as is_new_unseen = 1 so it glows BRIGHT GREEN until touched!)
        const id = 'ord-' + crypto.randomUUID().slice(0, 8);
        const hasUrgentNote = Boolean(data.custom_note) || data.flash_kitchen === true;
        const alertMsg = data.custom_note ? `⚡ NOTE: "${data.custom_note}"` : '⚡ New Order Synced from CFA Home';

        db.prepare(`
          INSERT INTO orders (id, order_number, customer_name, customer_phone, organization, pickup_time, order_type, guest_count, special_notes, status, payment_status, is_new_unseen, has_unacknowledged_change, alert_message, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'new', ?, 1, ?, ?, ?, ?)
        `).run(
          id, orderNumber, data.customer_name || 'CFA Catering Guest', data.customer_phone || '',
          data.organization || '', data.pickup_time || new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          data.order_type || 'Pickup', Number(data.guest_count) || 1,
          data.special_notes || data.custom_note || '',
          incomingPaymentStatus || 'Payment Received',
          hasUrgentNote ? 1 : 0, hasUrgentNote ? alertMsg : null, now, now
        );

        if (Array.isArray(data.items)) {
          for (const item of data.items) {
            if (!item.name) continue;
            db.prepare(`
              INSERT INTO order_items (id, order_id, name, category, quantity, unit, notes, is_recently_added, added_at, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              'item-' + crypto.randomUUID().slice(0, 8), id, item.name, item.category || 'General',
              Number(item.quantity) || 1, item.unit || 'count', item.notes || '',
              hasUrgentNote ? 1 : 0, hasUrgentNote ? now : null, now
            );
          }
        }

        db.prepare(`
          INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          'log-' + crypto.randomUUID().slice(0, 8), id, 'cfahome_sync',
          `Imported order ${orderNumber} from order-management.cfahome.com`,
          data.submitted_by || 'CFA Home Companion', now
        );

        const createdOrder = getFullOrder(id);
        if (hasUrgentNote) {
          broadcastEvent('kitchen_alert', {
            orderId: id,
            orderNumber,
            customerName: createdOrder.customer_name,
            alertMessage: alertMsg,
            urgency: 'urgent',
            itemsAdded: (data.items || []).map(i => `${i.quantity || 1}x ${i.name}`),
            updatedOrder: createdOrder,
            timestamp: now
          });
        } else {
          broadcastEvent('order_created', { order: createdOrder, summary: `Synced Order: ${orderNumber}` });
        }

        res.writeHead(201, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ success: true, mode: 'created', order: createdOrder }));
      }
    } catch (err) {
      console.error(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /api/orders/:id/quick-add (The wife's core need: "Add 50 BBQ sauces / Flash kitchen")
  const quickAddMatch = pathname.match(/^\/api\/orders\/([^\/]+)\/quick-add$/);
  if (quickAddMatch && method === 'POST') {
    try {
      const orderId = quickAddMatch[1];
      const data = await parseJsonBody(req);
      const now = new Date().toISOString();

      const existingOrder = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!existingOrder) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Order not found' }));
        return;
      }

      const itemsAdded = [];
      if (Array.isArray(data.items)) {
        for (const it of data.items) {
          if (!it.name) continue;
          const itemId = 'item-' + crypto.randomUUID().slice(0, 8);
          db.prepare(`
            INSERT INTO order_items (id, order_id, name, category, quantity, unit, notes, is_recently_added, added_at, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
          `).run(
            itemId, orderId, it.name, it.category || 'Sauces', Number(it.quantity) || 1,
            it.unit || 'Packets', it.notes || '', now, now
          );
          itemsAdded.push(`${it.quantity}x ${it.name}`);
        }
      }

      const urgency = data.urgency || 'urgent'; // 'urgent' (flashing red alert) or 'normal'
      const alertSummary = itemsAdded.length > 0 
        ? `⚡ ADDED: ${itemsAdded.join(', ')}` 
        : (data.custom_note ? `⚡ CHANGE: ${data.custom_note}` : '⚡ Order Modified');
      
      const fullAlertMessage = data.custom_note 
        ? `${alertSummary} — Note: "${data.custom_note}"`
        : alertSummary;

      // Update order state to trigger kitchen flashing alert
      db.prepare(`
        UPDATE orders 
        SET has_unacknowledged_change = 1,
            alert_message = ?,
            updated_at = ?
        WHERE id = ?
      `).run(fullAlertMessage, now, orderId);

      // Log activity
      db.prepare(`
        INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-' + crypto.randomUUID().slice(0, 8), orderId, 'urgent_modification',
        `${fullAlertMessage} [Submitted via Quick-Mod Portal]`,
        data.submitted_by || 'Order Desk (Wife)', now
      );

      const updatedOrder = getFullOrder(orderId);

      // Real-time broadcast to kitchen with priority alert payload
      broadcastEvent('kitchen_alert', {
        orderId,
        orderNumber: existingOrder.order_number,
        customerName: existingOrder.customer_name,
        alertMessage: fullAlertMessage,
        urgency,
        itemsAdded,
        updatedOrder,
        timestamp: now
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, order: updatedOrder }));
    } catch (err) {
      console.error(err);
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /api/orders/:id/touch (Clears the bright green 'is_new_unseen' highlight once a new order is touched)
  const touchMatch = pathname.match(/^\/api\/orders\/([^\/]+)\/touch$/);
  if (touchMatch && method === 'POST') {
    try {
      const orderId = touchMatch[1];
      const now = new Date().toISOString();
      db.prepare('UPDATE orders SET is_new_unseen = 0, updated_at = ? WHERE id = ?').run(now, orderId);
      const updatedOrder = getFullOrder(orderId);
      if (updatedOrder) {
        broadcastEvent('status_changed', { orderId, newStatus: updatedOrder.status, updatedOrder });
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, order: updatedOrder }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // POST /api/orders/:id/acknowledge-alert (Kitchen taps touchscreen to silence/acknowledge the red flash)
  const ackMatch = pathname.match(/^\/api\/orders\/([^\/]+)\/acknowledge-alert$/);
  if (ackMatch && method === 'POST') {
    try {
      const orderId = ackMatch[1];
      const data = await parseJsonBody(req);
      const now = new Date().toISOString();
      const chefName = data.chef_name || 'Kitchen Staff';

      // Reset unacknowledged flag and new unseen flag
      db.prepare(`
        UPDATE orders
        SET has_unacknowledged_change = 0,
            is_new_unseen = 0,
            updated_at = ?
        WHERE id = ?
      `).run(now, orderId);

      // Reset is_recently_added on items for this order
      db.prepare(`
        UPDATE order_items
        SET is_recently_added = 0
        WHERE order_id = ?
      `).run(orderId);

      // Log the chef's touch acknowledgment
      db.prepare(`
        INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-' + crypto.randomUUID().slice(0, 8), orderId, 'alert_acknowledged',
        `⚠️ Alert acknowledged & verified by kitchen chef: ${chefName}`,
        chefName, now
      );

      const updatedOrder = getFullOrder(orderId);
      broadcastEvent('alert_acknowledged', {
        orderId,
        chefName,
        updatedOrder,
        timestamp: now
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, order: updatedOrder }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // PATCH /api/items/:itemId/verify (Touchscreen element toggle)
  const verifyMatch = pathname.match(/^\/api\/items\/([^\/]+)\/verify$/);
  if (verifyMatch && method === 'PATCH') {
    try {
      const itemId = verifyMatch[1];
      const data = await parseJsonBody(req);
      const now = new Date().toISOString();

      const item = db.prepare('SELECT * FROM order_items WHERE id = ?').get(itemId);
      if (!item) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Item not found' }));
        return;
      }

      const newVerified = item.is_verified ? 0 : 1;
      const verifiedBy = newVerified ? (data.verified_by || 'Kitchen Chef (Touch)') : null;
      const verifiedAt = newVerified ? now : null;

      db.prepare(`
        UPDATE order_items
        SET is_verified = ?, verified_by = ?, verified_at = ?
        WHERE id = ?
      `).run(newVerified, verifiedBy, verifiedAt, itemId);

      // Touching an item also clears the bright green 'is_new_unseen' flag on the order
      db.prepare('UPDATE orders SET is_new_unseen = 0, updated_at = ? WHERE id = ?').run(now, item.order_id);

      // Check if all items in order are verified, auto-suggest 'ready' status if not already
      const allItems = db.prepare('SELECT is_verified FROM order_items WHERE order_id = ?').all(item.order_id);
      const allChecked = allItems.every(i => i.is_verified === 1);

      // Log verification
      db.prepare(`
        INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-' + crypto.randomUUID().slice(0, 8), item.order_id, 'item_verified',
        `${newVerified ? '✓ Verified & Packed' : 'Unchecked'}: ${item.quantity}x ${item.name}`,
        verifiedBy || 'Kitchen Staff', now
      );

      const updatedOrder = getFullOrder(item.order_id);
      broadcastEvent('item_verified', {
        itemId,
        isVerified: newVerified,
        allChecked,
        orderId: item.order_id,
        updatedOrder
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, item: { ...item, is_verified: newVerified }, order: updatedOrder }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // PATCH /api/orders/:id/status (Change status: new, in_prep, ready, completed, error, cancelled)
  const statusMatch = pathname.match(/^\/api\/orders\/([^\/]+)\/status$/);
  if (statusMatch && method === 'PATCH') {
    try {
      const orderId = statusMatch[1];
      const data = await parseJsonBody(req);
      const newStatus = data.status;
      const now = new Date().toISOString();

      if (newStatus === 'error' || newStatus === 'cancelled') {
        const payStatus = newStatus === 'cancelled' ? 'Cancelled' : 'Error';
        const alertMsg = newStatus === 'cancelled'
          ? '🚫 ORDER CANCELLED — DO NOT PREP!'
          : '⚠️ PAYMENT ERROR — HOLD PREP!';
        db.prepare(`
          UPDATE orders
          SET status = ?, payment_status = ?, is_new_unseen = 0,
              has_unacknowledged_change = 1, alert_message = ?, updated_at = ?
          WHERE id = ?
        `).run(newStatus, payStatus, alertMsg, now, orderId);
      } else {
        db.prepare(`
          UPDATE orders
          SET status = ?, payment_status = 'Payment Received', is_new_unseen = 0, updated_at = ?
          WHERE id = ?
        `).run(newStatus, now, orderId);
      }

      db.prepare(`
        INSERT INTO order_activity_logs (id, order_id, action, description, performed_by, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(
        'log-' + crypto.randomUUID().slice(0, 8), orderId, 'status_changed',
        `Order status changed to: ${newStatus.toUpperCase()}`,
        data.changed_by || 'Kitchen Staff', now
      );

      const updatedOrder = getFullOrder(orderId);
      if (newStatus === 'error' || newStatus === 'cancelled') {
        broadcastEvent('kitchen_alert', {
          orderId,
          orderNumber: updatedOrder.order_number,
          customerName: updatedOrder.customer_name,
          alertMessage: updatedOrder.alert_message,
          urgency: 'urgent',
          itemsAdded: [],
          updatedOrder,
          timestamp: now
        });
      } else {
        broadcastEvent('status_changed', { orderId, newStatus, updatedOrder });
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, order: updatedOrder }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // DELETE /api/orders/:id (Delete / Cancel an order)
  const deleteOrderMatch = pathname.match(/^\/api\/orders\/([^\/]+)$/);
  if (deleteOrderMatch && method === 'DELETE') {
    try {
      const orderId = deleteOrderMatch[1];
      const existing = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
      if (!existing) {
        res.writeHead(404, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Order not found' }));
        return;
      }

      db.prepare('DELETE FROM order_items WHERE order_id = ?').run(orderId);
      db.prepare('DELETE FROM order_activity_logs WHERE order_id = ?').run(orderId);
      db.prepare('DELETE FROM orders WHERE id = ?').run(orderId);

      broadcastEvent('order_deleted', {
        orderId,
        orderNumber: existing.order_number,
        customerName: existing.customer_name
      });

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: true, deletedId: orderId }));
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message }));
    }
    return;
  }

  // GET /api/network-info (Returns local IPs for opening on tablet/mobile)
  if (pathname === '/api/network-info' && method === 'GET') {
    const interfaces = os.networkInterfaces();
    const addresses = [];
    for (const ifaceName of Object.keys(interfaces)) {
      for (const iface of interfaces[ifaceName]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          addresses.push({ interface: ifaceName, address: iface.address, port: PORT });
        }
      }
    }
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ port: PORT, localAddresses: addresses }));
    return;
  }

  // --- STATIC FILE SERVING ---
  let filePath = path.join(PUBLIC_DIR, pathname === '/' ? 'index.html' : pathname);
  
  // URL rewrite for convenience: /kds or /kitchen opens index.html?view=kitchen
  if (pathname === '/kds' || pathname === '/kitchen') {
    filePath = path.join(PUBLIC_DIR, 'index.html');
  }

  // Prevent directory traversal
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end('Access denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      // Default fallback to index.html for SPA-style routing
      const indexFallback = path.join(PUBLIC_DIR, 'index.html');
      fs.readFile(indexFallback, (err2, content) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain' });
          res.end('404 Not Found');
        } else {
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(content);
        }
      });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    fs.readFile(filePath, (readErr, content) => {
      if (readErr) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Internal Server Error');
      } else {
        res.writeHead(200, {
          'Content-Type': contentType,
          'Cache-Control': 'no-store, no-cache, must-revalidate'
        });
        res.end(content);
      }
    });
  });
});

if (require.main === module) {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`=======================================================`);
    console.log(`🐔 Chick-fil-A Catering & Kitchen Fulfillment Portal`);
    console.log(`=======================================================`);
    console.log(`✓ Local URL:           http://localhost:${PORT}`);
    console.log(`✓ Kitchen Touch KDS:   http://localhost:${PORT}?view=kitchen`);
    console.log(`✓ Order Desk Portal:   http://localhost:${PORT}?view=desk`);
    
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal) {
          console.log(`✓ Kitchen Tablet (LAN): http://${iface.address}:${PORT}?view=kitchen`);
        }
      }
    }
    console.log(`=======================================================`);
  });
}

module.exports = { server, db, getAllOrders, getFullOrder };
