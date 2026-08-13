import { randomBytes } from "node:crypto";
export function uniqueId() {
    return randomBytes(8).toString("hex");
}
export function longUniqueId() {
    return randomBytes(12).toString("hex");
}
