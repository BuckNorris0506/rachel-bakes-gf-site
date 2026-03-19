// preorder-submit netlify function
// Stores preorder submissions and enforces daily revenue cap auto-close.
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

// "Today" boundaries should follow America/Chicago.
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
  const probe = new Date(start.getTime() + 36 * 3600 * 1000); // safe across DST
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

function toCentsFromDollarsMaybe(dollars) {
  if (dollars == null) return null;
  const v = parseFloat(String(dollars));
  if (!Number.isFinite(v)) return null;
  const cents = Math.round(v * 100);
  if (!Number.isFinite(cents) || cents <= 0) return null;
  return cents;
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
    const orderDetails = typeof parsed.order_details === "string" ? parsed.order_details.trim() : "";
    const pickupDate = typeof parsed.pickup_date === "string" ? parsed.pickup_date.trim() : "";
    const pickupWindow = typeof parsed.pickup_window === "string" ? parsed.pickup_window.trim() : "";
    const notes = typeof parsed.notes === "string" ? parsed.notes.trim() : "";

    const amountCentsIn = parsed.amount_cents;
    const orderTotalDollarsIn = parsed.order_total_dollars;

    let amountCents = null;
    if (amountCentsIn != null && String(amountCentsIn).trim() !== "") {
      const v = parseInt(String(amountCentsIn), 10);
      if (Number.isFinite(v) && v > 0) amountCents = v;
    }
    if (amountCents == null) {
      amountCents = toCentsFromDollarsMaybe(orderTotalDollarsIn);
    }

    if (!name || !contact || !orderDetails) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Please complete name, contact, and what you want to order." }),
      };
    }

    if (amountCents == null) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Please enter a valid estimated total." }),
      };
    }

    // 1) Read config row
    const configRows = await supabaseRestGet(
      `config?id=eq.${encodeURIComponent(ORDERING_CONFIG_ROW_ID)}&select=preorder_open,custom_orders_open,daily_cap_cents,status_message`
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

    if (dailyCapCents == null || !Number.isFinite(dailyCapCents) || dailyCapCents <= 0) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Daily cap is not configured correctly." }),
      };
    }

    // 2) Insert preorder
    const inserted = await supabaseRestPost("preorders?select=id", [
      {
        name: name,
        contact: contact,
        order_details: orderDetails,
        pickup_date: pickupDate || null,
        pickup_window: pickupWindow || null,
        notes: notes || null,
        amount_cents: amountCents,
      },
    ]);

    // 3) Recompute today's total and optionally auto-close
    const todayStartIso = isoChicagoStartOfDay(new Date());
    const tomorrowStartIso = isoChicagoEndOfDay(new Date());
    const preorderRows = await supabaseRestGet(
      `preorders?created_at=gte.${encodeURIComponent(todayStartIso)}&created_at=lt.${encodeURIComponent(tomorrowStartIso)}&select=amount_cents`
    );

    const todayTotalCents = (Array.isArray(preorderRows) ? preorderRows : []).reduce(function (sum, row) {
      const v = row && row.amount_cents != null ? Number(row.amount_cents) : 0;
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    const capReached = todayTotalCents >= dailyCapCents;

    let preorderOpenAfter = true;
    if (capReached) {
      await supabaseRestPatch(
        `config?id=eq.${encodeURIComponent(ORDERING_CONFIG_ROW_ID)}`,
        { preorder_open: false, updated_at: new Date().toISOString() }
      );
      preorderOpenAfter = false;
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Thanks! Your preorder request is saved. We’ll confirm availability and pickup details.",
        id: inserted && Array.isArray(inserted) && inserted.length ? inserted[0].id : null,
        capReached: capReached,
        preorderOpen: preorderOpenAfter,
        dailyCapCents: dailyCapCents,
        todayTotalCents: todayTotalCents,
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

