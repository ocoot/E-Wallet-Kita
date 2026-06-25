// This file used to contain its own copy of inferCategoryKey() with a
// much shorter (and out of date) keyword list than the one in
// api/telegram-webhook.ts. It now simply re-exports the single source
// of truth so existing imports (`from './_utils.js'`) keep working
// without callers needing to know it moved.
export { inferCategoryKey } from './_lib/categoryInference.js';
