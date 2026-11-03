# Alfath Pulsa Manajemen (AlfathPOS)

Aplikasi kasir dan manajemen stok/transaksi untuk usaha pulsa multi-cabang.
Berjalan di server sendiri memakai Docker, dengan PostgreSQL sebagai penyimpanan.

- Frontend: Vite + React (dilayani nginx)
- Backend: Express + Prisma + Socket.IO
- Database: PostgreSQL
- Backup berkala ke folder host `./backups`

API memeriksa target database saat startup. Startup tidak menjalankan migrasi,
seed, arsip, atau backfill otomatis.

---

## 1. Kebutuhan server

Install Docker dan Docker Compose pada host Linux atau sistem yang mendukung
container. Pastikan image aplikasi tersedia untuk arsitektur host yang dipakai.

---

## 2. Mengirim kode ke GitHub

Sebelum push, tinjau seluruh commit dan file yang akan dikirim. Jangan masukkan
file `.env`, kredensial, dump database, backup, log, atau data pelanggan.

Repository proyek:

```text
https://github.com/adilacell011-cell/kasirv10
```

---

## 3. Persiapan Dockge/VPS

Gunakan `compose.dockge.yaml` dari repository di atas. Compose membangun API
dan frontend dari branch `main`; push kode yang sudah ditinjau sebelum
menjalankan build di server.

Isi variabel yang diwajibkan di Dockge berdasarkan `.env.example`. Nilai
`DATABASE_URL` harus menunjuk ke service dan database yang sama dengan
`POSTGRES_USER`, `POSTGRES_PASSWORD`, dan `POSTGRES_DB`. Nilai `DB_EXPECTED_*`
harus cocok dengan target tersebut. Jangan menggunakan URL database Replit,
STB, atau VPS lain secara tidak sengaja.

`JWT_SECRET` harus berupa nilai acak kuat, unik untuk instalasi, dan tidak
boleh disimpan di Git. Compose gagal dibuat bila nilai wajib belum diisi.

Variabel `INITIAL_ADMIN_*` dan `INITIAL_CASHIER_*` hanya untuk proses bootstrap
akun awal yang disetujui. Tidak ada kredensial bawaan. Jangan menjalankan seed
pada database yang sudah berisi data tanpa prosedur yang ditinjau. Hapus nilai
bootstrap dari konfigurasi Dockge setelah proses yang disetujui selesai.

Web container memublikasikan HTTP pada port `WEB_PORT` (default 8080). Untuk
akses internet, tempatkan di belakang reverse proxy HTTPS dan jangan membuka
akses database PostgreSQL ke publik.

---

## 4. Akun dan hak akses

Tidak ada username atau password default yang aman untuk dipakai. Buat akun
awal dengan kredensial yang dipilih Owner melalui prosedur bootstrap yang
terkontrol. Akun cabang tetap mengikuti model akun bersama yang digunakan
aplikasi.

API memeriksa status dan versi akun dari database pada permintaan serta
koneksi Socket.IO. Mengubah data akun akan mencabut sesi lama dan meminta
login kembali; restart API saja tidak mencabut sesi selama database dan
`JWT_SECRET` tetap sama.

Hak akses mengikuti implementasi aplikasi:

- **Admin** — akses administratif sesuai hak yang tersedia.
- **Audit** — pemeriksaan stok/laporan sesuai otorisasi aplikasi.
- **Kasir** — operasional cabangnya sesuai shift dan aturan aplikasi.

---

## 5. Pembaruan aplikasi

Pembaruan VPS harus dilakukan setelah perubahan kode ditinjau, diuji pada
lingkungan terpisah, dan mendapat persetujuan Owner. Jangan menjalankan
migrasi, seed, archive, atau backfill sebagai bagian dari pembaruan tanpa
persetujuan dan rencana pemulihan yang terpisah.

Volume `pgdata` menyimpan database saat container diperbarui. Ini bukan
pengganti backup teruji.

---

## 6. Backup dan pemulihan

- Backup terjadwal disimpan ke bind mount `./backups`.
- Backup dan database berada pada host yang sama; kerusakan atau kehilangan
  host dapat menghilangkan keduanya.
- Salin backup terenkripsi ke lokasi off-host yang terpisah dan pantau hasil
  backup.
- Script memeriksa status `pg_dump`, kompresi, file tidak kosong, dan validitas
  gzip sebelum menerbitkan file akhir.

Backup manual:

```bash
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  | gzip > backup-manual.sql.gz
```

Pulihkan terlebih dahulu ke database QA yang benar-benar terpisah. Cocokkan
data dan uji aplikasi sebelum menyetujui cutover. Jangan mengalirkan dump
langsung ke database produksi aktif: opsi pembersihan pada dump dapat
menghapus atau mengganti objek database.

---

## 7. Perintah operasional umum

```bash
docker compose ps
docker compose logs -f
docker compose restart
docker compose down
docker compose up -d
```

Jangan gunakan `docker compose down -v`; opsi `-v` menghapus volume database.

---

## 8. Pengamanan akses

- Gunakan HTTPS melalui reverse proxy.
- Batasi akses jaringan ke host dan port yang memang diperlukan.
- Jangan memublikasikan port database.
- Simpan `.env` di server, dengan izin file terbatas, dan jangan commit ke Git.
- Uji backup serta restore pada target QA secara berkala.
