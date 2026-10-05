# Khu Phố Số — bản cộng đồng (self-host)

> **Bớt giấy tờ, còn thời gian lo cho dân.**
> Nền tảng quản trị khu phố số dành cho **Ban điều hành khu phố & Tổ dân phố**, kèm **Cổng thông tin cư dân** công khai. Đây là **bản cộng đồng** để mỗi khu phố/đơn vị **tự cài trên máy chủ riêng** — không bao gồm phần nền tảng SaaS (đăng ký tập trung, gói dịch vụ, thanh toán, quản trị đa khu phố).

Dự án phi lợi nhuận · chuyển đổi số vì cộng đồng.

---

## Tính năng chính

**Trang quản trị (cán bộ):**
- 👨‍👩‍👧 Cư dân & hộ khẩu (thường trú / tạm trú / tạm vắng / vãng lai), tìm kiếm tiếng Việt không dấu
- 🏨 Cơ sở trọ — gom hộ theo địa chỉ, theo dõi hạn tạm trú
- 🤝 Tổ chức, đoàn thể (Chi bộ, Mặt trận, Phụ nữ, Đoàn TN, CCB…), sổ đoàn viên/hội viên
- 🗂️ Văn bản đến/đi · 🗓️ Lịch họp · 🎁 Sự kiện & danh sách khách mời (lọc theo độ tuổi)
- 🗺️ Bản đồ hộ khẩu (ghim GPS, tự host Leaflet) · 📣 Phản ánh hiện trường
- 💰 Sổ quỹ khu phố (thu/chi, đợt vận động, cân đối theo quỹ, công khai)
- 🔐 Phân quyền 5 vai trò · nhật ký thao tác · CCCD mã hoá

**Cổng thông tin cư dân (công khai, không cần đăng nhập):**
- Trang chủ, sự kiện, danh bạ cơ sở kinh doanh
- Biểu mẫu & thủ tục (tải file), công khai quỹ
- Gửi phản ánh hiện trường (chống spam bằng số điện thoại), tra cứu tiến độ

---

## Kiến trúc

| Lớp | Công nghệ |
|---|---|
| Backend | Python 3.11+, FastAPI, SQLAlchemy (async), asyncpg |
| CSDL | PostgreSQL 16 + PostGIS (bản đồ), pg_trgm, unaccent, pgcrypto |
| Frontend | React 19, Vite, TanStack Router/Query, Tailwind CSS, Leaflet |

**Mô hình dữ liệu:** một **database chính** (`qlkp`) giữ tài khoản, vai trò, quyền; và **một database riêng cho mỗi khu phố** (`kp_<slug>`) giữ toàn bộ nghiệp vụ (cư dân, hộ khẩu, quỹ…). Nhờ vậy dữ liệu các khu phố cách ly hoàn toàn ở tầng CSDL.

```
apps/
  api/   — FastAPI (src/khuphoso), SQL migrations (sql/)
  web/   — React + Vite (admin + cổng thông tin cư dân)
```

---

## Yêu cầu

- PostgreSQL **16** kèm **PostGIS** (và các extension: `pg_trgm`, `unaccent`, `pgcrypto`, `btree_gist`)
- Python **3.11+**
- Node.js **20+**

---

## Cài đặt Backend

```bash
cd apps/api
python -m venv .venv && . .venv/bin/activate      # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env          # rồi điền POSTGRES_*, SECRET_KEY, PUBLIC_DOMAIN…
```

**Tạo cơ sở dữ liệu chính & schema** (dùng `psql`):

```sql
CREATE DATABASE qlkp ENCODING 'UTF8';
```

Chạy lần lượt các file trong `apps/api/sql/` theo thứ tự số (`002_core.sql`, `003_seed.sql`, `004_residents.sql`, `006_funds.sql`) lên database `qlkp`.

**Tạo database cho một khu phố** (ví dụ slug `kp3-anphu` → tên DB `kp_kp3_anphu`):

```sql
CREATE DATABASE kp_kp3_anphu ENCODING 'UTF8';
```

Trên database khu phố đó, bật extension rồi chạy lần lượt các file trong `apps/api/sql/tenant/` theo thứ tự số (`001_khoi_tao.sql` … `015_*.sql`).

**Chạy API:**

```bash
uvicorn khuphoso.main:app --host 0.0.0.0 --port 8100
# (đặt PYTHONPATH=src, hoặc chạy từ trong apps/api với src trên sys.path)
```

Kiểm tra: `GET http://127.0.0.1:8100/health`.

> **Khởi tạo khu phố & tài khoản đầu tiên:** bản cộng đồng giữ mô hình đa khu phố, nên cần thêm một dòng vào bảng `tenant` (slug + tên khu phố), tạo database `kp_<slug>` như trên, và thêm `app_user` + `membership` với vai trò `quan_tri`. Mật khẩu băm bằng `khuphoso.core.security.hash_password`. Có thể viết một script bootstrap nhỏ cho bước này.

---

## Cài đặt Frontend

```bash
cd apps/web
npm install
npm run dev        # phát triển (proxy /api → http://127.0.0.1:8100)
npm run build      # bản production → thư mục dist/
```

Bản production: phục vụ `dist/` bằng web server (Caddy/Nginx). Mặc định frontend gọi API tại `https://api.<PUBLIC_DOMAIN>` (xem `src/lib/api.ts`), lúc phát triển gọi qua proxy `/api`.

**Định tuyến cổng/quản trị:** trên tên miền khu phố (vd `kp3-anphu.khuphoso.vn`), đường `/` là **Cổng thông tin cư dân** công khai, còn `/quanly` là **trang quản trị** (đăng nhập).

---

## Cấu hình (.env)

Xem `apps/api/.env.example`. Các biến quan trọng: `POSTGRES_*`, `SECRET_KEY` (đặt chuỗi ngẫu nhiên dài), `PUBLIC_DOMAIN`, `GOOGLE_MAPS_API_KEY` (tuỳ chọn, cho dò toạ độ).

File tải lên (ảnh phản ánh, biểu mẫu, ảnh sự kiện) lưu trong thư mục `data/` cạnh tiến trình API.

---

## Bảo mật & riêng tư

- Mỗi khu phố một database riêng — không đọc chéo dữ liệu.
- Số CCCD mã hoá trong CSDL, chỉ hiện 4 số cuối; xem đủ cần quyền riêng và bị ghi nhật ký.
- Mật khẩu băm Argon2; token đăng nhập ký bằng `SECRET_KEY`.
- **Không commit** `.env` hay bất kỳ bí mật nào. Sao lưu CSDL định kỳ.

---

## Giấy phép

Dự án phi lợi nhuận phục vụ cộng đồng. Vui lòng liên hệ chủ sở hữu repo trước khi sử dụng lại cho mục đích thương mại.
