"""
Одноразовый/повторяемый импорт: PNG из Cursor assets → JPEG в public/media/source/filmstrip/.
Запуск: из корня monorepo или apps/web: python apps/web/scripts/ingest_filmstrip_sources.py
"""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

# Папка, куда Cursor складывает вложения (имена файлов стабильны по суффиксу uuid).
_env_assets = os.environ.get("CURSOR_FILMSTRIP_ASSETS")
DEFAULT_ASSETS = Path(_env_assets) if _env_assets else Path(
    r"C:\Users\X230\.cursor\projects\f-MyWave-NEW2026-Toutism\assets"
)

# ingest_filmstrip_sources.py → apps/web/scripts/ → repo root = parents[3]
REPO_ROOT = Path(__file__).resolve().parents[3]
PUBLIC_MEDIA = REPO_ROOT / "apps" / "web" / "public" / "media"
OUT_BASE = PUBLIC_MEDIA / "source" / "filmstrip"

# rel_out, source_filename_suffix (уникальный хвост имени в assets)
JOBS: list[tuple[str, str]] = [
    ("wakesurf/wasurf_1.jpg", "images_wasurf_1-df8e75fb-43da-4815-a7d0-e472c7b2de74.png"),
    ("wakesurf/wasurf_2.jpg", "images_wasurf_2-fb541620-8345-49a9-ab22-a63197354e52.png"),
    ("wakesurf/wasurf_3.jpg", "images_wasurf_3-3b5a62b8-cfa9-47a4-84d5-62d23cffd69f.png"),
    ("ski/ski_1.jpg", "images_ski_1-1c926781-daa2-4d1b-846a-c9912b47d789.png"),
    ("ski/ski_kids_1.jpg", "images_ski_kids_1-d226047c-8c7d-4506-bc76-55852d00dceb.png"),
    ("ski/ski_kids_2.jpg", "images_ski_kids_2-973f8e2c-2b72-415d-8f61-a013c3dee495.png"),
    ("ski/snow_1.jpg", "images_snow_1-c7c55685-2669-42c2-936a-5ae14ea20b93.png"),
    ("ski/snow_kids_1.jpg", "images_snow_Kids_1-206c2f6a-afca-46ae-82f4-ac66ce4d28f0.png"),
    ("kite/kite_1.jpg", "images_Kite_1-2965cda1-18ca-4480-a061-ac0eee6fa52f.png"),
    ("kite/kite_2.jpg", "images_kite_2-3f7dc676-abb0-48d7-a5c6-cc28b7ff398c.png"),
    ("kite/wind_1.jpg", "images_wind_1-5c7cd0c8-ee11-420d-a026-297ea0c1ffd9.png"),
    ("kite/wind_2.jpg", "images_wind_2-b2c4867a-f800-4973-bac9-d15302a9d6e9.png"),
    ("kite/wing_1.jpg", "images_wing_1-f175b8dd-82df-4f95-af61-bf2957f562d0.png"),
    ("mtb/mtb_cross_1.jpg", "images_mtbCross_1-3b04f648-bf37-43d7-8a72-384d0d4e54f9.png"),
    ("mtb/mtbdh_1.jpg", "images_mtbdh_1-37a7a8e7-f43d-4b05-aa05-3f7aa8d8ae5c.png"),
    ("mtb/mtbdh_2.jpg", "images_mtbdh_2-b058714a-47a0-46c0-a25b-6343a63d3487.png"),
]


def find_source(assets_dir: Path, suffix: str) -> Path:
    for p in assets_dir.iterdir():
        if p.is_file() and p.name.endswith(suffix):
            return p
    raise FileNotFoundError(f"Не найден файл, оканчивающийся на {suffix!r} в {assets_dir}")


def to_jpeg(src: Path, dest: Path, quality: int = 90) -> None:
    dest.parent.mkdir(parents=True, exist_ok=True)
    im = Image.open(src)
    if im.mode in ("RGBA", "P"):
        im = im.convert("RGB")
    elif im.mode != "RGB":
        im = im.convert("RGB")
    im.save(dest, "JPEG", quality=quality, optimize=True)


def main() -> None:
    if not DEFAULT_ASSETS.is_dir():
        raise SystemExit(f"Нет папки с исходниками: {DEFAULT_ASSETS}")
    for rel, suff in JOBS:
        src = find_source(DEFAULT_ASSETS, suff)
        out = OUT_BASE / rel
        to_jpeg(src, out)
        print(f"OK {src.name} -> {out.relative_to(REPO_ROOT)}")

    # Пустые целевые папки для web-ready (позже .webp)
    for cat in ("wakesurf", "ski", "kite", "mtb"):
        d = PUBLIC_MEDIA / "filmstrip" / cat
        d.mkdir(parents=True, exist_ok=True)
        readme = d / ".gitkeep"
        if not readme.exists():
            readme.write_text("", encoding="utf-8")
    print("Готово: source JPEG + каталоги media/filmstrip/*")


if __name__ == "__main__":
    main()
