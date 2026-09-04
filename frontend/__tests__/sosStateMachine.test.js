import {SOS_STATES, canTransition, transitionSosState} from '../src/features/sos/stateMachine';

describe('SOS state machine', () => {
  test('allows only the defined lifecycle transitions', () => {
    expect(canTransition(SOS_STATES.IDLE, SOS_STATES.PENDING)).toBe(true);
    expect(canTransition(SOS_STATES.PENDING, SOS_STATES.ACTIVE)).toBe(true);
    expect(canTransition(SOS_STATES.PENDING, SOS_STATES.CANCELLED)).toBe(true);
    expect(canTransition(SOS_STATES.ACTIVE, SOS_STATES.DEACTIVATED)).toBe(true);
    expect(canTransition(SOS_STATES.ACTIVE, SOS_STATES.CANCELLED)).toBe(false);
    expect(canTransition(SOS_STATES.CANCELLED, SOS_STATES.ACTIVE)).toBe(false);
    expect(canTransition(SOS_STATES.PENDING, SOS_STATES.PENDING)).toBe(false);
  });

  test('rejects stale status updates without mutating the event', () => {
    const event = {id: 'sos-1', status: SOS_STATES.CANCELLED};
    const result = transitionSosState(event, SOS_STATES.ACTIVE);
    expect(result.ok).toBe(false);
    expect(result.event).toBe(event);
    expect(event.status).toBe(SOS_STATES.CANCELLED);
  });
});
