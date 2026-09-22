module.exports = {
  preset: "@react-native/jest-preset",
  setupFiles: ["./jest.setup.js"],
  setupFilesAfterEnv: ["./jest.setup.after.env.js"],
  moduleNameMapper: {
    "^react-native-config$": "<rootDir>/__mocks__/react-native-config.js",
  },
  transformIgnorePatterns: [
    "node_modules/(?!((jest-)?react-native|@react-native(-community)?|react-native-fs|react-native-maps|react-native-track-player)/)",
  ],
};
