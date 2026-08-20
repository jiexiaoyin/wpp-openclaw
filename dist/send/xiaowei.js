import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppXiaoWei(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        createSession: (optsIn) => dispatch("/XiaoWei/Chat/Sessions", {
            ...(optsIn.clientRequestId ? { client_request_id: optsIn.clientRequestId } : {}),
            is_dart: optsIn.isDart ?? false,
            open_scene: optsIn.openScene ?? 0,
            ...(optsIn.roomId ? { room_id: optsIn.roomId } : {}),
            ...(optsIn.welcomeText ? { welcome_text: optsIn.welcomeText } : {}),
        }),
        getSession: (sessionId) => getWppJson(ctx.baseUrl, `/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}`, opts),
        sendMessage: (sessionId, text, context = [], replyToMessageId = "") => dispatch(`/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/Messages`, {
            text,
            ...(context.length ? { context } : {}),
            ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
        }),
        cancel: (sessionId) => dispatch(`/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/Cancel`, {}),
        regenerate: (sessionId, messageId) => dispatch(`/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/Regenerate`, { message_id: messageId }),
        switchRoom: (sessionId, roomId) => dispatch(`/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/SwitchRoom`, { room_id: roomId }),
        events: (sessionId, afterSequence) => getWppJson(ctx.baseUrl, `/XiaoWei/Chat/Sessions/${encodeURIComponent(sessionId)}/Events` +
            (afterSequence ? `?after_sequence=${afterSequence}` : ""), opts),
        historyList: (scrollType = 0) => dispatch("/XiaoWei/History/List", { scroll_type: scrollType }),
        historyFill: (items, operationType = 0) => dispatch("/XiaoWei/History/Fill", { items, operation_type: operationType }),
        historyDelete: (deleteItemLists) => dispatch("/XiaoWei/History/Delete", { delete_item_lists: deleteItemLists }),
        invite: (wxids) => dispatch("/XiaoWei/Invites", { wxids }),
        inviteCandidates: () => getWppJson(ctx.baseUrl, "/XiaoWei/Invites/Candidates", opts),
        inviteInfo: () => getWppJson(ctx.baseUrl, "/XiaoWei/Invites/Info", opts),
        redDotsQuery: (debugInfo = "") => dispatch("/XiaoWei/RedDots/Query", debugInfo ? { debug_info: debugInfo } : {}),
        redDotsRead: (reddotId, lastReadTimestamp) => dispatch("/XiaoWei/RedDots/Read", { reddot_id: reddotId, last_read_timestamp: lastReadTimestamp }),
        cardUsers: (cardType, pageContext = "") => dispatch("/XiaoWei/Cards/Users", pageContext ? { card_type: cardType, page_context: pageContext } : { card_type: cardType }),
        cardScreenshotCheck: (messageId, appId, media = [], traceMessageId = "") => dispatch("/XiaoWei/Cards/ScreenshotSecurityCheck", {
            message_id: messageId,
            app_id: appId,
            ...(media.length ? { media } : {}),
            ...(traceMessageId ? { trace_message_id: traceMessageId } : {}),
        }),
        permission: () => getWppJson(ctx.baseUrl, "/XiaoWei/Permission", opts),
        a2aList: (limit = 20, pageContext = "") => dispatch("/XiaoWei/Conversations/A2A/List", pageContext ? { limit, page_context: pageContext } : { limit }),
        suggestions: (shareType = 0, uiState = 0) => dispatch("/XiaoWei/Conversations/Suggestions", { share_type: shareType, ui_state: uiState }),
    };
}
