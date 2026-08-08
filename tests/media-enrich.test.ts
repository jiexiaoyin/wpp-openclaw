// tests/media-enrich.test.ts - v1.1.20 IMAGE-ENRICH (2026-08-08 接总立)
// 图片消息自动下载 + OSS 上传 + URL 注入 content

import { test } from "node:test";
import assert from "node:assert/strict";
import { parseImageXml } from "../src/inbound/media-enrich.js";

const SAMPLE_XML =
  '<?xml version="1.0"?>\n<msg>\n\t<img aeskey="1713e69f077cf9728f6fe7ce039270a1" encryver="1" cdnthumbaeskey="1713e69f077cf9728f6fe7ce039270a1" cdnthumburl="305f020100044b30490201000204" cdnthumblength="7433" cdnthumbheight="210" cdnthumbwidth="96" cdnmidheight="0" cdnmidwidth="0" cdnhdheight="0" cdnhdwidth="0" cdnmidimgurl="305f020100044b30490201000204" length="91815" cdnbigimgurl="305f020100044b30490201000204BIG" hdlength="683372" md5="2783ce0c05032baa57763e6c28106ae2" hevc_mid_size="91815" originsourcemd5="2783ce0c05032baa57763e6c28106ae2"/>\n</msg>';

test("parseImageXml — 提取 aesKey + 优先 cdnbigimgurl", () => {
  const r = parseImageXml(SAMPLE_XML);
  assert.ok(r, "should parse");
  assert.equal(r!.aesKey, "1713e69f077cf9728f6fe7ce039270a1");
  // cdnbigimgurl 优先 (高清)
  assert.equal(r!.fileNo, "305f020100044b30490201000204BIG");
  assert.equal(r!.md5, "2783ce0c05032baa57763e6c28106ae2");
});

test("parseImageXml — 无 aeskey 返回 null", () => {
  const r = parseImageXml('<msg><img cdnthumburl="abc"/></msg>');
  assert.equal(r, null);
});

test("parseImageXml — 无 fileNo 返回 null", () => {
  const r = parseImageXml('<msg><img aeskey="abc"/></msg>');
  assert.equal(r, null);
});
