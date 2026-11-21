# DB Playground — design

## Why

The app only proves a connection opens. The user wants to prove that the
configured database user can **write**, and that writes persist: add data,
fetch it back, remove it. Main target: a self-hosted Supabase (Postgres).

## Goals

- From the browser, against the connection string already in the form:
  add an item, list items, delete an item.
- Works for all four supported types: Postgres, MySQL, MongoDB, Redis.
- Errors name the operation and show the driver's message
  (e.g. `Add failed: permission denied for schema public`).
- A way to remove the scratch storage when done.

## Non-goals

- Browsing or editing the user's existing tables.
- An automated one-click write check (option A, not chosen).
- Multiple fields, editing items, pagination, auth.

## Anti-goals

- Touching anything outside the app's own scratch storage.
- Putting credentials in URLs (all calls are POST with a JSON body).
- SQL built by string concatenation with user input.

## Approaches considered

- **A. One-click automated write check:** precise per-step result, but
  the user doesn't drive it.
- **B. Manual playground (chosen by the user):** scratch storage plus
  Add / Refresh / Delete in the UI. It's what the user asked for.
- **C. Both:** more than needed right now.

## Design

**Scratch storage** (always the same name, created on demand):

| Type     | Storage |
|----------|---------|
| Postgres | table `dbtester_items (id SERIAL PK, value TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now())` |
| MySQL    | table `dbtester_items (id INT AUTO_INCREMENT PK, value TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)` |
| MongoDB  | collection `dbtester_items` in the URI's default database |
| Redis    | hash `dbtester:items` (field = id, value = JSON `{value, created_at}`), id counter `dbtester:nextid` |

**API** (body always `{connectionString, dbType, ...}`):

- `POST /api/items/list` → `{ok, items:[{id, value, created_at}]}`.
  Missing storage → empty list, not an error.
- `POST /api/items/add` `{value}` → creates storage if needed (`IF NOT
  EXISTS`), inserts, returns the new item.
- `POST /api/items/delete` `{id}` → `{ok, deleted: true|false}`.
- `POST /api/items/drop` → removes the scratch table, collection or keys.

Each call opens a connection, runs the operation, and closes it, the same
way the existing test does. Responses don't echo the connection string.

**UI:** a new "Playground" section under the existing form, reusing its
connection string and type inputs. It has a text input with an **Add**
button, a **Refresh** button, an item list (value, time, **Delete** per
row) and a **Remove playground table** button. Status and errors appear
in the same style as the existing result box.

## Left to the builder

- Code structure (per-type adapter objects are suggested).
- Exact styling, matching the existing page.
- Verifying against real instances (e.g. throwaway Docker containers
  for each type).
