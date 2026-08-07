import { defineConfig } from "drizzle-kit";

// DATABASE_URL is only needed by commands that talk to a database
// (push/migrate/studio); `drizzle-kit generate` works offline from the schema.
export default defineConfig({
  dialect: "postgresql",
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  ...(process.env.DATABASE_URL !== undefined && {
    dbCredentials: { url: process.env.DATABASE_URL },
  }),
});
