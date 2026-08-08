/**
 * PATCH /orders/:id/status   — generic status transition
 * PATCH /orders/:id/delay    — reschedule delivery date
 * POST  /orders/:id/deliver  — mark delivered + upload invoice (multipart)
 *
 * BUG FIX: emails were fire-and-forget IIFEs — CF Workers kills unawaited
 * promises after Response is returned. All emails are now awaited before
 * returning the response so they always send.
 */

import { getUser, db, dbOne } from "../supabase.js";
import { sendEmail }          from "../gmail.js";
import { putToS3, presignedGetUrl } from "../s3.js";
import { buildStatusUpdateEmail, buildDelayNotificationEmail } from "../emailTemplates.js";
import { jsonResponse }       from "../cors.js";

const VALID_STATUSES = ["Order Received", "Processing", "Ready to Dispatch", "Delivered"];
const NEXT_STATUS = {
  "Order Received":    "Processing",
  "Processing":        "Ready to Dispatch",
  "Ready to Dispatch": "Delivered",
};
const VALID_PAYMENT = ["Pending", "Partial", "Paid", "After 30 days"];

async function fetchItems(orderId, env) {
  try {
    return await db("GET", "order_items", env, null,
      `order_id=eq.${orderId}&select=product_type,material,quantity,unit,unit_cost,sale_cost,cgst,sgst,description&order=created_at.asc`);
  } catch { return []; }
}

// ── PATCH /orders/:id/delay ───────────────────────────────────────────────────

export async function delayOrder(req, env, orderId) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user  = await getUser(token, env);
  if (!user) return jsonResponse({ message: "Unauthorized" }, 401, env);

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ message: "Invalid JSON" }, 400, env); }

  const { delivery_timeline } = body;
  if (!delivery_timeline) return jsonResponse({ message: "delivery_timeline is required" }, 400, env);

  let updated;
  try {
    updated = await dbOne("PATCH", "orders", env,
      { delivery_timeline, updated_at: new Date().toISOString(), updated_by: user.id },
      `id=eq.${orderId}`);
  } catch (err) {
    return jsonResponse({ message: "Failed to delay order", detail: err.message }, 500, env);
  }

  // Awaited — CF Workers kills unawaited promises after Response is returned
  try {
    const items = await fetchItems(orderId, env);
    const { subject, html, text } = buildDelayNotificationEmail(updated, items);
    await sendEmail({ to: updated.email, subject, html, text }, env);
  } catch (e) {
    console.error("Delay email failed (non-fatal):", e.message);
  }

  return jsonResponse(updated, 200, env);
}

// ── POST /orders/:id/deliver ──────────────────────────────────────────────────

export async function deliverOrder(req, env, orderId) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user  = await getUser(token, env);
  if (!user) return jsonResponse({ message: "Unauthorized" }, 401, env);

  const contentType = req.headers.get("content-type") || "";
  let invoiceS3Key  = null;
  let invoiceUrl    = null;
  let paymentStatus = "Paid";

  if (contentType.includes("multipart/form-data")) {
    try {
      const formData = await req.formData();
      paymentStatus  = formData.get("payment_status") || "Paid";
      const invoiceFile = formData.get("invoice");

      if (invoiceFile && invoiceFile.size > 0) {
        const filename = invoiceFile.name || `invoice_${Date.now()}.pdf`;
        const mimeType = invoiceFile.type || "application/pdf";
        const key      = `invoices/${orderId}/${Date.now()}_${filename}`;
        const buffer   = await invoiceFile.arrayBuffer();

        try {
          await putToS3(key, buffer, mimeType, env);
          invoiceS3Key = key;
          invoiceUrl   = await presignedGetUrl(key, env);
          console.log("Invoice uploaded to S3:", key);
        } catch (s3Err) {
          console.error("S3 upload (non-fatal):", s3Err.message);
        }
      }
    } catch (fErr) {
      console.error("FormData parse error:", fErr.message);
    }
  }

  const updateData = {
    status:         "Delivered",
    payment_status: paymentStatus,
    updated_at:     new Date().toISOString(),
    updated_by:     user.id,
  };
  if (invoiceUrl && invoiceS3Key) {
    updateData.invoice_url         = invoiceUrl;
    updateData.invoice_s3_key      = invoiceS3Key;
    updateData.invoice_uploaded_at = new Date().toISOString();
  }

  let updated;
  try {
    updated = await dbOne("PATCH", "orders", env, updateData, `id=eq.${orderId}`);
  } catch (err) {
    return jsonResponse({ message: "Failed to mark as delivered", detail: err.message }, 500, env);
  }

  // Awaited — CF Workers kills unawaited promises after Response is returned
  try {
    const items = await fetchItems(orderId, env);
    const { subject, html, text } = buildStatusUpdateEmail(updated, items);
    await sendEmail({ to: updated.email, subject, html, text, invoiceS3Key }, env);
  } catch (e) {
    console.error("Delivery email failed (non-fatal):", e.message);
  }

  return jsonResponse(updated, 200, env);
}

// ── PATCH /orders/:id/status ──────────────────────────────────────────────────

export async function updateStatus(req, env, orderId) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user  = await getUser(token, env);
  if (!user) return jsonResponse({ message: "Unauthorized" }, 401, env);

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ message: "Invalid JSON" }, 400, env); }

  const { status, payment_status } = body;
  if (!status || !VALID_STATUSES.includes(status))
    return jsonResponse({ message: `Invalid status. Valid: ${VALID_STATUSES.join(", ")}` }, 400, env);

  let current;
  try { current = await dbOne("GET", "orders", env, null, `id=eq.${orderId}&select=*`); }
  catch { return jsonResponse({ message: "Order not found" }, 404, env); }
  if (!current) return jsonResponse({ message: "Order not found" }, 404, env);

  const expectedNext = NEXT_STATUS[current.status];
  if (status !== expectedNext)
    return jsonResponse({ message: `Cannot transition "${current.status}" → "${status}". Expected: "${expectedNext || "none"}"` }, 400, env);

  const updatePayload = { status, updated_at: new Date().toISOString(), updated_by: user.id };
  if (payment_status && VALID_PAYMENT.includes(payment_status)) updatePayload.payment_status = payment_status;

  let updated;
  try { updated = await dbOne("PATCH", "orders", env, updatePayload, `id=eq.${orderId}`); }
  catch (err) { return jsonResponse({ message: "Failed to update order", detail: err.message }, 500, env); }

  // Awaited — CF Workers kills unawaited promises after Response is returned
  try {
    const items = await fetchItems(orderId, env);
    const { subject, html, text } = buildStatusUpdateEmail(updated, items);
    await sendEmail({ to: updated.email, subject, html, text }, env);
  } catch (e) {
    console.error("Status email failed (non-fatal):", e.message);
  }

  return jsonResponse(updated, 200, env);
}