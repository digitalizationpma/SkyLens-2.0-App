/* ============================================================
   SkyLens 2.0 — JALAN (Pacman) + KOTAK CERDAS   (v1.1.3)
   Data per depo: data/jalan/<DEPO>.json (dibuat dari Overture/OSM + lebar jalan toko OPCI).
   - Kotak 4x4 hanya "aktif" kalau ada permukiman (atap >= atapMin). Kotak hutan/sawah tidak dihitung.
   - Ruas jalan dipotong-potong ±10 m. v1.2.3: potongan "dimakan" (jadi teal) lewat MAP-MATCHING (lihat MM di bawah):
     jejak disambung tiap 4 m, tiap titik hanya memakan SATU potongan terdekat (≤20 m) yang ARAHNYA searah gerak (≤40°),
     jadi ujung gang yang dilewati tegak lurus & jalur paralel tidak ikut teal. Akurasi GPS > 25 m dan titik diam tidak dipakai.
     Sumber titik: GPS langsung di HP + jejak di server (Supabase) supaya sama dengan dashboard.
   - Kotak aktif yang punya jalan (>= 30 m) selesai kalau >= 70% panjang jalannya sudah dimakan.
     Kotak aktif tanpa jalan terpeta tetap pakai aturan lama (jelajah ±1 menit).
   - Kalau file jalan depo tidak ada: semua fungsi diam, app jalan seperti v1.1.2 (16 kotak + 1 menit).
   ============================================================ */
const JL_POTONG_M = 10;          // panjang satu potongan ruas (sama dengan dashboard)
const JL_KOTAK_MIN_M = 30;       // kotak dianggap punya jalan kalau total potongan di dalamnya >= 30 m
const JL_KOTAK_SELESAI = 0.7;    // 70% panjang jalan di kotak dilewati = kotak selesai
const JL_BESAR_SELESAI = 0.7;    // nama jalan besar diberi centang kalau 70% dilewati
const JL_WARNA = {B: '#1F2C4F', Q: '#1F2C4F', M: '#3B82F6', T: '#FE7A1B', makan: '#00BFA5'};
const JL_BUCKET = 0.0004;        // ukuran sel indeks spasial (±44 m)

const JL = {data: null, depo: '', rp: {}, hash: null, done: new Set(), ver: 0, simpanT: null, legOpen: false, mmLive: null, mmSrv: null, sinkT: 0};

/* ===== MM: map-matching jejak -> potongan jalan. KODE INI SAMA PERSIS DENGAN DASHBOARD (template9.html, mmProses). =====
   A = adaptor: cari(lat, lon, R) -> [[jarak_m, potongan], ...], ang(p) arah potongan 0-180°, ri(p) id ruas, seq(p) urutan di ruas,
   tandai(p), tandaiSeq(ri, seq). t dalam detik. */
