/**
 * Secrets Store resolver.
 *
 * Production:  env.BINDING is a Secrets Store object → must call await env.BINDING.get()
 * Local dev:   env.BINDING is a plain string from .dev.vars → just use it directly
 *
 * This helper handles both cases transparently so the rest of the code
 * never needs to know which environment it's running in.
 */

async function resolve(binding) {
    if (!binding) return null;
    // Secrets Store object in production
    if (typeof binding === "object" && typeof binding.get === "function") {
      return binding.get();
    }
    // Plain string in local dev (.dev.vars)
    return binding;
  }
  
  export async function resolveSecrets(env) {
    const [
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY,
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REFRESH_TOKEN,
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY,
    ] = await Promise.all([
      resolve(env.SUPABASE_URL),
      resolve(env.SUPABASE_SERVICE_KEY),
      resolve(env.GMAIL_CLIENT_ID),
      resolve(env.GMAIL_CLIENT_SECRET),
      resolve(env.GMAIL_REFRESH_TOKEN),
      resolve(env.AWS_ACCESS_KEY_ID),   // bound from BEDROCK_ACCESS_KEY_ID
      resolve(env.AWS_SECRET_ACCESS_KEY), // bound from BEDROCK_SECRET_ACCESS_KEY
    ]);
  
    return {
      SUPABASE_URL,
      SUPABASE_SERVICE_KEY,
      GMAIL_CLIENT_ID,
      GMAIL_CLIENT_SECRET,
      GMAIL_REFRESH_TOKEN,
      AWS_ACCESS_KEY_ID,
      AWS_SECRET_ACCESS_KEY,
      // Plain [vars] — always strings, pass through as-is
      ENVIRONMENT:    env.ENVIRONMENT,
      CORS_ORIGIN:    env.CORS_ORIGIN,
      INVOICE_BUCKET: env.INVOICE_BUCKET,
      AWS_REGION:     env.AWS_REGION,
    };
  }