# Lingora Chrome Extension

Extension Google Chrome để tra cứu từ điển và lưu từ vào bộ học liệu flashcard.

## Tính năng

- ✨ **Tra cứu từ nhanh**: Chọn từ hoặc cụm từ trên bất kỳ trang web nào để tra cứu
- 📚 **Lưu vào flashcard**: Lưu từ vào bộ học liệu để ôn tập sau
- 🎯 **Tích hợp hoàn chỉnh**: Kết nối với backend Lingora API
- 🔐 **Bảo mật**: Đăng nhập an toàn với tài khoản Lingora

## Cài đặt

### Bước 1: Tải extension

Extension đã được tạo trong thư mục `lingora-chrome-extension`.

### Bước 2: Cài đặt vào Chrome

1. Mở Chrome và truy cập `chrome://extensions/`
2. Bật **Developer mode** (góc trên bên phải)
3. Click **Load unpacked**
4. Chọn thư mục `lingora-chrome-extension`
5. Extension sẽ xuất hiện trong danh sách và thanh công cụ

### Bước 3: Đăng nhập

1. Click vào icon Lingora trên thanh công cụ Chrome
2. Nhập email và mật khẩu tài khoản Lingora
3. Click **Đăng nhập**

## Cách sử dụng

### Tra cứu từ đơn

1. Truy cập bất kỳ trang web nào (ví dụ: Wikipedia, báo tiếng Anh)
2. **Double-click** vào một từ để chọn
3. Click vào icon Lingora màu tím xuất hiện
4. Xem thông tin từ: phát âm, nghĩa, ví dụ, hình ảnh

### Tra cứu cụm từ

1. **Rê chuột** để chọn một cụm từ
2. Click vào icon Lingora màu tím xuất hiện
3. Xem bản dịch của cụm từ

### Lưu vào bộ học liệu

1. Sau khi tra cứu từ, click **Lưu vào bộ học liệu**
2. Chọn bộ học liệu có sẵn hoặc tạo mới
3. Từ sẽ được lưu thành flashcard

## Cấu trúc thư mục

```
lingora-chrome-extension/
├── manifest.json          # Cấu hình extension
├── background.js          # Service worker xử lý API
├── api.js                # Client API
├── content.js            # Script chạy trên trang web
├── content.css           # Style cho content script
├── popup.html            # Giao diện popup
├── popup.js              # Logic popup
├── popup.css             # Style popup
└── icons/                # Icons extension
    ├── icon16.png
    ├── icon48.png
    └── icon128.png
```

## API Endpoints

Extension sử dụng các endpoint sau từ Lingora backend:

- `POST /auth/login` - Đăng nhập
- `POST /auth/logout` - Đăng xuất
- `POST /auth/refresh-token` - Làm mới token
- `GET /words/dictionary?term={word}` - Tra cứu từ
- `POST /translate/phrase` - Dịch cụm từ
- `GET /studysets/own` - Lấy danh sách bộ học liệu
- `POST /studysets` - Tạo bộ học liệu mới
- `POST /studysets/{id}/flashcards` - Thêm flashcard

## Cấu hình

### 🔧 Cấu hình Môi trường (Environment)

Extension sử dụng **file cấu hình tập trung** để dễ dàng chuyển đổi giữa môi trường phát triển và production.

**Chỉ cần sửa MỘT file:** `config.js`

#### Môi trường Local (Development)

```javascript
// config.js - Dòng 15
const ENVIRONMENT = 'localhost';
```

Kết nối tới:
- Web App: `http://localhost:3000`
- Backend: `http://localhost:4000` (cấu hình trong `api.js`)

#### Môi trường Production (Deploy)

```javascript
// config.js - Dòng 15
const ENVIRONMENT = 'production';
```

Kết nối tới:
- Web App: `https://lingora-web-app.vercel.app`
- Backend: `https://lingora-be-dxce.onrender.com`

### Những gì tự động cập nhật

Khi bạn thay đổi `ENVIRONMENT` trong `config.js`, tất cả những thứ sau sẽ tự động cập nhật:

✅ Link "Mở trang bộ học liệu" trong popup từ điển  
✅ Nút "Mở ứng dụng web" trong popup  
✅ Link "Đăng ký ngay" ở trang login  
✅ Link "Mở trang bộ học liệu" ở trang login  
✅ Tất cả URL có `syncToken` để đồng bộ đăng nhập  

### Test trên Localhost

1. **Đặt môi trường về localhost:**
   ```javascript
   // config.js
   const ENVIRONMENT = 'localhost';
   ```

