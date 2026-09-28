// eslint.config.mjs — ESLint 9 flat config (ESM)
//
// 设计原则: 只抓"异步正确性"与"死代码"两类真问题, 不引入任何风格类规则。
//   理由: 本仓库此前无 ESLint, 也没有缩进/引号/分号的历史约定 (353 个测试用例 + tsc strict
//   已覆盖语义, 风格从未被约束)。此时开风格规则 = 一次性刷出上千条无意义告警, 反而把
//   no-floating-promises 这类真问题淹没掉 —— 这正是"务实不激进"的反面。
//
// 规则取舍:
//   no-floating-promises / no-misused-promises —— 本插件 99% 是异步路径 (ws 重连、judge 调用、
//     webhook 回调), 漏 await 的 Promise 表现为"静默不执行", 是最贵的 bug 类型, 必须报。
//     这两条需要类型信息, 故启用 projectService (走 tsconfig.json)。
//   no-unused-vars —— 与 tsc 的 noUnusedLocals/noUnusedParameters 同向, 放行 _ 前缀
//     (既有约定: 有意忽略的参数/变量用 _ 命名)。
//   prefer-const —— 纯机械、零争议、零风格倾向。
//
// 刻意不开: recommended / recommendedTypeChecked 全家桶。它会带入 no-explicit-any 等规则,
//   而 src/dispatch/agent-tools/_shared.ts:19 有一处**有意为之**的 any (带注释说明), 属于
//   既定的产品决策, 不应被一个新引入的工具链推翻。宁可少开规则, 不推翻既有决策。

import tseslint from "typescript-eslint";

export default [
  {
    // 不 lint 的路径。前几项是构建产物与第三方代码; src/**/*.js 是历史遗留的编译产物
    // (仓库 .gitignore 里已明确: 真源码是 .ts, tsconfig outDir=./dist, src 下的 .js 无一处手写),
    // 用 espree 去解析编译产物只会产出噪音。
    ignores: [
      "dist/**",
      "dist-release/**",
      "release/**",
      "node_modules/**",
      "vendor/**",
      "tools/**",
      "scripts/**",
      "tests/**",
      "src/**/*.js",
    ],
  },
  {
    files: ["src/**/*.ts"],
    plugins: { "@typescript-eslint": tseslint.plugin },
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // 类型感知解析: no-floating-promises / no-misused-promises 的必要条件。
        // projectService 会自动按 tsconfig.json 归属文件, 不需要手写 project 数组。
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      "@typescript-eslint/no-floating-promises": "error",
      "@typescript-eslint/no-misused-promises": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          destructuredArrayIgnorePattern: "^_",
        },
      ],
      "prefer-const": "error",
    },
  },
];
