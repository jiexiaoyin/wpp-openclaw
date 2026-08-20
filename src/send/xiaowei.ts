// src/send/xiaowei.ts - XiaoWei tag (20 endpoints: 小微 AI 智能体)
// v1.3.69 预开发 (老板拍板: 预开发但不启用, 默认不暴露给 AI)
// 小微智能体体系:
//   1. Chat/Sessions 创建会话 → 返回 events_url
//   2. Events (SSE text/event-stream) 订阅回答 (text.delta/message/card/tool.call/completed)
//   3. Messages 发送问题 → 回答通过 Events 流返回
//   4. History 记忆 / Invites 邀请 / RedDots 红点 / Cards 卡片 / Permission 开通检查

import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppXiaoWei(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    // ===== Chat 会话 =====

    /** /XiaoWei/Chat/Sessions — 创建小微实时会话 (返回 events_url 供订阅 SSE) */
    createSession: (optsIn: {
      clientRequestId?: string; isDart?: boolean; openScene?: number; roomId?: string; welcomeText?: string;
    }) => dispatch("/XiaoWei/Chat/Sessions", {
      ...(optsIn.clientRequestId ? { client_request_id: optsIn.clientRequestId } : {}),
      is_dart: optsIn.isDart ?? false,
      open_scene: optsIn.openScene ?? 0,
      ...(optsIn.roomId ? { room_id: optsIn.roomId } : {}),
      ...(optsIn.welcomeText ? { welcome_text: optsIn.welcomeText } : {}),
    }),

    /** /XiaoWei/Chat/Sessions/{session_id} — 获取会话状态 (GET) */
    getSession: (sessionId: string) =>
      getWppJson(ctx.baseUrl, `/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}`, opts),

    /** /XiaoWei/Chat/Sessions/{session_id}/Messages — 发送消息 (text 必填; 回答经 Events 流返回) */
    sendMessage: (sessionId: string, text: string, context: unknown[] = [], replyToMessageId = "") =>
      dispatch(`/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/Messages`, {
        text,
        ...(context.length ? { context } : {}),
        ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
      }),

    /** /XiaoWei/Chat/Sessions/{session_id}/Cancel — 取消当前回答 */
    cancel: (sessionId: string) =>
      dispatch(`/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/Cancel`, {}),

    /** /XiaoWei/Chat/Sessions/{session_id}/Regenerate — 重新生成回答 (message_id=要重生成的回答消息ID) */
    regenerate: (sessionId: string, messageId: string) =>
      dispatch(`/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/Regenerate`, { message_id: messageId }),

    /** /XiaoWei/Chat/Sessions/{session_id}/SwitchRoom — 切换房间 (会话 ready 时) */
    switchRoom: (sessionId: string, roomId: string) =>
      dispatch(`/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/SwitchRoom`, { room_id: roomId }),

    /** /XiaoWei/Chat/Sessions/{session_id}/Events — 订阅 SSE 事件流 (GET text/event-stream; after_sequence 断线续传) */
    events: (sessionId: string, afterSequence?: number) =>
      getWppJson(ctx.baseUrl, `/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/Events` +
        (afterSequence ? `?after_sequence=${afterSequence}` : ""), opts),

    // ===== History 记忆 =====

    /** /XiaoWei/History/List — 读取小微记忆 (scroll_type 加载方向) */
    historyList: (scrollType = 0) => dispatch("/XiaoWei/History/List", { scroll_type: scrollType }),

    /** /XiaoWei/History/Fill — 补录问答卡片到记忆 (items 结构化卡片) */
    historyFill: (items: unknown[], operationType = 0) =>
      dispatch("/XiaoWei/History/Fill", { items, operation_type: operationType }),

    /** /XiaoWei/History/Delete — 删除记忆 (delete_item_lists 按会话分组) */
    historyDelete: (deleteItemLists: unknown[]) =>
      dispatch("/XiaoWei/History/Delete", { delete_item_lists: deleteItemLists }),

    // ===== Invites 邀请 =====

    /** /XiaoWei/Invites — 邀请好友使用小微 (wxids 1..100) */
    invite: (wxids: string[]) => dispatch("/XiaoWei/Invites", { wxids }),

    /** /XiaoWei/Invites/Candidates — 可邀请好友列表 (GET) */
    inviteCandidates: () => getWppJson(ctx.baseUrl, "/XiaoWei/Invites/Candidates", opts),

    /** /XiaoWei/Invites/Info — 邀请额度 (GET) */
    inviteInfo: () => getWppJson(ctx.baseUrl, "/XiaoWei/Invites/Info", opts),

    // ===== RedDots 红点 =====

    /** /XiaoWei/RedDots/Query — 查询红点 */
    redDotsQuery: (debugInfo = "") =>
      dispatch("/XiaoWei/RedDots/Query", debugInfo ? { debug_info: debugInfo } : {}),

    /** /XiaoWei/RedDots/Read — 标记红点已读 (reddot_id 来自 Query) */
    redDotsRead: (reddotId: number, lastReadTimestamp: number) =>
      dispatch("/XiaoWei/RedDots/Read", { reddot_id: reddotId, last_read_timestamp: lastReadTimestamp }),

    // ===== Cards 卡片 =====

    /** /XiaoWei/Cards/Users — 卡片用户列表 (card_type 卡片类型) */
    cardUsers: (cardType: number, pageContext = "") =>
      dispatch("/XiaoWei/Cards/Users", pageContext ? { card_type: cardType, page_context: pageContext } : { card_type: cardType }),

    /** /XiaoWei/Cards/ScreenshotSecurityCheck — 截屏安全校验 (message_id + app_id 必填) */
    cardScreenshotCheck: (messageId: string, appId: string, media: unknown[] = [], traceMessageId = "") =>
      dispatch("/XiaoWei/Cards/ScreenshotSecurityCheck", {
        message_id: messageId,
        app_id: appId,
        ...(media.length ? { media } : {}),
        ...(traceMessageId ? { trace_message_id: traceMessageId } : {}),
      }),

    // ===== Permission / A2A / Suggestions =====

    /** /XiaoWei/Permission — 查询账号是否已开通小微 (GET) */
    permission: () => getWppJson(ctx.baseUrl, "/XiaoWei/Permission", opts),

    /** /XiaoWei/Conversations/A2A/List — 多智能体对话列表 */
    a2aList: (limit = 20, pageContext = "") =>
      dispatch("/XiaoWei/Conversations/A2A/List", pageContext ? { limit, page_context: pageContext } : { limit }),

    /** /XiaoWei/Conversations/Suggestions — 获取推荐提示词 */
    suggestions: (shareType = 0, uiState = 0) =>
      dispatch("/XiaoWei/Conversations/Suggestions", { share_type: shareType, ui_state: uiState }),
  };
}

export type WppXiaoWeiApi = ReturnType<typeof makeWppXiaoWei>;
