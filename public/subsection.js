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
    <nav class="breadcrumb" aria-label="闂傚倸鍊搁崐鎼佹偋閸曨垰鍨傞柛锔诲幐閸嬫捇宕归顐ゅ姺婵炲濯寸粻鎾荤嵁鐎ｎ亖鏀介柟閭﹀墯椤旀捇姊?>
      <a class="breadcrumb__link" href="${escapeHtml(pageLink)}" data-breadcrumb-link="${escapeHtml(pageLink)}">${escapeHtml(
        meta?.pageLabel || "Home"
      )}</a>
      <span class="breadcrumb__sep">/</span>
      <a class="breadcrumb__link" href="${escapeHtml(groupLink)}" data-breadcrumb-link="${escapeHtml(groupLink)}">${escapeHtml(
        meta?.groupLabel || "Section"
      )}</a>
      <span class="breadcrumb__sep">/</span>
      <a class="breadcrumb__link" href="${escapeHtml(subsectionLink)}" data-breadcrumb-link="${escapeHtml(
        subsectionLink
      )}">${escapeHtml(meta?.subLabel || "Subsection")}</a>
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
    return item.miniProgramLaunchUrl || item.externalUrl ? "Open mini program" : "View open method";
  }
  if (isWebToolItem(item)) {
    return item.externalUrl ? "Open now" : "View details";
  }
  return "View details";
}

function getActionHint(item) {
  if (isMiniProgramItem(item)) {
    return item.miniProgramLaunchUrl || item.externalUrl
      ? "Supports direct mini program launch"
      : "Copy the name or path and open it manually";
  }
  if (isWebToolItem(item)) {
    return item.externalUrl ? "Open the web tool" : "View tool details";
  }
  return "Open the article detail page";
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
          <p class="eyebrow">闂佽娴烽弫濠氬磻婵犲洤绐楅柡鍥╁枔閳瑰秴鈹戦悩鎻掝仹闁绘帒锕悡顐﹀炊閵婏妇锛曢梺鍝勮閸婃繈鐛?/p>
          <h3 id="tool-dialog-title">闂傚倷鑳堕幊鎾绘倶濮樿泛绠伴柛婵勫劜椤洟鏌熸潏鍓х暠婵☆偅锕㈤弻锝夋偄缁嬫妫嗙紒缁㈠幐閸?/h3>
        </div>
        <button type="button" class="secondary-btn" data-close-tool-dialog="true">闂傚倷鑳堕…鍫㈡崲閹寸偟绠惧┑鐘蹭迹?/button>
      </div>
      <p id="tool-dialog-description" class="tool-dialog__description"></p>
      <div id="tool-dialog-meta" class="tool-dialog__meta"></div>
      <div class="chip-row tool-dialog__actions">
        <button type="button" class="primary-btn" data-copy-tool-name="true">婵犵數濮伴崹鐓庘枖濞戞氨鐭撻柟缁㈠枛閺勩儲淇婇妶鍛櫣閻熸瑱濡囬埀顒€绠嶉崕鍗炩枖?/button>
        <button type="button" class="secondary-btn" data-copy-tool-path="true">婵犵數濮伴崹鐓庘枖濞戞氨鐭撻柟缁㈠枛閺勩儲淇婇妶鍛殲鐎规洖顦伴妵鍕冀閵婏妇娈ょ紓?/button>
        <button type="button" class="secondary-btn" data-open-wechat="true">闂傚倷鑳堕幊鎾绘倶濮樿泛绠伴柛婵勫劜椤洟鏌熺€涙绠ラ柛銈嗩殕閵囧嫰寮崶璺烘暯缂?/button>
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
    if (window.ShareHelper?.showToast) {
      window.ShareHelper.showToast(successMessage);
    } else {
      window.alert(successMessage);
    }
  } catch (error) {
    window.alert(`Copy failed. Please copy manually: ${value}`);
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
    metaRows.push(`<p><strong>AppID:</strong> ${escapeHtml(item.miniProgramAppId)}</p>`);
  }
  if (item.miniProgramPath) {
    metaRows.push(`<p><strong>Path:</strong> ${escapeHtml(item.miniProgramPath)}</p>`);
  }
  if (item.externalUrl) {
    metaRows.push(
      `<p><strong>Backup:</strong> <a href="${escapeHtml(item.externalUrl)}" target="_blank" rel="noreferrer">Open link</a></p>`
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
        <h1>闂傚倷绀侀幖顐λ囬鐐村€舵繝闈涙－閻掍粙鏌ㄩ悢鍝勑㈤柣顓燁殜閺屾稓浠﹂崜褉濮囧┑鐐茬墣濞夋盯鍩ユ径鎰鐎规洖娉﹂姀銈嗙厽闁挎繂楠告晶瀵糕偓?/h1>
        <p class="detail-meta">闂備浇宕垫慨鏉懨洪埡浣碘偓鎺楀捶椤撶偛鐏婇梺缁橆焽椤掕尙妲愰弮鍫熺厸鐎广儱楠搁獮鎴︽煃瑜滈崜娆撍囬悽绋胯摕閻忕偟鐡旈崥瀣煕閳╁喚鐒介柛妯诲姍閺屸剝寰勯崱妯荤彆缂備礁顑嗛崹鍨暦閿濆骞㈡繛鍡楄嫰娴滈箖鏌ｉ姀鐘典粵闁搞倐鍋撶紓鍌欓檷閸斿秹鎮￠垾鎰佸殨闁割偅娲栭崹鍌涖亜閺冨洦顥夊ù鐘虫尦濮?/p>
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
        <h1>闂傚倷绀侀幖顐λ囬鐐村€舵繝闈涙－閻掍粙鏌嶉埡浣告殶闁崇粯姊婚埀顒€绠嶉崕閬嶅箠閹版澘绠洪柣妯肩帛閻?/h1>
        <p class="detail-meta">闂備浇宕垫慨鏉懨洪銏犵哗闂侇剙鍗曟径鎰窛闁哄鍨奸幗鏇㈡⒑闂堟侗妲堕柛搴″船椤曪綁骞庨懞銉у幈濠电偛妫欓悷褏绮旈鈧弻鐔兼寠婢跺牆浠Δ鐘靛仦鐢剝淇婇悜鑺ユ櫆闁告瑯鍋撶粻鎾诲蓟濞戞﹩娼╁Δ锝呭暞椤庡秴顪冮妶鍡楃瑲缂侇喖楠搁埥澶愭偨閸撳弶鏅╅柣鐐寸▓閳ь剙鍘栨竟?/p>
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
      <h1>闂傚倷绀侀幉鈥愁潖缂佹ɑ鍙忛柟顖ｇ亹瑜版帒鐐婇柕濞垮劤缁愮偤鏌℃径濠勫⒈闁稿顦抽·?/h1>
      <p class="detail-meta">闂傚倷绀侀幖顐λ囬鐐村€舵繝闈涙－閻掍粙鏌ㄩ悢鍝勑㈢紒鈧崘顔界厱婵炴垵宕楣冩煕閻旈攱鍠橀柡灞剧洴瀵噣宕掑В娆惧墯缁绘盯寮堕幋鐐差槱閻庡灚婢樼€氼厼顭囪箛娑辨晝闁靛鍔栧ú鐔煎蓟閵娿儮妲堟俊顖濆亹閸旑喖顪冮妶鍡樺闁告挻绋撻崚鎺戔枎韫囷絽鎮戦梺鍛婁緱閸犳牠鍩€椤掑倹鏆柡灞剧洴楠炲洭顢楅崒鍌樺劦閺岋綁鏁傜拠鑼桓婵?/p>
    </section>
  `;
});
