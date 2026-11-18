#!/usr/bin/env node
// Collects the license texts of every production dependency, so that
// distributed builds (Docker image, web bundle, app) carry the notices that
// permissive licenses such as MIT/BSD/Apache require.
//
//   node scripts/third-party-notices.mjs [projectDir] > THIRD_PARTY_NOTICES.txt
//
// projectDir defaults to the repo root (server + web + shared workspaces);
// pass apps/mobile for the app.

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(process.argv[2] ?? '.');
const tree = JSON.parse(
  execSync('npm ls --omit=dev --all --json', { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 64 * 1024 * 1024 }),
);

const found = new Map(); // name@version -> { dir, license }
const walked = new Set(); // name@version whose dependency list has been walked
function findPackageDir(name, fromDir) {
  for (let dir = fromDir; ; dir = path.dirname(dir)) {
    const candidate = path.join(dir, 'node_modules', name);
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate;
    if (dir === path.dirname(dir)) return null;
  }
}
function walk(deps, fromDir) {
  for (const [name, info] of Object.entries(deps ?? {})) {
    if (name.startsWith('@open-workouts/')) {
      walk(info.dependencies, fromDir);
      continue;
    }
    const dir = findPackageDir(name, fromDir);
    if (!dir) continue;
    const pkg = JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8'));
    const key = `${pkg.name}@${pkg.version}`;
    if (!found.has(key)) {
      const license = typeof pkg.license === 'string' ? pkg.license : JSON.stringify(pkg.license ?? pkg.licenses ?? 'UNKNOWN');
      found.set(key, { dir, license });
    }
    // npm lists a package's children only once; "deduped" repeats have none.
    if (info.dependencies && !walked.has(key)) {
      walked.add(key);
      walk(info.dependencies, dir);
    }
  }
}
walk(tree.dependencies, root);

const out = [
  'THIRD-PARTY SOFTWARE NOTICES',
  '',
  'Open Workouts includes the following third-party packages. Each remains',
  'under its own license, reproduced below. The Open Workouts license',
  '(PolyForm Noncommercial 1.0.0) does not apply to these packages.',
  '',
];
for (const [key, { dir, license }] of [...found].sort(([a], [b]) => a.localeCompare(b))) {
  const file = fs.readdirSync(dir).find((f) => /^(licen[cs]e|copying|notice)(\..*)?$/i.test(f));
  out.push('='.repeat(78), `${key}  (${license})`, '-'.repeat(78));
  out.push(file ? fs.readFileSync(path.join(dir, file), 'utf8').trim() : `No license file shipped; declared license: ${license}`);
  out.push('');
}
process.stdout.write(out.join('\n') + '\n');
process.stderr.write(`third-party notices: ${found.size} packages\n`);
