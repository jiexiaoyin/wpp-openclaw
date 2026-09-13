// src/inbound/app-card.ts - 小程序卡片 (msgType=49, app.category=mini_program) 解析 + 文本化
//
// 背景 (v1.6.1 MINIPROGRAM-CARD, 2026-09-13 老板实测): 老板转发国补小程序卡片给小助理, 小助理只看到
//   一行标题 ("快来领取政府家电数码补贴，单件最高补1500元") 并回「转发时只带了文字」—— **该归因是错的**。
//   实测生产 DB (wpp_messages.id=30864/30868/30869) 三条 49 消息的 raw_payload 里 app 块字段齐全:
//   app.mini_program.{app_id, page_path, username, source_display_name} + description + cover_image
//   (带 download_context) + raw_xml 全文。只是入站链路除接龙 (category=app_message, 见 relay.ts)
//   外对 49 无任何解析, app 块只落 raw_payload 审计 ⇒ 从不进 LLM, 模型只拿到厂商 content 字段 (= 标题)。
//
// ⚠️ 边界 (别指望更多): 小程序**页面内容**拿不到 —— 页面是客户端渲染 + 需用户登录态, 厂商推送不含正文。
//   本模块能给到的天花板 = 卡片元信息 (哪个小程序/哪个页面/活动 id) + 封面图。读「补贴档位/领取流程」
//   必须换路子 (搜索引擎找公开政策 / 看封面图), 不能靠解析消息实现。
import { logObj as log, formatErr } from "../core/logger.js";
import { loadOssConfig, ossUploadBuffer, sanitizeFilenamePart, } from "./media-enrich/shared.js";
import { formatThumbToken } from "../send/msg.js";
function asRecord(v) {
    return v && typeof v === "object" && !Array.isArray(v) ? v : undefined;
}
function str(v) {
    return typeof v === "string" && v.trim() ? v.trim() : undefined;
}
function num(v) {
    if (typeof v === "number" && Number.isFinite(v))
        return v;
    if (typeof v === "string" && /^\d+$/.test(v.trim()))
        return parseInt(v, 10);
    return undefined;
}
/**
 * 判定小程序卡片: `raw.app.category === "mini_program"`。
 * 同族 49 消息不会被误命中: 接龙/历史记录 = app_message, 文件 = file, 引用 = quote, 转账 = payment_notice。
 */
export function isMiniProgramCard(raw) {
    return str(asRecord(asRecord(raw)?.app)?.category) === "mini_program";
}
/** 解析 app 块 → 结构化卡片信息。字段缺失不抛; 非小程序卡片返 null。 */
export function parseMiniProgramCard(raw) {
    const app = asRecord(asRecord(raw)?.app);
    if (!app || str(app.category) !== "mini_program")
        return null;
    const mp = asRecord(app.mini_program);
    const cover = asRecord(app.cover_image);
    // download_context = { endpoint, file_no, file_aes_key, variant } — 可直接作为 /Tools/DownloadMiniProgramCover 请求体
    const dc = asRecord(cover?.download_context);
    const cdn = asRecord(cover?.cdn);
    return {
        title: str(app.title),
        description: str(app.description),
        appId: str(mp?.app_id),
        pagePath: str(mp?.page_path),
        username: str(mp?.username),
        sourceDisplayName: str(mp?.source_display_name),
        version: num(mp?.version),
        cover: cover
            ? {
                url: str(dc?.url) ?? str(cover.url),
                fileNo: str(dc?.file_no) ?? str(cover.file_no),
                fileAesKey: str(dc?.file_aes_key) ?? str(cover.aes_key),
                md5: str(cover.md5),
                length: num(cover.cdn_length) ?? num(cdn?.length),
                width: num(cover.width),
                height: num(cover.height),
                iconUrl: str(app.icon_url),
            }
            : undefined,
    };
}
/**
 * v1.6.4 XCX-THUMB-INHERIT: 卡片封面凭据 → 转发令牌 (入站注记里给模型, 出站原样塞进 appattach)。
 * 有 fileNo+fileAesKey 才能生成 (缺了就只能走"上传替代图"的降级路)。纯函数。
 */
