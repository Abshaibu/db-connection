const express = require("express");
const dotenv = require("dotenv");
const { Client } = require("pg");
const mysql = require("mysql2/promise");
const { MongoClient } = require("mongodb");
const { createClient: createRedisClient } = require("redis");

dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(express.static("public"));
app.use(express.json());

const envConnectionString = process.env.DB_URL || null;
const envDbType = process.env.DB_TYPE || null;

const typeAliases = {
  pg: "postgres",
  postgres: "postgres",
  postgresql: "postgres",
  mysql: "mysql",
  mariadb: "mysql",
  mongo: "mongodb",
  mongodb: "mongodb",
  redis: "redis",
};

const supportedTypes = Object.values(typeAliases).filter(
  (value, index, self) => self.indexOf(value) === index,
);

function inferTypeFromConnectionString(connectionString) {
  const lower = connectionString.trim().toLowerCase();
  if (lower.startsWith("postgres://") || lower.startsWith("postgresql://"))
    return "postgres";
  if (lower.startsWith("mysql://")) return "mysql";
  if (lower.startsWith("mongodb://") || lower.startsWith("mongodb+srv://"))
    return "mongodb";
  if (lower.startsWith("redis://") || lower.startsWith("rediss://"))
    return "redis";
  return null;
}

function normalizeType(dbType, connectionString) {
  if (dbType) {
    const normalized = dbType.toString().trim().toLowerCase();
    if (typeAliases[normalized]) {
      return typeAliases[normalized];
    }
  }

  const inferred = inferTypeFromConnectionString(connectionString);
  if (inferred) {
    return inferred;
  }

  throw new Error(
    "Could not infer database type from connection string. Set DB_TYPE explicitly.",
  );
}

async function testPostgres(connectionString) {
  const client = new Client({ connectionString, ssl: undefined });
  await client.connect();
  const result = await client.query("SELECT version()");
  await client.end();
  return {
    type: "postgres",
    version: result.rows[0].version,
    connectionString,
  };
}

async function testMysql(connectionString) {
  const connection = await mysql.createConnection({ uri: connectionString });
  await connection.connect();
  const [rows] = await connection.query("SELECT VERSION() AS version");
  await connection.end();
  return {
    type: "mysql",
    version: rows[0]?.version || "unknown",
    connectionString,
  };
}

async function testMongo(connectionString) {
  const client = new MongoClient(connectionString, {
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  const pingResult = await client.db().command({ ping: 1 });
  await client.close();
  return {
    type: "mongodb",
    ok: pingResult.ok,
    connectionString,
  };
}

async function testRedis(connectionString) {
  const client = createRedisClient({
    url: connectionString,
    socket: { reconnectStrategy: false },
  });
  await client.connect();
  const pingResponse = await client.ping();
  await client.disconnect();
  return {
    type: "redis",
    ping: pingResponse,
    connectionString,
  };
}

async function testConnection(connectionString, dbType) {
  if (!connectionString) {
    throw new Error("Connection string is required");
  }

  const type = normalizeType(dbType, connectionString);

  switch (type) {
    case "postgres":
      return await testPostgres(connectionString);
    case "mysql":
      return await testMysql(connectionString);
    case "mongodb":
      return await testMongo(connectionString);
    case "redis":
      return await testRedis(connectionString);
    default:
      throw new Error(`Unsupported database type: ${type}`);
  }
}

app.get("/api/supported", (req, res) => {
  res.json({ supported: supportedTypes });
});

app.post("/api/test-connection", async (req, res) => {
  const { connectionString, dbType } = req.body;

  try {
    const result = await testConnection(connectionString, dbType);
    res.json({ ok: true, message: "Connected successfully", details: result });
  } catch (error) {
    res
      .status(500)
      .json({ ok: false, message: "Connection failed", error: error.message });
  }
});

app.get("/api/status", async (req, res) => {
  if (!envConnectionString) {
    return res.json({
      configured: false,
      message: "No DB_URL configured in environment",
    });
  }

  try {
    const result = await testConnection(envConnectionString, envDbType);
    res.json({
      configured: true,
      ok: true,
      message: "Environment DB connected successfully",
      details: result,
    });
  } catch (error) {
    res.json({
      configured: true,
      ok: false,
      message: "Environment DB connection failed",
      error: error.message,
    });
  }
});

app.listen(port, () => {
  console.log(`DB connection tester running at http://localhost:${port}`);
  if (envConnectionString) {
    console.log(
      `Using DB_URL from environment with type ${envDbType || "auto-detected"}`,
    );
  } else {
    console.log(
      "No DB_URL found in environment. Use the UI or set DB_URL in .env",
    );
  }
});
