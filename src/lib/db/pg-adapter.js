import pg from 'pg';
const { Pool, types } = pg;
import fs from 'fs';
import path from 'path';

// Configure pg type parsers so BIGINT and NUMERIC are parsed as Numbers (matching SQLite behavior)
types.setTypeParser(20, val => (val === null ? null : parseInt(val, 10))); // INT8 / BIGINT
types.setTypeParser(1700, val => (val === null ? null : parseFloat(val))); // NUMERIC

/**
 * Translates SQLite-flavored SQL into PostgreSQL-flavored SQL.
 * - Converts positional '?' placeholders to '$1, $2, ...'
 * - Converts SQLite datetime/date functions to PostgreSQL equivalents
 */
export function translateSqlToPg(sqliteSql) {
  let paramIndex = 1;
  let inSingleQuote = false;
  let out = '';

  for (let i = 0; i < sqliteSql.length; i++) {
    const char = sqliteSql[i];
    if (char === "'" && (i === 0 || sqliteSql[i - 1] !== '\\')) {
      inSingleQuote = !inSingleQuote;
      out += char;
    } else if (char === '?' && !inSingleQuote) {
      out += `$${paramIndex++}`;
    } else {
      out += char;
    }
  }

  // Dialect translations
  out = out.replace(/datetime\('now'\)/gi, 'CURRENT_TIMESTAMP');
  // Use a replacement callback so the captured day count is not mistaken for
  // a PostgreSQL bind parameter (for example, `$1 days`).
  out = out.replace(/datetime\('now',\s*'-(\d+)\s*days'\)/gi, (_match, days) => `(CURRENT_TIMESTAMP - INTERVAL '${days} days')`);
  out = out.replace(/date\('now',\s*'-(\d+)\s*days'\)/gi, (_match, days) => `(CURRENT_DATE - INTERVAL '${days} days')`);
  out = out.replace(/date\('now'\)/gi, 'CURRENT_DATE');
  out = out.replace(/date\(([^)]+)\)/gi, 'DATE($1)');

  return out;
}

function normalizeArgs(args) {
  let params = [];
  if (args.length === 1 && Array.isArray(args[0])) {
    params = args[0];
  } else {
    params = args;
  }
  // pg requires null instead of undefined
  return params.map(val => (val === undefined ? null : val));
}

import { POSTGRES_SCHEMA } from './schema.pg.js';

export class PgDatabase {
  constructor(connectionString) {
    this.pool = new Pool({
      connectionString,
      ssl: connectionString.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });
    this.isPostgres = true;
    this.schemaReady = null;

    this.pool.on('error', (err) => {
      console.error('[pg-adapter] Unexpected error on idle PostgreSQL client:', err.message);
    });
  }

  async ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = this.pool.query(POSTGRES_SCHEMA).catch(error => {
        console.error('[pg-adapter] Schema initialization error:', error.message);
        this.schemaReady = null;
        throw error;
      });
    }
    await this.schemaReady;
  }

  prepare(sql) {
    const pgSql = translateSqlToPg(sql);
    const pool = this.pool;
    const ensureSchema = () => this.ensureSchema();

    return {
      async all(...args) {
        const params = normalizeArgs(args);
        await ensureSchema();
        const res = await pool.query(pgSql, params);
        return res.rows;
      },
      async get(...args) {
        const params = normalizeArgs(args);
        await ensureSchema();
        const res = await pool.query(pgSql, params);
        return res.rows[0] || undefined;
      },
      async run(...args) {
        const params = normalizeArgs(args);
        await ensureSchema();
        const res = await pool.query(pgSql, params);
        return { changes: res.rowCount, rowCount: res.rowCount };
      }
    };
  }

  async exec(sql) {
    await this.ensureSchema();
    return await this.pool.query(sql);
  }

  pragma() {
    // No-op for PostgreSQL
    return;
  }

  transaction(fn) {
    return async (...txArgs) => {
      await this.ensureSchema();
      const client = await this.pool.connect();
      try {
        await client.query('BEGIN');
        const txDb = {
          prepare: (sql) => {
            const pgSql = translateSqlToPg(sql);
            return {
              all: async (...args) => {
                const res = await client.query(pgSql, normalizeArgs(args));
                return res.rows;
              },
              get: async (...args) => {
                const res = await client.query(pgSql, normalizeArgs(args));
                return res.rows[0] || undefined;
              },
              run: async (...args) => {
                const res = await client.query(pgSql, normalizeArgs(args));
                return { changes: res.rowCount, rowCount: res.rowCount };
              }
            };
          },
          exec: async (sql) => await client.query(sql),
          pragma: () => {}
        };

        const result = await fn(txDb, ...txArgs);
        await client.query('COMMIT');
        return result;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    };
  }

  async close() {
    await this.pool.end();
  }
}
