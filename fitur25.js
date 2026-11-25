/* ============================================================
   SkyLens 2.0 — fitur v25 (25 Nov 2026)
   1) Peta dasar offline: ubin peta (Citra/Peta) disimpan di HP saat dilihat + petak JKS hari ini diunduh duluan selagi ada sinyal.
   2) Kunjungi ulang: toko "Nanti dikunjungi" dijadwalkan ulang (stok masih ada = +7 hari digeser ke hari rute, pemilik tidak ada =
      kunjungan JKS berikutnya), maks 3 kunjungan, tombol "Sudah dikunjungi" aktif kalau <= 50 m (100 m saat GPS lemah).
   3) Lapor jalan: sales melaporkan ruas (tertutup / hanya motor / muat 1 mobil / area gudang / tidak ada), foto kamera wajib,
      harus berada <= 25 m dari ruas, maks 5 laporan per hari. Disetujui BM -> RBM -> Super Admin. Ruas yang disetujui ikut
      mengubah hitungan kotak biru (di HP & dashboard).
   ============================================================ */
'use strict';
const F25_VERSI = 'v25';

/* ---------------- util ---------------- */
function f25Uuid(){ return (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }); }
function f25Ymd(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function f25HariIni(){ return wibYmd(); }
function f25TglPanjang(ymd){ if(!ymd) return '-'; const p = String(ymd).slice(0, 10).split('-').map(Number); const d = new Date(p[0], p[1] - 1, p[2]); return HARI[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN[d.getMonth()]; }
function f25SelisihHari(ymd){ if(!ymd) return 0; const a = Date.parse(String(ymd).slice(0, 10) + 'T00:00:00Z'), b = Date.parse(f25HariIni() + 'T00:00:00Z'); return Math.round((b - a) / 864e5); }
function f25Kode(){ return sesi ? (sesi.tester ? TESTER_KODE : sesi.kode) : null; }
function f25Pin(k){ return lsGet('sl2_pin_' + k, null); }
const F25IC = {
  ulang: '<path d="M4 12a8 8 0 0 1 14-5.3L20 9"/><path d="M20 4v5h-5"/><path d="M20 12a8 8 0 0 1-14 5.3L4 15"/><path d="M4 20v-5h5"/>',
  flag: '<path d="M5 21V4"/><path d="M5 4h11l-2 4 2 4H5"/>',
  tutup: '<circle cx="12" cy="12" r="9"/><path d="M5.6 5.6l12.8 12.8"/>',
  motor: '<circle cx="6" cy="16" r="3"/><circle cx="18" cy="16" r="3"/><path d="M6 16h3l3-6h3l3 6"/><path d="M12 10 10 7H8"/>',
  mobil: '<path d="M5 16V11l2-5h10l2 5v5"/><path d="M3 16h18v3H3z"/><circle cx="7.5" cy="16" r="1.2"/><circle cx="16.5" cy="16" r="1.2"/>',
  gudang: '<path d="M3 21V9l9-5 9 5v12"/><path d="M7 21v-7h10v7"/><path d="M7 17h10"/>',
  tidakada: '<path d="M8 3 6 21M16 3l2 18M12 4v3M12 10.5v3M12 17v3"/>',
  pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/>'
};
function f25Ico(n, st){ return '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style="' + (st || '') + '">' + (F25IC[n] || IC[n] || '') + '</svg>'; }

(function f25Css(){
  const st = document.createElement('style');
  st.textContent =
    '.f25ov{position:fixed;inset:0;z-index:1300;background:#fff;display:flex;flex-direction:column}' +
    '.f25ov .f25head{display:flex;align-items:center;gap:12px;padding:calc(env(safe-area-inset-top,0px) + 12px) 16px 10px}' +
    '.f25ov .f25body{flex:1;overflow-y:auto;padding:4px 20px 20px;display:flex;flex-direction:column;gap:14px}' +
    '.f25ov .f25foot{padding:12px 16px calc(env(safe-area-inset-bottom,0px) + 14px);display:flex;gap:10px;border-top:1px solid #EEF1F6}' +
    '.f25prog{height:4px;border-radius:2px;background:#EEF1F6;margin:0 16px}.f25prog i{display:block;height:100%;border-radius:2px;background:#FE7A1B}' +
    '.f25row{display:flex;justify-content:space-between;gap:12px;padding:12px 0;border-bottom:1px solid #EEF1F6;font-size:14px}.f25row:last-child{border-bottom:0}.f25row span{color:#4A5878}.f25row b{text-align:right}' +
    '.f25note{border-radius:14px;padding:12px 14px;font-size:13.5px;font-weight:700;line-height:1.35;display:flex;gap:10px;align-items:flex-start}' +
    '.f25note.or{background:#FFF0E4;color:#9A3A06}.f25note.ok{background:#E6F4F1;color:#0B6B5F}.f25note.nv{background:#EEF1F7;color:#1F2C4F}' +
    '.f25kat{display:flex;align-items:center;gap:14px;border:1.5px solid #E3E7EE;border-radius:16px;padding:12px 14px;background:#fff;text-align:left;font:inherit;width:100%}' +
    '.f25kat .bx{width:42px;height:42px;border-radius:12px;background:#F1F3F7;display:flex;align-items:center;justify-content:center;flex:none;color:#1F2C4F}' +
    '.f25kat.on{border-color:#FE7A1B;background:#FFF7F0}.f25kat.on .bx{background:#FE7A1B;color:#fff}.f25kat .rd{width:22px;height:22px;border-radius:50%;border:2px solid #C9D2E3;margin-left:auto;flex:none}.f25kat.on .rd{border:7px solid #FE7A1B}' +
    '.f25seg{display:flex;gap:8px;margin:2px 0 6px}.f25seg button{border:1.5px solid #E3E7EE;background:#fff;border-radius:999px;padding:9px 16px;font:inherit;font-size:14px;font-weight:800;color:#1F2C4F}.f25seg button.on{background:#1F2C4F;border-color:#1F2C4F;color:#fff}' +
    '.f25chain{display:flex;flex-direction:column;gap:10px;margin-top:6px}.f25chain .st{display:flex;gap:10px;align-items:flex-start}.f25chain .dt{width:22px;height:22px;border-radius:50%;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:900;background:#EEF1F6;color:#9AA5BC}' +
    '.f25chain .dt.ok{background:#0B6B5F;color:#fff}.f25chain .dt.cur{background:#FE7A1B;color:#fff}.f25chain .dt.no{background:#B42318;color:#fff}' +
    '.f25tag{display:inline-block;border-radius:8px;padding:2px 8px;font-size:11.5px;font-weight:800}' +
    '#lj25Pill{position:absolute;right:12px;z-index:900;border:0;border-radius:999px;background:#fff;color:#1F2C4F;font:inherit;font-size:13px;font-weight:800;padding:9px 14px;display:none;align-items:center;gap:6px;box-shadow:0 4px 14px rgba(28,33,45,.25)}' +
    '#lj25Pill.on{background:#FACC15}' +
    '#lj25Sheet{position:absolute;left:0;right:0;bottom:0;z-index:1000;background:#fff;border-radius:22px 22px 0 0;box-shadow:0 -6px 22px rgba(28,33,45,.18);padding:16px 18px calc(env(safe-area-inset-bottom,0px) + 16px);display:none;flex-direction:column;gap:10px}' +
    '.ku25pin{width:34px;height:42px;position:relative}.ku25pin b{position:absolute;left:0;top:0;width:34px;height:34px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#7C3AED;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)}' +
    '.ku25pin span{position:absolute;left:0;top:0;width:34px;height:34px;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:900;font-size:14px}.ku25pin.late b{background:#B42318}.ku25pin.sel b{background:#1F2C4F}' +
    '.ku25num{width:30px;height:30px;border-radius:50%;border:2px solid #7C3AED;background:#fff;color:#7C3AED;font:inherit;font-weight:900;font-size:13px}.ku25num.on{background:#7C3AED;color:#fff}' +
    '.f25thumb{width:56px;height:56px;border-radius:12px;object-fit:cover;flex:none;background:#E3E7EE}';
  document.head.appendChild(st);
})();

/* ==================================================================
   1) PETA DASAR OFFLINE — ubin disimpan di Cache Storage HP
   ================================================================== */
const TC = {nama: 'sl2-ubin1', maks: 2500, idx: null, simpanT: null, cache: null, kosong: null};
function tcKunci(url){ return String(url).replace(/\/\/mt\d\.google\.com\//, '//mt.google.com/').replace(/\/\/[abc]\.tile\.openstreetmap\.org\//, '//tile.openstreetmap.org/'); }
function tcIdx(){ if(!TC.idx) TC.idx = lsGet('sl2_tc_idx', {}) || {}; return TC.idx; }
function tcSimpanIdx(){ clearTimeout(TC.simpanT); TC.simpanT = setTimeout(() => lsSet('sl2_tc_idx', TC.idx || {}), 2500); }
async function tcCache(){ if(TC.cache) return TC.cache; if(!('caches' in window)) return null; try{ TC.cache = await caches.open(TC.nama); }catch(e){ TC.cache = null; } return TC.cache; }
function tcUbinKosong(){
  if(TC.kosong) return TC.kosong;
  try{
    const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
    g.fillStyle = '#E9EDF3'; g.fillRect(0, 0, 256, 256); g.strokeStyle = 'rgba(31,44,79,.07)'; g.lineWidth = 1;
    for(let i = 0; i <= 256; i += 32){ g.beginPath(); g.moveTo(i + .5, 0); g.lineTo(i + .5, 256); g.stroke(); g.beginPath(); g.moveTo(0, i + .5); g.lineTo(256, i + .5); g.stroke(); }
    TC.kosong = c.toDataURL('image/png');
  }catch(e){ TC.kosong = ''; }
  return TC.kosong;
}
async function tcPangkas(){
  const ix = tcIdx(), ks = Object.keys(ix); if(ks.length <= TC.maks) return;
  ks.sort((a, b) => ix[a] - ix[b]);
  const buang = ks.slice(0, ks.length - TC.maks + 300), c = await tcCache();
  for(const k of buang){ delete ix[k]; if(c){ try{ await c.delete(k); }catch(e){} } }
  tcSimpanIdx();
}
/* ambil ubin: cache HP dulu (hemat kuota), lalu internet (disimpan). Return blob atau null. */
async function tcAmbilBlob(url, hanyaCache){
  const k = tcKunci(url), c = await tcCache();
  if(c){ try{ const r = await c.match(k); if(r){ const ix = tcIdx(); if(Date.now() - (ix[k] || 0) > 864e5){ ix[k] = Date.now(); tcSimpanIdx(); } return await r.blob(); } }catch(e){} }
  if(hanyaCache) return null;
  const r = await fetchTO(url, {mode: 'cors', credentials: 'omit'}, 15000);
  if(!r.ok) throw new Error('http ' + r.status);
  const b = await r.blob();
  if(c && b && b.size > 0){ try{ await c.put(k, new Response(b, {headers: {'Content-Type': b.type || 'image/jpeg'}})); tcIdx()[k] = Date.now(); tcSimpanIdx(); if(Object.keys(TC.idx).length > TC.maks) tcPangkas(); }catch(e){} }
  return b;
}
const TileSL = L.TileLayer.extend({
  createTile: function(coords, done){
    const img = document.createElement('img'); img.alt = ''; img.setAttribute('role', 'presentation');
    const url = this.getTileUrl(coords), lay = this;
    const pakai = src => { img.onload = () => done(null, img); img.onerror = () => done(null, img); img.src = src; };
    tcAmbilBlob(url, netOffline()).then(b => {
      if(b){ img._bu = URL.createObjectURL(b); pakai(img._bu); }
      else { img.classList.add('ubinOff'); pakai(tcUbinKosong()); lay.fire('ubinoff'); }
    }).catch(() => {
      if(!netOffline() && navigator.onLine !== false){ pakai(url); }   // CORS/blokir: tampilkan biasa (tanpa simpan)
      else { img.classList.add('ubinOff'); pakai(tcUbinKosong()); lay.fire('ubinoff'); }
    });
    return img;
  }
});
function tcLapisan(url, opt){
  const l = new TileSL(url, opt);
  l.on('tileunload', e => { if(e.tile && e.tile._bu){ URL.revokeObjectURL(e.tile._bu); e.tile._bu = null; } });
  return l;
}
buatHybrid = function(){ return tcLapisan('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], maxZoom: 20, maxNativeZoom: 20}); };
pasangBasemapToggle = function(petaMap, hybridLayer){
  ukurSheet('zoneSheet', 'scrPeta'); ukurSheet('allSheet', 'tabPeta');
  const osmLayer = tcLapisan('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {subdomains: ['a', 'b', 'c'], maxZoom: 19});
  const ctrl = L.control({position: 'bottomleft'});
  ctrl.onAdd = function(){
    const div = L.DomUtil.create('div', 'basemapCtrl');
    div.innerHTML = '<div class="basemapToggle"><button type="button" class="bmBtn on" data-mode="hybrid">Citra</button><button type="button" class="bmBtn" data-mode="osm">Peta</button></div>';
    L.DomEvent.disableClickPropagation(div);
    div.querySelectorAll('.bmBtn').forEach(btn => btn.addEventListener('click', () => {
      div.querySelectorAll('.bmBtn').forEach(b => b.classList.remove('on')); btn.classList.add('on');
      if(btn.dataset.mode === 'osm'){ if(petaMap.hasLayer(hybridLayer)) petaMap.removeLayer(hybridLayer); if(!petaMap.hasLayer(osmLayer)) osmLayer.addTo(petaMap); }
      else { if(petaMap.hasLayer(osmLayer)) petaMap.removeLayer(osmLayer); if(!petaMap.hasLayer(hybridLayer)) hybridLayer.addTo(petaMap); }
    }));
    return div;
  };
  ctrl.addTo(petaMap);
};
/* unduh duluan: petak JKS hari ini + petak toko kunjungi ulang hari ini, zoom 15–17, maks 700 ubin per hari */
function tcUbinPetak(key, z){
  const gx = Math.round(key / 100000), gy = key - gx * 100000, lon0 = gx * S, lat0 = gy * S, n = Math.pow(2, z);
  const tx = lo => Math.floor((lo + 180) / 360 * n), ty = la => { const r = la * Math.PI / 180; return Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n); };
  const out = [];
  for(let x = tx(lon0); x <= tx(lon0 + S); x++) for(let y = ty(lat0 + S); y <= ty(lat0); y++) out.push([x, y, z]);
  return out;
}
let tcPraJalan = false;
async function tcPraUnduh(){
  if(tcPraJalan || !sesi || !zonaList || !zonaList.length || netOffline() || navigator.onLine === false) return;
  if(navigator.connection && navigator.connection.saveData) return;
  const hari = f25HariIni(), st = lsGet('sl2_tc_pra', null) || {};
  if(st.tgl !== hari){ st.tgl = hari; st.n = 0; st.petak = []; }
  if(st.n >= 700) return;
  const keys = [];
  try{ const jp = jksPetakSegar() || {}; zonaList.forEach(z => { const k = keyDari(z[2], z[3]); if(jp[k]) keys.push(k); }); }catch(e){}
  try{ ku25Daftar().filter(ku25Jatuh).forEach(x => { if(x.lat != null){ const k = keyDari(Math.floor(x.lon / S), Math.floor(x.lat / S)); if(keys.indexOf(k) < 0) keys.push(k); } }); }catch(e){}
  const todo = keys.filter(k => st.petak.indexOf(k) < 0).slice(0, 12); if(!todo.length) return;
  tcPraJalan = true;
  try{
    let sub = 0;
    for(const k of todo){
      const ubin = [15, 16, 17].reduce((a, z) => a.concat(tcUbinPetak(k, z)), []);
      for(let i = 0; i < ubin.length; i += 3){
        if(netOffline() || st.n >= 700) break;
        await Promise.all(ubin.slice(i, i + 3).map(u => tcAmbilBlob('https://mt' + ((sub++) % 4) + '.google.com/vt/lyrs=y&x=' + u[0] + '&y=' + u[1] + '&z=' + u[2]).then(() => { st.n++; }).catch(() => {})));
      }
      if(netOffline()) break;
      st.petak.push(k); lsSet('sl2_tc_pra', st);
    }
  }finally{ tcPraJalan = false; lsSet('sl2_tc_pra', st); }
}

/* ==================================================================
   2) KUNJUNGI ULANG
   ================================================================== */
const KU = {muatT: 0, mode: false, sel: 0, layer: null, sig: ''};
try{ KU.mode = lsGet('sl2_ku_mode', false) === true; }catch(e){}
const KU_ALASAN = {stok_ada: 'Stok masih ada', pemilik_tidak_ada: 'Pemilik tidak ada', '1_minggu': 'Nanti dikunjungi (seminggu)', '2_minggu': 'Nanti dikunjungi (2 minggu)'};
const KU_STATUS = {buka: 'Belum dikunjungi', noo: 'Jadi NOO', tidak_tertarik: 'Tidak tertarik', tutup_otomatis: 'Ditutup (3x dikunjungi)', dicover: 'Sudah dicover'};
function ku25Server(){ return sesi ? (lsGet('sl2_ku_' + sesi.kode, null) || {daftar: []}) : {daftar: []}; }
function ku25Lokal(){ return sesi ? (lsGet('sl2_kul_' + sesi.kode, {}) || {}) : {}; }
function ku25SimpanLokal(o){ if(sesi) lsSet('sl2_kul_' + sesi.kode, o); }
function ku25Daftar(){
  if(!sesi) return [];
  const m = {}, srv = ku25Server(), lok = ku25Lokal(), batas = Date.now() - 4 * 864e5;
  (srv.daftar || []).forEach(x => { m[x.id] = Object.assign({}, x); });
  Object.keys(lok).forEach(id => {
    const l = lok[id]; if(!l || (l.tLokal || 0) < batas) return;
    if(!m[id]) { if(l.ke >= 1) m[id] = Object.assign({}, l); return; }
    if((l.ke || 0) > (m[id].ke || 0)) Object.assign(m[id], {ke: l.ke, status: l.status, jadwal: l.jadwal, alasan: l.alasan, terakhir: l.terakhir});
  });
  return Object.values(m);
}
function ku25Jatuh(x){ return x.status === 'buka' && x.jadwal && String(x.jadwal).slice(0, 10) <= f25HariIni(); }
function ku25Terlambat(x){ return x.status === 'buka' && x.jadwal && String(x.jadwal).slice(0, 10) < f25HariIni(); }
function ku25HariIni(){
  const a = ku25Daftar().filter(ku25Jatuh);
  /* urutan rute: mulai dari posisi sekarang, lalu toko terdekat berikutnya */
  const out = []; let cur = lastPos ? {lat: lastPos.lat, lon: lastPos.lon} : null; const sisa = a.slice();
  while(sisa.length){
    let bi = 0;
    if(cur){ let bd = 1e12; sisa.forEach((x, i) => { const d = x.lat != null ? haversine(cur.lat, cur.lon, x.lat, x.lon) : 1e11; if(d < bd){ bd = d; bi = i; } }); }
    const x = sisa.splice(bi, 1)[0]; out.push(x); if(x.lat != null) cur = {lat: x.lat, lon: x.lon};
  }
  return out;
}
async function ku25Muat(paksa){
  if(!sesi || peranSesi() || sesi.tester) return;
  if(!paksa && Date.now() - KU.muatT < 600000) return;   // hemat server: tiap 10 menit (PIN dicek bcrypt)
  KU.muatT = Date.now();
  try{
    const j = await rpc('kunjungan_ulang_saya', {p_kode: sesi.kode, p_pin: f25Pin(sesi.kode), p_perangkat: perangkatId()}, 15000);
    if(j && j.ok){
      lsSet('sl2_ku_' + sesi.kode, {t: Date.now(), daftar: j.daftar || []});
      const lok = ku25Lokal(), srv = {}; (j.daftar || []).forEach(x => { srv[x.id] = x; });
      Object.keys(lok).forEach(id => { if(srv[id] && (srv[id].ke || 0) >= (lok[id].ke || 0)) delete lok[id]; });
      ku25SimpanLokal(lok);
      KU.sig = ''; segarkanLayarAktif();
    }
  }catch(e){ /* tanpa sinyal / fungsi server belum ada: pakai simpanan */ }
}
/* jadwal berikutnya: stok masih ada = +7 hari lalu digeser ke hari rute JKS yang lewat dekat toko (<= 1,5 km);
   pemilik tidak ada = hari rute JKS berikutnya yang lewat dekat toko. Tanpa data JKS: +7 / +1 hari kerja. */
function ku25Jadwal(lat, lon, alasan){
  const min = alasan === 'pemilik_tidak_ada' ? 1 : (alasan === '2_minggu' ? 14 : 7);
  const base = jksHariD(), milik = (OUTLET || []).filter(o => tokoMilikSaya(o) && o[14]);
  const dekat = (lat != null && lon != null) ? milik.filter(o => haversine(lat, lon, o[0], o[1]) <= 1500) : [];
  let cadangan = null;
  for(let i = min; i <= min + 35; i++){
    const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    if(d.getDay() === 0) continue;
    if(!cadangan) cadangan = d;
    if(!dekat.length) break;
    const rute = 'R0' + d.getDay(), sik = jksSiklus(d), m4 = jksM4(d);
    if(dekat.some(o => jksCocok(o, rute, sik, m4))) return f25Ymd(d);
  }
  return f25Ymd(cadangan || new Date(base.getFullYear(), base.getMonth(), base.getDate() + min));
}
/* dipanggil dari wizSimpan (app.js) */
function ku25Payload(p, W){
  if(W.ulang){ p.ulang_dari = W.ulang.id; p.jarak_ulang_m = W.ulang.jarak; }
  if(W.status === 'nanti_dikunjungi') p.jadwal_ulang = ku25Jadwal(p.lat, p.lon, W.sub);
}
function ku25SetelahSimpan(p, W){
  if(!sesi) return;
  const lok = ku25Lokal(), now = new Date().toISOString();
  if(W.ulang){
    const x = ku25Daftar().find(q => q.id === W.ulang.id) || {id: W.ulang.id, ke: W.ulang.ke || 1};
    const ke = (x.ke || 1) + 1;
    const st = W.status === 'lanjut_noo' ? 'noo' : (W.status === 'tidak_tertarik' ? 'tidak_tertarik' : (W.status === 'nanti_dikunjungi' ? (ke >= 3 ? 'tutup_otomatis' : 'buka') : 'dicover'));
    lok[x.id] = Object.assign({}, x, {ke: ke, status: st, jadwal: p.jadwal_ulang || x.jadwal, alasan: W.status === 'nanti_dikunjungi' ? W.sub : x.alasan, terakhir: now, tLokal: Date.now()});
    if(st === 'tutup_otomatis') setTimeout(() => toast('Sudah 3x dikunjungi — toko ini ditutup dari daftar kunjungi ulang.', 3800), 3800);
  } else if(W.status === 'nanti_dikunjungi'){
    lok[p.id] = {id: p.id, key_petak: p.key_petak, lat: p.lat, lon: p.lon, nama: p.nama_toko, uk: p.ukuran_toko, foto: null, hp: p.no_hp, alasan: W.sub,
      jadwal: p.jadwal_ulang, ke: 1, status: 'buka', terakhir: now, dibuat: now, tLokal: Date.now(), lokal: true};
    setTimeout(() => toast('Dijadwalkan kunjungi ulang: ' + f25TglPanjang(p.jadwal_ulang), 3600), 3800);
  }
  ku25SimpanLokal(lok); KU.sig = '';
}
/* --- Beranda --- */
function ku25BerandaHtml(){
  if(!sesi || peranSesi()) return '';
  const a = ku25HariIni(); if(!a.length) return '';
  const tl = a.filter(ku25Terlambat).length;
  return '<button type="button" class="card" onclick="ku25BukaPeta()" style="display:flex;align-items:center;gap:12px;padding:14px 16px;border-radius:18px;border:0;text-align:left;width:100%;background:#F3EEFF">' +
    '<span style="width:42px;height:42px;border-radius:12px;background:#7C3AED;color:#fff;display:flex;align-items:center;justify-content:center;flex:none">' + f25Ico('ulang', 'width:22px;height:22px') + '</span>' +
    '<span class="col" style="flex:1;gap:2px;min-width:0"><b style="font-size:15px;color:#4C1D95">Kunjungi ulang hari ini · ' + a.length + ' toko</b><span style="font-size:12.5px;color:#5B4B8A">' +
    (tl ? tl + ' terlambat · ' : '') + esc(a.slice(0, 2).map(x => x.nama || 'Toko').join(', ')) + (a.length > 2 ? ', …' : '') + '</span></span>' + ico('chev', 'color:#7C3AED') + '</button>';
}
function ku25BukaPeta(){ KU.mode = true; lsSet('sl2_ku_mode', true); KU.sel = 0; KU.sig = ''; bukaTab('peta'); }
/* --- Peta (tab Peta): chip + pin bernomor + kartu bawah --- */
function ku25ChipHtml(){
  if(!sesi || peranSesi()) return '';
  const n = ku25HariIni().length; if(!n && !KU.mode) return '';
  return '<button type="button" aria-pressed="' + KU.mode + '" onclick="ku25Tgl()"><i class="d" style="background:#7C3AED"></i>Kunjungi ulang · ' + n + '</button>';
}
function ku25Tgl(){ KU.mode = !KU.mode; lsSet('sl2_ku_mode', KU.mode); KU.sel = 0; KU.sig = ''; const el = $('allSheet'); if(el) el.dataset.sig = ''; petaSemuaPerbarui(); }
function ku25Gambar(){
  if(!mapAll) return;
  const a = KU.mode ? ku25HariIni() : [];
  const sig = KU.mode + '|' + KU.sel + '|' + a.map(x => x.id + x.status).join(',');
  if(sig === KU.sig) return; KU.sig = sig;
  if(KU.layer){ mapAll.removeLayer(KU.layer); KU.layer = null; }
  if(!a.length) return;
  KU.layer = L.layerGroup();
  const garis = [];
  a.forEach((x, i) => {
    if(x.lat == null) return;
    garis.push([x.lat, x.lon]);
    const kls = 'ku25pin' + (i === KU.sel ? ' sel' : '') + (ku25Terlambat(x) ? ' late' : '');
    L.marker([x.lat, x.lon], {zIndexOffset: 900 + (i === KU.sel ? 50 : 0), icon: L.divIcon({className: '', iconSize: [34, 42], iconAnchor: [17, 40], html: '<div class="' + kls + '"><b></b><span>' + (i + 1) + '</span></div>'})})
      .on('click', () => { KU.sel = i; KU.sig = ''; const el = $('allSheet'); if(el) el.dataset.sig = ''; petaSemuaPerbarui(); })
      .addTo(KU.layer);
  });
  if(garis.length > 1) L.polyline(garis, {color: '#7C3AED', weight: 4, opacity: 0.7, dashArray: '2 8', interactive: false}).addTo(KU.layer);
  KU.layer.addTo(mapAll);
}
function ku25Sheet(){
  if(!KU.mode) return false;
  const sh = $('allSheet'); if(!sh) return false;
  const a = ku25HariIni();
  let h = '<i class="grab"></i>';
  if(!a.length){
    h += '<div class="col" style="gap:4px;padding:4px 0 2px"><b style="font-size:16px">Tidak ada toko kunjungi ulang hari ini</b><span class="muted" style="font-size:13px">Toko "Nanti dikunjungi" akan muncul di sini pada jadwalnya.</span>' +
      '<button type="button" class="btn gh sm" style="margin-top:8px" onclick="ku25Tgl()">Kembali ke petak</button></div>';
  } else {
    if(KU.sel >= a.length) KU.sel = 0;
    const x = a[KU.sel], d = (lastPos && x.lat != null) ? haversine(lastPos.lat, lastPos.lon, x.lat, x.lon) : null;
    const hr = 'R0' + jksHariD().getDay();
    h += '<div class="row" style="justify-content:space-between;align-items:center;gap:8px"><span class="f25tag" style="background:#F3EEFF;color:#6D28D9">Kunjungi ulang · rute ' + hr + '</span><span class="row" style="gap:6px">' +
      a.slice(0, 6).map((q, i) => '<button type="button" class="ku25num' + (i === KU.sel ? ' on' : '') + '" onclick="ku25Pilih(' + i + ')">' + (i + 1) + '</button>').join('') + '</span></div>' +
      '<div class="row" style="gap:12px;align-items:center;margin-top:10px">' + (x.foto ? '<img class="f25thumb" src="' + esc(x.foto) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '<span class="f25thumb" style="display:flex;align-items:center;justify-content:center;color:#7C3AED">' + ico('store', 'width:26px;height:26px') + '</span>') +
      '<div class="col" style="flex:1;min-width:0;gap:2px"><b style="font-size:17px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.nama || 'Toko tanpa nama') + '</b>' +
      '<span class="muted" style="font-size:12.5px">Terakhir: ' + esc(KU_ALASAN[x.alasan] || 'Nanti dikunjungi') + ' · ' + f25SelisihHari(x.terakhir) + ' hari lalu</span>' +
      (ku25Terlambat(x) ? '<span style="font-size:12px;font-weight:800;color:#B42318">Terlambat ' + f25SelisihHari(x.jadwal) + ' hari</span>' : '<span style="font-size:12px;font-weight:800;color:#6D28D9">Jadwal hari ini · kunjungan ke-' + ((x.ke || 1) + 1) + '</span>') + '</div>' +
      '<span class="mono" style="font-size:12.5px;font-weight:800;color:#6D28D9;flex:none">' + (d == null ? '' : fmtJarak(d)) + '</span></div>' +
      '<div class="bar-actions" style="margin-top:12px"><button class="btn or" onclick="ku25BukaKartu(\'' + esc(x.id) + '\')">' + ico('store') + 'Buka kartu toko</button></div>';
  }
  if(sh.dataset.sig !== h){ sh.innerHTML = h; sh.dataset.sig = h; }
  return true;
}
function ku25Pilih(i){
  KU.sel = i; KU.sig = ''; const el = $('allSheet'); if(el) el.dataset.sig = '';
  petaSemuaPerbarui();
  const x = ku25HariIni()[i]; if(x && x.lat != null && mapAll) mapAll.panTo([x.lat, x.lon]);
}
/* --- kartu toko kunjungi ulang (layar penuh) --- */
let KC = null;
function ku25Ambang(){ const a = lastPos && lastPos.acc != null ? lastPos.acc : 99; return a > 25 ? 100 : 50; }
async function ku25BukaKartu(id){
  const x = ku25Daftar().find(q => String(q.id) === String(id)); if(!x) return;
  KC = {x: x, detail: null};
  let ov = $('ku25Kartu');
  if(!ov){ ov = document.createElement('section'); ov.id = 'ku25Kartu'; ov.className = 'f25ov'; document.getElementById('app').appendChild(ov); }
  ov.style.display = 'flex'; ku25RenderKartu();
  KC.t = setInterval(ku25RenderKartu, 2000);
  try{ const j = await rpc('temuan_detail', {p_kode: sesi.kode, p_id: String(x.temuan_terakhir || x.id)}, 9000); if(KC && Array.isArray(j) && j[0]){ KC.detail = j[0]; ku25RenderKartu(); } }catch(e){}
}
function ku25TutupKartu(){ if(KC && KC.t) clearInterval(KC.t); KC = null; const ov = $('ku25Kartu'); if(ov) ov.style.display = 'none'; }
function ku25RenderKartu(){
  const ov = $('ku25Kartu'); if(!ov || !KC) return;
  const x = KC.x, p = KC.detail || {}, foto = p.foto_url || x.foto;
  const d = (lastPos && x.lat != null && (Date.now() - lastPos.t) < 180000) ? haversine(lastPos.lat, lastPos.lon, x.lat, x.lon) : null;
  const amb = ku25Ambang(), boleh = d != null && d <= amb;
  const h = '<div class="f25head"><button type="button" class="ibtn" onclick="ku25TutupKartu()" aria-label="Kembali">' + ico('back') + '</button>' +
    '<div class="col" style="flex:1;min-width:0;gap:2px"><b style="font-size:17px">Kunjungi ulang</b><span class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.nama || 'Toko tanpa nama') + '</span></div>' +
    '<span class="mono muted" style="font-size:13px">' + ((x.ke || 1) + 1) + '/3</span></div><div class="f25prog"><i style="width:' + Math.round(((x.ke || 1) + 1) / 3 * 100) + '%"></i></div>' +
    '<div class="f25body">' +
    (foto ? '<div style="position:relative"><img src="' + esc(foto) + '" alt="Foto toko" style="width:100%;max-height:240px;object-fit:cover;border-radius:18px;background:#E3E7EE" onerror="this.style.display=\'none\'"><span class="f25tag" style="position:absolute;right:10px;bottom:10px;background:rgba(28,33,45,.75);color:#fff">Foto temuan · ' + esc(tglPendek(Date.parse(x.dibuat || x.terakhir) || Date.now())) + '</span></div>' : '') +
    '<div class="card" style="padding:4px 16px;border-radius:18px">' +
      '<div class="f25row"><span>Alasan terakhir</span><b>' + esc(KU_ALASAN[x.alasan] || 'Nanti dikunjungi') + '</b></div>' +
      '<div class="f25row"><span>Kunjungan terakhir</span><b>' + esc(tglPendek(Date.parse(x.terakhir) || Date.now())) + ' · ' + f25SelisihHari(x.terakhir) + ' hari lalu</b></div>' +
      '<div class="f25row"><span>Jadwal ulang</span><b>' + esc(f25TglPanjang(x.jadwal)) + (ku25Terlambat(x) ? ' <span style="color:#B42318">(terlambat)</span>' : '') + '</b></div>' +
      (x.uk || p.ukuran_toko ? '<div class="f25row"><span>Ukuran</span><b>' + esc(p.ukuran_toko || x.uk) + '</b></div>' : '') +
      ((p.no_hp || x.hp) ? '<div class="f25row"><span>No HP</span><b>' + esc(p.no_hp || x.hp) + '</b></div>' : '') +
      '<div class="f25row"><span>Dicatat oleh</span><b>' + esc(sesi ? sesi.nama : '') + '</b></div></div>' +
    (d == null ? '<div class="f25note or">' + ico('gps', 'width:18px;height:18px;flex:none') + '<span>Menunggu lokasi GPS… Tombol aktif kalau jarakmu ' + amb + ' m atau kurang dari toko.</span></div>'
      : (boleh ? '<div class="f25note ok">' + ico('check', 'width:18px;height:18px;flex:none') + '<span>Kamu sudah di toko (±' + Math.round(d) + ' m). Catat hasil kunjungannya.</span></div>'
        : '<div class="f25note or">' + f25Ico('pin', 'width:18px;height:18px;flex:none') + '<span>Kamu masih ' + fmtJarak(d) + ' dari toko. Tombol aktif kalau jarakmu ' + amb + ' m atau kurang.' + (amb === 100 ? ' (GPS lemah: batas dilonggarkan jadi 100 m)' : '') + '</span></div>')) +
    (x.lat != null ? '<button type="button" class="btn gh" onclick="bukaMaps(' + x.lat + ',' + x.lon + ')">' + ico('nav') + 'Arahkan ke toko</button>' : '') +
    '</div><div class="f25foot"><button type="button" class="btn or" style="flex:1" ' + (boleh ? '' : 'disabled') + ' onclick="ku25Mulai()">' + ico('check') + 'Sudah dikunjungi</button></div>';
  if(ov.dataset.sig !== h){ const sc = ov.querySelector('.f25body'), t = sc ? sc.scrollTop : 0; ov.innerHTML = h; ov.dataset.sig = h; const s2 = ov.querySelector('.f25body'); if(s2) s2.scrollTop = t; }
}
function ku25Mulai(){
  if(!KC) return;
  const x = KC.x, p = KC.detail || {};
  const d = (lastPos && x.lat != null) ? haversine(lastPos.lat, lastPos.lon, x.lat, x.lon) : null;
  if(d == null || d > ku25Ambang()){ toast('Dekati toko dulu, maks. ' + ku25Ambang() + ' m'); return; }
  ku25TutupKartu();
  if(W && W.fotoUrl) URL.revokeObjectURL(W.fotoUrl);
  rdLepasFoto(); RD = null;
  W = wizBaru(); wizAktifDariLayar = screenAktif;
  Object.assign(W, {sudah: 'tidak', step: 2, nama: p.nama_toko || x.nama || '', ukuran: p.ukuran_toko || x.uk || '', ke: p.belanja_kemana || '', grosir: p.nama_grosir_pasar || '',
    belanja: p.rata_belanja_nabati != null ? String(p.rata_belanja_nabati) : '', hp: p.no_hp || x.hp || '', ulang: {id: x.id, jarak: Math.round(d), ke: x.ke || 1}});
  try{ $('popupProspek').style.display = 'none'; }catch(e){}
  tampil('scrTemuan'); renderWiz(); siapkanGpsTemuan();
  toast('Kunjungan ke-' + ((x.ke || 1) + 1) + ': cek data toko, lalu catat hasilnya', 3200);
}

/* ==================================================================
   3) LAPOR JALAN
   ================================================================== */
const LJ = {pilih: false, sel: null, lap: null, ver: 0, form: null, muatT: 0};
const LJ_KAT = [
  ['tutup', 'Jalan tertutup / tak bisa dilewati', 'Portal, digembok, banjir'],
  ['motor', 'Hanya muat motor (gang)', 'Terlalu sempit untuk mobil'],
  ['mobil', 'Muat 1 mobil', 'Satu mobil, tidak bisa papasan'],
  ['gudang', 'Area gudang / pabrik', 'Bukan permukiman'],
  ['tidakada', 'Jalan tidak ada di lapangan', 'Ada di peta, tak ada di lapangan']
];
const LJ_KAT_PENDEK = {tutup: 'Jalan tertutup', motor: 'Hanya muat motor', mobil: 'Muat 1 mobil', gudang: 'Area gudang', tidakada: 'Jalan tidak ada'};
const LJ_KELAS = {B: 'Jalan besar', Q: 'Jalan besar', M: 'Jalan mobil', T: 'Gang motor'};
const LJ_STATUS = {menunggu_bm: ['Menunggu BM', '#FFF0E4', '#9A3A06'], menunggu_rbm: ['Menunggu RBM', '#FFF0E4', '#9A3A06'], menunggu_sa: ['Menunggu Super Admin', '#FFF0E4', '#9A3A06'],
  disetujui: ['Disetujui', '#E6F4F1', '#0B6B5F'], ditolak: ['Ditolak', '#FDECEC', '#B42318'], antre: ['Menunggu sinyal', '#EEF1F7', '#1F2C4F'], gagal: ['Gagal dikirim', '#FDECEC', '#B42318']};
const LJ_MAKS_HARI = 5, LJ_GEOFENCE = 25;
function lj25Data(){ return sesi ? (lsGet('sl2_lj_' + sesi.kode, null) || {laporan: [], koreksi: []}) : {laporan: [], koreksi: []}; }
function lj25Lokal(){ return sesi ? (lsGet('sl2_ljl_' + sesi.kode, []) || []) : []; }
function lj25SimpanLokal(a){ if(sesi) lsSet('sl2_ljl_' + sesi.kode, a.slice(0, 60)); }
async function lj25Muat(paksa){
  if(!sesi || peranSesi() || sesi.tester) return;
  if(!paksa && Date.now() - LJ.muatT < 900000) return;   // tiap 15 menit
  LJ.muatT = Date.now();
  try{
    const j = await rpc('lapor_jalan_saya', {p_kode: sesi.kode, p_pin: f25Pin(sesi.kode), p_perangkat: perangkatId()}, 15000);
    if(j && j.ok){
      const lama = JSON.stringify(lj25Data().koreksi || []);
      lsSet('sl2_lj_' + sesi.kode, {t: Date.now(), laporan: j.laporan || [], koreksi: j.koreksi || []});
      const ids = new Set((j.laporan || []).map(x => x.id)); lj25SimpanLokal(lj25Lokal().filter(x => !ids.has(x.id)));
      if(JSON.stringify(j.koreksi || []) !== lama) lj25KoreksiBerubah();
      if(screenAktif === 'scrMain' && tabAktif === 'riwayat') renderRiwayat();
    }
  }catch(e){}
}
function lj25KoreksiBerubah(){
  LJ.ver++; LJ.kx = null;
  if(typeof JL !== 'undefined'){ JL.ver++; JL.stC = {}; }   // kotak dievaluasi ulang pada titik GPS berikutnya
  try{ segarkanLayarAktif(); }catch(e){}
}
/* dipanggil dari jlStatKotak (jalan.js): kelas potongan setelah koreksi lapor jalan yang SUDAH disetujui. null = tidak dihitung. */
function lj25Kat(q){
  if(q._ljv === LJ.ver) return q._ljk;
  let k = q.kat;
  if(!LJ.kx){ LJ.kx = {}; (lj25Data().koreksi || []).forEach(r => { if(r.key_petak != null && Array.isArray(r.geom)) (LJ.kx[r.key_petak] = LJ.kx[r.key_petak] || []).push(r); }); }
  const arr = LJ.kx[q.key];
  if(arr) for(const r of arr){
    if(r.kotak != null && r.kotak !== q.cell) continue;
    if(r.kelas && r.kelas !== q.kat && !(r.kelas === 'B' && q.kat === 'Q') && !(r.kelas === 'Q' && q.kat === 'B')) continue;
    if(lj25JarakGaris(q.m[0], q.m[1], r.geom) > 8 || !lj25Searah(q, r.geom)) continue;
    if(r.kategori === 'tutup' || r.kategori === 'tidakada' || r.kategori === 'gudang') k = null;
    else if(r.kategori === 'motor') k = 'T';
    else if(r.kategori === 'mobil' && (q.kat === 'B' || q.kat === 'Q')) k = 'M';
    break;
  }
  q._ljv = LJ.ver; q._ljk = k; return k;
}
function lj25JarakSeg(la, lo, a, b){
  const kx = 111320 * Math.cos(la * Math.PI / 180), KY = 110574;
  const ax = (a[1] - lo) * kx, ay = (a[0] - la) * KY, vx = (b[1] - a[1]) * kx, vy = (b[0] - a[0]) * KY, ll = vx * vx + vy * vy;
  const s = ll ? Math.max(0, Math.min(1, -(ax * vx + ay * vy) / ll)) : 0, ex = ax + vx * s, ey = ay + vy * s;
  return Math.sqrt(ex * ex + ey * ey);
}
function lj25Searah(q, g){   // potongan harus searah dengan ruas yang dilaporkan (<= 25°), supaya gang yang memotong tidak ikut
  let bi = 0, bd = 1e9; for(let i = 0; i + 1 < g.length; i++){ const d = lj25JarakSeg(q.m[0], q.m[1], g[i], g[i + 1]); if(d < bd){ bd = d; bi = i; } }
  const a = g[bi], b = g[bi + 1] || g[bi], kx = 111320 * Math.cos(a[0] * Math.PI / 180);
  const ang = ((Math.atan2((b[0] - a[0]) * 110574, (b[1] - a[1]) * kx) * 180 / Math.PI) % 180 + 180) % 180;
  let d = Math.abs(ang - q.ang); if(d > 90) d = 180 - d; return d <= 25;
}
function lj25JarakGaris(la, lo, g){ let d = 1e9; for(let i = 0; i + 1 < g.length; i++) d = Math.min(d, lj25JarakSeg(la, lo, g[i], g[i + 1])); return d; }
/* potongan terdekat di petak zona aktif (tanpa tol) */
function lj25Terdekat(la, lo, R){
  if(!zonaAktif || zonaAktif.manual || typeof jlPotonganPetak !== 'function' || !jlPetak(zonaAktif.key_petak)) return null;
  let best = null, bd = R;
  jlPotonganPetak(zonaAktif.key_petak).forEach(q => { if(q.tol) return; const d = lj25JarakSeg(la, lo, q.a, q.b); if(d < bd){ bd = d; best = q; } });
  return best ? {q: best, d: bd} : null;
}
/* ruas yang dilaporkan = semua potongan ruas itu di kotak yang sama, disambung urut */
function lj25Ruas(q){
  const pot = jlPotongan(q.ri).filter(x => x.key === q.key && x.cell === q.cell).sort((a, b) => a.seq - b.seq);
  const blok = []; let cur = [];
  pot.forEach(x => { if(cur.length && x.seq !== cur[cur.length - 1].seq + 1){ blok.push(cur); cur = []; } cur.push(x); });
  if(cur.length) blok.push(cur);
  const pilih = blok.find(b => b.some(x => x.id === q.id)) || [q];
  const geom = [pilih[0].a].concat(pilih.map(x => x.b)).map(p => [Math.round(p[0] * 1e5) / 1e5, Math.round(p[1] * 1e5) / 1e5]);
  const rd = JL.data.roads[q.ri] || [], r = Math.floor(q.cell / GRID_N), c = q.cell % GRID_N;
  return {ri: q.ri, key: q.key, cell: q.cell, kotak: ('ABCD'[GRID_N - 1 - r] || '') + (c + 1), kelas: q.kat, nama: (typeof namaJalanRapi === 'function' && rd[2]) ? namaJalanRapi(rd[2]) : 'Jalan tanpa nama',
    panjang: Math.round(pilih.reduce((a, x) => a + x.len, 0)), geom: geom};
}
function lj25PasangUi(){
  const scr = $('scrPeta'); if(!scr || $('lj25Pill')) return;
  const b = document.createElement('button'); b.type = 'button'; b.id = 'lj25Pill'; b.innerHTML = f25Ico('flag', 'width:16px;height:16px') + 'Lapor jalan'; b.onclick = lj25Mulai;
  scr.appendChild(b);
  const sh = document.createElement('div'); sh.id = 'lj25Sheet'; scr.appendChild(sh);
}
function lj25AturPill(){
  const b = $('lj25Pill'); if(!b) return;
  const ok = screenAktif === 'scrPeta' && zonaAktif && !zonaAktif.manual && sesi && !peranSesi() && typeof JL !== 'undefined' && JL.data && jlPetak(zonaAktif.key_petak);
  b.style.display = ok && !LJ.pilih ? 'flex' : 'none';
  const sc = $('sweepcard'); let top = 150; try{ if(sc && sc.offsetHeight) top = sc.getBoundingClientRect().bottom - scr0() + 10; }catch(e){}
  b.style.top = Math.max(110, top) + 'px';
}
function scr0(){ const s = $('scrPeta'); return s ? s.getBoundingClientRect().top : 0; }
function lj25Mulai(){
  if(!sesi || sesi.tester){ toast('Lapor jalan tidak tersedia di mode tester'); return; }
  if(lj25JumlahHariIni() >= LJ_MAKS_HARI){ toast('Batas ' + LJ_MAKS_HARI + ' laporan jalan per hari sudah tercapai'); return; }
  LJ.pilih = true; LJ.sel = null; lj25AturPill();
  if(map && !map._lj25){ map._lj25 = true; map.on('click', e => { if(!LJ.pilih) return; const t = lj25Terdekat(e.latlng.lat, e.latlng.lng, 30); if(t){ lj25Pilih(t.q, 'ketuk'); } else toast('Ketuk tepat di garis jalannya'); }); }
  const pos = lastPos && (Date.now() - lastPos.t) < 120000 ? lastPos : null;
  if(pos && (pos.acc || 99) <= 25){
    const t = lj25Terdekat(pos.lat, pos.lon, LJ_GEOFENCE);
    if(t){ lj25Pilih(t.q, 'gps'); return; }
    lj25RenderSheet('Tidak ada ruas dalam ' + LJ_GEOFENCE + ' m dari posisimu. Ketuk ruas jalannya di peta.');
  } else lj25RenderSheet(pos ? 'GPS kurang akurat (±' + Math.round(pos.acc) + ' m). App tidak menebak ruasnya, ketuk ruas jalannya di peta.' : 'Menunggu GPS… Ketuk ruas jalannya di peta.');
}
function lj25Batal(){
  LJ.pilih = false; LJ.sel = null;
  if(LJ.lap && map){ map.removeLayer(LJ.lap); LJ.lap = null; }
  const sh = $('lj25Sheet'); if(sh) sh.style.display = 'none';
  lj25AturPill();
}
function lj25JarakSaya(){
  const pos = lastPos && (Date.now() - lastPos.t) < 120000 ? lastPos : null;
  if(!pos || !LJ.sel) return null;
  return lj25JarakGaris(pos.lat, pos.lon, LJ.sel.geom);
}
function lj25BatasJarak(){ const a = lastPos && lastPos.acc != null ? lastPos.acc : 99; return a <= 25 ? LJ_GEOFENCE : Math.min(60, Math.round(a + 10)); }
function lj25Pilih(q, cara){
  LJ.sel = Object.assign(lj25Ruas(q), {cara: cara});
  if(LJ.lap && map) map.removeLayer(LJ.lap);
  if(map){ LJ.lap = L.polyline(LJ.sel.geom, {color: '#FACC15', weight: 9, opacity: 0.95, lineCap: 'round', interactive: false}).addTo(map); try{ followMode = false; tampilRecenter(); map.fitBounds(LJ.lap.getBounds(), {paddingTopLeft: [40, 170], paddingBottomRight: [40, 330], maxZoom: 18}); }catch(e){} }
  lj25RenderSheet();
}
function lj25RenderSheet(pesan){
  const sh = $('lj25Sheet'); if(!sh) return;
  let h = '<div class="row" style="justify-content:space-between;align-items:center"><span class="row" style="gap:6px;font-size:14px;font-weight:800">' + ico('chev', 'display:none') + f25Ico('tidakada', 'width:16px;height:16px') + (LJ.sel ? 'Ruas jalan dipilih' : 'Pilih ruas jalan') + '</span>' +
    '<button type="button" class="ibtn" onclick="lj25Batal()" aria-label="Batal">' + ico('close') + '</button></div>';
  if(!LJ.sel){
    h += '<div class="f25note nv">' + ico('info', 'width:18px;height:18px;flex:none') + '<span>' + esc(pesan || 'Ketuk ruas jalannya di peta.') + '</span></div><button type="button" class="btn gh" onclick="lj25Batal()">Batal</button>';
  } else {
    const s = LJ.sel, d = lj25JarakSaya(), maks = lj25BatasJarak(), dekat = d != null && d <= maks;
    h += '<div class="col" style="gap:2px"><b style="font-size:19px">' + esc(s.nama) + '</b><span class="muted" style="font-size:13px">' + esc(LJ_KELAS[s.kelas] || 'Jalan') + ' · Kotak ' + s.kotak + ' · ±' + s.panjang + ' m' + (s.cara === 'gps' ? ' · dipilih dari GPS' : '') + '</span></div>' +
      (dekat ? '<div class="f25note or">' + ico('info', 'width:18px;height:18px;flex:none') + '<span>Kalau laporanmu disetujui BM, RBM, dan Super Admin, hitungan kotak ' + s.kotak + ' ikut menyesuaikan. Sampai disetujui, ruas tetap dihitung.</span></div>'
        : '<div class="f25note or">' + f25Ico('pin', 'width:18px;height:18px;flex:none') + '<span>' + (d == null ? 'Menunggu GPS. ' : 'Kamu ±' + Math.round(d) + ' m dari ruas ini. ') + 'Laporan hanya bisa dikirim kalau kamu berada di ruasnya (maks ' + maks + ' m).</span></div>') +
      '<button type="button" class="btn or" ' + (dekat ? '' : 'disabled') + ' onclick="lj25BukaForm()">' + f25Ico('flag') + 'Lapor kondisi jalan ini</button>';
  }
  sh.innerHTML = h; sh.style.display = 'flex';
}
function lj25JumlahHariIni(){
  const hr = f25HariIni();
  const a = (lj25Data().laporan || []).filter(x => wibYmd(Date.parse(x.waktu)) === hr).length;
  return a + lj25Lokal().filter(x => wibYmd(Date.parse(x.waktu)) === hr && !(lj25Data().laporan || []).some(y => y.id === x.id)).length;
}
function lj25BukaForm(){
  if(!LJ.sel) return;
  LJ.form = {kat: '', foto: null, fotoUrl: null, catatan: '', err: {}, kirim: false, sel: LJ.sel, jarak: Math.round(lj25JarakSaya() || 0), acc: lastPos ? Math.round(lastPos.acc || 0) : null, lat: lastPos ? lastPos.lat : null, lon: lastPos ? lastPos.lon : null};
  let ov = $('lj25Form');
  if(!ov){ ov = document.createElement('section'); ov.id = 'lj25Form'; ov.className = 'f25ov'; document.getElementById('app').appendChild(ov); }
  if(!$('lj25FotoIn')){ const i = document.createElement('input'); i.type = 'file'; i.id = 'lj25FotoIn'; i.accept = 'image/*'; i.setAttribute('capture', 'environment'); i.style.display = 'none'; i.onchange = () => lj25OnFoto(i); document.body.appendChild(i); }
  ov.style.display = 'flex'; lj25RenderForm();
}
function lj25TutupForm(){ if(LJ.form && LJ.form.fotoUrl) URL.revokeObjectURL(LJ.form.fotoUrl); LJ.form = null; const ov = $('lj25Form'); if(ov) ov.style.display = 'none'; }
function lj25RenderForm(selesai){
  const ov = $('lj25Form'); if(!ov) return;
  const F = LJ.form;
  if(selesai){
    const s = selesai, bm = 'BM ' + (sesi ? sesi.depot : '');
    ov.innerHTML = '<div class="f25head"><button type="button" class="ibtn" onclick="lj25TutupForm()" aria-label="Tutup">' + ico('close') + '</button><div class="col" style="flex:1;gap:2px"><b style="font-size:17px">Lapor kondisi jalan</b><span class="muted" style="font-size:12px">' + esc(s.nama) + ' · Kotak ' + s.kotak + '</span></div><span class="mono muted" style="font-size:13px">2/2</span></div><div class="f25prog"><i style="width:100%"></i></div>' +
      '<div class="f25body" style="align-items:stretch"><div style="align-self:center;width:72px;height:72px;border-radius:50%;background:#E6F4F1;color:#0B6B5F;display:flex;align-items:center;justify-content:center;margin-top:18px">' + ico('check', 'width:38px;height:38px') + '</div>' +
      '<h1 style="font-size:24px;font-weight:800;text-align:center">Laporan tersimpan</h1><p class="muted" style="text-align:center;font-size:14.5px">Menunggu persetujuan <b>' + esc(bm) + '</b>. Ruas tetap dihitung sampai laporanmu disetujui semua tingkat.</p>' +
      '<div class="card" style="padding:14px 16px;border-radius:18px"><span class="muted" style="font-size:12px;font-weight:800;letter-spacing:.04em">RANTAI PERSETUJUAN</span>' + lj25RantaiHtml({status: 'menunggu_bm'}) + '</div>' +
      '<p class="muted" style="font-size:13px;text-align:center">' + (navigator.onLine === false || netOffline() ? 'Belum ada sinyal — laporan dikirim otomatis begitu sinyal kembali.' : 'Laporan sedang dikirim…') + '</p></div>' +
      '<div class="f25foot"><button type="button" class="btn gh" style="flex:1" onclick="lj25TutupForm();lj25LihatRiwayat()">Laporan saya</button><button type="button" class="btn or" style="flex:1" onclick="lj25TutupForm()">Kembali ke peta</button></div>';
    return;
  }
  if(!F) return;
  const s = F.sel, E = F.err;
  const h = '<div class="f25head"><button type="button" class="ibtn" onclick="lj25TutupForm()" aria-label="Tutup">' + ico('close') + '</button><div class="col" style="flex:1;min-width:0;gap:2px"><b style="font-size:17px">Lapor kondisi jalan</b><span class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(s.nama) + ' · Kotak ' + s.kotak + ' · ±' + s.panjang + ' m</span></div><span class="mono muted" style="font-size:13px">1/2</span></div><div class="f25prog"><i style="width:50%"></i></div>' +
    '<div class="f25body"><div class="col" style="gap:4px"><h1 style="font-size:23px;font-weight:800">Apa kondisi ruas ini?</h1><span class="muted" style="font-size:14px">Pilih satu. Laporan dicek BM → RBM → Super Admin.</span></div>' +
    '<div class="col" style="gap:10px">' + LJ_KAT.map(k => '<button type="button" class="f25kat' + (F.kat === k[0] ? ' on' : '') + '" onclick="lj25Kat2(\'' + k[0] + '\')"><span class="bx">' + f25Ico(k[0], 'width:22px;height:22px') + '</span><span class="col" style="gap:2px;flex:1"><b style="font-size:15px">' + k[1] + '</b><span class="muted" style="font-size:12.5px">' + k[2] + '</span></span><i class="rd"></i></button>').join('') +
    (E.kat ? '<span class="err">Pilih satu kategori dulu.</span>' : '') + '</div>' +
    '<div class="col" style="gap:8px"><span class="lbl">Foto kondisi jalan <span class="req">wajib</span></span>' +
    (F.foto ? '<div class="photo has"><img src="' + F.fotoUrl + '" alt="Foto jalan"><button type="button" class="retake" onclick="$(\'lj25FotoIn\').click()">' + ico('cam', 'width:16px;height:16px') + 'Ulang</button></div>'
      : '<button type="button" class="photo' + (E.foto ? ' bad' : '') + '" onclick="$(\'lj25FotoIn\').click()">' + ico('cam', 'width:34px;height:34px') + '<b>Ambil foto</b><span style="font-size:12px;color:' + (E.foto ? '#9A3412' : 'var(--muted)') + '">' + (E.foto ? 'Foto wajib. Laporan tanpa foto tidak bisa dikirim.' : 'Langsung dari kamera, bukan dari galeri') + '</span></button>') + '</div>' +
    '<div class="col" style="gap:8px"><span class="lbl">Catatan <span class="muted" style="font-weight:600">opsional</span></span><textarea id="lj25Cat" class="in" rows="2" maxlength="300" placeholder="Mis. portal dikunci jam 18.00" oninput="if(LJ.form)LJ.form.catatan=this.value">' + esc(F.catatan) + '</textarea></div>' +
    '<span class="muted" style="font-size:12px">' + ico('gps', 'width:14px;height:14px;vertical-align:-2px') + ' Lokasi terekam ±' + (F.acc == null ? '?' : F.acc) + ' m · ' + esc(f25TglPanjang(f25HariIni())) + ' · ' + wibJam() + ' · ±' + F.jarak + ' m dari ruas</span></div>' +
    '<div class="f25foot"><button type="button" class="btn gh" style="flex:1" onclick="lj25TutupForm()">Batal</button><button type="button" class="btn or" style="flex:2" onclick="lj25Kirim2()"' + (F.kirim ? ' disabled' : '') + '>Kirim laporan</button></div>';
  const sc = ov.querySelector('.f25body'), t = sc ? sc.scrollTop : 0;
  ov.innerHTML = h; const s2 = ov.querySelector('.f25body'); if(s2) s2.scrollTop = t;
}
function lj25Kat2(k){ if(!LJ.form) return; LJ.form.kat = k; LJ.form.err.kat = false; lj25RenderForm(); }
async function lj25OnFoto(input){
  const f = input.files && input.files[0] ? input.files[0] : null; if(!f || !LJ.form) return;
  let blob; try{ blob = await buatFotoBerwatermark(f); }catch(e){ blob = f; }
  input.value = ''; if(!LJ.form) return;
  if(LJ.form.fotoUrl) URL.revokeObjectURL(LJ.form.fotoUrl);
  LJ.form.foto = blob; LJ.form.fotoUrl = URL.createObjectURL(blob); LJ.form.err.foto = false; lj25RenderForm();
}
async function lj25Kirim2(){
  const F = LJ.form; if(!F || F.kirim) return;
  F.err = {kat: !F.kat, foto: !F.foto};
  if(F.err.kat || F.err.foto){ lj25RenderForm(); toast(F.err.kat ? 'Pilih kondisi jalannya dulu' : 'Foto kondisi jalan wajib', 2600); return; }
  if(lj25JumlahHariIni() >= LJ_MAKS_HARI){ toast('Batas ' + LJ_MAKS_HARI + ' laporan jalan per hari sudah tercapai', 3200); return; }
  F.kirim = true; lj25RenderForm();
  const s = F.sel, id = f25Uuid(), waktu = new Date().toISOString();
  const payload = {id: id, key_petak: s.key, kotak: s.cell, nama_jalan: s.nama, kelas: s.kelas, panjang_m: s.panjang, geom: s.geom, kategori: F.kat, catatan: (F.catatan || '').trim() || null,
    lat: F.lat, lon: F.lon, akurasi: F.acc, jarak_m: F.jarak, cara_pilih: s.cara, waktu: waktu};
  try{
    await obPutAsli({id: 'l_' + id, tipe: 'lapor', kode: sesi.kode, t: Date.now(), tries: 0, payload: payload, foto: F.foto});
    const lok = lj25Lokal(); lok.unshift({id: id, key_petak: s.key, kotak: s.cell, nama: s.nama, kelas: s.kelas, panjang: s.panjang, kategori: F.kat, waktu: waktu, status: 'antre'}); lj25SimpanLokal(lok);
    await hitungOutbox();
  }catch(e){ F.kirim = false; lj25RenderForm(); toast('Gagal menyimpan: ' + e.message, 4000); return; }
  lj25Batal();
  if(F.fotoUrl) URL.revokeObjectURL(F.fotoUrl); LJ.form = null;
  lj25RenderForm(s);
  prosesOutbox();
}
/* dipanggil dari prosesOutbox (app.js) */
async function lj25KirimAntrean(all){
  const rec = (all || []).filter(x => x.tipe === 'lapor').sort((a, b) => a.t - b.t);
  for(const r of rec){
    try{
      if(r.foto && !r.payload.foto_url){
        const path = r.kode + '/jl_' + r.payload.id + '.jpg';
        const u = await fetchTO(SUPABASE_URL + '/storage/v1/object/temuan-foto/' + encodeURIComponent(r.kode) + '/jl_' + r.payload.id + '.jpg', {method: 'POST', headers: hdr({'Content-Type': 'image/jpeg'}), body: r.foto}, 60000);
        if(!u.ok){ const tx = await u.text(); if(!/Duplicate|already exists/i.test(tx)) throw new Error('upload foto gagal (' + u.status + ')'); }
        r.payload.foto_url = SUPABASE_URL + '/storage/v1/object/public/temuan-foto/' + path;
        await obPutAsli(r);
      }
      const j = await rpc('kirim_lapor_jalan', {p_kode: r.kode, p_pin: f25Pin(r.kode), p_perangkat: perangkatId(), p_data: r.payload}, 20000);
      if(j && j.ok){ await obDel(r.id); LJ.muatT = 0; }
      else if(j && j.tolak){ await obDel(r.id); const lok = lj25Lokal(); const x = lok.find(q => q.id === r.payload.id); if(x){ x.status = 'gagal'; x.err = j.error; lj25SimpanLokal(lok); } }
      else { r.tries = (r.tries || 0) + 1; r.err = (j && j.error) || 'ditolak'; await obPutAsli(r); }
    }catch(e){ r.tries = (r.tries || 0) + 1; r.err = e.message; try{ await obPutAsli(r); }catch(_){} break; }
  }
  if(rec.length) setTimeout(() => lj25Muat(true), 1500);
}
/* --- Riwayat: Temuan toko | Laporan jalan --- */
let RW_TAB = 'temuan';
const renderRiwayatAsli25 = renderRiwayat;
renderRiwayat = function(){
  const el = $('riwayatBody'); if(!el || !sesi) return;
  const n = lj25Semua().length;
  const seg = '<div class="f25seg" id="f25seg"><button type="button" class="' + (RW_TAB === 'temuan' ? 'on' : '') + '" onclick="lj25Tab(\'temuan\')">Temuan toko</button><button type="button" class="' + (RW_TAB === 'jalan' ? 'on' : '') + '" onclick="lj25Tab(\'jalan\')">Laporan jalan' + (n ? ' ' + n : '') + '</button></div>';
  if(RW_TAB === 'temuan' || peranSesi()){
    if(el.dataset.f25 === 'jalan'){ el.dataset.sig = ''; el.dataset.f25 = ''; }
    renderRiwayatAsli25();
    if(peranSesi()) return;
    const s = el.querySelector('#f25seg');
    if(!s){ const h1 = el.querySelector('h1'); const row = h1 ? h1.parentElement : null; const d = document.createElement('div'); d.innerHTML = seg; if(row && row.nextSibling) el.insertBefore(d.firstChild, row.nextSibling); else el.prepend(d.firstChild); }
    else if(s.outerHTML !== seg){ s.outerHTML = seg; }
    return;
  }
  el.dataset.f25 = 'jalan';
  const a = lj25Semua(), ok = a.filter(x => x.status === 'disetujui').length, tunggu = a.filter(x => /^menunggu/.test(x.status) || x.status === 'antre').length;
  let h = '<div class="row" style="justify-content:space-between"><h1 style="font-size:24px;font-weight:800">Riwayat</h1><span class="muted" style="font-size:12px;font-weight:700">' + esc(namaDepan(sesi.nama)) + '</span></div>' + seg +
    '<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:10px"><div class="hero" style="padding:16px;gap:4px"><span style="font-size:13px;font-weight:700">Laporan disetujui</span><b style="font-size:36px;line-height:1">' + ok + '</b><span style="font-size:12px">dari ' + a.length + ' laporan jalan</span></div>' +
    '<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:4px;border-radius:20px"><span class="muted" style="font-size:13px;font-weight:700">Menunggu</span><b style="font-size:36px;line-height:1">' + tunggu + '</b><span class="muted" style="font-size:12px">BM / RBM / SA</span></div></div>';
  if(!a.length) h += '<div class="empty">Belum ada laporan jalan. Di peta petak, ketuk tombol <b>Lapor jalan</b> kalau ada ruas yang tertutup, cuma muat motor, atau tidak ada di lapangan.</div>';
  h += a.map(x => {
    const st = LJ_STATUS[x.status] || LJ_STATUS.antre, buka = LJ.rwBuka === x.id;
    return '<div class="card" style="padding:12px 14px;border-radius:18px;display:flex;flex-direction:column;gap:8px"><button type="button" onclick="LJ.rwBuka=(LJ.rwBuka===\'' + esc(x.id) + '\'?null:\'' + esc(x.id) + '\');renderRiwayat()" style="border:0;background:none;padding:0;font:inherit;text-align:left;display:flex;gap:12px;align-items:center;width:100%">' +
      (x.foto ? '<img class="f25thumb" src="' + esc(x.foto) + '" alt="" onerror="this.style.visibility=\'hidden\'">' : '<span class="f25thumb" style="display:flex;align-items:center;justify-content:center;color:#1F2C4F">' + f25Ico(x.kategori, 'width:24px;height:24px') + '</span>') +
      '<span class="col" style="flex:1;min-width:0;gap:3px"><b style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(x.nama || 'Ruas jalan') + '</b><span class="muted" style="font-size:12px">Kotak ' + lj25KotakLbl(x.kotak) + ' · ' + esc(LJ_KAT_PENDEK[x.kategori] || x.kategori) + ' · ' + labelWaktu(Date.parse(x.waktu) || Date.now()) + '</span>' +
      '<span class="f25tag" style="background:' + st[1] + ';color:' + st[2] + ';align-self:flex-start">' + st[0] + '</span></span>' + ico('chev', 'transform:rotate(' + (buka ? 90 : 0) + 'deg);color:#9AA5BC') + '</button>' +
      (buka ? '<div style="border-top:1px solid #EEF1F6;padding-top:8px"><span class="muted" style="font-size:12px;font-weight:800;letter-spacing:.04em">RANTAI PERSETUJUAN</span>' + lj25RantaiHtml(x) +
        (x.status === 'ditolak' && x.alasan_tolak ? '<div class="f25note or" style="margin-top:8px"><span>Alasan ditolak: ' + esc(x.alasan_tolak) + '</span></div>' : '') +
        (x.status === 'gagal' ? '<div class="f25note or" style="margin-top:8px"><span>' + esc(x.err || 'Ditolak server') + '</span></div>' : '') +
        (x.status !== 'disetujui' && x.status !== 'ditolak' ? '<div class="f25note nv" style="margin-top:8px"><span>Ruas tetap dihitung sampai disetujui semua tingkat.</span></div>' : '') + '</div>' : '') + '</div>';
  }).join('');
  if(el.dataset.sig !== h){ const st = el.parentElement.scrollTop; el.innerHTML = h; el.dataset.sig = h; el.parentElement.scrollTop = st; }
};
function lj25KotakLbl(i){ if(i == null) return '-'; const r = Math.floor(i / GRID_N), c = i % GRID_N; return ('ABCD'[GRID_N - 1 - r] || '') + (c + 1); }
function lj25Semua(){
  const srv = (lj25Data().laporan || []).slice(), ids = new Set(srv.map(x => x.id));
  const lok = lj25Lokal().filter(x => !ids.has(x.id));
  return lok.concat(srv).sort((a, b) => (Date.parse(b.waktu) || 0) - (Date.parse(a.waktu) || 0));
}
function lj25RantaiHtml(x){
  const urut = ['menunggu_bm', 'menunggu_rbm', 'menunggu_sa', 'disetujui'], pos = urut.indexOf(x.status === 'antre' ? 'menunggu_bm' : x.status);
  const tingkat = [['BM ' + (sesi ? sesi.depot : ''), x.bm, x.bm_waktu, 'BM'], ['RBM', x.rbm, x.rbm_waktu, 'RBM'], ['Super Admin', x.sa, x.sa_waktu, 'SA']];
  return '<div class="f25chain">' + tingkat.map((t, i) => {
    let kls = '', ket = 'Belum', ic = '–';
    if(x.status === 'ditolak' && x.tolak_peran === t[3]){ kls = 'no'; ket = 'Ditolak' + (t[1] ? ' · ' + t[1] : ''); ic = '✕'; }
    else if(pos > i || (x.status === 'ditolak' && t[1] && x.tolak_peran !== t[3])){ kls = 'ok'; ket = 'Disetujui' + (t[1] ? ' · ' + t[1] : '') + (t[2] ? ' · ' + labelWaktu(Date.parse(t[2])) : ''); ic = '✓'; }
    else if(pos === i){ kls = 'cur'; ket = 'Menunggu persetujuan'; ic = '…'; }
    return '<div class="st"><span class="dt ' + kls + '">' + ic + '</span><span class="col" style="gap:1px"><b style="font-size:14px">' + esc(t[0]) + '</b><span style="font-size:12.5px;color:' + (kls === 'cur' ? '#B9480A' : (kls === 'no' ? '#B42318' : '#6B7A9C')) + '">' + esc(ket) + '</span></span></div>';
  }).join('') + '</div>';
}
function lj25Tab(t){ RW_TAB = t; const el = $('riwayatBody'); if(el) el.dataset.sig = ''; if(t === 'jalan') lj25Muat(false); renderRiwayat(); }
function lj25LihatRiwayat(){ lj25TutupForm(); RW_TAB = 'jalan'; tampil('scrMain'); bukaTab('riwayat'); }

/* ==================================================================
   pemicu berkala
   ================================================================== */
function f25Segarkan(paksa){ const p = !!paksa && Date.now() - (f25Segarkan.t || 0) > 120000; if(p) f25Segarkan.t = Date.now(); try{ ku25Muat(p); }catch(e){} try{ lj25Muat(p); }catch(e){} setTimeout(() => { try{ tcPraUnduh(); }catch(e){} }, 15000); }
setInterval(() => { try{ lj25PasangUi(); lj25AturPill(); if(LJ.sel && $('lj25Sheet') && $('lj25Sheet').style.display === 'flex') lj25RenderSheet(); if(screenAktif !== 'scrPeta' && LJ.pilih) lj25Batal(); }catch(e){} }, 1500);
window.addEventListener('online', () => setTimeout(() => f25Segarkan(true), 4000));
setTimeout(() => { try{ lj25PasangUi(); f25Segarkan(true); }catch(e){} }, 3000);
