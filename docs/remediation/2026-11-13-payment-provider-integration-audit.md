# Cardora payment integration audit — Staging
Date: 2026-11-13
Scope: Staging Supabase project and staging/order-safety-fixes source files only.
Production remains read-only. No provider credentials were read or changed.

## Findings
1. Staging Supabase currently has only two deployed Edge Functions: ai-support and ptx-email-otp. There is no deployed payment checkout or payment webhook Edge Function.
2. The staging source index.html describes payments as not live and says local payments are not connected.
3. The source fees.html says the current fee is 0%, but still publishes a planned 5% seller commission, says there is no subscription, and describes no payment provider as connected. This conflicts with the current approved business policy:
   - platform commission now 0%;
   - future platform commission 1%, inactive until an explicit effective date;
   - Seller plans Free RM0/5, Basic RM29/30, Pro RM79/150, Business RM199/600;
   - 7-day trial and 7-day grace;
   - Agent referral reward 25% of actual platform commission only.
4. Staging database contains test_payment_webhook_events and test helper routines ptx_test_claim_payment_event, ptx_test_finalize_payment, and ptx_test_mark_payment_event_processed. These are test scaffolding, not evidence of a verified provider webhook.
5. The test payment finalization helper previously audited hardcodes 8% platform commission / 92% seller net. It must not be reused for real payments or subscription activation.
6. The test webhook event table stores provider, event ID, payload hash, status, and timestamps. It does not itself verify provider signatures or prove a payment is captured.
7. No ToyyibPay or Stripe checkout/webhook source was found in the inspected Staging source paths or deployed Edge Function inventory. The repository searchable default-branch index returned no provider hits; source inspection was performed against known staging branch files. This is a bounded audit, not proof that no provider account exists.
8. Existing Staging index.html is branded Trixovel and its metadata/canonical URLs reference an older Vercel preview origin, while repository/project branding is Cardora. Do not update public branding blindly without coordinating the complete page and deployment workflow.

## Safety decision
- Do not implement a fake checkout or mark a subscription paid from a browser redirect.
- Do not deploy an unauthenticated payment webhook until the provider's exact signature-verification scheme and callback contract are known.
- Do not expose provider secrets to frontend code, repository files, logs, or client-side database calls.
- Do not use the 8% test settlement helper.
- Do not accept real subscription money until the provider account is approved, payment currency/settlement support is confirmed, webhook signature verification is implemented, idempotency and amount/currency/reference checks are tested, and journal posting is integrated.

## Required provider facts before implementation
The owner has previously discussed ToyyibPay onboarding. Actual provider account approval and API credentials are not established by this Staging source audit. Before coding the adapter, verify:
- which provider is selected for Cardora subscription checkout (ToyyibPay, Stripe, or another provider);
- merchant account approval status and allowed business category;
- supported MYR payment methods and settlement currency;
- create-bill/checkout API contract and required customer fields;
- callback/webhook signature algorithm, headers, retry behavior, and event IDs;
- refund/void support and payout/settlement timing.

Never ask the user to paste secret API keys into chat. Configure secrets only in the provider's secure project secret store after the code contract is confirmed.

## Next implementation steps
1. Update the public fee page so its published policy matches the approved 0% now / 1% future policy and Seller subscription catalog, while clearly marking paid checkout unavailable until provider approval and verified integration.
2. Implement a server-side provider adapter only after the provider contract is verified.
3. Add subscription checkout intent/order rows with MYR amount, plan snapshot, owner, expiry, and idempotency key.
4. Verify provider webhook signature before recording a payment event.
5. Confirm exact subscription ID, amount, MYR currency, final provider status, and event idempotency.
6. Post a balanced double-entry journal using the service-only journal primitive.
7. Activate/extend subscription only after verified payment + successful journal posting in the same trusted server-side workflow.
8. Test duplicate, replayed, malformed, wrong amount, wrong currency, wrong subscription, failed, refunded, and delayed callbacks.
9. Keep real payments disabled until the complete end-to-end tests pass.