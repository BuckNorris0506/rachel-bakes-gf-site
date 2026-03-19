// open-preorder-and-notify netlify function
// POST /api/open-preorder-and-notify
//
// Sets preorder_open=true in config, then sends an email to all waitlist rows
// where notified_at is null. After successful send, sets notified_at=now().
//
// v1 protection (same as admin-config):
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
// - RESEND_API_KEY
// - NOTIFICATION_FROM_EMAIL
//
// Optional:
// - ORDERING_CONFIG_ROW_ID (defaults to 1)
// - NOTIFICATION_SITE_URL (defaults to https://rachelbakesgf.com)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORDERING_CONFIG_ROW_ID = process.env.ORDERING_CONFIG_ROW_ID || "1";

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFICATION_FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL;
const NOTIFICATION_SITE_URL = process.env.NOTIFICATION_SITE_URL || "https://rachelbakesgf.com";

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

function isoUtcNow() {
  return new Date().toISOString();
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

async function sendResendEmail(toEmail, name) {
  const orderUrl = `${NOTIFICATION_SITE_URL}/order/`;
  const firstName = name ? String(name).trim().split(/\s+/)[0] : "";

  const subject = "Rachel Bakes GF ordering is open";
  const text =
    (firstName ? `Hi ${firstName},\n\n` : "Hi there,\n\n") +
    "Rachel Bakes GF is now taking preorders for pickup in Liberty, Missouri.\n\n" +
    `Join the preorder here: ${orderUrl}\n\n` +
    "Thanks for your support!";

  const html =
    `<p>${firstName ? `Hi ${firstName},` : "Hi there,"}</p>` +
    `<p>Rachel Bakes GF is now taking <strong>preorders</strong> for pickup in <strong>Liberty, Missouri</strong>.</p>` +
    `<p><a href=\"${orderUrl}\">Join the preorder</a></p>` +
    `<p>Thanks for your support!</p>`;

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      from: NOTIFICATION_FROM_EMAIL,
      to: toEmail,
      subject,
      text,
      html,
    }),
  });

  const textRes = await res.text().catch(() => "");
  if (!res.ok) {
    const err = new Error(`Resend send failed (${res.status})`);
    err.details = textRes;
    throw err;
  }

  return true;
}

module.exports.handler = async function handler(event) {
  try {
    // v1 protection: reject unauthorized requests first so we don't leak behavior.
    if (!ADMIN_SECRET || !ADMIN_PASSWORD) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Server misconfigured. Missing ADMIN_SECRET/ADMIN_PASSWORD." }),
      };
    }
    if (!requireAdmin(event)) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Unauthorized" }),
      };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Server misconfigured. Missing Supabase environment variables." }),
      };
    }
    if (!RESEND_API_KEY || !NOTIFICATION_FROM_EMAIL) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Server misconfigured. Missing Resend environment variables." }),
      };
    }

    if (!event || event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Method not allowed" }),
      };
    }

    // 1) Open preorder in config
    await supabaseRestPatch(
      `config?id=eq.${encodeURIComponent(ORDERING_CONFIG_ROW_ID)}`,
      { preorder_open: true, updated_at: isoUtcNow() }
    );

    // 2) Load unnotified waitlist rows
    const waitlistRows = await supabaseRestGet(
      `waitlist?notified_at=is.null&select=id,email,name&limit=5000`
    );

    let attempted = Array.isArray(waitlistRows) ? waitlistRows.length : 0;
    let sent = 0;
    let failed = 0;

    const notifiedAt = isoUtcNow();

    for (let i = 0; i < attempted; i++) {
      const row = waitlistRows[i];
      const to = row && row.email ? String(row.email).trim() : "";
      const nm = row ? row.name : "";
      try {
        if (!to) throw new Error("Missing email");
        await sendResendEmail(to, nm);
        // Mark as notified only after successful send
        await supabaseRestPatch(
          `waitlist?id=eq.${encodeURIComponent(String(row.id))}`,
          { notified_at: notifiedAt }
        );
        sent++;
      } catch (err) {
        failed++;
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        summary: {
          attempted,
          sent,
          failed,
        },
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "open-preorder-and-notify failed",
        message: err && err.message ? err.message : String(err),
      }),
    };
  }
};