var MM_R = 20, MM_ANG = 40, MM_AKUR = 25, MM_STEP = 4, MM_HYST = 5, MM_GAP = 4, MM_GERAK = 6, MM_DEKAT = 12, MM_PUTUS_S = 100, MM_PUTUS_M = 250;
function mmSudut(a, b){ var d = Math.abs(a - b) % 180; return Math.min(d, 180 - d); }
function mmBaru(){ return {anc: null, lastT: null, hp: null, prev: null}; }
function mmProses(st, t, lat, lon, acc, A){
  if(acc != null && acc > MM_AKUR) return;
  var kx = 111320 * Math.cos(lat * Math.PI / 180), KY = 110574;
  if(!st.anc || t - st.lastT > MM_PUTUS_S || t < st.lastT || Math.sqrt(Math.pow((lon - st.anc[1]) * kx, 2) + Math.pow((lat - st.anc[0]) * KY, 2)) > MM_PUTUS_M){
    st.anc = [lat, lon]; st.lastT = t; st.hp = null; st.prev = null; return;
  }
  st.lastT = t;
  var a = st.anc, dx = (lon - a[1]) * kx, dy = (lat - a[0]) * KY, d = Math.sqrt(dx * dx + dy * dy);
  if(d < MM_GERAK) return;   // diam / goyang GPS: tidak memakan jalan
  var h = ((Math.atan2(dy, dx) * 180 / Math.PI) % 180 + 180) % 180, n = Math.max(1, Math.ceil(d / MM_STEP));
  for(var j = 0; j <= n; j++){
    var sLa = a[0] + (lat - a[0]) * j / n, sLo = a[1] + (lon - a[1]) * j / n, dekat = st.hp != null && j * d / n < MM_DEKAT;
    var c = A.cari(sLa, sLo, MM_R), best = null, bd = 1e9, list = [], k;
    for(k = 0; k < c.length; k++){
      var ag = A.ang(c[k][1]);
      if(mmSudut(ag, h) <= MM_ANG || (dekat && mmSudut(ag, st.hp) <= MM_ANG)){ list.push(c[k]); if(c[k][0] < bd){ bd = c[k][0]; best = c[k][1]; } }
    }
    if(best == null) continue;
    if(st.prev != null){   // tetap di ruas yang sama kalau masih masuk akal (jalur paralel tidak loncat-loncat)
      var rp = A.ri(st.prev), bs = null, bsd = 1e9;
      for(k = 0; k < list.length; k++) if(A.ri(list[k][1]) === rp && list[k][0] <= bd + MM_HYST && list[k][0] < bsd){ bsd = list[k][0]; bs = list[k][1]; }
      if(bs != null) best = bs;
    }
    A.tandai(best);
    if(st.prev != null && A.ri(st.prev) === A.ri(best)){
      var s1 = A.seq(st.prev), s2 = A.seq(best);
      if(Math.abs(s1 - s2) <= MM_GAP) for(var q = Math.min(s1, s2); q <= Math.max(s1, s2); q++) A.tandaiSeq(A.ri(best), q);
    }
    st.prev = best;
  }
  st.anc = [lat, lon]; st.hp = h;
}
/* ===== akhir MM ===== */

/* Data jalan besar (0,6–6,6 MB per depo) TIDAK ikut APK/paket tampilan: diunduh sekali dari GitHub Pages lalu disimpan di cache HP.
   Urutan: cache HP (langsung dipakai) → internet → file bawaan APK (kalau ada). Cache diperbarui diam-diam di belakang. */
const JL_URL = (typeof DATA_URL === 'string' ? DATA_URL : 'https://digitalizationpma.github.io/SkyLens-2.0-App/') + 'data/jalan/';
async function jlAmbil(nama){
  const url = JL_URL + nama + '.json';
  let cache = null; try{ if('caches' in window){ caches.delete('sl2-jalan').catch(() => {}); cache = await caches.open('sl2-jalan2'); } }catch(e){ cache = null; }   // jalan2: data Garut digabung Cikajang (28 Okt) -> paksa unduh baru
  const dariNet = async () => {
    const r = await fetch(url, {cache: 'no-cache'}); if(!r.ok) throw new Error('http ' + r.status);
    if(cache){ try{ await cache.put(url, r.clone()); }catch(e){} }
    return r.json();
  };
  if(cache){
    try{ const c = await cache.match(url); if(c){ dariNet().catch(() => {}); return await c.json(); } }catch(e){}
  }
  try{ return await dariNet(); }catch(e){}
  const r = await fetch('data/jalan/' + nama + '.json'); if(!r.ok) throw new Error('tidak ada');
  return r.json();
}
async function jlMuat(dep){
  JL.data = null; JL.depo = dep || ''; JL.rp = {}; JL.pc = {}; JL.stC = {}; JL.hash = null; JL.ver++;
  if(!dep) return;
  try{
    const d = await jlAmbil(dep.replace(/\s+/g, '_'));
    if(d && d.roads && d.petak) JL.data = d;
  }catch(e){ JL.data = null; }
  try{ JL.done = new Set(sesi ? lsGet('sl2_jl2_' + sesi.kode, []) : []); }catch(e){ JL.done = new Set(); }   // jl2 = potongan 10 m + map-matching (data jl lama 20 m tidak dipakai lagi)
  JL.mmLive = mmBaru(); JL.mmSrv = mmBaru();
  try{ if(sesi) localStorage.removeItem('sl2_jl_' + sesi.kode); }catch(e){}   // bersihkan data jalan versi lama (20 m)
}
function jlAda(){ return !!JL.data; }
function jlPetak(key){ return JL.data ? (JL.data.petak[String(key)] || null) : null; }
function jlAtapMin(){ return (JL.data && JL.data.atapMin) || 3; }

