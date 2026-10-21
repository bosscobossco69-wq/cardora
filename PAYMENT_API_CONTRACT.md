# Cardora payment and payout API contract (scaffold only)

No endpoint in this bundle charges or transfers money. The current functions are intentionally fail-closed until a real provider is chosen and provider-specific adapters are implemented.

## `POST /functions/v1/create-payment-intent`
- Requires a valid Supabase user JWT and `Idempotency-Key` header.
- Request body: `{ "order_id": "<server-created order id>" }`.
- Do not accept amount, currency, user ID, fee, or payout destination as authoritative from the client.
- Current response: HTTP 503 with `payment_created: false`.
- Before enabling: load order and inventory server-side; validate owner/state/amount/currency; create provider intent using a server-held secret; persist provider ID idempotently; return only the provider-approved next action.

## `POST /functions/v1/payment-webhook`
- Public endpoint because providers do not send Supabase user JWTs (`verify_jwt = false`).
- Must verify the provider's signature against the raw body before trusting event fields.
- Persist provider event IDs uniquely to deduplicate retries. Validate merchant account, order reference, amount and currency; transition state atomically; post balanced ledger entries; then acknowledge.
- Current response: HTTP 503 if no provider secrets exist, otherwise HTTP 501. It never changes financial state.

## `POST /functions/v1/request-seller-payout`
- Requires a valid Supabase user JWT and `Idempotency-Key` header.
- Request body currently accepts only the requested currency as a non-authoritative preference. It does not accept a trusted amount or bank details.
- Current response: HTTP 503 with `payout_request_created: false`.
- Before enabling: calculate available seller payable from ledger, apply holds/reserves and eligibility checks, verify seller and payout destination, then submit through the provider's marketplace payout API. Mark paid only after provider confirmation and reconciliation.

## State model
- Payment: `created`, `pending`, `requires_action`, `processing`, `succeeded`, `failed`, `canceled`, `refund_pending`, `partially_refunded`, `refunded`, `disputed`.
- Seller payout: `requested`, `under_review`, `approved`, `processing`, `paid`, `rejected`, `failed`, `canceled`.
- Refund: `pending`, `processing`, `succeeded`, `failed`, `canceled`.
- UI may display `Paid` only for a provider-confirmed `succeeded` transaction after amount/currency/order verification. UI must never set financial status.

## Ledger model
- Use balanced double-entry journals in one DB transaction. Debits must equal credits for each currency.
- Idempotency keys and provider event IDs prevent duplicate charges/ledger postings.
- Ledger journals and entries are immutable; corrections use reversing journals.
- Browser roles cannot insert/update/delete financial rows. Never expose Supabase secret/service-role or payment-provider secrets in frontend code.

## Required tests before production
Payment success/failure/cancel, action-required flow, duplicate webhook, invalid signature, mismatched amount/currency/order, replayed idempotency key, refund/partial refund, chargeback, payout review/approval/failure, ledger balance, concurrent checkout/inventory, RLS cross-user denial, and reconciliation against provider reports.


## Marketplace model and fee disclosure
Cardora is designed as a third-party marketplace, not the direct seller of listed goods. The seller of record, payment recipient, fulfilment responsibilities and consumer remedies must be determined for each launch country and provider model. A platform fee/commission may be recorded only under an accepted, versioned fee schedule. Any buyer-facing markup or difference between seller listing price and buyer total must be disclosed before order confirmation and must not be mislabelled as FX or provider fees.

A marketplace must not assume it has no refund responsibility. The production workflow must handle seller cancellations, non-delivery, misdescription, payment-provider disputes/chargebacks and mandatory consumer remedies according to applicable law, provider rules and the final contract. No customer funds may be routed through a personal bank account or held for sellers unless expressly approved by the relevant provider and legally reviewed.

## Privacy and security requirements
Before production, publish an operator-identifying privacy notice and support contact; define data purposes, recipients, cross-border transfers, retention and user request procedures; minimize collection; avoid storing card data and bank credentials; restrict sensitive seller verification data; enforce RLS and server-side authorization; redact logs; implement rate limiting, backup/restore and incident response; and test that one user cannot read or modify another user's data.
