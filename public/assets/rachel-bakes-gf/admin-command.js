/**
 * Rachel Bakes GF — BakeSites owner command center
 * Orders, bake list, ordering & capacity, ledger, customer email actions.
 *
 * Local dev (localhost / 127.0.0.1): if the URL has no ?secret=, we send a
 * default header value so you can open /admin/ without a query string. Set
 * ADMIN_SECRET in bucksites/.env to match LOCAL_DEV_DEFAULT_SECRET (see .env.example).
 * Deployed sites must still use ?secret=<ADMIN_SECRET> — production hostnames are unchanged.
 */
(function () {
  /** Must match ADMIN_SECRET in bucksites/.env for netlify dev */
  var LOCAL_DEV_DEFAULT_SECRET = "local-dev-preview";

  function isLocalDevHostname() {
    var h = window.location.hostname || "";
    return h === "localhost" || h === "127.0.0.1" || h === "[::1]";
  }
  var DEMO_PREORDERS = [
    {
      id: "demo-pre-1",
      name: "Jordan Lee",
      contact: "jordan@example.com",
      order_details: "2× 20-bite pretzel · 1× cinnamon 6-pk",
      line_items: { pretzel_20_orders: 2, cinnamon_6: 1, cinnamon_12: 0, cream_pies: 0, rolls_6: 0, rolls_12: 0 },
      pickup_date: new Date().toISOString().slice(0, 10),
      pickup_window: "Afternoon",
      notes: "Nut-free household",
      amount_cents: 4000,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "demo-pre-2",
      name: "Sam Rivera",
      contact: "sam@example.com",
      order_details: "1× 20-bite pretzel · 2× cream pie",
      line_items: { pretzel_20_orders: 1, cinnamon_6: 0, cinnamon_12: 0, cream_pies: 2, rolls_6: 0, rolls_12: 0 },
      pickup_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      pickup_window: "Late morning",
      notes: "",
      amount_cents: 1800,
      created_at: new Date(Date.now() - 3600000).toISOString(),
    },
  ];
  var DEMO_CUSTOM = [
    {
      id: "demo-cu-1",
      name: "Alex Morgan",
      contact: "alex@example.com",
      event_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
      pickup_date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
      item_type: "Celebration cake",
      servings: "12",
      flavor: "Vanilla / strawberry",
      design_notes: "Minimal piping",
      extra_details: "",
      created_at: new Date(Date.now() - 7200000).toISOString(),
    },
  ];

  var MENU_ROLLUP = [
    { id: "pretzel_bites", label: "Pretzel bites", rx: /pretzel/i, unit: "pack" },
    { id: "cinnamon_rolls", label: "Cinnamon rolls", rx: /cinnamon|roll/i, unit: "tray" },
    { id: "cupcakes", label: "Cupcakes (6-pack)", rx: /cupcake/i, unit: "6-pack" },
    { id: "cookies", label: "Sugar cookies", rx: /cookie/i, unit: "dozen" },
    { id: "cake", label: "Cake", rx: /cake/i, unit: "cake" },
  ];

  /** Placeholder $ cost per sale unit — swap with real COGS later */
  var MENU_COST_CENTS = {
    pretzel_bites: 350,
    cinnamon_rolls: 900,
    cinnamon_6: 700,
    cinnamon_12: 1400,
    cream_pies: 180,
    rolls_6: 500,
    rolls_12: 1000,
    cupcakes: 1200,
    cookies: 800,
    cake: 2500,
    custom_default: 1500,
  };

  /** Pretzel 20-bite orders: production batches (extensible pattern for other SKUs) */
  var PRETZEL_ORDERS_PER_BATCH = 5;

  var STATUS_FLOW = ["new", "confirmed", "baking", "ready", "picked_up"];

  var state = {
    secret: "",
    source: "demo",
    preorders: [],
    customOrders: [],
    filter: "all",
    view: "orders",
    bakeDate: "",
    emailLog: [],
    offlineMode: false,
    preorderScheduleNorm: [],
    dailyCapCents: 100000,
  };

  function $(id) {
    return document.getElementById(id);
  }

  function money(cents) {
    var n = Number(cents);
    if (!Number.isFinite(n)) return "—";
    return "$" + (n / 100).toFixed(2);
  }

  function todayYMD() {
    var d = new Date();
    return d.toISOString().slice(0, 10);
  }

  function tomorrowYMD() {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().slice(0, 10);
  }

  function weekEndYMD() {
    var d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().slice(0, 10);
  }

  function parseQtyFromSegment(seg) {
    var s = String(seg).trim();
    var m = s.match(/^(\d+)\s*(?:x\s*)?/i);
    if (m) return Math.max(1, parseInt(m[1], 10));
    m = s.match(/(\d+)\s*dozen/i);
    if (m) return Math.max(1, parseInt(m[1], 10) * 12);
    return 1;
  }

  function matchMenuId(text) {
    var t = String(text).toLowerCase();
    for (var i = 0; i < MENU_ROLLUP.length; i++) {
      if (MENU_ROLLUP[i].rx.test(t)) return MENU_ROLLUP[i];
    }
    return null;
  }

  function lineItemsToRollupLines(lineItems) {
    if (!lineItems || typeof lineItems !== "object") return [];
    var li = lineItems;
    var lines = [];
    var n = function (k) {
      return Number(li[k]) || 0;
    };
    if (n("pretzel_20_orders"))
      lines.push({
        id: "pretzel_bites",
        label: "Pretzel 20-bite orders",
        qty: n("pretzel_20_orders"),
        unit: "order",
      });
    if (n("cinnamon_6")) lines.push({ id: "cinnamon_6", label: "Cinnamon 6-pk", qty: n("cinnamon_6"), unit: "6-pk" });
    if (n("cinnamon_12")) lines.push({ id: "cinnamon_12", label: "Cinnamon 12-pk", qty: n("cinnamon_12"), unit: "12-pk" });
    if (n("cream_pies")) lines.push({ id: "cream_pies", label: "Oatmeal cream pies", qty: n("cream_pies"), unit: "each" });
    if (n("rolls_6")) lines.push({ id: "rolls_6", label: "Dinner rolls 6-pk", qty: n("rolls_6"), unit: "6-pk" });
    if (n("rolls_12")) lines.push({ id: "rolls_12", label: "Dinner rolls 12-pk", qty: n("rolls_12"), unit: "12-pk" });
    return lines;
  }

  function getPreorderLines(o) {
    if (o.line_items && typeof o.line_items === "object") return lineItemsToRollupLines(o.line_items);
    return parseOrderDetailsToLines(o.items);
  }

  function parseOrderDetailsToLines(orderDetails) {
    var text = orderDetails || "";
    var parts = text.split(/[,;\n]+/);
    var lines = [];
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i].trim();
      if (!seg) continue;
      var qty = parseQtyFromSegment(seg);
      var menu = matchMenuId(seg);
      if (menu) {
        lines.push({ id: menu.id, label: menu.label, qty: qty, unit: menu.unit });
      }
    }
    return lines;
  }

  function statusKey(kind, id) {
    return kind + ":" + String(id);
  }

  function loadStatusMap() {
    try {
      var raw = localStorage.getItem("rbgf_admin_order_status");
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  }

  function saveStatusMap(map) {
    try {
      localStorage.setItem("rbgf_admin_order_status", JSON.stringify(map));
    } catch (e) {
      /* ignore */
    }
  }

  function getStatus(kind, id, fallback) {
    var map = loadStatusMap();
    var k = statusKey(kind, id);
    var v = map[k];
    if (v && STATUS_FLOW.indexOf(v) !== -1) return v;
    return fallback || "new";
  }

  function setStatus(kind, id, status) {
    var map = loadStatusMap();
    map[statusKey(kind, id)] = status;
    saveStatusMap(map);
  }

  function loadEmailLog() {
    try {
      var raw = localStorage.getItem("rbgf_admin_email_log");
      var arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr : [];
    } catch (e) {
      return [];
    }
  }

  function pushEmailLog(entry) {
    var arr = loadEmailLog();
    arr.unshift(entry);
    arr = arr.slice(0, 80);
    try {
      localStorage.setItem("rbgf_admin_email_log", JSON.stringify(arr));
    } catch (e) {
      /* ignore */
    }
    state.emailLog = arr;
  }

  function extractEmail(contact) {
    if (!contact) return "";
    var m = String(contact).match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    return m ? m[0].toLowerCase() : "";
  }

  function normalizePreorders(rows) {
    return (rows || []).map(function (r) {
      return {
        kind: "preorder",
        id: r.id,
        name: r.name || "",
        contact: r.contact || "",
        items: r.order_details || "",
        pickup_date: r.pickup_date || "",
        pickup_window: r.pickup_window || "",
        notes: r.notes || "",
        payment_preference: r.payment_preference || "",
        line_items: r.line_items && typeof r.line_items === "object" ? r.line_items : null,
        amount_cents: r.amount_cents != null ? Number(r.amount_cents) : 0,
        created_at: r.created_at || "",
        status: getStatus("preorder", r.id, "new"),
      };
    });
  }

  function normalizeCustom(rows) {
    return (rows || []).map(function (r) {
      var summary =
        [r.item_type, r.servings ? r.servings + " servings" : "", r.flavor, r.design_notes].filter(Boolean).join(" · ") ||
        "Custom order";
      return {
        kind: "custom",
        id: r.id,
        name: r.name || "",
        contact: r.contact || "",
        items: summary,
        pickup_date: r.pickup_date || r.event_date || "",
        pickup_window: "",
        notes: r.extra_details || "",
        payment_preference: r.payment_preference || "",
        amount_cents: 0,
        created_at: r.created_at || "",
        status: getStatus("custom", r.id, "new"),
      };
    });
  }

  function passesFilter(o, filter) {
    if (filter === "custom") return o.kind === "custom";
    if (filter === "all") return true;
    if (STATUS_FLOW.indexOf(filter) !== -1) return o.status === filter;
    var d = o.pickup_date || (o.created_at ? o.created_at.slice(0, 10) : "");
    var t = todayYMD();
    var tm = tomorrowYMD();
    var wk = weekEndYMD();
    if (filter === "today") return d === t || (!d && o.created_at && o.created_at.slice(0, 10) === t);
    if (filter === "tomorrow") return d === tm;
    if (filter === "week") {
      if (!d) return d;
      return d >= t && d <= wk;
    }
    return true;
  }

  function aggregateBakeForDate(ymd) {
    var totals = {};
    function addLine(lines) {
      for (var i = 0; i < lines.length; i++) {
        var L = lines[i];
        var id = L.id;
        if (!totals[id]) totals[id] = { label: L.label, qty: 0, unit: L.unit };
        totals[id].qty += L.qty;
      }
    }
    state.preorders.forEach(function (o) {
      var pd = o.pickup_date || (o.created_at ? o.created_at.slice(0, 10) : "");
      if (pd !== ymd) return;
      addLine(getPreorderLines(o));
    });
    return Object.keys(totals).map(function (k) {
      return totals[k];
    });
  }

  function estimateCostForOrder(o) {
    if (o.kind === "custom") return MENU_COST_CENTS.custom_default;
    var lines = getPreorderLines(o);
    var sum = 0;
    for (var i = 0; i < lines.length; i++) {
      var c = MENU_COST_CENTS[lines[i].id];
      if (c) sum += c * lines[i].qty;
    }
    if (sum === 0 && o.amount_cents) return Math.round(o.amount_cents * 0.35);
    return sum;
  }

  function profitSnapshot() {
    var rev = 0;
    var cost = 0;
    state.preorders.forEach(function (o) {
      rev += o.amount_cents || 0;
      cost += estimateCostForOrder(o);
    });
    return {
      orderCount: state.preorders.length + state.customOrders.length,
      revenueCents: rev,
      costCents: cost,
      grossCents: rev - cost,
    };
  }

  function headersAdmin() {
    return {
      "x-admin-secret": state.secret,
      "x-admin-password": sessionStorage.getItem("rbgf_admin_password") || "",
    };
  }

  function getPassword() {
    return sessionStorage.getItem("rbgf_admin_password") || "";
  }

  function setPassword(pw) {
    sessionStorage.setItem("rbgf_admin_password", pw);
  }

  async function fetchBakery() {
    try {
      var res = await fetch("/api/admin-bakery", { headers: headersAdmin() });
      var data = await res.json().catch(function () {
        return null;
      });
      if (res.status === 401) throw new Error("Unauthorized");
      if (!res.ok || !data || !data.success) throw new Error((data && data.error) || "Load failed");
      state.source = data.source || "demo";
      state.preorders = normalizePreorders(data.preorders);
      state.customOrders = normalizeCustom(data.custom_orders);
      renderPreorderDateSnapshot();
    } catch (e) {
      if (e && e.message === "Unauthorized") throw e;
      /* Static server / no API: use embedded demo data */
      state.source = "demo";
      state.preorders = normalizePreorders(DEMO_PREORDERS);
      state.customOrders = normalizeCustom(DEMO_CUSTOM);
      renderPreorderDateSnapshot();
    }
  }

  async function sendCustomerEmail(template, order) {
    var to = extractEmail(order.contact);
    if (!to) {
      alert("No email on file for this customer — add an email to the contact field in your records.");
      return;
    }
    var body = {
      template: template,
      to: to,
      customerName: order.name,
      orderSummary: order.items,
      pickupDate: [order.pickup_date, order.pickup_window].filter(Boolean).join(" · "),
      orderId: String(order.id),
      orderType: order.kind,
    };
    var res;
    var data;
    try {
      res = await fetch("/api/admin-customer-email", {
        method: "POST",
        headers: Object.assign({ "Content-Type": "application/json" }, headersAdmin()),
        body: JSON.stringify(body),
      });
      data = await res.json().catch(function () {
        return null;
      });
    } catch (e) {
      pushEmailLog({
        at: new Date().toISOString(),
        template: template,
        to: to,
        demo: true,
        orderId: order.id,
        note: "API unreachable (local static server)",
      });
      alert("Email API not available in static preview — logged locally.");
      renderEmailLog();
      return;
    }
    if (!res.ok || !data || !data.success) {
      alert((data && data.error) || "Email failed");
      return;
    }
    pushEmailLog({
      at: new Date().toISOString(),
      template: template,
      to: to,
      demo: data.demo,
      orderId: order.id,
    });
    alert(data.demo ? "Demo mode: email not sent (configure Resend). Logged locally." : "Email sent.");
    renderEmailLog();
  }

  function pillClass(st) {
    return "rbgf-ux-pill rbgf-ux-pill--" + (st === "picked_up" ? "picked_up" : st);
  }

  function renderOrderListInto(el, filter) {
    if (!el) return;
    var all = state.preorders.concat(state.customOrders);
    var rows = all.filter(function (o) {
      return passesFilter(o, filter);
    });
    var emptyMsg =
      filter === "custom"
        ? "No custom inquiries yet."
        : "No orders match this filter.";
    if (!rows.length) {
      el.innerHTML = '<p class="text-sm" style="color:#64748b">' + emptyMsg + "</p>";
      return;
    }
    var html = rows
      .map(function (o) {
        var typeTag =
          o.kind === "custom"
            ? '<span class="rbgf-ux-pill rbgf-ux-pill--custom">Custom</span>'
            : '<span class="rbgf-ux-pill" style="background:#f1f5f9">Preorder</span>';
        var pay = o.amount_cents ? money(o.amount_cents) + " est." : "—";
        return (
          '<article class="rbgf-ux-order" data-kind="' +
          o.kind +
          '" data-id="' +
          String(o.id) +
          '">' +
          '<div class="rbgf-ux-order-top">' +
          '<div><div class="rbgf-ux-name">' +
          escapeHtml(o.name) +
          " " +
          typeTag +
          '</div><div class="rbgf-ux-meta">' +
          escapeHtml(o.contact) +
          "</div></div>" +
          '<span class="' +
          pillClass(o.status) +
          '">' +
          o.status.replace("_", " ") +
          "</span>" +
          "</div>" +
          '<div class="rbgf-ux-items">' +
          escapeHtml(o.items) +
          "</div>" +
          '<div class="rbgf-ux-meta">Pickup: ' +
          escapeHtml(o.pickup_date || "TBD") +
          (o.pickup_window ? " · " + escapeHtml(o.pickup_window) : "") +
          "</div>" +
          (o.notes ? '<div class="rbgf-ux-meta">Notes: ' + escapeHtml(o.notes) + "</div>" : "") +
          '<div class="rbgf-ux-meta">Pay preference: ' +
          escapeHtml(o.payment_preference || "—") +
          " · Rev est. " +
          pay +
          "</div>" +
          '<div class="rbgf-ux-status-row"><label>Status</label><div class="rbgf-ux-actions">' +
          STATUS_FLOW.map(function (st) {
            return (
              '<button type="button" class="rbgf-ux-btn rbgf-ux-btn--sm ' +
              (o.status === st ? "rbgf-ux-btn--primary" : "rbgf-ux-btn--ghost") +
              '" data-action="set-status" data-status="' +
              st +
              '">' +
              st.replace("_", " ") +
              "</button>"
            );
          }).join("") +
          "</div></div>" +
          '<div class="rbgf-ux-actions">' +
          '<button type="button" class="rbgf-ux-btn rbgf-ux-btn--ghost rbgf-ux-btn--sm" data-email="confirm_order">Confirm</button>' +
          '<button type="button" class="rbgf-ux-btn rbgf-ux-btn--ghost rbgf-ux-btn--sm" data-email="need_more_info">Need info</button>' +
          '<button type="button" class="rbgf-ux-btn rbgf-ux-btn--ghost rbgf-ux-btn--sm" data-email="ready_for_pickup">Ready</button>' +
          '<button type="button" class="rbgf-ux-btn rbgf-ux-btn--ghost rbgf-ux-btn--sm" data-email="picked_up">Picked up</button>' +
          '<button type="button" class="rbgf-ux-btn rbgf-ux-btn--ghost rbgf-ux-btn--sm" data-email="unavailable">Unavailable</button>' +
          "</div>" +
          "</article>"
        );
      })
      .join("");
    el.innerHTML = html;

    el.querySelectorAll("[data-action=set-status]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var art = btn.closest(".rbgf-ux-order");
        var kind = art.getAttribute("data-kind");
        var id = art.getAttribute("data-id");
        var st = btn.getAttribute("data-status");
        setStatus(kind, id, st);
        fetchBakery()
          .then(function () {
            renderOrders();
            renderBake();
            renderProfit();
          })
          .catch(function () {});
      });
    });
    el.querySelectorAll("[data-email]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        var art = btn.closest(".rbgf-ux-order");
        var kind = art.getAttribute("data-kind");
        var id = art.getAttribute("data-id");
        var order = findOrder(kind, id);
        if (!order) return;
        sendCustomerEmail(btn.getAttribute("data-email"), order);
      });
    });
  }

  function renderOrders() {
    renderOrderListInto($("orders-list"), state.filter);
    renderOrderListInto($("orders-list-custom"), "custom");
  }

  function findOrder(kind, id) {
    var list = kind === "custom" ? state.customOrders : state.preorders;
    for (var i = 0; i < list.length; i++) {
      if (String(list[i].id) === String(id)) return list[i];
    }
    return null;
  }

  function renderBake() {
    var el = $("bake-list");
    var dateEl = $("bake-date");
    if (!dateEl || !el) return;
    if (!state.bakeDate) state.bakeDate = todayYMD();
    dateEl.value = state.bakeDate;
    var agg = aggregateBakeForDate(state.bakeDate);
    if (!agg.length) {
      el.innerHTML = '<p class="text-sm" style="color:#64748b">Nothing scheduled for this date (pickup date on orders).</p>';
      return;
    }
    el.innerHTML =
      '<div class="rbgf-ux-bake-grid">' +
      agg
        .map(function (row) {
          return (
            '<div class="rbgf-ux-bake-row"><span>' +
            escapeHtml(row.label) +
            '</span><span class="rbgf-ux-bake-qty">' +
            row.qty +
            " " +
            escapeHtml(row.unit) +
            "</span></div>"
          );
        })
        .join("") +
      "</div>";
  }

  function renderProfit() {
    var p = profitSnapshot();
    var el = $("profit-stats");
    if (!el) return;
    el.innerHTML =
      '<div class="rbgf-ux-stat">' +
      '<div class="rbgf-ux-stat-card"><div class="rbgf-ux-stat-label">Orders on file</div><div class="rbgf-ux-stat-val">' +
      p.orderCount +
      '</div></div><div class="rbgf-ux-stat-card"><div class="rbgf-ux-stat-label">Revenue (booked)</div><div class="rbgf-ux-stat-val">' +
      money(p.revenueCents) +
      '</div></div><div class="rbgf-ux-stat-card"><div class="rbgf-ux-stat-label">Est. cost (placeholder)</div><div class="rbgf-ux-stat-val">' +
      money(p.costCents) +
      '</div></div><div class="rbgf-ux-stat-card"><div class="rbgf-ux-stat-label">Est. gross profit</div><div class="rbgf-ux-stat-val">' +
      money(p.grossCents) +
      "</div></div></div>" +
      '<p class="rbgf-ux-sub" style="margin-top:1rem">Costs use placeholder per-item map in <code>admin-command.js</code> — replace with real COGS when ready.</p>';
  }

  function renderEmailLog() {
    var el = $("email-log");
    if (!el) return;
    var log = loadEmailLog();
    if (!log.length) {
      el.textContent = "No messages logged yet.";
      return;
    }
    el.innerHTML = log
      .map(function (L) {
        return (
          "<div>" +
          escapeHtml(L.at) +
          " — " +
          escapeHtml(L.template) +
          " → " +
          escapeHtml(L.to) +
          (L.demo ? " (demo)" : "") +
          "</div>"
        );
      })
      .join("");
  }

  function escapeHtml(s) {
    if (s == null) return "";
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function setView(v) {
    state.view = v;
    ["view-orders", "view-custom", "view-bake", "view-controls", "view-ledger"].forEach(function (id) {
      var el = $(id);
      if (el) el.classList.add("rbgf-ux-hidden");
    });
    var show = $("view-" + v);
    if (show) show.classList.remove("rbgf-ux-hidden");
    document.querySelectorAll(".rbgf-ux-tab").forEach(function (t) {
      t.setAttribute("aria-selected", t.getAttribute("data-view") === v ? "true" : "false");
    });
  }

  function wireFilters() {
    document.querySelectorAll(".rbgf-ux-chip").forEach(function (ch) {
      ch.addEventListener("click", function () {
        state.filter = ch.getAttribute("data-filter") || "all";
        document.querySelectorAll(".rbgf-ux-chip").forEach(function (c) {
          c.setAttribute("aria-pressed", c === ch ? "true" : "false");
        });
        renderOrders();
      });
    });
  }

  function wireTabs() {
    document.querySelectorAll(".rbgf-ux-tab").forEach(function (tab) {
      tab.addEventListener("click", function () {
        setView(tab.getAttribute("data-view"));
        if (state.view === "bake") renderBake();
        if (state.view === "ledger") {
          renderProfit();
          renderEmailLog();
        }
        if (state.view === "custom") renderOrders();
        if (state.view === "controls") renderPreorderDateSnapshot();
      });
    });
  }

  async function fetchAdminConfig() {
    var res = await fetch("/api/admin-config", { headers: headersAdmin() });
    var data = await res.json().catch(function () {
      return null;
    });
    if (res.status === 401) throw new Error("Unauthorized");
    if (!res.ok) throw new Error((data && data.error) || "Load failed");
    return data;
  }

  function appendScheduleRow(container, row) {
    var hint = container.querySelector(".rbgf-schedule-empty-hint");
    if (hint) hint.remove();
    row = row || { date: "", windows: [] };
    var wset = {};
    (row.windows || []).forEach(function (x) {
      wset[x] = true;
    });
    var wrap = document.createElement("div");
    wrap.className = "rbgf-schedule-row border border-slate-200 rounded-md p-3 space-y-2";
    wrap.setAttribute("data-schedule-row", "1");
    var top = document.createElement("div");
    top.className = "flex flex-wrap gap-2 items-center justify-between";
    var lab = document.createElement("label");
    lab.className = "text-sm font-semibold text-slate-800";
    lab.style.display = "block";
    lab.appendChild(document.createTextNode("Pickup date "));
    var di = document.createElement("input");
    di.type = "date";
    di.className = "form-field mt-1 rbgf-schedule-date";
    di.style.maxWidth = "200px";
    di.value = row.date || "";
    lab.appendChild(di);
    var rm = document.createElement("button");
    rm.type = "button";
    rm.className = "rbgf-schedule-remove text-sm";
    rm.style.color = "#e11d48";
    rm.textContent = "Remove";
    rm.addEventListener("click", function () {
      wrap.remove();
      if (container && !container.querySelector("[data-schedule-row]")) {
        var p = document.createElement("p");
        p.className = "rbgf-schedule-empty-hint text-sm text-slate-500";
        p.textContent = "No dates yet — add one for preorder pickup.";
        container.insertBefore(p, container.firstChild);
      }
    });
    top.appendChild(lab);
    top.appendChild(rm);
    var winRow = document.createElement("div");
    winRow.className = "flex flex-wrap gap-3 text-sm text-slate-800";
    ["Late morning", "Afternoon", "Early evening"].forEach(function (label) {
      var lbl = document.createElement("label");
      lbl.className = "flex items-center gap-2 cursor-pointer";
      var cb = document.createElement("input");
      cb.type = "checkbox";
      cb.className = "rbgf-schedule-w h-5 w-5";
      cb.setAttribute("data-window", label);
      cb.checked = !!wset[label];
      var sp = document.createElement("span");
      sp.textContent = label;
      lbl.appendChild(cb);
      lbl.appendChild(sp);
      winRow.appendChild(lbl);
    });
    var meta = document.createElement("div");
    meta.className = "flex flex-wrap gap-4 items-end text-sm text-slate-700";
    var tgtWrap = document.createElement("label");
    tgtWrap.className = "flex flex-col gap-1";
    var tgtSpan = document.createElement("span");
    tgtSpan.textContent = "Day revenue target ($) — optional (overrides default baseline above)";
    var tgtIn = document.createElement("input");
    tgtIn.type = "number";
    tgtIn.min = "0";
    tgtIn.step = "1";
    tgtIn.className = "form-field mt-0.5 rbgf-schedule-target";
    tgtIn.placeholder = "default = daily cap";
    if (row.revenue_target_cents != null && row.revenue_target_cents > 0) {
      tgtIn.value = String(Math.round(row.revenue_target_cents / 100));
    }
    tgtWrap.appendChild(tgtSpan);
    tgtWrap.appendChild(tgtIn);
    var closedLbl = document.createElement("label");
    closedLbl.className = "flex items-center gap-2 cursor-pointer";
    var closedCb = document.createElement("input");
    closedCb.type = "checkbox";
    closedCb.className = "rbgf-schedule-closed h-5 w-5";
    closedCb.checked = row.closed === true;
    closedLbl.appendChild(closedCb);
    closedLbl.appendChild(
      document.createTextNode(" Closed to new requests (uncheck + Save to reopen; may auto-enable when that date hits its target)")
    );
    meta.appendChild(tgtWrap);
    meta.appendChild(closedLbl);
    wrap.appendChild(top);
    wrap.appendChild(winRow);
    wrap.appendChild(meta);
    container.appendChild(wrap);
  }

  function renderScheduleEditor(schedule) {
    var el = $("preorder_schedule_editor");
    if (!el) return;
    el.innerHTML = "";
    var rows = Array.isArray(schedule) ? schedule : [];
    if (!rows.length) {
      var empty = document.createElement("p");
      empty.className = "rbgf-schedule-empty-hint text-sm text-slate-500";
      empty.textContent = "No dates yet — add one for preorder pickup.";
      el.appendChild(empty);
      return;
    }
    rows.forEach(function (r) {
      appendScheduleRow(el, r);
    });
  }

  function readScheduleFromDom() {
    var el = $("preorder_schedule_editor");
    if (!el) return [];
    var out = [];
    el.querySelectorAll("[data-schedule-row]").forEach(function (row) {
      var dateInput = row.querySelector(".rbgf-schedule-date");
      var date = dateInput ? String(dateInput.value || "").trim() : "";
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
      var windows = [];
      row.querySelectorAll(".rbgf-schedule-w:checked").forEach(function (cb) {
        var t = cb.getAttribute("data-window");
        if (t) windows.push(t);
      });
      if (!windows.length) return;
      var o = { date: date, windows: windows };
      var tgtIn = row.querySelector(".rbgf-schedule-target");
      var td = tgtIn ? parseFloat(String(tgtIn.value || "").trim(), 10) : NaN;
      if (Number.isFinite(td) && td > 0) o.revenue_target_cents = Math.round(td * 100);
      var closedCb = row.querySelector(".rbgf-schedule-closed");
      if (closedCb && closedCb.checked) o.closed = true;
      out.push(o);
    });
    return out;
  }

  function fallbackConfigPayload() {
    return {
      config: {
        preorder_open: false,
        custom_orders_open: false,
        daily_cap_cents: 100000,
        status_message: "Ordering is currently closed.",
        preorder_pickup_schedule: [],
      },
      todayTotalCents: 0,
      waitlistCount: 0,
    };
  }

  function targetCentsForPickupDate(ymd) {
    var row = (state.preorderScheduleNorm || []).find(function (r) {
      return r && r.date === ymd;
    });
    if (row && row.revenue_target_cents != null && row.revenue_target_cents > 0) {
      return Number(row.revenue_target_cents);
    }
    var cap = state.dailyCapCents;
    return Number.isFinite(cap) && cap > 0 ? cap : null;
  }

  function accumLineFromPreorder(o) {
    var z = { pretzel: 0, c6: 0, c12: 0, cream: 0, r6: 0, r12: 0, rev: 0 };
    z.rev = o.amount_cents || 0;
    var li = o.line_items;
    if (li && typeof li === "object") {
      z.pretzel += Number(li.pretzel_20_orders) || 0;
      z.c6 += Number(li.cinnamon_6) || 0;
      z.c12 += Number(li.cinnamon_12) || 0;
      z.cream += Number(li.cream_pies) || 0;
      z.r6 += Number(li.rolls_6) || 0;
      z.r12 += Number(li.rolls_12) || 0;
    }
    return z;
  }

  function renderPreorderDateSnapshot() {
    var el = $("preorder_date_snapshot");
    if (!el) return;
    var datesMap = {};
    function ensure(d) {
      if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return;
      if (!datesMap[d]) {
        datesMap[d] = {
          pretzel: 0,
          c6: 0,
          c12: 0,
          cream: 0,
          r6: 0,
          r12: 0,
          rev: 0,
          closed: false,
        };
      }
    }
    (state.preorderScheduleNorm || []).forEach(function (r) {
      if (r && r.date) {
        ensure(r.date);
        if (r.closed) datesMap[r.date].closed = true;
      }
    });
    state.preorders.forEach(function (o) {
      if (o.kind !== "preorder") return;
      var d = o.pickup_date;
      if (!d) return;
      ensure(d);
      var a = accumLineFromPreorder(o);
      datesMap[d].pretzel += a.pretzel;
      datesMap[d].c6 += a.c6;
      datesMap[d].c12 += a.c12;
      datesMap[d].cream += a.cream;
      datesMap[d].r6 += a.r6;
      datesMap[d].r12 += a.r12;
      datesMap[d].rev += a.rev;
    });
    var dates = Object.keys(datesMap).sort();
    if (!dates.length) {
      el.innerHTML =
        '<p class="text-sm text-slate-500">Add pickup dates in Ordering &amp; cap, or load preorders from the API when deployed.</p>';
      return;
    }
    el.innerHTML =
      '<p class="text-sm font-semibold text-slate-800 mb-1">Preorder load by pickup date</p>' +
      '<p class="text-xs text-slate-500 mb-3">Targets are soft: the order that reaches the target is still stored; that date then auto-closes for new requests until you reopen it below.</p>' +
      '<div class="space-y-3">' +
      dates
        .map(function (d) {
          var x = datesMap[d];
          var target = targetCentsForPickupDate(d);
          var ratio = target && target > 0 ? x.rev / target : 0;
          var statusLabel = "Comfortable";
          var statusClass = "text-emerald-700";
        if (x.closed) {
          statusLabel = "Closed to new requests (reopen in schedule above)";
          statusClass = "text-slate-600";
        } else if (ratio >= 1) {
          statusLabel = "At / over target (auto-close may apply if not already closed)";
          statusClass = "text-rose-700";
          } else if (ratio >= 0.85) {
            statusLabel = "Near target";
            statusClass = "text-amber-700";
          } else if (ratio >= 0.5) {
            statusLabel = "On track";
            statusClass = "text-slate-700";
          }
          var pretzelBatches = x.pretzel > 0 ? Math.ceil(x.pretzel / PRETZEL_ORDERS_PER_BATCH) : 0;
          var pretzelPartial = x.pretzel > 0 && x.pretzel % PRETZEL_ORDERS_PER_BATCH !== 0;
          var tgtStr = target ? money(target) : "—";
          return (
            '<div class="border border-slate-200 rounded-lg p-3 text-sm" style="background:#fafafa">' +
            '<div class="flex flex-wrap justify-between gap-2 font-semibold text-slate-900">' +
            "<span>" +
            d +
            "</span>" +
            '<span class="' +
            statusClass +
            '">' +
            statusLabel +
            "</span>" +
            "</div>" +
            '<div class="mt-1 text-slate-600">Est. revenue (tentative): <strong>' +
            money(x.rev) +
            "</strong> · Target: " +
            tgtStr +
            "</div>" +
            '<div class="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-x-3 gap-y-1 text-xs text-slate-600">' +
            "<span>Pretzel 20-ct orders: <strong>" +
            x.pretzel +
            "</strong></span>" +
            "<span>Cin. 6-pk: <strong>" +
            x.c6 +
            "</strong></span>" +
            "<span>Cin. 12-pk: <strong>" +
            x.c12 +
            "</strong></span>" +
            "<span>Cream pies: <strong>" +
            x.cream +
            "</strong></span>" +
            "<span>Rolls 6: <strong>" +
            x.r6 +
            "</strong></span>" +
            "<span>Rolls 12: <strong>" +
            x.r12 +
            "</strong></span>" +
            "</div>" +
            '<div class="mt-2 text-xs text-slate-600">' +
            "Pretzel batches (5 orders/batch): <strong>" +
            pretzelBatches +
            "</strong>" +
            (pretzelPartial
              ? ' · <span class="text-amber-700">Partial last batch</span>'
              : "") +
            "</div>" +
            "</div>"
          );
        })
        .join("") +
      "</div>";
  }

  function setUiFromConfig(payload) {
    var cfg = payload.config || {};
    var capCents = Number(cfg.daily_cap_cents);
    if (!Number.isFinite(capCents) || capCents < 0) capCents = 100000;
    state.dailyCapCents = capCents;
    state.preorderScheduleNorm = Array.isArray(cfg.preorder_pickup_schedule) ? cfg.preorder_pickup_schedule : [];
    $("preorder_open").checked = cfg.preorder_open === true;
    renderScheduleEditor(cfg.preorder_pickup_schedule || []);
    $("custom_orders_open").checked = cfg.custom_orders_open === true;
    $("daily_cap_dollars").value = (capCents / 100).toString();
    $("status_message").value = cfg.status_message || "";
    $("today_total_cents").textContent = money(payload.todayTotalCents);
    $("daily_cap_cents_display").textContent = money(capCents);
    $("waitlist_count").textContent = String(payload.waitlistCount || 0);
    renderPreorderDateSnapshot();
    try {
      window.dispatchEvent(new CustomEvent("rbgf-config-applied"));
    } catch (e) {
      /* ignore */
    }
  }

  async function saveConfig() {
    var saveFb = $("ordering-cap-save-msg");
    function setSaveFeedback(t) {
      if (saveFb) saveFb.textContent = t || "";
    }
    var dailyCents = Math.round(Number($("daily_cap_dollars").value) * 100);
    if (!Number.isFinite(dailyCents) || dailyCents <= 0) {
      setSaveFeedback("Enter a valid daily cap.");
      return;
    }
    var res = await fetch("/api/admin-config", {
      method: "PATCH",
      headers: Object.assign({ "Content-Type": "application/json" }, headersAdmin()),
      body: JSON.stringify({
        preorder_open: $("preorder_open").checked,
        custom_orders_open: $("custom_orders_open").checked,
        daily_cap_cents: dailyCents,
        status_message: $("status_message").value || "",
        preorder_pickup_schedule: readScheduleFromDom(),
      }),
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !data || !data.success) {
      setSaveFeedback((data && data.error) || "Save failed.");
      return;
    }
    setSaveFeedback("Saved.");
    setUiFromConfig(data);
  }

  async function openAndNotify() {
    if (!confirm("Open preorder and notify the waitlist now?")) return;
    var res = await fetch("/api/open-preorder-and-notify", {
      method: "POST",
      headers: headersAdmin(),
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !data || !data.success) {
      $("notify-message").textContent = (data && data.error) || "Failed.";
      return;
    }
    var sum = data.summary || {};
    $("notify-message").textContent =
      "Emails attempted: " + (sum.attempted || 0) + ", sent: " + (sum.sent || 0) + ", failed: " + (sum.failed || 0) + ".";
    var p = await fetchAdminConfig();
    setUiFromConfig(p);
  }

  function initAdminGateRedirectOnly() {
    if (getPassword() && state.secret) {
      window.location.replace("./dashboard/" + (window.location.search || ""));
      return;
    }
    $("auth-submit").addEventListener("click", function () {
      var pw = ($("admin-password").value || "").trim();
      if (!pw) {
        $("auth-error").classList.remove("rbgf-ux-hidden");
        $("auth-error").textContent = "Enter password.";
        return;
      }
      setPassword(pw);
      $("auth-error").classList.add("rbgf-ux-hidden");
      $("auth-error").textContent = "";
      fetchBakery()
        .then(function () {
          return fetchAdminConfig().catch(function (err) {
            if (err && err.message === "Unauthorized") throw err;
            return fallbackConfigPayload();
          });
        })
        .then(function () {
          window.location.href = "./dashboard/" + (window.location.search || "");
        })
        .catch(function (err) {
          $("auth-error").classList.remove("rbgf-ux-hidden");
          $("auth-error").textContent = (err && err.message) || "Unauthorized.";
        });
    });
  }

  function finishAdminDashboardLoad(payload) {
    $("auth-gate").classList.add("rbgf-ux-hidden");
    $("app-root").classList.remove("rbgf-ux-hidden");
    if (state.source === "demo") {
      if ($("demo-banner")) $("demo-banner").classList.remove("rbgf-ux-hidden");
    } else {
      if ($("demo-banner")) $("demo-banner").classList.add("rbgf-ux-hidden");
    }
    if ($("orders-list")) renderOrders();
    if ($("bake-list") && $("bake-date")) renderBake();
    if ($("profit-stats")) renderProfit();
    if ($("email-log")) renderEmailLog();
    if (document.querySelector(".rbgf-ux-chip")) wireFilters();
    if (document.querySelector(".rbgf-ux-tab")) {
      wireTabs();
      setView("orders");
      document.querySelectorAll(".rbgf-ux-chip").forEach(function (c) {
        c.setAttribute("aria-pressed", c.getAttribute("data-filter") === "all" ? "true" : "false");
      });
    }
    setUiFromConfig(payload);
    if (state.offlineMode && $("offline-banner")) $("offline-banner").classList.remove("rbgf-ux-hidden");
    else if ($("offline-banner")) $("offline-banner").classList.add("rbgf-ux-hidden");
    try {
      window.dispatchEvent(
        new CustomEvent("rbgf-admin-ready", {
          detail: {
            source: state.source,
            preorders: state.preorders,
            customOrders: state.customOrders,
          },
        })
      );
    } catch (e) {
      /* ignore */
    }
  }

  function init() {
    var qs = new URLSearchParams(window.location.search);
    state.secret = qs.get("secret") || "";
    if (!state.secret && isLocalDevHostname()) {
      state.secret = LOCAL_DEV_DEFAULT_SECRET;
      if ($("local-dev-hint")) $("local-dev-hint").classList.remove("rbgf-ux-hidden");
    }
    if (!state.secret) {
      if ($("secret-missing")) $("secret-missing").classList.remove("rbgf-ux-hidden");
      return;
    }

    if (!$("app-root")) {
      initAdminGateRedirectOnly();
      return;
    }

    if ($("bake-date")) {
      $("bake-date").addEventListener("change", function () {
        state.bakeDate = $("bake-date").value;
        renderBake();
      });
    }

    $("auth-submit").addEventListener("click", function () {
      var pw = ($("admin-password").value || "").trim();
      if (!pw) {
        $("auth-error").classList.remove("rbgf-ux-hidden");
        $("auth-error").textContent = "Enter password.";
        return;
      }
      setPassword(pw);
      $("auth-error").classList.add("rbgf-ux-hidden");
      $("auth-error").textContent = "";
      state.offlineMode = false;
      fetchBakery()
        .then(function () {
          return fetchAdminConfig().catch(function (err) {
            if (err && err.message === "Unauthorized") throw err;
            state.offlineMode = true;
            return fallbackConfigPayload();
          });
        })
        .then(function (payload) {
          finishAdminDashboardLoad(payload);
        })
        .catch(function (err) {
          $("auth-error").classList.remove("rbgf-ux-hidden");
          $("auth-error").textContent = (err && err.message) || "Unauthorized.";
        });
    });

    if ($("save-config")) $("save-config").addEventListener("click", saveConfig);
    if ($("preorder_schedule_add"))
      $("preorder_schedule_add").addEventListener("click", function () {
        var el = $("preorder_schedule_editor");
        if (!el) return;
        appendScheduleRow(el, { date: "", windows: [] });
      });
    if ($("refresh-config"))
      $("refresh-config").addEventListener("click", function () {
        if ($("ordering-cap-save-msg")) $("ordering-cap-save-msg").textContent = "";
        fetchAdminConfig().then(setUiFromConfig).catch(function () {});
      });
    if ($("open-and-notify")) $("open-and-notify").addEventListener("click", openAndNotify);

    if (getPassword()) {
      setPassword(getPassword());
      state.offlineMode = false;
      fetchBakery()
        .then(function () {
          return fetchAdminConfig().catch(function (err) {
            if (err && err.message === "Unauthorized") throw err;
            state.offlineMode = true;
            return fallbackConfigPayload();
          });
        })
        .then(function (payload) {
          finishAdminDashboardLoad(payload);
        })
        .catch(function (err) {
          $("auth-error").classList.remove("rbgf-ux-hidden");
          $("auth-error").textContent = (err && err.message) || "Unauthorized.";
        });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
