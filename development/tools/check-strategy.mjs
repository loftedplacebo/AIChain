import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(import.meta.dirname, '../..');
const files = [path.join(root, 'PROJECT.md'), path.join(root, 'strategy/README.md')];
for (const dir of ['business', 'development', 'website']) {
  for (const item of fs.readdirSync(path.join(root, dir))) {
    if (item.endsWith('.md')) files.push(path.join(root, dir, item));
  }
}
const handoff = 'C:/AIChain/docs/commercialisation-review-handoff.md';
if (fs.existsSync(handoff)) files.push(handoff);
const errors = [];
let linkCount = 0;
for (const file of files) {
  const text = fs.readFileSync(file, 'utf8');
  if (!text.startsWith('# ')) errors.push(`${file}: missing document heading`);
  const content = text.replace(/```[\s\S]*?```/g, '');
  for (const m of content.matchAll(/\[[^\]]+\]\((<[^>]+>|[^)]+)\)/g)) {
    const dest = m[1].replace(/^<|>$/g, '').split('#')[0];
    if (!dest || /^(https?:|mailto:)/.test(dest)) continue;
    const resolved = /^[A-Za-z]:[\\/]/.test(dest) ? dest : path.resolve(path.dirname(file), decodeURIComponent(dest));
    linkCount++;
    if (!fs.existsSync(resolved)) errors.push(`${file}: missing link ${dest}`);
  }
}
const trace = fs.readFileSync(path.join(root, 'development/06-requirements-traceability.md'), 'utf8');
for (let i = 1; i <= 32; i++) if (!trace.includes(`| ${i} |`)) errors.push(`Missing requirement ${i}`);
const source = process.argv[2];
if (source) {
  const hash = f => crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');
  if (hash(source) !== hash(path.join(root, 'business/source-commercial-requirements.md'))) errors.push('Original brief copy differs');
}
const words = files.filter(f => !f.endsWith('source-commercial-requirements.md')).reduce((n, f) => n + fs.readFileSync(f, 'utf8').trim().split(/\s+/).length, 0);
console.log(JSON.stringify({ documents: files.length, localLinks: linkCount, authoredWordsApprox: words, errors }, null, 2));
if (errors.length) process.exitCode = 1;
