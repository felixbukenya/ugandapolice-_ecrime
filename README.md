# SafeReport UG: Uganda Police e-Crime Reporting System

Built from the "SafeReport UG" prototype video and extended into a working full-stack system.

## Quick start (read this first)
The pages only work **through the server**. Opening `index.html` or `phone.html` directly from the file manager shows empty pages (no categories, no inbox).
1. In the project folder run `npm install`, then start it:
   - **With XAMPP/MySQL:** start MySQL in XAMPP, then `node server.js`.
   - **No database setup (Node 22+):** `DB_DRIVER=sqlite node server.js` (on Windows PowerShell: `$env:DB_DRIVER="sqlite"; node server.js`).
2. Open **http://localhost:3000** in the browser on the same device. Demo phone: **http://localhost:3000/phone.html**.
3. **Testing from a phone while the server runs on a PC:** use `http://<PC-IP>:3000`, but the microphone and GPS only work on `localhost` or HTTPS. Easiest: run the server on the phone itself with Termux (`pkg install nodejs`, then step 1) and open `http://localhost:3000`, or use an HTTPS tunnel such as cloudflared or ngrok.

## Run it on XAMPP (MySQL)
1. Install **Node.js** (18 or newer) from nodejs.org if you do not have it.
2. Open the **XAMPP Control Panel** and click **Start** next to **MySQL** (Apache is not needed).
3. *(Optional)* Create the database by hand: open `http://localhost/phpmyadmin`, click the **Home** icon, then **Import**, choose `schema.sql`, press **Go**. A database `safereport_ug` with 9 tables appears. If you skip this, step 5 creates it for you.
   If you earlier created a database named `schema.sql` by mistake, you can drop it.
4. Open a terminal in the project folder (in VS Code: Terminal > New Terminal) and run once:

        npm install

5. Start the system:

        node server.js

6. Open **http://localhost:3000**

XAMPP's default MySQL login is user `root` with **no password**; that is what `config.js` uses. If your MySQL has a password or another port, edit `config.js`, or set variables first.
PowerShell: `$env:DB_PASS="yourpassword"` then `node server.js`. Command Prompt: `set DB_PASS=yourpassword` then `node server.js`.

Common messages:
- *Cannot reach MySQL at 127.0.0.1:3306*: MySQL is not started in XAMPP.
- *MySQL refused user "root"*: set the right password as above.
- *The "mysql2" package is missing*: run `npm install`.

Want zero setup instead? `DB_DRIVER=sqlite node server.js` uses a local file database (needs Node 22+, uses `schema_sqlite.sql`).

Demo police accounts (**change before real use**). Officers sign in with their **National ID number (NIN)** + password, only (no ID-card or face scan):

| NIN             | Password       | Role                                      |
|-----------------|----------------|-------------------------------------------|
| CM00000000OF01  | Officer@123    | Officer: view/update cases, message, note |
| CM00000000CM01  | Commander@123  | + assign cases, export CSV, sign-in history |
| CM00000000AD01  | Admin@123      | + manage users, audit log  |

These NINs are placeholders. Create real officers in **Police > Users** with their real 14-character NIN.

## Police sign-in (National ID number + password)
Officers sign in with their **National ID number (NIN)** and password. The earlier ID-card scan, face check and location check were **removed** at the project owner's request. Every sign-in (and failed attempt) is still logged under **Police > Sign-ins**. Passwords are hashed; 10 attempts per 10 minutes per device are allowed.

## Files
- `server.js`: backend API, authentication, validation, triage, rate-limiting, static hosting
- `schema.sql`: **MySQL/MariaDB** database design for XAMPP/phpMyAdmin (users, sessions, reports, evidence, messages, notes, status_history, audit_log, login_events)
- `schema_sqlite.sql`: the same design in SQLite syntax (only used with `DB_DRIVER=sqlite`)
- `db.js`: database layer (MySQL via `mysql2`, or SQLite)
- `config.js`: database host/user/password/name and port
- `public/index.html`: the whole front-end (mobile-first, works on desktop too)
- `public/vendor/`: the QR-code library (used on receipts). The old face-recognition files in this folder are no longer used and can be deleted.

## From the video, kept
Home / Report / Track / Police tabs; crime-type chips; description, district, place, date-time; photo upload;
anonymous option; reference number (UG-xxxx); 4-step tracking timeline; police dashboard with status updates; 999/112 notice.

## New / improved
- Real **officer login** (scrypt-hashed passwords, HttpOnly sessions) with 3 roles
- **Secret PIN** with every report: tracking needs reference + PIN, so strangers can't guess a case number
- **Two-way anonymous messaging** between police and reporter; private internal officer notes
- **Auto-triage**: urgent/high/normal priority from keywords and crime type; urgent cases sort first
- **Duplicate detection** (same crime, district and place within 2 days)
- 15 crime types incl. mobile-money fraud, cybercrime, child abuse, corruption; 30 districts
- GPS capture, evidence upload (photos auto-compressed, MP4), evidence viewable only by police
- Analytics: counts, 14-day trend, top crimes/districts, hotspot map
- Search + filters, assignment to officers, CSV export, full **audit log**
- Rate limiting on submit / track / login; input sanitising; XSS-safe rendering; draft auto-save

