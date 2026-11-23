// Backstop limit on manually started Toast syncs, enforced inside GitHub.
//
// The refresh Worker (workers/toast-refresh) has its own limits for the Toast
// webhook and the staff link. This is the second wall, for the case where those
// are bypassed: the Worker's GitHub token leaks and someone calls the API
// directly. Whoever holds that token can start runs but cannot edit this file
// (the token has no contents access), so a limit here holds no matter who is
// dispatching.
//
// It counts every workflow_dispatch run of the Toast sync, by anyone, except
// runs GitHub cancelled. There is no minimum gap: several publishes in a row are
// normal, and the workflow's concurrency group already folds a burst into one
// running sync plus one queued sync that reads the newest menu (GitHub cancels
// the older queued ones). Scheduled runs are never limited.
//
// On a GitHub API error it lets the run through. Failing closed would block a
// real sync over an API hiccup, and the refresh link's own limits still apply.
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

export const LIMITS = {
  perDay: 48, // manual runs in any rolling 24 hours, this one included
}

const DAY_MS = 24 * 60 * 60 * 1000

// `runs`: the workflow's workflow_dispatch runs, as the GitHub API lists them.
// Returns { allowed, reason }.
export function decideDispatch(runs, now, currentRunId, limits = LIMITS) {
  const earlier = (runs || [])
    .filter((r) => r && String(r.id) !== String(currentRunId) && r.conclusion !== 'cancelled')
    .map((r) => Date.parse(r.created_at))
    .filter((t) => Number.isFinite(t) && t <= now && now - t < DAY_MS)

  if (earlier.length + 1 > limits.perDay) {
    return { allowed: false, reason: `${earlier.length} manual syncs already in the last 24 hours (limit ${limits.perDay})` }
  }
  return { allowed: true, reason: 'ok' }
}

async function listRecentDispatches({ repo, token, now }) {
  const since = new Date(now - DAY_MS).toISOString()
  const url = `https://api.github.com/repos/${repo}/actions/workflows/toast-sync.yml/runs` +
    `?event=workflow_dispatch&per_page=100&created=${encodeURIComponent('>=' + since)}`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
  })
  if (!res.ok) throw new Error(`GitHub API ${res.status}`)
  return (await res.json()).workflow_runs || []
}

async function main() {
  const out = (k, v) => process.env.GITHUB_OUTPUT && appendFileSync(process.env.GITHUB_OUTPUT, `${k}=${v}\n`)
  const now = Date.now()
  let decision
  try {
    const runs = await listRecentDispatches({
      repo: process.env.GITHUB_REPOSITORY,
      token: process.env.GITHUB_TOKEN,
      now,
    })
    decision = decideDispatch(runs, now, process.env.GITHUB_RUN_ID)
  } catch (err) {
    console.log(`::warning::Could not check recent manual syncs (${err.message}); letting this one run.`)
    decision = { allowed: true, reason: 'check failed' }
  }
  if (!decision.allowed) {
    console.log(`::warning::Skipping this manual Toast sync: ${decision.reason}.`)
  }
  out('throttled', decision.allowed ? 'false' : 'true')
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  await main()
}
