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
    if (token) {
      localStorage.setItem("token", token);
    }
    if (user) {
      localStorage.setItem("user", JSON.stringify(user));
    }
  }

  function clearAuth() {
    localStorage.removeItem("token");
    localStorage.removeItem("user");
  }

  function renderAuthArea(options = {}) {
    const {
      containerId = "auth-area",
      showRoleBadge = true,
      logoutRedirect = window.location.href,
    } = options;
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
    const displayName = user.name || user.email || "Người dùng";
    const roleBadge =
      showRoleBadge && user.role === "admin"
        ? '<span class="pill pill-muted">Admin</span>'
        : "";

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

  window.studyApp = {
    getAuth,
    saveAuth,
    clearAuth,
    renderAuthArea,
    toggleAdminLink,
    requireAuth,
    requireAdmin,
    guardLinks,
  };
})();
