/* =============================================
   Form Order FNI — app.js (CONNECTED TO SUPABASE)
   Fitur: Real-time database via Supabase SDK
          Manajemen multi-admin, Super Admin, Export PDF
   ============================================= */

const SUPABASE_URL = 'https://uqdpliitoktvkuybghyz.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZHBsaWlpdG9rdmt1eWJnaHl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1OTQ4MzgsImV4cCI6MjA5NzE3MDgzOH0.mguFUa3gH_Qfjm4i1mVt4MoLBaGaOfB74CP3JUhf-gA';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===== STATE ===== */
let isAdmin      = false;
let currentAdmin = null;
let orders       = []; 
let admins       = []; 

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', async () => {
  setToday();
  await fetchOrdersFromSupabase();
  await fetchAdminsFromSupabase();
  renderTable();
  updateStats();
  updateExportPreview();
  setupRealtimeSubscription();
});

function setToday() {
  const today = new Date().toISOString().split('T')[0];
  ['d_tgl','v_tgl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

async function fetchOrdersFromSupabase() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false });
  if (!error) orders = data || [];
}

async function fetchAdminsFromSupabase() {
  const { data, error } = await supabase
    .from('admins')
    .select('*');
  if (!error) admins = data || [];
}

function setupRealtimeSubscription() {
  supabase
    .channel('public:orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
      await fetchOrdersFromSupabase();
      updateStats();
      renderTable();
      updateExportPreview();

      if (isAdmin) {
        renderAdminTable();
        updateAdminStats();

        if (payload.eventType === 'INSERT') {
          document.getElementById('notifDot')?.classList.remove('hidden');
          const newest = payload.new;
          const msgEl = document.getElementById('alertMsg');
          if (msgEl) msgEl.textContent = `🔔 Order baru masuk! ${newest.nama} (${newest.unit}) — ${newest.type === 'desain' ? 'Desain' : 'Video'}`;
          document.getElementById('newOrderAlert')?.classList.remove('hidden');
          showToast(`🔔 Order baru dari ${newest.nama} masuk!`);

          setTimeout(() => {
            const rows = document.querySelectorAll('#adminBody tr');
            if (rows[0]) {
              rows[0].classList.add('row-new');
              setTimeout(() => rows[0].classList.remove('row-new'), 6000);
            }
          }, 100);
        }
      }
    })
    .subscribe();
}

function dismissAlert() {
  document.getElementById('newOrderAlert')?.classList.add('hidden');
  document.getElementById('notifDot')?.classList.add('hidden');
}

