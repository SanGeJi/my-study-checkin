const initSqlJs = require('sql.js')
const fs = require('fs')
const path = require('path')

const dbPath = path.join(__dirname, 'study_checkin.db')

let db

// 初始化 sql.js 数据库（从文件加载或新建）
async function initDatabase() {
  const SQL = await initSqlJs()

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath)
    db = new SQL.Database(fileBuffer)
  } else {
    db = new SQL.Database()
  }

  // 创建 users 表
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )`)

  // 创建 tasks 表
  db.run(`CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'work',
    due_date TEXT,
    completed INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id)
  )`)

  // 创建 checkins 表
  db.run(`CREATE TABLE IF NOT EXISTS checkins (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (user_id) REFERENCES users(id),
    UNIQUE(user_id, date)
  )`)

  saveDatabase()
}

// 保存数据库到磁盘
function saveDatabase() {
  const data = db.export()
  const buffer = Buffer.from(data)
  fs.writeFileSync(dbPath, buffer)
}

// 执行 INSERT/UPDATE/DELETE 并保存
function run(sql, params = []) {
  db.run(sql, params)
  // 在 saveDatabase 之前获取 last_insert_rowid（export 后可能失效）
  const lastIdResult = db.exec('SELECT last_insert_rowid() as id')
  const lastInsertRowid = lastIdResult[0]?.values[0][0] || null
  saveDatabase()
  return { changes: db.getRowsModified(), lastInsertRowid }
}

// 查询单行
function query(sql, params = []) {
  const stmt = db.prepare(sql)
  stmt.bind(params)
  if (stmt.step()) {
    const row = stmt.getAsObject()
    stmt.free()
    return row
  }
  stmt.free()
  return null
}

// 查询多行
function queryAll(sql, params = []) {
  const rows = []
  const stmt = db.prepare(sql)
  stmt.bind(params)
  while (stmt.step()) {
    rows.push(stmt.getAsObject())
  }
  stmt.free()
  return rows
}

// 导出数据库实例（供统计函数等直接使用）
function getDb() {
  return db
}

module.exports = {
  initDatabase,
  run,
  query,
  queryAll,
  getDb
}
