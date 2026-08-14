# WeChatPadPro 服务端 (vendor)

本目录包含本插件对接的 **WeChatPadProMAX** 微信 Pad 服务端二进制包。

## 版本对应

| 组件 | 版本 |
|---|---|
| 服务端 (vendor) | **v8_m4.1.12.29_p8.0.75.53** (build 20260809) |
| 插件 | v1.3.62+ (本发布包) |

> **插件仅适配此版本** — 请勿混用其它版本的服务端, 否则接口可能不兼容。

## 文件说明

```
vendor/
├── 20260809_030557_linux64_v8_m4.1.12.29_p8.0.75.53.tar.gz   # 服务端二进制 + 配置 + swagger
└── README.md                                                  # 本文件
```

- 解压后: Go 静态二进制 (vendor 主程序) + `conf/app.conf` + `swagger/` + `metadata.json`
- 端口: HTTP API **8062** + WebSocket **8089** (与插件 `apiBaseUrl`/`wsUrl` 对应)
- 依赖: **Redis** (默认 `127.0.0.1:6379`, db=8)

## 校验 (可选)

```bash
md5sum 20260809_030557_linux64_v8_m4.1.12.29_p8.0.75.53.tar.gz
# 期望: b5057a8c895dfa24...
```

## 部署

> 服务端在微信协议侧, 需要能连微信 (MMTLS)。建议跑在独立容器/机器。

```bash
# 1. 解压
mkdir -p vendor && tar xzf 20260809_030557_linux64_v8_m4.1.12.29_p8.0.75.53.tar.gz -C vendor

# 2. 配置 (编辑 conf/app.conf)
#    - user_token_key = "<你的 TokenKey>"   # 个人中心生成, 每位使用者用自己的
#    - redislink = "127.0.0.1:6379"          # 你的 Redis
#    - websocketport = 8089                  # 保持默认

# 3. 运行 (解压出的 Go 二进制名 = wechatpadpromax08, 保持原名)
cd vendor && ./wechatpadpromax08

# 4. 验证
#    - HTTP:   curl http://127.0.0.1:8062  → 应返回服务信息
#    - Swagger: http://127.0.0.1:8062/swagger/  (254 个 API 文档)
#    - WebSocket: 客户端连 ws://127.0.0.1:8089/ws/sync
```

### 公网接入 (插件需要访问)

服务端必须在插件**可访问**的地址, 两种方式:

1. **同机部署**: 插件 `apiBaseUrl=http://127.0.0.1:8062`, `wsUrl=ws://127.0.0.1:8089/ws/sync`
2. **反代**: nginx 反代 8062/8089 到域名 (如 `https://wx.example.com`), 插件 `WPP_VENDOR_HOST=https://wx.example.com` (媒体下载白名单, 必设)

## 与插件对接

| 插件配置 | 值 |
|---|---|
| `apiBaseUrl` | `http://<vendor>:8062` |
| `wsUrl` | `ws://<vendor>:8089/ws/sync` |
| `WPP_VENDOR_HOST` | `<vendor 域名, 公网>`, 同机可 `http://127.0.0.1:8062` |
| tokenKey | 同 `user_token_key` |

> 微信需先通过服务端扫码登录 (swagger `/Login/GetQR` → `/Login/CheckQR`), 拿到 `authcode` 后填入插件账号配置。

## 许可证

服务端二进制版权归服务提供方所有, 本发布仅供部署参考。请遵守当地法律法规及微信平台条款。
