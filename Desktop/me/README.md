# SafeReport UG: Uganda Police e-Crime Reporting System

Built from the "SafeReport UG" prototype video and extended into a working full-stack system.

## Current update
- Every screen uses the Uganda Police-inspired white-and-blue theme, including the demo SMS inbox.
- Police sign-in now requires the registered full name, badge number and password/PIN. Existing users receive a generated `BP-00001`-style badge on upgrade.
- A station commander acts as the station administrator: they can view, register, edit, deactivate and reactivate officers at their own station. System administrators can manage all stations.
- Statement audio supports start, pause, resume, stop, timer, playback and re-recording. The speech transcript is editable and must be reviewed before submission. Audio is police-authenticated and is encrypted at rest when `VIDEO_ENCRYPTION_KEY` is configured.
- Sensitive video is a separate, consent-confirmed, one-submission workflow. Submitted video is encrypted using AES-256-GCM and access is audited. Set `VIDEO_ENCRYPTION_KEY` to a private 64-character hexadecimal key before using it; retain a protected backup or existing encrypted files cannot be read. The server rejects sensitive-video uploads when no key is configured.
- Case lists, case details, station officer lists and evidence downloads enforce station/role access. CID is limited to high and urgent cases; admins have national access.
- RAG uses the report and selected category for retrieval, cites the law source and section, raises its relevance threshold, and states when the loaded library has no sufficiently relevant match. The supplied law library still needs legal review and current official-source verification.

Use HTTPS for operational use. Camera and microphone access requires HTTPS or localhost. A badge is an identifier, not a secret; use a strong PIN/password and change all demo credentials.

To configure the sensitive-video key in PowerShell before starting the server, generate and store a secure 32-byte key in your organisation's secret manager, then set `$env:VIDEO_ENCRYPTION_KEY="<64 hex characters>"`. Keep the same key for as long as those encrypted recordings must remain accessible. Do not commit it to source control or send it with the project ZIP.

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

Demo police accounts (**change before real use**). Sign in with the registered name, badge number and password:

| Name | Badge | Password | Role |
|---|---|---|---|
| System Administrator | BP-00001 | Admin@123 | National administrator |
| Cmdr. Nakato Sarah | BP-00002 | Commander@123 | Kampala Central station administrator |
| Det. Okello James | BP-00003 | Officer@123 | Officer |
| D/Insp. Auma Brenda | BP-00005 | Cid@12345 | CID |

The badges and credentials are placeholders. Register real officers in **Police > Station officers** with their badge, name, NIN and an individual strong PIN/password.

## What changed in this version
- **Application interface uses a consistent white-and-blue theme** across public reporting, tracking, police tools, header/navigation, notices and the demo inbox. The visible build label is v2.8.
- **Statistics are readable** (the bar charts had a duplicate CSS rule).
- **Hotspot map is navigable**: drag to move, scroll/pinch/double-click or +/- to zoom, tap a dot to see the case and open it. Street tiles need internet; dots show without it (`public/pmap.js`).
- **New role: CID** (Criminal Investigations). Add it under Police > Users. Old databases are upgraded automatically.
- **Crime report input**: type it, record audio, or both, but at least one is required (web form and walk-in desk, checked again on the server).

## Police sign-in (name + badge + password/PIN)
Every sign-in and failed attempt is recorded under **Police > Sign-ins**. Passwords are hashed; 10 attempts per 10 minutes per device are allowed. Station commanders only see and manage officers attached to their own station.

## Files
- `server.js`: backend API, authentication, validation, triage, rate-limiting, static hosting
- `schema.sql`: **MySQL/MariaDB** database design for XAMPP/phpMyAdmin (users, sessions, reports, evidence, messages, notes, status_history, audit_log, login_events)
- `schema_sqlite.sql`: the same design in SQLite syntax (only used with `DB_DRIVER=sqlite`)
- `db.js`: database layer (MySQL via `mysql2`, or SQLite)
- `config.js`: database host/user/password/name and port
- `public/index.html`: the whole front-end (mobile-first, works on desktop too)
- `public/pmap.js`: the pan-and-zoom hotspot map
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

