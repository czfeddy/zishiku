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
  const shareLabel = window.ShareHelper?.getShareActionLabel?.() || "分享链接";
  const pageLabel = meta?.pageLabel || "内容";
  const groupLabel = meta?.groupLabel || "板块";
  const subLabel = meta?.subLabel || "分类";
  document.title = `${subLabel} - ${window.SITE_META?.siteName || "知识库"}`;

  if (!contents.length) {
    root.innerHTML = `
      <section class="detail-card">
        <p class="eyebrow">${escapeHtml(pageLabel)} / ${escapeHtml(groupLabel)} / ${escapeHtml(subLabel)}</p>
        <h1>${escapeHtml(subLabel)}</h1>
        <p class="detail-meta">当前板块还没有内容，请先去后台发布文章。</p>
        <div class="chip-row" style="margin-top:20px">
          <a class="chip" href="/">返回首页</a>
        </div>
      </section>
    `;
    return;
  }

  root.innerHTML = `
    <section class="detail-card">
      <p class="eyebrow">${escapeHtml(pageLabel)} / ${escapeHtml(groupLabel)} / ${escapeHtml(subLabel)}</p>
      <h1>${escapeHtml(subLabel)}</h1>
      <p class="detail-meta">共 ${contents.length} 篇内容。点击文章后会进入详情页，并自动展示当前注册用户自己填写的个性化名片。</p>
      ${contents
        .map((item, index) => {
          const link = getContentLink(item);
          const openAction = isToolItem(item)
            ? `
              <button
                type="button"
                class="chip chip--primary"
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
              >
                ${escapeHtml(getActionText(item))}
              </button>
            `
            : `
              <a
                class="chip chip--primary"
                href="${escapeHtml(link)}"
                data-open-content="true"
                data-page="${escapeHtml(item.page)}"
                data-group-key="${escapeHtml(item.groupKey)}"
                data-sub-key="${escapeHtml(item.subKey)}"
                data-content-id="${escapeHtml(item.id)}"
                data-content-slug="${escapeHtml(item.slug || "")}"
                data-content-title="${escapeHtml(item.title)}"
              >
                ${escapeHtml(getActionText(item))}
              </a>
            `;

          return `
            <article class="content-item">
              <div class="content-item__main">
                <span class="content-item__serial">${String(index + 1).padStart(2, "0")}</span>
                <div class="content-item__copy">
                  <div class="content-item__eyebrow">
                    <span class="content-item__pill">${escapeHtml(item.contentType || "article")}</span>
                    <span class="content-item__hint">${escapeHtml(getActionHint(item))}</span>
                  </div>
                  <h3>${escapeHtml(item.title)}</h3>
                  <p>${escapeHtml(item.summary || "当前内容暂无摘要。")}</p>
                  <p class="detail-meta">发布时间：${formatDateTime(item.updatedAt || item.createdAt)}</p>
                </div>
              </div>
              <div class="content-item__aside">
                <div class="chip-row">
                  ${openAction}
                  ${
                    item.slug
                      ? `
                        <button
                          type="button"
                          class="chip"
                          data-share-moments="true"
                          data-page="${escapeHtml(item.page)}"
                          data-group-key="${escapeHtml(item.groupKey)}"
                          data-sub-key="${escapeHtml(item.subKey)}"
                          data-content-id="${escapeHtml(item.id)}"
                          data-content-slug="${escapeHtml(item.slug || "")}"
                          data-content-link="${escapeHtml(link)}"
                          data-content-image="${escapeHtml(item.shareImageUrl || "")}"
                        >
                          分享朋友圈
                        </button>
                      `
                      : ""
                  }
                </div>
              </div>
            </article>
          `;
        })
        .join("")}
      <div class="chip-row" style="margin-top:20px">
        <a class="chip" href="/">返回首页</a>
      </div>
    </section>
  `;

  root.querySelectorAll("[data-share-moments]").forEach((button) => {
    button.textContent = shareLabel;
  });
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
      pageLabel: pageConfig.label,
      groupLabel: groupConfig.label,
      subLabel: subConfig.label
    },
    sortedContents
  );
}

document.addEventListener("click", (event) => {
  const toolButton = event.target.closest("[data-open-tool]");
  if (toolButton) {
    openToolItem({
      page: toolButton.dataset.page,
      groupKey: toolButton.dataset.groupKey,
      subKey: toolButton.dataset.subKey,
      id: toolButton.dataset.contentId,
      slug: toolButton.dataset.contentSlug,
      title: toolButton.dataset.contentTitle,
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

  const shareButton = event.target.closest("[data-share-moments]");
  if (shareButton) {
    if (!window.ShareHelper?.prepareAndPromptShare) {
      window.alert("分享模块加载失败，请刷新页面后重试。");
      return;
    }

    const contentItem = shareButton.closest(".content-item");
    const title = contentItem?.querySelector("h3")?.textContent?.trim() || "";
    const summary = contentItem?.querySelector("p")?.textContent?.trim() || "";

    window.ShareHelper.showToast?.("正在准备分享...");
    window.ShareHelper.prepareAndPromptShare({
      title,
      desc: summary,
      link: shareButton.dataset.contentLink,
      imgUrl: shareButton.dataset.contentImage,
      shareMode: "moments",
      forceRefresh: true
    }).then((result) => {
      if (
        !window.AnalyticsTracker ||
        !["wechat-guide", "manual-guide", "system-share", "copy-link"].includes(result?.method)
      ) {
        return;
      }

      window.AnalyticsTracker.trackSectionView({
        page: shareButton.dataset.page,
        groupKey: shareButton.dataset.groupKey,
        subKey: shareButton.dataset.subKey,
        action: "share",
        contentId: shareButton.dataset.contentId,
        contentSlug: shareButton.dataset.contentSlug,
        contentTitle: title,
        source: "subsection-share-guide"
      }).catch(() => {});
    });
    return;
  }

  const contentLink = event.target.closest("[data-open-content]");
  if (contentLink && window.AnalyticsTracker) {
    window.AnalyticsTracker.trackSectionView({
      page: contentLink.dataset.page,
      groupKey: contentLink.dataset.groupKey,
      subKey: contentLink.dataset.subKey,
      action: "click",
      contentId: contentLink.dataset.contentId,
      contentSlug: contentLink.dataset.contentSlug,
      contentTitle: contentLink.dataset.contentTitle,
      source: "subsection-content-link"
    }).catch(() => {});
    return;
  }

  const dialog = event.target.closest("#tool-open-dialog");
  if (!dialog) {
    return;
  }

  if (event.target.closest("[data-copy-tool-name]")) {
    copyText(dialog.dataset.name, "小程序名称已复制，请打开微信后直接粘贴搜索。");
  } else if (event.target.closest("[data-copy-tool-path]")) {
    copyText(dialog.dataset.path, "小程序路径已复制。");
  } else if (event.target.closest("[data-open-wechat]")) {
    window.location.href = "weixin://";
  }
});

loadSubsectionPage().catch(() => {
  document.getElementById("subsection-app").innerHTML = `
    <section class="detail-card">
      <h1>加载失败</h1>
      <p class="detail-meta">板块内容加载失败，请稍后再试。</p>
    </section>
  `;
});
