// ordering-status netlify function
// Returns current ordering open/closed status from Supabase.
//
// Env vars required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY (service role key; used with REST API)
//
// Optional (for SQL-like consistency / future extension):
// - ORDERING_CONFIG_ROW_ID (defaults to 1)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORDERING_CONFIG_ROW_ID = process.env.ORDERING_CONFIG_ROW_ID || "1";

const { normalizePreorderPickupSchedule, customerFacingSchedule } = require("./lib/preorder-schedule");

// "Today" boundaries for Rachel Bakes GF should follow America/Chicago.
// We compute the start of the local day in that timezone and return UTC ISO strings for PostgREST filters.
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
  // Offset minutes such that: UTC_time = local_time - offset
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
  // Recompute offset once to handle DST transitions near the boundary.
  offset = getTimeZoneOffsetMinutes(timeZone, corrected);
  corrected = new Date(guess.getTime() - offset * 60000);
  return corrected;
}

function isoChicagoStartOfDay(d) {
  return startOfDayInTimeZone(new Date(d), BUSINESS_TIMEZONE).toISOString();
}

function isoChicagoEndOfDay(d) {
  // End boundary is the start of the next local day.
  const start = startOfDayInTimeZone(new Date(d), BUSINESS_TIMEZONE);
  const probe = new Date(start.getTime() + 36 * 3600 * 1000); // safe across DST
  return startOfDayInTimeZone(probe, BUSINESS_TIMEZONE).toISOString();
}

async function supabaseRestGet(pathWithQuery) {
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      // Supabase REST:
      // - "apikey" header: typically your anon key; service role also works in practice.
      // - "Authorization: Bearer ..." : the service role key
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const err = new Error(`Supabase REST GET failed (${res.status})`);
    err.details = text;
    throw err;
  }

  return res.json();
}

module.exports.handler = async function handler() {
  try {
    if (!SUPABASE_URL) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing SUPABASE_URL env var" }),
      };
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing SUPABASE_SERVICE_ROLE_KEY env var" }),
      };
    }

    // 1) Read single-row ordering config
    const configRows = await supabaseRestGet(
      `config?id=eq.${encodeURIComponent(ORDERING_CONFIG_ROW_ID)}&select=preorder_open,custom_orders_open,daily_cap_cents,status_message,updated_at,preorder_pickup_schedule`
    );

    const config = Array.isArray(configRows) && configRows.length ? configRows[0] : null;
    if (!config) {
      return {
        statusCode: 500,
        body: JSON.stringify({ error: "Missing config row in Supabase (expected single row model)" }),
      };
    }

    const scheduleFull = normalizePreorderPickupSchedule(config.preorder_pickup_schedule);
    const preorderPickupSchedule = customerFacingSchedule(scheduleFull);

    // 2) Sum today's preorder amount_cents (America/Chicago day boundaries)
    const todayStartIso = isoChicagoStartOfDay(new Date());
    const tomorrowStartIso = isoChicagoEndOfDay(new Date());

    const preorderRows = await supabaseRestGet(
      `preorders?created_at=gte.${encodeURIComponent(todayStartIso)}&created_at=lt.${encodeURIComponent(tomorrowStartIso)}&select=amount_cents`
    );

    const todayTotalCents = (Array.isArray(preorderRows) ? preorderRows : []).reduce(function (sum, row) {
      const v = row && row.amount_cents != null ? Number(row.amount_cents) : 0;
      return sum + (Number.isFinite(v) ? v : 0);
    }, 0);

    // Normalize booleans / numbers for frontend
    const preorderOpen = config.preorder_open === true;
    const customOrdersOpen = config.custom_orders_open === true;
    const dailyCapCents = config.daily_cap_cents != null ? Number(config.daily_cap_cents) : null;
    const statusMessage = config.status_message || "";

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        preorderOpen,
        customOrdersOpen,
        statusMessage,
        dailyCapCents,
        todayTotalCents,
        preorderPickupSchedule,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        error: "ordering-status failed",
        message: err && err.message ? err.message : String(err),
        details: err && err.details ? err.details : undefined,
      }),
    };
  }
};

