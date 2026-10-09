import http.client
import json
import tempfile
from pathlib import Path
import threading
import time
import unittest

from orbit.usage import UsageCache, UsageError, normalize, read_usage
from orbit.server import create_server


def payload(used=26, week=75, resets=2):
    return {"rateLimitsByLimitId": {"codex": {
        "primary": {"usedPercent": used, "windowDurationMins": 300, "resetsAt": 2000000000},
        "secondary": {"usedPercent": week, "windowDurationMins": 10080, "resetsAt": 2000100000}}},
        "rateLimitResetCredits": {"availableCount": resets,
                                 "credits": [{"id": "PRIVATE_RESET_ID"}]},
        "accountId": "PRIVATE_ACCOUNT_ID"}


class UsageTests(unittest.TestCase):
    def test_real_quota_semantics_and_whitelist(self):
        data = normalize(payload(), now=100)
        self.assertEqual(data["fiveHour"]["remainingPercent"], 74)
        self.assertEqual(data["weekly"]["remainingPercent"], 25)
        self.assertEqual(data["resetCount"], 2)
        self.assertNotIn("PRIVATE", json.dumps(data))

    def test_window_identification_survives_reordering(self):
        data = payload()
        limits = data["rateLimitsByLimitId"]["codex"]
        limits["primary"], limits["secondary"] = limits["secondary"], limits["primary"]
        self.assertEqual(normalize(data)["fiveHour"]["usedPercent"], 26)

    def test_unknown_is_never_zero_or_full(self):
        data = payload(used=None, resets=None)
        result = normalize(data)
        self.assertIsNone(result["fiveHour"])
        self.assertIsNone(result["resetCount"])
        for invalid in [None, True, float("nan"), float("inf"), "25"]:
            with self.assertRaises(UsageError):
                normalize(payload(invalid, invalid))
        self.assertEqual(normalize(payload(-2, 105))["weekly"]["remainingPercent"], 0)
        self.assertEqual(normalize(payload(-2))["fiveHour"]["remainingPercent"], 100)

    def test_codex_bucket_and_legacy_fallback(self):
        data = payload()
        data["rateLimits"] = data["rateLimitsByLimitId"]["codex"]
        data["rateLimitsByLimitId"] = {"other": data["rateLimits"]}
        with self.assertRaises(UsageError):
            normalize(data)
        del data["rateLimitsByLimitId"]
        self.assertEqual(normalize(data)["fiveHour"]["remainingPercent"], 74)

    def test_zero_resets_and_missing_resets_are_distinct(self):
        self.assertEqual(normalize(payload(resets=0))["resetCount"], 0)
        for value in [None, -1, True, 2.4]:
            self.assertIsNone(normalize(payload(resets=value))["resetCount"])

    def test_cache_failure_preserves_old_timestamp_and_marks_stale(self):
        calls = []
        def fetch():
            calls.append(1)
            if len(calls) > 1:
                raise UsageError("offline")
            return normalize(payload(), now=100)
        cache = UsageCache(fetch=fetch, ttl=60)
        self.assertEqual(cache.get()["status"], "live")
        self.assertEqual(cache.get()["status"], "live")
        self.assertEqual(len(calls), 1)
        cache.checked_at = float("-inf")
        result = cache.get()
        self.assertEqual(result["status"], "stale")
        self.assertEqual(result["fetchedAt"], 100)

    def test_rpc_handshake_ignores_notifications_and_cleans_process(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / "fake-codex"
            executable.write_text("#!/usr/bin/env python3\nimport sys,json\n"
                                  "a=json.loads(sys.stdin.readline())\n"
                                  "assert a['method']=='initialize'\n"
                                  "print(json.dumps({'method':'notification'}),flush=True)\n"
                                  "print(json.dumps({'id':1,'result':{}}),flush=True)\n"
                                  "b=json.loads(sys.stdin.readline())\n"
                                  "assert b['method']=='initialized'\n"
                                  "c=json.loads(sys.stdin.readline())\n"
                                  "assert c['method']=='account/rateLimits/read'\n"
                                  f"print(json.dumps({{'id':2,'result':{payload()!r}}}),flush=True)\n")
            executable.chmod(0o700)
            self.assertEqual(read_usage(executable=str(executable))["resetCount"], 2)

    def test_rpc_timeout_is_bounded(self):
        with tempfile.TemporaryDirectory() as folder:
            executable = Path(folder) / "fake-codex"
            executable.write_text("#!/usr/bin/env python3\nimport time\ntime.sleep(60)\n")
            executable.chmod(0o700)
            started = time.monotonic()
            with self.assertRaises(UsageError):
                read_usage(executable=str(executable), timeout=.2)
            self.assertLess(time.monotonic() - started, 3)


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.server = create_server(0, UsageCache(fetch=lambda: normalize(payload())))
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()
        self.port = self.server.server_port

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()

    def request(self, path, headers=None):
        connection = http.client.HTTPConnection("127.0.0.1", self.port)
        connection.request("GET", path, headers=headers or {})
        response = connection.getresponse()
        result = (response.status, response.read())
        connection.close()
        return result

    def test_sanitized_api_and_static_allowlist(self):
        status, body = self.request("/api/usage")
        self.assertEqual(status, 200)
        self.assertNotIn(b"PRIVATE", body)
        self.assertEqual(self.request("/quota-orbit.js")[0], 200)
        self.assertEqual(self.request("/../orbit/usage.py")[0], 404)
        self.assertEqual(self.request("/auth.json")[0], 404)

    def test_cross_origin_and_rebinding_are_blocked(self):
        self.assertEqual(self.request("/api/usage", {"Host": "attacker.example"})[0], 403)
        self.assertEqual(self.request("/api/usage", {"Origin": "https://attacker.example"})[0], 403)
        self.assertEqual(self.request("/api/usage", {"Sec-Fetch-Site": "cross-site"})[0], 403)


if __name__ == "__main__":
    unittest.main()

class WeeklyOnlyTests(unittest.TestCase):
    def test_weekly_only_ring(self):
        from orbit.usage import normalize
        value = normalize({'rateLimits': {'primary': {'usedPercent': 35, 'windowDurationMins': 10080}}})
        self.assertEqual(value['ringWindow'], 'weekly')
        self.assertIsNone(value['fiveHour'])
        self.assertEqual(value['weekly']['remainingPercent'], 65)
