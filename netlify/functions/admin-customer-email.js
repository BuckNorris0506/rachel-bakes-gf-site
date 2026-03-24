// POST /api/admin-customer-email — bakery-branded customer emails (Resend when configured)
// Body: { template, to, customerName, orderSummary, pickupDate, orderId, orderType }
// Auth: x-admin-secret, x-admin-password

const ADMIN_SECRET = process.env.ADMIN_SECRET;
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD;
const RESEND_API_KEY = process.env.RESEND_API_KEY;
const NOTIFICATION_FROM_EMAIL = process.env.NOTIFICATION_FROM_EMAIL;
const BAKERY_REPLY_TO = process.env.BAKERY_REPLY_TO_EMAIL || process.env.NOTIFICATION_FROM_EMAIL;
const NOTIFICATION_SITE_URL = process.env.NOTIFICATION_SITE_URL || "https://rachelbakesgf.com";

function getHeader(event, name) {
  if (!event || !event.headers) return "";
  return event.headers[name.toLowerCase()] || "";
}

function requireAdmin(event) {
  if (!ADMIN_SECRET || !ADMIN_PASSWORD) return false;
  if (getHeader(event, "x-admin-secret") !== ADMIN_SECRET) return false;
  if (getHeader(event, "x-admin-password") !== ADMIN_PASSWORD) return false;
  return true;
}

const TEMPLATES = {
  confirm_order: {
    subject: (ctx) => "Your Rachel Bakes GF order is confirmed",
    html: (ctx) =>
      `<p>Hi ${ctx.firstName},</p>` +
      `<p>We’ve confirmed your preorder request. Here’s what we have on file:</p>` +
      `<blockquote style="margin:12px 0;padding:12px;border-left:3px solid #2b3a44;background:#f8fafc;">${ctx.orderSummary || ""}</blockquote>` +
      (ctx.pickupDate ? `<p><strong>Pickup date:</strong> ${ctx.pickupDate}</p>` : "") +
      `<p>We’ll reach out if anything needs to change. Thank you for supporting Rachel Bakes GF — Liberty’s gluten-free bakery.</p>` +
      `<p style="color:#64748b;font-size:13px;">Rachel Bakes GF · Liberty, Missouri<br/><a href="${NOTIFICATION_SITE_URL}">${NOTIFICATION_SITE_URL}</a></p>`,
  },
  need_more_info: {
    subject: () => "Quick question about your Rachel Bakes GF order",
    html: (ctx) =>
      `<p>Hi ${ctx.firstName},</p>` +
      `<p>We’re almost ready to lock in your order — can you reply with a bit more detail?</p>` +
      `<blockquote style="margin:12px 0;padding:12px;border-left:3px solid #6f8798;background:#f1f5f9;">${ctx.orderSummary || ""}</blockquote>` +
      `<p>Reply to this email and we’ll get you on the schedule.</p>` +
      `<p style="color:#64748b;font-size:13px;">Rachel Bakes GF · Liberty, Missouri</p>`,
  },
  ready_for_pickup: {
    subject: () => "Your order is ready for pickup — Rachel Bakes GF",
    html: (ctx) =>
      `<p>Hi ${ctx.firstName},</p>` +
      `<p>Your bake is <strong>ready for pickup</strong>.</p>` +
      `<blockquote style="margin:12px 0;padding:12px;border-left:3px solid #2b3a44;background:#f8fafc;">${ctx.orderSummary || ""}</blockquote>` +
      (ctx.pickupDate ? `<p><strong>Pickup:</strong> ${ctx.pickupDate}</p>` : "") +
      `<p>See you soon — thank you!</p>` +
      `<p style="color:#64748b;font-size:13px;">Rachel Bakes GF · Liberty, Missouri</p>`,
  },
  picked_up: {
    subject: () => "Thanks for picking up — Rachel Bakes GF",
    html: (ctx) =>
      `<p>Hi ${ctx.firstName},</p>` +
      `<p>Thanks for picking up your order. We hope you love every bite!</p>` +
      `<p style="color:#64748b;font-size:13px;">— Rachel Bakes GF</p>`,
  },
  unavailable: {
    subject: () => "Update on your Rachel Bakes GF request",
    html: (ctx) =>
      `<p>Hi ${ctx.firstName},</p>` +
      `<p>We’re not able to fulfill part of this request as written. Here’s what we have on file:</p>` +
      `<blockquote style="margin:12px 0;padding:12px;border-left:3px solid #b45309;background:#fffbeb;">${ctx.orderSummary || ""}</blockquote>` +
      `<p>Reply to this email and we’ll suggest the closest option we can offer.</p>` +
      `<p style="color:#64748b;font-size:13px;">Rachel Bakes GF · Liberty, Missouri</p>`,
  },
  waitlist_reopen: {
    subject: () => "Ordering is open again — Rachel Bakes GF",
    html: (ctx) =>
      `<p>Hi ${ctx.firstName},</p>` +
      `<p>Preorder is open again at Rachel Bakes GF. Join the line here:</p>` +
      `<p><a href="${NOTIFICATION_SITE_URL}/order/">Place a preorder</a></p>` +
      `<p>Thank you for waiting!</p>` +
      `<p style="color:#64748b;font-size:13px;">Rachel Bakes GF · Liberty, Missouri</p>`,
  },
};

