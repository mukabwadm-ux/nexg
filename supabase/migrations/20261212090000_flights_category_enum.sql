-- Give flight operators a platform category. The config uses the new enum
-- value in the next migration, after Postgres commits this one.
alter type public.merchant_category add value if not exists 'flights';
