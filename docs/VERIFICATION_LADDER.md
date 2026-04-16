# Verification ladder: listed → checked → verified → trusted_by_platform

Операционная логика уровней верификации организатора. Присвоение статусов — только с следом в evidence и/или audit; произвольного «ручного магического» апгрейда без доказательств нет.

## Уровни

### listed

- Минимальный онбординг: организатор добавлен в систему, контакт и название есть.
- Evidence не обязателен. Статус по умолчанию при создании организатора.

### checked

- **Условие:** проведена базовая проверка личности/деятельности.
- **Evidence (операционно):** в `organizer_verification_evidence` должны быть записи, например:
  - `evidenceType = document` — скан/ссылка на ИНН, ОГРН, выписка, договор;
  - `evidenceType = external_profile` — ссылка на соцсети, сайт, портфолио.
- **Ops-правило:** минимум 1–2 записи evidence с осмысленным типом перед переходом listed → checked. Переход через PATCH /organizers/:id/verification-status; в audit_log фиксируется смена verification_status.

### verified

- **Условие:** подтверждённый трек: отзывы, успешные выезды, отсутствие неразрешённых серьёзных инцидентов.
- **Evidence (операционно):**
  - положительные отзывы (Review с moderationStatus = approved) по программам организатора;
  - при наличии инцидентов — все с severity high/critical должны быть в статусе resolved или closed.
- **Ops-правило:** N одобренных отзывов (N задаётся операционно, например ≥1 для пилота); отсутствие открытых критичных инцидентов. Переход только после проверки evidence; смена статуса через PATCH с записью в audit.

### trusted_by_platform

- **Условие:** ручное решение C-level / ops lead; организатор в приоритетном/курируемом списке.
- **Evidence (операционно):** в evidence добавляется запись с типом вроде `platform_decision` или `curated`: дата, кто принял решение, краткое обоснование (в notes). Без такой записи статус trusted не присваивается.
- **Ops-правило:** присвоение только через явный процесс с фиксацией в evidence и audit. Нет «магического» ручного апгрейда без следа.

## Использование evidence в работе

- **Просмотр:** GET /organizers/:id/evidence (admin) — список всех записей по организатору.
- **Добавление:** POST /organizers/:id/evidence (admin) — evidenceType, evidenceUrl, notes.
- **Решение о смене уровня:** ops проверяет evidence и очередь отзывов/инцидентов, затем выполняет PATCH /organizers/:id/verification-status. Каждая смена verification_status пишется в audit_log (oldValue, newValue, changedBy).

Итог: уровни описаны не абстрактно, а через evidence и ops-правила; присвоение checked/verified/trusted без следа в evidence/audit не допускается.
