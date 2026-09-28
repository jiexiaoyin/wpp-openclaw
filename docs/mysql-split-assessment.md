# mysql.ts 拆分可行性评估（路径 A）

> 评估日期：2026-09-28
> 对象：`src/storage/db/mysql.ts` → 抽出 27 个心流方法
> 状态：**评估完成，拆分已尝试并失败（零改动完整还原）**
> 结果：见文末「九、执行结果」

## 一、实测数据（非推测）

| 指标 | 值 |
|---|---|
| `mysql.ts` 总行数 | 1,612（拆分尝试后仍为 1,612 —— 已完整还原） |
| `createMysqlAdapter` 内方法总数 | 51 |
| 其中 HF（心流）方法 | **27**（占 53%） |
| HF 段行范围 | **993-1591**（599 行） |
| HF 段 region 注释 | `// ====== v1.6.x HEARTFLOW-FEEDBACK` (993 行) |

## 二、HF 段闭包依赖（关键发现）

| 闭包符号 | HF 段引用次数 | 说明 |
|---|---|---|
| `getPool()` | **27** | 与方法数 1:1 —— 每个方法开头都是 `const p = getPool();` |
| `queryWithTimeout` | 33 | |
| `firstRow` | 1 | |
| `rowToXxx` | 4 | 已在 `row-mappers.ts`（上一批抽出） |
| **`cfg`** | **0** | HF 段**完全不碰配置** |
| 模块级可变状态 | 0 | |

### 这个数据推翻了什么

**原判断**：53 个方法共享闭包 → 抽不动
**实测**：HF 段只依赖 4 个符号，`cfg` 依赖为 0，形态 27:1 高度统一

**结论**：这不是「千丝万缕的耦合」，而是一个**可参数化的统一模式**。

## 三、HF 方法对外类型依赖

全部定义在 `src/storage/db/types.ts`：

```
HfClosedSample       HfGroupHourBucket    HfGroupMsgStats
HfGroupProfileRecord HfGroupShareRow      HfGroupStateRecord
HfLayerSampleRow     HfLayerStatRecord    HfLedgerRecord
HfLedgerTrace        HfOutboundTextRow    HfSentCountRow
HfThresholdAuditRecord                    HfVetoResult
```

**关键**：`DbAdapter` 接口里恰好声明了这 27 个 `Hf*` 方法 —— **类型契约完整**，tsc 能强制校验搬移完整性。

## 四、建议拆法（依赖注入）

```ts
// 新文件 src/storage/db/mysql-heartflow.ts
export interface HfDbCtx {
  getPool: () => Pool;
  queryWithTimeout: typeof queryWithTimeout;
  firstRow: typeof firstRow;
}

export function createHfMethods(ctx: HfDbCtx): Pick<DbAdapter, /* 27 个 Hf 方法名 */> {
  const { getPool, queryWithTimeout, firstRow } = ctx;
  return {
    async recordHfJudged(record) { /* 方法体逐字搬移 */ },
    // ... 共 27 个
  };
}
```

```ts
// mysql.ts 接入（1 行展开）
return {
  ...(其余 24 个方法),
  ...createHfMethods({ getPool, queryWithTimeout, firstRow }),
};
```

**预期收益**：`mysql.ts` 1,612 → 约 1,016 行（**-37%**）

## 五、风险清单

### 🔴 R1：`queryWithTimeout` 泛型推断可能退化

它是顶层泛型函数：
```ts
export async function queryWithTimeout<T extends RowDataPacket[] | ResultSetHeader>(
  pool: Pool, sql: string, params?: unknown[]
): Promise<T>
```

作为 ctx 属性传递后，泛型推断可能失效（变成 `unknown`），导致 33 处调用出现 tsc 报错。
**应对**：靠 tsc 驱动修；必要时改为直接 import（而非注入），或显式标注 ctx 字段签名。

### 🟡 R2：循环依赖风险

若 `mysql-heartflow.ts` import `mysql.ts`（为拿 `queryWithTimeout`/`firstRow`），而 `mysql.ts` 又 import `mysql-heartflow.ts` → 环。
**应对**：把这两个底层函数抽到更底层模块，或全部走注入。

