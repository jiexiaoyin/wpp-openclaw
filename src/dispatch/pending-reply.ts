// src/dispatch/pending-reply.ts - AI 发出消息 newMsgId 跟踪 (用于 revoke)
// 仿 本项目/src/dispatch/pending-reply.ts

const REPLY_TTL_MS = 5 * 60 * 1000;
const store = new Map<string, { newMsgId: string; msgId?: string; ts: number }>();

function key(accountId: string, sessionKey: string): string {
  return `${accountId}|${sessionKey}`;
}

export function rememberReply(opts: {
  accountId: string;
  sessionKey: string;
  newMsgId?: string;
  msgId?: string;
}): void {
  if (!opts.newMsgId && !opts.msgId) return;
  store.set(key(opts.accountId, opts.sessionKey), {
    newMsgId: opts.newMsgId ?? "",
    msgId: opts.msgId,
    ts: Date.now(),
  });
}

export function lookupReply(
  accountId: string,
  sessionKey: string,
): { newMsgId: string; msgId?: string } | null {
  const k = key(accountId, sessionKey);
  const v = store.get(k);
  if (!v) return null;
  if (Date.now() - v.ts > REPLY_TTL_MS) {
    store.delete(k);
    return null;
  }
  return v;
}

/** 测试/debug 用 */
export function _reset(): void {
  store.clear();
}