## Before going live (important)
1. Serve over **HTTPS** (put Nginx/Caddy in front) and add `Secure` to the cookie in `server.js`.
2. Delete/replace the demo accounts and demo reports.
3. Set a MySQL password for `root` (or create a dedicated MySQL user), and back up the database and the `data/uploads` folder.
4. Get Uganda Police / data-protection (Data Protection and Privacy Act, 2019) sign-off; add SMS/email alerts if wanted.
7. This is a demonstration system, not an official Uganda Police product.


## New in 2.0: RAG, voice, live location, demo SMS
- **Law check (RAG).** Every report is matched against `data/laws.json` and shown to officers with the matching passages, what to do first, and questions to ask the reporter. Emergencies (fire, mob justice, armed robbery with gun or panga, sexual violence) are marked urgent automatically.
- **Law library.** `data/laws.json` is built from the Constitution of Uganda 1995 (Arts. 20-50 rights, 211-214 police), the Police Act Cap. 324 (ss. 4, 21, 23-25, 28, 68, 70) and the full Penal Code Act Cap. 120 (as at 2010). The **Firearms Act, Domestic Violence Act, Computer Misuse Act, Anti-Corruption Act, Narcotics Act and Children Act are NOT included yet**: entries tagged `[summary, verify]` are short demo summaries, not official text. Add real Acts with e.g. `node import-laws.js "Constitution.pdf=Constitution of Uganda 1995:20-50" "PenalCode.pdf=Penal Code Act" "Firearms.pdf=Firearms Act"` (name=Source, optional :section ranges), then restart. Re-list every Act each time because the library is rebuilt. Scanned PDFs need OCR first.
- **Voice report.** The report form has a Record button. The audio goes to the police with the case. The text transcript comes from the browser's speech recognition (works in Chrome, needs internet); if unavailable the audio is still sent but not analysed.
- **Live location.** Reporter ticks "Share my live location", and the officer's case view shows the latest pin (opens in OpenStreetMap). Updates continue while the reporter keeps the page open.
- **Demo SMS.** Non-anonymous reporters get a confirmation text, and officer messages are texted to the number in the report. In the demo these appear at **http://localhost:3000/phone.html** (enter the reporter's number). Replace `sms()` in server.js with a real gateway (e.g. Africa's Talking) for production.
- **Optional Claude summary.** Set `ANTHROPIC_API_KEY` to add a 3-line summary grounded only in the retrieved passages.
- Old databases upgrade automatically on start.

## New in 2.1: FBI-style home and tip flow
- **Home page** with an emergency banner (999 / 112), Submit a Tip, Track a report, a "Report crime and fraud" list, and service cards: Crime statistics (public counts from this portal), Scams & safety, Victim support, Case status, Police sign-in.
- **Tip flow**: Privacy statement -> Warning (emergency notice plus two agreement boxes; the second cites Police Act s.68 on false information) -> category cards with plain-language descriptions -> report form with a "Subject information" section (yes/no, then pick the identifiers you know).
- Not built yet: Most Wanted / Missing Persons listings (needs officers to publish entries), real station hotlines (add yours to `vVictims()` in `public/index.html`), Luganda or other languages.

## New in 2.2: police posts, automatic assignment, alerts
- **Register a post.** Police tab **Posts**: name, district, location (button uses the phone's GPS) and the radius it covers (km). Any officer can register; commanders/admins can remove posts.
- **Automatic assignment.** When a report is submitted: (1) the nearest post whose radius covers the report's GPS point; (2) otherwise a post in the same district; (3) otherwise unassigned (commanders and admins see unassigned cases, and registering a new post pulls in waiting ones). Commanders can reassign a case's station.
- **Alerts.** Officers whose station matches get a popup with sound and vibration within about 6 seconds, plus a phone notification if they allowed it. Tap to open the case. Officers with no station set, and admins, see every alert.
- An officer's station is matched by **name**, so the station on their account must equal the post's name. Demo posts (Kampala Central, Entebbe, Jinja, Mukono Central) use approximate coordinates: replace them with real ones.
- Alerts need the dashboard open in the browser. A closed app gets no alerts until push or SMS to officers is added.

## New in 2.3: "what happens next" for the reporter
- After submitting (and on the Track page) the reporter sees: **What you should do now**, **Keep this safe**, **What happens next** (the steps police follow), and **The law that may apply** (passages found by the RAG law check). The guidance is chosen by the crime type detected in the report (armed robbery, fire, mob justice, sexual violence, killing, assault, mobile money fraud, theft, burglary, kidnapping, domestic violence, corruption; generic advice otherwise).
- The advice text lives in `rag.js` (`GUIDE`, `NEXT_STEPS`). Have a police supervisor review and edit it before real use.
- 30 crime categories in 6 groups, each with a description. FBI-style Privacy Statement and Warning screens.

## New in 2.4: walk-in desk completed, kiosk, logo
- **Walk-in report tab (police)** records a complaint made in person: ID check, OB number, typed or dictated statement, audio statement, law check, read-back, signature or thumbprint, and a printable receipt with a QR code. New: a **Serious / Minor triage banner** after "Analyse statement" (serious = private-room interview, audio, signature; minor = lobby kiosk or online).
- **Lobby kiosk**: open `/#kiosk` on a tablet or PC at the station. It runs the public report flow, tags reports as `kiosk`, does not save references on the shared device, and resets after 2 minutes on the receipt screen.
- **Track page** now shows the station and the assigned officer.
- The Uganda Police crest is `public/logo.png` (used in the header, home page, report screens, police sign-in and receipts).
