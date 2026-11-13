

### Wallet, settlement, dispute and withdrawal audit — 2026-11-13
- Production wallet_transactions has only buyer wallet deposit/adjustment writers and no order_id; allowed types are deposit/withdrawal/adjustment. create_order_with_wallet's order_hold insert is schema-incompatible.
- create_checkout_order initializes order_financials platform_fee/seller_net to zero; record_order_payment changes them to 8% / 92%; confirm_order_received separately hardcodes seller credit at 92%. Checked-in fees.html says current 0% and planned 5%, while the approved project decision is current 0% and future 1% inactive. This policy mismatch must be resolved before any payment activation.
- confirm_order_received increments seller available_balance but does not release buyer users.held_balance or add a corresponding seller ledger entry in its inspected body.
- admin_resolve_dispute only updates dispute/order statuses for refund/release/partial; no corresponding balance or ledger movements appear in its body.
- request_withdrawal deducts seller available_balance and creates a pending withdrawal request but does not create a matching wallet_transactions entry. No named approve/reject withdrawal processor was found in this pass; an external/manual processor was not ruled out.
- Production has separate buyer balances (users.balance / held_balance) and seller earnings (seller_profiles.available_balance); the current wallet_transactions table does not represent both domains as a unified traceable ledger.
- See `docs/remediation/2026-11-13-wallet-settlement-ledger-audit.md` for verified source details, limitations and safe implementation sequence.
- No Production writes, Staging schema/data changes, deployments, payment calls, or money movement occurred.
