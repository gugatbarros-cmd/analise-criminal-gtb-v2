import fs from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const write = (file, value) => fs.writeFileSync(path.join(root, file), value);
const currentHead = git('rev-parse', 'HEAD');
if (currentHead !== git('rev-parse', 'origin/main')) {
  throw new Error('Atualize esta cópia a partir de origin/main antes de publicar.');
}
if (!git('status', '--porcelain=v1', '--untracked-files=normal')) {
  console.log('Nenhuma alteração detectada.');
  process.exit(0);
}

const previous = JSON.parse(git('show', 'HEAD:frontend/package.json')).version;
const packageFile = 'frontend/package.json';
const packageData = JSON.parse(read(packageFile));
const parts = version => {
  if (!/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`Versão inválida: ${version}`);
  return version.split('.').map(Number);
};
const oldParts = parts(previous);
const currentParts = parts(packageData.version);
const minimum = `${oldParts[0]}.${oldParts[1]}.${oldParts[2] + 1}`;
const version = currentParts.some((value, index) => value !== oldParts[index]) &&
  (currentParts[0] > oldParts[0] ||
   (currentParts[0] === oldParts[0] && currentParts[1] > oldParts[1]) ||
   (currentParts[0] === oldParts[0] && currentParts[1] === oldParts[1] && currentParts[2] > oldParts[2]))
  ? packageData.version : minimum;

packageData.version = version;
write(packageFile, `${JSON.stringify(packageData, null, 2)}\n`);
const lockFile = 'frontend/package-lock.json';
const lock = JSON.parse(read(lockFile));
lock.version = version;
lock.packages[''].version = version;
write(lockFile, `${JSON.stringify(lock, null, 2)}\n`);

for (const [file, pattern] of [
  ['backend/pyproject.toml', /^(version = ")[^"]+("\s*)$/m],
  ['backend/src/gtb/api/main.py', /^(APP_VERSION = ")[^"]+("\s*)$/m],
]) {
  const source = read(file);
  if (!pattern.test(source)) throw new Error(`Versão ausente em ${file}`);
  write(file, source.replace(pattern, (_match, before, after) => `${before}${version}${after}`));
}
const manifest = JSON.parse(read('frontend/public/app-version.json'));
manifest.version = version;
manifest.publishedAt = new Date().toISOString();
write('frontend/public/app-version.json', `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Alterações detectadas. Versão do GTB 2.0: ${version}.`);
