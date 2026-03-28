const pageSelect = document.getElementById("page");
const groupSelect = document.getElementById("groupKey");
const subSelect = document.getElementById("subKey");
const adminCategorySelect = document.getElementById("admin-category");
const loanSubkeySelect = document.getElementById("loan-subkey");
const loanSubsectionLabel = document.getElementById("loan-subsection-label");
const form = document.getElementById("content-form");
const message = document.getElementById("form-message");
const list = document.getElementById("admin-list");
const submitBtn = document.getElementById("submit-btn");
const cancelEditBtn = document.getElementById("cancel-edit");
const boardFilter = document.getElementById("board-filter");
const contentCategoryNav = document.getElementById("content-category-nav");
const contentSubsectionNav = document.getElementById("content-subsection-nav");
const contentItemList = document.getElementById("content-item-list");
const contentDetailView = document.getElementById("content-detail-view");
const shareImageUrlInput = document.getElementById("shareImageUrl");
const shareImageFileInput = document.getElementById("shareImageFile");
const clearShareImageBtn = document.getElementById("clear-share-image");
const shareImagePreview = document.getElementById("share-image-preview");
const shareImagePreviewImg = document.getElementById("share-image-preview-img");
const shareImagePreviewText = document.getElementById("share-image-preview-text");
const noteForm = document.getElementById("note-form");
const noteMessage = document.getElementById("note-message");
const noteList = document.getElementById("note-list");
const noteSubmitBtn = document.getElementById("note-submit-btn");
const noteCancelEditBtn = document.getElementById("note-cancel-edit");
const noteSearch = document.getElementById("note-search");
const vipGrantForm = document.getElementById("vip-grant-form");
const vipMessage = document.getElementById("vip-message");
const vipOverview = document.getElementById("vip-overview");
const vipUserList = document.getElementById("vip-user-list");
const refreshVipUsersBtn = document.getElementById("refresh-vip-users");
const growthAdminMessage = document.getElementById("growth-admin-message");
const growthOverview = document.getElementById("growth-overview");
const growthCustomerList = document.getElementById("growth-customer-list");
const refreshGrowthCustomersBtn = document.getElementById("refresh-growth-customers");
const growthCustomerDetailPanel = document.getElementById("growth-customer-detail-panel");
const growthDetailTitle = document.getElementById("growth-detail-title");
const growthDetailSubtitle = document.getElementById("growth-detail-subtitle");
const closeGrowthDetailBtn = document.getElementById("close-growth-detail");
const growthProjectList = document.getElementById("growth-project-list");
const growthAddProjectForm = document.getElementById("growth-add-project-form");
const analyticsMessage = document.getElementById("analytics-message");
const analyticsOverview = document.getElementById("analytics-overview");
const analyticsSubsections = document.getElementById("analytics-subsections");
const analyticsEvents = document.getElementById("analytics-events");
const analyticsUsers = document.getElementById("analytics-users");
const refreshAnalyticsBtn = document.getElementById("refresh-analytics");
const clearAnalyticsBtn = document.getElementById("clear-analytics");
const adminViewPanels = Array.from(document.querySelectorAll("[data-admin-panel]"));
const adminViewLinks = Array.from(document.querySelectorAll("[data-admin-view-link]"));

let sections = {};
let contents = [];
let editingId = "";
let notes = [];
let noteEditingId = "";
let vipUsers = [];
let growthCustomers = [];
let selectedGrowthCustomerId = "";
let analyticsData = null;
let shareImageUploading = false;
let selectedContentCategory = "loans";
let selectedContentSubsection = "";
let selectedContentId = "";

const CONTENT_TYPE_LABELS = {
  article: "普通文章",
  web: "网页工具",
  "mini-program": "微信小程序"
};

const ADMIN_CONTENT_SECTIONS = {
  loans: {
    label: "贷款",
    page: "home",
    groupKey: "loan-categories",
    defaultSubKey: "bank-house-mortgage"
  },
  articles: {
    label: "文章",
    page: "home",
    groupKey: "article-center",
    defaultSubKey: "featured-articles"
  },
  tools: {
    label: "工具链接",
    page: "home",
    groupKey: "tools-links",
    defaultSubKey: "featured-tools"
  }
};

const DEFAULT_ADMIN_VIEW = "content-create";

function setMessage(text, isError = false) {
  message.textContent = text;
  message.style.color = isError ? "#b42318" : "#7c2d12";
}

function updateFormMode() {
  const isEditing = Boolean(editingId);
  submitBtn.textContent = isEditing ? "保存修改" : "新增内容";
  cancelEditBtn.hidden = !isEditing;
}

function getAdminViewFromHash() {
  const hash = String(window.location.hash || "").replace(/^#/, "").trim();
  const matchedPanel = adminViewPanels.find((panel) => panel.id === hash);
  return matchedPanel?.dataset.adminPanel || DEFAULT_ADMIN_VIEW;
}

function switchAdminView(viewName = DEFAULT_ADMIN_VIEW) {
  adminViewPanels.forEach((panel) => {
    const shouldShow = panel.dataset.adminPanel === viewName;
    if (panel.id === "growth-customer-detail-panel") {
      panel.hidden = !shouldShow || !selectedGrowthCustomerId;
      return;
    }
    panel.hidden = !shouldShow;
  });

  adminViewLinks.forEach((link) => {
    const isActive = link.dataset.adminViewLink === viewName;
    link.classList.toggle("chip--primary", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

function setShareImagePreview(url, text = "") {
  if (!shareImagePreview || !shareImagePreviewImg || !shareImagePreviewText) {
    return;
  }

  const finalUrl = String(url || "").trim();
  if (!finalUrl) {
    shareImagePreview.hidden = true;
    shareImagePreviewImg.removeAttribute("src");
    shareImagePreviewText.textContent = "";
    return;
  }

  shareImagePreview.hidden = false;
  shareImagePreviewImg.src = finalUrl;
  shareImagePreviewText.textContent = text || "已设置头图";
}

function clearShareImageFields() {
  if (shareImageUrlInput) {
    shareImageUrlInput.value = "";
  }
  if (shareImageFileInput) {
    shareImageFileInput.value = "";
  }
  setShareImagePreview("");
}

async function uploadShareImage(file) {
  const pickedFile = file;
  if (!pickedFile) {
    return;
  }

  if (!pickedFile.type.startsWith("image/")) {
    setMessage("请选择图片文件作为头图。", true);
    if (shareImageFileInput) {
      shareImageFileInput.value = "";
    }
    return;
  }

  if (pickedFile.size > 5 * 1024 * 1024) {
    setMessage("头图需小于等于 5MB。", true);
    if (shareImageFileInput) {
      shareImageFileInput.value = "";
    }
    return;
  }

  shareImageUploading = true;
  submitBtn.disabled = true;
  setMessage("正在上传头图...", false);

  const data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      const base64 = result.includes(",") ? result.split(",")[1] : "";
      if (!base64) {
        reject(new Error("图片读取失败"));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("图片读取失败"));
    reader.readAsDataURL(pickedFile);
  });

  try {
    const response = await fetch("/api/uploads/image", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filename: pickedFile.name,
        contentType: pickedFile.type,
        data
      })
    });

    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || "头图上传失败");
    }

    if (shareImageUrlInput) {
      shareImageUrlInput.value = result.file?.url || "";
    }
    setShareImagePreview(result.file?.url, `已上传：${pickedFile.name}`);
    setMessage("头图上传成功，提交文章时会一并保存。", false);
  } catch (error) {
    if (shareImageFileInput) {
      shareImageFileInput.value = "";
    }
    setMessage(error.message || "头图上传失败", true);
  } finally {
    shareImageUploading = false;
    submitBtn.disabled = false;
  }
}