/* --- kotak cerdas --- */
function jlKotakAktif(key, r, c){
  const p = jlPetak(key); if(!p) return true;
  const e = p.c[r*GRID_N + c]; return !!e && e[0] >= jlAtapMin();
}
function jlNAktif(key){
  const p = jlPetak(key); if(!p) return GRID_N*GRID_N;
  let n = 0; for(let i = 0; i < GRID_N*GRID_N; i++){ const e = p.c[i]; if(e && e[0] >= jlAtapMin()) n++; }
  return n;
}
function jlProgres(key){   // jumlah kotak aktif yang sudah selesai
  let n = 0; const p = jlPetak(key);
  gridSet.forEach(s => {
    const a = s.split(':'); if(a[0] !== String(key)) return;
    if(!p || jlKotakAktif(key, +a[1], +a[2])) n++;
  });
  return Math.min(jlNAktif(key), n);
}

/* --- potongan ruas --- */
function jlCellDari(lat, lon){
  const gx = Math.floor(lon / S), gy = Math.floor(lat / S);
  const cs = S / GRID_N;
  const r = Math.min(GRID_N - 1, Math.floor((lat - gy*S) / cs)), c = Math.min(GRID_N - 1, Math.floor((lon - gx*S) / cs));
  return {key: keyDari(gx, gy), i: r*GRID_N + c};
}
function jlPotongan(ri){
  if(JL.rp[ri]) return JL.rp[ri];
  const rd = JL.data.roads[ri], f = rd[3], out = [];
  let seq = 0;
  for(let k = 0; k + 3 < f.length; k += 2){
    const la1 = f[k]/1e5, lo1 = f[k+1]/1e5, la2 = f[k+2]/1e5, lo2 = f[k+3]/1e5;
    const L = haversine(la1, lo1, la2, lo2); if(L <= 0) continue;
    const kxr = 111320 * Math.cos(la1 * Math.PI / 180), ang = ((Math.atan2((la2 - la1) * 110574, (lo2 - lo1) * kxr) * 180 / Math.PI) % 180 + 180) % 180;
    const n = Math.max(1, Math.ceil(L / JL_POTONG_M));
    for(let j = 0; j < n; j++){
      const t0 = j/n, t1 = (j+1)/n;
      const a = [la1 + (la2-la1)*t0, lo1 + (lo2-lo1)*t0], b = [la1 + (la2-la1)*t1, lo1 + (lo2-lo1)*t1];
      const m = [(a[0]+b[0])/2, (a[1]+b[1])/2], cl = jlCellDari(m[0], m[1]);
      out.push({id: ri + '.' + (seq++), ri: ri, seq: seq - 1, a: a, b: b, m: m, len: L/n, kat: rd[0], key: cl.key, cell: cl.i, ang: ang});
    }
  }
  JL.rp[ri] = out; return out;
}
function jlRuasPetak(key){ const p = jlPetak(key); return p ? p.r : []; }
function jlPotonganPetak(key){   // potongan yang titik tengahnya di dalam petak
  const pc = JL.pc || (JL.pc = {});
  if(pc[key]) return pc[key];
  const out = [];
  jlRuasPetak(key).forEach(ri => jlPotongan(ri).forEach(q => { if(q.key === key) out.push(q); }));
  return (pc[key] = out);
}

