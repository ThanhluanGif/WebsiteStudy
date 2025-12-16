(function () {
  function safeParseUser(raw) {
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (err) {
      console.error("Cannot parse user from localStorage:", err);
      localStorage.removeItem("user");
      return null;
    }
  }

  function getAuth() {
    const token = localStorage.getItem("token");
    const user = safeParseUser(localStorage.getItem("user"));
    if (!token || !user) return null;
    return { token, user };
  }

  function saveAuth(token, user) {
    if (token) localStorage.setItem("token", token);
    if (user) localStorage.setItem("user", JSON.stringify(user));
  }

  function clearAuth() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  function renderAuthArea(options = {}) {
    const { containerId = "auth-area", showRoleBadge = true, logoutRedirect = window.location.href } =
      options;
    const authArea = document.getElementById(containerId);
    if (!authArea) return;

    const auth = getAuth();
    if (!auth) {
      authArea.innerHTML = `
        <a href="login.html" class="btn btn-ghost">Đăng nhập</a>
        <a href="register.html" class="btn btn-primary">Đăng ký</a>
      `;
      return;
    }

    const { user } = auth;
    const displayName = user.name || user.email || "Nguoi dung";
    const roleBadge =
      showRoleBadge && user.role === "admin" ? '<span class="pill pill-muted">Admin</span>' : "";

    authArea.innerHTML = `
      <span class="user-name">
        Xin chào, <strong>${displayName}</strong> ${roleBadge}
      </span>
      <button class="btn btn-outline btn-sm" id="global-logout">Đăng xuất</button>
    `;

    const logoutBtn = document.getElementById("global-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", () => {
        clearAuth();
        window.location.href = logoutRedirect;
      });
    }
  }

  function toggleAdminLink(opts = {}) {
    const { linkId = "admin-link" } = opts;
    const link = document.getElementById(linkId);
    if (!link) return;
    const auth = getAuth();
    link.style.display = auth?.user?.role === "admin" ? "inline-flex" : "none";
  }

  function requireAuth(opts = {}) {
    const { redirect = "login.html", message } = opts;
    const auth = getAuth();
    if (!auth) {
      if (message) alert(message);
      window.location.href = redirect;
      return null;
    }
    return auth;
  }

  function requireAdmin(opts = {}) {
    const { redirect = "index.html", loginRedirect = "login.html" } = opts;
    const auth = getAuth();
    if (!auth) {
      window.location.href = loginRedirect;
      return null;
    }
    if (auth.user?.role !== "admin") {
      alert("Trang này chỉ dành cho tài khoản Admin.");
      window.location.href = redirect;
      return null;
    }
    return auth;
  }

  function guardLinks(selector, opts = {}) {
    const { redirect = "login.html", message = "Vui lòng đăng nhập để xem nội dung này." } = opts;
    document.querySelectorAll(selector).forEach((link) => {
      link.addEventListener("click", (e) => {
        const auth = getAuth();
        if (!auth) {
          e.preventDefault();
          alert(message);
          window.location.href = redirect;
        }
      });
    });
  }

  async function fetchVideos({ page = 1, limit = 12, subject = "" } = {}) {
    const params = new URLSearchParams();
    params.set("page", String(page));
    params.set("limit", String(limit));
    if (subject) params.set("subject", subject);

    const res = await fetch("/api/videos?" + params.toString());
    if (!res.ok) {
      const err = await res.text();
      throw new Error(err || "Failed to load videos");
    }
    return res.json();
  }

  function videoCardHtml(v = {}) {
    const thumb = v.thumbnailUrl || "";
    const bg = thumb
      ? `style="background-image:url('${thumb}');background-size:cover;background-position:center;"`
      : "";
    const rating =
      typeof v.avgRating === "number" && v.totalRatings > 0
        ? `${v.avgRating.toFixed(1)} (${v.totalRatings} đánh giá)`
        : "Chưa có đánh giá";
    const subject = v.subject || "Chưa phân loại";
    const duration = v.durationMinutes ? `${v.durationMinutes} phút` : "N/A";

    const link = `video.html?id=${v._id || ""}`;

    return `
      <article class="video-card">
        <div class="video-thumb" ${bg}></div>
        <div class="video-body">
          <h3 class="video-title">${v.title || "Video"}</h3>
          <p class="video-meta">Môn: ${subject} • ${duration}</p>
          <p class="video-rating">Đánh giá: ${rating}</p>
          <p class="video-desc">${v.description || ""}</p>
          <a href="${link}" class="btn btn-sm btn-primary video-detail-link">Xem chi tiết</a>
        </div>
      </article>
    `;
  }

  function renderVideoList({ containerId, videos = [], guardDetail = true }) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    if (!videos.length) {
      grid.innerHTML = `<div class="video-card">Chưa có video nào.</div>`;
      return;
    }
    grid.innerHTML = videos.map(videoCardHtml).join("");
    if (guardDetail) {
      guardLinks(".video-detail-link", { message: "Vui long dang nhap de xem chi tiet video." });
    }
  }

  async function loadVideosIntoGrid({ containerId, limit = 12, subject = "" } = {}) {
    const grid = document.getElementById(containerId);
    if (!grid) return;
    grid.innerHTML = `<div class="video-card">Đang tải danh sách video...</div>`;

    try {
      const data = await fetchVideos({ page: 1, limit, subject });
      const list = data?.videos || [];
      renderVideoList({ containerId, videos: list, guardDetail: true });
    } catch (err) {
      console.error("Load videos error:", err);
      grid.innerHTML = `<div class="video-card">Lỗi khi tải video.</div>`;
    }
  }

  function populateSubjects(selectId, videos = []) {
    const el = document.getElementById(selectId);
    if (!el) return;
    const subjects = Array.from(
      new Set(
        videos
          .map((v) => v.subject || "")
          .filter(Boolean)
          .map((s) => s.trim())
      )
    ).sort();
    el.innerHTML =
      `<option value="">Tat ca mon</option>` +
      subjects.map((s) => `<option value="${s}">${s}</option>`).join("");
  }

  window.studyApp = {
    getAuth,
    saveAuth,
    clearAuth,
    renderAuthArea,
    toggleAdminLink,
    requireAuth,
    requireAdmin,
    guardLinks,
    fetchVideos,
    loadVideosIntoGrid,
    renderVideoList,
    videoCardHtml,
    populateSubjects,
  };
})();
