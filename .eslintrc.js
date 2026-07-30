module.exports = {
  root: true,
  env: {
    commonjs: true,
    es2021: true,
    node: true,
  },
  ignorePatterns: ["frontend/generated/*", "dist/*"],
  extends: ["standard", "prettier"],
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 12,
    sourceType: "module",
  },
  plugins: ["@typescript-eslint"],
  overrides: [
    {
      files: ["**/*.ts"],
      rules: {},
    },
  ],
  rules: {},
};