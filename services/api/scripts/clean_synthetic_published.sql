BEGIN;

-- 1) Normalize obviously synthetic fields on published programs.
UPDATE programs
SET
  title = NULLIF(trim(regexp_replace(coalesce(title, ''), '(demo|test|seed|e2e|synthetic|тест|синтет|cmof)', '', 'ig')), ''),
  "organizerName" = NULLIF(trim(regexp_replace(coalesce("organizerName", ''), '(demo|test|seed|e2e|synthetic|тест|синтет|cmof)', '', 'ig')), ''),
  "intakeSource" = CASE
    WHEN lower(coalesce("intakeSource", '')) = 'seed' THEN 'admin_manual'
    ELSE "intakeSource"
  END,
  "sourceUrl" = CASE
    WHEN lower(coalesce("sourceUrl", '')) LIKE '%example.com%'
      OR lower(coalesce("sourceUrl", '')) LIKE '%localhost%'
    THEN NULL
    ELSE "sourceUrl"
  END,
  "updatedAt" = now()
WHERE "publishStatus" = 'published';

-- 2) Normalize organizer display names for organizers that own published programs.
UPDATE organizers o
SET
  "displayName" = NULLIF(trim(regexp_replace(coalesce(o."displayName", ''), '(demo|test|seed|e2e|synthetic|тест|синтет|cmof)', '', 'ig')), ''),
  "updatedAt" = now()
WHERE EXISTS (
  SELECT 1
  FROM programs p
  WHERE p."organizerId" = o.id
    AND p."publishStatus" = 'published'
);

COMMIT;
