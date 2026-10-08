CREATE TABLE IF NOT EXISTS mail (
  id TEXT PRIMARY KEY,
  direction TEXT NOT NULL CHECK (direction IN ('sent', 'received')),
  message_id TEXT,
  from_address TEXT NOT NULL,
  to_addresses TEXT NOT NULL,
  cc_addresses TEXT,
  bcc_addresses TEXT,
  subject TEXT NOT NULL,
  text_body TEXT,
  html_body TEXT,
  attachments TEXT,
  status TEXT NOT NULL DEFAULT 'sent',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS mail_created_at ON mail (created_at DESC);
CREATE INDEX IF NOT EXISTS mail_direction_created_at ON mail (direction, created_at DESC);
CREATE INDEX IF NOT EXISTS mail_from_created_at ON mail (from_address, created_at DESC);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