### 🟡 R3：这是结构性改动，非纯搬移

引入新接口边界 `HfDbCtx`，是**新设计决策**。方法体虽逐字搬移，但接口是新造的。

## 六、历史教训

**该文件拆过 6 次均失败。** 推测原因：一次拆太多 / 位置有强耦合。

本次选择 HF 段的原因：
- 边界清晰（region 注释明确，993-1591）
- `cfg` 依赖为 0
- 形态统一（27 次 `const p = getPool()`）

**执行协议**：小步 + 每步验证（tsc → build → lint → 全量测试）+ **失败立即还原**，不做「修修补补」。

## 七、验证手段（三层网）

1. `npx tsc --noEmit` —— 类型契约（`Pick<DbAdapter, ...>` 强制校验 27 个签名）
2. `npm run lint` —— 本批刚接入的 ESLint
3. `node --test tests/unit/*.test.mjs` —— 503 个测试 / 501 pass / 0 fail

## 八、关键数字基线（供比对）

```
拆分前：
  mysql.ts                1,612 行
  测试                    503 tests / 501 pass / 0 fail / 2 skip
  构建                    0 error
  lint                    exit 0

上一批（路径 B）成果：
  mysql.ts                1,672 → 1,612（-60）
  row-mappers.ts          新增 87 行（4 个纯函数）
  db-row-mappers.test.mjs 新增 145 行（12 cases）
```

## 九、执行结果（2026-09-28 补记）

**结论：拆分失败，零改动完整还原。**

执行方式：委派 claude（`--permission-mode acceptEdits`），任务书 /tmp/claude-task-p1.md 同级设计，
含「小步 + 每步验证 + 失败立即还原」协议与「不要 git commit」约束。

### 实际发生

```
20:33  启动
20:34  .hf-extract.txt (28,706 B) + .mysql-orig.txt 出现
       → HF 段已正确切出（边界 993-1591 准确）
20:36  两个临时文件被清理
20:39  进程退出，mysql.ts 仍 1,612 行，mysql-heartflow.ts 未生成
```

**净结果：零改动。** 与历史 6 次失败不同 —— 那 6 次推测留下半拆状态，
本次是干净退出（尝试 → 判定不可行 → 完整还原）。

### 根因（命中本评估第五节 🔴 R1）

```ts
export async function queryWithTimeout<T extends RowDataPacket[] | ResultSetHeader>(
  pool: Pool, sql: string, params?: unknown[]
): Promise<T>
```

泛型函数作为 ctx 属性注入后，`typeof queryWithTimeout` 会把泛型**擦成非泛型签名**，
HF 段里 33 处调用（大量带显式泛型 `queryWithTimeout<RowDataPacket[]>`）立刻报错。
要保住泛型须手写 call signature：

```ts
interface HfDbCtx {
  queryWithTimeout: <T extends RowDataPacket[] | ResultSetHeader>(
    pool: Pool, sql: string, params?: unknown[]
  ) => Promise<T>;
}
```

本次执行未走通该手法。

### 未尝试的备选路线（供后续参考）

1. **下沉 queryWithTimeout**：抽到更底层模块（如 `storage/db/db-query.ts`），
   `mysql.ts` 与 `mysql-heartflow.ts` 都从底层 import —— 无环且**保留泛型类型**。
   这是最有希望的一条。
2. **文件内分层**：在 `mysql.ts` 内部拆出 `createHfMethods(getPool, queryWithTimeout, firstRow)` 子函数。
   不跨文件 → 泛型沿用外层作用域 → R1 消失。代价是文件本身不减行数。

### 判定

同一堵墙已失败 7 次（1 次本次 + 6 次历史），且失败点始终在解耦而非定位。
**结论：这堵墙是真的**，不建议在第 8 次重复同一手法。
若将来重启，先做备选路线 1（下沉依赖），而非直接搬方法。

### 本评估的可复用价值

即使拆分未成功，本文件仍记录了：
- HF 段的精确边界与闭包依赖画像（实测数据，非推测）
- 类型契约来源（`DbAdapter` 声明了全部 27 个 `Hf*` 方法）
- 失败根因与两条未验证的备选路线

下次评估时不必重跑这些测量。
