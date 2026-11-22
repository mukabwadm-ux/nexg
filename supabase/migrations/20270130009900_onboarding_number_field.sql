-- Onboarding template: a number field, for answers that must be digits only.
--
-- "Turnaround time you commit to" (laundry and cleaning, lc_turnaround) was a
-- free-text field, so merchants typed things like "twenty" or "48 hours".
-- It is now a number of hours. The form accepts digits only and the database
-- refuses anything else, the same check in both places.
--
-- An answer saved before this that is not a plain number now shows as missing
-- in that merchant's onboarding, so they are asked for it again.

alter table public.merchant_onboarding_field drop constraint if exists merchant_onboarding_field_type_check;
alter table public.merchant_onboarding_field add constraint merchant_onboarding_field_type_check
  check (type = any (array['text', 'long_text', 'date', 'yes_no', 'select', 'rows', 'number']));

/* Why an answer is not acceptable for its field, or null when it is. */
create or replace function public.fn_merchant_onboarding_value_error(
  p_field public.merchant_onboarding_field,
  p_value jsonb
)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v text;
  v_row jsonb;
  v_col jsonb;
  v_err text;
  v_n integer := 0;
begin
  if p_field.type in ('text', 'long_text') then
    if jsonb_typeof(p_value) is distinct from 'string' then
      return 'needs text';
    end if;
    v := trim(p_value #>> '{}');
    if length(v) < 2 then
      return 'is too short';
    end if;
    if length(v) > (case when p_field.type = 'text' then 200 else 2000 end) then
      return 'is too long';
    end if;
    if p_field.pattern is not null and v !~* p_field.pattern then
      return 'is not in the expected format';
    end if;
  elsif p_field.type = 'number' then
    -- A whole number, sent as text from the form (a JSON number is accepted too).
    if coalesce(jsonb_typeof(p_value), 'null') not in ('string', 'number') then
      return 'needs a number';
    end if;
    v := trim(p_value #>> '{}');
    if v !~ '^[0-9]{1,4}$' then
      return 'needs a whole number, digits only';
    end if;
    if v::integer < 1 then
      return 'needs a number above 0';
    end if;
  elsif p_field.type = 'date' then
    v_err := public.fn_merchant_onboarding_date_error(p_value, p_field.future_date);
    if v_err is not null then
      return v_err;
    end if;
    if p_field.future_date and (p_value #>> '{}')::date < current_date then
      return 'has passed; renew it before you continue';
    end if;
  elsif p_field.type = 'yes_no' then
    if p_value is distinct from '"yes"'::jsonb and p_value is distinct from '"no"'::jsonb then
      return 'needs Yes or No';
    end if;
  elsif p_field.type = 'select' then
    if jsonb_typeof(p_value) is distinct from 'string' or not exists (
      select 1 from jsonb_array_elements(p_field.options) o
      where o.value ->> 'value' = p_value #>> '{}'
    ) then
      return 'needs one of the listed options';
    end if;
  elsif p_field.type = 'rows' then
    if jsonb_typeof(p_value) is distinct from 'array'
       or jsonb_array_length(p_value) not between 1 and 50 then
      return 'needs at least one row';
    end if;
    for v_row in select value from jsonb_array_elements(p_value) loop
      v_n := v_n + 1;
      if jsonb_typeof(v_row) is distinct from 'object' or exists (
        select 1 from jsonb_object_keys(v_row) k
        where not exists (
          select 1 from jsonb_array_elements(p_field.columns) c where c.value ->> 'key' = k
        )
      ) then
        return 'has an unknown column';
      end if;
      for v_col in select value from jsonb_array_elements(p_field.columns) loop
        if v_col ->> 'type' = 'date' then
          v_err := public.fn_merchant_onboarding_date_error(v_row -> (v_col ->> 'key'), false);
          if v_err is null and coalesce((v_col ->> 'future_date')::boolean, false)
             and (v_row ->> (v_col ->> 'key'))::date < current_date then
            v_err := 'has passed; renew it before you continue';
          end if;
        elsif jsonb_typeof(v_row -> (v_col ->> 'key')) is distinct from 'string'
              or length(trim(v_row ->> (v_col ->> 'key'))) not between 2 and 200 then
          v_err := 'is missing';
        elsif v_col ? 'pattern' and trim(v_row ->> (v_col ->> 'key')) !~* (v_col ->> 'pattern') then
          v_err := 'is not in the expected format';
        end if;
        if v_err is not null then
          return format('row %s: %s %s', v_n, v_col ->> 'label', v_err);
        end if;
      end loop;
    end loop;
  end if;
  return null;
end;
$$;

update public.merchant_onboarding_field
set type = 'number',
    pattern = null,
    label = 'Turnaround time you commit to (hours)',
    hint = 'In hours, numbers only. For example 24 or 48.',
    placeholder = '48'
where key = 'lc_turnaround';
