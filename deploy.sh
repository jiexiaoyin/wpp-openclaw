#!/usr/bin/env bash
# deploy.sh — WeChatPadPro OpenClaw Plugin v1.0.1 部署脚本 (DRY-RUN ONLY)
#
# 用途:
#   - 验证 wechatpadpro-openclaw plugin 编译产物可被 OpenClaw gateway 加载
#   - 在不上 prod 的前提下做完整模拟 (build + manifest + dist integrity + ESM load)
#   - 仿 OpenClaw v2026.7.1+ deploy.sh 范式 (但默认 dry-run, 不动 /root/.openclaw/)
#   - 真实部署用 deploy-swap.sh (atomic swap 模式)
#
# 设计原则 (v1 deploy.sh 教训 + memory 备份铁律):
#   1. **DRY-RUN ONLY** — 默认不写 /root/.openclaw/, 不删任何源文件
#   2. **dist/ 可重生成** — build 是 deterministic, 失败可重跑
#   3. **备份归 /data** — 不放原路径 .bak (老板铁律)
#   4. **每个 step 独立 status** — 一个失败不阻塞其他 step, 最后汇总
#   5. **fail-fast on critical** — tsc / node --check / ESM load 失败立即退
#
# 使用:
#   bash deploy.sh                       # 默认 dry-run
#   bash deploy.sh --verbose             # 详细输出
#   bash deploy.sh --skip-build          # 跳过 npm run build (复用当前 dist)
#   bash deploy.sh --help                # 帮助
#
# 退出码:
#   0 = 全部通过, 可考虑真实部署 (用 deploy-swap.sh)
#   1 = critical step 失败 (build / load / manifest), 不要上 prod
#   2 = 非 critical warning (console.log / version mismatch 等)

set -u
# 不加 set -e — 每个 step 自己处理, 失败的进 error log 不退出

# ============ 颜色 / 符号 ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color
PASS="✔"
FAIL="✖"
WARN="⚠"
INFO="→"

# ============ 参数解析 ============
VERBOSE=0
SKIP_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --verbose|-v) VERBOSE=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --help|-h)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

# v1.3.55 RELEASE-GENERIC (2026-08-13): 接收方用自己的 OpenClaw 部署 — 根目录可 env 覆盖
OPENCLAW_ROOT="${OPENCLAW_ROOT:-$HOME/.openclaw}"

# ============ 状态收集 ============
declare -a STEP_RESULTS=()
declare -a STEP_WARNINGS=()
CRITICAL_FAIL=0

log_step() {
  local status="$1" name="$2" detail="${3:-}"
  case "$status" in
    PASS) echo -e "${GREEN}${PASS}${NC} ${name}${detail:+ — $detail}" ;;
    FAIL) echo -e "${RED}${FAIL}${NC} ${name}${detail:+ — $detail}" ;;
    WARN) echo -e "${YELLOW}${WARN}${NC} ${name}${detail:+ — $detail}" ;;
    INFO) echo -e "${BLUE}${INFO}${NC} ${name}${detail:+ — $detail}" ;;
  esac
  STEP_RESULTS+=("$status:$name")
  if [ "$status" = "FAIL" ]; then
    CRITICAL_FAIL=1
  fi
  if [ "$status" = "WARN" ]; then
    STEP_WARNINGS+=("$name: $detail")
  fi
}

log_verbose() {
  if [ "$VERBOSE" = 1 ]; then
    echo "    $1"
  fi
}

# ============ Preflight ============
echo "=========================================="
echo " wechatpadpro-openclaw deploy DRY-RUN"
echo " 时间: $(date -Iseconds)"
echo "=========================================="
echo ""

# 1. CWD 检查
if [ ! -f "package.json" ] || [ ! -f "openclaw.plugin.json" ]; then
  log_step FAIL "preflight" "必须在 /root/dev/wechatpadpro-openclaw/ 目录跑 (找不到 package.json 或 openclaw.plugin.json)"
  exit 1
fi
log_step PASS "preflight" "CWD = $(pwd)"

# 2. 检查 ${OPENCLAW_ROOT}/extensions/ 当前状态 (read-only 探测, 不写)
EXTENSIONS_DIR="${OPENCLAW_ROOT}/extensions"
WPP_EXT="${EXTENSIONS_DIR}/wechatpadpro"
if [ -d "$WPP_EXT" ]; then
  log_step INFO "extensions probe" "wechatpadpro 已在 prod (${WPP_EXT}) — dry-run 不动它"
