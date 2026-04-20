const config = require("../../config");

function buildCanonicalPath(query) {
  const slug = String(query.slug || config.defaultContentSlug).trim();
  const autoOpen = String(query.autoOpen || "0").trim();
  const nextQuery = [`slug=${encodeURIComponent(slug)}`];

  if (autoOpen === "1") {
    nextQuery.push("autoOpen=1");
  }

  return `/pages/h5-share-shell/h5-share-shell?${nextQuery.join("&")}`;
}

Page({
  data: {
    redirecting: true,
    error: ""
  },

  onLoad(query) {
    const targetUrl = buildCanonicalPath(query || {});
    this.redirectToCanonical(targetUrl);
  },

  redirectToCanonical(targetUrl) {
    wx.redirectTo({
      url: targetUrl,
      fail: () => {
        wx.navigateTo({
          url: targetUrl,
          fail: (error) => {
            this.setData({
              redirecting: false,
              error: error?.errMsg || "跳转到最新分享页失败，请返回重试。"
            });
          }
        });
      }
    });
  }
});
