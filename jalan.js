/* ============================================================
   SkyLens 2.0 — JALAN (Pacman) + KOTAK CERDAS   (v1.1.3)
   Data per depo: data/jalan/<DEPO>.json (dibuat dari Overture/OSM + lebar jalan toko OPCI).
   - Kotak 4x4 hanya "aktif" kalau ada permukiman (atap >= atapMin). Kotak hutan/sawah tidak dihitung.
   - Ruas jalan dipotong-potong ±20 m. Potongan "dimakan" (jadi teal) kalau ada titik GPS dalam 20 m.
   - Kotak aktif yang punya jalan (>= 30 m) selesai kalau >= 70% panjang jalannya sudah dimakan.
     Kotak aktif tanpa jalan terpeta tetap pakai aturan lama (jelajah ±1 menit).
   - Kalau file jalan depo tidak ada: semua fungsi diam, app jalan seperti v1.1.2 (16 kotak + 1 menit).
   ============================================================ */
const JL_POTONG_M = 20;          // panjang satu potongan ruas
const JL_RADIUS_M = 20;          // titik GPS sejauh ini dari potongan = potongan dilewati
const JL_AKURASI_MAKS = 35;      // titik dengan akurasi lebih buruk dari ini tidak dipakai untuk "memakan" jalan
const JL_KOTAK_MIN_M = 30;       // kotak dianggap punya jalan kalau total potongan di dalamnya >= 30 m
const JL_KOTAK_SELESAI = 0.7;    // 70% panjang jalan di kotak dilewati = kotak selesai
const JL_BESAR_SELESAI = 0.7;    // nama jalan besar diberi centang kalau 70% dilewati
const JL_WARNA = {B: '#1F2C4F', Q: '#1F2C4F', M: '#3B82F6', T: '#FE7A1B', makan: '#00BFA5'};
const JL_BUCKET = 0.0004;        // ukuran sel indeks spasial (±44 m)

const JL = {data: null, depo: '', rp: {}, hash: null, done: new Set(), ver: 0, simpanT: null, legOpen: false};

/* Data jalan besar (0,6–6,6 MB per depo) TIDAK ikut APK/paket tampilan: diunduh sekali dari GitHub Pages lalu disimpan di cache HP.
   Urutan: cache HP (langsung dipakai) → internet → file bawaan APK (kalau ada). Cache diperbarui diam-diam di belakang. */
