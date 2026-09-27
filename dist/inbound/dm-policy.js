// src/inbound/dm-policy.ts - 私聊策略检查 (v1.1.39 SUNNOY-DM-POLICY)
//
// 设计来源: sunnoy/wecom v3.4.0 wecom/dm-policy.js:31 checkDmPolicy
//   单一职责: 检查一条 DM 是否允许进入 dispatch 链路
//   范式: 返 { allowed: boolean; reason?: string } 而不是直接 boolean
//
// 与 sunnoy 的差异:
//   sunnoy: 检查 pairing (异步审批) + block + allow + admin
//   WPP: 检查 allowFrom (白名单) + adminUser 识别 (无 pairing, WPP 是 wechat 不是企业微信)
//
// WPP 当前 DM 行为:
//   - allowFrom 空 = 允许所有 (开放 DM, 当前是默认)
//   - allowFrom 非空 = 仅白名单 (e.g. 老板自己测试)
//   - adminUsers: 管理员 wxid 列表。本模块只做身份识别 (返 isAdmin 标记)。
//     已落地的消费点是「朋友圈发布白名单」(send/friendcircle.ts: 缺省 friendCirclePublishAllowFrom 时回退 adminUsers)。
//     限频 / 脱敏 / 优先回复豁免 **尚未接**, 是预留标记 —— 见下方 checkDmPolicy 尾部说明。
//
// 调用点: inbound/index.ts handleWebhookPayload
/**
 * v1.1.39 SUNNOY-DM-POLICY: 借鉴 sunnoy checkDmPolicy 范式
 *   单一职责检查 DM 是否允许进入 dispatch
 *   返 { allowed, reason? } + isAdmin 标记 (纯识别; 本模块不施加特权)
 *
 * @param opts - msg + allowFrom + adminUsers
 * @returns DmPolicyResult
 *
 * @example
 *   // 老板测试场景: allowFrom = ["wxid_demo"]
 *   checkDmPolicy({ msg, allowFrom: ["wxid_demo"], adminUsers: ["wxid_demo"] })
 *   // → { allowed: true, isAdmin: true }
 *
 *   // 陌生人场景
 *   checkDmPolicy({ msg, allowFrom: ["wxid_demo"], adminUsers: ["wxid_demo"] })
 *   // → { allowed: false, reason: "allowFrom mismatch" }
 */
export function checkDmPolicy(opts) {
    const { msg, allowFrom, adminUsers } = opts;
    const fromWxid = msg.fromWxid;
    if (allowFrom.length > 0 && !allowFrom.includes(fromWxid)) {
        return { allowed: false, reason: `allowFrom mismatch: ${fromWxid}` };
    }
    const isAdmin = adminUsers.includes(fromWxid);
    // ⚠️ 如实说明 (2026-09-27 审阅修正):
    //   本模块 **只做身份识别**, 不施加任何特权。返出的 isAdmin 字段当前在本模块内**无消费点**。
    //   已落地的 adminUsers 用法只有一处 (不在本链路): 朋友圈发布白名单
    //     send/friendcircle.ts — friendCirclePublishAllowFrom 缺省时回退 adminUsers。
    //   以下均为**未实现**的预留设想 (曾以「未来可加」措辞写在注释里, 易被误读为已有能力):
    //     - 频率限制豁免
    //     - 脱敏豁免
    //     - 优先回复排队
    //     - block list (黑名单, WPP 当前无此机制)
    //     - pairing 审批模式 (wechat 无企业微信审批配对概念, 预计不需要)
    //   若将来要接豁免, 应在调用点 (inbound/index.ts handleWebhookPayload) 消费 isAdmin, 而非在本模块内塞逻辑。
    return { allowed: true, isAdmin };
}
//# sourceMappingURL=dm-policy.js.map