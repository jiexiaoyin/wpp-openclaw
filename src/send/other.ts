// src/send/other.ts - Other tag (1 endpoint: 运动排行)
// v1.6.0 SWAGGER-323 (2026-09-13): 厂商新增 `Other` tag, 目前只有一个端点
//   (POST /Other/GetUserRankLikeCount), 独立成模块以免塞进语义不符的 user/friend.

import { postWppJson } from "../api/client.js";
import { ctxToCallOpts, type WppAccountCtx } from "./factory.js";

export function makeWppOther(ctx: WppAccountCtx) {
  const opts = ctxToCallOpts(ctx);
  const dispatch = (ep: string, body: Record<string, unknown> = {}) =>
    postWppJson(ctx.baseUrl, ep, body, opts);

  return {
    /**
     * /Other/GetUserRankLikeCount — 获取运动排行点赞统计.
     * swagger: User.GetUserRankLikeCountParamDoc {rankId(排行榜 ID, 留空=查最新榜单)}.
     * 响应只含排行、点赞用户与展示信息。
     */
    getUserRankLikeCount: (rankId = "") =>
      dispatch("/Other/GetUserRankLikeCount", { rankId }),
  };
}

export type WppOtherApi = ReturnType<typeof makeWppOther>;
