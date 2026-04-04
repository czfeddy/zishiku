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

function getPageLink(page) {
  switch (String(page || "").trim()) {
    case "recharge":
      return "/recharge.html";
    case "achievements":
      return "/achievements.html";
    case "notes":
      return "/notes.html";
    case "home":
    default:
      return "/";
  }
}

function getGroupLink(content) {
  if (!content?.page || !content?.groupKey) {
    return "/";
  }

  return `/section/${encodeURIComponent(content.page)}/${encodeURIComponent(content.groupKey)}`;
}

function getSubsectionLink(content) {
  if (!content?.page || !content?.groupKey || !content?.subKey) {
    return "/";
  }

  return `/section/${encodeURIComponent(content.page)}/${encodeURIComponent(content.groupKey)}/${encodeURIComponent(content.subKey)}`;
}

function buildContentShareLink(content) {
  if (!content?.slug) {
    return "";
  }

  const baseLink = `/content/${encodeURIComponent(content.slug)}`;
  const shareVersion = String(content.updatedAt || content.createdAt || content.shareImageUrl || content.title || "").trim();
  if (!shareVersion) {
    return baseLink;
  }

  let hash = 0;
  for (let index = 0; index < shareVersion.length; index += 1) {
    hash = (hash * 31 + shareVersion.charCodeAt(index)) >>> 0;
  }

  return `${baseLink}?sharev=${hash.toString(16)}`;
}

function buildMiniProgramMeta(content) {
  const miniProgramPath = String(content?.miniProgramPath || "").trim();
  const miniProgramAppId = String(content?.miniProgramAppId || "").trim();
  const miniProgramOriginalId = String(content?.miniProgramOriginalId || "").trim();
  const miniProgramName = String(content?.miniProgramName || "").trim();
  const miniProgramLaunchUrl = String(content?.miniProgramLaunchUrl || "").trim();
  const miniProgramNote = String(content?.miniProgramNote || "").trim();

  if (!miniProgramPath && !miniProgramLaunchUrl && !miniProgramOriginalId) {
    return null;
  }

  return {
    miniProgramPath,
    miniProgramAppId,
    miniProgramOriginalId,
    miniProgramName,
    miniProgramLaunchUrl,
    miniProgramNote
  };
}

function getPreferredMomentsShareLink(content) {
  const externalUrl = String(content?.externalUrl || "").trim();
  if (/^https:\/\/mp\.weixin\.qq\.com\//i.test(externalUrl)) {
    return externalUrl;
  }

  return String(content?.link || "").trim();
}

function hasOfficialAccountArticleLink(content) {
  return /^https:\/\/mp\.weixin\.qq\.com\//i.test(String(content?.externalUrl || "").trim());
}

function getMiniProgramLaunchUrl(content) {
  return String(content?.miniProgramLaunchUrl || "").trim();
}

