# Maitri Workspace Notes

Maitri is a region-neutral matrimony monorepo. The Angular standalone client is in `frontend/`; the Express and MySQL API is in `backend/`.

## Commands

- `npm install` installs all workspace dependencies.
- `npm run migrate` creates the configured database and tables.
- `npm run dev` starts the API and Angular development server.
- `npm test` runs backend validation tests and an Angular production build.

## Implementation Conventions

- Keep profile and interest fields consistent across `frontend/src/app/api.service.ts`, `backend/src/validation.js`, and `backend/database/schema.sql`.
- Validate request data before use and use parameterized SQL for every query value.
- Read secrets and database settings from `backend/.env`; never commit credentials or use a hardcoded JWT secret.
- Keep profile photos behind authenticated API routes, and preserve the 2 MB JPEG/PNG/WebP upload limit.
- Only profiles whose accounts are active should appear in search.
