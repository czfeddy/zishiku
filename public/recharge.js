const app = document.getElementById("app");
const statusColors = {
  info: "#7c2d12",
  success: "#027a48",
  error: "#b42318"
};

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

function getUserId() {
  return window.AnalyticsTracker?.getUserId?.() || "guest-user";
}

function getMessageElement() {
  return document.getElementById("recharge-message");
}

function setMessage(text, type = "info") {
  const message = getMessageElement();
  if (!message) {
    return;
  }

  message.textContent = text;
  message.style.color = statusColors[type] || statusColors.info;
}

function buildWechatReturnUrl(orderId) {
  const target = new URL(window.location.href);
  target.searchParams.set("orderId", orderId);
  target.searchParams.set("payResult", "return");
  target.searchParams.delete("autopay");
  target.searchParams.delete("planKey");
  target.searchParams.delete("paymentMethod");
  target.searchParams.delete("wechatAuth");
  return target.toString();
}

function buildWechatPayUrl(h5Url, returnUrl) {
  const separator = h5Url.includes("?") ? "&" : "?";
  return `${h5Url}${separator}redirect_url=${encodeURIComponent(returnUrl)}`;
}

async function checkOrderStatus(orderId, options = {}) {
  const response = await fetch(`/api/recharge/orders/${encodeURIComponent(orderId)}/status`);
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || "查询订单状态失败");
  }

  if (!options.silent) {
    if (result.order?.paymentStatus === "paid") {
      setMessage(`支付成功，${result.order.planLabel || "VIP"} 已到账。`, "success");
    } else if (result.order?.paymentStatus === "closed") {
      setMessage(result.order.gatewayMessage || "订单已关闭", "error");
    } else {
      setMessage(result.order?.gatewayMessage || "订单等待支付中，可完成支付后返回本页刷新。", "info");
    }
  }

  return result;
}

function renderPage(plans, user) {
  const cards = plans
    .map(
      (plan) => `
        <article class="plan-card">
          <p class="plan-card__tag">${escapeHtml(plan.label)}</p>
          <h2>${escapeHtml(plan.label)}</h2>
          <p class="plan-card__price">
            <strong>￥${plan.price}</strong>
            <span>${plan.key === "monthly" ? "每月" : "每季"}</span>
          </p>
          <p class="plan-card__desc">${escapeHtml(plan.description || "")}</p>
          <div class="plan-card__meta">
            <span>支付完成后自动开通 VIP</span>
            <span>本次开通增加 ${plan.durationDays} 天 VIP</span>
          </div>
          <div class="plan-card__actions">
            <button class="primary-btn" type="button" data-create-order="wechat" data-plan-key="${plan.key}">
              微信支付
            </button>
            <button class="secondary-btn" type="button" data-create-order="alipay" data-plan-key="${plan.key}">
              支付宝支付（待接入）
            </button>
          </div>
        </article>
      `
    )
    .join("");

  app.innerHTML = `
    <section class="section-block recharge-shell">
      <div class="vip-banner">
        <div>
          <p class="eyebrow">当前用户</p>
          <h2>${escapeHtml(user.userId)}</h2>
          <p class="hero-copy">
            当前身份：${user.isVip ? "VIP 用户" : "普通用户"}；剩余 VIP 时间：
            ${user.isVip ? `${user.remainingDays} 天` : "尚未开通或已过期"}；累计充值：￥${Number(user.totalRechargeAmount || 0)}
          </p>
        </div>
        <div class="vip-banner__stats">
          <div class="stat-card">
            <span class="stat-label">VIP 到期时间</span>
            <strong class="stat-value stat-value--small">${formatDateTime(user.vipExpiresAt)}</strong>
          </div>
          <div class="stat-card">
            <span class="stat-label">累计充值笔数</span>
            <strong class="stat-value">${Number(user.totalRechargeCount || 0)}</strong>
          </div>
        </div>
      </div>
    </section>

    <section class="section-block">
      <div class="recharge-grid">
        ${cards}
      </div>
      <p id="recharge-message" class="status-text"></p>
    </section>

    <section class="section-block recharge-notes">
      <h2>支付接入说明</h2>
      <p>微信支付已经接入到当前 H5 页面，点击后会创建真实订单并跳转到微信支付中间页。</p>
      <p>支付完成回跳本页后，会自动查询订单状态并发放对应 VIP 时长。</p>
      <p>当前支付链路保持为纯 H5 微信支付，与公众号授权和小程序能力无关。</p>
    </section>
  `;
}

