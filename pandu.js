/* ============================================================
   SkyLens 2.0 — PANDU KE PETAK (navigasi di dalam app, v1.2.2)
   Rute dihitung di HP dari data jalan depo (sama dengan jalan Pacman: data/jalan/<DEPO>.json),
   tanpa internet tambahan & tanpa keluar ke Google Maps.
   - Graf: setiap titik ruas = simpul (dibulatkan ±3 m supaya persimpangan menyambung). Jalan tol tidak dipakai.
   - Biaya: panjang × faktor kelas (jalan besar 1,0 · mobil 1,15 · motor/gang 1,35) → condong lewat jalan besar.
   - Tujuan: titik jalan TERDEKAT di dalam petak (bukan tengah petak) → rute paling pendek sampai masuk petak.
   - Belokan: di persimpangan (≥3 cabang) dengan perubahan arah ≥ 35°.
   - Keluar rute > 45 m dua kali berturut-turut → rute dihitung ulang (paling cepat tiap 8 detik).
   - Sumber posisi: fix perekaman (lastPos). Kalau perekaman mati (di luar jam kerja), APK 1.2.2+ memakai GPS browser
     khusus untuk pandu (tidak direkam sebagai jejak).
   ============================================================ */
const PD = {aktif: false, G: null, rute: null, layer: null, casing: null, putus: null, man: [], cum: [], tot: 0, prog: 0, iSeg: 0,
  lepas: 0, tHitung: 0, tujuanKey: null, wid: null, wpos: null, sampaiT: 0, info: ''};
const PD_BELOK_MIN = 35, PD_LEPAS_M = 45, PD_HITUNG_ULANG_MS = 8000;

function pdTersedia(){ return typeof jlAda === 'function' && jlAda() && JL.data && JL.data.roads && JL.data.roads.length > 0; }

