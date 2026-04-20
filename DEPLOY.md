# 线上部署

这套配置使用 `Docker Compose + Caddy` 启动：
- `app`：Node 服务，提供页面和 `/api/wechat/signature`
- `caddy`：自动申请和续签 HTTPS 证书

## 1. 准备服务器

- 一台公网 Linux 服务器
- 域名已解析到服务器公网 IP
- 开放 `80` 和 `443` 端口
- 安装 Docker 和 Docker Compose

## 2. 配置环境变量

复制 `.env.example` 为 `.env`，至少填写下面这些值：

```env
WECHAT_APP_ID=你的公众号AppID
WECHAT_APP_SECRET=你的公众号AppSecret
WECHAT_REDIS_URL=redis://redis:6379/0
DOMAIN=zsk.xinyongdai123.com
WECHAT_ALLOWED_HOSTS=zsk.xinyongdai123.com
WECHAT_SHARE_ALLOWED_HOSTS=zsk.xinyongdai123.com
DEFAULT_SHARE_IMAGE=https://zsk.xinyongdai123.com/uploads/share-cover.jpg
```

后台管理员登录相关环境变量也建议一起配置：

```env
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请替换成强密码
ADMIN_TRUSTED_IPS=你的常用公网IP
ADMIN_SESSION_TTL_HOURS=12
```

说明：
- `ADMIN_USERNAME` / `ADMIN_PASSWORD` 用于后台管理页面登录
- `ADMIN_TRUSTED_IPS` 支持写一个或多个 IP，使用逗号或空格分隔
- 命中 `ADMIN_TRUSTED_IPS` 的访问请求可直接进入后台，无需再次登录
- 如果服务器前面还有反向代理，请确认应用层拿到的是真实客户端公网 IP

如果你有多个子域名共用同一个公众号 AppID，请把所有实际访问域名都写进 `WECHAT_ALLOWED_HOSTS`，例如：

```env
WECHAT_ALLOWED_HOSTS=a.example.com,b.example.com
WECHAT_SHARE_ALLOWED_HOSTS=a.example.com,b.example.com
```

说明：
- `WECHAT_REDIS_URL` 用来共享 `access_token` 和 `jsapi_ticket`，避免多域名、多实例互相刷新导致签名失效。
- `WECHAT_ALLOWED_HOSTS` 必须和公众号后台的“JS 接口安全域名”保持一致。
- `WECHAT_SHARE_ALLOWED_HOSTS` 用来限制分享出去的链接域名；不填时默认跟随 `WECHAT_ALLOWED_HOSTS`。

如果你还要展示备案号、公司名，也可以一起填写：

```env
SITE_NAME=知识库
SITE_SHORT_NAME=知识库
COMPANY_NAME=
CONTACT_EMAIL=
CONTACT_PHONE=
ICP_NUMBER=
PUBLIC_SECURITY_NUMBER=
PUBLIC_SECURITY_URL=
```

## 3. 上传项目并启动

在服务器项目目录执行：

```bash
docker compose up -d --build
```

启动后访问：

- `https://你的域名/`
- `https://你的域名/MP_verify_TFlOzvr0P0ojM0kj.txt`

## 4. 公众号后台配置

在微信公众平台完成这些配置：

- 获取公众号 `AppID` 和 `AppSecret`
- 配置“JS 接口安全域名”
- 按提示校验 `MP_verify_*.txt` 文件

注意：
- 这里只填主机名，不带 `https://`
- 顶级域名和子域名不是自动互通的，实际访问页面的每个子域名都要单独配置
- 页面必须在微信内置浏览器里通过 `https` 打开
- 微信签名使用的 URL 必须和用户实际打开页面的 URL 完全一致

## 5. 分享图要求

朋友圈分享图必须是外网可访问的绝对地址，建议：

- 先在后台上传一张封面图，得到 `/uploads/...`
- 再把 `.env` 里的 `DEFAULT_SHARE_IMAGE` 设置成 `https://你的域名/uploads/...`

## 6. 用户身份建议

当前项目只接入了微信 JS-SDK 分享，没有接入公众号 OAuth 登录，所以还不会产生 `OpenID/UnionID` 存储问题。

如果后续要接入微信登录，建议直接按下面的字段设计：
- 主键保留站内用户 ID
- 微信侧同时存 `openid`
- 若公众号已绑定开放平台，优先持久化 `unionid`

这样后续跨产品、跨公众号迁移时更容易做用户合并。

## 7. 常见问题

### 提示 `wechat not configured`

说明服务没有读到 `.env` 里的公众号配置：

- 检查 `.env` 是否已填写
- 检查容器是否已重启
- 执行 `docker compose logs app`

### 频繁出现 `invalid signature`

优先检查：

- 多个子域名或多个实例是否共用同一套 Redis
- 是否有其他服务在单独刷新 `access_token`
- 当前页面域名是否包含在 `WECHAT_ALLOWED_HOSTS`
- 当前页面 URL 是否和签名 URL 完全一致

### 朋友圈卡片没有图或被降级

优先检查：

- 是否在微信里打开
- 是否是 `https`
- 分享链接域名是否包含在 `WECHAT_SHARE_ALLOWED_HOSTS`
- 公众号后台是否已配置对应“JS 接口安全域名”
- 默认分享图是否为绝对地址
