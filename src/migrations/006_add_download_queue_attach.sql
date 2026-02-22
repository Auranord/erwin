ALTER TABLE download_queue ADD COLUMN attach_to_playlist INTEGER NOT NULL DEFAULT 1;
UPDATE download_queue
SET attach_to_playlist = 1
WHERE attach_to_playlist IS NULL;
