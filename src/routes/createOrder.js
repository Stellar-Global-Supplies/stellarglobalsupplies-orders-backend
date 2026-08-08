/**
 * POST /orders
 * Port of Lambda create-order/index.js
 * Auth: Supabase JWT via Authorization header
 */

import { getUser, db, dbOne } from "../supabase.js";
import { sendEmail }          from "../gmail.js";
import { buildOrderConfirmationEmail } from "../emailTemplates.js";
import { jsonResponse }       from "../cors.js";

export async function createOrder(req, env) {
  // Auth
  const token = (req.headers.get("authorization") || "").replace("Bearer ", "");
  if (!token) return jsonResponse({ message: "Unauthorized" }, 401, env);
  const user = await getUser(token, env);
  if (!user) return jsonResponse({ message: "Invalid token" }, 401, env);

  let body;
  try { body = await req.json(); }
  catch { return jsonResponse({ message: "Invalid JSON" }, 400, env); }

  const { customer_name, phone, email, payment_status, delivery_timeline, products } = body;

  const missing = ["customer_name", "phone", "email"].filter(k => !body[k]?.trim());
  if (missing.length) return jsonResponse({ message: `Missing required fields: ${missing.join(", ")}` }, 400, env);
  if (!products?.length) return jsonResponse({ message: "At least one product is required" }, 400, env);

  for (let i = 0; i < products.length; i++) {
    const p  = products[i];
    const pm = ["product_type", "material", "quantity", "sale_cost"].filter(k => p[k] === undefined || p[k] === null || p[k] === "");
    if (pm.length) return jsonResponse({ message: `Product ${i + 1}: Missing fields: ${pm.join(", ")}` }, 400, env);
  }

  const trackingToken = crypto.randomUUID();
  const totalCost     = products.reduce((s, p) => s + Number(p.sale_cost), 0);
  const cgstTotal     = products.reduce((s, p) => s + (Number(p.cgst) || 0), 0);
  const sgstTotal     = products.reduce((s, p) => s + (Number(p.sgst) || 0), 0);
  const firstProduct  = products[0];

  let order;
  try {
    order = await dbOne("POST", "orders", env, {
      customer_name:     customer_name.trim(),
      phone:             phone.trim(),
      email:             email.trim().toLowerCase(),
      product_type:      firstProduct.product_type,
      material:          firstProduct.material,
      quantity:          Number(firstProduct.quantity),
      unit:              firstProduct.unit || "Pieces",
      sale_cost:         totalCost,
      cgst_total:        cgstTotal,
      sgst_total:        sgstTotal,
      payment_status:    payment_status || "Pending",
      delivery_timeline: delivery_timeline || null,
      status:            "Order Received",
      created_by:        user.id,
      tracking_token:    trackingToken,
    });
  } catch (err) {
    console.error("createOrder insert:", err.message);
    return jsonResponse({ message: "Failed to create order", detail: err.message }, 500, env);
  }

  const orderItems = products.map(p => ({
    order_id:     order.id,
    product_type: p.product_type,
    material:     p.material,
    quantity:     Number(p.quantity),
    unit:         p.unit || "Pieces",
    unit_cost:    Number(p.unit_cost) || 0,
    sale_cost:    Number(p.sale_cost),
    cgst:         Number(p.cgst) || 0,
    sgst:         Number(p.sgst) || 0,
    description:  p.description || "",
  }));

  try { await db("POST", "order_items", env, orderItems, "", "return=minimal"); }
  catch (err) { console.error("order_items insert (non-fatal):", err.message); }

  // Awaited — CF Workers kills unawaited promises after Response is returned
  try {
    const { subject, html, text } = buildOrderConfirmationEmail(order, products);
    await sendEmail({ to: order.email, subject, html, text }, env);
  } catch (e) {
    console.error("Confirmation email failed (non-fatal):", e.message);
  }

  return jsonResponse(order, 201, env);
}