2. **Chạy web app:**
   ```bash
   cd lingora-web-app
   npm run dev
   ```
   Web app chạy trên `http://localhost:3000`

3. **Chạy backend:**
   ```bash
   cd Lingora\ BE
   npm run dev
   ```
   Backend chạy trên `http://localhost:4000`

4. **Reload extension:**
   - Vào `chrome://extensions/`
   - Click nút "Reload" trên extension Lingora

5. **Test:**
   - Mở popup extension
   - Đăng nhập
   - Click "Mở ứng dụng web"
   - Sẽ mở `http://localhost:3000/study-sets?syncToken=...`
   - User tự động đăng nhập

### Trước khi Deploy

**QUAN TRỌNG:** Trước khi push lên GitHub (sẽ tự động deploy):

1. Đổi môi trường về production:
   ```javascript
   // config.js
   const ENVIRONMENT = 'production';
   ```

2. Commit và push:
   ```bash
   git add config.js
   git commit -m "Chuyển sang môi trường production"
   git push
   ```

### Cấu hình Backend API

Mặc định, extension kết nối với backend tại `http://localhost:4000`. 

Để thay đổi URL backend, chỉnh sửa trong `api.js`:

```javascript
const API_CONFIG = {
  baseURL: 'http://localhost:4000', // Thay đổi URL tại đây
  timeout: 10000
};
```

Hoặc sử dụng backend production:

```javascript
const API_CONFIG = {
  baseURL: 'https://lingora-be-dxce.onrender.com',
  timeout: 10000
};
```

## Cài đặt từ Package (Dành cho người dùng)

Nếu bạn không cài đặt từ Chrome Web Store, hãy thực hiện các bước sau để sử dụng bản package thủ công:

### 1. Tải về và Giải nén
- Tải file nén extension (`.zip`) về máy tính của bạn.
- Giải nén file ra một thư mục (ví dụ: `lingora-extension`).

### 2. Mở Quản lý Extension
- Mở trình duyệt Chrome.
- Truy cập địa chỉ: `chrome://extensions/`
- Ở góc trên bên phải, hãy gạt công tắc **Chế độ dành cho nhà phát triển (Developer mode)** sang phía Bật.

### 3. Cài đặt Extension
- Nhấn vào nút **Tải tiện ích đã giải nén (Load unpacked)** ở góc trên bên trái.
- Chọn đúng thư mục `lingora-chrome-extension` mà bạn vừa giải nén.
- Extension Lingora sẽ xuất hiện trong danh sách.

### 4. Ghim Tiện ích (Khuyên dùng)
- Click vào biểu tượng **Mảnh ghép (Extensions)** trên thanh công cụ của Chrome.
- Nhấn vào biểu tượng **Ghim (Pin)** cạnh "Lingora Dictionary & Flashcard" để luôn thấy icon extension.

## Đồng bộ hóa Tài khoản

Extension sẽ tự động đồng bộ hóa trạng thái đăng nhập với trang web [lingora-web-app.vercel.app](https://lingora-web-app.vercel.app).
- Bạn chỉ cần đăng nhập trên trang web, extension sẽ tự động đăng nhập theo.
- Mọi từ vựng bạn lưu từ extension sẽ xuất hiện ngay trong bộ học liệu trên web.

## Troubleshooting

### Extension không hiện nút tra cứu
- Hãy thử F5 (tải lại) trang web bạn đang xem.
- Kiểm tra xem bạn đã đăng nhập chưa (click vào icon extension để xem).
- Một số trang web đặc biệt có thể chặn script, hãy thử ở các trang khác như Wikipedia, VNExpress.

### Không lưu được từ
- Kiểm tra kết nối Internet.
- Đảm bảo bạn đã chọn bộ học liệu trong danh sách.

### Không tra cứu được từ

1. Đảm bảo đã đăng nhập
2. Kiểm tra kết nối internet
3. Kiểm tra backend API đang hoạt động

### Không lưu được flashcard

1. Đảm bảo đã đăng nhập
2. Kiểm tra quyền truy cập API
3. Xem Console để biết lỗi chi tiết

## Development

### Debugging

1. **Background script**: `chrome://extensions/` → Click "service worker" để mở DevTools
2. **Content script**: Mở DevTools (F12) trên trang web bất kỳ
3. **Popup**: Right-click icon extension → Inspect popup

### Testing

1. Test trên nhiều trang web khác nhau
2. Test với từ đơn và cụm từ
3. Test tạo bộ học liệu mới
4. Test lưu vào bộ học liệu có sẵn

## License

Copyright © 2026 Lingora Team
#   l i n g o r a - c h r o m e - e x t e n s i o n 

 