else
  log_step INFO "extensions probe" "wechatpadpro 不在 prod (${OPENCLAW_ROOT} 下未找到)"
fi

# 3. 明确声明 dry-run
log_step INFO "DRY-RUN MODE" "永不动 ${OPENCLAW_ROOT}/, 永不动 src/, 只读 + rebuild dist/"

# ============ Build ============
echo ""
echo "--- build ---"

if [ "$SKIP_BUILD" = 1 ]; then
  log_step INFO "build" "skip-build 模式, 复用现有 dist/"
else
  BUILD_START=$(date +%s)
  if npm run build > /tmp/wpp-build.log 2>&1; then
    BUILD_END=$(date +%s)
    BUILD_DUR=$((BUILD_END - BUILD_START))
    log_step PASS "npm run build" "${BUILD_DUR}s"
    log_verbose "$(tail -3 /tmp/wpp-build.log)"
  else
    log_step FAIL "npm run build" "tsc 编译失败, 见 /tmp/wpp-build.log"
    tail -20 /tmp/wpp-build.log | sed 's/^/    /'
    exit 1
  fi
fi

# ============ Manifest 校验 ============
echo ""
echo "--- manifest ---"

if ! command -v jq >/dev/null 2>&1; then
  log_step WARN "manifest check" "jq 未装, 退化到 python json 校验"
  if python3 -c "import json; json.load(open('openclaw.plugin.json'))" >/dev/null 2>&1; then
    log_step PASS "manifest JSON parse" "python3 验证合法"
  else
    log_step FAIL "manifest JSON parse" "openclaw.plugin.json 不是合法 JSON"
    exit 1
  fi
else
  if jq empty openclaw.plugin.json 2>/dev/null; then
    log_step PASS "manifest JSON parse" "jq 验证合法"
  else
    log_step FAIL "manifest JSON parse" "openclaw.plugin.json 不是合法 JSON"
    exit 1
  fi
fi

# 关键字段校验
NAME=$(jq -r '.name // ""' openclaw.plugin.json)
ID=$(jq -r '.id // ""' openclaw.plugin.json)
VERSION=$(jq -r '.version // ""' openclaw.plugin.json)
KIND=$(jq -r '.kind // ""' openclaw.plugin.json)
PKG_VERSION=$(jq -r '.version // ""' package.json)

[ -n "$NAME" ] && log_step PASS "manifest.name" "= '$NAME'" || log_step FAIL "manifest.name" "缺失"
[ -n "$ID" ] && log_step PASS "manifest.id" "= '$ID'" || log_step FAIL "manifest.id" "缺失 (历史教训: status=78)"
[ -n "$VERSION" ] && log_step PASS "manifest.version" "= '$VERSION'" || log_step FAIL "manifest.version" "缺失"
[ "$KIND" = "plugin" ] || [ "$KIND" = "channel" ] && log_step PASS "manifest.kind" "= '$KIND'" || log_step FAIL "manifest.kind" "缺失或非 plugin/channel"

# version 一致性 (manifest vs package.json)
if [ "$VERSION" = "$PKG_VERSION" ]; then
  log_step PASS "version sync" "manifest=$VERSION = package.json"
else
  log_step WARN "version sync" "manifest=$VERSION ≠ package.json=$PKG_VERSION"
fi

# ============ Dist 完整性 ============
echo ""
echo "--- dist integrity ---"

if [ ! -f "dist/index.js" ]; then
  log_step FAIL "dist/index.js" "不存在 (build 没产物)"
  exit 1
fi
log_step PASS "dist/index.js" "$(wc -c < dist/index.js) bytes"

# 统计 .js 文件
JS_COUNT=$(find dist -name "*.js" -not -name "*.map" | wc -l)
MAP_COUNT=$(find dist -name "*.map" | wc -l)
DIST_SIZE=$(du -sh dist/ | cut -f1)
log_step INFO "dist stats" "$JS_COUNT .js + $MAP_COUNT .map = $DIST_SIZE"

# 验证每个 .js 都能 node --check (语法)
SYNTAX_FAIL=0
for js in $(find dist -name "*.js" -not -name "*.map"); do
  if ! node --check "$js" 2>/dev/null; then
    log_step FAIL "syntax check" "$js 有语法错"
    SYNTAX_FAIL=1
  fi
done
if [ "$SYNTAX_FAIL" = 0 ]; then
  log_step PASS "syntax check" "全部 $JS_COUNT 个 .js 文件 node --check 通过"
fi

# ============ ESM 加载模拟 ============
echo ""
echo "--- ESM load simulation ---"

