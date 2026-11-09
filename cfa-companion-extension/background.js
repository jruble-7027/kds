// Background Service Worker for Chick-fil-A Kitchen KDS Companion
// Bridges https://order-management.cfahome.com to http://localhost:3000 (with automatic 127.0.0.1 fallback)

const CANDIDATE_URLS = ['http://localhost:3000', 'http://127.0.0.1:3000'];

async function fetchFromKds(path, options = {}) {
  let lastErr = null;
  for (const base of CANDIDATE_URLS) {
    try {
      const res = await fetch(`${base}${path}`, options);
      const data = await res.json();
      return { ok: res.ok, status: res.status, data, baseUrl: base };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not connect to localhost:3000 or 127.0.0.1:3000');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      if (message.type === 'KDS_GET_ORDERS') {
        const result = await fetchFromKds('/api/orders');
        sendResponse({ ok: result.ok, orders: result.data, baseUrl: result.baseUrl });
        return;
      }

      if (message.type === 'KDS_SYNC_ORDER') {
        const result = await fetchFromKds('/api/orders/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(message.payload)
        });
        sendResponse({ ok: result.ok, data: result.data });
        return;
      }

      if (message.type === 'KDS_QUICK_ADD') {
        const { orderId, payload } = message;
        const result = await fetchFromKds(`/api/orders/${encodeURIComponent(orderId)}/quick-add`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        sendResponse({ ok: result.ok, data: result.data });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      sendResponse({
        ok: false,
        error: `Cannot reach Kitchen Server on port 3000. (${err.message})`
      });
    }
  })();

  return true;
});
