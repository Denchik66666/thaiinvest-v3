-- Общая сеть: позиции, ошибочно числившиеся на SUPER_ADMIN, переносим на первого активного OWNER
-- (операционный владелец внешней сети). Системные и личные позиции не трогаем.
UPDATE "Investor" AS i
SET "ownerId" = u.id
FROM (
  SELECT id
  FROM "User"
  WHERE role = 'OWNER' AND "isArchived" = false
  ORDER BY id ASC
  LIMIT 1
) AS u
WHERE i."isPrivate" = false
  AND i."isSystemOwner" = false
  AND i."ownerId" IN (SELECT id FROM "User" WHERE role = 'SUPER_ADMIN');
