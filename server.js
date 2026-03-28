const express = require("express");
const crypto = require("crypto");
const fs = require("fs");
const https = require("https");
const path = require("path");
const { createClient } = require("redis");
const fsPromises = fs.promises;

function loadDotenv() {
  const envPath = path.join(__dirname, ".env");
  if (!fs.existsSync(envPath)) {
    return;
  }

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  for (const rawLine of lines) {
    const line = String(rawLine || "").trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line
      .slice(separatorIndex + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");

    const current = process.env[key];
    if (key && (!current || !String(current).trim())) {
      process.env[key] = value;
    }
  }
}

loadDotenv();

function normalizeHostname(input) {
  const value = String(input || "").trim().toLowerCase();
  if (!value) {
    return "";
  }

  const withoutProtocol = value.replace(/^https?:\/\//, "");
  return withoutProtocol.split("/")[0].split(":")[0].trim();
}

function parseHostnameList(rawValue, { fallbackHosts = [] } = {}) {
  const hosts = new Set();
  const sources = [rawValue, ...fallbackHosts];
  for (const source of sources) {
    for (const part of String(source || "").split(/[,\s]+/)) {
      const host = normalizeHostname(part);
      if (host) {
        hosts.add(host);
      }
    }
  }
  return hosts;
}

function isLocalHostname(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function assertWechatAllowedUrl(rawUrl, allowedHosts, label) {
  let parsedUrl;
  try {
    parsedUrl = new URL(String(rawUrl || "").trim());
  } catch (error) {
    throw new Error(`${label} must be a valid absolute URL`);
  }

  if (!/^https?:$/.test(parsedUrl.protocol)) {
    throw new Error(`${label} must use http or https`);
  }

  const hostname = normalizeHostname(parsedUrl.hostname);
  if (allowedHosts.size > 0 && !allowedHosts.has(hostname) && !isLocalHostname(hostname)) {
    throw new Error(
      `${label} hostname "${hostname}" is not in WECHAT_ALLOWED_HOSTS/WECHAT_SHARE_ALLOWED_HOSTS`
    );
  }

  parsedUrl.hash = "";
  return parsedUrl.toString();
}

const app = express();
const port = process.env.PORT || 3000;

const publicDir = path.join(__dirname, "public");
const uploadsDir = path.join(publicDir, "uploads");
const detailHtmlTemplate = fs.readFileSync(path.join(publicDir, "detail.html"), "utf8");
const dataDir = path.join(__dirname, "data");
const dataFile = path.join(dataDir, "content.json");
const analyticsFile = path.join(dataDir, "analytics.json");
const shareDebugFile = path.join(dataDir, "share-debug.json");
const maxUploadSize = 5 * 1024 * 1024;
const wechatAppId = String(process.env.WECHAT_APP_ID || "").trim();
const wechatAppSecret = String(process.env.WECHAT_APP_SECRET || "").trim();
const wechatApiHost = "api.weixin.qq.com";
const wechatPayApiHost = "api.mch.weixin.qq.com";
const wechatPayAppId = String(process.env.WECHAT_PAY_APP_ID || wechatAppId || "").trim();
const wechatPayMerchantId = String(process.env.WECHAT_PAY_MCH_ID || "").trim();
const wechatPayMerchantSerialNo = String(process.env.WECHAT_PAY_SERIAL_NO || "").trim();
const wechatPayPrivateKey = loadPemValue(
  process.env.WECHAT_PAY_PRIVATE_KEY,
  process.env.WECHAT_PAY_PRIVATE_KEY_PATH
);
const wechatPayNotifyUrl = String(process.env.WECHAT_PAY_NOTIFY_URL || "").trim();
const domainHost = normalizeHostname(process.env.DOMAIN || "");
const wechatAllowedHosts = parseHostnameList(process.env.WECHAT_ALLOWED_HOSTS || "", {
  fallbackHosts: domainHost ? [domainHost] : []
});
const wechatShareAllowedHosts = parseHostnameList(process.env.WECHAT_SHARE_ALLOWED_HOSTS || "", {
  fallbackHosts: Array.from(wechatAllowedHosts)
});
const wechatRedisUrl = String(process.env.WECHAT_REDIS_URL || "").trim();
const wechatCachePrefix = String(process.env.WECHAT_CACHE_PREFIX || "wechat:jsapi").trim() || "wechat:jsapi";
const siteMeta = {
  siteName: String(process.env.SITE_NAME || "知识库").trim(),
  siteShortName: String(process.env.SITE_SHORT_NAME || process.env.SITE_NAME || "知识库").trim(),
  domain: domainHost,
  icpNumber: String(process.env.ICP_NUMBER || "").trim(),
  publicSecurityNumber: String(process.env.PUBLIC_SECURITY_NUMBER || "").trim(),
  publicSecurityUrl: String(process.env.PUBLIC_SECURITY_URL || "").trim(),
  companyName: String(process.env.COMPANY_NAME || "").trim(),
  contactEmail: String(process.env.CONTACT_EMAIL || "").trim(),
  contactPhone: String(process.env.CONTACT_PHONE || "").trim(),
  defaultShareImage: String(process.env.DEFAULT_SHARE_IMAGE || "").trim(),
  wechatShareAllowedHosts: Array.from(wechatShareAllowedHosts)
};
const wechatTicketCache = {
  accessToken: "",
  accessTokenExpiresAt: 0,
  jsapiTicket: "",
  jsapiTicketExpiresAt: 0
};
let wechatRedisClient = null;
let wechatRedisConnectPromise = null;
let hasLoggedWechatRedisError = false;

function loadPemValue(rawValue, filePath) {
  const inlineValue = String(rawValue || "").trim();
  if (inlineValue) {
    return inlineValue.replace(/\\n/g, "\n");
  }

  const pemPath = String(filePath || "").trim();
  if (!pemPath) {
    return "";
  }

  try {
    return fs.readFileSync(path.resolve(__dirname, pemPath), "utf8").trim();
  } catch (error) {
    console.error(`[wechat-pay] failed to read PEM file ${pemPath}:`, error.message);
    return "";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function getRequestOrigin(req) {
  const forwardedProto = String(req.headers["x-forwarded-proto"] || "").split(",")[0].trim();
  const protocol = forwardedProto || req.protocol || "http";
  return `${protocol}://${req.get("host")}`;
}

function getRequestIp(req) {
  const forwardedFor = String(req.headers["x-forwarded-for"] || "")
    .split(",")[0]
    .trim();
  const candidate =
    forwardedFor ||
    req.headers["x-real-ip"] ||
    req.ip ||
    req.socket?.remoteAddress ||
    "";
  const normalized = String(candidate || "").trim().replace(/^::ffff:/, "");
  return normalized || "127.0.0.1";
}

function isWechatPayConfigured() {
  return Boolean(
    wechatPayAppId &&
      wechatPayMerchantId &&
      wechatPayMerchantSerialNo &&
      wechatPayPrivateKey
  );
}

function getWechatPayNotifyUrl(req) {
  if (wechatPayNotifyUrl) {
    return wechatPayNotifyUrl;
  }

  return `${getRequestOrigin(req)}/api/wechat/pay/notify`;
}

function isWechatBrowserRequest(req) {
  return /micromessenger/i.test(String(req.headers["user-agent"] || ""));
}

function parseCookies(req) {
  const cookieHeader = String(req.headers.cookie || "").trim();
  if (!cookieHeader) {
    return {};
  }

  return cookieHeader.split(/;\s*/).reduce((result, item) => {
    const separatorIndex = item.indexOf("=");
    if (separatorIndex <= 0) {
      return result;
    }

    const key = decodeURIComponent(item.slice(0, separatorIndex).trim());
    const value = decodeURIComponent(item.slice(separatorIndex + 1).trim());
    if (key) {
      result[key] = value;
    }
    return result;
  }, {});
}

function getWechatOpenIdFromRequest(req) {
  return String(parseCookies(req).wechat_openid || "").trim();
}

function toAbsoluteUrl(req, value) {
  const input = String(value || "").trim();
  if (!input) {
    return "";
  }

  try {
    return new URL(input, getRequestOrigin(req)).toString();
  } catch (error) {
    return "";
  }
}

function buildContentShareVersion(content) {
  const value =
    String(content?.updatedAt || "").trim() ||
    String(content?.createdAt || "").trim() ||
    String(content?.shareImageUrl || "").trim() ||
    String(content?.title || "").trim();

  return value ? encodeURIComponent(value) : "";
}

function buildContentSharePath(content) {
  const slug = encodeURIComponent(String(content?.slug || "").trim());
  if (!slug) {
    return "";
  }

  const shareVersion = buildContentShareVersion(content);
  return shareVersion ? `/content/${slug}?sharev=${shareVersion}` : `/content/${slug}`;
}

function buildContentPageMeta(req, content) {
  const title = String(content?.title || "").trim() || siteMeta.siteName;
  const siteName = String(siteMeta.siteName || "知识库").trim();
  const pageTitle = title && siteName ? `${title} - ${siteName}` : title || siteName;
  const description =
    stripHtml(content?.summary) ||
    stripHtml(content?.body).slice(0, 120) ||
    `${title || siteName}，来自${siteName}`;
  const url = toAbsoluteUrl(req, req.originalUrl || buildContentSharePath(content));
  const image = toAbsoluteUrl(req, content?.shareImageUrl || siteMeta.defaultShareImage);

  return {
    title,
    pageTitle,
    description,
    url,
    image,
    siteName
  };
}

function renderContentDetailHtml(req, content) {
  const meta = buildContentPageMeta(req, content);
  const metaTags = [
    `<meta name="description" content="${escapeHtml(meta.description)}" />`,
    `<meta property="og:type" content="article" />`,
    `<meta property="og:title" content="${escapeHtml(meta.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(meta.description)}" />`,
    meta.url ? `<meta property="og:url" content="${escapeHtml(meta.url)}" />` : "",
    meta.image ? `<meta property="og:image" content="${escapeHtml(meta.image)}" />` : "",
    `<meta property="og:site_name" content="${escapeHtml(meta.siteName)}" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(meta.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(meta.description)}" />`,
    meta.image ? `<meta name="twitter:image" content="${escapeHtml(meta.image)}" />` : ""
  ]
    .filter(Boolean)
    .join("\n    ");

  return detailHtmlTemplate
    .replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(meta.pageTitle)}</title>`)
    .replace("</head>", `    ${metaTags}\n  </head>`);
}

async function getWechatRedisClient() {
  if (!wechatRedisUrl) {
    return null;
  }

  if (wechatRedisClient?.isOpen) {
    return wechatRedisClient;
  }

  if (wechatRedisConnectPromise) {
    return wechatRedisConnectPromise;
  }

  wechatRedisClient = createClient({ url: wechatRedisUrl });
  wechatRedisClient.on("error", (error) => {
    if (!hasLoggedWechatRedisError) {
      hasLoggedWechatRedisError = true;
      console.error("[wechat] redis unavailable, falling back to in-memory cache:", error.message);
    }
  });

  wechatRedisConnectPromise = wechatRedisClient
    .connect()
    .then(() => {
      hasLoggedWechatRedisError = false;
      return wechatRedisClient;
    })
    .catch((error) => {
      console.error("[wechat] redis connect failed, falling back to in-memory cache:", error.message);
      wechatRedisClient = null;
      return null;
    })
    .finally(() => {
      wechatRedisConnectPromise = null;
    });

  return wechatRedisConnectPromise;
}

function getWechatCacheKey(name) {
  return `${wechatCachePrefix}:${wechatAppId}:${name}`;
}

async function getSharedWechatCacheValue(name) {
  const client = await getWechatRedisClient();
  if (!client) {
    return "";
  }

  try {
    return String((await client.get(getWechatCacheKey(name))) || "").trim();
  } catch (error) {
    console.error(`[wechat] failed to read redis key ${name}:`, error.message);
    return "";
  }
}

async function setSharedWechatCacheValue(name, value, ttlSeconds) {
  const client = await getWechatRedisClient();
  if (!client) {
    return;
  }

  try {
    await client.set(getWechatCacheKey(name), value, {
      EX: Math.max(Number(ttlSeconds) || 0, 60)
    });
  } catch (error) {
    console.error(`[wechat] failed to write redis key ${name}:`, error.message);
  }
}

async function acquireWechatLock(name, ttlSeconds = 15) {
  const client = await getWechatRedisClient();
  if (!client) {
    return null;
  }

  const token = crypto.randomBytes(12).toString("hex");
  const key = getWechatCacheKey(`lock:${name}`);
  try {
    const result = await client.set(key, token, {
      NX: true,
      EX: ttlSeconds
    });
    return result === "OK" ? { client, key, token } : null;
  } catch (error) {
    console.error(`[wechat] failed to acquire redis lock ${name}:`, error.message);
    return null;
  }
}

async function releaseWechatLock(lock) {
  if (!lock?.client || !lock?.key || !lock?.token) {
    return;
  }

  try {
    await lock.client.eval(
      'if redis.call("GET", KEYS[1]) == ARGV[1] then return redis.call("DEL", KEYS[1]) else return 0 end',
      {
        keys: [lock.key],
        arguments: [lock.token]
      }
    );
  } catch (error) {
    console.error("[wechat] failed to release redis lock:", error.message);
  }
}

async function waitForSharedWechatCacheValue(name, timeoutMs = 4000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await getSharedWechatCacheValue(name);
    if (value) {
      return value;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  return "";
}

const loanSubsections = [
  { key: "bank-house-mortgage", label: "银行房产抵押" },
  { key: "bank-credit-loan", label: "银行信用贷" },
  { key: "private-house-mortgage", label: "民间房产抵押" },
  { key: "redeem-bridge-funding", label: "赎楼垫资" },
  { key: "car-loan", label: "车贷" }
];
const toolSubsections = [{ key: "featured-tools", label: "精选工具" }];

const growthLevelTiers = [
  {
    key: "bronze",
    title: "青铜",
    minCompletedTasks: 0,
    color: "#b87333",
    accentColor: "#7c4a1d",
    glowColor: "rgba(184, 115, 51, 0.28)",
    icon: "◆"
  },
  {
    key: "silver",
    title: "白银",
    minCompletedTasks: 2,
    color: "#c0c7d1",
    accentColor: "#5b6470",
    glowColor: "rgba(192, 199, 209, 0.32)",
    icon: "◇"
  },
  {
    key: "gold",
    title: "黄金",
    minCompletedTasks: 5,
    color: "#f4c542",
    accentColor: "#8a5b00",
    glowColor: "rgba(244, 197, 66, 0.3)",
    icon: "★"
  },
  {
    key: "platinum",
    title: "铂金",
    minCompletedTasks: 20,
    color: "#74d2c9",
    accentColor: "#0f5f67",
    glowColor: "rgba(116, 210, 201, 0.3)",
    icon: "✦"
  },
  {
    key: "diamond",
    title: "钻石",
    minCompletedTasks: 50,
    color: "#60a5fa",
    accentColor: "#1d4ed8",
    glowColor: "rgba(96, 165, 250, 0.3)",
    icon: "⬟"
  },
  {
    key: "starlight",
    title: "星耀",
    minCompletedTasks: 100,
    color: "#8b5cf6",
    accentColor: "#5b21b6",
    glowColor: "rgba(139, 92, 246, 0.3)",
    icon: "✶"
  },
  {
    key: "king",
    title: "王者",
    minCompletedTasks: 500,
    color: "#ef4444",
    accentColor: "#991b1b",
    glowColor: "rgba(239, 68, 68, 0.32)",
    icon: "♛"
  }
];

const defaultData = {
  sections: {
    home: {
      label: "首页",
      groups: [
        {
          key: "loan-categories",
          label: "贷款种类",
          children: loanSubsections
        },
        {
          key: "tools-links",
          label: "工具链接",
          children: toolSubsections
        },
        {
          key: "article-center",
          label: "文章",
          adminOnly: true,
          children: [{ key: "featured-articles", label: "精选文章" }]
        }
      ]
    },
    recharge: {
      label: "资源中心",
      groups: [
        {
          key: "plans",
          label: "充值套餐",
          children: [
            { key: "monthly", label: "月度套餐" },
            { key: "quarterly", label: "季度套餐" }
          ]
        }
      ]
    },
    achievements: {
      label: "成长体系",
      groups: [
        {
          key: "medals",
          label: "勋章体系",
          children: [
            { key: "growth", label: "成长勋章" },
            { key: "sales", label: "业绩勋章" }
          ]
        }
      ]
    }
  },
  contents: [],
  notes: [],
  userProfiles: {},
  vipUsers: {},
  userNotifications: {},
  rechargeOrders: [],
  growthCustomers: []
};

const defaultAnalytics = {
  users: {},
  events: []
};

function ensureJsonFile(filePath, fallback) {
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
    return;
  }

  try {
    JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), "utf8");
  }
}

function ensureDataFiles() {
  ensureJsonFile(dataFile, defaultData);
  ensureJsonFile(analyticsFile, defaultAnalytics);
  ensureJsonFile(shareDebugFile, { events: [] });
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }
}

function readJson(filePath) {
  ensureDataFiles();
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
}

function readShareDebug() {
  return readJson(shareDebugFile);
}

function writeShareDebug(data) {
  writeJson(shareDebugFile, data);
}

function readData() {
  const data = readJson(dataFile);
  const defaultSections = defaultData.sections || {};
  const currentSections = data.sections && typeof data.sections === "object" ? data.sections : {};

  Object.entries(defaultSections).forEach(([pageKey, pageValue]) => {
    const currentPage = currentSections[pageKey] && typeof currentSections[pageKey] === "object" ? currentSections[pageKey] : {};
    const currentGroups = Array.isArray(currentPage.groups) ? currentPage.groups : [];
    const mergedGroups = [...currentGroups];

    for (const defaultGroup of pageValue.groups || []) {
      const index = mergedGroups.findIndex((item) => item.key === defaultGroup.key);
      if (index === -1) {
        mergedGroups.push(defaultGroup);
        continue;
      }

      const existingGroup = mergedGroups[index];
      const existingChildren = Array.isArray(existingGroup.children) ? existingGroup.children : [];
      const mergedChildren = [...existingChildren];
      for (const defaultChild of defaultGroup.children || []) {
        if (!mergedChildren.some((item) => item.key === defaultChild.key)) {
          mergedChildren.push(defaultChild);
        }
      }

      mergedGroups[index] = {
        ...defaultGroup,
        ...existingGroup,
        children: mergedChildren
      };
    }

    currentSections[pageKey] = {
      ...pageValue,
      ...currentPage,
      groups: mergedGroups
    };
  });

  data.sections = currentSections;
  if (!Array.isArray(data.contents)) {
    data.contents = [];
  }
  if (!Array.isArray(data.notes)) {
    data.notes = [];
  }
  if (!data.userProfiles || typeof data.userProfiles !== "object" || Array.isArray(data.userProfiles)) {
    data.userProfiles = {};
  }
  if (!data.vipUsers || typeof data.vipUsers !== "object" || Array.isArray(data.vipUsers)) {
    data.vipUsers = {};
  }
  if (!data.userNotifications || typeof data.userNotifications !== "object" || Array.isArray(data.userNotifications)) {
    data.userNotifications = {};
  }
  if (!Array.isArray(data.rechargeOrders)) {
    data.rechargeOrders = [];
  }
  if (!Array.isArray(data.growthCustomers)) {
    data.growthCustomers = [];
  }
  return data;
}

function writeData(data) {
  writeJson(dataFile, data);
}

function readAnalytics() {
  return readJson(analyticsFile);
}

function writeAnalytics(data) {
  writeJson(analyticsFile, data);
}

function getPlanCatalog() {
  return {
    monthly: {
      key: "monthly",
      label: "月度 VIP",
      price: 30,
      durationDays: 30,
      description: "30 元 / 月，开通后成为 VIP 用户。"
    },
    quarterly: {
      key: "quarterly",
      label: "季度 VIP",
      price: 88,
      durationDays: 90,
      description: "88 元 / 季度，开通后成为 VIP 用户。"
    }
  };
}

function normalizeVipUserRecord(userId, record = {}) {
  return {
    userId: String(userId || record.userId || "").trim(),
    totalRechargeAmount: Number(record.totalRechargeAmount || 0),
    totalRechargeCount: Number(record.totalRechargeCount || 0),
    totalGrantedDays: Number(record.totalGrantedDays || 0),
    vipGrantedByAdminDays: Number(record.vipGrantedByAdminDays || 0),
    vipStartAt: String(record.vipStartAt || "").trim(),
    vipExpiresAt: String(record.vipExpiresAt || "").trim(),
    lastRechargeAt: String(record.lastRechargeAt || "").trim(),
    updatedAt: String(record.updatedAt || "").trim(),
    notes: String(record.notes || "").trim()
  };
}

function normalizeUserProfileRecord(userId, record = {}) {
  return {
    userId: String(userId || record.userId || "").trim(),
    avatarUrl: String(record.avatarUrl || "").trim(),
    name: String(record.name || "").trim(),
    title: String(record.title || "").trim(),
    introduction: String(record.introduction || record.bio || "").trim(),
    phone: String(record.phone || "").trim(),
    wechat: String(record.wechat || "").trim(),
    createdAt: String(record.createdAt || "").trim(),
    updatedAt: String(record.updatedAt || "").trim()
  };
}

function getUserProfile(data, userId) {
  if (!userId) {
    return null;
  }

  const record = data.userProfiles?.[userId];
  if (!record) {
    return null;
  }

  return normalizeUserProfileRecord(userId, record);
}

function sanitizeUserProfilePayload(body) {
  return {
    previousUserId: String(body.previousUserId || "").trim(),
    userId: String(body.userId || "").trim(),
    avatarUrl: String(body.avatarUrl || "").trim(),
    name: String(body.name || "").trim(),
    title: String(body.title || "").trim(),
    introduction: String(body.introduction || body.bio || "").trim(),
    phone: String(body.phone || "").trim(),
    wechat: String(body.wechat || "").trim()
  };
}

function validateUserProfilePayload(payload) {
  if (!payload.userId) {
    return "userId required";
  }
  if (!payload.avatarUrl) {
    return "avatarUrl required";
  }
  if (!payload.phone) {
    return "phone required";
  }
  return "";
}

function mergeAnalyticsUsers(target = {}, source = {}) {
  const base = normalizeAnalyticsUser(target);
  const incoming = normalizeAnalyticsUser(source);
  const mergedSections = { ...base.sections };

  Object.entries(incoming.sections || {}).forEach(([key, value]) => {
    if (!mergedSections[key]) {
      mergedSections[key] = value;
      return;
    }

    const currentSection = normalizeSectionStats(mergedSections[key]);
    const nextSection = normalizeSectionStats(value);
    const mergedArticles = { ...currentSection.articles };

    Object.entries(nextSection.articles || {}).forEach(([articleKey, articleValue]) => {
      if (!mergedArticles[articleKey]) {
        mergedArticles[articleKey] = articleValue;
        return;
      }

      const currentArticle = normalizeArticleStats(mergedArticles[articleKey]);
      const nextArticle = normalizeArticleStats(articleValue);
      mergedArticles[articleKey] = {
        ...currentArticle,
        contentId: currentArticle.contentId || nextArticle.contentId,
        contentSlug: currentArticle.contentSlug || nextArticle.contentSlug,
        contentTitle: currentArticle.contentTitle || nextArticle.contentTitle,
        clickCount: currentArticle.clickCount + nextArticle.clickCount,
        shareCount: currentArticle.shareCount + nextArticle.shareCount,
        firstClickedAt:
          [currentArticle.firstClickedAt, nextArticle.firstClickedAt].filter(Boolean).sort()[0] || "",
        lastClickedAt:
          [currentArticle.lastClickedAt, nextArticle.lastClickedAt].filter(Boolean).sort().slice(-1)[0] || "",
        firstSharedAt:
          [currentArticle.firstSharedAt, nextArticle.firstSharedAt].filter(Boolean).sort()[0] || "",
        lastSharedAt:
          [currentArticle.lastSharedAt, nextArticle.lastSharedAt].filter(Boolean).sort().slice(-1)[0] || ""
      };
    });

    mergedSections[key] = {
      ...currentSection,
      page: currentSection.page || nextSection.page,
      groupKey: currentSection.groupKey || nextSection.groupKey,
      subKey: currentSection.subKey || nextSection.subKey,
      clickCount: currentSection.clickCount + nextSection.clickCount,
      shareCount: currentSection.shareCount + nextSection.shareCount,
      firstClickedAt:
        [currentSection.firstClickedAt, nextSection.firstClickedAt].filter(Boolean).sort()[0] || "",
      lastClickedAt:
        [currentSection.lastClickedAt, nextSection.lastClickedAt].filter(Boolean).sort().slice(-1)[0] || "",
      firstSharedAt:
        [currentSection.firstSharedAt, nextSection.firstSharedAt].filter(Boolean).sort()[0] || "",
      lastSharedAt:
        [currentSection.lastSharedAt, nextSection.lastSharedAt].filter(Boolean).sort().slice(-1)[0] || "",
      recentContentTitle: nextSection.recentContentTitle || currentSection.recentContentTitle,
      recentContentSlug: nextSection.recentContentSlug || currentSection.recentContentSlug,
      articles: mergedArticles
    };
  });

  return {
    ...base,
    userId: incoming.userId || base.userId,
    totalClicks: base.totalClicks + incoming.totalClicks,
    totalShares: base.totalShares + incoming.totalShares,
    firstSeenAt: [base.firstSeenAt, incoming.firstSeenAt].filter(Boolean).sort()[0] || "",
    lastActiveAt: [base.lastActiveAt, incoming.lastActiveAt].filter(Boolean).sort().slice(-1)[0] || "",
    sections: mergedSections
  };
}

function migrateUserIdentity(data, analytics, previousUserId, nextUserId) {
  const oldUserId = String(previousUserId || "").trim();
  const newUserId = String(nextUserId || "").trim();
  if (!oldUserId || !newUserId || oldUserId === newUserId) {
    return;
  }

  if (data.userProfiles?.[oldUserId]) {
    const existingProfile = data.userProfiles[newUserId] || {};
    data.userProfiles[newUserId] = {
      ...data.userProfiles[oldUserId],
      ...existingProfile,
      userId: newUserId
    };
    delete data.userProfiles[oldUserId];
  }

  if (data.vipUsers?.[oldUserId]) {
    const currentRecord = normalizeVipUserRecord(oldUserId, data.vipUsers[oldUserId]);
    const existingRecord = data.vipUsers[newUserId]
      ? normalizeVipUserRecord(newUserId, data.vipUsers[newUserId])
      : null;
    data.vipUsers[newUserId] = {
      ...(existingRecord || currentRecord),
      ...(existingRecord
        ? {
            totalRechargeAmount: existingRecord.totalRechargeAmount + currentRecord.totalRechargeAmount,
            totalRechargeCount: existingRecord.totalRechargeCount + currentRecord.totalRechargeCount,
            totalGrantedDays: existingRecord.totalGrantedDays + currentRecord.totalGrantedDays,
            vipGrantedByAdminDays: existingRecord.vipGrantedByAdminDays + currentRecord.vipGrantedByAdminDays,
            vipStartAt:
              [existingRecord.vipStartAt, currentRecord.vipStartAt].filter(Boolean).sort()[0] || "",
            vipExpiresAt:
              [existingRecord.vipExpiresAt, currentRecord.vipExpiresAt].filter(Boolean).sort().slice(-1)[0] || "",
            lastRechargeAt:
              [existingRecord.lastRechargeAt, currentRecord.lastRechargeAt].filter(Boolean).sort().slice(-1)[0] || "",
            updatedAt:
              [existingRecord.updatedAt, currentRecord.updatedAt].filter(Boolean).sort().slice(-1)[0] || "",
            notes: [existingRecord.notes, currentRecord.notes].filter(Boolean).join(" / ")
          }
        : {}),
      userId: newUserId
    };
    delete data.vipUsers[oldUserId];
  }

  if (data.userNotifications?.[oldUserId]) {
    const existingNotifications = Array.isArray(data.userNotifications[newUserId]) ? data.userNotifications[newUserId] : [];
    const currentNotifications = Array.isArray(data.userNotifications[oldUserId]) ? data.userNotifications[oldUserId] : [];
    data.userNotifications[newUserId] = [...currentNotifications, ...existingNotifications]
      .map(normalizeUserNotification)
      .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
      .slice(0, 100);
    delete data.userNotifications[oldUserId];
  }

  if (Array.isArray(data.growthCustomers)) {
    data.growthCustomers = data.growthCustomers.map((item) =>
      getGrowthCustomerOwnerUserId(item) === oldUserId
        ? {
            ...item,
            ownerUserId: newUserId,
            updatedAt: new Date().toISOString()
          }
        : item
    );
  }

  if (Array.isArray(data.rechargeOrders)) {
    data.rechargeOrders = data.rechargeOrders.map((item) =>
      item.userId === oldUserId ? { ...item, userId: newUserId, updatedAt: new Date().toISOString() } : item
    );
  }

  const normalizedAnalytics = normalizeAnalyticsData(analytics);
  if (normalizedAnalytics.users[oldUserId]) {
    normalizedAnalytics.users[newUserId] = normalizedAnalytics.users[newUserId]
      ? mergeAnalyticsUsers(normalizedAnalytics.users[newUserId], normalizedAnalytics.users[oldUserId])
      : {
          ...normalizedAnalytics.users[oldUserId],
          userId: newUserId
        };
    delete normalizedAnalytics.users[oldUserId];
  }

  normalizedAnalytics.events = normalizedAnalytics.events.map((item) =>
    item.userId === oldUserId ? { ...item, userId: newUserId } : item
  );

  analytics.users = normalizedAnalytics.users;
  analytics.events = normalizedAnalytics.events;
}

function isReservedUserId(data, analytics, previousUserId, targetUserId) {
  const oldUserId = String(previousUserId || "").trim();
  const newUserId = String(targetUserId || "").trim();
  if (!newUserId || oldUserId === newUserId) {
    return false;
  }

  return Boolean(data.userProfiles?.[newUserId] || data.vipUsers?.[newUserId] || analytics.users?.[newUserId]);
}

function getVipStatus(record) {
  const now = Date.now();
  const expiresAt = record?.vipExpiresAt ? new Date(record.vipExpiresAt).getTime() : NaN;
  const hasActiveVip = Number.isFinite(expiresAt) && expiresAt > now;
  const remainingMs = hasActiveVip ? expiresAt - now : 0;
  const remainingDays = hasActiveVip ? Number((remainingMs / (1000 * 60 * 60 * 24)).toFixed(2)) : 0;

  return {
    isVip: hasActiveVip,
    remainingDays,
    remainingSeconds: hasActiveVip ? Math.floor(remainingMs / 1000) : 0
  };
}

function buildVipUserSummary(data, userId, record = {}) {
  const normalized = normalizeVipUserRecord(userId, record);
  const vipStatus = getVipStatus(normalized);
  const analytics = normalizeAnalyticsData(readAnalytics());
  const analyticsUser = analytics.users[userId];
  const profile = getUserProfile(data, userId);

  return {
    ...normalized,
    ...vipStatus,
    profile,
    totalClicks: Number(analyticsUser?.totalClicks || 0),
    totalShares: Number(analyticsUser?.totalShares || 0),
    firstSeenAt: analyticsUser?.firstSeenAt || "",
    lastActiveAt: analyticsUser?.lastActiveAt || ""
  };
}

function normalizeUserNotification(notification = {}) {
  return {
    id: String(notification.id || "").trim(),
    type: String(notification.type || "").trim() || "system",
    title: String(notification.title || "").trim(),
    message: String(notification.message || "").trim(),
    createdAt: String(notification.createdAt || "").trim(),
    meta: notification.meta && typeof notification.meta === "object" ? notification.meta : {}
  };
}

function getUserNotifications(data, userId, limit = 20) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    return [];
  }

  const items = Array.isArray(data.userNotifications?.[safeUserId]) ? data.userNotifications[safeUserId] : [];
  return items
    .map(normalizeUserNotification)
    .filter((item) => item.id && item.createdAt)
    .sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")))
    .slice(0, Math.max(1, Number(limit) || 20));
}

function addUserNotification(data, userId, payload = {}) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    return null;
  }

  const notification = normalizeUserNotification({
    id: `notify-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
    createdAt: new Date().toISOString(),
    ...payload
  });

  if (!Array.isArray(data.userNotifications[safeUserId])) {
    data.userNotifications[safeUserId] = [];
  }

  data.userNotifications[safeUserId].unshift(notification);
  data.userNotifications[safeUserId] = data.userNotifications[safeUserId].slice(0, 100);
  return notification;
}

function getGrowthCustomerOwnerUserId(customer = {}) {
  return String(customer.ownerUserId || customer.userId || "").trim();
}

function getGrowthCustomerByOwnerUserId(data, userId) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    return null;
  }

  const customer = (data.growthCustomers || []).find((item) => getGrowthCustomerOwnerUserId(item) === safeUserId);
  return customer ? normalizeGrowthCustomer(customer) : null;
}

