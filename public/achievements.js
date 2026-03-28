const growthForm = document.getElementById("growth-form");
const growthMessage = document.getElementById("growth-message");
const growthRecentList = document.getElementById("growth-recent-list");
const growthSubmitBtn = document.getElementById("growth-submit-btn");

let currentGrowthCustomers = [];

function setGrowthMessage(text, isError = false) {
  growthMessage.textContent = text;
  growthMessage.style.color = isError ? "#b42318" : "#7c2d12";
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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

function renderNotifications(customer) {
  const notifications = customer.reviewNotifications || [];
  if (!notifications.length) {
    return '<p class="detail-meta">暂时还没有审核通知，后台处理后会自动展示在这里。</p>';
  }

  return `
    <div class="growth-notification-list">
      ${notifications
        .slice(0, 5)
        .map(
          (item) => `
            <article class="growth-notification growth-notification--${item.status}">
              <strong>${item.status === "approved" ? "已通过" : "已拒绝"}</strong>
              <span>${escapeHtml(item.projectName)}</span>
              <p>${escapeHtml(item.replyMessage || "后台已处理这次修改申请。")}</p>
              <small>${formatDateTime(item.reviewedAt)}</small>
            </article>
          `
        )
        .join("")}
    </div>
  `;
}

function renderProject(project) {
  const pendingRequest = (project.changeRequests || []).find((item) => item.status === "pending");

  return `
    <article class="growth-project-card">
      <div class="growth-project-snippet__top">
        <strong>${escapeHtml(project.loanProject)}</strong>
        <span>${escapeHtml(project.amount)}</span>
      </div>
      <p>${escapeHtml(project.details)}</p>
      <div class="growth-progress">
        <div class="growth-progress__bar">
          <span style="width:${project.progress}%"></span>
        </div>
        <span class="growth-progress__text">${project.progress}%</span>
      </div>
      <p class="detail-meta">当前状态：${project.status === "completed" ? "已完成" : "进行中"}</p>
      ${
        pendingRequest
          ? `
            <div class="growth-request-pending">
              <strong>该项目已有待审核修改</strong>
              <p>提交时间：${formatDateTime(pendingRequest.submittedAt)}</p>
              <p>请等待后台审核后，再发起新的修改申请。</p>
            </div>
          `
          : `
            <details class="growth-request-form">
              <summary>申请修改这个项目</summary>
              <form data-growth-request-form="${project.id}" class="form-grid">
                <label>
                  修改后项目名称
                  <input name="loanProject" type="text" value="${escapeHtml(project.loanProject)}" />
                </label>
                <label>
                  修改后金额
                  <input name="amount" type="text" value="${escapeHtml(project.amount)}" />
                </label>
                <label>
                  修改后详细信息
                  <textarea name="details" rows="4">${escapeHtml(project.details)}</textarea>
                </label>
                <label>
                  修改后进度百分比
                  <input name="progress" type="number" min="0" max="100" step="1" value="${project.progress}" />
                </label>
                <label>
                  申请备注
                  <textarea name="requestNote" rows="3" placeholder="例如：客户补件完成，需要把进度调整到 70%"></textarea>
                </label>
                <div class="chip-row">
                  <button type="submit" class="primary-btn">提交修改申请</button>
                </div>
              </form>
            </details>
          `
      }
      ${
        (project.changeRequests || []).length
          ? `
            <div class="growth-request-history">
              <h4>申请记录</h4>
              ${(project.changeRequests || [])
                .slice(0, 4)
                .map(
                  (item) => `
                    <div class="growth-request-history__item">
                      <strong>${
                        item.status === "pending" ? "待审核" : item.status === "approved" ? "已通过" : "已拒绝"
                      }</strong>
                      <span>${formatDateTime(item.reviewedAt || item.submittedAt)}</span>
                      <p>${escapeHtml(item.replyMessage || item.requestNote || "已提交修改申请")}</p>
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
}

function renderRecentCustomers(customers) {
  currentGrowthCustomers = Array.isArray(customers) ? customers : [];
  growthRecentList.innerHTML = currentGrowthCustomers.length
    ? currentGrowthCustomers
        .map(
          (customer) => `
            <article class="growth-customer-card">
              <div class="growth-customer-card__head">
                <div class="growth-customer-card__identity">
                  <img class="growth-avatar" src="${escapeHtml(customer.avatarUrl)}" alt="${escapeHtml(customer.customerName)}" />
                  <div>
                    <h3>${escapeHtml(customer.customerName)}</h3>
                    <p class="detail-meta">客户 ID：${escapeHtml(customer.id)}</p>
                  </div>
                </div>
                <div class="growth-card-side">
                  <span class="growth-completed-tag">已完成 ${customer.completedCount} 个项目</span>
                  ${
                    customer.pendingChangeCount
                      ? `<span class="growth-pending-badge">待审核 ${customer.pendingChangeCount}</span>`
                      : ""
                  }
                </div>
              </div>
              <div class="growth-front-section">
                <h4>审核通知</h4>
                ${renderNotifications(customer)}
              </div>
              <div class="growth-front-section">
                <h4>客户项目</h4>
                <div class="content-list">
                  ${(customer.projects || []).map(renderProject).join("")}
                </div>
              </div>
            </article>
          `
        )
        .join("")
    : '<p class="empty">你还没有成长中心项目，提交上方表单后会显示在这里。</p>';
}

function getCurrentUserId() {
  return window.AnalyticsTracker?.getUserId?.() || "";
}

async function loadGrowthState() {
  const userId = getCurrentUserId();
  if (!userId) {
    renderRecentCustomers([]);
    return;
  }

  if (window.AnalyticsTracker?.fetchUserState) {
    const state = await window.AnalyticsTracker.fetchUserState();
    renderRecentCustomers(state?.growthCustomers || []);
    return;
  }

  const response = await fetch(`/api/growth/customers?userId=${encodeURIComponent(userId)}`);
  const result = await response.json();
  renderRecentCustomers(result.customers || []);
}

growthForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  setGrowthMessage("正在提交客户项目...", false);
  growthSubmitBtn.disabled = true;

  const payload = Object.fromEntries(new FormData(growthForm).entries());
  payload.userId = getCurrentUserId();

  try {
    const response = await fetch("/api/growth/customers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      setGrowthMessage(result.message || "提交失败", true);
      return;
    }

    growthForm.reset();
    setGrowthMessage(`提交成功，系统已生成客户 ID：${result.customer?.id || "--"}。`, false);
    await loadGrowthState();
  } catch {
    setGrowthMessage("提交失败，请稍后重试。", true);
  } finally {
    growthSubmitBtn.disabled = false;
  }
});

growthRecentList.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-growth-request-form]");
  if (!form) {
    return;
  }

  event.preventDefault();
  const projectId = form.dataset.growthRequestForm || "";
  const payload = Object.fromEntries(new FormData(form).entries());
  payload.progress = Number(payload.progress || 0);

  setGrowthMessage("正在提交修改申请...", false);

  try {
    const response = await fetch(`/api/growth/projects/${projectId}/change-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const result = await response.json();

    if (!response.ok) {
      setGrowthMessage(result.message || "提交修改申请失败", true);
      return;
    }

    setGrowthMessage("修改申请已提交，等待后台审核。", false);
    await loadGrowthState();
  } catch {
    setGrowthMessage("提交修改申请失败，请稍后重试。", true);
  }
});

if (window.AnalyticsTracker?.subscribeUserState) {
  window.AnalyticsTracker.subscribeUserState((state) => {
    renderRecentCustomers(state?.growthCustomers || []);
  });
}

loadGrowthState().catch(() => {
  setGrowthMessage("加载成长系统数据失败，请检查后端服务。", true);
});
