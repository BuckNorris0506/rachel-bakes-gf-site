// preorder-submit netlify function
// Structured preorder line items, tentative revenue, per–pickup-date soft cap.
//
// Capacity rule (soft, not a mid-order hard stop):
// 1) Inserts the preorder row first (never reject solely because the request would cross the target).
// 2) Then, if sum(amount_cents) for that pickup_date >= target, sets closed:true on that date in
//    config.preorder_pickup_schedule so future customers no longer see that date.
// 3) Rachel can reopen a date by clearing "Closed to new requests" in Command Center and Save.
//
// Env vars required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Optional:
// - ORDERING_CONFIG_ROW_ID (defaults to 1)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORDERING_CONFIG_ROW_ID = process.env.ORDERING_CONFIG_ROW_ID || "1";

const {
  normalizePreorderPickupSchedule,
  validatePickupChoice,
  isPaymentPreferenceOk,
  getRevenueTargetCentsForDate,
} = require("./lib/preorder-schedule");
const { parseLineItemsBody, computeSubtotalCents, lineItemsToOrderDetails } = require("./lib/preorder-menu");

const BUSINESS_TIMEZONE = "America/Chicago";

function getZonedYMD(date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = dtf.formatToParts(date);
  const y = Number(parts.find((p) => p.type === "year").value);
  const m = Number(parts.find((p) => p.type === "month").value);
  const d = Number(parts.find((p) => p.type === "day").value);
  return { y: y, m: m, d: d };
}

function getTimeZoneOffsetMinutes(timeZone, date) {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = dtf.formatToParts(date);
  const get = function (type) {
    const p = parts.find((x) => x.type === type);
    return p ? Number(p.value) : 0;
  };
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return (asUTC - date.getTime()) / 60000;
}

function startOfDayInTimeZone(date, timeZone) {
  const ymd = getZonedYMD(date);
  const guess = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d, 0, 0, 0, 0));
  let offset = getTimeZoneOffsetMinutes(timeZone, guess);
  let corrected = new Date(guess.getTime() - offset * 60000);
  offset = getTimeZoneOffsetMinutes(timeZone, corrected);
  corrected = new Date(guess.getTime() - offset * 60000);
  return corrected;
}

function isoChicagoStartOfDay(d) {
  return startOfDayInTimeZone(new Date(d), BUSINESS_TIMEZONE).toISOString();
}

function isoChicagoEndOfDay(d) {
  const start = startOfDayInTimeZone(new Date(d), BUSINESS_TIMEZONE);
  const probe = new Date(start.getTime() + 36 * 3600 * 1000);
  return startOfDayInTimeZone(probe, BUSINESS_TIMEZONE).toISOString();
}

async function supabaseRestGet(pathWithQuery) {
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const err = new Error(`Supabase REST GET failed (${res.status})`);
    err.details = text;
    throw err;
  }
  return text ? JSON.parse(text) : [];
}

