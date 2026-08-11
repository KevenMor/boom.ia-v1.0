import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigration() {
  const databaseUrl =
    process.env.DATABASE_URL ||
    process.env.NEXUS_DATABASE_URL ||
    process.env.SUPABASE_DB_URL;

  const sqlPath = join(
    __dirname,
    "..",
    "..",
    "sql",
    "054_assign_conversation_rpcs.sql"
  );
  const sql = readFileSync(sqlPath, "utf-8");

  if (!databaseUrl) {
    console.log(
      "[Migration] DATABASE_URL não configurado. Execute o SQL manualmente no Supabase SQL Editor:\n"
    );
    console.log("--- SQL ---");
    console.log(sql);
    console.log("--- FIM ---");
    process.exit(1);
  }

  try {
    const { default: pg } = await import("pg");
    const client = new pg.Client({ connectionString: databaseUrl });
    await client.connect();
    await client.query(sql);
    await client.end();
    console.log("[Migration] RPCs get_conversation_chatwoot_id e update_conversation_assignee criadas com sucesso.");
  } catch (e: unknown) {
    const err = e as Error;
    const msg = err.message || "";
    console.error("[Migration] Erro ao aplicar SQL:", msg);
    process.exit(1);
  }
}

runMigration();
