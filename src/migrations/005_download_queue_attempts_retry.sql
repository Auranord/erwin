ALTER TABLE download_queue ADD COLUMN attempts INTEGER DEFAULT 0;
ALTER TABLE download_queue ADD COLUMN retry_after TEXT;
