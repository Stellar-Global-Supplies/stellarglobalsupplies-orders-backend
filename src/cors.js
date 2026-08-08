/**
 * CORS helpers.
 * Authenticated routes lock to CORS_ORIGIN.
 * Public tracking route (GET /track/:token) uses allowAll = true.
 */

export function corsHeaders(env, allowAll = false) {
    return {
      "Access-Control-Allow-Origin":      allowAll ? "*" : (env.CORS_ORIGIN || "https://orders.stellarglobalsupplies.com"),
      "Access-Control-Allow-Headers":     "Content-Type,Authorization",
      "Access-Control-Allow-Methods":     "GET,POST,PATCH,DELETE,OPTIONS",
      "Access-Control-Allow-Credentials": allowAll ? "false" : "true",
    };
  }
  
  export function jsonResponse(data, status = 200, env, allowAll = false) {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders(env, allowAll),
      },
    });
  }
  
  export function preflightResponse(env, allowAll = false) {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(env, allowAll),
    });
  }