#!/usr/bin/env bash
set -euo pipefail
umask 077

# Run interactively on the VPS after the pilot WorkOS environment exists.
# Secrets are read without echo and are never passed as command-line arguments.
[[ $(id -u) -eq 0 && -t 0 ]] || { echo 'Run as root in an interactive SSH terminal' >&2; exit 2; }
dest=/etc/aichain-governance-synthetic-api.env
[[ ! -e "$dest" ]] || { echo 'Runtime configuration already exists; review before replacing it' >&2; exit 2; }
read -rsp '1Password governance_api database password: ' db_password; echo
read -rsp 'Pilot WorkOS API key (sk_...): ' api_key; echo
read -rsp 'Pilot WorkOS webhook signing secret: ' webhook_secret; echo

[[ ${#db_password} -ge 12 && ${#db_password} -le 1024 && "$db_password" != *$'\n'* && "$db_password" != *$'\r'* ]] || { echo 'Invalid database password input' >&2; exit 2; }
[[ "$api_key" =~ ^sk_[A-Za-z0-9_]+$ ]] || { echo 'Invalid pilot API key' >&2; exit 2; }
[[ ${#webhook_secret} -ge 24 && ${#webhook_secret} -le 512 && "$webhook_secret" =~ ^[A-Za-z0-9._~+/=-]+$ && "$webhook_secret" != we_* ]] || { echo 'Invalid webhook signing secret: copy the Signing secret value from the WorkOS webhook endpoint, not its we_ endpoint ID or URL' >&2; exit 2; }

node=/opt/aichain/.toolchains/node-v24.21.0-linux-x64/bin/node
encoded_password=$(printf '%s' "$db_password" | "$node" -e 'let s="";process.stdin.on("data",c=>s+=c);process.stdin.on("end",()=>process.stdout.write(encodeURIComponent(s)))')
unset db_password
seal_key=$(openssl rand -hex 32)
tmp=$(mktemp /etc/.aichain-governance-synthetic-api.XXXXXXXX)
trap 'rm -f -- "$tmp"' EXIT
cat >"$tmp" <<EOF
GOVERNANCE_ENV=test
GOVERNANCE_STORAGE=postgres
GOVERNANCE_KEY_STORAGE=postgres
GOVERNANCE_CONTROL_STORAGE=postgres
GOVERNANCE_DATABASE_URL=postgresql://governance_api:${encoded_password}@orvessian-pilot-test-do-user-45565720-0.k.db.ondigitalocean.com:25060/governance_test?sslmode=verify-full
GOVERNANCE_DATABASE_CA_FILE=/etc/aichain/governance/digitalocean-ca.crt
GOVERNANCE_IDENTITY_PROVIDER=workos
WORKOS_CLIENT_ID=client_01M415264WYTWS294EMP8CNJNT
WORKOS_API_KEY=${api_key}
WORKOS_REDIRECT_URI=https://portal.orvessian.com/api/auth/callback
WORKOS_PILOT_ALLOWED_EMAILS=mjgrant@live.co.uk
WORKOS_WEBHOOK_SECRET=${webhook_secret}
GOVERNANCE_IDENTITY_SEAL_KEY=${seal_key}
PORT=8796
EOF
chmod 0600 "$tmp"
chown root:root "$tmp"
mv -n -- "$tmp" "$dest"
unset encoded_password api_key webhook_secret seal_key
echo 'Protected runtime file installed. Running read-only application preflight.'
systemd-run --unit=aichain-governance-pilot-preflight --collect --wait --pipe \
  -p User=aichain-governance-api -p Group=aichain-governance-api \
  -p WorkingDirectory=/opt/aichain/governance-pilot-api \
  -p EnvironmentFile="$dest" \
  "$node" scripts/governance-hosted-synthetic-api.cjs --preflight
