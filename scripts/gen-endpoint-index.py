#!/usr/bin/env python3
"""Generate ENDPOINT-INDEX.md from swagger + send/ + agent-tools mapping."""
import json, re, os, sys
from collections import defaultdict

SWAGGER = '/tmp/juhe-openapi.json'
OUT = '/root/dev/wechatpadpro-openclaw/docs/ENDPOINT-INDEX.md'
SEND_DIR = '/root/dev/wechatpadpro-openclaw/src/send'
META_DIR = '/root/dev/wechatpadpro-openclaw/src/dispatch/agent-tools'
INDEX_TS = '/root/dev/wechatpadpro-openclaw/src/send/index.ts'

# --- tag → camelCase filename mapping (swagger tag → send file) ---
TAG_TO_FILE = {
    'Login': 'login.ts', 'Msg': 'msg.ts', 'Group': 'group.ts', 'Friend': 'friend.ts',
    'User': 'user.ts', 'Finder': 'finder.ts', 'FriendCircle': 'friendcircle.ts',
    'Search': 'search.ts', 'Wxapp': 'wxapp.ts', 'OfficialAccounts': 'officialaccounts.ts',
    'Tools': 'tools.ts', 'TenPay': 'tenpay.ts', 'Favor': 'favorites.ts',
    'Label': 'label.ts', 'Voice': 'voice.ts', 'QWContact': 'qwcontact.ts',
    'SayHello': 'sayhello.ts', 'Translate': 'translate.ts', 'Customized': 'customized.ts',
    'Webhook': 'webhook.ts', 'Admin': '(已移除 v1.1.17, 高权限)',
}

def load_swagger():
    with open(SWAGGER) as f:
        return json.load(f)

def get_endpoints(sw):
    by_tag = defaultdict(list)
    for p, methods in sw.get('paths', {}).items():
        for m, op in methods.items():
            if m not in ('get', 'post', 'put', 'delete', 'patch'):
                continue
            tags = op.get('tags', ['untagged'])
            method = m.upper()
            for t in tags:
                by_tag[t].append((p, method, op.get('summary', '')[:50]))
    return by_tag

def get_registered_endpoints():
    """Read WPP_VENDOR_ENDPOINTS from send/index.ts."""
    idx = open(INDEX_TS).read()
    m = re.search(r'export const WPP_VENDOR_ENDPOINTS = \{([\s\S]*?)\n\} as const', idx)
    if not m:
        return set(), {}
    body = m.group(1)
    # tag: [ "/A/B", ... ]
    registered = set()
    per_tag = defaultdict(set)
    for tagm in re.finditer(r'(\w+):\s*\[([\s\S]*?)\]', body):
        tag = tagm.group(1)
        eps = re.findall(r'"(/[^"]+)"', tagm.group(2))
        for ep in eps:
            registered.add(ep)
            per_tag[tag].add(ep)
    return registered, per_tag

def get_persist_types():
    """Read OUTBOUND_MSG_TYPES (endpoint → 入库 msgType) from send/msg.ts."""
    msg = open(os.path.join(SEND_DIR, 'msg.ts')).read()
    m = re.search(r'const OUTBOUND_MSG_TYPES: Record<string, string> = \{([\s\S]*?)\n\};', msg)
    if not m:
        return {}
    body = m.group(1)
    persist = {}
    for ep, typ in re.findall(r'"(/[^"]+)":\s*"([^"]+)"', body):
        persist[ep] = typ
    return persist

