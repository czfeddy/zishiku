# Worklog

## 2026-04-23 ICP Filing Preparation

- Checked current public site and config:
  - `site-meta.js` has empty `icpNumber`
  - local `.env` has empty `ICP_NUMBER`, `PUBLIC_SECURITY_NUMBER`, and `PUBLIC_SECURITY_URL`
  - no visible ICP filing number is currently shown on the live footer
- Confirmed current production server is an Alibaba Cloud mainland China instance:
  - host: `198.18.2.216`
  - region: `cn-hangzhou`
  - zone: `cn-hangzhou-h`
- Confirmed DNS:
  - `xinyongdai123.com -> 198.18.0.72`
  - `zsk.xinyongdai123.com -> 198.18.2.216`
- Based on Alibaba Cloud official guidance, mainland China Alibaba Cloud-hosted public websites need ICP filing before compliant public service, and public security filing should be completed within 30 days after ICP filing succeeds.
- Created a clean filing-preparation document:
  - `docs/ICP备案提交材料-20260423.md`
- User confirmed the filing subject should be a company.
- Updated the filing draft to prioritize enterprise ICP filing and added company-form fields to fill.
- Tentative company name from WeChat Pay merchant API certificate:
  - `广州金小象信息科技有限公司`
  - This still needs explicit confirmation before submitting ICP filing.
- Current action needed from user:
  - log in to Alibaba Cloud ICP filing system
  - confirm filing subject: company or personal
  - provide/upload required identity or business-license materials
  - complete face/SMS verification

## 2026-04-23 WeChat Pay Production Deployment

### Local Implementation

- Completed real WeChat Pay API v3 integration for both active backends:
  - `server.js`
  - `app.py`
- Added merchant API private-key signing, APIv3 key config, notification raw-body preservation, notification signature verification, AEAD_AES_256_GCM resource decryption, callback-side order validation, and callback-side VIP fulfillment.
- The fallback order status query flow still remains available after user return.
- Updated `.env.example` with WeChat Pay APIv3 and verification-key/certificate fields.

### Local Secret Setup

- Official account:
  - `WECHAT_APP_ID` and `WECHAT_APP_SECRET` were configured in local `.env`.
- Merchant:
  - `WECHAT_PAY_MCH_ID=1105997171`
  - `WECHAT_PAY_APP_ID` uses the official account AppID.
  - API certificate zip was provided at `C:/Program Files (x86)/Thunder Network/Thunder/Program/resources/app/plugins/DownloadSDK/WXCertUtil/cert/1105997171_20260423_cert.zip`.
  - Extracted to `C:/Users/Administrator/Documents/zhishiku/.codex-keys/wechat-pay/`.
  - Certificate serial: `4FBA35D0E8866AD24957DACFB535F39930C78543`.
  - APIv3 key was configured locally.
  - Notify URL configured as `https://zsk.xinyongdai123.com/api/wechat/pay/notify`.

### Production Deployment

- Current live DNS resolution: `zsk.xinyongdai123.com -> 198.18.2.216`.
- Previous recorded host `198.18.0.76` now closes SSH during key exchange and should not be used as the active deployment target.
- Connected to production with `C:/Users/Administrator/Documents/zhishiku/.codex-keys/zsk_deploy_key`.
- Runtime confirmed:
  - systemd service: `zsk-h5.service`
  - command: `/usr/bin/python3 /opt/zsk-h5/app.py`
  - app dir: `/opt/zsk-h5`
  - local bind: `127.0.0.1:3000`
  - public front: nginx
- Backup created before deploy: `/opt/zsk-h5_backup_20260423_111338`.
- Deployed `/opt/zsk-h5/app.py`, `/opt/zsk-h5/server.js`, merged WeChat Pay keys into `/opt/zsk-h5/.env`, and uploaded WeChat Pay cert/key files into `/opt/zsk-h5/.codex-keys/wechat-pay/`.
- Restarted `zsk-h5.service`.

### Verification

- Local checks passed:
  - `node --check server.js`
  - `node --check public/recharge.js`
  - `python -m py_compile app.py`
- Remote checks passed:
  - `python3 -m py_compile /tmp/zsk-app.py`
  - remote `cryptography` supports `AESGCM` and `x509`
  - `app.is_wechat_pay_configured()` returned `True`
  - `app.get_wechat_pay_configured_missing_items()` returned `[]`
- Production service status: `zsk-h5.service` active.
- Public checks:
  - `https://zsk.xinyongdai123.com/api/health` returns `200`
  - `https://zsk.xinyongdai123.com/recharge.html` returns `200`
  - `https://zsk.xinyongdai123.com/api/recharge/plans` returns configured VIP plans

### Payment Gateway Smoke Test

- Ran a no-business-write smoke test directly against WeChat Pay H5 transaction API.
- Result:
  - request reached WeChat Pay gateway
  - no certificate/signature/APIv3-key error was returned
  - gateway rejected with product permission error: `商户号该产品权限未开通，请前往商户平台>产品中心检查后重试。`
- Meaning:
  - code, signing, certificate path, and APIv3 key are wired correctly enough to reach the product permission layer
  - the remaining blocker is merchant-platform product enablement, not application code

### Required Next Merchant-Platform Action

- In WeChat Pay Merchant Platform:
  - open `产品中心`
  - enable `H5支付`
  - configure H5 payment domain `zsk.xinyongdai123.com`
- After H5 Pay is enabled, rerun the smoke test or perform a real small recharge from `https://zsk.xinyongdai123.com/recharge.html`.

### Secret Records

- Created local sensitive records:
  - `shop_secret.md`
  - `all_secred.md`
- Added both files to `.gitignore` to prevent accidental commit.

## 2026-04-03

### 本轮目标

- 排查并实现“微信内分享到朋友圈后，文章能以卡片形式分享”的方案。
- 对比竞品，确认当前项目最可行的实现路径。

### 已完成工作

- 修复并部署了线上 `zsk.xinyongdai123.com` 的真实运行链路。
  - 已确认真实线上机可通过 `C:\Users\Administrator\Documents\zhishiku\.codex-keys\zsk_deploy_key` 登录。
  - 真实站点目录：`/opt/zsk-h5`
  - 真实运行方式：`systemd` 服务 `zsk-h5.service`
  - 真实运行入口：`/opt/zsk-h5/app.py`
- 修复并上线了 Python 版后端的小程序 URL Link 自动生成能力。
  - 补充了 `MINI_PROGRAM_APP_SECRET`
  - 补充了 `MINI_PROGRAM_ENV_VERSION`
  - 补充了 `MINI_PROGRAM_URL_LINK_EXPIRE_DAYS`
  - 文章接口已能返回真实 `miniProgramLaunchUrl`
  - 已验证返回过 `https://wxaurl.cn/...`
