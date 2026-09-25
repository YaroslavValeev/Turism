#!/usr/bin/env python3
"""Restricted HTTP ingress for the Tourism Telegram webhook."""

from __future__ import annotations

import argparse
import http.client
import http.server
import ipaddress
import json
import logging
import signal
import socket
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import NoReturn, Protocol


LOG = logging.getLogger("mywave-webhook-ingress")
DEFAULT_BODY_LIMIT = 1024 * 1024


class TargetResolutionError(RuntimeError):
    pass


class UpstreamError(RuntimeError):
    pass


class UpstreamTimeout(UpstreamError):
    pass


class ResponseTooLarge(UpstreamError):
    pass


class RequestRejected(RuntimeError):
    def __init__(self, status: int) -> None:
        super().__init__(str(status))
        self.status = status


class Resolver(Protocol):
    def resolve(self) -> tuple[str, int]: ...

    def invalidate(self) -> None: ...


class DockerResolver:
    def __init__(
        self,
        docker_bin: str,
        container: str,
        network: str,
        target_port: int,
        inspect_timeout: float,
        cache_ttl: float,
    ) -> None:
        self.docker_bin = docker_bin
        self.container = container
        self.network = network
        self.target_port = target_port
        self.inspect_timeout = inspect_timeout
        self.cache_ttl = cache_ttl
        self._lock = threading.Lock()
        self._cached: tuple[str, int] | None = None
        self._expires_at = 0.0

    @staticmethod
    def address_from_inspect(payload: object, network: str) -> str:
        if not isinstance(payload, list) or len(payload) != 1 or not isinstance(payload[0], dict):
            raise TargetResolutionError("unexpected docker inspect response")
        container = payload[0]
        state = container.get("State")
        if not isinstance(state, dict) or state.get("Running") is not True:
            raise TargetResolutionError("target container is not running")
        settings = container.get("NetworkSettings")
        networks = settings.get("Networks") if isinstance(settings, dict) else None
        if not isinstance(networks, dict):
            raise TargetResolutionError("target container has no network data")

        if network:
            selected = networks.get(network)
            if not isinstance(selected, dict):
                raise TargetResolutionError("configured Docker network is not attached")
            candidates = [selected.get("IPAddress")]
        else:
            candidates = [item.get("IPAddress") for item in networks.values() if isinstance(item, dict)]

        addresses = sorted({str(value) for value in candidates if value})
        if len(addresses) != 1:
            raise TargetResolutionError("Docker network selection did not produce exactly one IP")
        try:
            parsed = ipaddress.ip_address(addresses[0])
        except ValueError as exc:
            raise TargetResolutionError("Docker returned an invalid container IP") from exc
        if parsed.version != 4:
            raise TargetResolutionError("target container does not have an IPv4 address")
        return str(parsed)

    def _inspect(self) -> tuple[str, int]:
        try:
            result = subprocess.run(
                [self.docker_bin, "inspect", self.container],
                check=True,
                capture_output=True,
                text=True,
                timeout=self.inspect_timeout,
            )
            payload = json.loads(result.stdout)
        except (OSError, subprocess.SubprocessError, json.JSONDecodeError) as exc:
            raise TargetResolutionError("docker inspect failed") from exc
        return self.address_from_inspect(payload, self.network), self.target_port

    def resolve(self) -> tuple[str, int]:
        now = time.monotonic()
        with self._lock:
            if self._cached is not None and now < self._expires_at:
                return self._cached
            self._cached = self._inspect()
            self._expires_at = now + self.cache_ttl
            return self._cached

    def invalidate(self) -> None:
        with self._lock:
            self._cached = None
            self._expires_at = 0.0


@dataclass(frozen=True)
class UpstreamResponse:
    status: int
    content_type: str | None
    body: bytes