/* --- indeks spasial untuk zona tugas --- */
function jlSiapkanIndeks(){
  JL.hash = null;
  if(!JL.data || !zonaList.length) return;
  const h = new Map(), sudah = new Set();
  const kunciIdx = new Set();
  zonaList.forEach(z => { for(let dx = -1; dx <= 1; dx++) for(let dy = -1; dy <= 1; dy++) kunciIdx.add(keyDari(z[2] + dx, z[3] + dy)); });   // + petak tetangga: jalan di tepi petak ikut dibandingkan (sama dengan dashboard)
  kunciIdx.forEach(kp => jlRuasPetak(kp).forEach(ri => {
    if(sudah.has(ri)) return; sudah.add(ri);
    jlPotongan(ri).forEach(q => {
      const bk = Math.floor(q.m[0] / JL_BUCKET) + ':' + Math.floor(q.m[1] / JL_BUCKET);
      let arr = h.get(bk); if(!arr){ arr = []; h.set(bk, arr); } arr.push(q);
    });
  }));
  JL.hash = h; JL.mmLive = mmBaru(); JL.mmSrv = mmBaru();
  // titik yang sudah terkumpul sebelum indeks siap ikut dihitung
  trailPoints.forEach(p => jlProsesFix(p.lat, p.lon, p.acc != null ? p.acc : 10, p.t, true));
  setTimeout(() => jlSinkronServer(true), 800);
}
/* adaptor MM untuk potongan zona di HP */
function jlAdaptor(baru){
  return {
    cari: function(la, lo, R){
      const out = [], bi = Math.floor(la / JL_BUCKET), bj = Math.floor(lo / JL_BUCKET), kx = 111320 * Math.cos(la * Math.PI / 180), KY = 110574;
      for(let di = -1; di <= 1; di++) for(let dj = -1; dj <= 1; dj++){
        const arr = JL.hash.get((bi+di) + ':' + (bj+dj)); if(!arr) continue;
        for(const q of arr){
          const ax = (q.a[1] - lo) * kx, ay = (q.a[0] - la) * KY, vx = (q.b[1] - q.a[1]) * kx, vy = (q.b[0] - q.a[0]) * KY, ll = vx*vx + vy*vy;
          const s = ll ? Math.max(0, Math.min(1, -(ax*vx + ay*vy) / ll)) : 0, ex = ax + vx*s, ey = ay + vy*s, d = Math.sqrt(ex*ex + ey*ey);
          if(d <= R) out.push([d, q]);
        }
      }
      return out;
    },
    ang: q => q.ang, ri: q => q.ri, seq: q => q.seq,
    tandai: q => { if(!JL.done.has(q.id)){ JL.done.add(q.id); baru.push(q); } },
    tandaiSeq: (ri, sq) => { const q = (JL.rp[ri] || [])[sq]; if(q && !JL.done.has(q.id)){ JL.done.add(q.id); baru.push(q); } }
  };
}
function jlSetelahMakan(baru, lat, lon, t, diam){
  if(!baru.length) return;
  JL.ver++;
  jlGambarMakan(baru);
  clearTimeout(JL.simpanT);
  JL.simpanT = setTimeout(() => { if(sesi) lsSet('sl2_jl2_' + sesi.kode, Array.from(JL.done).slice(-60000)); }, 1500);
  const keys = new Set(baru.map(q => q.key));
  keys.forEach(k => jlEvaluasiPetak(k, lat, lon, t, diam));
}
function jlProsesFix(lat, lon, acc, t, diam){
  if(!JL.hash) return;
  const baru = [];
  mmProses(JL.mmLive || (JL.mmLive = mmBaru()), t / 1000, lat, lon, acc, jlAdaptor(baru));
  jlSetelahMakan(baru, lat, lon, t, diam);
}
/* jejak di server (direkam di latar walau tampilan app tertutup) ikut dihitung -> sama dengan dashboard. Hanya jejak sales ini. */
async function jlSinkronServer(paksa){
  if(!JL.hash || !sesi || (typeof peranSesi === 'function' && peranSesi()) || JL.sinkJalan) return;
  if(!paksa && Date.now() - JL.sinkT < 120000) return;
  JL.sinkJalan = true; JL.sinkT = Date.now();
  const kode = sesi.kode, kunciW = 'sl2_jlw2_' + kode;
  let sejak = lsGet(kunciW, null);
  if(!sejak) sejak = new Date(Date.now() - 31 * 864e5).toISOString();
  try{
    for(let hal = 0; hal < 200; hal++){
      const rows = await restGet('jejak_lokasi?select=lat,lon,waktu,akurasi&kode_salesman=eq.' + encodeURIComponent(kode) + '&waktu=gt.' + encodeURIComponent(sejak) + '&order=waktu.asc&limit=1000');
      if(!sesi || sesi.kode !== kode || !JL.hash) return;
      const baru = []; let akhir = null;
      const A = jlAdaptor(baru);
      rows.forEach(r => {
        if(r.lat == null || r.lon == null || !r.waktu) return;
        const t = Date.parse(r.waktu);
        mmProses(JL.mmSrv, t / 1000, +r.lat, +r.lon, r.akurasi == null ? null : +r.akurasi, A);
        akhir = {lat: +r.lat, lon: +r.lon, t: t};
      });
      if(rows.length) sejak = rows[rows.length - 1].waktu;
      if(akhir) jlSetelahMakan(baru, akhir.lat, akhir.lon, akhir.t, true);
      lsSet(kunciW, sejak);
      if(rows.length < 1000) break;
      await new Promise(r => setTimeout(r, 30));   // beri napas ke tampilan
    }
    if(typeof segarkanLayarAktif === 'function') segarkanLayarAktif();
  }catch(e){ /* tanpa sinyal: coba lagi nanti */ }
  finally{ JL.sinkJalan = false; }
}

