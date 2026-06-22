const { createPool, createClient } = require('@vercel/postgres')

// 连接池 URL（适用于 createPool）
const POOLED_ENV_NAMES = [
  'POSTGRES_URL',
  'DATABASE_URL',
  'POSTGRES_PRISMA_URL'
]

// 非连接池 URL（直接连接，适用于 createClient）
const CLIENT_ENV_NAMES = [
  'POSTGRES_URL_NON_POOLING'
]

let pool
let initPromise
let usingClient = false

function findEnvVar(envNames) {
  const name = envNames.find(n => process.env[n])
  return name ? { name, value: process.env[name] } : null
}

function getConfiguredDatabaseEnv() {
  const pooled = findEnvVar(POOLED_ENV_NAMES)
  if (pooled) return pooled.name

  const client = findEnvVar(CLIENT_ENV_NAMES)
  if (client) return client.name

  return null
}

function getConnectionString() {
  const envName = getConfiguredDatabaseEnv()
  return envName ? process.env[envName] : null
}

function databaseEnvStatus() {
  const envName = getConfiguredDatabaseEnv()
  return {
    configured: Boolean(envName),
    variable: envName || null,
    mode: usingClient ? 'client' : 'pool'
  }
}

function missingConnectionStringError() {
  const error = new Error('Missing POSTGRES_URL or DATABASE_URL in Vercel environment variables')
  error.code = 'missing_connection_string'
  return error
}

function getPool() {
  if (pool) return pool

  // 按优先级查找第一个可用的连接字符串
  const conn = findEnvVar(POOLED_ENV_NAMES) || findEnvVar(CLIENT_ENV_NAMES)
  if (!conn) throw missingConnectionStringError()

  // 默认用 createPool，如果 URL 实际上是非连接池格式，execute() 会自动降级
  pool = createPool({ connectionString: conn.value })
  usingClient = false
  return pool
}

async function execute(sqlText, params = []) {
  try {
    return await getPool().query(sqlText, params)
  } catch (error) {
    // createPool 遇到非连接池 URL 时自动降级到 createClient
    const message = error && error.message ? String(error.message) : ''
    if ((message.includes('direct connection') || message.includes('non-pooled connection')) && !usingClient) {
      const conn = findEnvVar(POOLED_ENV_NAMES) || findEnvVar(CLIENT_ENV_NAMES)
      pool = createClient({ connectionString: conn.value })
      usingClient = true
      return await pool.query(sqlText, params)
    }
    throw error
  }
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

  if (message.includes('direct connection') || message.includes('non-pooled connection')) {
    return {
      code: 'non_pooled_connection_string',
      message: '当前配置的是非连接池 URL（直接连接）。请在 Vercel 环境变量中使用 Neon 的连接池 URL（POSTGRES_URL），或确保 POSTGRES_URL_NON_POOLING 以外的变量设置为连接池格式。'
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
