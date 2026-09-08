// util/exec.ts - spawn-based async exec wrapper
// 仿 本项目/src/util/exec.ts 范式
// 关键: never block main thread, no shell, SIGKILL on timeout
import { spawn } from "node:child_process";
/**
 * execAsync(cmd, args[], opts?) — never throws on non-zero exit.
 * - spawn (no shell) 防命令注入 (vendor 推 binary 时含 shell 元字符会爆)
 * - 默认 timeout 30s, SIGKILL 兜底
 * - 默认 stdin "ignore" (防 stdin hang)
 *
 * 与 child_process.exec 不一样: 我们返回完整 stdout/stderr 不 throw;
 * 调用方按 code 判断是否成功
 */
export function execAsync(command, args = [], opts = {}) {
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const started = Date.now();
    return new Promise((resolve) => {
        const child = spawn(command, args, {
            cwd: opts.cwd,
            env: opts.env,
            stdio: [
                opts.stdinMode === "pipe" ? "pipe" : "ignore",
                "pipe",
                "pipe",
            ],
            // don't open shell
            shell: false,
            windowsHide: true,
        });
        let stdout = "";
        let stderr = "";
        let killed = false;
        const timer = setTimeout(() => {
            killed = true;
            try {
                child.kill("SIGKILL");
            }
            catch {
                /* already dead */
            }
        }, timeoutMs);
        if (child.stdout) {
            child.stdout.setEncoding("utf8");
            child.stdout.on("data", (chunk) => {
                stdout += chunk;
            });
        }
        if (child.stderr) {
            child.stderr.setEncoding("utf8");
            child.stderr.on("data", (chunk) => {
                stderr += chunk;
            });
        }
        child.on("error", (err) => {
            clearTimeout(timer);
            if (killed) {
                resolve({ code: null, signal: "SIGKILL", stdout, stderr, latencyMs: Date.now() - started });
            }
            else {
                resolve({
                    code: null,
                    signal: null,
                    stdout,
                    stderr: stderr ? stderr + (err.message ? `\n${err.message}` : "") : err.message,
                    latencyMs: Date.now() - started,
                });
            }
        });
        child.on("close", (code, signal) => {
            clearTimeout(timer);
            resolve({
                code: killed ? null : code,
                signal: killed ? "SIGKILL" : signal,
                stdout,
                stderr,
                latencyMs: Date.now() - started,
            });
        });
    });
}
//# sourceMappingURL=exec.js.map