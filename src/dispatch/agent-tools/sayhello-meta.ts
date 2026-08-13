// src/dispatch/agent-tools/sayhello-meta.ts - SayHello tag (打招呼, 2)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import { makeWppSayHello } from "../../send/index.js";
import { getDefaultAccountRegistry } from "../../account-state.js";
import { getCurrentAccountId } from "../account-context.js";

function getSay() {
  const state = getDefaultAccountRegistry().get(getCurrentAccountId() ?? "default");
  if (!state) throw new Error(`account not found: ${getCurrentAccountId() ?? "default"}`);
  return makeWppSayHello({
    baseUrl: state.config.apiBaseUrl,
    tokenKey: state.config.tokenKey,
    authcode: state.authcode,
    accountId: getCurrentAccountId() ?? "default",
  });
}

export const SAY_HELLO_META: ToolMeta = {
  sayHelloModelv1: [
    "打招呼模式1 (扫码).",
    Type.Object({ scene: Type.String(), v1: Type.String() }),
    (scene: string, v1: string) => getSay().modelv1(scene, v1),
  ],
  sayHelloModelv2: [
    "打招呼模式3 (v3/v4).",
    Type.Object({ v1: Type.String(), v2: Type.String() }),
    (v1: string, v2: string) => getSay().modelv2(v1, v2),
  ],
};
