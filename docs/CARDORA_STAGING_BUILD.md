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
