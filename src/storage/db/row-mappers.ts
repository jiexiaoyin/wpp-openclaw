// src/storage/db/row-mappers.ts — DB row → 领域对象 的反序列化
//
// v1.9.2 (2026-09-28) 从 mysql.ts 抽出。为什么独立成文件:
//   - 这 4 个函数是**纯函数**(输入 RowDataPacket, 输出领域对象), 不依赖 pool /
//     连接状态 / 模块级可变状态 —— 与 mysql.ts 里其余 "需要连接才能跑" 的代码不同类。
//   - mysql.ts 原为 1,672 行单体, 其中这一块是**改动频率最低、耦合最松**的部分,
//     优先外提可零风险减负, 并为后续拆分(如在心流方法)建立可复用的模式。
//   - 抽离后可在**无 MySQL 环境**下单测 (见 tests/unit/db-row-mappers.test.mjs)。
//
// 行为契约 (与抽取前逐字一致, 未做任何"顺手优化"):
//   - NULL 列 → null (或按各字段既定默认), 不做类型猜测
//   - raw_payload 若非合法 JSON, 原样保留字符串 (上游可能存的是非 JSON 文本)
//   - ts 为 Date 时转 Unix 秒; 否则按数字直取

import type { RowDataPacket } from "mysql2/promise";
import type {
  AccountRecord,
  HfGroupProfileRecord,
  HfGroupStateRecord,
  MessageRecord,
} from "./types.js";

/** wpp_hf_group_state row → HfGroupStateRecord */
export function rowToHfGroupState(r: RowDataPacket): HfGroupStateRecord {
  return {
    account_id: String(r.account_id),
    group_id: String(r.group_id),
    learned_threshold: r.learned_threshold == null ? null : Number(r.learned_threshold),
    last_change_at: r.last_change_at == null ? null : Number(r.last_change_at),
    last_change_old: r.last_change_old == null ? null : Number(r.last_change_old),
    last_change_new: r.last_change_new == null ? null : Number(r.last_change_new),
    last_change_reason: r.last_change_reason == null ? null : String(r.last_change_reason),
  };
}

export function rowToHfGroupProfile(r: RowDataPacket): HfGroupProfileRecord {
  return {
    account_id: String(r.account_id),
    group_id: String(r.group_id),
    // profile_json 为 NULL 的存量/异常行 → 空串 (上层解析失败即视为无画像, 不注入)
    profile_json: r.profile_json == null ? "" : String(r.profile_json),
    stats_json: r.stats_json == null ? null : String(r.stats_json),
    sample_msgs: Number(r.sample_msgs) || 0,
    model: r.model == null ? null : String(r.model),
    version: Number(r.version) || 1,
    generated_at: r.generated_at == null ? null : Number(r.generated_at),
  };
}

/** wpp_accounts row → AccountRecord (脱敏不在这层做, 上层只存非敏感字段) */
export function rowToAccount(r: RowDataPacket): AccountRecord {
  return {
    account_id: String(r.account_id),
    display_name: r.display_name == null ? null : String(r.display_name),
    self_wxid: r.self_wxid == null ? null : String(r.self_wxid),
    nickname: r.nickname == null ? null : String(r.nickname),
    enabled: r.enabled == null ? false : Number(r.enabled) !== 0,
    config_json: r.config_json == null ? null : String(r.config_json),
  };
}

export function rowToMessage(r: RowDataPacket): MessageRecord {
  const rawStr = r.raw_payload;
  let raw: unknown = rawStr;
  if (typeof rawStr === "string") {
    try {
      raw = JSON.parse(rawStr);
    } catch {
      raw = rawStr;
    }
  }
  return {
    account_id: String(r.account_id),
    msg_id: r.msg_id == null ? null : String(r.msg_id),
    new_msg_id: r.new_msg_id == null ? null : String(r.new_msg_id),
    direction: r.direction as MessageRecord["direction"],
    peer_kind: r.peer_kind as MessageRecord["peer_kind"],
    peer_id: String(r.peer_id),
    peer_name: r.peer_name == null ? null : String(r.peer_name),
    chat_id: r.chat_id == null ? null : String(r.chat_id),
    msg_type: r.msg_type == null ? null : String(r.msg_type),
    content: r.content == null ? null : String(r.content),
    raw_payload: raw,
    from_wxid: r.from_wxid == null ? null : String(r.from_wxid),
    ts: r.ts instanceof Date ? Math.floor(r.ts.getTime() / 1000) : Number(r.ts ?? 0),
  };
}
