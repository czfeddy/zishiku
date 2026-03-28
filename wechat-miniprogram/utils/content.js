const config = require("../config");

function stripHtml(value) {
  return String(value || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function normalizeContent(content) {
  const title = String(content?.title || "").trim() || "未命名内容";
  const summary =
    String(content?.summary || "").trim() ||
    stripHtml(content?.body || "").slice(0, 88) ||
    "点击查看完整内容";
  const shareImageUrl = String(content?.shareImageUrl || "").trim() || `${config.h5Origin}/uploads/share-cover.jpg`;
  const slug = String(content?.slug || config.defaultContentSlug).trim();
  const link = String(content?.link || `${config.h5Origin}/content/${encodeURIComponent(slug)}`).trim();

  return {
    title,
    summary,
    shareImageUrl,
    slug,
    link
  };
}

function getContentBySlug(slug) {
  const targetSlug = String(slug || config.defaultContentSlug).trim();

  return new Promise((resolve, reject) => {
    wx.request({
      url: `${config.h5Origin}/api/content/${encodeURIComponent(targetSlug)}`,
      method: "GET",
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
  buildWebviewUrl,
  getContentBySlug,
  normalizeContent
};
