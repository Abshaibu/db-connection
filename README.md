# DB Connection Tester

A tiny Node.js Express app to test database connections from the browser.

## Features

- Test a connection string manually from the browser
- Check a configured environment `DB_URL` and `DB_TYPE`
- Supports PostgreSQL, MySQL, MongoDB, and Redis
- Auto-detects database type from common URI schemes
- Playground: add, list and delete items to check that writes work. Items
  live only in the app's own `dbtester_items` table / collection (Redis:
  `dbtester:items` and `dbtester:nextid` keys), created on the first add and
  removable with one button. Nothing else in the database is touched.

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

## Docker

Build the Docker image:

```bash
docker build -t db-connection-tester .
```

Run the container with environment variables:

```bash
docker run -p 3000:3000 \
  -e DB_URL="your_connection_string" \
  -e DB_TYPE="postgres" \
  db-connection-tester
```

Or use a local env file:

```bash
docker run -p 3000:3000 --env-file .env db-connection-tester
```

Then open the browser at:

```text
http://localhost:3000
```

## Environment variables

- `DB_URL` - connection string for the database
- `DB_TYPE` - optional override for the database type (`postgres`, `mysql`, `mongodb`, `redis`)
- `PORT` - optional server port (default `3000`)

> If `DB_TYPE` is omitted, the app will try to infer the type from the connection string scheme.

See `instructions.txt` for additional database setup notes and connection string examples.