function renderMiniProgramBridge(content) {
  const miniProgram = buildMiniProgramMeta(content);
  if (!miniProgram) {
    return "";
  }

  const metaRows = [];
  if (miniProgram.miniProgramName) {
    metaRows.push(`<p><strong>小程序：</strong>${escapeHtml(miniProgram.miniProgramName)}</p>`);
  }
  if (miniProgram.miniProgramAppId) {
    metaRows.push(`<p><strong>AppID：</strong>${escapeHtml(miniProgram.miniProgramAppId)}</p>`);
  }
  if (miniProgram.miniProgramOriginalId) {
    metaRows.push(`<p><strong>原始ID：</strong>${escapeHtml(miniProgram.miniProgramOriginalId)}</p>`);
  }
  if (miniProgram.miniProgramPath) {
    metaRows.push(`<p><strong>页面路径：</strong>${escapeHtml(miniProgram.miniProgramPath)}</p>`);
  }

  const launchTag = miniProgram.miniProgramOriginalId && miniProgram.miniProgramPath
    ? `
      <wx-open-launch-weapp
        id="open-mini-program-tag"
        username="${escapeHtml(miniProgram.miniProgramOriginalId)}"
        path="${escapeHtml(miniProgram.miniProgramPath)}"
      >
        <template>
          <button type="button" class="chip chip--primary detail-mini-program-launch-button">直接打开小程序分享版</button>
        </template>
      </wx-open-launch-weapp>
    `
    : "";

  return `
    <section class="detail-mini-program-card">
      <p class="detail-mini-program-card__eyebrow">朋友圈小程序卡片测试</p>
      <h2 class="detail-mini-program-card__title">这篇内容已经映射到现有小程序分享壳</h2>
      <p class="detail-mini-program-card__desc">
        ${escapeHtml(
          miniProgram.miniProgramNote ||
            "建议先在现有小程序里打开这篇内容的分享壳页面，再从小程序右上角分享到朋友圈进行真机验证。"
        )}
      </p>
      <div class="detail-mini-program-card__meta">${metaRows.join("")}</div>
      <div class="chip-row detail-mini-program-card__actions">
        ${launchTag}
        ${
          miniProgram.miniProgramLaunchUrl
            ? `<button type="button" class="chip chip--primary" id="open-mini-program-btn" data-mini-program-launch-url="${escapeHtml(miniProgram.miniProgramLaunchUrl)}">打开小程序分享版</button>`
            : ""
        }
        ${
          miniProgram.miniProgramPath
            ? `<button type="button" class="chip" id="copy-mini-program-path-btn" data-mini-program-path="${escapeHtml(miniProgram.miniProgramPath)}">复制小程序路径</button>`
            : ""
        }
      </div>
    </section>
  `;
}

function renderBreadcrumb(content) {
  const pageLabel = escapeHtml(content.pageLabel || "首页");
  const groupLabel = escapeHtml(content.groupLabel || "类目");
  const subLabel = escapeHtml(content.subLabel || "子类目");

  return `
    <nav class="breadcrumb" aria-label="面包屑导航">
      <a class="breadcrumb__link" href="${escapeHtml(getPageLink(content.page))}">${pageLabel}</a>
      <span class="breadcrumb__sep">/</span>
      <a class="breadcrumb__link" href="${escapeHtml(getGroupLink(content))}">${groupLabel}</a>
      <span class="breadcrumb__sep">/</span>
      <a class="breadcrumb__link" href="${escapeHtml(getSubsectionLink(content))}">${subLabel}</a>
    </nav>
  `;
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
    role: String(profile.title || "").trim() || "\u6ce8\u518c\u7528\u6237",
    description:
      String(profile.introduction || "").trim() ||
      `\u4e13\u6ce8${String(content.subLabel || content.groupLabel || "\u878d\u8d44\u670d\u52a1").trim()}\uff0c\u6b22\u8fce\u54a8\u8be2`,
    avatarUrl: String(profile.avatarUrl || "").trim(),
    phone: String(profile.phone || "").trim(),
    wechat: String(profile.wechat || "").trim()
  };
}

function getInitials(name) {
  const clean = String(name || "").trim();
  return clean ? clean.slice(0, 2) : "\u987e\u95ee";
}

