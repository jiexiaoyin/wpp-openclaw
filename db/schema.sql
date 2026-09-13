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

-- 心流反馈闭环表 (v1.6.x 2026-09-07 新增: 心流「应触发发送」决策 + 发送结果 + 接话观察窗)
-- 数据源: heartflow-learn.ts recordHfJudged / dispatcher persistHfSendOutcome / sweep 关窗
-- 用途: per-群自适应调阈的样本库 + 审计回看. 生产建表唯一途径 = applyMigrations (deploy 不拷 db/)
-- 时间全用 epoch 秒 (INT UNSIGNED), 对齐 wpp_messages.create_time 语义
CREATE TABLE IF NOT EXISTS wpp_hf_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id VARCHAR(64) NOT NULL,
  inbound_msg_id VARCHAR(128) NOT NULL,        -- msg.msgId (parser 保证非空; 跨通道稳定)
  new_msg_id VARCHAR(128) NULL,                -- 审计用 (可为 '')
  group_id VARCHAR(128) NOT NULL,              -- chatId (xxx@chatroom)
  from_wxid VARCHAR(128) NULL,
  msg_type VARCHAR(32) NULL,
  content_head VARCHAR(512) NULL,              -- content 归一化后前 256 字符
  judge_overall DECIMAL(6,4) NULL,             -- 0..1
  dim_r DECIMAL(5,2) NULL,                     -- 0..10 (relevance)
  dim_w DECIMAL(5,2) NULL,                     -- willingness
  dim_s DECIMAL(5,2) NULL,                     -- social
  dim_t DECIMAL(5,2) NULL,                     -- timing
  dim_c DECIMAL(5,2) NULL,                     -- continuity
  effective_threshold DECIMAL(6,4) NULL,       -- judge 时实际阈值 (learned ?? 账号级)
  energy DECIMAL(5,3) NULL,                    -- judge 前精力
  status ENUM('judged','sent','suppressed','closed') NOT NULL DEFAULT 'judged',
  suppressed_reason VARCHAR(96) NULL,          -- dedup/ack-template/empty/no-deliver-outcome/send-failed
  engaged TINYINT(1) NULL,                     -- NULL=suppressed 排除样本外; 1=engaged; 0=ignored
  judged_at INT UNSIGNED NOT NULL,
  sent_at INT UNSIGNED NULL,
  window_expires_at INT UNSIGNED NULL,         -- = sent_at + observeWindowSec
  closed_at INT UNSIGNED NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uk_hf_acct_msg (account_id, inbound_msg_id),
  KEY idx_hf_group_status (account_id, group_id, status),
  KEY idx_hf_open (account_id, status, window_expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 心流每群自适应状态 (v1.6.x): 1 行/群, learned 阈值落这里 (高频写 DB, 不回写 accounts JSON 防 fs.watch 抖动)
CREATE TABLE IF NOT EXISTS wpp_hf_group_state (
  account_id VARCHAR(64) NOT NULL,
  group_id VARCHAR(128) NOT NULL,
  learned_threshold DECIMAL(6,4) NULL,         -- NULL=回落账号级 replyThreshold
  last_change_at INT UNSIGNED NULL,
  last_change_old DECIMAL(6,4) NULL,
  last_change_new DECIMAL(6,4) NULL,
  last_change_reason VARCHAR(128) NULL,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (account_id, group_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 心流阈值变更审计 (v1.6.x): 每次变更插一行 (满足「变更留痕」护栏)
CREATE TABLE IF NOT EXISTS wpp_hf_threshold_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  account_id VARCHAR(64) NOT NULL,
  group_id VARCHAR(128) NOT NULL,
  old_threshold DECIMAL(6,4) NULL,
  new_threshold DECIMAL(6,4) NOT NULL,
  sample_total INT UNSIGNED NOT NULL,          -- 触发本次变更的样本基数
  sample_engaged INT UNSIGNED NOT NULL,
  reason VARCHAR(255) NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hf_audit (account_id, group_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
