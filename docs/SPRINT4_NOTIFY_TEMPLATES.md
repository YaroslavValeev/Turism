# Sprint 4 — продуктовые шаблоны Telegram и email (уведомление о публикации программы)

## 1. Что меняется

| Канал | Было | Стало |
|-------|------|--------|
| Telegram (DM, канал) | Плоский текст «новая программа + ссылка» | HTML (`parse_mode: HTML`): заголовок, контекст, блоки «Кому подойдёт», «Что ты получишь», «Кто проводит», «Что важно знать», ссылка + inline-кнопки как раньше |
| Email | Plaintext | `multipart`: **HTML** (mini-landing в inbox) + **text** fallback; CTA-кнопка, отписка |

## 2. Где хранится логика шаблонов

**Один модуль** (без внешних template-файлов на Sprint 4):

- `services/api/src/modules/subscriptions/programNotifyTemplates.ts` — тип `ProgramNotifySource`, сборка текста/HTML, escape, fallback-константы `FB`, буллеты из `audienceFit` / `inclusions` / и т.д.

Подключение:

- `services/api/src/modules/subscriptions/notifier.ts` — загрузка программы из Prisma (`loadProgramNotifySource`), вызов билдеров, отправка.

## 3. Fallback-политика

- Пустые поля **не** рендерятся как отдельные «пустые» секции: вместо этого используются **короткие нейтральные фразы** из `FB.*` (см. константы в `programNotifyTemplates.ts`).
- `audienceFit` → буллеты «Кому подойдёт»; если нет — `formatType` + `levelRequired`, иначе `FB.forWho`.
- `inclusions` → «Что ты получишь»; иначе `whatHappensAfterBooking`; иначе `FB.benefits`.
- Организатор: `organizer.displayName` или `program.organizerName`; иначе `FB.organizer`.
- «Что важно»: `cancellationRules` + `medicalLimitations` (до 3 буллетов); иначе `FB.important`.
- Динамический текст **экранируется** (`escapeTelegramHtml` / `escapeHtml`).

## 4. Поля Program (источник данных)

| Поле Prisma | Использование |
|-------------|----------------|
| `title`, `discipline`, `region`, `startDate`, `endDate` | Заголовок и контекстная строка |
| `audienceFit` | «Кому подойдёт» |
| `inclusions`, `whatHappensAfterBooking` | «Что ты получишь» |
| `organizer.displayName`, `organizerName` | «Кто проводит» |
| `cancellationRules`, `medicalLimitations` | «Что важно знать» |
| `levelRequired`, `formatType` | Доп. буллеты при отсутствии `audienceFit` |

Если строка в БД не найдена (редкий кейс), notifier использует минимальный объект только из `PublishedProgramPayload`.

## 5. Тесты

- `services/api/src/modules/subscriptions/programNotifyTemplates.test.ts` — структура Telegram, HTML-escape в email, sparse-данные.

## 6. Ручной прогон после деплоя

1. **Telegram:** опубликовать программу (или `sprint3:email-e2e` не шлёт в канал при allowlist) — для канала: снять allowlist на staging, проверить сообщение и кнопку «Открыть программу».
2. **Email:** `pnpm --filter api run sprint3:email-e2e` с `SPRINT3_E2E_RECIPIENT_EMAIL` — проверить HTML в Gmail (desktop + mobile), отписку.

## 7. Изменённые файлы (Sprint 4 + домен)

- `services/api/src/modules/subscriptions/programNotifyTemplates.ts` (**новый**)
- `services/api/src/modules/subscriptions/programNotifyTemplates.test.ts` (**новый**)
- `services/api/src/modules/subscriptions/notifier.ts`
- `services/api/src/modules/subscriptions/mailer.ts` (опциональный `html`)
- Домен **`mywavetour.ru`**: `apps/web` (layout, robots, sitemap, `siteUrl.ts`, `pilotLanding.ts`), `infra/nginx/mywave.conf`, `docs/deployment/*`, `docs/SPRINT3*.md`, `*.env.production` в корне / api / web / admin
