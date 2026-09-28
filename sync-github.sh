#!/usr/bin/env bash
# sync-github.sh — 每次 WPP 插件更新后, 一键同步 GitHub 公开仓库 jiexiaoyin/wpp-openclaw
#
# 用途 (老板 2026-08-13 拍板: 以后每次更新 WPP 都同步 GitHub):
#   1. 重建 release/ (build-release.sh: 编译 + 脱敏 + vendor + 文档 + 校验)
#   2. 同步 /data 发布包 + zip
#   3. 同步 GitHub main 分支 (脱敏 release/)
#   4. 同步 GitHub master 分支 (脱敏**源码**快照, 2026-09-26 新增 —— 见下)
#
# 用法:
#   bash sync-github.sh            # 完整同步 (重建 + /data + GitHub 双分支)
#   bash sync-github.sh --no-build # 跳过重建, 复用当前 release/ (快速同步)
#   bash sync-github.sh --dry-run  # 只重建 + 比较, 不 push / 不写 /data
#   bash sync-github.sh --main-only # 只同步 main (旧行为)
#
# 脱敏 (2026-09-26): 规则外置在 ~/.openclaw/wpp-sanitize.rules (WPP_SANITIZE_RULES 可覆盖),
#   执行器 tools/sanitize-source.sh。本脚本不再内联任何敏感串。
#   ⚠️ 血泪: 2026-09-26 发现**旧版本脚本自己**把 PERSONAL 正则 (含生产密钥前缀) 内联在文件里,
#      而它在公开仓 master 分支 ⇒ 公开仓被自己人泄了 62 个提交。任何"要发布的文件"都不得内联敏感串。
#
# 前置: build-release.sh 的脱敏校验通过 + 两个分支的快照都过 sanitize-source.sh --check (有残留 exit 1)
#       + 镜像仓的**所有 tag** 都过 sanitize-source.sh --check-tags (STRICT; 2026-09-28 接线)
#       新建的提交还要过 tools/check-commit-metadata.sh (作者/提交者邮箱, 不看文件内容)
# 凭证: 走 git credential store (jiexiaoyin token)

set -e

cd "$(dirname "$0")"

GIT_REPO="git@github.com:jiexiaoyin/wpp-openclaw.git"   # 2026-09-27: 改走 SSH (本机 key 已验证可用); HTTPS 无 credential store 会挂住
MIRROR_DIR="${WPP_GITHUB_MIRROR:-/root/git/wpp-openclaw}"   # 本地镜像 clone
# v1.4.0 12:53 老板拍板 C: 移除硬编码凭证. jiexiaoyin 身份已在本地镜像 .git/config 里 (按 6-08 23:49 + 8-09 06-21 偏好, 避免 .netrc 等复杂凭证管理, 依赖 git 原生机制)
TS="$(date +%Y%m%d)"
DATA_DIR="/data/wpp-plugin-release-${TS}"
DEV_DIR="/root/dev/wechatpadpro-openclaw"
SANITIZER="$DEV_DIR/tools/sanitize-source.sh"   # 绝对路径: 后面会 cd 到镜像仓

# master (源码分支) 发布快照的排除项 —— 只发**源码**, 不发依赖/产物/本机运行期配置
#   node_modules/ coverage/ release/ dist-release/ : 依赖与构建产物 (历史里曾有 130M+, 已从 master 历史移除)
#   accounts/default.json : 本机运行期账号配置 (真实 wxid / 管理员 / 群白名单); 公开仓只保留 .example
#   dist/ 与 src/**/*.js (2026-09-28): tsc 编译产物与编译残留.
#     为何必须显式列出 —— **rsync 不读 .gitignore**. 下面 L157 的 rsync 只认本数组,
#     于是 .gitignore:15 (dist/) 与 :25 (src/**/*.js) 对发布路径完全失效:
#       dev 仓 git 跟踪的 dist/*.js = 0 个, 而 master 快照实际含 147 个 dist/*.js
#       + 35 个 src/*.js + 182 个 .map (共 364 个文件纯由 rsync 带上去).
#     风险: 这些产物绕过脱敏 (sanitize-source.sh 的 SKIP_DIRS 亦未排除),
#     而 dist/ 内联真实 URL/ID (见 .gitignore:15 注释). 且 src/*.js 是被误信的过期逻辑.
SOURCE_EXCLUDES=(--exclude='.git/' --exclude='node_modules/' --exclude='coverage/'
                 --exclude='release/' --exclude='dist-release/' --exclude='accounts/default.json'
                 --exclude='dist/' --exclude='**/*.map'
                 # src 下 35 个 .js 全部有对应 .ts (实测 0 孤儿) = 纯编译残留;
                 #   两行都要: rsync 的 '**' 要求中间夹目录, 只写 src/**/*.js 会漏掉 src/ 根层 6 个
                 #   (实测漏 config.js/llm-judge.js/db.js/api-client.js/account-state.js/types.js).
                 #   scripts/setup.js 是手写脚本, 必须保留 -> 用 src/ 前缀限定, 不用 '*.js'.
                 --exclude='src/*.js' --exclude='src/**/*.js')

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
# dry-run 为了给出**真实** diff, 会把文件写进镜像工作树 (后面步骤用 git diff --cached 统计),
#   但 dry-run **不提交** ⇒ 结束时必须把镜像还原, 否则下一次真跑会在下面这行 `git checkout` 处
#   被"local changes would be overwritten"挡住 (2026-09-26 实测踩到)。
DRY_ORIG_BRANCH="$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo HEAD)"
git fetch origin 2>/dev/null || true
BRANCH="$(git remote show origin 2>/dev/null | awk -F': ' '/HEAD branch/{print $2}')"
[ -z "$BRANCH" ] && BRANCH="main"
git checkout -q "$BRANCH"

