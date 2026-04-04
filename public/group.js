function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

  return `
    <nav class="breadcrumb" aria-label="面包屑导航">
      <a class="breadcrumb__link" href="${escapeHtml(pageLink)}">${escapeHtml(meta?.pageLabel || "首页")}</a>
      <span class="breadcrumb__sep">/</span>
      <a class="breadcrumb__link" href="${escapeHtml(groupLink)}">${escapeHtml(meta?.groupLabel || "板块")}</a>
    </nav>
  `;
}

function getPageContext() {
  const parts = window.location.pathname.split("/").filter(Boolean);
  return {
    page: decodeSegment(parts[1] || ""),
    groupKey: decodeSegment(parts[2] || "")
  };
}

function renderGroupPage(meta, subsections, contents) {
  const root = document.getElementById("group-app");
  const pageLabel = meta?.pageLabel || "内容";
  const groupLabel = meta?.groupLabel || "板块";
  document.title = `${groupLabel} - ${window.SITE_META?.siteName || "知识库"}`;

  root.innerHTML = `
    <section class="detail-card">
      ${renderBreadcrumb(meta)}
      <h1>${escapeHtml(groupLabel)}</h1>
      <p class="detail-meta">${escapeHtml(pageLabel)} 下共 ${subsections.length} 个子版块，点击进入对应文章列表。</p>
      <div class="subsection-grid">
        ${subsections
          .map((sub) => {
            const count = contents.filter((item) => item.subKey === sub.key).length;
            return `
              <section class="subsection-card">
                <a
                  class="subsection-entry subsection-entry--plain subsection-entry--link"
                  href="${escapeHtml(getSubsectionLink(meta.page, meta.groupKey, sub.key))}"
                >
                  <span class="subsection-entry__label">${escapeHtml(sub.label)}</span>
                  <span class="subsection-entry__count">${count} items</span>
                  <span class="subsection-entry__hint">打开子版块文章列表</span>
                </a>
              </section>
            `;
          })
          .join("")}
      </div>
    </section>
  `;
}

async function loadGroupPage() {
  const root = document.getElementById("group-app");
  const { page, groupKey } = getPageContext();

  if (!page || !groupKey) {
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
    fetch(`/api/content?page=${encodeURIComponent(page)}&groupKey=${encodeURIComponent(groupKey)}`)
  ]);
  const [{ sections }, { contents }] = await Promise.all([configResponse.json(), contentResponse.json()]);

  const pageConfig = sections?.[page];
  const groupConfig = (pageConfig?.groups || []).find((item) => item.key === groupKey);

  if (!pageConfig || !groupConfig) {
    root.innerHTML = `
      <section class="detail-card">
        <h1>板块不存在</h1>
        <p class="detail-meta">请检查入口链接是否正确。</p>
      </section>
    `;
    return;
  }

  renderGroupPage(
    {
      page,
      groupKey,
      pageLabel: pageConfig.label,
      groupLabel: groupConfig.label
    },
    Array.isArray(groupConfig.children) ? groupConfig.children : [],
    Array.isArray(contents) ? contents : []
  );
}

loadGroupPage().catch(() => {
  document.getElementById("group-app").innerHTML = `
    <section class="detail-card">
      <h1>加载失败</h1>
      <p class="detail-meta">板块内容加载失败，请稍后再试。</p>
    </section>
  `;
});
