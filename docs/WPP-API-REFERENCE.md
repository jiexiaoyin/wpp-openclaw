# WeChatPad Pro API 参考文档

> **来源**: vendor 本地 Swagger UI — http://127.0.0.1:8062/swagger.json (容器 `wechatpadpromax08` port 8062)
> **生成**: 自动生成 (重生成: `python3 scripts/gen-api-reference.py`); 人工经验存 `scripts/api-notes.json` + 源码注释
> **统计**: 313 个 endpoint / 17 个 tag
> **实测覆盖**: 源码实现 `send/*.ts` 提取 + api-notes.json 探索笔记

## 目录

- [Search (28)](#search)
- [XiaoWei (21)](#xiaowei)
- [Login (44)](#login)
- [Msg (21)](#msg)
- [Friend (13)](#friend)
- [Finder (19)](#finder)
- [FriendCircle (22)](#friendcircle)
- [Favor (4)](#favor)
- [Group (23)](#group)
- [Label (6)](#label)
- [User (20)](#user)
- [Wxapp (23)](#wxapp)
- [QWContact (3)](#qwcontact)
- [OfficialAccounts (15)](#officialaccounts)
- [SayHello (3)](#sayhello)
- [Tools (18)](#tools)
- [Webhook (6)](#webhook)

---

## 总览

| Tag | 端点数 | 说明 |
|---|---|---|
| Search | 28 | SearchController 微信搜索业务接口。 |
| XiaoWei | 21 | 小微 AI 独立业务接口；本控制器负责用户卡片与截图安全检查。 |
| Login | 44 | 登陆模块 支持二次 唤醒 62数据登陆(注意：代理必须使用SOCKS) |
| Msg | 21 | 消息模块 |
| Friend | 13 | 朋友模块 |
| Finder | 19 | 视频号模块 |
| FriendCircle | 22 | 朋友圈模块 |
| Favor | 4 | 收藏模块 |
| Group | 23 | 群组模块 |
| Label | 6 | 标签模块 |
| User | 20 | 微信号管理模块 |
| Wxapp | 23 | 微信小程序模块 |
| QWContact | 3 | 企业联系人操作 |
| OfficialAccounts | 15 | 公众号模块 |
| SayHello | 3 | 打招呼模块 |
| Tools | 18 | 工具箱模块 |
| Webhook | 6 | WebhookController 管理每个账号（按授权码） 的 webhook 配置 |

---

## Search

> SearchController 微信搜索业务接口。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Search/AI` | 新建 AI 搜索会话 |
| 2 | `GET` | `/Search/AI/Conversation` | 查看 AI 对话历史 |
| 3 | `DELETE` | `/Search/AI/Conversation` | 关闭 AI 对话 |
| 4 | `POST` | `/Search/AI/FollowUp` | 追问 AI 搜索会话 |
| 5 | `POST` | `/Search/All` | 全部综合搜索 |
| 6 | `POST` | `/Search/Articles` | 公众号文章搜索 |
| 7 | `POST` | `/Search/Baike` | 百科搜索 |
| 8 | `POST` | `/Search/Books` | 读书搜索 |
| 9 | `GET` | `/Search/Capabilities` | 查看通用搜索支持的分类 |
| 10 | `POST` | `/Search/Channels` | 视频号内容搜索 |
| 11 | `POST` | `/Search/Channels/Comments` | 获取指定视频号视频的评论 |
| 12 | `POST` | `/Search/Channels/Detail` | 解析指定视频号内容 |
| 13 | `GET` | `/Search/Channels/Media` | 访问视频号封面、播放或下载媒体 |
| 14 | `POST` | `/Search/Channels/ResolveShare` | 解析微信视频号分享链接 |
| 15 | `POST` | `/Search/Emoji` | 表情搜索 |
| 16 | `POST` | `/Search/Gateway` | 兼容搜索入口 |
| 17 | `POST` | `/Search/Images` | 图片搜索 |
| 18 | `POST` | `/Search/Listen` | 听一听搜索 |
| 19 | `POST` | `/Search/Live` | 直播搜索 |
| 20 | `POST` | `/Search/MiniGames` | 小游戏搜索 |
| 21 | `POST` | `/Search/MiniPrograms` | 小程序搜索 |
| 22 | `POST` | `/Search/Moments` | 朋友圈搜索 |
| 23 | `POST` | `/Search/News` | 新闻搜索 |
| 24 | `POST` | `/Search/OfficialAccounts` | 公众号与账号搜索 |
| 25 | `POST` | `/Search/Query` | 通用分类搜索 |
| 26 | `POST` | `/Search/Stickers` | 贴图搜索 |
| 27 | `POST` | `/Search/Underlines` | 划线搜索 |
| 28 | `POST` | `/Search/WeChatIndex` | 微信指数搜索 |

### POST /Search/AI

**说明**: 新建 AI 搜索会话

发起首个问题，服务端在同一上游任务内自动重试未完成的答案流并保存会话上下文。仅当 completed=true 且 status=completed 时表示正文完整；partial 可展示但不应视为完整答案。响应的 session_id 用于 FollowUp 追问；轮次由服务端维护，客户端不需传 turn。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.AIRequestDoc; {`model`:string, `query*`:string}` | 新建 AI 对话；请求示例：{&quot;model&quot;:&quot;default&quot;,&quot;query&quot;:&quot;深圳有哪些值得关注的科技公司&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | AI 首问成功；响应示例：{"Code":0,"Data":{"answer":"深圳值得关注的科技公司可从人工智能、新能源与智能硬件等方向关注。","available":true,"completed":true,"conversation_id":"CONVERSATION_ID","message":"AI 搜索结果已生成","model":"default","query":"深圳有哪些值得关注的科技公司","references":[{"title":"示例科技：深圳科技产业观察","url":"https://mp.weixin.qq.com/s/ARTICLE_ID"}],"related_questions":["深圳人工智能产业链有哪些代表公司？"],"search_id":"SEARCH_ID","session_id":"SESSION_ID","status":"completed","turn":0},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `Search.AIResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/AI — AI 搜索 (Search.AIRequest: model/query/session_id/turn)`

---

### GET /Search/AI/Conversation

**说明**: 查看 AI 对话历史

返回当前授权账号下指定会话的问答轮次、Markdown 答案、参考资料和建议追问。会话与账号绑定，保留 24 小时。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| query | `session_id` | ✅ | `string` | 会话标识 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询成功；响应示例：{"Code":0,"Data":{"created_at":1786910400,"model":"default","next_turn":2,"session_id":"SESSION_ID","status":"completed","total_turns":2,"turns":[{"answer":"首问答案","client_message_id":"question-001","completed":true,"created_at":1786910400,"query":"深圳有哪些值得关注的科技公司","references":[],"related_questions":[],"status":"completed","turn":0},{"answer":"追问答案","client_message_id":"question-002","completed":true,"created_at":1786910460,"query":"其中哪些更值得长期关注？","references":[],"related_questions":[],"status":"completed","turn":1}],"updated_at":1786910460},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `Search.AIConversationResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/AI/Conversation — 获取 AI 搜索会话 (v1.3.67 GET; session_id)`

---

### DELETE /Search/AI/Conversation

**说明**: 关闭 AI 对话

删除当前授权账号下指定的 AI 对话上下文，适用于用户主动结束对话。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| query | `session_id` | ✅ | `string` | 会话标识 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 关闭成功；响应示例：{"Code":0,"Data":{"model":"default","next_turn":2,"session_id":"SESSION_ID","status":"closed","total_turns":2,"turns":[]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `Search.AIConversationResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/AI/Conversation — 获取 AI 搜索会话 (v1.3.67 GET; session_id)`

---

### POST /Search/AI/FollowUp

**说明**: 追问 AI 搜索会话

使用首问返回的 session_id 继续追问。服务端自动读取首问、上一轮搜索标识并递增轮次；同一 client_message_id 重试时直接返回已有结果。客户端应在上一轮 completed=true 后再追问。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.AIFollowUpRequestDoc; {`client_message_id`:string, `query*`:string, `session_id*`:string}` | 继续已有 AI 对话；请求示例：{&quot;client_message_id&quot;:&quot;question-002&quot;,&quot;query&quot;:&quot;其中哪些更值得长期关注？&quot;,&quot;session_id&quot;:&quot;SESSION_ID&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | AI 追问成功；响应示例：{"Code":0,"Data":{"answer":"可结合研发投入、业务增长与产业链位置持续观察。","available":true,"completed":true,"message":"AI 搜索结果已生成","model":"default","query":"其中哪些更值得长期关注？","references":[],"related_questions":["这些公司的核心竞争力是什么？"],"session_id":"SESSION_ID","status":"completed","turn":1},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `Search.AIResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/AI/FollowUp — AI 搜索追问 (v1.3.67; 用首问 session_id 继续)`

---

### POST /Search/All

**说明**: 全部综合搜索

搜索多种内容类型，每条结果通过 result_type 标识类型。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 全部综合搜索成功；响应示例：{"Code":0,"Data":{"category":"all","count":1,"has_more":false,"items":[{"result_type":"article","title":"示例文章","url":"https://mp.weixin.qq.com/s/ARTICLE_ID"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/All — 综合`

---

### POST /Search/Articles

**说明**: 公众号文章搜索

搜索公众号文章，返回标题、摘要、来源和文章地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 公众号文章搜索成功；响应示例：{"Code":0,"Data":{"category":"article","count":1,"has_more":false,"items":[{"description":"示例摘要","result_type":"article","source_name":"示例公众号","title":"示例文章","url":"https://mp.weixin.qq.com/s/ARTICLE_ID"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Articles — 公众号文章`

---

### POST /Search/Baike

**说明**: 百科搜索

搜索百科内容，返回词条名称、摘要和详情地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 百科搜索成功；响应示例：{"Code":0,"Data":{"category":"baike","count":1,"has_more":false,"items":[{"description":"示例词条摘要","result_type":"baike","title":"示例词条","url":"https://example.com/baike"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Baike — 百科`

---

### POST /Search/Books

**说明**: 读书搜索

搜索微信读书相关内容，返回书名、作者和详情地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 读书搜索成功；响应示例：{"Code":0,"Data":{"category":"read","count":1,"has_more":false,"items":[{"description":"示例作者","doc_id":"BOOK_ID","result_type":"read","title":"示例图书","url":"https://example.com/book"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Books — 读书`

---

### GET /Search/Capabilities

**说明**: 查看通用搜索支持的分类

返回 Query 可填写的业务分类与中文名称，用于客户端生成分类选项。固定类型搜索可直接使用对应独立接口。

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查看搜索分类成功；响应示例：{"Code":0,"Data":{"ai_models":[{"display_name":"默认模型","name":"default","recommended":true}],"categories":[{"display_name":"综合","name":"all"},{"display_name":"公众号文章","name":"article"}],"count":2},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Capabilities — GET 查看通用搜索支持的分类`

---

### POST /Search/Channels

**说明**: 视频号内容搜索

搜索视频号内容。响应只保留业务元数据、分页状态以及可直接访问的 thumbnail_url、play_url、download_url；content_token 用于详情，comment_token 用于评论。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 视频号内容搜索成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"comment_count":18,"comment_token":"cmt_COMMENT_TOKEN","content_token":"cnt_CONTENT_TOKEN","creator_name":"示例视频号","download_url":"http://127.0.0.1:8062/api/Search/Channels/Media?download=1%26media_token=med_VIDEO_TOKEN","downloadable":true,"duration_seconds":90,"play_url":"http://127.0.0.1:8062/api/Search/Channels/Media?media_token=med_VIDEO_TOKEN","published_at":1786233765,"thumbnail_url":"http://127.0.0.1:8062/api/Search/Channels/Media?media_token=med_THUMB_TOKEN","title":"示例视频文案","video_size_bytes":10485760}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `Search.ChannelSearchResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Channels — 视频号内容`

---

### POST /Search/Channels/Comments

**说明**: 获取指定视频号视频的评论

comment_token 来自 Channels 搜索结果。首页只传 comment_token；继续翻页传回 next_cursor；读取某条一级评论的回复时再传 root_comment_id 和该条评论的 replies_cursor。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.ChannelCommentsRequestDoc; {`comment_token*`:string, `cursor`:string, `root_comment_id`:string}` | 指定视频评论；请求示例：{&quot;comment_token&quot;:&quot;cmt_COMMENT_TOKEN&quot;,&quot;cursor&quot;:&quot;&quot;,&quot;root_comment_id&quot;:&quot;&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取评论成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":true,"items":[{"author_name":"示例用户","comment_id":"14888258272036065872","content":"这个视频介绍得很清楚","created_at":1786267822,"like_count":3,"liked":false,"replies":[{"author_name":"回复用户","comment_id":"14888337683010820522","content":"同感","reply_comment_id":"14888258272036065872"}],"replies_cursor":"REPLIES_CURSOR","replies_has_more":true,"reply_count":2}],"next_cursor":"NEXT_CURSOR","total_count":18,"video":{"creator_name":"示例视频号","title":"示例视频标题"}},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `Search.ChannelCommentsResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Channels/Comments — 视频号评论列表 (v1.3.67; comment_token 来自搜索结果, cursor 翻页, root_comment_id 看一级评论回复)`

---

### POST /Search/Channels/Detail

**说明**: 解析指定视频号内容

content_token 来自 Channels 搜索结果。original_url/original_download_url 保留加密原始地址，play_url/download_url 为同一详情快照生成的可播放标准 MP4 网关地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.ChannelContentRequestDoc; {`content_token*`:string}` | 已实测成功的请求结构；content_token 从 Channels 搜索结果取得；请求示例：{&quot;content_token&quot;:&quot;cnt_CONTENT_TOKEN&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 内容解析成功；以下结构已按 2026-08-17 端到端实测成功字段整理，示例中的账号和令牌均为文档占位值；响应示例：{"Code":0,"Data":{"caption":"示例视频完整文案 #深圳科技","comment_count":4,"comment_token":"cmt_COMMENT_TOKEN","comment_token_expires_at":1786950400,"creator":{"avatar_url":"https://example.com/avatar.jpg","creator_id":"finder_creator","creator_name":"示例视频号"},"created_at":1774778625,"description":"示例视频完整文案 #深圳科技","download_count":1,"forward_count":427,"like_count":81,"media":[{"bitrate":1213440,"codec":"h264","download_url":"http://127.0.0.1:8062/api/Search/Channels/Media?download=1%26media_token=med_VIDEO_TOKEN","download_url_expires_at":1786948328,"downloadable":true,"duration_seconds":292,"file_format":"xWT112","file_size_bytes":47145705,"height":1024,"index":0,"media_type":"video","original_download_url":"https://finder.video.qq.com/video.mp4?token=SIGNED_TOKEN","original_url":"https://finder.video.qq.com/video.mp4?token=SIGNED_TOKEN","play_url":"http://127.0.0.1:8062/api/Search/Channels/Media?media_token=med_VIDEO_TOKEN","thumbnail_url":"http://127.0.0.1:8062/api/Search/Channels/Media?media_token=med_THUMB_TOKEN","thumbnail_url_expires_at":1786948328,"width":576}],"media_count":1,"title":"示例视频完整文案 #深圳科技"},"Message":"成功","Success":true,"request_id":"request-00000001"} | `Search.ChannelContentResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Channels/Detail — 视频号内容详情 (v1.3.67; content_token 来自 Channels 搜索结果)`

---

### GET /Search/Channels/Media

**说明**: 访问视频号封面、播放或下载媒体

media_token 来自 Channels、Channels/Detail 或 Channels/ResolveShare。视频会流式转换为标准 MP4，支持浏览器播放和 Range；download=1 时返回附件下载响应。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `media_token` | ✅ | `string` | 短期媒体凭据 |
| query | `download` | — | `string` | 1 表示下载文件；0 表示浏览器预览或播放 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | {string} binary 媒体字节响应；响应示例：Content-Type=image/jpeg 或 video/mp4 | `` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Channels/Media — 视频号媒体流 (v1.3.67 GET; media_token + download=1 下载/0 预览)`

---

### POST /Search/Channels/ResolveShare

**说明**: 解析微信视频号分享链接

支持微信中复制的 weixin.qq.com/sph/... 分享链接。响应只保留可直接使用的业务字段；media[].play_url 支持浏览器播放和 Range，media[].download_url 用于附件下载。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.ChannelShareRequestDoc; {`url*`:string}` | 视频号分享链接；请求示例：{&quot;url&quot;:&quot;https://weixin.qq.com/sph/AHgYuf2Eaj&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 分享链接解析成功；响应示例：{"Code":0,"Data":{"canonical_url":"https://channels.weixin.qq.com/finder-preview/pages/sph?id=AHgYuf2Eaj","caption":"示例视频完整文案","creator":{"creator_name":"示例视频号"},"detail_available":true,"media":[{"media_type":"video","play_url":"http://127.0.0.1:8062/api/Search/Channels/Media?media_token=med_VIDEO_TOKEN","download_url":"http://127.0.0.1:8062/api/Search/Channels/Media?download=1%26media_token=med_VIDEO_TOKEN","downloadable":true}]},"Message":"成功","Success":true,"request_id":"request-00000001"} | `Search.ChannelShareResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Channels/ResolveShare — 解析视频号分享链接 (v1.3.67; url=weixin.qq.com/sph/... 分享链接)`

---

### POST /Search/Emoji

**说明**: 表情搜索

搜索表情内容，返回预览图和资源地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 表情搜索成功；响应示例：{"Code":0,"Data":{"category":"emoji","count":1,"has_more":false,"items":[{"doc_id":"EMOJI_ID","result_type":"emoji","thumbnail_url":"https://example.com/emoji-preview.gif","url":"https://example.com/emoji.gif"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Emoji — 表情`

---

### POST /Search/Gateway

**说明**: 兼容搜索入口

保留给旧版 Gateway 调用方的兼容入口。新业务按内容类型使用 Articles、OfficialAccounts、Channels、MiniPrograms、Moments 或 AI。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.GatewayRequestDoc; {`query*`:string}` | 搜索关键词；请求示例：{&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 兼容搜索成功；响应示例：{"Code":0,"Data":{"count":1,"items":[{"source":"mp.weixin.qq.com","url":"https://mp.weixin.qq.com/s/ARTICLE_ID"}],"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Gateway — 兼容旧版搜一搜网页网关`

---

### POST /Search/Images

**说明**: 图片搜索

搜索图片内容，返回标题、缩略图和原图地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 图片搜索成功；响应示例：{"Code":0,"Data":{"category":"image","count":1,"has_more":false,"items":[{"result_type":"image","thumbnail_url":"https://example.com/thumb.jpg","title":"示例图片","url":"https://example.com/image.jpg"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Images — 图片`

---

### POST /Search/Listen

**说明**: 听一听搜索

搜索音频内容，返回标题、来源、时长和音频地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 听一听搜索成功；响应示例：{"Code":0,"Data":{"category":"listen","count":1,"has_more":false,"items":[{"duration_seconds":180,"result_type":"listen","source_name":"示例节目","title":"示例音频","url":"https://example.com/audio.mp3"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Listen — 听一听`

---

### POST /Search/Live

**说明**: 直播搜索

搜索直播内容，返回主播、标题和直播状态。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 直播搜索成功；响应示例：{"Code":0,"Data":{"category":"live","count":1,"has_more":false,"items":[{"account_name":"示例主播","description":"直播中","result_type":"live","title":"示例直播"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Live — 直播`

---

### POST /Search/MiniGames

**说明**: 小游戏搜索

搜索小游戏，返回应用标识、名称和图标。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 小游戏搜索成功；响应示例：{"Code":0,"Data":{"category":"mini_game","count":1,"has_more":false,"items":[{"appid":"GAME_APP_ID","result_type":"mini_game","thumbnail_url":"https://example.com/game.png","title":"示例小游戏"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/MiniGames — 小游戏`

---

### POST /Search/MiniPrograms

**说明**: 小程序搜索

搜索小程序，返回应用标识、名称、账号和图标。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 小程序搜索成功；响应示例：{"Code":0,"Data":{"category":"mini_program","count":1,"has_more":false,"items":[{"appid":"APP_ID","result_type":"mini_program","thumbnail_url":"https://example.com/icon.png","title":"示例小程序","username":"gh_example@app"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/MiniPrograms — 小程序`

---

### POST /Search/Moments

**说明**: 朋友圈搜索

搜索当前账号可检索的朋友圈内容，返回正文、时间和媒体列表。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈搜索成功；响应示例：{"Code":0,"Data":{"category":"moments","count":1,"has_more":false,"items":[{"description":"示例朋友圈正文","media":[{"media_url":"https://example.com/image.jpg","type":1}],"result_type":"moments","timestamp":1786939200}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Moments — 朋友圈`

---

### POST /Search/News

**说明**: 新闻搜索

搜索新闻内容，返回标题、来源、发布时间和详情地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 新闻搜索成功；响应示例：{"Code":0,"Data":{"category":"news","count":1,"has_more":false,"items":[{"result_type":"news","source_name":"示例媒体","source_time":"2026-08-17 12:00","title":"示例新闻","url":"https://example.com/news"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/News — 新闻`

---

### POST /Search/OfficialAccounts

**说明**: 公众号与账号搜索

搜索公众号及相关账号，返回账号名称、微信号和认证状态。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 公众号与账号搜索成功；响应示例：{"Code":0,"Data":{"category":"official_account","count":1,"has_more":false,"items":[{"account":{"verified":true},"account_id":"ACCOUNT_ID","account_name":"示例公众号","result_type":"official_account","wechat_id":"example_account"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/OfficialAccounts — 公众号与账号`

---

### POST /Search/Query

**说明**: 通用分类搜索

给需要动态指定 category 的调用方使用，一套接口支持 all、article、official_account、channels、mini_program、moments 等分类。已有明确业务类型时优先调用对应独立接口。首页 offset=0；续页原样传回上一页的 search_id、cursor，并使用 next_offset。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.QueryRequestDoc; {`category*`:string, `cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页只传 category、query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;category&quot;:&quot;all&quot;,&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 通用分类搜索成功；响应示例：{"Code":0,"Data":{"category":"all","count":1,"has_more":false,"items":[{"result_type":"article","title":"示例文章","url":"https://mp.weixin.qq.com/s/ARTICLE_ID"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Query — 通用分类搜索`

---

### POST /Search/Stickers

**说明**: 贴图搜索

搜索贴图内容，返回预览图和资源地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 贴图搜索成功；响应示例：{"Code":0,"Data":{"category":"sticker","count":1,"has_more":false,"items":[{"doc_id":"STICKER_ID","result_type":"sticker","thumbnail_url":"https://example.com/sticker-preview.png","url":"https://example.com/sticker.png"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Stickers — 贴图`

---

### POST /Search/Underlines

**说明**: 划线搜索

搜索已保存的划线内容，返回文本、来源和时间。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 划线搜索成功；响应示例：{"Code":0,"Data":{"category":"underline","count":1,"has_more":false,"items":[{"description":"示例划线内容","result_type":"underline","source_name":"示例文章","source_time":"2026-08-17","title":"划线片段"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/Underlines — 划线`

---

### POST /Search/WeChatIndex

**说明**: 微信指数搜索

查询关键词的微信指数相关结果。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Search.VerticalRequestDoc; {`cursor`:string, `limit`:integer, `offset`:integer, `query*`:string, `search_id`:string}` | 首页传 query、offset=0 和 limit；续页再传回上页的 search_id、cursor 并使用 next_offset；请求示例：{&quot;limit&quot;:10,&quot;offset&quot;:0,&quot;query&quot;:&quot;深圳科技&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 微信指数搜索成功；响应示例：{"Code":0,"Data":{"category":"wechat_index","count":1,"has_more":false,"items":[{"description":"指数 12345","result_type":"wechat_index","source_time":"2026-08-17","title":"深圳科技"}],"next_offset":10,"query":"深圳科技"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — search.ts: `/Search/WeChatIndex — 微信指数`

---

## XiaoWei

> 小微 AI 独立业务接口；本控制器负责用户卡片与截图安全检查。

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/XiaoWei/Cards/ScreenshotSecurityCheck` | 小微卡片截图安全检查 |
| 2 | `POST` | `/XiaoWei/Cards/Users` | 分页获取小微用户卡片 |
| 3 | `POST` | `/XiaoWei/Chat/Sessions` | 创建小微实时对话会话 |
| 4 | `GET` | `/XiaoWei/Chat/Sessions/{session_id}` | 查询小微实时对话会话 |
| 5 | `DELETE` | `/XiaoWei/Chat/Sessions/{session_id}` | 销毁小微实时对话会话 |
| 6 | `POST` | `/XiaoWei/Chat/Sessions/{session_id}/Cancel` | 取消当前小微回答 |
| 7 | `GET` | `/XiaoWei/Chat/Sessions/{session_id}/Events` | 订阅小微对话事件流 |
| 8 | `POST` | `/XiaoWei/Chat/Sessions/{session_id}/Messages` | 发送小微对话消息 |
| 9 | `POST` | `/XiaoWei/Chat/Sessions/{session_id}/Regenerate` | 重新生成小微回答 |
| 10 | `POST` | `/XiaoWei/Chat/Sessions/{session_id}/SwitchRoom` | 切换小微会话房间 |
| 11 | `POST` | `/XiaoWei/Conversations/A2A/List` | 获取小微 A2A 会话列表 |
| 12 | `POST` | `/XiaoWei/Conversations/Suggestions` | 获取小微半屏推荐提示词 |
| 13 | `POST` | `/XiaoWei/History/Delete` | 删除小微聊天历史及关联记忆 |
| 14 | `POST` | `/XiaoWei/History/Fill` | 补录小微用户历史 |
| 15 | `POST` | `/XiaoWei/History/List` | 分页获取小微聊天历史 |
| 16 | `POST` | `/XiaoWei/Invites` | 邀请好友体验小微 |
| 17 | `GET` | `/XiaoWei/Invites/Candidates` | 获取可邀请好友列表 |
| 18 | `GET` | `/XiaoWei/Invites/Info` | 查询小微邀请额度 |
| 19 | `GET` | `/XiaoWei/Permission` | 查询小微使用资格 |
| 20 | `POST` | `/XiaoWei/RedDots/Query` | 查询小微入口红点 |
| 21 | `POST` | `/XiaoWei/RedDots/Read` | 标记小微红点已读 |

### POST /XiaoWei/Cards/ScreenshotSecurityCheck

**说明**: 小微卡片截图安全检查

message_id 和 app_id 必填；media 可包含文件标识、媒体类型和图片地址。成功时返回空业务数据对象。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `XiaoWei.CardScreenshotSecurityCheckRequest; {`app_id*`:string, `media`:array<XiaoWei.CardScreenshotMediaRequest>, `message_id*`:string, `trace_message_id`:string}` | 卡片及媒体参数；请求示例：{&quot;app_id&quot;:&quot;wx1234567890abcdef&quot;,&quot;media&quot;:[{&quot;aes_key&quot;:&quot;AES_KEY&quot;,&quot;app_type&quot;:1,&quot;file_id&quot;:&quot;ID_10001&quot;,&quot;file_type&quot;:1,&quot;image_url&quot;:&quot;https://example.com/resource&quot;,&quot;msg_type&quot;:&quot;text&quot;}],&quot;message_id&quot;:&quot;message-10001&quot;,&quot;trace_message_id&quot;:&quot;示例内容&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 小微卡片截图安全检查成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Message":"成功","Success":true} | `XiaoWei.CardScreenshotSecurityCheckResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/Cards/ScreenshotSecurityCheck — 截屏安全校验 (message_id + app_id 必填)`

---

### POST /XiaoWei/Cards/Users

**说明**: 分页获取小微用户卡片

page_context 为分页上下文，card_type 为卡片类型；响应包含卡片内容、对话 ID 和气泡定位信息。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `XiaoWei.GetUserCardListRequest; {`card_type`:integer, `page_context`:XiaoWei.PageContextRequest}` | 用户卡片分页参数；请求示例：{&quot;card_type&quot;:0,&quot;page_context&quot;:{&quot;has_more&quot;:true,&quot;limit_count&quot;:20,&quot;offset&quot;:1,&quot;time_cursor&quot;:1786930800}} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 分页获取小微用户卡片成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"page_context":{"has_more":false,"limit_count":20,"offset":20,"time_cursor":1785686300},"user_card_list":[{"dialogue_id":"1001"}]},"Message":"成功","Success":true} | `XiaoWei.GetUserCardListResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/Cards/Users — 卡片用户列表 (card_type 卡片类型)`

---

### POST /XiaoWei/Chat/Sessions

**说明**: 创建小微实时对话会话

创建账号绑定的实时会话。成功后使用 events_url 订阅 SSE，再调用 Messages 发送问题；账号和原生标识由服务端注入。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 兼容授权码参数 |
| body | `body` | ✅ | `XiaoWei.CreateChatSessionRequest; {`client_request_id`:string, `is_dart`:boolean, `open_scene`:integer, `room_id`:string, `welcome_text`:string}` | 会话场景、房间和欢迎语；请求示例：{&quot;client_request_id&quot;:&quot;chat-session-001&quot;,&quot;is_dart&quot;:false,&quot;open_scene&quot;:1,&quot;room_id&quot;:&quot;ROOM_ID&quot;,&quot;welcome_text&quot;:&quot;你好，小微&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 创建小微实时对话会话成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"events_url":"/api/XiaoWei/Chat/Sessions/SESSION_ID/Events","session":{"created_at":"2026-08-15T08:00:00+08:00","current_message_id":"MESSAGE_ID","driver_ready":true,"last_sequence":2,"open_scene":1,"room_id":"ROOM_ID","session_id":"SESSION_ID","state":"starting","updated_at":"2026-08-15T08:00:01+08:00"}},"Message":"成功","Success":true} | `XiaoWei.CreateChatSessionResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/Chat/Sessions — 创建小微实时会话 (返回 events_url 供订阅 SSE)`

---

### GET /XiaoWei/Chat/Sessions/{session_id}

**说明**: 查询小微实时对话会话

返回当前状态、当前消息、房间和最后事件序号；会话只允许创建它的账号访问。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 兼容授权码参数 |
| path | `session_id` | ✅ | `string` | 会话 ID |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询小微实时对话会话成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"created_at":"2026-08-15T08:00:00+08:00","current_message_id":"MESSAGE_ID","driver_ready":true,"last_sequence":2,"open_scene":1,"room_id":"ROOM_ID","session_id":"SESSION_ID","state":"starting","updated_at":"2026-08-15T08:00:01+08:00"},"Message":"成功","Success":true} | `XiaoWei.ChatSessionResponseDoc` |

---

### DELETE /XiaoWei/Chat/Sessions/{session_id}

**说明**: 销毁小微实时对话会话

先通知对话驱动销毁远端会话，再关闭本地事件流；重复销毁返回当前 closed 状态。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 兼容授权码参数 |
| path | `session_id` | ✅ | `string` | 会话 ID |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 销毁小微实时对话会话成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"event":{"card":{"type":1,"xml":"\u003cmsg\u003e\u003ctitle\u003e示例内容\u003c/title\u003e\u003c/msg\u003e"},"event_id":"EVENT_ID","final":false,"message_id":"MESSAGE_ID","occurred_at":"2026-08-15T08:00:00+08:00","question":"是否继续？","recommendations":["继续说明"],"room":{"member_wxids":["wxid_example"],"room_id":"ROOM_ID"},"sequence":3,"session_id":"SESSION_ID","source":"assistant","text":"正在生成的回答"},"session":{"created_at":"2026-08-15T08:00:00+08:00","current_message_id":"MESSAGE_ID","driver_ready":true,"last_sequence":2,"open_scene":1,"room_id":"ROOM_ID","session_id":"SESSION_ID","state":"starting","updated_at":"2026-08-15T08:00:01+08:00"}},"Message":"成功","Success":true} | `XiaoWei.ChatOperationResponseDoc` |

---

### POST /XiaoWei/Chat/Sessions/{session_id}/Cancel

**说明**: 取消当前小微回答

取消当前 responding 状态的回答；成功后事件流返回 cancelled，会话恢复 ready。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 兼容授权码参数 |
| path | `session_id` | ✅ | `string` | 会话 ID |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 取消当前小微回答成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"event":{"card":{"type":1,"xml":"\u003cmsg\u003e\u003ctitle\u003e示例内容\u003c/title\u003e\u003c/msg\u003e"},"event_id":"EVENT_ID","final":false,"message_id":"MESSAGE_ID","occurred_at":"2026-08-15T08:00:00+08:00","question":"是否继续？","recommendations":["继续说明"],"room":{"member_wxids":["wxid_example"],"room_id":"ROOM_ID"},"sequence":3,"session_id":"SESSION_ID","source":"assistant","text":"正在生成的回答"},"session":{"created_at":"2026-08-15T08:00:00+08:00","current_message_id":"MESSAGE_ID","driver_ready":true,"last_sequence":2,"open_scene":1,"room_id":"ROOM_ID","session_id":"SESSION_ID","state":"starting","updated_at":"2026-08-15T08:00:01+08:00"}},"Message":"成功","Success":true} | `XiaoWei.ChatOperationResponseDoc` |

---

### GET /XiaoWei/Chat/Sessions/{session_id}/Events

**说明**: 订阅小微对话事件流

返回 text/event-stream。after_sequence 用于断线续传；事件包括 text.delta、message、card、tool.call、completed、cancelled 和 error。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 兼容授权码参数 |
| path | `session_id` | ✅ | `string` | 会话 ID |
| query | `after_sequence` | — | `integer` | 仅返回该序号之后的事件 |
| header | `Last-Event-ID` | — | `integer` | SSE 自动重连携带的最后事件序号 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | {string} string SSE 响应示例：data: {\"type\":\"text.delta\",\"text\":\"示例内容\"} | `` |

---

### POST /XiaoWei/Chat/Sessions/{session_id}/Messages

**说明**: 发送小微对话消息

text 必填；context 可传文章、链接、图片、文件等业务引用。请求被接受后，回答通过 Events 流返回。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 兼容授权码参数 |
| path | `session_id` | ✅ | `string` | 会话 ID |
| body | `body` | ✅ | `XiaoWei.SendChatMessageRequest; {`client_message_id`:string, `context`:array<XiaoWei.ChatContextItem>, `reply_to_message_id`:string, `text`:string}` | 文本、回复目标和上下文；请求示例：{&quot;client_message_id&quot;:&quot;message-001&quot;,&quot;context&quot;:[{&quot;file_id&quot;:&quot;FILE_ID&quot;,&quot;id&quot;:&quot;CONTENT_ID&quot;,&quot;text&quot;:&quot;需要小微理解的正文&quot;,&quot;title&quot;:&quot;内容标题&quot;,&quot;type&quot;:&quot;article&quot;,&quot;url&quot;:&quot;https://HOST/content&quot;}],&quot;reply_to_message_id&quot;:&quot;MESSAGE_ID&quot;,&quot;text&quot;:&quot;请总结这段内容&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送小微对话消息成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"event":{"card":{"type":1,"xml":"\u003cmsg\u003e\u003ctitle\u003e示例内容\u003c/title\u003e\u003c/msg\u003e"},"event_id":"EVENT_ID","final":false,"message_id":"MESSAGE_ID","occurred_at":"2026-08-15T08:00:00+08:00","question":"是否继续？","recommendations":["继续说明"],"room":{"member_wxids":["wxid_example"],"room_id":"ROOM_ID"},"sequence":3,"session_id":"SESSION_ID","source":"assistant","text":"正在生成的回答"},"session":{"created_at":"2026-08-15T08:00:00+08:00","current_message_id":"MESSAGE_ID","driver_ready":true,"last_sequence":2,"open_scene":1,"room_id":"ROOM_ID","session_id":"SESSION_ID","state":"starting","updated_at":"2026-08-15T08:00:01+08:00"}},"Message":"成功","Success":true} | `XiaoWei.ChatOperationResponseDoc` |

---

### POST /XiaoWei/Chat/Sessions/{session_id}/Regenerate

**说明**: 重新生成小微回答

message_id 为需要重新生成的回答消息 ID；新内容继续通过 Events 流返回。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 兼容授权码参数 |
| path | `session_id` | ✅ | `string` | 会话 ID |
| body | `body` | ✅ | `XiaoWei.RegenerateChatMessageRequest; {`message_id`:string}` | 待重新生成的消息 ID；请求示例：{&quot;message_id&quot;:&quot;MESSAGE_ID&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 重新生成小微回答成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"event":{"card":{"type":1,"xml":"\u003cmsg\u003e\u003ctitle\u003e示例内容\u003c/title\u003e\u003c/msg\u003e"},"event_id":"EVENT_ID","final":false,"message_id":"MESSAGE_ID","occurred_at":"2026-08-15T08:00:00+08:00","question":"是否继续？","recommendations":["继续说明"],"room":{"member_wxids":["wxid_example"],"room_id":"ROOM_ID"},"sequence":3,"session_id":"SESSION_ID","source":"assistant","text":"正在生成的回答"},"session":{"created_at":"2026-08-15T08:00:00+08:00","current_message_id":"MESSAGE_ID","driver_ready":true,"last_sequence":2,"open_scene":1,"room_id":"ROOM_ID","session_id":"SESSION_ID","state":"starting","updated_at":"2026-08-15T08:00:01+08:00"}},"Message":"成功","Success":true} | `XiaoWei.ChatOperationResponseDoc` |

---

### POST /XiaoWei/Chat/Sessions/{session_id}/SwitchRoom

**说明**: 切换小微会话房间

会话 ready 时切换到 room_id；成功后事件流返回 room.changed。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 兼容授权码参数 |
| path | `session_id` | ✅ | `string` | 会话 ID |
| body | `body` | ✅ | `XiaoWei.SwitchChatRoomRequest; {`room_id`:string}` | 目标房间 ID；请求示例：{&quot;room_id&quot;:&quot;ROOM_ID&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 切换小微会话房间成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"event":{"card":{"type":1,"xml":"\u003cmsg\u003e\u003ctitle\u003e示例内容\u003c/title\u003e\u003c/msg\u003e"},"event_id":"EVENT_ID","final":false,"message_id":"MESSAGE_ID","occurred_at":"2026-08-15T08:00:00+08:00","question":"是否继续？","recommendations":["继续说明"],"room":{"member_wxids":["wxid_example"],"room_id":"ROOM_ID"},"sequence":3,"session_id":"SESSION_ID","source":"assistant","text":"正在生成的回答"},"session":{"created_at":"2026-08-15T08:00:00+08:00","current_message_id":"MESSAGE_ID","driver_ready":true,"last_sequence":2,"open_scene":1,"room_id":"ROOM_ID","session_id":"SESSION_ID","state":"starting","updated_at":"2026-08-15T08:00:01+08:00"}},"Message":"成功","Success":true} | `XiaoWei.ChatOperationResponseDoc` |

---

### POST /XiaoWei/Conversations/A2A/List

**说明**: 获取小微 A2A 会话列表

首页 page_context 留空；续页原样传回响应中的 page_context；limit 为单次获取数量。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `XiaoWei.GetA2AChatListRequest; {`limit`:integer, `page_context`:string}` | 业务请求参数；请求示例：{&quot;limit&quot;:20,&quot;page_context&quot;:&quot;示例内容&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取小微 A2A 会话列表成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"chat_list":[{"target_username":"wxid_target","text":"最近一条消息","update_time_ms":1785686400000}],"has_more":true,"page_context":"NEXT_PAGE_TOKEN"},"Message":"成功","Success":true} | `XiaoWei.GetA2AChatListResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/Conversations/A2A/List — 多智能体对话列表`

---

### POST /XiaoWei/Conversations/Suggestions

**说明**: 获取小微半屏推荐提示词

ui_state 为当前半屏界面状态，share_type 为内容分享来源类型；响应返回推荐提示词和默认提示词。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `XiaoWei.GetHalfScreenSuggestionsRequest; {`share_type*`:integer, `ui_state*`:integer}` | 业务请求参数；请求示例：{&quot;share_type&quot;:0,&quot;ui_state&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取小微半屏推荐提示词成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"suggestions":[{"default_suggestion":"帮我总结","share_type":0,"suggestions":["帮我生成执行步骤"],"ui_state":1}]},"Message":"成功","Success":true} | `XiaoWei.GetSuggestionsResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/Conversations/Suggestions — 获取推荐提示词`

---

### POST /XiaoWei/History/Delete

**说明**: 删除小微聊天历史及关联记忆

delete_item_lists 按会话分组；每个 items 条目可携带问题、回答、已勾选和未勾选的记忆 ID。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `XiaoWei.DeleteXiaoweiChatHistoryRequest; {`delete_item_lists`:array<XiaoWei.DeleteHistoryItemListRequest>}` | 待删除记录；请求示例：{&quot;delete_item_lists&quot;:[{&quot;items&quot;:[{&quot;answers&quot;:[&quot;示例答案&quot;],&quot;checked_ids&quot;:[&quot;ID_10001&quot;],&quot;dialogue_id&quot;:&quot;ID_10001&quot;,&quot;query&quot;:&quot;示例问题&quot;,&quot;timestamp&quot;:1786930800,&quot;trace_id&quot;:&quot;trace_from_history&quot;,&quot;unchecked_ids&quot;:[&quot;ID_10001&quot;]}]}]} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 删除小微聊天历史及关联记忆成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"ret":0},"Message":"成功","Success":true} | `XiaoWei.DeleteChatHistoryResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/History/Delete — 删除记忆 (delete_item_lists 按会话分组)`

---

### POST /XiaoWei/History/Fill

**说明**: 补录小微用户历史

items 为需要补录的问答卡片；普通调用只需提交结构化卡片内容。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `XiaoWei.BuluUserHistoryRequestDoc; {`items`:array<XiaoWei.BuluHistoryItemRequestDoc>, `operation_type*`:integer, `test`:boolean}` | 补录历史参数；请求示例：{&quot;items&quot;:[{&quot;answer_cards&quot;:[{&quot;interactive_card_json&quot;:&quot;{\&quot;title\&quot;:\&quot;示例卡片\&quot;}&quot;,&quot;type&quot;:1,&quot;xml&quot;:&quot;\u003cmsg\u003e\u003ctitle\u003e示例卡片\u003c/title\u003e\u003c/msg\u003e&quot;}],&quot;dialogue_id&quot;:1001,&quot;question_cards&quot;:[{&quot;interactive_card_json&quot;:&quot;{\&quot;title\&quot;:\&quot;示例卡片\&quot;}&quot;,&quot;type&quot;:1,&quot;xml&quot;:&quot;\u003cmsg\u003e\u003ctitle\u003e示例卡片\u003c/title\u003e\u003c/msg\u003e&quot;}],&quot;timestamp&quot;:1786930800,&quot;trace_id&quot;:&quot;TRACE_ID&quot;}],&quot;operation_type&quot;:1,&quot;test&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 补录小微用户历史成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"accepted_count":1,"bulu_timestamp":1785686400,"ret":0},"Message":"成功","Success":true} | `XiaoWei.FillUserHistoryResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/History/Fill — 补录问答卡片到记忆 (items 结构化卡片)`

---

### POST /XiaoWei/History/List

**说明**: 分页获取小微聊天历史

scroll_type 表示加载方向；clicked_bubble 用于定位；up_context/down_context 为上下分页游标。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `XiaoWei.GetChatHistoryListRequest; {`clicked_bubble`:XiaoWei.ChatBubbleExtraInfoRequest, `down_context`:XiaoWei.PageContextRequest, `scroll_type`:integer, `up_context`:XiaoWei.PageContextRequest}` | 聊天历史分页参数；请求示例：{&quot;clicked_bubble&quot;:{&quot;dialogue_id&quot;:1,&quot;message_id&quot;:1,&quot;timestamp&quot;:1786930800,&quot;trace_id&quot;:&quot;ID_10001&quot;},&quot;down_context&quot;:{&quot;has_more&quot;:true,&quot;limit_count&quot;:20,&quot;offset&quot;:1,&quot;time_cursor&quot;:1786930800},&quot;scroll_type&quot;:0,&quot;up_context&quot;:{&quot;has_more&quot;:true,&quot;limit_count&quot;:20,&quot;offset&quot;:1,&quot;time_cursor&quot;:1786930800}} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 分页获取小微聊天历史成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"chat_list":[{"dialogue_id":"1001"}],"down_context":{"has_more":false,"limit_count":20,"offset":20,"time_cursor":1785686300},"up_context":{"has_more":false,"limit_count":20,"offset":20,"time_cursor":1785686300}},"Message":"成功","Success":true} | `XiaoWei.GetChatHistoryResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/History/List — 读取小微记忆 (scroll_type 加载方向)`

---

### POST /XiaoWei/Invites

**说明**: 邀请好友体验小微

wxids 为好友微信 ID 数组，数量 1..100；uin、request_id、client_msg_id 自动生成。响应 results 返回每个好友的邀请结果。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `XiaoWei.InviteUsersRequest; {`wxids*`:array<string>}` | 业务请求参数；请求示例：{&quot;wxids&quot;:[&quot;wxid_example&quot;]} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 邀请好友体验小微成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"remaining_quota":4,"results":[{"invitee_wxid":"wxid_target","result":0}],"ret_code":0},"Message":"成功","Success":true} | `XiaoWei.InviteUsersResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/Invites — 邀请好友使用小微 (wxids 1..100)`

---

### GET /XiaoWei/Invites/Candidates

**说明**: 获取可邀请好友列表

返回可邀请、已获得资格和已邀请三类好友列表；好友项包含 uin 和 hash_username。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取可邀请好友列表成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"candidate_list":[{"hash_username":"HASH_USERNAME","uin":"1234567890123456789"}],"granted_list":[{"hash_username":"HASH_USERNAME","uin":"1234567890123456789"}],"invited_list":[{"hash_username":"HASH_USERNAME","uin":"1234567890123456789"}],"ret_code":0},"Message":"成功","Success":true} | `XiaoWei.GetInviteCandidatesResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/Invites/Candidates — 可邀请好友列表 (GET)`

---

### GET /XiaoWei/Invites/Info

**说明**: 查询小微邀请额度

返回邀请总额度、已使用额度和剩余额度；账号信息由 authcode 对应登录态注入。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询小微邀请额度成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"remaining_quota":6,"ret_code":0,"total_quota":10,"used_quota":4},"Message":"成功","Success":true} | `XiaoWei.GetInviteInfoResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/Invites/Info — 邀请额度 (GET)`

---

### GET /XiaoWei/Permission

**说明**: 查询小微使用资格

查询 authcode 绑定账号是否已开通小微；uin 和 request_id 由服务端根据登录态自动填写。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询小微使用资格成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"enabled":true,"ret_code":0},"Message":"成功","Success":true} | `XiaoWei.GetXiaoweiPermissionResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/Permission — 查询账号是否已开通小微 (GET)`

---

### POST /XiaoWei/RedDots/Query

**说明**: 查询小微入口红点

debug_info 为可选调试上下文；响应返回红点类型、负载、时间戳、红点 ID 和客户端消费标志。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | — | `XiaoWei.GetRedDotRequest; {`debug_info`:string}` | 业务请求参数；请求示例：{&quot;debug_info&quot;:&quot;client-query&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询小微入口红点成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"ret_code":0},"Message":"成功","Success":true} | `XiaoWei.GetRedDotResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/RedDots/Query — 查询红点`

---

### POST /XiaoWei/RedDots/Read

**说明**: 标记小微红点已读

last_read_timestamp 为最后读取时间戳；reddot_id 必须来自红点查询响应。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `XiaoWei.MarkRedDotReadValidRequest; {`debug_info`:string, `last_read_timestamp*`:integer, `reddot_id*`:integer}` | 业务请求参数；请求示例：{&quot;debug_info&quot;:&quot;DEBUG_INFO&quot;,&quot;last_read_timestamp&quot;:1785686400,&quot;reddot_id&quot;:10001} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 标记小微红点已读成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"ret_code":0},"Message":"成功","Success":true} | `XiaoWei.MarkRedDotReadResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — xiaowei.ts: `/XiaoWei/RedDots/Read — 标记红点已读 (reddot_id 来自 Query)`

---

## Login

> 登陆模块 支持二次 唤醒 62数据登陆(注意：代理必须使用SOCKS)

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Login/62data` | 账号密码登录（兼容模式） |
| 2 | `POST` | `/Login/62dataQRCodeApply` | 账号密码登录并申请二维码验证 |
| 3 | `POST` | `/Login/62dataQRCodeVerify` | 确认账号登录二维码验证 |
| 4 | `POST` | `/Login/62dataSMSAgain` | 重发账号登录短信验证码 |
| 5 | `POST` | `/Login/62dataSMSApply` | 账号密码登录并申请短信验证 |
| 6 | `POST` | `/Login/62dataSMSVerify` | 提交账号登录短信验证码 |
| 7 | `POST` | `/Login/A16Data` | Android 账号密码登录（兼容模式） |
| 8 | `POST` | `/Login/A16Data848` | Android 账号密码登录（新版兼容模式） |
| 9 | `POST` | `/Login/AutoHeartBeat` | 开启自动心跳, 自动二次登录 |
| 10 | `POST` | `/Login/Awaken` | 唤醒登陆(只限扫码登录) |
| 11 | `GET` | `/Login/CheckCanSetAlias` | 检测微信登录环境（Login 路径兼容） |
| 12 | `POST` | `/Login/CheckMacQR` | 查询桌面端二维码登录状态 |
| 13 | `POST` | `/Login/CheckQR` | 检测二维码 |
| 14 | `POST` | `/Login/ExtDeviceLoginConfirmGet` | 新设备扫码登录 |
| 15 | `POST` | `/Login/ExtDeviceLoginConfirmOk` | 新设备扫码确认登录 |
| 16 | `POST` | `/Login/Get62Data` | 获取62数据 |
| 17 | `POST` | `/Login/GetA16Data` | 获取A16数据 |
| 18 | `POST` | `/Login/GetCacheInfo` | 获取登陆缓存信息 |
| 19 | `POST` | `/Login/GetLoginQRCode862` | 获取二维码(iPad 8.0.62 专用) |
| 20 | `GET` | `/Login/GetLoginStatus` | 获取聚合登录状态 |
| 21 | `POST` | `/Login/GetQR` | 获取二维码(iPad) |
| 22 | `POST` | `/Login/GetQRMac` | 获取二维码(Mac) |
| 23 | `POST` | `/Login/GetQRMac_oversea` | 获取二维码(Mac，海外) |
| 24 | `POST` | `/Login/GetQRPad` | 获取二维码(安卓Pad) |
| 25 | `POST` | `/Login/GetQRPadCloud` | 获取二维码（新版兼容模式） |
| 26 | `POST` | `/Login/GetQRPadPPMT` | 获取二维码（Pad PPMT 兼容模式） |
| 27 | `POST` | `/Login/GetQRPadx` | 获取二维码(安卓Pad-绕过验证码) |
| 28 | `POST` | `/Login/GetQRWatch` | 获取二维码(Car) |
| 29 | `POST` | `/Login/GetQRWin` | 获取二维码(Windows) |
| 30 | `POST` | `/Login/GetQRWinUnified` | 获取二维码(WinUnified-统一PC版) |
| 31 | `POST` | `/Login/GetQRWinUwp` | 获取二维码(WindowsUwp-绕过验证码) |
| 32 | `POST` | `/Login/GetQR_oversea` | 获取二维码(iPad，海外) |
| 33 | `POST` | `/Login/GetQRx` | 获取二维码(iPad-绕过验证码) |
| 34 | `POST` | `/Login/GetQRx_oversea` | 获取二维码(iPad-绕过验证码，海外) |
| 35 | `POST` | `/Login/HarmonyLoginApi` | 获取二维码(鸿蒙平板) |
| 36 | `POST` | `/Login/HeartBeat` | 心跳包 |
| 37 | `GET` | `/Login/HeartBeatLogs` | 获取心跳日志 |
| 38 | `POST` | `/Login/HeartBeatLong` | 长连接心跳包跳包 |
| 39 | `POST` | `/Login/LogOut` | 退出登录 |
| 40 | `GET` | `/Login/LongLinkStatus` | 查看当前账号长连接运行状态 |
| 41 | `POST` | `/Login/Newinit` | 初始化 |
| 42 | `POST` | `/Login/SubmitLoginVerificationCode` | 提交扫码登录验证码（仅需 code） |
| 43 | `POST` | `/Login/TwiceAutoAuth` | 二次登陆 |
| 44 | `POST` | `/Login/YPayVerificationcode` | 提交登录验证码（旧接口兼容） |

### POST /Login/62data

**说明**: 账号密码登录（兼容模式）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.Data62LoginReqDoc; {`Data62*`:string, `DeviceName`:string, `Password*`:string, `Proxy`:Login.LoginProxyParamDoc, `UserName*`:string}` | 账号、密码与客户端登录凭据；请求示例：{&quot;Data62&quot;:&quot;credential_from_login_client&quot;,&quot;DeviceName&quot;:&quot;我的 iPhone&quot;,&quot;Password&quot;:&quot;your_password&quot;,&quot;UserName&quot;:&quot;wechat_account&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 账号密码登录（兼容模式）成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/62data — 62登陆(账号或密码)`

---

### POST /Login/62dataQRCodeApply

**说明**: 账号密码登录并申请二维码验证

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.Data62LoginReqDoc; {`Data62*`:string, `DeviceName`:string, `Password*`:string, `Proxy`:Login.LoginProxyParamDoc, `UserName*`:string}` | 账号、密码与客户端登录凭据；请求示例：{&quot;Data62&quot;:&quot;credential_from_login_client&quot;,&quot;DeviceName&quot;:&quot;我的 iPhone&quot;,&quot;Password&quot;:&quot;your_password&quot;,&quot;UserName&quot;:&quot;wechat_account&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 账号密码登录并申请二维码验证成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/62dataQRCodeApply — 申请二维码验证`

---

### POST /Login/62dataQRCodeVerify

**说明**: 确认账号登录二维码验证

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.Data62QRCodeVerifyReqDoc; {`Proxy`:Login.LoginProxyParamDoc, `Url*`:string}` | 二维码验证会话；请求示例：{&quot;Url&quot;:&quot;https://example.com/qr-verification&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 确认账号登录二维码验证成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/62dataQRCodeVerify — 62 数据二维码验证 (v1.3.67; Url=验证链接)`

---

### POST /Login/62dataSMSAgain

**说明**: 重发账号登录短信验证码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.Data62SMSAgainReqDoc; {`Cookie*`:string, `Proxy`:Login.LoginProxyParamDoc, `Url*`:string}` | 上一步返回的验证会话；请求示例：{&quot;Cookie&quot;:&quot;verification_session_from_previous_response&quot;,&quot;Url&quot;:&quot;https://example.com/verification&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 重发账号登录短信验证码成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/62dataSMSAgain — 重发验证码`

---

### POST /Login/62dataSMSApply

**说明**: 账号密码登录并申请短信验证

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.Data62LoginReqDoc; {`Data62*`:string, `DeviceName`:string, `Password*`:string, `Proxy`:Login.LoginProxyParamDoc, `UserName*`:string}` | 账号、密码与客户端登录凭据；请求示例：{&quot;Data62&quot;:&quot;credential_from_login_client&quot;,&quot;DeviceName&quot;:&quot;我的 iPhone&quot;,&quot;Password&quot;:&quot;your_password&quot;,&quot;UserName&quot;:&quot;wechat_account&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 账号密码登录并申请短信验证成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/62dataSMSApply — 申请 SMS 验证`

---

### POST /Login/62dataSMSVerify

**说明**: 提交账号登录短信验证码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.Data62SMSVerifyReqDoc; {`Cookie*`:string, `Proxy`:Login.LoginProxyParamDoc, `Sms*`:string, `Url*`:string}` | 验证会话与短信验证码；请求示例：{&quot;Cookie&quot;:&quot;verification_session_from_previous_response&quot;,&quot;Sms&quot;:&quot;123456&quot;,&quot;Url&quot;:&quot;https://example.com/verification&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 提交账号登录短信验证码成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/62dataSMSVerify — SMS 验证校验`

---

### POST /Login/A16Data

**说明**: Android 账号密码登录（兼容模式）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.A16LoginParamDoc; {`A16*`:string, `DeviceName`:string, `Password*`:string, `Proxy`:Login.LoginProxyParamDoc, `UserName*`:string}` | 账号、密码与客户端登录凭据；请求示例：{&quot;A16&quot;:&quot;credential_from_android_client&quot;,&quot;DeviceName&quot;:&quot;我的 Android 设备&quot;,&quot;Password&quot;:&quot;your_password&quot;,&quot;UserName&quot;:&quot;wechat_account&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | Android 账号密码登录（兼容模式）成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/A16Data — A16 登陆(android 8.0.50)`

---

### POST /Login/A16Data848

**说明**: Android 账号密码登录（新版兼容模式）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.A16LoginParamDoc; {`A16*`:string, `DeviceName`:string, `Password*`:string, `Proxy`:Login.LoginProxyParamDoc, `UserName*`:string}` | 账号、密码与客户端登录凭据；请求示例：{&quot;A16&quot;:&quot;credential_from_android_client&quot;,&quot;DeviceName&quot;:&quot;我的 Android 设备&quot;,&quot;Password&quot;:&quot;your_password&quot;,&quot;UserName&quot;:&quot;wechat_account&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | Android 账号密码登录（新版兼容模式）成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/A16Data848 — A16 新版云函数`

---

### POST /Login/AutoHeartBeat

**说明**: 开启自动心跳, 自动二次登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 开启自动心跳, 自动二次登录成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/AutoHeartBeat — 开启自动心跳`

**探索笔记**: ✅ 可用

- 开启自动心跳 + 自动二次登录。账号登录后 online=false (长连接未建) 时调此接口拉上线. 返回 Code:0 '自动心跳已启动'.
- 实测: 2026-08-21

---

### POST /Login/Awaken

**说明**: 唤醒登陆(只限扫码登录)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 唤醒登陆(只限扫码登录)成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/Awaken — 唤醒登录(扫码)`

---

### GET /Login/CheckCanSetAlias

**说明**: 检测微信登录环境（Login 路径兼容）

检测当前登录会话环境；返回业务判定、验证类型与验证地址，不包含登录密钥等敏感数据。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | Access Token（旧调用方式） |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 检测微信登录环境（Login 路径兼容）成功；响应示例：{"Code":0,"Data":{"ready":true,"status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/CheckCanSetAlias — 检测能否设置微信号 (v1.3.67 GET)`

---

### POST /Login/CheckMacQR

**说明**: 查询桌面端二维码登录状态

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 旧客户端兼容授权码；推荐使用 X-Access-Token 请求头 |
| query | `uuid` | ✅ | `string` | 请输入取码时返回的UUID |
| query | `deviceID` | — | `string` | GetMacQR 返回的设备 ID；留空时服务尝试根据 uuid 恢复 |
| body | `body` | — | `Login.MaccodeParamDoc; {`deviceID`:string, `uuid*`:string}` | JSON 兼容调用；也可只使用 uuid/deviceID 查询参数；请求示例：{&quot;deviceID&quot;:&quot;device_id_from_qr_response&quot;,&quot;uuid&quot;:&quot;uuid_from_qr_response&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询桌面端二维码登录状态成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/CheckMacQR — 检测 Mac 二维码`

---

### POST /Login/CheckQR

**说明**: 检测二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 旧客户端兼容授权码；未提交 X-QR-Check-Token 时必填 |
| header | `X-QR-Check-Token` | — | `string` | GetQR 返回的二维码专属检测令牌（推荐） |
| query | `check_token` | — | `string` | 二维码检测令牌的旧客户端 query 兼容形式；优先使用 X-QR-Check-Token |
| query | `uuid` | ✅ | `string` | 请输入取码时返回的UUID |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 检测二维码成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/CheckQR — 检测二维码`

---

### POST /Login/ExtDeviceLoginConfirmGet

**说明**: 新设备扫码登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.ExtDeviceLoginConfirmParam; {`Url*`:string}` | URL == MAC iPad Windows 的微信二维码解析出来的url；请求示例：{&quot;Url&quot;:&quot;https://example.com/device-confirm&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 新设备扫码登录成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/ExtDeviceLoginConfirmGet — 新设备扫码登录`

---

### POST /Login/ExtDeviceLoginConfirmOk

**说明**: 新设备扫码确认登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.ExtDeviceLoginConfirmParam; {`Url*`:string}` | URL == MAC iPad Windows 的微信二维码解析出来的url；请求示例：{&quot;Url&quot;:&quot;https://example.com/device-confirm&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 新设备扫码确认登录成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/ExtDeviceLoginConfirmOk — 新设备扫码确认`

---

### POST /Login/Get62Data

**说明**: 获取62数据

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取62数据成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/Get62Data — 获取 62 数据`

---

### POST /Login/GetA16Data

**说明**: 获取A16数据

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取A16数据成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetA16Data — 获取 A16 数据`

---

### POST /Login/GetCacheInfo

**说明**: 获取登陆缓存信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取登陆缓存信息成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"alias":"example_alias","auto_auth_ready":true,"client_version_name":"8.0.75","device_brand":"Apple","device_model":"iPad","device_name":"iPad","device_type":"iPad","login_active":true,"login_at":1786930800,"nickname":"示例昵称","os_version":"27.0","safety":{"internally_consistent":true,"last_refresh_unix":1786931100,"next_refresh_allowed_unix":1786931160,"refresh_in_flight":false,"safe":true}},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `Login.CacheInfoResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetCacheInfo — 获取登录缓存`

---

### POST /Login/GetLoginQRCode862

**说明**: 获取二维码(iPad 8.0.62 专用)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(iPad 8.0.62 专用)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetLoginQRCode862 — 二维码 (iPad 8.0.62)`

---

### GET /Login/GetLoginStatus

**说明**: 获取聚合登录状态

汇总登录缓存、账号运行状态、最近心跳和长连接状态；autoLogin=true 时尝试一次会话恢复。响应仅包含业务状态，不返回会话密钥、设备凭据或代理凭据。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | Access Token（旧调用方式） |
| query | `autoLogin` | — | `boolean` | 离线时执行一次会话恢复，默认 true |
| query | `loginJournal` | — | `boolean` | 返回心跳运行日志，默认 false |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取聚合登录状态成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"autoAuthReady":true,"autoLogin":{"attempted":true,"code":0,"message":"示例内容","succeeded":true},"expiryAt":1,"expiryTime":"2026-08-17T10:00:00+08:00","heartbeatStatus":{"lastCode":1,"lastSessionRefreshAt":1,"lastSuccessAt":1,"nextHeartbeatAt":1,"nextSessionRefreshAt":1,"running":true},"loginAt":1,"loginErrMsg":"正常","loginJournal":{"count":20,"logs":["正常"],"source":"api"},"loginState":"ready","loginTime":"正常","longLinkReady":true,"longLinkRegistered":true},"Message":"账号在线状态良好","Success":true} | `Login.LoginStatusResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetLoginStatus — 聚合登录状态 (v1.3.67 GET; autoLogin 尝试会话恢复)`

---

### POST /Login/GetQR

**说明**: 获取二维码(iPad)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(iPad)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQR — 二维码 (iPad)`

**探索笔记**: ✅ 可用

- iPad 扫码登录二维码。Code:1 也是成功 (Success:true); Data 含 QrBase64/Uuid/check_token/QrUrl/ExpiredTime. DeviceName 必填, oversea 海外.
- 调用示例: `{"DeviceName":"我的 iPad","oversea":false}`
- 实测: 2026-08-21

---

### POST /Login/GetQRMac

**说明**: 获取二维码(Mac)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(Mac)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRMac — 二维码 (Mac)`

**探索笔记**: ✅ 可用

- Mac 扫码登录二维码。参数同 GetQR.
- 实测: 2026-08-21

---

### POST /Login/GetQRMac_oversea

**说明**: 获取二维码(Mac，海外)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(Mac，海外)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRMac_oversea — 二维码 (Mac, 海外)`

---

### POST /Login/GetQRPad

**说明**: 获取二维码(安卓Pad)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(安卓Pad)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRPad — 二维码 (Pad)`

**探索笔记**: ✅ 可用

- 安卓Pad 扫码登录二维码。参数同 GetQR.
- 实测: 2026-08-21

---

### POST /Login/GetQRPadCloud

**说明**: 获取二维码（新版兼容模式）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码（新版兼容模式）成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRPadCloud — 获取二维码新版兼容 (v1.3.67)`

---

### POST /Login/GetQRPadPPMT

**说明**: 获取二维码（Pad PPMT 兼容模式）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码（Pad PPMT 兼容模式）成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRPadPPMT — 获取二维码 Pad PPMT 兼容 (v1.3.67)`

---

### POST /Login/GetQRPadx

**说明**: 获取二维码(安卓Pad-绕过验证码)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(安卓Pad-绕过验证码)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRPadx — 二维码 (Pad-绕过)`

---

### POST /Login/GetQRWatch

**说明**: 获取二维码(Car)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(Car)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRWatch — 二维码 (Car)`

---

### POST /Login/GetQRWin

**说明**: 获取二维码(Windows)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(Windows)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRWin — 二维码 (Windows)`

---

### POST /Login/GetQRWinUnified

**说明**: 获取二维码(WinUnified-统一PC版)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(WinUnified-统一PC版)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRWinUnified — 二维码 (WinUnified)`

---

### POST /Login/GetQRWinUwp

**说明**: 获取二维码(WindowsUwp-绕过验证码)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(WindowsUwp-绕过验证码)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRWinUwp — 二维码 (WinUwp-绕过)`

---

### POST /Login/GetQR_oversea

**说明**: 获取二维码(iPad，海外)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(iPad，海外)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQR_oversea — 二维码 (iPad, 海外)`

---

### POST /Login/GetQRx

**说明**: 获取二维码(iPad-绕过验证码)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(iPad-绕过验证码)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRx — 二维码 (iPad-绕过)`

---

### POST /Login/GetQRx_oversea

**说明**: 获取二维码(iPad-绕过验证码，海外)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(iPad-绕过验证码，海外)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/GetQRx_oversea — 二维码 (iPad-绕过, 海外)`

---

### POST /Login/HarmonyLoginApi

**说明**: 获取二维码(鸿蒙平板)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Login.GetQRReq; {`DeviceName`:string, `Proxy`:models.ProxyInfo, `oversea`:boolean}` | 不使用代理请留空；oversea=true 启用海外域名(wechat.com)；请求示例：{&quot;DeviceName&quot;:&quot;我的 iPad&quot;,&quot;oversea&quot;:false} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取二维码(鸿蒙平板)成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/HarmonyLoginApi — 二维码 (鸿蒙平板)`

---

### POST /Login/HeartBeat

**说明**: 心跳包

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 心跳包成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/HeartBeat — 心跳包`

---

### GET /Login/HeartBeatLogs

**说明**: 获取心跳日志

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取心跳日志成功；响应示例：["正常"] | `array<string>` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/HeartBeatLogs — GET 心跳日志`

---

### POST /Login/HeartBeatLong

**说明**: 长连接心跳包跳包

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 长连接心跳包跳包成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/HeartBeatLong — 长连接心跳`

---

### POST /Login/LogOut

**说明**: 退出登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 退出登录成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/LogOut — 退出登录`

---

### GET /Login/LongLinkStatus

**说明**: 查看当前账号长连接运行状态

返回 F104 握手模式、收发时间、重连次数和 Ticket 生命周期，不包含任何密钥材料

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查看当前账号长连接运行状态成功；响应示例：{"Code":0,"Data":{"ready":true,"status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/LongLinkStatus — GET 长连接状态`

**探索笔记**: ⚠️ 部分可用

- 长连接状态。state:disconnected 不表示链路断 (实测消息收发正常); 以实际收发为准. login_state=active 但 ready=false 是正常中间态.
- 实测: 2026-08-21

---

### POST /Login/Newinit

**说明**: 初始化

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | — | `string` | 访问令牌；与 authcode 二选一 |
| query | `authcode` | — | `string` | 兼容授权码；与 X-Access-Token 二选一 |
| query | `MaxSynckey` | — | `string` | 空值或 base64:/base64url:/hex: 前缀；无前缀按旧版原始字节处理 |
| query | `CurrentSynckey` | — | `string` | 空值或 base64:/base64url:/hex: 前缀；无前缀按旧版原始字节处理 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 初始化成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/Newinit — 初始化`

---

### POST /Login/SubmitLoginVerificationCode

**说明**: 提交扫码登录验证码（仅需 code）

调用时机：先使用 Access Token 获取登录二维码，用户扫码后，等待登录轮询进入“需要验证码/验证码验证”阶段，再调用本接口。认证方式：请求头 X-Access-Token 必须与获取本次二维码时使用的 Access Token 相同，否则服务端找不到对应的待登录会话。请求参数：JSON 请求体只传 {"code":"123456"}，不要传 uuid、data62、ticket、verifyid、cookie 或设备参数。处理流程：服务端根据 Access Token 找到二维码 UUID 和已缓存的验证会话并提交验证码；验证码通过后会自动恢复并继续登录，无需再次调用登录确认接口。返回说明：VERIFICATION_ACCEPTED 表示验证码已接受且登录正在继续；LOGIN_VERIFICATION_SESSION_NOT_READY 表示会话仍在准备，保持同一个 Access Token 稍后仍只提交 code；INVALID_VERIFICATION_CODE 表示验证码错误或已过期；LOGIN_VERIFICATION_SESSION_EXPIRED 表示需重新获取二维码。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | ✅ | `string` | 必填；获取本次登录二维码时使用的同一个 Access Token |
| body | `body` | ✅ | `Login.VerificationcodeParam; {`code`:string}` | 短信验证码；请求示例：{&quot;code&quot;:&quot;123456&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 提交扫码登录验证码（仅需 code）成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |
| 400 | {object} models.ResponseResultDoc "JSON 无效或 code 为空" | `` |
| 401 | {object} models.ResponseResultDoc "Access Token 无效，或验证码错误/过期" | `` |
| 409 | {object} models.ResponseResultDoc "对应二维码会话尚未进入验证码阶段、仍在准备或已失效" | `` |
| 500 | {object} models.ResponseResultDoc "服务内部异常" | `` |
| 502 | {object} models.ResponseResultDoc "验证码服务请求异常" | `` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/SubmitLoginVerificationCode — 提交短信验证码 (v1.3.67; 需 X-Access-Token)`

---

### POST /Login/TwiceAutoAuth

**说明**: 二次登陆

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 二次登陆成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/TwiceAutoAuth — 二次登录`

---

### POST /Login/YPayVerificationcode

**说明**: 提交登录验证码（旧接口兼容）

旧路径兼容入口，认证、请求体、返回值和自动续接登录行为均与 SubmitLoginVerificationCode 相同。新接入请使用 /api/Login/SubmitLoginVerificationCode。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| header | `X-Access-Token` | ✅ | `string` | 必填；获取本次登录二维码时使用的同一个 Access Token |
| body | `body` | ✅ | `Login.VerificationcodeParam; {`code`:string}` | 短信验证码；请求示例：{&quot;code&quot;:&quot;123456&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 提交登录验证码（旧接口兼容）成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |
| 400 | {object} models.ResponseResultDoc "JSON 无效或 code 为空" | `` |
| 401 | {object} models.ResponseResultDoc "Access Token 无效，或验证码错误/过期" | `` |
| 409 | {object} models.ResponseResultDoc "对应二维码会话尚未进入验证码阶段、仍在准备或已失效" | `` |
| 500 | {object} models.ResponseResultDoc "服务内部异常" | `` |
| 502 | {object} models.ResponseResultDoc "验证码服务请求异常" | `` |

**实测调用** (源码 `send/*.ts`):

- `()` — login.ts: `/Login/YPayVerificationcode — 提交验证`

---

## Msg

> 消息模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Msg/Quote` | 发送引用回复消息 |
| 2 | `POST` | `/Msg/Revoke` | 撤回消息 |
| 3 | `POST` | `/Msg/SendApp` | 发送App消息 |
| 4 | `POST` | `/Msg/SendAppMessage` | 通用发送应用消息 |
| 5 | `POST` | `/Msg/SendCDNFile` | 发送文件(转发,并非上传) |
| 6 | `POST` | `/Msg/SendCDNImg` | 发送Cdn图片(转发图片) |
| 7 | `POST` | `/Msg/SendCDNVideo` | 发送Cdn视频(转发视频) |
| 8 | `POST` | `/Msg/SendEmoji` | 发送Emoji |
| 9 | `POST` | `/Msg/SendFile` | 上传并发送本地文件 |
| 10 | `POST` | `/Msg/SendGroupMassMsgText` | 群发文本消息 |
| 11 | `POST` | `/Msg/SendTxt` | 发送文本消息 |
| 12 | `POST` | `/Msg/SendVideo` | 发送视频 |
| 13 | `POST` | `/Msg/SendVoice` | 发送语音 |
| 14 | `POST` | `/Msg/SendXCX` | 发送小程序消息 |
| 15 | `POST` | `/Msg/ShareCard` | 分享名片 |
| 16 | `POST` | `/Msg/ShareLink` | 发送分享链接消息 |
| 17 | `POST` | `/Msg/ShareLocation` | 分享位置 |
| 18 | `POST` | `/Msg/ShareVideo` | 发送分享视频消息 |
| 19 | `POST` | `/Msg/StartAutoSync` | 启动自动同步 |
| 20 | `POST` | `/Msg/Sync` | 同步消息 |
| 21 | `POST` | `/Msg/UploadImg` | 发送图片 |

### POST /Msg/Quote

**说明**: 发送引用回复消息

支持文本、图片、语音、视频、应用消息及群聊；id/new_msg_id/svr_id 是同一个服务器消息ID。推荐发送 {"content":"回复内容","reply_context":收到消息.reply_context}，群聊上下文会同时携带群成员 from_user_id 与群会话 chat_user_id。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码；也可使用 X-Access-Token |
| body | `body` | ✅ | `Msg.QuoteDoc; {`chat_user_id`:string, `content*`:string, `display_name`:string, `from_user_id`:string, `msg_type`:integer, `new_msg_id`:string, `quote_content`:string, `reply_context`:Msg.QuoteContextDoc, `sequence`:string, `svr_id`:string, `to_wxid`:string}` | 回复内容及被引用消息上下文；64位 svr_id/new_msg_id 必须使用字符串；请求示例：{&quot;chat_user_id&quot;:&quot;ID_10001&quot;,&quot;content&quot;:&quot;收到，我稍后回复&quot;,&quot;display_name&quot;:&quot;示例名称&quot;,&quot;from_user_id&quot;:&quot;ID_10001&quot;,&quot;msg_type&quot;:1,&quot;new_msg_id&quot;:&quot;ID_10001&quot;,&quot;quote_content&quot;:&quot;示例内容&quot;,&quot;reply_context&quot;:{&quot;chat_user_id&quot;:&quot;ID_10001&quot;,&quot;conversation_id&quot;:&quot;ID_10001&quot;,&quot;from_user_id&quot;:&quot;ID_10001&quot;,&quot;msg_id&quot;:1,&quot;msg_type&quot;:1,&quot;new_msg_id&quot;:&quot;ID_10001&quot;,&quot;quote_content&quot;:&quot;示例内容&quot;,&quot;sequence&quot;:1,&quot;svr_id&quot;:&quot;ID_10001&quot;,&quot;to_wxid&quot;:&quot;wxid_example&quot;},&quot;sequence&quot;:&quot;1&quot;,&quot;svr_id&quot;:&quot;ID_10001&quot;,&quot;to_wxid&quot;:&quot;wxid_example&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送引用回复消息成功；响应示例：{"Code":0,"CodeValue":"SUCCESS","Data":{"app_message_type":1,"client_msg_id":"ID_10001","content":"示例内容","created_at":1786930800,"from_user_id":"ID_10001","id":"ID_10001","local_id":1,"message_type":1,"msg_id":1,"new_msg_id":"ID_10001","referenced_message_type":1,"referenced_svr_id":"ID_10001"},"Message":"示例内容","Success":true,"request_id":"REQUEST_ID"} | `Msg.QuoteResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `* 引用回复: ShareLink + appmsg type=57 完整 refermsg (vendor /Msg/Quote ret=-2 不可用;      * 简单 <svrid> 引用显示"引用内容不存在")`
- `()` — msg.ts: `/Msg/Quote — 引用文本消息 (兼容保留)`

**探索笔记**: ❌ 不可用

- 永久 ret=-2 不可用 (vendor /Msg/Quote 接口). 引用回复走 /Msg/ShareLink + 自构造 type=57 XML (gewe 范式).
- 实测: 2026-08-09

---

### POST /Msg/Revoke

**说明**: 撤回消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.RevokeMsgParamDoc; {`ClientMsgId`:string, `CreateTime`:integer, `NewMsgId`:string, `ToUserName`:string}` | 请注意参数；请求示例：{&quot;ClientMsgId&quot;:&quot;client-message-0001&quot;,&quot;CreateTime&quot;:1786932000,&quot;NewMsgId&quot;:&quot;7184862611068504087&quot;,&quot;ToUserName&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 撤回消息成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/Revoke — 撤回消息 (swagger: ClientMsgId/NewMsgId/CreateTime/ToUserName)`

**探索笔记**: ✅ 可用

- 撤回消息。ClientMsgId/NewMsgId 必须传 number (Go int64, string 报 Code=-8 INVALID_ARGUMENT); NewMsgId 19位大数 Number() 丢精度但 vendor 接受; CreateTime 必须用消息自己 server time (now 会 ret=0 但不真撤).
- 实测: 2026-08-10

---

### POST /Msg/SendApp

**说明**: 发送App消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SendAppMsgParamDoc; {`ToWxid`:string, `Type`:integer, `Xml`:string}` | Type请根据场景设置,xml请自行构造；请求示例：{&quot;ToWxid&quot;:&quot;wxid_recipient&quot;,&quot;Type&quot;:5,&quot;Xml&quot;:&quot;app_message_content_from_source&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送App消息成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `发 XML 应用消息: /Msg/SendApp 是群发端点不能用, 用 /Msg/ShareLink`

**探索笔记**: ❌ 不可用

- 群发消息端点 (SendGroupMassMsgTextParamDoc), 误触发广播风险! 发单条请用 /Msg/ShareLink 或 /Msg/SendTxt。v1.1.17 已移除.
- 实测: 2026-08-10

---

### POST /Msg/SendAppMessage

**说明**: 通用发送应用消息

使用结构化业务参数发送链接卡片、小程序卡片、音乐卡片或本地文件；单次最多 20 项，完整批次会在首次发送前完成参数校验。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码；也可使用 X-Access-Token |
| body | `body` | ✅ | `Msg.SendApplicationMessagesParamDoc; {`items*`:array<Msg.ApplicationMessageItem>}` | items 中 kind 与同名内容对象保持一致；以下为链接消息样例；请求示例：{&quot;items&quot;:[{&quot;kind&quot;:&quot;link&quot;,&quot;link&quot;:{&quot;description&quot;:&quot;这是一个链接摘要&quot;,&quot;thumbUrl&quot;:&quot;https://example.com/thumb.jpg&quot;,&quot;title&quot;:&quot;示例链接&quot;,&quot;url&quot;:&quot;https://example.com/article&quot;},&quot;toUserId&quot;:&quot;filehelper&quot;}]} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 通用发送应用消息成功；响应示例：{"Code":0,"Data":{"failed":0,"items":[{"code":0,"index":0,"kind":"link","message":"成功","retryAfterSeconds":0,"success":true,"toUserId":"filehelper"}],"succeeded":1,"total":1},"Message":"成功","Success":true,"request_id":"request-00000001"} | `Msg.SendApplicationMessagesResponseDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `* /Msg/SendAppMessage — 发送结构化应用卡片 (v1.3.67 新 API)      * items=[{kind:'link'|'mini_program'|'music'|'file', ...}] 单次最多 20 项`

---

### POST /Msg/SendCDNFile

**说明**: 发送文件(转发,并非上传)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.DefaultParamDoc; {`Content`:string, `ToWxid`:string}` | Content==收到文件消息xml；请求示例：{&quot;Content&quot;:&quot;你好，这是一条接口示例消息&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送文件(转发,并非上传)成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/SendCDNFile — 发送 CDN 文件(转发)`

---

### POST /Msg/SendCDNImg

**说明**: 发送Cdn图片(转发图片)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.DefaultParamDoc; {`Content`:string, `ToWxid`:string}` | Content==消息xml；请求示例：{&quot;Content&quot;:&quot;你好，这是一条接口示例消息&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送Cdn图片(转发图片)成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/SendCDNImg — 发送 CDN 图片 (v1.2.1 swagger-alignment: DefaultParamDoc {Content, ToWxid})`

**探索笔记**: ⚠️ 部分可用

- 发送 CDN 图片 (转发)。vendor 拉外网 URL 可能 ret=-2; 发本地图用 /Msg/UploadImg (base64) 更可靠.
- 实测: 2026-08-10

---

### POST /Msg/SendCDNVideo

**说明**: 发送Cdn视频(转发视频)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.DefaultParamDoc; {`Content`:string, `ToWxid`:string}` | Content==消息xml；请求示例：{&quot;Content&quot;:&quot;你好，这是一条接口示例消息&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送Cdn视频(转发视频)成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/SendCDNVideo — 发送 CDN 视频 (v1.2.1 swagger-alignment: DefaultParamDoc {Content, ToWxid})`

---

### POST /Msg/SendEmoji

**说明**: 发送Emoji

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SendEmojiParamDoc; {`Md5`:string, `ToWxid`:string, `TotalLen`:integer}` | 接收方 wxid、表情 MD5 和总字节数；请求示例：{&quot;Md5&quot;:&quot;d41d8cd98f00b204e9800998ecf8427e&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;,&quot;TotalLen&quot;:10240} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送Emoji成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/SendEmoji — 发送 Emoji`

---

### POST /Msg/SendFile

**说明**: 上传并发送本地文件

接收文件内容，自动完成上传与文件消息发送；发送结果会进入已配置的消息回调。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SendFileParamDoc; {`Base64`:string, `FileName`:string, `ToWxid`:string}` | ToWxid、FileName、Base64 必填；Base64 支持 Data URL；请求示例：{&quot;Base64&quot;:&quot;FILE_BASE64&quot;,&quot;FileName&quot;:&quot;example.pdf&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 上传并发送本地文件成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `* /Msg/SendFile — 发送文件 (v1.3.67 新 vendor API; 自动上传+发送)      * ToWxid=目标, FileName=文件名, Base64=文件内容`

---

### POST /Msg/SendGroupMassMsgText

**说明**: 群发文本消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SendGroupMassMsgTextParamDoc; {`Content`:string, `ToIds`:array<string>}` | Type请根据场景设置,xml请自行构造；请求示例：{&quot;Content&quot;:&quot;你好，这是一条群发示例消息&quot;,&quot;ToIds&quot;:[&quot;ID_10001&quot;]} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 群发文本消息成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `* /Msg/SendGroupMassMsgText — 群发文本 (v1.3.67 新 vendor API)      * ToIds=群 wxid 数组, Content=文本`

---

### POST /Msg/SendTxt

**说明**: 发送文本消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SendNewMsgParamDoc; {`At`:string, `Content`:string, `ToWxid`:string, `Type`:integer}` | Type请填写1 At == 群@,多个wxid请用,隔开；请求示例：{&quot;At&quot;:&quot;wxid_group_member&quot;,&quot;Content&quot;:&quot;你好，这是一条接口示例消息&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;,&quot;Type&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送文本消息成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/SendTxt — 发送文本 (swagger: At 逗号串 + Type:1; persist 默认 true 收口入库)`

**探索笔记**: ✅ 可用

- 发文本标准接口。Type=1 必填; 群@用 At 逗号分隔多个 wxid。persist 入库走 outbound.
- 调用示例: `{"ToWxid":"wxid_xxx","Content":"hello","At":"","Type":1}`
- 实测: 2026-08-10

---

### POST /Msg/SendVideo

**说明**: 发送视频

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SendVideoMsgParamDoc; {`Base64`:string, `ImageBase64`:string, `PlayLength`:integer, `ToWxid`:string}` | 接收方 wxid、视频 Base64、封面 Base64 和时长；请求示例：{&quot;Base64&quot;:&quot;VIDEO_BASE64&quot;,&quot;ImageBase64&quot;:&quot;THUMBNAIL_BASE64&quot;,&quot;PlayLength&quot;:10,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送视频成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/SendVideo — 发送视频 (v1.2.1 P1-fix 字段 PascalCase; v1.3.19 URL→base64 + persist)`

---

### POST /Msg/SendVoice

**说明**: 发送语音

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SendVoiceMessageParamDoc; {`Base64`:string, `ToWxid`:string, `Type`:integer, `VoiceTime`:integer}` | Type： AMR = 0, MP3 = 2, SILK = 4, SPEEX = 1, WAVE = 3 VoiceTime ：音频长度 1000为一秒；请求示例：{&quot;Base64&quot;:&quot;AUDIO_BASE64&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;,&quot;Type&quot;:0,&quot;VoiceTime&quot;:3000} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送语音成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `* /Msg/SendVoice — 发送语音      * v1.3.52 SILK-ONLY (2026-08-12 接总立): vendor /Msg/SendVoice **只接受 silk** (Type=4)。      *   - 输入已是 silk (data:audio/silk / .silk / formatHint='silk') → 直接 base64, Type=4      *   - 输入是 mp3/其它 → 必须经 silk-encoder 转码 (v1.3.48 起 ffmpeg PCM 24kHz → silk -tencent)      *   - 转码失败 → v1.3.53 VOICE-DEGRADE: 降级为文件消息 (老板 6-12 16:36 偏好: 成功发语音, 失败降级文件)      *     (绝不给 /Msg/SendVoice 传 mp3 — vendor 只收 silk)      * 旧 v1.3.49 SILK-TYPE-FIX 的 Type 枚举: AMR=0, MP3=2, SILK=4, SPEEX=1, WAVE=3      *   现在 Type 恒为 4 (SILK), formatHint 仅作 silk 识别提示, 不再映射 MP3=2`

---

### POST /Msg/SendXCX

**说明**: 发送小程序消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.DefaultParamDoc; {`Content`:string, `ToWxid`:string}` | Content==小程序xml；请求示例：{&quot;Content&quot;:&quot;你好，这是一条接口示例消息&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送小程序消息成功；响应示例：{"Code":0,"Data":{"message_id":"9007199254740993","status":"sent"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `小程序发送走 sendXCX (/Msg/SendXCX); 不再有 sendMiniProgram 死代码 (曾错调 /Msg/SendApp 群发端点)`
- `()` — msg.ts: `/Msg/SendXCX — 发送小程序消息`

---

### POST /Msg/ShareCard

**说明**: 分享名片

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.ShareCardParamDoc; {`CardAlias`:string, `CardNickName`:string, `CardWxId`:string, `ToWxid`:string}` | ToWxid==接收的微信ID CardWxId==名片wxid CardNickName==名片昵称 CardAlias==名片别名；请求示例：{&quot;CardAlias&quot;:&quot;wechat_alias&quot;,&quot;CardNickName&quot;:&quot;张三&quot;,&quot;CardWxId&quot;:&quot;wxid_card_contact&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 分享名片成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/ShareCard — 分享名片 (v1.2.1 swagger-alignment: ShareCardParamDoc {CardAlias, CardNickName, CardWxId, ToWxid})`

---

### POST /Msg/ShareLink

**说明**: 发送分享链接消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SendAppMsgParamDoc; {`ToWxid`:string, `Type`:integer, `Xml`:string}` | Type==类型 Desc==描述 Xml==发送xml内容 ToWxid==接受者；请求示例：{&quot;ToWxid&quot;:&quot;wxid_recipient&quot;,&quot;Type&quot;:5,&quot;Xml&quot;:&quot;app_message_content_from_source&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送分享链接消息成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `* v1.2.1 swagger-alignment: /Msg/ShareLink 期望 appmsg XML (SendAppMsgParamDoc {ToWxid, Type, Xml})  * 分享链接标准 appmsg 结构 (type=5 = 链接卡片)`
- `()` — msg.ts: `/Msg/ShareLink — 分享链接 (v1.2.1 swagger-alignment: SendAppMsgParamDoc {ToWxid, Type, Xml})`

---

### POST /Msg/ShareLocation

**说明**: 分享位置

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.ShareLocationParamDoc; {`Infourl`:string, `Label`:string, `Poiname`:string, `Scale`:number, `ToWxid`:string, `X`:number, `Y`:number}` | 接收方 wxid、经纬度、地点名称和地图缩放级别；请求示例：{&quot;Infourl&quot;:&quot;https://example.com/location&quot;,&quot;Label&quot;:&quot;深圳市南山区&quot;,&quot;Poiname&quot;:&quot;深圳湾科技生态园&quot;,&quot;Scale&quot;:16,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;,&quot;X&quot;:22.5431,&quot;Y&quot;:114.0579} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 分享位置成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `* /Msg/ShareLocation — 分享位置 (v1.2.1 swagger-alignment: ShareLocationParamDoc {X, Y, Label, Poiname, Scale, Infourl, ToWxid})      * v1.3.11: X=纬度(lat), Y=经度(lng) — 对齐 gewe (buildLocationPayload x=lat,y=lng), 反了会定位卡片缩略图错位`

---

### POST /Msg/ShareVideo

**说明**: 发送分享视频消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.ShareVideoMsgParamDoc; {`ToWxid*`:string, `Xml*`:string}` | xml：微信返回的视频xml；请求示例：{&quot;ToWxid&quot;:&quot;filehelper&quot;,&quot;Xml&quot;:&quot;video_message_content_from_source&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送分享视频消息成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/ShareVideo — 分享视频消息 (v1.2.1 swagger-alignment: ShareVideoMsgParamDoc {ToWxid, Xml})`

---

### POST /Msg/StartAutoSync

**说明**: 启动自动同步

启用该账号的统一消息同步；后续 WS/Webhook 的 sync_message 事件会自动带 reply_context，以及 image/video/file/voice 所需的结构化业务参数。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码（必填） |
| body | `body` | ✅ | `Msg.SyncParam2Doc; {`TargetURL*`:string}` | 兼容旧版：TargetURL 可忽略；请求示例：{&quot;TargetURL&quot;:&quot;https://your-server.example.com/messages&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 启动自动同步成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/StartAutoSync — 启动自动同步 (v1.2.1 swagger-alignment: SyncParam2Doc {TargetURL})`

---

### POST /Msg/Sync

**说明**: 同步消息

触发一次微信增量同步；聊天消息会同时按 wechatpad.message.v2 投递到 WS/Webhook。图片、视频、文件、语音分别在 image/video/file/voice 中携带包含 endpoint 的 download_context；文件与语音可通过 DownloadFileBinary/DownloadVoiceBinary 直接获得原始二进制文件，每条消息还携带 reply_context。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SyncParamDoc; {`Scene`:integer, `Synckey`:string}` | Scene填写0,Synckey留空；请求示例：{&quot;Scene&quot;:0,&quot;Synckey&quot;:&quot;initial&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 同步消息成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/Sync — 同步消息 (swagger: Msg.SyncParamDoc {Scene=0, Synckey=""})`

---

### POST /Msg/UploadImg

**说明**: 发送图片

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐)，传此项则Body.Wxid可留空 |
| body | `body` | ✅ | `Msg.SendImageMsgParamDoc; {`Base64`:string, `ToWxid`:string}` | 请注意base64格式；请求示例：{&quot;Base64&quot;:&quot;IMAGE_BASE64&quot;,&quot;ToWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送图片成功；响应示例：{"Code":0,"Data":{"file_id":"FILE_ID","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — msg.ts: `/Msg/UploadImg — 上传图片(返回 imgUrl 后用于 SendImg) (v1.2.1 P1-fix: 字段对齐 swagger Base64/ToWxid)`

**探索笔记**: ✅ 可用

- 发图片首选。Base64 裸 base64 (无前缀)。实测比 SendCDNImg 可靠.
- 调用示例: `{"ToWxid":"wxid_xxx","Base64":"<base64>"}`
- 实测: 2026-08-10

---

## Friend

> 朋友模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Friend/Blacklist` | 添加/移除黑名单 |
| 2 | `POST` | `/Friend/Delete` | 删除好友 |
| 3 | `POST` | `/Friend/GetContractDetail` | 获取通讯录好友详情 |
| 4 | `POST` | `/Friend/GetContractList` | 获取通讯录好友 |
| 5 | `POST` | `/Friend/GetFriendstate` | 查询好友状态 |
| 6 | `POST` | `/Friend/GetGHList` | 获取已关注公众号列表 |
| 7 | `POST` | `/Friend/GetMFriend` | 获取手机通讯录 |
| 8 | `POST` | `/Friend/LbsFind` | 附近人 |
| 9 | `POST` | `/Friend/PassVerify` | 通过好友请求 |
| 10 | `POST` | `/Friend/Search` | 搜索联系人 |
| 11 | `POST` | `/Friend/SendRequest` | 添加联系人(发送好友请求) |
| 12 | `POST` | `/Friend/SetRemarks` | 设置好友备注 |
| 13 | `POST` | `/Friend/Upload` | 上传通讯录 |

### POST /Friend/Blacklist

**说明**: 添加/移除黑名单

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.BlacklistParamDoc; {`toWxid*`:string, `val*`:integer}` | Val == 15添加  7移除；请求示例：{&quot;toWxid&quot;:&quot;wxid_recipient&quot;,&quot;val&quot;:15} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 添加/移除黑名单成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/Blacklist — 黑名单 (toWxid + val 1/2)`

---

### POST /Friend/Delete

**说明**: 删除好友

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.DefaultParamDoc; {`toWxid*`:string}` | 要删除的好友 wxid；请求示例：{&quot;toWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 删除好友成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/Delete — 删除好友 (DefaultParamDoc 空 body, 通过 authcode 路由)`

---

### POST /Friend/GetContractDetail

**说明**: 获取通讯录好友详情

body 支持 userName | toWxids | Towxids；多个微信用英文逗号分隔；chatRoom 可选

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.GetContractDetailparameterDoc; {`userName*`:string}` | 多个微信请用,隔开(最多20个),ChatRoom请留空；也支持 userName/toWxids/Towxids；请求示例：{&quot;userName&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取通讯录好友详情成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — quote-reply.ts: `* 查通讯录好友昵称 (vendor /Friend/GetContractDetail)  * 失败/超时 → undefined (不阻塞引用回复)`
- `()` — friend.ts: `/Friend/GetContractDetail — 通讯录好友详情 (userName)`

---

### POST /Friend/GetContractList

**说明**: 获取通讯录好友

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.GetContractListparameterDoc; {`currentChatRoomContactSeq`:integer, `currentWxcontactSeq`:integer}` | CurrentWxcontactSeq和CurrentChatRoomContactSeq没有的情况下请填写0；请求示例：{&quot;currentChatRoomContactSeq&quot;:0,&quot;currentWxcontactSeq&quot;:0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取通讯录好友成功；响应示例：{"Code":0,"Data":{"contacts":[{"nickname":"示例好友","wxid":"wxid_example"}],"count":1},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/GetContractList — 通讯录好友列表`

**探索笔记**: ⚠️ 部分可用

- 通讯录好友列表. 返回 ContactUsernameList (分页 wxid 数组, 每页100), 无头像/昵称. 需自行翻页 (CurrentWxcontactSeq).
- 实测: 2026-08-11

---

### POST /Friend/GetFriendstate

**说明**: 查询好友状态

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.FriendRelationParamDoc; {`opCode`:integer, `toWxid*`:string}` | OpCode == 1；请求示例：{&quot;opCode&quot;:1,&quot;toWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询好友状态成功；响应示例：{"Code":0,"Data":{"ready":true,"status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/GetFriendstate — 好友状态 (FriendRelationParamDoc: opCode + toWxid)`

---

### POST /Friend/GetGHList

**说明**: 获取已关注公众号列表

从当前账号通讯录完整分页并批量补齐名称、备注、头像等业务信息。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取已关注公众号列表成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/GetGHList — 通讯录完整拉取 (v1.3.67 新 API; 分页+批量补齐名称/备注/头像)`

---

### POST /Friend/GetMFriend

**说明**: 获取手机通讯录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取手机通讯录成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/GetMFriend — 手机通讯录`

---

### POST /Friend/LbsFind

**说明**: 附近人

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.LbsFindParamDoc; {`latitude*`:number, `longitude*`:number, `opCode`:integer}` | OpCode == 1；请求示例：{&quot;latitude&quot;:22.543100357055664,&quot;longitude&quot;:114.05789947509766,&quot;opCode&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 附近人成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/LbsFind — 附近人 (v1.2.1 swagger-alignment: LbsFindParamDoc {latitude, longitude, opCode})`

---

### POST /Friend/PassVerify

**说明**: 通过好友请求

v1、v2、scene 直接使用 type=37 好友申请实时事件的 friend_request.accept_body；底层固定 Opcode=3。重复提交返回 HTTP 429 时请遵循 Retry-After，不要换 v1/v2 重发。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.PassVerifyParamDoc; {`scene*`:integer, `v1*`:string, `v2*`:string}` | 直接提交 friend_request.accept_body；请求示例：{&quot;scene&quot;:17,&quot;v1&quot;:&quot;v1_from_friend_request&quot;,&quot;v2&quot;:&quot;v2_from_friend_request&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 通过好友请求成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |
| 429 | {object} models.ResponseResultDoc | `` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/PassVerify — 通过好友请求 (opcode + scene + v1 + v2)`

---

### POST /Friend/Search

**说明**: 搜索联系人

示例：{"Wxid":"可留空由authcode注入","Keyword":"wxid_xxx","FromScene":0,"SearchScene":1}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.SearchParamDoc; {`fromScene`:integer, `keyword*`:string, `searchScene`:integer, `verifyScene`:integer}` | 爆粉情况下特殊通道请自行填写,默认时FromScene=0,SearchScene=1；请求示例：{&quot;fromScene&quot;:0,&quot;keyword&quot;:&quot;wxid_or_mobile&quot;,&quot;searchScene&quot;:1,&quot;verifyScene&quot;:0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 搜索联系人成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/Search — 搜索联系人 (keyword + fromScene + searchScene)`

---

### POST /Friend/SendRequest

**说明**: 添加联系人(发送好友请求)

示例：{"sourceContext":"SEARCH_RETURNED_CONTEXT","verifyContent":"你好"}；source_context一次性使用，过期或网络结果不明时重新搜索，不重放旧票据。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.SendRequestParamDoc; {`opcode`:integer, `scene`:integer, `sourceContext`:string, `v1`:string, `v2`:string, `verifyContent`:string}` | 推荐sourceContext；旧路径则v1、v2、scene必须同时提供；请求示例：{&quot;opcode&quot;:2,&quot;scene&quot;:17,&quot;sourceContext&quot;:&quot;source_context_from_search_response&quot;,&quot;v1&quot;:&quot;v1_from_search_response&quot;,&quot;v2&quot;:&quot;v2_from_search_response&quot;,&quot;verifyContent&quot;:&quot;你好，我是通过名片添加的&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 添加联系人(发送好友请求)成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |
| 429 | {object} models.ResponseResultDoc | `` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/SendRequest — 添加联系人 (v1 + v2)`

---

### POST /Friend/SetRemarks

**说明**: 设置好友备注

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.SetRemarksParamDoc; {`remarks*`:string, `toWxid*`:string}` | 好友 wxid 与新备注；请求示例：{&quot;remarks&quot;:&quot;重点客户&quot;,&quot;toWxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置好友备注成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/SetRemarks — 设置好友备注 (remarks + toWxid)`

---

### POST /Friend/Upload

**说明**: 上传通讯录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Friend.UploadParamDoc; {`currentPhoneNo*`:string, `opcode*`:integer, `phoneNo*`:string}` | PhoneNo多个手机号请用,隔开   CurrentPhoneNo自己的手机号  Opcode == 1上传 2删除；请求示例：{&quot;currentPhoneNo&quot;:&quot;+8613900139000&quot;,&quot;opcode&quot;:1,&quot;phoneNo&quot;:&quot;+8613800138000&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 上传通讯录成功；响应示例：{"Code":0,"Data":{"file_id":"FILE_ID","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friend.ts: `/Friend/Upload — 上传通讯录 (v1.2.1 swagger-alignment: UploadParamDoc {currentPhoneNo, opcode, phoneNo})`

---

## Finder

> 视频号模块

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
| 13 | `POST` | `/Finder/PlayVideo` | 启动视频号 CDN 分片播放任务 |
| 14 | `GET` | `/Finder/PlayVideoStatus` | 查询视频号播放任务状态 |
| 15 | `POST` | `/Finder/PlayVideoStop` | 停止视频号播放任务 |
| 16 | `GET` | `/Finder/PlayVideoTasks` | 列出当前账号的视频号播放任务 |
| 17 | `POST` | `/Finder/Search` | 用户搜索 |
| 18 | `POST` | `/Finder/TargetUserPage` | 查看指定人首页 |
| 19 | `POST` | `/Finder/UserPrepare` | 用户中心 |

### POST /Finder/Comment

**说明**: 评论

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.CommentParamDoc; {`CommentId`:string, `Content`:string, `Id`:string, `ObjectNonceId`:string, `OpType`:integer, `ReplyCommentId`:string, `ReplyUsername`:string, `RootCommentId`:string, `Scene`:integer, `SessionBuffer`:string, `Username`:string}` | 评论；请求示例：{&quot;CommentId&quot;:&quot;ID_10001&quot;,&quot;Content&quot;:&quot;内容很精彩&quot;,&quot;Id&quot;:&quot;123456789&quot;,&quot;ObjectNonceId&quot;:&quot;content_token_from_feed&quot;,&quot;OpType&quot;:1,&quot;ReplyCommentId&quot;:&quot;comment_id_from_comment_response&quot;,&quot;ReplyUsername&quot;:&quot;finder_username_from_comment_response&quot;,&quot;RootCommentId&quot;:&quot;comment_id_from_comment_response&quot;,&quot;Scene&quot;:1,&quot;SessionBuffer&quot;:&quot;session_from_feed&quot;,&quot;Username&quot;:&quot;finder_username_from_feed&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 评论成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/Comment — 评论 (Username + Id + Content + CommentId + OpType + Scene + ...)`

---

### POST /Finder/Decrypt

**说明**: 评论

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.DecryptParamDoc; {`Content`:string}` | 评论；请求示例：{&quot;Content&quot;:&quot;content_from_shared_finder_message&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 评论成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/Decrypt — 评论(解密) (Content)`

---

### POST /Finder/FinderGetMsgSessionId

**说明**: 获取Finder私信会话ID

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.FinderGetMsgSessionIdParamDoc; {`FinderUsername`:string}` | 获取会话ID；请求示例：{&quot;FinderUsername&quot;:&quot;finder_username_from_search_response&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取Finder私信会话ID成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/FinderGetMsgSessionId — 获取私信会话 ID (FinderUsername)`

---

### POST /Finder/FinderLiveDetail

**说明**: 直播详情

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.FinderLiveDetailParamDoc; {`FinderNonceID`:string, `FinderObjectID`:integer}` | 直播详情；请求示例：{&quot;FinderNonceID&quot;:&quot;content_token_from_feed&quot;,&quot;FinderObjectID&quot;:123456789} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 直播详情成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/FinderLiveDetail — 直播详情 (FinderObjectID + FinderNonceID)`

---

### POST /Finder/FinderSearchList

**说明**: 搜索列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `models.EmptyObject` | 搜索列表（无参数，传 {}）；请求示例：{} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 搜索列表成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/FinderSearchList — 搜索列表 (EmptyObject, query in path?)`

---

### POST /Finder/FinderSendText

**说明**: 发送私信文字

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.FinderSendTextParamDoc; {`FinderUsername`:string, `Text`:string}` | 直播详情；请求示例：{&quot;FinderUsername&quot;:&quot;finder_username_from_search_response&quot;,&quot;Text&quot;:&quot;你好&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送私信文字成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/FinderSendText — 发送私信文字 (FinderUsername + Text)`

---

### POST /Finder/Findergettopiclist

**说明**: 主题列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.FinderGetTopicListParamDoc; {`LastBuffer`:string, `TopTitle`:string}` | 主题列表；请求示例：{&quot;LastBuffer&quot;:&quot;CURSOR_TOKEN&quot;,&quot;TopTitle&quot;:&quot;热门话题&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 主题列表成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/Findergettopiclist — 主题列表 (LastBuffer + TopTitle)`

---

### POST /Finder/Follow

**说明**: 关注

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.DefaultParamDoc; {`FinderUsername`:string, `Value`:string}` | 关注；请求示例：{&quot;FinderUsername&quot;:&quot;finder_username_from_search_response&quot;,&quot;Value&quot;:&quot;人工智能&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 关注成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/Follow — 关注 (DefaultParamDoc, 通过 query/header 携带 finderId)`

---

### POST /Finder/GetCommentDetail

**说明**: 查看指定内容

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.GetCommentDetailParamDoc; {`FinderUsername`:string, `Id`:integer, `LastBuffer`:string, `ObjectNonceId`:string, `RootCommentId`:integer}` | 查看指定内容；请求示例：{&quot;FinderUsername&quot;:&quot;finder_username_from_feed&quot;,&quot;Id&quot;:123456789,&quot;LastBuffer&quot;:&quot;CURSOR_TOKEN&quot;,&quot;ObjectNonceId&quot;:&quot;content_token_from_feed&quot;,&quot;RootCommentId&quot;:0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查看指定内容成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/GetCommentDetail — 评论详情 (v1.2.1 swagger-alignment: GetCommentDetailParamDoc {FinderUsername, Id, LastBuffer, ObjectNonceId, RootCommentId})`

---

### POST /Finder/GetCommentList

**说明**: 评论列表/详情（支持RootCommentId翻页）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.GetCommentDetailParamDoc; {`FinderUsername`:string, `Id`:integer, `LastBuffer`:string, `ObjectNonceId`:string, `RootCommentId`:integer}` | 评论列表/详情；请求示例：{&quot;FinderUsername&quot;:&quot;finder_username_from_feed&quot;,&quot;Id&quot;:123456789,&quot;LastBuffer&quot;:&quot;CURSOR_TOKEN&quot;,&quot;ObjectNonceId&quot;:&quot;content_token_from_feed&quot;,&quot;RootCommentId&quot;:0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 评论列表/详情（支持RootCommentId翻页）成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/GetCommentList — 评论列表/详情`

---

### POST /Finder/GetRecommend

**说明**: 推荐

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.GetRecommendParamDoc; {`FinderEnt`:string, `FinderUsername`:string, `Latitude`:integer, `Longitude`:integer, `PullType`:integer, `SpecialRequestScene`:integer, `TabTipsObjectId`:integer}` | 推荐首页参数（默认传 {}）；请求示例：{&quot;FinderEnt&quot;:&quot;finder_feed&quot;,&quot;FinderUsername&quot;:&quot;wxid_example&quot;,&quot;Latitude&quot;:0,&quot;Longitude&quot;:0,&quot;PullType&quot;:1,&quot;SpecialRequestScene&quot;:0,&quot;TabTipsObjectId&quot;:0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 推荐成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/GetRecommend — 推荐`

---

### POST /Finder/Like

**说明**: 点赞

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.LikeParamDoc; {`CommentId`:string, `CurLikeCount`:integer, `FinderUsername`:string, `Id`:string, `LikeId`:string, `LikeUsername`:string, `ObjectNonceId`:string, `OpType`:integer, `Scene`:integer, `SessionBuffer`:string}` | 点赞；请求示例：{&quot;CommentId&quot;:&quot;ID_10001&quot;,&quot;CurLikeCount&quot;:0,&quot;FinderUsername&quot;:&quot;finder_username_from_feed&quot;,&quot;Id&quot;:&quot;123456789&quot;,&quot;LikeId&quot;:&quot;ID_10001&quot;,&quot;LikeUsername&quot;:&quot;finder_username_current_account&quot;,&quot;ObjectNonceId&quot;:&quot;content_token_from_feed&quot;,&quot;OpType&quot;:1,&quot;Scene&quot;:1,&quot;SessionBuffer&quot;:&quot;session_from_feed&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 点赞成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/Like — 点赞`

---

### POST /Finder/PlayVideo

**说明**: 启动视频号 CDN 分片播放任务

loop=true, loop_count>0 按次数循环；loop=true, loop_count=0 持续运行至调用 PlayVideoStop。返回任务只表示本地播放处理状态。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码；也可使用 X-Access-Token |
| body | `body` | ✅ | `Finder.PlayVideoParamDoc; {`async`:boolean, `feed_id`:string, `finder_username`:string, `interval_seconds`:integer, `loop`:boolean, `loop_count`:integer, `object_id`:string, `object_nonce_id`:string, `play_seconds`:integer, `play_url`:string, `range_bytes`:integer, `referer`:string, `request_interval_ms`:integer, `urls`:array<string>, `user_agent`:string}` | 播放时长、循环与分片参数；请求示例：{&quot;async&quot;:true,&quot;feed_id&quot;:&quot;feed_id_from_finder_response&quot;,&quot;finder_username&quot;:&quot;v3_finder_username&quot;,&quot;interval_seconds&quot;:2,&quot;loop&quot;:true,&quot;loop_count&quot;:5,&quot;object_id&quot;:&quot;object_id_from_finder_response&quot;,&quot;object_nonce_id&quot;:&quot;object_nonce_id_from_finder_response&quot;,&quot;play_seconds&quot;:60,&quot;play_url&quot;:&quot;https://findervp.video.qq.com/path/stodownload?token=SIGNED_TOKEN&quot;,&quot;range_bytes&quot;:524288,&quot;referer&quot;:&quot;https://channels.weixin.qq.com/&quot;,&quot;request_interval_ms&quot;:1000,&quot;urls&quot;:[&quot;https://example.com/resource&quot;],&quot;user_agent&quot;:&quot;WeChat/8.0.75.33 CFNetwork/3888.100.1 Darwin/27.0.0&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 启动视频号 CDN 分片播放任务成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/PlayVideo — 播放视频号视频 (v1.3.67 新 API; object_id/finder_username/play_url 选传 + 高级参数)`

---

### GET /Finder/PlayVideoStatus

**说明**: 查询视频号播放任务状态

返回当前循环、URL、Range 偏移、请求数、成功/失败分片数、读取字节和最后一次 HTTP 状态。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码；也可使用 X-Access-Token |
| query | `task_id` | ✅ | `string` | PlayVideo 返回的 task_id |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询视频号播放任务状态成功；响应示例：{"Code":0,"Data":{"ready":true,"status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/PlayVideoStatus — 视频播放状态 (v1.3.67 新 API GET; task_id)`

---

### POST /Finder/PlayVideoStop

**说明**: 停止视频号播放任务

主动取消指定任务，适用于 loop=true, loop_count=0 的持续播放任务。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码；也可使用 X-Access-Token |
| body | `body` | ✅ | `Finder.PlayVideoStopParamDoc; {`task_id`:string}` | 要停止的任务；请求示例：{&quot;task_id&quot;:&quot;finder-play-task-id&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 停止视频号播放任务成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/PlayVideoStop — 停止视频播放任务 (v1.3.67 新 API; task_id=PlayVideo 返回)`

---

### GET /Finder/PlayVideoTasks

**说明**: 列出当前账号的视频号播放任务

列出运行中和 24 小时内已结束的内存任务；服务重启后任务表重置。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码；也可使用 X-Access-Token |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 列出当前账号的视频号播放任务成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/PlayVideoTasks — 视频播放任务列表 (v1.3.67 新 API GET)`

---

### POST /Finder/Search

**说明**: 用户搜索

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.DefaultParamDoc; {`FinderUsername`:string, `Value`:string}` | 用户搜索；请求示例：{&quot;FinderUsername&quot;:&quot;finder_username_from_search_response&quot;,&quot;Value&quot;:&quot;人工智能&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 用户搜索成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/Search — 用户搜索`

---

### POST /Finder/TargetUserPage

**说明**: 查看指定人首页

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Finder.TargetUserPageParamDoc; {`LastBuffer`:string, `Target`:string}` | 查看指定人首页；请求示例：{&quot;LastBuffer&quot;:&quot;CURSOR_TOKEN&quot;,&quot;Target&quot;:&quot;finder_username_from_search_response&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查看指定人首页成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/TargetUserPage — 查看指定人首页 (v1.2.1 swagger-alignment: TargetUserPageParamDoc {LastBuffer, Target})`

---

### POST /Finder/UserPrepare

**说明**: 用户中心

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 用户中心成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — finder.ts: `/Finder/UserPrepare — 用户中心`

---

## FriendCircle

> 朋友圈模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/FriendCircle/ActiveTasks` | 查询正在执行的朋友圈评论转发任务 |
| 2 | `POST` | `/FriendCircle/Comment` | 朋友圈点赞/评论 |
| 3 | `POST` | `/FriendCircle/DownloadVideo` | 朋友圈下载CDN视频 |
| 4 | `POST` | `/FriendCircle/GetCollectCircle` | 获取收藏动态详情 |
| 5 | `POST` | `/FriendCircle/GetCommnet` | 获取评论内容 |
| 6 | `POST` | `/FriendCircle/GetDetail` | 获取特定人朋友圈 |
| 7 | `POST` | `/FriendCircle/GetIdDetail` | 获取特定ID详情内容 |
| 8 | `POST` | `/FriendCircle/GetList` | 朋友圈首页列表 |
| 9 | `POST` | `/FriendCircle/Messages` | 发布纯文字、图文、视频或链接朋友圈 |
| 10 | `POST` | `/FriendCircle/MessagesRaw` | 发布朋友圈（原始 XML 兼容接口） |
| 11 | `POST` | `/FriendCircle/MmSnsSync` | 朋友圈同步 |
| 12 | `POST` | `/FriendCircle/Operation` | 朋友圈操作 |
| 13 | `POST` | `/FriendCircle/PrivacySettings` | 朋友圈权限设置 |
| 14 | `POST` | `/FriendCircle/PushCommnet` | 启动评论检查任务并转发评论 |
| 15 | `POST` | `/FriendCircle/SendFavItemCircle` | 转发收藏的朋友圈 |
| 16 | `POST` | `/FriendCircle/SendOneIdCircle` | 一键转发指定朋友圈 |
| 17 | `POST` | `/FriendCircle/SetBackgroundImage` | 设置朋友圈背景图 |
| 18 | `POST` | `/FriendCircle/SetFriendCircleDays` | 设置朋友圈对朋友可见范围 |
| 19 | `POST` | `/FriendCircle/Upload` | 朋友圈兼容图片上传 |
| 20 | `POST` | `/FriendCircle/UploadImage` | 朋友圈上传CDN图片 |
| 21 | `POST` | `/FriendCircle/UploadImages` | 朋友圈批量上传CDN图片 |
| 22 | `POST` | `/FriendCircle/UploadVideo` | 朋友圈上传CDN视频 |

### POST /FriendCircle/ActiveTasks

**说明**: 查询正在执行的朋友圈评论转发任务

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询正在执行的朋友圈评论转发任务成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/ActiveTasks — 查询朋友圈评论转发任务 (v1.3.67 新 API)`

---

### POST /FriendCircle/Comment

**说明**: 朋友圈点赞/评论

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.CommentParamDoc; {`content`:string, `id*`:string, `replyCommnetId`:integer, `toWxid`:string, `type*`:integer}` | type：1点赞 2：文本 3:消息 4：with 5陌生人点赞 replyCommnetId：回复评论Id；请求示例：{&quot;content&quot;:&quot;内容很精彩&quot;,&quot;id&quot;:&quot;123456789&quot;,&quot;replyCommnetId&quot;:0,&quot;toWxid&quot;:&quot;wxid_recipient&quot;,&quot;type&quot;:2} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈点赞/评论成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/Comment — 朋友圈点赞/评论 (content + id + type + replyCommnetId)`

---

### POST /FriendCircle/DownloadVideo

**说明**: 朋友圈下载CDN视频

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.DownloadMediaModelDoc; {`key*`:string, `url*`:string}` | 下载参数；请求示例：{&quot;key&quot;:&quot;media_key_from_circle_detail&quot;,&quot;url&quot;:&quot;https://example.com/video.mp4&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈下载CDN视频成功；响应示例：{"Code":0,"Data":{"content_type":"application/octet-stream","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `* v1.3.24 FRIENDCIRCLE-DOWNLOAD-VIDEO: /FriendCircle/DownloadVideo — 下载朋友圈视频 (隐藏端点, swagger 未列).      * 老板提供参数 (2026-08-10): { key, url } — key=视频 md5 (或 media id/filekey), url=完整视频 CDN URL.      * 实测 (2026-08-10): key=md5 + url=完整 URL → Code=0, Data=base64 视频 (mp4/isom), 1853612 bytes 完整下载.`

---

### POST /FriendCircle/GetCollectCircle

**说明**: 获取收藏动态详情

返回结构化的动态内容、素材、位置及互动计数。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.GetCollectCircleParamDoc; {`sourceId*`:string}` | sourceId 必填；请求示例：{&quot;sourceId&quot;:&quot;123456789&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取收藏动态详情成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/GetCollectCircle — 读取收藏动态详情 (v1.3.67 新 API; sourceId=收藏来源标识)`

---

### POST /FriendCircle/GetCommnet

**说明**: 获取评论内容

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.GetCommnetParamDoc; {`xmlData*`:string}` | 包含id和username的XML数据；请求示例：{&quot;xmlData&quot;:&quot;\u003cTimelineObject\u003e\u003c/TimelineObject\u003e&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取评论内容成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/GetCommnet — 获取评论内容 (xmlData)`

---

### POST /FriendCircle/GetDetail

**说明**: 获取特定人朋友圈

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.GetDetailparameterDoc; {`fristpagemd5`:string, `maxid`:integer, `towxid*`:string}` | 打开首页时：Fristpagemd5留空,Maxid填写0；请求示例：{&quot;fristpagemd5&quot;:&quot;d41d8cd98f00b204e9800998ecf8427e&quot;,&quot;maxid&quot;:0,&quot;towxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取特定人朋友圈成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/GetDetail — 特定人朋友圈 (towxid 在 GetIdDetailParamDoc 实际是 id)`

---

### POST /FriendCircle/GetIdDetail

**说明**: 获取特定ID详情内容

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.GetIdDetailParamDoc; {`id*`:integer, `towxid`:string}` | Id为当前朋友圈内容的id；请求示例：{&quot;id&quot;:123456789,&quot;towxid&quot;:&quot;wxid_recipient&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取特定ID详情内容成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/GetIdDetail — 特定 ID 详情 (id + towxid)`

---

### POST /FriendCircle/GetList

**说明**: 朋友圈首页列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.GetListParamDoc; {`fristpagemd5`:string, `maxid`:integer}` | 打开首页时：Fristpagemd5留空,Maxid填写0；请求示例：{&quot;fristpagemd5&quot;:&quot;d41d8cd98f00b204e9800998ecf8427e&quot;,&quot;maxid&quot;:0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈首页列表成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/GetList — 朋友圈首页列表 (fristpagemd5 vendor typo + maxid)`

---

### POST /FriendCircle/Messages

**说明**: 发布纯文字、图文、视频或链接朋友圈

成功响应 Data.SnsObject.Id 是朋友圈 ID；请按字符串保存，可传给 /Operation(type=1) 删除。HTTP 429 时遵循 Retry-After；返回限制结果时停止自动重试。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.SnsPostRequestDoc; {`blackList`:string, `groupUserList`:string, `images`:array<FriendCircle.SnsPostImageItemDoc>, `link`:FriendCircle.SnsPostLinkItemDoc, `location`:FriendCircle.SnsPostLocationItemDoc, `private`:integer, `title`:string, `video`:FriendCircle.SnsPostVideoItemDoc, `withUserList`:string}` | 以下为纯文字朋友圈样例；图文、视频、链接分别使用 images、video、link；请求示例：{&quot;private&quot;:0,&quot;title&quot;:&quot;今天天气不错&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发布纯文字、图文、视频或链接朋友圈成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |
| 429 | {object} models.ResponseResultDoc | `` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/Messages — 发布朋友圈 (SnsPostItemDoc)`

**探索笔记**: ✅ 可用

- 发布朋友圈 (纯文字/图文/视频/链接). 图片走 /FriendCircle/UploadImage 后 MediaList 引用.
- 实测: 2026-08-10

---

### POST /FriendCircle/MessagesRaw

**说明**: 发布朋友圈（原始 XML 兼容接口）

发布时自动复用当前登录会话；重复请求返回 HTTP 429、retry_after_seconds 与 Retry-After。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.MessagearameterDoc; {`blackList`:string, `content*`:string, `groupUserList`:string, `private`:integer, `withUserList`:string}` | 请自行构造xml内容；请求示例：{&quot;blackList&quot;:&quot;wxid_example&quot;,&quot;content&quot;:&quot;今天天气不错&quot;,&quot;groupUserList&quot;:&quot;wxid_example&quot;,&quot;private&quot;:0,&quot;withUserList&quot;:&quot;wxid_example&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发布朋友圈（原始 XML 兼容接口）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |
| 429 | {object} models.ResponseResultDoc | `` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `* v1.3.25 SWAGGER-254: /FriendCircle/MessagesRaw — 发布朋友圈 (原始 XML 兼容接口).      * 参数 (MessagearameterDoc): content=文字, blackList, withUserList.      * 可能解决图片朋友圈显示 XML 代码的问题 (原始 XML 接口).`

---

### POST /FriendCircle/MmSnsSync

**说明**: 朋友圈同步

实时场景推荐订阅 WS/Webhook 的 friend_circle_update；素材地址位于 items[].moment.media[].url 和 thumb_url。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.MmSnsSyncParamDoc; {`synckey`:string}` | Synckey可留空；请求示例：{&quot;synckey&quot;:&quot;CgA=&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈同步成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/MmSnsSync — 查询正在评论转发的 ID`

---

### POST /FriendCircle/Operation

**说明**: 朋友圈操作

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.OperationParamDoc; {`commnetId`:integer, `id*`:string, `type*`:integer}` | id按字符串传输；type：1删除朋友圈2设为隐私3设为公开4删除评论5取消点赞；请求示例：{&quot;commnetId&quot;:0,&quot;id&quot;:&quot;123456789&quot;,&quot;type&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈操作成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/Operation — 朋友圈操作 (commnetId + id + type 1=删 2=设顶 3=取消)`

---

### POST /FriendCircle/PrivacySettings

**说明**: 朋友圈权限设置

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.PrivacySettingsParamDoc; {`function*`:integer, `value*`:integer}` | 核心参数请联系客服获取代码列表；请求示例：{&quot;function&quot;:1,&quot;value&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈权限设置成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/PrivacySettings — 朋友圈权限 (function + value)`

---

### POST /FriendCircle/PushCommnet

**说明**: 启动评论检查任务并转发评论

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.RequestParamsDoc; {`forwardAddr*`:string, `id*`:string}` | 评论转发的地址与sns id；请求示例：{&quot;forwardAddr&quot;:&quot;https://your-server.example.com/friend-circle/comments&quot;,&quot;id&quot;:&quot;123456789&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 启动评论检查任务并转发评论成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/PushCommnet — 启动评论检查任务 (RequestParamsDoc)`

---

### POST /FriendCircle/SendFavItemCircle

**说明**: 转发收藏的朋友圈

发布成功后清理指定收藏项，清理结果会独立返回。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.SendFavItemCircleParamDoc; {`blackList`:FriendCircle.SnsUserListInput, `favItemId*`:integer, `location`:FriendCircle.SnsPostLocationItem, `locationMode`:integer, `sourceId*`:string}` | 源动态、收藏ID与可见范围；请求示例：{&quot;blackList&quot;:&quot;wxid_example&quot;,&quot;favItemId&quot;:10001,&quot;location&quot;:{&quot;city&quot;:&quot;深圳&quot;,&quot;latitude&quot;:&quot;31.2304&quot;,&quot;longitude&quot;:&quot;121.4737&quot;,&quot;poiAddress&quot;:&quot;示例地址&quot;,&quot;poiClassifyId&quot;:&quot;ID_10001&quot;,&quot;poiClassifyType&quot;:1,&quot;poiClickableStatus&quot;:1,&quot;poiInfoUrl&quot;:&quot;https://example.com/resource&quot;,&quot;poiName&quot;:&quot;示例名称&quot;,&quot;poiScale&quot;:1},&quot;locationMode&quot;:1,&quot;sourceId&quot;:&quot;123456789&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 转发收藏的朋友圈成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/SendFavItemCircle — 从收藏项发布朋友圈 (v1.3.67 新 API; favItemId=收藏项ID)`

---

### POST /FriendCircle/SendOneIdCircle

**说明**: 一键转发指定朋友圈

支持文字、图片、视频和链接动态；locationMode=0 保留位置，1 移除，2 使用自定义位置。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.SendOneIDCircleParamDoc; {`blackList`:FriendCircle.SnsUserListInput, `id*`:string, `location`:FriendCircle.SnsPostLocationItem, `locationMode`:integer}` | 源动态与可见范围；请求示例：{&quot;blackList&quot;:&quot;wxid_example&quot;,&quot;id&quot;:&quot;123456789&quot;,&quot;location&quot;:{&quot;city&quot;:&quot;深圳&quot;,&quot;latitude&quot;:&quot;31.2304&quot;,&quot;longitude&quot;:&quot;121.4737&quot;,&quot;poiAddress&quot;:&quot;示例地址&quot;,&quot;poiClassifyId&quot;:&quot;ID_10001&quot;,&quot;poiClassifyType&quot;:1,&quot;poiClickableStatus&quot;:1,&quot;poiInfoUrl&quot;:&quot;https://example.com/resource&quot;,&quot;poiName&quot;:&quot;示例名称&quot;,&quot;poiScale&quot;:1},&quot;locationMode&quot;:0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 一键转发指定朋友圈成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/SendOneIdCircle — 通过已有动态 id 再发朋友圈 (v1.3.67 新 API)`

---

### POST /FriendCircle/SetBackgroundImage

**说明**: 设置朋友圈背景图

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.SetBackgroundImageParamDoc; {`thumbUrl`:string, `url*`:string}` | 传入已上传的背景图URL；thumbUrl留空时使用url；请求示例：{&quot;thumbUrl&quot;:&quot;https://example.com/background-thumb.jpg&quot;,&quot;url&quot;:&quot;https://example.com/background.jpg&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置朋友圈背景图成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `* v1.3.25 SWAGGER-254: /FriendCircle/SetBackgroundImage — 设置朋友圈背景图.`

---

### POST /FriendCircle/SetFriendCircleDays

**说明**: 设置朋友圈对朋友可见范围

range 仅接受 three_days、one_month、six_months、all；会先读取个人资料以保留现有权限位。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.SetFriendCircleDaysParamDoc; {`range*`:string}` | 可见范围枚举；请求示例：{&quot;range&quot;:&quot;one_month&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置朋友圈对朋友可见范围成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `/FriendCircle/SetFriendCircleDays — 设置朋友圈可见范围 (v1.3.67 新 API; range=three_days/one_month/six_months/all)`

---

### POST /FriendCircle/Upload

**说明**: 朋友圈兼容图片上传

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.SnsUploadParamDoc; {`base64*`:string}` | 参考旧版 mmsnsupload 流程；传入图片 base64；请求示例：{&quot;base64&quot;:&quot;IMAGE_BASE64&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈兼容图片上传成功；响应示例：{"Code":0,"Data":{"file_id":"FILE_ID","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `* /FriendCircle/Upload — 上传朋友圈媒体 (发朋友圈用).      * v1.3.23 FIX: swagger summary 误写"下载CDN视频", 实测是上传 (报错"朋友圈图片上传失败" + StartPos/TotalLen 分片).      * 参数: key=媒体标识, base64=媒体内容.`

---

### POST /FriendCircle/UploadImage

**说明**: 朋友圈上传CDN图片

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.CdnSnsImageUploadParamDoc; {`imageData*`:string}` | 传入图片 base64；响应 Data.publishItem 可直接加入 /Messages 的 images；请求示例：{&quot;imageData&quot;:&quot;IMAGE_BASE64&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈上传CDN图片成功；响应示例：{"Code":0,"Data":{"file_id":"FILE_ID","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `* v1.3.25 SWAGGER-254: /FriendCircle/UploadImage — 朋友圈上传 CDN 图片 (单张).      * 参数 (CdnSnsImageUploadParamDoc): imageData=图片 base64.`

**探索笔记**: ✅ 可用

- 朋友圈上传图片. 返回 CDN 标识供发布引用.
- 实测: 2026-08-10

---

### POST /FriendCircle/UploadImages

**说明**: 朋友圈批量上传CDN图片

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.CdnSnsImagesUploadParamDoc; {`imageDataList*`:array<string>}` | 一次上传1至9张；响应 Data[*].publishItem 可直接用于 /Messages 的 images；请求示例：{&quot;imageDataList&quot;:[&quot;U0FNUExFX0RBVEE=&quot;]} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈批量上传CDN图片成功；响应示例：{"Code":0,"Data":{"file_id":"FILE_ID","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `* v1.3.25 SWAGGER-254: /FriendCircle/UploadImages — 朋友圈批量上传 CDN 图片.      * 参数 (CdnSnsImagesUploadParamDoc): imageDataList=图片 base64 数组.`

---

### POST /FriendCircle/UploadVideo

**说明**: 朋友圈上传CDN视频

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `FriendCircle.SnsUploadVideoParamDoc; {`thumbData*`:string, `videoData*`:string}` | 传入视频和缩略图 base64；响应 Data.publishItem 可直接用于 /Messages 的 video；请求示例：{&quot;thumbData&quot;:&quot;THUMBNAIL_BASE64&quot;,&quot;videoData&quot;:&quot;VIDEO_BASE64&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 朋友圈上传CDN视频成功；响应示例：{"Code":0,"Data":{"file_id":"FILE_ID","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — friendcircle.ts: `* v1.3.25 SWAGGER-254: /FriendCircle/UploadVideo — 朋友圈上传 CDN 视频 (视频朋友圈发布前置).      * 参数 (swagger SnsUploadVideoParamDoc): thumbData=缩略图 base64, videoData=视频 base64.`

---

## Favor

> 收藏模块

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
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Favor.DelParamDoc; {`favId*`:integer}` | FavId在同步收藏中获取；请求示例：{&quot;favId&quot;:10001} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 删除收藏成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — favorites.ts: `/Favor/Del — favId 必须 number (新旧 swagger 均 integer; 传 string 新 vendor 报 json unmarshal 错误)`

---

### POST /Favor/GetFavInfo

**说明**: 获取搜藏信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取搜藏信息成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — favorites.ts: `/Favor/GetFavInfo — 新 vendor 无 body (忽略 favId), 保留兼容`

---

### POST /Favor/GetFavItem

**说明**: 读取收藏内容

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Favor.GetFavItemParamDoc; {`favId*`:integer}` | FavId在同步收藏中获取；请求示例：{&quot;favId&quot;:10001} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 读取收藏内容成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — favorites.ts: `/Favor/GetFavItem — favId 必须 number`

---

### POST /Favor/Sync

**说明**: 同步收藏

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Favor.SyncParamDoc; {`keybuf`:string}` | keybuf:第二次请求需要带上第一次返回的；请求示例：{&quot;keybuf&quot;:&quot;initial&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 同步收藏成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — favorites.ts: `/Favor/Sync`

---

## Group

> 群组模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Group/AddChatRoomMember` | 直接增加群成员（小群场景，返回真实服务端结果） |
| 2 | `POST` | `/Group/ConsentToJoin` | 同意进入群聊 |
| 3 | `POST` | `/Group/CreateChatRoom` | 创建群聊 |
| 4 | `POST` | `/Group/DelChatRoomMember` | 删除群成员 |
| 5 | `POST` | `/Group/FacingCreateChatRoom` | 创建群聊 |
| 6 | `POST` | `/Group/GetChatRoomInfo` | 获取群详情(不带公告内容) |
| 7 | `POST` | `/Group/GetChatRoomInfoDetail` | 获取群信息(带公告内容) |
| 8 | `POST` | `/Group/GetChatRoomMemberDetail` | 获取群成员详情 |
| 9 | `POST` | `/Group/GetQRCode` | 获取群二维码 |
| 10 | `GET` | `/Group/GroupList` | 获取可识别群列表（兼容路由） |
| 11 | `POST` | `/Group/InviteChatRoomMember` | 邀请群成员（邀请制场景，返回真实服务端结果） |
| 12 | `GET` | `/Group/List` | 获取可识别群列表（群ID、群名、备注、头像、群主、成员数） |
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

**说明**: 直接增加群成员（小群场景，返回真实服务端结果）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.AddChatRoomParamDoc; {`ChatRoomName`:string, `ToWxids`:string}` | ToWxids 多个微信ID用,隔开 ChatRoomName 群ID；请求示例：{&quot;ChatRoomName&quot;:&quot;123456789@chatroom&quot;,&quot;ToWxids&quot;:&quot;wxid_member_1,wxid_member_2&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 直接增加群成员（小群场景，返回真实服务端结果）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/AddChatRoomMember — 增加群成员 (ChatRoomName + ToWxids 逗号分隔)`

---

### POST /Group/ConsentToJoin

**说明**: 同意进入群聊

WS/Webhook 的 sync_message 遇到群邀请时，直接提交 app.group_invite.accept_body；无需解析原始 XML。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.ConsentToJoinParamDoc; {`Url`:string}` | 群邀请地址；可直接使用 app.group_invite.accept_body；请求示例：{&quot;Url&quot;:&quot;group_invite_url_from_message&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 同意进入群聊成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/ConsentToJoin — 同意进入群聊 (Url 单独字段, 不需要 QID)`

---

### POST /Group/CreateChatRoom

**说明**: 创建群聊

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.CreateChatRoomParamDoc; {`ToWxids`:string}` | ToWxids 多个微信ID用,隔开 至少三个好友微信ID以上；请求示例：{&quot;ToWxids&quot;:&quot;wxid_member_1,wxid_member_2&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 创建群聊成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/CreateChatRoom — 创建群聊 (仅 ToWxids 逗号分隔)`

---

### POST /Group/DelChatRoomMember

**说明**: 删除群成员

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.AddChatRoomParamDoc; {`ChatRoomName`:string, `ToWxids`:string}` | ToWxids 多个微信ID用,隔开 ChatRoomName 群ID；请求示例：{&quot;ChatRoomName&quot;:&quot;123456789@chatroom&quot;,&quot;ToWxids&quot;:&quot;wxid_member_1,wxid_member_2&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 删除群成员成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/DelChatRoomMember — 删除群成员 (ChatRoomName + ToWxids)`

---

### POST /Group/FacingCreateChatRoom

**说明**: 创建群聊

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.FacingCreateChatRoomParamDoc; {`Latitude`:number, `Longitude`:number, `OpCode`:integer, `Password`:string}` | ToWxids 多个微信ID用,隔开 至少三个好友微信ID以上；请求示例：{&quot;Latitude&quot;:22.543100357055664,&quot;Longitude&quot;:114.05789947509766,&quot;OpCode&quot;:1,&quot;Password&quot;:&quot;1234&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 创建群聊成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/FacingCreateChatRoom — 创建面对面群 (Latitude/Longitude/OpCode/Password)`

---

### POST /Group/GetChatRoomInfo

**说明**: 获取群详情(不带公告内容)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.GetChatRoomParamDoc; {`QID`:string}` | UserNameList == 群ID,多个查询请用,隔开；请求示例：{&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取群详情(不带公告内容)成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/GetChatRoomInfo — 群详情(无公告) (QID)`

---

### POST /Group/GetChatRoomInfoDetail

**说明**: 获取群信息(带公告内容)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.GetChatRoomParamDoc; {`QID`:string}` | QID == 群ID；请求示例：{&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取群信息(带公告内容)成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/GetChatRoomInfoDetail — 群详情(带公告) (QID)`

---

### POST /Group/GetChatRoomMemberDetail

**说明**: 获取群成员详情

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.GetChatRoomParamDoc; {`QID`:string}` | QID == 群ID；请求示例：{&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取群成员详情成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/GetChatRoomMemberDetail — 群成员详情 (v1.2.1 swagger-alignment: 只传 QID)`

---

### POST /Group/GetQRCode

**说明**: 获取群二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.GetChatRoomParamDoc; {`QID`:string}` | QID == 群ID；请求示例：{&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取群二维码成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/GetQRCode — 获取群二维码 (QID)`

---

### GET /Group/GroupList

**说明**: 获取可识别群列表（兼容路由）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| query | `force` | — | `string` | 可选：1/true 表示强制全量刷新，不读缓存 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取可识别群列表（兼容路由）成功；响应示例：{"Code":0,"Data":{"count":1,"groups":[{"group_id":"12345678901@chatroom","member_count":3,"name":"示例群聊"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/GroupList — 群列表(GET 兼容路由)`

---

### POST /Group/InviteChatRoomMember

**说明**: 邀请群成员（邀请制场景，返回真实服务端结果）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.AddChatRoomParamDoc; {`ChatRoomName`:string, `ToWxids`:string}` | ToWxids 多个微信ID用,隔开 ChatRoomName 群ID；请求示例：{&quot;ChatRoomName&quot;:&quot;123456789@chatroom&quot;,&quot;ToWxids&quot;:&quot;wxid_member_1,wxid_member_2&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 邀请群成员（邀请制场景，返回真实服务端结果）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/InviteChatRoomMember — 邀请群成员 (ChatRoomName + ToWxids)`

---

### GET /Group/List

**说明**: 获取可识别群列表（群ID、群名、备注、头像、群主、成员数）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| query | `force` | — | `string` | 可选：1/true 表示强制全量刷新 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取可识别群列表（群ID、群名、备注、头像、群主、成员数）成功；响应示例：{"Code":0,"Data":{"count":1,"groups":[{"group_id":"12345678901@chatroom","member_count":3,"name":"示例群聊"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/List — 群列表(GET 业务路由)`

---

### POST /Group/MoveContractList

**说明**: 保存到通讯录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.MoveContractListParamDoc; {`QID`:string, `Val`:integer}` | Val == 3添加 2移除；请求示例：{&quot;QID&quot;:&quot;123456789@chatroom&quot;,&quot;Val&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 保存到通讯录成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/MoveContractList — 保存到通讯录 (QID + Val 1/0)`

---

### POST /Group/OperateChatRoomAdmin

**说明**: 群管理操作(添加、删除、转让)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.OperateChatRoomAdminParamDoc; {`QID`:string, `ToWxids`:string, `Val`:integer}` | ToWxids == 多个wxid用,隔开(仅限于添加/删除管理员) Val == 1添加 2删除 3转让；请求示例：{&quot;QID&quot;:&quot;123456789@chatroom&quot;,&quot;ToWxids&quot;:&quot;wxid_group_member&quot;,&quot;Val&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 群管理操作(添加、删除、转让)成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/OperateChatRoomAdmin — 群管理(增删转让) (QID + ToWxids + Val 1/2/3)`

---

### POST /Group/Quit

**说明**: 退出群聊

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.QuitGroupParamDoc; {`QID`:string}` | QID == 群ID；请求示例：{&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 退出群聊成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/Quit — 退出群聊 (QID)`

---

### POST /Group/ScanIntoGroup

**说明**: 扫码进群

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.ScanIntoGroupParamDoc; {`Url`:string}` | 只支持url；请求示例：{&quot;Url&quot;:&quot;group_invite_url_from_qr&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 扫码进群成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/ScanIntoGroup — 扫码进群 (Url)`

---

### POST /Group/ScanIntoGroupEnterprise

**说明**: 扫码进群(企业)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.ScanIntoGroupParamDoc; {`Url`:string}` | 只支持url；请求示例：{&quot;Url&quot;:&quot;group_invite_url_from_qr&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 扫码进群(企业)成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/ScanIntoGroupEnterprise — 扫码进群(企业) (Url)`

---

### POST /Group/SendPat

**说明**: 群拍一拍功能

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Group.SendPatParamDoc; {`QID`:string, `Scene`:integer, `ToUserName`:string}` | QID/ToUserName/Scene；请求示例：{&quot;QID&quot;:&quot;123456789@chatroom&quot;,&quot;Scene&quot;:2,&quot;ToUserName&quot;:&quot;wxid_group_member&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 群拍一拍功能成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/SendPat — 群拍一拍 (QID + Scene + ToUserName)`

---

### POST /Group/SendTransferGroupOwner

**说明**: 转让群

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Group.TransferGroupOwnerParamDoc; {`NewOwnerUserName`:string, `QID`:string}` | QID/NewOwnerUserName；请求示例：{&quot;NewOwnerUserName&quot;:&quot;wxid_group_member&quot;,&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 转让群成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `v1.1.35 GROUP-GHOST-FIX: /Group/SendTransferGroupOwner (vendor 实际端点, 之前 TransferGroupOwner 是 ghost)`

---

### POST /Group/SetChatRoomAnnouncement

**说明**: 设置群公告

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.OperateChatRoomInfoParamDoc; {`Content`:string, `QID`:string}` | Content == 公告内容；请求示例：{&quot;Content&quot;:&quot;项目交流群&quot;,&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置群公告成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `设置群公告 (vendor /Group/SetChatRoomAnnouncement)`

---

### POST /Group/SetChatRoomName

**说明**: 设置群名称

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.OperateChatRoomInfoParamDoc; {`Content`:string, `QID`:string}` | Content == 名称；请求示例：{&quot;Content&quot;:&quot;项目交流群&quot;,&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置群名称成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `设置群名称 (vendor /Group/SetChatRoomName)`

---

### POST /Group/SetChatRoomRemarks

**说明**: 设置群备注(仅自己可见)

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Group.OperateChatRoomInfoParamDoc; {`Content`:string, `QID`:string}` | QID == 群ID；请求示例：{&quot;Content&quot;:&quot;项目交流群&quot;,&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置群备注(仅自己可见)成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `设置群备注 (vendor /Group/SetChatRoomRemarks)`

---

### POST /Group/SetChatroomAccessVerify

**说明**: 设置群聊邀请开关

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `Group.SetChatroomAccessVerifyParamDoc; {`Enable`:boolean, `QID`:string}` | QID/Enable；请求示例：{&quot;Enable&quot;:true,&quot;QID&quot;:&quot;123456789@chatroom&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置群聊邀请开关成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — group.ts: `/Group/SetChatroomAccessVerify — 群聊邀请开关 (QID + Enable)`

---

## Label

> 标签模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Label/Add` | 添加标签 |
| 2 | `POST` | `/Label/Delete` | 删除标签 |
| 3 | `POST` | `/Label/GetList` | 获取标签列表 |
| 4 | `POST` | `/Label/GetWXFriendListByLabel` | 按标签获取好友列表 |
| 5 | `POST` | `/Label/UpdateList` | 更新标签列表 |
| 6 | `POST` | `/Label/UpdateName` | 修改标签 |

### POST /Label/Add

**说明**: 添加标签

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Label.AddParamDoc; {`LabelName*`:string}` | 新标签名称；请求示例：{&quot;LabelName&quot;:&quot;重点客户&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 添加标签成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — label.ts: `/Label/Add (v1.2.1 swagger-alignment: AddParamDoc {LabelName})`

---

### POST /Label/Delete

**说明**: 删除标签

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Label.DeleteParamDoc; {`LabelID*`:string}` | 要删除的标签 ID；请求示例：{&quot;LabelID&quot;:&quot;1&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 删除标签成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — label.ts: `/Label/Delete`

---

### POST /Label/GetList

**说明**: 获取标签列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取标签列表成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — label.ts: `/Label/GetList`

---

### POST /Label/GetWXFriendListByLabel

**说明**: 按标签获取好友列表

读取完整通讯录快照，精确匹配 labelId，返回好友名称、备注、头像及标签列表。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Label.GetWXFriendListByLabelParamDoc; {`labelId*`:integer}` | labelId 必填；请求示例：{&quot;labelId&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 按标签获取好友列表成功；响应示例：{"Code":0,"Data":{"contacts":[{"nickname":"示例好友","wxid":"wxid_example"}],"count":1},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — label.ts: `/Label/GetWXFriendListByLabel — 按标签拉好友 (v1.3.67 新 API; labelId 必须 number)`

---

### POST /Label/UpdateList

**说明**: 更新标签列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Label.UpdateListParamDoc; {`LabelID*`:string, `ToWxids*`:string}` | ToWxid:多个请用,隔开；请求示例：{&quot;LabelID&quot;:&quot;1&quot;,&quot;ToWxids&quot;:&quot;wxid_member_1,wxid_member_2&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 更新标签列表成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — label.ts: `/Label/UpdateList (v1.2.1 swagger-alignment: UpdateListParamDoc {LabelID, ToWxids})`

---

### POST /Label/UpdateName

**说明**: 修改标签

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Label.UpdateNameParamDoc; {`LabelID*`:integer, `NewName*`:string}` | 标签 ID 和新名称；请求示例：{&quot;LabelID&quot;:1,&quot;NewName&quot;:&quot;已成交客户&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 修改标签成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — label.ts: `/Label/UpdateName`

---

## User

> 微信号管理模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/User/AddMeMethods` | 设置允许别人添加我的方式 |
| 2 | `POST` | `/User/BindQQ` | 绑定QQ |
| 3 | `POST` | `/User/BindingEmail` | 绑定邮箱 |
| 4 | `POST` | `/User/BindingMobile` | 换绑手机号 |
| 5 | `GET` | `/User/CheckCanSetAlias` | 检测微信登录环境 |
| 6 | `POST` | `/User/DelSafetyInfo` | 删除登录设备 |
| 7 | `POST` | `/User/FriendVerification` | 设置加我为朋友时是否需要验证 |
| 8 | `GET` | `/User/GetAllOnline` | 获取所有在线wxid（需管理员 key） |
| 9 | `POST` | `/User/GetContractProfile` | 取个人信息 |
| 10 | `GET` | `/User/GetOnlineInfo` | 获取在线信息 |
| 11 | `POST` | `/User/GetQRCode` | 取个人二维码 |
| 12 | `POST` | `/User/GetSafetyInfo` | 登录设备管理 |
| 13 | `POST` | `/User/PrivacySettings` | 通用用户隐私设置 |
| 14 | `POST` | `/User/ReportMotion` | ReportMotion |
| 15 | `POST` | `/User/SendVerifyMobile` | 发送手机验证码 |
| 16 | `POST` | `/User/SetAlisa` | 设置微信号 |
| 17 | `POST` | `/User/SetPasswd` | 修改密码 |
| 18 | `POST` | `/User/UpdateProfile` | 修改个人信息 |
| 19 | `POST` | `/User/UploadHeadImage` | 修改头像 |
| 20 | `POST` | `/User/VerifyPasswd` | 验证密码 |

### POST /User/AddMeMethods

**说明**: 设置允许别人添加我的方式

对应微信「我→设置→朋友权限→添加我的方式」。支持手机号、微信号、群聊、我的二维码和名片。只修改请求中出现的字段，未传字段保持原状。true 表示允许通过该方式找到并添加，false 表示关闭该方式。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.AddMeMethodsParamDoc; {`contact_card`:boolean, `group_chat`:boolean, `phone`:boolean, `qr_code`:boolean, `wechat_id`:boolean}` | 至少提交一种添加方式；未提交的字段保持原状；请求示例：{&quot;contact_card&quot;:true,&quot;group_chat&quot;:true,&quot;phone&quot;:true,&quot;qr_code&quot;:true,&quot;wechat_id&quot;:true} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置允许别人添加我的方式成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/AddMeMethods — 添加我的方式 (v1.3.67 新 API; 各字段 true=允许该方式添加)`

---

### POST /User/BindQQ

**说明**: 绑定QQ

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.BindQQParamDoc; {`account*`:integer, `password*`:string}` | QQ 账号与密码；请求示例：{&quot;account&quot;:12345678,&quot;password&quot;:&quot;your_password&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 绑定QQ成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/BindQQ — 绑定QQ`

---

### POST /User/BindingEmail

**说明**: 绑定邮箱

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.EmailParamDoc; {`email*`:string}` | 要绑定的邮箱地址；请求示例：{&quot;email&quot;:&quot;api@example.com&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 绑定邮箱成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/BindingEmail — 绑定邮箱`

---

### POST /User/BindingMobile

**说明**: 换绑手机号

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.BindMobileParamDoc; {`authTicket`:string, `mobile*`:string, `mobileCheckType`:integer, `regSessionId`:string, `verifycode*`:string}` | 手机号、验证码与 SendVerifyMobile 返回的可选会话参数；请求示例：{&quot;authTicket&quot;:&quot;ticket_from_previous_response&quot;,&quot;mobile&quot;:&quot;+8613800138000&quot;,&quot;mobileCheckType&quot;:0,&quot;regSessionId&quot;:&quot;session_from_previous_response&quot;,&quot;verifycode&quot;:&quot;123456&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 换绑手机号成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/BindingMobile — 换绑手机号`

---

### GET /User/CheckCanSetAlias

**说明**: 检测微信登录环境

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码（必填） |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 检测微信登录环境成功；响应示例：{"Code":0,"Data":{"ready":true,"status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/CheckCanSetAlias — GET 检测环境`

---

### POST /User/DelSafetyInfo

**说明**: 删除登录设备

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.DelSafetyInfoParamDoc; {`uuid*`:string}` | uuid 从登录设备列表获取；请求示例：{&quot;uuid&quot;:&quot;uuid_from_device_list&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 删除登录设备成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/DelSafetyInfo — 删除登录设备`

---

### POST /User/FriendVerification

**说明**: 设置加我为朋友时是否需要验证

微信「我→设置→朋友权限→加我为朋友时需要验证」的专用接口。enabled=true 表示陌生人添加账号后需等待账号主人通过；enabled=false 表示关闭该验证开关。这不是「通过好友申请」接口，也不是朋友圈可见权限。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.FriendVerificationParamDoc; {`enabled*`:boolean}` | enabled=true 开启，enabled=false 关闭；请求示例：{&quot;enabled&quot;:true} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置加我为朋友时是否需要验证成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/FriendVerification — 加我为朋友时需要验证 (v1.3.67 新 API; enabled=true 需验证)`

---

### GET /User/GetAllOnline

**说明**: 获取所有在线wxid（需管理员 key）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `key` | ✅ | `string` | 管理员 adminkey |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取所有在线wxid（需管理员 key）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**探索笔记**: ⚠️ 部分可用

- 获取所有在线wxid (需管理员 key, query key 参数). 普通 authcode 无权限.
- 实测: 2026-08-10

---

### POST /User/GetContractProfile

**说明**: 取个人信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码（必填） |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 取个人信息成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/GetContractProfile — 取个人信息`

**探索笔记**: ✅ 可用

- 取个人资料。Data.userInfo: UserName(wxid)/NickName/Province/City/Signature/BindEmail/BindMobile/Sex. 无头像 URL 字段. 值多为 {'string':'...'} 包装.
- 实测: 2026-08-21

---

### GET /User/GetOnlineInfo

**说明**: 获取在线信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码（必填） |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取在线信息成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/GetOnlineInfo — GET 在线信息`

**探索笔记**: ✅ 可用

- 账号在线信息。Code==0 只代表能查到账号, 真在线看 Data.online==True (长连接已建, heartbeatRunning). wxid 在 Data.wxid.
- 实测: 2026-08-21

---

### POST /User/GetQRCode

**说明**: 取个人二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.GetQRCodeParamDoc; {`style`:integer}` | style 为二维码样式，默认 8；请求示例：{&quot;style&quot;:8} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 取个人二维码成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/GetQRCode — 个人二维码`

---

### POST /User/GetSafetyInfo

**说明**: 登录设备管理

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码（必填） |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 登录设备管理成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/GetSafetyInfo — 登录设备管理`

---

### POST /User/PrivacySettings

**说明**: 通用用户隐私设置

设置用户级隐私开关。「加我为朋友时需要验证」使用 function=4：value=1 开启验证，value=0 关闭验证。新接入方优先使用 /User/FriendVerification。这里的好友验证与 /FriendCircle/PrivacySettings 朋友圈可见范围不是同一功能。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.PrivacySettingsParamDoc; {`function*`:integer, `value*`:integer}` | function 填 4；value 填 1 表示开启，填 0 表示关闭；请求示例：{&quot;function&quot;:4,&quot;value&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 通用用户隐私设置成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/PrivacySettings — 隐私设置`

---

### POST /User/ReportMotion

**说明**: ReportMotion

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.ReportMotionParamDoc; {`deviceId*`:string, `deviceType*`:string, `stepCount*`:integer}` | 登录设备标识、设备类型和步数；请求示例：{&quot;deviceId&quot;:&quot;device_id_from_login_status&quot;,&quot;deviceType&quot;:&quot;iPad&quot;,&quot;stepCount&quot;:6000} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | ReportMotion成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/ReportMotion — ReportMotion`

---

### POST /User/SendVerifyMobile

**说明**: 发送手机验证码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.SendVerifyMobileParamDoc; {`authTicket`:string, `mobile*`:string, `mobileCheckType`:integer, `opcode`:integer, `regSessionId`:string}` | 手机号、场景及上一步返回的可选会话参数；请求示例：{&quot;authTicket&quot;:&quot;ticket_from_previous_response&quot;,&quot;mobile&quot;:&quot;+8613800138000&quot;,&quot;mobileCheckType&quot;:0,&quot;opcode&quot;:18,&quot;regSessionId&quot;:&quot;session_from_previous_response&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 发送手机验证码成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/SendVerifyMobile — 发送手机验证码`

---

### POST /User/SetAlisa

**说明**: 设置微信号

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.SetAlisaParamDoc; {`alisa*`:string}` | 新微信号；请求示例：{&quot;alisa&quot;:&quot;wechat_alias&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置微信号成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/SetAlisa — 设置微信号`

---

### POST /User/SetPasswd

**说明**: 修改密码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.NewSetPasswdParamDoc; {`newPassword*`:string, `ticket*`:string}` | 新密码与 VerifyPasswd 返回的 ticket；请求示例：{&quot;newPassword&quot;:&quot;your_new_password&quot;,&quot;ticket&quot;:&quot;ticket_from_verify_password&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 修改密码成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/SetPasswd — 修改密码`

---

### POST /User/UpdateProfile

**说明**: 修改个人信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.UpdateProfileParamDoc; {`city`:string, `country`:string, `nickName`:string, `province`:string, `sex`:integer, `signature`:string}` | 昵称、性别、地区和个性签名；请求示例：{&quot;city&quot;:&quot;Shenzhen&quot;,&quot;country&quot;:&quot;CN&quot;,&quot;nickName&quot;:&quot;接口测试&quot;,&quot;province&quot;:&quot;Guangdong&quot;,&quot;sex&quot;:1,&quot;signature&quot;:&quot;今日也要保持热爱&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 修改个人信息成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/UpdateProfile — 修改个人信息 (v1.2.1 swagger-alignment: UpdateProfileParam {NickName, Signature, Sex, City, Country, Province, Wxid})`

---

### POST /User/UploadHeadImage

**说明**: 修改头像

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.UploadHeadImageParamDoc; {`base64*`:string}` | 头像图片 Base64；请求示例：{&quot;base64&quot;:&quot;IMAGE_BASE64&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 修改头像成功；响应示例：{"Code":0,"Data":{"file_id":"FILE_ID","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/UploadHeadImage — 修改头像`

---

### POST /User/VerifyPasswd

**说明**: 验证密码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `User.NewVerifyPasswdParamDoc; {`password*`:string}` | 当前账号密码；请求示例：{&quot;password&quot;:&quot;your_password&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 验证密码成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — user.ts: `/User/VerifyPasswd — 验证密码`

---

## Wxapp

> 微信小程序模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Wxapp/AddAvatar` | 保存小程序头像 |
| 2 | `POST` | `/Wxapp/AddMobile` | 小程序绑定增加手机号 |
| 3 | `POST` | `/Wxapp/CloudCallFunction` | 调用小程序云函数 |
| 4 | `POST` | `/Wxapp/DelMobile` | 小程序删除手机号 |
| 5 | `POST` | `/Wxapp/DeleteOauthApp` | 删除授权管理里面的APP |
| 6 | `POST` | `/Wxapp/DellAvatar` | 删除小程序头像 |
| 7 | `POST` | `/Wxapp/GETCreditScoreParam` | 查询游戏信用积分 |
| 8 | `POST` | `/Wxapp/GetAllMobile` | 获取小程序授权手机号 |
| 9 | `POST` | `/Wxapp/GetOauthList` | 用户授权管理 |
| 10 | `POST` | `/Wxapp/GetRandomAvatar` | 获取随机头像候选 |
| 11 | `POST` | `/Wxapp/GetUnionPay` | 微信云闪付支付 |
| 12 | `POST` | `/Wxapp/GetUserOpenId` | GetUserOpenId |
| 13 | `POST` | `/Wxapp/GetWxAppRecord` | 获取小程序记录 |
| 14 | `POST` | `/Wxapp/JSGetSessionid` | 获取小程序支付会话 |
| 15 | `POST` | `/Wxapp/JSLogin` | 授权小程序(返回授权后的code) |
| 16 | `POST` | `/Wxapp/JSLoginCustomized` | 授权小程序(定制) |
| 17 | `POST` | `/Wxapp/JSOperateWxData` | 小程序操作 |
| 18 | `POST` | `/Wxapp/UploadAvatarImg` | 上传小程序头像图片 |
| 19 | `POST` | `/Wxapp/Verifyplugin` | 获取小程序插件授权信息 |
| 20 | `POST` | `/Wxapp/Wxapp/AddWxAppRecord` | 新增常用小程序记录 |
| 21 | `POST` | `/Wxapp/Wxapp/GetpullPay` | 确认小程序支付 |
| 22 | `POST` | `/Wxapp/Wxapp/JSGetSessionidQRcode` | 获取小程序支付二维码 |
| 23 | `POST` | `/Wxapp/Wxapp/QrcodeAuthLogin` | 确认扫码授权登录 |

### POST /Wxapp/AddAvatar

**说明**: 保存小程序头像

使用上传结果中的文件标识和昵称保存头像。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.AddAvatarParamDoc; {`aFilekey*`:string, `appid*`:string, `nickName*`:string}` | appid、头像文件标识和昵称；请求示例：{&quot;aFilekey&quot;:&quot;avatar_file_from_upload&quot;,&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;nickName&quot;:&quot;示例用户&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 保存小程序头像成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/AddAvatar`

---

### POST /Wxapp/AddMobile

**说明**: 小程序绑定增加手机号

使用短信验证码为小程序绑定手机号。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.CheckVerifyCodeDataDoc; {`appid*`:string, `mobile*`:string, `verifyCode*`:string}` | appid、手机号和验证码；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;mobile&quot;:&quot;+8613800138000&quot;,&quot;verifyCode&quot;:&quot;123456&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 小程序绑定增加手机号成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/AddMobile`

---

### POST /Wxapp/CloudCallFunction

**说明**: 调用小程序云函数

使用小程序 AppID 和 JSON 业务参数调用云函数。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.CloudCallParamDoc; {`appid*`:string, `data`:string}` | 小程序 appid 和云函数 JSON 业务参数；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;data&quot;:&quot;{}&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 调用小程序云函数成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/CloudCallFunction`

---

### POST /Wxapp/DelMobile

**说明**: 小程序删除手机号

从小程序授权信息中移除指定手机号。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.DelMobileDataDoc; {`appid*`:string, `mobile*`:string, `opcode`:integer}` | appid、要删除的手机号和操作类型；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;mobile&quot;:&quot;+8613800138000&quot;,&quot;opcode&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 小程序删除手机号成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/DelMobile`

---

### POST /Wxapp/DeleteOauthApp

**说明**: 删除授权管理里面的APP

- appid: 小程序 appid；

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.DefaultParamDoc; {`appid*`:string}` | 要移除授权的小程序 appid；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/DeleteOauthApp — 移除小程序授权 (v1.3.67 新 API; appid)`

---

### POST /Wxapp/DellAvatar

**说明**: 删除小程序头像

按头像列表返回的 ID 删除头像。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.DellAvatarParamDoc; {`avatarId*`:integer}` | 要删除的 avatarId；请求示例：{&quot;avatarId&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 删除小程序头像成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/DellAvatar`

---

### POST /Wxapp/GETCreditScoreParam

**说明**: 查询游戏信用积分

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.GETCreditScoreParamDoc` | 无业务参数，传空对象 {}；请求示例：{} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询游戏信用积分成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/GETCreditScoreParam`

---

### POST /Wxapp/GetAllMobile

**说明**: 获取小程序授权手机号

获取当前账号向指定小程序授权的手机号列表。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.JSOperateWxParamDoc; {`appid*`:string, `data`:string, `opt`:integer}` | appid、业务 data 和操作类型 opt；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;data&quot;:&quot;{}&quot;,&quot;opt&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取小程序授权手机号成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/GetAllMobile`

---

### POST /Wxapp/GetOauthList

**说明**: 用户授权管理

无需提供 body 字段，按授权码获取授权管理列表

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.OauthListParamDoc` | 无业务参数，传空对象 {}；请求示例：{} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/GetOauthList — 小程序授权列表 (v1.3.67 新 API; 无 body)`

---

### POST /Wxapp/GetRandomAvatar

**说明**: 获取随机头像候选

获取指定小程序可用的随机头像候选。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.DefaultParamDoc; {`appid*`:string}` | 小程序 appid；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取随机头像候选成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/GetRandomAvatar`

---

### POST /Wxapp/GetUnionPay

**说明**: 微信云闪付支付

示例：{"appid":"wx123...","sessionid":"xxx","timeStamp":"1700000000","nonceStr":"abc","package":"prepay_id=...","paySign":"xxx"}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `data` | ✅ | `Wxapp.UnionpayDataDoc; {`appid*`:string, `nonceStr*`:string, `package*`:string, `paySign*`:string, `sessionid*`:string, `timeStamp*`:string}` | 支付请求数据；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;nonceStr&quot;:&quot;nonce_from_order&quot;,&quot;package&quot;:&quot;prepay_id=order_from_response&quot;,&quot;paySign&quot;:&quot;signature_from_order&quot;,&quot;sessionid&quot;:&quot;session_from_order&quot;,&quot;timeStamp&quot;:&quot;1785686400&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 微信云闪付支付成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/GetUnionPay`

---

### POST /Wxapp/GetUserOpenId

**说明**: GetUserOpenId

示例：{"toWxId":"wxid_xxx","appid":"wx1234567890abcdef"}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.GetUserOpenIdParamDoc; {`appid*`:string, `toWxId*`:string}` | 小程序 appid 和目标用户 wxid；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;toWxId&quot;:&quot;wxid_example_contact&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | GetUserOpenId成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/GetUserOpenId`

---

### POST /Wxapp/GetWxAppRecord

**说明**: 获取小程序记录

获取当前账号保存的小程序记录，body 传空对象。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.GetWxAppRecordParamDoc` | 获取小程序记录；请求示例：{} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/GetWxAppRecord`

---

### POST /Wxapp/JSGetSessionid

**说明**: 获取小程序支付会话

使用小程序 AppID 创建支付会话。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.DefaultParamDoc; {`appid*`:string}` | 小程序 appid；账号由 X-Access-Token 绑定；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取小程序支付会话成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/JSGetSessionid`

---

### POST /Wxapp/JSLogin

**说明**: 授权小程序(返回授权后的code)

示例：{"appid":"wx1234567890abcdef"}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.DefaultParamDoc; {`appid*`:string}` | 小程序 appid；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 授权小程序(返回授权后的code)成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/JSLogin`

---

### POST /Wxapp/JSLoginCustomized

**说明**: 授权小程序(定制)

示例：{"appid":"wx1234567890abcdef"}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.DefaultParamDoc; {`appid*`:string}` | 小程序 appid；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 授权小程序(定制)成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/JSLoginCustomized — 小程序定制登录 (v1.3.67 新 API; appid)`

---

### POST /Wxapp/JSOperateWxData

**说明**: 小程序操作

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.JSOperateWxParamDoc; {`appid*`:string, `data`:string, `opt`:integer}` | appid、业务 data 和操作类型 opt；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;data&quot;:&quot;{}&quot;,&quot;opt&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 小程序操作成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/JSOperateWxData`

---

### POST /Wxapp/UploadAvatarImg

**说明**: 上传小程序头像图片

从可访问的 JPG 地址上传头像图片。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.AddAvatarImgParamDoc; {`appid*`:string, `jpgLink*`:string}` | appid 和可访问的 JPG 图片地址；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;jpgLink&quot;:&quot;https://example.com/avatar.jpg&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 上传小程序头像图片成功；响应示例：{"Code":0,"Data":{"file_id":"FILE_ID","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/UploadAvatarImg`

---

### POST /Wxapp/Verifyplugin

**说明**: 获取小程序插件授权信息

提交小程序 AppID、业务参数和操作类型，返回插件授权结果。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.JSOperateWxParamDoc; {`appid*`:string, `data`:string, `opt`:integer}` | appid、插件业务 data 和操作类型 opt；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;data&quot;:&quot;{}&quot;,&quot;opt&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取小程序插件授权信息成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/Verifyplugin`

---

### POST /Wxapp/Wxapp/AddWxAppRecord

**说明**: 新增常用小程序记录

将指定小程序加入当前账号的常用记录。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.AddWxAppRecordParamDoc; {`username*`:string}` | 小程序 username；请求示例：{&quot;username&quot;:&quot;gh_example@app&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 新增常用小程序记录成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/Wxapp/AddWxAppRecord (v1.2.1 swagger-alignment: AddWxAppRecordParamDoc {username})`

---

### POST /Wxapp/Wxapp/GetpullPay

**说明**: 确认小程序支付

使用支付下单结果发起确认。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.GetpullPayParamDoc; {`appid*`:string, `nonceStr*`:string, `package*`:string, `paySign*`:string, `sessionid*`:string, `timeStamp*`:string}` | 小程序支付下单结果：appid、sessionid、timeStamp、nonceStr、package、paySign；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;nonceStr&quot;:&quot;nonce_from_order&quot;,&quot;package&quot;:&quot;prepay_id=order_from_response&quot;,&quot;paySign&quot;:&quot;signature_from_order&quot;,&quot;sessionid&quot;:&quot;session_from_order&quot;,&quot;timeStamp&quot;:&quot;1785686400&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 确认小程序支付成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/Wxapp/GetpullPay`

---

### POST /Wxapp/Wxapp/JSGetSessionidQRcode

**说明**: 获取小程序支付二维码

使用支付下单结果生成付款二维码。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.SessionidQRParamDoc; {`appid*`:string, `nonceStr*`:string, `package*`:string, `paySign*`:string, `sessionid*`:string, `timeStamp*`:string}` | 小程序支付下单结果：appid、sessionid、timeStamp、nonceStr、package、paySign；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;nonceStr&quot;:&quot;nonce_from_order&quot;,&quot;package&quot;:&quot;prepay_id=order_from_response&quot;,&quot;paySign&quot;:&quot;signature_from_order&quot;,&quot;sessionid&quot;:&quot;session_from_order&quot;,&quot;timeStamp&quot;:&quot;1785686400&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取小程序支付二维码成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/Wxapp/JSGetSessionidQRcode`

---

### POST /Wxapp/Wxapp/QrcodeAuthLogin

**说明**: 确认扫码授权登录

使用二维码返回的 UUID 确认应用或网页授权登录。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Wxapp.QrcodeAuthLoginParamDoc; {`uuid*`:string}` | 获取二维码时返回的 uuid；请求示例：{&quot;uuid&quot;:&quot;uuid_from_qrcode&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 确认扫码授权登录成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — wxapp.ts: `/Wxapp/Wxapp/QrcodeAuthLogin`

---

## QWContact

> 企业联系人操作

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/QWContact/QWAddContact` | 添加企业联系人 |
| 2 | `POST` | `/QWContact/QWApplyAddContact` | 申请添加企业联系人 |
| 3 | `POST` | `/QWContact/SearchQWContact` | 搜索企业联系人 |

### POST /QWContact/QWAddContact

**说明**: 添加企业联系人

使用企业联系人搜索结果中的 username 和 v1 发起添加。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | ✅ | `QWContact.QWAddContactParamDoc; {`username*`:string, `v1*`:string}` | 搜索结果中的联系人标识；请求示例：{&quot;username&quot;:&quot;wm_example_contact&quot;,&quot;v1&quot;:&quot;contact_credential_from_search&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 添加企业联系人成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — qwcontact.ts: `/QWContact/QWAddContact — 搜索结果添加 (v1.3.67 路径去重 + 对齐 username/v1; 旧 /QWContact/QWContact/QWAddContact 已废弃)`

---

### POST /QWContact/QWApplyAddContact

**说明**: 申请添加企业联系人

向指定企业联系人发起申请，context 可填写验证说明。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | ✅ | `QWContact.QWApplyAddContactParamDoc; {`context`:string, `username*`:string, `v1*`:string}` | 联系人标识与申请说明；请求示例：{&quot;context&quot;:&quot;你好，希望添加你为联系人&quot;,&quot;username&quot;:&quot;wm_example_contact&quot;,&quot;v1&quot;:&quot;contact_credential_from_search&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 申请添加企业联系人成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — qwcontact.ts: `/QWContact/QWApplyAddContact — 企业联系人添加 (v1.3.67 对齐新 swagger: context/username/v1)`

---

### POST /QWContact/SearchQWContact

**说明**: 搜索企业联系人

按 username 搜索企业联系人，返回后续添加所需的业务标识。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | ✅ | `QWContact.AddWxAppRecordParamDoc; {`username*`:string}` | 企业联系人 username；请求示例：{&quot;username&quot;:&quot;wm_example_contact&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 搜索企业联系人成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — qwcontact.ts: `/QWContact/SearchQWContact — 企业联系人搜索 (v1.3.67 对齐 username; 旧 keyword 已废弃)`

---

## OfficialAccounts

> 公众号模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/OfficialAccounts/ArticleList` | 获取指定公众号文章列表 |
| 2 | `POST` | `/OfficialAccounts/ArticleMarkdown` | 解析公众号文章为 Markdown |
| 3 | `POST` | `/OfficialAccounts/ArticleRead` | 读取公众号文章 |
| 4 | `POST` | `/OfficialAccounts/AuthMpLogin` | 授权公众号登录 |
| 5 | `POST` | `/OfficialAccounts/Follow` | 关注 |
| 6 | `POST` | `/OfficialAccounts/GetAppMsgExt` | 查询公众号文章互动数据 |
| 7 | `POST` | `/OfficialAccounts/GetAppMsgExtLike` | 点赞公众号文章 |
| 8 | `POST` | `/OfficialAccounts/GetMpHistory` | 获取公众号历史消息 |
| 9 | `POST` | `/OfficialAccounts/GetMpHistoryMessage` | 获取公众号历史消息HTML |
| 10 | `POST` | `/OfficialAccounts/JSAPIPreVerify` | JSAPIPreVerify |
| 11 | `POST` | `/OfficialAccounts/MpGetA8Key` | 获取公众号文章访问信息 |
| 12 | `POST` | `/OfficialAccounts/OauthAuthorize` | 授权公众号页面 |
| 13 | `POST` | `/OfficialAccounts/QRConnectAuthorize` | 二维码授权请求 |
| 14 | `POST` | `/OfficialAccounts/QRConnectAuthorizeConfirm` | 二维码授权确认 |
| 15 | `POST` | `/OfficialAccounts/Quit` | 取消关注 |

### POST /OfficialAccounts/ArticleList

**说明**: 获取指定公众号文章列表

通过公众号 __biz 标识或历史页链接返回结构化文章列表，支持分页。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.ArticleListParamDoc; {`account_id`:string, `history_url`:string, `limit`:integer, `offset`:integer, `url`:string}` | account_id/history_url 选填一项；以下使用公众号稳定标识分页；请求示例：{&quot;account_id&quot;:&quot;ACCOUNT_BIZ_ID&quot;,&quot;limit&quot;:20,&quot;offset&quot;:0} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取指定公众号文章列表成功；响应示例：{"Code":0,"Data":{"articles":[{"title":"示例文章","url":"https://example.com/article"}],"count":1},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/ArticleList — 公众号文章列表 (v1.3.67 新 API; account_id 或 history_url 选填)`

---

### POST /OfficialAccounts/ArticleMarkdown

**说明**: 解析公众号文章为 Markdown

使用当前账号登录态取得公众号文章，返回标题、公众号、发布时间、Markdown 正文和图片地址。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.ArticleMarkdownParamDoc; {`url*`:string}` | 公众号文章 URL；请求示例：{&quot;url&quot;:&quot;https://mp.weixin.qq.com/s/ARTICLE_TOKEN&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 解析公众号文章为 Markdown成功；响应示例：{"Code":0,"Data":{"articles":[{"title":"示例文章","url":"https://example.com/article"}],"count":1},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/ArticleMarkdown — 公众号文章转 Markdown (v1.3.67 新 API; url=文章链接)`

---

### POST /OfficialAccounts/ArticleRead

**说明**: 读取公众号文章

按微信文章页链路解析短链接，返回稳定页面标识、正文 Markdown、图片和内容校验值；响应不包含临时授权参数。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.ArticleReadParamDoc; {`url*`:string}` | 公众号文章链接；请求示例：{&quot;url&quot;:&quot;https://mp.weixin.qq.com/s/ARTICLE_TOKEN&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 读取公众号文章成功；响应示例：{"Code":0,"Data":{"articles":[{"title":"示例文章","url":"https://example.com/article"}],"count":1},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/ArticleRead — 公众号文章阅读解析 (v1.3.67 新 API; url=文章链接)`

---

### POST /OfficialAccounts/AuthMpLogin

**说明**: 授权公众号登录

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.AuthMpLoginParamDoc; {`scene`:integer, `url*`:string}` | 授权页面链接与场景；请求示例：{&quot;scene&quot;:0,&quot;url&quot;:&quot;https://mp.weixin.qq.com/mp/profile_ext?action=home\u0026__biz=ACCOUNT_BIZ_ID&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 授权公众号登录成功；响应示例：{"Code":0,"Data":{"login_state":"ready","status":"success"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/AuthMpLogin`

---

### POST /OfficialAccounts/Follow

**说明**: 关注

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.DefaultParamDoc; {`appid*`:string}` | 公众号 AppID；请求示例：{&quot;FinderUsername&quot;:&quot;finder_username_from_search_response&quot;,&quot;Value&quot;:&quot;人工智能&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 关注成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/Follow`

---

### POST /OfficialAccounts/GetAppMsgExt

**说明**: 查询公众号文章互动数据

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.ReadParamDoc; {`url*`:string}` | 公众号文章链接；请求示例：{&quot;url&quot;:&quot;https://mp.weixin.qq.com/s/ARTICLE_TOKEN&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 查询公众号文章互动数据成功；响应示例：{"Code":0,"Data":{"articles":[{"title":"示例文章","url":"https://example.com/article"}],"count":1},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/GetAppMsgExt`

---

### POST /OfficialAccounts/GetAppMsgExtLike

**说明**: 点赞公众号文章

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.ReadParamDoc; {`url*`:string}` | 公众号文章链接；请求示例：{&quot;url&quot;:&quot;https://mp.weixin.qq.com/s/ARTICLE_TOKEN&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 点赞公众号文章成功；响应示例：{"Code":0,"Data":{"articles":[{"title":"示例文章","url":"https://example.com/article"}],"count":1},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/GetAppMsgExtLike`

---

### POST /OfficialAccounts/GetMpHistory

**说明**: 获取公众号历史消息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.GetMpHistoryMsgParamDoc; {`url*`:string}` | 公众号历史页链接；请求示例：{&quot;url&quot;:&quot;https://mp.weixin.qq.com/mp/profile_ext?action=home\u0026__biz=ACCOUNT_BIZ_ID&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取公众号历史消息成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/GetMpHistory (v1.2.1 swagger-alignment: GetMpHistoryMsgParam {url, wxid})`

---

### POST /OfficialAccounts/GetMpHistoryMessage

**说明**: 获取公众号历史消息HTML

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.GetMpHistoryMsgParamDoc; {`url*`:string}` | 公众号历史页链接；请求示例：{&quot;url&quot;:&quot;https://mp.weixin.qq.com/mp/profile_ext?action=home\u0026__biz=ACCOUNT_BIZ_ID&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取公众号历史消息HTML成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/GetMpHistoryMessage`

---

### POST /OfficialAccounts/JSAPIPreVerify

**说明**: JSAPIPreVerify

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| query | `url` | ✅ | `string` | 需要 JSAPI 权限校验的完整页面 URL |
| query | `appid` | ✅ | `string` | 公众号 AppID |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | JSAPIPreVerify成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/JSAPIPreVerify`

---

### POST /OfficialAccounts/MpGetA8Key

**说明**: 获取公众号文章访问信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.ReadParamDoc; {`url*`:string}` | 公众号文章链接；请求示例：{&quot;url&quot;:&quot;https://mp.weixin.qq.com/s/ARTICLE_TOKEN&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取公众号文章访问信息成功；响应示例：{"Code":0,"Data":{"articles":[{"title":"示例文章","url":"https://example.com/article"}],"count":1},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/MpGetA8Key`

---

### POST /OfficialAccounts/OauthAuthorize

**说明**: 授权公众号页面

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.GetkeyParamDoc; {`appid*`:string, `url*`:string}` | 页面 URL 和公众号 AppID；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;url&quot;:&quot;https://example.com/article&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 授权公众号页面成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/OauthAuthorize`

---

### POST /OfficialAccounts/QRConnectAuthorize

**说明**: 二维码授权请求

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.QRConnectParamDoc; {`url*`:string}` | 二维码授权页面链接；请求示例：{&quot;url&quot;:&quot;https://open.weixin.qq.com/connect/qrconnect?appid=wx1234567890abcdef&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 二维码授权请求成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/QRConnectAuthorize`

---

### POST /OfficialAccounts/QRConnectAuthorizeConfirm

**说明**: 二维码授权确认

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.QRConnectParamDoc; {`url*`:string}` | 二维码授权页面链接；请求示例：{&quot;url&quot;:&quot;https://open.weixin.qq.com/connect/qrconnect?appid=wx1234567890abcdef&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 二维码授权确认成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/QRConnectAuthorizeConfirm`

---

### POST /OfficialAccounts/Quit

**说明**: 取消关注

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `OfficialAccounts.DefaultParamDoc; {`appid*`:string}` | 公众号 AppID；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 取消关注成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — officialaccounts.ts: `/OfficialAccounts/Quit`

---

## SayHello

> 打招呼模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/SayHello/Modelv1` | 通过联系人二维码申请好友 |
| 2 | `POST` | `/SayHello/Modelv2` | 通过微信号或手机号申请好友 |
| 3 | `POST` | `/SayHello/Modelv3` | 使用搜索结果申请好友 |

### POST /SayHello/Modelv1

**说明**: 通过联系人二维码申请好友

提交二维码链接和申请说明；当前账号由访问令牌绑定。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | ✅ | `SayHello.Model1ParamDoc; {`url*`:string, `verifyContent`:string}` | 二维码链接与申请说明；请求示例：{&quot;url&quot;:&quot;https://u.wechat.com/example&quot;,&quot;verifyContent&quot;:&quot;你好，希望添加你为好友&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 通过联系人二维码申请好友成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — sayhello.ts: `* /SayHello/Modelv1 — 打招呼模式1: 扫二维码加好友 (swagger: url 二维码链接必填, verifyContent 申请说明可选)      * v1.3.66 对齐新 swagger (旧插件误传 scene/v1, 新旧 swagger 均 url/verifyContent)`

---

### POST /SayHello/Modelv2

**说明**: 通过微信号或手机号申请好友

搜索联系人后提交好友申请，来源场景应与实际入口一致。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | ✅ | `SayHello.Model2ParamDoc; {`content`:string, `fromScene`:integer, `scene`:integer, `searchScene`:integer, `toUserName*`:string}` | 联系人、来源场景与申请说明；请求示例：{&quot;content&quot;:&quot;你好，希望添加你为好友&quot;,&quot;fromScene&quot;:0,&quot;scene&quot;:15,&quot;searchScene&quot;:1,&quot;toUserName&quot;:&quot;wechat_example&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 通过微信号或手机号申请好友成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — sayhello.ts: `* /SayHello/Modelv2 — 打招呼模式2: 搜索加好友 (swagger: toUserName 微信号/手机号必填, content 申请说明,      * scene 来源场景默认15, fromScene 搜索来源默认0, searchScene 搜索场景默认1)      * v1.3.66 对齐新 swagger (旧插件误传 v1/v2)`

---

### POST /SayHello/Modelv3

**说明**: 使用搜索结果申请好友

使用前序搜索返回的联系人标识和验证凭据提交申请。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| body | `body` | ✅ | `SayHello.SendRequestParam1Doc; {`scene*`:integer, `v3*`:string, `v4*`:string, `verifyContent`:string}` | 搜索结果凭据与申请说明；请求示例：{&quot;scene&quot;:15,&quot;v3&quot;:&quot;contact_id_from_search&quot;,&quot;v4&quot;:&quot;verification_credential_from_search&quot;,&quot;verifyContent&quot;:&quot;你好，希望添加你为好友&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 使用搜索结果申请好友成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — sayhello.ts: `* /SayHello/Modelv3 — 打招呼模式3: 用搜索结果凭据提交申请 (v1.3.67 新 API)      * scene=来源场景, v3=联系人凭据, v4=备用凭据, verifyContent=申请说明`

---

## Tools

> 工具箱模块

| # | Method | Path | 说明 |
|---|---|---|---|
| 1 | `POST` | `/Tools/CdnDownloadImage` | 通过CDN下载微信图片 |
| 2 | `POST` | `/Tools/DownloadFile` | 下载微信文件分片（底层） |
| 3 | `POST` | `/Tools/DownloadFileBinary` | 完整下载微信文件（二进制） |
| 4 | `POST` | `/Tools/DownloadImg` | 下载微信图片分片 |
| 5 | `POST` | `/Tools/DownloadVideo` | 下载微信视频分片 |
| 6 | `POST` | `/Tools/DownloadVoice` | 下载语音消息（JSON 兼容接口） |
| 7 | `POST` | `/Tools/DownloadVoiceBinary` | 下载微信语音原文件（二进制） |
| 8 | `GET` | `/Tools/GeneratePayQCode` | 生成支付二维码 |
| 9 | `POST` | `/Tools/GetA8Key` | GetA8Key |
| 10 | `POST` | `/Tools/GetBandCardList` | 获取余额以及银行卡信息 |
| 11 | `POST` | `/Tools/GetBoundHardDevices` | GetBoundHardDevices |
| 12 | `POST` | `/Tools/GetCdnDns` | 获取CDN服务器dns信息 |
| 13 | `POST` | `/Tools/HelperVerification` | 辅助验证手机号 |
| 14 | `POST` | `/Tools/OauthSdkApp` | 授权 SDK 应用 |
| 15 | `POST` | `/Tools/SetStep` | 修改微信步数 |
| 16 | `POST` | `/Tools/ThirdAppGrant` | 第三方APP授权 |
| 17 | `POST` | `/Tools/UploadFile` | 文件上传 |
| 18 | `POST` | `/Tools/setproxy` | 设置/删除代理IP |

### POST /Tools/CdnDownloadImage

**说明**: 通过CDN下载微信图片

使用接收消息返回的图片下载信息，选择原图、标准图或缩略图并返回图片内容。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.CdnDownloadImageParamDoc; {`file_aes_key*`:string, `file_no*`:string}` | 直接提交 image.cdn_download_contexts 中所需清晰度的对象；请求示例：{&quot;file_aes_key&quot;:&quot;file_key_from_message&quot;,&quot;file_no&quot;:&quot;file_no_from_message&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 通过CDN下载微信图片成功；响应示例：{"Code":0,"Data":{"content_type":"application/octet-stream","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/CdnDownloadImage — CDN 下载高清图片 (v1.2.1 P1-fix: 字段对齐 swagger {fileAesKey, fileNo})`

**探索笔记**: ✅ 可用

- v1 图片 CDN 完整大图 (首选). body {fileAesKey, fileNo} (来自 image.cdn_download_contexts). 返回 Data.Image (base64). 实测 373KB 成功.
- 调用示例: `{"fileAesKey":"<aes_key>","fileNo":"<file_no>"}`
- 实测: 2026-08-21

---

### POST /Tools/DownloadFile

**说明**: 下载微信文件分片（底层）

使用接收消息返回的文件下载信息获取一个分片；需要完整原文件时优先使用 DownloadFileBinary。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.DownloadAppAttachParamDoc; {`app_id`:string, `attach_id*`:string, `data_len*`:integer, `section`:Tools.DownloadSectionDoc, `user_name*`:string}` | 直接提交 file.download_context；请求示例：{&quot;app_id&quot;:&quot;ID_10001&quot;,&quot;attach_id&quot;:&quot;attach_id_from_message&quot;,&quot;data_len&quot;:102400,&quot;section&quot;:{&quot;data_len&quot;:65536,&quot;start_pos&quot;:0},&quot;user_name&quot;:&quot;wxid_sender&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 下载微信文件分片（底层）成功；响应示例：{"Code":0,"Data":{"content_type":"application/octet-stream","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/DownloadFile — 文件下载 (v1.2.1 P1-fix: swagger 字段是 appID/attachId, 非 aesKey/fileId)`

---

### POST /Tools/DownloadFileBinary

**说明**: 完整下载微信文件（二进制）

可直接提交消息回调中的文件对象、下载信息或完整消息。服务端自动下载所有分片并返回原始文件字节。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.BinaryFileDownloadParamDoc; {`app_id`:string, `attach_id*`:string, `data_len*`:integer, `file_name`:string, `section`:Tools.DownloadSectionDoc, `user_name*`:string}` | 直接提交 file 或 file.download_context；请求示例：{&quot;app_id&quot;:&quot;ID_10001&quot;,&quot;attach_id&quot;:&quot;attach_id_from_message&quot;,&quot;data_len&quot;:102400,&quot;file_name&quot;:&quot;document.pdf&quot;,&quot;section&quot;:{&quot;data_len&quot;:65536,&quot;start_pos&quot;:0},&quot;user_name&quot;:&quot;wxid_sender&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | {string} binary 二进制响应示例：Content-Type=application/octet-stream | `` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `* v1.3.25 SWAGGER-254: /Tools/DownloadFileBinary — 完整下载微信文件 (二进制).      * (media-enrich 已直接用, 补 wrapper + 注册)`

**探索笔记**: ✅ 可用

- v1 文件完整下载. authcode 走 query + TokenKey header. body {attach_id, user_name, data_len, section}. 返回原始字节流 (非 base64!). 100MB cap.
- 调用示例: `{"attach_id":"@cdn_...","user_name":"wxid_xxx","data_len":24575,"section":{"start_pos":0,"data_len":24575}}`
- 实测: 2026-08-21

---

### POST /Tools/DownloadImg

**说明**: 下载微信图片分片

将收到消息的 image.download_context 原样作为请求体；必填 to_wxid、msg_id、data_len、section.start_pos、section.data_len。群聊 to_wxid 使用 xxx@chatroom。每次按实际返回字节数推进 start_pos，直到达到 data_len。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.DownloadParamDoc; {`compress_type`:integer, `data_len*`:integer, `msg_id*`:integer, `section`:Tools.DownloadSectionDoc, `to_wxid*`:string}` | 直接提交 image.download_context；请求示例：{&quot;compress_type&quot;:0,&quot;data_len&quot;:102400,&quot;msg_id&quot;:10001,&quot;section&quot;:{&quot;data_len&quot;:65536,&quot;start_pos&quot;:0},&quot;to_wxid&quot;:&quot;wxid_sender&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 下载微信图片分片成功；响应示例：{"Code":0,"Data":{"content_type":"application/octet-stream","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/DownloadImg`

**探索笔记**: ⚠️ 部分可用

- v1 图片下载 (首 64KB JPEG, vendor 硬限). 必填 msg_id(用 local_id uint32 非 svr_id!)/to_wxid/data_len/compress_type/section. ret:-104 'cacheSize do not equal totalLen' = 缓存无此图, 走 /Tools/CdnDownloadImage.
- 调用示例: `{"msg_id":1996983105,"to_wxid":"q139198824","data_len":33349,"compress_type":0,"section":{"start_pos":0,"data_len":33349}}`
- 实测: 2026-08-21

---

### POST /Tools/DownloadVideo

**说明**: 下载微信视频分片

将收到消息的 video.download_context 原样作为请求体；必填 msg_id、data_len、section.start_pos、section.data_len。每次按实际返回字节数推进 start_pos，直到达到 data_len。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.DownloadParamDoc; {`compress_type`:integer, `data_len*`:integer, `msg_id*`:integer, `section`:Tools.DownloadSectionDoc, `to_wxid*`:string}` | 直接提交 video.download_context；请求示例：{&quot;compress_type&quot;:0,&quot;data_len&quot;:102400,&quot;msg_id&quot;:10001,&quot;section&quot;:{&quot;data_len&quot;:65536,&quot;start_pos&quot;:0},&quot;to_wxid&quot;:&quot;wxid_sender&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 下载微信视频分片成功；响应示例：{"Code":0,"Data":{"content_type":"application/octet-stream","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/DownloadVideo`

**探索笔记**: ✅ 可用

- v1 视频分片下载. body {to_wxid, msg_id, data_len, section:{start_pos,data_len}, compress_type}. 分片循环: startPos 从0, 每段 min(1MB,totalLen-startPos), 直到 startPos>=totalLen. 每段响应 Data.data.buffer (base64) 或 Data.Video; Data.totalLen 动态更新真实总长. 终止条件用 startPos>=totalLen (别用 chunk.length<sectionLen, 每段固定 61440 提前 break). 200MB cap.
- 实测: 2026-08-21

---

### POST /Tools/DownloadVoice

**说明**: 下载语音消息（JSON 兼容接口）

返回 Base64 格式语音数据。需要直接获取音频文件时使用 DownloadVoiceBinary。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.DownloadVoiceParamDoc; {`bufid`:string, `fromUserName*`:string, `length*`:integer, `msgId*`:integer}` | 注意参数；请求示例：{&quot;bufid&quot;:&quot;buffer_id_from_message&quot;,&quot;fromUserName&quot;:&quot;wxid_sender&quot;,&quot;length&quot;:32000,&quot;msgId&quot;:10001} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 下载语音消息（JSON 兼容接口）成功；响应示例：{"Code":0,"Data":{"content_type":"application/octet-stream","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/DownloadVoice`

**探索笔记**: ✅ 可用

- 语音下载 (v0). body {aesKey, fileNo} (from parseVoiceXml). 返回 base64.
- 实测: 2026-08-10

---

### POST /Tools/DownloadVoiceBinary

**说明**: 下载微信语音原文件（二进制）

可直接提交 WS/Webhook 消息的 voice 对象、voice.download_context 或完整消息。服务端自动完成语音分片下载，响应为 SILK/AMR/MP3/WAV 等原始音频字节。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.BinaryVoiceDownloadParamDoc; {`chat_room_name`:string, `client_msg_id`:string, `file_name`:string, `format`:integer, `from_user_name`:string, `length`:integer, `master_buf_id`:string, `msg_id`:integer, `new_msg_id`:string, `to_user_name`:string}` | 直接提交 voice 或 voice.download_context；请求示例：{&quot;chat_room_name&quot;:&quot;12345678901@chatroom&quot;,&quot;client_msg_id&quot;:&quot;ID_10001&quot;,&quot;file_name&quot;:&quot;voice.silk&quot;,&quot;format&quot;:1,&quot;from_user_name&quot;:&quot;wxid_example&quot;,&quot;length&quot;:20,&quot;master_buf_id&quot;:&quot;ID_10001&quot;,&quot;msg_id&quot;:10001,&quot;new_msg_id&quot;:&quot;ID_10001&quot;,&quot;to_user_name&quot;:&quot;wxid_example&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | {string} binary 二进制响应示例：Content-Type=application/octet-stream | `` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `* v1.3.25 SWAGGER-254: /Tools/DownloadVoiceBinary — 下载微信语音原文件 (二进制).      * (media-enrich 已直接用, 补 wrapper + 注册)`

---

### GET /Tools/GeneratePayQCode

**说明**: 生成支付二维码

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 生成支付二维码成功；响应示例：{"Code":0,"Data":{"expires_in":240,"qr_code_url":"https://example.com/qrcode","uuid":"UUID"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/GeneratePayQCode — GET 生成支付二维码`

---

### POST /Tools/GetA8Key

**说明**: GetA8Key

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.GetA8KeyParamDoc; {`codeType`:integer, `codeVersion`:integer, `cookieBase64`:string, `flag`:integer, `netType`:string, `opCode`:integer, `reqUrl*`:string, `scene`:integer}` | OpCode == 2 Scene == 4 CodeType == 19 CodeVersion == 5 以上是默认参数,如有需求自行修改；请求示例：{&quot;codeType&quot;:0,&quot;codeVersion&quot;:0,&quot;cookieBase64&quot;:&quot;U0FNUExFX0RBVEE=&quot;,&quot;flag&quot;:0,&quot;netType&quot;:&quot;wifi&quot;,&quot;opCode&quot;:2,&quot;reqUrl&quot;:&quot;https://example.com/article&quot;,&quot;scene&quot;:1} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | GetA8Key成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/GetA8Key`

---

### POST /Tools/GetBandCardList

**说明**: 获取余额以及银行卡信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取余额以及银行卡信息成功；响应示例：{"Code":0,"Data":{"count":1,"has_more":false,"items":[{"id":"ID_10001","name":"示例条目"}]},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/GetBandCardList`

---

### POST /Tools/GetBoundHardDevices

**说明**: GetBoundHardDevices

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | GetBoundHardDevices成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/GetBoundHardDevices`

---

### POST /Tools/GetCdnDns

**说明**: 获取CDN服务器dns信息

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取CDN服务器dns信息成功；响应示例：{"Code":0,"Data":{"id":"ID_10001","name":"示例名称","status":"ready"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/GetCdnDns`

---

### POST /Tools/HelperVerification

**说明**: 辅助验证手机号

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.HelperVerificationParamDoc; {`gcc*`:string, `mobile*`:string}` | 手机号与国家/地区码；请求示例：{&quot;gcc&quot;:&quot;86&quot;,&quot;mobile&quot;:&quot;13800138000&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 辅助验证手机号成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/HelperVerification`

---

### POST /Tools/OauthSdkApp

**说明**: 授权 SDK 应用

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.OauthSdkAppParamDoc; {`appid*`:string, `avatarId`:integer, `opt`:integer, `packageName`:string, `state`:string}` | appid、包名、操作类型与状态参数；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;avatarId&quot;:1,&quot;opt&quot;:1,&quot;packageName&quot;:&quot;com.example.app&quot;,&quot;state&quot;:&quot;state_from_authorize_request&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 授权 SDK 应用成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/OauthSdkApp`

---

### POST /Tools/SetStep

**说明**: 修改微信步数

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.SetStepParamDoc; {`step*`:integer}` | 步数，最高支持98000；请求示例：{&quot;step&quot;:6000} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 修改微信步数成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

---

### POST /Tools/ThirdAppGrant

**说明**: 第三方APP授权

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.ThirdAppGrantParamDoc; {`appid*`:string, `url*`:string}` | 注意参数；请求示例：{&quot;appid&quot;:&quot;wx1234567890abcdef&quot;,&quot;url&quot;:&quot;https://example.com/oauth&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 第三方APP授权成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/ThirdAppGrant`

---

### POST /Tools/UploadFile

**说明**: 文件上传

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.UploadParamDoc; {`base64*`:string}` | 文件上传；请求示例：{&quot;base64&quot;:&quot;FILE_BASE64&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 文件上传成功；响应示例：{"Code":0,"Data":{"file_id":"FILE_ID","size":1024,"url":"https://example.com/file"},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/UploadFile`

---

### POST /Tools/setproxy

**说明**: 设置/删除代理IP

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | — | `string` | 授权码(推荐) |
| body | `body` | ✅ | `Tools.SetProxyParamDoc; {`proxy*`:string}` | 删除代理ip时直接留空即可；请求示例：{&quot;proxy&quot;:&quot;127.0.0.1:7890&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置/删除代理IP成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — tools.ts: `/Tools/setproxy — 修改微信步数. 保持用 setproxy (实测 2026-08-20 新 vendor Code:1 可用).      *  新端点 /Tools/SetStep 有 vendor bug (Step.go:107 index out of range panic → HTTP 500), 勿切.`

---

## Webhook

> WebhookController 管理每个账号（按授权码） 的 webhook 配置

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
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取业务回调URL（按授权码）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — webhook.ts: `/Webhook/Business/Get — GET 业务回调 URL (按授权码)`

**探索笔记**: ✅ 可用

- 获取业务回调URL (按授权码).
- 实测: 2026-08-10

---

### POST /Webhook/Business/Set

**说明**: 设置业务回调URL（按授权码）

curl -X POST "http://0.0.0.0:8057/api/Webhook/Business/Set?authcode=ac123" -H "Content-Type: application/json" -d '{"syncMessageUrl":"http://127.0.0.1:6999/wic/wechat/{authcode}/SyncMessage","logoutUrl":"http://127.0.0.1:6999/wic/wechat/{authcode}/logoutSys"}'

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `businesscfg.BusinessConfig; {`eventUrl`:string, `logoutUrl`:string, `syncMessageUrl`:string}` | 回调配置；请求示例：{&quot;eventUrl&quot;:&quot;https://your-server.example.com/wechat/events&quot;,&quot;logoutUrl&quot;:&quot;https://your-server.example.com/wechat/logout&quot;,&quot;syncMessageUrl&quot;:&quot;https://your-server.example.com/wechat/messages&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置业务回调URL（按授权码）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — webhook.ts: `/Webhook/Business/Set — POST 设置业务回调 URL`

**探索笔记**: ✅ 可用

- 设置业务回调URL. body {eventUrl, logoutUrl, syncMessageUrl}.
- 实测: 2026-08-10

---

### GET /Webhook/Get

**说明**: 获取 Webhook 配置（按授权码）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 获取 Webhook 配置（按授权码）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — webhook.ts: `/Webhook/Get — GET Webhook 配置 (按授权码)`

---

### POST /Webhook/Remove

**说明**: 删除 Webhook 配置（按授权码）

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 删除 Webhook 配置（按授权码）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — webhook.ts: `/Webhook/Remove — POST 删除 Webhook 配置`

---

### POST /Webhook/Set

**说明**: 设置 Webhook 配置（按授权码）

const crypto = require('crypto');\nconst ok = (body, secret) => {\n  const bases = `${body.Wxid}:${body.MessageType}:${body.Timestamp}`;\n  const expect = crypto.createHmac('sha256', secret).update(bases).digest('hex');\n  return expect === body.Signature;\n}

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `webhook.WebhookConfigDoc; {`enabled`:boolean, `includeSelfMessage`:boolean, `messageTypes`:array<string>, `retryCount`:integer, `secret`:string, `timeout`:integer, `url*`:string}` | 回调地址、签名与事件过滤配置；请求示例：{&quot;enabled&quot;:true,&quot;includeSelfMessage&quot;:false,&quot;messageTypes&quot;:[&quot;示例内容&quot;],&quot;retryCount&quot;:3,&quot;secret&quot;:&quot;your-signature-secret&quot;,&quot;timeout&quot;:5,&quot;url&quot;:&quot;https://your-server.example.com/webhook&quot;} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 设置 Webhook 配置（按授权码）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — webhook.ts: `/Webhook/Set — POST 设置 Webhook 配置`

**探索笔记**: ✅ 可用

- 配置消息回调 URL. body {url, enabled, enabledSet, includeSelfMessage, messageTypes, secret, timeout}. messageTypes 空=全部.
- 调用示例: `{"url":"http://x/wpp/webhook","enabled":true,"enabledSet":true,"includeSelfMessage":false,"messageTypes":[]}`
- 实测: 2026-08-21

---

### POST /Webhook/Test

**说明**: 测试发送 Webhook 消息（按授权码）

响应：发送成功返回 OK；失败返回错误信息。

**参数**:

| 位置 | 名称 | 必填 | 类型 | 说明 |
|---|---|---|---|---|
| query | `authcode` | ✅ | `string` | 授权码 |
| body | `body` | ✅ | `models.WebhookTestRequest; {`MessageType*`:string, `TestData`:models.BusinessDataDoc}` | 测试请求体；请求示例：{&quot;MessageType&quot;:&quot;sync_message&quot;,&quot;TestData&quot;:{}} |

**响应**:

| 状态码 | 说明 | 类型 |
|---|---|---|
| 200 | 测试发送 Webhook 消息（按授权码）成功；响应示例：{"Code":0,"Data":{"result":true},"Message":"成功","Success":true,"request_id":"REQUEST_ID"} | `models.ResponseResultDoc` |

**实测调用** (源码 `send/*.ts`):

- `()` — webhook.ts: `/Webhook/Test — POST 测试发送 Webhook 消息`

---


## 附录: 定义 (Definitions)

### Admin.DelayAuthKeyModel

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `authcode` | ✅ | `string` | 要延期的授权码 |
| `days` | ✅ | `integer` | 延长天数 |

### Admin.DeleteAuthKeyModel

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `authcode` | ✅ | `string` | 要回收的授权码 |

### Admin.GenAuthKeyModel

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `count` | ✅ | `integer` | 生成数量 |
| `days` | ✅ | `integer` | 有效天数 |
| `remark` | — | `string` | 授权用途备注 |

### Admin.RedisMemoryRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `action` | ✅ | `string` | 操作：stats、scan、cleanup_expired、adaptive_status 或 adaptive_set |
| `dryRun` | — | `boolean` | 仅预览不写入 |
| `enabled` | — | `boolean` | 自适应清理开关 |
| `limit` | — | `integer` | 最多返回或处理数量 |
| `pattern` | — | `string` | 键名过滤表达式 |
| `ttlWithinSeconds` | — | `integer` | 过期时间窗口（秒） |

### Customized.WXCTDUniftyAuthParmDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Username` | ✅ | `string` | 要批量授权的账号 |

### Favor.DelParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `favId` | ✅ | `integer` | 要删除的收藏记录 ID |

### Favor.GetFavItemParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `favId` | ✅ | `integer` | 收藏记录 ID |

### Favor.SyncParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `keybuf` | — | `string` | 上一页返回的同步游标；首次传空字符串 |

### Finder.CommentParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `CommentId` | — | `string` | 评论 ID；新建根评论时留空 |
| `Content` | — | `string` | 评论文字 |
| `Id` | — | `string` | 内容 ID |
| `ObjectNonceId` | — | `string` | 内容响应中的业务凭据 |
| `OpType` | — | `integer` | 操作类型 |
| `ReplyCommentId` | — | `string` | 要回复的评论 ID |
| `ReplyUsername` | — | `string` | 要回复的用户 username |
| `RootCommentId` | — | `string` | 根评论 ID |
| `Scene` | — | `integer` | 内容来源场景 |
| `SessionBuffer` | — | `string` | 内容响应中的会话凭据 |
| `Username` | — | `string` | 内容作者 username |

### Finder.DecryptParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Content` | — | `string` | 待解析的视频号分享内容 |

### Finder.DefaultParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderUsername` | — | `string` | 视频号 username，来自搜索或详情响应 |
| `Value` | — | `string` | 操作值；查询时可填搜索关键词 |

### Finder.FinderGetMsgSessionIdParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderUsername` | — | `string` | 目标视频号 username |

### Finder.FinderGetTopicListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LastBuffer` | — | `string` | 上一页返回的翻页凭据；首页留空 |
| `TopTitle` | — | `string` | 话题分类标题 |

### Finder.FinderJoinLiveParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `DetId` | — | `integer` | 直播详情标识 |
| `FbrKey` | — | `string` | 直播详情返回的进入凭据 |
| `FinderUser` | — | `string` | 主播视频号 username |
| `Id` | — | `integer` | 直播内容标识 |
| `ObjectNonceId` | — | `string` | 直播详情返回的内容凭据 |

### Finder.FinderLiveDetailParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderNonceID` | — | `string` | 直播列表返回的业务凭据 |
| `FinderObjectID` | — | `integer` | 直播内容 ID |

### Finder.FinderSendTextParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderUsername` | — | `string` | 目标视频号 username |
| `Text` | — | `string` | 要发送的文字 |

### Finder.GetCommentDetailParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderUsername` | — | `string` | 作者视频号 username |
| `Id` | — | `integer` | 内容 ID |
| `LastBuffer` | — | `string` | 上一页返回的翻页凭据；首页留空 |
| `ObjectNonceId` | — | `string` | 内容响应中的业务凭据 |
| `RootCommentId` | — | `integer` | 根评论 ID；获取全部评论时传 0 |

### Finder.GetRecommendParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `FinderEnt` | — | `string` | 企业视频号标识；无时留空 |
| `FinderUsername` | — | `string` | 当前视频号 username；无时留空 |
| `Latitude` | — | `integer` | 位置纬度整数值；无位置时传 0 |
| `Longitude` | — | `integer` | 位置经度整数值；无位置时传 0 |
| `PullType` | — | `integer` | 拉取类型 |
| `SpecialRequestScene` | — | `integer` | 特殊请求场景；默认 0 |
| `TabTipsObjectId` | — | `integer` | 标签页内容 ID；默认 0 |

### Finder.LikeParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `CommentId` | — | `string` | 评论 ID；点赞内容时留空 |
| `CurLikeCount` | — | `integer` | 当前点赞数 |
| `FinderUsername` | — | `string` | 内容作者 username |
| `Id` | — | `string` | 内容 ID |
| `LikeId` | — | `string` | 已有点赞 ID；首次点赞留空 |
| `LikeUsername` | — | `string` | 点赞用户 username；默认当前账号 |
| `ObjectNonceId` | — | `string` | 内容响应中的业务凭据 |
| `OpType` | — | `integer` | 操作类型 |
| `Scene` | — | `integer` | 内容来源场景 |
| `SessionBuffer` | — | `string` | 内容响应中的会话凭据 |

### Finder.PlayVideoParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `async` | — | `boolean` |  |
| `feed_id` | — | `string` |  |
| `finder_username` | — | `string` |  |
| `interval_seconds` | — | `integer` |  |
| `loop` | — | `boolean` |  |
| `loop_count` | — | `integer` |  |
| `object_id` | — | `string` |  |
| `object_nonce_id` | — | `string` |  |
| `play_seconds` | — | `integer` |  |
| `play_url` | — | `string` |  |
| `range_bytes` | — | `integer` |  |
| `referer` | — | `string` |  |
| `request_interval_ms` | — | `integer` |  |
| `urls` | — | `array<string>` |  |
| `user_agent` | — | `string` |  |

### Finder.PlayVideoStopParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `task_id` | — | `string` |  |

### Finder.TargetUserPageParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LastBuffer` | — | `string` | 上一页返回的翻页凭据；首页留空 |
| `Target` | — | `string` | 目标视频号 username |

### Friend.BlacklistParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `toWxid` | ✅ | `string` | 好友 wxid |
| `val` | ✅ | `integer` | 15=加入黑名单，7=移除黑名单 |

### Friend.DefaultParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `toWxid` | ✅ | `string` | 好友 wxid |

### Friend.FriendRelationParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `opCode` | — | `integer` | 查询类型 |
| `toWxid` | ✅ | `string` | 联系人 wxid |

### Friend.GetContractDetailparameterDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `userName` | ✅ | `string` | 联系人 wxid，多个用逗号分隔，最多 20 个 |

### Friend.GetContractListparameterDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `currentChatRoomContactSeq` | — | `integer` | 上次返回的群同步序号；首次传 0 |
| `currentWxcontactSeq` | — | `integer` | 上次返回的好友同步序号；首次传 0 |

### Friend.LbsFindParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `latitude` | ✅ | `number` | 纬度 |
| `longitude` | ✅ | `number` | 经度 |
| `opCode` | — | `integer` | 操作类型 |

### Friend.PassVerifyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `scene` | ✅ | `integer` | 好友申请来源场景 |
| `v1` | ✅ | `string` | 好友申请返回的 v1 |
| `v2` | ✅ | `string` | 好友申请返回的 v2 |

### Friend.SearchParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `fromScene` | — | `integer` | 来源场景，默认 0 |
| `keyword` | ✅ | `string` | 微信号、手机号或其他可搜索标识 |
| `searchScene` | — | `integer` | 搜索场景，默认 1 |
| `verifyScene` | — | `integer` | 验证场景 |

### Friend.SendRequestParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `opcode` | — | `integer` | 操作类型 |
| `scene` | — | `integer` | 好友来源场景 |
| `sourceContext` | — | `string` | 推荐直接使用 Search 返回的 source_context |
| `v1` | — | `string` | 兼容字段，使用 Search 返回的 v1 |
| `v2` | — | `string` | 兼容字段，使用 Search 返回的 v2 |
| `verifyContent` | — | `string` | 验证说明 |

### Friend.SetRemarksParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `remarks` | ✅ | `string` | 新备注 |
| `toWxid` | ✅ | `string` | 好友 wxid |

### Friend.UploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `currentPhoneNo` | ✅ | `string` | 当前账号手机号 |
| `opcode` | ✅ | `integer` | 1=上传，2=删除 |
| `phoneNo` | ✅ | `string` | 联系人手机号，多个用逗号分隔 |

### FriendCircle.CdnSnsImageUploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `imageData` | ✅ | `string` | 图片 Base64 |

### FriendCircle.CdnSnsImagesUploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `imageDataList` | ✅ | `array<string>` | 图片内容列表，每项为一张图片 |

### FriendCircle.CommentParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `content` | — | `string` | 评论文字 |
| `id` | ✅ | `string` | 朋友圈 ID |
| `replyCommnetId` | — | `integer` | 要回复的评论 ID；新评论传 0 |
| `toWxid` | — | `string` | 发布者 wxid |
| `type` | ✅ | `integer` | 操作类型 |

### FriendCircle.DownloadMediaModelDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `key` | ✅ | `string` | 媒体访问凭据，来自动态详情 |
| `url` | ✅ | `string` | 媒体地址，来自动态详情 |

### FriendCircle.GetCollectCircleParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `sourceId` | ✅ | `string` | 朋友圈 ID 或收藏中的原动态 ID |

### FriendCircle.GetCommnetParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `xmlData` | ✅ | `string` | 消息同步返回的朋友圈评论 XML |

### FriendCircle.GetDetailparameterDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `fristpagemd5` | — | `string` | 上次首页返回的校验值；首次留空 |
| `maxid` | — | `integer` | 上一页最后一条 ID；首页传 0 |
| `towxid` | ✅ | `string` | 目标用户 wxid |

### FriendCircle.GetIdDetailParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `id` | ✅ | `integer` | 朋友圈 ID |
| `towxid` | — | `string` | 发布者 wxid |

### FriendCircle.GetListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `fristpagemd5` | — | `string` | 上次首页返回的校验值；首次留空 |
| `maxid` | — | `integer` | 上一页最后一条 ID；首页传 0 |

### FriendCircle.MessagearameterDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `blackList` | — | `string` | 不可见用户 wxid，多个用逗号分隔 |
| `content` | ✅ | `string` | 原始发布内容 |
| `groupUserList` | — | `string` | 提醒查看用户 wxid |
| `private` | — | `integer` | 0=公开，1=私密 |
| `withUserList` | — | `string` | 指定可见用户 wxid |

### FriendCircle.MmSnsSyncParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `synckey` | — | `string` | 上次同步返回的凭据；首次留空 |

### FriendCircle.OperationParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `commnetId` | — | `integer` | 评论 ID |
| `id` | ✅ | `string` | 朋友圈 ID |
| `type` | ✅ | `integer` | 操作类型 |

### FriendCircle.PrivacySettingsParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `function` | ✅ | `integer` | 权限功能类型 |
| `value` | ✅ | `integer` | 权限值 |

### FriendCircle.RequestParamsDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `forwardAddr` | ✅ | `string` | 评论回调地址 |
| `id` | ✅ | `string` | 朋友圈 ID |

### FriendCircle.SendFavItemCircleParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `blackList` | — | `FriendCircle.SnsUserListInput` |  |
| `favItemId` | ✅ | `integer` | 收藏记录 ID |
| `location` | — | `FriendCircle.SnsPostLocationItem` |  |
| `locationMode` | — | `integer` |  |
| `sourceId` | ✅ | `string` | 收藏内容对应的原动态 ID |

### FriendCircle.SendOneIDCircleParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `blackList` | — | `FriendCircle.SnsUserListInput` |  |
| `id` | ✅ | `string` | 要转发的朋友圈 ID |
| `location` | — | `FriendCircle.SnsPostLocationItem` |  |
| `locationMode` | — | `integer` | 0=保留，1=移除，2=自定义 |

### FriendCircle.SetBackgroundImageParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `thumbUrl` | — | `string` | 背景缩略图地址 |
| `url` | ✅ | `string` | 背景大图地址 |

### FriendCircle.SetFriendCircleDaysParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `range` | ✅ | `string` | 可见范围：three_days、one_month、six_months 或 all |

### FriendCircle.SnsPostImageItemDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `height` | — | `integer` | 图片高度 |
| `md5` | — | `string` | 图片 MD5 |
| `thumbUrl` | — | `string` | 上传结果中的缩略图 URL |
| `totalSize` | — | `integer` | 图片字节数 |
| `url` | ✅ | `string` | 上传结果中的图片 URL |
| `width` | — | `integer` | 图片宽度 |

### FriendCircle.SnsPostLinkItemDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `contentUrl` | — | `string` | 链接目标地址 |
| `description` | — | `string` | 链接摘要 |
| `height` | — | `integer` | 缩略图高度 |
| `md5` | — | `string` | 缩略图 MD5 |
| `thumbUrl` | — | `string` | 缩略图地址 |
| `title` | ✅ | `string` | 链接标题 |
| `totalSize` | — | `integer` | 缩略图字节数 |
| `url` | ✅ | `string` | 链接地址 |
| `width` | — | `integer` | 缩略图宽度 |

### FriendCircle.SnsPostLocationItem

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `city` | — | `string` |  |
| `latitude` | — | `string` |  |
| `longitude` | — | `string` |  |
| `poiAddress` | — | `string` |  |
| `poiClassifyId` | — | `string` |  |
| `poiClassifyType` | — | `integer` |  |
| `poiClickableStatus` | — | `integer` |  |
| `poiInfoUrl` | — | `string` |  |
| `poiName` | — | `string` |  |
| `poiScale` | — | `integer` |  |

### FriendCircle.SnsPostLocationItemDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `city` | — | `string` | 城市 |
| `latitude` | ✅ | `string` | 纬度 |
| `longitude` | ✅ | `string` | 经度 |
| `poiAddress` | — | `string` | 位置地址 |
| `poiClassifyId` | — | `string` | 位置分类 ID |
| `poiClassifyType` | — | `integer` | 位置分类类型 |
| `poiClickableStatus` | — | `integer` | 位置是否可点击 |
| `poiInfoUrl` | — | `string` | 位置详情地址 |
| `poiName` | — | `string` | 位置名称 |
| `poiScale` | — | `integer` | 地图缩放级别 |

### FriendCircle.SnsPostRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `blackList` | — | `string` | 不可见 wxid，多个用逗号分隔 |
| `groupUserList` | — | `string` | 提醒查看 wxid |
| `images` | — | `array<FriendCircle.SnsPostImageItemDoc>` |  |
| `link` | — | `FriendCircle.SnsPostLinkItemDoc` |  |
| `location` | — | `FriendCircle.SnsPostLocationItemDoc` |  |
| `private` | — | `integer` | 0=公开，1=私密 |
| `title` | — | `string` | 文字内容 |
| `video` | — | `FriendCircle.SnsPostVideoItemDoc` |  |
| `withUserList` | — | `string` | 指定可见 wxid |

### FriendCircle.SnsPostVideoItemDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `thumbmd5` | — | `string` | 封面 MD5 |
| `thumburl` | ✅ | `string` | 上传结果中的封面地址 |
| `totalSize` | — | `string` | 视频字节数 |
| `videomd5` | — | `string` | 视频 MD5 |
| `videourl` | ✅ | `string` | 上传结果中的视频地址 |

### FriendCircle.SnsUploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `base64` | ✅ | `string` | 图片 Base64 |

### FriendCircle.SnsUploadVideoParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `thumbData` | ✅ | `string` | 封面 Base64 |
| `videoData` | ✅ | `string` | 视频 Base64 |

### FriendCircle.SnsUserListInput

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### Group.AddChatRoomParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ChatRoomName` | — | `string` | 群 ID |
| `ToWxids` | — | `string` | 成员 wxid，多个用逗号分隔 |

### Group.ConsentToJoinParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Url` | — | `string` | 群邀请链接 |

### Group.CreateChatRoomParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ToWxids` | — | `string` | 初始成员 wxid，多个用逗号分隔 |

### Group.FacingCreateChatRoomParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Latitude` | — | `number` | 纬度 |
| `Longitude` | — | `number` | 经度 |
| `OpCode` | — | `integer` | 操作类型 |
| `Password` | — | `string` | 面对面建群四位数密码 |

### Group.GetChatRoomParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` | 群 ID |

### Group.MoveContractListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` | 群 ID |
| `Val` | — | `integer` | 操作值 |

### Group.OperateChatRoomAdminParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` | 群 ID |
| `ToWxids` | — | `string` | 目标成员 wxid，多个用逗号分隔 |
| `Val` | — | `integer` | 管理操作类型 |

### Group.OperateChatRoomInfoParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Content` | — | `string` | 群名、群备注或群公告内容，由具体接口决定 |
| `QID` | — | `string` | 群 ID |

### Group.QuitGroupParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` | 群 ID |

### Group.ScanIntoGroupParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Url` | — | `string` | 群邀请链接或二维码解析链接 |

### Group.SendPatParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `QID` | — | `string` | 群 ID |
| `Scene` | — | `integer` | 场景，默认 2 |
| `ToUserName` | — | `string` | 被拍成员 wxid |

### Group.SetChatroomAccessVerifyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Enable` | — | `boolean` | true=开启邀请确认，false=关闭 |
| `QID` | — | `string` | 群 ID |

### Group.TransferGroupOwnerParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `NewOwnerUserName` | — | `string` | 新群主 wxid |
| `QID` | — | `string` | 群 ID |

### Label.AddParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LabelName` | ✅ | `string` | 标签名称 |

### Label.DeleteParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LabelID` | ✅ | `string` | 标签 ID |

### Label.GetWXFriendListByLabelParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `labelId` | ✅ | `integer` | 标签 ID |

### Label.UpdateListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LabelID` | ✅ | `string` | 标签 ID |
| `ToWxids` | ✅ | `string` | 联系人 wxid，多个用逗号分隔 |

### Label.UpdateNameParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `LabelID` | ✅ | `integer` | 标签 ID |
| `NewName` | ✅ | `string` | 新标签名称 |

### Login.A16LoginParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `A16` | ✅ | `string` | 客户端登录凭据 |
| `DeviceName` | — | `string` | 本次登录显示的设备名称 |
| `Password` | ✅ | `string` | 登录密码 |
| `Proxy` | — | `Login.LoginProxyParamDoc` | 可选网络代理；直连时传空对象 |
| `UserName` | ✅ | `string` | 登录账号 |

### Login.AccountSafetySummaryDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `internally_consistent` | — | `boolean` |  |
| `issues` | — | `array<string>` |  |
| `last_refresh_unix` | — | `integer` |  |
| `next_refresh_allowed_unix` | — | `integer` |  |
| `refresh_in_flight` | — | `boolean` |  |
| `safe` | — | `boolean` |  |

### Login.CacheInfoPublicViewDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `alias` | — | `string` |  |
| `auto_auth_ready` | — | `boolean` |  |
| `client_version_name` | — | `string` |  |
| `device_brand` | — | `string` |  |
| `device_model` | — | `string` |  |
| `device_name` | — | `string` |  |
| `device_type` | — | `string` |  |
| `login_active` | — | `boolean` |  |
| `login_at` | — | `integer` |  |
| `nickname` | — | `string` |  |
| `os_version` | — | `string` |  |
| `safety` | — | `Login.AccountSafetySummaryDoc` |  |
| `service_enabled` | — | `boolean` |  |
| `session_ready` | — | `boolean` |  |
| `sync_ready` | — | `boolean` |  |
| `wxid` | — | `string` |  |

### Login.CacheInfoResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `Login.CacheInfoPublicViewDoc` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### Login.Data62LoginReqDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Data62` | ✅ | `string` | 客户端登录凭据 |
| `DeviceName` | — | `string` | 本次登录显示的设备名称 |
| `Password` | ✅ | `string` | 登录密码 |
| `Proxy` | — | `Login.LoginProxyParamDoc` | 可选网络代理；直连时传空对象 |
| `UserName` | ✅ | `string` | 登录账号 |

### Login.Data62QRCodeVerifyReqDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Proxy` | — | `Login.LoginProxyParamDoc` | 可选网络代理；直连时传空对象 |
| `Url` | ✅ | `string` | 上一步响应返回的二维码验证地址 |

### Login.Data62SMSAgainReqDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Cookie` | ✅ | `string` | 上一步响应返回的验证会话 |
| `Proxy` | — | `Login.LoginProxyParamDoc` | 可选网络代理；直连时传空对象 |
| `Url` | ✅ | `string` | 上一步响应返回的验证地址 |

### Login.Data62SMSVerifyReqDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Cookie` | ✅ | `string` | 上一步响应返回的验证会话 |
| `Proxy` | — | `Login.LoginProxyParamDoc` | 可选网络代理；直连时传空对象 |
| `Sms` | ✅ | `string` | 短信验证码 |
| `Url` | ✅ | `string` | 上一步响应返回的验证地址 |

### Login.ExtDeviceLoginConfirmParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Url` | ✅ | `string` | 登录响应返回的设备确认地址 |

### Login.GetQRReq

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `DeviceName` | — | `string` | 二维码登录显示的设备名称 |
| `Proxy` | — | `models.ProxyInfo` |  |
| `oversea` | — | `boolean` | 是否使用海外登录入口 |

### Login.HeartbeatRuntimeStatus

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `consecutiveFailures` | — | `integer` |  |
| `lastCode` | — | `integer` |  |
| `lastFailureAt` | — | `integer` |  |
| `lastSessionRefreshAt` | — | `integer` |  |
| `lastSuccessAt` | — | `integer` |  |
| `nextHeartbeatAt` | — | `integer` |  |
| `nextSessionRefreshAt` | — | `integer` |  |
| `running` | — | `boolean` |  |

### Login.LoginProxyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ProxyIp` | — | `string` | 可选代理地址，格式 host:port；直连时留空 |
| `ProxyPassword` | — | `string` | 可选代理密码 |
| `ProxyUser` | — | `string` | 可选代理用户名 |

### Login.LoginStatusJournal

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `count` | — | `integer` |  |
| `logs` | — | `array<string>` |  |
| `source` | — | `string` |  |

### Login.LoginStatusRecovery

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `attempted` | — | `boolean` |  |
| `code` | — | `integer` |  |
| `message` | — | `string` |  |
| `succeeded` | — | `boolean` |  |

### Login.LoginStatusResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `Login.LoginStatusView` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### Login.LoginStatusView

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `autoAuthReady` | — | `boolean` |  |
| `autoLogin` | — | `Login.LoginStatusRecovery` |  |
| `expiryAt` | — | `integer` |  |
| `expiryTime` | — | `string` |  |
| `heartbeatStatus` | — | `Login.HeartbeatRuntimeStatus` |  |
| `loginAt` | — | `integer` |  |
| `loginErrMsg` | — | `string` |  |
| `loginJournal` | — | `Login.LoginStatusJournal` |  |
| `loginState` | — | `string` |  |
| `loginTime` | — | `string` |  |
| `longLinkReady` | — | `boolean` |  |
| `longLinkRegistered` | — | `boolean` |  |
| `longLinkStatus` | — | `TcpPoll.LongLinkStatus` |  |
| `online` | — | `boolean` |  |
| `onlineDays` | — | `integer` |  |
| `onlineSeconds` | — | `integer` |  |
| `onlineTime` | — | `string` |  |
| `proxyConfigured` | — | `boolean` |  |
| `proxyUrl` | — | `string` |  |
| `runtimeState` | — | `string` |  |
| `runtimeStateUpdatedAt` | — | `integer` |  |
| `sessionReady` | — | `boolean` |  |
| `syncReady` | — | `boolean` |  |
| `targetHost` | — | `string` |  |
| `targetIp` | — | `string` |  |
| `totalOnlineKnown` | — | `boolean` |  |
| `wxid` | — | `string` |  |

### Login.MaccodeParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `deviceID` | — | `string` | 取码响应返回的设备标识；留空时按 UUID 恢复 |
| `uuid` | ✅ | `string` | 取码响应返回的 UUID |

### Login.VerificationcodeParam

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `code` | — | `string` | 必填；用户扫码后收到的登录验证码。请求体只填写此字段，示例：{"code":"123456"} |

### Msg.ApplicationFileMessage

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `base64` | ✅ | `string` | 文件内容 |
| `fileName` | ✅ | `string` | 文件名 |

### Msg.ApplicationLinkMessage

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `description` | — | `string` | 链接摘要 |
| `thumbUrl` | — | `string` | 缩略图地址 |
| `title` | ✅ | `string` | 链接标题 |
| `url` | ✅ | `string` | 完整的 HTTP 或 HTTPS 地址 |

### Msg.ApplicationMessageItem

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `file` | — | `Msg.ApplicationFileMessage` |  |
| `kind` | ✅ | `string` | 消息类型：link、mini_program、music 或 file |
| `link` | — | `Msg.ApplicationLinkMessage` |  |
| `miniProgram` | — | `Msg.ApplicationMiniProgramMessage` |  |
| `music` | — | `Msg.ApplicationMusicMessage` |  |
| `toUserId` | ✅ | `string` | 接收人 wxid 或群 ID |

### Msg.ApplicationMessageItemResultDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `code` | — | `integer` |  |
| `index` | — | `integer` |  |
| `kind` | — | `string` |  |
| `message` | — | `string` |  |
| `receipt` | — | `Msg.ApplicationMessageReceipt` |  |
| `retryAfterSeconds` | — | `integer` |  |
| `success` | — | `boolean` |  |
| `toUserId` | — | `string` |  |

### Msg.ApplicationMessageReceipt

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `clientMessageId` | — | `string` |  |
| `createTime` | — | `integer` |  |
| `localMessageId` | — | `integer` |  |
| `newMessageId` | — | `string` |  |
| `toUserId` | — | `string` |  |

### Msg.ApplicationMiniProgramMessage

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appId` | ✅ | `string` | 小程序 AppID |
| `description` | — | `string` | 卡片摘要 |
| `envType` | — | `integer` | 环境类型，0 为正式版 |
| `pagePath` | ✅ | `string` | 小程序页面路径 |
| `thumbUrl` | — | `string` | 卡片缩略图 |
| `title` | ✅ | `string` | 卡片标题 |
| `username` | ✅ | `string` | 小程序 username |
| `version` | — | `integer` | 小程序版本号 |

### Msg.ApplicationMusicMessage

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `audioUrl` | ✅ | `string` | 音频地址 |
| `description` | — | `string` | 音乐摘要 |
| `lowAudioUrl` | — | `string` | 低码率音频地址 |
| `pageUrl` | — | `string` | 音乐详情页 |
| `thumbUrl` | — | `string` | 封面地址 |
| `title` | ✅ | `string` | 音乐标题 |

### Msg.DefaultParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Content` | — | `string` | 消息内容 |
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |

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
| `content` | ✅ | `string` | 回复文字 |
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
| `ClientMsgId` | — | `string` | 原消息客户端 ID |
| `CreateTime` | — | `integer` | 原消息创建时间（秒） |
| `NewMsgId` | — | `string` | 发送响应中的服务器消息 ID |
| `ToUserName` | — | `string` | 原消息接收方 |

### Msg.SendAppMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |
| `Type` | — | `integer` | 应用消息类型 |
| `Xml` | — | `string` | 来自业务卡片或已接收消息的应用消息内容 |

### Msg.SendApplicationMessagesParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `items` | ✅ | `array<Msg.ApplicationMessageItem>` | 待发送的应用消息列表，最多 20 条 |

### Msg.SendApplicationMessagesResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `Data` | — | `Msg.SendApplicationMessagesResultDoc` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### Msg.SendApplicationMessagesResultDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `failed` | — | `integer` |  |
| `items` | — | `array<Msg.ApplicationMessageItemResultDoc>` |  |
| `succeeded` | — | `integer` |  |
| `total` | — | `integer` |  |

### Msg.SendEmojiParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Md5` | — | `string` | 表情 MD5 |
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |
| `TotalLen` | — | `integer` | 表情字节数 |

### Msg.SendFileParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Base64` | — | `string` | 文件 Base64 |
| `FileName` | — | `string` | 文件名 |
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |

### Msg.SendGroupMassMsgTextParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Content` | — | `string` | 群发文本 |
| `ToIds` | — | `array<string>` |  |

### Msg.SendImageMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Base64` | — | `string` | 图片 Base64 |
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |

### Msg.SendNewMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `At` | — | `string` | 群消息中需要 @ 的成员 wxid |
| `Content` | — | `string` | 文本消息 |
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |
| `Type` | — | `integer` | 消息类型，文本传 1 |

### Msg.SendVideoMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Base64` | — | `string` | 视频 Base64 |
| `ImageBase64` | — | `string` | 封面图 Base64 |
| `PlayLength` | — | `integer` | 视频时长（秒） |
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |

### Msg.SendVoiceMessageParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Base64` | — | `string` | 语音 Base64 |
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |
| `Type` | — | `integer` | 语音格式类型 |
| `VoiceTime` | — | `integer` | 语音时长（毫秒） |

### Msg.ShareCardParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `CardAlias` | — | `string` | 名片微信号 |
| `CardNickName` | — | `string` | 名片昵称 |
| `CardWxId` | — | `string` | 名片账号 wxid |
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |

### Msg.ShareLocationParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Infourl` | — | `string` | 位置详情链接 |
| `Label` | — | `string` | 位置说明 |
| `Poiname` | — | `string` | 地点名称 |
| `Scale` | — | `number` | 地图缩放级别 |
| `ToWxid` | — | `string` | 接收方 wxid 或群 ID |
| `X` | — | `number` | 纬度 |
| `Y` | — | `number` | 经度 |

### Msg.ShareVideoMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ToWxid` | ✅ | `string` | 接收人 wxid 或群 ID |
| `Xml` | ✅ | `string` | 视频消息返回的可转发内容 |

### Msg.SyncParam2Doc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `TargetURL` | ✅ | `string` | 自动同步回调地址 |

### Msg.SyncParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Scene` | — | `integer` | 同步场景；普通同步传 0 |
| `Synckey` | — | `string` | 上一轮同步返回的游标；首次传 initial |

### OfficialAccounts.ArticleListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `account_id` | — | `string` | 公众号稳定标识 |
| `history_url` | — | `string` | 公众号历史页或带公众号标识的文章链接 |
| `limit` | — | `integer` | 每页数量，默认 20，最大 50 |
| `offset` | — | `integer` | 分页偏移 |
| `url` | — | `string` | 兼容字段，与 history_url 二选一 |

### OfficialAccounts.ArticleMarkdownParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | ✅ | `string` | 公众号文章链接 |

### OfficialAccounts.ArticleReadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | ✅ | `string` | 公众号文章链接，支持完整链接和 /s/ 短链接 |

### OfficialAccounts.AuthMpLoginParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `scene` | — | `integer` | 授权场景；普通访问使用 0 |
| `url` | ✅ | `string` | 公众号授权页面链接 |

### OfficialAccounts.DefaultParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 公众号 AppID |

### OfficialAccounts.GetMpHistoryMsgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | ✅ | `string` | 公众号历史页链接 |

### OfficialAccounts.GetkeyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 公众号 AppID |
| `url` | ✅ | `string` | 需要授权的完整页面 URL |

### OfficialAccounts.QRConnectParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | ✅ | `string` | 二维码授权页面链接 |

### OfficialAccounts.ReadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | ✅ | `string` | 公众号文章链接 |

### QWContact.AddWxAppRecordParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `username` | ✅ | `string` | 要搜索的企业联系人 username |

### QWContact.QWAddContactParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `username` | ✅ | `string` | 企业联系人 username，来自搜索结果 |
| `v1` | ✅ | `string` | 搜索结果返回的联系人凭据 |

### QWContact.QWApplyAddContactParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `context` | — | `string` | 申请说明 |
| `username` | ✅ | `string` | 企业联系人 username，来自搜索结果 |
| `v1` | ✅ | `string` | 搜索结果返回的联系人凭据 |

### SayHello.Model1ParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | ✅ | `string` | 联系人二维码中可识别的链接 |
| `verifyContent` | — | `string` | 好友申请说明 |

### SayHello.Model2ParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `content` | — | `string` | 好友申请说明 |
| `fromScene` | — | `integer` | 搜索来源；普通搜索使用 0 |
| `scene` | — | `integer` | 好友来源场景；不确定时使用 15 |
| `searchScene` | — | `integer` | 搜索场景；普通搜索使用 1 |
| `toUserName` | ✅ | `string` | 微信号或手机号 |

### SayHello.SendRequestParam1Doc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `scene` | ✅ | `integer` | 联系人来源场景，需与搜索结果一致 |
| `v3` | ✅ | `string` | 搜索结果返回的联系人标识 |
| `v4` | ✅ | `string` | 搜索结果返回的验证凭据 |
| `verifyContent` | — | `string` | 好友申请说明 |

### Search.AIConversationResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `Data` | — | `Search.AIConversationView` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### Search.AIConversationTurn

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `answer` | — | `string` | 本轮 Markdown 答案 |
| `available` | — | `boolean` | 本轮是否获得 AI 对话内容 |
| `client_message_id` | — | `string` | 本轮幂等标识 |
| `completed` | — | `boolean` | 本轮答案是否完成 |
| `created_at` | — | `integer` | 本轮创建时间，Unix 秒 |
| `query` | — | `string` | 本轮问题 |
| `references` | — | `array<Search.AIReference>` | 本轮参考资料 |
| `related_questions` | — | `array<string>` | 本轮建议追问 |
| `status` | — | `string` | 本轮业务状态 |
| `turn` | — | `integer` | 会话轮次，首轮为 0 |

### Search.AIConversationView

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `created_at` | — | `integer` | 会话创建时间，Unix 秒 |
| `model` | — | `string` | 会话固定模型 |
| `next_turn` | — | `integer` | 服务端将自动使用的下一轮次 |
| `session_id` | — | `string` | 会话标识 |
| `status` | — | `string` | 最新一轮状态 |
| `total_turns` | — | `integer` | 已完成轮数 |
| `turns` | — | `array<Search.AIConversationTurn>` | 按轮次排列的问答历史 |
| `updated_at` | — | `integer` | 会话更新时间，Unix 秒 |

### Search.AIFollowUpRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `client_message_id` | — | `string` | 客户端幂等键；重试同一条追问时保持不变 |
| `query` | ✅ | `string` | 基于上文的追问，至少 2 个字符 |
| `session_id` | ✅ | `string` | 首问响应返回的会话标识 |

### Search.AIReference

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `title` | — | `string` | 参考资料标题 |
| `url` | — | `string` | 可访问的参考资料地址 |

### Search.AIRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `model` | — | `string` | 搜索模型；目前稳定公开值为 default |
| `query` | ✅ | `string` | 首个问题，至少 2 个字符 |

### Search.AIResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `Data` | — | `Search.AIResult` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### Search.AIResult

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `answer` | — | `string` | AI 搜索正文，Markdown 文本 |
| `available` | — | `boolean` | 当前账号是否获得 AI 搜索结果 |
| `completed` | — | `boolean` | 答案流是否已经完成 |
| `conversation_id` | — | `string` | 对话标识 |
| `message` | — | `string` | 状态说明 |
| `model` | — | `string` | 对外稳定模型名称 |
| `query` | — | `string` | 本轮问题 |
| `references` | — | `array<Search.AIReference>` | 答案引用的参考资料 |
| `related_questions` | — | `array<string>` | 可继续追问的问题 |
| `search_id` | — | `string` | 搜索会话标识 |
| `session_id` | — | `string` | 续问时原样传回 |
| `status` | — | `string` | 业务状态：completed、partial 或 no_ai_content |
| `turn` | — | `integer` | 服务端确认的会话轮次，首轮为 0 |

### Search.CGICallRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `include_raw` | — | `boolean` | 是否在响应中附带原始协议数据 |
| `method` | — | `string` | 仅 HTTP 类服务需要；留空使用 Services 返回的默认方法 |
| `payload` | — | `object` | 服务要求的 JSON 请求对象；字段由 Services 返回的具体能力决定 |
| `payload_base64` | — | `string` | 原始二进制请求的 Base64；与 payload、payload_hex 三选一 |
| `payload_hex` | — | `string` | 原始二进制请求的十六进制；与 payload、payload_base64 三选一 |

### Search.ChannelComment

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `author_id` | — | `string` |  |
| `author_name` | — | `string` |  |
| `avatar_url` | — | `string` |  |
| `comment_id` | — | `string` |  |
| `content` | — | `string` |  |
| `created_at` | — | `integer` |  |
| `like_count` | — | `integer` |  |
| `liked` | — | `boolean` |  |
| `replies` | — | `array<Search.ChannelComment>` |  |
| `replies_cursor` | — | `string` |  |
| `replies_has_more` | — | `boolean` |  |
| `reply_author_id` | — | `string` |  |
| `reply_author_name` | — | `string` |  |
| `reply_comment_id` | — | `string` |  |
| `reply_content` | — | `string` |  |
| `reply_count` | — | `integer` |  |

### Search.ChannelCommentVideo

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `creator_id` | — | `string` |  |
| `creator_name` | — | `string` |  |
| `title` | — | `string` |  |

### Search.ChannelCommentsRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `comment_token` | ✅ | `string` | 视频号搜索结果返回的评论读取凭据 |
| `cursor` | — | `string` | 上一页返回的 next_cursor；首页留空 |
| `root_comment_id` | — | `string` | 获取某条评论的回复时填写该评论的 comment_id；获取一级评论时留空 |

### Search.ChannelCommentsResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `count` | — | `integer` |  |
| `has_more` | — | `boolean` |  |
| `items` | — | `array<Search.ChannelComment>` |  |
| `next_cursor` | — | `string` |  |
| `root_comment_id` | — | `string` |  |
| `total_count` | — | `integer` |  |
| `video` | — | `Search.ChannelCommentVideo` |  |

### Search.ChannelContentCreator

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `avatar_url` | — | `string` |  |
| `creator_id` | — | `string` |  |
| `creator_name` | — | `string` |  |

### Search.ChannelContentDetailDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `caption` | — | `string` |  |
| `comment_closed` | — | `boolean` |  |
| `comment_count` | — | `integer` |  |
| `comment_token` | — | `string` |  |
| `comment_token_expires_at` | — | `integer` |  |
| `created_at` | — | `integer` |  |
| `creator` | — | `Search.ChannelContentCreator` |  |
| `description` | — | `string` |  |
| `download_count` | — | `integer` |  |
| `forward_count` | — | `integer` |  |
| `like_count` | — | `integer` |  |
| `liked` | — | `boolean` |  |
| `media` | — | `array<Search.ChannelContentMedia>` |  |
| `media_count` | — | `integer` |  |
| `read_count` | — | `integer` |  |
| `title` | — | `string` |  |

### Search.ChannelContentMedia

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `bitrate` | — | `integer` |  |
| `codec` | — | `string` |  |
| `decodeKey` | — | `integer` |  |
| `download_url` | — | `string` |  |
| `download_url_expires_at` | — | `integer` |  |
| `downloadable` | — | `boolean` |  |
| `duration_seconds` | — | `integer` |  |
| `file_format` | — | `string` |  |
| `file_size_bytes` | — | `integer` |  |
| `height` | — | `number` |  |
| `index` | — | `integer` |  |
| `media_type` | — | `string` |  |
| `original_download_url` | — | `string` |  |
| `original_url` | — | `string` |  |
| `original_url_expires_at` | — | `integer` |  |
| `play_url` | — | `string` |  |
| `thumbnail_url` | — | `string` |  |
| `thumbnail_url_expires_at` | — | `integer` |  |
| `width` | — | `number` |  |

### Search.ChannelContentRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `content_token` | ✅ | `string` | 视频号搜索结果返回的内容解析凭据 |

### Search.ChannelContentResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `Data` | — | `Search.ChannelContentDetailDoc` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### Search.ChannelSearchDataDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `count` | — | `integer` |  |
| `cursor` | — | `string` |  |
| `has_more` | — | `boolean` |  |
| `items` | — | `array<Search.ChannelSearchItem>` |  |
| `next_offset` | — | `integer` |  |
| `query` | — | `string` |  |
| `search_id` | — | `string` |  |

### Search.ChannelSearchItem

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `comment_count` | — | `integer` |  |
| `comment_token` | — | `string` |  |
| `comment_token_expires_at` | — | `integer` |  |
| `content_token` | — | `string` |  |
| `content_token_expires_at` | — | `integer` |  |
| `creator_name` | — | `string` |  |
| `download_url` | — | `string` |  |
| `downloadable` | — | `boolean` |  |
| `duration_seconds` | — | `integer` |  |
| `favorite_count` | — | `integer` |  |
| `forward_count` | — | `integer` |  |
| `height` | — | `integer` |  |
| `like_count` | — | `integer` |  |
| `play_url` | — | `string` |  |
| `published_at` | — | `integer` |  |
| `thumbnail_url` | — | `string` |  |
| `thumbnail_url_expires_at` | — | `integer` |  |
| `title` | — | `string` |  |
| `url_expires_at` | — | `integer` |  |
| `video_size_bytes` | — | `integer` |  |
| `width` | — | `integer` |  |

### Search.ChannelSearchResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `Data` | — | `Search.ChannelSearchDataDoc` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### Search.ChannelShareMedia

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `bitrate` | — | `integer` |  |
| `codec` | — | `string` |  |
| `download_url` | — | `string` |  |
| `downloadable` | — | `boolean` |  |
| `duration_seconds` | — | `integer` |  |
| `file_format` | — | `string` |  |
| `file_size_bytes` | — | `integer` |  |
| `height` | — | `number` |  |
| `index` | — | `integer` |  |
| `media_type` | — | `string` |  |
| `play_url` | — | `string` |  |
| `thumbnail_url` | — | `string` |  |
| `thumbnail_url_expires_at` | — | `integer` |  |
| `url_expires_at` | — | `integer` |  |
| `width` | — | `number` |  |

### Search.ChannelShareRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `url` | ✅ | `string` | 从微信复制的视频号分享链接 |

### Search.ChannelShareResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `Data` | — | `Search.ChannelShareResult` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### Search.ChannelShareResult

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `canonical_url` | — | `string` |  |
| `caption` | — | `string` |  |
| `comment_count` | — | `integer` |  |
| `comment_token` | — | `string` |  |
| `comment_token_expires_at` | — | `integer` |  |
| `content_token` | — | `string` |  |
| `content_token_expires_at` | — | `integer` |  |
| `cover_url` | — | `string` |  |
| `cover_url_expires_at` | — | `integer` |  |
| `created_at` | — | `integer` |  |
| `creator` | — | `Search.ChannelContentCreator` |  |
| `detail_available` | — | `boolean` |  |
| `forward_count` | — | `integer` |  |
| `like_count` | — | `integer` |  |
| `media` | — | `array<Search.ChannelShareMedia>` |  |

### Search.GatewayRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `query` | ✅ | `string` | 搜索关键词，至少 2 个字符 |

### Search.QueryRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `category` | ✅ | `string` | 搜索分类，例如 all、article、official_account、channels、mini_program 或 moments |
| `cursor` | — | `string` | 续页时原样传回上一页返回的 cursor |
| `limit` | — | `integer` | 每页数量，范围 1-100 |
| `offset` | — | `integer` | 结果偏移量；首页传 0，续页传上一页返回的 next_offset |
| `query` | ✅ | `string` | 搜索关键词，至少 2 个字符 |
| `search_id` | — | `string` | 续页时原样传回上一页返回的 search_id |

### Search.VerticalRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `cursor` | — | `string` | 续页时原样传回上一页返回的 cursor |
| `limit` | — | `integer` | 每页数量，范围 1-100 |
| `offset` | — | `integer` | 首页传 0；续页传上一页返回的 next_offset |
| `query` | ✅ | `string` | 搜索关键词，至少 2 个字符 |
| `search_id` | — | `string` | 续页时原样传回上一页返回的 search_id |

### TcpPoll.LongLinkStatus

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `connected_at` | — | `integer` |  |
| `handshake_mode` | — | `string` |  |
| `last_psk_failure_at` | — | `integer` |  |
| `last_receive_at` | — | `integer` |  |
| `last_send_at` | — | `integer` |  |
| `psk_failure_count` | — | `integer` |  |
| `reconnect_attempts` | — | `integer` |  |
| `record_version` | — | `string` |  |
| `resume_block_reason` | — | `string` |  |
| `resume_eligible` | — | `boolean` |  |
| `resume_fallbacks` | — | `integer` |  |
| `state` | — | `string` |  |
| `state_since` | — | `integer` |  |
| `ticket_expires_at` | — | `integer` |  |
| `ticket_use_count` | — | `integer` |  |
| `wxid` | — | `string` |  |

### TenPay.BusinessReceiptParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Money` | ✅ | `string` | 收款金额，单位元 |
| `Name` | ✅ | `string` | 收款项目名称 |
| `Remark` | — | `string` | 收款备注 |

### TenPay.CollectmoneyModelDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `invalidTime` | — | `string` | 收款请求失效时间 |
| `toUserName` | ✅ | `string` | 付款方微信标识 |
| `transFerId` | ✅ | `string` | 转账标识 |
| `transactionId` | ✅ | `string` | 交易标识 |

### TenPay.ConfirmPreTransferDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `bankSerial` | ✅ | `string` | 预支付响应中的银行卡序列号 |
| `bankType` | ✅ | `string` | 预支付响应中的银行类型 |
| `payPassword` | ✅ | `string` | 支付密码 |
| `reqKey` | ✅ | `string` | 预支付响应中的请求密钥 |

### TenPay.GeneratePayQCodeModelDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `money` | ✅ | `string` | 收款金额，单位元，最多两位小数 |
| `name` | ✅ | `string` | 收款项目名称 |

### TenPay.HongBaoDetailDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `offset` | — | `integer` | 领取记录分页偏移 |
| `size` | — | `integer` | 领取记录分页数量 |
| `xml` | ✅ | `string` | 红包消息内容 |

### TenPay.HongBaoParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `SendUserName` | ✅ | `string` | 红包发送人 |
| `Xml` | ✅ | `string` | 红包消息内容 |

### TenPay.HongBaoTailParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `SendId` | ✅ | `string` | 红包标识 |
| `SendUserName` | ✅ | `string` | 红包发送人 |
| `TimingIdentifier` | ✅ | `string` | 领取结果返回的时序标识 |
| `Xml` | ✅ | `string` | 红包消息内容 |

### TenPay.OpenwxhbParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Encrypt_key` | — | `string` | 领取结果返回的加密参数 |
| `Encrypt_userinfo` | — | `string` | 领取结果返回的用户参数 |
| `SendUserName` | ✅ | `string` | 红包发送人 |
| `TimingIdentifier` | ✅ | `string` | 领取结果返回的时序标识 |
| `Xml` | ✅ | `string` | 红包消息内容 |

### TenPay.QrydetailwxhbParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Encrypt_key` | — | `string` | 红包消息携带的加密参数 |
| `Encrypt_userinfo` | — | `string` | 红包消息携带的用户参数 |
| `Xml` | ✅ | `string` | 红包消息内容 |

### TenPay.ReceivewxhbParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Encrypt_key` | — | `string` | 红包消息携带的加密参数 |
| `Encrypt_userinfo` | — | `string` | 红包消息携带的用户参数 |
| `InWay` | — | `string` | 领取入口；留空使用消息默认入口 |
| `Xml` | ✅ | `string` | 红包消息内容 |

### TenPay.ReceivewxhbWithoutEncryptionParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Xml` | ✅ | `string` | 红包消息内容 |

### TenPay.RedPacketDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `amount` | ✅ | `integer` | 红包总金额，单位分 |
| `content` | ✅ | `string` | 红包祝福语 |
| `count` | ✅ | `integer` | 红包个数 |
| `from` | — | `integer` | 红包来源场景 |
| `redType` | — | `integer` | 红包类型 |
| `username` | ✅ | `string` | 接收人微信标识；群红包填写群 ID |

### Tools.BinaryFileDownloadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `app_id` | — | `string` | 消息返回的应用 ID |
| `attach_id` | ✅ | `string` | 消息返回的文件标识 |
| `data_len` | ✅ | `integer` | 文件总字节数 |
| `file_name` | — | `string` | 下载后的文件名 |
| `section` | — | `Tools.DownloadSectionDoc` |  |
| `user_name` | ✅ | `string` | 消息发送人或群 ID |

### Tools.BinaryVoiceDownloadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `chat_room_name` | — | `string` |  |
| `client_msg_id` | — | `string` |  |
| `file_name` | — | `string` | 下载后的音频文件名 |
| `format` | — | `integer` |  |
| `from_user_name` | — | `string` |  |
| `length` | — | `integer` |  |
| `master_buf_id` | — | `string` |  |
| `msg_id` | — | `integer` | 语音消息 ID |
| `new_msg_id` | — | `string` |  |
| `to_user_name` | — | `string` |  |

### Tools.CdnDownloadImageParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `file_aes_key` | ✅ | `string` | 消息返回的图片访问凭据 |
| `file_no` | ✅ | `string` | 消息返回的图片文件标识 |

### Tools.DownloadAppAttachParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `app_id` | — | `string` | 消息返回的应用 ID |
| `attach_id` | ✅ | `string` | 消息返回的文件标识 |
| `data_len` | ✅ | `integer` | 文件总字节数 |
| `section` | — | `Tools.DownloadSectionDoc` |  |
| `user_name` | ✅ | `string` | 消息发送人或群 ID |

### Tools.DownloadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `compress_type` | — | `integer` | 压缩类型 |
| `data_len` | ✅ | `integer` | 媒体总字节数 |
| `msg_id` | ✅ | `integer` | 消息 ID |
| `section` | — | `Tools.DownloadSectionDoc` |  |
| `to_wxid` | ✅ | `string` | 消息发送人或会话 ID |

### Tools.DownloadSectionDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `data_len` | — | `integer` | 本次分片长度 |
| `start_pos` | — | `integer` | 分片起始位置 |

### Tools.DownloadVoiceParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `bufid` | — | `string` | 消息返回的语音缓冲标识 |
| `fromUserName` | ✅ | `string` | 语音消息发送人 |
| `length` | ✅ | `integer` | 语音总字节数 |
| `msgId` | ✅ | `integer` | 语音消息 ID |

### Tools.GetA8KeyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `codeType` | — | `integer` | 页面代码类型；普通访问使用 0 |
| `codeVersion` | — | `integer` | 页面代码版本；普通访问使用 0 |
| `cookieBase64` | — | `string` | 上一次页面访问返回的会话信息 |
| `flag` | — | `integer` | 访问标记；普通访问使用 0 |
| `netType` | — | `string` | 网络类型 |
| `opCode` | — | `integer` | 访问类型；普通网页使用 2 |
| `reqUrl` | ✅ | `string` | 需要访问的完整页面地址 |
| `scene` | — | `integer` | 页面场景；普通网页使用 1 |

### Tools.HelperVerificationParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `gcc` | ✅ | `string` | 国家或地区代码 |
| `mobile` | ✅ | `string` | 手机号 |

### Tools.OauthSdkAppParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 应用 AppID |
| `avatarId` | — | `integer` | 头像 ID |
| `opt` | — | `integer` | 授权操作类型 |
| `packageName` | — | `string` | 应用包名 |
| `state` | — | `string` | 授权状态参数 |

### Tools.SetProxyParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `proxy` | ✅ | `string` | 代理地址，格式 host:port；传空字符串恢复直连 |

### Tools.SetStepParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `step` | ✅ | `integer` | 当天步数 |

### Tools.ThirdAppGrantParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 应用 AppID |
| `url` | ✅ | `string` | 第三方授权页面地址 |

### Tools.UploadParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `base64` | ✅ | `string` | 文件内容 |

### Translate.Result

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `engine` | — | `string` |  |
| `source_lang` | — | `string` |  |
| `source_text` | — | `string` |  |
| `target_lang` | — | `string` |  |
| `text` | — | `string` |  |
| `trace_id` | — | `string` |  |

### Translate.SendMessageDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `new_msg_id` | — | `string` |  |

### Translate.SendRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `at` | — | `string` | 群消息中需要 @ 的成员 wxid |
| `source_lang` | — | `string` | 源语言代码；省略时自动识别 |
| `target_lang` | ✅ | `string` | 目标语言代码 |
| `text` | ✅ | `string` | 待翻译并发送的文字，最多 5000 个字符 |
| `to_wxid` | ✅ | `string` | 接收人 wxid、群 ID 或 filehelper |

### Translate.SendResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `Data` | — | `Translate.SendResultDoc` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### Translate.SendResultDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `message` | — | `Translate.SendMessageDoc` |  |
| `translation` | — | `Translate.Result` |  |

### Translate.TextRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `source_lang` | — | `string` | 源语言代码；省略时自动识别 |
| `target_lang` | ✅ | `string` | 目标语言代码 |
| `text` | ✅ | `string` | 待翻译文字，最多 5000 个字符 |

### Translate.TextResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `Data` | — | `Translate.Result` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |
| `request_id` | — | `string` |  |

### User.AddMeMethodsParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `contact_card` | — | `boolean` | 是否允许通过名片添加 |
| `group_chat` | — | `boolean` | 是否允许通过群聊添加 |
| `phone` | — | `boolean` | 是否允许通过手机号添加 |
| `qr_code` | — | `boolean` | 是否允许通过二维码添加 |
| `wechat_id` | — | `boolean` | 是否允许通过微信号添加 |

### User.BindMobileParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `authTicket` | — | `string` | SendVerifyMobile 返回的授权凭据 |
| `mobile` | ✅ | `string` | 带国家/地区码的手机号 |
| `mobileCheckType` | — | `integer` | SendVerifyMobile 返回的校验类型 |
| `regSessionId` | — | `string` | SendVerifyMobile 返回的注册会话标识 |
| `verifycode` | ✅ | `string` | 手机验证码 |

### User.BindQQParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `account` | ✅ | `integer` | QQ 号 |
| `password` | ✅ | `string` | QQ 密码 |

### User.DelSafetyInfoParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `uuid` | ✅ | `string` | 登录设备列表返回的 uuid |

### User.EmailParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `email` | ✅ | `string` | 邮箱地址 |

### User.FriendVerificationParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `enabled` | ✅ | `boolean` | 是否开启好友验证 |

### User.GetQRCodeParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `style` | — | `integer` | 二维码样式 |

### User.GetUserRankLikeCountParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `rankId` | — | `string` | 排行榜 ID；留空查询最新榜单 |

### User.NewSetPasswdParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `newPassword` | ✅ | `string` | 新密码 |
| `ticket` | ✅ | `string` | VerifyPasswd 返回的修改凭据 |

### User.NewVerifyPasswdParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `password` | ✅ | `string` | 当前密码 |

### User.PrivacySettingsParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `function` | ✅ | `integer` | 隐私功能类型；好友验证传 4 |
| `value` | ✅ | `integer` | 1=开启，0=关闭 |

### User.ReportMotionParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `deviceId` | ✅ | `string` | 当前登录设备标识 |
| `deviceType` | ✅ | `string` | 设备类型 |
| `stepCount` | ✅ | `integer` | 步数 |

### User.SendVerifyMobileParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `authTicket` | — | `string` | 上一步返回的授权凭据 |
| `mobile` | ✅ | `string` | 带国家/地区码的手机号 |
| `mobileCheckType` | — | `integer` | 上一步返回的校验类型 |
| `opcode` | — | `integer` | 场景，绑手机号传 18 |
| `regSessionId` | — | `string` | 上一步返回的注册会话标识 |

### User.SetAlisaParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `alisa` | ✅ | `string` | 新微信号 |

### User.UpdateProfileParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `city` | — | `string` | 城市 |
| `country` | — | `string` | 国家/地区代码 |
| `nickName` | — | `string` | 昵称 |
| `province` | — | `string` | 省份 |
| `sex` | — | `integer` | 1=男，2=女 |
| `signature` | — | `string` | 个性签名 |

### User.UploadHeadImageParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `base64` | ✅ | `string` | 头像图片 Base64 |

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
| `msg_id` | — | `integer` | 语音消息 ID |
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
| `audio_base64` | — | `string` | 待转写音频内容 |
| `bits_per_sample` | — | `integer` | 采样位数 |
| `chunk_size` | — | `integer` | 上传分片字节数 |
| `encode_type` | — | `integer` | 音频编码类型 |
| `file_type` | — | `integer` | 音频文件类型 |
| `from_user_name` | — | `string` | 消息发送人 |
| `poll_interval_ms` | — | `integer` | 轮询间隔毫秒数 |
| `sample_rate` | — | `integer` | 采样率 |
| `scene` | — | `integer` | 转写场景 |
| `to_user_name` | — | `string` | 消息接收人或群 ID |
| `voice_id` | — | `string` | 任务 ID；提交新音频时可留空 |
| `wait_seconds` | — | `integer` | 同步等待秒数，范围 0-60 |

### Voice.ResultRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `voice_id` | ✅ | `string` | 转写任务 ID |

### Wxapp.AddAvatarImgParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |
| `jpgLink` | ✅ | `string` | 可直接访问的 JPG 图片地址 |

### Wxapp.AddAvatarParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `aFilekey` | ✅ | `string` | 上传头像后返回的文件标识 |
| `appid` | ✅ | `string` | 小程序 AppID |
| `nickName` | ✅ | `string` | 头像对应的昵称 |

### Wxapp.AddWxAppRecordParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `username` | ✅ | `string` | 小程序 username |

### Wxapp.CheckVerifyCodeDataDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |
| `mobile` | ✅ | `string` | 手机号，包含国家或地区号 |
| `verifyCode` | ✅ | `string` | 短信验证码 |

### Wxapp.CloudCallParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |
| `data` | — | `string` | 云函数 JSON 业务参数 |

### Wxapp.DefaultParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |

### Wxapp.DelMobileDataDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |
| `mobile` | ✅ | `string` | 要移除的手机号 |
| `opcode` | — | `integer` | 操作类型；普通删除使用 1 |

### Wxapp.DellAvatarParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `avatarId` | ✅ | `integer` | 头像列表返回的头像 ID |

### Wxapp.GETCreditScoreParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### Wxapp.GetUserOpenIdParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |
| `toWxId` | ✅ | `string` | 目标用户 username |

### Wxapp.GetWxAppRecordParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### Wxapp.GetpullPayParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |
| `nonceStr` | ✅ | `string` | 支付下单结果中的随机串 |
| `package` | ✅ | `string` | 支付下单结果中的订单包 |
| `paySign` | ✅ | `string` | 支付下单结果中的签名 |
| `sessionid` | ✅ | `string` | 支付下单结果中的会话标识 |
| `timeStamp` | ✅ | `string` | 支付下单结果中的时间戳 |

### Wxapp.JSOperateWxParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |
| `data` | — | `string` | JSON 业务参数 |
| `opt` | — | `integer` | 操作类型 |

### Wxapp.OauthListParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### Wxapp.QrcodeAuthLoginParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `uuid` | ✅ | `string` | 获取二维码时返回的 UUID |

### Wxapp.SessionidQRParamDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |
| `nonceStr` | ✅ | `string` | 支付下单结果中的随机串 |
| `package` | ✅ | `string` | 支付下单结果中的订单包 |
| `paySign` | ✅ | `string` | 支付下单结果中的签名 |
| `sessionid` | ✅ | `string` | 支付下单结果中的会话标识 |
| `timeStamp` | ✅ | `string` | 支付下单结果中的时间戳 |

### Wxapp.UnionpayDataDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `appid` | ✅ | `string` | 小程序 AppID |
| `nonceStr` | ✅ | `string` | 支付下单结果中的随机串 |
| `package` | ✅ | `string` | 支付下单结果中的订单包 |
| `paySign` | ✅ | `string` | 支付下单结果中的签名 |
| `sessionid` | ✅ | `string` | 支付下单结果中的会话标识 |
| `timeStamp` | ✅ | `string` | 支付下单结果中的时间戳 |

### XiaoWei.A2AChatData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `target_username` | — | `string` |  |
| `text` | — | `string` |  |
| `update_time_ms` | — | `integer` |  |

### XiaoWei.A2AChatListData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `chat_list` | — | `array<XiaoWei.A2AChatData>` |  |
| `has_more` | — | `boolean` |  |
| `page_context` | — | `string` |  |

### XiaoWei.BuluHistoryItemRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `answer_cards` | — | `array<XiaoWei.CardWrapRequestDoc>` |  |
| `dialogue_id` | — | `integer` |  |
| `question_cards` | — | `array<XiaoWei.CardWrapRequestDoc>` |  |
| `timestamp` | — | `integer` |  |
| `trace_id` | — | `string` |  |

### XiaoWei.BuluUserHistoryRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `items` | — | `array<XiaoWei.BuluHistoryItemRequestDoc>` |  |
| `operation_type` | ✅ | `integer` | 补录操作类型 |
| `test` | — | `boolean` |  |

### XiaoWei.BusinessObject

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### XiaoWei.CardControlData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `control_type` | — | `integer` |  |
| `recall_unsafe_action` | — | `XiaoWei.BusinessObject` |  |
| `subagent_action` | — | `XiaoWei.BusinessObject` |  |

### XiaoWei.CardExtraData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ai_answer_message_id` | — | `string` |  |
| `ai_query_message_id` | — | `string` |  |
| `complete_type_mask` | — | `integer` |  |
| `debug_info` | — | `XiaoWei.BusinessObject` |  |
| `display_style` | — | `XiaoWei.BusinessObject` |  |
| `magic_brush_info` | — | `XiaoWei.BusinessObject` |  |
| `minimum_client_versions` | — | `array<XiaoWei.BusinessObject>` |  |
| `session_id` | — | `string` |  |
| `timestamp` | — | `integer` |  |
| `todo_task_query` | — | `string` |  |
| `trace_message_id` | — | `string` |  |
| `unique_id` | — | `string` |  |

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
| `app_id` | ✅ | `string` | 卡片所属应用 ID |
| `media` | — | `array<XiaoWei.CardScreenshotMediaRequest>` |  |
| `message_id` | ✅ | `string` | 待检查的消息 ID |
| `trace_message_id` | — | `string` |  |

### XiaoWei.CardScreenshotSecurityCheckResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.EmptyBusinessData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.CardWrapData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `alert` | — | `XiaoWei.BusinessObject` |  |
| `ask_assistant_info` | — | `XiaoWei.BusinessObject` |  |
| `card_extra_info` | — | `XiaoWei.CardExtraData` |  |
| `chat_detail` | — | `XiaoWei.ChatDetailData` |  |
| `content_reference` | — | `XiaoWei.BusinessObject` |  |
| `control` | — | `XiaoWei.CardControlData` |  |
| `create_ai_weapp_card` | — | `XiaoWei.CreateAIWeAppCardData` |  |
| `file_list` | — | `array<XiaoWei.BusinessObject>` |  |
| `home_page` | — | `XiaoWei.BusinessObject` |  |
| `image_list` | — | `array<XiaoWei.BusinessObject>` |  |
| `image_source_info` | — | `XiaoWei.ImageSourceData` |  |
| `interactive_card_json` | — | `XiaoWei.BusinessObject` |  |
| `mini_app_progress_text` | — | `XiaoWei.BusinessObject` |  |
| `notice_text` | — | `XiaoWei.BusinessObject` |  |
| `qq_map_info` | — | `XiaoWei.BusinessObject` |  |
| `recommendation` | — | `XiaoWei.BusinessObject` |  |
| `stream_text` | — | `XiaoWei.StreamTextData` |  |
| `timeline_list` | — | `array<XiaoWei.BusinessObject>` |  |
| `type` | — | `integer` |  |
| `xml` | — | `string` |  |

### XiaoWei.CardWrapRequestDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `interactive_card_json` | — | `string` | 交互卡片 JSON 内容 |
| `type` | — | `integer` | 卡片类型 |
| `xml` | — | `string` | 卡片 XML 内容 |

### XiaoWei.ChatBubbleData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `card_wrap` | — | `array<XiaoWei.CardWrapData>` |  |
| `dialogue_id` | — | `string` |  |
| `extra_info` | — | `XiaoWei.ChatBubbleExtraData` |  |

### XiaoWei.ChatBubbleExtraData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `dialogue_id` | — | `string` |  |
| `msg_id` | — | `string` |  |
| `timestamp` | — | `integer` |  |
| `trace_id` | — | `string` |  |

### XiaoWei.ChatBubbleExtraInfoRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `dialogue_id` | — | `integer` |  |
| `message_id` | — | `integer` |  |
| `timestamp` | — | `integer` |  |
| `trace_id` | — | `string` |  |

### XiaoWei.ChatContextItem

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `file_id` | — | `string` |  |
| `id` | — | `string` |  |
| `text` | — | `string` |  |
| `title` | — | `string` |  |
| `type` | — | `string` |  |
| `url` | — | `string` |  |

### XiaoWei.ChatDetailData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `chat_id_list` | — | `array<string>` |  |

### XiaoWei.ChatEvent

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `card` | — | `XiaoWei.CardWrapData` |  |
| `error_code` | — | `string` |  |
| `error_message` | — | `string` |  |
| `event_id` | — | `string` |  |
| `final` | — | `boolean` |  |
| `message_id` | — | `string` |  |
| `occurred_at` | — | `string` |  |
| `question` | — | `string` |  |
| `recommendations` | — | `array<string>` |  |
| `room` | — | `XiaoWei.ChatRoomData` |  |
| `sequence` | — | `integer` |  |
| `session_id` | — | `string` |  |
| `source` | — | `string` |  |
| `text` | — | `string` |  |
| `tool_call` | — | `XiaoWei.ChatToolCallData` |  |
| `type` | — | `XiaoWei.ChatEventType` |  |

### XiaoWei.ChatEventType

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### XiaoWei.ChatHistoryData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `chat_list` | — | `array<XiaoWei.ChatBubbleData>` |  |
| `down_context` | — | `XiaoWei.PageContextData` |  |
| `up_context` | — | `XiaoWei.PageContextData` |  |

### XiaoWei.ChatOperationData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `event` | — | `XiaoWei.ChatEvent` |  |
| `session` | — | `XiaoWei.ChatSessionData` |  |

### XiaoWei.ChatOperationResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.ChatOperationData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.ChatRoomData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `member_wxids` | — | `array<string>` |  |
| `room_id` | — | `string` |  |

### XiaoWei.ChatSessionData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `created_at` | — | `string` |  |
| `current_message_id` | — | `string` |  |
| `driver_ready` | — | `boolean` |  |
| `last_sequence` | — | `integer` |  |
| `open_scene` | — | `integer` |  |
| `room_id` | — | `string` |  |
| `session_id` | — | `string` |  |
| `state` | — | `XiaoWei.ChatSessionState` |  |
| `updated_at` | — | `string` |  |

### XiaoWei.ChatSessionResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.ChatSessionData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.ChatSessionState

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### XiaoWei.ChatToolCallData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `arguments` | — | `any` |  |
| `call_id` | — | `string` |  |
| `name` | — | `string` |  |

### XiaoWei.CreateAIWeAppCardData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `app_id` | — | `string` |  |
| `app_name` | — | `string` |  |
| `icon` | — | `string` |  |
| `page_path` | — | `string` |  |
| `recall_source` | — | `string` |  |
| `summary` | — | `string` |  |

### XiaoWei.CreateChatSessionData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `events_url` | — | `string` |  |
| `session` | — | `XiaoWei.ChatSessionData` |  |

### XiaoWei.CreateChatSessionRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `client_request_id` | — | `string` |  |
| `is_dart` | — | `boolean` |  |
| `open_scene` | — | `integer` |  |
| `room_id` | — | `string` |  |
| `welcome_text` | — | `string` |  |

### XiaoWei.CreateChatSessionResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.CreateChatSessionData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.DeleteChatHistoryData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `err_msg` | — | `string` |  |
| `ret` | — | `integer` |  |

### XiaoWei.DeleteChatHistoryResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.DeleteChatHistoryData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

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
| `trace_id` | — | `string` | 待删除记录的追踪标识 |
| `unchecked_ids` | — | `array<string>` |  |

### XiaoWei.DeleteXiaoweiChatHistoryRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `delete_item_lists` | — | `array<XiaoWei.DeleteHistoryItemListRequest>` |  |

### XiaoWei.EmptyBusinessData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### XiaoWei.FillUserHistoryData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `accepted_count` | — | `integer` |  |
| `bulu_timestamp` | — | `integer` |  |
| `err_msg` | — | `string` |  |
| `ret` | — | `integer` |  |

### XiaoWei.FillUserHistoryResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.FillUserHistoryData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.FriendInviteItemData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `hash_username` | — | `string` |  |
| `uin` | — | `string` |  |

### XiaoWei.GetA2AChatListRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `limit` | — | `integer` | 每页会话数量 |
| `page_context` | — | `string` | 上一页返回的分页游标；首页留空 |

### XiaoWei.GetA2AChatListResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.A2AChatListData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.GetChatHistoryListRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `clicked_bubble` | — | `XiaoWei.ChatBubbleExtraInfoRequest` |  |
| `down_context` | — | `XiaoWei.PageContextRequest` |  |
| `scroll_type` | — | `integer` | 历史加载方向；首页使用 0 |
| `up_context` | — | `XiaoWei.PageContextRequest` |  |

### XiaoWei.GetChatHistoryResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.ChatHistoryData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.GetHalfScreenSuggestionsRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `share_type` | ✅ | `integer` | 内容分享来源类型 |
| `ui_state` | ✅ | `integer` | 当前界面状态 |

### XiaoWei.GetInviteCandidatesResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.InviteCandidatesData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.GetInviteInfoResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.InviteInfoData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.GetRedDotData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `reddot` | — | `XiaoWei.RedDotPayloadData` |  |
| `ret_code` | — | `integer` |  |

### XiaoWei.GetRedDotRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `debug_info` | — | `string` | 可选请求备注 |

### XiaoWei.GetRedDotResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.GetRedDotData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.GetSuggestionsResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.SuggestionsData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.GetUserCardListRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `card_type` | — | `integer` | 卡片类型；全部类型使用 0 |
| `page_context` | — | `XiaoWei.PageContextRequest` |  |

### XiaoWei.GetUserCardListResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.UserCardListData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.GetXiaoweiPermissionResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.PermissionData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.ImageSourceData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `source_item_list` | — | `array<XiaoWei.BusinessObject>` |  |

### XiaoWei.InviteCandidatesData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `candidate_list` | — | `array<XiaoWei.FriendInviteItemData>` |  |
| `granted_list` | — | `array<XiaoWei.FriendInviteItemData>` |  |
| `invited_list` | — | `array<XiaoWei.FriendInviteItemData>` |  |
| `ret_code` | — | `integer` |  |

### XiaoWei.InviteInfoData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `remaining_quota` | — | `integer` |  |
| `ret_code` | — | `integer` |  |
| `total_quota` | — | `integer` |  |
| `used_quota` | — | `integer` |  |

### XiaoWei.InviteResultData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `invitee_wxid` | — | `string` |  |
| `result` | — | `integer` |  |

### XiaoWei.InviteUsersData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `remaining_quota` | — | `integer` |  |
| `results` | — | `array<XiaoWei.InviteResultData>` |  |
| `ret_code` | — | `integer` |  |

### XiaoWei.InviteUsersRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `wxids` | ✅ | `array<string>` | 要邀请的好友 wxid 列表，数量 1-100 |

### XiaoWei.InviteUsersResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.InviteUsersData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.MarkRedDotReadData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ret_code` | — | `integer` |  |

### XiaoWei.MarkRedDotReadResponseDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` |  |
| `CodeValue` | — | `string` |  |
| `Data` | — | `XiaoWei.MarkRedDotReadData` |  |
| `Message` | — | `string` |  |
| `Success` | — | `boolean` |  |

### XiaoWei.MarkRedDotReadValidRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `debug_info` | — | `string` |  |
| `last_read_timestamp` | ✅ | `integer` | 最后查看时间的 Unix 时间戳 |
| `reddot_id` | ✅ | `integer` | 红点查询返回的 ID |

### XiaoWei.PageContextData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `has_more` | — | `boolean` |  |
| `limit_count` | — | `integer` |  |
| `offset` | — | `integer` |  |
| `time_cursor` | — | `integer` |  |

### XiaoWei.PageContextRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `has_more` | — | `boolean` |  |
| `limit_count` | — | `integer` |  |
| `offset` | — | `integer` |  |
| `time_cursor` | — | `integer` |  |

### XiaoWei.PermissionData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `enabled` | — | `boolean` |  |
| `ret_code` | — | `integer` |  |

### XiaoWei.RedDotEntryData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `client_consume_only` | — | `boolean` |  |
| `data` | — | `XiaoWei.BusinessObject` |  |
| `reddot_id` | — | `string` |  |
| `timestamp` | — | `integer` |  |
| `type` | — | `integer` |  |

### XiaoWei.RedDotPayloadData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `reddot_list` | — | `array<XiaoWei.RedDotEntryData>` |  |

### XiaoWei.RegenerateChatMessageRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `message_id` | — | `string` |  |

### XiaoWei.SendChatMessageRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `client_message_id` | — | `string` |  |
| `context` | — | `array<XiaoWei.ChatContextItem>` |  |
| `reply_to_message_id` | — | `string` |  |
| `text` | — | `string` |  |

### XiaoWei.StreamTextData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `is_star_transform` | — | `boolean` |  |
| `text` | — | `string` |  |
| `text_output_id` | — | `string` |  |
| `text_output_sequence` | — | `integer` |  |
| `text_output_source` | — | `integer` |  |
| `thinking_display` | — | `integer` |  |
| `thinking_title` | — | `string` |  |

### XiaoWei.SuggestionEntryData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `default_suggestion` | — | `string` |  |
| `share_type` | — | `integer` |  |
| `suggestions` | — | `array<string>` |  |
| `ui_state` | — | `integer` |  |

### XiaoWei.SuggestionsData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `suggestions` | — | `array<XiaoWei.SuggestionEntryData>` |  |

### XiaoWei.SwitchChatRoomRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `room_id` | — | `string` |  |

### XiaoWei.UserCardData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `card_wrap` | — | `XiaoWei.CardWrapData` |  |
| `dialogue_id` | — | `string` |  |
| `extra_info` | — | `XiaoWei.ChatBubbleExtraData` |  |

### XiaoWei.UserCardListData

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `page_context` | — | `XiaoWei.PageContextData` |  |
| `user_card_list` | — | `array<XiaoWei.UserCardData>` |  |

### businesscfg.BusinessConfig

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `eventUrl` | — | `string` | 通用业务事件回调地址 |
| `logoutUrl` | — | `string` | 退出登录回调地址 |
| `syncMessageUrl` | — | `string` | 消息同步回调地址 |

### models.BusinessDataDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### models.EmptyObject

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|

### models.ProxyInfo

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `ProxyIp` | — | `string` |  |
| `ProxyPassword` | — | `string` |  |
| `ProxyUser` | — | `string` |  |

### models.ResponseResultDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `Code` | — | `integer` | 业务状态码，0 表示请求处理成功 |
| `Data` | — | `models.BusinessDataDoc` | 业务数据对象，字段随接口功能变化 |
| `Message` | — | `string` | 面向调用方的结果说明 |
| `Success` | — | `boolean` | 请求是否处理成功 |
| `request_id` | — | `string` | 请求追踪标识 |

### models.WebhookTestRequest

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `MessageType` | ✅ | `string` | 测试消息类型 |
| `TestData` | — | `models.BusinessDataDoc` | 测试数据对象，可传空对象 |

### webhook.WebhookConfigDoc

| 字段 | 必填 | 类型 | 说明 |
|---|---|---|---|
| `enabled` | — | `boolean` | 是否启用，默认 true |
| `includeSelfMessage` | — | `boolean` | 是否包含自己发送的消息 |
| `messageTypes` | — | `array<string>` | 事件类型过滤；默认接收全部 |
| `retryCount` | — | `integer` | 失败重试次数 |
| `secret` | — | `string` | 可选签名密钥 |
| `timeout` | — | `integer` | 请求超时秒数 |
| `url` | ✅ | `string` | Webhook 回调地址 |
