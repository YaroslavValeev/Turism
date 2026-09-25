from __future__ import annotations

import http.client
import http.server
import importlib.util
import sys
import threading
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def load_module(name: str, relative_path: str):
    spec = importlib.util.spec_from_file_location(name, ROOT / relative_path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {relative_path}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[name] = module
    spec.loader.exec_module(module)
    return module


webhook_ingress = load_module("webhook_ingress", "bin/webhook_ingress.py")


class StaticResolver:
    def __init__(self, host: str, port: int) -> None:
        self.host = host
        self.port = port
        self.invalidations = 0

    def resolve(self) -> tuple[str, int]:
        return self.host, self.port

    def invalidate(self) -> None:
        self.invalidations += 1


class RecordingServer(http.server.ThreadingHTTPServer):
    daemon_threads = False
    block_on_close = True

    def __init__(self) -> None:
        self.requests: list[dict[str, object]] = []
        self.requests_lock = threading.Lock()
        super().__init__(("127.0.0.1", 0), RecordingHandler)


class RecordingHandler(http.server.BaseHTTPRequestHandler):
    server: RecordingServer
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:
        self._record_and_reply()

    def do_POST(self) -> None:
        self._record_and_reply()

    def _record_and_reply(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = self.rfile.read(length)
        request = {
            "method": self.command,
            "path": self.path,
            "headers": dict(self.headers.items()),
            "body": body,
        }
        with self.server.requests_lock:
            self.server.requests.append(request)
        response = b'{"status":"ok"}'
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(response)))
        self.send_header("Connection", "close")
        self.end_headers()
        self.wfile.write(response)

    def log_message(self, format: str, *args: object) -> None:
        return


class ProxyHarness:
    def __init__(self, max_request_body: int = 1024 * 1024) -> None:
        self.upstream = RecordingServer()
        upstream_host, upstream_port = self.upstream.server_address
        self.resolver = StaticResolver(upstream_host, upstream_port)
        self.proxy = webhook_ingress.WebhookIngressServer(
            ("127.0.0.1", 0),
            self.resolver,
            max_request_body=max_request_body,
            max_response_body=1024,
            max_concurrent_requests=4,
            connect_timeout=1.0,
            read_timeout=1.0,
        )
        self.upstream_thread = threading.Thread(target=self.upstream.serve_forever)
        self.proxy_thread = threading.Thread(target=self.proxy.serve_forever)
        self.upstream_thread.start()
        self.proxy_thread.start()

    def close(self) -> None:
        self.proxy.begin_shutdown()
        self.proxy.shutdown()
        self.proxy.server_close()
        self.proxy_thread.join(timeout=2.0)
        self.upstream.shutdown()
        self.upstream.server_close()
        self.upstream_thread.join(timeout=2.0)

    def request(
        self,
        method: str,
        path: str,
        body: bytes | None = None,
        headers: dict[str, str] | None = None,
    ) -> tuple[int, bytes]:
        host, port = self.proxy.server_address
        connection = http.client.HTTPConnection(host, port, timeout=2.0)
        try:
            connection.request(method, path, body=body, headers=headers or {})
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()

    def request_headers_only(
        self,
        method: str,
        path: str,
        headers: dict[str, str],
    ) -> tuple[int, bytes]:
        host, port = self.proxy.server_address
        connection = http.client.HTTPConnection(host, port, timeout=2.0)
        try:
            connection.putrequest(method, path)
            for name, value in headers.items():
                connection.putheader(name, value)
            connection.endheaders()
            response = connection.getresponse()
            return response.status, response.read()
        finally:
            connection.close()


class WebhookIngressTests(unittest.TestCase):
    def setUp(self) -> None:
        self.harnesses: list[ProxyHarness] = []

    def tearDown(self) -> None:
        for harness in reversed(self.harnesses):
            harness.close()

    def harness(self, max_request_body: int = 1024 * 1024) -> ProxyHarness:
        harness = ProxyHarness(max_request_body=max_request_body)
        self.harnesses.append(harness)
        return harness

    def test_route_allowlist(self) -> None:
        harness = self.harness()

        status, _ = harness.request("GET", "/health")
        self.assertEqual(status, 200)
        self.assertEqual(len(harness.upstream.requests), 1)

        for method, path, body in (
            ("GET", "/public/telegram/webhook", None),
            ("POST", "/health", b"{}"),
            ("PUT", "/public/telegram/webhook", b"{}"),
            ("GET", "/health?verbose=1", None),
        ):
            status, response_body = harness.request(method, path, body)
            self.assertEqual(status, 404)
            self.assertEqual(response_body, b"")
        self.assertEqual(len(harness.upstream.requests), 1)

    def test_forwards_only_allowed_request_headers(self) -> None:
        harness = self.harness()
        body = b'{"update_id":1}'
        status, _ = harness.request(
            "POST",
            "/public/telegram/webhook",
            body,
            {
                "Content-Type": "application/json",
                "X-Telegram-Bot-Api-Secret-Token": "test-secret",
                "X-Forwarded-For": "203.0.113.10",
                "CF-Connecting-IP": "203.0.113.11",
                "CF-Ray": "test-ray",
                "Connection": "keep-alive",
                "X-Unrelated": "drop-me",
            },
        )

        self.assertEqual(status, 200)
        recorded = harness.upstream.requests[0]
        headers = recorded["headers"]
        self.assertIsInstance(headers, dict)
        self.assertEqual(
            set(headers),
            {"Host", "Content-Length", "Content-Type", "X-Telegram-Bot-Api-Secret-Token"},
        )
        self.assertEqual(headers["Content-Type"], "application/json")
        self.assertEqual(headers["X-Telegram-Bot-Api-Secret-Token"], "test-secret")
        self.assertEqual(recorded["body"], body)

    def test_rejects_body_over_limit_before_upstream(self) -> None:
        harness = self.harness(max_request_body=4)
        status, response_body = harness.request_headers_only(
            "POST",
            "/public/telegram/webhook",
            {"Content-Type": "application/json", "Content-Length": "5"},
        )

        self.assertEqual(status, 413)
        self.assertEqual(response_body, b"")
        self.assertEqual(harness.upstream.requests, [])


class DockerResolverTests(unittest.TestCase):
    def test_selects_ip_from_named_network(self) -> None:
        payload = [
            {
                "State": {"Running": True},
                "NetworkSettings": {
                    "Networks": {
                        "other": {"IPAddress": "172.20.0.5"},
                        "tourism": {"IPAddress": "172.18.0.9"},
                    }
                },
            }
        ]

        address = webhook_ingress.DockerResolver.address_from_inspect(payload, "tourism")

        self.assertEqual(address, "172.18.0.9")


if __name__ == "__main__":
    unittest.main()
