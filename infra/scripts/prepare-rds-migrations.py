#!/usr/bin/env python3
"""
Preprocesses supabase/migrations/*.sql into infra/migrations-rds/*.sql for replay
against the new RDS instance (Supabase -> AWS migration, Phase B).

Strips everything that depends on Supabase's managed auth.* schema, per the migration
plan's decision to drop RLS entirely (it's not the app's real authorization boundary
-- see plan file):
  - ALTER TABLE ... ENABLE ROW LEVEL SECURITY;
  - CREATE POLICY ...; (multi-line)
  - DROP POLICY IF EXISTS ...;
  - get_my_role() function (003_fix_profiles_rls.sql) -- depends on auth.uid(), and
    every policy that called it is already gone via the strip above.
  - handle_user_confirmed() function + on_user_confirmed trigger on auth.users
    (004_invite_pending.sql) -- confirmed dead weight, invite_pending is already set
    explicitly in app code (lib/mobile/core/auth.ts, activate-account.ts, etc.)

Also rewrites 001_initial_schema.sql's profiles.id column: no more auth.users table to
reference, and Cognito can't be forced to reuse a specific sub (confirmed during Phase
A) -- so profiles.id becomes a plain uuid PK, plus a new cognito_sub column Phase F/G
populate as each user migrates.

Run: python3 infra/scripts/prepare-rds-migrations.py
Then hand-review the diff before replaying against RDS -- this is a mechanical first
pass, not a substitute for checking the output.
"""
import re
import pathlib

SRC = pathlib.Path(__file__).resolve().parents[2] / 'supabase' / 'migrations'
DST = pathlib.Path(__file__).resolve().parents[1] / 'migrations-rds'

POLICY_RE = re.compile(r'create policy\s+"[^"]*"\s+on\s+\S+.*?;', re.IGNORECASE | re.DOTALL)
DROP_POLICY_RE = re.compile(r'drop policy\s+if exists\s+"[^"]*"\s+on\s+\S+\s*;', re.IGNORECASE)
ENABLE_RLS_RE = re.compile(r'^\s*alter table\s+\S+\s+enable row level security\s*;\s*$', re.IGNORECASE | re.MULTILINE)

GET_MY_ROLE_RE = re.compile(
    r'create or replace function public\.get_my_role\(\).*?\$\$;',
    re.IGNORECASE | re.DOTALL,
)
HANDLE_USER_CONFIRMED_RE = re.compile(
    r'-- Trigger: flip invite_pending.*?FOR EACH ROW EXECUTE FUNCTION public\.handle_user_confirmed\(\);',
    re.IGNORECASE | re.DOTALL,
)

def strip_rls(sql: str) -> str:
    sql = POLICY_RE.sub('', sql)
    sql = DROP_POLICY_RE.sub('', sql)
    sql = ENABLE_RLS_RE.sub('', sql)
    return sql

def collapse_blank_lines(sql: str) -> str:
    return re.sub(r'\n{3,}', '\n\n', sql)

def process_001(sql: str) -> str:
    sql = sql.replace(
        'id uuid references auth.users(id) on delete cascade primary key,',
        'id uuid primary key,\n  cognito_sub uuid unique,',
    )
    return sql

def process_004(sql: str) -> str:
    return HANDLE_USER_CONFIRMED_RE.sub('', sql)

def process_003(sql: str) -> str:
    return GET_MY_ROLE_RE.sub('', sql)

SPECIAL = {
    '001_initial_schema.sql': process_001,
    '003_fix_profiles_rls.sql': process_003,
    '004_invite_pending.sql': process_004,
}

def main():
    DST.mkdir(parents=True, exist_ok=True)
    files = sorted(SRC.glob('*.sql'))
    print(f'Processing {len(files)} migration files -> {DST}')
    for f in files:
        sql = f.read_text()
        if f.name in SPECIAL:
            sql = SPECIAL[f.name](sql)
        sql = strip_rls(sql)
        sql = collapse_blank_lines(sql).strip() + '\n'
        (DST / f.name).write_text(sql)
    print('Done. Review the diff before replaying against RDS:')
    print(f'  diff -ru {SRC} {DST}')

if __name__ == '__main__':
    main()
