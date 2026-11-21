// Scratch "playground" storage used to check that a database accepts writes.
// Everything lives in the app's own storage (table/collection `dbtester_items`,
// or Redis keys prefixed `dbtester:`); nothing else in the database is touched.

const { Client } = require("pg");
const mysql = require("mysql2/promise");
const { MongoClient, ObjectId } = require("mongodb");
const { createClient: createRedisClient } = require("redis");

const TABLE = "dbtester_items";
const REDIS_ITEMS_KEY = "dbtester:items";
const REDIS_NEXT_ID_KEY = "dbtester:nextid";
const MAX_VALUE_LENGTH = 1000;

class InputError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

function requireValue(value) {
  if (typeof value !== "string" || !value.trim()) {
    throw new InputError("Enter a value to add");
  }
  if (value.length > MAX_VALUE_LENGTH) {
    throw new InputError(`Value must be at most ${MAX_VALUE_LENGTH} characters`);
  }
  return value;
}

function requireIntId(id) {
  const n = Number(id);
  if (!Number.isInteger(n) || n <= 0) throw new InputError(`Invalid id: ${id}`);
  return n;
}

function toItem(id, value, createdAt) {
  return {
    id: String(id),
    value,
    created_at:
      createdAt instanceof Date ? createdAt.toISOString() : String(createdAt),
  };
}

// --- PostgreSQL -----------------------------------------------------------

