"""
Servidor local para probar GymFit.

Uso (desde la terminal de VS Code, dentro de la carpeta del proyecto):
    python serve.py

- En el PC se abre automáticamente http://localhost:8000
- En el iPhone (misma WiFi) abre la dirección "En el iPhone" que aparece en la terminal.
  Si Windows pregunta por el firewall, pulsa "Permitir acceso" (red privada).
"""
import http.server
import os
import socket
import sys
import webbrowser

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows a veces sirve .js como text/plain y los módulos fallan: lo forzamos aquí
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".png": "image/png",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        # Sin caché mientras desarrollas, así ves los cambios al recargar
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        pass  # terminal limpia


def local_ip():
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


if __name__ == "__main__":
    ip = local_ip()
    with http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler) as httpd:
        print("\n  GymFit en marcha 💪\n")
        print(f"  En el PC:      http://localhost:{PORT}")
        print(f"  En el iPhone:  http://{ip}:{PORT}   (misma WiFi)\n")
        print("  Pulsa Ctrl+C para parar.\n")
        webbrowser.open(f"http://localhost:{PORT}")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n  Servidor parado.")
            
