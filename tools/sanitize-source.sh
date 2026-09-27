#!/usr/bin/env bash
# sanitize-source.sh — WPP 脱敏执行器 (单一真源 = 外置规则文件)
#
# 本文件**绝不含任何敏感串**: 规则全部从外部文件读 (默认 $HOME/.openclaw/wpp-sanitize.rules,
# 可用 WPP_SANITIZE_RULES 覆盖), 因此本脚本可以安全地发布到 GitHub 公开仓。
#
# 为什么必须外置 (2026-09-26 教训): 旧版 build-release.sh / sync-github.sh 把 PERSONAL 正则**内联**在
#   脚本里, 而这两个脚本自己在 master 源码分支里 ⇒ 脚本本身成了公开仓的泄漏源 (含生产密钥前缀)。
#
# 为什么用 python3 而不是 sed: 规则需要**前后视断言** (如"11 位手机号但两侧不是数字", 否则长数字
#   ID/hex 里的片段会被误伤), sed 的 ERE 表达不了。python3 re 也与历史重写用的 git-filter-repo
#   (Python re) 语义一致 ⇒ 树脱敏与历史重写结果可逐字节对齐。
#
# 用法:
#   tools/sanitize-source.sh --check <dir|file>      只扫描, 有残留 exit 1 (发布前的门)
#   tools/sanitize-source.sh --check-history <repo> [ref]   逐提交校验整条历史 (每个提交树都用 --check 过一遍
#                                                     + 提交信息; 用本执行器同一套规则 ⇒ 判据与生产门一致)
#   tools/sanitize-source.sh --apply <dir>           就地脱敏 (调用方负责先排除不该发的目录)
#   tools/sanitize-source.sh --emit-filter-repo <f>  生成 git-filter-repo --replace-text/--replace-message 用文件
#
# 退出码: 0 干净/成功；1 有残留或规则文件缺失；2 用法错误
set -uo pipefail

RULES_FILE="${WPP_SANITIZE_RULES:-$HOME/.openclaw/wpp-sanitize.rules}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
# 豁免清单 (2026-09-27): 非敏感, 随仓分发; 声明「测试样本/必需输入」不参与脱敏
EXEMPT_FILE="${WPP_SANITIZE_EXEMPT:-$SCRIPT_DIR/sanitize-exempt.txt}"
export WPP_SANITIZE_EXEMPT="$EXEMPT_FILE"

usage() { sed -n '2,21p' "$0"; exit 2; }

MODE="${1:-}"
case "$MODE" in
  --check|--apply|--emit-filter-repo|--check-history) ;;
  -h|--help|'') usage ;;
  *) echo "unknown arg: $MODE" >&2; usage ;;
esac
TARGET="${2:-}"
[ -n "$TARGET" ] || usage

# ---- --check-history: 逐提交校验整条历史 (递归调自己, 判据 == 生产门) ----
if [ "$MODE" = "--check-history" ]; then
  REF="${3:-master}"
  [ -d "$TARGET" ] || { echo "✗ 仓库不存在: $TARGET" >&2; exit 1; }
  git -C "$TARGET" rev-parse --verify "$REF" >/dev/null 2>&1 || { echo "✗ ref 不存在: $REF" >&2; exit 1; }
  [ -f "$RULES_FILE" ] || { echo "✗ 规则文件不存在: $RULES_FILE" >&2; exit 1; }
  TMP="$(mktemp -d /tmp/wpp-histcheck-XXXXXX)"; trap 'rm -rf "$TMP"' EXIT
  n=0; bad=0
  while read -r sha; do
    n=$((n+1))
    rm -rf "$TMP/tree"; mkdir -p "$TMP/tree"
    git -C "$TARGET" archive "$sha" 2>/dev/null | tar -x -C "$TMP/tree" 2>/dev/null || true
    if ! out="$(WPP_SANITIZE_EXEMPT="$EXEMPT_FILE" bash "$0" --check "$TMP/tree" 2>&1)"; then
      bad=$((bad+1)); echo "  ✗ $sha:" >&2; echo "$out" | tail -n +2 | head -3 | sed 's/^/      /' >&2
    fi
  done < <(git -C "$TARGET" rev-list "$REF")
  git -C "$TARGET" log --format='%H%n%an <%ae>%n%s%n%b' "$REF" > "$TMP/msgs.txt"
  if ! out="$(bash "$0" --check "$TMP/msgs.txt" 2>&1)"; then
    bad=$((bad+1)); echo "  ✗ 提交信息/作者信息:" >&2; echo "$out" | tail -n +2 | head -3 | sed 's/^/      /' >&2
  fi
  if [ "$bad" != 0 ]; then echo "✗ 历史校验失败: $bad 处命中 (ref=$REF)" >&2; exit 1; fi
  echo "  ✓ 历史校验通过: $n 个提交的树 + 提交信息/作者 全部 0 命中 (ref=$REF)" >&2
  exit 0
