// admin-config netlify function
// GET /api/admin-config
// PATCH /api/admin-config
//
// v1 protection:
// - requires headers:
//   - x-admin-secret
//   - x-admin-password
// - matches env:
//   - ADMIN_SECRET
//   - ADMIN_PASSWORD
//
// Env vars required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
// - ADMIN_SECRET
// - ADMIN_PASSWORD
//
// Optional:
// - ORDERING_CONFIG_ROW_ID (defaults to 1)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORDERING_CONFIG_ROW_ID = process.env.ORDERING_CONFIG_ROW_ID || "1";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const { normalizePreorderPickupSchedule } = require("./lib/preorder-schedule");

/**
 * Parse PostgREST / Supabase REST error JSON (never echo env or secrets).
 */
function parsePostgrestErrorBody(text) {
  if (!text || typeof text !== "string") {
    return { message: null, code: undefined, details: undefined, hint: undefined };
  }
  try {
    const j = JSON.parse(text);
    if (!j || typeof j !== "object") {
      return { message: text.slice(0, 2000), code: undefined, details: undefined, hint: undefined };
    }
    return {
      message: typeof j.message === "string" ? j.message : null,
      code: j.code != null ? String(j.code) : undefined,
      details: j.details != null ? String(j.details) : undefined,
      hint: j.hint != null ? String(j.hint) : undefined,
    };
  } catch (_) {
    return { message: text.slice(0, 2000), code: undefined, details: undefined, hint: undefined };
  }
}

function makeSupabaseHttpError(httpStatus, text) {
  const p = parsePostgrestErrorBody(text);
  const err = new Error(p.message || `Supabase REST request failed (HTTP ${httpStatus})`);
  if (p.code !== undefined) err.code = p.code;
  if (p.details !== undefined) err.details = p.details;
  if (p.hint !== undefined) err.hint = p.hint;
  return err;
}

function jsonErrorResponse(stage, err, fallbackMessage) {
  const message =
    err && typeof err === "object" && err.message != null
      ? String(err.message)
      : err instanceof Error
        ? String(err.message)
        : fallbackMessage || "Unknown error";
  const body = {
    success: false,
    stage: stage,
    error: "admin-config failed",
    message: message,
  };
  if (err && typeof err === "object" && err.code != null) body.code = err.code;
  if (err && typeof err === "object" && err.details != null) body.details = String(err.details);
  if (err && typeof err === "object" && err.hint != null) body.hint = err.hint;
  return {
    statusCode: 500,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  };
}

function getHeader(event, name) {
  if (!event || !event.headers) return "";
  const key = name.toLowerCase();
  return event.headers[key] || "";
}

function requireAdmin(event) {
  const providedSecret = getHeader(event, "x-admin-secret");
  const providedPassword = getHeader(event, "x-admin-password");

  if (!ADMIN_SECRET || !ADMIN_PASSWORD) return false;
  if (providedSecret !== ADMIN_SECRET) return false;
  if (providedPassword !== ADMIN_PASSWORD) return false;
  return true;
}

// "Today" boundaries for preorder totals should follow America/Chicago.
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

