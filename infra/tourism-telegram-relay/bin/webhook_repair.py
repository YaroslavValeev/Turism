#!/usr/bin/env python3
"""Repair the Telegram webhook through the private SOCKS5 relay."""

from __future__ import annotations

import argparse
import http.client
import json
import re
import socket
import ssl
import struct
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any, NoReturn


ASSIGNMENT_RE = re.compile(r"^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$")
QUICK_HOST_RE = re.compile(
    r"^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+trycloudflare\.com$",
    re.IGNORECASE,
)
REQUIRED_ENV_KEYS = {
    "TELEGRAM_BOT_API_BASE_URL",
    "TELEGRAM_BOT_TOKEN",
    "TG_BOT_TOKEN",
    "TELEGRAM_WEBHOOK_SECRET",
    "TELEGRAM_BOT_HTTP_PROXY",
    "OPENAI_HTTP_PROXY",
}
MAX_HTTP_BODY = 1024 * 1024


class RepairError(RuntimeError):
    pass


def parse_dotenv_value(raw: str) -> str:
    value = raw.lstrip()
    if not value:
        return ""
    if value[0] not in ("'", '"'):
        return re.sub(r"\s+#.*$", "", value).strip()

    quote = value[0]
    output: list[str] = []
    escaped = False
    index = 1
    while index < len(value):
        character = value[index]
        if quote == '"' and escaped:
            output.append({"n": "\n", "r": "\r", "t": "\t"}.get(character, character))
            escaped = False
        elif quote == '"' and character == "\\":
            escaped = True
        elif character == quote:
            remainder = value[index + 1 :].strip()
            if remainder and not remainder.startswith("#"):
                raise RepairError("invalid content after quoted dotenv value")
            return "".join(output)
        else:
            output.append(character)
        index += 1
    raise RepairError("unterminated quoted dotenv value")


def parse_dotenv_file(path: Path, wanted: set[str] = REQUIRED_ENV_KEYS) -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeError) as exc:
        raise RepairError("cannot read source env file") from exc
    for line in lines:
        match = ASSIGNMENT_RE.match(line)
        if not match or match.group(1) not in wanted:
            continue
        values[match.group(1)] = parse_dotenv_value(match.group(2))
    return values


def load_source_env(root_value: str, files_value: str) -> dict[str, str]:
    root = Path(root_value).resolve(strict=True)
    if not root.is_dir():
        raise RepairError("source env root is not a directory")
    names = [name.strip() for name in files_value.split(",") if name.strip()]
    if not names:
        raise RepairError("no source env files configured")

    merged: dict[str, str] = {}
    loaded = 0
    for name in names:
        relative = Path(name)
        if relative.is_absolute():
            raise RepairError("source env paths must be relative")
        unresolved = root / relative
        if unresolved.is_symlink():
            raise RepairError("source env path must not be a symlink")
        candidate = unresolved.resolve()
        try:
            candidate.relative_to(root)
        except ValueError as exc:
            raise RepairError("source env path escapes configured root") from exc
        if not candidate.exists():
            continue
        if not candidate.is_file():
            raise RepairError("source env path is not a regular file")
        merged.update(parse_dotenv_file(candidate))
        loaded += 1
    if loaded == 0:
        raise RepairError("none of the configured source env files exist")
    return merged


def resolve_bot_api(values: dict[str, str], api_origin: str) -> tuple[str, int, str]:
    origin = urllib.parse.urlsplit(api_origin)
    if (
        origin.scheme != "https"
        or not origin.hostname
        or origin.username
        or origin.password
        or origin.query
        or origin.fragment
        or origin.path not in ("", "/")
    ):
        raise RepairError("Telegram API origin must be an HTTPS origin")
    origin_port = origin.port or 443
    configured_base = values.get("TELEGRAM_BOT_API_BASE_URL", "").strip()
    if configured_base:
        parsed = urllib.parse.urlsplit(configured_base)
        if (
            parsed.scheme != "https"
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or not re.fullmatch(r"/bot[^/]+/?", parsed.path)
            or parsed.hostname.lower() != origin.hostname.lower()
            or (parsed.port or 443) != origin_port
        ):
            raise RepairError("TELEGRAM_BOT_API_BASE_URL must be an HTTPS Bot API base URL")
        base_path = parsed.path.rstrip("/")
        if len(base_path) <= len("/bot"):
            raise RepairError("TELEGRAM_BOT_API_BASE_URL does not contain a bot token")
        return parsed.hostname, parsed.port or 443, base_path

    token = (values.get("TELEGRAM_BOT_TOKEN") or values.get("TG_BOT_TOKEN") or "").strip()
    if not token:
        raise RepairError("Telegram bot token is missing from source env")
    token_path = urllib.parse.quote(token, safe=":")
    return origin.hostname, origin_port, f"/bot{token_path}"


