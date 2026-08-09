// Thin Postgres client wrapper (node-postgres) for the literature-chatbot
// database. Reads DATABASE_URL from the environment -- populated from
// chatbot/.env by server.js's loadEnvFile(), or from a host's env vars in
// production. Never hard-code a connection string here.
const { Pool } = require('pg');

let pool = null;

// Built lazily (on first real query) rather than at require-time, so this
// module can be required before chatbot/.env has actually been loaded.
function getPool() {
  if (pool) return pool;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('Server is missing DATABASE_URL. Add it to chatbot/.env (see chatbot/.env.example) and restart the server.');
  }
  // rejectUnauthorized: false is a known workaround for Supabase's direct
  // connection endpoint -- its cert chain isn't in Node's default trust
  // store. Keeps the connection encrypted but skips verifying the server's
  // identity; fine for a personal dev project, but note the tradeoff.
  pool = new Pool({ connectionString, ssl: { rejectUnauthorized: false } });
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

// Unlike getPool(), safe to call even if no query ever ran (e.g. cleanup
// after a connection failure) -- it just no-ops instead of throwing.
function closePool() {
  return pool ? pool.end() : Promise.resolve();
}

module.exports = { query, getPool, closePool };
