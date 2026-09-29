"""Framework-neutral customer-side durable metadata queue."""
import json
import sqlite3
import threading

class DeliveryQueue:
    """One local queue per API origin/tenant/project; no credentials on disk.

    Explicit flush performs network IO outside the framework callback. Acknowledged
    records are removed. An uncertain acknowledgement leaves original bytes queued.
    Protect the file using customer OS permissions and encrypted storage as needed.
    """
    def __init__(self, path, client, *, capacity=1000):
        if not path or str(path) == ':memory:':
            raise ValueError('Persistent queue path required')
        if type(capacity) is not int or not 1 <= capacity <= 10000:
            raise ValueError('Queue capacity must be 1–10000')
        self.__client, self.__capacity = client, capacity
        self.__scope = (client.base_url, client.tenant, client.project)
        self._lock, self._flush_lock = threading.RLock(), threading.Lock()
        self._db = sqlite3.connect(path, check_same_thread=False, timeout=5)
        self._db.execute('PRAGMA journal_mode=WAL')
        self._db.execute('PRAGMA synchronous=FULL')
        self._db.executescript('CREATE TABLE IF NOT EXISTS scope(id INTEGER PRIMARY KEY CHECK(id=1), body TEXT NOT NULL); CREATE TABLE IF NOT EXISTS pending(id TEXT PRIMARY KEY, body TEXT NOT NULL);')
        scope = json.dumps(self.__scope)
        with self._db:
            self._db.execute('INSERT OR IGNORE INTO scope VALUES(1,?)', (scope,))
        if self._db.execute('SELECT body FROM scope WHERE id=1').fetchone()[0] != scope:
            self._db.close()
            raise ValueError('Queue belongs to a different API or project')

    @property
    def client(self): return self.__client

    @property
    def capacity(self): return self.__capacity

    def _check_scope(self):
        if (self.client.base_url, self.client.tenant, self.client.project) != self.__scope:
            raise ValueError('Queue client scope changed; queued records retained')

    def _enqueue(self, record):
        body = json.dumps(record, sort_keys=True, separators=(',', ':'), allow_nan=False)
        if len(body.encode('utf-8')) > 65536:
            raise ValueError('Adapter metadata exceeds queue bound')
        with self._lock:
            self._check_scope()
            try:
                self._db.execute('BEGIN IMMEDIATE')
                row = self._db.execute('SELECT body FROM pending WHERE id=?', (record['event_id'],)).fetchone()
                if row:
                    if row[0] != body:
                        raise ValueError('Queued event identity conflict')
                else:
                    if self._db.execute('SELECT count(*) FROM pending').fetchone()[0] >= self.capacity:
                        raise ValueError('Queue capacity reached')
                    self._db.execute('INSERT INTO pending VALUES(?,?)', (record['event_id'], body))
                self._db.commit()
            except Exception:
                self._db.rollback()
                raise

    @property
    def pending(self):
        with self._lock:
            return self._db.execute('SELECT count(*) FROM pending').fetchone()[0]

    def enqueue_outcome(self, **record):
        # Validate before persistence. The timestamp and identity are caller-owned.
        self._check_scope()
        self.client.build_outcome(**record)
        self._enqueue(dict(record, _operation='outcome'))

    def flush(self, *, limit=100):
        """Returns acknowledged count; raises on failure, preserving unsent records.

        Stop on first error, including 409. Resolve conflicts explicitly; do not
        discard or change original evidence automatically.
        """
        if type(limit) is not int or not 1 <= limit <= 10000:
            raise ValueError('Flush limit must be 1–10000')
        accepted = 0
        with self._flush_lock:
            self._check_scope()
            for _ in range(limit):
                with self._lock:
                    self._check_scope()
                    row = self._db.execute('SELECT id,body FROM pending ORDER BY rowid LIMIT 1').fetchone()
                if not row:
                    break
                record = json.loads(row[1])
                operation = record.pop('_operation', 'run')
                if operation not in ('run', 'outcome'): raise ValueError('Unknown queued operation')
                result = (self.client.record_outcome if operation == 'outcome' else self.client.record_run)(**record)
                if not isinstance(result, dict) or result.get('status') not in ('accepted', 'duplicate') or result.get('eventId') != row[0]:
                    raise RuntimeError('Unexpected ingestion acknowledgement; record retained')
                with self._lock, self._db:
                    self._db.execute('DELETE FROM pending WHERE id=? AND body=?', row)
                accepted += 1
        return accepted

    def close(self):
        with self._flush_lock, self._lock:
            self._db.close()