function setAnalyticsMessage(text, isError = false) {
  analyticsMessage.textContent = text;
  analyticsMessage.style.color = isError ? "#b42318" : "#7c2d12";
}

function setNoteMessage(text, isError = false) {
  noteMessage.textContent = text;
  noteMessage.style.color = isError ? "#b42318" : "#7c2d12";
}

function setVipMessage(text, isError = false) {
  vipMessage.textContent = text;
  vipMessage.style.color = isError ? "#b42318" : "#7c2d12";
}

function setGrowthMessage(text, isError = false) {
  growthAdminMessage.textContent = text;
  growthAdminMessage.style.color = isError ? "#b42318" : "#7c2d12";
}

function updateNoteFormMode() {
  const isEditing = Boolean(noteEditingId);
  noteSubmitBtn.textContent = isEditing ? "保存 Note" : "新增 Note";
  noteCancelEditBtn.hidden = !isEditing;
}

function getLoanSubsections() {
  const homeGroups = sections.home?.groups || [];
  const loanGroup = homeGroups.find((group) => group.key === ADMIN_CONTENT_SECTIONS.loans.groupKey);
  return Array.isArray(loanGroup?.children) ? loanGroup.children : [];
}

function getContentCategory(item) {
  if (item.groupKey === ADMIN_CONTENT_SECTIONS.tools.groupKey || item.contentType === "web" || item.contentType === "mini-program") {
    return "tools";
  }
  if (item.groupKey === ADMIN_CONTENT_SECTIONS.articles.groupKey) {
    return "articles";
  }
  return "loans";
}

function getCategoryLabel(category) {
  return ADMIN_CONTENT_SECTIONS[category]?.label || category;
}

function getContentSubsections(category = selectedContentCategory) {
  if (category === "loans") {
    return getLoanSubsections().map((item) => ({
      key: item.key,
      label: item.label
    }));
  }

  const meta = ADMIN_CONTENT_SECTIONS[category];
  if (!meta) {
    return [];
  }

  return [{ key: meta.defaultSubKey, label: meta.label }];
}

function syncAdminCategoryFields() {
  const category = adminCategorySelect.value || "loans";
  const isLoanCategory = category === "loans";
  const loanSubsections = getLoanSubsections();

  pageSelect.value = "home";
  loanSubsectionLabel.hidden = !isLoanCategory;

  if (loanSubsections.length) {
    loanSubkeySelect.innerHTML = loanSubsections
      .map((sub) => `<option value="${sub.key}">${sub.label}</option>`)
      .join("");
  }

  if (isLoanCategory) {
    groupSelect.innerHTML = `<option value="${ADMIN_CONTENT_SECTIONS.loans.groupKey}">${ADMIN_CONTENT_SECTIONS.loans.label}</option>`;
    groupSelect.value = ADMIN_CONTENT_SECTIONS.loans.groupKey;

    const preferredLoanSubKey = loanSubkeySelect.dataset.currentValue || loanSubkeySelect.value || ADMIN_CONTENT_SECTIONS.loans.defaultSubKey;
    if (loanSubsections.some((sub) => sub.key === preferredLoanSubKey)) {
      loanSubkeySelect.value = preferredLoanSubKey;
    }
    subSelect.innerHTML = loanSubsections.map((sub) => `<option value="${sub.key}">${sub.label}</option>`).join("");
    subSelect.value = loanSubkeySelect.value || ADMIN_CONTENT_SECTIONS.loans.defaultSubKey;
  } else {
    const meta = ADMIN_CONTENT_SECTIONS[category] || ADMIN_CONTENT_SECTIONS.articles;
    groupSelect.innerHTML = `<option value="${meta.groupKey}">${meta.label}</option>`;
    groupSelect.value = meta.groupKey;
    subSelect.innerHTML = `<option value="${meta.defaultSubKey}">${meta.label}</option>`;
    subSelect.value = meta.defaultSubKey;
  }

  delete loanSubkeySelect.dataset.currentValue;
}

function fillPageOptions() {
  pageSelect.innerHTML = '<option value="home">首页</option>';
  syncAdminCategoryFields();
}

function syncGroupOptions() {
  syncAdminCategoryFields();
}

function syncSubOptions() {
  syncAdminCategoryFields();
}

function getSubLabel(item) {
  const page = sections[item.page];
  if (!page) {
    return item.subKey;
  }

  const group = page.groups.find((groupItem) => groupItem.key === item.groupKey);
  if (!group) {
    return item.subKey;
  }

  const sub = group.children.find((subItem) => subItem.key === item.subKey);
  return sub ? sub.label : item.subKey;
}

function getFilteredContents() {
  return contents.filter((item) => {
    const matchesCategory = getContentCategory(item) === selectedContentCategory;
    const matchesSubsection = !selectedContentSubsection || item.subKey === selectedContentSubsection;
    return matchesCategory && matchesSubsection;
  });
}

function renderBoardFilter() {
  return;
}

function ensureContentBrowserState() {
  const subsections = getContentSubsections(selectedContentCategory);
  if (!subsections.some((item) => item.key === selectedContentSubsection)) {
    selectedContentSubsection = subsections[0]?.key || "";
  }

  const filteredItems = getFilteredContents();
  if (!filteredItems.some((item) => item.id === selectedContentId)) {
    selectedContentId = filteredItems[0]?.id || "";
  }
}

function renderContentCategoryNav() {
  contentCategoryNav.innerHTML = Object.entries(ADMIN_CONTENT_SECTIONS)
    .map(([key, item]) => {
      const activeClass = key === selectedContentCategory ? " chip--primary" : "";
      return `<button class="chip${activeClass}" type="button" data-content-category="${key}">${item.label}</button>`;
    })
    .join("");
}

function renderContentSubsectionNav() {
  const subsections = getContentSubsections(selectedContentCategory);
  contentSubsectionNav.innerHTML = subsections.length
    ? subsections
        .map((item) => {
          const activeClass = item.key === selectedContentSubsection ? " chip--primary" : "";
          return `<button class="chip${activeClass}" type="button" data-content-subsection="${item.key}">${escapeHtml(item.label)}</button>`;
        })
        .join("")
    : '<p class="empty">当前板块没有可选子版块。</p>';
}

