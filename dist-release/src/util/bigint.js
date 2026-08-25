export function stringifyLargeInts(jsonText) {
    return jsonText.replace(/("[\w$]+"\s*:\s*)(\d{16,})(?=[,\s}\]]|$)/g, '$1"$2"');
}
