/**
 * Gmail OAuth2 helper for CF Workers.
 * Replaces the googleapis npm package entirely — pure fetch().
 * Supports plain emails and emails with a PDF attachment.
 */

const FROM = "Stellar Global Supplies <stellarglobalsupplies@gmail.com>";

// ── OAuth2 token ─────────────────────────────────────────────────────────────

export async function getAccessToken(env) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id:     env.GMAIL_CLIENT_ID,
      client_secret: env.GMAIL_CLIENT_SECRET,
      refresh_token: env.GMAIL_REFRESH_TOKEN,
      grant_type:    "refresh_token",
    }).toString(),
  });
  const data = await res.json();
  if (!data.access_token) throw new Error(`Gmail token error: ${JSON.stringify(data)}`);
  return data.access_token;
}

// ── MIME helpers ─────────────────────────────────────────────────────────────

function encodeMIMEHeader(str) {
  if (/^[\x00-\x7F]*$/.test(str)) return str;
  return `=?UTF-8?B?${btoa(unescape(encodeURIComponent(str)))}?=`;
}

function toBase64url(str) {
  return btoa(unescape(encodeURIComponent(str)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function arrayBufferToBase64(buffer) {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function buildPlainMime({ to, subject, html, text }) {
  const boundary = `b_${Date.now()}`;
  const lines = [
    `From: ${FROM}`,
    `To: ${to}`,
    `Subject: ${encodeMIMEHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    `X-Priority: 1`,
    `Importance: high`,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    text,
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    html,
    ``,
    `--${boundary}--`,
  ].join("\r\n");
  return toBase64url(lines);
}

function buildMimeWithAttachment({ to, subject, html, text, attachmentBuffer, filename, mimeType }) {
  const boundary    = `b_${Date.now()}`;
  const altBoundary = `alt_${Date.now() + 1}`;
  const attachB64   = arrayBufferToBase64(attachmentBuffer);

  const lines = [
    `From: ${FROM}`,
    `To: ${to}`,
    `Subject: ${encodeMIMEHeader(subject)}`,
    `MIME-Version: 1.0`,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    `X-Priority: 1`,
    `Importance: high`,
    ``,
    `--${boundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    text,
    ``,
    `--${altBoundary}`,
    `Content-Type: text/html; charset="UTF-8"`,
    ``,
    html,
    ``,
    `--${altBoundary}--`,
    ``,
    `--${boundary}`,
    `Content-Type: ${mimeType}; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    `Content-Transfer-Encoding: base64`,
    ``,
    attachB64,
    ``,
    `--${boundary}--`,
  ].join("\r\n");

  return toBase64url(lines);
}

async function sendRaw(accessToken, raw) {
  const res = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method:  "POST",
    headers: {
      Authorization:  `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Gmail send error ${res.status}: ${err}`);
  }
  return res.json();
}

/**
 * Send email — with optional S3 invoice attachment.
 * invoiceS3Key: if provided, fetches from S3 and attaches the PDF.
 */
export async function sendEmail({ to, subject, html, text, invoiceS3Key }, env) {
  const accessToken = await getAccessToken(env);

  if (invoiceS3Key) {
    try {
      const { fetchFromS3 } = await import("./s3.js");
      const { buffer, contentType, filename } = await fetchFromS3(invoiceS3Key, env);
      const raw = buildMimeWithAttachment({ to, subject, html, text, attachmentBuffer: buffer, filename, mimeType: contentType });
      return sendRaw(accessToken, raw);
    } catch (attachErr) {
      console.error("Invoice attachment failed (sending without):", attachErr.message);
    }
  }

  return sendRaw(accessToken, buildPlainMime({ to, subject, html, text }));
}