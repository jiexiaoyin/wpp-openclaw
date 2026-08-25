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
//   - adminUsers (新): 老板等管理员, 未来可加"不限频 / 不脱敏 / 优先回复"特权
//
// 调用点: inbound/index.ts handleWebhookPayload

import type { WppInboundMessage } from "../types.js";

export type DmPolicyResult =
  | { allowed: true; isAdmin: boolean }
  | { allowed: false; reason: string };

export interface CheckDmPolicyOpts {
  msg: WppInboundMessage;
  /** accounts config: 私聊白名单 (空=开放) */
  allowFrom: string[];
  /** accounts config: 管理员 wxid 列表 (新字段, 用于特权识别) */
  adminUsers: string[];
}

/**
 * v1.1.39 SUNNOY-DM-POLICY: 借鉴 sunnoy checkDmPolicy 范式
 *   单一职责检查 DM 是否允许进入 dispatch
 *   返 { allowed, reason? } + isAdmin 标记 (供未来 admin 特权用)
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
export function checkDmPolicy(opts: CheckDmPolicyOpts): DmPolicyResult {
  const { msg, allowFrom, adminUsers } = opts;
  const fromWxid = msg.fromWxid;

  if (allowFrom.length > 0 && !allowFrom.includes(fromWxid)) {
    return { allowed: false, reason: `allowFrom mismatch: ${fromWxid}` };
  }

  const isAdmin = adminUsers.includes(fromWxid);

  //   - 频率限制 (admin 跳过)
  //   - 脱敏豁免 (admin 跳过)
  //   - 优先回复 (admin 排队优先)
  //   - pairing 模式 (WPP 暂不需要, wechat 无审批配对概念)
  //   - block list (黑名单)
  //   当前仅返 isAdmin 标记, 不实际应用特权 (避免一次性大改动)

  return { allowed: true, isAdmin };
}
