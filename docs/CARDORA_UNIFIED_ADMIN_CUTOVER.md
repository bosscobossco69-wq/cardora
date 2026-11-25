# Cardora unified administrator dashboard — draft cutover gate

Status: **DRAFT, NO PRODUCTION CHANGE OR DEPLOYMENT**. 2026-11-22.

## Source of truth

- Future operational identity and seller subscriptions: Cardora Supabase `fdkfquvzbswxocyrhduk`.
- Existing production website still authenticates against legacy `crqqockaetgacddxkqpb`. **Never simply replace the Supabase URL in production**; Auth subject UUIDs differ even for the one email shared between projects.
- The staging-only build in `scripts/build-cardora-staging.mjs` switches to the new project's public key and isolated `cardora-supabase-auth-v2-staging` storage. Requires real new-project admin login and QA.
- New admin overview Edge Function `cardora-admin-overview` provides new-project counts + new-project application list; optionally reads the old seller-application archive using server-only `CARDORA_LEGACY_READ_SERVICE_KEY`. It labels both sources separately and never copies or merges records.
- Both environment switches `CARDORA_ADMIN_OVERVIEW_VERIFIED` and `CARDORA_AUTH_MIGRATION_VERIFIED` must be explicitly `true` after isolated test. Until then the endpoint fails closed (503). **Do not enable now.**
- Legacy archive access is a privileged **read-only code path** (SELECT) and MUST be protected by administrator authentication on the new project. Never expose `CARDORA_LEGACY_READ_SERVICE_KEY` or `SUPABASE_SERVICE_ROLE_KEY` in frontend files or Vercel public environment variables. Prefer a narrowly scoped legacy read-only database interface over a full-power service key before production.
- If history is not configured or fails, dashboard must show **unavailable** rather than 0; no silent partial aggregate.

## Verified records (read-only review, 2026-11-22)

| Source | Auth users | public.users | Application records | Notes |
| --- | ---: | ---: | ---: | --- |
| Legacy | 2 | 2 | 3 | all seller role; 2 contacted, 1 rejected; 2 have an obvious TEST label |
| Cardora | 5 | 5 | 2 | 1 seller approved, 1 agent approved; **both** match a test-like name/email pattern |

Cardora also currently has 2 seller profiles, 1 agent profile, 5 listing rows, 1 order row, 2 subscription rows. Raw rows are **not** verified real customers, paid orders, or revenue. One email exists in both projects, but its Auth UUIDs differ. Do not add 2+5 as unique individuals.

**Test detection caveat:** `suspected_test` only looks for words test/demo/sample or the example.com/.org/.net domain in name/email. It is not proof; requires human classification. Never automatically delete, exclude from original raw totals, or approve/reject from this flag alone.

## Acceptance gates before production switch

1. Verify complete, authenticated sign-in and sign-out for the **new-project administrator** on isolated preview; legacy sessions must NOT carry over. Verify the same for ordinary customers and sellers.
2. Confirm `public.users` admin role cannot be forged by a non-admin. Test missing token, invalid token, normal user, suspended admin, wrong project JWT, and actual new-project admin; only the last may see counts, names, emails or archive.
3. Verify legacy read credentials never reach the browser, logs, GitHub, or checkout endpoints. Rotate any exposed key; use read-only least-privilege mechanism before production.
4. Match each old/new account only by independently verified ownership; do **not** copy auth UUIDs, reset user passwords, or use email equality as authorization.
5. Preserve old seller applications (2 contacted, 1 rejected). Keep them visible in an explicit read-only history section, not as newly pending requests. Preserve new applications and their current statuses.
6. Classify existing TEST/DEMO entries manually. Present raw counts, reviewed-real counts, and unknown counts separately, with clear as-of time.
7. Confirm original application moderation flow still works in new project through reviewed admin RPCs, with correct server-side roles and no access from ordinary users.
8. Audit all legacy features in the staging UI (registration, Google callback, seller applications, orders, listings, privacy, public pages). Rollback plan: switch hosting only after all checks pass and restore previous Vercel deployment if any regression occurs.
9. Avoid actual payment and full Live checkout until sandbox end-to-end identity, webhook ordering, cancellation, and refund/dispute tests pass.
10. Fix Vercel Preview rate limitation; get a successful **fresh** preview build and browser test. GitHub offline checks alone cannot prove real operation.

## Scope of this draft

- Commits only on `draft/stripe-sandbox-subscriptions-20261121` in PR #6.
- No production SQL migrations, no overwrites or deletions of application/user/financial rows, no production deployment, no Live charges, no automatic admin role assignment.
- Important: **a single real-time public unified website link does not exist until a verified authenticated preview is deployed**. The current `https://cardora-rose.vercel.app/#admin` still points to the OLD project and is not authoritative for new totals.

## Operator links
- Draft PR: https://github.com/bosscobossco69-wq/cardora/pull/6
- New Cardora Supabase: https://supabase.com/dashboard/project/fdkfquvzbswxocyrhduk/editor
- Old legacy Supabase: https://supabase.com/dashboard/project/crqqockaetgacddxkqpb/editor
