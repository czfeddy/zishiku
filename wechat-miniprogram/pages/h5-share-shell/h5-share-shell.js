const config = require("../../config");
const { buildWebviewUrl, getContentBySlug, normalizeContent } = require("../../utils/content");

const fallbackContent = normalizeContent({
  slug: config.defaultContentSlug,
  title: "Bank Mortgage Guide",
  summary: "A share shell page for validating card style, summary copy, and H5 jump flow.",
  shareImageUrl: `${config.h5Origin}/uploads/share-cover.jpg`,
  link: `${config.h5Origin}/content/${config.defaultContentSlug}`
});

Page({
  data: {
    loading: true,
    error: "",
    canOpenWebview: false,
    content: fallbackContent,
    autoOpening: false
  },

  onLoad(query) {
    if (typeof wx.showShareMenu === "function") {
      wx.showShareMenu({
        menus: ["shareAppMessage", "shareTimeline"]
      });
    }

    const slug = String(query.slug || config.defaultContentSlug).trim();
    const autoOpen = String(query.autoOpen || "1").trim() !== "0";
    this.autoOpenOnReady = autoOpen;
    this.hasAutoOpened = false;
    this.loadContent(slug);
  },

  onShareAppMessage() {
    const { content } = this.data;
    return {
      title: content.title,
      path: `/pages/h5-share-shell/h5-share-shell?slug=${encodeURIComponent(content.slug)}&autoOpen=1`,
      imageUrl: content.shareImageUrl
    };
  },

  onShareTimeline() {
    const { content } = this.data;
    return {
      title: content.title,
      query: `slug=${encodeURIComponent(content.slug)}&autoOpen=1`,
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
        autoOpening: false,
        content
      });
      this.tryAutoOpenWebview();
    } catch (error) {
      this.setData({
        loading: false,
        error: error?.errMsg || error?.message || "Content load failed. Falling back to local sample data.",
        canOpenWebview: false,
        autoOpening: false,
        content: fallbackContent
      });
    }
  },

  handleRetry() {
    this.loadContent(this.data.content.slug);
  },

  handleOpenWebview() {
    this.openWebview();
  },

  tryAutoOpenWebview() {
    if (!this.autoOpenOnReady || this.hasAutoOpened || !this.data.canOpenWebview) {
      return;
    }

    this.hasAutoOpened = true;
    this.openWebview();
  },

  openWebview() {
    const targetUrl = buildWebviewUrl(this.data.content);
    this.setData({
      autoOpening: true
    });
    wx.redirectTo({
      url: `/pages/webview/index?src=${encodeURIComponent(targetUrl)}`,
      fail: () => {
        this.hasAutoOpened = false;
        this.setData({
          autoOpening: false
        });
        wx.navigateTo({
          url: `/pages/webview/index?src=${encodeURIComponent(targetUrl)}`
        });
      }
    });
  },

  handleCopyLink() {
    wx.setClipboardData({
      data: this.data.content.link
    });
  }
});
