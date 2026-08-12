#!/usr/bin/env node
// scripts/setup.ts - 交互式 CLI wizard (v1.1.0, Phase WIZ-1)
// 核心逻辑在 src/setup-wizard.ts, 这里只 wire readline + 输出

import { createInterface } from "node:readline/promises";
import { stdin, stdout, exit } from "node:process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import {
  listAccountsDetailed,
  validateAccount,
  diagnoseAccount,
  writeAccountFile,
  removeAccountFile,
  validateAddInput,
  getAccountsDir,
  migrateFromV0Config,
  ensureAgentWorkspace,
} from "../src/setup-wizard.js";
import { readFile as readFileAsync } from "node:fs/promises";
import { generatePairingCode, getPairingStorePath } from "../src/pairing-store.js";

/** v1.1.42 SETUP-MERGE: 检查 agent id 是否已在 openclaw.json agents.list 里 */
async function checkAgentExistsInOpenclaw(agentId: string): Promise<boolean> {
  try {
    const raw = await readFileAsync("/root/.openclaw/openclaw.json", "utf8");
    const cfg = JSON.parse(raw) as { agents?: { list?: Array<{ id?: string }> } };
    const list = cfg?.agents?.list ?? [];
    return list.some((a) => a.id === agentId);
  } catch {
    return false;
  }
}
import { isValidAccountId } from "../src/config.js";

async function prompt(rl: ReturnType<typeof createInterface>, question: string, defaultValue?: string): Promise<string> {
  const suffix = defaultValue ? ` [${defaultValue}]` : "";
  const answer = (await rl.question(`${question}${suffix}: `)).trim();
  return answer || defaultValue || "";
}

async function confirm(rl: ReturnType<typeof createInterface>, question: string, defaultYes = false): Promise<boolean> {
  const suffix = defaultYes ? " (Y/n)" : " (y/N)";
  const answer = (await rl.question(`${question}${suffix}: `)).trim().toLowerCase();
  if (!answer) return defaultYes;
  return answer === "y" || answer === "yes";
}

function printHelp(): void {
  console.log(`
WeChatPadPro OpenClaw Plugin — Setup Wizard (v1.1.0)

Usage:
  npm run setup                       Interactive menu
  npm run setup list                   List all configured accounts
  npm run setup add [accountId]        Add a new account
  npm run setup validate [accountId]   Validate account config + env vars
  npm run setup diagnose [accountId]   Diagnose runtime health (env/vendor/webhook/agent)
  npm run setup remove [accountId]     Remove account file
  npm run setup migrate [configPath]   Migrate v0.1.0 config.json → accounts/<id>.json (B 方案)
  npm run setup pair [accountId]       Generate DM pairing code (v1.2.3 PAIRING)

Examples:
  npm run setup
  npm run setup add alice
  npm run setup validate default
  npm run setup diagnose default
  npm run setup list
  npm run setup remove alice
  npm run setup migrate                  # 用 ./config.json + default id
  npm run setup migrate ./old-config.json  # 指定老路径
  npm run setup pair default             # 生成 default 账号的配对码

Notes:
  - accountId must match /^[a-zA-Z0-9_-]{1,64}$/ (path safety)
  - 凭证 (tokenKey/authcode) 走 env var, 不写 accounts/<id>.json
  - 部署后需 cp -a accounts/ + 重启 gateway 才生效
`);
}

async function listAccounts(): Promise<void> {
  const entries = await listAccountsDetailed();
  if (entries.length === 0) {
    console.log("(无配置账号, 跑 npm run setup add 添加)");
    return;
  }
  console.log(`配置账号 (${entries.length}):`);
  for (const e of entries) {
    const status = e.configured ? "✓ configured" : "✗ tokenKey env 未设";
    console.log(`  ${e.id.padEnd(20)} nickname=${e.nickname} ${status}`);
    for (const env of e.envHints) {
      console.log(`     ⚠  需设 env: ${env}`);
    }
  }
}

