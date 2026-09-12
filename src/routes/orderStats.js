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
    "select=id,sale_cost,cgst_total,sgst_total,quantity,status,customer_name,created_at";

  let rows;
  try {
    rows = await db("GET", "orders", env, null, params);
  } catch (err) {
    return jsonResponse({ message: "Query failed", detail: err.message }, 500, env);
  }

  const totalOrders    = rows.length;
  const totalQuantity  = rows.reduce((s, r) => s + (Number(r.quantity) || 0), 0);
  // sale_cost is the pre-tax subtotal; cgst_total/sgst_total are stored separately.
  // Report all three explicitly rather than one ambiguous "total" figure.
  const totalSaleValue = rows.reduce((s, r) => s + (Number(r.sale_cost) || 0), 0);
  const totalCgst       = rows.reduce((s, r) => s + (Number(r.cgst_total) || 0), 0);
  const totalSgst       = rows.reduce((s, r) => s + (Number(r.sgst_total) || 0), 0);
  const byStatus = rows.reduce((acc, r) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {});

  return jsonResponse({
    total_orders: totalOrders,
    total_quantity: totalQuantity,
    total_sale_value: totalSaleValue,        // pre-tax subtotal
    total_gst: totalCgst + totalSgst,        // CGST + SGST combined
    total_with_gst: totalSaleValue + totalCgst + totalSgst,  // grand total incl. tax
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
    sale_cost: order.sale_cost,          // pre-tax subtotal
    cgst_total: order.cgst_total,
    sgst_total: order.sgst_total,
    total_with_gst: (Number(order.sale_cost) || 0) + (Number(order.cgst_total) || 0) + (Number(order.sgst_total) || 0),
    delivery_timeline: order.delivery_timeline,  // promised/expected delivery
    delivered_at: order.status === "Delivered" ? order.updated_at : null,  // actual delivery date, once delivered
    created_at: order.created_at,
    items,
  }, 200, env);
}

/**
 * GET /orders/list?status=&date_from=&date_to=&customer_name=&limit=
 *
 * Read-only, unauthenticated on purpose — same trust model as /orders/stats.
 * Returns actual order records (not just aggregates), each with its line
 * items, so the AI widget can answer "list processing orders with details"
 * style questions. Capped at 20 orders per call to keep responses small and
 * avoid dumping the whole book to a chat widget.
 */
export async function listOrders(req, env) {
  const url = new URL(req.url);
  const status        = url.searchParams.get("status");
  const dateFrom       = url.searchParams.get("date_from");
  const dateTo         = url.searchParams.get("date_to");
  const customerName   = url.searchParams.get("customer_name");
  const limit          = Math.min(Number(url.searchParams.get("limit")) || 10, 20);

  const filters = [];
  if (status)       filters.push(`status=eq.${encodeURIComponent(status)}`);
  if (dateFrom)     filters.push(`created_at=gte.${encodeURIComponent(dateFrom)}`);
  if (dateTo)       filters.push(`created_at=lte.${encodeURIComponent(dateTo)}T23:59:59`);
  if (customerName) filters.push(`customer_name=ilike.*${encodeURIComponent(customerName)}*`);

  const params = filters.join("&") + (filters.length ? "&" : "") +
    "select=id,customer_name,phone,email,status,payment_status,delivery_timeline,sale_cost,cgst_total,sgst_total,quantity,product_type,material,created_at,updated_at" +
    `&order=created_at.desc&limit=${limit}`;

  let orders;
  try {
    orders = await db("GET", "orders", env, null, params);
  } catch (err) {
    return jsonResponse({ message: "Query failed", detail: err.message }, 500, env);
  }

  // Fetch line items for all returned orders in one request (avoid N+1).
  let itemsByOrder = {};
  if (orders.length) {
    const ids = orders.map(o => `"${o.id}"`).join(",");
    try {
      const items = await db("GET", "order_items", env, null, `order_id=in.(${ids})`);
      itemsByOrder = items.reduce((acc, item) => {
        (acc[item.order_id] ||= []).push({
          product_type: item.product_type,
          material:     item.material,
          quantity:     item.quantity,
          unit:         item.unit,
          sale_cost:    item.sale_cost,
          description:  item.description,
        });
        return acc;
      }, {});
    } catch (err) {
      console.error("listOrders items fetch (non-fatal):", err.message);
    }
  }

  const result = orders.map(o => ({
    id:                o.id,
    customer_name:     o.customer_name,
    phone:             o.phone,
    email:             o.email,
    status:            o.status,
    payment_status:    o.payment_status,
    delivery_timeline: o.delivery_timeline,   // promised/expected delivery date
    delivered_at:      o.status === "Delivered" ? o.updated_at : null,  // actual delivery date once delivered
    sale_cost:         o.sale_cost,           // pre-tax subtotal
    cgst_total:        o.cgst_total,
    sgst_total:        o.sgst_total,
    total_with_gst:    (Number(o.sale_cost) || 0) + (Number(o.cgst_total) || 0) + (Number(o.sgst_total) || 0),
    created_at:        o.created_at,
    // Fall back to the order's own product_type/material/quantity if the
    // order_items rows are missing for some reason (older orders, insert failure).
    items: itemsByOrder[o.id]?.length ? itemsByOrder[o.id] : [{
      product_type: o.product_type,
      material:     o.material,
      quantity:     o.quantity,
    }],
  }));

  return jsonResponse({
    count: result.length,
    truncated: result.length === limit,
    orders: result,
    filters_applied: { status, date_from: dateFrom, date_to: dateTo, customer_name: customerName, limit },
  }, 200, env);
}
