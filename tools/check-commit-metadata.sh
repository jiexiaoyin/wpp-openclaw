#!/usr/bin/env bash
# check-commit-metadata.sh — 提交元数据门: 校验某提交的**作者/提交者邮箱**与提交信息是否含敏感串
#
# 为什么单独有这道门 (2026-09-26 二次事故): 发布门 `sanitize-source.sh --check` 只看**文件内容**,
#   看不见 git 元数据。当时本地镜像仓 `.git/config` 的 user.email 是老板个人 gmail ⇒ 每次同步**新建**的
#   提交都把 gmail 又带回刚脱敏过的历史里 (main 27 个提交 + master 1 个提交中招, 文件内容全干净)。
#   本脚本复用**同一套外置规则** (生产门同判据), 只把 `git log -1` 的作者/提交者/信息当文本过一遍。
#
# 用法:
#   tools/check-commit-metadata.sh [<repo>] [<ref>]     # 默认 . HEAD
# 退出码: 0 干净; 1 有残留 (附命中详情)
set -uo pipefail

REPO="${1:-.}"
REF="${2:-HEAD}"
SANITIZER="$(cd "$(dirname "$0")" && pwd)/sanitize-source.sh"

[ -d "$REPO/.git" ] || [ -f "$REPO/HEAD" ] || { echo "✗ 不是 git 仓库: $REPO" >&2; exit 1; }
git -C "$REPO" rev-parse --verify "$REF" >/dev/null 2>&1 || { echo "✗ ref 不存在: $REF" >&2; exit 1; }

MSG="$(mktemp /tmp/wpp-commitmsg-XXXXXX)"
trap 'rm -f "$MSG"' EXIT
git -C "$REPO" log -1 --format='%an <%ae>%n%cn <%ce>%n%s%n%b' "$REF" > "$MSG"

bash "$SANITIZER" --check "$MSG" >/dev/null 2>&1 || {
  echo "✗ 提交元数据门未通过 (敏感残留, 多半是作者/提交者邮箱; 或规则文件缺失 ⇒ 同样拒绝):" >&2
  echo "  $(git -C "$REPO" log -1 --format='%h %an <%ae> | %cn <%ce>' "$REF")" >&2
  bash "$SANITIZER" --check "$MSG" 2>&1 >/dev/null | sed 's/^/  /' >&2
  exit 1
}
echo "  ✓ 提交元数据干净: $(git -C "$REPO" log -1 --format='%h %an <%ae>' "$REF")"
