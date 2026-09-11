/**
 * GET /orders/stats?status=&date_from=&date_to=&customer_name=
 * GET /orders/:id/summary
 *
 * Read-only, unauthenticated on purpose — called server-to-server by the
 * sgs-order-ai-widget worker (never directly by end users or the LLM).
 * Only ever returns aggregates/summaries, never raw exportable order lists.
 */

import { db, dbOne }   from "../supabase.js";
import { jsonResponse } from "../cors.js";

export async function getOrderStats(req, env) {
  const url = new URL(req.url);
  const status        = url.searchParams.get("status");
  const dateFrom       = url.searchParams.get("date_from");
  const dateTo         = url.searchParams.get("date_to");
  const customerName   = url.searchParams.get("customer_name");

  const filters = [];
  if (status)       filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (dateFrom)     filters.push(`created_at=gte.${encodeURIComponent(dateFrom)}`);
  if (dateTo)       filters.push(`created_at=lte.${encodeURIComponent(dateTo)}T23:59:59`);
  if (customerName) filters.push(`customer_name=ilike.*${encodeURIComponent(customerName)}*`);

  const params = filters.join("&") + (filters.length ? "&" : "") +
    "select=id,sale_cost,quantity,status,customer_name,created_at";

  let rows;
  try {
    rows = await db("GET", "orders", env, null, params);
  } catch (err) {
    return jsonResponse({ message: "Query failed", detail: err.message }, 500, env);
  }

  const totalOrders    = rows.length;
  const totalQuantity  = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  const totalSaleValue = rows.reduce((s, r) => s + (Number(r.sale_cost) || 0), 0);
  const byStatus = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return jsonResponse({
    total_orders: totalOrders,
    total_quantity: totalQuantity,
    total_sale_value: totalSaleValue,
    by_status: byStatus,
    filters_applied: { status, date_from: dateFrom, date_to: dateTo, customer_name: customerName },
  }, 200, env);
}

export async function getOrderSummary(req, env, orderId) {
  let order;
  try {
    order = await dbOne("GET", "orders", env, null, `id=eq.${encodeURIComponent(orderId)}`);
  } catch (err) {
    return jsonResponse({ message: "Query failed", detail: err.message }, 500, env);
  }
  if (!order) return jsonResponse({ message: "Order not found" }, 404, env);

  let items = [];
  try {
    items = await db("GET", "order_items", env, null, `order_id=eq.${encodeURIComponent(orderId)}`);
  } catch { /* non-fatal */ }

  return jsonResponse({
    id: order.id,
    customer_name: order.customer_name,
    status: order.status,
    payment_status: order.payment_status,
    sale_cost: order.sale_cost,
    delivery_timeline: order.delivery_timeline,
    created_at: order.created_at,
    items,
  }, 200, env);
}
