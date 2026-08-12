// scripts/migrate-gewe-messages.ts - gewe 聊天记录全量迁移到 WPP
// 用法: npx tsx scripts/migrate-gewe-messages.ts
// 需 env: GEWE_MULTI_DB_PASSWORD (gewe 库) + WECHATPRO_DB_PASSWORD (wpp 库)
// 逻辑: gewe-multi.messages → wechatpro.wpp_messages
//   - msg_type 字符串→数字 (gewe TEXT→1 等)
//   - direction 推断: sender_wxid=机器人(wxid_eezdbu1ytws422)→outbound, 否则 inbound
//   - peer_kind: chat_id LIKE %@chatroom→group, 否则 direct
//   - ts: timestamp(秒) → TIMESTAMP

import mysql from "mysql2/promise";

const BOT_WXID = "wxid_eezdbu1ytws422"; // 益融小助理 (机器人)
const ACCOUNT = "default";

// gewe msg_type → WPP 数字 (WPP MsgType 常量)
const TYPE_MAP: Record<string, string> = {
  TEXT: "1",
  IMAGE: "3",
  VOICE: "34",
  VIDEO: "43",
  EMOJI: "47",
  LOCATION: "48",
  APP_MSG: "49",
  CARD: "42",
  REVOKE_MSG: "10002",
  QUOTE: "quote",
  // 无 WPP 对应 → 保留原字符串 (wpp-history 可查)
  TRANSFER: "transfer",
  FILE: "file",
  LINK: "link",
  FINDER_FEED: "finder_feed",
  FRIEND_CONFIRM: "friend_confirm",
  GROUP_INVITE: "group_invite",
  GROUP_NAME_CHANGE: "group_name_change",
  MOD_CONTACTS: "mod_contacts",
  PAT_MSG: "pat_msg",
  RED_PACKET: "red_packet",
};

if (!process.env.GEWE_MULTI_DB_PASSWORD || !process.env.WECHATPRO_DB_PASSWORD) {
  console.error("缺 env: 需 GEWE_MULTI_DB_PASSWORD + WECHATPRO_DB_PASSWORD");
  process.exit(1);
}

const geweDb = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3306,
  user: "gewe-multi",
  password: process.env.GEWE_MULTI_DB_PASSWORD,
  database: "gewe-multi",
});

const wppDb = await mysql.createConnection({
  host: "127.0.0.1",
  port: 3306,
  user: "wechatpro",
  password: process.env.WECHATPRO_DB_PASSWORD,
  database: "wechatpro",
});

// 读 gewe 全部消息
const [rows] = await geweDb.query("SELECT * FROM messages ORDER BY timestamp ASC");
const msgs = rows as Array<Record<string, unknown>>;
console.log(`gewe 读取 ${msgs.length} 条`);

// 批量插入 wpp
let inserted = 0, skipped = 0;
for (const m of msgs) {
  const msgType = String(m.msg_type ?? "");
  const wppType = TYPE_MAP[msgType] ?? msgType.toLowerCase();
  const sender = String(m.sender_wxid ?? "");
  const isGroup = String(m.chat_id ?? "").endsWith("@chatroom");
  const isBot = sender === BOT_WXID;

  // direction: 机器人发的=outbound, 否则 inbound (gewe 无 direction 字段, 靠 sender 推断)
  const direction = isBot ? "outbound" : "inbound";
  const peerKind = isGroup ? "group" : "direct";
  const peerId = String(m.chat_id ?? "");
  const tsSec = Number(m.timestamp ?? 0);

  // 跳过去重 (同 msg_id 已存在)
  const [exist] = await wppDb.query(
    "SELECT 1 FROM wpp_messages WHERE msg_id=? AND account_id=? LIMIT 1",
    [String(m.msg_id ?? ""), ACCOUNT],
  );
  if ((exist as unknown[]).length > 0) { skipped++; continue; }

  await wppDb.query(
    `INSERT INTO wpp_messages
      (account_id, msg_id, new_msg_id, direction, peer_kind, peer_id, chat_id, msg_type, content, from_wxid, create_time, ts)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FROM_UNIXTIME(?), FROM_UNIXTIME(?))`,
    [
      ACCOUNT,
      m.msg_id ? String(m.msg_id) : null,
      m.new_msg_id ? String(m.new_msg_id) : null,
      direction,
      peerKind,
      peerId,
      isGroup ? peerId : null,
      wppType,
      m.content ? String(m.content) : null,
      sender || null,
      tsSec || null,
      tsSec || null,
    ],
  );
  inserted++;
}

await geweDb.end();
await wppDb.end();
console.log(`\n✅ 迁移完成: 插入 ${inserted}, 跳过重复 ${skipped}`);
