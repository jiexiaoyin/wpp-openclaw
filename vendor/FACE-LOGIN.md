# 人脸认证 + iPad 扫码登录引导

本文档引导完成 WeChatPadPro 服务端 (vendor) 部署后的**首次微信登录**：
通过**人脸 face 认证**完成设备绑定，再以 **iPad 协议扫码**登录微信。

> 适用: 官方 Docker 镜像 `wechatpadpro/wechatpadprobusiness:v2026.08.18.1` (见 [vendor/README.md](./README.md))。
> 前置: vendor 已用 `docker-deploy` 部署并运行 (`curl http://127.0.0.1:18062` 有响应)。

---

## 1. 登录链路总览

```
手机(微信扫一扫) → GetQR 获取二维码 → 扫码 → CheckQR 轮询确认
        ↓
   人脸 face 认证 (18080 代理) → 设备绑定
        ↓
   服务端生成 authcode (X-Access-Token) → 填入插件账号配置
```

- **authcode** 是后续所有 API 调用的凭证，走请求头 `X-Access-Token`。
- 一个 authcode 对应一套部署 + 一个微信账号，有效期至账号授权到期 (可续期)。

---

## 2. 人脸代理与证书 (第一次必须做)

vendor 主程序会自动启动同镜像内的 `pad-face-verify-linux-x64` (人脸验证代理)，
**不需要单独开进程**。默认端口 `18080`，桥接地址自动指向本机 API `18062`。

### 2.1 安装人脸 CA 证书 (每台手机第一次)

首次在一台手机上使用时，需要**安装当前服务器生成的 WeChatPadPro CA 证书**：

1. 证书路径: vendor 数据目录 `data/wechatpad/` 下 (docker-deploy 部署时自动生成)
2. 将 CA 证书传到手机并安装 + 信任 (iOS: 设置→通用→VPN与设备管理→安装描述文件→证书信任设置)
3. 证书属于这套部署，**不是每个微信账号一张**——同一套服务多个使用者可共用一张
4. ⚠️ 重新删除 `data/wechatpad/` 或更换部署数据目录后，会生成**新证书**，手机需重新安装并信任

### 2.2 人脸代理公网访问

生产环境的人脸代理端口 `18080` **不应向全网开放**，必须通过云安全组/防火墙**只允许当前实际验证手机的公网来源 IP**：

```ini
# config/app.conf — 有固定公网域名时建议填写 (留空则按请求 Host 自动生成)
pad_face_public_base_url = "https://YOUR_DOMAIN"
```

> 不要填写容器内部地址。手机网络变化后需同步更新白名单。

---

## 3. iPad 协议扫码登录

### 3.1 获取登录二维码

```bash
# authcode 使用服务端凭证 (X-Access-Token 头)
curl -X POST http://127.0.0.1:18062/api/Login/GetQR \
  -H "Content-Type: application/json" \
  -H "X-Access-Token: <authcode>" \
  -d '{"DeviceName":"我的 iPad","oversea":false}'
```

响应 `Data.QrBase64` 是二维码 base64 (可存为图片用手机扫)，`Data.Uuid` 是轮询标识。

> **代理说明**: GetQR 可传 `Proxy` 对象走 SOCKS5 代理 (微信需要时可配)：
> ```json
> {"DeviceName":"我的 iPad","oversea":false,
>  "Proxy":{"ProxyIp":"203.0.113.10:1080","ProxyUser":"u","ProxyPassword":"p"}}
> ```

### 3.2 手机扫码

用**微信扫一扫**扫描二维码。首次会触发**人脸认证**：
- 微信会拉起人脸验证界面，按提示完成 (配合第 2 节装好的 CA 证书 + 18080 代理白名单)
- 人脸验证通过 → 手机确认登录

### 3.3 轮询确认登录状态

```bash
# Uuid = GetQR 返回的 Data.Uuid; CheckToken = GetQR 返回的 Data.check_token
curl -X POST "http://127.0.0.1:18062/api/Login/CheckQR?uuid=<Uuid>" \
  -H "Content-Type: application/json" \
  -H "X-QR-Check-Token: <CheckToken>"
```

- 返回 `Success: true` → 登录成功
- 返回扫码待确认 → 等待手机确认
- 二维码过期 (约 4 分钟) → 重新 GetQR

### 3.4 验证登录

```bash
curl http://127.0.0.1:18062/api/Login/GetLoginStatus \
  -H "X-Access-Token: <authcode>"
# Data.loginState = "online" → 已登录
```

---

## 4. 配置插件连接

登录拿到 authcode 后，填入插件账号配置:

```jsonc
// accounts/<id>.json
{
  "apiBaseUrl": "http://127.0.0.1:18062",        // 或公网反代 https://wx.example.com
  "wsUrl": "ws://127.0.0.1:18089/ws/sync",        // 或 wss://wx.example.com/ws/sync
  "tokenKeyEnv": "WECHATPRO_TOKEN_KEY",
  "authcodeEnv": "WECHATPRO_AUTHCODE"             // 服务端登录后生成的 authcode
}
```

- **tokenKey**: 同服务端 `config/app.conf` 的 `user_token_key` (客户端密钥)
- **authcode**: 登录后服务端生成的授权码 (X-Access-Token 值)
- 两者通过环境变量注入 (凭证不进 JSON)

---

## 5. 常见问题

| 现象 | 原因 | 处理 |
|---|---|---|
| 扫码后一直转圈 | 人脸认证未通过 / 18080 白名单未开 | 检查手机来源 IP 是否在白名单 + CA 证书是否信任 |
| `云端未找到该授权` | authcode 无效/过期 | 确认用对的 authcode + 有效期内 |
| 手机要求装证书 | 首次使用该部署 | 安装并信任第 2.1 节的 CA 证书 |
| 换数据目录后扫码异常 | 生成新证书 | 手机重装新 CA 证书 |
| GetQR 失败 `INVALID_CREDENTIAL` | tokenKey/authcode 未对 | 确认 X-Access-Token 值是有效 authcode |

---

## 6. 相关文档

- [vendor/README.md](./README.md) — 服务端 Docker 部署
- `8075docker-deploy.zip` — 官方一键部署包 (install.sh + docker-compose.release.yml + check-proxy.sh)
- [../GETTING_STARTED.md](../GETTING_STARTED.md) — 插件安装
