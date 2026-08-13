function escapeXml(s) {
    return s
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}
export function buildQuoteReplyXml(replyContent, quote, opts) {
    const innerType = opts?.innerType ?? 57;
    const reply = (replyContent || "引用回复").trim();
    const title = escapeXml(reply.slice(0, 500));
    const des = escapeXml(reply.slice(0, 500));
    const svrid = escapeXml(quote.svrid.trim());
    const fromusr = quote.fromusr ? escapeXml(quote.fromusr) : "";
    const refermsg = svrid
        ? `<refermsg>` +
            `<svrid>${svrid}</svrid>` +
            (fromusr ? `<fromusr>${fromusr}</fromusr>` : "") +
            `</refermsg>`
        : "";
    return `<appmsg><title>${title}</title><des>${des}</des><type>${innerType}</type>${refermsg}</appmsg>`;
}
