/**
 * store.js
 * Menyimpan data karyawan (state aplikasi) dan konfigurasi GitHub.
 * Sumber kebenaran saat aplikasi berjalan: variabel `Store.employees` di memori.
 * Setiap perubahan otomatis ditulis ke localStorage (penyimpanan lokal / offline).
 */
const Store = (() => {
  const LS_EMPLOYEES = 'orgchart_employees_v1';
  const LS_CONFIG     = 'orgchart_github_config_v1';
  const LS_TITLE       = 'orgchart_title_v1';
  const MAX_HISTORY = 50;

  let employees = [];
  let undoStack = [];
  let redoStack = [];
  let changeListeners = [];

  // Dipanggil oleh app.js untuk didaftar sebagai pendengar setiap kali data
  // berubah dan tersimpan lokal — dipakai sebagai pemicu auto-sync ke GitHub.
  function onChange(fn) { changeListeners.push(fn); }
  function notifyChange() {
    changeListeners.forEach(fn => {
      try { fn(); } catch (e) { console.error('Listener onChange gagal', e); }
    });
  }

  function snapshot() {
    return JSON.parse(JSON.stringify(employees));
  }

  // Dipanggil SEBELUM setiap perubahan data (tambah/sunting/hapus/impor),
  // menyimpan kondisi SEBELUM perubahan ke tumpukan undo. Melakukan aksi
  // baru setelah undo akan menghapus tumpukan redo (perilaku standar
  // undo/redo di kebanyakan aplikasi).
  function pushHistory() {
    undoStack.push(snapshot());
    if (undoStack.length > MAX_HISTORY) undoStack.shift();
    redoStack = [];
  }

  function canUndo() { return undoStack.length > 0; }
  function canRedo() { return redoStack.length > 0; }

  function undo() {
    if (!canUndo()) return false;
    redoStack.push(snapshot());
    employees = undoStack.pop();
    saveLocal();
    return true;
  }

  function redo() {
    if (!canRedo()) return false;
    undoStack.push(snapshot());
    employees = redoStack.pop();
    saveLocal();
    return true;
  }

  function genId() {
    return 'K' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem(LS_EMPLOYEES);
      employees = raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('Gagal membaca penyimpanan lokal', e);
      employees = [];
    }
    return employees;
  }

  function saveLocal({ silent = false } = {}) {
    try {
      localStorage.setItem(LS_EMPLOYEES, JSON.stringify(employees));
      if (!silent) notifyChange();
      return true;
    } catch (e) {
      console.error('Gagal menyimpan ke penyimpanan lokal', e);
      return false;
    }
  }

  function getAll() { return employees; }

  function setAll(list, opts = {}) {
    pushHistory();
    employees = list.map(e => {
      const rawId = e.id ?? e.ID;
      const id = (rawId === undefined || rawId === null || String(rawId).trim() === '')
        ? genId()
        : String(rawId).trim();
      const rawParent = e.parentId ?? e.Atasan_ID ?? e.ParentID;
      const parentId = (rawParent === undefined || rawParent === null || String(rawParent).trim() === '')
        ? ''
        : String(rawParent).trim();
      const rawKategori = (e.kategori ?? e.Kategori ?? '').toString().trim().toLowerCase();
      const kategori = (rawKategori === 'pelaksana' || rawKategori === 'fungsional') ? rawKategori : '';
      const rawOrient = (e.childOrientation ?? e.Orientasi_Cabang ?? '').toString().trim().toLowerCase();
      const childOrientation = (rawOrient === 'horizontal' || rawOrient === 'vertikal' || rawOrient === 'vertical')
        ? (rawOrient === 'horizontal' ? 'horizontal' : 'vertical')
        : '';
      const rawArr = (e.selfArrangement ?? e.Susunan_Sendiri ?? '').toString().trim().toLowerCase();
      const selfArrangement = (rawArr === 'horizontal' || rawArr === 'vertikal' || rawArr === 'vertical')
        ? (rawArr === 'horizontal' ? 'horizontal' : 'vertical')
        : '';
      return {
        id,
        jabatan: e.jabatan ?? e.Jabatan ?? '',
        parentId,
        kelasJabatan: e.kelasJabatan ?? e.Kelas_Jabatan ?? '',
        bezetting: e.bezetting ?? e.Bezetting ?? '',
        kebutuhan: e.kebutuhan ?? e.Kebutuhan ?? '',
        kekuranganKelebihan: e.kekuranganKelebihan ?? e.Kekurangan_Kelebihan ?? '',
        abk: e.abk ?? e.ABK ?? '',
        keterangan: e.keterangan ?? e.Keterangan ?? '',
        kategori,
        childOrientation,
        selfArrangement
      };
    });
    saveLocal({ silent: !!opts.silent });
  }

  function upsert(node) {
    pushHistory();
    const idx = employees.findIndex(e => e.id === node.id);
    if (idx === -1) {
      employees.push(node);
    } else {
      employees[idx] = node;
    }
    saveLocal();
  }

  // Terapkan perubahan ke BANYAK jabatan sekaligus (mis. dari mode "Pilih
  // Banyak") sebagai SATU langkah histori — supaya satu kali Undo membatalkan
  // seluruh aksi massal itu, bukan hanya satu jabatan pada satu waktu.
  function batchUpdate(ids, updaterFn) {
    pushHistory();
    ids.forEach(id => {
      const idx = employees.findIndex(e => e.id === id);
      if (idx !== -1) employees[idx] = updaterFn(employees[idx]);
    });
    saveLocal();
  }

  function remove(id, { reparentChildren = true } = {}) {
    const node = employees.find(e => e.id === id);
    if (!node) return;
    pushHistory();
    const children = employees.filter(e => e.parentId === id);
    if (reparentChildren) {
      children.forEach(c => { c.parentId = node.parentId || ''; });
    }
    employees = employees.filter(e => e.id !== id);
    saveLocal();
  }

  function getDescendantIds(id) {
    const result = new Set();
    const stack = [id];
    while (stack.length) {
      const current = stack.pop();
      employees.filter(e => e.parentId === current).forEach(c => {
        result.add(c.id);
        stack.push(c.id);
      });
    }
    return result;
  }

  function loadConfig() {
    try {
      const raw = localStorage.getItem(LS_CONFIG);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveConfig(cfg) {
    localStorage.setItem(LS_CONFIG, JSON.stringify(cfg));
  }

  function loadTitle() {
    return localStorage.getItem(LS_TITLE) || 'Peta Jabatan Organisasi';
  }
  function saveTitle(t) {
    localStorage.setItem(LS_TITLE, t);
  }

  return {
    genId, loadLocal, saveLocal, getAll, setAll, upsert, remove, batchUpdate,
    getDescendantIds, loadConfig, saveConfig, loadTitle, saveTitle,
    undo, redo, canUndo, canRedo, onChange
  };
})();