function renderContentItemList() {
  const displayList = getFilteredContents();
  contentItemList.innerHTML = displayList.length
    ? displayList
        .map(
          (item) => `
            <article class="subsection-card">
              <h3>${escapeHtml(item.title)}</h3>
              <p>${escapeHtml(item.summary || "暂无摘要")}</p>
              <p class="detail-meta">类型：${CONTENT_TYPE_LABELS[item.contentType] || "普通文章"}</p>
              <div class="chip-row">
                <button class="chip${item.id === selectedContentId ? " chip--primary" : ""}" type="button" data-content-id="${item.id}">查看详细信息</button>
              </div>
            </article>
          `
        )
        .join("")
    : '<p class="empty">当前子版块暂无内容。</p>';
}

function renderContentDetail() {
  const item = contents.find((entry) => entry.id === selectedContentId);
  if (!item) {
    contentDetailView.innerHTML = '<p class="empty">请先从上方文章列表中选择一条内容。</p>';
    return;
  }

  contentDetailView.innerHTML = `
    <article class="subsection-card">
      <h3>${escapeHtml(item.title)}</h3>
      <p class="detail-meta">内容板块：${getCategoryLabel(getContentCategory(item))}</p>
      <p class="detail-meta">业务归类：${escapeHtml(getSubLabel(item))}</p>
      <p class="detail-meta">类型：${CONTENT_TYPE_LABELS[item.contentType] || "普通文章"}</p>
      <p class="detail-meta">创建时间：${formatDateTime(item.createdAt)}</p>
      <p>${escapeHtml(item.summary || "暂无摘要")}</p>
      <div class="detail-body">${escapeHtml(item.body || "暂无正文内容").replace(/\n/g, "<br />")}</div>
      <div class="meta-row">
        <span>外部链接：${escapeHtml(item.externalUrl || "--")}</span>
      </div>
      <div class="chip-row">
        <button class="chip" type="button" data-edit-id="${item.id}">编辑这条内容</button>
        <button class="chip danger-btn" type="button" data-delete-id="${item.id}">删除这条内容</button>
      </div>
    </article>
  `;
}

function renderAdminList() {
  ensureContentBrowserState();
  renderContentCategoryNav();
  renderContentSubsectionNav();
  renderContentItemList();
  renderContentDetail();
}

function getFilteredNotes() {
  const keyword = String(noteSearch.value || "")
    .trim()
    .toLowerCase();

  if (!keyword) {
    return notes;
  }

  return notes.filter((item) => {
    const title = String(item.title || "").toLowerCase();
    const body = String(item.body || "").toLowerCase();
    const category = String(item.category || "").toLowerCase();
    return title.includes(keyword) || body.includes(keyword) || category.includes(keyword);
  });
}

function renderNoteList() {
  const displayList = getFilteredNotes();
  noteList.innerHTML = displayList.length
    ? displayList
        .map(
          (item) => `
            <article class="subsection-card">
              <div class="note-card__head">
                <div>
                  <h3>${escapeHtml(item.title)}</h3>
                  <p class="detail-meta">
                    ${escapeHtml(item.category || "未分类")}
                    ${item.pinned ? '<span class="note-badge">置顶</span>' : ""}
                  </p>
                </div>
                <span class="detail-meta">更新于 ${formatDateTime(item.updatedAt || item.createdAt)}</span>
              </div>
              <div class="detail-body note-body-preview">${escapeHtml(item.body)}</div>
              <div class="chip-row">
                <button class="chip" type="button" data-note-edit-id="${item.id}">修改</button>
                <button class="chip danger-btn" type="button" data-note-delete-id="${item.id}">删除</button>
              </div>
            </article>
          `
        )
        .join("")
    : '<p class="empty">当前暂无 Note。</p>';
}

