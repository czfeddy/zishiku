const notesRoot = document.getElementById("notes-app");
const noteKeywordInput = document.getElementById("note-keyword");

let allNotes = [];

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

function getFilteredNotes() {
  const keyword = String(noteKeywordInput.value || "")
    .trim()
    .toLowerCase();

  if (!keyword) {
    return allNotes;
  }

  return allNotes.filter((item) => {
    const title = String(item.title || "").toLowerCase();
    const body = String(item.body || "").toLowerCase();
    const category = String(item.category || "").toLowerCase();
    return title.includes(keyword) || body.includes(keyword) || category.includes(keyword);
  });
}

function renderNotes() {
  const notes = getFilteredNotes();
  notesRoot.innerHTML = notes.length
    ? notes
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
              <div class="detail-body">${escapeHtml(item.body)}</div>
            </article>
          `
        )
        .join("")
    : '<p class="empty">当前没有可用的 Note。</p>';
}

async function loadNotes() {
  const response = await fetch("/api/notes");
  const result = await response.json();
  allNotes = result.notes || [];
  renderNotes();
}

noteKeywordInput.addEventListener("input", renderNotes);

loadNotes().catch(() => {
  notesRoot.innerHTML = '<p class="empty">Note 加载失败，请检查后端服务。</p>';
});
