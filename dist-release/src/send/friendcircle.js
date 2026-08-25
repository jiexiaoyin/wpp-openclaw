import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
import { getDefaultAccountRegistry } from "../account-state.js";
import { warn } from "../core/logger.js";
export function assertFriendCirclePublishAllowed(accountId, callerWxid, getCfg) {
    const state = getCfg ? null : getDefaultAccountRegistry().get(accountId);
    const cfg = getCfg ? getCfg() : state?.config;
    if (!cfg?.friendCirclePublishEnabled) {
        throw new Error("朋友圈发布未启用 (friendCirclePublishEnabled=false)");
    }
    if (callerWxid) {
        const allow = cfg.friendCirclePublishAllowFrom && cfg.friendCirclePublishAllowFrom.length > 0
            ? cfg.friendCirclePublishAllowFrom
            : (cfg.adminUsers ?? []);
        if (!allow.includes(callerWxid)) {
            warn(`[WPP v1.3.41 GUARD] 朋友圈发布拒绝: ${callerWxid} 不在白名单`);
            throw new Error(`朋友圈发布无权限 (${callerWxid} 不在白名单)`);
        }
    }
}
export function makeWppFriendCircle(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        comment: (snsId, content, type = 1, replyCommnetId = 0) => dispatch("/FriendCircle/Comment", { content, id: snsId, type, replyCommnetId }),
        getComment: (xmlData) => dispatch("/FriendCircle/GetCommnet", { xmlData }),
        getDetail: (wxid) => dispatch("/FriendCircle/GetDetail", { towxid: wxid }),
        getIdDetail: (snsId, wxid = "") => dispatch("/FriendCircle/GetIdDetail", { id: snsId, towxid: wxid }),
        getList: (firstPageMd5 = "", maxid = "") => dispatch("/FriendCircle/GetList", { fristpagemd5: firstPageMd5, maxid }),
        publish: (title, _content, mediaList) => {
            assertFriendCirclePublishAllowed(ctx.accountId);
            return dispatch("/FriendCircle/Messages", {
                title,
                blackList: "",
                private: 0,
                totalSize: 0,
                withUserList: "",
                ...(mediaList ?? {}),
            });
        },
        mmSnsSync: () => dispatch("/FriendCircle/MmSnsSync", {}),
        operation: (snsId, type) => dispatch("/FriendCircle/Operation", { id: snsId, type }),
        privacySettings: (functionType, value) => dispatch("/FriendCircle/PrivacySettings", { function: functionType, value }),
        pushComment: () => dispatch("/FriendCircle/PushCommnet", {}),
        upload: (key, base64) => dispatch("/FriendCircle/Upload", { key, base64 }),
        downloadVideo: (key, url) => dispatch("/FriendCircle/DownloadVideo", { key, url }),
        uploadVideo: (videoData, thumbData) => dispatch("/FriendCircle/UploadVideo", { videoData, thumbData }),
        uploadImage: (imageData) => dispatch("/FriendCircle/UploadImage", { imageData }),
        uploadImages: (imageDataList) => dispatch("/FriendCircle/UploadImages", { imageDataList }),
        messagesRaw: (content, blackList = "", withUserList = "") => {
            assertFriendCirclePublishAllowed(ctx.accountId);
            return dispatch("/FriendCircle/MessagesRaw", { content, blackList, withUserList });
        },
        publishImages: async (title, imageBase64List) => {
            assertFriendCirclePublishAllowed(ctx.accountId);
            if (!imageBase64List.length || imageBase64List.length > 9) {
                throw new Error(`publishImages: image count must be 1-9 (got ${imageBase64List.length})`);
            }
            const items = [];
            for (const b64 of imageBase64List) {
                const up = await dispatch("/FriendCircle/UploadImage", { imageData: b64 });
                const item = up.Data?.publishItem;
                if (up.Code !== 0 || !item) {
                    throw new Error(`publishImages: UploadImage failed Code=${up.Code} ${up.CodeValue ?? ""}`);
                }
                items.push(item);
            }
            return dispatch("/FriendCircle/Messages", { title, private: 0, images: items });
        },
        publishVideo: async (title, videoBase64, thumbBase64) => {
            assertFriendCirclePublishAllowed(ctx.accountId);
            const up = await dispatch("/FriendCircle/UploadVideo", {
                videoData: videoBase64,
                thumbData: thumbBase64,
            });
            const item = up.Data?.publishItem;
            if (up.Code !== 0 || !item) {
                throw new Error(`publishVideo: UploadVideo failed Code=${up.Code} ${up.CodeValue ?? ""}`);
            }
            return dispatch("/FriendCircle/Messages", { title, private: 0, video: item });
        },
        publishVideoViaItem: async (title, videoItem) => {
            assertFriendCirclePublishAllowed(ctx.accountId);
            return dispatch("/FriendCircle/Messages", { title, private: 0, video: videoItem });
        },
        setBackgroundImage: (imageData) => {
            assertFriendCirclePublishAllowed(ctx.accountId);
            return dispatch("/FriendCircle/SetBackgroundImage", { imageData });
        },
        getCollectCircle: (sourceId) => dispatch("/FriendCircle/GetCollectCircle", { sourceId }),
        sendFavItemCircle: (favItemId, sourceId, blackList = "", locationMode = 1) => dispatch("/FriendCircle/SendFavItemCircle", {
            favItemId, sourceId, blackList, locationMode,
        }),
        sendOneIdCircle: (id, blackList = "", locationMode = 1) => dispatch("/FriendCircle/SendOneIdCircle", { id, blackList, locationMode }),
        setFriendCircleDays: (range) => dispatch("/FriendCircle/SetFriendCircleDays", { range }),
        activeTasks: () => dispatch("/FriendCircle/ActiveTasks", {}),
    };
}
