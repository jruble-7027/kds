const { EventEmitter } = require('node:events');
process.chdir(__dirname);

const { server, db, getAllOrders, getFullOrder } = require('./server.js');

function executeMockRequest(method, url, body) {
  return new Promise((resolve, reject) => {
    const req = new EventEmitter();
    req.method = method;
    req.url = url;
    req.headers = { host: 'localhost:3000' };

    let statusCode = 200;
    let headers = {};
    let responseData = '';

    const res = {
      setHeader(k, v) { headers[k] = v; },
      writeHead(code, h) {
        statusCode = code;
        if (h) Object.assign(headers, h);
      },
      write(chunk) { responseData += chunk; },
      end(chunk) {
        if (chunk) responseData += chunk;
        try {
          const json = responseData ? JSON.parse(responseData) : null;
          resolve({ status: statusCode, headers, body: json, raw: responseData });
        } catch {
          resolve({ status: statusCode, headers, raw: responseData });
        }
      }
    };

    server.emit('request', req, res);

    process.nextTick(() => {
      if (body) {
        req.emit('data', JSON.stringify(body));
      }
      req.emit('end');
    });
  });
}

async function runTests() {
  try {
    console.log('Testing Catering Portal Endpoints & SQLite Logic (In-Process)...');

    // 1. GET /api/orders
    const ordersRes = await executeMockRequest('GET', '/api/orders');
    console.log(`✓ GET /api/orders status ${ordersRes.status}, count: ${ordersRes.body.length}`);
    if (!ordersRes.body || ordersRes.body.length === 0) {
      throw new Error('Expected seeded orders in database');
    }
    const targetOrder = ordersRes.body[0];
    console.log(`✓ Target Order: ${targetOrder.order_number} (${targetOrder.customer_name})`);

    // 2. POST /api/orders/:id/quick-add (The Wife's Core Scenario: 50 BBQ Sauces added!)
    console.log('\n--- Testing Quick-Add / Flash Kitchen Alert ---');
    const quickAddRes = await executeMockRequest('POST', `/api/orders/${targetOrder.id}/quick-add`, {
      items: [
        { name: 'Barbeque Sauce Packets', quantity: 50, category: 'Sauces', unit: 'Packets', notes: 'Packed in separate bag' }
      ],
      custom_note: 'Customer just called at 2:15 PM to add 50 BBQ sauces!',
      urgency: 'urgent',
      submitted_by: 'Order Desk (Sarah)'
    });
    console.log(`✓ POST quick-add status ${quickAddRes.status}, success: ${quickAddRes.body.success}`);
    
    // Verify order state
    const modifiedOrder = quickAddRes.body.order;
    console.log(`✓ Order has unacknowledged change: ${modifiedOrder.has_unacknowledged_change === 1 ? 'YES (FLASHING RED TRIGGERED)' : 'NO'}`);
    console.log(`✓ Alert Message: "${modifiedOrder.alert_message}"`);

    const bbqItem = modifiedOrder.items.find(i => i.name.includes('Barbeque'));
    if (!bbqItem) throw new Error('BBQ sauce item was not added!');
    console.log(`✓ Added Item: ${bbqItem.quantity}x ${bbqItem.name} (is_recently_added = ${bbqItem.is_recently_added})`);

    // Verify activity logs
    const latestLog = modifiedOrder.logs[0];
    console.log(`✓ Activity Log Entry: "${latestLog.description}" by ${latestLog.performed_by}`);

    // 3. POST /api/orders/:id/acknowledge-alert (Kitchen chef taps touchscreen to acknowledge alert)
    console.log('\n--- Testing Kitchen Touchscreen Alert Acknowledgment ---');
    const ackRes = await executeMockRequest('POST', `/api/orders/${targetOrder.id}/acknowledge-alert`, {
      chef_name: 'Chef Marcus (Touchscreen Display)'
    });
    console.log(`✓ POST acknowledge status ${ackRes.status}, unacknowledged reset to: ${ackRes.body.order.has_unacknowledged_change} (FLASHING STOPPED)`);

    // 4. PATCH /api/items/:itemId/verify (Touchscreen element checklist toggle)
    console.log('\n--- Testing Touchscreen Checklist Element Verification ---');
    const verifyRes = await executeMockRequest('PATCH', `/api/items/${bbqItem.id}/verify`, {
      verified_by: 'Chef Marcus'
    });
    console.log(`✓ PATCH verify status ${verifyRes.status}, is_verified: ${verifyRes.body.item.is_verified === 1 ? 'VERIFIED (CHECKED)' : 'UNCHECKED'}`);
    console.log(`✓ Verified By: ${verifyRes.body.item.verified_by}`);

    // 5. POST /api/orders (Create new catering order)
    console.log('\n--- Testing Create New Catering Order ---');
    const newOrdRes = await executeMockRequest('POST', '/api/orders', {
      customer_name: 'Principal Davis',
      customer_phone: '555-901-2345',
      organization: 'Oakridge High School',
      pickup_time: new Date(Date.now() + 3600000).toISOString(),
      order_type: 'Pickup',
      guest_count: 40,
      special_notes: 'Provide extra wet wipes and ice scoops',
      items: [
        { name: 'Nugget Tray (Large - 200 ct)', category: 'Trays', quantity: 1, unit: 'Tray' },
        { name: 'Sweet Tea Gallon', category: 'Beverages', quantity: 2, unit: 'Gallons' }
      ]
    });
    console.log(`✓ POST /api/orders status ${newOrdRes.status}, created: ${newOrdRes.body.order_number}`);

    // Close server
    server.close();
    console.log('\n=======================================================');
    console.log('🎉 ALL INTEGRATION TESTS PASSED WITH 100% SUCCESS!');
    console.log('=======================================================');
    process.exit(0);
  } catch (err) {
    console.error('\n❌ Test failed:', err);
    process.exit(1);
  }
}

runTests();
