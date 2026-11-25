-- Cinema tickets say what kind of code their barcode is (cinema-app-contract v4).
--
-- The app draws each ticket's barcode value as a picture for the cinema's
-- door scanner. The value came without its kind, so a cinema whose scanners
-- read Code 128, PDF417 or Aztec would get a QR picture it cannot scan. Each
-- ticket now carries barcodeFormat beside barcode:
--   'qr' | 'code128' | 'pdf417' | 'aztec', or 'other' for a kind NexG cannot
--   draw (the app then shows the ticket reference instead of a picture).
-- No barcodeFormat means QR, as the app does today.
--
-- The format is what the cinema's own system answers, mapped by its adapter
-- (apps/web/lib/cinema/connector.ts, normaliseTickets) and recorded with the
-- booking as it arrives; the hold reads return it as recorded. This migration:
--   1. makes the sandbox cinema's box office say what it prints: QR;
--   2. adds 'qr' to the tickets the sandbox has already issued, on its own
--      side and on NexG's (cinema.hold.tickets of sandbox connections).
--
-- Rollback:
--   drop trigger if exists booking_barcode_format on cinema_sandbox.booking;
--   drop function if exists cinema_sandbox.tg_booking_barcode_format();
--   drop function if exists cinema_sandbox.with_qr_format(jsonb);
--   (the added keys are harmless to leave in place)

/* Tickets with a barcode and no format get 'qr'; anything else is left as it is. */
create or replace function cinema_sandbox.with_qr_format(p_tickets jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case when jsonb_typeof(p_tickets) <> 'array' then p_tickets else (
    select coalesce(jsonb_agg(
             case when jsonb_typeof(t) = 'object' and t ? 'barcode' and not t ? 'barcodeFormat'
                  then t || '{"barcodeFormat": "qr"}'::jsonb else t end order by o), '[]'::jsonb)
      from jsonb_array_elements(p_tickets) with ordinality as e(t, o)) end
$$;

create or replace function cinema_sandbox.tg_booking_barcode_format()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tickets := cinema_sandbox.with_qr_format(new.tickets);
  return new;
end;
$$;

drop trigger if exists booking_barcode_format on cinema_sandbox.booking;
create trigger booking_barcode_format
before insert or update of tickets on cinema_sandbox.booking
for each row execute function cinema_sandbox.tg_booking_barcode_format();

revoke all on function cinema_sandbox.with_qr_format(jsonb) from public, anon, authenticated;
revoke all on function cinema_sandbox.tg_booking_barcode_format() from public, anon, authenticated;

-- The sandbox's tickets already issued, on its side and on NexG's.
update cinema_sandbox.booking b set tickets = cinema_sandbox.with_qr_format(b.tickets)
 where b.tickets is distinct from cinema_sandbox.with_qr_format(b.tickets);

update cinema.hold h set tickets = cinema_sandbox.with_qr_format(h.tickets)
  from public.connector_connection c
 where c.id = h.connection_id and c.adapter_id = 'sandbox-cinema'
   and h.tickets is distinct from cinema_sandbox.with_qr_format(h.tickets);
