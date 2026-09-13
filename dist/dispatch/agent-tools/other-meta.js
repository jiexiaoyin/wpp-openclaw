// src/dispatch/agent-tools/other-meta.ts - Other tag (1)
// v1.6.0 SWAGGER-323 (2026-09-13): 厂商新增 Other tag, 目前只有一个端点.
import { Type } from "typebox";
import { makeWppOther } from "../../send/other.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";
function getOtherApi() {
    const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
    if (!state)
        throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
    return makeWppOther({
        baseUrl: state.config.apiBaseUrl,
        tokenKey: state.config.tokenKey,
        authcode: state.authcode,
        accountId: getCurrentAccountId() ?? "default",
    });
}
export const OTHER_META = {
    /** /Other/GetUserRankLikeCount — 获取运动排行点赞统计 */
    getUserRankLikeCount: [
        "获取微信运动排行的点赞统计 (排行、点赞用户、展示信息). rankId 留空查最新榜单.",
        Type.Object({
            rankId: Type.Optional(Type.String({ description: "排行榜 ID, 留空=最新榜单" })),
        }),
        (rankId) => getOtherApi().getUserRankLikeCount(rankId ?? ""),
    ],
};
//# sourceMappingURL=other-meta.js.map