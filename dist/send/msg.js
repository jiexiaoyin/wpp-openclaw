// src/send/msg.ts - Msg tag (send text/image/video/voice/file/etc.)
import { createHash } from "node:crypto";
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
import { saveMessage } from "../db.js";
import { info, warn, formatErr } from "../core/logger.js";
import { safeFetchWithCap } from "../util/safe-fetch.js";
import { resolveImageToBase64 } from "../api/resolve-media.js";
/**
 * v1.3.16 OUTBOUND-PERSIST: 发送到微信的消息统一入库 (老板拍板 "任意渠道发送都要入库, 以便引用 bot 消息")。
 * agent-tools msg 域工具走 makeWppMsg 直接调 vendor, 之前全部未入库 (outbound.ts 走 api-client 已入库)。
 */
const OUTBOUND_MSG_TYPES = {
    "/Msg/SendTxt": "text",
    "/Msg/SendCDNImg": "image",
    "/Msg/UploadImg": "image",
    "/Msg/SendCDNVideo": "video",
    "/Msg/SendVideo": "video",
    "/Msg/ShareVideo": "video",
    "/Msg/SendVoice": "voice",
    "/Msg/SendCDNFile": "file",
    "/Msg/SendEmoji": "emoji",
    "/Msg/ShareCard": "card",
    "/Msg/ShareLink": "link",
    "/Msg/ShareLocation": "location",
    "/Msg/SendXCX": "miniprogram",
};
/** 从 ShareLink Xml 提取 <title> (入库展示用, 非引用块) */
function extractXmlTitle(xml) {
    if (typeof xml !== "string")
        return "";
    const m = xml.match(/<title>([\s\S]*?)<\/title>/);
    return m?.[1]?.trim() ?? "";
}
/** 从 endpoint + body 提取可读 content 入库 (base64 太长发 [图片]/[视频]/[语音] 标记 + URL) */
function outboundContentFor(ep, body) {
    switch (ep) {
        case "/Msg/SendTxt": return String(body.Content ?? "");
        case "/Msg/SendCDNImg": return `[图片] ${body.Content ?? ""}`;
        case "/Msg/UploadImg": return "[图片]"; // Base64 太长
        case "/Msg/SendCDNVideo": return `[视频] ${body.Content ?? ""}`;
        case "/Msg/SendVideo": return "[视频]"; // Base64
        case "/Msg/ShareVideo": return "[视频]";
        case "/Msg/SendVoice": return "[语音]"; // Base64
        case "/Msg/SendCDNFile": return `[文件] ${body.Content ?? ""}`;
        case "/Msg/SendEmoji": return `[表情] ${body.Md5 ?? ""}`;
        case "/Msg/ShareCard": return `[名片] ${body.CardNickName ?? ""}`;
        case "/Msg/ShareLink": return `[链接] ${extractXmlTitle(body.Xml)}`;
        case "/Msg/ShareLocation": return `[位置] ${body.Label ?? body.Poiname ?? ""}`;
        case "/Msg/SendXCX": {
            // v1.6.2: 现代卡片 (type=33) 带 pagepath ⇒ 审计行要能看出「发的是哪个页面」,
            //   否则一堆 [小程序] 标题入库后无法区分首页与活动页 (引用/排查都要靠这行)。
            const m = typeof body.Content === "string" ? body.Content.match(/<pagepath>([\s\S]*?)<\/pagepath>/) : null;
            const pagePath = m?.[1]?.trim();
            return `[小程序] ${extractXmlTitle(body.Content)}${pagePath ? ` (页面 ${pagePath})` : ""}`;
        }
        default: return "";
    }
}
/**
 * v1.3.20 REVOKE-FIX: 从 vendor 发送响应提取消息 ID (兼容 Data.List[0] 结构)。
 * 实测 SendTxt 响应: Data.List[0] = { MsgId:0, ClientMsgid, NewMsgId, Createtime, servertime, ... }
 * (顶层 Data.msgId/newMsgId 是 undefined! 插件原用 d.msgId → 拿不到 ID, AI 撤回链路断裂)
 *
 * 返回:
 *   - newMsgId: List[0].NewMsgId (vendor 全局唯一, 撤回定位用)
 *   - clientMsgId: List[0].ClientMsgid ?? MsgId (撤回 ClientMsgId 参数用)
 *   - msgId: 兼容语义 = clientMsgId ?? newMsgId
 *   - createTime: List[0].Createtime (撤回 CreateTime 可用 server 时间)
 */
