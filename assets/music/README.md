# Nhạc nền (Music Bed)

Thả các file nhạc nền **royalty-free / CC0** vào thư mục này (`.mp3`, `.wav`, `.m4a`, `.aac`, `.ogg`).

Pipeline sẽ:
- Tự chọn 1 track **cố định theo tiêu đề video** (render lại không đổi nhạc)
- Loop + cắt đúng độ dài video, fade in/out
- **Tự động duck** (nén nhỏ) khi giọng đọc nói — nhạc chỉ "thở" giữa các câu

## Điều khiển

| Cách | Tác dụng |
|---|---|
| `MUSIC_ENABLED=0` trong `.env` | Tắt nhạc nền toàn cục |
| `MUSIC_VOLUME=0.16` trong `.env` | Âm lượng mặc định (0–1, trước khi duck) |
| `MUSIC_FILE=/path/to/file.mp3` | Ép dùng đúng 1 file cho mọi video |
| `"music": { "name": "tension-bed" }` trong script.json | Chọn file cụ thể trong thư mục này |
| `"music": { "name": "none" }` trong script.json | Tắt nhạc cho riêng video đó |
| `"music": { "volume": 0.2 }` | Chỉnh âm lượng cho riêng video đó |

## Gợi ý nguồn nhạc miễn phí (news/tension/dramatic)

- Pixabay Music (CC0): https://pixabay.com/music/search/breaking%20news/
- YouTube Audio Library (miễn phí, xem điều kiện từng track)
- Kevin MacLeod / incompetech (CC-BY — cần ghi nguồn trong mô tả video)

Gợi ý mood hợp kênh tin crypto: *breaking news*, *tension pulse*, *dark ambient*, *cinematic percussion*.

> Thư mục trống → pipeline bỏ qua nhạc nền (không lỗi).
