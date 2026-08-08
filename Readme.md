# SGS Orders — Cloudflare Worker

Port of the Node.js Lambda backend to Cloudflare Workers.
Deployed on a **workers.dev subdomain** — no domain migration needed.
Invoice storage remains on **AWS S3** (accessed via Signature V4 fetch — no AWS SDK required).

---

## Project Structure

```
sgs-orders-worker/
├── wrangler.toml                            # CF Worker config (production)
├── package.json                             # wrangler 4.x dev dependency
├── .gitignore
├── .dev.vars.example                        # Local dev secrets template
├── src/
│   ├── index.js                             # Router + /health endpoint
│   ├── cors.js                              # CORS headers / response helpers
│   ├── supabase.js                          # Supabase REST client (fetch-based)
│   ├── gmail.js                             # Gmail OAuth2 — pure fetch, no googleapis
│   ├── s3.js                                # AWS S3 — Sig V4 fetch, no aws-sdk
│   ├── emailTemplates.js                    # HTML email templates (all 3 types)
│   └── routes/
│       ├── createOrder.js                   # POST /orders
│       ├── updateOrderStatus.js             # PATCH status/delay, POST deliver
│       ├── orderItems.js                    # POST/PATCH/DELETE /orders/:id/items
│       ├── trackOrder.js                    # GET /track/:token (public)
│       └── sendNotification.js              # POST /orders/:id/notify
└── SGS-Orders-Worker.postman_collection.json
```

---

## API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | /health | public | Health check + dependency status |
| POST | /orders | JWT | Create order (single or multi-product) |
| PATCH | /orders/:id/status | JWT | Generic status transition |
| PATCH | /orders/:id/delay | JWT | Reschedule delivery date |
| POST | /orders/:id/deliver | JWT | Mark delivered + upload invoice (multipart) |
| POST | /orders/:id/notify | JWT | Re-send email notification |
| POST | /orders/:id/items | JWT | Add product to order |
| PATCH | /orders/:id/items/:itemId | JWT | Update product |
| DELETE | /orders/:id/items/:itemId | JWT | Delete product |
| GET | /track/:token | public | Customer order tracking |

### Status transitions (in order)
```
Order Received → Processing → Ready to Dispatch → Delivered
```
Skipping or reversing steps returns 400.

---

## Secrets

All secrets injected via Cloudflare Secrets Store — no `wrangler secret put` needed.
Store: https://dash.cloudflare.com/d781cda05787a81fa928d810ec63322f/secrets-store/2556bcd9458349f6b4ff2a3fc93bdba1

| Binding (`env.X`) | Secret name in store | Notes |
|------------------|----------------------|-------|
| `SUPABASE_URL` | `SUPABASE_URL` | Already exists |
| `SUPABASE_SERVICE_KEY` | `SUPABASE_SERVICE_KEY` | Already exists |
| `GMAIL_CLIENT_ID` | `GMAIL_CLIENT_ID` | Already exists |
| `GMAIL_CLIENT_SECRET` | `GMAIL_CLIENT_SECRET` | Already exists |
| `GMAIL_REFRESH_TOKEN` | `GMAIL_REFRESH_TOKEN` | Already exists |
| `AWS_ACCESS_KEY_ID` | `BEDROCK_ACCESS_KEY_ID` | Already exists in store |
| `AWS_SECRET_ACCESS_KEY` | `BEDROCK_SECRET_ACCESS_KEY` | Already exists in store |

> **AWS credentials**: The worker binds `BEDROCK_ACCESS_KEY_ID` → `env.AWS_ACCESS_KEY_ID` and
> `BEDROCK_SECRET_ACCESS_KEY` → `env.AWS_SECRET_ACCESS_KEY` internally, so `s3.js` needs no changes.
> The IAM user only needs `s3:PutObject` and `s3:GetObject` on `stellar-oms-invoices-production/*`.

---

## Deployment

```bash
# 1. Install dependencies
npm install

# 2. Login to Cloudflare
npx wrangler login

# 3. Test locally (uses .dev.vars for secrets)
cp .dev.vars.example .dev.vars
# fill in .dev.vars with real values
npx wrangler dev

# 4. Deploy to production
npx wrangler deploy
```

Worker goes live at:
```
https://sgs-orders-worker.<your-subdomain>.workers.dev
```

---

## Connecting the Frontend (CF Pages)

Set the API base URL in CF Pages environment variables:

1. **Cloudflare Dashboard → Workers & Pages → sgs-orders-frontend**
2. **Settings → Environment variables → Production**
3. Add or update:

| Variable | Value |
|----------|-------|
| `VITE_API_BASE_URL` | `https://sgs-orders-worker.<your-subdomain>.workers.dev` |

> Check your frontend `.env.example` for the exact variable name.
> Common: `VITE_API_BASE_URL`, `REACT_APP_API_URL`, `NEXT_PUBLIC_API_URL`.

Redeploy the Pages project after saving to pick up the new value.

---

## /health Response

```json
{
  "status": "ok",
  "service": "sgs-orders-worker",
  "version": "1.0.0",
  "timestamp": "2025-08-07T10:00:00.000Z",
  "checks": {
    "supabase": "ok",
    "s3": "credentials_present",
    "gmail": "credentials_present"
  }
}
```
- `status: ok` → HTTP 200
- `status: degraded` → HTTP 207 (something is misconfigured)

---

## Testing with Postman

1. Import `SGS-Orders-Worker.postman_collection.json`
2. Create environment **SGS Orders Production**:
   - `base_url` → `https://sgs-orders-worker.<your-subdomain>.workers.dev`
   - `auth_token` → paste a valid Supabase JWT (get from browser devtools while logged into your frontend)
3. Run **in order** — each folder auto-saves IDs for the next:
   - POST /orders → saves `order_id` + `tracking_token`
   - POST /orders/:id/items → saves `item_id`

---

## Key Differences from Lambda

| Lambda | CF Worker |
|--------|-----------|
| `@supabase/supabase-js` + `ws` | Raw `fetch()` to Supabase REST API |
| `googleapis` npm package | Raw `fetch()` to Gmail API |
| `@aws-sdk/client-s3` + presigner | AWS Signature V4 via Web Crypto API |
| `process.env.SUPABASE_SERVICE_ROLE_KEY` | `env.SUPABASE_SERVICE_KEY` |
| `exports.handler` | `export default { fetch(request, env) {} }` |
| OpenTelemetry tracing | CF Workers built-in observability (Logpush / Analytics Engine) |