"""Read the documented account/rateLimits/read API via the user's Codex CLI.

No auth file parsing, token copying, model turn, or credit consumption.
"""
import json
import math
import os
from pathlib import Path
import queue
import shutil
import subprocess
import threading
import time


class UsageError(Exception):
    pass


def find_codex():
    configured = os.environ.get("CODEX_ORBIT_CLI")
    if configured:
        path = Path(configured).expanduser()
        if path.is_file() and os.access(path, os.X_OK):
            return str(path)
        raise UsageError("CODEX_ORBIT_CLI 指向的文件不存在或不能运行。")
    # Prefer the desktop's bundled CLI so it uses the same installed runtime.
    candidates = [
        "/Applications/Codex.app/Contents/Resources/codex",
        "/Applications/Codex.app/Contents/Resources/codex-cli/bin/codex",
        "/Applications/ChatGPT.app/Contents/Resources/codex-cli/bin/codex",
    ]
    for candidate in candidates:
        if Path(candidate).is_file() and os.access(candidate, os.X_OK):
            return candidate
    executable = shutil.which("codex")
    if executable:
        return executable
    raise UsageError("未找到 Codex CLI。请安装并登录 Codex，或设置 CODEX_ORBIT_CLI。")


def finite_number(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def normalize(payload, now=None):
    """Whitelist quota fields. Never expose account IDs, reset IDs, or credentials."""
    if not isinstance(payload, dict):
        raise UsageError("额度接口返回了无法识别的数据。")
    buckets = payload.get("rateLimitsByLimitId")
    # When the multi-bucket view exists, never substitute a different model bucket.
    limits = buckets.get("codex", {}) if isinstance(buckets, dict) else payload.get("rateLimits", {})
    if not isinstance(limits, dict):
        limits = {}
    windows = [w for w in [limits.get("primary"), limits.get("secondary")] if isinstance(w, dict)]

    def window(duration):
        item = next((w for w in windows if w.get("windowDurationMins") == duration), None)
        if item is None or not finite_number(item.get("usedPercent")):
            return None
        used = max(0, min(100, float(item["usedPercent"])))
        reset = item.get("resetsAt")
        return {"usedPercent": used, "remainingPercent": 100 - used,
                "resetsAt": reset if finite_number(reset) and reset > 0 else None,
                "windowDurationMins": duration}

    credits = payload.get("rateLimitResetCredits")
    count = credits.get("availableCount") if isinstance(credits, dict) else None
    count = count if isinstance(count, int) and not isinstance(count, bool) and count >= 0 else None
    result = {"fiveHour": window(300), "weekly": window(10080), "resetCount": count,
              "ringWindow": "fiveHour" if any(w.get("windowDurationMins") == 300 for w in windows) else "weekly" if window(10080) else None,
              "fetchedAt": time.time() if now is None else now, "source": "codex-app-server",
              "status": "live"}
    if result["fiveHour"] is None and result["weekly"] is None:
        raise UsageError("当前登录未提供 5 小时或周额度。请确认 Codex 使用 ChatGPT 订阅账号登录。")
    return result


def read_usage(timeout=20, executable=None):
    process = subprocess.Popen([executable or find_codex(), "app-server"],
                               stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                               stderr=subprocess.DEVNULL, bufsize=0)
    messages = queue.Queue()

    def pump():
        try:
            for line in process.stdout:
                try:
                    message = json.loads(line)
                    if isinstance(message, dict):
                        messages.put(message)
                except (ValueError, UnicodeDecodeError):
                    continue
        finally:
            messages.put(None)

    reader = threading.Thread(target=pump, daemon=True)
    reader.start()

    def send(message):
        process.stdin.write((json.dumps(message) + "\n").encode())
        process.stdin.flush()

    deadline = time.monotonic() + timeout

    def receive(request_id):
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0:
                raise UsageError("读取额度超时，请稍后刷新。")
            try:
                message = messages.get(timeout=remaining)
            except queue.Empty:
                raise UsageError("读取额度超时，请稍后刷新。") from None
            if message is None:
                raise UsageError("Codex CLI 已关闭，未返回额度。")
            if message.get("id") != request_id:
                continue
            if "error" in message:
                # Do not surface opaque upstream messages containing account data.
                raise UsageError("Codex 额度接口暂不可用，请确认账号已登录后重试。")
            return message.get("result")

    try:
        send({"method": "initialize", "id": 1, "params": {
            "clientInfo": {"name": "codex_orbit", "title": "Codex 果味额度条", "version": "0.3.0"}}})
        receive(1)
        send({"method": "initialized", "params": {}})
        send({"method": "account/rateLimits/read", "id": 2})
        return normalize(receive(2))
    except (BrokenPipeError, OSError):
        raise UsageError("无法连接 Codex CLI，请检查安装及登录状态。") from None
    finally:
        process.stdin.close()
        if process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=2)
            except subprocess.TimeoutExpired:
                process.kill()
                process.wait()
        process.stdout.close()
        reader.join(timeout=1)


class UsageCache:
    def __init__(self, fetch=read_usage, ttl=60):
        self.fetch = fetch
        self.ttl = ttl
        self.lock = threading.Lock()
        self.checked_at = float("-inf")
        self.last_good = None
        self.error = None

    def get(self):
        with self.lock:
            if time.monotonic() - self.checked_at >= self.ttl:
                try:
                    self.last_good = self.fetch()
                    self.error = None
                except (UsageError, OSError):
                    self.error = "暂时无法同步额度，请检查 Codex 登录或网络。"
                self.checked_at = time.monotonic()
            if self.last_good is None:
                return {"fiveHour": None, "weekly": None, "resetCount": None,
                        "fetchedAt": None, "status": "unavailable", "error": self.error}
            if self.error:
                return {**self.last_good, "status": "stale", "error": self.error}
            return dict(self.last_good)
