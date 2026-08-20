import { Type } from "typebox";
import { makeWppXiaoWei } from "../../send/xiaowei.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getXiaoWei() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppXiaoWei({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const XIAO_WEI_META = {
    xiaoWeiCreateSession: [
        "创建小微 AI 会话 (返回 events_url 供订阅 SSE 事件流). clientRequestId=去重标识, roomId=房间, welcomeText=欢迎语.",
        Type.Object({
            clientRequestId: Type.Optional(Type.String()),
            roomId: Type.Optional(Type.String()),
            welcomeText: Type.Optional(Type.String()),
        }),
        (opts) => getXiaoWei().createSession({
            clientRequestId: opts.clientRequestId,
            roomId: opts.roomId,
            welcomeText: opts.welcomeText,
        }),
    ],
    xiaoWeiGetSession: [
        "获取小微会话状态 (当前消息/房间/最后事件序号).",
        Type.Object({ sessionId: Type.String() }),
        (sessionId) => getXiaoWei().getSession(sessionId),
    ],
    xiaoWeiSendMessage: [
        "向小微会话发送消息 (text 必填; 回答经 Events 事件流返回). context 可传文章/链接/图片引用.",
        Type.Object({
            sessionId: Type.String(),
            text: Type.String(),
            context: Type.Optional(Type.Array(Type.Unknown())),
        }),
        (sessionId, text, context) => getXiaoWei().sendMessage(sessionId, text, context ?? []),
    ],
    xiaoWeiCancel: [
        "取消小微当前回答 (事件流返回 cancelled, 会话恢复 ready).",
        Type.Object({ sessionId: Type.String() }),
        (sessionId) => getXiaoWei().cancel(sessionId),
    ],
    xiaoWeiRegenerate: [
        "重新生成小微回答 (messageId=要重生成的回答消息 ID).",
        Type.Object({ sessionId: Type.String(), messageId: Type.String() }),
        (sessionId, messageId) => getXiaoWei().regenerate(sessionId, messageId),
    ],
    xiaoWeiSwitchRoom: [
        "切换小微会话房间 (会话 ready 时).",
        Type.Object({ sessionId: Type.String(), roomId: Type.String() }),
        (sessionId, roomId) => getXiaoWei().switchRoom(sessionId, roomId),
    ],
    xiaoWeiEvents: [
        "订阅小微会话 SSE 事件流 (afterSequence=断线续传用). 返回 text/event-stream 原始流.",
        Type.Object({
            sessionId: Type.String(),
            afterSequence: Type.Optional(Type.Number()),
        }),
        (sessionId, afterSequence) => getXiaoWei().events(sessionId, afterSequence),
    ],
    xiaoWeiHistoryList: [
        "读取小微记忆列表 (scrollType=加载方向 0 最新).",
        Type.Object({ scrollType: Type.Optional(Type.Number()) }),
        (scrollType) => getXiaoWei().historyList(scrollType ?? 0),
    ],
    xiaoWeiHistoryFill: [
        "补录问答卡片到小微记忆 (items 结构化卡片数组).",
        Type.Object({
            items: Type.Array(Type.Unknown()),
            operationType: Type.Optional(Type.Number()),
        }),
        (items, operationType) => getXiaoWei().historyFill(items, operationType ?? 0),
    ],
    xiaoWeiHistoryDelete: [
        "删除小微记忆 (deleteItemLists 按会话分组).",
        Type.Object({ deleteItemLists: Type.Array(Type.Unknown()) }),
        (deleteItemLists) => getXiaoWei().historyDelete(deleteItemLists),
    ],
    xiaoWeiInvite: [
        "邀请好友使用小微 (wxids 1..100 个).",
        Type.Object({ wxids: Type.Array(Type.String()) }),
        (wxids) => getXiaoWei().invite(wxids),
    ],
    xiaoWeiInviteCandidates: [
        "可邀请使用小微的好友列表 (可邀请/已获资格/已邀请).",
        Type.Object({}),
        () => getXiaoWei().inviteCandidates(),
    ],
    xiaoWeiInviteInfo: [
        "小微邀请额度 (总额/已用/剩余).",
        Type.Object({}),
        () => getXiaoWei().inviteInfo(),
    ],
    xiaoWeiRedDotsQuery: [
        "查询小微红点 (类型/负载/时间戳/reddotId).",
        Type.Object({}),
        () => getXiaoWei().redDotsQuery(),
    ],
    xiaoWeiRedDotsRead: [
        "标记小微红点已读 (reddotId 来自 Query, lastReadTimestamp=最后读取时间戳).",
        Type.Object({ reddotId: Type.Number(), lastReadTimestamp: Type.Number() }),
        (reddotId, lastReadTimestamp) => getXiaoWei().redDotsRead(reddotId, lastReadTimestamp),
    ],
    xiaoWeiCardUsers: [
        "小微卡片用户列表 (cardType 卡片类型, pageContext 分页).",
        Type.Object({
            cardType: Type.Number(),
            pageContext: Type.Optional(Type.String()),
        }),
        (cardType, pageContext) => getXiaoWei().cardUsers(cardType, pageContext ?? ""),
    ],
    xiaoWeiCardScreenshotCheck: [
        "小微截屏安全校验 (messageId + appId 必填, media 文件标识).",
        Type.Object({
            messageId: Type.String(),
            appId: Type.String(),
            media: Type.Optional(Type.Array(Type.Unknown())),
        }),
        (messageId, appId, media) => getXiaoWei().cardScreenshotCheck(messageId, appId, media ?? []),
    ],
    xiaoWeiPermission: [
        "查询当前账号是否已开通小微 (未开通则调用其它小微接口会失败).",
        Type.Object({}),
        () => getXiaoWei().permission(),
    ],
    xiaoWeiA2aList: [
        "小微多智能体 (A2A) 对话列表.",
        Type.Object({ limit: Type.Optional(Type.Number()) }),
        (limit) => getXiaoWei().a2aList(limit ?? 20),
    ],
    xiaoWeiSuggestions: [
        "小微推荐提示词 (shareType 分享来源, uiState 界面状态).",
        Type.Object({}),
        () => getXiaoWei().suggestions(),
    ],
};