class WebhookIngressHandler(http.server.BaseHTTPRequestHandler):
    server: "WebhookIngressServer"
    protocol_version = "HTTP/1.1"

    def __getattr__(self, name: str):
        if name.startswith("do_"):
            return self._not_found
        raise AttributeError(name)

    def log_message(self, format: str, *args: object) -> None:
        LOG.info("HTTP request handled")

    def handle_expect_100(self) -> bool:
        if self.command != "POST" or self.path != "/public/telegram/webhook":
            self._send_empty(404)
            return False
        try:
            self._content_length()
        except RequestRejected as exc:
            self._send_empty(exc.status)
            return False
        self.send_response_only(100)
        self.end_headers()
        return True

    def do_GET(self) -> None:
        if self.path != "/health":
            self._not_found()
            return
        self._proxy("GET", b"", {})

    def do_POST(self) -> None:
        if self.path != "/public/telegram/webhook":
            self._not_found()
            return
        try:
            length = self._content_length()
            headers = self._forwarded_headers()
            body = self.rfile.read(length)
            if len(body) != length:
                raise RequestRejected(400)
        except socket.timeout:
            self._send_empty(408)
            return
        except (OSError, RequestRejected) as exc:
            status = exc.status if isinstance(exc, RequestRejected) else 400
            self._send_empty(status)
            return
        self._proxy("POST", body, headers)

    def _content_length(self) -> int:
        if self.headers.get_all("Transfer-Encoding"):
            raise RequestRejected(400)
        values = self.headers.get_all("Content-Length", [])
        if not values:
            raise RequestRejected(411)
        if len(values) != 1:
            raise RequestRejected(400)
        value = values[0].strip()
        if not value.isascii() or not value.isdigit():
            raise RequestRejected(400)
        length = int(value)
        if length > self.server.max_request_body:
            raise RequestRejected(413)
        return length

    def _forwarded_headers(self) -> dict[str, str]:
        forwarded: dict[str, str] = {}
        for name in ("Content-Type", "X-Telegram-Bot-Api-Secret-Token"):
            values = self.headers.get_all(name, [])
            if len(values) > 1:
                raise RequestRejected(400)
            if values:
                forwarded[name] = values[0]
        return forwarded

    def _proxy(self, method: str, body: bytes, headers: dict[str, str]) -> None:
        try:
            response = self.server.forward(method, self.path, body, headers)
        except TargetResolutionError:
            LOG.warning("Docker target resolution failed")
            self._send_empty(502)
            return
        except UpstreamTimeout:
            LOG.warning("Upstream request timed out")
            self._send_empty(504)
            return
        except UpstreamError:
            LOG.warning("Upstream request failed")
            self._send_empty(502)
            return
        self._send_response(response.status, response.body, response.content_type)

    def _not_found(self) -> None:
        self._discard_small_body()
        self._send_empty(404)

    def _discard_small_body(self) -> None:
        if self.headers.get_all("Transfer-Encoding"):
            return
        values = self.headers.get_all("Content-Length", [])
        if len(values) != 1:
            return
        value = values[0].strip()
        if not value.isascii() or not value.isdigit():
            return
        remaining = int(value)
        if remaining > self.server.max_request_body:
            return
        try:
            while remaining:
                chunk = self.rfile.read(min(remaining, 65536))
                if not chunk:
                    return
                remaining -= len(chunk)
        except (OSError, socket.timeout):
            return

    def _send_empty(self, status: int) -> None:
        self._send_response(status, b"", None)

    def _send_response(self, status: int, body: bytes, content_type: str | None) -> None:
        self.close_connection = True
        try:
            self.send_response_only(status)
            if content_type:
                self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Connection", "close")
            self.end_headers()
            if body:
                self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError, socket.timeout):
            return


