/**
 * The ONLY roles that may ever exist in the system.
 * Role assignment must always be derived server-side from this list —
 * never trust a role value coming from a client request.
 */
const ROLES = Object.freeze({
  ADMIN: 'admin',
  USER: 'user',
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));

module.exports = { ROLES, ALL_ROLES };
