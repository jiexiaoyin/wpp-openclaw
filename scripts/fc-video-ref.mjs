import { loadAccountConfig } from "/root/dev/wechatpadpro-openclaw/src/config.js";
const cfg = await loadAccountConfig("default");
const base = `${cfg.apiBaseUrl.replace(/\/$/, "")}/api`;
const res = await fetch(`${base}/FriendCircle/GetDetail?authcode=${cfg.authcode}`, {
  method: "POST", headers: { "Content-Type": "application/json", "X-TokenKey": cfg.tokenKey },
  body: JSON.stringify({ towxid: cfg.selfWxid ?? "q139198824", fristpagemd5: "", maxid: 0 }),
});
const r = JSON.parse(await res.text());
const list = r.Data?.ObjectList ?? [];
// 找 type=6 (视频) 那条
for (const item of list) {
  const buf = item.ObjectDesc?.buffer ?? "";
  if (buf.includes("<type>6</type>")) {
    console.log(`找到视频朋友圈: CreateTime=${item.CreateTime}`);
    console.log("media 块:");
    const m = buf.match(/<media>([\s\S]*?)<\/media>/);
    if (m) console.log(m[1].slice(0, 800));
    break;
  }
}
