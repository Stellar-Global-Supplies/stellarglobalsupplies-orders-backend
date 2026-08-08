/**
 * POST /orders/:id/notify
 * Manually re-sends email notification for any order.
 * Port of Lambda send-notification/index.js
 *
 * Body: { type: "confirmation" | "status_update" }
 */

import { getUser, dbOne, db } from "../supabase.js";
import { sendEmail }          from "../gmail.js";
import { buildOrderConfirmationEmail, buildStatusUpdateEmail } from "../emailTemplates.js";
import { jsonResponse }       from "../cors.js";

export async function sendNotification(req, env, orderId) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user  = await getUser(token, env);
  if (!user) return jsonResponse({ message: "Unauthorized" }, 401, env);

  let body = {};
  try { body = await req.json(); } catch { /* type defaults below */ }

  const type = body.type || "status_update"; // "confirmation" | "status_update"

  let order;
  try { order = await dbOne("GET", "orders", env, null, `id=eq.${orderId}&select=*`); }
  catch { return jsonResponse({ message: "Order not found" }, 404, env); }
  if (!order) return jsonResponse({ message: "Order not found" }, 404, env);

  let orderItems = [];
  try {
    orderItems = await db("GET", "order_items", env, null,
      `order_id=eq.${orderId}&select=product_type,material,quantity,unit,sale_cost,cgst,sgst,description&order=created_at.asc`);
  } catch { /* non-fatal */ }

  try {
    const builder = type === "confirmation" ? buildOrderConfirmationEmail : buildStatusUpdateEmail;
    const { subject, html, text } = builder(order, orderItems);
    // Only attach invoice on status_update emails
    const invoiceS3Key = type === "status_update" ? order.invoice_s3_key : null;
    await sendEmail({ to: order.email, subject, html, text, invoiceS3Key }, env);
    return jsonResponse({ message: "Email sent", recipient: order.email, type }, 200, env);
  } catch (err) {
    console.error("sendNotification:", err.message);
    return jsonResponse({ message: "Failed to send email", detail: err.message }, 500, env);
  }
}