/* --- kotak selesai karena jalannya sudah dilewati --- */
function jlStatKotak(key){   // per kotak: {tot, mkn} panjang potongan di kotak itu (di-cache per versi cakupan)
  const ck = JL.stC || (JL.stC = {});
  const hit = ck[key]; if(hit && hit.v === JL.ver) return hit.st;
  const st = Array.from({length: GRID_N*GRID_N}, () => ({tot: 0, mkn: 0}));
  jlPotonganPetak(key).forEach(q => { const s = st[q.cell]; s.tot += q.len; if(JL.done.has(q.id)) s.mkn += q.len; });
  ck[key] = {v: JL.ver, st: st};
  return st;
}
function jlKotakBerjalan(key, i, st){ return (st || jlStatKotak(key))[i].tot >= JL_KOTAK_MIN_M; }
function jlEvaluasiPetak(key, lat, lon, t, diam){
  if(!jlPetak(key) || !zonaList.some(z => keyDari(z[2], z[3]) === key)) return;
  const st = jlStatKotak(key);
  for(let i = 0; i < GRID_N*GRID_N; i++){
    const r = Math.floor(i / GRID_N), c = i % GRID_N;
    if(!jlKotakAktif(key, r, c) || st[i].tot < JL_KOTAK_MIN_M) continue;
    const k = key + ':' + r + ':' + c;
    if(gridSet.has(k) || st[i].mkn / st[i].tot < JL_KOTAK_SELESAI) continue;
    jlTandaiKotak(key, r, c, lat, lon, t, diam);
  }
}
function jlTandaiKotak(key, r, c, lat, lon, t, diam){
  const k = key + ':' + r + ':' + c;
  if(gridSet.has(k)) return;
  gridSet.add(k); lsSet('sl2_grid_' + sesi.kode, Array.from(gridSet));
  obPut({id: 'g_' + sesi.kode + '_' + k, tipe: 'grid', kode: sesi.kode, t: Date.now(), tries: 0,
    payload: {key_petak: key, cell_r: r, cell_c: c, lat: lat, lon: lon, waktu: new Date(t || Date.now()).toISOString()}}).then(prosesOutbox).catch(() => {});
  if(zonaAktif && zonaAktif.key_petak === key){
    const cell = cells.find(x => x.r === r && x.c === c); if(cell) cell.visited = true;
  }
  if(!diam && typeof petTip === 'function') petTip('Kotak ' + ('ABCD'[GRID_N - 1 - r] || '') + (c + 1) + ' beres — jalannya sudah kamu lewati!', 2600);
}

