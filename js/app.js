/**
 * app.js — kontrol utama aplikasi.
 */
(() => {
  const $ = (sel) => document.querySelector(sel);

  const els = {
    canvasWrap: $('#canvasWrap'),
    chartRoot: $('#chartRoot'),
    emptyState: $('#emptyState'),
    statusDot: $('#statusDot'),
    statusText: $('#statusText'),
    employeeCount: $('#employeeCount'),
    lastSaved: $('#lastSaved'),
    orgTitle: $('#orgTitle'),
    searchBox: $('#searchBox'),
    zoomLevel: $('#zoomLevel'),
    chartCanvas: $('#chartCanvas'),
    toast: $('#toast'),
    btnPanMode: $('#btnPanMode'),
    btnUndo: $('#btnUndo'),
    btnRedo: $('#btnRedo'),
    btnGridToggle: $('#btnGridToggle'),
    btnOrientation: $('#btnOrientation'),
    btnSelectMode: $('#btnSelectMode'),
    selectionBar: $('#selectionBar'),
    selectionCount: $('#selectionCount'),
    btnSetVertical: $('#btnSetVertical'),
    btnSetHorizontal: $('#btnSetHorizontal'),
    btnClearOverride: $('#btnClearOverride'),
    btnCancelSelection: $('#btnCancelSelection'),
    focusBanner: $('#focusBanner'),
    focusBannerTitle: $('#focusBannerTitle'),
    btnClearFocus: $('#btnClearFocus'),

    // node modal
    nodeModalBackdrop: $('#nodeModalBackdrop'),
    nodeModalTitle: $('#nodeModalTitle'),
    fieldJabatan: $('#fieldJabatan'),
    fieldAtasan: $('#fieldAtasan'),
    fieldKategori: $('#fieldKategori'),
    kategoriHint: $('#kategoriHint'),
    fieldOrientasi: $('#fieldOrientasi'),
    fieldSusunan: $('#fieldSusunan'),
    fieldKeterangan: $('#fieldKeterangan'),
    fieldBezetting: $('#fieldBezetting'),
    fieldKelasJabatan: $('#fieldKelasJabatan'),
    fieldKebutuhan: $('#fieldKebutuhan'),
    fieldKekuranganKelebihan: $('#fieldKekuranganKelebihan'),
    fieldAbk: $('#fieldAbk'),
    fieldId: $('#fieldId'),
    btnDeleteNode: $('#btnDeleteNode'),
    btnSaveNode: $('#btnSaveNode'),

    // github modal
    githubModalBackdrop: $('#githubModalBackdrop'),
    ghOwner: $('#ghOwner'),
    ghRepo: $('#ghRepo'),
    ghBranch: $('#ghBranch'),
    ghPath: $('#ghPath'),
    ghToken: $('#ghToken'),
    ghTestResult: $('#ghTestResult'),
    btnAutoSync: $('#btnAutoSync'),
  };

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }

  let zoom = 1;
  let pendingParentId = null; // saat modal dibuka via "tambah bawahan"
  let panMode = false;
  let isPanning = false;
  let dragged = false;
  let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };
  let focusedId = null; // jika terisi: hanya tampilkan jabatan ini + turunannya
  let selectMode = false;
  let selectedIds = new Set();

  // ---------- status / toast ----------
  function setStatus(text, mode = 'idle') {
    els.statusText.textContent = text;
    els.statusDot.className = 'status__dot' + (mode === 'ok' ? ' ok' : mode === 'busy' ? ' busy' : '');
  }

  function toast(msg, mode = '') {
    els.toast.textContent = msg;
    els.toast.className = 'toast show' + (mode ? ' ' + mode : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => { els.toast.className = 'toast'; }, 3200);
  }

  function stamp() {
    const d = new Date();
    return d.toLocaleString('id-ID', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
  }

  // ---------- fokus subtree (lihat hanya satu jabatan + turunannya) ----------
  function getRenderList() {
    const all = Store.getAll();
    if (!focusedId) return all;
    const focusNode = all.find(e => e.id === focusedId);
    if (!focusNode) {
      focusedId = null;
      toast('Jabatan yang difokuskan tidak ditemukan lagi (mungkin sudah dihapus/diubah).', 'err');
      return all;
    }
    const descIds = Store.getDescendantIds(focusedId);
    return all
      .filter(e => e.id === focusedId || descIds.has(e.id))
      .map(e => e.id === focusedId ? { ...e, parentId: '' } : e); // jadikan simpul ini "akar" tampilan
  }

  function setFocus(id) {
    if (id) {
      const exists = Store.getAll().some(e => e.id === id);
      if (!exists) { toast('Tidak dapat menemukan jabatan ini (ID tidak cocok).', 'err'); return; }
    }
    focusedId = id || null;
    rerender({ search: els.searchBox.value });
  }

  function updateFocusBanner() {
    if (focusedId) {
      const node = Store.getAll().find(e => e.id === focusedId);
      if (node) {
        els.focusBannerTitle.textContent = node.jabatan || '(tanpa nama jabatan)';
        els.focusBanner.classList.add('show');
        return;
      }
    }
    els.focusBanner.classList.remove('show');
  }

  // ---------- undo / redo ----------
  function updateUndoRedoButtons() {
    els.btnUndo.disabled = !Store.canUndo();
    els.btnRedo.disabled = !Store.canRedo();
  }

  function doUndo() {
    if (!Store.undo()) return;
    rerender({ search: els.searchBox.value });
    toast('Aksi dibatalkan (undo).', '');
  }

  function doRedo() {
    if (!Store.redo()) return;
    rerender({ search: els.searchBox.value });
    toast('Aksi diulang (redo).', '');
  }

  // ---------- render ----------
  function rerender(opts = {}) {
    const employees = getRenderList();
    const info = ChartRender.render(employees, els.chartRoot, {
      ...opts,
      selectMode,
      selectedIds,
      defaultOrientation
    });
    els.canvasWrap.classList.toggle('has-data', Store.getAll().length > 0);
    els.employeeCount.textContent = focusedId
      ? `${employees.length} dari ${Store.getAll().length} jabatan`
      : `${employees.length} jabatan`;
    updateFocusBanner();
    updateUndoRedoButtons();
    attachNodeEvents();
    return info;
  }

  function attachNodeEvents() {
    els.chartRoot.querySelectorAll('.node-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (dragged) { dragged = false; return; } // abaikan klik yang sebenarnya adalah akhir dari menyeret (pan)
        if (e.target.closest('[data-action]')) return; // ditangani terpisah di bawah
        if (selectMode) { toggleCardSelection(card.dataset.id); return; }
        openEditModal(card.dataset.id);
      });
      card.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          if (selectMode) { toggleCardSelection(card.dataset.id); return; }
          openEditModal(card.dataset.id);
        }
      });
    });

    // Setiap tombol aksi dibungkus try/catch sendiri: jika satu kartu bermasalah
    // (mis. data tak terduga hasil impor), kartu lain tetap bisa berfungsi normal.
    function bindAction(selector, handler) {
      els.chartRoot.querySelectorAll(selector).forEach(btn => {
        try {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const card = btn.closest('.node-card');
            if (!card) { console.error('Tombol aksi tidak menemukan kartu induknya', btn); return; }
            if (selectMode) { toggleCardSelection(card.dataset.id); return; }
            handler(card.dataset.id, btn);
          });
        } catch (err) {
          console.error('Gagal memasang event untuk', selector, err);
        }
      });
    }

    bindAction('[data-action="edit"]', (id) => openEditModal(id));
    bindAction('[data-action="add"]', (id) => openAddModal(id));
    bindAction('[data-action="focus"]', (id) => setFocus(id));

    // Tombol di dalam kotak grup (Pelaksana / Jabatan Fungsional): ini bukan
    // .node-card, jadi ditangani terpisah dari bindAction di atas.
    els.chartRoot.querySelectorAll('.group-add-btn').forEach(btn => {
      try {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const li = btn.closest('.group-li');
          const parentLi = li ? li.closest('ul')?.closest('li[data-id]') : null;
          const parentId = parentLi ? parentLi.dataset.id : '';
          openAddModal(parentId, btn.dataset.kategori);
        });
      } catch (err) { console.error('Gagal memasang event tambah grup', err); }
    });
    els.chartRoot.querySelectorAll('.group-row-edit').forEach(btn => {
      try {
        btn.addEventListener('click', (e) => { e.stopPropagation(); openEditModal(btn.dataset.id); });
      } catch (err) { console.error('Gagal memasang event sunting anggota grup', err); }
    });

    // Tombol ciutkan (toggle) ada di luar .node-card (sebagai saudara di dalam
    // .node-shell), jadi dipasang terpisah dan langsung pakai data-toggle miliknya.
    els.chartRoot.querySelectorAll('[data-toggle]').forEach(btn => {
      try {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          ChartRender.toggleCollapse(btn.dataset.toggle);
          rerender({ search: els.searchBox.value });
        });
      } catch (err) {
        console.error('Gagal memasang event toggle', err);
      }
    });
  }

  // ---------- modal: tambah / sunting simpul ----------
  function populateAtasanOptions(excludeId) {
    const employees = Store.getAll();
    const excludedSet = excludeId ? new Set([excludeId, ...Store.getDescendantIds(excludeId)]) : new Set();
    const available = employees.filter(e => !excludedSet.has(e.id) && !e.kategori); // Pelaksana/Fungsional tidak bisa punya bawahan

    // Susun opsi mengikuti urutan & kedalaman pohon (breakdown sesuai struktur),
    // bukan daftar datar tanpa urutan.
    const byParent = new Map();
    available.forEach(e => {
      const key = e.parentId && available.some(p => p.id === e.parentId) ? e.parentId : '__root__';
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key).push(e);
    });

    let optionsHtml = '<option value="">— Tidak ada (jabatan puncak) —</option>';
    function walk(parentKey, depth) {
      const kids = byParent.get(parentKey) || [];
      kids.forEach(e => {
        const prefix = depth > 0 ? '\u00A0\u00A0\u00A0'.repeat(depth) + '↳ ' : '';
        const label = prefix + escapeHtml(e.jabatan || '(tanpa nama jabatan)');
        optionsHtml += `<option value="${e.id}">${label}</option>`;
        walk(e.id, depth + 1);
      });
    }
    walk('__root__', 0);

    els.fieldAtasan.innerHTML = optionsHtml;
  }

  function updateKategoriHint() {
    els.kategoriHint.style.display = els.fieldKategori.value ? 'block' : 'none';
  }

  function openAddModal(parentId, presetKategori) {
    pendingParentId = parentId || '';
    els.nodeModalTitle.textContent = 'Tambah Jabatan';
    els.fieldId.value = '';
    els.fieldJabatan.value = '';
    els.fieldKeterangan.value = '';
    els.fieldBezetting.value = '';
    els.fieldKelasJabatan.value = '';
    els.fieldKebutuhan.value = '';
    els.fieldKekuranganKelebihan.value = '';
    els.fieldAbk.value = '';
    populateAtasanOptions(null);
    els.fieldAtasan.value = parentId || '';
    els.fieldKategori.value = presetKategori || '';
    els.fieldOrientasi.value = '';
    els.fieldSusunan.value = '';
    updateKategoriHint();
    els.btnDeleteNode.style.display = 'none';
    els.nodeModalBackdrop.classList.add('open');
    els.fieldJabatan.focus();
  }

  function openEditModal(id) {
    const emp = Store.getAll().find(e => e.id === id);
    if (!emp) { toast('Tidak dapat membuka jabatan ini (ID tidak cocok di data).', 'err'); return; }
    pendingParentId = null;
    els.nodeModalTitle.textContent = 'Sunting Jabatan';
    els.fieldId.value = emp.id;
    els.fieldJabatan.value = emp.jabatan;
    els.fieldKeterangan.value = emp.keterangan;
    els.fieldBezetting.value = emp.bezetting;
    els.fieldKelasJabatan.value = emp.kelasJabatan || '';
    els.fieldKebutuhan.value = emp.kebutuhan || '';
    els.fieldKekuranganKelebihan.value = emp.kekuranganKelebihan || '';
    els.fieldAbk.value = emp.abk || '';
    populateAtasanOptions(emp.id);
    els.fieldAtasan.value = emp.parentId || '';
    els.fieldKategori.value = emp.kategori || '';
    els.fieldOrientasi.value = emp.childOrientation || '';
    els.fieldSusunan.value = emp.selfArrangement || '';
    updateKategoriHint();
    els.btnDeleteNode.style.display = '';
    els.nodeModalBackdrop.classList.add('open');
    els.fieldJabatan.focus();
  }

  function closeNodeModal() { els.nodeModalBackdrop.classList.remove('open'); }

  function saveNodeFromModal() {
    const jabatan = els.fieldJabatan.value.trim();
    if (!jabatan) { toast('Jabatan wajib diisi.', 'err'); return; }

    const id = els.fieldId.value || Store.genId();
    const node = {
      id,
      jabatan,
      parentId: els.fieldAtasan.value || '',
      keterangan: els.fieldKeterangan.value.trim(),
      bezetting: els.fieldBezetting.value.trim(),
      kelasJabatan: els.fieldKelasJabatan.value.trim(),
      kebutuhan: els.fieldKebutuhan.value.trim(),
      kekuranganKelebihan: els.fieldKekuranganKelebihan.value.trim(),
      abk: els.fieldAbk.value.trim(),
      kategori: els.fieldKategori.value || '',
      childOrientation: els.fieldOrientasi.value || '',
      selfArrangement: els.fieldSusunan.value || '',
    };
    Store.upsert(node);
    closeNodeModal();
    rerender({ search: els.searchBox.value });
    setStatus('Tersimpan di penyimpanan lokal', 'ok');
    els.lastSaved.textContent = 'lokal · ' + stamp();
    toast('Perubahan disimpan secara lokal.', 'ok');
  }

  function deleteCurrentNode() {
    const id = els.fieldId.value;
    if (!id) return;
    const emp = Store.getAll().find(e => e.id === id);
    const childCount = Store.getAll().filter(e => e.parentId === id).length;
    const msg = childCount > 0
      ? `Hapus jabatan "${emp.jabatan}"? ${childCount} bawahan langsung akan dipindahkan ke atasan dari jabatan ini.`
      : `Hapus jabatan "${emp.jabatan}"?`;
    if (!confirm(msg)) return;
    Store.remove(id, { reparentChildren: true });
    if (focusedId === id) focusedId = null;
    closeNodeModal();
    rerender({ search: els.searchBox.value });
    setStatus('Tersimpan di penyimpanan lokal', 'ok');
    els.lastSaved.textContent = 'lokal · ' + stamp();
    toast('Simpul dihapus.', 'ok');
  }

  // ---------- GitHub modal ----------
  function openGithubModal() {
    const cfg = Store.loadConfig() || {};
    els.ghOwner.value = cfg.owner || '';
    els.ghRepo.value = cfg.repo || '';
    els.ghBranch.value = cfg.branch || 'main';
    els.ghPath.value = cfg.path || 'data/struktur-organisasi.xlsx';
    els.ghToken.value = cfg.token || '';
    els.ghTestResult.textContent = '';
    els.githubModalBackdrop.classList.add('open');
  }
  function closeGithubModal() { els.githubModalBackdrop.classList.remove('open'); }

  // Kalau seseorang menempel URL GitHub lengkap (mis. "https://github.com/nama/repo")
  // ke kolom Owner atau Repo, uraikan otomatis jadi owner+repo yang benar,
  // supaya tidak menghasilkan alamat API yang salah bentuk.
  function parseOwnerRepoInput(ownerRaw, repoRaw) {
    let owner = ownerRaw.trim();
    let repo = repoRaw.trim();
    const urlMatch = owner.match(/github\.com\/([^\/\s]+)\/([^\/\s?#]+)/i);
    if (urlMatch) {
      owner = urlMatch[1];
      if (!repo) repo = urlMatch[2].replace(/\.git$/i, '');
    }
    owner = owner.replace(/^@/, '').trim();
    repo = repo.replace(/\.git$/i, '').trim();
    return { owner, repo };
  }

  async function saveGithubSettings() {
    const { owner, repo } = parseOwnerRepoInput(els.ghOwner.value, els.ghRepo.value);
    const cfg = {
      owner,
      repo,
      branch: els.ghBranch.value.trim().replace(/^\/+|\/+$/g, '') || 'main',
      path: els.ghPath.value.trim().replace(/^\/+/, '') || 'data/struktur-organisasi.xlsx',
      token: els.ghToken.value.trim(),
    };
    if (!cfg.owner || !cfg.repo) { toast('Owner dan nama repo wajib diisi.', 'err'); return; }
    // Sinkronkan kembali ke kolom form kalau tadi ada yang otomatis dibersihkan,
    // supaya orang bisa lihat persis apa yang akan dipakai.
    els.ghOwner.value = cfg.owner;
    els.ghRepo.value = cfg.repo;
    els.ghTestResult.textContent = 'Menguji koneksi…';
    try {
      await GithubSync.testConnection(cfg);
      Store.saveConfig(cfg);
      els.ghTestResult.textContent = '✓ Terhubung';
      toast('Pengaturan GitHub disimpan.', 'ok');
      closeGithubModal();
      if (autoSyncEnabled) { lastKnownSha = null; startAutoSyncPolling(); checkForRemoteUpdates(); }
    } catch (err) {
      els.ghTestResult.textContent = '✗ ' + err.message;
    }
  }

  async function pullFromGithub() {
    const cfg = Store.loadConfig();
    if (!cfg || !cfg.owner || !cfg.repo) { toast('Atur koneksi GitHub terlebih dahulu.', 'err'); openGithubModal(); return; }
    setStatus('Menarik data dari GitHub…', 'busy');
    try {
      const { employees, sha } = await GithubSync.pull(cfg);
      lastKnownSha = sha;
      Store.setAll(employees, { silent: true }); // silent: baru saja datang DARI GitHub, tak perlu push balik
      focusedId = null;
      rerender({ search: els.searchBox.value });
      setStatus(autoSyncEnabled ? 'Sinkron otomatis aktif' : 'Tersambung ke GitHub', 'ok');
      els.lastSaved.textContent = 'ditarik dari GitHub · ' + stamp();
      toast(`Berhasil menarik ${employees.length} data dari GitHub.`, 'ok');
    } catch (err) {
      setStatus('Gagal menarik dari GitHub');
      toast(err.message, 'err');
    }
  }

  async function pushToGithub(opts = {}) {
    const cfg = Store.loadConfig();
    if (!cfg || !cfg.owner || !cfg.repo) {
      if (!opts.silent) { toast('Atur koneksi GitHub terlebih dahulu.', 'err'); openGithubModal(); }
      return;
    }
    if (!opts.silent) setStatus('Menyimpan ke GitHub…', 'busy');
    try {
      const result = await GithubSync.push(cfg, Store.getAll(), opts.commitMessage);
      if (result && result.sha) lastKnownSha = result.sha;
      setStatus(autoSyncEnabled ? 'Sinkron otomatis aktif' : 'Tersambung ke GitHub', 'ok');
      els.lastSaved.textContent = (opts.silent ? 'auto-sync ke GitHub · ' : 'disimpan ke GitHub · ') + stamp();
      if (!opts.silent) toast('Berhasil disimpan ke GitHub.', 'ok');
      return true;
    } catch (err) {
      setStatus('Gagal menyimpan ke GitHub');
      toast((opts.silent ? 'Auto-sync ke GitHub gagal: ' : '') + err.message, 'err');
      return false;
    }
  }

  // ---------- sinkronisasi otomatis (auto-sync) ----------
  // Supaya perubahan di satu komputer otomatis muncul di komputer lain yang
  // membuka halaman yang sama, tanpa perlu klik "Tarik"/"Simpan ke GitHub"
  // secara manual setiap kali:
  //  - AUTO-PUSH: setiap perubahan data (dari Store.onChange) dijadwalkan
  //    untuk otomatis di-push ke GitHub beberapa detik setelah perubahan
  //    terakhir (di-debounce, supaya banyak perubahan beruntun jadi satu
  //    commit saja, bukan satu commit per klik).
  //  - AUTO-PULL: selama tab ini terbuka, aplikasi memeriksa GitHub secara
  //    berkala (polling) — kalau ada versi lebih baru (sha berbeda dari
  //    yang terakhir diketahui), otomatis ditarik & bagan diperbarui.
  // Ini tetap situs statis (GitHub Pages) tanpa server/WebSocket, jadi
  // "otomatis" di sini berarti "tanpa klik manual", bukan real-time instan —
  // pembaruan akan terlihat dalam beberapa detik/menit sesuai jeda polling,
  // dan orang lain tetap perlu tab-nya dalam keadaan terbuka (atau memuat
  // ulang halaman) untuk melihatnya.
  const LS_AUTOSYNC = 'orgchart_autosync_v1';
  const AUTO_PUSH_DEBOUNCE_MS = 4000;
  const AUTO_PULL_INTERVAL_MS = 25000;
  let autoSyncEnabled = false;
  let lastKnownSha = null;
  let autoPushTimer = null;
  let autoPullTimer = null;

  function scheduleAutoPush() {
    if (!autoSyncEnabled) return;
    const cfg = Store.loadConfig();
    if (!cfg || !cfg.owner || !cfg.repo) return;
    clearTimeout(autoPushTimer);
    autoPushTimer = setTimeout(() => {
      pushToGithub({ silent: true, commitMessage: `Auto-sync bagan (${new Date().toISOString()})` });
    }, AUTO_PUSH_DEBOUNCE_MS);
  }

  async function checkForRemoteUpdates() {
    if (!autoSyncEnabled) return;
    const cfg = Store.loadConfig();
    if (!cfg || !cfg.owner || !cfg.repo) return;
    // Kalau baru saja ada perubahan lokal yang masih menunggu di-push,
    // jangan tarik dulu — supaya tidak menimpa perubahan sendiri yang
    // belum sempat terkirim.
    if (autoPushTimer) return;
    try {
      const sha = await GithubSync.getRemoteSha(cfg);
      if (sha && sha !== lastKnownSha) {
        const { employees, sha: pulledSha } = await GithubSync.pull(cfg);
        lastKnownSha = pulledSha;
        Store.setAll(employees, { silent: true });
        focusedId = null;
        rerender({ search: els.searchBox.value });
        els.lastSaved.textContent = 'diperbarui otomatis · ' + stamp();
        toast('Bagan diperbarui otomatis — ada perubahan terbaru dari GitHub.', 'ok');
      }
    } catch (err) {
      // Diamkan agar polling latar belakang tidak mengganggu; kegagalan
      // sementara (mis. batas API tercapai) akan dicoba lagi di siklus berikutnya.
      console.warn('Auto-sync: gagal memeriksa pembaruan —', err.message);
    }
  }

  function startAutoSyncPolling() {
    stopAutoSyncPolling();
    autoPullTimer = setInterval(checkForRemoteUpdates, AUTO_PULL_INTERVAL_MS);
  }
  function stopAutoSyncPolling() {
    if (autoPullTimer) clearInterval(autoPullTimer);
    autoPullTimer = null;
  }

  function updateAutoSyncButton() {
    els.btnAutoSync.classList.toggle('btn--active', autoSyncEnabled);
    els.btnAutoSync.textContent = autoSyncEnabled ? '🔁 Sinkron Otomatis: Aktif' : '🔁 Sinkron Otomatis: Nonaktif';
  }

  async function toggleAutoSync() {
    const cfg = Store.loadConfig();
    if (!autoSyncEnabled && (!cfg || !cfg.owner || !cfg.repo)) {
      toast('Atur koneksi GitHub terlebih dahulu sebelum mengaktifkan sinkron otomatis.', 'err');
      openGithubModal();
      return;
    }
    autoSyncEnabled = !autoSyncEnabled;
    localStorage.setItem(LS_AUTOSYNC, autoSyncEnabled ? '1' : '0');
    updateAutoSyncButton();
    if (autoSyncEnabled) {
      toast('Sinkron otomatis diaktifkan — bagan ini akan otomatis tersinkron dengan GitHub.', 'ok');
      await checkForRemoteUpdates(); // langsung samakan dengan versi terbaru saat diaktifkan
      startAutoSyncPolling();
    } else {
      toast('Sinkron otomatis dinonaktifkan. Gunakan tombol Tarik/Simpan manual seperti biasa.', '');
      stopAutoSyncPolling();
      clearTimeout(autoPushTimer);
      autoPushTimer = null;
    }
  }

  // ---------- import / export excel ----------
  async function handleImportFile(file) {
    if (!file) return;
    try {
      const employees = await XlsxIO.importFromFile(file);
      Store.setAll(employees);
      focusedId = null;
      rerender({ search: els.searchBox.value });
      setStatus('Tersimpan di penyimpanan lokal', 'ok');
      els.lastSaved.textContent = 'diimpor dari Excel · ' + stamp();
      toast(`Berhasil mengimpor ${employees.length} data dari Excel.`, 'ok');
    } catch (err) {
      toast('Gagal membaca berkas Excel: ' + err.message, 'err');
    }
  }

  function handleExport() {
    const employees = Store.getAll();
    if (employees.length === 0) { toast('Belum ada data untuk diekspor.', 'err'); return; }
    const title = (els.orgTitle.textContent || 'struktur-organisasi').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-');
    XlsxIO.exportDownload(employees, `${title || 'struktur-organisasi'}.xlsx`);
    toast('Berkas Excel diunduh.', 'ok');
  }

  // ---------- zoom ----------
  function applyZoom() {
    els.chartCanvas.style.transform = `scale(${zoom})`;
    els.zoomLevel.textContent = Math.round(zoom * 100) + '%';
  }

  // ---------- alat geser (hand tool / pan) ----------
  function isInteractiveTarget(target) {
    return !!target.closest('.node-card, .toggle-btn, .node-mini-btn, button, select, input, textarea, a');
  }

  function pointFrom(e) {
    return e.touches && e.touches[0] ? e.touches[0] : e;
  }

  function startPan(e) {
    // Mode normal: hanya menyeret dari area kosong kanvas. Mode alat geser aktif:
    // menyeret dari mana saja (termasuk di atas kartu) untuk memudahkan bagan padat.
    if (!panMode && isInteractiveTarget(e.target)) return;
    if (e.type === 'mousedown' && e.button !== 0) return; // klik kiri saja
    const p = pointFrom(e);
    isPanning = true;
    dragged = false;
    panStart = { x: p.clientX, y: p.clientY, scrollLeft: els.canvasWrap.scrollLeft, scrollTop: els.canvasWrap.scrollTop };
    els.canvasWrap.classList.add('panning');
  }

  function movePan(e) {
    if (!isPanning) return;
    const p = pointFrom(e);
    const dx = p.clientX - panStart.x;
    const dy = p.clientY - panStart.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged = true;
    if (dragged && e.cancelable) e.preventDefault();
    els.canvasWrap.scrollLeft = panStart.scrollLeft - dx;
    els.canvasWrap.scrollTop = panStart.scrollTop - dy;
  }

  function endPan() {
    isPanning = false;
    els.canvasWrap.classList.remove('panning');
    // biarkan 'dragged' tetap true sesaat agar listener klik kartu tahu untuk mengabaikan klik ini
    setTimeout(() => { dragged = false; }, 0);
  }

  function togglePanMode(forceOn) {
    panMode = forceOn !== undefined ? forceOn : !panMode;
    els.canvasWrap.classList.toggle('pan-mode', panMode);
    els.btnPanMode.classList.toggle('btn--active', panMode);
  }

  // ---------- garis grid latar kanvas ----------
  const LS_GRID = 'orgchart_show_grid_v1';
  function applyGridPref(show) {
    els.canvasWrap.classList.toggle('no-grid', !show);
    els.btnGridToggle.classList.toggle('btn--active', show);
  }
  function toggleGrid() {
    const showing = !els.canvasWrap.classList.contains('no-grid');
    const next = !showing;
    applyGridPref(next);
    localStorage.setItem(LS_GRID, next ? '1' : '0');
  }

  // ---------- orientasi DEFAULT bagan (jabatan tanpa pengaturan manual mengikuti ini) ----------
  // "horizontal" = anak-anak berbaris ke samping (baris, bagan klasik) — ini BAWAAN.
  // "vertical"   = anak-anak bertumpuk ke bawah (kolom, bagan menyamping ke kanan).
  const LS_ORIENTATION = 'orgchart_orientation_v2';
  let defaultOrientation = 'horizontal';
  function applyOrientation(stacked) {
    defaultOrientation = stacked ? 'vertical' : 'horizontal';
    els.btnOrientation.textContent = stacked ? '⇅ Default: Vertikal' : '⇄ Default: Horizontal';
    rerender({ search: els.searchBox.value });
  }
  function toggleOrientation() {
    const next = defaultOrientation !== 'vertical';
    applyOrientation(next);
    localStorage.setItem(LS_ORIENTATION, next ? 'vertical' : 'horizontal');
  }

  // ---------- mode "pilih banyak" — atur orientasi cabang beberapa jabatan sekaligus ----------
  function updateSelectionBar() {
    const count = selectedIds.size;
    els.selectionCount.textContent = String(count);
    els.selectionBar.classList.toggle('show', selectMode && count > 0);
  }

  function toggleSelectMode() {
    selectMode = !selectMode;
    if (!selectMode) selectedIds.clear();
    els.canvasWrap.classList.toggle('select-mode', selectMode);
    els.btnSelectMode.classList.toggle('btn--active', selectMode);
    updateSelectionBar();
    rerender({ search: els.searchBox.value });
    if (selectMode) toast('Mode pilih aktif — klik beberapa kartu, lalu atur orientasi cabangnya sekaligus.', '');
  }

  function toggleCardSelection(id) {
    if (selectedIds.has(id)) selectedIds.delete(id); else selectedIds.add(id);
    updateSelectionBar();
    rerender({ search: els.searchBox.value });
  }

  function applyOrientationToSelection(value) {
    if (selectedIds.size === 0) return;
    Store.batchUpdate([...selectedIds], (emp) => ({ ...emp, selfArrangement: value }));
    toast(`Susunan diterapkan ke ${selectedIds.size} jabatan.`, 'ok');
    selectedIds.clear();
    selectMode = false;
    els.canvasWrap.classList.remove('select-mode');
    els.btnSelectMode.classList.remove('btn--active');
    updateSelectionBar();
    updateUndoRedoButtons();
    rerender({ search: els.searchBox.value });
  }

  // ---------- search ----------
  let searchDebounce;
  function handleSearch() {
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => rerender({ search: els.searchBox.value }), 150);
  }

  // ---------- wire up events ----------
  function bind() {
    $('#btnAddRoot').addEventListener('click', () => openAddModal(''));
    $('#btnAddChildTop').addEventListener('click', () => openAddModal(''));
    $('#fileImport').addEventListener('change', (e) => handleImportFile(e.target.files[0]));
    $('#btnExport').addEventListener('click', handleExport);

    $('#btnGithubSettings').addEventListener('click', openGithubModal);
    $('#btnPull').addEventListener('click', pullFromGithub);
    $('#btnPush').addEventListener('click', () => pushToGithub());
    $('#btnAutoSync').addEventListener('click', toggleAutoSync);
    $('#githubModalClose').addEventListener('click', closeGithubModal);
    $('#btnGithubCancel').addEventListener('click', closeGithubModal);
    $('#btnGithubSave').addEventListener('click', saveGithubSettings);

    $('#nodeModalClose').addEventListener('click', closeNodeModal);
    $('#btnCancelNode').addEventListener('click', closeNodeModal);
    $('#btnSaveNode').addEventListener('click', saveNodeFromModal);
    $('#btnDeleteNode').addEventListener('click', deleteCurrentNode);

    [els.nodeModalBackdrop, els.githubModalBackdrop].forEach(bd => {
      bd.addEventListener('click', (e) => { if (e.target === bd) bd.classList.remove('open'); });
    });

    els.searchBox.addEventListener('input', handleSearch);

    $('#zoomIn').addEventListener('click', () => { zoom = Math.min(2, zoom + 0.1); applyZoom(); });
    $('#zoomOut').addEventListener('click', () => { zoom = Math.max(0.4, zoom - 0.1); applyZoom(); });
    $('#zoomReset').addEventListener('click', () => { zoom = 1; applyZoom(); });

    els.btnUndo.addEventListener('click', doUndo);
    els.btnRedo.addEventListener('click', doRedo);
    els.btnPanMode.addEventListener('click', () => togglePanMode());
    els.btnGridToggle.addEventListener('click', toggleGrid);
    els.btnOrientation.addEventListener('click', toggleOrientation);
    els.btnSelectMode.addEventListener('click', toggleSelectMode);
    els.btnSetVertical.addEventListener('click', () => applyOrientationToSelection('vertical'));
    els.btnSetHorizontal.addEventListener('click', () => applyOrientationToSelection('horizontal'));
    els.btnClearOverride.addEventListener('click', () => applyOrientationToSelection(''));
    els.btnCancelSelection.addEventListener('click', () => { if (selectMode) toggleSelectMode(); });
    els.btnClearFocus.addEventListener('click', () => setFocus(null));
    els.fieldKategori.addEventListener('change', updateKategoriHint);

    els.canvasWrap.addEventListener('mousedown', startPan);
    document.addEventListener('mousemove', movePan);
    document.addEventListener('mouseup', endPan);
    els.canvasWrap.addEventListener('touchstart', startPan, { passive: true });
    document.addEventListener('touchmove', movePan, { passive: false });
    document.addEventListener('touchend', endPan);

    els.orgTitle.addEventListener('blur', () => Store.saveTitle(els.orgTitle.textContent.trim()));

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { closeNodeModal(); closeGithubModal(); if (selectMode) toggleSelectMode(); }
      // spasi ditahan = aktifkan alat geser sementara (kebiasaan umum di alat desain)
      if (e.code === 'Space' && !e.repeat && !isInteractiveTarget(document.activeElement || document.body)) {
        togglePanMode(true);
      }

      // Ctrl/Cmd+Z = undo, Ctrl/Cmd+Y atau Ctrl/Cmd+Shift+Z = redo.
      // Diabaikan saat sedang mengetik di input/textarea/contenteditable
      // (biar undo bawaan peramban untuk teks tetap jalan normal) atau
      // saat modal formulir terbuka (menghindari kebingungan data berubah
      // di belakang layar sementara formulir masih terbuka).
      const activeTag = (document.activeElement && document.activeElement.tagName) || '';
      const isEditableFocus = activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT'
        || (document.activeElement && document.activeElement.isContentEditable);
      const modalOpen = els.nodeModalBackdrop.classList.contains('open') || els.githubModalBackdrop.classList.contains('open');
      if (!isEditableFocus && !modalOpen && (e.ctrlKey || e.metaKey)) {
        const key = e.key.toLowerCase();
        if (key === 'z' && !e.shiftKey) { e.preventDefault(); doUndo(); }
        else if (key === 'y' || (key === 'z' && e.shiftKey)) { e.preventDefault(); doRedo(); }
      }
    });
    document.addEventListener('keyup', (e) => {
      if (e.code === 'Space') togglePanMode(false);
    });
  }

  // ---------- init ----------
  function init() {
    bind();
    Store.loadLocal();
    Store.onChange(scheduleAutoPush); // setiap perubahan data terjadwal untuk auto-push (kalau aktif)
    els.orgTitle.textContent = Store.loadTitle();
    const savedGrid = localStorage.getItem(LS_GRID);
    applyGridPref(savedGrid === null ? true : savedGrid === '1');
    const savedStacked = localStorage.getItem(LS_ORIENTATION) === 'vertical';
    defaultOrientation = savedStacked ? 'vertical' : 'horizontal';
    els.btnOrientation.textContent = savedStacked ? '⇅ Default: Vertikal' : '⇄ Default: Horizontal';
    const cfg = Store.loadConfig();
    if (cfg && cfg.owner && cfg.repo) setStatus('Terkonfigurasi untuk ' + cfg.owner + '/' + cfg.repo);
    else setStatus('Belum tersambung ke GitHub');
    rerender();
    if (Store.getAll().length > 0) {
      els.lastSaved.textContent = 'dimuat dari penyimpanan lokal · ' + stamp();
    }

    // Sinkron otomatis: kalau sebelumnya diaktifkan DAN GitHub sudah
    // dikonfigurasi, langsung tarik versi terbaru saat halaman dibuka
    // (supaya siapa pun yang baru buka langsung lihat versi terkini),
    // lalu mulai memeriksa pembaruan secara berkala selama tab terbuka.
    autoSyncEnabled = localStorage.getItem(LS_AUTOSYNC) === '1' && !!(cfg && cfg.owner && cfg.repo);
    updateAutoSyncButton();
    if (autoSyncEnabled) {
      checkForRemoteUpdates().then(() => startAutoSyncPolling());
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
