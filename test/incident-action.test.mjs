// Tests for the incident-notice logic in .github/actions/incident/action.yml.
//
// This is alerting code: when it is wrong, it is wrong silently, at 3am, in the
// one moment it exists for. The two ways it fails are opposites and both are
// fatal — never notifying anyone, or notifying them ninety-six times a day until
// they mute the repo. Neither shows up until an outage, so both get tested here.
//
// The script lives inside the action YAML because that is where github-script
// wants it. Rather than duplicate it into a .mjs and let the two drift, the test
// reads the YAML, pulls the script back out, and runs that exact text against a
// fake GitHub API.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const ACTION = resolve(REPO, '.github/actions/incident/action.yml');

// Pull the `script: |` block out of the composite action, un-indented. Cheap
// hand-rolled extraction rather than a YAML dependency — this repo has no
// package.json and the block is the last key in the file.
async function loadScript() {
  const yaml = await readFile(ACTION, 'utf8');
  const m = yaml.match(/\n[ \t]*script: \|\n/);
  assert.ok(m, 'could not find the script block in action.yml');
  const lines = yaml.slice(m.index + m[0].length).split('\n');
  const indent = lines[0].match(/^[ \t]*/)[0].length;
  assert.ok(indent > 0, 'script block is not indented — extraction would be wrong');
  return lines.map((l) => l.slice(indent)).join('\n');
}

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

// A fake issues API that records what the script did to it.
function fakeGitHub({ openIssues = [], comments = [], labelExists = true, assignThrows = false } = {}) {
  const calls = { created: [], comments: [], updates: [], assignees: [], labelsCreated: [] };
  let nextNumber = 100;
  return {
    calls,
    api: {
      rest: {
        issues: {
          async getLabel() {
            if (!labelExists) throw new Error('Not Found');
            return { data: {} };
          },
          async createLabel({ name }) {
            calls.labelsCreated.push(name);
            return { data: {} };
          },
          async listForRepo({ labels, state }) {
            return { data: openIssues.filter(() => state === 'open' && labels === 'site-down') };
          },
          async listComments() {
            return { data: comments };
          },
          async create({ title, body, labels }) {
            const issue = { number: nextNumber++, title, body, labels };
            calls.created.push(issue);
            return { data: issue };
          },
          async createComment({ issue_number, body }) {
            calls.comments.push({ issue_number, body });
            return { data: {} };
          },
          async update({ issue_number, body, state }) {
            calls.updates.push({ issue_number, body, state });
            return { data: {} };
          },
          async addAssignees({ issue_number, assignees }) {
            if (assignThrows) throw new Error('user is not a collaborator');
            calls.assignees.push({ issue_number, assignees });
            return { data: {} };
          },
        },
      },
    },
  };
}

const MARKER = '<!-- flytrap-site-health-incident -->';
const minutesAgo = (n) => new Date(Date.now() - n * 60_000).toISOString();

async function runAction({ env, github, context, core }) {
  const src = await loadScript();
  // The script is this repo's own file, read off disk, with mocked globals.
  const fn = new AsyncFunction('github', 'context', 'core', 'process', src);
  await fn(github, context, core, { env: { ...env } });
}

function harness(state, opts = {}) {
  const { api, calls } = fakeGitHub(opts);
  const logs = { notice: [], warning: [], info: [], outputs: {} };
  const core = {
    notice: (m) => logs.notice.push(m),
    warning: (m) => logs.warning.push(m),
    info: (m) => logs.info.push(m),
    setOutput: (k, v) => {
      logs.outputs[k] = v;
    },
  };
  const context = {
    repo: { owner: 'the-Fly-Trap-a-finer-diner', repo: 'flytrap-website' },
    serverUrl: 'https://github.com',
    runId: 12345,
  };
  const env = {
    INCIDENT_STATE: state,
    INCIDENT_SUMMARY: '| render | fail | React never mounted |',
    INCIDENT_SOURCE: 'scheduled monitor',
    INCIDENT_ASSIGNEES: 'ryankolean, smcclanaghan76',
    INCIDENT_SITE_URL: 'https://theflytrapferndale.com',
  };
  return { run: () => runAction({ env, github: api, context, core }), calls, logs };
}

// ------------------------------------------------------------ first detection

