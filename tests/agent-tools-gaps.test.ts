// tests/agent-tools-gaps.test.ts - v1.3.20 P1-P3 补齐 agent-tools
// 验证新增工具: Group (facingCreate/getGroupListCompat/scanIntoGroupEnterprise)
//                FriendCircle (mmSnsSync/circleUpload)
//                TenPay (openwxhb/receivewxhb/qrydetailwxhb/getEncryptInfo)
// 用 MockAgent mock vendor HTTP, 捕获请求体验证正确端点 + 参数。

import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { MockAgent, setGlobalDispatcher, getGlobalDispatcher } from "undici";

import { getDefaultAccountRegistry } from "../src/account-state.js";
import { AccountContext } from "../src/accounts/account-context.js";
import { AGENT_TOOLS_META } from "../src/dispatch/agent-tools/index.js";
import { buildAgentTools } from "../src/dispatch/agent-tools/factory.js";
import type { WppAccountConfig } from "../src/types.js";

const MOCK_ORIGIN = "https://mock-gaps.test";

// mock registry (工具 lazy ctx 从 registry 拿真实凭证)
function mockAccount(): void {
  const reg = getDefaultAccountRegistry() as unknown as { contexts: Map<string, AccountContext> };
  const cfg: WppAccountConfig = {
    enabled: true, tokenKey: "tk", apiBaseUrl: MOCK_ORIGIN, wsUrl: "wss://mock-gaps.test/ws",
    authcode: "ac", webhookHost: "127.0.0.1", webhookPort: 0, webhookPath: "/w",
    webhookSecret: "", allowFrom: [], groupPolicy: "open", groupAllowFrom: [],
    selfWxid: "wxid_bot", nickname: "test", requireAtMention: true, debounceMs: 1500,
    agent: "wpp-wechat",
  };
  reg.contexts.set("default", new AccountContext({ accountId: "default", config: cfg }));
}

let mockAgent: MockAgent;
let realDispatcher: ReturnType<typeof getGlobalDispatcher>;
const requests: Array<{ path: string; body: string }> = [];

before(() => {
  realDispatcher = getGlobalDispatcher();
  mockAgent = new MockAgent();
  mockAgent.disableNetConnect();
  setGlobalDispatcher(mockAgent);
  mockAccount();
});

after(() => {
  setGlobalDispatcher(realDispatcher);
  const reg = getDefaultAccountRegistry() as unknown as { contexts: Map<string, unknown> };
  reg.contexts.clear();
});

beforeEach(() => {
  requests.length = 0;
  // 默认所有 POST/GET 返回 Code:0 (捕获请求体)
  mockAgent
    .get(MOCK_ORIGIN)
    .intercept({ method: "POST", path: (p: string) => p.startsWith("/api/") })
    .reply(200, (ctx) => {
      requests.push({ path: ctx.path, body: ctx.body as string });
      return JSON.stringify({ Code: 0, Data: { ret: 0 } });
    })
    .persist();
  mockAgent
    .get(MOCK_ORIGIN)
    .intercept({ method: "GET", path: (p: string) => p.startsWith("/api/") })
    .reply(200, (ctx) => {
      requests.push({ path: ctx.path, body: "" });
      return JSON.stringify({ Code: 0, Data: { ret: 0 } });
    })
    .persist();
});

// 把 AGENT_TOOLS_META 转成可 execute 的 tools
const TOOLS = buildAgentTools(AGENT_TOOLS_META);
function getTool(name: string) {
  const t = TOOLS.find((x) => x.name === name);
  assert.ok(t, `tool ${name} 应存在`);
  return t!;
}
async function call(name: string, params: Record<string, unknown>): Promise<{ content: Array<{ text: string }> }> {
  return getTool(name).execute("call-1", params) as Promise<{ content: Array<{ text: string }> }>;
}

// ===== P1 Group 群管理 3 个 =====

test("v1.3.20 P1 — facingCreateChatRoom → /Group/FacingCreateChatRoom (latitude/longitude)", async () => {
  await call("facingCreateChatRoom", { latitude: 39.9, longitude: 116.4, password: "1234" });
  const req = requests.find((r) => r.path.includes("/api/Group/FacingCreateChatRoom"));
  assert.ok(req, "应调 FacingCreateChatRoom");
  const body = JSON.parse(req!.body);
  assert.equal(body.Latitude, "39.9");
  assert.equal(body.Longitude, "116.4");
  assert.equal(body.Password, "1234");
  assert.equal(body.OpCode, 1);
});

