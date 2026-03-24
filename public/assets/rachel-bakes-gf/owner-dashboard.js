/**
 * Rachel Bakes GF — production + pickup board (mocked data only).
 */
(function () {
  'use strict';

  var orders = [];

  /** status: new | confirmed | in_prep | ready | picked_up */
  /** payment: unpaid | pay_at_pickup | paid */
  /** pickupBoard: today | tomorrow — kanban shows `today` only */
  var initialOrders = [
    {
      id: 'r42-901',
      customer: 'Sarah M.',
      summary: '2 dz pretzel bites + dip',
      total: 48,
      pickupLabel: 'Today · 10:30a',
      pickupDate: 'Mar 22, 2025',
      pickupBoard: 'today',
      status: 'new',
      payment: 'unpaid',
      orderNotes: 'Extra salt on half the tray. Birthday party for 8yo.',
      pickupNotes: 'Text when ready — front lot.',
      contact: 'sarah.m@email.com · (816) 555-0142',
      lineItems: [
        { label: 'Pretzel bites (2 dz)', prep: 'day_of', bucket: 'pretzel', qty: 2 },
        { label: 'Honey mustard dip', prep: 'day_of', bucket: 'other', qty: 1 },
      ],
    },
    {
      id: 'r42-902',
      customer: 'James K.',
      summary: '1 dz cinn rolls + 1 dz pretzel',
      total: 52,
      pickupLabel: 'Today · 2:00p',
      pickupDate: 'Mar 22, 2025',
      pickupBoard: 'today',
      status: 'confirmed',
      payment: 'pay_at_pickup',
      orderNotes: 'First time ordering. Nut-free for kids.',
      pickupNotes: '',
      contact: 'james.k@email.com',
      lineItems: [
        { label: 'Cinnamon rolls (1 dz)', prep: 'tonight', bucket: 'cinnamon', qty: 1 },
        { label: 'Pretzel bites (1 dz)', prep: 'day_of', bucket: 'pretzel', qty: 1 },
      ],
    },
    {
      id: 'r42-903',
      customer: 'Liberty Youth Soccer',
      summary: '4 dz pretzel bites (game day)',
      total: 88,
      pickupLabel: 'Today · 8:45a',
      pickupDate: 'Mar 22, 2025',
      pickupBoard: 'today',
      status: 'in_prep',
      payment: 'paid',
      paymentMethodKey: 'zelle',
      orderNotes: 'Split into two boxes labeled A / B.',
      pickupNotes: 'White SUV.',
      contact: 'treasurer@lysoccer.org',
      lineItems: [{ label: 'Pretzel bites (4 dz)', prep: 'day_of', bucket: 'pretzel', qty: 4 }],
    },
    {
      id: 'r42-904',
      customer: 'Maria L.',
      summary: 'Carrot cake (custom)',
      total: 65,
      pickupLabel: 'Today · 11:00a',
      pickupDate: 'Mar 22, 2025',
      pickupBoard: 'today',
      status: 'ready',
      payment: 'pay_at_pickup',
      orderNotes: 'Cream cheese frosting; chopped nuts on top.',
      pickupNotes: 'Fragile — top rack.',
      contact: '(816) 555-0199',
      lineItems: [{ label: 'Carrot cake (custom)', prep: 'tonight', bucket: 'cake', qty: 1 }],
    },
    {
      id: 'r42-905',
      customer: 'Chris P.',
      summary: '1 dz cinn + 1 dz oatmeal cream pies',
      total: 44,
      pickupLabel: 'Today · 5:30p',
      pickupDate: 'Mar 22, 2025',
      pickupBoard: 'today',
      status: 'picked_up',
      payment: 'paid',
      paymentMethodKey: 'card_stripe',
      soldDate: 'Mar 22, 2025',
      orderNotes: '',
      pickupNotes: 'Picked up.',
      contact: 'chris.p@email.com',
      lineItems: [
        { label: 'Cinnamon rolls (1 dz)', prep: 'tonight', bucket: 'cinnamon', qty: 1 },
        { label: 'Oatmeal cream pies (1 dz)', prep: 'tonight', bucket: 'oatmeal', qty: 1 },
      ],
    },
    {
      id: 'r42-906',
      customer: 'PTA bake sale',
      summary: '2 dz oatmeal cream pies',
      total: 36,
      pickupLabel: 'Today · 7:00a',
      pickupDate: 'Mar 22, 2025',
      pickupBoard: 'today',
      status: 'confirmed',
      payment: 'unpaid',
      orderNotes: 'No peanuts — school policy.',
      pickupNotes: 'Side door.',
      contact: 'pta@schools.org',
      lineItems: [{ label: 'Oatmeal cream pies (2 dz)', prep: 'tonight', bucket: 'oatmeal', qty: 2 }],
    },
    {
      id: 'r42-907',
      customer: 'Andrea W.',
      summary: 'Carrot cake (custom) + 1 dz pretzel',
      total: 92,
      pickupLabel: 'Tomorrow · 6:00p',
      pickupDate: 'Mar 23, 2025',
      pickupBoard: 'tomorrow',
      status: 'new',
      payment: 'unpaid',
      orderNotes: 'Message on cake: "Ten years — still sweet."',
      pickupNotes: '',
      contact: '(913) 555-0220',
      lineItems: [
        { label: 'Carrot cake (custom)', prep: 'tonight', bucket: 'cake', qty: 1 },
        { label: 'Pretzel bites (1 dz)', prep: 'day_of', bucket: 'pretzel', qty: 1 },
      ],
    },
    {
      id: 'r42-908',
      customer: 'Hannah R.',
      summary: '2 dz dinner rolls (holiday table)',
      total: 48,
      pickupLabel: 'Tomorrow · 12:00p',
      pickupDate: 'Mar 23, 2025',
      pickupBoard: 'tomorrow',
      status: 'confirmed',
      payment: 'pay_at_pickup',
      orderNotes: 'Pull-apart tray for family dinner.',
      pickupNotes: '',
      contact: 'hannah.r@email.com',
      lineItems: [{ label: 'Dinner rolls (2 dz)', prep: 'tonight', bucket: 'dinner', qty: 2 }],
    },
  ];

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

  /** Mar 22, 2025 — mock “today” for summary cards */
  var MOCK_TODAY_START = new Date(2025, 2, 22);
  var MOCK_WEEK_START = new Date(2025, 2, 16);
  var MOCK_WEEK_END = new Date(2025, 2, 22, 23, 59, 59);

  function parseSoldDate(s) {
    if (!s) return null;
    var d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }

  function sameCalendarDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function soldDateInWeek(d) {
    return d && d >= MOCK_WEEK_START && d <= MOCK_WEEK_END;
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
    rows.forEach(function (o) {
      var d = parseSoldDate(o.soldDate);
      if (d && sameCalendarDay(d, MOCK_TODAY_START)) todayTotal += o.total;
      if (d && soldDateInWeek(d)) weekTotal += o.total;
      var cat = ledgerCategory(o);
      if (cat === 'Pretzel Bites') pretzelRev += o.total;
      if (cat !== 'Pretzel Bites') cakesRev += o.total;
    });
    document.getElementById('ledger-sum-today').textContent = money(todayTotal);
    document.getElementById('ledger-sum-week').textContent = money(weekTotal);
    document.getElementById('ledger-sum-pretzel').textContent = money(pretzelRev);
    document.getElementById('ledger-sum-cakes').textContent = money(cakesRev);
  }

  var state = {
    activeTab: 'kitchen',
    preorderOpen: true,
    customOpen: true,
    dailyCap: 1200,
    waitlist: 14,
    statusMessage: 'Holiday week — may close early if the day fills.',
    selectedId: null,
    expandedPlanner: {},
    messageLog: [
      { t: '7:12a', text: 'Confirmation sent · Sarah M.' },
      { t: '7:08a', text: 'Ready for pickup · Maria L.' },
    ],
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

  function todayOrders() {
    return orders.filter(function (o) {
      return o.pickupBoard === 'today';
    });
  }

  function renderSummary() {
    var list = todayOrders();
    var count = list.length;
    var sales = 0;
    var unpaid = 0;
    list.forEach(function (o) {
      sales += o.total;
      if (o.payment === 'unpaid') unpaid += 1;
    });
    document.getElementById('sum-preorder').innerHTML =
      state.preorderOpen ? '<span class="ob-pill-open">Open</span>' : '<span class="ob-pill-closed">Closed</span>';
    document.getElementById('sum-custom').innerHTML =
      state.customOpen ? '<span class="ob-pill-open">Open</span>' : '<span class="ob-pill-closed">Closed</span>';
    document.getElementById('sum-pickup-count').textContent = String(count);
    document.getElementById('sum-today-sales').textContent = money(sales);
    document.getElementById('sum-unpaid').textContent = String(unpaid);
    document.getElementById('sum-waitlist').textContent = String(state.waitlist);
    document.getElementById('sum-daily-cap').textContent = money(state.dailyCap);
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
      o.lineItems.forEach(function (li) {
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
    var r = rollupPlanner();
    var tonightEl = document.getElementById('planner-tonight');
    var dayofEl = document.getElementById('planner-dayof');
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
    var board = document.getElementById('kanban-board');
    board.innerHTML = '';
    var list = todayOrders();

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
    renderSummary();
    renderPlanner();
    renderKanban();
    renderLedgerSummary();
    renderLedger();
    renderMessages();
  }

  function logMessage(text) {
    var now = new Date();
    var t = now.getHours() + ':' + (now.getMinutes() < 10 ? '0' : '') + now.getMinutes();
    state.messageLog.unshift({ t: t, text: text });
    if (state.messageLog.length > 14) state.messageLog.pop();
  }

  function renderMessages() {
    var root = document.getElementById('msg-list');
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

  function wireChrome() {
    document.getElementById('drawer-backdrop').addEventListener('click', closeDrawer);
    document.getElementById('drawer-close').addEventListener('click', closeDrawer);
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    var po = document.getElementById('ctrl-preorder-open');
    var co = document.getElementById('ctrl-custom-open');
    var cap = document.getElementById('ctrl-daily-cap');
    var msg = document.getElementById('ctrl-status-msg');
    po.checked = state.preorderOpen;
    co.checked = state.customOpen;
    cap.value = String(state.dailyCap);
    msg.value = state.statusMessage;

    po.addEventListener('change', function () {
      state.preorderOpen = po.checked;
      renderSummary();
    });
    co.addEventListener('change', function () {
      state.customOpen = co.checked;
      renderSummary();
    });
    cap.addEventListener('change', function () {
      state.dailyCap = parseInt(cap.value, 10) || 0;
      renderSummary();
    });
    msg.addEventListener('input', function () {
      state.statusMessage = msg.value;
    });

    document.getElementById('btn-open-notify').addEventListener('click', function () {
      state.preorderOpen = true;
      po.checked = true;
      state.waitlist = 0;
      logMessage('Preorder opened · waitlist notified (prototype)');
      refresh();
    });

    document.querySelectorAll('.ob-tab').forEach(function (btn) {
      btn.addEventListener('click', function () {
        setActiveTab(btn.getAttribute('data-tab'));
      });
    });
  }

  function init() {
    orders = initialOrders.map(function (o) {
      return JSON.parse(JSON.stringify(o));
    });
    orders.forEach(normalizePaymentMethodKey);
    wireChrome();
    refresh();
    setActiveTab('kitchen');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
