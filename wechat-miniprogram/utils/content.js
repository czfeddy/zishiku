const config = require("../config");

const REQUEST_TIMEOUT = 8000;

function ensureAbsoluteUrl(value) {
  const text = String(value || "").trim();
  if (!text) {
    return "";
  }

  if (/^https?:\/\//i.test(text)) {
    return text;
  }

  if (text.startsWith("/")) {
    return `${config.h5Origin}${text}`;
  }

  return text;
}

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeBody(value) {
  return String(value || "").replace(/\r\n/g, "\n").trim();
}

function parseMomentsBody(value) {
  const raw = normalizeBody(value);
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.schema !== "moments-post-v1" || typeof parsed.text !== "string" || !Array.isArray(parsed.images)) {
      return null;
    }

    return {
      text: normalizeBody(parsed.text),
      images: parsed.images
        .map((item) => ({
          url: ensureAbsoluteUrl(item?.url),
          name: String(item?.name || "").trim()
        }))
        .filter((item) => item.url)
    };
  } catch (error) {
    return null;
  }
}

function normalizeContent(content) {
  const slug = String(content?.slug || config.defaultContentSlug).trim();
  const moments = parseMomentsBody(content?.body || "");
  const body = moments ? moments.text : normalizeBody(content?.body || "");
  const bodyPreview = stripHtml(body);
  const title = String(content?.title || "").trim() || "未命名内容";
  const summary =
    String(content?.summary || "").trim() ||
    bodyPreview.slice(0, 88) ||
    "点击查看完整内容";
  const shareImageUrl = ensureAbsoluteUrl(content?.shareImageUrl) || `${config.h5Origin}/uploads/share-cover.jpg`;
  const link = ensureAbsoluteUrl(content?.link) || `${config.h5Origin}/content/${encodeURIComponent(slug)}`;

  return {
    title,
    summary,
    body,
    bodyPreview,
    shareImageUrl,
    slug,
    link,
    updatedAt: String(content?.updatedAt || content?.createdAt || "").trim(),
    isMomentsPost: Boolean(moments),
    momentsText: moments?.text || "",
    momentsImages: moments?.images || []
  };
}

function buildFallbackContent(slug) {
  return normalizeContent({
    slug,
    title: "内容加载中",
    summary: "正在同步 H5 内容，请稍后重试。",
    shareImageUrl: `${config.h5Origin}/uploads/share-cover.jpg`,
    link: `${config.h5Origin}/content/${encodeURIComponent(slug || config.defaultContentSlug)}`
  });
}

function getContentBySlug(slug) {
  const targetSlug = String(slug || config.defaultContentSlug).trim();

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.h5Origin}/api/content/${encodeURIComponent(targetSlug)}`,
      method: "GET",
      timeout: REQUEST_TIMEOUT,
      success(response) {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          reject(new Error(response.data?.message || "内容加载失败"));
          return;
        }

        resolve(normalizeContent(response.data?.content || {}));
      },
      fail(error) {
        reject(error);
      }
    });
  });
}

function buildWebviewUrl(content) {
  const target = normalizeContent(content);
  const separator = target.link.includes("?") ? "&" : "?";
  return `${target.link}${separator}from=miniprogram-shell`;
}

module.exports = {
  buildFallbackContent,
  buildWebviewUrl,
  getContentBySlug,
  normalizeContent
};