function formatDateTime(value) {
  if (!value) {
    return "--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("zh-CN");
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getGrowthLevelStyle(level) {
  return [
    `--level-color:${escapeHtml(level?.color || "#b87333")}`,
    `--level-accent:${escapeHtml(level?.accentColor || "#7c4a1d")}`,
    `--level-glow:${escapeHtml(level?.glowColor || "rgba(184, 115, 51, 0.28)")}`
  ].join(";");
}

function renderGrowthIdentity(customer) {
  const level = customer.growthLevel || {};
  const levelTitle = level.title || "青铜";
  const levelIcon = level.icon || "◆";
  const levelStyle = getGrowthLevelStyle(level);

  return `
    <div class="growth-customer-card__identity">
      <div class="growth-avatar-frame" style="${levelStyle}" data-level-key="${escapeHtml(level.key || "bronze")}">
        <img class="growth-avatar" src="${escapeHtml(customer.avatarUrl)}" alt="${escapeHtml(customer.customerName)}" />
        <span class="growth-avatar-frame__icon" aria-hidden="true">${escapeHtml(levelIcon)}</span>
      </div>
      <div>
        <div class="growth-name-row">
          <h3>${escapeHtml(customer.customerName)}</h3>
          <span class="growth-level-badge" style="${levelStyle}">
            ${escapeHtml(levelIcon)} ${escapeHtml(levelTitle)}
          </span>
        </div>
        <p class="detail-meta">客户 ID：${escapeHtml(customer.id)}</p>
        <p class="detail-meta">头像框：${escapeHtml(level.frameName || `${levelTitle}头像框`)}</p>
      </div>
    </div>
  `;
}

function renderUserProfileBlock(profile) {
  if (!profile) {
    return '<p class="detail-meta">暂无已登记的注册资料。</p>';
  }

  const nameLine = [profile.name, profile.title].filter(Boolean).join(" · ");
  const contactLine = [profile.phone ? `电话：${profile.phone}` : "", profile.wechat ? `微信：${profile.wechat}` : ""]
    .filter(Boolean)
    .join(" / ");

  return `
    <div class="meta-row">
      ${profile.avatarUrl ? `<img class="admin-user-avatar" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.name || profile.userId || "用户头像")}" />` : ""}
      <span>登记 ID：${escapeHtml(profile.userId || "--")}</span>
      <span>${escapeHtml(nameLine || "未填写姓名/头衔")}</span>
      <span>${escapeHtml(contactLine || "未填写微信")}</span>
    </div>
    ${
      profile.introduction
        ? `<p class="detail-meta">介绍：${escapeHtml(profile.introduction)}</p>`
        : ""
    }
  `;
}

function renderAnalyticsOverview() {
  const overview = analyticsData?.overview;
  if (!overview) {
    analyticsOverview.innerHTML = '<p class="empty">暂无浏览统计。</p>';
    return;
  }

  const stats = [
    { label: "累计用户数", value: overview.totalUsers || 0 },
    { label: "累计浏览次数", value: overview.totalClicks || 0 },
    { label: "累计转发次数", value: overview.totalShares || 0 },
    { label: "有浏览记录的板块", value: (overview.subsectionStats || []).length },
    { label: "最近记录数", value: (overview.recentEvents || []).length }
  ];

  analyticsOverview.innerHTML = stats
    .map(
      (item) => `
        <article class="stat-card">
          <span class="stat-label">${item.label}</span>
          <strong class="stat-value">${item.value}</strong>
        </article>
      `
    )
    .join("");
}

function renderVipOverview() {
  if (!vipUsers.length) {
    vipOverview.innerHTML = '<p class="empty">暂无 VIP 用户数据。</p>';
    return;
  }

  const activeUsers = vipUsers.filter((item) => item.isVip).length;
  const totalRechargeAmount = vipUsers.reduce((sum, item) => sum + Number(item.totalRechargeAmount || 0), 0);
  const totalRechargeCount = vipUsers.reduce((sum, item) => sum + Number(item.totalRechargeCount || 0), 0);
  const totalGrantedDays = vipUsers.reduce((sum, item) => sum + Number(item.totalGrantedDays || 0), 0);

  const stats = [
    { label: "用户总数", value: vipUsers.length },
    { label: "当前 VIP 用户", value: activeUsers },
    { label: "累计充值金额", value: `￥${totalRechargeAmount}` },
    { label: "累计充值笔数", value: totalRechargeCount },
    { label: "累计授予天数", value: totalGrantedDays }
  ];

  vipOverview.innerHTML = stats
    .map(
      (item) => `
        <article class="stat-card">
          <span class="stat-label">${item.label}</span>
          <strong class="stat-value">${item.value}</strong>
        </article>
      `
    )
    .join("");
}

function renderVipUsers() {
  vipUserList.innerHTML = vipUsers.length
    ? vipUsers
        .map(
          (user) => `
            <article class="user-card">
              <div class="user-card__head">
                <div>
                  <h3>${escapeHtml(user.userId)}</h3>
                  ${renderUserProfileBlock(user.profile)}
                  <div class="meta-row">
                    <span>当前身份：${user.isVip ? "VIP 用户" : "普通用户"}</span>
                    <span>剩余 VIP 时间：${user.isVip ? `${user.remainingDays} 天` : "已过期 / 未开通"}</span>
                    <span>VIP 到期时间：${formatDateTime(user.vipExpiresAt)}</span>
                  </div>
                  <div class="meta-row">
                    <span>累计充值：￥${Number(user.totalRechargeAmount || 0)}</span>
                    <span>累计充值笔数：${Number(user.totalRechargeCount || 0)}</span>
                    <span>后台授予：${Number(user.vipGrantedByAdminDays || 0)} 天</span>
                  </div>
                  <div class="meta-row">
                    <span>首次访问：${formatDateTime(user.firstSeenAt)}</span>
                    <span>最近活跃：${formatDateTime(user.lastActiveAt)}</span>
                    <span>备注：${escapeHtml(user.notes || "--")}</span>
                  </div>
                </div>
                <div class="user-card__stats">
                  <strong>￥${Number(user.totalRechargeAmount || 0)}</strong>
                  <span>累计充值</span>
                </div>
                <div class="user-card__stats">
                  <strong>${user.isVip ? `${user.remainingDays}天` : "0天"}</strong>
                  <span>剩余 VIP</span>
                </div>
              </div>
              <div class="chip-row">
                <button
                  class="chip"
                  type="button"
                  data-fill-vip-user="${escapeHtml(user.userId)}"
                >填入下方授权</button>
              </div>
            </article>
          `
        )
        .join("")
    : '<p class="empty">当前还没有用户权限数据。用户访问站点后会自动出现，或可直接手动录入用户 ID 授权。</p>';
}

function getSelectedGrowthCustomer() {
  return growthCustomers.find((item) => item.id === selectedGrowthCustomerId) || null;
}

function renderGrowthOverview() {
  if (!growthCustomers.length) {
    growthOverview.innerHTML = '<p class="empty">暂无成长系统客户数据。</p>';
    return;
  }

  const totalProjects = growthCustomers.reduce((sum, item) => sum + Number(item.totalProjects || 0), 0);
  const completedProjects = growthCustomers.reduce((sum, item) => sum + Number(item.completedCount || 0), 0);
  const activeProjects = growthCustomers.reduce(
    (sum, item) => sum + Number((item.activeProjects || []).length || 0),
    0
  );
  const pendingChanges = growthCustomers.reduce((sum, item) => sum + Number(item.pendingChangeCount || 0), 0);

  const stats = [
    { label: "客户总数", value: growthCustomers.length },
    { label: "项目总数", value: totalProjects },
    { label: "进行中项目", value: activeProjects },
    { label: "已完成项目", value: completedProjects },
    { label: "待审核修改", value: pendingChanges }
  ];

  growthOverview.innerHTML = stats
    .map(
      (item) => `
        <article class="stat-card">
          <span class="stat-label">${item.label}</span>
          <strong class="stat-value">${item.value}</strong>
        </article>
      `
    )
    .join("");
}

function renderGrowthCustomerList() {
  growthCustomerList.innerHTML = growthCustomers.length
    ? growthCustomers
        .map((customer) => {
          const activeProjects = customer.activeProjects || [];
          const nextLevel = customer.growthLevel?.nextLevel;
          const activeProjectLabels = activeProjects.length
            ? activeProjects
                .map(
                  (project) => `
                    <span class="chip growth-chip">
                      ${escapeHtml(project.loanProject)} ${project.progress}%
                    </span>
                  `
                )
                .join("")
            : '<span class="chip growth-chip growth-chip--muted">当前没有进行中的项目</span>';

          return `
            <article class="growth-customer-card">
              <div class="growth-customer-card__head">
                <button class="growth-avatar-badge-wrap growth-avatar-entry" type="button" data-growth-detail-id="${escapeHtml(customer.id)}">
                  ${renderGrowthIdentity(customer)}
                  ${
                    customer.pendingChangeCount
                      ? `<span class="growth-avatar-alert">${customer.pendingChangeCount}</span>`
                      : ""
                  }
                </button>
                <div class="user-card__stats">
                  <strong>${customer.completedCount}</strong>
                  <span>已完成项目</span>
                </div>
              </div>
              <p class="growth-level-progress">${
                nextLevel
                  ? `距离 ${escapeHtml(nextLevel.title)} 还差 ${nextLevel.remainingTasks} 个已完成项目`
                  : "已达到最高等级"
              }</p>
              <div class="growth-inline-list">${activeProjectLabels}</div>
              <div class="chip-row">
                <button class="chip" type="button" data-growth-detail-id="${escapeHtml(customer.id)}">进入详情</button>
              </div>
            </article>
          `;
        })
        .join("")
    : '<p class="empty">当前还没有客户项目。前端提交后会自动显示在这里。</p>';
}

function renderGrowthDiffRow(label, beforeValue, afterValue) {
  return `
    <div class="growth-diff-row">
      <span class="growth-diff-row__label">${label}</span>
      <div class="growth-diff-row__values">
        <div>
          <small>修改前</small>
          <strong>${escapeHtml(beforeValue)}</strong>
        </div>
        <div>
          <small>修改后</small>
          <strong>${escapeHtml(afterValue)}</strong>
        </div>
      </div>
    </div>
  `;
}

function renderGrowthProjectList() {
  const customer = getSelectedGrowthCustomer();
  if (!customer) {
    growthCustomerDetailPanel.hidden = true;
    growthDetailTitle.textContent = "客户项目详情";
    growthDetailSubtitle.textContent = "";
    growthProjectList.innerHTML = "";
    return;
  }

  growthCustomerDetailPanel.hidden = false;
  growthDetailTitle.textContent = `${customer.customerName} · ${customer.growthLevel?.title || "青铜"}等级`;
  growthDetailSubtitle.textContent = `客户 ID：${customer.id}，待审核修改 ${customer.pendingChangeCount} 项，已完成 ${customer.completedCount} 个项目，共 ${customer.totalProjects} 个项目。`;

  growthProjectList.innerHTML = customer.projects.length
    ? customer.projects
        .map((project) => {
          const pendingRequests = (project.changeRequests || []).filter((item) => item.status === "pending");
          const reviewedRequests = (project.changeRequests || []).filter((item) => item.status !== "pending");

          return `
            <article class="growth-project-editor">
              <div class="growth-project-editor__head">
                <div>
                  <h3>${escapeHtml(project.loanProject)}</h3>
                  <p class="detail-meta">金额：${escapeHtml(project.amount)} | 状态：${
                    project.status === "completed" ? "已完成" : "进行中"
                  } | 当前进度：${project.progress}%</p>
                </div>
                ${
                  pendingRequests.length
                    ? `<span class="growth-pending-badge">待审核 ${pendingRequests.length}</span>`
                    : `<span class="growth-completed-tag">无待审核</span>`
                }
              </div>
              <div class="growth-progress">
                <div class="growth-progress__bar">
                  <span style="width:${project.progress}%"></span>
                </div>
                <span class="growth-progress__text">${project.progress}%</span>
              </div>
              ${
                pendingRequests.length
                  ? `
                    <div class="growth-review-list">
                      ${pendingRequests
                        .map(
                          (request) => `
                            <article class="growth-review-card">
                              <div class="growth-review-card__head">
                                <strong>待审核修改</strong>
                                <span>${formatDateTime(request.submittedAt)}</span>
                              </div>
                              ${renderGrowthDiffRow(
                                "项目名称",
                                request.currentSnapshot?.loanProject || project.loanProject,
                                request.requestedChanges.loanProject || request.currentSnapshot?.loanProject || project.loanProject
                              )}
                              ${renderGrowthDiffRow(
                                "金额",
                                request.currentSnapshot?.amount || project.amount,
                                request.requestedChanges.amount || request.currentSnapshot?.amount || project.amount
                              )}
                              ${renderGrowthDiffRow(
                                "详细信息",
                                request.currentSnapshot?.details || project.details,
                                request.requestedChanges.details || request.currentSnapshot?.details || project.details
                              )}
                              ${renderGrowthDiffRow(
                                "进度",
                                `${request.currentSnapshot?.progress ?? project.progress}%`,
                                `${request.requestedChanges.progress ?? request.currentSnapshot?.progress ?? project.progress}%`
                              )}
                              ${
                                request.requestNote
                                  ? `<p class="detail-meta">申请备注：${escapeHtml(request.requestNote)}</p>`
                                  : ""
                              }
                              <label>
                                后台回复
                                <textarea rows="3" data-growth-reply="${request.id}" placeholder="填写通过或拒绝的说明"></textarea>
                              </label>
                              <div class="chip-row">
                                <button class="chip chip--primary" type="button" data-growth-approve="${request.id}">通过修改</button>
                                <button class="chip danger-btn" type="button" data-growth-reject="${request.id}">拒绝修改</button>
                              </div>
                            </article>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : ""
              }
              ${
                reviewedRequests.length
                  ? `
                    <div class="growth-request-history">
                      <h4>已处理记录</h4>
                      ${reviewedRequests
                        .slice(0, 4)
                        .map(
                          (request) => `
                            <div class="growth-request-history__item">
                              <strong>${request.status === "approved" ? "已通过" : "已拒绝"}</strong>
                              <span>${formatDateTime(request.reviewedAt || request.submittedAt)}</span>
                              <p>${escapeHtml(request.replyMessage || "后台已处理该申请。")}</p>
                            </div>
                          `
                        )
                        .join("")}
                    </div>
                  `
                  : ""
              }
            </article>
          `;
        })
        .join("")
    : '<p class="empty">该客户暂无项目。</p>';
}

function renderAnalyticsSubsections() {
  const rows = analyticsData?.overview?.subsectionStats || [];
  analyticsSubsections.innerHTML = rows.length
    ? rows
        .map(
          (item) => `
            <tr>
              <td>${escapeHtml(item.pageLabel || item.page)}</td>
              <td>${escapeHtml(item.groupLabel || item.groupKey)}</td>
              <td>${escapeHtml(item.subLabel || item.subKey)}</td>
              <td>${item.totalClicks} / ${item.clickPercentage}%</td>
              <td>${item.totalShares} / ${item.sharePercentage}%</td>
              <td>${item.userCount}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="6" class="empty">暂无板块浏览数据。</td></tr>';
}

