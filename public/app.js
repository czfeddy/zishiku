function isToolGroup(group) {
  return group?.key === "tools-links";
}

function isMiniProgramItem(item) {
  return item?.contentType === "mini-program";
}

function isWebToolItem(item) {
  return item?.contentType === "web";
}

function getToolActionText(item) {
  if (isMiniProgramItem(item)) {
    return item.miniProgramLaunchUrl || item.externalUrl ? "Open mini app" : "How to open";
  }
  return "Open now";
}

function getToolHint(item) {
  if (isMiniProgramItem(item)) {
    return item.miniProgramLaunchUrl || item.externalUrl
      ? "Try opening directly in WeChat on mobile"
      : "Open with WeChat search or copy path";
  }
  if (isWebToolItem(item)) {
    return "Tap to open the web page";
  }
  return "View full content";
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
          <p class="eyebrow">Mini Program</p>
          <h3 id="tool-dialog-title">Open options</h3>
        </div>
        <button type="button" class="secondary-btn" data-close-tool-dialog="true">Close</button>
      </div>
      <p id="tool-dialog-description" class="tool-dialog__description"></p>
      <div id="tool-dialog-meta" class="tool-dialog__meta"></div>
      <div class="chip-row tool-dialog__actions">
        <button type="button" class="primary-btn" data-copy-tool-name="true">Copy name</button>
        <button type="button" class="secondary-btn" data-copy-tool-path="true">Copy path</button>
        <button type="button" class="secondary-btn" data-open-wechat="true">Open WeChat</button>
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
    window.alert("Nothing to copy.");
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
    window.alert(successMessage);
  } catch {
    window.alert(`Copy failed: ${value}`);
  }
}

function showMiniProgramFallback(item) {
  const dialog = ensureToolDialog();
  dialog.dataset.name = item.miniProgramName || item.title || "";
  dialog.dataset.path = item.miniProgramPath || "";

  dialog.querySelector("#tool-dialog-title").textContent = item.miniProgramName || item.title || "Mini Program";
  dialog.querySelector("#tool-dialog-description").textContent =
    item.miniProgramNote || "This environment cannot open the mini program directly. Copy the name or path and open it in WeChat.";

  const metaRows = [];
  if (item.miniProgramAppId) {
    metaRows.push(`<p><strong>AppID:</strong> ${item.miniProgramAppId}</p>`);
  }
  if (item.miniProgramPath) {
    metaRows.push(`<p><strong>Path:</strong> ${item.miniProgramPath}</p>`);
  }
  if (item.externalUrl) {
    metaRows.push(`<p><strong>Backup:</strong> <a href="${item.externalUrl}" target="_blank" rel="noreferrer">Open link</a></p>`);
  }
  dialog.querySelector("#tool-dialog-meta").innerHTML = metaRows.join("");

  dialog.showModal();
}

function openToolItem(item, button) {
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

  if (button?.href) {
    window.location.href = button.href;
  }
}

function getSubsectionLink(page, groupKey, subKey) {
  return `/section/${encodeURIComponent(page)}/${encodeURIComponent(groupKey)}/${encodeURIComponent(subKey)}`;
}

function getGroupLink(page, groupKey) {
  return `/section/${encodeURIComponent(page)}/${encodeURIComponent(groupKey)}`;
}

