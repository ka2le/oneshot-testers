import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { resolve } from 'node:path'

const root = resolve(import.meta.dirname, '..')
const distDir = resolve(root, 'dist')
const gamesDir = resolve(root, 'games')
const distGamesDir = resolve(distDir, 'games')

function run(command) {
  execSync(command, {
    cwd: root,
    stdio: 'inherit',
  })
}

run('npm run build')

if (!existsSync(gamesDir)) {
  throw new Error('games directory not found')
}

rmSync(distGamesDir, { recursive: true, force: true })
mkdirSync(distGamesDir, { recursive: true })
cpSync(gamesDir, distGamesDir, { recursive: true })

run('npx gh-pages -d dist')
