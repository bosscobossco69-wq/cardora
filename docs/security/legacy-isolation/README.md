# Legacy commercial isolation — review only

No production changes authorized by this draft. Do not execute automatically on merge or deploy.

## Scope
- Remove EXECUTE from PUBLIC, anon and authenticated for exactly four old RPCs. Keep function bodies, postgres ownership and existing service_role grants. Old direct commercial review RPCs will also be unavailable to browser sessions of administrators; this is intentional, not a loss of their admin role.
- Replace only the two legacy ToyyibPay sandbox handlers with dependency-free HTTP 410 responses. Preserve JWT gateway configuration (bill creation true; callback false). Gateway may reject missing/invalid credentials before the handler.
- Leave cardora-admin-overview, users, authentication, RLS, statistics job, profile table, historical subscriptions, wallet and all unrelated functions untouched. Do not delete data or secrets, open payments, grant new rights, or deploy the application website.
- This is not a blanket service-role shutdown. Trusted backend paths remain privileged; audit any residual backend caller independently.

## Read-only preflight findings (2026-11-27)
Four original RPCs have postgres ownership, definer flag and explicit authenticated/service_role EXECUTE. No anon EXECUTE. The administrator statistics function source does not invoke them; its own admin authorization and service-role reads remain separate. No reference was found in the inspected database function bodies, active statistics job or repository code search; static search is not proof of all external consumers. Both payment handlers were version 9; creation verify_jwt=true, callback verify_jwt=false. Payment-intent table empty at inspection, two existing subscription rows. No secrets read. The legacy callback still has service-role mutation capability in its existing code.

## Separate approval and rollout
1. Recheck project identity, exact source revisions and ACLs, open/in-flight/settled-but-unreconciled payment intents, provider dashboard and external consumers. Do not proceed if unresolved payments or a necessary old admin workflow is identified. Record existing function definitions/ACLs and edge versions securely outside the public repo. Do not store production credentials in GitHub.
2. On explicit authorization, deploy the two exact retired handlers to their existing slugs only; preserve verify_jwt flags. Verify gateway and handler behavior with harmless no-payment requests; check old requests in flight and provider retry consequences. No real payment or callback replay. If partial deployment fails, stop and report exact state; do not silently restore a payment path.
3. Revoke exact four RPC client EXECUTE grants using the reviewed transactional SQL. Recheck effective privileges, function definitions, owner/service grants and unrelated permission fingerprints. Confirm no legacy client call can enter the body. Never run original write RPCs merely to test production.
4. Verify existing admin statistics with the owner's authenticated session, public snapshot freshness, regular member login/profile read, and no unexpected historical changes. Re-run Security Advisor; leaked-password warning and intentional no-policy notices may remain.
5. Keep new PR #20 and #21 independent. No application release gate or old commercial permission is changed by this draft.

## Rollback boundary
The ACL change can be reversed using the captured original grants, but requires separate approval. Restoring original payment handlers could re-enable old payment behavior and must not be done automatically. The safe default after partial failure is to leave a successfully retired endpoint retired and investigate. No data deletion or schema replacement is included.

## Tests and limitations
Disposable PostgreSQL 17 tests execute the exact ACL draft against synthetic roles and sentinel functions. They verify ACL behavior, not the complete production legacy business function semantics or actual admin session. Node tests execute the exact proposed handlers using a mock Deno registration and standard Request/Response; no provider, real credentials or database connections. Production gateway behavior, active external calls and real administrator session are not covered. Standard public GitHub Actions runner; no paid infrastructure.
