import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ALLOWED_ORIGINS = new Set([
  "https://cardora-git-staging-order-safety-fixes-pokemon-treasure.vercel.app",
]);
function corsFor(origin: string | null) {
  return {
    "Access-Control-Allow-Origin": origin && ALLOWED_ORIGINS.has(origin) ? origin : "null",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function secureCode() {
  const bytes = new Uint32Array(1);
  crypto.getRandomValues(bytes);
  return String(10000000 + (bytes[0] % 90000000));
}
async function keyedHash(value: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(value));
  return Array.from(new Uint8Array(signature)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) return new Response("Forbidden origin", { status: 403, headers: corsFor(null) });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsFor(origin) });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405, origin);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE || !RESEND_API_KEY) {
    return json({ error: "Server email configuration is incomplete." }, 500);
  }

  const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  try {
    const body = await req.json();
    const action = body?.action;
    const email = normalizeEmail(body?.email);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "Enter a valid email address." }, 400, origin);
    }

    if (action === "send") {
      const { data: recent, error: recentError } = await admin
        .from("ptx_email_otps")
        .select("created_at")
        .eq("email", email)
        .is("consumed_at", null)
        .gte("created_at", new Date(Date.now() - 15 * 60 * 1000).toISOString())
        .order("created_at", { ascending: false })
        .limit(5);

      if (recentError) throw recentError;
      if ((recent?.length ?? 0) >= 5) {
        return json({ error: "Too many codes requested. Please wait a few minutes and try again." }, 429, origin);
      }

      const code = await secureCode();
      const codeHash = await keyedHash(code, SERVICE_ROLE);
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

      await admin
        .from("ptx_email_otps")
        .update({ consumed_at: new Date().toISOString() })
        .eq("email", email)
        .is("consumed_at", null);

      const { error: insertError } = await admin
        .from("ptx_email_otps")
        .insert({ email, code_hash: codeHash, expires_at: expiresAt });
      if (insertError) throw insertError;

      const resend = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Trixovel <onboarding@resend.dev>",
          to: [email],
          subject: "Your Trixovel verification code",
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
            <h2 style="margin-bottom:8px">Trixovel</h2>
            <p>Your verification code is:</p>
            <div style="font-size:34px;font-weight:700;letter-spacing:8px;margin:22px 0">${code}</div>
            <p>This 8-digit code expires in 10 minutes.</p>
            <p style="color:#777;font-size:13px">If you did not request this code, you can ignore this email.</p>
          </div>`,
        }),
      });

      if (!resend.ok) {
        const detail = await resend.text();
        await admin.from("ptx_email_otps").update({ consumed_at: new Date().toISOString() }).eq("email", email).eq("code_hash", codeHash);
        return json({ error: "Email provider error.", detail }, 502);
      }

      return json({ ok: true }, 200, origin);
    }

    if (action === "verify") {
      const code = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
      if (!/^\d{8}$/.test(code)) return json({ error: "Enter the 8-digit verification code." }, 400, origin);

      const { data: row, error: rowError } = await admin
        .from("ptx_email_otps")
        .select("id, code_hash, expires_at, attempts")
        .eq("email", email)
        .is("consumed_at", null)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (rowError) throw rowError;
      if (!row || new Date(row.expires_at).getTime() < Date.now()) {
        return json({ error: "Invalid or expired code. Please request a new code." }, 400, origin);
      }
      if ((row.attempts ?? 0) >= 5) {
        return json({ error: "Too many attempts. Please request a new code." }, 429, origin);
      }

      const { data: attemptCount, error: attemptError } = await admin.rpc("ptx_increment_otp_attempt", { p_id: row.id });
      if (attemptError) throw attemptError;
      if (attemptCount === null) return json({ error: "Too many attempts. Please request a new code." }, 429, origin);
      const valid = (await keyedHash(code, SERVICE_ROLE)) === row.code_hash;
      if (!valid) return json({ error: "Invalid or expired code. Please try again." }, 400, origin);

      let redirectTo: string | undefined;
      if (body?.redirectTo) {
        try {
          const target = new URL(body.redirectTo);
          if (target.origin !== "https://cardora-git-staging-order-safety-fixes-pokemon-treasure.vercel.app") {
            return json({ error: "Invalid redirect destination." }, 400, origin);
          }
          redirectTo = target.toString();
        } catch {
          return json({ error: "Invalid redirect destination." }, 400, origin);
        }
      }
      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo },
      });
      if (linkError) throw linkError;

      const tokenHash = link?.properties?.hashed_token;
      if (!tokenHash) throw new Error("Authentication token could not be generated.");

      await admin.from("ptx_email_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

      return json({ ok: true, token_hash: tokenHash }, 200, origin);
    }

    return json({ error: "Invalid action." }, 400, origin);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unexpected server error." }, 500, origin);
  }
});