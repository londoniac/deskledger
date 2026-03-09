# DeskLedger

UK business accounting SaaS. Import bank statements, categorise expenses, generate tax reports.

## Stack

- **Frontend**: React + Vite (deployed to Render static site)
- **Backend**: Express.js API (deployed to Render web service)
- **Database**: Supabase PostgreSQL with Row-Level Security
- **Auth**: Supabase Auth
- **Storage**: Supabase Storage (invoices, receipts)
- **Billing**: Stripe (coming soon)

## Development

```bash
# Install dependencies
npm install
cd app && npm install
cd ../server && npm install

# Create server/.env from .env.example
# Create app/.env from .env.example

# Run both frontend and API
npm run dev
```

Frontend: http://localhost:5173
API: http://localhost:3001

## Database Setup

Run the SQL migrations in Supabase SQL Editor:
1. `supabase/migrations/001_schema.sql`
2. `supabase/migrations/002_rls.sql`

## Deploy

Push to `main` — Render auto-deploys via `render.yaml` blueprint.
