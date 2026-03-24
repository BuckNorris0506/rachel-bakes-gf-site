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

function demoPayload() {
  const iso = (d) => new Date(d).toISOString();
  return {
    success: true,
    source: "demo",
    preorders: [
      {
        id: "demo-pre-1",
        name: "Jordan Lee",
        contact: "jordan@example.com",
        order_details: "2× 20-bite pretzel · 1× cinnamon 6-pk",
        line_items: { pretzel_20_orders: 2, cinnamon_6: 1, cinnamon_12: 0, cream_pies: 0, rolls_6: 0, rolls_12: 0 },
        pickup_date: new Date().toISOString().slice(0, 10),
        pickup_window: "Afternoon",
        notes: "Nut-free household",
        amount_cents: 4000,
        created_at: iso(Date.now() - 86400000),
      },
      {
        id: "demo-pre-2",
        name: "Sam Rivera",
        contact: "8165550142",
        order_details: "1× 20-bite pretzel · 2× cream pie",
        line_items: { pretzel_20_orders: 1, cinnamon_6: 0, cinnamon_12: 0, cream_pies: 2, rolls_6: 0, rolls_12: 0 },
        pickup_date: new Date(Date.now() + 86400000).toISOString().slice(0, 10),
        pickup_window: "Late morning",
        notes: "",
        amount_cents: 1800,
        created_at: iso(Date.now() - 3600000),
      },
    ],
    custom_orders: [
      {
        id: "demo-cu-1",
        name: "Alex Morgan",
        contact: "alex@example.com",
        event_date: new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10),
        pickup_date: new Date(Date.now() + 4 * 86400000).toISOString().slice(0, 10),
        item_type: "Celebration cake",
        servings: "12",
        flavor: "Vanilla / strawberry",
        design_notes: "Minimal piping, gluten-free only",
        created_at: iso(Date.now() - 7200000),
      },
    ],
  };
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
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demoPayload()),
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
    } catch (_) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(demoPayload()),
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
