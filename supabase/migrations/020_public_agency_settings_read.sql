-- The login page needs the agency name before a user has authenticated.
-- This exposes only the existing single agency-settings row; write access
-- remains limited to authenticated users by the separate write policy.
drop policy if exists "agency_settings_read" on public.agency_settings;

create policy "agency_settings_read"
  on public.agency_settings
  for select
  to anon, authenticated
  using (true);
