# Filmstrip — web-ready

Файлы JPEG для hero-киноленты (см. `src/content/filmstripHero.ts`).

- **Сборка (единый 16:10, progressive JPEG, ~80 quality):** из корня монорепо  
  `pnpm run filmstrip:build-assets`  
  или: `pnpm --filter web run filmstrip:build-assets`
- **Скрипт:** `apps/web/scripts/build_filmstrip_web_images.mjs` — качает **воспроизводимые** кадры (Picsum по `seed` и приводит к 1920×1200), при отсутствии сети — локальный градиент. Замените сгенерированные файлы на свои **под теми же путями** или обновите пути в `filmstripHero.ts`.
- **Подпапки:** `wakesurf/`, `mtb/`, `ski/`, `kite/`.

**Windows:** при смене только регистра в имени файла путь в Git может вести себя неожиданно — копируйте через новое имя.
