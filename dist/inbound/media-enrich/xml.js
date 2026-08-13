export function parseImageXml(xml) {
    const aesKey = xml.match(/aeskey="([^"]+)"/)?.[1];
    const fileNo = xml.match(/cdnbigimgurl="([^"]+)"/)?.[1] ||
        xml.match(/cdnmidimgurl="([^"]+)"/)?.[1] ||
        xml.match(/cdnthumburl="([^"]+)"/)?.[1];
    const md5 = xml.match(/md5="([^"]+)"/)?.[1];
    if (!aesKey || !fileNo)
        return null;
    return { aesKey, fileNo, md5 };
}
export function parseFileXml(xml) {
    const aesKey = xml.match(/aeskey="([^"]+)"/)?.[1];
    const fileNo = xml.match(/<fileno>([^<]+)<\/fileno>/)?.[1] ||
        xml.match(/fileno="([^"]+)"/)?.[1] ||
        xml.match(/<attachfileid>([^<]+)<\/attachfileid>/)?.[1] ||
        xml.match(/fileid="([^"]+)"/)?.[1] ||
        xml.match(/fileNo="([^"]+)"/)?.[1];
    const filenameRaw = xml.match(/<filename[^>]*>([^<]+)<\/filename>/)?.[1] || "file";
    const filename = filenameRaw.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
    const fileext = xml.match(/<fileext>([^<]+)<\/fileext>/)?.[1] || filename.split(".").pop() || "bin";
    const sizeStr = xml.match(/<totallen>([^<]+)<\/totallen>/)?.[1];
    const size = sizeStr ? parseInt(sizeStr, 10) : undefined;
    if (!aesKey || !fileNo)
        return null;
    return { aesKey, fileNo, filename, fileext, size };
}
export function parseVideoXml(xml) {
    const aesKey = xml.match(/aeskey="([^"]+)"/)?.[1];
    const fileNo = xml.match(/cdnvideourl="([^"]+)"/)?.[1] ||
        xml.match(/<cdnvideourl>([^<]+)<\/cdnvideourl>/)?.[1] ||
        xml.match(/cdnvideofileid="([^"]+)"/)?.[1] ||
        xml.match(/fileid="([^"]+)"/)?.[1];
    const md5 = xml.match(/md5="([^"]+)"/)?.[1] || xml.match(/<md5>([^<]+)<\/md5>/)?.[1];
    const thumbUrl = xml.match(/cdnthumbaeskey="([^"]+)"/)?.[1];
    const playLengthStr = xml.match(/<playlength>([^<]+)<\/playlength>/)?.[1];
    const playLength = playLengthStr ? parseInt(playLengthStr, 10) : undefined;
    if (!aesKey || !fileNo)
        return null;
    return { aesKey, fileNo, md5, thumbUrl, playLength };
}
export function parseVoiceXml(xml) {
    const aesKey = xml.match(/aeskey="([^"]+)"/)?.[1];
    const fileNo = xml.match(/cdnvoiceurl="([^"]+)"/)?.[1] ||
        xml.match(/<voicelength>([^<]+)<\/voicelength>/)?.[1] && xml.match(/voiceurl="([^"]+)"/)?.[1] ||
        xml.match(/fileid="([^"]+)"/)?.[1];
    const md5 = xml.match(/md5="([^"]+)"/)?.[1] || xml.match(/<md5>([^<]+)<\/md5>/)?.[1];
    const durationStr = xml.match(/<voicelength>([^<]+)<\/voicelength>/)?.[1];
    const durationMs = durationStr ? parseInt(durationStr, 10) : undefined;
    if (!aesKey || !fileNo)
        return null;
    return { aesKey, fileNo, md5, durationMs };
}
