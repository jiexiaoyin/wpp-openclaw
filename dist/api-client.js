import { postWppJson, stringifyLargeInts } from "./api/client.js";
import { logObj as log } from "./core/logger.js";
import { safeFetchWithCap } from "./util/safe-fetch.js";
import { makeWppMsg } from "./send/msg.js";
import { makeWppGroup } from "./send/group.js";
import { makeWppFriend } from "./send/friend.js";
import { makeWppWebhook } from "./send/webhook.js";
export { resolveImageToBase64, readLocalMedia } from "./api/resolve-media.js";
function escapeXml(s) {
    return String(s ?? "").replace(/[<>&'"]/g, (c) => {
        switch (c) {
            case "<": return "&lt;";
            case ">": return "&gt;";
            case "&": return "&amp;";
            case "'": return "&apos;";
            case '"': return "&quot;";
            default: return c;
        }
    });
}
function makeCtx(cfg, accountId) {
    return {
        baseUrl: cfg.apiBaseUrl,
        tokenKey: cfg.tokenKey,
        authcode: cfg.authcode,
        accountId,
    };
}
function makeMsgFor(cfg, accountId) {
    return makeWppMsg(makeCtx(cfg, accountId));
}
function makeGroupFor(cfg, accountId) {
    return makeWppGroup(makeCtx(cfg, accountId));
}
function makeFriendFor(cfg, accountId) {
    return makeWppFriend(makeCtx(cfg, accountId));
}
function makeWebhookFor(cfg, accountId) {
    return makeWppWebhook(makeCtx(cfg, accountId));
}
export class WechatpadproApiClient {
    cfg;
    accountId;
    constructor(cfg, accountId) {
        this.cfg = cfg;
        this.accountId = accountId ?? "default";
    }
    getBaseUrl() {
        return this.cfg.apiBaseUrl.replace(/\/$/, "");
    }
    getTokenKey() {
        return this.cfg.tokenKey;
    }
    async call(endpoint, body = {}) {
        return postWppJson(this.cfg.apiBaseUrl, endpoint, body, {
            tokenKey: this.cfg.tokenKey,
            authcode: this.cfg.authcode,
        });
    }
    async login() {
        const r = await this.call("/Login/GetQR", {
            authcode: this.cfg.authcode,
        });
        const d = r.Data ?? {};
        return { qrcodeUrl: d.qrcodeUrl ?? "", qrcodeData: d.qrcodeData };
    }
    async checkLogin(uuid) {
        const r = await this.call("/Login/CheckQR", { uuid, authcode: this.cfg.authcode });
        const d = (r.Data ?? {});
        return { status: d.status ?? 0, expired: d.expired, acctSectResp: d.acctSectResp };
    }
    async logout() {
        return this.call("/Login/LogOut", {});
    }
    async heartbeat() {
        return this.call("/Login/HeartBeat", {});
    }
    async sendText(toWxid, text, ats) {
        const api = makeMsgFor(this.cfg, this.accountId);
        return api.sendTxt(toWxid, text, ats, false);
    }
    async sendImage(toWxid, imageUrlOrPath) {
        const api = makeMsgFor(this.cfg, this.accountId);
        return api.sendImage(toWxid, imageUrlOrPath, false);
    }
    async sendVoice(toWxid, voiceUrlOrPath, durationMs, formatHint) {
        const api = makeMsgFor(this.cfg, this.accountId);
        return api.sendVoice(toWxid, voiceUrlOrPath, durationMs, false, formatHint);
    }
    async sendVideo(toWxid, videoUrlOrPath, thumbUrlOrPath, playLengthMs) {
        const api = makeMsgFor(this.cfg, this.accountId);
        return api.sendVideo(toWxid, videoUrlOrPath, thumbUrlOrPath, playLengthMs, false);
    }
    async sendApp(toWxid, xml) {
        return this.call("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml });
    }
    async sendFileViaApp(toWxid, fileName, fileBase64, fileSize, fileUrl) {
        let payloadBase64 = fileBase64;
        if (fileUrl && (!fileBase64 || fileBase64.length === 0)) {
            try {
                const buf = await safeFetchWithCap(fileUrl, { signal: AbortSignal.timeout(60_000) }, 50 * 1024 * 1024);
                payloadBase64 = buf.toString("base64");
            }
            catch (e) {
                const errMsg = e.message ?? String(e);
                return { Code: -2, CodeValue: `FETCH_FAIL:${errMsg.slice(0, 80)}`, Data: null, raw: null };
            }
        }
        const up = await this.call("/Tools/UploadFile", { base64: payloadBase64 });
        const mediaId = (up.Data ?? {}).mediaId ?? "";
        if (!mediaId) {
            return { ...up, Code: -2, CodeValue: "UPLOAD_NO_MEDIA_ID" };
        }
        const ext = (fileName.split(".").pop() || "dat").toLowerCase();
        const xml = `<appmsg appid="wxfile" sdkver="0">` +
            `<title>${escapeXml(fileName)}</title>` +
            `<des></des><action>view</action><type>6</type>` +
            `<content>dataType=1|filename=${escapeXml(fileName)}|fileext=${ext}|totallen=${fileSize}|attachid=${mediaId}|</content>` +
            `<appattach><totallen>${fileSize}</totallen><attachid>${mediaId}</attachid><fileext>${ext}</fileext></appattach>` +
            `</appmsg>`;
        return this.call("/Msg/ShareLink", { ToWxid: toWxid, Type: 6, Xml: xml });
    }
    async revokeMsg(msgId, newMsgId, toWxid, createTime) {
        const api = makeMsgFor(this.cfg, this.accountId);
        return api.revoke(msgId, newMsgId, toWxid, createTime);
    }
    async syncMessage() {
        const api = makeMsgFor(this.cfg, this.accountId);
        return api.sync();
    }
    async getChatroomInfo(chatroomId) {
        return makeGroupFor(this.cfg, this.accountId).getInfo(chatroomId);
    }
    async getChatroomMemberList(chatroomId) {
        return makeGroupFor(this.cfg, this.accountId).getMemberDetail(chatroomId);
    }
    async getContactList() {
        return makeFriendFor(this.cfg, this.accountId).getContractList();
    }
    async getProfile() {
        return this.call("/User/GetContractProfile", {});
    }
    async setWebhook(url, _authcode) {
        return makeWebhookFor(this.cfg, this.accountId).set(url);
    }
    async getWebhook() {
        return makeWebhookFor(this.cfg, this.accountId).get();
    }
    async setBusinessWebhook(syncMessageUrl, logoutUrl) {
        return this.call("/Webhook/Business/Set", { syncMessageUrl, logoutUrl });
    }
    async startAutoSync(targetUrl) {
        return makeMsgFor(this.cfg, this.accountId).startAutoSync(targetUrl);
    }
    async removeWebhook() {
        return makeWebhookFor(this.cfg, this.accountId).remove();
    }
}
export { stringifyLargeInts };
void log;
