import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import { mkdirSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { config } from "./config";

type Row = Record<string, any>;

interface Driver {
  query(sql: string, params?: unknown[]): Promise<Row[]>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/**
 * Accès PostgreSQL. Production : `pg` (DATABASE_URL). Développement local sans
 * installation : PGlite (PostgreSQL embarqué, mêmes requêtes et migrations).
 */
@Injectable()
export class Db implements OnModuleDestroy {
  private driver!: Driver;
  private readonly log = new Logger("Db");
  private queue: Promise<unknown> = Promise.resolve();
  private closed = false;

  async init(): Promise<void> {
    if (config.dbMode === "postgres") {
      const { Pool } = await import("pg");
      const pool = new Pool({ connectionString: config.databaseUrl, max: 10 });
      this.driver = {
        query: async (sql, params) => (await pool.query(sql, params as any[])).rows,
        exec: async (sql) => void (await pool.query(sql)),
        close: () => pool.end(),
      };
      this.log.log("PostgreSQL (pg)");
    } else {
      const { PGlite } = require("@electric-sql/pglite") as typeof import("@electric-sql/pglite");
      let dir: string | undefined;
      if (config.dbMode !== "memory") {
        dir = join(config.dataDir, "pglite");
        mkdirSync(dir, { recursive: true });
      }
      const lite = dir ? new PGlite(dir) : new PGlite();
      await lite.waitReady;
      this.driver = {
        query: async (sql, params) => (await lite.query<Row>(sql, params as any[])).rows,
        exec: async (sql) => void (await lite.exec(sql)),
        close: () => lite.close(),
      };
      this.log.log(dir ? `PGlite (${dir})` : "PGlite (mémoire)");
    }
    await this.migrate();
  }

  private async migrate(): Promise<void> {
    await this.driver.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const done = new Set((await this.driver.query("SELECT version FROM schema_migrations")).map((r) => r.version));
    const dir = join(__dirname, "..", "migrations");
    for (const file of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
      if (done.has(file)) continue;
      await this.driver.exec(readFileSync(join(dir, file), "utf8"));
      await this.driver.query("INSERT INTO schema_migrations(version) VALUES ($1)", [file]);
      this.log.log(`Migration appliquée : ${file}`);
    }
  }

  /** Requêtes sérialisées : garantit l'ordre des écritures d'une même partie. */
  query<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T[]> {
    if (this.closed) return Promise.resolve([] as T[]); // arrêt en cours : écritures tardives ignorées
    const run = this.queue.then(() => (this.closed ? [] : this.driver.query(sql, params.map(serialize))));
    this.queue = run.catch(() => undefined);
    return run as Promise<T[]>;
  }

  async one<T extends Row = Row>(sql: string, params: unknown[] = []): Promise<T | undefined> {
    return (await this.query<T>(sql, params))[0];
  }

  async onModuleDestroy(): Promise<void> {
    this.closed = true;
    await this.queue.catch(() => undefined);
    await this.driver?.close();
  }
}

function serialize(v: unknown): unknown {
  if (v !== null && typeof v === "object" && !(v instanceof Date)) return JSON.stringify(v);
  return v;
}
