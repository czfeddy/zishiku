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

function parseMomentsBody(body) {
  const raw = String(body || "").trim();
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw);
    if (parsed && parsed.schema === "moments-post-v1" && typeof parsed.text === "string" && Array.isArray(parsed.images)) {
      return {
        text: parsed.text,
        images: parsed.images
          .map((item) => ({
            url: String(item?.url || "").trim(),
            name: String(item?.name || "").trim()
          }))
          .filter((item) => item.url)
      };
    }
  } catch (error) {
    return null;
  }

  return null;
}

function getPageLink(page) {
  switch (String(page || "").trim()) {
    case "recharge":
      return "/recharge.html";
    case "achievements":
      return "/achievements.html";
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

function renderBreadcrumb(content) {
  const pageLabel = escapeHtml(content.pageLabel || "Home");
  const groupLabel = escapeHtml(content.groupLabel || "Category");
  const subLabel = escapeHtml(content.subLabel || "Subcategory");

  return `
    <nav class="breadcrumb" aria-label="闂傚倸鐗勯崹鍦偓鍨焽娴狅箓骞嬪┑鎰闂?>
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
    throw new Error(result.message || "闂佸憡姊绘慨鎯归崶顒佸仺闁靛绠戦悡鏇㈡偣瑜嶇€氼參寮搁埄鍐ㄧ窞閺夊牜鍋夎");
  }

  return result.profile || null;
}

function buildCardProfile(content, userProfile) {
  const profile = userProfile && typeof userProfile === "object" ? userProfile : null;
  const hasProfileContent = Boolean(
    profile &&
      [profile.userId, profile.name, profile.avatarUrl, profile.phone, profile.wechat, profile.introduction, profile.title]
        .map((item) => String(item || "").trim())
        .some(Boolean)
  );

  if (!hasProfileContent) {
    return null;
  }

  return {
    name: String(profile.name || profile.userId || "").trim() || "\u54a8\u8be2\u987e\u95ee",
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
          <div class="chip-row" style="margin-top:16px">
            <button type="button" class="chip chip--primary" data-open-registration="true">\u7acb\u5373\u5b8c\u5584\u8d44\u6599</button>
          </div>
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
  const momentsBody = parseMomentsBody(content.body);
  const externalLink = content.externalUrl
    ? `<a class="chip" href="${escapeHtml(content.externalUrl)}" target="_blank" rel="noreferrer">\u6253\u5f00\u5916\u90e8\u94fe\u63a5</a>`
    : "";
  const shareLabel = getMiniProgramLaunchUrl(content)
    ? momentsBody
      ? "\u6253\u5f00\u5c0f\u7a0b\u5e8f\u4e00\u952e\u5907\u597d\u670b\u53cb\u5708\u7d20\u6750"
      : "\u53bb\u670b\u53cb\u5708\u5206\u4eab"
    : "\u67e5\u770b\u5c0f\u7a0b\u5e8f\u6253\u5f00\u65b9\u5f0f";
  const momentsHelperNotice = momentsBody
    ? `
      <div class="detail-share-helper-note">
        <strong>\u53d1\u670b\u53cb\u5708\u65b9\u5f0f\uff1a</strong>
        \u6253\u5f00\u5c0f\u7a0b\u5e8f\u7d20\u6750\u52a9\u624b\u540e\uff0c\u7cfb\u7edf\u4f1a\u590d\u5236\u6587\u6848\u5e76\u4fdd\u5b58\u56fe\u7247\u5230\u76f8\u518c\u3002\u8bf7\u56de\u5230\u5fae\u4fe1\u670b\u53cb\u5708\u624b\u52a8\u53d1\u5e03\uff0c\u4e0d\u8981\u7528\u53f3\u4e0a\u89d2\u5206\u4eab\uff0c\u90a3\u4f1a\u53d8\u6210\u94fe\u63a5\u5361\u7247\u3002
      </div>
    `
    : "";

  return `
    <section class="detail-card">
      ${renderBreadcrumb(content)}
      <h1>${escapeHtml(content.title)}</h1>
      ${renderContactCard(content, userProfile)}
      <p class="detail-meta">\u53d1\u5e03\u65f6\u95f4\uff1a${formatDateTime(content.createdAt)}</p>
      ${summary}
      ${momentsHelperNotice}
      <div class="detail-body">${
        momentsBody
          ? `
            <div class="moments-rich-body">
              <p>${escapeHtml(momentsBody.text || "")}</p>
              ${
                momentsBody.images.length
                  ? `
                    <div class="moments-rich-gallery">
                      ${momentsBody.images
                        .map(
                          (image) =>
                            `<img src="${escapeHtml(image.url)}" alt="${escapeHtml(image.name || content.title || "朋友圈配图")}" />`
                        )
                        .join("")}
                    </div>
                  `
                  : ""
              }
            </div>
          `
          : escapeHtml(content.body || "\u5f53\u524d\u4ec5\u914d\u7f6e\u4e86\u6458\u8981\u5185\u5bb9\u3002")
      }</div>
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
          window.alert(`閻熸粎澧楅幐鍛婃櫠閻樿姹查柛灞剧⊕椤ρ囨煛閸愵亜校缁绢厼鐖奸幆鍕偓娑櫭径宥夋煙瀹勯偊妲奸柟鐧哥悼娴滄瓕绠涢弴妤佺厾闁瑰吋娼欐蹇曟濠靛牊瀚氱€瑰嫭婢樼敮銉╂煕閿斿搫濡煎ù婊勬礃缁岄亶鏁撻悩鍙夘仦闂佺懓鐏氶幐鍝ユ閹达箑违濞ｅ洦鎮廫n闁诲繐绻愮换鎺楀煝閸忓吋鍎熼煫鍥ㄦ皑閻斿懐鈧灚婢樼€氬摜妲?{miniProgramPath}`);
        } else {
          window.alert("Mini program path is unavailable in the current environment.");
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

  const registrationButton = document.querySelector("[data-open-registration]");
  if (registrationButton) {
    registrationButton.addEventListener("click", async () => {
      try {
        await window.AnalyticsTracker?.ensureUserRegistration?.();
        if (!window.AnalyticsTracker?.getProfile?.()) {
          window.AnalyticsTracker?.showRegistrationModal?.({
            userId: window.AnalyticsTracker?.getUserId?.() || ""
          });
        }
      } catch (error) {
        window.AnalyticsTracker?.showRegistrationModal?.({
          userId: window.AnalyticsTracker?.getUserId?.() || ""
        });
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