const postgres = {
  async connect(connectionString) {
    const client = new Client({
      connectionString,
      connectionTimeoutMillis: 10000,
    });
    await client.connect();
    return { client, close: () => client.end() };
  },
  async exists(client) {
    const { rows } = await client.query("SELECT to_regclass($1) AS t", [TABLE]);
    return rows[0].t !== null;
  },
  async list(client) {
    if (!(await this.exists(client))) return { items: [] };
    const { rows } = await client.query(
      `SELECT id, value, created_at FROM ${TABLE} ORDER BY id`,
    );
    return { items: rows.map((r) => toItem(r.id, r.value, r.created_at)) };
  },
  async add(client, { value }) {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
        id SERIAL PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )`,
    );
    const { rows } = await client.query(
      `INSERT INTO ${TABLE} (value) VALUES ($1) RETURNING id, value, created_at`,
      [value],
    );
    return { item: toItem(rows[0].id, rows[0].value, rows[0].created_at) };
  },
  async delete(client, { id }) {
    const intId = requireIntId(id);
    if (!(await this.exists(client))) return { deleted: false };
    const { rowCount } = await client.query(
      `DELETE FROM ${TABLE} WHERE id = $1`,
      [intId],
    );
    return { deleted: rowCount > 0 };
  },
  async drop(client) {
    await client.query(`DROP TABLE IF EXISTS ${TABLE}`);
    return { dropped: true };
  },
};

// --- MySQL / MariaDB ------------------------------------------------------

const mysqlAdapter = {
  async connect(connectionString) {
    const client = await mysql.createConnection({
      uri: connectionString,
      connectTimeout: 10000,
    });
    return { client, close: () => client.end() };
  },
  async exists(client) {
    const [rows] = await client.query(
      "SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema = DATABASE() AND table_name = ?",
      [TABLE],
    );
    return Number(rows[0].n) > 0;
  },
  async list(client) {
    if (!(await this.exists(client))) return { items: [] };
    const [rows] = await client.query(
      `SELECT id, value, created_at FROM ${TABLE} ORDER BY id`,
    );
    return { items: rows.map((r) => toItem(r.id, r.value, r.created_at)) };
  },
  async add(client, { value }) {
    await client.query(
      `CREATE TABLE IF NOT EXISTS ${TABLE} (
        id INT AUTO_INCREMENT PRIMARY KEY,
        value TEXT NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`,
    );
    const [result] = await client.query(
      `INSERT INTO ${TABLE} (value) VALUES (?)`,
      [value],
    );
    const [rows] = await client.query(
      `SELECT id, value, created_at FROM ${TABLE} WHERE id = ?`,
      [result.insertId],
    );
    return { item: toItem(rows[0].id, rows[0].value, rows[0].created_at) };
  },
  async delete(client, { id }) {
    const intId = requireIntId(id);
    if (!(await this.exists(client))) return { deleted: false };
    const [result] = await client.query(`DELETE FROM ${TABLE} WHERE id = ?`, [
      intId,
    ]);
    return { deleted: result.affectedRows > 0 };
  },
  async drop(client) {
    await client.query(`DROP TABLE IF EXISTS ${TABLE}`);
    return { dropped: true };
  },
};

// --- MongoDB --------------------------------------------------------------

const mongo = {
  async connect(connectionString) {
    const mongoClient = new MongoClient(connectionString, {
      serverSelectionTimeoutMS: 5000,
    });
    await mongoClient.connect();
    return {
      client: mongoClient.db().collection(TABLE),
      close: () => mongoClient.close(),
    };
  },
  async list(collection) {
    const docs = await collection.find().sort({ created_at: 1 }).toArray();
    return { items: docs.map((d) => toItem(d._id, d.value, d.created_at)) };
  },
  async add(collection, { value }) {
    const doc = { value, created_at: new Date() };
    const { insertedId } = await collection.insertOne(doc);
    return { item: toItem(insertedId, doc.value, doc.created_at) };
  },
  async delete(collection, { id }) {
    if (typeof id !== "string" || !ObjectId.isValid(id)) {
      throw new InputError(`Invalid id: ${id}`);
    }
    const { deletedCount } = await collection.deleteOne({
      _id: new ObjectId(id),
    });
    return { deleted: deletedCount > 0 };
  },
  async drop(collection) {
    try {
      await collection.drop();
    } catch (error) {
      if (error.code !== 26) throw error; // 26 = NamespaceNotFound
    }
    return { dropped: true };
  },
};

// --- Redis ----------------------------------------------------------------

const redis = {
  async connect(connectionString) {
    const client = createRedisClient({
      url: connectionString,
      socket: { reconnectStrategy: false, connectTimeout: 10000 },
    });
    client.on("error", () => {}); // errors surface through the awaited calls
    await client.connect();
    return { client, close: () => client.quit() };
  },
  async list(client) {
    const hash = await client.hGetAll(REDIS_ITEMS_KEY);
    const items = Object.entries(hash)
      .map(([id, json]) => {
        const { value, created_at } = JSON.parse(json);
        return toItem(id, value, created_at);
      })
      .sort((a, b) => Number(a.id) - Number(b.id));
    return { items };
  },
  async add(client, { value }) {
    const id = await client.incr(REDIS_NEXT_ID_KEY);
    const createdAt = new Date().toISOString();
    await client.hSet(
      REDIS_ITEMS_KEY,
      String(id),
      JSON.stringify({ value, created_at: createdAt }),
    );
    return { item: toItem(id, value, createdAt) };
  },
  async delete(client, { id }) {
    const intId = requireIntId(id);
    const removed = await client.hDel(REDIS_ITEMS_KEY, String(intId));
    return { deleted: removed > 0 };
  },
  async drop(client) {
    await client.del([REDIS_ITEMS_KEY, REDIS_NEXT_ID_KEY]);
    return { dropped: true };
  },
};

const adapters = { postgres, mysql: mysqlAdapter, mongodb: mongo, redis };

const OPERATIONS = {
  list: "List",
  add: "Add",
  delete: "Delete",
  drop: "Remove playground",
};

async function runItemOp(type, connectionString, op, args = {}) {
  const adapter = adapters[type];
  if (!adapter) throw new InputError(`Unsupported database type: ${type}`);
  if (!OPERATIONS[op]) throw new InputError(`Unknown operation: ${op}`);
  const input = op === "add" ? { value: requireValue(args.value) } : args;

  const { client, close } = await adapter.connect(connectionString);
  try {
    return await adapter[op](client, input);
  } finally {
    await Promise.resolve()
      .then(close)
      .catch(() => {});
  }
}

module.exports = { runItemOp, OPERATIONS, TABLE };
