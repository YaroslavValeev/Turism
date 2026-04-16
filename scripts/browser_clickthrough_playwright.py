from __future__ import annotations

import json
import os
import shutil
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

from playwright.sync_api import TimeoutError as PlaywrightTimeoutError
from playwright.sync_api import sync_playwright


ROOT = Path(__file__).resolve().parent.parent
ARTIFACTS_DIR = ROOT / "artifacts" / "browser-clickthrough"
SCREENSHOTS_DIR = ARTIFACTS_DIR / "screenshots"
API_URL = "http://localhost:3001"
WEB_URL = "http://localhost:3000"
ADMIN_URL = "http://localhost:3002"

VIRTUAL_ORGANIZERS = [
    {
        "name": "WaveLine Krasnodar",
        "email": "waveline.krasnodar.virtual@mywave.local",
        "phone": "+79990001001",
        "legal_status": "ИП",
        "evidence_type": "document",
        "evidence_url": "https://virtual.mywave.local/evidence/waveline-krasnodar",
        "evidence_notes": "Виртуальный организатор для проверки браузерного сценария",
        "program_title": "WaveLine Weekend Progress Camp",
    },
    {
        "name": "SouthCrew Wakesurf",
        "email": "southcrew.virtual@mywave.local",
        "phone": "+79990001002",
        "legal_status": "ООО",
        "evidence_type": "document",
        "evidence_url": "https://virtual.mywave.local/evidence/southcrew",
        "evidence_notes": "Виртуальный организатор для проверки браузерного сценария",
        "program_title": "SouthCrew Technique Reset",
    },
    {
        "name": "Kuban Wake Camp",
        "email": "kubanwake.virtual@mywave.local",
        "phone": "+79990001003",
        "legal_status": "самозанятый",
        "evidence_type": "review_batch",
        "evidence_url": "https://virtual.mywave.local/evidence/kubanwake",
        "evidence_notes": "Виртуальный организатор для проверки браузерного сценария",
        "program_title": "Kuban Wake Family Days",
    },
]

BOOKING_STATUS_LABELS = {
    "reviewed": "Проверена",
    "sent_to_organizer": "Передана организатору",
    "contacted": "Связались с гостем",
    "offer_sent": "Предложение отправлено",
    "booked": "Забронирована",
    "paid_off_platform": "Оплачена вне платформы",
    "completed": "Завершена",
}


def ensure_dirs() -> None:
    SCREENSHOTS_DIR.mkdir(parents=True, exist_ok=True)


def wait_for_http(url: str, timeout: int = 120) -> None:
    deadline = time.time() + timeout
    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                if response.status == 200:
                    return
        except Exception:
            time.sleep(1)
    raise RuntimeError(f"Timed out waiting for {url}")


def start_process(command: list[str], cwd: Path, log_name: str, env: dict[str, str] | None = None) -> subprocess.Popen[str]:
    log_path = ARTIFACTS_DIR / log_name
    log_file = open(log_path, "w", encoding="utf-8")
    return subprocess.Popen(
        command,
        cwd=str(cwd),
        env=env,
        stdout=log_file,
        stderr=subprocess.STDOUT,
        text=True,
    )


def take_shot(page, name: str) -> str:
    path = SCREENSHOTS_DIR / f"{name}.png"
    page.screenshot(path=str(path), full_page=True)
    return str(path)


def set_select_value(select_locator, value: str) -> None:
    select_locator.select_option(value)