const JL_URL = (typeof DATA_URL === 'string' ? DATA_URL : 'https://digitalizationpma.github.io/SkyLens-2.0-App/') + 'data/jalan/';
async function jlAmbil(nama){
  const url = JL_URL + nama + '.json';
  let cache = null; try{ cache = ('caches' in window) ? await caches.open('sl2-jalan') : null; }catch(e){ cache = null; }
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
  try{ JL.done = new Set(sesi ? lsGet('sl2_jl_' + sesi.kode, []) : []); }catch(e){ JL.done = new Set(); }
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
    const n = Math.max(1, Math.ceil(L / JL_POTONG_M));
    for(let j = 0; j < n; j++){
      const t0 = j/n, t1 = (j+1)/n;
      const a = [la1 + (la2-la1)*t0, lo1 + (lo2-lo1)*t0], b = [la1 + (la2-la1)*t1, lo1 + (lo2-lo1)*t1];
      const m = [(a[0]+b[0])/2, (a[1]+b[1])/2], cl = jlCellDari(m[0], m[1]);
      out.push({id: ri + '.' + (seq++), ri: ri, a: a, b: b, m: m, len: L/n, kat: rd[0], key: cl.key, cell: cl.i});
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
  zonaList.forEach(z => jlRuasPetak(keyDari(z[2], z[3])).forEach(ri => {
    if(sudah.has(ri)) return; sudah.add(ri);
    jlPotongan(ri).forEach(q => {
      const bk = Math.floor(q.m[0] / JL_BUCKET) + ':' + Math.floor(q.m[1] / JL_BUCKET);
      let arr = h.get(bk); if(!arr){ arr = []; h.set(bk, arr); } arr.push(q);
    });
  }));
  JL.hash = h; JL.prev = null;
  // titik yang sudah terkumpul sebelum indeks siap ikut dihitung
  trailPoints.forEach(p => jlProsesFix(p.lat, p.lon, 10, p.t, true));
}
function jlProsesFix(lat, lon, acc, t, diam){
  if(!JL.hash || (acc && acc > JL_AKURASI_MAKS)) return;
  const baru = [];
  const cek = (la, lo) => {
    const bi = Math.floor(la / JL_BUCKET), bj = Math.floor(lo / JL_BUCKET);
    for(let di = -1; di <= 1; di++) for(let dj = -1; dj <= 1; dj++){
      const arr = JL.hash.get((bi+di) + ':' + (bj+dj)); if(!arr) continue;
      for(const q of arr){ if(!JL.done.has(q.id) && haversine(la, lo, q.m[0], q.m[1]) <= JL_RADIUS_M){ JL.done.add(q.id); baru.push(q); } }
    }
  };
  /* GPS motor jarang rapat (tiap fix bisa 30-60 m). Garis jejak yang tersambung antar-dua titik juga dihitung "dimakan",
     jadi jalan tidak bolong padahal garis tealnya sudah lewat. Titik antara dibuat tiap ≤8 m; celah >200 m atau >100 dtk tidak disambung. */
  const pv = JL.prev;
  if(pv && t > pv.t && (t - pv.t) < 100000){
    const d = haversine(pv.lat, pv.lon, lat, lon);
    if(d > 8 && d <= 200){
      const n = Math.ceil(d / 8);
      for(let i = 1; i < n; i++) cek(pv.lat + (lat - pv.lat) * i / n, pv.lon + (lon - pv.lon) * i / n);
    }
  }
  cek(lat, lon);
  JL.prev = {lat: lat, lon: lon, t: t};
  if(!baru.length) return;
  JL.ver++;
  jlGambarMakan(baru);
  clearTimeout(JL.simpanT);
  JL.simpanT = setTimeout(() => { if(sesi) lsSet('sl2_jl_' + sesi.kode, Array.from(JL.done).slice(-40000)); }, 1500);
  const keys = new Set(baru.map(q => q.key));
  keys.forEach(k => jlEvaluasiPetak(k, lat, lon, t, diam));
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
  if(rd[1] === 'tertiary') return 'Jalan kabupaten tanpa nama';
  if(rd[1] === 'primary' || rd[1] === 'secondary' || rd[1] === 'trunk' || rd[1] === 'motorway') return 'Jalan provinsi/nasional tanpa nama';
  return 'Jalan besar tanpa nama';
}
function jlRingkasBesar(keys){   // keys: array key petak
  let tot = 0, mkn = 0, semua = 0, semuaMkn = 0; const grp = {};
  keys.forEach(key => jlPotonganPetak(key).forEach(q => {
    const d = JL.done.has(q.id);
    semua += q.len; if(d) semuaMkn += q.len;
    if(q.kat !== 'B' && q.kat !== 'Q') return;
    tot += q.len; if(d) mkn += q.len;
    const rd = JL.data.roads[q.ri], nm = jlNamaBesar(rd);
    const g = grp[nm] || (grp[nm] = {nama: nm, tot: 0, mkn: 0, cek: false});
    g.tot += q.len; if(d) g.mkn += q.len; if(q.kat === 'Q') g.cek = true;
  }));
  const daftar = Object.values(grp).filter(g => g.tot >= 40).sort((a, b) => b.tot - a.tot);
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
  const belum = rb.daftar.filter(g => g.mkn / g.tot < JL_BESAR_SELESAI).slice(0, 2).map(g => '<b>' + esc(g.nama) + '</b>');
  return {id: 'jalan', kunci: false, done: done, p: p,
    pendek: 'Jalan besar ' + jlKm(rb.mkn) + '/' + jlKm(rb.tot) + ' km dilewati',
    tag: done ? '✓' : Math.round(p * 100) + '%',
    teks: 'Toko besar biasanya ada di jalan besar. Di zona tugasmu ada <b>' + jlKm(rb.tot) + ' km</b> jalan besar, baru <b>' + jlKm(rb.mkn) + ' km</b> yang kamu lewati' +
      (belum.length ? '. Yuk susuri ' + belum.join(' & ') + '!' : ' — mantap, hampir semua sudah!')};
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
