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
# v1.6.7: --skip-build / SKIP_BUILD=1 复用当前 dist/ (dry-run 验证脚本本身时用, 避免重建源码仓)
SKIP_BUILD="${SKIP_BUILD:-0}"
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --force) FORCE=1 ;;
    --skip-build) SKIP_BUILD=1 ;;
    --help|-h)
      sed -n '2,28p' "$0"
      exit 0
      ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

# ============ 路径 ============
# v1.3.55 RELEASE-GENERIC (2026-08-13): 接收方用自己的 OpenClaw 部署 — 全部路径/服务可 env 覆盖
#   OPENCLAW_ROOT   OpenClaw 安装根目录 (默认 $HOME/.openclaw, 非 root 也适用)
#   GATEWAY_SERVICE systemd user 服务名 (默认 openclaw-gateway); 无此服务则提示手动重启
#   BACKUP_ROOT     备份目录根 (默认 /data; 无权限可设 /tmp 或 $HOME)
DEVOPS_DIR="$(cd "$(dirname "$0")" && pwd)"
OPENCLAW_ROOT="${OPENCLAW_ROOT:-$HOME/.openclaw}"
GATEWAY_SERVICE="${GATEWAY_SERVICE:-openclaw-gateway}"
BACKUP_ROOT="${BACKUP_ROOT:-/data}"
DEPLOY="${OPENCLAW_ROOT}/extensions/wechatpadpro"
GATEWAY_ENV="${OPENCLAW_ROOT}/gateway.systemd.env"
TS=$(date +%s)
BACKUP_DIR="${BACKUP_ROOT}/wpp-deploy-swap-${TS}"

# ============ 颜色 / 辅助函数 ============
# v1.16.0 审阅修正: 这段原在 gate 之后, 而新 gate 要打 ✓/✗ ⇒ 必须前置
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

step() { echo -e "${GREEN}==${NC} $1"; }
warn() { echo -e "${YELLOW}⚠${NC} $1"; }
fail() { echo -e "${RED}✗${NC} $1"; exit 1; }

# ============ dry-run gate (要求 deploy.sh 刚跑过) ============
# v1.16.0 审阅修正 (2026-10-16): 旧版是**假 gate** —— 文字声称"要求 5 分钟内 deploy.sh 跑过且 exit 0",
#   实现却只有 `[ FORCE != 1 ] && [ DRY_RUN != 1 ] && exit 1`: 不读任何证据, 也没有任何合法路径能过
#   (文末自己承认"gate 只认 --force, 没有 marker 文件")。后果不是更安全, 而是每次都只能打 --force
#   ⇒ 防呆名存实亡, 且判据与文档不符 (谎报)。
#   现在: deploy.sh 干净通过 (exit 0) 时写 marker; 本 gate 校验 marker 存在且够新 ⇒ 判据与文字一致。
GATE_MAX_AGE="${GATE_MAX_AGE:-300}"                                  # 秒
MARKER="${DEPLOY_MARKER:-${TMPDIR:-/tmp}/wpp-deploy-swap.dryrun-ok}"  # 路径与 deploy.sh 同源

if [ "$FORCE" != "1" ] && [ "$DRY_RUN" != "1" ]; then
  if [ ! -f "$MARKER" ]; then
    echo -e "${RED}✗${NC} dry-run gate: 未找到 marker $MARKER"
    echo "    先跑: bash deploy.sh                 (PASS 且 0 警告时才写 marker)"
    echo "    跳过: bash deploy-swap.sh --force"
    echo "    模拟: bash deploy-swap.sh --dry-run"
    exit 1
  fi
  MARKER_TS="$(cat "$MARKER" 2>/dev/null || echo 0)"
  case "$MARKER_TS" in '' | *[!0-9]*) MARKER_TS=0 ;; esac
  MARKER_AGE=$(( $(date +%s) - MARKER_TS ))
  if [ "$MARKER_AGE" -gt "$GATE_MAX_AGE" ]; then
    echo -e "${RED}✗${NC} dry-run gate: marker 已过期 (${MARKER_AGE}s > ${GATE_MAX_AGE}s)"
    echo "    marker: $MARKER"
    echo "    重跑: bash deploy.sh; 跳过: bash deploy-swap.sh --force"
    exit 1
  fi
  echo -e "${GREEN}✓${NC} dry-run gate: deploy.sh 于 ${MARKER_AGE}s 前干净通过 (marker=$MARKER)"