async function submitOrder(type) {
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

  const { error } = await supabase
    .from('orders')
    .insert([{ type, nama, unit, pengajuan, tgl, deadline, status: 'Pending' }]);

  if (error) {
    showToast('❌ Gagal mengirim order: ' + error.message);
    return;
  }

  clearForm(p);
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

function renderTable() {
  const tbody   = document.getElementById('statusBody');
  const empty   = document.getElementById('emptyState');
  if (!tbody) return;

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
    if(empty) empty.classList.remove('hidden');
    tbody.closest('table').style.display = 'none';
    return;
  }

  if(empty) empty.classList.add('hidden');
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

function renderAdminTable() {
  const tbody = document.getElementById('adminBody');
  const empty = document.getElementById('adminEmptyState');
  if (!tbody) return;

  tbody.innerHTML = '';

  if (!orders.length) {
    if(empty) empty.classList.remove('hidden');
    tbody.closest('table').style.display = 'none';
    updateAdminStats();
    return;
  }

  if(empty) empty.classList.add('hidden');
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
      <td><span class="time-badge">${fmtTime(o.created_at)}</span></td>
      <td>${statusBadge(o.status)}</td>
      <td>
        <div style="display:flex;gap:6px;align-items:center">
          <select class="status-select" onchange="updateStatus(${o.id}, this.value)">
            <option ${o.status==='Pending'       ?'selected':''} value="Pending">Pending</option>
            <option ${o.status==='Terkonfirmasi' ?'selected':''} value="Terkonfirmasi">Terkonfirmasi</option>
            <option ${o.status==='Done'          ?'selected':''} value="Done">Done</option>
          </select>
          <button class="btn-delete" onclick="deleteOrder(${o.id})">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
          </button>
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
  updateAdminStats();
}

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
      <td>${isSuper ? '<span class="role-badge role-super">⭐ Super Admin</span>' : '<span class="role-badge role-admin">Admin</span>'}</td>
      <td style="font-size:12px;color:var(--gray-4)">${a.created_at ? fmtDate(a.created_at.split('T')[0]) : '-'}</td>
      <td>
        <div style="display:flex;gap:6px">
          <button class="btn-action" onclick="openChangePass('${esc(a.username)}')">Ganti Password</button>
          ${!isSuper ? `<button class="btn-action danger" onclick="removeAdmin('${esc(a.username)}')">Hapus</button>` : '<span style="font-size:11px;color:var(--gray-3);padding:5px 4px">Terlindungi</span>'}
        </div>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

async function updateStatus(id, newStatus) {
  const { error } = await supabase.from('orders').update({ status: newStatus }).eq('id', id);
  if (error) showToast(`❌ Gagal: ${error.message}`);
  else showToast(`✅ Status diperbarui: ${newStatus}`);
}

async function deleteOrder(id) {
  if (!confirm('Hapus order ini?')) return;
  const { error } = await supabase.from('orders').delete().eq('id', id);
  if (error) showToast(`❌ Gagal menghapus: ${error.message}`);
  else showToast('🗑️ Order berhasil dihapus');
}

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

function getFilteredExportOrders() {
  const fromDate = document.getElementById('exportDateFrom')?.value || '';
  const toDate   = document.getElementById('exportDateTo')?.value || '';
  const type     = document.getElementById('exportType')?.value || '';
  const status   = document.getElementById('exportStatus')?.value || '';
  const unit     = document.getElementById('exportUnit')?.value || '';

  return orders.filter(o => {
    const oDate = o.tgl || '';
    if (fromDate && oDate < fromDate) return false;
    if (toDate && oDate > toDate) return false;
    if (type && o.type !== type) return false;
    if (status && o.status !== status) return false;
    if (unit && o.unit !== unit) return false;
    return true;
  });
}

function updateExportPreview() {
  const previewEl = document.getElementById('exportPreview');
  if (!previewEl) return;
  const matched = getFilteredExportOrders();
  previewEl.textContent = `📊 Terfilter: ${matched.length} order siap diekspor ke PDF.`;
}

function setPreset(range) {
  const fromEl = document.getElementById('exportDateFrom');
  const toEl = document.getElementById('exportDateTo');
  if (!fromEl || !toEl) return;

  const today = new Date().toISOString().split('T')[0];
  toEl.value = today;

  document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
  event.target.classList.add('active');

  if (range === 'today') {
    fromEl.value = today;
  } else if (range === 'week') {
    const d = new Date(); d.setDate(d.getDate() - 7);
    fromEl.value = d.toISOString().split('T')[0];
  } else if (range === 'month') {
    const d = new Date(); d.setDate(1);
    fromEl.value = d.toISOString().split('T')[0];
  } else {
    fromEl.value = ''; toEl.value = '';
  }
  updateExportPreview();
}

function switchTab(tab) {
  document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  document.getElementById('tab-'+tab)?.classList.add('active');
  document.querySelector(`[data-tab="${tab}"]`)?.classList.add('active');

  if (tab === 'status') renderTable();
  if (tab === 'admin')  { renderAdminTable(); dismissAlert(); }
  if (tab === 'kelola') renderAdminList();
}

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
    isAdmin = true; currentAdmin = match;
    closeModal('loginModal');
    document.getElementById('btnAdminLogin').classList.add('hidden');
    document.getElementById('adminBadge').classList.remove('hidden');
    document.getElementById('adminBadgeName').textContent = match.role === 'super' ? '⭐ ' + match.username : match.username;
    document.querySelectorAll('.admin-only').forEach(el => el.classList.remove('hidden'));
    switchTab('admin');
    showToast('🔐 Selamat datang, ' + match.username);
  } else {
    document.getElementById('loginError').classList.remove('hidden');
  }
}

