/**
 * Инструменты агента. Сейчас: те же API, что и у analytics-agent (G4.1).
 *
 * Создание черновиков в продукте — не «один POST /drafts», а пайплайн
 * (ingestion → content drafts / jobs). Этап `generator` / «создать draft в БД» —
 * отдельный инкремент с human approve и без автопубликации.
 */
export { getContentEntries, type ContentEntriesResponse } from "../analytics/tools.js";
