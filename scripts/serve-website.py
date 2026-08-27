from __future__ import annotations

import sys
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import mimetypes
from pathlib import Path
from urllib.parse import unquote, urlsplit, urlunsplit


PROJECT_ROOT = Path(__file__).resolve().parents[1]
WEBSITE_ROOT = PROJECT_ROOT / "website"

mimetypes.add_type("application/javascript", ".mjs")


class CleanUrlHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEBSITE_ROOT), **kwargs)

    def send_head(self):
        parsed = urlsplit(self.path)
        request_path = unquote(parsed.path)

        if request_path.rstrip("/").startswith("/magazin/produs/"):
            self.path = urlunsplit((parsed.scheme, parsed.netloc, "/produs.html", parsed.query, parsed.fragment))
            return super().send_head()

        if request_path != "/" and not Path(request_path).suffix:
            html_candidate = WEBSITE_ROOT / f"{request_path.lstrip('/')}.html"
            if html_candidate.is_file():
                self.path = urlunsplit((parsed.scheme, parsed.netloc, f"{parsed.path}.html", parsed.query, parsed.fragment))

        return super().send_head()


def main() -> None:
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 4173
    server = ThreadingHTTPServer(("localhost", port), CleanUrlHandler)
    print(f"G-Trots website available at http://localhost:{port}", flush=True)
    server.serve_forever()


if __name__ == "__main__":
    main()