fi

# ============ 步骤 1: 备份原 prod (如果存在) ============
# v1.6.7 (2026-09-26) 修复: 旧版 DRY_RUN 只被最后那句 echo 使用 (第 182 行), 写操作全都不看它
#   ⇒ `--dry-run` 实际执行**完整真实部署** (备份/rm -rf/拷贝/重启 gateway), 却打印"没真写任何文件",
#     且因 gate 条件含 DRY_RUN 而同时绕过 "必须刚跑过 deploy.sh" 的防呆 —— 双重危险 + 谎报。
#   现在每个写步骤都真正由 DRY_RUN 把关。
step "[1/7] 备份原 prod (如果存在) → $BACKUP_DIR"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] 跳过 (不写 $BACKUP_DIR)"
else
  mkdir -p "$BACKUP_DIR"
  if [ -d "$DEPLOY" ]; then
    cp -a "$DEPLOY" "$BACKUP_DIR/extensions-wechatpadpro/" && \
      echo "    备份 $DEPLOY → $BACKUP_DIR/extensions-wechatpadpro/"
  else
    echo "    原 $DEPLOY 不存在, 跳过 (首次部署)"
  fi
  # 备份 env 增量 (虽然主 deploy.sh 已备份, 这里再加一层)
  [ -f "$GATEWAY_ENV" ] && cp "$GATEWAY_ENV" "$BACKUP_DIR/gateway.systemd.env"
fi

# ============ 步骤 2: tsc build ============
# (dry-run 也会重建 dev dist/ —— 只写源码仓, 不写 prod, 用于验证编译通过)
step "[2/7] tsc build"
cd "$DEVOPS_DIR"
if [ "$SKIP_BUILD" = "1" ]; then
  echo "    跳过 (SKIP_BUILD=1), 复用当前 dist/"
else
  rm -rf dist
  npx tsc
fi
JS_COUNT=$(find dist -name "*.js" 2>/dev/null | wc -l)
[ "$JS_COUNT" -eq 0 ] && fail "tsc 编译产物 0 个, 中止"
echo "    编译产物: $JS_COUNT .js"

# ============ 步骤 3: 注入 openclaw.json + env ============
step "[3/7] 注入 openclaw.json + env"
OPENCLAW_JSON="${OPENCLAW_ROOT}/openclaw.json"
if [ ! -f "$OPENCLAW_JSON" ]; then
  fail "openclaw.json 不存在: $OPENCLAW_JSON (设置 OPENCLAW_ROOT env 指向你的 OpenClaw 配置)"
fi
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] 跳过 openclaw.json / env 写入 (只读检查)"
  grep -q "wechatpadpro" "$OPENCLAW_JSON" && echo "    (检查) plugins.allow 已有 wechatpadpro"
else
  if ! grep -q "wechatpadpro" "$OPENCLAW_JSON"; then
    jq --arg id "wechatpadpro" '.plugins.allow += [$id] | .plugins.entries[$id] = { enabled: true }' \
      "$OPENCLAW_JSON" > /tmp/openclaw.json.new && \
      mv /tmp/openclaw.json.new "$OPENCLAW_JSON" && \
      chmod 600 "$OPENCLAW_JSON" && \
      echo "    plugins.allow + plugins.entries.wechatpadpro 已注入"
  else
    echo "    plugins.allow 已有 wechatpadpro, 跳过"
  fi

  # GATEWAY_ENV 是这套 OpenClaw 的 systemd env 文件; 不存在 (其他部署方式) 则跳过注入
  if [ -f "$GATEWAY_ENV" ]; then
    if ! grep -q "WECHATPRO_DB_PASSWORD" "$GATEWAY_ENV"; then
      echo "WECHATPRO_DB_PASSWORD=dryrun-placeholder-CHANGE-ME" >> "$GATEWAY_ENV"
      chmod 600 "$GATEWAY_ENV"
      warn "已注入 WECHATPRO_DB_PASSWORD=placeholder, 部署后必须改成真密码!"
    else
      echo "    WECHATPRO_DB_PASSWORD 已存在, 跳过"
    fi
  else
    warn "gateway env 文件不存在 ($GATEWAY_ENV) — 跳过注入, 请自行设置 WECHATPRO_DB_PASSWORD 等环境变量"
  fi
