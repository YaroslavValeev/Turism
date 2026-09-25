from __future__ import annotations

import importlib.util
import sys
import tempfile
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


relay_status = load_module("relay_status", "bin/relay_status.py")
tcp_bridge = load_module("tcp_bridge", "bin/tcp_bridge.py")
webhook_repair = load_module("webhook_repair", "bin/webhook_repair.py")


class RelayStatusTests(unittest.TestCase):
    def test_uses_last_quick_tunnel_in_supplied_invocation_log(self) -> None:
        journal = "first https://old-name.trycloudflare.com\nready https://current-name.trycloudflare.com/path\n"
        self.assertEqual(relay_status.extract_tunnel_host(journal), "current-name.trycloudflare.com")

    def test_rejects_unrelated_domains(self) -> None:
        with self.assertRaises(relay_status.StatusLookupError):
            relay_status.extract_tunnel_host("https://example.test\n")

    def test_ignores_trycloudflare_api_endpoint(self) -> None:
        journal = (
            "request https://api.trycloudflare.com/tunnel\n"
            "ready https://current-name.trycloudflare.com\n"
        )
        self.assertEqual(relay_status.extract_tunnel_host(journal), "current-name.trycloudflare.com")


class DockerResolverTests(unittest.TestCase):
    def test_selects_named_network(self) -> None:
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
        self.assertEqual(tcp_bridge.DockerResolver.address_from_inspect(payload, "tourism"), "172.18.0.9")

    def test_requires_network_when_multiple_ips_exist(self) -> None:
        payload = [
            {
                "State": {"Running": True},
                "NetworkSettings": {
                    "Networks": {
                        "one": {"IPAddress": "172.18.0.9"},
                        "two": {"IPAddress": "172.20.0.5"},
                    }
                },
            }
        ]
        with self.assertRaises(tcp_bridge.TargetResolutionError):
            tcp_bridge.DockerResolver.address_from_inspect(payload, "")


class WebhookEnvTests(unittest.TestCase):
    def test_loads_env_without_shell_expansion_and_applies_later_override(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / ".env").write_text(
                "TELEGRAM_BOT_TOKEN='root-token'\nTELEGRAM_WEBHOOK_SECRET=literal_value-1\n",
                encoding="utf-8",
            )
            service = root / "services" / "api"
            service.mkdir(parents=True)
            (service / ".env").write_text('TELEGRAM_BOT_TOKEN="service-token"\n', encoding="utf-8")
            values = webhook_repair.load_source_env(str(root), ".env,services/api/.env")
        self.assertEqual(values["TELEGRAM_BOT_TOKEN"], "service-token")
        self.assertEqual(values["TELEGRAM_WEBHOOK_SECRET"], "literal_value-1")

    def test_rejects_env_path_escape(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            with self.assertRaises(webhook_repair.RepairError):
                webhook_repair.load_source_env(directory, "../outside.env")

    def test_validates_socks_url_without_credentials(self) -> None:
        self.assertEqual(webhook_repair.parse_socks_url("socks5://172.18.0.1:1088"), ("172.18.0.1", 1088))
        with self.assertRaises(webhook_repair.RepairError):
            webhook_repair.parse_socks_url("socks5://user:secret@172.18.0.1:1088")

    def test_requires_telegram_webhook_secret(self) -> None:
        self.assertEqual(
            webhook_repair.required_webhook_secret({"TELEGRAM_WEBHOOK_SECRET": "valid_secret-1"}),
            "valid_secret-1",
        )
        for values in ({}, {"TELEGRAM_WEBHOOK_SECRET": ""}, {"TELEGRAM_WEBHOOK_SECRET": "bad value"}):
            with self.subTest(values=values):
                with self.assertRaises(webhook_repair.RepairError):
                    webhook_repair.required_webhook_secret(values)


if __name__ == "__main__":
    unittest.main()
