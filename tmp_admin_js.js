
    let currentPage = 1;
    let totalPages = 1;
    let currentSubjectFilter = "";
    let currentStatusFilter = "";
    let currentSort = "newest";
    let currentSearch = "";
    let allLeads = [];
    let lastLeadTime = "";
    let leadPage = 1;
    const LEAD_PAGE_SIZE = 10;
    let editingVideoId = null;
    window.leadAdvanced = window.leadAdvanced || { weekly: [], byStatus: [], last24h: 0 };

    function getAuthToken() {
      const auth = window.studyApp?.getAuth();
      return auth?.token || null;
    }

    async function fetchJson(url, options = {}, label = "API") {
      const res = await fetch(url, options);
      const text = await res.text();
      let data;
      try {
        data = JSON.parse(text);
      } catch (err) {
        throw new Error(`${label}: phản hồi không phải JSON (${text.slice(0, 80)})`);
      }
      return { res, data };
    }

    function setMsg(el, text, type) {
      if (!el) return;
      el.textContent = text || "";
      el.className = "msg";
      if (type) el.classList.add(type);
    }

    function renderLeads() {
      const wrap = document.getElementById("lead-list");
      if (!wrap) return;
      const keyword = (document.getElementById("lead-search")?.value || "").toLowerCase();
      const role = document.getElementById("lead-role-filter")?.value || "";

      let list = allLeads;
      if (role) list = list.filter((l) => (l.role || "") === role);
      if (keyword) {
        list = list.filter((l) => {
          const haystack = [l.fullName, l.phone, l.email, l.grade, l.message]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return haystack.includes(keyword);
        });
      }

      if (!list.length) {
        wrap.innerHTML =
          `<tr><td colspan="6" style="text-align:center;color:#6b7280;">Chưa có dữ liệu. Hãy gửi thử form tư vấn ở trang Giới thiệu để kiểm tra.</td></tr>`;
        const pageInfo = document.getElementById("lead-page-info");
        if (pageInfo) pageInfo.textContent = "Trang 0 / 0";
        return;
      }

      const totalPages = Math.max(Math.ceil(list.length / LEAD_PAGE_SIZE), 1);
      leadPage = Math.min(Math.max(leadPage, 1), totalPages);
      const start = (leadPage - 1) * LEAD_PAGE_SIZE;
      const end = start + LEAD_PAGE_SIZE;
      const pageList = list.slice(start, end);

      const roleLabel = { ph: "Phụ huynh", hs: "Học sinh / SV" };
      wrap.innerHTML = pageList
        .map((l) => {
          const time = l.createdAt ? new Date(l.createdAt).toLocaleString("vi-VN") : "";
          return `
            <tr>
              <td>
                <div style="font-weight:600;">${l.fullName || "Không tên"}</div>
                <div style="font-size:12px;color:#6b7280;">Lớp/Năm: ${l.grade || "Chưa rõ"}</div>
              </td>
              <td style="font-size:12px;color:#374151;">
                <div>SĐT: ${l.phone || "Chưa có"}</div>
                <div>Email: ${l.email || "Chưa có"}</div>
              </td>
              <td style="font-size:12px;">${roleLabel[l.role] || "Khác"}</td>
              <td style="font-size:12px;">
                <span class="badge">${l.status === "contacted" ? "Đã liên hệ" : l.status === "closed" ? "Đã đóng" : "Mới"}</span>
                <div style="margin-top:4px; display:flex; gap:4px; flex-wrap:wrap;">
                  <button class="btn btn-outline btn-action btn-lead-status" data-id="${l._id}" data-status="new">Mới</button>
                  <button class="btn btn-outline btn-action btn-lead-status" data-id="${l._id}" data-status="contacted">Liên hệ</button>
                  <button class="btn btn-outline btn-action btn-lead-status" data-id="${l._id}" data-status="closed">Đóng</button>
                </div>
              </td>
              <td style="font-size:12px;color:#111827;">${l.message || "Không ghi chú"}</td>
              <td style="font-size:12px;color:#6b7280;white-space:nowrap;">${time}</td>
            </tr>
          `;
        })
        .join("");
    }

    async function loadLeads() {
      const wrap = document.getElementById("lead-list");
      if (wrap) wrap.innerHTML = `<tr><td colspan="6" style="text-align:center;">Đang tải...</td></tr>`;
      const token = getAuthToken();
      if (!token) {
        if (wrap) wrap.textContent = "Cần đăng nhập lại.";
        return;
      }
      try {
        const res = await fetch("/api/admin/leads", {
          headers: { Authorization: "Bearer " + token },
        });
        const raw = await res.text();
        let data = {};
        try {
          data = JSON.parse(raw);
        } catch {
          console.error("Lead API trả về không phải JSON:", raw.slice(0, 200));
          throw new Error("Server không trả JSON (hãy chạy qua npm start): " + raw.slice(0, 60));
        }
        if (!res.ok) throw new Error(data.message || "Lỗi tải danh sách");
        allLeads = data.leads || [];
        leadPage = 1; // reset trang khi tải lại dữ liệu
        const totalEl = document.getElementById("lead-total");
        const latestEl = document.getElementById("lead-latest");
        if (totalEl) totalEl.textContent = allLeads.length.toString();
        if (latestEl) {
          if (allLeads.length) {
            const newest = allLeads[0]?.createdAt;
            lastLeadTime = newest ? new Date(newest).toLocaleString("vi-VN") : "";
            latestEl.textContent = lastLeadTime || "—";
          } else {
            latestEl.textContent = "Chưa có";
          }
        }
        renderLeads();
        renderLeadStats();
      } catch (err) {
        console.error(err);
        if (wrap) {
          wrap.innerHTML = `<tr><td colspan="6" style="text-align:center;color:#b91c1c;">Lỗi khi tải khách hàng: ${
            err.message || "Không rõ lỗi"
          }</td></tr>`;
        }
        const totalEl = document.getElementById("lead-total");
        const latestEl = document.getElementById("lead-latest");
        if (totalEl) totalEl.textContent = "—";
        if (latestEl) latestEl.textContent = "—";
      }
    }

    function renderLeadStats() {
      const dailyEl = document.getElementById("lead-daily");
      const interestEl = document.getElementById("lead-interest");
      const weeklyEl = document.getElementById("lead-weekly");
      const statusEl = document.getElementById("lead-status-dist");
      if (!dailyEl || !interestEl) return;

      // Theo ng?y 14 ng?y
      const today = new Date();
      const days = [];
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const key = d.toISOString().slice(0, 10);
        days.push({ key, label: d.toLocaleDateString("vi-VN"), count: 0 });
      }
      const dayMap = new Map(days.map((d) => [d.key, d]));
      allLeads.forEach((l) => {
        const created = new Date(l.createdAt);
        if (!created || Number.isNaN(created.getTime())) return;
        const key = created.toISOString().slice(0, 10);
        if (dayMap.has(key)) dayMap.get(key).count += 1;
      });
      const maxDay = Math.max(...days.map((d) => d.count), 1);
      dailyEl.innerHTML =
        allLeads.length === 0
          ? '<div class="msg">Ch?a c? l??t ??ng k?.</div>'
          : days
              .map(
                (d) => `
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:82px;">${d.label}</span>
                    <div style="flex:1; background:#e5e7eb; border-radius:999px; height:8px; overflow:hidden;">
                      <div class="bar" style="width:${((d.count / maxDay) * 100).toFixed(1)}%;"></div>
                    </div>
                    <span style="width:24px;text-align:right;">${d.count}</span>
                  </div>
                `
              )
              .join("");

      // Ch? ?? quan t?m
      const freq = {};
      const stopWords = ["va", "và", "can", "cần", "muon", "muốn", "hoc", "học", "web", "lap", "trinh", "ve", "la", "thi"];
      allLeads.forEach((l) => {
        const msg = (l.message || "").toLowerCase();
        msg
          .replace(/[^a-zàáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ0-9\s]/g, " ")
          .split(/\s+/)
          .filter((w) => w.length >= 3 && !stopWords.includes(w))
          .forEach((w) => {
            freq[w] = (freq[w] || 0) + 1;
          });
      });
      const interests = Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      interestEl.innerHTML =
        interests.length === 0
          ? '<div class="msg">Ch?a c? ghi ch? nhu c?u.</div>'
          : interests
              .map(
                ([w, c]) => `
                  <div style="display:flex;justify-content:space-between;">
                    <span>${w}</span>
                    <strong>${c}</strong>
                  </div>
                `
              )
              .join("");

      // Theo tu?n & tr?ng th?i
      if (window.leadAdvanced?.weekly && weeklyEl) {
        const list = window.leadAdvanced.weekly;
        const maxCount = Math.max(...list.map((i) => i.count), 1);
        weeklyEl.innerHTML =
          list.length === 0
            ? '<div class="msg">Ch?a c? d? li?u.</div>'
            : list
                .map(
                  (i) => `
                  <div style="display:flex;align-items:center;gap:8px;">
                    <span style="width:110px;">${i.label}</span>
                    <div style="flex:1; background:#e5e7eb; border-radius:999px; height:8px; overflow:hidden;">
                      <div class="bar" style="width:${((i.count / maxCount) * 100).toFixed(1)}%;"></div>
                    </div>
                    <span style="width:28px;text-align:right;">${i.count}</span>
                  </div>
                `
                )
                .join("");
      }
      if (window.leadAdvanced?.byStatus && statusEl) {
        const mapLabel = { new: "M?i", contacted: "Li?n h?", closed: "??ng" };
        statusEl.innerHTML =
          window.leadAdvanced.byStatus.length === 0
            ? '<div class="msg">Ch?a c? d? li?u.</div>'
            : window.leadAdvanced.byStatus
                .map(
                  (s) => `
                <div style="display:flex;justify-content:space-between;">
                  <span>${mapLabel[s._id] || s._id || "Kh?c"}</span>
                  <strong>${s.count}</strong>
                </div>
              `
                )
                .join("");
      }
    }


