function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return escapeHtml(value);
  }

  return escapeHtml(date.toLocaleString("zh-CN"));
}

function getSubsectionLink(content) {
  if (!content?.page || !content?.groupKey || !content?.subKey) {
    return "/";
  }

  return `/section/${encodeURIComponent(content.page)}/${encodeURIComponent(content.groupKey)}/${encodeURIComponent(
    content.subKey
  )}`;
}

function getDetailLink(content) {
  return String(content?.detailLink || "").trim() || `/content/${encodeURIComponent(content?.slug || "")}`;
}

function getSharePublicLink(content) {
  return String(content?.sharePublicLink || "").trim() || `/share/${encodeURIComponent(content?.slug || "")}`;
}

function getCurrentUserProfile() {
  return (
    window.AnalyticsTracker?.getProfile?.() ||
    window.AnalyticsTracker?.getUserState?.()?.profile ||
    getStoredUserProfileFallback() ||
    null
  );
}

function getStoredUserProfileFallback() {
  try {
    const raw = window.localStorage.getItem("zhishiku_user_profile");
    if (!raw) {
      return null;
    }

    const profile = JSON.parse(raw);
    return profile && typeof profile === "object" ? profile : null;
  } catch (error) {
    return null;
  }
}

async function fetchDirectUserProfile() {
  const userId = String(window.AnalyticsTracker?.getUserId?.() || "").trim();
  if (!userId) {
    return null;
  }

  const response = await fetch(`/api/users/profile/${encodeURIComponent(userId)}`);
  if (response.status === 404) {
    return null;
  }

  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "加载用户资料失败");
  }

  return result.profile || null;
}

function buildCardProfile(content, userProfile) {
  const profile = userProfile && typeof userProfile === "object" ? userProfile : null;
  if (!profile?.userId) {
    return null;
  }

  return {
    name: String(profile.name || profile.userId || "").trim(),
    role: String(profile.title || "").trim() || "注册用户",
    description:
      String(profile.introduction || "").trim() ||
      `专注${String(content.subLabel || content.groupLabel || "融资服务").trim()}，欢迎咨询`,
    avatarUrl: String(profile.avatarUrl || "").trim(),
    phone: String(profile.phone || "").trim(),
    wechat: String(profile.wechat || "").trim()
  };
}

function getInitials(name) {
  const clean = String(name || "").trim();
  return clean ? clean.slice(0, 2) : "顾问";
}

function renderContactCard(content, userProfile) {
  const profile = buildCardProfile(content, userProfile);
  if (!profile) {
    return "";
  }

  const avatar = profile.avatarUrl
    ? `<img class="detail-contact-card__avatar-img" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.name)}" />`
    : `<span class="detail-contact-card__avatar-fallback">${escapeHtml(getInitials(profile.name))}</span>`;

  return `
    <section class="detail-contact-card share-contact-card">
      <div class="detail-contact-card__avatar">${avatar}</div>
      <div class="detail-contact-card__content">
        <div class="detail-contact-card__headline">
          <h2>${escapeHtml(profile.name)}</h2>
          <span class="detail-contact-card__badge">${escapeHtml(profile.role)}</span>
        </div>
        <p class="detail-contact-card__desc">${escapeHtml(profile.description)}</p>
        <div class="detail-contact-card__meta">
          ${profile.phone ? `<span>电话：${escapeHtml(profile.phone)}</span>` : ""}
          ${profile.wechat ? `<span>微信：${escapeHtml(profile.wechat)}</span>` : ""}
        </div>
      </div>
      <div class="detail-contact-card__actions">
        ${profile.phone ? `<a class="detail-contact-card__action" href="tel:${escapeHtml(profile.phone)}" aria-label="拨打电话"><span class="detail-contact-card__action-icon">电</span></a>` : ""}
        ${profile.wechat ? `<button type="button" class="detail-contact-card__action detail-contact-card__action--wechat" data-wechat="${escapeHtml(profile.wechat)}" aria-label="复制微信号"><span class="detail-contact-card__action-icon">微</span></button>` : ""}
      </div>
    </section>
  `;
}

function renderSharePage(content, userProfile) {
  const summary = String(content.summary || "").trim();
  const image = String(content.shareImageUrl || "").trim();

  return `
    <section class="detail-card share-page-card">
      <div class="share-hero">
        <p class="share-hero__eyebrow">朋友圈专用分享页</p>
        <h1>${escapeHtml(content.title || "")}</h1>
        <p class="share-hero__desc">${escapeHtml(summary || content.subLabel || content.groupLabel || "分享内容已准备完成")}</p>
        <div class="share-hero__meta">
          <span>${escapeHtml(content.groupLabel || "内容")}</span>
          <span>${escapeHtml(content.subLabel || "分享页")}</span>
          <span>${formatDateTime(content.createdAt)}</span>
        </div>
      </div>

      ${image ? `<div class="share-cover"><img src="${escapeHtml(image)}" alt="${escapeHtml(content.title || "分享封面")}" /></div>` : ""}

      ${renderContactCard(content, userProfile)}

      <section class="share-panel">
        <h2>核心信息</h2>
        <p class="share-panel__body">${escapeHtml(content.body || summary || "当前内容已配置为分享页。")}</p>
      </section>

      <div class="chip-row share-page-card__actions">
        <button type="button" class="chip chip--primary" id="share-page-btn">分享到朋友圈</button>
        <a class="chip" href="${escapeHtml(getDetailLink(content))}">查看正文页</a>
        <a class="chip" href="${escapeHtml(getSubsectionLink(content))}">返回列表</a>
      </div>
    </section>
  `;
}

