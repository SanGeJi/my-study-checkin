const { createPool } = require('@vercel/postgres')

const DATABASE_ENV_NAMES = [
  'POSTGRES_URL',
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL',
  'POSTGRES_URL_NON_POOLING'
]

let pool
let initPromise

function getConfiguredDatabaseEnv() {
  return DATABASE_ENV_NAMES.find(name => process.env[name])
}

function getConnectionString() {
  const envName = getConfiguredDatabaseEnv()
  return envName ? process.env[envName] : null
}

function databaseEnvStatus() {
  const envName = getConfiguredDatabaseEnv()
  return {
    configured: Boolean(envName),
    variable: envName || null
  }
}

function missingConnectionStringError() {
  const error = new Error('Missing POSTGRES_URL or DATABASE_URL in Vercel environment variables')
  error.code = 'missing_connection_string'
  return error
}

function getPool() {
  if (pool) return pool

  const connectionString = getConnectionString()
  if (!connectionString) {
    throw missingConnectionStringError()
  }

  pool = createPool({ connectionString })
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

function describeDatabaseError(error) {
  const rawCode = error && (error.code || error.name)
  const code = rawCode ? String(rawCode) : 'unknown_database_error'
  const message = error && error.message ? String(error.message) : ''

  if (code === 'missing_connection_string' || message.includes('missing_connection_string')) {
    return {
      code: 'missing_connection_string',
      message: 'Missing POSTGRES_URL or DATABASE_URL in Vercel environment variables.'
    }
  }

  if (message.includes('password authentication failed')) {
    return {
      code: 'authentication_failed',
      message: 'Database authentication failed. Check the Neon password in your Vercel environment variable.'
    }
  }

  if (message.includes('ENOTFOUND') || message.includes('getaddrinfo')) {
    return {
      code: 'database_host_not_found',
      message: 'Database host was not found. Check the Neon connection string host.'
    }
  }

  if (message.includes('This connection string is meant to be used with a non-pooled connection')) {
    return {
      code: 'non_pooled_connection_string',
      message: 'The configured URL is non-pooled. Use the pooled Neon URL for POSTGRES_URL, or set DATABASE_URL to a pooled URL.'
    }
  }

  return {
    code,
    message: message ? `Database error: ${message}` : 'Unknown database error.'
  }
}

module.exports = {
  initDatabase: ensureDatabase,
  run,
  query,
  queryAll,
  databaseEnvStatus,
  describeDatabaseError
}
