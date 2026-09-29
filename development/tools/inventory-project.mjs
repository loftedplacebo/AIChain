import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

// Read-only source inspection; writes only the inventory under this workspace.
const workspace = path.resolve(import.meta.dirname, '../..');
const chain = process.argv[2] ?? 'C:/AIChain';
const out = path.join(workspace, 'development/review');
const git = (root, args) => execFileSync('git', ['-c', `safe.directory=${root.replaceAll('\\', '/')}`, '-C', root, ...args], { encoding: 'utf8' }).trim();
const ignored = new Set(['.git', 'node_modules', '.next', 'dist', '.wrangler', '.openai', '__pycache__', 'review']);
const files = [];
function record(root, rel, scope) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) { files.push({ scope, path: rel, review: 'missing-tracked-file' }); return; }
  const stat = fs.lstatSync(full);
  if (!stat.isFile()) { files.push({ scope, path: rel, review: 'directory-or-submodule-boundary' }); return; }
  if (/(^|\/)\.env($|\.)|keystore|credential.*secret|private-key/i.test(rel)) {
    files.push({ scope, path: rel, bytes: stat.size, review: 'sensitive-content-excluded' }); return;
  }
  const bytes = fs.readFileSync(full);
  const isText = /\.(md|json|js|mjs|ts|tsx|css|py|sh|ps1|sol|toml|yml|yaml|go|rs|cpp|c|h|txt|svg)$/.test(rel) || /(^|\/)(\.gitignore|\.gitattributes|\.gitmodules)$/.test(rel);
  const row = { scope, path: rel.replaceAll('\\', '/'), bytes: stat.size, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), review: isText ? 'text-inventoried-and-scanned' : 'binary-or-other-inventoried' };
  if (isText) {
    const text = bytes.toString('utf8');
    row.lines = text.split(/\r?\n/).length;
    if (rel.endsWith('.md')) {
      row.headings = text.split(/\r?\n/).filter(x => /^#{1,3} /.test(x));
      row.statusExcerpts = text.split(/\r?\n/).filter(x => /^(\*\*)?(Status|Version|Updated|\| Status|\| Delivery status)|Overall status|remaining.*gate|remain.*open/i.test(x)).slice(0, 10);
    }
  }
  files.push(row);
}
for (const rel of git(chain, ['ls-files']).split('\n')) if (rel) record(chain, rel, 'active-development');
// Inspect project-specific consensus changes, not every vendored upstream file.
const core = path.join(chain, 'node/core-geth');
const corePaths = new Set(git(core, ['diff', '--name-only', '96b2afc', 'HEAD']).split('\n').filter(Boolean));
for (const rel of corePaths) record(core, rel, 'core-geth-delta-from-baseline');
function walk(dir, relative = '') {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ignored.has(entry.name) || entry.isSymbolicLink()) continue;
    const rel = path.join(relative, entry.name);
    if (entry.isDirectory()) walk(path.join(dir, entry.name), rel);
    else record(workspace, rel, 'project-workspace');
  }
}
walk(workspace);
const counts = {};
for (const row of files) counts[row.scope] = (counts[row.scope] ?? 0) + 1;
const report = { inspectedAt: new Date().toISOString(), workspace, chain, chainCommit: git(chain, ['rev-parse', 'HEAD']), coreCommit: git(core, ['rev-parse', 'HEAD']), counts, scope: 'Inventory and text scan, with targeted manual review recorded in review-scope.md. Not a security audit. Generated dependencies, caches, chain state, secrets and upstream vendor internals excluded.', files };
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, 'file-inventory.json'), JSON.stringify(report, null, 2) + '\n');
const md = ['# Project file inventory', '', `Generated: ${report.inspectedAt}`, '', report.scope, '', '| Scope | Path | Bytes | Inspection |', '|---|---|---:|---|', ...files.map(f => `| ${f.scope} | ${f.path} | ${f.bytes ?? '-'} | ${f.review} |`)];
fs.writeFileSync(path.join(out, 'file-inventory.md'), md.join('\n') + '\n');
console.log(JSON.stringify({ counts, chainCommit: report.chainCommit, coreCommit: report.coreCommit, output: out }));
