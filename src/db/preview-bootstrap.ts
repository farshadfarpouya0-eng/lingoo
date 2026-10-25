import { getTableName, is, SQL, sql } from "drizzle-orm";
import { getTableConfig, PgDialect, PgTable } from "drizzle-orm/pg-core";
import { db } from "./index";
import * as schema from "./schema";
import { embeddedSandboxPreview } from "../lib/preview-frame-policy";

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
/**
 * Every table exported from schema.ts, ordered so a table is created after the tables its
 * foreign keys point to. (This used to be a hand-written list, so any table added later, such as
 * site_settings, was never created in the preview and saving admin settings failed.)
 */
function orderedTables(): PgTable[] {
  const all = Object.values(schema as Record<string, unknown>).filter((value): value is PgTable => is(value, PgTable));
  const byName = new Map(all.map(table => [getTableName(table), table]));
  const ordered: PgTable[] = [];
  const state = new Map<string, "visiting" | "done">();
  const visit = (table: PgTable) => {
    const name = getTableName(table);
    if (state.get(name)) return; // already placed, or a cycle (self references are fine inside CREATE TABLE)
    state.set(name, "visiting");
    for (const foreign of getTableConfig(table).foreignKeys) {
      const target = byName.get(getTableName(foreign.reference().foreignTable));
      if (target) visit(target);
    }
    state.set(name, "done");
    ordered.push(table);
  };
  all.forEach(visit);
  return ordered;
}
const dialect = new PgDialect();
const ident = (value: string) => `"${value.replaceAll('"', '""')}"`;
function expression(value: SQL) {
  const query = dialect.sqlToQuery(value);
  if (query.params.length) throw new Error("Preview DDL expressions must have literal defaults.");
  return query.sql;
}
function defaultValue(value: unknown): string {
  if (value instanceof SQL) return expression(value);
  if (typeof value === "string") return `'${value.replaceAll("'", "''")}'`;
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value !== null && typeof value === "object" && !Array.isArray(value)) return `'${JSON.stringify(value).replaceAll("'", "''")}'`;
  throw new Error("Unsupported sandbox column default.");
}

/** Additive DDL from the same Drizzle metadata used by application queries. */
export async function applyPreviewSchema(tx: Transaction) {
  const present = await tx.execute(sql`select table_name, column_name from information_schema.columns where table_schema = current_schema()`);
  const columnsByTable = new Map<string, Set<string>>();
  for (const row of present.rows) {
    const name = String(row.table_name);
    if (!columnsByTable.has(name)) columnsByTable.set(name, new Set());
    columnsByTable.get(name)!.add(String(row.column_name));
  }
  for (const table of orderedTables()) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let definition = `${ident(column.name)} ${column.getSQLType()}`;
      if (column.default !== undefined) definition += ` DEFAULT ${defaultValue(column.default)}`;
      if (column.notNull) definition += " NOT NULL";
      if (column.primary) definition += " PRIMARY KEY";
      if (column.isUnique) definition += " UNIQUE";
      return { name: column.name, definition };
    });
    const constraints: string[] = [];
    for (const foreign of config.foreignKeys) {
      const reference = foreign.reference();
      constraints.push(`CONSTRAINT ${ident(foreign.getName())} FOREIGN KEY (${reference.columns.map(c => ident(c.name)).join(", ")}) REFERENCES ${ident(getTableName(reference.foreignTable))} (${reference.foreignColumns.map(c => ident(c.name)).join(", ")}) ON DELETE ${foreign.onDelete} ON UPDATE ${foreign.onUpdate}`);
    }
    for (const check of config.checks) constraints.push(`CONSTRAINT ${ident(check.name)} CHECK (${expression(check.value)})`);
    for (const unique of config.uniqueConstraints) {
      const name = unique.name || `${config.name}_${unique.columns.map(c => c.name).join("_")}_unique`;
      constraints.push(`CONSTRAINT ${ident(name)} UNIQUE (${unique.columns.map(c => ident(c.name)).join(", ")})`);
    }
    await tx.execute(sql.raw(`CREATE TABLE IF NOT EXISTS ${ident(config.name)} (${[...columns.map(c => c.definition), ...constraints].join(", ")})`));
    const existing = columnsByTable.get(config.name);
    // Existing rows/tables are preserved; there are no DROP, DELETE or TRUNCATE statements.
    if (existing) {
      for (const column of columns) {
        if (!existing.has(column.name)) await tx.execute(sql.raw(`ALTER TABLE ${ident(config.name)} ADD COLUMN IF NOT EXISTS ${column.definition}`));
      }
    }
    for (const index of config.indexes) {
      const indexName = index.config.name;
      if (!indexName) throw new Error("Sandbox indexes must have explicit names.");
      const indexed = index.config.columns.map(column => {
        if (column instanceof SQL) return expression(column);
        if (!("name" in column) || typeof column.name !== "string") throw new Error("Sandbox index is missing a column name.");
        return ident(column.name);
      }).join(", ");
      const predicate = index.config.where ? ` WHERE ${expression(index.config.where)}` : "";
      await tx.execute(sql.raw(`CREATE ${index.config.unique ? "UNIQUE " : ""}INDEX IF NOT EXISTS ${ident(indexName)} ON ${ident(config.name)} (${indexed})${predicate}`));
    }
  }
}

export function managedPreviewDatabase() {
  return embeddedSandboxPreview({ E2B_SANDBOX: process.env.E2B_SANDBOX, E2B_SANDBOX_ID: process.env.E2B_SANDBOX_ID, DATABASE_URL: process.env.DATABASE_URL });
}
const state = globalThis as typeof globalThis & { __lingorainPreviewDatabaseReady?: Promise<void> };

/** Run only for disposable E2B + local Postgres. Hosted DBs use reviewed migrations. */
export async function ensurePreviewDatabase() {
  if (!managedPreviewDatabase()) return;
  if (!state.__lingorainPreviewDatabaseReady) {
    state.__lingorainPreviewDatabaseReady = db.transaction(async tx => {
      await tx.execute(sql`select pg_advisory_xact_lock(8127319)`);
      await applyPreviewSchema(tx);
    }).then(() => { console.info("[Lingorain preview] Local schema ready; existing data preserved."); }).catch(error => {
      state.__lingorainPreviewDatabaseReady = undefined;
      throw error;
    });
  }
  await state.__lingorainPreviewDatabaseReady;
}
