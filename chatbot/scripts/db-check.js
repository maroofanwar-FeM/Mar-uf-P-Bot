// Sanity check for the DATABASE_URL connection: connect, list the public
// tables, insert one real row plus a row linked to it via foreign key, read
// them back with a join, and print what came back.
//
// conversations.topic_id and .user_id are both NOT NULL, so a linked
// conversation row needs both a user and a topic to already exist -- the
// topic is upserted (topic_name is UNIQUE) so re-running this doesn't pile
// up duplicate topics; the user is inserted fresh each run since users has
// no uniqueness constraint to key off of.
const fs = require('fs');
const path = require('path');

// Same small KEY=VALUE loader as server.js -- this script runs standalone
// (not through server.js), so .env isn't loaded into process.env yet.
function loadEnvFile() {
  let text;
  try {
    text = fs.readFileSync(path.join(__dirname, '..', '.env'), 'utf8');
  } catch (e) {
    return;
  }
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key && !(key in process.env)) process.env[key] = value;
  }
}
loadEnvFile();

const db = require('../db');

async function main() {
  console.log('Connecting to the database...');

  const tables = await db.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public'
    ORDER BY table_name
  `);
  console.log('Tables:', tables.rows.map((r) => r.table_name).join(', ') || '(none found)');

  console.log('Inserting a smoke-test user...');
  const userResult = await db.query(
    `INSERT INTO users (name) VALUES ($1) RETURNING id, name`,
    ['db:check smoke test user']
  );
  const user = userResult.rows[0];

  console.log('Upserting the smoke-test topic (required FK for conversations)...');
  const topicResult = await db.query(
    `INSERT INTO topics (topic_name, description)
     VALUES ($1, $2)
     ON CONFLICT (topic_name) DO UPDATE SET description = EXCLUDED.description
     RETURNING id, topic_name`,
    ['db:check smoke test topic', 'Reused/created by npm run db:check to verify the connection.']
  );
  const topic = topicResult.rows[0];

  console.log('Inserting a conversation linked to that user and topic...');
  const conversationResult = await db.query(
    `INSERT INTO conversations (user_id, topic_id) VALUES ($1, $2) RETURNING id`,
    [user.id, topic.id]
  );
  const conversation = conversationResult.rows[0];

  console.log('Reading it back with a join...');
  const joined = await db.query(
    `SELECT c.id AS conversation_id, u.name AS user_name, t.topic_name, c.created_at
     FROM conversations c
     JOIN users u ON u.id = c.user_id
     JOIN topics t ON t.id = c.topic_id
     WHERE c.id = $1`,
    [conversation.id]
  );

  console.log('Joined row:', joined.rows[0]);
  console.log('db:check passed.');
}

main()
  .catch((err) => {
    console.error('db:check failed:', err.message);
    process.exitCode = 1;
  })
  .finally(() => db.closePool());
