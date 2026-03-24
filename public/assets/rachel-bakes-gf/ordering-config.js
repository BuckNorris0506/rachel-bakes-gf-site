/**
 * Rachel Bakes GF — Ordering status (sitewide)
 *
 * TOGGLE ORDERING ON/OFF: Edit the values below.
 * - preorderOpen: true = order page shows the request form; false = order page shows a friendly "closed" message.
 * - customOrdersOpen: true = custom orders page shows the request form; false = custom orders page shows "closed" message.
 * - statusMessage: Shown when ordering is closed. Update this to say when you'll reopen (e.g. summer, holidays).
 */
window.RACHEL_BAKES_ORDERING = {
  preorderOpen: false,
  customOrdersOpen: false,
  statusMessage: "Ordering is currently closed. Rachel Bakes GF will reopen for preorder pickup windows—join the list below to hear when ordering opens again.",
  preorderPickupSchedule: [],
};

/** Tentative pricing (cents) — must match netlify/functions/lib/preorder-menu.js */
window.RACHEL_BAKES_PREORDER_PRICES_CENTS = {
  pretzel_20_orders: 1000,
  cinnamon_6: 2000,
  cinnamon_12: 4000,
  cream_pies: 400,
  rolls_6: 1200,
  rolls_12: 2400,
};
