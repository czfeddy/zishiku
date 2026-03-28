(function () {
  const meta = window.SITE_META || {};
  const footer = document.querySelector("[data-site-footer]");
  const titlePrefix = document.querySelector("body")?.dataset?.title;
  const userKey = "zhishiku_analytics_user_id";
  const profileKey = "zhishiku_user_profile";
  const notificationSeenPrefix = "zhishiku_seen_notifications_";
  const shareToastId = "share-toast";
  const registrationModalId = "user-registration-modal";
  const registrationStatusId = "user-registration-status";
  const wechatShareAllowedHosts = Array.isArray(meta.wechatShareAllowedHosts)
    ? meta.wechatShareAllowedHosts
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    : [];
  let currentUserProfile = getStoredUserProfile();
  let currentUserState = currentUserProfile?.userId
    ? normalizeUserState({
        userId: currentUserProfile.userId,
        profile: currentUserProfile
      })
    : null;
  const userStateListeners = new Set();
  let userStatePollTimer = null;

  function normalizeHostname(value) {
    return String(value || "")
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, "")
      .split("/")[0]
      .split(":")[0]
      .trim();
  }

  function createUserId() {
    return `user-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function getAnalyticsUserId() {
    try {
      const existing = window.localStorage.getItem(userKey);
      if (existing) {
        return existing;
      }
      const next = createUserId();
      window.localStorage.setItem(userKey, next);
      return next;
    } catch (error) {
      return createUserId();
    }
  }

  function getStoredUserProfile() {
    try {
      const raw = window.localStorage.getItem(profileKey);
      if (!raw) {
        return null;
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return null;
      }

      return parsed;
    } catch (error) {
      return null;
    }
  }

  function storeUserProfile(profile) {
    currentUserProfile = profile || null;
    if (profile?.userId) {
      currentUserState = normalizeUserState({
        ...(currentUserState || {}),
        userId: String(profile.userId || "").trim(),
        profile
      });
    } else if (currentUserState?.profile) {
      currentUserState = normalizeUserState({
        ...(currentUserState || {}),
        profile: null
      });
    }
    try {
      if (!profile) {
        window.localStorage.removeItem(profileKey);
        return;
      }

      window.localStorage.setItem(profileKey, JSON.stringify(profile));
    } catch (error) {}
  }

  function getSeenNotificationIds(userId) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      return [];
    }

    try {
      const raw = window.localStorage.getItem(`${notificationSeenPrefix}${safeUserId}`);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.map((item) => String(item || "").trim()).filter(Boolean) : [];
    } catch (error) {
      return [];
    }
  }

  function storeSeenNotificationIds(userId, ids) {
    const safeUserId = String(userId || "").trim();
    if (!safeUserId) {
      return;
    }

    try {
      window.localStorage.setItem(
        `${notificationSeenPrefix}${safeUserId}`,
        JSON.stringify((ids || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 100))
      );
    } catch (error) {}
  }

  function pushSeenNotificationIds(userId, notifications) {
    const currentIds = new Set(getSeenNotificationIds(userId));
    (notifications || []).forEach((item) => {
      if (item?.id) {
        currentIds.add(String(item.id).trim());
      }
    });
    storeSeenNotificationIds(userId, Array.from(currentIds));
  }

  function normalizeUserState(state) {
    return state && typeof state === "object"
      ? {
          userId: String(state.userId || "").trim(),
          profile: state.profile || null,
          vip: state.vip || null,
          growthCustomer: state.growthCustomer || null,
          growthCustomers: Array.isArray(state.growthCustomers) ? state.growthCustomers : [],
          notifications: Array.isArray(state.notifications) ? state.notifications : []
        }
      : {
          userId: "",
          profile: null,
          vip: null,
          growthCustomer: null,
          growthCustomers: [],
          notifications: []
        };
  }

  function emitUserState(state) {
    currentUserState = normalizeUserState(state);
    if (currentUserState.profile?.userId) {
      storeUserProfile(currentUserState.profile);
    }
    userStateListeners.forEach((listener) => {
      try {
        listener(currentUserState);
      } catch (error) {}
    });
  }

  async function trackSectionView(payload) {
    if (!payload?.page || !payload?.groupKey || !payload?.subKey) {
      return;
    }

    const body = JSON.stringify({
      userId: getAnalyticsUserId(),
      action: payload?.action || "click",
      ...payload
    });

    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        "/api/analytics/track",
        new Blob([body], { type: "application/json" })
      );
      if (sent) {
        return;
      }
    }

    await fetch("/api/analytics/track", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body,
      keepalive: true
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function ensureRegistrationModal() {
    let modal = document.getElementById(registrationModalId);
    if (modal) {
      return modal;
    }

    modal = document.createElement("div");
    modal.id = registrationModalId;
    modal.className = "registration-modal";
    modal.innerHTML = `
      <div class="registration-modal__backdrop"></div>
      <div class="registration-modal__panel" role="dialog" aria-modal="true" aria-labelledby="registration-title">
        <div class="registration-modal__header">
          <p class="registration-modal__eyebrow">鏂扮敤鎴锋敞鍐?/p>
          <h2 id="registration-title">鍏堝畬鍠勪綘鐨勮祫鏂?/h2>
          <p class="registration-modal__desc">璇峰～鍐欏ご鍍忋€両D銆佺數璇濄€傚井淇°€佸ご琛斻€佸鍚嶃€佷粙缁嶅彲閫夈€?/p>
        </div>
        <form id="user-registration-form" class="registration-form">
          <div class="registration-avatar-row">
            <div class="registration-avatar-preview" id="registration-avatar-preview">
              <span>澶村儚</span>
            </div>
            <div class="registration-avatar-actions">
              <input id="registration-avatar-file" type="file" accept="image/*" />
              <input id="registration-avatar-url" name="avatarUrl" type="hidden" />
              <p class="registration-help">鏀寔涓婁紶 JPG銆丳NG銆乄EBP锛屽ぇ灏忎笉瓒呰繃 5MB銆?/p>
            </div>
          </div>
          <label>
            ID
            <input id="registration-user-id" name="userId" type="text" maxlength="60" required />
          </label>
          <label>
            濮撳悕
            <input id="registration-name" name="name" type="text" maxlength="40" />
          </label>
          <label>
            澶磋
            <input id="registration-title-input" name="title" type="text" maxlength="60" />
          </label>
          <label>
            浠嬬粛
            <textarea id="registration-introduction" name="introduction" rows="3" maxlength="300"></textarea>
          </label>
          <label>
            鐢佃瘽
            <input id="registration-phone" name="phone" type="text" maxlength="30" required />
          </label>
          <label>
            寰俊
            <input id="registration-wechat" name="wechat" type="text" maxlength="60" />
          </label>
          <p id="${registrationStatusId}" class="registration-status" aria-live="polite"></p>
          <button type="submit" class="primary-btn registration-submit">瀹屾垚娉ㄥ唽</button>
        </form>
      </div>
    `;
    document.body.appendChild(modal);

    const form = modal.querySelector("#user-registration-form");
    const avatarFileInput = modal.querySelector("#registration-avatar-file");
    const avatarUrlInput = modal.querySelector("#registration-avatar-url");
    const avatarPreview = modal.querySelector("#registration-avatar-preview");

    function updateAvatarPreview(url) {
      const value = String(url || "").trim();
      if (!value) {
        avatarPreview.innerHTML = "<span>澶村儚</span>";
        avatarPreview.classList.remove("has-image");
        return;
      }

      avatarPreview.innerHTML = `<img src="${escapeHtml(value)}" alt="娉ㄥ唽澶村儚棰勮" />`;
      avatarPreview.classList.add("has-image");
    }

    async function uploadAvatar(file) {
      if (!file) {
        return;
      }

      if (!file.type.startsWith("image/")) {
        setRegistrationStatus("请选择图片文件作为头像。", true);
        avatarFileInput.value = "";
        return;
      }

      if (file.size > 5 * 1024 * 1024) {
        setRegistrationStatus("头像图片需小于等于 5MB。", true);
        avatarFileInput.value = "";
        return;
      }

      setRegistrationStatus("姝ｅ湪涓婁紶澶村儚...", false);
      form.querySelector(".registration-submit").disabled = true;

      const data = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result || "");
          const base64 = result.includes(",") ? result.split(",")[1] : "";
          if (!base64) {
            reject(new Error("鍥剧墖璇诲彇澶辫触"));
            return;
          }
          resolve(base64);
        };
        reader.onerror = () => reject(new Error("鍥剧墖璇诲彇澶辫触"));
        reader.readAsDataURL(file);
      });

      try {
        const response = await fetch("/api/uploads/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type,
            data
          })
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "澶村儚涓婁紶澶辫触");
        }

        avatarUrlInput.value = result.file?.url || "";
        updateAvatarPreview(avatarUrlInput.value);
        setRegistrationStatus("头像上传完成，请继续填写资料。", false);
      } catch (error) {
        setRegistrationStatus(error.message || "澶村儚涓婁紶澶辫触", true);
        avatarFileInput.value = "";
      } finally {
        form.querySelector(".registration-submit").disabled = false;
      }
    }

    avatarFileInput.addEventListener("change", async () => {
      const [file] = avatarFileInput.files || [];
      try {
        await uploadAvatar(file);
      } catch (error) {
        setRegistrationStatus(error.message || "澶村儚涓婁紶澶辫触", true);
      }
    });

    form.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submitButton = form.querySelector(".registration-submit");
      submitButton.disabled = true;

      const formData = new FormData(form);
      const previousUserId = getAnalyticsUserId();
      const payload = {
        previousUserId,
        userId: String(formData.get("userId") || "").trim(),
        avatarUrl: String(formData.get("avatarUrl") || "").trim(),
        name: String(formData.get("name") || "").trim(),
        title: String(formData.get("title") || "").trim(),
        introduction: String(formData.get("introduction") || "").trim(),
        phone: String(formData.get("phone") || "").trim(),
        wechat: String(formData.get("wechat") || "").trim()
      };

      if (!payload.avatarUrl) {
        setRegistrationStatus("请先上传头像。", true);
        submitButton.disabled = false;
        return;
      }

      try {
        setRegistrationStatus("姝ｅ湪鎻愪氦娉ㄥ唽璧勬枡...", false);
        const response = await fetch("/api/users/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload)
        });
        const result = await response.json();
        if (!response.ok) {
          throw new Error(result.message || "娉ㄥ唽澶辫触");
        }

        window.localStorage.setItem(userKey, result.profile.userId);
        storeUserProfile(result.profile);
        storeSeenNotificationIds(result.profile.userId, []);
        populateRegistrationForm(result.profile);
        hideRegistrationModal();
        startUserStatePolling(result.profile.userId);
        showToast("注册完成，欢迎使用。");
      } catch (error) {
        setRegistrationStatus(error.message || "娉ㄥ唽澶辫触", true);
      } finally {
        submitButton.disabled = false;
      }
    });

    modal.updateAvatarPreview = updateAvatarPreview;
    return modal;
  }

  function setRegistrationStatus(message, isError = false) {
    const status = document.getElementById(registrationStatusId);
    if (!status) {
      return;
    }

    status.textContent = message;
    status.classList.toggle("is-error", isError);
  }

  function populateRegistrationForm(profile = {}) {
    const modal = ensureRegistrationModal();
    const form = modal.querySelector("#user-registration-form");
    form.querySelector("#registration-user-id").value = String(profile.userId || getAnalyticsUserId()).trim();
    form.querySelector("#registration-name").value = String(profile.name || "").trim();
    form.querySelector("#registration-title-input").value = String(profile.title || "").trim();
    form.querySelector("#registration-introduction").value = String(profile.introduction || "").trim();
    form.querySelector("#registration-phone").value = String(profile.phone || "").trim();
    form.querySelector("#registration-wechat").value = String(profile.wechat || "").trim();
    form.querySelector("#registration-avatar-url").value = String(profile.avatarUrl || "").trim();
    modal.updateAvatarPreview(profile.avatarUrl || "");
    setRegistrationStatus("", false);
  }

  function showRegistrationModal(profile = {}) {
    const modal = ensureRegistrationModal();
    populateRegistrationForm(profile);
    modal.classList.add("is-visible");
  }

  function hideRegistrationModal() {
    const modal = document.getElementById(registrationModalId);
    if (!modal) {
      return;
    }

    modal.classList.remove("is-visible");
  }

  async function fetchRegisteredProfile(userId) {
    const currentUserId = String(userId || "").trim();
    if (!currentUserId) {
      return null;
    }

    const response = await fetch(`/api/users/profile/${encodeURIComponent(currentUserId)}`);
    if (response.status === 404) {
      return null;
    }

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "鍔犺浇鐢ㄦ埛璧勬枡澶辫触");
    }

    return result.profile || null;
  }

  async function ensureUserRegistration() {
    const storedProfile = getStoredUserProfile();
    const currentUserId = getAnalyticsUserId();

    if (storedProfile?.userId) {
      try {
        window.localStorage.setItem(userKey, storedProfile.userId);
      } catch (error) {}
      storeUserProfile(storedProfile);
      emitUserState({
        ...(currentUserState || {}),
        userId: storedProfile.userId,
        profile: storedProfile
      });
      startUserStatePolling(storedProfile.userId);
      return storedProfile;
    }

    try {
      const remoteProfile = await fetchRegisteredProfile(currentUserId);
      if (remoteProfile) {
        storeUserProfile(remoteProfile);
        emitUserState({
          ...(currentUserState || {}),
          userId: remoteProfile.userId || currentUserId,
          profile: remoteProfile
        });
        startUserStatePolling(remoteProfile.userId || currentUserId);
        return remoteProfile;
      }
    } catch (error) {
      showToast(error.message || "鍔犺浇鐢ㄦ埛璧勬枡澶辫触", true);
    }

    showRegistrationModal({ userId: currentUserId });
    return null;
  }

  function getAbsoluteUrl(link) {
    return new URL(link || window.location.href, window.location.origin).toString();
  }

  function getValidatedShareLink(link) {
    const absoluteUrl = getAbsoluteUrl(link);
    if (!wechatShareAllowedHosts.length) {
      return absoluteUrl;
    }

    const hostname = normalizeHostname(new URL(absoluteUrl).hostname);
    if (!wechatShareAllowedHosts.includes(hostname)) {
      throw new Error("当前分享链接域名未加入微信 JS 接口安全域名，请联系管理员配置。");
    }

    return absoluteUrl;
  }

  function resolveShareImageUrl(input) {
    const value = String(input || "").trim();
    if (!value) {
      return "";
    }

    return getAbsoluteUrl(value);
  }

  function ensureHeadMeta(selector, buildElement) {
    let element = document.head.querySelector(selector);
    if (element) {
      return element;
    }

    element = buildElement();
    document.head.appendChild(element);
    return element;
  }

  function setMetaValue(selector, value, buildElement) {
    const content = String(value || "").trim();
    if (!content) {
      const existing = document.head.querySelector(selector);
      if (existing) {
        existing.remove();
      }
      return;
    }

    const element = ensureHeadMeta(selector, buildElement);
    element.setAttribute("content", content);
  }

  function updateShareMeta(payload) {
    const siteName = String(meta.siteName || "").trim();
    const title = String(payload?.title || "").trim() || document.title || siteName;
    const desc = String(payload?.desc || payload?.title || "").trim() || title || siteName;
    const link = getValidatedShareLink(payload?.link || window.location.href);
    const imgUrl = resolveShareImageUrl(payload?.imgUrl || meta.defaultShareImage);
    const pageTitle = title && siteName && !title.includes(siteName) ? `${title} - ${siteName}` : title || siteName;

    if (pageTitle) {
      document.title = pageTitle;
    }

    setMetaValue('meta[name="description"]', desc, () => {
      const tag = document.createElement("meta");
      tag.setAttribute("name", "description");
      return tag;
    });
    setMetaValue('meta[property="og:type"]', "article", () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:type");
      return tag;
    });
    setMetaValue('meta[property="og:title"]', title, () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:title");
      return tag;
    });
    setMetaValue('meta[property="og:description"]', desc, () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:description");
      return tag;
    });
    setMetaValue('meta[property="og:url"]', link, () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:url");
      return tag;
    });
    setMetaValue('meta[property="og:image"]', imgUrl, () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:image");
      return tag;
    });
    setMetaValue('meta[property="og:site_name"]', siteName, () => {
      const tag = document.createElement("meta");
      tag.setAttribute("property", "og:site_name");
      return tag;
    });
    setMetaValue('meta[name="twitter:card"]', "summary_large_image", () => {
      const tag = document.createElement("meta");
      tag.setAttribute("name", "twitter:card");
      return tag;
    });
    setMetaValue('meta[name="twitter:title"]', title, () => {
      const tag = document.createElement("meta");
      tag.setAttribute("name", "twitter:title");
      return tag;
    });
    setMetaValue('meta[name="twitter:description"]', desc, () => {
      const tag = document.createElement("meta");
      tag.setAttribute("name", "twitter:description");
      return tag;
    });
    setMetaValue('meta[name="twitter:image"]', imgUrl, () => {
      const tag = document.createElement("meta");
      tag.setAttribute("name", "twitter:image");
      return tag;
    });

    return {
      title,
      desc,
      link,
      imgUrl
    };
  }

  function ensureToast() {
    let toast = document.getElementById(shareToastId);
    if (toast) {
      return toast;
    }

    toast = document.createElement("div");
    toast.id = shareToastId;
    toast.className = "share-toast";
    toast.setAttribute("aria-live", "polite");
    toast.setAttribute("aria-atomic", "true");
    document.body.appendChild(toast);
    return toast;
  }

  const shareDebugId = "share-debug-panel";
  let shareDebugVisible = false;

  function ensureShareDebugPanel() {
    let panel = document.getElementById(shareDebugId);
    if (panel) {
      return panel;
    }

    panel = document.createElement("div");
    panel.id = shareDebugId;
    panel.style.position = "fixed";
    panel.style.left = "12px";
    panel.style.right = "12px";
    panel.style.top = "12px";
    panel.style.zIndex = "10001";
    panel.style.padding = "12px 14px";
    panel.style.borderRadius = "14px";
    panel.style.background = "rgba(15, 23, 42, 0.92)";
    panel.style.color = "#fff";
    panel.style.fontSize = "12px";
    panel.style.lineHeight = "1.6";
    panel.style.boxShadow = "0 12px 30px rgba(15, 23, 42, 0.28)";
    panel.style.whiteSpace = "pre-wrap";
    panel.style.wordBreak = "break-all";
    panel.style.maxHeight = "42vh";
    panel.style.overflow = "auto";
    panel.style.display = "none";
    document.body.appendChild(panel);
    return panel;
  }

  function showShareDebug(lines) {
    const panel = ensureShareDebugPanel();
    panel.textContent = Array.isArray(lines) ? lines.join("\n") : String(lines || "");
    panel.style.display = "block";
    shareDebugVisible = true;
  }

  function hideShareDebug() {
    const panel = document.getElementById(shareDebugId);
    if (!panel) {
      return;
    }
    panel.style.display = "none";
    shareDebugVisible = false;
  }

  let toastTimer = null;
  function showToast(message, isError = false) {
    const toast = ensureToast();
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
    toast.classList.toggle("is-error", isError);
    toast.classList.add("is-visible");

    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => {
      toast.classList.remove("is-visible");
    }, 2400);
  }

  function showVisibleNotice(message, isError = false) {
    showToast(message, isError);

    // Some mobile webviews suppress transient toasts visually.
    if (isError && typeof window.alert === "function") {
      window.setTimeout(() => {
        window.alert(String(message || "").trim() || "操作失败，请稍后重试。");
      }, 50);
    }
  }

  function notifyNewUserStateMessages(state) {
    const safeState = normalizeUserState(state);
    let hasSnapshot = false;
    try {
      hasSnapshot = Boolean(window.localStorage.getItem(`${notificationSeenPrefix}${safeState.userId}`));
    } catch (error) {}

    if (!hasSnapshot) {
      pushSeenNotificationIds(safeState.userId, safeState.notifications);
      return;
    }

    const seenIds = new Set(getSeenNotificationIds(safeState.userId));
    const newNotifications = safeState.notifications.filter((item) => item?.id && !seenIds.has(String(item.id).trim()));
    if (!newNotifications.length) {
      return;
    }

    newNotifications
      .slice()
      .reverse()
      .forEach((item, index) => {
        window.setTimeout(() => {
          showToast(item.title ? `${item.title}：${item.message || ""}` : item.message || "你有一条新通知");
        }, index * 500);
      });
    pushSeenNotificationIds(safeState.userId, newNotifications);
  }

  async function fetchUserState(userId, options = {}) {
    const safeUserId = String(userId || getAnalyticsUserId()).trim();
    if (!safeUserId) {
      return normalizeUserState();
    }

    const response = await fetch(`/api/users/state/${encodeURIComponent(safeUserId)}`);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "加载用户状态失败");
    }

    const nextState = normalizeUserState(result);
    if (options.notify !== false) {
      notifyNewUserStateMessages(nextState);
    }
    emitUserState(nextState);
    return nextState;
  }

  function subscribeUserState(listener) {
    if (typeof listener !== "function") {
      return () => {};
    }

    userStateListeners.add(listener);
    if (currentUserState) {
      listener(currentUserState);
    }

    return () => {
      userStateListeners.delete(listener);
    };
  }

  function startUserStatePolling(userId) {
    const safeUserId = String(userId || getAnalyticsUserId()).trim();
    if (!safeUserId) {
      return;
    }

    if (userStatePollTimer) {
      window.clearInterval(userStatePollTimer);
    }

    const sync = () => {
      fetchUserState(safeUserId).catch(() => {});
    };

    sync();
    userStatePollTimer = window.setInterval(sync, 15000);
  }

  function ensureShareGuide() {
    let guide = document.getElementById("wechat-share-guide");
    if (guide) {
      return guide;
    }

    guide = document.createElement("div");
    guide.id = "wechat-share-guide";
    guide.className = "share-guide";
    guide.innerHTML = `
      <div class="share-guide__backdrop" data-share-guide-close="true"></div>
      <div class="share-guide__panel">
        <button type="button" class="share-guide__close" data-share-guide-close="true" aria-label="Close">x</button>
        <div class="share-guide__arrow"></div>
        <p class="share-guide__eyebrow">微信内一键分享</p>
        <p class="share-guide__title">下一步请点右上角“...”</p>
        <p class="share-guide__desc" data-share-guide-desc></p>
        <ol class="share-guide__steps">
          <li>点击微信右上角“...”</li>
          <li>选择“分享到朋友圈”</li>
          <li>直接发送即可</li>
        </ol>
        <div class="share-guide__actions">
          <button type="button" class="primary-btn" data-share-guide-close="true">已知道，去分享</button>
        </div>
      </div>
    `;
    document.body.appendChild(guide);

    guide.addEventListener("click", (event) => {
      if (event.target.closest("[data-share-guide-close]")) {
        guide.classList.remove("is-visible");
        document.body.style.overflow = "";
      }
    });

    return guide;
  }

  function buildGuideMessage(payload) {
    const title = String(payload?.title || "").trim();
    const shareMode = String(payload?.shareMode || "").trim();
    if (title) {
      if (shareMode === "moments") {
        return "头图、标题和摘要已经准备好。微信限制网页直接拉起朋友圈面板，请在当前页面点击右上角“...”，进入朋友圈发布页后自行填写文案，再完成发布。";
      }
      return `分享内容已经准备好。微信限制网页直接拉起朋友圈面板，请在当前页面点击右上角“...”，把“${title}”分享到朋友圈。`;
    }

    return "分享内容已经准备好。微信限制网页直接拉起朋友圈面板，请点击右上角“...”，然后选择“分享到朋友圈”。";
  }

  function showShareGuide(payload) {
    const guide = ensureShareGuide();
    const desc = guide.querySelector("[data-share-guide-desc]");

    if (desc) {
      desc.textContent = buildGuideMessage(payload);
    }

    guide.classList.add("is-visible");
    document.body.style.overflow = "hidden";
  }

  async function copyText(value) {
    const text = String(value || "").trim();
    if (!text) {
      throw new Error("copy text is empty");
    }

    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const input = document.createElement("textarea");
    input.value = text;
    input.setAttribute("readonly", "true");
    input.style.position = "fixed";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    document.execCommand("copy");
    input.remove();
  }

  function readWechatEnvironmentHints() {
    const userAgent = String(window.navigator.userAgent || "").toLowerCase();
    const miniProgramFlag = String(window.__wxjs_environment || "").toLowerCase();

    return {
      byUserAgent: /micromessenger|wxwork/i.test(userAgent),
      byBridge: typeof window.WeixinJSBridge !== "undefined",
      byMiniProgramFlag: miniProgramFlag === "miniprogram",
      byMiniProgramSdk: Boolean(window.wx?.miniProgram)
    };
  }

  function isWechatBrowser() {
    const hints = readWechatEnvironmentHints();
    return hints.byUserAgent || hints.byBridge || hints.byMiniProgramFlag || hints.byMiniProgramSdk;
  }

  function waitForWechatEnvironment(timeoutMs = 1200) {
    if (isWechatBrowser()) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timer);
        document.removeEventListener("WeixinJSBridgeReady", handleReady);
        resolve(Boolean(value));
      };
      const handleReady = () => finish(isWechatBrowser());
      const timer = window.setTimeout(() => finish(isWechatBrowser()), timeoutMs);

      document.addEventListener("WeixinJSBridgeReady", handleReady, { once: true });
    });
  }

  async function trySystemShare(payload) {
    if (typeof navigator.share !== "function") {
      return false;
    }

    const shareData = {
      title: String(payload?.title || "").trim() || document.title,
      text: String(payload?.desc || payload?.title || "").trim(),
      url: getValidatedShareLink(payload?.link)
    };

    try {
      await navigator.share(shareData);
      return true;
    } catch (error) {
      if (error?.name === "AbortError") {
        return true;
      }
      return false;
    }
  }

  function getShareActionLabel() {
    return isWechatBrowser() ? "分享朋友圈" : "分享链接";
  }

  let signaturePromise = null;
  let wxReadyPromise = null;
  let lastShareKey = "";
  let bridgeReadyPromise = null;
  let lastBridgeShareKey = "";
  let shareDebugLines = [];

  function resetShareDebug() {
    shareDebugLines = [];
  }

  function pushShareDebug(label, value) {
    const line = value === undefined ? String(label) : `${label}: ${String(value)}`;
    shareDebugLines.push(line);
    showShareDebug(shareDebugLines);
  }

  function flushShareDebugAlert() {
    if (!shareDebugLines.length || typeof window.alert !== "function") {
      return;
    }
    window.setTimeout(() => {
      window.alert(`Share Debug\n\n${shareDebugLines.join("\n")}`);
    }, 80);
  }

  function reportShareDebug() {
    const payload = JSON.stringify({
      path: window.location.href,
      userAgent: navigator.userAgent,
      lines: shareDebugLines
    });

    if (navigator.sendBeacon) {
      try {
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("/api/share-debug", blob);
        return;
      } catch (error) {}
    }

    fetch("/api/share-debug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: payload,
      keepalive: true
    }).catch(() => {});
  }

  function waitForWxReady() {
    if (wxReadyPromise) {
      return wxReadyPromise;
    }

    wxReadyPromise = new Promise((resolve, reject) => {
      if (!window.wx) {
        reject(new Error("WeChat JS SDK is not loaded."));
        return;
      }

      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        wxReadyPromise = null;
        reject(new Error("WeChat JS SDK ready timeout."));
      }, 1800);

      const finish = (callback) => (...args) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeout);
        callback(...args);
      };

      window.wx.ready(
        finish(() => {
          resolve();
        })
      );
      window.wx.error(
        finish((error) => {
          wxReadyPromise = null;
          reject(new Error(error?.errMsg || "wx.config validation failed."));
        })
      );
    }).catch((error) => {
      wxReadyPromise = null;
      throw error;
    });

    return wxReadyPromise;
  }

  function waitForWeixinBridge(timeoutMs = 4000) {
    if (bridgeReadyPromise) {
      return bridgeReadyPromise;
    }

    bridgeReadyPromise = new Promise((resolve, reject) => {
      if (window.WeixinJSBridge && typeof window.WeixinJSBridge.invoke === "function") {
        resolve(window.WeixinJSBridge);
        return;
      }

      const timer = window.setTimeout(() => {
        bridgeReadyPromise = null;
        reject(new Error("WeixinJSBridge not ready."));
      }, timeoutMs);

      const handleReady = () => {
        window.clearTimeout(timer);
        resolve(window.WeixinJSBridge);
      };

      document.addEventListener("WeixinJSBridgeReady", handleReady, { once: true });
    }).catch((error) => {
      bridgeReadyPromise = null;
      throw error;
    });

    return bridgeReadyPromise;
  }

  async function fetchWechatSignature() {
    pushShareDebug("1.signature.request", window.location.href.split("#")[0]);
    if (signaturePromise) {
      return signaturePromise;
    }

    signaturePromise = fetch(
      `/api/wechat/signature?url=${encodeURIComponent(window.location.href.split("#")[0])}`
    )
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) {
          const error = new Error(result.message || "Failed to get WeChat signature.");
          if (result?.configured === false || response.status === 503) {
            error.code = "WECHAT_NOT_CONFIGURED";
          }
          pushShareDebug("1.signature.fail", result.message || response.status);
          throw error;
        }
        pushShareDebug("1.signature.ok", `${result.appId || ""} / ${result.timestamp || ""}`);
        return result;
      })
      .catch((error) => {
        signaturePromise = null;
        throw error;
      });

    return signaturePromise;
  }

  function isWechatConfigError(error) {
    return error?.code === "WECHAT_NOT_CONFIGURED";
  }

  async function ensureWechatSdk() {
    if (!isWechatBrowser()) {
      throw new Error("Please open this page inside WeChat.");
    }

    if (!window.wx) {
      throw new Error("WeChat JS SDK script is missing.");
    }

    const signature = await fetchWechatSignature();
    pushShareDebug("2.wx.config", "start");
    window.wx.config({
      debug: false,
      appId: signature.appId,
      timestamp: Number(signature.timestamp),
      nonceStr: signature.nonceStr,
      signature: signature.signature,
      jsApiList: [
        "updateAppMessageShareData",
        "updateTimelineShareData",
        "onMenuShareAppMessage",
        "onMenuShareTimeline"
      ],
      openTagList: ["wx-open-launch-weapp"]
    });

    await waitForWxReady();
    pushShareDebug("2.wx.ready", "ok");
  }

  function callWechatShareApi(method, options) {
    return new Promise((resolve, reject) => {
      if (!window.wx || typeof window.wx[method] !== "function") {
        pushShareDebug(`3.sdk.${method}`, "unsupported");
        resolve({ supported: false });
        return;
      }

      let settled = false;
      const timeout = window.setTimeout(() => {
        if (settled) {
          return;
        }
        settled = true;
        pushShareDebug(`3.sdk.${method}`, "timeout");
        resolve({ supported: true, timedOut: true });
      }, 1200);

      const finish = (callback) => (payload) => {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeout);
        callback(payload);
      };

      try {
        window.wx[method]({
          ...options,
          success: finish(() => {
            pushShareDebug(`3.sdk.${method}`, "ok");
            resolve({ supported: true });
          }),
          fail: finish((error) => {
            pushShareDebug(`3.sdk.${method}`, error?.errMsg || error?.err_msg || "fail");
            reject(error || new Error(`${method} failed`));
          }),
          cancel: finish(() => {
            pushShareDebug(`3.sdk.${method}`, "cancel");
            resolve({ supported: true, cancelled: true });
          })
        });
      } catch (error) {
        if (settled) {
          return;
        }
        settled = true;
        window.clearTimeout(timeout);
        reject(error);
      }
    });
  }

  function callWeixinBridge(method, options) {
    return new Promise((resolve, reject) => {
      if (!window.WeixinJSBridge || typeof window.WeixinJSBridge.invoke !== "function") {
        resolve({ supported: false });
        return;
      }

      try {
        window.WeixinJSBridge.invoke(method, options, (response) => {
          const errMsg = String(response?.err_msg || response?.errMsg || "").toLowerCase();
          if (!errMsg || errMsg.includes(":ok")) {
            pushShareDebug(`4.bridge.${method}`, response?.err_msg || response?.errMsg || "ok");
            resolve({ supported: true, response });
            return;
          }
          if (errMsg.includes(":cancel")) {
            pushShareDebug(`4.bridge.${method}`, "cancel");
            resolve({ supported: true, cancelled: true, response });
            return;
          }
          reject(new Error(response?.err_msg || response?.errMsg || `${method} failed`));
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async function registerWeixinBridgeShare(payload) {
    const nextMeta = updateShareMeta(payload);
    const title = nextMeta.title || document.title;
    const desc = nextMeta.desc || document.title;
    const link = nextMeta.link;
    const imgUrl = nextMeta.imgUrl;

    if (!imgUrl) {
      throw new Error("Please configure an absolute share image URL.");
    }

    await waitForWeixinBridge();
    pushShareDebug("4.bridge.ready", "ok");

    const shareKey = [title, desc, link, imgUrl].join("::");
    if (shareKey === lastBridgeShareKey) {
      return;
    }

    const appMessagePayload = {
      appid: "",
      img_url: imgUrl,
      img_width: "120",
      img_height: "120",
      link,
      desc,
      title
    };
    const timelinePayload = {
      appid: "",
      img_url: imgUrl,
      img_width: "120",
      img_height: "120",
      link,
      desc,
      title
    };

    window.WeixinJSBridge.on("menu:share:appmessage", () => {
      window.WeixinJSBridge.invoke("sendAppMessage", appMessagePayload, () => {});
    });
    window.WeixinJSBridge.on("menu:share:timeline", () => {
      window.WeixinJSBridge.invoke("shareTimeline", timelinePayload, () => {});
    });

    lastBridgeShareKey = shareKey;
    pushShareDebug("4.bridge.bind", "ok");
  }

  async function applyWechatShareData(payload) {
    const nextMeta = updateShareMeta(payload);
    const title = nextMeta.title || document.title;
    const desc = nextMeta.desc || document.title;
    const link = nextMeta.link;
    const imgUrl = nextMeta.imgUrl;

    if (!imgUrl) {
      pushShareDebug("share.image", "missing");
      throw new Error("Please configure an absolute share image URL.");
    }
    pushShareDebug("share.title", title);
    pushShareDebug("share.link", link);
    pushShareDebug("share.img", imgUrl);
    await ensureWechatSdk();

    const shareKey = [title, desc, link, imgUrl].join("::");
    if (shareKey === lastShareKey && !payload?.forceRefresh) {
      pushShareDebug("3.sdk.shareKey", "skip-same");
      await registerWeixinBridgeShare(payload).catch(() => {});
      return;
    }
    pushShareDebug("3.sdk.shareKey", payload?.forceRefresh ? "force-refresh" : "new");

    const tasks = [
      callWechatShareApi("updateAppMessageShareData", {
        title,
        desc,
        link,
        imgUrl
      }),
      callWechatShareApi("updateTimelineShareData", {
        title,
        link,
        imgUrl
      }),
      callWechatShareApi("onMenuShareAppMessage", {
        title,
        desc,
        link,
        imgUrl
      }),
      callWechatShareApi("onMenuShareTimeline", {
        title,
        link,
        imgUrl
      })
    ];

    const results = await Promise.all(tasks);
    if (!results.some((item) => item?.supported)) {
      pushShareDebug("3.sdk.result", "unsupported");
      throw new Error("当前微信环境不支持网页分享接口。");
    }

    lastShareKey = shareKey;
    pushShareDebug("3.sdk.result", "ok");
    await registerWeixinBridgeShare(payload).catch(() => {});
  }

  async function prepareAndPromptShare(payload) {
    resetShareDebug();
    pushShareDebug("share.mode", payload?.shareMode || "default");
    pushShareDebug("wechat.ua", navigator.userAgent);
    if (!payload?.title) {
      showVisibleNotice("缺少分享标题，暂时无法发起分享。", true);
      return { method: "invalid" };
    }

    let shareLink = "";
    try {
      shareLink = getValidatedShareLink(payload?.link);
    } catch (error) {
      showVisibleNotice(error.message || "\u5206\u4eab\u94fe\u63a5\u4e0d\u5408\u89c4\u3002", true);
      return { method: "invalid-link" };
    }

    const inWechat = await waitForWechatEnvironment();
    pushShareDebug("wechat.env", inWechat ? "ok" : "not-wechat");
    if (!inWechat) {
      showVisibleNotice("请在微信内打开当前页面后，再点击右上角“...”分享到朋友圈。网页无法直接拉起朋友圈发布页。", true);
      return { method: "not-wechat" };
    }

    const nextPayload = { ...payload, link: shareLink };
    try {
      updateShareMeta(nextPayload);
      showToast("正在准备分享信息，请稍候...");
      await applyWechatShareData({ ...nextPayload, forceRefresh: true });
      showShareGuide(nextPayload);
      if (String(nextPayload.shareMode || "").trim() === "moments") {
        showVisibleNotice("头图、标题、摘要已准备好，请点微信右上角“...”，进入朋友圈后自行填写文案再发布。");
      } else {
        showVisibleNotice("分享信息已准备好，请点击微信右上角“...”并选择“分享到朋友圈”。");
      }
      reportShareDebug();
      flushShareDebugAlert();
      return { method: "wechat-guide" };
    } catch (error) {
      if (isWechatConfigError(error)) {
        pushShareDebug("share.error", error.message || "manual-guide");
        updateShareMeta(nextPayload);
        showShareGuide(nextPayload);
        showToast("当前环境未完成微信配置，请在微信内通过右上角菜单继续分享。");
        reportShareDebug();
        flushShareDebugAlert();
        return { method: "manual-guide" };
      }

      pushShareDebug("share.error", error.message || "unknown");
      showShareGuide(nextPayload);
      showVisibleNotice(error.message || "\u5fae\u4fe1\u5206\u4eab\u521d\u59cb\u5316\u5931\u8d25\u3002", true);
      reportShareDebug();
      flushShareDebugAlert();
      return { method: "error" };
    }
  }

  window.AnalyticsTracker = {
    getUserId: getAnalyticsUserId,
    getProfile: () => currentUserProfile,
    getUserState: () => currentUserState,
    fetchUserState: () => fetchUserState(getAnalyticsUserId()),
    subscribeUserState,
    trackSectionView
  };

  window.ShareHelper = {
    applyWechatShareData,
    prepareAndPromptShare,
    updateShareMeta,
    isWechatBrowser,
    getShareActionLabel,
    showToast,
    showVisibleNotice,
    showShareDebug,
    hideShareDebug
  };

  if (titlePrefix && meta.siteName) {
    document.title = `${titlePrefix} - ${meta.siteName}`;
  }

  if (!footer) {
    ensureUserRegistration().catch(() => {});
    return;
  }

  const items = [];

  if (meta.companyName) {
    items.push(`<span>${meta.companyName}</span>`);
  }

  if (meta.icpNumber) {
    items.push(`<span>ICP: ${meta.icpNumber}</span>`);
  }

  if (meta.publicSecurityNumber) {
    const text = `Public security: ${meta.publicSecurityNumber}`;
    items.push(
      meta.publicSecurityUrl
        ? `<a href="${meta.publicSecurityUrl}" target="_blank" rel="noreferrer">${text}</a>`
        : `<span>${text}</span>`
    );
  }

  if (meta.contactEmail) {
    items.push(`<a href="mailto:${meta.contactEmail}">${meta.contactEmail}</a>`);
  }

  if (meta.contactPhone) {
    items.push(`<span>${meta.contactPhone}</span>`);
  }

  if (!items.length) {
    footer.remove();
    return;
  }

  footer.innerHTML = `<div class="site-footer__inner">${items.join("")}</div>`;
  ensureUserRegistration().catch(() => {});
})();