function extractEmail(contact) {
  if (!contact || typeof contact !== "string") return "";
  const m = contact.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
  return m ? m[0].toLowerCase() : "";
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

    if (!event || event.httpMethod !== "POST") {
      return { statusCode: 405, body: JSON.stringify({ success: false, error: "Method not allowed" }) };
    }

    const raw = event.isBase64Encoded ? Buffer.from(event.body || "", "base64").toString("utf8") : event.body || "";
    let parsed = null;
    try {
      parsed = raw ? JSON.parse(raw) : null;
    } catch (_) {
      parsed = null;
    }
    if (!parsed || typeof parsed !== "object") {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Invalid JSON body." }),
      };
    }

    const template = typeof parsed.template === "string" ? parsed.template : "";
    const to = typeof parsed.to === "string" ? parsed.to.trim() : "";
    const customerName = typeof parsed.customerName === "string" ? parsed.customerName : "";
    const orderSummary = typeof parsed.orderSummary === "string" ? parsed.orderSummary : "";
    const pickupDate = typeof parsed.pickupDate === "string" ? parsed.pickupDate : "";
    const orderId = parsed.orderId != null ? String(parsed.orderId) : "";
    const orderType = typeof parsed.orderType === "string" ? parsed.orderType : "";

    if (!TEMPLATES[template]) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Unknown template." }),
      };
    }

    const emailTo = to || extractEmail(parsed.contact || "");
    if (!emailTo || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailTo)) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Valid customer email required." }),
      };
    }

    const firstName = customerName.trim().split(/\s+/)[0] || "there";
    const ctx = { firstName, orderSummary, pickupDate };

    const def = TEMPLATES[template];
    const subject = def.subject(ctx);
    const html = def.html(ctx);

    const demo = !RESEND_API_KEY || !NOTIFICATION_FROM_EMAIL;

    if (demo) {
      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: true,
          demo: true,
          message: "Email not sent (Resend not configured). Log this send in the admin UI.",
          logged: {
            template,
            to: emailTo,
            subject,
            orderId,
            orderType,
            at: new Date().toISOString(),
          },
        }),
      };
    }

    const payload = {
      from: NOTIFICATION_FROM_EMAIL,
      to: emailTo,
      subject,
      html,
    };
    if (BAKERY_REPLY_TO) payload.reply_to = BAKERY_REPLY_TO;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
    });
    const textRes = await res.text().catch(() => "");
    if (!res.ok) {
      return {
        statusCode: 502,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ success: false, error: "Resend failed", details: textRes }),
      };
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: true,
        demo: false,
        message: "Email sent.",
        logged: {
          template,
          to: emailTo,
          subject,
          orderId,
          orderType,
          at: new Date().toISOString(),
        },
      }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        success: false,
        error: err && err.message ? err.message : "admin-customer-email failed",
      }),
    };
  }
};
