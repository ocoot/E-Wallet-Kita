-- Migration: User profile picture (avatar) support
-- Date: 2026-08-08
-- Description:
--   1. Add `avatar_url` column to public.users so the profile picture URL
--      can be stored and read alongside display_name/theme/etc.
--   2. Create a public "avatars" Storage bucket + RLS policies on
--      storage.objects so each user can only upload/replace/delete files
--      inside their own folder (`<user_id>/...`), while anyone can read
--      (avatars are rendered as public <img> URLs across the app).
--
-- Note: this does not touch the existing "Users can update their own
-- profile" UPDATE policy on public.users -- that policy already allows a
-- user to write their own row (including this new column) since
-- auth.uid() = id.

-- 1. Add avatar_url column
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS avatar_url TEXT;

-- 2. Create the storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'avatars',
  'avatars',
  TRUE,
  3145728, -- 3 MB
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
  SET public = TRUE,
      file_size_limit = 3145728,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp'];

-- 3. RLS policies on storage.objects scoped to the 'avatars' bucket.
-- Files must live under `<auth.uid()>/...` so ownership can be checked
-- purely from the storage path (first path segment == user id).

DROP POLICY IF EXISTS "Avatars are publicly readable" ON storage.objects;
CREATE POLICY "Avatars are publicly readable"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Users can upload their own avatar" ON storage.objects;
CREATE POLICY "Users can upload their own avatar"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can update their own avatar" ON storage.objects;
CREATE POLICY "Users can update their own avatar"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  )
  WITH CHECK (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

DROP POLICY IF EXISTS "Users can delete their own avatar" ON storage.objects;
CREATE POLICY "Users can delete their own avatar"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'avatars'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