function getGrowthCustomersByOwnerUserId(data, userId) {
  const safeUserId = String(userId || "").trim();
  if (!safeUserId) {
    return [];
  }

  return (data.growthCustomers || [])
    .filter((item) => getGrowthCustomerOwnerUserId(item) === safeUserId)
    .map(normalizeGrowthCustomer)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function buildUserState(data, userId) {
  const safeUserId = String(userId || "").trim();
  const growthCustomers = safeUserId ? getGrowthCustomersByOwnerUserId(data, safeUserId) : [];
  return {
    userId: safeUserId,
    profile: safeUserId ? getUserProfile(data, safeUserId) : null,
    vip: safeUserId ? buildVipUserSummary(data, safeUserId, data.vipUsers[safeUserId] || {}) : null,
    growthCustomer: growthCustomers[0] || null,
    growthCustomers,
    notifications: safeUserId ? getUserNotifications(data, safeUserId, 20) : []
  };
}

function getAllVipUserSummaries() {
  const data = readData();
  const analytics = normalizeAnalyticsData(readAnalytics());
  const userIds = new Set([...Object.keys(data.vipUsers || {}), ...Object.keys(analytics.users || {})]);

  return Array.from(userIds)
    .map((userId) => buildVipUserSummary(data, userId, data.vipUsers[userId] || {}))
    .sort((a, b) => {
      if (Number(b.isVip) !== Number(a.isVip)) {
        return Number(b.isVip) - Number(a.isVip);
      }
      if (b.totalRechargeAmount !== a.totalRechargeAmount) {
        return b.totalRechargeAmount - a.totalRechargeAmount;
      }
      return String(b.lastActiveAt || b.updatedAt || "").localeCompare(String(a.lastActiveAt || a.updatedAt || ""));
    });
}

function addVipDuration(record, extraDays, options = {}) {
  const safeDays = Number(extraDays || 0);
  if (!Number.isFinite(safeDays) || safeDays <= 0) {
    throw new Error("vip duration days must be greater than 0");
  }

  const nowIso = new Date().toISOString();
  const nowMs = Date.now();
  const currentExpireMs = record.vipExpiresAt ? new Date(record.vipExpiresAt).getTime() : 0;
  const baseMs = Number.isFinite(currentExpireMs) && currentExpireMs > nowMs ? currentExpireMs : nowMs;
  const nextExpireMs = baseMs + safeDays * 24 * 60 * 60 * 1000;

  if (!record.vipStartAt) {
    record.vipStartAt = nowIso;
  }

  record.vipExpiresAt = new Date(nextExpireMs).toISOString();
  record.totalGrantedDays = Number(record.totalGrantedDays || 0) + safeDays;
  record.updatedAt = nowIso;

  if (options.fromRecharge) {
    record.totalRechargeAmount = Number(record.totalRechargeAmount || 0) + Number(options.amount || 0);
    record.totalRechargeCount = Number(record.totalRechargeCount || 0) + 1;
    record.lastRechargeAt = nowIso;
  }

  if (options.adminGrant) {
    record.vipGrantedByAdminDays = Number(record.vipGrantedByAdminDays || 0) + safeDays;
  }

  if (options.notes) {
    record.notes = String(options.notes).trim();
  }

  return record;
}

function sanitizeVipGrantPayload(body) {
  return {
    userId: String(body.userId || "").trim(),
    days: Number(body.days || 0),
    notes: String(body.notes || "").trim()
  };
}

function sanitizeRechargeOrderPayload(body) {
  return {
    userId: String(body.userId || "").trim(),
    planKey: String(body.planKey || "").trim(),
    paymentMethod: String(body.paymentMethod || "").trim().toLowerCase(),
    paymentChannel: String(body.paymentChannel || "").trim().toLowerCase(),
    returnUrl: String(body.returnUrl || "").trim()
  };
}

function normalizeRechargeOrderRecord(order = {}) {
  return {
    id: String(order.id || "").trim(),
    userId: String(order.userId || "").trim(),
    planKey: String(order.planKey || "").trim(),
    planLabel: String(order.planLabel || "").trim(),
    amount: Number(order.amount || 0),
    durationDays: Number(order.durationDays || 0),
    paymentMethod: String(order.paymentMethod || "").trim().toLowerCase(),
    paymentChannel: String(order.paymentChannel || "").trim().toLowerCase() || "h5",
    status: String(order.status || "").trim() || "pending",
    paymentStatus: String(order.paymentStatus || "").trim() || "pending",
    gateway: String(order.gateway || "").trim(),
    gatewayMessage: String(order.gatewayMessage || "").trim(),
    gatewayTransactionId: String(order.gatewayTransactionId || "").trim(),
    wechatH5Url: String(order.wechatH5Url || "").trim(),
    tradeState: String(order.tradeState || "").trim(),
    tradeStateDesc: String(order.tradeStateDesc || "").trim(),
    paidAt: String(order.paidAt || "").trim(),
    createdAt: String(order.createdAt || "").trim(),
    updatedAt: String(order.updatedAt || "").trim()
  };
}

function findRechargeOrderIndex(data, orderId) {
  return (data.rechargeOrders || []).findIndex((item) => String(item?.id || "").trim() === String(orderId || "").trim());
}

function buildWechatPayAuthorization({ method, requestPath, body = "" }) {
  const nonceStr = crypto.randomBytes(16).toString("hex");
  const timestamp = String(Math.floor(Date.now() / 1000));
  const message = `${method.toUpperCase()}\n${requestPath}\n${timestamp}\n${nonceStr}\n${body}\n`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(message, "utf8"), wechatPayPrivateKey).toString("base64");

  return `WECHATPAY2-SHA256-RSA2048 mchid="${wechatPayMerchantId}",nonce_str="${nonceStr}",timestamp="${timestamp}",serial_no="${wechatPayMerchantSerialNo}",signature="${signature}"`;
}