export function extractOutboundMsgIds(resp) {
    const d = (resp.Data ?? {});
    const list = Array.isArray(d.List) && d.List.length > 0 ? d.List[0] : null;
    // SendTxt: List[0].NewMsgId / ClientMsgid / Createtime; UploadImg: 顶层 Newmsgid(小写m) / Msgid / CreateTime
    const newMsgId = (list?.NewMsgId ?? d.Newmsgid ?? d.newMsgId ?? d.msgId);
    const clientMsgId = (list?.ClientMsgid ?? list?.MsgId ?? d.Msgid ?? d.msgId);
    const createTime = (typeof list?.Createtime === "number" ? list.Createtime : undefined) ??
        (typeof d.CreateTime === "number" ? d.CreateTime : undefined);
    const msgId = clientMsgId ?? newMsgId;
    return {
        msgId: msgId != null ? String(msgId) : undefined,
        newMsgId: newMsgId != null ? String(newMsgId) : undefined,
        clientMsgId: clientMsgId != null ? String(clientMsgId) : undefined,
        createTime,
    };
}
/**
 * 统一入库发送消息 (供 dispatch 收口 + sendFile + quote-reply 复用)。
 * 失败 (Code≠0) 不入库 (不留假记录); 入库失败只 warn 不阻塞发送。
 */
export async function persistOutboundMsg(ctx, opts) {
    try {
        const { toWxid, msgType, content, resp } = opts;
        // v1.3.59 P0-1 (2026-08-13 完整审阅): Code=0/200 只是 HTTP 层, 真正成功看 BaseResponse.ret===0
        //   否则 file/link 等 vendor 返 Code=0+ret=-2 时写入幽灵 outbound 记录 (污染上下文/引用)
        if (resp.Code !== 0 && resp.Code !== 200)
            return; // 发送失败不入库
        const data = resp.Data;
        // v1.5.6 SEND-LIST-RET (2026-09-09 华为晨报 30362 ret=-2 复盘): vendor 逐条结果在 Data.List[].Ret
        //   (Code=0 + BaseResponse.ret=0 但 List[0].Ret=-2 → 消息实际拒收). 任一条 Ret!=0 → 不入库防幽灵记录
        if (Array.isArray(data?.List) && data.List.length > 0) {
            for (const item of data.List) {
                const itemRet = item.Ret;
                if (itemRet !== undefined && itemRet !== 0)
                    return;
            }
        }
        else {
            const baseRet = data?.BaseResponse?.ret;
            if (baseRet !== undefined && baseRet !== 0)
                return; // Code=0 但 ret≠0 → 实际失败, 不入库
        }
        const ids = extractOutboundMsgIds(resp);
        await saveMessage({
            account_id: ctx.accountId,
            msg_id: ids.newMsgId ?? ids.msgId ?? null,
            new_msg_id: ids.newMsgId ?? null,
            direction: "outbound",
            peer_kind: toWxid.endsWith("@chatroom") ? "group" : "direct",
            peer_id: toWxid,
            msg_type: msgType,
            content,
            raw_payload: resp.raw,
        });
        info(`[WPP v1.3.16 OUTBOUND-PERSIST] saved outbound msgType=${msgType} to=${toWxid} msgId=${ids.newMsgId ?? ""}`);
    }
    catch (e) {
        warn(`[WPP v1.3.16 OUTBOUND-PERSIST] persist outbound failed (non-fatal): ${formatErr(e)}`);
    }
}
/** 端点→入库元数据 (发送类端点 + toWxid + 可读 content); 非发送端点或缺失 toWxid → null */
export function outboundMetaFor(ep, body) {
    const msgType = OUTBOUND_MSG_TYPES[ep];
    if (!msgType)
        return null;
    const toWxid = String(body.ToWxid ?? body.toWxid ?? "");
    if (!toWxid)
        return null;
    return { toWxid, msgType, content: outboundContentFor(ep, body) };
}
/**
 * v1.2.1 swagger-alignment: /Msg/ShareLink 期望 appmsg XML (SendAppMsgParamDoc {ToWxid, Type, Xml})
 * 分享链接标准 appmsg 结构 (type=5 = 链接卡片)
 */
function buildShareLinkXml(title, desc, linkUrl, thumbUrl) {
    return (`<appmsg>` +
        `<title>${escapeXml(title)}</title>` +
        `<des>${escapeXml(desc)}</des>` +
        `<type>5</type>` +
        `<url>${escapeXml(linkUrl)}</url>` +
        (thumbUrl ? `<thumburl>${escapeXml(thumbUrl)}</thumburl>` : "") +
        `<appattach></appattach>` +
        `</appmsg>`);
}
/**
 * v1.1.7: 构造小程序 appmsg XML (vendor SendApp 期望)
 * 公开给 test, 不直接 dispatch
 */