LOAD_RESULT=$(node --input-type=module -e "
import p, { wppChannelPlugin, plugin } from './dist/index.js';
const out = {
  defaultType: typeof p,
  defaultId: p?.id,
  defaultVersion: p?.version,
  defaultHasRegister: typeof p?.register === 'function',
  channelId: wppChannelPlugin?.id,
  channelKind: wppChannelPlugin?.kind,
  channelMethods: wppChannelPlugin ? Object.keys(wppChannelPlugin).join(',') : 'none',
  pluginId: plugin?.id,
  pluginHasRegister: typeof plugin?.register === 'function',
};
console.log(JSON.stringify(out));
" 2>&1)
LOAD_EXIT=$?

if [ "$LOAD_EXIT" = 0 ]; then
  LOAD_INFO=$(echo "$LOAD_RESULT" | tail -1)
  log_step PASS "ESM load" "$LOAD_INFO"

  # G3.5+ 验证: default export = plugin (manifest wrapper), named export = wppChannelPlugin
  DEFAULT_HAS_REGISTER=$(echo "$LOAD_INFO" | jq -r '.defaultHasRegister // false')
  CHANNEL_ID_LOAD=$(echo "$LOAD_INFO" | jq -r '.channelId // ""')
  CHANNEL_KIND=$(echo "$LOAD_INFO" | jq -r '.channelKind // ""')
  CHANNEL_METHODS=$(echo "$LOAD_INFO" | jq -r '.channelMethods // ""')
  PLUGIN_HAS_REGISTER=$(echo "$LOAD_INFO" | jq -r '.pluginHasRegister // false')

  [ "$PLUGIN_HAS_REGISTER" = "true" ] && log_step PASS "plugin.register(api)" "v2026.7.1 manifest 必需" || log_step FAIL "plugin.register(api)" "plugin 缺 register 函数"
  [ "$DEFAULT_HAS_REGISTER" = "true" ] && log_step PASS "default = plugin" "default export 是 plugin manifest" || log_step FAIL "default = plugin" "default export 不是 plugin"

  [ "$CHANNEL_ID_LOAD" = "$ID" ] && log_step PASS "wppChannelPlugin.id match" "= '$CHANNEL_ID_LOAD'" || log_step FAIL "wppChannelPlugin.id match" "load=$CHANNEL_ID_LOAD vs manifest=$ID"
  # kind: wppChannelPlugin.kind 应是 'channel' (channel provider 类型, OpenClaw v2026.7.1+ 范式)
  case "$CHANNEL_KIND" in
    channel) log_step PASS "wppChannelPlugin.kind" "= 'channel'" ;;
    *) log_step FAIL "wppChannelPlugin.kind" "= '$CHANNEL_KIND' (非 'channel')" ;;
  esac

  for m in start stop sendText sendImage buildSessionKey; do
    echo "$CHANNEL_METHODS" | grep -q "$m" || log_step FAIL "wppChannelPlugin.method missing" "$m"
  done
  echo "$CHANNEL_METHODS" | grep -q "start" && \
    echo "$CHANNEL_METHODS" | grep -q "stop" && \
    echo "$CHANNEL_METHODS" | grep -q "sendText" && \
    echo "$CHANNEL_METHODS" | grep -q "sendImage" && \
    echo "$CHANNEL_METHODS" | grep -q "buildSessionKey" && \
    log_step PASS "wppChannelPlugin 5 methods" "start/stop/sendText/sendImage/buildSessionKey 全在"
else
  log_step FAIL "ESM load" "node import 失败, 见下方输出"
  echo "$LOAD_RESULT" | sed 's/^/    /'
  exit 1
fi

# ============ 调用 wppChannelPlugin.start() 看错误路径 ============
echo ""
echo "--- wppChannelPlugin.start() 错误路径 ---"

