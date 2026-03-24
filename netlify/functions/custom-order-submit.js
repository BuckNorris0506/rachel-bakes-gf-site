// custom-order-submit netlify function
// Stores custom order submissions in Supabase (no cap logic).
//
// Env vars required:
// - SUPABASE_URL
// - SUPABASE_SERVICE_ROLE_KEY
//
// Accepts POST only.

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ORDERING_CONFIG_ROW_ID = process.env.ORDERING_CONFIG_ROW_ID || "1";

const { isPaymentPreferenceOk } = require("./lib/preorder-schedule");

function isValidEmail(email) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
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
    const email = typeof parsed.email === "string" ? parsed.email.trim() : "";
    const phone = typeof parsed.phone === "string" ? parsed.phone.trim() : "";
    const contactLegacy = typeof parsed.contact === "string" ? parsed.contact.trim() : "";
    const contact =
      contactLegacy ||
      (email ? email + (phone ? " · " + phone : "") : phone || "");

    if (email && !isValidEmail(email)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Please enter a valid email address." }),
      };
    }

    if (!name || !contact) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Please complete name and email so we can follow up." }),
      };
    }

    const paymentPreference =
      typeof parsed.payment_preference === "string" ? parsed.payment_preference.trim() : "";
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

    // config gate
    const configRows = await supabaseRestGet(
      `config?id=eq.${encodeURIComponent(ORDERING_CONFIG_ROW_ID)}&select=custom_orders_open,status_message`
    );
    const config = Array.isArray(configRows) && configRows.length ? configRows[0] : null;
    if (!config) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Ordering config is missing." }),
      };
    }

    const customOrdersOpen = config.custom_orders_open === true;
    const statusMessage = config.status_message || "Custom orders are not open right now.";

    if (!customOrdersOpen) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: statusMessage,
        }),
      };
    }

    const event_date = typeof parsed.event_date === "string" ? parsed.event_date.trim() : "";
    const pickup_date = typeof parsed.pickup_date === "string" ? parsed.pickup_date.trim() : "";
    const item_type = typeof parsed.item_type === "string" ? parsed.item_type.trim() : "";
    const servings = typeof parsed.servings === "string" ? parsed.servings.trim() : "";
    const flavor = typeof parsed.flavor === "string" ? parsed.flavor.trim() : "";
    const design_notes = typeof parsed.design_notes === "string" ? parsed.design_notes.trim() : "";
    const inspiration_link = typeof parsed.inspiration_link === "string" ? parsed.inspiration_link.trim() : "";
    const allergy_notes = typeof parsed.allergy_notes === "string" ? parsed.allergy_notes.trim() : "";
    const extra_details = typeof parsed.extra_details === "string" ? parsed.extra_details.trim() : "";
    const inspiration_notes = typeof parsed.inspiration_notes === "string" ? parsed.inspiration_notes.trim() : "";
    const reference_file_name = typeof parsed.reference_file_name === "string" ? parsed.reference_file_name.trim() : "";
    const reference_file_data = typeof parsed.reference_file_data === "string" ? parsed.reference_file_data.trim() : "";

    if (reference_file_data && reference_file_data.length > 900000) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Reference file is too large. Please use a smaller image or paste a link instead." }),
      };
    }

    const toNullable = function (s) {
      return s ? s : null;
    };

    const row = {
      name: name,
      contact: contact,
      event_date: toNullable(event_date),
      pickup_date: toNullable(pickup_date),
      item_type: toNullable(item_type),
      servings: toNullable(servings),
      flavor: toNullable(flavor),
      design_notes: toNullable(design_notes),
      inspiration_link: toNullable(inspiration_link),
      allergy_notes: toNullable(allergy_notes),
      extra_details: toNullable(extra_details),
    };
    if (email) row.email = email;
    if (phone) row.phone = phone;
    if (inspiration_notes) row.inspiration_notes = inspiration_notes;
    if (reference_file_name) row.reference_file_name = reference_file_name;
    if (reference_file_data) row.reference_file_data = reference_file_data;
    row.payment_preference = paymentPreference;

    const inserted = await supabaseRestPost("custom_orders?select=id", [row]);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        message: "Thanks! Your custom order request was saved. We'll follow up soon to confirm fit and pickup timing.",
        id: inserted && Array.isArray(inserted) && inserted.length ? inserted[0].id : null,
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: "We couldn't save your custom order. Please try again in a moment.",
        debug: process.env.NODE_ENV === "development" ? String(err && err.message ? err.message : err) : undefined,
      }),
    };
  }
};