fi

# 规则文件是必要输入: 缺失就**拒绝工作** (绝不"跳过脱敏继续发")
if [ "$MODE" != "--emit-filter-repo" ]; then
  [ -f "$RULES_FILE" ] || { echo "✗ 规则文件不存在: $RULES_FILE" >&2
    echo '  脱敏规则是发布流程的必要输入 —— 缺失时拒绝工作 (绝不「跳过脱敏继续发」)。' >&2
    echo '  用 WPP_SANITIZE_RULES=<path> 指定其他位置。' >&2; exit 1; }
  [ -r "$RULES_FILE" ] || { echo "✗ 规则文件不可读: $RULES_FILE" >&2; exit 1; }
fi

WPP_MODE="$MODE" WPP_TARGET="$TARGET" WPP_RULES="$RULES_FILE" python3 - <<'PY'
import os, re, sys

RULES = os.environ['WPP_RULES']; MODE = os.environ['WPP_MODE']; TARGET = os.environ['WPP_TARGET']
SKIP_DIRS = {'.git', 'node_modules'}

# ---- exemption list (2026-09-27): non-secret, ships with repo; see tools/sanitize-exempt.txt ----
#   STRICT mode (WPP_SANITIZE_STRICT=1) disables ALL exemptions. Release paths (sync-github.sh,
#   build-release.sh) MUST use strict: a dev-side exemption like CHANGELOG.md is legitimate for the
#   dev commit gate, but is NOT legitimate for a public release snapshot. Sharing one policy across
#   both gates was the original design flaw -- the same --check served opposite intents.
import fnmatch
STRICT = os.environ.get('WPP_SANITIZE_STRICT', '').strip() not in ('', '0', 'false')
EXEMPT_FILE = os.environ.get('WPP_SANITIZE_EXEMPT', '').strip()
exempts = []          # [(glob, reason)]
if not STRICT and EXEMPT_FILE and os.path.isfile(EXEMPT_FILE):
    with open(EXEMPT_FILE, encoding='utf-8') as fh:
        for raw in fh:
            line = raw.rstrip(chr(10)).rstrip(chr(13))
            if not line.strip() or line.lstrip().startswith('#'):
                continue
            parts = line.split(chr(9))
            glob = parts[0].strip()
            reason = parts[1].strip() if len(parts) > 1 else ''
            if glob:
                exempts.append((glob, reason))

# Repo root anchoring: exemptions are written relative to the repo root,
# but callers may scan the repo, a subdir, or a single file. Anchor on the git
# toplevel when available so the same glob works in every invocation.
_REPO_ROOT = None
def repo_root():
    global _REPO_ROOT
    if _REPO_ROOT is None:
        d = os.getcwd()
        found = None
        while True:
            if os.path.isdir(os.path.join(d, '.git')):
                found = d
                break
            parent = os.path.dirname(d)
            if parent == d:
                break
            d = parent
        _REPO_ROOT = found or os.getcwd()
    return _REPO_ROOT

def rel_for(root, path):
    """Path for glob matching: repo-relative when possible, else scan-root-relative."""
    try:
        rel = os.path.relpath(os.path.abspath(path), repo_root())
    except ValueError:
        return path.replace(os.sep, '/')
    rel = rel.replace(os.sep, '/')
    if rel.startswith('../'):
        base = root if os.path.isdir(root) else os.path.dirname(root)
        try:
            rel = os.path.relpath(path, base).replace(os.sep, '/')
        except ValueError:
            rel = path.replace(os.sep, '/')
    return rel

