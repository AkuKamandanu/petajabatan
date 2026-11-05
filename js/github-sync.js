/**
 * github-sync.js
 * Menggunakan GitHub Contents API agar repo GitHub berfungsi sebagai
 * "database online". Versi ini memperbaiki: cache peramban yang membuat
 * tarik selalu kosong, konflik versi "does not match", dan push tumpang tindih.
 */
const GithubSync = (() => {

  // cache:'no-store' WAJIB: tanpa ini peramban boleh menyajikan balasan GET lama
  // (mis. 404/kosong dari sebelum berkas disimpan), sehingga tarik terus kosong.
  async function safeFetch(url, opts) {
    try {
      return await fetch(url, { ...opts, cache: 'no-store' });
    } catch (err) {
      throw new Error(
        'Gagal menghubungi GitHub ("Failed to fetch"). Penyebab paling umum: ' +
        '(1) halaman dibuka dari berkas lokal (file://) — akses lewat alamat GitHub Pages https://; ' +
        '(2) pemblokir iklan/ekstensi privasi/firewall memblokir api.github.com; ' +
        '(3) tidak ada koneksi internet.'
      );
    }
  }

  function cleanSegment(s) { return String(s || '').trim().replace(/^\/+|\/+$/g, ''); }
  function encodedPath(path) {
    return cleanSegment(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }
  function repoUrl(cfg) {
    return `https://api.github.com/repos/${encodeURIComponent(cleanSegment(cfg.owner))}/${encodeURIComponent(cleanSegment(cfg.repo))}`;
  }
  function apiUrl(cfg) {
    // "_=" pemecah cache: nilainya selalu berubah agar cache apa pun melewatinya
    return `${repoUrl(cfg)}/contents/${encodedPath(cfg.path)}?ref=${encodeURIComponent(cleanSegment(cfg.branch) || 'main')}&_=${Date.now()}`;
  }
  function headers(cfg) {
    const h = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (cfg.token) h['Authorization'] = `Bearer ${cleanSegment(cfg.token)}`;
    return h;
  }

  async function describeError(resp, fallback) {
    let detail = '';
    try {
      const body = await resp.json();
      if (body && body.message) detail = body.message;
    } catch (e) {}
    const rl = resp.headers.get('x-ratelimit-remaining');
    if (resp.status === 403 && rl === '0') {
      return 'Batas permintaan GitHub API tercapai. Tunggu beberapa menit lalu coba lagi.';
    }
    // "does not match" = konflik VERSI (sha basi), bukan masalah format data.
    if ((resp.status === 409 || resp.status === 422) && /does not match/i.test(detail)) {
      return 'Konflik versi: berkas di GitHub sudah berubah sejak terakhir diambil (bukan soal format data). ' +
        'Tarik dulu versi terbaru lewat "Tarik dari GitHub", lalu simpan lagi.';
    }
    return detail ? `${fallback} — GitHub: "${detail}"` : `${fallback} (status ${resp.status})`;
  }

  async function testConnection(cfg) {
    const resp = await safeFetch(repoUrl(cfg), { headers: headers(cfg) });
    if (resp.status === 404) throw new Error('Repositori tidak ditemukan (periksa owner/nama repo, atau token perlu akses).');
    if (resp.status === 401) throw new Error(await describeError(resp, 'Token tidak valid'));
    if (!resp.ok) throw new Error(await describeError(resp, 'GitHub merespons dengan error'));
    return resp.json();
  }

  // Pemeriksaan ringan lewat DAFTAR FOLDER (hanya metadata, tanpa isi berkas) — penting
  // untuk berkas besar, karena polling berkala tidak perlu mengunduh ratusan KB tiap kali.
  async function getRemoteSha(cfg) {
    const parts = cleanSegment(cfg.path).split('/').filter(Boolean);
    const name = parts.pop();
    const dir = parts.map(encodeURIComponent).join('/');
    const listUrl = `${repoUrl(cfg)}/contents${dir ? '/' + dir : ''}?ref=${encodeURIComponent(cleanSegment(cfg.branch) || 'main')}&_=${Date.now()}`;
    const lr = await safeFetch(listUrl, { headers: headers(cfg) });
    if (lr.ok) {
      const list = await lr.json();
      if (Array.isArray(list)) {
        const entry = list.find(x => x.name === name && x.type === 'file');
        return entry ? entry.sha : null;
      }
    } else if (lr.status === 404) {
      return null; // folder (dan berkas) belum ada
    } else if (lr.status === 401 || lr.status === 403) {
      throw new Error(await describeError(lr, 'Token tidak valid atau tidak punya izin membaca repo ini'));
    }
    // cadangan: cara lama (unduh berkas)
    const resp = await safeFetch(apiUrl(cfg), { headers: headers(cfg) });
    if (resp.status === 404) return null;
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(await describeError(resp, 'Token tidak valid atau tidak punya izin membaca repo ini'));
    }
    if (!resp.ok) throw new Error(await describeError(resp, 'Gagal memeriksa status berkas'));
    return (await resp.json()).sha;
  }

  async function pull(cfg) {
    const resp = await safeFetch(apiUrl(cfg), { headers: headers(cfg) });
    if (resp.status === 404) throw new Error('Berkas belum ada di repo. Gunakan "Simpan ke GitHub" untuk membuatnya.');
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(await describeError(resp, 'Token tidak valid atau tidak punya izin membaca repo ini'));
    }
    if (!resp.ok) throw new Error(await describeError(resp, 'Gagal menarik data'));
    const data = await resp.json();
    const b64 = (data.content || '').replace(/\s/g, '');
    const gagalBaca = (err) => new Error(
      `Berkas ditemukan di GitHub tapi gagal dibaca sebagai Excel (${err.message}). ` +
      'Pastikan path/berkas yang dituju memang hasil ekspor aplikasi ini, bukan berkas lain yang kebetulan memakai nama sama.'
    );
    let employees;
    if (b64) {
      try { employees = XlsxIO.fromBase64(b64); } catch (err) { throw gagalBaca(err); }
    } else if (data.size > 0 || data.encoding === 'none') {
      // API GitHub hanya menyertakan isi berkas sampai 1 MB; di atas itu kolom "content" KOSONG
      // (inilah penyebab data besar terbaca "kosong"). Ambil isinya lewat media type "raw".
      const raw = await safeFetch(apiUrl(cfg), { headers: { ...headers(cfg), 'Accept': 'application/vnd.github.raw+json' } });
      if (!raw.ok) throw new Error(await describeError(raw, 'Gagal mengambil berkas besar dari GitHub'));
      try { employees = XlsxIO.fromArrayBuffer(await raw.arrayBuffer()); } catch (err) { throw gagalBaca(err); }
    } else {
      employees = []; // berkas memang 0 byte
    }
    return { employees, sha: data.sha };
  }

  let pushInFlight = null; // mutex: cegah dua push berjalan bersamaan

  async function push(cfg, employees, commitMessage) {
    if (pushInFlight) { await pushInFlight.catch(() => {}); }
    const attempt = doPush(cfg, employees, commitMessage);
    pushInFlight = attempt;
    try { return await attempt; }
    finally { if (pushInFlight === attempt) pushInFlight = null; }
  }

  async function doPush(cfg, employees, commitMessage, isRetry) {
    let sha;
    const getResp = await safeFetch(apiUrl(cfg), { headers: headers(cfg) });
    if (getResp.ok) {
      sha = (await getResp.json()).sha;
    } else if (getResp.status !== 404) {
      if (getResp.status === 401 || getResp.status === 403) {
        throw new Error(await describeError(getResp, 'Token tidak valid atau tidak punya izin menulis repo ini'));
      }
      throw new Error(await describeError(getResp, 'Gagal memeriksa berkas sebelum menyimpan'));
    }
    const body = {
      message: commitMessage || `Perbarui struktur organisasi (${new Date().toISOString()})`,
      content: XlsxIO.toBase64(employees),
      branch: cleanSegment(cfg.branch) || 'main'
    };
    if (sha) body.sha = sha;

    const putResp = await safeFetch(`${repoUrl(cfg)}/contents/${encodedPath(cfg.path)}`, {
      method: 'PUT',
      headers: { ...headers(cfg), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    if (!putResp.ok) {
      // Konflik versi: coba SEKALI lagi otomatis dengan sha terbaru.
      if (!isRetry && (putResp.status === 409 || putResp.status === 422)) {
        const b = await putResp.json().catch(() => ({}));
        if (/does not match/i.test(b.message || '')) return doPush(cfg, employees, commitMessage, true);
        throw new Error(await describeError({ status: putResp.status, headers: putResp.headers, json: async () => b }, 'Gagal menyimpan'));
      }
      throw new Error(await describeError(putResp, 'Gagal menyimpan'));
    }
    const result = await putResp.json();
    return { sha: result && result.content ? result.content.sha : null, raw: result };
  }

  // Baca berkas data yang ikut di-publish GitHub Pages (satu alamat/origin dengan aplikasi).
  // Tidak butuh token, repo, atau pengaturan apa pun — cocok untuk pengunjung baru/incognito.
  // Catatan: GitHub Pages butuh ±1–2 menit setelah penyimpanan sebelum berkas publiknya diperbarui.
  async function fetchPublished(path) {
    const rel = cleanSegment(path || 'data/struktur-organisasi.xlsx');
    let resp;
    try {
      resp = await fetch(`${rel}?_=${Date.now()}`, { cache: 'no-store' });
    } catch (err) {
      throw new Error('Tidak dapat membuka berkas publik (buka aplikasi lewat alamat https:// GitHub Pages, bukan file://).');
    }
    if (!resp.ok) throw new Error(`Berkas publik belum tersedia di GitHub Pages (status ${resp.status}).`);
    try {
      return XlsxIO.fromArrayBuffer(await resp.arrayBuffer());
    } catch (err) {
      throw new Error('Berkas publik ditemukan tetapi gagal dibaca sebagai Excel: ' + err.message);
    }
  }

  return { testConnection, pull, push, getRemoteSha, fetchPublished };
})();
