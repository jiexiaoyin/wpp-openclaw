# WeChatPadPro 服务端 (vendor)

本插件对接 **WeChatPadProMAX** (WeChatPadProBusiness) 微信 Pad 服务端。v1.3.68 起**发布包不再捆绑服务端二进制**，服务端通过**官方 Docker 镜像**获取。

## 版本对应

| 组件 | 版本 |
|---|---|
| 服务端 (vendor) | **v8_m4.1.12.29_p8.0.75.53** (build **20260818**, Docker 镜像 `v2026.08.18.1`) |
| 插件 | v1.3.68+ (本发布包) |

> **插件仅适配此版本服务端** — 新插件 (v1.3.68+) 的 37 个新增 API (群发/公众号/视频号/小微智能体等) 只在 **20260818 新 vendor** 可用。旧版服务端 (20260809) 已弃用, 请勿使用。

## 获取镜像

```bash
docker pull wechatpadpro/wechatpadprobusiness:v2026.08.18.1
```

镜像包含: 服务端主程序 + `swagger/` (313 个 API 文档) + 人脸验证代理 (pad-face-verify)。

## 部署 (官方 docker-deploy 发布包)

> 本发布包 `vendor/` 目录附带官方一键部署包 **`8075docker-deploy.zip`** (含 `docker-compose.release.yml` + `install.sh` + `check-proxy.sh` + `config/app.conf`)。**network_mode: host**, 端口即宿主机端口。

### 前置: 获取 tokenKey (客户端密钥)

部署 vendor **必须**先有 tokenKey (客户端密钥):

1. 打开 [访问控制](https://adminmax.knowhub.cloud/user/access-tokens) 并登录
2. 在 `access-tokens` 页面创建客户端密钥 (仅显示一次, 立即保存)
3. 填入 `config/app.conf` 的 `user_token_key` (install.sh 也会引导完成)

> 一个客户端密钥只对应一套部署, 新增服务器/迁移时单独创建, 不要多套共用。

```bash
# 1. 解压 vendor/8075docker-deploy.zip
unzip vendor/8075docker-deploy.zip
cd docker-deploy
# 2. 填 user_token_key (见上方"前置"), 或让 install.sh 引导
# 3. 首次运行: install.sh 会引导填 user_token_key (客户端密钥) + 自动生成 Redis 密码
chmod +x install.sh check-proxy.sh
./install.sh
```

### 关键配置 (config/app.conf)

```ini
user_token_key = "<你的客户端密钥>"     # adminmax.knowhub.cloud 后台生成, 每位使用者用自己的
httpaddr = "0.0.0.0"
httpport = 18062                        # HTTP API
websocketport = 18089                   # WebSocket
pad_face_verifier_port = 18080          # 手机人脸验证代理
redislink = 127.0.0.1:16379             # 项目独立 Redis (仅宿主机回环)
```

### 端口

| 用途 | 端口 |
|---|---|
| HTTP API | **18062** |
| WebSocket | **18089** |
| Pad 人脸验证代理 | **18080** (仅白名单来源 IP) |
| Redis | **16379** (127.0.0.1 回环) |

## 与插件对接

| 插件配置 | 值 |
|---|---|
| `apiBaseUrl` | `http://<vendor>:18062` (公网反代: `https://wx.example.com`) |
| `wsUrl` | `ws://<vendor>:18089/ws/sync` (公网: `wss://wx.example.com/ws/sync`) |
| `WPP_VENDOR_HOST` | `<vendor 域名, 公网>`, 同机可 `http://127.0.0.1:18062` |
| tokenKey | 同 `user_token_key` |

### 鉴权方式 (新 vendor)

- **authcode** 走请求头 **`X-Access-Token`** (不是 query); 设备登录后由服务端生成, 有效期至账号授权到期。
- 每个 API 还需 `authcode` query 参数 (插件 `withAuthcodeQuery` 自动注入)。

> 微信需先通过服务端扫码登录 (`/Login/GetQR` → `/Login/CheckQR`), 拿到 `authcode` 后填入插件账号配置。
> 完整的人脸 face 认证 + iPad 扫码登录引导见 **[FACE-LOGIN.md](./FACE-LOGIN.md)** (含人脸 CA 证书安装、18080 代理白名单、GetQR/CheckQR 调用示例)。

## 升级服务端

```bash
docker pull wechatpadpro/wechatpadprobusiness:v2026.08.18.1   # 拉新镜像
cd docker-deploy && ./install.sh                              # 重建容器 (保留 config/ + data/)
```

## 许可证

服务端镜像版权归服务提供方所有。请遵守当地法律法规及微信平台条款。