def is_exempt(rel):
    for g, _reason in exempts:
        if fnmatch.fnmatch(rel, g) or fnmatch.fnmatch(os.path.basename(rel), g):
            return True
    return False

pairs, scans = [], []      # pairs: (pat, repl) ; scans: (pat, redaction-or-None)
with open(RULES, encoding='utf-8') as fh:
    for raw in fh:
        line = raw.rstrip('\n').rstrip('\r')
        if not line.strip() or line.lstrip().startswith('#'):
            continue
        parts = line.split('\t')
        if parts[0] == '@scan':
            if len(parts) >= 2 and parts[1]:
                scans.append((parts[1], parts[2] if len(parts) > 2 else None))
        elif len(parts) >= 2 and parts[1]:
            pairs.append((parts[0], parts[1]))
if not pairs:
    sys.exit(f'✗ 规则文件里没有任何替换规则: {RULES}')
print(f'  规则: {RULES} (替换 {len(pairs)} 条 / 只查 {len(scans)} 条)', file=sys.stderr)
if STRICT:
    print('  豁免: **STRICT 模式 — 豁免清单已禁用 (发布路径)**', file=sys.stderr)
elif exempts:
    print(f'  豁免: {EXEMPT_FILE} ({len(exempts)} 条)', file=sys.stderr)

def files(root):
    if os.path.isfile(root):          # 允许直接查单个文件 (如 git log 导出的提交信息)
        if not is_exempt(rel_for(root, root)):
            yield root
        return
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            p = os.path.join(dirpath, fn)
            if is_exempt(rel_for(root, p)):
                continue
            yield p

def is_binary(path):
    try:
        with open(path, 'rb') as fh:
            return b'\0' in fh.read(8192)
    except OSError:
        return True

def read(path):
    with open(path, 'rb') as fh:
        return fh.read()

# ---- 只查: 替换键 + @scan 键 (二进制也查; 只报文件名) ----
if MODE == '--check':
    pats = [re.compile(k.encode('utf-8')) for k, _ in pairs] + \
           [re.compile(k.encode('utf-8')) for k, _ in scans]
    hits = [p for p in files(TARGET) if any(rx.search(read(p)) for rx in pats)]
    if hits:
        print('✗ 敏感残留, 阻止发布:', file=sys.stderr)
        for h in hits[:20]:
            print('  ' + h, file=sys.stderr)
        sys.exit(1)
    print(f'  ✓ 敏感扫描通过 (0 命中): {TARGET}', file=sys.stderr)
    sys.exit(0)

# ---- 就地脱敏: 文本文件, 按规则顺序应用 (二进制跳过: 改字节会损坏文件) ----
if MODE == '--apply':
    rx = [(re.compile(k.encode('utf-8')), v.encode('utf-8')) for k, v in pairs]
    scanned = changed = 0
    for p in files(TARGET):
        scanned += 1
        if is_binary(p):
            continue
        body = read(p)
        new = body
        for pat, repl in rx:
            new = pat.sub(repl, new)
        if new != body:
            st = os.stat(p)
            with open(p, 'wb') as fh:
                fh.write(new)
            os.chmod(p, st.st_mode & 0o7777)
            changed += 1
    print(f'  脱敏: {scanned} 文件检查 / {changed} 文件被改写', file=sys.stderr)
    sys.exit(0)

# ---- 历史重写用规则文件: regex:<键>==><值> (扫描项若给了改写串, 历史里也抹掉) ----
if MODE == '--emit-filter-repo':
    if not TARGET:
        sys.exit(2)
    lines = []
    for k, v in pairs:
        lines.append(f'regex:{k}==>{v}')
    for k, red in scans:
        if red:
            lines.append(f'regex:{k}==>{red}')
    with open(TARGET, 'w', encoding='utf-8') as fh:
        fh.write('\n'.join(lines) + '\n')
    os.chmod(TARGET, 0o600)
    print(f'  filter-repo 规则已写出: {TARGET} ({len(lines)} 条)', file=sys.stderr)
    sys.exit(0)
PY
