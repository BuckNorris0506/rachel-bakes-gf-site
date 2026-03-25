/**
 * Rachel Bakes GF — production + pickup board (kitchen layout).
 * When #preorder_schedule_editor exists, orders hydrate via window.__rbgfApplyOwnerDashboardHydration (preferred) or rbgf-admin-ready.
 */
(function () {
  'use strict';

  function dashboardDebugEnabled() {
    try {
      return (
        typeof window !== 'undefined' &&
        (window.location.search.indexOf('debug=1') !== -1 || window.localStorage.getItem('rbgfDashboardDebug') === '1')
      );
    } catch (e) {
      return false;
    }
  }

  function dbg() {
    if (!dashboardDebugEnabled()) return;
    var a = Array.prototype.slice.call(arguments);
    a.unshift('[rbgf-dashboard]');
    console.log.apply(console, a);
  }

  var orders = [];
  var ownerChromeWired = false;

  /** All in-flight orders for summary + kanban (same preorder rows that power "Preorder load by pickup date" in admin-command). */
  function activePipelineOrders() {
    return orders.filter(function (o) {
      return o.status !== 'picked_up';
    });
  }

  /** Calendar Y-M-D in America/Chicago — must match stored pickup_date strings from Supabase. */
  function ymdChicagoToday() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date());
  }

  function ymdChicagoTomorrow() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'America/Chicago',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(Date.now() + 24 * 60 * 60 * 1000));
  }

  function adminStatusToKanban(s) {
    var map = { new: 'new', confirmed: 'confirmed', baking: 'in_prep', ready: 'ready', picked_up: 'picked_up' };
    return map[s] || 'new';
  }

  function buildLineItemsFromPreorder(o) {
    var li = o.line_items;
    if (!li || typeof li !== 'object') {
      return [{ label: o.items || 'Preorder', prep: 'tonight', bucket: 'cinnamon', qty: 1 }];
    }
    var n = function (k) {
      return Number(li[k]) || 0;
    };
    var out = [];
    if (n('pretzel_20_orders')) out.push({ label: 'Pretzel bites', prep: 'day_of', bucket: 'pretzel', qty: n('pretzel_20_orders') });
    if (n('cinnamon_6') || n('cinnamon_12'))
      out.push({
        label: 'Cinnamon rolls',
        prep: 'tonight',
        bucket: 'cinnamon',
        qty: n('cinnamon_6') + n('cinnamon_12'),
      });
    if (n('cream_pies')) out.push({ label: 'Oatmeal cream pies', prep: 'tonight', bucket: 'oatmeal', qty: n('cream_pies') });
    if (n('rolls_6') || n('rolls_12'))
      out.push({ label: 'Dinner rolls', prep: 'tonight', bucket: 'dinner', qty: n('rolls_6') + n('rolls_12') });
    return out.length ? out : [{ label: o.items || 'Preorder', prep: 'tonight', bucket: 'custom', qty: 1 }];
  }

  function mapOneAdminOrder(o, kind) {
    var id = kind + '-' + String(o.id);
    var pd = (o.pickup_date && String(o.pickup_date).slice(0, 10)) || '';
    var tToday = ymdChicagoToday();
    var tTom = ymdChicagoTomorrow();
    var board = pd === tToday ? 'today' : pd === tTom ? 'tomorrow' : 'today';
    var total = (o.amount_cents != null ? Number(o.amount_cents) : 0) / 100;
    var lineItems =
      kind === 'preorder'
        ? buildLineItemsFromPreorder(o)
        : [{ label: o.items || 'Custom order', prep: 'tonight', bucket: 'cake', qty: 1 }];
    var summaryText = o.items != null && o.items !== '' ? o.items : o.order_details || '';
    return {
      id: id,
      customer: o.name || '—',
      summary: summaryText,
      total: total,
      pickupLabel: (pd || 'TBD') + (o.pickup_window ? ' · ' + o.pickup_window : ''),
      pickupDate: pd,
      pickupBoard: board,
      status: adminStatusToKanban(o.status),
      payment: 'unpaid',
      paymentMethodKey: 'card_stripe',
      lineItems: lineItems,
      orderNotes: o.notes || '',
      pickupNotes: '',
      contact: o.contact || '',
    };
  }

  function hydrateFromAdmin(detail) {
    var win = typeof window !== 'undefined' ? window : {};
    var live =
      typeof win.__rbgfGetAdminState === 'function'
        ? win.__rbgfGetAdminState()
        : null;
    var pre =
      live && Array.isArray(live.preorders)
        ? live.preorders
        : (detail && detail.preorders) || [];
    var cu =
      live && Array.isArray(live.customOrders)
        ? live.customOrders
        : (detail && detail.customOrders) || [];
    dbg('hydrateFromAdmin detail.preorders len=', pre.length, 'sample=', pre[0]);
    dbg('hydrateFromAdmin detail.customOrders len=', cu.length, 'sample=', cu[0]);
    orders = [];
    pre.forEach(function (o) {
      orders.push(mapOneAdminOrder(o, 'preorder'));
    });
    cu.forEach(function (o) {
      orders.push(mapOneAdminOrder(o, 'custom'));
    });
    orders.forEach(normalizePaymentMethodKey);
    dbg(
      'after hydrate orders.length=',
      orders.length,
      'activePipelineOrders().length=',
      activePipelineOrders().length
    );
  }

  /** Kanban status: new | confirmed | in_prep | ready | picked_up */
  var STATUS_ORDER = ['new', 'confirmed', 'in_prep', 'ready', 'picked_up'];
  var STATUS_LABEL = {
    new: 'New',
    confirmed: 'Confirmed',
    in_prep: 'In Prep',
    ready: 'Ready',
    picked_up: 'Picked Up',
  };

  var PAY_LABEL = {
    unpaid: 'Unpaid',
    pay_at_pickup: 'Pay at Pickup',
    paid: 'Paid',
  };

  /** When payment is Paid — ledger + drawer use these exact labels */
  var PAYMENT_METHOD_KEYS = ['cash', 'venmo', 'card_stripe', 'zelle', 'other'];
  var PAYMENT_METHOD_LABEL = {
    cash: 'Cash',
    venmo: 'Venmo',
    card_stripe: 'Card (Stripe)',
    zelle: 'Zelle',
    other: 'Other',
  };

  function ledgerEligible(o) {
    return o.status === 'picked_up' && o.payment === 'paid';
  }

  /** Ledger rows are derived from orders (one row per order id) — no duplicate rows. */
  function ledgerRows() {
    orders.forEach(stampSoldDate);
    return orders.filter(ledgerEligible);
  }

  function normalizePaymentMethodKey(o) {
    if (o.paymentMethodKey && PAYMENT_METHOD_LABEL[o.paymentMethodKey]) return;
    var legacy = o.paymentMethod;
    if (legacy === 'Card' || legacy === 'Card (Stripe)') o.paymentMethodKey = 'card_stripe';
    else if (legacy === 'Cash') o.paymentMethodKey = 'cash';
    else if (legacy === 'Venmo') o.paymentMethodKey = 'venmo';
    else if (legacy === 'Zelle') o.paymentMethodKey = 'zelle';
    else if (legacy === 'Other') o.paymentMethodKey = 'other';
  }

  /** First time an order becomes a completed sale, stamp date + default payment method for ledger. */
  function stampSoldDate(o) {
    if (ledgerEligible(o)) {
      if (!o.soldDate) {
        o.soldDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
      }
      normalizePaymentMethodKey(o);
      if (!o.paymentMethodKey || !PAYMENT_METHOD_LABEL[o.paymentMethodKey]) o.paymentMethodKey = 'card_stripe';
    }
  }

  function startOfToday() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function weekBoundsNow() {
    var end = new Date();
    end.setHours(23, 59, 59, 999);
    var start = new Date(end);
    start.setDate(start.getDate() - 6);
    start.setHours(0, 0, 0, 0);
    return { start: start, end: end };
  }

  function parseSoldDate(s) {
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function sameCalendarDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function soldDateInWeek(d) {
    if (!d) return false;
    var w = weekBoundsNow();
    return d >= w.start && d <= w.end;
  }

  /**
   * Pretzel Bites | Cinnamon Rolls | Oatmeal Cream Pies | Dinner Rolls | Carrot cake | Other/Custom | Mixed
   * Mixed = multiple major categories in one order.
   */
  function ledgerCategory(o) {
    if (!o.lineItems || !o.lineItems.length) return 'Other/Custom';
    var majors = {};
    o.lineItems.forEach(function (li) {
      var b = li.bucket;
      if (b === 'pretzel') majors.pretzel = true;
      else if (b === 'cinnamon') majors.cinnamon = true;
      else if (b === 'oatmeal') majors.oatmeal = true;
      else if (b === 'dinner') majors.dinner = true;
      else if (b === 'cake') majors.cake = true;
      else majors.other = true;
    });
    var keys = Object.keys(majors);
    if (keys.length > 1) return 'Mixed';
    if (majors.pretzel) return 'Pretzel Bites';
    if (majors.cinnamon) return 'Cinnamon Rolls';
    if (majors.oatmeal) return 'Oatmeal Cream Pies';
    if (majors.dinner) return 'Dinner Rolls';
    if (majors.cake) return 'Carrot cake';
    return 'Other/Custom';
  }

  function orderTypeLabel(o) {
    var s = (o.summary || '').toLowerCase();
    if (s.indexOf('custom') !== -1 || s.indexOf('carrot cake') !== -1) return 'Custom';
    return 'Preorder';
  }

  function paymentMethodLabel(o) {
    normalizePaymentMethodKey(o);
    var k = o.paymentMethodKey;
    if (k && PAYMENT_METHOD_LABEL[k]) return PAYMENT_METHOD_LABEL[k];
    return PAYMENT_METHOD_LABEL.card_stripe;
  }

  function renderLedgerSummary() {
    var rows = ledgerRows();
    var todayTotal = 0;
    var weekTotal = 0;
    var pretzelRev = 0;
    var cakesRev = 0;
    var todayStart = startOfToday();
    rows.forEach(function (o) {
      var d = parseSoldDate(o.soldDate);
      if (d && sameCalendarDay(d, todayStart)) todayTotal += o.total;
      if (d && soldDateInWeek(d)) weekTotal += o.total;
      var cat = ledgerCategory(o);
      if (cat === 'Pretzel Bites') pretzelRev += o.total;
      if (cat !== 'Pretzel Bites') cakesRev += o.total;
    });
    var lt = document.getElementById('ledger-sum-today');
    var lw = document.getElementById('ledger-sum-week');
    var lp = document.getElementById('ledger-sum-pretzel');
    var lc = document.getElementById('ledger-sum-cakes');
    if (lt) lt.textContent = money(todayTotal);
    if (lw) lw.textContent = money(weekTotal);
    if (lp) lp.textContent = money(pretzelRev);
    if (lc) lc.textContent = money(cakesRev);
  }

  var state = {
    activeTab: 'kitchen',
    preorderOpen: false,
    customOpen: false,
    dailyCap: 0,
    waitlist: 0,
    statusMessage: '',
    selectedId: null,
    expandedPlanner: {},
    messageLog: [],
  };

  function money(n) {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);
  }

  function escapeHtml(s) {
    if (s == null || s === '') return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function renderSummary() {
    var list = activePipelineOrders();
    var count = list.length;
    var sales = 0;
    var unpaid = 0;
    list.forEach(function (o) {
      sales += o.total;
      if (o.payment === 'unpaid') unpaid += 1;
    });
    var po = document.getElementById('preorder_open');
    var co = document.getElementById('custom_orders_open');
    var capEl = document.getElementById('daily_cap_dollars');
    var wl = document.getElementById('waitlist_count');
    var preorderOpen = po ? po.checked : state.preorderOpen;
    var customOpen = co ? co.checked : state.customOpen;
    var capDollars = capEl ? parseFloat(String(capEl.value || '0'), 10) : state.dailyCap;
    if (!Number.isFinite(capDollars)) capDollars = state.dailyCap;
    var waitN = wl ? parseInt(String(wl.textContent || '0').replace(/[^\d]/g, ''), 10) : state.waitlist;
    if (!Number.isFinite(waitN)) waitN = state.waitlist;

    var sp = document.getElementById('sum-preorder');
    var sc = document.getElementById('sum-custom');
    var spc = document.getElementById('sum-pickup-count');
    var sts = document.getElementById('sum-today-sales');
    var su = document.getElementById('sum-unpaid');
    var sw = document.getElementById('sum-waitlist');
    var sdc = document.getElementById('sum-daily-cap');
    if (sp)
      sp.innerHTML = preorderOpen ? '<span class="ob-pill-open">Open</span>' : '<span class="ob-pill-closed">Closed</span>';
    if (sc)
      sc.innerHTML = customOpen ? '<span class="ob-pill-open">Open</span>' : '<span class="ob-pill-closed">Closed</span>';
    if (spc) spc.textContent = String(count);
    if (sts) sts.textContent = money(sales);
    if (su) su.textContent = String(unpaid);
    if (sw) sw.textContent = String(waitN);
    if (sdc) sdc.textContent = money(capDollars);
    dbg('renderSummary done; activePipeline count=', count);
  }

  function rollupPlanner() {
    var tonightBuckets = {
      cake: [],
      cinnamon: [],
      oatmeal: [],
      dinner: [],
      custom: [],
    };
    var dayBuckets = {
      pretzel: [],
      other: [],
    };
    orders.forEach(function (o) {
      if (o.status === 'picked_up') return;
      var lines = o.lineItems;
      if (!lines || !lines.length) return;
      lines.forEach(function (li) {
        var entry = { customer: o.customer, id: o.id, label: li.label, qty: li.qty || 1 };
        if (li.prep === 'tonight') {
          if (tonightBuckets[li.bucket] != null) tonightBuckets[li.bucket].push(entry);
          else tonightBuckets.custom.push(entry);
        } else if (li.prep === 'day_of') {
          if (dayBuckets[li.bucket]) dayBuckets[li.bucket].push(entry);
          else dayBuckets.other.push(entry);
        }
      });
    });
    return { tonight: tonightBuckets, dayof: dayBuckets };
  }

  function sumQty(entries) {
    var t = 0;
    entries.forEach(function (e) {
      t += e.qty || 1;
    });
    return t;
  }

  var TONIGHT_ROWS = [
    { key: 'cake', label: 'Carrot cake (custom)', unit: 'orders' },
    { key: 'cinnamon', label: 'Cinnamon rolls', unit: 'dz' },
    { key: 'oatmeal', label: 'Oatmeal cream pies', unit: 'dz' },
    { key: 'dinner', label: 'Dinner rolls', unit: 'dz' },
    { key: 'custom', label: 'Custom / other baked', unit: 'items' },
  ];

  var DAYOF_ROWS = [
    { key: 'pretzel', label: 'Pretzel bites', unit: 'dz' },
    { key: 'other', label: 'Other same-day', unit: 'items' },
  ];

  function renderPlanner() {
    dbg('renderPlanner');
    var r = rollupPlanner();
    var tonightEl = document.getElementById('planner-tonight');
    var dayofEl = document.getElementById('planner-dayof');
    if (!tonightEl || !dayofEl) return;
    tonightEl.innerHTML = '';
    dayofEl.innerHTML = '';

    TONIGHT_ROWS.forEach(function (row) {
      var entries = r.tonight[row.key];
      var total = sumQty(entries);
      if (!entries.length && total === 0) total = 0;
      var expandKey = 'tn-' + row.key;
      var expanded = state.expandedPlanner[expandKey];
      var rowEl = buildPlannerRow(row.label, total, row.unit, entries, expandKey, expanded);
      tonightEl.appendChild(rowEl);
    });

    DAYOF_ROWS.forEach(function (row) {
      var entries = r.dayof[row.key];
      var total = sumQty(entries);
      var expandKey = 'do-' + row.key;
      var expanded = state.expandedPlanner[expandKey];
      var rowEl = buildPlannerRow(row.label, total, row.unit, entries, expandKey, expanded);
      dayofEl.appendChild(rowEl);
    });
  }

  function buildPlannerRow(title, total, unit, entries, expandKey, expanded) {
    var wrap = document.createElement('div');
    wrap.className = 'ob-planner-row-wrap';

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'ob-planner-row' + (entries.length ? ' ob-planner-row--expandable' : '');
    btn.setAttribute('aria-expanded', entries.length ? (expanded ? 'true' : 'false') : 'true');
    if (!entries.length) btn.disabled = true;

    var left = document.createElement('div');
    left.className = 'ob-planner-row-main';
    left.innerHTML =
      '<span class="ob-planner-row-title">' +
      escapeHtml(title) +
      '</span>' +
      '<span class="ob-planner-row-meta">' +
      (entries.length ? 'Tap for list' : 'Nothing scheduled') +
      '</span>';

    var right = document.createElement('div');
    right.className = 'ob-planner-row-total';
    right.innerHTML =
      '<strong>' +
      (total ? escapeHtml(String(total)) : '0') +
      '</strong> <span class="ob-planner-row-unit">' +
      escapeHtml(unit) +
      '</span>';

    btn.appendChild(left);
    btn.appendChild(right);

    if (entries.length) {
      btn.addEventListener('click', function () {
        state.expandedPlanner[expandKey] = !state.expandedPlanner[expandKey];
        renderPlanner();
      });
    }

    wrap.appendChild(btn);

    if (entries.length && expanded) {
      var ul = document.createElement('ul');
      ul.className = 'ob-planner-detail';
      entries.forEach(function (e) {
        var li = document.createElement('li');
        li.textContent = e.customer + ' · ' + e.label + ' (' + e.id + ')';
        ul.appendChild(li);
      });
      wrap.appendChild(ul);
    }

    return wrap;
  }

  function statusClass(st) {
    return 'ob-kanban-status ob-kanban-status--' + st;
  }

  function payClass(p) {
    return 'ob-pay ob-pay--' + p;
  }

  function renderKanban() {
    dbg('renderKanban; activePipeline len=', activePipelineOrders().length);
    var board = document.getElementById('kanban-board');
    if (!board) return;
    board.innerHTML = '';
    var list = activePipelineOrders();

    STATUS_ORDER.forEach(function (st) {
      var inCol = list.filter(function (o) {
        return o.status === st;
      });

      var col = document.createElement('div');
      col.className = 'ob-kanban-col';
      col.dataset.status = st;

      var h = document.createElement('h3');
      h.className = 'ob-kanban-col-head';
      h.innerHTML =
        '<span class="' +
        statusClass(st) +
        '">' +
        escapeHtml(STATUS_LABEL[st]) +
        '</span>' +
        '<span class="ob-kanban-col-count">' +
        inCol.length +
        '</span>';

      var stack = document.createElement('div');
      stack.className = 'ob-kanban-cards';

      inCol.forEach(function (o) {
        var card = document.createElement('button');
        card.type = 'button';
        card.className = 'ob-kanban-card';
        card.dataset.orderId = o.id;
        card.innerHTML =
          '<span class="ob-kanban-card-name">' +
          escapeHtml(o.customer) +
          '</span>' +
          '<span class="ob-kanban-card-pickup">' +
          escapeHtml(o.pickupLabel) +
          '</span>' +
          '<span class="ob-kanban-card-sum">' +
          escapeHtml(o.summary) +
          '</span>' +
          '<span class="ob-kanban-card-money">' +
          money(o.total) +
          '</span>' +
          '<span class="' +
          payClass(o.payment) +
          '">' +
          escapeHtml(PAY_LABEL[o.payment]) +
          '</span>' +
          '<span class="ob-kanban-card-status ' +
          statusClass(o.status) +
          ' ob-kanban-card-status--chip">' +
          escapeHtml(STATUS_LABEL[o.status]) +
          '</span>';

        card.addEventListener('click', function () {
          openDrawer(o.id);
        });
        stack.appendChild(card);
      });

      col.appendChild(h);
      col.appendChild(stack);
      board.appendChild(col);
    });
  }

  function openDrawer(id) {
    state.selectedId = id;
    var root = document.getElementById('drawer-root');
    var o = orders.find(function (x) {
      return x.id === id;
    });
    if (!o) return;
    document.getElementById('drawer-title').textContent = o.customer + ' · ' + o.id;
    var body = document.getElementById('drawer-body');
    body.innerHTML =
      '<div class="ob-drawer-block"><h3>Pickup</h3><p>' +
      escapeHtml(o.pickupLabel) +
      '</p></div>' +
      '<div class="ob-drawer-block"><h3>Items</h3><p>' +
      escapeHtml(o.summary) +
      '</p></div>' +
      '<div class="ob-drawer-block"><h3>Total</h3><p>' +
      money(o.total) +
      '</p></div>' +
      '<div class="ob-drawer-block"><h3>Payment</h3><p><span class="' +
      payClass(o.payment) +
      ' ob-pay--lg">' +
      escapeHtml(PAY_LABEL[o.payment]) +
      '</span></p>' +
      (o.payment === 'paid'
        ? '<p class="ob-drawer-method-line"><strong>Method:</strong> ' + escapeHtml(paymentMethodLabel(o)) + '</p>'
        : '') +
      '</div>' +
      '<div class="ob-drawer-block"><h3>Status</h3><p><span class="' +
      statusClass(o.status) +
      ' ob-kanban-status--inline">' +
      escapeHtml(STATUS_LABEL[o.status]) +
      '</span></p></div>' +
      '<div class="ob-drawer-block"><h3>Order notes</h3><p>' +
      (o.orderNotes ? escapeHtml(o.orderNotes) : '—') +
      '</p></div>' +
      '<div class="ob-drawer-block"><h3>Pickup notes</h3><p>' +
      (o.pickupNotes ? escapeHtml(o.pickupNotes) : '—') +
      '</p></div>' +
      '<div class="ob-drawer-block"><h3>Contact</h3><p>' +
      escapeHtml(o.contact) +
      '</p></div>' +
      '<div class="ob-drawer-actions"><p class="ob-drawer-actions-label">Move order</p>' +
      '<div class="ob-drawer-btn-row" id="drawer-workflow"></div>' +
      '<p class="ob-drawer-actions-label">Payment</p>' +
      '<div class="ob-drawer-btn-row" id="drawer-pay"></div>' +
      '<p class="ob-drawer-actions-label">Payment method</p>' +
      '<p class="ob-drawer-hint" id="drawer-pay-method-hint"></p>' +
      '<div class="ob-drawer-btn-row ob-drawer-btn-row--method" id="drawer-pay-method"></div></div>';

    var wf = document.getElementById('drawer-workflow');
    function addWf(label, to) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ob-btn ob-btn--drawer ob-btn--primary';
      btn.textContent = label;
      btn.addEventListener('click', function () {
        setOrderStatus(o, to);
      });
      wf.appendChild(btn);
    }
    if (o.status === 'new') {
      addWf('Confirm', 'confirmed');
      addWf('Mark in prep', 'in_prep');
    }
    if (o.status === 'confirmed') addWf('Mark in prep', 'in_prep');
    if (o.status === 'in_prep') addWf('Mark ready', 'ready');
    if (o.status === 'ready') addWf('Mark picked up', 'picked_up');

    var payRow = document.getElementById('drawer-pay');
    var payBtns = [
      { label: 'Mark unpaid', to: 'unpaid' },
      { label: 'Mark pay at pickup', to: 'pay_at_pickup' },
      { label: 'Mark paid', to: 'paid' },
    ];
    payBtns.forEach(function (b) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className =
        'ob-btn ob-btn--drawer' + (o.payment === b.to ? ' ob-btn--drawer-active' : ' ob-btn--ghost');
      btn.textContent = b.label;
      btn.addEventListener('click', function () {
        o.payment = b.to;
        stampSoldDate(o);
        logMessage('Payment · ' + PAY_LABEL[b.to] + ' · ' + o.customer);
        closeDrawer();
        refresh();
      });
      payRow.appendChild(btn);
    });

    var hint = document.getElementById('drawer-pay-method-hint');
    var methodRow = document.getElementById('drawer-pay-method');
    normalizePaymentMethodKey(o);
    if (o.payment !== 'paid') {
      hint.textContent = 'Mark the order paid to choose Cash, Venmo, Card (Stripe), Zelle, or Other.';
    } else {
      hint.textContent = '';
    }
    PAYMENT_METHOD_KEYS.forEach(function (key) {
      var mbtn = document.createElement('button');
      mbtn.type = 'button';
      mbtn.className =
        'ob-btn ob-btn--drawer ob-btn--method' +
        (o.paymentMethodKey === key ? ' ob-btn--drawer-active' : ' ob-btn--ghost');
      mbtn.textContent = PAYMENT_METHOD_LABEL[key];
      mbtn.disabled = o.payment !== 'paid';
      mbtn.addEventListener('click', function () {
        if (o.payment !== 'paid') return;
        o.paymentMethodKey = key;
        stampSoldDate(o);
        logMessage('Payment method · ' + PAYMENT_METHOD_LABEL[key] + ' · ' + o.customer);
        closeDrawer();
        refresh();
      });
      methodRow.appendChild(mbtn);
    });

    root.classList.add('ob-drawer-root--open');
    root.setAttribute('aria-hidden', 'false');
    document.getElementById('drawer-panel').focus();
  }

  function setOrderStatus(o, st) {
    o.status = st;
    stampSoldDate(o);
    if (st === 'confirmed') logMessage('Confirmed · ' + o.customer);
    if (st === 'in_prep') logMessage('In prep · ' + o.customer);
    if (st === 'ready') logMessage('Ready · ' + o.customer);
    if (st === 'picked_up') logMessage('Picked up · ' + o.customer);
    closeDrawer();
    refresh();
  }

  function closeDrawer() {
    state.selectedId = null;
    var root = document.getElementById('drawer-root');
    root.classList.remove('ob-drawer-root--open');
    root.setAttribute('aria-hidden', 'true');
  }

  function renderLedger() {
    var wrap = document.getElementById('ledger-table-wrap');
    var empty = document.getElementById('ledger-empty');
    if (!wrap || !empty) return;
    var rows = ledgerRows();
    if (!rows.length) {
      empty.classList.remove('ob-ledger-empty--hidden');
      wrap.innerHTML = '';
      return;
    }
    empty.classList.add('ob-ledger-empty--hidden');
    rows.sort(function (a, b) {
      return String(b.soldDate || '').localeCompare(String(a.soldDate || ''));
    });
    var table = document.createElement('table');
    table.className = 'ob-ledger-table';
    table.setAttribute('role', 'table');
    table.innerHTML =
      '<thead><tr>' +
      '<th scope="col">Date</th>' +
      '<th scope="col">Customer</th>' +
      '<th scope="col">Order ID</th>' +
      '<th scope="col">Type</th>' +
      '<th scope="col">Items</th>' +
      '<th scope="col">Total</th>' +
      '<th scope="col">Payment Method</th>' +
      '<th scope="col">Category</th>' +
      '<th scope="col">Pickup Date</th>' +
      '</tr></thead><tbody></tbody>';
    var tbody = table.querySelector('tbody');
    rows.forEach(function (o) {
      var tr = document.createElement('tr');
      tr.innerHTML =
        '<td>' +
        escapeHtml(o.soldDate || '—') +
        '</td>' +
        '<td>' +
        escapeHtml(o.customer) +
        '</td>' +
        '<td><code class="ob-ledger-code">' +
        escapeHtml(o.id) +
        '</code></td>' +
        '<td>' +
        escapeHtml(orderTypeLabel(o)) +
        '</td>' +
        '<td>' +
        escapeHtml(o.summary) +
        '</td>' +
        '<td>' +
        money(o.total) +
        '</td>' +
        '<td>' +
        escapeHtml(paymentMethodLabel(o)) +
        '</td>' +
        '<td><span class="ob-ledger-tag">' +
        escapeHtml(ledgerCategory(o)) +
        '</span></td>' +
        '<td>' +
        escapeHtml(o.pickupDate || '—') +
        '</td>';
      tbody.appendChild(tr);
    });
    wrap.innerHTML = '';
    wrap.appendChild(table);
  }

  function setActiveTab(tab) {
    state.activeTab = tab;
    var kitchen = document.getElementById('tab-panel-kitchen');
    var ledger = document.getElementById('tab-panel-ledger');
    var btnK = document.getElementById('tab-btn-kitchen');
    var btnL = document.getElementById('tab-btn-ledger');
    if (!kitchen || !ledger || !btnK || !btnL) return;
    var isKitchen = tab === 'kitchen';
    kitchen.classList.toggle('ob-tab-panel--hidden', !isKitchen);
    kitchen.hidden = !isKitchen;
    ledger.classList.toggle('ob-tab-panel--hidden', isKitchen);
    ledger.hidden = isKitchen;
    btnK.setAttribute('aria-selected', isKitchen ? 'true' : 'false');
    btnL.setAttribute('aria-selected', !isKitchen ? 'true' : 'false');
    if (tab === 'ledger') {
      renderLedgerSummary();
      renderLedger();
    }
  }

  function refresh() {
    dbg('refresh() start');
    try {
      renderSummary();
      renderPlanner();
      renderKanban();
      renderLedgerSummary();
      renderLedger();
      renderMessages();
      dbg('refresh() complete');
    } catch (e) {
      console.error('[rbgf-dashboard] refresh failed', e);
    }
  }

  function logMessage(text) {
    var now = new Date();
    var t = now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();
    state.messageLog.unshift({ t: t, text: text });
    if (state.messageLog.length > 14) state.messageLog.pop();
  }

  function renderMessages() {
    var root = document.getElementById('msg-list');
    if (!root) return;
    root.innerHTML = '';
    state.messageLog.forEach(function (m) {
      var row = document.createElement('div');
      row.className = 'ob-msg-item';
      var timeEl = document.createElement('time');
      timeEl.textContent = m.t;
      var span = document.createElement('span');
      span.textContent = m.text;
      row.appendChild(timeEl);
      row.appendChild(span);
      root.appendChild(row);
    });
  }

  function wireConfigEchoListeners() {
    ['preorder_open', 'custom_orders_open', 'daily_cap_dollars'].forEach(function (id) {
      var el = document.getElementById(id);
      if (!el) return;
      el.addEventListener('change', function () {
        renderSummary();
      });
    });
    var sm = document.getElementById('status_message');
    if (sm) sm.addEventListener('input', renderSummary);
  }

  function wireChrome() {
    var bd = document.getElementById('drawer-backdrop');
    var dc = document.getElementById('drawer-close');
    if (bd) bd.addEventListener('click', closeDrawer);
    if (dc) dc.addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    wireConfigEchoListeners();

    document.querySelectorAll('.ob-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setActiveTab(btn.getAttribute('data-tab'));
      });
    });
  }

  function applyOwnerDashboardHydration(detail) {
    /* Kitchen dashboard: anchor on hero board (schedule editor is below the fold; must not block hydration). */
    if (!document.getElementById('kanban-board')) {
      console.warn('[rbgf-dashboard] applyOwnerDashboardHydration skipped: #kanban-board not in DOM');
      return;
    }
    hydrateFromAdmin(detail || {});
    console.info('[rbgf-dashboard] hydrated', {
      orders: orders.length,
      pipeline: activePipelineOrders().length,
    });
    if (!ownerChromeWired) {
      ownerChromeWired = true;
      wireChrome();
    }
    refresh();
    console.info('[rbgf-dashboard] refresh finished (summary + planner + kanban)');
    setActiveTab('kitchen');
  }

  window.__rbgfApplyOwnerDashboardHydration = applyOwnerDashboardHydration;

  function init() {
    if (!document.getElementById('kanban-board')) {
      dbg('init: no #kanban-board — owner dashboard hydration skipped');
      console.warn('[rbgf-dashboard] init skipped: #kanban-board not in DOM (owner-dashboard.js will not hydrate)');
      return;
    }
    dbg('init: listening for rbgf-admin-ready on document');
    console.info('[rbgf-dashboard] init: listening for rbgf-admin-ready and/or direct __rbgfApplyOwnerDashboardHydration');
    document.addEventListener('rbgf-admin-ready', function onReady(ev) {
      dbg('rbgf-admin-ready fired; detail keys=', ev.detail ? Object.keys(ev.detail) : null);
      document.removeEventListener('rbgf-admin-ready', onReady);
      applyOwnerDashboardHydration(ev.detail);
    });
  }

  document.addEventListener('rbgf-config-applied', function () {
    if (document.getElementById('sum-preorder')) renderSummary();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