function callWechatPayApi({ method, requestPath, body = "" }) {
  return new Promise((resolve, reject) => {
    const payload = typeof body === "string" ? body : JSON.stringify(body || {});
    const headers = {
      Accept: "application/json",
      Authorization: buildWechatPayAuthorization({
        method,
        requestPath,
        body: payload
      }),
      "Content-Type": "application/json",
      "User-Agent": "zhishiku-h5/1.0"
    };

    if (payload) {
      headers["Content-Length"] = Buffer.byteLength(payload, "utf8");
    }

    const request = https.request(
      {
        hostname: wechatPayApiHost,
        method: method.toUpperCase(),
        path: requestPath,
        headers
      },
      (response) => {
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let parsed = null;

          if (text) {
            try {
              parsed = JSON.parse(text);
            } catch (error) {
              parsed = null;
            }
          }

          if (response.statusCode >= 200 && response.statusCode < 300) {
            resolve(parsed || {});
            return;
          }

          const error = new Error(
            parsed?.message ||
              parsed?.detail ||
              `wechat pay request failed with status ${response.statusCode}`
          );
          error.statusCode = response.statusCode;
          error.response = parsed || text;
          reject(error);
        });
      }
    );

    request.on("error", reject);

    if (payload) {
      request.write(payload);
    }

    request.end();
  });
}

async function createWechatH5Transaction(req, order) {
  const requestBody = {
    appid: wechatPayAppId,
    mchid: wechatPayMerchantId,
    description: `${siteMeta.siteShortName || siteMeta.siteName || "知识库"} ${order.planLabel}`.trim(),
    out_trade_no: order.id,
    notify_url: getWechatPayNotifyUrl(req),
    amount: {
      total: Math.round(Number(order.amount || 0) * 100),
      currency: "CNY"
    },
    scene_info: {
      payer_client_ip: getRequestIp(req),
      h5_info: {
        type: "Wap",
        app_name: siteMeta.siteShortName || siteMeta.siteName || "知识库",
        app_url: getRequestOrigin(req)
      }
    }
  };

  return callWechatPayApi({
    method: "POST",
    requestPath: "/v3/pay/transactions/h5",
    body: JSON.stringify(requestBody)
  });
}

