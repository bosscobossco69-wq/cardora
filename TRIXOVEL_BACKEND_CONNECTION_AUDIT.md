# Trixovel Backend Connection Audit

Date: 9 November 2026
Branch: `ai-admin-preview`
Source: `index.html` at blob SHA `542fa0f9316485148b384bd876d7a3521fe554f0`
Method: source inspection and Supabase project metadata inspection. No SQL, database mutation, key rotation, deployment, or production change.

## 1. Important project-link finding

The current preview HTML explicitly configures its Supabase URL as:

`https://crqqockaetgacddxkqpb.supabase.co`

Its Content Security Policy `connect-src` allows that same Supabase host. Supabase project metadata identifies this ref as:

- Project name: `pokemon-treasure-demo`
- Project ref: `crqqockaetgacddxkqpb`
- Region: `ap-southeast-1`
- Status: `ACTIVE_HEALTHY`

A separate Supabase project also exists:

- Project name: `cardora`
- Project ref: `fdkfquvzbswxocyrhduk`
- Region: `ap-southeast-1`
- Status: `ACTIVE_HEALTHY`

The reviewed Trixovel preview source does **not** point to the separate `cardora` project. Do not assume that the cardora Supabase project is connected just because its name matches the old repository brand. Before implementing new features, decide which project is the intended Trixovel database and verify its schema and data ownership. Do not switch the app URL by guesswork.

## 2. Database introspection limitation

A read-only attempt to list public tables with verbose columns/foreign keys failed with PostgreSQL authentication error `28P01` for the read-only database user. A read-only migration-list request also failed with PostgreSQL authentication error `28P01`.

Therefore this audit has **not** verified:
- Whether `conversations`, `messages`, `feedback`, or `seller_storefronts` tables already exist.
- Actual columns, constraints, foreign keys, RLS policies, triggers or indexes.
- Whether the two projects contain the same or different data.
- Which project is production-authoritative.

Do not create duplicate tables or migrations until introspection is working and the target project is confirmed.

## 3. Immediate safe next actions

1. Verify the intended project ref from the Vercel environment and the production site's configured Supabase URL.
2. Restore read-only schema inspection access through the supported Supabase connection; do not paste database passwords or service-role keys into chat.
3. Inspect public table metadata, foreign keys, RLS enablement and policies in the confirmed project.
4. Compare the existing schema to the proposed seller storefront, buyer-seller messaging, inquiry, feedback and order workflows.
5. Only then prepare a migration proposal on a development branch. Production remains untouched until explicitly approved.

## 4. Current safety boundaries

- No SQL or migration was executed.
- No database rows or schema were changed.
- No Supabase project URL, key, or environment variable was changed.
- No GitHub production branch was changed.
- No Vercel deployment was triggered.
- The existing visual theme remains unchanged.

## Conclusion

The first blocker is not UI code: the app's configured backend points to `pokemon-treasure-demo`, while a separately named `cardora` Supabase project exists. Schema inspection is currently blocked by database authentication. Resolve the intended backend and restore read-only introspection before implementing chat, seller storefront, or order-management persistence.
