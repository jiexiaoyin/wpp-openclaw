#!/usr/bin/env python3
"""从 WeChatPad Pro swagger.json 生成完整 API 参考文档 (Markdown), 合并三源:
  1. swagger.json — 权威定义 (参数/响应)
  2. WPP-OpenClaw 源码 src/send/<tag>.ts — 实测调用方法 (dispatch 参数 + 注释坑)
  3. scripts/api-notes.json — 人工探索笔记 (可用性/坑/示例)

用法: python3 scripts/gen-api-reference.py [swagger.json] [output.md]
来源: http://127.0.0.1:8062/swagger.json (vendor 本地 Swagger UI)
"""
import json
import os
import re
import sys
from collections import defaultdict

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
WPP_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
NOTES_FILE = os.path.join(SCRIPT_DIR, "api-notes.json")

SWAGGER = sys.argv[1] if len(sys.argv) > 1 else "/tmp/wpp-swagger.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(WPP_ROOT, "docs/WPP-API-REFERENCE.md")

with open(SWAGGER, encoding="utf-8") as f:
    spec = json.load(f)

# ---- 加载人工探索笔记 ----
notes = {}
if os.path.exists(NOTES_FILE):
    try:
        with open(NOTES_FILE, encoding="utf-8") as f:
            notes = json.load(f)
    except Exception as e:
        print(f"⚠️ api-notes.json 加载失败: {e}", file=sys.stderr)

paths = spec.get("paths", {})
defs = spec.get("definitions", {})

# ---- 从 WPP-OpenClaw 源码提取实测调用信息 ----
# 解析 send/<tag>.ts: 方法注释 /** /Path — 说明 */ + dispatch("/Path", {...})
def extract_send_calls():
    """返回 {method_path: {"comment": str, "dispatch": dict或str}}"""
    result = {}
    send_dir = os.path.join(WPP_ROOT, "src", "send")
    if not os.path.isdir(send_dir):
        return result
    for fn in os.listdir(send_dir):
        if not fn.endswith(".ts"):
            continue
        fp = os.path.join(send_dir, fn)
        try:
            src = open(fp, encoding="utf-8").read()
        except Exception:
            continue
        # 找 /** ... */ 注释块 (单行或多行), 提取其中 "/Path" 和说明
        # 匹配: /** ... /Msg/SendTxt ... */ (注释内容本身)
        for m in re.finditer(r"/\*\*([^*]*(?:\*(?!\/)[^*]*)*)\*\/", src):
            comment = m.group(1).strip().replace("\n", " ").strip()
            if not comment:
                continue
            # 注释里找端点路径 (如 /Msg/SendTxt)
            ep = re.search(r"(/[/A-Za-z0-9_.\-]+)", comment)
            if not ep:
                continue
            endpoint = ep.group(1)
            # 去掉注释里已有的路径前缀, 保留说明
            clean = comment
            result.setdefault(endpoint, []).append({
                "method": "",
                "comment": clean,
                "file": fn,
            })
    return result

send_calls = extract_send_calls()

# ---- 收集 tag 顺序 + 各 tag 的 endpoint ----
tag_order = [t["name"] for t in spec.get("tags", [])]
by_tag = defaultdict(list)
method_order = ["get", "post", "put", "delete", "patch"]

for path, item in paths.items():
    for method in method_order:
        op = item.get(method)
        if not op:
            continue
        tags = op.get("tags", ["Misc"])
        for t in tags:
            by_tag[t].append({
                "path": path,
                "method": method.upper(),
                "summary": op.get("summary", "").strip(),
                "description": (op.get("description") or "").strip(),
                "operationId": op.get("operationId", ""),
                "params": op.get("parameters", []),
                "responses": op.get("responses", {}),
            })

def fmt_type(schema):
    """格式化参数/响应类型为可读字符串"""
    if not schema:
        return "any"
    if "$ref" in schema:
        return schema["$ref"].split("/")[-1]
    t = schema.get("type", "any")
    if t == "array":
        return f"array<{fmt_type(schema.get('items', {}))}>"
    if t == "object":
        props = schema.get("properties", {})
        if props:
            return "object{" + ", ".join(f"{k}:{fmt_type(v)}" for k, v in props.items()) + "}"
        return "object"
    enum = schema.get("enum")
    if enum:
        return f"{t}({'|'.join(map(str, enum))})"
    return t

# ---- 生成 Markdown ----
lines = []
lines.append("# WeChatPad Pro API 参考文档")
lines.append("")
lines.append("> **来源**: vendor 本地 Swagger UI — http://127.0.0.1:8062/swagger.json (容器 `wechatpadpromax08` port 8062)")
lines.append("> **生成**: 自动生成 (重生成: `python3 scripts/gen-api-reference.py`); 人工经验存 `scripts/api-notes.json` + 源码注释")
lines.append(f"> **统计**: {len(paths)} 个 endpoint / {len(tag_order)} 个 tag")
lines.append("> **实测覆盖**: 源码实现 `send/*.ts` 提取 + api-notes.json 探索笔记")
lines.append("")
lines.append("## 目录")
lines.append("")
for t in tag_order:
    n = len(by_tag.get(t, []))
    lines.append(f"- [{t} ({n})](#{t.lower()})")
lines.append("")
lines.append("---")
lines.append("")

# 统计表
lines.append("## 总览")
lines.append("")
lines.append("| Tag | 端点数 | 说明 |")
lines.append("|---|---|---|")
tag_desc = {t["name"]: (t.get("description") or "").replace("\n", " ").strip() for t in spec.get("tags", [])}
for t in tag_order:
    lines.append(f"| {t} | {len(by_tag.get(t, []))} | {tag_desc.get(t, '')} |")
