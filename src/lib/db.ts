import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.PG_POOL_MAX ?? 8),   // app и worker вместе < max_connections
  idleTimeoutMillis: 30_000,
});