## New in 2.5: Service-area routing, location and officer history
- Police posts register a service area and district; automatic forwarding uses those administrative areas, not distance or a radius. Replace the demo areas and approximate post coordinates with the real station boundaries and map locations before deployment.
- Every online report requires a one-time browser location capture at submission. The live-sharing control and continuous live-location endpoint have been removed. Location permission requires HTTPS (or localhost).
- To turn coordinates into a recognizable area for visitors, set `GOOGLE_MAPS_API_KEY` on the server and enable Google Maps Geocoding API. Without the key, coordinates are retained but the reporter can select the district and area manually. Google Maps links open the area or station for directions.
- Reporters can browse registered police posts, prioritizing the same area and then nearby map distance. This is a discovery aid only; it does not choose which station receives the report.
- Station messages and status pages identify the station receiving the report. If no registered post matches the selected service area, the report remains in the central queue and the message says so.
- Officers can see case history for cases assigned to them or where they recorded notes/status changes, including solved cases. Access to those records remains limited to officers who worked on them and authorized station commanders/admins.
- Successful reference + PIN checks switch to a status-only view with refresh and clear controls, so the reporter does not need to re-enter them during that page session. Clearing or reloading the page requires a fresh check.

## New in 2.6: Public news and notifications
- The home page has a latest-news area immediately beneath its header, plus a link to the Uganda Police Force news site. The app imports public articles from UPF's WordPress RSS feed (`https://upf.go.ug/feed/`) every 30 minutes, deduplicates by official article URL, and retains the source link. Administrators can sync immediately, hide/republish imported articles, and publish short SafeReport public updates from Police > News & updates. Updates are recorded in the audit log.
- If UPF changes or disables its default RSS feed, an administrator can set `UPF_NEWS_FEED_URL` to another public HTTPS RSS or WordPress posts JSON feed hosted on `upf.go.ug` (or `www.upf.go.ug`), then restart the app. Manual public updates remain available if the official feed cannot be reached; existing imported stories stay visible.
- Reporters see a confirmation popup when a report is submitted. It names the receiving station or central queue but does not expose the secret reference/PIN in a browser notification.
- Anyone may opt in to browser alerts on that device. While the SafeReport page is open, it checks for newly published notices every minute, displays a popup and (if browser permission was granted) an OS notification. The latest notices remain visible to everyone on the home page.
- The app does not collect contact details for public news alerts. Closed-browser/background delivery needs a configured web-push service or an SMS/email provider; the current prototype polls only while the app is open. Report confirmation SMS remains in the demo inbox until a real SMS gateway is configured.

## New in 2.8: UPF image carousel and simpler location
- News cards now slide one at a time in a responsive flex carousel, with pictures linked directly from UPF's site. Slides change every five seconds and fade over half a second. The same UPF images appear softly behind the home screen. The app stores image URLs and does not download or copy these pictures; the hosting browser must be able to load `upf.go.ug` images.
- UPF news sync tries the public WordPress posts JSON endpoint with featured images first, then RSS. It runs at startup and every 30 minutes. Use `UPF_NEWS_FEED_URL` to select a public HTTPS RSS or WordPress JSON feed if UPF changes its endpoint.
- Online reports use the phone's GPS by default and hide district/area/place fields. If the incident happened elsewhere, the reporter can search one town/street/landmark field; that search needs `GOOGLE_MAPS_API_KEY`. Routing first checks a matching station service area, then finds the closest registered station from its map coordinates. Unassigned cases with a known location are forwarded during startup when a station is available.
- Speech recognition offers several local-language choices, including Luganda, Kiswahili, Runyankole, Rukiga, Lusoga, Acholi, Ateso and Lugbara. The browser decides which languages it supports. Some browsers send speech to their own online recognition service, so the consent screen explains this. If a language or browser is unsupported, the audio still records and the statement can be typed. Universal transcription in every language requires a separate speech service and explicit deployment/privacy configuration.
