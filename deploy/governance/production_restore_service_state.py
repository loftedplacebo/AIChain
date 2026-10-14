"""Guard a closed restore drill while the webhook-only API remains live."""

import subprocess


API = 'orvessian-production-api.service'
PORTAL = 'orvessian-production-portal.service'


def unit_state(unit):
    result = subprocess.run(('systemctl', 'show', unit, '-p', 'UnitFileState',
                             '-p', 'ActiveState'), capture_output=True,
                            text=True, timeout=15, check=False)
    if result.returncode:
        raise ValueError('Production service state unavailable')
    return set(result.stdout.splitlines())


def closed_edge(host, path):
    result = subprocess.run(('curl', '--silent', '--show-error', '--max-time', '5',
                             '--output', '/dev/null', '--write-out', '%{http_code}',
                             '--resolve', host + ':443:127.0.0.1',
                             'https://' + host + path), capture_output=True,
                            text=True, timeout=10, check=False)
    return result.returncode == 0 and result.stdout == '404'


def require_closed_restore_services():
    api = unit_state(API)
    portal = unit_state(PORTAL)
    allowed_api = ({'UnitFileState=disabled', 'ActiveState=inactive'},
                   {'UnitFileState=enabled', 'ActiveState=active'})
    if api not in allowed_api or portal != {
            'UnitFileState=disabled', 'ActiveState=inactive'}:
        raise ValueError('Closed Production restore service state required')
    if not closed_edge('prod.orvessian.com', '/') or \
            not closed_edge('api-prod.orvessian.com', '/health'):
        raise ValueError('Production customer edge must remain closed')
    return 'webhook_only' if api == allowed_api[1] else 'fully_offline'
