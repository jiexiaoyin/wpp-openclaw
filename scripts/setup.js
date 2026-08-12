#!/usr/bin/env node
import { createInterface } from "node:readline/promises";
import { stdin, stdout, exit } from "node:process";
import { join } from "node:path";
import { existsSync } from "node:fs";
import { listAccountsDetailed, validateAccount, writeAccountFile, removeAccountFile, validateAddInput, getAccountsDir, migrateFromV0Config, ensureAgentWorkspace, } from "../src/setup-wizard.js";
import { readFile as readFileAsync } from "node:fs/promises";
async function checkAgentExistsInOpenclaw(agentId) {
    try {
        const raw = await readFileAsync("/root/.openclaw/openclaw.json", "utf8");
        const cfg = JSON.parse(raw);
        const list = cfg?.agents?.list ?? [];
        return list.some((a) => a.id === agentId);
    }
    catch {
        return false;
    }
}
import { isValidAccountId } from "../src/config.js";
async function prompt(rl, question, defaultValue) {
    const suffix = defaultValue ? ` [${defaultValue}]` : "";
    const answer = (await rl.question(`${question}${suffix}: `)).trim();
    return answer || defaultValue || "";
}
async function confirm(rl, question, defaultYes = false) {
    const suffix = defaultYes ? " (Y/n)" : " (y/N)";
    const answer = (await rl.question(`${question}${suffix}: `)).trim().toLowerCase();
    if (!answer)
        return defaultYes;
    return answer === "y" || answer === "yes";
}
function printHelp() {
    console.log(`
WeChatPadPro OpenClaw Plugin — Setup Wizard (v1.1.0)

Usage:
  npm run setup                       Interactive menu
  npm run setup list                   List all configured accounts
  npm run setup add [accountId]        Add a new account
  npm run setup validate [accountId]   Validate account config + env vars
  npm run setup remove [accountId]     Remove account file
  npm run setup migrate [configPath]   Migrate v0.1.0 config.json → accounts/<id>.json (B 方案)

Examples:
  npm run setup
  npm run setup add alice
  npm run setup validate default
  npm run setup list
  npm run setup remove alice
  npm run setup migrate                  # 用 ./config.json + default id
  npm run setup migrate ./old-config.json  # 指定老路径

Notes:
  - accountId must match /^[a-zA-Z0-9_-]{1,64}$/ (path safety)
  - 凭证 (tokenKey/authcode) 走 env var, 不写 accounts/<id>.json
  - 部署后需 cp -a accounts/ + 重启 gateway 才生效
`);
}
function listAccounts() {
    const entries = listAccountsDetailed();
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
async function validateCmd(accountId) {
    const id = accountId || "default";
    if (!isValidAccountId(id)) {
        console.error(`✗ 无效 accountId: '${id}'`);
        return 1;
    }
    console.log(`验证账号 '${id}':\n`);
    const results = validateAccount(id);
    let pass = 0, warn = 0, fail = 0;
    for (const r of results) {
        const sym = r.level === "pass" ? "✓" : r.level === "warn" ? "⚠" : "✗";
        console.log(`  ${sym} ${r.label}${r.detail ? ` — ${r.detail}` : ""}`);
        if (r.level === "pass")
            pass++;
        else if (r.level === "warn")
            warn++;
        else
            fail++;
    }
    console.log(`\n结果: ${pass} pass, ${warn} warn, ${fail} fail`);
    return fail > 0 ? 1 : 0;
}
async function addAccount(suggestedId) {
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
        const groupAllowFromStr = await prompt(rl, "groupAllowFrom 群白名单 (逗号分隔, groupPolicy=allowlist 时用, 留空=不设)", "");
        const selfWxid = await prompt(rl, "selfWxid 机器人自己的 wxid (留空=vendor Login 后自动填)", "");
        const keywordTriggerStr = await prompt(rl, "keywordTrigger 关键词 (逗号分隔, 留空=禁用)", "");
        const keywordMode = (await prompt(rl, "  keywordTrigger.mode (exact/contains/regex, 默认 contains)", "contains")).toLowerCase();
        const msgTypeTriggerEnabled = (await prompt(rl, "msgTypeTrigger 启用 (true/false, 默认 false)", "false")).toLowerCase() === "true";
        const quoteBotTriggerEnabled = (await prompt(rl, "quoteBotTrigger 启用 (true/false, 默认 false)", "false")).toLowerCase() === "true";
        const blacklistGroupsStr = await prompt(rl, "blacklistGroups 黑名单群 (逗号分隔, 拒绝处理任何消息, 留空=不设)", "");
        const chatroomDebug = (await prompt(rl, "chatroomDebug 群调试模式 (true/false, 默认 false)", "false")).toLowerCase() === "true";
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
            groupAllowFrom: groupAllowFromStr ? groupAllowFromStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
            selfWxid: selfWxid || undefined,
            keywordTrigger: keywordTriggerStr
                ? { enabled: true, keywords: keywordTriggerStr.split(",").map((s) => s.trim()).filter(Boolean), mode: ["exact", "contains", "regex"].includes(keywordMode) ? keywordMode : "contains" }
                : undefined,
            msgTypeTrigger: msgTypeTriggerEnabled ? { enabled: true } : undefined,
            quoteBotTrigger: quoteBotTriggerEnabled ? { enabled: true } : undefined,
            blacklistGroups: blacklistGroupsStr ? blacklistGroupsStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
            chatroomDebug,
            allowFrom: allowFromStr ? allowFromStr.split(",").map((s) => s.trim()).filter(Boolean) : [],
            groupPolicy: (["open", "disabled", "allowlist"].includes(groupPolicyStr) ? groupPolicyStr : "open"),
            nickname,
            requireAtMention,
            debounceMs,
        };
        const errors = validateAddInput(input);
        if (errors.length > 0) {
            console.error("✗ 输入校验失败:");
            for (const e of errors)
                console.error(`  - ${e}`);
            return 1;
        }
        console.log(`\n将写 ${getAccountsDir()}/${id}.json:`);
        const { json } = await writeAccountFile(input);
        console.log(json);
        if (!(await confirm(rl, "确认写入", true))) {
            console.log("已取消");
            return 0;
        }
        console.log(`\n✓ 账号 '${id}' 已创建`);
        console.log(`\n下一步:`);
        console.log(`  1. 注入 env: export ${tokenKeyEnv}="<your_token_key>"`);
        console.log(`           export ${authcodeEnv}="<your_authcode>"`);
        if (webhookSecretEnv) {
            console.log(`           export ${webhookSecretEnv}="<your_webhook_secret>"`);
        }
        console.log(`  2. 部署: bash deploy-swap.sh --force`);
        console.log(`  3. 验证: npm run setup validate ${id}`);
        const agentId = input.agent ?? "wpp-wechat";
        const existsInOpenclaw = await checkAgentExistsInOpenclaw(agentId);
        if (existsInOpenclaw) {
            console.log(`\n⚠ 为新账号 '${id}' 准备的 agent '${agentId}' 已存在于 openclaw.json`);
            console.log(`\n  跳过 agent 创建 (一账号一 agent 原则)`);
        }
        else {
            console.log(`\n[Step 7/8] 同步创建 agent 目录 (id=${agentId})...`);
            const cloneQuestion = await confirm(rl, `从现有 agent 复制 workspace 模板? (留空跳=minimal /，输入 id 如 gewe-wechat)`, false);
            let cloneFrom;
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
            }
            catch (e) {
                console.error(`\n✗ agent 创建失败: ${e instanceof Error ? e.message : String(e)}`);
                console.log(`  (账号 ${id}.json 已写入, 可手动联调 openclaw-create-agent.sh)`);
            }
        }
        return 0;
    }
    finally {
        rl.close();
    }
}
async function removeCmd(accountId) {
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
    }
    finally {
        rl.close();
    }
}
async function migrateCmd(configPath) {
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
        if (r.webhookSecretEnv)
            console.log(`  webhookSecretEnv: ${r.webhookSecretEnv}`);
        if (r.warnings.length > 0) {
            console.log(`\n⚠ 警告 (${r.warnings.length}):`);
            for (const w of r.warnings)
                console.log(`  - ${w}`);
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
    }
    catch (e) {
        console.error(`✗ 迁移失败: ${e instanceof Error ? e.message : e}`);
        return 1;
    }
    finally {
        rl.close();
    }
}
async function showMenu() {
    const rl = createInterface({ input: stdin, output: stdout });
    try {
        console.log(`
WeChatPadPro OpenClaw Plugin — Setup Wizard
========================================

选择操作:
  1. List accounts
  2. Add new account
  3. Validate account
  4. Remove account
  5. Migrate (v0.1.0 → v1.1)
  6. Help
  7. Exit
`);
        const choice = (await rl.question("请输入 1-7 或子命令: ")).trim();
        rl.close();
        switch (choice) {
            case "1":
            case "list":
                listAccounts();
                return 0;
            case "2":
            case "add": return addAccount();
            case "3":
            case "validate": return validateCmd();
            case "4":
            case "remove": return removeCmd();
            case "5":
            case "migrate": return migrateCmd(args[0]);
            case "5":
            case "migrate": return migrateCmd();
            case "6":
            case "help":
                printHelp();
                return 0;
            case "7":
            case "exit":
            case "": return 0;
            default:
                console.error(`未知选项: ${choice}`);
                return 1;
        }
    }
    finally {
        rl.close();
    }
}
async function main() {
    const [subCmd, ...args] = process.argv.slice(2);
    let exitCode = 0;
    try {
        if (!subCmd || subCmd === "menu" || subCmd === "i") {
            exitCode = await showMenu();
        }
        else if (subCmd === "list" || subCmd === "ls") {
            listAccounts();
        }
        else if (subCmd === "add" || subCmd === "create") {
            exitCode = await addAccount(args[0]);
        }
        else if (subCmd === "validate" || subCmd === "v") {
            exitCode = await validateCmd(args[0]);
        }
        else if (subCmd === "remove" || subCmd === "rm") {
            exitCode = await removeCmd(args[0]);
        }
        else if (subCmd === "migrate") {
            exitCode = await migrateCmd(args[0]);
        }
        else if (subCmd === "help" || subCmd === "--help" || subCmd === "-h") {
            printHelp();
        }
        else {
            console.error(`未知子命令: ${subCmd}`);
            printHelp();
            exitCode = 1;
        }
    }
    catch (e) {
        console.error(`错误: ${e instanceof Error ? e.message : e}`);
        exitCode = 1;
    }
    if (exitCode > 0)
        exit(exitCode);
}
main();