def main():
    sw = load_swagger()
    by_tag = get_endpoints(sw)
    registered, _ = get_registered_endpoints()
    persist = get_persist_types()

    lines = []
    lines.append('# WPP 插件 Endpoint 索引 (自动生成)')
    lines.append('')
    lines.append(f'- 来源: swagger `{SWAGGER}` ({len(sw.get("paths", {}))} paths)')
    lines.append('- 生成时间: 见文件 mtime (脚本 /tmp/gen-endpoint-index.py)')
    lines.append('- 用途: 快速查找 endpoint → 实现文件 (send/<tag>.ts) + AI 工具 (agent-tools/<tag>-meta.ts)')
    lines.append('')
    lines.append('## 如何查找')
    lines.append('')
    lines.append('| 场景 | 去哪个文件 |')
    lines.append('|---|---|')
    lines.append('| 出站调用 (发什么) | `send/<tag>.ts` (makeWppXxx 每端点 1 方法) |')
    lines.append('| AI 工具 (agent 用什么) | `dispatch/agent-tools/<tag>-meta.ts` (每端点 1 工具) |')
    lines.append('| 入站解析 (收到怎么解析) | `inbound/parser*.ts` + `media-enrich.ts` |')
    lines.append('| 业务编排 (触发/上下文) | `dispatch/dispatcher.ts` + `inbound/handler.ts` |')
    lines.append('')

    # Per-tag sections
    for tag in sorted(by_tag, key=lambda t: -len(by_tag[t])):
        send_file = TAG_TO_FILE.get(tag, '?')
        meta_file = f'{tag.lower()}-meta.ts' if os.path.exists(os.path.join(META_DIR, f'{tag.lower()}-meta.ts')) else None
        if tag == 'Favor':
            meta_file = 'favorites-meta.ts' if os.path.exists(os.path.join(META_DIR, 'favorites-meta.ts')) else None
        eps = by_tag[tag]
        lines.append(f'## {tag} ({len(eps)} endpoints)')
        lines.append(f'- 实现: `send/{send_file}`' + (f' | AI 工具: `agent-tools/{meta_file}`' if meta_file else ' | AI 工具: (misc-meta)'))
        lines.append('')
        lines.append('| Endpoint | Method | 入库类型 (send/msg.ts) | 覆盖 | 说明 |')
        lines.append('|---|---|---|---|---|')
        for ep, method, summary in eps:
            # 有意移除的 endpoint (v1.1.17 老板拍板), 标记为 "移除" 而非 MISSING
            if ep in ('/Msg/SendApp', '/User/GetAllOnline'):
                covered = '🚫 移除 (v1.1.17)'
            elif ep in registered:
                covered = '✅'
            elif tag == 'Admin':
                covered = '—'
            else:
                covered = '❌ MISSING'
            ptype = persist.get(ep, '')
            lines.append(f'| `{ep}` | {method} | {ptype} | {covered} | {summary} |')
        lines.append('')

    # Coverage summary
    total = sum(len(v) for v in by_tag.values())
    covered = sum(1 for v in by_tag.values() for ep,_,_ in v if ep in registered)
    admin = sum(len(v) for t,v in by_tag.items() if t == 'Admin')
    lines.append('## 覆盖统计')
    lines.append('')
    lines.append(f'- swagger 总 endpoint: {total}')
    lines.append(f'- WPP_VENDOR_ENDPOINTS 已注册: {len(registered)}')
    lines.append(f'- 覆盖: {covered}/{total} (排除 Admin {admin} = {total-admin} 需覆盖, {covered}/{total-admin})')
    # 有意移除的 (非 bug)
    intentional = {'/Msg/SendApp', '/User/GetAllOnline'}
    missing = [(t, ep) for t, v in by_tag.items() if t != 'Admin' for ep,_,_ in v if ep not in registered and ep not in intentional]
    if missing:
        lines.append('- **未注册 endpoint (需补):**')
        for t, ep in missing:
            lines.append(f'  - [{t}] {ep}')
    lines.append('')
    lines.append('## 有意移除 (v1.1.17 老板拍板, 非缺失)')
    lines.append('')
    lines.append('| Endpoint | 原因 |')
    lines.append('|---|---|')
    lines.append('| `/Msg/SendApp` | P0-B: SendApp 是**群发消息**端点 (SendGroupMassMsgTextParamDoc), 误触发广播风险 |')
    lines.append('| `/User/GetAllOnline` | 权限过高, 插件中不用 |')
    lines.append('| Admin 3 端点 (GenAuthKey/DelayAuthKey/DeleteAuthKey) | 需要管理 key, 权限过高 |')
    lines.append('')

    with open(OUT, 'w') as f:
        f.write('\n'.join(lines))
    print(f'Generated {OUT}')
    print(f'Total: {total}, Admin: {admin}, Non-admin covered: {covered}/{total-admin}')
    if missing:
        print('Missing (non-admin):', len(missing))
        for t, ep in missing:
            print(f'  [{t}] {ep}')

if __name__ == '__main__':
    main()
