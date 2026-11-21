import parser from "@typescript-eslint/parser";
import plugin from "@typescript-eslint/eslint-plugin";

export default [
  { ignores: ["**/dist/**", "**/node_modules/**"] },
  {
    files: ["packages/*/src/**/*.ts"],
    languageOptions: {
      parser,
      ecmaVersion: "latest",
      sourceType: "module",
    },
    plugins: { "@typescript-eslint": plugin },
    rules: {
      "constructor-super": "error",
      "no-constant-condition": ["error", { checkLoops: false }],
      "no-duplicate-case": "error",
      "no-eval": "error",
      "no-implied-eval": "error",
      "no-new-func": "error",
      "no-prototype-builtins": "error",
      "no-unsafe-finally": "error",
      "@typescript-eslint/no-duplicate-enum-values": "error",
      "@typescript-eslint/no-non-null-asserted-optional-chain": "error",
    },
  },
];
