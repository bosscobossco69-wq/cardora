import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

async function sha256(value: string) {
  const data = new TextEncoder().encode(value);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function normalizeEmail(v: unknown) {
  return typeof v === "string" ? v.trim().toLowerCase() : "";
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

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
      return json({ error: "Enter a valid email address." }, 400);
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
        return json({ error: "Too many codes requested. Please wait a few minutes and try again." }, 429);
      }

      const code = String(Math.floor(10000000 + Math.random() * 90000000));
      const codeHash = await sha256(code);
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
          from: "Pokémon Treasure <onboarding@resend.dev>",
          to: [email],
          subject: "Your Pokémon Treasure verification code",
          html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;padding:24px">
            <h2 style="margin-bottom:8px">Pokémon Treasure</h2>
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

      return json({ ok: true });
    }

    if (action === "verify") {
      const code = typeof body?.code === "string" ? body.code.replace(/\D/g, "") : "";
      if (!/^\d{8}$/.test(code)) return json({ error: "Enter the 8-digit verification code." }, 400);

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
        return json({ error: "Invalid or expired code. Please request a new code." }, 400);
      }
      if ((row.attempts ?? 0) >= 5) {
        return json({ error: "Too many attempts. Please request a new code." }, 429);
      }

      const valid = (await sha256(code)) === row.code_hash;
      if (!valid) {
        await admin.from("ptx_email_otps").update({ attempts: (row.attempts ?? 0) + 1 }).eq("id", row.id);
        return json({ error: "Invalid or expired code. Please try again." }, 400);
      }

      const { data: link, error: linkError } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email,
        options: { redirectTo: body?.redirectTo || undefined },
      });
      if (linkError) throw linkError;

      const tokenHash = link?.properties?.hashed_token;
      if (!tokenHash) throw new Error("Authentication token could not be generated.");

      await admin.from("ptx_email_otps").update({ consumed_at: new Date().toISOString() }).eq("id", row.id);

      return json({ ok: true, token_hash: tokenHash });
    }

    return json({ error: "Invalid action." }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error ? e.message : "Unexpected server error." }, 500);
  }
});