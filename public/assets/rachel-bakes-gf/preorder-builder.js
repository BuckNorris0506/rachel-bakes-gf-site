/**
 * Live tentative subtotal for structured preorder (client estimate; server recalculates).
 */
(function () {
  var KEYS = [
    "pretzel_20_orders",
    "cinnamon_6",
    "cinnamon_12",
    "cream_pies",
    "rolls_6",
    "rolls_12",
  ];

  function getPrices() {
    var p = window.RACHEL_BAKES_PREORDER_PRICES_CENTS || {};
    return p;
  }

  function readQuantities(form) {
    var out = {};
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      var el = form.querySelector('[name="' + k + '"]');
      var v = el ? parseInt(String(el.value || "0"), 10) : 0;
      if (!Number.isFinite(v) || v < 0) v = 0;
      if (v > 999) v = 999;
      out[k] = v;
    }
    return out;
  }

  function computeCents(qty) {
    var prices = getPrices();
    var sum = 0;
    for (var i = 0; i < KEYS.length; i++) {
      var k = KEYS[i];
      sum += (qty[k] || 0) * (prices[k] || 0);
    }
    return sum;
  }

  function formatMoney(cents) {
    if (!Number.isFinite(cents) || cents <= 0) return "$0.00";
    return "$" + (cents / 100).toFixed(2);
  }

  function update(form) {
    var outEl = document.getElementById("preorder-tentative-subtotal");
    if (!outEl) return;
    var cents = computeCents(readQuantities(form));
    outEl.textContent = formatMoney(cents);
  }

  function wire(form) {
    if (!form || form.getAttribute("data-rbgf-preorder-builder-wired")) return;
    form.setAttribute("data-rbgf-preorder-builder-wired", "1");
    form.addEventListener("input", function () {
      update(form);
    });
    form.addEventListener("change", function () {
      update(form);
    });
    update(form);
  }

  function init() {
    var form = document.getElementById("preorder-form");
    if (form) wire(form);
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