/* --- ringkasan jalan besar --- */
function jlNamaBesar(rd){
  if(rd[2]) return (typeof namaJalanRapi === 'function') ? namaJalanRapi(rd[2]) : rd[2];
  if(rd[1] === 'tertiary') return 'Jalan kabupaten (belum ada nama di peta)';
  if(rd[1] === 'primary' || rd[1] === 'secondary' || rd[1] === 'trunk' || rd[1] === 'motorway') return 'Jalan provinsi/nasional (belum ada nama di peta)';
  return 'Jalan besar (belum ada nama di peta)';
}
function jlRingkasBesar(keys){   // keys: array key petak
  let tot = 0, mkn = 0, semua = 0, semuaMkn = 0; const grp = {};
  keys.forEach(key => jlPotonganPetak(key).forEach(q => {
    const d = JL.done.has(q.id);
    semua += q.len; if(d) semuaMkn += q.len;
    if(q.kat !== 'B' && q.kat !== 'Q') return;
    const rd = JL.data.roads[q.ri];
    if(rd[1] === 'motorway' || /\btol\b/i.test(rd[2] || '')) return;   // jalan tol tidak bisa disusuri sales motor
    tot += q.len; if(d) mkn += q.len;
    const nm = jlNamaBesar(rd);
    const g = grp[nm] || (grp[nm] = {nama: nm, tot: 0, mkn: 0, cek: false, tanpaNama: !rd[2]});
    g.tot += q.len; if(d) g.mkn += q.len; if(q.kat === 'Q') g.cek = true;
  }));
  const daftar = Object.values(grp).filter(g => g.tot >= 40).sort((a, b) => (a.tanpaNama - b.tanpaNama) || (b.tot - a.tot));   // jalan bernama di atas, yang tanpa nama di bawah
  return {tot: tot, mkn: mkn, semua: semua, semuaMkn: semuaMkn, daftar: daftar};
}
function jlKm(m){ return (m / 1000).toLocaleString('id-ID', {minimumFractionDigits: 1, maximumFractionDigits: 1}); }
function jlKartuHtml(key, lengkap){
  if(!jlPetak(key)) return '';
  const rb = jlRingkasBesar([key]);
  let h = '<div class="jlBox">';
  if(rb.tot > 0){
    const p = Math.min(100, Math.round(rb.mkn / rb.tot * 100));
    h += '<div class="row" style="justify-content:space-between"><span class="jlJud">' + jlIkon() + 'Jalan besar dilewati</span><b class="mono" style="font-size:13px">' + jlKm(rb.mkn) + ' / ' + jlKm(rb.tot) + ' km</b></div>' +
      '<div class="jlBar"><i style="width:' + p + '%"></i></div>';
    if(lengkap) h += '<div class="jlList">' + rb.daftar.slice(0, 5).map(g => {
      const ok = g.mkn / g.tot >= JL_BESAR_SELESAI;
      return '<div class="jlRow' + (ok ? ' ok' : '') + '"><span class="jlCk">' + (ok ? '✓' : '') + '</span><span class="jlNm">' + esc(g.nama) + (g.cek ? ' <em>perlu dicek</em>' : '') + '</span><span class="mono">' + Math.round(g.mkn / g.tot * 100) + '%</span></div>';
    }).join('') + (rb.daftar.length > 5 ? '<div class="muted" style="font-size:11.5px">+' + (rb.daftar.length - 5) + ' jalan besar lain</div>' : '') + '</div>';
  } else {
    h += '<div class="row" style="justify-content:space-between"><span class="jlJud">' + jlIkon() + 'Jalan besar</span><span class="muted" style="font-size:12.5px">tidak ada di petak ini</span></div>';
  }
  if(rb.semua > 0 && lengkap) h += '<div class="muted" style="font-size:12px">Semua jalan di petak: ' + Math.round(rb.semuaMkn / rb.semua * 100) + '% sudah kamu lewati. Susuri yang belum teal ya!</div>';
  return h + '</div>';
}
function jlIkon(){ return '<svg viewBox="0 0 24 24" width="15" height="15" style="flex:none;margin-right:5px;vertical-align:-3px" aria-hidden="true"><path d="M8 3 6 21M16 3l2 18M12 4v3M12 10.5v3M12 17v3" fill="none" stroke="#1F2C4F" stroke-width="2" stroke-linecap="round"/></svg>'; }

