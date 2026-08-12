#!/usr/bin/env python3
"""核对 WPP 插件实际调用的端点 vs swagger 全部端点 (v2 精确版)。

直接读 src/*.ts 文件内容, 统一正则匹配 2/3 段路径。
用法: python3 scripts/verify-endpoint-coverage.py [swagger.json]
"""
import json
import os
import re
import sys
from collections import defaultdict

SRC = "/root/dev/wechatpadpro-openclaw/src"
SWAGGER = sys.argv[1] if len(sys.argv) > 1 else "/tmp/wpp-swagger.json"
INDEX = "/root/dev/wechatpadpro-openclaw/docs/ENDPOINT-INDEX.md"

TAGS = ("Msg","Login","Group","Friend","User","Label","Finder","FriendCircle","Favor",
        "Search","OfficialAccounts","Wxapp","QWContact","SayHello","TenPay","Voice",
        "Translate","Tools","Customized","Webhook","Admin")

# 1. swagger
with open(SWAGGER, encoding="utf-8") as f:
    spec = json.load(f)
swagger_paths = set(spec.get("paths", {}).keys())

# 2. 扫描全部 .ts 文件
ep_re = re.compile(r"/([A-Za-z][A-Za-z0-9]*)/([A-Za-z0-9]+)(?:/([A-Za-z0-9]+))?")
code = defaultdict(set)  # ep -> set((fpath, lineno, is_comment))

def is_comment(line):
    s = line.strip()
    return s.startswith("//") or s.startswith("*") or s.startswith("/*")

for root, dirs, files in os.walk(SRC):
    if "node_modules" in root: continue
    for fn in files:
        if not fn.endswith(".ts"): continue
        fpath = os.path.join(root, fn)
        try:
            with open(fpath, encoding="utf-8") as f:
                for lineno, line in enumerate(f, 1):
                    for m in ep_re.finditer(line):
                        tag, seg2, seg3 = m.group(1), m.group(2), m.group(3)
                        if tag not in TAGS: continue
                        ep = f"/{tag}/{seg2}" + (f"/{seg3}" if seg3 else "")
                        # 规范化动态路径
                        if "{" in seg3 or "{" in seg2:
                            ep = ep.replace(seg3, "{name}") if seg3 and "{" in seg3 else ep
                        code[ep].add((fpath, lineno, is_comment(line)))
        except Exception:
            pass

# 活跃调用 (非注释)
active = {ep for ep, locs in code.items() if any(not c for _, _, c in locs)}

# 动态路径补充: /Search/Service/{name} 由模板字符串 /Search/Service/${name}
# 扫描模板字符串形态
tpl_re = re.compile(r"`(/[A-Za-z]+/[A-Za-z0-9]+)/\$\{([^}]+)\}`")
for root, dirs, files in os.walk(SRC):
    for fn in files:
        if not fn.endswith(".ts"): continue
        fpath = os.path.join(root, fn)
        try:
            with open(fpath, encoding="utf-8") as f:
                for line in f:
                    for m in tpl_re.finditer(line):
                        active.add(m.group(1) + "/{name}")
        except Exception:
            pass

missing = sorted(swagger_paths - active)
covered = swagger_paths & active

print(f"swagger: {len(swagger_paths)} | 代码活跃调用: {len(active)} | 覆盖: {len(covered)} | 缺失: {len(missing)}")

# ENDPOINT-INDEX
index_covered = set()
with open(INDEX, encoding="utf-8") as f:
    for line in f:
        m = re.search(r"`(/[A-Za-z]+/[A-Za-z0-9]+(?:/[A-Za-z0-9]+)?)`", line)
        if m and "✅" in line:
            index_covered.add(m.group(1))
print(f"ENDPOINT-INDEX ✅: {len(index_covered)}")

fake = index_covered - active
miss_mark = active - index_covered

print(f"\n=== 假覆盖 (索引✅但代码无活跃调用): {len(fake)} ===")
for ep in sorted(fake): print(f"  ❌ {ep}")

print(f"\n=== 漏标 (代码活跃调用但索引无✅): {len(miss_mark)} ===")
for ep in sorted(miss_mark): print(f"  ⚠️ {ep}")

print(f"\n=== 真实缺失 (swagger 有, 代码未调用): {len(missing)} ===")
for ep in missing: print(f"  ➖ {ep}")

# 每 tag 统计
tag_stats = defaultdict(lambda: [0, 0])
for ep in swagger_paths:
    t = ep.split("/")[1]
    tag_stats[t][1] += 1
    if ep in active: tag_stats[t][0] += 1
print(f"\n=== 每 tag 覆盖率 ===")
for t, (c, total) in sorted(tag_stats.items(), key=lambda x: -x[1][0]):
    print(f"  {t:18s} {c:3d}/{total:3d} ({c/total*100:5.1f}%)")