async function supabaseRestPost(pathWithQuery, jsonBody) {
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery}`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(jsonBody),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const err = new Error(`Supabase REST POST failed (${res.status})`);
    err.details = text;
    throw err;
  }
  return text ? JSON.parse(text) : [];
}

async function supabaseRestPatch(pathWithQuery, jsonBody) {
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(jsonBody),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    const err = new Error(`Supabase REST PATCH failed (${res.status})`);
    err.details = text;
    throw err;
  }
  return text ? JSON.parse(text) : [];
}

async function sumAmountCentsForPickupDate(pickupDate) {
  const rows = await supabaseRestGet(
    `preorders?pickup_date=eq.${encodeURIComponent(pickupDate)}&select=amount_cents`
  );
  return (Array.isArray(rows) ? rows : []).reduce(function (sum, row) {
    const v = row && row.amount_cents != null ? Number(row.amount_cents) : 0;
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
}

// Runs only after a successful insert. Never blocks the order that pushed the date over the target.
async function markPickupDateClosedIfOverTarget(pickupDate, config) {
  const dailyCapCents = config.daily_cap_cents != null ? Number(config.daily_cap_cents) : null;
  const scheduleNorm = normalizePreorderPickupSchedule(config.preorder_pickup_schedule);
  const target = getRevenueTargetCentsForDate(scheduleNorm, pickupDate, dailyCapCents);
  if (target == null || !Number.isFinite(target) || target <= 0) return { dateClosed: false };

  const total = await sumAmountCentsForPickupDate(pickupDate);
  if (total < target) return { dateClosed: false };

  const raw = Array.isArray(config.preorder_pickup_schedule) ? config.preorder_pickup_schedule : [];
  if (!raw.length) return { dateClosed: false };

  const patched = raw.map(function (e) {
    if (e && e.date === pickupDate) return Object.assign({}, e, { closed: true });
    return e;
  });
  await supabaseRestPatch(`config?id=eq.${encodeURIComponent(ORDERING_CONFIG_ROW_ID)}`, {
    preorder_pickup_schedule: patched,
    updated_at: new Date().toISOString(),
  });
  return { dateClosed: true };
}

module.exports.handler = async function handler(event) {
  try {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Server misconfigured. Missing Supabase environment variables." }),
      };
    }

    if (!event || event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Method not allowed" }),
      };
    }

    const rawBody = event.isBase64Encoded
      ? Buffer.from(event.body || "", "base64").toString("utf8")
      : (event.body || "");

    let parsed = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch (_) {
      parsed = null;
    }

    if (!parsed || typeof parsed !== "object") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Invalid request body." }),
      };
    }

    const name = typeof parsed.name === "string" ? parsed.name.trim() : "";
    const contact = typeof parsed.contact === "string" ? parsed.contact.trim() : "";
    const pickupDate = typeof parsed.pickup_date === "string" ? parsed.pickup_date.trim() : "";
    const pickupWindow = typeof parsed.pickup_window === "string" ? parsed.pickup_window.trim() : "";
    const notes = typeof parsed.notes === "string" ? parsed.notes.trim() : "";
    const paymentPreference =
      typeof parsed.payment_preference === "string" ? parsed.payment_preference.trim() : "";

    const lineItems = parseLineItemsBody(parsed.line_items);

    if (!name || !contact) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Please complete your name and contact." }),
      };
    }

    if (!lineItems) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Choose at least one item with a quantity.",
        }),
      };
    }

    const amountCents = computeSubtotalCents(lineItems);
    if (amountCents <= 0) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Order total could not be calculated." }),
      };
    }

    const orderDetails = lineItemsToOrderDetails(lineItems);

    const configRows = await supabaseRestGet(
      `config?id=eq.${encodeURIComponent(ORDERING_CONFIG_ROW_ID)}&select=preorder_open,custom_orders_open,daily_cap_cents,status_message,preorder_pickup_schedule`
    );
    const config = Array.isArray(configRows) && configRows.length ? configRows[0] : null;
    if (!config) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Ordering config is missing." }),
      };
    }

    const preorderOpen = config.preorder_open === true;
    const dailyCapCents = config.daily_cap_cents != null ? Number(config.daily_cap_cents) : null;
    const statusMessage = config.status_message || "";

    if (!preorderOpen) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: statusMessage || "Ordering is currently closed.",
        }),
      };
    }

    if (!isPaymentPreferenceOk(paymentPreference)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Please choose how you would like to pay (Card or Cash at pickup).",
        }),
      };
    }

    const scheduleNorm = normalizePreorderPickupSchedule(config.preorder_pickup_schedule);
    if (!scheduleNorm.some(function (r) { return r.date === pickupDate && !r.closed && r.windows.length; })) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "That pickup date is not available. Please choose another date or contact us.",
        }),
      };
    }

    if (!validatePickupChoice(scheduleNorm, pickupDate, pickupWindow)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Please choose a pickup date and window from the options in the form.",
        }),
      };
    }

    if (dailyCapCents == null || !Number.isFinite(dailyCapCents) || dailyCapCents <= 0) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Daily revenue target is not configured correctly." }),
      };
    }

    const inserted = await supabaseRestPost("preorders?select=id", [
      {
        name: name,
        contact: contact,
        order_details: orderDetails,
        line_items: lineItems,
        pickup_date: pickupDate || null,
        pickup_window: pickupWindow || null,
        notes: notes || null,
        amount_cents: amountCents,
        payment_preference: paymentPreference,
      },
    ]);

    // Soft cap: only after save — may mark this pickup date closed for *future* requests.
    const capResult = await markPickupDateClosedIfOverTarget(pickupDate, config);

    const todayStartIso = isoChicagoStartOfDay(new Date());
    const tomorrowStartIso = isoChicagoEndOfDay(new Date());
    const preorderRowsToday = await supabaseRestGet(
      `preorders?created_at=gte.${encodeURIComponent(todayStartIso)}&created_at=lt.${encodeURIComponent(tomorrowStartIso)}&select=amount_cents`
    );
    const todayTotalCents = (Array.isArray(preorderRowsToday) ? preorderRowsToday : []).reduce(function (sum, row) {
      const v = row && row.amount_cents != null ? Number(row.amount_cents) : 0;
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: capResult.dateClosed
          ? "Thanks! Your preorder was accepted and saved. That pickup date is now full for new requests (your order still counts — we’ll confirm with you separately)."
          : "Thanks! Your preorder request is saved. We’ll confirm availability and pickup details.",
        id: inserted && Array.isArray(inserted) && inserted.length ? inserted[0].id : null,
        pickupDateClosed: capResult.dateClosed === true,
        dailyCapCents: dailyCapCents,
        todayTotalCents: todayTotalCents,
        amountCents: amountCents,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "We couldn't save your preorder. Please try again in a moment.",
        debug: process.env.NODE_ENV === "development" ? String(err && err.message ? err.message : err) : undefined,
      }),
    };
  }
};
