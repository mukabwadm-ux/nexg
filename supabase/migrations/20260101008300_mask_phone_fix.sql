-- Masking must not change the country.
--
-- fn_mask_phone hard-coded a Kenyan prefix, so a guest on
-- +44 7700 900025 appeared in the console as +254 7•• ••• •25. Staff
-- read the country code to decide whether somebody is a visitor, and
-- a data request from a UK number showed as a local one — which is
-- the wrong fact in the one place it matters most.
--
-- The rule now: keep the country code and the last two digits, mask
-- everything between. Bullet glyphs rather than CSS, so a screen
-- reader does not read the hidden digits aloud.

create or replace function public.fn_mask_phone(p_phone text)
returns text
language plpgsql
immutable
set search_path = ''
as $$
declare
  v_digits text;
  v_cc text;
  v_rest text;
begin
  if p_phone is null then
    return null;
  end if;

  v_digits := regexp_replace(p_phone, '[^0-9+]', '', 'g');
  if length(regexp_replace(v_digits, '\D', '', 'g')) < 4 then
    return null;
  end if;

  /* The country code, as dialled. Kenya, Uganda, Tanzania, Rwanda and
     the handful of one- and two-digit codes visitors actually arrive
     with; anything else keeps its leading + and first two digits,
     which is enough to tell a local number from a foreign one. */
  v_cc := case
    when v_digits like '+254%' then '+254'
    when v_digits like '+256%' then '+256'
    when v_digits like '+255%' then '+255'
    when v_digits like '+250%' then '+250'
    when v_digits like '+1%'   then '+1'
    when v_digits like '+44%'  then '+44'
    when v_digits like '+27%'  then '+27'
    when v_digits like '+49%'  then '+49'
    when v_digits like '+33%'  then '+33'
    when v_digits like '+91%'  then '+91'
    when v_digits like '+86%'  then '+86'
    when v_digits like '+971%' then '+971'
    when v_digits like '+%'    then left(v_digits, 3)
    else ''
  end;

  v_rest := right(v_digits, 2);

  return nullif(trim(v_cc || ' ••• ••• •' || v_rest), '');
end;
$$;

grant execute on function public.fn_mask_phone(text) to authenticated, service_role;

comment on function public.fn_mask_phone(text) is
  'Keeps the country code and the last two digits. Staff read the country code to tell a visitor from a resident, so masking it away — or worse, replacing it with a Kenyan one — removes a fact they need.';
