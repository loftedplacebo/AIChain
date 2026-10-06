'use strict';
// Read-only hosted backup prerequisites. Never print runtime URLs or secrets.
const fs = require('node:fs');
const {Pool} = require('pg');
const env = Object.fromEntries(fs.readFileSync('/etc/aichain-governance-synthetic-api.env', 'utf8')
  .split(/\r?\n/).filter(line => /^[A-Z_]+=.*/.test(line))
  .map(line => [line.slice(0, line.indexOf('=')), line.slice(line.indexOf('=') + 1)]));
const uri = new URL(env.GOVERNANCE_DATABASE_URL);
const pool = new Pool({host: uri.hostname, port: Number(uri.port),
  database: uri.pathname.slice(1), user: decodeURIComponent(uri.username),
  password: decodeURIComponent(uri.password),
  ssl: {ca: fs.readFileSync(env.GOVERNANCE_DATABASE_CA_FILE, 'utf8'),
    rejectUnauthorized: true, servername: uri.hostname}});
(async () => {
  const row = (await pool.query(`SELECT current_database() database,
    (SELECT rolname FROM pg_roles WHERE oid = d.datdba) database_owner,
    (SELECT count(*)::int FROM governance_migrations) migration_count,
    (SELECT state FROM governance_recovery_gate WHERE singleton=true) recovery_state
    FROM pg_database d WHERE datname=current_database()`)).rows[0];
  console.log(JSON.stringify(row));
})().catch(() => { console.error('Read-only backup readiness query failed'); process.exitCode=1; })
  .finally(() => pool.end());
