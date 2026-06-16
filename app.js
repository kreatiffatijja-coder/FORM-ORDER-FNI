/* =============================================
   Form Order FNI — app.js
   Fitur: Real-time order masuk ke admin,
          Manajemen multi-admin, Super Admin
   ============================================= */

/* ===== DEFAULT ADMIN LIST ===== */
const DEFAULT_ADMINS = [
  { username: 'admin', password: 'admin123', role: 'super', createdAt: '2025-01-01' }
];

/* ===== STATE ===== */
let isAdmin      = false;
let currentAdmin = null;
let orders       = load('fni_orders', []);
let admins       = load('fni_admins', DEFAULT_ADMINS);
let lastCount    = orders.length; // untuk deteksi order baru

/* ===== LOCAL STORAGE HELPERS ===== */
function load(key, def) {
  try { return JSON.parse(localStorage.getItem(key)) || def; }
  catch { return def; }
}
function save(key, data) {
  localStorage.setItem(key, JSON.stringify(data));
}
function saveOrders() { save('fni_orders', orders); }
function saveAdmins()  { save('fni_admins', admins); }

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', () => {
  setToday();
  renderTable();
  updateStats();
  startPolling();
});

function setToday() {
  const today = new Date().toISOString().split('T')[0];
  ['d_tgl','v_tgl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

/* ===== REAL-TIME POLLING =====
   Cek localStorage setiap 2 detik.
   Kalau ada order baru, update tampilan admin + tampilkan alert.
   Juga mendengarkan event 'storage' (lintas tab di browser yang sama).
*/
function startPolling() {
  // Lintas-tab: event storage hanya menyala di tab LAIN
  window.addEventListener('storage', e => {
    if (e.key === 'fni_orders') {
      const fresh = JSON.parse(e.newValue || '[]');
      handleFreshOrders(fresh);
    }
    if (e.key === 'fni_admins') {
      admins = JSON.parse(e.newValue || '[]');
      if (isAdmin) renderAdminList();
    }
  });

  // Polling untuk tab yang sama (submit dari tab lain dalam frame yang sama)
  setInterval(() => {
    const fresh = load('fni_orders', []);
    if (fresh.length !== orders.length || JSON.stringify(fresh[0]) !== JSON.stringify(orders[0])) {
      handleFreshOrders(fresh);
    }
  }, 2000);
}

function handleFreshOrders(fresh) {
  const prevLen = orders.length;
  orders = fresh;
  updateStats();
  renderTable();

  if (isAdmin) {
    renderAdminTable();
    updateAdminStats();

    const newCount = fresh.length - prevLen;
    if (newCount > 0) {
      // Notif dot di tab
      document.getElementById('notifDot').classList.remove('hidden');

      // Alert banner di dashboard
      const newest = fresh[0];
      document.getElementById('alertMsg').textContent =
        `🔔 Order baru masuk! ${newest.nama} (${newest.unit}) — ${newest.type === 'desain' ? 'Desain' : 'Video'} · ${fmtTime(newest.createdAt)}`;
      document.getElementById('newOrderAlert').classList.remove('hidden');

      // Toast
      showToast(`🔔 Order baru dari ${newest.nama} masuk!`);

      // Highlight baris baru
      setTimeout(() => {
        const rows = document.querySelectorAll('#adminBody tr');
        for (let i = 0; i < Math.min(newCount, rows.length); i++) {
          rows[i].classList.add('row-new');
          setTimeout(() => rows[i].classList.remove('row-new'), 6000);
        }
      }, 100);
    }
  }
  lastCount = fresh.length;
}

function dismissAlert() {
  document.getElementById('newOrderAlert').classList.add('hidden');
  document.getElementById('notifDot').classList.add('hidden');
}

/* ===== SUBMIT ORDER ===== */
function submitOrder(type) {
  const p = type === 'desain' ? 'd_' : 'v_';
  const nama      = val(p+'nama');
  const unit      = val(p+'unit');
  const pengajuan = val(p+'pengajuan');
  const tgl       = val(p+'tgl');
  const deadline  = val(p+'deadline');

  if (!nama || !unit || !pengajuan || !tgl || !deadline) {
    showToast('⚠️ Semua field wajib diisi!'); return;
  }
  if (deadline < tgl) {
    showToast('⚠️ Deadline tidak boleh sebelum tanggal pengajuan!'); return;
  }

  const order = {
    id: Date.now(), type, nama, unit, pengajuan, tgl, deadline,
    status: 'Pending',
    createdAt: new Date().toISOString()
  };

  orders.unshift(order);
  saveOrders(); // ini akan memicu storage event di tab admin lain

  clearForm(p);
  updateStats();
  renderTable();

  // Kalau admin sedang buka di tab yang sama
  if (isAdmin) {
    renderAdminTable();
    updateAdminStats();
    const el = document.getElementById('notifDot');
    if (el) el.classList.remove('hidden');
    document.getElementById('alertMsg').textContent =
      `🔔 Order baru masuk! ${nama} (${unit}) — ${type === 'desain' ? 'Desain' : 'Video'} · barusan`;
    document.getElementById('newOrderAlert').classList.remove('hidden');
    setTimeout(() => {
      const rows = document.querySelectorAll('#adminBody tr');
      if (rows[0]) { rows[0].classList.add('row-new'); setTimeout(() => rows[0].classList.remove('row-new'), 6000); }
    }, 100);
  }

  document.getElementById('successMsg').textContent =
    `Order ${type} dari ${nama} (${unit}) berhasil diajukan! Admin akan segera memprosesnya.`;
  showModal('successModal');
}

function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }

function clearForm(p) {
  ['nama','unit','pengajuan','tgl','deadline'].forEach(k => {
    const el = document.getElementById(p+k);
    if (!el) return;
    if (el.tagName === 'SELECT') el.value = '';
    else el.value = k === 'tgl' ? new Date().toISOString().split('T')[0] : '';
  });
}

/* ===== RENDER STATUS TABLE (PUBLIC) ===== */
function renderTable() {
  const tbody   = document.getElementById('statusBody');
  const empty   = document.getElementById('emptyState');
  const typeF   = document.getElementById('filterType')?.value   || '';
  const statusF = document.getElementById('filterStatus')?.value || '';
  const unitF   = document.getElementById('filterUnit')?.value   || '';

  let filtered = orders.filter(o =>
    (!typeF   || o.type   === typeF)   &&
    (!statusF || o.status === statusF) &&
    (!unitF   || o.unit   === unitF)
  );

  tbody.innerHTML = '';

  if (!filtered.length) {
    empty.classList.remove('hidden');
    tbody.closest('table').style.display = 'none';
    return;
  }

  empty.classList.add('hidden');
  tbody.closest('table').style.display = '';

  filtered.forEach((o, i) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;color:var(--gray-4)">${i+1}</td>
      <td>${typeBadge(o.type)}</td>
      <td style="font-weight:600">${esc(o.nama)}</td>
      <td><span style="background:var(--gray-2);border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600">${esc(o.unit)}</span></td>
      <td class="pengajuan-cell" title="${esc(o.pengajuan)}">${esc(o.pengajuan)}</td>
      <td>${fmtDate(o.tgl)}</td>
      <td>${fmtDate(o.deadline)}</td>
      <td>${statusBadge(o.status)}</td>
    `;
    tbody.appendChild(tr);
  });
}

/* ===== RENDER ADMIN TABLE ===== */
function renderAdminTable() {
  const tbody = document.getElementById('adminBody');
  const empty = document.getElementById('adminEmptyState');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!orders.length) {
    empty.classList.remove('hidden');
    tbody.closest('table').style.display = 'none';
    updateAdminStats();
    return;
  }

  empty.classList.add('hidden');
  tbody.closest('table').style.display = '';

  orders.forEach((o, i) => {
    const tr = document.createElement('tr');
    tr.setAttribute('data-id', o.id);
    tr.innerHTML = `
      <td style="font-weight:600;color:var(--gray-4)">${i+1}</td>
      <td>${typeBadge(o.type)}</td>
      <td style="font-weight:600">${esc(o.nama)}</td>
      <td><span style="background:var(--gray-2);border-radius:4px;padding:2px 8px;font-size:12px;font-weight:600">${esc(o.unit)}</span></td>
      <td class="pengajuan-cell" title="${esc(o.pengajuan)}">${esc(o.pengajuan)}</td>
      <td>${fmtDate(o.tgl)}</td>
      <td>${fmtDate(o.deadline)}</td>
      <td><span class="time-badge">${fmtTime(o.createdAt)}</span></td>
      <td>${statusBadge(o.status)}</td>
      <td>
        <div style="display:flex;gap:6px;align-items:center">
          <select class="status-select" onchange="updateStatus(${o.id}, this.value)">
            <option ${o.status==='Pending'       ?'selected':''} value="Pending">Pending</option>
            <option ${o.status==='Terkonfirmasi' ?'selected':''} value="Terkonfirmasi">Terkonfirmasi</option>
            <option ${o.status==='Done'          ?'selected':''} value="Done">Done</option>
          </select>
          <button class="btn-delete" onclick="deleteOrder(${o.id})" title="Hapus">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });

  updateAdminStats();
}

