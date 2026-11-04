# Startup API dan perlindungan database

## Startup normal

Urutan: validasi lingkungan/target → koneksi → SELECT metadata kompatibilitas →
listen. Tidak ada DDL, seed, backfill, pengarsipan maupun timer arsip.
`/api/health` dan `/api/healthz` memeriksa database dan schema. Semua request
`/api` lainnya melewati pemeriksaan yang sama; gagal berarti HTTP 503 sebelum
handler bisnis dijalankan. Pemeriksaan yang bersamaan berbagi satu probe,
tetapi hasil sukses tidak dicache lintas request.

Pemeriksaan schema mengikuti datamodel Prisma yang dibangun: tabel/kolom,
tipe, nullability, indeks unik, serta foreign key dan aksi relasinya. Ini
bukan migrasi dan bukan pemeriksaan seluruh default, trigger atau indeks performa.
Schema yang tidak kompatibel tidak diperbaiki otomatis.

## Target database

- Wajib `DB_RUNTIME_ENV=development`, `test`, atau `production`.
- Production wajib konsisten dengan `NODE_ENV=production`; lingkungan nonproduksi
  ditolak bila `NODE_ENV=production`.
- Development/test wajib cocok dengan `PGHOST`, `PGDATABASE`, `PGPORT` yang
  independen dari DATABASE_URL. Development Replit memakai target PG* terkelola.
- Production wajib `DB_EXPECTED_HOST`, `DB_EXPECTED_NAME`, `DB_EXPECTED_PORT`.
- `DB_EXPECTED_SCHEMA` default `public`. Override host/nama/port eksplisit juga
  harus cocok; tidak dapat mengabaikan target PG* development/test.
- Parameter URL yang dapat mengalihkan host dan parameter yang tidak dikenal
  ditolak. URL/password tidak ditampilkan dalam kegagalan startup.

Konfigurasi produksi/VPS tidak diubah oleh pekerjaan ini. Operator harus
menyiapkan nilai ekspektasi target sebelum menggunakan versi ini di VPS.
Startup akan menolak konfigurasi lama yang belum lengkap. Jangan menyalin
DATABASE_URL produksi ke development atau menggunakan ekspektasi produksi untuk tes.
Identitas host/nama bukan bukti isi data: operator tetap harus memastikan DNS,
volume, kredensial, dan database yang dipilih benar.

Docker Compose memiliki layanan satu-kali `schema-init` yang menunggu PostgreSQL
healthy dan berjalan sebelum API. Layanan ini memakai `db:init-schema` yang sama
dengan provisioning manual; ia bukan `prisma db push` startup tanpa guard.

Pada target Compose yang diizinkan (`db:5432/kasirv10` atau
`db:5432/kasirv10_staging`, schema `public`) proses:

1. Memastikan identitas koneksi sama persis dengan `SCHEMA_INIT_AUTO_TARGET`.
2. Mengambil advisory lock agar dua proses inisialisasi tidak berjalan bersamaan.
3. Membuat schema hanya jika target benar-benar kosong.
4. Melewati DDL bila schema yang ada sudah kompatibel dengan datamodel Prisma.
5. Berhenti tanpa perubahan jika schema berisi objek tetapi tidak lengkap atau
   tidak kompatibel. Jangan menghapus objek atau mengulang provisioning paksa;
   periksa target dan siapkan pemulihan terpisah.
6. Setelah layanan init sukses, API entrypoint menjalankan pemeriksaan baca-saja
   `dist/database-check-cli.mjs` sebelum membuka port. API tidak menjalankan DDL.

Compose menetapkan database internal sendiri (`db`) dan mengunci nama target
yang didukung; host jarak jauh, nama database lain, schema lain, atau allowlist
yang tidak cocok ditolak. PostgreSQL harus sehat sebelum layanan init mulai.
Schema init tidak membuat akun, cabang, transaksi, atau data contoh. Bootstrap
Owner tetap manual menggunakan prosedur di bawah.

Perintah manual `db:init-schema` tetap meminta `--execute`,
`--acknowledge-empty-schema`, dan persetujuan target yang persis. Alias `db:push`
tetap menunjuk wrapper yang sama; jangan memanggil Prisma CLI langsung. Hook
post-merge hanya memasang dependensi. `prisma generate` hanya menghasilkan
klien dan tidak mengubah schema database.

## Pemeriksaan baca-saja

Dengan lingkungan target yang sudah dikonfigurasi:

    pnpm --filter @workspace/api-server run db:check

Di image yang sudah dibangun:

    node artifacts/api-server/dist/database-check-cli.mjs

## Administrasi terpisah, tidak otomatis

`db:admin` dan entrypoint seed lama menolak eksekusi tanpa persetujuan spesifik
operasi, lingkungan, host, port, nama database dan schema.

