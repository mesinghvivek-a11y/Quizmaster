-- One-time cleanup: imported subjects were being synced into every user's data, making each page load heavy.
-- Subjects now live in the library (Admin → Publish), so these rows are no longer needed.
delete from public.user_data where k like 'subj:%';
