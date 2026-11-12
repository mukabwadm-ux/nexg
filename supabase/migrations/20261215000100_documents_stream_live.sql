-- Document changes stream over Realtime, so the screens that list them update
-- the moment something changes: a merchant's or rider's Documents list when a
-- reviewer verifies or rejects a file, and the admin merchant page when a
-- merchant uploads one.
--
-- Row security still decides who sees what: Realtime checks the same
-- policies per subscriber as a query would (document_read_own and
-- document_read_staff), so adding the
-- table here does not widen who can read a document.
--
-- Safe to run more than once, and nothing breaks before it runs: the pages
-- also refresh on a quiet poll.

do $$
begin
  if not exists (
    select 1
      from pg_publication_tables
     where pubname = 'supabase_realtime'
       and schemaname = 'public'
       and tablename = 'document'
  ) then
    alter publication supabase_realtime add table public.document;
  end if;
end
$$;
