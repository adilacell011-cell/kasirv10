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

API memeriksa status dan versi keamanan akun dari database pada permintaan serta
koneksi Socket.IO. Perubahan password, status, role, atau cabang mencabut sesi
lama. Perubahan nama akun/daftar penjaga tidak mencabut sesi maupun memutus
Socket.IO. Restart API saja tidak mencabut sesi selama database dan
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
- `docker/db-backup.sh` memeriksa status `pg_dump` dan `gzip` secara terpisah,
  validitas gzip, penanda awal/akhir dump SQL, dan ukuran hasil sebelum
  menerbitkan file akhir secara atomik. Kegagalan dicatat tanpa mencetak
  credential. Backup otomatis bukan bukti bahwa restore berhasil.
- Backup off-host **belum dikonfigurasi**. Rancangan yang disarankan: salin
  hanya file backup yang telah selesai ke repository Restic terenkripsi pada
  object storage terpisah, gunakan credential khusus backup dengan hak minimum,
  simpan secret melalui secret manager/credential file berizin terbatas, dan
  pantau waktu backup serta upload sukses terakhir. Jangan menaruh credential
  provider di Git, Compose, atau log. Aktifkan retensi remote hanya setelah
  restore QA berkala berhasil; konfigurasi provider dan credential sengaja
  belum dibuat karena tujuan storage belum dipilih.

Backup satu kali dengan konfigurasi `docker-compose.yml` (database harus sudah
berjalan). Mode ini memakai validasi dan file sementara yang sama dengan backup
terjadwal:

```bash
docker compose run --rm --no-deps -e BACKUP_ONCE=1 backup
```

### Restore manual dengan target terjaga

`docker/db-restore.sh` secara default hanya melakukan dry-run baca-saja. Target
host, port, database, dan schema harus diberikan eksplisit dan harus sama dengan
allowlist `RESTORE_ALLOWED_HOST`, `RESTORE_ALLOWED_PORT`, `RESTORE_ALLOWED_DB`,
dan `RESTORE_ALLOWED_SCHEMA`. Pemeriksaan menghubungkan ke target, memeriksa
identitas koneksi, memastikan schema ada, dan menolak database yang sudah berisi
objek aplikasi. Arsip juga diperiksa dengan `gzip -t`, penanda dump lengkap,
serta penolakan perintah `CREATE DATABASE`, `DROP DATABASE`, atau `\connect`.

Contoh berikut hanya pola QA dan **bukan perintah untuk database aktif**.
Jalankan dry-run dahulu dari runner QA yang memiliki `psql` dan `gzip`; sediakan
kredensial melalui mekanisme libpq/secret manager, bukan argumen command line:

```bash
export RESTORE_ALLOWED_HOST='<QA_HOST>'
export RESTORE_ALLOWED_PORT='<QA_PORT>'
export RESTORE_ALLOWED_DB='<QA_DATABASE>'
export RESTORE_ALLOWED_SCHEMA='<QA_SCHEMA>'
export PGUSER='<QA_RESTORE_USER>'
# PGPASSWORD/PGPASSFILE harus disediakan dari secret manager, jangan dicetak.

sh docker/db-restore.sh \
  --backup '<PATH_TO_VERIFIED_BACKUP.sql.gz>' \
  --target-host "$RESTORE_ALLOWED_HOST" \
  --target-port "$RESTORE_ALLOWED_PORT" \
  --target-db "$RESTORE_ALLOWED_DB" \
  --target-schema "$RESTORE_ALLOWED_SCHEMA"
```

Restore SQL hanya berjalan jika ditambahkan `--execute` dan persetujuan target
eksplisit dalam format `restore:HOST:PORT/DB/SCHEMA`. Script mengulang pemeriksaan
identitas dan memastikan database masih kosong tepat sebelum restore. Dump
diproses dalam satu transaksi sehingga kegagalan SQL membatalkan restore.
Pulihkan ke database QA kosong yang benar-benar terpisah, cocokkan data dan uji
aplikasi sebelum menyetujui cutover. Jangan mengalirkan dump ke database aktif:
backup lama yang dibuat dengan `--clean` dapat berisi perintah penghapusan objek.

Uji backup/restore lokal yang membuat PostgreSQL sementara terisolasi:

```bash
bash docker/backup-restore.test.sh
```

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
