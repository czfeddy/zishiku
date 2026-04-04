# Worklog

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