function renderContactCard(content, userProfile) {
  const profile = buildCardProfile(content, userProfile);
  if (!profile) {
    return `
      <section class="detail-contact-card detail-contact-card--empty">
        <div class="detail-contact-card__content">
          <div class="detail-contact-card__headline">
            <h2>\u5c1a\u672a\u751f\u6210\u4e2a\u4eba\u540d\u7247</h2>
          </div>
          <p class="detail-contact-card__desc">
            \u7cfb\u7edf\u4f1a\u81ea\u52a8\u8bfb\u53d6\u5f53\u524d\u6ce8\u518c\u7528\u6237\u81ea\u5df1\u586b\u5199\u7684\u5934\u50cf\u3001\u59d3\u540d\u3001\u7535\u8bdd\u3001\u5fae\u4fe1\u548c\u4e2a\u4eba\u4ecb\u7ecd\u6765\u751f\u6210\u8fd9\u5f20\u540d\u7247\u3002
          </p>
        </div>
      </section>
    `;
  }

  const avatar = profile.avatarUrl
    ? `<img class="detail-contact-card__avatar-img" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.name)}" />`
    : `<span class="detail-contact-card__avatar-fallback">${escapeHtml(getInitials(profile.name))}</span>`;

  const phoneAction = profile.phone
    ? `<a class="detail-contact-card__action" href="tel:${escapeHtml(profile.phone)}" aria-label="\u62e8\u6253\u7535\u8bdd">
        <span class="detail-contact-card__action-icon">\u7535</span>
      </a>`
    : "";

  const wechatAction = profile.wechat
    ? `<button type="button" class="detail-contact-card__action detail-contact-card__action--wechat" data-wechat="${escapeHtml(profile.wechat)}" aria-label="\u590d\u5236\u5fae\u4fe1\u53f7">
        <span class="detail-contact-card__action-icon">\u5fae</span>
      </button>`
    : "";

  const meta = profile.phone || profile.wechat
    ? `<div class="detail-contact-card__meta">
        ${profile.phone ? `<span>\u7535\u8bdd\uff1a${escapeHtml(profile.phone)}</span>` : ""}
        ${profile.wechat ? `<span>\u5fae\u4fe1\uff1a${escapeHtml(profile.wechat)}</span>` : ""}
      </div>`
    : "";

  return `
    <section class="detail-contact-card">
      <div class="detail-contact-card__avatar">${avatar}</div>
      <div class="detail-contact-card__content">
        <div class="detail-contact-card__headline">
          <h2>${escapeHtml(profile.name)}</h2>
          <span class="detail-contact-card__badge">${escapeHtml(profile.role)}</span>
        </div>
        <p class="detail-contact-card__desc">${escapeHtml(profile.description)}</p>
        ${meta}
      </div>
      <div class="detail-contact-card__actions">
        ${phoneAction}
        ${wechatAction}
      </div>
    </section>
  `;
}

function renderDetail(content, userProfile) {
  const summary = content.summary ? `<p>${escapeHtml(content.summary)}</p>` : "";
  const externalLink = content.externalUrl
    ? `<a class="chip" href="${escapeHtml(content.externalUrl)}" target="_blank" rel="noreferrer">\u6253\u5f00\u5916\u90e8\u94fe\u63a5</a>`
    : "";
  const shareLabel = getMiniProgramLaunchUrl(content)
    ? "\u6253\u5f00\u5c0f\u7a0b\u5e8f\u5206\u4eab\u7248"
    : "\u67e5\u770b\u5c0f\u7a0b\u5e8f\u6253\u5f00\u65b9\u5f0f";

  return `
    <section class="detail-card">
      ${renderBreadcrumb(content)}
      <h1>${escapeHtml(content.title)}</h1>
      ${renderContactCard(content, userProfile)}
      <p class="detail-meta">\u53d1\u5e03\u65f6\u95f4\uff1a${formatDateTime(content.createdAt)}</p>
      ${summary}
      <div class="detail-body">${escapeHtml(content.body || "\u5f53\u524d\u4ec5\u914d\u7f6e\u4e86\u6458\u8981\u5185\u5bb9\u3002")}</div>
      ${renderMiniProgramBridge(content)}
      <div class="chip-row" style="margin-top:20px">
        <a class="chip" href="${escapeHtml(getSubsectionLink(content))}">\u8fd4\u56de\u5217\u8868</a>
        ${
          canShareContent(content)
            ? `<button type="button" class="chip chip--primary" id="share-moments-btn">${escapeHtml(shareLabel)}</button>`
            : ""
        }
        ${externalLink}
      </div>
    </section>
  `;
}

