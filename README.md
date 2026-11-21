# Flare 酷安插件（Coolapk social plugin for Flare）

给 [Flare](https://github.com/DimensionDev/Flare) 用的酷安（Coolapk）第三方插件：**匿名只读浏览 + 本地关注名单**。

> 非官方项目，与酷安官方无关。仅供个人自用，请自行承担使用风险。

## 它做什么 / 不做什么

- 匿名（不登录）读取酷安公开时间线、搜索（动态 / 用户）、用户主页
- 「本地关注」时间线：把关注名单存在本地，按名单轮转拉取用户动态，不需要登录态
- 不声明发帖 / 回帖 / 点赞 / 通知能力，这些接口匿名态会被验证码拦截，插件里也没有对应代码

## 在 Flare 里安装（GitHub 订阅）

1. 设置 → 插件（Beta）→ 从 GitHub 安装
2. 填仓库地址：`https://github.com/<你的账号>/<仓库名>`
3. Flare 会读仓库的 **tag** 列表，取语义化版本最高的那个，下载该 tag 的源码压缩包，从**仓库根目录**读 `manifest.json` + `plugin.js` + `assets/icon.png`
4. 之后有新版本时，在插件详情里检查更新即可，不用再手动导入 `.fpp`

因此仓库有两类内容：

- **根目录的插件文件**（`manifest.json`、`plugin.js`、`assets/icon.png`）→ 被 Flare 当成插件包读取，必须保持最新
- 其余开发文件（`src/`、`tools/`、`build.mjs`、`README.md` 等）→ Flare 会忽略（只认 `manifest.json`、`plugin.js`、`icons/*`、`locale/*.json`）

打 tag 的规则：必须是 `x.y.z` 形式（可带 `v` 前缀，如 `v0.1.9`），且 tag 里的 `manifest.json` 中 `version` 与之对应。

## 添加账号

实例地址填 `api.coolapk.com`（插件自带 detector，输入后会显示「酷安」并展开登录方式）。

| 登录方式 | 用途 |
| --- | --- |
| 添加匿名酷安账号 | 不登录，直接只读浏览；关注名单存在本地 |
| 登录一次并导入关注名单 | 开 WebView 登录，插件只读 cookie、拉一次关注列表，导入完就丢掉登录态 |
| 粘贴 Cookie 导入关注 | 绕开 WebView：从浏览器复制整段 `Cookie:` 头，插件验身份后同样只保留名单 |

### 导入卡住时会自动收尾

Cookie 轮询超过约一分钟仍无结果时，插件会关闭 WebView 并落地一个诊断账号，名字就是结论：

| 账号名 | 含义 |
| --- | --- |
| `酷安｜WebView 没交 Cookie` | 宿主没有把任何 cookie 转给插件 |
| `酷安｜WebView 里还没登录成功` | cookie 到了但没有 `SESSID` / `token` |
| `酷安｜Cookie 未被服务端认可` | `checkLoginInfo` 不认这段 cookie |
| `酷安｜关注列表读不到` | 身份通过但 `followList` 被拒 |
| `酷安｜关注列表是空的` | 身份通过，名单为空 |

诊断账号 id 是 `coolapk-diag`，不会覆盖「酷安匿名」账号，看完删掉即可。

## 构建

```bash
npm install
npm run check      # tsc --noEmit
npm run package    # 产出 plugin.fpp（API v1，适配 Flare 1.8.x）
npm run package:v2 # 产出 plugin-v2.fpp（API v2，需要支持 apiVersion 2 的 Flare）
npm test           # 裸沙箱 harness，直连真实接口验证映射与翻页
```

`npm run build` 会把 `src/` 打成仓库根目录的 `plugin.js`（IIFE，无 `require` / `process` / 定时器）。发布了新版本要记得把打好的 `plugin.js` 一起提交，否则订阅到的是旧代码。

## 实现要点

- `X-App-Token`（TokenV3）与 `X-App-Device` 在纯 JS 里复现：`src/coolapk.ts`、`src/bcrypt.ts`、`src/blowfish.ts`、`src/md5.ts`
- 匿名态可用：`/v6/main/init`、`/v6/user/feedList`、`/v6/user/space`、`/v6/search`；`/v6/feed/detail`、`/v6/feed/replyList` 匿名态 403（`err_request_captcha_v2`），所以详情一律跳网页
- API v1 没有 `customHeaders`，图片走代理（默认 `https://wsrv.nl/?url=`）；要换反代改 `src/plugin.ts` 里的 `IMAGE_PROXY` 或构建参数
- API v1 的 search 必须实现五个操作、relation 必须声明 `relationActions`，这些都是 v1 的硬性要求

## 许可

AGPL-3.0-or-later。签名算法与登录 / 关注实现参考自 [c001apk](https://github.com/8fdafs2/C001apk)（AGPL-3.0），故本项目沿用同一许可证。
