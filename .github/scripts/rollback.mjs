// Roll the site's content files back to the last commit that was verified live.
//
// Runs from post-deploy-verify when the health check fails. Restores the files
// the Toast sync owns from the last-known-good ref, commits, pushes, and pauses
// the sync so the same bad pull cannot land again ninety seconds later.
//
// The bar this has to clear is not "can it revert a commit". It is "will it do
// the right thing at 3am without a human", and the failure modes are worse than
// the outage it fixes: reverting someone's merge behind their back, or ping-
// ponging with the sync every fifteen minutes. So most of this file is the
// decision, not the git.
//
// Three things I confirmed against the real history before writing it:
//
//   1. `git revert` is the wrong tool. Every sync rewrites the same line of
//      data.js, so reverting anything but the tip conflicts. Restoring the files
//      wholesale from a good SHA does not.
//   2. "The previous commit" is often broken too. During the first outage
//      f3359d7 and e1f39a4 were both unparseable back to back, so a one-step
//      rollback would have landed on another blank site. Hence a recorded
//      last-known-good rather than HEAD~1.
//   3. A GITHUB_TOKEN push does not trigger other workflows, so the rollback has
//      to dispatch Pages itself — exactly as toast-sync already does.
//
// Env:
//   LKG_SHA        last verified-good commit (empty if none recorded yet)
//   HEAD_SHA       the commit that just failed verification
//   BOT_NAME       commit author eligible for auto-rollback (default flytrap-toast-bot)
//   PAUSE_FILE     circuit-breaker path (default .github/SYNC_PAUSED)
//   DRY_RUN        set to 1 to decide and report without touching git
//   GH_TOKEN       needed only to dispatch the Pages deploy
//
// Exit: always 0. A rollback that declines to act is a normal outcome, not an
// error — the caller fails the run on the health check, not on this.

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { writeFile, appendFile, access } from 'node:fs/promises'

const run = promisify(execFile)
const git = async (...args) => (await run('git', args)).stdout.trim()

const BOT_NAME = process.env.BOT_NAME || 'flytrap-toast-bot'
const PAUSE_FILE = process.env.PAUSE_FILE || '.github/SYNC_PAUSED'
const DRY_RUN = process.env.DRY_RUN === '1'

// Marker in the rollback commit's own subject. Without it a rollback that is
// itself unhealthy would be rolled back again, and again.
export const ROLLBACK_SUBJECT = 'revert(toast): roll back to the last verified-good site'

// The exact paths the Toast sync writes, kept in step with the `git add` line in
// toast-sync.yml. Restoring a subset would leave data.js describing photos that
// are not there.
export const SYNCED_PATHS = ['data.js', 'assets/menu.json', 'assets/specials', 'docs/specials-history.json']

/**
 * Should we roll back? Pure, so the guards can be tested — they are the part
 * that has to be right, and none of them are exercised until an outage.
 */
export function decideRollback({ lkgSha, headSha, authorName, subject, paused }) {
  if (paused) {
    return {
      act: false,
      reason:
        'the Toast sync is already paused, so an earlier rollback has not been cleared yet. ' +
        'Not rolling back again — a human needs to look at this one.',
    }
  }
  if (!lkgSha) {
    return {
      act: false,
      reason:
        'no last-known-good commit has been recorded yet, so there is nothing to roll back to. ' +
        'The ref is written the first time a deploy passes verification.',
    }
  }
  if (subject.startsWith(ROLLBACK_SUBJECT)) {
    return {
      act: false,
      reason:
        'this deploy was itself an automatic rollback and it is still failing. ' +
        'Rolling back further would loop; the problem is not the content.',
    }
  }
  if (lkgSha === headSha) {
    return {
      act: false,
      reason:
        'the commit that failed IS the last verified-good one, so the content did not change. ' +
        'Look at Pages, DNS or the certificate rather than the site files.',
    }
  }
  if (authorName !== BOT_NAME) {
    return {
      act: false,
      reason:
        `this commit was authored by ${authorName || 'an unknown author'}, not ${BOT_NAME}. ` +
        'Automatic rollback only ever touches the sync bot\'s own commits — reverting a ' +
        'person\'s merge without asking is worse than the outage.',
    }
  }
  return { act: true, reason: `rolling the synced files back to ${lkgSha.slice(0, 12)}` }
}

const exists = (p) => access(p).then(() => true).catch(() => false)

async function report(lines) {
  const text = lines.join('\n')
  console.log(text)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, text + '\n')
  if (process.env.GITHUB_OUTPUT) {
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `note<<ROLLBACK_EOF\n${text}\nROLLBACK_EOF\n`
    )
  }
}

