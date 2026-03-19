// waitlist-signup netlify function
// Stores "Get notified when ordering opens" signups in Supabase.
//
// Env vars required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Accepts POST only.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isValidEmail(email) {
  if (!email) return false;
  // simple validation; backend should still treat user-provided strings safely
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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

  // Supabase returns 201 for successful insert.
  // On unique constraint violation it often returns 409 or 400.
  const text = await res.text().catch(() => "");
  let payload = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch (_) {
    payload = null;
  }

  if (!res.ok) {
    const err = new Error(`Supabase REST POST failed (${res.status})`);
    err.details = payload || text;
    throw err;
  }

  return payload;
}

module.exports.handler = async function handler(event) {
  try {
    if (!SUPABASE_URL) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: "Missing SUPABASE_URL env var" }),
      };
    }
    if (!SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        body: JSON.stringify({ success: false, error: "Missing SUPABASE_SERVICE_ROLE_KEY env var" }),
      };
    }

    if (!event || event.httpMethod !== "POST") {
      return {
        statusCode: 405,
        body: JSON.stringify({ success: false, error: "Method not allowed" }),
      };
    }

    const rawBody = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
    let parsed = null;
    try {
      parsed = rawBody ? JSON.parse(rawBody) : null;
    } catch (_) {
      parsed = null;
    }

    const emailIn = parsed && typeof parsed.email === "string" ? parsed.email : "";
    const nameIn = parsed && typeof parsed.name === "string" ? parsed.name : "";

    const email = String(emailIn).trim().toLowerCase();
    const name = String(nameIn).trim();

    if (!email || !isValidEmail(email)) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: "Please enter a valid email address." }),
      };
    }

    // Insert into waitlist.
    // We store normalized lowercase email to match the unique index.
    const payload = await supabaseRestPost("waitlist?select=id,email", [
      {
        email: email,
        name: name || null,
      },
    ]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Thanks! You're on the list. We'll email you when ordering opens again.",
        id: payload && Array.isArray(payload) && payload.length ? payload[0].id : null,
      }),
    };
  } catch (err) {
    // Duplicate email handling (unique index on lower(email))
    const detailsStr = err && err.details ? (typeof err.details === "string" ? err.details : JSON.stringify(err.details)) : "";
    const msgStr = err && err.message ? String(err.message) : "";
    const combined = (detailsStr + " " + msgStr).toLowerCase();
    const looksDuplicate = combined.includes("duplicate") || combined.includes("23505") || combined.includes("unique");

    if (looksDuplicate) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          alreadySubscribed: true,
          message: "You're already on the list. We'll email you when ordering opens again.",
        }),
      };
    }

    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "We couldn't save your signup. Please try again in a moment.",
        debug: process.env.NODE_ENV === "development" ? String(err && err.message ? err.message : err) : undefined,
      }),
    };
  }
};

