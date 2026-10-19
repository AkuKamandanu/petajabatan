#!/usr/bin/env python3
"""
Menerapkan pengaman anti-kehilangan data ke js/app.js (versi zip terakhir Anda).
Pemakaian:  python3 patch_app_js.py js/app.js
Skrip membuat cadangan app.js.bak, dan TIDAK mengubah apa pun bila teks yang
dicari tidak ditemukan persis satu kali.
"""
import sys, shutil

OLD1 = r'''      const { employees, sha } = await GithubSync.pull(cfg);
      lastKnownSha = sha;
      Store.setAll(employees, { silent: true }); // silent: baru saja datang DARI GitHub, tak perlu push balik
      focusedId = null;
      rerender({ search: els.searchBox.value });
      setStatus(autoSyncEnabled ? 'Sinkron otomatis aktif' : 'Tersambung ke GitHub', 'ok');'''

NEW1 = r'''      const { employees, sha } = await GithubSync.pull(cfg);
      // PENGAMAN: hasil tarikan KOSONG tidak boleh menimpa data di layar diam-diam.
      const localCount = Store.getAll().length;
      if (employees.length === 0 && localCount > 0) {
        const ok = confirm(
          `Berkas di GitHub ternyata KOSONG (0 jabatan), sedangkan di layar ini ada ${localCount} jabatan.\n\n` +
          'Menarik sekarang akan MENGHAPUS data di layar ini dan menggantinya dengan data kosong.\n\n' +
          'Lanjutkan? (Pilih Batal lalu klik "Simpan ke GitHub" kalau data di layar ini yang benar.)'
        );
        if (!ok) {
          setStatus('Tarik dibatalkan (data GitHub kosong)');
          return;
        }
      }
      lastKnownSha = sha;
      Store.setAll(employees, { silent: true }); // silent: baru saja datang DARI GitHub, tak perlu push balik
      focusedId = null;
      rerender({ search: els.searchBox.value });
      setStatus(autoSyncEnabled ? 'Sinkron otomatis aktif' : 'Tersambung ke GitHub', 'ok');'''

OLD2 = r'''      const sha = await GithubSync.getRemoteSha(cfg);
      if (sha && sha !== lastKnownSha) {
        const { employees, sha: pulledSha } = await GithubSync.pull(cfg);
        lastKnownSha = pulledSha;
        Store.setAll(employees, { silent: true });
        focusedId = null;
        rerender({ search: els.searchBox.value });
        els.lastSaved.textContent = 'diperbarui otomatis · ' + stamp();
        toast('Bagan diperbarui otomatis — ada perubahan terbaru dari GitHub.', 'ok');
      }'''

NEW2 = r'''      const sha = await GithubSync.getRemoteSha(cfg);
      if (sha && sha !== lastKnownSha) {
        const { employees, sha: pulledSha } = await GithubSync.pull(cfg);
        lastKnownSha = pulledSha;
        // PENGAMAN: berkas GitHub yang KOSONG tidak boleh menimpa data lokal.
        // Data di layar dianggap benar dan dikirim naik ke GitHub.
        if (employees.length === 0 && Store.getAll().length > 0) {
          toast('Berkas di GitHub kosong — data di layar dipertahankan dan dikirim ke GitHub.', 'ok');
          pushToGithub({ silent: true, commitMessage: 'Auto-sync: pulihkan data dari layar' });
        } else {
          Store.setAll(employees, { silent: true });
          focusedId = null;
          rerender({ search: els.searchBox.value });
          els.lastSaved.textContent = 'diperbarui otomatis · ' + stamp();
          toast('Bagan diperbarui otomatis — ada perubahan terbaru dari GitHub.', 'ok');
        }
      }'''

def main():
    if len(sys.argv) != 2:
        sys.exit("Pemakaian: python3 patch_app_js.py js/app.js")
    path = sys.argv[1]
    src = open(path, encoding='utf-8').read()
    if 'PENGAMAN: hasil tarikan KOSONG' in src:
        sys.exit("Sudah pernah diterapkan. Tidak ada yang diubah.")
    for name, old in (("tarik manual", OLD1), ("sinkron otomatis", OLD2)):
        n = src.count(old)
        if n != 1:
            sys.exit(f"GAGAL: bagian '{name}' ditemukan {n} kali (harus 1). "
                     "File app.js Anda berbeda dari versi yang diharapkan; tidak ada yang diubah.")
    shutil.copyfile(path, path + '.bak')
    src = src.replace(OLD1, NEW1).replace(OLD2, NEW2)
    open(path, 'w', encoding='utf-8').write(src)
    print("Berhasil. Cadangan disimpan di", path + ".bak")

main()
