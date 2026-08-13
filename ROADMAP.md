# Roadmap (ROADMAP.md)

WeChatPadPro OpenClaw Plugin 路线图 (当前 v1.3.54).

## 状态总览 (2026-08-13)

| Phase | 内容 | 状态 | 验证 |
|---|---|---|---|
| **Phase A** | Foundation (core/logger/env/paths + util/exec) | ✅ | 16 tests |
| **Phase B** | Storage (storage/db adapter pattern) | ✅ | 12 tests |
| **Phase C** | API (254 paths via 20+ tag modules) | ✅ | 11 tests |
| **Phase D** | Inbound (4-way triggers + relay trigger + debouncer + enrich) | ✅ | 27 tests |
| **Phase E** | Monitor (metrics + webhook + ws-client) | ✅ | 8 tests |
| **Phase F** | Outbound + 179+ agentTools + sendMedia/identity | ✅ | 9 tests |
| **Phase G** | 多账号 (AccountContext + Registry + OpenClaw v3 API) | ✅ | 7 sub-phases |
| **Phase H** | deploy.sh + 8 docs + .env.example | ✅ | dry-run 19 PASS |
| **Phase I** | 语音 SILK-ONLY + 转码降级 + 接龙触发 (v1.3.52-54) | ✅ | 801/801 |

**总测试**: 801/801 全绿 (73 文件)

## 已完成 (v1.1.48 ~ v1.2.0)

### 消息链路
- **v1.1.48**: sessionKey 群 5 段 / DM 6 段 (framework 对齐); 私聊 peerId 方向修正
- **v1.1.55**: 引用回复 title=AI 回复 (type=57 客户端主气泡渲染)
- **v1.1.56**: v1 schema 图片 enrich (`/Tools/DownloadImg + local_id` 64KB) + ctx MediaUrls 注入
- **v1.1.57**: 文件 v0 检测加宽 + v1 fallback (文件名元数据)
- **v1.1.58**: 文件 NO-PATH-GUESS (禁 AI 猜路径, 防误读旧文件)
- **v1.2.0**: 文件确定性回复 (绕过 AI) + 注释精简

### 已实现能力 (曾标"未实现", 现已落地)
- ✅ **silk/STT 语音转文字**: `src/storage/{silk,stt}.ts` (SiliconFlow SenseVoiceSmall)
- ✅ **S3/OSS 媒体存储**: `src/storage/media.ts` (Passthrough/S3/Composite)
- ✅ **webhook 验签**: `src/core/signature.ts` (sha256/sha1/md5 多算法, runtime permissive)
- ✅ **E2E 测试**: `tests/e2e-helper.ts` USE_MOCK 默认 true, 不再卡死
- ✅ **setup wizard**: `scripts/setup.ts` + `src/setup-wizard.ts` (list/add/validate/remove/migrate)

## 待办 (优先级)

### 待办 (需 vendor 配合)
- **v1 schema 文件内容下载** — vendor 无 API, 当前文件消息确定性回复兜底
- **图片 >64KB 完整下载** — vendor /Tools/DownloadImg 硬限 64KB

### 待办 (内部优化)
- **多账号 UI / 统一管理界面** — 当前 CLI setup wizard
- **E2E 真凭证测试** — 需真 WECHATPRO_DB_PASSWORD + 真扫码 authcode
- **ESLint 清理** — 当前仍有 warnings
- **文档国际化** — EN 翻译 (低优先)

## v2.0 (远期)

- **多 vendor 适配**: 未来可能加 1-2 个备选 vendor (PadLocal, Gewe v4 等)
- **跨平台**: 企业微信 / 飞书 / 钉钉 (属于 wecom 插件范围)
- **AI 增强**: LLM 自动总结群消息 / 自动回复

## 老板拍板的历史决策

| 日期 | 决策 | 影响 |
|---|---|---|
| 2026-08-01 | B 方案: accounts/<id>.json 独立配置 + env vars | accounts/ 目录结构 + .env.example |
| 2026-08-01 | 凭证单一来源 env var | config.json passwordEnv / accounts tokenKeyEnv |
| 2026-08-01 | 备份放 /data (不放原路径 .bak) | 所有 backup 在 /data/ |
| 2026-08-01 | 不改 /root/.openclaw/openclaw.json | 部署时只 inject plugins.allow |
| 2026-08-04 | wechatpadpro 部署 prod 后撤回 (manifest 缺 id 爆 status=78) | 备份 /data/wechatpadpro-removed-20260804-104900/ |
| 2026-08-09 | v1.2.0 生产已部署 (当前) | /root/.openclaw/extensions/wechatpadpro/ |

## 不做 (Not in scope)

- ❌ 不替换 GeWe 插件 (共存模式, 老板拍板)
- ❌ 不改 /root/.openclaw/openclaw.json 核心
- ❌ 不动 `/root/.openclaw/extensions/other/`
- ❌ 不做跨 vendor 适配 (v2.0 才考虑)
- ❌ 不引第三方测试 mock library (node:test 内置 0 依赖)

## 进度指标

- **src**: 124 .ts 文件 / 17509 LOC
- **tests**: 73 文件 / 801 pass
- **deploy**: deploy.sh 19 PASS / 0 FAIL
- **备份**: 每次部署自动备份到 /data/
