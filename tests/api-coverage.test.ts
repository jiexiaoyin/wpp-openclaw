// tests/api-coverage.test.ts - v1.1.37 P2-2 vendor endpoint 正确性测试
// 2026-08-09 00:28 接总立 v1.1.36 全维度深审发现 P0-1 (OperateChatRoomInfo/TransferGroupOwner ghost endpoint) 
//   根因: 没有任何自动化测试验证 WPP_VENDOR_ENDPOINTS 列表里的 endpoint 都真实存在于 vendor swagger
//   修复: 加本测试, 每次 CI 跑 (npm test) 把 WPP_VENDOR_ENDPOINTS 跟 /tmp/juhe-openapi.json 236 paths 对账
//         任意 ghost endpoint (在 WPP_VENDOR_ENDPOINTS 但不在 vendor paths) 立即 fail, 防止 P0-1 重现

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, writeFileSync } from "node:fs";
import { WPP_VENDOR_ENDPOINTS } from "../src/send/index.js";

// v1.3.53 SWAGGER-AUTO-FETCH (2026-08-12 P2-1): /tmp 缓存重启即丢 → 文件缺失时自动从 vendor 拉取
//   拉不到 (vendor 未启动) 才 t.skip (环境性跳过, 不再硬 fail)
// v1.3.25 SWAGGER-254: 指向最新 swagger (254 paths, vendor 新增 18 接口)
// v1.3.67 (2026-08-20): 新 vendor 容器 → 18062; 旧容器已退役 (8062 已停)
const SWAGGER_PATH = "/tmp/swagger-latest.json";
const VENDOR_SWAGGER_URL = "http://127.0.0.1:18062/swagger.json";

interface SwaggerDoc {
  paths: Record<string, unknown>;
}

/**
 * 加载 vendor swagger paths; 文件缺失 → 自动 fetch vendor 落盘; 仍不可用 → t.skip 返回 null。
 * @param t node:test TestContext (用于 t.skip)
 */
async function loadVendorPaths(t: { skip: (msg: string) => void }): Promise<Set<string> | null> {
  let raw: string | null = null;
  try {
    raw = readFileSync(SWAGGER_PATH, "utf8");
  } catch {
    // 缓存缺失 → 尝试从 vendor 拉取 (本地 vendor swagger, 内网只读)
    try {
      const resp = await fetch(VENDOR_SWAGGER_URL, { signal: AbortSignal.timeout(5_000) });
      if (resp.ok) {
        raw = await resp.text();
        try { writeFileSync(SWAGGER_PATH, raw); } catch { /* 写缓存失败不影响测试 */ }
      }
    } catch {
      /* vendor 不可达 */
    }
  }
  if (!raw) {
    t.skip(`vendor swagger 不可用: 无 ${SWAGGER_PATH} 且 ${VENDOR_SWAGGER_URL} 不可达 (环境性跳过)`);
    return null;
  }
  const doc = JSON.parse(raw) as SwaggerDoc;
  return new Set(Object.keys(doc.paths));
}

function flattenWppEndpoints(record: Record<string, string[]>): string[] {
  const set = new Set<string>();
  for (const tag of Object.keys(record)) {
    for (const ep of record[tag]) {
      set.add(ep);
    }
  }
  return [...set];
}

test("api-coverage — WPP_VENDOR_ENDPOINTS 至少 200 个 tag-grouped endpoint", () => {
  const total = Object.values(WPP_VENDOR_ENDPOINTS).reduce(
    (sum, arr) => sum + arr.length,
    0,
  );
  assert.ok(
    total >= 200,
    `WPP_VENDOR_ENDPOINTS 总数应 >= 200 (实际 ${total}, 防 ghost 复发基线)`,
  );
});

test("api-coverage — WPP_VENDOR_ENDPOINTS 与 vendor swagger 对账 (P0-1 防回归)", async (t) => {
  const vendorPaths = await loadVendorPaths(t);
  if (!vendorPaths) return;
  const wppUnique = flattenWppEndpoints(WPP_VENDOR_ENDPOINTS);
  // v1.3.67 (2026-08-20): 新 vendor 已移除但后端实测仍兼容 200 的隐藏端点 (白名单豁免, 勿删)
  const LEGACY_COMPAT_ENDPOINTS = new Set(["/Search/Service/{name}", "/Search/Services"]);
  const ghosts: string[] = [];
  for (const ep of wppUnique) {
    if (!vendorPaths.has(ep) && !LEGACY_COMPAT_ENDPOINTS.has(ep)) {
      ghosts.push(ep);
    }
  }
  assert.deepEqual(
    ghosts,
    [],
    `WPP_VENDOR_ENDPOINTS 包含 ${ghosts.length} 个 vendor swagger 不存在的 endpoint (P0-1 ghost):\n${ghosts.join("\n")}\n` +
      `这些 endpoint 在 plugin 注册的 agent tools 会调用, 但 vendor API 404, 必须删除或修正端点名`,
  );
});

test("api-coverage — 每个 tag 分组至少 1 个 endpoint", () => {
  for (const [tag, eps] of Object.entries(WPP_VENDOR_ENDPOINTS)) {
    assert.ok(
      eps.length >= 1,
      `tag "${tag}" 至少 1 个 endpoint (实际 ${eps.length})`,
    );
  }
});

test("api-coverage — vendor swagger 313 paths (v1.3.67 新 vendor, 防 contract 静默变更)", async (t) => {
  const vendorPaths = await loadVendorPaths(t);
  if (!vendorPaths) return;
  assert.equal(
    vendorPaths.size,
    313,
    `vendor swagger 期望 313 paths (实际 ${vendorPaths.size}, 变化需审计确认)`,
  );
});

test("api-coverage — 已知主动忽略的 path 全部在 vendor (sanity check)", async (t) => {
  // 这些 path 之前在 dev 阶段被明确排除 (Login × 40 + 一些非业务必需), 不在 WPP_VENDOR_ENDPOINTS
  // 但仍应存在于 vendor swagger (排除标准是"不需要", 不是"不存在")
  const vendorPaths = await loadVendorPaths(t);
  if (!vendorPaths) return;
  const expectedIgnored = [
    "/Admin/DelayAuthKey",
    "/Admin/DeleteAuthKey",
    "/Admin/GenAuthKey",
  ];
  for (const ep of expectedIgnored) {
    assert.ok(
      vendorPaths.has(ep),
      `${ep} 应在 vendor swagger 里 (被主动忽略, 但不应缺失)`,
    );
  }
});
