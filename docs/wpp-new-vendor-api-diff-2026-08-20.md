# WPP 新旧 vendor API 深度差异检查报告

**日期**: 2026-08-20
**对比**: 旧 `wechatpadpro:local` (swagger 254 端点) vs 新 `wechatpadpro/wechatpadprobusiness:v2026.08.18.1` (swagger 313 端点)
**插件版本**: v1.3.74
**范围**: 插件实际注册的 307 个端点全量核对

---

## 一、鉴权/响应系统性变化（非端点差异，插件已适配）

| 项 | 旧 | 新 | 插件状态 |
|---|---|---|---|
| 鉴权 | `X-Access-Token` header | `authcode` query（且 authcode 需 `X-Access-Token` header 传 `71bed0f5...`）| ✅ 插件 `withAuthcodeQuery` + `X-TokenKey` |
| 响应外层 | `{CodeValue, Data62, Debug, ID}` | `{Code, Data, Message, Success, request_id}` | ✅ 插件读 `Code/Data` |
| 登录模型 | `runtime/v08/rqtx.dat` 文件 | `device_ed25519.key + instance_id + Redis session` | ✅ 需重扫码（已登录）|

## 二、⚠️ 已适配的端点（v1.3.64/v1.3.65）

### 1. `/User/GetContractProfile` — method GET→POST (v1.3.64)
- **变化**: 插件旧用 GET（旧容器宽松接受），新容器 GET 返回 **404**，POST + authcode query → Code:0
- **修复**: `src/api-client.ts` `getProfile()` 改 `this.call`（POST），并删除废弃的 `get()` 方法
- **验证**: POST 实测 Code:0

### 2. `/Favor/Del`、`/Favor/GetFavItem`、`/Favor/GetFavInfo` — favId string→number (v1.3.65)
- **变化**: 新旧 swagger `favId` 均 `integer`；插件一直传 `string`，旧容器宽松接受，新容器严格报 `cannot unmarshal string into Go struct field ... of type int32`
- **修复**: `src/send/favorites.ts` `favId: Number(favId)`
- **验证**: 数字 favId 实测 Code:0；字符串报错复现
- **注意**: `/Favor/GetFavInfo` 新 swagger 无 body（忽略 favId），已兼容处理

## 三、✅ 实测兼容、无需改（curl 验证过）

| 端点 | 变化 | 实测结论 |
|---|---|---|
| `/Tools/setproxy` | 旧 `{step}` 新 `{proxy}`(ProxyInfo 对象) | 插件传 `{steps}` → **Code:1**；`proxy` 是新增代理功能，插件步数功能不受影响 |
| `/Webhook/Set` | 旧 `enabledSet/retryCountSet` 新 `enabled/retryCount` | 插件传 `enabled/retryCount` → 新 swagger 正好同名 ✅ |
| `/Msg/Revoke` | `ClientMsgId/NewMsgId` integer→string | 插件传 number **和** string 均 Code:0（新容器宽松）✅ |
| `/Msg/Quote` | 新增字段 | 插件传参实测 Code:0 ✅ |
| `/Msg/SendApp` | `Content/ToIds` → `ToWxid/Type/Xml` | 插件不用它（用 ShareLink）✅ |
| `/Search/Services` | 新 swagger 未列 | GET 实测 HTTP 200（后端隐藏保留）✅ |
| `/FriendCircle/Upload` | 新 `{base64}` | 插件 `{key,base64}` 参数被接受（-1441 是假图片业务错非参数错）✅ |
| `/FriendCircle/MessagesRaw` | 新增 `groupUserList/private`（可选）| 插件传参兼容 ✅ |
| `/User/GetAllOnline` | 插件 POST vs swagger GET | 插件仅 admin 判断用，非真调用 ✅ |
| 删 `wxid` 一批（OfficialAccounts/TenPay/User/Wxapp）| 新 authcode 隐含账号 | 无需传，无害 ✅ |

## 四、ℹ️ 大小写变化（插件已用新风格或无害）

| 端点 | 变化 | 插件实际 | 结论 |
|---|---|---|---|
| `/Favor/Del` | `FavId`→`favId` | 插件已传 `favId` | ✅ 已适配 |
| `/Favor/GetFavItem` | 同上 | 同上 | ✅ |
| `/Favor/Sync` | `Keybuf`→`keybuf` | 插件传 `{}` | ✅ |
| `/SayHello/Modelv1` | `Url/VerifyContent`→`url/verifyContent` | 插件传 `{scene,v1}`（与新旧 swagger 均不符）| ⚠️ 插件自身旧 bug，非版本变化；实测新容器 `[Key:]数据不存在`（业务数据缺失非参数错）|

## 五、未适配的已知问题（待老板决定）

1. **`/SayHello/Modelv1` 插件传参错误**: 插件 `modelv1(scene, v1)` 传 `{scene,v1}`，swagger 期望 `{url, verifyContent}`。但 SayHello 是"打招呼"功能，插件 meta 层定义即如此，需确认实际使用场景后决定是否对齐。

## 六、排查方法论（可复用）

1. grep 插件全部 endpoint 字符串 → 与旧/新 swagger 三方交叉
2. **先排除系统性噪音**: 鉴权 header→authcode + 响应 v0→v1 产生 250+ 假差异
3. 真差异分三类:
   - **method 变化** (GET↔POST) → 真 break
   - **字段真增删** → 看插件是否传废弃字段/漏新增必填
   - **字段大小写** → Go 大小写不敏感无害（但 camelCase 是文档趋势）
4. **字段类型变化** (string↔integer) → **最容易漏的真 break**（Favor 案例）
5. **必须 curl 实测新容器**，不猜（swagger 可能漏列/宽松/严格）
