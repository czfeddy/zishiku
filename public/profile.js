function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getInitials(name) {
  const clean = String(name || "").trim();
  return clean ? clean.slice(0, 2) : "用户";
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

function getCurrentState() {
  return window.AnalyticsTracker?.getUserState?.() || null;
}

function getCurrentSession() {
  return window.AnalyticsTracker?.getAuthSession?.() || {
    authenticated: false,
    userId: "",
    profile: null,
    account: null
  };
}

function buildProfileSummary(profile) {
  const safeProfile = profile && typeof profile === "object" ? profile : null;
  if (!safeProfile) {
    return null;
  }

  const hasContent = [safeProfile.userId, safeProfile.name, safeProfile.phone, safeProfile.wechat, safeProfile.introduction]
    .map((item) => String(item || "").trim())
    .some(Boolean);
  if (!hasContent) {
    return null;
  }

  return {
    userId: String(safeProfile.userId || "").trim(),
    name: String(safeProfile.name || safeProfile.userId || "").trim() || "未命名用户",
    title: String(safeProfile.title || "").trim() || "注册用户",
    introduction: String(safeProfile.introduction || "").trim() || "资料完善后，这里会展示你的个人介绍。",
    phone: String(safeProfile.phone || "").trim(),
    wechat: String(safeProfile.wechat || "").trim(),
    avatarUrl: String(safeProfile.avatarUrl || "").trim(),
    createdAt: String(safeProfile.createdAt || "").trim(),
    updatedAt: String(safeProfile.updatedAt || "").trim()
  };
}

function getCompletionItems(profile) {
  const safeProfile = profile || {};
  return [
    { label: "用户名", done: Boolean(String(safeProfile.userId || "").trim()) },
    { label: "姓名", done: Boolean(String(safeProfile.name || "").trim()) },
    { label: "头像", done: Boolean(String(safeProfile.avatarUrl || "").trim()) },
    { label: "电话", done: Boolean(String(safeProfile.phone || "").trim()) },
    { label: "微信号", done: Boolean(String(safeProfile.wechat || "").trim()) },
    { label: "个人介绍", done: Boolean(String(safeProfile.introduction || "").trim()) }
  ];
}

function renderLoginPanel() {
  return `
    <section class="section-block profile-side-card">
      <p class="eyebrow">账号登录</p>
      <h3>未登录</h3>
      <form id="profile-login-form" class="form-grid">
        <label>
          用户名
          <input name="userId" type="text" maxlength="60" required />
        </label>
        <label>
          密码
          <input name="password" type="password" maxlength="60" required />
        </label>
        <div class="chip-row">
          <button type="submit" class="chip chip--primary">登录</button>
          <button type="button" class="chip" data-open-registration="true">注册 / 完善资料</button>
        </div>
      </form>
      <p id="profile-login-message" class="status-text"></p>
      <details class="profile-forgot-box">
        <summary>忘记密码</summary>
        <form id="profile-forgot-form" class="form-grid" style="margin-top:12px">
          <label>
            用户名
            <input name="userId" type="text" maxlength="60" required />
          </label>
          <label>
            预留手机
            <input name="phone" type="text" maxlength="30" required />
          </label>
          <label>
            验证码
            <input name="code" type="text" maxlength="12" required />
          </label>
          <label>
            新密码
            <input name="newPassword" type="password" maxlength="60" required />
          </label>
          <label>
            确认新密码
            <input name="confirmPassword" type="password" maxlength="60" required />
          </label>
          <div class="chip-row">
            <button type="submit" class="chip">提交重置申请</button>
          </div>
        </form>
        <p id="profile-forgot-message" class="status-text"></p>
      </details>
    </section>
  `;
}

function renderSecurityPanel(session, profile, account) {
  const isLoggedIn = Boolean(session?.authenticated);
  const safeAccount = account || {};
  return `
    <section class="section-block profile-side-card">
      <p class="eyebrow">安全设置</p>
      <h3>${safeAccount?.hasPassword ? "密码已设置" : "尚未设置密码"}</h3>
      <p class="detail-meta">预留手机：${escapeHtml(safeAccount?.recoveryPhoneMasked || profile?.phone || "未填写")}</p>
      <p class="detail-meta">最近登录：${formatDateTime(safeAccount?.lastLoginAt)}</p>
      <p class="detail-meta">密码更新：${formatDateTime(safeAccount?.passwordUpdatedAt)}</p>
      ${
        isLoggedIn
          ? `
            <form id="profile-password-form" class="form-grid" style="margin-top:16px">
              ${
                safeAccount?.hasPassword
                  ? `
                    <label>
                      旧密码
                      <input name="oldPassword" type="password" maxlength="60" required />
                    </label>
                  `
                  : ""
              }
              <label>
                新密码
                <input name="newPassword" type="password" maxlength="60" required />
              </label>
              <label>
                确认新密码
                <input name="confirmPassword" type="password" maxlength="60" required />
              </label>
              <label>
                预留手机
                <input name="recoveryPhone" type="text" maxlength="30" value="${escapeHtml(
                  safeAccount?.recoveryPhone || profile?.phone || ""
                )}" />
              </label>
              <div class="chip-row">
                <button type="submit" class="chip chip--primary">${safeAccount?.hasPassword ? "修改密码" : "设置密码"}</button>
              </div>
            </form>
            <p id="profile-password-message" class="status-text"></p>
          `
          : `
            <p class="detail-meta">登录后可设置或修改密码。</p>
          `
      }
    </section>
  `;
}