/* --- misi 2 Pinpin --- */
function jlMisi(){
  if(!JL.data || !zonaList.length) return null;
  const keys = zonaList.map(z => keyDari(z[2], z[3])).filter(k => jlPetak(k));
  if(!keys.length) return null;
  const rb = jlRingkasBesar(keys);
  if(rb.tot <= 0) return {id: 'jalan', kunci: false, done: true, p: 1, pendek: 'Zona kamu tidak dilewati jalan besar', tag: '✓',
    teks: 'Zona tugasmu tidak dilewati jalan besar. Fokus susuri jalan kampung dan gang ya!'};
  const p = Math.min(1, rb.mkn / rb.tot), done = p >= 0.999;
  /* sebut hanya jalan yang PUNYA nama; jalan tanpa nama di peta (data OSM/Overture memang kosong) tidak disebut satu per satu */
  const belumSemua = rb.daftar.filter(g => g.mkn / g.tot < JL_BESAR_SELESAI);
  const belum = belumSemua.filter(g => !g.tanpaNama).slice(0, 2).map(g => '<b>' + esc(g.nama) + '</b>');
  const sisaTanpaNama = belumSemua.some(g => g.tanpaNama);
  return {id: 'jalan', kunci: false, done: done, p: p,
    pendek: 'Jalan besar ' + jlKm(rb.mkn) + '/' + jlKm(rb.tot) + ' km dilewati',
    tag: done ? '✓' : Math.round(p * 100) + '%',
    teks: 'Toko besar biasanya ada di jalan besar. Di zona tugasmu ada <b>' + jlKm(rb.tot) + ' km</b> jalan besar, baru <b>' + jlKm(rb.mkn) + ' km</b> yang kamu lewati' +
      (belum.length ? '. Yuk susuri ' + belum.join(' & ') + (sisaTanpaNama ? ' dan jalan besar lain yang belum berwarna tosca di peta' : '') + '!'
        : (sisaTanpaNama ? '. Yuk susuri jalan besar yang belum berwarna tosca di peta!' : ' — mantap, hampir semua sudah!'))};
}