function renderAnalyticsEvents() {
  const rows = analyticsData?.overview?.recentEvents || [];
  analyticsEvents.innerHTML = rows.length
    ? rows
        .map(
          (item) => `
            <tr>
              <td>${formatDateTime(item.createdAt)}</td>
              <td>${escapeHtml(item.userId)}</td>
              <td>${escapeHtml(item.page)}</td>
              <td>${escapeHtml(item.subKey)}</td>
              <td>${escapeHtml(item.contentTitle || item.contentSlug || "--")}</td>
              <td>${item.action === "share" ? "转发" : "点击"}</td>
              <td>${escapeHtml(item.source || "--")}</td>
            </tr>
          `
        )
        .join("")
    : '<tr><td colspan="7" class="empty">暂无最近浏览记录。</td></tr>';
}

function renderAnalyticsUsers() {
  const users = analyticsData?.users || [];
  analyticsUsers.innerHTML = users.length
    ? users
        .map((user) => {
          const topSection = user.topSection;
          const sectionRows = (user.sectionStats || []).length
            ? user.sectionStats
                .map(
                  (section) => `
                    <tr>
                      <td>${escapeHtml(section.pageLabel || section.page)}</td>
                      <td>${escapeHtml(section.groupLabel || section.groupKey)}</td>
                      <td>${escapeHtml(section.subLabel || section.subKey)}</td>
                      <td>${section.clickCount} / ${section.clickPercentage}%</td>
                      <td>${section.shareCount} / ${section.sharePercentage}%</td>
                      <td>${formatDateTime(section.lastClickedAt || section.lastSharedAt)}</td>
                    </tr>
                    <tr>
                      <td colspan="6">
                        <div class="table-wrap">
                          <table class="data-table">
                            <thead>
                              <tr>
                                <th>文章</th>
                                <th>点击次数 / 占本板块点击</th>
                                <th>转发次数 / 占本板块转发</th>
                                <th>最近操作</th>
                              </tr>
                            </thead>
                            <tbody>
                              ${
                                (section.articleStats || []).length
                                  ? section.articleStats
                                      .map(
                                        (article) => `
                                          <tr>
                                            <td>${escapeHtml(article.contentTitle || article.contentSlug || article.contentId || "--")}</td>
                                            <td>${article.clickCount} / ${article.clickPercentage}%</td>
                                            <td>${article.shareCount} / ${article.sharePercentage}%</td>
                                            <td>${formatDateTime(article.lastClickedAt || article.lastSharedAt)}</td>
                                          </tr>
                                        `
                                      )
                                      .join("")
                                  : '<tr><td colspan="4" class="empty">该板块下暂无文章明细。</td></tr>'
                              }
                            </tbody>
                          </table>
                        </div>
                      </td>
                    </tr>
                  `
                )
                .join("")
            : '<tr><td colspan="6" class="empty">暂无板块浏览明细。</td></tr>';

          return `
            <article class="user-card">
              <div class="user-card__head">
                <div>
                  <h3>${escapeHtml(user.userId)}</h3>
                  ${renderUserProfileBlock(user.profile)}
                  <div class="meta-row">
                    <span>首次访问：${formatDateTime(user.firstSeenAt)}</span>
                    <span>最近活跃：${formatDateTime(user.lastActiveAt)}</span>
                    <span>偏好板块：${escapeHtml(topSection?.subLabel || topSection?.subKey || "--")}</span>
                  </div>
                </div>
                <div class="user-card__stats">
                  <strong>${user.totalClicks}</strong>
                  <span>总点击次数</span>
                </div>
                <div class="user-card__stats">
                  <strong>${user.totalShares || 0}</strong>
                  <span>总转发次数</span>
                </div>
              </div>
              <div class="chip-row">
                <button class="chip danger-btn" type="button" data-delete-user-id="${escapeHtml(user.userId)}">删除该用户痕迹</button>
              </div>
              <div class="table-wrap">
                <table class="data-table">
                  <thead>
                    <tr>
                      <th>页面</th>
                      <th>栏目</th>
                      <th>板块</th>
                      <th>点击次数 / 占比</th>
                      <th>转发次数 / 占比</th>
                      <th>最近操作</th>
                    </tr>
                  </thead>
                  <tbody>${sectionRows}</tbody>
                </table>
              </div>
            </article>
          `;
        })
        .join("")
    : '<p class="empty">暂无用户浏览痕迹。</p>';
}

