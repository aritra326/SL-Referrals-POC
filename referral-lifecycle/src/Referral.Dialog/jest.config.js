module.exports = {
  testEnvironment: "jsdom",
  testMatch: ["<rootDir>/tests/**/*.test.ts?(x)"],
  transform: { "^.+\.tsx?$": ["ts-jest", { tsconfig: "tsconfig.json" }] }
};
