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
      buildBadge(storageEnabled ? "localStorage OK" : "localStorage unavailable", storageEnabled),
      buildBadge(meta.siteName ? "Site meta loaded" : "Site meta missing", Boolean(meta.siteName)),
      buildBadge(window.ShareHelper ? "Share helper loaded" : "Share helper missing", Boolean(window.ShareHelper)),
      buildBadge(userId ? "User id ready" : "User id missing", Boolean(userId))
    ].join("");

    envContainer.innerHTML = `
      <div>
        <strong>闂佽崵鍠愮划搴㈡櫠濡ゅ懎绠伴柛娑橈攻濞呯娀鏌ｅΟ娆惧殭闁圭懓鐖奸弻鈩冨緞鐎ｎ亶鍤嬬紓?/strong>
        <span>${escapeHtml(window.location.href)}</span>
      </div>
      <div>
        <strong>闂佽崵鍠愮划搴㈡櫠濡ゅ懎绠伴柛娑橈攻濞呯娀鏌ｅΟ娆惧殭缂佺嫏鍥ㄧ厪濠㈣埖绋戦々顒勬煟?/strong>
        <span>${escapeHtml(window.location.origin)}</span>
      </div>
      <div>
        <strong>濠电姷鏁搁崑鐐差焽濞嗘垶宕叉俊銈呮嫅缂嶆牜鈧箍鍎遍ˇ顖炴⒒椤栫偞鐓忓┑鐐茬仢閳ь剚鎸鹃幑銏ゅ幢濞戞瑧鍘?/strong>
        <span>${escapeHtml(window.navigator.userAgent)}</span>
      </div>
      <div>
        <strong>缂傚倸鍊烽悞锕€顫忚ぐ鎺撳仭鐟滄柨鐣烽幋锔芥櫜濠㈣泛锕ㄨ闁诲骸绠嶉崕鍗炩枖?/strong>
        <span>${escapeHtml(meta.siteName || "Knowledge Base")}</span>
      </div>
    `;

    const cards = [
      {
        title: "Scripts and styles",
        body: `SITE_META: ${meta.siteName ? "loaded" : "missing"}` + `\nbody title: ${document.body.dataset.title || "not set"}` + `\nCSS var --accent: ${getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "not available"}`
      },
      {
        title: "Local user id",
        body: `analytics user id:\n${userId || "missing"}`
      },
      {
        title: "Stored profile",
        body: storedProfile || "No stored profile found."
      },
      {
        title: "Share capability",
        body: `ShareHelper: ${window.ShareHelper ? "loaded" : "missing"}` + `\nWeChat JS-SDK: ${window.wx ? "loaded" : "missing"}`
      },
      {
        title: "Page checklist",
        body: "Open the home page, recharge center, and achievements page to verify navigation, lists, back behavior, and sharing prompts."
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
        window.alert("Share helper is missing. Please check whether common.js loaded correctly.");
        return;
      }

      await window.ShareHelper.prepareAndPromptShare({
        title: document.title || "Frontend test page",
        desc: "Used to verify whether the Moments share action can be prepared from the frontend test page.",
        link: window.location.href,
        imgUrl: window.SITE_META?.defaultShareImage || ""
      });
    });
  }

  render();
})();
