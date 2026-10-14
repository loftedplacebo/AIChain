#!/usr/bin/env python3
"""Report non-secret WorkOS webhook API response shape for troubleshooting."""

import json
import pathlib
import re
import urllib.error
import urllib.request


SOURCE = pathlib.Path('/etc/aichain/production/workos.env')
TARGET = 'we_01M4VBTD55EZZQWYRHARZX79GN'


def main():
    raw = SOURCE.read_text(encoding='ascii')
    match = re.fullmatch(r'WORKOS_API_KEY=(sk_[A-Za-z0-9_-]{20,1020})\n', raw)
    if not match:
        print('workos_response=local_key_shape_unexpected')
        return
    request = urllib.request.Request(
        'https://api.workos.com/webhook_endpoints?limit=100',
        headers={'Authorization': 'Bearer ' + match.group(1),
                 'Accept': 'application/json'},
    )
    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            status = response.status
            payload = json.load(response)
    except urllib.error.HTTPError as error:
        print('workos_response=http_' + str(error.code))
        return
    except (OSError, ValueError):
        print('workos_response=connection_or_json_error')
        return
    if not isinstance(payload, dict):
        print('workos_response=unexpected_top_level;http=' + str(status))
        return
    entries = payload.get('data')
    if not isinstance(entries, list):
        print('workos_response=unexpected_list;http=' + str(status) +
              ';fields=' + ','.join(sorted(str(key) for key in payload)))
        return
    matches = [item for item in entries
               if isinstance(item, dict) and item.get('id') == TARGET]
    if len(matches) != 1:
        print('workos_response=target_count_' + str(len(matches)) +
              ';http=' + str(status) + ';entries=' + str(len(entries)))
        return
    item = matches[0]
    secret = item.get('secret')
    print('workos_response=target_found;http=' + str(status) +
          ';fields=' + ','.join(sorted(str(key) for key in item)) +
          ';url_match=' + str(item.get('endpoint_url') ==
              'https://api-prod.orvessian.com/v1/auth/workos-webhook').lower() +
          ';events_match=' + str(item.get('events') == ['session.revoked']).lower() +
          ';status=' + str(item.get('status'))[:16] +
          ';secret_present=' + str(isinstance(secret, str) and bool(secret)).lower() +
          ';secret_length=' + str(len(secret) if isinstance(secret, str) else 0) +
          ';starts_whsec=' + str(isinstance(secret, str) and
              secret.startswith('whsec_')).lower() +
          ';masked=' + str(isinstance(secret, str) and
              '*' in secret).lower() +
          ';alphanumeric=' + str(isinstance(secret, str) and
              secret.isalnum()).lower() +
          ';url_safe_suffix=' + str(isinstance(secret, str) and bool(
              re.fullmatch(r'[A-Za-z0-9_-]*', secret[6:]))).lower() +
          ';secret_format=' + str(isinstance(secret, str) and bool(
              re.fullmatch(r'whsec_[A-Za-z0-9_-]{20,500}', secret))).lower())


if __name__ == '__main__':
    main()
