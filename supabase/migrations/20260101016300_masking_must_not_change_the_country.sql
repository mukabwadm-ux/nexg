-- Masking must not change the country.
--
-- `fn_mask_phone` was `left(p_phone, 5) || … || right(p_phone, 2)`,
-- which gets two things wrong.
--
-- It leaks a digit. For a Kenyan number the first five characters
-- are "+2547" — the country code plus the first subscriber digit.
-- Masking that shows part of what it is masking is not masking.
--
-- And five characters is only the country code for a three-digit
-- one. On a UK number it returns "+4477", which reads as country
-- code +4477; on a US number "+1415" reads as +1415. A visitor on
-- a UK number displayed as though they were somewhere else is a
-- fact staff act on — they dial it, or they decide not to.
--
-- Country codes are one to three digits, and which it is follows
-- a rule rather than a guess: +1 and +7 are one digit, a known
-- set of assignments are two, everything else is three. That is
-- implemented below rather than approximated, because the
-- approximation is what this is replacing.
--
-- The masked body is a fixed width. It does not grow with the
-- number, so it does not disclose how long the number is either.

create or replace function fn_phone_country_code(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  with d as (
    select regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g') as digits
  )
  select case
    when length(d.digits) < 4 then null
    /* +1 North America and +7 Russia/Kazakhstan are the single-digit codes. */
    when left(d.digits, 1) in ('1', '7') then left(d.digits, 1)
    /* The two-digit assignments. Everything not in this list and
       not above is three digits — that is the ITU rule, not a
       heuristic, so an unlisted country is still handled right. */
    when left(d.digits, 2) in (
      '20','27','30','31','32','33','34','36','39','40','41','43','44','45','46',
      '47','48','49','51','52','53','54','55','56','57','58','60','61','62','63',
      '64','65','66','81','82','84','86','90','91','92','93','94','95','98')
      then left(d.digits, 2)
    else left(d.digits, 3)
  end
  from d;
$$;

comment on function fn_phone_country_code is
  'The dialling code of an E.164 number, one to three digits by the ITU rule rather than a fixed offset.';

create or replace function fn_mask_phone(p_phone text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_phone is null or length(regexp_replace(p_phone, '[^0-9]', '', 'g')) < 6
      then '[no number]'
    when public.fn_phone_country_code(p_phone) is null
      then '[no number]'
    else '+' || public.fn_phone_country_code(p_phone) || ' ••• ••• •'
         || right(regexp_replace(p_phone, '[^0-9]', '', 'g'), 2)
  end;
$$;

comment on function fn_mask_phone is
  'Country code, a fixed-width mask, and the last two digits. Fixed width on purpose: a mask that grows with the number discloses its length.';

grant execute on function fn_phone_country_code(text) to authenticated, anon, service_role;
grant execute on function fn_mask_phone(text) to authenticated, anon, service_role;

/*
 * A masked number that still contains six consecutive digits is
 * not masked, and this is the kind of thing that is correct on
 * the day it is written and wrong after somebody adjusts the
 * format. Checked here, against the shapes that actually occur.
 */
do $check$
declare
  r record;
begin
  for r in
    select * from (values
      ('+254700000901', '+254 ••• ••• •01'),
      ('+447700900025', '+44 ••• ••• •25'),
      ('+14155550123',  '+1 ••• ••• •23'),
      ('+254 700 000 901', '+254 ••• ••• •01'),
      (null,            '[no number]'),
      ('123',           '[no number]')
    ) as t(input, want)
  loop
    if public.fn_mask_phone(r.input) is distinct from r.want then
      raise exception 'fn_mask_phone(%) gave %, wanted %',
        coalesce(r.input, 'null'), public.fn_mask_phone(r.input), r.want;
    end if;
  end loop;
end
$check$;
