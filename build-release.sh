#!/usr/bin/env bash
# build-release.sh — 生成干净发布包 (不含源码/sourcemap/个性化配置)
# 用法: bash build-release.sh
# 产出: dist-release/ (编译产物) + release/ (完整发布包)
# 注意: 不动 dev 的 dist/ (保留 sourcemap 供调试)

set -e
cd "$(dirname "$0")"

echo "=== [1/6] 编译 (tsconfig.release.json: sourcemap off + removeComments + 含 setup 向导) ==="
rm -rf dist-release
npx tsc -p tsconfig.release.json

echo "=== [2/6] 删残留 .map (保险) ==="
find dist-release -name "*.map" -delete
echo "dist-release .map 数: $(find dist-release -name '*.map' | wc -l)"

echo "=== [3/6] 校验无源码路径注释 ==="
# 只查 `// src/` 注释 (tsc removeComments 后不应有), 不查 import "../src/xxx.js" (那是合法相对引用)
# 注意: 不能用 `grep ... | head` 当条件 (head 关管道 → grep SIGPIPE → if 误判)
LEAKED=$(find dist-release -name "*.js" -exec grep -l "// src/" {} \; 2>/dev/null | head -5)
if [ -n "$LEAKED" ]; then
  echo "⚠ dist-release 仍有源码路径注释:"
  echo "$LEAKED"
  exit 1
fi
echo "✅ dist-release 无源码路径注释 (setup.js 的 import ../src/ 是合法相对引用)"

echo "=== [4/6] 发布清洗 (去掉硬编码个性化值, 接收方可配置) ==="
# intent-llm.js: system prompt AI 角色名 "接晓银" → 通用 "助手"
sed -i 's/接晓银/助手/g' dist-release/src/dispatch/intent-llm.js
# safe-fetch.js: vendor host 默认值 "wx.juhe.chat" → "" (接收方必须设 WPP_VENDOR_HOST 才能 fetch vendor)
#   保留 env 覆盖逻辑, 只去掉默认域名 (防泄露 + 强制接收方配置自己的域名)
#   注意 sed 分隔符用 # (内容含 || 管道, 用 | 会冲突)
sed -i 's#WPP_VENDOR_HOST || "wx.juhe.chat"#WPP_VENDOR_HOST || ""#g; s#wx\.juhe\.chat##g' dist-release/src/util/safe-fetch.js
# v1.3.54 脱敏补强: silk 内部路径 (/root/silk_decoder/silk/...) → 通用相对路径 (接收方配 WPP_SILK_ENCODER/DECODER_PATH env 覆盖)
sed -i 's#/root/silk_decoder/silk/encoder#silk/encoder#g; s#/root/silk_decoder/silk/decoder#silk/decoder#g' \
  dist-release/src/dispatch/silk-encoder.js dist-release/src/storage/silk.js
# v1.3.54 脱敏补强: index.js 运行时字符串里的真实群ID/老板wxid → 通用占位 (filehelper 命令示例 + targetResolver hint)
sed -i 's#q139198824#YOUR_WXID#g; s#19908568237@chatroom#123456789@chatroom#g; s#53889526119@chatroom#123456789@chatroom#g; s#57737516566@chatroom#123456789@chatroom#g' dist-release/src/index.js
echo "清洗完成: 接晓银→助手, wx.juhe.chat→(env 配置), silk 路径→silk/encoder, 群ID/wxid→通用占位"

echo "=== [4.5/6] 校验无个性化值 ==="
PERSONAL="wx\.juhe\.chat|接晓银|q139198824|wxid_dbdmq8riblxo12|wxid_eezdbu1ytws422|71bed0f5|19908568237|53889526119|57737516566|jsnjzhou|zhuqixia520520|knowhub|益融|淮安|盱眙|wechatpadpromax|silk_decoder|/root/silk_decoder"
PERSONAL_HITS=$(find dist-release -name "*.js" -exec grep -lE "$PERSONAL" {} \; 2>/dev/null | head -5)
if [ -n "$PERSONAL_HITS" ]; then
  echo "⚠ dist-release 仍含个性化值:"
  echo "$PERSONAL_HITS"
  exit 1
fi
echo "✅ dist-release 无个性化值"

