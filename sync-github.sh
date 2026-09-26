#!/usr/bin/env bash
# sync-github.sh — 每次 WPP 插件更新后, 一键同步 GitHub 公开仓库 jiexiaoyin/wpp-openclaw
#
# 用途 (老板 2026-08-13 拍板: 以后每次更新 WPP 都同步 GitHub):
#   1. 重建 release/ (build-release.sh: 编译 + 脱敏 + vendor + 文档 + 校验)
#   2. 同步 /data 发布包 + zip
#   3. 同步 GitHub main 分支 (脱敏 release/)
#   4. 同步 GitHub master 分支 (脱敏**源码**快照, v1.6.8 新增 —— 见下)
#
# 用法:
#   bash sync-github.sh            # 完整同步 (重建 + /data + GitHub 双分支)
#   bash sync-github.sh --no-build # 跳过重建, 复用当前 release/ (快速同步)
#   bash sync-github.sh --dry-run  # 只重建 + 比较, 不 push / 不写 /data
#   bash sync-github.sh --main-only # 只同步 main (旧行为)
#
# 脱敏 (v1.6.8, 2026-09-26): 规则外置在 ~/.openclaw/wpp-sanitize.rules (WPP_SANITIZE_RULES 可覆盖),
#   执行器 tools/sanitize-source.sh。本脚本不再内联任何敏感串。
#   ⚠️ 血泪: 2026-09-26 发现**旧版本脚本自己**把 PERSONAL 正则 (含生产密钥前缀) 内联在文件里,
#      而它在公开仓 master 分支 ⇒ 公开仓被自己人泄了 62 个提交。任何"要发布的文件"都不得内联敏感串。
#
# 前置: build-release.sh 的脱敏校验通过 + 两个分支的快照都过 sanitize-source.sh --check (有残留 exit 1)
#       新建的提交还要过 tools/check-commit-metadata.sh (作者/提交者邮箱, 不看文件内容)
# 凭证: 走 git credential store (jiexiaoyin token)

set -e

cd "$(dirname "$0")"

GIT_REPO="https://github.com/jiexiaoyin/wpp-openclaw.git"
MIRROR_DIR="${WPP_GITHUB_MIRROR:-/root/git/wpp-openclaw}"   # 本地镜像 clone
# v1.4.0 12:53 老板拍板 C: 移除硬编码凭证. jiexiaoyin 身份已在本地镜像 .git/config 里 (按 6-08 23:49 + 8-09 06-21 偏好, 避免 .netrc 等复杂凭证管理, 依赖 git 原生机制)
TS="$(date +%Y%m%d)"
DATA_DIR="/data/wpp-plugin-release-${TS}"
DEV_DIR="/root/dev/wechatpadpro-openclaw"
SANITIZER="$DEV_DIR/tools/sanitize-source.sh"   # 绝对路径: 后面会 cd 到镜像仓

# master (源码分支) 发布快照的排除项 —— 只发**源码**, 不发依赖/产物/本机运行期配置
#   node_modules/ coverage/ release/ dist-release/ : 依赖与构建产物 (历史里曾有 130M+, 已从 master 历史移除)
#   accounts/default.json : 本机运行期账号配置 (真实 wxid / 管理员 / 群白名单); 公开仓只保留 .example
SOURCE_EXCLUDES=(--exclude='.git/' --exclude='node_modules/' --exclude='coverage/'
                 --exclude='release/' --exclude='dist-release/' --exclude='accounts/default.json')

DRY_RUN=0
NO_BUILD=0
MAIN_ONLY=0

# 提交后门: 校验刚建的提交的**作者/提交者邮箱**与提交信息 (2026-09-26 二次事故).
#   文件内容门 (--check 全树) 看不见 git 元数据 —— 当时镜像仓 .git/config 的 user.email 是老板个人 gmail,
#   每次同步新建的提交都把 gmail 又带回已脱敏的历史里 (main 27 个提交 + master 1 个提交中招)。
#   不通过 ⇒ 撤销该提交并中止 (不 push), 由人修 .git/config 后重跑。
require_clean_commit() {
  if ! bash "$DEV_DIR/tools/check-commit-metadata.sh" "$MIRROR_DIR" HEAD; then
    echo "  撤销本次提交 (改动仍在暂存区); 修: git config user.email jiexiaoyin@users.noreply.github.com"
    git reset --soft HEAD~1
    exit 1
  fi
}
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --no-build) NO_BUILD=1 ;;
    --main-only) MAIN_ONLY=1 ;;
    *) echo "unknown arg: $arg"; exit 2 ;;
  esac
done