# release/ → 镜像 (--delete 保证镜像 = release/, 无多余文件)
rsync -a --delete --exclude=.git "$DEV_DIR/release/" "$MIRROR_DIR/"

# 上传前最终敏感扫描 (双保险): 规则外置, 无豁免清单 (v1.6.8 起 --check 覆盖全树)
WPP_SANITIZE_STRICT=1 bash "$SANITIZER" --check "$MIRROR_DIR" || { echo "✗ 敏感残留, 阻止上传"; exit 1; }

# 上传前 tag 校验 (2026-09-28 接线): 分支 tip 干净 != tag 干净.
#   2026-09-26 的历史重写只重写了 master **分支**, tag 从未重写 ⇒ 5 个公开 tag
#   (v1.4.0/v1.4.1/v1.4.2/v1.5.0/v1.5.4-complete) 仍指向含明文 API key 的旧提交.
#   而三层出口门 (pre-commit / 本脚本 / check-commit-metadata) 扫的都是工作树与分支,
#   没有任何一层扫 tag —— 9db61fa 补了这道门, 但**从未接线**, 等于没加.
#   ⚠️ 必须 STRICT: CHANGELOG.md 的豁免是 **dev 提交门** 的策略
#      (tools/sanitize-exempt.txt 自己写明「发布路径由 STRICT 模式强制脱敏, 不可依赖本条豁免」),
#      而 CHANGELOG.md 恰好是公开 tag 树里唯一携带真实格式密钥的文件 —— 实测对同一镜像仓:
#        非 STRICT: v1.4.1/v1.4.2/v1.5.0/v1.5.4-complete 命中 sync-github.sh/openclaw.plugin.json
#        STRICT   : 同样 4 个 tag 改命中 CHANGELOG.md (豁免若生效则这 4 处被静默放行)
#   STRICT 通过环境变量传递给 --check-tags 内部的递归 --check (已实测继承).
WPP_SANITIZE_STRICT=1 bash "$SANITIZER" --check-tags "$MIRROR_DIR" || { echo "✗ tag 敏感残留, 阻止上传"; exit 1; }

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
    # 2026-09-27: main 也加 --force-with-lease (原先只有 master 有, 不一致)。
    #   release 快照每次 rsync --delete 全量重建 ⇒ 与远端不是快进关系, 需要 lease。
    #   lease 的语义: 仅当远端仍是我们上次见到的那个 commit 时才推, 防覆盖他人/自己的新提交。
    for i in 1 2 3; do
      if git push --force-with-lease origin "$BRANCH" 2>&1; then
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
  WPP_SANITIZE_STRICT=1 bash "$SANITIZER" --apply "$SNAP_DIR"   # 脱敏 (就地改快照, 不动 dev; 发布路径 STRICT = 禁用豁免)
  WPP_SANITIZE_STRICT=1 bash "$SANITIZER" --check "$SNAP_DIR" || { echo "✗ 源码快照敏感残留, 阻止上传"; exit 1; }

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

# ============ dry-run 收尾: 还原镜像工作树 ============
# 镜像仓是脚本专属的纯 clone (无 node_modules / 无人工改动), 所以还原到运行前的分支 + 硬重置 + 清未跟踪
#   是确定性的; 不做这一步, dry-run 会留下未提交改动并挡住下一次真跑 (见上面 DRY_ORIG_BRANCH 注释)。
if [ "$DRY_RUN" -eq 1 ]; then
  echo "=== (dry-run) 还原镜像工作树 (不留未提交改动) ==="
  cd "$MIRROR_DIR"
  git checkout -q -f "$DRY_ORIG_BRANCH" 2>/dev/null || git checkout -q -f "$BRANCH"
  git reset -q --hard HEAD
  git clean -qfd
  echo "  ✓ 镜像已还原: 分支 $(git rev-parse --abbrev-ref HEAD) @ $(git rev-parse --short HEAD), 工作树干净"
fi

echo ""
echo "✅ 同步完成: GitHub (main + master) + /data + release/ 四处一致"
