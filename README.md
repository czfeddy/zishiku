# zhishiku

一个独立的知识库功能项目，用于承载 H5 内容展示、后台内容管理、微信分享能力，以及与现有微信小程序的跳转衔接。

## 项目定位

这个仓库是一个单独项目，不是 `jinxiang` 整个程序仓库的一部分，也不是它的镜像。

- `jinxiang` 是另一套完整项目
- 当前仓库只借用了其中一部分实现思路和运行方式
- 当前仓库的目标是独立维护“知识库 / 内容分发 / 小程序导流”这项功能

因此，后续代码管理、版本记录、部署说明、问题追踪，都应以本仓库为准单独维护。

## 当前包含内容

- H5 前台页面：位于 `public/`
- 后台管理页面：位于 `public/admin.html` 及相关脚本
- Node 服务端：位于 `server.js`
- Python 服务端实现：位于 `app.py`
- 数据文件：位于 `data/`
- 微信小程序壳：位于 `wechat-miniprogram/`
- 部署文件：`Dockerfile`、`docker-compose.yml`、`Caddyfile`、`DEPLOY.md`

## 本地运行

### Node 版本

```bash
npm install
npm start
```

默认入口为 `server.js`。

### Python 版本

```bash
python app.py
```

## 环境变量

请基于 `.env.example` 新建 `.env`，不要把 `.env` 提交到 GitHub。

主要配置包括：

- 微信公众号 JS-SDK 配置
- 微信支付配置
- 分享域名配置
- 站点名称与默认展示信息

## GitHub 仓库建议

建议新建一个独立仓库，例如：

- `zhishiku`
- `zhishiku-h5`
- `zhishiku-content-site`

不要继续沿用 `jinxiang` 相关仓库名，避免项目边界混淆。
