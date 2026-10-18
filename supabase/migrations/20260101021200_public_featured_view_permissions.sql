-- Guests can read the filtered featured view, not its private source tables.
alter view public.featured_live_v set (security_invoker = false);