- 更新并上线了前端分享逻辑与版本号。
  - 发布过 `detail.js/common.js/detail.html` 新版
  - 通过 `v=20260403a/b/c` 强制刷新微信缓存
- 排查了“直接从当前 H5 详情页分享到朋友圈”的结果。
  - 用户实测结果：仍然只是“链接文字”进入文案框
  - 说明当前普通详情页 `/content/{slug}` 这条路径，没有稳定被微信识别成理想卡片
- 评估了“公众号壳文章”方案。
  - 技术上可行
  - 但不符合当前最新判断，不作为下一步主方案
- 评估并接入了“公众号文章链接优先分享”能力。
  - 当前通过 `externalUrl` 承载公众号文章链接
  - 若填写 `https://mp.weixin.qq.com/...`，分享逻辑会优先走该链接
  - 仅是能力预留，尚未形成最终主方案

### 关键验证结论

- 当前项目里，直接分享普通详情页 `/content/{slug}`，在微信朋友圈中仍然会降级成纯链接文字，不是目标卡片。
- 用户提供的竞品截图显示：
  - 图一是业务页
  - 点击“一键转发”后进入图二
  - 图二底部能看到网页域名，说明它仍然是 H5 网页，不是公众号壳，也不是小程序页面
  - 用户从图二右上角分享到朋友圈后，朋友圈出现的是网页卡片
  - 点击卡片后会回到图二
- 因此，竞品最像的实现方式不是“分享普通详情页”，而是：
  - 先进入一个专门的 H5 分享页
  - 再从该分享页执行微信朋友圈分享
  - 分享出去的目标页就是这个分享页本身

### 当前最靠谱方案

- 新增一套独立的 H5 分享壳页，而不是继续用普通文章详情页硬做分享。

建议结构：

- 普通内容页：
  - `/content/{slug}`
- 分享壳页：
  - `/share/{slug}`

分享链路建议：

1. 用户先进入普通业务页或普通内容页
2. 点击“一键分享”或“分享到朋友圈”
3. 页面先跳转到 `/share/{slug}`
4. 用户在 `/share/{slug}` 页面里通过微信右上角分享到朋友圈
5. 朋友圈里的卡片目标页也是 `/share/{slug}`
6. 用户点击朋友圈卡片后进入 `/share/{slug}`

### 下一线程应直接做的事

1. 新增服务端路由 `/share/:slug`
2. 新增独立模板页面，例如 `public/share.html`
3. 让 `/share/:slug` 服务端首屏直出完整分享元信息：
   - `title`
   - `description`
   - `og:title`
   - `og:description`
   - `og:image`
   - `og:url`
   - `canonical`
4. 分享壳页结构尽量接近竞品图二：
   - 标题
   - 封面
   - 核心卖点/参数
   - 联系卡
   - 显眼 CTA
5. 把普通内容页上的“分享朋友圈”按钮改成：
   - 先跳到 `/share/{slug}`
   - 不再直接分享 `/content/{slug}`
6. 朋友圈真正分享出去的 URL 统一改成 `/share/{slug}`

### 已知线上信息

- 线上服务器：`198.18.0.61`
- 登录密钥：
  - `C:\Users\Administrator\Documents\zhishiku\.codex-keys\zsk_deploy_key`
- 线上目录：
  - `/opt/zsk-h5`
- 线上服务：
  - `zsk-h5.service`
- 重启命令：
  - `systemctl restart zsk-h5.service`

### 本轮不要再走的方向

- 不要继续把主要精力放在“直接分享普通详情页 `/content/{slug}`”上。
- 不要把下一步主方案设成“公众号壳文章”或“小程序壳页”。
- 竞品分析后，下一轮应优先实现“独立 H5 分享壳页”。
# 2026-04-04 Follow-up

## Final Findings

- We fully validated the `H5 detail page -> dedicated H5 share page -> share to Moments` route.
- Real-world test result on `2026-04-04`:
  - entering `/share/{slug}` works
  - sharing from that page to WeChat Moments still becomes a plain text link in the caption area
  - it does **not** become a Moments card
- Conclusion:
  - under the current domain `zsk.xinyongdai123.com`
  - under the current WeChat environment
  - the pure H5 share-card route is not viable

## What Was Already Built

- Added dedicated H5 share page resources:
  - `public/share.html`
  - `public/share.js`
- Added backend route and SSR meta output for `/share/{slug}`:
  - `title`
  - `description`
  - `og:title`
  - `og:description`
  - `og:image`
  - `og:url`
  - `canonical`
- Verified the share page HTML metadata can be returned correctly online.
- Also tried a gated-access share-page design before:
  - detail page issued a short-lived token
  - direct `/share/{slug}` access could be restricted
- That idea was later judged unnecessary and potentially harmful to WeChat recognition.
- Even after loosening that logic, the final Moments result was still only a plain text link.

## Strategy Decision

- Stop investing in the pure H5 Moments-card route.
- Switch the main solution to the existing mini-program share-shell route.
- New intended flow:
  1. H5 detail page no longer tries to produce a Moments H5 card
  2. H5 sends user into mini-program share shell
  3. user shares from mini-program
  4. Moments card is carried by mini-program, not H5

## Existing Mini-Program Share-Shell Capability

- Backend already returns valid `miniProgramLaunchUrl` for content.

# 2026-04-06 Growth Admin Update

## Completed

- Updated the admin growth-management detail panel so each project can be edited directly after clicking "进入详情".
- Added editable fields for:
  - project name
  - amount
  - details
  - status
  - manual progress percentage input
- Changed project progress editing from display-only preview to real form submission.
- Connected the detail form to the existing backend update API:
  - `PUT /api/growth/projects/:projectId`
- Added progress validation on the admin page:
  - accepts manual numeric input from `0` to `100`
  - clamps out-of-range values back into `0-100`
- Added progress UI sync:
  - progress bar updates immediately while typing
  - percentage text updates immediately while typing
  - when progress reaches `100`, status auto-switches to `completed`
  - when admin manually selects `completed`, progress auto-fills to `100`

## Files Changed

- `public/admin.js`
- `public/styles.css`

## Result

- In the admin growth center, each customer project can now be opened in detail, modified, and saved directly.
- Admin can manually enter the exact progress percentage instead of relying only on static display or review-only flow.

## Verification

- Ran syntax check:
  - `node --check public/admin.js`
