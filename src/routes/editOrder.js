/**
 * PATCH /orders/:id   — edit order header fields
 *
 * Allowed fields: customer_name, phone, email, delivery_timeline, payment_status
 * Guards:
 *   - Auth required (bearer token)
 *   - Delivered orders cannot be edited
 *   - Only listed fields are written; everything else is ignored
 */

import { getUser, dbOne } from "../supabase.js";
import { jsonResponse }   from "../cors.js";

const VALID_PAYMENT  = ["Pending", "Partial", "Paid", "After 30 days"];
const EDITABLE_FIELDS = ["customer_name", "phone", "email", "delivery_timeline", "payment_status"];

export async function editOrder(req, env, orderId) {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user  = await getUser(token, env);
  if (!user) return jsonResponse({ message: "Unauthorized" }, 401, env);

  // ── Parse body ──────────────────────────────────────────────────────────────
  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ message: "Invalid JSON" }, 400, env); }

  // ── Fetch current order ─────────────────────────────────────────────────────
  let current;
  try { current = await dbOne("GET", "orders", env, null, `id=eq.${orderId}&select=id,status`); }
  catch { return jsonResponse({ message: "Order not found" }, 404, env); }
  if (!current) return jsonResponse({ message: "Order not found" }, 404, env);

  // ── Guard: cannot edit a delivered order ────────────────────────────────────
  if (current.status === "Delivered") {
    return jsonResponse({ message: "Cannot edit a delivered order" }, 400, env);
  }

  // ── Build safe update payload ────────────────────────────────────────────────
  const updates = {};

  if (body.customer_name !== undefined) {
    const name = String(body.customer_name).trim();
    if (!name) return jsonResponse({ message: "customer_name cannot be empty" }, 400, env);
    updates.customer_name = name;
  }

  if (body.phone !== undefined) {
    const phone = String(body.phone).trim();
    if (!phone) return jsonResponse({ message: "phone cannot be empty" }, 400, env);
    updates.phone = phone;
  }

  if (body.email !== undefined) {
    const email = String(body.email).trim().toLowerCase();
    if (!email || !email.includes("@")) return jsonResponse({ message: "Invalid email" }, 400, env);
    updates.email = email;
  }

  if (body.delivery_timeline !== undefined) {
    const dt = body.delivery_timeline;
    if (!dt) return jsonResponse({ message: "delivery_timeline cannot be empty" }, 400, env);
    updates.delivery_timeline = dt;
  }

  if (body.payment_status !== undefined) {
    if (!VALID_PAYMENT.includes(body.payment_status)) {
      return jsonResponse({ message: `Invalid payment_status. Valid: ${VALID_PAYMENT.join(", ")}` }, 400, env);
    }
    updates.payment_status = body.payment_status;
  }

  // Nothing editable was sent
  if (Object.keys(updates).length === 0) {
    return jsonResponse({ message: `No editable fields provided. Allowed: ${EDITABLE_FIELDS.join(", ")}` }, 400, env);
  }

  updates.updated_at = new Date().toISOString();
  updates.updated_by = user.id;

  // ── Persist ─────────────────────────────────────────────────────────────────
  let updated;
  try {
    updated = await dbOne("PATCH", "orders", env, updates, `id=eq.${orderId}`);
  } catch (err) {
    return jsonResponse({ message: "Failed to update order", detail: err.message }, 500, env);
  }

  return jsonResponse(updated, 200, env);
}
