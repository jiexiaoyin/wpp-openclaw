# WeChatPad Pro API 参考文档

> **来源**: vendor 本地 Swagger UI — http://127.0.0.1:8062/swagger.json (容器 `wechatpadpromax08` port 8062)
> **生成时间**: 2026-08-10 (自动生成, 勿手改; 重生成: `python3 scripts/gen-api-reference.py`)
> **统计**: 254 个 endpoint / 21 个 tag

## 目录

- [Admin (3)](#admin)
- [Login (38)](#login)
- [Msg (18)](#msg)
- [Friend (12)](#friend)
- [Group (23)](#group)
- [User (18)](#user)
- [Label (5)](#label)
- [Finder (15)](#finder)
- [FriendCircle (17)](#friendcircle)
- [Favor (4)](#favor)
- [Search (23)](#search)
- [OfficialAccounts (12)](#officialaccounts)
- [Wxapp (20)](#wxapp)
- [QWContact (3)](#qwcontact)
- [SayHello (2)](#sayhello)
- [TenPay (12)](#tenpay)
- [Voice (3)](#voice)
- [Translate (2)](#translate)
- [Tools (17)](#tools)
- [Customized (1)](#customized)
- [Webhook (6)](#webhook)

---

## 总览

| Tag | 端点数 | 说明 |
|---|---|---|
| Admin | 3 | 授权管理：授权记录的生成、延期与回收。 |
| Login | 38 | 登录会话：扫码登录、状态检查、心跳与会话恢复。 |
| Msg | 18 | 消息能力：消息发送、同步与媒体处理。 |
| Friend | 12 | 好友管理：联系人查询、添加与关系维护。 |
| Group | 23 | 群组管理：群资料、成员与群设置。 |
| User | 18 | 用户资料：账号信息与个人资料管理。 |
| Label | 5 | 标签管理：联系人标签与分组能力。 |
| Finder | 15 | 视频号：视频号内容与账号能力。 |
| FriendCircle | 17 | 朋友圈：内容发布、互动与查询。 |
| Favor | 4 | 收藏：收藏内容的读取与管理。 |
| Search | 23 | 搜索：文章、公众号、小程序与综合内容搜索。 |
| OfficialAccounts | 12 | 公众号：公众号资料与内容能力。 |
| Wxapp | 20 | 小程序：小程序授权、信息与业务调用。 |
| QWContact | 3 | 企业微信：企业联系人相关能力。 |
| SayHello | 2 | 打招呼：陌生人招呼与验证消息。 |
| TenPay | 12 | 支付：支付相关业务接口。 |
| Voice | 3 | 语音：语音消息与转写能力。 |
| Translate | 2 | 翻译：文本与消息翻译能力。 |
| Tools | 17 | 工具：通用查询与辅助能力。 |
| Customized | 1 | 自定义：扩展业务接口。 |
| Webhook | 6 | 事件回调：按账号配置消息回调。 |

---

## Admin

> 授权管理：授权记录的生成、延期与回收。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Admin/DelayAuthKey` | 延期授权码a |
| 2 | `POST` | `/Admin/DeleteAuthKey` | 删除授权码 |
| 3 | `POST` | `/Admin/GenAuthKey` | 生成授权码 |

### POST /Admin/DelayAuthKey

**说明**: 延期授权码a

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Admin-Token` | — | `string` | 管理员凭证；仅在开启管理员接口后使用 |
| body | `body` | ✅ | `Admin.DelayAuthKeyModel; {`authcode`:string, `days`:integer}` | authcode/days 示例={"authcode": "", "days": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Admin/DeleteAuthKey

**说明**: 删除授权码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Admin-Token` | — | `string` | 管理员凭证；仅在开启管理员接口后使用 |
| body | `body` | ✅ | `Admin.DeleteAuthKeyModel; {`authcode`:string}` | authcode 示例={"authcode": ""} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Admin/GenAuthKey

**说明**: 生成授权码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Admin-Token` | — | `string` | 管理员凭证；仅在开启管理员接口后使用 |
| body | `body` | ✅ | `Admin.GenAuthKeyModel; {`count`:integer, `days`:integer, `remark`:string}` | remark 示例={"count": 0, "days": 0, "remark": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Login

> 登录会话：扫码登录、状态检查、心跳与会话恢复。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Login/62data` | 62登陆(账号或密码) |
| 2 | `POST` | `/Login/62dataQRCodeApply` | 62登陆(账号或密码), 并申请使用二维码验证 |
| 3 | `POST` | `/Login/62dataSMSAgain` | 62登陆(账号或密码), 重发验证码 |
| 4 | `POST` | `/Login/62dataSMSApply` | 62登陆(账号或密码), 并申请使用SMS验证 |
| 5 | `POST` | `/Login/62dataSMSVerify` | 62登陆(账号或密码), 二维码验证校验 |
| 6 | `POST` | `/Login/A16Data` | A16登陆(账号或密码) - android == 8.0.50 |
| 7 | `POST` | `/Login/A16Data848` | A16登陆(账号或密码) - android == 新版云函数 |
| 8 | `POST` | `/Login/AutoHeartBeat` | 开启自动心跳, 自动二次登录 |
| 9 | `POST` | `/Login/Awaken` | 唤醒登陆(只限扫码登录) |
| 10 | `POST` | `/Login/CheckMacQR` | 检测Mac二维码 |
| 11 | `POST` | `/Login/CheckQR` | 检测二维码 |
| 12 | `POST` | `/Login/ExtDeviceLoginConfirmGet` | 新设备扫码登录 |
| 13 | `POST` | `/Login/ExtDeviceLoginConfirmOk` | 新设备扫码确认登录 |
| 14 | `POST` | `/Login/Get62Data` | 获取62数据 |
| 15 | `POST` | `/Login/GetA16Data` | 获取A16数据 |
| 16 | `POST` | `/Login/GetCacheInfo` | 获取登陆缓存信息 |
| 17 | `POST` | `/Login/GetLoginQRCode862` | 获取二维码(iPad 8.0.62 专用) |
| 18 | `POST` | `/Login/GetQR` | 获取二维码(iPad) |
| 19 | `POST` | `/Login/GetQRMac` | 获取二维码(Mac) |
| 20 | `POST` | `/Login/GetQRMac_oversea` | 获取二维码(Mac，海外) |
| 21 | `POST` | `/Login/GetQRPad` | 获取二维码(安卓Pad-ppmt专用) |
| 22 | `POST` | `/Login/GetQRPadx` | 获取二维码(安卓Pad-绕过验证码) |
| 23 | `POST` | `/Login/GetQRWatch` | 获取二维码(Car) |
| 24 | `POST` | `/Login/GetQRWin` | 获取二维码(Windows) |
| 25 | `POST` | `/Login/GetQRWinUnified` | 获取二维码(WinUnified-统一PC版) |
| 26 | `POST` | `/Login/GetQRWinUwp` | 获取二维码(WindowsUwp-绕过验证码) |
| 27 | `POST` | `/Login/GetQR_oversea` | 获取二维码(iPad，海外) |
| 28 | `POST` | `/Login/GetQRx` | 获取二维码(iPad-绕过验证码) |
| 29 | `POST` | `/Login/GetQRx_oversea` | 获取二维码(iPad-绕过验证码，海外) |
| 30 | `POST` | `/Login/HarmonyLoginApi` | 获取二维码(鸿蒙平板) |
| 31 | `POST` | `/Login/HeartBeat` | 心跳包 |
| 32 | `GET` | `/Login/HeartBeatLogs` | 获取心跳日志 |
| 33 | `POST` | `/Login/HeartBeatLong` | 长连接心跳包跳包 |
| 34 | `POST` | `/Login/LogOut` | 退出登录 |
| 35 | `GET` | `/Login/LongLinkStatus` | 查看当前账号长连接运行状态 |
| 36 | `POST` | `/Login/Newinit` | 初始化 |
| 37 | `POST` | `/Login/TwiceAutoAuth` | 二次登陆 |
| 38 | `POST` | `/Login/YPayVerificationcode` | 提交登录验证码 |

### POST /Login/62data

**说明**: 62登陆(账号或密码)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.Data62LoginReq; {`Data62`:string, `DeviceName`:string, `Password`:string, `Proxy`:models.ProxyInfo, `UserName`:string}` | 不使用代理请留空 示例={"Data62": "示例值", "DeviceName": "示例值", "Password": "your_password", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "UserName": "wxid_recipient"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/62dataQRCodeApply

**说明**: 62登陆(账号或密码), 并申请使用二维码验证

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.Data62LoginReq; {`Data62`:string, `DeviceName`:string, `Password`:string, `Proxy`:models.ProxyInfo, `UserName`:string}` | 不使用代理请留空 示例={"Data62": "示例值", "DeviceName": "示例值", "Password": "your_password", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "UserName": "wxid_recipient"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/62dataSMSAgain

**说明**: 62登陆(账号或密码), 重发验证码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.Data62SMSAgainReq; {`Cookie`:string, `Proxy`:models.ProxyInfo, `Url`:string}` | 不使用代理请留空 示例={"Cookie": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "Url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/62dataSMSApply

**说明**: 62登陆(账号或密码), 并申请使用SMS验证

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.Data62LoginReq; {`Data62`:string, `DeviceName`:string, `Password`:string, `Proxy`:models.ProxyInfo, `UserName`:string}` | 不使用代理请留空 示例={"Data62": "示例值", "DeviceName": "示例值", "Password": "your_password", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "UserName": "wxid_recipient"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/62dataSMSVerify

**说明**: 62登陆(账号或密码), 二维码验证校验

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.Data62SMSVerifyReq; {`Cookie`:string, `Proxy`:models.ProxyInfo, `Sms`:string, `Url`:string}` | 不使用代理请留空 示例={"Cookie": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "Sms": "示例值", "Url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/A16Data

**说明**: A16登陆(账号或密码) - android == 8.0.50

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.A16LoginParam; {`A16`:string, `DeviceName`:string, `Extend`:Algorithm.AndroidDeviceInfo, `Password`:string, `Proxy`:models.ProxyInfo, `UserName`:string}` | 不使用代理请留空 示例={"A16": "示例值", "DeviceName": "示例值", "Extend": {"AndriodBssId": "andriodbssid_from_previous_response", "AndriodFsId": "andriodfsid_from_previous_response", "AndriodId": "andriodid_from_previous_response", "AndriodSsId": "andriodssid_from_previous_response", "Androidversion": "示例值", "Arch": "示例值", "BuildBoard": "示例值", "BuildFP": "示例值", "BuildID": "buildid_from_previous_response", "Features": "示例值", "Hardware": "示例值", "Imei": "示例值", "KernelReleaseNumber": "示例值", "Manufacturer": "示例值", "PackageSign": "示例值", "PhoneModel": "示例值", "PhoneSerial": "示例值", "RadioVersion": "示例值", "SbMD5": "示例值", "SfArm64MD5": "示例值", "SfArmMD5": "示例值", "SfMD5": "示例值", "WLanAddress": "示例值", "WidevineDeviceID": "widevinedeviceid_from_previous_response", "WidevineProvisionID": "widevineprovisionid_from_previous_response", "WifiFullName": "示例值", "WifiName": "示例值"}, "Password": "your_password", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "UserName": "wxid_recipient"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/A16Data848

**说明**: A16登陆(账号或密码) - android == 新版云函数

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.A16LoginParam; {`A16`:string, `DeviceName`:string, `Extend`:Algorithm.AndroidDeviceInfo, `Password`:string, `Proxy`:models.ProxyInfo, `UserName`:string}` | 不使用代理请留空 示例={"A16": "示例值", "DeviceName": "示例值", "Extend": {"AndriodBssId": "andriodbssid_from_previous_response", "AndriodFsId": "andriodfsid_from_previous_response", "AndriodId": "andriodid_from_previous_response", "AndriodSsId": "andriodssid_from_previous_response", "Androidversion": "示例值", "Arch": "示例值", "BuildBoard": "示例值", "BuildFP": "示例值", "BuildID": "buildid_from_previous_response", "Features": "示例值", "Hardware": "示例值", "Imei": "示例值", "KernelReleaseNumber": "示例值", "Manufacturer": "示例值", "PackageSign": "示例值", "PhoneModel": "示例值", "PhoneSerial": "示例值", "RadioVersion": "示例值", "SbMD5": "示例值", "SfArm64MD5": "示例值", "SfArmMD5": "示例值", "SfMD5": "示例值", "WLanAddress": "示例值", "WidevineDeviceID": "widevinedeviceid_from_previous_response", "WidevineProvisionID": "widevineprovisionid_from_previous_response", "WifiFullName": "示例值", "WifiName": "示例值"}, "Password": "your_password", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "UserName": "wxid_recipient"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/AutoHeartBeat

**说明**: 开启自动心跳, 自动二次登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/Awaken

**说明**: 唤醒登陆(只限扫码登录)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/CheckMacQR

**说明**: 检测Mac二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| query | `uuid` | ✅ | `string` | 请输入取码时返回的UUID |
| query | `deviceID` | — | `string` | GetMacQR 返回的设备 ID；留空时服务尝试根据 uuid 恢复 |
| body | `body` | — | `Login.MaccodeParam; {`authcode`:string, `deviceID`:string, `uuid`:string}` | JSON 兼容调用；也可只使用 uuid/deviceID query 参数 示例={"authcode": "", "deviceID": "device_id_from_login", "uuid": "uuid_from_qr_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/CheckQR

**说明**: 检测二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| header | `X-QR-Check-Token` | — | `string` | GetQR 返回的二维码专属检测令牌（推荐） |
| query | `check_token` | — | `string` | 二维码检测令牌的旧客户端 query 兼容形式；优先使用 X-QR-Check-Token |
| query | `uuid` | ✅ | `string` | 请输入取码时返回的UUID |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/ExtDeviceLoginConfirmGet

**说明**: 新设备扫码登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.ExtDeviceLoginConfirmParam; {`Url`:string}` | URL == MAC iPad Windows 的微信二维码解析出来的url 示例={"Url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/ExtDeviceLoginConfirmOk

**说明**: 新设备扫码确认登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.ExtDeviceLoginConfirmParam; {`Url`:string}` | URL == MAC iPad Windows 的微信二维码解析出来的url 示例={"Url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/Get62Data

**说明**: 获取62数据

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetA16Data

**说明**: 获取A16数据

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetCacheInfo

**说明**: 获取登陆缓存信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetLoginQRCode862

**说明**: 获取二维码(iPad 8.0.62 专用)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com) 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult2` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQR

**说明**: 获取二维码(iPad)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRMac

**说明**: 获取二维码(Mac)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRMac_oversea

**说明**: 获取二维码(Mac，海外)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRPad

**说明**: 获取二维码(安卓Pad-ppmt专用)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com) 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRPadx

**说明**: 获取二维码(安卓Pad-绕过验证码)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com) 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRWatch

**说明**: 获取二维码(Car)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com) 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRWin

**说明**: 获取二维码(Windows)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com) 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRWinUnified

**说明**: 获取二维码(WinUnified-统一PC版)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com) 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRWinUwp

**说明**: 获取二维码(WindowsUwp-绕过验证码)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com) 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQR_oversea

**说明**: 获取二维码(iPad，海外)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRx

**说明**: 获取二维码(iPad-绕过验证码)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/GetQRx_oversea

**说明**: 获取二维码(iPad-绕过验证码，海外)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/HarmonyLoginApi

**说明**: 获取二维码(鸿蒙平板)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com) 示例={"DeviceName": "示例值", "Proxy": {"ProxyIp": "", "ProxyPassword": "", "ProxyUser": ""}, "oversea": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/HeartBeat

**说明**: 心跳包

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /Login/HeartBeatLogs

**说明**: 获取心跳日志

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | "返回日志列表" | `array<string>` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/HeartBeatLong

**说明**: 长连接心跳包跳包

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/LogOut

**说明**: 退出登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /Login/LongLinkStatus

**说明**: 查看当前账号长连接运行状态

返回 F104 握手模式、收发时间、重连次数和 Ticket 生命周期，不包含任何密钥材料

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/Newinit

**说明**: 初始化

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| query | `MaxSynckey` | — | `string` | 二次同步需要带入 |
| query | `CurrentSynckey` | — | `string` | 二次同步需要带入 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/TwiceAutoAuth

**说明**: 二次登陆

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Login/YPayVerificationcode

**说明**: 提交登录验证码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Login.VerificationcodeParam; {`Code`:string, `Data62`:string, `Ticket`:string, `Uuid`:string}` | true 示例={"Code": "示例值", "Data62": "示例值", "Ticket": "示例值", "Uuid": "uuid_from_qr_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Msg

> 消息能力：消息发送、同步与媒体处理。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Msg/Quote` | 发送引用回复消息 |
| 2 | `POST` | `/Msg/Revoke` | 撤回消息 |
| 3 | `POST` | `/Msg/SendApp` | 群发消息 |
| 4 | `POST` | `/Msg/SendCDNFile` | 发送文件(转发,并非上传) |
| 5 | `POST` | `/Msg/SendCDNImg` | 发送Cdn图片(转发图片) |
| 6 | `POST` | `/Msg/SendCDNVideo` | 发送Cdn视频(转发视频) |
| 7 | `POST` | `/Msg/SendEmoji` | 发送Emoji |
| 8 | `POST` | `/Msg/SendTxt` | 发送文本消息 |
| 9 | `POST` | `/Msg/SendVideo` | 发送视频 |
| 10 | `POST` | `/Msg/SendVoice` | 发送语音 |
| 11 | `POST` | `/Msg/SendXCX` | 发送小程序消息 |
| 12 | `POST` | `/Msg/ShareCard` | 分享名片 |
| 13 | `POST` | `/Msg/ShareLink` | 发送分享链接消息 |
| 14 | `POST` | `/Msg/ShareLocation` | 分享位置 |
| 15 | `POST` | `/Msg/ShareVideo` | 发送分享视频消息 |
| 16 | `POST` | `/Msg/StartAutoSync` | 启动自动同步 |
| 17 | `POST` | `/Msg/Sync` | 同步消息 |
| 18 | `POST` | `/Msg/UploadImg` | 发送图片 |

### POST /Msg/Quote

**说明**: 发送引用回复消息

支持文本、图片、语音、视频、应用消息及群聊；id/new_msg_id/svr_id 是同一个服务器消息ID。推荐发送 {"content":"回复内容","reply_context":收到消息.reply_context}，群聊上下文会同时携带群成员 from_user_id 与群会话 chat_user_id。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.QuoteDoc; {`chat_user_id`:string, `content`:string, `display_name`:string, `from_user_id`:string, `msg_type`:integer, `new_msg_id`:string, `quote_content`:string, `reply_context`:Msg.QuoteContextDoc, `sequence`:string, `svr_id`:string, `to_wxid`:string}` | 回复内容及被引用消息上下文；64位 svr_id/new_msg_id 必须使用字符串 示例={"content": "这是调用方对该消息的引用回复", "reply_context": {"svr_id": "4588852482559559123", "new_msg_id": "4588852482559559123", "msg_id": 1513020125, "msg_type": 34, "sequence": 46191, "to_wxid": "123456789@chatroom", "conversation_id": "123456789@chatroom", "from_user_id": "wxid_group_member", "chat_user_id": "123456789@chatroom", "quote_content": "你好，你可以做什么？"}} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `Msg.QuoteResponseDoc` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/Revoke

**说明**: 撤回消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.RevokeMsgParamDoc; {`ClientMsgId`:integer, `CreateTime`:integer, `NewMsgId`:integer, `ToUserName`:string}` | 请注意参数 示例={"ClientMsgId": 0, "CreateTime": 0, "NewMsgId": 0, "ToUserName": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/SendApp

**说明**: 群发消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.SendGroupMassMsgTextParamDoc; {`Content`:string, `ToIds`:array<string>}` | Type请根据场景设置,xml请自行构造 示例={"Content": "示例值", "ToIds": ["示例值"]} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/SendCDNFile

**说明**: 发送文件(转发,并非上传)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.DefaultParamDoc; {`Content`:string, `ToWxid`:string}` | Content==收到文件消息xml 示例={"Content": "示例值", "ToWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/SendCDNImg

**说明**: 发送Cdn图片(转发图片)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.DefaultParamDoc; {`Content`:string, `ToWxid`:string}` | Content==消息xml 示例={"Content": "示例值", "ToWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/SendCDNVideo

**说明**: 发送Cdn视频(转发视频)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.DefaultParamDoc; {`Content`:string, `ToWxid`:string}` | Content==消息xml 示例={"Content": "示例值", "ToWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/SendEmoji

**说明**: 发送Emoji

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Msg.SendEmojiParamDoc; {`Md5`:string, `ToWxid`:string, `TotalLen`:integer}` | true 示例={"Md5": "示例值", "ToWxid": "towxid_from_previous_response", "TotalLen": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/SendTxt

**说明**: 发送文本消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.SendNewMsgParamDoc; {`At`:string, `Content`:string, `ToWxid`:string, `Type`:integer}` | Type请填写1 At == 群@,多个wxid请用,隔开 示例={"At": "示例值", "Content": "示例值", "ToWxid": "towxid_from_previous_response", "Type": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/SendVideo

**说明**: 发送视频

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Msg.SendVideoMsgParamDoc; {`Base64`:string, `ImageBase64`:string, `PlayLength`:integer, `ToWxid`:string}` | true 示例={"Base64": "示例值", "ImageBase64": "示例值", "PlayLength": 0, "ToWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/SendVoice

**说明**: 发送语音

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.SendVoiceMessageParamDoc; {`Base64`:string, `ToWxid`:string, `Type`:integer, `VoiceTime`:integer}` | Type： AMR = 0, MP3 = 2, SILK = 4, SPEEX = 1, WAVE = 3 VoiceTime ：音频长度 1000为一秒 示例={"Base64": "示例值", "ToWxid": "towxid_from_previous_response", "Type": 0, "VoiceTime": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/SendXCX

**说明**: 发送小程序消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.DefaultParamDoc; {`Content`:string, `ToWxid`:string}` | Content==小程序xml 示例={"Content": "示例值", "ToWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/ShareCard

**说明**: 分享名片

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.ShareCardParamDoc; {`CardAlias`:string, `CardNickName`:string, `CardWxId`:string, `ToWxid`:string}` | ToWxid==接收的微信ID CardWxId==名片wxid CardNickName==名片昵称 CardAlias==名片别名 示例={"CardAlias": "示例值", "CardNickName": "示例值", "CardWxId": "cardwxid_from_previous_response", "ToWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/ShareLink

**说明**: 发送分享链接消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.SendAppMsgParamDoc; {`ToWxid`:string, `Type`:integer, `Xml`:string}` | Type==类型 Desc==描述 Xml==发送xml内容 ToWxid==接受者 示例={"ToWxid": "towxid_from_previous_response", "Type": 0, "Xml": "<msg></msg>"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/ShareLocation

**说明**: 分享位置

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.ShareLocationParamDoc; {`Infourl`:string, `Label`:string, `Poiname`:string, `Scale`:number, `ToWxid`:string, `X`:number, `Y`:number}` |  示例={"Infourl": "https://example.com", "Label": "示例值", "Poiname": "示例值", "Scale": 0, "ToWxid": "towxid_from_previous_response", "X": 0, "Y": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/ShareVideo

**说明**: 发送分享视频消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.ShareVideoMsgParamDoc; {`ToWxid`:string, `Xml`:string}` | xml：微信返回的视频xml 示例={"ToWxid": "towxid_from_previous_response", "Xml": "<msg></msg>"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/StartAutoSync

**说明**: 启动自动同步

启用该账号的统一消息同步；后续 WS/Webhook 的 sync_message 事件会自动带 reply_context，以及 image/video/file/voice 所需的结构化业务参数。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.SyncParam2Doc; {`TargetURL`:string}` | 兼容旧版：TargetURL 可忽略 示例={"TargetURL": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/Sync

**说明**: 同步消息

触发一次微信增量同步；聊天消息会同时按 wechatpad.message.v2 投递到 WS/Webhook。图片、视频、文件、语音分别在 image/video/file/voice 中携带包含 endpoint 的 download_context；文件与语音可通过 DownloadFileBinary/DownloadVoiceBinary 直接获得原始二进制文件，每条消息还携带 reply_context。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.SyncParamDoc; {`Scene`:integer, `Synckey`:string}` | Scene填写0,Synckey留空 示例={"Scene": 0, "Synckey": "your_synckey"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Msg/UploadImg

**说明**: 发送图片

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Msg.SendImageMsgParamDoc; {`Base64`:string, `ToWxid`:string}` | 请注意base64格式 示例={"Base64": "示例值", "ToWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Friend

> 好友管理：联系人查询、添加与关系维护。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Friend/Blacklist` | 添加/移除黑名单 |
| 2 | `POST` | `/Friend/Delete` | 删除好友 |
| 3 | `POST` | `/Friend/GetContractDetail` | 获取通讯录好友详情 |
| 4 | `POST` | `/Friend/GetContractList` | 获取通讯录好友 |
| 5 | `POST` | `/Friend/GetFriendstate` | 查询好友状态 |
| 6 | `POST` | `/Friend/GetMFriend` | 获取手机通讯录 |
| 7 | `POST` | `/Friend/LbsFind` | 附近人 |
| 8 | `POST` | `/Friend/PassVerify` | 通过好友请求 |
| 9 | `POST` | `/Friend/Search` | 搜索联系人 |
| 10 | `POST` | `/Friend/SendRequest` | 添加联系人(发送好友请求) |
| 11 | `POST` | `/Friend/SetRemarks` | 设置好友备注 |
| 12 | `POST` | `/Friend/Upload` | 上传通讯录 |

### POST /Friend/Blacklist

**说明**: 添加/移除黑名单

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Friend.BlacklistParamDoc; {`toWxid`:string, `val`:integer}` | Val == 15添加  7移除 示例={"toWxid": "towxid_from_previous_response", "val": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/Delete

**说明**: 删除好友

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Friend.DefaultParamDoc; {`toWxid`:string}` | true 示例={"toWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/GetContractDetail

**说明**: 获取通讯录好友详情

body 支持 userName | toWxids | Towxids；多个微信用英文逗号分隔；chatRoom 可选

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Friend.GetContractDetailparameterDoc; {`userName`:string}` | 多个微信请用,隔开(最多20个),ChatRoom请留空；也支持 userName/toWxids/Towxids 示例={"userName": "wxid_recipient"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/GetContractList

**说明**: 获取通讯录好友

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Friend.GetContractListparameterDoc; {`currentChatRoomContactSeq`:integer, `currentWxcontactSeq`:integer}` | CurrentWxcontactSeq和CurrentChatRoomContactSeq没有的情况下请填写0 示例={"currentChatRoomContactSeq": 0, "currentWxcontactSeq": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/GetFriendstate

**说明**: 查询好友状态

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Friend.FriendRelationParamDoc; {`opCode`:integer, `toWxid`:string}` | OpCode == 1 示例={"opCode": 0, "toWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/GetMFriend

**说明**: 获取手机通讯录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/LbsFind

**说明**: 附近人

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Friend.LbsFindParamDoc; {`latitude`:number, `longitude`:number, `opCode`:integer}` | OpCode == 1 示例={"latitude": 0, "longitude": 0, "opCode": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/PassVerify

**说明**: 通过好友请求

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Friend.PassVerifyParamDoc; {`opcode`:integer, `scene`:integer, `v1`:string, `v2`:string}` | Scene：代表来源,请在消息中的xml中获取 示例={"opcode": 0, "scene": 0, "v1": "示例值", "v2": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/Search

**说明**: 搜索联系人

示例：{"Wxid":"可留空由authcode注入","Keyword":"wxid_xxx","FromScene":0,"SearchScene":1}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Friend.SearchParamDoc; {`fromScene`:integer, `keyword`:string, `searchScene`:integer}` | 爆粉情况下特殊通道请自行填写,默认时FromScene=0,SearchScene=1 示例={"fromScene": 0, "keyword": "your_keyword", "searchScene": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/SendRequest

**说明**: 添加联系人(发送好友请求)

示例：{"Wxid":"可留空由authcode注入","V1":"xxx","V2":"yyy","Content":"你好","Scene":17}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Friend.SendRequestParamDoc; {`v1`:string, `v2`:string}` | V1 V2是必填项 示例={"v1": "示例值", "v2": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/SetRemarks

**说明**: 设置好友备注

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Friend.SetRemarksParamDoc; {`remarks`:string, `toWxid`:string}` | true 示例={"remarks": "示例值", "toWxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Friend/Upload

**说明**: 上传通讯录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Friend.UploadParamDoc; {`currentPhoneNo`:string, `opcode`:integer, `phoneNo`:string}` | PhoneNo多个手机号请用,隔开   CurrentPhoneNo自己的手机号  Opcode == 1上传 2删除 示例={"currentPhoneNo": "示例值", "opcode": 0, "phoneNo": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Group

> 群组管理：群资料、成员与群设置。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Group/AddChatRoomMember` | 增加群成员(40人以内) |
| 2 | `POST` | `/Group/ConsentToJoin` | 同意进入群聊 |
| 3 | `POST` | `/Group/CreateChatRoom` | 创建群聊 |
| 4 | `POST` | `/Group/DelChatRoomMember` | 删除群成员 |
| 5 | `POST` | `/Group/FacingCreateChatRoom` | 创建群聊 |
| 6 | `POST` | `/Group/GetChatRoomInfo` | 获取群详情(不带公告内容) |
| 7 | `POST` | `/Group/GetChatRoomInfoDetail` | 获取群信息(带公告内容) |
| 8 | `POST` | `/Group/GetChatRoomMemberDetail` | 获取群成员详情 |
| 9 | `POST` | `/Group/GetQRCode` | 获取群二维码 |
| 10 | `GET` | `/Group/GroupList` | 获取群列表（兼容路由） |
| 11 | `POST` | `/Group/InviteChatRoomMember` | 邀请群成员(40人以上) |
| 12 | `GET` | `/Group/List` | 获取群列表（业务路由） |
| 13 | `POST` | `/Group/MoveContractList` | 保存到通讯录 |
| 14 | `POST` | `/Group/OperateChatRoomAdmin` | 群管理操作(添加、删除、转让) |
| 15 | `POST` | `/Group/Quit` | 退出群聊 |
| 16 | `POST` | `/Group/ScanIntoGroup` | 扫码进群 |
| 17 | `POST` | `/Group/ScanIntoGroupEnterprise` | 扫码进群(企业) |
| 18 | `POST` | `/Group/SendPat` | 群拍一拍功能 |
| 19 | `POST` | `/Group/SendTransferGroupOwner` | 转让群 |
| 20 | `POST` | `/Group/SetChatRoomAnnouncement` | 设置群公告 |
| 21 | `POST` | `/Group/SetChatRoomName` | 设置群名称 |
| 22 | `POST` | `/Group/SetChatRoomRemarks` | 设置群备注(仅自己可见) |
| 23 | `POST` | `/Group/SetChatroomAccessVerify` | 设置群聊邀请开关 |

### POST /Group/AddChatRoomMember

**说明**: 增加群成员(40人以内)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.AddChatRoomParamDoc; {`ChatRoomName`:string, `ToWxids`:string}` | ToWxids 多个微信ID用,隔开 ChatRoomName 群ID 示例={"ChatRoomName": "示例值", "ToWxids": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/ConsentToJoin

**说明**: 同意进入群聊

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.ConsentToJoinParamDoc; {`Url`:string}` | Url请在消息内容xml中查找 示例={"Url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/CreateChatRoom

**说明**: 创建群聊

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.CreateChatRoomParamDoc; {`ToWxids`:string}` | ToWxids 多个微信ID用,隔开 至少三个好友微信ID以上 示例={"ToWxids": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/DelChatRoomMember

**说明**: 删除群成员

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.AddChatRoomParamDoc; {`ChatRoomName`:string, `ToWxids`:string}` | ToWxids 多个微信ID用,隔开 ChatRoomName 群ID 示例={"ChatRoomName": "示例值", "ToWxids": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/FacingCreateChatRoom

**说明**: 创建群聊

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.FacingCreateChatRoomParamDoc; {`Latitude`:number, `Longitude`:number, `OpCode`:integer, `Password`:string}` | ToWxids 多个微信ID用,隔开 至少三个好友微信ID以上 示例={"Latitude": 0, "Longitude": 0, "OpCode": 0, "Password": "your_password"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/GetChatRoomInfo

**说明**: 获取群详情(不带公告内容)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.GetChatRoomParamDoc; {`QID`:string}` | UserNameList == 群ID,多个查询请用,隔开 示例={"QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/GetChatRoomInfoDetail

**说明**: 获取群信息(带公告内容)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.GetChatRoomParamDoc; {`QID`:string}` | QID == 群ID 示例={"QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/GetChatRoomMemberDetail

**说明**: 获取群成员详情

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.GetChatRoomParamDoc; {`QID`:string}` | QID == 群ID 示例={"QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/GetQRCode

**说明**: 获取群二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.GetChatRoomParamDoc; {`QID`:string}` | QID == 群ID 示例={"QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /Group/GroupList

**说明**: 获取群列表（兼容路由）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| query | `force` | — | `string` | 可选：1/true 表示强制全量刷新，不读缓存 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/InviteChatRoomMember

**说明**: 邀请群成员(40人以上)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.AddChatRoomParamDoc; {`ChatRoomName`:string, `ToWxids`:string}` | ToWxids 多个微信ID用,隔开 ChatRoomName 群ID 示例={"ChatRoomName": "示例值", "ToWxids": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /Group/List

**说明**: 获取群列表（业务路由）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| query | `force` | — | `string` | 可选：1/true 表示强制全量刷新 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/MoveContractList

**说明**: 保存到通讯录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.MoveContractListParamDoc; {`QID`:string, `Val`:integer}` | Val == 3添加 2移除 示例={"QID": "qid_from_previous_response", "Val": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/OperateChatRoomAdmin

**说明**: 群管理操作(添加、删除、转让)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.OperateChatRoomAdminParamDoc; {`QID`:string, `ToWxids`:string, `Val`:integer}` | ToWxids == 多个wxid用,隔开(仅限于添加/删除管理员) Val == 1添加 2删除 3转让 示例={"QID": "qid_from_previous_response", "ToWxids": "示例值", "Val": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/Quit

**说明**: 退出群聊

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.QuitGroupParamDoc; {`QID`:string}` | QID == 群ID 示例={"QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/ScanIntoGroup

**说明**: 扫码进群

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.ScanIntoGroupParamDoc; {`Url`:string}` | 只支持url 示例={"Url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/ScanIntoGroupEnterprise

**说明**: 扫码进群(企业)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.ScanIntoGroupParamDoc; {`Url`:string}` | 只支持url 示例={"Url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/SendPat

**说明**: 群拍一拍功能

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.SendPatParamDoc; {`QID`:string, `Scene`:integer, `ToUserName`:string}` | QID/ToUserName/Scene 示例={"QID": "qid_from_previous_response", "Scene": 0, "ToUserName": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/SendTransferGroupOwner

**说明**: 转让群

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.TransferGroupOwnerParamDoc; {`NewOwnerUserName`:string, `QID`:string}` | QID/NewOwnerUserName 示例={"NewOwnerUserName": "示例值", "QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/SetChatRoomAnnouncement

**说明**: 设置群公告

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.OperateChatRoomInfoParamDoc; {`Content`:string, `QID`:string}` | Content == 公告内容 示例={"Content": "示例值", "QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/SetChatRoomName

**说明**: 设置群名称

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.OperateChatRoomInfoParamDoc; {`Content`:string, `QID`:string}` | Content == 名称 示例={"Content": "示例值", "QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/SetChatRoomRemarks

**说明**: 设置群备注(仅自己可见)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.OperateChatRoomInfoParamDoc; {`Content`:string, `QID`:string}` | QID == 群ID 示例={"Content": "示例值", "QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Group/SetChatroomAccessVerify

**说明**: 设置群聊邀请开关

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Group.SetChatroomAccessVerifyParamDoc; {`Enable`:boolean, `QID`:string}` | QID/Enable 示例={"Enable": false, "QID": "qid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## User

> 用户资料：账号信息与个人资料管理。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/User/BindQQ` | 绑定QQ |
| 2 | `POST` | `/User/BindingEmail` | 绑定邮箱 |
| 3 | `POST` | `/User/BindingMobile` | 换绑手机号 |
| 4 | `GET` | `/User/CheckCanSetAlias` | 检测微信登录环境 |
| 5 | `POST` | `/User/DelSafetyInfo` | 删除登录设备 |
| 6 | `GET` | `/User/GetAllOnline` | 获取所有在线wxid（需管理员 key） |
| 7 | `POST` | `/User/GetContractProfile` | 取个人信息 |
| 8 | `GET` | `/User/GetOnlineInfo` | 获取在线信息 |
| 9 | `POST` | `/User/GetQRCode` | 取个人二维码 |
| 10 | `POST` | `/User/GetSafetyInfo` | 登录设备管理 |
| 11 | `POST` | `/User/PrivacySettings` | 隐私设置 |
| 12 | `POST` | `/User/ReportMotion` | ReportMotion |
| 13 | `POST` | `/User/SendVerifyMobile` | 发送手机验证码 |
| 14 | `POST` | `/User/SetAlisa` | 设置微信号 |
| 15 | `POST` | `/User/SetPasswd` | 修改密码 |
| 16 | `POST` | `/User/UpdateProfile` | 修改个人信息 |
| 17 | `POST` | `/User/UploadHeadImage` | 修改头像 |
| 18 | `POST` | `/User/VerifyPasswd` | 验证密码 |

### POST /User/BindQQ

**说明**: 绑定QQ

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `User.BindQQParam; {`Account`:integer, `Password`:string, `Wxid`:string}` | account:QQ账号, password:QQ密码 示例={"Account": 0, "Password": "your_password", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/BindingEmail

**说明**: 绑定邮箱

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `User.EmailParam; {`Email`:string, `Wxid`:string}` | true 示例={"Email": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/BindingMobile

**说明**: 换绑手机号

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `User.BindMobileParam; {`Mobile`:string, `Verifycode`:string, `Wxid`:string}` | Mobile == 格式：+8617399999999 Verifycode == 验证码请先通过(发送手机验证码)获取 示例={"Mobile": "示例值", "Verifycode": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /User/CheckCanSetAlias

**说明**: 检测微信登录环境

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/DelSafetyInfo

**说明**: 删除登录设备

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `User.DelSafetyInfoParam; {`Uuid`:string, `Wxid`:string}` | UUID请在登录设备管理中获取 示例={"Uuid": "uuid_from_qr_response", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /User/GetAllOnline

**说明**: 获取所有在线wxid（需管理员 key）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Admin-Token` | — | `string` | 管理员凭证；仅在开启管理员接口后使用 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/GetContractProfile

**说明**: 取个人信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /User/GetOnlineInfo

**说明**: 获取在线信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/GetQRCode

**说明**: 取个人二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `User.GetQRCodeParam; {`Style`:integer, `Wxid`:string}` | Style == 二维码样式(请自行探索) 8默认 示例={"Style": 0, "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/GetSafetyInfo

**说明**: 登录设备管理

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/PrivacySettings

**说明**: 隐私设置

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `User.PrivacySettingsParam; {`Function`:integer, `Value`:integer, `Wxid`:string}` | 核心参数请联系客服获取代码列表 示例={"Function": 0, "Value": 0, "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/ReportMotion

**说明**: ReportMotion

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `User.ReportMotionParam; {`DeviceId`:string, `DeviceType`:string, `StepCount`:integer, `Wxid`:string}` | 具体用法请联系客服 示例={"DeviceId": "device_id_from_login", "DeviceType": "示例值", "StepCount": 0, "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/SendVerifyMobile

**说明**: 发送手机验证码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `User.SendVerifyMobileParam; {`Mobile`:string, `Opcode`:integer, `Wxid`:string}` | Opcode == 场景(18代表绑手机号) Mobile == 格式：+8617399999999 示例={"Mobile": "示例值", "Opcode": 0, "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/SetAlisa

**说明**: 设置微信号

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `User.SetAlisaParam; {`Alisa`:string, `Wxid`:string}` | true 示例={"Alisa": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/SetPasswd

**说明**: 修改密码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `User.NewSetPasswdParam; {`NewPassword`:string, `Ticket`:string, `Wxid`:string}` | true 示例={"NewPassword": "示例值", "Ticket": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/UpdateProfile

**说明**: 修改个人信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `User.UpdateProfileParam; {`City`:string, `Country`:string, `NickName`:string, `Province`:string, `Sex`:integer, `Signature`:string, `Wxid`:string}` | NickName ==名称  Sex == 性别（1:男 2：女） Country == 国家,例如：CH Province == 省份 例如:WuHan Signature == 个性签名 示例={"City": "示例值", "Country": "示例值", "NickName": "示例值", "Province": "示例值", "Sex": 0, "Signature": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/UploadHeadImage

**说明**: 修改头像

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `User.UploadHeadImageParam; {`Base64`:string, `Wxid`:string}` | true 示例={"Base64": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /User/VerifyPasswd

**说明**: 验证密码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `User.NewVerifyPasswdParam; {`Password`:string, `Wxid`:string}` | true 示例={"Password": "your_password", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Label

> 标签管理：联系人标签与分组能力。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Label/Add` | 添加标签 |
| 2 | `POST` | `/Label/Delete` | 删除标签 |
| 3 | `POST` | `/Label/GetList` | 获取标签列表 |
| 4 | `POST` | `/Label/UpdateList` | 更新标签列表 |
| 5 | `POST` | `/Label/UpdateName` | 修改标签 |

### POST /Label/Add

**说明**: 添加标签

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Label.AddParamDoc; {`LabelName`:string}` | true 示例={"LabelName": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Label/Delete

**说明**: 删除标签

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Label.DeleteParamDoc; {`LabelID`:string}` | true 示例={"LabelID": "labelid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Label/GetList

**说明**: 获取标签列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Label/UpdateList

**说明**: 更新标签列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Label.UpdateListParamDoc; {`LabelID`:string, `ToWxids`:string}` | ToWxid:多个请用,隔开 示例={"LabelID": "labelid_from_previous_response", "ToWxids": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Label/UpdateName

**说明**: 修改标签

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Label.UpdateNameParamDoc; {`LabelID`:integer, `NewName`:string}` | true 示例={"LabelID": 0, "NewName": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Finder

> 视频号：视频号内容与账号能力。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Finder/Comment` | 评论 |
| 2 | `POST` | `/Finder/Decrypt` | 评论 |
| 3 | `POST` | `/Finder/FinderGetMsgSessionId` | 获取Finder私信会话ID |
| 4 | `POST` | `/Finder/FinderLiveDetail` | 直播详情 |
| 5 | `POST` | `/Finder/FinderSearchList` | 搜索列表 |
| 6 | `POST` | `/Finder/FinderSendText` | 发送私信文字 |
| 7 | `POST` | `/Finder/Findergettopiclist` | 主题列表 |
| 8 | `POST` | `/Finder/Follow` | 关注 |
| 9 | `POST` | `/Finder/GetCommentDetail` | 查看指定内容 |
| 10 | `POST` | `/Finder/GetCommentList` | 评论列表/详情（支持RootCommentId翻页） |
| 11 | `POST` | `/Finder/GetRecommend` | 推荐 |
| 12 | `POST` | `/Finder/Like` | 点赞 |
| 13 | `POST` | `/Finder/Search` | 用户搜索 |
| 14 | `POST` | `/Finder/TargetUserPage` | 查看指定人首页 |
| 15 | `POST` | `/Finder/UserPrepare` | 用户中心 |

### POST /Finder/Comment

**说明**: 评论

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.CommentParamDoc; {`CommentId`:integer, `Content`:string, `Id`:integer, `ObjectNonceId`:string, `OpType`:integer, `ReplyCommentId`:integer, `ReplyUsername`:string, `RootCommentId`:integer, `Scene`:integer, `SessionBuffer`:string, `Username`:string}` | 评论 示例={"CommentId": 0, "Content": "示例值", "Id": 0, "ObjectNonceId": "objectnonceid_from_previous_response", "OpType": 0, "ReplyCommentId": 0, "ReplyUsername": "示例值", "RootCommentId": 0, "Scene": 0, "SessionBuffer": "示例值", "Username": "wxid_recipient"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/Decrypt

**说明**: 评论

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.DecryptParamDoc; {`Content`:string}` | 评论 示例={"Content": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/FinderGetMsgSessionId

**说明**: 获取Finder私信会话ID

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.FinderGetMsgSessionIdParamDoc; {`FinderUsername`:string}` | 获取会话ID 示例={"FinderUsername": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/FinderLiveDetail

**说明**: 直播详情

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.FinderLiveDetailParamDoc; {`FinderNonceID`:string, `FinderObjectID`:integer}` | 直播详情 示例={"FinderNonceID": "findernonceid_from_previous_response", "FinderObjectID": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/FinderSearchList

**说明**: 搜索列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `models.EmptyObject` | 搜索列表（无参数，传 {}） |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/FinderSendText

**说明**: 发送私信文字

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.FinderSendTextParamDoc; {`FinderUsername`:string, `Text`:string}` | 直播详情 示例={"FinderUsername": "示例值", "Text": "你好"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/Findergettopiclist

**说明**: 主题列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.FinderGetTopicListParamDoc; {`LastBuffer`:string, `TopTitle`:string}` | 主题列表 示例={"LastBuffer": "示例值", "TopTitle": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/Follow

**说明**: 关注

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.DefaultParamDoc; {`FinderUsername`:string, `Value`:string}` | 关注 示例={"FinderUsername": "示例值", "Value": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/GetCommentDetail

**说明**: 查看指定内容

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.GetCommentDetailParamDoc; {`FinderUsername`:string, `Id`:integer, `LastBuffer`:string, `ObjectNonceId`:string, `RootCommentId`:integer}` | 查看指定内容 示例={"FinderUsername": "示例值", "Id": 0, "LastBuffer": "示例值", "ObjectNonceId": "objectnonceid_from_previous_response", "RootCommentId": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/GetCommentList

**说明**: 评论列表/详情（支持RootCommentId翻页）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.GetCommentDetailParamDoc; {`FinderUsername`:string, `Id`:integer, `LastBuffer`:string, `ObjectNonceId`:string, `RootCommentId`:integer}` | 评论列表/详情 示例={"FinderUsername": "示例值", "Id": 0, "LastBuffer": "示例值", "ObjectNonceId": "objectnonceid_from_previous_response", "RootCommentId": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/GetRecommend

**说明**: 推荐

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `models.EmptyObject` | 推荐首页（无参数，传 {}） |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/Like

**说明**: 点赞

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.LikeParamDoc; {`FinderUsername`:string, `Id`:integer, `ObjectNonceId`:string, `SessionBuffer`:string}` | 点赞 示例={"FinderUsername": "示例值", "Id": 0, "ObjectNonceId": "objectnonceid_from_previous_response", "SessionBuffer": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/Search

**说明**: 用户搜索

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.DefaultParamDoc; {`FinderUsername`:string, `Value`:string}` | 用户搜索 示例={"FinderUsername": "示例值", "Value": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/TargetUserPage

**说明**: 查看指定人首页

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Finder.TargetUserPageParamDoc; {`LastBuffer`:string, `Target`:string}` | 查看指定人首页 示例={"LastBuffer": "示例值", "Target": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Finder/UserPrepare

**说明**: 用户中心

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## FriendCircle

> 朋友圈：内容发布、互动与查询。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/FriendCircle/Comment` | 朋友圈点赞/评论 |
| 2 | `POST` | `/FriendCircle/GetCommnet` | 获取评论内容 |
| 3 | `POST` | `/FriendCircle/GetDetail` | 获取特定人朋友圈 |
| 4 | `POST` | `/FriendCircle/GetIdDetail` | 获取特定ID详情内容 |
| 5 | `POST` | `/FriendCircle/GetList` | 朋友圈首页列表 |
| 6 | `POST` | `/FriendCircle/DownloadVideo` | 朋友圈下载 CDN 视频 |
| 7 | `POST` | `/FriendCircle/MessagesRaw` | 发布朋友圈（原始 XML 兼容接口） |
| 8 | `POST` | `/FriendCircle/SetBackgroundImage` | 设置朋友圈背景图 |
| 9 | `POST` | `/FriendCircle/UploadImage` | 朋友圈上传 CDN 图片 |
| 10 | `POST` | `/FriendCircle/UploadImages` | 朋友圈批量上传 CDN 图片 |
| 11 | `POST` | `/FriendCircle/UploadVideo` | 朋友圈上传 CDN 视频 |
| 12 | `POST` | `/FriendCircle/Messages` | 发布纯文字、图文、视频或链接朋友圈 |
| 13 | `POST` | `/FriendCircle/MmSnsSync` | 朋友圈增量同步 |
| 14 | `POST` | `/FriendCircle/Operation` | 朋友圈操作 |
| 15 | `POST` | `/FriendCircle/PrivacySettings` | 朋友圈权限设置 |
| 16 | `POST` | `/FriendCircle/PushCommnet` | 启动评论检查任务并转发评论 |
| 17 | `POST` | `/FriendCircle/Upload` | 朋友圈下载CDN视频 |

### POST /FriendCircle/Comment

**说明**: 朋友圈点赞/评论

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.CommentParamDoc; {`content`:string, `id`:string, `replyCommnetId`:integer, `type`:integer}` | type：1点赞 2：文本 3:消息 4：with 5陌生人点赞 replyCommnetId：回复评论Id 示例={"content": "示例值", "id": "id_from_previous_response", "replyCommnetId": 0, "type": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/GetCommnet

**说明**: 获取评论内容

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.GetCommnetParamDoc; {`xmlData`:string}` | 包含id和username的XML数据 示例={"xmlData": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/GetDetail

**说明**: 获取特定人朋友圈

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.GetDetailparameterDoc; {`fristpagemd5`:string, `maxid`:integer, `towxid`:string}` | 打开首页时：Fristpagemd5留空,Maxid填写0 示例={"fristpagemd5": "示例值", "maxid": 0, "towxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/GetIdDetail

**说明**: 获取特定ID详情内容

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.GetIdDetailParamDoc; {`id`:integer, `towxid`:string}` | Id为当前朋友圈内容的id 示例={"id": 0, "towxid": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/GetList

**说明**: 朋友圈首页列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.GetListParamDoc; {`fristpagemd5`:string, `maxid`:integer}` | 打开首页时：Fristpagemd5留空,Maxid填写0 示例={"fristpagemd5": "示例值", "maxid": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/DownloadVideo

**说明**: 朋友圈下载 CDN 视频

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token |
| body | `body` | ✅ | `FriendCircle.DownloadMediaModelDoc; {`key`:string, `url`:string}` | 视频下载参数 示例={"key": "AES_KEY", "url": "https://cdn.example.com/video"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |

---

### POST /FriendCircle/MessagesRaw

**说明**: 发布朋友圈（原始 XML 兼容接口）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token |
| body | `body` | ✅ | `FriendCircle.MessagearameterDoc; {`blackList`:string, `content`:string, `withUserList`:string}` | 完整 TimelineObject XML 示例={"content": "<TimelineObject>...</TimelineObject>", "private": 0, "blackList": "", "withUserList": "", "groupUserList": ""} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |

---

### POST /FriendCircle/SetBackgroundImage

**说明**: 设置朋友圈背景图

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token |
| body | `body` | ✅ | `FriendCircle.SetBackgroundImageParamDoc; {`url`:string, `thumbUrl`:string}` | 传入已上传的背景图 URL；thumbUrl 留空时使用 url 示例={"url": "https://cdn.example.com/background/0", "thumbUrl": "https://cdn.example.com/background/150"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |

---

### POST /FriendCircle/UploadImage

**说明**: 朋友圈上传 CDN 图片

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token |
| body | `body` | ✅ | `FriendCircle.CdnSnsImageUploadParamDoc; {`imageData`:string}` | 传入图片 Base64；Data.publishItem 可直接加入 /Messages 的 images 示例={"imageData": "data:image/jpeg;base64,IMAGE_BASE64"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |

---

### POST /FriendCircle/UploadImages

**说明**: 朋友圈批量上传 CDN 图片

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token |
| body | `body` | ✅ | `FriendCircle.CdnSnsImagesUploadParamDoc; {`imageDataList`:array<string>}` | 一次上传 1 至 9 张；Data[*].publishItem 可直接用于 /Messages 的 images 示例={"imageDataList": ["data:image/jpeg;base64,IMAGE_1_BASE64", "data:image/png;base64,IMAGE_2_BASE64"]} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |

---

### POST /FriendCircle/UploadVideo

**说明**: 朋友圈上传 CDN 视频

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token |
| body | `body` | ✅ | `FriendCircle.SnsUploadVideoParamDoc; {`thumbData`:string, `videoData`:string}` | 传入视频和封面 Base64；Data.publishItem 可直接用于 /Messages 的 video 示例={"videoData": "data:video/mp4;base64,VIDEO_BASE64", "thumbData": "data:image/jpeg;base64,THUMB_BASE64"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |

---

### POST /FriendCircle/Messages

**说明**: 发布纯文字、图文、视频或链接朋友圈

纯文字传 title；图文传 images；视频传 video；链接传 link。成功响应 Data.SnsObject.Id 是朋友圈 ID，请按字符串保存，可传给 /FriendCircle/Operation（type=1）删除。完整示例见 docs/朋友圈发布接口使用说明.md。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.SnsPostRequestDoc; {`blackList`:string, `groupUserList`:string, `images`:array<object{url:string, thumbUrl:string, md5:string, totalSize:integer, width:integer, height:integer}>, `link`:object{contentUrl:string, title:string, description:string, url:string, thumbUrl:string, md5:string, totalSize:integer, width:integer, height:integer}, `location`:object{city:string, longitude:string, latitude:string, poiName:string, poiAddress:string}, `private`:integer, `title`:string, `video`:object{videomd5:string, thumbmd5:string, videourl:string, thumburl:string, totalSize:string}, `withUserList`:string}` | 纯文字传 title；图文传 UploadImage 返回的 publishItem；视频传 UploadVideo 返回的 publishItem；location 可选 示例={"blackList": "示例值", "private": 0, "thumbmd5": "示例值", "thumburl": "https://example.com", "title": "示例值", "totalSize": "示例值", "videomd5": "示例值", "videourl": "https://example.com", "withUserList": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/MmSnsSync

**说明**: 朋友圈增量同步

手动读取 SNS 增量。synckey 留空时使用服务端持久化 KeyBuf；continueFlag 是位标记，续传还需判断 syncKey 是否前进及 items 是否重复。实时场景订阅 WS/Webhook 的 friend_circle_update，素材地址位于 items[].moment.media[].url 和 thumb_url。

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/Operation

**说明**: 朋友圈操作

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.OperationParamDoc; {`commnetId`:integer, `id`:string, `type`:integer}` | id 按字符串传输；type：1删除朋友圈，2设为隐私，3设为公开，4删除评论，5取消点赞 示例={"commnetId": 0, "id": "id_from_previous_response", "type": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/PrivacySettings

**说明**: 朋友圈权限设置

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.PrivacySettingsParamDoc; {`function`:integer, `value`:integer}` | 核心参数请联系客服获取代码列表 示例={"function": 0, "value": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/PushCommnet

**说明**: 启动评论检查任务并转发评论

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.RequestParamsDoc; {`forwardAddr`:string, `id`:string}` | 评论转发的地址与sns id 示例={"forwardAddr": "示例值", "id": "id_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /FriendCircle/Upload

**说明**: 朋友圈下载CDN视频

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `FriendCircle.DownloadMediaModelDoc; {`key`:string, `url`:string}` | 下载参数 示例={"key": "your_key", "url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Favor

> 收藏：收藏内容的读取与管理。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Favor/Del` | 删除收藏 |
| 2 | `POST` | `/Favor/GetFavInfo` | 获取搜藏信息 |
| 3 | `POST` | `/Favor/GetFavItem` | 读取收藏内容 |
| 4 | `POST` | `/Favor/Sync` | 同步收藏 |

### POST /Favor/Del

**说明**: 删除收藏

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Favor.DelParamDoc; {`FavId`:integer}` | FavId在同步收藏中获取 示例={"FavId": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Favor/GetFavInfo

**说明**: 获取搜藏信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Favor/GetFavItem

**说明**: 读取收藏内容

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Favor.GetFavItemParamDoc; {`FavId`:integer}` | FavId在同步收藏中获取 示例={"FavId": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Favor/Sync

**说明**: 同步收藏

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Favor.SyncParamDoc; {`Keybuf`:string}` | keybuf:第二次请求需要带上第一次返回的 示例={"Keybuf": "your_keybuf"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Search

> 搜索：文章、公众号、小程序与综合内容搜索。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Search/AI` | AI 搜索 |
| 2 | `POST` | `/Search/All` | 全部综合搜索 |
| 3 | `POST` | `/Search/Articles` | 公众号文章搜索 |
| 4 | `POST` | `/Search/Baike` | 百科搜索 |
| 5 | `POST` | `/Search/Books` | 读书搜索 |
| 6 | `GET` | `/Search/Capabilities` | 查看通用搜索支持的分类 |
| 7 | `POST` | `/Search/Channels` | 视频号内容搜索 |
| 8 | `POST` | `/Search/Emoji` | 表情搜索 |
| 9 | `POST` | `/Search/Gateway` | 兼容旧版搜一搜网页网关 |
| 10 | `POST` | `/Search/Images` | 图片搜索 |
| 11 | `POST` | `/Search/Listen` | 听一听搜索 |
| 12 | `POST` | `/Search/Live` | 直播搜索 |
| 13 | `POST` | `/Search/MiniGames` | 小游戏搜索 |
| 14 | `POST` | `/Search/MiniPrograms` | 小程序搜索 |
| 15 | `POST` | `/Search/Moments` | 朋友圈搜索 |
| 16 | `POST` | `/Search/News` | 新闻搜索 |
| 17 | `POST` | `/Search/OfficialAccounts` | 公众号与账号搜索 |
| 18 | `POST` | `/Search/Query` | 通用分类搜索 |
| 19 | `POST` | `/Search/Service/{name}` | 高级搜索能力调用入口 |
| 20 | `GET` | `/Search/Services` | 查看高级搜索能力目录 |
| 21 | `POST` | `/Search/Stickers` | 贴图搜索 |
| 22 | `POST` | `/Search/Underlines` | 划线搜索 |
| 23 | `POST` | `/Search/WeChatIndex` | 微信指数搜索 |

### POST /Search/AI

**说明**: AI 搜索

使用当前登录设备的 AI 搜索独立页面协议（scene 4818），返回账号区域可用性及会话标识

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.AIFirstPageRequest; {`include_raw`:boolean, `model`:string, `query*`:string, `turn`:integer}` | 可直接执行的首轮示例；续问追加上一次响应的 session_id，并递增 turn 示例={"query": "深圳有哪些值得关注的科技公司", "model": "hy3-preview-proxy", "turn": 0, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/All

**说明**: 全部综合搜索

固定使用 all 分类，返回混合类型结果并支持 search_id、cursor 和 next_offset 分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "人工智能", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Articles

**说明**: 公众号文章搜索

固定使用 article 分类，支持 search_id/cursor 分页

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "Go 语言", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Baike

**说明**: 百科搜索

固定使用 baike 分类搜索百科内容，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "大模型", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Books

**说明**: 读书搜索

固定使用 read 分类搜索微信读书相关内容，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "架构设计", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /Search/Capabilities

**说明**: 查看通用搜索支持的分类

返回 Query 接口可填写的 category、对应 business_type 以及当前已建模能力；用于客户端动态生成分类列表，普通固定分类搜索流程可跳过该接口。

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Channels

**说明**: 视频号内容搜索

搜索视频号内容，返回视频地址、封面、时长、互动指标及 operation_params 运行参数，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "科技", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Emoji

**说明**: 表情搜索

固定使用 emoji 分类搜索表情内容，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "开心", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Gateway

**说明**: 兼容旧版搜一搜网页网关

保留给已有 Gateway 调用方：通过项目协议登录态取得网页搜索授权并访问搜索页面。新业务查询优先使用 Articles、OfficialAccounts、Channels、MiniPrograms、Moments、AI 等独立接口；该入口返回网页网关结果，不等同于分类协议搜索。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.Request; {`a8_scene`:integer, `category`:string, `code_type`:integer, `code_version`:integer, `cursor`:string, `include_raw`:boolean, `limit`:integer, `offset`:integer, `opcode`:integer, `path`:string, `protocol_scene`:integer, `query`:string, `scene`:integer, `search_id`:string, `type`:integer}` | 搜索参数 示例={"query": "深圳科技", "path": "page/search/mobile_jump", "scene": 4812, "type": 53, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Images

**说明**: 图片搜索

固定使用 image 分类搜索图片内容，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "深圳夜景", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Listen

**说明**: 听一听搜索

固定使用 listen 分类搜索音频内容，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "科技播客", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Live

**说明**: 直播搜索

固定使用 live 分类搜索直播内容，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "科技直播", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/MiniGames

**说明**: 小游戏搜索

固定使用 mini_game 分类搜索小游戏，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "休闲游戏", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/MiniPrograms

**说明**: 小程序搜索

固定使用 mini_program 分类，返回 appid、username、名称、简介和图标，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "乘车码", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Moments

**说明**: 朋友圈搜索

搜索当前协议账号可检索的朋友圈内容，返回正文、位置、时间、图片或视频 media 列表，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "周末徒步", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/News

**说明**: 新闻搜索

固定使用 news 分类搜索新闻内容，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "科技新闻", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/OfficialAccounts

**说明**: 公众号与账号搜索

搜索公众号、相关小程序及视频号账号；结果通过 result_type 区分，并返回 account_id、account_name、wechat_id、认证信息和菜单。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "腾讯科技", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Query

**说明**: 通用分类搜索

给需要动态指定 category 的调用方使用，一套接口支持 all、article、official_account、channels、mini_program、moments 等分类。已有明确业务类型时优先调用对应独立接口。首页 offset=0；续页原样传回上一页的 search_id、cursor，并使用 next_offset。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.Request; {`a8_scene`:integer, `category`:string, `code_type`:integer, `code_version`:integer, `cursor`:string, `include_raw`:boolean, `limit`:integer, `offset`:integer, `opcode`:integer, `path`:string, `protocol_scene`:integer, `query`:string, `scene`:integer, `search_id`:string, `type`:integer}` | 首页：query/category/offset/limit；翻页：再传 search_id/cursor 示例={"query": "人工智能", "category": "all", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Service/{name}

**说明**: 高级搜索能力调用入口

根据 Services 返回的 name 调用对应搜索业务能力，主要用于协议调试和扩展能力接入。常规分类搜索使用 Query 或对应独立业务接口；该入口请求体由具体能力决定。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| path | `name` | ✅ | `string` | 服务名称 |
| body | `body` | ✅ | `Search.CGICallRequest; {`include_raw`:boolean, `method`:string, `payload`:object, `payload_base64`:string, `payload_hex`:string}` | 协议服务参数 示例={"payload": {"query": "深圳科技"}, "include_raw": false, "method": "POST"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /Search/Services

**说明**: 查看高级搜索能力目录

返回 Service/{name} 高级调用入口支持的业务能力名称、请求方式和输入类型。面向协议调试及尚未封装成独立路由的能力，日常文章、公众号、视频号、小程序和朋友圈搜索使用独立接口。

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Stickers

**说明**: 贴图搜索

固定使用 sticker 分类搜索贴图内容，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "谢谢", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/Underlines

**说明**: 划线搜索

固定使用 underline 分类搜索划线内容，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "架构", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Search/WeChatIndex

**说明**: 微信指数搜索

固定使用 wechat_index 分类查询微信指数相关结果，支持协议分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Search.VerticalFirstPageRequest; {`include_raw`:boolean, `limit`:integer, `offset`:integer, `query*`:string}` | 可直接执行的首页示例；续页追加上一页返回的 search_id、cursor，并把 offset 改为 next_offset 示例={"query": "人工智能", "offset": 0, "limit": 10, "include_raw": false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## OfficialAccounts

> 公众号：公众号资料与内容能力。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/OfficialAccounts/AuthMpLogin` | 授权公众号登录 |
| 2 | `POST` | `/OfficialAccounts/Follow` | 关注 |
| 3 | `POST` | `/OfficialAccounts/GetAppMsgExt` | 阅读文章,返回 分享、看一看、阅读数据 |
| 4 | `POST` | `/OfficialAccounts/GetAppMsgExtLike` | 点赞文章,返回 分享、看一看、阅读数据 |
| 5 | `POST` | `/OfficialAccounts/GetMpHistory` | 获取公众号历史消息 |
| 6 | `POST` | `/OfficialAccounts/GetMpHistoryMessage` | 获取公众号历史消息HTML |
| 7 | `POST` | `/OfficialAccounts/JSAPIPreVerify` | JSAPIPreVerify |
| 8 | `POST` | `/OfficialAccounts/MpGetA8Key` | MpGetA8Key(获取文章key和uin) |
| 9 | `POST` | `/OfficialAccounts/OauthAuthorize` | OauthAuthorize |
| 10 | `POST` | `/OfficialAccounts/QRConnectAuthorize` | 二维码授权请求 |
| 11 | `POST` | `/OfficialAccounts/QRConnectAuthorizeConfirm` | 二维码授权确认 |
| 12 | `POST` | `/OfficialAccounts/Quit` | 取消关注 |

### POST /OfficialAccounts/AuthMpLogin

**说明**: 授权公众号登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `OfficialAccounts.AuthMpLoginParam; {`scene`:integer, `url`:string, `wxid`:string}` | url/scene 必填 示例={"scene": 0, "url": "https://example.com", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/Follow

**说明**: 关注

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `OfficialAccounts.DefaultParam; {`appid`:string, `wxid`:string}` | true 示例={"appid": "wx1234567890abcdef", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/GetAppMsgExt

**说明**: 阅读文章,返回 分享、看一看、阅读数据

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `OfficialAccounts.ReadParam; {`url`:string, `wxid`:string}` | true 示例={"url": "https://example.com", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/GetAppMsgExtLike

**说明**: 点赞文章,返回 分享、看一看、阅读数据

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `OfficialAccounts.ReadParam; {`url`:string, `wxid`:string}` | true 示例={"url": "https://example.com", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/GetMpHistory

**说明**: 获取公众号历史消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `OfficialAccounts.GetMpHistoryMsgParam; {`url`:string, `wxid`:string}` | url 必填 示例={"url": "https://example.com", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/GetMpHistoryMessage

**说明**: 获取公众号历史消息HTML

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `OfficialAccounts.GetMpHistoryMsgParam; {`url`:string, `wxid`:string}` | url必填 示例={"url": "https://example.com", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/JSAPIPreVerify

**说明**: JSAPIPreVerify

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| query | `url` | ✅ | `string` | 需要 JSAPI 权限校验的完整页面 URL |
| query | `appid` | ✅ | `string` | 公众号 AppID |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/MpGetA8Key

**说明**: MpGetA8Key(获取文章key和uin)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `OfficialAccounts.ReadParam; {`url`:string, `wxid`:string}` | true 示例={"url": "https://example.com", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/OauthAuthorize

**说明**: OauthAuthorize

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `OfficialAccounts.GetkeyParam; {`appid`:string, `url`:string, `wxid`:string}` | true 示例={"appid": "wx1234567890abcdef", "url": "https://example.com/article", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/QRConnectAuthorize

**说明**: 二维码授权请求

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `OfficialAccounts.QRConnectParam; {`url`:string, `wxid`:string}` | url 必填 示例={"url": "https://example.com", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/QRConnectAuthorizeConfirm

**说明**: 二维码授权确认

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `OfficialAccounts.QRConnectParam; {`url`:string, `wxid`:string}` | url 必填 示例={"url": "https://example.com", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /OfficialAccounts/Quit

**说明**: 取消关注

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `OfficialAccounts.DefaultParam; {`appid`:string, `wxid`:string}` | true 示例={"appid": "wx1234567890abcdef", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Wxapp

> 小程序：小程序授权、信息与业务调用。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Wxapp/AddAvatar` | AddAvatar |
| 2 | `POST` | `/Wxapp/AddMobile` | 小程序绑定增加手机号 |
| 3 | `POST` | `/Wxapp/CloudCallFunction` | 小程序云函数 |
| 4 | `POST` | `/Wxapp/DelMobile` | 小程序删除手机号 |
| 5 | `POST` | `/Wxapp/DellAvatar` | DellAvatar |
| 6 | `POST` | `/Wxapp/GETCreditScoreParam` | 查询游戏信用积分 |
| 7 | `POST` | `/Wxapp/GetAllMobile` | GetAllMobile |
| 8 | `POST` | `/Wxapp/GetRandomAvatar` | GetRandomAvatar |
| 9 | `POST` | `/Wxapp/GetUnionPay` | 微信云闪付支付 |
| 10 | `POST` | `/Wxapp/GetUserOpenId` | GetUserOpenId |
| 11 | `POST` | `/Wxapp/GetWxAppRecord` | 获取小程序记录 |
| 12 | `POST` | `/Wxapp/JSGetSessionid` | 小程序获取小程序支付sessionid |
| 13 | `POST` | `/Wxapp/JSLogin` | 授权小程序(定制) |
| 14 | `POST` | `/Wxapp/JSOperateWxData` | 小程序操作 |
| 15 | `POST` | `/Wxapp/UploadAvatarImg` | UploadAvatarImg |
| 16 | `POST` | `/Wxapp/Verifyplugin` | 小程序获取HostSign |
| 17 | `POST` | `/Wxapp/Wxapp/AddWxAppRecord` | 新增小程序记录 |
| 18 | `POST` | `/Wxapp/Wxapp/GetpullPay` | 推送小程序支付 |
| 19 | `POST` | `/Wxapp/Wxapp/JSGetSessionidQRcode` | 获取付小程序款二维码 |
| 20 | `POST` | `/Wxapp/Wxapp/QrcodeAuthLogin` | 扫码授权登录app或网页 |

### POST /Wxapp/AddAvatar

**说明**: AddAvatar

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.AddAvatarParamDoc; {`aFilekey`:string, `appid`:string, `nickName`:string}` | true 示例={"aFilekey": "your_afilekey", "appid": "wx1234567890abcdef", "nickName": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/AddMobile

**说明**: 小程序绑定增加手机号

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.CheckVerifyCodeDataDoc; {`appid`:string, `mobile`:string, `verifyCode`:string}` | true 示例={"appid": "wx1234567890abcdef", "mobile": "示例值", "verifyCode": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/CloudCallFunction

**说明**: 小程序云函数

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.CloudCallParamDoc; {`appid`:string, `data`:string}` | true 示例={"appid": "wx1234567890abcdef", "data": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/DelMobile

**说明**: 小程序删除手机号

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.DelMobileDataDoc; {`appid`:string, `mobile`:string, `opcode`:integer}` | true 示例={"appid": "wx1234567890abcdef", "mobile": "示例值", "opcode": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/DellAvatar

**说明**: DellAvatar

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.DellAvatarParamDoc; {`avatarId`:integer}` | true 示例={"avatarId": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/GETCreditScoreParam

**说明**: 查询游戏信用积分

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.GETCreditScoreParam; {`Wxid`:string}` | true 示例={"Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/GetAllMobile

**说明**: GetAllMobile

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.JSOperateWxParamDoc; {`appid`:string, `data`:string, `opt`:integer}` | true 示例={"appid": "wx1234567890abcdef", "data": "示例值", "opt": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/GetRandomAvatar

**说明**: GetRandomAvatar

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.DefaultParamDoc; {`appid`:string}` | true 示例={"appid": "wx1234567890abcdef"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/GetUnionPay

**说明**: 微信云闪付支付

示例：{"appid":"wx123...","sessionid":"xxx","timeStamp":"1700000000","nonceStr":"abc","package":"prepay_id=...","paySign":"xxx"}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `data` | ✅ | `Wxapp.UnionpayDataDoc; {`appid`:string, `nonceStr`:string, `package`:string, `paySign`:string, `sessionid`:string, `timeStamp`:string}` | 支付请求数据 示例={"appid": "wx1234567890abcdef", "nonceStr": "示例值", "package": "示例值", "paySign": "示例值", "sessionid": "sessionid_from_previous_response", "timeStamp": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/GetUserOpenId

**说明**: GetUserOpenId

示例：{"toWxId":"wxid_xxx","appid":"wx1234567890abcdef"}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.GetUserOpenIdParamDoc; {`appid`:string, `toWxId`:string}` | true 示例={"appid": "wx1234567890abcdef", "toWxId": "towxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/GetWxAppRecord

**说明**: 获取小程序记录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Wxapp.GetWxAppRecordParamDoc` | 获取小程序记录 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/JSGetSessionid

**说明**: 小程序获取小程序支付sessionid

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.DefaultParam; {`Appid`:string, `Wxid`:string}` | true 示例={"Appid": "wx1234567890abcdef", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/JSLogin

**说明**: 授权小程序(定制)

示例：{"appid":"wx1234567890abcdef"}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.DefaultParamDoc; {`appid`:string}` | true 示例={"appid": "wx1234567890abcdef"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/JSOperateWxData

**说明**: 小程序操作

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.JSOperateWxParamDoc; {`appid`:string, `data`:string, `opt`:integer}` | true 示例={"appid": "wx1234567890abcdef", "data": "示例值", "opt": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/UploadAvatarImg

**说明**: UploadAvatarImg

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.AddAvatarImgParamDoc; {`appid`:string, `jpgLink`:string}` | true 示例={"appid": "wx1234567890abcdef", "jpgLink": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/Verifyplugin

**说明**: 小程序获取HostSign

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.JSOperateWxParamDoc; {`appid`:string, `data`:string, `opt`:integer}` | true 示例={"appid": "wx1234567890abcdef", "data": "示例值", "opt": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/Wxapp/AddWxAppRecord

**说明**: 新增小程序记录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Wxapp.AddWxAppRecordParamDoc; {`username`:string}` |  示例={"username": "wxid_recipient"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/Wxapp/GetpullPay

**说明**: 推送小程序支付

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.GetpullPayParamDoc; {`appid`:string, `nonceStr`:string, `package`:string, `paySign`:string, `sessionid`:string, `timeStamp`:string}` | true 示例={"appid": "wx1234567890abcdef", "nonceStr": "示例值", "package": "示例值", "paySign": "示例值", "sessionid": "sessionid_from_previous_response", "timeStamp": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/Wxapp/JSGetSessionidQRcode

**说明**: 获取付小程序款二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Wxapp.SessionidQRParamDoc; {`appid`:string, `nonceStr`:string, `package`:string, `paySign`:string, `sessionid`:string, `timeStamp`:string}` | true 示例={"appid": "wx1234567890abcdef", "nonceStr": "示例值", "package": "示例值", "paySign": "示例值", "sessionid": "sessionid_from_previous_response", "timeStamp": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Wxapp/Wxapp/QrcodeAuthLogin

**说明**: 扫码授权登录app或网页

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Wxapp.QrcodeAuthLoginParamDoc; {`uuid`:string}` |  示例={"uuid": "uuid_from_qr_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## QWContact

> 企业微信：企业联系人相关能力。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/QWContact/QWApplyAddContact` | QWApplyAddContact |
| 2 | `POST` | `/QWContact/QWContact/QWAddContact` | QWAddContact |
| 3 | `POST` | `/QWContact/SearchQWContact` | SearchQWContact |

### POST /QWContact/QWApplyAddContact

**说明**: QWApplyAddContact

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | — | `QWContact.QWApplyAddContactParam; {`Context`:string, `Username`:string, `V1`:string, `Wxid`:string}` | true 示例={"Context": "示例值", "Username": "wxid_recipient", "V1": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /QWContact/QWContact/QWAddContact

**说明**: QWAddContact

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | — | `QWContact.QWAddContactParam; {`Username`:string, `V1`:string, `Wxid`:string}` | true 示例={"Username": "wxid_recipient", "V1": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /QWContact/SearchQWContact

**说明**: SearchQWContact

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | — | `QWContact.AddWxAppRecordParam; {`Username`:string, `Wxid`:string}` | true 示例={"Username": "wxid_recipient", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## SayHello

> 打招呼：陌生人招呼与验证消息。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/SayHello/Modelv1` | 模式1-扫码 |
| 2 | `POST` | `/SayHello/Modelv2` | 模式3-v3\v4打招呼 |

### POST /SayHello/Modelv1

**说明**: 模式1-扫码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | ✅ | `SayHello.Model1Param; {`Url`:string, `VerifyContent`:string}` | 注意,请先执行1再执行2 示例={"Url": "https://example.com", "VerifyContent": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /SayHello/Modelv2

**说明**: 模式3-v3\v4打招呼

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | ✅ | `SayHello.SendRequestParam1; {`Scene`:integer, `V3`:string, `V4`:string, `VerifyContent`:string, `Wxid`:string}` | Scene 招呼通道 v3v4通道，v4可空 示例={"Scene": 0, "V3": "示例值", "V4": "示例值", "VerifyContent": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## TenPay

> 支付：支付相关业务接口。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/TenPay/Collectmoney` | 确认收款 |
| 2 | `POST` | `/TenPay/ConfirmPreTransferApi` | 确认支付 |
| 3 | `POST` | `/TenPay/GeMaSkdPayQCode` | 自定义经营个人收款单 |
| 4 | `POST` | `/TenPay/GeneratePayQCode` | 生成自定义收款二维码 |
| 5 | `POST` | `/TenPay/GetEncryptInfo` | 获取加密信息 |
| 6 | `POST` | `/TenPay/GetRedPacketListApi` | 查看红包领取列表入口 |
| 7 | `POST` | `/TenPay/OpenHongBao` | 抢红包(带参数) |
| 8 | `POST` | `/TenPay/Openwxhb` | 拆开红包 |
| 9 | `POST` | `/TenPay/Qrydetailwxhb` | 查看红包 |
| 10 | `POST` | `/TenPay/Receivewxhb` | 打开红包不用key |
| 11 | `POST` | `/TenPay/SjSkdPayQCode` | 自定义商家收款单 |
| 12 | `POST` | `/TenPay/WXCreateRedPacketApi` | 创建红包 |

### POST /TenPay/Collectmoney

**说明**: 确认收款

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `TenPay.CollectmoneyModel; {`invalidTime`:string, `toUserName`:string, `transFerId`:string, `transactionId`:string, `wxid`:string}` | 转账与交易标识 示例={"invalidTime": "0", "toUserName": "wxid_payer", "transFerId": "transfer_id_from_message", "transactionId": "transaction_id_from_message", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/ConfirmPreTransferApi

**说明**: 确认支付

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `TenPay.ConfirmPreTransfer; {`bankSerial`:string, `bankType`:string, `payPassword`:string, `reqKey`:string, `wxid`:string}` | 预支付返回参数与支付密码 示例={"bankSerial": "bank_serial_from_pre_transfer", "bankType": "CFT", "payPassword": "your_pay_password", "reqKey": "req_key_from_pre_transfer", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/GeMaSkdPayQCode

**说明**: 自定义经营个人收款单

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `TenPay.GeMaSkdPayQCodeParam; {`Money`:string, `Name`:string, `Remark`:string, `Wxid`:string}` | 注意参数 示例={"Money": "示例值", "Name": "示例值", "Remark": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/GeneratePayQCode

**说明**: 生成自定义收款二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `TenPay.GeneratePayQCodeModel; {`money`:string, `name`:string, `wxid`:string}` | 收款名称与金额 示例={"money": "1.00", "name": "商品款", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/GetEncryptInfo

**说明**: 获取加密信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/GetRedPacketListApi

**说明**: 查看红包领取列表入口

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `TenPay.HongBaoDetail; {`offset`:integer, `size`:integer, `wxid`:string, `xml`:string}` | 红包消息 XML、分页 offset 和 size 示例={"offset": 0, "size": 20, "wxid": "wxid_bound_by_access_token", "xml": "<msg></msg>"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/OpenHongBao

**说明**: 抢红包(带参数)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `TenPay.HongBaoTailParam; {`SendId`:string, `SendUserName`:string, `TimingIdentifier`:string, `Wxid`:string, `Xml`:string}` | 注意参数 示例={"SendId": "sendid_from_previous_response", "SendUserName": "示例值", "TimingIdentifier": "示例值", "Wxid": "wxid_bound_by_access_token", "Xml": "<msg></msg>"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/Openwxhb

**说明**: 拆开红包

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `TenPay.OpenwxhbParam; {`Encrypt_key`:string, `Encrypt_userinfo`:string, `SendUserName`:string, `TimingIdentifier`:string, `Wxid`:string, `Xml`:string}` | true 示例={"Encrypt_key": "your_encrypt_key", "Encrypt_userinfo": "示例值", "SendUserName": "示例值", "TimingIdentifier": "示例值", "Wxid": "wxid_bound_by_access_token", "Xml": "<msg></msg>"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/Qrydetailwxhb

**说明**: 查看红包

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `TenPay.QrydetailwxhbParam; {`Encrypt_key`:string, `Encrypt_userinfo`:string, `Wxid`:string, `Xml`:string}` | true 示例={"Encrypt_key": "your_encrypt_key", "Encrypt_userinfo": "示例值", "Wxid": "wxid_bound_by_access_token", "Xml": "<msg></msg>"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/Receivewxhb

**说明**: 打开红包不用key

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `TenPay.ReceivewxhbParam; {`Encrypt_key`:string, `Encrypt_userinfo`:string, `InWay`:string, `Wxid`:string, `Xml`:string}` | true 示例={"Encrypt_key": "your_encrypt_key", "Encrypt_userinfo": "示例值", "InWay": "示例值", "Wxid": "wxid_bound_by_access_token", "Xml": "<msg></msg>"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/SjSkdPayQCode

**说明**: 自定义商家收款单

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `TenPay.SjSkdPayQCodeParam; {`Money`:string, `Name`:string, `Remark`:string, `Wxid`:string}` | 注意参数 示例={"Money": "示例值", "Name": "示例值", "Remark": "示例值", "Wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /TenPay/WXCreateRedPacketApi

**说明**: 创建红包

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `TenPay.RedPacket; {`amount`:integer, `content`:string, `count`:integer, `from`:integer, `redType`:integer, `username`:string, `wxid`:string}` | 红包类型、接收人、数量、金额和祝福语 示例={"amount": 100, "content": "恭喜发财", "count": 1, "from": 0, "redType": 0, "username": "wxid_recipient", "wxid": "wxid_bound_by_access_token"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Voice

> 语音：语音消息与转写能力。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Voice/MessageTranscribe` | 接收到的语音消息转文字 |
| 2 | `POST` | `/Voice/Result` | 查询异步语音转写结果 |
| 3 | `POST` | `/Voice/Transcribe` | 上传语音并转成文字 |

### POST /Voice/MessageTranscribe

**说明**: 接收到的语音消息转文字

根据消息同步得到的消息标识，通过 authcode 绑定账号的项目 Mac 协议登录态分片下载语音，再上传转写并轮询文字结果。优先传 new_msg_id；旧消息可传 msg_id；群语音同时传 chat_room_name；同步消息含 master_buf_id 时一并传入。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Voice.MessageRequest; {`bits_per_sample`:integer, `chat_room_name`:string, `client_msg_id`:string, `encode_type`:integer, `file_type`:integer, `from_user_name`:string, `length`:integer, `master_buf_id`:Voice.DecimalInt64, `msg_id`:integer, `new_msg_id`:Voice.DecimalInt64, `poll_interval_ms`:integer, `sample_rate`:integer, `scene`:integer, `to_user_name`:string, `voice_id`:string, `wait_seconds`:integer}` | 接收语音的消息标识与转写参数 示例={"bits_per_sample": 0, "chat_room_name": "示例值", "client_msg_id": "client_msg_id_from_previous_response", "encode_type": 0, "file_type": 0, "from_user_name": "示例值", "length": 0, "master_buf_id": "master_buf_id_from_previous_response", "msg_id": 0, "new_msg_id": "new_msg_id_from_previous_response", "poll_interval_ms": 0, "sample_rate": 0, "scene": 0, "to_user_name": "示例值", "voice_id": "voice_id_from_previous_response", "wait_seconds": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Voice/Result

**说明**: 查询异步语音转写结果

使用 Transcribe 返回的 voice_id 查询转写进度；complete=true 表示结果结束，text 为当前识别文字，retry_after_ms 为建议查询间隔。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Voice.ResultRequest; {`voice_id`:string}` | voice_id 示例={"voice_id": "voice_id_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Voice/Transcribe

**说明**: 上传语音并转成文字

使用 authcode 绑定账号的项目 Mac 协议登录态完成语音分片上传和结果轮询。传入 audio_base64 提交新任务；wait_seconds 大于 0 时同步等待，等于 0 时返回 voice_id 供 Result 查询。音频属性需与实际编码保持一致。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Voice.Request; {`audio_base64`:string, `bits_per_sample`:integer, `chunk_size`:integer, `encode_type`:integer, `file_type`:integer, `from_user_name`:string, `poll_interval_ms`:integer, `sample_rate`:integer, `scene`:integer, `to_user_name`:string, `voice_id`:string, `wait_seconds`:integer}` | 音频与转写参数 示例={"audio_base64": "示例值", "bits_per_sample": 0, "chunk_size": 0, "encode_type": 0, "file_type": 0, "from_user_name": "示例值", "poll_interval_ms": 0, "sample_rate": 0, "scene": 0, "to_user_name": "示例值", "voice_id": "voice_id_from_previous_response", "wait_seconds": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Translate

> 翻译：文本与消息翻译能力。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Translate/Send` | 翻译并发送文字 |
| 2 | `POST` | `/Translate/Text` | 文字翻译 |

### POST /Translate/Send

**说明**: 翻译并发送文字

先翻译文字，再使用 authcode 绑定账号的项目协议登录态向指定联系人或群发送译文。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Translate.SendRequest; {`at`:string, `source_lang`:string, `target_lang`:string, `text`:string, `to_wxid`:string}` | 文字、目标语言和接收方 示例={"at": "示例值", "source_lang": "示例值", "target_lang": "示例值", "text": "你好", "to_wxid": "to_wxid_from_previous_response"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Translate/Text

**说明**: 文字翻译

翻译待发送或已接收的文字，source_lang 留空时自动识别原语言。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Translate.TextRequest; {`source_lang`:string, `target_lang`:string, `text`:string}` | 文字和目标语言 示例={"source_lang": "示例值", "target_lang": "示例值", "text": "你好"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Tools

> 工具：通用查询与辅助能力。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Tools/CdnDownloadImage` | 通过CDN下载微信图片 |
| 2 | `POST` | `/Tools/DownloadFile` | 下载微信文件分片（底层） |
| 3 | `POST` | `/Tools/DownloadFileBinary` | 完整下载微信文件（二进制） |
| 4 | `POST` | `/Tools/DownloadImg` | 下载微信图片分片 |
| 5 | `POST` | `/Tools/DownloadVideo` | 下载微信视频分片 |
| 6 | `POST` | `/Tools/DownloadVoice` | 语音协议下载（兼容接口） |
| 7 | `POST` | `/Tools/DownloadVoiceBinary` | 下载微信语音原文件（二进制） |
| 8 | `GET` | `/Tools/GeneratePayQCode` | 生成支付二维码 |
| 9 | `POST` | `/Tools/GetA8Key` | GetA8Key |
| 10 | `POST` | `/Tools/GetBandCardList` | 获取余额以及银行卡信息 |
| 11 | `POST` | `/Tools/GetBoundHardDevices` | GetBoundHardDevices |
| 12 | `POST` | `/Tools/GetCdnDns` | 获取CDN服务器dns信息 |
| 13 | `POST` | `/Tools/HelperVerification` | OauthSdkApp |
| 14 | `POST` | `/Tools/OauthSdkApp` | OauthSdkApp |
| 15 | `POST` | `/Tools/ThirdAppGrant` | 第三方APP授权 |
| 16 | `POST` | `/Tools/UploadFile` | 文件上传 |
| 17 | `POST` | `/Tools/setproxy` | 修改微信步数 |

### POST /Tools/CdnDownloadImage

**说明**: 通过CDN下载微信图片

从 image.cdn_download_contexts 选择 original、standard 或 thumbnail 对象并原样提交；必填 file_no 与 file_aes_key，响应 Data.Image 为解密后的图片 Base64。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.CdnDownloadImageParamDoc; {`file_aes_key`:string, `file_no`:string}` | 直接提交 image.cdn_download_contexts 中所需清晰度的对象 示例={"variant": "original", "file_no": "cdn_file_no_from_image_message", "file_aes_key": "aes_key_from_image_message"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/DownloadFile

**说明**: 下载微信文件分片（底层）

将收到消息的 file.download_context 原样作为请求体；必填 attach_id、user_name、data_len、section.start_pos、section.data_len，app_id 为空时保持空字符串。响应 JSON 中的分片字节会按 Base64 显示；业务下载推荐使用 DownloadFileBinary 直接获得完整原文件。群聊 user_name 使用 xxx@chatroom。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.DownloadAppAttachParamDoc; {`app_id`:string, `attach_id`:string, `data_len`:integer, `section`:Tools.DownloadSectionDoc, `user_name`:string}` | 直接提交 file.download_context 示例={"app_id": "file_app_id", "attach_id": "media_attach_id", "user_name": "123456789@chatroom", "data_len": 2500000, "section": {"start_pos": 0, "data_len": 1048576}} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/DownloadFileBinary

**说明**: 完整下载微信文件（二进制）

直接提交 WS/Webhook 消息的 file 对象、file.download_context 或完整消息。服务端自动循环拉取所有分片，以 Content-Disposition 附件形式返回原始文件字节，不经过 Base64。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.BinaryFileDownloadParamDoc; {`file_name`:string, `app_id`:string, `attach_id*`:string, `user_name*`:string, `data_len*`:integer, `section`:Tools.DownloadSectionDoc}` | 可提交媒体对象、download_context 或完整实时消息 示例={"file_name": "报告.pdf", "app_id": "file_app_id", "attach_id": "media_attach_id", "user_name": "123456789@chatroom", "data_len": 2500000, "section": {"start_pos": 0, "data_len": 1048576}} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 原始媒体文件字节流 | `string` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/DownloadImg

**说明**: 下载微信图片分片

将收到消息的 image.download_context 原样作为请求体；必填 to_wxid、msg_id、data_len、section.start_pos、section.data_len。群聊 to_wxid 使用 xxx@chatroom。每次按实际返回字节数推进 start_pos，直到达到 data_len。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.DownloadParamDoc; {`compress_type`:integer, `data_len`:integer, `msg_id`:integer, `section`:Tools.DownloadSectionDoc, `to_wxid`:string}` | 直接提交 image.download_context 示例={"to_wxid": "123456789@chatroom", "msg_id": 123456789, "data_len": 2400000, "section": {"start_pos": 0, "data_len": 1048576}, "compress_type": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/DownloadVideo

**说明**: 下载微信视频分片

将收到消息的 video.download_context 原样作为请求体；必填 msg_id、data_len、section.start_pos、section.data_len。每次按实际返回字节数推进 start_pos，直到达到 data_len。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.DownloadParamDoc; {`compress_type`:integer, `data_len`:integer, `msg_id`:integer, `section`:Tools.DownloadSectionDoc, `to_wxid`:string}` | 直接提交 video.download_context 示例={"to_wxid": "wxid_sender", "msg_id": 123456789, "data_len": 3145728, "section": {"start_pos": 0, "data_len": 1048576}, "compress_type": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/DownloadVoice

**说明**: 语音协议下载（兼容接口）

保留的单次协议响应接口，字节在 JSON 中按 Base64 显示。业务下载推荐直接提交 voice.download_context 到 DownloadVoiceBinary，获得完整原始音频文件。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.DownloadVoiceParamDoc; {`bufid`:string, `fromUserName`:string, `length`:integer, `msgId`:integer}` | 注意参数 示例={"bufid": "bufid_from_previous_response", "fromUserName": "示例值", "length": 0, "msgId": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/DownloadVoiceBinary

**说明**: 下载微信语音原文件（二进制）

直接提交 WS/Webhook 消息的 voice 对象、voice.download_context 或完整消息。服务端自动完成语音分片下载并返回 SILK、AMR、MP3、WAV 等原始音频字节。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.BinaryVoiceDownloadParamDoc; {`file_name`:string, `msg_id`:integer, `new_msg_id`:string, `client_msg_id`:string, `master_buf_id`:string, `chat_room_name`:string, `from_user_name`:string, `to_user_name`:string, `length`:integer, `format`:integer}` | 可提交媒体对象、download_context 或完整实时消息 示例={"msg_id": 123456789, "new_msg_id": "1497865503650304468", "client_msg_id": "client-voice-id", "master_buf_id": "33", "chat_room_name": "123456789@chatroom", "from_user_name": "123456789@chatroom", "to_user_name": "wxid_account", "length": 9077, "format": 4} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 原始媒体文件字节流 | `string` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /Tools/GeneratePayQCode

**说明**: 生成支付二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/GetA8Key

**说明**: GetA8Key

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.GetA8KeyParamDoc; {`codeType`:integer, `codeVersion`:integer, `cookieBase64`:string, `flag`:integer, `netType`:string, `opCode`:integer, `reqUrl`:string, `scene`:integer}` | OpCode == 2 Scene == 4 CodeType == 19 CodeVersion == 5 以上是默认参数,如有需求自行修改 示例={"codeType": 0, "codeVersion": 0, "cookieBase64": "示例值", "flag": 0, "netType": "示例值", "opCode": 0, "reqUrl": "https://example.com", "scene": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/GetBandCardList

**说明**: 获取余额以及银行卡信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/GetBoundHardDevices

**说明**: GetBoundHardDevices

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/GetCdnDns

**说明**: 获取CDN服务器dns信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/HelperVerification

**说明**: OauthSdkApp

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Tools.HelperVerificationParamDoc; {`gcc`:string, `mobile`:string}` | true 示例={"gcc": "示例值", "mobile": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/OauthSdkApp

**说明**: OauthSdkApp

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | — | `Tools.OauthSdkAppParamDoc; {`appid`:string, `avatarId`:integer, `opt`:integer, `packageName`:string, `state`:string}` | true 示例={"appid": "wx1234567890abcdef", "avatarId": 0, "opt": 0, "packageName": "示例值", "state": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/ThirdAppGrant

**说明**: 第三方APP授权

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.ThirdAppGrantParamDoc; {`appid`:string, `url`:string}` | 注意参数 示例={"appid": "wx1234567890abcdef", "url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/UploadFile

**说明**: 文件上传

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.UploadParamDoc; {`base64`:string}` | 文件上传 示例={"base64": "示例值"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Tools/setproxy

**说明**: 修改微信步数

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Tools.SetStepParamDoc; {`step`:integer}` | 步数，最高支持98000 示例={"step": 0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Customized

> 自定义：扩展业务接口。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Customized/WXCTDUniftyAuthBatch` | 批量开小程序 |

### POST /Customized/WXCTDUniftyAuthBatch

**说明**: 批量开小程序

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `Customized.WXCTDUniftyAuthParmDoc; {`Username`:string}` | Wxid 列表或标识 示例={"Username": "wxid_recipient"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

## Webhook

> 事件回调：按账号配置消息回调。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `GET` | `/Webhook/Business/Get` | 获取业务回调URL（按授权码） |
| 2 | `POST` | `/Webhook/Business/Set` | 设置业务回调URL（按授权码） |
| 3 | `GET` | `/Webhook/Get` | 获取 Webhook 配置（按授权码） |
| 4 | `POST` | `/Webhook/Remove` | 删除 Webhook 配置（按授权码） |
| 5 | `POST` | `/Webhook/Set` | 设置 Webhook 配置（按授权码） |
| 6 | `POST` | `/Webhook/Test` | 测试发送 Webhook 消息（按授权码） |

### GET /Webhook/Business/Get

**说明**: 获取业务回调URL（按授权码）

curl 示例：curl "http://0.0.0.1:8057/api/Webhook/Business/Get?authcode=ac123"

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Webhook/Business/Set

**说明**: 设置业务回调URL（按授权码）

curl -X POST "http://0.0.0.0:8057/api/Webhook/Business/Set?authcode=ac123" -H "Content-Type: application/json" -d '{"syncMessageUrl":"http://127.0.0.1:6999/wic/wechat/{authcode}/SyncMessage","logoutUrl":"http://127.0.0.1:6999/wic/wechat/{authcode}/logoutSys"}'

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `businesscfg.BusinessConfig; {`eventUrl`:string, `logoutUrl`:string, `syncMessageUrl`:string}` | 回调配置 示例={"eventUrl": "https://example.com", "logoutUrl": "https://example.com", "syncMessageUrl": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### GET /Webhook/Get

**说明**: 获取 Webhook 配置（按授权码）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Webhook/Remove

**说明**: 删除 Webhook 配置（按授权码）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Webhook/Set

**说明**: 设置 Webhook 配置（按授权码）

配置回调 URL、签名密钥和事件过滤。订阅朋友圈示例：messageTypes=["friend_circle_update"]、includeSelfMessage=true。朋友圈素材字段位于 Data.items[].moment.media[].url/thumb_url/md5/video_md5/width/height/total_size，朋友圈 ID 为字符串。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `webhook.WebhookConfig; {`enabled`:boolean, `enabledSet`:boolean, `includeSelfMessage`:boolean, `messageTypes`:array<string>, `retryCount`:integer, `retryCountSet`:boolean, `secret`:string, `timeout`:integer, `url`:string}` | 配置：url/secret/filters等 示例={"enabled": false, "enabledSet": false, "includeSelfMessage": false, "messageTypes": ["示例值"], "retryCount": 0, "retryCountSet": false, "secret": "your_secret", "timeout": 0, "url": "https://example.com"} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---

### POST /Webhook/Test

**说明**: 测试发送 Webhook 消息（按授权码）

响应：发送成功返回 OK；失败返回错误信息。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | Access Token；可在页面顶部统一设置 |
| body | `body` | ✅ | `models.WebhookTestRequest; {`MessageType`:string, `TestData`:object}` | 测试请求体 示例={"MessageType": "示例值", "TestData": {}} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 |  | `models.ResponseResult` |
| 400 | 请求参数错误 | `models.ResponseResult` |
| 401 | 凭证无效或已过期 | `models.ResponseResult` |
| 403 | 凭证已禁用或权限不足 | `models.ResponseResult` |
| 409 | 账号、会话或运行状态冲突 | `models.ResponseResult` |
| 429 | 请求频率过高 | `models.ResponseResult` |
| 500 | 服务内部异常 | `models.ResponseResult` |
| 502 | 上游协议或授权服务异常 | `models.ResponseResult` |

---


## 附录: 定义 (Definitions)

### Admin.DelayAuthKeyModel

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `authcode` | — | `string` |  |
| `days` | — | `integer` |  |

### Admin.DeleteAuthKeyModel

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `authcode` | — | `string` |  |

### Admin.GenAuthKeyModel

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `count` | — | `integer` |  |
| `days` | — | `integer` |  |
| `remark` | — | `string` |  |

### Algorithm.AndroidDeviceInfo

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `AndriodBssId` | — | `string` |  |
| `AndriodFsId` | — | `string` |  |
| `AndriodId` | — | `string` |  |
| `AndriodSsId` | — | `string` |  |
| `Androidversion` | — | `string` |  |
| `Arch` | — | `string` |  |
| `BuildBoard` | — | `string` |  |
| `BuildFP` | — | `string` |  |
| `BuildID` | — | `string` |  |
| `Features` | — | `string` |  |
| `Hardware` | — | `string` |  |
| `Imei` | — | `string` |  |
| `KernelReleaseNumber` | — | `string` |  |
| `Manufacturer` | — | `string` |  |
| `PackageSign` | — | `string` |  |
| `PhoneModel` | — | `string` |  |
| `PhoneSerial` | — | `string` |  |
| `RadioVersion` | — | `string` |  |
| `SbMD5` | — | `string` |  |
| `SfArm64MD5` | — | `string` |  |
| `SfArmMD5` | — | `string` |  |
| `SfMD5` | — | `string` |  |
| `WLanAddress` | — | `string` |  |
| `WidevineDeviceID` | — | `string` |  |
| `WidevineProvisionID` | — | `string` |  |
| `WifiFullName` | — | `string` |  |
| `WifiName` | — | `string` |  |

### Customized.WXCTDUniftyAuthParmDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Username` | — | `string` |  |

### Favor.DelParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FavId` | — | `integer` |  |

### Favor.GetFavItemParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FavId` | — | `integer` |  |

### Favor.SyncParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Keybuf` | — | `string` |  |

### Finder.CommentParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `CommentId` | — | `integer` |  |
| `Content` | — | `string` |  |
| `Id` | — | `integer` |  |
| `ObjectNonceId` | — | `string` |  |
| `OpType` | — | `integer` |  |
| `ReplyCommentId` | — | `integer` |  |
| `ReplyUsername` | — | `string` |  |
| `RootCommentId` | — | `integer` |  |
| `Scene` | — | `integer` |  |
| `SessionBuffer` | — | `string` |  |
| `Username` | — | `string` |  |

### Finder.DecryptParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Content` | — | `string` |  |

### Finder.DefaultParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderUsername` | — | `string` |  |
| `Value` | — | `string` |  |

### Finder.FinderGetMsgSessionIdParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderUsername` | — | `string` |  |

### Finder.FinderGetTopicListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LastBuffer` | — | `string` |  |
| `TopTitle` | — | `string` |  |

### Finder.FinderJoinLiveParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `DetId` | — | `integer` |  |
| `FbrKey` | — | `string` |  |
| `FinderUser` | — | `string` |  |
| `Id` | — | `integer` |  |
| `ObjectNonceId` | — | `string` |  |

### Finder.FinderLiveDetailParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderNonceID` | — | `string` |  |
| `FinderObjectID` | — | `integer` |  |

### Finder.FinderSendTextParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderUsername` | — | `string` |  |
| `Text` | — | `string` |  |

### Finder.GetCommentDetailParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderUsername` | — | `string` |  |
| `Id` | — | `integer` |  |
| `LastBuffer` | — | `string` |  |
| `ObjectNonceId` | — | `string` |  |
| `RootCommentId` | — | `integer` |  |

### Finder.LikeParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderUsername` | — | `string` |  |
| `Id` | — | `integer` |  |
| `ObjectNonceId` | — | `string` |  |
| `SessionBuffer` | — | `string` |  |

### Finder.TargetUserPageParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LastBuffer` | — | `string` |  |
| `Target` | — | `string` |  |

### Friend.BlacklistParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `toWxid` | — | `string` |  |
| `val` | — | `integer` |  |

### Friend.DefaultParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `toWxid` | — | `string` |  |

### Friend.FriendRelationParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `opCode` | — | `integer` |  |
| `toWxid` | — | `string` |  |

### Friend.GetContractDetailparameterDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `userName` | — | `string` |  |

### Friend.GetContractListparameterDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `currentChatRoomContactSeq` | — | `integer` |  |
| `currentWxcontactSeq` | — | `integer` |  |

### Friend.LbsFindParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `latitude` | — | `number` |  |
| `longitude` | — | `number` |  |
| `opCode` | — | `integer` |  |

### Friend.PassVerifyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `opcode` | — | `integer` |  |
| `scene` | — | `integer` |  |
| `v1` | — | `string` |  |
| `v2` | — | `string` |  |

### Friend.SearchParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `fromScene` | — | `integer` |  |
| `keyword` | — | `string` |  |
| `searchScene` | — | `integer` |  |

### Friend.SendRequestParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `v1` | — | `string` |  |
| `v2` | — | `string` |  |

### Friend.SetRemarksParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `remarks` | — | `string` |  |
| `toWxid` | — | `string` |  |

### Friend.UploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `currentPhoneNo` | — | `string` |  |
| `opcode` | — | `integer` |  |
| `phoneNo` | — | `string` |  |

### FriendCircle.CdnSnsImageUploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `imageData` | — | `string` |  |

### FriendCircle.CommentParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `content` | — | `string` |  |
| `id` | — | `string` |  |
| `replyCommnetId` | — | `integer` |  |
| `type` | — | `integer` |  |

### FriendCircle.DownloadMediaModelDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `key` | — | `string` |  |
| `url` | — | `string` |  |

### FriendCircle.GetCommnetParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `xmlData` | — | `string` |  |

### FriendCircle.GetDetailparameterDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `fristpagemd5` | — | `string` |  |
| `maxid` | — | `integer` |  |
| `towxid` | — | `string` |  |

### FriendCircle.GetIdDetailParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | — | `integer` |  |
| `towxid` | — | `string` |  |

### FriendCircle.GetListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `fristpagemd5` | — | `string` |  |
| `maxid` | — | `integer` |  |

### FriendCircle.MessagearameterDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `blackList` | — | `string` |  |
| `content` | — | `string` |  |
| `withUserList` | — | `string` |  |

### FriendCircle.MmSnsSyncParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `synckey` | — | `string` |  |

### FriendCircle.OperationParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `commnetId` | — | `integer` |  |
| `id` | — | `string` |  |
| `type` | — | `integer` |  |

### FriendCircle.PrivacySettingsParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `function` | — | `integer` |  |
| `value` | — | `integer` |  |

### FriendCircle.RequestParamsDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `forwardAddr` | — | `string` |  |
| `id` | — | `string` |  |

### FriendCircle.CdnSnsImagesUploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `imageDataList` | — | `array<string>` |  |

### FriendCircle.SetBackgroundImageParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | — | `string` |  |
| `thumbUrl` | — | `string` |  |

### FriendCircle.SnsPostRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `blackList` | — | `string` |  |
| `groupUserList` | — | `string` |  |
| `images` | — | `array<object{url:string, thumbUrl:string, md5:string, totalSize:integer, width:integer, height:integer}>` |  |
| `link` | — | `object{contentUrl:string, title:string, description:string, url:string, thumbUrl:string, md5:string, totalSize:integer, width:integer, height:integer}` |  |
| `location` | — | `object{city:string, longitude:string, latitude:string, poiName:string, poiAddress:string}` |  |
| `private` | — | `integer` |  |
| `title` | — | `string` |  |
| `video` | — | `object{videomd5:string, thumbmd5:string, videourl:string, thumburl:string, totalSize:string}` |  |
| `withUserList` | — | `string` |  |

### FriendCircle.SnsUploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `base64` | — | `string` |  |

### FriendCircle.SnsUploadVideoParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `thumbData` | — | `string` |  |
| `videoData` | — | `string` |  |

### Group.AddChatRoomParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ChatRoomName` | — | `string` |  |
| `ToWxids` | — | `string` |  |

### Group.ConsentToJoinParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Url` | — | `string` |  |

### Group.CreateChatRoomParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ToWxids` | — | `string` |  |

### Group.FacingCreateChatRoomParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Latitude` | — | `number` |  |
| `Longitude` | — | `number` |  |
| `OpCode` | — | `integer` |  |
| `Password` | — | `string` |  |

### Group.GetChatRoomParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` |  |

### Group.MoveContractListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` |  |
| `Val` | — | `integer` |  |

### Group.OperateChatRoomAdminParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` |  |
| `ToWxids` | — | `string` |  |
| `Val` | — | `integer` |  |

### Group.OperateChatRoomInfoParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Content` | — | `string` |  |
| `QID` | — | `string` |  |

### Group.QuitGroupParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` |  |

### Group.ScanIntoGroupParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Url` | — | `string` |  |

### Group.SendPatParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` |  |
| `Scene` | — | `integer` |  |
| `ToUserName` | — | `string` |  |

### Group.SetChatroomAccessVerifyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Enable` | — | `boolean` |  |
| `QID` | — | `string` |  |

### Group.TransferGroupOwnerParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `NewOwnerUserName` | — | `string` |  |
| `QID` | — | `string` |  |

### Label.AddParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LabelName` | — | `string` |  |

### Label.DeleteParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LabelID` | — | `string` |  |

### Label.UpdateListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LabelID` | — | `string` |  |
| `ToWxids` | — | `string` |  |

### Label.UpdateNameParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LabelID` | — | `integer` |  |
| `NewName` | — | `string` |  |

### Login.A16LoginParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `A16` | — | `string` |  |
| `DeviceName` | — | `string` |  |
| `Extend` | — | `Algorithm.AndroidDeviceInfo` |  |
| `Password` | — | `string` |  |
| `Proxy` | — | `models.ProxyInfo` |  |
| `UserName` | — | `string` |  |

### Login.Data62LoginReq

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Data62` | — | `string` |  |
| `DeviceName` | — | `string` |  |
| `Password` | — | `string` |  |
| `Proxy` | — | `models.ProxyInfo` |  |
| `UserName` | — | `string` |  |

### Login.Data62SMSAgainReq

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Cookie` | — | `string` |  |
| `Proxy` | — | `models.ProxyInfo` |  |
| `Url` | — | `string` |  |

### Login.Data62SMSVerifyReq

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Cookie` | — | `string` |  |
| `Proxy` | — | `models.ProxyInfo` |  |
| `Sms` | — | `string` |  |
| `Url` | — | `string` |  |

### Login.ExtDeviceLoginConfirmParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Url` | — | `string` |  |

### Login.GetQRReq

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `DeviceName` | — | `string` |  |
| `Proxy` | — | `models.ProxyInfo` |  |
| `oversea` | — | `boolean` |  |

### Login.MaccodeParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `authcode` | — | `string` | 旧客户端兼容授权码；推荐使用 X-Access-Token 请求头 |
| `deviceID` | — | `string` | GetMacQR 返回的设备 ID；留空时服务尝试根据 uuid 恢复 |
| `uuid` | — | `string` | GetMacQR 返回的 UUID |

### Login.VerificationcodeParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `string` |  |
| `Data62` | — | `string` |  |
| `Ticket` | — | `string` |  |
| `Uuid` | — | `string` |  |

### Msg.DefaultParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Content` | — | `string` |  |
| `ToWxid` | — | `string` |  |

### Msg.QuoteContextDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `chat_user_id` | — | `string` |  |
| `conversation_id` | — | `string` |  |
| `from_user_id` | — | `string` |  |
| `msg_id` | — | `integer` |  |
| `msg_type` | — | `integer` |  |
| `new_msg_id` | — | `string` |  |
| `quote_content` | — | `string` |  |
| `sequence` | — | `integer` |  |
| `svr_id` | — | `string` |  |
| `to_wxid` | — | `string` |  |

### Msg.QuoteDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `chat_user_id` | — | `string` |  |
| `content` | — | `string` |  |
| `display_name` | — | `string` |  |
| `from_user_id` | — | `string` |  |
| `msg_type` | — | `integer` |  |
| `new_msg_id` | — | `string` |  |
| `quote_content` | — | `string` |  |
| `reply_context` | — | `Msg.QuoteContextDoc` |  |
| `sequence` | — | `string` |  |
| `svr_id` | — | `string` |  |
| `to_wxid` | — | `string` |  |

### Msg.QuoteResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `Msg.QuoteSendResult` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### Msg.QuoteSendReplyContext

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `chat_user_id` | — | `string` |  |
| `conversation_id` | — | `string` |  |
| `from_user_id` | — | `string` |  |
| `msg_id` | — | `integer` |  |
| `msg_type` | — | `integer` |  |
| `new_msg_id` | — | `string` |  |
| `quote_content` | — | `string` |  |
| `svr_id` | — | `string` |  |
| `to_wxid` | — | `string` |  |

### Msg.QuoteSendResult

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `app_message_type` | — | `integer` |  |
| `client_msg_id` | — | `string` |  |
| `content` | — | `string` |  |
| `created_at` | — | `integer` |  |
| `from_user_id` | — | `string` |  |
| `id` | — | `string` |  |
| `local_id` | — | `integer` |  |
| `message_type` | — | `integer` |  |
| `msg_id` | — | `integer` |  |
| `new_msg_id` | — | `string` |  |
| `referenced_message_type` | — | `integer` |  |
| `referenced_svr_id` | — | `string` |  |
| `reply_context` | — | `Msg.QuoteSendReplyContext` |  |
| `svr_id` | — | `string` |  |
| `to_wxid` | — | `string` |  |

### Msg.RevokeMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ClientMsgId` | — | `integer` |  |
| `CreateTime` | — | `integer` |  |
| `NewMsgId` | — | `integer` |  |
| `ToUserName` | — | `string` |  |

### Msg.SendAppMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ToWxid` | — | `string` |  |
| `Type` | — | `integer` |  |
| `Xml` | — | `string` |  |

### Msg.SendEmojiParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Md5` | — | `string` |  |
| `ToWxid` | — | `string` |  |
| `TotalLen` | — | `integer` |  |

### Msg.SendGroupMassMsgTextParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Content` | — | `string` |  |
| `ToIds` | — | `array<string>` |  |

### Msg.SendImageMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Base64` | — | `string` |  |
| `ToWxid` | — | `string` |  |

### Msg.SendNewMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `At` | — | `string` |  |
| `Content` | — | `string` |  |
| `ToWxid` | — | `string` |  |
| `Type` | — | `integer` |  |

### Msg.SendVideoMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Base64` | — | `string` |  |
| `ImageBase64` | — | `string` |  |
| `PlayLength` | — | `integer` |  |
| `ToWxid` | — | `string` |  |

### Msg.SendVoiceMessageParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Base64` | — | `string` |  |
| `ToWxid` | — | `string` |  |
| `Type` | — | `integer` |  |
| `VoiceTime` | — | `integer` |  |

### Msg.ShareCardParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `CardAlias` | — | `string` |  |
| `CardNickName` | — | `string` |  |
| `CardWxId` | — | `string` |  |
| `ToWxid` | — | `string` |  |

### Msg.ShareLocationParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Infourl` | — | `string` |  |
| `Label` | — | `string` |  |
| `Poiname` | — | `string` |  |
| `Scale` | — | `number` |  |
| `ToWxid` | — | `string` |  |
| `X` | — | `number` |  |
| `Y` | — | `number` |  |

### Msg.ShareVideoMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ToWxid` | — | `string` |  |
| `Xml` | — | `string` |  |

### Msg.SyncParam2Doc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `TargetURL` | — | `string` |  |

### Msg.SyncParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Scene` | — | `integer` |  |
| `Synckey` | — | `string` |  |

### OfficialAccounts.AuthMpLoginParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `scene` | — | `integer` |  |
| `url` | — | `string` |  |
| `wxid` | — | `string` |  |

### OfficialAccounts.DefaultParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `wxid` | — | `string` |  |

### OfficialAccounts.GetMpHistoryMsgParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | — | `string` |  |
| `wxid` | — | `string` |  |

### OfficialAccounts.GetkeyParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` | 公众号 AppID |
| `url` | — | `string` | 需要 JSAPI 权限校验的完整页面 URL |
| `wxid` | — | `string` | 账号由 Access Token 绑定关系解析，普通调用无需提交 |

### OfficialAccounts.QRConnectParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | — | `string` |  |
| `wxid` | — | `string` |  |

### OfficialAccounts.ReadParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | — | `string` |  |
| `wxid` | — | `string` |  |

### QWContact.AddWxAppRecordParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Username` | — | `string` |  |
| `Wxid` | — | `string` |  |

### QWContact.QWAddContactParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Username` | — | `string` |  |
| `V1` | — | `string` |  |
| `Wxid` | — | `string` |  |

### QWContact.QWApplyAddContactParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Context` | — | `string` |  |
| `Username` | — | `string` |  |
| `V1` | — | `string` |  |
| `Wxid` | — | `string` |  |

### SayHello.Model1Param

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Url` | — | `string` |  |
| `VerifyContent` | — | `string` |  |

### SayHello.Model2Param

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Content` | — | `string` |  |
| `FromScene` | — | `integer` |  |
| `Scene` | — | `integer` |  |
| `SearchScene` | — | `integer` |  |
| `ToUserName` | — | `string` |  |
| `Wxid` | — | `string` |  |

### SayHello.SendRequestParam1

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Scene` | — | `integer` |  |
| `V3` | — | `string` |  |
| `V4` | — | `string` |  |
| `VerifyContent` | — | `string` |  |
| `Wxid` | — | `string` |  |

### Search.AIFirstPageRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `include_raw` | — | `boolean` | 是否附带微信原始数据；普通调用保持 false |
| `model` | — | `string` | 搜索模型；留空使用服务默认模型 |
| `query` | ✅ | `string` | AI 搜索问题，至少 2 个字符 |
| `turn` | — | `integer` | 首轮固定为 0 |

### Search.CGICallRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `include_raw` | — | `boolean` | 是否在响应中附带原始协议数据 |
| `method` | — | `string` | 仅 HTTP 类服务需要；留空使用 Services 返回的默认方法 |
| `payload` | — | `object` | 服务要求的 JSON 请求对象；字段由 Services 返回的具体能力决定 |
| `payload_base64` | — | `string` | 原始二进制请求的 Base64；与 payload、payload_hex 三选一 |
| `payload_hex` | — | `string` | 原始二进制请求的十六进制；与 payload、payload_base64 三选一 |

### Search.Request

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `a8_scene` | — | `integer` | GetA8Key 场景；仅 Gateway 高级调试使用，0 表示默认值 |
| `category` | — | `string` | 搜索分类；Query 接口必填，独立分类接口由路由自动设置 |
| `code_type` | — | `integer` | GetA8Key 代码类型；仅 Gateway 高级调试使用，0 表示默认值 |
| `code_version` | — | `integer` | GetA8Key 代码版本；仅 Gateway 高级调试使用，0 表示默认值 |
| `cursor` | — | `string` | 续页游标；首页留空，续页原样传回上一页的 cursor |
| `include_raw` | — | `boolean` | 是否在响应中附带微信原始数据；调试时才建议开启 |
| `limit` | — | `integer` | 每页数量，建议 10，最大值由微信服务决定 |
| `offset` | — | `integer` | 结果偏移量；首页传 0，续页传上一页返回的 next_offset |
| `opcode` | — | `integer` | GetA8Key 操作码；仅 Gateway 高级调试使用，0 表示默认值 |
| `path` | — | `string` | 网页网关路径；仅 Gateway 使用，留空采用默认搜索路径 |
| `protocol_scene` | — | `integer` | 协议场景值；普通搜索使用 0 让服务自动选择 |
| `query` | — | `string` | 搜索关键词，至少 2 个字符 |
| `scene` | — | `integer` | 网页网关场景；仅 Gateway 使用，默认 4812 |
| `search_id` | — | `string` | 续页标识；首页留空，续页原样传回上一页的 search_id |
| `type` | — | `integer` | 网页网关搜索类型；仅 Gateway 使用，默认 53 |

### Search.VerticalFirstPageRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `include_raw` | — | `boolean` | 是否附带微信原始数据；普通调用保持 false |
| `limit` | — | `integer` | 每页数量，范围 1-100 |
| `offset` | — | `integer` | 首页固定传 0；续页改传上一页返回的 next_offset |
| `query` | ✅ | `string` | 搜索关键词，至少 2 个字符 |

### TenPay.CollectmoneyModel

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `invalidTime` | — | `string` | 收款请求失效时间 |
| `toUserName` | — | `string` | 付款方微信标识 |
| `transFerId` | — | `string` | 转账标识 |
| `transactionId` | — | `string` | 交易标识 |
| `wxid` | — | `string` | 账号由 Access Token 绑定关系解析，普通调用无需提交 |

### TenPay.ConfirmPreTransfer

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `bankSerial` | — | `string` | 预支付响应中的银行卡序列号 |
| `bankType` | — | `string` | 预支付响应中的银行类型 |
| `payPassword` | — | `string` | 支付密码；只通过 HTTPS 提交，不记录日志 |
| `reqKey` | — | `string` | 预支付响应中的请求密钥 |
| `wxid` | — | `string` | 账号由 Access Token 绑定关系解析，普通调用无需提交 |

### TenPay.GeMaSkdPayQCodeParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Money` | — | `string` |  |
| `Name` | — | `string` |  |
| `Remark` | — | `string` |  |
| `Wxid` | — | `string` |  |

### TenPay.GeneratePayQCodeModel

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `money` | — | `string` | 收款金额，单位元，最多两位小数 |
| `name` | — | `string` | 收款项目名称 |
| `wxid` | — | `string` | 账号由 Access Token 绑定关系解析，普通调用无需提交 |

### TenPay.HongBaoDetail

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `offset` | — | `integer` | 领取记录分页偏移 |
| `size` | — | `integer` | 领取记录分页数量 |
| `wxid` | — | `string` | 账号由 Access Token 绑定关系解析，普通调用无需提交 |
| `xml` | — | `string` | 红包消息中的原始 XML |

### TenPay.HongBaoParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `SendUserName` | — | `string` |  |
| `Wxid` | — | `string` |  |
| `Xml` | — | `string` |  |

### TenPay.HongBaoTailParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `SendId` | — | `string` |  |
| `SendUserName` | — | `string` |  |
| `TimingIdentifier` | — | `string` |  |
| `Wxid` | — | `string` |  |
| `Xml` | — | `string` |  |

### TenPay.OpenwxhbParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Encrypt_key` | — | `string` |  |
| `Encrypt_userinfo` | — | `string` |  |
| `SendUserName` | — | `string` |  |
| `TimingIdentifier` | — | `string` |  |
| `Wxid` | — | `string` |  |
| `Xml` | — | `string` |  |

### TenPay.QrydetailwxhbParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Encrypt_key` | — | `string` |  |
| `Encrypt_userinfo` | — | `string` |  |
| `Wxid` | — | `string` |  |
| `Xml` | — | `string` |  |

### TenPay.ReceivewxhbParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Encrypt_key` | — | `string` |  |
| `Encrypt_userinfo` | — | `string` |  |
| `InWay` | — | `string` |  |
| `Wxid` | — | `string` |  |
| `Xml` | — | `string` |  |

### TenPay.RedPacket

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `amount` | — | `integer` | 红包总金额，单位分 |
| `content` | — | `string` | 红包祝福语 |
| `count` | — | `integer` | 红包个数 |
| `from` | — | `integer` | 红包来源场景 |
| `redType` | — | `integer` | 红包类型 |
| `username` | — | `string` | 接收人微信标识；群红包填写群 ID |
| `wxid` | — | `string` | 账号由 Access Token 绑定关系解析，普通调用无需提交 |

### TenPay.SjSkdPayQCodeParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Money` | — | `string` |  |
| `Name` | — | `string` |  |
| `Remark` | — | `string` |  |
| `Wxid` | — | `string` |  |

### Tools.BinaryFileDownloadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `file_name` | — | `string` | 下载文件名；提交完整 file 对象时自动读取 name |
| `app_id` | — | `string` |  |
| `attach_id` | ✅ | `string` |  |
| `user_name` | ✅ | `string` |  |
| `data_len` | ✅ | `integer` |  |
| `section` | — | `Tools.DownloadSectionDoc` |  |

### Tools.BinaryVoiceDownloadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `file_name` | — | `string` |  |
| `msg_id` | — | `integer` |  |
| `new_msg_id` | — | `string` | 64 位消息 ID，使用字符串 |
| `client_msg_id` | — | `string` |  |
| `master_buf_id` | — | `string` | 64 位缓冲区 ID，使用字符串 |
| `chat_room_name` | — | `string` |  |
| `from_user_name` | — | `string` |  |
| `to_user_name` | — | `string` |  |
| `length` | — | `integer` |  |
| `format` | — | `integer` | 0=AMR，1=SPEEX，2=MP3，3=WAV，4=SILK |

### Tools.CdnDownloadImageParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `file_aes_key` | — | `string` |  |
| `file_no` | — | `string` |  |

### Tools.DownloadAppAttachParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `app_id` | — | `string` |  |
| `attach_id` | — | `string` |  |
| `data_len` | — | `integer` |  |
| `section` | — | `Tools.DownloadSectionDoc` |  |
| `user_name` | — | `string` |  |

### Tools.DownloadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `compress_type` | — | `integer` |  |
| `data_len` | — | `integer` |  |
| `msg_id` | — | `integer` |  |
| `section` | — | `Tools.DownloadSectionDoc` |  |
| `to_wxid` | — | `string` |  |

### Tools.DownloadSectionDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `data_len` | — | `integer` |  |
| `start_pos` | — | `integer` |  |

### Tools.DownloadVoiceParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `bufid` | — | `string` |  |
| `fromUserName` | — | `string` |  |
| `length` | — | `integer` |  |
| `msgId` | — | `integer` |  |

### Tools.GetA8KeyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `codeType` | — | `integer` |  |
| `codeVersion` | — | `integer` |  |
| `cookieBase64` | — | `string` |  |
| `flag` | — | `integer` |  |
| `netType` | — | `string` |  |
| `opCode` | — | `integer` |  |
| `reqUrl` | — | `string` |  |
| `scene` | — | `integer` |  |

### Tools.HelperVerificationParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `gcc` | — | `string` |  |
| `mobile` | — | `string` |  |

### Tools.OauthSdkAppParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `avatarId` | — | `integer` |  |
| `opt` | — | `integer` |  |
| `packageName` | — | `string` |  |
| `state` | — | `string` |  |

### Tools.SetProxyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `proxy` | — | `string` |  |

### Tools.SetStepParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `step` | — | `integer` |  |

### Tools.ThirdAppGrantParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `url` | — | `string` |  |

### Tools.UploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `base64` | — | `string` |  |

### Translate.SendRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `at` | — | `string` |  |
| `source_lang` | — | `string` |  |
| `target_lang` | — | `string` |  |
| `text` | — | `string` |  |
| `to_wxid` | — | `string` |  |

### Translate.TextRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `source_lang` | — | `string` |  |
| `target_lang` | — | `string` |  |
| `text` | — | `string` |  |

### User.BindMobileParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Mobile` | — | `string` |  |
| `Verifycode` | — | `string` |  |
| `Wxid` | — | `string` |  |

### User.BindQQParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Account` | — | `integer` |  |
| `Password` | — | `string` |  |
| `Wxid` | — | `string` |  |

### User.DelSafetyInfoParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Uuid` | — | `string` |  |
| `Wxid` | — | `string` |  |

### User.EmailParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Email` | — | `string` |  |
| `Wxid` | — | `string` |  |

### User.GetQRCodeParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Style` | — | `integer` |  |
| `Wxid` | — | `string` |  |

### User.NewSetPasswdParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `NewPassword` | — | `string` |  |
| `Ticket` | — | `string` |  |
| `Wxid` | — | `string` |  |

### User.NewVerifyPasswdParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Password` | — | `string` |  |
| `Wxid` | — | `string` |  |

### User.PrivacySettingsParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Function` | — | `integer` |  |
| `Value` | — | `integer` |  |
| `Wxid` | — | `string` |  |

### User.ReportMotionParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `DeviceId` | — | `string` |  |
| `DeviceType` | — | `string` |  |
| `StepCount` | — | `integer` |  |
| `Wxid` | — | `string` |  |

### User.SendVerifyMobileParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Mobile` | — | `string` |  |
| `Opcode` | — | `integer` |  |
| `Wxid` | — | `string` |  |

### User.SetAlisaParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Alisa` | — | `string` |  |
| `Wxid` | — | `string` |  |

### User.UpdateProfileParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `City` | — | `string` |  |
| `Country` | — | `string` |  |
| `NickName` | — | `string` |  |
| `Province` | — | `string` |  |
| `Sex` | — | `integer` |  |
| `Signature` | — | `string` |  |
| `Wxid` | — | `string` |  |

### User.UploadHeadImageParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Base64` | — | `string` |  |
| `Wxid` | — | `string` |  |

### Voice.DecimalInt64

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### Voice.MessageRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `bits_per_sample` | — | `integer` |  |
| `chat_room_name` | — | `string` |  |
| `client_msg_id` | — | `string` |  |
| `encode_type` | — | `integer` |  |
| `file_type` | — | `integer` |  |
| `from_user_name` | — | `string` |  |
| `length` | — | `integer` |  |
| `master_buf_id` | — | `Voice.DecimalInt64` |  |
| `msg_id` | — | `integer` |  |
| `new_msg_id` | — | `Voice.DecimalInt64` |  |
| `poll_interval_ms` | — | `integer` |  |
| `sample_rate` | — | `integer` |  |
| `scene` | — | `integer` |  |
| `to_user_name` | — | `string` |  |
| `voice_id` | — | `string` |  |
| `wait_seconds` | — | `integer` |  |

### Voice.Request

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `audio_base64` | — | `string` |  |
| `bits_per_sample` | — | `integer` |  |
| `chunk_size` | — | `integer` |  |
| `encode_type` | — | `integer` |  |
| `file_type` | — | `integer` |  |
| `from_user_name` | — | `string` |  |
| `poll_interval_ms` | — | `integer` |  |
| `sample_rate` | — | `integer` |  |
| `scene` | — | `integer` |  |
| `to_user_name` | — | `string` |  |
| `voice_id` | — | `string` |  |
| `wait_seconds` | — | `integer` |  |

### Voice.ResultRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `voice_id` | — | `string` |  |

### Wxapp.AddAvatarImgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `jpgLink` | — | `string` |  |

### Wxapp.AddAvatarParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `aFilekey` | — | `string` |  |
| `appid` | — | `string` |  |
| `nickName` | — | `string` |  |

### Wxapp.AddWxAppRecordParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `username` | — | `string` |  |

### Wxapp.CheckVerifyCodeDataDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `mobile` | — | `string` |  |
| `verifyCode` | — | `string` |  |

### Wxapp.CloudCallParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `data` | — | `string` |  |

### Wxapp.DefaultParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Appid` | — | `string` |  |
| `Wxid` | — | `string` |  |

### Wxapp.DefaultParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |

### Wxapp.DelMobileDataDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `mobile` | — | `string` |  |
| `opcode` | — | `integer` |  |

### Wxapp.DellAvatarParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `avatarId` | — | `integer` |  |

### Wxapp.GETCreditScoreParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Wxid` | — | `string` |  |

### Wxapp.GetUserOpenIdParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `toWxId` | — | `string` |  |

### Wxapp.GetWxAppRecordParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### Wxapp.GetpullPayParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `nonceStr` | — | `string` |  |
| `package` | — | `string` |  |
| `paySign` | — | `string` |  |
| `sessionid` | — | `string` |  |
| `timeStamp` | — | `string` |  |

### Wxapp.JSOperateWxParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `data` | — | `string` |  |
| `opt` | — | `integer` |  |

### Wxapp.OauthListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### Wxapp.QrcodeAuthLoginParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `uuid` | — | `string` |  |

### Wxapp.SessionidQRParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `nonceStr` | — | `string` |  |
| `package` | — | `string` |  |
| `paySign` | — | `string` |  |
| `sessionid` | — | `string` |  |
| `timeStamp` | — | `string` |  |

### Wxapp.UnionpayDataDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | — | `string` |  |
| `nonceStr` | — | `string` |  |
| `package` | — | `string` |  |
| `paySign` | — | `string` |  |
| `sessionid` | — | `string` |  |
| `timeStamp` | — | `string` |  |

### XiaoWei.BuluHistoryItemRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `answer_cards` | — | `array<XiaoWei.CardWrapRequest>` |  |
| `dialogue_id` | — | `integer` |  |
| `question_cards` | — | `array<XiaoWei.CardWrapRequest>` |  |
| `timestamp` | — | `integer` |  |
| `trace_id` | — | `string` |  |

### XiaoWei.BuluUserHistoryRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `items` | — | `array<XiaoWei.BuluHistoryItemRequest>` |  |
| `operation_type` | — | `integer` |  |
| `test` | — | `boolean` |  |

### XiaoWei.CardScreenshotMediaRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `aes_key` | — | `string` |  |
| `app_type` | — | `integer` |  |
| `file_id` | — | `string` |  |
| `file_type` | — | `integer` |  |
| `image_url` | — | `string` |  |
| `msg_type` | — | `string` |  |

### XiaoWei.CardScreenshotSecurityCheckRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `app_id` | — | `string` |  |
| `media` | — | `array<XiaoWei.CardScreenshotMediaRequest>` |  |
| `message_id` | — | `string` |  |
| `trace_message_id` | — | `string` |  |

### XiaoWei.CardWrapRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `interactive_card_json` | — | `string` |  |
| `protobuf_base64` | — | `string` |  |
| `type` | — | `integer` |  |
| `xml` | — | `string` |  |

### XiaoWei.ChatBubbleExtraInfoRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `dialogue_id` | — | `integer` |  |
| `message_id` | — | `integer` |  |
| `timestamp` | — | `integer` |  |
| `trace_id` | — | `string` |  |

### XiaoWei.DeleteHistoryItemListRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `items` | — | `array<XiaoWei.DeleteHistoryItemRequest>` |  |

### XiaoWei.DeleteHistoryItemRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `answers` | — | `array<string>` |  |
| `checked_ids` | — | `array<string>` |  |
| `dialogue_id` | — | `string` |  |
| `query` | — | `string` |  |
| `timestamp` | — | `integer` |  |
| `trace_id` | — | `string` |  |
| `unchecked_ids` | — | `array<string>` |  |

### XiaoWei.DeleteXiaoweiChatHistoryRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `delete_item_lists` | — | `array<XiaoWei.DeleteHistoryItemListRequest>` |  |

### XiaoWei.GetA2AChatListRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `limit` | — | `integer` |  |
| `page_context` | — | `string` |  |

### XiaoWei.GetChatHistoryListRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `clicked_bubble` | — | `XiaoWei.ChatBubbleExtraInfoRequest` |  |
| `down_context` | — | `XiaoWei.PageContextRequest` |  |
| `scroll_type` | — | `integer` |  |
| `up_context` | — | `XiaoWei.PageContextRequest` |  |

### XiaoWei.GetHalfScreenSuggestionsRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `share_type` | — | `integer` |  |
| `ui_state` | — | `integer` |  |

### XiaoWei.GetRedDotRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `debug_info` | — | `string` |  |

### XiaoWei.GetUserCardListRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `card_type` | — | `integer` |  |
| `page_context` | — | `XiaoWei.PageContextRequest` |  |

### XiaoWei.InviteUsersRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `wxids` | — | `array<string>` |  |

### XiaoWei.MarkRedDotReadValidRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `debug_info` | — | `string` |  |
| `last_read_timestamp` | — | `integer` |  |
| `reddot_id` | — | `integer` |  |

### XiaoWei.PageContextRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `has_more` | — | `boolean` |  |
| `limit_count` | — | `integer` |  |
| `offset` | — | `integer` |  |
| `time_cursor` | — | `integer` |  |

### businesscfg.BusinessConfig

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `eventUrl` | — | `string` |  |
| `logoutUrl` | — | `string` |  |
| `syncMessageUrl` | — | `string` |  |

### models.EmptyObject

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### models.ProxyInfo

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ProxyIp` | — | `string` |  |
| `ProxyPassword` | — | `string` |  |
| `ProxyUser` | — | `string` |  |

### models.ResponseResult

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `object` | 业务响应数据；结构由具体接口决定 |
| `Data62` | — | `string` |  |
| `Debug` | — | `string` |  |
| `ID` | — | `integer` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### models.ResponseResult2

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `object` | 业务响应数据；结构由具体接口决定 |
| `Data62` | — | `string` |  |
| `DeviceId` | — | `string` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### models.WebhookTestRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `MessageType` | — | `string` |  |
| `TestData` | — | `object` | 业务响应数据；结构由具体接口决定 |

### webhook.WebhookConfig

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `enabled` | — | `boolean` |  |
| `enabledSet` | — | `boolean` |  |
| `includeSelfMessage` | — | `boolean` |  |
| `messageTypes` | — | `array<string>` |  |
| `retryCount` | — | `integer` |  |
| `retryCountSet` | — | `boolean` |  |
| `secret` | — | `string` |  |
| `timeout` | — | `integer` |  |
| `url` | — | `string` |  |
