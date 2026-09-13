// src/send/index.ts - 21 个 vendor tag module 入口 (聚合 make* functions)
import { makeWppLogin } from "./login.js";
import { makeWppMsg } from "./msg.js";
import { makeWppGroup } from "./group.js";
import { makeWppFriend } from "./friend.js";
import { makeWppUser } from "./user.js";
import { makeWppFinder } from "./finder.js";
import { makeWppFriendCircle } from "./friendcircle.js";
import { makeWppSearch } from "./search.js";
import { makeWppWxapp } from "./wxapp.js";
import { makeWppOfficialAccounts } from "./officialaccounts.js";
import { makeWppTools } from "./tools.js";
import { makeWppTenPay } from "./tenpay.js";
import { makeWppFavorites } from "./favorites.js";
import { makeWppLabel } from "./label.js";
import { makeWppVoice } from "./voice.js";
import { makeWppQWContact } from "./qwcontact.js";
import { makeWppSayHello } from "./sayhello.js";
import { makeWppTranslate } from "./translate.js";
import { makeWppCustomized } from "./customized.js";
import { makeWppWebhook } from "./webhook.js";
import { makeWppXiaoWei } from "./xiaowei.js"; // v1.3.69 预开发: 小微智能体 (默认不启用)
import { makeWppOther } from "./other.js"; // v1.6.0 SWAGGER-323: 厂商新增 Other tag (运动排行)
// 同时作为 re-export 入口 (供 misc-meta 用)
export { makeWppLogin, makeWppMsg, makeWppGroup, makeWppFriend, makeWppUser, makeWppFinder, makeWppFriendCircle, makeWppSearch, makeWppWxapp, makeWppOfficialAccounts, makeWppTools, makeWppTenPay, makeWppFavorites, makeWppLabel, makeWppVoice, makeWppQWContact, makeWppSayHello, makeWppTranslate, makeWppCustomized, makeWppWebhook, makeWppXiaoWei, makeWppOther, };
/**
 * 聚合 vendor 全部 21 tag × 236 endpoint 的入口
 * 调用:
 *   const api = makeWppSend({ baseUrl, tokenKey, authcode, accountId });
 *   const r = await api.msg.sendTxt(toWxid, content);
 *   const r2 = await api.login.getQR();
 */
