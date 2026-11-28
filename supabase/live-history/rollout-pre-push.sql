-- Run on live after the repairs and before the dry run (Supabase SQL editor), on the owner's yes.
--
-- Why: 20261226000200_master_categories ends with a guard that stops if any
-- category outside NexG's 21 master categories is still active. Live has one
-- that main never had: activities_games_sports, from live's 20261111000100
-- (in no file on main). Left active, the push stops at master_categories with
-- "A category outside the master list is still active." The CI rehearsal found it.
--
-- This only switches that category off in category_config. It moves no
-- merchant and deletes nothing. Merchants saved with it keep it until Derrick
-- and the owner decide where they go (docs/database/live-rollout-2026-11-23.md,
-- section 7); query J counts them first.
--
-- Undo: update public.category_config set is_active = true
--         where category = 'activities_games_sports';
update public.category_config
   set is_active = false, updated_at = now()
 where category::text = 'activities_games_sports' and is_active
returning category, is_active;
