# Verification runbook (organizer)

Пошаговая инструкция для ops: верификация организатора по уровням listed → checked → verified → trusted_by_platform. Source of truth: [VERIFICATION_LADDER.md](VERIFICATION_LADDER.md).

---

## 1. Evidence requirements (что нужно для перехода)

| Текущий уровень | Следующий уровень | Требования по evidence |
|-----------------|-------------------|------------------------|
| listed | checked | Минимум 1–2 записи в organizer_verification_evidence: document (ИНН/ОГРН/договор) и/или external_profile (сайт/соцсети). Без evidence переход не допускается. |
| checked | verified | Одобренные отзывы (Review, moderationStatus=approved) по программам организатора; при инцидентах high/critical — все resolved или closed. N ≥ 1 для пилота. |
| verified | trusted_by_platform | Запись в evidence с типом platform_decision или curated: дата, кто решил, обоснование в notes. Без этой записи trusted не присваивать. |

---

## 2. Status transitions (допустимые переходы)

- **listed** → checked (только при наличии evidence по п.1).
- **checked** → verified (только при выполнении условий по отзывам/инцидентам).
- **verified** → trusted_by_platform (только при наличии evidence platform_decision/curated).
- Любой → paused, rejected — по решению ops; каждая смена пишется в audit.

Переход вручную: **PATCH /organizers/:id/verification-status** с телом `{ "verificationStatus": "checked" }` (или другой целевой статус). Только с admin Bearer.

---

## 3. Operator actions (пошагово)

### listed → checked

1. Открыть организатора в admin (очередь организаторов или GET /organizers/:id).
2. Проверить evidence: GET /organizers/:id/evidence (admin). Если записей нет или меньше 1–2 осмысленных — добавить: POST /organizers/:id/evidence, body `{ "evidenceType": "document", "evidenceUrl": "https://...", "notes": "ИНН/договор" }` или `evidenceType: "external_profile"` и т.д.
3. Убедиться, что минимум 1–2 evidence есть.
4. Выполнить PATCH /organizers/:id/verification-status, body `{ "verificationStatus": "checked" }`.
5. Проверить audit_log: запись entityType=organizer, changedField=verification_status, oldValue=listed, newValue=checked.

### checked → verified

1. Проверить отзывы: GET /reviews с фильтром или по программам организатора; убедиться, что есть хотя бы один Review с moderationStatus=approved для этого организатора (для пилота N≥1).
2. Проверить инциденты: GET /incidents с фильтром по organizerId; все с severity high/critical должны быть resolved или closed.
3. При выполнении условий: PATCH /organizers/:id/verification-status, body `{ "verificationStatus": "verified" }`.
4. Проверить audit_log: запись verification_status, oldValue=checked, newValue=verified.

### verified → trusted_by_platform

1. Добавить evidence: POST /organizers/:id/evidence, body `{ "evidenceType": "platform_decision", "notes": "Дата, кто принял решение, краткое обоснование" }`.
2. PATCH /organizers/:id/verification-status, body `{ "verificationStatus": "trusted_by_platform" }`.
3. Проверить audit_log.

---

## 4. Missing evidence logic (чего не хватает)

- **Нет записей evidence** → переход listed → checked запрещён. Действие: добавить evidence через POST /organizers/:id/evidence, затем повторить переход.
- **Нет одобренных отзывов** → переход checked → verified не рекомендуется (для пилота можно задать N=0 операционно; иначе ждать появления Review и модерации).
- **Есть открытые инциденты high/critical** → переход в verified не делать до их разрешения (resolved/closed).
- **Нет записи platform_decision** → переход в trusted_by_platform запрещён. Действие: создать evidence с типом platform_decision/curated, затем PATCH status.

---

## 5. Audit expectations

При каждой смене verification status в audit_log должна появиться запись:

| Поле | Ожидание |
|------|----------|
| entityType | organizer |
| entityId | id организатора |
| changedField | verification_status |
| oldValue | предыдущий статус |
| newValue | новый статус |
| changedBy | id admin-пользователя |
| createdAt | время операции |

Просмотр: Prisma Studio (audit_log) или прямой запрос к БД. Без записи в audit присвоение статуса считается несоответствующим runbook.

---

## 6. Где выполнять

- **API:** все запросы с заголовком Authorization: Bearer &lt;token&gt; (токен через POST /auth/login).
- **Admin UI:** очередь организаторов; смена verification-status через API (в текущей версии admin — списки; вызов PATCH при необходимости через curl/Postman или добавить кнопку/ссылку на runbook).
- **Ссылка для ops:** данный документ — [docs/VERIFICATION_RUNBOOK.md](VERIFICATION_RUNBOOK.md).
