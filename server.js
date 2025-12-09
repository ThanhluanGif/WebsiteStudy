// server.js
// Backend Node.js + Express cho web học tập video (demo)

const express = require("express");
const path = require("path");

const app = express();
const PORT = 3000;

// Để đọc JSON từ body (POST)
app.use(express.json());

// Serve file tĩnh: index.html, video.html, style.css, ...
app.use(express.static(path.join(__dirname, "public")));

/**
 * GIẢ LẬP NGƯỜI DÙNG ĐÃ ĐĂNG NHẬP
 * Thực tế bạn sẽ dùng login + JWT / session.
 */
app.use((req, res, next) => {
  // user demo: id = 1
  req.user = {
    id: 1,
    name: "Học viên Demo",
    role: "student",
  };
  next();
});

/**
 * 1. DỮ LIỆU GIẢ (in-memory)
 * Sau này có thể thay bằng database thật.
 */

let videos = [
  {
    id: 1,
    title: "Bài 1: Giới thiệu HTML & CSS",
    subject: "Lập trình Web",
    duration: "25 phút",
    description:
      "Làm quen với khái niệm trang web, cấu trúc HTML cơ bản và cách áp dụng CSS.",
    createdBy: "Admin",
    createdAt: "2025-12-01",
    views: 1500,
  },
  {
    id: 2,
    title: "Bài 2: Flexbox & Layout cơ bản",
    subject: "Lập trình Web",
    duration: "30 phút",
    description:
      "Học cách dàn layout hiện đại, responsive bằng Flexbox.",
    createdBy: "Admin",
    createdAt: "2025-12-02",
    views: 980,
  },
  {
    id: 3,
    title: "Bài 3: Giới thiệu JavaScript cơ bản",
    subject: "Lập trình Web",
    duration: "35 phút",
    description:
      "Tìm hiểu biến, hàm, câu lệnh điều kiện và vòng lặp trong JavaScript.",
    createdBy: "Admin",
    createdAt: "2025-12-03",
    views: 720,
  },
];

// Comment demo
let comments = [
  {
    id: 1,
    videoId: 1,
    userId: 2,
    userName: "Nguyễn Văn A",
    content:
      "Bài giảng dễ hiểu, ví dụ rõ ràng. Mong có thêm phần thực hành ở cuối bài.",
    createdAt: "2 giờ trước",
  },
  {
    id: 2,
    videoId: 1,
    userId: 3,
    userName: "Trần Thị B",
    content:
      "Phần giải thích về CSS hơi nhanh, thầy có thể nói chậm hơn chút ạ.",
    createdAt: "Hôm qua",
  },
  {
    id: 3,
    videoId: 1,
    userId: 1,
    userName: "Admin",
    content:
      "Cảm ơn các bạn đã góp ý, bài sau sẽ có thêm phần demo thực hành chi tiết.",
    createdAt: "1 ngày trước",
  },
];

// Rating demo
let ratings = [
  { id: 1, videoId: 1, userId: 1, score: 4 },
  { id: 2, videoId: 1, userId: 2, score: 5 },
  { id: 3, videoId: 1, userId: 3, score: 4 },
  { id: 4, videoId: 2, userId: 1, score: 5 },
];

/**
 * HÀM TIỆN ÍCH TÍNH ĐIỂM TRUNG BÌNH + LẤY COMMENT
 */
function getVideoWithStats(videoId) {
  const id = Number(videoId);
  const video = videos.find((v) => v.id === id);
  if (!video) return null;

  const videoComments = comments.filter((c) => c.videoId === id);
  const videoRatings = ratings.filter((r) => r.videoId === id);

  let avgRating = 0;
  if (videoRatings.length > 0) {
    const sum = videoRatings.reduce((total, r) => total + r.score, 0);
    avgRating = sum / videoRatings.length;
  }

  avgRating = Math.round(avgRating * 10) / 10; // ví dụ 4.23 -> 4.2

  return {
    ...video,
    avgRating,
    ratingsCount: videoRatings.length,
    comments: videoComments,
  };
}

/**
 * 2. API ENDPOINTS
 */

/**
 * GET /api/videos
 * Lấy danh sách video (kèm avgRating sơ bộ).
 */
app.get("/api/videos", (req, res) => {
  const list = videos.map((v) => {
    const data = getVideoWithStats(v.id);
    return {
      id: v.id,
      title: v.title,
      subject: v.subject,
      duration: v.duration,
      description: v.description,
      views: v.views,
      avgRating: data.avgRating,
      ratingsCount: data.ratingsCount,
    };
  });

  res.json(list);
});

/**
 * GET /api/videos/:id
 * Lấy chi tiết 1 video, kèm comments + rating.
 */
app.get("/api/videos/:id", (req, res) => {
  const videoId = req.params.id;
  const data = getVideoWithStats(videoId);

  if (!data) {
    return res.status(404).json({ message: "Không tìm thấy video." });
  }

  res.json(data);
});

/**
 * POST /api/videos/:id/comments
 * Tạo comment mới cho video (giả lập user đã đăng nhập).
 * Body: { content: "nội dung bình luận" }
 */
app.post("/api/videos/:id/comments", (req, res) => {
  const videoId = Number(req.params.id);
  const video = videos.find((v) => v.id === videoId);
  if (!video) {
    return res.status(404).json({ message: "Không tìm thấy video." });
  }

  const { content } = req.body;
  if (!content || !content.trim()) {
    return res.status(400).json({ message: "Nội dung bình luận không được để trống." });
  }

  const newComment = {
    id: comments.length + 1,
    videoId: videoId,
    userId: req.user.id,
    userName: req.user.name,
    content: content.trim(),
    createdAt: "Vừa xong", // demo, thực tế dùng datetime
  };

  comments.push(newComment);

  res.status(201).json(newComment);
});

/**
 * POST /api/videos/:id/ratings
 * Tạo hoặc cập nhật đánh giá 1–5 sao cho video.
 * Body: { score: 1..5 }
 */
app.post("/api/videos/:id/ratings", (req, res) => {
  const videoId = Number(req.params.id);
  const video = videos.find((v) => v.id === videoId);
  if (!video) {
    return res.status(404).json({ message: "Không tìm thấy video." });
  }

  let { score } = req.body;
  score = Number(score);
  if (!score || score < 1 || score > 5) {
    return res
      .status(400)
      .json({ message: "Điểm đánh giá phải từ 1 đến 5." });
  }

  // Kiểm tra user đã rating chưa
  const existing = ratings.find(
    (r) => r.videoId === videoId && r.userId === req.user.id
  );

  if (existing) {
    existing.score = score;
  } else {
    const newRating = {
      id: ratings.length + 1,
      videoId: videoId,
      userId: req.user.id,
      score,
    };
    ratings.push(newRating);
  }

  const data = getVideoWithStats(videoId);
  res.json({
    message: "Đã lưu đánh giá.",
    avgRating: data.avgRating,
    ratingsCount: data.ratingsCount,
  });
});

/**
 * (TÙY CHỌN) GET /api/videos/:id/comments
 * Nếu muốn tách riêng lấy comment, có thể dùng thêm endpoint này.
 */
app.get("/api/videos/:id/comments", (req, res) => {
  const videoId = Number(req.params.id);
  const videoComments = comments.filter((c) => c.videoId === videoId);
  res.json(videoComments);
});

/**
 * 3. KHỞI ĐỘNG SERVER
 */

app.listen(PORT, () => {
  console.log(`Server đang chạy tại http://localhost:${PORT}`);
});