function renderProfilePage(state, session) {
  const root = document.getElementById("profile-app");
  const profile = buildProfileSummary(state?.profile || session?.profile || null);
  const account = state?.account || session?.account || null;
  const vip = state?.vip || null;
  const isLoggedIn = Boolean(session?.authenticated);

  if (!profile) {
    root.innerHTML = `
      <section class="detail-card">
        <div class="profile-center-grid">
          ${renderLoginPanel()}
          <section class="section-block profile-side-card">
            <p class="eyebrow">资料状态</p>
            <h3>尚未建立档案</h3>
            <p class="detail-meta">首次进入请先完善资料。注册完成后即可在这里查看名片、密码状态和会员信息。</p>
            <div class="chip-row" style="margin-top:16px">
              <button type="button" class="chip chip--primary" data-open-registration="true">立即完善资料</button>
              <a class="chip" href="/">返回首页</a>
            </div>
          </section>
        </div>
      </section>
    `;
    bindProfileActions(state, session);
    return;
  }

  const completionItems = getCompletionItems(profile);
  const completedCount = completionItems.filter((item) => item.done).length;
  const avatar = profile.avatarUrl
    ? `<img class="detail-contact-card__avatar-img" src="${escapeHtml(profile.avatarUrl)}" alt="${escapeHtml(profile.name)}" />`
    : `<span class="detail-contact-card__avatar-fallback">${escapeHtml(getInitials(profile.name))}</span>`;

  root.innerHTML = `
    <section class="detail-card">
      <div class="profile-center-grid">
        <section class="detail-contact-card profile-center-card">
          <div class="detail-contact-card__avatar">${avatar}</div>
          <div class="detail-contact-card__content">
            <div class="detail-contact-card__headline">
              <h2>${escapeHtml(profile.name)}</h2>
              <span class="detail-contact-card__badge">${escapeHtml(profile.title)}</span>
            </div>
            <p class="detail-contact-card__desc">${escapeHtml(profile.introduction)}</p>
            <div class="detail-contact-card__meta">
              <span>用户名：${escapeHtml(profile.userId || "--")}</span>
              <span>电话：${escapeHtml(profile.phone || "未填写")}</span>
              <span>微信：${escapeHtml(profile.wechat || "未填写")}</span>
            </div>
            <div class="chip-row" style="margin-top:16px">
              <button type="button" class="chip chip--primary" data-open-registration="true">编辑资料</button>
              ${
                isLoggedIn
                  ? `<button type="button" class="chip" data-open-password="true">${account?.hasPassword ? "修改密码" : "设置密码"}</button>`
                  : ""
              }
              ${
                isLoggedIn
                  ? `<button type="button" class="chip" data-logout="true">退出账号</button>`
                  : `<button type="button" class="chip" data-scroll-login="true">去登录</button>`
              }
            </div>
          </div>
        </section>

        <section class="section-block profile-side-card">
          <p class="eyebrow">资料状态</p>
          <h3>已完善 ${completedCount}/${completionItems.length}</h3>
          <div class="profile-status-list">
            ${completionItems
              .map(
                (item) => `
                  <span class="profile-status-pill ${item.done ? "is-done" : "is-pending"}">${escapeHtml(item.label)}${
                    item.done ? " 已完成" : " 待补充"
                  }</span>
                `
              )
              .join("")}
          </div>
        </section>

        ${renderSecurityPanel(session, profile, account)}

        <section class="section-block profile-side-card">
          <p class="eyebrow">会员状态</p>
          <h3>${vip?.isVip ? "VIP 已开通" : "未开通 VIP"}</h3>
          <p class="detail-meta">剩余天数：${vip?.isVip ? escapeHtml(vip.remainingDays) : "0"}</p>
          <p class="detail-meta">累计充值：￥${escapeHtml(Number(vip?.totalRechargeAmount || 0).toFixed(2))}</p>
          <p class="detail-meta">充值次数：${escapeHtml(Number(vip?.totalRechargeCount || 0))}</p>
          <div class="chip-row" style="margin-top:16px">
            <a class="chip chip--primary" href="/recharge.html">去开通会员</a>
          </div>
        </section>

        ${
          !isLoggedIn
            ? renderLoginPanel()
            : `
              <section class="section-block profile-side-card">
                <p class="eyebrow">账户信息</p>
                <h3>已登录</h3>
                <p class="detail-meta">创建时间：${formatDateTime(profile.createdAt)}</p>
                <p class="detail-meta">最近更新：${formatDateTime(profile.updatedAt)}</p>
                <div class="chip-row" style="margin-top:16px">
                  <a class="chip" href="/achievements.html">查看积分</a>
                  <a class="chip" href="/">返回首页</a>
                </div>
              </section>
            `
        }
      </div>
    </section>
  `;

  bindProfileActions(state, session);
}