async function createWechatJsapiTransaction(req, order, openId) {
  const requestBody = {
    appid: wechatPayAppId,
    mchid: wechatPayMerchantId,
    description: `${siteMeta.siteShortName || siteMeta.siteName || "知识库"} ${order.planLabel}`.trim(),
    out_trade_no: order.id,
    notify_url: getWechatPayNotifyUrl(req),
    amount: {
      total: Math.round(Number(order.amount || 0) * 100),
      currency: "CNY"
    },
    payer: {
      openid: openId
    }
  };

  return callWechatPayApi({
    method: "POST",
    requestPath: "/v3/pay/transactions/jsapi",
    body: JSON.stringify(requestBody)
  });
}

function buildWechatJsapiPaySign(prepayId) {
  const timeStamp = String(Math.floor(Date.now() / 1000));
  const nonceStr = crypto.randomBytes(16).toString("hex");
  const packageValue = `prepay_id=${prepayId}`;
  const signMessage = `${wechatPayAppId}\n${timeStamp}\n${nonceStr}\n${packageValue}\n`;
  const paySign = crypto
    .sign("RSA-SHA256", Buffer.from(signMessage, "utf8"), wechatPayPrivateKey)
    .toString("base64");

  return {
    appId: wechatPayAppId,
    timeStamp,
    nonceStr,
    package: packageValue,
    signType: "RSA",
    paySign
  };
}

async function queryWechatTransactionByOutTradeNo(orderId) {
  const requestPath = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(orderId)}?mchid=${encodeURIComponent(
    wechatPayMerchantId
  )}`;
  return callWechatPayApi({
    method: "GET",
    requestPath,
    body: ""
  });
}

function applyRechargeOrderState(data, orderIndex, queryResult = {}) {
  const existing = normalizeRechargeOrderRecord(data.rechargeOrders[orderIndex] || {});
  const next = {
    ...existing,
    tradeState: String(queryResult.trade_state || existing.tradeState || "").trim(),
    tradeStateDesc: String(queryResult.trade_state_desc || existing.tradeStateDesc || "").trim(),
    gatewayTransactionId: String(queryResult.transaction_id || existing.gatewayTransactionId || "").trim(),
    updatedAt: new Date().toISOString()
  };

  if (next.tradeState === "SUCCESS") {
    if (existing.paymentStatus !== "paid") {
      const currentVip = normalizeVipUserRecord(next.userId, data.vipUsers[next.userId] || {});
      const updatedVip = addVipDuration(currentVip, next.durationDays, {
        fromRecharge: true,
        amount: next.amount
      });

      data.vipUsers[next.userId] = updatedVip;
      addUserNotification(data, next.userId, {
        type: "recharge_paid",
        title: "微信支付已完成",
        message: `${next.planLabel} 已开通，VIP 时长已到账。`,
        meta: {
          orderId: next.id,
          durationDays: next.durationDays,
          vipExpiresAt: updatedVip.vipExpiresAt
        }
      });
    }

    next.status = "paid";
    next.paymentStatus = "paid";
    next.gatewayMessage = next.tradeStateDesc || "微信支付成功";
    next.paidAt = String(queryResult.success_time || existing.paidAt || next.updatedAt).trim();
  } else if (["CLOSED", "REVOKED", "PAYERROR"].includes(next.tradeState)) {
    next.status = "closed";
    next.paymentStatus = "closed";
    next.gatewayMessage = next.tradeStateDesc || "订单已关闭";
  } else if (next.tradeState) {
    next.status = "pending";
    next.paymentStatus = "awaiting_payment";
    next.gatewayMessage = next.tradeStateDesc || "等待用户支付";
  }

  data.rechargeOrders[orderIndex] = next;
  return next;
}

function sanitizeGrowthProjectPayload(body) {
  const rawProgress = Number(body.progress);
  const progress = Number.isFinite(rawProgress) ? Math.max(0, Math.min(100, rawProgress)) : 0;
  const statusInput = String(body.status || "").trim().toLowerCase();
  const status = statusInput === "completed" || progress >= 100 ? "completed" : "in_progress";

  return {
    loanProject: String(body.loanProject || body.projectName || "").trim(),
    amount: String(body.amount || "").trim(),
    details: String(body.details || "").trim(),
    progress,
    status
  };
}

function sanitizeGrowthCustomerCreatePayload(body) {
  return {
    ownerUserId: String(body.ownerUserId || body.userId || "").trim(),
    customerName: String(body.customerName || "").trim(),
    avatarUrl: String(body.avatarUrl || "").trim(),
    project: sanitizeGrowthProjectPayload(body)
  };
}

function sanitizeGrowthProjectUpdatePayload(body) {
  const payload = {};

  if (Object.prototype.hasOwnProperty.call(body, "loanProject") || Object.prototype.hasOwnProperty.call(body, "projectName")) {
    payload.loanProject = String(body.loanProject || body.projectName || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(body, "amount")) {
    payload.amount = String(body.amount || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(body, "details")) {
    payload.details = String(body.details || "").trim();
  }
  if (Object.prototype.hasOwnProperty.call(body, "progress")) {
    const progress = Number(body.progress);
    payload.progress = Number.isFinite(progress) ? Math.max(0, Math.min(100, progress)) : 0;
  }
  if (Object.prototype.hasOwnProperty.call(body, "status")) {
    const nextStatus = String(body.status || "").trim().toLowerCase();
    payload.status = nextStatus === "completed" ? "completed" : "in_progress";
  }

  if (payload.status === "completed" && !Object.prototype.hasOwnProperty.call(payload, "progress")) {
    payload.progress = 100;
  }
  if (Object.prototype.hasOwnProperty.call(payload, "progress") && payload.progress >= 100) {
    payload.status = "completed";
  }

  return payload;
}

function sanitizeGrowthChangeRequestPayload(body) {
  return {
    ...sanitizeGrowthProjectUpdatePayload(body),
    requestNote: String(body.requestNote || "").trim()
  };
}

function getAvatarFallback(name = "") {
  const cleanName = String(name || "").trim();
  return cleanName ? cleanName.slice(0, 2) : "客户";
}

function buildAvatarSvg(name = "") {
  const text = getAvatarFallback(name);
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#f97316" />
          <stop offset="100%" stop-color="#2563eb" />
        </linearGradient>
      </defs>
      <rect width="96" height="96" rx="28" fill="url(#g)" />
      <text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-family="Microsoft YaHei, PingFang SC, sans-serif" font-size="30" fill="#ffffff">${text}</text>
    </svg>
  `;

  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
}

function normalizeGrowthProject(project = {}) {
  const progress = Math.max(0, Math.min(100, Number(project.progress || 0)));
  const status = String(project.status || "").trim().toLowerCase() === "completed" || progress >= 100
    ? "completed"
    : "in_progress";
  const changeRequests = Array.isArray(project.changeRequests)
    ? project.changeRequests.map((item) => normalizeGrowthChangeRequest(item))
    : [];

  changeRequests.sort((a, b) => {
    if (a.status !== b.status) {
      return a.status === "pending" ? -1 : 1;
    }
    return String(b.submittedAt || "").localeCompare(String(a.submittedAt || ""));
  });

  return {
    id: String(project.id || "").trim(),
    loanProject: String(project.loanProject || "").trim(),
    amount: String(project.amount || "").trim(),
    details: String(project.details || "").trim(),
    progress,
    status,
    createdAt: String(project.createdAt || "").trim(),
    updatedAt: String(project.updatedAt || "").trim(),
    changeRequests,
    pendingChangeCount: changeRequests.filter((item) => item.status === "pending").length
  };
}

function normalizeGrowthChangeRequest(request = {}) {
  const requestedChanges = request.requestedChanges && typeof request.requestedChanges === "object"
    ? sanitizeGrowthProjectUpdatePayload(request.requestedChanges)
    : {};
  const currentSnapshot = request.currentSnapshot && typeof request.currentSnapshot === "object"
    ? normalizeGrowthProject({
        ...request.currentSnapshot,
        changeRequests: []
      })
    : null;

  return {
    id: String(request.id || "").trim(),
    status: String(request.status || "").trim().toLowerCase() || "pending",
    requestNote: String(request.requestNote || "").trim(),
    replyMessage: String(request.replyMessage || "").trim(),
    submittedAt: String(request.submittedAt || "").trim(),
    reviewedAt: String(request.reviewedAt || "").trim(),
    currentSnapshot,
    requestedChanges
  };
}

function getGrowthLevel(completedCount = 0) {
  const total = Math.max(0, Number(completedCount || 0));
  let currentTier = growthLevelTiers[0];

  for (const tier of growthLevelTiers) {
    if (total >= tier.minCompletedTasks) {
      currentTier = tier;
    } else {
      break;
    }
  }

  const currentIndex = growthLevelTiers.findIndex((item) => item.key === currentTier.key);
  const nextTier = growthLevelTiers[currentIndex + 1] || null;

  return {
    key: currentTier.key,
    title: currentTier.title,
    icon: currentTier.icon,
    minCompletedTasks: currentTier.minCompletedTasks,
    color: currentTier.color,
    accentColor: currentTier.accentColor,
    glowColor: currentTier.glowColor,
    frameName: `${currentTier.title}头像框`,
    nextLevel: nextTier
      ? {
          key: nextTier.key,
          title: nextTier.title,
          minCompletedTasks: nextTier.minCompletedTasks,
          remainingTasks: Math.max(0, nextTier.minCompletedTasks - total)
        }
      : null
  };
}

function normalizeGrowthCustomer(customer = {}) {
  const customerId = String(customer.id || "").trim();
  const ownerUserId = getGrowthCustomerOwnerUserId(customer);
  const customerName = String(customer.customerName || "").trim();
  const avatarUrl = String(customer.avatarUrl || "").trim() || buildAvatarSvg(customerName);
  const projects = Array.isArray(customer.projects) ? customer.projects.map(normalizeGrowthProject) : [];
  const completedCount = projects.filter((item) => item.status === "completed").length;
  const growthLevel = getGrowthLevel(completedCount);
  const pendingChangeCount = projects.reduce((sum, item) => sum + Number(item.pendingChangeCount || 0), 0);
  const reviewNotifications = projects
    .flatMap((project) =>
      (project.changeRequests || [])
        .filter((request) => request.status === "approved" || request.status === "rejected")
        .map((request) => ({
          id: request.id,
          projectId: project.id,
          projectName: project.loanProject,
          status: request.status,
          replyMessage: request.replyMessage,
          reviewedAt: request.reviewedAt,
          submittedAt: request.submittedAt
        }))
    )
    .sort((a, b) => String(b.reviewedAt || "").localeCompare(String(a.reviewedAt || "")));

  projects.sort((a, b) => {
    if (a.pendingChangeCount !== b.pendingChangeCount) {
      return b.pendingChangeCount - a.pendingChangeCount;
    }
    if (a.status !== b.status) {
      return a.status === "in_progress" ? -1 : 1;
    }
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });

  return {
    id: customerId,
    ownerUserId,
    customerName,
    avatarUrl,
    avatarFallback: getAvatarFallback(customerName),
    createdAt: String(customer.createdAt || "").trim(),
    updatedAt: String(customer.updatedAt || "").trim(),
    projects,
    activeProjects: projects.filter((item) => item.status === "in_progress"),
    completedCount,
    growthLevel,
    totalProjects: projects.length,
    pendingChangeCount,
    reviewNotifications
  };
}

function getGrowthCustomers(data) {
  return (data.growthCustomers || [])
    .map(normalizeGrowthCustomer)
    .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")));
}

function findGrowthCustomerIndex(data, customerId) {
  return data.growthCustomers.findIndex((item) => String(item.id || "").trim() === customerId);
}

function findGrowthProject(data, projectId) {
  for (let customerIndex = 0; customerIndex < data.growthCustomers.length; customerIndex += 1) {
    const customer = data.growthCustomers[customerIndex];
    const projectIndex = Array.isArray(customer.projects)
      ? customer.projects.findIndex((item) => String(item.id || "").trim() === projectId)
      : -1;

    if (projectIndex >= 0) {
      return {
        customerIndex,
        projectIndex,
        customer,
        project: customer.projects[projectIndex]
      };
    }
  }

  return null;
}

function findGrowthChangeRequest(data, requestId) {
  for (let customerIndex = 0; customerIndex < data.growthCustomers.length; customerIndex += 1) {
    const customer = data.growthCustomers[customerIndex];
    const projects = Array.isArray(customer.projects) ? customer.projects : [];

    for (let projectIndex = 0; projectIndex < projects.length; projectIndex += 1) {
      const project = projects[projectIndex];
      const requestIndex = Array.isArray(project.changeRequests)
        ? project.changeRequests.findIndex((item) => String(item.id || "").trim() === requestId)
        : -1;

      if (requestIndex >= 0) {
        return {
          customerIndex,
          projectIndex,
          requestIndex,
          customer,
          project,
          request: project.changeRequests[requestIndex]
        };
      }
    }
  }

  return null;
}

function extractRequestedProjectChanges(currentProject, payload) {
  const requestedChanges = {};
  const fields = ["loanProject", "amount", "details", "progress", "status"];

  fields.forEach((field) => {
    if (!Object.prototype.hasOwnProperty.call(payload, field)) {
      return;
    }

    if (payload[field] !== currentProject[field]) {
      requestedChanges[field] = payload[field];
    }
  });

  return requestedChanges;
}