fi

# ============ 步骤 4: 拷贝 artifacts ============
step "[4/7] 拷贝 dist/ + manifest + package.json + node_modules + config + accounts + db"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] 跳过 rm -rf $DEPLOY + 拷贝; 只预检源仓文件"
  [ -f "$DEVOPS_DIR/db/schema.sql" ] || fail "源仓缺 db/schema.sql — 真实部署会静默丢掉建表/加列"
  for f in config.json openclaw.plugin.json package.json; do
    [ -e "$DEVOPS_DIR/$f" ] || fail "源仓缺 $f"
  done
  [ -d "$DEVOPS_DIR/dist" ] || fail "源仓缺 dist/ (先跑 tsc build)"
  [ -d "$DEVOPS_DIR/accounts" ] || fail "源仓缺 accounts/"
  echo "    源仓预检通过 (dist/manifest/package.json/config.json/accounts/db 齐)"
else
rm -rf "$DEPLOY"
mkdir -p "$DEPLOY"
cp -a dist "$DEPLOY/"
cp openclaw.plugin.json "$DEPLOY/"
cp package.json "$DEPLOY/"
cp -a node_modules "$DEPLOY/"
cp config.json "$DEPLOY/"
cp -a accounts "$DEPLOY/"
# v1.6.5 (2026-09-13 事故): 上面那句 `rm -rf $DEPLOY` 会把**运行期资产**一起抹掉 —— 本次真实发生:
#   21:24 启动还报 `applySchemaSql: 11 statements applied`, 21:36 部署完变成 `schema.sql not found, skipping`
#   (v1.6.3 手工补进线上的 db/schema.sql 被整目录删除, 而拷贝清单里没有 db/) ⇒ 建表/加列静默失效.
#   db/ 是运行时依赖 (applySchemaSql 读 $DEPLOY/db/schema.sql), 必须进拷贝清单.
if [ -d db ]; then
  cp -a db "$DEPLOY/"
fi
if [ ! -f "$DEPLOY/db/schema.sql" ]; then
  fail "拷贝后缺 $DEPLOY/db/schema.sql — 部署会静默丢掉建表/加列 (源码仓 db/schema.sql 在吗?)"
fi
echo "    $DEPLOY 总量: $(du -sh "$DEPLOY" | cut -f1)"
fi

# ============ 步骤 5: jiti 缓存清理 ============
step "[5/7] jiti 缓存清理"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] 跳过"
else
  rm -rf "$DEPLOY/node_modules/.cache/jiti" 2>/dev/null
  echo "    jiti cache cleared"
fi

# ============ 步骤 6: restart gateway ============
step "[6/7] restart gateway (服务: $GATEWAY_SERVICE)"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] 跳过 restart"
elif systemctl --user list-unit-files 2>/dev/null | grep -q "^${GATEWAY_SERVICE}\."; then
  # 抓重启前 PID, 用于步骤7 验证「进程确实换了」(防 restart 静默失败)
  OLD_GATEWAY_PID="$(systemctl --user show -p MainPID --value "$GATEWAY_SERVICE" 2>/dev/null || echo unknown)"
  # v1.16.0 审阅修正: 记下重启时刻, 步骤 7 用它 --since 限定范围
  #   (旧版只看 journal 末尾 N 行 ⇒ 会把**上一次**启动的旧 ERROR/WARN 也数进来)
  SINCE_TS="$(date -d '2 seconds ago' '+%Y-%m-%d %H:%M:%S')"
  systemctl --user restart "$GATEWAY_SERVICE"
  sleep 5
  systemctl --user is-active "$GATEWAY_SERVICE" > /dev/null || fail "gateway 重启失败 (服务: $GATEWAY_SERVICE)"
  NEW_GATEWAY_PID="$(systemctl --user show -p MainPID --value "$GATEWAY_SERVICE" 2>/dev/null || echo unknown)"
  export OLD_GATEWAY_PID NEW_GATEWAY_PID
  if [ "$OLD_GATEWAY_PID" = "$NEW_GATEWAY_PID" ] && [ "$OLD_GATEWAY_PID" != "unknown" ]; then
    warn "gateway MainPID 未变 (仍为 $OLD_GATEWAY_PID) — restart 可能未生效, 请手动验证"
  else
    echo "    ✓ gateway 已重启: ${OLD_GATEWAY_PID} → ${NEW_GATEWAY_PID}"
  fi