- Confirmed the new edit form selectors and styles were added for the growth project detail cards.
- We already verified the API can return real `https://wxaurl.cn/...` launch URLs.
- Relevant existing files:
  - `app.py`
  - `public/detail.js`
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.js`
  - `wechat-miniprogram/pages/share/index.js`

## Local Code Already Prepared But Not Fully Deployed

- Local `public/detail.js` has already been changed to make the detail-page primary action go to mini-program share shell.
- Local logic now does this:
  - main CTA text becomes `打开小程序分享版`
  - click goes directly to `miniProgramLaunchUrl`
  - no longer routes user to H5 `/share/{slug}`
  - analytics source changed to `mini-program-share-entry`
- Local syntax check already passed:
  - `node --check public/detail.js`

## Current Online Status

- Online site: `https://zsk.xinyongdai123.com`
- Server: `198.18.0.61`
- Directory: `/opt/zsk-h5`
- Service: `zsk-h5.service`
- `/api/health` confirms runtime is Python
- Online content API still returns:
  - `miniProgramLaunchUrl`
  - `sharePublicLink`
  - `shareEntryLink`
- The final mini-program-CTA version of `public/detail.js` has **not** been confirmed deployed online yet.

## Main Blocker Right Now

- The main blocker is server-side SSH/SCP connectivity, not code logic.
- Private key in use:
  - `C:\Users\Administrator\Documents\zhishiku\.codex-keys\zsk_deploy_key`
- That private key was verified to match the provided public key:
  - `ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIPqTc2X8XG5S6LNcphBjuuZUSvGimU0fbc33L/RYBQzB codex-zsk-deploy-2026-03-14`
- Actual connection behavior:
  - TCP connection to `198.18.0.61:22` succeeds
  - server closes connection before auth proceeds
  - observed error:
    - `kex_exchange_identification: Connection closed by remote host`
- This suggests server-side SSH restriction or instability, such as:
  - `sshd` issue
  - Fail2Ban / firewall blocking
  - SSH rate limiting like `MaxStartups`
  - another security layer in front of port 22

## Exact Next Steps For A New Thread

1. Restore SSH/SCP access to `198.18.0.61`.
2. Upload the local latest `public/detail.js` to:
   - remote target: `/opt/zsk-h5/public/detail.js`
3. If needed, also sync related files from this round:
   - `app.py`
   - `public/detail.html`
   - `public/share.html`
   - `public/share.js`
   - `public/styles.css`
4. After upload, verify the detail page CTA now opens mini-program share shell instead of H5 share page.
5. Then test in WeChat:
   - open `/content/{slug}`
   - tap `打开小程序分享版`
   - enter mini-program share shell
   - share to Moments from mini-program
6. If the mini-program route works, formally abandon the H5 share-card route.

## Reusable Test Content

- Current online test slug:
  - `home-loan-categories-bank-house-mortgage-ceshi`
- Test detail page:
  - `https://zsk.xinyongdai123.com/content/home-loan-categories-bank-house-mortgage-ceshi`
- Test content API:
  - `https://zsk.xinyongdai123.com/api/content/home-loan-categories-bank-house-mortgage-ceshi`

## Short Decision Summary

- Pure H5 Moments-card plan: validated and failed.
- Next worthwhile direction: mini-program share-shell plan only.

## 2026-04-04 Connectivity Recheck

### What We Re-Verified On 2026-04-04

- Local latest file is still `public/detail.js`.
- Local current behavior is the intended mini-program route:
  - main CTA label is `打开小程序分享版`
  - click target is `miniProgramLaunchUrl`
  - analytics source is `mini-program-share-entry`
- Local syntax check still passes:
  - `node --check public/detail.js`

### Server Connectivity Result

- Re-tested SSH on `2026-04-04` against `198.18.0.61` with:
  - key: `C:\Users\Administrator\Documents\zhishiku\.codex-keys\zsk_deploy_key`
  - command:
    - `ssh -vvv -i .\.codex-keys\zsk_deploy_key -o StrictHostKeyChecking=accept-new -o ConnectTimeout=10 root@198.18.0.61 exit`
- Result is still blocked before authentication:
  - TCP connect to port `22` succeeds
  - remote side closes during key exchange
  - exact error:
    - `kex_exchange_identification: Connection closed by remote host`
- Conclusion:
  - as of `2026-04-04`, SSH/SCP is still unavailable from this machine
  - deployment still cannot proceed through the known SSH path

### Current Online Runtime Status

- Site health is normal:
  - `https://zsk.xinyongdai123.com/api/health` returns `HTTP/1.1 200 OK`
- Content API is normal:
  - `https://zsk.xinyongdai123.com/api/content/home-loan-categories-bank-house-mortgage-ceshi`
  - still returns valid `miniProgramLaunchUrl`
  - still returns `sharePublicLink`
  - still returns `shareEntryLink`

### Important Online Version Check

- Current online detail page HTML still references:
  - `/detail.js?v=20260403d`
- Current online `detail.js` is still the old H5-share-page version:
  - CTA label is `去分享页`
  - click handler still prefers `content.sharePublicLink || content.shareEntryLink`
  - analytics source is still `share-page-entry`
- Therefore:
  - the mini-program-first `public/detail.js` has not been deployed online yet

### Practical Next Step

1. Restore SSH/SCP access to `198.18.0.61`.
2. Upload at minimum:
   - `/opt/zsk-h5/public/detail.js`
3. If cache-busting is needed, also sync the HTML/version reference that serves `detail.js`.
4. Re-verify online detail page CTA after deploy:
   - button text should become `打开小程序分享版`
   - click should go to `miniProgramLaunchUrl`

## 2026-04-04 SSH Root Cause Update

### Root Cause

- The previously recorded server IP `198.18.0.61` is not the current real deployment host for the live site.
- Current production domain resolution on `2026-04-04`:
  - `zsk.xinyongdai123.com -> 198.18.0.76`
- SSH behavior difference:
  - `198.18.0.61:22` accepts TCP, then closes before sending SSH banner
  - `198.18.0.76:22` returns normal OpenSSH banner and completes key exchange
- Therefore the earlier SSH error was caused by targeting the wrong / outdated server IP, not by the deploy key itself.

### Evidence

- `ssh root@198.18.0.61`
  - fails with `kex_exchange_identification: Connection closed by remote host`
  - raw socket read after TCP connect returns empty bytes
- `ssh root@198.18.0.76`
  - remote banner: `OpenSSH_9.6p1 Ubuntu-3ubuntu13.15`
  - deploy key `C:\Users\Administrator\Documents\zhishiku\.codex-keys\zsk_deploy_key` is accepted successfully
- On `198.18.0.76`, verified:
  - host is reachable by SSH
  - `/opt/zsk-h5` exists
  - `zsk-h5.service` is `active`

