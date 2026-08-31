/**
 * chart-render.js
 * Mengubah daftar karyawan (flat, dengan parentId) menjadi markup
 * <ul class="tree"> bersarang, lalu memasang event untuk aksi tiap simpul.
 */
const ChartRender = (() => {
  let collapsed = new Set();   // id simpul yang anaknya disembunyikan
  let searchTerm = '';
  let selectedIds = new Set(); // dipakai saat mode "pilih banyak" aktif
  let selectMode = false;

  function buildChildrenMap(employees) {
    const map = new Map();
    employees.forEach(e => {
      const key = e.parentId && employees.some(p => p.id === e.parentId) ? e.parentId : '__root__';
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    });
    return map;
  }

  function escapeHtml(str) {
    return String(str ?? '').replace(/[&<>"']/g, s => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[s]));
  }

  function matches(emp) {
    if (!searchTerm) return null;
    const hay = `${emp.jabatan} ${emp.keterangan} ${emp.bezetting}`.toLowerCase();
    return hay.includes(searchTerm);
  }

  function initials(text) {
    const parts = String(text || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }

  const KATEGORI_LABEL = { pelaksana: 'Pelaksana', fungsional: 'Jabatan Fungsional' };

  function groupBoxHtml(kategori, items, depth) {
    const label = KATEGORI_LABEL[kategori] || kategori;
    let html = `<li class="depth-${depth % 5} group-li" data-group-kategori="${kategori}">`;
    html += `<div class="node-shell">`;
    html += `<div class="group-card group-card--${kategori}">`;
    html += `<div class="group-card__head">
                <span class="group-card__title">${escapeHtml(label)}</span>
                <button class="node-mini-btn group-add-btn" data-kategori="${kategori}" title="Tambah ${escapeHtml(label)}">+</button>
              </div>`;
    html += `<table class="group-card__table"><thead><tr><th>Jabatan</th><th>Bezetting</th><th>Keterangan</th><th></th></tr></thead><tbody>`;
    items.forEach(it => {
      html += `<tr>
        <td>${escapeHtml(it.jabatan) || '(tanpa nama)'}</td>
        <td>${escapeHtml(it.bezetting) || '—'}</td>
        <td>${escapeHtml(it.keterangan) || '—'}</td>
        <td><button class="group-row-edit" data-id="${escapeHtml(it.id)}" title="Sunting">✎</button></td>
      </tr>`;
    });
    html += `</tbody></table>`;
    html += `</div></div></li>`;
    return html;
  }

  function nodeHtml(emp, depth, childrenMap, defaultOrientation) {
    const allKids = childrenMap.get(emp.id) || [];
    const normalKids = allKids.filter(k => !k.kategori);
    const pelaksanaKids = allKids.filter(k => k.kategori === 'pelaksana');
    const fungsionalKids = allKids.filter(k => k.kategori === 'fungsional');

    // Orientasi DEFAULT untuk anak-anak jabatan ini (dari pengaturan jabatan
    // ini sendiri, atau kalau tidak ada, dari default bagan). Ini hanya
    // dipakai sebagai FALLBACK — tiap anak bisa menimpanya sendiri lewat
    // "Susunan Sendiri" pada dirinya masing-masing (lihat di bawah).
    const parentDefault = emp.childOrientation || defaultOrientation || 'horizontal';

    // Pisahkan anak-anak struktural menjadi dua kelompok berdasarkan susunan
    // EFEKTIF masing-masing: kalau anak itu sendiri sudah diatur (selfArrangement),
    // pengaturannya menang — apa pun kata induknya. Kalau belum diatur, ikuti
    // default dari induk. Inilah yang memungkinkan sebagian anak tampil baris
    // (horizontal) sementara anak lain di bawah induk yang SAMA tampil
    // bertumpuk (vertikal) secara bersamaan.
    const rowKids = [];
    const stackedKids = [];
    normalKids.forEach(k => {
      const effective = k.selfArrangement || parentDefault;
      if (effective === 'vertical') stackedKids.push(k); else rowKids.push(k);
    });

    const hasDown = rowKids.length > 0 || pelaksanaKids.length > 0 || fungsionalKids.length > 0;
    const hasRight = stackedKids.length > 0;
    const hasKids = hasDown || hasRight;
    const isCollapsed = collapsed.has(emp.id);
    const m = matches(emp);
    const cardClasses = ['node-card'];
    if (m === true) cardClasses.push('match');
    if (m === false) cardClasses.push('dim');
    if (selectMode && selectedIds.has(emp.id)) cardClasses.push('selected');
    if (emp.childOrientation) cardClasses.push('orientation-override');
    const safeId = escapeHtml(emp.id);

    let liClasses = [`depth-${depth % 5}`];
    let branchMode = 'none'; // 'down' | 'right' | 'dual'
    if (hasKids && !isCollapsed) {
      if (hasDown && hasRight) {
        branchMode = 'dual';
        liClasses.push('has-children', 'dual-branch');
      } else if (hasRight) {
        branchMode = 'right';
        liClasses.push('has-children', 'branch-h-parent');
      } else {
        branchMode = 'down';
        liClasses.push('has-children');
      }
    }

    let html = `<li class="${liClasses.join(' ')}" data-id="${safeId}">`;
    html += `<div class="node-shell">`;
    html += `<div class="${cardClasses.join(' ')}" data-id="${safeId}" tabindex="0" role="button" aria-label="Buka detail ${escapeHtml(emp.jabatan)}">`;
    html += `<div class="node-card__actions">
                <button class="node-mini-btn" data-action="focus" title="Fokus: tampilkan hanya jabatan ini + turunannya">⌕</button>
                <button class="node-mini-btn" data-action="add" title="Tambah bawahan">+</button>
                <button class="node-mini-btn" data-action="edit" title="Sunting">✎</button>
              </div>`;
    html += `<div class="node-card__head">`;
    html += `<span class="node-avatar">${escapeHtml(initials(emp.jabatan))}</span>`;
    html += `<div class="node-card__id">
                <p class="node-card__title">${escapeHtml(emp.jabatan) || '(Jabatan belum diisi)'}</p>
              </div>`;
    html += `</div>`;
    if (emp.keterangan) {
      html += `<p class="node-card__ket" title="${escapeHtml(emp.keterangan)}">${escapeHtml(emp.keterangan)}</p>`;
    }
    if (emp.bezetting || normalKids.length > 0 || emp.childOrientation || emp.selfArrangement) {
      html += `<div class="node-card__meta">`;
      if (emp.bezetting) html += `<span class="badge badge--bezetting">Bezetting: ${escapeHtml(emp.bezetting)}</span>`;
      if (normalKids.length > 0) html += `<span class="badge">${normalKids.length} bawahan</span>`;
      if (emp.childOrientation) html += `<span class="badge badge--orientation">${emp.childOrientation === 'horizontal' ? '⇄ cabang horizontal' : '⇅ cabang vertikal'}</span>`;
      if (emp.selfArrangement) html += `<span class="badge badge--self">${emp.selfArrangement === 'horizontal' ? '◇ posisi: baris' : '◇ posisi: tumpuk'}</span>`;
      html += `</div>`;
    }
    html += `</div>`;
    if (hasKids) {
      html += `<button class="toggle-btn" data-toggle="${safeId}" title="${isCollapsed ? 'Perluas' : 'Ciutkan'}">${isCollapsed ? '+' : '−'}</button>`;
    }
    html += `</div>`; // .node-shell

    if (branchMode === 'dual') {
      html += `<ul>`;
      rowKids.forEach(child => { html += nodeHtml(child, depth + 1, childrenMap, defaultOrientation); });
      if (pelaksanaKids.length > 0) html += groupBoxHtml('pelaksana', pelaksanaKids, depth + 1);
      if (fungsionalKids.length > 0) html += groupBoxHtml('fungsional', fungsionalKids, depth + 1);
      html += `</ul>`;
      html += `<ul class="branch-h">`;
      stackedKids.forEach(child => { html += nodeHtml(child, depth + 1, childrenMap, defaultOrientation); });
      html += `</ul>`;
    } else if (branchMode === 'right') {
      html += `<ul class="branch-h">`;
      stackedKids.forEach(child => { html += nodeHtml(child, depth + 1, childrenMap, defaultOrientation); });
      html += `</ul>`;
    } else if (branchMode === 'down') {
      html += `<ul>`;
      rowKids.forEach(child => { html += nodeHtml(child, depth + 1, childrenMap, defaultOrientation); });
      if (pelaksanaKids.length > 0) html += groupBoxHtml('pelaksana', pelaksanaKids, depth + 1);
      if (fungsionalKids.length > 0) html += groupBoxHtml('fungsional', fungsionalKids, depth + 1);
      html += `</ul>`;
    }
    html += `</li>`;
    return html;
  }

  function render(employees, container, opts = {}) {
    if (opts.search !== undefined) searchTerm = opts.search.trim().toLowerCase();
    if (opts.selectMode !== undefined) selectMode = opts.selectMode;
    if (opts.selectedIds !== undefined) selectedIds = opts.selectedIds;
    const defaultOrientation = opts.defaultOrientation || 'horizontal';

    const childrenMap = buildChildrenMap(employees);
    const roots = childrenMap.get('__root__') || [];

    if (roots.length === 0) {
      container.innerHTML = '';
      return { total: employees.length, roots: 0 };
    }

    let html = '';
    roots.forEach(r => { html += nodeHtml(r, 0, childrenMap, defaultOrientation); });
    container.innerHTML = html;

    return { total: employees.length, roots: roots.length };
  }

  function toggleCollapse(id) {
    if (collapsed.has(id)) collapsed.delete(id); else collapsed.add(id);
  }

  function expandAllAncestorsOf(id, employees) {
    let current = employees.find(e => e.id === id);
    while (current && current.parentId) {
      collapsed.delete(current.parentId);
      current = employees.find(e => e.id === current.parentId);
    }
  }

  return { render, toggleCollapse, expandAllAncestorsOf };
})();