Format (placeholder, bukan instruksi untuk langsung menjalankan):

    pnpm --filter @workspace/api-server run db:admin <bootstrap-owner|seed|backfill|archive> \
      --execute --acknowledge-legacy-risks \
      --approve=<operasi>:<lingkungan>:<host>:<port>/<database>/<schema>

Image juga menyediakan `dist/maintenance-main.mjs`. Jangan menjalankannya tanpa
persetujuan pemilik dan backup yang diverifikasi. Gate persetujuan diperiksa
sebelum koneksi; schema diperiksa tanpa perubahan sebelum operasi dijalankan.
Advisory lock menolak pekerjaan admin lain yang menggunakan mekanisme yang sama.
Lock dan seluruh operasi memakai transaksi/koneksi yang sama; kegagalan atau
timeout membatalkan transaksi. Tidak ada retry otomatis.

Perilaku lama yang dipertahankan:

- `bootstrap-owner`: operasi manual terpisah untuk bootstrap awal staging.
  Memerlukan `STAGING_OWNER_USERNAME` dan `STAGING_OWNER_PASSWORD`, menolak
  jika sudah ada akun ADMIN atau username yang sama, lalu membuat satu akun
  ADMIN dengan `branchId` null dan memastikan GlobalConfig memakai default
  `allowCashierStockInput=true`. Operasi ini tidak membuat cabang atau akun
  Kasir. Owner membuat cabang dan akun cabang melalui aplikasi setelah login.
  Selain `--approve`, bootstrap juga mewajibkan `STAGING_OWNER_BOOTSTRAP_TARGET`
  dengan format `<environment>:<host>:<port>/<database>/<schema>` yang cocok
  persis dengan target tervalidasi. Hanya Compose staging yang mengisi
  allowlist ini; Compose Dockge reguler tidak menyediakannya. Perubahan keliru
  pada `DATABASE_URL` atau `DB_EXPECTED_*` saja akan ditolak sebelum koneksi
  atau penulisan. Tetap periksa target dan persetujuan secara manual sebelum
  menjalankan perintah. Nilai environment `production` pada allowlist staging
  hanya menandakan mode runtime Node; target databasenya tetap
  `db:5432/kasirv10_staging/public`. Nama database juga harus memiliki segmen
  `staging`, `stage`, `qa`, atau `test`; nama produksi biasa tanpa penanda itu
  ditolak meskipun allowlist ikut salah diatur.
- `seed`: hanya operasi manual dengan gate persetujuan. Harus diberi
  `INITIAL_ADMIN_USERNAME`, `INITIAL_ADMIN_PASSWORD`, `INITIAL_CASHIER_USERNAME`,
  dan `INITIAL_CASHIER_PASSWORD`; tidak ada kredensial bawaan. Upsert tidak
  menimpa akun yang sudah ada. Hapus variabel bootstrap setelah penggunaan
  yang disetujui. Seed tidak memanggil backfill.
- `backfill`: menjumlahkan transaksi sukses tersimpan per cabang/hari WIB 06:00,
  lalu menetapkan nilai ringkasan. Masih berisiko menimpa rekap yang sudah
  mencakup arsip bila sumber tidak lengkap. Perlu audit rekonsiliasi terpisah.
- `archive`: ambang 30 hari, rumus, pelepasan relasi komisi/voucher dan
  penghapusan SaleItem/Sale tetap sama. Ini operasi destruktif yang kini hanya
  tersedia secara manual. Belum dijamin aman terhadap transaksi/refund aktif
  atau alat lama yang tidak mengikuti advisory lock.

Tidak ada fungsi pemeliharaan atau perintah mutasi ini yang perlu dijalankan
untuk restart normal pada database kompatibel yang sudah diinisialisasi.
Alat langsung `prisma db push`, migrasi, Drizzle push dan SQL administratif
masih dapat mengubah database bila operator menjalankannya sendiri; gate
aplikasi tidak membatasi orang yang memegang kredensial database.

## Pengujian

    pnpm --filter @workspace/api-server run test:startup

Integrasi hanya di Replit development terisolasi, dengan akun QA yang sudah
tersedia (tanpa pembuatan/penghapusan fixture):

    pnpm --filter @workspace/api-server run build
    RUN_STARTUP_INTEGRATION=1 pnpm --filter @workspace/api-server run test:startup:integration

Integrasi memeriksa target, startup salah URL, database tidak tersedia, schema
hilang tanpa DDL, readiness, login/GET terisolasi, dan fingerprint seluruh tabel
sebelum/sesudah. Tidak menjalankan maintenance nyata atau transaksi kasir.
Uji maintenance memakai fake database di memori saja.
