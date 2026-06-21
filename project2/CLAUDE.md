# 个人学习打卡系统

## 项目简介

一个帮助用户记录和管理每日任务、通过打卡机制培养持续学习习惯的全栈 Web 应用。后端使用 Node.js + Express + SQLite，前端为单文件 HTML。

## 技术栈清单

- **后端**：Node.js + Express + sqlite3
- **前端**：纯 HTML + CSS + JavaScript（单文件 index.html）
- **数据库**：SQLite3
- **部署**：后端 Render，前端 Vercel

## 项目目录结构

```
project2/
├── CLAUDE.md              # 项目规范文档（本文件）
├── backend/
│   ├── database.js        # SQLite 数据库初始化及连接管理
│   └── server.js          # Express 后端服务，所有 API 路由
├── frontend/
│   └── index.html         # 前端单文件（含 HTML + CSS + JS）
└── README.md              # 项目说明文档
```

## 编码规范

1. **缩进**：2 个空格，不使用 tab
2. **命名规范**：
   - JavaScript 变量/函数：`camelCase`（如 `getUserTasks`、`todayCheckedIn`）
   - 文件名：`kebab-case`（如 `database.js`、`index.html`）
   - CSS 类名：`kebab-case`（如 `stat-card`、`task-list`）
   - SQL 字段名：`snake_case`（如 `user_id`、`created_at`）
3. **注释**：所有 API 接口及关键逻辑添加中文注释
4. **字符串**：JavaScript 中字符串使用单引号 `'`

## API 响应格式规范

所有 API 统一使用以下 JSON 响应格式：

```json
{
  "success": true,
  "data": {},
  "message": ""
}
```

- `success`：布尔值，请求是否成功
- `data`：响应数据对象，失败时可为 `{}` 或 `null`
- `message`：提示信息，成功时可为空字符串，失败时描述错误原因

## 错误处理规范

1. **所有异步操作必须使用 try-catch 包裹**
2. catch 块中返回统一响应格式：`success: false`，`message` 描述错误原因
3. 后端日志使用 `console.error()` 记录详细错误信息，不暴露敏感信息给前端
4. 前端 API 调用失败时使用 `alert()` 提示用户错误信息

示例（后端）：
```javascript
try {
  // 业务逻辑
  res.json({ success: true, data: result, message: '' })
} catch (error) {
  console.error('接口名 错误：', error)
  res.json({ success: false, data: {}, message: '操作失败' })
}
```

示例（前端）：
```javascript
try {
  const res = await fetch(`${BASE_URL}/xxx`)
  const json = await res.json()
  if (!json.success) {
    alert(json.message)
    return
  }
  // 处理成功数据
} catch (error) {
  alert('网络请求失败')
}
```

## 数据库操作规范

1. **所有 SQL 查询必须使用参数化查询（? 占位符）**，禁止字符串拼接防止 SQL 注入
2. 数据库连接在 `database.js` 中统一管理，导出连接对象
3. 表创建使用 `CREATE TABLE IF NOT EXISTS`
4. 日期字段统一使用 `TEXT` 类型，格式 `YYYY-MM-DD`

示例（参数化查询）：
```javascript
// 正确：使用 ? 占位符
db.run('INSERT INTO users (username, password) VALUES (?, ?)', [username, password])

// 错误：禁止字符串拼接
db.run(`INSERT INTO users (username, password) VALUES ('${username}', '${password}')`)
```

## 其他约定

- 后端端口：`3000`
- API 路径前缀：`/api`
- 前端 API base URL 变量：`const BASE_URL = 'http://localhost:3000/api'`
- 登录状态持久化：`localStorage` 存储 `user_id` 和 `username`
- 密码在 MVP 阶段明文存储，生产环境需加密
