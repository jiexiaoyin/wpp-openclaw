export function ctxToCallOpts(ctx) {
    return {
        tokenKey: ctx.tokenKey,
        authcode: ctx.authcode,
        accountId: ctx.accountId,
    };
}
