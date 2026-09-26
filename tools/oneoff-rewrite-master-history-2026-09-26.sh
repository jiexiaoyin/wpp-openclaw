#!/usr/bin/env bash
# oneoff-rewrite-master-history-2026-09-26.sh
#
# ⚠️ ONE-OFF (2026-09-26 已执行完毕) — 保留作为「审计/复现/校验」记录, 正常发布**不要**再跑。
#    它把 GitHub 公开仓的 master (源码分支) 历史重写成脱敏版:
#      · 每个提交的**文件内容**按 ~/.openclaw/wpp-sanitize.rules 脱敏 (含旧脚本内联的生产密钥前缀)
#      · 从全部历史移除 node_modules/ coverage/ release/ dist-release/ accounts/default.json
#      · 提交信息里的个人串同样脱敏; 作者邮箱 个人 gmail → GitHub noreply
#      · 保留全部提交与提交信息 (--prune-empty never), 只换内容 ⇒ 所有 SHA 变化
#
# 为什么需要: 2026-09-26 审计发现 master 从 Initial commit 起 62 个提交全部带个人信息
#   (真实 wxid / 群 ID / 老板登录名 / vendor host / 生产密钥前缀), 46 个文件命中;
#   main (脱敏 release) 分支历史干净, 未动。
#
# 用法:
#   bash tools/oneoff-rewrite-master-history-2026-09-26.sh          # 演练: 只在 /tmp 克隆上重写 + 校验, 不 push
#   bash tools/oneoff-rewrite-master-history-2026-09-26.sh --push   # 重写后 force-with-lease 推 master
#
# 前置: 规则文件存在 (默认 ~/.openclaw/wpp-sanitize.rules, 可 WPP_SANITIZE_RULES 覆盖);
#       备份先落 /data (脚本自己会 clone --mirror 一份) ; 需要 git-filter-repo (pip3 install git-filter-repo)
set -uo pipefail

MIRROR="${WPP_GITHUB_MIRROR:-/root/git/wpp-openclaw}"
RULES="${WPP_SANITIZE_RULES:-$HOME/.openclaw/wpp-sanitize.rules}"
SANITIZER="$(cd "$(dirname "$0")" && pwd)/sanitize-source.sh"
BACKUP_ROOT="${BACKUP_ROOT:-/data}"
TS="$(date +%Y%m%d-%H%M%S)"
WORK="/tmp/wpp-master-rewrite-${TS}"
BACKUP="${BACKUP_ROOT}/wpp-github-mirror-backup-${TS}.git"
DO_PUSH=0; [ "${1:-}" = "--push" ] && DO_PUSH=1

die() { echo "✗ $*" >&2; exit 1; }
[ -d "$MIRROR/.git" ] || die "镜像仓不存在: $MIRROR"
[ -f "$RULES" ] || die "规则文件不存在: $RULES (脱敏规则是必要输入)"
command -v git-filter-repo >/dev/null || die "缺 git-filter-repo (pip3 install git-filter-repo)"

# ============ [1/5] 备份 (/data 铁律) ============
echo "=== [1/5] 备份镜像仓 → $BACKUP ==="
git clone --quiet --mirror "$MIRROR" "$BACKUP" || die "备份失败"
git -C "$BACKUP" bundle create "${BACKUP%.git}-master.bundle" refs/heads/master 2>/dev/null || true
OLD_MASTER="$(git -C "$MIRROR" rev-parse master)"
echo "  旧 master: $OLD_MASTER ($(git -C "$MIRROR" rev-list --count master) 提交)"
echo "  备份: $BACKUP (+ ${BACKUP%.git}-master.bundle)"

# ============ [2/5] 规则 → filter-repo 格式 + mailmap ============
echo "=== [2/5] 生成 filter-repo 规则 + mailmap ==="
bash "$SANITIZER" --emit-filter-repo "$WORK-rules.txt" || die "规则生成失败"
chmod 600 "$WORK-rules.txt"
# mailmap 从**规则文件**里取 (旧邮箱 = 那条邮箱替换规则的键): 本脚本内不写邮箱字面量,
#   否则"要发布的脚本自带敏感串"——正是本仓库 2026-09-26 事故的模式 (旧版 heredoc 里就有,
#   结果发布快照里那行被脱敏器改写成了自己映射自己, 全是噪音)。
old_raw="$(grep -E '^regex:[A-Za-z0-9._%+-]+@[A-Za-z0-9.\\-]+==>' "$WORK-rules.txt" | head -1)" || true
[ -n "$old_raw" ] || die "规则文件里找不到邮箱替换规则 (mailmap 无从生成)"
key="${old_raw#regex:}"; key="${key%%==>*}"
OLD_ADDR="$(printf '%s' "$key" | sed 's/\\//g')"
NEW_ADDR="${old_raw##*==>}"
printf '%s <%s> <%s>\n' "$(git -C "$MIRROR" config user.name || echo jiexiaoyin)" "$NEW_ADDR" "$OLD_ADDR" > "$WORK-mailmap.txt"
chmod 600 "$WORK-mailmap.txt"

