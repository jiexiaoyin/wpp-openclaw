#!/usr/bin/env bash
# deploy-swap.sh — WeChatPadPro OpenClaw Plugin v1.0.1 真实 atomic 部署脚本
#
# 用途:
#   - deploy.sh 验证通过后, 用本脚本做真实 atomic deploy
#   - 仿 OpenClaw v2026.7.1+ deploy-swap.sh 范式 (7 step + atomic rename)
#   - 自动备份原 prod 到 /data, 上传新 dist, restart gateway, verify
#
# ⚠️ WARNING: 这是 **真实部署** 脚本, 会写 /root/.openclaw/ + restart gateway
#   - 默认要求 deploy.sh dry-run 跑过 (exit 0)
#   - 用 --force 跳过 dry-run gate (老板手动确认后才用)
#   - 用 --dry-run 模拟 (不真写)
#
# 老板铁律:
#   1. 备份放 /data (不放原路径 .bak) — 强制
#   2. DB 凭证单一来源 env (WECHATPRO_DB_PASSWORD) — 必须从 .env 或 systemd env 来
#   3. 不动 /root/.openclaw/openclaw.json — 这是网关核心配置, 部署时也不能改
#
# 使用:
#   bash deploy-swap.sh                 # 真实 deploy (要求 deploy.sh 刚跑过)
#   bash deploy-swap.sh --dry-run       # 只打印 step, 不真写
#   bash deploy-swap.sh --force         # 跳过 dry-run gate
#   bash deploy-swap.sh --help          # 帮助

set -e

# ============ 参数解析 ============
DRY_RUN=0
FORCE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --help|-h)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

# ============ 路径 ============
DEVOPS_DIR="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="/root/.openclaw/extensions/wechatpadpro"
GATEWAY_ENV="/root/.openclaw/gateway.systemd.env"
TS=$(date +%s)
BACKUP_DIR="/data/wpp-deploy-swap-${TS}"

# ============ dry-run gate (要求 deploy.sh 刚跑过) ============
# 防呆: 强制先跑 deploy.sh, 确认 build/manifest/load 都 PASS
if [ "$FORCE" != "1" ] && [ "$DRY_RUN" != "1" ]; then
  echo "⚠️  deploy-swap.sh 是真实部署脚本 (会写 /root/.openclaw/ + restart gateway)"
  echo ""
  echo "要求: 5 分钟内 bash deploy.sh 跑过且 exit 0"
  echo "跳过此 gate: bash deploy-swap.sh --force"
  echo "模拟模式: bash deploy-swap.sh --dry-run"
  exit 1
fi

# ============ 颜色 ============
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "${GREEN}==${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ============ 步骤 1: 备份原 prod (如果存在) ============
step "[1/7] 备份原 prod (如果存在) → $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
if [ -d "$DEPLOY" ]; then
  cp -a "$DEPLOY" "$BACKUP_DIR/extensions-wechatpadpro/" && \
    echo "    备份 $DEPLOY → $BACKUP_DIR/extensions-wechatpadpro/"
else
  echo "    原 $DEPLOY 不存在, 跳过 (首次部署)"
fi
# 备份 env 增量 (虽然主 deploy.sh 已备份, 这里再加一层)
[ -f "$GATEWAY_ENV" ] && cp "$GATEWAY_ENV" "$BACKUP_DIR/gateway.systemd.env"

# ============ 步骤 2: tsc build ============
step "[2/7] tsc build"
cd "$DEVOPS_DIR"
rm -rf dist
npx tsc
JS_COUNT=$(find dist -name "*.js" 2>/dev/null | wc -l)
[ "$JS_COUNT" -eq 0 ] && fail "tsc 编译产物 0 个, 中止"
echo "    编译产物: $JS_COUNT .js"

