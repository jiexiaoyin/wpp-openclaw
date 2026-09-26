#!/usr/bin/env bash
# build-release.sh — WPP 插件发布版构建 (编译 + 脱敏 + 组装 release/ + 校验)
#
# 用途 (老板 2026-08-13 拍板: 每次更新 WPP 都同步 GitHub, release 必须脱敏):
#   1. tsc 编译 (确认 dist/ 最新)
#   2. 脱敏 dist/: 替换真实 host / bot 名 / 业务名 → 泛化占位
#   3. 组装 release/: dist + manifest + package.json + 保留脱敏模板 (accounts/config/db/docs/vendor)
#   4. 校验: 敏感扫描 (同 sync-github.sh 的 PERSONAL 正则), 有残留 exit 1
#
# 用法:
#   bash build-release.sh            # 完整构建
#   bash build-release.sh --check    # 只校验当前 release/ 是否干净
#   bash build-release.sh --help     # 帮助
#
# 脱敏 (v1.6.8, 2026-09-26 起): 规则**外置**在 $WPP_SANITIZE_RULES (默认 ~/.openclaw/wpp-sanitize.rules),
#   执行器 tools/sanitize-source.sh (本脚本与执行器都不含任何敏感串 ⇒ 可安全发布到公开仓)。
#   旧版把 PERSONAL 正则内联在本文件里, 而本文件自己在 GitHub 公开仓 master 分支 ⇒ 脚本本身即泄漏源。
#   覆盖: vendor host / bot 名 / 业务名 / 真实 wxid·登录名·邮箱 / 真实机器路径 / 真实群 ID
#   (具体串只存在于规则文件里 —— 本文件里一个字都不写, 这样本文件可原样发布)

set -e

cd "$(dirname "$0")"

DEVOPS_DIR="$(pwd)"
RELEASE_DIR="$DEVOPS_DIR/release"
BACKUP_ROOT="${BACKUP_ROOT:-/data}"
SANITIZER="$DEVOPS_DIR/tools/sanitize-source.sh"

# ============ 脱敏 / 扫描 (全部经外置规则执行器) ============
sanitize_tree() {
  [ -x "$SANITIZER" ] || { echo "✗ 缺 $SANITIZER"; exit 1; }
  bash "$SANITIZER" --apply "$1"
}

# 敏感扫描: 规则同源; 命中即阻止发布 (exit 1)
scan_release() {
  bash "$SANITIZER" --check "$RELEASE_DIR"
}

# ============ --check 模式 ============
if [ "$1" = "--check" ]; then
  echo "=== [check] 校验 release/ 敏感残留 ==="
  scan_release
  exit $?
fi

if [ "$1" = "--help" ] || [ "$1" = "-h" ]; then
  sed -n '1,35p' "$0"
  exit 0
fi

# ============ 步骤 1: tsc 编译 ============
echo "=== [1/4] tsc build ==="
rm -rf dist
npx tsc
JS_COUNT=$(find dist -name "*.js" 2>/dev/null | wc -l)
[ "$JS_COUNT" -eq 0 ] && { echo "✗ tsc 编译产物 0 个, 中止"; exit 1; }
echo "  编译产物: $JS_COUNT .js"

# ============ 步骤 2: 备份旧 release ============
TS=$(date +%Y%m%d-%H%M%S)
if [ -d "$RELEASE_DIR" ]; then
  BACKUP_DIR="$BACKUP_ROOT/wpp-release-backup-$TS"
  cp -a "$RELEASE_DIR" "$BACKUP_DIR"
  echo "=== [2/4] 旧 release 备份 → $BACKUP_DIR ==="
fi

# ============ 步骤 3: 组装 release/ + 脱敏 ============
echo "=== [3/4] 组装 release/ + 脱敏 ==="
rm -rf "$RELEASE_DIR"
mkdir -p "$RELEASE_DIR"

# 3a: dist (脱敏在 3g 统一做)
cp -a dist "$RELEASE_DIR/dist"

# 3b: 顶层文件
cp openclaw.plugin.json "$RELEASE_DIR/"
cp package.json "$RELEASE_DIR/"
cp config.json "$RELEASE_DIR/"
cp README.md "$RELEASE_DIR/" 2>/dev/null || true
cp USAGE.md "$RELEASE_DIR/" 2>/dev/null || true
cp GETTING_STARTED.md "$RELEASE_DIR/" 2>/dev/null || true
cp DEPLOY.md "$RELEASE_DIR/" 2>/dev/null || true
cp LICENSE "$RELEASE_DIR/" 2>/dev/null || true
cp -a deploy.sh "$RELEASE_DIR/" 2>/dev/null || true
cp -a deploy-swap.sh "$RELEASE_DIR/" 2>/dev/null || true

# 3c: accounts 模板 (只留 example, 不含真实凭证)
mkdir -p "$RELEASE_DIR/accounts"
cp accounts/default.json.example "$RELEASE_DIR/accounts/" 2>/dev/null || true

# 3d: db schema
cp -a db "$RELEASE_DIR/" 2>/dev/null || true

# 3e: scripts
cp -a scripts "$RELEASE_DIR/" 2>/dev/null || true

# 3f: images / vendor (脱敏示例文档保留)
cp -a images "$RELEASE_DIR/" 2>/dev/null || true
cp -a vendor "$RELEASE_DIR/" 2>/dev/null || true

# 3g: 整个 release/ 统一脱敏 (v1.6.8 起: 全树, 不再只挑 *.js/*.md — 旧清单漏过 dist/*.map 之类)
#     dist / 文档 / manifest / config / accounts 模板 / db / scripts / vendor 都在规则覆盖内
sanitize_tree "$RELEASE_DIR"

echo "  release/ 组装完成: $(find "$RELEASE_DIR" -name '*.js' | wc -l) .js"

# ============ 步骤 4: 校验 ============
echo "=== [4/4] 敏感扫描 ==="
scan_release

echo ""
echo "✅ build-release 完成"
echo "  release/: $RELEASE_DIR"
echo "  下一步: bash sync-github.sh --no-build   (同步 GitHub + /data)"