test("v1.3.20 P1 — getGroupListCompat → /Group/GroupList (GET 兼容路由)", async () => {
  await call("getGroupListCompat", {});
  const req = requests.find((r) => r.path.includes("/api/Group/GroupList"));
  assert.ok(req, "应调 GroupList");
});

test("v1.3.20 P1 — scanIntoGroupEnterprise → /Group/ScanIntoGroupEnterprise (Url)", async () => {
  await call("scanIntoGroupEnterprise", { Url: "https://weixin.qq.com/g/ABC123" });
  const req = requests.find((r) => r.path.includes("/api/Group/ScanIntoGroupEnterprise"));
  assert.ok(req, "应调 ScanIntoGroupEnterprise");
  const body = JSON.parse(req!.body);
  assert.equal(body.Url, "https://weixin.qq.com/g/ABC123");
});

// ===== P2 FriendCircle 2 + TenPay 4 =====

test("v1.3.20 P2 — syncFriendCircleSns → /FriendCircle/MmSnsSync", async () => {
  await call("syncFriendCircleSns", {});
  const req = requests.find((r) => r.path.includes("/api/FriendCircle/MmSnsSync"));
  assert.ok(req, "应调 MmSnsSync");
});

test("v1.3.23 FIX — uploadCircleMedia → /FriendCircle/Upload (key+base64, 上传语义)", async () => {
  await call("uploadCircleMedia", { key: "media-key-1", base64: "aGVsbG8=" });
  const req = requests.find((r) => r.path.includes("/api/FriendCircle/Upload"));
  assert.ok(req, "应调 FriendCircle/Upload");
  const body = JSON.parse(req!.body);
  assert.equal(body.key, "media-key-1");
  assert.equal(body.base64, "aGVsbG8=");
});

test("v1.3.24 — downloadCircleVideo → /FriendCircle/DownloadVideo (key+url, 下载视频)", async () => {
  await call("downloadCircleVideo", { key: "2a0da6d4d1489d67f45af91fc5b97da1", url: "http://shzjwxsns.video.qq.com/102/20202/snsvideodownload?filekey=abc" });
  const req = requests.find((r) => r.path.includes("/api/FriendCircle/DownloadVideo"));
  assert.ok(req, "应调 FriendCircle/DownloadVideo");
  const body = JSON.parse(req!.body);
  assert.equal(body.key, "2a0da6d4d1489d67f45af91fc5b97da1");
  assert.equal(body.url, "http://shzjwxsns.video.qq.com/102/20202/snsvideodownload?filekey=abc");
});

test("v1.3.20 P2 — openRedPacket → /TenPay/Openwxhb (redPacketId)", async () => {
  await call("openRedPacket", { redPacketId: "hb-123" });
  const req = requests.find((r) => r.path.includes("/api/TenPay/Openwxhb"));
  assert.ok(req, "应调 Openwxhb");
  const body = JSON.parse(req!.body);
  assert.equal(body.redPacketId, "hb-123");
});

test("v1.3.20 P2 — queryRedPacketDetail → /TenPay/Qrydetailwxhb", async () => {
  await call("queryRedPacketDetail", { redPacketId: "hb-123" });
  const req = requests.find((r) => r.path.includes("/api/TenPay/Qrydetailwxhb"));
  assert.ok(req, "应调 Qrydetailwxhb");
});

test("v1.3.20 P2 — receiveRedPacket → /TenPay/Receivewxhb", async () => {
  await call("receiveRedPacket", { redPacketId: "hb-123" });
  const req = requests.find((r) => r.path.includes("/api/TenPay/Receivewxhb"));
  assert.ok(req, "应调 Receivewxhb");
});

test("v1.3.20 P2 — getEncryptInfo → /TenPay/GetEncryptInfo (info)", async () => {
  await call("getEncryptInfo", { info: "encrypted-string" });
  const req = requests.find((r) => r.path.includes("/api/TenPay/GetEncryptInfo"));
  assert.ok(req, "应调 GetEncryptInfo");
  const body = JSON.parse(req!.body);
  assert.equal(body.info, "encrypted-string");
});

// ===== P3 OfficialAccounts 6 + Finder 6 =====

test("v1.3.20 P3 — likeOfficialAccountArticle → /OfficialAccounts/GetAppMsgExtLike (url)", async () => {
  await call("likeOfficialAccountArticle", { url: "https://mp.weixin.qq.com/s/ABC" });
  const req = requests.find((r) => r.path.includes("/api/OfficialAccounts/GetAppMsgExtLike"));
  assert.ok(req, "应调 GetAppMsgExtLike");
  assert.equal(JSON.parse(req!.body).url, "https://mp.weixin.qq.com/s/ABC");
});

