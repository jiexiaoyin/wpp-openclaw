// scripts/fc-publish-xml.mjs - 用自构造 XML 发图片朋友圈 (参考真实 TimelineObject 结构)
import { loadAccountConfig } from "/root/dev/wechatpadpro-openclaw/src/config.js";
import { createHash } from "node:crypto";

const cfg = await loadAccountConfig("default");
const base = `${cfg.apiBaseUrl.replace(/\/$/, "")}/api`;
async function vendor(ep, body) {
  const res = await fetch(`${base}${ep}?authcode=${cfg.authcode}`, {
    method: "POST", headers: { "Content-Type": "application/json", "X-TokenKey": cfg.tokenKey },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = { Code: -1, CodeValue: "BAD_JSON", Message: text.slice(0, 300) }; }
  return { status: res.status, json };
}

// 1. 上传图片拿 URL
const b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
const buf = Buffer.from(b64, "base64");
const md5 = createHash("md5").update(buf).digest("hex");
const up = await vendor("/FriendCircle/Upload", { key: "xml-img", base64: b64 });
const imgUrl = up.json.Data?.BufferUrl?.Url ?? "";
console.log(`上传图片: Code=${up.json.Code} URL=${imgUrl} md5=${md5}`);
if (!imgUrl) { console.log("❌ 上传失败"); process.exit(1); }

// 2. 构造 TimelineObject XML (参考真实图片朋友圈: contentStyle=1, media type=2, url+thumb+md5)
const xml = `<TimelineObject>
<contentDesc>XML发布测试 ${new Date().toISOString().slice(11, 19)}</contentDesc>
<contentDescShowType>0</contentDescShowType>
<contentStyle>1</contentStyle>
<private>0</private>
<ContentObject>
<contentStyle>1</contentStyle>
<title></title>
<description></description>
<mediaList>
<media>
<type>2</type>
<url md5="${md5}">${imgUrl}</url>
<thumb>${imgUrl.replace(/\/0$/, "/150")}</thumb>
<size width="1" height="1" totalSize="${buf.length}"></size>
</media>
</mediaList>
</ContentObject>
</TimelineObject>`;

console.log(`\n构造 XML:\n${xml}`);

// 3. 尝试 2 种: title 放 XML / thumburl 放 XML
const variants = [
  { name: "title=XML", body: { title: xml, blackList: "", private: 0, totalSize: String(buf.length), withUserList: "" } },
  { name: "thumburl=XML", body: { title: "XML测试", blackList: "", private: 0, totalSize: String(buf.length), withUserList: "", thumburl: xml } },
];
for (const v of variants) {
  console.log(`\n尝试: ${v.name}`);
  const r = await vendor("/FriendCircle/Messages", v.body);
  console.log(`  Code=${r.json.Code} ${r.json.CodeValue ?? ""} Message=${(r.json.Message ?? "").slice(0, 120)}`);
  if (r.json.Code === 0) { console.log("  ✅ 发布成功!"); break; }
  await new Promise((res) => setTimeout(res, 500));
}
