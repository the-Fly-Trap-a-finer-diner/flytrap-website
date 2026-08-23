// End-to-end guard on the one property that matters: after a full sync run
// against a hostile Toast payload, the data.js on disk still parses.
//
// The unit tests in specials-escaping.test.mjs cover the serializer in
// isolation. This runs the real script — ingest, classify, serialize, the
// pre-write parse gate, writeFile — over a fixture carrying the exact CRLF that
// took the site down, in a scratch copy of the repo so nothing real is touched.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, readFile, writeFile, cp, realpath } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

// A Weekly Specials group whose descriptions carry every line terminator a POS
// field can emit. CRLF is the one f3359d7 actually shipped.
const HOSTILE_PAYLOAD = {
  menus: [
    {
      name: 'Fly Trap Food',
      menuGroups: [
        {
          name: 'Weekly Specials',
          menuItems: [
            {
              name: 'The Stanley Kowalski',
              price: 15.95,
              description:
                "It's a fried bologna sandwich! House made, smoked thick-cut and green " +
                "chili infused on a bun with cowboy candy, pickled onion, BBQ aioli, " +
                "'merican cheese,\r\na sunny egg, lettuce and tomato; pick your side!",
            },
            {
              name: 'The\r\nLine Break',
              price: 12.0,
              description: 'Bare CR only\rand a lone LF\nand a separator\u2028here.',
            },
            {
              name: 'The "Quoted" \\ Backslash',
              price: 9.5,
              description: 'He said \\"hi\\" and left.\u0000',
            },
          ],
        },
      ],
    },
  ],
};

// Stand up a scratch repo with just what the script reads and writes.
//
// realpath matters: on macOS os.tmpdir() is /var/... which symlinks to
// /private/var/..., and specials-sync.mjs only calls main() when
// import.meta.url (real path) matches process.argv[1]. Handing it the symlinked
// path makes the script exit silently having done nothing.
async function scratchRepo() {
  const dir = await realpath(await mkdtemp(join(tmpdir(), 'flytrap-sync-')));
  await mkdir(join(dir, '.github', 'scripts'), { recursive: true });
  await mkdir(join(dir, 'apps-script', 'lib'), { recursive: true });
  await mkdir(join(dir, 'docs'), { recursive: true });
  await cp(join(REPO, '.github', 'scripts'), join(dir, '.github', 'scripts'), { recursive: true });
  await cp(join(REPO, 'apps-script', 'lib'), join(dir, 'apps-script', 'lib'), { recursive: true });
  await cp(join(REPO, 'data.js'), join(dir, 'data.js'));
  return dir;
}

test('a full sync over a CRLF-laden Toast payload leaves data.js parseable', async () => {
  const dir = await scratchRepo();
  const fixture = join('.github', 'scripts', 'fixtures', 'hostile.generated.json');
  await writeFile(join(dir, fixture), JSON.stringify(HOSTILE_PAYLOAD));

  const { stdout } = await run('node', [join(dir, '.github', 'scripts', 'specials-sync.mjs')], {
    env: { ...process.env, TOAST_MENUS_FIXTURE: fixture },
    cwd: dir,
  });

  const out = await readFile(join(dir, 'data.js'), 'utf8');
  assert.equal(out.includes('\r'), false, 'a raw CR reached data.js');
  assert.equal(/[\u2028\u2029\u0000]/.test(out), false, 'a raw separator or NUL reached data.js');
  assert.match(out, /name: "The Line Break"/, 'the hostile payload was not written');
  assert.match(stdout, /Wrote/);

  // The real assertion: the file the browser would load actually parses.
  await run('node', ['--check', join(dir, 'data.js')]);
});

test('the pre-write gate refuses to write a data.js that does not parse', async () => {
  const dir = await scratchRepo();

  // Break the serializer inside the scratch copy so it emits a raw CR again —
  // exactly the pre-fix behaviour. The gate is the only thing left standing
  // between that and the site.
  const libPath = join(dir, 'apps-script', 'lib', 'specials.js');
  const lib = await readFile(libPath, 'utf8');
  await writeFile(
    libPath,
    lib.replace(
      /function jsStr\(s\) \{[\s\S]*?\n\}/,
      'function jsStr(s) {\n' +
        "  return String(s == null ? '' : s)\n" +
        "    .replace(/\\\\/g, '\\\\\\\\')\n" +
        '    .replace(/"/g, \'\\\\"\')\n' +
        "    .replace(/\\n/g, '\\\\n');\n" +
        '}'
    )
  );

  // Bypass the ingest normalizer too, so the CR reaches the serializer.
  const syncPath = join(dir, '.github', 'scripts', 'specials-sync.mjs');
  const sync = await readFile(syncPath, 'utf8');
  await writeFile(
    syncPath,
    sync.replace(
      /export function normalizeToastText\(v\) \{[\s\S]*?\n\}/,
      "export function normalizeToastText(v) {\n  return String(v == null ? '' : v)\n}"
    )
  );

  const before = await readFile(join(dir, 'data.js'), 'utf8');
  const fixture = join('.github', 'scripts', 'fixtures', 'hostile.generated.json');
  await writeFile(join(dir, fixture), JSON.stringify(HOSTILE_PAYLOAD));

  await assert.rejects(
    run('node', [syncPath], { env: { ...process.env, TOAST_MENUS_FIXTURE: fixture }, cwd: dir }),
    (err) => {
      assert.notEqual(err.code, 0, 'the script should exit non-zero');
      assert.match(err.stderr, /Refusing to write data\.js/);
      return true;
    }
  );

  // Fail closed: the last-good file is byte-for-byte untouched and still live.
  assert.equal(await readFile(join(dir, 'data.js'), 'utf8'), before);
});