async function validateCmd(accountId?: string): Promise<number> {
  const id = accountId || "default";
  if (!isValidAccountId(id)) {
    console.error(`✗ 无效 accountId: '${id}'`);
    return 1;
  }
  console.log(`验证账号 '${id}':\n`);
  const results = await validateAccount(id);
  let pass = 0, warn = 0, fail = 0;
  for (const r of results) {
    const sym = r.level === "pass" ? "✓" : r.level === "warn" ? "⚠" : "✗";
    console.log(`  ${sym} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.level === "pass") pass++;
    else if (r.level === "warn") warn++;
    else fail++;
  }
  console.log(`\n结果: ${pass} pass, ${warn} warn, ${fail} fail`);
  return fail > 0 ? 1 : 0;
}

/** v1.3.30 DIAGNOSE: 一键诊断账号运行时健康度 (env/vendor/webhook/agent) */
async function diagnoseCmd(accountId?: string): Promise<number> {
  const accounts = await listAccountsDetailed();
  const id = (accountId || "default").trim();
  if (!accounts.some((a) => a.id === id)) {
    console.error(`✗ 账号不存在: ${id} (已知: ${accounts.map((a) => a.id).join(", ") || "无"})`);
    return 1;
  }
  console.log(`诊断账号 '${id}':\n`);
  const results = await diagnoseAccount(id);
  let pass = 0, warn = 0, fail = 0;
  for (const r of results) {
    const sym = r.level === "pass" ? "✓" : r.level === "warn" ? "⚠" : "✗";
    console.log(`  ${sym} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
    if (r.level === "pass") pass++;
    else if (r.level === "warn") warn++;
    else fail++;
  }
  console.log(`\n诊断结果: ${pass} pass, ${warn} warn, ${fail} fail`);
  if (fail > 0) {
    console.log("\n修复建议:");
    console.log("  1. 凭证缺失 → 在 env 设真值 (gateway.systemd.env 或 export)");
    console.log("  2. vendor 不通 → 检查 apiBaseUrl / 网络 / vendor 是否在线");
    console.log("  3. webhook 未监听 → 确认 gateway 已重启 (systemctl --user restart openclaw-gateway)");
    console.log("  4. agent 缺失 → npm run setup add 时同步创建, 或手动 openclaw-create-agent.sh");
  }
  return fail > 0 ? 1 : 0;
}

async function addAccount(suggestedId?: string): Promise<number> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const id = suggestedId || (await prompt(rl, "新账号 ID", ""));
    if (!isValidAccountId(id)) {
      console.error(`✗ 无效 accountId: '${id}'`);
      return 1;
    }

    console.log(`\n为新账号 '${id}' 收集配置 (token/authcode 走 env var, 不落盘):\n`);

    const enabledStr = (await prompt(rl, "启用 (true/false)", "true")).toLowerCase();
    const apiBaseUrl = await prompt(rl, "API base URL (vendor HTTP API 地址)", "http://127.0.0.1:8062");
    const wsUrl = await prompt(rl, "WebSocket URL (vendor WS 地址)", "ws://127.0.0.1:8062/ws/sync");
    const tokenKeyEnv = await prompt(rl, "tokenKey env var 名称", `WECHATPRO_${id.toUpperCase()}_TOKEN_KEY`);
    const authcodeEnv = await prompt(rl, "authcode env var 名称", `WECHATPRO_${id.toUpperCase()}_AUTHCODE`);
    const webhookHost = await prompt(rl, "webhook host (建议 127.0.0.1)", "127.0.0.1");
    const webhookPort = parseInt(await prompt(rl, "webhook port", "4398"), 10) || 4398;
    const webhookPath = await prompt(rl, "webhook path", "/wechatpadpro/webhook");
    const webhookSecretEnv = await prompt(rl, "webhookSecret env var (留空=不验签)", "");
    // v1.1.43 SETUP-FULL: 9 字段补全
    const webhookBusinessPath = await prompt(rl, "webhookBusinessPath 业务回调路径 (留空=不启用 v1.1.15)", "");
    const webhookPublicUrl = await prompt(rl, "webhookPublicUrl 公网入口 (留空=不设, 配 nginx 反代后填)", "");
    const webhookPublicUrlEnv = await prompt(rl, "webhookPublicUrlEnv 环境变量名 (留空=不设 env)", "");
    const autoSetWebhook = (await prompt(rl, "autoSetWebhook 启动自动 setWebhook (true/false, 默认 true)", "true")).toLowerCase() !== "false";
    const setWebhookRetries = parseInt(await prompt(rl, "setWebhookRetries 重试次数 (默认 3)", "3"), 10) || 3;
    const adminUsersStr = await prompt(rl, "adminUsers 管理员 wxid (逗号分隔, 留空=不设置)", "");
    const commandAllowlistStr = await prompt(rl, "commandAllowlist 命令白名单 (逗号分隔, 留空=禁用)", "");
    const enableWsClient = (await prompt(rl, "sync.enableWsClient 启用 WS 主动推送 (true/false, 默认 true)", "true")).toLowerCase() !== "false";
    const enableHttpFallback = (await prompt(rl, "sync.enableHttpFallback 启用 HTTP 60s 彗底 (true/false, 默认 true)", "true")).toLowerCase() !== "false";
    const fallbackSyncMs = parseInt(await prompt(rl, "sync.fallbackSyncMs HTTP 轮询间隔毫秒 (默认 60000, 0=禁用)", "60000"), 10) || 60000;
    // v1.1.44 SETUP-COMPLETE: 7 字段补全
    const groupAllowFromStr = await prompt(rl, "groupAllowFrom 群白名单 (逗号分隔, groupPolicy=allowlist 时用, 留空=不设)", "");
    const selfWxid = await prompt(rl, "selfWxid 机器人自己的 wxid (留空=vendor Login 后自动填)", "");
    const keywordTriggerStr = await prompt(rl, "keywordTrigger 关键词 (逗号分隔, 留空=禁用)", "");
    const keywordMode = (await prompt(rl, "  keywordTrigger.mode (exact/contains/regex, 默认 contains)", "contains")).toLowerCase();
    const msgTypeTriggerEnabled = (await prompt(rl, "msgTypeTrigger 启用 (true/false, 默认 false)", "false")).toLowerCase() === "true";
    const quoteBotTriggerEnabled = (await prompt(rl, "quoteBotTrigger 启用 (true/false, 默认 false)", "false")).toLowerCase() === "true";
    const blacklistGroupsStr = await prompt(rl, "blacklistGroups 黑名单群 (逗号分隔, 拒绝处理任何消息, 留空=不设)", "");
    const chatroomDebug = (await prompt(rl, "chatroomDebug 群调试模式 (true/false, 默认 false)", "false")).toLowerCase() === "true";
    // v1.3.30 SETUP-INTENT: 意图判断 + 群上下文细节
    const groupContextWindow = parseInt(await prompt(rl, "groupContextWindow 群上下文条数 (1-100, 默认 20)", "20"), 10) || 20;
    const groupContextMaxImages = parseInt(await prompt(rl, "groupContextMaxImages 群上下文图片数 (默认 5, 0=不理解媒体)", "5"), 10) || 5;
    const llmIntentEnabled = (await prompt(rl, "llmIntentEnabled LLM 判断群意图 (true/false, 默认 true)", "true")).toLowerCase() !== "false";
    const llmIntentTimeoutMs = parseInt(await prompt(rl, "llmIntentTimeoutMs LLM 判断超时毫秒 (默认 5000)", "5000"), 10) || 5000;
    const llmIntentModel = await prompt(rl, "llmIntentModel LLM 模型 (默认 MiniMax-M2.5)", "MiniMax-M2.5");
    const embedIntentEnabled = (await prompt(rl, "embedIntentEnabled embedding 快路径 (true/false, 默认 true)", "true")).toLowerCase() !== "false";
    const embedIntentTopN = parseInt(await prompt(rl, "embedIntentTopN embedding top-N (默认 5)", "5"), 10) || 5;
    const embedIntentThreshold = parseFloat(await prompt(rl, "embedIntentThreshold embedding 阈值 (默认 0.3)", "0.3")) || 0.3;
    const allowFromStr = await prompt(rl, "allowFrom 私聊白名单 (逗号分隔, 留空=全部)", "");
    const groupPolicyStr = await prompt(rl, "group 策略 (open/disabled/allowlist)", "open");
    const nickname = await prompt(rl, "nickname", id);
    const requireAtMention = (await prompt(rl, "群聊需 @ 才回复 (true/false)", "true")).toLowerCase() !== "false";
    const debounceMs = parseInt(await prompt(rl, "debounce 毫秒", "1500"), 10) || 1500;

    const input = {
      id,
      enabled: enabledStr === "true" || enabledStr === "" || enabledStr === "1",
      apiBaseUrl,
      wsUrl,
      tokenKeyEnv,
      authcodeEnv,
      webhookHost,
      webhookPort,
      webhookPath,
      webhookSecretEnv: webhookSecretEnv || undefined,
      // v1.1.43 SETUP-FULL: 9 字段补全 (未设 -> undefined, 保持 JSON 干净)
      webhookBusinessPath: webhookBusinessPath || undefined,
      webhookPublicUrl: webhookPublicUrl || undefined,
      webhookPublicUrlEnv: webhookPublicUrlEnv || undefined,
      autoSetWebhook: webhookPublicUrl || webhookPublicUrlEnv ? autoSetWebhook : undefined,
      setWebhookRetries: webhookPublicUrl || webhookPublicUrlEnv ? setWebhookRetries : undefined,
      adminUsers: adminUsersStr ? adminUsersStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
      commandAllowlist: commandAllowlistStr
        ? { allowlist: commandAllowlistStr.split(",").map((s) => s.trim()).filter(Boolean) }
        : undefined,
      sync: {
        enableWsClient,
        enableHttpFallback,
        fallbackSyncMs,
      },
      // v1.1.44 SETUP-COMPLETE: 7 字段
      groupAllowFrom: groupAllowFromStr ? groupAllowFromStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
      selfWxid: selfWxid || undefined,
      keywordTrigger: keywordTriggerStr
        ? { enabled: true, keywords: keywordTriggerStr.split(",").map((s) => s.trim()).filter(Boolean), mode: ["exact", "contains", "regex"].includes(keywordMode) ? (keywordMode as "exact" | "contains" | "regex") : "contains" }
        : undefined,
      msgTypeTrigger: msgTypeTriggerEnabled ? { enabled: true } : undefined,
      quoteBotTrigger: quoteBotTriggerEnabled ? { enabled: true } : undefined,
      blacklistGroups: blacklistGroupsStr ? blacklistGroupsStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
      chatroomDebug,
      // v1.3.30 SETUP-INTENT: 意图判断 + 群上下文细节
      groupContextWindow,
      groupContextMaxImages,
      llmIntentEnabled,
      llmIntentTimeoutMs,
      llmIntentModel,
      embedIntentEnabled,
      embedIntentTopN,
      embedIntentThreshold,
      allowFrom: allowFromStr ? allowFromStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
      groupPolicy: (["open", "disabled", "allowlist"].includes(groupPolicyStr) ? groupPolicyStr : "open") as "open" | "disabled" | "allowlist",
      nickname,
      requireAtMention,
      debounceMs,
      // v1.1.42 SETUP-MERGE: 同步创建 agent (默认 wpp-wechat)
      agent: "wpp-wechat",
    };

    const errors = validateAddInput(input);
    if (errors.length > 0) {
      console.error("✗ 输入校验失败:");
      for (const e of errors) console.error(`  - ${e}`);
      return 1;
    }

    console.log(`\n将写 ${getAccountsDir()}/${id}.json:`);
    const { json } = await writeAccountFile(input);
    console.log(json);
    if (!(await confirm(rl, "确认写入", true))) {
      console.log("已取消");
      return 0;
    }
    // 已经在 writeAccountFile 写过了, 提示下一步
    console.log(`\n✓ 账号 '${id}' 已创建`);
    console.log(`\n下一步:`);
    console.log(`  1. 注入 env: export ${tokenKeyEnv}="<your_token_key>"`);
    console.log(`           export ${authcodeEnv}="<your_authcode>"`);
    if (webhookSecretEnv) {
      console.log(`           export ${webhookSecretEnv}="<your_webhook_secret>"`);
    }
    console.log(`  2. 部署: bash deploy-swap.sh --force`);
    console.log(`  3. 验证: npm run setup validate ${id}`);

    // v1.1.42 SETUP-MERGE (2026-08-09 老板立项): 同步创建 agent 目录
    //   老板 08:15 拍板: 集成进 setup 的 add 命令, 避免 2026-08-08 17:43 wpp-wechat 缺 models.json 事件
    //   调 ensureAgentWorkspace 同步创建 workspace + agentDir + openclaw.json
    const agentId = input.agent ?? "wpp-wechat";
    const existsInOpenclaw = await checkAgentExistsInOpenclaw(agentId);
    if (existsInOpenclaw) {
      console.log(`\n⚠ 为新账号 '${id}' 准备的 agent '${agentId}' 已存在于 openclaw.json`);
      console.log(`\n  跳过 agent 创建 (一账号一 agent 原则)`);
    } else {
      console.log(`\n[Step 7/8] 同步创建 agent 目录 (id=${agentId})...`);
      const cloneQuestion = await confirm(
        rl,
        `从现有 agent 复制 workspace 模板? (留空跳=minimal /，输入 id 如 gewe-wechat)`,
        false,
      );
      let cloneFrom: string | undefined;
      if (cloneQuestion) {
        cloneFrom = await prompt(rl, "克隆源 agent id", "gewe-wechat");
      }
      const ok = await confirm(rl, "需同时创建 + 注入 openclaw.json? (推荐 Y)", true);
      try {
        const result = await ensureAgentWorkspace({
          agentId,
          cloneFrom,
          patchOpenclawJson: ok,
        });
        console.log(`  ✓ ${result.workspaceDir}`);
        console.log(`  ✓ ${result.agentDir}`);
        console.log(`  ✓ ${result.sessionsDir}`);
        if (result.openclawJsonBackedUp) {
          console.log(`  ✓ openclaw.json 备份: ${result.openclawJsonBackedUp}`);
        }
        console.log(`\n  👉  需 restart gateway 才能加载新 agent:`);
        console.log(`      kill -TERM $(pgrep -f 'openclaw.*gateway.*--port 18789' | head -1)`);
      } catch (e) {
        console.error(`\n✗ agent 创建失败: ${e instanceof Error ? e.message : String(e)}`);
        console.log(`  (账号 ${id}.json 已写入, 可手动联调 openclaw-create-agent.sh)`);
      }
    }
    return 0;
  } finally {
    rl.close();
  }
}

