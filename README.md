# My PYQ Online — deploy in ~15 minutes
Static site (no build step). Works without Supabase as a guest/offline app; add Supabase for Google login, sync, shared banks, reports and live rooms.

1. **GitHub**: create a repo, upload everything in this folder, commit.
2. **Supabase**: New project → SQL Editor → run `supabase/schema.sql`.
   - Authentication → Providers → **Google**: paste a Google Cloud OAuth client ID/secret (redirect URI = the callback URL Supabase shows).
   - Authentication → URL Configuration: Site URL = your Vercel URL; add `https://YOUR-SITE.vercel.app/**` and `http://localhost:3000/**` to Redirect URLs.
   - Project Settings → API: copy **Project URL** and **anon key** into `config.js` (the anon key is public; row-level security protects data).
   - Make yourself mentor/admin: `update public.profiles set is_admin=true where id=(select id from auth.users where email='you@example.com');`
3. **Vercel**: Add New → Project → import the GitHub repo → Framework "Other", no build command, output directory = root → Deploy.
4. On the iPad/phone: open the site → Share → **Add to Home Screen**. Bump `V` in `sw.js` when you ship big changes.

Pages: `index.html` landing + performance · `test.html` test portal (`?s=<subject>`, `&custom=1`, `?join=CODE`, `?add=1`) · `data/*.json` question banks (add a subject = drop JSON in `data/` and add it to `data/manifest.json`, or import via Excel in the app).
