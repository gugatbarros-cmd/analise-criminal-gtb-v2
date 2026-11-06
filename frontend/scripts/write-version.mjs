import { readFile, writeFile } from 'node:fs/promises'

const packageInfo = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'))
const backendPackage = await readFile(new URL('../../backend/pyproject.toml', import.meta.url), 'utf8')
const backendApi = await readFile(new URL('../../backend/src/gtb/api/main.py', import.meta.url), 'utf8')
const backendVersion = backendPackage.match(/^version = "([^"]+)"/m)?.[1]
const apiVersion = backendApi.match(/^APP_VERSION = "([^"]+)"/m)?.[1]
if (backendVersion !== packageInfo.version || apiVersion !== packageInfo.version)
  throw new Error(`Versões local e online divergentes: frontend ${packageInfo.version}, backend ${backendVersion}, API ${apiVersion}`)
await writeFile(new URL('../public/app-version.json', import.meta.url),
  JSON.stringify({ version: packageInfo.version, publishedAt: new Date().toISOString() }, null, 2) + '\n')
