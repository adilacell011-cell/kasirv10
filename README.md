# Alfath Pulsa Manajemen (AlfathPOS)

Aplikasi kasir & manajemen stok/transaksi untuk usaha pulsa multi-cabang.
Berjalan **sepenuhnya di server sendiri** (tanpa layanan cloud) memakai **Docker**.
Database, semua tabel, dan user awal dibuat **otomatis** saat pertama kali dijalankan.

- Frontend: Vite + React (dilayani nginx)
- Backend: Express + Prisma + Socket.IO
- Database: PostgreSQL
- Backup database otomatis ke folder `./backups`

---

## 1. Kebutuhan server

Cukup install **Docker** (sudah termasuk Docker Compose). Tidak perlu install Node.js,
database, atau lainnya — semua sudah dibungkus di dalam Docker.

- Linux (Ubuntu/Debian) — paling umum dipakai:
  ```bash
  curl -fsSL https://get.docker.com | sh
  ```
- Atau Windows/Mac: pasang **Docker Desktop** dari https://www.docker.com/products/docker-desktop

Cek Docker sudah aktif:
```bash
docker --version
docker compose version
```

---

## 2. Mengirim kode ke GitHub (dari Replit)

Repo GitHub sudah terhubung ke proyek ini. Ada **dua cara**, pilih salah satu.

### Cara A — lewat tombol (paling mudah, tanpa ngetik)
1. Di Replit, buka panel **Git** (ikon cabang di sisi kiri).
2. Tulis pesan singkat di kotak **Commit message** (misal: "update aplikasi").
3. Klik **Commit & Push**.

Selesai — kode otomatis masuk ke GitHub.

### Cara B — lewat terminal (Shell)
```bash
git add -A
git commit -m "update aplikasi"
git push origin main
```
Kalau diminta login, masukkan **username GitHub** dan **Personal Access Token**
(token dibuat di GitHub → Settings → Developer settings → Personal access tokens).

---

## 3. Memasang & menjalankan di server (dari GitHub)

Lakukan ini **di server** tempat aplikasi mau dipakai.

```bash
# 1) Ambil kode dari GitHub
git clone https://github.com/dmtshop20/AlpathPulsaPossas.git
cd AlpathPulsaPossas

# 2) Siapkan file pengaturan, lalu ubah password & secret-nya
cp .env.example .env
nano .env        # ganti POSTGRES_PASSWORD dan JWT_SECRET (lihat penjelasan di bawah)

# 3) Bangun & jalankan (proses pertama agak lama, sabar ya)
docker compose up -d --build
```

Setelah selesai, buka di browser:
```
http://ALAMAT-IP-SERVER:8080
```
(misal `http://192.168.1.10:8080`. Kalau di komputer yang sama: `http://localhost:8080`)

### Isi file `.env`
| Pengaturan | Arti | Saran |
|---|---|---|
| `POSTGRES_PASSWORD` | Password database | Ganti dengan kata sandi sendiri |
| `JWT_SECRET` | Kunci rahasia keamanan login | Isi teks acak panjang (≥ 32 karakter) |
| `WEB_PORT` | Alamat port aplikasi | Default `8080` |
| `BACKUP_INTERVAL_SECONDS` | Jeda backup otomatis | `21600` = tiap 6 jam |
| `BACKUP_KEEP_DAYS` | Lama backup disimpan | `14` hari |

> **Penting:** Jangan pakai password contoh. Ganti `POSTGRES_PASSWORD` dan `JWT_SECRET`
> sebelum dipakai sungguhan.

---

## 4. Login pertama kali

Akun bawaan dibuat otomatis:

| Peran | Username | Password |
|---|---|---|
| Admin (pemilik) | `admin` | `admin123` |
| Kasir | `cashier` | `cashier123` |

> **Segera ganti password** lewat menu di dalam aplikasi setelah login.

Hak akses per peran:
- **Admin** — akses penuh ke semua fitur.
- **Audit** — semua operasi stok di semua cabang (opname, transfer, voucher) + lihat laporan; tidak bisa kelola produk/cabang/user, refund, atau tarik komisi.
- **Kasir** — penjualan, tambah & transfer stok, refund — hanya untuk cabangnya sendiri.

---

## 5. Mengupdate aplikasi (versi baru dari GitHub)

Di server:
```bash
cd AlpathPulsaPossas
git pull
docker compose up -d --build
```
Data **tidak hilang** saat update — tersimpan aman di volume database.

---

## 6. Backup & restore database

- Backup berjalan **otomatis** ke folder `./backups` (sesuai jadwal di `.env`).
- **Penting:** salin folder `backups/` ke tempat lain (hard disk/cloud) secara berkala,
  karena kalau servernya rusak, backup di server yang sama ikut hilang.

Backup manual sekarang juga:
```bash
docker compose exec -T db pg_dump -U alfath -d alfath | gzip > backup-manual.sql.gz
```

Restore dari sebuah file backup:
```bash
gunzip -c backups/alfath-YYYYMMDD-HHMMSS.sql.gz | docker compose exec -T db psql -U alfath -d alfath
```

---

## 7. Perintah yang sering dipakai

```bash
docker compose ps                 # lihat status semua layanan
docker compose logs -f            # lihat log (Ctrl+C untuk keluar)
docker compose restart            # restart aplikasi
docker compose down               # matikan aplikasi (data tetap aman)
docker compose up -d              # nyalakan lagi
```

> Catatan: jangan pakai `docker compose down -v` — opsi `-v` akan **menghapus database**.

---

## 8. Kalau tidak bisa dibuka

- Pastikan port **8080** dibuka di firewall server:
  ```bash
  sudo ufw allow 8080
  ```
- Cek apakah semua layanan jalan: `docker compose ps` (semua harus `running`).
- Lihat pesan error: `docker compose logs -f`.