function renderAnalytics() {
  renderAnalyticsOverview();
  renderAnalyticsSubsections();
  renderAnalyticsEvents();
  renderAnalyticsUsers();
}

function syncAdminViewFromLocation() {
  switchAdminView(getAdminViewFromHash());
}

function clearNoteForm() {
  noteForm.reset();
  noteEditingId = "";
  updateNoteFormMode();
}

function fillNoteFormForEdit(item) {
  noteEditingId = item.id;
  document.getElementById("note-title").value = item.title || "";
  document.getElementById("note-category").value = item.category || "";
  document.getElementById("note-body").value = item.body || "";
  document.getElementById("note-pinned").checked = Boolean(item.pinned);
  updateNoteFormMode();
  setNoteMessage("已进入 Note 编辑模式。", false);
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function clearForm() {
  form.reset();
  adminCategorySelect.value = "loans";
  loanSubkeySelect.dataset.currentValue = ADMIN_CONTENT_SECTIONS.loans.defaultSubKey;
  syncAdminCategoryFields();
  editingId = "";
  clearShareImageFields();
  updateFormMode();
}

function fillFormForEdit(item) {
  editingId = item.id;
  const category = getContentCategory(item);
  adminCategorySelect.value = category;
  loanSubkeySelect.dataset.currentValue = item.subKey || "";
  syncAdminCategoryFields();

  document.getElementById("title").value = item.title || "";
  document.getElementById("summary").value = item.summary || "";
  document.getElementById("body").value = item.body || "";
  document.getElementById("externalUrl").value = item.externalUrl || "";
  document.getElementById("contentType").value = item.contentType || "article";
  document.getElementById("miniProgramName").value = item.miniProgramName || "";
  document.getElementById("miniProgramAppId").value = item.miniProgramAppId || "";
  document.getElementById("miniProgramPath").value = item.miniProgramPath || "";
  document.getElementById("miniProgramLaunchUrl").value = item.miniProgramLaunchUrl || "";
  document.getElementById("miniProgramNote").value = item.miniProgramNote || "";
  if (shareImageUrlInput) {
    shareImageUrlInput.value = item.shareImageUrl || "";
  }
  if (shareImageFileInput) {
    shareImageFileInput.value = "";
  }
  setShareImagePreview(item.shareImageUrl, item.shareImageUrl ? "当前已保存头图" : "");

  updateFormMode();
  setMessage("已进入编辑模式，保存后将覆盖原内容。", false);
  window.location.hash = "#content-create";
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadContents() {
  const response = await fetch("/api/content");
  if (!response.ok) {
    throw new Error("加载内容失败");
  }
  const result = await response.json();
  contents = result.contents || [];
  renderAdminList();
}

async function loadNotes() {
  const response = await fetch("/api/notes");
  if (!response.ok) {
    throw new Error("加载 Note 失败");
  }
  const result = await response.json();
  notes = result.notes || [];
  renderNoteList();
}

async function loadAnalytics() {
  const response = await fetch("/api/analytics");
  if (!response.ok) {
    throw new Error("加载浏览痕迹失败");
  }
  const result = await response.json();
  analyticsData = result;
  renderAnalytics();
}

async function loadVipUsers() {
  const response = await fetch("/api/users/vip");
  if (!response.ok) {
    throw new Error("加载 VIP 权限失败");
  }
  const result = await response.json();
  vipUsers = result.users || [];
  renderVipOverview();
  renderVipUsers();
}

async function loadGrowthCustomers(preferredCustomerId = selectedGrowthCustomerId) {
  const response = await fetch("/api/growth/customers");
  if (!response.ok) {
    throw new Error("加载成长系统失败");
  }
  const result = await response.json();
  growthCustomers = result.customers || [];

  if (preferredCustomerId && growthCustomers.some((item) => item.id === preferredCustomerId)) {
    selectedGrowthCustomerId = preferredCustomerId;
  } else if (selectedGrowthCustomerId && !growthCustomers.some((item) => item.id === selectedGrowthCustomerId)) {
    selectedGrowthCustomerId = "";
  }

  renderGrowthOverview();
  renderGrowthCustomerList();
  renderGrowthProjectList();
}

async function loadInitialData() {
  const configRes = await fetch("/api/config");
  if (!configRes.ok) {
    throw new Error("加载配置失败");
  }
  const configData = await configRes.json();
  sections = configData.sections || {};

  fillPageOptions();
  renderBoardFilter();
  updateFormMode();
  updateNoteFormMode();
  const results = await Promise.allSettled([
    loadContents(),
    loadNotes(),
    loadVipUsers(),
    loadGrowthCustomers(),
    loadAnalytics()
  ]);

  const loaders = [
    {
      key: "content",
      failed: results[0].status === "rejected",
      onError: () => {
        setMessage("内容初始化失败，请检查内容接口。", true);
      }
    },
    {
      key: "notes",
      failed: results[1].status === "rejected",
      onError: () => {
        setNoteMessage("Note 初始化失败，请检查后端服务。", true);
      }
    },
    {
      key: "vip",
      failed: results[2].status === "rejected",
      onError: () => {
        setVipMessage("VIP 权限初始化失败，请检查后端服务。", true);
      }
    },
    {
      key: "growth",
      failed: results[3].status === "rejected",
      onError: () => {
        setGrowthMessage("成长系统初始化失败，请检查后端服务。", true);
      }
    },
    {
      key: "analytics",
      failed: results[4].status === "rejected",
      onError: () => {
        setAnalyticsMessage("浏览痕迹初始化失败，请检查后端服务。", true);
      }
    }
  ];

  loaders.forEach((item) => {
    if (item.failed) {
      item.onError();
    }
  });

  if (results[0].status === "rejected") {
    throw results[0].reason;
  }
  syncAdminViewFromLocation();
}

adminCategorySelect.addEventListener("change", syncAdminCategoryFields);
loanSubkeySelect.addEventListener("change", () => {
  subSelect.value = loanSubkeySelect.value || ADMIN_CONTENT_SECTIONS.loans.defaultSubKey;
});
window.addEventListener("hashchange", syncAdminViewFromLocation);
if (boardFilter) {
  boardFilter.addEventListener("change", renderAdminList);
}
contentCategoryNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-content-category]");
  if (!button) {
    return;
  }

  selectedContentCategory = button.dataset.contentCategory || "loans";
  selectedContentSubsection = "";
  selectedContentId = "";
  renderAdminList();
});

