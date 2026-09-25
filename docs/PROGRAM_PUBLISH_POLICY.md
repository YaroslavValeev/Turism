# Program publish policy (каталог + Telegram)

## Статусы

| Статус | Сайт | Telegram-канал |
|---|---:|---:|
| `draft` | нет | нет |
| `internal_review` | нет | нет |
| `needs_fix` | нет | нет |
| `approved` | нет | нет |
| `published` | да | да, при **переходе** в этот статус |
| `paused` | нет | нет |
| `archived` | нет | нет |

- **`approved` («Одобрена»)** — программа прошла проверку. На сайт и в канал не публикует.
- **`published` («Опубликована»)** — финальный статус для витрины и карточки в канале MyWaveTour.

## Правильный порядок

1. Проверить даты и данные.
2. Проверить наличие **image**-медиа (иначе в канал уйдёт текст без фото).
3. При необходимости довести до `approved`.
4. Через админку (`PATCH /programs/:id/publish-status`) или Telegram Admin (`/check_publish`) перевести в `published`.
5. Проверить карточку на сайте и сообщение в канале.

## Важно

- Менять статус через API/админку/Telegram Admin, **не** прямым SQL.
- Именно переход **из любого другого статуса в `published`** запускает `notifySubscribersOnProgramPublished` (канал + подписки).
- Повторная установка `published` не создаёт повторную публикацию в канал.
- Прямая правка БД на `published` покажет программу на сайте, но **не** отправит Telegram.

## Publish gate

Перед `published` система требует: название, организатора, дисциплину, регион, даты, уровень, риск, снаряжение, мед. ограничения, правила отмены, описание/структуру, ≥1 медиа, отсутствие тестовых/синтетических маркеров.

Единый код: `services/api/src/modules/programs/publishGate.ts` → `canPublish`.  
Единый apply-path: `setProgramPublishStatus` (админка и Telegram).

## Telegram Admin (оператор)

Команды в owner-chat (`TELEGRAM_CONTENT_OWNER_CHAT_ID` / `TELEGRAM_ALERT_CHAT_ID`):

- `/check_publish` или `/programs_review` — очередь будущих программ (не `published`).
- Кнопка **«Проверить»** → предпросмотр + результат gate.
- **«Опубликовать на сайте и в Telegram»** — только если gate OK → `published`.
- **«Нужна доработка»** → `needs_fix`.

Callbacks: `MTA1|P|PRV|id` / `PUB` / `NFX` / `CXL` (тот же webhook content-pipeline).

Не путать с кнопкой **Publish** в content-pipeline: там `P|<draftId>` ставит decision **`approved`** для черновика контента, а не публикует Program.

## Массовая публикация

Не переводить пачкой десятки программ без аудита: прошедшие даты, дубликаты, устаревшие условия, нет image, битые ссылки, уже публиковавшиеся в канал. Каждый переход в `published` может создать сообщение в канале.
