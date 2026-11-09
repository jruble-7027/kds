// Passive API Response Listener for https://order-management.cfahome.com
// Captures order details & menu items loaded by the CFA Order Management React/Angular app
(function () {
  'use strict';

  function broadcastCapturedData(url, data) {
    try {
      window.postMessage(
        {
          source: 'CFA_KDS_INTERCEPTOR',
          url,
          data
        },
        '*'
      );
    } catch (e) {
      // Ignore serialization errors
    }
  }

  // Hook window.fetch
  const origFetch = window.fetch;
  if (origFetch) {
    window.fetch = async function (...args) {
      const response = await origFetch.apply(this, args);
      try {
        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
        const contentType = response.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
          const clone = response.clone();
          clone.json().then((json) => {
            broadcastCapturedData(url, json);
          }).catch(() => {});
        }
      } catch (e) {}
      return response;
    };
  }

  // Hook XMLHttpRequest
  const origOpen = XMLHttpRequest.prototype.open;
  const origSend = XMLHttpRequest.prototype.send;

  XMLHttpRequest.prototype.open = function (method, url, ...rest) {
    this._cfaUrl = url;
    return origOpen.call(this, method, url, ...rest);
  };

  XMLHttpRequest.prototype.send = function (...args) {
    this.addEventListener('load', function () {
      try {
        const contentType = this.getResponseHeader('content-type') || '';
        if (contentType.includes('application/json') && this.responseText) {
          const json = JSON.parse(this.responseText);
          broadcastCapturedData(this._cfaUrl || '', json);
        }
      } catch (e) {}
    });
    return origSend.apply(this, args);
  };
})();