contentSubsectionNav.addEventListener("click", (event) => {
  const button = event.target.closest("[data-content-subsection]");
  if (!button) {
    return;
  }

  selectedContentSubsection = button.dataset.contentSubsection || "";
  selectedContentId = "";
  renderAdminList();
});

contentItemList.addEventListener("click", (event) => {
  const button = event.target.closest("[data-content-id]");
  if (!button) {
    return;
  }

  selectedContentId = button.dataset.contentId || "";
  renderAdminList();
});
refreshAnalyticsBtn.addEventListener("click", async () => {
  setAnalyticsMessage("正在刷新浏览痕迹...", false);
  try {
    await loadAnalytics();
    setAnalyticsMessage("浏览痕迹已刷新。", false);
  } catch {
    setAnalyticsMessage("刷新失败，请检查后端服务。", true);
  }
});

refreshVipUsersBtn.addEventListener("click", async () => {
  setVipMessage("正在刷新 VIP 权限数据...", false);
  try {
    await loadVipUsers();
    setVipMessage("VIP 权限数据已刷新。", false);
  } catch {
    setVipMessage("刷新失败，请检查后端服务。", true);
  }
});

refreshGrowthCustomersBtn.addEventListener("click", async () => {
  setGrowthMessage("正在刷新成长系统数据...", false);
  try {
    await loadGrowthCustomers();
    setGrowthMessage("成长系统数据已刷新。", false);
  } catch {
    setGrowthMessage("刷新失败，请检查后端服务。", true);
  }
});

clearAnalyticsBtn.addEventListener("click", async () => {
  const confirmed = window.confirm("确认清空全部用户浏览痕迹吗？此操作无法恢复。");
  if (!confirmed) {
    return;
  }

  setAnalyticsMessage("正在清空全部浏览痕迹...", false);
  try {
    const response = await fetch("/api/analytics", { method: "DELETE" });
    const result = await response.json();
    if (!response.ok) {
      setAnalyticsMessage(result.message || "清空失败", true);
      return;
    }

    setAnalyticsMessage("已清空全部浏览痕迹。", false);
    await loadAnalytics();
  } catch {
    setAnalyticsMessage("清空失败，请稍后重试。", true);
  }
});

if (shareImageUrlInput) {
  shareImageUrlInput.addEventListener("input", () => {
    const nextUrl = String(shareImageUrlInput.value || "").trim();
    if (!nextUrl) {
      setShareImagePreview("");
      return;
    }

    setShareImagePreview(nextUrl, "当前头图地址预览");
  });
}

if (shareImageFileInput) {
  shareImageFileInput.addEventListener("change", async () => {
    const [file] = shareImageFileInput.files || [];
    try {
      await uploadShareImage(file);
    } catch (error) {
      setMessage(error.message || "头图上传失败", true);
      shareImageUploading = false;
      submitBtn.disabled = false;
    }
  });
}

if (clearShareImageBtn) {
  clearShareImageBtn.addEventListener("click", () => {
    clearShareImageFields();
    setMessage("已清空头图。", false);
  });
}

cancelEditBtn.addEventListener("click", () => {
  clearForm();
  setMessage("已取消编辑，可继续上传新文章。", false);
});

noteCancelEditBtn.addEventListener("click", () => {
  clearNoteForm();
  setNoteMessage("已取消 Note 编辑。", false);
});

contentDetailView.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-edit-id]");
  if (editButton) {
    const target = contents.find((item) => item.id === editButton.dataset.editId);
    if (target) {
      fillFormForEdit(target);
    }
    return;
  }

  const deleteButton = event.target.closest("[data-delete-id]");
  if (!deleteButton) {
    return;
  }

  const target = contents.find((item) => item.id === deleteButton.dataset.deleteId);
  if (!target) {
    return;
  }

  const confirmed = window.confirm(`确认删除《${target.title}》吗？删除后无法恢复。`);
  if (!confirmed) {
    return;
  }

  setMessage("正在删除...", false);
  const response = await fetch(`/api/content/${target.id}`, { method: "DELETE" });
  const result = await response.json();

  if (!response.ok) {
    setMessage(result.message || "删除失败", true);
    return;
  }

  if (editingId === target.id) {
    clearForm();
  }
  setMessage("删除成功", false);
  await loadContents();
});

noteSearch.addEventListener("input", renderNoteList);

noteList.addEventListener("click", async (event) => {
  const editButton = event.target.closest("[data-note-edit-id]");
  if (editButton) {
    const target = notes.find((item) => item.id === editButton.dataset.noteEditId);
    if (target) {
      fillNoteFormForEdit(target);
    }
    return;
  }

  const deleteButton = event.target.closest("[data-note-delete-id]");
  if (!deleteButton) {
    return;
  }

  const target = notes.find((item) => item.id === deleteButton.dataset.noteDeleteId);
  if (!target) {
    return;
  }

  const confirmed = window.confirm(`确认删除 Note《${target.title}》吗？`);
  if (!confirmed) {
    return;
  }

  setNoteMessage("正在删除 Note...", false);
  const response = await fetch(`/api/notes/${target.id}`, { method: "DELETE" });
  const result = await response.json();
  if (!response.ok) {
    setNoteMessage(result.message || "删除失败", true);
    return;
  }

  if (noteEditingId === target.id) {
    clearNoteForm();
  }
  setNoteMessage("Note 已删除。", false);
  await loadNotes();
});