function bindCardActions(content) {
  const shareButton = document.getElementById("share-moments-btn");
  if (shareButton) {
    shareButton.addEventListener("click", () => {
      const launchUrl = getMiniProgramLaunchUrl(content);
      if (!launchUrl) {
        const miniProgramPath = String(content.miniProgramPath || "").trim();
        if (miniProgramPath) {
          window.alert(`当前暂时无法直接拉起小程序，请先在微信里打开。\n\n小程序路径：${miniProgramPath}`);
        } else {
          window.alert("小程序分享版还没准备好，请刷新页面后重试。");
        }
        return;
      }

      window.AnalyticsTracker?.trackSectionView({
        page: content.page,
        groupKey: content.groupKey,
        subKey: content.subKey,
        contentId: content.id,
        contentSlug: content.slug,
        contentTitle: content.title,
        source: "mini-program-share-entry"
      }).catch(() => {});

      window.location.href = launchUrl;
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

        if (window.ShareHelper?.showToast) {
          window.ShareHelper.showToast(`\u5fae\u4fe1\u53f7\u5df2\u590d\u5236\uff1a${wechat}`);
        } else {
          window.alert(`\u5fae\u4fe1\u53f7\u5df2\u590d\u5236\uff1a${wechat}`);
        }
      } catch (error) {
        window.alert(`\u5fae\u4fe1\u53f7\uff1a${wechat}`);
      }
    });
  }

  const openMiniProgramButton = document.getElementById("open-mini-program-btn");
  if (openMiniProgramButton) {
    openMiniProgramButton.addEventListener("click", () => {
      const launchUrl = String(openMiniProgramButton.dataset.miniProgramLaunchUrl || "").trim();
      if (!launchUrl) {
        return;
      }
      window.location.href = launchUrl;
    });
  }

  const openMiniProgramTag = document.getElementById("open-mini-program-tag");
  if (openMiniProgramTag) {
    openMiniProgramTag.addEventListener("launch", () => {
      window.ShareHelper?.showToast?.("正在打开小程序...");
    });
    openMiniProgramTag.addEventListener("error", (event) => {
      const detail = event?.detail ? JSON.stringify(event.detail) : "";
      window.alert(`小程序拉起失败，请改用复制路径方式排查。${detail ? `\n${detail}` : ""}`);
    });
  }

  const copyMiniProgramPathButton = document.getElementById("copy-mini-program-path-btn");
  if (copyMiniProgramPathButton) {
    copyMiniProgramPathButton.addEventListener("click", async () => {
      const miniProgramPath = String(copyMiniProgramPathButton.dataset.miniProgramPath || "").trim();
      if (!miniProgramPath) {
        return;
      }

      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(miniProgramPath);
        } else {
          const textarea = document.createElement("textarea");
          textarea.value = miniProgramPath;
          textarea.setAttribute("readonly", "readonly");
          textarea.style.position = "absolute";
          textarea.style.left = "-9999px";
          document.body.appendChild(textarea);
          textarea.select();
          document.execCommand("copy");
          textarea.remove();
        }

        window.ShareHelper?.showToast?.("小程序路径已复制");
      } catch (error) {
        window.alert(`小程序路径：${miniProgramPath}`);
      }
    });
  }
}

async function loadDetail() {
  const slug = window.location.pathname.split("/").pop();
  const root = document.getElementById("detail-app");
  const response = await fetch(`/api/content/${slug}`);

  if (!response.ok) {
    root.innerHTML = `
      <section class="detail-card">
        <h1>\u5185\u5bb9\u4e0d\u5b58\u5728</h1>
        <p class="detail-meta">\u8bf7\u68c0\u67e5\u94fe\u63a5\u662f\u5426\u6b63\u786e\u3002</p>
        <a class="chip" href="/">\u8fd4\u56de\u9996\u9875</a>
      </section>
    `;
    return;
  }

  const { content } = await response.json();
  content.link = buildContentShareLink(content);
  let currentUserProfile = getCurrentUserProfile();

  if (window.AnalyticsTracker) {
    window.AnalyticsTracker.trackSectionView({
      page: content.page,
      groupKey: content.groupKey,
      subKey: content.subKey,
      contentId: content.id,
      contentSlug: content.slug,
      contentTitle: content.title,
      source: "detail-view"
    }).catch(() => {});
  }

  const renderPage = () => {
    root.innerHTML = renderDetail(content, currentUserProfile);
    bindCardActions(content);
  };

  renderPage();

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

function canShareContent(content) {
  return Boolean(content && content.slug);
}

loadDetail().catch(() => {
  document.getElementById("detail-app").innerHTML = `
    <section class="detail-card">
      <h1>\u52a0\u8f7d\u5931\u8d25</h1>
      <a class="chip" href="/">\u8fd4\u56de\u9996\u9875</a>
    </section>
  `;
});
