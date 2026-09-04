export const SOS_STATES = Object.freeze({
  IDLE: 'IDLE',
  PENDING: 'PENDING',
  ACTIVE: 'ACTIVE',
  CANCELLED: 'CANCELLED',
  DEACTIVATED: 'DEACTIVATED',
});

const VALID_TRANSITIONS = Object.freeze({
  [SOS_STATES.IDLE]: new Set([SOS_STATES.PENDING]),
  [SOS_STATES.PENDING]: new Set([SOS_STATES.ACTIVE, SOS_STATES.CANCELLED]),
  [SOS_STATES.ACTIVE]: new Set([SOS_STATES.DEACTIVATED]),
  [SOS_STATES.CANCELLED]: new Set(),
  [SOS_STATES.DEACTIVATED]: new Set(),
});

export function canTransition(from, to) {
  return Boolean(VALID_TRANSITIONS[from]?.has(to));
}

export function transitionSosState(event, nextStatus) {
  if (!event || !canTransition(event.status, nextStatus)) {
    return {ok: false, event, reason: `Invalid SOS transition: ${event?.status || 'UNKNOWN'} -> ${nextStatus}`};
  }

  return {
    ok: true,
    event: event.status === nextStatus ? event : {...event, status: nextStatus},
  };
}