function slugify(input) {
  return (
    String(input)
      .trim()
      .toLowerCase()
      .replace(/[\s_]+/g, "-")
      .replace(/[^a-z0-9\u4e00-\u9fa5-]/g, "")
      .replace(/[\u4e00-\u9fa5]/g, "")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "") || "content"
  );
}

function buildUniqueSlug(data, payload, ignoreId = "") {
  const base = slugify(`${payload.page}-${payload.groupKey}-${payload.subKey}-${payload.title}`);
  let slug = base;
  let counter = 1;

  while (data.contents.some((item) => item.slug === slug && item.id !== ignoreId)) {
    counter += 1;
    slug = `${base}-${counter}`;
  }

  return slug;
}

function resolveSectionMeta(data, page, groupKey, subKey) {
  const pageConfig = data.sections[page];
  if (!pageConfig) {
    return null;
  }

  const group = pageConfig.groups.find((item) => item.key === groupKey);
  if (!group) {
    return null;
  }

  const sub = group.children.find((item) => item.key === subKey);
  if (!sub) {
    return null;
  }

  return {
    pageLabel: pageConfig.label,
    groupLabel: group.label,
    subLabel: sub.label
  };
}

function buildSectionStatKey(page, groupKey, subKey) {
  return `${page}::${groupKey}::${subKey}`;
}

function buildArticleStatKey(contentId, contentSlug) {
  if (contentId) {
    return `id::${contentId}`;
  }
  if (contentSlug) {
    return `slug::${contentSlug}`;
  }
  return "";
}

function sanitizeTrackingPayload(body) {
  return {
    userId: String(body.userId || "").trim(),
    page: String(body.page || "").trim(),
    groupKey: String(body.groupKey || "").trim(),
    subKey: String(body.subKey || "").trim(),
    action: String(body.action || "").trim().toLowerCase(),
    contentId: String(body.contentId || "").trim(),
    contentSlug: String(body.contentSlug || "").trim(),
    contentTitle: String(body.contentTitle || "").trim(),
    source: String(body.source || "content-open").trim()
  };
}

function resolveTrackingAction(payload) {
  if (payload.action === "click" || payload.action === "share") {
    return payload.action;
  }

  const shareSources = new Set(["wechat-share-guide", "share", "forward"]);
  return shareSources.has(payload.source) ? "share" : "click";
}

function normalizeArticleStats(article = {}) {
  return {
    contentId: String(article.contentId || "").trim(),
    contentSlug: String(article.contentSlug || "").trim(),
    contentTitle: String(article.contentTitle || "").trim(),
    clickCount: Number(article.clickCount || 0),
    shareCount: Number(article.shareCount || 0),
    firstClickedAt: article.firstClickedAt || "",
    lastClickedAt: article.lastClickedAt || "",
    firstSharedAt: article.firstSharedAt || "",
    lastSharedAt: article.lastSharedAt || ""
  };
}

function normalizeSectionStats(section = {}) {
  const articles = {};
  Object.entries(section.articles || {}).forEach(([key, value]) => {
    articles[key] = normalizeArticleStats(value);
  });

  return {
    page: String(section.page || "").trim(),
    groupKey: String(section.groupKey || "").trim(),
    subKey: String(section.subKey || "").trim(),
    clickCount: Number(section.clickCount || 0),
    shareCount: Number(section.shareCount || 0),
    firstClickedAt: section.firstClickedAt || "",
    lastClickedAt: section.lastClickedAt || "",
    firstSharedAt: section.firstSharedAt || "",
    lastSharedAt: section.lastSharedAt || "",
    recentContentTitle: String(section.recentContentTitle || "").trim(),
    recentContentSlug: String(section.recentContentSlug || "").trim(),
    articles
  };
}

function normalizeAnalyticsUser(user = {}) {
  const sections = {};
  Object.entries(user.sections || {}).forEach(([key, value]) => {
    sections[key] = normalizeSectionStats(value);
  });

  let totalClicks = Number(user.totalClicks || 0);
  let totalShares = Number(user.totalShares || 0);

  if (!totalClicks && !totalShares) {
    Object.values(sections).forEach((section) => {
      totalClicks += Number(section.clickCount || 0);
      totalShares += Number(section.shareCount || 0);
    });
  }

  return {
    userId: String(user.userId || "").trim(),
    totalClicks,
    totalShares,
    firstSeenAt: user.firstSeenAt || "",
    lastActiveAt: user.lastActiveAt || "",
    sections
  };
}

function normalizeAnalyticsData(analytics = {}) {
  const users = {};
  Object.entries(analytics.users || {}).forEach(([key, value]) => {
    const normalized = normalizeAnalyticsUser(value);
    users[key] = {
      ...normalized,
      userId: normalized.userId || key
    };
  });

  const events = Array.isArray(analytics.events)
    ? analytics.events.map((event) => ({
        id: String(event.id || "").trim(),
        userId: String(event.userId || "").trim(),
        page: String(event.page || "").trim(),
        groupKey: String(event.groupKey || "").trim(),
        subKey: String(event.subKey || "").trim(),
        action: event.action === "share" ? "share" : "click",
        contentId: String(event.contentId || "").trim(),
        contentSlug: String(event.contentSlug || "").trim(),
        contentTitle: String(event.contentTitle || "").trim(),
        source: String(event.source || "").trim(),
        createdAt: event.createdAt || ""
      }))
    : [];

  return { users, events };
}

function recordTrackingEvent(payload) {
  const data = readData();
  const meta = resolveSectionMeta(data, payload.page, payload.groupKey, payload.subKey);
  if (!meta) {
    return { error: "page/groupKey/subKey invalid" };
  }

  const analytics = normalizeAnalyticsData(readAnalytics());
  const now = new Date().toISOString();
  const statKey = buildSectionStatKey(payload.page, payload.groupKey, payload.subKey);
  const action = resolveTrackingAction(payload);
  const articleKey = buildArticleStatKey(payload.contentId, payload.contentSlug);

  if (!analytics.users[payload.userId]) {
    analytics.users[payload.userId] = {
      userId: payload.userId,
      totalClicks: 0,
      totalShares: 0,
      firstSeenAt: now,
      lastActiveAt: now,
      sections: {}
    };
  }

  const user = analytics.users[payload.userId];
  if (!user.sections[statKey]) {
    user.sections[statKey] = {
      page: payload.page,
      groupKey: payload.groupKey,
      subKey: payload.subKey,
      clickCount: 0,
      shareCount: 0,
      firstClickedAt: "",
      lastClickedAt: "",
      firstSharedAt: "",
      lastSharedAt: "",
      recentContentTitle: payload.contentTitle || "",
      recentContentSlug: payload.contentSlug || "",
      articles: {}
    };
  }

  user.lastActiveAt = now;

  const section = user.sections[statKey];
  if (action === "share") {
    user.totalShares += 1;
    section.shareCount += 1;
    section.lastSharedAt = now;
    if (!section.firstSharedAt) {
      section.firstSharedAt = now;
    }
  } else {
    user.totalClicks += 1;
    section.clickCount += 1;
    section.lastClickedAt = now;
    if (!section.firstClickedAt) {
      section.firstClickedAt = now;
    }
  }

  if (payload.contentTitle) {
    section.recentContentTitle = payload.contentTitle;
  }

  if (payload.contentSlug) {
    section.recentContentSlug = payload.contentSlug;
  }

  if (articleKey) {
    if (!section.articles[articleKey]) {
      section.articles[articleKey] = {
        contentId: payload.contentId,
        contentSlug: payload.contentSlug,
        contentTitle: payload.contentTitle,
        clickCount: 0,
        shareCount: 0,
        firstClickedAt: "",
        lastClickedAt: "",
        firstSharedAt: "",
        lastSharedAt: ""
      };
    }

    const article = section.articles[articleKey];
    if (payload.contentTitle) {
      article.contentTitle = payload.contentTitle;
    }
    if (payload.contentSlug) {
      article.contentSlug = payload.contentSlug;
    }
    if (payload.contentId) {
      article.contentId = payload.contentId;
    }

    if (action === "share") {
      article.shareCount += 1;
      article.lastSharedAt = now;
      if (!article.firstSharedAt) {
        article.firstSharedAt = now;
      }
    } else {
      article.clickCount += 1;
      article.lastClickedAt = now;
      if (!article.firstClickedAt) {
        article.firstClickedAt = now;
      }
    }
  }

  analytics.events.unshift({
    id: `event-${Date.now()}`,
    userId: payload.userId,
    page: payload.page,
    groupKey: payload.groupKey,
    subKey: payload.subKey,
    action,
    contentId: payload.contentId,
    contentSlug: payload.contentSlug,
    contentTitle: payload.contentTitle,
    source: payload.source,
    createdAt: now
  });

  analytics.events = analytics.events.slice(0, 5000);
  writeAnalytics(analytics);

  return {
    event: analytics.events[0]
  };
}

function buildAnalyticsResponse(selectedUserId) {
  const data = readData();
  const analytics = normalizeAnalyticsData(readAnalytics());

  const users = Object.values(analytics.users)
    .map((user) => {
      const sectionStats = Object.values(user.sections || {})
        .map((section) => {
          const meta = resolveSectionMeta(data, section.page, section.groupKey, section.subKey) || {};
          const clickPercentage = user.totalClicks
            ? Number(((section.clickCount / user.totalClicks) * 100).toFixed(2))
            : 0;
          const sharePercentage = user.totalShares
            ? Number(((section.shareCount / user.totalShares) * 100).toFixed(2))
            : 0;
          const articleStats = Object.values(section.articles || {})
            .map((article) => ({
              ...article,
              clickPercentage: section.clickCount
                ? Number(((article.clickCount / section.clickCount) * 100).toFixed(2))
                : 0,
              sharePercentage: section.shareCount
                ? Number(((article.shareCount / section.shareCount) * 100).toFixed(2))
                : 0,
              overallClickPercentage: user.totalClicks
                ? Number(((article.clickCount / user.totalClicks) * 100).toFixed(2))
                : 0,
              overallSharePercentage: user.totalShares
                ? Number(((article.shareCount / user.totalShares) * 100).toFixed(2))
                : 0
            }))
            .sort((a, b) => {
              const interactionDelta = b.clickCount + b.shareCount - (a.clickCount + a.shareCount);
              if (interactionDelta !== 0) {
                return interactionDelta;
              }
              return String(b.lastClickedAt || b.lastSharedAt || "").localeCompare(
                String(a.lastClickedAt || a.lastSharedAt || "")
              );
            });

          return {
            ...section,
            ...meta,
            clickPercentage,
            sharePercentage,
            articleStats
          };
        })
        .sort((a, b) => {
          const interactionDelta = b.clickCount + b.shareCount - (a.clickCount + a.shareCount);
          if (interactionDelta !== 0) {
            return interactionDelta;
          }
          return b.clickCount - a.clickCount;
        });

      return {
        userId: user.userId,
        profile: getUserProfile(data, user.userId),
        totalClicks: user.totalClicks,
        totalShares: user.totalShares,
        firstSeenAt: user.firstSeenAt,
        lastActiveAt: user.lastActiveAt,
        topSection: sectionStats[0] || null,
        sectionStats
      };
    })
    .sort((a, b) => {
      const interactionDelta = b.totalClicks + b.totalShares - (a.totalClicks + a.totalShares);
      if (interactionDelta !== 0) {
        return interactionDelta;
      }
      return b.totalClicks - a.totalClicks;
    });

  const subsectionMap = {};
  users.forEach((user) => {
    user.sectionStats.forEach((section) => {
      const key = buildSectionStatKey(section.page, section.groupKey, section.subKey);
      if (!subsectionMap[key]) {
        subsectionMap[key] = {
          page: section.page,
          groupKey: section.groupKey,
          subKey: section.subKey,
          pageLabel: section.pageLabel,
          groupLabel: section.groupLabel,
          subLabel: section.subLabel,
          totalClicks: 0,
          totalShares: 0,
          userCount: 0
        };
      }

      subsectionMap[key].totalClicks += section.clickCount;
      subsectionMap[key].totalShares += section.shareCount;
      subsectionMap[key].userCount += 1;
    });
  });

  const totalClicks = users.reduce((sum, user) => sum + user.totalClicks, 0);
  const totalShares = users.reduce((sum, user) => sum + user.totalShares, 0);

  return {
    overview: {
      totalUsers: users.length,
      totalClicks,
      totalShares,
      subsectionStats: Object.values(subsectionMap)
        .map((item) => ({
          ...item,
          clickPercentage: totalClicks ? Number(((item.totalClicks / totalClicks) * 100).toFixed(2)) : 0,
          sharePercentage: totalShares ? Number(((item.totalShares / totalShares) * 100).toFixed(2)) : 0
        }))
        .sort((a, b) => {
          const interactionDelta = b.totalClicks + b.totalShares - (a.totalClicks + a.totalShares);
          if (interactionDelta !== 0) {
            return interactionDelta;
          }
          return b.totalClicks - a.totalClicks;
        }),
      recentEvents: analytics.events.slice(0, 30)
    },
    users,
    selectedUser: selectedUserId ? users.find((item) => item.userId === selectedUserId) || null : null
  };
}

function sanitizeContentPayload(body) {
  return {
    page: String(body.page || "").trim(),
    groupKey: String(body.groupKey || "").trim(),
    subKey: String(body.subKey || "").trim(),
    title: String(body.title || "").trim(),
    summary: String(body.summary || "").trim(),
    body: String(body.body || "").trim(),
    externalUrl: String(body.externalUrl || "").trim(),
    contentType: String(body.contentType || "article").trim() || "article",
    shareImageUrl: String(body.shareImageUrl || "").trim(),
    miniProgramName: String(body.miniProgramName || "").trim(),
    miniProgramAppId: String(body.miniProgramAppId || "").trim(),
    miniProgramPath: String(body.miniProgramPath || "").trim(),
    miniProgramLaunchUrl: String(body.miniProgramLaunchUrl || "").trim(),
    miniProgramNote: String(body.miniProgramNote || "").trim()
  };
}

