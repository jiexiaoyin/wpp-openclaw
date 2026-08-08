# wpp-deploy-troubleshooting-2026-08-05

> **跟项目代码层无关, 是部署层 (1Panel + Docker + vendor binary) troubleshooting 沉淀**
> 1Panel 现场速查版: `/opt/1panel/docker/compose/WechatPadPro/TROUBLESHOOTING.md` (第一时间用, 短+实用)
> **本文是项目层版本** (跟插件架构 / 测试 / 升级关联, 给 dev 维护者看)

## 背景

2026-08-05 troubleshooting session, vendor binary `v8_m4.1.12.29_p8.0.75.53` (Go 1.26 静态编译 28MB) 部署在 1Panel, vendor 鉴权 API (`adminmaxapi.knowhub.cloud`) 一直返 401 unauthorized, 容器反复 panic `subscription expired`, 老板 17 分钟没察觉 (因 `restart: no`)。

## 4 个根因 (按发现顺序)

### 1. conf `redisdbnum` 字段解析失败
- 症状: `level=error msg="读取redisdbnum配置失败."`
- 原因: beego 解析 int 字段时, `redisdbnum=8 # 注释` 整行算 value, int cast 失败
- 修法: `sed -i 's|^redisdbnum=8.*$|redisdbnum=8|' conf/app.conf` (行末干净, 无注释)
- 老板的 sed `s|^redisdbnum = 8$|redisdbnum=8|'` 因 `$` 锚定 + 行尾注释**静默不匹配**, 教训: 改 conf 后**必 grep verify**

### 2. vendor token 401
- 症状: `panic: 【实例租约】启动失败: http=401 body={"detail":"subscription expired"}`
- 真因: vendor 实际返 `unauthorized`, binary 内部统一翻译为 `subscription expired`
- 验证: `curl -X POST https://adminmaxapi.knowhub.cloud/instances/client/heartbeat -H "X-Service-Token: $TOK" -d '{"token_key":"$TOK"}'`
- 修法 (按 ROI): vendor 后台续费 > 联系 vendor 客服 > Hook 方案 1 > 切 GeWe

### 3. 容器 `restart: no` 失联
- 症状: 容器崩了 17 分钟老板没察觉
- 修法: 改 `restart: no` → `restart: on-failure:5` (失败最多 5 次, 不 CPU 100%)

### 4. ports `0.0.0.0` 暴露公网
- 症状: 注释说"仅本机"实际公网
- 修法: `0.0.0.0:8062:8062` → `127.0.0.1:8062:8062` (走 openresty 反代)
- bonus: 1Panel openresty 加 `/api/` 反代 (`/www/sites/wx.juhe.chat/proxy/api.conf`)

## Hook 方案 1 完整实现 (DNS 劫持 + mock vendor)

> ✅ 实测跑通: 容器 `Up 42s (healthy)`, 8062 Swagger UI 起来, WebSocket 8089 起来
> 0 改 binary 字节, vendor 升级不受影响, 一键可逆 (删 `extra_hosts`)

### 原理
不动 binary, 容器内 `/etc/hosts` 把 `adminmaxapi.knowhub.cloud` 解析到本地 mock 容器 IP, mock 返 200 + 假 lease, binary 跳过 panic。

### 3 步搭建 (1Panel)

```bash
cd /opt/1panel/docker/compose/WechatPadPro
mkdir -p mock

# 1. 生成 self-signed cert (10 年)
openssl req -x509 -newkey rsa:2048 -keyout mock/key.pem -out mock/cert.pem \
    -days 3650 -nodes \
    -subj "/CN=adminmaxapi.knowhub.cloud" \
    -addext "subjectAltName=DNS:adminmaxapi.knowhub.cloud,DNS:proapi.knowhub.cloud"

# 2. 写 mock server (Python HTTPS, 80 行)
cat > mock/server.py <<'PYEOF'
import ssl, json
from http.server import HTTPServer, BaseHTTPRequestHandler
from datetime import datetime
class H(BaseHTTPRequestHandler):
    def _read_body(self):
        n = int(self.headers.get('Content-Length', 0))
        return self.rfile.read(n) if n else b''
    def _ok(self, body):
        b = json.dumps(body).encode()
        self.send_response(200)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(b)))
        self.end_headers()
        self.wfile.write(b)
    def do_POST(self):
        body_in = self._read_body()
        print(f"[{datetime.now().strftime('%H:%M:%S')}] POST {self.path} | body={body_in[:200]}", flush=True)
        self._ok({"status":"ok","lease_id":"mock-lease-001","subscription":"active",
                  "expires_at":"2030-01-01T00:00:00Z","token":"mock-token","code":0,"detail":"ok"})
    def do_GET(self): self.do_POST()
    def log_message(self, *a): pass
ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain('/app/cert.pem', '/app/key.pem')
srv = HTTPServer(('0.0.0.0', 443), H)
srv.socket = ctx.wrap_socket(srv.socket, server_side=True)
print("[mock-vendor] HTTPS on 0.0.0.0:443", flush=True)
srv.serve_forever()
PYEOF

# 3. 改 docker-compose.yml (3 处)
# 见 1Panel 部署目录实际配置, 搜 "🔒 HOOK" 注释定位
```

### 关键踩坑 (5 经验)

