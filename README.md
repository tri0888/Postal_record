# Hệ thống Quản lý Hồ sơ Hoàn

Web app nội bộ để nạp file Excel hồ sơ hoàn vào CSDL tập trung, tra cứu nhanh theo
**mã đơn vị** và **ngày hoàn**, kèm danh mục đơn vị.

## Công nghệ

| Thành phần | Lựa chọn |
|---|---|
| Ngôn ngữ | JavaScript thuần (ESM) — không dùng TypeScript |
| API | Node.js + Express, chạy trên máy ở cổng 3000 |
| CSDL | MongoDB Atlas |
| Giao diện | React 19 + Vite + Tailwind CSS 4 (SPA), cổng 5173 |
| Đọc Excel | SheetJS, chạy **phía trình duyệt** |
| Đăng nhập | Một tài khoản duy nhất, JWT trong cookie httpOnly |

Không có phần deploy: hệ thống chỉ chạy trên máy, hai tiến trình song song.

## Ba quyết định kiến trúc đáng lưu ý

**1. File Excel được đọc ngay trên trình duyệt, không gửi lên server.**
Trình duyệt đọc file, chuẩn hoá, đối chiếu, rồi chỉ gửi lên các dòng đã sạch theo
lô 200 dòng. Nhờ vậy mới có được màn hình xem trước "bao nhiêu dòng thêm mới /
bao nhiêu dòng sẽ bị ghi đè" **trước khi** ghi vào CSDL.

**2. Khoá duy nhất của một hồ sơ là CẶP (SỐ HỒ SƠ, MÃ ĐƠN VỊ).**
SỐ HỒ SƠ một mình KHÔNG duy nhất — cùng một số xuất hiện ở nhiều đơn vị khác
nhau. Ràng buộc này giao cho MongoDB giữ bằng một unique index ghép
(`server/src/db.js`), nhờ đó việc nạp dữ liệu chỉ cần `upsert`, không phải tự
kiểm tra trùng, và không có khe hở khi hai thao tác chạy cùng lúc.

**3. Ghép hồ sơ với đơn vị bằng `$lookup`, không phi chuẩn hoá.**
`server/src/routes/records.js` dùng `$lookup` + `$unwind preserveNullAndEmptyArrays`
— đúng nghĩa LEFT JOIN, nên hồ sơ có mã đơn vị chưa nằm trong danh mục vẫn hiện
ra (giao diện đánh dấu "Chưa có trong danh mục"). Khi bộ lọc không đụng tới thông
tin đơn vị thì pipeline cắt trang **trước** rồi mới join, để `$lookup` chỉ chạy
trên đúng số dòng của một trang.

## Cấu trúc

```
Postal_record/
  shared/                 ★ DÙNG CHUNG server + giao diện (Vite alias @shared)
    excel.js                lõi đọc Excel
    normalize.js            chuẩn hoá chuỗi tiếng Việt
    constants.js            hằng số giới hạn
  server/
    .env.example          mẫu cấu hình — chép thành .env rồi điền
    index.js              dựng Express + listen
    src/
      config.js             đọc và kiểm tra biến môi trường
      db.js                 kết nối Mongo, index, bộ đếm số thứ tự
      lib/regex.js          escape trước khi dựng regex tìm kiếm
      middleware/auth.js    JWT trong cookie httpOnly
      routes/               auth, records, units, imports
    scripts/db-init.js    tạo collection + index
    scripts/db-reset.js   xoá sạch dữ liệu rồi dựng lại index
  frontend/
    src/pages/            Login, Search, Import, Units
  data/                   file Excel nguồn — KHÔNG đưa lên git
```

## Không để lộ dữ liệu

Repo không chứa một giá trị thật nào:

- `server/.env` (đã `.gitignore`) giữ `MONGODB_URI` — connection string Atlas có
  kèm mật khẩu CSDL — và `JWT_SECRET`. Mẫu: `server/.env.example`.
- Tài khoản đăng nhập cũng nằm ở `server/.env`. Đổi mật khẩu = sửa một dòng cấu
  hình rồi khởi động lại, không phải đụng vào mã nguồn.
