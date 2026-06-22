const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const publicDir = path.join(root, 'public')

fs.rmSync(publicDir, { recursive: true, force: true })
fs.mkdirSync(publicDir, { recursive: true })
fs.copyFileSync(
  path.join(root, 'frontend', 'index.html'),
  path.join(publicDir, 'index.html')
)

console.log('Copied frontend/index.html to public/index.html')
