/* =============================================
   Form Order FNI — app.js (CONNECTED TO SUPABASE)
   Fitur: Real-time database via Supabase SDK
          Manajemen multi-admin, Super Admin
   ============================================= */

// Konfigurasi Database Supabase Anda (SUDAH DIUPDATE)
const SUPABASE_URL = 'https://uqdpliitoktvkuybghyz.supabase.co'; 
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVxZHBsaWlpdG9rdmt1eWJnaHl6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE1OTQ4MzgsImV4cCI6MjA5NzE3MDgzOH0.mguFUa3gH_Qfjm4i1mVt4MoLBaGaOfB74CP3JUhf-gA';

const supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

/* ===== STATE ===== */
let isAdmin      = false;
let currentAdmin = null;
let orders       = []; // Diambil dari Supabase
let admins       = []; // Diambil dari Supabase
let lastCount    = 0;

/* ===== INIT ===== */
document.addEventListener('DOMContentLoaded', async () => {
  setToday();
  
  // Ambil data pertama kali dari database cloud
  await fetchOrdersFromSupabase();
  await fetchAdminsFromSupabase();
  
  renderTable();
  updateStats();
  
  // Aktifkan fitur Real-time (mendengarkan perubahan data langsung dari cloud)
  setupRealtimeSubscription();
});

function setToday() {
  const today = new Date().toISOString().split('T')[0];
  ['d_tgl','v_tgl'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = today;
  });
}

/* ===== DATABASE FETCHERS (AMBIL DATA CLOUD) ===== */
async function fetchOrdersFromSupabase() {
  const { data, error } = await supabase
    .from('orders')
    .select('*')
    .order('created_at', { ascending: false }); // Urutkan dari yang terbaru

  if (error) {
    console.error('Gagal mengambil data order:', error.message);
    return;
  }
  orders = data || [];
}

async function fetchAdminsFromSupabase() {
  const { data, error } = await supabase
    .from('admins')
    .select('*');

  if (error) {
    console.error('Gagal mengambil data admin:', error.message);
    return;
  }
  admins = data || [];
}

/* ===== SUPABASE REAL-TIME (SINKRONISASI OTOMATIS DAN INSTAN) ===== */
function setupRealtimeSubscription() {
  // Dengarkan perubahan pada tabel 'orders'
  supabase
    .channel('public:orders')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, async (payload) => {
      // Ambil data terbaru dari cloud agar state tersinkronisasi
      await fetchOrdersFromSupabase();
      updateStats();
      renderTable();

      if (isAdmin) {
        renderAdminTable();
        updateAdminStats();

        // Jika ada baris data baru ditambahkan ke database (INSERT)
        if (payload.eventType === 'INSERT') {
          document.getElementById('notifDot').classList.remove('hidden');
          const newest = payload.new;
          
          document.getElementById('alertMsg').textContent =
            `🔔 Order baru masuk! ${newest.nama} (${newest.unit}) — ${newest.type === 'desain' ? 'Desain' : 'Video'}`;
          document.getElementById('newOrderAlert').classList.remove('hidden');

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

  // Dengarkan perubahan pada tabel 'admins'
  supabase
    .channel('public:admins')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'admins' }, async () => {
      await fetchAdminsFromSupabase();
      if (isAdmin) renderAdminList();
    })
    .subscribe();
}

function dismissAlert() {
  document.getElementById('newOrderAlert').classList.add('hidden');
  document.getElementById('notifDot').classList.add('hidden');
}

/* ===== SUBMIT ORDER (SIMPAN KE CLOUD) ===== */
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

  // Mengirim objek langsung ke tabel 'orders' di Supabase
  const { error } = await supabase
    .from('orders')
    .insert([
      { 
        type, 
        nama, 
        unit, 
        pengajuan, 
        tgl, 
        deadline,
        status: 'Pending'
      }
    ]);

  if (error) {
    showToast('❌ Gagal mengirim order: ' + error.message);
    return;
  }

  clearForm(p);

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
    if(empty) empty.classList.remove('hidden');
    tbody.closest('table').style.display = 'none';
