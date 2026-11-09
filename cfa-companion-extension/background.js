// Background Service Worker for Chick-fil-A Kitchen KDS Companion
// Bridges https://order-management.cfahome.com to either a Cloud KDS URL (e.g. Railway) or http://localhost:3000

const DEFAULT_URLS = [
  'https://kds-production-9203.up.railway.app',
  'http://localhost:3000',
  'http://127.0.0.1:3000'
];

async function getStoredConfig() {
  try {
    const res = await chrome.storage.local.get(['kdsServerUrl', 'kdsApiKey']);
    return {
      serverUrl: (res.kdsServerUrl || '').trim().replace(/\/+$/, ''),
      apiKey: (res.kdsApiKey || '').trim()
    };
  } catch (e) {
    return { serverUrl: '', apiKey: '' };
  }
}

async function fetchFromKds(path, options = {}, overrideConfig = {}) {
  const stored = await getStoredConfig();
  const customUrl = (overrideConfig.serverUrl || stored.serverUrl || '').trim().replace(/\/+$/, '');
  const apiKey = (overrideConfig.apiKey !== undefined ? overrideConfig.apiKey : stored.apiKey || '').trim();

  const candidateUrls = customUrl ? [customUrl, ...DEFAULT_URLS] : DEFAULT_URLS;
  const headers = { ...(options.headers || {}) };
  if (apiKey) {
    headers['X-KDS-Key'] = apiKey;
  }

  let lastErr = null;
  for (const base of candidateUrls) {
    try {
      const res = await fetch(`${base}${path}`, { ...options, headers });
      const data = await res.json();
      return { ok: res.ok, status: res.status, data, baseUrl: base };
    } catch (err) {
      lastErr = err;
    }
  }
  throw lastErr || new Error('Could not connect to KDS Server');
}

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    try {
      const cfg = { serverUrl: message.serverUrl, apiKey: message.apiKey };

      if (message.type === 'KDS_SAVE_CONFIG') {
        await chrome.storage.local.set({
          kdsServerUrl: (message.serverUrl || '').trim().replace(/\/+$/, ''),
          kdsApiKey: (message.apiKey || '').trim()
        });
        sendResponse({ ok: true });
        return;
      }

      if (message.type === 'KDS_GET_ORDERS') {
        const result = await fetchFromKds('/api/orders', {}, cfg);
        sendResponse({ ok: result.ok, status: result.status, orders: result.data, baseUrl: result.baseUrl });
        return;
      }

      if (message.type === 'KDS_SYNC_ORDER') {
        const result = await fetchFromKds(
          '/api/orders/sync',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message.payload)
          },
          cfg
        );
        sendResponse({ ok: result.ok, status: result.status, data: result.data });
        return;
      }

      if (message.type === 'KDS_QUICK_ADD') {
        const { orderId, payload } = message;
        const result = await fetchFromKds(
          `/api/orders/${encodeURIComponent(orderId)}/quick-add`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          },
          cfg
        );
        sendResponse({ ok: result.ok, status: result.status, data: result.data });
        return;
      }

      sendResponse({ ok: false, error: 'Unknown message type' });
    } catch (err) {
      sendResponse({
        ok: false,
        error: `Cannot reach Kitchen Server. (${err.message})`
      });
    }
  })();

  return true;
});