def required_webhook_secret(values: dict[str, str]) -> str:
    secret = values.get("TELEGRAM_WEBHOOK_SECRET", "").strip()
    if not secret:
        raise RepairError("Telegram webhook secret is missing from source env")
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,256}", secret):
        raise RepairError("Telegram webhook secret has an invalid format")
    return secret


def parse_socks_url(value: str) -> tuple[str, int]:
    parsed = urllib.parse.urlsplit(value)
    if (
        parsed.scheme != "socks5"
        or not parsed.hostname
        or parsed.username
        or parsed.password
        or parsed.path not in ("", "/")
        or parsed.query
        or parsed.fragment
    ):
        raise RepairError("proxy URL must be socks5://host:port without credentials")
    try:
        port = parsed.port
    except ValueError as exc:
        raise RepairError("proxy URL has an invalid port") from exc
    if port is None:
        raise RepairError("proxy URL must include a port")
    return parsed.hostname, port


def recv_exact(sock: socket.socket, size: int) -> bytes:
    data = bytearray()
    while len(data) < size:
        chunk = sock.recv(size - len(data))
        if not chunk:
            raise RepairError("SOCKS5 proxy closed the connection")
        data.extend(chunk)
    return bytes(data)


def socks5_connect(proxy: tuple[str, int], host: str, port: int, timeout: float) -> socket.socket:
    sock = socket.create_connection(proxy, timeout=timeout)
    sock.settimeout(timeout)
    try:
        sock.sendall(b"\x05\x01\x00")
        if recv_exact(sock, 2) != b"\x05\x00":
            raise RepairError("SOCKS5 proxy rejected no-auth negotiation")
        encoded_host = host.encode("idna")
        if not 1 <= len(encoded_host) <= 255:
            raise RepairError("Telegram API hostname is invalid")
        request = b"\x05\x01\x00\x03" + bytes([len(encoded_host)]) + encoded_host + struct.pack("!H", port)
        sock.sendall(request)
        version, reply, reserved, atyp = recv_exact(sock, 4)
        if version != 5 or reserved != 0 or reply != 0:
            raise RepairError("SOCKS5 proxy could not connect to Telegram")
        if atyp == 1:
            recv_exact(sock, 4)
        elif atyp == 4:
            recv_exact(sock, 16)
        elif atyp == 3:
            recv_exact(sock, recv_exact(sock, 1)[0])
        else:
            raise RepairError("SOCKS5 proxy returned an invalid address type")
        recv_exact(sock, 2)
        return sock
    except Exception:
        sock.close()
        raise


def https_json_via_socks(
    host: str,
    port: int,
    method: str,
    path: str,
    headers: dict[str, str],
    body: bytes,
    proxy: tuple[str, int],
    timeout: float,
) -> tuple[int, dict[str, Any]]:
    raw: socket.socket | None = None
    tls: ssl.SSLSocket | None = None
    response: http.client.HTTPResponse | None = None
    try:
        raw = socks5_connect(proxy, host, port, timeout)
        tls = ssl.create_default_context().wrap_socket(raw, server_hostname=host)
        tls.settimeout(timeout)
        header_lines = "".join(f"{name}: {value}\r\n" for name, value in headers.items())
        request_data = (
            f"POST {path} HTTP/1.1\r\n"
            f"Host: {host}\r\n"
            f"{header_lines}"
            f"Content-Length: {len(body)}\r\n"
            "Connection: close\r\n\r\n"
        ).encode("ascii") + body
        if method != "POST":
            raise RepairError("only POST requests are supported")
        tls.sendall(request_data)
        response = http.client.HTTPResponse(tls)
        response.begin()
        payload = response.read(MAX_HTTP_BODY + 1)
        if len(payload) > MAX_HTTP_BODY:
            raise RepairError("Telegram API response is too large")
        try:
            parsed = json.loads(payload)
        except (UnicodeError, json.JSONDecodeError) as exc:
            # Bot API path carries the token — never echo it.
            safe_path = path.split("/bot", 1)[0]
            raise RepairError(f"{host}{safe_path} returned non-JSON (HTTP {response.status})") from exc
        if not isinstance(parsed, dict):
            raise RepairError("HTTPS endpoint returned a non-object JSON response")
        return response.status, parsed
    except (OSError, ssl.SSLError, http.client.HTTPException) as exc:
        raise RepairError("HTTPS request through SOCKS5 failed") from exc
    finally:
        if response is not None:
            response.close()
        if tls is not None:
            tls.close()
        elif raw is not None:
            raw.close()