async function loadRechargeData() {
  const userId = getUserId();
  const [planRes, stateRes] = await Promise.all([
    fetch("/api/recharge/plans"),
    fetch(`/api/users/state/${encodeURIComponent(userId)}`)
  ]);

  const [planResult, stateResult] = await Promise.all([planRes.json(), stateRes.json()]);
  return {
    plans: planResult.plans || [],
    user: stateResult.vip || { userId }
  };
}

async function refreshPageAndStatus(orderId) {
  let statusResult = null;
  if (orderId) {
    statusResult = await checkOrderStatus(orderId, { silent: true });
  }

  const { plans, user } = await loadRechargeData();
  renderPage(plans, user);

  if (statusResult?.order?.paymentStatus === "paid") {
    setMessage(`支付成功，${statusResult.order.planLabel || "VIP"} 已到账。`, "success");
    return;
  }

  if (statusResult?.order?.paymentStatus === "closed") {
    setMessage(statusResult.order.gatewayMessage || "订单已关闭", "error");
    return;
  }

  if (statusResult?.order) {
    setMessage(statusResult.order.gatewayMessage || "订单等待支付中，可完成支付后返回本页刷新。", "info");
  }
}

async function createOrder(planKey, paymentMethod) {
  if (paymentMethod === "alipay") {
    setMessage("支付宝支付入口已预留，后续可以直接接入真实支付宝网关。", "info");
    return;
  }

  try {
    setMessage(`正在创建${paymentMethod === "wechat" ? "微信" : "支付宝"}支付订单...`, "info");

    const response = await fetch("/api/recharge/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        userId: getUserId(),
        planKey,
        paymentMethod,
        paymentChannel: "h5",
        returnUrl: window.location.href
      })
    });

    const result = await response.json();
    if (!response.ok) {
      setMessage(result.message || "创建订单失败", "error");
      return;
    }

    if (paymentMethod === "wechat" && result.payment?.h5Url && result.order?.id) {
      setMessage("订单已创建，正在跳转微信支付...", "info");
      window.location.href = buildWechatPayUrl(result.payment.h5Url, buildWechatReturnUrl(result.order.id));
      return;
    }

    setMessage(result.nextStep || "订单已创建。", "info");
  } catch (error) {
    setMessage(error.message || "创建订单失败，请稍后重试。", "error");
  }
}

document.addEventListener("click", (event) => {
  const button = event.target.closest("[data-create-order]");
  if (!button) {
    return;
  }

  createOrder(button.dataset.planKey || "", button.dataset.createOrder || "");
});

if (window.AnalyticsTracker?.subscribeUserState) {
  window.AnalyticsTracker.subscribeUserState((state) => {
    const currentVip = state?.vip;
    if (!currentVip || !app.querySelector(".vip-banner")) {
      return;
    }

    loadRechargeData()
      .then(({ plans, user }) => {
        renderPage(plans, user);
      })
      .catch(() => {});
  });
}

loadRechargeData()
  .then(async ({ plans, user }) => {
    renderPage(plans, user);

    const orderId = new URLSearchParams(window.location.search).get("orderId");
    if (orderId) {
      try {
        await refreshPageAndStatus(orderId);
      } catch (error) {
        setMessage(error.message || "订单状态查询失败，请稍后刷新。", "error");
      }
    }
  })
  .catch(() => {
    app.innerHTML = '<p class="empty">充值中心加载失败，请检查后端服务。</p>';
  });
