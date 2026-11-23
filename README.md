# Quiz Master — deploy in ~15 minutes
Static site (no build step). Browsing is available to guests. Starting a solo or live test requires Google sign-in through Supabase.

1. **GitHub**: create a repo, upload everything in this folder, commit.
2. **Supabase**: New project → SQL Editor → run `supabase/schema.sql`.
   - Authentication → Providers → **Google**: paste a Google Cloud OAuth client ID/secret (redirect URI = the callback URL Supabase shows).
   - Authentication → URL Configuration: Site URL = your Vercel URL; add `https://YOUR-SITE.vercel.app/**` and `http://localhost:3000/**` to Redirect URLs.
   - Project Settings → API: copy **Project URL** and **anon key** into `config.js` (the anon key is public; row-level security protects data).
   - Make yourself mentor/admin: `update public.profiles set is_admin=true where id=(select id from auth.users where email='you@example.com');`
3. **Vercel**: Add New → Project → import the GitHub repo → Framework "Other", no build command, output directory = root → Deploy.
4. On the iPad/phone: open the site → Share → **Add to Home Screen**. Bump `V` in `sw.js` when you ship big changes.

Pages: `index.html` landing + performance · `test.html` test portal (`?s=<subject>`, `&custom=1`, `?join=CODE`, `?add=1`) · `data/*.json` question banks (add a subject = drop JSON in `data/` and add it to `data/manifest.json`, or import via Excel in the app).

### Updating live test rooms on an existing site

1. In your existing Supabase project's SQL Editor, run `supabase/live-rooms.sql`. The script can be run again. To check the installation, run `tests/live-room-checks.sql`. Its test records are rolled back.
2. Deploy the project files together at the root of the existing site. This includes `test.html`, `shared.js`, `live-room.js` and `sw.js`.
3. Reload the site on both devices and create a new room. Finish tests created with the previous site version before switching versions.

When someone refreshes the page or reopens a test, the room restores their name, recorded answers and current question. The same signed-in account keeps one seat across devices. Opening a second tab transfers the connection to that tab. The host can resume using the same account from Home or by entering the room code. Host state is saved locally and checkpointed in Supabase.

The host can select **Kick** or **Block** beside a player in the lobby or on the live scoreboard. A kicked player can enter the code to return. A blocked player sees the same unavailable-room message as someone entering an unknown code. Account blocks follow the account to other devices. Each block applies to one room.

Rooms expire after 36 hours. Creating another room clears expired records.
