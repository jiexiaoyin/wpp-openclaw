export function isValidWxid(s) {
    if (!s)
        return false;
    if (s.startsWith("wxid_") || s.startsWith("gh_"))
        return true;
    return /^[a-zA-Z][\w-]{6,}$/.test(s);
}
export function isGroupWxid(s) {
    if (!s)
        return false;
    return s.endsWith("@chatroom") || s.startsWith("@@") || s.includes("@chatroom");
}
export function isValidAtUser(s) {
    if (!s)
        return false;
    return /^(wxid_|gh_)/.test(s);
}