- Server **từ chối khởi động** nếu thiếu `JWT_SECRET`, và in sẵn một chuỗi ngẫu
  nhiên để dán vào `.env` — không có chuyện chạy nhầm với khoá ký rỗng.
- `data/` chứa file Excel nguồn (địa chỉ, mã số thuế, số tài khoản, email cán bộ)
  và đã bị `.gitignore` chặn.

## Chạy lần đầu

```bash
# 1. Cài đặt
npm install
npm run install:all

# 2. Cấu hình
#    - chép server/.env.example  ->  server/.env
#    - dán MONGODB_URI lấy ở Atlas > Cluster > Connect > Drivers
#    - sinh JWT_SECRET:
#        node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
#    ⚠ Nhớ thêm IP máy vào Atlas > Network Access, nếu không sẽ treo ở bước kết nối.

# 3. Tạo collection + index
npm run db:init

# 4. Chạy (API :3000 và giao diện :5173 cùng lúc)
npm run dev
```

Mở <http://localhost:5173>, đăng nhập bằng tài khoản trong `server/.env`
(mặc định **admin / admin**).

Hồ sơ và danh mục đơn vị **không** do script nào nạp — nạp qua màn hình
"Nạp dữ liệu" trên giao diện.

### Chạy riêng từng phần

```bash
npm run dev:api     # chỉ API   (http://127.0.0.1:3000)
npm run dev:web     # chỉ giao diện (http://localhost:5173)
```

Vite proxy `/api` sang cổng 3000, nên trình duyệt coi hai bên là cùng gốc —
cookie phiên hoạt động bình thường và không cần cấu hình CORS.

`npm run dev:api` dùng `node --watch`, sửa file server là tự khởi động lại.

### Kết nối Atlas không được

| Lỗi | Nguyên nhân và cách sửa |
|---|---|
| `querySrv ECONNREFUSED` | Chuỗi `mongodb+srv://` phải tra bản ghi DNS loại **SRV**, mà DNS đang dùng từ chối loại truy vấn này. Thêm `MONGODB_DNS_SERVERS=8.8.8.8,1.1.1.1` vào `server/.env`. Hoặc lấy chuỗi không cần SRV ở Atlas → Connect → Drivers → chọn *Node.js 2.2.12 or later*. |
| Treo rồi báo quá hạn chờ | IP máy chưa được cho phép: Atlas → Network Access → Add Current IP Address, chờ trạng thái **Active**. |
| `Authentication failed` | Sai user/password. Mật khẩu có ký tự đặc biệt (`@ : / ? # [ ] %`) phải mã hoá URL — `@` viết thành `%40`. |

Server tự nhận diện ba trường hợp này và in ra hướng dẫn tương ứng thay vì ném
nguyên văn lỗi của driver.

### Xoá sạch dữ liệu và làm lại từ đầu

```bash
npm run db:reset              # chỉ liệt kê sẽ xoá gì, KHÔNG xoá
npm run db:reset -- --yes     # xoá thật
```

Lệnh này xoá trên **CSDL thật ở Atlas** và không có bản sao nào để cứu, nên bắt
buộc phải có cờ `--yes`. Chạy không cờ thì nó chỉ in ra số tài liệu của từng
collection để bạn xem trước.

## Bẫy dữ liệu đã xử lý

`shared/excel.js` sinh ra để chống lại các bẫy có thật trong file nguồn — đọc
phần chú thích đầu file trước khi sửa:

1. **NGÀY HOÀN lẫn lộn kiểu** — có ô là số serial của Excel, có ô là chuỗi
   `"09/10/2025"`. Chỉ xử lý một dạng là mất hồ sơ khỏi kết quả tra cứu.
2. **Header có dấu cách thừa, cột nằm rải rác** (`'NGÀY NHẬN (*) '`) — map theo
   TÊN header, không bao giờ theo vị trí cột.
3. **Mã quy trình về dạng số thực** `600.0` — phải làm tròn về `600`.
4. **SỐ HỒ SƠ không duy nhất** — xem quyết định kiến trúc số 2 ở trên.
6. **Ngày kiểu Việt Nam** `dd/mm/yyyy`, không phải `mm/dd/yyyy`.
7. **Mã số thuế / điện thoại có số 0 đứng đầu** — luôn giữ dạng chuỗi.
