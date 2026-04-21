# Program Card Schema

## Обязательные поля карточки программы
1. program_id
2. title
3. discipline
4. region
5. exact_location
6. start_date
7. end_date
8. **duration_days** — **не вводится вручную**: вычисляется на сервере по `start_date` и `end_date` (календарные дни, UTC, **включительно**) и хранится как производное поле. Клиент (веб, админка, внешние интеграции) не должен задавать `durationDays` без смены дат; API отклоняет попытку PATCH только с `durationDays`.
9. format_type
10. audience_fit
11. level_required
12. risk_level
13. price_from_rub
14. currency
15. inclusions
16. exclusions
17. gear_requirements
18. medical_limitations
19. itinerary_day_by_day
20. organizer_name
21. trust_reason
22. media_gallery
23. reviews_summary
24. cancellation_rules
25. what_happens_after_booking
26. CTA

## Required for publish
- no missing safety fields
- no missing organizer reference
- no missing cancellation logic
- at least 1 real media asset
- at least 1 contact / response channel
- `durationDays` в БД **совпадает** с `startDate`/`endDate` по правилу `inclusiveDurationDaysUTC` (см. publish gate `duration_days_calendar`); иначе переход в `published` блокируется до исправления дат через PATCH.

## Дополнительные блоки тура (опционально, БД + API)

Текстовые поля программы (организатор), если заполнены — показываются в публичной карточке:

- `packingListNotes` — что взять с собой (дополняет `gearRequirements`: снаряжение / техника)
- `accommodationNotes` — где жить
- `transportNotes` — как добраться
- `sightsNotes` — что посмотреть рядом
- `planBWeatherNotes` — план Б (погода, форс-мажор)

Отдельно, **мягкие подсказки платформы** (не подменяют организатора):

- `platformTravelTips`

## Организатор: блок доверия на карточке (опционально)

Поля организателя (текст, по данным анкеты / ops), при заполнении выводятся на странице программы:

- `certificatesSummary`, `insuranceSummary`, `emergencyPlanSummary`, `equipmentSummary`
