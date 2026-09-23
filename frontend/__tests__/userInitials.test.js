import {getUserInitials} from '../src/utils/userInitials';

describe('getUserInitials', () => {
  test.each([
    ['Sheraz', 'S'],
    ['Sheraz Ali', 'SA'],
    ['Muhammad Sheraz Ali', 'MA'],
    ['Muhammad Rai Sheraz Ali', 'MA'],
    ['  Muhammad   Rai Sheraz Ali  ', 'MA'],
  ])('returns initials for %s', (name, expected) => {
    expect(getUserInitials(name)).toBe(expected);
  });

  test.each([null, undefined, '', '   '])('uses A for empty username %s', name => {
    expect(getUserInitials(name)).toBe('A');
  });
});
