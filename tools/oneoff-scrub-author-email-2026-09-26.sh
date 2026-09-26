#!/usr/bin/env bash
# oneoff-scrub-author-email-2026-09-26.sh
#
# ⚠️ ONE-OFF (2026-09-26 执行) — 保留作为「审计/复现/校验」记录, 正常发布**不要**再跑。
#
# 背景: 上午重写 master 时只检查了**文件内容**与提交信息正文, 漏了**作者/提交者元数据**。
#   随后用生产门 `sanitize-source.sh --check-history` 逐提交校验时被抓出来:
#     · master: 1 个提交 (sync-github.sh 刚推的快照提交) 作者邮箱 = 老板**个人 gmail**
#       ⇒ 根因: 本地镜像仓 `.git/config` 的 [user] email 一直是个人 gmail, 每次同步都重新引入
#     · main  : 27 个提交 (几乎整条历史) 同样带个人 gmail (main 的文件内容一直是干净的 ⇒ 从未被察觉)
#
# 做法: 重写**作者/提交者元数据** (--mailmap) + 提交信息 (--replace-message) + 树内容 (--replace-text,
#   见下)。等价于给公开仓换一个匿名信箱 jiexiaoyin@users.noreply.github.com。
#
# 追加发现 (同一次校验抓出): main 的**历史**里还有一处**内容**泄漏 —— 2026-08-20 的 commit 33c7a89 的
#   USAGE.md 文档表格把真实群 ID 当示例写了 (`/addgroup 222222222@chatroom`), 后续提交已改掉
#   ⇒ **tip 是干净的, 所以从发布门看不出来** (门只查 tip)。因此本脚本也带 --replace-text:
#   master 内容本就干净 (上午已重写) ⇒ 树 SHA 全不变; main 会有 1 个提交的树被改 (其余提交仅因父指针变化换 SHA,
#   树逐字节不变)。**断言: 两分支 tip 的树 SHA 必须不变** —— 公开的当前发布内容零变化。
#
# 用法:
#   bash tools/oneoff-scrub-author-email-2026-09-26.sh          # 演练: 只在 /tmp 克隆上重写 + 校验, 不 push
#   bash tools/oneoff-scrub-author-email-2026-09-26.sh --push   # 校验通过后 force-with-lease 推 master + main
#
# 前置: 规则文件存在 (默认 ~/.openclaw/wpp-sanitize.rules); 需要 git-filter-repo;
#       备份先落 /data (脚本自己会 clone --mirror 一份)。
# 收尾 (push 后必做, 否则下次同步又把 gmail 带回来):
#   cd <镜像仓> && git config user.email jiexiaoyin@users.noreply.github.com
#   cd <镜像仓> && git fetch origin && git reset --hard origin/master && git branch -f main origin/main
set -uo pipefail

MIRROR="${WPP_GITHUB_MIRROR:-/root/git/wpp-openclaw}"
RULES="${WPP_SANITIZE_RULES:-$HOME/.openclaw/wpp-sanitize.rules}"
SANITIZER="$(cd "$(dirname "$0")" && pwd)/sanitize-source.sh"
BACKUP_ROOT="${BACKUP_ROOT:-/data}"
TS="$(date +%Y%m%d-%H%M%S)"
WORK="/tmp/wpp-email-scrub-${TS}"
BACKUP="${BACKUP_ROOT}/wpp-github-mirror-backup-${TS}.git"
REFS_ALL=(master main)
DO_PUSH=0; [ "${1:-}" = "--push" ] && DO_PUSH=1

die() { echo "✗ $*" >&2; exit 1; }
[ -d "$MIRROR/.git" ] || die "镜像仓不存在: $MIRROR"
[ -f "$RULES" ] || die "规则文件不存在: $RULES (脱敏规则是必要输入)"
command -v git-filter-repo >/dev/null || die "缺 git-filter-repo (pip3 install git-filter-repo)"

# ============ [1/5] 备份 (/data 铁律) ============
echo "=== [1/5] 备份镜像仓 → $BACKUP ==="
git clone --quiet --mirror "$MIRROR" "$BACKUP" || die "备份失败"
declare -A OLD
for ref in "${REFS_ALL[@]}"; do
  OLD[$ref]="$(git -C "$MIRROR" rev-parse "$ref")"
  git -C "$BACKUP" bundle create "${BACKUP%.git}-${ref}.bundle" "refs/heads/$ref" 2>/dev/null || true
  echo "  旧 $ref: ${OLD[$ref]} ($(git -C "$MIRROR" rev-list --count "$ref") 提交)"
done
echo "  备份: $BACKUP (+ 各分支 bundle)"

# ============ [2/5] mailmap + 规则 ============
echo "=== [2/5] 生成 mailmap + filter-repo 规则 ==="
bash "$SANITIZER" --emit-filter-repo "$WORK-rules.txt" || die "规则生成失败"
chmod 600 "$WORK-rules.txt"
# mailmap 的"旧邮箱"从**规则文件**里取 (它就是那条替换规则的键), 本脚本内不写任何邮箱字面量 ——
#   否则脚本自己成了"要发布的文件里含敏感串"(本仓库已被这个模式坑过一次)。
#   注意: 必须匹配"**键本身就是邮箱**"的规则 —— 光看 '含 @' 会先撞上 `@机器人` 这类中文规则。
old_raw="$(grep -E '^regex:[A-Za-z0-9._%+-]+@[A-Za-z0-9.\\-]+==>' "$WORK-rules.txt" | head -1)" || true
[ -n "$old_raw" ] || die "规则文件里找不到邮箱替换规则 (mailmap 无从生成)"
key="${old_raw#regex:}"; key="${key%%==>*}"
OLD_ADDR="$(printf '%s' "$key" | sed 's/\\//g')"   # 去正则转义 (\. → .)
NEW_ADDR="${old_raw##*==>}"
IDENT_NAME="$(git -C "$MIRROR" config user.name || echo jiexiaoyin)"
printf '%s <%s> <%s>\n' "$IDENT_NAME" "$NEW_ADDR" "$OLD_ADDR" > "$WORK-mailmap.txt"
chmod 600 "$WORK-mailmap.txt"
echo "  mailmap: $IDENT_NAME → $NEW_ADDR (旧地址由规则文件提供)"