# ============ 步骤 3: 注入 openclaw.json + env ============
step "[3/7] 注入 openclaw.json + env"
OPENCLAW_JSON="/root/.openclaw/openclaw.json"
if ! grep -q "wechatpadpro" "$OPENCLAW_JSON"; then
  jq --arg id "wechatpadpro" '.plugins.allow += [$id] | .plugins.entries[$id] = { enabled: true }' \
    "$OPENCLAW_JSON" > /tmp/openclaw.json.new && \
    mv /tmp/openclaw.json.new "$OPENCLAW_JSON" && \
    chmod 600 "$OPENCLAW_JSON" && \
    echo "    plugins.allow + plugins.entries.wechatpadpro 已注入"
else
  echo "    plugins.allow 已有 wechatpadpro, 跳过"
fi

if ! grep -q "WECHATPRO_DB_PASSWORD" "$GATEWAY_ENV"; then
  echo "WECHATPRO_DB_PASSWORD=dryrun-placeholder-CHANGE-ME" >> "$GATEWAY_ENV"
  chmod 600 "$GATEWAY_ENV"
  warn "已注入 WECHATPRO_DB_PASSWORD=placeholder, 部署后必须改成真密码!"
else
  echo "    WECHATPRO_DB_PASSWORD 已存在, 跳过"
fi

# ============ 步骤 4: 拷贝 artifacts ============
step "[4/7] 拷贝 dist/ + manifest + package.json + node_modules + config + accounts"
rm -rf "$DEPLOY"
mkdir -p "$DEPLOY"
cp -a dist "$DEPLOY/"
cp openclaw.plugin.json "$DEPLOY/"
cp package.json "$DEPLOY/"
cp -a node_modules "$DEPLOY/"
cp config.json "$DEPLOY/"
cp -a accounts "$DEPLOY/"
echo "    $DEPLOY 总量: $(du -sh "$DEPLOY" | cut -f1)"

# ============ 步骤 5: jiti 缓存清理 ============
step "[5/7] jiti 缓存清理"
rm -rf "$DEPLOY/node_modules/.cache/jiti" 2>/dev/null
echo "    jiti cache cleared"

# ============ 步骤 6: restart gateway ============
step "[6/7] restart gateway"
systemctl --user restart openclaw-gateway
sleep 5
systemctl --user is-active openclaw-gateway > /dev/null || fail "gateway 重启失败"

# ============ 步骤 7: verify ============
step "[7/7] verify (plugin registered + 无 error)"
sleep 5
PLUGIN_LOG=$(journalctl --user -u openclaw-gateway -n 50 --no-pager 2>&1 | grep "wppChannelPlugin registered" | tail -1)
[ -n "$PLUGIN_LOG" ] && echo "    ✓ $PLUGIN_LOG" || warn "    ✗ plugin registered log 未找到"

ERROR_COUNT=$(journalctl --user -u openclaw-gateway -n 50 --no-pager 2>&1 | grep -iE "wechatpadpro" | grep -iE "error|fail" | wc -l)
[ "$ERROR_COUNT" = 0 ] && echo "    ✓ 0 error" || warn "    ✗ $ERROR_COUNT error"

PLUGINS=$(journalctl --user -u openclaw-gateway -n 30 --no-pager 2>&1 | grep "http server listening" | tail -1)
echo "    $PLUGINS"

echo ""
if [ "$DRY_RUN" = "1" ]; then
  echo -e "${YELLOW}DRY-RUN: 上面只是 plan, 没真写任何文件${NC}"
  echo "  真实 deploy: bash deploy-swap.sh --force (绕过 gate)"
else
  echo -e "${GREEN}✅ deploy-swap done${NC}"
  echo ""
  echo "部署后必做 (5 件事):"
  echo "  1. 改 WECHATPRO_DB_PASSWORD 到真密码: sudo nano $GATEWAY_ENV"
  echo "  2. 配 accounts/default.json 的 tokenKey/authcode (从 vendor 后台拿)"
  echo "  3. 重启 gateway: systemctl --user restart openclaw-gateway"
  echo "  4. 验证 plugin registered: journalctl --user -u openclaw-gateway -n 50 | grep 'WPP v1.0.1'"
  echo "  5. 验证 webhook 监听: ss -tlnp | grep 4398"
  echo ""
  echo "回滚: 删 $DEPLOY + cp -a $BACKUP_DIR/* $DEPLOY/ + restart gateway"
fi
