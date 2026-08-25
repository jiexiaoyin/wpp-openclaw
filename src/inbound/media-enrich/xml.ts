// src/inbound/media-enrich/xml.ts - 媒体消息 XML 解析器 (v0 schema)
// 从 media-enrich.ts v1.3.26 拆分 (2026-08-10, P3-2): 仅搬运, 不优化



/**
 * 从图片 XML 提取 CDN 下载参数 (aeskey + cdnthumburl/cdnbigimgurl)
 */
export function parseImageXml(xml: string): {
  aesKey: string;
  fileNo: string;
  md5?: string;
} | null {
  const aesKey = xml.match(/aeskey="([^"]+)"/)?.[1];
  const fileNo =
    xml.match(/cdnbigimgurl="([^"]+)"/)?.[1] ||
    xml.match(/cdnmidimgurl="([^"]+)"/)?.[1] ||
    xml.match(/cdnthumburl="([^"]+)"/)?.[1];
  const md5 = xml.match(/md5="([^"]+)"/)?.[1];
  if (!aesKey || !fileNo) return null;
  return { aesKey, fileNo, md5 };
}
/**
 * 解析 file msg XML → 拿 aeskey + fileNo + filename + size
 * vendor file XML 范式: <appmsg><type>6</type><appattach>
 *   <attachurl> <aeskey> <fileno> <fileext> <filename name="...">
 */
export function parseFileXml(xml: string): {
  aesKey: string;
  fileNo: string;
  filename: string;
  fileext: string;
  size?: number;
} | null {
  const aesKey = xml.match(/aeskey="([^"]+)"/)?.[1];
  // fileNo 字段名 vendor 多种: fileno / attachfileid / fileid / fileNo
  const fileNo =
    xml.match(/<fileno>([^<]+)<\/fileno>/)?.[1] ||
    xml.match(/fileno="([^"]+)"/)?.[1] ||
    xml.match(/<attachfileid>([^<]+)<\/attachfileid>/)?.[1] ||
    xml.match(/fileid="([^"]+)"/)?.[1] ||
    xml.match(/fileNo="([^"]+)"/)?.[1];
  const filenameRaw = xml.match(/<filename[^>]*>([^<]+)<\/filename>/)?.[1] || "file";
  const filename = filenameRaw.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
  const fileext = xml.match(/<fileext>([^<]+)<\/fileext>/)?.[1] || filename.split(".").pop() || "bin";
  const sizeStr = xml.match(/<totallen>([^<]+)<\/totallen>/)?.[1];
  const size = sizeStr ? parseInt(sizeStr, 10) : undefined;
  if (!aesKey || !fileNo) return null;
  return { aesKey, fileNo, filename, fileext, size };
}
/**
 * 解析 videomsg XML → aeskey + cdnthumbaeskey/cdnthumburl/cdnvideourl
 * 注: 微信 videomsg 有两个 CDN: 视频本体 + 缩略图
 */
export function parseVideoXml(xml: string): {
  aesKey: string;
  fileNo: string;
  md5?: string;
  thumbUrl?: string;
  playLength?: number;
} | null {
  const aesKey = xml.match(/aeskey="([^"]+)"/)?.[1];
  // videomsg 通常用 cdnvideourl/cdnvideourl/aeskey 字段
  const fileNo =
    xml.match(/cdnvideourl="([^"]+)"/)?.[1] ||
    xml.match(/<cdnvideourl>([^<]+)<\/cdnvideourl>/)?.[1] ||
    xml.match(/cdnvideofileid="([^"]+)"/)?.[1] ||
    xml.match(/fileid="([^"]+)"/)?.[1];
  const md5 = xml.match(/md5="([^"]+)"/)?.[1] || xml.match(/<md5>([^<]+)<\/md5>/)?.[1];
  const thumbUrl = xml.match(/cdnthumbaeskey="([^"]+)"/)?.[1];
  const playLengthStr = xml.match(/<playlength>([^<]+)<\/playlength>/)?.[1];
  const playLength = playLengthStr ? parseInt(playLengthStr, 10) : undefined;
  if (!aesKey || !fileNo) return null;
  return { aesKey, fileNo, md5, thumbUrl, playLength };
}
/**
 * 解析 voicemsg XML → aeskey + fileNo (silk/AMR/MP3)
 */
export function parseVoiceXml(xml: string): {
  aesKey: string;
  fileNo: string;
  md5?: string;
  durationMs?: number;
} | null {
  const aesKey = xml.match(/aeskey="([^"]+)"/)?.[1];
  const fileNo =
    xml.match(/cdnvoiceurl="([^"]+)"/)?.[1] ||
    xml.match(/<voicelength>([^<]+)<\/voicelength>/)?.[1] && xml.match(/voiceurl="([^"]+)"/)?.[1] ||
    xml.match(/fileid="([^"]+)"/)?.[1];
  const md5 = xml.match(/md5="([^"]+)"/)?.[1] || xml.match(/<md5>([^<]+)<\/md5>/)?.[1];
  const durationStr = xml.match(/<voicelength>([^<]+)<\/voicelength>/)?.[1];
  const durationMs = durationStr ? parseInt(durationStr, 10) : undefined;
  if (!aesKey || !fileNo) return null;
  return { aesKey, fileNo, md5, durationMs };
}