export function makeWppSend(ctx) {
    return {
        login: makeWppLogin(ctx),
        msg: makeWppMsg(ctx),
        group: makeWppGroup(ctx),
        friend: makeWppFriend(ctx),
        user: makeWppUser(ctx),
        finder: makeWppFinder(ctx),
        friendCircle: makeWppFriendCircle(ctx),
        search: makeWppSearch(ctx),
        wxapp: makeWppWxapp(ctx),
        officialAccounts: makeWppOfficialAccounts(ctx),
        tools: makeWppTools(ctx),
        tenPay: makeWppTenPay(ctx),
        favorites: makeWppFavorites(ctx),
        label: makeWppLabel(ctx),
        voice: makeWppVoice(ctx),
        qwContact: makeWppQWContact(ctx),
        sayHello: makeWppSayHello(ctx),
        translate: makeWppTranslate(ctx),
        customized: makeWppCustomized(ctx),
        webhook: makeWppWebhook(ctx),
        xiaoWei: makeWppXiaoWei(ctx), // v1.3.69 预开发: 小微智能体 (默认不启用)
        other: makeWppOther(ctx), // v1.6.0 SWAGGER-323: 厂商新增 Other tag (运动排行)
    };
}
/** 列出所有 vendor 端点 (用于 tests/api-coverage 验证 100% 覆盖) */
export const WPP_VENDOR_ENDPOINTS = {
    login: [
        "/Login/62data",
        "/Login/62dataQRCodeApply",
        "/Login/62dataSMSAgain",
        "/Login/62dataSMSApply",
        "/Login/62dataSMSVerify",
        "/Login/A16Data",
        "/Login/A16Data848",
        "/Login/AutoHeartBeat",
        "/Login/Awaken",
        "/Login/CheckMacQR",
        "/Login/CheckQR",
        "/Login/ExtDeviceLoginConfirmGet",
        "/Login/ExtDeviceLoginConfirmOk",
        "/Login/Get62Data",
        "/Login/GetA16Data",
        "/Login/GetCacheInfo",
        "/Login/GetLoginQRCode862",
        "/Login/GetQR",
        "/Login/GetQRMac",
        "/Login/GetQRMac_oversea",
        "/Login/GetQRPad",
        "/Login/GetQRPadx",
        "/Login/GetQRWatch",
        "/Login/GetQRWin",
        "/Login/GetQRWinUnified",
        "/Login/GetQRWinUwp",
        "/Login/GetQR_oversea",
        "/Login/GetQRx",
        "/Login/GetQRx_oversea",
        "/Login/HarmonyLoginApi",
        "/Login/HeartBeat",
        "/Login/HeartBeatLogs",
        "/Login/HeartBeatLong",
        "/Login/LogOut",
        "/Login/LongLinkStatus",
        "/Login/Newinit",
        "/Login/TwiceAutoAuth",
        "/Login/YPayVerificationcode",
        // v1.3.67 新 vendor: 登录增强
        "/Login/GetLoginStatus",
        "/Login/SubmitLoginVerificationCode",
        "/Login/GetQRPadCloud",
        "/Login/GetQRPadPPMT",
        "/Login/62dataQRCodeVerify",
        "/Login/CheckCanSetAlias",
    ],
    msg: [
        "/Msg/Quote",
        "/Msg/Revoke",
        "/Msg/ShareLink",
        // v1.6.0 SWAGGER-323: 本端点 swagger 已改为定向 App 消息 (SendAppMsgParamDoc {ToWxid,Type,Xml},
        //   与 ShareLink 同 definition), 不再是当年的群发定义 — 见 send/msg.ts sendAppMsg 的说明.
        "/Msg/SendApp",
        "/Msg/SendCDNFile",
        "/Msg/SendCDNImg",
        "/Msg/SendCDNVideo",
        "/Msg/SendEmoji",
        "/Msg/SendTxt",
        "/Msg/SendVideo",
        "/Msg/SendVoice",
        "/Msg/SendXCX",
        "/Msg/ShareCard",
        "/Msg/ShareLocation",
        "/Msg/ShareVideo",
        "/Msg/StartAutoSync",
        "/Msg/Sync",
        "/Msg/UploadImg",
        // v1.3.67 新 vendor API
        "/Msg/SendGroupMassMsgText",
        "/Msg/SendFile",
        "/Msg/SendAppMessage",
    ],
    group: [
        "/Group/AddChatRoomMember",
        "/Group/ConsentToJoin",
        "/Group/CreateChatRoom",
        "/Group/DelChatRoomMember",
        "/Group/FacingCreateChatRoom",
        "/Group/GetChatRoomInfo",
        "/Group/GetChatRoomInfoDetail",
        "/Group/GetChatRoomMemberDetail",
        "/Group/GetQRCode",
        "/Group/GroupList",
        "/Group/InviteChatRoomMember",
        "/Group/List",
        "/Group/MoveContractList",
        "/Group/OperateChatRoomAdmin",
        "/Group/Quit",
        "/Group/ScanIntoGroup",
        "/Group/ScanIntoGroupEnterprise",
        "/Group/SendPat",
        "/Group/SendTransferGroupOwner",
        "/Group/SetChatRoomAnnouncement",
        "/Group/SetChatRoomName",
        "/Group/SetChatRoomRemarks",
        "/Group/SetChatroomAccessVerify",
    ],
    friend: [
        "/Friend/Blacklist",
        "/Friend/Delete",
        "/Friend/GetContractDetail",
        "/Friend/GetContractList",
        "/Friend/GetFriendstate",
        "/Friend/GetMFriend",
        "/Friend/LbsFind",
        "/Friend/PassVerify",
        "/Friend/Search",
        "/Friend/SendRequest",
        "/Friend/SetRemarks",
        "/Friend/Upload",
        // v1.3.67 新 vendor API
        "/Friend/GetGHList",
        // v1.6.0 SWAGGER-323: 好友申请自动化
        "/Friend/AutoAccept",
        "/Friend/GetFriendRequestList",
    ],
    user: [
        "/User/BindQQ",
        "/User/BindingEmail",
        "/User/BindingMobile",
        "/User/CheckCanSetAlias",
        "/User/DelSafetyInfo",
        "/User/GetContractProfile",
        "/User/GetOnlineInfo",
        "/User/GetQRCode",
        "/User/GetSafetyInfo",
        "/User/PrivacySettings",
        "/User/ReportMotion",
        "/User/SendVerifyMobile",
        "/User/SetAlisa",
        "/User/SetPasswd",
        "/User/UpdateProfile",
        "/User/UploadHeadImage",
        "/User/VerifyPasswd",
        // v1.3.67 新 vendor API
        "/User/FriendVerification",
        "/User/AddMeMethods",
    ],
    finder: [
        "/Finder/Comment",
        "/Finder/Decrypt",
        "/Finder/FinderGetMsgSessionId",
        "/Finder/FinderLiveDetail",
        "/Finder/FinderSearchList",
        "/Finder/FinderSendText",
        "/Finder/Findergettopiclist",
        "/Finder/Follow",
        "/Finder/GetCommentDetail",
        "/Finder/GetCommentList",
        "/Finder/GetRecommend",
        "/Finder/Like",
        "/Finder/Search",
        "/Finder/TargetUserPage",
        "/Finder/UserPrepare",
        // v1.3.67 新 vendor: 视频播放控制
        "/Finder/PlayVideo",
        "/Finder/PlayVideoStop",
        "/Finder/PlayVideoStatus",
        "/Finder/PlayVideoTasks",
    ],
    friendCircle: [
        "/FriendCircle/Comment",
        "/FriendCircle/GetCommnet",
        "/FriendCircle/GetDetail",
        "/FriendCircle/GetIdDetail",
        "/FriendCircle/GetList",
        "/FriendCircle/Messages",
        "/FriendCircle/MmSnsSync",
        "/FriendCircle/Operation",
        "/FriendCircle/PrivacySettings",
        "/FriendCircle/PushCommnet",
        "/FriendCircle/Upload",
        // v1.3.25 SWAGGER-254: 新增 5 个
        "/FriendCircle/DownloadVideo",
        "/FriendCircle/MessagesRaw",
        "/FriendCircle/SetBackgroundImage",
        "/FriendCircle/UploadImage",
        "/FriendCircle/UploadImages",
        "/FriendCircle/UploadVideo",
        // v1.3.67 新 vendor API
        "/FriendCircle/GetCollectCircle",
        "/FriendCircle/SendFavItemCircle",
        "/FriendCircle/SendOneIdCircle",
        "/FriendCircle/SetFriendCircleDays",
        // v1.3.67 新 vendor
        "/FriendCircle/ActiveTasks",
        // v1.6.0 SWAGGER-323: 批量导出 (3) + 自动跟发 (2)
        "/FriendCircle/BatchDownload",
        "/FriendCircle/BatchDownloadStatus",
        "/FriendCircle/BatchDownloadFile",
        "/FriendCircle/AutoForward",
        "/FriendCircle/AutoForwardStatus",
    ],
    search: [
        "/Search/AI",
        "/Search/All",
        "/Search/Articles",
        "/Search/Baike",
        "/Search/Books",
        "/Search/Channels",
        "/Search/Emoji",
        "/Search/Images",
        "/Search/Listen",
        "/Search/Live",
        "/Search/MiniGames",
        "/Search/MiniPrograms",
        "/Search/Moments",
        "/Search/News",
        "/Search/OfficialAccounts",
        "/Search/Stickers",
        "/Search/Underlines",
        "/Search/WeChatIndex",
        // v1.3.25 SWAGGER-254: 新增 5 个通用搜索
        // v1.6.0 SWAGGER-323: `/Search/Services` 与 `/Search/Service/{name}` 已从厂商 swagger 下线
        //   (旧「高级搜索能力目录/调用」一套合并进 Capabilities + Query) — 已从本清单与代码中移除.
        "/Search/Capabilities",
        "/Search/Gateway",
        "/Search/Query",
        // v1.3.67 新 vendor: 视频号深度 API
        "/Search/Channels/Detail",
        "/Search/Channels/Comments",
        "/Search/Channels/Media",
        "/Search/Channels/ResolveShare",
        // v1.3.67 新 vendor: AI 搜索对话
        "/Search/AI/Conversation",
        "/Search/AI/FollowUp",
    ],
    wxapp: [
        "/Wxapp/AddAvatar",
        "/Wxapp/AddMobile",
        "/Wxapp/CloudCallFunction",
        "/Wxapp/DelMobile",
        "/Wxapp/DellAvatar",
        "/Wxapp/GETCreditScoreParam",
        "/Wxapp/GetAllMobile",
        "/Wxapp/GetRandomAvatar",
        "/Wxapp/GetUnionPay",
        "/Wxapp/GetUserOpenId",
        "/Wxapp/GetWxAppRecord",
        "/Wxapp/JSGetSessionid",
        "/Wxapp/JSLogin",
        "/Wxapp/JSOperateWxData",
        "/Wxapp/UploadAvatarImg",
        "/Wxapp/Verifyplugin",
        "/Wxapp/Wxapp/AddWxAppRecord",
        "/Wxapp/Wxapp/GetpullPay",
        "/Wxapp/Wxapp/JSGetSessionidQRcode",
        "/Wxapp/Wxapp/QrcodeAuthLogin",
        // v1.3.67 新 vendor: 小程序 OAuth
        "/Wxapp/DeleteOauthApp",
        "/Wxapp/GetOauthList",
        "/Wxapp/JSLoginCustomized",
    ],
    officialAccounts: [
        "/OfficialAccounts/AuthMpLogin",
        "/OfficialAccounts/Follow",
        "/OfficialAccounts/GetAppMsgExt",
        "/OfficialAccounts/GetAppMsgExtLike",
        "/OfficialAccounts/GetMpHistory",
        "/OfficialAccounts/GetMpHistoryMessage",
        "/OfficialAccounts/JSAPIPreVerify",
        "/OfficialAccounts/MpGetA8Key",
        "/OfficialAccounts/OauthAuthorize",
        "/OfficialAccounts/QRConnectAuthorize",
        "/OfficialAccounts/QRConnectAuthorizeConfirm",
        "/OfficialAccounts/Quit",
        // v1.3.67 新 vendor: 公众号文章
        "/OfficialAccounts/ArticleList",
        "/OfficialAccounts/ArticleMarkdown",
        "/OfficialAccounts/ArticleRead",
    ],
    tools: [
        "/Tools/CdnDownloadImage",
        "/Tools/DownloadFile",
        "/Tools/DownloadImg",
        "/Tools/DownloadVideo",
        "/Tools/DownloadVoice",
        "/Tools/GeneratePayQCode",
        "/Tools/GetA8Key",
        "/Tools/GetBandCardList",
        "/Tools/GetBoundHardDevices",
        "/Tools/GetCdnDns",
        "/Tools/HelperVerification",
        "/Tools/OauthSdkApp",
        "/Tools/ThirdAppGrant",
        "/Tools/UploadFile",
        "/Tools/setproxy",
        // v1.3.25 SWAGGER-254: 新增 2 个 (media-enrich 已用, 补注册)
        "/Tools/DownloadFileBinary",
        "/Tools/DownloadVoiceBinary",
        // v1.6.0 SWAGGER-323: 纠正误绑 — setproxy 本来就是代理IP, 步数端点一直是 SetStep;
        //   setproxy 本就在上面白名单里 (没变), 这里补的是真正该用的 SetStep. 详见 send/tools.ts.
        "/Tools/SetStep",
        "/Tools/DownloadMiniProgramCover",
    ],
    tenPay: [
        "/TenPay/GeMaSkdPayQCode",
        "/TenPay/GetEncryptInfo",
        "/TenPay/OpenHongBao",
        "/TenPay/Openwxhb",
        "/TenPay/Qrydetailwxhb",
        "/TenPay/Receivewxhb",
        "/TenPay/SjSkdPayQCode",
        // v1.3.25 SWAGGER-254: 新增 5 个
        "/TenPay/Collectmoney",
        "/TenPay/ConfirmPreTransferApi",
        "/TenPay/GeneratePayQCode",
        "/TenPay/GetRedPacketListApi",
        "/TenPay/WXCreateRedPacketApi",
        // v1.3.67 新 vendor: 红包增强
        "/TenPay/OpenHongBaoWithParams",
        "/TenPay/ReceivewxhbWithoutEncryption",
        // v1.6.0 SWAGGER-323: 转账预订单 (不扣款, 配合 ConfirmPreTransferApi)
        "/TenPay/CreatePreTransfer",
    ],
    favorites: ["/Favor/Del", "/Favor/GetFavInfo", "/Favor/GetFavItem", "/Favor/Sync"],
    label: [
        "/Label/Add",
        "/Label/Delete",
        "/Label/GetList",
        "/Label/UpdateList",
        "/Label/UpdateName",
        // v1.3.67 新 vendor
        "/Label/GetWXFriendListByLabel",
        // v1.6.0 SWAGGER-323
        "/Label/UpdateOrder",
    ],
    voice: [
        "/Voice/MessageTranscribe",
        "/Voice/Result",
        "/Voice/Transcribe",
    ],
    qwContact: [
        "/QWContact/QWApplyAddContact",
        // v1.3.67: 路径去重 (旧 /QWContact/QWContact/QWAddContact 已废弃)
        "/QWContact/QWAddContact",
        "/QWContact/SearchQWContact",
    ],
    sayHello: ["/SayHello/Modelv1", "/SayHello/Modelv2", "/SayHello/Modelv3"],
    translate: ["/Translate/Send", "/Translate/Text"],
    customized: ["/Customized/WXCTDUniftyAuthBatch"],
    webhook: [
        "/Webhook/Business/Get",
        "/Webhook/Business/Set",
        "/Webhook/Get",
        "/Webhook/Remove",
        "/Webhook/Set",
        "/Webhook/Test",
    ],
    // v1.3.69 预开发: 小微智能体 (默认不启用, 仅注册端点; agent-tools 不暴露)
    xiaoWei: [
        "/XiaoWei/Cards/ScreenshotSecurityCheck",
        "/XiaoWei/Cards/Users",
        "/XiaoWei/Chat/Sessions",
        "/XiaoWei/Chat/Sessions/{session_id}",
        "/XiaoWei/Chat/Sessions/{session_id}/Cancel",
        "/XiaoWei/Chat/Sessions/{session_id}/Events",
        "/XiaoWei/Chat/Sessions/{session_id}/Messages",
        "/XiaoWei/Chat/Sessions/{session_id}/Regenerate",
        "/XiaoWei/Chat/Sessions/{session_id}/SwitchRoom",
        "/XiaoWei/Conversations/A2A/List",
        "/XiaoWei/Conversations/Suggestions",
        "/XiaoWei/History/Delete",
        "/XiaoWei/History/Fill",
        "/XiaoWei/History/List",
        "/XiaoWei/Invites",
        "/XiaoWei/Invites/Candidates",
        "/XiaoWei/Invites/Info",
        "/XiaoWei/Permission",
        "/XiaoWei/RedDots/Query",
        "/XiaoWei/RedDots/Read",
    ],
    // v1.6.0 SWAGGER-323: 厂商新增 Other tag (v09102 只有一个端点)
    other: ["/Other/GetUserRankLikeCount"],
};
//# sourceMappingURL=index.js.map