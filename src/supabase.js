/**
 * Supabase REST client for CF Workers.
 * Uses fetch() — no Node.js SDK, no ws package.
 * Secret binding: SUPABASE_SERVICE_KEY (matches Secrets Store name).
 */

function headers(env, extra = {}) {
    return {
      apikey:         env.SUPABASE_SERVICE_KEY,
      Authorization:  `Bearer ${env.SUPABASE_SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer:         "return=representation",
      ...extra,
    };
  }
  
  /**
   * Verify a Supabase JWT and return the user, or null on failure.
   * Replaces supabase.auth.getUser() from the Node.js SDK.
   */
  export async function getUser(token, env) {
    const res = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
      headers: {
        apikey:        env.SUPABASE_SERVICE_KEY,
        Authorization: `Bearer ${token}`,
      },
    });
    if (!res.ok) return null;
    return res.json();
  }
  
  /**
   * Generic Supabase REST request.
   */
  export async function db(method, table, env, body = null, params = "", prefer = null) {
    const url = `${env.SUPABASE_URL}/rest/v1/${table}${params ? `?${params}` : ""}`;
    const res = await fetch(url, {
      method,
      headers: headers(env, prefer ? { Prefer: prefer } : {}),
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`DB ${method} ${table} → ${res.status}: ${text}`);
    return text ? JSON.parse(text) : [];
  }
  
  /** Convenience: return first row or null */
  export async function dbOne(method, table, env, body = null, params = "", prefer = null) {
    const rows = await db(method, table, env, body, params, prefer);
    return Array.isArray(rows) ? (rows[0] ?? null) : rows;
  }