#!/usr/bin/env python3
"""Minimal no-auth SOCKS5 CONNECT server for the private relay network."""

from __future__ import annotations

import argparse
import contextlib
import ipaddress
import logging
import select
import signal
import socket
import socketserver
import struct
import threading
import time
from typing import NoReturn


LOG = logging.getLogger("mywave-socks5")


class SocksProtocolError(Exception):
    pass


def recv_exact(sock: socket.socket, size: int) -> bytes:
    chunks: list[bytes] = []
    remaining = size
    while remaining:
        chunk = sock.recv(remaining)
        if not chunk:
            raise SocksProtocolError("unexpected EOF")
        chunks.append(chunk)
        remaining -= len(chunk)
    return b"".join(chunks)


def send_reply(client: socket.socket, code: int, bound: tuple[object, ...] | None = None) -> None:
    if code != 0 or bound is None:
        client.sendall(b"\x05" + bytes([code]) + b"\x00\x01\x00\x00\x00\x00\x00\x00")
        return

    host = str(bound[0])
    port = int(bound[1])
    try:
        packed_host = socket.inet_pton(socket.AF_INET, host)
        atyp = 1
    except OSError:
        packed_host = socket.inet_pton(socket.AF_INET6, host)
        atyp = 4
    client.sendall(b"\x05\x00\x00" + bytes([atyp]) + packed_host + struct.pack("!H", port))


def parse_destination(client: socket.socket) -> tuple[str, int]:
    version, command, reserved, atyp = recv_exact(client, 4)
    if version != 5 or reserved != 0:
        raise SocksProtocolError("invalid request header")
    if command != 1:
        send_reply(client, 7)
        raise SocksProtocolError("only CONNECT is supported")

    if atyp == 1:
        host = socket.inet_ntop(socket.AF_INET, recv_exact(client, 4))
    elif atyp == 4:
        host = socket.inet_ntop(socket.AF_INET6, recv_exact(client, 16))
    elif atyp == 3:
        length = recv_exact(client, 1)[0]
        if length == 0:
            raise SocksProtocolError("empty destination hostname")
        try:
            host = recv_exact(client, length).decode("idna")
        except UnicodeError as exc:
            raise SocksProtocolError("invalid destination hostname") from exc
    else:
        send_reply(client, 8)
        raise SocksProtocolError("unsupported address type")

    port = struct.unpack("!H", recv_exact(client, 2))[0]
    if port == 0:
        raise SocksProtocolError("destination port is zero")
    return host, port


def relay_bidirectional(left: socket.socket, right: socket.socket, idle_timeout: float) -> None:
    sockets = [left, right]
    last_activity = time.monotonic()
    while True:
        remaining = idle_timeout - (time.monotonic() - last_activity)
        if remaining <= 0:
            return
        readable, _, exceptional = select.select(sockets, [], sockets, min(remaining, 1.0))
        if exceptional:
            return
        if not readable:
            continue
        for source in readable:
            data = source.recv(65536)
            if not data:
                return
            destination = right if source is left else left
            destination.sendall(data)
            last_activity = time.monotonic()


class SocksHandler(socketserver.BaseRequestHandler):
    server: "SocksServer"

    def handle(self) -> None:
        client = self.request
        client.settimeout(self.server.io_timeout)
        outbound: socket.socket | None = None
        try:
            if self.client_address[0] not in self.server.allowed_clients:
                LOG.warning("rejected client %s", self.client_address[0])
                return
            version, method_count = recv_exact(client, 2)
            if version != 5 or method_count == 0:
                raise SocksProtocolError("invalid greeting")
            methods = recv_exact(client, method_count)
            if 0 not in methods:
                client.sendall(b"\x05\xff")
                return
            client.sendall(b"\x05\x00")

            host, port = parse_destination(client)
            if port not in self.server.allowed_ports:
                send_reply(client, 2)
                LOG.warning("rejected destination port %d", port)
                return
            try:
                outbound = socket.create_connection((host, port), timeout=self.server.connect_timeout)
            except ConnectionRefusedError:
                send_reply(client, 5)
                return
            except socket.timeout:
                send_reply(client, 4)
                return
            except OSError:
                send_reply(client, 1)
                return

            outbound.settimeout(self.server.io_timeout)
            send_reply(client, 0, outbound.getsockname())
            relay_bidirectional(client, outbound, self.server.idle_timeout)
        except (OSError, SocksProtocolError) as exc:
            LOG.warning("connection closed: %s", exc)
        finally:
            if outbound is not None:
                with contextlib.suppress(OSError):
                    outbound.shutdown(socket.SHUT_RDWR)
                outbound.close()


class SocksServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    block_on_close = True
    request_queue_size = 128

    def __init__(
        self,
        address: tuple[str, int],
        connect_timeout: float,
        io_timeout: float,
        idle_timeout: float,
        allowed_clients: frozenset[str],
        allowed_ports: frozenset[int],
        max_connections: int,
    ) -> None:
        self.connect_timeout = connect_timeout
        self.io_timeout = io_timeout
        self.idle_timeout = idle_timeout
        self.allowed_clients = allowed_clients
        self.allowed_ports = allowed_ports
        self.connection_slots = threading.BoundedSemaphore(max_connections)
        super().__init__(address, SocksHandler)

    def process_request(self, request: socket.socket, client_address: tuple[str, int]) -> None:
        if not self.connection_slots.acquire(blocking=False):
            request.close()
            LOG.warning("connection limit reached")
            return
        super().process_request(request, client_address)

    def process_request_thread(self, request: socket.socket, client_address: tuple[str, int]) -> None:
        try:
            super().process_request_thread(request, client_address)
        finally:
            self.connection_slots.release()


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
    parser.add_argument("--connect-timeout", type=positive_float, default=10.0)
    parser.add_argument("--io-timeout", type=positive_float, default=30.0)
    parser.add_argument("--idle-timeout", type=positive_float, default=300.0)
    parser.add_argument("--allowed-clients", required=True)
    parser.add_argument("--allowed-ports", default="443")
    parser.add_argument("--max-connections", type=int, default=128)
    return parser.parse_args()


def parse_clients(value: str) -> frozenset[str]:
    clients: set[str] = set()
    for raw in value.split(","):
        raw = raw.strip()
        if not raw:
            continue
        parsed = ipaddress.ip_address(raw)
        if parsed.version != 4:
            raise ValueError("only IPv4 clients are supported")
        clients.add(str(parsed))
    if not clients:
        raise ValueError("allowed clients must not be empty")
    return frozenset(clients)


def parse_ports(value: str) -> frozenset[int]:
    ports = frozenset(port(item.strip()) for item in value.split(",") if item.strip())
    if not ports:
        raise ValueError("allowed ports must not be empty")
    return ports


def main() -> NoReturn:
    args = parse_args()
    if args.max_connections <= 0:
        raise SystemExit("--max-connections must be positive")
    try:
        allowed_clients = parse_clients(args.allowed_clients)
        allowed_ports = parse_ports(args.allowed_ports)
    except ValueError as exc:
        raise SystemExit(str(exc)) from exc
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    server = SocksServer(
        (args.bind_host, args.bind_port),
        args.connect_timeout,
        args.io_timeout,
        args.idle_timeout,
        allowed_clients,
        allowed_ports,
        args.max_connections,
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
