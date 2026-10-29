// Ensaio do executável com navegador real e dados exclusivamente sintéticos.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const address = 'http://127.0.0.1:8000';
const occupied = await fetch(`${address}/health`).then(() => true, () => false);
assert.equal(occupied, false, 'Encerre a instância local antes deste teste isolado.');
const directory = path.join(root, 'data', `desktop-browser-${Date.now()}`);
fs.mkdirSync(directory, { recursive: true });
const csv = path.join(directory, 'synthetic.csv');
fs.writeFileSync(csv, 'Número da ocorrência,Data,Cidade,Natureza\nTEST-DESKTOP-1,05/01/2026,Igaci,Roubo consumado\n');
const executable = spawn(path.join(root, 'dist', 'GTB2-Local.exe'), [], {
  windowsHide: true, env: { ...process.env, GTB_DATA_DIR: path.join(directory, 'db'), GTB_NO_BROWSER: '1' }
});
let browser, socket;
const until = async (predicate, description) => {
  for (let i = 0; i < 100; i++) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  throw Error(`Tempo excedido: ${description}`);
};
try {
  await until(() => fetch(`${address}/health`).then(r => r.ok, () => false), 'servidor local');
  const health = await fetch(`${address}/health`).then(r => r.json());
  assert.equal(health.mode, 'setup');
  assert.equal(health.version, JSON.parse(fs.readFileSync(path.join(root, 'frontend/package.json'))).version);
  browser = spawn(process.env.GTB_TEST_BROWSER || 'C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0',
    `--user-data-dir=${path.join(directory, 'chrome')}`, 'about:blank'
  ], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
  const endpoint = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(Error('Chrome não iniciou')), 15000);
    let log = '';
    browser.once('error', error => { clearTimeout(timer); reject(error); });
    browser.stderr.on('data', chunk => {
      log += chunk;
      const found = log.match(/DevTools listening on (ws:\/\/\S+)/);
      if (found) { clearTimeout(timer); resolve(found[1]); }
    });
  });
  const pages = await fetch(`http://127.0.0.1:${new URL(endpoint).port}/json/list`).then(r => r.json());
  socket = new WebSocket(pages.find(item => item.type === 'page').webSocketDebuggerUrl);
  await new Promise(resolve => socket.addEventListener('open', resolve, { once: true }));
  let next = 0;
  const pending = new Map(), errors = [];
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails);
    if (!message.id) return;
    const task = pending.get(message.id);
    if (!task) return;
    clearTimeout(task.timer); pending.delete(message.id);
    if (message.error) task.reject(Error(message.error.message)); else task.resolve(message.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++next;
    const timer = setTimeout(() => { pending.delete(id); reject(Error(`CDP: ${method}`)); }, 10000);
    pending.set(id, { resolve, reject, timer }); socket.send(JSON.stringify({ id, method, params }));
  });
  const evaluate = async expression => {
    const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (result.exceptionDetails) throw Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const input = async (index, value) => {
    await evaluate(`document.querySelectorAll('form input')[${index}].focus()`);
    await send('Input.insertText', { text: value });
  };
  await send('Runtime.enable'); await send('Page.enable');
  await send('Page.navigate', { url: address });
  await until(() => evaluate(`document.querySelectorAll('form input').length === 3`), 'cadastro');
  await until(() => evaluate(`document.querySelector('img')?.naturalWidth > 0`), 'logomarca');
  await input(0, 'synthetic-admin'); await input(1, 'synthetic-password-123'); await input(2, 'synthetic-password-123');
  await evaluate(`document.querySelector('form').requestSubmit()`);
  await until(() => evaluate(`!!document.querySelector('.legacy-user')`), 'entrada após cadastro');
  await evaluate(`document.querySelector('.legacy-user button').click()`);
  await until(() => evaluate(`document.querySelectorAll('form input').length === 2`), 'saída');
  await input(0, 'synthetic-admin'); await input(1, 'synthetic-password-123');
  await evaluate(`document.querySelector('form').requestSubmit()`);
  await until(() => evaluate(`!!document.querySelector('.legacy-user')`), 'login');
  await evaluate(`const form=document.querySelector('input[type=file]').form;form.querySelector('select').value='ocorrencias';form.querySelector('select').dispatchEvent(new Event('change',{bubbles:true}));`);
  const { root: dom } = await send('DOM.getDocument');
  const { nodeId } = await send('DOM.querySelector', { nodeId: dom.nodeId, selector: 'input[type=file]' });
  await send('DOM.setFileInputFiles', { nodeId, files: [csv] });
  await evaluate(`document.querySelector('.import-actions button[type=button]').click()`);
  await until(() => evaluate(`document.querySelector('.import-actions button[type=submit]')?.disabled === false`), 'pré-validação');
  await evaluate(`document.querySelector('input[type=file]').form.requestSubmit()`);
  await until(() => evaluate(`document.querySelector('.two-col p.success')?.textContent.includes('Lote concluído')`), 'importação');
  await until(() => evaluate(`Array.from(document.querySelectorAll('#indicadores article')).some(el=>el.querySelector('span')?.textContent==='CVP'&&el.querySelector('strong')?.textContent==='1')`), 'CVP atualizado');
  await until(() => evaluate(`document.querySelector('[aria-label="Análise CVP"] .analysis-total strong')?.textContent === '1'`), 'gráfico CVP atualizado após importação');
  assert.equal(await evaluate(`Array.from(document.querySelectorAll('#indicadores article')).find(el=>el.querySelector('span')?.textContent==='Ocorrências')?.querySelector('strong')?.textContent`), '1');
  assert.ok(await evaluate(`document.querySelectorAll('.legacy-series-chart polyline').length > 0`));
  const cards = await evaluate(`Array.from(document.querySelectorAll('[data-indicator-target]')).map(el=>({target:el.dataset.indicatorTarget,label:el.getAttribute('aria-label')}))`);
  assert.equal(cards.length, 13);
  for (const { target, label } of cards) {
    await evaluate(`Array.from(document.querySelectorAll('[data-indicator-target]')).find(el=>el.getAttribute('aria-label')===${JSON.stringify(label)}).click()`);
    await until(() => evaluate(`location.hash===${JSON.stringify('#' + target)} && document.activeElement?.id===${JSON.stringify(target)}`), `destino ${target}`);
    assert.equal(await evaluate(`document.querySelector('[aria-label="Filtros de indicadores"] input[type=number]').value`), '2026');
    if (target === 'mvi-cad' || target === 'mvi-neac') {
      assert.equal(await evaluate(`document.querySelector('[aria-label="Fonte MVI"] [aria-selected=true]').textContent`), target === 'mvi-cad' ? 'MVI CAD' : 'MVI NEAC');
      assert.equal(await evaluate(`document.querySelector('.legacy-header h1').textContent`), target === 'mvi-cad' ? 'MVI CAD' : 'MVI NEAC');
    }
  }
  await evaluate(`document.querySelector('[data-indicator-target="tco"]').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Enter', code: 'Enter', text: '\r', unmodifiedText: '\r', windowsVirtualKeyCode: 13 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13 });
  await until(() => evaluate(`location.hash==='#tco' && document.activeElement?.id==='tco'`), 'navegação por Enter');
  await evaluate(`document.querySelector('[data-indicator-target="sossego"]').focus()`);
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key: ' ', code: 'Space', text: ' ', unmodifiedText: ' ', windowsVirtualKeyCode: 32 });
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32 });
  await until(() => evaluate(`location.hash==='#sossego'`), 'navegação por Espaço');
  await evaluate(`history.back()`);
  await until(() => evaluate(`location.hash==='#tco' && document.querySelector('.legacy-header h1').textContent==='Avaliação TCO'`), 'voltar à análise anterior');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1050, deviceScaleFactor: 1, mobile: false });
  fs.writeFileSync(path.join(directory, 'dashboard-desktop.png'), Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'));
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, screenWidth: 390, screenHeight: 844, deviceScaleFactor: 1, mobile: true });
  await send('Page.reload');
  await until(() => evaluate(`!!document.querySelector('.legacy-user')`), 'sessão preservada ao reabrir no celular');
  await new Promise(resolve => setTimeout(resolve, 350));
  assert.ok(await evaluate(`document.documentElement.scrollWidth <= innerWidth + 1`), 'Layout não pode exigir rolagem horizontal no celular');
  assert.deepEqual(errors, []);
  console.log(`Executável ${health.version}: cadastro, login, importação, CVP, 13 quadros, fontes CAD/NEAC, filtros, Enter, Espaço, Voltar e celular aprovados no navegador real.`);
} finally {
  socket?.close();
  for (const child of [browser, executable]) if (child?.pid && child.exitCode === null) {
    try { execFileSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { stdio: 'ignore' }); } catch {}
  }
}
