# Production migration status

As of 2026-08-25, the linked production project has applied migrations through
`202608250001`. The local files `202608220001` and `202608220002` are not
applied remotely.

## `202608220001_graduate_application_private_workspace.sql`

This is a privacy-boundary migration. It makes legacy profile, planner, and
task visibility private, removes public read grants, and disables the retired
social feed trigger. It is not required by the current application runtime,
which already scopes application data to the owner. Applying it is a forward
production policy change and should be scheduled separately after a backup and
read-only verification of any legacy clients.

## `202608220002_retire_legacy_product_surfaces.sql`

This migration is destructive: it drops legacy social/productivity tables and
columns, removes functions, and changes the planner record contract. It is not
safe to apply as an incidental qualification step. The current repository
still contains historical migrations and compatibility reads for those
surfaces, so it remains an explicit, unapplied retirement plan rather than an
implicit production dependency.

Do not apply either migration from a qualification run. A future production
cutover should use a reviewed forward migration (with a backup, dependency
inventory, and rollback/restore plan) and then update the generated database
types.
