"""Loopback-only report server with read-only website asset fallback."""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
REPORT = ROOT / 'reports/order-experience-20260920'
SITE = ROOT / 'website'

class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        relative = unquote(urlsplit(path).path).lstrip('/') or 'index.html'
        for base in (REPORT, SITE):
            candidate = (base / relative).resolve()
            if candidate.is_relative_to(base) and candidate.is_file():
                return str(candidate)
        return str(REPORT / '__not_found__')
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()
    def log_message(self, *args):
        pass

if __name__ == '__main__':
    print('Order previews: http://127.0.0.1:4174', flush=True)
    ThreadingHTTPServer(('127.0.0.1', 4174), Handler).serve_forever()
