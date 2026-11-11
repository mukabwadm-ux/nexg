-- Browse by category on Explore: the order the business asked for.
--
-- These eleven come first, in this order. Every other category follows in
-- the order it already had, then the retired (inactive) ones. The order is
-- only a `sort` number, so it can still be changed later from Admin ->
-- Categories. A key missing from this database is skipped, not created.

with wanted(category, position) as (
  values
    ('restaurants_food', 1),
    ('alcohol_beverages', 2),
    ('pharmacy', 3),
    ('laundry_cleaning', 4),
    ('wellness', 5),
    ('travel_tours', 6),
    ('airport_transfers', 7),
    ('beauty', 8),
    ('flowers_gifts', 9),
    ('experiences', 10),
    ('tech_electronics', 11)
),
ranked as (
  select c.category,
         row_number() over (
           order by
             (w.position is null),
             w.position,
             (not c.is_active),
             c.sort,
             c.label
         ) as new_sort
    from public.category_config c
    left join wanted w on w.category = c.category
)
update public.category_config c
   set sort = r.new_sort
  from ranked r
 where r.category = c.category
   and c.sort is distinct from r.new_sort;