function bindShareActions(content) {
  const shareButton = document.getElementById("share-page-btn");
  if (shareButton) {
    shareButton.addEventListener("click", () => {
      if (!window.ShareHelper?.prepareAndPromptShare) {
        window.alert("分享模块加载失败，请刷新页面后重试。");
        return;
      }

      window.ShareHelper.prepareAndPromptShare({
        title: content.title,
        desc: content.summary,
        link: getSharePublicLink(content),
        imgUrl: content.shareImageUrl,
        shareMode: "moments"
      }).then((result) => {
        if (!window.AnalyticsTracker || !["wechat-guide", "manual-guide"].includes(result?.method)) {
          return;
        }

        window.AnalyticsTracker.trackSectionView({
          page: content.page,
          groupKey: content.groupKey,
          subKey: content.subKey,
          contentId: content.id,
          contentSlug: content.slug,
          contentTitle: content.title,
          source: "share-page-guide"
        }).catch(() => {});
      });
    });
  }

  const wechatButton = document.querySelector("[data-wechat]");
  if (wechatButton) {
    wechatButton.addEventListener("click", async () => {
      const wechat = wechatButton.getAttribute("data-wechat") || "";
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(wechat);
        }
        window.ShareHelper?.showToast?.(`微信号已复制：${wechat}`);
      } catch (error) {
        window.alert(`微信号：${wechat}`);
      }
    });
  }
}

async function loadSharePage() {
  const slug = window.location.pathname.split("/").pop();
  const root = document.getElementById("share-app");
  const response = await fetch(`/api/content/${slug}`);

  if (!response.ok) {
    root.innerHTML = `
      <section class="detail-card">
        <h1>分享内容不存在</h1>
        <p class="detail-meta">请检查分享链接是否正确。</p>
        <a class="chip" href="/">返回首页</a>
      </section>
    `;
    return;
  }

  const { content } = await response.json();
  let currentUserProfile = getCurrentUserProfile();

  if (window.location.search && window.history?.replaceState) {
    window.history.replaceState({}, "", getSharePublicLink(content));
  }

  if (window.AnalyticsTracker) {
    window.AnalyticsTracker.trackSectionView({
      page: content.page,
      groupKey: content.groupKey,
      subKey: content.subKey,
      contentId: content.id,
      contentSlug: content.slug,
      contentTitle: content.title,
      source: "share-page-view"
    }).catch(() => {});
  }

  const renderPage = () => {
    root.innerHTML = renderSharePage(content, currentUserProfile);
    bindShareActions(content);
  };

  renderPage();

  if (window.ShareHelper) {
    const payload = {
      title: content.title,
      desc: content.summary,
      link: getSharePublicLink(content),
      imgUrl: content.shareImageUrl,
      shareMode: "moments"
    };
    window.ShareHelper.updateShareMeta?.(payload);
    window.ShareHelper.applyWechatShareData(payload).catch(() => {});
  }

  if (window.AnalyticsTracker?.subscribeUserState) {
    window.AnalyticsTracker.subscribeUserState((state) => {
      const nextProfile = state?.profile || null;
      const previousSnapshot = JSON.stringify(currentUserProfile || {});
      const nextSnapshot = JSON.stringify(nextProfile || {});
      if (previousSnapshot === nextSnapshot) {
        return;
      }

      currentUserProfile = nextProfile;
      renderPage();
    });
  }

  if (!currentUserProfile) {
    const profileRequests = [];

    if (window.AnalyticsTracker?.fetchUserState) {
      profileRequests.push(
        window.AnalyticsTracker.fetchUserState().then((state) => state?.profile || null)
      );
    }

    profileRequests.push(fetchDirectUserProfile().catch(() => null));

    Promise.allSettled(profileRequests).then((results) => {
      const nextProfile = results
        .filter((item) => item.status === "fulfilled")
        .map((item) => item.value)
        .find((profile) => profile?.userId) || null;

      if (!nextProfile) {
        return;
      }

      currentUserProfile = nextProfile;
      renderPage();
    });
  }
}

loadSharePage().catch(() => {
  document.getElementById("share-app").innerHTML = `
    <section class="detail-card">
      <h1>分享页加载失败</h1>
      <a class="chip" href="/">返回首页</a>
    </section>
  `;
});
