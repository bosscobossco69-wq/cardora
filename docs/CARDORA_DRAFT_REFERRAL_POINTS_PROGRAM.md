# Cardora referral points and membership discount — PROPOSAL ONLY
Date: 2026-11-22
Status: Draft for operator review. **No points issued, emails sent, checkout discounts applied, or Stripe configuration changed.**

## Objective
Acquire genuine collectible-card sellers and potential buyers without Cardora stocking cards or offering mystery packs. This replaces inventory-backed "free pack" promotions with transparent referral-based discounts on OPTIONAL seller memberships. Referring someone is NEVER required to create an account, list items when eligible, withdraw money, or buy anything.

## Proposed earn rules (MYR business, noncash)
- 50 points to inviter only when referred account verifies email and passes uniqueness/anti-abuse checks; award once per real invited account, after risk review. No points simply for clicking a referral URL.
- 150 points to inviter when referred seller is approved through protected admin moderation (not merely form submission). Award once.
- 300 points to inviter and 100 points to invited buyer/seller after the invited user's FIRST eligible real paid seller subscription invoice is paid, verified through Stripe-signed webhook and held for a refund/dispute observation window (proposed 30 days). Never award from redirect/success pages or sandbox events.
- Do not award for free plans, trial signups, repeat renewals, self-referrals, refunded/reversed payments, or fake accounts.
- Proposed conversion: 1,000 points = MYR 10 off a future eligible seller-membership invoice. Initial redemption cap MYR 10 per billing month; no cash transfer, crypto payout, or free-month entitlement.
- Check whether 50 and 150 points should be pending/nonredeemable until the invited seller reaches meaningful eligible activity. Avoid monetizing low-quality registrations.
- Points cannot be bought; do not call them wallet balance or money. No forced invitation tiers or multi-level commission.
- Expiry, reversals, customer-support disputes, consumer rights and local tax/accounting treatment must be approved before enabling.

## Economics example
One invited member paying Basic MYR 29 yields up to 500 inviter points + 100 invitee points (MYR 6 potential face-value liability), before processing fees/tax/refunds. This is only an illustrative budget, not a net-profit forecast. Assume all points eventually redeem when evaluating profitability; impose a monthly cap and monitor referral CAC, genuine paid conversions and reversals.

## Technical requirements before activation
1. Create append-only referral reward ledger (unique event/provider invoice ID, inviter, invitee, event kind, points, pending/vested/reversed, timestamp, idempotency key). Never update arbitrary credit balances from browser.
2. One referral parent per invited Auth user, recorded at first eligible account creation. Reject parent == child, circular attribution, duplicate identities, recycled referrals and account takeover.
3. Verify signed Stripe event, settled first paid invoice, same canonical Cardora Auth/Stripe seller; wait approved refund/chargeback window before vesting. Do not trust checkout redirect.
4. Seller approval rewards require protected active-admin transition exactly once; verification from server-side transaction only. No automatic reward from application status fields supplied by client.
5. Atomic accrual, redemption and reversal. Use unique database constraints and explicit locking to stop concurrent double-claims. Redemption needs a verified seller subscription and Stripe credit/coupon integration validated in Sandbox; cannot simply subtract a local points counter.
6. Refund or chargeback before vest -> cancel pending rewards; after redemption -> follow documented debt/offset policy with dispute rights. No negative unexplained wallet values.
7. Enforce rate limits, anti-sybil and device/IP risk review without retaining unnecessary sensitive tracking data. Manual review and anti-fraud messaging.
8. Separate buyer/user points from seller subscription discounts; users without an eligible paid seller subscription cannot redeem this reward. Do not imply cash value for general users.
9. Display terms, qualification, cap, status and redemption history; no email marketing without separate opt-in; respect privacy policy.
10. Distinguish affiliate/referral incentive from a financial investment. Avoid pay-to-withdraw, guaranteed income, jackpot, paid random packs or multi-level rewards.
11. Conduct local regulatory, consumer, advertising and tax review before activation. Complete privacy/terms and marketing disclosures.
12. Roll out behind a default-OFF server-side flag with audit logs; demo UI must disclose NOT ACTIVE and no fake earned point balances.

## Launch order
A. Draft UI explanation only (no referral URL generation, no claim buttons with server effects).
B. Independently finish canonical seller authorization, product review and Stripe Sandbox.
C. Implement authenticated ledger + webhook tests + staged fixed-price coupons.
D. Pilot with a very small set of real consenting sellers after terms and payments approved.
E. Track paid conversion, abuse, discount cost; adjust or suspend before broad launch.

Existing project facts
- Live index.html says referral program "Not active yet"; demo battle points are unrelated and MUST NOT convert to membership credit.
- Draft Basic / Pro / Business memberships: MYR 29 / 79 / 199 monthly, not live.
- Draft Stripe checkout/portal functions are not deployed and cannot grant real membership.
