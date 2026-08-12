#!/usr/bin/env python3
"""从 WeChatPad Pro swagger.json 生成完整 API 参考文档 (Markdown)。

用法: python3 scripts/gen-api-reference.py [swagger.json] [output.md]
来源: http://127.0.0.1:8062/swagger.json (vendor 本地 Swagger UI)
"""
import json
import sys
from collections import defaultdict

SWAGGER = sys.argv[1] if len(sys.argv) > 1 else "/tmp/wpp-swagger.json"
OUT = sys.argv[2] if len(sys.argv) > 2 else "/root/dev/wechatpadpro-openclaw/docs/WPP-API-REFERENCE.md"

with open(SWAGGER, encoding="utf-8") as f:
    spec = json.load(f)

paths = spec.get("paths", {})
defs = spec.get("definitions", {})

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

def fmt_param(p):
    """格式化单个参数"""
    name = p.get("name", "?")
    loc = p.get("in", "?")
    req = "必填" if p.get("required") else "可选"
    desc = (p.get("description") or "").strip().replace("\n", " ")
    typ = fmt_type(p.get("schema", {})) if "schema" in p else p.get("type", "any")
    default = p.get("default")
    if loc == "body":
        s = p.get("schema", {})
        ref_names = []
        # 直接 $ref 或 allOf 里的 $ref 都展开
        if "$ref" in s:
            ref_names.append(s["$ref"].split("/")[-1])
        for sub in s.get("allOf", []):
            if "$ref" in sub:
                ref_names.append(sub["$" if False else "ref"].split("/")[-1])
        detail = []
        for ref_name in ref_names:
            defn = defs.get(ref_name, {})
            props = defn.get("properties", {})
            reqs = set(defn.get("required", []))
            for k, v in props.items():
                star = "*" if k in reqs else ""
                detail.append(f"{k}{star}:{fmt_type(v)}")
        ex = s.get("example") or p.get("x-example")
        ex_str = f" 示例={json.dumps(ex, ensure_ascii=False)}" if ex else ""
        if detail:
            return f"**body** `{name}` ({req}) — {desc} — `{' + '.join(ref_names)}` {{ {', '.join(detail)} }}{ex_str}"
        return f"**body** `{name}` ({req}) — {desc} — `{typ}`{ex_str}"
    enum = p.get("enum")
    if enum:
        typ = f"{typ}({'|'.join(map(str, enum))})"
    return f"**{loc}** `{name}` ({req}) — {desc} — `{typ}`" + (f" 默认={default}" if default is not None else "")

# ---- 生成 Markdown ----
lines = []
lines.append("# WeChatPad Pro API 参考文档")
lines.append("")
lines.append("> **来源**: vendor 本地 Swagger UI — http://127.0.0.1:8062/swagger.json (容器 `wechatpadpromax08` port 8062)")
lines.append(f"> **生成时间**: 2026-08-10 (自动生成, 勿手改; 重生成: `python3 scripts/gen-api-reference.py`)")
lines.append(f"> **统计**: {len(paths)} 个 endpoint / {len(tag_order)} 个 tag")
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
    # 该 tag 端点表
    lines.append("| # | Method | Path | 说明 |")
    lines.append("|---|---|---|---|")
    for i, e in enumerate(eps, 1):
        lines.append(f"| {i} | `{e['method']}` | `{e['path']}` | {e['summary']} |")
    lines.append("")
    # 每个端点详情
    for e in eps:
        lines.append(f"### {e['method']} {e['path']}")
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
                # body 参数: 展开 allOf/$ref definitions
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

print(f"✅ 生成完成: {OUT}")
print(f"   共 {len(paths)} endpoint / {len(tag_order)} tag / {len(defs)} definitions / {len(lines)} 行")
