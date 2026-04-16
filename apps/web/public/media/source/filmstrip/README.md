# Filmstrip — исходники (source)

Здесь лежат **оригиналы** для hero/filmstrip (JPEG, экспорт из PNG). Не путать с медиа конкретных программ (`program_media` / API).

- Импорт/пересборка: `apps/web/scripts/ingest_filmstrip_sources.py` (путь к Cursor `assets` задаётся через `CURSOR_FILMSTRIP_ASSETS`, иначе — дефолт под этот проект).
- Web-ready оптимизация (`.webp`, единый кроп): каталог `public/media/filmstrip/` — см. README там.

Структура и нейминг зафиксированы в `docs/FILMSTRIP_HERO_ASSET_STRUCTURE_EMAIL.md`.