### Revised Deployment Target

- Real current deploy host:
  - `198.18.0.76`
- SSH login:
  - `ssh -i C:\Users\Administrator\Documents\zhishiku\.codex-keys\zsk_deploy_key root@198.18.0.76`

### Follow-up

- Stop using `198.18.0.61` as the default deployment target unless a separate role for that IP is later confirmed.
- Continue subsequent upload / restart / verification work against `198.18.0.76`.

## 2026-04-04 Deployment Update

### What Was Deployed

- Target host used for deployment:
  - `198.18.0.76`
- Verified SSH login:
  - `root@198.18.0.76`
- Verified runtime status before deploy:
  - `/opt/zsk-h5` exists
  - `zsk-h5.service` is `active`

### Files Updated Online

- Uploaded latest `public/detail.js`
  - this is the mini-program-first version
  - main CTA now goes to `miniProgramLaunchUrl`
  - analytics source is `mini-program-share-entry`
- Uploaded updated `public/detail.html`
  - cache-busting version changed from `20260403d` to `20260404a`

### External Verification

- Online detail HTML now references:
  - `/styles.css?v=20260404a`
  - `/site-meta.js?v=20260404a`
  - `/common.js?v=20260404a`
  - `/detail.js?v=20260404a`
- Online `detail.js?v=20260404a` now contains the new logic:
  - CTA text includes `打开小程序分享版`
  - old `去分享页` logic is gone
  - old `share-page-entry` analytics source is gone

### Operational Note

- No service restart was required for this round because the change was limited to static frontend assets.
- Remaining real-world verification should be done in WeChat on the detail page:
  - `https://zsk.xinyongdai123.com/content/home-loan-categories-bank-house-mortgage-ceshi`

## 2026-04-05 Mini Program Trial Debugging

### What Was Confirmed

- The H5 page was able to launch the mini program successfully.
- However, the launched page initially still showed old test-only modules.
- Root cause was not a single issue; it was a combination of:
  - H5 launch link originally still pointed to `release`
  - the test content had a cached old `miniProgramLaunchUrl`
  - the mini program has more than one share-shell page path in the codebase
  - the developer tool preview homepage was not a reliable indicator of the actual share-shell page used by the H5 launch flow

### Server-Side Trial Switch

- Real deployment host used:
  - `198.18.0.76`
- Updated remote `.env`:
  - `MINI_PROGRAM_ENV_VERSION=trial`
- Cleared cached launch URL for the current test slug in:
  - `/opt/zsk-h5/data/content.json`
- Restarted service:
  - `systemctl restart zsk-h5.service`
- Verified active:
  - `zsk-h5.service` is `active`

### Current Trial Launch State

- The test content API now returns a newly generated trial launch link instead of the previously cached release link.
- Verified current test content API:
  - `https://zsk.xinyongdai123.com/api/content/home-loan-categories-bank-house-mortgage-ceshi`
- At the time of verification, the returned trial URL was:
  - `https://wxaurl.cn/DQiJrg1aqLt`
- Practical implication:
  - when the H5 page calls the mini program now, it should target the trial environment

### Important Mini Program Codebase Finding

- The mini program does not rely on WeChat cloud development for this feature.
- The share shell uses ordinary `wx.request` to fetch content from:
  - `https://zsk.xinyongdai123.com/api/content/{slug}`
- Therefore:
  - not enabling cloud services is **not** the cause of the share-shell issue
- The developer tool timeout was caused by the request layer, not by cloud configuration.

### Request-Layer Optimization Added

- Reworked local mini program utility:
  - `wechat-miniprogram/utils/content.js`
- Added:
  - explicit request timeout
  - relative share image / content link normalization to absolute URLs
  - local fallback content builder
- Goal:
  - even when the developer tool times out on content fetch, the share shell can still render a clean fallback article card for UI verification

### Share-Shell Pages That Must Be Treated As Active

- During debugging, it became clear that the project can land on either of these two mini program pages:
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell`
  - `wechat-miniprogram/pages/share/index`
- The second path (`pages/share/index`) still contained the old validation UI even after the first page had been cleaned.
- Therefore both pages were updated and must continue to be considered part of the active share-shell surface.

### UI Simplification Applied To Both Share-Shell Pages

- Updated files:
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.js`
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.wxml`
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.wxss`
  - `wechat-miniprogram/pages/share/index.js`
  - `wechat-miniprogram/pages/share/index.wxml`
  - `wechat-miniprogram/pages/share/index.wxss`
- Resulting intended UI for both pages:
  - remove all test-only top banners / validation descriptions
  - remove `slug`
  - remove `H5 链接`
  - remove `复制 H5 链接`
  - remove `分享完成后打开 H5 详情页`
  - keep only article title + summary
  - keep only one button:
    - `分享到朋友圈方法`
- The button now shows:
  - `点击右上方三个点，再点击“分享到朋友圈”。`

### Final Cleanup Applied

- The article cover image block shown at the top of the shell card was also removed from both pages.
- Current intended minimal shell page should contain only:
  - article title
  - article summary
  - one button for Moments sharing instructions

### Why Developer Tool Still Showed Old Content Earlier

- When the developer tool still displayed the large old validation UI, the most likely explanations were:
  - the tool was running an older uploaded package
  - the tool preview entry was not the same page path as the active H5 launch path
  - only one of the two shell pages had been cleaned, while the other still retained the old modules
- After both shell page paths were aligned, the remaining visible large block was the article cover image area, which was later explicitly removed as well.

### Current Local Source Of Truth

- The current local source in this repo no longer contains the old validation text modules.
- Searching the repo no longer finds strings such as:
  - `只新增一个小程序分享页`
  - `先在当前页分享，不要进入 H5 后再分享`
  - `卡片预览`
  - `H5 链接`
  - `分享完成后打开 H5 详情页`
  - `复制 H5 链接`

### Exact Next Step For A New Thread

1. In WeChat DevTools, recompile the project at:
   - `C:\Users\Administrator\Documents\zhishiku\wechat-miniprogram`
2. Re-upload a new trial / experience build after the latest cleanup.
3. Re-test from the H5 entry:
   - `https://zsk.xinyongdai123.com/content/home-loan-categories-bank-house-mortgage-ceshi`
4. Confirm that the launched mini program shell now shows only:
   - article title
   - article summary
   - `分享到朋友圈方法`
5. If old UI still appears after re-upload:
   - verify the exact page path landed in the mini program
   - confirm the uploaded package is built from this local folder:
     - `C:\Users\Administrator\Documents\zhishiku\wechat-miniprogram`