async function loadVideos() {
      const tbody = document.getElementById("video-tbody");
      const countBadge = document.getElementById("video-count");
      const pagingInfo = document.getElementById("paging-info");
      if (!tbody) return;

      tbody.innerHTML = `<tr><td colspan="4">Đang tải danh sách video...</td></tr>`;

      const token = getAuthToken();
      if (!token) {
        alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        window.location.href = "login.html";
        return;
      }

      const params = new URLSearchParams();
      params.set("page", String(currentPage));
      params.set("limit", "5");
      if (currentSubjectFilter.trim()) params.set("subject", currentSubjectFilter.trim());
      if (currentStatusFilter) params.set("status", currentStatusFilter);
      if (currentSort) params.set("sort", currentSort);
      if (currentSearch) params.set("search", currentSearch);

      try {
        const { res, data } = await fetchJson("/api/admin/videos?" + params.toString(), {
          headers: { Authorization: "Bearer " + token },
        }, "Tải video");
        if (!res.ok) throw new Error(data.message || "Load video failed");

        const { videos = [], total = 0, page = 1, pages = 1 } = data;
        currentPage = page;
        totalPages = pages || 1;

        if (countBadge) countBadge.textContent = total + " video";
        if (pagingInfo) pagingInfo.textContent = `Trang ${currentPage} / ${totalPages || 1}`;

        if (!videos.length) {
          tbody.innerHTML = `<tr><td colspan="4">Không có video nào (theo bộ lọc hiện tại).</td></tr>`;
          return;
        }

        tbody.innerHTML = videos
          .map((v) => {
            const published = v.isPublished !== false;
            return `
              <tr>
                <td>
                  <div class="thumb-mini" style="background-image:url('${v.thumbnailUrl || ""}');"></div>
                </td>
                <td>
                  <div style="font-weight:600;color:#111827;">${v.title || "Video"}</div>
                  <div style="font-size:12px;color:#6b7280;margin-top:2px;">
                    Môn: ${v.subject || "Chưa phân loại"} • ${v.durationMinutes || "?"} phút
                  </div>
                  <div style="font-size:12px;color:#9ca3af;margin-top:2px;">ID: ${v._id}</div>
                  <div style="margin-top:4px;">
                    <span class="badge ${published ? "published" : "hidden"}">
                      ${published ? "Đang hiển thị" : "Đã ẩn"}
                    </span>
                  </div>
                </td>
                <td style="font-size:12px;color:#4b5563;">
                  <div>👁️ ${v.totalViews || 0} lượt xem</div>
                  <div>⭐ ${
                    v.totalRatings > 0
                      ? (v.avgRating || 0).toFixed(1) + " (" + v.totalRatings + " lượt)"
                      : "Chưa có đánh giá"
                  }</div>
                  <div>${new Date(v.createdAt).toLocaleDateString("vi-VN")}</div>
                </td>
                <td style="font-size:11px;display:flex;flex-direction:column;gap:6px;">
                  <button
                    class="btn btn-outline btn-action btn-toggle"
                    data-id="${v._id}"
                    data-published="${published ? "true" : "false"}"
                  >
                    ${published ? "Ẩn video" : "Hiển thị"}
                  </button>
                  <button class="btn btn-outline btn-action btn-delete" data-id="${v._id}">
                    Xóa
                  </button>
                  <button class="btn btn-outline btn-action btn-edit" data-id="${v._id}"
                    data-title="${(v.title || "").replace(/"/g, "&quot;")}"
                    data-subject="${(v.subject || "").replace(/"/g, "&quot;")}"
                    data-duration="${v.durationMinutes || 0}"
                    data-thumbnail="${(v.thumbnailUrl || "").replace(/"/g, "&quot;")}"
                    data-desc="${(v.description || "").replace(/"/g, "&quot;")}"
                  >
                    Sửa
                  </button>
                </td>
              </tr>
            `;
          })
          .join("");
      } catch (err) {
        console.error(err);
        tbody.innerHTML = `<tr><td colspan="4">Lỗi khi tải danh sách video.</td></tr>`;
      }
    }

    async function handleVideoFormSubmit(e) {
      e.preventDefault();
      const titleEl = document.getElementById("title");
      const subjectEl = document.getElementById("subject");
      const durationEl = document.getElementById("duration");
      const videoUrlEl = document.getElementById("videoUrl");
      const thumbnailUrlEl = document.getElementById("thumbnailUrl");
      const descriptionEl = document.getElementById("description");
      const msgEl = document.getElementById("form-msg");

      const title = titleEl.value.trim();
      const subject = subjectEl.value.trim();
      const duration = durationEl.value ? Number(durationEl.value) : undefined;
      const videoUrl = videoUrlEl.value.trim();
      const thumbnailUrl = thumbnailUrlEl.value.trim();
      const description = descriptionEl.value.trim();

      if (!title || !videoUrl) {
        setMsg(msgEl, "Vui lòng nhập tối thiểu Tiêu đề và Link video.", "error");
        return;
      }

      const token = getAuthToken();
      if (!token) {
        alert("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        window.location.href = "login.html";
        return;
      }

      setMsg(msgEl, "Đang gửi dữ liệu...");

      try {
        const { res, data } = await fetchJson(
          "/api/videos",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({
              title,
              subject,
              durationMinutes: duration,
              videoUrl,
              thumbnailUrl,
              description,
            }),
          },
          "Tạo video"
        );

        if (!res.ok) {
          setMsg(msgEl, data.message || "Lỗi khi tạo video.", "error");
          return;
        }

        setMsg(msgEl, "Tạo video thành công!", "success");
        videoUrlEl.value = "";
        loadVideos();
        loadVideoStats();
        loadActivity();
      } catch (err) {
        console.error(err);
        setMsg(msgEl, err.message || "Lỗi kết nối tới server.", "error");
      }
    }

    async function loadLeadAdvancedStats() {
      const token = getAuthToken();
      const lead24hEl = document.getElementById("lead-24h");
      if (!token || !lead24hEl) return;
      try {
        const { res, data } = await fetchJson("/api/admin/leads/stats/advanced", {
          headers: { Authorization: "Bearer " + token },
        }, "Thống kê lead nâng cao");
        if (!res.ok) throw new Error(data.message || "Lỗi thống kê lead nâng cao");
        window.leadAdvanced = data;
        lead24hEl.textContent = data.last24h ?? 0;
        renderLeadStats();
      } catch (err) {
        console.error(err);
        if (lead24hEl) lead24hEl.textContent = "—";
      }
    }

    async function loadVideoStats() {
      const token = getAuthToken();
      if (!token) return;
      try {
        const { res, data } = await fetchJson("/api/admin/videos/stats", {
          headers: { Authorization: "Bearer " + token },
        }, "Thống kê video");
        if (!res.ok) throw new Error(data.message || "Lỗi thống kê video");
        const topViewsEl = document.getElementById("video-top-views");
        const topRatingEl = document.getElementById("video-top-rating");
        const dailyEl = document.getElementById("video-views-daily");
        const weeklyEl = document.getElementById("video-views-weekly");
        const renderList = (el, list, labelFn) => {
          if (!el) return;
          el.innerHTML =
            !list || !list.length
              ? '<div class="msg">Chưa có dữ liệu.</div>'
              : list
                  .map(
                    (v, idx) => `
                <div style="display:flex;justify-content:space-between;font-size:13px;">
                  <span>${idx + 1}. ${labelFn(v)}</span>
                  <strong>${labelFn === viewLabel ? v.totalViews || 0 : v.avgRating?.toFixed(1) || 0}</strong>
                </div>
              `
                  )
                  .join("");
        };
        const viewLabel = (v) => v.title || "Video";
        const ratingLabel = (v) => v.title || "Video";
        renderList(topViewsEl, data.topViews, viewLabel);
        renderList(topRatingEl, data.topRating, ratingLabel);
        const renderBars = (el, list) => {
          if (!el) return;
          if (!list || !list.length) {
            el.innerHTML = '<div class="msg">Chưa có dữ liệu.</div>';
            return;
          }
          const max = Math.max(...list.map((i) => i.count), 1);
          el.innerHTML = list
            .map(
              (i) => `
            <div style="display:flex;align-items:center;gap:8px;">
              <span style="width:110px;">${i.label}</span>
              <div style="flex:1; background:#e5e7eb; border-radius:999px; height:8px; overflow:hidden;">
                <div class="bar" style="width:${((i.count / max) * 100).toFixed(1)}%;"></div>
              </div>
              <span style="width:28px;text-align:right;">${i.count}</span>
            </div>
          `
            )
            .join("");
        };
        renderBars(dailyEl, data.dailyViews);
        renderBars(weeklyEl, data.weeklyViews);
      } catch (err) {
        console.error(err);
      }
    }

    async function loadActivity() {
      const token = getAuthToken();
      const box = document.getElementById("activity-log");
      if (!token || !box) return;
      box.innerHTML = "Đang tải...";
      try {
        const { res, data } = await fetchJson("/api/admin/activity", {
          headers: { Authorization: "Bearer " + token },
        }, "Nhật ký");
        if (!res.ok) throw new Error(data.message || "Lỗi tải nhật ký");
        const logs = data.logs || [];
        box.innerHTML =
          logs.length === 0
            ? '<div class="msg">Chưa có nhật ký.</div>'
            : logs
                .map(
                  (l) => `
              <div style="border:1px solid #e5e7eb;border-radius:10px;padding:8px 10px;font-size:12px;">
                <div style="font-weight:600;">${l.type}</div>
                <div style="color:#4b5563;">${l.detail || ""}</div>
                <div style="color:#9ca3af;">${new Date(l.createdAt).toLocaleString("vi-VN")}</div>
              </div>
            `
                )
                .join("");
      } catch (err) {
        console.error(err);
        box.innerHTML = "Lỗi khi tải nhật ký.";
      }
    }

    document.addEventListener("DOMContentLoaded", () => {
      const auth = window.studyApp?.requireAdmin({ redirect: "index.html" });
      if (!auth) return;

      if (window.studyApp) {
        studyApp.renderAuthArea({ showRoleBadge: true, logoutRedirect: "index.html" });
      }

      document.getElementById("video-form")?.addEventListener("submit", handleVideoFormSubmit);

      const filterSubject = document.getElementById("filter-subject");
      const filterBtn = document.getElementById("btn-filter");
      const filterStatus = document.getElementById("filter-status");
      const filterSort = document.getElementById("filter-sort");
      const filterSearch = document.getElementById("filter-search");
      const applyFilter = () => {
        currentSubjectFilter = filterSubject?.value || "";
        currentStatusFilter = filterStatus?.value || "";
        currentSort = filterSort?.value || "newest";
        currentSearch = filterSearch?.value || "";
        currentPage = 1;
        loadVideos();
      };
      filterBtn?.addEventListener("click", applyFilter);
      [filterSubject, filterStatus, filterSort].forEach((el) => {
        el?.addEventListener("change", applyFilter);
      });
      filterSearch?.addEventListener("keypress", (e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          applyFilter();
        }
      });

      document.getElementById("btn-prev")?.addEventListener("click", () => {
        if (currentPage > 1) {
          currentPage--;
          loadVideos();
        }
      });
      document.getElementById("btn-next")?.addEventListener("click", () => {
        if (currentPage < totalPages) {
          currentPage++;
          loadVideos();
        }
      });

      document.getElementById("video-tbody")?.addEventListener("click", async (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        const token = getAuthToken();
        if (!token) {
          alert("Phiên đăng nhập đã hết hạn.");
          window.location.href = "login.html";
          return;
        }

        if (target.classList.contains("btn-toggle")) {
          const id = target.getAttribute("data-id");
          const published = target.getAttribute("data-published") === "true";
          const confirmMsg = published
            ? "Bạn chắc muốn ẩn video này?"
            : "Bạn chắc muốn hiển thị lại video này?";
          if (!confirm(confirmMsg)) return;

          try {
            const res = await fetch(`/api/admin/videos/${id}/visibility`, {
              method: "PATCH",
              headers: {
                "Content-Type": "application/json",
                Authorization: "Bearer " + token,
              },
              body: JSON.stringify({ isPublished: !published }),
            });
            const data = await res.json();
            if (!res.ok) {
              alert(data.message || "Lỗi khi cập nhật trạng thái.");
              return;
            }
            loadVideos();
            loadVideoStats();
            loadActivity();
          } catch (err) {
            console.error(err);
            alert("Lỗi kết nối khi cập nhật trạng thái.");
          }
        }

        if (target.classList.contains("btn-delete")) {
          const id = target.getAttribute("data-id");
          if (!confirm("Bạn chắc muốn xóa video này?")) return;

          try {
            const res = await fetch(`/api/admin/videos/${id}`, {
              method: "DELETE",
              headers: { Authorization: "Bearer " + token },
            });
            const data = await res.json();
            if (!res.ok) {
              alert(data.message || "Lỗi khi xóa video.");
              return;
            }
            loadVideos();
            loadVideoStats();
            loadActivity();
          } catch (err) {
            console.error(err);
            alert("Lỗi kết nối khi xóa video.");
          }
        }

        if (target.classList.contains("btn-edit")) {
          const id = target.getAttribute("data-id");
          editingVideoId = id;
          document.getElementById("edit-title").value = target.getAttribute("data-title") || "";
          document.getElementById("edit-subject").value = target.getAttribute("data-subject") || "";
          document.getElementById("edit-duration").value = target.getAttribute("data-duration") || "";
          document.getElementById("edit-thumbnail").value = target.getAttribute("data-thumbnail") || "";
          document.getElementById("edit-desc").value = target.getAttribute("data-desc") || "";
          document.getElementById("edit-msg").textContent = "";
          document.getElementById("edit-modal").style.display = "flex";
        }
      });

      document.getElementById("lead-search")?.addEventListener("input", () => {
        leadPage = 1;
        renderLeads();
      });
      document.getElementById("lead-role-filter")?.addEventListener("change", () => {
        leadPage = 1;
        renderLeads();
      });
      document.getElementById("lead-prev")?.addEventListener("click", () => {
        if (leadPage > 1) {
          leadPage -= 1;
          renderLeads();
        }
      });
      document.getElementById("lead-next")?.addEventListener("click", () => {
        leadPage += 1;
        renderLeads();
      });
      document.getElementById("lead-reload")?.addEventListener("click", () => {
        loadLeads();
      });
      document.getElementById("lead-export")?.addEventListener("click", () => {
        if (!allLeads.length) {
          alert("Chưa có dữ liệu để xuất.");
          return;
        }
        const header = ["fullName", "role", "grade", "phone", "email", "status", "message", "createdAt"];
        const rows = allLeads.map((l) =>
          header
            .map((h) => {
              const val = l[h] || "";
              const safe = String(val).replace(/"/g, '""');
              return `"${safe}"`;
            })
            .join(",")
        );
        const csv = [header.join(","), ...rows].join("\n");
        const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = "leads.csv";
        a.click();
        URL.revokeObjectURL(url);
      });

      document.getElementById("lead-list")?.addEventListener("click", async (e) => {
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        if (!target.classList.contains("btn-lead-status")) return;
        const id = target.getAttribute("data-id");
        const status = target.getAttribute("data-status");
        const token = getAuthToken();
        if (!token) {
          alert("Phiên đăng nhập hết hạn.");
          window.location.href = "login.html";
          return;
        }
        try {
          const res = await fetch(`/api/admin/leads/${id}/status`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify({ status }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Cập nhật trạng thái thất bại");
          // update local
          allLeads = allLeads.map((l) => (l._id === id ? { ...l, status } : l));
          renderLeads();
          loadLeadAdvancedStats();
          loadActivity();
        } catch (err) {
          console.error(err);
          alert(err.message || "Lỗi khi cập nhật trạng thái lead.");
        }
      });

      const closeEdit = () => {
        document.getElementById("edit-modal").style.display = "none";
        editingVideoId = null;
      };
      document.getElementById("edit-cancel")?.addEventListener("click", () => {
        closeEdit();
      });
      document.getElementById("edit-save")?.addEventListener("click", async () => {
        if (!editingVideoId) return;
        const token = getAuthToken();
        if (!token) {
          alert("Phiên đăng nhập đã hết hạn.");
          window.location.href = "login.html";
          return;
        }
        const msg = document.getElementById("edit-msg");
        msg.textContent = "Đang lưu...";
        try {
          const payload = {
            title: document.getElementById("edit-title").value.trim(),
            subject: document.getElementById("edit-subject").value.trim(),
            durationMinutes: Number(document.getElementById("edit-duration").value) || 0,
            thumbnailUrl: document.getElementById("edit-thumbnail").value.trim(),
            description: document.getElementById("edit-desc").value.trim(),
          };
          const res = await fetch(`/api/admin/videos/${editingVideoId}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: "Bearer " + token,
            },
            body: JSON.stringify(payload),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || "Lưu thất bại");
          msg.textContent = "Đã lưu.";
          closeEdit();
          loadVideos();
          loadVideoStats();
          loadActivity();
        } catch (err) {
          console.error(err);
          msg.textContent = err.message || "Lỗi khi lưu.";
        }
      });

      loadVideos();
      loadLeads();
      loadLeadAdvancedStats();
      loadVideoStats();
      loadActivity();
    });
  