function scrollToHashTarget() {
  const rawHash = String(window.location.hash || "").trim();
  if (!rawHash) {
    return;
  }

  const target = document.getElementById(decodeURIComponent(rawHash.slice(1)));
  if (!target) {
    return;
  }

  window.requestAnimationFrame(() => {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

async function loadPage() {
  const page = document.body.dataset.page;
  const app = document.getElementById("app");

  const [configRes, contentRes] = await Promise.all([
    fetch("/api/config"),
    fetch(`/api/content?page=${encodeURIComponent(page)}`)
  ]);

  const [{ sections }, { contents }] = await Promise.all([configRes.json(), contentRes.json()]);
  const pageConfig = sections[page];

  if (!pageConfig) {
    app.innerHTML = '<p class="empty">Page config missing.</p>';
    return;
  }

  const visibleGroups = (pageConfig.groups || []).filter((group) => !group.adminOnly);

  app.innerHTML = visibleGroups
    .map((group) => {
      const subsectionHtml = (group.children || [])
        .map((sub) => {
          const count = contents.filter((item) => item.groupKey === group.key && item.subKey === sub.key).length;
          return `
            <section class="subsection-card">
              <a
                class="subsection-entry subsection-entry--plain subsection-entry--link ${page === "home" ? "subsection-entry--home" : ""}"
                href="${getSubsectionLink(page, group.key, sub.key)}"
                data-track-subsection="list"
                data-page="${page}"
                data-group-key="${group.key}"
                data-sub-key="${sub.key}"
              >
                <span class="subsection-entry__icon" aria-hidden="true">${getSubsectionIcon(sub)}</span>
                <span class="subsection-entry__label">${sub.label}</span>
                <span class="subsection-entry__count">${count} items</span>
                <span class="subsection-entry__hint">Open article list</span>
              </a>
            </section>
          `;
        })
        .join("");

      return `
        <section class="section-block" id="group-${group.key}">
          <div class="subsection-page__head">
            <h2>${group.label}</h2>
            <a class="chip" href="${getGroupLink(page, group.key)}">进入板块</a>
          </div>
          <div class="subsection-grid">
            ${subsectionHtml}
          </div>
        </section>
      `;
    })
    .join("");

  scrollToHashTarget();
}

function getSubsectionIcon(sub) {
  const iconMap = {
    "bank-house-mortgage": `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 29 32 15l18 14" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M20 27v22h24V27" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M27 49V36h10v13" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
      </svg>
    `,
    "bank-credit-loan": `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="13" y="18" width="38" height="26" rx="6" stroke="currentColor" stroke-width="3.5"/>
        <path d="M21 31h22M21 25h10M21 37h8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
        <circle cx="45" cy="23" r="6" stroke="currentColor" stroke-width="3.5"/>
      </svg>
    `,
    "private-house-mortgage": `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 28 32 16l16 12v20a4 4 0 0 1-4 4H20a4 4 0 0 1-4-4V28Z" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
        <path d="M25 33h14M25 40h14" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `,
    "redeem-bridge-funding": `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 41h44" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M15 41c5-10 10-15 17-15s12 5 17 15" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M46 20h8M50 16v8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `,
    "car-loan": `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 38V31l6-9h24l6 9v7" stroke="currentColor" stroke-width="3.5" stroke-linejoin="round"/>
        <circle cx="22" cy="41" r="4" stroke="currentColor" stroke-width="3.5"/>
        <circle cx="42" cy="41" r="4" stroke="currentColor" stroke-width="3.5"/>
        <path d="M18 38h28" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `,
    monthly: `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="12" y="14" width="40" height="36" rx="8" stroke="currentColor" stroke-width="3.5"/>
        <path d="M20 12v10M44 12v10M12 27h40" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M24 36h16" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `,
    quarterly: `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="10" y="15" width="44" height="34" rx="10" stroke="currentColor" stroke-width="3.5"/>
        <path d="M20 25h24M20 34h10M36 34h8" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M20 49v4M32 49v4M44 49v4" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `,
    growth: `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 45 28 33l8 8 14-18" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M45 23h9v9" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    `,
    sales: `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M16 48V32M30 48V23M44 48V15" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M12 48h40" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `,
    "featured-tools": `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="12" y="16" width="40" height="28" rx="8" stroke="currentColor" stroke-width="3.5"/>
        <path d="M22 50h20M27 44v6M37 44v6" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M22 26h20M22 33h12" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `
  };

  return (
    iconMap[sub?.key] ||
    `
      <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="15" y="15" width="34" height="34" rx="8" stroke="currentColor" stroke-width="3.5"/>
        <path d="M24 32h16M32 24v16" stroke="currentColor" stroke-width="3.5" stroke-linecap="round"/>
      </svg>
    `
  );
}

document.addEventListener("click", (event) => {
  const toolButton = event.target.closest("[data-open-tool]");
  if (toolButton) {
    openToolItem(
      {
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
      },
      toolButton
    );

    if (window.AnalyticsTracker) {
      window.AnalyticsTracker.trackSectionView({
        page: toolButton.dataset.page,
        groupKey: toolButton.dataset.groupKey,
        subKey: toolButton.dataset.subKey,
        action: "click",
        contentId: toolButton.dataset.contentId,
        contentSlug: toolButton.dataset.contentSlug,
        contentTitle: toolButton.dataset.contentTitle,
        source: "tool-link"
      }).catch(() => {});
    }
    return;
  }

  const link = event.target.closest("[data-track-subsection]");
  if (!link || !window.AnalyticsTracker) {
    const dialog = event.target.closest("#tool-open-dialog");
    if (!dialog) {
      return;
    }

    if (event.target.closest("[data-copy-tool-name]")) {
      copyText(dialog.dataset.name, "Name copied.");
    } else if (event.target.closest("[data-copy-tool-path]")) {
      copyText(dialog.dataset.path, "Path copied.");
    } else if (event.target.closest("[data-open-wechat]")) {
      window.location.href = "weixin://";
    }
    return;
  }

  window.AnalyticsTracker.trackSectionView({
    page: link.dataset.page,
    groupKey: link.dataset.groupKey,
    subKey: link.dataset.subKey,
    action: "click",
    contentTitle: link.dataset.contentTitle,
    source: link.dataset.trackSubsection || "subsection-link"
  }).catch(() => {});
});

loadPage().catch(() => {
  document.getElementById("app").innerHTML = '<p class="empty">Page load failed.</p>';
});
