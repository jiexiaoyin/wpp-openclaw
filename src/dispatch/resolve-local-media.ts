// src/dispatch/resolve-local-media.ts - isLocalFile centralization (1 处判据源)
// 仿 本项目/src/dispatch/resolve-local-media.ts (v3.1.1 fullfix4 教训: 5 处重复 → 1 处)

export function isLocalFile(pathOrUrl: string): boolean {
  if (!pathOrUrl) return false;
  if (pathOrUrl.startsWith("file://")) return true;
  if (pathOrUrl.startsWith("/")) return true;
  if (/^[a-zA-Z]:[\\\/]/.test(pathOrUrl)) return true;
  return false;
}

/** Strip file:// prefix; not in flight test path */
export function stripFileProtocol(pathOrUrl: string): string {
  return pathOrUrl.replace(/^file:\/\//, "");
}