export function coverThumbToken(info) {
    const c = info.cover;
    if (!c?.fileNo || !c.fileAesKey)
        return undefined;
    return formatThumbToken({
        fileId: c.fileNo,
        aesKey: c.fileAesKey,
        md5: c.md5,
        length: c.length,
        width: c.width,
        height: c.height,
        version: info.version,
        iconUrl: c.iconUrl,
    });
}
/**
 * 文本化 (追加进 content, 与 [图片]/[文件] 注入同一约定) — 让 LLM 知道「这是哪个小程序的哪个页面」。
 *
 * omitTitle: 厂商 content 字段本身就是标题 ⇒ handler 侧已有一行标题时传 true 去重。
 * 描述与小程序名相同 (国补卡片实测两者都是「国家消费品换新补贴微信端」) 时只打一行, 不重复。
 */
export function formatMiniProgramCard(info, opts) {
    const lines = [];
    if (info.title && !opts?.omitTitle)
        lines.push(`[小程序卡片] ${info.title}`);
    const who = info.sourceDisplayName ?? info.username ?? "小程序";
    // v1.6.2 XCX-PAGEPATH: username (gh_xxx@app) 必须一起打出来 —— 它是「小助理把这张卡片按原样转发给客户
    //   (sendMessage type=miniprogram + pagePath + username)」的必备参数。只给 appid 时转不出内部页面,
    //   模型也没法自己编出 gh_ 值 (它只在 raw_payload 里, 不进 prompt)。
    const ids = [info.appId ? `appid ${info.appId}` : "", info.username ?? ""].filter(Boolean);
    const idPart = ids.length ? ` (${ids.join(", ")})` : "";
    lines.push(`[小程序] ${who}${idPart}`);
    if (info.pagePath)
        lines.push(`页面路径: ${info.pagePath}`);
    if (info.description && info.description !== info.sourceDisplayName) {
        lines.push(`说明: ${info.description}`);
    }
    // 封面 (720×576 卡片图) 与图标 (140×140 小程序 logo) 必须分开标注 —— 两者内容与用途不同,
    //   混标会让模型以为看到了卡片大图。
    if (opts?.coverUrl)
        lines.push(`[小程序封面] ${opts.coverUrl}`);
    if (opts?.iconUrl)
        lines.push(`[小程序图标] ${opts.iconUrl}`);
    // v1.6.4 XCX-THUMB-INHERIT: 转发这张卡片**必须**带上这串 —— 它是原卡片的 appattach 凭据,
    //   出站原样填进 sendMessage 的 thumbUrl 即可 (卡片图 = 原卡片那张)。⚠️ 别拿上面的 OSS URL 去转发:
    //   那是我们**下载**到的资产 (封面下不动时就是图标), 用它转发等于换图。
    if (opts?.coverToken)
        lines.push(`[小程序封面凭据] ${opts.coverToken} (转发时原样填 thumbUrl)`);
    return lines.join("\n");
}
/**
 * 生成按优先级排列的下载尝试 (纯函数, 便于单测):
 *   ① cover: download_context.url 优先 (厂商文档: 已校验的官方封面直链), 否则 file_no+file_aes_key;
 *   ② icon : app.icon_url (仅在①拿不到时降级)。
 *
 * ⚠️ 2026-09-13 实测 (国补/苏新消费卡片): ①对真卡片**恒失败** —— 端点返回
 *   `异常：小程序封面下载失败：CDN 返回错误码 -5103017×8`; 同凭证打通用 /Tools/CdnDownloadImage
 *   同样 -5103017。**v1.6.4 更正归因**: 死的是**厂商服务端这个下载实现**, 不是凭据 —— 同一组凭据
 *   原样透传给 /Msg/SendXCX, 老板手机上显示的就是原卡片那张 720×576 封面 (20:45 与 21:20 两次实证)。
 *   ⇒ 转发请走 coverThumbToken 的透传路 (v1.6.4), 这里的下载路只用于"给模型看一眼"。
 *   ②稳定可用 (实测返回 140×140 PNG)。故下载路通常落到 icon, 这是已知现状而非 bug。
 */
