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

function decodeSegment(value) {
  try {
    return decodeURIComponent(String(value || "").trim());
  } catch (error) {
    return String(value || "").trim();
  }
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

function getGroupLink(page, groupKey) {
  if (!page || !groupKey) {
    return "/";
  }

  return `/section/${encodeURIComponent(page)}/${encodeURIComponent(groupKey)}`;
}

function getSubsectionLink(page, groupKey, subKey) {
  if (!page || !groupKey || !subKey) {
    return "/";
  }

  return `/section/${encodeURIComponent(page)}/${encodeURIComponent(groupKey)}/${encodeURIComponent(subKey)}`;
}

function renderBreadcrumb(meta) {
  const pageLink = getPageLink(meta?.page);
  const groupLink = getGroupLink(meta?.page, meta?.groupKey);
  const subsectionLink = getSubsectionLink(meta?.page, meta?.groupKey, meta?.subKey);

  return `
    <nav class="breadcrumb" aria-label="面包屑导航">
      <a class="breadcrumb__link" href="${escapeHtml(pageLink)}" data-breadcrumb-link="${escapeHtml(pageLink)}">${escapeHtml(
        meta?.pageLabel || "首页"
      )}</a>
      <span class="breadcrumb__sep">/</span>
      <a class="breadcrumb__link" href="${escapeHtml(groupLink)}" data-breadcrumb-link="${escapeHtml(groupLink)}">${escapeHtml(
        meta?.groupLabel || "版块"
      )}</a>
      <span class="breadcrumb__sep">/</span>
      <a class="breadcrumb__link" href="${escapeHtml(subsectionLink)}" data-breadcrumb-link="${escapeHtml(
        subsectionLink
      )}">${escapeHtml(meta?.subLabel || "子版块")}</a>
    </nav>
  `;
}

function isMiniProgramItem(item) {
  return item?.contentType === "mini-program";
}

function isWebToolItem(item) {
  return item?.contentType === "web";
}

function isToolItem(item) {
  return isMiniProgramItem(item) || isWebToolItem(item);
}

function getActionText(item) {
  if (isMiniProgramItem(item)) {
    return item.miniProgramLaunchUrl || item.externalUrl ? "打开小程序" : "查看打开方式";
  }
  if (isWebToolItem(item)) {
    return item.externalUrl ? "立即进入" : "查看详情";
  }
  return "查看详情";
}

function getActionHint(item) {
  if (isMiniProgramItem(item)) {
    return item.miniProgramLaunchUrl || item.externalUrl
      ? "支持直接拉起微信小程序"
      : "可复制名称与路径手动打开";
  }
  if (isWebToolItem(item)) {
    return item.externalUrl ? "点击后直接跳转工具页" : "点击查看工具说明";
  }
  return "点击进入文章详情页并自动生成个性化名片";
}

function ensureToolDialog() {
  let dialog = document.getElementById("tool-open-dialog");
  if (dialog) {
    return dialog;
  }

  dialog = document.createElement("dialog");
  dialog.id = "tool-open-dialog";
  dialog.className = "tool-dialog";
  dialog.innerHTML = `
    <div class="tool-dialog__body">
      <div class="tool-dialog__head">
        <div>
          <p class="eyebrow">微信小程序</p>
          <h3 id="tool-dialog-title">打开方式</h3>
        </div>
        <button type="button" class="secondary-btn" data-close-tool-dialog="true">关闭</button>
      </div>
      <p id="tool-dialog-description" class="tool-dialog__description"></p>
      <div id="tool-dialog-meta" class="tool-dialog__meta"></div>
      <div class="chip-row tool-dialog__actions">
        <button type="button" class="primary-btn" data-copy-tool-name="true">复制名称</button>
        <button type="button" class="secondary-btn" data-copy-tool-path="true">复制路径</button>
        <button type="button" class="secondary-btn" data-open-wechat="true">打开微信</button>
      </div>
    </div>
  `;

  document.body.appendChild(dialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog || event.target.closest("[data-close-tool-dialog]")) {
      dialog.close();
    }
  });

  return dialog;
}

