-- Add a snapshot column to store the list of categories (key + labels) that were
-- active at the time a receipt draft was created. This lets the Telegram bot
-- resolve "Edit Category" button indexes back to a stable category key,
-- regardless of whether categories are later added/removed/reordered.
-- This fixes BUTTON_DATA_INVALID errors caused by long category keys, and
-- prevents index-to-category mismatches if the categories table changes
-- mid-conversation.

ALTER TABLE receipt_drafts
  ADD COLUMN IF NOT EXISTS category_options JSONB;

COMMENT ON COLUMN receipt_drafts.category_options IS
  'Snapshot of active expense/both categories ([{key,label_id,label_en}, ...]) captured at draft creation time, used by the Telegram bot to resolve category-selection button indexes without re-querying the live categories table.';
