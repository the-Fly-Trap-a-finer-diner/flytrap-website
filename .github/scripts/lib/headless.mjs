// A tiny Chrome DevTools Protocol client: load a page in headless Chrome, wait
// until it has actually rendered, and report what happened.
//
// Why not `chrome --dump-dom`: this site transpiles its JSX in the browser with
// @babel/standalone, which XHR-fetches every .jsx file after DOMContentLoaded
// and only then transforms and runs it. --dump-dom serializes before any of that
// finishes and reports an empty #root on a perfectly healthy site. A monitor
// that cries wolf gets muted, so it has to poll for the real thing instead.
//
// Why not Playwright or Puppeteer: this repo has no package.json and is not
// getting one. Node 22 ships a global WebSocket and GitHub's runner images ship
// Chrome, so CDP over a raw socket needs neither an install nor a lockfile.

import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// Chrome prints "DevTools listening on ws://127.0.0.1:PORT/..." to stderr once
// it is ready. Port 0 lets the OS pick, so concurrent runs never collide.
function launch(binary, userDataDir) {
  const child = spawn(
    binary,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-sandbox',
      '--disable-dev-shm-usage',
      '--hide-scrollbars',
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-extensions',
      `--user-data-dir=${userDataDir}`,
      '--remote-debugging-port=0',
      'about:blank',
    ],
    { stdio: ['ignore', 'pipe', 'pipe'] }
  )

  const endpoint = new Promise((resolve, reject) => {
    let buf = ''
    const onData = (chunk) => {
      buf += chunk
      const m = buf.match(/DevTools listening on (ws:\/\/\S+)/)
      if (m) resolve(m[1])
    }
    child.stderr.on('data', onData)
    child.on('exit', (code) => reject(new Error(`Chrome exited (${code}) before opening a debug port: ${buf.slice(-400)}`)))
    setTimeout(() => reject(new Error(`Chrome never opened a debug port: ${buf.slice(-400)}`)), 30_000)
  })

  return { child, endpoint }
}

// Minimal CDP session: numbered requests in, matching responses out, plus an
// event stream. Enough for navigate + evaluate + error capture, nothing more.
class Session {
  constructor(ws) {
    this.ws = ws
    this.id = 0
    this.pending = new Map()
    this.onEvent = () => {}
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data)
      if (msg.id != null) {
        const p = this.pending.get(msg.id)
        if (!p) return
        this.pending.delete(msg.id)
        msg.error ? p.reject(new Error(msg.error.message)) : p.resolve(msg.result)
      } else {
        this.onEvent(msg)
      }
    })
  }

  send(method, params = {}) {
    const id = ++this.id
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.ws.send(JSON.stringify({ id, method, params }))
      setTimeout(() => {
        if (this.pending.delete(id)) reject(new Error(`CDP ${method} timed out`))
      }, 30_000)
    })
  }

  // Evaluate in the page and hand back a plain JS value.
  async evaluate(expression) {
    const r = await this.send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || 'evaluate threw')
    return r.result?.value
  }
}

const connect = (url) =>
  new Promise((resolve, reject) => {
    const ws = new WebSocket(url)
    ws.addEventListener('open', () => resolve(new Session(ws)))
    ws.addEventListener('error', () => reject(new Error(`could not connect to ${url}`)))
  })

/**
 * Load `url` in headless Chrome and wait for the page to render.
 *
 * `readyExpression` must evaluate to true once the page is genuinely up; it is
 * polled rather than raced against a fixed timeout, so a slow cold Pages cache
 * costs a few extra seconds instead of a false alarm.
 *
 * Returns { ready, waitedMs, errors, evaluate } — `errors` holds uncaught
 * exceptions and console.error output, which is how a page that renders
 * something but is quietly broken still gets caught.
 */
export async function renderPage(binary, url, { readyExpression, timeoutMs = 45_000, pollMs = 500, probes = {} } = {}) {
  const userDataDir = await mkdtemp(join(tmpdir(), 'ft-chrome-'))
  const { child, endpoint } = launch(binary, userDataDir)
  const errors = []
  let session

  try {
    const browserWs = await endpoint
    const browser = await connect(browserWs)

    // Attach to the about:blank tab Chrome opened, with a flat session so page
    // events arrive on this same socket.
    const { targetInfos } = await browser.send('Target.getTargets')
    const page = targetInfos.find((t) => t.type === 'page')
    if (!page) throw new Error('Chrome opened no page target')
    const { sessionId } = await browser.send('Target.attachToTarget', { targetId: page.targetId, flatten: true })

    // Flat mode multiplexes the page session over the browser socket, so route
    // by sessionId and re-tag outbound messages.
    session = new Session(browser.ws)
    session.id = 10_000 // keep ids clear of the browser session's
    const rawSend = session.send.bind(session)
    session.send = (method, params) => {
      const id = ++session.id
      return new Promise((resolve, reject) => {
        session.pending.set(id, { resolve, reject })
        browser.ws.send(JSON.stringify({ id, method, params, sessionId }))
        setTimeout(() => {
          if (session.pending.delete(id)) reject(new Error(`CDP ${method} timed out`))
        }, 30_000)
      })
    }
    void rawSend

    session.onEvent = (msg) => {
      if (msg.method === 'Runtime.exceptionThrown') {
        const d = msg.params?.exceptionDetails
        errors.push(d?.exception?.description || d?.text || 'uncaught exception')
      }
      if (msg.method === 'Runtime.consoleAPICalled' && msg.params?.type === 'error') {
        errors.push((msg.params.args || []).map((a) => a.value ?? a.description ?? '').join(' ').trim())
      }
    }

    await session.send('Runtime.enable')
    await session.send('Page.enable')
    await session.send('Page.navigate', { url })

    const started = Date.now()
    let ready = false
    while (Date.now() - started < timeoutMs) {
      await sleep(pollMs)
      try {
        if (await session.evaluate(`!!(${readyExpression})`)) {
          ready = true
          break
        }
      } catch {
        // Page still navigating or the context was swapped — keep polling.
      }
    }

    const results = {}
    for (const [name, expr] of Object.entries(probes)) {
      try {
        results[name] = await session.evaluate(expr)
      } catch (err) {
        results[name] = `<probe failed: ${err.message}>`
      }
    }

    return { ready, waitedMs: Date.now() - started, errors: [...new Set(errors)].filter(Boolean), probes: results }
  } finally {
    try {
      session?.ws?.close()
    } catch {
      /* already closing */
    }
    child.kill('SIGKILL')
    await rm(userDataDir, { recursive: true, force: true }).catch(() => {})
  }
}