function sanitizeNotePayload(body) {
  return {
    title: String(body.title || "").trim(),
    body: String(body.body || "").trim(),
    category: String(body.category || "").trim(),
    pinned: Boolean(body.pinned)
  };
}

function buildUploadFilename(originalName, contentType) {
  const safeName = String(originalName || "").trim().replace(/[^a-zA-Z0-9._-]/g, "-");
  const originalExt = path.extname(safeName).toLowerCase();
  const contentTypeMap = {
    "image/jpeg": ".jpg",
    "image/jpg": ".jpg",
    "image/png": ".png",
    "image/gif": ".gif",
    "image/webp": ".webp"
  };
  const allowedExts = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp"]);
  const ext = allowedExts.has(originalExt) ? originalExt : contentTypeMap[contentType] || ".jpg";
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}${ext}`;
}

async function saveUploadedImage(body) {
  const data = String(body.data || "").trim();
  const filename = String(body.filename || "").trim();
  const contentType = String(body.contentType || "").trim().toLowerCase();

  if (!data) {
    throw new Error("image data required");
  }
  if (!contentType.startsWith("image/")) {
    throw new Error("only image uploads are supported");
  }

  const buffer = Buffer.from(data, "base64");
  if (!buffer.length) {
    throw new Error("image data required");
  }
  if (buffer.length > maxUploadSize) {
    throw new Error("image must be 5MB or smaller");
  }

  ensureDataFiles();
  const storedName = buildUploadFilename(filename, contentType);
  await fsPromises.writeFile(path.join(uploadsDir, storedName), buffer);

  return {
    url: `/uploads/${storedName}`,
    name: storedName,
    size: buffer.length
  };
}

function isWechatConfigured() {
  return Boolean(wechatAppId && wechatAppSecret);
}

function httpsGetJson(requestPath) {
  return new Promise((resolve, reject) => {
    const request = https.request(
      {
        hostname: wechatApiHost,
        path: requestPath,
        method: "GET"
      },
      (response) => {
        let raw = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          raw += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(raw || "{}"));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.setTimeout(8000, () => {
      request.destroy(new Error("wechat api timeout"));
    });
    request.on("error", reject);
    request.end();
  });
}

async function getWechatAccessToken() {
  const now = Date.now();
  const sharedAccessToken = await getSharedWechatCacheValue("access_token");
  if (sharedAccessToken) {
    wechatTicketCache.accessToken = sharedAccessToken;
    wechatTicketCache.accessTokenExpiresAt = now + 60 * 1000;
    return sharedAccessToken;
  }

  if (wechatTicketCache.accessToken && wechatTicketCache.accessTokenExpiresAt > now) {
    return wechatTicketCache.accessToken;
  }

  const lock = await acquireWechatLock("access_token");
  if (!lock) {
    const waitedToken = await waitForSharedWechatCacheValue("access_token");
    if (waitedToken) {
      wechatTicketCache.accessToken = waitedToken;
      wechatTicketCache.accessTokenExpiresAt = now + 60 * 1000;
      return waitedToken;
    }
  }

  try {
    const result = await httpsGetJson(
      `/cgi-bin/token?grant_type=client_credential&appid=${encodeURIComponent(
        wechatAppId
      )}&secret=${encodeURIComponent(wechatAppSecret)}`
    );

    if (!result.access_token) {
      if (Number(result.errcode) === 40013) {
        throw new Error("invalid appid");
      }
      if (Number(result.errcode) === 40125) {
        throw new Error("invalid appsecret");
      }
      if (Number(result.errcode) === 40164) {
        throw new Error("wechat api invalid ip: current server IP is not in the WeChat whitelist");
      }
      throw new Error(result.errmsg || "failed to fetch access_token");
    }

    const ttlSeconds = Math.max(Number(result.expires_in) - 300, 60);
    wechatTicketCache.accessToken = result.access_token;
    wechatTicketCache.accessTokenExpiresAt = now + ttlSeconds * 1000;
    await setSharedWechatCacheValue("access_token", result.access_token, ttlSeconds);
    return wechatTicketCache.accessToken;
  } finally {
    await releaseWechatLock(lock);
  }
}

async function getWechatJsapiTicket() {
  const now = Date.now();
  const sharedTicket = await getSharedWechatCacheValue("jsapi_ticket");
  if (sharedTicket) {
    wechatTicketCache.jsapiTicket = sharedTicket;
    wechatTicketCache.jsapiTicketExpiresAt = now + 60 * 1000;
    return sharedTicket;
  }

  if (wechatTicketCache.jsapiTicket && wechatTicketCache.jsapiTicketExpiresAt > now) {
    return wechatTicketCache.jsapiTicket;
  }

  const lock = await acquireWechatLock("jsapi_ticket");
  if (!lock) {
    const waitedTicket = await waitForSharedWechatCacheValue("jsapi_ticket");
    if (waitedTicket) {
      wechatTicketCache.jsapiTicket = waitedTicket;
      wechatTicketCache.jsapiTicketExpiresAt = now + 60 * 1000;
      return waitedTicket;
    }
  }

  try {
    const accessToken = await getWechatAccessToken();
    const result = await httpsGetJson(
      `/cgi-bin/ticket/getticket?access_token=${encodeURIComponent(accessToken)}&type=jsapi`
    );

    if (result.errcode !== 0 || !result.ticket) {
      throw new Error(result.errmsg || "failed to fetch jsapi_ticket");
    }

    const ttlSeconds = Math.max(Number(result.expires_in) - 300, 60);
    wechatTicketCache.jsapiTicket = result.ticket;
    wechatTicketCache.jsapiTicketExpiresAt = now + ttlSeconds * 1000;
    await setSharedWechatCacheValue("jsapi_ticket", result.ticket, ttlSeconds);
    return wechatTicketCache.jsapiTicket;
  } finally {
    await releaseWechatLock(lock);
  }
}

async function buildWechatSignature(rawUrl) {
  const inputUrl = String(rawUrl || "").split("#")[0].trim();
  if (!inputUrl) {
    throw new Error("url required");
  }

  const cleanUrl = assertWechatAllowedUrl(inputUrl, wechatAllowedHosts, "signature url");
  const jsapiTicket = await getWechatJsapiTicket();
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(8).toString("hex");
  const signString = `jsapi_ticket=${jsapiTicket}&noncestr=${nonceStr}&timestamp=${timestamp}&url=${cleanUrl}`;
  const signature = crypto.createHash("sha1").update(signString).digest("hex");

  return {
    appId: wechatAppId,
    timestamp,
    nonceStr,
    signature
  };
}

function sanitizeWechatRedirectUrl(req, rawUrl) {
  const input = String(rawUrl || "").trim();
  const candidate = input || `${getRequestOrigin(req)}/recharge.html`;
  const absoluteUrl = new URL(candidate, getRequestOrigin(req)).toString();
  return assertWechatAllowedUrl(absoluteUrl, wechatAllowedHosts, "oauth redirect url");
}

function buildWechatOauthStartPath(req, redirectUrl) {
  const cleanRedirectUrl = sanitizeWechatRedirectUrl(req, redirectUrl);
  return `/api/wechat/oauth/start?redirect=${encodeURIComponent(cleanRedirectUrl)}`;
}

async function getWechatOauthOpenId(code) {
  const result = await httpsGetJson(
    `/sns/oauth2/access_token?appid=${encodeURIComponent(wechatAppId)}&secret=${encodeURIComponent(
      wechatAppSecret
    )}&code=${encodeURIComponent(code)}&grant_type=authorization_code`
  );

  if (!result.openid) {
    throw new Error(result.errmsg || "failed to fetch oauth openid");
  }

  return String(result.openid || "").trim();
}

app.get("/site-meta.js", (req, res) => {
  res.type("application/javascript").send(`window.SITE_META = ${JSON.stringify(siteMeta, null, 2)};\n`);
});

app.use(express.json({ limit: "8mb" }));
app.use(
  express.static(publicDir, {
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === ".html" || ext === ".js" || ext === ".css") {
        res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
        res.setHeader("Pragma", "no-cache");
        res.setHeader("Expires", "0");
      }
    }
  })
);

app.get("/api/health", (req, res) => {
  ensureDataFiles();
  const data = readData();
  const analytics = readAnalytics();
  res.json({
    ok: true,
    runtime: "node",
    host: req.hostname || "localhost",
    port,
    now: new Date().toISOString(),
    data: {
      contentCount: data.contents.length,
      noteCount: data.notes.length,
      vipUserCount: Object.keys(data.vipUsers || {}).length,
      analyticsUserCount: Object.keys(analytics.users || {}).length,
      analyticsEventCount: Array.isArray(analytics.events) ? analytics.events.length : 0
    }
  });
});

app.get("/api/config", (req, res) => {
  const data = readData();
  res.json({
    sections: data.sections,
    rechargePlans: Object.values(getPlanCatalog())
  });
});

app.get("/api/content", (req, res) => {
  const data = readData();
  const page = String(req.query.page || "").trim();
  const groupKey = String(req.query.groupKey || "").trim();
  const subKey = String(req.query.subKey || "").trim();

  let contents = data.contents;
  if (page) {
    contents = contents.filter((item) => item.page === page);
  }
  if (groupKey) {
    contents = contents.filter((item) => item.groupKey === groupKey);
  }
  if (subKey) {
    contents = contents.filter((item) => item.subKey === subKey);
  }

  res.json({ contents });
});

app.get("/api/notes", (req, res) => {
  const data = readData();
  const category = String(req.query.category || "").trim();
  const keyword = String(req.query.keyword || "").trim().toLowerCase();

  let notes = data.notes.slice();
  if (category) {
    notes = notes.filter((item) => item.category === category);
  }
  if (keyword) {
    notes = notes.filter((item) => {
      const title = String(item.title || "").toLowerCase();
      const body = String(item.body || "").toLowerCase();
      return title.includes(keyword) || body.includes(keyword);
    });
  }

  notes.sort((a, b) => {
    if (Boolean(b.pinned) !== Boolean(a.pinned)) {
      return Number(b.pinned) - Number(a.pinned);
    }
    return String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || ""));
  });

  res.json({ notes });
});

app.get("/api/content/:slug", (req, res) => {
  const data = readData();
  const content = data.contents.find((item) => item.slug === req.params.slug);

  if (!content) {
    return res.status(404).json({ message: "content not found" });
  }

  const meta = resolveSectionMeta(data, content.page, content.groupKey, content.subKey) || {};
  res.json({
    content: {
      ...content,
      ...meta,
      link: buildContentSharePath(content)
    }
  });
});

app.get("/api/wechat/signature", async (req, res) => {
  if (!isWechatConfigured()) {
    return res.status(503).json({
      message: "wechat not configured",
      configured: false
    });
  }

  try {
    const signature = await buildWechatSignature(req.query.url);
    res.json({
      configured: true,
      ...signature
    });
  } catch (error) {
    const message = String(error.message || "");
    const statusCode = /url|hostname/i.test(message)
      ? 400
      : /invalid appid|invalid appsecret|invalid ip|whitelist/i.test(message)
        ? 503
        : 500;
    res.status(statusCode).json({
      message: message || "failed to build wechat signature",
      configured: true
    });
  }
});

app.get("/api/wechat/oauth/session", (req, res) => {
  res.json({
    configured: isWechatConfigured(),
    inWechat: isWechatBrowserRequest(req),
    hasOpenId: Boolean(getWechatOpenIdFromRequest(req))
  });
});

app.get("/api/wechat/oauth/start", (req, res) => {
  if (!isWechatConfigured()) {
    return res.status(503).json({
      message: "wechat oauth not configured",
      configured: false
    });
  }

  try {
    const redirectUrl = sanitizeWechatRedirectUrl(req, req.query.redirect);
    const callbackUrl = `${getRequestOrigin(req)}/api/wechat/oauth/callback?redirect=${encodeURIComponent(redirectUrl)}`;
    const state = crypto.randomBytes(8).toString("hex");
    const authorizeUrl = `https://open.weixin.qq.com/connect/oauth2/authorize?appid=${encodeURIComponent(
      wechatAppId
    )}&redirect_uri=${encodeURIComponent(callbackUrl)}&response_type=code&scope=snsapi_base&state=${encodeURIComponent(
      state
    )}#wechat_redirect`;

    res.cookie("wechat_oauth_state", state, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 10 * 60 * 1000
    });
    res.redirect(authorizeUrl);
  } catch (error) {
    res.status(400).json({
      message: error.message || "invalid oauth redirect"
    });
  }
});

app.get("/api/wechat/oauth/callback", async (req, res) => {
  const code = String(req.query.code || "").trim();
  const state = String(req.query.state || "").trim();
  const redirectUrl = String(req.query.redirect || "").trim();
  const cookieState = String(parseCookies(req).wechat_oauth_state || "").trim();

  if (!code) {
    return res.status(400).send("wechat oauth code missing");
  }

  try {
    const cleanRedirectUrl = sanitizeWechatRedirectUrl(req, redirectUrl);
    if (!state || !cookieState || state !== cookieState) {
      return res.status(400).send("wechat oauth state mismatch");
    }

    const openId = await getWechatOauthOpenId(code);
    const nextUrl = new URL(cleanRedirectUrl);
    nextUrl.searchParams.set("wechatAuth", "1");

    res.clearCookie("wechat_oauth_state");
    res.cookie("wechat_openid", openId, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      maxAge: 30 * 24 * 60 * 60 * 1000
    });
    res.redirect(nextUrl.toString());
  } catch (error) {
    res.status(502).send(error.message || "wechat oauth failed");
  }
});

