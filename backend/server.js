const express = require('express')
const cors = require('cors')
const { query, queryAll, run } = require('./database')

const app = express()

// 中间件：解析 JSON 请求体、处理跨域
app.use(cors())
app.use(express.json())

// ==================== 辅助函数 ====================

// 统一响应格式
function success(res, data = {}, message = '') {
  res.json({ success: true, data, message })
}

function fail(res, message = '操作失败') {
  res.json({ success: false, data: {}, message })
}

// 计算最长连续打卡天数
function longestStreak(userId) {
  const rows = queryAll('SELECT date FROM checkins WHERE user_id = ? ORDER BY date ASC', [userId])
  if (!rows || rows.length === 0) return 0

  const dates = rows.map(r => r.date).sort()
  let longestStreak = 1
  let currentStreak = 1

  for (let i = 1; i < dates.length; i++) {
    const prev = new Date(dates[i - 1])
    const curr = new Date(dates[i])
    const diffDays = (curr - prev) / (1000 * 60 * 60 * 24)
    if (diffDays === 1) {
      currentStreak++
      if (currentStreak > longestStreak) {
        longestStreak = currentStreak
      }
    } else {
      currentStreak = 1
    }
  }
  return longestStreak
}

// 检查今日是否已打卡
function todayCheckedIn(userId) {
  const today = new Date().toISOString().slice(0, 10)
  const row = query('SELECT id FROM checkins WHERE user_id = ? AND date = ?', [userId, today])
  return Boolean(row)
}

// 计算本周打卡次数
function weeklyCheckins(userId) {
  const now = new Date()
  const dayOfWeek = now.getDay() // 0=周日, 1=周一, ...
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  const monday = new Date(now)
  monday.setDate(now.getDate() + diffToMonday)
  const mondayStr = monday.toISOString().slice(0, 10)

  const rows = queryAll('SELECT date FROM checkins WHERE user_id = ? AND date >= ?', [userId, mondayStr])
  return rows.length
}

// ==================== 认证接口 ====================

// POST /api/register — 用户注册
app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return fail(res, '用户名和密码不能为空')
    }

    // 检查用户名是否已存在
    const existingUser = query('SELECT id FROM users WHERE username = ?', [username])
    if (existingUser) {
      return fail(res, '该用户名已被注册')
    }

    // 插入新用户
    run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password])

    // 获取刚插入的用户ID
    const newUser = query('SELECT id, username FROM users WHERE username = ?', [username])

    success(res, { user: { id: newUser.id, username: newUser.username } }, '注册成功')
  } catch (error) {
    console.error('注册 错误：', error)
    fail(res, '注册失败')
  }
})

// POST /api/login — 用户登录
app.post('/api/login', (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return fail(res, '用户名和密码不能为空')
    }

    // 查找用户
    const user = query(
      'SELECT id, username FROM users WHERE username = ? AND password = ?',
      [username, password]
    )

    if (!user) {
      return fail(res, '用户名或密码错误')
    }

    success(res, { user: { id: user.id, username: user.username } }, '登录成功')
  } catch (error) {
    console.error('登录 错误：', error)
    fail(res, '登录失败')
  }
})

// ==================== 任务接口 ====================

// GET /api/tasks — 获取当前用户所有任务（支持按分类筛选）
app.get('/api/tasks', (req, res) => {
  try {
    const { user_id, category } = req.query

    if (!user_id) {
      return fail(res, '缺少用户ID')
    }

    let sqlStr = 'SELECT * FROM tasks WHERE user_id = ?'
    const params = [user_id]

    // 如果指定了分类，添加筛选条件
    if (category && ['work', 'study', 'life'].includes(category)) {
      sqlStr += ' AND category = ?'
      params.push(category)
    }

    sqlStr += ' ORDER BY created_at DESC'

    const rows = queryAll(sqlStr, params)

    // 将 completed 字段从 0/1 转为 boolean
    const tasks = rows.map(t => ({
      ...t,
      completed: Boolean(t.completed)
    }))

    success(res, { tasks }, '获取成功')
  } catch (error) {
    console.error('获取任务列表 错误：', error)
    fail(res, '获取任务列表失败')
  }
})

// POST /api/tasks — 创建任务
app.post('/api/tasks', async (req, res) => {
  try {
    const { user_id, title, category, due_date } = req.body

    if (!user_id || !title) {
      return fail(res, '用户ID和任务标题不能为空')
    }

    const finalCategory = category && ['work', 'study', 'life'].includes(category)
      ? category
      : 'work'

    const finalDueDate = due_date || null

    await run(
      'INSERT INTO tasks (user_id, title, category, due_date) VALUES (?, ?, ?, ?)',
      [user_id, title, finalCategory, finalDueDate]
    )

    // 直接用输入参数构造返回数据
    success(res, {
      task: {
        user_id: parseInt(user_id),
        title,
        category: finalCategory,
        due_date: finalDueDate,
        completed: false
      }
    }, '创建成功')
  } catch (error) {
    console.error('创建任务 错误：', error)
    fail(res, '创建任务失败')
  }
})

