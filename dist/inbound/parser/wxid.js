// src/inbound/parser/wxid.ts - wxid 校验工具
/** 标准 wxid 形式: `wxid_xxx` 或 `gh_xxx` 或 9+ 位 @chatroom */
export function isValidWxid(s) {
    if (!s)
        return false;
    if (s.startsWith("wxid_") || s.startsWith("gh_"))
        return true;
    return /^[a-zA-Z][\w-]{6,}$/.test(s);
}
/** chatroom wxid: 通常以 @chatroom 结尾, vendor 早期也有 @@ 前缀 */
export function isGroupWxid(s) {
    if (!s)
        return false;
    return s.endsWith("@chatroom") || s.startsWith("@@") || s.includes("@chatroom");
}
/** @user 提及 validation: 合法 wxid 格式 */
export function isValidAtUser(s) {
    if (!s)
        return false;
    return /^(wxid_|gh_)/.test(s);
}
//# sourceMappingURL=wxid.js.map