6. After the trial page is visually confirmed, continue real-device Moments verification and only then proceed to formal release.

## 2026-04-06 Personal Center / Auth / Content Consistency Update

### Personal Center And Account System

- Added a dedicated personal-center entry on the home page and created:
  - `public/profile.html`
  - `public/profile.js`
- Personal center now supports:
  - login
  - logout
  - set password
  - change password with old-password verification
  - forgot-password request placeholder
- Shared frontend auth helpers were added in:
  - `public/common.js`
- Added backend account/session/password APIs in:
  - `app.py`
- Added backend account archive records so each username now has a distinct profile/account archive.
- Added admin-side account archive management view in:
  - `public/admin.html`
  - `public/admin.js`

### Forgot Password Placeholder

- Added backend placeholder API for forgot password:
  - requires userId / phone / code / newPassword / confirmPassword
  - currently returns a “not enabled yet” style response
- Added recording fields for:
  - recovery phone
  - password update time
  - last login time
  - forgot-password request time

### Registration / Edit Profile Fixes

- Fixed garbled text still shown in the registration / profile-edit modal in:
  - `public/common.js`
- Replaced the remaining mojibake strings around:
  - avatar label
  - upload help text
  - upload progress
  - image read failure
  - avatar upload failure
  - submit progress

### Avatar Upload Stability Fix

- Root cause:
  - frontend upload flow was basically correct
  - server-side image decode path was too strict for some mobile / WeChat payload variants
- Updated backend upload logic in:
  - `app.py`
- Added support for:
  - `data:image/...;base64,...` prefixed payloads
  - stripping whitespace/newlines from base64
  - auto-fixing missing base64 padding
  - extra suffix support: `.heic` / `.heif`
- Local verification:
  - `python -m py_compile app.py`
  - sample upload test succeeded with a `data:`-prefixed payload and whitespace inside base64

### Detail Page Cleanup

- Removed the automatically appended “朋友圈小程序卡片测试” block from article detail rendering in:
  - `public/detail.js`
- Verified locally that:
  - `renderMiniProgramBridge` no longer exists
  - the test text no longer exists in the current local file

### Online Sync For Detail Cleanup

- Initial user report showed the test block still existed online.
- Confirmed root cause:
  - local file had been updated
  - online `/public/detail.js` was still the old version
- Real deployment host used:
  - `198.18.0.76`
- Synced the latest `public/detail.js` to:
  - `/opt/zsk-h5/public/detail.js`
- Verified after sync:
  - remote file hash matches local file hash
  - online `https://zsk.xinyongdai123.com/detail.js` no longer contains:
    - `renderMiniProgramBridge`
    - `朋友圈小程序卡片测试`

### H5 Article Content Vs Mini Program Shell Content

- Requirement:
  - ensure the article content shown in frontend H5 and in the mini-program shell is consistent
- Updated:
  - `wechat-miniprogram/utils/content.js`
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.wxml`
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.wxss`
  - `wechat-miniprogram/pages/share/index.wxml`
  - `wechat-miniprogram/pages/share/index.wxss`
- Changes made:
  - mini-program shell now normalizes content directly from the H5 `/api/content/{slug}` response
  - shell now also carries `bodyPreview` derived from H5 `body`
  - removed misleading fixed fallback article copy
  - fallback is now a neutral loading/sync message instead of a hard-coded article
- Goal:
  - when API succeeds, shell card title/summary/body preview aligns with the same article source as H5
  - when API fails temporarily, shell no longer shows another unrelated article

### Validation Performed

- Passed syntax / compile checks:
  - `python -m py_compile app.py`
  - `node --check public/common.js`
  - `node --check public/profile.js`
  - `node --check public/admin.js`
  - `node --check public/detail.js`
  - `node --check wechat-miniprogram/utils/content.js`
  - `node --check wechat-miniprogram/pages/h5-share-shell/h5-share-shell.js`
  - `node --check wechat-miniprogram/pages/share/index.js`

### Frontend Access Hardening And Note Nav Cleanup

- Requirement:
  - remove the frontend entry that could jump directly into backend/admin pages
  - remove all obvious frontend-to-backend direct access paths
  - remove the unexpected `Note` item that appeared in the top nav after entering the achievements page
- Frontend navigation cleanup:
  - removed `/admin.html` entry from user-facing navs in:
    - `public/index.html`
    - `public/achievements.html`
    - `public/profile.html`
    - `public/recharge.html`
    - `public/notes.html`
  - removed `Note` from the achievements-page top nav in:
    - `public/achievements.html`
- Test / debug entry cleanup:
  - removed direct backend-related entries from:
    - `public/frontend-test.html`
    - `public/backend-test.html`
  - removed the `Notes` shortcut from:
    - `public/frontend-test.html`
  - updated frontend test copy so it no longer instructs opening backend pages from frontend QA flow:
    - `public/frontend-test.js`
- Route mapping cleanup:
  - removed the `notes` page mapping from:
    - `public/detail.js`
    - `public/group.js`
    - `public/subsection.js`
  - goal was to prevent `Note` from reappearing through shared page-link helpers even if config or metadata changed later
- Backend hardening:
  - added direct public-path blocking in:
    - `app.py`
  - blocked paths:
    - `admin.html`
    - `backend-test.html`
    - `frontend-test.html`
  - effect:
    - even if someone manually enters those URLs from the public frontend side, the server now returns `404`
- Additional repair during this round:
  - several old mojibake/default-string lines in shared frontend JS files were breaking local syntax checks under the current file encoding
  - replaced only the broken fallback strings with stable ASCII text in:
    - `public/detail.js`
    - `public/group.js`
    - `public/subsection.js`
    - `public/frontend-test.js`
  - no functional product flow was intentionally changed beyond the requested entry removal / nav cleanup / path blocking
- Verification:
  - `python -m py_compile app.py`
  - `node --check public/detail.js`
  - `node --check public/group.js`
  - `node --check public/subsection.js`
  - `node --check public/frontend-test.js`
  - searched repo to confirm no remaining obvious matches for:
    - `/admin.html`
    - `/frontend-test.html`
    - `/backend-test.html`
    - `href="/notes.html">Note</a>`
    - `case "notes"`

### Profile Card Optional Phone / WeChat

- Requirement:
  - when editing the profile card, phone number and WeChat ID should be optional
  - leaving them empty must not block saving changes
- Updated:
  - `public/common.js`
- Changes made:
  - labeled phone and WeChat fields as optional in the registration / profile-edit modal
  - added explicit placeholders to indicate they can be left blank
  - defensively removed any `required` constraint from those two inputs at modal init time
- Expected result:
  - users can save profile changes without filling phone or WeChat

