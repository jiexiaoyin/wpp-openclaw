// src/send/sayhello.ts - SayHello tag (2 endpoints: 打招呼)
import { postWppJson } from "../api/client.js";
import { ctxToCallOpts } from "./factory.js";
export function makeWppSayHello(ctx) {
    const opts = ctxToCallOpts(ctx);
    const dispatch = (ep, body = {}) => postWppJson(ctx.baseUrl, ep, body, opts);
    return {
        /**
         * /SayHello/Modelv1 — 打招呼模式1: 扫二维码加好友 (swagger: url 二维码链接必填, verifyContent 申请说明可选)
         * v1.3.66 对齐新 swagger (旧插件误传 scene/v1, 新旧 swagger 均 url/verifyContent)
         */
        modelv1: (url, verifyContent = "") => dispatch("/SayHello/Modelv1", verifyContent ? { url, verifyContent } : { url }),
        /**
         * /SayHello/Modelv2 — 打招呼模式2: 搜索加好友 (swagger: toUserName 微信号/手机号必填, content 申请说明,
         * scene 来源场景默认15, fromScene 搜索来源默认0, searchScene 搜索场景默认1)
         * v1.3.66 对齐新 swagger (旧插件误传 v1/v2)
         */
        modelv2: (toUserName, content = "", scene = 15) => dispatch("/SayHello/Modelv2", {
            toUserName,
            content,
            scene,
            fromScene: 0,
            searchScene: 1,
        }),
        /**
         * /SayHello/Modelv3 — 打招呼模式3: 用搜索结果凭据提交申请 (v1.3.67 新 API)
         * scene=来源场景, v3=联系人凭据, v4=备用凭据, verifyContent=申请说明
         */
        modelv3: (scene, v3, v4 = "", verifyContent = "") => dispatch("/SayHello/Modelv3", {
            scene,
            v3,
            ...(v4 ? { v4 } : {}),
            ...(verifyContent ? { verifyContent } : {}),
        }),
    };
}
//# sourceMappingURL=sayhello.js.map