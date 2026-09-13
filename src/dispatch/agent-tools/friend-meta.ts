// src/dispatch/agent-tools/friend-meta.ts - Friend tag (12)
// v1.3.18 P1-核心1 fix (2026-08-10): 改成 lazy-evaluate ctx 模式

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppFriend } from "../../send/friend.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getFriendApi() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
  return makeWppFriend({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const FRIEND_META: ToolMeta = {
  /** /Friend/GetContractList */
  getContactList: [
    "获取通讯录好友列表 (一次性全量).",
    Type.Object({}),
    () => getFriendApi().getContractList(),
  ],
  /** /Friend/GetContractDetail */
  getContactDetail: [
    "获取指定 wxid 的好友详情.",
    Type.Object({ wxid: Type.String() }),
    (wxid: string) => getFriendApi().getContractDetail(wxid),
  ],
  /** /Friend/GetFriendstate */
  getFriendState: [
    "查询好友状态 (在线/性别/地区).",
    Type.Object({ wxid: Type.String() }),
    (wxid: string) => getFriendApi().getFriendState(wxid),
  ],
  /** /Friend/Search */
  searchContact: [
    "按关键字搜索联系人.",
    Type.Object({ keyword: Type.String() }),
    (keyword: string) => getFriendApi().search(keyword),
  ],
  /** /Friend/SendRequest */
  sendFriendRequest: [
    "添加联系人 (发好友请求). content 留空也允许.",
    Type.Object({
      v1: Type.String(),
      v2: Type.String(),
      content: Type.Optional(Type.String()),
    }),
    (v1: string, v2: string) => getFriendApi().sendRequest(v1, v2),
  ],
  /** /Friend/PassVerify */
  passFriendVerify: [
    "通过好友请求 (v1/v2 来自 inbound 事件 payload).",
    Type.Object({ v1: Type.String(), v2: Type.String() }),
    (v1: string, v2: string) => getFriendApi().passVerify(v1, v2),
  ],
  /** /Friend/SetRemarks */
  setFriendRemarks: [
    "设置好友备注.",
    Type.Object({ wxid: Type.String(), remark: Type.String() }),
    (wxid: string, remark: string) => getFriendApi().setRemarks(wxid, remark),
  ],
  /** /Friend/Blacklist */
  toggleBlacklist: [
    "加入/移除黑名单. operation: add|remove.",
    Type.Object({
      wxid: Type.String(),
      operation: Type.Union([Type.Literal("add"), Type.Literal("remove")]),
    }),
    // 原版 api.blacklist(wxid, "add"|"remove") — 但 api.blacklist 签名是 (wxid, val: 1|2)
    // 这是历史不一致, 跟 v1.3.18 修复无关, 不优化
    (wxid: string, _operation: "add" | "remove") => getFriendApi().blacklist(wxid, 1),
  ],
  /** /Friend/Delete */
  deleteFriend: [
    "删除好友.",
    Type.Object({ wxid: Type.String() }),
    (wxid: string) => getFriendApi().delete(wxid),
  ],
  /** /Friend/LbsFind */
  lbsFind: [
    "附近的人.",
    Type.Object({
      latitude: Type.Number(),
      longitude: Type.Number(),
      radius: Type.Optional(Type.Number({ description: "米" })),
    }),
    (latitude: number, longitude: number, _radius?: number) => getFriendApi().lbsFind(latitude, longitude),
  ],
  /** /Friend/GetGHList — 通讯录完整拉取 (v1.3.67 新 API) */
  getGHList: [
    "通讯录完整拉取 (分页+批量补齐名称/备注/头像). 比 getContactList 更全.",
    Type.Object({}),
    () => getFriendApi().getGHList(),
  ],

  // ===== v1.6.0 SWAGGER-323: 好友申请自动化 (2) =====

  /**
   * /Friend/GetFriendRequestList — 读好友申请列表.
   * 返回项里的 v1/v2/scene 可直接喂 passVerify 通过申请 (见下 acceptFriendRequest)。
   */
  getFriendRequestList: [
    "获取好友申请列表 (由 msg_type=37 同步消息自动进入列表). status 默认 pending. 返回项的 v1/v2/scene 可直接用于通过申请.",
    Type.Object({
      status: Type.Optional(Type.Union([
        Type.Literal("pending"), Type.Literal("accepted"), Type.Literal("all"),
      ], { description: "申请状态, 默认 pending" })),
      page: Type.Optional(Type.Number({ description: "页码, 从 1 开始, 默认 1" })),
      limit: Type.Optional(Type.Number({ description: "每页数量 1-100, 默认 20" })),
    }),
    (status?: "pending" | "accepted" | "all", page?: number, limit?: number) =>
      getFriendApi().getFriendRequestList({ status, page, limit }),
  ],
  /**
   * /Friend/AutoAccept — 配置**自动通过好友申请**.
   * ⚠️ 这是「陌生人自动变好友」的开关 — 服务端默认关闭, 本工具无任何默认放行:
   *   调用方必须显式 enabled=true; scenes 留空 = 所有来源场景 (厂商建议显式白名单, 别留空)。
   *   搭配 getFriendRequestList 可先看有什么申请再决定是否开。
   */
  setFriendAutoAccept: [
    "配置自动通过好友申请 (默认关闭). enabled=true 才会生效; scenes 是允许自动通过的来源场景白名单, 留空=所有场景 (不推荐). 建议先用 getFriendRequestList 看清申请来源.",
    Type.Object({
      enabled: Type.Boolean({ description: "是否开启自动通过" }),
      scenes: Type.Optional(Type.Array(Type.Number(), { description: "允许自动通过的来源场景, 留空=所有场景" })),
      delaySeconds: Type.Optional(Type.Number({ description: "每条申请提交通过前的延迟秒数, 0-300" })),
      processPending: Type.Optional(Type.Boolean({ description: "开启后立即处理本地已有的 pending 申请" })),
    }),
    (enabled: boolean, scenes?: number[], delaySeconds?: number, processPending?: boolean) =>
      getFriendApi().autoAccept(enabled, { scenes, delaySeconds, processPending }),
  ],
};