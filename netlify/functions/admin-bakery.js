// GET /api/admin-bakery — list preorders + custom orders for owner dashboard
// Auth: same as admin-config (x-admin-secret, x-admin-password)

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;

function getHeader(event, name) {
  if (!event || !event.headers) return "";
  const key = name.toLowerCase();
  return event.headers[key] || "";
}

function requireAdmin(event) {
  if (!ADMIN_SECRET || !ADMIN_PASSWORD) return false;
  if (getHeader(event, "x-admin-secret") !== ADMIN_SECRET) return false;
  if (getHeader(event, "x-admin-password") !== ADMIN_PASSWORD) return false;
  return true;
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
    const err = new Error(`Supabase GET failed (${res.status})`);
    err.details = text;
    throw err;
  }
  return text ? JSON.parse(text) : [];
}

module.exports.handler = async function handler(event) {
  try {
    if (!ADMIN_SECRET || !ADMIN_PASSWORD) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Server misconfigured (admin auth)." }),
      };
    }
    if (!requireAdmin(event)) {
      return {
        statusCode: 401,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Unauthorized" }),
      };
    }

    if (!event || event.httpMethod !== "GET") {
      return {
        statusCode: 405,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Method not allowed" }),
      };
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      return {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: "Server misconfigured (Supabase env missing).",
        }),
      };
    }

    try {
      const preorders = await supabaseRestGet(
        "preorders?select=id,name,contact,order_details,line_items,pickup_date,pickup_window,notes,amount_cents,payment_preference,created_at&order=created_at.desc&limit=500"
      );
      const custom_orders = await supabaseRestGet(
        "custom_orders?select=id,name,contact,event_date,pickup_date,item_type,servings,flavor,design_notes,extra_details,payment_preference,created_at&order=created_at.desc&limit=200"
      );
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          source: "live",
          preorders: Array.isArray(preorders) ? preorders : [],
          custom_orders: Array.isArray(custom_orders) ? custom_orders : [],
        }),
      };
    } catch (err) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: err && err.message ? err.message : "Supabase request failed",
        }),
      };
    }
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: err && err.message ? err.message : "admin-bakery failed",
      }),
    };
  }
};