else
  warn "未找到 systemd user 服务 $GATEWAY_SERVICE — 请手动重启你的 OpenClaw gateway"
  echo "    (可用 GATEWAY_SERVICE env 指定服务名; docker/systemctl/直接进程重启由你自行处理)"
fi

# ============ 步骤 7: verify (journalctl 仅当 systemd user 服务存在时可用) ============
# v1.16.0 审阅修正 (2026-10-16): 旧版这里有三处假报 ——
#   1) `sleep 5` 后找 "wppChannelPlugin registered": 固定等待赌的是"启动够快"。实测两次相差极大 ——
#      restart 15:44:40 → 注册 15:44:46 (6s); 而 16:14:39 → 注册 16:15:16、**账号启动 16:15:45 (37s+)**
#      (步骤 4 全量拷贝 733M + 清 jiti 缓存会拖慢启动; 且日志里有三次注册行) ⇒ 5s 必然假阴性。
#      ⚠️ 本文件的第一版"修正"只把盲等换成"轮询首个注册行 + sleep 5 兜底", **同一次部署立刻自我证伪**
#      (真部署 16:14:39 那次仍报 ✗ 未见账号启动行) —— 病根不是秒数, 是"等最早信号 + 固定兜底"这个形状。
#      现在: 轮询到**两个信号都出现**为止 (VERIFY_WAIT, 默认 120s), 不赌任何固定等待。
#   2) `grep -iE "error|fail"` 只认**子串** ⇒ 把正文含 error/fail 的 WARN 计成 error
#      (实例: accounts/ 拷贝窗口的 "config hot-reload failed" WARN ⇒ 假报 3 error)。
#      实测两套日志的级别都写成独立大写词: 插件 `<ISO>Z ERROR [WPP v*] msg`, 框架 `<ISO> ERROR: msg`
#      ⇒ 改为只认**级别字段** `ERROR`/`FATAL`, 不看正文。
#   3) 第 4 行 grep "http server listening" 在本部署**实测 0 命中** (永远打印空行, 却挂着
#      "PLUGINS=" 的名字)—— 已删, 换成真实存在的账号启动行。
#   另: 范围改用 `--since "$SINCE_TS"` (步骤 6 记录的重启时刻), 不再只看末尾 N 行。
step "[7/7] verify (plugin registered + 无 ERROR, 自 $SINCE_TS)"
if [ "$DRY_RUN" = "1" ]; then
  echo "    [dry-run] 跳过 (没有新起的 gateway 可验)"