async function copyText(text, successMessage) {
  const value = String(text || "").trim();
  if (!value) {
    window.alert("没有可复制的内容。");
    return;
  }

  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
    } else {
      const textarea = document.createElement("textarea");
      textarea.value = value;
      textarea.setAttribute("readonly", "readonly");
      textarea.style.position = "absolute";
      textarea.style.left = "-9999px";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
    }
    if (window.ShareHelper?.showToast) {
      window.ShareHelper.showToast(successMessage);
    } else {
      window.alert(successMessage);
    }
  } catch (error) {
    window.alert(`复制失败，请手动复制：${value}`);
  }
}

function showMiniProgramFallback(item) {
  const dialog = ensureToolDialog();
  dialog.dataset.name = item.miniProgramName || item.title || "";
  dialog.dataset.path = item.miniProgramPath || "";

  dialog.querySelector("#tool-dialog-title").textContent = item.miniProgramName || item.title || "微信小程序";
  dialog.querySelector("#tool-dialog-description").textContent =
    item.miniProgramNote || "当前环境无法直接拉起小程序，可复制名称到微信搜索，或复制路径交给运营同事排查。";

  const metaRows = [];
  if (item.miniProgramAppId) {
    metaRows.push(`<p><strong>AppID：</strong>${escapeHtml(item.miniProgramAppId)}</p>`);
  }
  if (item.miniProgramPath) {
    metaRows.push(`<p><strong>页面路径：</strong>${escapeHtml(item.miniProgramPath)}</p>`);
  }
  if (item.externalUrl) {
    metaRows.push(
      `<p><strong>备用链接：</strong><a href="${escapeHtml(item.externalUrl)}" target="_blank" rel="noreferrer">打开链接</a></p>`
    );
  }
  dialog.querySelector("#tool-dialog-meta").innerHTML = metaRows.join("");
  dialog.showModal();
}

function openToolItem(item) {
  const launchUrl = item.miniProgramLaunchUrl || item.externalUrl || "";
  if (isMiniProgramItem(item)) {
    if (launchUrl) {
      window.location.href = launchUrl;
      window.setTimeout(() => {
        if (document.visibilityState === "visible") {
          showMiniProgramFallback(item);
        }
      }, 1600);
      return;
    }

    showMiniProgramFallback(item);
    return;
  }

  if (launchUrl) {
    window.location.href = launchUrl;
    return;
  }

  if (item.slug) {
    window.location.href = `/content/${encodeURIComponent(item.slug)}`;
  }
}

function getPageContext() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return {
    page: decodeSegment(parts[1] || ""),
    groupKey: decodeSegment(parts[2] || ""),
    subKey: decodeSegment(parts[3] || "")
  };
}

function getContentLink(item) {
  if (!item?.slug) {
    return "";
  }

  const baseLink = `/content/${encodeURIComponent(item.slug)}`;
  const shareVersion = String(item.updatedAt || item.createdAt || item.shareImageUrl || item.title || "").trim();
  if (!shareVersion) {
    return baseLink;
  }

  let hash = 0;
  for (let index = 0; index < shareVersion.length; index += 1) {
    hash = (hash * 31 + shareVersion.charCodeAt(index)) >>> 0;
  }

  return `${baseLink}?sharev=${hash.toString(16)}`;
}

