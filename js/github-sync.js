/**
 * github-sync.js
 * Menggunakan GitHub Contents API agar repo GitHub berfungsi sebagai
 * "database online": berkas .xlsx di dalam repo dibaca/ditulis langsung
 * dari peramban, sehingga banyak perangkat bisa saling sinkron tanpa server.
 *
 * Dokumentasi API: https://docs.github.com/en/rest/repos/contents
 */
const GithubSync = (() => {

  // Bungkus fetch() supaya kegagalan JARINGAN (bukan respons HTTP error biasa,
  // tapi request yang sama sekali tidak sampai — browser melaporkannya sebagai
  // "Failed to fetch") diterjemahkan jadi pesan yang jelas penyebabnya, bukan
  // pesan generik dari browser yang membingungkan.
  async function safeFetch(url, opts) {
    try {
      return await fetch(url, opts);
    } catch (err) {
      throw new Error(
        'Gagal menghubungi GitHub ("Failed to fetch"). Penyebab paling umum: ' +
        '(1) halaman ini dibuka langsung dari berkas di komputer (alamatnya diawali "file://") — ' +
        'coba akses lewat alamat GitHub Pages yang sudah di-deploy (diawali "https://"), bukan dengan membuka index.html secara langsung; ' +
        '(2) ada pemblokir iklan/ekstensi privasi/firewall jaringan yang memblokir api.github.com — coba nonaktifkan sementara atau coba di jendela penyamaran; ' +
        'atau (3) tidak ada koneksi internet saat ini.'
      );
    }
  }

  // Owner/repo/path bisa saja tidak sengaja berisi spasi di ujung atau
  // karakter yang tidak valid untuk URL — dibersihkan & di-encode di sini
  // supaya tidak menghasilkan alamat API yang salah bentuk.
  function cleanSegment(s) {
    return String(s || '').trim().replace(/^\/+|\/+$/g, '');
  }
  function encodedPath(path) {
    return cleanSegment(path).split('/').filter(Boolean).map(encodeURIComponent).join('/');
  }

  function repoUrl(cfg) {
    return `https://api.github.com/repos/${encodeURIComponent(cleanSegment(cfg.owner))}/${encodeURIComponent(cleanSegment(cfg.repo))}`;
  }

  function apiUrl(cfg) {
    return `${repoUrl(cfg)}/contents/${encodedPath(cfg.path)}?ref=${encodeURIComponent(cleanSegment(cfg.branch) || 'main')}`;
  }

  function headers(cfg) {
    const h = {
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    };
    if (cfg.token) h['Authorization'] = `Bearer ${cleanSegment(cfg.token)}`;
    return h;
  }

  // Ambil pesan error ASLI dari GitHub (field "message" di body JSON-nya)
  // kalau ada, supaya penyebab gagal terlihat jelas — bukan cuma tebakan
  // generik "token tidak valid" untuk SEMUA kasus 401/403 (bisa saja itu
  // sebenarnya soal lain, mis. batas API tercapai, repo privat tanpa akses,
  // atau permission fine-grained token yang kurang tepat).
  async function describeError(resp, fallback) {
    let detail = '';
    try {
      const body = await resp.json();
      if (body && body.message) detail = body.message;
    } catch (e) { /* body bukan JSON / kosong, abaikan */ }
    const rateLimitRemaining = resp.headers.get('x-ratelimit-remaining');
    if (resp.status === 403 && rateLimitRemaining === '0') {
      return 'Batas permintaan GitHub API tercapai untuk saat ini. Tunggu beberapa menit lalu coba lagi (auto-sync akan mencoba lagi otomatis).';
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

  // Cek ringan: hanya mengambil sha berkas terbaru di GitHub, tanpa mem-parse
  // isi XLSX-nya. Dipakai untuk polling auto-sync berkala agar tidak boros
  // CPU/parsing kalau ternyata belum ada perubahan sama sekali.
  async function getRemoteSha(cfg) {
    const resp = await safeFetch(apiUrl(cfg), { headers: headers(cfg) });
    if (resp.status === 404) return null; // berkas belum ada di repo
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(await describeError(resp, 'Token tidak valid atau tidak punya izin membaca repo ini'));
    }
    if (!resp.ok) throw new Error(await describeError(resp, 'Gagal memeriksa status berkas'));
    const data = await resp.json();
    return data.sha;
  }

  async function pull(cfg) {
    const resp = await safeFetch(apiUrl(cfg), { headers: headers(cfg) });
    if (resp.status === 404) {
      throw new Error('Berkas belum ada di repo. Gunakan "Simpan ke GitHub" untuk membuatnya.');
    }
    if (resp.status === 401 || resp.status === 403) {
      throw new Error(await describeError(resp, 'Token tidak valid atau tidak punya izin membaca repo ini'));
    }
    if (!resp.ok) throw new Error(await describeError(resp, 'Gagal menarik data'));
    const data = await resp.json();
    let employees;
    try {
      const base64 = data.content.replace(/\n/g, '');
      employees = XlsxIO.fromBase64(base64);
    } catch (err) {
      throw new Error(
        `Berkas ditemukan di GitHub tapi gagal dibaca sebagai Excel (${err.message}). ` +
        'Pastikan path/berkas yang dituju memang hasil ekspor aplikasi ini, bukan berkas lain yang kebetulan memakai nama sama.'
      );
    }
    return { employees, sha: data.sha };
  }

  async function push(cfg, employees, commitMessage) {
    // Ambil sha terbaru jika berkas sudah ada, agar tidak menimpa perubahan orang lain secara diam-diam.
    let sha = undefined;
    const getResp = await safeFetch(apiUrl(cfg), { headers: headers(cfg) });
    if (getResp.ok) {
      const info = await getResp.json();
      sha = info.sha;
    } else if (getResp.status !== 404) {
      if (getResp.status === 401 || getResp.status === 403) {
        throw new Error(await describeError(getResp, 'Token tidak valid atau tidak punya izin menulis repo ini'));
      }
      throw new Error(await describeError(getResp, 'Gagal memeriksa berkas sebelum menyimpan'));
    }

    const base64Content = XlsxIO.toBase64(employees);
    const body = {
      message: commitMessage || `Perbarui struktur organisasi (${new Date().toISOString()})`,
      content: base64Content,
      branch: cleanSegment(cfg.branch) || 'main'
    };
    if (sha) body.sha = sha;

    const putResp = await safeFetch(`${repoUrl(cfg)}/contents/${encodedPath(cfg.path)}`, {
      method: 'PUT',
      headers: { ...headers(cfg), 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!putResp.ok) {
      throw new Error(await describeError(putResp, 'Gagal menyimpan'));
    }
    const result = await putResp.json();
    return { sha: result && result.content ? result.content.sha : null, raw: result };
  }

  return { testConnection, pull, push, getRemoteSha };
})();
