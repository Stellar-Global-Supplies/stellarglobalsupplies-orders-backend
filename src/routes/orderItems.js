/**
 * POST   /orders/:id/items           — add product
 * PATCH  /orders/:id/items/:itemId   — update product
 * DELETE /orders/:id/items/:itemId   — delete product
 *
 * Port of Lambda update-order-items/index.js
 */

import { getUser, db, dbOne } from "../supabase.js";
import { jsonResponse }       from "../cors.js";

async function recalcOrderTotal(orderId, env) {
  const items = await db("GET", "order_items", env, null, `order_id=eq.${orderId}&select=sale_cost,cgst,sgst`);
  const total = items.reduce((s, p) => s + Number(p.sale_cost||0), 0);
  const cgst  = items.reduce((s, p) => s + Number(p.cgst||0), 0);
  const sgst  = items.reduce((s, p) => s + Number(p.sgst||0), 0);
  await db("PATCH", "orders", env, { sale_cost: total, cgst_total: cgst, sgst_total: sgst }, `id=eq.${orderId}`, "return=minimal");
}

async function authAndOrder(req, env, orderId) {
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  const user  = await getUser(token, env);
  if (!user) return { err: jsonResponse({ message: "Unauthorized" }, 401, env) };

  const order = await dbOne("GET", "orders", env, null, `id=eq.${orderId}&select=id,status`);
  if (!order)               return { err: jsonResponse({ message: "Order not found" }, 404, env) };
  if (order.status === "Delivered") return { err: jsonResponse({ message: "Cannot modify a delivered order" }, 400, env) };

  return { user, order };
}

export async function addItem(req, env, orderId) {
  const { err, user } = await authAndOrder(req, env, orderId);
  if (err) return err;

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ message: "Invalid JSON" }, 400, env); }

  const { product_type, material, quantity, unit, unit_cost, sale_cost, cgst, sgst, description } = body;
  if (!product_type || !material || !quantity || !sale_cost)
    return jsonResponse({ message: "Missing required product fields: product_type, material, quantity, sale_cost" }, 400, env);

  let item;
  try {
    item = await dbOne("POST", "order_items", env, {
      order_id: orderId, product_type, material,
      quantity: Number(quantity), unit: unit || "Pieces",
      unit_cost: Number(unit_cost)||0, sale_cost: Number(sale_cost),
      cgst: Number(cgst)||0, sgst: Number(sgst)||0, description: description||"",
    });
    await recalcOrderTotal(orderId, env);
  } catch (err) {
    return jsonResponse({ message: "Failed to add product", detail: err.message }, 500, env);
  }

  return jsonResponse(item, 201, env);
}

export async function updateItem(req, env, orderId, itemId) {
  const { err } = await authAndOrder(req, env, orderId);
  if (err) return err;

  let body;
  try { body = await req.json(); } catch { return jsonResponse({ message: "Invalid JSON" }, 400, env); }

  const existing = await dbOne("GET", "order_items", env, null, `id=eq.${itemId}&order_id=eq.${orderId}&select=id`);
  if (!existing) return jsonResponse({ message: "Product not found" }, 404, env);

  const updates = {};
  if (body.product_type !== undefined) updates.product_type = body.product_type;
  if (body.material     !== undefined) updates.material     = body.material;
  if (body.quantity     !== undefined) updates.quantity     = Number(body.quantity);
  if (body.unit         !== undefined) updates.unit         = body.unit;
  if (body.unit_cost    !== undefined) updates.unit_cost    = Number(body.unit_cost);
  if (body.sale_cost    !== undefined) updates.sale_cost    = Number(body.sale_cost);
  if (body.cgst         !== undefined) updates.cgst         = Number(body.cgst);
  if (body.sgst         !== undefined) updates.sgst         = Number(body.sgst);
  if (body.description  !== undefined) updates.description  = body.description;

  let updated;
  try {
    updated = await dbOne("PATCH", "order_items", env, updates, `id=eq.${itemId}`);
    await recalcOrderTotal(orderId, env);
  } catch (err) {
    return jsonResponse({ message: "Failed to update product", detail: err.message }, 500, env);
  }

  return jsonResponse(updated, 200, env);
}

export async function deleteItem(req, env, orderId, itemId) {
  const { err } = await authAndOrder(req, env, orderId);
  if (err) return err;

  const existing = await dbOne("GET", "order_items", env, null, `id=eq.${itemId}&order_id=eq.${orderId}&select=id`);
  if (!existing) return jsonResponse({ message: "Product not found" }, 404, env);

  try {
    await db("DELETE", "order_items", env, null, `id=eq.${itemId}`, "return=minimal");
    await recalcOrderTotal(orderId, env);
  } catch (err) {
    return jsonResponse({ message: "Failed to delete product", detail: err.message }, 500, env);
  }

  return jsonResponse({ message: "Product deleted successfully" }, 200, env);
}