(function () {
  const userKey = "zhishiku_analytics_user_id";
  const profileKey = "zhishiku_user_profile";
  const envContainer = document.getElementById("frontend-env");
  const badgesContainer = document.getElementById("frontend-status-badges");
  const resultsContainer = document.getElementById("frontend-results");
  const refreshButton = document.getElementById("frontend-refresh");
  const resetUserButton = document.getElementById("frontend-reset-user");
  const shareTestButton = document.getElementById("frontend-share-test");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function createUserId() {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function safeStorageRead(key) {
    try {
      return window.localStorage.getItem(key);
    } catch (error) {
      return null;
    }
  }

  function safeStorageWrite(key, value) {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      return false;
    }
  }

  function ensureUserId() {
    const existing = safeStorageRead(userKey);
    if (existing) {
      return existing;
    }

    const next = createUserId();
    safeStorageWrite(userKey, next);
    return next;
  }

  function buildBadge(label, ok) {
    return `<span class="test-badge ${ok ? "is-ok" : "is-warn"}">${escapeHtml(label)}</span>`;
  }

  function render() {
    const meta = window.SITE_META || {};
    const userId = ensureUserId();
    const storedProfile = safeStorageRead(profileKey);
    const storageEnabled = (() => {
      try {
        const probe = `probe-${Date.now()}`;
        window.localStorage.setItem(probe, "1");
        window.localStorage.removeItem(probe);
        return true;
      } catch (error) {
        return false;
      }
    })();

    badgesContainer.innerHTML = [
      buildBadge(storageEnabled ? "localStorage 可用" : "localStorage 不可用", storageEnabled),
      buildBadge(meta.siteName ? "站点配置已加载" : "站点配置缺失", Boolean(meta.siteName)),
      buildBadge(window.ShareHelper ? "分享组件已加载" : "分享组件未加载", Boolean(window.ShareHelper)),
      buildBadge(userId ? "用户标识已生成" : "用户标识未生成", Boolean(userId))
    ].join("");

    envContainer.innerHTML = `
      <div>
        <strong>当前地址</strong>
        <span>${escapeHtml(window.location.href)}</span>
      </div>
      <div>
        <strong>当前来源</strong>
        <span>${escapeHtml(window.location.origin)}</span>
      </div>
      <div>
        <strong>浏览器信息</strong>
        <span>${escapeHtml(window.navigator.userAgent)}</span>
      </div>
      <div>
        <strong>站点名称</strong>
        <span>${escapeHtml(meta.siteName || "未配置")}</span>
      </div>
    `;

    const cards = [
      {
        title: "脚本与样式",
        body: `SITE_META: ${meta.siteName ? "已加载" : "未加载"}\nbody title: ${document.body.dataset.title || "未设置"}\n样式变量 --accent: ${getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "未读取到"}`
      },
      {
        title: "本地用户标识",
        body: `analytics user id:\n${userId || "未生成"}`
      },
      {
        title: "本地用户资料",
        body: storedProfile || "当前没有已保存的用户资料。"
      },
      {
        title: "分享能力",
        body: `ShareHelper: ${window.ShareHelper ? "已加载" : "未加载"}\n微信 JS-SDK: ${window.wx ? "已加载" : "未加载"}`
      },
      {
        title: "页面检查建议",
        body: "请依次打开首页、资源中心、成长体系和后台页面，确认按钮、列表、返回操作以及分享提示都正常。"
      }
    ];

    resultsContainer.innerHTML = cards
      .map(
        (card) => `
          <article class="test-result">
            <strong>${escapeHtml(card.title)}</strong>
            <pre>${escapeHtml(card.body)}</pre>
          </article>
        `
      )
      .join("");
  }

  refreshButton.addEventListener("click", render);
  resetUserButton.addEventListener("click", () => {
    try {
      window.localStorage.removeItem(userKey);
      window.localStorage.removeItem(profileKey);
    } catch (error) {}
    render();
  });

  if (shareTestButton) {
    shareTestButton.addEventListener("click", async () => {
      if (!window.ShareHelper) {
        window.alert("分享组件未加载，请先检查 common.js 是否正常执行。");
        return;
      }

      await window.ShareHelper.prepareAndPromptShare({
        title: document.title || "前端测试页",
        desc: "用于验证网页测试版里的朋友圈转发按钮是否能正常触发。",
        link: window.location.href,
        imgUrl: window.SITE_META?.defaultShareImage || ""
      });
    });
  }

  render();
})();