vipUserList.addEventListener("click", (event) => {
  const fillButton = event.target.closest("[data-fill-vip-user]");
  if (!fillButton) {
    return;
  }

  document.getElementById("vip-user-id").value = fillButton.dataset.fillVipUser || "";
  document.getElementById("vip-days").focus();
  setVipMessage("已填入用户 ID，可直接授予 VIP 时间。", false);
});

growthCustomerList.addEventListener("click", async (event) => {
  const detailButton = event.target.closest("[data-growth-detail-id]");
  if (!detailButton) {
    return;
  }

  if (window.location.hash !== "#growth-management") {
    window.location.hash = "#growth-management";
  }
  selectedGrowthCustomerId = detailButton.dataset.growthDetailId || "";
  growthAddProjectForm.reset();
  renderGrowthProjectList();
  switchAdminView("growth-management");
  growthCustomerDetailPanel.scrollIntoView({ behavior: "smooth", block: "start" });
});

closeGrowthDetailBtn.addEventListener("click", () => {
  selectedGrowthCustomerId = "";
  growthAddProjectForm.reset();
  renderGrowthProjectList();
  switchAdminView("growth-management");
});

growthProjectList.addEventListener("input", (event) => {
  const progressInput = event.target.closest("[data-growth-progress]");
  if (!progressInput) {
    return;
  }

  const projectId = progressInput.dataset.growthProgress;
  const nextText = growthProjectList.querySelector(`[data-growth-progress-text="${projectId}"]`);
  const bar = progressInput
    .closest(".growth-project-editor")
    ?.querySelector(".growth-progress__bar span");

  if (nextText) {
    nextText.textContent = `${progressInput.value}%`;
  }
  if (bar) {
    bar.style.width = `${progressInput.value}%`;
  }
});

growthProjectList.addEventListener("click", async (event) => {
  const approveButton = event.target.closest("[data-growth-approve]");
  const rejectButton = event.target.closest("[data-growth-reject]");
  const actionButton = approveButton || rejectButton;
  if (!actionButton) {
    return;
  }

  const requestId = approveButton ? approveButton.dataset.growthApprove : rejectButton.dataset.growthReject;
  const reply = growthProjectList.querySelector(`[data-growth-reply="${requestId}"]`)?.value || "";
  const action = approveButton ? "approve" : "reject";

  setGrowthMessage(action === "approve" ? "正在通过修改申请..." : "正在拒绝修改申请...", false);

  try {
    const response = await fetch(`/api/growth/change-requests/${requestId}/${action}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ replyMessage: reply })
    });
    const result = await response.json();
    if (!response.ok) {
      setGrowthMessage(result.message || "审核失败", true);
      return;
    }

    setGrowthMessage(action === "approve" ? "修改申请已通过。" : "修改申请已拒绝。", false);
    await loadGrowthCustomers(selectedGrowthCustomerId);
  } catch {
    setGrowthMessage("审核失败，请稍后重试。", true);
  }
});

growthAddProjectForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!selectedGrowthCustomerId) {
    setGrowthMessage("请先从上方客户列表进入一个客户详情。", true);
    return;
  }

  const payload = Object.fromEntries(new FormData(growthAddProjectForm).entries());
  setGrowthMessage("正在新增项目...", false);

  try {
    const response = await fetch(`/api/growth/customers/${selectedGrowthCustomerId}/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      setGrowthMessage(result.message || "新增项目失败", true);
      return;
    }

    growthAddProjectForm.reset();
    setGrowthMessage("新项目已添加。", false);
    await loadGrowthCustomers(selectedGrowthCustomerId);
  } catch {
    setGrowthMessage("新增项目失败，请稍后重试。", true);
  }
});

analyticsUsers.addEventListener("click", async (event) => {
  const deleteButton = event.target.closest("[data-delete-user-id]");
  if (!deleteButton) {
    return;
  }

  const userId = deleteButton.dataset.deleteUserId || "";
  const confirmed = window.confirm(`确认删除用户 ${userId} 的全部浏览痕迹吗？此操作无法恢复。`);
  if (!confirmed) {
    return;
  }

  setAnalyticsMessage(`正在删除用户 ${userId} 的浏览痕迹...`, false);

  try {
    const response = await fetch(`/api/analytics/users/${encodeURIComponent(userId)}`, {
      method: "DELETE"
    });
    const result = await response.json();
    if (!response.ok) {
      setAnalyticsMessage(result.message || "删除失败", true);
      return;
    }

    setAnalyticsMessage(`已删除用户 ${userId} 的浏览痕迹。`, false);
    await loadAnalytics();
  } catch {
    setAnalyticsMessage("删除失败，请稍后重试。", true);
  }
});

vipGrantForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setVipMessage("正在授予 VIP 时间...", false);

  const formData = new FormData(vipGrantForm);
  const payload = {
    userId: String(formData.get("userId") || "").trim(),
    days: Number(formData.get("days") || 0),
    notes: String(formData.get("notes") || "").trim()
  };

  try {
    const response = await fetch("/api/users/vip/grant", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      setVipMessage(result.message || "授予失败", true);
      return;
    }

    vipGrantForm.reset();
    setVipMessage(
      `已为用户 ${result.user?.userId || payload.userId} 授予 ${payload.days} 天 VIP，有效期至 ${formatDateTime(
        result.user?.vipExpiresAt
      )}。`,
      false
    );
    await loadVipUsers();
  } catch {
    setVipMessage("授予失败，请稍后重试。", true);
  }
});

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (shareImageUploading) {
    setMessage("头图还在上传中，请稍等片刻。", true);
    return;
  }
  syncAdminCategoryFields();
  setMessage(editingId ? "正在保存修改..." : "正在上传...", false);

  const payload = Object.fromEntries(new FormData(form).entries());
  payload.shareImageUrl = String(payload.shareImageUrl || "").trim();
  const method = editingId ? "PUT" : "POST";
  const endpoint = editingId ? `/api/content/${editingId}` : "/api/content";

  const response = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok) {
    setMessage(result.message || "操作失败", true);
    return;
  }

  setMessage(editingId ? "修改成功" : "上传成功", false);
  clearForm();
  await loadContents();
});

noteForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setNoteMessage(noteEditingId ? "正在保存 Note..." : "正在新增 Note...", false);

  const formData = new FormData(noteForm);
  const payload = {
    title: formData.get("title"),
    category: formData.get("category"),
    body: formData.get("body"),
    pinned: formData.get("pinned") === "on"
  };

  const method = noteEditingId ? "PUT" : "POST";
  const endpoint = noteEditingId ? `/api/notes/${noteEditingId}` : "/api/notes";
  const response = await fetch(endpoint, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  const result = await response.json();
  if (!response.ok) {
    setNoteMessage(result.message || "Note 操作失败", true);
    return;
  }

  setNoteMessage(noteEditingId ? "Note 修改成功" : "Note 新增成功", false);
  clearNoteForm();
  await loadNotes();
});

loadInitialData().catch(() => {
  setMessage("初始化失败，请检查配置或内容接口。", true);
});

window.setInterval(() => {
  loadGrowthCustomers(selectedGrowthCustomerId).catch(() => {});
}, 15000);
