# Production migration status

As of 2026-09-22, the linked production project has applied migrations through
`202609220002`. The graduate-application product-boundary migrations and the
duplicate-run reconciliation migrations were
applied after a schema/data backup and read-only dependency verification.

## `202608220001_graduate_application_private_workspace.sql`

This is the privacy-boundary migration. It makes legacy profile, planner, and
task visibility private, removes public read grants, and disables the retired
social feed trigger. The current application runtime already scopes application
data to the owner; the migration makes that boundary explicit in production.

## `202608220002_retire_legacy_product_surfaces.sql`

This migration retires legacy social/productivity tables and columns, removes
their functions, and changes the planner record contract. Existing `goal`
planner projections remain as unread historical evidence; current clients do
not create or render them. Remote verification confirmed the retired tables
are absent and the legacy projections remain preserved.

The pre-cutover schema and data backup is retained by the operator outside the
repository under the `2026-09-22-pre-legacy-retirement` backup set.
Future schema changes still require a new forward migration, a dependency
inventory, a backup/restore plan, and regenerated database types; do not edit
these applied migrations in place.
