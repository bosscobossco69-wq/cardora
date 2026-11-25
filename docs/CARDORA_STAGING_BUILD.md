# Cardora isolated Auth cutover build

This script is a **staging-only offline transformer**, not a deployment. It leaves production `index.html` unchanged. It deliberately fails closed if the expected original source format changes.

### Usage (local, isolated test machine)
```bash
CARDORA_STAGING_BUILD=YES \
CARDORA_STAGING_SUPABASE_URL=https://fdkfquvzbswxocyrhduk.supabase.co \
CARDORA_STAGING_SUPABASE_ANON_KEY='<new Cardora PUBLIC anon or publishable key>' \
node scripts/build-cardora-staging.mjs
```
Output: `dist-staging/index.html` (ignored by `.gitignore` below). Never provide a service-role key.

### Mandatory gates before staging deployment
- Configure Google OAuth provider and the exact staging redirect URL in Supabase; do not reuse the production origin.
- Apply/review the draft `is_admin` compatibility function in isolated staging, after permissions review.
- Recheck all missing/incompatible RPCs and policies — this script only modifies Supabase public URL/key, CSP and auth storage key.
- Test OAuth PKCE callback, Email OTP, log in/out, refresh, buyer and seller access, and non-admin denial.
- The script does not implement migration of Auth identities, it does not fix the remaining Stripe subscription flow, and it does not deploy anything.
- Do not put public anon keys into logs or untrusted sources; do not commit `dist-staging`.

### 22 November 2026 — offline automated draft checks
- Added `scripts/check-cardora-draft.mjs` (Node built-ins only) to validate admin queue/role checks, Stripe fail-closed gates and the staging builder with a fake publishable key. It is designed to run without contacting Supabase or Stripe and removes its temporary HTML output after checks.
- Added `.github/workflows/cardora-draft-offline.yml` to request this check on relevant PR changes. Workflow uses read-only repository permissions and has no deploy, DB, or payment steps.
- The source assertion subset was cross-checked against the current PR files; **GitHub Actions has not yet reported a workflow run**, so do not label the script as fully executed/passing. `Vercel Success` (if present) does not imply these tests ran.
- To validate from a trusted development runner: `node scripts/check-cardora-draft.mjs`. Do not provide real keys; the smoke test uses its own artificial placeholder.
- This does not substitute for a separate disposable database, actual Supabase RLS test sessions, or Stripe Sandbox webhook integration.
