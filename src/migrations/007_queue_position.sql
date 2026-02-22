ALTER TABLE queue ADD COLUMN position INTEGER NOT NULL DEFAULT 0;

UPDATE queue
SET position = (
  SELECT COUNT(*)
  FROM queue AS q2
  WHERE q2.created_at < queue.created_at
     OR (q2.created_at = queue.created_at AND q2.id <= queue.id)
)
WHERE COALESCE(position, 0) = 0;