app.get("/api/analytics", (req, res) => {
  const userId = String(req.query.userId || "").trim();
  res.json(buildAnalyticsResponse(userId));
});

app.get("/api/recharge/plans", (req, res) => {
  res.json({
    plans: Object.values(getPlanCatalog())
  });
});

app.get("/api/users/profile/:userId", (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) {
    return res.status(400).json({ message: "userId required" });
  }

  const data = readData();
  const profile = getUserProfile(data, userId);
  if (!profile) {
    return res.status(404).json({ message: "user profile not found" });
  }

  res.json({ profile });
});

app.post("/api/users/register", (req, res) => {
  const payload = sanitizeUserProfilePayload(req.body || {});
  const validationMessage = validateUserProfilePayload(payload);
  if (validationMessage) {
    return res.status(400).json({ message: validationMessage });
  }

  const data = readData();
  const analytics = normalizeAnalyticsData(readAnalytics());

  if (isReservedUserId(data, analytics, payload.previousUserId, payload.userId)) {
    return res.status(409).json({ message: "userId already exists" });
  }

  migrateUserIdentity(data, analytics, payload.previousUserId, payload.userId);

  const now = new Date().toISOString();
  const current = getUserProfile(data, payload.userId);
  const profile = normalizeUserProfileRecord(payload.userId, {
    ...(current || {}),
    ...payload,
    userId: payload.userId,
    createdAt: current?.createdAt || now,
    updatedAt: now
  });

  data.userProfiles[payload.userId] = profile;
  writeData(data);
  writeAnalytics(analytics);

  res.status(201).json({
    message: "user registered",
    profile
  });
});

app.get("/api/users/vip", (req, res) => {
  res.json({
    users: getAllVipUserSummaries()
  });
});

app.get("/api/users/vip/:userId", (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) {
    return res.status(400).json({ message: "userId required" });
  }

  const data = readData();
  res.json({
    user: buildVipUserSummary(data, userId, data.vipUsers[userId] || {})
  });
});

app.get("/api/users/state/:userId", (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) {
    return res.status(400).json({ message: "userId required" });
  }

  const data = readData();
  res.json(buildUserState(data, userId));
});

app.get("/api/growth/customers", (req, res) => {
  const data = readData();
  const userId = String(req.query.userId || "").trim();
  if (userId) {
    const customers = getGrowthCustomersByOwnerUserId(data, userId);
    return res.json({
      customers
    });
  }

  res.json({
    customers: getGrowthCustomers(data)
  });
});

app.get("/api/growth/customers/:customerId", (req, res) => {
  const customerId = String(req.params.customerId || "").trim();
  const data = readData();
  const customer = getGrowthCustomers(data).find((item) => item.id === customerId);

  if (!customer) {
    return res.status(404).json({ message: "customer not found" });
  }

  res.json({ customer });
});

app.post("/api/users/vip/grant", (req, res) => {
  const payload = sanitizeVipGrantPayload(req.body || {});
  if (!payload.userId) {
    return res.status(400).json({ message: "userId required" });
  }
  if (!Number.isFinite(payload.days) || payload.days <= 0) {
    return res.status(400).json({ message: "days must be greater than 0" });
  }

  const data = readData();
  const current = normalizeVipUserRecord(payload.userId, data.vipUsers[payload.userId] || {});
  const updated = addVipDuration(current, payload.days, {
    adminGrant: true,
    notes: payload.notes
  });

  data.vipUsers[payload.userId] = updated;
  addUserNotification(data, payload.userId, {
    type: "vip_granted",
    title: "用户权限已更新",
    message: `后台已为你开通 ${payload.days} 天 VIP，有效期已更新。`,
    meta: {
      days: payload.days,
      vipExpiresAt: updated.vipExpiresAt
    }
  });
  writeData(data);

  res.status(201).json({
    message: "vip granted",
    user: buildVipUserSummary(data, payload.userId, updated)
  });
});

app.post("/api/growth/customers", (req, res) => {
  const payload = sanitizeGrowthCustomerCreatePayload(req.body || {});
  if (!payload.customerName || !payload.project.loanProject || !payload.project.amount || !payload.project.details) {
    return res.status(400).json({ message: "customerName/loanProject/amount/details required" });
  }

  const now = new Date().toISOString();
  const data = readData();
  const customer = {
    id: `growth-user-${Date.now()}`,
    ownerUserId: payload.ownerUserId,
    customerName: payload.customerName,
    avatarUrl: payload.avatarUrl || buildAvatarSvg(payload.customerName),
    createdAt: now,
    updatedAt: now,
    projects: [
      {
        id: `growth-project-${Date.now()}`,
        loanProject: payload.project.loanProject,
        amount: payload.project.amount,
        details: payload.project.details,
        progress: payload.project.progress,
        status: payload.project.status,
        changeRequests: [],
        createdAt: now,
        updatedAt: now
      }
    ]
  };

  data.growthCustomers.unshift(customer);
  if (payload.ownerUserId) {
    addUserNotification(data, payload.ownerUserId, {
      type: "growth_created",
      title: "成长中心已创建档案",
      message: `已为你创建客户档案“${payload.customerName}”，项目状态会在这里持续更新。`,
      meta: {
        customerId: customer.id,
        projectId: customer.projects[0].id
      }
    });
  }
  writeData(data);

  res.status(201).json({
    message: "growth customer created",
    customer: normalizeGrowthCustomer(customer)
  });
});

app.post("/api/growth/customers/:customerId/projects", (req, res) => {
  const customerId = String(req.params.customerId || "").trim();
  const payload = sanitizeGrowthProjectPayload(req.body || {});
  if (!payload.loanProject || !payload.amount || !payload.details) {
    return res.status(400).json({ message: "loanProject/amount/details required" });
  }

  const data = readData();
  const customerIndex = findGrowthCustomerIndex(data, customerId);
  if (customerIndex < 0) {
    return res.status(404).json({ message: "customer not found" });
  }

  const now = new Date().toISOString();
  const project = {
    id: `growth-project-${Date.now()}`,
    ...payload,
    changeRequests: [],
    createdAt: now,
    updatedAt: now
  };

  if (!Array.isArray(data.growthCustomers[customerIndex].projects)) {
    data.growthCustomers[customerIndex].projects = [];
  }
  data.growthCustomers[customerIndex].projects.unshift(project);
  data.growthCustomers[customerIndex].updatedAt = now;
  const ownerUserId = getGrowthCustomerOwnerUserId(data.growthCustomers[customerIndex]);
  if (ownerUserId) {
    addUserNotification(data, ownerUserId, {
      type: "growth_project_added",
      title: "成长中心有新项目",
      message: `后台已为你新增项目“${project.loanProject}”。`,
      meta: {
        customerId,
        projectId: project.id
      }
    });
  }
  writeData(data);

  res.status(201).json({
    message: "project created",
    customer: normalizeGrowthCustomer(data.growthCustomers[customerIndex]),
    project: normalizeGrowthProject(project)
  });
});

app.post("/api/growth/projects/:projectId/change-requests", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const payload = sanitizeGrowthChangeRequestPayload(req.body || {});
  const data = readData();
  const found = findGrowthProject(data, projectId);

  if (!found) {
    return res.status(404).json({ message: "project not found" });
  }

  const currentProject = normalizeGrowthProject({
    ...found.project,
    changeRequests: []
  });
  const requestedChanges = extractRequestedProjectChanges(currentProject, payload);

  if (!Object.keys(requestedChanges).length) {
    return res.status(400).json({ message: "no changes submitted" });
  }

  const existingPending = (found.project.changeRequests || []).find((item) => String(item.status || "").trim() === "pending");
  if (existingPending) {
    return res.status(409).json({ message: "pending change request already exists for this project" });
  }

  const now = new Date().toISOString();
  const request = {
    id: `growth-change-${Date.now()}`,
    status: "pending",
    requestNote: payload.requestNote,
    replyMessage: "",
    submittedAt: now,
    reviewedAt: "",
    currentSnapshot: {
      loanProject: currentProject.loanProject,
      amount: currentProject.amount,
      details: currentProject.details,
      progress: currentProject.progress,
      status: currentProject.status
    },
    requestedChanges
  };

  if (!Array.isArray(data.growthCustomers[found.customerIndex].projects[found.projectIndex].changeRequests)) {
    data.growthCustomers[found.customerIndex].projects[found.projectIndex].changeRequests = [];
  }

  data.growthCustomers[found.customerIndex].projects[found.projectIndex].changeRequests.unshift(request);
  data.growthCustomers[found.customerIndex].updatedAt = now;
  writeData(data);

  res.status(201).json({
    message: "change request created",
    customer: normalizeGrowthCustomer(data.growthCustomers[found.customerIndex]),
    request: normalizeGrowthChangeRequest(request)
  });
});

app.post("/api/recharge/orders", async (req, res) => {
  const payload = sanitizeRechargeOrderPayload(req.body || {});
  const plans = getPlanCatalog();
  const plan = plans[payload.planKey];
  const supportedMethods = new Set(["wechat", "alipay"]);
  const requestedChannel = payload.paymentChannel === "jsapi" ? "jsapi" : "h5";

  if (!payload.userId || !payload.planKey || !payload.paymentMethod) {
    return res.status(400).json({ message: "userId/planKey/paymentMethod required" });
  }

  if (!plan) {
    return res.status(400).json({ message: "planKey invalid" });
  }

  if (!supportedMethods.has(payload.paymentMethod)) {
    return res.status(400).json({ message: "paymentMethod invalid" });
  }

  const now = new Date().toISOString();
  const data = readData();
  const order = {
    id: `recharge-${Date.now()}`,
    userId: payload.userId,
    planKey: plan.key,
    planLabel: plan.label,
    amount: plan.price,
    durationDays: plan.durationDays,
    paymentMethod: payload.paymentMethod,
    paymentChannel: requestedChannel,
    status: "pending",
    paymentStatus: "awaiting_integration",
    gateway: payload.paymentMethod === "wechat" ? "wechat_pay" : "alipay",
    gatewayMessage: `${payload.paymentMethod === "wechat" ? "微信支付" : "支付宝支付"}接口待接入`,
    gatewayTransactionId: "",
    wechatH5Url: "",
    tradeState: "",
    tradeStateDesc: "",
    paidAt: "",
    createdAt: now,
    updatedAt: now
  };

  if (payload.paymentMethod === "wechat") {
    if (!isWechatPayConfigured()) {
      return res.status(503).json({
        message: "wechat pay not configured",
        missing: [
          ["WECHAT_PAY_APP_ID", wechatPayAppId],
          ["WECHAT_PAY_MCH_ID", wechatPayMerchantId],
          ["WECHAT_PAY_SERIAL_NO", wechatPayMerchantSerialNo],
          ["WECHAT_PAY_PRIVATE_KEY / WECHAT_PAY_PRIVATE_KEY_PATH", wechatPayPrivateKey]
        ]
          .filter((item) => !item[1])
          .map((item) => item[0])
      });
    }

    try {
      if (requestedChannel === "jsapi") {
        const openId = getWechatOpenIdFromRequest(req);
        if (!openId) {
          return res.status(428).json({
            message: "wechat openid required",
            oauthRequired: true,
            redirectUrl: buildWechatOauthStartPath(req, payload.returnUrl)
          });
        }

        const gatewayResult = await createWechatJsapiTransaction(req, order, openId);
        if (!String(gatewayResult.prepay_id || "").trim()) {
          throw new Error("wechat pay response missing prepay_id");
        }

        order.paymentStatus = "awaiting_payment";
        order.gatewayMessage = "微信支付下单成功，等待用户完成支付";
        order.tradeState = "NOTPAY";
        order.tradeStateDesc = "待支付";
        order.gatewayTransactionId = String(gatewayResult.prepay_id || "").trim();
      } else {
        const gatewayResult = await createWechatH5Transaction(req, order);
        if (!String(gatewayResult.h5_url || "").trim()) {
          throw new Error("wechat pay response missing h5_url");
        }

        order.paymentStatus = "awaiting_payment";
        order.gatewayMessage = "微信支付下单成功，等待用户完成支付";
        order.wechatH5Url = String(gatewayResult.h5_url || "").trim();
        order.tradeState = "NOTPAY";
        order.tradeStateDesc = "待支付";
      }
    } catch (error) {
      return res.status(error.statusCode || 502).json({
        message: error.message || "failed to create wechat pay order",
        detail: error.response || null
      });
    }
  }

  data.rechargeOrders.unshift(order);
  writeData(data);

  res.status(201).json({
    message: "order created",
    order: normalizeRechargeOrderRecord(order),
    integrationReady: payload.paymentMethod === "wechat",
    payment:
      payload.paymentMethod === "wechat"
        ? order.paymentChannel === "jsapi"
          ? {
              mode: "jsapi",
              params: buildWechatJsapiPaySign(order.gatewayTransactionId)
            }
          : {
              mode: "redirect",
              h5Url: order.wechatH5Url
            }
        : null,
    nextStep:
      payload.paymentMethod === "wechat"
        ? order.paymentChannel === "jsapi"
          ? "请在微信内完成支付，支付回调后页面会自动查询结果。"
          : "请跳转微信支付中间页完成付款，回跳后页面会自动查询结果。"
        : "支付接口待接入，当前已预留订单与网关字段。"
  });
});

