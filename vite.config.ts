import os from 'node:os'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import {
  defineConfig,
  loadEnv,
  type Plugin,
  type PreviewServer,
  type ProxyOptions,
  type ViteDevServer,
} from 'vite'
import { createLisAuthPlugin } from './lisAuthPlugin'

const PORT = 4521
const ENV = loadEnv(process.env.MODE || 'development', process.cwd(), '')
const env = (key: string, fallback = '') =>
  (process.env[key] || ENV[key] || fallback).trim()

/** Основной адрес сервера в сети — приложение должно открываться по нему. */
const PREFERRED_LAN_IP = env('FC_LAN_IP', env('VITE_LAN_IP', '10.221.0.212'))
/** Рабочая платформа ФЦ БАС (генератор тестов / кабинет / конвертер). */
const GENERATOR_ORIGIN = env(
  'FC_GENERATOR_URL',
  'http://45.38.3.49:8080',
).replace(/\/$/, '')
const GENERATOR_LOGIN = env('FC_GENERATOR_LOGIN', 'мдн')
const GENERATOR_PASSWORD = env('FC_GENERATOR_PASSWORD', '15012004')
const GENERATOR_ADMIN_LOGIN = env('FC_GENERATOR_ADMIN_LOGIN', 'admin')
const GENERATOR_ADMIN_PASSWORD = env('FC_GENERATOR_ADMIN_PASSWORD', 'admin')

const lisProxyCommon: Omit<ProxyOptions, 'target'> = {
  changeOrigin: true,
  secure: false,
  cookieDomainRewrite: '',
}

/** Прокси путей ЛИС на тот же origin, что и SPA — общие localStorage/cookies. */
const generatorProxy: Record<string, ProxyOptions> = {
  '/fc-platform': {
    target: GENERATOR_ORIGIN,
    ...lisProxyCommon,
    rewrite: (path: string) => path.replace(/^\/fc-platform/, '') || '/',
  },
  '/api': { target: GENERATOR_ORIGIN, ...lisProxyCommon },
  '/static': { target: GENERATOR_ORIGIN, ...lisProxyCommon },
  '/tools': { target: GENERATOR_ORIGIN, ...lisProxyCommon },
  '/admin': { target: GENERATOR_ORIGIN, ...lisProxyCommon },
  '/login': { target: GENERATOR_ORIGIN, ...lisProxyCommon },
  '/t': { target: GENERATOR_ORIGIN, ...lisProxyCommon },
  '/docs': { target: GENERATOR_ORIGIN, ...lisProxyCommon },
  '/redoc': { target: GENERATOR_ORIGIN, ...lisProxyCommon },
  '/openapi.json': { target: GENERATOR_ORIGIN, ...lisProxyCommon },
}

function lanIpv4Addresses(): string[] {
  const found: string[] = []
  const ifaces = os.networkInterfaces()
  for (const list of Object.values(ifaces)) {
    if (!list) continue
    for (const net of list) {
      if (net.family !== 'IPv4' || net.internal) continue
      found.push(net.address)
    }
  }
  const set = new Set(found)
  if (PREFERRED_LAN_IP) set.add(PREFERRED_LAN_IP)
  return [...set].sort((a, b) => {
    if (a === PREFERRED_LAN_IP) return -1
    if (b === PREFERRED_LAN_IP) return 1
    const rank = (ip: string) =>
      ip.startsWith('192.168.') ? 0 : ip.startsWith('10.') ? 1 : 2
    return rank(a) - rank(b) || a.localeCompare(b)
  })
}

function attachLanUrlsEndpoint(server: ViteDevServer | PreviewServer): void {
  server.middlewares.use('/lan-urls.json', (_req, res) => {
    const port = PORT
    const ips = lanIpv4Addresses()
    const urls = ips.map((ip) => `http://${ip}:${port}`)
    const preferred = `http://${PREFERRED_LAN_IP}:${port}`
    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Cache-Control', 'no-store')
    res.end(
      JSON.stringify(
        {
          port,
          preferredIp: PREFERRED_LAN_IP,
          preferredUrl: preferred,
          ips,
          urls,
        },
        null,
        2,
      ),
    )
  })
}

function lanUrlsPlugin(): Plugin {
  return {
    name: 'fc-imperiya-lan-urls',
    configureServer(server) {
      attachLanUrlsEndpoint(server)
      const preferred = `http://${PREFERRED_LAN_IP}:${PORT}`
      const urls = lanIpv4Addresses().map((ip) => `http://${ip}:${PORT}`)
      server.config.logger.info(
        `\n  Доступ по локальному IP сервера:\n  →  ${preferred}\n` +
          (urls.length > 1
            ? `  Другие интерфейсы:\n${urls
                .filter((u) => u !== preferred)
                .map((u) => `  →  ${u}`)
                .join('\n')}\n`
            : ''),
      )
      server.config.logger.info(
        `  Генератор (ЛИС): ${GENERATOR_ORIGIN} · SSO по паролю Империи БАС\n`,
      )
    },
    configurePreviewServer(server) {
      attachLanUrlsEndpoint(server)
    },
  }
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    lanUrlsPlugin(),
    createLisAuthPlugin({
      origin: GENERATOR_ORIGIN,
      adminLogin: GENERATOR_ADMIN_LOGIN,
      adminPassword: GENERATOR_ADMIN_PASSWORD,
      fallbackLogin: GENERATOR_LOGIN,
      fallbackPassword: GENERATOR_PASSWORD,
    }),
  ],
  server: {
    host: true,
    port: PORT,
    strictPort: true,
    allowedHosts: true,
    hmr: {
      host: PREFERRED_LAN_IP,
      port: PORT,
      clientPort: PORT,
    },
    proxy: { ...generatorProxy },
  },
  preview: {
    host: true,
    port: PORT,
    strictPort: true,
    allowedHosts: true,
    proxy: { ...generatorProxy },
  },
})
