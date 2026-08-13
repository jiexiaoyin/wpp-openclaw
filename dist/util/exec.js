import { spawn } from "node:child_process";
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
