import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL, ensure the database is provisioned");
}

export default defineConfig({
  out: "./migrations",
  schema: "./shared/schema.ts",
  dialect: "postgresql",
  // _migration_log é gerenciada manualmente pelo server/migrate.ts (fora do Drizzle).
  // Ignoramos aqui para o `drizzle-kit push` não tentar apagá-la.
  tablesFilter: ["!_migration_log"],
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
});
