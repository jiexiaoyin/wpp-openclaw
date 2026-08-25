-- WeChatPadPro OpenClaw Plugin - MariaDB Schema v0.1.0 (2026-08-04 init)
-- 复用 1Panel-mariadb-RlbK 数据库 wechatpro
-- 所有表前缀 wpp_ 避免与其他 plugin 冲突

-- 账号元数据 (单账号 demo 阶段 1 行, 多账号阶段每账号 1 行)
CREATE TABLE IF NOT EXISTS wpp_accounts (
  id INT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL UNIQUE,
  display_name VARCHAR(128),
  self_wxid VARCHAR(128),
  nickname VARCHAR(128),
  enabled TINYINT(1) DEFAULT 1,
  config_json JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_self_wxid (self_wxid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 消息持久化 (inbound + outbound 全量存档)
CREATE TABLE IF NOT EXISTS wpp_messages (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  msg_id VARCHAR(128),                  -- wechatpadpro msg id (uuid)
  new_msg_id VARCHAR(128),              -- wechatpadpro new_msg_id
  direction ENUM('inbound', 'outbound') NOT NULL,
  peer_kind ENUM('direct', 'group', 'room') NOT NULL,
  peer_id VARCHAR(128) NOT NULL,        -- sender (inbound) / target (outbound)
  peer_name VARCHAR(256),
  chat_id VARCHAR(128),                 -- 群 ID (peer_kind=group)
  msg_type VARCHAR(32),                 -- text / image / video / voice / ...
  content LONGTEXT,                     -- 文本或 JSON
  raw_payload JSON,                     -- 原始 vendor payload (审计 + 回放)
  from_wxid VARCHAR(128),               -- v1.2.4: inbound 发送者 wxid (群聊按人查历史; 旧行从 raw_payload.sender_id 回填)
  create_time BIGINT NULL,              -- v1.1.27 撤回用: 消息实际时间戳 (秒), 入库时同步 ts→Math.floor(ts/1000)
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_account_ts (account_id, ts),
  INDEX idx_peer (peer_kind, peer_id),
  INDEX idx_sender (peer_kind, peer_id, from_wxid),  -- v1.2.4: 按人查群聊历史 (触发人最近消息)
  INDEX idx_msg_id (msg_id),
  INDEX idx_new_msg_id (new_msg_id),
  -- v1.1.17 FULL-FIX (P0-G): UNIQUE 去重约束 (三通道重复入库防护)
  UNIQUE KEY uk_account_msg (account_id, msg_id, new_msg_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 联系人 (轻量, 仅缓存常用字段)
CREATE TABLE IF NOT EXISTS wpp_contacts (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  wxid VARCHAR(128) NOT NULL,
  nickname VARCHAR(256),
  remark VARCHAR(256),
  avatar_url VARCHAR(512),
  gender TINYINT,
  signature VARCHAR(512),
  last_synced_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_account_wxid (account_id, wxid),
  INDEX idx_nickname (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 群 (轻量缓存)
CREATE TABLE IF NOT EXISTS wpp_chatrooms (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  chatroom_id VARCHAR(128) NOT NULL,
  nickname VARCHAR(256),
  remark VARCHAR(256),
  owner_wxid VARCHAR(128),
  member_count INT,
  last_synced_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_account_chatroom (account_id, chatroom_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 会话状态 (用于 inbound 防抖 / 触发器状态)
CREATE TABLE IF NOT EXISTS wpp_session_state (
  account_id VARCHAR(64) NOT NULL,
  peer_kind ENUM('direct', 'group', 'room') NOT NULL,
  peer_id VARCHAR(128) NOT NULL,
  last_msg_id VARCHAR(128),
  last_msg_ts TIMESTAMP NULL,
  pending_count INT DEFAULT 0,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, peer_kind, peer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- API 调用审计 (vendor 鉴权 + 限流排查用)
CREATE TABLE IF NOT EXISTS wpp_api_calls (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  endpoint VARCHAR(255) NOT NULL,
  method VARCHAR(8) DEFAULT 'POST',
  status_code INT,
  vendor_code INT,                     -- vendor 业务 Code 字段 (-1/-2/-8/0)
  latency_ms INT,
  request_body JSON,
  response_body JSON,
  ts TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_account_ts (account_id, ts),
  INDEX idx_endpoint (endpoint)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 群成员表 (v1.3.34 2026-08-11 新增: 三表同步 — 脱敏判断/群活跃分析用)
-- 数据源: /Group/GetChatRoomMemberDetail 返回的 NewChatroomData.ChatRoomMember[]
-- 用途: isInternalGroup 判断 (成员身份) + 群成员快速查询
CREATE TABLE IF NOT EXISTS wpp_chatroom_members (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  chatroom_id VARCHAR(128) NOT NULL,   -- 群 ID (@chatroom 结尾)
  wxid VARCHAR(128) NOT NULL,          -- 成员 wxid
  nickname VARCHAR(256),               -- 成员昵称
  avatar_url VARCHAR(512),             -- 头像
  is_owner TINYINT DEFAULT 0,          -- 是否群主
  last_synced_at TIMESTAMP NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_room_wxid (account_id, chatroom_id, wxid),
  INDEX idx_wxid (wxid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 群黑话表 (v1.3.76 2026-08-22 新增: 自主学习黑话挖掘)
-- 数据源: jargon.ts 统计预筛 + LLM 挖掘
-- 用途: AI 查询群黑话含义 (query_jargon tool), 理解群文化
CREATE TABLE IF NOT EXISTS wpp_jargon_terms (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  account_id VARCHAR(64) NOT NULL,
  group_id VARCHAR(128) NOT NULL,      -- 群 ID (@chatroom 结尾)
  term VARCHAR(64) NOT NULL,           -- 黑话词条
  raw_content VARCHAR(512),            -- 出现该词条的上下文样例
  meaning VARCHAR(512),                -- LLM 推断含义
  is_jargon TINYINT DEFAULT 1,         -- 是否确认黑话
  frequency INT DEFAULT 1,             -- 词频
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uk_group_term (account_id, group_id, term),
  INDEX idx_group (account_id, group_id),
  INDEX idx_term (term)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
