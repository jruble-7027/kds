// Chick-fil-A Catering Portal & Kitchen Fulfillment System (KDS) Client
(function() {
  'use strict';

  // State
  let currentView = 'desk'; // 'desk' or 'kitchen'
  let currentFilter = 'all'; // 'all', 'today', 'due_soon', 'prep', 'ready', 'completed'
  let searchQuery = '';
  let focusedOrderId = null;
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
  const orderSearchInput = document.getElementById('order-search-input');
  const focusBackdrop = document.getElementById('focus-backdrop');

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
  function isSameCalendarDay(d1, d2) {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  function formatPickupTime(isoString) {
    if (!isoString) return 'Not set';
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return String(isoString);
    const now = new Date();
    const timePart = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    if (isSameCalendarDay(d, now)) {
      return `Today • ${timePart}`;
    }
    const datePart = d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' });
    return `${datePart} • ${timePart}`;
  }

  // Concise countdown pill (no duplicate date/time string)
  function getCountdownStatus(isoString) {
    if (!isoString) return { text: '', cls: 'due-later' };
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { text: String(isoString), cls: 'due-later' };

    const now = new Date();
    const diffMs = d - now;
    const diffMins = Math.round(diffMs / 60000);
    const isSameDay = isSameCalendarDay(d, now);

    // Calendar day difference for future dates
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startOfTarget - startOfToday) / 86400000);

    if (diffMins < 0) {
      return {
        text: isSameDay ? '⚠️ Past Due Today' : `⚠️ Past Due (${d.getMonth() + 1}/${d.getDate()})`,
        cls: 'due-soon'
      };
    } else if (diffMins <= 45) {
      return {
        text: `🔥 DUE IN ${diffMins}m`,
        cls: 'due-soon'
      };
    } else if (isSameDay) {
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      const dur = hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
      return {
        text: `⏰ Due in ${dur}`,
        cls: 'due-later'
      };
    } else if (diffDays === 1) {
      return {
        text: '📅 Tomorrow',
        cls: 'due-later'
      };
    } else {
      return {
        text: `📅 In ${diffDays} Days`,
        cls: 'due-later'
      };
    }
  }

  function getOrderDateGroupKey(isoString) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '9999-99-99';
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }

  function formatDateSectionTitle(isoString, count) {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return { label: 'Unscheduled Orders', badge: `${count} Order${count === 1 ? '' : 's'}`, isToday: false };
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    const diffDays = Math.round((startOfTarget - startOfToday) / 86400000);

    const fullDate = d.toLocaleDateString([], { weekday: 'long', month: 'long', day: 'numeric' });
    if (diffDays === 0) {
      return { label: `📌 TODAY — ${fullDate}`, badge: `${count} Order${count === 1 ? '' : 's'} Today`, isToday: true };
    }
    if (diffDays === 1) {
      return { label: `📅 TOMORROW — ${fullDate}`, badge: `${count} Order${count === 1 ? '' : 's'}`, isToday: false };
    }
    if (diffDays < 0) {
      return { label: `⏳ EARLIER UNFULFILLED — ${fullDate}`, badge: `${count} Order${count === 1 ? '' : 's'}`, isToday: false };
    }
    return { label: `📅 UPCOMING — ${fullDate}`, badge: `${count} Order${count === 1 ? '' : 's'}`, isToday: false };
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

  function updateFilterTabCounts() {
    const now = new Date();
    const activeOrders = orders.filter(o => o.status !== 'completed');
    const todayOrders = activeOrders.filter(o => isSameCalendarDay(new Date(o.pickup_time), now));
    const dueSoonOrders = activeOrders.filter(o => {
      const diffMs = new Date(o.pickup_time) - now;
      return diffMs > -600000 && diffMs <= 45 * 60000;
    });
    const prepOrders = orders.filter(o => o.status === 'new' || o.status === 'in_prep');
    const readyOrders = orders.filter(o => o.status === 'ready');
    const completedOrders = orders.filter(o => o.status === 'completed');

    const setEl = (id, val) => {
      const el = document.getElementById(id);
      if (el) el.textContent = String(val);
    };
    setEl('count-all', activeOrders.length);
    setEl('count-today', todayOrders.length);
    setEl('count-due_soon', dueSoonOrders.length);
    setEl('count-prep', prepOrders.length);
    setEl('count-ready', readyOrders.length);
    setEl('count-completed', completedOrders.length);
  }

  function renderOrders() {
    ordersGrid.innerHTML = '';
    updateFilterTabCounts();

    const now = new Date();
    const q = searchQuery.trim().toLowerCase();

    // Apply Filter + Search
    const filtered = orders.filter(order => {
      if (q) {
        const matchGuest = (order.customer_name || '').toLowerCase().includes(q);
        const matchNum = (order.order_number || '').toLowerCase().includes(q);
        const matchOrg = (order.organization || '').toLowerCase().includes(q);
        const matchPhone = (order.customer_phone || '').toLowerCase().includes(q);
        const matchItem = Array.isArray(order.items) && order.items.some(i => (i.name || '').toLowerCase().includes(q));
        if (!matchGuest && !matchNum && !matchOrg && !matchPhone && !matchItem) {
          return false;
        }
      }

      if (currentFilter === 'all') return order.status !== 'completed';
      if (currentFilter === 'today') {
        return order.status !== 'completed' && isSameCalendarDay(new Date(order.pickup_time), now);
      }
      if (currentFilter === 'due_soon') {
        const diffMs = new Date(order.pickup_time) - now;
        return order.status !== 'completed' && diffMs > -600000 && diffMs <= 45 * 60000;
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

      // Group filtered orders by date so Today, Tomorrow, and Future dates have clear section headers
      const groups = new Map();
      filtered.forEach(order => {
        const key = getOrderDateGroupKey(order.pickup_time);
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(order);
      });

      groups.forEach((groupOrders) => {
        const secInfo = formatDateSectionTitle(groupOrders[0].pickup_time, groupOrders.length);
        const divider = document.createElement('div');
        divider.className = `date-section-divider ${secInfo.isToday ? 'is-today' : ''}`;
        divider.innerHTML = `
          <span class="date-section-title">${escapeHtml(secInfo.label)}</span>
          <span class="date-section-badge">${escapeHtml(secInfo.badge)}</span>
        `;
        ordersGrid.appendChild(divider);

        groupOrders.forEach(order => {
          const card = createOrderCardElement(order);
          ordersGrid.appendChild(card);
        });
      });
    }
    syncFocusBackdrop();
  }

  function getStatusMeta(status) {
    if (status === 'in_prep') return { label: '👨‍🍳 IN PREP', cls: 'status-in_prep' };
    if (status === 'ready') return { label: '✅ READY', cls: 'status-ready' };
    if (status === 'completed') return { label: '✓ FULFILLED', cls: 'status-completed' };
    return null;
  }

  function syncFocusBackdrop() {
    if (!focusBackdrop) return;
    const hasFocusedInDom = Boolean(focusedOrderId && document.querySelector(`.order-card[data-order-id="${focusedOrderId}"]`));
    if (!hasFocusedInDom) {
      focusedOrderId = null;
    }
    focusBackdrop.classList.toggle('open', Boolean(focusedOrderId));
    document.body.classList.toggle('has-focused-order', Boolean(focusedOrderId));
  }

  function toggleFocusOrder(orderId, event) {
    if (event) event.stopPropagation();
    if (!orderId || focusedOrderId === orderId) {
      focusedOrderId = null;
    } else {
      focusedOrderId = orderId;
    }
    renderOrders();
  }

  // Create Order Card Component
  function createOrderCardElement(order) {
    const card = document.createElement('div');
    const hasAlert = order.has_unacknowledged_change === 1;
    const isFocused = focusedOrderId === order.id;
    card.className = `order-card status-card-${order.status || 'new'} ${hasAlert ? 'has-alert' : ''} ${isFocused ? 'focused-card' : ''}`;
    card.setAttribute('data-order-id', order.id);

    const timing = getCountdownStatus(order.pickup_time);
    const statusMeta = getStatusMeta(order.status);
    const verifiedCount = order.items ? order.items.filter(i => i.is_verified === 1).length : 0;
    const totalCount = order.items ? order.items.length : 0;
    const progressPercent = totalCount > 0 ? Math.round((verifiedCount / totalCount) * 100) : 0;
    const allPacked = totalCount > 0 && verifiedCount === totalCount;
    const packedLabel = totalCount === 0
      ? 'No Items Yet'
      : allPacked
      ? `✅ All ${totalCount} Packed`
      : `📦 ${verifiedCount} / ${totalCount} Packed`;

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

      <div class="card-header" onclick="window.CFA_APP.toggleFocusOrder('${order.id}', event)" title="Tap header to toggle Full-Screen Focus View">
        <div style="min-width: 0; flex: 1;">
          <div class="order-ref">
            <span class="order-num">${escapeHtml(order.order_number)}</span>
            <span class="order-type-badge ${order.order_type.toLowerCase()}">${escapeHtml(order.order_type)}</span>
            ${statusMeta ? `<span class="status-pill ${statusMeta.cls}">${statusMeta.label}</span>` : ''}
            ${isFocused ? `<span class="focus-toggle-pill active">✕ Close Full View</span>` : ''}
          </div>
          <div class="customer-name">${escapeHtml(order.customer_name)}</div>
          ${order.customer_phone ? `<div class="customer-org" style="font-weight:700; color:#0F172A; margin-top:2px;">📞 ${escapeHtml(order.customer_phone)}</div>` : ''}
          ${order.organization ? `<div class="customer-org" style="color:#B45309; font-weight:700; margin-top:2px;">📍 Delivery: ${escapeHtml(order.organization)}</div>` : ''}
        </div>
        <div class="timing-badge">
          <div class="time-val">${formatPickupTime(order.pickup_time)}</div>
          <div class="time-countdown ${timing.cls}">${timing.text}</div>
          <div class="packed-pill ${allPacked ? 'all-packed' : ''}">${packedLabel}</div>
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

  // --- QUICK-ADD / EMERGENCY MODIFICATION MODAL (FULL MENU PICKER + QUANTITY) ---
  let quickModActiveCategory = 'All';
  let quickModSearchTerm = '';
  let quickModSelectedKey = '0-0';

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

    quickModActiveCategory = 'All';
    quickModSearchTerm = '';
    const searchInput = document.getElementById('quick-mod-menu-search');
    if (searchInput) searchInput.value = '';

    // Default to first menu item
    const firstCat = window.CFA_MENU && window.CFA_MENU[0];
    const firstItem = firstCat && firstCat.items && firstCat.items[0];
    document.getElementById('quick-mod-item-name').value = firstItem ? firstItem.name : 'Chick-fil-A Chicken Biscuit';
    document.getElementById('quick-mod-qty').value = '1';
    document.getElementById('quick-mod-unit').value = firstItem ? (firstItem.unit || 'count') : 'count';
    document.getElementById('quick-mod-category').value = firstItem ? (firstItem.subCategory || firstCat.category) : 'Breakfast';
    document.getElementById('quick-mod-note').value = '';
    document.getElementById('quick-mod-urgency').checked = true;
    quickModSelectedKey = '0-0';

    renderQuickModCategoryTabs();
    renderQuickModMenuItems();

    quickModModal.classList.add('open');
  }

  function renderQuickModCategoryTabs() {
    const tabsEl = document.getElementById('quick-mod-cat-tabs');
    if (!tabsEl || !window.CFA_MENU) return;

    const allTab = `<button type="button" class="menu-cat-pill ${quickModActiveCategory === 'All' ? 'active' : ''}" onclick="window.CFA_APP.selectMenuCategory('All')">All Menu</button>`;
    const catTabs = window.CFA_MENU.map((cat, idx) => `
      <button type="button" class="menu-cat-pill ${quickModActiveCategory === cat.category ? 'active' : ''}"
              onclick="window.CFA_APP.selectMenuCategoryIndex(${idx})">
        ${cat.icon} ${escapeHtml(cat.category)}
      </button>
    `).join('');

    tabsEl.innerHTML = allTab + catTabs;
  }

  function selectMenuCategory(catName) {
    quickModActiveCategory = catName;
    renderQuickModCategoryTabs();
    renderQuickModMenuItems();
  }

  function selectMenuCategoryIndex(catIdx) {
    const cat = window.CFA_MENU && window.CFA_MENU[catIdx];
    if (!cat) return;
    quickModActiveCategory = cat.category;
    renderQuickModCategoryTabs();
    renderQuickModMenuItems();
  }

  function renderQuickModMenuItems() {
    const presetGrid = document.getElementById('quick-sauce-presets-grid');
    if (!presetGrid || !window.CFA_MENU) return;

    const q = quickModSearchTerm.trim().toLowerCase();
    const buttonsHtml = [];

    window.CFA_MENU.forEach((cat, catIdx) => {
      if (quickModActiveCategory !== 'All' && cat.category !== quickModActiveCategory) return;

      cat.items.forEach((item, itemIdx) => {
        if (q && !item.name.toLowerCase().includes(q) && !(item.subCategory || '').toLowerCase().includes(q) && !cat.category.toLowerCase().includes(q)) {
          return;
        }
        const key = `${catIdx}-${itemIdx}`;
        const isSel = quickModSelectedKey === key;
        buttonsHtml.push(`
          <button type="button" class="btn-sauce-preset ${isSel ? 'selected' : ''}"
                  onclick="window.CFA_APP.selectMenuItem(${catIdx}, ${itemIdx})">
            <span class="preset-item-name">${escapeHtml(item.name)}</span>
            <span class="preset-item-cat">${escapeHtml(item.subCategory || cat.category)}</span>
          </button>
        `);
      });
    });

    presetGrid.innerHTML = buttonsHtml.length > 0
      ? buttonsHtml.join('')
      : '<div style="grid-column: 1 / -1; padding: 12px; color: #64748B; text-align: center; font-size: 0.85rem;">No matching menu items found. You can also type a custom item name below.</div>';
  }

  function selectMenuItem(catIdx, itemIdx) {
    const cat = window.CFA_MENU && window.CFA_MENU[catIdx];
    const item = cat && cat.items && cat.items[itemIdx];
    if (!item) return;

    quickModSelectedKey = `${catIdx}-${itemIdx}`;
    document.getElementById('quick-mod-item-name').value = item.name;
    document.getElementById('quick-mod-unit').value = item.unit || 'count';
    document.getElementById('quick-mod-category').value = item.subCategory || cat.category;

    renderQuickModMenuItems();

    // Immediately focus & highlight the Quantity input so user can type the quantity
    const qtyInput = document.getElementById('quick-mod-qty');
    if (qtyInput) {
      qtyInput.focus();
      qtyInput.select();
    }
  }

  function setQuickModQty(val) {
    const qtyInput = document.getElementById('quick-mod-qty');
    if (qtyInput) {
      qtyInput.value = String(val);
      qtyInput.focus();
    }
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

    container.innerHTML = window.CFA_MENU.map((cat, catIdx) => `
      <div style="margin-bottom: 14px;">
        <div style="font-weight: 800; font-size: 0.95rem; margin-bottom: 6px; color: #1E293B;">
          ${cat.icon} ${escapeHtml(cat.category)}
        </div>
        <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px;">
          ${cat.items.map((item, itemIdx) => `
            <button type="button" class="btn-card-action" style="justify-content: space-between; text-align: left;"
                    onclick="window.CFA_APP.addMenuItemByIndex(${catIdx}, ${itemIdx})">
              <span>${escapeHtml(item.name)}</span>
              <span style="color: var(--cfa-red); font-weight: 800;">+${item.defaultQty || 1}</span>
            </button>
          `).join('')}
        </div>
      </div>
    `).join('');

    renderNewOrderItemsList();
  }

  function addMenuItemByIndex(catIdx, itemIdx) {
    const cat = window.CFA_MENU && window.CFA_MENU[catIdx];
    const item = cat && cat.items && cat.items[itemIdx];
    if (!item) return;
    addItemToNewOrder(item.name, item.defaultQty || 1, item.unit || 'count', item.subCategory || cat.category);
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
  function setActiveFilterTab(filterName) {
    currentFilter = filterName;
    document.querySelectorAll('.filter-tab').forEach(t => {
      t.classList.toggle('active', t.dataset.filter === filterName);
    });
  }

  function switchView(view) {
    currentView = view;
    if (view === 'kitchen') {
      document.body.classList.add('kitchen-mode');
      deskViewBtn.classList.remove('active');
      kitchenViewBtn.classList.add('active', 'kitchen-active');
      document.title = '🐔 CFA Kitchen Touch Display (KDS)';
      setActiveFilterTab('today');
    } else {
      document.body.classList.remove('kitchen-mode');
      kitchenViewBtn.classList.remove('active', 'kitchen-active');
      deskViewBtn.classList.add('active');
      document.title = '🐔 CFA Catering Portal & Order Desk';
      setActiveFilterTab('all');
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

    // Quick search input
    if (orderSearchInput) {
      orderSearchInput.addEventListener('input', () => {
        searchQuery = orderSearchInput.value || '';
        renderOrders();
      });
    }

    // Menu search inside Quick Modification modal
    const quickModMenuSearch = document.getElementById('quick-mod-menu-search');
    if (quickModMenuSearch) {
      quickModMenuSearch.addEventListener('input', () => {
        quickModSearchTerm = quickModMenuSearch.value || '';
        renderQuickModMenuItems();
      });
    }

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
    toggleFocusOrder,
    openQuickModModal,
    openNewOrderModal,
    viewOrderHistory,
    selectMenuCategory,
    selectMenuCategoryIndex,
    selectMenuItem,
    setQuickModQty,
    addMenuItemByIndex,
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
