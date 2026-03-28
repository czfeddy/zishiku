(function () {
  const summaryContainer = document.getElementById("backend-summary");
  const resultsContainer = document.getElementById("backend-results");
  const refreshButton = document.getElementById("backend-refresh");

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  async function fetchJson(url) {
    const startedAt = Date.now();
    const response = await fetch(url);
    const text = await response.text();
    let body = null;

    try {
      body = text ? JSON.parse(text) : null;
    } catch (error) {
      body = { raw: text };
    }

    return {
      url,
      ok: response.ok,
      status: response.status,
      duration: Date.now() - startedAt,
      body
    };
  }

  function renderResult(item) {
    return `
      <article class="test-result">
        <strong>${escapeHtml(item.url)}</strong>
        <div class="test-badge-row">
          <span class="test-badge ${item.ok ? "is-ok" : "is-warn"}">${item.status}</span>
          <span class="test-badge">${item.duration} ms</span>
        </div>
        <pre>${escapeHtml(JSON.stringify(item.body, null, 2))}</pre>
      </article>
    `;
  }

  async function runChecks() {
    summaryContainer.innerHTML = `
      <div>
        <strong>当前来源</strong>
        <span>${escapeHtml(window.location.origin)}</span>
      </div>
      <div>
        <strong>检测状态</strong>
        <span>正在请求接口...</span>
      </div>
    `;
    resultsContainer.innerHTML = "";

    const urls = ["/api/health", "/api/config", "/api/content", "/api/notes", "/api/users/vip"];
    const results = await Promise.all(
      urls.map(async (url) => {
        try {
          return await fetchJson(url);
        } catch (error) {
          return {
            url,
            ok: false,
            status: "FETCH_ERROR",
            duration: 0,
            body: { message: error.message }
          };
        }
      })
    );

    const health = results.find((item) => item.url === "/api/health")?.body || {};
    summaryContainer.innerHTML = `
      <div>
        <strong>当前来源</strong>
        <span>${escapeHtml(window.location.origin)}</span>
      </div>
      <div>
        <strong>服务实例</strong>
        <span>${escapeHtml(health.runtime || "未知")} @ ${escapeHtml(String(health.host || ""))}:${escapeHtml(String(health.port || ""))}</span>
      </div>
      <div>
        <strong>服务时间</strong>
        <span>${escapeHtml(health.now || "未返回")}</span>
      </div>
      <div>
        <strong>数据统计</strong>
        <span>内容 ${escapeHtml(String(health?.data?.contentCount ?? "--"))} / Note ${escapeHtml(String(health?.data?.noteCount ?? "--"))} / VIP ${escapeHtml(String(health?.data?.vipUserCount ?? "--"))}</span>
      </div>
    `;

    resultsContainer.innerHTML = results.map(renderResult).join("");
  }

  refreshButton.addEventListener("click", runChecks);
  runChecks();
})();
