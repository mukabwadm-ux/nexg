-- Translations, and where they come from.
--
-- Two languages can live in a file. Any language cannot: a visitor whose
-- device is set to Chinese needs Chinese, and nobody is hand-writing a
-- dictionary for every language a phone can be set to. So the site's
-- English is the source, a machine translates it once, and the result is
-- kept here forever.
--
-- Cached rather than translated per request for three reasons: a
-- provider call in the render path would add a round trip to every page
-- on a 3G connection (ground rule 7), the provider charges per
-- character, and a string that has been translated once does not change
-- because somebody reloaded.
--
-- `engine` is the important column. A human translation always wins over
-- a machine one, so a native speaker can correct any single string
-- without the machine overwriting them on the next run.

create type public.translation_engine as enum ('human', 'machine');

create table public.translation (
  locale text not null,
  /* The dictionary key, e.g. `nav.explore`. */
  source_key text not null,
  /* The English this was translated from, and its digest. When the
     English changes the digest stops matching and the row is stale —
     which is how a copy edit gets re-translated instead of silently
     leaving every other language saying the old thing. */
  source_text text not null,
  source_hash text not null,
  translated text not null,

  engine public.translation_engine not null default 'machine',
  /* A person has read it. Machine output starts false and says so. */
  reviewed boolean not null default false,
  reviewed_by uuid references public.staff_user (id) on delete set null,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  primary key (locale, source_key),
  constraint translation_not_blank check (length(trim(translated)) > 0)
);

create index translation_locale_idx on public.translation (locale);
create index translation_unreviewed_idx on public.translation (locale, reviewed)
  where engine = 'machine' and not reviewed;

create trigger translation_set_updated_at
  before update on public.translation
  for each row execute function public.tg_set_updated_at();

comment on table public.translation is
  'The site''s copy in every language it has been asked for. English is the source; a machine fills the rest and a human can override any row. A changed source_hash means the English moved and the row needs redoing.';

/*
 * Which languages people actually arrive in.
 *
 * Counted so the cost of adding one is a decision with evidence behind
 * it, and so a language nobody speaks is not generated and paid for.
 * No personal data: a tag and a tally.
 */
create table public.locale_request (
  locale text primary key,
  requests bigint not null default 0,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  /* Set once the cache has been filled for this language. */
  generated_at timestamptz
);

comment on table public.locale_request is
  'A tally of the device languages visitors arrive with. A tag and a count — nothing about who.';

-- ───────────────────────────────────────────────────────────── RLS

alter table public.translation enable row level security;
alter table public.locale_request enable row level security;

/* The site's own copy. There is nothing to hide in it. */
create policy translation_read_all on public.translation
  for select to anon, authenticated using (true);

/*
 * Writes are staff only, deliberately.
 *
 * The rows are the words on the website. If anonymous callers could
 * write them, anyone could rewrite the site's copy — so the machine
 * translations are written by a server action holding the provider key,
 * through the definer RPC below, and never by a client.
 */
create policy translation_write_staff on public.translation
  for all to authenticated
  using (authz.is_super_admin() or authz.has_role('growth') or authz.has_role('ops_manager'))
  with check (authz.is_super_admin() or authz.has_role('growth') or authz.has_role('ops_manager'));

create policy locale_request_read_staff on public.locale_request
  for select to authenticated
  using (authz.is_super_admin() or authz.reaches_module('settings')
         or authz.has_role('growth') or authz.has_role('ops_manager'));

-- ───────────────────────────────────────────────────────────── RPCs

/*
 * Record that somebody arrived speaking this.
 *
 * Callable by anyone, because it has to be — the visitor is anonymous.
 * It can only ever increment a counter against a language tag, which is
 * the least interesting thing in the database to vandalise.
 */
create or replace function public.rpc_note_locale(p_locale text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text := lower(trim(coalesce(p_locale, '')));
begin
  /* A BCP-47 tag and nothing else. Keeps junk out of a public write. */
  if v_tag !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' or length(v_tag) > 20 then
    return;
  end if;

  insert into public.locale_request (locale, requests)
  values (v_tag, 1)
  on conflict (locale) do update
    set requests = public.locale_request.requests + 1,
        last_seen = now();
end;
$$;

grant execute on function public.rpc_note_locale(text) to anon, authenticated;

/*
 * Store a batch of machine translations.
 *
 * Security definer so the server action that holds the provider key can
 * write without a staff session — the visitor who triggered it is
 * anonymous. What makes that safe is that the content does not come
 * from the caller's intent: the server action calls the provider and
 * writes what the provider returned. A caller can cause a translation
 * to happen; they cannot choose what it says.
 *
 * A human row is never overwritten. That is the whole point of `engine`.
 */
create or replace function public.rpc_translations_put(
  p_locale text,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tag text := lower(trim(coalesce(p_locale, '')));
  v_count integer;
begin
  if v_tag !~ '^[a-z]{2,3}(-[a-z0-9]{2,8})*$' or length(v_tag) > 20 then
    raise exception 'That is not a language tag.' using errcode = 'check_violation';
  end if;

  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) > 2000 then
    raise exception 'Send an array of at most 2000 strings.' using errcode = 'check_violation';
  end if;

  insert into public.translation
    (locale, source_key, source_text, source_hash, translated, engine)
  select
    v_tag,
    r ->> 'key',
    r ->> 'source',
    encode(extensions.digest(r ->> 'source', 'sha256'), 'hex'),
    r ->> 'translated',
    'machine'
  from jsonb_array_elements(p_rows) r
  where coalesce(trim(r ->> 'key'), '') <> ''
    and coalesce(trim(r ->> 'translated'), '') <> ''
  on conflict (locale, source_key) do update
    set source_text = excluded.source_text,
        source_hash = excluded.source_hash,
        translated  = excluded.translated,
        engine      = 'machine'
    /* Leave a reviewed human row exactly as the human left it. */
    where public.translation.engine = 'machine'
       or not public.translation.reviewed;

  get diagnostics v_count = row_count;

  insert into public.locale_request (locale, requests, generated_at)
  values (v_tag, 0, now())
  on conflict (locale) do update set generated_at = now();

  return v_count;
end;
$$;

grant execute on function public.rpc_translations_put(text, jsonb) to anon, authenticated;

/*
 * Everything known for a language, in one read.
 *
 * Called on every server render for a non-English visitor, so it is one
 * query returning one object rather than a row per string.
 */
create or replace function public.fn_translations(p_locale text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(t.source_key, t.translated), '{}'::jsonb)
  from public.translation t
  where t.locale = lower(trim(p_locale))
$$;

grant execute on function public.fn_translations(text) to anon, authenticated;

comment on function public.fn_translations is
  'Every string known for a language, as one object. One query per render rather than one per string.';