export function planMiniProgramAssetAttempts(cover) {
    if (!cover)
        return [];
    const attempts = [];
    if (cover.url) {
        attempts.push({ kind: "cover", body: { url: cover.url } });
    }
    else if (cover.fileNo && cover.fileAesKey) {
        attempts.push({ kind: "cover", body: { file_no: cover.fileNo, file_aes_key: cover.fileAesKey } });
    }
    if (cover.iconUrl && cover.iconUrl !== cover.url) {
        attempts.push({ kind: "icon", body: { url: cover.iconUrl } });
    }
    return attempts;
}
/** 图片魔数 → 扩展名 (端点返回格式未文档化, 用 magic 判定, 认不出按 jpg) */
function sniffImageExt(buf) {
    if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
        return "jpg";
    if (buf.length >= 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
        return "png";
    if (buf.length >= 6 && buf.slice(0, 3).toString("ascii") === "GIF")
        return "gif";
    if (buf.length >= 12 &&
        buf.slice(0, 4).toString("ascii") === "RIFF" &&
        buf.slice(8, 12).toString("ascii") === "WEBP") {
        return "webp";
    }
    return "jpg";
}
/**
 * 下载小程序卡片资产 (封面→图标降级) 并传 OSS (老板 2026-09-13 拍板: 文本化 + 自动下封面)。
 * 端点 /Tools/DownloadMiniProgramCover (v1.6.0 接入, 与 CdnDownloadImage 同形), 返回 Data.Image = base64。
 * 全部尝试失败/无 OSS 凭据一律返 { mediaUrl:null, error } —— 调用方按非致命处理, 不阻塞入库与派发。
 */
export async function enrichMiniProgramAsset(ctx, cover) {
    const attempts = planMiniProgramAssetAttempts(cover);
    if (attempts.length === 0) {
        return { mediaUrl: null, mediaSize: null, error: "no cover url/file_no/icon_url" };
    }
    if (!loadOssConfig()) {
        return { mediaUrl: null, mediaSize: null, error: "oss credentials missing" };
    }
    // 动态 import 与 media-enrich/shared.ts 同因: 避开 inbound ↔ send/api 的模块环
    const { postWppJson } = await import("../api/client.js");
    const { ctxToCallOpts } = await import("../send/factory.js");
    let lastError = "";
    for (const attempt of attempts) {
        try {
            const resp = await postWppJson(ctx.baseUrl, "/Tools/DownloadMiniProgramCover", attempt.body, ctxToCallOpts(ctx));
            const b64 = resp.Data?.Image;
            if (!b64) {
                // 厂商 Message 不在 WppApiResponse 上, 在 raw 里 —— 排障关键 (实测 -8 时 Message 才写明
                // 「CDN 返回错误码 -5103017」, 只看 Code=-8 完全查不出原因)
                const rawMsg = asRecord(resp.raw)?.Message;
                const vendorMsg = typeof rawMsg === "string" ? rawMsg.slice(0, 120) : "";
                throw new Error(`missing Image: code=${resp.Code} value=${resp.CodeValue ?? ""} msg=${vendorMsg}`);
            }
            const buf = Buffer.from(b64, "base64");
            if (buf.length < 100)
                throw new Error(`too small (len=${buf.length})`);
            const filename = `${sanitizeFilenamePart(cover?.md5)}.${sniffImageExt(buf)}`;
            const url = await ossUploadBuffer(buf, filename, "wpp/miniprogram", {
                accountId: ctx.accountId,
                type: "miniprogram",
            });
            log.debug(`[WPP v1.6.1 MINIPROGRAM-ASSET] ok kind=${attempt.kind}: ${url} (${buf.length} bytes)`);
            return { mediaUrl: url, mediaSize: buf.length, kind: attempt.kind };
        }
        catch (e) {
            lastError = `${attempt.kind}: ${formatErr(e)}`;
            log.warn(`[WPP v1.6.1 MINIPROGRAM-ASSET] ${attempt.kind} failed: ${formatErr(e)}`, {
                fileNo: cover?.fileNo?.slice(0, 20),
            });
        }
    }
    return { mediaUrl: null, mediaSize: null, error: lastError };
}
//# sourceMappingURL=app-card.js.map