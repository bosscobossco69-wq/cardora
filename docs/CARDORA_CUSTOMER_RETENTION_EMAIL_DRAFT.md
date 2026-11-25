# Cardora — Customers & consent-based email follow-up (DRAFT, not deployed)

## Objective
Keep a single admin-only customer roster and avoid losing legitimate customer relationships. This feature must not send email until opt-in, unsubscribe, sender authentication, access-control testing and an approved scheduler exist. No customer email has been sent by this PR.

## Verified existing schema (2026-11-22; read-only inspection)
- Canonical project: `fdkfquvzbswxocyrhduk`.
- `public.users`: `id`, `member_id`, `email`, `role`, `status`, `created_at`, `auth_user_id`, balance fields.
- Seller/agent profiles and applications and orders exist separately.
- No verified consent preference, marketing unsubscribe or delivery-log tables were found in the targeted public table inventory.
- Current live `cardora-rose.vercel.app` signs users into the LEGACY project. Do not silently pool its users with the canonical project or send mail to the legacy list without separate consent/legal basis.

## Product UI (to implement after auth migration)
Admin-only Customers:
- Total canonical profiles; new today / last 7 days; customer/member ID, signup date, role, status, seller/agent status, order count (if permitted); source label and explicit test marker.
- Email verification/delivery state and whether marketing follow-ups are opted in, opted out, or unconfirmed.
- Last successfully sent email and next eligible reminder, with masked email by default.
- Separate old-system archive, NEVER silently merge by email; distinguish Auth UUIDs.
- Only the server may read full customer email lists, with active admin authorization; never expose to public client or ordinary users.
- Audit changes to preferences, and don't log raw email addresses or message contents.

## Candidate lifecycle (opt-in marketing only)
1. Account creation: create customer profile without marketing consent. Required registration / security / order messages are transactional and managed separately.
2. Sign-up UI has an optional **unchecked** checkbox: 'Send me Cardora updates, new listings and offers by email'. Record affirmative timestamp, source, text/version and, if configured, double-opt-in verification.
3. Day 0: transactional welcome/verification message only if strictly needed for account; don't use it as a promotional campaign.
4. Day 7 after explicit marketing consent: one useful discovery/onboarding email.
5. Day 21: one optional, consented follow-up if the user has not engaged or made a relevant purchase; avoid claims about nonexistent products.
6. Suppress follow-up on opt-out, bounce/complaint, blocked account, unverified recipient, ineligible country rules, or invalid email.
7. Cap marketing messages to at most 1 per 7 days and 3 per 30 days per email; idempotency per campaign/customer; no bulk backfill to old customers.
8. Every marketing email includes business identity, support contact and a one-click unsubscribe. Unsubscribe must work without logging in.
9. Track sent/delivered/bounced/complaint (provider callbacks), not pixel-based open rates as authoritative evidence of engagement.
10. Failed sends use limited retries and dead-letter review; never loop forever.

## Proposed backend (DRAFT, NOT APPLIED)
Use private schema tables with strict server-only grants:
- `cardora_private.customer_email_preferences`: auth user ID, opt-in status, consent timestamp/source/version, unsubscribe time, last preference update.
- `cardora_private.email_outbox`: recipient auth user ID, approved template/campaign key, scheduled_at, status, attempts, provider id, idempotency key, created/sent times.
- `cardora_private.email_suppressions`: hashed/normalized email or owner ref, reason, updated_at.
- `cardora_private.email_events`: event/delivery summary without unnecessary PII.
- Unique `(auth_user_id,campaign_key)` for one-time lifecycle steps; strict locking and atomic claim for concurrent scheduled runs.
- A server-only admin read endpoint with `getUser` + active admin role, paginated, masked where possible; a separate preference endpoint that allows a user to change only their own consent.
- A verified unsubscribe URL/token with short-lived, scoped, cryptographically protected token; never put admin/service keys in browser links.

## Sending provider & scheduler gate
- Choose approved email sending provider (e.g., Resend, Postmark, SES, or dedicated email CRM), verify sender domain SPF/DKIM/DMARC and reply-to identity. **Supabase Auth email sender is not a general bulk marketing sender.**
- Add provider key ONLY to server-managed secret storage; separate sandbox/test recipient allowlist.
- Schedule server-side (Supabase Cron/Edge Function or verified provider workflow) and ensure the user has approved frequency.
- Test consent/no-consent, unsubscribed, duplicate/out-of-order triggers, provider failure, bounced address, account deletion, cross-user access, exact recipient count and unsubscribes.
- Launch with one consenting internal test recipient; do not send to all existing contacts automatically.
- Review local privacy/marketing requirements applicable to users' countries, and approve final Privacy Policy / Terms before launch.

## Release gates
[ ] New canonical customer Auth/signup and email migration is verified
[ ] Sender domain and email provider approved
[ ] Data protection/privacy notice and marketing consent approved
[ ] Unsubscribe works and suppression is enforced
[ ] Active-admin-only customer roster access tested
[ ] Email scheduling and idempotency tested in isolated environment
[ ] Delivery/webhook/error alerts tested; confirmed test recipient only
[ ] Operator explicitly authorizes production email sends

**Forbidden now:** production SQL, importing legacy customers for mailing, marketing emails to unconsented customers, mass emailing, Stripe Live activity, PR merge or production deploy.