def main() -> int:
    ensure_dirs()
    run_suffix = time.strftime("%H%M%S")
    guest_contact = f"browser.demo+guest.{run_suffix}@mywave.local"
    runtime_organizers = []
    for organizer in VIRTUAL_ORGANIZERS:
      runtime_organizers.append(
          {
              **organizer,
              "name": f"{organizer['name']} BR-{run_suffix}",
              "email": organizer["email"].replace("@", f".{run_suffix}@"),
              "program_title": f"{organizer['program_title']} BR-{run_suffix}",
          }
      )

    node = shutil.which("node") or shutil.which("node.exe")
    next_admin = ROOT / "apps" / "admin" / "node_modules" / "next" / "dist" / "bin" / "next"
    next_web = ROOT / "apps" / "web" / "node_modules" / "next" / "dist" / "bin" / "next"
    if not node or not next_admin.exists() or not next_web.exists():
        raise RuntimeError("Missing node runtime or local Next.js executables")

    env = os.environ.copy()
    env.update(
        {
            "APP_ENV": "local",
            "DATABASE_URL": "postgresql://user:password@localhost:5432/mywave",
            "JWT_SECRET": "your-jwt-secret-min-32-chars",
            "ADMIN_JWT_SECRET": "your-admin-jwt-secret-min-32-chars",
        }
    )

    processes: list[subprocess.Popen[str]] = []
    report: dict[str, object] = {"screenshots": {}, "virtual_organizers": [], "booking_statuses": [], "created_review": False, "created_incident": False, "created_commission": False}

    try:
        processes.append(start_process([node, "dist/index.js"], ROOT / "services" / "api", "api.log", env))
        processes.append(start_process([node, str(next_admin), "start", "-p", "3002"], ROOT / "apps" / "admin", "admin.log"))
        processes.append(start_process([node, str(next_web), "start", "-p", "3000"], ROOT / "apps" / "web", "web.log"))

        wait_for_http(f"{API_URL}/health", timeout=90)
        wait_for_http(f"{ADMIN_URL}/login", timeout=90)
        wait_for_http(WEB_URL, timeout=90)

        with sync_playwright() as playwright:
            try:
                browser = playwright.chromium.launch(channel="msedge", headless=True)
            except Exception:
                browser = playwright.chromium.launch(headless=True)

            context = browser.new_context(viewport={"width": 1440, "height": 1200})
            page = context.new_page()

            page.goto(f"{ADMIN_URL}/login", wait_until="networkidle")
            page.locator('input[type="email"]').fill("admin@mywave.local")
            page.locator('input[type="password"]').fill("admin123")
            page.get_by_role("button", name="Войти").click()
            page.wait_for_url("**/organizers", timeout=15000)
            report["screenshots"]["admin_organizers_initial"] = take_shot(page, "admin_organizers_initial")

            for organizer in runtime_organizers:
                page.get_by_placeholder("Название организатора").fill(organizer["name"])
                page.get_by_placeholder("Электронная почта").fill(organizer["email"])
                page.get_by_placeholder("Телефон / Telegram").fill(organizer["phone"])
                page.get_by_placeholder("Юр. статус").fill(organizer["legal_status"])
                page.get_by_role("button", name="Создать организатора").click()
                row = page.locator("tr").filter(has_text=organizer["name"]).first
                row.wait_for(timeout=15000)
                row.get_by_role("button", name="Подтверждения").click()
                evidence_row = page.locator("tr").filter(has_text="Текущие подтверждения").first
                evidence_row.locator("select").first.select_option(organizer["evidence_type"])
                page.get_by_placeholder("URL / ссылка на файл").fill(organizer["evidence_url"])
                page.get_by_placeholder("Комментарий").fill(organizer["evidence_notes"])
                page.get_by_role("button", name="Добавить подтверждение").click()
                time.sleep(1)
                row = page.locator("tr").filter(has_text=organizer["name"]).first
                set_select_value(row.locator("select").first, "checked")
                row.get_by_role("button", name="Сохранить статус").click()
                time.sleep(1)
                report["virtual_organizers"].append({"name": organizer["name"], "status": "checked"})

            report["screenshots"]["admin_organizers_checked"] = take_shot(page, "admin_organizers_checked")

            page.goto(f"{ADMIN_URL}/programs", wait_until="networkidle")
            for index, organizer in enumerate(runtime_organizers):
                create_form = page.locator("form").first
                create_form.locator("select").nth(0).select_option(label=f"{organizer['name']} (Проверен)")
                create_form.get_by_placeholder("Название программы").fill(organizer["program_title"])
                create_form.get_by_placeholder("Дисциплина").fill("Wakesurf")
                create_form.get_by_placeholder("Регион").fill("Krasnodar")
                create_form.get_by_placeholder("Точная локация").fill(f"Krasnodar Marina Slot {index + 1}")
                create_form.locator('input[type="date"]').nth(0).fill(f"2026-05-0{index + 5}")
                create_form.locator('input[type="date"]').nth(1).fill(f"2026-05-0{index + 7}")
                create_form.get_by_placeholder("Длительность, дней").fill("3")
                create_form.locator("select").nth(1).select_option("intermediate")
                create_form.locator("select").nth(2).select_option("medium")
                create_form.get_by_placeholder("Цена от, ₽").fill(str(45000 + index * 5000))
                create_form.get_by_placeholder("Требования к снаряжению").fill("Доска, жилет, согласование экипировки перед стартом.")
                create_form.get_by_placeholder("Медицинские ограничения (можно оставить пустым)").fill("Нет, кроме стандартных ограничений по безопасности.")
                create_form.get_by_placeholder("Правила отмены").fill("Бесплатная отмена за 14 дней.")
                create_form.get_by_placeholder("Программа по дням").fill("День 1: брифинг и вода. День 2: техника. День 3: закрепление и видеоразбор.")
                create_form.get_by_placeholder("Что включено").fill("Координация, тренировки, сопровождение при бронировании.")
                create_form.get_by_role("button", name="Создать черновик").click()
                row = page.locator("tr").filter(has_text=organizer["program_title"]).first
                row.wait_for(timeout=15000)
                row.get_by_placeholder("Ссылка на медиа").fill(f"/pilot-media/program-{index + 1}.svg")
                row.get_by_placeholder("Подпись").fill("Локальное медиа пилота")
                row.get_by_role("button", name="Добавить медиа").click()
                time.sleep(1)
                row = page.locator("tr").filter(has_text=organizer["program_title"]).first
                set_select_value(row.locator("select").first, "published")
                row.get_by_role("button", name="Сохранить статус").click()
                time.sleep(1)

            report["screenshots"]["admin_programs_published"] = take_shot(page, "admin_programs_published")

            page.goto(WEB_URL, wait_until="networkidle")
            page.get_by_text(runtime_organizers[0]["program_title"]).wait_for(timeout=15000)
            report["screenshots"]["web_catalog"] = take_shot(page, "web_catalog")

            page.get_by_role("link", name=runtime_organizers[0]["program_title"]).click()
            page.wait_for_url("**/program/**", timeout=15000)
            page.get_by_label("Телефон, Telegram или электронная почта").fill(guest_contact)
            page.get_by_label("Комментарий для оператора").fill("Виртуальная заявка для браузерной проверки. Уровень: средний.")
            page.get_by_role("button", name="Отправить заявку").click()
            page.get_by_text("Заявка отправлена").wait_for(timeout=15000)
            report["screenshots"]["web_program_submitted"] = take_shot(page, "web_program_submitted")

            page.goto(f"{ADMIN_URL}/bookings", wait_until="networkidle")
            booking_row = page.locator("tr").filter(has_text=guest_contact).first
            booking_row.wait_for(timeout=15000)
            booking_row.get_by_role("link", name="Открыть / сменить статус").click()
            page.wait_for_url("**/bookings/**", timeout=15000)

            for status in ["reviewed", "sent_to_organizer", "contacted", "offer_sent", "booked", "paid_off_platform", "completed"]:
                page.locator("select").last.select_option(status)
                page.get_by_role("button", name="Применить").click()
                status_row_value = page.locator("table tbody tr").filter(has_text="Текущий статус").locator("td").nth(1)
                status_row_value.wait_for(timeout=15000)
                if status_row_value.inner_text().strip() != BOOKING_STATUS_LABELS[status]:
                    page.wait_for_timeout(700)
                report["booking_statuses"].append(status)

            report["screenshots"]["admin_booking_completed"] = take_shot(page, "admin_booking_completed")

            page.goto(f"{ADMIN_URL}/reviews", wait_until="networkidle")
            page.locator("select").nth(0).select_option(label=f"{runtime_organizers[0]['program_title']} · {guest_contact}")
            page.locator("select").nth(1).select_option("5")
            page.get_by_placeholder("Комментарий гостя").fill("Виртуальный позитивный отзыв для проверки потока модерации.")
            page.get_by_role("button", name="Создать отзыв").click()
            review_row = page.locator("tr").filter(has_text=runtime_organizers[0]["program_title"]).first
            review_row.wait_for(timeout=15000)
            review_row.locator("select").first.select_option("approved")
            review_row.get_by_role("button", name="Сохранить").click()
            report["created_review"] = True
            report["screenshots"]["admin_reviews"] = take_shot(page, "admin_reviews")

            page.goto(f"{ADMIN_URL}/incidents", wait_until="networkidle")
            incident_form = page.locator("form").first
            incident_form.locator("select").nth(0).select_option(label=runtime_organizers[0]["name"])
            incident_form.locator("select").nth(1).select_option(label=runtime_organizers[0]["program_title"])
            incident_form.locator("select").nth(2).select_option(label=f"{guest_contact} · Завершена")
            incident_form.locator("select").nth(3).select_option("complaint")
            incident_form.locator("select").nth(4).select_option("low")
            page.get_by_placeholder("Краткое описание").fill("Виртуальный инцидент для проверки очереди и триажа.")
            page.get_by_role("button", name="Создать инцидент").click()
            incident_row = page.locator("tr").filter(has_text="Виртуальный инцидент").first
            incident_row.wait_for(timeout=15000)
            incident_row.locator("select").first.select_option("triaged")
            incident_row.get_by_role("button", name="Сохранить").click()
            report["created_incident"] = True
            report["screenshots"]["admin_incidents"] = take_shot(page, "admin_incidents")

            page.goto(f"{ADMIN_URL}/commissions", wait_until="networkidle")
            page.locator("select").nth(0).select_option(label=f"{runtime_organizers[0]['program_title']} · {guest_contact}")
            page.get_by_placeholder("GMV, ₽").fill("60000")
            page.get_by_placeholder("Ставка, %").fill("10")
            page.get_by_role("button", name="Создать комиссию").click()
            commission_row = page.locator("tr").filter(has_text=runtime_organizers[0]["program_title"]).first
            commission_row.wait_for(timeout=15000)
            commission_row.locator("select").first.select_option("paid")
            commission_row.get_by_placeholder("Собрано, ₽").fill("6000")
            commission_row.get_by_placeholder("Статус счёта").fill("оплачено виртуально")
            commission_row.locator('input[type="date"]').fill("2026-03-27")
            commission_row.get_by_role("button", name="Сохранить").click()
            report["created_commission"] = True
            report["screenshots"]["admin_commissions"] = take_shot(page, "admin_commissions")

            browser.close()

        report_path = ARTIFACTS_DIR / "browser_clickthrough_report.json"
        report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
        print(json.dumps({"status": "ok", "report": str(report_path), "screenshots": report["screenshots"]}, ensure_ascii=False, indent=2))
        return 0
    finally:
        for process in processes:
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (RuntimeError, PlaywrightTimeoutError) as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
