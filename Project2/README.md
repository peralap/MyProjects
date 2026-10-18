# AtoZGigServices

A starter marketplace for discovering independent service professionals and requesting bookings. The initial interface is Telangana-focused and shows prices in INR; it is not legal, tax, or regulatory guidance.

## Included

- React 19 and Vite frontend
- Express API with MySQL persistence
- Customer and gig-worker registration and sign-in
- Worker directory and customer booking requests
- Password hashing and short-lived JWT authentication

This starter does **not** include online payment processing, admin management, official government registration, welfare-fund collection, or regulatory filing. Do not treat the example as proof of compliance or production readiness.

## Requirements

- Node.js 20.19 or newer
- MySQL 8.0.16 or newer

## Run locally

1. Create the database schema:

   ```powershell
   Get-Content -Raw server\schema.sql | mysql -u root -p
   ```

2. Create a restricted MySQL account for the app (replace the example password with a private value):

   ```sql
   CREATE USER 'atoz_app'@'localhost' IDENTIFIED BY 'replace-with-a-private-password';
   GRANT SELECT, INSERT ON atoz_gig_db.* TO 'atoz_app'@'localhost';
   ```

   Do not run the application as `root`.

3. Create the server environment file:

   ```powershell
   Copy-Item server\.env.example server\.env
   ```

   Edit `server\.env` with the database account credentials and a private random JWT secret of at least 32 characters. Keep `.env` out of version control.

4. Install dependencies and start both apps:

   ```powershell
   npm install
   npm run dev
   ```

5. Open <http://localhost:5173>. The API listens on <http://localhost:5000>; use `GET /api/health` to check that it is responding.

Register a gig-worker account first to populate the directory, then register a customer account to create booking requests.

## API overview

| Method | Endpoint | Access | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | Public | API liveness |
| `POST` | `/api/auth/register` | Public | Register a customer or gig worker |
| `POST` | `/api/auth/login` | Public | Sign in and receive a short-lived bearer token |
| `GET` | `/api/workers` | Public | List available workers |
| `POST` | `/api/bookings` | Customer | Request a booking for up to 24 hours |
| `GET` | `/api/bookings/mine` | Customer | List the signed-in customer's booking requests |

Registration and booking input is validated by the API. Booking prices are calculated on the server from the worker's stored hourly rate. Booking requests are not payments, and creating one does not confirm a worker or reserve a scheduled time.

## Configuration

The API reads configuration from `server/.env`:

| Variable | Description |
| --- | --- |
| `PORT` | API port (default: `5000`) |
| `CLIENT_ORIGIN` | Allowed browser origin (default: `http://localhost:5173`) |
| `DB_HOST`, `DB_PORT` | MySQL address (port default: `3306`) |
| `DB_USER`, `DB_PASSWORD`, `DB_NAME` | MySQL credentials and database name |
| `JWT_SECRET` | Private signing secret; at least 32 characters |

The frontend API URL defaults to `http://localhost:5000/api`. To change it, create `client/.env.local` and set `VITE_API_URL`.

## Production considerations

The in-memory frontend session is lost when the page reloads. Before production use, add a carefully designed session strategy, rate limiting, account recovery, logging/monitoring, TLS, database backups, and operational controls. Select and integrate a payment provider before accepting money; verify payment server-to-server and derive charge amounts from trusted booking data. Obtain professional advice on applicable worker, tax, and regulatory requirements.