test("v1.3.20 P3 — preVerifyOfficialAccountJsapi → /OfficialAccounts/JSAPIPreVerify (appId)", async () => {
  await call("preVerifyOfficialAccountJsapi", { appId: "wx123" });
  const req = requests.find((r) => r.path.includes("/api/OfficialAccounts/JSAPIPreVerify"));
  assert.ok(req, "应调 JSAPIPreVerify");
  assert.equal(JSON.parse(req!.body).appId, "wx123");
});

test("v1.3.20 P3 — getOfficialAccountA8Key → /OfficialAccounts/MpGetA8Key", async () => {
  await call("getOfficialAccountA8Key", { url: "https://mp.weixin.qq.com/s/ABC" });
  const req = requests.find((r) => r.path.includes("/api/OfficialAccounts/MpGetA8Key"));
  assert.ok(req, "应调 MpGetA8Key");
});

test("v1.3.20 P3 — authorizeOfficialAccount → /OfficialAccounts/OauthAuthorize", async () => {
  await call("authorizeOfficialAccount", { url: "https://open.weixin.qq.com/connect/oauth2/authorize" });
  const req = requests.find((r) => r.path.includes("/api/OfficialAccounts/OauthAuthorize"));
  assert.ok(req, "应调 OauthAuthorize");
});

test("v1.3.20 P3 — requestOfficialAccountQrAuthorize → /OfficialAccounts/QRConnectAuthorize", async () => {
  await call("requestOfficialAccountQrAuthorize", { url: "https://open.weixin.qq.com/qr/connect" });
  const req = requests.find((r) => r.path.includes("/api/OfficialAccounts/QRConnectAuthorize"));
  assert.ok(req, "应调 QRConnectAuthorize");
});

test("v1.3.20 P3 — confirmOfficialAccountQrAuthorize → /OfficialAccounts/QRConnectAuthorizeConfirm", async () => {
  await call("confirmOfficialAccountQrAuthorize", { url: "https://open.weixin.qq.com/qr/confirm" });
  const req = requests.find((r) => r.path.includes("/api/OfficialAccounts/QRConnectAuthorizeConfirm"));
  assert.ok(req, "应调 QRConnectAuthorizeConfirm");
});

test("v1.3.20 P3 — decryptFinderComment → /Finder/Decrypt (Content)", async () => {
  await call("decryptFinderComment", { encryptedContent: "enc" });
  const req = requests.find((r) => r.path.includes("/api/Finder/Decrypt"));
  assert.ok(req, "应调 Decrypt");
  assert.equal(JSON.parse(req!.body).Content, "enc");
});

test("v1.3.20 P3 — getFinderMsgSessionId → /Finder/FinderGetMsgSessionId", async () => {
  await call("getFinderMsgSessionId", { toFinderId: "v2_abc" });
  const req = requests.find((r) => r.path.includes("/api/Finder/FinderGetMsgSessionId"));
  assert.ok(req, "应调 FinderGetMsgSessionId");
});

test("v1.3.20 P3 — searchFinderList → /Finder/FinderSearchList", async () => {
  await call("searchFinderList", {});
  const req = requests.find((r) => r.path.includes("/api/Finder/FinderSearchList"));
  assert.ok(req, "应调 FinderSearchList");
});

test("v1.3.20 P3 — getFinderTopicList → /Finder/Findergettopiclist", async () => {
  await call("getFinderTopicList", { topTitle: "热门" });
  const req = requests.find((r) => r.path.includes("/api/Finder/Findergettopiclist"));
  assert.ok(req, "应调 Findergettopiclist");
});

test("v1.3.20 P3 — getFinderCommentList → /Finder/GetCommentList (Id + RootCommentId)", async () => {
  await call("getFinderCommentList", { objectId: "finder-1", rootCommentId: "root-1" });
  const req = requests.find((r) => r.path.includes("/api/Finder/GetCommentList"));
  assert.ok(req, "应调 GetCommentList");
  const body = JSON.parse(req!.body);
  assert.equal(body.Id, "finder-1");
  assert.equal(body.RootCommentId, "root-1");
});

test("v1.3.20 P3 — getFinderCommentDetail → /Finder/GetCommentDetail (FinderUsername+Id)", async () => {
  await call("getFinderCommentDetail", { finderUsername: "v2_user", objectId: "finder-1" });
  const req = requests.find((r) => r.path.includes("/api/Finder/GetCommentDetail"));
  assert.ok(req, "应调 GetCommentDetail");
  const body = JSON.parse(req!.body);
  assert.equal(body.FinderUsername, "v2_user");
  assert.equal(body.Id, "finder-1");
});