export function buildAppMsgXml(username, title, desc, mmPayload) {
    const mmXml = Object.entries(mmPayload)
        .map(([k, v]) => `<${k}>${escapeXml(String(v))}</${k}>`)
        .join("");
    return (`<appmsg appid="" sdkver="0">` +
        `<title>${escapeXml(title)}</title>` +
        `<des>${escapeXml(desc)}</des>` +
        `<action>webview</action>` +
        `<type>2001</type>` + // 2001 = 小程序
        `<showtype>0</showtype>` +
        `<content/>` +
        `<url/>` +
        `<lowurl/>` +
        `<dataurl/>` +
        `<lowdataurl/>` +
        `<appattach/>` +
        `<mmapp>${mmXml}</mmapp>` +
        `<fromusername>${escapeXml(username)}</fromusername>` +
        `</appmsg>`);
}
/** 16 进制串 (fileid/aeskey 都是), 用来挡住厂商返回空对象/占位符这类情况 */
function isHex(s, minLen) {
    return typeof s === "string" && s.length >= minLen && /^[0-9a-fA-F]+$/.test(s);
}
// ───────────────────────── v1.6.4 XCX-THUMB-INHERIT ─────────────────────────
// 转发小程序卡片时**不要**下载原图再自己上传 —— 那条路的产物是"替代图" (实测落到 140×140 图标),
// 而老板要的是"与我发给你的一样"。真相 (2026-09-13 实测坐实):
//   · `<appattach>` 凭据在**微信客户端**手里是好的: 20:45 那次把原凭据原样带过去转发, 老板手机上
//     显示的就是原卡片那张 720×576 封面, 一模一样;
//   · 而厂商**服务端**的两个下载口 (/Tools/DownloadMiniProgramCover、/Tools/CdnDownloadImage) 对
//     同样的凭据都返 `-5103017` ⇒ 死的是厂商的下载实现, 不是凭据本身。
// 所以转发链路 = 入站注记里给出**凭据令牌**, 出站原样塞进 appattach, 全程不下载不上传。
/** 凭据令牌前缀 (入站注记 → 出站 thumbUrl 的载体) */
export const THUMB_TOKEN_PREFIX = "xcxthumb:";
/**
 * 令牌 → 凭据。**定长前缀字段 + 尾部 iconUrl** 的格式, 位置固定所以不含歧义:
 *   `xcxthumb:<fileId>:<aesKey>:<md5>:<w>:<h>:<len>:<version>:<iconUrl>`
 * 缺项写空串 (不能用省略 —— 省略会让"version 缺/iconUrl 在"与"version 在/iconUrl 缺"分不开)。
 * 不是令牌 / fileId·aesKey 不合法 ⇒ null (调用方按"没缩略图"处理)。
 */
export function parseThumbToken(token) {
    if (!token || !token.startsWith(THUMB_TOKEN_PREFIX))
        return null;
    const p = token.slice(THUMB_TOKEN_PREFIX.length).split(":");
    if (p.length < 6)
        return null;
    const [fileId, aesKey, md5, w, h, len] = p;
    if (!isHex(fileId, 16) || !isHex(aesKey, 16))
        return null;
    const num = (v) => (v && /^\d+$/.test(v) ? parseInt(v, 10) : undefined);
    const out = { fileId, aesKey };
    if (isHex(md5, 32))
        out.md5 = md5;
    const width = num(w);
    const height = num(h);
    const length = num(len);
    if (width !== undefined)
        out.width = width;
    if (height !== undefined)
        out.height = height;
    if (length !== undefined)
        out.length = length;
    const version = num(p[6]);
    if (version !== undefined)
        out.version = version;
    const iconUrl = p.slice(7).join(":");
    if (iconUrl)
        out.iconUrl = iconUrl;
    return out;
}
/** 凭据 → 令牌 (入站注记用; 与 parseThumbToken 严格互逆, 有单测锁) */
export function formatThumbToken(t) {
    return (THUMB_TOKEN_PREFIX +
        [t.fileId, t.aesKey, t.md5 ?? "", t.width ?? "", t.height ?? "", t.length ?? "", t.version ?? "", t.iconUrl ?? ""].join(":"));
}
/**
 * 从 /Msg/UploadImg 的响应体里取出 CDN 凭据。
 * ⚠️ 字段名是厂商 Go 结构体的原样序列化: `Fileid` / `Aeskey` / `TotalLen` (不是 fileId/aesKey),
 *   且**不在** swagger 里 (swagger 只写了示例 `file_id`/`url`) —— 是实测出来的 (2026-09-13)。
 * 取值失败返 null (调用方按"没有缩略图"处理, 不抛)。
 */
