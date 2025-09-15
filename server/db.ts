import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from "@shared/schema";

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL must be set. Did you forget to provision a database?",
  );
}

export const pool = new Pool({ 
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  allowExitOnIdle: false
});

// Add error handling to prevent crashes on connection issues
pool.on('error', (err) => {
  console.error('Unexpected PostgreSQL pool error:', err);
  // Log the error but don't crash the application
});

pool.on('connect', (client) => {
  client.on('error', (err) => {
    console.error('PostgreSQL client error:', err);
    // Remove the client from the pool
    client.removeAllListeners();
  });
});

export const db = drizzle(pool, { schema });