import {dispatchEmergencyEmail, normalizeEmailStatus} from '../src/features/sos/services/emailService';

describe('email lifecycle status', () => {
  test.each([
    ['pending', 'PENDING'],
    ['processing', 'PROCESSING'],
    ['sent', 'SENT'],
    ['failed', 'FAILED'],
    ['unknown', 'UNKNOWN'],
    ['timeout', 'UNKNOWN'],
  ])('normalizes %s without turning it into a permanent failure', (input, expected) => {
    expect(normalizeEmailStatus(input)).toBe(expected);
  });

  test('pre-launch dispatch remains pending while backend owns delivery', async () => {
    await expect(dispatchEmergencyEmail({email: 'contact@example.com'})).resolves.toMatchObject({
      status: 'PENDING',
    });
  });
});
