#!/usr/bin/env bash
# scripts/mm-health-check.sh - WeChatPadPro vendor MMTLS 长链存活检查
#
# 用法: bash scripts/mm-health-check.sh
# 返回: 0=健康, 1=异常
#
# 监控 4 项:
#   1. vendor binary outbound TCP 到微信服务器 (核心)
#   2. plugin WS 进程存活
#   3. journal 30min 内无 push dispatcher 异常
#   4. webhook 端口可触达
#
# 部署 cron: */5 * * * * /root/dev/wechatpadpro-openclaw/scripts/mm-health-check.sh >> /var/log/wpp-health.log 2>&1

set -uo pipefail

VENDOR_CONTAINER="${WPP_VENDOR_CONTAINER:-wechatpadpromax08}"
WEBHOOK_HOST="${WPP_WEBHOOK_HOST:-127.0.0.1}"
WEBHOOK_PORT="${WPP_WEBHOOK_PORT:-4398}"
WEBHOOK_PATH="${WPP_WEBHOOK_PATH:-/wechatpadpro/default/webhook}"

RED='\033[0;31m'
YELLOW='\033[0;33m'
GREEN='\033[0;32m'
NC='\033[0m'

issues=0
log() {
  local level="$1"; shift
  local msg="$1"
  case "$level" in
    OK)   printf "${GREEN}[OK]${NC} %s\n" "$msg" ;;
    WARN) printf "${YELLOW}[WARN]${NC} %s\n" "$msg"; issues=$((issues+1)) ;;
    ERR)  printf "${RED}[ERR]${NC} %s\n" "$msg"; issues=$((issues+1)) ;;
  esac
}

echo "===== WPP vendor MMTLS 健康检查 $(date -Iseconds) ====="

# 1. vendor 容器是否运行
if ! docker ps --format '{{.Names}}' | grep -q "^${VENDOR_CONTAINER}$"; then
  log ERR "vendor 容器 ${VENDOR_CONTAINER} 不在运行"
else
  log OK "vendor 容器 ${VENDOR_CONTAINER} 运行中"
fi

# 2. vendor binary outbound TCP 连接 (核心 MMTLS 长链指标)
#    微信服务器常用 IP 段: 101.226.x.x / 180.97.x.x / 121.51.x.x / 183.192.x.x 等
#    实测 vendor 用的是 101.226.144.240:80 / 180.101.242.227:80 (2026-08-08 22:33 实测)
outbound=$(docker exec "$VENDOR_CONTAINER" sh -c "netstat -an 2>/dev/null | grep -E 'ESTABLISHED|ESTAB' | grep -E '101\.226\.|180\.97\.|180\.101\.|121\.51\.|183\.192\.|short\.weixin|long\.weixin|wx\.qq|qq\.com' | wc -l" 2>/dev/null || echo "0")
outbound=$(echo "$outbound" | tr -d '[:space:]')
if [[ "$outbound" -ge 1 ]]; then
  log OK "vendor MMTLS outbound 连接 ${outbound} 条"
else
  log ERR "vendor MMTLS outbound = 0 (vendor 长链死亡, 推送链路断了)"
  echo "  → 排查: docker logs ${VENDOR_CONTAINER} --tail 100 | grep -E 'MMTLS|disconnect|reconnect'"
fi

# 3. plugin 进程存活 (openclaw-gateway 是 systemd 服务, 通过 systemctl 检测)
if systemctl --user is-active openclaw-gateway > /dev/null 2>&1; then
  log OK "openclaw-gateway systemd 服务 active"
elif pgrep -f "openclaw.*extensions" > /dev/null 2>&1; then
  log OK "openclaw-gateway 进程存活"
else
  log ERR "openclaw-gateway 进程不存在"
fi

# 4. journal 30min 内无 push dispatcher fatal
fatal_count=$(journalctl -u openclaw-gateway --since "30min ago" --no-pager -q 2>/dev/null | grep -ciE 'MMTLS.*disconnect|push dispatcher.*fatal|channel exited.*error')
fatal_count=${fatal_count:-0}
if [[ "$fatal_count" -eq 0 ]]; then
  log OK "journal 30min 内无 push dispatcher fatal"
else
  log WARN "journal 30min 内有 ${fatal_count} 条 push dispatcher 异常"
fi

# 5. webhook 端口触达
http_code=$(curl -s -m 5 -o /dev/null -w "%{http_code}" -X POST "${WEBHOOK_HOST}:${WEBHOOK_PORT}${WEBHOOK_PATH}" -H 'Content-Type: application/json' -d '{}' 2>/dev/null || echo "000")
if [[ "$http_code" == "200" || "$http_code" == "400" || "$http_code" == "401" ]]; then
  log OK "webhook 端口触达 HTTP ${http_code}"
else
  log ERR "webhook 端口不可触达 HTTP ${http_code}"
fi

echo "===== 总结: ${issues} 个 issue ====="
[[ "$issues" -eq 0 ]] && exit 0 || exit 1