module.exports = {
  preset: "ts-jest/presets/default-esm",
  testEnvironment: "node",
  // scratch/ holds throwaway checkouts, such as the resolve-issue skill's main worktree
  testPathIgnorePatterns: ["/node_modules/", "/scratch/", "/dist/"],
  modulePathIgnorePatterns: ["<rootDir>/scratch/"],
  extensionsToTreatAsEsm: [".ts"],
  moduleNameMapper: {
    "^(\\.{1,2}/.*)\\.js$": "$1",
  },
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        useESM: true,
      },
    ],
  },
};
