const express = require('express')
const cors = require('cors')
const { initDatabase, query, queryAll, run } = require('./database')

const app = express()
const api = express.Router()

app.use(cors())
app.use(express.json())

function success(res, data = {}, message = '') {
  res.json({ success: true, data, message })
}

function fail(res, message = '操作失败', status = 200) {
  res.status(status).json({ success: false, data: {}, message })
}

function toUserId(value) {
  const userId = Number.parseInt(value, 10)
  return Number.isInteger(userId) && userId > 0 ? userId : null
}

function todayInShanghai() {
  const shanghaiOffsetMs = 8 * 60 * 60 * 1000
  return new Date(Date.now() + shanghaiOffsetMs).toISOString().slice(0, 10)
}

async function longestStreak(userId) {
  const rows = await queryAll(
    'SELECT date FROM checkins WHERE user_id = $1 ORDER BY date ASC',
    [userId]
  )

  if (!rows.length) return 0

  const dates = rows.map(row => new Date(row.date).toISOString().slice(0, 10))
  let longest = 1
  let current = 1

  for (let i = 1; i < dates.length; i++) {
    const previous = new Date(`${dates[i - 1]}T00:00:00Z`)
    const next = new Date(`${dates[i]}T00:00:00Z`)
    const diffDays = (next - previous) / (1000 * 60 * 60 * 24)

    if (diffDays === 1) {
      current += 1
      longest = Math.max(longest, current)
    } else {
      current = 1
    }
  }

  return longest
}

async function todayCheckedIn(userId) {
  const row = await query(
    'SELECT id FROM checkins WHERE user_id = $1 AND date = $2',
    [userId, todayInShanghai()]
  )
  return Boolean(row)
}

async function weeklyCheckins(userId) {
  const now = new Date(Date.now() + 8 * 60 * 60 * 1000)
  const dayOfWeek = now.getUTCDay()
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek
  now.setUTCDate(now.getUTCDate() + diffToMonday)
  const monday = now.toISOString().slice(0, 10)

  const rows = await queryAll(
    'SELECT id FROM checkins WHERE user_id = $1 AND date >= $2',
    [userId, monday]
  )
  return rows.length
}

api.get('/health', async (req, res) => {
  try {
    await initDatabase()
    success(res, { ok: true }, 'OK')
  } catch (error) {
    console.error('health check error:', error)
    fail(res, '数据库连接失败', 500)
  }
})

api.post('/register', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return fail(res, '用户名和密码不能为空')
    }

    const existingUser = await query(
      'SELECT id FROM users WHERE username = $1',
      [username]
    )
    if (existingUser) {
      return fail(res, '该用户名已被注册')
    }

    const createdUser = await query(
      'INSERT INTO users (username, password) VALUES ($1, $2) RETURNING id, username',
      [username, password]
    )

    success(res, { user: createdUser }, '注册成功')
  } catch (error) {
    console.error('register error:', error)
    fail(res, '注册失败')
  }
})

api.post('/login', async (req, res) => {
  try {
    const { username, password } = req.body

    if (!username || !password) {
      return fail(res, '用户名和密码不能为空')
    }

    const user = await query(
      'SELECT id, username FROM users WHERE username = $1 AND password = $2',
      [username, password]
    )

    if (!user) {
      return fail(res, '用户名或密码错误')
    }

    success(res, { user }, '登录成功')
  } catch (error) {
    console.error('login error:', error)
    fail(res, '登录失败')
  }
})

api.get('/tasks', async (req, res) => {
  try {
    const userId = toUserId(req.query.user_id)
    const { category } = req.query

    if (!userId) {
      return fail(res, '缺少用户ID')
    }

    const params = [userId]
    let sqlText = 'SELECT * FROM tasks WHERE user_id = $1'

    if (category && ['work', 'study', 'life'].includes(category)) {
      params.push(category)
      sqlText += ` AND category = $${params.length}`
    }

    sqlText += ' ORDER BY created_at DESC'

    const tasks = await queryAll(sqlText, params)
    success(res, { tasks }, '获取成功')
  } catch (error) {
    console.error('list tasks error:', error)
    fail(res, '获取任务列表失败')
  }
})

