/**
 * SGS Orders — Cloudflare Worker (Production)
 *
 * Secrets are resolved once per request via resolveSecrets(env).
 * All route handlers receive the resolved secrets object — no .get() calls anywhere else.
 *
 * Routes:
 *   GET    /health                         → health check + dependency status
 *   POST   /orders                         → create order (auth)
 *   PATCH  /orders/:id                     → edit order header fields (auth)
 *   PATCH  /orders/:id/status              → generic status transition (auth)
 *   PATCH  /orders/:id/delay               → reschedule delivery (auth)
 *   POST   /orders/:id/deliver             → mark delivered + invoice upload (auth, multipart)
 *   POST   /orders/:id/notify              → re-send email notification (auth)
 *   POST   /orders/:id/items               → add product to order (auth)
 *   PATCH  /orders/:id/items/:itemId       → update product (auth)
 *   DELETE /orders/:id/items/:itemId       → delete product (auth)
 *   GET    /track/:token                   → public order tracking (no auth)
 */

import { resolveSecrets }                               from "./secrets.js";
import { createOrder }                                  from "./routes/createOrder.js";
import { updateStatus, delayOrder, deliverOrder }       from "./routes/updateOrderStatus.js";
import { addItem, updateItem, deleteItem }               from "./routes/orderItems.js";
import { editOrder }                                    from "./routes/editOrder.js";
import { trackOrder }                                   from "./routes/trackOrder.js";
import { sendNotification }                             from "./routes/sendNotification.js";
import { jsonResponse, preflightResponse }              from "./cors.js";

export default {
  async fetch(request, env) {
    const url    = new URL(request.url);
    const method = request.method.toUpperCase();
    const path   = url.pathname;

    // CORS preflight — no secrets needed
    if (method === "OPTIONS") {
      const isPublic = path.startsWith("/track/");
      return preflightResponse(env, isPublic);
    }

    // Resolve all Secrets Store secrets once for this request
    let secrets;
    try {
      secrets = await resolveSecrets(env);
    } catch (err) {
      console.error("Failed to resolve secrets:", err.message);
      return jsonResponse({ message: "Secret resolution failed — check Secrets Store bindings" }, 500, env, true);
    }

    // ── GET /health ───────────────────────────────────────────────────────────
    if (path === "/health" && method === "GET") {
      const checks = {
        supabase: secrets.SUPABASE_URL && secrets.SUPABASE_SERVICE_KEY ? "ok" : "missing",
        s3:       secrets.AWS_ACCESS_KEY_ID && secrets.AWS_SECRET_ACCESS_KEY ? "credentials_present" : "missing_credentials",
        gmail:    secrets.GMAIL_CLIENT_ID && secrets.GMAIL_REFRESH_TOKEN ? "credentials_present" : "missing_credentials",
      };
      const allOk = Object.values(checks).every(v => v === "ok" || v === "credentials_present");
      return jsonResponse({
        status:    allOk ? "ok" : "degraded",
        service:   "sgs-orders-worker",
        version:   "1.0.0",
        timestamp: new Date().toISOString(),
        checks,
      }, allOk ? 200 : 207, secrets, true);
    }

    // ── GET /track/:token ─────────────────────────────────────────────────────
    const trackMatch = path.match(/^\/track\/([^/]+)$/);
    if (trackMatch && method === "GET") return trackOrder(request, secrets, trackMatch[1]);

    // ── POST /orders ──────────────────────────────────────────────────────────
    if (path === "/orders" && method === "POST") return createOrder(request, secrets);

    // ── PATCH /orders/:id — edit order header fields ───────────────────────────
    const orderMatch = path.match(/^\/orders\/([^/]+)$/);
    if (orderMatch && method === "PATCH") return editOrder(request, secrets, orderMatch[1]);

    // ── /orders/:id/items/:itemId ─────────────────────────────────────────────
    const itemMatch = path.match(/^\/orders\/([^/]+)\/items\/([^/]+)$/);
    if (itemMatch) {
      const [, orderId, itemId] = itemMatch;
      if (method === "PATCH")  return updateItem(request, secrets, orderId, itemId);
      if (method === "DELETE") return deleteItem(request, secrets, orderId, itemId);
      return jsonResponse({ message: "Method not allowed" }, 405, secrets);
    }

    // ── /orders/:id/items ─────────────────────────────────────────────────────
    const itemsMatch = path.match(/^\/orders\/([^/]+)\/items$/);
    if (itemsMatch) {
      if (method === "POST") return addItem(request, secrets, itemsMatch[1]);
      return jsonResponse({ message: "Method not allowed" }, 405, secrets);
    }

    // ── /orders/:id/delay ─────────────────────────────────────────────────────
    const delayMatch = path.match(/^\/orders\/([^/]+)\/delay$/);
    if (delayMatch) {
      if (method === "PATCH") return delayOrder(request, secrets, delayMatch[1]);
      return jsonResponse({ message: "Method not allowed" }, 405, secrets);
    }

    // ── /orders/:id/deliver ───────────────────────────────────────────────────
    const deliverMatch = path.match(/^\/orders\/([^/]+)\/deliver$/);
    if (deliverMatch) {
      if (method === "POST") return deliverOrder(request, secrets, deliverMatch[1]);
      return jsonResponse({ message: "Method not allowed" }, 405, secrets);
    }

    // ── /orders/:id/notify ────────────────────────────────────────────────────
    const notifyMatch = path.match(/^\/orders\/([^/]+)\/notify$/);
    if (notifyMatch) {
      if (method === "POST") return sendNotification(request, secrets, notifyMatch[1]);
      return jsonResponse({ message: "Method not allowed" }, 405, secrets);
    }

    // ── /orders/:id/status ────────────────────────────────────────────────────
    const statusMatch = path.match(/^\/orders\/([^/]+)\/status$/);
    if (statusMatch) {
      if (method === "PATCH") return updateStatus(request, secrets, statusMatch[1]);
      return jsonResponse({ message: "Method not allowed" }, 405, secrets);
    }

    return jsonResponse({ message: "Not found" }, 404, secrets);
  },
};