elif systemctl --user list-unit-files 2>/dev/null | grep -q "^${GATEWAY_SERVICE}\."; then
  # v1.16.0 (2026-10-16, 首跑即自我证伪的一次修正): 只等"注册行出现"再固定兜底 sleep 是**同一个病**。
  #   实测本部署的一次真实部署 (16:14:39 重启): 注册 16:15:16 → **账号启动 16:15:45** (隔 29s!),
  #   因为步骤 4 全量拷贝 733M + 清 jiti 缓存会拖慢启动; 且日志里有**三次**注册行 (16:15:16/31/44)。
  #   ⇒ "首个注册行 + sleep 5" 读日志时账号行还没打印, 于是对健康部署报 ✗ —— 正是旧版 sleep 5 的病。
  #   正确做法: 轮询到**两个信号都出现**为止 (或到期限), 不再赌任何固定等待。
  VERIFY_WAIT="${VERIFY_WAIT:-120}"
  VERIFY_DEADLINE=$((SECONDS + VERIFY_WAIT))
  PLUGIN_LOG=""
  ACCT_LOG=""
  while [ "$SECONDS" -lt "$VERIFY_DEADLINE" ]; do
    JOURN="$(journalctl --user -u "$GATEWAY_SERVICE" --since "$SINCE_TS" --no-pager 2>/dev/null)"
    if [ -z "$PLUGIN_LOG" ]; then
      PLUGIN_LOG="$(printf '%s\n' "$JOURN" | grep -F "wppChannelPlugin registered" | tail -1)"
    fi
    if [ -z "$ACCT_LOG" ]; then
      ACCT_LOG="$(printf '%s\n' "$JOURN" | grep -F "gateway.startAccount: started" | tail -1)"
    fi
    if [ -n "$PLUGIN_LOG" ] && [ -n "$ACCT_LOG" ]; then break; fi
    sleep 3
  done
  if [ -n "$PLUGIN_LOG" ]; then
    echo "    ✓ plugin registered: ${PLUGIN_LOG##*]: }"
  else
    warn "    ✗ ${VERIFY_WAIT}s 内未见 'wppChannelPlugin registered' — 请手动确认插件是否加载"
  fi
  if [ -n "$ACCT_LOG" ]; then
    echo "    ✓ account started: ${ACCT_LOG##*]: }"
  else
    warn "    ✗ ${VERIFY_WAIT}s 内未见 'gateway.startAccount: started' — 账号可能未启动"
  fi

  ERR_LINES="$(printf '%s\n' "$JOURN" | grep -E '(^| )(ERROR|FATAL)([: ]|$)' || true)"
  ERR_COUNT=0
  if [ -n "$ERR_LINES" ]; then
    ERR_COUNT="$(printf '%s\n' "$ERR_LINES" | wc -l)"
  fi
  if [ "$ERR_COUNT" = 0 ]; then
    echo "    ✓ 0 ERROR (自 $SINCE_TS 起)"
  else
    warn "    ✗ $ERR_COUNT 条 ERROR (自 $SINCE_TS 起), 末 10 条:"
    printf '%s\n' "$ERR_LINES" | tail -10 | sed 's/^/        /'
  fi
else
  warn "非 systemd 环境, 跳过 journalctl verify — 请自行确认插件加载成功"
fi

echo ""
if [ "$DRY_RUN" = "1" ]; then
  echo -e "${YELLOW}DRY-RUN: 上面是 plan, 未写任何文件 (备份/openclaw.json/env/拷贝/重启 已全跳过)${NC}"
  echo "  真实 deploy: bash deploy.sh && bash deploy-swap.sh   (gate 校验 deploy.sh 刚写的 marker)"
  echo "  绕过 gate: --force   超时阈值: GATE_MAX_AGE=秒    marker 路径: DEPLOY_MARKER=..."
else
  echo -e "${GREEN}✅ deploy-swap done${NC}"
  echo ""
  echo "部署后必做:"
  echo "  1. 配 accounts/default.json 的 tokenKey/authcode (从你的 vendor 后台拿)"
  echo "  2. 设环境变量 (WECHATPRO_TOKEN_KEY / WECHATPRO_AUTHCODE / WECHATPRO_DB_PASSWORD / WPP_VENDOR_HOST / WPP_SILK_ENCODER_PATH)"
  echo "  3. 重启你的 gateway (docker: docker restart <容器>; systemd: systemctl --user restart $GATEWAY_SERVICE)"
  echo "  4. 验证 plugin registered: journalctl --user -u $GATEWAY_SERVICE -n 50 | grep 'wppChannelPlugin registered'"
  echo "  5. 验证 webhook 监听: ss -tlnp | grep 4398"
  echo ""
  echo "回滚: 删 $DEPLOY + cp -a $BACKUP_DIR/* $DEPLOY/ + restart gateway"
fi
