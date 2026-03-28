const config = require("../../config");
const { buildWebviewUrl, getContentBySlug, normalizeContent } = require("../../utils/content");

const fallbackContent = normalizeContent({
  slug: config.defaultContentSlug,
  title: "银行房产抵押办理要点",
  summary: "覆盖准入条件、资料清单和放款流程，点击查看完整内容。",
  shareImageUrl: `${config.h5Origin}/uploads/share-cover.jpg`,
  link: `${config.h5Origin}/content/${config.defaultContentSlug}`
});

Page({
  data: {
    loading: true,
    error: "",
    canOpenWebview: false,
    content: fallbackContent
  },

  onLoad(query) {
    if (typeof wx.showShareMenu === "function") {
      wx.showShareMenu({
        menus: ["shareAppMessage", "shareTimeline"]
      });
    }

    const slug = String(query.slug || config.defaultContentSlug).trim();
    this.loadContent(slug);
  },

  onShareAppMessage() {
    const { content } = this.data;
    return {
      title: content.title,
      path: `/pages/share/index?slug=${encodeURIComponent(content.slug)}`,
      imageUrl: content.shareImageUrl
    };
  },

  onShareTimeline() {
    const { content } = this.data;
    return {
      title: content.title,
      query: `slug=${encodeURIComponent(content.slug)}`,
      imageUrl: content.shareImageUrl
    };
  },

  async loadContent(slug) {
    this.setData({
      loading: true,
      error: ""
    });

    try {
      const content = await getContentBySlug(slug);
      this.setData({
        loading: false,
        canOpenWebview: true,
        content
      });
    } catch (error) {
      this.setData({
        loading: false,
        error: error?.errMsg || error?.message || "内容加载失败，已切换为本地示例数据。",
        canOpenWebview: false,
        content: fallbackContent
      });
    }
  },

  handleRetry() {
    this.loadContent(this.data.content.slug);
  },

  handleOpenWebview() {
    const targetUrl = buildWebviewUrl(this.data.content);
    wx.navigateTo({
      url: `/pages/webview/index?src=${encodeURIComponent(targetUrl)}`
    });
  },

  handleCopyLink() {
    wx.setClipboardData({
      data: this.data.content.link
    });
  }
});