async function removeCmd(accountId?: string): Promise<number> {
  if (!accountId) {
    console.error("✗ 需指定 accountId: npm run setup remove <id>");
    return 1;
  }
  if (!isValidAccountId(accountId)) {
    console.error(`✗ 无效 accountId: '${accountId}'`);
    return 1;
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const ok = await confirm(rl, `确认删除 accounts/${accountId}.json? (不可恢复)`, false);
    if (!ok) {
      console.log("已取消");
      return 0;
    }
    removeAccountFile(accountId);
    console.log(`✓ accounts/${accountId}.json 已删除`);
    return 0;
  } finally {
    rl.close();
  }
}

/** v1.1.7: 从 v0.1.0 config.json 迁到 accounts/<id>.json (B 方案) */
async function migrateCmd(configPath?: string): Promise<number> {
  const path = configPath || join(process.cwd(), "config.json");
  if (!existsSync(path)) {
    console.error(`✗ 找不到 config.json: ${path}`);
    return 1;
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const id = (await prompt(rl, "目标 accountId (留空用 'default')", "default")) || "default";
    if (!(await confirm(rl, `从 ${path} 迁到 accounts/${id}.json? (老 config.json 会备份)`, true))) {
      console.log("已取消");
      return 0;
    }
    const r = await migrateFromV0Config(path, id);
    console.log(`\n✓ 迁移完成:`);
    console.log(`  accountId:    ${r.accountId}`);
    console.log(`  老文件备份:   ${r.oldFile}`);
    console.log(`  新文件:       ${r.newFile}`);
    console.log(`  tokenKeyEnv:  ${r.tokenKeyEnv}`);
    console.log(`  authcodeEnv:  ${r.authcodeEnv}`);
    if (r.webhookSecretEnv) console.log(`  webhookSecretEnv: ${r.webhookSecretEnv}`);
    if (r.warnings.length > 0) {
      console.log(`\n⚠ 警告 (${r.warnings.length}):`);
      for (const w of r.warnings) console.log(`  - ${w}`);
    }
    console.log(`\n下一步:`);
    console.log(`  1. 在 env 设真凭证: export ${r.tokenKeyEnv}="<token>"`);
    console.log(`                    export ${r.authcodeEnv}="<扫码 authcode>"`);
    if (r.webhookSecretEnv) {
      console.log(`                    export ${r.webhookSecretEnv}="<secret>"`);
    }
    console.log(`  2. 验证: npm run setup validate ${r.accountId}`);
    console.log(`  3. 部署: bash deploy-swap.sh --force`);
    return 0;
  } catch (e) {
    console.error(`✗ 迁移失败: ${e instanceof Error ? e.message : e}`);
    return 1;
  } finally {
    rl.close();
  }
}

