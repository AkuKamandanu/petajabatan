/**
 * xlsx-io.js
 * Baca/tulis berkas Excel (.xlsx) sebagai "database" bagan organisasi.
 * Kolom yang dipakai: ID, Jabatan, Atasan_ID, Keterangan, Bezetting
 */
const XlsxIO = (() => {
  const SHEET_NAME = 'Struktur Organisasi';
  const COLUMNS = ['ID', 'Jabatan', 'Atasan_ID', 'Keterangan', 'Bezetting', 'Kategori', 'Orientasi_Cabang', 'Susunan_Sendiri'];

  function employeesToWorkbook(employees) {
    const rows = employees.map(e => ({
      ID: e.id,
      Jabatan: e.jabatan,
      Atasan_ID: e.parentId,
      Keterangan: e.keterangan,
      Bezetting: e.bezetting,
      Kategori: e.kategori === 'pelaksana' ? 'Pelaksana' : e.kategori === 'fungsional' ? 'Jabatan Fungsional' : '',
      Orientasi_Cabang: e.childOrientation === 'horizontal' ? 'Horizontal' : e.childOrientation === 'vertical' ? 'Vertikal' : '',
      Susunan_Sendiri: e.selfArrangement === 'horizontal' ? 'Horizontal' : e.selfArrangement === 'vertical' ? 'Vertikal' : ''
    }));
    const ws = XLSX.utils.json_to_sheet(rows, { header: COLUMNS });
    ws['!cols'] = [
      { wch: 14 }, { wch: 28 }, { wch: 14 }, { wch: 36 }, { wch: 14 }, { wch: 18 }, { wch: 16 }, { wch: 16 }
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, SHEET_NAME);
    return wb;
  }

  function normalizeKategori(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (v === 'pelaksana') return 'pelaksana';
    if (v === 'fungsional' || v === 'jabatan fungsional') return 'fungsional';
    return '';
  }

  function normalizeOrientation(raw) {
    const v = String(raw ?? '').trim().toLowerCase();
    if (v === 'horizontal') return 'horizontal';
    if (v === 'vertikal' || v === 'vertical') return 'vertical';
    return '';
  }

  function workbookToEmployees(wb) {
    const sheetName = wb.SheetNames.includes(SHEET_NAME) ? SHEET_NAME : wb.SheetNames[0];
    const ws = wb.Sheets[sheetName];
    const json = XLSX.utils.sheet_to_json(ws, { defval: '' });
    const seen = new Set();
    return json.map(row => {
      const rawId = row.ID ?? row.id;
      let id = (rawId === undefined || rawId === null || String(rawId).trim() === '')
        ? Store.genId()
        : String(rawId).trim();
      // Jaga-jaga: jika ID sudah eksplisit tapi ternyata duplikat (mis. salah ketik
      // di Excel), buat ID baru agar setiap jabatan tetap unik dan bisa dijadikan
      // atasan/bawahan dengan benar setelah diimpor.
      if (seen.has(id)) id = Store.genId();
      seen.add(id);
      return {
        id,
        jabatan: String(row.Jabatan ?? row.jabatan ?? ''),
        parentId: row.Atasan_ID === '' || row.Atasan_ID == null || String(row.Atasan_ID).trim() === ''
          ? ''
          : String(row.Atasan_ID).trim(),
        keterangan: String(row.Keterangan ?? row.keterangan ?? ''),
        bezetting: String(row.Bezetting ?? row.bezetting ?? ''),
        kategori: normalizeKategori(row.Kategori ?? row.kategori),
        childOrientation: normalizeOrientation(row.Orientasi_Cabang ?? row.orientasi_cabang),
        selfArrangement: normalizeOrientation(row.Susunan_Sendiri ?? row.susunan_sendiri)
      };
    });
  }

  function exportDownload(employees, filename = 'struktur-organisasi.xlsx') {
    const wb = employeesToWorkbook(employees);
    XLSX.writeFile(wb, filename);
  }

  function toBase64(employees) {
    const wb = employeesToWorkbook(employees);
    return XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
  }

  function fromBase64(base64) {
    const wb = XLSX.read(base64, { type: 'base64' });
    return workbookToEmployees(wb);
  }

  function importFromFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const wb = XLSX.read(evt.target.result, { type: 'array' });
          resolve(workbookToEmployees(wb));
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = () => reject(new Error('Gagal membaca berkas.'));
      reader.readAsArrayBuffer(file);
    });
  }

  return { exportDownload, toBase64, fromBase64, importFromFile, employeesToWorkbook, workbookToEmployees };
})();