def telegram_json(
    api: tuple[str, int, str],
    method: str,
    params: dict[str, str],
    proxy: tuple[str, int],
    timeout: float,
) -> dict[str, Any]:
    host, port, base_path = api
    body = urllib.parse.urlencode(params).encode("utf-8")
    status, parsed = https_json_via_socks(
        host,
        port,
        "POST",
        f"{base_path}/{method}",
        {"Content-Type": "application/x-www-form-urlencoded"},
        body,
        proxy,
        timeout,
    )
    if status != 200 or parsed.get("ok") is not True:
        raise RepairError(f"Telegram API {method} failed")
    return parsed


def probe_webhook(host: str, secret: str, proxy: tuple[str, int], timeout: float) -> None:
    body = json.dumps({"update_id": int(time.time())}, separators=(",", ":")).encode("utf-8")
    status, payload = https_json_via_socks(
        host,
        443,
        "POST",
        "/public/telegram/webhook",
        {
            "Content-Type": "application/json",
            "X-Telegram-Bot-Api-Secret-Token": secret,
        },
        body,
        proxy,
        timeout,
    )
    if status != 200 or payload.get("ok") is not True:
        raise RepairError("current quick-tunnel webhook probe failed")


def current_tunnel_host(status_url: str, timeout: float) -> str:
    parsed = urllib.parse.urlsplit(status_url)
    if parsed.scheme != "http" or not parsed.hostname or parsed.username or parsed.password:
        raise RepairError("status URL must be plain HTTP on the private relay network")
    request = urllib.request.Request(status_url, headers={"Accept": "application/json"})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read(MAX_HTTP_BODY + 1)
    except (OSError, urllib.error.URLError) as exc:
        raise RepairError("relay status request failed") from exc
    if len(body) > MAX_HTTP_BODY:
        raise RepairError("relay status response is too large")
    try:
        payload = json.loads(body)
    except (UnicodeError, json.JSONDecodeError) as exc:
        raise RepairError("relay status returned invalid JSON") from exc
    host = payload.get("tunnel_host") if isinstance(payload, dict) and payload.get("status") == "ok" else None
    if not isinstance(host, str) or not QUICK_HOST_RE.fullmatch(host) or host.lower() == "api.trycloudflare.com":
        raise RepairError("relay status did not return a valid current tunnel host")
    return host.lower()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser()
    parser.add_argument("--env-root", required=True)
    parser.add_argument("--env-files", required=True)
    parser.add_argument("--status-url", required=False)
    parser.add_argument("--socks-url", required=False)
    parser.add_argument("--telegram-api-origin", default="https://api.telegram.org")
    parser.add_argument("--timeout", type=float, default=15.0)
    parser.add_argument("--validate-env", action="store_true")
    parser.add_argument("--expected-api-proxy")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be positive")
    if not args.validate_env and (not args.status_url or not args.socks_url):
        parser.error("--status-url and --socks-url are required unless --validate-env is used")
    return args


def main() -> NoReturn:
    args = parse_args()
    try:
        values = load_source_env(args.env_root, args.env_files)
        api = resolve_bot_api(values, args.telegram_api_origin)
        webhook_secret = required_webhook_secret(values)
        if args.validate_env:
            if args.expected_api_proxy:
                for key in ("TELEGRAM_BOT_HTTP_PROXY", "OPENAI_HTTP_PROXY"):
                    if values.get(key, "").strip() != args.expected_api_proxy:
                        raise RepairError(f"{key} must equal the configured Docker gateway SOCKS URL")
            print("source env validation: ok")
            raise SystemExit(0)

        proxy = parse_socks_url(args.socks_url)
        tunnel_host = current_tunnel_host(args.status_url, args.timeout)
        probe_webhook(tunnel_host, webhook_secret, proxy, args.timeout)
        webhook_url = f"https://{tunnel_host}/public/telegram/webhook"
        webhook_info = telegram_json(api, "getWebhookInfo", {}, proxy, args.timeout)
        result = webhook_info.get("result")
        current_url = result.get("url") if isinstance(result, dict) else None
        if current_url == webhook_url:
            print("webhook repair: already current")
            raise SystemExit(0)
        telegram_json(
            api,
            "setWebhook",
            {"url": webhook_url, "secret_token": webhook_secret},
            proxy,
            args.timeout,
        )
        verified = telegram_json(api, "getWebhookInfo", {}, proxy, args.timeout)
        verified_result = verified.get("result")
        verified_url = verified_result.get("url") if isinstance(verified_result, dict) else None
        if verified_url != webhook_url:
            raise RepairError("Telegram webhook post-update verification failed")
        print("webhook repair: updated")
        raise SystemExit(0)
    except (OSError, RepairError) as exc:
        print(f"webhook repair: failed: {exc}")
        raise SystemExit(1) from exc


if __name__ == "__main__":
    main()
