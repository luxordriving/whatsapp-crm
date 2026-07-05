-- ============================================================
-- 031_contact_wa_id
--
-- Adds the canonical WhatsApp Identifier (wa_id) to contacts.
-- This ensures we use exactly the identifier Meta expects when
-- sending outbound messages, avoiding issues with missing country
-- codes or formatting differences.
-- ============================================================

ALTER TABLE contacts
  ADD COLUMN IF NOT EXISTS wa_id TEXT;

-- Create a unique index to ensure we don't have duplicate canonical identifiers per account.
-- It's a partial index because manual/CSV contacts might not have a wa_id initially.
CREATE UNIQUE INDEX IF NOT EXISTS idx_contacts_account_wa_id
  ON contacts (account_id, wa_id)
  WHERE wa_id IS NOT NULL AND wa_id <> '';