test('site down with no open incident opens one and notifies both people', async () => {
  const h = harness('failing');
  await h.run();

  assert.equal(h.calls.created.length, 1, 'should open exactly one issue');
  const issue = h.calls.created[0];
  assert.match(issue.title, /site down/i);
  assert.ok(issue.body.includes(MARKER), 'body must carry the dedupe marker');
  assert.ok(issue.body.includes('React never mounted'), 'body must carry the check table');
  assert.deepEqual(issue.labels, ['site-down']);

  assert.deepEqual(h.calls.assignees, [
    { issue_number: issue.number, assignees: ['ryankolean', 'smcclanaghan76'] },
  ]);
});

test('the site-down label is created when it does not exist yet', async () => {
  const h = harness('failing', { labelExists: false });
  await h.run();
  assert.deepEqual(h.calls.labelsCreated, ['site-down']);
});

test('an issue is still opened when assigning fails', async () => {
  // A handle that stopped being a collaborator must not swallow the whole alert.
  const h = harness('failing', { assignThrows: true });
  await h.run();
  assert.equal(h.calls.created.length, 1, 'the issue must still exist');
  assert.equal(h.calls.assignees.length, 0);
  assert.ok(h.logs.warning.some((w) => /could not assign/.test(w)));
});

// ------------------------------------------------------- dedupe while down

test('a second failing run does not open a second issue', async () => {
  const existing = { number: 42, body: MARKER, created_at: minutesAgo(10) };
  const h = harness('failing', { openIssues: [existing], comments: [{ created_at: minutesAgo(5) }] });
  await h.run();

  assert.equal(h.calls.created.length, 0, 'must not open a duplicate');
  assert.equal(h.calls.updates.length, 1, 'should refresh the existing body');
  assert.equal(h.calls.updates[0].issue_number, 42);
});

test('a failing run within the hour refreshes the body but does not comment', async () => {
  // Commenting is what emails people. Four times an hour is how a monitor gets muted.
  const existing = { number: 42, body: MARKER, created_at: minutesAgo(30) };
  const h = harness('failing', { openIssues: [existing], comments: [{ created_at: minutesAgo(20) }] });
  await h.run();

  assert.equal(h.calls.comments.length, 0, 'must not re-notify inside the hour');
  assert.equal(h.calls.updates.length, 1);
});

test('a failing run after an hour of silence comments again', async () => {
  const existing = { number: 42, body: MARKER, created_at: minutesAgo(200) };
  const h = harness('failing', { openIssues: [existing], comments: [{ created_at: minutesAgo(75) }] });
  await h.run();

  assert.equal(h.calls.comments.length, 1, 'a long outage should re-notify hourly');
  assert.match(h.calls.comments[0].body, /Still down/);
  assert.match(h.calls.comments[0].body, /3h 20m/, 'should report how long it has been down');
});

test('an incident with no comments yet re-notifies an hour after it opened', async () => {
  const existing = { number: 42, body: MARKER, created_at: minutesAgo(90) };
  const h = harness('failing', { openIssues: [existing], comments: [] });
  await h.run();
  assert.equal(h.calls.comments.length, 1);
});

// ------------------------------------------------------------------ recovery

test('recovery comments and closes the open incident', async () => {
  const existing = { number: 42, body: MARKER, created_at: minutesAgo(150) };
  const h = harness('healthy', { openIssues: [existing] });
  await h.run();

  assert.equal(h.calls.comments.length, 1);
  assert.match(h.calls.comments[0].body, /Recovered/);
  assert.match(h.calls.comments[0].body, /2h 30m/, 'should report the outage duration');
  assert.deepEqual(
    h.calls.updates.map((u) => ({ n: u.issue_number, s: u.state })),
    [{ n: 42, s: 'closed' }]
  );
});

test('a healthy run with no open incident does nothing at all', async () => {
  const h = harness('healthy');
  await h.run();
  assert.equal(h.calls.created.length, 0);
  assert.equal(h.calls.comments.length, 0);
  assert.equal(h.calls.updates.length, 0);
});

// --------------------------------------------------------------------- misc

test('an unrelated open issue carrying the label is ignored', async () => {
  // Someone hand-labelling an issue must not make the monitor adopt it.
  const unrelated = { number: 7, body: 'the fly logo looks squished on mobile', created_at: minutesAgo(10) };
  const h = harness('failing', { openIssues: [unrelated] });
  await h.run();
  assert.equal(h.calls.created.length, 1, 'should open its own issue');
  assert.equal(h.calls.updates.length, 0, 'must not touch the unrelated issue');
});

test('assignees are trimmed and empty entries dropped', async () => {
  const h = harness('failing');
  await h.run();
  const { assignees } = h.calls.assignees[0];
  assert.ok(assignees.every((a) => a === a.trim() && a.length));
});
