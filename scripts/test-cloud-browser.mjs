// Teste do site compilado: Firebase simulado, dados exclusivamente sintéticos.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import http from 'node:http'
import { spawn, execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const web = path.join(root, 'data/cloud-web')
const directory = path.join(root, 'data', `cloud-browser-${Date.now()}`)
fs.mkdirSync(directory, { recursive: true })
const snapshot = JSON.parse(fs.readFileSync(path.join(root, 'frontend/public/demo-data.json')))
snapshot.syncedAt = '2026-10-29T12:00:00Z'
let revision = 'a'.repeat(32), reads = 0
const expected = String(snapshot.views['2026|*'].summary.cvp)
const pack = () => gzipSync(JSON.stringify(snapshot)).toString('base64')
let content = pack()
const server = http.createServer((req, res) => {
  const pathname = new URL(req.url, 'http://localhost').pathname.replace(/^\/analise-criminal-gtb-v2\//, '')
  const filename = path.resolve(web, pathname || 'index.html')
  if (!filename.startsWith(web + path.sep) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) { res.writeHead(404); res.end(); return }
  const type = { '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html', '.json': 'application/json', '.png': 'image/png' }[path.extname(filename)] || 'application/octet-stream'
  res.writeHead(200, { 'Content-Type': type }); res.end(fs.readFileSync(filename))
})
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
const address = `http://127.0.0.1:${server.address().port}/analise-criminal-gtb-v2/`
const browser = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
  '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
  `--user-data-dir=${path.join(directory, 'chrome')}`, 'about:blank',
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
let socket
try {
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Chrome não iniciou')), 20000)
    let log = ''
    browser.stderr.on('data', chunk => { log += chunk; const found = log.match(/DevTools listening on (ws:\/\/\S+)/); if (found) { clearTimeout(timer); resolve(found[1]) } })
    browser.once('error', reject)
  })
  const pages = await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`).then(r => r.json())
  socket = new WebSocket(pages.find(p => p.type === 'page').webSocketDebuggerUrl)
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }))
  let next = 0
  const pending = new Map(), errors = []
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next
    const timer = setTimeout(() => { pending.delete(id); reject(Error('CDP: ' + method)) }, 15000)
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }))
  })
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data)
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails)
    if (message.method === 'Fetch.requestPaused') void (async () => {
      const { requestId, request } = message.params
      let value = {}, code = 200
      if (request.method !== 'OPTIONS') {
        if (request.url.includes('signInWithPassword')) value = { idToken: 'synthetic-browser-token', refreshToken: 'synthetic-refresh', email: 'gugatbarros@hotmail.com', localId: 'synthetic-user', expiresIn: '3600' }
        else if (request.url.includes('firestore.googleapis.com')) {
          if (request.headers.Authorization !== 'Bearer synthetic-browser-token') { code = 403; value = {} }
          else if (request.url.includes('/chunks/')) value = { fields: { generation: { stringValue: 'gtb2-' + revision }, index: { integerValue: '0' }, content: { stringValue: content } } }
          else { reads++; value = { fields: { generation: { stringValue: 'gtb2-' + revision }, chunkCount: { integerValue: '1' }, chunkHashes: { arrayValue: { values: [{ stringValue: createHash('sha256').update(content).digest('hex') }] } } } } }
        } else { code = 403 }
      }
      await send('Fetch.fulfillRequest', { requestId, responseCode: code, responseHeaders: [
        { name: 'Content-Type', value: 'application/json' }, { name: 'Access-Control-Allow-Origin', value: '*' },
        { name: 'Access-Control-Allow-Headers', value: 'authorization,content-type' }, { name: 'Access-Control-Allow-Methods', value: 'GET,POST,OPTIONS' },
      ], body: Buffer.from(JSON.stringify(value)).toString('base64') })
    })().catch(error => errors.push(String(error)))
    const task = pending.get(message.id)
    if (!task) return
    clearTimeout(task.timer); pending.delete(message.id)
    if (message.error) task.reject(Error(message.error.message)); else task.resolve(message.result)
  })
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (result.exceptionDetails) throw Error(result.exceptionDetails.text)
    return result.result.value
  }
  const until = async (predicate, label) => {
    for (let attempt = 0; attempt < 120; attempt++) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 250)) }
    throw Error('Tempo excedido: ' + label)
  }
  const total = () => evaluate(`Array.from(document.querySelectorAll('#indicadores article')).find(el=>el.querySelector('span')?.textContent==='CVP')?.querySelector('strong')?.textContent`)
  await send('Runtime.enable'); await send('Page.enable')
  await send('Fetch.enable', { patterns: [{ urlPattern: 'https://*.googleapis.com/*' }] })
  await send('Page.navigate', { url: address })
  await until(() => evaluate(`!!document.querySelector('input[type=email]')`), 'login online')
  assert.equal(reads, 0, 'nenhuma base deve ser lida antes do login')
  for (const [selector, text] of [['input[type=email]', 'gugatbarros@hotmail.com'], ['input[type=password]', 'synthetic-password-only']]) {
    await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
    await send('Input.insertText', { text })
  }
  await evaluate(`document.querySelector('form').requestSubmit()`)
  await until(async () => await total() === expected, 'indicadores autenticados')
  assert.ok(await evaluate(`document.body.textContent.includes('Ambiente online')`))
  snapshot.views['2026|*'].summary.cvp += 7
  snapshot.syncedAt = '2026-10-29T13:00:00Z'
  revision = 'b'.repeat(32); content = pack()
  await evaluate(`Array.from(document.querySelectorAll('button')).find(el=>el.textContent==='Atualizar consulta').click()`)
  await until(async () => await total() === String(Number(expected) + 7), 'nova geração após importação')
  await send('Page.reload')
  await until(async () => await total() === String(Number(expected) + 7), 'sessão preservada ao recarregar')
  await evaluate(`document.querySelector('.legacy-user button').click()`)
  await until(() => evaluate(`!!document.querySelector('input[type=email]')`), 'saída da conta online')
  assert.equal(await evaluate(`sessionStorage.getItem('gtb-online-session')`), null)
  assert.deepEqual(errors, [])
  console.log('Site compilado: login protegido, bloqueio antes de autenticar, dados sincronizados, nova geração, recarga e logout aprovados com Firebase simulado.')
} finally {
  socket?.close(); server.close()
  if (browser?.pid && browser.exitCode === null) try { execFileSync('taskkill', ['/PID', String(browser.pid), '/T', '/F'], { stdio: 'ignore' }) } catch {}
}
