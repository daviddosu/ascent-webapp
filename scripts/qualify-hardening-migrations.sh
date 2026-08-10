#!/bin/sh
set -eu

repo_root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
postgres_bin=${SHOTCOUNT_POSTGRES_BIN:-/opt/homebrew/opt/postgresql@17/bin}
port=${SHOTCOUNT_POSTGRES_PORT:-55433}
cluster=$(mktemp -d /tmp/shotcount-hardening-pg.XXXXXX)
database=shotcount_hardening

cleanup() {
  "$postgres_bin/pg_ctl" -D "$cluster/data" stop -m fast >/dev/null 2>&1 || true
  rm -rf "$cluster"
}
trap cleanup EXIT INT TERM

for executable in initdb pg_ctl createdb psql pgbench; do
  if [ ! -x "$postgres_bin/$executable" ]; then
    echo "Missing $postgres_bin/$executable. Set SHOTCOUNT_POSTGRES_BIN to a PostgreSQL 17 bin directory." >&2
    exit 2
  fi
done

"$postgres_bin/initdb" -D "$cluster/data" -A trust --no-locale --encoding=UTF8 >/dev/null
"$postgres_bin/pg_ctl" -D "$cluster/data" -l "$cluster/postgres.log" -o "-p $port -h 127.0.0.1" start >/dev/null
"$postgres_bin/createdb" -h 127.0.0.1 -p "$port" "$database"

psql_cmd="$postgres_bin/psql -X -v ON_ERROR_STOP=1 -h 127.0.0.1 -p $port -d $database"
$psql_cmd -f "$repo_root/supabase/tests/hardening_migrations_base.sql" >/dev/null
$psql_cmd -1 -f "$repo_root/supabase/migrations/202608100001_atomic_writer_assignment_load.sql" >/dev/null
$psql_cmd -1 -f "$repo_root/supabase/migrations/202608100002_secure_ai_usage_quota.sql" >/dev/null
$psql_cmd -f "$repo_root/supabase/tests/hardening_migrations_assertions.sql" >/dev/null

# Both forward migrations are intentionally safe to reapply during local
# qualification. This catches trigger duplication and counter repair drift.
$psql_cmd -1 -f "$repo_root/supabase/migrations/202608100001_atomic_writer_assignment_load.sql" >/dev/null
$psql_cmd -1 -f "$repo_root/supabase/migrations/202608100002_secure_ai_usage_quota.sql" >/dev/null
$psql_cmd -f "$repo_root/supabase/tests/hardening_migrations_assertions.sql" >/dev/null

$psql_cmd -c "delete from public.ai_usage where user_id = '10000000-0000-0000-0000-000000000001'; insert into public.ai_usage (user_id) select '10000000-0000-0000-0000-000000000001' from generate_series(1, 9);" >/dev/null
"$postgres_bin/pgbench" -n -h 127.0.0.1 -p "$port" -d "$database" -c 20 -j 8 -t 1 -f "$repo_root/supabase/tests/ai_quota.pgbench" >/dev/null
ai_count=$($psql_cmd -Atc "select count(*) from public.ai_usage where user_id = '10000000-0000-0000-0000-000000000001' and requested_at >= now() - interval '24 hours'")
[ "$ai_count" = 10 ] || { echo "AI quota race created $ai_count rows; expected 10." >&2; exit 1; }

$psql_cmd -c "delete from public.human_assignments where user_id = '10000000-0000-0000-0000-000000000001';" >/dev/null
"$postgres_bin/pgbench" -n -h 127.0.0.1 -p "$port" -d "$database" -c 20 -j 8 -t 1 -f "$repo_root/supabase/tests/writer_idempotency.pgbench" >/dev/null
assignment_count=$($psql_cmd -Atc "select count(*) from public.human_assignments where idempotency_key = 'parallel-idempotent'")
writer_count=$($psql_cmd -Atc "select active_assignments from public.application_writers where id = '30000000-0000-0000-0000-000000000001'")
[ "$assignment_count" = 1 ] || { echo "Writer idempotency race created $assignment_count assignments; expected 1." >&2; exit 1; }
[ "$writer_count" = 1 ] || { echo "Writer idempotency race produced load $writer_count; expected 1." >&2; exit 1; }

"$postgres_bin/pgbench" -n -h 127.0.0.1 -p "$port" -d "$database" -c 20 -j 8 -t 1 -f "$repo_root/supabase/tests/writer_load.pgbench" >/dev/null
writer_count=$($psql_cmd -Atc "select active_assignments from public.application_writers where id = '30000000-0000-0000-0000-000000000001'")
[ "$writer_count" = 21 ] || { echo "Concurrent writer inserts produced load $writer_count; expected 21." >&2; exit 1; }

"$postgres_bin/pgbench" -n -h 127.0.0.1 -p "$port" -d "$database" -c 20 -j 8 -t 1 -f "$repo_root/supabase/tests/writer_release.pgbench" >/dev/null
writer_count=$($psql_cmd -Atc "select active_assignments from public.application_writers where id = '30000000-0000-0000-0000-000000000001'")
[ "$writer_count" = 1 ] || { echo "Concurrent writer releases produced load $writer_count; expected 1." >&2; exit 1; }

echo "Hardening migrations qualified locally: existing data, rollback, RLS, privileges, idempotency, and concurrency all passed."