### Username Locked After Registration

- Requirement:
  - once a username has been registered, it must not be editable
  - profile editing should only allow changing other fields
- Updated:
  - `public/common.js`
  - `app.py`
  - `server.js`
- Changes made:
  - registration / profile-edit modal now treats an existing registered username as locked and read-only
  - frontend submit flow now rejects any attempted username change for an already registered profile
  - backend register/update path now rejects renaming an existing registered `userId` even if someone bypasses the UI
- Expected result:
  - first-time registration can still choose a username
  - after registration, editing profile data no longer allows changing the username

### Auth Redirect And Password Entry

- Requirement:
  - every user should have a clear option to set or change a password
  - users who have already logged in should remain in the default logged-in state
  - personal center should provide a logout action
  - unauthenticated visitors entering the site should be redirected to the register/login page
- Updated:
  - `public/common.js`
  - `public/profile.js`
- Changes made:
  - added a shared auth redirect flow that sends unauthenticated users on non-profile pages to `/profile.html`
  - auth redirect now carries the original page URL so login/register can return the user to where they came from
  - registration success and login success now redirect back to the pending page instead of always staying on profile
  - added a direct `设置密码 / 修改密码` shortcut button on the profile card for logged-in users
  - profile page now auto-focuses login or auto-opens registration according to the auth redirect mode
- Expected result:
  - logged-in users keep their session by default
  - users can set or change their password from personal center
  - personal center continues to support logout
  - unauthenticated users are first taken to the register/login page before using other pages

### Online Sync For Profile/Auth Updates

- Sync target:
  - `198.18.0.76`
  - `/opt/zsk-h5`
- Uploaded:
  - `public/common.js`
  - `public/profile.js`
  - `public/profile.html`
  - `app.py`
  - `server.js`
  - `worklog.md`
- Service action:
  - `systemctl restart zsk-h5.service`
- Runtime verification:
  - `zsk-h5.service` is `active`
  - main process is running `python3 /opt/zsk-h5/app.py`
  - remote `python3 -m py_compile /opt/zsk-h5/app.py` passed
- Online verification:
  - `https://zsk.xinyongdai123.com/common.js` contains `redirectAfterAuthSuccess`
  - `https://zsk.xinyongdai123.com/profile.js` contains `redirectAfterAuthSuccess`
  - `https://zsk.xinyongdai123.com/profile.js` contains `data-open-password`
  - remote `worklog.md` now contains:
    - `Profile Card Optional Phone / WeChat`
    - `Username Locked After Registration`
    - `Auth Redirect And Password Entry`
- Note:
  - the remote host does not have `node` installed, so remote JS syntax verification was not run there
  - local `node --check` verification had already passed before sync

### Analytics Percentage And Legacy Section Key Fix

- Requirement:
  - in admin `用户痕迹管理`, the section percentage must be calculated as a section's click count divided by the total click count across all sections
  - the page was showing abnormal values because the backend response structure did not match the admin frontend expectations
  - some historical analytics records used old section key `bank-loans`, which no longer matched the current section config and could not resolve the proper label
- Updated:
  - `app.py`
  - `server.js`
- Changes made:
  - aligned Python `/api/analytics` response fields with the admin frontend renderer, including `clickPercentage`, `sharePercentage`, `totalShares`, user section stats, and article stats
  - updated Python analytics tracking to keep action type, share counters, and article-level stats in a backward-compatible way
  - added legacy section-key alias handling so old records using `bank-loans` now resolve to the current section label `银行信用贷`
  - kept the percentage logic consistent with the requested formula: section clicks divided by total clicks of all sections
- Expected result:
  - admin `用户痕迹管理` now shows normal percentage values instead of abnormal fallback text
  - historical analytics rows with old section keys display the correct Chinese section name
- Verification:
  - `python -m py_compile app.py`
  - `node --check server.js`
  - direct local check of `build_analytics_response()` confirmed returned subsection stats now include:
    - valid `clickPercentage`
    - valid `totalShares`
    - resolved legacy label for `bank-loans`

### Admin Account Archive Password Reset

- Requirement:
  - in the admin page, add an option to change password for a specified user
  - admin should be able to type a username directly, or pick one from the existing account archive list
- Updated:
  - `public/admin.html`
  - `public/admin.js`
  - `server.js`
  - `app.py`
- Changes made:
  - added an admin-side password reset form under account archive management
  - form now supports:
    - username input
    - new password
    - confirm password
    - optional recovery phone
  - added `fill into password reset` action on each account archive card so admins can quickly target an existing user
  - added admin password update API:
    - `POST /api/users/password/admin-set`
  - completed Node-side account archive support so admin page can read account summaries from:
    - `GET /api/users/accounts`
  - kept Python runtime aligned by adding the same admin password reset endpoint there as well
- Expected result:
  - admin can modify a specific user's password directly from backend management
  - account archive list can be used as a shortcut instead of manually retyping usernames

### Admin Login And Trusted IP Bypass

- Requirement:
  - backend management must require an administrator account and password before entering
  - one or more trusted admin IPs should be allowed to enter backend management without login
- Updated:
  - `public/admin.html`
  - `public/admin.js`
  - `server.js`
  - `.env.example`
- Changes made:
  - added admin auth session APIs:
    - `GET /api/admin/session`
    - `POST /api/admin/login`
    - `POST /api/admin/logout`
  - added admin login panel to `admin.html`
  - admin page now checks access state first:
    - trusted IP: enters backend automatically
    - non-trusted IP: must log in with admin username/password
  - added logout button for non-trusted-IP admin sessions
  - added server-side admin session storage and cookie-based session handling in Node runtime
  - added trusted-IP whitelist support through environment variables
  - protected backend management APIs with admin access checks so direct API calls are no longer enough without admin access
- New environment variables:
  - `ADMIN_USERNAME`
  - `ADMIN_PASSWORD`
  - `ADMIN_TRUSTED_IPS`
  - `ADMIN_SESSION_TTL_HOURS`
- Expected result:
  - backend page no longer opens directly for ordinary visitors
  - admins can log in normally from non-whitelisted IPs
  - trusted office/home IPs can bypass login and open backend directly
- Verification:
  - `node --check server.js`
  - `node --check public/admin.js`

## 2026-04-06 Admin Stability / Security / Version 1.2 Update

### Backend Admin Error Response Root Cause

- Problem observed:
  - opening `admin.html` showed plain `Error response`
  - `/api/admin/session` also returned 404 from the Python runtime
- Root cause:
  - real online runtime is `app.py`
  - admin auth routes previously existed only in `server.js`
  - `app.py` also blocked public access to `admin.html`
