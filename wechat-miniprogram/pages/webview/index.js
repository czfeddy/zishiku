Page({
  data: {
    src: ""
  },

  onLoad(query) {
    const src = String(query.src || "").trim();
    this.setData({
      src: decodeURIComponent(src)
    });
  }
});
