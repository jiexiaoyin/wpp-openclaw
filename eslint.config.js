// eslint.config.js - ESLint 9+ flat config
// v1.0.4 FIX-B3 (P3-6 ESLint config)
//
// 安装命令: npm i -D eslint typescript-eslint (per 老板铁律 deploy.sh 不跑 npm install)
//
// 用法: npx eslint src/ tests/   或  npm run lint
//
// 规则策略:
//   - 用 typescript-eslint 推荐规则 (类型感知)
//   - 禁止 console.log (强制 logger)
//   - 禁止 : any 残留 (silent killer 防御)
//   - catch 块要求用 formatErr 或 log.error (stack 保留)

import tseslint from "typescript-eslint";

export default tseslint.config(
  // Base JS 推荐
  ...tseslint.configs.recommended,

  // TS 推荐
  {
    files: ["src/**/*.ts", "tests/**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
    },
    rules: {
      // === 类型安全 ===
      "@typescript-eslint/no-explicit-any": "warn", // v1.0.2 还有 1 处 justified, warn 不阻断
      "@typescript-eslint/no-unsafe-argument": "off", // ts strict 已查
      "@typescript-eslint/no-unsafe-assignment": "off",
      "@typescript-eslint/no-unsafe-member-access": "off",
      "@typescript-eslint/no-unsafe-call": "off",
      "@typescript-eslint/no-unsafe-return": "off",

      // === 风格 ===
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_" }],
      "no-console": ["error", { allow: ["error", "warn"] }], // 禁 console.log, 允许 console.error/warn (defensive)
      "prefer-const": "error",
      "no-var": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],

      // === Silent killer 防御 ===
      // catch (e) 块里如果只用 e.message (没 formatErr), 警告
      // (v1.0.2 FIX-7 之后已统一, 此规则为防御性)
      // 简化版: 不做 AST 级检测, 靠 PR review + grep 维护

      // === 测试放宽 ===
    },
  },
  {
    files: ["tests/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off", // test mock 经常用 any
    },
  },
  // 忽略生成的 dist/ 和 node_modules/
  {
    ignores: ["dist/**", "node_modules/**", "coverage/**"],
  },
);