# 注: 校验不自己拼 grep 正则 —— 规则里含前后视断言 (?<!...), ERE grep 表达不了会给出**假结论**
#     (第一次跑就踩到: git grep 对 (?<! 只发 warning 然后"看起来 0 命中")。判据统一交给执行器。

# ============ [3/5] 在 /tmp 克隆上重写 (不碰真镜像) ============
echo "=== [3/5] 重写 (仅在 $WORK) ==="
git clone --quiet --mirror "$MIRROR" "$WORK" || die "克隆失败"
git -C "$WORK" filter-repo --force --partial --refs master \
  --invert-paths \
  --path node_modules --path coverage --path release --path dist-release \
  --path accounts/default.json \
  --replace-text "$WORK-rules.txt" \
  --replace-message "$WORK-rules.txt" \
  --mailmap "$WORK-mailmap.txt" \
  --prune-empty never || die "filter-repo 失败"
rm -f "$WORK-rules.txt"   # 含敏感串的中间产物用完即删
NEW_MASTER="$(git -C "$WORK" rev-parse master)"
echo "  新 master: $NEW_MASTER ($(git -C "$WORK" rev-list --count master) 提交)"

# ============ [4/5] 校验 (不通过就不 push) ============
echo "=== [4/5] 校验重写结果 ==="
fail=0
# 4a 提交数不变 (历史保全, 没被 --prune-empty 吃掉)
OLD_N="$(git -C "$BACKUP" rev-list --count master)"; NEW_N="$(git -C "$WORK" rev-list --count master)"
[ "$OLD_N" = "$NEW_N" ] && echo "  ✓ 提交数不变: $NEW_N" || { echo "  ✗ 提交数变了: $OLD_N → $NEW_N"; fail=1; }
# 4b/4c 逐提交内容 + 提交信息/作者 (同一执行器, 与生产门同判据)
bash "$SANITIZER" --check-history "$WORK" master || fail=1
# 4d 作者邮箱已换
GMAIL="$(git -C "$WORK" log --format='%ae %ce' master | grep -c 'gmail' || true)"
[ "$GMAIL" = 0 ] && echo "  ✓ 作者/提交者无 gmail" || { echo "  ✗ 仍有 $GMAIL 行 gmail"; fail=1; }
# 4e 历史里不再有依赖/产物
for p in node_modules coverage release dist-release accounts/default.json; do
  n="$(git -C "$WORK" rev-list --objects master | grep -c " $p/\| $p$" || true)"
  [ "$n" = 0 ] && echo "  ✓ 历史无 $p" || { echo "  ✗ 历史仍有 $n 个 $p 对象"; fail=1; }
done
# 4f main 分支未被波及
[ "$(git -C "$WORK" rev-parse main)" = "$(git -C "$BACKUP" rev-parse main)" ] \
  && echo "  ✓ main 分支未动" || { echo "  ✗ main 被改了 (不该发生)"; fail=1; }
[ "$fail" = 0 ] || die "校验未通过 —— 不 push (重写结果在 $WORK, 可人工检查)"

# ============ [5/5] push (可选) ============
if [ "$DO_PUSH" = 1 ]; then
  echo "=== [5/5] force-with-lease 推 master → origin ==="
  # WORK 是 --mirror 克隆 ⇒ origin 指向**本地镜像**, 必须改成真远端; 且 mirror 克隆没有
  # refs/remotes/* (裸 refs/heads/*) ⇒ 隐式 --force-with-lease 会报 "stale info", 必须显式给期望值。
  # 期望值 = 改写前读到的镜像 master (= 推送前 GitHub 上的值 bb78ca4…) ⇒ 远端若已变则拒绝推送 (安全).
  git -C "$WORK" remote set-url origin "$(git -C "$MIRROR" remote get-url origin)" || die "改 origin 失败"
  git -C "$WORK" config --unset remote.origin.mirror 2>/dev/null || true
  git -C "$WORK" push --force-with-lease=refs/heads/master:"$OLD_MASTER" origin master || die "push 失败"
  echo "  ✓ 已推: $NEW_MASTER"
  echo "  真镜像跟上: cd $MIRROR && git fetch origin && git reset --hard origin/master"
else
  echo "=== [5/5] (演练) 不 push ==="
  echo "  重写结果留在: $WORK  (新 master $NEW_MASTER)"
  echo "  真要推: 重跑本脚本加 --push"
fi
echo ""
echo "✅ 完成 (旧 master $OLD_MASTER / 备份 $BACKUP)"
