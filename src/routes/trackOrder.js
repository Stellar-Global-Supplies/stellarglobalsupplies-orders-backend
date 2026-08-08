/**
 * GET /track/:token
 * Public — no auth required. Port of Lambda get-order-by-token/index.js
 */

import { dbOne, db } from "../supabase.js";
import { jsonResponse } from "../cors.js";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const PUBLIC_FIELDS = [
  "id","customer_name","product_type","material","quantity","unit",
  "status","payment_status","delivery_timeline","created_at",
  "tracking_token","invoice_url","invoice_uploaded_at",
].join(",");

export async function trackOrder(req, env, token) {
  if (!token)              return jsonResponse({ message: "Tracking token required" }, 400, env, true);
  if (!UUID_REGEX.test(token)) return jsonResponse({ message: "Invalid tracking token format" }, 400, env, true);

  let order;
  try {
    order = await dbOne("GET", "orders", env, null, `tracking_token=eq.${token}&select=${PUBLIC_FIELDS}`);
  } catch (err) {
    return jsonResponse({ message: "Order not found or invalid tracking token" }, 404, env, true);
  }
  if (!order) return jsonResponse({ message: "Order not found or invalid tracking token" }, 404, env, true);

  let orderItems = [];
  try {
    orderItems = await db("GET", "order_items", env, null,
      `order_id=eq.${order.id}&select=product_type,material,quantity,unit,unit_cost,sale_cost,cgst,sgst,description&order=created_at.asc`);
  } catch { /* non-fatal */ }

  return jsonResponse({
    id: order.id, customer_name: order.customer_name,
    product_type: order.product_type, material: order.material,
    quantity: order.quantity, unit: order.unit,
    status: order.status, payment_status: order.payment_status,
    delivery_timeline: order.delivery_timeline, created_at: order.created_at,
    invoice_url: order.invoice_url, invoice_uploaded_at: order.invoice_uploaded_at,
    order_items: orderItems,
  }, 200, env, true); // allowAll=true — public route
}