api.post('/tasks', async (req, res) => {
  try {
    const userId = toUserId(req.body.user_id)
    const { title, category, due_date: dueDate } = req.body

    if (!userId || !title) {
      return fail(res, '用户ID和任务标题不能为空')
    }

    const finalCategory = ['work', 'study', 'life'].includes(category) ? category : 'work'
    const finalDueDate = dueDate || null

    const task = await query(
      `INSERT INTO tasks (user_id, title, category, due_date)
       VALUES ($1, $2, $3, $4)
       RETURNING *`,
      [userId, title, finalCategory, finalDueDate]
    )

    success(res, { task }, '创建成功')
  } catch (error) {
    console.error('create task error:', error)
    fail(res, '创建任务失败')
  }
})

api.put('/tasks/:id', async (req, res) => {
  try {
    const taskId = Number.parseInt(req.params.id, 10)
    const userId = toUserId(req.body.user_id)
    const { title, category, due_date: dueDate, completed } = req.body

    if (!taskId || !userId) {
      return fail(res, '缺少任务ID或用户ID')
    }

    const updates = []
    const params = []

    if (title !== undefined) {
      params.push(title)
      updates.push(`title = $${params.length}`)
    }
    if (category !== undefined && ['work', 'study', 'life'].includes(category)) {
      params.push(category)
      updates.push(`category = $${params.length}`)
    }
    if (dueDate !== undefined) {
      params.push(dueDate || null)
      updates.push(`due_date = $${params.length}`)
    }
    if (completed !== undefined) {
      params.push(Boolean(completed))
      updates.push(`completed = $${params.length}`)
    }

    if (!updates.length) {
      return fail(res, '没有要更新的字段')
    }

    params.push(taskId)
    const taskIdParam = `$${params.length}`
    params.push(userId)
    const userIdParam = `$${params.length}`

    const task = await query(
      `UPDATE tasks
       SET ${updates.join(', ')}
       WHERE id = ${taskIdParam} AND user_id = ${userIdParam}
       RETURNING *`,
      params
    )

    if (!task) {
      return fail(res, '任务不存在')
    }

    success(res, { task }, '更新成功')
  } catch (error) {
    console.error('update task error:', error)
    fail(res, '更新任务失败')
  }
})

api.delete('/tasks/:id', async (req, res) => {
  try {
    const taskId = Number.parseInt(req.params.id, 10)
    const userId = toUserId(req.body.user_id)

    if (!taskId || !userId) {
      return fail(res, '缺少任务ID或用户ID')
    }

    const result = await run(
      'DELETE FROM tasks WHERE id = $1 AND user_id = $2',
      [taskId, userId]
    )

    if (!result.rowCount) {
      return fail(res, '任务不存在')
    }

    success(res, {}, '删除成功')
  } catch (error) {
    console.error('delete task error:', error)
    fail(res, '删除任务失败')
  }
})

api.post('/checkin', async (req, res) => {
  try {
    const userId = toUserId(req.body.user_id)

    if (!userId) {
      return fail(res, '缺少用户ID')
    }

    const today = todayInShanghai()
    const existingCheckin = await query(
      'SELECT id FROM checkins WHERE user_id = $1 AND date = $2',
      [userId, today]
    )

    if (existingCheckin) {
      return fail(res, '今日已打卡')
    }

    const checkin = await query(
      'INSERT INTO checkins (user_id, date) VALUES ($1, $2) RETURNING *',
      [userId, today]
    )

    success(res, { checkin }, '打卡成功')
  } catch (error) {
    console.error('checkin error:', error)
    fail(res, '打卡失败')
  }
})

api.get('/stats', async (req, res) => {
  try {
    const userId = toUserId(req.query.user_id)

    if (!userId) {
      return fail(res, '缺少用户ID')
    }

    const total = await query('SELECT COUNT(*) AS count FROM tasks WHERE user_id = $1', [userId])
    const done = await query(
      'SELECT COUNT(*) AS count FROM tasks WHERE user_id = $1 AND completed = TRUE',
      [userId]
    )

    success(res, {
      stats: {
        totalTasks: Number(total.count),
        completedTasks: Number(done.count),
        todayCheckedIn: await todayCheckedIn(userId),
        weeklyCheckins: await weeklyCheckins(userId),
        longestStreak: await longestStreak(userId)
      }
    })
  } catch (error) {
    console.error('stats error:', error)
    fail(res, '获取统计信息失败')
  }
})

app.use('/api', api)
app.use('/', api)

if (!process.env.VERCEL) {
  const port = process.env.PORT || 3000
  initDatabase()
    .then(() => {
      app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`)
      })
    })
    .catch(error => {
      console.error('database init error:', error)
      process.exit(1)
    })
}

module.exports = app