# ============ [3/5] 在 /tmp 克隆上重写 (不碰真镜像) ============
echo "=== [3/5] 重写 (仅在 $WORK; 元数据/信息 + 历史里的内容残留) ==="
git clone --quiet --mirror "$MIRROR" "$WORK" || die "克隆失败"
git -C "$WORK" filter-repo --force --partial --refs "${REFS_ALL[@]}" \
  --replace-text "$WORK-rules.txt" \
  --replace-message "$WORK-rules.txt" \
  --mailmap "$WORK-mailmap.txt" \
  --prune-empty never || die "filter-repo 失败"
rm -f "$WORK-rules.txt"   # 含敏感串的中间产物用完即删
for ref in "${REFS_ALL[@]}"; do
  echo "  新 $ref: $(git -C "$WORK" rev-parse "$ref") ($(git -C "$WORK" rev-list --count "$ref") 提交)"
done

# ============ [4/5] 校验 (不通过就不 push) ============
echo "=== [4/5] 校验重写结果 ==="
fail=0
for ref in "${REFS_ALL[@]}"; do
  # 4a 提交数不变 (历史保全)
  o="$(git -C "$BACKUP" rev-list --count "$ref")"; n="$(git -C "$WORK" rev-list --count "$ref")"
  [ "$o" = "$n" ] && echo "  ✓ [$ref] 提交数不变: $n" || { echo "  ✗ [$ref] 提交数变了: $o → $n"; fail=1; }
  # 4b **tip 树** SHA 不变 ⇒ 证明公开的当前发布内容逐字节未动
  [ "$(git -C "$WORK" rev-parse "$ref^{tree}")" = "$(git -C "$BACKUP" rev-parse "$ref^{tree}")" ] \
    && echo "  ✓ [$ref] tip 树 SHA 不变 (公开内容零变化)" || { echo "  ✗ [$ref] tip 树 SHA 变了 (不该发生)"; fail=1; }
  # 4b' 报告**历史**里被改动的内容规模 = 新历史中"旧仓不曾有过"的树对象数
  #     (main 预期 1 个 = USAGE.md 那处; master 预期 0 个 = 上午已脱敏 ⇒ 只换 SHA 不换内容)
  c=0
  while read -r t; do
    git -C "$BACKUP" cat-file -e "$t" 2>/dev/null || c=$((c+1))
  done < <(git -C "$WORK" log --format=%T "$ref" | sort -u)
  echo "  · [$ref] 历史中新增(被改写)的树对象: $c 个"
  # 4c 逐提交内容 + 提交信息 + 作者元数据 (与生产门同一判据)
  bash "$SANITIZER" --check-history "$WORK" "$ref" || fail=1
  # 4d 个人 gmail 清零
  g="$(git -C "$WORK" log --format='%ae %ce' "$ref" | grep -c 'gmail\.com' || true)"
  [ "$g" = 0 ] && echo "  ✓ [$ref] 作者/提交者无个人 gmail" || { echo "  ✗ [$ref] 仍有 $g 行 gmail"; fail=1; }
done
[ "$fail" = 0 ] || die "校验未通过 —— 不 push (重写结果在 $WORK, 可人工检查)"

# ============ [5/5] push (可选) ============
if [ "$DO_PUSH" = 1 ]; then
  echo "=== [5/5] force-with-lease 推 master + main ==="
  # WORK 是 --mirror 克隆 ⇒ origin 指向本地镜像, 必须改成真远端; 且 mirror 克隆没有 refs/remotes/*
  # (裸 refs/heads/*) ⇒ 隐式 --force-with-lease 会报 "stale info", 必须显式给期望值 (= 改写前镜像上的值)。
  ORIGIN_URL="$(git -C "$MIRROR" remote get-url origin)"
  git -C "$WORK" remote set-url origin "$ORIGIN_URL" 2>/dev/null || git -C "$WORK" remote add origin "$ORIGIN_URL"
  git -C "$WORK" config --unset remote.origin.mirror 2>/dev/null || true
  for ref in "${REFS_ALL[@]}"; do
    git -C "$WORK" push --force-with-lease="refs/heads/$ref:${OLD[$ref]}" origin "$ref" || die "push $ref 失败"
    echo "  ✓ 已推 $ref: ${OLD[$ref]} → $(git -C "$WORK" rev-parse "$ref")"
  done
  echo "  收尾必做: cd $MIRROR && git config user.email $NEW_ADDR"
  echo "            cd $MIRROR && git fetch origin && git reset --hard origin/master && git branch -f main origin/main"
else
  echo "=== [5/5] (演练) 不 push ==="
  echo "  重写结果留在: $WORK"
  echo "  真要推: 重跑本脚本加 --push"
fi
echo ""
echo "✅ 完成 (备份 $BACKUP)"
