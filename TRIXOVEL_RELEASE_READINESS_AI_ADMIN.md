# Trixovel Release Readiness & AI Administration Plan

Status: implementation specification for `ai-admin-preview`. This document does not claim that the features below are live.

## Safety and release boundaries

- Keep `main` unchanged. All work stays on `ai-admin-preview`.
- Do not run SQL, alter Supabase data, change production secrets, merge to `main`, or deploy production without explicit human approval.
- Payment, wallet top-up, withdrawal, paid random pulls, buyback settlement, seller subscription billing, commissions and agent payouts remain disabled / Coming Soon until separately approved and legally reviewed.
- AI may read, classify, summarize, detect policy violations and prepare recommendations. AI must not independently move money, change account roles, mark KYC as verified, approve sellers, release listings, alter inventory, approve refunds, ban accounts, or change legal/payment settings.
- Every sensitive action must create an approval request, require an authorized human decision, and write an immutable audit event.

## Existing code observations (source review)

- The current single-page app already contains Marketplace, Account, Seller, Orders, Admin and Agent sections.
- The contact scanner detects email addresses, phone numbers, messaging platforms, social handles, external links and payment diversion language.
- The scanner and field guard are currently browser-side JavaScript. They improve UX but are not a security boundary: a user can bypass browser checks or call backend APIs directly.
- A seller application field currently requests a WhatsApp number. This conflicts with the public rule that buyers and sellers must not exchange external contact details. Decide whether any private internal verification contact is legally/operationally necessary; do not expose it in public profiles, listings, chat, or order views.
- Account page already reports identity and seller verification states. These states must only change after server-side review.
- OAuth PKCE error was reported once during VPN use, but the user subsequently confirmed login succeeded. Do not change the OAuth flow unless the error reproduces.

## Buyer experience

1. Public listing shows card details, price, condition, stock, seller display name, seller trust status and a link to the seller storefront.
2. Buyer opens a seller storefront without seeing phone, email, WhatsApp, Telegram, social handles, payment account details or private address.
3. Buyer sends an in-platform inquiry. Text, image OCR metadata, profile fields and order messages must be checked server-side for contact/payment diversion.
4. Buyer and seller negotiate only inside Trixovel. Orders record status transitions and both parties' confirmations.
5. Only server-confirmed completed orders can produce verified-purchase reviews.
6. Buyer account shows saved items, inquiries, orders, disputes and feedback history. Never show fabricated payment confirmation or escrow status.

## Seller experience

1. Seller application -> human review -> approved / rejected / more information requested.
2. Seller dashboard includes storefront profile, listings, stock, listing review state, inquiries, orders, shipping proof and disputes.
3. Listing edits that change price, inventory, authenticity claims or ownership should be auditable.
4. Public seller profile exposes only approved display information and evidence-backed trust labels.
5. Subscription tier is separate from seller trust tier. Paying for a plan must never grant a verified/trusted badge.
6. Seller direct-sale mode is the initial marketplace path. Random-pull and buyback features stay unavailable until separate legal and operational approval.

## Feedback and voting

Proposed data model (migration draft only; not executed):
- `feedback_items`: id, author_id, category, title, body, status, created_at, updated_at, admin_response.
- `feedback_votes`: id, feedback_id, voter_id, created_at; unique(feedback_id, voter_id), one vote per authenticated user.
- `feedback_events`: append-only moderation and status history.

Rules:
- Authenticated users can create feedback and vote once per item.
- Users can edit/delete only their own feedback while it is pending; moderators can hide abusive content with a reason.
- Public view shows approved feedback and vote counts only. Never expose author email or private profile data.
- Feedback must pass the same contact/payment diversion checks as chat.
- Rate limit submissions and votes; prevent self-voting if product policy chooses that rule.
- UI wording: “Your feedback helps us improve Trixovel. Your suggestions create opportunities for new features.” Do not imply every request will be implemented.

## AI Administrator

AI capabilities:
- Summarize moderation queues and support tickets.
- Detect contact sharing, payment diversion, spam, duplicate listings, suspicious listing descriptions and unusual activity.
- Recommend category, priority and next action with evidence snippets.
- Draft seller/buyer responses and moderation explanations.
- Produce daily operational summaries.

Human approval required:
- Account suspension/ban or role changes.
- KYC and seller verification decisions.
- Listing approval/removal where ownership/authenticity is disputed.
- Refunds, disputes, inventory adjustments and order status overrides.
- Any payment, wallet, subscription, commission, agent reward or payout operation.
- Legal/policy changes and bulk data export/deletion.

Proposed tables (migration draft only; do not execute without approval):
- `admin_action_requests`: id, actor_id, action_type, target_type, target_id, proposed_payload, risk_level, status, requested_at, decided_by, decided_at, decision_reason.
- `admin_audit_logs`: id, actor_type, actor_id, action, target_type, target_id, before_hash, after_hash, approval_request_id, created_at. Append-only; no update/delete for application roles.
- `ai_admin_runs`: id, trigger_type, model_label, input_refs, output_summary, confidence, created_at. Store references and minimal necessary data, not secrets.

Security requirements:
- Enforce permissions in Postgres RLS and server-side Edge Functions, never only in HTML/JavaScript.
- AI service credentials remain server-side; never expose service-role keys in browser code.
- A human approver must be distinct from the requesting AI workflow for high-risk actions.
- Store approval rationale and before/after hashes; make audit records append-only.
- Add rate limits, idempotency keys, abuse reporting and alerting.
- Do not treat an AI confidence score as proof or authorization.

## Contact and off-platform transaction prevention

Current client scanner is not sufficient by itself. Implement the same normalized checks server-side on:
- Listing title, description and seller profile fields.
- Buyer/seller messages and offer notes.
- Feedback and reviews.
- Uploaded images using OCR, with human review for uncertain detections.

Block or quarantine email, phone, WhatsApp, Telegram, WeChat, social handles, external payment links, bank details, QR payment codes and language that asks users to move a deal off-platform. Avoid blocking legitimate shipping tracking numbers and courier references. Log the category and message ID, not unnecessary sensitive content. Provide an appeal route.

## Release test matrix

- Desktop widths: 1280, 1440 and 1920 px.
- Mobile widths: 360, 390 and 430 px.
- Check every navigation item, button, modal, form, upload, empty state and error state.
- Confirm no horizontal overflow, clipped headings, low-contrast text or overlapping sticky navigation.
- Test signed-in and signed-out states, buyer and seller permissions, admin and non-admin permissions.
- Test contact bypass attempts against backend endpoints, not only browser UI.
- Test duplicate votes, spam rate limits, unauthorized record reads and direct API role escalation.
- Verify Preview uses the preview hostname and never redirects to production.
- Confirm production `main` and production domain remain unchanged.

## Current completion status

- Existing buyer/seller/account/order/admin UI: present in the source, requires functional review.
- Contact scanning: client-side checks present; server-side enforcement remains to be verified.
- Feedback and voting: not found in the reviewed homepage source; not implemented.
- AI Administrator approval workflow: not found as a complete workflow; not implemented.
- Supabase schema/RLS for feedback and AI approvals: not verified; no SQL executed.
- Real desktop/mobile browser automation: not run in this review.
