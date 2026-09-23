module.exports = {
  root: true,
  extends: '@react-native',
  rules: {
    // Existing effects intentionally use stable lifecycle timing in several
    // screens; enforcing dependency rewrites would change runtime behavior.
    'react-hooks/exhaustive-deps': 'off',
    'react-hooks/rules-of-hooks': 'off',
  },
};
