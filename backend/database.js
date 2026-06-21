const { sql } = require('@vercel/postgres')

// 查询单行
async function query(sqlStr, params = []) {
  const result = await sql(sqlStr, params)
  return result.rows[0] || null
}

// 查询多行
async function queryAll(sqlStr, params = []) {
  const result = await sql(sqlStr, params)
  return result.rows
}

// 执行 INSERT/UPDATE/DELETE
async function run(sqlStr, params = []) {
  const result = await sql(sqlStr, params)
  return { rowCount: result.rowCount }
}

module.exports = { query, queryAll, run }
