#!/usr/bin/env bash
set -euo pipefail
umask 077
[[ $(id -u) -eq 0 && -t 0 ]] || { echo 'Run as root in an interactive SSH terminal' >&2; exit 2; }
base=/opt/aichain/governance-pilot-worker
state=/var/lib/aichain-governance-pilot-worker
dest=/etc/aichain-governance-pilot-worker.env
node=/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node
[[ ! -e "$dest" ]] || { echo 'Worker config already exists; inspect before replacing' >&2; exit 2; }
[[ -d "$base/node_modules/pg" && -d "$base/node_modules/ethers" ]] || { echo 'Worker runtime not installed' >&2; exit 2; }
read -rsp '1Password governance_evidence_worker database password: ' db_password; echo
[[ ${#db_password} -ge 12 && ${#db_password} -le 1024 && "$db_password" != *$'\n'* && "$db_password" != *$'\r'* ]] || { echo 'Invalid database password input' >&2; exit 2; }
encoded_password=$(printf '%s' "$db_password" | "$node" -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(encodeURIComponent(s)))')
unset db_password
"$node" - "$state/keys" <<'NODE'
const fs=require('node:fs'),crypto=require('node:crypto'),{Wallet}=require('/opt/aichain/governance-pilot-worker/node_modules/ethers');
const directory=process.argv[2];
for(const [role,file] of [['recording-service','recording-service.key'],['relayer','relayer.key']]){
 const name=directory+'/'+file;
 if(fs.existsSync(name))throw Error('Worker key already exists; stop and review');
 const key='0x'+crypto.randomBytes(32).toString('hex');
 fs.writeFileSync(name,key+'\n',{flag:'wx',mode:0o600});
 console.log(role+' address: '+new Wallet(key).address);
}
NODE
chown aichain-governance-pilot-worker:aichain-governance-pilot-worker "$state/keys/recording-service.key" "$state/keys/relayer.key"
tmp=$(mktemp /etc/.aichain-governance-pilot-worker.XXXXXXXX)
trap 'rm -f -- "$tmp"' EXIT
cat >"$tmp" <<EOF
GOVERNANCE_ENV=test
GOVERNANCE_STORAGE=postgres
GOVERNANCE_DATABASE_URL=postgresql://governance_evidence_worker:${encoded_password}@orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com:25060/governance_test?sslmode=verify-full
GOVERNANCE_DATABASE_CA_FILE=/etc/aichain/governance/digitalocean-ca.crt
GOVERNANCE_TENANT=org-831aa048-b268-4fce-98f3-455429034ef8
GOVERNANCE_PROJECT=prj-d9109260-1232-4561-ab4a-ab2e5c8f658f
GOVERNANCE_WORKER_JOURNAL=$state/worker.sqlite
GOVERNANCE_RECEIPT_KEY_FILE=$state/keys/recording-service.key
GOVERNANCE_RELAYER_KEY_FILE=$state/keys/relayer.key
GOVERNANCE_EVIDENCE_RPC_URL=https://sepolia.base.org
GOVERNANCE_WORKER_ENABLED=false
EOF
unset encoded_password
chown root:aichain-governance-pilot-worker "$tmp"
chmod 0640 "$tmp"
mv -n -- "$tmp" "$dest"
echo 'Root-owned worker config installed in paused mode. Running one bounded preflight.'
systemd-run --unit=aichain-governance-pilot-worker-preflight --collect --wait --pipe \
  -p User=aichain-governance-pilot-worker -p Group=aichain-governance-pilot-worker \
  -p WorkingDirectory="$base" -p EnvironmentFile="$dest" \
  "$node" scripts/governance-worker.cjs --once