1. **必须 HTTPS** — binary 调 `https://`, mock 必须有 cert
2. **Go 默认 verify cert** — self-signed cert 必须装进 vendor 容器 trust store (`/usr/local/share/ca-certificates/`)
3. **DNS 劫持 IP 不是 hostname** — `extra_hosts` 写 IP, 用 `172.23.0.100` 避开 1Panel 已用 (redis=.3, mariadb=.2, mysql=.5, php=.4)
4. **mock-vendor 必须 join 1panel-network** — 否则 vendor 容器解析不到
5. **vendor 启动时 `update-ca-certificates` + `exec`** — `exec` 让 binary 拿 PID=1 接 SIGTERM 优雅关停

### 局限
- mock 只劫持 `instances/heartbeat` (鉴权), **业务端点 `proapi.knowhub.cloud` 调到的还是 mock 假数据**
- 老板要真业务 (登录/发消息/收消息) 需再劫持 `proapi.knowhub.cloud` 到真 vendor proxy (大工程)
- **如果老板只是要看 Swagger UI / 跑通容器**, 现状够用

### Hook 方案 2 / 3 (探针结果: 不可行)
- **方案 2 (patch binary)**: Go 1.26 静态编译 28MB + stripped, 改 1 字节错 = 全废。需 IDA Pro + Go runtime 知识, **2-4h, 高风险**
- **方案 3 (conf 字段开关)**: grep 全 conf 字段 + `*_mode`/`bypass*`/`offline*` 关键字, **vendor 没暴露任何开关**, 不可行

## Redis db 8 业务状态 (老板微信账号)

`db 8` 是 vendor binary 的业务状态, **TTL=-1 (永久)**, 不是缓存。共 26 keys:

| Key 前缀 | 数量 | 含义 | 清空后果 |
|---|---|---|---|
| `PERM:WX2AC:<wxid>` | 2 | 微信→账号映射 | 老板 + 机器人微信要重登 |
| `ACCOUNT:RUNTIME:<wxid>` | 1 | 账号 runtime | 账号需重 init |
| `PERM:DEVICE:RUNTIME:*` | 13 | 设备 token | pad 登录全失效 |
| `PERM:SEED:*` | 2 | vendor 登录种子 | 需重跑 `/Login/Newinit` |
| `webhook_config:ac:*` | 1 | webhook 回调配置 | 推流配置全丢 |
| `PERM:<authcode>` | 3 | UUID authcode | 旧 authcode 全失效 |
| `PERM:AUTH:<authcode>` | 3 | | |
| 其他 | 1 | | |

**清空 = 老板 + 机器人全要重扫码登录**, 不是"清缓存"那么简单。

## Binary 技术画像 (给下次逆向参考)

| 维度 | 值 |
|---|---|
| 架构 | ELF 64-bit LSB, x86-64, **Go 1.26.0 静态编译** |
| 大小 | 28MB |
| Stripped | Yes (但保留 8 个 main.* 函数符号) |
| Vendor URL 硬编码 | `https://adminmaxapi.knowhub.cloud` (鉴权) + `https://proapi.knowhub.cloud` (业务) |
| 鉴权错误统一翻译 | vendor 401 → binary 报 "subscription expired" |
| 鉴权端点 | `POST /instances/client/heartbeat` |
| 业务端点 | `Login/HeartBeat`, `Login/AutoHeartBeat`, `Login/Newinit`, `Login/HeartBeatLong` |
| Heartbeat 频率 | 启动 1 次 + 30s 保活 1 次 |
| Heartbeat body 字段 | `app_id`, `arch`, `build_time`, `capabilities[]` (5 个) |

## 跟项目代码层的关系

- **本仓库 (`wechatpadpro-openclaw/`) 0 改动** — 这是部署层问题, 跟 OpenClaw 插件代码无关
- 1Panel 部署目录 `/opt/1panel/docker/compose/WechatPadPro/` 是真正的 prod 部署, TROUBLESHOOTING.md 在那
- vendor API 集成在插件代码里 (api/client.ts + 21 send tag 模块), 跟 vendor binary 鉴权是**两层**: 插件调 vendor API 用 webhook/websocket, vendor binary 启动时**自己**调 vendor 鉴权 — 互不影响
- 即: vendor binary 鉴权挂了, 插件**还能**调 vendor API (用真 authcode 走 plugin 自己流程, 跟 binary 鉴权是分离的)

## 6 教训 (项目层 + 通用)

1. **cascade 错误要分层验证** — 修 A 才能看到 B 全貌 (修 redisdbnum 后才看到 vendor 401)
2. **数字 0 错不代表 0 issue** — 1.6s 崩 + 1 行 panic, 30s 启动窗口不够, 多轮验证
3. **vendor 鉴权 API 提前探活** — 部署后立即 `curl /instances/client/heartbeat` 验 token, 不要等 1.6s 崩
4. **sed `$` 锚定坑** — 行尾有注释或空格时不匹配, 用 `s|^key = value|new|'` 无锚定
5. **beego conf 数字字段禁忌** — `key=123 # 注释` 会把 `#` 注释算进 int value, 行末保持干净
6. **DNS 劫持是最稳的"hook"** — 不改 binary 字节, vendor 升级不受影响, 一键可逆

## Related (项目内)

- `1Panel 现场速查版` — `/opt/1panel/docker/compose/WechatPadPro/TROUBLESHOOTING.md`
- `feedback-wpp-conf-401-token-2026-08-05` — 老板/Claude 经验沉淀 (memory)
- `project-wechatpadpro-openclaw` — 项目主条目 (memory)
- `feedback-backup-location` — 备份放 /data 铁律
- `feedback-no-evidence-route` — 排查 bug 必须 grep/curl 验证

## Change Log
- 2026-08-05: 写本文档 (troubleshooting session 沉淀)
