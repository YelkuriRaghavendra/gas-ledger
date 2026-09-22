-- Only show "last updated" when a row was genuinely edited.
--
-- The insert branch of stamp_audit() stamped updated_at := now(), but the app
-- supplies created_at itself so entries can be backdated (combineDateWithNow
-- keeps the current clock time and swaps the date). A row recorded on 4 Sep and
-- backdated to 3 Sep was therefore born with:
--     created_at = 3 Sep, 04:16 pm   (chosen date)
--     updated_at = 4 Sep, 04:16 pm   (actual insert moment)
-- so the UI showed "last updated" on a record nobody had ever edited. The
-- client hides that row when updated_at == created_at, but its 1-second
-- tolerance cannot catch a whole-day gap.
--
-- Mirroring created_at on insert makes "never edited" mean updated_at ==
-- created_at, whatever date was chosen. The update branch is unchanged.
--
-- TRADEOFF: updated_at is now derived from a client-supplied created_at on
-- insert, so the row no longer records an independent server timestamp for the
-- moment it was actually written. On a backdated entry that insert time was the
-- only server-truth clock value, and it is gone. Acceptable here because every
-- table's RLS is `using (true) with check (true)` for authenticated users, so
-- these columns are a "who did what" convenience for the owner rather than a
-- security boundary. The cleaner fix, if audit trails ever need to be
-- trustworthy, is a nullable edited_at column (NULL on insert, now() on
-- update): "never edited" becomes edited_at IS NULL and updated_at can stay
-- server-stamped. That needs a client change too, so it is not done here.

create or replace function public.stamp_audit()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then new.created_by := auth.uid(); end if;
    new.updated_at := new.created_at;
    -- Prefer the real actor over anything the client sent, so a spoofed
    -- created_by cannot propagate into updated_by. Falls back to the supplied
    -- value only when there is no auth context (service-role data import).
    new.updated_by := coalesce(auth.uid(), new.updated_by, new.created_by);
  else
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;
  return new;
end $$;

-- ------------------------------------------------------------------
-- OPTIONAL BACKFILL — read before running, and take a backup first.
--
-- Rows already written keep their misleading updated_at. A never-edited
-- backdated row and a genuinely edited one both have updated_at > created_at,
-- so they cannot be told apart with certainty. The one usable signal is that
-- combineDateWithNow copies the wall-clock time exactly: a never-edited
-- backdated row has the SAME time-of-day as created_at and differs only in
-- date. A real edit landing on the identical millisecond-of-day is vanishingly
-- unlikely, but it is a heuristic, not a proof — it will also clear the history
-- of any edit that happened to occur at that exact time of day.
--
-- Inspect first:
--   select id, created_at, updated_at from bills
--   where updated_at <> created_at
--     and (updated_at at time zone 'Asia/Kolkata')::time
--       = (created_at at time zone 'Asia/Kolkata')::time;
--
-- Then, to treat those as never edited, uncomment per table:
--
-- update public.bills           set updated_at = created_at, updated_by = created_by
--   where updated_at <> created_at
--     and (updated_at at time zone 'Asia/Kolkata')::time = (created_at at time zone 'Asia/Kolkata')::time;
-- update public.bill_lines      set updated_at = created_at, updated_by = created_by
--   where updated_at <> created_at
--     and (updated_at at time zone 'Asia/Kolkata')::time = (created_at at time zone 'Asia/Kolkata')::time;
-- update public.purchase_orders set updated_at = created_at, updated_by = created_by
--   where updated_at <> created_at
--     and (updated_at at time zone 'Asia/Kolkata')::time = (created_at at time zone 'Asia/Kolkata')::time;
-- update public.purchase_lines  set updated_at = created_at, updated_by = created_by
--   where updated_at <> created_at
--     and (updated_at at time zone 'Asia/Kolkata')::time = (created_at at time zone 'Asia/Kolkata')::time;
--
-- Note these UPDATEs fire stamp_audit()'s update branch, which would overwrite
-- updated_at with now(). Disable the trigger around them:
--   alter table public.bills disable trigger trg_stamp_bills;
--   ... run the update ...
--   alter table public.bills enable  trigger trg_stamp_bills;
-- ------------------------------------------------------------------
