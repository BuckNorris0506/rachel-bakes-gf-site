// Shared preorder pickup schedule + payment preference validation (Rachel Bakes GF)

const PICKUP_WINDOW_LABELS = ["Late morning", "Afternoon", "Early evening"];

function normalizePreorderPickupSchedule(raw) {
  if (raw == null) return [];
  const arr = Array.isArray(raw) ? raw : [];
  const byDate = {};
  arr.forEach(function (entry) {
    if (!entry || typeof entry !== "object") return;
    const date = typeof entry.date === "string" ? entry.date.trim() : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    if (!byDate[date]) {
      byDate[date] = { windows: {}, closed: false, revenue_target_cents: null };
    }
    const row = byDate[date];
    const windows = Array.isArray(entry.windows) ? entry.windows : [];
    windows.forEach(function (w) {
      if (typeof w !== "string") return;
      const t = w.trim();
      if (PICKUP_WINDOW_LABELS.indexOf(t) !== -1) row.windows[t] = true;
    });
    if (entry.closed === true) row.closed = true;
    if (entry.revenue_target_cents != null) {
      const v = parseInt(String(entry.revenue_target_cents), 10);
      if (Number.isFinite(v) && v > 0) row.revenue_target_cents = v;
    }
  });
  return Object.keys(byDate)
    .sort()
    .map(function (d) {
      const row = byDate[d];
      return {
        date: d,
        windows: PICKUP_WINDOW_LABELS.filter(function (k) {
          return row.windows[k];
        }),
        closed: row.closed === true,
        revenue_target_cents: row.revenue_target_cents != null ? row.revenue_target_cents : null,
      };
    })
    .filter(function (r) {
      return r.windows.length > 0 || r.closed === true;
    });
}

function customerFacingSchedule(normalized) {
  return (Array.isArray(normalized) ? normalized : []).filter(function (r) {
    return r && !r.closed && r.windows && r.windows.length > 0;
  });
}

function getRevenueTargetCentsForDate(normalizedSchedule, pickupDate, defaultCapCents) {
  const row = (Array.isArray(normalizedSchedule) ? normalizedSchedule : []).find(function (r) {
    return r && r.date === pickupDate;
  });
  if (row && row.revenue_target_cents != null && Number.isFinite(Number(row.revenue_target_cents))) {
    const t = Number(row.revenue_target_cents);
    if (t > 0) return t;
  }
  return defaultCapCents != null && Number.isFinite(Number(defaultCapCents)) ? Number(defaultCapCents) : null;
}

function validatePickupChoice(scheduleNormalized, pickupDate, pickupWindow) {
  if (!pickupDate || !pickupWindow) return false;
  const customer = customerFacingSchedule(scheduleNormalized);
  const row = customer.find(function (r) {
    return r.date === pickupDate;
  });
  if (!row) return false;
  return row.windows.indexOf(pickupWindow) !== -1;
}

function isPaymentPreferenceOk(s) {
  return s === "Card" || s === "Cash at pickup";
}

module.exports = {
  PICKUP_WINDOW_LABELS,
  normalizePreorderPickupSchedule,
  customerFacingSchedule,
  getRevenueTargetCentsForDate,
  validatePickupChoice,
  isPaymentPreferenceOk,
};
