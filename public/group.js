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
    <nav class="breadcrumb" aria-label="Breadcrumb">
      <a class="breadcrumb__link" href="${escapeHtml(pageLink)}">${escapeHtml(meta?.pageLabel || "Home")}</a>
      <span class="breadcrumb__sep">/</span>
      <a class="breadcrumb__link" href="${escapeHtml(groupLink)}">${escapeHtml(meta?.groupLabel || "Section")}</a>
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
  const pageLabel = meta?.pageLabel || "Content";
  const groupLabel = meta?.groupLabel || "Section";
  document.title = `${groupLabel} - ${window.SITE_META?.siteName || "Knowledge Base"}`;

  root.innerHTML = `
    <section class="detail-card">
      ${renderBreadcrumb(meta)}
      <h1>${escapeHtml(groupLabel)}</h1>
      <p class="detail-meta">${escapeHtml(pageLabel)} 婵炴垶鎸搁鍛村矗?${subsections.length} 婵炴垶鎼╂禍婊堟偤濞嗘挻鍋嬮柛顐ｇ箖閸嬨儵鏌ㄥ☉妯肩伇闁稿缍佸畷娆撳及韫囨洜顔掗梺绋跨箞閸庨亶顢氶鑺ュ劅闁哄啠鍋撻柡瀣暟缁晠鎮╅幓鎺斾粴闁荤偞绋忛崝濠囧焵?/p>
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
                  <span class="subsection-entry__hint">闂佺懓鐏氶幐鍝ユ閹寸姭鍋撳☉娆忓濠⒀勵殜瀹曠螖娴ｅ湱鈧喚绱掗弮鍌毿㈤柛顭戜簽閹?/span>
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
        <h1>闂佸搫顦悘婵嗩焽閿熺姴鐭楅柛灞剧⊕濞堣泛鈽夐幘宕囆㈤柣锝庡墴瀵?/h1>
        <p class="detail-meta">闁荤姴娲╁〒鍦垝閻樼绱旈柡宥庡幑閳ь剙顦甸弻灞筋吋閸℃鍘愰柡澶嗘櫆缁嬫垿宕ｉ崱娆屽亾閻㈠灚鍤€缂併劍鐓″鍫曞垂椤旇棄浠撮梺?/p>
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
        <h1>闂佸搫顦悘婵嗩焽閳╁啰鈻旂€广儱鎳愰幗鐘绘煕?/h1>
        <p class="detail-meta">闁荤姴娲弨閬嵥夐崨鏉戣摕闁靛鍎卞鎶芥煕濞嗘瑧绉柟钘夈偢楠炴帡濡烽敂鍙箓鏌涘楣冩妞ゆ帗绮庡☉鐢割敊鐞涒€充壕?/p>
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
      <h1>闂佸憡姊绘慨鎯归崶銊ョ窞閺夊牜鍋夎</h1>
      <p class="detail-meta">闂佸搫顦悘婵嗩焽閿熺姴绀冮柛娑卞弾閸熷洭鏌涢弮鍌毿繛鏉戞处瀵板嫭娼忛銉愭洟鏌ㄥ☉妯肩劮妞ゆ洦鍓涚划娆忣吋閸涱喖鈧敻鏌涢幇顒傂ラ柣锔诲灦婵?/p>
    </section>
  `;
});