function renderSubsectionPage(meta, contents) {
  const root = document.getElementById("subsection-app");
  const pageLabel = meta?.pageLabel || "\u5185\u5bb9";
  const groupLabel = meta?.groupLabel || "\u677f\u5757";
  const subLabel = meta?.subLabel || "\u5206\u7c7b";
  document.title = `${subLabel} - ${window.SITE_META?.siteName || "\u77e5\u8bc6\u5e93"}`;

  if (!contents.length) {
    root.innerHTML = `
      <section class="detail-card">
        ${renderBreadcrumb(meta)}
        <h1>${escapeHtml(subLabel)}</h1>
        <p class="detail-meta">\u5f53\u524d\u677f\u5757\u8fd8\u6ca1\u6709\u5185\u5bb9\uff0c\u8bf7\u5148\u53bb\u540e\u53f0\u53d1\u5e03\u6587\u7ae0\u3002</p>
        <div class="chip-row" style="margin-top:20px">
          <a class="chip" href="/">\u8fd4\u56de\u9996\u9875</a>
        </div>
      </section>
    `;
    return;
  }

  root.innerHTML = `
    <section class="detail-card">
      ${renderBreadcrumb(meta)}
      <h1>${escapeHtml(subLabel)}</h1>
      <p class="detail-meta">\u5171 ${contents.length} \u7bc7\u5185\u5bb9\uff0c\u70b9\u51fb\u5361\u7247\u5373\u53ef\u8fdb\u5165\u8be6\u60c5\u9875\u3002</p>
      ${contents
        .map((item, index) => {
          const link = getContentLink(item);
          const itemAttributes = isToolItem(item)
            ? `
              data-open-tool="true"
              data-page="${escapeHtml(item.page)}"
              data-group-key="${escapeHtml(item.groupKey)}"
              data-sub-key="${escapeHtml(item.subKey)}"
              data-content-id="${escapeHtml(item.id)}"
              data-content-slug="${escapeHtml(item.slug || "")}"
              data-content-title="${escapeHtml(item.title)}"
              data-content-type="${escapeHtml(item.contentType || "")}"
              data-external-url="${escapeHtml(item.externalUrl || "")}"
              data-mini-program-name="${escapeHtml(item.miniProgramName || "")}"
              data-mini-program-app-id="${escapeHtml(item.miniProgramAppId || "")}"
              data-mini-program-path="${escapeHtml(item.miniProgramPath || "")}"
              data-mini-program-launch-url="${escapeHtml(item.miniProgramLaunchUrl || "")}"
              data-mini-program-note="${escapeHtml(item.miniProgramNote || "")}"
            `
            : `
              data-open-content="true"
              data-content-link="${escapeHtml(link)}"
              data-page="${escapeHtml(item.page)}"
              data-group-key="${escapeHtml(item.groupKey)}"
              data-sub-key="${escapeHtml(item.subKey)}"
              data-content-id="${escapeHtml(item.id)}"
              data-content-slug="${escapeHtml(item.slug || "")}"
              data-content-title="${escapeHtml(item.title)}"
            `;

          return `
            <article
              class="content-item content-item--interactive"
              role="link"
              tabindex="0"
              ${itemAttributes}
            >
              <div class="content-item__main">
                <span class="content-item__serial">${String(index + 1).padStart(2, "0")}</span>
                <div class="content-item__copy">
                  <div class="content-item__eyebrow">
                    <span class="content-item__pill">${escapeHtml(item.contentType || "article")}</span>
                    <span class="content-item__hint">${escapeHtml(getActionHint(item))}</span>
                  </div>
                  <h3>${escapeHtml(item.title)}</h3>
                  <p>${escapeHtml(item.summary || "\u5f53\u524d\u5185\u5bb9\u6682\u65e0\u6458\u8981\u3002")}</p>
                  <p class="detail-meta">\u53d1\u5e03\u65f6\u95f4\uff1a${formatDateTime(item.updatedAt || item.createdAt)}</p>
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
      <div class="chip-row" style="margin-top:20px">
        <a class="chip" href="/">\u8fd4\u56de\u9996\u9875</a>
      </div>
    </section>
  `;
}

async function loadSubsectionPage() {
  const root = document.getElementById("subsection-app");
  const { page, groupKey, subKey } = getPageContext();

  if (!page || !groupKey || !subKey) {
    root.innerHTML = `
      <section class="detail-card">
        <h1>板块参数不完整</h1>
        <p class="detail-meta">请从首页重新进入对应板块。</p>
      </section>
    `;
    return;
  }

  const [configResponse, contentResponse] = await Promise.all([
    fetch("/api/config"),
    fetch(
      `/api/content?page=${encodeURIComponent(page)}&groupKey=${encodeURIComponent(groupKey)}&subKey=${encodeURIComponent(subKey)}`
    )
  ]);
  const [{ sections }, { contents }] = await Promise.all([configResponse.json(), contentResponse.json()]);

  const pageConfig = sections?.[page];
  const groupConfig = (pageConfig?.groups || []).find((item) => item.key === groupKey);
  const subConfig = (groupConfig?.children || []).find((item) => item.key === subKey);

  if (!pageConfig || !groupConfig || !subConfig) {
    root.innerHTML = `
      <section class="detail-card">
        <h1>板块不存在</h1>
        <p class="detail-meta">请检查入口链接是否正确。</p>
      </section>
    `;
    return;
  }

  const sortedContents = Array.isArray(contents)
    ? contents
        .slice()
        .sort((a, b) => String(b.updatedAt || b.createdAt || "").localeCompare(String(a.updatedAt || a.createdAt || "")))
    : [];

  renderSubsectionPage(
    {
      page,
      groupKey,
      subKey,
      pageLabel: pageConfig.label,
      groupLabel: groupConfig.label,
      subLabel: subConfig.label
    },
    sortedContents
  );
}

document.addEventListener("click", (event) => {
  const breadcrumbLink = event.target.closest("[data-breadcrumb-link]");
  if (breadcrumbLink) {
    event.preventDefault();
    event.stopPropagation();
    window.location.assign(breadcrumbLink.dataset.breadcrumbLink || breadcrumbLink.getAttribute("href") || "/");
    return;
  }

  const toolButton = event.target.closest("[data-open-tool]");
  if (toolButton) {
    openToolItem({
      title: toolButton.dataset.contentTitle,
      slug: toolButton.dataset.contentSlug,
      contentType: toolButton.dataset.contentType,
      externalUrl: toolButton.dataset.externalUrl,
      miniProgramName: toolButton.dataset.miniProgramName,
      miniProgramAppId: toolButton.dataset.miniProgramAppId,
      miniProgramPath: toolButton.dataset.miniProgramPath,
      miniProgramLaunchUrl: toolButton.dataset.miniProgramLaunchUrl,
      miniProgramNote: toolButton.dataset.miniProgramNote
    });

    if (window.AnalyticsTracker) {
      window.AnalyticsTracker.trackSectionView({
        page: toolButton.dataset.page,
        groupKey: toolButton.dataset.groupKey,
        subKey: toolButton.dataset.subKey,
        action: "click",
        contentId: toolButton.dataset.contentId,
        contentSlug: toolButton.dataset.contentSlug,
        contentTitle: toolButton.dataset.contentTitle,
        source: "subsection-tool-link"
      }).catch(() => {});
    }
    return;
  }

  const contentCard = event.target.closest("[data-open-content]");
  if (contentCard) {
    if (window.AnalyticsTracker) {
      window.AnalyticsTracker.trackSectionView({
        page: contentCard.dataset.page,
        groupKey: contentCard.dataset.groupKey,
        subKey: contentCard.dataset.subKey,
        action: "click",
        contentId: contentCard.dataset.contentId,
        contentSlug: contentCard.dataset.contentSlug,
        contentTitle: contentCard.dataset.contentTitle,
        source: "subsection-content-card"
      }).catch(() => {});
    }

    if (contentCard.dataset.contentLink) {
      window.location.href = contentCard.dataset.contentLink;
    }
    return;
  }

  const dialog = event.target.closest("#tool-open-dialog");
  if (!dialog) {
    return;
  }

  if (event.target.closest("[data-copy-tool-name]")) {
    copyText(dialog.dataset.name, "\u5c0f\u7a0b\u5e8f\u540d\u79f0\u5df2\u590d\u5236\uff0c\u8bf7\u6253\u5f00\u5fae\u4fe1\u540e\u76f4\u63a5\u7c98\u8d34\u641c\u7d22\u3002");
  } else if (event.target.closest("[data-copy-tool-path]")) {
    copyText(dialog.dataset.path, "\u5c0f\u7a0b\u5e8f\u8def\u5f84\u5df2\u590d\u5236\u3002");
  } else if (event.target.closest("[data-open-wechat]")) {
    window.location.href = "weixin://";
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") {
    return;
  }

  const interactiveCard = event.target.closest("[data-open-content], [data-open-tool]");
  if (!interactiveCard) {
    return;
  }

  event.preventDefault();
  interactiveCard.click();
});

loadSubsectionPage().catch(() => {
  document.getElementById("subsection-app").innerHTML = `
    <section class="detail-card">
      <h1>加载失败</h1>
      <p class="detail-meta">板块内容加载失败，请稍后再试。</p>
    </section>
  `;
});
