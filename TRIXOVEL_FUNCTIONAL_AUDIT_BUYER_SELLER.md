# Trixovel Functional Audit — Buyer, Seller, Orders and Release Risks

Audit branch: `ai-admin-preview`
Source reviewed: `index.html` at commit `542fa0f9316485148b384bd876d7a3521fe554f0`
Audit date: 9 November 2026
Scope: static source inspection only. No SQL, database mutation, production deployment, or live payment action was performed.

## Visual/UI constraint

Do not change the current dark/purple/gold theme, page background, font colors, spacing system, or shared design tokens as part of this functional pass. A prior attempt at a light beige/chocolate surface caused inconsistent section backgrounds and poor contrast. Visual changes require a separate, full-page design pass and screenshot comparison.

## Confirmed source findings

### Critical — Buyer/seller communication is not implemented as a live feature
The visible Notifications & Support Center includes a hard-coded sample conversation. `ptxSendChat()` appends a message to the DOM and inserts a demo reply after a timeout; it does not persist messages or connect a buyer to a seller. There is no verified buyer-to-seller conversation workflow in the reviewed source.

Required:
- Add persistent conversations linked to listing/order and authenticated buyer/seller IDs.
- Enforce participant-only read/write access using server-side authorization and database RLS.
- Apply server-side contact/payment-diversion checks to every message.
- Show delivery/read state only when actually recorded.
- Keep support chat distinct from buyer-seller chat.

### Critical — Seller Center is a placeholder, not a seller order dashboard
The reviewed Seller Center shows hard-coded “—” KPIs, a static “No orders yet” panel and fixed zero balances. The seller summary function only reads a seller profile balance; it does not load seller-owned listings or seller-side orders into the dashboard. The payout button only displays a toast and does not create a request.

Required:
- Resolve authenticated user to seller profile on the server.
- Load only that seller's listings, inquiries, orders and shipping records.
- Provide safe listing status, inventory and edit controls.
- Add seller-side order details and shipping updates with audit history.
- Keep all balance/payout labels clearly marked unavailable until ledger and payment provider reconciliation exist.

### Critical — Order status visualization is misleading
The order page says its flow is explanatory, not an actual order. However, the progress UI labels include Paid and Held, and the buyer order renderer paints the first progress segment as done for any returned order. An order created with status PENDING must not be visually represented as paid or held.

Required:
- Map progress exclusively from the actual persisted order status.
- Use neutral “Order created / Awaiting payment arrangement” language for the current no-payment marketplace.
- Never show Paid, Held, Escrow, Refunded or Settled unless server-verified evidence supports that exact state.
- Add explicit buyer/seller confirmation and cancellation/dispute states before a production launch.

### High — Listing application is not the same as a published listing
`ptxSubmitListing()` inserts into `listing_submissions`, while the marketplace reads active rows from `listings`. This is an appropriate review separation only if an authorized server-side approval action publishes the approved listing. The source review does not prove that this transition, ownership mapping, image storage, or seller storefront linkage is complete.

Required:
- Verify admin approval RPC/Edge Function, seller ownership, image upload and active-listing publication end to end.
- Do not treat a submitted application as a live listing.
- Keep public seller identity limited to display name and evidence-backed status.

### High — Cart and checkout are not yet the agreed direct-contact marketplace model
The cart checkout calls a database `create_order` RPC and creates a pending order for valid UUID listing rows. The UI then reports “Order created successfully” and displays an order ID. The site also states that payments are not connected. This may create a confusing impression of a completed purchase.

Required:
- Decide and implement one consistent initial model: buyer inquiry / offer → seller acceptance → order record → buyer and seller arrange payment independently → both confirm outcome.
- Until that workflow is implemented, label checkout as preview and do not imply a purchase, payment, escrow or guaranteed fulfillment.
- Do not charge the planned 1% seller commission yet.

### High — Seller storefront and public trust labels
The reviewed listing loader selects listing fields but does not join seller display identity or seller trust information. The Account page says public listings show only card, price and seller name; the reviewed source does not establish a complete public seller storefront.

Required:
- Add a public seller profile page linked from each listing.
- Show display name, country/region only if seller chooses to publish it, seller level, approved verification status, active listings and genuine completed-order reviews.
- Never expose email, phone, WhatsApp, Telegram, payment account details or private address.
- Keep subscription plan separate from trust level.

### Medium — Favourites are not connected
`ptxFav()` only displays a toast saying favourites are not connected. Implement persistent per-user favourites only after the listing ownership and RLS model is verified.

### Medium — Feedback and voting
No feedback/voting workflow was found in the reviewed homepage source. It remains a planned feature, not an implemented feature. Use authenticated one-vote-per-user constraints, moderation status and audit events.

### Medium — AI Administrator
A complete AI admin workflow was not found. The existing admin page has human card/deposit review UI and calls an `is_admin` RPC. AI should initially produce summaries and risk recommendations only. All account, verification, listing, inventory, refund, dispute, payment and payout decisions require an authorized human approval.

## Security checks still required

- Verify RLS for `users`, `seller_profiles`, `listings`, `listing_submissions`, `orders`, `order_items`, `order_shipping`, `wallet_reviews`, storage buckets and all future messaging/feedback tables.
- Verify all privileged RPCs check caller identity and role internally.
- Confirm service-role keys are never exposed in browser code.
- Confirm listing/order ownership cannot be spoofed by changing client payloads.
- Confirm public queries cannot read private email, phone, KYC or payment fields.
- Confirm contact-diversion controls run server-side; browser-side scanning is only a convenience layer.
- Verify uploads use authenticated storage policies, file type/size limits and private proof buckets.

## Recommended implementation order

1. Fix order status semantics and no-payment wording.
2. Implement public seller storefront and seller identity on listing cards.
3. Implement persistent buyer-seller inquiry/chat with strict RLS.
4. Implement seller-owned listings/orders dashboard and shipping updates.
5. Implement buyer confirmation, seller confirmation, cancellation and disputes.
6. Implement feedback and verified-order reviews.
7. Add AI admin queue summaries and human approval requests.
8. Run desktop/mobile and role-based end-to-end tests.

## Explicitly out of scope for this pass

- No color/theme/background redesign.
- No SQL execution or Supabase data changes.
- No payment provider activation, wallet funding, withdrawals, escrow, subscriptions, 1% commission, agent payouts, paid random pulls or buyback.
- No merge to `main` and no production deployment.

## Audit conclusion

The current source is a feature-rich preview, but several buyer/seller workflows remain mock UI or partial database integrations. Do not advertise live buyer-seller chat, seller storefront, seller order management, completed checkout, payment protection, or AI-admin automation as operational until the corresponding server-side workflow and permission tests pass.
