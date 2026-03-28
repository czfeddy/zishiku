# 微信小程序分享壳原型

这个目录是给当前 H5 站点配的最小小程序壳，用来承接“分享到朋友圈”的卡片分享能力。

## 现在能做什么

- 在微信开发者工具里直接打开工程，查看分享页卡片样式
- 通过 `slug` 拉取当前 H5 站点里的内容数据
- 预演“小程序卡片 -> 打开 H5 详情页”的路径
- 先验证标题、摘要、头图和跳转逻辑是否符合预期

## 现在还不能完全真机验证的部分

下面这些需要你后续注册并配置正式小程序后才能完整跑通：

- 真机里的“分享到朋友圈”卡片效果
- 小程序 `web-view` 打开正式业务域名
- 小程序后台配置的合法域名、业务域名、服务器域名

## 本地预览

1. 打开微信开发者工具
2. 选择“导入项目”
3. 项目目录选择 `C:\Users\Administrator\Documents\zhishiku\wechat-miniprogram`
4. `AppID` 先选择“无 AppID”或测试号
5. 进入后默认会打开分享页

## 默认测试内容

默认会读取：

- 站点：`https://zsk.xinyongdai123.com`
- 内容 slug：`home-loan-categories-bank-house-mortgage`

如果你想换文章，改 [config.js](C:\Users\Administrator\Documents\zhishiku\wechat-miniprogram\config.js) 里的 `defaultContentSlug` 即可。

## 后续注册小程序后要改的地方

1. 把 [project.config.json](C:\Users\Administrator\Documents\zhishiku\wechat-miniprogram\project.config.json) 里的 `appid` 换成真实小程序 AppID
2. 在小程序后台配置：
   - request 合法域名：`https://zsk.xinyongdai123.com`
   - business 业务域名：`https://zsk.xinyongdai123.com`
3. 真机重新测试朋友圈分享

## 方案说明

- 朋友圈分享卡片由小程序承接
- 用户点击卡片后进入小程序分享页
- 分享页再进入 H5 `web-view`，保留你现有会员、名片、收费等能力
