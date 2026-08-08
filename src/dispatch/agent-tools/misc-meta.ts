// src/dispatch/agent-tools/misc-meta.ts - favorites + label + voice + sayhello + translate + customized + qwContact (合并小 tag)

import { Type } from "typebox";
import type { ToolMeta } from "./_shared.js";
import {
  makeWppFavorites,
  makeWppLabel,
  makeWppVoice,
  makeWppSayHello,
  makeWppTranslate,
  makeWppCustomized,
  makeWppQWContact,
} from "../../send/index.js";
import type { WppAccountCtx } from "../../send/factory.js";

const ctx: WppAccountCtx = { baseUrl: "", tokenKey: "", accountId: "" };
const fav = makeWppFavorites(ctx);
const lab = makeWppLabel(ctx);
const voi = makeWppVoice(ctx);
const say = makeWppSayHello(ctx);
const trn = makeWppTranslate(ctx);
const cus = makeWppCustomized(ctx);
const qwc = makeWppQWContact(ctx);

export const FAVORITES_META: ToolMeta = {
  favoritesSync: ["同步收藏内容.", Type.Object({}), fav.sync],
  favoritesGetInfo: ["获取收藏信息.", Type.Object({ favId: Type.String() }), fav.getFavInfo],
  favoritesGetItem: ["获取收藏原文.", Type.Object({ favId: Type.String() }), fav.getFavItem],
  favoritesDel: ["删除收藏.", Type.Object({ favId: Type.String() }), fav.del],
};

export const LABEL_META: ToolMeta = {
  labelAdd: [
    "添加标签. wxidList 数组 join(',') 后传.",
    Type.Object({
      labelName: Type.String(),
      wxidList: Type.Optional(Type.String()),
    }),
    lab.add,
  ],
  labelDelete: ["删除标签.", Type.Object({ labelId: Type.String() }), lab.delete],
  labelGetList: ["获取标签列表.", Type.Object({}), lab.getList],
  labelUpdateName: [
    "修改标签名.",
    Type.Object({ labelId: Type.String(), labelName: Type.String() }),
    lab.updateName,
  ],
  labelUpdateList: [
    "更新标签的成员列表.",
    Type.Object({
      labelId: Type.String(),
      wxidList: Type.String({ description: "wxid 数组 join(',')" }),
    }),
    lab.updateList,
  ],
};

export const VOICE_META: ToolMeta = {
  voiceTranscribe: [
    "上传语音 base64 并转文字.",
    Type.Object({
      voiceBase64: Type.String(),
      durationMs: Type.Optional(Type.Number()),
    }),
    voi.transcribe,
  ],
  voiceMessageTranscribe: [
    "把已收到语音消息转写 (异步).",
    Type.Object({ msgId: Type.String() }),
    voi.messageTranscribe,
  ],
  voiceResult: [
    "查询异步语音转写结果.",
    Type.Object({ taskId: Type.String() }),
    voi.result,
  ],
};

export const SAY_HELLO_META: ToolMeta = {
  sayHelloModelv1: [
    "打招呼模式1 (扫码).",
    Type.Object({ scene: Type.String(), v1: Type.String() }),
    say.modelv1,
  ],
  sayHelloModelv2: [
    "打招呼模式3 (v3/v4).",
    Type.Object({ v1: Type.String(), v2: Type.String() }),
    say.modelv2,
  ],
};

export const TRANSLATE_META: ToolMeta = {
  translateText: [
    "文字翻译 (不发送).",
    Type.Object({ content: Type.String(), targetLang: Type.String() }),
    trn.text,
  ],
  translateAndSend: [
    "翻译并发送给 toWxid.",
    Type.Object({
      toWxid: Type.String(),
      content: Type.String(),
      targetLang: Type.String(),
    }),
    trn.send,
  ],
};

export const CUSTOMIZED_META: ToolMeta = {
  customizedUniftyAuthBatch: [
    "批量开小程序 (定制接口, 仅 vendor 客户).",
    Type.Object({ appIds: Type.String({ description: "appId 数组 join(',')" }) }),
    cus.wxctdUniftyAuthBatch,
  ],
};

export const QW_CONTACT_META: ToolMeta = {
  qwContactSearch: ["搜索企业微信联系人.", Type.Object({ keyword: Type.String() }), qwc.searchQWContact],
  qwContactApply: [
    "企业微信申请加好友.",
    Type.Object({ v1: Type.String(), v2: Type.String() }),
    qwc.qwApplyAddContact,
  ],
  qwContactAdd: [
    "企业微信主动加好友.",
    Type.Object({ v1: Type.String(), v2: Type.String() }),
    qwc.qwAddContact,
  ],
};
