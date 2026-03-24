/**
 * Rachel Bakes GF — BakeSites command center (admin prototype)
 * Orders, bake list, controls, profit, customer email actions.
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
      order_details: "3 packs pretzel bites, 1 tray cinnamon rolls",
      pickup_date: new Date().toISOString().slice(0, 10),
      pickup_window: "4–6 pm",
      notes: "Nut-free household",
      amount_cents: 4800,
      created_at: new Date(Date.now() - 86400000).toISOString(),
    },
    {
      id: "demo-pre-2",
      name: "Sam Rivera",
      contact: "sam@example.com",
      order_details: "2 dozen sugar cookies, 1 simple cake",
      pickup_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
      pickup_window: "morning",
      notes: "",
      amount_cents: 9200,
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
    cupcakes: 1200,
    cookies: 800,
    cake: 2500,
    custom_default: 1500,
  };

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
      addLine(parseOrderDetailsToLines(o.items));
    });
    return Object.keys(totals).map(function (k) {
      return totals[k];
    });
  }

  function estimateCostForOrder(o) {
    if (o.kind === "custom") return MENU_COST_CENTS.custom_default;
    var lines = parseOrderDetailsToLines(o.items);
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
    } catch (e) {
      if (e && e.message === "Unauthorized") throw e;
      /* Static server / no Netlify: use embedded demo so the prototype is usable */
      state.source = "demo";
      state.preorders = normalizePreorders(DEMO_PREORDERS);
      state.customOrders = normalizeCustom(DEMO_CUSTOM);
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

  function renderOrders() {
    var el = $("orders-list");
    if (!el) return;
    var filter = state.filter;
    var all = state.preorders.concat(state.customOrders);
    var rows = all.filter(function (o) {
      return passesFilter(o, filter);
    });
    if (!rows.length) {
      el.innerHTML = '<p class="text-sm" style="color:#64748b">No orders match this filter.</p>';
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
          '<div class="rbgf-ux-meta">Payment: <strong>placeholder</strong> · ' +
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
    ["view-orders", "view-bake", "view-controls", "view-profit"].forEach(function (id) {
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
        if (state.view === "profit") renderProfit();
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

  function fallbackConfigPayload() {
    return {
      config: {
        preorder_open: false,
        custom_orders_open: false,
        daily_cap_cents: 100000,
        status_message: "Ordering is currently closed. (Local preview — connect Netlify for live config.)",
      },
      todayTotalCents: 0,
      waitlistCount: 0,
    };
  }

  function setUiFromConfig(payload) {
    var cfg = payload.config || {};
    var capCents = Number(cfg.daily_cap_cents);
    if (!Number.isFinite(capCents) || capCents < 0) capCents = 100000;
    $("preorder_open").checked = cfg.preorder_open === true;
    $("custom_orders_open").checked = cfg.custom_orders_open === true;
    $("daily_cap_dollars").value = (capCents / 100).toString();
    $("status_message").value = cfg.status_message || "";
    $("today_total_cents").textContent = money(payload.todayTotalCents);
    $("daily_cap_cents_display").textContent = money(capCents);
    $("waitlist_count").textContent = String(payload.waitlistCount || 0);
  }

  async function saveConfig() {
    var dailyCents = Math.round(Number($("daily_cap_dollars").value) * 100);
    if (!Number.isFinite(dailyCents) || dailyCents <= 0) {
      $("notify-message").textContent = "Enter a valid daily cap.";
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
      }),
    });
    var data = await res.json().catch(function () {
      return null;
    });
    if (!res.ok || !data || !data.success) {
      $("notify-message").textContent = (data && data.error) || "Save failed.";
      return;
    }
    $("notify-message").textContent = "Saved.";
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

  function init() {
    var qs = new URLSearchParams(window.location.search);
    state.secret = qs.get("secret") || "";
    if (!state.secret && isLocalDevHostname()) {
      state.secret = LOCAL_DEV_DEFAULT_SECRET;
      if ($("local-dev-hint")) $("local-dev-hint").classList.remove("rbgf-ux-hidden");
    }
    if (!state.secret) {
      $("secret-missing").classList.remove("rbgf-ux-hidden");
      return;
    }

    $("bake-date").addEventListener("change", function () {
      state.bakeDate = $("bake-date").value;
      renderBake();
    });

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
          $("auth-gate").classList.add("rbgf-ux-hidden");
          $("app-root").classList.remove("rbgf-ux-hidden");
          if (state.source === "demo") $("demo-banner").classList.remove("rbgf-ux-hidden");
          else $("demo-banner").classList.add("rbgf-ux-hidden");
          renderOrders();
          renderBake();
          renderProfit();
          renderEmailLog();
          wireFilters();
          wireTabs();
          setView("orders");
          document.querySelectorAll(".rbgf-ux-chip").forEach(function (c) {
            c.setAttribute("aria-pressed", c.getAttribute("data-filter") === "all" ? "true" : "false");
          });
          setUiFromConfig(payload);
          if (state.offlineMode && $("offline-banner")) $("offline-banner").classList.remove("rbgf-ux-hidden");
          else if ($("offline-banner")) $("offline-banner").classList.add("rbgf-ux-hidden");
        })
        .catch(function (err) {
          $("auth-error").classList.remove("rbgf-ux-hidden");
          $("auth-error").textContent = (err && err.message) || "Unauthorized.";
        });
    });

    $("save-config").addEventListener("click", saveConfig);
    $("refresh-config").addEventListener("click", function () {
      fetchAdminConfig().then(setUiFromConfig).catch(function () {});
    });
    $("open-and-notify").addEventListener("click", openAndNotify);

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
          $("auth-gate").classList.add("rbgf-ux-hidden");
          $("app-root").classList.remove("rbgf-ux-hidden");
          if (state.source === "demo") $("demo-banner").classList.remove("rbgf-ux-hidden");
          else $("demo-banner").classList.add("rbgf-ux-hidden");
          renderOrders();
          renderBake();
          renderProfit();
          renderEmailLog();
          wireFilters();
          wireTabs();
          setView("orders");
          document.querySelectorAll(".rbgf-ux-chip").forEach(function (c) {
            c.setAttribute("aria-pressed", c.getAttribute("data-filter") === "all" ? "true" : "false");
          });
          setUiFromConfig(payload);
          if (state.offlineMode && $("offline-banner")) $("offline-banner").classList.remove("rbgf-ux-hidden");
          else if ($("offline-banner")) $("offline-banner").classList.add("rbgf-ux-hidden");
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