/* --- gambar di peta --- */
function jlGambarRuas(petaMap, key, grp){
  if(!JL.data || !jlPetak(key)) return null;
  /* satu renderer canvas PER PETA (dulu dipakai bersama oleh dua peta -> kanvas ikut peta lain, jalan & petak melebar saat zoom) */
  if(!petaMap._jlRnd){
    const pn = petaMap.getPane('jalanPane') || petaMap.createPane('jalanPane', petaMap._rotatePane || undefined);
    pn.style.zIndex = 390; pn.style.pointerEvents = 'none';
    petaMap._jlRnd = L.canvas({padding: 0.3, pane: 'jalanPane'});
  }
  const rnd = petaMap._jlRnd;
  const g = grp || L.layerGroup();
  g._jlRnd = rnd;
  const urut = jlRuasPetak(key).slice().sort((a, b) => 'TMQB'.indexOf(JL.data.roads[a][0]) - 'TMQB'.indexOf(JL.data.roads[b][0]));
  urut.forEach(ri => {
    const rd = JL.data.roads[ri], f = rd[3], ll = [];
    for(let k = 0; k + 1 < f.length; k += 2) ll.push([f[k]/1e5, f[k+1]/1e5]);
    const kat = rd[0];
    if(kat === 'B') L.polyline(ll, {renderer: rnd, color: '#ffffff', weight: 9, opacity: 0.95, interactive: false}).addTo(g);
    if(kat === 'Q') L.polyline(ll, {renderer: rnd, color: '#ffffff', weight: 7, opacity: 0.7, interactive: false}).addTo(g);
    L.polyline(ll, {renderer: rnd, color: JL_WARNA[kat], weight: kat === 'B' ? 5.5 : (kat === 'Q' ? 4.5 : (kat === 'M' ? 3.2 : 2.4)),
      opacity: 0.95, dashArray: kat === 'T' ? '5 6' : (kat === 'Q' ? '10 7' : null), interactive: false}).addTo(g);
  });
  const makan = L.layerGroup().addTo(g);
  g._jlMakan = makan; g._jlKey = key; g._jlDrawn = new Set();
  jlRuasPetak(key).forEach(ri => jlPotongan(ri).forEach(q => { if(JL.done.has(q.id)) jlGambarPotongan(g, q); }));
  g.addTo(petaMap);
  return g;
}
function jlGambarPotongan(g, q){
  if(g._jlDrawn.has(q.id)) return; g._jlDrawn.add(q.id);
  L.polyline([q.a, q.b], {renderer: g._jlRnd, color: JL_WARNA.makan, weight: q.kat === 'B' ? 6 : 4.5, opacity: 1, lineCap: 'round', interactive: false}).addTo(g._jlMakan);
}
function jlGambarMakan(baru){
  [JL.lapZona, JL.lapAll].forEach(g => { if(g && g._jlMakan) baru.forEach(q => { if(jlRuasPetak(g._jlKey).indexOf(q.ri) >= 0) jlGambarPotongan(g, q); }); });
}
function jlLegenda(petaMap){
  if(!JL.data) return;
  const ctrl = L.control({position: 'bottomleft'});
  ctrl.onAdd = function(){
    const div = L.DomUtil.create('div', 'jlLeg' + (JL.legOpen ? ' open' : ''));
    const ln = (w, c, d) => '<svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" stroke="' + c + '" stroke-width="' + w + '"' + (d ? ' stroke-dasharray="' + d + '"' : '') + ' stroke-linecap="round"/></svg>';
    div.innerHTML = '<button type="button" class="jlLegBtn">' + jlIkon() + 'Warna jalan <span class="jlCar">▾</span></button>' +
      '<div class="jlLegIsi">' +
      '<div>' + ln(5, '#1F2C4F') + 'Jalan besar</div>' +
      '<div>' + ln(4, '#1F2C4F', '7 5') + 'Jalan besar? (perlu dicek)</div>' +
      '<div>' + ln(3, '#3B82F6') + 'Jalan mobil</div>' +
      '<div>' + ln(2.4, '#FE7A1B', '4 4') + 'Jalur motor / setapak</div>' +
      '<div>' + ln(5, '#00BFA5') + 'Sudah kamu lewati</div>' +
      '<div><span class="jlSw"></span>Kotak tanpa rumah (tidak dihitung)</div></div>';
    L.DomEvent.disableClickPropagation(div);
    div.querySelector('.jlLegBtn').addEventListener('click', () => { JL.legOpen = !JL.legOpen; div.classList.toggle('open', JL.legOpen); });
    return div;
  };
  ctrl.addTo(petaMap);
}
