-- Порядок медиа карточки: position = 0 — обложка. Раньше порядок задавала только физическая выдача Postgres.
ALTER TABLE "program_media" ADD COLUMN "position" INTEGER NOT NULL DEFAULT 0;

-- cuid растёт со временем создания, поэтому текущая обложка (первое добавленное медиа) остаётся первой.
UPDATE "program_media" AS pm
SET "position" = ranked.rn - 1
FROM (
    SELECT "id", ROW_NUMBER() OVER (PARTITION BY "programId" ORDER BY "id") AS rn
    FROM "program_media"
) AS ranked
WHERE pm."id" = ranked."id";

CREATE INDEX "program_media_programId_position_idx" ON "program_media"("programId", "position");

-- Ручной порядок из админки важнее эвристик витрины (разворот «инфографичных» галерей, пропуск промо-картинок).
ALTER TABLE "programs" ADD COLUMN "mediaOrderPinned" BOOLEAN NOT NULL DEFAULT false;