/* ===== RENDER ADMIN LIST ===== */
function renderAdminList() {
  const tbody = document.getElementById('adminListBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  admins.forEach((a, i) => {
    const isSuper = a.role === 'super';
    const isMe    = a.username === currentAdmin?.username;
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td style="font-weight:600;color:var(--gray-4)">${i+1}</td>
      <td style="font-weight:700">${esc(a.username)} ${isMe ? '<span style="background:#D1FAE5;color:#065F46;border-radius:4px;padding:1px 6px;font-size:10px;font-weight:700">Kamu</span>' : ''}</td>
      <td>${isSuper
        ? '<span class="role-badge role-super">⭐ Super Admin</span>'
        : '<span class="role-badge role-admin">Admin</span>'}</td>
      <td style="font-size:12px;color:var(--gray-4)">${a.createdAt || '-'}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-action" onclick="openChangePass('${esc(a.username)}')">Ganti Password</button>
          ${!isSuper
            ? `<button class="btn-action danger" onclick="removeAdmin('${esc(a.username)}')">Hapus</button>`
            : '<span style="font-size:11px;color:var(--gray-3);padding:5px 4px">Terlindungi</span>'}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

/* ===== UPDATE STATUS ===== */
function updateStatus(id, newStatus) {
  const o = orders.find(x => x.id === id);
  if (!o) return;
  o.status = newStatus;
  saveOrders();
  renderTable();
  renderAdminTable();
  updateStats();
  showToast(`✅ Status diperbarui: ${newStatus}`);
}

/* ===== DELETE ORDER ===== */
function deleteOrder(id) {
  if (!confirm('Hapus order ini? Tindakan tidak bisa dibatalkan.')) return;
  orders = orders.filter(x => x.id !== id);
  saveOrders();
  renderTable();
  renderAdminTable();
  updateStats();
  showToast('🗑️ Order berhasil dihapus');
}

/* ===== STATS ===== */
function updateStats() {
  document.getElementById('statTotal').textContent   = orders.length;
  document.getElementById('statPending').textContent = orders.filter(o => o.status==='Pending').length;
  document.getElementById('statDone').textContent    = orders.filter(o => o.status==='Done').length;
}
function updateAdminStats() {
  document.getElementById('aTotal').textContent      = orders.length;
  document.getElementById('aPending').textContent    = orders.filter(o => o.status==='Pending').length;
  document.getElementById('aDone').textContent       = orders.filter(o => o.status==='Done').length;
  document.getElementById('aKonfirmasi').textContent = orders.filter(o => o.status==='Terkonfirmasi').length;
}

/* ===== TABS ===== */
function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-'+tab).classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`).classList.add('active');

  if (tab === 'status') renderTable();
  if (tab === 'admin')  { renderAdminTable(); dismissAlert(); }
  if (tab === 'kelola') renderAdminList();
}

/* ===== ADMIN LOGIN ===== */
function showAdminLogin() {
  if (isAdmin) { switchTab('admin'); return; }
  document.getElementById('loginUser').value = '';
  document.getElementById('loginPass').value = '';
  document.getElementById('loginError').classList.add('hidden');
  showModal('loginModal');
}

function doLogin() {
  const u = document.getElementById('loginUser').value.trim();
  const p = document.getElementById('loginPass').value;
  const match = admins.find(a => a.username === u && a.password === p);

  if (match) {
    isAdmin = true;
    currentAdmin = match;
    closeModal('loginModal');
    document.getElementById('btnAdminLogin').classList.add('hidden');
    document.getElementById('adminBadge').classList.remove('hidden');
    document.getElementById('adminBadgeName').textContent = match.role === 'super' ? '⭐ ' + match.username : match.username;
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    switchTab('admin');
    showToast('🔐 Login berhasil! Selamat datang, ' + match.username);
  } else {
    document.getElementById('loginError').classList.remove('hidden');
    document.getElementById('loginPass').value = '';
  }
}

function adminLogout() {
  isAdmin = false;
  currentAdmin = null;
  document.getElementById('btnAdminLogin').classList.remove('hidden');
  document.getElementById('adminBadge').classList.add('hidden');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  switchTab('order');
  showToast('👋 Logout berhasil');
}

/* ===== TAMBAH ADMIN ===== */
function addAdmin() {
  const u  = document.getElementById('newAdminUser').value.trim();
  const p  = document.getElementById('newAdminPass').value;
  const p2 = document.getElementById('newAdminPass2').value;
  const errEl = document.getElementById('addAdminError');

  errEl.classList.add('hidden');

  if (!u || !p || !p2) { showErr(errEl, 'Semua field wajib diisi!'); return; }
  if (p.length < 6)     { showErr(errEl, 'Password minimal 6 karakter!'); return; }
  if (p !== p2)         { showErr(errEl, 'Konfirmasi password tidak cocok!'); return; }
  if (admins.find(a => a.username === u)) { showErr(errEl, 'Username sudah digunakan!'); return; }

  admins.push({
    username: u, password: p, role: 'admin',
    createdAt: new Date().toISOString().split('T')[0]
  });
  saveAdmins();

  // Clear form
  ['newAdminUser','newAdminPass','newAdminPass2'].forEach(id => document.getElementById(id).value = '');
  closeModal('addAdminModal');
  renderAdminList();
  showToast(`✅ Admin "${u}" berhasil ditambahkan!`);
}

/* ===== HAPUS ADMIN ===== */
function removeAdmin(username) {
  const target = admins.find(a => a.username === username);
  if (!target || target.role === 'super') {
    showToast('⛔ Super Admin tidak bisa dihapus!'); return;
  }
  if (!confirm(`Hapus admin "${username}"? Admin ini tidak bisa login lagi.`)) return;

  admins = admins.filter(a => a.username !== username);
  saveAdmins();
  renderAdminList();
  showToast(`🗑️ Admin "${username}" berhasil dihapus`);
}

/* ===== GANTI PASSWORD ===== */
function openChangePass(username) {
  document.getElementById('changePassTarget').textContent = username;
  document.getElementById('changePassUsername').value     = username;
  document.getElementById('changePassNew').value   = '';
  document.getElementById('changePassNew2').value  = '';
  document.getElementById('changePassError').classList.add('hidden');
  showModal('changePassModal');
}

function doChangePass() {
  const username = document.getElementById('changePassUsername').value;
  const p        = document.getElementById('changePassNew').value;
  const p2       = document.getElementById('changePassNew2').value;
  const errEl    = document.getElementById('changePassError');

  errEl.classList.add('hidden');

  if (!p || !p2)    { showErr(errEl, 'Semua field wajib diisi!'); return; }
  if (p.length < 6) { showErr(errEl, 'Password minimal 6 karakter!'); return; }
  if (p !== p2)     { showErr(errEl, 'Konfirmasi password tidak cocok!'); return; }

  const a = admins.find(x => x.username === username);
  if (!a) { showErr(errEl, 'Admin tidak ditemukan!'); return; }

  a.password = p;
  saveAdmins();

  // Jika mengubah password diri sendiri, update currentAdmin
  if (currentAdmin?.username === username) currentAdmin.password = p;

  closeModal('changePassModal');
  showToast(`✅ Password "${username}" berhasil diperbarui`);
}

function showErr(el, msg) {
  el.textContent = msg;
  el.classList.remove('hidden');
}

/* ===== MODAL ===== */
function showModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }

document.addEventListener('click', e => {
  if (e.target.classList.contains('modal-overlay')) e.target.classList.add('hidden');
});

/* ===== TOAST ===== */
let toastTimer;
function showToast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.add('hidden'), 3500);
}

/* ===== HELPERS ===== */
function esc(str) {
  return String(str)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function fmtDate(d) {
  if (!d) return '-';
  const [y,m,day] = d.split('-');
  const months = ['Jan','Feb','Mar','Apr','Mei','Jun','Jul','Agu','Sep','Okt','Nov','Des'];
  return `${parseInt(day)} ${months[parseInt(m)-1]} ${y}`;
}

function fmtTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now - d;
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1)  return 'Baru saja';
  if (diffMin < 60) return `${diffMin} mnt lalu`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24)   return `${diffH} jam lalu`;
  return fmtDate(iso.split('T')[0]);
}

function statusBadge(s) {
  const map = { 'Pending':'badge-pending','Done':'badge-done','Terkonfirmasi':'badge-konfirmasi' };
  return `<span class="badge ${map[s]||'badge-pending'}">${s}</span>`;
}

function typeBadge(t) {
  if (t==='desain') return `<span class="type-badge type-desain">🎨 Desain</span>`;
  if (t==='video')  return `<span class="type-badge type-video">🎬 Video</span>`;
  return t;
}