START_RESULT=$(env -u WECHATPRO_DB_PASSWORD node --input-type=module -e "
import { wppChannelPlugin } from './dist/index.js';
try {
  await wppChannelPlugin.start({ agentId: 'dryrun' });
  console.log('NO_ERROR');
} catch (e) {
  console.log('ERROR:' + e.message);
}
" 2>&1)
START_EXIT=$?

if echo "$START_RESULT" | grep -q "ERROR:.*password\|ERROR:.*WECHATPRO_DB_PASSWORD\|ERROR:.*missing"; then
  log_step PASS "plugin.start error path" "返清晰 DB 凭证 error (符合预期)"
  log_verbose "error msg: $(echo "$START_RESULT" | grep '^ERROR:' | head -1)"
elif echo "$START_RESULT" | grep -q "NO_ERROR"; then
  log_step WARN "plugin.start error path" "意外成功 (可能 WECHATPRO_DB_PASSWORD 已被 env 注入)"
else
  log_step FAIL "plugin.start error path" "未返回预期 error 模式"
  echo "$START_RESULT" | sed 's/^/    /'
fi

# ============ forensic / 非 critical 检查 ============
echo ""
echo "--- forensic ---"

# console.log 统计 (informational, 不阻断)
CONSOLE_COUNT=$(grep -r "console\.log" dist --include="*.js" 2>/dev/null | wc -l)
if [ "$CONSOLE_COUNT" -gt 0 ]; then
  log_step INFO "console.log in dist" "$CONSOLE_COUNT 处 (informational, 非 critical)"
else
  log_step PASS "console.log in dist" "0 处 (logger 化彻底)"
fi

# process.exit (应该有 0 处)
EXIT_COUNT=$(grep -rn "process\.exit" dist --include="*.js" 2>/dev/null | wc -l)
if [ "$EXIT_COUNT" = 0 ]; then
  log_step PASS "process.exit in dist" "0 处"
else
  log_step WARN "process.exit in dist" "$EXIT_COUNT 处 (plugin 进程不应自己 exit)"
  grep -rln "process\.exit" dist --include="*.js" | head -5 | sed 's/^/    /'
fi

# any 类型残留 (informational)
ANY_COUNT=$(grep -rn " any" src --include="*.ts" 2>/dev/null | grep -v "// " | grep -v "/\*" | wc -l)
log_step INFO "any types in src" "$ANY_COUNT 处 (informational)"

# 验证 openclaw.plugin.json 不含敏感字段泄漏
SENSITIVE_LEAK=$(jq -r '.configSchema.properties.storage.db.mariadb.properties.password // ""' openclaw.plugin.json)
[ -z "$SENSITIVE_LEAK" ] && log_step PASS "manifest no password field" "configSchema 不含明文 password 字段" || log_step WARN "manifest password" "configSchema 含 password 字段 (env-only 应通过 passwordEnv)"

# ============ 总结 ============
echo ""
echo "=========================================="
echo " 总结"
echo "=========================================="
TOTAL=${#STEP_RESULTS[@]}
PASS_COUNT=$(printf '%s\n' "${STEP_RESULTS[@]}" | grep -c "^PASS:")
FAIL_COUNT=$(printf '%s\n' "${STEP_RESULTS[@]}" | grep -c "^FAIL:")
WARN_COUNT=$(printf '%s\n' "${STEP_RESULTS[@]}" | grep -c "^WARN:")
INFO_COUNT=$(printf '%s\n' "${STEP_RESULTS[@]}" | grep -c "^INFO:")

echo -e "  ${GREEN}PASS${NC}: $PASS_COUNT"
echo -e "  ${RED}FAIL${NC}: $FAIL_COUNT"
echo -e "  ${YELLOW}WARN${NC}: $WARN_COUNT"
echo -e "  ${BLUE}INFO${NC}: $INFO_COUNT"
echo "  TOTAL: $TOTAL"

if [ "$CRITICAL_FAIL" = 1 ]; then
  echo ""
  echo -e "${RED}✖ DRY-RUN FAIL — critical step(s) failed${NC}"
  echo "  详见上方 FAIL 项. 回滚命令:"
  echo "    tar xzf /data/wechatpadpro-pre-v1.0-gphase-*.tar.gz -C /root/dev/"
  exit 1
fi

if [ "$WARN_COUNT" -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}⚠ DRY-RUN PASS with warnings${NC}"
  echo "  上 prod 前建议 review:"
  printf '    - %s\n' "${STEP_WARNINGS[@]}"
  exit 2
fi

echo ""
echo -e "${GREEN}✔ DRY-RUN PASS — 全部 step 通过, 0 警告${NC}"
echo ""
echo "可考虑真实部署 (推荐用 deploy-swap.sh --force, 自动处理上述步骤):"
echo "  1. 备份当前 prod: cp -a ${OPENCLAW_ROOT}/extensions/wechatpadpro \${BACKUP_ROOT:-/data}/wpp-prod-backup-\$(date +%s)"
echo "  2. 部署: bash deploy-swap.sh --force"
echo "  3. 验证: journalctl --user -u \${GATEWAY_SERVICE:-openclaw-gateway} -n 50"
exit 0