async function supabaseRestGet(pathWithQuery, extraHeaders) {
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery}`;
  const res = await fetch(url, {
    method: "GET",
    headers: Object.assign(
      {
        apikey: SUPABASE_SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
        Accept: "application/json",
      },
      extraHeaders || {}
    ),
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw makeSupabaseHttpError(res.status, text);
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
    throw makeSupabaseHttpError(res.status, text);
  }
  return text ? JSON.parse(text) : [];
}

async function supabaseRestGetCount(pathWithQuery) {
  // For PostgREST/Supabase: Content-Range header usually looks like "0-0/123".
  const url = `${SUPABASE_URL}/rest/v1/${pathWithQuery}`;
  const res = await fetch(url, {
    method: "GET",
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
      Prefer: "count=exact",
    },
  });
  const text = await res.text().catch(() => "");
  if (!res.ok) {
    throw makeSupabaseHttpError(res.status, text);
  }
  const contentRange = res.headers.get("content-range") || "";
  const parts = contentRange.split("/");
  const totalStr = parts.length > 1 ? parts[1] : "";
  const total = parseInt(totalStr, 10);
  return Number.isFinite(total) ? total : 0;
}

async function getTodayTotalCents() {
  const todayStartIso = isoChicagoStartOfDay(new Date());
  const tomorrowStartIso = isoChicagoEndOfDay(new Date());
  const preorderRows = await supabaseRestGet(
    `preorders?created_at=gte.${encodeURIComponent(todayStartIso)}&created_at=lt.${encodeURIComponent(
      tomorrowStartIso
    )}&select=amount_cents`
  );
  return (Array.isArray(preorderRows) ? preorderRows : []).reduce(function (sum, row) {
    const v = row && row.amount_cents != null ? Number(row.amount_cents) : 0;
    return sum + (Number.isFinite(v) ? v : 0);
  }, 0);
}

async function getWaitlistCountUnnotified() {
  // Use count=exact + limit=0 (still returns content-range).
  // If content-range is missing, function returns 0.
  const count = await supabaseRestGetCount(
    `waitlist?notified_at=is.null&select=id&limit=0`
  );
  return count;
}

async function getConfigRow() {
  const rows = await supabaseRestGet(
    `config?id=eq.${encodeURIComponent(ORDERING_CONFIG_ROW_ID)}&select=preorder_open,custom_orders_open,daily_cap_cents,status_message,updated_at,preorder_pickup_schedule`
  );
  return Array.isArray(rows) && rows.length ? rows[0] : null;
}

module.exports.handler = async function handler(event) {
  try {
    // v1 protection: reject unauthorized requests first so we don't leak behavior.
    if (!ADMIN_SECRET || !ADMIN_PASSWORD) {
      return jsonErrorResponse("env", {
        message: "Server misconfigured: admin auth is not set.",
      });
    }

    if (!requireAdmin(event)) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Unauthorized" }),
      };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return jsonErrorResponse("env", {
        message: "Server misconfigured: Supabase URL or service role key is not set.",
      });
    }

    if (!event || !event.httpMethod) {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
    }

    if (event.httpMethod === "GET") {
      let config;
      try {
        config = await getConfigRow();
      } catch (err) {
        return jsonErrorResponse("getConfigRow", err);
      }
      if (!config) {
        return jsonErrorResponse("getConfigRow", {
          message:
            "Ordering config row is missing: no row returned for the configured ordering id (check server env and Supabase data).",
          hint: "In Supabase: confirm table `config` exists, RLS allows the service role to read it, and a row exists for the id your deployment uses.",
        });
      }
      let todayTotalCents;
      try {
        todayTotalCents = await getTodayTotalCents();
      } catch (err) {
        return jsonErrorResponse("getTodayTotalCents", err);
      }
      let waitlistCount;
      try {
        waitlistCount = await getWaitlistCountUnnotified();
      } catch (err) {
        return jsonErrorResponse("getWaitlistCountUnnotified", err);
      }
      const preorder_pickup_schedule = normalizePreorderPickupSchedule(config.preorder_pickup_schedule);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          config: {
            preorder_open: config.preorder_open === true,
            custom_orders_open: config.custom_orders_open === true,
            daily_cap_cents: Number(config.daily_cap_cents),
            status_message: config.status_message || "",
            updated_at: config.updated_at || null,
            preorder_pickup_schedule,
          },
          todayTotalCents,
          waitlistCount,
        }),
      };
    }

    if (event.httpMethod === "PATCH") {
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

      const updates = {};
      if (typeof parsed.preorder_open === "boolean") updates.preorder_open = parsed.preorder_open;
      if (typeof parsed.custom_orders_open === "boolean") updates.custom_orders_open = parsed.custom_orders_open;

      if (parsed.daily_cap_cents != null) {
        const cap = parseInt(String(parsed.daily_cap_cents), 10);
        if (!Number.isFinite(cap) || cap <= 0) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: false, error: "daily_cap_cents must be a positive integer." }),
          };
        }
        updates.daily_cap_cents = cap;
      }

      if (typeof parsed.status_message === "string") updates.status_message = parsed.status_message;

      if (parsed.preorder_pickup_schedule != null) {
        if (!Array.isArray(parsed.preorder_pickup_schedule)) {
          return {
            statusCode: 400,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ success: false, error: "preorder_pickup_schedule must be an array." }),
          };
        }
        updates.preorder_pickup_schedule = normalizePreorderPickupSchedule(parsed.preorder_pickup_schedule);
      }

      updates.updated_at = new Date().toISOString();

      let patched;
      try {
        patched = await supabaseRestPatch(
          `config?id=eq.${encodeURIComponent(ORDERING_CONFIG_ROW_ID)}`,
          updates
        );
      } catch (err) {
        return jsonErrorResponse("patchConfig", err);
      }

      let config;
      try {
        config = Array.isArray(patched) && patched.length ? patched[0] : await getConfigRow();
      } catch (err) {
        return jsonErrorResponse("getConfigRow", err);
      }
      if (!config) {
        return jsonErrorResponse("getConfigRow", {
          message:
            "Ordering config row is missing after update: no row returned for the configured ordering id.",
          hint: "In Supabase: confirm table `config` has a row for the id your deployment uses and PATCH returned a row.",
        });
      }

      let todayTotalCents;
      try {
        todayTotalCents = await getTodayTotalCents();
      } catch (err) {
        return jsonErrorResponse("getTodayTotalCents", err);
      }
      let waitlistCount;
      try {
        waitlistCount = await getWaitlistCountUnnotified();
      } catch (err) {
        return jsonErrorResponse("getWaitlistCountUnnotified", err);
      }
      const preorder_pickup_schedule = normalizePreorderPickupSchedule(config.preorder_pickup_schedule);

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          config: {
            preorder_open: config.preorder_open === true,
            custom_orders_open: config.custom_orders_open === true,
            daily_cap_cents: Number(config.daily_cap_cents),
            status_message: config.status_message || "",
            updated_at: config.updated_at || null,
            preorder_pickup_schedule,
          },
          todayTotalCents,
          waitlistCount,
        }),
      };
    }

    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: false, error: "Method not allowed" }),
    };
  } catch (err) {
    return jsonErrorResponse("unknown", err);
  }
};