/* ---------- graf jalan ---------- */
function pdGraf(){
  if(PD.G && PD.G.ver === JL.ver) return PD.G;
  const R = JL.data.roads, idx = new Map(), la = [], lo = [], adj = [];
  const simpul = (a, o) => {
    const k = Math.round(a / 3) * 1e7 + Math.round(o / 3);
    let i = idx.get(k);
    if(i === undefined){ i = la.length; idx.set(k, i); la.push(a / 1e5); lo.push(o / 1e5); adj.push([]); }
    return i;
  };
  const FAK = {B: 1.0, Q: 1.0, M: 1.15, T: 1.35};
  for(let ri = 0; ri < R.length; ri++){
    const rd = R[ri];
    if(rd[1] === 'motorway' || /\btol\b/i.test(rd[2] || '')) continue;
    const f = rd[3], fk = FAK[rd[0]] || 1.2;
    let prev = -1;
    for(let k = 0; k + 1 < f.length; k += 2){
      const i = simpul(f[k], f[k + 1]);
      if(prev >= 0 && prev !== i){
        const L = haversine(la[prev], lo[prev], la[i], lo[i]);
        if(L > 0){ adj[prev].push(i, L * fk, ri); adj[i].push(prev, L * fk, ri); }
      }
      prev = i;
    }
  }
  /* komponen tersambung: titik awal & tujuan harus di komponen yang sama */
  const n = la.length, komp = new Int32Array(n).fill(-1), ukuran = [];
  for(let s = 0; s < n; s++){
    if(komp[s] >= 0) continue;
    const c = ukuran.length; let cnt = 0; const st = [s]; komp[s] = c;
    while(st.length){ const u = st.pop(); cnt++; const a = adj[u]; for(let j = 0; j < a.length; j += 3){ const v = a[j]; if(komp[v] < 0){ komp[v] = c; st.push(v); } } }
    ukuran.push(cnt);
  }
  /* indeks spasial ±220 m */
  const B = 0.002, ember = new Map();
  for(let i = 0; i < n; i++){ const bk = Math.floor(la[i] / B) * 100000 + Math.floor(lo[i] / B); let e = ember.get(bk); if(!e){ e = []; ember.set(bk, e); } e.push(i); }
  PD.G = {ver: JL.ver, la: la, lo: lo, adj: adj, komp: komp, ukuran: ukuran, ember: ember, B: B};
  return PD.G;
}
/* simpul terdekat (lebih suka komponen besar: komponen kecil = potongan jalan terputus di tepi data) */
function pdTerdekat(G, lat, lon, cocok){
  const bx = Math.floor(lat / G.B), by = Math.floor(lon / G.B);
  let best = -1, bd = 1e12;
  for(let r = 0; r <= 6 && (best < 0 || r <= 1); r++){
    for(let dx = -r; dx <= r; dx++) for(let dy = -r; dy <= r; dy++){
      if(Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
      const e = G.ember.get((bx + dx) * 100000 + (by + dy)); if(!e) continue;
      for(const i of e){
        if(cocok && !cocok(i)) continue;
        const d = haversine(lat, lon, G.la[i], G.lo[i]);
        if(d < bd){ bd = d; best = i; }
      }
    }
  }
  return best < 0 ? null : {i: best, d: bd};
}

/* ---------- Dijkstra (binary heap) ke petak ---------- */
function pdCariRute(lat, lon, b){
  const G = pdGraf(), n = G.la.length;
  const dalam = i => G.la[i] >= b.lat0 && G.la[i] <= b.lat1 && G.lo[i] >= b.lon0 && G.lo[i] <= b.lon1;
  const besar = i => G.ukuran[G.komp[i]] >= 30;
  const awal = pdTerdekat(G, lat, lon, besar) || pdTerdekat(G, lat, lon, null);
  if(!awal) return null;
  const kA = G.komp[awal.i];
  let adaTujuan = false;
  for(let i = 0; i < n && !adaTujuan; i++) if(G.komp[i] === kA && dalam(i)) adaTujuan = true;
  if(!adaTujuan) return null;
  const dist = new Float64Array(n).fill(Infinity), prev = new Int32Array(n).fill(-1), pri = new Int32Array(n).fill(-1);
  const hp = [], hk = [];
  const push = (v, k) => { hp.push(v); hk.push(k); let c = hp.length - 1; while(c > 0){ const p = (c - 1) >> 1; if(hk[p] <= hk[c]) break; [hp[p], hp[c]] = [hp[c], hp[p]]; [hk[p], hk[c]] = [hk[c], hk[p]]; c = p; } };
  const pop = () => { const v = hp[0], last = hp.pop(), lk = hk.pop(); if(hp.length){ hp[0] = last; hk[0] = lk; let c = 0; for(;;){ const l = 2*c + 1, r = l + 1; let m = c; if(l < hp.length && hk[l] < hk[m]) m = l; if(r < hp.length && hk[r] < hk[m]) m = r; if(m === c) break; [hp[m], hp[c]] = [hp[c], hp[m]]; [hk[m], hk[c]] = [hk[c], hk[m]]; c = m; } } return v; };
  dist[awal.i] = 0; push(awal.i, 0);
  let tujuan = -1;
  while(hp.length){
    const kTop = hk[0], u = pop();
    if(kTop > dist[u]) continue;
    if(dalam(u)){ tujuan = u; break; }
    const a = G.adj[u];
    for(let j = 0; j < a.length; j += 3){
      const v = a[j], nd = dist[u] + a[j + 1];
      if(nd < dist[v]){ dist[v] = nd; prev[v] = u; pri[v] = a[j + 2]; push(v, nd); }
    }
  }
  if(tujuan < 0) return null;
  const jalur = []; for(let v = tujuan; v >= 0; v = prev[v]) jalur.push(v);
  jalur.reverse();
  const titik = jalur.map(i => [G.la[i], G.lo[i]]), ruas = jalur.map(i => pri[i]);
  return {titik: titik, ruas: ruas, simpul: jalur, awalJarak: awal.d};
}

/* ---------- belokan ---------- */
function pdArahBelok(t){
  const a = Math.abs(t), sisi = t > 0 ? 'kanan' : 'kiri';
  if(a >= 150) return {teks: 'putar balik', ikon: 'u'};
  if(a < 60) return {teks: 'serong ' + sisi, ikon: t > 0 ? 'sr' : 'sl'};
  return {teks: 'belok ' + sisi, ikon: t > 0 ? 'r' : 'l'};
}
function pdNamaRuas(ri){
  if(ri == null || ri < 0) return '';
  const rd = JL.data.roads[ri]; if(!rd) return '';
  if(rd[2]) return (typeof namaJalanRapi === 'function') ? namaJalanRapi(rd[2]) : rd[2];
  return rd[0] === 'T' ? 'gang' : (rd[0] === 'M' ? 'jalan kecil' : 'jalan besar');
}
function pdSusunManuver(r){
  const G = PD.G, P = r.titik, cum = [0];
  for(let i = 1; i < P.length; i++) cum.push(cum[i - 1] + haversine(P[i-1][0], P[i-1][1], P[i][0], P[i][1]));
  /* titik pada jarak tertentu sebelum/sesudah indeks i, untuk arah yang stabil (tidak terpengaruh tekukan kecil) */
  const titikPada = (i, dm, maju) => {
    let j = i;
    if(maju){ while(j < P.length - 1 && cum[j] - cum[i] < dm) j++; }
    else { while(j > 0 && cum[i] - cum[j] < dm) j--; }
    return P[j];
  };
  const man = [];
  for(let i = 1; i < P.length - 1; i++){
    const deg = G.adj[r.simpul[i]].length / 3;
    if(deg < 3) continue;
    const a = titikPada(i, 15, false), b = titikPada(i, 15, true), c = P[i];
    let t = bearing(c[0], c[1], b[0], b[1]) - bearing(a[0], a[1], c[0], c[1]);
    while(t > 180) t -= 360; while(t < -180) t += 360;
    if(Math.abs(t) < PD_BELOK_MIN) continue;
    const ab = pdArahBelok(t), nama = pdNamaRuas(r.ruas[i + 1]);
    if(man.length && cum[i] - man[man.length - 1].m < 12){ man[man.length - 1] = {i: i, m: cum[i], arah: ab, nama: nama}; continue; }
    man.push({i: i, m: cum[i], arah: ab, nama: nama});
  }
  return {cum: cum, man: man, tot: cum[cum.length - 1]};
}

/* ---------- gambar ---------- */
function pdGambar(){
  if(!map || !PD.rute) return;
  const sisa = PD.rute.titik.slice(Math.max(0, PD.iSeg));
  const pos = pdPos();
  if(pos && sisa.length) sisa.unshift([pos.lat, pos.lon]);
  if(!PD.casing || !PD.casing._map){
    PD.casing = L.polyline(sisa, {color: '#fff', weight: 11, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false}).addTo(map);
    PD.layer = L.polyline(sisa, {color: '#FE7A1B', weight: 6.5, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false}).addTo(map);
  } else { PD.casing.setLatLngs(sisa); PD.layer.setLatLngs(sisa); }
  try{ PD.casing.bringToFront(); PD.layer.bringToFront(); }catch(e){}
}
function pdHapusGambar(){
  [PD.casing, PD.layer].forEach(l => { try{ if(l && l._map) l.remove(); }catch(e){} });
  PD.casing = PD.layer = null;
}

/* ---------- posisi ---------- */
function pdPos(){
  const now = Date.now();
  if(lastPos && now - lastPos.t < 25000) return lastPos;
  if(PD.wpos && now - PD.wpos.t < 25000) return PD.wpos;
  return lastPos || PD.wpos || null;
}
function pdMulaiGpsCadangan(){
  if(PD.wid !== null || !navigator.geolocation) return;
  try{
    PD.wid = navigator.geolocation.watchPosition(p => {
      PD.wpos = {lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy || 50, t: Date.now()};
      if(!lastPos || Date.now() - lastPos.t > 25000){ pdPerbarui(); if(typeof renderPosisi === 'function') renderPosisi(); }
    }, () => {}, {enableHighAccuracy: true, maximumAge: 3000, timeout: 15000});
  }catch(e){ PD.wid = null; }
}
function pdStopGpsCadangan(){ if(PD.wid !== null){ try{ navigator.geolocation.clearWatch(PD.wid); }catch(e){} PD.wid = null; } PD.wpos = null; }

/* ---------- mulai / hitung / berhenti ---------- */
function pdHitung(){
  const pos = pdPos();
  if(!pos || LAT0 == null) return false;
  let r = null;
  try{ r = pdCariRute(pos.lat, pos.lon, {lat0: LAT0, lat1: LAT1, lon0: LON0, lon1: LON1}); }catch(e){ console.error(e); r = null; }
  PD.tHitung = Date.now();
  if(!r || r.titik.length < 2){ PD.rute = null; return false; }
  const m = pdSusunManuver(r);
  PD.rute = r; PD.cum = m.cum; PD.man = m.man; PD.tot = m.tot; PD.iSeg = 0; PD.prog = 0; PD.lepas = 0;
  pdGambar();
  return true;
}
function pdMulai(){
  if(!zonaAktif) return;
  if(!pdTersedia()){ toast('Data jalan depo belum termuat. Coba sebentar lagi ya.', 3600); return; }
  PD.aktif = true; PD.tujuanKey = zonaAktif.key_petak; PD.sampaiT = 0;
  pdMulaiGpsCadangan();
  if(!pdPos()){ toast('Menunggu sinyal GPS… rute muncul begitu lokasi didapat', 3600); }
  else if(!pdHitung()){ toast('Jalan ke petak ini belum terpeta lengkap. Ikuti panah arah di atas ya.', 4200); }
  followMode = true; utaraKunci = false; tampilRecenter();
  try{ const pos = pdPos(); if(pos && map) map.setView([pos.lat, pos.lon], Math.max(map.getZoom(), 17)); }catch(e){}
  $('zoneSheet').dataset.sig = ''; renderPosisi(true);
}
function pdBerhenti(diam){
  PD.aktif = false; PD.rute = null; PD.man = []; PD.tujuanKey = null;
  pdHapusGambar(); pdStopGpsCadangan();
  if(!diam){ const zs = $('zoneSheet'); if(zs) zs.dataset.sig = ''; try{ renderPosisi(true); }catch(e){} }
}
/* dipanggil tiap ada posisi baru */
function pdPerbarui(){
  if(!PD.aktif) return;
  if(!zonaAktif || zonaAktif.key_petak !== PD.tujuanKey){ pdBerhenti(true); return; }
  const pos = pdPos(); if(!pos) return;
  if(insideZone(pos.lat, pos.lon)){
    if(typeof petTip === 'function') petTip('Sampai di petak! Saatnya menyisir.', 2600); else toast('Sampai di petak!');
    pdBerhenti(true); return;
  }
  if(!PD.rute){ if(Date.now() - PD.tHitung > PD_HITUNG_ULANG_MS) pdHitung(); return; }
  /* proyeksi posisi ke rute (cari di sekitar segmen terakhir dulu) */
  const P = PD.rute.titik;
  const cari = (i0, i1) => {
    let best = {d: 1e12, i: PD.iSeg, m: PD.prog};
    for(let i = Math.max(0, i0); i < Math.min(P.length - 1, i1); i++){
      const q = proyeksiSegmen(pos.lat, pos.lon, P[i], P[i + 1]);
      if(q.d < best.d) best = {d: q.d, i: i, m: PD.cum[i] + q.t * (PD.cum[i + 1] - PD.cum[i])};
    }
    return best;
  };
  let b = cari(PD.iSeg - 5, PD.iSeg + 80);
  if(b.d > PD_LEPAS_M) b = cari(0, P.length);
  if(b.d > PD_LEPAS_M && (pos.acc || 0) < 40){
    PD.lepas++;
    if(PD.lepas >= 2 && Date.now() - PD.tHitung > PD_HITUNG_ULANG_MS){ pdHitung(); return; }
  } else PD.lepas = 0;
  if(b.d <= PD_LEPAS_M * 1.5 && b.m >= PD.prog - 30){ PD.iSeg = b.i; PD.prog = b.m; }
  pdGambar();
}
function proyeksiSegmen(lat, lon, a, b){
  const kx = Math.cos(lat * Math.PI / 180) * 111320, ky = 110540;
  const ax = (a[1] - lon) * kx, ay = (a[0] - lat) * ky, bx = (b[1] - lon) * kx, by = (b[0] - lat) * ky;
  const dx = bx - ax, dy = by - ay, L2 = dx*dx + dy*dy;
  let t = L2 > 0 ? -(ax*dx + ay*dy) / L2 : 0; t = Math.max(0, Math.min(1, t));
  const px = ax + t*dx, py = ay + t*dy;
  return {d: Math.sqrt(px*px + py*py), t: t};
}

/* ---------- teks & ikon untuk kartu navigasi ---------- */
const PD_IKON = {
  l: '<path d="M15 19v-7a3 3 0 0 0-3-3H6M9 5 5 9l4 4"/>',
  r: '<path d="M9 19v-7a3 3 0 0 1 3-3h6M15 5l4 4-4 4"/>',
  sl: '<path d="M14 20v-6l-6-6M8 13V8h5"/>',
  sr: '<path d="M10 20v-6l6-6M16 13V8h-5"/>',
  u: '<path d="M8 20V9a4 4 0 0 1 8 0v4M13 10l3 3 3-3"/>',
  s: '<path d="M12 20V5M7 10l5-5 5 5"/>'
};
function pdIkon(k){ return '<svg class="pdIco" viewBox="0 0 24 24" aria-hidden="true">' + (PD_IKON[k] || PD_IKON.s) + '</svg>'; }
function pdKm(m){ return m < 1000 ? (Math.max(10, Math.round(m / 10) * 10)) + ' m' : (m / 1000).toLocaleString('id-ID', {maximumFractionDigits: 1}) + ' km'; }
function pdLangkah(){
  if(!PD.aktif) return null;
  if(!PD.rute) return {ikon: 's', teks: pdPos() ? 'Mencari jalan ke petak…' : 'Menunggu sinyal GPS…', sisa: null};
  const sisa = Math.max(0, PD.tot - PD.prog);
  const m = PD.man.find(x => x.m > PD.prog + 8);
  if(!m) return {ikon: 's', teks: 'Lurus ' + pdKm(sisa) + ' sampai petak', sisa: sisa};
  const d = m.m - PD.prog;
  return {ikon: m.arah.ikon, teks: (d < 25 ? 'Sekarang ' : pdKm(d) + ' lagi, ') + m.arah.teks + (m.nama ? ' ke ' + m.nama : ''), sisa: sisa};
}
function pdNavSub(){
  const l = pdLangkah(); if(!l) return null;
  return pdIkon(l.ikon) + '<span style="overflow:hidden;text-overflow:ellipsis">' + esc(l.teks) + '</span>';
}
/* titik di rute pada jarak m (meter dari awal rute) */
function pdTitikPada(m){
  const P = PD.rute.titik, C = PD.cum;
  let j = Math.max(0, Math.min(PD.iSeg, P.length - 2));
  while(j < P.length - 2 && C[j + 1] < m) j++;
  while(j > 0 && C[j] > m) j--;
  const a = P[j], b = P[j + 1], L = C[j + 1] - C[j], t = L > 0 ? Math.max(0, Math.min(1, (m - C[j]) / L)) : 1;
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}
/* arah jalan di depan (untuk peta berputar mengikuti rute): dari posisi di rute ke ±30 m di depan */
function pdArahDepan(){
  if(!PD.aktif || !PD.rute || PD.rute.titik.length < 2) return null;
  const a = pdTitikPada(PD.prog), b = pdTitikPada(Math.min(PD.tot, PD.prog + 30));
  if(haversine(a[0], a[1], b[0], b[1]) < 4) return null;
  return bearing(a[0], a[1], b[0], b[1]);
}
/* perkiraan jam tiba (naik motor) — ditampilkan di kanan judul petak */
function pdTiba(){
  const l = pdLangkah(); if(!l || l.sisa == null) return '';
  const mnt = Math.max(1, Math.round(l.sisa / (KECEPATAN_MOTOR_KMH * 1000 / 60)));
  return new Date(Date.now() + mnt * 60000).toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit'});
}
function pdKartuHtml(){
  const l = pdLangkah(); if(!l) return '';
  if(l.sisa == null) return '<div class="pdKartu"><span class="pdBesar">' + pdIkon('s') + '</span><span class="col" style="gap:2px;flex:1;min-width:0"><b>' + esc(l.teks) + '</b><span>Pandu SkyLens</span></span></div>';
  const mnt = Math.max(1, Math.round(l.sisa / (KECEPATAN_MOTOR_KMH * 1000 / 60)));
  const tiba = new Date(Date.now() + mnt * 60000).toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit'});
  return '<div class="pdKartu"><span class="pdBesar">' + pdIkon('s') + '</span><span class="col" style="gap:2px;flex:1;min-width:0"><b>Sisa ' + pdKm(l.sisa) + ' ke petak</b>' +
    '<span>±' + mnt + ' menit naik motor · tiba ±' + tiba + '</span></span></div>';
}