// PUT /api/tasks/:id — 更新任务（完成状态/标题/分类/截止日期）
app.put('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { user_id, title, category, due_date, completed } = req.body

    if (!user_id) {
      return fail(res, '缺少用户ID')
    }

    // 先检查任务是否存在且属于当前用户
    const existingTask = query('SELECT * FROM tasks WHERE id = ? AND user_id = ?', [id, user_id])
    if (!existingTask) {
      return fail(res, '任务不存在')
    }

    // 构建更新字段
    const updates = []
    const params = []

    if (title !== undefined) { updates.push('title = ?'); params.push(title) }
    if (category !== undefined && ['work', 'study', 'life'].includes(category)) {
      updates.push('category = ?'); params.push(category)
    }
    if (due_date !== undefined) { updates.push('due_date = ?'); params.push(due_date) }
    if (completed !== undefined) { updates.push('completed = ?'); params.push(completed ? 1 : 0) }

    if (updates.length === 0) {
      return fail(res, '没有要更新的字段')
    }

    params.push(id)

    await run(`UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`, params)

    // 查询更新后的任务
    const updatedTask = query('SELECT * FROM tasks WHERE id = ?', [id])

    success(res, {
      task: { ...updatedTask, completed: Boolean(updatedTask.completed) }
    }, '更新成功')
  } catch (error) {
    console.error('更新任务 错误：', error)
    fail(res, '更新任务失败')
  }
})

// DELETE /api/tasks/:id — 删除任务
app.delete('/api/tasks/:id', async (req, res) => {
  try {
    const { id } = req.params
    const { user_id } = req.body

    if (!user_id) {
      return fail(res, '缺少用户ID')
    }

    // 先检查任务是否存在且属于当前用户
    const existingTask = query('SELECT id FROM tasks WHERE id = ? AND user_id = ?', [id, user_id])
    if (!existingTask) {
      return fail(res, '任务不存在')
    }

    await run('DELETE FROM tasks WHERE id = ?', [id])

    success(res, {}, '删除成功')
  } catch (error) {
    console.error('删除任务 错误：', error)
    fail(res, '删除任务失败')
  }
})

// ==================== 打卡接口 ====================

// POST /api/checkin — 今日打卡
app.post('/api/checkin', async (req, res) => {
  try {
    const { user_id } = req.body

    if (!user_id) {
      return fail(res, '缺少用户ID')
    }

    const today = new Date().toISOString().slice(0, 10)

    // 检查今日是否已打卡
    const existingCheckin = query(
      'SELECT id FROM checkins WHERE user_id = ? AND date = ?',
      [user_id, today]
    )
    if (existingCheckin) {
      return fail(res, '今日已打卡')
    }

    // 插入打卡记录
    await run('INSERT INTO checkins (user_id, date) VALUES (?, ?)', [user_id, today])

    // 直接用请求参数构造返回数据
    success(
      res,
      { checkin: { user_id: parseInt(user_id), date: today, created_at: new Date().toISOString() } },
      '打卡成功'
    )
  } catch (error) {
    console.error('打卡 错误：', error)
    fail(res, '打卡失败')
  }
})

// ==================== 统计接口 ====================

// GET /api/stats — 获取统计信息
app.get('/api/stats', async (req, res) => {
  try {
    const { user_id } = req.query

    if (!user_id) {
      return fail(res, '缺少用户ID')
    }

    const total = query('SELECT COUNT(*) as count FROM tasks WHERE user_id = ?', [user_id])
    const done = query('SELECT COUNT(*) as count FROM tasks WHERE user_id = ? AND completed = 1', [user_id])
    const todayCheck = await todayCheckedIn(user_id)
    const weekly = await weeklyCheckins(user_id)
    const streak = await longestStreak(user_id)

    res.json({
      success: true,
      data: {
        stats: {
          totalTasks: total.count,
          completedTasks: done.count,
          todayCheckedIn: todayCheck,
          weeklyCheckins: weekly,
          longestStreak: streak
        }
      },
      message: ''
    })
  } catch (err) {
    res.json({ success: false, message: err.message })
  }
})

// ==================== 启动服务 ====================

// 数据库初始化（Vercel 上在模块加载时触发，本地在 startServer 中 await）
require('./database').initDatabase().catch(err => console.error('数据库初始化失败：', err))

// 本地开发启动服务器，Vercel 上跳过（由平台托管）
if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000
  app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`)
  })
}

// Vercel 需要导出 Express app
module.exports = app
