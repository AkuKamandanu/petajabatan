# Peta Jabatan Organisasi — Aplikasi Statis + Excel

Aplikasi web satu halaman (tanpa server, tanpa proses *build*) untuk membuat dan
mengelola bagan/struktur organisasi. "Database"-nya adalah satu berkas **Excel
(.xlsx)** dengan format sederhana, yang bisa:

- **Diimpor/diekspor secara manual** — cocok untuk kerja offline murni.
- **Disimpan otomatis di peramban (localStorage)** — perubahan tidak hilang
  saat menutup tab, walau tanpa internet.
- **Ditarik/didorong langsung ke repositori GitHub** lewat GitHub REST API —
  sehingga GitHub berfungsi sebagai "database online" tanpa perlu membangun
  server atau backend sendiri.

Karena seluruhnya HTML/CSS/JS murni (memakai [SheetJS](https://sheetjs.com/)
lewat CDN untuk baca-tulis Excel), aplikasi ini bisa langsung di-*deploy* ke
**GitHub Pages**.

---

## 1. Struktur berkas

```
org-chart-app/
├── index.html
├── css/
│   └── style.css
├── js/
│   ├── store.js          # state + localStorage
│   ├── xlsx-io.js         # baca/tulis .xlsx (SheetJS)
│   ├── github-sync.js     # tarik/dorong ke GitHub Contents API
│   ├── chart-render.js    # render pohon bagan (CSS murni, tanpa library chart)
│   └── app.js             # perekat UI + event
├── data/
│   └── struktur-organisasi.xlsx   # contoh data awal
└── README.md
```

## 2. Format data Excel

Satu sheet bernama **`Struktur Organisasi`** dengan kolom berikut (baris pertama = header):

| Kolom        | Wajib | Keterangan                                              |
|--------------|:-----:|----------------------------------------------------------|
| `ID`         | ✔     | Kode unik simpul, bebas format (mis. `D001`)               |
| `Jabatan`    | ✔     | Nama jabatan/posisi                                         |
| `Atasan_ID`  |       | `ID` dari atasan langsung — **kosong** berarti jabatan puncak |
| `Keterangan` |       | Catatan bebas (opsional), mis. status atau rangkap jabatan  |
| `Bezetting`  |       | Catatan jumlah pengisi jabatan (opsional), mis. `2 dari 3 formasi` |
| `Kategori`   |       | Kosongkan untuk jabatan struktural biasa. Isi `Pelaksana` atau `Jabatan Fungsional` agar jabatan ini dikelompokkan terpisah (lihat bagian 8). |
| `Orientasi_Cabang` |  | Kosongkan untuk ikuti default bagan. Isi `Vertikal` atau `Horizontal` untuk memaksa arah tampilan anak-anak jabatan ini (lihat bagian 9). |
| `Susunan_Sendiri` |   | Kosongkan untuk ikuti pengaturan atasan. Isi `Vertikal` atau `Horizontal` agar jabatan INI SENDIRI (bukan anaknya) tampil sesuai pilihan ini di antara saudara-saudaranya, menimpa pengaturan atasan (lihat bagian 9). |

Hanya **Jabatan** yang wajib diisi saat menambah/menyunting simpul lewat
aplikasi — **Keterangan**, **Bezetting**, dan **Kategori** murni opsional.
Aplikasi ini memetakan **struktur jabatan**, bukan data nama orang per orang.

Contoh data ada di `data/struktur-organisasi.xlsx`. Berkas ini **hanya
contoh awal** — aplikasi tidak membacanya secara otomatis; impor lewat
tombol "Impor Excel" atau simpan berkas ini ke repo GitHub Anda lalu tarik
lewat fitur sinkronisasi GitHub (lihat bagian 4).

## 3. Menjalankan secara lokal

Karena hanya HTML/CSS/JS statis, cukup buka `index.html` di peramban, **atau**
jalankan server statis sederhana (disarankan, agar `fetch` ke GitHub API
tidak terkena pembatasan `file://`):

```bash
cd org-chart-app
python3 -m http.server 8000
# buka http://localhost:8000
```

## 4. Men-deploy ke GitHub Pages

1. Buat repositori baru di GitHub, lalu unggah seluruh isi folder ini
   (lewat `git push` atau unggah manual di web GitHub).
2. Di repo, buka **Settings → Pages**.
3. Pada **Build and deployment → Source**, pilih **Deploy from a branch**.
4. Pilih branch `main` dan folder `/ (root)`, lalu **Save**.
5. Tunggu 1–2 menit, GitHub akan memberi URL seperti:
   `https://<username>.github.io/<nama-repo>/`

Aplikasi langsung bisa dipakai dari URL tersebut — tidak ada langkah build
apa pun yang diperlukan.

## 5. Cara kerja mode offline vs online

### Offline (tanpa internet / tanpa akun GitHub)
- **Impor Excel**: unggah berkas `.xlsx` yang sudah ada, datanya langsung
  masuk ke bagan.
- **Ekspor Excel**: mengunduh kondisi bagan saat ini sebagai `.xlsx` baru —
  ini yang dibagikan/disimpan sebagai arsip offline.
- Setiap perubahan (tambah/sunting/hapus jabatan) otomatis tersimpan di
  **localStorage peramban**, sehingga tetap ada walau koneksi internet putus
  atau tab ditutup dan dibuka lagi di perangkat yang sama.

### Online (sinkron lewat GitHub)
- Buka **⚙ Pengaturan GitHub**, isi:
  - **Owner/Repo**: pemilik dan nama repositori tempat berkas Excel disimpan
    (boleh repo yang sama dengan aplikasi, atau repo data terpisah).
  - **Branch**: biasanya `main`.
  - **Path Berkas**: lokasi file di repo, mis. `data/struktur-organisasi.xlsx`.
  - **Personal Access Token (PAT)**: token GitHub dengan izin baca-tulis ke
    repo tersebut (lihat bagian 6).
- **↓ Tarik dari GitHub**: mengambil `.xlsx` terbaru dari repo dan memuatnya
  ke bagan (menimpa data yang sedang tampil).
- **↑ Simpan ke GitHub**: menulis kondisi bagan saat ini sebagai commit baru
  ke repo — ini membuat repo GitHub berfungsi sebagai "database" bersama
  yang bisa diakses dari perangkat/pengguna lain dengan token yang sesuai.
- **🔁 Sinkron Otomatis**: aktifkan agar tarik/simpan di atas terjadi
  **otomatis**, tanpa perlu klik manual setiap kali (lihat bagian 5a
  di bawah — ini yang membuat perubahan di satu komputer bisa muncul
  sendiri di komputer orang lain yang membuka halaman yang sama).

Dengan pola ini, tim bisa bekerja **offline** (edit lokal, ekspor Excel,
kirim manual) maupun **online** (semua orang tarik/dorong ke repo GitHub
yang sama) sesuai kebutuhan — dan localStorage selalu jadi jaring pengaman
di perangkat masing-masing.

### 5a. 🔁 Sinkron Otomatis — perubahan muncul sendiri di komputer orang lain

Secara bawaan, "Tarik dari GitHub" dan "Simpan ke GitHub" harus diklik
manual. Kalau ingin perubahan pada bagan **otomatis** terkirim ke GitHub
Pages dan **otomatis** terlihat oleh orang lain yang membuka halaman
tersebut — tanpa siapa pun perlu klik apa-apa — aktifkan tombol
**🔁 Sinkron Otomatis** di toolbar (perlu Pengaturan GitHub sudah diisi
lebih dulu). Setelah aktif:

- **Auto-simpan (push)**: setiap kali Anda mengubah bagan (tambah,
  sunting, hapus, dst.), perubahan itu otomatis terkirim ke GitHub
  beberapa detik setelah Anda berhenti mengetik/mengklik — beberapa
  perubahan beruntun digabung jadi satu kali kirim, bukan satu kali
  kirim per klik.
- **Auto-tarik (pull)**: selama tab/halaman ini terbuka, aplikasi
  memeriksa GitHub secara berkala. Begitu ada versi baru (dari Anda
  sendiri di perangkat lain, atau dari rekan kerja), bagan yang sedang
  dilihat **otomatis diperbarui** — tanpa perlu me-refresh halaman atau
  klik apa pun. Notifikasi kecil akan muncul saat ini terjadi.
- Saat halaman **baru dibuka** dengan Sinkron Otomatis dalam keadaan
  aktif (tersimpan dari kunjungan sebelumnya), aplikasi langsung menarik
  versi terbaru terlebih dahulu — jadi pengunjung baru langsung melihat
  data terkini, bukan versi lama.

**Penting untuk dipahami** — ini tetap situs statis di GitHub Pages
(tanpa server/WebSocket), jadi "otomatis" di sini berarti *tanpa perlu
klik manual*, bukan realtime instan seperti Google Docs:
- Pembaruan terlihat dalam hitungan detik (untuk perubahan sendiri) atau
  sekitar 25 detik (untuk menerima perubahan orang lain) — bukan seketika.
- Orang lain tetap perlu **tab-nya dalam keadaan terbuka** (atau memuat
  ulang halamannya) untuk menerima pembaruan; halaman GitHub Pages yang
  di-*cache* peramban tidak otomatis "mendorong" data ke perangkat yang
  sedang tidak terbuka.
- Sinkron otomatis memakai kuota GitHub API (dengan token terautentikasi,
  batasnya 5.000 permintaan/jam — jauh lebih dari cukup untuk penggunaan
  wajar, karena hanya memeriksa ringan setiap ~25 detik).
- Aturan "yang terakhir menyimpan yang menang" (lihat bagian 11) tetap
  berlaku — kalau dua orang mengedit persis di saat bersamaan, perubahan
  yang terkirim belakangan akan menimpa yang sebelumnya.

## 6. Membuat Personal Access Token (PAT) GitHub

Disarankan memakai token **fine-grained** yang dibatasi hanya untuk satu
repositori:

1. GitHub → foto profil → **Settings → Developer settings →
   Personal access tokens → Fine-grained tokens → Generate new token**.
2. **Repository access**: pilih *Only select repositories* → pilih repo
   data Anda.
3. **Permissions → Repository permissions → Contents**: atur ke
   **Read and write**.
4. Generate, salin token, tempel di kolom **Personal Access Token** pada
   Pengaturan GitHub aplikasi ini.

> ⚠️ **Peringatan keamanan**: token disimpan hanya di `localStorage`
> peramban perangkat Anda dan hanya dikirim ke `api.github.com` melalui
> HTTPS — tidak pernah ke server pihak ketiga mana pun (aplikasi ini tidak
> punya backend). Namun karena tersimpan di peramban:
> - Jangan simpan token di perangkat/peramban bersama atau publik.
> - Gunakan token dengan izin sesempit mungkin (satu repo, *Contents* saja).
> - Cabut (*revoke*) token kapan saja dari halaman Developer settings GitHub
>   bila dicurigai bocor.

## 7. Fitur aplikasi

- Tambah/sunting/hapus jabatan lewat formulir modal.
- Penghapusan simpul yang punya bawahan akan memindahkan bawahan tersebut
  ke atasan dari simpul yang dihapus (bukan ikut terhapus).
- Pencarian nama/jabatan/departemen menyorot simpul yang cocok.
- Ciutkan/perluas cabang per simpul untuk bagan besar.
- Perbesar/perkecil kanvas, alat geser (✋) untuk menggeser tampilan ke segala arah, dan tombol ▦ untuk menampilkan/menyembunyikan garis grid latar (preferensi tersimpan otomatis).
- **Orientasi per cabang** — setiap jabatan bisa mengatur sendiri apakah anak-anaknya ditampilkan vertikal (ke bawah) atau horizontal (ke samping), lepas dari pengaturan cabang lain. Lihat bagian 9.
- **Sinkron Otomatis** — begitu diaktifkan, perubahan bagan otomatis terkirim ke GitHub dan otomatis terlihat oleh orang lain yang membuka halaman yang sama, tanpa klik manual. Lihat bagian 5a.

## 8. Grouping "Pelaksana" & "Jabatan Fungsional"

Selain jabatan struktural biasa, setiap jabatan bisa diberi **Kategori**
lewat formulir tambah/sunting:

- **Struktural (bagan normal)** — tampil sebagai kotak individual di bagan, seperti biasa, dan bisa punya bawahan sendiri.
- **Pelaksana** — tidak tampil sebagai kotak individual. Semua jabatan berkategori Pelaksana di bawah atasan yang sama otomatis dikumpulkan dalam **satu kotak tabel berwarna ungu** bernama "Pelaksana".
- **Jabatan Fungsional** — sama seperti Pelaksana, tapi dikumpulkan terpisah dalam **satu kotak tabel berwarna oranye** bernama "Jabatan Fungsional".

Kotak grup ini tetap terhubung ke atasannya lewat garis siku yang sama
seperti kotak jabatan biasa. Klik ikon **+** di kop kotak grup untuk
menambah anggota baru ke kategori tersebut (atasan & kategori terisi
otomatis), atau klik ikon **✎** pada baris tertentu untuk menyunting
anggota itu. Karena sifatnya sebagai kumpulan, jabatan berkategori
Pelaksana/Jabatan Fungsional **tidak bisa dijadikan atasan** bagi
jabatan lain (tidak muncul di dropdown Atasan Langsung).

## 9. Orientasi per cabang (vertikal & horizontal dicampur)

Ada **dua lapis** pengaturan susunan, dari yang paling umum sampai paling spesifik:

1. **Default bagan** (tombol toolbar) — susunan bawaan untuk seluruh bagan.
2. **Orientasi Cabang Bawahan** (di formulir suatu jabatan) — susunan bawaan
   khusus untuk anak-anak jabatan itu, menimpa default bagan.
3. **Susunan Sendiri** (di formulir jabatan itu SENDIRI) — jabatan ini
   menentukan sendiri bagaimana ia ditampilkan di antara saudara-saudaranya,
   menimpa pengaturan atasannya. **Inilah cara paling spesifik**, dan tidak
   perlu mengubah apa pun di jabatan atasannya.

Karena pengaturan #3 ada **per jabatan**, dalam satu kelompok bersaudara
yang sama, sebagian bisa disetel **Horizontal** (berbaris seperti biasa)
sementara yang lain disetel **Vertikal** (bertumpuk terpisah) — keduanya
tampil **bersamaan** di bawah atasan yang sama. Jabatan yang bertumpuk akan
digambar sebagai cabang terpisah di sebelah kanan kartu atasan, sementara
yang berbaris tetap mengikuti alur bagan klasik di bawahnya.

**Mengatur satu per satu (dari jabatan itu sendiri):**
Buka formulir sunting jabatan yang bersangkutan → pilih **Susunan Jabatan
Ini di Antara Saudaranya**:
- *Ikuti pengaturan atasan (default)* — mengikuti Orientasi Cabang Bawahan milik atasannya (atau default bagan bila atasan juga tidak mengatur apa-apa).
- *Horizontal* — jabatan ini SELALU sejajar berbaris dengan saudara-saudaranya, apa pun pengaturan lain.
- *Vertikal* — jabatan ini SELALU tampil bertumpuk terpisah dari saudara-saudaranya.

Jabatan yang susunannya diatur manual menampilkan label kecil ungu (mis.
"◇ posisi: tumpuk") di kartunya sebagai penanda.

**Mengatur banyak jabatan sekaligus:**
1. Klik tombol **☑ Pilih Banyak** di toolbar.
2. Klik kartu-kartu jabatan yang ingin diatur bersamaan (kartu yang dipilih akan bergaris hijau). Kartu yang diklik saat mode ini aktif TIDAK membuka formulir sunting.
3. Sebuah bar aksi muncul di bagian bawah layar — klik **⇅ Susun Vertikal (tumpuk)**, **⇄ Susun Horizontal (baris)**, atau **Ikuti Atasan** untuk menerapkan ke SEMUA jabatan yang dipilih sekaligus.
4. Mode pilih otomatis berakhir setelah pengaturan diterapkan (atau tekan **Batal**/`Esc` untuk keluar tanpa mengubah apa pun).

Terpisah dari itu, tombol **Orientasi Cabang Bawahan** pada formulir seorang
ATASAN dan tombol **default bagan** di toolbar tetap berguna sebagai
pengaturan massal cepat (mis. "semua anak Divisi X bertumpuk") — Susunan
Sendiri pada anak hanya perlu dipakai untuk PENGECUALIAN individual.

## 10. Undo / Redo

Setiap perubahan data (tambah, sunting, hapus jabatan, impor Excel, tarik
dari GitHub, atau pengaturan massal lewat "Pilih Banyak") bisa dibatalkan:

- Tombol **↶** (Undo) dan **↷** (Redo) di pojok kiri toolbar.
- Pintasan keyboard **Ctrl+Z** (Undo) dan **Ctrl+Y** atau **Ctrl+Shift+Z**
  (Redo) — di Mac gunakan **Cmd** sebagai ganti Ctrl.
- Riwayat menyimpan hingga 50 langkah terakhir, tersimpan di memori
  selama tab masih terbuka (riwayat kosong lagi setelah reload halaman,
  tapi data terakhir tetap aman di penyimpanan lokal seperti biasa).
- Aksi massal lewat mode "Pilih Banyak" tercatat sebagai **satu langkah**
  Undo, bukan satu langkah per jabatan — jadi satu kali Undo membatalkan
  seluruh aksi massal itu sekaligus.
- Tombol Undo/Redo otomatis nonaktif (abu-abu) saat tidak ada lagi yang
  bisa dibatalkan/diulang.
- Pintasan keyboard tidak aktif saat sedang mengetik di suatu kolom teks
  atau saat formulir jabatan/GitHub terbuka — supaya tidak bentrok dengan
  undo bawaan peramban untuk teks yang sedang diketik.

- Judul bagan bisa diklik dan diubah langsung (tersimpan otomatis).
- Semua data dan pengaturan GitHub tersimpan lokal — memuat ulang halaman
  tidak menghilangkan data.

## 11. Batasan yang perlu diketahui

- Ini adalah aplikasi statis: **tidak ada database server** dan **tidak ada
  penguncian baris (row locking)**. Jika dua orang menekan "Simpan ke
  GitHub" hampir bersamaan, yang menyimpan belakangan akan menimpa
  perubahan yang pertama (aplikasi mengambil `sha` terbaru sebelum menulis,
  namun tetap bisa terjadi tabrakan bila keduanya menekan simpan dalam
  rentang beberapa detik). Untuk tim besar, biasakan "Tarik dari GitHub"
  sebelum mulai menyunting.
- Riwayat perubahan mengikuti riwayat commit repo GitHub Anda — gunakan
  `git log` atau tab *Commits* di GitHub bila perlu melihat versi
  sebelumnya atau melakukan rollback.
- Token PAT punya masa berlaku (tergantung yang Anda atur saat membuat) —
  perbarui di Pengaturan GitHub bila sudah kedaluwarsa.
- Sinkron Otomatis hanya berjalan selama tab peramban terbuka — menutup
  tab menghentikan pemeriksaan berkala. Membuka tab lagi nanti akan
  langsung menarik versi terbaru begitu halaman dimuat.
- Setiap orang perlu mengaktifkan **Sinkron Otomatis di perangkatnya
  masing-masing** (pengaturan ini tersimpan lokal per peramban, tidak
  otomatis berlaku untuk semua pengunjung). Untuk sekadar **melihat**
  pembaruan otomatis (auto-tarik) di repo publik, cukup isi Owner/Repo
  saja — Token PAT hanya wajib diisi bagi orang yang juga ingin
  perubahannya ikut **terkirim** otomatis (auto-simpan).
