// Chick-fil-A Catering Portal & Kitchen Fulfillment System (KDS) Client
(function() {
  'use strict';

  // State
  let currentView = 'desk'; // 'desk' or 'kitchen'
  let currentFilter = 'all'; // 'all', 'due_soon', 'prep', 'ready', 'completed'
  let orders = [];
  let sseSource = null;
  let audioEnabled = true;
  let audioCtx = null;
  let selectedOrderIdForMod = null;
  let activeQuickItem = null;

  // DOM Elements
  const deskViewBtn = document.getElementById('view-desk-btn');
  const kitchenViewBtn = document.getElementById('view-kitchen-btn');
  const audioToggleBtn = document.getElementById('audio-toggle-btn');
  const ordersGrid = document.getElementById('orders-grid');
  const emptyState = document.getElementById('empty-state');
  const quickModModal = document.getElementById('quick-mod-modal');
  const newOrderModal = document.getElementById('new-order-modal');
  const historyModal = document.getElementById('history-modal');
  const toastContainer = document.getElementById('toast-container');
  const localIpBanner = document.getElementById('local-ip-banner');

  // --- AUDIO SYNTHESIZER (Web Audio API) ---
  // Generates a crisp, warm Chick-fil-A kitchen notification bell/chime
  function initAudio() {
    if (!audioCtx) {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (AudioContext) {
        audioCtx = new AudioContext();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  }

  function playAlertChime(urgency = 'urgent') {
    if (!audioEnabled) return;
    try {
      initAudio();
      if (!audioCtx) return;

      const now = audioCtx.currentTime;

      if (urgency === 'urgent') {
        // High priority 3-tone urgent alert chime
        const notes = [659.25, 783.99, 1046.50]; // E5, G5, C6
        notes.forEach((freq, idx) => {
          const osc = audioCtx.createOscillator();
          const gain = audioCtx.createGain();

          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, now + idx * 0.12);

          gain.gain.setValueAtTime(0, now + idx * 0.12);
          gain.gain.linearRampToValueAtTime(0.3, now + idx * 0.12 + 0.02);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.12 + 0.4);

          osc.connect(gain);
          gain.connect(audioCtx.destination);

          osc.start(now + idx * 0.12);
          osc.stop(now + idx * 0.12 + 0.45);
        });
      } else {
        // Standard single bell ding
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now); // A5

        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(0.2, now + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start(now);
        osc.stop(now + 0.65);
      }
    } catch (e) {
      console.warn('Audio playback error:', e);
    }
  }

  // --- TOAST NOTIFICATIONS ---
  function showToast(message, isUrgent = false) {
    const toast = document.createElement('div');
    toast.className = `toast ${isUrgent ? 'urgent' : ''}`;
    toast.innerHTML = `
      <span style="font-size: 1.2rem;">${isUrgent ? '⚡' : 'ℹ️'}</span>
      <span>${escapeHtml(message)}</span>
    `;
    toastContainer.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 4500);
  }

  // --- TIME FORMATTING & COUNTDOWN HELPERS ---
  function formatPickupTime(isoString) {
    if (!isoString) return 'Not set';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    const datePart = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    return `${datePart} • ${timePart}`;
  }

  function getCountdownStatus(isoString) {
    if (!isoString) return { text: '', cls: 'due-later' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { text: String(isoString), cls: 'due-later' };

    const now = new Date();
    const diffMs = d - now;
    const diffMins = Math.round(diffMs / 60000);

    const shortDate = `${d.getMonth() + 1}/${d.getDate()}`;
    const shortWeekday = d.toLocaleDateString([], { weekday: 'short' });
    const shortTime = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    const isSameDay =
      d.getFullYear() === now.getFullYear() &&
      d.getMonth() === now.getMonth() &&
      d.getDate() === now.getDate();

    if (diffMins < 0) {
      return {
        text: isSameDay
          ? `⚠️ PAST DUE (Today ${shortDate} @ ${shortTime})`
          : `⚠️ PAST DUE (${shortWeekday} ${shortDate} @ ${shortTime})`,
        cls: 'due-soon'
      };
    } else if (diffMins <= 45) {
      return {
        text: `🔥 DUE IN ${diffMins}m (${shortDate} @ ${shortTime})`,
        cls: 'due-soon'
      };
    } else if (isSameDay) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      const dur = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return {
        text: `⏰ Due Today ${shortDate} @ ${shortTime} (in ${dur})`,
        cls: 'due-later'
      };
    } else {
      return {
        text: `📅 Due ${shortWeekday}, ${shortDate} @ ${shortTime}`,
        cls: 'due-later'
      };
    }
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>"']/g, m => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[m]));
  }

  // --- FETCH ORDERS & RENDER ---
  async function fetchOrders() {
    try {
      const res = await fetch('/api/orders');
      if (!res.ok) throw new Error('Failed to load orders');
      orders = await res.json();
      renderOrders();
    } catch (err) {
      console.error('Error fetching orders:', err);
    }
  }

  function renderOrders() {
    ordersGrid.innerHTML = '';

    // Apply Filter
    const filtered = orders.filter(order => {
      if (currentFilter === 'all') return true;
      if (currentFilter === 'due_soon') {
        const diffMs = new Date(order.pickup_time) - new Date();
        return diffMs > -600000 && diffMs <= 45 * 60000;
      }
      if (currentFilter === 'prep') return order.status === 'new' || order.status === 'in_prep';
      if (currentFilter === 'ready') return order.status === 'ready';
      if (currentFilter === 'completed') return order.status === 'completed';
      return true;
    });

    if (filtered.length === 0) {
      emptyState.style.display = 'block';
    } else {
      emptyState.style.display = 'none';
      filtered.forEach(order => {
        const card = createOrderCardElement(order);
        ordersGrid.appendChild(card);
      });
    }
  }

  // Create Order Card Component
  function createOrderCardElement(order) {
    const card = document.createElement('div');
    const hasAlert = order.has_unacknowledged_change === 1;
    card.className = `order-card ${hasAlert ? 'has-alert' : ''}`;
    card.setAttribute('data-order-id', order.id);

    const timing = getCountdownStatus(order.pickup_time);
    const verifiedCount = order.items ? order.items.filter(i => i.is_verified === 1).length : 0;
    const totalCount = order.items ? order.items.length : 0;
    const progressPercent = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;

    let itemsHtml = '';
    if (order.items && order.items.length > 0) {
      itemsHtml = order.items.map(item => `
        <div class="item-row ${item.is_verified ? 'verified' : ''} ${item.is_recently_added ? 'recently-added' : ''}"
             data-item-id="${item.id}"
             onclick="window.CFA_APP.toggleItemVerify('${item.id}', event)">
          <div class="item-left">
            <div class="touch-checkbox" title="Tap to mark verified">
              ${item.is_verified ? '✓' : ''}
            </div>
            <div class="item-info">
              <div class="item-name">
                ${escapeHtml(item.name)}
                ${item.is_recently_added ? '<span class="new-badge">⚡ NEW ADDITION</span>' : ''}
              </div>
              <div class="item-meta">
                ${escapeHtml(item.category || 'General')}
                ${item.is_verified && item.verified_by ? ` • Packed by ${escapeHtml(item.verified_by)}` : ''}
                ${item.notes ? ` • <em>${escapeHtml(item.notes)}</em>` : ''}
              </div>
            </div>
          </div>
          <div class="item-qty-badge">
            ${item.quantity} ${escapeHtml(item.unit || '')}
          </div>
        </div>
      `).join('');
    } else {
      itemsHtml = '<div style="padding: 12px; color: #94A3B8; text-align: center;">No items added yet</div>';
    }

    card.innerHTML = `
      ${hasAlert ? `
        <div class="alert-banner">
          <div class="alert-banner-text">
            <span class="alert-banner-icon">🔔</span>
            <span>${escapeHtml(order.alert_message || '⚡ MODIFICATION RECEIVED!')}</span>
          </div>
          <button class="btn-acknowledge-touch" onclick="window.CFA_APP.acknowledgeAlert('${order.id}', event)">
            ✓ TAP TO ACKNOWLEDGE
          </button>
        </div>
      ` : ''}

      <div class="card-header">
        <div>
          <div class="order-ref">
            <span class="order-num">${escapeHtml(order.order_number)}</span>
            <span class="order-type-badge ${order.order_type.toLowerCase()}">${escapeHtml(order.order_type)}</span>
          </div>
          <div class="customer-name">${escapeHtml(order.customer_name)}</div>
          ${order.customer_phone ? `<div class="customer-org" style="font-weight:700; color:#0F172A; margin-top:2px;">📞 ${escapeHtml(order.customer_phone)}</div>` : ''}
          ${order.organization ? `<div class="customer-org" style="color:#B45309; font-weight:700; margin-top:2px;">📍 Delivery: ${escapeHtml(order.organization)}</div>` : ''}
        </div>
        <div class="timing-badge">
          <div class="time-val" style="font-size:0.95rem;">${formatPickupTime(order.pickup_time)}</div>
          <div class="time-countdown ${timing.cls}">${timing.text}</div>
        </div>
      </div>

      <div class="card-progress-bar">
        <div class="card-progress-fill" style="width: ${progressPercent}%;"></div>
      </div>

      ${order.special_notes ? `
        <div class="special-notes-box">
          <span>📝</span>
          <span><strong>Special Instructions:</strong> ${escapeHtml(order.special_notes)}</span>
        </div>
      ` : ''}

      <div class="card-items">
        ${itemsHtml}
      </div>

      <div class="card-footer">
        <button class="btn-quick-mod" title="Add items (e.g. 50 BBQ sauces) or alert kitchen" onclick="window.CFA_APP.openQuickModModal('${order.id}')">
          ⚡ Quick Add
        </button>
        <button class="btn-card-action" onclick="window.CFA_APP.viewOrderHistory('${order.id}')" title="View Audit Trail">
          📜 History
        </button>
        <button class="btn-card-action btn-delete-action" onclick="window.CFA_APP.deleteOrder('${order.id}', event)" title="Cancel & Delete Order">
          🗑️ Delete
        </button>
        ${order.status === 'new' ? `
          <button class="btn-card-action primary" onclick="window.CFA_APP.setOrderStatus('${order.id}', 'in_prep')">
            Start Prep
          </button>
        ` : ''}
        ${order.status === 'in_prep' ? `
          <button class="btn-card-action primary" style="background: #10B981; border-color: #10B981;" onclick="window.CFA_APP.setOrderStatus('${order.id}', 'ready')">
            ✓ Ready
          </button>
        ` : ''}
        ${order.status === 'ready' ? `
          <button class="btn-card-action" style="background: #004F71; color: #FFF; border-color: #004F71;" onclick="window.CFA_APP.setOrderStatus('${order.id}', 'completed')">
            ✓ Complete
          </button>
        ` : ''}
        ${order.status === 'completed' ? `
          <span class="btn-card-action" style="color: #10B981; background: #ECFDF5; border-color: #A7F3D0; cursor: default;">
            ✓ Fulfilled
          </span>
        ` : ''}
      </div>
    `;

    return card;
  }

  // --- ACTIONS & API CALLS ---

  // Touch checklist verification toggle
  async function toggleItemVerify(itemId, event) {
    if (event) event.stopPropagation();
    initAudio();

    try {
      const chefName = currentView === 'kitchen' ? 'Kitchen Touch Display' : 'Order Desk Coordinator';
      const res = await fetch(`/api/items/${itemId}/verify`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ verified_by: chefName })
      });
      if (!res.ok) throw new Error('Verification failed');
      const data = await res.json();

      // Update local item
      const itemRow = document.querySelector(`[data-item-id="${itemId}"]`);
      if (itemRow) {
        if (data.item.is_verified) {
          itemRow.classList.add('verified');
          const cb = itemRow.querySelector('.touch-checkbox');
          if (cb) cb.textContent = '✓';
        } else {
          itemRow.classList.remove('verified');
          const cb = itemRow.querySelector('.touch-checkbox');
          if (cb) cb.textContent = '';
        }
      }

      // Refresh order card silently to update progress bar
      updateOrderInList(data.order);
    } catch (err) {
      console.error('Error toggling item:', err);
    }
  }

  // Acknowledge flashing red alert (silences alarm and confirms kitchen saw it)
  async function acknowledgeAlert(orderId, event) {
    if (event) event.stopPropagation();
    initAudio();

    try {
      const chefName = currentView === 'kitchen' ? 'Kitchen Touch Display' : 'Order Desk';
      const res = await fetch(`/api/orders/${orderId}/acknowledge-alert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chef_name: chefName })
      });
      if (!res.ok) throw new Error('Failed to acknowledge alert');
      const data = await res.json();
      updateOrderInList(data.order);
      showToast('✓ Alert acknowledged. Flashing stopped.');
    } catch (err) {
      console.error('Error acknowledging alert:', err);
    }
  }

  // Set Order Status
  async function setOrderStatus(orderId, status) {
    try {
      const res = await fetch(`/api/orders/${orderId}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status,
          changed_by: currentView === 'kitchen' ? 'Kitchen Display' : 'Order Desk'
        })
      });
      if (!res.ok) throw new Error('Failed to update status');
      const data = await res.json();
      updateOrderInList(data.order);
      showToast(`Order status updated: ${status.toUpperCase()}`);
    } catch (err) {
      console.error(err);
    }
  }

  function updateOrderInList(updatedOrder) {
    const idx = orders.findIndex(o => o.id === updatedOrder.id);
    if (idx !== -1) {
      orders[idx] = updatedOrder;
    } else {
      orders.unshift(updatedOrder);
    }
    renderOrders();
  }

  // Delete / Cancel an order
  async function deleteOrder(orderId, event) {
    if (event) event.stopPropagation();
    const target = orders.find(o => o.id === orderId);
    const label = target ? `${target.order_number} (${target.customer_name})` : 'this order';
    if (!window.confirm(`Cancel and delete ${label} from the Kitchen Display?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(orderId)}`, {
        method: 'DELETE'
      });
      if (!res.ok) throw new Error('Failed to delete order');
      orders = orders.filter(o => o.id !== orderId);
      renderOrders();
      showToast(`🗑️ Deleted order ${label}`);
    } catch (err) {
      console.error('Error deleting order:', err);
      showToast('Failed to delete order', true);
    }
  }

  // --- QUICK-ADD / EMERGENCY MODIFICATION MODAL (THE CORE WIFE'S FEATURE) ---
  function openQuickModModal(orderId = null) {
    initAudio();
    selectedOrderIdForMod = orderId || (orders.length > 0 ? orders[0].id : null);

    // Populate order dropdown
    const selectEl = document.getElementById('quick-mod-order-select');
    selectEl.innerHTML = orders.map(o => `
      <option value="${o.id}" ${o.id === selectedOrderIdForMod ? 'selected' : ''}>
        ${escapeHtml(o.order_number)} - ${escapeHtml(o.customer_name)} (${formatPickupTime(o.pickup_time)})
      </option>
    `).join('');

    // Reset inputs
    document.getElementById('quick-mod-item-name').value = 'Barbeque Sauce Packets';
    document.getElementById('quick-mod-qty').value = '50';
    document.getElementById('quick-mod-unit').value = 'Packets';
    document.getElementById('quick-mod-category').value = 'Sauces';
    document.getElementById('quick-mod-note').value = 'Customer called to add BBQ sauce for the group';
    document.getElementById('quick-mod-urgency').checked = true;

    // Render quick sauce preset buttons
    const presetGrid = document.getElementById('quick-sauce-presets-grid');
    if (window.QUICK_SAUCE_PRESETS) {
      presetGrid.innerHTML = window.QUICK_SAUCE_PRESETS.map((p, idx) => `
        <button type="button" class="btn-sauce-preset ${idx === 0 ? 'selected' : ''}"
                onclick="window.CFA_APP.selectPreset(${idx})">
          ${escapeHtml(p.label)}
        </button>
      `).join('');
    }

    quickModModal.classList.add('open');
  }

  function selectPreset(idx) {
    const p = window.QUICK_SAUCE_PRESETS[idx];
    if (!p) return;

    document.getElementById('quick-mod-item-name').value = p.name;
    document.getElementById('quick-mod-qty').value = p.qty;
    document.getElementById('quick-mod-unit').value = p.unit;
    document.getElementById('quick-mod-category').value = p.category;

    // Highlight button
    document.querySelectorAll('.btn-sauce-preset').forEach((btn, i) => {
      btn.classList.toggle('selected', i === idx);
    });
  }

  async function submitQuickMod(event) {
    event.preventDefault();
    const orderId = document.getElementById('quick-mod-order-select').value;
    if (!orderId) {
      alert('Please select an order');
      return;
    }

    const itemName = document.getElementById('quick-mod-item-name').value.trim();
    const qty = parseInt(document.getElementById('quick-mod-qty').value, 10) || 1;
    const unit = document.getElementById('quick-mod-unit').value.trim() || 'Packets';
    const category = document.getElementById('quick-mod-category').value || 'Sauces';
    const note = document.getElementById('quick-mod-note').value.trim();
    const isUrgent = document.getElementById('quick-mod-urgency').checked;

    const payload = {
      items: [
        { name: itemName, quantity: qty, unit, category, notes: note }
      ],
      custom_note: note,
      urgency: isUrgent ? 'urgent' : 'normal',
      submitted_by: 'Order Desk (Sarah)'
    };

    try {
      const res = await fetch(`/api/orders/${orderId}/quick-add`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Failed to submit modification');
      const data = await res.json();

      quickModModal.classList.remove('open');
      updateOrderInList(data.order);
      showToast(`⚡ Alert dispatched to Kitchen! Added ${qty}x ${itemName}`, true);
    } catch (err) {
      console.error(err);
      alert('Error submitting modification: ' + err.message);
    }
  }

  // --- NEW CATERING ORDER MODAL ---
  function openNewOrderModal() {
    initAudio();
    // Default pickup time 1 hour from now
    const d = new Date(Date.now() + 60 * 60 * 1000);
    // Format YYYY-MM-DDTHH:mm
    const localIso = new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    document.getElementById('new-order-time').value = localIso;

    // Build Menu category tabs
    renderNewOrderMenuPicker();
    newOrderModal.classList.add('open');
  }

  let newOrderSelectedItems = [];

  function renderNewOrderMenuPicker() {
    const container = document.getElementById('new-order-menu-container');
    if (!window.CFA_MENU) return;

    container.innerHTML = window.CFA_MENU.map(cat => `
      <div style="margin-bottom: 14px;">
        <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 6px; color: #1E293B;">
          ${cat.icon} ${escapeHtml(cat.category)}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">
          ${cat.items.map(item => `
            <button type="button" class="btn-card-action" style="justify-content: space-between; text-align: left;"
                    onclick="window.CFA_APP.addItemToNewOrder('${escapeHtml(item.name)}', ${item.defaultQty}, '${escapeHtml(item.unit)}', '${escapeHtml(cat.category)}')">
              <span>${escapeHtml(item.name)}</span>
              <span style="color: var(--cfa-red); font-weight: 800;">+${item.defaultQty}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');

    renderNewOrderItemsList();
  }

  function addItemToNewOrder(name, quantity, unit, category) {
    const existing = newOrderSelectedItems.find(i => i.name === name);
    if (existing) {
      existing.quantity += quantity;
    } else {
      newOrderSelectedItems.push({ name, quantity, unit, category });
    }
    renderNewOrderItemsList();
  }

  function renderNewOrderItemsList() {
    const listEl = document.getElementById('new-order-selected-items');
    if (newOrderSelectedItems.length === 0) {
      listEl.innerHTML = '<div style="color: #94A3B8; font-size: 0.85rem; padding: 8px;">No items added yet. Click items above to include them.</div>';
      return;
    }
    listEl.innerHTML = newOrderSelectedItems.map((item, idx) => `
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 10px; background: #F8FAFC; border-radius: 6px; margin-bottom: 4px;">
        <span style="font-weight: 600; font-size: 0.9rem;">${item.quantity}x ${escapeHtml(item.name)} (${escapeHtml(item.unit)})</span>
        <button type="button" style="border:none; background:transparent; color:#EF4444; font-weight:800; cursor:pointer;" onclick="window.CFA_APP.removeItemFromNewOrder(${idx})">✕</button>
      </div>
    `).join('');
  }

  function removeItemFromNewOrder(idx) {
    newOrderSelectedItems.splice(idx, 1);
    renderNewOrderItemsList();
  }

  async function submitNewOrder(event) {
    event.preventDefault();
    const customer_name = document.getElementById('new-order-customer').value.trim();
    const customer_phone = document.getElementById('new-order-phone').value.trim();
    const organization = document.getElementById('new-order-org').value.trim();
    const pickup_time = document.getElementById('new-order-time').value;
    const order_type = document.getElementById('new-order-type').value;
    const guest_count = parseInt(document.getElementById('new-order-guests').value, 10) || 10;
    const special_notes = document.getElementById('new-order-notes').value.trim();

    if (newOrderSelectedItems.length === 0) {
      if (!confirm('No catering items selected. Create empty order anyway?')) {
        return;
      }
    }

    const payload = {
      customer_name,
      customer_phone,
      organization,
      pickup_time,
      order_type,
      guest_count,
      special_notes,
      items: newOrderSelectedItems,
      created_by: 'Order Desk (Sarah)'
    };

    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) throw new Error('Failed to create order');
      const created = await res.json();

      newOrderSelectedItems = [];
      newOrderModal.classList.remove('open');
      updateOrderInList(created);
      showToast(`✓ Order booked for ${customer_name}!`);
    } catch (err) {
      alert('Error creating order: ' + err.message);
    }
  }

  // --- ORDER AUDIT TRAIL / HISTORY ---
  async function viewOrderHistory(orderId) {
    try {
      const res = await fetch(`/api/orders/${orderId}`);
      if (!res.ok) throw new Error('Failed to load order');
      const order = await res.json();

      document.getElementById('history-modal-title').textContent = `Order History: ${order.order_number}`;
      const listEl = document.getElementById('history-log-list');

      if (!order.logs || order.logs.length === 0) {
        listEl.innerHTML = '<div style="color: #94A3B8; padding: 12px;">No activity logged yet.</div>';
      } else {
        listEl.innerHTML = order.logs.map(log => {
          const isUrgent = log.action === 'urgent_modification';
          const isAck = log.action === 'alert_acknowledged';
          const time = new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
          return `
            <div class="log-item ${isUrgent ? 'urgent' : ''} ${isAck ? 'acknowledged' : ''}">
              <div class="log-meta">
                <span><strong>${escapeHtml(log.performed_by)}</strong></span>
                <span>${time}</span>
              </div>
              <div class="log-desc">${escapeHtml(log.description)}</div>
            </div>
          `;
        }).join('');
      }

      historyModal.classList.add('open');
    } catch (err) {
      console.error(err);
    }
  }

  // --- SERVER-SENT EVENTS (SSE) REAL-TIME LISTENER ---
  function setupSSE() {
    if (sseSource) sseSource.close();

    sseSource = new EventSource('/api/events');

    sseSource.addEventListener('kitchen_alert', e => {
      const data = JSON.parse(e.data);
      console.log('⚡ Incoming Kitchen Alert:', data);

      // Play urgent sound chime!
      playAlertChime('urgent');

      // Urgent toast notification
      showToast(`⚡ KITCHEN ALERT: ${data.orderNumber} - ${data.alertMessage}`, true);

      // Update order and flash red
      if (data.updatedOrder) {
        updateOrderInList(data.updatedOrder);
      } else {
        fetchOrders();
      }
    });

    sseSource.addEventListener('alert_acknowledged', e => {
      const data = JSON.parse(e.data);
      showToast(`✓ Alert Acknowledged by ${data.chefName}`);
      if (data.updatedOrder) {
        updateOrderInList(data.updatedOrder);
      }
    });

    sseSource.addEventListener('item_verified', e => {
      const data = JSON.parse(e.data);
      if (data.updatedOrder) {
        updateOrderInList(data.updatedOrder);
      }
    });

    sseSource.addEventListener('order_created', e => {
      const data = JSON.parse(e.data);
      playAlertChime('normal');
      showToast(data.summary || 'New Catering Order Booked');
      if (data.order) {
        updateOrderInList(data.order);
      }
    });

    sseSource.addEventListener('status_changed', e => {
      const data = JSON.parse(e.data);
      if (data.updatedOrder) {
        updateOrderInList(data.updatedOrder);
      }
    });

    sseSource.addEventListener('order_deleted', e => {
      const data = JSON.parse(e.data);
      if (data.orderId) {
        orders = orders.filter(o => o.id !== data.orderId);
        renderOrders();
        showToast(`🗑️ Order ${data.orderNumber || ''} (${data.customerName || ''}) canceled/deleted`);
      }
    });

    sseSource.onerror = err => {
      console.warn('SSE connection interrupted, retrying in 3s...');
    };
  }

  // --- VIEW SWITCHING ---
  function switchView(view) {
    currentView = view;
    if (view === 'kitchen') {
      document.body.classList.add('kitchen-mode');
      deskViewBtn.classList.remove('active');
      kitchenViewBtn.classList.add('active', 'kitchen-active');
      document.title = '🐔 CFA Kitchen Touch Display (KDS)';
    } else {
      document.body.classList.remove('kitchen-mode');
      kitchenViewBtn.classList.remove('active', 'kitchen-active');
      deskViewBtn.classList.add('active');
      document.title = '🐔 CFA Catering Portal & Order Desk';
    }
    renderOrders();
  }

  // --- IP / NETWORK DISCOVERY ---
  async function loadNetworkInfo() {
    try {
      const res = await fetch('/api/network-info');
      if (!res.ok) return;
      const data = await res.json();
      if (data.localAddresses && data.localAddresses.length > 0) {
        const ip = data.localAddresses[0].address;
        localIpBanner.innerHTML = `
          <span>📱 <strong>Connect Kitchen Tablet:</strong> Open <code>http://${ip}:${data.port}?view=kitchen</code> on any touchscreen or iPad</span>
        `;
      }
    } catch {}
  }

  // --- INIT & EVENT LISTENERS ---
  function init() {
    // Check URL parameters for view
    const urlParams = new URLSearchParams(window.location.search);
    const viewParam = urlParams.get('view');
    if (viewParam === 'kitchen' || window.location.pathname === '/kds') {
      switchView('kitchen');
    } else {
      switchView('desk');
    }

    // View button listeners
    deskViewBtn.addEventListener('click', () => switchView('desk'));
    kitchenViewBtn.addEventListener('click', () => switchView('kitchen'));

    // Audio toggle
    audioToggleBtn.addEventListener('click', () => {
      initAudio();
      audioEnabled = !audioEnabled;
      audioToggleBtn.innerHTML = audioEnabled 
        ? '<span>🔔</span><span>Sound Alert: ON</span>' 
        : '<span>🔕</span><span>Sound Alert: OFF</span>';
      if (audioEnabled) {
        playAlertChime('normal');
      }
    });

    // Filter tabs
    document.querySelectorAll('.filter-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentFilter = tab.dataset.filter;
        renderOrders();
      });
    });

    // Modal Close buttons
    document.querySelectorAll('.modal-overlay').forEach(modal => {
      modal.addEventListener('click', e => {
        if (e.target === modal) modal.classList.remove('open');
      });
    });
    document.querySelectorAll('.btn-close-modal').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.closest('.modal-overlay').classList.remove('open');
      });
    });

    // Form submit handlers
    document.getElementById('quick-mod-form').addEventListener('submit', submitQuickMod);
    document.getElementById('new-order-form').addEventListener('submit', submitNewOrder);

    // Initial Fetch & SSE Setup
    fetchOrders();
    setupSSE();
    loadNetworkInfo();

    // Auto-refresh times every 30 seconds
    setInterval(renderOrders, 30000);
  }

  // Expose global app API for inline button handlers
  window.CFA_APP = {
    toggleItemVerify,
    acknowledgeAlert,
    setOrderStatus,
    deleteOrder,
    openQuickModModal,
    openNewOrderModal,
    viewOrderHistory,
    selectPreset,
    addItemToNewOrder,
    removeItemFromNewOrder
  };

  // Run on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
