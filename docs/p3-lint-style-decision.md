# P3 评估：ESLint 风格规则（决定不做）

> 评估日期：2026-09-28
> 对象：是否为 `eslint.config.mjs` 增加风格类规则（semi / quotes / indent / comma-dangle）
> 结论：**不做**。风格本已统一，开规则成本 > 收益。

## 一、实测风格一致性（全仓库抽样）

| 维度 | 实测 | 判断 |
|---|---|---|
| 引号 | 双引号 import **680** 行 / 单引号 **0** 行 | 100% 一致 |
| TAB 混用 | TAB 文件数 **0** | 完全干净 |
| 尾随空格 | 仅 **10** 行 | 基本干净 |
| 分号 | 8,227 行带分号 / 总 18,094 行 | 分号风格 |
| 缩进 | 2 空格为基础，4 空格为二级嵌套 | 正常结构，非混用 |

### 缩进抽样（说明「2/4 混用」是误判）

```
src/index.ts            2空格层=241  4空格层=215
src/channel-contract.ts 2空格层=22   4空格层=114
src/config.ts           2空格层=296  4空格层=215
src/ws-client.ts        2空格层=55   4空格层=77
src/inbound/handler.ts  2空格层=94   4空格层=31
```

4 空格层计数高 = 该文件嵌套层级深，不是缩进宽度不一致。

## 二、核心判断

**这个仓库不是「没有约定」，而是约定已经统一地体现在代码里，只是没写进配置文件。**

引号 680:0 与 TAB 0 是最强信号 —— 若真是无约定状态，不可能出现这种一致度。

## 三、为什么不做

### 收益侧：接近零

- 风格已经统一，开规则不改善可读性
- 真正的语义问题（`no-floating-promises` / `no-misused-promises`）**已经开着**
- 历史上没有出过风格相关的 bug

### 成本侧：显著

| 成本 | 说明 |
|---|---|
| 一次性 diff 洪水 | 即使只开 5 条风格规则，也可能刷出数百至上千条告警 |
| 淹没真问题 | 正是 `eslint.config.mjs` 已写明的顾虑：反而把 no-floating-promises 这类真问题淹没 |
| 新依赖 | `@stylistic/eslint-plugin` 未安装，为一个零收益目标加依赖 |
| Prettier 更合适 | 若真要统一格式，Prettier 一键格式化优于 ESLint 风格规则（无告警噪音） |

### 方向一致性

`eslint.config.mjs` 已记录一条刻意的克制：

> 刻意不开 recommended 全家桶。它会带入 no-explicit-any，而
> `src/dispatch/agent-tools/_shared.ts:19` 有一处**有意为之**的 any（带注释说明），
> 属于既定的产品决策，不应被一个新引入的工具链推翻。宁可少开规则，不推翻既有决策。

开风格规则虽不直接冲突，但同属「用新工具链改变既有代码面貌」，应保持同样克制。

## 四、若将来仍要做，建议的最小版本

1. **只加 `.editorconfig`** —— 缩进/换行/编码，**零告警**，不动一行业务代码
2. **不开 ESLint 风格规则**
3. 或改用 **Prettier**（不参与 lint 门禁，避免稀释 lint 信号）

## 五、复现方法（供复核）

```bash
# 引号一致性
grep -rE 'from "' src/ --include='*.ts' | wc -l    # 680
grep -rc "from '" src/ --include='*.ts'            # 0

# TAB 混用
grep -rlP '\t' src/ --include='*.ts' | wc -l       # 0

# 尾随空格
grep -rE ' +$' src/ --include='*.ts' | wc -l        # 10

# 缩进层级分布（选任一文件）
grep -cE '^  [^ ]' src/index.ts   # 2 空格层
grep -cE '^    [^ ]' src/index.ts # 4 空格层
```

## 六、备注

评估期间曾建 `eslint.config.trial.mjs` 做试跑，**未提交，已删除**。
本决定不产生任何代码改动。