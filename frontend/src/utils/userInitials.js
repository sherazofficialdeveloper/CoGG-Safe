export const getUserInitials = (name, fallback = 'U') => {
  const words = String(name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (!words.length) return fallback;
  if (words.length === 1) return words[0].charAt(0).toUpperCase();

  return `${words[0].charAt(0)}${words[words.length - 1].charAt(0)}`.toUpperCase();
};