echo "=== [6/6] 组装发布包 → release/ ==="
rm -rf release
mkdir -p release
# dist-release/src/* 是插件编译产物 (rootDir="." 带 src/ 层级)
mkdir -p release/dist
cp -a dist-release/src/* release/dist/
# setup 向导单独放 scripts/ (接收方 node scripts/setup.js 跑)
# 修正 import 路径: setup.js 编译时 import ../src/xxx.js → 发布版应为 ../dist/xxx.js
mkdir -p release/scripts
sed 's|\.\./src/|../dist/|g' dist-release/scripts/setup.js > release/scripts/setup.js
# openclaw.plugin.json 清洗: description/placeholder 含 vendor 域名 + 部署路径 + AI 昵称 (泄露!)
#   用文本替换通用化 (configSchema 结构复杂, 逐字段改易漏)
cp openclaw.plugin.json release/
node -e "
const fs=require('fs');
const f='release/openclaw.plugin.json';
let s=fs.readFileSync(f,'utf8');
s=s.replace(/wx\.juhe\.chat/g,'YOUR_VENDOR_HOST');
s=s.replace(/adminmax\.knowhub\.cloud/g,'YOUR_VENDOR_HOST');
s=s.replace(/adminmax/gi,'vendor');
s=s.replace(/knowhub/g,'vendor');
s=s.replace(/益融小助理/g,'YourBot');
s=s.replace(/\/opt\/1panel\/[^ \"]*/g,'YOUR_DEPLOY_PATH');
s=s.replace(/1panel/gi,'YOUR_PANEL');
s=s.replace(/益融/g,'你的机器人'); // 益融 → 你的机器人 (替换残留)
fs.writeFileSync(f,s);
console.log('openclaw.plugin.json 清洗完成');
"
cp package.json release/
# config.json 清洗: 去 _comment (可能含内部 DB 实例名/部署引用), 保留结构 (passwordEnv 安全模式)
node -e "
const fs=require('fs');
const c=JSON.parse(fs.readFileSync('config.json','utf8'));
delete c._comment;
c._comment = 'WeChatPadPro OpenClaw plugin 全局配置. DB 凭证走 passwordEnv (不入 JSON). 账号独立配置在 accounts/<id>.json.';
fs.writeFileSync('release/config.json', JSON.stringify(c,null,2));
"
# 只拷 accounts 模板 (绝不拷真实 default.json/alice.json.disabled — 含老板配置+凭证, 泄露!)
mkdir -p release/accounts
cp accounts/default.json.example release/accounts/
# 发布版文档 (对外开源版, 无 dev 内部引用) — 源在 release-docs/ (独立维护, 不被 rm -rf 删除)
cp release-docs/GETTING_STARTED.md release/
cp release-docs/README.md release/
cp LICENSE release/
# package.json 清洗: scripts 只留 setup (发布版无 devDependencies, 其它 scripts 会失败); description 去内部部署引用
node -e "
const fs=require('fs');
const p=JSON.parse(fs.readFileSync('release/package.json','utf8'));
p.scripts = { setup: 'node scripts/setup.js' };
delete p.devDependencies;
p.description = 'WeChatPadPro (微信 Pad 协议 HTTP API) OpenClaw 适配插件. 语音 silk 自动转码 + 转码失败降级发文件; 群接龙自动触发 AI 应景回复; 引用回复; 文件确定性回复; 完整 254 paths API 覆盖.';
fs.writeFileSync('release/package.json', JSON.stringify(p,null,2));
"

echo "=== [7/6] 发布包清单 ==="
echo "release/ 内容:"
find release -maxdepth 2 -type f | grep -v node_modules | head -25
echo "发布包体积: $(du -sh release | cut -f1)"

echo "=== [8/6] 发布包最终脱敏校验 ==="
FINAL_PERSONAL="wx\.juhe\.chat|接晓银|q139198824|wxid_dbdmq8riblxo12|wxid_eezdbu1ytws422|71bed0f5|19908568237|53889526119|57737516566|jsnjzhou|zhuqixia520520|knowhub|益融|淮安|盱眙|wechatpadpromax|silk_decoder|/root/silk_decoder|56Z8kt5ySirXyyGj|71bed0f5-626a"
FINAL_HITS=$(grep -rlE "$FINAL_PERSONAL" release/ 2>/dev/null | grep -v node_modules | head -5)
if [ -n "$FINAL_HITS" ]; then
  echo "⚠ release/ 仍含个性化值:"
  echo "$FINAL_HITS"
  exit 1
fi
echo "✅ release/ 无个性化值 (发布包可安全分享)"
echo ""
echo "✅ 发布包就绪: release/"
echo "   接收方步骤: 拷贝 release/ → npm ci → cp accounts/default.json.example accounts/default.json → npm run setup add → 配置"
