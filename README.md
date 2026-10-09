# Maitri | Matrimony

A region-neutral full-stack matrimony platform built with Angular, Express, MySQL, and Socket.IO.

## Features

- Create an account and sign in with bcrypt-hashed passwords and short-lived JWT sessions.
- Build a profile in three steps with regional details, education, profession, family, community, gothram, rasi, and nakshatram.
- Upload a JPEG, PNG, or WebP profile photo up to 2 MB. Image bytes are stored in MySQL and served only to signed-in members; photo URLs are also supported.
- Search active profiles by location, gender, age, height, education, occupation, community, star, and rasi.
- Send, accept, or decline expressions of interest, with live Socket.IO notifications.

## Requirements

- Node.js 20 or newer and npm
- MySQL 8.0 or newer, running locally or on a reachable host

## Local Setup (Windows PowerShell)

1. Copy the backend environment template and set your MySQL credentials and a private JWT secret:

   ```powershell
   Copy-Item backend/.env.example backend/.env
   ```

   Generate a secret with `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, then put the result in `backend/.env`. Configure `DB_HOST`, `DB_PORT`, `DB_USER`, and `DB_PASSWORD` for your MySQL instance. The default database name is `maitri_matrimony`.

2. From the repository root, install all workspace dependencies:

   ```powershell
   npm install
   ```

3. Create the database and tables:

   ```powershell
   npm run migrate
   ```

   If the old default database exists and the new database is empty, the migration copies its users, profiles, connections, plans, payments, and subscriptions. It leaves the source database unchanged.

4. Start the Angular app and API together:

   ```powershell
   npm run dev
   ```

   Open `http://localhost:4200`. The API listens at `http://localhost:5000`; update `WEB_ORIGIN` in `backend/.env` if Angular runs on another origin. The frontend API URL is configured in `frontend/src/environments/environment.ts`.

## Checks

```powershell
npm test
```

This runs backend validation tests and an Angular production build. The backend tests do not require a running MySQL server; the migration and API do.

## Administrator Access

Admin users sign in through the same form as members. To grant admin access, create the account first, set `ADMIN_EMAIL` in `backend/.env` to that account's email, and run `npm run migrate`. Then sign out and sign in again so the new admin role is included in the session token. The admin directory is protected by server-side role checks; password hashes and private photo data are never returned by its API.

Admins can verify pending accounts, deactivate active accounts, and reactivate suspended accounts. Account status is checked on every authenticated API request, so old sessions stop working immediately after deactivation.

## Subscriptions and Payments

Search and interest actions require an active subscription; members can still register and create their profile before subscribing. The available terms are 1, 3, 6, and 12 months. The 1-month plan starts at INR 99; the other plan prices are unset until configured in the admin dashboard.

Member search shows five results per page and only returns active profiles sharing the signed-in member's saved community. The community condition is applied by the server, not accepted from a client-supplied filter.

Payments use manual transfer-reference review: members submit a transaction reference, and an administrator approves or rejects it. Only the amount, currency, transaction reference, and review status are stored. Card numbers and security codes are not collected or stored. Configure and communicate the transfer destination separately before accepting real payments.

To create four fictional profiles for local testing, set a temporary `DEMO_PASSWORD` of at least 12 characters and run `npm run seed:demo --workspace backend`. The seeder only updates its reserved demo accounts. It does not create payments or subscriptions, so search remains locked until a subscription is approved.

The current local development admin signs in as `admin@gmail.com`. Configure a persistent, private `JWT_SECRET` and change the development admin password before continued or non-local use.

## Project Layout

- `frontend/` - Angular standalone application and responsive UI
- `backend/src/` - Express API, validation, and MySQL migration runner
- `backend/database/schema.sql` - users, profiles, and connections tables
- `backend/.env.example` - local backend configuration template

Never commit `backend/.env` or use its local JWT secret in a deployed environment. Set a unique, high-entropy secret and configure production CORS, HTTPS, database access, and backups before deployment.