- Fix applied:
  - added Python admin auth routes:
    - `GET /api/admin/session`
    - `POST /api/admin/login`
    - `POST /api/admin/logout`
  - removed `admin.html` from the blocked-public-path list in Python runtime
  - aligned Python runtime behavior with the existing admin frontend

### Admin Account Configuration

- Updated server-side admin credentials:
  - username: `dai`
  - password: `123456`
- Verification:
  - admin login API accepted the configured credentials
  - admin session API returned authenticated state after login

### Admin Self Password Change

- Requirement:
  - backend should provide a way for the administrator to change their own login password
- Updated:
  - `public/admin.html`
  - `public/admin.js`
  - `app.py`
- Changes made:
  - added dedicated admin self-password form
  - added backend API:
    - `POST /api/admin/password/change`
  - new admin password is now persisted into server `.env`
  - verified by changing the admin password to a temporary value and then changing it back

### Admin View Isolation Fix

- Problem observed:
  - when opening `账号档案管理`, the growth detail module could appear again a short time later
- Root cause:
  - growth detail visibility depended on selected customer state
  - async refresh and growth polling could re-show the panel outside the growth page
- Fix applied:
  - added explicit current-admin-view tracking in `public/admin.js`
  - growth detail panel is now allowed to render only inside `growth-management`
  - growth polling now runs only while the growth page is active
- Expected result:
  - account archive management no longer shows unrelated growth modules after delayed refresh

### Admin Security Panel Separation

- Requirement:
  - `管理员安全设置` should be a standalone backend panel
  - `账号档案管理` should no longer include admin self-password UI
- Updated:
  - `public/admin.html`
- Changes made:
  - added a standalone top-nav item:
    - `管理员安全设置`
  - moved the admin self-password form out of `账号档案管理`
  - placed `管理员安全设置` as the rightmost option in the admin navigation

### Atomic JSON Write Hardening

- Problem observed:
  - backend operations could briefly trigger `502`
  - root cause was `content.json` being read during a non-atomic write window
- Updated:
  - `app.py`
- Fix applied:
  - changed JSON persistence to use temp-file replace instead of direct overwrite
- Expected result:
  - avoids transient `JSONDecodeError` caused by empty/partial file reads during write

### Version Mark

- This round is recorded as:
  - `zhishiku 1.2`
- Version marker updated in:
  - `package.json`
  - `README.md`

## 2026-04-06 Mini Program Share Shell Fix / Version 1.3 Update

### What Was Confirmed

- The live H5 server was already issuing the mini program share entry path:
  - `/pages/h5-share-shell/h5-share-shell`
- The old-shell result in real testing did not come from the current H5 path configuration.
- The remaining mismatch was between:
  - local shell-only project preview
  - real released package in the formal mini program main project

### Server-Side Release Link Fix

- Verified active deploy host:
  - `198.18.0.76`
- Verified active service:
  - `zsk-h5.service`
- Updated remote `.env`:
  - switched `MINI_PROGRAM_ENV_VERSION` from `trial` to `release`
- Updated remote content cache:
  - cleared cached `miniProgramLaunchUrl` values in `/opt/zsk-h5/data/content.json`
- Restarted:
  - `systemctl restart zsk-h5.service`
- Verification:
  - live API now regenerates the release short link for:
    - `home-loan-categories-bank-house-mortgage`

### Formal Mini Program Project Identification

- Confirmed the formal upload project is:
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx`
- Confirmed the shell-only local project is not the formal full upload target:
  - `C:\Users\Administrator\Documents\zhishiku\wechat-miniprogram`
- Reason:
  - the formal AppID `wxc068fe791aa69ee7` is configured in:
    - `golden-wx/project.config.json`

### Root Cause In The Main Mini Program Project

- The formal main mini program project still contained the old share-shell UI in:
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.js`
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.wxml`
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.wxss`
- That old UI matched the previously observed old shell:
  - warning block
  - preview card
  - slug and H5 link metadata
  - copy-H5-link action
  - open-H5-after-share action

### Main Project Fix Applied

- Updated main project files:
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.js`
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.wxml`
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.wxss`
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\utils\h5Share.js`
- Changes made:
  - replaced the old shell UI with the simplified shell UI
  - kept only article-card presentation, status text, and the share-guide button
  - added timeout and fallback content handling for remote H5 content loading
  - preserved the H5 bridge jump flow through `webview-bridge`

### Safe Area Top Spacing Fix

- Problem observed:
  - after confirming the new shell in the formal main project, page content appeared too close to the status area
- Updated:
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.wxss`
- Fix applied:
  - added safe-area-aware top padding
  - added full-page box sizing and page background

### Final Preview / Upload Guidance

- Formal upload path:
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx`
- Recommended local compile target:
  - `pages/h5-share-shell/h5-share-shell?slug=home-loan-categories-bank-house-mortgage`

### Latest Version Mark

- Latest recorded version:
  - `zhishiku 1.3`
- Version marker updated in:
  - `package.json`
  - `README.md`
  - `worklog.md`

## 2026-04-07 Homepage Group Restructure And Moments Upload Panel

### What Was Changed

- Updated homepage group structure so the live order is now:
  - `朋友圈图文`
  - `文章获客`
  - `精选工具`
- Removed `个人中心` from the `文章获客` child list.
- Split `精选工具` back out as a homepage top-level parallel group.
- Renamed the former `成长体系` title to:
  - `积分`

### Data / Runtime Changes Applied

- Updated local config sources:
  - `data/content.json`
  - `server.js`
  - `app.py`
- Added compatibility logic so old existing content records are still routed by `subKey`:
  - `featured-articles` => `article-center`
  - `featured-tools` => `tools-links`
- This was required so older records would still appear in the correct new homepage group without manual data rewrites.

### Production Deployment During This Round

- Verified active deploy host:
  - `198.18.0.76`
- Verified active service:
  - `zsk-h5.service`
- Applied deploys to:
  - `/opt/zsk-h5`
- Remote backups created during this round:
  - `/opt/zsk-h5_backup_20260407_210622_article_marketing`
  - `/opt/zsk-h5_backup_20260407_211234_home_groups`
  - `/opt/zsk-h5_backup_20260407_212313_moments_admin`
  - `/opt/zsk-h5_backup_20260407_212723_moments_admin_sync`

### Production Incident And Fix

- After the homepage grouping change, the frontend showed:
  - `Page load failed`
- Root cause:
  - Python runtime `/api/content` path used `sub_key` before assignment in `app.py`
  - this triggered:
    - `UnboundLocalError: cannot access local variable 'sub_key' where it is not associated with a value`
