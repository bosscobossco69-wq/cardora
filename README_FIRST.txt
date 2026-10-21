CARDORA GLOBAL MARKETPLACE — PREVIEW BUNDLE

Included
- index.html: branded Cardora preview with an explicit preview-only banner, Payment & Payout Safety page, status reference and no fake payment/payout success claims.
- supabase/migrations/202610210001_cardora_payment_ledger.sql: proposed payment/payout tables, row-level security and balanced ledger posting function.
- supabase/functions/create-payment-intent/index.ts: authenticated, fail-closed payment endpoint contract.
- supabase/functions/request-seller-payout/index.ts: authenticated payout endpoint scaffold that creates no request until implemented.
- PAYMENT_API_CONTRACT.md: endpoint and state model.
- supabase/email-templates/: Cardora-branded auth email drafts (not yet installed in Supabase).
- supabase/functions/payment-webhook/index.ts: webhook scaffold that deliberately does not update financial state until a provider-specific signature adapter is implemented.
- supabase/config.toml: per-function JWT settings.

IMPORTANT
- This bundle has NOT been deployed to Vercel or Supabase. The existing live project and its index.html are untouched.
- The current UI is still a prototype. No real payment, refund, wallet credit or seller payout is processed.
- The Edge Functions intentionally return an error until a real provider adapter, order-total verification, signed webhook verification, idempotency, reconciliation and tests are implemented. Do not change these fail-closed responses to success placeholders.
- SQL is a proposed migration. Review and test it in a separate Supabase development project before applying anywhere. It has not been executed against the user's Supabase project.
- Never put Supabase secret/service-role keys or payment provider secrets in index.html. Store secrets only in server-side Supabase Function secrets.
- Before production, select a provider that supports Cardora's merchant country, target buyer countries, marketplace split payouts, refunds, disputes and settlement model; complete its compliance/onboarding.

NEXT STEPS
1. Preview index.html locally.
2. Confirm legal brand/trademark and domain availability for Cardora before buying a domain.
3. Choose the payment provider and target launch countries.
4. Apply the migration to a non-production Supabase project and run RLS/database tests.
5. Implement and test the provider-specific payment-intent and webhook adapters.
6. Run end-to-end tests for payment success/failure, duplicate webhook, refund, dispute, payout approval/failure, and ledger reconciliation.
7. Deploy only after explicit approval.


BUSINESS MODEL / PRIVACY CLARIFICATIONS
- Cardora is intended as a third-party marketplace connecting buyers and independent sellers; Cardora is not the seller of each card. Seller fulfilment and listing accuracy duties must be reflected in final seller terms.
- A marketplace still needs a dispute, cancellation/refund and chargeback policy. Do not promise “no refunds”; statutory rights, provider rules and the transaction contract may still require remedies.
- Revenue can include disclosed platform commissions/transaction fees. If buyer price and seller proceeds differ, disclose the pricing model and all mandatory charges before order confirmation; do not disguise a markup as FX or a payment fee.
- The HTML now includes a Privacy, Marketplace Terms, Fees and Payment Safety policy centre draft. It is not a substitute for legal review or a published, legally complete privacy notice.
- Privacy/security requirements before launch: data minimization, role-based access, RLS tests, server-side secrets, provider-hosted card data, log redaction, retention/deletion workflows, breach response, secure seller verification and a real privacy contact.
- Maybank receiving an international transfer does not itself mean the account is approved for merchant acquiring, collecting third-party buyer funds, marketplace split settlement or holding funds for sellers. Confirm directly with Maybank and the selected provider. Do not route buyer funds through a personal account to pay sellers without written approval and legal review.
- For Malaysia, check SSM registration and applicable licences before conducting commercial activity. SSM's EzBiz route for sole proprietorship generally requires Malaysian citizenship or permanent residency and age 18+; a limited company is not the only possible structure, but eligibility and cross-border rules need confirmation.


V3 LOCAL SEALED PACK TEST MODULE
- Added a Cardora Sealed Pokémon Pack Center to index.html.
- Features: camera access, browser BarcodeDetector attempt where supported, clearly labeled demo scan, sealed inventory records, local order reservation, opening-event state flow, quarantine/release controls, audit log and CSV export.
- The prototype uses browser localStorage only; it is not a live backend, and timestamps are browser-side in this prototype (not authoritative server timestamps).
- Photo upload is not used in this new sealed-pack workflow. Existing unrelated single-card listing UI elsewhere in the legacy preview may still contain photo-upload mockups.
- The random draw does not generate outcomes and is not enabled for real paid draws. Payment, seller subscriptions, shipping and official authenticity verification remain disconnected.
- To test: open index.html in a recent browser. Camera access requires HTTPS or localhost; if BarcodeDetector is unsupported, click “演示扫描（测试）”. Register inventory, select an item, create a demo order, switch to opening mode and run start/finish opening, then export CSV.


V5 MONTHLY SELLER LEADERBOARD FOUNDATION
- Added supabase/migrations/202610210003_cardora_seller_leaderboard.sql.
- Provides public seller handles, a server-verified sale-event table, and a current UTC-month leaderboard grouped by currency. Currency groups are separate to avoid invalid cross-currency totals.
- The migration has NOT been applied to Supabase and the UI is NOT connected to it. Review and test in a development project first.
- IMPORTANT: the app must write cardora_verified_sales only from trusted server-side logic after verifying canonical order status; never accept browser-submitted order counts or totals. Add refund/dispute updates and historical monthly snapshots before launch.
- This is a database foundation, not a complete production leaderboard: historical archive, prize awarding, admin moderation, seller identity mapping and end-to-end tests remain to be implemented.
