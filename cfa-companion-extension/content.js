// Chick-fil-A Kitchen KDS Companion Content Script for https://order-management.cfahome.com/*
// Extracts:
// 1. Primary Contact Name & Cell Number
// 2. Pickup / Delivery Time
// 3. Delivery Address (if Delivery) & Special Instructions / Paper Goods
// 4. Strictly Food Items + Quantities listed under "Item Name" -> "Subtotal" (ignoring Price & Event Summary headers)

(function () {
  'use strict';

  if (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1') {
    return;
  }

  const oldRoot = document.getElementById('cfa-kds-companion-root');
  if (oldRoot) oldRoot.remove();

  let kdsOrders = [];
  let dashboardRowsData = [];
  let iframeRowsData = [];
  let scrapedPageItems = [];
  let lastAutoSyncedSignature = '';
  let isBulkCrawling = false;
  let isPanelOpen = true;

  const PROMISED_DATE_REGEX = /\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),\s+(?:[A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}\/\d{1,2}\/\d{2,4}),\s*\d{1,2}:\d{2}\s*[ap]m\b/i;
  const PROMISED_DATE_GLOBAL_REGEX = /\b(?:Mon(?:day)?|Tue(?:sday)?|Wed(?:nesday)?|Thu(?:rsday)?|Fri(?:day)?|Sat(?:urday)?|Sun(?:day)?),\s+(?:[A-Za-z]+\s+\d{1,2}(?:,\s*\d{4})?|\d{1,2}\/\d{1,2}\/\d{2,4}),\s*\d{1,2}:\d{2}\s*[ap]m\b/gi;

  // Dual-Transport KDS API Caller (Service Worker + Direct localhost/127.0.0.1 Fallback)
  async function callKdsApi(message) {
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
        const bgRes = await new Promise((resolve) => {
          chrome.runtime.sendMessage(message, (res) => {
            if (chrome.runtime.lastError) {
              resolve(null);
            } else {
              resolve(res);
            }
          });
        });
        if (bgRes && bgRes.ok) return bgRes;
      }
    } catch (e) {}

    const urls = ['http://localhost:3000', 'http://127.0.0.1:3000'];
    for (const base of urls) {
      try {
        if (message.type === 'KDS_GET_ORDERS') {
          const r = await fetch(`${base}/api/orders`);
          const orders = await r.json();
          if (r.ok) return { ok: true, orders, baseUrl: base };
        } else if (message.type === 'KDS_SYNC_ORDER') {
          const r = await fetch(`${base}/api/orders/sync`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message.payload)
          });
          const data = await r.json();
          if (r.ok) return { ok: true, data };
        } else if (message.type === 'KDS_QUICK_ADD') {
          const r = await fetch(`${base}/api/orders/${encodeURIComponent(message.orderId)}/quick-add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(message.payload)
          });
          const data = await r.json();
          if (r.ok) return { ok: true, data };
        }
      } catch (err) {}
    }

    return {
      ok: false,
      error: 'Could not reach Kitchen KDS on localhost:3000. Make sure server is running.'
    };
  }

  // Parses both "Friday, November 6, 6:30 am" AND "Saturday, 11/07/26, 7:00 AM"
  // Returns null if dateStr is empty or unparseable so existing KDS dates are never overwritten with Today!
  function parsePromisedDateToIso(dateStr) {
    if (!dateStr) return null;
    try {
      const cleaned = dateStr.replace(/^[A-Za-z]+,\s*/, '').trim();

      // Format 1: "11/07/26, 7:00 AM" or "11/07/2026, 7:00 AM"
      const slashMatch = cleaned.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4}),?\s*(\d{1,2}:\d{2}\s*[ap]m)$/i);
      if (slashMatch) {
        const month = Number(slashMatch[1]);
        const day = Number(slashMatch[2]);
        let year = Number(slashMatch[3]);
        if (year < 100) year += 2000;
        const parsed = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')} ${slashMatch[4]}`);
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
      }

      // Format 2: "November 6, 6:30 am" or "December 11, 8:30 pm"
      const currentYear = new Date().getFullYear();
      const wordMatch = cleaned.match(/^([A-Za-z]+\s+\d{1,2})(?:,\s*(\d{4}))?,?\s*(\d{1,2}:\d{2}\s*[ap]m)$/i);
      if (wordMatch) {
        const year = wordMatch[2] || currentYear;
        const parsed = new Date(`${wordMatch[1]}, ${year} ${wordMatch[3]}`);
        if (!isNaN(parsed.getTime())) return parsed.toISOString();
      }

      const fallback = new Date(dateStr);
      if (!isNaN(fallback.getTime())) return fallback.toISOString();
    } catch (e) {}
    return null;
  }

  function buildOrderCode(guestName, promisedDateStr) {
    const initials = (guestName || 'CFA')
      .split(/\s+/)
      .map((w) => w[0] || '')
      .join('')
      .toUpperCase()
      .slice(0, 3);
    const timeMatch = (promisedDateStr || '').match(/(\d{1,2}):(\d{2})\s*([ap]m)/i);
    if (timeMatch) {
      return `#CFA-${initials}-${timeMatch[1]}${timeMatch[2]}${timeMatch[3][0].toUpperCase()}`;
    }
    return `#CFA-${initials}`;
  }

  function cleanGuestName(raw) {
    if (!raw) return '';
    return raw
      .replace(
        /\b(Guest\s*Name|Promised\s*Date|Method|Total|Payment\s*Status|Source|Upcoming|Past|Orders|Search\s*guest\s*name|Select\s*Date\s*Range|Payment|Received|Pending|Catering|Management|Tool|Mobile|App|Web|Pickup|Delivery|Curbside|Paid|Unpaid|Invoiced)\b/gi,
        ''
      )
      .replace(/\$[\d,.]+/g, '')
      .replace(/^[^A-Za-z]+/g, '')
      .replace(/\b[V]\b\s*/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function parseRowBlockText(blockText) {
    const normalized = blockText.replace(/\r/g, '\n').replace(/\t/g, '\n');
    const dateMatch = normalized.match(PROMISED_DATE_REGEX);
    if (!dateMatch) return null;

    const promisedDate = dateMatch[0].replace(/\s+/g, ' ').trim();
    const dateIdx = normalized.indexOf(dateMatch[0]);

    const beforeDate = normalized.slice(0, dateIdx);
    const afterDate = normalized.slice(dateIdx + dateMatch[0].length);

    const beforeLines = beforeDate
      .split('\n')
      .map((l) => cleanGuestName(l))
      .filter((l) => l.length >= 2 && /[A-Za-z]{2,}/.test(l));

    let guestName = '';
    if (
      beforeLines.length >= 2 &&
      !beforeLines[beforeLines.length - 2].includes(' ') &&
      !beforeLines[beforeLines.length - 1].includes(' ')
    ) {
      guestName = `${beforeLines[beforeLines.length - 2]} ${beforeLines[beforeLines.length - 1]}`;
    } else if (beforeLines.length > 0) {
      guestName = beforeLines[beforeLines.length - 1];
    }
    guestName = cleanGuestName(guestName);
    if (!guestName || guestName.length < 2) return null;

    const methodMatch = afterDate.match(/\b(Pickup|Delivery|Curbside|Dine-In)\b/i);
    const totalMatch = afterDate.match(/\$\d[\d,]*\.\d{2}/);
    const paymentMatch = afterDate.match(/\b(Payment\s+Received|Payment\s+Pending|Paid|Unpaid|Invoiced|House\s+Account)\b/i);
    const sourceMatch = afterDate.match(/\b(Catering\s+Management\s+Tool|Mobile\s+App|Web|One\s+App|Phone|POS)\b/i);

    const method = methodMatch ? (/delivery/i.test(methodMatch[1]) ? 'Delivery' : 'Pickup') : 'Pickup';
    const total = totalMatch ? totalMatch[0] : '';
    const paymentStatus = paymentMatch ? paymentMatch[0].replace(/\s+/g, ' ') : 'Payment Received';
    const source = sourceMatch ? sourceMatch[0].replace(/\s+/g, ' ') : 'CFA Home';

    return {
      guestName,
      promisedDate,
      pickupIso: parsePromisedDateToIso(promisedDate),
      method,
      total,
      paymentStatus,
      source,
      orderNumber: buildOrderCode(guestName, promisedDate)
    };
  }

  // Precision Parser for the Open Order Modal on order-management.cfahome.com:
  // 1. Reads Event Summary header fields: Pickup/Delivery Time, Primary Contact Name & Cell #, Delivery Address (if Delivery), Special Instructions
  // 2. Reads Food Items + Quantities strictly between "Item Name" ("Quantity" / "Price") and "Subtotal" (ignoring Price!)
  function parseOpenOrderSummary(rawPageText) {
    const text = (rawPageText || (document.body ? document.body.innerText : ''))
      .replace(root ? root.innerText || '' : '');

    if (!/Item\s+Name/i.test(text) || !/Subtotal/i.test(text)) {
      return null;
    }

    const itemNameHeaderIdx = text.search(/Item\s+Name/i);
    const subtotalIdx = text.search(/Subtotal/i);
    if (itemNameHeaderIdx === -1 || subtotalIdx === -1 || subtotalIdx <= itemNameHeaderIdx) {
      return null;
    }

    // --- PART 1: Parse Header Metadata (Before "Order Summary" / "Item Name") ---
    const headerSection = text.slice(Math.max(0, itemNameHeaderIdx - 1200), itemNameHeaderIdx);

    let guestName = '';
    let contactPhone = '';
    let pickupTimeStr = '';
    let orderType = 'Pickup';
    let deliveryAddress = '';
    let specialInstructions = '';
    let paperGoodsNote = '';

    // A) Extract Pickup Time or Delivery Time (e.g. "Saturday, 11/07/26, 7:00 AM" or "Friday, December 11, 8:30 pm")
    const timeMatch = headerSection.match(
      /\b(Pickup|Delivery|Promised|Event)\s+(?:Date\s*(?:&|and)?\s*)?(?:Time|Date)\s*[\r\n:]+\s*([^\r\n]+)/i
    );
    if (timeMatch) {
      if (/delivery/i.test(timeMatch[1])) orderType = 'Delivery';
      pickupTimeStr = timeMatch[2].trim();
    } else {
      const anyHeaderDateMatch = headerSection.match(PROMISED_DATE_REGEX);
      if (anyHeaderDateMatch) {
        pickupTimeStr = anyHeaderDateMatch[0].replace(/\s+/g, ' ').trim();
      }
    }

    // B) Extract Primary Contact Name & Cell Number (strictly between "Primary Contact" and "Pickup Restaurant" / "Delivery Address" / "Guest Count")
    const contactBlockMatch = headerSection.match(
      /Primary\s+Contact\s*[\r\n:]+([\s\S]+?)(?=Pickup\s+Restaurant|Delivery\s+Address|Delivery\s+Location|Guest\s+Count|Order\s+Summary|$)/i
    );
    if (contactBlockMatch) {
      const contactBlock = contactBlockMatch[1];
      const contactLines = contactBlock
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);

      if (contactLines.length > 0) {
        guestName = contactLines[0];
      }

      const phoneMatch = contactBlock.match(/\(?\d{3}\)?[-.\s]\d{3}[-.\s]\d{4}/);
      if (phoneMatch) {
        contactPhone = phoneMatch[0].trim();
      }
    }

    // Fallback for Guest Name from modal title right above "Payment Received" (for POS / CMT orders without "Primary Contact" block)
    if (!guestName) {
      const headerLines = headerSection
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean);
      for (let i = 0; i < headerLines.length; i++) {
        if (/^(?:✓\s*)?Payment\s+(?:Received|Pending|Status)/i.test(headerLines[i]) && i > 0) {
          const candidate = headerLines[i - 1].replace(/^[✓×✕\s]+/, '').trim();
          if (candidate.length >= 2 && candidate.length <= 45 && !/Source|Total|Method|Event\s+Summary/i.test(candidate)) {
            guestName = candidate;
          }
        }
      }
    }

    // C) Extract Delivery Address ONLY if this is a Delivery (ignore "Pickup Restaurant: Peace Haven...")
    const deliveryMatch = headerSection.match(
      /Delivery\s+(?:Address|Location)\s*[\r\n:]+([\s\S]+?)(?=Guest\s+Count|Catering\s+Occasion|Special\s+Instructions|Paper\s+Goods|Order\s+Summary|$)/i
    );
    if (deliveryMatch) {
      orderType = 'Delivery';
      deliveryAddress = deliveryMatch[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^None$/i.test(l))
        .join(', ');
    }

    // D) Extract Special Instructions (ignore "None" and stop before Secondary Contact / Paper Goods)
    const specialMatch = headerSection.match(
      /Special\s+Instructions\s*[\r\n:]+([\s\S]+?)(?=Secondary\s+Contact|Paper\s+Goods|Order\s+Summary|$)/i
    );
    if (specialMatch) {
      const cleanedSpecial = specialMatch[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^None$/i.test(l))
        .join(' ');
      if (cleanedSpecial) {
        specialInstructions = cleanedSpecial;
      }
    }

    // E) Extract Paper Goods request (or standalone note above Order Summary like Phil Ziesemer's "Please include plates, cutlery, napkins and cups.")
    const paperMatch = headerSection.match(
      /Paper\s+Goods\s*[\r\n:]+([\s\S]+?)(?=Secondary\s+Contact|Order\s+Summary|$)/i
    );
    if (paperMatch) {
      const cleanedPaper = paperMatch[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter((l) => l && !/^None$/i.test(l))
        .join(' ');
      if (cleanedPaper) {
        paperGoodsNote = cleanedPaper;
      }
    } else if (!/Event\s+Summary/i.test(headerSection)) {
      // For simple modals (like Phil Ziesemer's screenshot) that only have "Please include plates, cutlery, napkins and cups." above Order Summary
      const simpleNoteMatch = headerSection.match(/(Please\s+(?:include|do\s+not\s+include)[^\r\n]+)/i);
      if (simpleNoteMatch) {
        paperGoodsNote = simpleNoteMatch[1].trim();
      }
    }

    // Combine Special Instructions & Paper Goods cleanly for the Kitchen Note banner
    const notesArray = [];
    if (specialInstructions) notesArray.push(specialInstructions);
    if (paperGoodsNote) notesArray.push(paperGoodsNote);
    const combinedSpecialNotes = notesArray.join(' • ');

    // --- PART 2: Parse Food Items & Quantities strictly between "Item Name" ("Price") and "Subtotal" ---
    let itemsSection = text.slice(itemNameHeaderIdx, subtotalIdx);
    // Strip the table column headers: "Item Name", "Quantity", "Price"
    itemsSection = itemsSection
      .replace(/^Item\s+Name[\s\r\n]+Quantity[\s\r\n]+Price/i, '')
      .replace(/\b(Item\s+Name|Quantity|Price)\b/gi, '')
      .trim();

    const items = [];
    // Every item in Order Summary has: <Item Name> <Quantity> <Price ($xx.xx or Free)>
    // Matching both "$xx.xx" and "Free" as the end-of-item delimiter separates sauces, modifiers, and trays cleanly, and discards the price!
    const itemRegex = /([\s\S]+?)\s+(\d{1,4})\s+(?:\$\d[\d,]*\.\d{2}|\bFree\b)/gi;
    let match;
    while ((match = itemRegex.exec(itemsSection)) !== null) {
      const rawName = match[1]
        .split(/\r?\n/)
        .map((l) => l.trim())
        .filter(Boolean)
        .join(' ');
      const qty = Number(match[2]) || 1;

      if (rawName && rawName.length >= 2) {
        // Categorize Sauces/Dressings vs Food & Menu
        const isSauceOrPaper = /(Sauce|Dressing|Jam|Honey|Syrup|Ketchup|Mayo|Mustard|Pickles|Utensil|Plate|Napkin|Ice)/i.test(rawName) && !/(Tray|Sandwich|Biscuit|Meal|Wrap|Nugget|Strip|Minis)/i.test(rawName);
        items.push({
          name: rawName,
          quantity: qty,
          category: isSauceOrPaper ? 'Sauces & Condiments' : 'Food & Menu',
          unit: 'count'
        });
      }
    }

    return {
      guestName,
      contactPhone,
      pickupTimeStr,
      orderType,
      deliveryAddress,
      specialNotes: combinedSpecialNotes,
      items
    };
  }

  // Root UI Container
  const root = document.createElement('div');
  root.id = 'cfa-kds-companion-root';
  root.innerHTML = `
    <div id="cfa-kds-panel" class="cfa-kds-panel">
      <div class="cfa-kds-header">
        <div class="cfa-kds-header-title">
          <strong>🐔 CFA Kitchen KDS Companion</strong>
          <span id="cfa-kds-conn-text">Connecting to Kitchen Touchscreen...</span>
        </div>
        <button id="cfa-kds-minimize" class="cfa-kds-close-btn" title="Minimize">−</button>
      </div>

      <div class="cfa-kds-body">
        <div id="cfa-kds-toast" class="cfa-kds-toast"></div>

        <!-- Bulk Dashboard Sync Banner -->
        <div id="cfa-kds-bulk-box" class="cfa-kds-section" style="background: #EFF6FF; border-color: #BFDBFE;">
          <div class="cfa-kds-section-title" style="color: #1E40AF; margin-bottom: 6px;">
            <span>📋 CFA Dashboard Orders Found: <strong id="cfa-kds-upcoming-count">0</strong></span>
            <button id="cfa-kds-scan-btn" class="cfa-kds-secondary-btn">🔄 Re-Scan</button>
          </div>
          <button id="cfa-kds-sync-all-btn" class="cfa-kds-sync-all-btn">
            📥 Sync All Orders + Food Details to Kitchen KDS
          </button>
        </div>

        <!-- Section 1: Selected Guest Order -->
        <div class="cfa-kds-section">
          <div class="cfa-kds-section-title">
            <span>1. Primary Contact & Pickup Info</span>
            <span id="cfa-kds-promised-badge" style="font-size: 10.5px; color: #E5173F; font-weight: 700;"></span>
          </div>

          <div style="margin-bottom: 8px;">
            <select id="cfa-kds-existing-select" class="cfa-kds-select">
              <option value="__new__">Select a Guest from Dashboard or KDS...</option>
            </select>
          </div>

          <div class="cfa-kds-field-row">
            <input id="cfa-kds-customer" class="cfa-kds-input" placeholder="Primary Contact Name" />
            <input id="cfa-kds-phone" class="cfa-kds-input" placeholder="Cell # (e.g. 336-345-1221)" />
          </div>

          <div class="cfa-kds-field-row" style="margin-bottom: 0;">
            <input id="cfa-kds-promised" class="cfa-kds-input" placeholder="Pickup / Delivery Time" />
            <select id="cfa-kds-type" class="cfa-kds-select">
              <option value="Pickup">Pickup</option>
              <option value="Delivery">Delivery</option>
            </select>
          </div>
          <input id="cfa-kds-order-num" type="hidden" />
        </div>

        <!-- Detected Order Summary Food Items (Auto-populated when an order is opened!) -->
        <div id="cfa-kds-detected-items-box" class="cfa-kds-section" style="background: #ECFDF5; border-color: #A7F3D0; display: none;">
          <div class="cfa-kds-section-title" style="color: #047857; margin-bottom: 4px;">
            <span>🍗 Item Name & Quantity (<span id="cfa-kds-detected-count">0</span>)</span>
            <span style="font-size: 10px; color: #059669;">✓ Synced to KDS</span>
          </div>
          <div id="cfa-kds-detected-list" style="font-size: 12px; color: #065F46; max-height: 100px; overflow-y: auto;"></div>
        </div>

        <!-- Section 2: 1-Click Phone Call / Sauce Additions (Flashes Kitchen Red) -->
        <div class="cfa-kds-section">
          <div class="cfa-kds-section-title">
            <span>2. Instant Add & Flash Kitchen Red 🚨</span>
          </div>
          <div class="cfa-kds-presets">
            <button class="cfa-kds-preset-btn" data-name="Barbeque Sauce Packets" data-qty="50" data-cat="Sauces" data-unit="Packets">⚡ +50 BBQ Sauces</button>
            <button class="cfa-kds-preset-btn" data-name="Chick-fil-A® Sauce Packets" data-qty="50" data-cat="Sauces" data-unit="Packets">⚡ +50 CFA Sauces</button>
            <button class="cfa-kds-preset-btn" data-name="Polynesian Sauce Packets" data-qty="25" data-cat="Sauces" data-unit="Packets">⚡ +25 Polynesian</button>
            <button class="cfa-kds-preset-btn" data-name="Garden Herb Ranch Packets" data-qty="25" data-cat="Sauces" data-unit="Packets">⚡ +25 Ranch</button>
            <button class="cfa-kds-preset-btn" data-name="Sweet Tea Gallon" data-qty="2" data-cat="Beverages" data-unit="Gallons">⚡ +2 Gal Sweet Tea</button>
            <button class="cfa-kds-preset-btn" data-name="Serving Utensils & Plates Kit" data-qty="25" data-cat="Paper Goods" data-unit="Sets">⚡ +25 Plates/Utensils</button>
          </div>
        </div>

        <!-- Section 3: Custom Item or Urgent Kitchen Alert Note -->
        <div class="cfa-kds-section">
          <div class="cfa-kds-section-title">
            <span>3. Custom Addition / Kitchen Flash Note</span>
          </div>
          <div class="cfa-kds-field-row">
            <input id="cfa-kds-custom-item" class="cfa-kds-input" placeholder="Item (e.g. Cookie Tray)" />
            <input id="cfa-kds-custom-qty" type="number" min="1" value="1" class="cfa-kds-input" placeholder="Qty" />
          </div>
          <textarea id="cfa-kds-note" class="cfa-kds-textarea" placeholder="Urgent kitchen note (e.g. Guest called to add 50 BBQ sauces)..."></textarea>
          <button id="cfa-kds-send-btn" class="cfa-kds-primary-btn" style="margin-top: 8px;">
            🚨 Send to Kitchen KDS (Flash Red)
          </button>
        </div>
      </div>
    </div>

    <button id="cfa-kds-fab" class="cfa-kds-fab" title="Open Chick-fil-A Kitchen KDS Companion">
      <span id="cfa-kds-dot" class="cfa-kds-status-dot"></span>
      <span>🐔 Kitchen KDS Sync</span>
    </button>
  `;

  document.body.appendChild(root);

  const panel = document.getElementById('cfa-kds-panel');
  const fab = document.getElementById('cfa-kds-fab');
  const minimizeBtn = document.getElementById('cfa-kds-minimize');
  const scanBtn = document.getElementById('cfa-kds-scan-btn');
  const syncAllBtn = document.getElementById('cfa-kds-sync-all-btn');
  const upcomingCountEl = document.getElementById('cfa-kds-upcoming-count');
  const existingSelect = document.getElementById('cfa-kds-existing-select');
  const orderNumInput = document.getElementById('cfa-kds-order-num');
  const customerInput = document.getElementById('cfa-kds-customer');
  const phoneInput = document.getElementById('cfa-kds-phone');
  const promisedInput = document.getElementById('cfa-kds-promised');
  const promisedBadge = document.getElementById('cfa-kds-promised-badge');
  const typeSelect = document.getElementById('cfa-kds-type');
  const customItemInput = document.getElementById('cfa-kds-custom-item');
  const customQtyInput = document.getElementById('cfa-kds-custom-qty');
  const noteInput = document.getElementById('cfa-kds-note');
  const sendBtn = document.getElementById('cfa-kds-send-btn');
  const toast = document.getElementById('cfa-kds-toast');
  const connText = document.getElementById('cfa-kds-conn-text');
  const statusDot = document.getElementById('cfa-kds-dot');
  const detectedBox = document.getElementById('cfa-kds-detected-items-box');
  const detectedCount = document.getElementById('cfa-kds-detected-count');
  const detectedList = document.getElementById('cfa-kds-detected-list');

  function showToast(msg, type = 'success') {
    toast.textContent = msg;
    toast.className = `cfa-kds-toast ${type}`;
    setTimeout(() => {
      toast.className = 'cfa-kds-toast';
    }, 6500);
  }

  minimizeBtn.addEventListener('click', () => {
    isPanelOpen = false;
    panel.classList.add('hidden');
  });

  fab.addEventListener('click', () => {
    isPanelOpen = !isPanelOpen;
    panel.classList.toggle('hidden', !isPanelOpen);
    if (isPanelOpen) {
      refreshKdsOrders();
      scanCfaDashboardAndTabs();
    }
  });

  function selectGuestOrder(rowObj, rowElement = null) {
    document.querySelectorAll('.cfa-kds-row-selected').forEach((el) => {
      el.classList.remove('cfa-kds-row-selected');
    });
    if (rowElement) {
      rowElement.classList.add('cfa-kds-row-selected');
    }

    customerInput.value = rowObj.guestName || '';
    orderNumInput.value = rowObj.orderNumber || buildOrderCode(rowObj.guestName, rowObj.promisedDate);
    promisedInput.value = rowObj.promisedDate || '';
    promisedBadge.textContent = rowObj.orderNumber || '';
    typeSelect.value = /delivery/i.test(rowObj.method) ? 'Delivery' : 'Pickup';

    const existingKds = kdsOrders.find(
      (o) =>
        o.customer_name.toLowerCase() === (rowObj.guestName || '').toLowerCase() ||
        o.order_number.toLowerCase() === (orderNumInput.value || '').toLowerCase()
    );
    if (existingKds) {
      existingSelect.value = existingKds.id;
      orderNumInput.value = existingKds.order_number;
      if (existingKds.customer_phone) phoneInput.value = existingKds.customer_phone;
    }

    if (!isPanelOpen) {
      isPanelOpen = true;
      panel.classList.remove('hidden');
    }
  }

  function findClickableElementForGuest(guestName) {
    if (!guestName || !document.body) return null;
    const lowerTarget = guestName.toLowerCase();
    const parts = lowerTarget.split(/\s+/).filter(Boolean);

    const candidates = Array.from(document.body.querySelectorAll('tr, [role="row"], td, [role="cell"], a, span, div'));
    for (const el of candidates) {
      if (root.contains(el)) continue;
      const t = (el.innerText || '').replace(/\s+/g, ' ').trim().toLowerCase();
      if (t === lowerTarget || (parts.length >= 2 && t.includes(parts[0]) && t.includes(parts[1]) && t.length < 40)) {
        return el;
      }
    }
    return null;
  }

  function scanCfaDashboardAndTabs() {
    const parsedRows = [];
    const seenKeys = new Set();

    // Strategy A: DOM elements containing 1 Promised Date
    const allElements = Array.from(document.body.querySelectorAll('tr, [role="row"], li, div'));
    for (const el of allElements) {
      if (root.contains(el)) continue;
      const text = el.innerText || '';
      if (text.length < 15 || text.length > 450) continue;
      if (/Event\s+Summary|Transaction\s+ID/i.test(text)) continue;

      const dateMatches = text.match(PROMISED_DATE_GLOBAL_REGEX);
      if (!dateMatches || dateMatches.length !== 1) continue;
      if (!/\$\d|\b(Pickup|Delivery)\b/i.test(text)) continue;

      const parsed = parseRowBlockText(text);
      if (!parsed) continue;

      const uniqueKey = `${parsed.guestName.toLowerCase()}|${parsed.promisedDate.toLowerCase()}`;
      if (seenKeys.has(uniqueKey)) continue;
      seenKeys.add(uniqueKey);
      parsed.domElement = el;
      parsedRows.push(parsed);

      if (el.tagName === 'TR' && !el.querySelector('.cfa-kds-row-action-cell')) {
        const actionCell = document.createElement('td');
        actionCell.className = 'cfa-kds-row-action-cell';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'cfa-kds-row-btn';
        btn.innerHTML = '⚡ Kitchen KDS';
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
          selectGuestOrder(parsed, el);
          showToast(`Selected ${parsed.guestName} (${parsed.promisedDate}) — Tap a preset to flash Kitchen!`);
        });
        actionCell.appendChild(btn);
        el.appendChild(actionCell);
      }
    }

    // Strategy B: Full-Page Text Scanner around Dashboard Promised Dates (ignoring modal Event Summary)
    if (document.body) {
      let fullText = (document.body.innerText || '').replace(root.innerText || '', '');
      // Strip open modal section if present so we don't confuse modal header with dashboard table rows
      const eventSumIdx = fullText.search(/Event\s+Summary/i);
      const orderSumIdx = fullText.search(/Order\s+Summary/i);
      const cutIdx = eventSumIdx !== -1 ? eventSumIdx : orderSumIdx;
      const tableOnlyText = cutIdx !== -1 ? fullText.slice(0, cutIdx) : fullText;

      const matches = Array.from(tableOnlyText.matchAll(PROMISED_DATE_GLOBAL_REGEX));
      for (let i = 0; i < matches.length; i++) {
        const match = matches[i];
        const dateIndex = match.index;
        const prevEnd = i > 0 ? matches[i - 1].index + matches[i - 1][0].length : Math.max(0, dateIndex - 200);
        const nextStart = i + 1 < matches.length ? matches[i + 1].index : Math.min(tableOnlyText.length, dateIndex + 250);

        const beforeChunk = tableOnlyText.slice(Math.max(prevEnd, dateIndex - 140), dateIndex);
        const afterChunk = tableOnlyText.slice(dateIndex, Math.min(nextStart, dateIndex + 180));
        const combinedChunk = beforeChunk + afterChunk;

        const parsed = parseRowBlockText(combinedChunk);
        if (parsed) {
          const uniqueKey = `${parsed.guestName.toLowerCase()}|${parsed.promisedDate.toLowerCase()}`;
          if (!seenKeys.has(uniqueKey)) {
            seenKeys.add(uniqueKey);
            parsed.domElement = findClickableElementForGuest(parsed.guestName);
            parsedRows.push(parsed);
          }
        }
      }
    }

    for (const r of iframeRowsData) {
      const uniqueKey = `${r.guestName.toLowerCase()}|${r.promisedDate.toLowerCase()}`;
      if (!seenKeys.has(uniqueKey)) {
        seenKeys.add(uniqueKey);
        parsedRows.push(r);
      }
    }

    if (window !== window.top) {
      root.style.display = 'none';
      if (parsedRows.length > 0) {
        window.top.postMessage({ source: 'CFA_KDS_IFRAME_ROWS', rows: parsedRows }, '*');
      }
      return parsedRows;
    }

    dashboardRowsData = parsedRows;
    upcomingCountEl.textContent = String(parsedRows.length);
    if (!isBulkCrawling) {
      syncAllBtn.textContent =
        parsedRows.length > 0
          ? `📥 Sync All (${parsedRows.length}) Orders + Food Details to KDS`
          : `📥 Sync All Orders + Food Details to KDS`;
    }

    if (parsedRows.length > 0 && !customerInput.value) {
      selectGuestOrder(parsedRows[0]);
    }

    checkAndAutoSyncOpenOrderSummary();
    rebuildDropdownOptions();
    return parsedRows;
  }

  // Whenever an Order Summary modal is open, extract Primary Contact, Cell #, Pickup Time, Delivery Address, Special Instructions, and Item Name + Quantity
  async function checkAndAutoSyncOpenOrderSummary() {
    const summaryData = parseOpenOrderSummary();
    if (!summaryData || summaryData.items.length === 0) {
      detectedBox.style.display = 'none';
      return null;
    }

    scrapedPageItems = summaryData.items;
    detectedBox.style.display = 'block';
    detectedCount.textContent = String(summaryData.items.length);
    detectedList.innerHTML = summaryData.items
      .map((i) => `<div>• <strong>${i.quantity}x</strong> ${i.name}</div>`)
      .join('');

    const activeGuest = summaryData.guestName || customerInput.value.trim();
    const matchedRow = dashboardRowsData.find(
      (r) => activeGuest && r.guestName.toLowerCase() === activeGuest.toLowerCase()
    );
    const matchedKds = kdsOrders.find(
      (o) => activeGuest && o.customer_name.toLowerCase() === activeGuest.toLowerCase()
    );

    // Never fall back to promisedInput.value if it belongs to a different guest!
    const finalTimeStr = summaryData.pickupTimeStr || (matchedRow ? matchedRow.promisedDate : '');
    const finalPickupIso =
      parsePromisedDateToIso(finalTimeStr) ||
      (matchedRow ? matchedRow.pickupIso : null) ||
      (matchedKds ? matchedKds.pickup_time : null);

    const finalOrderNum = matchedRow
      ? matchedRow.orderNumber
      : matchedKds
      ? matchedKds.order_number
      : buildOrderCode(activeGuest, finalTimeStr);
    const finalType =
      summaryData.orderType && summaryData.orderType !== 'Pickup'
        ? summaryData.orderType
        : matchedRow
        ? matchedRow.method
        : matchedKds
        ? matchedKds.order_type
        : typeSelect.value;

    if (activeGuest) customerInput.value = activeGuest;
    if (summaryData.contactPhone) phoneInput.value = summaryData.contactPhone;
    if (finalTimeStr) promisedInput.value = finalTimeStr;
    if (finalOrderNum) {
      orderNumInput.value = finalOrderNum;
      promisedBadge.textContent = finalOrderNum;
    }
    typeSelect.value = finalType;

    const sig = `${activeGuest}|${finalOrderNum}|${summaryData.items.map((i) => `${i.quantity}:${i.name}`).join(',')}`;
    if (!isBulkCrawling && activeGuest && sig !== lastAutoSyncedSignature) {
      lastAutoSyncedSignature = sig;

      const res = await callKdsApi({
        type: 'KDS_SYNC_ORDER',
        payload: {
          order_number: finalOrderNum,
          customer_name: activeGuest,
          customer_phone: summaryData.contactPhone || '',
          organization: summaryData.deliveryAddress || '',
          pickup_time: finalPickupIso,
          order_type: finalType,
          special_notes: summaryData.specialNotes || '',
          items: summaryData.items,
          flash_kitchen: false,
          sync_mode: 'sync',
          submitted_by: 'CFA Home Order Summary Auto-Sync'
        }
      });

      if (res && res.ok) {
        showToast(
          `✓ Synced ${activeGuest} (${summaryData.items.length} food items) to Kitchen KDS!`,
          'success'
        );
        await refreshKdsOrders();
      }
    }

    return summaryData;
  }

  window.addEventListener('message', (e) => {
    if (e.data && e.data.source === 'CFA_KDS_IFRAME_ROWS' && Array.isArray(e.data.rows)) {
      iframeRowsData = e.data.rows;
      scanCfaDashboardAndTabs();
    }
  });

  function rebuildDropdownOptions() {
    const currentVal = existingSelect.value;
    existingSelect.innerHTML = `<option value="__new__">➕ Sync Selected CFA Home Guest Order</option>`;

    if (dashboardRowsData.length > 0) {
      const dashGroup = document.createElement('optgroup');
      dashGroup.label = `📋 On CFA Home Dashboard (${dashboardRowsData.length})`;
      dashboardRowsData.forEach((r, idx) => {
        const opt = document.createElement('option');
        opt.value = `dash_${idx}`;
        opt.textContent = `${r.guestName} — ${r.promisedDate} (${r.method})`;
        dashGroup.appendChild(opt);
      });
      existingSelect.appendChild(dashGroup);
    }

    if (kdsOrders.length > 0) {
      const kdsGroup = document.createElement('optgroup');
      kdsGroup.label = `🍳 Active on Kitchen Touchscreen (${kdsOrders.length})`;
      kdsOrders.forEach((o) => {
        const opt = document.createElement('option');
        opt.value = o.id;
        opt.textContent = `${o.order_number} — ${o.customer_name} (${o.order_type})`;
        kdsGroup.appendChild(opt);
      });
      existingSelect.appendChild(kdsGroup);
    }

    if (currentVal && Array.from(existingSelect.options).some((o) => o.value === currentVal)) {
      existingSelect.value = currentVal;
    }
  }

  existingSelect.addEventListener('change', () => {
    const val = existingSelect.value;
    if (val.startsWith('dash_')) {
      const idx = Number(val.replace('dash_', ''));
      if (dashboardRowsData[idx]) {
        selectGuestOrder(dashboardRowsData[idx]);
      }
      return;
    }
    const found = kdsOrders.find((o) => o.id === val);
    if (found) {
      customerInput.value = found.customer_name || '';
      phoneInput.value = found.customer_phone || '';
      orderNumInput.value = found.order_number || '';
      promisedBadge.textContent = found.order_number || '';
      promisedInput.value = new Date(found.pickup_time).toLocaleString();
      typeSelect.value = found.order_type || 'Pickup';
    }
  });

  async function refreshKdsOrders() {
    const res = await callKdsApi({ type: 'KDS_GET_ORDERS' });
    if (!res || !res.ok) {
      connText.textContent = '⚠️ Kitchen Server Offline (Run start.bat)';
      statusDot.classList.add('offline');
      return;
    }
    connText.textContent = `✓ Kitchen Live (${res.orders.length} orders on KDS)`;
    statusDot.classList.remove('offline');
    kdsOrders = res.orders || [];
    rebuildDropdownOptions();
  }

  // Wait for the Order Summary modal to actually display the target guest's Primary Contact name
  function waitForGuestSummary(guestName, timeoutMs = 1500) {
    return new Promise((resolve) => {
      const start = Date.now();
      const targetLower = guestName.toLowerCase();
      const timer = setInterval(() => {
        const parsed = parseOpenOrderSummary();
        if (
          parsed &&
          parsed.items.length > 0 &&
          parsed.guestName &&
          parsed.guestName.toLowerCase() === targetLower
        ) {
          clearInterval(timer);
          resolve(parsed);
          return;
        }
        if (Date.now() - start >= timeoutMs) {
          clearInterval(timer);
          // Only return if guestName matches or wasn't another guest's leftover modal!
          if (parsed && (!parsed.guestName || parsed.guestName.toLowerCase() === targetLower)) {
            resolve(parsed);
          } else {
            resolve(null);
          }
        }
      }, 150);
    });
  }

  // Sync ALL Upcoming Orders + Automatically open each Order Summary to pull Food & Quantities!
  syncAllBtn.addEventListener('click', async () => {
    const rows = scanCfaDashboardAndTabs();
    if (rows.length === 0) {
      const openSummary = await checkAndAutoSyncOpenOrderSummary();
      if (openSummary) return;
      showToast('No Upcoming order rows found on page.', 'error');
      return;
    }

    isBulkCrawling = true;
    syncAllBtn.disabled = true;

    let syncedCount = 0;
    let itemsCapturedCount = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      syncAllBtn.textContent = `⏳ Reading Food (${i + 1}/${rows.length}): ${row.guestName}...`;

      const clickTarget = findClickableElementForGuest(row.guestName) || row.domElement;
      if (clickTarget && typeof clickTarget.click === 'function') {
        try {
          clickTarget.click();
        } catch (e) {}
      }

      const summary = await waitForGuestSummary(row.guestName, 1200);
      const orderItems = summary && summary.items ? summary.items : [];
      if (orderItems.length > 0) itemsCapturedCount += orderItems.length;

      const finalTimeStr = (summary && summary.pickupTimeStr) || row.promisedDate;
      const finalType = (summary && summary.orderType) || row.method;

      const res = await callKdsApi({
        type: 'KDS_SYNC_ORDER',
        payload: {
          order_number: row.orderNumber,
          customer_name: (summary && summary.guestName) || row.guestName,
          customer_phone: (summary && summary.contactPhone) || '',
          organization: (summary && summary.deliveryAddress) || '',
          pickup_time: parsePromisedDateToIso(finalTimeStr),
          order_type: finalType,
          special_notes: (summary && summary.specialNotes) || '',
          items: orderItems,
          flash_kitchen: false,
          sync_mode: 'sync',
          submitted_by: 'CFA Home Dashboard Deep-Sync'
        }
      });

      if (res && res.ok) syncedCount++;
    }

    isBulkCrawling = false;
    syncAllBtn.disabled = false;
    syncAllBtn.textContent = `📥 Sync All (${rows.length}) Orders + Food Details to KDS`;

    showToast(
      `✓ Synced ${syncedCount} orders (${itemsCapturedCount} food items) to Kitchen KDS!`,
      'success'
    );
    await refreshKdsOrders();
  });

  scanBtn.addEventListener('click', async () => {
    const rows = scanCfaDashboardAndTabs();
    const summary = await checkAndAutoSyncOpenOrderSummary();
    if (summary && summary.items.length > 0) {
      showToast(`✓ Synced ${summary.guestName || 'Guest'}: ${summary.items.length} food items to KDS!`);
    } else {
      showToast(`✓ Detected ${rows.length} Upcoming guest orders on Dashboard`);
    }
  });

  async function dispatchToKitchen({ items = [], customNote = '', flashKitchen = true }) {
    const customerName = customerInput.value.trim() || 'CFA Catering Guest';
    const customerPhone = phoneInput.value.trim();
    const promisedStr = promisedInput.value.trim();
    const orderNumber = orderNumInput.value.trim() || buildOrderCode(customerName, promisedStr);
    const orderType = typeSelect.value;

    const selectedVal = existingSelect.value;
    const matchedKdsOrder =
      kdsOrders.find((o) => o.id === selectedVal) ||
      kdsOrders.find(
        (o) =>
          o.order_number.toLowerCase() === orderNumber.toLowerCase() ||
          o.customer_name.toLowerCase() === customerName.toLowerCase()
      );

    if (matchedKdsOrder && items.length + customNote.length > 0) {
      const res = await callKdsApi({
        type: 'KDS_QUICK_ADD',
        orderId: matchedKdsOrder.id,
        payload: {
          items,
          urgency: flashKitchen ? 'urgent' : 'normal',
          custom_note: customNote,
          submitted_by: 'CFA Home Dashboard'
        }
      });
      if (res && res.ok) {
        showToast(`🚨 Kitchen Flashing Red for ${customerName} (${matchedKdsOrder.order_number})!`, 'success');
        customItemInput.value = '';
        noteInput.value = '';
        await refreshKdsOrders();
      } else {
        showToast(res?.error || 'Failed to reach Kitchen KDS', 'error');
      }
      return;
    }

    const combinedItems = items.length > 0 ? items : scrapedPageItems;
    const res = await callKdsApi({
      type: 'KDS_SYNC_ORDER',
      payload: {
        order_number: orderNumber,
        customer_name: customerName,
        customer_phone: customerPhone,
        pickup_time: parsePromisedDateToIso(promisedStr),
        order_type: orderType,
        items: combinedItems,
        custom_note: customNote,
        flash_kitchen: flashKitchen,
        sync_mode: 'quick_add',
        submitted_by: 'CFA Home Dashboard'
      }
    });

    if (res && res.ok) {
      showToast(`🚨 Synced ${customerName} & Flashing Red on Kitchen Touchscreen!`, 'success');
      orderNumInput.value = res.data.order.order_number;
      customItemInput.value = '';
      noteInput.value = '';
      await refreshKdsOrders();
    } else {
      showToast(res?.error || 'Failed to sync to Kitchen KDS', 'error');
    }
  }

  document.querySelectorAll('.cfa-kds-preset-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const item = {
        name: btn.getAttribute('data-name'),
        quantity: Number(btn.getAttribute('data-qty')) || 1,
        category: btn.getAttribute('data-cat') || 'Sauces',
        unit: btn.getAttribute('data-unit') || 'Packets'
      };
      dispatchToKitchen({
        items: [item],
        customNote: noteInput.value.trim(),
        flashKitchen: true
      });
    });
  });

  sendBtn.addEventListener('click', () => {
    const customName = customItemInput.value.trim();
    const customQty = Number(customQtyInput.value) || 1;
    const note = noteInput.value.trim();

    const items = [];
    if (customName) {
      items.push({
        name: customName,
        quantity: customQty,
        category: 'Added Item',
        unit: 'count'
      });
    }

    dispatchToKitchen({
      items,
      customNote: note,
      flashKitchen: true
    });
  });

  const observer = new MutationObserver(() => {
    if (isBulkCrawling) return;
    clearTimeout(window._cfaScanTimer);
    window._cfaScanTimer = setTimeout(scanCfaDashboardAndTabs, 450);
  });
  observer.observe(document.body, { childList: true, subtree: true });

  refreshKdsOrders();
  setTimeout(scanCfaDashboardAndTabs, 500);
  setInterval(refreshKdsOrders, 10000);
})();
