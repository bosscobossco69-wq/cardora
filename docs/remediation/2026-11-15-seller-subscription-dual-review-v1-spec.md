# Cardora Seller Subscription & Review Modes — v1 Specification
Date: 2026-11-15
Branch: staging/order-safety-fixes
Status: Approved v1 commercial direction for Staging implementation; no Production activation.

## 1. Product model
Seller subscriptions have two independent dimensions:
- Review mode: `ai_auto` (AI Smart Review) or `human_manual` (Human Review).
- Listing capacity tier: Free (5), Basic (30), Pro (150), Business (600), or Custom (>600 by quote).

Listing prices remain USD. Subscription billing currency remains MYR. Current marketplace commission remains 0%; future 1% commission is not activated by this specification.

## 2. v1 monthly pricing proposal
| Tier | Listing limit | AI Smart Review | Human Review |
|---|---:|---:|---:|
| Free | 5 | RM0 | RM29 |
| Basic | 30 | RM39 | RM69 |
| Pro | 150 | RM99 | RM199 |
| Business | 600 | RM249 | RM599 |
| Custom | >600 | Quote | Quote |

Free tier is available only with AI Smart Review. Human Review starts at the 5-listing paid tier.
All amounts are MYR per month. These are v1 proposed/pilot prices; do not activate live billing until checkout, public disclosure, provider verification, and user authorization are complete.

## 3. Trial and subscription lifecycle
- Both review modes receive a 7-day trial where the selected plan is eligible.
- Existing 7-day grace-period policy is retained.
- Paid subscription activation requires server-verified payment; browser redirects are not proof of payment.
- Free AI plan may be activated without payment.
- Mode changes are requested during the current period and take effect at the next subscription period.
- Preserve current review mode for already-submitted listings and retain their review history.
- Existing listings are not deleted on expiry or downgrade. New listing creation is limited by the effective quota.
- If a seller exceeds a downgraded quota, block new submissions until usage falls below the limit or the seller upgrades.

## 4. AI Smart Review rules
1. AI checks listing text, images, category, completeness, and platform-policy risk.
2. AI may auto-approve only when the listing passes configured deterministic policy thresholds.
3. Any uncertainty, suspected policy issue, or risk signal routes the listing to human review.
4. AI alone must not make the final rejection decision.
5. AI review is content moderation, not physical-card authentication or a guarantee of authenticity.
6. If the seller's human-review allowance is exhausted, new cases requiring human review are held in a clearly disclosed pending state. They must never be auto-approved or discarded.
7. Existing queued human-review cases remain recorded. Do not silently remove, bypass, or auto-approve them.

## 5. Human Review rules
- Every listing submitted under this mode enters the human review queue.
- No AI auto-approval.
- Human outcomes: approve, request changes, or reject, with reason and reviewer audit trail.
- Review service timing must not be promised until staffing and operating capacity are validated.

## 6. Included human-review allowance for AI plans (v1 proposal)
| AI tier | Included human-review cases per billing period |
|---|---:|
| Free | 2 |
| Basic | 10 |
| Pro | 30 |
| Business | 100 |
| Custom | Individually agreed |

A case is counted once per listing per review cycle. A routine resubmission after requested edits should not consume another allowance unless a material content change triggers a new review cycle. This definition must be enforced server-side and logged. When allowance is exhausted, pause new human-review work and offer purchase of additional allowance or wait for the next billing period. Do not charge automatically.

Additional review allowance price is not yet set; no paid top-up should be enabled until separately priced and disclosed.

## 7. Listing quota semantics
Preserve current Staging quota behavior unless a later approved policy changes it:
- Count statuses: `pending_review`, `active`, `rejected`, `suspended`.
- Rejected listing resubmission reuses the same listing and does not consume another slot.
- Deleted listings do not count.
- Enforce quota in trusted database/server logic, not only in the browser.

## 8. Seller application
- Seller applications are auto-approved and create/activate a Seller Profile idempotently.
- Seller approval does not publish listings.
- Seller application and Agent application remain separate. Agent applications retain their existing manual approval workflow.
- Preserve application records and history. Do not delete existing pending applications during migration.
- Seller may select a review mode and capacity after profile creation. Do not force a paid purchase merely to obtain Seller identity.
- Existing pending Seller applications should be handled by a controlled, idempotent Staging backfill/review process, not a blind destructive update.

## 9. Data and security requirements
Reuse existing tables and lifecycle structures where possible. Current Staging already has:
- `seller_subscription_plans`
- `seller_subscriptions`
- `seller_subscription_events`
- `seller_subscription_payment_intents`
- `seller_applications`
- `seller_profiles`

Required additions/changes should support:
- plan review mode and tier identity;
- current and next review mode, with effective period date;
- included human-review allowance and period usage;
- immutable/auditable review cases and outcomes;
- idempotent seller auto-approval.

Security:
- Browser clients must not write subscription prices, payment verification, quotas, review decisions, or review usage counters.
- All privileged transitions are server-side with narrow grants and fixed search_path for SECURITY DEFINER functions.
- RLS remains enabled; do not expose payment intents to browser clients.
- No new financial balance fields.
- No real payment activation, refund, payout, or fund movement in this scope.

## 10. Implementation acceptance tests
1. Seller application auto-approval creates exactly one Seller Profile and one initial Free AI subscription; repeated invocation is idempotent.
2. Seller approval never creates an Agent Profile.
3. Agent application continues to require the existing manual review process and does not create a Seller Profile.
4. AI clear-pass case can be auto-approved by trusted server logic.
5. AI uncertainty routes to human review.
6. AI cannot final-reject a listing by itself.
7. Human mode always enters the human queue and cannot auto-approve.
8. AI human-review allowance is counted once per review cycle and cannot be modified by the browser.
9. Exhausted allowance holds new human-review cases; no auto-approval or loss of audit history.
10. Mode switch requested mid-period becomes effective only next period.
11. Existing queued listings retain their original review mode and history.
12. Listing quotas and resubmission behavior remain enforced server-side.
13. Paid plans remain inactive until provider server-side verification; no live checkout is enabled in this scope.
14. RLS and RPC execute privileges are tested for anon, authenticated seller, admin, and service role.
15. No Production project, main branch, live credentials, or Vercel Production deployment is modified.

## 11. Deferred decisions / launch gates
- Additional human-review top-up price and purchase flow.
- Staffing, service-level targets, working hours, and escalation process.
- Trial eligibility restrictions (e.g. one trial per person/account/payment identity).
- AI provider/model, image limits, confidence thresholds, false-positive handling, and operational cost caps.
- Tax, payment-provider fees, subscription refunds/proration, and renewal failure policy beyond the existing grace-period baseline.
- Whether existing pending Seller applications should be bulk auto-approved or processed on next login.
- Final public wording and effective date for v1 prices.

## 12. Scope and safety
Staging project only: `fdkfquvzbswxocyrhduk`.
GitHub repository: `bosscobossco69-wq/cardora`.
Branch: `staging/order-safety-fixes`.
Production remains read-only and unchanged. No live payment or financial operation is enabled by this document.
