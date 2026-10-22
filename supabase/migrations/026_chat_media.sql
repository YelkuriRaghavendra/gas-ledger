-- Photos and voice notes in chat.
--
-- The webhook downloads each incoming image / voice note / sticker from Meta
-- (Meta only offers the file for a short time), stores it in a private bucket,
-- and records where. Files are deleted with their message after 7 days.

alter table public.chat_messages
  add column if not exists media_path text,
  add column if not exists media_mime text;

-- Private: files are reached only through short-lived signed URLs. 8 MB cap.
insert into storage.buckets (id, name, public, file_size_limit)
values ('chat-media', 'chat-media', false, 8388608)
on conflict (id) do nothing;

-- Signed-in staff can read; nobody can write from the app. The webhook writes
-- with the service role, which bypasses these policies.
drop policy if exists "chat_media_read" on storage.objects;
create policy "chat_media_read" on storage.objects
  for select to authenticated using (bucket_id = 'chat-media');

-- A message with a file must be removed through the Storage API (deleting the
-- row alone would orphan the file), so the webhook prunes those. The daily
-- job now handles only messages without a file.
do $$
begin
  perform cron.schedule(
    'chat-messages-prune',
    '17 3 * * *',
    $job$delete from public.chat_messages where created_at < now() - interval '7 days' and media_path is null$job$
  );
exception when others then
  raise notice 'chat_messages prune job not rescheduled: %', sqlerrm;
end $$;