/* ===== EXPORT PDF ===== */
function exportPDF() {
  if (!orders.length) { showToast('⚠️ Tidak ada data untuk diekspor!'); return; }

  const now     = new Date();
  const nowStr  = now.toLocaleDateString('id-ID', {day:'numeric',month:'long',year:'numeric'});
  const nowTime = now.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'});

  const totalDesain  = orders.filter(o=>o.type==='desain').length;
  const totalVideo   = orders.filter(o=>o.type==='video').length;
  const totalPending = orders.filter(o=>o.status==='Pending').length;
  const totalKonfirm = orders.filter(o=>o.status==='Terkonfirmasi').length;
  const totalDone    = orders.filter(o=>o.status==='Done').length;

  const rows = orders.map((o,i) => `
    <tr class="${i%2===0?'even':''}">
      <td>${i+1}</td>
      <td><span class="type-${o.type}">${o.type==='desain'?'Desain':'Video'}</span></td>
      <td>${esc(o.nama)}</td>
      <td><b>${esc(o.unit)}</b></td>
      <td class="pengajuan">${esc(o.pengajuan)}</td>
      <td>${fmtDate(o.tgl)}</td>
      <td>${fmtDate(o.deadline)}</td>
      <td><span class="status-${o.status.toLowerCase().replace(' ','')}">${o.status}</span></td>
    </tr>`).join('');

  const html = `<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8"/>
<title>Laporan Order FNI</title>
<style>
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;font-size:11px;color:#1A1A2E;background:#fff}
.page{padding:28px 32px}
.header{display:flex;align-items:center;justify-content:space-between;border-bottom:3px solid #2ABCAA;padding-bottom:16px;margin-bottom:20px}
.logo-box{display:flex;align-items:center;gap:12px}
.logo-sq{width:44px;height:44px;background:#2ABCAA;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:14px}
.brand-title{font-size:18px;font-weight:900;color:#1A1A2E}
.brand-sub{font-size:11px;color:#8C96A6}
.report-meta{text-align:right}
.report-title{font-size:14px;font-weight:800;color:#2ABCAA;margin-bottom:2px}
.report-date{font-size:10px;color:#8C96A6}
.summary{display:flex;gap:10px;margin-bottom:20px}
.scard{flex:1;border-radius:8px;padding:12px 14px;text-align:center}
.s-total{background:#E8F9F7;border:1.5px solid #B2E8E3}
.s-desain{background:#E8F9F7;border:1.5px solid #B2E8E3}
.s-video{background:#FFF8D6;border:1.5px solid #FFE69C}
.s-pending{background:#FFF8D6;border:1.5px solid #FFE69C}
.s-konfirm{background:#E8F9F7;border:1.5px solid #B2E8E3}
.s-done{background:#D1FAE5;border:1.5px solid #A7F3D0}
.snum{font-size:22px;font-weight:900;color:#1A1A2E;display:block}
.slbl{font-size:9px;color:#8C96A6;text-transform:uppercase;font-weight:700;letter-spacing:.5px}
table{width:100%;border-collapse:collapse}
thead tr{background:#2ABCAA}
th{padding:9px 10px;text-align:left;font-size:9px;font-weight:800;color:#fff;text-transform:uppercase;letter-spacing:.5px}
td{padding:8px 10px;border-bottom:1px solid #E8ECF2;vertical-align:top}
tr.even td{background:#F8FFFE}
.pengajuan{max-width:160px;word-break:break-word}
.type-desain{background:#E8F9F7;color:#1E9B8B;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:800}
.type-video{background:#FFF8D6;color:#8A6A00;border-radius:4px;padding:1px 6px;font-size:9px;font-weight:800}
.status-pending{background:#FFF3CD;color:#856404;border-radius:10px;padding:2px 8px;font-size:9px;font-weight:800}
.status-done{background:#D1FAE5;color:#065F46;border-radius:10px;padding:2px 8px;font-size:9px;font-weight:800}
.status-terkonfirmasi{background:#E8F9F7;color:#1E9B8B;border-radius:10px;padding:2px 8px;font-size:9px;font-weight:800}
.footer{margin-top:24px;border-top:1px solid #E8ECF2;padding-top:10px;display:flex;justify-content:space-between;font-size:9px;color:#8C96A6}
.accent{color:#2ABCAA;font-weight:700}
@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
</style></head><body><div class="page">
<div class="header">
  <div class="logo-box">
    <div class="logo-sq">FNI</div>
    <div><div class="brand-title">Form Order FNI</div><div class="brand-sub">FNI Creative Studio</div></div>
  </div>
  <div class="report-meta">
    <div class="report-title">Laporan Rekap Order</div>
    <div class="report-date">Dicetak: ${nowStr}, ${nowTime} · oleh ${currentAdmin?.username || 'Admin'}</div>
  </div>
</div>
<div class="summary">
  <div class="scard s-total"><span class="snum">${orders.length}</span><span class="slbl">Total</span></div>
  <div class="scard s-desain"><span class="snum">${totalDesain}</span><span class="slbl">Desain</span></div>
  <div class="scard s-video"><span class="snum">${totalVideo}</span><span class="slbl">Video</span></div>
  <div class="scard s-pending"><span class="snum">${totalPending}</span><span class="slbl">Pending</span></div>
  <div class="scard s-konfirm"><span class="snum">${totalKonfirm}</span><span class="slbl">Terkonfirmasi</span></div>
  <div class="scard s-done"><span class="snum">${totalDone}</span><span class="slbl">Done</span></div>
</div>
<table>
  <thead><tr><th>#</th><th>Tipe</th><th>Nama</th><th>Unit</th><th>Pengajuan</th><th>Tgl Pengajuan</th><th>Deadline</th><th>Status</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
<div class="footer">
  <span>Form Order FNI · <span class="accent">FNI Creative Studio</span></span>
  <span>Total: <b>${orders.length}</b> order · ${nowStr}</span>
</div>
</div></body></html>`;

  const win = window.open('', '_blank', 'width=1000,height=700');
  win.document.write(html);
  win.document.close();
  win.onload = () => setTimeout(() => { win.focus(); win.print(); }, 400);
}