/**
 * v1.2.3 PAIRING: 生成 DM 配对码。
 * 老板生成一次性码 → 发给信任用户 → 用户私聊 /pair <码> 自助加入该账号白名单。
 */
async function pairCmd(accountId?: string): Promise<number> {
  const targetId = (accountId || "default").trim();
  // 校验账号存在
  const accounts = await listAccountsDetailed();
  const exists = accounts.some((a) => a.id === targetId);
  if (!exists) {
    console.error(`✗ 账号不存在: ${targetId} (已知: ${accounts.map((a) => a.id).join(", ") || "无"})`);
    return 1;
  }
  const entry = await generatePairingCode(targetId);
  console.log(`\n✓ 配对码已生成 (account=${targetId}):`);
  console.log(`  配对码:     ${entry.code}`);
  console.log(`  有效期至:   ${new Date(entry.expiresAt).toLocaleString()}`);
  console.log(`  存储文件:   ${getPairingStorePath(targetId)}`);
  console.log(`\n使用说明:`);
  console.log(`  1. 确保账号配置已开启配对: accounts/${targetId}.json 加 "dmPairingEnabled": true (否则 /pair 消息不拦截)`);
  console.log(`  2. 把配对码发给信任的用户 (一次性, 1h 内有效)`);
  console.log(`  3. 用户私聊机器人发: /pair ${entry.code}`);
  console.log(`  4. 配对成功后用户 wxid 自动写进该账号 allowFrom, 零重启生效`);
  console.log(`  5. 码被兑换后自动失效 (一次性)`);
  return 0;
}

