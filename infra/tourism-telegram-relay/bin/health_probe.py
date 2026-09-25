#!/usr/bin/env python3
"""Network-level health probes for the EU and Tourism relay roles."""

from __future__ import annotations

import argparse
import json
import re
import socket
import subprocess
import urllib.error
import urllib.parse
import urllib.request
from typing import Any, NoReturn


INVOCATION_RE = re.compile(r"^[0-9a-f]{32}$")
QUICK_HOST_RE = re.compile(
    r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+trycloudflare\.com$",
    re.IGNORECASE,
)
MAX_BODY = 1024 * 1024


class ProbeError(RuntimeError):
    pass


def get_json(url: str, timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(MAX_BODY + 1)
    except (OSError, urllib.error.URLError) as exc:
        raise ProbeError("HTTP probe failed") from exc
    if len(body) > MAX_BODY:
        raise ProbeError("HTTP probe response is too large")
    try:
        payload = json.loads(body)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise ProbeError("HTTP probe returned invalid JSON") from exc
    if not isinstance(payload, dict):
        raise ProbeError("HTTP probe returned a non-object")
    return payload


def probe_socks(host: str, port: int, timeout: float) -> None:
    try:
        with socket.create_connection((host, port), timeout=timeout) as sock:
            sock.settimeout(timeout)
            sock.sendall(b"\x05\x01\x00")
            reply = sock.recv(2)
    except OSError as exc:
        raise ProbeError("SOCKS5 greeting failed") from exc
    if reply != b"\x05\x00":
        raise ProbeError("SOCKS5 server rejected no-auth greeting")


def probe_status(url: str, unit: str, timeout: float, compare_local_invocation: bool) -> None:
    payload = get_json(url, timeout)
    invocation_id = payload.get("invocation_id")
    tunnel_host = payload.get("tunnel_host")
    if payload.get("status") != "ok":
        raise ProbeError("relay status is unavailable")
    if not isinstance(invocation_id, str) or not INVOCATION_RE.fullmatch(invocation_id):
        raise ProbeError("relay status has an invalid invocation ID")
    if (
        not isinstance(tunnel_host, str)
        or not QUICK_HOST_RE.fullmatch(tunnel_host)
        or tunnel_host.lower() == "api.trycloudflare.com"
    ):
        raise ProbeError("relay status has an invalid tunnel host")
    if compare_local_invocation:
        try:
            result = subprocess.run(
                ["/usr/bin/systemctl", "show", unit, "--property=InvocationID", "--value"],
                check=True,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
        except (OSError, subprocess.SubprocessError) as exc:
            raise ProbeError("cannot query cloudflared invocation") from exc
        if result.stdout.strip().lower() != invocation_id:
            raise ProbeError("relay status invocation is stale")


def probe_api(url: str, timeout: float) -> None:
    parsed = urllib.parse.urlsplit(url)
    if parsed.scheme != "http":
        raise ProbeError("API bridge health URL must use private HTTP")
    payload = get_json(url, timeout)
    if payload.get("status") != "ok":
        raise ProbeError("API bridge target is unhealthy")


def port(value: str) -> int:
    parsed = int(value)
    if not 1 <= parsed <= 65535:
        raise argparse.ArgumentTypeError("must be between 1 and 65535")
    return parsed


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("role", choices=("eu", "tourism"))
    parser.add_argument("--socks-host", required=True)
    parser.add_argument("--socks-port", required=True, type=port)
    parser.add_argument("--status-url", required=True)
    parser.add_argument("--cloudflared-unit", default="mywave-tourism-cloudflared.service")
    parser.add_argument("--api-health-url")
    parser.add_argument("--timeout", type=float, default=5.0)
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    if args.role == "tourism" and not args.api_health_url:
        parser.error("--api-health-url is required for the tourism role")
    return args


def main() -> NoReturn:
    args = parse_args()
    try:
        probe_socks(args.socks_host, args.socks_port, args.timeout)
        probe_status(
            args.status_url,
            args.cloudflared_unit,
            args.timeout,
            compare_local_invocation=args.role == "eu",
        )
        if args.role == "tourism":
            probe_api(args.api_health_url, args.timeout)
        print(f"{args.role} relay network probes: ok")
        raise SystemExit(0)
    except ProbeError as exc:
        print(f"{args.role} relay network probes: failed: {exc}")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