# ============ [1/4] 重建 release ============
if [ "$NO_BUILD" -eq 0 ]; then
  echo "=== [1/4] build-release.sh (重建 release/ + 脱敏校验) ==="
  bash build-release.sh
else
  echo "=== [1/4] 跳过重建 (复用当前 release/) ==="
fi

# ============ [2/4] 同步 /data ============
if [ "$DRY_RUN" -eq 1 ]; then
  echo "=== [2/4] (dry-run) 跳过 /data 写入 ==="
else
  echo "=== [2/4] 同步 /data → ${DATA_DIR}/ + .zip ==="
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

# ============ [3/4] 同步 GitHub main (脱敏 release) ============
echo "=== [3/4] GitHub main 同步 (脱敏 release/) → ${GIT_REPO} ==="

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
rsync -a --delete --exclude=.git "$DEV_DIR/release/" "$MIRROR_DIR/"

# 上传前最终敏感扫描 (双保险): 规则外置, 无豁免清单 (v1.6.8 起 --check 覆盖全树)
bash "$SANITIZER" --check "$MIRROR_DIR" || { echo "✗ 敏感残留, 阻止上传"; exit 1; }

git add -A
if git diff --cached --quiet; then
  echo "  ℹ 无变更, 跳过 commit/push (GitHub main 已是最新)"
else
  echo "  ✓ 变更: $(git diff --cached --stat | tail -1)"
  if [ "$DRY_RUN" -eq 1 ]; then
    echo "  (dry-run) 不 commit/push"
  else
    # v1.4.0 12:53 老板拍板 C: 不再传 -c user.name/email, 让 git 自动从本地镜像 .git/config 读
    git commit -q -m "sync: WPP 插件更新 (build-release.sh 重建, ${TS})"
    require_clean_commit
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

# ============ [4/4] 同步 GitHub master (脱敏**源码**快照) ============
# v1.6.8 (2026-09-26) 新增: 旧版只同步 main ⇒ master (源码分支) 靠手工 push, 每次都可能夹带个人串
#   (2026-09-26 实测: master 62 个提交从 Initial commit 起全部带个人信息, 46 个文件命中)。
#   现在: 源码 → 临时目录 → 排除依赖/产物/本机配置 → 脱敏 → 门上校验 → 原样镜像到 master。
if [ "$MAIN_ONLY" -eq 1 ]; then
  echo "=== [4/4] (--main-only) 跳过 master 源码分支 ==="
else
  echo "=== [4/4] GitHub master 同步 (脱敏源码快照) ==="
  SNAP_DIR="$(mktemp -d /tmp/wpp-src-snapshot-XXXXXX)"
  trap 'rm -rf "$SNAP_DIR"' EXIT
  rsync -a "${SOURCE_EXCLUDES[@]}" "$DEV_DIR/" "$SNAP_DIR/"
  bash "$SANITIZER" --apply "$SNAP_DIR"           # 脱敏 (就地改快照, 不动 dev)
  bash "$SANITIZER" --check "$SNAP_DIR" || { echo "✗ 源码快照敏感残留, 阻止上传"; exit 1; }

  cd "$MIRROR_DIR"
  if git show-ref --verify --quiet refs/heads/master; then
    git checkout -q master
  else
    echo "  本地无 master ⇒ 从 origin/master 检出"
    git checkout -q -b master origin/master
  fi
  # 防御: 确认真的在 master 上 (rsync --delete 会抹平工作树, 打错分支就毁了)
  [ "$(git rev-parse --abbrev-ref HEAD)" = "master" ] || { echo "✗ 不在 master 分支, 中止"; exit 1; }
  rsync -a --delete --exclude=.git "$SNAP_DIR/" "$MIRROR_DIR/"
  git add -A
  if git diff --cached --quiet; then
    echo "  ℹ 无变更, 跳过 commit/push (GitHub master 已是最新)"
  elif [ "$DRY_RUN" -eq 1 ]; then
    echo "  (dry-run) 不 commit/push; 变更: $(git diff --cached --stat | tail -1)"
  else
    echo "  ✓ 变更: $(git diff --cached --stat | tail -1)"
    git commit -q -m "chore(source): 同步 dev 源码快照 (脱敏, ${TS})"
    require_clean_commit
    # DEV.md §6: 推送用 --force-with-lease 而非 --force (master 曾被重写, 防覆盖别人/自己的新提交)
    for i in 1 2 3; do
      if git push --force-with-lease origin master 2>&1; then
        echo "  ✓ push 成功 master ($(git rev-parse --short HEAD))"
        break
      fi
      echo "  ⚠ push 失败 (尝试 $i/3), 5s 后重试..."
      sleep 5
    done
  fi
fi

echo ""
echo "✅ 同步完成: GitHub (main + master) + /data + release/ 四处一致"
