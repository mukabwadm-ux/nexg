/*
 * Supabase refuses direct deletes from storage tables. The RPC now only
 * records the new path and hands back the replaced one, so the app can remove
 * that file through the Storage API.
 */
create or replace function public.rpc_my_staff_avatar_set(p_path text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_me uuid := authz.staff_id();
  v_old text;
begin
  if v_me is null then
    raise exception 'Sign in as staff first.' using errcode = 'insufficient_privilege';
  end if;
  if p_path is not null and split_part(p_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'That file is not in your folder.' using errcode = 'insufficient_privilege';
  end if;

  select avatar_path into v_old from public.staff_user where id = v_me;
  update public.staff_user set avatar_path = p_path where id = v_me;

  return case when v_old is distinct from p_path then v_old else null end;
end;
$$;
