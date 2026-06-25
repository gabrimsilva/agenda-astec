import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

const connectionString = process.env.DATABASE_URL;

/**
 * The project supports two PostgreSQL drivers:
 *  - Neon serverless (used on Replit / Neon cloud, connects over WebSocket)
 *  - node-postgres (used for a standard/local PostgreSQL, e.g. Docker)
 *
 * The driver is auto-detected from the connection string but can be forced
 * with DB_DRIVER=neon | pg.
 */
const forcedDriver = process.env.DB_DRIVER?.toLowerCase();
const looksLikeNeon = /neon\.tech|pooler\.|\.neon\./i.test(connectionString);
const useNeon = forcedDriver === "neon" || (forcedDriver !== "pg" && looksLikeNeon);

let pool: any;
let db: any;

if (useNeon) {
  const { Pool, neonConfig } = await import("@neondatabase/serverless");
  const { drizzle } = await import("drizzle-orm/neon-serverless");
  const ws = (await import("ws")).default;
  neonConfig.webSocketConstructor = ws;
  pool = new Pool({ connectionString });
  db = drizzle({ client: pool, schema });
  console.log("🗄️  DB driver: neon-serverless");
} else {
  const pg = (await import("pg")).default;
  const { drizzle } = await import("drizzle-orm/node-postgres");
  pool = new pg.Pool({ connectionString });
  db = drizzle(pool, { schema });
  console.log("🗄️  DB driver: node-postgres");
}

export { pool, db };
