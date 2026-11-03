---
name: Akun kasir bersama per cabang
description: Satu akun cabang dipakai dua karyawan bergantian pada shift siang dan malam.
---

Alur kasir sekarang: satu akun cabang dipakai oleh dua karyawan untuk shift siang dan malam.

**Why:** Pengguna menjelaskan bahwa ini adalah alur operasional saat ini.

**How to apply:** Jangan mengasumsikan satu akun untuk setiap karyawan, mengubah login menjadi akun terpisah, atau menggunakan ID akun sebagai pembeda karyawan/shift. Pertahankan alur akun bersama dan bedakan sesi shift melalui catatan shift, cabang, serta waktu buka/tutup. Perubahan kode tetap memerlukan persetujuan pengguna.

## Identitas yang terlihat pada kartu kasir

Tampilkan akun cabang, nama cabang, dan petugas shift aktif sebagai informasi terpisah. Bila shift belum terbuka, jangan menampilkan nama akun seolah-olah itu penjaga yang sedang bertugas.

**Why:** Owner meminta ketiga identitas ini terlihat jelas setelah menemukan kartu akun dan nama petugas bertumpuk pada tampilan ponsel.

**How to apply:** Gunakan identitas akun bersama dari profil, nama cabang yang terikat ke akun, dan nama penjaga pilihan shift hanya saat shift aktif. Jangan mengubah login bersama atau alur pencatatan shift.

## Pembukaan shift tanpa modal awal

Pembukaan shift TIDAK menggunakan modal awal. Kasir tidak perlu memasukkan uang modal saat membuka shift. Jangan mencari atau mengasumsikan adanya input modal awal, dan jangan menambahkan fitur modal awal.

**Why:** Pengguna menegaskan bahwa ini adalah aturan aplikasi kasir yang sebenarnya setelah skenario pengujian sebelumnya keliru mengasumsikan input modal awal.

**How to apply:** Ikuti mekanisme pembukaan shift yang sudah diterapkan pada aplikasi saat ini. Ekspektasi pengujian harus mengikuti aturan tanpa modal awal, bukan mengubah aplikasi agar memenuhi asumsi pengujian.

## Lanjutkan shift karena tidak sengaja ditutup

Owner menjelaskan bahwa “Lanjutkan Shift” digunakan ketika penjaga tidak sengaja menutup shift sementara waktu kerja atau pergantian masih panjang. Transaksi sebelum dan sesudah dilanjutkan digabung dengan pembukuan shift semula, bukan dibuat pembukuan shift baru.

**Why:** Owner secara eksplisit memilih “Gabung dengan shift semula”.

**How to apply:** Pertahankan tujuan pemulihan shift yang sama. Jangan mengubahnya menjadi pergantian penjaga atau shift baru. Pilihan pembukuan ini tidak dengan sendirinya memberi izin perubahan schema, migrasi, atau penghapusan histori penutupan.

## Aplikasi ditutup atau server restart

Owner menghendaki transaksi yang sudah tersimpan tetap aman, identitas penjaga dan shift aktif tetap berlanjut, serta restart server tidak meminta kasir login kembali.

**Why:** Ini kebutuhan operasional yang dinyatakan Owner.

**How to apply:** Bedakan pemulihan shift yang masih terbuka setelah aplikasi ditutup/restart dari “Lanjutkan Shift” setelah salah tutup. Jangan menjanjikan pemulihan transaksi yang belum commit atau sesi tanpa batas waktu hanya dari kebutuhan tahan restart.