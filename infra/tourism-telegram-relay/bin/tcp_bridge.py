#!/usr/bin/env python3
"""TCP bridge with either a fixed target or a Docker-inspected target."""

from __future__ import annotations

import argparse
import contextlib
import ipaddress
import json
import logging
import select
import signal
import socket
import socketserver
import subprocess
import threading
import time
from dataclasses import dataclass
from typing import NoReturn, Protocol


LOG = logging.getLogger("mywave-tcp-bridge")


class TargetResolutionError(RuntimeError):
    pass


class Resolver(Protocol):
    def resolve(self) -> tuple[str, int]: ...

    def invalidate(self) -> None: ...


@dataclass
class FixedResolver:
    host: str
    port: int

    def resolve(self) -> tuple[str, int]:
        return self.host, self.port

    def invalidate(self) -> None:
        return


class DockerResolver:
    def __init__(
        self,
        docker_bin: str,
        container: str,
        target_port: int,
        network: str,
        inspect_timeout: float,
        cache_ttl: float,
    ) -> None:
        self.docker_bin = docker_bin
        self.container = container
        self.target_port = target_port
        self.network = network
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


class BridgeHandler(socketserver.BaseRequestHandler):
    server: "BridgeServer"

    def handle(self) -> None:
        client = self.request
        client.settimeout(self.server.io_timeout)
        outbound: socket.socket | None = None
        try:
            for attempt in range(2):
                target = self.server.resolver.resolve()
                try:
                    outbound = socket.create_connection(target, timeout=self.server.connect_timeout)
                    break
                except OSError:
                    self.server.resolver.invalidate()
                    if attempt == 1:
                        raise
            if outbound is None:
                raise OSError("target connection was not created")
            outbound.settimeout(self.server.io_timeout)
            relay_bidirectional(client, outbound, self.server.idle_timeout)
        except (OSError, TargetResolutionError) as exc:
            LOG.warning("connection closed: %s", exc)
        finally:
            if outbound is not None:
                with contextlib.suppress(OSError):
                    outbound.shutdown(socket.SHUT_RDWR)
                outbound.close()


class BridgeServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True
    block_on_close = True
    request_queue_size = 128

    def __init__(
        self,
        address: tuple[str, int],
        resolver: Resolver,
        connect_timeout: float,
        io_timeout: float,
        idle_timeout: float,
    ) -> None:
        self.resolver = resolver
        self.connect_timeout = connect_timeout
        self.io_timeout = io_timeout
        self.idle_timeout = idle_timeout
        super().__init__(address, BridgeHandler)


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
    target = parser.add_mutually_exclusive_group(required=True)
    target.add_argument("--target-host")
    target.add_argument("--docker-container")
    parser.add_argument("--target-port", required=True, type=port)
    parser.add_argument("--docker-network", default="")
    parser.add_argument("--docker-bin", default="/usr/bin/docker")
    parser.add_argument("--inspect-timeout", type=positive_float, default=5.0)
    parser.add_argument("--cache-ttl", type=positive_float, default=5.0)
    parser.add_argument("--connect-timeout", type=positive_float, default=10.0)
    parser.add_argument("--io-timeout", type=positive_float, default=30.0)
    parser.add_argument("--idle-timeout", type=positive_float, default=300.0)
    return parser.parse_args()


def main() -> NoReturn:
    args = parse_args()
    logging.basicConfig(level=logging.INFO, format="%(levelname)s %(message)s")
    if args.target_host:
        resolver: Resolver = FixedResolver(args.target_host, args.target_port)
    else:
        resolver = DockerResolver(
            args.docker_bin,
            args.docker_container,
            args.target_port,
            args.docker_network,
            args.inspect_timeout,
            args.cache_ttl,
        )
    server = BridgeServer(
        (args.bind_host, args.bind_port),
        resolver,
        args.connect_timeout,
        args.io_timeout,
        args.idle_timeout,
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
