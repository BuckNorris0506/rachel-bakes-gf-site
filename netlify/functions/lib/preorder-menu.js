// Structured preorder line items + pricing (Rachel Bakes GF) — server is source of truth

const PRICE_CENTS = {
  pretzel_20_orders: 1000, // $10 per 20-bite order (menu)
  cinnamon_6: 2000,
  cinnamon_12: 4000,
  cream_pies: 400,
  rolls_6: 1200,
  rolls_12: 2400,
};

const LINE_KEYS = ["pretzel_20_orders", "cinnamon_6", "cinnamon_12", "cream_pies", "rolls_6", "rolls_12"];

/** Pretzel: 1 batch = 5 orders (20-bite units). Extensible map for other SKUs later. */
const BATCH_RULES = {
  pretzel_20_orders: { ordersPerBatch: 5, label: "Pretzel 20-bite orders" },
};

function clampNonNegInt(v) {
  const n = parseInt(String(v), 10);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(n, 999);
}

function parseLineItemsBody(raw) {
  if (!raw || typeof raw !== "object") return null;
  const out = {};
  let any = false;
  for (let i = 0; i < LINE_KEYS.length; i++) {
    const k = LINE_KEYS[i];
    const v = clampNonNegInt(raw[k]);
    out[k] = v;
    if (v > 0) any = true;
  }
  if (!any) return null;
  return out;
}

function computeSubtotalCents(lineItems) {
  if (!lineItems) return 0;
  let sum = 0;
  for (let i = 0; i < LINE_KEYS.length; i++) {
    const k = LINE_KEYS[i];
    const n = clampNonNegInt(lineItems[k]);
    sum += n * (PRICE_CENTS[k] || 0);
  }
  return sum;
}

function lineItemsToOrderDetails(lineItems) {
  if (!lineItems) return "";
  const parts = [];
  const n = (k) => clampNonNegInt(lineItems[k]);
  if (n("pretzel_20_orders")) parts.push(n("pretzel_20_orders") + "× 20-bite pretzel");
  if (n("cinnamon_6")) parts.push(n("cinnamon_6") + "× cinnamon 6-pk");
  if (n("cinnamon_12")) parts.push(n("cinnamon_12") + "× cinnamon 12-pk");
  if (n("cream_pies")) parts.push(n("cream_pies") + "× oatmeal cream pie");
  if (n("rolls_6")) parts.push(n("rolls_6") + "× dinner rolls 6-pk");
  if (n("rolls_12")) parts.push(n("rolls_12") + "× dinner rolls 12-pk");
  return parts.join(" · ");
}

module.exports = {
  PRICE_CENTS,
  LINE_KEYS,
  BATCH_RULES,
  parseLineItemsBody,
  computeSubtotalCents,
  lineItemsToOrderDetails,
  clampNonNegInt,
};
