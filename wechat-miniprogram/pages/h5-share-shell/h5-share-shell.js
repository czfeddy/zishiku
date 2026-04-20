const config = require("../../config");
const { buildFallbackContent, buildWebviewUrl, getContentBySlug } = require("../../utils/content");

const fallbackContent = buildFallbackContent(config.defaultContentSlug);

function downloadFile(url) {
  return new Promise((resolve, reject) => {
    wx.downloadFile({
      url,
      success(response) {
        if (response.statusCode >= 200 && response.statusCode < 300 && response.tempFilePath) {
          resolve(response.tempFilePath);
          return;
        }

        reject(new Error("图片下载失败"));
      },
      fail(error) {
        reject(error);
      }
    });
  });
}

function saveImageToAlbum(filePath) {
  return new Promise((resolve, reject) => {
    wx.saveImageToPhotosAlbum({
      filePath,
      success() {
        resolve();
      },
      fail(error) {
        reject(error);
      }
    });
  });
}

function setClipboard(text) {
  return new Promise((resolve, reject) => {
    wx.setClipboardData({
      data: String(text || ""),
      success() {
        resolve();
      },
      fail(error) {
        reject(error);
      }
    });
  });
}

function getSaveAlbumErrorMessage(error) {
  const message = String(error?.errMsg || error?.message || "").toLowerCase();
  if (message.includes("auth denied") || message.includes("authorize no response") || message.includes("auth deny")) {
    return "请允许保存到相册后再试，这样才能自动帮你备好朋友圈图片。";
  }

  return "图片保存失败，请稍后重试。";
}

Page({
  data: {
    loading: true,
    error: "",
    canOpenWebview: false,
    content: fallbackContent,
    autoOpening: false,
    preparingMoments: false,
    prepareStatus: "",
    copiedText: false,
    savedImageCount: 0
  },

  onLoad(query) {
    this.syncShareMenu(fallbackContent);

    const slug = String(query.slug || config.defaultContentSlug).trim();
    const autoOpen = String(query.autoOpen || "0").trim() === "1";
    this.autoOpenOnReady = autoOpen;
    this.hasAutoOpened = false;
    this.hasAutoPrepared = false;
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
      error: "",
      autoOpening: false,
      preparingMoments: false,
      prepareStatus: "",
      copiedText: false,
      savedImageCount: 0
    });

    try {
      const content = await getContentBySlug(slug);
      this.setData({
        loading: false,
        canOpenWebview: true,
        content
      });
      this.syncShareMenu(content);
      this.tryAutoPrepareMoments();
      this.tryAutoOpenWebview();
    } catch (error) {
      const fallback = buildFallbackContent(slug);
      this.setData({
        loading: false,
        error: error?.errMsg || error?.message || "内容加载超时，已切换为本地兜底内容。",
        canOpenWebview: true,
        content: fallback
      });
      this.syncShareMenu(fallback);
      this.tryAutoPrepareMoments();
      this.tryAutoOpenWebview();
    }
  },

  syncShareMenu(content) {
    const isMomentsPost = Boolean(content?.isMomentsPost);
    if (isMomentsPost && typeof wx.hideShareMenu === "function") {
      wx.hideShareMenu({
        menus: ["shareAppMessage", "shareTimeline"]
      });
      return;
    }

    if (!isMomentsPost && typeof wx.showShareMenu === "function") {
      wx.showShareMenu({
        menus: ["shareAppMessage", "shareTimeline"]
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

  tryAutoPrepareMoments() {
    if (this.hasAutoPrepared || !this.data.content?.isMomentsPost) {
      return;
    }

    this.hasAutoPrepared = true;
    this.handlePrepareMoments({ silentEmpty: true, autoTriggered: true });
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

  async handlePrepareMoments(options = {}) {
    const { content, preparingMoments } = this.data;
    if (preparingMoments) {
      return;
    }

    const text = String(content.momentsText || content.summary || content.title || "").trim();
    const images = Array.isArray(content.momentsImages) ? content.momentsImages.filter((item) => item?.url) : [];

    if (!text && !images.length) {
      if (options.silentEmpty) {
        return;
      }
      wx.showToast({
        title: "当前文章暂无可备好的朋友圈素材",
        icon: "none"
      });
      return;
    }

    this.setData({
      preparingMoments: true,
      prepareStatus: "正在复制文案并保存图片...",
      copiedText: false,
      savedImageCount: 0
    });

    try {
      if (text) {
        await setClipboard(text);
      }

      let savedImageCount = 0;
      for (let index = 0; index < images.length; index += 1) {
        const tempFilePath = await downloadFile(images[index].url);
        await saveImageToAlbum(tempFilePath);
        savedImageCount += 1;
        this.setData({
          savedImageCount,
          prepareStatus: `已保存 ${savedImageCount}/${images.length} 张图片...`
        });
      }

      this.setData({
        preparingMoments: false,
        prepareStatus: images.length ? "朋友圈素材已备好" : "朋友圈文案已复制",
        copiedText: Boolean(text),
        savedImageCount
      });

      if (options.autoTriggered) {
        wx.showToast({
          title: images.length ? "素材已备好" : "文案已复制",
          icon: "success",
          duration: 2000
        });
      } else {
        this.showPublishGuide();
      }
    } catch (error) {
      this.setData({
        preparingMoments: false,
        prepareStatus: "",
        copiedText: Boolean(text),
        savedImageCount: 0
      });

      if (options.autoTriggered) {
        wx.showToast({
          title: "自动准备失败，请手动点按钮",
          icon: "none",
          duration: 2500
        });
      } else {
        wx.showModal({
          title: "准备失败",
          content: getSaveAlbumErrorMessage(error),
          showCancel: false,
          confirmText: "知道了"
        });
      }
    }
  },

  handleShowPublishGuide() {
    if (this.data.content?.isMomentsPost) {
      this.showPublishGuide();
      return;
    }

    wx.showModal({
      title: "分享卡片方法",
      content: "这篇内容适合用小程序卡片分享。请点击右上角“三个点”，再选择“分享到朋友圈”。",
      showCancel: false,
      confirmText: "知道了"
    });
  },

  showPublishGuide() {
    const { copiedText, savedImageCount } = this.data;
    const textStatus = copiedText ? "文案已复制，可在朋友圈发布页直接粘贴。" : "请先点击“重新准备素材”复制文案。";
    const imageStatus = savedImageCount ? `${savedImageCount} 张图片已保存到系统相册。` : "请先保存图片到系统相册。";
    wx.showModal({
      title: "去朋友圈手动发布",
      content: `${textStatus}${imageStatus} 请返回微信首页，进入“发现 - 朋友圈”，点击右上角相机按钮，选择刚保存的图片并粘贴文案。不要点本页右上角分享，那会变成链接卡片。`,
      showCancel: false,
      confirmText: "知道了"
    });
  }
});
