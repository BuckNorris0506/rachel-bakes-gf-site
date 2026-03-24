// contact-submit — general questions / order inquiries (always accepted when Supabase is configured).
//
// Env: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
// Table: contact_inquiries (see docs/rachel-bakes-gf-launch-schema.sql)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

function isValidEmail(email) {
  if (!email) return false;
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

    const rawBody = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : (event.body || "");
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
    const email = typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";
    const phone = typeof parsed.phone === "string" ? parsed.phone.trim() : "";
    const message = typeof parsed.message === "string" ? parsed.message.trim() : "";

    if (!name) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Please add your name." }),
      };
    }
    if (!email || !isValidEmail(email)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Please enter a valid email address." }),
      };
    }
    if (!message || message.length < 8) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Please add a short message (at least a sentence)." }),
      };
    }

    const inserted = await supabaseRestPost("contact_inquiries?select=id", [
      {
        name: name,
        email: email,
        phone: phone || null,
        message: message,
      },
    ]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Thanks — we got your message and will reply by email when we can.",
        id: inserted && Array.isArray(inserted) && inserted.length ? inserted[0].id : null,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "We couldn't send your message. Please try again in a moment.",
        debug: process.env.NODE_ENV === "development" ? String(err && err.message ? err.message : err) : undefined,
      }),
    };
  }
};