async function showMenu(): Promise<number> {
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    console.log(`
WeChatPadPro OpenClaw Plugin — Setup Wizard
========================================

选择操作:
  1. List accounts
  2. Add new account
  3. Validate account
  4. Diagnose account (运行时健康)
  5. Remove account
  6. Migrate (v0.1.0 → v1.1)
  7. Help
  8. Exit
  9. Pair (generate DM pairing code)
`);
    const choice = (await rl.question("请输入 1-9 或子命令: ")).trim();
    rl.close();
    switch (choice) {
      case "1": case "list": await listAccounts(); return 0;
      case "2": case "add": return addAccount();
      case "3": case "validate": return validateCmd();
      case "4": case "diagnose": case "diag": return diagnoseCmd();
      case "5": case "remove": return removeCmd();
      case "6": case "migrate": return migrateCmd();
      case "7": case "help": printHelp(); return 0;
      case "8": case "exit": case "": return 0;
      case "9": case "pair": return pairCmd();
      default: console.error(`未知选项: ${choice}`); return 1;
    }
  } finally {
    rl.close();
  }
}

async function main(): Promise<void> {
  const [subCmd, ...args] = process.argv.slice(2);
  let exitCode = 0;
  try {
    if (!subCmd || subCmd === "menu" || subCmd === "i") {
      exitCode = await showMenu();
    } else if (subCmd === "list" || subCmd === "ls") {
      listAccounts();
    } else if (subCmd === "add" || subCmd === "create") {
      exitCode = await addAccount(args[0]);
    } else if (subCmd === "validate" || subCmd === "v") {
      exitCode = await validateCmd(args[0]);
    } else if (subCmd === "diagnose" || subCmd === "diag") {
      exitCode = await diagnoseCmd(args[0]);
    } else if (subCmd === "remove" || subCmd === "rm") {
      exitCode = await removeCmd(args[0]);
    } else if (subCmd === "migrate") {
      exitCode = await migrateCmd(args[0]);
    } else if (subCmd === "pair") {
      exitCode = await pairCmd(args[0]);
    } else if (subCmd === "help" || subCmd === "--help" || subCmd === "-h") {
      printHelp();
    } else {
      console.error(`未知子命令: ${subCmd}`);
      printHelp();
      exitCode = 1;
    }
  } catch (e) {
    console.error(`错误: ${e instanceof Error ? e.message : e}`);
    exitCode = 1;
  }
  if (exitCode > 0) exit(exitCode);
}

main();
