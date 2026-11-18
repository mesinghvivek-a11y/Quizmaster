# My PYQ Online — launch & compliance checklist
*Prepared 18 Nov 2026 for mypyq.online. This is a practical checklist, not legal advice — have a lawyer review the Privacy Policy and Terms (especially children's data) before public launch.*

## 0. What is in the zip
```
mypyq-online-site/
  index.html              Home page (Google needs a public homepage that links the Privacy Policy)
  privacy/index.html      → https://www.mypyq.online/privacy
  terms/index.html        → https://www.mypyq.online/terms
  data-deletion/index.html→ https://www.mypyq.online/data-deletion
  app/index.html          The renamed app (opens at /app/)
  assets/icon-120.png     Google consent-screen logo (120×120).  icon-512.png for home-screen icon
  favicon.svg  404.html  robots.txt  sitemap.xml  .well-known/security.txt
  _headers                Security headers + CSP (works on Cloudflare Pages and Netlify)
```

## 1. Do these first (15 minutes)
| # | Action |
|---|---|
| 1 | Search the zip for the **yellow highlighted** text (`class="fill"`) in `privacy/index.html` and `terms/index.html` and replace the two placeholders: **operator name** (your name or registered business) and **Grievance Officer name**. |
| 2 | Create the mailbox **support@mypyq.online** (the pages use this one address for support, privacy, copyright and security). Use Zoho Mail / Google Workspace / Cloudflare Email Routing. |
| 3 | Deploy the folder (below), then verify in an **incognito** window that `/`, `/privacy`, `/terms`, `/data-deletion` open with no login. |

## 2. Deploy (free)
**Cloudflare Pages** or **Netlify**: create project → upload the `mypyq-online-site` folder → add custom domain `www.mypyq.online` → add a redirect from `mypyq.online` to `https://www.mypyq.online` → HTTPS is automatic. Folder URLs (`/privacy`) work with no `.html`.
Verify the task requirement:
```
curl -I https://www.mypyq.online/privacy     # expect HTTP 200, no redirect to a login page
curl -I https://www.mypyq.online/terms       # expect HTTP 200
```
Then check headers at securityheaders.com and TLS at ssllabs.com.

## 3. Google Sign-In / OAuth verification (Google Cloud Console → Google Auth Platform)
| Field | Value |
|---|---|
| App name | My PYQ Online (must match the name on your homepage) |
| User support email / developer contact | support@mypyq.online |
| App logo | `assets/icon-120.png` |
| Application home page | https://www.mypyq.online |
| Privacy policy link | https://www.mypyq.online/privacy |
| Terms of service link | https://www.mypyq.online/terms |
| Authorized domain | mypyq.online — **verify ownership in Google Search Console** (DNS TXT record), using the same Google account that owns the Cloud project |
| Scopes | `openid`, `email`, `profile` only (non-sensitive → brand verification, no security assessment) |
| Authorized JavaScript origin | https://www.mypyq.online |
| Redirect URI | whatever your auth backend gives you (e.g. `https://<project>.supabase.co/auth/v1/callback`) |
| Publishing status | Move **Testing → In production**, otherwise only 100 test users and tokens expire after 7 days |
Tips: the homepage must be public, show the same app name, describe what the app does and link to the privacy policy (done). Don't request any extra scopes — it would trigger sensitive-scope review.
**Important:** the pages describe Google Sign-In collecting name, email, picture and Google ID, and storing study data against the account. The current app does not have sign-in yet — keep the policy truthful to what you actually launch (e.g. if you add a database, name it if asked and keep the retention/deletion promises). Under the sign-in button show: *"By continuing you agree to the Terms and Privacy Policy"* with links.

## 4. India — legal formalities
| Area | What to do |
|---|---|
| **DPDP Act 2023 & Rules** | Consent notice at sign-in linking the Privacy Policy ✔ (policy written for this); honour access/correction/erasure/withdrawal requests; keep a log of consents and deletions; have a breach-response plan (notify users and the Data Protection Board). |
| **Children (under 18)** | DPDP treats under-18s as children and needs *verifiable parental consent* and bars behavioural tracking/ads. Exam students are often 16–18. Either limit accounts to 18+, or build a parental-consent step. Get legal advice — this is the biggest policy risk. |
| **IT Act / Intermediary Rules 2021** | Live rooms and imported subjects are user content → publish a **Grievance Officer** (name + email ✔ on the Privacy page; you fill the name). The policy promises acknowledgement in 24 h and resolution in 15 days — only keep this if you can. |
| **Consumer Protection (E-Commerce) Rules 2020** | Only if you start charging: add pricing, a refund/cancellation policy page, and seller details. Payment gateways (Razorpay etc.) will ask for Privacy, Terms, Refund and Contact pages. |
| **Business / tax** | Operate as a sole proprietor (Udyam registration optional) or company/LLP. GST registration becomes mandatory only above the service-turnover threshold (₹20 lakh; ₹10 lakh in some states) or if you sell across states under certain rules. |
| **Trademark & domain** | Search "My PYQ Online" / "PYQ" on IP India's TM search before investing in branding; enable WHOIS privacy on the domain. |

## 5. Content & copyright — highest-impact risk
The Polity and History question banks (and especially the **explanations**) were extracted from third-party booklets (Polity: "Part 4, 10th Edition, 2026"; History: "Complete Booklet", pp. B9–B760). Exam questions come from public exams, but a publisher's compilation, answer keys and explanations are normally copyrighted. Before a public launch:
- get **written permission or a licence** from the publisher, **or** replace explanations with your own text and drop the booklet source line;
- keep the takedown process (Terms §14 ✔) and respond to complaints quickly;
- the Terms already forbid scraping and say you are not affiliated with UPSC/UGC/NTA.

## 6. Security & privacy engineering
- ✔ `_headers`: HSTS, CSP (app and legal pages), no-sniff, frame-deny, referrer and permissions policies. I tested the app under this CSP.
- ✔ Removed Google Fonts (no visitor IPs sent to Google); the app uses only system fonts. The only third-party traffic is the **live-room relay** (EMQX/HiveMQ/Mosquitto) — disclosed in the Privacy Policy §6. For a classroom product, host your own relay later.
- Turn on 2-step verification for your registrar, hosting, GitHub and Google accounts.
- Email: set **SPF, DKIM, DMARC** for mypyq.online so support mail is delivered and cannot be spoofed.
- When you add sign-in: verify Google ID tokens on the server, use HttpOnly + Secure + SameSite cookies, store only the minimum.
- Back up your database; test restores; honour the 30-day deletion promise with a written procedure.

## 7. Analytics, SEO and quality
- No analytics today, so no cookie banner is needed (only essential storage). If you add analytics, use a cookieless tool (Plausible/Umami) or add consent first, and update the Privacy Policy.
- Submit `sitemap.xml` in Search Console; `robots.txt` is included.
- Accessibility: aim for WCAG 2.1 AA (contrast, keyboard use, labels); legal pages already support dark mode and mobile.
- Update the "Last updated" date on Privacy/Terms whenever they change, and notify users of material changes.

## 8. Assumptions I made (change if wrong)
- Operator in **India**; governing law India, **New Delhi courts** (Terms §15).
- Single contact address `support@mypyq.online`; deletion within **30 days**; logs kept **90 days**.
- Sign-in uses scopes `openid email profile`; study data synced to your servers once signed in; no ads, no sale of data, no analytics.
- Liability cap ₹1,000 / amount paid in 12 months (Terms §12).
