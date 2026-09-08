#!/usr/bin/env bash
# sync-github.sh — 每次 WPP 插件更新后, 一键同步 GitHub 公开仓库 jiexiaoyin/wpp-openclaw
#
# 用途 (老板 2026-08-13 拍板: 以后每次更新 WPP 都同步 GitHub):
#   1. 重建 release/ (build-release.sh: 编译 + 脱敏 + vendor + 文档 + 校验)
#   2. 同步 /data 发布包 + zip
#   3. 同步 GitHub 仓库 (jiexiaoyin 身份, commit + push)
#
# 用法:
#   bash sync-github.sh            # 完整同步 (重建 + /data + GitHub)
#   bash sync-github.sh --no-build # 跳过重建, 复用当前 release/ (快速同步)
#   bash sync-github.sh --dry-run  # 只重建 + 比较, 不 push / 不写 /data
#
# 前置: build-release.sh 的 [8/6] 脱敏校验通过 (有敏感残留会 exit 1, 阻止上传)
# 凭证: 走 git credential store (jiexiaoyin token)

set -e

cd "$(dirname "$0")"

GIT_REPO="https://github.com/jiexiaoyin/wpp-openclaw.git"
MIRROR_DIR="${WPP_GITHUB_MIRROR:-/root/git/wpp-openclaw}"   # 本地镜像 clone
# v1.4.0 12:53 老板拍板 C: 移除硬编码凭证. jiexiaoyin 身份已在本地镜像 .git/config 里 (按 6-08 23:49 + 8-09 06-21 偏好, 避免 .netrc 等复杂凭证管理, 依赖 git 原生机制)
TS="$(date +%Y%m%d)"
DATA_DIR="/data/wpp-plugin-release-${TS}"

DRY_RUN=0
NO_BUILD=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-build) NO_BUILD=1 ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

# ============ [1/3] 重建 release ============
if [ "$NO_BUILD" -eq 0 ]; then
  echo "=== [1/3] build-release.sh (重建 release/ + 脱敏校验) ==="
  bash build-release.sh
else
  echo "=== [1/3] 跳过重建 (复用当前 release/) ==="
fi

# ============ [2/3] 同步 /data ============
if [ "$DRY_RUN" -eq 1 ]; then
  echo "=== [2/3] (dry-run) 跳过 /data 写入 ==="
else
  echo "=== [2/3] 同步 /data → ${DATA_DIR}/ + .zip ==="
  rm -rf "$DATA_DIR"
  cp -a release "$DATA_DIR"
  cd /data && rm -f "wpp-plugin-release-${TS}.zip"
  python3 - "$TS" <<'PY'
import zipfile, os, sys
ts = sys.argv[1]
src = f'wpp-plugin-release-{ts}'
with zipfile.ZipFile(f'wpp-plugin-release-{ts}.zip', 'w', zipfile.ZIP_DEFLATED) as z:
    for root, dirs, files in os.walk(src):
        for f in files:
            z.write(os.path.join(root, f))
PY
  cd - >/dev/null
  echo "  ✓ /data/wpp-plugin-release-${TS}/ + .zip (共 $(du -sh "${DATA_DIR}" | cut -f1))"
fi

# ============ [3/3] 同步 GitHub ============
echo "=== [3/3] GitHub 同步 → ${GIT_REPO} ==="

# 确保本地镜像 clone 存在
if [ ! -d "$MIRROR_DIR/.git" ]; then
  echo "  首次: clone 到 ${MIRROR_DIR}"
  mkdir -p "$(dirname "$MIRROR_DIR")"
  git clone "$GIT_REPO" "$MIRROR_DIR"
fi
cd "$MIRROR_DIR"
git fetch origin 2>/dev/null || true
BRANCH="$(git remote show origin 2>/dev/null | awk -F': ' '/HEAD branch/{print $2}')"
[ -z "$BRANCH" ] && BRANCH="main"
git checkout -q "$BRANCH"

# release/ → 镜像 (--delete 保证镜像 = release/, 无多余文件)
rsync -a --delete --exclude=.git /root/dev/wechatpadpro-openclaw/release/ "$MIRROR_DIR/"

# 上传前最终敏感扫描 (双保险)
# 排除: 官方平台地址 adminmax.knowhub.cloud (产品公开名, 部署引导文档/默认配置引用, 拿 tokenKey/authcode 必用) — 非个性化泄漏, 已公开于仓库 HEAD
# 2026-09-06 修正: 去掉过宽的 adminmax|knowhub — v1.5.3 起被误拦 (官方平台名就在 dist/api/client.js dist/core/constants.js openclaw.plugin.json 默认值里, 与 build-release.sh 权威门对齐)
PERSONAL="q139198824|wxid_eezdbu1ytws422|wxid_dbdmq8riblxo12|71bed0f5|56Z8kt5ySirXyyGj|jsnjzhou|zhuqixia520520|益融|淮安|盱眙|接晓银|juhe\.chat|/root/silk"
LEAK=$(grep -rlE "$PERSONAL" . --exclude-dir=.git 2>/dev/null | grep -vE 'vendor/README|GETTING_STARTED|DEPLOY|FACE-LOGIN|^\./README' | head -3)
if [ -n "$LEAK" ]; then
  echo "✗ 敏感残留, 阻止上传:"
  echo "$LEAK"
  exit 1
fi
echo "  ✓ 敏感扫描通过"

git add -A
if git diff --cached --quiet; then
  echo "  ℹ 无变更, 跳过 commit/push (GitHub 已是最新)"
else
  echo "  ✓ 变更: $(git diff --cached --stat | tail -1)"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  (dry-run) 不 commit/push"
  else
    # v1.4.0 12:53 老板拍板 C: 不再传 -c user.name/email, 让 git 自动从本地镜像 .git/config 读
    git commit -q -m "sync: WPP 插件更新 (build-release.sh 重建, ${TS})"
    # git push 网络不稳 → 重试 3 次
    for i in 1 2 3; do
      if git push origin "$BRANCH" 2>&1; then
        echo "  ✓ push 成功 ($(git rev-parse --short HEAD))"
        break
      fi
      echo "  ⚠ push 失败 (尝试 $i/3), 5s 后重试..."
      sleep 5
    done
  fi
fi

echo ""
echo "✅ 同步完成: GitHub ($GIT_REPO) + /data + release/ 三处一致"
