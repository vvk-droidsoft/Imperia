import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Connect, Plugin, PreviewServer, ViteDevServer } from 'vite'

const LIS_DEPT_17 = 'e32eacb9be704057b647e5816a6f81be'

type LisUser = {
  id: string
  login: string
  role: string
  department_id?: string | null
  display_name?: string
  staff_fio?: string
  active?: boolean
  password?: string
}

type RosterMember = {
  login: string
  password: string
  role: string
  displayName: string
  lisLoginHint?: string
}

function normFio(s: string): string {
  return s
    .toLocaleLowerCase('ru-RU')
    .replace(/ё/g, 'е')
    .replace(/(.)\1+/g, '$1')
    .replace(/[^a-zа-я0-9]+/gi, '')
}

async function readJson(
  req: IncomingMessage,
): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as Record<string, unknown>
}

function sendJson(
  res: ServerResponse,
  status: number,
  body: unknown,
  cookieToken?: string,
): void {
  res.statusCode = status
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  if (cookieToken) {
    res.setHeader(
      'Set-Cookie',
      `lis_session=${cookieToken}; Path=/; Max-Age=2592000; SameSite=Lax; HttpOnly`,
    )
  }
  res.end(JSON.stringify(body))
}

export function createLisAuthPlugin(opts: {
  origin: string
  adminLogin: string
  adminPassword: string
  fallbackLogin: string
  fallbackPassword: string
}): Plugin {
  const {
    origin,
    adminLogin,
    adminPassword,
    fallbackLogin,
    fallbackPassword,
  } = opts

  async function lisFetch(
    path: string,
    init: RequestInit & { token?: string } = {},
  ): Promise<{ ok: boolean; status: number; data: any; token?: string }> {
    const headers = new Headers(init.headers || {})
    if (init.token) headers.set('Authorization', `Bearer ${init.token}`)
    if (init.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json; charset=utf-8')
    }
    const r = await fetch(`${origin}${path}`, { ...init, headers })
    const setCookie = r.headers.get('set-cookie') || ''
    const m = /lis_session=([^;]+)/i.exec(setCookie)
    const data = await r.json().catch(() => ({}))
    return {
      ok: r.ok,
      status: r.status,
      data,
      token: m?.[1] || (data as { token?: string }).token,
    }
  }

  async function adminLoginToken(): Promise<string> {
    const r = await lisFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ login: adminLogin, password: adminPassword }),
    })
    if (!r.ok || !r.token) {
      throw new Error(
        typeof r.data?.detail === 'string'
          ? r.data.detail
          : `Админ ЛИС: HTTP ${r.status}`,
      )
    }
    return r.token
  }

  async function listUsers(adminToken: string): Promise<LisUser[]> {
    const r = await lisFetch('/api/admin/users', { token: adminToken })
    if (!r.ok) throw new Error('Не удалось получить список учёток ЛИС')
    const list = Array.isArray(r.data) ? r.data : r.data?.users || []
    return list as LisUser[]
  }

  function findUser(
    users: LisUser[],
    member: RosterMember,
  ): LisUser | undefined {
    const hint = (member.lisLoginHint || '').trim()
    if (hint) {
      const byHint = users.find(
        (u) => u.login.toLocaleLowerCase('ru-RU') === hint.toLocaleLowerCase('ru-RU'),
      )
      if (byHint) return byHint
    }
    const byLogin = users.find(
      (u) =>
        u.login.toLocaleLowerCase('ru-RU') ===
        member.login.toLocaleLowerCase('ru-RU'),
    )
    if (byLogin) return byLogin

    const want = normFio(member.displayName)
    if (!want) return undefined
    return users.find((u) => {
      const sameDept =
        !u.department_id ||
        u.department_id === LIS_DEPT_17 ||
        member.role === 'senior'
      if (!sameDept && u.department_id) return false
      const fio = normFio(u.staff_fio || u.display_name || '')
      return !!fio && fio === want
    })
  }

  async function upsertMember(
    adminToken: string,
    users: LisUser[],
    member: RosterMember,
  ): Promise<{ user: LisUser; created: boolean; login: string }> {
    const existing = findUser(users, member)
    const password = member.password || '1234'
    const role = member.role || 'instructor'

    if (existing) {
      await lisFetch(`/api/admin/users/${existing.id}`, {
        method: 'PUT',
        token: adminToken,
        body: JSON.stringify({
          login: existing.login,
          display_name: member.displayName || existing.display_name || '',
          role,
          department_id: existing.department_id || LIS_DEPT_17,
          password,
          must_change_password: false,
        }),
      })
      await lisFetch(`/api/admin/users/${existing.id}/password`, {
        method: 'POST',
        token: adminToken,
        body: JSON.stringify({
          password,
          must_change_password: false,
        }),
      })
      if (existing.active === false) {
        await lisFetch(`/api/admin/users/${existing.id}/active`, {
          method: 'POST',
          token: adminToken,
          body: JSON.stringify({ active: true }),
        })
      }
      return { user: existing, created: false, login: existing.login }
    }

    const createLogin = (member.lisLoginHint || member.login).trim()
    const created = await lisFetch('/api/admin/users', {
      method: 'POST',
      token: adminToken,
      body: JSON.stringify({
        login: createLogin,
        password,
        role,
        department_id: LIS_DEPT_17,
        display_name: member.displayName,
        must_change_password: false,
      }),
    })
    if (!created.ok) {
      throw new Error(
        typeof created.data?.detail === 'string'
          ? created.data.detail
          : `Не удалось создать ${createLogin}`,
      )
    }
    const user = (created.data?.user || created.data) as LisUser
    users.push(user)
    return { user, created: true, login: user.login || createLogin }
  }

  async function loginAs(
    login: string,
    password: string,
  ): Promise<{ ok: boolean; token?: string; user?: unknown; detail?: string }> {
    const r = await lisFetch('/api/admin/login', {
      method: 'POST',
      body: JSON.stringify({ login, password }),
    })
    if (!r.ok || !r.token) {
      const detail = r.data?.detail
      return {
        ok: false,
        detail:
          typeof detail === 'string'
            ? detail
            : `Не удалось войти как ${login}`,
      }
    }
    return { ok: true, token: r.token, user: r.data?.user }
  }

  async function autoAdoptPublished(token: string): Promise<number> {
    const mine = await lisFetch('/api/tests', { token })
    const myList: any[] = Array.isArray(mine.data)
      ? mine.data
      : mine.data?.tests || []
    const ownedSources = new Set(
      myList
        .map((t) => t.source_id || t.id)
        .filter((x: unknown): x is string => typeof x === 'string'),
    )
    for (const t of myList) {
      if (t?.id) ownedSources.add(t.id)
      if (t?.source_id) ownedSources.add(t.source_id)
    }

    const catalog = await lisFetch('/api/tests/catalog', { token })
    const catList: any[] = Array.isArray(catalog.data)
      ? catalog.data
      : catalog.data?.tests || []
    let adopted = 0
    for (const item of catList) {
      const id = item?.id
      if (!id || ownedSources.has(id)) continue
      const r = await lisFetch(`/api/tests/${id}/adopt`, {
        method: 'POST',
        token,
      })
      if (r.ok) {
        adopted += 1
        if (r.data?.id) ownedSources.add(r.data.id)
        ownedSources.add(id)
      }
    }
    return adopted
  }

  function attach(server: ViteDevServer | PreviewServer): void {
    const stack = server.middlewares as Connect.Server

    stack.use('/lis-auth/session', async (req, res, next) => {
      if (req.method !== 'POST') {
        next()
        return
      }
      try {
        const body = await readJson(req)
        const self = (body.self || body) as Partial<RosterMember>
        const roster = Array.isArray(body.roster)
          ? (body.roster as RosterMember[])
          : []
        const password = String(self.password || '')
        const displayName = String(self.displayName || '')
        const role = String(self.role || 'instructor')
        const login = String(self.login || '')
        const lisLoginHint = self.lisLoginHint
          ? String(self.lisLoginHint)
          : undefined

        if (!password) {
          sendJson(res, 400, {
            ok: false,
            detail: 'Нет пароля сессии Империи БАС',
          })
          return
        }

        const adminToken = await adminLoginToken()
        const users = await listUsers(adminToken)

        const syncList: RosterMember[] = [
          ...roster,
          {
            login,
            password,
            role,
            displayName,
            lisLoginHint,
          },
        ].filter((m) => m.login && m.password)

        const seen = new Set<string>()
        const synced: { login: string; created: boolean }[] = []
        let selfLisLogin = lisLoginHint || login

        for (const member of syncList) {
          const key = `${member.login}|${member.displayName}`
          if (seen.has(key)) continue
          seen.add(key)
          const result = await upsertMember(adminToken, users, member)
          synced.push({ login: result.login, created: result.created })
          if (
            member.login === login ||
            (lisLoginHint && member.lisLoginHint === lisLoginHint)
          ) {
            selfLisLogin = result.login
          }
        }

        // Единый видимый пароль 1234 для инструкторов/ассистентов 17 отдела в ЛИС
        // (как стартовый в Империи), кроме текущего пользователя (у него — пароль сессии).
        const sharedStaffPassword = '1234'
        for (const u of users) {
          if (u.department_id !== LIS_DEPT_17) continue
          if (u.role !== 'instructor' && u.role !== 'assistant') continue
          if (
            u.login.toLocaleLowerCase('ru-RU') ===
            selfLisLogin.toLocaleLowerCase('ru-RU')
          ) {
            continue
          }
          await lisFetch(`/api/admin/users/${u.id}/password`, {
            method: 'POST',
            token: adminToken,
            body: JSON.stringify({
              password: sharedStaffPassword,
              must_change_password: false,
            }),
          })
        }

        let auth = await loginAs(selfLisLogin, password)
        if (!auth.ok && login && login !== selfLisLogin) {
          auth = await loginAs(login, password)
          if (auth.ok) selfLisLogin = login
        }
        if (!auth.ok && fallbackLogin) {
          // последний шанс — не под чужой учёткой, только если self = senior hint
          if (lisLoginHint === fallbackLogin || selfLisLogin === fallbackLogin) {
            auth = await loginAs(fallbackLogin, password)
            if (!auth.ok) {
              auth = await loginAs(fallbackLogin, fallbackPassword)
            }
          }
        }

        if (!auth.ok || !auth.token) {
          sendJson(res, 502, {
            ok: false,
            detail: auth.detail || 'Вход в ЛИС не выполнен',
            synced,
          })
          return
        }

        let adopted = 0
        if (role === 'instructor' || role === 'assistant') {
          adopted = await autoAdoptPublished(auth.token)
        }

        sendJson(
          res,
          200,
          {
            ok: true,
            token: auth.token,
            user: auth.user,
            lisLogin: selfLisLogin,
            synced,
            adopted,
          },
          auth.token,
        )
      } catch (e) {
        sendJson(res, 502, {
          ok: false,
          detail: e instanceof Error ? e.message : 'Ошибка синхронизации ЛИС',
        })
      }
    })

    // Совместимость: старый bootstrap под учётку из .env
    stack.use('/lis-auth/token', async (req, res, next) => {
      if (req.method !== 'GET' && req.method !== 'POST') {
        next()
        return
      }
      try {
        const auth = await loginAs(fallbackLogin, fallbackPassword)
        if (!auth.ok || !auth.token) {
          sendJson(res, 502, { ok: false, detail: auth.detail })
          return
        }
        sendJson(
          res,
          200,
          { ok: true, token: auth.token, user: auth.user },
          auth.token,
        )
      } catch (e) {
        sendJson(res, 502, {
          ok: false,
          detail: e instanceof Error ? e.message : 'login failed',
        })
      }
    })
  }

  return {
    name: 'fc-imperiya-lis-auth',
    configureServer(server) {
      attach(server)
    },
    configurePreviewServer(server) {
      attach(server)
    },
  }
}