function setText(id, text, isError = false) {
  const node = document.getElementById(id);
  if (!node) {
    return;
  }
  node.textContent = text;
  node.style.color = isError ? "#b42318" : "#0f766e";
}

function bindProfileActions(state, session) {
  const registrationButtons = document.querySelectorAll("[data-open-registration]");
  registrationButtons.forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        await window.AnalyticsTracker?.ensureUserRegistration?.();
        window.AnalyticsTracker?.showRegistrationModal?.((state && state.profile) || session?.profile || {});
      } catch (error) {
        window.AnalyticsTracker?.showRegistrationModal?.((state && state.profile) || session?.profile || {});
      }
    });
  });

  const loginForm = document.getElementById("profile-login-form");
  if (loginForm) {
    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(loginForm);
      setText("profile-login-message", "正在登录...");
      try {
        await window.AnalyticsTracker?.loginUser?.({
          userId: String(formData.get("userId") || "").trim(),
          password: String(formData.get("password") || "").trim()
        });
        setText("profile-login-message", "登录成功");
        if (window.AnalyticsTracker?.redirectAfterAuthSuccess) {
          window.AnalyticsTracker.redirectAfterAuthSuccess("/profile.html");
          return;
        }
        window.location.reload();
      } catch (error) {
        setText("profile-login-message", error.message || "登录失败", true);
      }
    });
  }

  const passwordForm = document.getElementById("profile-password-form");
  if (passwordForm) {
    passwordForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(passwordForm);
      const payload = {
        recoveryPhone: String(formData.get("recoveryPhone") || "").trim(),
        newPassword: String(formData.get("newPassword") || "").trim(),
        confirmPassword: String(formData.get("confirmPassword") || "").trim()
      };
      setText("profile-password-message", "正在保存密码...");
      try {
        if (passwordForm.querySelector('[name="oldPassword"]')) {
          await window.AnalyticsTracker?.changeUserPassword?.({
            oldPassword: String(formData.get("oldPassword") || "").trim(),
            ...payload
          });
        } else {
          await window.AnalyticsTracker?.setUserPassword?.({
            password: payload.newPassword,
            confirmPassword: payload.confirmPassword,
            recoveryPhone: payload.recoveryPhone
          });
        }
        setText("profile-password-message", "密码已更新");
        window.location.reload();
      } catch (error) {
        setText("profile-password-message", error.message || "密码保存失败", true);
      }
    });
  }

  const forgotForm = document.getElementById("profile-forgot-form");
  if (forgotForm) {
    forgotForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const formData = new FormData(forgotForm);
      setText("profile-forgot-message", "正在提交重置请求...");
      try {
        await window.AnalyticsTracker?.requestPasswordReset?.({
          userId: String(formData.get("userId") || "").trim(),
          phone: String(formData.get("phone") || "").trim(),
          code: String(formData.get("code") || "").trim(),
          newPassword: String(formData.get("newPassword") || "").trim(),
          confirmPassword: String(formData.get("confirmPassword") || "").trim()
        });
        setText("profile-forgot-message", "密码重置请求已提交");
      } catch (error) {
        setText("profile-forgot-message", error.message || "忘记密码暂不可用", true);
      }
    });
  }

  const logoutButton = document.querySelector("[data-logout]");
  if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
      try {
        await window.AnalyticsTracker?.logoutUser?.();
        window.location.reload();
      } catch (error) {
        window.alert(error.message || "退出失败");
      }
    });
  }

  const scrollLoginButton = document.querySelector("[data-scroll-login]");
  if (scrollLoginButton) {
    scrollLoginButton.addEventListener("click", () => {
      document.getElementById("profile-login-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  const passwordShortcutButton = document.querySelector("[data-open-password]");
  if (passwordShortcutButton) {
    passwordShortcutButton.addEventListener("click", () => {
      document.getElementById("profile-password-form")?.scrollIntoView({ behavior: "smooth", block: "start" });
      passwordShortcutButton.blur?.();
    });
  }
}

async function loadProfilePage() {
  const root = document.getElementById("profile-app");
  root.innerHTML = `
    <section class="detail-card">
      <h2>正在加载个人中心</h2>
      <p class="detail-meta">请稍候，正在读取当前用户资料与登录状态。</p>
    </section>
  `;

  const session = await window.AnalyticsTracker?.fetchUserSession?.().catch(() => getCurrentSession());
  let state = getCurrentState();
  const targetUserId = session?.userId || state?.userId || "";
  if (targetUserId && window.AnalyticsTracker?.fetchUserState) {
    try {
      state = await window.AnalyticsTracker.fetchUserState();
    } catch (error) {}
  }

  renderProfilePage(state || {}, session || getCurrentSession());

  const authMode = new URLSearchParams(window.location.search).get("auth");
  if (!session?.authenticated) {
    if (authMode === "register") {
      const draftProfile = (state && state.profile) || session?.profile || {};
      window.setTimeout(() => {
        window.AnalyticsTracker?.showRegistrationModal?.(draftProfile);
      }, 0);
    } else if (authMode === "login") {
      window.setTimeout(() => {
        document.querySelector('#profile-login-form [name="userId"]')?.focus();
      }, 0);
    }
  }

  if (window.AnalyticsTracker?.subscribeUserState) {
    window.AnalyticsTracker.subscribeUserState((nextState) => {
      renderProfilePage(nextState || {}, getCurrentSession());
    });
  }
}

loadProfilePage().catch(() => {
  document.getElementById("profile-app").innerHTML = `
    <section class="detail-card">
      <h2>个人中心加载失败</h2>
      <p class="detail-meta">请刷新页面后重试。</p>
      <a class="chip" href="/">返回首页</a>
    </section>
  `;
});
