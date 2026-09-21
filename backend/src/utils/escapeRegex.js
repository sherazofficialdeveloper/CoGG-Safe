/**
 * Escapes regex metacharacters in user-supplied search input before it's
 * used to build a MongoDB $regex filter. Without this, a client-controlled
 * search string could inject regex syntax (e.g. cause a ReDoS pattern or
 * an unintended broad match).
 */
function escapeRegex(str) {
  return String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = escapeRegex;