export function extractCdnThumbRef(data) {
    const d = data && typeof data === "object" ? data : undefined;
    if (!d)
        return null;
    const fileIdRaw = d.Fileid ?? d.FileId ?? d.fileid;
    const aesKeyRaw = d.Aeskey ?? d.AesKey ?? d.aeskey;
    const fileId = typeof fileIdRaw === "string" ? fileIdRaw : undefined;
    const aesKey = typeof aesKeyRaw === "string" ? aesKeyRaw : undefined;
    if (!isHex(fileId, 16) || !isHex(aesKey, 16))
        return null;
    const lenRaw = d.TotalLen ?? d.totalLen;
    const length = typeof lenRaw === "number" && lenRaw > 0 ? lenRaw : undefined;
    return { fileId, aesKey, length };
}
/** 构造现代小程序卡片 XML (纯函数, 可单测; 与 buildAppMsgXml 并存互不影响) */
export function buildMiniProgramCardXml(o) {
    const desc = o.desc || o.sourceDisplayName || o.title;
    const srcName = o.sourceDisplayName || o.desc || o.title;
    // v1.6.3: 缩略图节点 —— 与真卡片逐节点对齐 (cdnthumbheight/md5/width/length/url/aeskey + 顶层 md5)。
    //   只给 fileId+aesKey 也照发 (客户端靠这两个取图), 尺寸/md5 有则带上。
    const attach = o.thumb
        ? `<appattach>` +
            // 节点顺序照抄真卡片 (height → md5 → width → length → url → aeskey)
            (o.thumbHeight !== undefined ? `<cdnthumbheight>${o.thumbHeight}</cdnthumbheight>` : "") +
            (o.thumb.md5 ? `<cdnthumbmd5>${o.thumb.md5}</cdnthumbmd5>` : "") +
            (o.thumbWidth !== undefined ? `<cdnthumbwidth>${o.thumbWidth}</cdnthumbwidth>` : "") +
            (o.thumb.length !== undefined ? `<cdnthumblength>${o.thumb.length}</cdnthumblength>` : "") +
            `<cdnthumburl>${escapeXml(o.thumb.fileId)}</cdnthumburl>` +
            `<cdnthumbaeskey>${escapeXml(o.thumb.aesKey)}</cdnthumbaeskey>` +
            `</appattach>`
        : "";
    return (`<appmsg>` +
        `<title>${escapeXml(o.title)}</title>` +
        `<weappinfo>` +
        `<pagepath>${escapeXml(o.pagePath)}</pagepath>` +
        (o.iconUrl ? `<weappiconurl>${escapeXml(o.iconUrl)}</weappiconurl>` : "") +
        (o.version !== undefined ? `<version>${o.version}</version>` : "") +
        `<appid>${escapeXml(o.appId)}</appid>` +
        `<type>2</type>` + // 2 = 小程序 (真卡片值; 1 = 小游戏)
        (o.username ? `<username>${escapeXml(o.username)}</username>` : "") +
        `</weappinfo>` +
        `<sourceusername>${escapeXml(o.appId)}</sourceusername>` +
        attach +
        `<type>33</type>` + // 33 = 小程序卡片 (49 消息体里的 appmsg type)
        `<sourcedisplayname>${escapeXml(srcName)}</sourcedisplayname>` +
        `<des>${escapeXml(desc)}</des>` +
        // 真卡片把缩略图 md5 也放在顶层 (与 cdnthumbmd5 同值)
        (o.thumb?.md5 ? `<md5>${escapeXml(o.thumb.md5)}</md5>` : "") +
        `</appmsg>`);
}
/** 图片像素尺寸 (cdnthumbwidth/height 用; 认不出返 undefined —— 纯布局提示, 不致命) */
export function imagePixelSize(buf) {
    // PNG: 8 字节签名 + 4 长度 + "IHDR" + 宽(4) 高(4) 大端
    if (buf.length >= 24 && buf.readUInt32BE(0) === 0x89504e47) {
        return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    // JPEG: 扫 SOFn 段
    if (buf.length >= 4 && buf[0] === 0xff && buf[1] === 0xd8) {
        let i = 2;
        while (i + 9 < buf.length) {
            if (buf[i] !== 0xff) {
                i++;
                continue;
            }
            const marker = buf[i + 1];
            if (marker === undefined)
                break;
            const len = buf.readUInt16BE(i + 2);
            // SOF0-3 / SOF5-7 / SOF9-11 / SOF13-15 (跳过 DHT/DAC/RSTn 等)
            if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
                return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
            }
            if (len < 2)
                break;
            i += 2 + len;
        }
    }
    return undefined;
}
/**
 * 把 (上传的图片字节 + /Msg/UploadImg 的响应体) 合成 appattach 需要的完整凭据。
 * 纯函数 ⇒ 单测可直接喂真 PNG 字节 + 真响应形状, 不必真打厂商 (uploadCdnThumb 只剩 IO + 错误处理)。
 * 尺寸/md5 是客户端取图与排版用的; TotalLen 缺失时用本地字节数兜底 (同源同值)。
 */
export function cdnThumbRefFromUpload(buf, uploadData) {
    const ref = extractCdnThumbRef(uploadData);
    if (!ref)
        return null;
    const size = imagePixelSize(buf);
    return {
        ...ref,
        length: ref.length ?? buf.length,
        md5: createHash("md5").update(buf).digest("hex"),
        ...(size ?? {}),
    };
}
/**
 * sendXCX 的 Content 构造 (纯函数 + 注入式上传, 便于单测).
 *
 * 规则: 给了 pagePath ⇒ 现代 type=33 卡片 (能开小程序内部页面, 且需要 appattach —— 没有 appattach
 *   卡片就是灰块, 见 MiniProgramCardXmlOpts.thumb); 没给 ⇒ 保持 legacy type=2001 输出**逐字节
 *   不变** (老调用方零回归, 有测试锁), 且**不触发任何上传**。
 */
