// scripts/sync-contacts.ts - v1.3.34 三表同步 (通讯录/群/群成员)
// 用途: 同步微信通讯录 → wpp_contacts, 群列表 → wpp_chatrooms, 群成员 → wpp_chatroom_members
//       供 wpp-identity (昵称↔wxid) + 脱敏判断 (isInternalGroup) 快速查表
// 用法: npx tsx scripts/sync-contacts.ts
//       需 env: WECHATPRO_TOKEN_KEY / WECHATPRO_AUTHCODE / WECHATPRO_DB_PASSWORD

import mysql from "mysql2/promise";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { findPluginRoot } from "../src/core/paths.js";
import { makeWppFriend } from "../src/send/friend.js";
import { makeWppGroup } from "../src/send/group.js";

const BASE = "https://wx.juhe.chat";
const ACCOUNT = "default";

const ctx = {
  baseUrl: BASE,
  tokenKey: process.env.WECHATPRO_TOKEN_KEY ?? "",
  authcode: process.env.WECHATPRO_AUTHCODE ?? "",
  accountId: ACCOUNT,
};

if (!ctx.tokenKey || !ctx.authcode || !process.env.WECHATPRO_DB_PASSWORD) {
  console.error("缺 env: 需 WECHATPRO_TOKEN_KEY / WECHATPRO_AUTHCODE / WECHATPRO_DB_PASSWORD");
  process.exit(1);
}

const db = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3306,
  user: "wechatpro",
  password: process.env.WECHATPRO_DB_PASSWORD,
  database: "wechatpro",
});

async function ensureTables(): Promise<void> {
  await db.query(`CREATE TABLE IF NOT EXISTS wpp_chatroom_members (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    account_id VARCHAR(64) NOT NULL,
    chatroom_id VARCHAR(128) NOT NULL,
    wxid VARCHAR(128) NOT NULL,
    nickname VARCHAR(256),
    avatar_url VARCHAR(512),
    is_owner TINYINT DEFAULT 0,
    last_synced_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_room_wxid (account_id, chatroom_id, wxid),
    INDEX idx_wxid (wxid)
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);
}

// ===== 1. 通讯录 → wpp_contacts =====
async function syncContacts(): Promise<number> {
  const friend = makeWppFriend(ctx);
  const r = await friend.getContractList();
  const list = r.Data?.ContactUsernameList ?? [];
  let saved = 0;
  for (const wxid of list) {
    // 逐查详情 (昵称/备注/头像)
    const detail = await friend.getContractDetail(wxid);
    const c = detail.Data?.ContactList?.[0];
    const nickname = c?.NickName?.string ?? null;
    const remark = c?.Remark?.string ?? null;
    const avatar = c?.BigHeadImgUrl ?? null;
    await db.query(
      `INSERT INTO wpp_contacts (account_id, wxid, nickname, remark, avatar_url, last_synced_at)
       VALUES (?, ?, ?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE nickname=VALUES(nickname), remark=VALUES(remark), avatar_url=VALUES(avatar_url), last_synced_at=NOW()`,
      [ACCOUNT, wxid, nickname, remark, avatar],
    );
    saved++;
  }
  console.log(`[通讯录] 同步 ${saved} 人`);
  return saved;
}

// ===== 2. 群列表 → wpp_chatrooms =====
async function syncChatrooms(): Promise<string[]> {
  const group = makeWppGroup(ctx);
  // 群列表 = 白名单配置 (groupAllowFrom) + getGroupList 并集
  //   原因: vendor getGroupList 只返回部分群 (cache), 白名单群(华为群等) 不在其中
  const root = await findPluginRoot();
  const cfg = JSON.parse(readFileSync(join(root, "accounts", "default.json"), "utf8"));
  const whitelist = cfg.groupAllowFrom ?? [];
  const r = await group.groupList();
  const apiGroups = r.Data?.GroupList ?? [];
  const groups = [...new Set([...whitelist, ...apiGroups])];
  for (const gid of groups) {
    await db.query(
      `INSERT INTO wpp_chatrooms (account_id, chatroom_id, last_synced_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE last_synced_at=NOW()`,
      [ACCOUNT, gid],
    );
  }
  console.log(`[群列表] 同步 ${groups.length} 个群 (白名单 ${whitelist.length} + API ${apiGroups.length})`);
  return groups;
}

// ===== 3. 群成员 → wpp_chatroom_members =====
async function syncMembers(groups: string[]): Promise<number> {
  const group = makeWppGroup(ctx);
  let total = 0;
  for (const gid of groups) {
    const r = await group.getMemberDetail(gid);
    const members = r.Data?.NewChatroomData?.ChatRoomMember ?? [];
    await db.query(`DELETE FROM wpp_chatroom_members WHERE account_id=? AND chatroom_id=?`, [ACCOUNT, gid]);
    for (const m of members) {
      const wxid = m.UserName ?? "";
      if (!wxid) continue;
      await db.query(
        `INSERT INTO wpp_chatroom_members (account_id, chatroom_id, wxid, nickname, avatar_url, last_synced_at)
         VALUES (?, ?, ?, ?, ?, NOW())
         ON DUPLICATE KEY UPDATE nickname=VALUES(nickname), avatar_url=VALUES(avatar_url), last_synced_at=NOW()`,
        [ACCOUNT, gid, wxid, m.NickName ?? null, m.BigHeadImgUrl ?? null],
      );
      total++;
    }
    console.log(`  [群成员] ${gid}: ${members.length} 人`);
  }
  console.log(`[群成员] 共同步 ${total} 条`);
  return total;
}

// ===== main =====
console.log("开始同步 (通讯录/群/群成员)...");
await ensureTables();
const c = await syncContacts();
const groups = await syncChatrooms();
const m = await syncMembers(groups);
await db.end();
console.log(`\n✅ 同步完成: 通讯录 ${c} / 群 ${groups.length} / 群成员 ${m}`);
