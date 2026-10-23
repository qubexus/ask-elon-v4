"""Ask Elon – wersja testowa na żywo.
Serwuje zbudowaną aplikację webową (Expo export) i przekazuje /api do backendu, wszystko pod jednym adresem.
Użycie: python3 serve.py <katalog_dist> <port> <port_backendu>"""
import http.client, os, sys
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
ROOT = os.path.abspath(sys.argv[1]); PORT = int(sys.argv[2]); BACK = ("127.0.0.1", int(sys.argv[3]))
TYPES = {".html":"text/html; charset=utf-8",".js":"application/javascript",".css":"text/css",".json":"application/json",
 ".png":"image/png",".jpg":"image/jpeg",".svg":"image/svg+xml",".ico":"image/x-icon",".ttf":"font/ttf",".woff":"font/woff",".woff2":"font/woff2",".webp":"image/webp",".map":"application/json",".txt":"text/plain"}
HOP = {"connection","keep-alive","transfer-encoding","te","trailer","upgrade","proxy-authorization","proxy-authenticate","host"}
class H(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def log_message(self, f, *a): sys.stderr.write("%s %s\n" % (self.headers.get("x-forwarded-for", self.client_address[0]), f % a))
    def read_body(self):
        if "chunked" in (self.headers.get("transfer-encoding") or "").lower():
            data = b""
            while True:
                size = int(self.rfile.readline().split(b";")[0].strip() or b"0", 16)
                if size == 0:
                    while self.rfile.readline() not in (b"\r\n", b"\n", b""): pass
                    return data
                data += self.rfile.read(size); self.rfile.readline()
        n = int(self.headers.get("content-length") or 0)
        return self.rfile.read(n) if n else None
    def proxy(self):
        body = self.read_body()
        hdr = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        xff = [x.strip() for x in self.headers.get("x-forwarded-for", "").split(",") if x.strip()]
        ip = (xff[-1] if xff else None) or self.headers.get("cf-connecting-ip") or self.client_address[0]
        hdr["X-Forwarded-For"] = ip; hdr["X-Forwarded-Proto"] = "https"; hdr["X-Forwarded-Host"] = self.headers.get("host", "")
        c = http.client.HTTPConnection(*BACK, timeout=300)
        try:
            c.request(self.command, self.path, body=body, headers=hdr); r = c.getresponse()
        except Exception as e:
            self.send_response(502); self.send_header("Content-Length","0"); self.end_headers(); return
        self.send_response(r.status)
        for k, v in r.getheaders():
            if k.lower() not in HOP and k.lower() != "content-length": self.send_header(k, v)
        self.send_header("Transfer-Encoding", "chunked"); self.end_headers()
        while True:
            chunk = r.read1(65536) if hasattr(r, "read1") else r.read(65536)
            if not chunk: break
            self.wfile.write(b"%x\r\n%s\r\n" % (len(chunk), chunk)); self.wfile.flush()
        self.wfile.write(b"0\r\n\r\n"); c.close()
    def static(self):
        p = self.path.split("?")[0].split("#")[0]
        f = os.path.normpath(os.path.join(ROOT, p.lstrip("/")))
        if not f.startswith(ROOT): f = ROOT
        if os.path.isdir(f): f = os.path.join(f, "index.html")
        if not os.path.isfile(f) and os.path.isfile(f + ".html"): f = f + ".html"
        if not os.path.isfile(f): f = os.path.join(ROOT, "index.html")   # SPA fallback
        data = open(f, "rb").read(); ext = os.path.splitext(f)[1]
        self.send_response(200); self.send_header("Content-Type", TYPES.get(ext, "application/octet-stream"))
        self.send_header("Content-Length", str(len(data)))
        self.send_header("Cache-Control", "no-cache" if ext == ".html" else "public, max-age=3600")
        self.send_header("X-Content-Type-Options", "nosniff"); self.end_headers()
        if self.command != "HEAD": self.wfile.write(data)
    def route(self):
        if self.path.startswith("/api/") or self.path == "/api": self.proxy()
        elif self.command in ("GET", "HEAD"): self.static()
        else: self.send_response(405); self.send_header("Content-Length","0"); self.end_headers()
    do_GET = do_HEAD = do_POST = do_PUT = do_PATCH = do_DELETE = do_OPTIONS = route
ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