- Fix applied:
  - reordered `sub_key` parsing before calling the group-normalization helper
- Post-fix verification:
  - `https://zsk.xinyongdai123.com/api/content?page=home` returns `200`
  - `https://zsk.xinyongdai123.com/api/config` returns the new homepage group order and labels

### New Moments Upload Admin Panel

- Added a dedicated backend/admin entry for `朋友圈图文上传`.
- Local files updated:
  - `public/admin.html`
  - `public/admin.js`
  - `public/detail.js`
  - `public/styles.css`
- Live public verification confirmed these assets are now online.

### Moments Upload Behavior Implemented

- New admin panel purpose:
  - publish content only into the `朋友圈图文` board
- Required inputs:
  - copy text
  - one or more images
- Automatic client-side image handling:
  - if a selected image is already `<= 1MB`, it is uploaded unchanged
  - if a selected image is `> 1MB`, it is compressed client-side before upload
  - target is `<= 1MB` per image
- Publish flow:
  - images upload first
  - payload is then saved as a normal content item under:
    - `page=home`
    - `groupKey=article-center`
    - `subKey=featured-articles`
- Stored body format for these special posts:
  - JSON schema marker:
    - `moments-post-v1`
- Detail-page rendering was updated so this body schema displays as:
  - text copy
  - multi-image gallery
  - instead of raw JSON text

### Important Deployment Detail

- The Python server serves static files from:
  - `/opt/zsk-h5/public`
- External verification was done against:
  - `https://zsk.xinyongdai123.com/admin.html`
  - `https://zsk.xinyongdai123.com/admin.js`
  - `https://zsk.xinyongdai123.com/detail.js?v=20260405a`
- Verified live markers:
  - `朋友圈图文上传`
  - `moments-create`
  - `compressImageToLimit`
  - `buildMomentsPayload`
  - `moments-post-v1`

### Current Known State

- Homepage grouping change is live.
- `积分` rename is live.
- Dedicated `朋友圈图文上传` panel is live.
- Moments detail rendering for `moments-post-v1` is live.

### Suggested Next Steps For A New Thread

1. Open live backend page and do one real publish test through:
   - `https://zsk.xinyongdai123.com/admin.html#moments-create`
2. Verify:
   - multiple images can be selected
   - an image already below `1MB` is not recompressed
   - a larger image is compressed and still uploads successfully
3. Publish one sample item and verify the resulting frontend detail page shows:
   - copy text
   - image gallery
   - correct top-level board placement under `朋友圈图文`
4. If needed next, add:
   - image reordering
   - drag-to-delete / reorder UI
   - separate cover-image chooser
   - richer moments text formatting rules

## 2026-04-07 Moments Share Preparation Flow

### What Was Added

- Extended the mini program share shell so `moments-post-v1` content is now recognized as structured Moments material instead of plain body text.
- Added a one-tap preparation action in:
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.js`
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.wxml`
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.wxss`
  - `wechat-miniprogram/utils/content.js`
- The new action now:
  - copies the Moments copywriting into the system clipboard
  - downloads article images from the H5 site
  - saves those images into the system photo album
  - then instructs the user to tap the top-right menu and choose `分享到朋友圈`

### H5 Entry Adjustment

- Updated `public/detail.js` so Moments-post articles now use a more explicit CTA:
  - `打开小程序复制文案和图片`
- This keeps the H5 side honest about platform limits:
  - H5 still cannot directly open the actual Moments publish composer
  - the supported path is now `H5 article -> mini program shell -> copy text + save images -> user taps three dots -> share to Moments`

### Verification

- Passed syntax checks:
  - `node --check public/detail.js`
  - `node --check wechat-miniprogram/pages/h5-share-shell/h5-share-shell.js`
  - `node --check wechat-miniprogram/utils/content.js`

### Remaining Real-Device Validation

- Need to verify on a real WeChat device:
  - first-time album permission request flow
  - multiple images save successfully
  - copied copywriting can be pasted directly into the Moments editor
  - share shell still opens H5 article correctly through `查看原文`

## 2026-04-11 Moments Material Assistant Decision

### Product Decision

- `朋友圈图文` now uses a material-assistant flow, not a link-card sharing flow.
- `文章获客` keeps the existing mini program card sharing flow.
- Reason:
  - WeChat does not provide a standard H5 or mini program API to directly fill the native Moments composer text area and image picker.
  - The supported compliant flow is to prepare materials first, then let the user manually publish a normal Moments post.

### Implemented Behavior

- For `moments-post-v1` content:
  - copy the Moments text to clipboard
  - download and save images to the system album
  - hide the mini program right-top share menu to reduce accidental link-card sharing
  - show explicit instructions to return to WeChat, open `发现 - 朋友圈`, choose saved images, paste text, and publish
- For non-`moments-post-v1` content:
  - preserve the mini program share menu
  - keep the card-sharing guidance for article acquisition content

### Files Updated

- H5 detail guidance:
  - `public/detail.js`
  - `public/detail.html`
  - `public/styles.css`
- Shell prototype project:
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.js`
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.wxml`
  - `wechat-miniprogram/pages/h5-share-shell/h5-share-shell.wxss`
- Formal mini program project:
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.js`
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.wxml`
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.wxss`
  - `C:\Users\Administrator\Documents\jinxiang\golden-wx\utils\h5Share.js`

### Verification

- Passed syntax checks:
  - `node --check public/detail.js`
  - `node --check wechat-miniprogram/pages/h5-share-shell/h5-share-shell.js`
  - `node --check wechat-miniprogram/utils/content.js`
  - `node --check C:\Users\Administrator\Documents\jinxiang\golden-wx\pages\h5-share-shell\h5-share-shell.js`
  - `node --check C:\Users\Administrator\Documents\jinxiang\golden-wx\utils\h5Share.js`
- H5 deployed to production:
  - `https://zsk.xinyongdai123.com/detail.html`
  - static version bumped to `20260411a`

### Mini Program Review Privacy Wording

- When WeChat review asks for the privacy-protection explanation for album write permission, use this wording:
  - `用于用户主动使用“朋友圈素材助手”功能时，将用户选择分享的图文素材图片保存到本机相册，方便用户随后在微信朋友圈发布时选择对应图片。应用不会读取用户相册内容，也不会上传、分析或存储用户本机相册中的其他图片。`
- Shorter fallback wording if the field length is limited:
  - `用于将用户主动选择的朋友圈图文素材保存到本机相册，方便用户随后手动发布朋友圈；不会读取、上传或存储用户相册中的其他图片。`
- Suggested permission purpose/name:
  - `保存朋友圈素材图片`
  - or `朋友圈素材助手保存图片`
