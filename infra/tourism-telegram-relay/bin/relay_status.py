#!/usr/bin/env python3
"""Expose the current quick-tunnel host from one systemd invocation only."""

from __future__ import annotations

import argparse
import json
import logging
import re
import signal
import socket
import subprocess
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import NoReturn


LOG = logging.getLogger("mywave-relay-status")
INVOCATION_RE = re.compile(r"^[0-9a-f]{32}$")
HOST_RE = re.compile(
    r"https://(?P<host>(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+trycloudflare\.com)(?=[:/\s]|$)",
    re.IGNORECASE,
)


class StatusLookupError(RuntimeError):
    pass


def extract_tunnel_host(journal_text: str) -> str:
    matches = [
        host
        for match in HOST_RE.finditer(journal_text)
        if (host := match.group("host").lower()) != "api.trycloudflare.com"
    ]
    if not matches:
        raise StatusLookupError("current invocation has not announced a quick tunnel")
    return matches[-1]


class InvocationLookup:
    def __init__(self, unit: str, command_timeout: float) -> None:
        self.unit = unit
        self.command_timeout = command_timeout

    def invocation_id(self) -> str:
        try:
            result = subprocess.run(
                ["/usr/bin/systemctl", "show", self.unit, "--property=InvocationID", "--value"],
                check=True,
                capture_output=True,
                text=True,
                timeout=self.command_timeout,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise StatusLookupError("cannot read current systemd invocation") from exc
        invocation_id = result.stdout.strip().lower()
        if not INVOCATION_RE.fullmatch(invocation_id) or invocation_id == "0" * 32:
            raise StatusLookupError("cloudflared has no active systemd invocation")
        return invocation_id

    def journal(self, invocation_id: str) -> str:
        if not INVOCATION_RE.fullmatch(invocation_id):
            raise StatusLookupError("invalid systemd invocation ID")
        try:
            result = subprocess.run(
                [
                    "/usr/bin/journalctl",
                    f"_SYSTEMD_INVOCATION_ID={invocation_id}",
                    "--output=cat",
                    "--no-pager",
                    "--all",
                ],
                check=True,
                capture_output=True,
                text=True,
                timeout=self.command_timeout,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise StatusLookupError("cannot read current invocation journal") from exc
        return result.stdout

    def status(self) -> dict[str, str]:
        invocation_id = self.invocation_id()
        host = extract_tunnel_host(self.journal(invocation_id))
        return {"status": "ok", "tunnel_host": host, "invocation_id": invocation_id}


class TimeoutHTTPServer(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, address: tuple[str, int], lookup: InvocationLookup, client_timeout: float) -> None:
        self.lookup = lookup
        self.client_timeout = client_timeout
        super().__init__(address, StatusHandler)

    def get_request(self) -> tuple[socket.socket, tuple[str, int]]:
        request, address = super().get_request()
        request.settimeout(self.client_timeout)
        return request, address


class StatusHandler(BaseHTTPRequestHandler):
    server: TimeoutHTTPServer

    def do_GET(self) -> None:
        if self.path not in ("/health", "/v1/status"):
            self.send_error(404)
            return
        try:
            payload = self.server.lookup.status()
            status_code = 200
        except StatusLookupError:
            payload = {"status": "unavailable"}
            status_code = 503
        body = json.dumps(payload, separators=(",", ":")).encode("utf-8")
        self.send_response(status_code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, _format: str, *_args: object) -> None:
        return


def positive_float(value: str) -> float:
    parsed = float(value)
    if parsed <= 0:
        raise argparse.ArgumentTypeError("must be positive")
    return parsed


def port(value: str) -> int:
    parsed = int(value)
    if not 1 <= parsed <= 65535:
        raise argparse.ArgumentTypeError("must be between 1 and 65535")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--bind-host", required=True)
    parser.add_argument("--bind-port", required=True, type=port)
    parser.add_argument("--cloudflared-unit", required=True)
    parser.add_argument("--command-timeout", type=positive_float, default=5.0)
    parser.add_argument("--client-timeout", type=positive_float, default=5.0)
    return parser.parse_args()


def main() -> NoReturn:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    server = TimeoutHTTPServer(
        (args.bind_host, args.bind_port),
        InvocationLookup(args.cloudflared_unit, args.command_timeout),
        args.client_timeout,
    )

    def stop(_signum: int, _frame: object) -> None:
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    LOG.info("listening on %s:%d", args.bind_host, args.bind_port)
    try:
        server.serve_forever(poll_interval=0.5)
    finally:
        server.server_close()
    raise SystemExit(0)


if __name__ == "__main__":
    main()