class WebhookIngressServer(http.server.ThreadingHTTPServer):
    daemon_threads = False
    block_on_close = True
    allow_reuse_address = True

    def __init__(
        self,
        server_address: tuple[str, int],
        resolver: Resolver,
        *,
        max_request_body: int = DEFAULT_BODY_LIMIT,
        max_response_body: int = DEFAULT_BODY_LIMIT,
        max_concurrent_requests: int = 32,
        connect_timeout: float = 3.0,
        read_timeout: float = 10.0,
    ) -> None:
        if max_request_body <= 0 or max_response_body <= 0 or max_concurrent_requests <= 0:
            raise ValueError("request limits must be positive")
        if connect_timeout <= 0 or read_timeout <= 0:
            raise ValueError("timeouts must be positive")
        self.resolver = resolver
        self.max_request_body = max_request_body
        self.max_response_body = max_response_body
        self.connect_timeout = connect_timeout
        self.read_timeout = read_timeout
        self.stopping = threading.Event()
        self._slots = threading.BoundedSemaphore(max_concurrent_requests)
        super().__init__(server_address, WebhookIngressHandler)

    def get_request(self) -> tuple[socket.socket, object]:
        request, client_address = super().get_request()
        request.settimeout(self.read_timeout)
        return request, client_address

    def process_request(self, request: socket.socket, client_address: object) -> None:
        acquired = False
        while not self.stopping.is_set():
            acquired = self._slots.acquire(timeout=0.1)
            if acquired:
                break
        if not acquired:
            self.shutdown_request(request)
            return
        try:
            super().process_request(request, client_address)
        except BaseException:
            self._slots.release()
            raise

    def process_request_thread(self, request: socket.socket, client_address: object) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self._slots.release()

    def begin_shutdown(self) -> None:
        self.stopping.set()

    def _connect(self) -> tuple[http.client.HTTPConnection, str, int]:
        for _attempt in range(2):
            host, port = self.resolver.resolve()
            connection = http.client.HTTPConnection(host, port, timeout=self.connect_timeout)
            try:
                connection.connect()
            except (OSError, http.client.HTTPException):
                connection.close()
                self.resolver.invalidate()
                continue
            if connection.sock is None:
                connection.close()
                self.resolver.invalidate()
                continue
            connection.sock.settimeout(self.read_timeout)
            return connection, host, port
        raise UpstreamError("cannot connect to upstream")

    def forward(
        self,
        method: str,
        path: str,
        body: bytes,
        headers: dict[str, str],
    ) -> UpstreamResponse:
        connection, host, port = self._connect()
        try:
            connection.putrequest(method, path, skip_host=True, skip_accept_encoding=True)
            connection.putheader("Host", f"{host}:{port}")
            connection.putheader("Content-Length", str(len(body)))
            for name, value in headers.items():
                connection.putheader(name, value)
            connection.endheaders(body)
            response = connection.getresponse()
            declared_length = response.getheader("Content-Length")
            if declared_length and declared_length.isascii() and declared_length.isdigit():
                if int(declared_length) > self.max_response_body:
                    raise ResponseTooLarge("upstream response is too large")
            response_body = response.read(self.max_response_body + 1)
            if len(response_body) > self.max_response_body:
                raise ResponseTooLarge("upstream response is too large")
            content_types = response.headers.get_all("Content-Type", [])
            content_type = content_types[0] if len(content_types) == 1 else None
            return UpstreamResponse(response.status, content_type, response_body)
        except socket.timeout as exc:
            raise UpstreamTimeout("upstream read timed out") from exc
        except ResponseTooLarge:
            raise
        except (OSError, ValueError, http.client.HTTPException) as exc:
            raise UpstreamError("upstream HTTP exchange failed") from exc
        finally:
            connection.close()


def port(value: str) -> int:
    parsed = int(value)
    if not 1 <= parsed <= 65535:
        raise argparse.ArgumentTypeError("must be between 1 and 65535")
    return parsed


def positive_int(value: str) -> int:
    parsed = int(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return parsed


def positive_float(value: str) -> float:
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind-host", required=True)
    parser.add_argument("--bind-port", required=True, type=port)
    parser.add_argument("--docker-container", required=True)
    parser.add_argument("--docker-network", required=True)
    parser.add_argument("--target-port", required=True, type=port)
    parser.add_argument("--docker-bin", default="docker")
    parser.add_argument("--inspect-timeout", type=positive_float, default=5.0)
    parser.add_argument("--cache-ttl", type=positive_float, default=30.0)
    parser.add_argument("--max-request-body", type=positive_int, default=DEFAULT_BODY_LIMIT)
    parser.add_argument("--max-response-body", type=positive_int, default=DEFAULT_BODY_LIMIT)
    parser.add_argument("--max-concurrent-requests", type=positive_int, default=32)
    parser.add_argument("--connect-timeout", type=positive_float, default=3.0)
    parser.add_argument("--read-timeout", type=positive_float, default=10.0)
    return parser.parse_args()


def main() -> NoReturn:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
    resolver = DockerResolver(
        args.docker_bin,
        args.docker_container,
        args.docker_network,
        args.target_port,
        args.inspect_timeout,
        args.cache_ttl,
    )
    try:
        server = WebhookIngressServer(
            (args.bind_host, args.bind_port),
            resolver,
            max_request_body=args.max_request_body,
            max_response_body=args.max_response_body,
            max_concurrent_requests=args.max_concurrent_requests,
            connect_timeout=args.connect_timeout,
            read_timeout=args.read_timeout,
        )
    except OSError as exc:
        LOG.error("Cannot bind webhook ingress: %s", exc)
        raise SystemExit(1) from exc

    def stop(_signum: int, _frame: object) -> None:
        server.begin_shutdown()

    signal.signal(signal.SIGINT, stop)
    signal.signal(signal.SIGTERM, stop)
    server.timeout = 0.5
    LOG.info("Listening on %s:%d", args.bind_host, args.bind_port)
    try:
        while not server.stopping.is_set():
            server.handle_request()
    except KeyboardInterrupt:
        server.begin_shutdown()
    finally:
        server.begin_shutdown()
        server.server_close()
    raise SystemExit(0)


if __name__ == "__main__":
    main()