lines.append("")
lines.append("---")
lines.append("")

# 每个 tag 的详细 endpoint
for t in tag_order:
    eps = by_tag.get(t, [])
    lines.append(f"## {t}")
    lines.append("")
    if tag_desc.get(t):
        lines.append(f"> {tag_desc[t]}")
        lines.append("")
    lines.append("| # | Method | Path | 说明 |")
    lines.append("|---|---|---|---|")
    for i, e in enumerate(eps, 1):
        lines.append(f"| {i} | `{e['method']}` | `{e['path']}` | {e['summary']} |")
    lines.append("")
    for e in eps:
        ep_key = f"{e['method']} {e['path']}"
        lines.append(f"### {ep_key}")
        lines.append("")
        if e["summary"]:
            lines.append(f"**说明**: {e['summary']}")
            lines.append("")
        if e["description"]:
            lines.append(f"{e['description']}")
            lines.append("")
        if e["operationId"]:
            lines.append(f"**operationId**: `{e['operationId']}`")
            lines.append("")
        if e["params"]:
            lines.append("**参数**:")
            lines.append("")
            lines.append("| 位置 | 名称 | 必填 | 类型 | 说明 |")
            lines.append("|---|---|---|---|---|")
            for p in e["params"]:
                name = p.get("name", "?")
                loc = p.get("in", "?")
                req = "✅" if p.get("required") else "—"
                if loc == "body" and "schema" in p:
                    s = p["schema"]
                    ref_names = []
                    if "$ref" in s:
                        ref_names.append(s["$ref"].split("/")[-1])
                    for sub in s.get("allOf", []):
                        if "$ref" in sub:
                            ref_names.append(sub["$ref"].split("/")[-1])
                    detail = []
                    for ref_name in ref_names:
                        defn = defs.get(ref_name, {})
                        props = defn.get("properties", {})
                        reqs = set(defn.get("required", []))
                        for k, v in props.items():
                            star = "*" if k in reqs else ""
                            detail.append(f"`{k}{star}`:{fmt_type(v)}")
                    ex = s.get("example") or p.get("x-example")
                    ex_str = f" 示例={json.dumps(ex, ensure_ascii=False)}" if ex else ""
                    typ = (" + ".join(ref_names) if ref_names else fmt_type(s)) + ("; {" + ", ".join(detail) + "}" if detail else "")
                    desc = ((p.get("description") or "").replace("\n", " ").strip() + ex_str)
                else:
                    typ = fmt_type(p.get("schema", {})) if "schema" in p else p.get("type", "any")
                    desc = (p.get("description") or "").replace("\n", " ").strip()
                lines.append(f"| {loc} | `{name}` | {req} | `{typ}` | {desc} |")
            lines.append("")
        # 响应
        if e["responses"]:
            lines.append("**响应**:")
            lines.append("")
            lines.append("| 状态码 | 说明 | 类型 |")
            lines.append("|---|---|---|")
            for code, resp in e["responses"].items():
                rdesc = (resp.get("description") or "").replace("\n", " ").strip()
                rtype = fmt_type(resp.get("schema", {})) if "schema" in resp else ""
                lines.append(f"| {code} | {rdesc} | `{rtype}` |")
            lines.append("")
        # ---- 实测调用 (源码提取) ----
        src_calls = send_calls.get(e["path"], [])
        if src_calls:
            lines.append("**实测调用** (源码 `send/*.ts`):")
            lines.append("")
            for c in src_calls:
                lines.append(f"- `{c['method']}()` — {c['file']}: `{c['comment']}`")
            lines.append("")
        # ---- 探索笔记 (api-notes.json) ----
        note = notes.get(ep_key)
        if note:
            usable = note.get("usable", "")
            if usable == "usable" or usable is True:
                badge = "✅ 可用"
            elif usable is False:
                badge = "❌ 不可用"
            elif usable == "partial":
                badge = "⚠️ 部分可用"
            else:
                badge = str(usable)
            lines.append(f"**探索笔记**: {badge}")
            lines.append("")
            if note.get("notes"):
                lines.append(f"- {note['notes']}")
            if note.get("example"):
                lines.append(f"- 调用示例: `{note['example']}`")
            if note.get("resp"):
                lines.append(f"- 返回: {note['resp']}")
            if note.get("verified"):
                lines.append(f"- 实测: {note['verified']}")
            lines.append("")
        lines.append("---")
        lines.append("")

lines.append("")
lines.append("## 附录: 定义 (Definitions)")
lines.append("")
for name, defn in defs.items():
    props = defn.get("properties", {})
    reqs = set(defn.get("required", []))
    lines.append(f"### {name}")
    lines.append("")
    lines.append("| 字段 | 必填 | 类型 | 说明 |")
    lines.append("|---|---|---|---|")
    for k, v in props.items():
        star = "✅" if k in reqs else "—"
        typ = fmt_type(v)
        desc = (v.get("description") or "").replace("\n", " ").strip()
        lines.append(f"| `{k}` | {star} | `{typ}` | {desc} |")
    lines.append("")

with open(OUT, "w", encoding="utf-8") as f:
    f.write("\n".join(lines))

# 统计
swagger_paths = set(paths)
notes_used = sum(1 for k in notes if k != "_comment" and k.split(" ", 1)[-1] in swagger_paths)
src_used = sum(1 for p in send_calls if p in swagger_paths)
print(f"✅ 生成完成: {OUT}")
print(f"   共 {len(paths)} endpoint / {len(tag_order)} tag / {len(defs)} definitions / {len(lines)} 行")
print(f"   实测调用覆盖 {src_used} 端点 (源码) / 探索笔记 {notes_used} 端点 (api-notes)")
