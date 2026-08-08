/**
 * Minimal AWS S3 helper for CF Workers — fetch() + AWS Signature V4.
 * Replaces @aws-sdk/client-s3 and @aws-sdk/s3-request-presigner entirely.
 * Implements: PutObject, GetObject, presigned GET URL.
 */

const PRESIGN_TTL = 7 * 24 * 60 * 60; // 7 days

// ── Crypto (Web Crypto API — native in CF Workers) ────────────────────────────

async function hmacSHA256(key, data) {
  const k = await crypto.subtle.importKey(
    "raw", typeof key === "string" ? new TextEncoder().encode(key) : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  return crypto.subtle.sign("HMAC", k, new TextEncoder().encode(data));
}

async function sha256hex(data) {
  const buf = await crypto.subtle.digest(
    "SHA-256",
    typeof data === "string" ? new TextEncoder().encode(data) : data
  );
  return toHex(buf);
}

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isoDate(now) { return now.toISOString().replace(/[:-]|\.\d{3}/g, "").slice(0, 15) + "Z"; }
function dateStamp(now) { return now.toISOString().slice(0, 10).replace(/-/g, ""); }

async function signingKey(secret, date, region) {
  let k = await hmacSHA256(`AWS4${secret}`, date);
  k = await hmacSHA256(k, region);
  k = await hmacSHA256(k, "s3");
  return hmacSHA256(k, "aws4_request");
}

async function sign({ method, url, extraHeaders = {}, body = null, env }) {
  const region  = env.AWS_REGION || "us-east-1";
  const now     = new Date();
  const amzDate = isoDate(now);
  const date    = dateStamp(now);
  const parsed  = new URL(url);
  const host    = parsed.host;

  const bodyHash = body
    ? await sha256hex(body instanceof ArrayBuffer ? body : body)
    : "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855";

  const hdrs = { host, "x-amz-date": amzDate, "x-amz-content-sha256": bodyHash, ...extraHeaders };
  const sortedKeys   = Object.keys(hdrs).sort();
  const canonHdrs    = sortedKeys.map(k => `${k}:${hdrs[k]}`).join("\n") + "\n";
  const signedHdrs   = sortedKeys.join(";");
  const canonQuery   = Array.from(parsed.searchParams.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonReq = [method, parsed.pathname, canonQuery, canonHdrs, signedHdrs, bodyHash].join("\n");
  const scope    = `${date}/${region}/s3/aws4_request`;
  const sts      = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256hex(canonReq)].join("\n");
  const sig      = toHex(await hmacSHA256(await signingKey(env.AWS_SECRET_ACCESS_KEY, date, region), sts));

  return {
    headers: {
      ...hdrs,
      Authorization: `AWS4-HMAC-SHA256 Credential=${env.AWS_ACCESS_KEY_ID}/${scope}, SignedHeaders=${signedHdrs}, Signature=${sig}`,
    },
  };
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function putToS3(key, body, contentType, env) {
  const bucket = env.INVOICE_BUCKET;
  const region = env.AWS_REGION || "us-east-1";
  const url    = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  const { headers } = await sign({ method: "PUT", url, extraHeaders: { "content-type": contentType }, body, env });
  const res = await fetch(url, { method: "PUT", headers: { ...headers, "content-type": contentType }, body });
  if (!res.ok) throw new Error(`S3 PutObject (${res.status}): ${await res.text()}`);
  return key;
}

export async function fetchFromS3(key, env) {
  const bucket = env.INVOICE_BUCKET;
  const region = env.AWS_REGION || "us-east-1";
  const url    = `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  const { headers } = await sign({ method: "GET", url, env });
  const res = await fetch(url, { method: "GET", headers });
  if (!res.ok) throw new Error(`S3 GetObject (${res.status})`);
  return {
    buffer:      await res.arrayBuffer(),
    contentType: res.headers.get("content-type") || "application/pdf",
    filename:    key.split("/").pop() || "invoice.pdf",
  };
}

export async function presignedGetUrl(key, env) {
  const bucket  = env.INVOICE_BUCKET;
  const region  = env.AWS_REGION || "us-east-1";
  const now     = new Date();
  const amzDate = isoDate(now);
  const date    = dateStamp(now);
  const host    = `${bucket}.s3.${region}.amazonaws.com`;
  const scope   = `${date}/${region}/s3/aws4_request`;
  const cred    = `${env.AWS_ACCESS_KEY_ID}/${scope}`;

  const qp = new URLSearchParams({
    "X-Amz-Algorithm":     "AWS4-HMAC-SHA256",
    "X-Amz-Credential":    cred,
    "X-Amz-Date":          amzDate,
    "X-Amz-Expires":       String(PRESIGN_TTL),
    "X-Amz-SignedHeaders": "host",
  });

  const canonQuery = Array.from(qp.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join("&");

  const canonReq  = ["GET", `/${key}`, canonQuery, `host:${host}\n`, "host", "UNSIGNED-PAYLOAD"].join("\n");
  const sts       = ["AWS4-HMAC-SHA256", amzDate, scope, await sha256hex(canonReq)].join("\n");
  const sig       = toHex(await hmacSHA256(await signingKey(env.AWS_SECRET_ACCESS_KEY, date, region), sts));

  return `https://${host}/${key}?${canonQuery}&X-Amz-Signature=${sig}`;
}