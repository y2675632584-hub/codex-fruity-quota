"""Loopback-only preview and sanitized read-only quota API."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
from urllib.parse import urlsplit

from .usage import UsageCache, UsageError, read_usage

WEB = Path(__file__).resolve().parent.parent / "web"
FILES = {"/": ("rail.html", "text/html"),
         "/index.html": ("index.html", "text/html"),
         "/preview.css": ("preview.css", "text/css"),
         "/preview.js": ("preview.js", "text/javascript"),
         "/quota-model.js": ("quota-model.js", "text/javascript"),
         "/quota-orbit.js": ("quota-orbit.js", "text/javascript"),
         "/rail.html": ("rail.html", "text/html"),
         "/rail.css": ("rail.css", "text/css"),
         "/rail-preview.js": ("rail-preview.js", "text/javascript")}


def create_server(port=8765, cache=None):
    usage = cache or UsageCache()

    class Handler(BaseHTTPRequestHandler):
        def do_GET(self):
            expected = f"127.0.0.1:{self.server.server_port}"
            # Disallow DNS rebinding and browser cross-site reads.
            if self.headers.get("Host") not in (expected, f"localhost:{self.server.server_port}"):
                self.respond(403, b"Forbidden", "text/plain")
                return
            origin = self.headers.get("Origin")
            if origin and origin not in (f"http://{expected}", f"http://localhost:{self.server.server_port}"):
                self.respond(403, b"Forbidden", "text/plain")
                return
            if self.headers.get("Sec-Fetch-Site") == "cross-site":
                self.respond(403, b"Forbidden", "text/plain")
                return
            path = urlsplit(self.path).path
            if path == "/api/usage":
                self.respond(200, json.dumps(usage.get(), ensure_ascii=False).encode(), "application/json")
                return
            if path == "/injected-orbit.js":
                self.respond(200, (WEB.parent / "src/injected-orbit.js").read_bytes(), "text/javascript")
                return
            item = FILES.get(path)
            if item is None:
                self.respond(404, b"Not found", "text/plain")
                return
            self.respond(200, (WEB / item[0]).read_bytes(), item[1])

        def respond(self, status, body, mime):
            self.send_response(status)
            self.send_header("Content-Type", mime + "; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'")
            self.end_headers()
            self.wfile.write(body)

        def log_message(self, *_):
            pass

    return ThreadingHTTPServer(("127.0.0.1", port), Handler)


def main():
    parser = argparse.ArgumentParser(description="Codex 果味额度条 local preview. Does not modify Codex Desktop.")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--once", action="store_true", help="Print sanitized live quota JSON and exit")
    args = parser.parse_args()
    if args.once:
        try:
            print(json.dumps(read_usage(), ensure_ascii=False, indent=2))
        except UsageError as error:
            parser.exit(1, str(error) + "\n")
        return
    server = create_server(args.port)
    print(f"Codex 果味额度条 preview: http://127.0.0.1:{server.server_port}", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
