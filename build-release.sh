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
# 脱敏映射 (dev 真实 → release 泛化):
#   wx.juhe.chat            → WPP_VENDOR_HOST.example.com  (vendor host, env 可覆盖)
#   接晓银 (intent-llm)      → 微信机器人                    (bot 名泛化, 分类逻辑不受影响)
#   益融 (relay 注释示例)     → XX                         (示例文本泛化)

set -e

cd "$(dirname "$0")"

DEVOPS_DIR="$(pwd)"
RELEASE_DIR="$DEVOPS_DIR/release"
BACKUP_ROOT="${BACKUP_ROOT:-/data}"

# ============ 敏感串 (必须脱敏) ============
# 与 sync-github.sh PERSONAL 对齐; 命中即阻止上传
PERSONAL="q139198824|wxid_eezdbu1ytws422|wxid_dbdmq8riblxo12|71bed0f5|56Z8kt5ySirXyyGj|jsnjzhou|zhuqixia520520|益融|淮安|盱眙|接晓银|juhe\.chat|/root/silk"

# ============ 脱敏替换函数 ============
# 参数: 目标文件
sanitize_file() {
  local f="$1"
  # vendor host 默认值 → 泛化占位 (保留 process.env.WPP_VENDOR_HOST 读取逻辑)
  sed -i 's|"wx\.juhe\.chat"|"WPP_VENDOR_HOST.example.com"|g' "$f"
  sed -i 's|https://wx\.juhe\.chat|https://WPP_VENDOR_HOST.example.com|g' "$f"
  sed -i 's|wss://wx\.juhe\.chat|wss://WPP_VENDOR_HOST.example.com|g' "$f"
  # 注释里的 vendor host
  sed -i 's|wx\.juhe\.chat|WPP_VENDOR_HOST.example.com|g' "$f"
  # bot 名泛化 (intent-llm system prompt)
  sed -i 's|微信机器人接晓银|微信机器人|g' "$f"
  sed -i 's|@接晓银|@机器人|g' "$f"
  # 业务名泛化 (注释/示例)
  sed -i 's|益融|XX|g' "$f"
  sed -i 's|盱眙|XX|g' "$f"
  # 个人信息 (wxid/手机号片段)
  sed -i 's|q139198824|USER_PLACEHOLDER|g' "$f"
  sed -i 's|wxid_eezdbu1ytws422|WXID_PLACEHOLDER|g' "$f"
  sed -i 's|wxid_dbdmq8riblxo12|WXID_PLACEHOLDER|g' "$f"
  sed -i 's|jsnjzhou|USER_PLACEHOLDER|g' "$f"
  sed -i 's|zhuqixia520520|USER_PLACEHOLDER|g' "$f"
  # silk 编解码器路径 (真实机器路径)
  sed -i 's|/root/silk|/usr/local/silk|g' "$f"
}

# ============ 敏感扫描 ============
scan_release() {
  local leaks
  leaks=$(grep -rlE "$PERSONAL" "$RELEASE_DIR" --exclude-dir=.git 2>/dev/null \
    | grep -vE 'vendor/README|GETTING_STARTED|DEPLOY|FACE-LOGIN|^\./README|release/vendor/README' | head -5 || true)
  if [ -n "$leaks" ]; then
    echo "✗ 敏感残留, 阻止发布:"
    echo "$leaks"
    return 1
  fi
  echo "  ✓ 敏感扫描通过"
  return 0
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

# 3a: dist (脱敏后)
cp -a dist "$RELEASE_DIR/dist"
find "$RELEASE_DIR/dist" -name "*.js" | while read -r f; do sanitize_file "$f"; done

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

# 3g: 清理 release 里的敏感残留 (脱敏 release 顶层文档)
for f in "$RELEASE_DIR"/*.md "$RELEASE_DIR"/scripts/*.js "$RELEASE_DIR"/deploy*.sh; do
  [ -f "$f" ] && sanitize_file "$f"
done

echo "  release/ 组装完成: $(find "$RELEASE_DIR" -name '*.js' | wc -l) .js"

# 3h: manifest 脱敏 (openclaw.plugin.json: vendor host 默认值 / 描述里的业务名)
sed -i 's|https://wx\.juhe\.chat|https://WPP_VENDOR_HOST.example.com|g; s|wss://wx\.juhe\.chat|wss://WPP_VENDOR_HOST.example.com|g; s|wx\.juhe\.chat|WPP_VENDOR_HOST.example.com|g; s|益融|XX|g' "$RELEASE_DIR/openclaw.plugin.json"

# ============ 步骤 4: 校验 ============
echo "=== [4/4] 敏感扫描 ==="
scan_release

echo ""
echo "✅ build-release 完成"
echo "  release/: $RELEASE_DIR"
echo "  下一步: bash sync-github.sh --no-build   (同步 GitHub + /data)"
