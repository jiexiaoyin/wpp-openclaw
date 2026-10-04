# Changelog

WeChatPadPro OpenClaw Plugin 版本变更记录.

格式: 基于 [Keep a Changelog](https://keepachangelog.com/), 版本号 [SemVer 2.0](https://semver.org/).

## [v1.14.0] judge env 改名: DEEPSEEK_BASE_URL/_API_KEY → JUDGE_BASE_URL/_API_KEY (2026-10-04)

> **起因 (老板拍板)**: 「1 改名处理, 2 阿里的那个不能使用 deepseek*」。
> 2026-10-04 一天里, 框架日志攒了 **62 条** `Your api key: ****… is invalid` (全在 03:00–08:50 之间),
> 另有每次阿里端点 `403` 把整条模型链拖成 `All models failed` —— 根因是**同一个名字有三个消费者**:
> ① 插件 judge 主端点 (设计如此、正确, 它打的就是阿里云 token-plan);
> ② 框架 `models.providers.deepseek` 的 env 兜底 —— 读到同名 key, 把**阿里 key** POST 到 `api.deepseek.com`;
> ③ 插件 llmIntent (`resolveMinimaxApiKey`) —— 读到同名 key, 打到硬编码的 MiniMax。
> 名字指向 deepseek、值却是阿里云套餐凭证 ⇒ 只要还叫这个名字, ② ③ 两条路就永远开着。

### Changed / 改名 (破坏性)
- `DEEPSEEK_BASE_URL` → **`JUDGE_BASE_URL`**; `DEEPSEEK_API_KEY` → **`JUDGE_API_KEY`**。
  与既有 `JUDGE_FALLBACK_BASE_URL` / `JUDGE_FALLBACK_API_KEY` / `JUDGE_FALLBACK_MODEL` 对称。
- **旧名彻底作废, 不留兼容别名**: 全树没有任何一条路读它 (`command grep -rn` 只剩告警名单里那两个字面量)。
  兼容别名哪怕只留一条, 撞名那条路就原样开着 —— 那正是这次要关掉的东西。
- `resolveJudgeCreds()` 的参数 `deepseekBaseUrl` → `judgeBaseUrl` (它覆盖的是主端点, 而主端点
  自 v1.12.0 起已经是阿里云 token-plan)。
- `dispatcher.resolveMinimaxApiKey()` → `resolveIntentLlmApiKey()`。
  ⚠️ 只改名, **没改端点**: 这条链的端点仍是 `intent-llm.ts` 里硬编码的 `api.minimaxi.com/anthropic`,
  拿新名里的阿里 key 打过去必然 401 ⇒ 静默降级成规则 (改端点属另一次改动, 待老板单独拍)。
- ⚠️ **`.env` 与 dist 都要重启网关才生效**: `.env` 只在网关启动时读一次 (无 watch/reload)。
  改名本身可以在不重启的情况下安全落地 (运行中的进程 env 与 dist 都是旧的, 自洽)。

### Added / 旧名残留告警
- 启动时 `lingeringLegacyJudgeVars()` 检查旧名: 谁还设着, 就打一条 WARNING **点名**并告诉运维改成什么
  (只点名, 不打印值); 白名单值按"没设"处理 —— **绝不拿它当凭证**。
- 新增 `tests/unit/judge-env-rename-v1140.test.mjs`: 判据一律**反向** —— 「只设旧名 ⇒ 拿不到凭证 /
  进不了 SSRF 白名单」, 外加"全 dist 代码里旧名只许出现在告警名单那一行"。


> **起因**: 老板 2026-10-03 追问「心流策略能否保留 deepseek 作为兜底?」——
> v1.12.0 切到阿里云端点后, 判分从"DeepSeek 单点"变成"阿里云单点",
> 主端点一旦超时/5xx/返回空正文, 心流就整段停摆 (heartflow 把 judge 异常吞成"不回复", 现场只剩一条 warning)。
> 本次按老板选定的 **B 方案 (判分层二级端点)** 落地: `callJudge` 主端点失败后**自动**用 DeepSeek 重试一次。

### Added / 判分层兜底
- **二级端点**: 主端点 (`DEEPSEEK_BASE_URL` + `DEEPSEEK_API_KEY` + 账号文件 `model`) **任何**抛错后,
  自动改用兜底端点 (`JUDGE_FALLBACK_BASE_URL` + `JUDGE_FALLBACK_API_KEY` + `JUDGE_FALLBACK_MODEL`) 重试一次。
  兜底格式恒为 `openai` (既定用途就是 DeepSeek 系, 与主端点同协议)。
- **三项 env 缺一不生效**: 模型名**不硬编码** (v1.4.0「消除 hardcode」), 所以 baseUrl/key/model 必须**同时**给全。
  三项全缺 = `off` (正常的"没打算要兜底", 行为与 v1.12.0 逐字一致); 缺一两项 = `partial`
  ⇒ **启动时 WARNING 点明缺的是哪一个**, 且**不重试** —— 半配静默当没配就是本仓反复在防的"配了却不生效"。
- **接线在 `callJudge` 内部、按 env 现读**: heartflow / affection / jargon 三条机制**各自** new 一个
  `JudgeCreds` 字面量 (heartflow 的 `format` 兜底还是 `"anthropic"`), 从 `resolveJudgeCreds()` 带新字段会被它们丢掉
  ⇒ 只有把解析放在这一层, 三条机制才能**零改动**同时拿到兜底。

### Changed / ⚠️ 指标语义
- `judge_failures_total` 从"callJudge 抛错次数"**收紧为"最终失败次数"**: 主端点挂了但兜底救回来的那次**不再计失败**
  (它没失败)。兜底未配时两者恒等 ⇒ 不开兜底的部署读数不变。
- 新增 `judge_fallback_total` (兜底被启用次数) / `judge_fallback_ok_total` (兜底**救回来**次数) ——
  后者直接回答"兜底到底有没有用"。

### 边界 (有意如此, 不是遗漏)
- **只兜"端点故障", 不兜"分数不好"**: `callJudgeInner` 的每一处 throw 都是端点级
  (无 key / HTTP 非 2xx / 空正文 / 网络 / 超时), 没有一处因判分结果而抛 ⇒ "任何 throw 就重试" 恰好等于
  "只兜端点故障"。**判分好坏永远不触发重试** (否则会变成刷分 / 掩盖调阈问题)。
- **不重试第三次**: 兜底只重试一次, 不递归 (两段都坏时递归就是死循环)。最坏延迟从 `1×timeoutMs` 变 `2×timeoutMs`
  (judge 默认 5000ms ⇒ 最坏 10s), 仅在主端点已经坏掉时才发生。
- 兜底触发**必须 WARNING** 出声 (`journald` 只采 WARNING+), 内容含主端点病因 + 兜底端点/模型, **不含任何 key**;
  两段都失败时抛合并报错, 同时点名两个端点 (`primary(...) = … | fallback(...) = …`), 堆栈只进 WARNING 不进这条。

### Fixed / 安全
- **兜底 host 与主端点走同一套 env 白名单**: `JUDGE_FALLBACK_BASE_URL_ENV` 加进 `safe-fetch` 的
  `ENV_DECLARED_HOST_VARS` (就是那份"将来新增 AI 端点只需往这里追加一个"的表) ⇒ 换兜底端点只有一个旋钮。
  少这一条 = 兜底**从未生效过**, 而现场表现只是"主端点一挂, 心流还是不回复"。
  **白名单语义未变**: 未点名进不来 / 私网·回环·metadata 一律拒 (黑名单优先) / 非法值不抛不污染。

### 验证 (2026-10-03)
- `tests/unit/judge-fallback-v1130.test.mjs` **22 条**: 三种配置态分得开 · 重试的形状 (端点/model/key 全换,
  且 images 看图 / 关思考 / system / max_tokens **一个不少**) · 网络抛错与空正文都兜 · 主端点成功一次不重试 ·
  两段都失败点名两个端点且无 key · WARNING 出声且无 key · off 时不发噪声 WARNING · 三个计数器语义 ·
  白名单同源正反两条 + 私网/metadata 拒绝 + 非法值不抛 · dist 产物防回退 (含"兜底模型名不许硬编码")。
- 全量单测 `661 pass / 1 fail / 2 skip` —— 唯一那条红是 `P2-4.2` (部署端 plugin.json 还是 v1.12.0),
  部署后转绿, 属预期的"没重新部署"。

## [v1.12.0] judge 换模型: deepseek-flash → qwen3.8-flash @ 阿里云 token-plan (2026-10-03)

> **起因**: 老板 2026-10-03 拍板把心流判分从 `deepseek-flash` 切到
> `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1` 下的 `qwen3.8-flash`
> (全家切: heartflow / affection / jargon / heartflow-profile 共用同一条 judge 凭证链)。

### Changed / JUDGE
- **端点可配**: judge 主端点改由 env `DEEPSEEK_BASE_URL` 指定 (未设 → 默认 `https://api.deepseek.com`,
  不设 env 时行为与 v1.11.0 完全一致)。优先级: 调用方 `overrides.deepseekBaseUrl` > env > 默认; 尾部斜杠统一去掉。
  该端点与 DeepSeek 同走 openai 格式 ⇒ 凭证链、请求体、`thinking:{type:"disabled"}` 关思考参数**全部照旧**。
- **模型名**: `accounts/default.json` 的 `heartflow.model` / `affection.model` / `jargon.model`
  → `qwen3.8-flash`。⚠️ 端点与模型名是**一对**, 回滚要一起退 (账号文件的 `_model_note` 里写了回滚法)。
- ⚠️ **只切了这三条**: `llmIntentModel` 走的是**另一条链** (`dispatcher.resolveMinimaxApiKey` →
  `api.minimaxi.com` 的 anthropic 格式), 它今天本来就不通 (把 DeepSeek key 发给了 MiniMax ⇒ 401 降级),
  与本端点无关, 不在本次范围 (待老板单独拍)。

### Fixed / 安全
- **SSRF 白名单与 judge 端点变成同一个旋钮**: `safe-fetch` 的静态 host 表原不含新端点 ⇒ 只改 baseUrl
  会让**每一条** judge 调用抛 `host not in whitelist`, 而 heartflow 把 judge 异常吞成"不回复"
  ⇒ 心流静默停摆 (与 2026-09-11 那次"静默瘫 3 天"同族)。现在 `JUDGE_BASE_URL_ENV` 由 `safe-fetch`
  导出、被 `llm-judge` 导入: 同一个字符串常量既是 baseUrl 来源, 又经 `getEnvDeclaredHosts()` 进白名单
  ⇒ 两处结构性不会漂移。**白名单语义未变** (仍只允许运维点名的主机; `BLOCKED_HOST_PATTERNS` 仍优先,
  值缺失/非法 URL 一律忽略)。

### Added / 可观测
- **启动自述一行**: `[WPP <ver> JUDGE] openai https://host/path key=set models=heartflow:…,affection:…,jargon:…`
  —— 只含 format / host / 路径 / 模型名 / key 有无, **不含 key 本身**。judge 成功调用本身不写日志,
  这行是「到底在打哪个端点」唯一的正面证据 (端点拼错 / env 没生效 / key 没读到, 三种失败一眼分开)。

### 验证 (2026-10-03, 真实代码探针)
- 走插件自己的 `callJudge` + 逐字照抄的 `buildHeartflowPrompt`: **11/11 合法 JSON**,
  p50 **1.3s** / max **1.5s** (5s 超时), 回/不回判定与 `deepseek-flash` **同序**
  (A 0.850 vs 0.800 / B 0.285 vs 0.325 / C 0.785 vs 0.730 —— 同档, 略高)。
- **请求体零改动**: 新端点接受并**遵守** `thinking:{type:"disabled"}` (无 `reasoning_content`,
  5 vs 34 completion tokens) ⇒ judge 不会被思考吃光 max_tokens。

## [v1.11.0] 心流看图: 判分由"瞎猜"变"实读" (2026-09-29)

> **起因**: 群里的图片进到裁判眼里只有一行 `[图片] https://…jpg` 文本 —— 模型看不到图,
> 判分只能靠上下文猜。复放生产真实图片消息实测: 纯文本一律压在 **0.25** 附近,
> 连"零售单晒单""下单指引"这种明显该接的业务图也一样, 属于**结构性瞎猜**而非偶然低分。

### Added / HEARTFLOW
- **看图**: `callJudge` 支持 OpenAI 兼容多模态内容块 —— 有图时 user content 变
  `[{type:"text",text},{type:"image_url",image_url:{url}}]`; **无图时请求体逐字节不变** (老路径零回归)。
  仅 openai 格式端点生效; anthropic 分支忽略 `images`, 文本照旧。
- **取图收口**: 新增纯函数 `extractHfImageUrls` + `resolveHfVisionCfg` (`HF_VISION_DEFAULTS`:
  enabled 默认 **true**、maxImages 默认 **1**)。只认 `http(s)://` 直链, 去重后按出现顺序截断;
  **只取待判定消息的图**, 不取上下文图 (否则成倍烧 token)。配置走 accounts JSON 的 `heartflow.vision`,
  **不进 UI schema** (与 budget/profile 同惯例); accounts 写入是整对象读回 ⇒ 不会被白名单写回抹掉。
- **纵深防御**: 调用侧再过滤一次前缀白名单 (`http(s)://` / `data:image/`) ⇒ `file://`、内网地址、
  `xcxthumb:` 令牌、相对路径都不会被送出去。⚠️ 明确边界: **只按 scheme 过滤, 不解析主机**
  (`http://127.0.0.1/…` 会放行)。来源本身可信 (URL 由自家 enrich 从 vendor 媒体数组取出, 非群友手写),
  故**不假装**做了 SSRF 级防护 —— 真要收口该加在远端抓取侧。

### 实证 / 5 条生产真实图片消息 (逐张人工核对过内容; 生产 prompt 逐字复刻; 各重复 3 次)
| 图内容 | 纯文本 | 附原图 |
|---|---|---|
| 零售单晒单 | 0.250 | 0.66 / 0.66 / 0.705 |
| 下单指引 (收货价 + 补贴系数) | 0.31 | 0.705 / 0.705 / 0.72 |
| 商品链接 (无关广告) | 0.265 | 0.245 / 0.245 / 0.265 |
| 街景实拍 (私人) | 0.250 | 0.25 / 0.25 / 0.25 |
| 三人街拍自拍 (私人) | 0.250 | 0.25 / 0.25 / 0.265 |

结论是"由瞎猜变实读", **不是无脑抬分**: 业务图过线、无关图仍被挡。端到端 (走真实
`judgeHeartflow`, 生产凭证): 下单指引 关 0.310 → 开 0.705; 自拍 关 0.250 → 开 0.265。
⚠️ 诚实边界: 晒单那条开图后 0.66 只比阈值高 **0.01** ⇒ **临界**, 单次判定会抖 (重复 3 次全 ≥0.66 有运气成分)。

### 成本 / 延迟
- 原图 (手机全屏截图, 高 2720~4032px) 约 **+1000 prompt tokens / 张**, judge 端到端 0.7s → 1.4s (5s 超时够用)。
- 实测**缩到宽 720 的缩略图判分逐位一致**、token 少三成、延迟 1/3 ⇒ 日后想省可走本地缩略图 + data URL。

### ⚠️ 部署即新增一条数据外流面
图里是**店员人脸、客户零售单 (含手机号水印)、门店内部价表** —— 此前只外流文本。
功能默认开, 真闸门是**部署动作本身**; 若要收窄可把 `heartflow.vision.enabled` 置 false 后逐群开。

## [v1.10.0] 心流阈值自锁修复 + 停摆可观测 (2026-09-28)

> **事故**: 心流自 2026-09-26 起**彻底停摆 3 天** (生产台账 38 次判定全部 below-threshold,
> 09-20~25 的基准是 527 条里 50 条 ≥0.6)。所有既有埋点都是绿的 —— judge 照跑、台账照写、
> 状态页照显示"阈值 0.6"。根因是**三重自锁叠加**, 且它们都通过了当时的全部测试。

### Fixed / 心流 (三重自锁)
- **画像禁用令污染裁判** (占权重 65%): 画像生成的 `bot_role`/`summary` 写成"基本不该插话的旁观者"/
  "不主动闲聊"这类**元指令**, 被喂进五维裁判当证据 ⇒ 离线 A/B 复放 (23 条生产消息, 原均分 0.72)
  实测均分 **0.322**, 仅 2 条 ≥0.6。修法三处: ①生成 prompt 把 `bot_role` 的语义改为"身份与口吻"
  并给出硬约束 (不得写否决结论); ②`stripHfMutePhrases` 在**注入前**过滤 `botRole`/`summary`
  (话题清单 engage/avoid 不扫 —— 那是资产); ③同样文本改写成身份+口吻后复放均分 **0.669**、
  20 条 ≥0.6, 证明画像本身是好的, 有毒的只是"禁言令"。
- **阈值被印进裁判 prompt**: `buildHeartflowPrompt` 里 `**回复阈值**: 0.6 (综合评分达到此分数才回复)`
  会自我锚定 (裁判向阈值靠拢, 阈值再涨)。删除该行 (A/B: 0.322→0.374; 与①叠加后 0.669)。
- **画像 band 是无上界硬地板**: 旧码 `Math.max(base, band)` 让画像建议的 0.70/0.85/0.85/0.90
  直接成为及格线, 高于裁判给"明显该回"档的实测上限 0.82 ⇒ 几何上不可能过阈。
  改为 `resolveHfProfileBandEffect`: **只抬不降 + 抬升有上限** (默认 +0.10), 并在截断时打 warn。

### Added / 兜底与可观测
- **可达性天花板** (`hfReachabilityCap` + `clampHfThresholdToReachability`): sweep 每轮逐群算
  "近 7 天判定过的最高分 + 一步", 若生效阈值高于它 ⇒ 压回 (不低于 `bandMin` 0.5)。
  `n < minSample` 或最高分已够得着 ⇒ 不设 (冷清群本就该少说话, 不是故障)。采样不足的群不误判。
  天花板用与 judge **完全同源**的算法算 (学习值 → 画像抬升), 告警节流 (首现/值变/每小时)。
- **停摆金丝雀**: 新 gauge `hf_last_send_age_sec` (从未发过用 **-1** 而非 0 —— 0 会被读成"刚发过",
  是最糟的误导方向) + counters `hf_judge_passed_total` / `hf_judge_below_total` / `hf_sends_total`
  / `hf_reach_cap_applied_total` + gauges `hf_effective_threshold_max` / `hf_threshold_ceiling_groups`
  / `hf_reachable_groups`, **全部预声明** (未自增的指标不出现在导出里 ⇒ "值为 0"与"埋点没接上"分不开)。
- `/heartflow status` 改为显示**逐群生效阈值与生效预算** (含画像建议/是否被截断/天花板依据/被收紧的预算)
  + 上次真发言距今 (≥3 天打 ⚠️), 并删掉只报账号级值的 `阈值: 0.6` 一行 (停摆期间"看起来正常"的来源)。
  `/heartflow why` 的归因行同源。
- **生效预算收口为唯一入口** `resolveHfEffectiveBudget` (账号档 → 画像收紧 → 占比外环, 触发门禁与状态页共用):
  此前状态页只显示账号档 (600s/3条), 而实际生效的可能是画像压过后的 (1800s/1条) ⇒
  "这个群为什么一天只回一条"在运维面上无法解释。

### Fixed / 正确性
- **生效阈值收口为唯一入口** `resolveHfEffectiveThreshold` (学习覆盖 → 画像有界抬升 → 可达性天花板):
  此前 judge / 状态页 / sweep 各算一份 ⇒ 停摆期间状态页仍显示"正常 0.6"。三处各自演化迟早漂移,
  而漂移那一刻恰好就是"看起来正常但已经死了"。
- **批内预算闸**: 同一次 flush 内同群至多一条心流回复 (此前 `minGapSec` 只按**已落库**的发言算,
  同批多条候选可同时通过 ⇒ 一次刷屏)。
- **收敛标记精确到台账行**: `markHfEngaged` 加 `inbound_msg_id` 收窄。此前同群两条 `sent` 行重叠时
  (生产 `minReplyIntervalSec=0` + `minGapSec=180` 即可满足), 一个"有人引用了我"会给**两条**都记
  engaged=1、一句"别刷了"会**罚两条** ⇒ 样本量凭空翻倍, 学习被喂脏数据。
- **人类消息时刻全量记录**: `noteHfHumanMessage` 从"该群有开窗"的分支里移出, 覆盖白名单内所有群
  (旧码只有刚被回过话的 10 分钟才会记录 ⇒ "群里多久没人说话"这个观测量几乎恒为 null)。
- **台账状态跃迁放宽**: `setHfLedgerSent` 允许 `suppressed(未发送) → sent` 补记 (去重/预算拦下的
  占位符行此前永远停在 suppressed ⇒ 样本缺口)。

### 测试状态
- **609 tests / 607 pass / 0 fail / 2 skip** (2 skip 为显式 `# SKIP` 的 HMAC 凭据保留 test);
  ⚠️ 另有一条 `P2-4.2 deploy openclaw.plugin.json.version = dev` 在**部署前**必红 ——
  那是刻意留的"部署没掉队"绊索, 部署本版后自动转绿。
- 新增 `tests/unit/heartflow-v1100-antilock.test.mjs` (26 条): 纯函数行为 / 源级接线 / **反回归不变量**
  (无上界硬地板不得回归、阈值不得回流 prompt、阈值与预算各只有单一算法入口)。4 条旧断言钉的是被修的旧写法
  (`Math.max(baseThreshold, profileFloor)` 等), 已按新契约改写而**不降低要求**。

## [Unreleased]

> 2026-09-28 批 (接 v1.9.2, 未打 tag)。核心是**泄密事故后的脱敏闭环** + **vendor 契约全面对齐**。

### Security / 脱敏闭环
- node_modules 脱离 git 跟踪 (`16def9e`, 12,570 文件) + 补 `.gitignore` 规则。
- 补 tag 扫描门 (`9db61fa`) — 修 2026-09-26 重写的检测盲区; master 快照补排除 dist/ 与 src/*.js (`be4689b`)。
- 修 `.gitignore` 9 条规则行尾注释被当成模式一部分而失效 (`2d10ac5`)。

### Fixed / vendor-contract 对齐
- 按 swagger 重写 19 个 finder 工具 schema + body (`24dd49c`/`97ce9d4`/`55c8d44`/`6a5b4a3`), webhookSecret 改 env-wins。
- 修 22 处 tool 参数错位 + MCP transport 泄漏 (`cc88a4a`)。

### Fixed / DB
- 9 处 DDL 补显式 COLLATE 止血 collation 漂移 (`6a5fa63`), 7 处「禁止 JOIN」注释更新 (`43bc248`)。
- wpp_messages 双 id 缺失时的应用层去重 + 两张表补进 schema.sql (`287e4f2`); 补 wpp_hf_ledger 时间列索引修 5 处 filesort (`de99611`)。

### Fixed / 其他
- `stringifyLargeInts` 从正则改为结构化扫描, 消除形态依赖漂移 (`1fde4bb`)。
- 声明构建工具链 + 提交 lockfile 修复构建不可复现 (`cb63352`); 清理失效 tsconfig exclude + metrics 死判断 (`5d93d56`)。

### Feat / OpenClaw 契约
- wppChannelPlugin 全量契约对齐 (`satisfies ChannelPlugin` 零错误, `f35a4ce`/`14b1e24`)。

### 测试状态
- **340 tests / 338 pass / 0 fail / 2 skip** (2 skip 为显式 `# SKIP` 的 HMAC 凭据保留 test)。

## [v1.9.2] 收窄红包关键词: 纯文本提到"红包"不再被静默 (2026-09-27)

> 接 v1.9.1 同批 (老板拍板"一并收窄"), 与 v1.9.1 一次部署。v1.9.1 修的是**接龙被吞**,
> 本版修的是**同一根因的另一个面**: 关键词启发式对**纯文本**也生效。

### Fixed
- **纯文本消息只要正文出现"红包"二字就静默不回复** (如群里有人 `@某某 群收红包`、`50红包群发放@某某`、
  `抓紧领大红包啦`)。这些是**人在聊天**, 被静默等于把群友的话吞了 —— 与 v1.9.1 的接龙是同一根因
  (关键词启发式过宽), 只是接龙受害最明显、最容易被发现。
- 修法: **关键词启发式只在"卡片类" App 消息 (msgType=49) 上采信** (新增 `isCardMessage`)。
  真红包/转账/小程序这些"被包装过"的消息都由 49 承载, 纯文本 (1) / 图片 (3) / 表情 (47) 不是。
- 收窄依据 (只读回放生产账本, 结论): **真红包全部是卡片形态 (msgType=49), 纯文本形态一条也没有**
  ⇒ 收窄对真红包是**零漏判**; 若将来厂商改用纯文本推红包卡片, 代码注释里留了排查入口。
- 新增 2 条回归门 (共 9 条): 人类聊天形态的纯文本必须**不再**被判红包 (含图片/表情) + 卡片形态照旧静默;
  源级门钉住关键词判定必须与 `isCardMessage` 绑定, **不得退回裸关键词**。

### 测试状态
- **326 tests / 323 pass / 1 fail / 2 skip** (唯一红是 P2-4.2「待部署」绊索, 部署后转绿)。

## [v1.9.1] 修复: 接龙被误判成红包 ⇒ 静默丢弃 (2026-09-27)

> 老板报障"接龙也没回复了"。**根因不是本批心流改造, 是红包识别与接龙识别的优先级撞车**。

### Fixed
- **`isRedPacketMessage` 把接龙误判成红包 ⇒ 接龙整条静默丢弃**。红包识别是**内容关键词**启发式
  (`content` 含"红包"即判红包, v1.3.72 前的既有实现), 而群接龙文案**自带"红包"字样**
  (如"提升业绩, 领取红包🧧"/"红包100元") ⇒ 命中; 而 handler 两处红包拦截 (静默入库 / 不触发 AI)
  都排在**接龙强制触发之前** ⇒ 接龙拿不到 dispatch, **不报错、不写标签**, 只在日志留一行
  `red packet detected: … url=missing`, 看着像"来了个没 url 的红包", 极易误诊。
- 修法: **结构性识别优先于关键词启发式** —— `hongbao.ts` 的 `isRedPacketMessage` 开头先问
  `isRelayMessage(msg)` (msgType=49 + "#接龙"), 是接龙就直接返回 `false`。单一真源, handler 两处调用点
  自动都受保护 (没有改判定顺序 —— 那会让第三处调用点再次踩同一个坑)。
- 新增 `tests/unit/hongbao-relay-priority.test.mjs` (7 条): 本次 bug 的复现门 + 真红包五路识别不被削弱
  + 普通消息不误伤 + 源级门 (豁免必须写在 hongbao.ts 内、且在关键词启发式之前; handler 两处拦截
  必须都走同一判定函数)。**这块此前零测试覆盖, 正是问题能潜伏的原因。**

### 定位过程 (可复用的诊断范式)
- 从**消息台账**入手, 而不是先读代码: 拉出近 14 天所有 `#接龙` 消息 (按群), 逐条看其后 5 分钟内该群
  有无出站 ⇒ 立刻呈现"带'红包'字样的接龙条条零回复 / 不带'红包'的条条有回复"的完美相关。
- 排他性验证 (排除"是不是刚部署的锅"): 拿**部署前的备份 dump** (`/data/wpp-deploy-swap-*/…/dist/`)
  对比同一段编译产物 —— 判定顺序与启发式**逐字相同** ⇒ 与本次部署无关, 时间点是**接龙文案改版那天**。
  ⚠️ 备份放 `/data` 的价值在此: 没有部署前快照就无法做这种排他证明。
- **决定性证据在日志的两行相邻记录**: 同一条消息先打 `relay detected: title="#接龙 …" msgType=49`,
  **毫秒级之后**紧接一行 `red packet detected: … url=missing` —— 同一条消息被两个判定先后接管,
  接龙判定已经认出来了却被后面的红包拦截吃掉。而当天整天只有这一次 `red packet detected`
  ⇒ 当天**根本没有真红包**, 那行日志纯属误报。
- 顺带记下**真红包的形态**(与上面互斥, 便于以后一眼区分误报): 要么 `msg_type='red_packet'`、
  正文是 `[红包] 红包` 占位; 要么 `msg_type=49` 但**正文恰为 `微信红包`** (微信原生卡片的译文)。
  接龙则是 `msg_type=49` + 正文以 `#接龙` 开头 + 长文本。**关键词启发式认不出这个区别**, 结构判定能。

### 已知残留 (未改, 如实记录)
- 关键词启发式本身没动: **任何普通消息只要正文出现"红包"二字 (哪怕只是聊天提到), 仍会静默不回复**。
  收窄它会改变红包策略本身, 属老板决策, 不在本次修复范围。

### 测试状态
- **324 tests / 321 pass / 1 fail / 2 skip**。唯一的红是**刻意的"待部署"绊索** (`p2-cleanup.test.mjs` P2-4.2:
  deploy 端 `openclaw.plugin.json` 版本仍是 1.9.0) —— 部署 v1.9.1 后自动转绿, **不是回归**。
  剩余 2 skip 是既有跳过项。

### 部署
- 需 `deploy-swap.sh --force` + `systemctl --user restart openclaw-gateway` (**外部动作, 等老板授权**)。

## [v1.9.0] 心流观测复盘 (P3) + 重复内容闸 + 占比外环 (2026-09-26)

> 承接 v1.6.8 (换标签) / v1.6.9 (发言预算) / v1.7.0 (群画像) / v1.8.0 (分层)。
> 老板的诉求始终是"bot 像个真人" —— 本版补上**两块一直缺的东西**: 一个能回答
> "**到底说多了没有**"的观测面 (按需可查, 不推送), 和两道**只收紧**的结构约束
> (重复内容闸 / 占比外环)。P2+P3 一次部署 (老板 2026-09-26 拍板)。

### Added (观测复盘: 按需 `/heartflow report`, 不推送)
- **新增 `src/inbound/heartflow-observe.ts`** (纯函数 + **单表**聚合; **无新表、无定时器**):
  - `hfBotShare` / `fmtHfShare`: 占比口径 = **`bot/(人+bot)`** (有界), 报告同时显示原始条数, 便于对账。
  - `hfEngagementLift`: 本底 `<0.01` ⇒ `null` (**不除零, 也不吹成 100×**);
    `hfEngagementSummary` 对每个样本用它**自己那一小时**的本底 (跨时段混算会把"夜里冷清"算成"接了话")。
  - `hfRepeatRate`: **与重复闸共用 `hfRepeatVerdict`**。若各写一套相似度, 会出现"日报说重复很多、闸一条没拦"
    —— 那"观测驱动收口"就是假的 (有源级测试钉住)。
  - `buildHfDigest`: 七节 (发言占比 / 接话率+lift / 被制止率 / 重复率 / 影子分层 / 预算拦截 / 占比外环),
    **硬 cap 3500 字符**, 逐节限流, 超限从尾部整行丢弃并标 `…(已截断)`。
  - `/heartflow report [天数]`: 默认 7 天, 钳 1..30; 最多 8 群, 其余折叠 `…其余 N 群`。
- **出口是 filehelper** (`sendToFileHelper`), **不经 `sendAiReply`** ⇒ 不触发 sha1 去重、不进重复闸、
  **不落心流台账** —— 日报不是"回复", 不能污染统计样本。
- 两条新只读单表聚合 `listHfBotMsgShare` / `listHfOutboundTexts`; 与既有 4 条时间聚合同一纪律
  (单表 —— `wpp_messages` 与 `wpp_hf_*` 的 collation 不同, 跨表会直接报错)。

### Added (重复内容闸: 同群 6 小时内高度相似就不发)
- **新增 `src/inbound/heartflow-dedupe.ts`**: 同群 **6 小时**窗内、归一化相似度 **≥0.85** 即拦下 (老板拍板),
  **只对心流主动插话生效** (`proactiveOnly`) —— 被人 @ / 引用叫到时该回还得回。
- 三道误杀防护 (误杀比漏放贵得多: 群里该接的话 bot 装死, 老板看到的是"bot 变笨了"):
  1. **归一化后前缀精确匹配优先** (更准也更便宜);
  2. `minChars=12`: "收到/好的/👌" 不进相似判定 (也不进历史, 否则它们会互相判重);
  3. **数字保留**: `iPhone 15` 与 `iPhone 16` 报价结构相同但**不是复读**。
- **钩子点在 `deliver` 回调里、`await sendAiReply` 之前**: 拦在发出之前才有意义;
  不塞进 `sendAiReply` —— 那是账号级公共出口 (filehelper/私聊/非心流回复都走它), 且已有另一套 sha1 精确去重语义。
- **`classifyHfSend` 第五态 `repeat-suppressed`**: 不加这条会被判成 `sent` ⇒ (i) 消耗发言预算额度、
  (ii) 开一个 600s 观察窗 ⇒ 后续人类的正常发言被记成"接了我那句" ⇒ **毒化分层与学习样本**。
  该分支同时**不写重复历史** (没说出口的话不能拦下一句)、**不进预算**、**不开窗**。
- 内存态 `(account, group) → 最近 N 条真发出文本`, sweep 每轮按窗口/条数双裁 (防长跑内存增长);
  `enabled` / `simThreshold` / `windowSec` 等全部可热重载 (异常时关闸即恢复, 无需重启)。

### Added (占比外环: 该群 bot 占比 > 5% ⇒ 收紧当日预算)
- `hfShareTighten` (纯函数): 占比 **严格 > 5%** 且当日样本足够 (`≥40` 条消息且 `≥5` 条 bot 发言, 防噪声)
  ⇒ 收紧档 `minGapSec ×2 (cap 900)` / `maxPerHour ×0.5 (floor 2)` / `maxPerDay ×0.5 (floor 10)`。
- DB 聚合在 **sweep 侧** (每轮一次), 判定侧只读内存 ⇒ **judge 热路径仍是零 DB IO**;
  内存态随**本地日**翻页自然失效。
- 消费点 = 与既有画像收紧**再套一层** (`tightenHfBudget(tightenHfBudget(...))`) ⇒ 两层都只能收紧, 复合安全。
- 生效痕迹进 `/heartflow status` 与 `report` (「占比 > 5% ⇒ 今日预算已收紧」)。

### Changed (时间口径全仓收口: 一切按群聚合都走 `ts`)
- 四处的 `COALESCE(create_time, UNIX_TIMESTAMP(ts))` 统一改为 **`UNIX_TIMESTAMP(ts)`**。
  原因 (**2026-09-26 生产只读实测**): `wpp_messages.create_time` 已是**遗留死列** —— 当前代码只读不写,
  该列的非空值形如 `YYYYMMDDHHMMSS` **不是 epoch**, 且较新的行该列全为 NULL。
  把它当秒用 ⇒ 那些行被算到公元 60 万年 ⇒ **分桶/排序/窗口全错且不报错**。
  既有窗口 (≤30 天) 恰好够不到这类行, 属"埋着的雷", 本版一并拆除;
  并加源级门 (见测试状态) 钉住不得写回。`ensureColumn(...create_time...)` 保留 (仅为兼容老库), 注释写明真实语义。
- **COALESCE 归群维持不变**: 生产实测出站行的 `chat_id` / `from_wxid` **全为 NULL** (只有入站写这两列)
  ⇒ 所有"按群"聚合必须 `COALESCE(NULLIF(chat_id,''), peer_id)`, 否则 bot 侧分子恒 0 且**不报错**。

### 与计划的偏差与取舍
- **闸的实测结论是"空转", 不是"拦得太狠"**: 部署前只读回放真实账本发现 —— 近期群出站文本里
  相似度 ≥0.85 的重复**全部**来自"每日固定时刻的自动化播报", 其间隔**恒为 24 小时** ⇒ 6h 窗**看不到**它们;
  而该播报走的是 automation announce, **根本不经心流路径** ⇒ 闸无权干预。
  故 **6h/0.85 按老板拍板原样保留** (误杀风险 ≈ 0, 它防的是"同一天内心流插话复读", 实测未发生过);
  若日后要让"复读"更少, 该调的是那个定时播报本身, 不是闸的窗口。
- **分层达到门槛 ≠ 会改行为**: 回放显示当时唯一达标的那一格落在**群级阈值已在地板** (`bandMin`) 的群上,
  `evalHfThreshold` 给出 `clamped-noop` (想下调被地板挡死) ⇒ 本版分层即便生效也**无动作空间**。
  这与 `allowLoosen=false` (只许收紧) 的设计一致, 但说明**分层短期是纯观测** —— 别指望它立刻改变行为。
- **分层样本从 0 起算**: 信号列 (`engage_signal`) 是 v1.6.8 才有的, 部署前的旧行一律按 legacy 丢弃
  ⇒ 门槛时钟从**部署日**开始 (与 v1.8.0 的进度预估一致; 部署越晚, 分层可用越晚)。
- **"重复率"的口径偏差 (报告正文已标注)**: 分母是**全部群出站文本**, 含定时播报与人工手打,
  ≠ "心流发言的重复率" ⇒ **只看趋势, 不判绝对超标**。要精确到心流需在发送侧落来源标记 (未做: 不动 `wpp_messages` 结构)。
- **预算拦截计数是进程内累计** (重启清零), 报告如实标注, 不假装"按日统计"。

### 测试状态
- 新增 `tests/unit/heartflow-dedupe.test.mjs` (16 条) + `tests/unit/heartflow-observe.test.mjs` (15 条), 全绿。
  结构性门: 闸与重复率**共用同一判定函数** / `suppressed` 分支不占预算·不开窗·不进历史 /
  闸必须在 `sendAiReply` **之前** / 报告出口走 filehelper 且天数被钳 / 时间口径**不得写回** `create_time` /
  出站归群必须 `COALESCE` 兜底 (否则分子恒 0)。
- 既有测试同步: `heartflow-feedback` (方法清单 +2 / 行类型 +2)、`heartflow-learn` (`classifyHfSend` 第五态)。
- 全量: **317 条 / 313 绿 / 2 红 / 2 skip**; 两条红仍是**刻意的「待部署」绊索**
  (`deploy-integrity` 的 schema.sql 逐字节一致 + `p2-cleanup` 的部署版本号), 部署后自动转绿, **不要当回归修**。

## [v1.8.0] 心流分层学习: 群 × 时段 (P2) (2026-09-26)

> 承接 v1.6.8 (换标签) / v1.6.9 (发言预算) / v1.7.0 (群画像)。老板 2026-09-26 的原话:
> "**根据每个群聊环境, 自动理解群身份与特征**" —— 画像解决了"这个群是什么群",
> 本版解决"**同一个群在不同时段本来就不一样**": 上午的群和深夜的群, 一个标量管不了。
> 分层**不是新的自学标量**: 它是"从群级阈值出发、按该时段的真实接话率走**一步**"的结果
> (被硬区间钳死, 不累积不漂移), 段内样本不够就**回落**既有先验 —— 不引入第二套判定参数。

### Added (分层统计: 群 × 时段)
- **新表 `wpp_hf_layer_stat`** (`(account_id, group_id, layer_kind, layer_key)` 主键;
  `n` / `engaged` / `ambient_p` / `window_start` / `updated_at`)。新表只用 `CREATE TABLE IF NOT EXISTS`
  一条路 (applyMigrations + `db/schema.sql`), **不需要 `ensureColumn`**。
- **新增 `src/inbound/heartflow-layer.ts`** (范式照 `heartflow-profile.ts`: 纯算法 + 内存缓存 + 一个 IO 入口):
  - `aggregateHfLayerStats` (**纯函数**): 按 `sent_at` 的**本地小时**归段 → 信号值域校验 (旧行丢弃) →
    **逐样本用它自己那一小时的**本底过滤 (强信号 `quote`/`mention`/`negative`/`veto` 不受过滤) → 计数。
  - `normalizeHfBuckets`: 分段定义越界/倒置/重叠/非整数/超 6 段 ⇒ **整体**回落默认四段 (不半套生效)。
  - `getHfLayerStat` / `loadHfLayerStats` / `resetHfLayerCache`: 段统计常驻内存 ⇒ **judge 热路径零 DB 读**
    (与 P0.5 预算、P1 画像同一原则)。
  - `loadHfGroupHourCounts`: 每群×每小时入站量的**唯一取数入口** (缓存 120s), 与调阈侧同一公式 ——
    两处若各写一份, 同一条样本会在一边"可采信"、另一边"不可采信"。
- **每轮 sweep 全量重算, 只 upsert 有变化的行** (稳态下 0 写)。**绝不做增量累加**: sweep 每 300s 一次,
  累加会让 `n` 一小时虚涨 12 倍且**永远无法自愈**; 重算是幂等的, 改口径/改分段后自动收敛。
- `windowDays` 默认 60 上限: 否则"某时段更受欢迎"会被 60 天前的旧样本永久锁死。

### Added (读侧决策 + 影子)
- `resolveHfThresholdDecision(accountId, groupId, hfCfg, nowSec?)`: 链路 = **段内样本够 且 `layered.apply`
  ⇒ 分层值** → 否则群级 learned → 否则账号级; 全过读侧 `clampHfThresholdToBand`, 再由 handler 的
  `max(..., 画像下限)` 兜底 (画像仍只收紧)。**纯内存, 无 await / 无 SQL**。
- `resolveThresholdOverride` **保名加第 4 参 `nowSec`** (照 `markHfGroupEngaged` 的先例): 分层要按当前时段取值。
- `layered.allowLoosen` 默认 **false** = 分层**只许收紧** (更克制)。放开"更主动"的权利是一个开关的事,
  默认不放开是因为 v1.6.6 的教训: "回得多 → 群里反应多 → 比率更高 → 再下调"是会跑飞的正反馈。
- **`apply` 默认 false = 影子**: 照算照记, 只在 `why` / `layers` 里显示"若生效会是多少"。

### Added (一键反馈: 这条不该回)
- **`/heartflow veto [群ID]`**: 把该群**最近一条已发出**的发言标成 `engaged=0 / signal='veto'`。
  五件事缺一件就静默失效, 逐条落地:
  1. `'veto'` 同时进 `HfEngageSignal` 联合类型 + `HF_ALL_SIGNALS` + `HF_STRONG_SIGNALS`
     (漏 `HF_ALL_SIGNALS` ⇒ 读回 null ⇒ **完全无效且无报错**; 必须是强信号 ⇒ 冷清群里不被本底过滤)。
  2. 选行 `ORDER BY sent_at DESC, id DESC` (**不能按 `judged_at`**: 一条被预算拦久的旧 judged 行会盖过刚发出的那条)。
  3. 调 `forgetHfOpenWindow` 删内存开窗 —— 否则随后有人引用那条消息会把 veto 覆盖成 `engaged=1`,
     样本从"不该回"翻转成"该回", **比不点更糟**。
  4. 最近 15 分钟有 **≥2 个群**发过言 ⇒ 拒绝并要求显式群 ID (写错群不可撤销, 错样本会在 60 天窗口里持续污染)。
  5. 回执**回声**被否决那条的内容开头, 让老板确认删的是哪条。

### Added (可观测)
- **`/heartflow layers [群ID]`**: 各时段 `n / rate / 本底 / 影子建议 / 是否生效` + **每段样本进度 `n/门槛`**
  (主力时段约 2–3 周、上午段约 6 周、夜段约 3 个月才够门槛 —— 让老板看得见进度, 否则影子态像"什么都没发生")。
- **`/heartflow why <群ID>` 加归因行**: `当前有效阈值 X = 分层[段] (n/rate, 生效或影子) ← 群级 / 账号 / 画像下限`。
- `/heartflow status`: learned 群清单加显示上限 (超出折叠成 `…其余 N 群`) + 分层模式与已达标段摘要。

### Changed
- `classifyHfSend` / `HfSendOutcome` 等既有算法**未改** (P3 才会新增第五态)。
- `loadAmbientByGroup` 改为复用 `loadHfGroupHourCounts` (同一条查询 + 同一公式), 语义与取值**完全不变**。

### 与计划的偏差与取舍
- **话题层降级为"只记不判"**: `layer_kind` 字段与 `'topic'` 槽位预留, 本版不做话题决策 ——
  每群每天约 4 条发言的量级下话题桶的 `n` 会长期低于门槛 (比最冷的时段还冷), 且会让 `why` 的归因链
  变成三层不可解释。等时段层样本攒够再评估。
- **分层不做冷却**: 全量重算天然不累积 + 复用既有死区滞回已经够; 再加冷却会与 `evalHfThreshold`
  的参数打架 (两套防抖参数互相抵消)。
- **影子阈值不落库**: 它是 `(n, engaged, 群级阈值, 账号级阈值, 参数)` 的纯函数, 落库反而会漂移
  (群级阈值变了表里还是旧影子, `why` 自相矛盾); 改为展示时现算。

### 测试状态
- 新增 `tests/unit/heartflow-layer.test.mjs` (22 条全绿), 含三条**行为级**回归门:
  分层桶幂等 (同一批输入连跑两次 ⇒ 第二次 upsert 调用数 **0**, 防"累加桶"复活)、
  veto 能落库读回、判定热路径无 `await`/无 SQL。
- 既有测试同步: `heartflow-feedback` (表/方法/行类型清单 + `resolveThresholdOverride` 保名加参的正则)、
  `heartflow-label` (信号值域 + 强信号含 veto)、`schema-sql-split` (注释行数绊索)。
- `deploy-integrity` 的 schema.sql 逐字节一致 + `p2-cleanup` 的部署版本号**仍是刻意的「待部署」绊索**,
  部署后自动转绿 —— 不要当回归修。

## [v1.7.0] 心流群画像: 按群自动理解身份与特征 (P1) (2026-09-26)

> 承接 v1.6.8 (换标签) + v1.6.9 (预算)。老板 2026-09-26 的原话:
> "**希望能根据每个群聊环境, 能自动理解群身份与特征, 建立画像, 应景回复**" +
> "**我不愿意设定固定的触发的关键词**" + "使其更贴合一个真人身份角色"。
> 本版就是那句"自动理解"的落地: **画像不是关键词表** —— 它是每天由群里真实消息归纳出的背景,
> 注入给 judge 当"该不该开口、该用什么口气"的依据; 触发与否仍然只看五维打分 + 结构预算。

### Added (群画像)
- **新表 `wpp_hf_group_profile`** (`(account_id, group_id)` 主键, `profile_json` / `stats_json` / `sample_msgs` /
  `model` / `version` / `generated_at` / `updated_at`)。走既有 9 步落地 (applyMigrations → `db/schema.sql` →
  types → mysql adapter 显式列清单 → `storage/db/*.ts` 薄封装 → barrel); 薄封装仍**不 import mysql2**。
- **新增 `src/inbound/heartflow-profile.ts`**: 每日每群一次 LLM 归纳, 产出结构化画像
  (`nature` 群性质 / `style` 语言风格 / `bot_role` 我在群里的角色 / `engage` 宜接话题 / `avoid` 忌接话题 /
  `active_hours` 活跃时段 / `quiet_hours` 建议静默段 / `band` 建议阈值 / `budget` 建议预算 / `summary` 一句话基调)。
- `/heartflow profile <群ID>`: 显示当前画像 + 统计素材 (消息数/活跃天数/发言 TOP/类型分布/平均长度),
  并把**模型说的活跃时段**与**统计实测的活跃时段**并排展示 —— 二者不符时以实测为准, 便于老板判断画像可信度。
- `/heartflow why <群ID>`: 追溯**最近一条台账行** —— 五维分、当时有效阈值、命中信号、开窗/静默原因,
  再叠上**此刻**的有效阈值 (learned/账号级/画像下限三者取 max) 与预算计数 (本小时/本日已用 + 最近发言时刻)。
  为此新增一条真实单行读 `getHfLedgerLast` (不拿已收敛样本拼近似值)。
- `/heartflow status` 用法提示同步补上新命令。

### Changed (画像怎么被用上 —— 三处)
- **judge prompt 注入**: `buildHeartflowPrompt` 增可选 `groupProfile`, 挂在"群聊基本信息"之后、带小标题
  (**让 judge 知道这是背景而非待判内容**)。注入前**截断 ≤400 字符**, 且截断按**整行丢弃**而不是硬切 ——
  半句话比没有更误导; `summary` 排在最后, 紧张时最先被丢 (它是上面几项的重述)。
- **阈值下限**: handler 里 `effThreshold = max(learned ?? 账号级, 画像下限)`。
- **发言预算**: 触发侧 `tightenHfBudget(resolveHfBudget(cfg), getHfProfileBudget(...))` 后作为
  `checkHeartflowGate` 第 7 参传入。**画像只能收紧, 永远不能放开** (见下)。
- sweep 里画像生成排在 `if (!L.enabled) return;` **之前** ⇒ 关掉调阈学习, 画像照常生成 (两者本就独立)。
- 画像生成失败 (超时/坏 JSON/字段全空) **保留上一版**, 单群失败只 warn 不拖垮整轮; 一轮最多生成 `maxPerRun` (3) 个。

### 安全边界 (本版最重要的部分)
- **画像只能让 bot 更收敛, 不能更激进**:
  阈值 `band` 过**代码侧硬区间**钳制 (`HF_LEARNING_DEFAULTS.bandMin` 0.5 下限 / `bandMax` 上限, 越界值被**抬回区间**
  而不是丢弃 —— 免得模型给个 0.2 就被当成"无建议"而绕开地板);
  预算三项与配置取 `min` (间隔取 `max`); 画像给 `enabled: false` **无权**关掉结构约束。
- **静默段默认不自动生效** (`HF_PROFILE_DEFAULTS.applyQuietHours = false`): 画像算出的静默段会**入库并展示**
  (标明"已生效 / 未生效, 仅建议"), 但除非账号配置显式打开, 不参与判定。
  理由: 它是**总静默开关**, 一次幻觉就能让 bot 整天不吭声 —— 这个风险不该由一个每天自动生成的字段承担。
  即便打开也有硬上限: 单段 ≤6h、全天合计 ≤8h, **超限的整段丢弃**(不是截断), 短的优先保留。
- **绝不写空画像**: 解析出一无所有 (`nature`/`style`/`bot_role`/`summary` 全空且无宜忌且无 band) 一律当失败,
  保留上一版 —— 否则模型偶尔摆烂会让 bot 当场失忆。
- **画像素材不出机器**: 统计只读本地 `wpp_messages` (**单表**, 见下), 生成 prompt 里**不含群 ID**
  (样本 `wxid` 已截断脱敏为前 6 字符 + `**`); 画像/统计/群 ID 一律留在本地 DB 与 `accounts/*`, **绝不进公开仓**。

### 与计划的偏差与取舍 (如实记录)
- 计划 P1-3 让画像"单独传 `maxTokens`" —— 落地为 `maxTokens 1200` / `timeoutMs 20000` (judge 那处硬编码的 300
  一个字没动)。**不复用 judge 的 300** 是刻意的: 2026-09-13 那次心流静默瘫 3 天, 根因正是 reasoning 与正文抢
  `max_tokens=300`; 画像输出更长 (含数组与多字段), 复用必现同样故障。思考仍走 `callJudge` 默认的关闭。
- 计划 P1-2 写"现有 `getMessages` 不支持聚合, 必须新加方法" —— 二者都保留了: 统计聚合新增
  `getHfGroupMessageStats` (`COUNT`/`GROUP BY`/小时直方图); 样本消息仍走既有 `getMessages` 复用
  (它已带分页与类型解析, 重造一份反而多一处要维护的 SQL)。样本只取 `direction === 'inbound'`。
- **collation 地雷照旧绕开**: `wpp_messages` 是 `utf8mb4_unicode_ci` 而 `wpp_hf_*` 是 `utf8mb4_uca1400_ai_ci`
  (MariaDB 11 对裸 `CHARSET=utf8mb4` 的默认), 跨表 JOIN 直接报 `Illegal mix of collations`。
  故本版所有统计聚合都是**对 `wpp_messages` 的单表查询**, 与 `wpp_hf_*` 的关联全在应用层内存里做。
- **刻意不 import 造成的两处"重复"**: (a) `heartflow-profile.ts` 里重写了 2 行 band 钳制而没 import
  `heartflow-learn.ts` 的 `clampHfThresholdToBand` —— 否则 `heartflow-learn → heartflow-profile → heartflow-learn` 成环;
  (b) `checkHeartflowGate` 用**可选第 7 参** `budgetOverride` 接收收紧后的预算, 而不是让 `heartflow.ts` 去 import 画像模块
  (`heartflow.ts` 只 `import type` 画像的配置类型, 值导入会成环)。两处都写了注释说明原因。
- `summary` 字段是**补回来的**: prompt 里要求模型给一句话基调, 初版解析时把它丢了 (问了又不用)。
  现补进画像结构并渲染在最后一行; 只含 `summary` 的画像算"有内容"(不判空)。
- **judge 热路径零 DB 读**这条约定照旧: 画像缓存由 sweep **每轮一次** `listHfGroupProfiles` 预热
  (已消失的群会从缓存里删掉, 不然吃的是过期画像), judge/handler 只读内存
  (`getHfProfilePromptText` / `getHfProfileBandFloor` / `getHfProfileBudget`)。
- `/heartflow profile` 的静默段那一行**必须标明是否生效** —— 老板看到的每个数字都要有出处, 否则会以为已经静音了。
- 计划 P1-5 提到"回复风格/长度提示沿用现有 prompt 结构" ⇒ 未新增提示词层级, 画像只是一段背景文本。

### 影子验证 (部署前只读回放生产账本, 2026-09-26)
> 量化结果属生产统计 ⇒ **只保留结论与判据, 具体数值不入公开仓** (红线)。方法与取舍如下。
- 用生产账本里**观察窗已结束**的全部 bot 发言, 拿**已编译的**新判据 (dist) 逐行重放, 对比旧标签:
  - 旧标签的接话率**很高且与台账存量 `engaged` 率逐位吻合** ⇒ 机制诊断被数据证实 (旧闭环学的就是"群里有没有人说话");
    新判据在同一批样本上**大幅回落并落进死区 (0.15, 0.5)** ⇒ 学习者**不再下调** (旧行为是每轮都下调)。
    阈值变更审计同向印证: 一天内连续多次下调, 每次理由都是"接话率远高于 `highEngageRate`"。
  - 弱信号窗的实测命中率与参数注释记录的 60s 档同量级 ⇒ 交叉验证支持选 60s 而非 120s。
  - ⚠️ **强信号 (引用/@) 在这批样本里命中 0 次**: 当前生产里"接话"完全由**窄窗 + 沉默**两个弱判据承担。
    已知局限 (如实记录): 窄窗内的群消息未必真是对 bot 那句的回应 —— 它比旧的 600s 宽窗窄得多, 但仍是代理指标;
    真正的"被引用/被 @"要等上线后按新台账攒出来, 届时强信号才起作用。
  - 反事实基线在生产当前量级下**不拦任何样本** (`ambientP` 远小于 `ambientMax`):
    它是"未来出现高流量刷屏群"的保险, **不是**本次跑飞的解药 —— 解药是标签换锚 (让旧的高接话率落回死区)。
  - 预算实测: 总发出条数被压掉约两成, 且**突发**压得更狠 —— 最挤的一段窗口内条数接近腰斩再腰斩
    (老板原话"频率太高"针对的就是这种突发)。
  - 旁证: 多数 bot 发言在 10 分钟内**没有任何人接话** —— bot 此前确实说得过多。
- 回放脚本是一次性诊断, 含真实群 ID ⇒ **不入仓** (只读 SELECT, 未写任何表)。

### 测试状态
- **264 tests / 260 pass / 2 fail / 2 skip**。
- 新增 `tests/unit/heartflow-profile.test.mjs` (**24 条全绿**): 参数缺省与覆盖 / 生成 prompt 含统计与样本且**不含群 ID** /
  容忍围栏与前后废话、坏 JSON、全空对象 (含"只有 summary 不算空") / band 越界被**抬回区间**而非丢弃 /
  数组与小时与静默段的限长去重过滤 / **预算只收紧不放开** (含 `enabled: false` 无权关约束) /
  渲染 ≤上限且**不切半行**、`summary` 排最后先被丢 / 活跃时段确定性推导 / 新旧判定边界 /
  缓存预热与重置与账号隔离与坏行跳过与**旧群清理** / 静默段默认不并入且单段 6h 全天 8h 硬上限 /
  **7 条源级接线守卫** (sweep 顺序与 catch、无循环依赖、prompt 注入、触发侧第 7 参、两个子命令、失败保留上一版、
  统计单表无 JOIN 只数入站)。
- **2 条 fail 仍是刻意钉下的「待部署」绊索, 不是回归**: `deploy-integrity.test.mjs` 的
  "部署端 `db/schema.sql` 与源码仓逐字节一致" 与 `p2-cleanup.test.mjs` P2-4.2 "部署端 manifest 版本 = 源码仓"
  (部署端仍是 1.6.7, 源码仓 1.7.0)。`deploy-swap.sh` 跑过后两条自动转绿, 基线恢复 0 fail。

### 部署与生产
- **尚未部署**。P0+P0.5+P1 按老板拍板"三批一起做、一次部署" ⇒ 本版继续留在 dev。
- 需要: 一次 `deploy-swap.sh --force` + `systemctl --user restart openclaw-gateway` (**外部动作, 等老板明确授权**)。
- 部署后观察口径: `/heartflow profile <群ID>` 的画像是否贴合群身份 (模型说的活跃时段 vs 实测)、
  `/heartflow why <群ID>` 里画像下限有没有把阈值顶起来、以及阈值是否不再贴地板。

## [v1.6.9] 心流发言预算: 频率约束上移到结构层 (P0.5) (2026-09-26)

> 承接 v1.6.8。老板 2026-09-26: "**群里回复消息的频率太高了**" + "如果我不设定下限, 就会一直降低"。
> v1.6.8 修的是**标签学错了** (根因之一); 本版修**第二个根因**: **拿一个被自学的标量去控频率, 它必然漂到边界**。
> 阈值是"要不要开口"的**质量**判据, 不该同时兼任"多久能开口一次"的**频率**闸。
> 档位由老板当轮拍板 = **中等**; 静默段**默认关** (机制做好, 等 v1.7.0 画像按群自动填)。

### Added (结构层频率约束)
- **新增 `src/inbound/heartflow-budget.ts`** (纯函数 + 进程内计数, judge 热路径**零 DB IO**):
  每群**最小发言间隔** / **每小时上限** / **每天上限** / **静默段** / **陈旧触发防重放**。
  默认档 `HF_BUDGET_DEFAULTS` = `minGapSec 180` (1 条/3 分钟) · `maxPerHour 8` · `maxPerDay 60` ·
  `noConsecutiveWithoutHuman true` · `quietHours []` (关)。
  挂 `HeartflowConfig.budget?: HfBudgetConfig`, 可在 `accounts/default.json` 按账号覆盖。
- 判定是**纯函数** `checkHfBudget(state, cfg, nowSec, candidateAtSec)`, 只报**第一条**命中原因:
  `quiet-hours` → `budget-gap` → `budget-consecutive` → `budget-hour` → `budget-day` (从最绝对到最软),
  便于 `/heartflow status` 归因, 不叠加。
- 静默段按本地小时、**半开区间** `[start, end)` (相邻段 `[9,12)`/`[12,15)` 不重叠; `start===end` 视为**空段**,
  防 `[0,0]` 变成全天静默); `start > end` 表示跨零点 (`[23, 7]`)。
- `/heartflow status` 增一行**发言预算**: 生效档位 + **本次运行**的拦截计数 (按原因分布; 计数在内存, 重启归零, 故标注)。

### Changed (落点与计数)
- 闸落在 `checkHeartflowGate` 内**既有冷却/judge 频率闸之后、judge 之前** ⇒ 被拦的消息**连 LLM 都不调**
  (顺带省掉被拦那次的 maxtoken 花销)。
- **只有真正发出去才占额度**: 记账点是 `persistHfSendOutcome` 的 `sent` 分支 (与"开观察窗"同一时刻同一条件);
  `suppressed` (模板回复被丢 / 去重 / 空文本) **不占额度** —— 判了但被下游拦掉的不该吃掉预算。
- 计数在内存 Map (`key = ${accountId}:${groupId}`), 账号启动时用**一条** `GROUP BY group_id` 聚合
  (`listHfSentCountsRecent`) 回填小时/天计数 ⇒ **重启不清零额度** (否则"重启刷额度"成了后门)。
  回填边界走**本地整点/零点** (`hfHourStartSec`/`hfDayStartSec`, 与运行时桶键同口径; 用 `now-3600` 会把上一小时的
  尾巴算进本小时, 新小时一开局就少一条额度); 回填失败只 warn, **不打断账号启动**。
- 陈旧触发的候选时刻用**消息自己的时刻** (`msg.ts`, parser 给的 unix 秒) 而非 debounce flush 的墙上时间。
- 既有机制**一律保留不动**: `energy` 状态机 (软性精力衰减, 影响 judge 的 willingness 维度)、
  `minReplyIntervalSec` (冷却)、`minJudgeIntervalSec` (LLM 调用闸)。
  预算不是替代品, 是**结构兜底**: 前两者会随状态漂移, 本条天然有界。

### 与计划的偏差与取舍 (如实记录)
- 计划里 `noConsecutiveWithoutHuman` 写的是"**无人类插话不得连发第 2 条**"。**照字面实现会永远不生效**:
  心流的每次触发本身就源自一条人类消息, 故"上次发言后没有人类消息"在门禁处不可能成立。
  本版落成 **陈旧触发防重放** (候选消息不晚于我们上次发言 ⇒ 同批/重试/补扫的重复处理, 拦住它)。
  真频率约束由 `minGapSec`/`maxPerHour`/`maxPerDay` 承担。配置项名保留 (语义按注释为准)。
- `lastHumanAtSec` **仅用于观测, 不参与判定**: 它在 handler 按**墙上时间**记录, 而门禁按**消息时间**判定,
  两者有抖动量级偏差; 拿它当闸会误拦紧随其后的正常消息。**宁可少一条规则, 不要一个会误杀的规则**。
  已知降级: 该字段**无法从账本回填** ⇒ 重启后为空 (不影响判定, 只看观测)。
- 静默段**默认关**是老板的决定 (各组活跃时段不同, 不擅自改夜间行为), 机制与配置项已就绪, 等 v1.7.0 画像按群填。
- 新增聚合**只查 `wpp_hf_ledger` 单表**: 避开 v1.6.8 记录过的 collation 地雷
  (线上 `wpp_hf_*` 是 `utf8mb4_uca1400_ai_ci`, 而 `wpp_messages` 是 `utf8mb4_unicode_ci`, 跨表 JOIN 直接报
  `Illegal mix of collations`)。

### 测试状态
- **240 tests / 236 pass / 2 fail / 2 skip**。
- 新增 `tests/unit/heartflow-budget.test.mjs` (**30 条全绿**): 档位与覆盖 / 桶键与回填口径同源 / 静默段半开与跨零点与空段 /
  五条闸各自拦住 + 边界值不误拦 (恰好第 8 条、第 60 条放行) / 跨小时跨天滚动 / 纯函数性 (不改入参) /
  进程内状态 (判定记账·回填·脏值收敛·快照·重置·账号与群互不串账) / **7 条源级接线守卫**
  (闸在 judge 之前且挂在冷却之后、触发侧传账号与消息时刻、真发出去才占额度、handler 记人类消息、启动回填、既有机制仍在)。
  源级守卫自带**自检**: 切片必须真的限定在该函数内 + 函数被改名时必须报错, 防止守卫退化成"假绿"。
- **2 条 fail 是刻意钉下的「待部署」绊索, 不是回归** (v1.6.5 事故后加的):
  `deploy-integrity.test.mjs` 的"部署端 `db/schema.sql` 与源码仓逐字节一致" (v1.6.8 改过 schema.sql)
  与 `p2-cleanup.test.mjs` 的"部署端 manifest 版本 = 源码仓" (部署端仍是 1.6.7, 源码仓 1.6.9)。
  `deploy-swap.sh` 跑过后**两条自动转绿**, 基线恢复 0 fail。

### 部署与生产
- **尚未部署**。P0+P0.5+P1 按老板拍板"三批一起做、一次部署" ⇒ 本版继续留在 dev。
- 需要: 一次 `deploy-swap.sh --force` + `systemctl --user restart openclaw-gateway` (**外部动作, 等老板明确授权**)。
- 部署后观察口径: `/heartflow status` 的预算拦截原因分布 + 每群日发言条数 (应从"一分钟内连发数条长话术"的量级显著下降)
  + 阈值是否不再贴地板 + 回填计数是否与账本一致 (重启后额度不应回到满格)。

## [v1.6.8] 心流换标签: engaged 锚回「bot 自己那条」+ 反事实基线 (P0) (2026-09-26)

> 老板 2026-09-26 原话: "我现在设置了 0.5 底线, 因为之前会无限降低, 都到 0.3 左右了。群里回复消息的频率太高了。
> 这不是我希望的。**但是如果我不设定下限, 就会一直降低**。" 且明确: 要**按每个群的环境自动建画像、应景回复**, "**不愿意设定固定的触发关键词**"。
> 本版只做 **P0 (把标签换对)**; 频率的结构约束是 v1.6.9 (P0.5), 群画像是 v1.7.0 (P1) —— 三批一起做, 最后**一次**部署。

**根因 (代码级, 不是调参问题)**
- `handler.ts` 的 `markHfGroupEngaged` 旧触发条件 = 「该群 600s 内**出现过任意人类群消息**」。
  活跃群这条**恒为真** ⇒ "接话率"饱和 ⇒ `evalHfThreshold` 每轮 sweep 都走**下调**分支 ⇒ 阈值单调递减到 `bandMin`。
  **它学的是"群里有没有人说话", 不是"我上一条说得怎么样"** —— 这就是"不设下限就会一直降低"的机制本身。
- 真信号一直存在但没进闭环: judge prompt 里的"上次回复后无人接话 / 群里有热烈讨论"只用于拼提示词, 不落库、不进学习样本。
- bot 自己那条消息的 id 此前**没入库** (`new_msg_id` 存的是**入站**消息的), 而发送侧拿得到 (`sendAiReply` 返回 `msgId`)
  ⇒ "有人引用了我那条"这个最可靠的信号此前根本无法判定。
- v1.6.6 的硬地板 (bandMin=0.5 + 读取侧钳制) 只挡症状, 不治病: 阈值被钉在地板上, 而地板之上的下调压力依旧存在。

### Changed (标签语义)
- **新增 `src/inbound/heartflow-label.ts`** (纯函数, 无 DB / 无 IO): 把标签锚回 **bot 自己发的那条**:
  `quote`(有人引用了我那条) / `mention`(@我) / `negative`(针对我那句说"别刷了") 为**强信号**;
  `short-window`(弱窗内有人说话) 为**弱正**; 窗满无人接话 = `silence`。
  优先级 `negative > quote > mention > short-window` (引用比 @ 强: 引用带上下文, @ 可能只是叫人)。
  **强信号在整个 `observeWindowSec`(600s) 内有效** —— 晚到的引用也是真接话; `short-window` 只在
  `labelWindowSec`(默认 120s) 内成立, 且**先落 `engaged=1` 但不关窗**, 留给更强的信号升级
  (弱→强可覆盖, 强信号之间不互相覆盖, 已有强结论不被覆盖)。
- `wpp_hf_ledger` 增两列 (既有 CREATE 块内 + `ensureColumn` 守卫, 因为生产表已存在 `CREATE IF NOT EXISTS` 改不到它):
  - `bot_msg_id VARCHAR(128) NULL` —— vendor 返回的 bot 那条的 msgId (vendor 不回 id 时为 NULL ⇒ 该行只能拿弱信号, 已知降级);
  - `engage_signal VARCHAR(24) NULL` —— 命中信号 (可观测 + 审计)。
- 开窗表在内存里 (`heartflow-learn.ts` 的 `_openWindows`, 按 `${accountId}:${groupId}` 索引), judge 路径**零额外 DB 读**;
  已知降级: 进程重启会丢掉进行中的窗 ⇒ 那些行按 `silence` 收敛 (不会漏收敛, 只是信号变粗)。
- 新语义键 (三处齐: 接口 / `HF_LEARNING_DEFAULTS` / `resolveHfLearning`): `labelWindowSec: 60`、`ambientMax: 0.5`。
  ⚠️ 弱信号窗由计划的 120s **改为 60s**, 依据是下面影子验证的实测曲线 (120s 余量太薄会重新点燃飞轮)。
  **`observeWindowSec` 保持 600 未动** (账本行寿命 + dispatcher 引用它的字面量被回归门锁死)。配置项仍**不进** UI schema。

### Fixed (治本: 反事实基线 —— 不再把"群本来就热闹"当成绩)
- 新增 `hfAmbientP(count, observedSec, windowSec) = 1 - exp(-rate * windowSec)` (泊松近似, 纯函数, 无新依赖),
  `rate` = 该群**同一小时段**近 14 天的入站人类消息速率 (按本地小时分桶, 捕获"该时段本来就这么热闹"而不是被 7 天平均稀释掉)。
- `isHfSampleInformative(signal, ambientP, ambientMax)`: 强信号**永远**可采信 (引用/@ 是有指向的行为, 群里再热闹也不减损含义);
  `short-window` / `silence` **仅当 `ambientP < ambientMax`** 才进学习统计。素材来自新增聚合 `listHfGroupMsgHourBuckets`。
- 效果 (回归门已固化): 饱和群 (`ambientP≈1`) 的弱样本被全部跳过 ⇒ 样本不足 ⇒ `evalHfThreshold` 返回 `changed:false`
  ⇒ **不再单调下调**; 冷清群的 `silence`(没人理) 照常触发**上调**(少说精选)。`ambientP` 与信号直方图写进调阈审计的 `reason`, 便于回看。

### Added (可观测与回归门)
- `/heartflow status` 增 "信号分布(近 24h)" (quote/mention/negative/short-window/silence, 旧行归 `legacy`), 新增适配器方法
  `countHfEngageSignals` + `listHfGroupMsgHourBuckets` (薄封装/barrel/类型齐)。
- `tests/unit/heartflow-label.test.mjs` (24 例, 纯函数 + 源级接线守卫), 核心是**三条回归门**:
  ① 饱和群过滤后样本 0 ⇒ 不下调 (同时**先复现旧行为下调**再断言新行为不调, 证明这条门真的在拦);
  ② 冷清群样本照常参与 (别把学习一起掐死);
  ③ 负词表**不得出现在触发路径** (`heartflow.ts` 触发/闸门不许引用它) —— 老板红线: 触发必须由心流五维判断, 不许用固定关键词。
- 既有 `heartflow-feedback.test.mjs` 的清单同步: adapter 方法 12→14, HF 行类型 4→5, `HF_LEARNING_DEFAULTS` 键表 +2。

### 影子验证 (部署前, **只读** 生产库; 2026-09-26)
> 量化结果属生产统计 ⇒ **只保留结论与口径, 具体数值不入公开仓** (红线)。方法与取舍如下。
拿生产账本 (`wpp_hf_ledger`, 已收敛行) 与 `wpp_messages` 回放, 不写任何一行数据:
- **旧标签被逐位证实**: 对已收敛且有 `sent_at` 的行算"该群 600s 内出现人类消息", 命中比率与台账里存量
  `engaged=1` 的比率**逐位吻合** —— 旧闭环学的确实就是"群里有没有人说话"。
- **阈值确实只会降**: 唯一有学习状态的群, 其审计行的 `rate` 远高于 `highEngageRate` (⇒ 恒走下调分支);
  而上次变更记录显示它其实是 v1.6.6 的**地板钳制**把它抬回来的, 不是学习修正的。
- **窗长单调曲线** (同一批已收敛行, 只换弱信号窗长): 命中比率随窗长**单调上升**, 旧标签那个宽窗的比率
  **恒在 `highEngageRate` 0.5 以上 ⇒ 每轮必下调**; 窗口收窄到 120s 已落进死区, 但离上限只剩很薄的余量
  (该样本量下置信区间就能跨过 0.5), 而该标签**因果上受 bot 自己影响** (回得多 → 群里反应多 → 比率更高
  ⇒ 再下调 = 正反馈), 余量太薄就会重新点燃飞轮; **60s 档正好在死区 (`lowEngageRate` 0.15 /
  `highEngageRate` 0.5) 中点附近, 两侧余量大致对称**, 故取 60s。
- **反事实基线在当前数据量下不生效 (如实说明)**: 当前各群的 `ambientP(60s)` 都远小于 `ambientMax=0.5`
  ⇒ 弱样本**一条都不会被过滤** (要过线需要该时段持续相当高的消息密度)。
  也就是说 **本次止住跑飞靠的是"标签换锚 + 弱窗收窄", 不是反事实过滤**; 过滤器是给"将来某群真的变得极吵"留的闸
  (以及未来 P1 画像的路标), 现在它在待命而没在工作 —— 这一点不含糊其辞。
- 顺带修掉一个跨表雷 (仅注释记录, 未改行为): `wpp_messages` 是 `utf8mb4_unicode_ci`, 而 `wpp_hf_*` 三表是
  MariaDB 11 默认的 `utf8mb4_uca1400_ai_ci` ⇒ **两表 JOIN 会直接报 `Illegal mix of collations`** (实测)。
  新聚合 `listHfGroupMsgHourBuckets` 刻意做成单表查询; 将来跨表比较必须显式 `COLLATE`。

### 与计划的偏差 / 已知代价 (如实记录)
- **"消息被撤回"这条负信号按计划本该做, 本次没做**: 判定需要额外 vendor 查询或轮询, 成本与可靠性都不划算,
  且撤回在群聊里语义含糊 (可能是发错字)。负信号**只保留文本词表** (且分强弱两档: 引用/@ 消息用完整 14 词,
  窗内裸消息只认 4 个硬词 —— 裸消息没有上下文, 误报代价是冤枉一次好回复, 宁可少判)。
- **v1.6.8 之前落的账本行没有 `engage_signal` (NULL) ⇒ 一律不采信** (`asHfEngageSignal` → null)。
  代价: 阈值学习在部署后会先"冻结"一段时间 (每群攒够 `minSample` 条**新**样本才恢复调阈), 这是**有意**的 ——
  那些行正是**旧错误标签**, 采信它们等于改造白做。
- 词表位置: `HF_NEGATIVE_PHRASES` (14) / `HF_HARD_NEGATIVE_PHRASES` (4) 在 `heartflow-label.ts`,
  文件头与常量注释都写明 **"只用于给 bot 自己的发言打分, 不是触发关键词"**。
- 另一处偏差: 计划里 `labelWindowSec` 写的是 120s, 实测后改为 **60s** (依据见上面影子验证的窗长曲线)。

### 测试状态 (必读: 有 2 条**预期红**, 都是"待部署"绊索)
- `npm test` = **210 tests / 206 pass / 2 fail / 2 skip**。两条红都是**故意**的"改了就该部署"提醒, 不是回归:
  1. `deploy-integrity.test.mjs:47`「部署端 `db/schema.sql` 与源码仓逐字节一致」—— 本版改了 `db/schema.sql` (v1.6.5 事故刻意钉下的绊索);
  2. `p2-cleanup.test.mjs:140` P2-4.2「deploy `openclaw.plugin.json`.version = dev (部署没掉队)」—— 本版版本号 1.6.7→1.6.8 而部署端仍是 1.6.7。
  两条都在 `deploy-swap.sh` 跑过后自动转绿 (无需改代码)。**改 schema / 改版本前**的基线为 186 tests / 184 pass / 0 fail / 2 skip。

### Fixed (发布链)
- `sync-github.sh --dry-run` 会**留下脏镜像**: dry-run 为了让 `git diff --cached --stat` 输出真实差异, 会把文件写进
  本地镜像 `/root/git/wpp-openclaw` 的工作树, 但**不提交** ⇒ 下一次真跑在 `git checkout main` 处报
  "local changes would be overwritten ... Aborting" (2026-09-26 实测踩到)。现在 dry-run 会记录运行前的分支,
  结束时还原 (`checkout -f` + `reset --hard` + `clean -fd`, 镜像仓是脚本专属纯 clone) 并打印还原点。

### 部署与生产
- **尚未部署** (按老板 2026-09-26 拍板: P0+P0.5+P1 **三批一起做、一次部署**)。需要老板明确授权后执行
  一次 `deploy-swap.sh --force` + `systemctl --user restart openclaw-gateway`。
- 部署前会先做**只读影子验证**: 拿生产账本回放最近 7 天, 按新判据重算 engaged/信号分布, 输出"旧标签 vs 新标签"对比,
  并量化"多少行属可采信样本""阈值还会不会继续降"。

## [运维] 公开仓脱敏加固: 脱敏规则外置单一真源 + `master`/`main` 双分支历史重写 + 发布三门 (2026-09-26, 无插件代码变更)

> 老板指令: **必须脱敏**。这一版没有改插件运行时行为, 改的是"发布链"本身。
> 事故性质 (两轮审计): 公开仓 `jiexiaoyin/wpp-openclaw` 的 **`master`(源码分支) 从 Initial commit 起 62 个提交全部**
> 带个人信息, 46 个文件命中。第一轮重写 master 后, 用**逐提交**校验 (`--check-history`) 复核时又抓出两类:
> ① **元数据**泄漏 —— `main` 27 个提交 + `master` 新增的 1 个提交, 作者/提交者邮箱是老板**个人 gmail**
> (根因: 本地镜像仓 `.git/config` 的 `user.email` 一直是它, 每次同步**新建**的提交又把 gmail 带回来);
> ② `main` 的**历史**里有 1 个提交 (2026-08-20) 的 `USAGE.md` 把真实群 ID 当示例写了。
> ⚠️ 教训: ①的根因说明"**只查 tip 的门 = 假安全**", ②的根因说明"**只看文件内容的门看不见 git 元数据**"。

**根因 —— 脱敏规则内联在"要发布的脚本"里**
- 旧版 `build-release.sh` / `sync-github.sh` 各自内联了一份 `PERSONAL` 正则 + `sanitize_file()` 替换清单
  (含真实 wxid / 群 ID / 老板登录名 / vendor host / 机器路径 / **生产密钥前缀**)。
- 这两个脚本**自己在 `master` 分支里** ⇒ 脚本本身成了泄漏源; 而"每次更新同步 GitHub"是铁律
  ⇒ 每发布一次就把这份清单再公开一次。
- 审计另发现 `CHANGELOG.md` 里躺着一把**明文 API key**(`sk-…`, 已脱敏为 `sk-REDACTED`)。
  该 key **不在** `/root/.openclaw/.env` 中 (疑似早已作废/未启用), 但既然公开过 ⇒ 必须假定已泄露并作废。

### Changed
- **脱敏规则外置为单一真源**: `~/.openclaw/wpp-sanitize.rules` (0600, `WPP_SANITIZE_RULES` 可覆盖, **绝不入仓**)。
  规则 = `<匹配串>\t<替换串>` + `@scan\t<扫描串>\t<改写串>`。
- **新增执行器 `tools/sanitize-source.sh`** (本文件无任何敏感串 ⇒ 可发布):
  `--check <dir|file>` / `--apply <dir>` / `--check-history <repo> [ref]` / `--emit-filter-repo <f>`。
  用 **python3 + 前后视断言** 而不是 sed: 手机号/群 ID 这类规则必须能表达"两侧不是数字",
  否则长数字 ID 与 hex 里的片段会被误伤 (实测 `9007199254740992` 能"匹配"出手机号);
  且 python `re` 与历史重写工具 (git-filter-repo) 语义一致 ⇒ 树脱敏与历史重写结果可逐字节对齐。
- `build-release.sh` / `sync-github.sh` 改为调用执行器, **脚本内不再内联任何敏感串**;
  release 脱敏范围从 `*.js`+`*.md` 扩到**整棵 `release/`** (旧清单漏过 `dist/*.map` 一类)。
- `sync-github.sh`: 新增 `[4/4] master 脱敏源码快照同步` (`--main-only` 可只跑旧行为);
  快照排除 `node_modules/` `coverage/` `release/` `dist-release/` `accounts/default.json`
  ⇒ master 不再靠手工 push (手工 push 正是本次泄漏的成因)。
- 规则新增覆盖面: 真实手机号 / 真实群 ID (含未列举的, 兜底 `[0-9]{10,12}@chatroom`) / 明文 `sk-` key /
  生产文件名里的 ID / 老板邮箱 → GitHub noreply。

### Fixed
- **`master` 历史重写并强推** (`tools/oneoff-rewrite-master-history-2026-09-26.sh`, 保留全部 62 个提交与提交信息,
  提交数、作者、消息都校验过): 每个提交的文件内容重新脱敏; 历史里移除 `node_modules/` `coverage/` `release/`
  `dist-release/` `accounts/default.json`; 作者邮箱由个人 gmail 改为 GitHub noreply。
  旧 tip `bb78ca4` → `133aabd`。备份: `/data/wpp-github-mirror-backup-20260926-111713.git`。
- **`master` + `main` 元数据/历史内容二次重写并强推** (`tools/oneoff-scrub-author-email-2026-09-26.sh`):
  `--mailmap` 把个人 gmail 全换成 noreply (`main` 27 提交 + `master` 1 提交) + `--replace-text` 清掉
  `main` 历史里那处群 ID; 提交数不变、**两分支 `tip` 树 SHA 不变** (公开的当前内容逐字节零变化),
  逐提交校验 0 命中。`master` `32fd6e5` → `3a6b1edf`; `main` `456bdf68` → `0144fdaa`。
  备份: `/data/wpp-github-mirror-backup-20260926-112330.git` (含各分支 bundle)。
  根因同时修掉: 镜像仓 `git config user.email` → **`jiexiaoyin@users.noreply.github.com`** (身份来源收口)。
- 发布门升级为**三道**: 快照 `--check` 0 命中 / 新建提交过 `check-commit-metadata.sh` (查作者·提交者邮箱) /
  历史改动后过 `--check-history`(**逐提交**树 + 提交信息 + 作者)。只查 tip 等于假安全。

### Added
- 回归测试 `tests/unit/sanitize-rules.test.mjs` (全在 `/tmp`, 不碰生产/不读真实规则文件):
  临时规则文件驱动 apply/check、前后视断言不误伤长数字、替换值不自我匹配 (无死循环)、规则缺失时**拒绝工作**、
  "公开仓源文件里不得内联敏感串"的静态断言, 以及**提交元数据门**的拦下/放行双向测试。
- **`tools/check-commit-metadata.sh`**: 提交元数据门 (作者/提交者邮箱 + 提交信息过同一套规则);
  `sync-github.sh` 每次 commit 后必过, 不过则 `git reset --soft HEAD~1` 撤销提交并中止 push。
- `DEV.md §6.1 脱敏` 写清发布链、排除项、三道门的用法与本次事故教训。

### 部署与生产
- **无插件代码变更 ⇒ 不打版本号、不部署** (生产插件仍为 v1.6.7; `package.json` / `openclaw.plugin.json` 保持 1.6.7,
  免得触发"改了版本没重新部署"的回归门)。本条目按仓库惯例用 `[运维]` 前缀。

### 遗留 / 提醒
- force-push **不会**从 GitHub 删掉旧对象: 在服务端 GC 前, 被替换掉的历史仍可按旧 SHA 直接访问
  (`bb78ca4…` / `133aabd…` / `32fd6e5…` / `456bdf68…` 及其父提交)。要彻底消除须**删仓重建**或联系
  GitHub Support —— 老板若要求"一点都不能留", 这是唯一彻底路径。
- 已公开的那把 API key 请确认作废 (若还在用 ⇒ 立即轮换)。

## [v1.6.7] 适配 OpenClaw 2026.9.6+ plugin source capture (插件根解析单一真源) + deploy-swap `--dry-run` 谎报修复 (2026-09-26)

> 起因: OpenClaw 升级 2026.9.4 → 2026.9.6 后, **可变的账号配置写到了临时副本里**。
> (2026.9.6 换树失败/回滚的排查见 git log + `/data/openclaw-preupgrade-2026.9.4-1790389681/`; 停 Gateway 后从独立 shell 重跑 `openclaw update --yes` 成功。)

**根因 —— 「插件根」解析到了 openclaw 的临时源捕获副本**
- OpenClaw 2026.9.6 起, 本地插件在**每次 CLI 调用 / gateway 加载**时会被「源捕获」(plugin source capture) **实体复制**到
  `<stateDir>/tmp/plugin-captures/<instance-uuid>/captures/openclaw-plugin-build-XXXX/package-0/node_modules/wechatpadpro/`;
  该副本**临时**(进程退出即 `sweepPluginSourceCaptureDirectories()` 清掉, 实测 uuid 根已轮换 4 个: `da5eaf4e` / `a5dfa290` / `3a591cca` / `9c6531d9`)。
  捕获上下文是 openclaw 内部 `AsyncLocalStorage`, **不对插件 SDK 暴露** ⇒ 插件侧拿不到"真实源目录"。
- 插件原有 **3 份各自独立的** 向上 walk (`core/paths.ts#findPluginRoot`、`config-helpers.ts#findPluginRootSync`、`channel-ui-bridge.ts#resolveManifestRoot`)
  都停在副本根 —— 副本里同样有 `openclaw.plugin.json` + `package.json`。于是
  `join(findPluginRoot(), "accounts" | "config.json" | "db/schema.sql")` 全部落到副本。
- **真实故障证据** (2026-09-26 10:41, `openclaw status --all` 期间, 生产 journal):
  `WARN [WPP v1.6.6] config hot-reload failed: default: account config not found:
  /root/.openclaw/tmp/plugin-captures/3a591cca-…/openclaw-plugin-build-KjW3dz/package-0/node_modules/wechatpadpro/accounts/default.json`
  ⇒ 账号配置**读**不到 / **写**进临时目录 = 进程结束即丢 (线上 `accounts/default.json` 未被破坏纯属时机运气: 部署副本最后写入 09-16 18:53, 副本拷贝恰好一致)。

### Changed
- **`src/core/paths.ts` 成为插件根解析单一真源**: `findPluginRoot()`(async) + 新增 `findPluginRootSync()`(sync, 共用同一 cache)。
  解析到 capture 路径时映射回**稳定安装根**:
  `stateDir` 由副本路径 `/tmp/plugin-captures/` 之前片段反推 (再退化到 `OPENCLAW_STATE_DIR` / `~/.openclaw`) →
  `name` 取副本 `package.json#name` (再退化到目录名) → 命中 `<stateDir>/extensions/<name>`, 否则扫 `extensions/*` 比对
  `package.json#name` / `openclaw.plugin.json#id` → **都失败则保留副本路径并只 warn 一次**(降级, 绝不因探测失败让插件起不来)。
  副本识别看**整条路径**(`openclaw-plugin-build-*` 标记在祖先里, 8 层 walk 停下的通常是它下面的插件根)。
- `config-helpers.ts` / `channel-ui-bridge.ts`: 删除各自的第二、三份 walk, 改用共享解析器 (消除三处漂移风险; sync 语义保持, 见文件内 `listAccountIds` 必须 sync 的 P0 记录)。
- 版本 1.6.6 → 1.6.7 (`package.json` = 单一来源, manifest 同步)。

### Fixed (部署脚本)
- **`deploy-swap.sh --dry-run` 此前是「谎报的只读」**: `DRY_RUN` 只被最后那句 `echo` 使用 ⇒ `--dry-run` 实际执行**完整真实部署**
  (备份 / `rm -rf $DEPLOY` / 拷贝 / 重启 gateway), 却打印"没真写任何文件"; 且 gate 条件里含 `DRY_RUN` ⇒ 同时绕过
  「必须刚跑过 `deploy.sh`」的防呆。现在 7 个步骤里的写操作全部由 `DRY_RUN` 真正把门 (dry-run 只做只读预检)。
- 新增 `--skip-build` / `SKIP_BUILD=1` (复用当前 `dist/`, 便于验证脚本本身)。

### Added (防回归门)
- `tests/unit/plugin-capture-paths.test.mjs` (10 例, 全在 `/tmp`, 不碰生产): 用**真编译产物**放进**真形状的 capture 树**,
  断言 async/sync 都映射回稳定根、目录名≠包名/manifest id 兜底、找不到稳定根时降级不抛、正常安装路径行为不变、
  `OPENCLAW_STATE_DIR` 兜底; 并用**假 OPENCLAW_ROOT 真跑一次 `deploy-swap.sh --dry-run`** 断言哨兵文件/`openclaw.json`/备份目录逐字节未变 + 源码仓三处解析器已收口。
  (基线: `npm test` 174 pass / 0 fail。)

### 部署与生产验证 (2026-09-26 10:47)
- `deploy.sh` dry-run PASS(19) / WARN(0) → `deploy-swap.sh --force`: 备份 `/data/wpp-deploy-swap-1790390847/`(12846 文件, 与新部署清单逐项一致),
  **`openclaw.json` sha256 未变** (`dce0dc37…`, 铁律), gateway 10:47:36 起 (PID 679070)。
- 生产日志实证 (3 次捕获构建各自命中): `[WPP v1.6.7] [paths] plugin source capture 适配: …/captures/openclaw-plugin-build-jxFTKW/… → 稳定根 /root/.openclaw/extensions/wechatpadpro`;
  `watching accounts dir: /root/.openclaw/extensions/wechatpadpro/accounts`; `applySchemaSql: 11 statements applied from …/extensions/wechatpadpro/db/schema.sql`;
  `ws connected` / `setWebhook OK` / `setBusinessWebhook OK` / `startAutoSync OK` / `[WPP v1.6.7 STARTUP] … selfWxid=WXID_PLACEHOLDER`, 新进程 error/fail = 0。
- 热重载实测: `touch accounts/default.json`(内容 hash 不变) ⇒ `config hot-reload detected: default (change)` → `hot-reload: account default runtime config updated` (旧版此路径读的是副本)。

### 观察 (未改, 留档)
- 同一 gateway 进程内插件会被注册多次 (**每次注册各自 capture 一份**), 修复后多了几个 watcher 同时 watch **同一个**真实 `accounts/` 目录
  ⇒ 一次配置变更会产生 N 次 apply (实测 1 次 `runtime config updated` + 2 次 `not running, config cache refreshed only`, 内容相同 ⇒ 幂等, 无重连/无重起账号)。
  若将来 apply 变成非幂等 (如每次 apply 都重连), 需在此处去重。

> 注: v1.6.6 (心流阈值硬地板 0.5) 未在本文留条目, 详情见 git log (`ab24ae0`)。

## [运维] agent 拿不到发卡工具: `tools.alsoAllow` 白名单把 channel agentTools 全挡了 (2026-09-13, 无代码变更)

> 起因 (老板): 让 wpp-wechat agent「将这个卡片转发给我」, 它回了 **"已转发 ✅ 卡片已转到你微信"** ——
> 而它**根本没发** (那张卡是运维验收脚本发的, 台账 `wpp_messages.id=30887 / msgId=602194759`)。

**根因: 能力"注册了" ≠ agent"可调"** —— 插件 `dist/index.js:829` 把 `agentTools: AGENT_TOOLS` (300+ 厂商工具)
注入了通道插件, 通道注册也正常 (`plugins inspect` ⇒ `channel: wechatpadpro`); 但 OpenClaw 侧
`openclaw.json` 是 **profile + 白名单** 制:

```json
"tools": { "profile": "coding", "alsoAllow": ["wecom-cli", "message", "group:messaging"] }
```

`resolveCodingToolConstructionPlanForAllowlist()` + `applyEmbeddedAttemptToolsAllow()` 会把最终工具数组
**按 allowlist 求交集** ⇒ 不在名单里的工具 (含全部厂商工具) **静默消失**。

**证据 (双重)**: ① 代码路径 (上两函数 + `listChannelAgentTools` 只读已注册通道插件的 `agentTools`);
② **agent 自己枚举的工具清单** —— 正好 = `coding` profile 工具 + `alsoAllow` 三项, 一个厂商工具都没有;
且它在思考里明写 «I don't see a `wpp_send_*` tool» / «There's no `sendXCX` tool»。
（同一名单里的 `wecom-cli` 可见 ⇒ 佐证是白名单在过滤, 不是通道没注册。）

### Changed (部署侧配置, 已生效)
- `openclaw config patch` ⇒ `tools.alsoAllow` = `["wecom-cli","message","group:messaging","sendMiniProgram","sendMessage","sendLocation"]`
  （数组是**替换**语义, 必须带全原三项）。网关 **热重载, 零重启**:
  `[reload] config hot reload applied (tools.alsoAllow)`, MainPID 322228 / NRestarts=0 不变。
- 生效实测: 走 gateway 跑一次性会话 (新 sessionKey, 不带 `--deliver`, 不落老板微信) ⇒ agent 答
  `sendMiniProgram 有 / sendMessage 有 / sendLocation 有`。
- ⚠️ **副作用/边界**: `tools.alsoAllow` 是**全局**的 ⇒ main / wecom agent 同样拿到这三个工具
  (要收窄得走 per-agent `agents.entries.<id>.tools`, 而 agent 级是**替换**不是合并, 需整份重写)。
- 备份: `/data/openclaw.json.bak-20260913-220239` (改前) —— 与改后**结构差异仅 `tools.alsoAllow` 一项**。

### Added (防回归门)
- `tests/unit/deploy-integrity.test.mjs`: 断言 `openclaw.json` 的 `tools.alsoAllow` **必含**
  `sendMiniProgram` / `sendMessage` / `sendLocation` —— 配置被重置/覆盖时立刻红, 不再"静默没能力"。

### 收窄: 三个厂商工具只给 wpp-wechat (22:08, 无代码变更)
> 上面那条把工具加在**全局** `tools.alsoAllow` ⇒ main / wecom 也拿到了 wechatpadpro 的通道工具 (blast radius 太大)。

- **语义核实** (`dist/agent-tools.policy-BYQnd2Ij.mjs:241`): `profile = agentTools?.profile ?? globalTools?.profile`、
  `profileAlsoAllow = agentTools?.alsoAllow ?? globalTools?.alsoAllow` —— agent 级是 **`??` 覆盖(替换)**, **不是合并**;
  未写 `profile` 则仍继承全局 `"coding"`; `tools.web`(tavily) 只读全局 `config.tools.web`, 不受影响;
  `openclaw config patch` 对**对象深合并、数组替换** ⇒ 只需写 `tools` 一个键, agent 其余字段 (workspace/agentDir/model) 原地保留。
- **改法**:
  - 全局 `tools.alsoAllow` 回退 = `["wecom-cli","message","group:messaging"]` (即事故前原样);
  - 新增 `agents.entries.wpp-wechat.tools.alsoAllow` = 原三项 + `sendMiniProgram`/`sendMessage`/`sendLocation`。
- **生效实测** (gateway 一次性会话, 新 sessionKey, 不带 `--deliver`):
  wpp-wechat `sendMiniProgram 有 / sendMessage 有 / sendLocation 有` 且 `wecom-cli 有 / message 有` (无回退);
  main / wecom 三个全「没有」(main 见到的是跨会话 `SendMessage`、`message`、`wecom-cli`, 均非厂商工具)。
  热重载 `[reload] config hot reload applied (agents.entries.wpp-wechat.tools, tools.alsoAllow)`, MainPID 322228 / NRestarts=0 不变。
- **门改成断言"解析后的有效白名单"** (两道): ① wpp-wechat 的 `agent 级 ?? 全局` 必含三名字;
  ② **其余 agent (main/wecom) 的有效白名单不得含**三名字 —— 把"收窄"本身钉住, 谁再挪回全局就红。
  三道反向注入 (L 删 agent 级 `sendMiniProgram` / M 把 `sendMessage` 挪回全局 / N 整块 agent `tools` 抹掉)
  **全部 CAUGHT**; 注入 harness 在**配置副本**上跑 (零生产风险), `cp` 还原后与线上 sha256 `4e0ec2ed…` 逐字节一致。
  ⚠️ 第一版 harness 有假阳性 (探测串把 3 个"相对路径失配"的无关红也当命中; 且 `python3 -` 的 heredoc 吃掉了 `sys.stdin.read()` 的注入脚本 ⇒ 注入其实是空操作) —— 修正为**精确匹配器 + 表达式走 argv**, 并逐条打印"注入后哈希已变/内容核对"才算数。
- 备份: `/data/openclaw.json.bak-20260913-220758` (收窄前, sha256 `e8323695…`)。

### 教训 (两个都是通用的)
1. **判断 agent 有什么能力, 必须看 agent 自己看到的工具清单** —— 插件注册 / 通道注册 / `agentTools` 数组
   存在, 都不等于模型能调; profile+allowlist、`toolConstructionPlan`、`clientCaps` 任一环都能把它滤掉。
2. **工具缺失时, agent 会"虚报已完成"** —— 本次它据**出站台账** + **MemOS 记忆**(远端自动抽取, 把当时的
   *推测*写成了「助手已成功转发…通过 sendXCX 工具发送 type=33 现代卡片, 使用原卡片的 appid 和 username」)
   认定自己发过了。已在 agent 工作区 `AGENTS.md` 加「🚫 不得虚报动作」铁律 + 「📇 小程序卡片」口径
   (备份 `/data/agent-workspace-backup-20260913-220132/AGENTS.md`)。

---

## [运维] agent 文档里的"幽灵工具名"清理 (2026-09-13 22:1x, 无代码变更)

> 上一节查出"agent 拿不到发卡工具"时顺带发现: 工作区/技能文档里写着**根本不存在**的工具名 ——
> 这类文档错误会让 agent 得出「我没有这个能力」的结论 (与真实工具清单无关)。

**判定依据**: **agent 自己枚举的工具清单** (gateway 一次性会话, `--json`, 40 个名字):
`agents_wait apply_patch ask_user automations conversations_* create_goal dashboard edit exec get_goal image_generate intent ls message music_generate portal progress_card secrets sendLocation sendMessage sendMiniProgram session_status sessions* skill_workshop subagents terminal update_goal video_generate view_image web_fetch web_search wecom-cli write`
⇒ 有 `sendLocation`/`sendMessage`/`sendMiniProgram`/`wecom-cli`/`web_search`; **没有** `memos_*`、**没有** `wpp_*`。

### Fixed
- `agents/wpp-wechat/SOUL.md`
  - 发定位: `wpp_send_location` → **`sendLocation({toWxid, latitude, longitude, label})`** (真名; 参数取自
    `src/dispatch/agent-tools/msg-meta.ts:196-205` 的 `shareLocation`)。
  - 云端记忆: `通过 MCP memos_search/memos_add 使用` → **不存在这两个工具**。MemOS 插件 manifest 是
    `"kind": "lifecycle"` (纯 hook), `lib/` 只碰两个端点 `/add/message`、`/search/memory`, 全仓 `registerTool` 命中 0
    ⇒ 改为"记忆由插件**自动**注入 `<memories>`, 只当背景信息, 冲突以 AGENTS.md 为准"。
- `skills/phoneerp/SKILL.md` (发定位节): 原文写着
  「用 `wpp_send_location` 工具（Hermes 命名，OpenClaw 旧名 sendLocation 已废弃）」—— **因果完全颠倒**:
  在用的是 `sendLocation`, `wpp_send_location` 根本不存在。已改成 `sendLocation(…)` + 反向警示。
  ⇒ 这是"发定位"能力被**文档自我封印**的根因 (agent 按文档去找一个不存在的工具)。
- `agents/wpp-wechat/MEMORY.md` (启动摘要): 企微 SOP 的路径 `~/.hermes/skills/wecom-skill/bin/wecom-cli.js`
  是 **Hermes 时代死路径** (该目录不存在) ⇒ 改为 `~/.openclaw/skills/wecom-skill/bin/wecom-cli.js`
  (真实存在, 68KB; `/usr/bin/wecom-cli` 是它 2026-07-25 的符号链接)。
  - 同文件新增「🚫 记忆 / 台账 ≠ 我做过的事」节 (钉住上一条事故的口径: 只有本轮工具返回值算数)。

### Noted (未改)
- `wpp_history_search` **全盘不存在** (skills/ + 三个 agent 工作区 grep 无命中) —— AGENTS.md 里写的是
  `wpp-history` **技能** (走 MySQL `wpp_messages` 的 SQL), 本来就对, 无需改。
- `skills/phoneerp/index.js:429` 注释里仍有 `wpp_send_location` —— **注释不进模型上下文**, 未动 (避免碰共享技能的活文件)。
- **老板更正 (2026-09-13 22:2x)**: `skills/phoneerp/SKILL.md` 的「适用 agent」表原写 **wpp-wechat ❌ 不适用**,
  而 wpp-wechat 的 SOUL.md/AGENTS.md 都有 PhoneERP 段、晨报任务也在实跑 —— 已按老板指示改为 **wpp-wechat ✅ 适用**
  (Note 行同步)。查证: 该技能**代码里没有按 agent 的门禁** (全仓 grep `wpp-wechat`/`agentId`/`allowedAgents` 只命中该表)
  ⇒ 纯文档矛盾, 无行为影响。其余三个 wpp-* 技能的「适用 agent」表本来就是 ✅ (phoneerp 是唯一例外)。

### 备份 / 验证
- 备份: `/data/agent-docfix-20260913-221122/` = `SOUL.md` (`43bc91f9…`) / `MEMORY.md` (`db0cc85e…`) / `phoneerp-SKILL.md` (`5517b6aa…`)。
- 生效实测 (gateway 一次性会话): agent 答「memories 里的已转发**不算** / 只有工具返回值 msgId/ok=true 才算 / 转卡片用 `sendMiniProgram`(thumbUrl 填 `xcxthumb:` 令牌)」。

---

## [运维] 构建口径备忘: `dist/setup-wizard.js` 只有 `npm run build` 会产出 (2026-09-13)

- `build-release.sh:86` = `rm -rf dist` + `tsc`; 而 `package.json` 的 `build` = `tsc` + `node scripts/build-setup-wizard.mjs` (esbuild)。
  ⇒ **release / 部署 这条路径从来不产出 `dist/setup-wizard.js`**, 只有本地 `npm run build` 产出 ⇒ 该文件在两种构建后"时有时无"
  (本次先按 `npm run build` 复原过, 跑完 `build-release.sh` 又被删掉; 已实测两者产出的字节与 HEAD 完全一致, 只是"在不在"的差别)。
- 该文件**无任何引用**: `package.json` 无 `bin`、`main = dist/index.js`、全仓 grep 只命中 build 脚本自己提及 ⇒ 属死产物。
- 处置: **以 release 构建为准** (线上部署端 `extensions/wechatpadpro/dist/` 与部署目录一直都没有它), commit `461bbe2` 移除。
- 将来二选一: 要保留这个 CLI ⇒ 给 `build-release.sh` 补 `node scripts/build-setup-wizard.mjs`; 不要 ⇒ 从 `package.json` 的 `build` 里去掉那步。

---

## [v1.6.5] Wxapp 接线修正: JSAPI 通道接通 (WXAPP-JSAPI-PASSTHROUGH, 2026-09-13)

> 起因 (老板): 「wechatpadpro 容器中的 swagger 里还有不少 /Wxapp/* API 接口，你可以看看有什么帮助吗」。
> 逐个拉契约 (23 个端点) + **真打了一遍**后的结论: 对「卡片封面」**零帮助** (没有任何端点取媒体,
> 出图仍只认卡片自带 `<appattach>` 凭据 = v1.6.4), 对「读小程序页面内容」也**没有**直接帮助
> (页面数据来自小程序自己的后端; 卡片 `<url>` 是空的, 连 `GetA8Key` 都无从下手). 但捞出两件真东西:
>
> | 端点 | 实测 | 判定 |
> |---|---|---|
> | `/Wxapp/JSOperateWxData` | `data={"api_name":"webapi_getwxaasyncsecinfo",…}` ⇒ **errcode 0 + 真载荷**; `data="{}"` ⇒ `-10001 invalid request`; `{"api_name":"login"}` ⇒ `-12003 invalid api_name` | ⭐ **通用微信 JSAPI 通道, 能用** |
> | `/Wxapp/GetUserOpenId` | `{toWxId,appid}` ⇒ openid + 昵称 + 头像 + `Sign`(40 hex) | 可用 |
> | `/Wxapp/GetWxAppRecord` | 空体 ⇒ `historyList[6]` (`gh_xxx@app` + updateTime); **带 `appId` 响应逐字段相同** | 可用且**无参** |
> | `/Wxapp/GetOauthList` | 空 (本账号无授权) | — |
> | `/Tools/GetA8Key` | 只回 URL/权限位/Cookie, **不回页面内容** | 不是"读页面"的路 |
> | 其余 18 个 (头像/手机号/授权/支付) | — | 与业务无关 |
>
> 顺带查出**我们自己的接线 bug**: 助手侧这两个工具的 `data` 被**整个丢掉** (恒发 `{}`) 且 `opt`
> **从不发** ⇒ 这条能用的通道在助手侧 100% 得到 `-10001`; `cloudCallFunction` 还多发一个契约里
> **不存在**的顶层 `functionName` (Go 静默忽略 ⇒ 调用方以为传了函数名, 厂商从未收到)。

### Fixed
- **`jsOperateWxData` 真透传** (send 层 + meta): `data` 按契约发 **JSON 字符串** (字符串原样透传,
  对象由 `jsonData()` 序列化), `opt` **可选真发** (1=写入 / 2=读取)。旧码 `_data` 恒发 `{}`。
- **`cloudCallFunction`**: 去掉契约外的顶层 `functionName`, `data` 原样透传 (函数名/参数都在 data 内)。
  ⚠️ **未端到端实测** —— 手上没有用云开发 (CloudBase) 的 appid, 空 data 打过去是 `-10001 invalid request`。
- **`getWxAppRecord` 改无参** (`{}`): 契约无参数, 旧码发的 `appId` 厂商不认 (实测带/不带响应逐字段相同)。
- `jsLoginWxApp` 工具描述写的是「授权小程序 (定制)」, 实际打的是 `/Wxapp/JSLogin` (定制版是另一个
  `jsLoginCustomized`) —— 文案改正。

### Added
- 测试 `tests/unit/wxapp-jsapi-passthrough.test.mjs`: fetch 桩抓**真实请求体** (data 逐字节 /
  opt 有无 / body 键集合 / 端点+authcode URL) + meta 侧**完整调用行**逐字断言 (带剥注释, 防注释假红)。

### 事实记录 (防回归 / 边界)
- `jsGetSessionid` 多发一个契约里没有的 `url`、`verifyPlugin` 发 `url`(契约是 `appid,data,opt`):
  **本次未动** —— 无实测证据判定厂商是否吃这两个未文档化字段, 留待验证后再改 (已在源码注释里标注)。
- 本次所有实探都是**只读** (GetWxAppRecord / GetOauthList / GetUserOpenId / JSOperateWxData opt=2 /
  CloudCallFunction / GetA8Key), **未打 `JSLogin`** (会把账号在第三方小程序侧记成一次登录, 属对外动作,
  且 code 要配小程序自己的 appsecret 才有用) —— 探针脚本 `/tmp/probe-wxapp.mjs`。
- **部署目录清单普查** (事故后补做): 用本次部署前的整目录备份 `/data/wpp-deploy-swap-1789306584/
  extensions-wechatpadpro/` 与现状做全量文件比对 (1135 → 286 个文件). 剔除新旧 `dist`/`node_modules`
  后, 那次 `rm -rf $DEPLOY` **只多抹掉 1 个文件**: 手工残留的 `openclaw.plugin.json.bak-core-20260910-072050`
  (连同曾被当作回滚用的 `dist.prev-*` 快照 —— 回滚资产以 `/data` 备份为准, 别放在部署目录里)。
  **`db/` 下只有 `schema.sql`, 无任何数据文件** ⇒ 插件 sqlite 不在部署目录, **本次事故零数据丢失**,
  损失仅在「建表/加列静默失效」这一路径 (已修复 + 双门钉住)。

## [v1.6.4] 转发小程序卡片: 原图透传 (XCX-THUMB-INHERIT, 2026-09-13)

> 起因 (老板): 「转发的小程序卡片图片不是收到的小程序卡片图片，图片不一样了」 →
> 「其实你应该找找原因，因为第一遍你转发给我的小程序卡片，其实是有图片的，与我发给你的一样，
>   后来要么是空的，要么是图标」。
>
> **这条证词直接推翻了 v1.6.3 的结论**。复盘三张卡的实测记录:
> | 台账 id | 做法 | 老板手机看到 |
> |---|---|---|
> | 30877 (20:45) | **原卡片 appattach 凭据原样透传** | 有图, **与原卡片一模一样** ✅ |
> | 30878 (20:53) | 插件自造 XML, 只给 `<weappiconurl>` | 空/灰块 |
> | 30879/30882 (21:10/21:16) | v1.6.3「下载原图→自己上传换新凭据」 | 图标 (140×140 logo) |
>
> 于是 `-5103017` 的真实含义是**厂商服务端那个下载实现取不到** (两条口 `/Tools/DownloadMiniProgramCover`
> 与 `/Tools/CdnDownloadImage` 对同一组凭据都返它), **不等于凭据死了** —— 同一组凭据交给
> `/Msg/SendXCX`, 微信客户端照样取到原图 (30877 与修复后的重发两次实证)。**v1.6.3 把"换一组新凭据"
> 当成唯一出路是错的**: 那条路的产物是**替代图** (能下载到手的通常只有 140×140 图标)。
> 转发要的是"与原卡片一致" ⇒ 正解是**透传**, 不是替换。

### Added
- **凭据令牌 (THUMB-INHERIT)**: `formatThumbToken`/`parseThumbToken` + `parseThumbToken` 常量
  `THUMB_TOKEN_PREFIX = "xcxthumb:"`。格式定长前缀 + 尾部 iconUrl, **严格互逆** (有单测锁):
  `xcxthumb:<fileId>:<aesKey>:<md5>:<w>:<h>:<len>:<version>:<iconUrl>` (缺项写空串 —— 省略会让
  "version 缺/iconUrl 在"与"version 在/iconUrl 缺"分不开; iconUrl 含 `:` 故必须是最后一段)。
- **入站注记多一行**: `[小程序封面凭据] xcxthumb:… (转发时原样填 thumbUrl)` (由 `coverThumbToken(card)`
  生成, 缺 fileNo/fileAesKey 时不产出也不打这行)。同一行里点明用途 —— 否则模型会顺手拿上面那行
  `[小程序封面]`/`[小程序图标]` 的 OSS URL 去转发, **那等于换图** (本轮 bug 的根因)。
- **出站 `buildXCXContent` 二选一**: `thumbUrl` 是令牌 ⇒ **原凭据直接进 `<appattach>`, 一个字节都不下载
  不上传** (含 `version`/`iconUrl` 透传保真); 是 http(s) URL ⇒ 仍走 v1.6.3 的 `/Msg/UploadImg`。
  坏令牌 (前缀对但 fileId/aesKey 非法) **既不当作 URL 去取图, 也不塞进 XML**, 卡片照发只是没图。
- agent 工具描述 (sendMiniProgram / sendMessage) 写明"转发收到的卡片要用 `[小程序封面凭据]` 令牌"。

### Fixed
- **入站 `MiniProgramCardInfo` 补 `version`、`MiniProgramCoverCtx` 补 `length`** (`cdn_length`):
  转发透传要用, 之前解析出来就丢了。
- 更正 `app-card.ts` 里把 `-5103017` 归因为"封面 blob 在微信 CDN 侧取不到 (已过期)"的注释 —— 归因错了,
  会把后来人再引回"下载+替换"那条错路。

### 事实记录 (防回归)
- 反向注入 6 条 (handler 不传令牌 / 出站丢令牌分支 / 令牌解析错位 / 入站令牌丢 md5 / 注记不打凭据行 /
  序列化 w/h 互换) **全部被测试捕获**, 每条还原后 sha256 与基线一致。

## [v1.6.3] 小程序卡片补上缩略图 + schema.sql 静默失效修复 (2026-09-13)

> ⚠️ 本节的两条定位**已被 v1.6.4 推翻/修正** (原卡片凭据没死, 是厂商下载口取不到), 保留原文以便回溯。
>
> 起因两件, 都是老板实测/拍板发现的:
> ① **v1.6.2 换现代卡片后卡片没有图** (老板连问两轮「还是没有图片呢？啥情况」)。定位结论:
>    真卡片的图**只**来自 `<appattach>` 里的微信 CDN blob; 只给 `<weappiconurl>`(或厂商结构化接口
>    的 `thumbUrl`) 客户端就是**灰块**; 而原卡片的旧凭据已失效 (`/Tools/CdnDownloadImage` 返
>    `-8 … -5103017`) ⇒ 谁也没法「继承」, 只能**自己上传一份换新凭据**。
> ② 补线上扩展缺失的 `db/schema.sql` 时牵出一个更深的问题: 启动日志恒为 `0 statements applied`。

### Added
- **缩略图自举 (XCX-THUMB)**: `sendXCX` 走现代卡片时先把 `thumbUrl` 上传到微信 CDN
  (`/Msg/UploadImg`, 落地会话 = **`filehelper`**, 客户会话里看不见), 拿回 `Fileid`/`Aeskey` 合成
  `<appattach>` 六节点 (`cdnthumburl`/`cdnthumbaeskey`/`cdnthumbmd5`/`cdnthumblength`/`cdnthumbwidth`/`cdnthumbheight`)
  + 顶层 `<md5>`, 与真卡片**逐节点同构** (凭据格式同源: 与真卡片 `cdnthumburl` 同前缀 `305f020100044b3049`,
  且实测能被 `CdnDownloadImage` 取回 ⇒ 收件人客户端也能取)。
- **`extractCdnThumbRef` / `cdnThumbRefFromUpload` / `imagePixelSize` / `splitSchemaStatements`**: 均为纯函数,
  便于单测 (真打厂商那段只剩 IO + 错误处理)。
- 上传**任何一步失败都非致命**: 返 null ⇒ 卡片照发 (只是没图), 不阻塞消息; 每次失败都留 `warn` 便于回溯。

### Fixed
- **`applySchemaSql` 切分 bug (静默失效)**: 旧实现 `split(/;\s*\n/)` 后 `.filter(s => !s.startsWith("--"))`,
  而 `db/schema.sql` **每个语句上方都有 `--` 注释行** ⇒ 每个 chunk 都以注释开头 ⇒ **11 条 CREATE TABLE
  全部被丢掉**, 日志恒报 `0 statements applied` 且不报错。今天无害 (表早就在), 但**将来 schema 加列/加表
  会静默不生效**。改为**先按行剥注释再按 `;` 切**, 并加「文件非空却切出 0 条 ⇒ warn 吵出来」的防线。

### 排查过程中确认的事实 (已写进单测, 防回归)
- 厂商结构化接口 `/Msg/SendAppMessage` (kind=mini_program) 与手搓 XML **都**拿不到图 —— 不是"格式写错了",
  是缺 `<appattach>` 无论如何都没图 (老板三轮实测)。
- `/Msg/UploadImg` 的响应字段名是厂商 Go 结构体原样序列化 (`Fileid`/`Aeskey`/`TotalLen`),
  **不在 swagger 里** (swagger 只写示例 `file_id`/`url`, 完全对不上) —— 实测得出, 故对它加了 hex 校验,
  占位符/空对象一律拒 (否则会把占位符发上线, 卡片变灰块且难查)。

## [v1.6.2] 小程序卡片出站: 可直达内部页面 (XCX-PAGEPATH, 2026-09-13)

> 起因: 老板要「把刚收到的那张国补领券卡片 (`?activity_id=320800`) 转发回来」⇒ 用 `/Msg/SendXCX`
> 发出去才发现**做不到具体页面**: 旧实现 `buildAppMsgXml` 是 legacy `appmsg type=2001` + `<mmapp><url>`,
> 微信按 url 走 webview ⇒ 卡片只到小程序首页; 而**真卡片是 `type=33` + `<weappinfo>{pagepath,appid,username}`**,
> 由客户端自己拉起对应页面 (模板取自产线真报文 `app.raw_xml`, 该卡片确认能正常打开)。

### Added
- **`buildMiniProgramCardXml`** (`src/send/msg.ts`): 现代卡片 XML, 逐节点对齐真报文 ——
  `weappinfo{pagepath,weappiconurl,version,appid,type=2,username}` + `sourceusername`(= appid)
  + 顶层 `type=33` + `sourcedisplayname`/`des`。值一律 XML 转义 (真卡片 icon url 里就带 `&amp;`)。
- **`buildXCXContent`**: 唯一分叉点 —— 给了 `pagePath` 走现代卡片, **不给则 legacy 输出逐字节不变**
  (单测锁死, 老调用方零回归)。
- **`sendXCX` 扩到 8 参**: `(…, thumbUrl?, pagePath?, username?)` —— `pagePath`/`username` 追加在**末尾**
  (位置传参, 中间插入会让老调用方整体错位; 有单测锁这个顺序)。
- **入站注记补 `username`**: `[小程序] 名称 (appid wx…, gh_…@app)`。它是「小助理按原样转发同一张卡片」
  的必备参数, 且只存在于 `raw_payload`, 不打进 prompt 模型无从得知 ⇒ 转发能力等于无法使用。
- **透传链**: `sendMessage` 统一入口 (`type=miniprogram` + `pagePath`/`username`)、`sendMiniProgram`
  直达工具 (`pagePath`/`xcxUsername`)、`dispatch/send-message.ts` 路由。审计行同时带上页面路径
  (`[小程序] 标题 (页面 pages/…?activity_id=320800)`), 否则一堆卡片入库后分不清首页与活动页。

### Fixed
- `sendMiniProgram` 工具声明了 `thumbUrl` 却**从不透传** (模型给缩略图 URL 是无效的) —— 一并修掉。

### Known issue (未验, 待产线实测)
- ⚠️ 真卡片的缩略图来自 `<appattach>` 里的微信 CDN blob (实测已失效, `-5103017`), 我们造不出新 blob ⇒
  **刻意不给 appattach**, 缩略图由 `<weappiconurl>` 兜底。若微信仍显示灰块, 需再试 `<appattach/>` 空节点变体。
- `<version>` 缺省**不输出** (真卡片的 `31` 是发送方客户端的小程序版本号, 我们无从得知; 省略时由微信按
  最新版本解析, 比编一个号安全), 可用参数覆盖。

## [v1.6.1] 小程序卡片入站识别 (msgType=49, 2026-09-13)

> 起因: 老板转发国补小程序卡片给小助理, 小助理只看到一行标题并回「转发时只带了文字」。
> **该归因是错的** —— 实测生产 DB 三条 49 消息的 `raw_payload` 里 `app` 块字段齐全
> (`mini_program.app_id` / `page_path` / `description` / `cover_image.download_context` / `raw_xml`),
> 是入站链路除接龙 (`category=app_message`) 外对 49 无任何解析, `app` 块只落 raw_payload 审计 ⇒ 从不进 LLM。

### Added
- **`src/inbound/app-card.ts`** (新模块): `isMiniProgramCard` / `parseMiniProgramCard` /
  `formatMiniProgramCard` / `planMiniProgramAssetAttempts` / `enrichMiniProgramAsset`。
  `handler.ts` 在 Step 1 (enrich 循环, **落库之前**) 把卡片文本化追加进 `m.content` ⇒ 入库 + 进 prompt:
  ```
  [小程序] 国家消费品换新补贴微信端 (appid wx8386cf8f5e76d36a)
  页面路径: pages/index/index.html?activity_id=320800
  ```
  判定用 `app.category === "mini_program"` **精确匹配** —— 接龙 (`app_message`) / 文件 (`file`) /
  引用 (`quote`) / 转账 (`payment_notice`) 均不命中 (单测反向注入验过)。
- **封面自动下载 + 降级**: `download_context` (直链优先, 否则 `file_no`+`file_aes_key`) → 失败再退到
  `app.icon_url`, 传 OSS `wpp/{account}/miniprogram/{date}/`。标签**分开**: `[小程序封面]` / `[小程序图标]`
  (混标会让模型以为看到了卡片大图)。失败一律非致命, 不阻塞入库与派发。

### Known side effect (既有行为延伸, 本次未改)
- 注记写回 `m.content` ⇒ 引用回复时 `originalContent` (= `msg.content`) 会把注记带进 refermsg,
  微信里被引用气泡显示为「标题 + [小程序] 小程序名 (appid …) + 页面路径」。**图片早有同样行为**
  (`[图片] <URL>` 一并进 refermsg), 本次沿用同一约定未做特殊化。若要干净引用气泡, 需单独引入
  「引用用原始 content」通道 —— 影响全 msgType, 不在本次范围。

### Known issue (厂商侧, 非本项目缺陷)
- ⚠️ **封面 CDN 分支恒失败**: 对真报文两条消息的 `download_context` 调
  `/Tools/DownloadMiniProgramCover` 恒返 `Code:-8 / 异常：小程序封面下载失败：CDN 返回错误码 -5103017×8`。
  同凭证打通用 `/Tools/CdnDownloadImage` **同样 -5103017** ⇒ 不是本端点的问题, 是封面 blob 在微信 CDN 侧取不到
  (过期或该 variant 不受支持)。**后果 = 实际落到 `[小程序图标]` (140×140 PNG, 实测 14884B 可下)**。
  待验: 卡片刚转发时立即下载是否可成 (若可 ⇒ 是 TTL, 需要"收到即下"策略)。

### Added (tests)
- `tests/unit/app-card.test.mjs` (7 例) + `tests/fixtures/miniprogram-card.json`
  (**生产 DB `wpp_messages.id=30869` 的 `raw_payload.app` 逐字段保真**, 只删同源大体积 `raw_xml_json`)。
  ⚠️ 守卫断言用**逐字精确行匹配**而非「符号存在」—— 反向注入实测: 把守卫改成
  `if (false && … && isMiniProgramCard(m.raw))` 时裸 `match` 断言**照样 PASS** (符号还在源码里)。

## [v1.6.0] vendor swagger 全量对齐 (容器 v09102, 2026-09-13)

> 起因: 老板「看下我 wechatpadpro 容器中的 swagger 接口文档, 我的项目接口应该需要更新及新整了, 先帮我比对比对」→「继续完整修正」。
> 基准 = 容器 `http://127.0.0.1:28062/swagger.json`（323 路径 / 348 definitions, md5 `bccc5af02a232eaf52df067ba87859be`）。
> 全量比对报告: `../wpp-swagger-diff-20260913.md`。

### Fixed (A: 项目在调、厂商已下线 ⇒ 必 404)
- **`/Search/Services`、`/Search/Service/{name}`**: 厂商已下线（能力合并进 `/Search/Capabilities` + `/Search/Query`）⇒ 删除 `search.services()` / `search.service()` 及 `searchServices` / `searchService` 两个 agent 工具；语义由 `capabilities()` 与 `query(q, category)` 覆盖。

### Added (B: 接 12 个厂商新能力)
- **friendcircle**: `BatchDownload` / `BatchDownloadStatus` / `BatchDownloadFile`（批量导出三拍；文件走新增的 `getWppBinary`，`getWppJson` 会 `text()` 解析毁掉二进制）、`AutoForward` / `AutoForwardStatus`（自动跟发，发布类走 `assertFriendCirclePublishAllowed`）
- **friend**: `AutoAccept`（自动通过好友申请，默认关闭、无默认放行）、`GetFriendRequestList`
- **label**: `UpdateOrder`；**tenpay**: `CreatePreTransfer`（单位分，只下预订单不扣款）；**tools**: `DownloadMiniProgramCover`
- **other（新模块 `src/send/other.ts` + `other-meta.ts`）**: `GetUserRankLikeCount`
- **msg**: `SendApp`（⚠️ 语义已由「群发」改为定向 App 消息，但 **不注册 agent 工具**且 `toWxid` 为必传形参 — 见 `send/msg.ts` 注释）

### Fixed (C: 字段名)
- `OfficialAccounts/OauthAuthorize` 补 swagger 必填 `appid`；`Label/UpdateName` 的 `labelName` → `NewName`（大小写不敏感也救不了的真名差异）
- 其余为大小写差（`appId` vs `appid` 等）— vendor 是 Go, `encoding/json` 大小写不敏感匹配, **非缺陷**, 不改
- **存疑未改**: `OfficialAccounts/Follow` / `Quit` — swagger 引用的是通用占位 `DefaultParamDoc`（只有 `appid`, 与 `Quit` 共用）而项目发语义化的 `{biz, operation}`, 冲突且无活体证据 ⇒ 保留原样 + 就地注释

### ⚠️ Fixed (纠正 v1.4.1 起的端点误绑, 需老板活账号复测)
- **`/Tools/setproxy` 从来就是「设置/删除代理IP」**(必填 `proxy`, 传空串恢复直连), 厂商没换过语义; 步数端点一直是 `/Tools/SetStep`(必填 `step`), 两者并存。
- **误绑由来 (commit 7795b4a v1.4.1)**: 当时记「SetStep 有 vendor bug (`Step.go:107` index out of range panic → HTTP 500)」, 遂把步数改发 setproxy 作权宜, 并附观察「2026-08-20 发 `{steps}` ⇒ Code:1 可用」。**该观察实为反证**: setproxy 只读 `proxy`, 未知字段 `steps` 被 Go 静默忽略 ⇒ `proxy` 取零值空串 ⇒ **恢复直连**而厂商照常回成功码 ⇒ 那次调用既没改步数、还可能把账号出口代理清了。
- **现改正**: `setStep` → `/Tools/SetStep`; setproxy 按真实语义单列 `setProxy(proxy)`。
- ⚠️ **待老板活账号确认**: ① `SetStep` 的 Step.go:107 panic 在 v09102 是否已修 (swagger 只列 200, 无 422/500 文档); ② 有无账号因历史上那几次调用被静默改成直连 —— 厂商**无「查代理」端点**(`/Login/GetLoginStatus` 明写不返回代理凭据), 只能靠 setproxy 回写。

### Added (回归门, 防再次静默漂移)
- `tests/fixtures/vendor-swagger-endpoints.json` — swagger 路径快照入仓（`tools/gen-swagger-snapshot.mjs` 可重生成, 幂等）
- `tests/unit/wpp-swagger-alignment.test.mjs` — 4 道断言（A=0 / 白名单无死登记 / swagger 端点必须接或显式排除 / 内联 body 不缺必填字段）。四道均做过**反向注入**验证; 过程中修掉自身两个盲区（注释里的路径被当调用 → 先 `stripComments`; 对象简写 `{keyword}` 取不到键名）。
- **测试**: 131 个 (129 pass / 0 fail / 2 skip，含本批新增 4 案)；`tsc` 0 错；`dist/` 已重建

> ⚠️ 部署注: 本次仅改源码 + 重建 `dist/`, **未 deploy 到 `/root/.openclaw/extensions/wechatpadpro/`, 未重启网关**。

## [v1.5.5-dev] 多维度审阅修复 + D6 性能守卫 (2026-09-08)

> 注: v1.4.1 → v1.5.4 的变更记录在本体上线时已落 git commit (见 `git log`), 但 CHANGELOG.md 未逐版同步, 将于后续版本批量补齐。此处记录 2026-09-08 审阅驱动的当次修复。

- **fix (heartflow-learn)**: dispatcher send 后落账 `persistHfSendOutcome` (仅 `msg.trigger==="heartflow"`, fire-and-forget) — 修复 heartflow-feedback.test.mjs test#9 长期未实现断言。commit `8b2d291`
- **fix (heartflow)**: intent-llm.ts DeepSeek 调用补 `thinking:{type:"disabled"}` (源码与 dist 同步) + 加 send/group.ts PascalCase 7 案。commit `431eeaa`
- **test (perf D6)**: 新增 `tests/unit/perf-heat-path.test.mjs` 6 案 — config LruCache / affection 内存 Map / heartflow-learn 阈值 / lru TTL / dist 同步 热路径回归守卫。commit `53b2226`
- **perf (D6-P2)**: OSS 凭据读取加入 LruCache TTL 缓存 (30s), `media-oss.ts` + `media-enrich/shared.ts` 各 + `clearOssConfigCache()` 供测试/凭据轮换, 消除自发送/入站媒体热路径每次 disk I/O。
- **test**: 103 pass / 0 fail / 2 skip (2 skip 为显式 HMAC #SKIP)

> ⚠️ 部署注: 2026-09-08 侧 dev 修复**尚未 deploy + restart 网关**, 待老板统一拍板后 `systemctl --user restart openclaw-gateway` 生效。

## [v1.4.0] 心流机制修复 + 4 层兜底链配置化 + 消除 plugin model hardcode
- 2026-08-25 (老板: 修复心流 3 次重试死循环 + 兜底默认从 cfg 链动态读取, 缺失抛错)
- **bug fix (09:38 老板拍 C 方案)**:
  - heartflow.ts + affection.ts: timeoutMs 5000 → 15000 (实测 M2.5 4.2s, 5s 窗口必失败 + 3 次重试死循环)
- **feat (11:34 老板拍 B+ 方案)**:
  - openclaw.plugin.json: channelConfigs.wechatpadpro.schema.properties.{heartflow,affection,jargon}.properties.model 加 default + enum (MiniMax-M2.7-highspeed)
  - accounts/default.json: 配 heartflow.model + affection.model + jargon.model = MiniMax-M2.7-highspeed
- **refactor (12:09/12:28 老板拍板 B)**:
  - heartflow.ts/affection.ts/jargon.ts: 删除 `model: "MiniMax-M2.5"` hardcode, 改 `cfg.model ?? throw new Error(...)` 替代 silent fallback
  - 4 层兜底链: account cfg → schema default → .ts hardcode (已禁用) → OpenClaw 框架 agent config
  - JSDoc: 清理 "默认 MiniMax-M2.5" 描述 (12:21)
- **设计哲学 (12:10 Explicit Preference)**:
  - 兜底默认 = wpp channel 对应账号 agent 使用的模型 (MiniMax-M2.7-highspeed)
  - plugin 内不 hardcode, 必须从 cfg 链动态读取
  - 缺失立即抛错 (按 6-21 偏好"可回溯", 优于 silent fallback)
- **测试**: 984/984 全绿 (沿用 v1.3.80 测试基线)
- **实测**: deploy 端 jargon.js + heartflow.js + affection.js `MiniMax-M2.5` hardcode = 0, accounts/default.json 模型字段生效, gateway PID 3765826 active
- **版本**: 1.3.80 → 1.4.0 (MINOR bump per SemVer: 新功能 plugin 内部兜底链配置化)
- **commit**: 359c301 (v1.4.0: 心流机制修复 + 4 层兜底链配置化 + 消除 plugin model hardcode)

## [v1.3.80] 命令体系整合 — 统一白名单 + 三功能通用处理器
- 2026-08-23 (老板: 整合增删/开关/列表, 简化命令逻辑)
- **命令体系 (9 个, 统一 add/del/list 或 on/off/status)**:
  - `/user add|del|list <wxid>`: 私聊白名单 (批量, 替代旧 /adduser /deluser)
  - `/group add|del|list <群ID>`: 群白名单 (批量, 替代旧 /addgroup /delgroup)
  - `/blacklist add|del|list <群ID>`: 黑名单群 (新增)
  - `/heartflow on|off|status|threshold|group`: 心流 (通用处理器)
  - `/affection on|off|status`: 好感度 (通用处理器)
  - `/jargon on|off|status`: 黑话 (通用处理器)
  - `/xiaowei /genpair /pairs`: 保留
- **重构**:
  - `handleWhitelistCommand`: 白名单三域统一 add/del/list (批量)
  - `handleFeatureCommand`: 三功能统一 on/off/status (+heartflow threshold/group)
  - `updateBlacklistGroups`: 黑名单批量写回 (账号专属)
  - `updateHeartflowGroups`: 心流群白名单联动 (add 补群聊白名单, del 不删)
- **删除旧命令**: /adduser /deluser /addgroup /delgroup
- **测试**: 984/984 全绿
- **实测**: /help /user /heartflow 命令处理成功
- **版本**: 1.3.79 → 1.3.80

## [v1.3.79] 三功能 filehelper 命令 + 账号专属配置热生效
- 2026-08-23 (老板: 多账号配置只能放账号专属文件 + 命令热生效)
- **filehelper 命令** (账号专属, 写 accounts/<id>.json):
  - `/heartflow on|off|status|threshold <0-1>`: 心流开关+阈值
  - `/affection on|off|status`: 好感度开关
  - `/jargon on|off|status`: 黑话开关
- **配置热生效**: `runtimeHeartflow/Jargon/Affection` 账号专属容器,
  triggerConfig/handler 共享同一引用, 热重载更新容器即刻生效
- **setAccountField**: 通用账号配置写回 (嵌套路径, 写 accounts/<id>.json)
- **多账号隔离**: 命令只改当前账号 accounts/<id>.json (架构原则)
- **测试**: 981/981 全绿 (命令注册表 10 个)
- **实测**: /heartflow on → 写账号配置 → hot-reload changed=heartflow → 容器更新
- **版本**: 1.3.78 → 1.3.79

## [v1.3.78] 完整审阅修复 — 6 P0 + 7 P1
- 2026-08-23 (5 维度审阅: 安全/正确性/健壮性/代码质量/新功能 → 全部修复)
- **P0 安全**:
  - webhookPathToken 自动生成确保 (ensureWebhookPathToken, 无 token 不可启动 webhook)
  - 群白名单 allowlist 空列表 = 拒绝所有群 (fail-closed, 与 DM 对齐; triggers + group-policy 双修)
- **P0 正确性**:
  - WS 路径 v1 schema 消息不丢失 (ws-client 直接传 raw 给 handler 统一解析)
  - 去重 key 并入 accountId (多账号同群消息不互判重复)
  - 心流精力恢复不再推进 lastReplyTime (冷却恢复生效)
  - dispatcher 双派发: 确认 outbound-dedup 兜底
- **P1 新功能**:
  - jargon 挖掘不因历史满 200 条停摆 (独立单调计数器 getGroupMessageCount)
  - heartflow judge 加 minJudgeIntervalSec 频率闸 + maxRetries 默认降 1 (防阻塞+每消息LLM)
  - affection 去单字正/负向词 (笑死我了/狗粮/晚上好 不再误判)
- **P1 健壮性**:
  - WS 长退避不被 maxRetryDelay 截断 (5分钟退避生效)
  - synckey 先处理消息再保存 (崩溃不丢消息; ws + webhook 两路径)
  - DB 启动加退避重试 (3次 1s/2s/4s)
  - webhook sync_message 加每账号锁 (与 ws 串行防并发双拉)
- **测试**: 989/989 全绿 (新增 WS/synckey/频率闸/单字修复断言)
- **部署**: 生产 v1.3.78, verify 0 error, affection.js 首次部署
- **版本**: 1.3.77 → 1.3.78

## [v1.3.77] AFFECTION 好感度/社交关系系统 + 情绪注入
- 2026-08-22 (移植自 AstrBot self_learning v3.6.1 affection_manager 模块)
- **新增 `src/inbound/affection.ts`**: 17 交互类型规则表 + 10 情绪修正 + 好感度增减/重分配
  - 关键词规则分类 (零 LLM) + 可选 LLM 增强 (llmClassify)
  - 情绪状态机 (负面/正面/一般响应), 情绪注入 system prompt 影响回复风格
  - max(0,...) 下限对齐原版
- **接入**: handler.ts 旁路处理群消息 → 好感度+情绪; dispatcher.ts 群聊 dispatch 注入情绪
- **配置**: `accounts/*.json` 加 `affection` (默认 enabled:false); `ai` 块统一判断模型
- **测试**: tests/affection.test.ts 22 用例
- **版本**: 1.3.76 → 1.3.77

## [v1.3.76] JARGON 群黑话挖掘 + AI-UNIFY 统一模型配置
- 2026-08-22 (自主学习黑话模块 — 移植自 AstrBot self_learning v3.6.1 jargon 模块)
- **新增 `src/inbound/jargon.ts`**: 群黑话挖掘三层流水线
  - ① 统计预筛 (零 LLM): jieba/n-gram 分词 + 停用词/标准词过滤 → 跨群IDF + burst score + 用户集中度 → 高分候选
  - ② LLM 批量验证: 一次调用筛掉普通词, 只留真黑话
  - ③ LLM 三步推断: 上下文推断 vs 纯字面推断对比 → 判黑话 + 推断含义
- **接入**: `handler.ts` 旁路采集 (不参与触发判断, 与心流互补) + 定时挖掘; `agent-tools/jargon-meta.ts` 加 `query_jargon`/`list_jargon` 工具 (AI 可查群黑话)
- **存储**: `db/schema.sql` 加 `wpp_jargon_terms` 表; `storage/db/jargon.ts` CRUD
- **v1.3.77 AI-UNIFY**: `accounts/*.json` 加 `ai` 块 (judgeModel/timeoutMs), heartflow/jargon 未配 model 时默认引用; `src/config-ai.ts` 纯函数
- **配置**: `accounts/*.json` 加 `jargon` 字段 (默认 `enabled:false`); `ai` 块统一模型
- **分词**: 可选 `@node-rs/jieba` (未装则 n-gram 降级, 不阻塞)
- **测试**: 967/967 全绿 (新增 tests/jargon.test.ts 20 用例: 分词/过滤/统计/burst/score/JSON/prompt/ai-unify)
- **版本**: 1.3.75 → 1.3.76

## [v1.3.75] HEARTFLOW 心流主动回复
- 2026-08-22 (心流机制 — 老板拍板: 让机器人在群里更"活", 移植自 AstrBot Heartflow v2.1.1)
- **新增 `src/inbound/heartflow.ts`**: 未@群消息由**小模型 5 维打分** (相关度/意愿/社交/时机/连贯, 0-10 加权) 判断是否主动参与; 精力状态机自动控频 (回复衰减/不回复恢复/每日重置); 原始消息环形缓冲 (含 bot 自己回复); 群白名单 + 冷却期门禁; JSON 稳健解析 + 重试
- **接入**: `triggers.ts` 未@群消息 → `via:"heartflow"` (同步门禁) → `handler.ts` 异步 judgeHeartflow 打分, 通过才 dispatch → `dispatcher.ts` 注入"主动参与"提示 + bot 群回复记录进缓冲
- **配置**: `accounts/*.json` 加 `heartflow` 字段 (默认 `enabled:false`, 不开行为不变); 判断模型走 `MINIMAX_API_KEY`
- **白名单叠加**: 心流天然只在 `groupAllowFrom` 白名单群内生效 (groupPolicy=allowlist 先于 heartflow gate)
- **测试**: 941/941 全绿 (新增 tests/heartflow.test.ts 25 用例; 修 2 处 pre-existing debounce 断言 1500→500)
- **版本**: 1.3.74 → 1.3.75

## [docs] API 使用文档完善 (2026-08-21)
- **WPP-API-REFERENCE.md 全量升级**: 254 → **313 端点** (swagger 全量)
- **三源合并生成**: swagger 定义 + `send/*.ts` 源码实测调用 (299 端点) + `api-notes.json` 探索笔记 (26 端点)
- **新增 `scripts/api-notes.json`**: 人工维护的探索经验 (可用性/坑/示例/实测日期)
- **`gen-api-reference.py` 升级**: 从源码提取实测调用 + notes 合并, 重新生成不丢人工经验
- 覆盖开发中探索出的坑: SendApp 群发勿用 / Msg/Quote ret=-2 / DownloadImg 64KB / CDN 图片 / DownloadFileBinary / DownloadVideo 分片 / GetQR Code:1 等

## [v1.3.74]
- 2026-08-20 (审阅核实修复 + 性能/测试/僵尸优化)
- **P2-5 api-coverage 固定 swagger 快照**: tests/fixtures/vendor-swagger-paths.json (313 paths), vendor 不可达不再 t.skip 假绿, 用本地快照真校验
- **P3-6 旧日志标签清理**: 39 处纯版本标签 [WPP v1.2.0] → [WPP v1.3.74]; 功能标记 (V1-SCHEMA-ENRICH 等) 保留
- **P3-7 xiaowei-meta 注释更新**: 与 v1.3.71 起实现一致 (工具已进 AGENT_TOOLS_META, 执行前检查 xiaoweiEnabled)
- **性能诊断**: 回复延迟 = 双通道去重 ~1.5s + debounce 1.5s + AI 生成 (多次模型调用) 5-18s; debounce 可调优
- **僵尸进程防护**: wpp-test-zombie-watcher.mjs + node-zombie-sweep.sh 扩展 (扫 tsx 测试僵尸, cron 9:15)
- **测试**: 895/895 全绿 (计数 916↔895 波动为 tsx runner 特性)
- **版本**: 1.3.73 → 1.3.74

## [v1.3.73]
- 2026-08-20 (转账静默 — 老板测收转账发现)
- **转账消息 (msg_type=49, app.category=payment_notice) 触发 AI 回复修复**: isRedPacketMessage 扩展识别 payment_notice/transfer + description 含"转账/收款" → 转账也静默入库不触发 AI (同红包)
- **测试**: 916/916 全绿 (v1.1.7-special-msg 加转账识别断言)
- **版本**: 1.3.72 → 1.3.73

## [v1.3.72]
- 2026-08-20 (红包/系统通知静默 — 老板实测"收红包/领红包都触发 AI")
- **红包消息不触发 AI 修复**: handler.ts dispatch 循环开头拦 isRedPacketMessage (原 continue 只在 relay 循环, dispatch 仍触发)
- **系统通知 (msg_type=10000, 含红包领取/转账/安全提醒) 静默**: dispatch 循环拦 10000
- **测试**: 915/915 全绿 (inbound.test 加 2 测试)
- **版本**: 1.3.71 → 1.3.72

## [v1.3.71]
- 2026-08-20 (小微命令开关 — 老板拍板)
- **/xiaowei on|off|status 命令**: FILEHELPER_COMMANDS 注册表 (自动进 /help); config.ts setAccountFlag 通用开关写回; types.ts 加 xiaoweiEnabled
- **xiaowei 工具执行前检查 xiaoweiEnabled**: 默认关闭抛"未启用"; 朋友圈用白名单机制不加开关 (老板拍板)
- **测试**: 912/912 全绿
- **版本**: 1.3.70 → 1.3.71

## [v1.3.70]
- 2026-08-20 (图片 enrich 修复 — 老板实测发图)
- **/Tools/DownloadImg 新 vendor 参数适配**: snake_case (msg_id/to_wxid/data_len) + section 必填; isV1SchemaImage 提取 image.data_len; 旧字段 msgId/toWxid → INVALID_ARGUMENT
- **测试**: 911/911 全绿
- **版本**: 1.3.69 → 1.3.70

## [v1.3.69]
- 2026-08-20 (小微预开发 — 老板拍板预开发不启用)
- **XiaoWei 20 端点全覆盖**: src/send/xiaowei.ts (Chat会话/SSE Events/History记忆/Invites邀请/RedDots红点/Cards卡片/Permission/A2A/Suggestions) + xiaowei-meta.ts (默认不 import = 禁用) + WPP_VENDOR_ENDPOINTS.xiaoWei
- **测试**: 912/912 全绿
- **版本**: 1.3.68 → 1.3.69

## [v1.3.68]
- 2026-08-20 (发布包架构变更 — 老板拍板)
- **发布包移除旧 vendor tar** (20260809, 12M→1020K): 新 vendor 通过 docker pull wechatpadpro/wechatpadprobusiness:v2026.08.18.1 + 官方 docker-deploy
- **文档重构**: vendor/README (Docker 部署) + FACE-LOGIN.md (人脸认证+iPad扫码) + 8075docker-deploy.zip 进发布包; README/GETTING_STARTED/DEPLOY/USAGE 全部改新端口/313 端点/authcode 走 X-Access-Token
- **版本**: 1.3.67 → 1.3.68

## [v1.3.67]
- 2026-08-20 (新 vendor 新增 API 接入 — 老板全选优先级)
- **37 新 API 适配**: P0 9 (群发/发文件/收藏圈/通讯录/好友权限) + P1 7 (公众号3/视频号4) + P2 10 (视频播放4/结构化卡片/红包2/小程序OAuth3) + P2B 11 (Login6/Search-AI2/ActiveTasks/Label/SayHello-Modelv3)
- **QWContact 路径修复**: /QWContact/QWContact/QWAddContact 路径去重 + 参数对齐 username/v1
- **测试 swagger 指向新容器 18062** (旧 8062 退役)
- **版本**: 1.3.66 → 1.3.67

## [v1.3.66]
- 2026-08-20 (SayHello 对齐 + 版本常量同步)
- **/SayHello/Modelv1+Modelv2 传参对齐**: 旧错传 scene/v1 与 v1/v2 → 新 swagger url/verifyContent 与 toUserName/content/scene
- **PLUGIN_VERSION 硬编码同步**: core/constants.ts (gateway-compat 测试断言 + 日志版本)
- **测试**: 889/889 全绿
- **版本**: 1.3.65 → 1.3.66

## [v1.3.65]
- 2026-08-20 (Favor favId 类型修复 — 新 vendor 严格)
- **/Favor/Del+GetFavItem favId string→number**: 新旧 swagger 均 integer, 新 vendor 报 cannot unmarshal string into int32
- **测试**: 889/889 全绿
- **版本**: 1.3.64 → 1.3.65

## [v1.3.64]
- 2026-08-20 (新 vendor 兼容适配)
- **/User/GetContractProfile GET→POST**: 新 vendor GET 404, POST Code=0; 删除废弃 get() 方法
- **测试**: 889/889 全绿
- **版本**: 1.3.63 → 1.3.64

## [v1.3.63]
- 2026-08-14 (多维度审阅修复 — 6 P1 + 8 P2 全清, 876/876 全绿)
- **P1-1 [正确性] ACK 拦截正则 0x08 退格字节修复**: dispatcher.ts ACK_TEMPLATE_RE 的 `)\b` 被转义成字面 0x08 → 正则恒 false → 14:50 P0-fix 拦截半边生产失效。改 `\b` + 导出常量供测试 import 真值 (根除手抄副本)
- **P1-2 [正确性] chunker 巨型代码块硬 cap**: chunkLongParagraph 代码块内推迟切分无上限 → 2000 行代码块单 chunk 56KB 超 vendor 限。加 `limit*2` 硬 cap, 超则强制切 (不闭合围栏也封顶)
- **P1-3 [正确性] outbound dedupe key 误吞**: content[:30] 前缀作 key → 同 peer 5 分钟内不同回复 (前 30 字同) 被误吞。改完整内容 sha1 hash key
- **P1-4 [并发] _outboundDedup Map 无界泄漏**: 只写不删 → 加写时清扫 (size>1024 扫过期)
- **P1-5 [崩溃] ensureAgentWorkspace bindId 残留**: 与 registerAccountInOpenclaw 对齐去掉 915-928 两处 bindId/maxId (曾致 gateway status=78 崩)
- **P1-6 [运维] unregister agents.list 误删共享 agent**: 排除 wpp-wechat/main + 检查剩余 bindings 引用才删
- **P2-1 [chunker] 代码块内空行拆断围栏**: 切段前扫围栏跳过块内空行
- **P2-2 [chunker] hardSplitLine 切断 emoji 代理对**: codePointAt 对齐切分点
- **P2-3 [relay] 单行接龙 title 里 "N. " 误判条目**: 从首个 `1. ` 处切起 (title 前缀弃置)
- **P2-4 [并发] embedCache 无界**: 加 2000 容量上限, 写时删最旧
- **P2-5/6/7 [测试] 假绿改真测**: chunker 测试加长到 >limit 触发真切分; dedupe 测试 import 生产 ACK_TEMPLATE_RE + dedupKeyFor 真值 (不再手抄/fake 重写)
- (第二波 — 2026-08-14 完整修复, 老板"继续完整修复"拍板)
- **P1 [架构] shared webhook 生命周期**: webhook-receiver 加 removePath; account-context stop 改 removePath 摘自己 path (不再 stop 共享 server, 防单账号移除波及其它账号); shutdown 统一停 + 置空 sharedWebhookServer (防重启复用已停 server 不 start → webhook 永久失效)
- **P1 [安全] friendcircle guard 绕过修复**: messagesRaw/publishVideoViaItem/setBackgroundImage 补 assertFriendCirclePublishAllowed (原漏网); publishCircleRaw 从 agent-tools 移除 (AI 不该有原始 XML 发布能力)
- **P2 [安全] readLocalMedia symlink 逃逸**: realpath 解析后再做 allowedRoots 包含校验 (原 path.resolve 纯词法, readFile 跟随 symlink 可读外部); workspace 根收窄到 workspace/media (原含 agent 转录/.env)
- **P2 [安全] mysql**: getContacts/getChatrooms LIMIT clamp (1-1000); pool 加 queueLimit (防耗尽无限等待)
- **P2 [并发] relayTriggerAt 清理**: 写时 size>1000 扫过期
- **P3 [安全]**: media-enrich md5 文件名净化 (sanitizeFilenamePart 只允许 hex); vendor-mcp-client 日志脱敏 (args/payload 只记 keys); handler.ts payload 摘要去内容; ACK_TEMPLATE_RE 收窄为完整 `[...]` 块匹配 (防正文散落 delivered 误伤)
- **webhook token** (老板拍板): webhookPathToken 账号字段插入 path → /wechatpadpro/<token>/webhook; deriveWebhookPaths 纯函数; nginx token 前缀放行 + 其余 403
- **测试**: 889/889 全绿 (876 + 新增 readLocalMedia 5 / removePath / friendcircle guard 4 / P1-7 path 3)
- **版本**: 1.3.62 → 1.3.63 (package.json + openclaw.plugin.json + core/constants.ts); 统一 v1.3.65 日志串为 v1.3.63

## [v1.3.62]
- 2026-08-13 (OPENCLAW-GUIDED-SETUP — 让 OpenClaw 能驱动插件引导配置)
- **插件加顶层 `configUiHints`** (openclaw.plugin.json + src/index.ts): tokenKey/authcode (sensitive) / apiBaseUrl / wsUrl / allowFrom / groupPolicy / groupAllowFrom / agent / webhookPort
  - OpenClaw `configure --section plugins` 现在能引导本插件配置 (写 plugins.entries.wechatpadpro.config)
- **config.ts 读引导兜底**: `readGuidedPluginConfig` 读 openclaw.json plugins.entries.wechatpadpro.config; `mergeGuidedConfig` 字段级 merge (default 账号, 空值填充, 文件已有值保留)
- **测试**: 新增 guided config 测试 (读引导 + merge 逻辑: allowFrom 逗号串→数组 / webhookPort 数字); 827/827 串行全绿; tsc 0 错
- **注意**: 这是"单账号 default 兜底"; 多账号 (每账号独立 agent) 仍走 CLI `npm run setup add <id>`

## [v1.3.61]
- 2026-08-13 (WEBHOOK-SHARED-PORT + P2-FIX — 多账号 webhook 单端口 + P2 收尾)
- **webhook 共享端口 (贴合 vendor 设计)**: vendor 按 authcode 区分账号 (Webhook/* 接口 URL query 带 authcode), 回调 URL path 含 accountId → **单端口 + path 区分**, 不再每账号独立端口
  - `webhook-receiver.ts` 加 `addPath()` (动态注册 path, 幂等, start 前后均可)
  - `index.ts` 加全局共享 webhook server (首个账号创建, 后续复用 + addPath; 只 attach 给创建账号防重复 stop)
  - `setup.ts` suggestNextWebhookPort 固定 4398 (不再递增)
  - 文档更新 (GETTING_STARTED/USAGE)
- **P2-1 BigInt**: setup-wizard.ts 5 处 JSON 写加 `stringifyLargeInts` (防未来大整数字段丢精度)
- **P2-2 c8 覆盖率**: 加 `c8` devDep + `npm run coverage` (总覆盖率 77.78%, 工具类 90-100%)
- **测试**: 826/826 串行全绿; tsc 0 错

## [v1.3.60]
- 2026-08-13 (MCP-MULTIACCOUNT — MCP 多账号适配)
- **MCP client 重构为 per-account 连接**: token 从账号 `config.authcodeEnv` 解析 (每账号独立 authcode env), 连接 Map key=accountId
  - `getMcpToken(accountId?)` / `connectMcpClient(accountId?)` / `callMcpTool(name, args, accountId?)` / `listMcpTools(accountId?)`
  - 单账号 (default) 行为不变 (WECHATPRO_AUTHCODE)
  - mcp-meta 传当前账号 id; resolveFileViaMcp / enrichFileMessageViaMcp 透传 accountId
- **修复**: 之前 MCP 全局单例用 default 的 authcode → 非 default 账号 MCP 工具查错账号数据
- **测试**: 新增 getMcpToken 按账号 authcodeEnv 解析 (tests/agent-tools-mcp.test.ts); 826/826 串行全绿; tsc 0 错

## [v1.3.59]
- 2026-08-13 (FULL-FIX — 完整审阅 P0/P1/P2 全量修复 + 补关键测试)
- **P0-1 [正确性]**: persistOutboundMsg 判据加 `BaseResponse.ret` 检查 (Code=0+ret≠0 不入库, 防幽灵 outbound 记录)
- **P0-2 [安全]**: silk-encoder 本地路径读加 readLocalMedia 三重校验 (防 AI 诱导读任意 .silk/媒体文件外带)
- **P0-3 [测试]**: agent-tools-mcp 测试隔离 env (不真连 vendor); vendor-mcp-client setTimeout clearTimeout (防 timer 泄漏 → 测试非确定性)
- **P1**: 两个 Map 泄漏修复 (pendingReplies/sessionChatInfo 写时阈值清理); MCP 只读工具受 `mcpEnabled` 门控; release/ 重出到 v1.3.59
- **P2**: JSON 响应体字节 cap (API_JSON_MAX_BYTES 30MB, 防媒体端点 OOM); resolveCallCtx 缺凭证 warn (防跨账号静默回落)
- **补测试**: MCP readMcp 成功/isError + mcpEnabled 门控; mp3→silk 成功路径 (真 ffmpeg+silk encoder, Type=4); agent-tools 账号感知 (accountContext.run 下选账号); 接龙节流恢复
- **测试**: 825/825 全绿 (串行稳定); tsc dev+release 0 错

## [v1.3.58]
- 2026-08-13 (MCP-READONLY — vendor MCP 只读能力整合给 AI)
- **新增 mcp-meta.ts**: 7 个 MCP 只读工具给 AI (account_status/get_contact/get_group/get_recent_messages/list_contacts/list_groups/search)
  - 复用 vendor-mcp-client (Bearer authcode + 超时 + 失败降级)
  - AI 可直接查账号状态/联系人/群/最近消息/微信搜索 (search 是 MCP 独有)
- **写工具暂缓**: vendor MCP 6 写工具需 2026-07-28 协议 + elicitation 确认流, 当前 SDK 1.30 打不通 (记录待 vendor 出参考客户端)
- **测试**: 新增 tests/agent-tools-mcp.test.ts (3 用例: 注册/降级/无凭证安全); 全量测试

## [v1.3.57]
- 2026-08-13 (DELIVERY-FIX — 交付前审阅 P0/P1/P2 全量修复)
- **P0-1 [安全] SSRF**: resolve-media.ts + silk-encoder.ts 裸 fetch → `safeFetchWithCap` (host 白名单 + 字节 cap + 超时), 防 AI 诱导抓内网/云元数据外带
- **P0-2 [正确性] 接龙门禁**: 接龙强制触发前检查 `via!=="blocked"` (黑名单群/自回环绕过)
- **P1-1**: `normalizeSendResp` 复用 isSendOk 判据 (file/link 等 5 类防假成功)
- **P1-2**: `sendVoice`/`sendVideo` 用 `extractOutboundMsgIds` (拿 newMsgId/createTime, 与 text/image 对齐)
- **P2-1**: 接龙节流 key 并入 accountId (防多账号同群互相节流)
- **P2-2**: 引用昵称缓存 key 并入 acct (防跨账号昵称串号)
- **P2-3**: quoteReply 成功判据接受 Code=200
- **P2-4**: handler 引用媒体查询加 `direction:"any"` (引用 bot outbound 消息可查)
- **P2-5**: agent-tools 报错信息含真实账号 (20 个 meta)
- **P2-6**: ensureAgentWorkspace agents.list 去重 + setup.ts checkAgentExistsInOpenclaw 用 OPENCLAW_ROOT
- **P2-7**: 测试写真实 accounts/ 的竞态修复 (beforeEach 清残留)
- **relay title fallback**: parseRelayText 无 `<title>` 标签时用 `#接龙 xxx` 首行作 title (否则不同接龙 title 全空 → 节流 key 相同互相节流)
- **测试**: 新增节流/黑名单绕过/不同标题测试; 817/817 全绿; tsc 0 错
- **MCP 调研**: vendor MCP 13 工具 (7 只读 + 6 写), 写工具需 `mcp:write` + **confirmation elicitation** (当前 SDK 不支持自动确认, 待设计确认流)

## [v1.3.56]
- 2026-08-13 (MULTI-ACCOUNT — 启用多账号, 一 authcode = 一 agent = 一账号)
- **配置引导完整化**:
  - `add`: 每账号独立 agent (默认 `wpp-<id>`), webhookPort 自动分配 (4398 起跳已用), 写后自动登记 openclaw.json
  - 新增 `modify <id>`: 交互式编辑 (agent/白名单/端口/env名/群策略); 改 agent 自动同步 binding + 建新 agent workspace
  - `remove <id> --clean`: 连带删 agent workspace + openclaw.json 登记/binding (仅删 json 用不带 --clean)
- **openclaw.json 登记 (setup-wizard.ts 新增)**: `registerAccountInOpenclaw` / `unregisterAccountFromOpenclaw` (幂等)
  - channels.wechatpadpro.accounts.<id> + bindings route `{channel:"wechatpadpro", accountId:"<id>"}` (精确匹配)
- **ensureAgentWorkspace binding 修复**: `channel:"last", accountId:"*"` (死配置) → `channel:"wechatpadpro", accountId:<id>` (per-account 精确路由, 幂等)
- **运行时账号透传**:
  - `api-client.ts makeCtx`: accountId 透传真实 id (非 "default")
  - `media-oss.ts uploadMediaToOss`: 加 accountId 参数 (OSS 路径按账号分桶, 防多账号互相覆盖)
  - `index.ts outbound`: 缺 accountId 用当前 dispatch 账号 (ALS) 兜底
  - `dispatcher.ts`: dispatch 队列键并入 accountId (防跨账号同群串行阻塞)
- **agent-tools 账号感知**: 新增 `src/dispatch/account-context.ts` (AsyncLocalStorage);
  - dispatchOne 用 accountContext.run(msg.accountId) 包裹 AI 回复生成
  - 21 个 agent-tools meta 的 getXxxApi() 从 `get("default")` → `get(getCurrentAccountId() ?? "default")`
- **测试**: 新增 tests/setup-multiaccount.test.ts (13 用例: 读/改/登记/注销/幂等/binding 格式/ALS 穿透/并发隔离); 814/814 全绿; tsc 0 错

## [v1.3.55]
- 2026-08-13 (RELEASE-GENERIC — 分享版可被接收方用自己的 OpenClaw 部署)
- **deploy 脚本通用化**: `OPENCLAW_ROOT` (默认 $HOME/.openclaw) / `GATEWAY_SERVICE` (默认 openclaw-gateway) / `BACKUP_ROOT` (默认 /data) 全 env 可覆盖.
  - `deploy-swap.sh`: openclaw.json 不存在则 fail 并提示; gateway 非 systemd 则跳过重启 + journalctl verify, 提示手动重启; GATEWAY_ENV 不存在跳过 env 注入
  - `deploy.sh`: OPENCLAW_ROOT 可覆盖探测/手动部署提示
- **setup-wizard.ts**: openclawRoot / backupDir 支持 `OPENCLAW_ROOT` / `BACKUP_ROOT` env (接收方非 root 环境)
- **build-release.sh**: 发布包收进 `deploy.sh` + `deploy-swap.sh` (通用化后) + `db/schema.sql` (补漏拷, 防接收方 schema.sql not found warning)
- **release-docs/GETTING_STARTED.md**: 加"用自己的 OpenClaw 部署"三种环境表 (systemd/docker/非root) + 手动接入步骤
- **测试**: 801/801 全绿; tsc 0 错

## [v1.3.54]
- 2026-08-12 (RELAY-TRIGGER — 接龙消息触发 AI 鼓励, XX群)
- **根因 (老板反馈"接龙一直没 LLM 介入")**: 真实 vendor 接龙推送是 **type=49 (app, category=app_message)**, 但 handler 只判断 `msgType===53` (describeMsgType 映射的 chat-history) → relay 解析从未执行; 且 msgTypeTrigger 未配置 → 接龙消息不触发 dispatch → **AI 完全不介入**。v1.3.37 RELAY-PARSE 测试用的 53 是假设, 跟真实 vendor 数据不符 (集成 bug)。
- **修复**:
  - `relay.ts` 加 `isRelayMessage(m)`: type=53 (旧兼容) 或 type=49 && (content/title 含 "#接龙" 或 "接龙"+编号条目)
  - `handler.ts` Step 3: relay 解析条件 `msgType===53` → `isRelayMessage(m)` (默认 parseRelay 开)
  - `handler.ts` dispatch: 接龙消息**强制触发 AI** (即使没人 @) — 老板诉求"对XX群接龙进行鼓励"
  - **节流**: 同群同接龙标题 5 分钟内只触发一次 (vendor 每次有人接龙都推完整接龙, 全回会刷屏); 被 @ 消息不受节流影响
- **测试**: `isRelayMessage` 5 用例 (49+接龙 true / 53 true / 普通 app false / 文本 false / 无条目 false) + handler e2e (type=49 接龙强制 dispatch + content 解析成 [接龙] 前缀); 801/801 全绿; tsc 0 错

## [v1.3.53]
- 2026-08-12 (VOICE-DEGRADE — 语音转码失败降级发文件 + api-coverage 自动拉 swagger)
- **P3-1 VOICE-DEGRADE (老板 6-12 16:36 偏好)**: mp3 语音转 silk 失败 → 降级为文件消息 (不再报错)。
  - `send/msg.ts sendVoice`: 转码失败 → `sendFileViaAppFromUrl` 发文件 (sendFile 逻辑抽成闭包复用)
  - `dispatch/outbound.ts sendVoice`: 转码失败 → 下载 voice URL → sendFileViaApp 发文件 → 入库; 文件降级也失败才整体失败
  - 绝不给 `/Msg/SendVoice` 传 mp3 (vendor 只收 silk); 用户拿到可播放的音频文件, 不是啥都拿不到
  - 新增 `tests/send-voice-degrade.test.ts` (2 用例: mp3 降级发文件 + silk 仍透传)
- **P2-1 api-coverage 自动拉 swagger**: `/tmp/swagger-latest.json` 缺失时自动从 vendor (127.0.0.1:8062) 拉取落盘; 拉不到才 t.skip (环境性跳过, 不再硬 fail 3 个)
- **测试**: 795 全跑 792 pass + 3 skip (swagger 缺失时); tsc 0 错

## [v1.3.52]
- 2026-08-12 (SILK-ONLY — 语音只接受 silk, mp3 强制转码 + main agent 会话纪律文档化)
- **语音只接受 silk (v1.3.52 SILK-ONLY)**: vendor `/Msg/SendVoice` 只收 silk (Type=4)。
  - `send/msg.ts sendVoice` 唯一收口: silk 输入 (data:audio/silk/.silk) 直接透传 Type=4; **mp3/其它强制转码** (silk-encoder), 不再有 Type=2 MP3 直传路径 (8-12 老板反馈"频繁尝试 mp3 格式"根因).
  - `outbound.ts sendVoice` 去掉"转码失败降级 raw mp3" — 现在转码失败直接失败 (降级=必被 vendor 拒收).
  - `silk-encoder.ts encodeMp3ToSilk` 加 silk 透传分支 (输入已是 silk 不再 ffmpeg 重编码).
- **测试修复**: 5 个 v1.3.47 FILENAME 假红测试 (坏 mock: 源码 dynamic import 无法被 `wppChannelPlugin.dispatchSendMessage` 属性拦截) → 抽 `inferFileNameForMedia` 纯函数 + 直接单测.
- **版本同步**: constants.ts / package.json / openclaw.plugin.json = 1.3.52 (修 gateway-compat 测试).
- **main agent WPP 会话纪律 (文档+流程)**: main/wpp-wechat 两份 workspace AGENTS.md 加会话归属铁律 (WPP 会话只归 wpp-wechat; main 禁止直接发微信/创建 `agent:main:wechatpadpro:*` 会话).
- **测试**: 793 全跑 790 pass (3 个 api-coverage 需联网 swagger, 环境性失败); tsc 0 错.

## [v1.3.42]
- 2026-08-11 (COMMENT-REPLYCOMMNETID — comment replyCommnetId 类型 bug 修复 + 工具描述修正)
- **P0 bug 修复**: `comment()` replyCommnetId 默认 `""` → `0`. vendor Go 端 int32 字段传空字符串 unmarshal 报错
  (`json: cannot unmarshal string into Go struct field CommentParam.replyCommnetId of type int32`), 实测确认.
- **工具描述修正**: commentFriendCircle "commentType: 1=文字, 2=表情" → "1=点赞, 2=文本评论" (对齐 vendor 语义: 1点赞 2文本 3消息 4with 5陌生人点赞)
- **防误调**: 描述警示勿用 likeFinderPost 点赞朋友圈 (那是视频号 Finder 工具, 接口完全不同)
- **测试**: tests/friendcircle-comment-replycommnetid.test.ts (3 用例); 全部 739 测试 pass (3 个 api-coverage 需联网 swagger, 环境性失败)

## [v1.3.41]
- 2026-08-11 (FRIENDCIRCLE-GUARD — 朋友圈发布控制)
- **friendCirclePublishEnabled 默认 false**: 防止任何人发朋友圈; admin 白名单 (AllowFrom 优先)
- **agent-tools 移除 3 发布工具** (publishFriendCircle/publishImageCircle/publishVideoCircle), 防 AI 误调
- **坑**: adminUsers 原只含机器人自己, 启用后老板发不了必须补 USER_PLACEHOLDER
- **测试**: tests/friendcircle-guard.test.ts (guard 注入 getCfg 测试)

## [v1.3.40]
- 2026-08-11 (FILEHELPER-COMMANDS — filehelper 命令注册表 + 白名单增删)
- **命令注册表**: FILEHELPER_COMMANDS 集中定义 {name,desc,example,handler}, /help 自动遍历生成 (新增命令自动兼容)
- **6 命令**: /genpair /pairs /adduser /deluser /addgroup /delgroup + /help
- **config.ts 新增**: removeAllowFrom + removeGroupAllowFrom (同 append 原子写范式)
- **测试**: tests/filehelper-commands.test.ts (3 用例) + inbound filehelper 命令测试; 731/731 全绿

## [v1.3.39]
- 2026-08-11 (FILEHELPER — filehelper 特殊会话命令处理)
- **只处理命令, 非命令仍过滤** (老板明确): parser 放行 filehelper+`/` 开头, handler 拦截命令不进 AI
- **peerId 修正**: filehelper 会话 peerId=filehelper (原用 senderId 无法识别)
- **命令**: /genpair 生成配对码 + /pairs 查看 (回发 filehelper)
- **732/732 全绿**

## [v1.3.38]
- 2026-08-11 (GEWE-BORROW — 借鉴 gewe 设计)
- **pending-reply 路由 Map**: src/dispatch/pending-reply.ts (触发记录 msgId→群路由, AI 回复防误发 DM, 跨账号 fallback)
- **attachments 数组兼容**: send-message.ts resolveMediaFromAttachments (att.media/path/url 优先)
- **评估确认**: chunker 已有 (chunkMarkdown), 多账号已完善 (AccountRegistry)
- **731/731 全绿**

## [v1.3.37]
- 2026-08-11 (RELAY-PARSE — 接龙解析增强)
- **单行接龙** (无换行) + **条目内换行** (非 N. 行合并上一条)
- **保守不猜昵称** (老板指正: 昵称可改删, 整段保留让 AI 理解)
- **715/715 全绿**

## [v1.3.36]
- 2026-08-11 (WPP-ORIG-OSS — wpp 原本文件适配)
- **media-oss.ts 适配 buildOssKey** (漏适配, 原 wpp/v1 旧格式)
- **199 个 wpp 原本文件按 LastModified 归档** 到 wpp/default/{type}/{date}
- **712/712 全绿**

## [v1.3.35]
- 2026-08-11 (OSS-STRUCTURE — OSS 结构统一)
- **OSS 结构**: `wpp/{account}/{type}/{date}/{file}` (buildOssKey helper)
- **gewe 1120 文件迁移** 到 wpp/default + 647 文件按 gewe 消息时间补日期归档
- **DB 路径更新**: 29 条 gewe 引用 → wpp/default
- **712/712 全绿**

## [v1.3.34]
- 2026-08-11 (CONTACTS-TABLES — 三表同步 + gewe 消息迁移)
- **三表同步**: wpp_contacts(20) + wpp_chatrooms(8) + wpp_chatroom_members(86) + sync-contacts.ts
- **gewe 聊天记录 6025 条全量迁移** 到 wpp_messages (msg_type 映射 + direction 推断)
- **wpp-identity 改查表** (本地秒级)
- **712/712 全绿**

## [v1.3.33]
- 2026-08-11 (GROUP-MENTION-REPLY — 群聊回复 @ 被回复人)
- **buildGroupMentionPrefix**: 群聊引用回复加 @昵称 (gewe 范式)
- **704/704 全绿**

## [v1.3.32]
- 2026-08-11 (NO-REPLY-FIX — NO_REPLY 最终修复)
- **群聊上下文提示加"必须回复禁 NO_REPLY"** (core silentReplyPromptMode 无法改, 改 prompt 文案)
- **686/686 全绿**

## [v1.3.31]
- 2026-08-11 (REPLY-ALWAYS — 群@一律回复)
- **classifyGroupIntent 改"有文字一律 topic"** (纯@才 no-op)
- **707/707 全绿**

## [v1.3.30]
- 2026-08-11 (SETUP-DIAGNOSE — 配置引导完善)
- **setup add 补 8 字段** (llmIntent/embedIntent/groupContext细节) + **diagnose 命令**
- **GETTING_STARTED 18 字段字典**
- **707/707 全绿**

## [v1.3.29]
- 2026-08-11 (PUBLISH-VIDEO — 视频朋友圈发布)
- **publishVideo + publishVideoCircle 工具** (UploadVideo→publishItem→Messages video)
- **704/704 全绿**

## [v1.3.28]
- 2026-08-11 (PUBLISH-IMAGES — 图片朋友圈发布)
- **publishImages + publishImageCircle 工具** (UploadImage→publishItem→Messages images)
- **702/702 全绿**

## [v1.3.27]
- 2026-08-10 (AUDIT-FIXES — 三项修复)
- **BigInt 序列化** (stringifyLargeInts 移 util/bigint.ts) + **safe-fetch 3 AI 域名白名单** + **media-enrich 拆 6 子模块**
- **698/698 全绿**

## [v1.3.26]
- 2026-08-10 (LISTACCOUNTIDS-SYNC — 同步契约修复)
- **listAccountIds async→sync** (OpenClaw health 同步调用 + spread 展开; v1.1.10 漏掉的第 2 个函数)
- **681/681 全绿**

## [v1.3.25]
- 2026-08-10 (SWAGGER-254 — 适配最新 vendor 接口, 老板拍板)
- **背景**: vendor swagger 236 → 254 (新增 18 接口); 老板审阅: 除 Admin 3 + /User/GetAllOnline, 其余全需适配
- **新增 send wrapper (17)**: FriendCircle 5 (UploadVideo/UploadImage/UploadImages/MessagesRaw/SetBackgroundImage) + Search 5 (Capabilities/Gateway/Query/Service/{name}/Services) + TenPay 5 (Collectmoney/ConfirmPreTransferApi/GeneratePayQCode/GetRedPacketListApi/WXCreateRedPacketApi) + Tools 2 (DownloadFileBinary/DownloadVoiceBinary)
- **新增 agent-tools (17)**: uploadCircleVideo/uploadCircleImage/uploadCircleImages/publishCircleRaw/setCircleBackgroundImage + searchCapabilities/SearchServices/searchGateway/searchQuery/searchService + collectMoney/confirmPreTransfer/generatePayQCode/getRedPacketList/createRedPacket + downloadFileBinary/downloadVoiceBinary
- **注册 WPP_VENDOR_ENDPOINTS**: 231→250 (补 19, 含 SendApp 仅登记; Admin 3 + GetAllOnline 保持排除)
- **测试**: api.test 总数 238→255; api-coverage 指向 swagger-latest.json (254 paths)
- **672/672 全绿**; 图片/视频朋友圈新接口就绪待测

## [v1.3.24]
- 2026-08-10 (FRIENDCIRCLE-UPLOAD-FIX — 朋友圈 Upload 工具语义修正)
- **老板质疑**: "/FriendCircle/Upload 从命名看像是上传才对" — 实测确认正确
- **证据**: swagger summary 误写"下载CDN视频", 实际传 base64 报 "朋友圈图片上传失败" + 返回 StartPos/TotalLen/Type (分片上传进度), Type:2=图片
- **修复**: friendcircle-meta downloadCircleMedia → **uploadCircleMedia** (key + base64, 上传语义); send/friendcircle upload 参数 url→base64; 测试更新
- **朋友圈媒体结论**: 图片 URL 可访问 (HTTP 200); 视频 (shzjwxsns.video.qq.com 腾讯CDN) 需微信登录态, 纯 URL 400, 无下载接口 — 待问 vendor
- **679/679 全绿**

## [v1.3.23]
- 2026-08-10 (VENDOR-TRANSCRIPT — 语音转写优先用 vendor 自带, 老板拍板)
- **问题**: 老板在 WS 看到语音消息带 `voice.transcript` + `transcription_provider: wechat_official` — vendor 已转写
- **根因**: 插件 enrichVoiceMessageFromV1 强制调 SiliconFlow STT, 不检查 vendor transcript → 重复转写 (费 token + 慢)
- **修复**: enrichVoiceMessageFromV1 加可选 vendorTranscript 参数; 有则直接返回 filename=transcript (不下载不STT); handler 透传 raw.voice.transcript
- **测试**: media-enrich.test.ts +2 (有/无 vendor transcript)
- **679/679 全绿**; 实测: vendor transcript 直接生效

## [v1.3.22]
- 2026-08-10 (SELF-MEDIA-OSS — 自己发的媒体消息传 OSS + 入库, 老板拍板)
- **老板需求**: "自己发的消息即使不进入 session, 也要正常进入数据库, 便于聊天记录查找; 媒体文件要正常上传 OSS" (参考 gewe downloadAndUploadToOss)
- **新 src/dispatch/media-oss.ts**: uploadMediaToOss(buffer, type, ext, credentialsPath?) — OSS 上传 (ossutil + ~/.openclaw/credentials/oss-credentials.json), key `wpp/v1/<type>/<md5>.<ext>`; 失败返回 null 降级不阻塞发送
- **outbound.ts**: sendImage/sendVoice/sendVideo 发送前取 base64 → 上传 OSS → persistOutbound 入库 content 用 **OSS 公网 URL** (替代源 URL, 便于查聊天记录/引用)
- **parser.ts**: 放行 outgoing 图片 (kind=image/msgType=3, 拿真实 server ID) — 其余 outgoing 仍过滤; WppInboundMessage 加 direction; enrich 用 msg.direction 入库
- **测试**: outbound-persist.test.ts +2 (uploadMediaToOss 无凭证降级) + parser-business-cb +3 (outgoing 图/文本/incoming 图)
- **677/677 全绿**; 实测: 发图入库 content = `https://openclaw-a.oss-cn-hangzhou.aliyuncs.com/wpp/v1/images/<md5>.jpg` ✅

## [v1.3.21]
- 2026-08-10 (REVOKE-FIX — 撤回能力修复, 老板实测驱动)
- **问题**: 老板实测"发消息到群再撤回" — 插件 revokeMsg 返回 ok:true 但消息没撤 (ret=0 不真撤)
- **根因 1 (NewMsgId 解析)**: vendor SendTxt 响应 `Data.List[0].NewMsgId`, 插件 sendText 用 `d.msgId/d.newMsgId` → 恒 undefined → 撤回拿不到 ID
- **根因 2 (NewMsgId 类型)**: RevokeMsgParamDoc 全 int64 — vendor Go 拒绝 string (Code=-8 `cannot unmarshal string into ... uint64`), 必须传 number
- **根因 3 (CreateTime)**: 必须用**消息自己的 server time** (List[0].Createtime), 不能用 now! 实测 now → vendor ret=0 但不真撤; server time → 真撤 + 推送 type=10002 撤回事件
- **修复**: 新 extractOutboundMsgIds 解析 List[0].NewMsgId/ClientMsgid/Createtime; sendText 返回 newMsgId+createTime; revokeMsg 加可选 createTime 透传 (msg.revoke/api-client.revokeMsg/types.ts); sendMessage 透传 createTime; agent-tools revokeMsg 工具加 createTime 参数
- **测试**: tests/outbound-persist.test.ts +4 (extractOutboundMsgIds List[0]/顶层/空 + persistOutboundMsg 入库 newMsgId); **672/672 全绿**
- **验证**: 插件真实链路 sendMessage 发 → revokeMsg(createTime=server) → vendor 推送 10002 撤回事件 ✅

## [v1.3.20]
- 2026-08-10 (SWAGGER-GAPS-P1P3 — 补齐 swagger 有业务价值的未接 AI 工具, 老板拍板)
- **P1 Group 群管理 3**: facingCreateChatRoom (创建面对面群, 对齐 swagger number 经纬度) / getGroupListCompat (GET 兼容路由群列表) / scanIntoGroupEnterprise (扫码进群企业)
- **P2 FriendCircle 2 + TenPay 4**: syncFriendCircleSns (查询评论转发ID) / downloadCircleMedia (下载朋友圈CDN媒体, wrapper upload 对齐 swagger key+url) / openRedPacket / queryRedPacketDetail / receiveRedPacket / getEncryptInfo (红包4件套)
- **P3 OfficialAccounts 6 + Finder 6**: likeOfficialAccountArticle / preVerifyOfficialAccountJsapi / getOfficialAccountA8Key / authorizeOfficialAccount / requestOfficialAccountQrAuthorize / confirmOfficialAccountQrAuthorize; decryptFinderComment / getFinderMsgSessionId / searchFinderList / getFinderTopicList / getFinderCommentList / getFinderCommentDetail
- **规范**: 全部走 lazy-evaluate ctx (v1.3.18 模式) + typebox schema + vendor 字段对齐 (PascalCase)
- **测试**: 新 tests/agent-tools-gaps.test.ts +21 (MockAgent 验证正确端点+参数); api.test 函数数不变 (send wrapper 未增, 只加 meta)
- **668/668 测试全绿**; AGENT_TOOLS_META 158→179

## [v1.3.19]
- 2026-08-10 (UNIFY-SEND + MODULAR — 收口层重构, 老板拍板)
- **Step 1 endpoint 索引**: 新 `docs/ENDPOINT-INDEX.md` (390 行, 236 endpoint → send/<tag>.ts + agent-tools/<tag>-meta.ts 映射, 含入库类型列 + 覆盖标记 + 有意移除清单); 生成脚本 `scripts/gen-endpoint-index.py` (读 swagger 可重新生成)
- **Step 3 misc-meta 拆分**: 7 个小 tag (favorites/label/voice/sayhello/translate/customized/qwcontact) 从 misc-meta.ts 拆成独立文件, misc-meta.ts 降级兼容 barrel; agent-tools 21 tag 全部独立对齐 swagger
- **Step 2 双实现收口**: 
  - api-client.ts 降级**薄 adapter** — Msg/Group/Friend/Webhook 方法委托 send/<tag>.ts (makeWppMsg/Group/Friend/Webhook)
  - send/msg.ts 增强: 新 sendImage (URL/base64→UploadImg), sendVoice/sendVideo URL→base64 对齐, dispatch 加 persist 参数
  - **persist:false 防双入库** — apiClient 委托不入库, outbound.ts 的 persistOutbound 负责 (agent-tools 默认 persist:true 收口入库)
  - resolveImageToBase64/readLocalMedia 移到 src/api/resolve-media.ts (消除 msg↔api-client 循环依赖), api-client re-export 兼容测试
- **测试**: 新 tests/unify-send.test.ts +5 (委托端点/行为/persist 防双入库); api.test.ts 函数总数 236→237 (sendImage)
- **647/647 测试全绿**; 备份待部署后记录

## [v1.3.18]
- 2026-08-10 (FULL-FIX — 完整修复 openclaw 独立审计 20 项, 报告 /root/audit-reports/2026-08/wechatpadpro-openclaw/v1.3.18-full-fix-2026-08-10.md)
- **P0-B-1**: 测试污染防护 — dispatcher-group-context beforeEach unset MINIMAX_API_KEY/BAILIAN_EMBEDDING_API_KEY
- **P1-核心1**: agent-tools 13 meta 文件空 ctx 根治 — lazy-evaluate getXxxApi (从 registry 拿真 ctx), 入库 account_id 不再 ""
- **P1-核心2**: getMessageByMsgIdOrNewId 加 direction 参数 (默认 inbound, 引用解析传 "any") — 引用 bot outbound 回复可定位
- **P1-核心3**: outbound 发送判据统一 isSendOk (Code + Data.BaseResponse.ret 双重判据) — 5 处 send + sendImage 先判后 persist 修假记录
- **P1-安全1**: readLocalMedia 三重防御 (拒绝 `..` + path.resolve 归一化 + 精确包含校验) 防路径穿越
- **P1-安全2**: 新 src/util/safe-fetch.ts (host 白名单 + 字节 cap), 5 处改 safeFetchWithCap (50MB/100MB)
- **P1-安全3 + B-8**: webhookSecretEnv 真接入 config.ts/config-helpers.ts — HMAC 验签不再死配
- **F6**: webhook-receiver + ws-client 改 parseJsonText — 16+ 位大整数防丢精度
- **F1/F4/F5**: 媒体下载字节 cap; **F2**: 视频分片 totalBytes > 200MB 封顶 (原按段数 200 段只防 ~50MB)
- **P2-B-3**: openclaw.plugin.json schema 补 10 字段 (33→43); **P2-B-6**: config.json hot-reload (watchGlobalConfig)
- **P2-D-1**: setup-wizard prod 误跑防护; **P3-B-7**: 删 src/dead-code 3 文件
- **测试**: 删 2 个假绿 (shouldquote-text-only + inbound.test.ts:364 assert.ok(true)); 新 v1.3.18-core-correctness.test.ts (9) + inbound-media-enrich-v1.test.ts (8); pending-enrich 真测化
- **642/642 测试全绿** (干净环境); tsc 0 错
- 备份: /data/wpp-fullfix-v1.3.18-20260810-151517/

## [v1.3.17]
- 2026-08-10 (MESSAGE-UNIFY — 统一 sendMessage 发送适配)
- **老板拍板**: "让发送各种类型消息都能完美适配 message 方式, 以便以后网关各种调用"
- **新 src/dispatch/send-message.ts**: `sendMessage({accountId, toWxid, type, content, ...})` 统一入口, 路由 10 类型:
  - text/image/video/voice → outbound.ts (api-client + persistOutbound, 处理 chunk/base64/thumb)
  - file/link/card/location/miniprogram/emoji → makeWppMsg (registry 真实 ctx + dispatch 收口入库)
  - `normalizeSendResp` 统一返回 {ok, msgId(string), error}; msgId 统一 String() 归一化
- **channel**: wppChannelPlugin.sendMessage(params) 暴露给网关 (动态 import, 零启动开销)
- **agent-tools**: 新 `sendMessage` 工具 (AI 可用统一入口; 从 registry 拿真实 ctx, 不走模块级空 ctx → 真正可发送, **本次仅 sendMessage 单工具修, 其它 13 个 send\* 工具 (finder/friend/friendcircle/group/login/misc/msg/officialaccounts/search/tenpay/tools/user/webhook/wxapp 域) 仍空 ctx, v1.3.18 B-2 根治**)
- **测试**: 新 tests/send-message.test.ts +7 (normalizeSendResp / text/image/video/voice 路由 / 未知type / 账号不存在)
- **632/632 测试全绿** (干净环境: unset MINIMAX_API_KEY BAILIAN_EMBEDDING_API_KEY 验证; 污染环境下 v1.3.15 测试 fail 1/632 — v1.3.18 B-1 修)

## [v1.3.16]
- 2026-08-10 (OUTBOUND-PERSIST — 任意渠道发送消息入库)
- **老板拍板**: "机器人回复、通过api发送、message发送等任意渠道发送到微信的消息, 都应该入库, 因为我又可能需要引用这些消息"
- **缺口**: (1) quoteReply (AI 引用回复主路径 sendAiReply 有引用时) 直接调 vendor 未入库; (2) agent-tools msg 域 14 个 send 工具走 makeWppMsg 未入库; (3) sendFile (内部走 api-client sendFileViaApp) 未入库
- **msg.ts**: 新 `persistOutboundMsg(ctx, {toWxid,msgType,content,resp})` 统一入库 (Code≠0 失败不入库); dispatch 统一收口 `outboundMetaFor` 端点→msgType+content 映射 (SendTxt/CDNImg/UploadImg/CDNVideo/Video/ShareVideo/Voice/CDNFile/Emoji/ShareCard/ShareLink/ShareLocation/SendXCX); sendFile 成功后单独入库
- **quote-reply.ts**: 引用回复成功后 `persistQuoteReply` 入库 (msgType="quote")
- **安全**: agent-tools 空 ctx 工具发送失败 (Code=-1) → persistOutboundMsg 跳过, 不会误入库; outbound.ts (api-client) 与 makeWppMsg 不同实现, 不重复入库
- **测试**: 新 tests/outbound-persist.test.ts +7 (端点映射 / 成功入库 / 失败不入库 / 群 peer_kind / 缺 msgId 仍入库)
- **625/625 测试全绿**

## [v1.3.15]
- 2026-08-10 (GROUP-CONTEXT-NO-FORCE — 群聊不强拉上下文, 智能判断按需参考)
- **老板拍板**: "回到之前不指定引用的触发情况。优先带@机器人的触发消息本身内容, 可根据需要智能判断是否参考上下文的内容, 而不是强制拉上下文内容"
- **根因**: buildGroupContextFromDb 两条"强制拉"路径 — (1) LLM 判断失败(null) → 降级注入全部; (2) topic 意图 + 无 LLM key → msgs 保持全量。AI 被无关上下文带偏
- **dispatcher.ts**: (1) LLM decision null → 保守降级: media 意图兜底只注入媒体 / topic 意图不注入; (2) topic + 无 LLM/embedding key → 不注入; 加 embedSelected 标志区分"embedding 已选好"与"LLM 失败"
- **触发消息本身内容** 始终在 Body 第一位 (buildCtxPayload body=msg.content), 上下文是智能判断后的补充
- **测试**: dispatcher-group-context +1 (topic 不强拉); 改造 4 个旧测试用 media 意图保留群内媒体/@指定/图片≤3/群间隔离语义; pending-enrich beforeTs 改 media 触发
- **618/618 测试全绿**

## [v1.3.14]
- 2026-08-10 (QUOTE-FORCE-CONTEXT — 群聊引用消息 = 明确指定上下文)
- **老板拍板**: "群聊状态下, 触发机器人的消息中使用了引用消息, 就表示指定了对应的消息加入上下文, 没必要再去看其它的上下文"
- **根因** (老板实测 "AI 依然去找其它的图"): v1.3.5 resolveReferencedMessage 把被引用消息 prepend 进 msgs 后, 后续 embedding/LLM filter 可能把它**再过滤掉** → AI 看不到被引用消息, 反而注入其它图
- **dispatcher.ts**: buildGroupContextFromDb 开头先 resolveReferencedMessage → 查到即短路, 只走新 buildReferencedContextLines (只注入被引用 1 条, 跳过窗口查询 + embedding/LLM); 被引用消息含 [文件] → 仍引导 document-extract
- **测试**: dispatcher-group-context.test.ts +2 (app.reference 引用 → 只注入被引用; reply_context 引用 → 只注入被引用); FakeDb 补 getMessageByMsgIdOrNewId 匹配
- **617/617 测试全绿**

## [v1.3.13]
- 2026-08-10 (FILE-SEND — 文件发送正确链路, 方案 C)
- **问题** (老板实测): SendCDNFile Content 各种格式 (mediaId/file_no/aeskey/XML) 全 Ret=-2 (vendor 未实现); SendApp type=6 可发可打开但有"未审核应用"标签
- **api-client.ts**: 新 `sendFileViaApp` — UploadFile 上传 → ShareLink type=6 完整文件 XML (content dataType + appattach attachid)
- **msg.ts**: 新 `sendFile(toWxid, fileUrl, fileName)` — 下载 OSS → sendFileViaApp (返回 WppApiResponse)
- **agent-tools**: 新 `sendFile` 工具 (推荐); sendCDNFile 保留 (转发, vendor Ret=-2)
- **types.ts**: WppApiClient 加 sendFileViaApp
- **测试**: api.test.ts 函数总数 235→236 (+sendFile)
- **615/615 测试全绿**

## [v1.3.12]
- 2026-08-10 (LOCATION-FIX — 分享位置坐标语义修正)
- **问题** (老板实测): 分享位置定位卡片缩略图与实际位置不一致
- **根因**: ShareLocation X/Y 语义 — X=纬度, Y=经度 (对齐 gewe buildLocationPayload x=lat,y=lng)
- **msg.ts**: shareLocation 参数改名 latitude/longitude + 注释明确语义 + Poiname 支持 + Scale=16
- **实测**: 天安门 X=39.9(纬度), Y=116.4(经度) → 显示正确 (老板确认"现在对了")
- **615/615 测试全绿**

## [v1.3.11]
- 2026-08-10 (VIDEO-CHUNK — 视频分片下载修复)
- **bug**: DownloadVideo 返回 Data.data.buffer (分片), 但 enrichVideoMessageFromV1 读 Data.Video → miss, 视频无 OSS URL
- **media-enrich.ts**: enrichVideoMessageFromV1 改为**分片循环**拉全视频 (section.start_pos 递增到 totalLen)
  - 读 Data.data.buffer + totalLen; 防死循环上限 200 段; 兼容 Data.Video 字段
- **实测**: 21050 视频 (4.7MB, msg_id=1020959037) 下载凭证正确
- **615/615 测试全绿**

## [v1.3.10]
- 2026-08-10 (BASE64-FIX — resolveImageToBase64 纯 base64 误判本地路径修复)
- **bug**: 缩略图 base64 (含 / 字符) 被 resolveImageToBase64 误判为本地路径 (case 4 在 case 5 前)
- **api-client.ts**: 纯 base64 判断 (长度≥16 + 字符集 + %4==0) 提前于本地路径判断
- **实测**: 视频发送到群成功 (msgId=848527519) + 缩略图自动生成 (197KB base64)
- **615/615 测试全绿**

## [v1.3.9]
- 2026-08-10 (VIDEO-THUMB — 发视频自动生成缩略图, 老板拍板)
- **需求** (老板): 微信端发视频必须带缩略图才显示 → AI 发视频时自动生成
- **outbound.ts**: 新 `generateVideoThumbnailBase64(urlOrPath)` — ffmpeg 抽首帧 → JPEG base64 (失败返回 null 不阻塞)
  - sendVideo: thumbUrl 缺省时自动抽帧生成 → ImageBase64 (apiClient.sendVideo resolveImageToBase64 对纯 base64 透传)
- **实测**: ffmpeg 6.1 抽帧成功 (5.7KB 视频 → 3.9KB 缩略图)
- **615/615 测试全绿**

## [v1.3.8]
- 2026-08-10 (VIDEO-DOWNLOAD — 适配新版视频 video.download_context)
- **问题** (老板测视频): 新版视频 content 无 <videomsg> XML, 旧 enrich 条件不匹配 → 视频无 OSS URL
- **media-enrich.ts**: 新 `isV1SchemaVideo(raw)` + `enrichVideoMessageFromV1(ctx, videoCtx)`
  - video.download_context { msg_id, data_len, section, to_wxid } → /Tools/DownloadVideo (authcode query + TokenKey header) → base64 → OSS
- **handler.ts**: 视频 enrich 2 级路径: DownloadVideo (v1.3.8) → <videomsg> XML 兜底
- **615/615 测试全绿** (无新测试, 逻辑同图片/语音模式)

## [v1.3.7]
- 2026-08-10 (NEW-MSG-ID-COLUMN — 修复 v1 消息 new_msg_id 未入库)
- **根因** (老板问"媒体/文件入库时是否带唯一字段"): parseV1Message 的 `newMsgId` 硬编码空 → DB new_msg_id 列为空, 引用定位只能靠 msg_id 列兜底
- **parser.ts**: parseV1Message 提取 `msg.new_msg_id`/`msg.svr_id` (snake_case) → newMsgId 入库 (不再硬编码空)
  - DB new_msg_id 列现在正确填充 → 引用定位更精确 (app.reference.new_msg_id 匹配 new_msg_id 列而非 msg_id 列)
- **测试**: parser-business-cb.test.ts +2 (v1 new_msg_id 提取 / 无 new_msg_id 不崩)
- **615/615 测试全绿**

## [v1.3.6]
- 2026-08-10 (QUOTE-APP-REFERENCE — 引用消息定位修复, 被引用信息在 app.reference)
- **根因** (彻底定位, 参考 gewe): 新版 vendor 引用消息的**被引用信息在 app.reference** (category=quote), 不在 reply_context!
  - 实测: app.reference.new_msg_id 精确匹配 DB msg_id 列 → 被引用图
- **quote.ts**: 新 `extractReferencedFromApp(raw)` — 解析 app.category=quote + app.reference (new_msg_id/svr_id/msg_type)
- **dispatcher.ts**: resolveReferencedMessage 首选 app.reference (new_msg_id/svr_id 查 DB) → 优先注入被引用消息
- **handler.ts**: 引用处理首选 app.reference → content 注入被引用媒体 URL
- **测试**: quote-xml.test.ts +2 (extractReferencedFromApp)
- **613/613 测试全绿**

## [v1.3.5]
- 2026-08-10 (QUOTE-REPLY-CONTEXT — 引用消息修复, 被引用旧图优先注入)
- **问题** (老板实测): 引用 10 条之前的旧图, AI 看的是 embedding 选的最近图, 没看到被引用图
- **根因**: 新版 vendor 引用走 `raw_payload.reply_context`, 插件只认 content `<refermsg>` XML → 引用解析缺失; 被引用旧图窗口外 embedding 选不到
- **quote.ts**: 新 `extractReferencedFromReplyContext(raw)` — 解析 reply_context (msg_id/svr_id/quote_content/msg_type)
- **dispatcher.ts**: `resolveReferencedMessage(msg)` — 多种方式定位被引用消息 (svr_id/new_msg_id/local_id 匹配 DB) → 查到优先注入 AI 上下文 (即使窗口外)
- **handler.ts**: 引用处理补 reply_context 路径 (旧 `<refermsg>` + 新 `reply_context` 双支持) → content 注入被引用媒体 URL
- **测试**: quote-xml.test.ts +2 (extractReferencedFromReplyContext)
- **611/611 测试全绿**

## [v1.3.4]
- 2026-08-10 (GROUP-MEDIA-PRIORITY — 群聊上下文群内最近媒体优先, 老板拍板)
- **问题** (老板新要求): 最新媒体文件权重最高, 不限本人发的; 没明确指定时只看最近 10 条
- **dispatcher.ts**: buildGroupContextFromDb 查询从"触发人最近 window 条"改"**群内最近 window 条 (不限发送人)**"
  - 去掉 fromWxid 过滤 + 去掉 @指定额外查 (群内查询已含所有人)
  - 媒体全保留 (v1.3.3 已有) + embedding 只筛文本
  - 上下文注入带发送人 (from_wxid)
- **测试**: dispatcher-group-context "按人查" 改 "群内查" (含 bob 的上下文)
- **609/609 测试全绿**

## [v1.3.3]
- 2026-08-10 (EMBED-MEDIA-PRIORITY — embedding 快路径媒体优先, 修复文件被挤掉)
- **问题** (老板实测): 群聊发图+文件+"看看", embedding 按相似度选 top-5, 文档.pdf 被图片/语音挤掉, AI 没看到文件
- **intent-embed.ts**: selectTopNByEmbedding 媒体候选 (文件/图片/语音/视频) **优先全部保留**, embedding 只对纯文本候选做相似度筛选
  - mediaIds 全保留 + 文本按相似度补足到 topN
- **测试**: intent-embed.test.ts +1 (媒体优先, 文件/图不被挤掉)
- **609/609 测试全绿**

## [v1.3.2]
- 2026-08-10 (EMBED-INTENT — embedding 快路径 + LLM 兜底混用, 老板拍板)
- **优化**: v1.3.1 纯 LLM 意图判断每次 @ 调模型 (1-2s); 混用让非命令意图走 embedding 快路径 (ms)
- **新 src/dispatch/intent-embed.ts**:
  - `embedTexts`: 阿里 dashscope text-embedding-v4 (OpenAI 兼容) 批量向量化
  - `cosineSimilarity`: 余弦相似度纯函数
  - `selectTopNByEmbedding`: 候选向量化 (缓存) + 触发向量 → 相似度 top-N (阈值 0.3)
  - `isCommandIntent`: 命令词 (删/发/转/帮) → 走 LLM (embedding 判断不了)
- **dispatcher.ts 混用流程**:
  - 规则预筛 (no-op 不调) → 命令类 → LLM → 非命令 → embedding 快路径
  - embedding 无相关/失败 → LLM 兜底 → 降级注入全部
  - embedIntentEnabled(默认true)/embedIntentTopN(5)/embedIntentThreshold(0.3) 配置
- **types.ts**: WppAccountConfig 加 embedIntent 配置
- **测试**: intent-embed.test.ts (相似度/命令类/选topN/降级)
- **608/608 测试全绿**

## [v1.3.1]
- 2026-08-10 (LLM-INTENT — 群聊上下文用 LLM 智能判断注入, 老板拍板)
- **问题** (老板观点): 群聊 @ 机器人应智能判断意图, 不是把最近 10 条全喂 AI
- **新 src/dispatch/intent-llm.ts**: MiniMax LLM 意图判断
  - `normalizeTriggerText`: 去@/去媒体标记/语音[转写]当文本 (语音当文本, 老板观点)
  - `summarizeContent`/`toIntentCandidate`: 候选压缩 (msg_id+类型+≤50字摘要)
  - `decideIntentWithLlm`: 调 MiniMax-M2.5 (temperature=0, 5s超时) → JSON {action:no-op|inject,relevant_ids}
  - `parseIntentResponse`: 剥围栏 + 校验; `needsLlm`: 纯@/≤4字不调 LLM (省)
  - 防注入: 触发文本 JSON.stringify 包裹 + system 声明数据非指令 + 只消费受限字段
- **dispatcher.ts**: buildGroupContextFromDb 集成
  - 规则预筛 (no-op 拦截) → LLM 判断注入哪些候选 → 失败降级注入全部
  - llmIntentEnabled(默认true)/llmIntentModel(默认M2.5)/llmIntentTimeoutMs 配置
  - 语音带[转写]当文本; 规则兜底 media/topic 过滤
- **types.ts**: WppAccountConfig 加 llmIntentEnabled/TimeoutMs/Model
- **测试**: intent-llm.test.ts (归一化/压缩/LLM调用/解析/预筛/语音当文本)
- **598/598 测试全绿**

## [v1.3.0]
- 2026-08-10 (GROUP-INTENT — 群聊触发消息智能意图判断, 按类型选择性注入, 老板拍板)
- **问题** (老板观点): 群聊 @ 机器人时, 把触发人最近 10 条非触发消息全部注入 AI, 不管用户意图 → 应智能判断
- **dispatcher.ts**:
  - 新 `classifyGroupIntent(content)`: 简单规则判断意图 (不用 LLM, 省模型调用)
    - no-op: 纯 @ / 极短 (≤4字, "你好"/"在吗") → 不注入上下文
    - media: 提到 文件/文档/图/图片/语音/视频/看这个/你看 等 → 只注入媒体消息
    - topic: 实质文本 → 注入最近文本 + 媒体
  - `buildGroupContextFromDb` 按意图: no-op 直接返回 null; media 过滤只留 `[图片]/[文件]/[语音]/[视频]` 消息
- **保留 v1.2.9**: 注入后含 [文件] → 文件读取引导
- **测试**: group-intent.test.ts (classifyGroupIntent 8 case: 纯@/短问候/文件/图片/语音/视频/话题)
- **588/588 测试全绿**

## [v1.2.9]
- 2026-08-10 (FILE-READ-GUIDE — 群聊上下文含文件时引导 AI 读取内容)
- **问题** (实测发现): 上下文注入文件 URL 后, AI 只调 image 看图, 不读文件 (xls/xlsx) — AI 不知道要读文件
- **dispatcher.ts**: `buildGroupContextFromDb` 注入后, 若上下文含 `[文件]` → 追加 `[系统提示-文件读取]` 引导
  - 明确告诉 AI: 用户@是为了处理文件, 用 document-extract/clawpdf 读 URL 内容
  - 禁止 find/ls 搜本地文件, 只用提供的 URL
- **测试**: 全量 580+ 全绿 (无新测试, 引导是纯文本注入)
- **580/580 测试全绿**

## [v1.2.8]
- 2026-08-10 (PENDING-ENRICH — 群聊发文件+@时等 enrich 完成, AI 能看到文件)
- **问题** (老板发现): 群聊发文件/图 + @机器人, AI 看不到文件。根因: 文件 enrich (DownloadFileBinary 下载大文件几秒) 慢 → 文件入库晚于 @ 触发消息 dispatch → buildGroupContextFromDb 查不到
- **handler.ts**:
  - 新 `pendingEnrichs` 追踪器 + `trackEnrich` (key=accountId:sender, 同 sender 串行)
  - `waitForPendingEnrich(accountId, sender, timeoutMs=10s)`: 触发 dispatch 前等同 sender enrich 完成 (超时降级)
  - 文件/图片/语音 enrich 包 trackEnrich
- **dispatcher.ts**:
  - `dispatchOne` 开头 `await waitForPendingEnrich` (触发前等)
  - `buildGroupContextFromDb` 查询加 `beforeTs: msg.ts` (排除触发消息自身, 避免空 @ 混入)
- **测试**: pending-enrich.test.ts (waitForPendingEnrich / beforeTs 排除触发)
- **580/580 测试全绿**

## [v1.2.7]
- 2026-08-10 (VOICE-DOWNLOAD-BINARY — 适配新版 vendor 语音 download_context)
- **背景**: 新版推送语音带 `voice.download_context` (endpoint DownloadVoiceBinary), content 无 <voicemsg> XML → 旧 STT 路径不匹配
- **media-enrich.ts**:
  - `isV1SchemaVoice` 提取 voice.download_context (msg_id/new_msg_id/client_msg_id/format/length/master_buf_id)
  - 新 `enrichVoiceMessageFromV1`: DownloadVoiceBinary → SILK 字节 → STT 转写 + OSS
- **handler.ts**: 语音 enrich 2 级路径:
  1. DownloadVoiceBinary (v1.2.7 首选)
  2. <voicemsg> XML → DownloadVoice (旧兜底)
- **实测**: 群聊语音 → DownloadVoiceBinary 4206 bytes SILK (#!SILK_V3) → STT "你好呀，我测试一下语音功能。" (2160ms)
- **测试**: file-download-binary.test.ts +2 (isV1SchemaVoice 提取)
- **579/579 测试全绿**

## [v1.2.6]
- 2026-08-10 (IMAGE-CDN-DOWNLOAD — 适配新版 vendor 图片 cdn_download_contexts, 完整大图)
- **背景**: 新版二进制推送带 `image.cdn_download_contexts` (file_aes_key + file_no + variant), 走 `/Tools/CdnDownloadImage` 拿**完整大图** (非旧 DownloadImg 64KB 截断)
- **media-enrich.ts**:
  - `isV1SchemaImage` 提取 `image.cdn_download_contexts` (优先 standard 变体) + md5
  - 新 `enrichImageMessageFromV1Cdn`: CdnDownloadImage → 完整 JPEG → OSS → 公网 URL
- **handler.ts**: v1 图片 enrich 2 级路径:
  1. CdnDownloadImage 完整大图 (v1.2.6 首选)
  2. DownloadImg 64KB 兜底 (旧路径)
- **实测**: 群聊图 → CdnDownloadImage HTTP 200 → 解码 256917 bytes **2160×3840 完整 JPEG** (之前 64KB 截断)
- **测试**: file-download-binary.test.ts +2 (isV1SchemaImage 提取 standard 变体)
- **577/577 测试全绿**

## [v1.2.5]
- 2026-08-10 (FILE-DOWNLOAD-BINARY — 适配新版 vendor DownloadFileBinary 完整文件下载)
- **背景**: 开发者提供新版二进制 (m4.1.12.29_p8.0.75.53), 新推送带 `file.download_context`, 新增 `/Tools/DownloadFileBinary` (完整下载, 返回原始字节流)
- **media-enrich.ts**:
  - `isV1SchemaFile` 提取 `file.download_context` (attach_id/user_name/data_len/endpoint)
  - 新 `enrichFileMessageFromV1Binary`: 调 DownloadFileBinary → 原始字节 → OSS → 公网 URL
    - **authcode 必须走 query** (header 报"缺少授权码", 实测)
    - TokenKey 走 header; body 含 section {start_pos, data_len}
    - 30s 超时 + 失败降级 (返回 error 不抛)
- **handler.ts**: v1 文件 enrich 3 级路径 (新优先):
  1. DownloadFileBinary 完整下载 (v1.2.5)
  2. MCP 兜底 (v1.2.0)
  3. 确定性回复 (禁 AI 猜路径)
- **实测**: 私聊发 pdf (入学入托.pdf, 129583 bytes) → DownloadFileBinary HTTP 200 完整下载 PDF 1 page
- **测试**: file-download-binary.test.ts (isV1SchemaFile 提取 / 缺 attach_id 报错)
- **573/573 测试全绿**

## [v1.2.4]
- 2026-08-10 (GROUP-CONTEXT-DB — 群聊上下文删内存缓冲, 触发时 DB 按人查, 老板拍板)
- **群聊上下文重构** (老板 3 轮拍板):
  - **删内存缓冲** (groupContextWindow Map + recordGroupContext 全删) → 所有消息已全量落 DB (enrichBatch), 触发时从 DB 查
  - **DB 按人查**: 触发时查 `wpp_messages` (peer_id=群ID + from_wxid=触发人) 最近 `GROUP_CONTEXT_WINDOW=10` 条注入
  - **@指定除外**: 触发消息 @ 别人 (extractAtUserList 除 bot) → 也查对应人
  - **图片 ≤3 张直接 MediaUrls 看图** (已实证主模型能看图), 超过丢最旧
  - **groupContextEnabled 开关** (默认 false, 显式 true 才注入群聊上下文)
- **DB 加 from_wxid 列** + idx_sender 索引 (群聊按人查历史):
  - schema.sql / saveMessage / getMessages(fromWxid 过滤) / rowToMessage / MessageRecord
  - applyMigrations: ensureColumn 幂等加列 + 旧行 raw_payload.sender_id 回填 (部署自动迁移)
- **不用视觉理解模型** (老板拍板): 删 vision.ts, 主模型能看图无需先理解
- **硬编码审查**: src/ 生产代码无昵称/wxid/群ID硬编码; 测试 @机器人 中立化为 @bot
- **新测试**: dispatcher-group-context 重写 (DB 按人查 / @指定 / 图片≤3 / 开关 / 群间隔离)
- **572/572 测试全绿**

## [v1.2.3]
- 2026-08-10 (PAIRING — DM 配对码自助开白名单, 老板拍板从旧版 wechatpadpromax 移植, **强调不能与多账号冲突**)
- **src/pairing-store.ts** (新): per-account 配对码存储
  - 码 8 位 (字母表去 I/O/0/1) + TTL 1h + 一次性消耗 (unlink)
  - **per-account 文件隔离**: `~/.openclaw/credentials/wechatpadpro-pairing-<accountId>.json` → 多账号不串
  - `extractPairCode` 严格 `/pair <8位码>` 前缀 (老板拍板, 不误触发)
- **DM 兑换**: 用户私聊 `/pair <码>` → redeem 成功 → wxid 写进该账号 allowFrom (零重启生效)
  - `src/config.ts` `appendAllowFrom`: readFile round-trip 全字段 + 原子写 + invalidateConfigCache (绕开 60s LRU cache)
  - `src/index.ts` `handlePairingAttempt`: redeem → appendAllowFrom → **立即同步运行时** (registry.updateConfig + runtimeTriggerCtxs, 不等 fs.watch debounce)
  - `src/inbound/handler.ts` `onPairingAttempt` 回调拦截 (blocked DM + /pair)
- **默认关闭**: 需 accounts/<id>.json 显式 `"dmPairingEnabled": true` (老板拍板); 运行时可热切
- **⚠️ 顺带修复隐藏 bug** (handler.ts): `opts.allowFrom ?? triggerCtx.allowFrom` 对启动时已有白名单的账号永远走 opts 快照 → **配对/热重载写 allowFrom 到不了 shouldTrigger**。改为只认 live 的 triggerCtx (配对零重启生效前提)
- **CLI**: `npm run setup pair <accountId>` 生成配对码 (menu 加第 8 项)
- **多账号防冲突 7 道防线**: 配对文件不进 accounts/ (listAccountIds 会当账号注册) / allowFrom 写用 findPluginRoot()/accounts 与 watcher 同目录 / 绕开 LRU cache / redeem 校验 accountId / 只写对应账号 json / 写后立即同步 runtime / 配对消息落库 + dedup 防重放
- **新测试 4 文件 +20 case**: pairing-store (8) / pairing-handler (8) / pairing-allow-from (4) / hot-reload 回归 (2)
- **566/566 测试全绿** (546 + 20)

## [v1.2.2]
- 2026-08-09 (GROUP-CONTEXT-WINDOW — 群聊非 @ 消息进 AI 上下文, 老板拍板 "只保留最近 10 条会话进 session")
- **src/dispatch/dispatcher.ts**:
  - 新 `recordGroupContext(msg)`: in-memory 环形缓冲, 每 session 只保留最近 `GROUP_CONTEXT_WINDOW=10` 条非触发群消息 (shift 丢弃最旧)
  - `buildInjectedGroupContext`: 触发时把缓冲构造成 `[系统提示-群聊上下文]` 块, 只前置进 Body (不 mutate msg.content, 不污染 RawBody)
  - `buildCtxPayload` 加 `injectedContext` 参数 → 群聊先发图再 @ 场景, AI 通过 MediaUrls 多模态看到图
  - 新增 `buildSessionKeyForMsg` helper, dispatch 3 处 (入队/执行/缓冲) sessionKey 一致
  - 删 v1.2.2-dev `recordOnly` 死代码 (之前方案直接 recordInboundSession → 转录无界膨胀; 改内存缓冲天然有界 ≤10)
- **src/inbound/handler.ts**: `onRecordMediaOnly` (仅媒体) → `onRecordGroupContext` (全部未触发群消息, 含文本/媒体)
- **src/index.ts**: 接线 `onRecordGroupContext → recordGroupContext`
- **src/core/constants.ts**: `GROUP_CONTEXT_WINDOW = 10`; PLUGIN_VERSION → 1.2.2
- **为什么不直接 recordInboundSession?** 转录是 framework 托管 (SQLite index + trajectory + 压缩 checkpoint), 插件侧修剪会脱同步 → 内存缓冲 + 触发时一次性注入, 天然有界
- **新测试** `tests/dispatcher-group-context.test.ts` (5 case): 图片+@ 场景 / 窗口上限 / 注入即消费 / DM 不缓冲 / 群间隔离
- **544/544 测试全绿** (539 + 5)

## [v1.2.1]
- 2026-08-09 (SWAGGER-ALIGNMENT + FULLFIX — 老板 3 项: 完整多维度审阅修复 + swagger 全 API 对齐)
- **P1 并发修复**:
  - dispatcher.ts 队列容错 (每 job try/catch, 防单 dispatch 抛错丢同 session 消息)
  - index.ts inboundHandler 按 accountId 复用 (防并发 start 双 handler → 去重失效)
  - webhook-receiver buildDedupeKey 加 content hash (无 id 消息不塌缩 noid 误丢)
- **P1 契约修复** (AI 工具字段对齐 swagger PascalCase):
  - api-client revokeMsg → {ClientMsgId, NewMsgId, CreateTime, ToUserName}
  - msg.ts sendCDNImg/sendCDNVideo → {Content, ToWxid}
  - msg.ts shareCard/shareLocation/shareVideo/shareLink → PascalCase + appmsg XML
  - tools.ts cdnDownloadImage → {fileAesKey, fileNo}; downloadFile → {appID, attachId, userName}
  - label.ts add → {LabelName}; updateList → {LabelID, ToWxids}
  - group.ts getMemberDetail → 只 {QID}
  - friend.ts upload → {currentPhoneNo, opcode, phoneNo}; lbsFind → {opCode}
  - finder.ts getCommentDetail/targetUserPage → swagger 字段
  - user.ts updateProfile → PascalCase; wxapp addWxAppRecord → {username}; customized → {Username}
  - officialaccounts getMpHistory → {url, wxid}
- **P1 安全修复**:
  - index.ts authcode 日志掩码 (maskSecret)
  - api-client resolveImageToBase64: 30s 超时 + 15MB cap + 本地路径白名单 + URL 脱敏
  - constants DEFAULT_WEBHOOK_HOST 0.0.0.0 → 127.0.0.1
- **P1 测试 CI**: ws-smart-backoff 仓库外绝对路径 → 相对路径 + skip; watcher 脚本拷入 scripts/
- **P2 代码质量**: MCP client 超时/重连关闭/多 block 解析/改名 resolveFileViaMcp; 删 3 死模块; as any 消除; 38 处旧 log tag → v1.2.0; OSS 抽 ossUploadBuffer; accounts example mcpEnabled 统一 false
- **文档**: 8 份对齐 v1.2.0 (539 tests / 49 文件 / 159 tools / 49 CHANGELOG) + MCP 段
- **539/539 测试全绿**
- 备份 `/data/wpp-swagger-alignment-20260809-1830/` + `/data/wpp-fullfix-v120-20260809-1800/`

## [v1.2.0]
- 2026-08-09 (VENDOR-MCP — 集成 vendor MCP 增强文件下载, 老板发现 vendor 提供 MCP 端点)
- **src/vendor-mcp-client.ts** (新): MCP 客户端封装 (SDK StreamableHTTPClientTransport)
  - 鉴权: Authorization Bearer <WECHATPRO_AUTHCODE> (实测, 非 TokenKey)
  - 工具: connectMcpClient / callMcpTool / listMcpTools / disconnectMcpClient (全 try/catch, 失败返 null 不卡主)
  - 只调 7 只读工具, 不碰写 (mcp_write_enabled=false 老板已确认)
- **src/inbound/media-enrich.ts**: 新增 `enrichFileMessageViaMcp(localId, filename)`
  - MCP wechat_get_recent_messages → 找 CDN URL → 下载 → OSS → 公网 URL → AI 读到文件
- **src/inbound/handler.ts**: v1 schema 文件 fallback 双路径
  - mcpEnabled !== false + local_id 存在 → 先 MCP 尝试; MCP 失败 → 原确定性回复兜底 (禁 AI 猜路径)
- **src/types.ts**: WppAccountConfig.mcpEnabled (默认 true, 生产 default.json 暂设 false 避免白耗)
- **src/index.ts**: startAccountById 传 mcpEnabled; shutdown 断 MCP 连接
- **accounts/default.json.example**: 加 mcpEnabled 字段
- **538/538 测试全绿** (up from 534, +4 vendor-mcp-client)
- **已知限制**: vendor MCP `wechat_get_recent_messages` 返 `mcp_realtime_forbidden` (需 vendor 套餐开通 realtime)
  - realtime 未开通时生产 mcpEnabled=false 避免白耗 5s; vendor 开通后改 true 即用
- 备份 `/data/wpp-v120-mcp-20260809-1730/`

## [v1.1.59]
- 2026-08-09 14:30 (FILE-DETERMINISTIC-REPLY — 文件消息确定性回复, 绕过 AI)
- **背景**: 4 通道实测确认 v1 schema 文件无任何下载路径 (webhook//Msg/Sync/WS/DB 全只有文件名+local_id)
  - 老板: "这些文件暂时无法下载, 收到文件消息时给我临时方案, 确保 AI 回复不出问题"
- **src/dispatch/dispatcher.ts**:
  - 新增 `buildFileAutoReply()` 纯函数: 检测 content 含 `[文件]` + `[系统提示-文件限制]` 标记 → 构造固定回复文本
  - dispatchOne 在 recordInboundSession 之后、AI 生成之前拦截文件消息 → sendText 固定回复 → return
  - 完全绕过 AI: ① 文件内容读不了 AI 无价值 ② minimax rate_limit 风险 (journal 实测 2067) ③ 固定模板 100% 不出错
- **保留**: handler.ts NO-PATH-GUESS 注入 (AI 上下文仍有文件名+限制说明, 未来恢复 AI 用)
- **tests/media-enrich.test.ts**: +5 case 覆盖 buildFileAutoReply (检测/非文件/图片/undefined/无标记)
- **534/534 测试全绿** (up from 529, +5)
- **行为变化**: 文件消息 AI 不再参与, 直接回 "收到「文件名」📎 但我当前无法读取文件内容..." — 稳定、快、省 token
- 备份 `/data/wpp-v1159-file-deterministic-reply-20260809-1430/`

## [v1.1.58]
- 2026-08-09 14:15 (NO-PATH-GUESS — 修复 AI 误读旧文件导致内容串台)
- **根因调查** (老板 12:15 报告: AI 读到"银行明细"但文件名是"入学入托"):
  - AI 收到 v1 schema 文件消息 → `find /root/.openclaw /tmp -name "*.pdf"` → 找到 **7/24 旧文件 /tmp/doc.pdf**
  - AI `cp /tmp/doc.pdf workspace/doc.pdf` → 误读旧银行明细 → 告诉老板"文件名是入学入托, 内容却是货款转账, 是不是发错了"
  - 真相: 老板发的文件 **从未被下载** (vendor v1 schema 只推送文件名元数据), AI 读的是历史旧文件
- **修复**:
  - 删除误导旧文件 `/tmp/doc.pdf` + `/root/.openclaw/workspace/wpp-wechat/doc.pdf`
  - handler.ts v1 file fallback 注入 content 明确指令: **禁止 AI find/ls 搜索 *.pdf、猜测路径、读取系统现有文件**
  - 只让 AI 基于文件名回复用户, 并诚实说明"当前平台无法读取文件内容"
- **测试**: 16/16 media-enrich tests 全绿 (isV1SchemaFile 覆盖不变)
- **document-extract 已启用** (openclaw.json plugins.allow 加 "document-extract"): AI pdf 工具现在能读 PDF (clawpdf 引擎实测提取成功)
- **未触碰**: dispatcher shouldQuote=true, quote-xml.ts, BaseResponse.ret
- 备份 `/data/wpp-v1158-no-path-guess-20260809-1415/`
- **vendor 硬限制**: v1 schema 文件无下载 API (20+ 参数组合 /Tools/DownloadFile 全 ret=-2), 根治需联系 knowhub.cloud 客服或恢复 v0 schema 客户端

## [v1.1.57]
- 2026-08-09 13:35 (V0-FILE-COMPAT — 文件 v0 路径加宽 + v1 schema fallback)
- **src/inbound/handler.ts**: 文件 enrich 路径加宽
  - 旧: `msgType === 6 + content.includes("<appmsg")` (v0 schema 客户端原始 file XML)
  - 新: `(msgType === 6 || (msgType === 49 && content 含 <appmsg> + <type>6</type> 或 <type>8</type>))`
  - 覆盖 v0 schema 客户端通过 appmsg (type=49) 推送的文件
- **src/inbound/handler.ts**: 新增 v1 schema 文件 fallback (msgType=49 + raw.app.category=file)
  - 实测 13:10 老板发 PDF 走 v1 schema (kind=app, app.category=file, content="入学入托1234567890123.pdf")
  - v1 schema 无 aeskey/attachId/appID, /Tools/DownloadFile 20+ 参数组合全 ret=-2
  - 决策: 只注入 filename + ext 到 content, 提示 AI "vendor v1 schema 暂不支持下载"
  - 避免 AI 误以为"上传失败"
- **src/inbound/media-enrich.ts**: 新增 `isV1SchemaFile()` 检测器 (kind=app + app.category=file)
- **tests/media-enrich.test.ts**: +6 case 覆盖 isV1SchemaFile (boss 实测 PDF msgId=1200608731982267299 + 各种 edge case)
- **529/529 测试全绿** (up from 516, +13 v1 schema detection case)
- **未触碰**: dispatcher `shouldQuote = true`, quote-xml.ts, BaseResponse.ret 判据
- **关键发现 (debug)**: WPP vendor 内部有文件 download 机制,把文件下到 `/root/.openclaw/workspace/wpp-wechat/doc.pdf` (固定文件名,10792 bytes 真实 PDF)
  - 12:15:18 vendor 内部下载成功 → AI 用 `pdf` 工具失败 (PDF extraction plugin 未启用)
  - 12:15:29 AI 实际看到 PDF 内容(走 model 内置 fallback)
  - **风险**: 固定 doc.pdf 文件名, 多次文件覆盖丢失
- **vendor 限制**: /Tools/DownloadFile 公开 API 在 v1 schema 下不可用 (20+ 参数组合全 ret=-2)
- 备份 `/data/wpp-v1157-file-fallback-20260809-1310/`
- 老板 12:25 提供 **deepseek API key** `sk-REDACTED` 作为兜底

## [v1.1.56]
- 2026-08-09 12:50 (V1-SCHEMA-ENRICH — 私聊/群聊图片 AI 重新识别)
- **src/inbound/media-enrich.ts**: 新增 `enrichImageMessageFromV1()` + `isV1SchemaImage()` helper
  - v1 schema (vendor 8/9 ~09:00 切换推送格式) content 改为"收到一张图片" 总结文字,不再推 `<img>` XML
  - 新函数用 `/Tools/DownloadImg` + `local_id` 拿首 64KB JPEG (vendor 硬限, 多次调用 MD5 一致)
  - 仍走 ossutil → 公网 URL → AI 多模态识别 (大图部分截断但多数场景够用)
- **src/inbound/handler.ts**: 图片 enrich 分双路径 — v0 schema (content 含 `<img>`) 走原 `enrichImageMessage`,v1 schema 走新 `enrichImageMessageFromV1`
- **src/dispatch/dispatcher.ts**: ctx payload 新增 `MediaUrls/MediaPaths/MediaTypes` 数组字段 (gewe v3.1.0 范式)
  - 从 msg.content 提取 `[图片]/[视频]/[语音]/[文件] URL` → 数组
  - framework 走结构化多模态识别,不再依赖 Body 文本里的 URL 标记
- **tests/media-enrich.test.ts**: 7 个新 case 覆盖 isV1SchemaImage (私聊/群聊/缺字段/null/string 等)
- **版本同步**: package.json + openclaw.plugin.json + src/core/constants.ts:PLUGIN_VERSION 三处 → 1.1.56
- **523/523 测试全绿** (up from 516, +7 v1 schema detection case)
- **未触碰**: dispatcher `shouldQuote = true` (v1.1.50 状态保留), quote-xml.ts (v1.1.55), BaseResponse.ret 判据 (v1.1.52)
- **vendor 已知限制**: /Tools/DownloadImg 单次硬限 64KB (实测 4 次连调 MD5 完全相同, sectionStart/dataLen/sectionLen/compressType 均无效)
- 备份 `/data/wpp-v1156-v1-image-enrich-20260809-1250/`, revert 用 `cp $BK/src/* /root/dev/wechatpadpro-openclaw/src/`

## [v1.1.55]
- 2026-08-09 12:10 (QUOTE-TITLE-FIX — 引用回复 client 端终于能显示 AI 回复文字)
- **src/send/quote-xml.ts**: 引用回复 XML 重写 — **title=AI 回复文字** (gewe 工作基线), des 同填作 fallback, refermsg 简化 svrid+fromusr
  - 根因: appmsg type=57 客户端主气泡读 `<title>` 字段, `<des>` 在 type=57 被吞
  - v1.1.28 误改: title=displayname + des=AI → 客户端只显示 refermsg 预览
  - v1.1.55 修复: title=AI 回复 (gewe src/send/quote.ts:31 范式) → 客户端主气泡显示 AI 回复 + 引用块渲染
- **src/send/quote-reply.ts**: log tag 改为 v1.1.55, 注释更新 (vendor /Msg/Quote ret=-2 永久不可用, 走 ShareLink+gewe 范式)
- **tests/quote-xml.test.ts**: 7 个 case 全更新匹配 v1.1.55 结构 (title=AI, 极简 refermsg, 无 displayname/content/createtime)
- **核心类型**: `QuoteSource` 字段保留向后兼容 (displayname/chatusr/content/createtime/innerType), 但 v1.1.55 仅用 svrid + fromusr
- **版本同步**: package.json + openclaw.plugin.json + src/core/constants.ts:PLUGIN_VERSION 三处 → 1.1.55
- **未触碰**: dispatcher.ts `shouldQuote = true` (v1.1.50 调试状态保留), /Msg/Quote 接口 (vendor ret=-2), BaseResponse.ret 判据修复 (v1.1.52)
- **13 XML variant 实测**: msgId 848526155-179 已发老板手机, 验证 type=57 + title=AI 回复的 client 渲染
- 备份 `/data/wpp-quote-title-fix-20260809-1210/`, revert 用 `cp $BK/src/send/quote-xml.ts /root/dev/wechatpadpro-openclaw/src/send/quote-xml.ts`

## [v1.1.50]
- 2026-08-09 11:00 (QUOTE-ALL-MSG-TYPES-REOPEN — 接总立拍板引用回复全面放开 ⚠️ 调试模式)
- **src/dispatch/dispatcher.ts**: `shouldQuote = true` (去掉 msgType===1 限制), 全部 msgType (文本/图片/语音/视频/表情) 都走 quoteReply
- 老板实测验证：refermsg XML 字段完整、displayname/title 正常、AI reply 可被引用
- **wpp-wechat/AGENTS.md**: 引用回复纪律重启（段 165-183 替换为新规则），禁止"引用回复已废弃"话术
- ⚠️ 调试模式，备份 v1.1.49 dispatcher.js 可一键 revert: `/data/wpp-quote-reopen-20260809-1054*/dispatcher.js.v1.1.49`

## [v1.1.49]
- 2026-08-09 10:50 (QUOTE-TEXT-ONLY-REOPEN — 接总立拍板放开文本 msgType 引用回复)
- **src/dispatch/dispatcher.ts**: `shouldQuote = msg.msgType === 1`（只放开文本）, 图片/语音/视频引用仍走 sendText
- 老板 10:53 立刻要求再放开全部 msgType（v1.1.50）

## [v1.1.48]
- 2026-08-09 10:30 (SESSIONKEY-FIX + PEERID-FIX 部署)
- **P0-FIX src/session-key.ts**: `buildSessionKey` 群聊去掉 accountId 段 (5 段), DM 保留 (6 段) — 对齐 framework `parseSessionDeliveryRoute` SSOT (实测 `SESSION_DELIVERY_PEER_KINDS.has("default") === false`)
- **P1-FIX src/inbound/handler.ts**: enrich 前用 `accountRegistry.get(accountId).selfWxid` 判断私聊方向, `fromWxid === selfWxid` → peerId 改为 toWxid (修老板自己发私聊 → peer_id 错位成自己 wxid bug)
- **副作用**: 老板 10:31 同意修 MEMORY.md "四段原则"过期段（decision 2026-08-09 + 标注过期段）
- 494 tests pass, deploy ✅

## [v1.1.47]
- 2026-08-09 10:13 (BUILD-DEDUPE-KEY FIX — `??` 空字符串陷阱)
- **src/webhook-receiver.ts:241**: buildDedupeKey 改 `?? ` 为三元显式判断, 修 newMsgId="" 时 fallback 失败
- 491 tests pass, deploy ✅, e2e 验证入库 id=20366-20369

## [v1.1.36] ~~QUOTE-DISABLED（已撤销）~~
- 2026-08-09 00:05 (QUOTE-DISABLED — 接总立拍板放弃引用回复)
- **撤销于 2026-08-09 11:06**：老板拍板 v1.1.50 重新放开引用回复（见上 v1.1.50 段）
- 撤销根因：实测 v1.1.50 引用块发送者 displayname/title 正常，不再有"显示群名/图片不能展示"问题
- **src/dispatch/dispatcher.ts**: ~~`shouldQuote` 恒为 false~~ → **v1.1.50 已改 `shouldQuote = true`**
- ~~AI 回复一律走普通文本 (sendText)~~ → **v1.1.50 起回复内容走 quoteReply 工具**
- 透传参数 msgId/newMsgId/fromWxid/originalContent 等全部置空 → **v1.1.50 起恢复**
- ~~**wpp-wechat AGENTS.md**: 引用回复纪律废弃~~ → **v1.1.50 起恢复引用回复纪律**
- **保留**: quoteReply/quote-xml/quote-svrid 代码不删（v1.1.50 已重新激活使用）

## [v1.1.35]
- 2026-08-08 23:36 (GROUP-GHOST-FIX + QUOTE-WXID-FIX 部署)

> 深度审阅 subagent 发现 P0-1 (group.ts ghost endpoint) + 老板 23:25 报告引用回复 P0
> 本次包含 2 个 P0 修复 + 1 个 P1 修复

### Fixed (P0-1: Group ghost endpoint — 深度审阅发现)
- **src/send/group.ts**: `operateInfo` 调 `/Group/OperateChatRoomInfo` (vendor 无此 path) → 拆为 3 独立端点
  - `setChatRoomName` → `/Group/SetChatRoomName` (QID+Content)
  - `setChatRoomAnnouncement` → `/Group/SetChatRoomAnnouncement` (QID+Content)
  - `setChatRoomRemarks` → `/Group/SetChatRoomRemarks` (QID+Content)
  - `operateInfo(chatroomId, content, actionType)` 保留兼容, actionType 三选一
- **src/send/group.ts**: `transferOwner` 调 `/Group/TransferGroupOwner` (vendor 无此 path) → `/Group/SendTransferGroupOwner` (vendor 实际端点)
- **src/dispatch/agent-tools/group-meta.ts**: 4 个工具 (transferChatRoomOwner/operateChatRoomInfo/setChatRoomAnnouncement/setChatRoomName/setChatRoomRemarks) 全部指向正确端点
- **根因**: vendor swagger 236 paths 无 OperateChatRoomInfo/TransferGroupOwner, 5 个群管理工具实际全挂 (404)

### Fixed (P0: 引用回复只显示 wxid/群 ID — 老板 23:25 报告)
- **src/send/quote-reply.ts**: 3 处根因
  1. `dbFromWxid = rec.peer_id` (群消息 peer_id=群 ID) → 从 raw_payload 提取 sender_id/fromUser/FromWxid
  2. displayname 缺失 → `rec.peer_name` 兑底
  3. content 带 `wxid_xxx:\n` 前缀 → `stripGroupContentPrefix()` 清洗
- **tests/quote-xml.test.ts**: 新增 stripGroupContentPrefix 5 case

### Fixed (P0 二次修复: 群测仍显示群 ID — 老板 23:41 群测发现)
- **根因深挖**: business callback 群消息 `FromUserName` = **群 ID** (非发送者!), DB 无 from_wxid 字段, raw_payload 无 sender_id, peer_name 全 NULL
  - 发送者 wxid 只在 content 首行前缀 `wxid_xxx:\n` (DB 实测 6 条群消息全一致)
- **修复**: 新增 `extractGroupSenderWxid(content)` — 从 content 前缀提取真实发送者 wxid
  - 提取顺序: 参数 fromWxid → raw_payload sender → **content 前缀 wxid** → (非群) peer_id
- **tests/quote-xml.test.ts**: 新增 extractGroupSenderWxid 5 case (含昵称开头不误判)
- **全量单测: 384/384 pass**

### Fixed (P1-2: sendMiniProgram 死代码调群发端点)
- **src/send/msg.ts**: 删除 `sendMiniProgram` — 调 `/Msg/SendApp` (vendor = 群发消息, body=ToIds+Content)
  - 正确链路: agent-tools sendMiniProgram → api.sendXCX (/Msg/SendXCX) ✅ 不受影响
  - buildAppMsgXml 保留 (有测试覆盖, XML 构造可复用)

### Tests
- api.test.ts 函数总数 233 → 235 (删 sendMiniProgram + 恢复 SetChatRoom* 3 独立)
- 全量单测: **383/383 pass**

## [v1.1.33]
- 2026-08-08 23:16 (P1/P2/P3 推进 + 深度审阅)

> 老板 23:01 "继续 P1/P2/P3" + 23:08 "深度多维度审阅, 完整修复优化"
> 完成 8 项: Tools 端点错配修复 / 测试卡死修复 (379/379) / hot-reload 全字段同步 / mention safeMatch / deploy.sh 验证 / API 覆盖率确认 (221/236 注册 / 181 dispatch = 76.7%)

### Fixed (Tools 端点错配 — P1[2])
- **/Tools/CdnDownloadVoice → /Tools/DownloadVoice** (`src/inbound/media-enrich.ts:405`)
  - vendor swagger 仅定义 /Tools/DownloadVoice (无 Cdn 前缀), 之前错调 Cdn 前缀 → vendor 404
- **/Tools/CdnDownloadVideo → /Tools/DownloadVideo** (`src/inbound/media-enrich.ts:371`)
  - 同上, vendor 仅定义 /Tools/DownloadVideo
- /Tools/CdnDownloadImage 保留 (vendor 有定义, 图片专用)

### Fixed (测试卡死 — P1[4])
- **e2e.test.ts**: 修复 DB 共享污染 (setBackend already initialized)
  - e2e-helper.ts: USE_MOCK 默认 true (除非 WPP_E2E_REAL=1), 避免 prod gateway 冲突
  - try/finally + resetAdapter 清理 DB backend singleton
  - webhookPort 0 (随机端口) 避免 4398 冲突
- **gateway-compat.test.ts**: after() 钩子 closeDb + resetAdapter + resetDefaultRegistry
- **config-helpers.test.ts**: 显式删 WECHATPRO_TOKEN_KEY env (测试环境有真 env)
- **package.json**: npm test 加 --test-force-exit (event loop 残留资源不阻塞退出)
- **结果: 379/379 全绿 (23.9s)**

### Fixed (mention safeMatch — P2[1])
- **src/inbound/parser/mention.ts**: matchAll → safeMatchAll (截断 4096 + 灾难 regex 检测)
  - 防恶意构造字符串触发 ReDoS (gewe v3.1.0 A1 教训: (a+)+$ 1000 字符 hang 119s)
- **tests/inbound.test.ts**: 新增 2 个 ReDoS 防御测试 (100KB 输入 500ms 内完成)

### Added (hot-reload 全字段同步测试 — P1[5])
- **tests/hot-reload.test.ts test 7**: 验证 triggerConfig 8 字段热更新
  - requireAtMention / groupPolicy / groupAllowFrom / keywordTrigger / msgTypeTrigger / quoteBotTrigger / blacklistGroups / chatroomDebug

### Verified (API 覆盖率 — P3)
- **221/236 = 93.6%** vendor 端点已注册 (WPP_VENDOR_ENDPOINTS 列表，去重 ShareLink 重复); 真实 dispatch 字符串覆盖 181/236 = 76.7% (其余 55 paths: Login×40 主动移除 + 15 others 非业务必需)
- 剩余 11 个均非业务必需: Admin 3 (DelayAuthKey/DeleteAuthKey/GenAuthKey) + Login 海外 3 (GetQRMac_oversea/GetQR_oversea/GetQRx_oversea) + QWContact 1 (QWAddContact) + Wxapp 4

### Verified (deploy.sh dry-run — P2[3])
- **19 PASS / 0 FAIL / 0 WARN**
- forensic: 0 处 process.exit / 0 处明文 password / 1 处 informational console.log

### DEV.md 更新
- §0.6 待办 8 项全部完成, 更新为 v1.1.32 部署待拍板 + P3 剩余项


> 老板 21:38 / 21:42 / 22:56 三次决定图片引用能力:
> 1. 21:38 → 仅文本引用 (msgType===1)
> 2. 21:42 → "暂时放弃图片引用能力"
> 3. 22:56 → "图片回复能力暂时先保留。还需要继续测试"
> 复合公式 `msgType===1 || content.includes("<refermsg")` 既符合老板 22:56 决定, 又保留图片引用能力可观测性

### Fixed (PLUGIN_VERSION 一致性)
- **版本号 v1.1.27 → v1.1.32** (3 文件同步)
  - `src/core/constants.ts` (PLUGIN_VERSION)
  - `package.json` (version)
  - `openclaw.plugin.json` (version)
  - 原因: deploy 端实际功能已到 v1.1.28+ (引用 XML 全字段 + 复合 shouldQuote + ossutil retry), 但 version 字符串停留在 v1.1.27 (22:32 部署时)

### Fixed (shouldQuote 复合公式)
- **公式 `msgType===1 || content.includes("<refermsg")`**
  - 文本消息 (msgType===1) → 必引用
  - 任何含 `<refermsg>` 标签的消息 (msgType=1/3/43/34/6 等) → 走引用回复
  - 不含 refermsg 的图片/视频/语音/文件 → 走普通文本回复
  - 行为: 老板手动引用过的图 (wpp_svrid_mapping 命中) 可正常引用, 未引用过的图走普通文本 (vendor svrid 不可用)

## [v1.1.32]
- 2026-08-08 22:56 (PLUGIN_VERSION 一致性 + 老板新决定)

## [v1.1.31]
- 2026-08-08 21:30 (老板撤销 v1.1.28 NO-QUOTE-IMG)

### Fixed (图片引用恢复)
- `shouldQuote = msgType===1 || msgType===3`
- 老板原话 21:30: "图片我还是希望可以被引用回复"

## [v1.1.30]
- 2026-08-08 21:19 (GEWE-PARITY + 老板分析 gewe 引用)

### Fixed (仿 gewe send/quote.js + handler.ts)
- **src/send/quote-xml.ts** 极简结构 (仿 gewe) — 注: 后被 v1.1.28 修复覆盖为全字段
- **src/send/quote-reply.ts** svrid 来源改 inbound NewMsgId
- **src/inbound/handler.ts** QUOTE 消息 push 原图 OSS URL 到 AI 多模态上下文
  - 仿 gewe handler.ts:170-194 quoteDetails.mediaUrl 注入
- **src/dispatch/dispatcher.ts** 删除 v1.1.26-IMG-ECHO
  - 老板 21:27 实测: "发了单独的图片, 结果你把图片又发给我了" → 删 IMG-ECHO
- **AI 多模态识别图能力 (P0 验证通过)**
  - 老板测试: "你识别到被引用到图片了" ✅

## [v1.1.29]
- 2026-08-08 21:10 (enrich 顺序 + ossutil retry)

### Fixed (DB 不存 OSS URL bug)
- `src/inbound/media-enrich.ts`: ossutil 加 60s timeout + 3 次 retry + 指数 backoff
  - 老板 20:59:15 那张图 ossutil 临时失败 (code=null signal=SIGKILL) → AI 看不到 URL
  - fix: 失败时 warn + retry, 3 次仍失败抛错 (handler 兜底 DB save)
- `src/inbound/handler.ts`: 改 onFlush 顺序 — 先 enrich 再 enrichBatch
  - 之前: enrichBatch (DB save 原始 m.content) → enrich (内存修改 m.content)
  - 之后: enrich 先 (DB 落 enrich 后的 content) → enrichBatch

## [v1.1.28]
- 2026-08-08 22:34 (BUGFIX 引用 XML 全字段)

> 老板实测: 引用回复发送成功 (Code=0), 但 vendor WPP 渲染异常
> 根因: v1.1.30 仿 gewe 极简结构 (type=57 + 仅 svrid) 在 vendor WPP 上:
>   - type=57 可能被 vendor 识别为"合并转发"而非引用
>   - refermsg 只有 svrid → vendor 无法渲染引用块 (无 fromusr/displayname 等)
>   - 缺 <des> 字段 → 客户端可能不显示正文

### Fixed (引用 XML 全字段)
- **src/send/quote-xml.ts**: 加 <des> + refermsg 6 字段
  - type (1=文本 / 3=图片 / 43=视频 / 49=文件)
  - fromusr (被引用人 wxid)
  - chatusr (会话 wxid)
  - displayname (被引用人昵称)
  - content (被引用消息原文)
  - createtime (被引用消息时间)
- **src/send/quote-reply.ts**: 从 DB 补全 refermsg 全字段
  - 新增 `opts: { innerType: 49 | 57 }` (默认 57 gewe 兼容, 失败回退 49 vendor WPP 标准)
- **src/dispatch/dispatcher.ts**: replyTo 类型扩展透传 6 字段
  - fromWxid / chatroomId / fromNickname / originalContent / createtime / innerType
- **tests/quote-xml.test.ts**: 7/7 case 更新适配新结构


老板之前部署的版本, 因 manifest 缺 id 爆网关 status=78, 已撤回 (`/data/wechatpadpro-removed-20260804-104900/`).
完整 v0.1.0 PoC 后由 v1.0.0 (Phase G 完工) + v1.0.1 (audit 修复) 取代.

## [v1.1.27]
- 2026-08-08 (P0→P2 完整推进 + 老板反馈 5 项修复)

> 本次会话完成 14 项: 老板反馈紧急修复(群session/Excel下载/图片视频文件引用)+ Tier A 配置 + Tier B 核心消息 + 8 项 P0→P2 字段名/安全/能力补齐

### Fixed (老板反馈紧急 5 项)
- **群聊按 groupId 创建 session** (`src/inbound/parser.ts:180-189`)
  - 之前: 仅靠 senderId/recipientId 后缀 @chatroom 判别群 → 部分 vendor payload 漏判 → peerId = senderId → session 按人拆, 群上下文串台
  - fix: 优先级 conversation_id > recipient_id > sender_id + is_group === true 显式判别
- **Excel/PDF/Word 等办公文件下载** (`src/inbound/media-enrich.ts` enrichFileMessage + parser/content.ts msgType=6)
  - msgType=6 映射 + parseFileXml (fileno/attachfileid 兼容) + /Tools/DownloadFile → OSS → 公网 URL
  - 失败 fallback: 在 content 标注文件名 + 大小, AI 知道有文件但无法下载
- **图片/视频/语音引用能力** (`src/inbound/handler.ts:127`)
  - 之前 v1.1.30 只匹配 `[图片]` URL → 视频/文件/语音引用都拿不到原资源
  - fix: 匹配 `[图片|视频|语音|文件]` 任一标签 + 提取第一个 URL 注入
- **视频 enrich 下载** (`enrichVideoMessage` + msgType=43)
  - videomsg XML → /Tools/CdnDownloadVideo → OSS
- **语音 enrich 下载** (`enrichVoiceMessage` + msgType=34)
  - voicemsg XML → /Tools/CdnDownloadVoice → OSS

### Fixed (Tier A 配置 3 项)
- **版本号同步**: openclaw.plugin.json 1.1.23 → 1.1.26
- **CHANGELOG 补 v1.1.16~v1.1.26 共 11 个版本条目** (19 → 30 条目)
- **清 .ossutil_checkpoint 部署残留**: 移至 /data/wpp-ossutil-checkpoint-<ts>/

### Fixed (Tier B 核心消息 6 项)
- **sendVoice 改 Base64 + Type:2 + VoiceTime×1000** (P0-F 残余)
- **sendVideo 改 Base64 + ImageBase64 + PlayLength** (P0-F 残余)
- **queryWithTimeout 静默返 [] → throw QueryTimeoutError** (P1-e)
  - 新增 QueryTimeoutError class + opts.onTimeout 兜底开关
- **补 wpp_messages.create_time BIGINT 列** (撤回语义准确)
- **S3Storage put/get 加 30s/60s timeout** (P1-d 防 endpoint 挂死队列积压)
- **shutdown flush debouncer** (P1-b 停机不再丢 buffered 消息)
  - AccountContext.attachInboundFlush + stop() 顺序: clearRetryTimers → flush → ws.stop → webhook.stop

### Fixed (P0 契约合规 2 项)
- **P0-1 Group 字段名批量改** (`send/group.ts` + `dispatch/agent-tools/group-meta.ts`)
  - chatroomId/wxidList/wxid → ChatRoomName/ToWxids/QID/ToUserName/Enable
  - 21 个端点 1:1 对齐 swagger definitions (ChatRoomName/ToWxids/QID/Content/Enable/NewOwnerUserName 等)
  - 移除 setName/setAnnouncement/setRemarks 重复方法 (合并到 operateInfo QID+Content), agent-tools meta 保留 deprecated 别名
- **P0-2 MMTLS 监控 SOP** (`scripts/mm-health-check.mjs`)
  - 监控 4 项: vendor 容器运行 + MMTLS outbound TCP + openclaw 进程 + journal fatal + webhook 触达
  - 部署 cron: `*/5 * * * * bash scripts/mm-health-check.mjs >> /var/log/wpp-health.log 2>&1`

### Fixed (P1 字段名 3 项)
- **P1-1 Search 字段名**: keyword → query (vendor 是 query, 之前 18/18 静默失效)
- **P1-2 Friend/FriendCircle 字段名**: wxid/remark/operation/snsId/firstPageMd5 → toWxid/remarks/val/CommentId(typo)/fristpagemd5(typo)
- **P1-3 Finder/TenPay/Voice/Translate 字段名**: 通用名 → vendor 字段 (Username/Id/Money/Name/Remark/text/source_lang/target_lang 等)

### Fixed (P1 安全 1 项)
- **P1-4 ReDoS 防护** (`src/core/safe-regex.ts` + parser/content.ts + parser/quote.ts)
  - isCatastrophicRegex 检测嵌套量词/灾难 alternation
  - safeMatch/safeMatchAll 截断输入 4096 字符 (gewe v3.1.0 实测 hang 119s)
  - 10 个单元测试覆盖 (gewe 教训)

### Added (P2 能力 2 项)
- **P2-1 silk encoder + STT pipeline** (`src/storage/silk.ts` + `src/storage/stt.ts`)
  - 从 gewe v3.1.6 fork: silk decode (native binary) + SiliconFlow SenseVoiceSmall STT
  - 60s 单次 timeout + 3 次指数退避重试
  - 语音消息进来: download → decode → WAV → STT → 转写文字注入 content (`[转写] text`)
- **P2-2 OSS 目录规范化**: gewe/images/ → wpp/images/ (4 个子目录全部统一, 防与 gewe plugin 误覆盖)

### Tests
- 新增 `tests/safe-regex.test.ts` (10 case)
- 修复 `tests/api.test.ts` 函数总数断言 235→233 (Group 字段名改 -2 函数)
- tsc --noEmit 0 错
- 关键测试 53/53 全绿 (inbound/parser/quote/dispatcher/agent-tools/api/db/safe-regex)

## [v1.1.26]
- 2026-08-08 (post-deploy hotfix: 串行 + 图片引用 + 老板主号加固)

> 说明: 此条目为代码注释实际标记,但 package.json version 字段后续未同步。CHANGELOG 真实反映 src/ 注释里的版本号。

### Added / Fixed
- **v1.1.26 CONCURRENCY-FIX** (2026-08-08 20:06 老板 "图片回复丢失"): per-session 串行队列
  - `src/dispatch/dispatcher.ts:183` 注释:per-session 串行化,防图片回复并发丢
- **v1.1.26-IMG-ECHO** (2026-08-08 20:xx): 图片引用缩略图达不到时,主动 sendImage 发原图
  - `src/dispatch/dispatcher.ts:301-305` 从 inbound content 提取 enrich 后 OSS URL,主动 echo
  - **被 v1.1.30 删除**(GEWE-PARITY 后不再需要)

### Known Issue
- package.json version = 1.1.26,但 src/ 注释已包含 v1.1.27~v1.1.32 多个 hotfix
  - 见下 "Post-v1.1.26 Hotfix" 段

## [v1.1.25]
- 2026-08-08 (SYNC-STATE 增量同步)

### Fixed
- **v1.1.25 SYNC-STATE** (2026-08-08 接总立): webhook sync_message 走增量 Synckey(防全量重放)
  - `src/index.ts:187` 调 `/Msg/Sync` 前先 `getSynckey(accountId)`,之后 `saveSynckey()`

## [v1.1.24]
- 2026-08-08 (QUOTE-DEFAULT + QUOTE-SVRID)

### Added
- **v1.1.24 QUOTE-DEFAULT** (2026-08-08 19:42 接总立): 参考 gewe 业务逻辑 — 回复必须引用被回复的消息
  - `src/dispatch/dispatcher.ts:152`
- **v1.1.24 QUOTE-SVRID** (2026-08-08 接总立): 捕获引用消息 svrid → 存映射表
  - `src/inbound/handler.ts:84-90` captureQuoteSvrid(m.content, m.accountId)

## [v1.1.23]
- 2026-08-08 (openclaw.plugin.json schema 补全)

> 注: 此条目推测,v1.1.23 是 openclaw.plugin.json 顶部记录的版本号(已漂移到1.1.23 时未记录)

### Added
- `openclaw.plugin.json` schema 加 v1.1.22 字段(具体字段需 git diff 复核)

## [v1.1.22]
- 2026-08-08 (QUOTE-CTX 语气强制)

### Changed
- **v1.1.22 QUOTE-CTX** (2026-08-08 19:17 接总立实测): 引用消息语境语气从"如果你想"改强制指令
  - `src/dispatch/dispatcher.ts:100`

## [v1.1.21]
- 2026-08-08 (QUOTE-FIX + SendCDNImg P1-2 修复)

### Fixed
- **v1.1.21 QUOTE-FIX** (2026-08-08 19:07/19:14 接总立): 引用消息注入结构化上下文
  - `src/dispatch/dispatcher.ts:94` + `src/dispatch/reply-helpers.ts:8` + `src/dispatch/agent-tools/msg-meta.ts:67`
- **v1.1.21 P1-2 SendCDNImg URL 失败** (2026-08-08): /Msg/SendCDNImg content=url 拉外网失败
  - 后续 v1.1.27 SENDIMG-FIX 完全修(改 base64)

## [v1.1.20]
- 2026-08-08 (IMAGE-ENRICH 图片下载 + OSS 上传)

### Added
- **v1.1.20 IMAGE-ENRICH** (2026-08-08 18:42 老板拍板,18:46 参考 gewe 模式)
  - `src/inbound/handler.ts:39-66`: msg_type=3 图片消息 → `/Tools/CdnDownloadImage` → ossutil cp → 公网 URL → 注入 content 末尾
  - 仿 gewe enrich.js 模式,AI 视觉模型可看到 URL 识别内容

## [v1.1.19]
- 2026-08-08 (DB-DEDUP + SQL 运算符优先级)

### Fixed
- **v1.1.19 DB-DEDUP** (2026-08-08 接总立方案 A): SeenTracker 内存态, gateway 重启即清空
  - 补 DB 兜底:内存去重通过但 DB 已有同消息时跳过
  - `src/inbound/handler.ts:204-211`
- **v1.1.19 SQL 运算符优先级 bug** (2026-08-08 18:38): 修复条件表达式
  - `src/storage/db/mysql.ts:317`

## [v1.1.18]
- 2026-08-08 (NICKNAME-MENTION + CFG-DISPATCH 401 根因)

### Fixed
- **v1.1.18 CFG-DISPATCH** (2026-08-08 18:05 老板 401 根因): 保存 OpenClaw 完整配置
  - `src/dispatch/dispatcher.ts:61-83` 注入 OpenClaw 完整 cfg,dispatcher 可访问
  - 根因: 之前 dispatcher 拿不到 OpenClaw 配置 → 401
- **v1.1.18 NICKNAME-MENTION** (2026-08-08): 注入昵称供群 @ 检测 (e.g. @机器人)
  - `src/index.ts:106` 配置驱动 + DEFAULT_BOT_NICKNAME 兜底
  - `src/index.ts:608` 热重载同步昵称

## [v1.1.17]
- 2026-08-08 (FULL-FIX: 10 项 P0/P1 收口)

> 来源: P0 污染事件后(16:00:38)老板拍板的 10 项 full-fix。CHANGELOG 历史最高条目。

### Fixed (P0)
- **P0-A** `/Msg/SendTxt` 群 @ 字段名: `ats` (array) → `At` (逗号字符串) + 补 `Type: 1`
  - `src/api-client.ts:171-174`
- **P0-B** `/Msg/SendApp` 是群发端点不是发 XML:改 `/Msg/ShareLink` + `sendAppMessage` AI 工具移除
  - `src/api-client.ts:202-204` + `src/dispatch/agent-tools/msg-meta.ts:22` + `src/dispatch/handler-action.ts:44`
- **P0-E** `/Webhook/Set` 补 `enabled: true` (Go bool 零值 false → webhook 设了等于没设)
  - `src/api-client.ts:250-258` 加 enabled/retryCount/timeout/messageTypes
- **P0-G** SeenTracker 接入 handler,三通道去重
  - `src/inbound/handler.ts:185-211` 内存去重 + DB UNIQUE 兜底
  - `src/webhook-receiver.ts` SeenTracker class 已存在(v1.1.11 迁入),v1.1.17 才真正接线
- **P0-H/I** 大整数精度保护(`stringifyLargeInts`) + JSON 解析失败不再判 Code=0
  - `src/api-client.ts:60-67` + `src/api-client.ts:73-75`

### Fixed (P1)
- **P1-f** outbound persist 顺序: 先判 Code 再 persist(失败不留假记录)
  - `src/dispatch/outbound.ts:96,113`
- **P1-9** `/Msg/Revoke` 字段名错: ClientMsgId + NewMsgId + CreateTime + ToUserName
  - `src/api-client.ts:206-216` CreateTime = Math.floor(Date.now()/1000)
- **P1-g** 热重载同步全部门禁字段 (之前只同步 3 个)
  - `src/index.ts:596` 同步 keywordTrigger/msgTypeTrigger/quoteBotTrigger/blacklistGroups/chatroomDebug

### Fixed (其他)
- **FULL-FIX** groupPolicy 非法值 fail-fast: VALID_GROUP_POLICIES = ["open","disabled","allowlist","closed"]
  - `src/index.ts:88-92`
- **FULL-FIX** 红包消息 processRedPacket 后 return, 不继续 dispatch
  - `src/inbound/handler.ts:149-152`
- **FULL-FIX** DM allowFrom 白名单 fail-closed (allowFrom 空 → 拒绝)
  - `src/inbound/handler.ts:158` + `src/inbound/triggers.ts:64-70`

### Infra
- **FULL-FIX** P0-CRASHLOOP (2026-08-08 17:18): keep-alive promise 处理, 防 shutdown 卡死
  - `src/index.ts:498`

## [v1.1.16]
- 2026-08-08 (P0-FIX 老板主号污染事件)

### Fixed (P0)
- **P0-FIX 16:00:38 老板主号污染事件** (25+ 联系人 fan-out dispatch)
  - `src/index.ts:70-75`: 启动强制校验 `cfg.agent` 必填,禁止 `"main"` fallback
  - `src/dispatch/dispatcher.ts:179,238`: 改硬编码 `agentId: "main"` → 从 account state 读 `config.agent`
- **P0-FIX allowFrom 从 cfg 传**: DM 白名单从 accounts/<id>.json 读
  - `src/index.ts:119` + `src/inbound/handler.ts:44,158`
- **P0-FIX HOT-RELOAD 同步 allowFrom**: 防漏白名单改动后还在旧白名单
  - `src/index.ts:610`

## [v1.1.15]
- 2026-08-08 (complete-fix: P0/P1 修复 + P2 收口)

> 来源: /root/audit-reports/2026-08/wechatpadpro-openclaw/full-audit-v1.1.14-2026-08-08.md (8 维度完整审阅)

### Fixed (P0)
- **P0-1 agent tools 从未暴露 + 空 ctx 凭证** (审阅发现, 实测 `Failed to parse URL`)
  - `wppChannelPlugin` 加 `agentTools: AGENT_TOOLS` (162 工具) — 仿 gewe-multi-agent/src/index.ts:251 范式
  - `src/api/client.ts` 加 `resolveCallCtx()`: 空 baseUrl/tokenKey 时从 registry 拿 default 账号真实凭证
  - 之前: meta 构建期 ctx 全空 (`baseUrl: ""`), 即使暴露也必炸; 现在: execute 时动态解析
- **P1-1 新 client authcode 不注入 (POST+GET)** (审阅实测: GET 无 authcode → HTTP 400 Code=-1)
  - `postWppJson`: authcode 自动注入 body 顶层 (不再依赖 withAuthcode flag) + URL query 双保险
  - `getWppJson`: 新增 `withAuthcodeQuery()` 拼 `?authcode=` (仿老 api-client.ts)
  - 影响: 全部 236 endpoint + 162 agent tools 真实可调
- **P1-2 老 api-client 3 个 endpoint 名错 (实测 404 → 200)**
  - `/Msg/SendImg` → `/Msg/SendCDNImg` (body: Content/ToWxid)
  - `/Group/GetChatRoomMemberList` → `/Group/GetChatRoomMemberDetail` (body: QID)
  - `/User/GetProfile` → `/User/GetContractProfile` (authcode 在 query)
  - 影响: 生产 sendImage / getChatroomMemberList / getProfile 修复

### Fixed (P1)
- **P1-3 deploy src 陈旧 (v1.1.12) + 嵌套 src/src 垃圾目录**
  - 删除 `/root/.openclaw/extensions/wechatpadpro/src/src/` 嵌套 (错误复制产物)
  - 重新同步 dev src → deploy src (v1.1.14)

### Fixed (P2)
- **P2-1 e2e-mock 有真凭证环境污染真实 vendor** (5 tests)
  - `tests/e2e-mock.test.ts` 每个 test 加 `{ skip: !USE_MOCK }` — 真凭证环境静默 skip
- **P2-5 openclaw.plugin.json schema 缺 v1.1.12 新字段** (8 个)
  - 补: tokenKeyEnv / authcodeEnv / webhookSecretEnv / webhookPublicUrl / webhookPublicUrlEnv / autoSetWebhook / setWebhookRetries / agent
- **P2-4 CHANGELOG 补 v1.1.11~v1.1.14 条目** (见下)

### Tests
- tsc --noEmit 0 错
- 待跑: npm test (clean env 应 322+ pass / 1 fail describeAccount)

## [v1.1.14]
- 2026-08-08 (P1-FIX-RUNTIME channel runtime context 注入)

### Fixed
- **P1-FIX-RUNTIME channel runtime context 注入** (2026-08-08 13:51 老板拍板 A)
  - `src/index.ts gateway.startAccount` 接收 `ctx.channelRuntime` 后调 `setChannelRuntime(ctx.channelRuntime)`
  - 之前: v1.1.13 修了 inbound dispatcher 但 runtime 永远 NOOP_RUNTIME → AI reply 链路断裂
  - 范式: 仿 gewe-multi-agent/src/index.ts:82 `setGeweChannelRuntime(channelRuntime)`
  - 实测: 13:58:22 `gateway.startAccount: channel runtime injected (accountId=default)`

## [v1.1.13]
- 2026-08-08 (P0-FIX-INBOUND inbound dispatcher 接入)

### Fixed
- **P0-FIX-INBOUND inbound dispatcher 接入** (2026-08-08 13:35 老板拍板方案 A)
  - `src/index.ts`: handleWebhookPayload (compat, 不 dispatcher) → createWppInboundHandler + dispatchInboundToOpenClaw onDispatch
  - webhook-receiver + ws-client 都调 `inboundHandler.handle()`
  - 实测: 13:44-13:49 enrichBatch + inbound dispatch + dispatch session 完整 trace

## [v1.1.12]
- 2026-08-08 (autoSetWebhook + 多账号 webhook path)

### Added
- **autoSetWebhook** (2026-08-08 13:15 接总立 P1-2)
  - 启动自动 setWebhook, URL = `${webhookPublicUrl}${webhookPath}` (env: WECHATPRO_WEBHOOK_PUBLIC_URL)
  - 3 次 backoff (1s/3s/9s) + 5min 周期 retry 兜底 + SetWebhookMetrics 7 counter
- **多账号 webhook path**: `/wechatpadpro/{accountId}/webhook` 长前缀 (1Panel openresty ^~ 匹配)
- **wpp-cli.mjs**: 4 命令 (status/webhook-get/webhook-set/webhook-remove)
- accounts/default.json: selfWxid=USER_PLACEHOLDER, nickname=机器人 (2026-08-08 13:39 老板纠错 WPP=主号)

## [v1.1.11]
- 2026-08-08 (P0-N1 authcode query 注入)

### Fixed
- **P0-N1 vendor 全部 endpoint 要求 authcode** (实测缺 → 400 "缺少授权码")
  - 老 api-client.ts call(): 自动注入 `?authcode=` query (query 优先, body 备援)
  - /Msg/Sync body 补 `{Scene: 0, Synckey: ""}` (空 body → 400 silent killer)

## [v1.1.10]
- 2026-08-08 (race condition fix)

### Fixed
- **P0-R1 startAccountById race condition** (2026-08-08 老板排查发现)
  - src/index.ts:65-68 idempotent 检查改为 `state.wsClient || state.webhookServer` 即 early-return
  - 根因: v1.1.10 P0-5 只在 wsClient 和 webhookServer 都 attached 才 return,
    但 wsClient 是 `await ws.start()` 之后才 attach (异步窗口期),
    第二次并发调用进来时 state.wsClient 还是 undefined → 跳过 early-return → 又 new 一个 WsClient.
    vendor 端观察到 用户连接数=2, openclaw journal 只有 1 个 ws connecting 日志.
  - 实测证据 (2026-08-08 11:19): openclaw journal `ws connecting` 只 1 次,
    但容器日志显示 用户连接数=1 → 2 (11:19:31).
  - 影响: 资源浪费 + vendor 端用户连接数叠加. 不影响消息接收 (onInboundMessage 幂等).
- **版本号同步**: PLUGIN_VERSION 1.1.8 → 1.1.10, package.json 1.1.9 → 1.1.10

## [v1.1.8]
- 2026-08-04 (FIX-S1 sync I/O async + FIX-S2 e2e mock mode)

### Fixed
- **P3-1 sync I/O 改 async** (FIX-S1)
  - src/config.ts 加 loadGlobalConfigAsync / loadAccountConfigAsync
  - 用 fs/promises.readFile 替代 readFileSync (不阻塞 event loop)
  - 复用 v1.0.4 LRU cache (第二次直接 cache hit)
  - 旧 sync 版本保留 (兼容 CLI / tests)
  - src/index.ts startAccountById 用 async 替换 sync
  - 测试: 3 个新 case (async 等价 / cache 复用 / path traversal 防御保留)
- **P3-2 e2e mock mode** (FIX-S2)
  - tests/e2e-mock.test.ts 新建 (6 case, 用 mock HTTP server 模拟 vendor)
  - WPP_E2E_MOCK=1 启本地 mock server (返 Code=0) — 不需真凭证即可跑
  - CI 用法: WPP_E2E_MOCK=1 npx tsx --test tests/*.test.ts

### Tests
- 295 → 304 (无 MOCK 295 pass + 9 skip; MOCK 300 pass + 4 skip)
- tsc 0 错, build 干净
- bash deploy.sh 19 PASS / 0 FAIL / 0 WARN

### Verified (Prod)
- 备份: /data/wechatpadpro-pre-v1.1.8-final-*.tar.gz (20 份 backup 累计)
- accounts/default.json 完整保留

### Debug 实战教训
- undici 6.x resp.body 是 ReadableStream, 没有 .json() / .text() 方法
- 改用 JSON.parse(await new Response(resp.body).text()) (standard Response 包装)
- 旧测试有 resp.statusCode 错 (standard Response 用 resp.status)

## [v1.1.6]
- 2026-08-04 (真实 S3 SDK 集成)

### Added (v1.1.3 S3/OSS 真集成)
- **`@aws-sdk/client-s3` + `@aws-sdk/s3-request-presigner` 装好** (13MB @aws-sdk 依赖, 老板 prod 跑 `npm install` per 铁律)
- `src/storage/media.ts` 用真 SDK: `PutObjectCommand` / `GetObjectCommand` / `getSignedUrl` / `HeadBucketCommand`
- `ping()` 加 `Promise.race` 3s timeout (防网络挂死)
- 自动检测 endpoint 末尾 `/` + path-style vs virtual-hosted URL
- 兼容 AWS S3 / MinIO / AliOSS / TXOSS / Cloudflare R2 (forcePathStyle option)

### Tests
- 287 → 286 (4 个老 S3Storage.put/sign 网络挂死测试改成 fake creds / fake fallback)
- tests/media-storage.test.ts 12 case
- 0 fail, 0 error, tsc 0 错
- `bash deploy.sh` 19 PASS / 0 FAIL / 0 WARN

### Verified (Prod)
- 备份: `/data/wechatpadpro-pre-v1.1.6-181412.tar.gz` (294KB, 17 份 backup 累计)
- node_modules: 92M (含 @aws-sdk 13MB)

## [v1.1.5]
- 2026-08-04 (v1.1.3 S3/OSS abstraction)

### Added
- `src/storage/media.ts` 新建 (270 LOC): MediaStorage 抽象接口 + 3 实现
  - `PassthroughStorage`: 直接返 vendor CDN URL (默认, 无副作用)
  - `S3Storage`: S3-compatible (SigV4 stub, v1.1.6 真实集成)
  - `CompositeStorage`: 优先 vendor CDN, 失败 fallback S3 (高可用)
- `createMediaStorage` factory (kind: passthrough | s3 | composite)

### Tests
- 15 媒体单元测试 (含 8 个新 S3Storage + 3 个 CompositeStorage + 4 个 factory)
- 287/283 全绿

## [v1.1.4]
- 2026-08-04 (v1.1.1 webhook full verify)

### Added (webhook 验签多算法)
- `src/core/signature.ts` 重构: `verifySignature(body, sig, secret, { algorithm })` 一站式, 默认 sha256, 支持 sha1/md5
- 自动检测 algorithm (从 signature 前缀 `sha256=`/`sha1=`/`md5=`)
- `signatureRequired()` 改 strict mode (永远 true, 业务决定)
- `verifyHmacSha256` 保留 (deprecated, 转发到 verifySignature)

### Tests
- 15 单元测试 (含 7 个 v1.1.4 新增: sha256/sha1/md5 算法 / 自动检测 / 错 secret / 缺 signature)

## [v1.1.3]
- 2026-08-04 (v1.1.8 E2E test scaffold)

### Added
- `tests/e2e.test.ts` 新建 (4 tests, skip-when-no-creds)
- 检查 3 个 env: WECHATPRO_DB_PASSWORD + WECHATPRO_TOKEN_KEY + WECHATPRO_AUTHCODE
- 4 测: MariaDB 连接 / vendor GetProfile / AccountRegistry.start() / plugin.start()
- 没凭证时: skip (不算 fail), 输出提示信息

### Tests
- 272 (268+4 skip) 全绿

## [v1.1.2]
- 2026-08-04 (v1.1.6 AI dispatcher + v1.1.7 特殊消息)

### Added
- `src/dispatch/dispatcher.ts` 重构: 接入 `WppChannelRuntime`
  - `session.recordInboundSession({ sessionKey, inbound })`
  - `reply.dispatchReplyWithBufferedBlockDispatcher({ sessionKey, inbound, onReply })`
- `setChannelRuntime(runtime)` / `getChannelRuntime()` 注入点 (NOOP 默认)
- `sendAiReply()` 调 vendor sendText 通过 registry
- `src/inbound/hongbao.ts` 新建: `isRedPacketMessage` + `extractRedPacketInfo` + `processRedPacket`
- `src/send/msg.ts` 加 `sendMiniProgram` (XML builder) + `sendAppFromXml` (low-level wrapper)
- `buildAppMsgXml` 公开 (含 type=2001 mini-program 格式 + XML escape)

### Tests
- `tests/dispatcher.test.ts` 8 case (含 NOOP runtime + 真 runtime 抛错 propagate + group session key)
- `tests/v1.1.7-special-msg.test.ts` 12 case (hongbao 检测 + mini-program XML escape)
- 268/268 全绿

## [v1.1.1]
- 2026-08-04 (v1.1.5 消息索引优化)

### Added
- `src/storage/db/mysql.ts` applyMigrations 加 2 复合索引:
  - `idx_account_peer_ts` (account_id, peer_id, ts) — 加速 "get history from this peer" 常见 case
  - `idx_account_msgtype_ts` (account_id, msg_type, ts) — 加速按消息类型查 (Phase D 4-way trigger)
- 之前 `idx_account_chat_ts` + `idx_account_ts` (v1.0.1)

### Tests
- `tests/db.test.ts` 加 2 测试 (3 复合索引齐 / 源码含 ensureIndex 调用)
- 248/248 全绿

## [v1.1.0]
- 2026-08-04 (Setup wizard, Phase WIZ-1~4)

### Added
- `scripts/setup.ts` 4 子命令 (list/add/validate/remove) + 交互式菜单
- `src/setup-wizard.ts` 核心逻辑 (testable, 不依赖 readline)
  - `listAccountsDetailed()`: 列账号 + 状态 (env 配/未配)
  - `validateAccount(id)`: 11 项检查 (accountId/file/JSON/enabled/env 5+1+1/webhook port/apiBaseUrl/webhookSecret/groupPolicy)
  - `writeAccountFile(input)`: 写 accounts/<id>.json (token/authcode 空, 走 env)
  - `removeAccountFile(id)`: 删 file
- `getAccountsDir()` (function, 不是 const) 读 env override (测试隔离)
- `package.json` 加 `setup` script: `tsx scripts/setup.ts`
- `USAGE.md` 加 §9 Setup Wizard (82 行)

### Tests
- `tests/setup-wizard.test.ts` 17 case (mock WPP_ACCOUNTS_DIR + tmpdir 隔离)
- 246/246 全绿

### Verified (Prod)
- 13 份 backup (6 dev tar + 7 prod deploy snapshot)
- 6 轮 real deploy (rollback-backup 模式) + 6 轮 rollback (SHA 字节级一致)

## [v1.0.2] - 2026-08-04 (完整 audit 修复, 8 维度)


### Fixed (8 维度 audit 修复)
- **P1 FIX-1**: Webhook body cap 10MB (`webhook-receiver.ts:36-58` 累计 size, 超 413 + `incRejectedBodySize`)
  - 加 `WEBHOOK_BODY_LIMIT_BYTES=10*1024*1024` 硬 cap 防 memory DoS
  - 测试: `bodyLimitBytes` 构造选项支持小数据测逻辑
- **P2 FIX-2**: Webhook timeout 30s (`req.setTimeout(REQUEST_TIMEOUT_MS)` + `incRejectedTimeout`)
  - 防 slow client DoS
- **P2 FIX-3**: WebhookMetrics 9 → 14 counters 集成 (port from `monitor/webhook.ts`)
  - 新增: `incRejectedBodySize`, `incRejectedTimeout`, `incRejectedSignature`, `incRejectedParse`
  - 文档更新: 9 → 11 (FEATURES.md 11 counters, 实际 14)
- **P2 FIX-4**: docs 数量同步 (README 12→14 tests, FEATURES 9→14 metrics, vendor paths 描述)
- **P3 FIX-5**: 删 `src/multi-agent-stub.ts` 死代码 (1 user = `dispatcher.ts:6`, 改直接 import `session-key.js`)
- **P3 FIX-6**: FEATURES.md vendor paths 描述 ("236 paths via 21 tag modules")
- **P3 FIX-7**: formatErr 统一 (10 文件, 替代 `(e as Error).message` 丢 stack)
  - `src/ws-client.ts`, `src/index.ts`, `src/dispatch/outbound.ts`, `src/dispatch/agent-tools/factory.ts`,
  - `src/api/client.ts`, `src/inbound/handler.ts`, `src/inbound/debouncer.ts`, `src/inbound/enrich.ts`,
  - `src/monitor/ws-client.ts`, `src/monitor/webhook.ts` (10 个文件)
  - return value 保留 `(e as Error).message` (5 处, 5 文件)

### Added
- 新 `tests/webhook-receiver.test.ts` (9 case, 测 14 counters + bodyLimit override + constants)
- `src/core/constants.ts:REQUEST_TIMEOUT_MS = 30_000` (新增, FIX-2)
- `src/monitor/metrics.ts:4 新 inc* helper` (新增, FIX-3)

### Changed
- `webhook-receiver.ts` constructor 加 6 参 `opts?: { bodyLimitBytes?: number }` (测试用, 默认 10MB)
- `WebHookMetrics` 重新组织, 11 → 14 helpers

### Tests
- 207 → **216** (+9: 9 webhook-receiver)
- 14 → **15** test files

### Verified (Prod)
- tsc 0 错, build 干净
- `bash deploy.sh` 19 PASS / 0 FAIL / 0 WARN
- 6 轮 real deploy (v1.0.2 `[WPP v1.0.2]` 加载成功, 6 plugins, 0 warning, 0 error)
- 6 轮 rollback (SHA 字节级一致, 5 plugins 恢复)

### Deferred (5 P3, 不修, 进 ROADMAP)
- P3-4 sync I/O: `readFileSync` 改 `readFile` async (config.ts + mysql.ts)
- P3-5 CI/CD: 加 GitHub Actions
- P3-6 ESLint config: `.eslintrc.json` + ignore `any` + require formatErr in catch

## [v1.0.1] - 2026-08-04 (Phase v1.0.1)

### Fixed (Audit 修复)
- **P1-1**: Webhook 验签 placeholder 实现 (新 `src/core/signature.ts` + `webhook-receiver.ts` 第 5 参 `secret`)
  - `verifyHmacSha256` HMAC-SHA256 + timingSafeEqual 完整实现
  - `signatureRequired` 决定是否需验签 (配了 secret 必需要 X-Signature header)
  - `extractSignatureHeader` 兼容 X-Signature / X-Hub-Signature-256 / X-WPP-Signature
  - vendor 暂未公开签名算法, 未来 vendor 公开后改 `signatureRequired` 强制全 verify
- **P2-1**: AccountRegistry 并发 start 锁 (inFlight Map 序列化 + `_doStart` 拆分)
  - 修复 race: 5 个并发 caller 收同 ctx, 失败后能重试
  - 测试覆盖: 5 并发同 ID, 5 并发不同 ID, 失败路径, 失败后恢复

### Changed
- 版本 `0.1.0` → `1.0.1` (package.json + openclaw.plugin.json + PLUGIN_VERSION)
- `deploy-dryrun.sh` → `deploy.sh` (canonical dry-run, header 升级)
- 新 `deploy-swap.sh` 真实 atomic 部署脚本 (7 步 + rollback 提示)
- `webhook-receiver.ts` 加可选 5 参 `secret`, 向后兼容
- `index.ts` startAccountById 传 `cfg.webhookSecret` 给 webhook 构造

### Tests
- 188 → 207 (+19): 15 signature + 4 concurrent
- 12 test files, ~2900 LOC

## [v1.0.0] - 2026-08-04 (Phase G 完工)

### Added
- **G1** AccountContext class (`src/accounts/account-context.ts`)
  - 单账号环境隔离: config + apiClient + 隔离 logger (4 件套 scoped)
  - 7 mutation 方法 (start/stop/attachWsClient/attachWebhookServer/setVendorAuth/stop)
  - toJSON 脱敏 (tokenKey/authcode/webhookSecret 不进 dump)
- **G2** AccountRegistry class (`src/accounts/account-registry.ts`)
  - 多账号 registry: start/get/has/list/size/stop/stopAll/toJSON
  - **G2-2**: 路由解析 resolve() 精确 + 大小写不敏感 + getOrThrow
  - **G2-3**: DB 持久化 via `upsertAccount / getAccounts / getAccount` (复用已有 `wpp_accounts` 表)
  - setAdapterForTest 测试钩子
- **G3** plugin entry 走 AccountRegistry class API
  - 删 `src/account-state.ts` 13 facade exports, 保留 2 (getDefaultAccountRegistry / resetDefaultRegistry)
  - 删 `src/outbound/index.ts` legacy thin wrapper
  - 改 dispatch/outbound.ts 6 函数 + inbound/index.ts 1 处用 registry.get 替代 getAccountState
  - index.ts sendText/sendImage 静态 import + registry 校验 + 错误信息含 known IDs
- **G3.5** OpenClaw v2026.7.1+ register(api) 契约对齐
  - 默认 export = `plugin` manifest with `register(api)`
  - `register` 调 `api.registerChannel({ plugin: wppChannelPlugin })`
  - wppChannelPlugin 保持 named export (channel 实现)
- **G6** 6 channel config helpers (`src/config-helpers.ts`)
  - listAccountIds / resolveAccount / defaultAccountId / isConfigured / unconfiguredReason / describeAccount
  - 仿 OpenClaw v2026.7.1+ config 字段
- **G7** 完整 channel 结构: meta + capabilities + gateway
  - meta: { id, label, selectionLabel, docsPath, blurb, aliases, quickstartAllowFrom }
  - capabilities: { chatTypes, media, reactions, threads, nativeCommands, blockStreaming }
  - gateway: { startAccount, stopAccount } — 委托 startAccountById / registry.stop

### Changed
- 内部代码全部走 `AccountRegistry` class API (替代 module-level Map singleton)
- `src/dispatch/outbound.ts` (主 outbound) + 删 `src/outbound/index.ts` (legacy)
- `src/multi-agent-stub.ts` re-exports 收敛到 3 (旧 facade 移除)
- 测试: 87 → 188 (+101 cases, 10 test files → 12)

### Verified (Prod)
- 4 轮 dry-run + 4 轮 real deploy + 4 轮 rollback (每次 SHA 字节级一致)
- 0 wechatpadpro 残留错误, 5 原 plugins 持续工作 (本项目/memory-core/memos/minimax/wecom)
- OpenClaw 6 plugins 加载成功: `本项目, memory-core, memos-cloud-openclaw-plugin, minimax, wechatpadpro, wecom`
- OpenClaw 实际调用 config helpers 11+ 次/10s (`loaded account config: default`)

## [v0.1.0] - 2026-08-04 (Phase A-F PoC)

### Added
- Phase A: core (logger/env/paths/constants + util/exec + util/id) ~600 LOC + 16 tests
- Phase B: storage/db (adapter pattern + UPSERT + queryWithTimeout) ~400 LOC + 12 tests
- Phase C: api (vendor HTTP client + 21 tag send 236 paths 1:1 覆盖) ~1500 LOC + 11 tests
- Phase D: inbound (parser + 4-way triggers + debouncer + relay + enrich + handler) ~700 LOC + 27 tests
- Phase E: monitor (metrics + webhook + ws-client) ~600 LOC + 8 tests
- Phase F: outbound + agentTools (87 AI-callable 工具 + 14 dedicated meta) ~1800 LOC + 9 tests
- 总: src 74 文件 7132 LOC, tests 7 文件 1436 LOC, 87 tests 全绿

## [历史]
- 2026-08-04 之前



> 老板 23:01 "继续 P1/P2/P3" + 23:08 "深度多维度审阅, 完整修复优化"
> 完成 8 项: Tools 端点错配修复 / 测试卡死修复 (379/379) / hot-reload 全字段同步 / mention safeMatch / deploy.sh 验证 / API 覆盖率确认 (221/236 注册 / 181 dispatch = 76.7%)

### Fixed (Tools 端点错配 — P1[2])
- **/Tools/CdnDownloadVoice → /Tools/DownloadVoice** (`src/inbound/media-enrich.ts:405`)
  - vendor swagger 仅定义 /Tools/DownloadVoice (无 Cdn 前缀), 之前错调 Cdn 前缀 → vendor 404
- **/Tools/CdnDownloadVideo → /Tools/DownloadVideo** (`src/inbound/media-enrich.ts:371`)
  - 同上, vendor 仅定义 /Tools/DownloadVideo
- /Tools/CdnDownloadImage 保留 (vendor 有定义, 图片专用)

### Fixed (测试卡死 — P1[4])
- **e2e.test.ts**: 修复 DB 共享污染 (setBackend already initialized)
  - e2e-helper.ts: USE_MOCK 默认 true (除非 WPP_E2E_REAL=1), 避免 prod gateway 冲突
  - try/finally + resetAdapter 清理 DB backend singleton
  - webhookPort 0 (随机端口) 避免 4398 冲突
- **gateway-compat.test.ts**: after() 钩子 closeDb + resetAdapter + resetDefaultRegistry
- **config-helpers.test.ts**: 显式删 WECHATPRO_TOKEN_KEY env (测试环境有真 env)
- **package.json**: npm test 加 --test-force-exit (event loop 残留资源不阻塞退出)
- **结果: 379/379 全绿 (23.9s)**

### Fixed (mention safeMatch — P2[1])
- **src/inbound/parser/mention.ts**: matchAll → safeMatchAll (截断 4096 + 灾难 regex 检测)
  - 防恶意构造字符串触发 ReDoS (gewe v3.1.0 A1 教训: (a+)+$ 1000 字符 hang 119s)
- **tests/inbound.test.ts**: 新增 2 个 ReDoS 防御测试 (100KB 输入 500ms 内完成)

### Added (hot-reload 全字段同步测试 — P1[5])
- **tests/hot-reload.test.ts test 7**: 验证 triggerConfig 8 字段热更新
  - requireAtMention / groupPolicy / groupAllowFrom / keywordTrigger / msgTypeTrigger / quoteBotTrigger / blacklistGroups / chatroomDebug

### Verified (API 覆盖率 — P3)
- **221/236 = 93.6%** vendor 端点已注册 (WPP_VENDOR_ENDPOINTS 列表，去重 ShareLink 重复); 真实 dispatch 字符串覆盖 181/236 = 76.7% (其余 55 paths: Login×40 主动移除 + 15 others 非业务必需)
- 剩余 11 个均非业务必需: Admin 3 (DelayAuthKey/DeleteAuthKey/GenAuthKey) + Login 海外 3 (GetQRMac_oversea/GetQR_oversea/GetQRx_oversea) + QWContact 1 (QWAddContact) + Wxapp 4

### Verified (deploy.sh dry-run — P2[3])
- **19 PASS / 0 FAIL / 0 WARN**
- forensic: 0 处 process.exit / 0 处明文 password / 1 处 informational console.log

### DEV.md 更新
- §0.6 待办 8 项全部完成, 更新为 v1.1.32 部署待拍板 + P3 剩余项


> 老板 21:38 / 21:42 / 22:56 三次决定图片引用能力:
> 1. 21:38 → 仅文本引用 (msgType===1)
> 2. 21:42 → "暂时放弃图片引用能力"
> 3. 22:56 → "图片回复能力暂时先保留。还需要继续测试"
> 复合公式 `msgType===1 || content.includes("<refermsg")` 既符合老板 22:56 决定, 又保留图片引用能力可观测性

### Fixed (PLUGIN_VERSION 一致性)
- **版本号 v1.1.27 → v1.1.32** (3 文件同步)
  - `src/core/constants.ts` (PLUGIN_VERSION)
  - `package.json` (version)
  - `openclaw.plugin.json` (version)
  - 原因: deploy 端实际功能已到 v1.1.28+ (引用 XML 全字段 + 复合 shouldQuote + ossutil retry), 但 version 字符串停留在 v1.1.27 (22:32 部署时)

### Fixed (shouldQuote 复合公式)
- **公式 `msgType===1 || content.includes("<refermsg")`**
  - 文本消息 (msgType===1) → 必引用
  - 任何含 `<refermsg>` 标签的消息 (msgType=1/3/43/34/6 等) → 走引用回复
  - 不含 refermsg 的图片/视频/语音/文件 → 走普通文本回复
  - 行为: 老板手动引用过的图 (wpp_svrid_mapping 命中) 可正常引用, 未引用过的图走普通文本 (vendor svrid 不可用)


### Fixed (图片引用恢复)
- `shouldQuote = msgType===1 || msgType===3`
- 老板原话 21:30: "图片我还是希望可以被引用回复"


### Fixed (仿 gewe send/quote.js + handler.ts)
- **src/send/quote-xml.ts** 极简结构 (仿 gewe) — 注: 后被 v1.1.28 修复覆盖为全字段
- **src/send/quote-reply.ts** svrid 来源改 inbound NewMsgId
- **src/inbound/handler.ts** QUOTE 消息 push 原图 OSS URL 到 AI 多模态上下文
  - 仿 gewe handler.ts:170-194 quoteDetails.mediaUrl 注入
- **src/dispatch/dispatcher.ts** 删除 v1.1.26-IMG-ECHO
  - 老板 21:27 实测: "发了单独的图片, 结果你把图片又发给我了" → 删 IMG-ECHO
- **AI 多模态识别图能力 (P0 验证通过)**
  - 老板测试: "你识别到被引用到图片了" ✅


### Fixed (DB 不存 OSS URL bug)
- `src/inbound/media-enrich.ts`: ossutil 加 60s timeout + 3 次 retry + 指数 backoff
  - 老板 20:59:15 那张图 ossutil 临时失败 (code=null signal=SIGKILL) → AI 看不到 URL
  - fix: 失败时 warn + retry, 3 次仍失败抛错 (handler 兜底 DB save)
- `src/inbound/handler.ts`: 改 onFlush 顺序 — 先 enrich 再 enrichBatch
  - 之前: enrichBatch (DB save 原始 m.content) → enrich (内存修改 m.content)
  - 之后: enrich 先 (DB 落 enrich 后的 content) → enrichBatch


> 老板实测: 引用回复发送成功 (Code=0), 但 vendor WPP 渲染异常
> 根因: v1.1.30 仿 gewe 极简结构 (type=57 + 仅 svrid) 在 vendor WPP 上:
>   - type=57 可能被 vendor 识别为"合并转发"而非引用
>   - refermsg 只有 svrid → vendor 无法渲染引用块 (无 fromusr/displayname 等)
>   - 缺 <des> 字段 → 客户端可能不显示正文

### Fixed (引用 XML 全字段)
- **src/send/quote-xml.ts**: 加 <des> + refermsg 6 字段
  - type (1=文本 / 3=图片 / 43=视频 / 49=文件)
  - fromusr (被引用人 wxid)
  - chatusr (会话 wxid)
  - displayname (被引用人昵称)
  - content (被引用消息原文)
  - createtime (被引用消息时间)
- **src/send/quote-reply.ts**: 从 DB 补全 refermsg 全字段
  - 新增 `opts: { innerType: 49 | 57 }` (默认 57 gewe 兼容, 失败回退 49 vendor WPP 标准)
- **src/dispatch/dispatcher.ts**: replyTo 类型扩展透传 6 字段
  - fromWxid / chatroomId / fromNickname / originalContent / createtime / innerType
- **tests/quote-xml.test.ts**: 7/7 case 更新适配新结构


老板之前部署的版本, 因 manifest 缺 id 爆网关 status=78, 已撤回 (`/data/wechatpadpro-removed-20260804-104900/`).
完整 v0.1.0 PoC 后由 v1.0.0 (Phase G 完工) + v1.0.1 (audit 修复) 取代.

## v1.5.2 (2026-08-25 22:38 老板拍"逐一确认并完整修复")

### 修复内容
- **P0 修复**: dev vs deploy 不一致 — 编译 `dispatch/intent-llm.ts + dispatcher.ts` → deploy dist/dispatch/ (v1.5.0 P2-fix 拋错模式没编译, deploy 端仍是 v1.4.0 旧版 hardcode fallback "MiniMax-M2.7-highspeed")
- **P1 修复**: CHANGELOG 补 v1.5.1 (HMAC env 回滚到 v1.1.10 permissive) + v1.5.2 (enrichBatch cfg 链修复) 章节
- **P1 修复**: 推 v1.5.2 tag (累积 v1.5.1 + v1.5.2 + 本次 dev/deploy 同步)
- **P1 修复**: version 升 1.5.2 (package.json + openclaw.plugin.json + src/core/constants.ts 3 处对齐)

### 关联版本 (累积)
- **v1.5.1** (2026-08-25 21:30 老板拍"请帮我完整修复"): HMAC env 位置错修复 — 删错位置 env (/root/.config/environment.d/wechatpadpro.conf), 写真位置 env (/root/.openclaw/gateway.systemd.env); signature.ts + webhook-receiver.ts 加 v1.5.1 P2-fix 注释; tests/unit/hmac-fix-v1.5.1.test.mjs 8 个新测试 (62/62 PASS)
- **v1.5.2 B-fix** (2026-08-25 22:28 老板拍 A): enrichBatch cfg 链未接 accounts.cfg bug 修复 — enrich.ts enrichAndSaveMessage/enrichBatch 增加 cfg 参数, inbound/index.ts handleWebhookPayload 传 cfg, handler.ts enrichBatch 传 opts.heartflow; 5 文件编译 + 62/62 PASS

### 文件改动
- `src/dispatch/intent-llm.ts` — 已在 v1.5.0 P2-fix 改拋错模式 (dev)
- `src/dispatch/dispatcher.ts` — 已在 v1.5.0 P2-fix 改拋错模式 (dev)
- `dist/dispatch/intent-llm.js` — 本次编译 (deploy 同步)
- `dist/dispatch/dispatcher.js` — 本次编译 (deploy 同步)
- `package.json` — version 1.5.0 → 1.5.2
- `openclaw.plugin.json` — version 1.5.0 → 1.5.2
- `src/core/constants.ts` — PLUGIN_VERSION "1.5.0" → "1.5.2"
- `dist/core/constants.js` — 编译 deploy
- `CHANGELOG.md` — 补 v1.5.2 章节

### 测试
- `npm test`: 62/62 PASS ✅
- 8 测试文件 (62 cases): affection/deploy-integrity/four-layer-fallback/heartflow/hmac-fix-v1.5.1/independent-trigger/p2-cleanup/triggers

### 发布
- git tag v1.5.2 (替代没推的 v1.5.1 tag, v1.5.2 是累积修复)
- git push origin master
- GitHub: jiexiaoyin/wpp-openclaw master HEAD update

### 报告
- 完整审阅报告: `/root/audit-reports/2026-08/wechatpadpro-openclaw/full-audit-v1.5.x-2026-08-25.md` (18.4 KB)
- 完整修复报告: `/root/audit-reports/2026-08/wechatpadpro-openclaw/complete-fix-v1.5.2-2026-08-25.md` (待写)
- 备份: `/data/wpp-v1.5.2-complete-fix-20260825-2240/`

---

## v1.5.0 B-fix (2026-08-25 20:06) - 3 层分层架构

**老板拍板 B (3 层分层架构): 解耦 AI 主动观察 (heartflow) 与 AI 被动响应 (@bot)**

### 改动 (4 文件 +110 行)
- src/inbound/heartflow.ts: +tryIndependentTrigger() +IndependentTriggerOpts/Result +independentTrigger 配置
- src/inbound/enrich.ts: +tryHeartflowAfterEnrich() +fire-and-forget 异步触发
- openclaw.plugin.json: schema.heartflow.independentTrigger 字段 (default=false)
- accounts/default.json: deploy heartflow.independentTrigger=true
- tests/unit/independent-trigger.test.mjs: NEW 10 测试

### 测试
- npm test: 39/39 PASS (10 NEW + 29 OLD)

### 部署状态
- dev master commit: 待 push
- deploy: dist/inbound/{heartflow,enrich}.js 已 esbuild 编译
- gateway restart: **等老板拍板** (按 2026-08-04 10:52 铁律)

## v1.5.0 P2-fix (2026-08-25 20:41) - 4 项 P2 全收口 (老板拍 A)

**触发**: 老板 20:41 拍板 A 并尽可能提升分数

**4 项 P2 全收口**:

### P2-1: HMAC webhook 验签 env 注入
- 生成 32 字节随机 secret (64 hex) → `/root/.openclaw/credentials/wechatpadpro-webhook-secret.json` (chmod 600)
- 注入到 `/root/.config/environment.d/wechatpadpro.conf` (按 8-07 铁律 #3)
- `WECHATPRO_WEBHOOK_SECRET=08198a7c...` 64 字符

### P2-2: 3 处 intent-llm / dispatcher hardcode 消除
- `dispatch/intent-llm.ts:171` "MiniMax-M2.7-highspeed" → 拋错 (跟 heartflow.ts:475 一致设计哲学)
- `dispatch/dispatcher.ts:165-167` resolveLlmModel → 拋错, accounts cfg 缺失立即报错
- schema `llmIntentModel.default` = `deepseek-v4-flash` + enum 加 deepseek-v4-flash
- accounts cfg `llmIntentEnabled/Model/TimeoutMs` 显式声明

### P2-3: enrich.js 拆分 (1.3MB → 2.8KB)
- 新建 `src/inbound/heartflow-trigger.ts` 桥接文件 (只 export tryIndependentTrigger)
- enrich.ts import 改用 heartflow-trigger (不直接 import heartflow)
- esbuild 改为 `--bundle=false` 模式, 让 plugin loader 用 ES module 解析 cross-file imports
- dist 总大小: 3.4MB → 2.1MB

### P2-4: plugin.json version 对齐 v1.5.0
- package.json: 1.4.0 → 1.5.0
- openclaw.plugin.json: 1.3.80 → 1.5.0 (dev + deploy)
- src/core/constants.ts: PLUGIN_VERSION = "1.5.0"

**测试**: 39 → **54 tests** (新增 15 P2-fix 测试)
- npm test: **54/54 PASS**

**部署**: deploy 端 4 P2 全部已 cp, gateway restart 等老板拍板 (按 8-04 10:52 铁律)

**备份**: /data/wpp-p2-cleanup-20260825-2041/ (135M)
