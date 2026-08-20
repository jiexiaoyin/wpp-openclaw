import { postWppJson, getWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppFinder(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        comment: (username, finderId, content, opType = 1, rootCommentId = "", replyCommentId = "", replyUsername = "") => dispatch("/Finder/Comment", {
            Username: username,
            Id: finderId,
            Content: content,
            OpType: opType,
            CommentId: "",
            ObjectNonceId: "",
            ReplyCommentId: replyCommentId,
            ReplyUsername: replyUsername,
            RootCommentId: rootCommentId,
            Scene: 1,
            SessionBuffer: "",
        }),
        decrypt: (encryptContent) => dispatch("/Finder/Decrypt", { Content: encryptContent }),
        finderGetMsgSessionId: (toFinderId) => dispatch("/Finder/FinderGetMsgSessionId", { FinderUsername: toFinderId }),
        finderLiveDetail: (finderObjectId, finderNonceId) => dispatch("/Finder/FinderLiveDetail", { FinderObjectID: finderObjectId, FinderNonceID: finderNonceId }),
        finderSearchList: () => dispatch("/Finder/FinderSearchList", {}),
        finderSendText: (finderUsername, text) => dispatch("/Finder/FinderSendText", { FinderUsername: finderUsername, Text: text }),
        finderGetTopicList: (topTitle = "", lastBuffer = "") => dispatch("/Finder/Findergettopiclist", { TopTitle: topTitle, LastBuffer: lastBuffer }),
        follow: (finderId) => dispatch("/Finder/Follow", { finderId }),
        getCommentDetail: (finderUsername, id, rootCommentId = "") => dispatch("/Finder/GetCommentDetail", {
            FinderUsername: finderUsername,
            Id: id,
            RootCommentId: rootCommentId,
            LastBuffer: "",
            ObjectNonceId: "",
        }),
        getCommentList: (finderId, rootCommentId = "") => dispatch("/Finder/GetCommentList", { Id: finderId, RootCommentId: rootCommentId }),
        getRecommend: () => dispatch("/Finder/GetRecommend", {}),
        like: (finderId) => dispatch("/Finder/Like", { Id: finderId }),
        search: (keyword) => dispatch("/Finder/Search", { keyword }),
        targetUserPage: (target) => dispatch("/Finder/TargetUserPage", { Target: target, LastBuffer: "" }),
        userPrepare: () => dispatch("/Finder/UserPrepare", {}),
        playVideo: (opts) => dispatch("/Finder/PlayVideo", {
            ...(opts.objectId ? { object_id: opts.objectId } : {}),
            ...(opts.finderUsername ? { finder_username: opts.finderUsername } : {}),
            ...(opts.playUrl ? { play_url: opts.playUrl } : {}),
            loop: opts.loop ?? false,
            loop_count: opts.loopCount ?? 0,
            play_seconds: opts.playSeconds ?? 0,
            async: opts.async ?? true,
        }),
        playVideoStop: (taskId) => dispatch("/Finder/PlayVideoStop", { task_id: taskId }),
        playVideoStatus: (taskId) => getWppJson(ctx.baseUrl, `/Finder/PlayVideoStatus?task_id=${encodeURIComponent(taskId)}`, opts),
        playVideoTasks: () => getWppJson(ctx.baseUrl, "/Finder/PlayVideoTasks", opts),
    };
}