function adminLogout() {
  isAdmin = false; currentAdmin = null;
  document.getElementById('btnAdminLogin').classList.remove('hidden');
  document.getElementById('adminBadge').classList.add('hidden');
  document.querySelectorAll('.admin-only').forEach(el => el.classList.add('hidden'));
  switchTab('order');
  showToast('👋 Logout berhasil');
}

async function addAdmin() {
  const u = document.getElementById('newAdminUser').value.trim();
  const p = document.getElementById('newAdminPass').value;
  const p2 = document.getElementById('newAdminPass2').value;
  const errEl = document.getElementById('addAdminError');
  if (!u || !p || !p2) { showErr(errEl, 'Wajib diisi!'); return; }
  if (p !== p2) { showErr(errEl, 'Password beda!'); return; }

  const { error } = await supabase.from('admins').insert([{ username: u, password: p, role: 'admin' }]);
  if (error) showErr(errEl, error.message);
  else { closeModal('addAdminModal'); showToast('✅ Admin baru aktif!'); }
}

async function removeAdmin(username) {
  if (!confirm(`Hapus admin ${username}?`)) return;
  const { error } = await supabase.from('admins').delete().eq('username', username);
  if (!error) showToast('🗑️ Admin dihapus');
}

async function doChangePass() {
  const username = document.getElementById('changePassUsername').value;
  const p = document.getElementById('changePassNew').value;
  const { error } = await supabase.from('admins').update({ password: p }).eq('username', username);
  if (!error) { closeModal('changePassModal'); showToast('✅ Password diganti'); }
}

function showErr(el, msg) { if(el) { el.textContent = msg; el.classList.remove('hidden'); } }
function showModal(id) { document.getElementById(id)?.classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id)?.classList.add('hidden'); }

function showToast(msg) {
  const t = document.getElementById('toast'); if(!t) return;
  t.textContent = msg; t.classList.remove('hidden');
  setTimeout(() => t.classList.add('hidden'), 3500);
}

function esc(str) { return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(d) { if (!d) return '-'; const [y,m,day] = d.split('-'); return `${parseInt(day)}/${parseInt(m)}/${y}`; }
function fmtTime(iso) { if (!iso) return '-'; const d = new Date(iso); return d.toLocaleTimeString('id-ID', {hour:'2-digit',minute:'2-digit'}); }
function statusBadge(s) { const map = { 'Pending':'badge-pending','Done':'badge-done','Terkonfirmasi':'badge-konfirmasi' }; return `<span class="badge ${map[s]||'badge-pending'}">${s}</span>`; }
function typeBadge(t) { return t === 'desain' ? `<span class="type-badge type-desain">🎨 Desain</span>` : `<span class="type-badge type-video">🎬 Video</span>`; }

function exportPDF() {
  const matched = getFilteredExportOrders();
  if (!matched.length) { showToast('⚠️ Tidak ada data untuk diekspor!'); return; }
  const rows = matched.map((o,i) => `<tr><td>${i+1}</td><td>${o.type}</td><td>${esc(o.nama)}</td><td>${esc(o.unit)}</td><td>${esc(o.pengajuan)}</td><td>${fmtDate(o.tgl)}</td><td>${fmtDate(o.deadline)}</td><td>${o.status}</td></tr>`).join('');
  const win = window.open('', '_blank');
  win.document.write(`<html><head><style>table{width:100%;border-collapse:collapse;}th,td{border:1px solid #000;padding:8px;text-align:left;}</style></head><body><h2>Laporan Order FNI</h2><table><thead><tr><th>#</th><th>Tipe</th><th>Nama</th><th>Unit</th><th>Pengajuan</th><th>Tgl</th><th>Deadline</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></body></html>`);
  win.document.close(); win.print();
}