app.get("/api/recharge/orders/:orderId/status", async (req, res) => {
  const orderId = String(req.params.orderId || "").trim();
  if (!orderId) {
    return res.status(400).json({ message: "orderId required" });
  }

  const data = readData();
  const orderIndex = findRechargeOrderIndex(data, orderId);
  if (orderIndex < 0) {
    return res.status(404).json({ message: "order not found" });
  }

  let order = normalizeRechargeOrderRecord(data.rechargeOrders[orderIndex] || {});
  if (order.paymentMethod === "wechat" && isWechatPayConfigured() && order.paymentStatus !== "paid") {
    try {
      const queryResult = await queryWechatTransactionByOutTradeNo(order.id);
      order = applyRechargeOrderState(data, orderIndex, queryResult);
      writeData(data);
    } catch (error) {
      return res.status(error.statusCode || 502).json({
        message: error.message || "failed to query wechat pay order",
        order
      });
    }
  }

  res.json({
    order,
    vip: buildVipUserSummary(data, order.userId, data.vipUsers[order.userId] || {})
  });
});

app.post("/api/wechat/pay/notify", (req, res) => {
  res.status(200).json({
    code: "SUCCESS",
    message: "OK"
  });
});

app.delete("/api/analytics", (req, res) => {
  writeAnalytics({
    users: {},
    events: []
  });

  res.json({ message: "analytics cleared" });
});

app.delete("/api/analytics/users/:userId", (req, res) => {
  const userId = String(req.params.userId || "").trim();
  if (!userId) {
    return res.status(400).json({ message: "userId required" });
  }

  const analytics = readAnalytics();
  if (!analytics.users[userId]) {
    return res.status(404).json({ message: "user not found" });
  }

  delete analytics.users[userId];
  analytics.events = analytics.events.filter((item) => item.userId !== userId);
  writeAnalytics(analytics);

  res.json({ message: "user analytics deleted", userId });
});

app.get("/api/share-debug", (req, res) => {
  const debugData = readShareDebug();
  const events = Array.isArray(debugData.events) ? debugData.events : [];
  res.json({ events: events.slice(-20).reverse() });
});

app.post("/api/share-debug", (req, res) => {
  const debugData = readShareDebug();
  const events = Array.isArray(debugData.events) ? debugData.events : [];
  events.push({
    id: `share-debug-${Date.now()}`,
    createdAt: new Date().toISOString(),
    path: String(req.body?.path || "").trim(),
    userAgent: String(req.body?.userAgent || "").trim(),
    lines: Array.isArray(req.body?.lines) ? req.body.lines.map((item) => String(item || "")) : []
  });

  debugData.events = events.slice(-100);
  writeShareDebug(debugData);
  res.status(201).json({ message: "recorded" });
});

app.delete("/api/share-debug", (req, res) => {
  writeShareDebug({ events: [] });
  res.json({ message: "cleared" });
});

app.post("/api/uploads/image", async (req, res) => {
  try {
    const file = await saveUploadedImage(req.body || {});
    res.status(201).json({ message: "uploaded", file });
  } catch (error) {
    res.status(400).json({ message: error.message || "upload failed" });
  }
});

app.post("/api/content", (req, res) => {
  const data = readData();
  const payload = sanitizeContentPayload(req.body || {});

  if (!payload.page || !payload.groupKey || !payload.subKey || !payload.title) {
    return res.status(400).json({ message: "page/groupKey/subKey/title required" });
  }

  const meta = resolveSectionMeta(data, payload.page, payload.groupKey, payload.subKey);
  if (!meta) {
    return res.status(400).json({ message: "page/groupKey/subKey invalid" });
  }

  const content = {
    id: `content-${Date.now()}`,
    ...payload,
    slug: buildUniqueSlug(data, payload),
    createdAt: new Date().toISOString()
  };

  data.contents.unshift(content);
  writeData(data);

  res.status(201).json({
    message: "created",
    content: {
      ...content,
      ...meta,
      link: buildContentSharePath(content)
    }
  });
});

app.post("/api/notes", (req, res) => {
  const data = readData();
  const payload = sanitizeNotePayload(req.body || {});

  if (!payload.title || !payload.body) {
    return res.status(400).json({ message: "title/body required" });
  }

  const now = new Date().toISOString();
  const note = {
    id: `note-${Date.now()}`,
    ...payload,
    createdAt: now,
    updatedAt: now
  };

  data.notes.unshift(note);
  writeData(data);

  res.status(201).json({
    message: "created",
    note
  });
});

app.put("/api/content/:id", (req, res) => {
  const contentId = String(req.params.id || "").trim();
  const payload = sanitizeContentPayload(req.body || {});
  const data = readData();
  const index = data.contents.findIndex((item) => item.id === contentId);

  if (index < 0) {
    return res.status(404).json({ message: "content not found" });
  }

  if (!payload.page || !payload.groupKey || !payload.subKey || !payload.title) {
    return res.status(400).json({ message: "page/groupKey/subKey/title required" });
  }

  const meta = resolveSectionMeta(data, payload.page, payload.groupKey, payload.subKey);
  if (!meta) {
    return res.status(400).json({ message: "page/groupKey/subKey invalid" });
  }

  const current = data.contents[index];
  const shouldRefreshSlug =
    payload.title !== current.title ||
    payload.page !== current.page ||
    payload.groupKey !== current.groupKey ||
    payload.subKey !== current.subKey;

  const updated = {
    ...current,
    ...payload,
    slug: shouldRefreshSlug ? buildUniqueSlug(data, payload, current.id) : current.slug,
    updatedAt: new Date().toISOString()
  };

  data.contents[index] = updated;
  writeData(data);

  res.json({
    message: "updated",
    content: {
      ...updated,
      ...meta,
      link: buildContentSharePath(updated)
    }
  });
});

app.put("/api/notes/:id", (req, res) => {
  const noteId = String(req.params.id || "").trim();
  const payload = sanitizeNotePayload(req.body || {});
  const data = readData();
  const index = data.notes.findIndex((item) => item.id === noteId);

  if (index < 0) {
    return res.status(404).json({ message: "note not found" });
  }

  if (!payload.title || !payload.body) {
    return res.status(400).json({ message: "title/body required" });
  }

  const current = data.notes[index];
  const updated = {
    ...current,
    ...payload,
    updatedAt: new Date().toISOString()
  };

  data.notes[index] = updated;
  writeData(data);

  res.json({
    message: "updated",
    note: updated
  });
});

app.put("/api/growth/projects/:projectId", (req, res) => {
  const projectId = String(req.params.projectId || "").trim();
  const payload = sanitizeGrowthProjectUpdatePayload(req.body || {});
  const data = readData();
  const found = findGrowthProject(data, projectId);

  if (!found) {
    return res.status(404).json({ message: "project not found" });
  }

  const currentProject = found.customer.projects[found.projectIndex];
  const now = new Date().toISOString();
  const updatedProject = {
    ...currentProject,
    ...payload,
    updatedAt: now
  };

  if (updatedProject.progress >= 100) {
    updatedProject.progress = 100;
    updatedProject.status = "completed";
  } else if (!updatedProject.status) {
    updatedProject.status = "in_progress";
  }

  data.growthCustomers[found.customerIndex].projects[found.projectIndex] = updatedProject;
  data.growthCustomers[found.customerIndex].updatedAt = now;
  const ownerUserId = getGrowthCustomerOwnerUserId(data.growthCustomers[found.customerIndex]);
  if (ownerUserId) {
    addUserNotification(data, ownerUserId, {
      type: "growth_project_updated",
      title: "成长中心项目已更新",
      message: `项目“${updatedProject.loanProject}”状态已更新为最新内容。`,
      meta: {
        customerId: data.growthCustomers[found.customerIndex].id,
        projectId: updatedProject.id,
        progress: updatedProject.progress,
        status: updatedProject.status
      }
    });
  }
  writeData(data);

  res.json({
    message: "project updated",
    customer: normalizeGrowthCustomer(data.growthCustomers[found.customerIndex]),
    project: normalizeGrowthProject(updatedProject)
  });
});

app.post("/api/growth/change-requests/:requestId/approve", (req, res) => {
  const requestId = String(req.params.requestId || "").trim();
  const replyMessage = String(req.body?.replyMessage || "").trim();
  const data = readData();
  const found = findGrowthChangeRequest(data, requestId);

  if (!found) {
    return res.status(404).json({ message: "change request not found" });
  }

  if (String(found.request.status || "").trim() !== "pending") {
    return res.status(400).json({ message: "change request already reviewed" });
  }

  const now = new Date().toISOString();
  const currentProject = data.growthCustomers[found.customerIndex].projects[found.projectIndex];
  const updatedProject = {
    ...currentProject,
    ...found.request.requestedChanges,
    updatedAt: now
  };

  if (updatedProject.progress >= 100) {
    updatedProject.progress = 100;
    updatedProject.status = "completed";
  } else if (!updatedProject.status) {
    updatedProject.status = "in_progress";
  }

  currentProject.loanProject = updatedProject.loanProject;
  currentProject.amount = updatedProject.amount;
  currentProject.details = updatedProject.details;
  currentProject.progress = updatedProject.progress;
  currentProject.status = updatedProject.status;
  currentProject.updatedAt = updatedProject.updatedAt;
  currentProject.changeRequests[found.requestIndex] = {
    ...currentProject.changeRequests[found.requestIndex],
    status: "approved",
    reviewedAt: now,
    replyMessage: replyMessage || "后台已通过本次修改申请。"
  };

  data.growthCustomers[found.customerIndex].updatedAt = now;
  const ownerUserId = getGrowthCustomerOwnerUserId(data.growthCustomers[found.customerIndex]);
  if (ownerUserId) {
    addUserNotification(data, ownerUserId, {
      type: "growth_change_approved",
      title: "成长中心修改申请已通过",
      message: currentProject.changeRequests[found.requestIndex].replyMessage,
      meta: {
        customerId: data.growthCustomers[found.customerIndex].id,
        projectId: currentProject.id,
        requestId
      }
    });
  }
  writeData(data);

  res.json({
    message: "change request approved",
    customer: normalizeGrowthCustomer(data.growthCustomers[found.customerIndex]),
    project: normalizeGrowthProject(currentProject),
    request: normalizeGrowthChangeRequest(currentProject.changeRequests[found.requestIndex])
  });
});

app.post("/api/growth/change-requests/:requestId/reject", (req, res) => {
  const requestId = String(req.params.requestId || "").trim();
  const replyMessage = String(req.body?.replyMessage || "").trim();
  const data = readData();
  const found = findGrowthChangeRequest(data, requestId);

  if (!found) {
    return res.status(404).json({ message: "change request not found" });
  }

  if (String(found.request.status || "").trim() !== "pending") {
    return res.status(400).json({ message: "change request already reviewed" });
  }

  const now = new Date().toISOString();
  data.growthCustomers[found.customerIndex].projects[found.projectIndex].changeRequests[found.requestIndex] = {
    ...data.growthCustomers[found.customerIndex].projects[found.projectIndex].changeRequests[found.requestIndex],
    status: "rejected",
    reviewedAt: now,
    replyMessage: replyMessage || "后台已拒绝本次修改申请。"
  };
  data.growthCustomers[found.customerIndex].updatedAt = now;
  const ownerUserId = getGrowthCustomerOwnerUserId(data.growthCustomers[found.customerIndex]);
  if (ownerUserId) {
    addUserNotification(data, ownerUserId, {
      type: "growth_change_rejected",
      title: "成长中心修改申请未通过",
      message: data.growthCustomers[found.customerIndex].projects[found.projectIndex].changeRequests[found.requestIndex].replyMessage,
      meta: {
        customerId: data.growthCustomers[found.customerIndex].id,
        projectId: data.growthCustomers[found.customerIndex].projects[found.projectIndex].id,
        requestId
      }
    });
  }
  writeData(data);

  res.json({
    message: "change request rejected",
    customer: normalizeGrowthCustomer(data.growthCustomers[found.customerIndex]),
    project: normalizeGrowthProject(data.growthCustomers[found.customerIndex].projects[found.projectIndex]),
    request: normalizeGrowthChangeRequest(
      data.growthCustomers[found.customerIndex].projects[found.projectIndex].changeRequests[found.requestIndex]
    )
  });
});

app.delete("/api/content/:id", (req, res) => {
  const contentId = String(req.params.id || "").trim();
  const data = readData();
  const before = data.contents.length;
  data.contents = data.contents.filter((item) => item.id !== contentId);

  if (data.contents.length === before) {
    return res.status(404).json({ message: "content not found" });
  }

  writeData(data);
  res.json({ message: "deleted", id: contentId });
});

app.delete("/api/notes/:id", (req, res) => {
  const noteId = String(req.params.id || "").trim();
  const data = readData();
  const before = data.notes.length;
  data.notes = data.notes.filter((item) => item.id !== noteId);

  if (data.notes.length === before) {
    return res.status(404).json({ message: "note not found" });
  }

  writeData(data);
  res.json({ message: "deleted", id: noteId });
});

app.post("/api/analytics/track", (req, res) => {
  const payload = sanitizeTrackingPayload(req.body || {});

  if (!payload.userId || !payload.page || !payload.groupKey || !payload.subKey) {
    return res.status(400).json({ message: "userId/page/groupKey/subKey required" });
  }

  const result = recordTrackingEvent(payload);
  if (result.error) {
    return res.status(400).json({ message: result.error });
  }

  res.status(201).json({ message: "tracked", event: result.event });
});

app.get("/content/:slug", (req, res) => {
  const data = readData();
  const content = data.contents.find((item) => item.slug === req.params.slug);

  if (!content) {
    return res.status(404).sendFile(path.join(publicDir, "detail.html"));
  }

  res.type("html").send(renderContentDetailHtml(req, content));
});

app.get("/section/:page/:groupKey/:subKey", (req, res) => {
  res.sendFile(path.join(publicDir, "subsection.html"));
});

app.listen(port, () => {
  ensureDataFiles();
  console.log(`Server is running at http://localhost:${port}`);
});
