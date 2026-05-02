# DB Connection Tester

A tiny Node.js Express app to test database connections from the browser.

## Features

- Test a connection string manually from the browser
- Check a configured environment `DB_URL` and `DB_TYPE`
- Supports PostgreSQL, MySQL, MongoDB, and Redis
- Auto-detects database type from common URI schemes

## Setup

1. Install dependencies:

   ```bash
   npm install
   ```

2. Copy the example env file:

   ```bash
   cp .env.example .env
   ```

3. Edit `.env` with your database connection string and type.

4. Start the app:

   ```bash
   npm start
   ```

5. Open the browser at:
   ```text
   http://localhost:3000
   ```

## Environment variables

- `DB_URL` - connection string for the database
- `DB_TYPE` - optional override for the database type (`postgres`, `mysql`, `mongodb`, `redis`)
- `PORT` - optional server port (default `3000`)

> If `DB_TYPE` is omitted, the app will try to infer the type from the connection string scheme.

See `instructions.txt` for additional database setup notes and connection string examples.
