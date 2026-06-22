const { createPool } = require('@vercel/postgres')

let pool
let initPromise

function getConnectionString() {
  return (
    process.env.POSTGRES_URL ||
    process.env.DATABASE_URL ||
    process.env.POSTGRES_PRISMA_URL ||
    process.env.POSTGRES_URL_NON_POOLING
  )
}

function getPool() {
  if (pool) return pool

  const connectionString = getConnectionString()
  pool = connectionString ? createPool({ connectionString }) : createPool()
  return pool
}

async function execute(sqlText, params = []) {
  return getPool().query(sqlText, params)
}

async function initDatabase() {
  await execute(`
    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      password TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'work',
      due_date DATE,
      completed BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `)

  await execute(`
    CREATE TABLE IF NOT EXISTS checkins (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(user_id, date)
    )
  `)
}

async function ensureDatabase() {
  if (!initPromise) {
    initPromise = initDatabase().catch(error => {
      initPromise = null
      throw error
    })
  }

  return initPromise
}

async function query(sqlText, params = []) {
  await ensureDatabase()
  const result = await execute(sqlText, params)
  return result.rows[0] || null
}

async function queryAll(sqlText, params = []) {
  await ensureDatabase()
  const result = await execute(sqlText, params)
  return result.rows
}

async function run(sqlText, params = []) {
  await ensureDatabase()
  const result = await execute(sqlText, params)
  return { rowCount: result.rowCount, rows: result.rows }
}

module.exports = {
  initDatabase: ensureDatabase,
  run,
  query,
  queryAll
}