async function main() {
  const lkgSha = (process.env.LKG_SHA || '').trim()
  const headSha = (process.env.HEAD_SHA || (await git('rev-parse', 'HEAD'))).trim()
  const authorName = await git('log', '-1', '--format=%an', headSha)
  const subject = await git('log', '-1', '--format=%s', headSha)
  const paused = await exists(PAUSE_FILE)

  const decision = decideRollback({ lkgSha, headSha, authorName, subject, paused })

  if (!decision.act) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'rolled-back=false\n')
    await report(['### Automatic rollback: not attempted', '', decision.reason])
    return
  }

  if (DRY_RUN) {
    await report(['### Automatic rollback (dry run)', '', `Would have: ${decision.reason}`])
    return
  }

  // Restore only the sync's own files. Deliberately not a `git reset` — anything
  // a human landed alongside the bad sync stays.
  await git('checkout', lkgSha, '--', ...SYNCED_PATHS)

  // The circuit breaker. Without it the next scheduled sync re-pulls the same
  // bad Toast data, the rollback fires again, and the two trade commits every
  // fifteen minutes until someone notices. The sync refuses to run while this
  // file exists; deleting it is the deliberate human act that resumes it.
  await writeFile(
    PAUSE_FILE,
    [
      'The Toast sync is paused.',
      '',
      `An automatic rollback ran because the site failed verification after ${headSha}.`,
      `The synced files were restored from ${lkgSha}.`,
      '',
      'Before deleting this file:',
      '',
      '  1. Work out what was wrong with the Toast data or the sync itself.',
      '  2. Fix it at the source — the Toast item, or the sync script.',
      '  3. Delete this file and commit.',
      '  4. Run the Toast sync with force=true to pull a fresh, correct copy.',
      '',
      'While this file exists the site keeps serving the last verified-good content.',
      '',
    ].join('\n')
  )

  await git('config', 'user.name', 'flytrap-toast-bot')
  await git('config', 'user.email', 'bot@theflytrapferndale.com')
  await git('add', PAUSE_FILE, ...SYNCED_PATHS)

  if (!(await git('diff', '--cached', '--name-only'))) {
    if (process.env.GITHUB_OUTPUT) await appendFile(process.env.GITHUB_OUTPUT, 'rolled-back=false\n')
    await report([
      '### Automatic rollback: nothing to change',
      '',
      `The synced files already match ${lkgSha.slice(0, 12)}. The failure is somewhere else.`,
    ])
    return
  }

  const body = [
    ROLLBACK_SUBJECT,
    '',
    `${headSha} failed post-deploy verification, so the files the Toast sync owns`,
    `were restored from ${lkgSha}, the last commit confirmed working on the live site.`,
    '',
    'Restored: ' + SYNCED_PATHS.join(', '),
    '',
    'The Toast sync is paused until .github/SYNC_PAUSED is deleted, so the same bad',
    'pull cannot land again on the next run.',
  ].join('\n')

  await git('commit', '-m', body)
  // Absorb anything that landed since checkout, same as the sync does.
  await git('pull', '--rebase', '--autostash', 'origin', 'main')
  await git('push', 'origin', 'HEAD:main')
  const newSha = await git('rev-parse', 'HEAD')

  // A GITHUB_TOKEN push raises no events, so Pages will not redeploy on its own.
  let deployNote = ''
  try {
    await run('gh', ['workflow', 'run', 'Deploy to GitHub Pages', '--ref', 'main'])
    deployNote = 'Pages redeploy dispatched.'
  } catch (err) {
    deployNote = `Could not dispatch the Pages deploy (${String(err.message).slice(0, 120)}). Run it by hand.`
  }

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, `rolled-back=true\nrollback-sha=${newSha}\n`)
  }

  await report([
    '### Automatic rollback: done',
    '',
    `Restored ${SYNCED_PATHS.join(', ')} from \`${lkgSha.slice(0, 12)}\` and pushed \`${newSha.slice(0, 12)}\`.`,
    '',
    deployNote,
    '',
    '**The Toast sync is paused.** Fix the cause, delete `.github/SYNC_PAUSED`, then run',
    'the sync with `force=true`.',
  ])
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    // A failed rollback must not mask the outage it was reacting to. Report and
    // exit clean; the caller fails the run on the health check.
    console.error(`::warning::Automatic rollback failed: ${String(err?.stack || err)}`)
    process.exit(0)
  })
}