export async function buildXCXContent(toWxid, o, uploadThumb) {
    if (o.pagePath) {
        // v1.6.4: 先看是不是"原卡片凭据令牌" —— 是则原样透传 (这条路上一个字节都不下载不上传)
        const token = parseThumbToken(o.thumbUrl);
        const tokenish = o.thumbUrl?.startsWith(THUMB_TOKEN_PREFIX) ?? false;
        // 缩略图拿不到 (上传失败/令牌非法/没给) 都不算致命: 卡片照发 (只是没图), 绝不能因此把消息丢掉
        const thumb = token ?? (tokenish || !o.thumbUrl ? null : await uploadThumb(o.thumbUrl));
        return buildMiniProgramCardXml({
            title: o.title,
            desc: o.desc,
            appId: o.appId,
            pagePath: o.pagePath,
            username: o.username,
            // iconUrl 只接受真 URL: 令牌串塞进 <weappiconurl> 会让微信按 URL 解析失败
            iconUrl: token ? token.iconUrl : tokenish ? undefined : o.thumbUrl,
            version: token?.version,
            sourceDisplayName: o.desc || o.title,
            thumb: thumb ?? undefined,
            thumbWidth: thumb ? thumb.width : undefined,
            thumbHeight: thumb ? thumb.height : undefined,
        });
    }
    return buildAppMsgXml(toWxid, o.title, o.desc, {
        appid: o.appId,
        sourcedisplayname: o.title,
        url: o.url,
        ...(o.thumbUrl ? { weappiconurl: o.thumbUrl } : {}),
    });
}
function escapeXml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
export function makeWppMsg(ctx) {
    const opts = ctxToCallOpts(ctx);
    // (agent-tools 工具走这里; 失败 Code≠0 由 persistOutboundMsg 内部跳过)
    // v1.3.19 UNIFY-SEND: 加 persist 参数 — api-client (shim) 委托时传 false 防双入库,
    //   outbound.ts 的 persistOutbound 负责入库
    const dispatch = async (ep, body = {}, persist = true) => {
        const r = await postWppJson(ctx.baseUrl, ep, body, opts);
        if (persist) {
            const meta = outboundMetaFor(ep, body);
            if (meta)
                await persistOutboundMsg(ctx, { ...meta, resp: r });
        }
        return r;
    };
    /** 缩略图上传的落地会话: 发到 filehelper (bot 自己的文件传输助手) —— 客户会话里看不见, 只借它把图落到微信 CDN */
    const THUMB_UPLOAD_TARGET = "filehelper";
    /**
     * v1.6.3 XCX-THUMB: 把缩略图上传到微信 CDN, 换回 appattach 要的那组凭据 (fileid+aeskey+md5+尺寸)。
     *
     * 为什么非要这一步: 老板 2026-09-13 实测 —— 小程序卡片只给 `<weappiconurl>` (或厂商结构化接口的
     *   thumbUrl) 时, 微信端显示的是**灰块**; 真卡片的图来自 `<appattach>` 里的 CDN blob, 而那组凭据只有
     *   "把图上传到 CDN" 才拿得到。原卡片的旧凭据已失效 (`/Tools/CdnDownloadImage` 返 -5103017),
     *   故必须自己上传一份。端点选 /Msg/UploadImg: 它响应里的 `Fileid`/`Aeskey` 与真卡片 appattach 的
     *   `cdnthumburl`/`cdnthumbaeskey` **同格式** (前缀都是 305f020100044b3049), 且实测可被
     *   /Tools/CdnDownloadImage 取回 ⇒ 收件人客户端也能取。
     *
     * 任何一步失败都返 null (调用方按"没图"发, 不阻塞消息)。
     */
    const uploadCdnThumb = async (thumbUrl) => {
        try {
            // 复用图片链路的 SSRF 安全取图 (host 白名单 + 15MB cap), 不自己写 fetch
            const base64 = await resolveImageToBase64(thumbUrl);
            const buf = Buffer.from(base64, "base64");
            if (buf.length === 0) {
                warn(`[WPP v1.6.3 XCX-THUMB] 缩略图为空: ${thumbUrl}`);
                return null;
            }
            const r = await postWppJson(ctx.baseUrl, "/Msg/UploadImg", { Base64: base64, ToWxid: THUMB_UPLOAD_TARGET }, opts);
            const ref = cdnThumbRefFromUpload(buf, r.Data);
            if (!ref) {
                warn(`[WPP v1.6.3 XCX-THUMB] UploadImg 未返回可用凭据 (Code=${r.Code} msg=${String(r.raw?.Message ?? "")}) ⇒ 卡片将无缩略图`);
                return null;
            }
            return ref;
        }
        catch (e) {
            warn(`[WPP v1.6.3 XCX-THUMB] 缩略图上传失败 (非致命, 卡片照发): ${formatErr(e)}`);
            return null;
        }
    };
    /**
     * v1.3.53 VOICE-DEGRADE: 下载 fileUrl → sendFileViaApp 发文件 (sendFile 复用 + 语音转码失败降级共用)。
     * 返回 WppApiResponse (sendFile 语义), 失败返 Code=-2 + 原因。
     */
    const sendFileViaAppFromUrl = async (toWxid, fileUrl, fileName) => {
        try {
            const buf = await safeFetchWithCap(fileUrl, { signal: AbortSignal.timeout(60_000) }, 50 * 1024 * 1024);
            if (buf.length === 0)
                return { Code: -2, CodeValue: "EMPTY_FILE", Data: null, raw: null };
            const state = await import("../account-state.js").then((m) => m.getDefaultAccountRegistry().get(ctx.accountId));
            if (!state)
                return { Code: -2, CodeValue: "NO_ACCOUNT", Data: null, raw: null };
            const r = await state.apiClient.sendFileViaApp(toWxid, fileName, buf.toString("base64"), buf.length);
            await persistOutboundMsg(ctx, { toWxid, msgType: "file", content: `[文件] ${fileName} ${fileUrl}`, resp: r });
            return r;
        }
        catch (e) {
            return { Code: -2, CodeValue: "SEND_FAIL", Data: null, raw: null };
        }
    };
    return {
        /**
         * 引用回复: ShareLink + appmsg type=57 完整 refermsg (vendor /Msg/Quote ret=-2 不可用;
         * 简单 <svrid> 引用显示"引用内容不存在")
         */
        quoteXml: (toWxid, xml) => dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),
        /** /Msg/Quote — 引用文本消息 (兼容保留) */
        quote: (msgId, toWxid, content) => dispatch("/Msg/Quote", { msgId, toWxid, content }),
        /** /Msg/Revoke — 撤回消息 (swagger: ClientMsgId/NewMsgId/CreateTime/ToUserName) */
        /**
         * v1.3.20 REVOKE-FIX: RevokeMsgParamDoc 全 integer int64 — vendor Go 反序列化 string 到 int64 失败 (Code=-8 INVALID_ARGUMENT),
         * 必须传 number. NewMsgId 是 19 位大数, Number() 丢精度但 vendor 实测接受 (ret=0, 2026-08-10 实测).
         * CreateTime 必须用消息自己的 server time (createTime 参数, 来自 extractOutboundMsgIds.Createtime);
         *   now 会导致 vendor ret=0 但不真撤 (2026-08-10 老板实测 "撤回now 没撤").
         */
        revoke: (msgId, newMsgId, toWxid, createTime) => dispatch("/Msg/Revoke", {
            ClientMsgId: Number(msgId) || 0,
            NewMsgId: Number(newMsgId),
            CreateTime: createTime ?? Math.floor(Date.now() / 1000),
            ToUserName: toWxid,
        }),
        /** 发 XML 应用消息: /Msg/SendApp 曾被判为群发端点不能用, 用 /Msg/ShareLink (见下 sendAppMsg 的语义变更说明) */
        sendApp: (toWxid, xml, _appName) => dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),
        /**
         * /Msg/SendApp — 发送 App 类型消息 (需自行构造 XML).
         * ⚠️ v1.6.0 SWAGGER-323 **语义已变, 但本包装仍按最保守方式暴露**:
         *   - 旧 swagger: 本端点 = **群发** (SendGroupMassMsgTextParamDoc), 项目当年专门绕开它改用
         *     /Msg/ShareLink (见上方 sendApp 与 CHANGELOG v1.1.17 P0-B「群发端点」事故)。
         *   - 当前容器 swagger (v09102): body = Msg.SendAppMsgParamDoc {ToWxid, Type, Xml}
         *     —— 与 /Msg/ShareLink **同一个 definition**, summary「发送App消息」, 描述里已无群发字样。
         *   ⇒ 厂商很可能已把它改成定向发送, 但**无活体证据**且史上有群发事故, 故:
         *     ① toWxid 是**必传形参** — 结构上不可能发出无收件人的调用;
         *     ② **不注册 agent 工具** (与 publishCircleRaw 同则: AI 不该有原始 XML 发送能力);
         *     ③ 首次启用前请在测试账号确认 Code=0 且消息只到 toWxid。
         */
        sendAppMsg: (toWxid, xml, type = 5) => dispatch("/Msg/SendApp", { ToWxid: toWxid, Type: type, Xml: xml }),
        /** /Msg/SendCDNFile — 转发 CDN 文件 (swagger Msg.DefaultParamDoc {Content, ToWxid}; Content=收到文件消息xml) */
        sendCDNFile: (toWxid, fileUrl) => dispatch("/Msg/SendCDNFile", { ToWxid: toWxid, Content: fileUrl }),
        /**
         * v1.3.12 sendFile: 发送文件 (推荐). 下载 fileUrl → sendFileViaApp (UploadFile+type6).
         * 实测 SendCDNFile Ret=-2; sendFileViaApp 可发可打开 (有"未审核应用"标签, 方案 C 接受).
         * v1.3.18 P1-安全2 + F4 fix (2026-08-10): safeFetchWithCap (50MB cap + host 白名单),
         *   杜绝裸 fetch + Buffer.toString("base64") 双倍内存 + SSRF (恶意 fileUrl 读内网)
         */
        sendFile: (toWxid, fileUrl, fileName) => sendFileViaAppFromUrl(toWxid, fileUrl, fileName),
        /** /Msg/SendCDNImg — 发送 CDN 图片 (v1.2.1 swagger-alignment: DefaultParamDoc {Content, ToWxid}) */
        sendCDNImg: (toWxid, imgUrl) => dispatch("/Msg/SendCDNImg", { ToWxid: toWxid, Content: imgUrl }),
        /**
         * v1.3.19 UNIFY-SEND: 发送图片 (URL/base64/本地路径 → base64 → /Msg/UploadImg)。
         * 对齐 api-client 生产验证路径 (SendCDNImg vendor 拉外网图片可能 ret=-2, UploadImg 更可靠)。
         * persist 默认 true (收口入库); api-client shim 委托时传 false 防双入库。
         */
        sendImage: async (toWxid, imageUrlOrPath, persist = true) => {
            const Base64 = await resolveImageToBase64(imageUrlOrPath);
            return dispatch("/Msg/UploadImg", { ToWxid: toWxid, Base64 }, persist);
        },
        /** /Msg/SendCDNVideo — 发送 CDN 视频 (v1.2.1 swagger-alignment: DefaultParamDoc {Content, ToWxid}) */
        sendCDNVideo: (toWxid, videoUrl) => dispatch("/Msg/SendCDNVideo", { ToWxid: toWxid, Content: videoUrl }),
        /** /Msg/SendEmoji — swagger Msg.SendEmojiParamDoc {Md5, ToWxid, TotalLen} */
        sendEmoji: (toWxid, emojiMd5, emojiSize) => dispatch("/Msg/SendEmoji", { ToWxid: toWxid, Md5: emojiMd5, TotalLen: emojiSize }),
        /** 小程序发送走 sendXCX (/Msg/SendXCX); 不再有 sendMiniProgram 死代码 (曾错调 /Msg/SendApp 群发端点) */
        /** 发送小程序 XML (vendor 期望 <appmsg> 节点, type=2001 mini-program + <mmapp>) */
        sendAppFromXml: (toWxid, xml, _appName) => dispatch("/Msg/ShareLink", { ToWxid: toWxid, Type: 5, Xml: xml }),
        /** /Msg/SendTxt — 发送文本 (swagger: At 逗号串 + Type:1; persist 默认 true 收口入库) */
        sendTxt: (toWxid, content, ats, persist = true) => dispatch("/Msg/SendTxt", { ToWxid: toWxid, Content: content, At: (ats ?? []).join(","), Type: 1 }, persist),
        /** /Msg/SendVideo — 发送视频 (v1.2.1 P1-fix 字段 PascalCase; v1.3.19 URL→base64 + persist) */
        sendVideo: async (toWxid, videoUrl, thumbUrl, playLengthMs, persist = true) => {
            const Base64 = await resolveImageToBase64(videoUrl);
            const ImageBase64 = thumbUrl ? await resolveImageToBase64(thumbUrl) : "";
            return dispatch("/Msg/SendVideo", {
                ToWxid: toWxid,
                Base64,
                ImageBase64,
                PlayLength: playLengthMs ?? 0,
            }, persist);
        },
        /**
         * /Msg/SendVoice — 发送语音
         * v1.3.52 SILK-ONLY (2026-08-12 接总立): vendor /Msg/SendVoice **只接受 silk** (Type=4)。
         *   - 输入已是 silk (data:audio/silk / .silk / formatHint='silk') → 直接 base64, Type=4
         *   - 输入是 mp3/其它 → 必须经 silk-encoder 转码 (v1.3.48 起 ffmpeg PCM 24kHz → silk -tencent)
         *   - 转码失败 → v1.3.53 VOICE-DEGRADE: 降级为文件消息 (老板 6-12 16:36 偏好: 成功发语音, 失败降级文件)
         *     (绝不给 /Msg/SendVoice 传 mp3 — vendor 只收 silk)
         * 旧 v1.3.49 SILK-TYPE-FIX 的 Type 枚举: AMR=0, MP3=2, SILK=4, SPEEX=1, WAVE=3
         *   现在 Type 恒为 4 (SILK), formatHint 仅作 silk 识别提示, 不再映射 MP3=2
         */
        sendVoice: async (toWxid, voiceUrl, durationMs, persist = true, formatHint) => {
            const noQuery = (voiceUrl.split("?")[0] ?? "").toLowerCase();
            const isSilkInput = voiceUrl.startsWith("data:audio/silk") || noQuery.endsWith(".silk") || formatHint === "silk";
            let base64;
            let voiceTime = durationMs ?? 0;
            if (isSilkInput) {
                // silk 直接透传 (resolveImageToBase64 支持 data URI / URL / 本地路径)
                base64 = await resolveImageToBase64(voiceUrl);
            }
            else {
                // mp3/其它 → 强制转 silk (vendor 只收 silk)
                try {
                    const { encodeMp3ToSilk } = await import("../dispatch/silk-encoder.js");
                    const { silkBuffer, voiceDurationMs } = await encodeMp3ToSilk(voiceUrl);
                    base64 = silkBuffer.toString("base64");
                    voiceTime = durationMs ?? voiceDurationMs;
                }
                catch (e) {
                    // v1.3.53 VOICE-DEGRADE (老板 6-12 偏好): 转码失败 → 降级发文件 (不抛错)
                    warn(`[WPP v1.3.53 VOICE-DEGRADE] silk 转码失败, 降级发文件: ${formatErr(e)}`);
                    const fileName = (voiceUrl.split("?")[0] ?? "").split("/").pop() || "voice.mp3";
                    return sendFileViaAppFromUrl(toWxid, voiceUrl, fileName);
                }
            }
            return dispatch("/Msg/SendVoice", {
                ToWxid: toWxid,
                Base64: base64,
                Type: 4, // v1.3.52 SILK-ONLY: 恒 SILK
                VoiceTime: voiceTime,
            }, persist);
        },
        /**
         * /Msg/SendXCX — swagger Msg.DefaultParamDoc {Content, ToWxid}
         * v1.6.2 XCX-PAGEPATH: 传了 pagePath ⇒ Content 走现代卡片 (type=33 + weappinfo, 可开小程序内部页面);
         *   不传 ⇒ 维持 legacy type=2001 (老行为逐字节不变)。username 形如 `gh_xxx@app`, 从入站卡片注记里可拿到。
         * v1.6.3 XCX-THUMB: 现代卡片先把 thumbUrl 上传到微信 CDN 换 appattach 凭据 (没有它卡片是灰块 —— 实测)。
         */
        sendXCX: async (toWxid, xcxTitle, xcxDesc, xcxUrl, xcxAppId, thumbUrl, pagePath, username) => dispatch("/Msg/SendXCX", {
            ToWxid: toWxid,
            Content: await buildXCXContent(toWxid, { title: xcxTitle, desc: xcxDesc, url: xcxUrl, appId: xcxAppId, thumbUrl, pagePath, username }, uploadCdnThumb),
        }),
        /** /Msg/ShareCard — 分享名片 (v1.2.1 swagger-alignment: ShareCardParamDoc {CardAlias, CardNickName, CardWxId, ToWxid}) */
        shareCard: (toWxid, cardWxid, cardNickname, cardAlias) => dispatch("/Msg/ShareCard", {
            ToWxid: toWxid,
            CardWxId: cardWxid,
            CardNickName: cardNickname,
            CardAlias: cardAlias ?? "",
        }),
        /** /Msg/ShareLink — 分享链接 (v1.2.1 swagger-alignment: SendAppMsgParamDoc {ToWxid, Type, Xml}) */
        shareLink: (toWxid, title, desc, linkUrl, thumbUrl) => dispatch("/Msg/ShareLink", {
            ToWxid: toWxid,
            Type: 5,
            Xml: buildShareLinkXml(title, desc, linkUrl, thumbUrl),
        }),
        /**
         * /Msg/ShareLocation — 分享位置 (v1.2.1 swagger-alignment: ShareLocationParamDoc {X, Y, Label, Poiname, Scale, Infourl, ToWxid})
         * v1.3.11: X=纬度(lat), Y=经度(lng) — 对齐 gewe (buildLocationPayload x=lat,y=lng), 反了会定位卡片缩略图错位
         */
        shareLocation: (toWxid, latitude, longitude, label, poiName) => dispatch("/Msg/ShareLocation", {
            ToWxid: toWxid,
            X: latitude,
            Y: longitude,
            Label: label ?? "",
            Poiname: poiName ?? "",
            Scale: 16,
            Infourl: "",
        }),
        /** /Msg/ShareVideo — 分享视频消息 (v1.2.1 swagger-alignment: ShareVideoMsgParamDoc {ToWxid, Xml}) */
        shareVideo: (toWxid, xml) => dispatch("/Msg/ShareVideo", {
            ToWxid: toWxid,
            Xml: xml,
        }),
        /** /Msg/StartAutoSync — 启动自动同步 (v1.2.1 swagger-alignment: SyncParam2Doc {TargetURL}) */
        startAutoSync: (targetUrl) => dispatch("/Msg/StartAutoSync", { TargetURL: targetUrl }),
        /**
         * /Msg/SendGroupMassMsgText — 群发文本 (v1.3.67 新 vendor API)
         * ToIds=群 wxid 数组, Content=文本
         */
        sendGroupMassMsgText: (toIds, content) => dispatch("/Msg/SendGroupMassMsgText", { ToIds: toIds, Content: content }),
        /**
         * /Msg/SendFile — 发送文件 (v1.3.67 新 vendor API; 自动上传+发送)
         * ToWxid=目标, FileName=文件名, Base64=文件内容
         */
        sendFileV2: (toWxid, fileName, base64) => dispatch("/Msg/SendFile", { ToWxid: toWxid, FileName: fileName, Base64: base64 }),
        /**
         * /Msg/SendAppMessage — 发送结构化应用卡片 (v1.3.67 新 API)
         * items=[{kind:'link'|'mini_program'|'music'|'file', ...}] 单次最多 20 项
         */
        sendAppMessage: (items) => dispatch("/Msg/SendAppMessage", { items }),
        /** /Msg/Sync — 同步消息 (swagger: Msg.SyncParamDoc {Scene=0, Synckey=""}) */
        sync: () => dispatch("/Msg/Sync", { Scene: 0, Synckey: "" }),
        /** /Msg/UploadImg — 上传图片(返回 imgUrl 后用于 SendImg) (v1.2.1 P1-fix: 字段对齐 swagger Base64/ToWxid) */
        uploadImg: (imgBase64, toWxid) => postWppJson(ctx.baseUrl, "/Msg/UploadImg", { Base64: imgBase64, ToWxid: toWxid }, opts),
    };
}
//# sourceMappingURL=msg.js.map