'use strict';
/* ============================================================
   SkyLens 2.0 — app sales (UI) v1.1.0. Dijalankan di dalam WebView app Android.
   GPS/jejak direkam oleh layanan native (Android.*), UI ini cuma membaca titiknya lewat jembatan.
   Kalau dibuka di browser biasa, dipakai "shim" (mode pratinjau, GPS cuma jalan saat layar menyala).
   ============================================================ */
const SUPABASE_URL = 'https://bgvdrinvblanlaykydit.supabase.co';
const SUPABASE_KEY = 'sb_publishable_EMHLQqIuGbFaCBUYkV5yVw_X_yR_aKZ';
const APP_VERSI = '1.2.3';
const S = 0.01;       // ukuran petak (derajat)
const GRID_N = 4;     // 4x4 = 16 kotak per petak
const NAMA_PRIO = ['-', 'A', 'B', 'C'];

// ---- konstanta sisir/prospek ----
const JARAK_MIN_M = 10;
const DIAM_HEARTBEAT_MS = 20000;
const GAP_HITAM_MS = 100000;
const DWELL_KOTAK_MS = 60000;     // 1 menit di dalam kotak 4x4 = kotak dianggap sudah disisir (keputusan Kevin, 23 Okt 2026)
const DWELL_CAP_MS = 25000;       // satu selang antar-titik maksimal dihitung segini (titik diam datang tiap 15–20 dtk)
const DIAM_POPUP_MS = 150000;
const RADIUS_DIAM_M = 30;
const DEBOUNCE_KELUAR = 3;
const AKURASI_BUANG_M = 50;
const TESTING_PW = '8888';
const TARGET_NOO_HARIAN = 3;
const KECEPATAN_MOTOR_KMH = 25;   // untuk perkiraan waktu menuju zona (rata-rata jalan desa/kota, sudah termasuk berhenti)
const FAKTOR_JALAN = 1.35;        // jarak lurus -> jarak jalan (perkiraan)

const $ = id => document.getElementById(id);
function esc(s){ return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
function lsGet(k, dflt){ try{ const v = localStorage.getItem(k); return v == null ? dflt : JSON.parse(v); }catch(e){ return dflt; } }
function lsSet(k, v){ try{ localStorage.setItem(k, JSON.stringify(v)); }catch(e){} }
function lsDel(k){ try{ localStorage.removeItem(k); }catch(e){} }
function uuid(){
  if(window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random()*16|0; return (c === 'x' ? r : (r&0x3|0x8)).toString(16); });
}
let toastTimer = null;
function toast(msg, ms){
  const t = $('toast'); t.textContent = msg; t.style.display = 'block';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.style.display = 'none', ms || 2800);
}
function haversine(lat1, lon1, lat2, lon2){
  const R = 6371000, toRad = d => d*Math.PI/180;
  const dLat = toRad(lat2-lat1), dLon = toRad(lon2-lon1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(a));
}
function bearing(lat1, lon1, lat2, lon2){
  const toRad = d => d*Math.PI/180, toDeg = r => r*180/Math.PI;
  const y = Math.sin(toRad(lon2-lon1))*Math.cos(toRad(lat2));
  const x = Math.cos(toRad(lat1))*Math.sin(toRad(lat2)) - Math.sin(toRad(lat1))*Math.cos(toRad(lat2))*Math.cos(toRad(lon2-lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}
function keyDari(gx, gy){ return gx*100000 + gy; }
function gxgyDari(key){ const gx = Math.round(key/100000); return [gx, key - gx*100000]; }
function fmtJarak(m){ return m >= 1000 ? (m/1000).toLocaleString('id-ID', {maximumFractionDigits: 1}) + ' km' : (Math.round(m/10)*10 || 10) + ' m'; }
function fmtRp(n){ return 'Rp ' + Math.round(n).toLocaleString('id-ID'); }
function etaTeks(m){
  if(m < 40) return 'hampir sampai';
  const mnt = Math.max(1, Math.round((m*FAKTOR_JALAN)/(KECEPATAN_MOTOR_KMH*1000/60)));
  return '±' + mnt + ' menit naik motor';
}

/* ---------- tanggal (zona WIB, sama dengan server) ---------- */
const HARI = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
function wibDate(ms){ return new Date((ms == null ? Date.now() : ms) + 7*3600*1000); }
function wibYmd(ms){ return wibDate(ms).toISOString().slice(0, 10); }
function wibJam(ms){ const d = wibDate(ms); return String(d.getUTCHours()).padStart(2, '0') + '.' + String(d.getUTCMinutes()).padStart(2, '0'); }
function tglPendek(ms){ const d = wibDate(ms); return d.getUTCDate() + ' ' + BULAN[d.getUTCMonth()]; }
function labelWaktu(ms){ return (wibYmd(ms) === wibYmd() ? 'Hari ini' : tglPendek(ms)) + ' ' + wibJam(ms); }

/* ---------- nama sales: buang awalan kode divisi (AEPDA-, GDKDA - ...) dan rapikan huruf ---------- */
function namaBersih(n){
  let s = String(n || '').trim().replace(/^(AEPDA|GDKDA|GLKDA|RBM|BM|ASS)\b\s*-?\s*/i, '').trim();
  if(!s) s = String(n || '').trim();
  return s.toLowerCase().replace(/(^|[\s.'-])([a-z])/g, (m, a, b) => a + b.toUpperCase());
}
/* RBM/BM/ASS = mode LIHAT (tanpa perekaman GPS, melihat seluruh toko & petak pilot depo). RBM/BM bisa pindah depo sesuai MANAJER di config.js. */
let mgrSales = '';
function peranSesi(){ return sesi ? peranNama(sesi.nama) : ''; }
function depotManajer(){ const m = (typeof MANAJER !== 'undefined' && sesi) ? MANAJER[sesi.kode] : null; return m ? m.depot : (sesi ? [sesi.depot] : []); }
function peranNama(n){ const m = /^(RBM|BM|ASS)\b\s*-/i.exec(String(n || '').trim()); return m ? m[1].toUpperCase() : ''; }
function namaDepan(n){ const b = namaBersih(n).split(/\s+/); return (b[0] && b[0].length <= 2 && b[1]) ? b[0] + ' ' + b[1] : (b[0] || ''); }
function inisial(n){ const b = namaBersih(n).replace(/[^A-Za-z\s]/g, '').split(/\s+/).filter(Boolean); return ((b[0] || '?')[0] + (b[1] ? b[1][0] : (b[0] || '')[1] || '')).toUpperCase(); }

/* ---------- dialog bermerek SkyLens (pengganti confirm()/prompt() bawaan Android) ----------
   dialogSL({ikon, nada:'or'|'merah'|'navy', judul, teks, html, input:{placeholder, cek:fn(v)->pesan galat|''}, ok, batal})
   -> Promise: true/false (konfirmasi) atau string/null (pakai input) */
function dialogSL(o){
  return new Promise(res => {
    const lama = document.getElementById('dlgSL'); if(lama) lama.remove();
    const w = document.createElement('div'); w.id = 'dlgSL'; w.className = 'dlg-ov';
    const nada = o.nada || 'or';
    w.innerHTML = '<div class="dlg ' + nada + '" role="dialog" aria-modal="true" aria-labelledby="dlgJdl">' +
      (o.atas || ('<div class="dlg-ik">' + ico(o.ikon || 'info') + '</div>')) +
      '<h3 id="dlgJdl">' + esc(o.judul || '') + '</h3>' +
      (o.teks ? '<p class="dlg-t">' + esc(o.teks) + '</p>' : '') + (o.html || '') +
      (o.input ? '<div class="dlg-in"><input id="dlgIn" type="password" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(o.input.placeholder || '') + '"' + (o.input.numerik ? ' inputmode="numeric"' : '') + '>' +
        '<button type="button" class="dlg-eye" id="dlgEye" aria-label="Tampilkan password">' + ico('eye') + '</button></div><p class="dlg-err" id="dlgErr"></p>' : '') +
      '<div class="dlg-act"><button type="button" class="btn gh sm" id="dlgNo">' + esc(o.batal || 'Batal') + '</button>' +
      '<button type="button" class="btn sm dlg-ok" id="dlgYa">' + esc(o.ok || 'OK') + '</button></div></div>';
    document.getElementById('app').appendChild(w);
    requestAnimationFrame(() => w.classList.add('on'));
    const inp = w.querySelector('#dlgIn'), err = w.querySelector('#dlgErr'), kotak = w.querySelector('.dlg');
    const tutup = v => { w.classList.remove('on'); setTimeout(() => w.remove(), 160); dialogSL.buka = null; res(v); };
    dialogSL.buka = () => tutup(o.input ? null : false);   // tombol kembali Android
    const ya = () => {
      if(!o.input) return tutup(true);
      const v = inp.value, salah = o.input.cek ? o.input.cek(v) : '';
      if(salah){ err.textContent = salah; kotak.classList.remove('goyang'); void kotak.offsetWidth; kotak.classList.add('goyang'); inp.select(); return; }
      tutup(v);
    };
    w.querySelector('#dlgYa').onclick = ya;
    w.querySelector('#dlgNo').onclick = () => tutup(o.input ? null : false);
    w.addEventListener('click', e => { if(e.target === w) tutup(o.input ? null : false); });
    if(inp){
      inp.addEventListener('keydown', e => { if(e.key === 'Enter'){ e.preventDefault(); ya(); } });
      inp.addEventListener('input', () => { err.textContent = ''; });
      w.querySelector('#dlgEye').onclick = () => { inp.type = inp.type === 'password' ? 'text' : 'password'; inp.focus(); };
      setTimeout(() => inp.focus(), 120);
    }
  });
}

/* ---------- ikon ---------- */
const IC = {
  back:'<path d="M15 5 8 12l7 7"/>', close:'<path d="M6 6l12 12M18 6 6 18"/>', check:'<path d="m5 12 4.5 4.5L19 7"/>',
  plus:'<path d="M12 5v14M5 12h14"/>', clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
  cam:'<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', store:'<path d="M4 9h16l-2-5H6z"/><path d="M5 9v11h14V9"/><path d="M10 20v-6h4v6"/>',
  nav:'<path d="M3 11 21 3l-8 18-2-8z"/>', book:'<path d="M4 5h7a2 2 0 0 1 2 2v12a2 2 0 0 0-2-2H4z"/><path d="M20 5h-5a2 2 0 0 0-2 2v12a2 2 0 0 1 2-2h5z"/>',
  chev:'<path d="m9 6 6 6-6 6"/>', info:'<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16h.01"/>', cloud:'<path d="M7 18a4.5 4.5 0 0 1-.5-9 6 6 0 0 1 11.5 1.5A3.75 3.75 0 0 1 17.5 18z"/><path d="m9.5 13 2 2 3.5-4"/>',
  search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>', eye:'<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/><circle cx="12" cy="12" r="3"/>', logout:'<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16l-4-4 4-4M6 12h10"/>', refresh:'<path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/>', gps:'<circle cx="12" cy="12" r="3"/><circle cx="12" cy="12" r="8"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/>', lock:'<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>', pin:'<path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z"/><circle cx="12" cy="10" r="2.5"/>'
};
const ico = (n, st) => '<svg class="ico" viewBox="0 0 24 24" aria-hidden="true" style="' + (st || '') + '">' + IC[n] + '</svg>';
const flameSvg = (lit, cls, st) => '<svg class="' + (cls || '') + '" viewBox="0 0 34 40" aria-hidden="true" style="' + (st || '') + '"><path d="M17 2c2 7 12 11 12 23a12 12 0 0 1-24 0c0-6 3-9 5-12 1 4 3 5 4 5-1-6 1-11 3-16Z" fill="' + (lit ? '#FE7A1B' : '#C9D2E3') + '"/><path d="M17 20c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3 0-5 1-8Z" fill="' + (lit ? '#FFC08F' : '#E3E7EE') + '"/></svg>';

/* ============================================================
   JEMBATAN ANDROID (shim untuk browser biasa)
   ============================================================ */
const ADA_NATIVE = !!(window.Android && typeof window.Android.info === 'function');
if(!ADA_NATIVE){ window.Android = buatShimBrowser(); }
function nat(){ return window.Android; }
function infoNative(){ try{ return JSON.parse(nat().info()); }catch(e){ return {lokasi:false, notif:false, sepanjang:false, baterai:false, tracking:false, pending:0, merek:'', model:'', android:0, jam_mulai:-1, jam_selesai:-1}; } }

function buatShimBrowser(){
  const ring = []; let seq = 0, wid = null, aktif = false, kode = '', petak = null, pending = [], terakhir = 0, galat = '', lastSaved = null, timer = null;
  function simpanJikaPerlu(f){
    if(f[3] > AKURASI_BUANG_M) return;
    let simpan = !lastSaved;
    if(lastSaved){ simpan = haversine(lastSaved[1], lastSaved[2], f[1], f[2]) >= Math.max(JARAK_MIN_M, f[3]) || (f[4] - lastSaved[4]) >= DIAM_HEARTBEAT_MS; }
    if(!simpan) return;
    lastSaved = f;
    pending.push({kode: kode, key_petak: petak ? Number(petak) : null, lat: f[1], lon: f[2], waktu: new Date(f[4]).toISOString(), akurasi: Math.round(f[3]), kecepatan: f[5] || 0, baterai: null});
  }
  async function flush(){
    while(pending.length){
      const k = pending[0].kode; const batch = [];
      for(const p of pending){ if(p.kode === k && batch.length < 200) batch.push(p); else if(p.kode !== k) break; }
      try{
        const j = await rpc('kirim_jejak', {p_kode: k, p_titik: batch.map(p => ({key_petak: p.key_petak, lat: p.lat, lon: p.lon, waktu: p.waktu, akurasi: p.akurasi, kecepatan: p.kecepatan, baterai: p.baterai}))});
        if(j && j.ok){ pending.splice(0, batch.length); terakhir = Date.now(); galat = ''; } else { galat = (j && j.error) || 'ditolak'; return; }
      }catch(e){ galat = e.message; return; }
    }
  }
  return {
    info: () => JSON.stringify({lokasi:true, notif:true, sepanjang:true, baterai:true, tracking:aktif, pending:pending.length, terakhir_kirim:terakhir, galat_kirim:galat, alasan_berhenti:'', kode:kode, aktif:aktif, merek:'browser', model:'Pratinjau browser', android:0, jam_mulai:-1, jam_selesai:-1, preview:true}),
    versi: () => APP_VERSI,
    statusGps: () => JSON.stringify({ditahan_ms: 0, dbhz: -1, filter_aktif: true, terima: ring.length, buang: 0, tahan: 0}),
    mulai: (k, n, d) => {
      kode = k; aktif = true;
      if(wid === null && navigator.geolocation){
        wid = navigator.geolocation.watchPosition(p => {
          const f = [++seq, p.coords.latitude, p.coords.longitude, p.coords.accuracy || 50, Date.now(), p.coords.speed || 0];
          ring.push(f); if(ring.length > 900) ring.shift(); simpanJikaPerlu(f);
        }, () => {}, {enableHighAccuracy:true, maximumAge:2000, timeout:8000});
      }
      if(!timer) timer = setInterval(flush, 30000);
      return 'ok';
    },
    berhenti: () => { aktif = false; if(wid !== null){ navigator.geolocation.clearWatch(wid); wid = null; } if(timer){ clearInterval(timer); timer = null; } flush(); return 'ok'; },
    setPetak: k => { petak = (k == null || k === 'null' || k === '') ? null : k; },
    fixSejak: s => JSON.stringify(ring.filter(f => f[0] > Number(s)).slice(0, 500)),
    kirimSekarang: () => { flush(); },
    minta: () => {},
    bukaNavigasi: (lat, lon) => { window.open('https://www.google.com/maps/dir/?api=1&destination=' + lat + ',' + lon, '_blank'); },
    bukaUrl: u => { window.open(u, '_blank'); }
  };
}

/* ============================================================
   API SUPABASE (RPC tanpa PIN)
   ============================================================ */
function hdr(extra){ return Object.assign({'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY}, extra || {}); }
async function fetchTO(url, opt, ms){
  const ctrl = new AbortController(); const to = setTimeout(() => ctrl.abort(), ms || 20000);
  try{ return await fetch(url, Object.assign({}, opt, {signal: ctrl.signal})); } finally { clearTimeout(to); }
}
async function rpc(fn, body){
  const r = await fetchTO(SUPABASE_URL + '/rest/v1/rpc/' + fn, {method:'POST', headers: hdr({'Content-Type':'application/json'}), body: JSON.stringify(body)});
  const txt = await r.text(); let j = null; try{ j = JSON.parse(txt); }catch(e){}
  if(!r.ok) throw new Error('HTTP ' + r.status + ' ' + txt.slice(0, 160));
  return j;
}
async function restGet(path){
  const r = await fetchTO(SUPABASE_URL + '/rest/v1/' + path, {headers: hdr()});
  if(!r.ok) throw new Error('HTTP ' + r.status);
  return r.json();
}

/* ============================================================
   OUTBOX offline (IndexedDB): temuan+foto, sisir kotak, persetujuan
   ============================================================ */
let _idb = null;
function obOpen(){
  return new Promise((res, rej) => {
    if(_idb) return res(_idb);
    if(!window.indexedDB) return rej(new Error('IndexedDB tidak tersedia'));
    const rq = indexedDB.open('sl2', 1);
    rq.onupgradeneeded = () => { rq.result.createObjectStore('outbox', {keyPath:'id'}); };
    rq.onsuccess = () => { _idb = rq.result; res(_idb); };
    rq.onerror = () => rej(rq.error);
  });
}
async function obPut(rec){ const db = await obOpen(); return new Promise((res, rej) => { const tx = db.transaction('outbox', 'readwrite'); tx.objectStore('outbox').put(rec); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function obDel(id){ const db = await obOpen(); return new Promise((res, rej) => { const tx = db.transaction('outbox', 'readwrite'); tx.objectStore('outbox').delete(id); tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); }); }
async function obAll(){ const db = await obOpen(); return new Promise((res, rej) => { const rq = db.transaction('outbox', 'readonly').objectStore('outbox').getAll(); rq.onsuccess = () => res(rq.result || []); rq.onerror = () => rej(rq.error); }); }

let obBusy = false, obSisa = 0, obGalat = '', obTemuan = [];   // obTemuan: temuan yang belum terkirim (untuk hitung ringkasan lokal)
async function prosesOutbox(){
  if(obBusy) return; obBusy = true;
  let terkirimTemuan = 0;
  try{
    let all = await obAll();
    // 1) persetujuan lokasi
    for(const r of all.filter(x => x.tipe === 'persetujuan')){
      try{
        const j = await rpc('catat_persetujuan', {p_kode: r.kode, p_setuju: r.payload.setuju, p_versi: APP_VERSI, p_perangkat: r.payload.perangkat});
        if(j && j.ok) await obDel(r.id); else { r.tries = (r.tries||0)+1; r.err = (j && j.error) || 'ditolak'; await obPut(r); }
      }catch(e){ r.tries = (r.tries||0)+1; r.err = e.message; await obPut(r); }
    }
    // 2) sisir kotak (dikirim per kode, berkelompok)
    const grid = all.filter(x => x.tipe === 'grid');
    const perKode = {};
    grid.forEach(g => { (perKode[g.kode] = perKode[g.kode] || []).push(g); });
    for(const k of Object.keys(perKode)){
      const grp = perKode[k];
      for(let i = 0; i < grp.length; i += 100){
        const part = grp.slice(i, i + 100);
        try{
          const j = await rpc('kirim_grid', {p_kode: k, p_sel: part.map(g => g.payload)});
          if(j && j.ok){ for(const g of part) await obDel(g.id); }
          else { obGalat = (j && j.error) || 'ditolak'; break; }
        }catch(e){ obGalat = e.message; break; }
      }
    }
    // 3) temuan (satu per satu, urut waktu)
    const tem = all.filter(x => x.tipe === 'temuan').sort((a, b) => a.t - b.t);
    for(const rec of tem){
      try{
        if(rec.foto && !rec.payload.foto_url){
          const path = rec.kode + '/' + rec.payload.id + '.jpg';
          const r = await fetchTO(SUPABASE_URL + '/storage/v1/object/temuan-foto/' + encodeURIComponent(rec.kode) + '/' + rec.payload.id + '.jpg',
            {method:'POST', headers: hdr({'Content-Type':'image/jpeg'}), body: rec.foto}, 60000);
          if(!r.ok){
            const tx = await r.text();
            if(!/Duplicate|already exists/i.test(tx)) throw new Error('upload foto gagal (' + r.status + ')');
          }
          rec.payload.foto_url = SUPABASE_URL + '/storage/v1/object/public/temuan-foto/' + path;
          await obPut(rec);
        }
        const j = await rpc('kirim_temuan', {p_kode: rec.kode, p_data: rec.payload});
        if(j && j.ok){ await obDel(rec.id); obGalat = ''; terkirimTemuan++; }
        else { rec.tries = (rec.tries||0)+1; rec.err = (j && j.error) || 'ditolak'; await obPut(rec); obGalat = rec.err; }
      }catch(e){ rec.tries = (rec.tries||0)+1; rec.err = e.message; try{ await obPut(rec); }catch(_){} obGalat = e.message; break; }
    }
    all = await obAll(); obSisa = all.length; obTemuan = all.filter(x => x.tipe === 'temuan');
  }catch(e){ obGalat = e.message; }
  finally{ obBusy = false; }
  if(terkirimTemuan > 0 && sesi) await muatRingkasan(true);
  segarkanLayarAktif();
}
async function hitungOutbox(){ try{ const all = await obAll(); obSisa = all.length; obTemuan = all.filter(x => x.tipe === 'temuan'); }catch(e){} }

/* ============================================================
   STATE
   ============================================================ */
let sesi = lsGet('sl2_sesi', null);   // {kode, nama, depot}
let depotAktif = '';
let AREA = {zona: [], outlet: []};    // data area sales yg sedang login
let zonaMap = {};
let zonaList = [];
let JKS_PETAK = {};
/* petak kuning (C) disembunyikan secara default: sales cukup fokus ke merah (A) + oranye (B) + petak JKS hari ini; kuning bisa dinyalakan. */
let tampilC = false; try{ tampilC = localStorage.getItem('sl2_tampilC') === '1'; }catch(e){}
const WARNA_PRIO = {1: '#c0392b', 2: '#e67e22', 3: '#f1c40f'};   // sama dengan dashboard: A merah, B oranye, C kuning
function jksPetakSegar(){
  const kunci = tglKunci(jksHariD()) + '|' + (sesi ? sesi.depot : '') + '|' + (typeof mgrSales === 'string' ? mgrSales : '') + '|' + (OUTLET ? OUTLET.length : 0);
  if(jksPetakSegar.k !== kunci){ jksPetakSegar.k = kunci; JKS_PETAK = jksPerPetak(); }
  return JKS_PETAK;
}
function zonaTampil(z){
  if(tampilC) return true;
  if(sesi && sesi.depot === 'TESTING') return true;
  if(z[23] === 1 || z[23] === 2) return true;
  return ((jksPetakSegar() || {})[keyDari(z[2], z[3])] || 0) > 0;
}
function jumlahKuningTersembunyi(){ return tampilC ? 0 : zonaList.filter(z => !zonaTampil(z)).length; }
function setTampilC(v){
  tampilC = !!v; try{ localStorage.setItem('sl2_tampilC', v ? '1' : '0'); }catch(e){}
  if(el_ber()) { const e = el_ber(); e.dataset.sig = ''; } renderBeranda();
  petaSemuaPerbarui.sig = ''; if(tabAktif === 'peta') petaSemuaPerbarui(true);
}
function el_ber(){ return $('berandaBody'); }
let manualList = [];
let zonaState = {mode: 'memuat', pesan: ''};
let gridSet = new Set();              // "key:r:c" (server + lokal)
let zonaAktif = null;
let map = null, youMarker = null, lastPos = null, cells = [], cellLayer = null, LAT0 = null, LAT1 = null, LON0 = null, LON1 = null, CENTER = null, cellLat, cellLon;
let followMode = true, trailLayer = null, trailRunLine = null, trailRunWarna = null;
let OUTLET = [];
let trailPoints = [], lastSaved = null, stillRef = null, askedThisStop = false, keluarRadius = 0, cellLastT = null;
let lastSeq = 0, pollTimer = null, kosongBeruntun = 0;
let screenAktif = 'scrDepot', tabAktif = 'beranda', setelanOnboard = false, setelanTimer = null, berandaTimer = null;
let zInfoOpen = false, wizAktifDariLayar = null;

const LAYAR = ['scrDepot', 'scrSetuju', 'scrSetelan', 'scrMain', 'scrPeta', 'scrTemuan'];
function tampil(id){
  LAYAR.forEach(x => { const el = $(x); if(el) el.style.display = (x === id) ? 'flex' : 'none'; });
  screenAktif = id;
  document.body.classList.toggle('nonav', id !== 'scrMain');
  if(id !== 'scrPeta') document.body.classList.remove('menuju');
  if(id !== 'scrSetelan'){ if(setelanTimer){ clearInterval(setelanTimer); setelanTimer = null; } }
  if(id === 'scrMain') startBerandaTimer(); else stopBerandaTimer();
  if(typeof petAtur === 'function') petAtur();
}
function startBerandaTimer(){ if(!berandaTimer) berandaTimer = setInterval(() => { if(screenAktif === 'scrMain' && !document.hidden) segarkanLayarAktif(); }, 5000); }
function stopBerandaTimer(){ if(berandaTimer){ clearInterval(berandaTimer); berandaTimer = null; } }

/* ============================================================
   MASUK: pilih area & nama (tanpa PIN)
   ============================================================ */
(function isiDropdownDepot(){
  const sel = $('depotInput');
  const names = Object.keys(MANIFEST).sort((a, b) => (MANIFEST[a].region + a).localeCompare(MANIFEST[b].region + b));
  names.forEach(dep => { const o = document.createElement('option'); o.value = dep; o.textContent = dep + ' (' + MANIFEST[dep].region + ')'; sel.appendChild(o); });
  const t = document.createElement('option'); t.value = 'TESTING'; t.textContent = 'TESTING (internal)'; sel.appendChild(t);
  sel.addEventListener('change', function(){
    $('fldDepot').classList.toggle('on', !!this.value);
    if(!this.value){ resetNama(); return; }
    if(this.value === 'TESTING'){
      const self = this;
      dialogSL({ikon: 'lock', nada: 'navy', judul: 'Area TESTING', teks: 'Khusus tim internal untuk uji coba. Masukkan password untuk lanjut.',
        input: {placeholder: 'Password', numerik: true, cek: v => v === TESTING_PW ? '' : (v ? 'Password salah, coba lagi.' : 'Isi password dulu.')}, ok: 'Masuk', batal: 'Batal'})
        .then(pw => {
          if(pw !== TESTING_PW){ self.value = ''; $('fldDepot').classList.remove('on'); resetNama(); return; }
          pilihDepot('TESTING');
        });
      return;
    }
    pilihDepot(this.value);
  });
  $('kodeInput').addEventListener('change', function(){ $('fldNama').classList.toggle('on', !!this.value); $('btnMasuk').disabled = !this.value; });
  $('verLabel').textContent = 'SkyLens 2.0 · v' + APP_VERSI + (ADA_NATIVE ? '' : ' · mode pratinjau browser');
})();

function resetNama(){
  const sel = $('kodeInput'); sel.innerHTML = '<option value="">Pilih area dulu</option>'; sel.disabled = true;
  $('fldNama').classList.add('dis'); $('fldNama').classList.remove('on'); $('btnMasuk').disabled = true;
}
/* RBM/BM/ASS tidak ada di aplikasi (mereka masuk lewat dashboard). Buang dari daftar nama, apa pun sumbernya (bawaan, cache, Supabase). */
function gabungManajer(dep, r){
  return r.filter(x => !/^(RBM|BM|ASS)\s*-/i.test(String((x && x[1]) || '').trim()) && !/^(RBM|BM|ASS)-/i.test(String((x && x[0]) || '')))
          .filter(x => !/^(AEPDA|GLKDA)\b/i.test(String((x && x[1]) || '').trim()));   // SkyLens 2.0 fokus GDKDA: AEPDA & GLKDA tidak ikut
}
function tipeSales(n){ const m = /^(GDKDA|AEPDA|GLKDA)\b/i.exec(String(n || '').trim()); return m ? m[1].toUpperCase() : ''; }
async function muatRoster(dep){
  const bawaan = (ROSTER[dep] || []).map(s => [String(s[0]), s[1]]);
  try{
    const data = await restGet('sales_roster?select=kode,nama&aktif=eq.true&depot=eq.' + encodeURIComponent(dep) + '&order=nama');
    if(data && data.length){ const r = data.map(x => [String(x.kode), x.nama]); lsSet('sl2_roster_' + dep, r); return gabungManajer(dep, r); }
  }catch(e){ const c = lsGet('sl2_roster_' + dep, null); if(c && c.length) return gabungManajer(dep, c.slice()); }
  return gabungManajer(dep, bawaan);
}
async function pilihDepot(dep){
  depotAktif = dep;
  resetNama();
  $('depotLoading').style.display = 'block'; $('depotInput').disabled = true;
  let roster = [];
  try{ roster = await muatRoster(dep); } finally { $('depotLoading').style.display = 'none'; $('depotInput').disabled = false; }
  if($('depotInput').value !== dep) return;   // pengguna sudah ganti area lagi
  roster = roster.filter(s => !/^vacant$/i.test(namaBersih(s[1]))).sort((a, b) => ((peranNama(a[1]) ? 1 : 0) - (peranNama(b[1]) ? 1 : 0)) || namaBersih(a[1]).localeCompare(namaBersih(b[1])));
  const sel = $('kodeInput'); sel.innerHTML = '<option value="">Pilih namamu…</option>';
  roster.forEach(s => { const o = document.createElement('option'); o.value = s[0]; o.textContent = (peranNama(s[1]) ? '[' + peranNama(s[1]) + '] ' : '') + (tipeSales(s[1]) ? tipeSales(s[1]) + ' · ' : '') + namaBersih(s[1]) + (peranNama(s[1]) ? '' : ' · ' + s[0]); o.dataset.nama = s[1]; sel.appendChild(o); });
  sel.disabled = false; $('fldNama').classList.remove('dis');
  if(!roster.length) toast('Belum ada nama sales untuk area ini. Hubungi admin.', 4000);
}

async function masuk(){
  const sel = $('kodeInput');
  if(!depotAktif){ toast('Pilih area dulu'); return; }
  if(!sel.value){ toast('Pilih namamu dulu'); return; }
  const kode = sel.value, nama = sel.options[sel.selectedIndex].dataset.nama || sel.options[sel.selectedIndex].textContent;
  const btn = $('btnMasuk'); btn.disabled = true; btn.textContent = 'Memeriksa…';
  try{
    let j = null;
    try{ j = await rpc('sales_login', {p_kode: kode}); }
    catch(e){
      if(e && (e.name === 'TypeError' || e.name === 'AbortError')) j = {ok: true, offline: true};   // tanpa sinyal: boleh masuk, divalidasi nanti saat ada sinyal
      else { toast('Server bermasalah: ' + e.message, 4500); return; }
    }
    if(!j || !j.ok){ toast((j && j.error) || 'Kode sales belum terdaftar di server. Hubungi admin.', 4200); return; }
    sesi = {kode: kode, nama: nama, depot: depotAktif};
    lsSet('sl2_sesi', sesi);
    await siapkan();
  } finally { btn.disabled = !$('kodeInput').value; btn.textContent = 'Masuk'; }
}

async function keluar(){
  if(!sesi) return;
  const nm = namaBersih(sesi.nama), inf = infoNative(), tunggu = (obSisa || 0) + (inf.pending || 0);
  const ok = await dialogSL({nada: 'merah', judul: 'Keluar dari SkyLens?',
    atas: '<div class="dlg-av">' + esc(inisial(sesi.nama)) + '</div>',
    html: '<div class="dlg-who"><b>' + esc(nm) + '</b><span>' + esc(String(sesi.kode)) + ' · ' + esc(sesi.depot) + '</span></div>' +
      '<ul class="dlg-li"><li>' + ico('gps') + 'Perekaman jejak GPS berhenti sampai kamu masuk lagi.</li>' +
      (tunggu ? '<li class="warn">' + ico('cloud') + ((inf.pending || 0) ? (inf.pending + ' titik') : '') + ((inf.pending || 0) && obSisa ? ' · ' : '') + (obSisa ? obSisa + ' data' : '') + ' belum terkirim. Kami coba kirim sekarang; sisanya tetap aman di HP.</li>' : '<li>' + ico('check') + 'Semua data sudah terkirim.</li>') + '</ul>',
    ok: 'Keluar', batal: 'Batal'});
  if(!ok) return;
  try{ nat().kirimSekarang(); nat().berhenti(); }catch(e){}
  stopPoll(); sesi = null; lsDel('sl2_sesi');
  zonaAktif = null; trailPoints = []; lastSaved = null; lastPos = null; lastSeq = 0; zonaList = []; manualList = []; zonaState = {mode: 'memuat', pesan: ''};
  if(map){ map.remove(); map = null; }
  if(mapAll){ mapAll.remove(); mapAll = null; allLayers = []; allMe = null; }
  $('depotInput').value = ''; $('fldDepot').classList.remove('on'); resetNama();
  tampil('scrDepot');
}

/* ============================================================
   PERSETUJUAN + PERSIAPAN HP
   ============================================================ */
function persetujuan(){ return sesi ? lsGet('sl2_setuju_' + sesi.kode, null) : null; }
async function jawabSetuju(ya){
  const rec = {setuju: !!ya, t: Date.now()};
  lsSet('sl2_setuju_' + sesi.kode, rec);
  try{ await obPut({id: 'p_' + sesi.kode + '_' + rec.t, tipe: 'persetujuan', kode: sesi.kode, t: rec.t, tries: 0, payload: {setuju: !!ya, perangkat: (infoNative().merek || '') + ' ' + (infoNative().model || '')}}); prosesOutbox(); }catch(e){}
  await siapkan();
}
async function siapkan(){
  const inf = infoNative();
  const jm = inf.jam_mulai >= 0 ? (String(inf.jam_mulai).padStart(2, '0') + '.00–' + String(inf.jam_selesai).padStart(2, '0') + '.00') : '24 jam';
  $('jamKerjaTxt').textContent = jm;
  const c = persetujuan();
  if(peranSesi()){ try{ nat().berhenti(); }catch(e){} }
  else {
    if(!c || !c.setuju){ tampil('scrSetuju'); return; }   // tidak ada tombol menolak; jawaban 'tidak' lama (versi sebelumnya) ditanya ulang
    if(c.setuju){
      if(!inf.lokasi){ bukaSetelan(true); return; }
      mulaiTracking();
    } else {
      try{ nat().berhenti(); }catch(e){}
    }
  }
  mulaiPoll();
  tampil('scrMain');
  bukaTab(tabAktif || 'beranda');
  setTimeout(() => { try{ if(window.pinpinSambut) pinpinSambut(false); }catch(e){} }, 500);
  hitungOutbox().then(() => { prosesOutbox(); segarkanLayarAktif(); });
  muatRingkasan(true);
  await muatDaftarZona();
}
function mulaiTracking(){
  if(!sesi || peranSesi()) return;
  const r = nat().mulai(sesi.kode, sesi.nama, sesi.depot);
  if(r !== 'ok') toast('Perekaman belum jalan: ' + r, 4200);
  mulaiPoll();
}

const PANDUAN = {
  xiaomi: {judul: 'Xiaomi / Redmi / POCO', langkah: [
    'Ketuk <b>Buka setelan Autostart</b> di atas, lalu aktifkan <b>SkyLens 2.0</b> (atau: Setelan → Aplikasi → Izin → Mulai otomatis).',
    'Setelan → Aplikasi → Kelola aplikasi → SkyLens 2.0 → <b>Hemat baterai</b> → pilih <b>Tanpa batasan</b>. Kalau ada pilihan "Tetap berjalan setelah layar mati", aktifkan.',
    'Buka daftar aplikasi terbaru (recent apps), tahan kartu SkyLens 2.0, ketuk ikon <b>gembok</b> supaya tidak ikut tertutup saat "bersihkan".',
    'Izin lokasi: pilih <b>Selalu izinkan</b> / "Sepanjang waktu".']},
  oppo: {judul: 'OPPO / Realme / OnePlus (ColorOS)', langkah: [
    'Ketuk <b>Buka setelan Autostart</b> di atas, aktifkan <b>SkyLens 2.0</b> (kalau tidak terbuka: Setelan → Aplikasi → Kelola aplikasi → SkyLens 2.0 → <b>Mulai otomatis</b>).',
    'Setelan → Baterai → (ikon gigi/pengaturan lainnya) → SkyLens 2.0 → pilih <b>Izinkan aktivitas latar belakang</b> / "Jangan dioptimalkan".',
    'Buka recent apps, tarik kartu SkyLens 2.0 sedikit ke bawah atau ketuk ikon titik tiga → <b>Kunci</b>.',
    'Izin lokasi: pilih <b>Selalu izinkan</b>.']},
  vivo: {judul: 'Vivo / iQOO (Funtouch / OriginOS)', langkah: [
    'Setelan → Baterai → <b>Konsumsi daya latar belakang</b> (High background power consumption) → SkyLens 2.0 → <b>Izinkan</b>.',
    'Setelan → Aplikasi → Izin khusus → <b>Mulai otomatis</b> → aktifkan SkyLens 2.0 (atau ketuk tombol Buka setelan Autostart di atas).',
    'Buka recent apps, tarik kartu SkyLens 2.0 ke bawah → <b>Kunci</b>.',
    'Izin lokasi: pilih <b>Selalu izinkan</b>.']},
  samsung: {judul: 'Samsung', langkah: [
    'Setelan → Baterai → <b>Batas penggunaan latar belakang</b> → matikan "Tidurkan aplikasi yang tidak digunakan".',
    'Di <b>Aplikasi yang tidak pernah tidur</b>, tambahkan SkyLens 2.0.',
    'Setelan → Aplikasi → SkyLens 2.0 → Baterai → pilih <b>Tanpa batasan</b>.',
    'Izin lokasi: pilih <b>Selalu izinkan</b>.']},
  huawei: {judul: 'Huawei / Honor', langkah: [
    'Setelan → Baterai → <b>Peluncuran aplikasi</b> → SkyLens 2.0 → ubah ke <b>Kelola manual</b> lalu aktifkan 3 pilihan (Mulai otomatis, Mulai tidak langsung, Berjalan di latar belakang).',
    'Izin lokasi: pilih <b>Selalu izinkan</b>.']},
  lain: {judul: 'HP kamu', langkah: [
    'Setelan → Aplikasi → SkyLens 2.0 → Baterai → pilih <b>Tanpa batasan</b> / "Jangan dioptimalkan".',
    'Kalau ada menu <b>Mulai otomatis / Autostart</b>, aktifkan untuk SkyLens 2.0.',
    'Buka recent apps dan <b>kunci</b> kartu SkyLens 2.0 kalau HP punya fitur itu.',
    'Izin lokasi: pilih <b>Selalu izinkan</b>.']}
};
function kunciPanduan(merek){
  const m = (merek || '').toLowerCase();
  if(/xiaomi|redmi|poco|blackshark/.test(m)) return 'xiaomi';
  if(/oppo|realme|oneplus/.test(m)) return 'oppo';
  if(/vivo|iqoo/.test(m)) return 'vivo';
  if(/samsung/.test(m)) return 'samsung';
  if(/huawei|honor/.test(m)) return 'huawei';
  return 'lain';
}
function fmtWaktuKirim(ms){
  if(!ms) return 'belum pernah';
  const d = Math.round((Date.now() - ms)/1000);
  if(d < 60) return d + ' detik lalu';
  if(d < 3600) return Math.round(d/60) + ' menit lalu';
  return Math.round(d/3600) + ' jam lalu';
}
function statusGps(){ try{ return JSON.parse(nat().statusGps()); }catch(e){ return {ditahan_ms: 0, dbhz: -1}; } }

function cekRow(ok, judul, ket, tombol, aksi){
  const ic = ok === true ? '<div class="ic y">✓</div>' : (ok === false ? '<div class="ic n">!</div>' : '<div class="ic o">?</div>');
  return '<div class="cek">' + ic + '<div class="tx">' + judul + (ket ? '<small>' + ket + '</small>' : '') + '</div>' +
    (tombol && ok !== true ? '<button onclick="' + aksi + '">' + tombol + '</button>' : '') + '</div>';
}
/** Daftar cek izin HP (dipakai di Persiapan HP dan di tab Akun). Mengembalikan {html, n, total, panduan}. */
function checklistHp(){
  const inf = infoNative();
  const rows = [];
  rows.push([!!inf.lokasi, 'Izin lokasi (wajib)', 'Pilih "Izinkan" atau "Saat aplikasi digunakan"', 'Izinkan', "nat().minta('lokasi')"]);
  if(inf.android >= 33) rows.push([!!inf.notif, 'Notifikasi', 'Supaya tanda "SkyLens 2.0 aktif" tampil', 'Izinkan', "nat().minta('notif')"]);
  rows.push([!!inf.baterai, 'Bebas penghemat baterai', 'Tanpa ini sistem HP bisa mematikan perekaman saat layar mati', 'Atur', "nat().minta('baterai')"]);
  if(inf.android >= 29) rows.push([!!inf.sepanjang, 'Lokasi "Selalu izinkan"', inf.android >= 30 ? 'Di setelan: Izin → Lokasi → Selalu izinkan' : 'Perlu supaya jalan saat layar mati', 'Buka', "nat().minta('sepanjang')"]);
  const nOk = rows.filter(r => r[0]).length;
  let h = rows.map(r => cekRow(r[0], r[1], r[2], r[3], r[4])).join('');
  return {html: h, n: nOk, total: rows.length, inf: inf};
}
function panduanHp(inf){
  const p = PANDUAN[kunciPanduan(inf.merek)];
  return '<div class="panduan"><h3>Panduan: ' + p.judul + '</h3><ol>' + p.langkah.map(x => '<li>' + x + '</li>').join('') + '</ol>' +
    '<div class="muted" style="margin-top:8px;font-size:12px">Nama menu bisa sedikit berbeda antar versi. Tes cepat: kunci layar 5 menit sambil jalan, lalu buka app — garis rute harus tetap tersambung.</div></div>';
}
function bukaSetelan(onboard){
  setelanOnboard = true;
  tampil('scrSetelan');
  renderSetelan();
  if(setelanTimer) clearInterval(setelanTimer);
  setelanTimer = setInterval(renderSetelan, 3000);
}
function tutupSetelan(){ setelanOnboard = false; siapkan(); }
function renderSetelan(){
  if(screenAktif !== 'scrSetelan') return;
  const cl = checklistHp();
  $('setelanBody').innerHTML = '<div class="card" style="padding:6px 16px">' + cl.html + '</div><details style="padding:2px 6px"><summary style="font-size:12.5px;color:var(--muted);cursor:pointer;font-weight:600">Rute sering terputus? Lihat panduan setelan HP</summary>' + panduanHp(cl.inf) + '</details>' +
    '<div class="ver">SkyLens 2.0 v' + APP_VERSI + ' · ' + esc(cl.inf.model || '') + (cl.inf.android ? ' · Android API ' + cl.inf.android : '') + '</div>';
  $('btnSetelanLanjut').disabled = !cl.inf.lokasi;
}
function kirimSemuaSekarang(){ try{ nat().kirimSekarang(); }catch(e){} prosesOutbox().then(() => { toast('Mengirim… cek lagi sebentar'); segarkanLayarAktif(); }); }

/* ============================================================
   RINGKASAN SALES (streak, NOO, riwayat) — dari server + antrean lokal
   ============================================================ */
let rkMuatT = 0;
function rkCache(){ return sesi ? lsGet('sl2_rk_' + sesi.kode, null) : null; }
function tlGet(){ return sesi ? lsGet('sl2_tl_' + sesi.kode, []) : []; }
function tlSet(a){ if(sesi) lsSet('sl2_tl_' + sesi.kode, a.slice(0, 400)); }
function tlUpsert(item){
  const a = tlGet(); const i = a.findIndex(x => x.id === item.id);
  if(i >= 0) a[i] = Object.assign(a[i], item); else a.unshift(item);
  a.sort((x, y) => y.t - x.t); tlSet(a);
}
async function muatRingkasan(paksa){
  if(!sesi) return;
  if(!paksa && Date.now() - rkMuatT < 15000) return;
  rkMuatT = Date.now();
  try{
    const j = await rpc('sales_ringkasan', {p_kode: sesi.kode});
    if(j && j.ok){
      j.tgl = wibYmd();
      lsSet('sl2_rk_' + sesi.kode, j);
      (j.riwayat || []).forEach(r => tlUpsert({id: r.id, nama: r.nama_toko || '', st: r.status || '', t: Date.parse(r.tanggal) || 0, key: r.key_petak == null ? null : Number(r.key_petak), uk: r.ukuran_toko || null, luar: !!r.luar_petak, kirim: true}));
    }
  }catch(e){ /* offline: pakai cache */ }
  segarkanLayarAktif();
  if(typeof petRender === 'function') petRender();
}
function noosah(p, adaFoto){ return p.status_tindak_lanjut === 'lanjut_noo' && !!adaFoto && p.lat != null && p.lon != null; }
/** Angka yang ditampilkan = cache server + temuan yang masih antre di HP (belum terkirim). */
function hitungRingkasan(){
  const rk = rkCache();
  const hari = wibYmd(), bulan = hari.slice(0, 7);
  const b = rk ? JSON.parse(JSON.stringify(rk)) : {hari_ini: {temuan: 0, noo: 0, kotak: 0}, bulan_ini: {temuan: 0, noo: 0}, total_noo: 0, streak: 0, streak_nyala: false};
  if(rk && rk.tgl !== hari){
    b.hari_ini = {temuan: 0, noo: 0, kotak: 0}; b.streak_nyala = false;
    if(rk.tgl && rk.tgl.slice(0, 7) !== bulan) b.bulan_ini = {temuan: 0, noo: 0};
  }
  let menunggu = 0;
  obTemuan.filter(r => !sesi || r.kode === sesi.kode).forEach(r => {
    menunggu++;
    const p = r.payload, tm = Date.parse(p.tanggal) || r.t, hr = wibYmd(tm), sah = noosah(p, r.foto || p.foto_url);
    if(hr.slice(0, 7) === bulan){ b.bulan_ini.temuan++; if(sah) b.bulan_ini.noo++; }
    if(hr === hari){ b.hari_ini.temuan++; }
    if(sah){
      b.total_noo++;
      if(hr === hari){ b.hari_ini.noo++; if(!b.streak_nyala){ b.streak++; b.streak_nyala = true; } }
    }
  });
  b.menunggu = menunggu;
  return b;
}
function temuanGabungan(){
  const pend = {}; obTemuan.forEach(r => { pend[r.payload.id] = r; });
  const a = tlGet().map(x => Object.assign({}, x, {kirim: !pend[x.id] && x.kirim !== false}));
  obTemuan.filter(r => !sesi || r.kode === sesi.kode).forEach(r => { if(!a.some(x => x.id === r.payload.id)) a.push({id: r.payload.id, nama: r.payload.nama_toko || '', st: r.payload.status_tindak_lanjut, t: Date.parse(r.payload.tanggal) || r.t, key: r.payload.key_petak, uk: r.payload.ukuran_toko || null, luar: r.payload.key_petak == null, kirim: false}); });
  a.sort((x, y) => y.t - x.t);
  return a;
}

/* ---------- misi Pinpin ---------- */
function petakMisi(){
  if(zonaAktif && !zonaAktif.manual){ const z = zonaList.find(q => keyDari(q[2], q[3]) === zonaAktif.key_petak); if(z) return z; }
  if(!zonaList.length) return null;
  if(lastPos){
    const dalam = zonaList.find(z => jarakKeTepiZona(z, lastPos.lat, lastPos.lon) < 1);
    if(dalam) return dalam;
    let best = null, bd = 1e12;
    zonaList.forEach(z => { const d = jarakKeTepiZona(z, lastPos.lat, lastPos.lon); if(d < bd){ bd = d; best = z; } });
    return best;
  }
  return zonaList[0];
}
/* Misi 1: tiap toko sedotan di JKS hari ini diganti satu temuan RT-L baru (target maks 10 per hari). */
/* Target NOO harian DINAMIS (v1.2.3): mengikuti JKS hari ini.
   S = toko sedotan di JKS hari ini (maks 10) -> itu yang harus diganti, jadi target = S.
   P = peluang RT-L (prediksi - yang sudah ada) di petak tugas yang SEARAH JKS hari ini; ditampilkan sebagai "peluang yang sudah ditandai Pinpin".
   JKS tanpa toko sedotan -> target = peluang RT-L di petak searah (1-3). Tidak ada data JKS / hari Minggu -> 3 (bawaan). */
function targetHarian(){
  const bawaan = {T: TARGET_NOO_HARIAN, S: 0, P: 0, nP: 0, dinamis: false};
  try{
    if(!sesi || peranSesi()) return bawaan;
    const g = jksHariD(); if(g.getDay() === 0) return bawaan;
    const k = tglKunci(g) + '|' + (OUTLET ? OUTLET.length : 0) + '|' + (zonaList ? zonaList.length : 0) + '|' + sesi.kode;
    if(targetHarian.k === k && targetHarian.v) return targetHarian.v;
    const jh = jksHariIni(g); if(!jh) return bawaan;
    const S = Math.min((jh.toko_sedotan || []).length, 10);
    const jp = jksPetakSegar() || {};
    const searah = (zonaList || []).filter(z => jp[keyDari(z[2], z[3])] && zonaTampil(z));
    const P = searah.reduce((a, z) => a + prediksiPetak(z).tL, 0);
    const v = {T: S > 0 ? S : Math.max(1, Math.min(P, 3)), S: S, P: P, nP: searah.length, dinamis: true, sedotan: jh.toko_sedotan || [], kode_jks: jh.kode_jks};
    targetHarian.k = k; targetHarian.v = v;
    return v;
  }catch(e){ return bawaan; }
}
window.targetNooHarian = () => targetHarian().T;
function misiGanti(){
  try{
    const g = jksHariD();
    if(!sesi) return null;
    if(g.getDay() === 0) return {id: 'ganti', kunci: true, pendek: 'Ganti toko sedotan dengan RT-L', tag: 'Libur', teks: 'Hari Minggu tidak ada JKS. Selamat istirahat, besok misi ini aktif lagi!'};
    const jh = jksHariIni(g);
    if(!jh) return {id: 'ganti', kunci: true, pendek: 'Ganti toko sedotan dengan RT-L', tag: 'JKS belum ada', teks: 'JKS kamu belum ada di data depo ini, jadi daftar toko sedotan belum bisa ditampilkan. Tetap cari RT-L di sekitarmu ya!'};
    const sed = jh.toko_sedotan || [], th = targetHarian(), P = th.P, nP = th.nP;
    const w = wibDate(), mulai = Date.UTC(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()) - 7 * 3600e3;
    const ada = temuanGabungan().filter(x => x.uk === 'RT-L' && x.st !== 'sudah_dicover' && x.t >= mulai).length;
    const petakTxt = '<b>' + nP + ' petak searah JKS</b>';
    if(!sed.length){
      const tgt = th.T, done = ada >= tgt;
      return {id: 'ganti', kunci: false, done: done, p: Math.min(1, ada / tgt), pendek: 'JKS bersih dari toko sedotan · bonus RT-L ' + Math.min(ada, tgt) + '/' + tgt, tag: done ? '✓' : Math.round(Math.min(1, ada / tgt) * 100) + '%',
        teks: 'Mantap, JKS kamu hari ini (' + esc(jh.kode_jks) + ') bersih dari toko sedotan! ' + (nP && P ? 'Di ' + petakTxt + ' Pinpin lihat ada <b>±' + P + ' peluang RT-L</b>. ' : '') + 'Kejar bonus <b>' + tgt + ' toko RT-L baru</b> ya. Sudah ketemu ' + Math.min(ada, tgt) + (done ? ', target tercapai!' : ', yuk lanjut!')};
    }
    const target = th.T;
    const done = ada >= target, p = Math.min(1, ada / target);
    const nama = sed.slice(0, 3).map(x => '<b>' + esc(String(x.nama || x.kode).replace(/,\s*(TK|TOKO)$/i, '')) + '</b>').join(', ');
    /* bingkai positif: prediksi = peluang yang SUDAH ditandai Pinpin; kalau kurang dari target, sisanya diarahkan ke rute JKS (bukan "cuma") */
    let peluang;
    if(!nP) peluang = 'Hari ini belum ada petak tugasmu yang searah JKS, jadi incar toko besar di sepanjang rute JKS-mu ya.';
    else if(P >= target) peluang = 'Kabar baik: di ' + petakTxt + ' Pinpin lihat ada <b>±' + P + ' peluang RT-L</b>, lebih dari cukup buat gantiin semuanya!';
    else if(P > 0) peluang = 'Pinpin sudah tandai <b>' + P + ' peluang RT-L</b> di ' + petakTxt + '. Sisanya biasanya nongol di jalan besar sepanjang rute JKS-mu, pasang mata elang ya!';
    else peluang = 'Petak searah JKS sudah ramai RT-L, jadi Pinpin yakin toko besar barunya ada di jalan besar sepanjang rute JKS-mu.';
    return {id: 'ganti', kunci: false, done: done, p: p,
      pendek: 'RT-L pengganti ' + Math.min(ada, target) + '/' + target + ' (' + sed.length + ' toko sedotan' + (nP ? ' · ±' + P + ' peluang di petak searah' : '') + ')',
      tag: done ? '✓' : Math.round(p * 100) + '%',
      teks: 'Di JKS hari ini ada <b>' + sed.length + ' toko sedotan</b>, antara lain ' + nama + '. Targetmu <b>' + target + ' toko RT-L baru</b> untuk menggantikannya. ' + peluang + ' Sudah ketemu ' + Math.min(ada, target) + (done ? ' — target tercapai, mantap!' : ', yuk lanjut!')};
  }catch(e){ return null; }
}
function hitungMisi(){
  const z = petakMisi();
  const m = [
    {id: 'ganti', kunci: true, pendek: 'Ganti toko sedotan dengan RT-L', tag: 'Segera',
     teks: 'Pinpin akan memberi daftar toko yang perlu diganti dengan toko <b>RT-L</b> begitu datanya siap. Sementara itu, tetap cari RT-L di sekitarmu ya!'},
    {id: 'jalan', kunci: true, pendek: 'Telusuri jalan besar di petakmu', tag: 'Segera',
     teks: 'Pinpin akan menunjukkan nama jalan besar di petak yang kamu tuju begitu data jalan siap. Jalan besar biasanya punya toko besar!'}
  ];
  const mg = misiGanti();
  if(mg) m[0] = mg;
  const mj = (typeof jlMisi === 'function') ? jlMisi() : null;
  if(mj) m[1] = mj;
  if(!z){
    m.push({id: 'target', kunci: true, pendek: 'Target RT-L / RT-S/M per petak', tag: 'Buka zona',
      teks: 'Buka salah satu zona dulu supaya Pinpin tahu target toko di petak itu.'});
    return {misi: m, selesai: 0};
  }
  const key = keyDari(z[2], z[3]);
  const tL = Math.max(0, Math.ceil((z[16] || 0) - 1e-9) - (z[15] || 0)), tM = Math.max(0, Math.ceil((z[18] || 0) - 1e-9) - (z[17] || 0));   // potensi dibulatkan ke atas, dikurangi yang sudah ada
  const tg = temuanGabungan().filter(x => x.key === key && x.st !== 'sudah_dicover');
  const aL = tg.filter(x => x.uk === 'RT-L').length, aM = tg.filter(x => x.uk === 'RT-M' || x.uk === 'RT-S').length;
  const desa = esc(z[11] || ('Petak ' + key));
  let teks, p, done;
  if(tL + tM === 0){
    teks = 'Menurut data, potensi toko RT-L dan RT-S/M di petak <b>' + desa + '</b> sudah terpenuhi. Tetap catat toko baru yang kamu temui ya!';
    p = 1; done = true;
  } else {
    done = aL >= tL && aM >= tM;
    p = Math.min(1, (Math.min(aL, tL) + Math.min(aM, tM)) / (tL + tM));
    teks = 'Target kita di petak <b>' + desa + '</b> ada <b>' + tL + ' toko RT-L</b> dan <b>' + tM + ' toko RT-S/M</b>. Kamu baru ketemu ' + aL + ' RT-L dan ' + aM + ' RT-S/M' + (done ? ' — target tercapai, mantap!' : ', yuk gaskeun cari sisanya!');
  }
  m.push({id: 'target', kunci: false, done: done, p: p, desa: z[11] || '', tL: tL, tM: tM, aL: aL, aM: aM,
    pendek: tL + tM === 0 ? 'Potensi petak ' + (z[11] || '') + ' terpenuhi' : 'RT-L ' + Math.min(aL, tL) + '/' + tL + ' · RT-S/M ' + Math.min(aM, tM) + '/' + tM + ' di ' + (z[11] || ('Petak ' + key)),
    tag: done ? '✓' : Math.round(p * 100) + '%', teks: teks});
  return {misi: m, selesai: m.filter(x => x.done).length};
}

/* ============================================================
   DATA AREA + DAFTAR ZONA
   ============================================================ */
async function muatDataArea(dep){
  try{
    const r = await fetch('data/' + dep.replace(/\s+/g, '_') + '.json');
    AREA = await r.json();
  }catch(e){ AREA = {zona: [], outlet: []}; }
  zonaMap = {};
  AREA.zona.forEach(z => { zonaMap[keyDari(z[2], z[3])] = z; });
  OUTLET = AREA.outlet || [];
  if(typeof jlMuat === 'function') await jlMuat(dep);
}
function zonaDariKey(key){
  const z = zonaMap[key];
  if(z) return z;
  const gxgy = gxgyDari(key);   // petak tidak ada di data lokal: buat minimal dari key
  return [gxgy[1]*S + S/2, gxgy[0]*S + S/2, gxgy[0], gxgy[1], 0, 0, 0, 0, 0, 0, '', '', '', '', 4, 0, 0, 0, 0, 0, 0, 0, 0, 0];
}
function namaZona(z){ return (z[11] || '-') + (z[12] ? (' · Kec. ' + z[12]) : ''); }
function kecZona(z){ return z[12] ? 'Kec. ' + z[12] : (z[13] || ''); }
function batasZona(z){ const lon0 = z[2]*S, lat0 = z[3]*S; return {lat0: lat0, lat1: lat0 + S, lon0: lon0, lon1: lon0 + S}; }
function titikTerdekat(b, lat, lon){ return {lat: Math.min(Math.max(lat, b.lat0), b.lat1), lon: Math.min(Math.max(lon, b.lon0), b.lon1)}; }
function jarakKeTepiZona(z, lat, lon){ const b = batasZona(z), p = titikTerdekat(b, lat, lon); return haversine(lat, lon, p.lat, p.lon); }
function progresZona(key){
  if(typeof jlAda === 'function' && jlAda() && jlPetak(key)) return jlProgres(key);
  let n = 0; gridSet.forEach(s => { if(s.split(':')[0] === String(key)) n++; }); return Math.min(16, n);
}
function nKotak(key){ return (typeof jlNAktif === 'function') ? jlNAktif(key) : 16; }   // jumlah kotak yang dihitung (kotak cerdas: hanya yang ada permukiman)
function segKotakHtml(n, N, gaya){
  if(!N) return '<span class="seg16 nol"' + (gaya ? ' style="' + gaya + '"' : '') + '><i></i></span>';
  return '<span class="seg16" style="grid-template-columns:repeat(' + N + ',1fr);' + (gaya || '') + '">' + Array.from({length: N}, (_, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '</span>';
}
function teksKotak(n, N){ return N ? n + '/' + N : 'tanpa permukiman'; }

/* ---- penugasan otomatis dari JKS ---- */
function petakOtomatis(kode){
  const by = new Map();   // key petak -> {kode: [jumlah, omset]}
  OUTLET.forEach(o => {
    if(!o[8]) return;
    const key = keyDari(Math.floor(o[1] / S + 1e-9), Math.floor(o[0] / S + 1e-9));
    let m = by.get(key); if(!m){ m = {}; by.set(key, m); }
    const e = m[o[8]] || (m[o[8]] = [0, 0]); e[0]++; e[1] += (+o[4] || 0);
  });
  const hasil = [];
  const bagus = OUTLET.filter(o => o[8]);
  AREA.zona.forEach(z => {
    const key = keyDari(z[2], z[3]), m = by.get(key);
    let pemilik = null;
    if(m){
      const ks = Object.keys(m).sort((a, b) => (m[b][0] - m[a][0]) || (m[b][1] - m[a][1]));
      pemilik = ks[0];
    } else if(z[23] === 1 || z[23] === 2){   // petak prioritas A/B tanpa toko -> sales dengan toko JKS terdekat
      const cla = z[3] * S + S / 2, clo = z[2] * S + S / 2, kc = Math.cos(cla * Math.PI / 180);
      let bd = 1e18;
      bagus.forEach(o => { const dy = o[0] - cla, dx = (o[1] - clo) * kc, d = dy * dy + dx * dx; if(d < bd){ bd = d; pemilik = o[8]; } });
    }
    if(pemilik != null && String(pemilik) === kode) hasil.push(z);
  });
  return hasil;
}
async function muatDaftarZona(){
  zonaState = {mode: 'memuat', pesan: ''}; segarkanLayarAktif();
  await muatDataArea(sesi.depot);
  if(peranSesi()){   // mode lihat: semua petak pilot depo
    gridSet = new Set(); manualList = [];
    zonaList = (AREA.zona || []).filter(z => z[24] === 1);
    if(typeof jlSiapkanIndeks === 'function') jlSiapkanIndeks();
    zonaState = {mode: zonaList.length ? 'ok' : 'kosong', offline: false};
    segarkanLayarAktif();
    if(typeof petRender === 'function') petRender();
    return;
  }
  let tugas = null, offline = false;
  try{
    tugas = await rpc('sales_tugas', {p_kode: sesi.kode});
    if(tugas && tugas.ok) lsSet('sl2_tugas_' + sesi.kode, tugas);
  }catch(e){ offline = true; tugas = lsGet('sl2_tugas_' + sesi.kode, null); }
  if(!tugas){ zonaState = {mode: 'galat', pesan: 'Belum bisa memuat zona (tidak ada sinyal). Coba lagi sebentar.'}; segarkanLayarAktif(); return; }
  if(!tugas.ok){ zonaState = {mode: 'galat', pesan: tugas.error || 'Gagal memuat zona'}; segarkanLayarAktif(); return; }
  gridSet = new Set(lsGet('sl2_grid_' + sesi.kode, []));
  (tugas.grid || []).forEach(g => gridSet.add(g[0] + ':' + g[1] + ':' + g[2]));
  lsSet('sl2_grid_' + sesi.kode, Array.from(gridSet));
  zonaList = (tugas.petak || []).map(k => zonaDariKey(Number(k)));
  /* penugasan otomatis dari JKS: petak yang paling banyak toko AS-IS-nya milik sales ini (+ petak A/B tanpa toko -> sales JKS terdekat). Penugasan manual dari dashboard tetap ikut. */
  try{
    const ada = new Set(zonaList.map(z => keyDari(z[2], z[3])));
    petakOtomatis(String(sesi.kode)).forEach(z => { const k = keyDari(z[2], z[3]); if(!ada.has(k)){ ada.add(k); zonaList.push(z); } });
  }catch(e){ console.error('petakOtomatis', e); }
  if(sesi && sesi.depot === 'TESTING' && !zonaList.length) zonaList = Object.keys(zonaMap).map(k => zonaMap[k]).filter(Boolean);   // depo uji: kalau belum ditugaskan dari dashboard, 4 petak uji langsung tersedia
  manualList = tugas.area_manual || [];
  if(typeof jlSiapkanIndeks === 'function') jlSiapkanIndeks();
  zonaState = {mode: (!zonaList.length && !manualList.length && sesi.depot !== 'TESTING') ? 'kosong' : 'ok', offline: offline};
  segarkanLayarAktif();
  if(typeof petRender === 'function') petRender();
}

/* ============================================================
   TAB + LAYAR UTAMA
   ============================================================ */
let mapAll = null, allLayers = [], allMe = null, allSel = -1, allFirstFit = false, allBasemapDone = false;
function bukaTab(nama){
  tabAktif = nama;
  ['beranda', 'peta', 'riwayat', 'akun'].forEach(t => { const el = $('tab' + t[0].toUpperCase() + t.slice(1)); if(el) el.style.display = (t === nama) ? 'flex' : 'none'; });
  document.querySelectorAll('.bnav .t').forEach(b => b.classList.toggle('on', b.dataset.tab === nama));
  if(screenAktif !== 'scrMain') tampil('scrMain');
  if(nama === 'peta') setTimeout(petaSemuaTampil, 30);
  if(nama === 'beranda' || nama === 'riwayat') muatRingkasan(false);
  segarkanLayarAktif();
}
function segarkanLayarAktif(){
  if(screenAktif === 'scrSetelan') renderSetelan();
  if(screenAktif === 'scrMain'){
    if(tabAktif === 'beranda') renderBeranda();
    else if(tabAktif === 'riwayat') renderRiwayat();
    else if(tabAktif === 'akun') renderAkun();
    else if(tabAktif === 'peta') petaSemuaPerbarui();
  }
  if(typeof petRender === 'function') petRender();
}

/* ---------- BERANDA ---------- */
function statusRekamHtml(){
  if(peranSesi()) return '';
  const inf = infoNative(), c = persetujuan();
  let judul, ket, kls = 'ok', aksi = '';
  if(c && !c.setuju){ judul = 'Perekaman jejak mati'; ket = 'Kamu memilih "Tidak". Temuan tetap bisa dicatat.'; kls = 'warn'; aksi = '<button onclick="tampil(\'scrSetuju\')">Ubah</button>'; }
  else if(!inf.lokasi){ judul = 'Izin lokasi belum diberikan'; ket = 'Rute tidak terekam sampai izin diberikan.'; kls = 'bad'; aksi = '<button onclick="bukaTab(\'akun\')">Perbaiki</button>'; }
  else if(!inf.tracking){ judul = 'Perekaman jejak MATI'; ket = inf.alasan_berhenti ? esc(inf.alasan_berhenti) : 'Ketuk Mulai untuk merekam rute.'; kls = 'bad'; aksi = '<button onclick="mulaiTracking();segarkanLayarAktif()">Mulai</button>'; }
  else {
    const warn = (inf.galat_kirim && inf.pending > 0);
    judul = 'Sedang kerja · rute terekam';
    ket = (inf.pending ? inf.pending + ' titik menunggu kirim' : 'Semua data terkirim') + (warn ? ' (menunggu sinyal)' : '') + (!inf.baterai ? ' · penghemat baterai belum dimatikan' : '');
    if(!inf.baterai){ kls = 'warn'; aksi = '<button onclick="bukaTab(\'akun\')">Atur</button>'; }
  }
  const dot = kls === 'ok' ? '#1F2C4F' : (kls === 'warn' ? '#FE7A1B' : '#9B1C28');
  const halo = kls === 'ok' ? '#E3E8F2' : (kls === 'warn' ? '#FFE3CC' : '#F6D5D8');
  return '<div class="card row" style="padding:12px 14px"><span style="width:12px;height:12px;border-radius:50%;background:' + dot + ';box-shadow:0 0 0 5px ' + halo + ';flex:none"></span>' +
    '<div class="col" style="flex:1;gap:1px"><b style="font-size:14px">' + judul + '</b><span class="muted" style="font-size:12px">' + ket + '</span></div>' + (aksi ? aksi.replace('<button', '<button style="border:0;border-radius:10px;padding:8px 12px;background:#EEF1F7;font-size:12.5px;font-weight:800;min-height:36px"') : '') + '</div>';
}

/* ===== Pinpin: kalimat harian (sambutan 6 variasi + 12 kata semangat), berganti tiap hari kerja ===== */
const HARI_ID = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const BULAN_ID = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
function tanggalPanjang(d){ return HARI_ID[d.getDay()] + ', ' + d.getDate() + ' ' + BULAN_ID[d.getMonth()] + ' ' + d.getFullYear(); }
function tglKunci(d){ return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
/** Urutan hari kerja (Senin–Sabtu) sejak Senin 5 Jan 2026. Minggu ikut nomor hari kerja berikutnya. */
function hariKerjaKe(d){
  const a = Date.UTC(2026, 0, 5), b = Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  const hari = Math.floor((b - a) / 864e5), mg = Math.floor(hari / 7), sisa = ((hari % 7) + 7) % 7;
  return mg * 6 + Math.min(sisa, 6);
}
const KATA_SEMANGAT = [
  'Semangaatt cari NOO-nya!',
  'Yuk gaskeun, Pinpin temenin cari NOO!',
  'Satu NOO hari ini, streak aman!',
  'Toko besar nungguin kamu, ayo!',
  'Langkah kecil, NOO besar!',
  'Hari ini pasti ada NOO, yakin!',
  'Susuri jalan besar, cari toko pipa!',
  'Pinpin percaya kamu bisa!',
  'Gas pol, NOO udah nunggu!',
  'Satu toko lagi, kamu pasti bisa!',
  'Jangan kendor, NOO di depan mata!',
  'Bareng Pinpin, cari NOO makin seru!'
];
function kataSemangatHariIni(d){ const n = hariKerjaKe(d || new Date()); return KATA_SEMANGAT[((n % 12) + 12) % 12]; }

/* Data sambutan. NANTI diisi dari server (RPC usulan: sales_jks_hari_ini(p_kode)) setelah data JKS ditarik:
   window.PINPIN_JKS = {kode_jks: 'R02 M2C24', toko_sedotan: [{kode, nama}], jalan_besar: ['Jl. ...', 'Jl. ...']}
   Selama belum ada, demo memakai data contoh dari toko AS-IS milik sales (order < 200rb) + jalan contoh. */
function jksContoh(d){
  const milik = (OUTLET || []).filter(o => tokoMilikSaya(o));
  const sed = milik.filter(tokoSedotan);
  const hk = ((d.getDay() + 6) % 7);                       // Senin=0 … Sabtu=5, Minggu=6
  const potong = sed.filter((o, i) => i % 6 === (hk % 6)).slice(0, 8);
  const kode = 'R01 M2C' + (13 + hk % 6);
  return {kode_jks: kode, toko_sedotan: potong.map(o => ({kode: o[6], nama: o[7]})), jalan_besar: ['Jl. Mayor Teddy', 'Jl. Subianto'], contoh: true};
}
/* ---- JKS hari ini, dihitung dari data toko di HP (o[14]=rute R01–R06 = Senin–Sabtu, o[15]=siklus) ----
   Siklus mengikuti NOMOR MINGGU ISO sepanjang tahun (tidak di-reset tiap bulan):
   M2C13 = minggu ganjil, M2C24 = minggu genap, M1 = tiap minggu. (Dicocokkan dengan data visit Malang Utara Agu–Okt 2026: 100% cocok.) */
function isoWeek(d){
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7) + 3);
  const fy = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - fy) / 864e5 - 3 + ((fy.getUTCDay() + 6) % 7)) / 7);
}
function jksSiklus(d){ return isoWeek(d) % 2 === 1 ? 'M2C13' : 'M2C24'; }
function jksHariD(){ const w = wibDate(); return new Date(w.getUTCFullYear(), w.getUTCMonth(), w.getUTCDate()); }
function jksCocok(o, rute, sik){ return o[14] === rute && (o[15] === 'M1' || o[15] === sik); }
/* nama jalan selalu berawalan "Jl." (data OSM kadang cuma "Dokter Muwardi"); Gang/Gg/Lorong dibiarkan */
function namaJalanRapi(n){
  n = String(n || '').replace(/\s+/g, ' ').trim(); if(!n) return '';
  if(/^(jalan|jln\.?)\s+/i.test(n)) return 'Jl. ' + n.replace(/^(jalan|jln\.?)\s+/i, '');
  if(/^jl\.?\s*/i.test(n)) return 'Jl. ' + n.replace(/^jl\.?\s*/i, '');
  if(/^(gang|gg\.?|lorong|lr\.?|tol|jembatan|simpang|terminal|pasar|bypass|by pass)\b/i.test(n)) return n;
  return 'Jl. ' + n;
}
/* jalan besar paling relevan: petak berisi toko JKS hari ini dihitung berat, petak zona lain ikut sebagai cadangan.
   Urutan prioritas: jalan besar (B) bernama, lalu jalan sedang (Q) bernama. Jalan tol tidak ditampilkan. */
function jksNamaJalanBesar(maks){
  try{
    if(typeof JL === 'undefined' || !JL.data) return [];
    const bobot = {};
    const jp = jksPerPetak(); Object.keys(jp).forEach(k => { bobot[k] = (bobot[k] || 0) + jp[k] * 10; });
    (zonaList || []).forEach(z => { const k = String(keyDari(z[2], z[3])); bobot[k] = (bobot[k] || 0) + 1; });
    const skorB = {}, skorQ = {};
    Object.keys(bobot).forEach(k => {
      const p = JL.data.petak[k]; if(!p) return;
      (p.r || []).forEach(i => {
        const r = JL.data.roads[i]; if(!r || !r[2] || /\btol\b/i.test(r[2])) return;
        const nm = namaJalanRapi(r[2]);
        if(r[0] === 'B') skorB[nm] = (skorB[nm] || 0) + bobot[k];
        else if(r[0] === 'Q') skorQ[nm] = (skorQ[nm] || 0) + bobot[k];
      });
    });
    const urut = o => Object.keys(o).sort((a, b) => o[b] - o[a]);
    return urut(skorB).concat(urut(skorQ).filter(n => !(n in skorB))).slice(0, maks || 3);
  }catch(e){ return []; }
}
function jksHariIni(d){
  if(!sesi || d.getDay() === 0) return null;
  const milik = (OUTLET || []).filter(o => tokoMilikSaya(o) && o[14]);
  if(!milik.length) return null;
  const rute = 'R0' + d.getDay(), sik = jksSiklus(d);
  const hariIni = milik.filter(o => jksCocok(o, rute, sik));
  return {kode_jks: rute + ' ' + sik, toko_sedotan: hariIni.filter(tokoSedotan).map(o => ({kode: o[6], nama: o[7]})), jalan_besar: jksNamaJalanBesar(3), jumlah_toko: hariIni.length};
}
/* petak -> jumlah toko JKS hari ini milik saya (untuk urutan & penanda di kartu zona) */
function jksPerPetak(){
  const out = {};
  try{
    const g = jksHariD();
    if(!sesi || g.getDay() === 0) return out;
    const rute = 'R0' + g.getDay(), sik = jksSiklus(g);
    (OUTLET || []).forEach(o => {
      if(!jksCocok(o, rute, sik) || !tokoMilikSaya(o)) return;
      const k = keyDari(Math.floor(o[1] / S), Math.floor(o[0] / S));
      out[k] = (out[k] || 0) + 1;
    });
  }catch(e){}
  return out;
}
function dataSambutan(d){
  if(window.PINPIN_JKS && window.PINPIN_JKS.kode_jks) return window.PINPIN_JKS;
  if(peranSesi() && !mgrSales) return {};
  const j = jksHariIni(d); if(j) return j;
  return {jalan_besar: jksNamaJalanBesar(3)};   // hari Minggu / belum ada data JKS: misi jalan besar tetap disebut
}

function gabungJalan(a){ a = (a || []).filter(Boolean); if(!a.length) return ''; if(a.length === 1) return a[0]; return a.slice(0, -1).join(', ') + ' dan ' + a[a.length - 1]; }
/* {N}=nama depan, {HARI}=nama hari, {JKS}=kode JKS, {S}=jumlah toko sedotan, {J}=jalan besar.
   Tiap variasi = 3 tahap: [sapa + JKS, toko sedotan, misi]. Tahap yang datanya kosong dilewati. */
const SAMBUTAN = [
  /* Senin */
  ['Haloo {N}! {SALAM}, selamat datang di SkyLens 2.0. Aku Pinpin yang akan temenin perjalanan kamu mencari NOO! Hari ini {TGL}, berarti JKS kamu hari ini <b>{JKS}</b>.',
   'Nahh, di JKS kamu hari ini ada <b>{S} toko sedotan</b>, yaitu toko kecil yang order &lt;200rb, sedikit EC dan jarang ROA.',
   'Misi kita hari ini menyusuri <b>{J}</b>. Prediksi Pinpin ada toko besar di sana buat gantiin toko sedotan tadi. Yukk langsung kita mulai! Pinpin temenin kok.'],
  /* Selasa */
  ['Hai {N}! {SALAM}, selamat datang di SkyLens 2.0. Aku Pinpin, temen seperjalananmu mencari NOO! Hari ini {TGL}, JKS kamu hari ini <b>{JKS}</b>.',
   'Pinpin nemu <b>{S} toko sedotan</b> di JKS kamu: ordernya &lt;200rb, EC sedikit, jarang ROA.',
   'Kita susuri <b>{J}</b> yuk! Feeling Pinpin ada toko besar di sana buat gantiin toko sedotan tadi. Gaskeun!'],
  /* Rabu */
  ['Halo halo {N}! {SALAM}, selamat datang di SkyLens 2.0. Aku Pinpin yang bakal nemenin kamu cari NOO! Hari ini {TGL}, waktunya JKS <b>{JKS}</b>.',
   'Hmm, masih ada <b>{S} toko sedotan</b> di rute ini. Kecil, order &lt;200rb, EC tipis, jarang ROA.',
   'Tugas kita: telusuri <b>{J}</b>, kemungkinan ada toko besar di sana jadi penggantinya. Pinpin ikut yaa!'],
  /* Kamis */
  ['Hei {N}! {SALAM}, selamat datang lagi di SkyLens 2.0. Pinpin siap nemenin kamu berburu NOO! Hari ini {TGL}, berarti kita jalan di JKS <b>{JKS}</b>.',
   'Di JKS ini ada <b>{S} toko sedotan</b>: belanja &lt;200rb, sedikit EC, jarang ROA.',
   'Misi hari ini ke <b>{J}</b>. Pinpin curiga ada toko besar nunggu kamu di sana buat gantiin toko sedotan. Yuk berangkat!'],
  /* Jumat */
  ['Yuhuu {N}! {SALAM}, selamat datang di SkyLens 2.0. Aku Pinpin, siap menemani perjalanan kamu mencari NOO! Hari ini {TGL}, JKS kamu hari ini <b>{JKS}</b>.',
   'Ada <b>{S} toko sedotan</b> di JKS hari ini, yang order &lt;200rb, EC sedikit dan jarang ROA.',
   'Pinpin udah tandain <b>{J}</b> buat kita susuri, ada toko besar di sana pengganti toko sedotan. Bareng Pinpin pasti bisa!'],
  /* Sabtu */
  ['Haii {N}! {SALAM}, selamat datang di SkyLens 2.0. Aku Pinpin yang akan jadi temen kamu mencari NOO! Hari ini {TGL}, kita di JKS <b>{JKS}</b>.',
   'Pinpin catat <b>{S} toko sedotan</b> di rute kamu: toko kecil, order &lt;200rb, sedikit EC, jarang ROA.',
   'Misi kita menyusuri <b>{J}</b>, prediksi Pinpin ada toko besar di situ buat gantiin mereka. Ayo mulai, Pinpin temenin terus!']
];
function salamWaktu(d){ const h = d.getHours(); return h < 11 ? 'Selamat pagii' : (h < 15 ? 'Selamat siang' : (h < 18 ? 'Selamat soree' : 'Selamat malam')); }
const SAMBUTAN_TANPA_JALAN = 'Misi kita hari ini menyusuri jalan besar di petak kamu, biasanya ada toko besar di sana. Yukk mulai, Pinpin temenin!';
const SAMBUTAN_TANPA_JKS = 'Haloo {N}! {SALAM}, selamat datang di SkyLens 2.0. Aku Pinpin yang akan temenin perjalanan kamu mencari NOO! Hari ini {TGL}.';
function kalimatSambutan(d){
  d = d || new Date();
  const D = dataSambutan(d), v = SAMBUTAN[((hariKerjaKe(d) % 6) + 6) % 6];
  const nama = sesi ? (typeof namaDepan === 'function' ? namaDepan(sesi.nama) : sesi.nama) : 'kamu';
  const n = (D.toko_sedotan || []).length, jalan = gabungJalan(D.jalan_besar);
  const isi = (t) => t.replace('{N}', esc(nama)).replace('{HARI}', HARI_ID[d.getDay()]).replace('{SALAM}', salamWaktu(d)).replace('{TGL}', esc(tanggalPanjang(d))).replace('{JKS}', esc(D.kode_jks || '-')).replace('{S}', n).replace('{J}', esc(jalan));
  const langkah = [{html: isi(D.kode_jks ? v[0] : SAMBUTAN_TANPA_JKS), emo: 0, judul: 'Halo!'}];
  if(n > 0) langkah.push({html: isi(v[1]), emo: 7, judul: 'Toko sedotan', toko: true});
  langkah.push({html: jalan ? isi(v[2]) : SAMBUTAN_TANPA_JALAN, emo: 3, judul: 'Misi hari ini'});
  return {langkah: langkah, data: D};
}

function heroHtml(){
  const rk = hitungRingkasan(), mm = hitungMisi();
  const TH = targetHarian().T, pct = Math.min(100, Math.round(rk.hari_ini.noo / TH * 100));
  const lines = mm.misi.map((m, i) =>
    '<div class="ms' + (m.kunci ? ' lock' : '') + '"><span class="ck' + (m.done ? ' done' : '') + '">' + (m.done ? ico('check', 'width:13px;height:13px;stroke-width:3') : (m.kunci ? ico('lock', 'width:12px;height:12px;stroke-width:2') : (i + 1))) + '</span>' +
    '<span class="tx">' + esc(m.pendek) + '</span><span class="tag">' + esc(m.tag) + '</span></div>').join('');
  return '<button type="button" class="hero" onclick="petBuka()" aria-label="Buka panel Pinpin">' +
    '<div class="row" style="justify-content:space-between"><span class="mpT" style="font-size:13px;font-weight:700"><svg class="pinIco" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C16.4 2 19 5 19 8.8 19 13 14.4 15.6 12 22 9.6 15.6 5 13 5 8.8 5 5 7.6 2 12 2Z" fill="#fff"/><circle cx="12" cy="8.9" r="2.9" fill="#E8620C"/></svg>Misi dari Pinpin</span>' +
    '<span class="pill">' + flameSvg(rk.streak_nyala, '', 'width:11px;height:13px') + rk.streak + ' hari</span></div>' +
    '<div style="display:flex;align-items:baseline;gap:6px"><b style="font-size:38px;line-height:1">' + rk.hari_ini.noo + '</b><span style="font-size:16px;font-weight:600">/ ' + TH + ' NOO hari ini</span></div>' +
    '<div class="bar"><i style="width:' + pct + '%"></i></div>' +
    '<div style="display:flex;justify-content:space-between;font-size:12.5px"><span>' + rk.hari_ini.temuan + ' temuan hari ini · total ' + rk.total_noo + ' NOO</span><b>' + pct + '%</b></div>' +
    '<div>' + lines + '</div>' +
    '<div style="font-size:12px;opacity:.85;text-align:center">Ketuk kartu ini untuk membuka Pinpin</div></button>';
}
/* keterangan di atas daftar zona: JKS hari ini + berapa petak zona yang berisi tokonya */
function jksInfoHtml(){
  try{
    const g = jksHariD(); if(!sesi || peranSesi() || g.getDay() === 0) return '';
    const jh = jksHariIni(g); if(!jh) return '';
    const nP = (zonaList || []).filter(z => (jksPetakSegar() || {})[keyDari(z[2], z[3])]).length;
    const kode = '<b>' + esc(jh.kode_jks) + '</b>';
    let t, cls = '';
    if(nP > 0) { t = 'JKS hari ini ' + kode + ': ' + jh.jumlah_toko + ' toko. Petak yang berisi tokomu hari ini diberi warna oranye berkilau dengan tulisan <b style="color:#B84A00">JKS hari ini</b> dan ada di urutan atas, pilih yang searah rutemu.'; cls = ' on'; }
    else if(jh.jumlah_toko > 0) t = 'JKS hari ini ' + kode + ': ' + jh.jumlah_toko + ' toko, tapi tidak ada di petak zona kamu. Pilih petak yang paling dekat dengan rutemu.';
    else t = 'JKS hari ini ' + kode + ': tidak ada toko di rutemu. Petak boleh dipilih bebas.';
    return '<div class="jksInfo' + cls + '">' + t + '</div>';
  }catch(e){ return ''; }
}
function zonaCardHtml(z, idx, no){
  const key = keyDari(z[2], z[3]), n = progresZona(key);
  const pr = NAMA_PRIO[z[23]] || '-';
  let jarak = '', here = false;
  if(lastPos){ const d = jarakKeTepiZona(z, lastPos.lat, lastPos.lon); here = d < 1; jarak = here ? 'kamu di sini' : fmtJarak(d); }
  const N = nKotak(key), jk = (JKS_PETAK || {})[key] || 0;
  return '<button type="button" class="card zonecard' + (here ? ' here' : '') + (jk ? ' jksHari' : '') + '" onclick="bukaZonaIdx(' + idx + ')">' +
    (jk ? '<span class="jksPita">Searah JKS hari ini<em>' + jk + ' toko</em></span>' : '') +
    '<span class="row" style="justify-content:space-between;align-items:flex-start;width:100%;gap:10px"><span class="zNo">' + no + '</span><span class="col" style="gap:2px;flex:1;min-width:0"><b style="font-size:16px">' + esc(z[11] || ('Petak ' + key)) + '</b>' +
    '<span class="muted" style="font-size:13px">' + esc(kecZona(z)) + (jarak ? ' · ' + jarak : '') + '</span></span><span class="prio p' + (pr === '-' ? 'X' : pr) + '">Prioritas ' + pr + '</span></span>' +
    '<span class="row" style="width:100%;gap:10px">' + segKotakHtml(n, N) + '<span class="mono" style="font-size:13px;white-space:nowrap">' + teksKotak(n, N) + '</span></span></button>';
}
/* ---- bilah RBM/BM/ASS: pilih depo + filter sales ---- */
function mgrBarHtml(){
  const per = peranSesi(); if(!per) return '';
  const deps = depotManajer();
  const cnt = {}, nm = {};
  (OUTLET || []).forEach(o => { const k = String(o[8] || ''); if(!k) return; cnt[k] = (cnt[k] || 0) + 1; nm[k] = o[9]; });
  const ks = Object.keys(cnt).sort((a, b) => namaBersih(nm[a] || a).localeCompare(namaBersih(nm[b] || b)));
  let h = '<section class="card" style="gap:8px"><div class="row" style="justify-content:space-between"><b style="font-size:14px">Mode lihat · ' + esc(per) + '</b><span class="muted" style="font-size:12px">tanpa perekaman GPS</span></div>';
  if(deps.length > 1){
    h += '<label class="muted" style="font-size:12px;font-weight:700">Depo</label><select class="mgrsel" onchange="gantiDepoMgr(this.value)">' +
      deps.map(d => '<option value="' + esc(d) + '"' + (d === sesi.depot ? ' selected' : '') + '>' + esc(d) + '</option>').join('') + '</select>';
  } else h += '<div class="muted" style="font-size:13px">Depo <b>' + esc(sesi.depot) + '</b></div>';
  h += '<label class="muted" style="font-size:12px;font-weight:700">Sales</label><select class="mgrsel" onchange="gantiSalesMgr(this.value)"><option value="">Semua sales (' + (OUTLET || []).length + ' toko)</option>' +
    ks.map(k => '<option value="' + esc(k) + '"' + (k === mgrSales ? ' selected' : '') + '>' + esc(namaBersih(nm[k] || k)) + ' (' + cnt[k] + ')</option>').join('') + '</select></section>';
  return h;
}
async function gantiDepoMgr(dep){
  if(!sesi || !dep || dep === sesi.depot) return;
  sesi.depot = dep; lsSet('sl2_sesi', sesi); mgrSales = ''; depotAktif = dep;
  zonaAktif = null; zonaList = []; manualList = [];
  await muatDaftarZona();
  if(map){ try{ map.remove(); }catch(e){} map = null; }
  if(mapAll){ try{ mapAll.remove(); }catch(e){} mapAll = null; allLayers = []; allMe = null; allSel = -1; allFirstFit = false; }
  segarkanLayarAktif();
}
function gantiSalesMgr(k){
  mgrSales = k || ''; tokoAllOn = !!k || tokoAllOn;
  /* pilih sales -> petak yang tampil = petak milik sales itu (sama dengan yang dilihat sales); "Semua sales" -> petak pilot depo */
  try{ zonaList = mgrSales ? petakOtomatis(mgrSales) : (AREA.zona || []).filter(z => z[24] === 1); }catch(e){}
  allSel = -1; petaSemuaPerbarui.sig = ''; if(typeof jlSiapkanIndeks === 'function') jlSiapkanIndeks();
  segarkanLayarAktif();
}
function renderBeranda(){
  const el = $('berandaBody'); if(!el || !sesi) return;
  const sapa = (() => { const j = wibDate().getUTCHours(); return j < 11 ? 'Selamat pagi' : (j < 15 ? 'Selamat siang' : (j < 18 ? 'Selamat sore' : 'Selamat malam')); })();
  const d = wibDate();
  let h = '<header class="row"><span class="avatar">' + esc(inisial(sesi.nama)) + '</span>' +
    '<div class="col" style="flex:1;gap:2px"><span class="muted" style="font-size:13px;font-weight:600">' + HARI[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + BULAN[d.getUTCMonth()] + '</span>' +
    '<b style="font-size:20px">Hai, ' + esc(namaDepan(sesi.nama)) + '</b></div></header>';
  h += statusRekamHtml();
  h += mgrBarHtml();
  if(obSisa > 0) h += '<div class="banner warn"><span>' + obSisa + ' data (temuan/sisir) menunggu terkirim — otomatis dicoba lagi.</span><button onclick="kirimSemuaSekarang()">Kirim</button></div>';
  h += heroHtml();
  jksPetakSegar();
  const tampilIdx = zonaList.map((z, i) => i).filter(i => zonaTampil(zonaList[i]));
  const nz = tampilIdx.length, sembunyi = jumlahKuningTersembunyi();
  let kotak = 0, kotakN = 0; tampilIdx.forEach(i => { const z = zonaList[i]; kotak += progresZona(keyDari(z[2], z[3])); kotakN += nKotak(keyDari(z[2], z[3])); });
  h += '<div class="row" style="justify-content:space-between;align-items:flex-end;gap:10px"><div class="col" style="gap:1px"><h2 style="font-size:18px;font-weight:800">Zona kamu</h2>' + (nz ? '<span class="muted" style="font-size:13px;font-weight:600">' + nz + ' petak · ' + kotak + '/' + kotakN + ' kotak</span>' : '') + '</div>' +
    (nz ? '<button type="button" onclick="bukaTab(\'peta\')" style="border:0;background:none;font-size:13px;font-weight:700;color:var(--orange-ink);white-space:nowrap">Lihat di peta</button>' : '') + '</div>';
  if(zonaState.mode === 'memuat') h += '<div class="empty">Memuat zona…</div>';
  else if(zonaState.mode === 'galat') h += '<div class="empty">' + esc(zonaState.pesan) + '<br><br><button class="btn gh sm" onclick="muatDaftarZona()">Coba lagi</button></div>';
  else if(zonaState.mode === 'kosong') h += '<div class="empty">Belum ada zona yang ditugaskan ke kamu. Hubungi BM/koordinator.</div>';
  else {
    if(zonaState.offline) h += '<div class="banner warn"><span>Tidak ada sinyal — menampilkan daftar terakhir yang tersimpan.</span></div>';
    const idx = tampilIdx.slice();
    const jkn = i => JKS_PETAK[keyDari(zonaList[i][2], zonaList[i][3])] || 0;
    if(lastPos) idx.sort((a, b) => jarakKeTepiZona(zonaList[a], lastPos.lat, lastPos.lon) - jarakKeTepiZona(zonaList[b], lastPos.lat, lastPos.lon));
    idx.sort((a, b) => (jkn(b) > 0) - (jkn(a) > 0));   // petak berisi toko JKS hari ini naik ke atas (urutan jarak tetap sebagai pembeda)
    h += idx.map((i, u) => zonaCardHtml(zonaList[i], i, u + 1)).join('');
    if(sembunyi > 0) h += '<button type="button" class="btn gh sm" onclick="setTampilC(true)">Tampilkan ' + sembunyi + ' petak kuning (Prioritas C)</button>';
    else if(tampilC && zonaList.some(z => z[23] !== 1 && z[23] !== 2)) h += '<button type="button" class="btn gh sm" onclick="setTampilC(false)">Sembunyikan petak kuning (Prioritas C)</button>';
    manualList.forEach((a, i) => {
      h += '<button type="button" class="card zonecard" style="border-left:4px solid #0d6efd" onclick="bukaAreaManualIdx(' + i + ')"><span class="row" style="justify-content:space-between;width:100%"><b style="font-size:16px">' + esc(a.name || 'Area manual') + '</b><span class="prio man">Manual</span></span><span class="muted" style="font-size:13px">' + esc(a.reason || 'Area gambar bebas dari dashboard') + '</span></button>';
    });
  }
  if(sesi.depot === 'TESTING') h += '<button class="btn gh sm" onclick="bukaModalManual()">＋ Buat area uji di lokasi saya</button>';
  if(el.dataset.sig !== h){ const st = el.parentElement.scrollTop; el.innerHTML = h; el.dataset.sig = h; el.parentElement.scrollTop = st; }
}
function bukaZonaIdx(i){ bukaZona(zonaList[i]); }
function bukaAreaManualIdx(i){ bukaAreaManual(manualList[i]); }

/* ---------- RIWAYAT ---------- */
const STY = {
  lanjut_noo: ['Lanjut NOO', '#FFF0E4', '#9A3A06', '#FFC08F', '#E8620C'],
  nanti_dikunjungi: ['Nanti dikunjungi', '#EEF1F7', '#1F2C4F', '#9AA5BC', '#4A5878'],
  tidak_tertarik: ['Tidak tertarik', '#F1F3F7', '#4A5878', '#C9D2E3', '#6B7A9C'],
  sudah_dicover: ['Sudah dicover', '#F1F3F7', '#4A5878', '#E3E7EE', '#9AA5BC']
};
function renderRiwayat(){
  const el = $('riwayatBody'); if(!el || !sesi) return;
  const rk = hitungRingkasan(), list = temuanGabungan().slice(0, 50);
  const nz = k => { if(k == null) return 'Luar petak'; const z = zonaDariKey(Number(k)); return z[11] || ('Petak ' + k); };
  let h = '<div class="row" style="justify-content:space-between"><h1 style="font-size:24px;font-weight:800">Riwayat temuan</h1><span class="muted" style="font-size:12px;font-weight:700">' + esc(namaDepan(sesi.nama)) + '</span></div>';
  h += '<div style="display:grid;grid-template-columns:1.3fr 1fr;gap:10px">' +
    '<div class="hero" style="padding:16px;gap:4px"><span style="font-size:13px;font-weight:700">NOO sah (foto + GPS)</span><b style="font-size:36px;line-height:1">' + rk.bulan_ini.noo + '</b><span style="font-size:12px">bulan ini · total ' + rk.total_noo + '</span></div>' +
    '<div class="card" style="padding:16px;display:flex;flex-direction:column;gap:4px;border-radius:20px"><span class="muted" style="font-size:13px;font-weight:700">Temuan</span><b style="font-size:36px;line-height:1">' + rk.bulan_ini.temuan + '</b><span class="muted" style="font-size:12px">' + rk.menunggu + ' menunggu sinyal</span></div></div>';
  if(!list.length) h += '<div class="empty">Belum ada temuan. Ketuk tombol + oranye untuk mencatat toko pertamamu.</div>';
  h += list.map(t => {
    const s = STY[t.st] || STY.sudah_dicover;
    const kirim = t.kirim;
    return '<button type="button" class="card hist" onclick="bukaDetailTemuan(\'' + esc(String(t.id)) + '\')"><div class="th" style="background:linear-gradient(160deg,' + s[3] + ',' + s[4] + ')"></div>' +
      '<div class="col" style="flex:1;min-width:0;gap:3px"><b style="font-size:15px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(t.nama || (t.st === 'sudah_dicover' ? 'Toko sudah dicover' : 'Toko tanpa nama')) + '</b>' +
      '<span class="muted" style="font-size:12px">' + esc(nz(t.key)) + ' · ' + labelWaktu(t.t) + (t.uk ? ' · ' + t.uk : '') + '</span>' +
      '<span class="tagc" style="background:' + s[1] + ';color:' + s[2] + '">' + s[0] + '</span></div>' +
      '<span class="sync" style="color:' + (kirim ? '#1F2C4F' : '#B9480A') + '">' + (kirim ? ico('cloud', 'width:18px;height:18px') : ico('clock', 'width:18px;height:18px')) + (kirim ? 'Terkirim' : 'Menunggu sinyal') + '</span></button>';
  }).join('');
  if(el.dataset.sig !== h){ const st = el.parentElement.scrollTop; el.innerHTML = h; el.dataset.sig = h; el.parentElement.scrollTop = st; }
}

/* ---------- DETAIL TEMUAN (ketuk kartu riwayat) — isi sama dengan ringkasan terakhir form ---------- */
const HASIL_LBL = {lanjut_noo: 'Lanjut NOO', nanti_dikunjungi: 'Nanti dikunjungi lagi', tidak_tertarik: 'Tidak tertarik', sudah_dicover: 'Sudah dicover sales Nabati'};
const SUB_LBL = {'1_minggu': 'seminggu lagi', '2_minggu': '2 minggu lagi', grosir_saja: 'beli di grosir saja', order_kecil: 'order <100rb'};
let RD = null;
function rdLepasFoto(){ if(RD && RD.blobUrl){ try{ URL.revokeObjectURL(RD.blobUrl); }catch(e){} } }
async function bukaDetailTemuan(id){
  if(!sesi) return;
  const t = temuanGabungan().find(x => String(x.id) === String(id)); if(!t) return;
  rdLepasFoto();
  RD = {id: String(id), t: t, p: null, fotoUrl: null, blobUrl: null, muat: true};
  const ob = obTemuan.find(r => r.payload && String(r.payload.id) === String(id));
  if(ob){ RD.p = ob.payload; if(ob.foto){ try{ RD.blobUrl = RD.fotoUrl = URL.createObjectURL(ob.foto); }catch(e){} } RD.muat = false; }
  tampil('scrTemuan'); renderDetailTemuan();
  if(!ob){
    try{
      const r = await fetchTO(SUPABASE_URL + '/rest/v1/temuan_pilot?id=eq.' + encodeURIComponent(String(id)) + '&select=*', {headers: hdr()}, 9000);
      if(r.ok){ const j = await r.json(); if(RD && RD.id === String(id) && j && j[0]){ RD.p = j[0]; RD.fotoUrl = j[0].foto_url || null; } }
    }catch(e){}
    if(RD && RD.id === String(id)){ RD.muat = false; if(screenAktif === 'scrTemuan' && !W) renderDetailTemuan(); }
  }
}
function tutupDetailTemuan(){ rdLepasFoto(); RD = null; tampil('scrMain'); bukaTab('riwayat'); }
function renderDetailTemuan(){
  if(!RD) return;
  const t = RD.t, d = t.d || {}, p = RD.p || {};
  const v = (a, b) => (a != null && a !== '') ? a : ((b != null && b !== '') ? b : null);
  const st = v(p.status_tindak_lanjut, t.st) || '';
  const nama = v(p.nama_toko, t.nama) || (st === 'sudah_dicover' ? 'Toko sudah dicover' : 'Toko tanpa nama');
  const key = p.key_petak != null ? Number(p.key_petak) : t.key;
  const lokasi = key == null ? 'Di luar petak penugasan' : ((zonaDariKey(Number(key)) || [])[11] || ('Petak ' + key));
  const lat = v(p.lat, d.lat), lon = v(p.lon, d.lon), acc = v(p.akurasi, d.acc);
  const sub = v(p.jadwal_kunjung_lagi, d.jd) || v(p.alasan_tidak_tertarik, d.al);
  const bl = v(p.rata_belanja_nabati, d.bl);
  const adaFoto = !!RD.fotoUrl || (!!p.foto_url);
  const waktu = new Date(Date.parse(p.tanggal) || t.t);
  const row = (k, val) => val == null || val === '' ? '' : '<div class="sumrow"><span>' + k + '</span><b>' + val + '</b></div>';
  let banner = '';
  if(st === 'lanjut_noo'){
    const okGps = lat != null && lon != null;
    banner = (okGps && (adaFoto || RD.muat))
      ? '<div class="banner ok" style="justify-content:flex-start">' + ico('check', 'width:18px;height:18px') + '<span>NOO sah: ada foto dan lokasi GPS.</span></div>'
      : '<div class="banner warn" style="justify-content:flex-start">' + ico('info', 'width:18px;height:18px') + '<span>Belum dihitung NOO sah: ' + (!okGps ? 'lokasi GPS tidak tercatat saat disimpan' : 'foto belum ada') + '.</span></div>';
  }
  const foto = RD.fotoUrl ? '<div class="photo has"><img src="' + esc(RD.fotoUrl) + '" alt="Foto toko"></div>'
    : (RD.muat ? '<div class="photo" style="pointer-events:none"><span class="muted" style="font-size:13px">Memuat foto…</span></div>' : (st === 'sudah_dicover' ? '' : '<div class="photo" style="pointer-events:none"><span class="muted" style="font-size:13px">Foto tidak tersedia di HP ini' + (t.kirim ? '' : ' (menunggu terkirim)') + '</span></div>'));
  const h = '<div class="wizhead"><div class="row"><button type="button" class="ibtn" onclick="tutupDetailTemuan()" aria-label="Kembali">' + ico('back') + '</button>' +
    '<div class="col" style="flex:1;min-width:0;gap:2px"><b style="font-size:17px">Detail temuan</b><span class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + esc(nama) + '</span></div></div></div>' +
    '<div class="scrollY" style="padding:14px 20px;display:flex;flex-direction:column;gap:12px">' + foto +
    '<div class="card" style="padding:4px 16px">' +
    row('Lokasi', esc(lokasi)) + row('Waktu', esc(waktu.toLocaleDateString('id-ID', {day: 'numeric', month: 'short', year: 'numeric'}) + ' · ' + waktu.toLocaleTimeString('id-ID', {hour: '2-digit', minute: '2-digit'}))) +
    (st === 'sudah_dicover' ? '' : row('Nama toko', esc(nama)) + row('Ukuran', esc(v(p.ukuran_toko, t.uk) || '')) +
      row('Belanja ke', esc([v(p.belanja_kemana, d.ke), v(p.nama_grosir_pasar, d.gr)].filter(Boolean).join(' · '))) +
      row('Belanja Nabati', bl == null ? null : fmtRp(+bl) + ' / bln') + row('No HP', esc(v(p.no_hp, d.hp) || ''))) +
    row('Hasil', esc((HASIL_LBL[st] || st || '-') + (SUB_LBL[sub] ? ' · ' + SUB_LBL[sub] : ''))) +
    row('Catatan', esc(v(p.catatan, d.cat) || '')) +
    row('GPS', lat != null ? (Number(lat).toFixed(5) + ', ' + Number(lon).toFixed(5) + (acc != null ? ' (±' + Math.round(acc) + ' m)' : '')) : 'tidak tercatat') +
    row('Status', t.kirim ? 'Terkirim ke server' : 'Menunggu sinyal') + '</div>' + banner + '</div>' +
    '<div class="wizfoot"><button type="button" class="btn gh" style="flex:1" onclick="tutupDetailTemuan()">Kembali ke riwayat</button></div>';
  const body = $('wizBody'); body.innerHTML = h; body.dataset.step = 'rd';
}

/* ---------- PEMBARUAN TAMPILAN (UiBundle di Android) ---------- */
function uiInfo(){ try{ return (ADA_NATIVE && Android.uiInfo) ? JSON.parse(Android.uiInfo()) : null; }catch(e){ return null; } }
function uiKartu(){
  const u = uiInfo(); if(!u || !u.aktif_fitur) return '';
  let pesan = '', warna = '';
  if(u.perlu_apk){ pesan = 'Ada pembaruan besar. Minta APK terbaru ke tim, lalu pasang (data tetap aman).'; warna = ' bad'; }
  else if(u.pending){ pesan = 'Versi ' + u.pending + ' sudah diunduh. Aktif saat app dibuka lagi.'; }
  else if(u.status){ pesan = u.status.charAt(0).toUpperCase() + u.status.slice(1); }
  const cek = u.cek_ts ? new Date(u.cek_ts).toLocaleTimeString('id-ID', {hour:'2-digit', minute:'2-digit'}) : '-';
  return '<section class="card" style="padding:16px;border-radius:20px;display:flex;flex-direction:column;gap:8px"><b style="font-size:15px">Pembaruan tampilan</b>' +
    '<span style="font-size:13px">Tampilan v<b>' + u.dipakai + '</b> (' + esc(u.sumber) + ') · dicek ' + cek + '</span>' +
    (pesan ? '<div class="banner' + warna + '"><span>' + esc(pesan) + '</span></div>' : '') +
    '<div class="bar-actions"><button class="btn gh sm" onclick="uiCekSekarang()">Cek pembaruan</button>' +
    (u.pending ? '<button class="btn sm" onclick="uiTerapkanSekarang()">Pakai versi baru sekarang</button>' : '') + '</div></section>';
}
function uiCekSekarang(){ try{ Android.uiCek(); toast('Memeriksa pembaruan...', 2200); }catch(e){} setTimeout(() => { if(tabAktif === 'akun') renderAkun(); }, 4000); setTimeout(() => { if(tabAktif === 'akun') renderAkun(); }, 12000); }
async function uiTerapkanSekarang(){ if(await dialogSL({ikon: 'refresh', judul: 'Pakai versi baru?', teks: 'Tampilan akan dimuat ulang dengan versi terbaru. Isian yang belum disimpan akan hilang.', ok: 'Muat ulang', batal: 'Nanti'})){ try{ Android.uiTerapkan(); }catch(e){} } }

/* ---------- AKUN ---------- */
function renderAkun(){
  const el = $('akunBody'); if(!el || !sesi) return;
  const cl = checklistHp(), inf = cl.inf, c = persetujuan(), g = statusGps();
  const dash = (cl.n / (cl.total) * 94.2).toFixed(1);
  const siap = cl.n === cl.total;
  let h = '<div class="card row" style="padding:14px;border-radius:20px;gap:14px"><span class="avatar" style="width:52px;height:52px">' + esc(inisial(sesi.nama)) + '</span>' +
    '<div class="col" style="flex:1;min-width:0"><b style="font-size:17px">' + esc(namaBersih(sesi.nama)) + '</b><span class="mono muted" style="font-size:12px">' + esc(sesi.kode) + ' · ' + esc(sesi.depot) + '</span></div>' +
    '<button type="button" onclick="keluar()" style="border:1px solid var(--line);border-radius:999px;padding:10px 14px;background:#fff;color:var(--red);font-size:13px;font-weight:700;min-height:44px">Keluar</button></div>';
  h += '<section class="card" style="padding:16px;border-radius:20px"><div class="row" style="gap:14px;padding-bottom:6px">' +
    '<div style="position:relative;width:60px;height:60px;flex:none"><svg viewBox="0 0 36 36" style="width:60px;height:60px;transform:rotate(-90deg)" aria-hidden="true"><circle cx="18" cy="18" r="15" fill="none" stroke="#EEF1F6" stroke-width="4"/><circle cx="18" cy="18" r="15" fill="none" stroke="#1F2C4F" stroke-width="4" stroke-linecap="round" stroke-dasharray="' + dash + ' 94.2"/></svg><b style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:15px">' + cl.n + '/' + cl.total + '</b></div>' +
    '<div class="col"><b style="font-size:16px">' + (siap ? 'HP siap dipakai' : 'HP hampir siap') + '</b><span class="muted" style="font-size:13px">' + (siap ? 'Semua izin sudah aktif, perekaman rute aman.' : 'Satu-dua pengaturan lagi supaya rute tidak putus.') + '</span></div></div>' +
    cl.html + '</section>';
  h += '<section class="card" style="padding:16px;border-radius:20px;display:flex;flex-direction:column;gap:10px"><b style="font-size:15px">Pengiriman data</b>' +
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><div class="stat"><span>Terakhir terkirim</span><b>' + fmtWaktuKirim(inf.terakhir_kirim) + '</b></div>' +
    '<div class="stat' + (obSisa || inf.pending ? ' or' : '') + '"><span>Menunggu sinyal</span><b>' + (inf.pending || 0) + ' titik · ' + obSisa + ' data</b></div></div>' +
    (inf.galat_kirim ? '<div class="banner bad"><span>Gagal kirim: ' + esc(inf.galat_kirim) + '</span></div>' : '') + (obGalat ? '<div class="banner bad"><span>' + esc(obGalat) + '</span></div>' : '') +
    '<button class="btn gh sm" onclick="kirimSemuaSekarang()">Kirim sekarang</button></section>';
  h += '<section class="card" style="padding:16px;border-radius:20px;display:flex;flex-direction:column;gap:8px"><b style="font-size:15px">Perekaman jejak</b>' +
    '<span style="font-size:13px">Status: <b>' + (inf.tracking ? 'AKTIF' : 'MATI') + '</b>' + (inf.alasan_berhenti ? ' · ' + esc(inf.alasan_berhenti) : '') + '</span>' +
    '<span style="font-size:13px">Persetujuan lokasi: <b>' + (c ? (c.setuju ? 'Diizinkan' : 'Tidak diizinkan') : 'Belum dijawab') + '</b></span>' +
    '<div class="bar-actions">' + ((!inf.tracking && c && c.setuju) ? '<button class="btn gh sm" onclick="mulaiTracking();segarkanLayarAktif()">Mulai perekaman</button>' : '') + '</div></section>';
  if(g && g.dbhz != null){
    const sinyal = g.dbhz >= 0 ? g.dbhz + ' dB-Hz ' + (g.dbhz >= 25 ? '(kuat)' : '(lemah — di dalam gedung?)') : 'belum diketahui';
    h += '<section class="card" style="padding:16px;border-radius:20px;display:flex;flex-direction:column;gap:6px"><b style="font-size:15px">Sinyal GPS</b>' +
      '<span style="font-size:13px">Sinyal satelit: <b>' + sinyal + '</b>' + (g.ditahan_ms > 15000 ? ' · posisi sedang ditahan' : '') + '</span>' +
      '<span style="font-size:13px">Penyaring GPS: <b>' + (g.filter_aktif === false ? 'MATI (aturan lama)' : 'AKTIF') + '</b></span>' +
      '<span class="muted" style="font-size:12.5px">Sejak perekaman dimulai: ' + (g.terima || 0) + ' titik dipakai · ' + (g.buang || 0) + ' dibuang (akurasi jelek) · ' + (g.tahan || 0) + ' ditahan (melompat)</span></section>';
  }
  h += uiKartu();
  h += '<section class="card" style="padding:16px;border-radius:20px;display:flex;flex-direction:column;gap:8px"><b style="font-size:15px">Makna toko sedotan</b>' +
    '<span style="font-size:13px">Toko kecil yang kontribusinya rendah, jadi ingin kita ganti dengan toko pipa. Toko disebut sedotan kalau <b>ketiganya</b> terpenuhi:</span>' +
    '<ul style="margin:0;padding-left:18px;font-size:13px;line-height:1.6"><li>Omset kurang dari <b>Rp200 rb</b></li><li>EC maksimal <b>1,5</b></li><li>ROA maksimal <b>3</b></li></ul>' +
    '<span class="muted" style="font-size:12px">Semua angka adalah rata-rata P3M (3 bulan terakhir).</span></section>';
  h += '<details style="padding:2px 6px"><summary style="font-size:12.5px;color:var(--muted);cursor:pointer;font-weight:600">Rute sering terputus? Lihat panduan setelan HP</summary>' + panduanHp(inf) + '</details>';
  h += '<div class="ver">SkyLens 2.0 v' + APP_VERSI + ' · tampilan diperbarui lewat internet ✓ · ' + esc(inf.model || '') + (inf.android ? ' · Android API ' + inf.android : '') + '</div>';
  if(el.dataset.sig !== h){
    const open = el.querySelector('details') && el.querySelector('details').open;
    const st = el.parentElement.scrollTop; el.innerHTML = h; el.dataset.sig = h; el.parentElement.scrollTop = st;
    if(open && el.querySelector('details')) el.querySelector('details').open = true;
  }
}

/* ============================================================
   PETA SEMUA ZONA (tab Peta)
   ============================================================ */
const SHEET_PEEK = 64;      // tinggi yang masih kelihatan saat sheet dilipat (pegangan + baris pertama)
const sheetLipat = {};      // id sheet -> true kalau sedang dilipat (bertahan walau isinya dirender ulang)
function sheetOff(sh){ return sheetLipat[sh.id] ? Math.max(0, sh.offsetHeight - SHEET_PEEK) : 0; }
function sheetTerapkan(sh, host, off){
  sh.style.transform = off ? 'translateY(' + off + 'px)' : '';
  host.style.setProperty('--shH', Math.max(SHEET_PEEK, Math.ceil(sh.offsetHeight - off)) + 'px');
}
function sheetBuka(id){ const sh = document.getElementById(id); if(!sh) return; sheetLipat[id] = false; if(sh.__ukurSet) sh.__ukurSet(); }
function ukurSheet(sheetId, hostId){
  const sh = document.getElementById(sheetId), host = document.getElementById(hostId); if(!sh || !host || sh.__ukur) return;
  sh.__ukur = true;
  const set = () => { if(!sh.__drag) sheetTerapkan(sh, host, sheetOff(sh)); };
  sh.__ukurSet = set;
  if(window.ResizeObserver) new ResizeObserver(set).observe(sh);
  new MutationObserver(set).observe(sh, {childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style']});
  set();
  /* geser pegangan: ke bawah = dilipat, ke atas = dibuka; ketuk pegangan = tukar */
  sh.addEventListener('pointerdown', ev => {
    const g = ev.target.closest && ev.target.closest('.grab'); if(!g || !sh.contains(g)) return;
    try{ sh.setPointerCapture(ev.pointerId); }catch(e){}
    const maxOff = Math.max(0, sh.offsetHeight - SHEET_PEEK);
    sh.__drag = {y0: ev.clientY, off0: sheetOff(sh), maxOff: maxOff, moved: false, lastY: ev.clientY, lastT: performance.now(), v: 0, id: ev.pointerId};
    sh.classList.add('dragging');
  });
  sh.addEventListener('pointermove', ev => {
    const d = sh.__drag; if(!d || ev.pointerId !== d.id) return;
    const dy = ev.clientY - d.y0;
    if(!d.moved && Math.abs(dy) > 5) d.moved = true;
    if(!d.moved) return;
    const now = performance.now(); d.v = (ev.clientY - d.lastY) / Math.max(1, now - d.lastT); d.lastY = ev.clientY; d.lastT = now;
    sheetTerapkan(sh, host, Math.max(0, Math.min(d.maxOff, d.off0 + dy)));
  });
  const akhir = ev => {
    const d = sh.__drag; if(!d || (ev && ev.pointerId !== d.id)) return;
    sh.__drag = null; sh.classList.remove('dragging');
    try{ sh.releasePointerCapture(d.id); }catch(e){}
    if(!d.moved) sheetLipat[sheetId] = !sheetLipat[sheetId];
    else {
      const cur = Math.max(0, Math.min(d.maxOff, d.off0 + (d.lastY - d.y0)));
      sheetLipat[sheetId] = d.v > 0.5 ? true : (d.v < -0.5 ? false : cur > d.maxOff / 2);
    }
    set();
  };
  sh.addEventListener('pointerup', akhir);
  sh.addEventListener('pointercancel', akhir);
}
function pasangBasemapToggle(petaMap, hybridLayer){
  ukurSheet('zoneSheet', 'scrPeta'); ukurSheet('allSheet', 'tabPeta');
  const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {subdomains: ['a','b','c'], maxZoom: 19});
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
}
function buatHybrid(){ return L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {subdomains: ['mt0','mt1','mt2','mt3'], maxZoom: 20}); }
/* ---- Peta ikut arah jalan (seperti Google Maps): peta berputar supaya arah gerak selalu menghadap ke atas ----
   Arah dihitung dari jarak tempuh >=9 m (bukan dari tiap titik GPS, supaya tidak muter-muter saat diam). Hanya aktif saat mengikuti posisi di dalam zona. */
let sweepMin = (lsGet('sl2_sweepmin', true) !== false);
function toggleSweep(){ sweepMin = !sweepMin; lsSet('sl2_sweepmin', sweepMin); const sw = $('sweepcard'); if(sw) sw.dataset.sig = ''; renderPosisi(); }
/* v1.2.3: seperti Google Maps — peta otomatis berputar mengikuti arah jalan selama mode ikuti (tombol panah/recenter).
   Peta digeser/diputar dua jari -> berhenti mengikuti & berhenti berputar otomatis; ketuk tombol panah -> ikuti + putar otomatis lagi.
   Kompas hanya muncul saat peta miring; ketuk kompas -> utara kembali di atas (tetap mengikuti posisi, tanpa putar otomatis). */
let utaraKunci = false, headDeg = null, headAnchor = null, bearTween = null;
function tampilRecenter(){ const b = $('recenterBtn'); if(b) b.style.display = (!followMode || utaraKunci) ? 'flex' : 'none'; }
function arahIkut(){
  if(typeof PD !== 'undefined' && PD.aktif && typeof pdArahDepan === 'function'){ const a = pdArahDepan(); if(a != null) return a; }
  return headDeg;
}
function selisihDeg(a, b){ return ((b - a + 540) % 360) - 180; }
function perbaruiArah(lat, lon, acc){
  if(acc && acc > 40) return;
  if(!headAnchor){ headAnchor = {lat: lat, lon: lon}; return; }
  const d = haversine(headAnchor.lat, headAnchor.lon, lat, lon);
  if(d < 9) return;
  const b = bearing(headAnchor.lat, headAnchor.lon, lat, lon);
  headAnchor = {lat: lat, lon: lon};
  if(d > 150) return;   // loncatan sinyal, abaikan
  headDeg = headDeg == null ? b : (headDeg + selisihDeg(headDeg, b) * 0.6 + 360) % 360;
}
function batalBearTween(){ if(bearTween){ clearInterval(bearTween); bearTween = null; } }
function setBearAnim(target){
  if(!map || !map.setBearing) return;
  batalBearTween();
  const dari = map.getBearing(), selisih = selisihDeg(dari, target);
  if(Math.abs(selisih) < 1.5) return;
  let i = 0; const N = 6;
  bearTween = setInterval(() => {
    i++; if(!map || !map.setBearing){ batalBearTween(); return; }
    map.setBearing((dari + selisih * (i / N) + 360) % 360); setPanahDeg(); perbaruiKompas();
    if(i >= N) batalBearTween();
  }, 70);
}
function terapkanArahPeta(){
  if(!map || !map.setBearing) return;
  const pandu = typeof PD !== 'undefined' && PD.aktif, pos = pandu ? (pdPos() || lastPos) : lastPos;
  const ikutPosisi = followMode && pos && zonaAktif && (pandu || insideZone(pos.lat, pos.lon));
  const h = (ikutPosisi && !utaraKunci) ? arahIkut() : null;
  if(h != null){ const tgt = (360 - h) % 360; if(Math.abs(selisihDeg(map.getBearing(), tgt)) >= 12) setBearAnim(tgt); }   // ambang 12°: tidak menggambar ulang jalan tiap goyangan kecil; peta diputar berlawanan arah gerak -> arah gerak menghadap atas
  else if(followMode && (utaraKunci || !ikutPosisi) && Math.abs(selisihDeg(map.getBearing(), 0)) > 1.5) setBearAnim(0);   // mode ikuti tapi tidak bergerak di jalur: utara di atas. Peta yang diputar sendiri (followMode mati) dibiarkan.
  perbaruiKompas();
}
function degPanah(){ const r = (typeof PD !== 'undefined' && PD.aktif && typeof pdArahDepan === 'function') ? pdArahDepan() : null; const h = r != null ? r : (headDeg != null ? headDeg : ((lastPos && lastPos.brg) || 0)); return (h + (map && map.getBearing ? map.getBearing() : 0) + 360) % 360; }
function setPanahDeg(){ try{ const d = youMarker && youMarker._icon && youMarker._icon.firstChild; if(d) d.style.transform = 'rotate(' + degPanah() + 'deg)'; }catch(e){} }
function perbaruiKompas(){
  const b = $('compassBtn'), ic = $('compassIco'); if(!b || !map) return;
  const miring = !!(map.getBearing && Math.abs(selisihDeg(map.getBearing(), 0)) > 3);
  b.style.display = (map.setBearing && miring) ? 'flex' : 'none';
  if(ic && map.getBearing) ic.style.transform = 'rotate(' + map.getBearing() + 'deg)';
}
function arrowIcon(deg, besar){
  const z = besar ? 30 : 26;
  return L.divIcon({className: '', iconSize: [z, z], iconAnchor: [z/2, z/2],
    html: '<div style="width:' + z + 'px;height:' + z + 'px;transform:rotate(' + deg + 'deg);transition:transform 0.5s ease;"><svg viewBox="0 0 24 24" width="' + z + '" height="' + z + '"><path d="M12 2.5 L20.5 20.5 L12 16.2 L3.5 20.5 Z" fill="#1F2C4F" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg></div>'});
}
/* lapisan petak (kotak/zona) selalu di bawah marker toko, supaya toko tetap bisa diketuk */
function siapkanPane(m){
  /* peta yang bisa berputar: lapisan vektor HARUS ikut di dalam rotatePane (kalau tidak, kotak/jalan menghilang saat peta diputar) */
  var ct = m._rotatePane || undefined;
  var a = m.createPane('petakPane', ct); a.style.zIndex = 380;
  var b = m.createPane('tokoPane', ct); b.style.zIndex = 650;
}
function petaSemuaTampil(){
  if(!$('tabPeta') || tabAktif !== 'peta') return;
  if(!mapAll){
    const c = (sesi && MANIFEST[sesi.depot]) ? MANIFEST[sesi.depot].center : [-7.2, 107.9];
    mapAll = L.map('mapAll', {zoomControl: false, attributionControl: false}).setView(c, 12);
    mapAll.on('popupopen', e => ajusPopup(mapAll, e.popup));
    siapkanPane(mapAll);
    const lbZoom = () => { const c = mapAll.getContainer(); if(c) c.classList.toggle('lbMati', mapAll.getZoom() < 14); };   // label petak hanya muncul saat sudah didekati (peta ringan & tidak bertumpuk)
    mapAll.on('zoomend', lbZoom); lbZoom();
    const hy = buatHybrid().addTo(mapAll); pasangBasemapToggle(mapAll, hy);
    if(typeof jlLegenda === 'function') jlLegenda(mapAll);
  }
  mapAll.invalidateSize();
  petaSemuaPerbarui(true);
}
function petaSemuaPerbarui(fit){
  if(!mapAll || tabAktif !== 'peta') return;
  jksPetakSegar();
  const sig = zonaList.map(z => zonaTampil(z) ? keyDari(z[2], z[3]) + ':' + progresZona(keyDari(z[2], z[3])) : '').join(',') + '|' + manualList.length + '|' + allSel + '|' + tampilC + '|' + (typeof JL !== 'undefined' ? JL.ver : 0);
  if(petaSemuaPerbarui.sig !== sig){
    petaSemuaPerbarui.sig = sig;
    allLayers.forEach(l => mapAll.removeLayer(l)); allLayers = [];
    const bounds = [];
    zonaList.forEach((z, i) => {
      if(!zonaTampil(z) && i !== allSel) return;   // hanya petak kerja sales ini (A/B + JKS hari ini; C kalau dinyalakan)
      const key = keyDari(z[2], z[3]), b = batasZona(z), sel = i === allSel, n = progresZona(key), w = (nKotak(key) > 0 && n >= nKotak(key)) ? '#2563EB' : (WARNA_PRIO[z[23]] || '#9aa3b2'), jk = (JKS_PETAK || {})[key] || 0;
      /* warna petak = warna dashboard: A merah, B oranye, C kuning */
      const r = L.rectangle([[b.lat0, b.lon0], [b.lat1, b.lon1]], {color: sel ? '#1C212D' : w, weight: sel ? 4 : (jk ? 3.5 : 2.5), fillColor: w, fillOpacity: sel ? 0.34 : 0.24, pane: 'petakPane'}).addTo(mapAll);
      r.on('click', () => { allSel = i; petaSemuaPerbarui(); petaSemuaSheet(); });
      const lb = L.marker([b.lat1, b.lon0], {interactive: false, icon: L.divIcon({className: 'lbPetak', iconSize: null, iconAnchor: [-6, -6],
        html: '<span style="font-size:11px;font-weight:800;background:' + (sel ? '#1C212D' : '#fff') + ';color:' + (sel ? '#fff' : '#1C212D') + ';border-radius:6px;padding:3px 7px;white-space:nowrap;border-left:4px solid ' + w + ';box-shadow:0 1px 4px rgba(0,0,0,.25)">' + (jk ? 'JKS · ' : '') + esc(z[11] || 'Petak') + ' · ' + teksKotak(n, nKotak(key)) + '</span>'})}).addTo(mapAll);
      allLayers.push(r, lb); bounds.push([b.lat0, b.lon0], [b.lat1, b.lon1]);
    });
    if(typeof JL !== 'undefined'){ JL.lapAll = null; if(allSel >= 0 && zonaList[allSel]){ const g = jlGambarRuas(mapAll, keyDari(zonaList[allSel][2], zonaList[allSel][3])); if(g){ JL.lapAll = g; allLayers.push(g); } } }
    manualList.forEach(a => { try{ const g = L.geoJSON(a.geojson, {pane: 'petakPane', style: {color: '#0d6efd', weight: 2.5, fillColor: '#0d6efd', fillOpacity: 0.18}}).addTo(mapAll); allLayers.push(g); const bb = g.getBounds(); bounds.push([bb.getSouth(), bb.getWest()], [bb.getNorth(), bb.getEast()]); }catch(e){} });
    if(bounds.length && (fit === true || !allFirstFit)){ allFirstFit = true; try{ mapAll.fitBounds(bounds, {padding: [40, 40], maxZoom: 16}); }catch(e){} }
  }
  if(lastPos){
    if(!allMe) allMe = L.marker([lastPos.lat, lastPos.lon], {icon: arrowIcon(lastPos.brg || 0, true), zIndexOffset: 800}).addTo(mapAll);
    else { allMe.setLatLng([lastPos.lat, lastPos.lon]); allMe.setIcon(arrowIcon(lastPos.brg || 0, true)); }
  }
  tokoAllGambar();
  petaSemuaSheet();
}
let tokoAllLayer = null, tokoAllSig = '', tokoAllOn = false;
try{ const t = JSON.parse(localStorage.getItem('sl2_tokoTgl2') || 'null'); if(t) tokoAllOn = !!t.on; }catch(e){}
function tokoAllDaftar(){ return (OUTLET || []).filter(tokoMilikSaya); }
function tokoAllTgl(){
  const el = $('tokoTgl'); if(!el) return;
  const saya = tokoAllDaftar(), nSed = saya.filter(tokoSedotan).length;
  let h = '<button type="button" aria-pressed="' + tokoAllOn + '" onclick="tokoAllSet()"><i class="d" style="background:#e08e2b"></i>Toko AS-IS · ' + saya.length + '</button>' +
    (tokoAllOn && nSed ? '<button type="button" aria-pressed="true" style="cursor:default" tabindex="-1"><i class="h"></i>Order &lt;200rb · ' + nSed + '</button>' : '');
  const nC = zonaList.filter(z => z[23] === 3).length;
  if(nC) h += '<button type="button" aria-pressed="' + tampilC + '" onclick="setTampilC(' + (!tampilC) + ')"><i class="d" style="background:#f1c40f"></i>Petak kuning · ' + nC + '</button>';
  if(el.dataset.sig !== h){ el.innerHTML = h; el.dataset.sig = h; }
}
function tokoAllSet(){
  tokoAllOn = !tokoAllOn;
  try{ localStorage.setItem('sl2_tokoTgl2', JSON.stringify({on: tokoAllOn})); }catch(e){}
  tokoAllSig = ''; tokoAllGambar();
}
function tokoAllGambar(){
  if(!mapAll) return;
  tokoAllTgl();
  const daftar = tokoAllOn ? tokoAllDaftar() : [];
  const sig = tokoAllOn + '|' + daftar.length + '|' + (sesi ? sesi.kode : '');
  if(sig === tokoAllSig) return; tokoAllSig = sig;
  if(tokoAllLayer){ mapAll.removeLayer(tokoAllLayer); tokoAllLayer = null; }
  if(!daftar.length) return;
  tokoAllLayer = L.layerGroup();
  daftar.forEach(o => {
    const warna = o[2] === 'A' ? '#a53838' : (o[2] === 'B' ? '#e08e2b' : '#5BC0F8'), sed = tokoSedotan(o);
    L.circleMarker([o[0], o[1]], sed
      ? {radius: 6.5, color: '#fff', weight: 2, fillColor: '#1FA35B', fillOpacity: 1, pane: 'tokoPane'}
      : {radius: 6, color: '#fff', weight: 1.4, fillColor: warna, fillOpacity: 0.95, pane: 'tokoPane'})
      .bindPopup(popupToko(o), Object.assign({}, POPUP_OPT, {autoPanPaddingTopLeft: L.point(16, 140), autoPanPaddingBottomRight: L.point(16, 150)})).addTo(tokoAllLayer);
  });
  tokoAllLayer.addTo(mapAll);
}
function petaSemuaSheet(){
  const sh = $('allSheet'); if(!sh) return;
  if(sh.__selSig !== allSel){ sh.__selSig = allSel; if(sheetLipat.allSheet) sheetBuka('allSheet'); }
  let h = '<i class="grab"></i>';
  if(allSel < 0 || !zonaList[allSel]){
    h += '<div class="col" style="gap:2px;padding:4px 0 2px"><b style="font-size:16px">' + (zonaList.length ? 'Ketuk petak berwarna untuk memilih zona' : 'Belum ada zona di peta') + '</b><span class="muted" style="font-size:13px">' + (zonaList.length ? (zonaList.length - jumlahKuningTersembunyi()) + ' petak ditugaskan · merah A, oranye B, kuning C' : 'Zona akan muncul setelah penugasan dari atasan') + '</span></div>';
  } else {
    const z = zonaList[allSel], key = keyDari(z[2], z[3]), n = progresZona(key), pr = NAMA_PRIO[z[23]] || '-';
    let d = null, here = false; if(lastPos){ d = jarakKeTepiZona(z, lastPos.lat, lastPos.lon); here = d < 1; }
    h += '<div class="row" style="justify-content:space-between;align-items:flex-start"><div class="col" style="gap:2px"><b style="font-size:17px">' + esc(z[11] || ('Petak ' + key)) + '</b><span class="muted" style="font-size:13px">' + esc(kecZona(z)) + ' · ' + (d == null ? 'mencari lokasi…' : (here ? 'kamu di sini' : fmtJarak(d))) + ' · ' + teksKotak(n, nKotak(key)) + (nKotak(key) ? ' kotak' : '') + '</span></div><span class="prio p' + (pr === '-' ? 'X' : pr) + '">Prioritas ' + pr + '</span></div>' +
      '<div class="bar-actions">' + (here ? '<button class="btn or" onclick="bukaZonaIdx(' + allSel + ')">Lanjut sisir</button>' : '<button class="btn or" onclick="navigasiKeZona(' + allSel + ')">' + ico('nav') + 'Gass ke petak</button>') +
      '<button class="btn gh" onclick="bukaZonaIdx(' + allSel + ')">Detail zona</button></div>';
  }
  if(sh.dataset.sig !== h){ sh.innerHTML = h; sh.dataset.sig = h; }
}
/* Peta → "Gass ke petak": buka petak di app & langsung pandu SkyLens (tanpa keluar ke Google Maps) */
function navigasiKeZona(i){
  const z = zonaList[i]; if(!z) return;
  bukaZona(z);
  if(typeof pdTersedia === 'function' && pdTersedia()) pdMulai();
}
(function pasangCariSemua(){
  const q = $('qAll'), box = $('allRes'); let hasil = [];
  q.addEventListener('input', function(){
    const kw = this.value.trim().toLowerCase();
    if(kw.length < 2){ box.style.display = 'none'; return; }
    const zs = zonaList.map((z, i) => ({tipe: 'z', i: i, z: z})).filter(x => String(x.z[11] || '').toLowerCase().includes(kw) || String(x.z[12] || '').toLowerCase().includes(kw)).slice(0, 5);
    const ts = OUTLET.filter(o => String(o[6] || '').toLowerCase().includes(kw) || String(o[7] || '').toLowerCase().includes(kw)).slice(0, 12).map(o => ({tipe: 't', o: o}));
    hasil = zs.concat(ts);
    box.style.display = 'block';
    box.innerHTML = hasil.length ? hasil.map((x, i) => x.tipe === 'z'
      ? '<div class="tokoRes" data-i="' + i + '"><div style="font-size:13px"><b>' + esc(x.z[11] || '-') + '</b><br><span class="muted" style="font-size:11.5px">Zona · ' + esc(kecZona(x.z)) + '</span></div><span class="prio">Zona</span></div>'
      : '<div class="tokoRes" data-i="' + i + '"><div style="font-size:13px"><b>' + esc(x.o[7] || '-') + '</b><br><span class="muted" style="font-size:11.5px">' + esc(x.o[6] || '-') + ' · ' + esc(x.o[3]) + ' · ' + esc(x.o[9] || '-') + '</span></div><div class="dotT" style="background:' + ({A: '#c0392b', B: '#f39c12', C: '#3498db'}[x.o[2]] || '#7f8c8d') + '"></div></div>').join('')
      : '<div class="empty" style="padding:14px">Tidak ketemu zona atau toko dengan kata itu.</div>';
    box.querySelectorAll('.tokoRes').forEach(el => el.onclick = function(){
      const x = hasil[+this.dataset.i]; box.style.display = 'none'; q.blur();
      if(!mapAll) return;
      if(x.tipe === 'z'){ allSel = x.i; petaSemuaPerbarui(); const b = batasZona(x.z); mapAll.fitBounds([[b.lat0, b.lon0], [b.lat1, b.lon1]], {padding: [40, 40]}); }
      else {
        if(petaSemuaPerbarui.cari) mapAll.removeLayer(petaSemuaPerbarui.cari);
        const icon = L.divIcon({className: '', html: '<div style="width:26px;height:26px;border-radius:50%;background:#fff;border:4px solid #000;box-shadow:0 0 0 6px rgba(0,0,0,0.18);"></div>', iconSize: [26, 26], iconAnchor: [13, 13]});
        petaSemuaPerbarui.cari = L.marker([x.o[0], x.o[1]], {icon: icon, zIndexOffset: 1000}).addTo(mapAll).bindPopup(popupToko(x.o), POPUP_OPT).openPopup();
        mapAll.flyTo([x.o[0], x.o[1]], 18, {duration: 0.8});
      }
    });
  });
})();

/* ============================================================
   PETA ZONA: menuju (di luar zona) + sisir (di dalam zona)
   ============================================================ */
function bukaMaps(lat, lon){ nat().bukaUrl('https://www.google.com/maps?q=' + lat + ',' + lon); }
function siapkanLayarPeta(){
  tampil('scrPeta');
  tutupSearchToko();
  followMode = true; utaraKunci = false; tampilRecenter();
  zInfoOpen = false; $('zoneSheet').dataset.sig = ''; $('sweepcard').dataset.sig = '';
}
function buatPeta(zoom){
  if(map){ map.remove(); map = null; }
  map = L.map('map', {zoomControl: false, attributionControl: false, rotate: !!(L.Map && L.Map.prototype.setBearing), touchRotate: !!(L.Map && L.Map.prototype.setBearing), shiftKeyRotate: false, rotateControl: false, bearing: 0}).setView([CENTER.lat, CENTER.lon], zoom);
  map.on('popupopen', e => {
    /* buka kartu toko: berhenti mengikuti & kembali ke utara-di-atas supaya kartu tidak bergeser/miring dan peta tidak lompat ke posisi kamu */
    if(followMode){ followMode = false; tampilRecenter(); }
    if(map.getBearing && Math.abs(map.getBearing()) > 0.5){ batalBearTween(); map.setBearing(0); perbaruiKompas(); }
    ajusPopup(map, e.popup);
  });
  headDeg = null; headAnchor = null;
  perbaruiKompas();
  map.on('rotasimanual', () => { batalBearTween(); followMode = false; tampilRecenter(); });   // diputar dua jari: berhenti putar otomatis
  map.on('rotate', () => { setPanahDeg(); perbaruiKompas(); });
  siapkanPane(map);
  const hybrid = buatHybrid().addTo(map);
  pasangBasemapToggle(map, hybrid);
  if(typeof jlLegenda === 'function') jlLegenda(map);
  const matikanFollow = () => { if(!followMode) return; followMode = false; batalBearTween(); tampilRecenter(); perbaruiKompas(); };
  map.on('dragstart', matikanFollow);   // seperti Google Maps: geser = berhenti mengikuti; zoom (pinch/tombol) tetap mengikuti posisi
  trailLayer = L.layerGroup().addTo(map);
  cellLayer = L.layerGroup().addTo(map);
  gambarUlangSeluruhJejak();
}

/* Popup toko bermerek SkyLens (kartu, bukan popup bawaan Leaflet) */
/* popup toko: geser peta supaya popup tidak tertutup kartu atas / sheet bawah (dihitung saat popup terbuka, bukan saat dibuat) */
function ajusPopup(m, popup){
  setTimeout(() => {
    const el = popup && popup.getElement && popup.getElement(); if(!el || !m || !m._container) return;
    const hr = m.getContainer().getBoundingClientRect(), r = el.getBoundingClientRect();
    const atas = hr.top + batasAtasPeta() + 10, bawah = hr.bottom - batasBawahPeta() - 12;
    let dy = 0;
    if(r.bottom > bawah) dy = r.bottom - bawah;
    if(r.top - dy < atas) dy = r.top - atas;     // prioritas: judul popup tetap kelihatan
    let dx = 0;
    if(r.right > hr.right - 12) dx = r.right - (hr.right - 12);
    if(r.left - dx < hr.left + 12) dx = r.left - (hr.left + 12);
    const mx = hr.height * 0.6; dy = Math.max(-mx, Math.min(mx, dy)); dx = Math.max(-hr.width * 0.6, Math.min(hr.width * 0.6, dx));
    if(Math.abs(dy) > 2 || Math.abs(dx) > 2) m.panBy([dx, dy], {animate: true, duration: 0.25});
  }, 60);
}
const POPUP_OPT = {className: 'slPop', maxWidth: 340, minWidth: 290, closeButton: true, autoPan: false};
/* padding autoPan dihitung saat popup dibuka: popup tidak boleh tertutup kartu atas / sheet bawah */
Object.defineProperty(POPUP_OPT, 'autoPanPaddingTopLeft', {enumerable: true, get(){ return L.point(16, batasAtasPeta() + 12); }});
Object.defineProperty(POPUP_OPT, 'autoPanPaddingBottomRight', {enumerable: true, get(){ return L.point(16, batasBawahPeta() + 58); }});
function layarPetaAktif(){ return (screenAktif === 'scrMain' && tabAktif === 'peta') ? 'tabPeta' : 'scrPeta'; }
function batasAtasPeta(){
  const host = document.getElementById(layarPetaAktif()); if(!host) return 90;
  const top = host.getBoundingClientRect().top; let m = 0;
  host.querySelectorAll('.topcard,.navcard,.sweepcard,.mapbanner').forEach(el => { const cs = getComputedStyle(el); if(cs.display === 'none' || cs.visibility === 'hidden') return; const r = el.getBoundingClientRect(); if(r.height > 0 && (r.top - top) < 200) m = Math.max(m, r.bottom - top); });   // hanya yang menempel di atas
  return Math.min(Math.max(m, 70), host.getBoundingClientRect().height * 0.5);
}
function batasBawahPeta(){
  const host = document.getElementById(layarPetaAktif()); if(!host) return 130;
  const sh = host.querySelector('.bsheet'); return sh ? Math.max(0, Math.ceil(host.getBoundingClientRect().bottom - sh.getBoundingClientRect().top)) : 130;
}
function rupiahRingkas(v){
  v = +v || 0; if(!v) return '—';
  if(v >= 1e6) return 'Rp ' + (v / 1e6).toFixed(v >= 1e7 ? 0 : 1).replace('.', ',') + ' jt';
  return 'Rp ' + Math.round(v / 1000) + ' rb';
}
const BATAS_SEDOTAN = 200000;   // order rata-rata/bln di bawah ini = calon toko sedotan (nanti + EC & ROA saat data JKS masuk)
function tokoSedotan(o){ if(o[13] != null) return o[13] === 1 || o[13] === true;   // flag sudah dihitung di data (omset + EC + ROA P3M)
  return (+o[4] || 0) > 0 && (+o[4]) < BATAS_SEDOTAN; }
function tokoMilikSaya(o){ if(!sesi) return false; if(peranSesi()) return !mgrSales || String(o[8] || '') === mgrSales; return String(o[8] || '') === String(sesi.kode || ''); }
/* EC & ROA P3M: kolom o[11] (EC) dan o[12] (ROA) diisi saat data JKS/KPI ditarik.
   DEMO: selama kolomnya belum ada, pakai angka contoh yang stabil per toko. */
function angka1(v){ return (Math.round(v * 10) / 10).toLocaleString('id-ID', {minimumFractionDigits: 1, maximumFractionDigits: 1}); }
function kpiToko(o){
  if(o[11] != null || o[12] != null) return {ec: o[11], roa: o[12], contoh: false};
  let h = 0; const k = String(o[6] || o[7] || ''); for(let i = 0; i < k.length; i++) h = (h * 31 + k.charCodeAt(i)) >>> 0;
  const om = +o[4] || 0, r = (h % 1000) / 1000;
  const ec = Math.max(0.4, Math.min(8, om / 110000 + r * 0.8)), roa = Math.max(0.2, Math.min(4, om / 260000 + r * 0.6));
  return {ec: ec, roa: roa, contoh: true};
}
function salesCoverHtml(o){
  const nm = namaBersih(o[9] || ''), kd = String(o[8] || '');
  if(!nm && !kd) return '<div class="spSales kosong"><div class="av">?</div><div class="tx"><span>Sales cover</span><b>Belum ada sales (di luar JKS)</b></div></div>';
  const ini = (nm || kd).split(/\s+/).slice(0, 2).map(w => w[0] || '').join('').toUpperCase();
  const saya = sesi && String(sesi.kode || '') === kd;
  return '<div class="spSales"><div class="av">' + esc(ini) + '</div><div class="tx"><span>Sales cover' + (saya ? ' · kamu' : '') + '</span><b>' + esc(nm || kd) + '</b>' + (kd ? '<em>' + esc(kd) + '</em>' : '') + '</div></div>';
}
function popupToko(o){
  const t = String(o[2] || '').toUpperCase(), warna = ({A: '#a53838', B: '#e08e2b', C: '#5BC0F8'})[o[2]] || '#7f8c8d';
  const sed = tokoSedotan(o), k = kpiToko(o);
  return '<div class="spB">' +
    '<div class="spHead"><span class="spNama">' + esc(o[7] || '-') + '</span><span class="spKode">' + esc(o[6] || '') + '</span></div>' +
    '<div class="spChips"><span class="spChip" style="background:' + warna + ';color:#fff">Tier ' + esc(t || '-') + '</span>' + (o[3] ? '<span class="spChip spTipe">' + esc(o[3]) + '</span>' : '') +
      (o[14] ? '<span class="spChip spJks">' + esc(o[14] + '-' + (o[15] || '')) + '</span>' : '') +
      (sed ? '<span class="spChip spSedot">Order &lt;200rb</span>' : '') + '</div>' +
    '<div class="spKpi">' +
      '<div><span>Avg. Omset P3M</span><b>' + rupiahRingkas(o[4]) + '</b></div>' +
      '<div><span>Avg. EC P3M</span><b>' + (k.ec != null ? angka1(k.ec) : '—') + '</b></div>' +
      '<div><span>Avg. ROA P3M</span><b>' + (k.roa != null ? angka1(k.roa) : '—') + '</b></div>' +
    '</div>' +
    salesCoverHtml(o) +
    (sed ? '<div class="spCiri"><i></i>Ciri Toko Sedotan</div>' : '') +
  '</div>';
}
function gambarTokoDalam(){
  OUTLET.forEach(o => {
    const lat = o[0], lon = o[1];
    if(lat < LAT0 || lat > LAT1 || lon < LON0 || lon > LON1) return;
    const warna = tokoSedotan(o) ? '#1FA35B' : (o[2] === 'A' ? '#a53838' : (o[2] === 'B' ? '#e08e2b' : '#5BC0F8'));
    L.circleMarker([lat, lon], {radius: 5, color: '#fff', weight: 1.2, fillColor: warna, fillOpacity: 0.9, pane: 'tokoPane'})
      .bindPopup(popupToko(o), POPUP_OPT).addTo(map);
  });
}
function labelKotak(r, c, visited){
  const huruf = 'ABCD'[GRID_N - 1 - r] || '?';
  return L.divIcon({className: '', iconSize: null, iconAnchor: [-4, -4],
    html: '<span style="font-size:10.5px;font-weight:800;color:#fff;background:' + (visited ? 'rgba(31,44,79,.92)' : 'rgba(28,33,45,.55)') + ';border-radius:5px;padding:2px 5px;white-space:nowrap">' + huruf + (c + 1) + (visited ? ' ✓' : '') + '</span>'});
}
function buatKotak(){
  cells = [];
  for(let r = 0; r < GRID_N; r++) for(let c = 0; c < GRID_N; c++){
    const clat0 = LAT0 + r*cellLat, clat1 = clat0 + cellLat, clon0 = LON0 + c*cellLon, clon1 = clon0 + cellLon;
    const aktif = (zonaAktif && !zonaAktif.manual && typeof jlKotakAktif === 'function') ? jlKotakAktif(zonaAktif.key_petak, r, c) : true;
    const rect = L.rectangle([[clat0, clon0], [clat1, clon1]], {color: '#ffffff', weight: 1.5, fillColor: '#ffffff', fillOpacity: 0.1, opacity: 0, interactive: false, pane: 'petakPane'});
    const lb = L.marker([clat1, clon0], {interactive: false, icon: labelKotak(r, c, false)});
    cells.push({rect: rect, label: lb, r: r, c: c, visited: false, dwellMs: 0, aktif: aktif});
  }
}
function tandaiKotakDariGrid(){
  cells.forEach(x => { if(x.aktif !== false && gridSet.has(zonaAktif.key_petak + ':' + x.r + ':' + x.c)) x.visited = true; });
}
/* prediksi toko per petak (sama dengan dashboard & misi Pinpin): prediksi = potensi model dibulatkan ke atas; peluang = prediksi - yang sudah ada */
function prediksiPetak(z){
  const pL = Math.ceil((z[16] || 0) - 1e-9), pM = Math.ceil((z[18] || 0) - 1e-9), aL = z[15] || 0, aM = z[17] || 0;
  return {pL: pL, aL: aL, tL: Math.max(0, pL - aL), pM: pM, aM: aM, tM: Math.max(0, pM - aM)};
}
function kartuPrediksiHtml(z){
  const q = prediksiPetak(z);
  const k = (lbl, p, a, t) => '<div class="stat cp pred"><span>' + lbl + '</span><b>' + p + ' <small>toko</small></b><em>ada ' + a + ' · ' + (t > 0 ? '<i>peluang +' + t + '</i>' : 'sudah penuh') + '</em></div>';
  return '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + k('Prediksi RT-L', q.pL, q.aL, q.tL) + k('Prediksi RT-M/RT-S', q.pM, q.aM, q.tM) + '</div>';
}
function infoZonaHtml(z){
  const pr = NAMA_PRIO[z[23]] || '-';
  const f1 = v => String(Math.ceil(Number(v || 0) - 1e-9));   // potensi dibulatkan ke atas (1,9 -> 2)
  return '<div class="zinfo"><div><span>Prioritas</span><b>' + pr + '</b></div><div><span>Bangunan</span><b>' + (z[4] || 0).toLocaleString('id-ID') + '</b></div>' +
    '<div><span>Bangunan besar</span><b>' + (z[5] || 0) + '</b></div><div><span>Toko terdaftar</span><b>' + (z[6] || 0) + '</b></div>' +
    '<div><span>RT-L (ada · potensi)</span><b>' + (z[15] || 0) + ' · ' + f1(z[16]) + '</b></div><div><span>RT-S/M (ada · potensi)</span><b>' + (z[17] || 0) + ' · ' + f1(z[18]) + '</b></div></div>';
}
function bukaZona(z){
  if(typeof pdBerhenti === 'function') pdBerhenti(true);
  const key = keyDari(z[2], z[3]);
  zonaAktif = {key_petak: key, kecamatan: namaZona(z), kabupaten: z[13] || sesi.depot, gx: z[2], gy: z[3], manual: false, z: z};
  siapkanLayarPeta();
  $('zoneTitle').textContent = z[11] || ('Petak ' + key);
  $('zoneEta').textContent = '';
  const pr = NAMA_PRIO[z[23]] || '-';
  $('zoneAddr').textContent = kecZona(z) + ' · Petak ' + key + ' · Prioritas ' + pr;
  $('topcardNav').classList.remove('open'); $('zoneSub').dataset.sig = '';
  LON0 = z[2]*S; LAT0 = z[3]*S; LON1 = LON0 + S; LAT1 = LAT0 + S;
  CENTER = {lat: (LAT0+LAT1)/2, lon: (LON0+LON1)/2};
  cellLon = (LON1-LON0)/GRID_N; cellLat = (LAT1-LAT0)/GRID_N;
  buatPeta(16);
  /* batas petak: pinggiran putih (casing) + garis oranye tebal, supaya jelas di atas citra satelit & jalan */
  L.rectangle([[LAT0, LON0], [LAT1, LON1]], {color: '#ffffff', weight: 7, opacity: 0.9, fill: false, interactive: false, pane: 'petakPane'}).addTo(map);
  L.rectangle([[LAT0, LON0], [LAT1, LON1]], {color: '#FE7A1B', weight: 4, fillColor: '#FE7A1B', fillOpacity: 0.12, interactive: false, pane: 'petakPane'}).addTo(map);
  petakLbl = L.marker([LAT1, (LON0 + LON1) / 2], {interactive: false, keyboard: false, zIndexOffset: 500, icon: L.divIcon({className: '', iconSize: [0, 0], html: '<div class="petakLbl">PETAK TUJUAN</div>'})});
  if(typeof jlGambarRuas === 'function') JL.lapZona = jlGambarRuas(map, key);
  gambarTokoDalam();
  buatKotak(); tandaiKotakDariGrid();
  youMarker = null; cellLastT = null;
  try{ nat().setPetak(String(key)); }catch(e){}
  renderPosisi(true);
}
function bukaAreaManual(a){
  petakLbl = null;
  siapkanLayarPeta();
  $('zoneTitle').textContent = a.name || 'Area manual';
  $('zoneAddr').textContent = a.reason || 'Area gambar bebas dari dashboard';
  $('topcardNav').classList.remove('open'); $('zoneSub').dataset.sig = '';
  const gj = L.geoJSON(a.geojson); const b = gj.getBounds(); const ctr = b.getCenter();
  CENTER = {lat: ctr.lat, lon: ctr.lng};
  zonaAktif = {key_petak: hashKeyAreaManual(a.id), kecamatan: a.name || 'Area manual', kabupaten: '(area manual)', gx: 0, gy: 0, manual: true, z: null};
  const sw = b.getSouthWest(), ne = b.getNorthEast();
  LAT0 = sw.lat; LAT1 = ne.lat; LON0 = sw.lng; LON1 = ne.lng;
  cellLon = (LON1-LON0)/GRID_N; cellLat = (LAT1-LAT0)/GRID_N;
  buatPeta(17);
  L.geoJSON(a.geojson, {style: {color: '#0d6efd', weight: 2.5, fillColor: '#0d6efd', fillOpacity: 0.18}}).addTo(map);
  gambarTokoDalam();
  buatKotak(); tandaiKotakDariGrid();
  youMarker = null; cellLastT = null;
  try{ nat().setPetak(String(zonaAktif.key_petak)); }catch(e){}
  renderPosisi(true);
}
function hashKeyAreaManual(id){ let h = 0; const s = String(id); for(let i = 0; i < s.length; i++){ h = (h*31 + s.charCodeAt(i)) >>> 0; } return 9200000000000 + (h % 900000000); }

function kembaliKeDaftar(){
  if(typeof pdBerhenti === 'function') pdBerhenti(true);
  tutupSearchToko();
  if(map){ map.remove(); map = null; trailLayer = null; trailRunLine = null; cellLayer = null; }
  zonaAktif = null; cellLastT = null; cells = []; youMarker = null;
  try{ nat().setPetak(null); }catch(e){}
  tampil('scrMain'); bukaTab(tabAktif || 'beranda');
}
function panKeZonaAktif(){
  if(!map || !CENTER) return;
  followMode = false; tampilRecenter();
  map.flyTo([CENTER.lat, CENTER.lon], 16, {duration: 0.6});
}
$('recenterBtn').addEventListener('click', () => {
  followMode = true; utaraKunci = false; tampilRecenter();
  const p = (typeof PD !== 'undefined' && PD.aktif) ? (pdPos() || lastPos) : lastPos;
  if(p && map) map.setView([p.lat, p.lon], Math.max(map.getZoom(), 17), {animate: true});
  if(typeof renderPosisi === 'function') renderPosisi(true); else terapkanArahPeta();
});
$('compassBtn').addEventListener('click', () => {   // kompas: kembalikan utara ke atas
  utaraKunci = true; batalBearTween(); setBearAnim(0); tampilRecenter();
  setTimeout(perbaruiKompas, 500);
});

/* ---------- cari toko ---------- */
let markerCariToko = null;
function hapusHighlightCariToko(){ if(markerCariToko && map){ map.removeLayer(markerCariToko); } markerCariToko = null; }
function toggleSearchToko(){
  const panel = $('searchTokoPanel'); const buka = panel.style.display !== 'block';
  panel.style.display = buka ? 'block' : 'none';
  if(buka){ $('qTokoHp').focus(); }
}
function tutupSearchToko(){
  $('searchTokoPanel').style.display = 'none'; $('qTokoHp').value = ''; $('listTokoHp').innerHTML = ''; $('hintTokoHp').style.display = 'block'; hapusHighlightCariToko();
}
(function pasangSearch(){
  const q = $('qTokoHp'), list = $('listTokoHp'), hint = $('hintTokoHp');
  const WT = {A: '#c0392b', B: '#f39c12', C: '#3498db'};
  let hasilTerakhir = [];
  q.addEventListener('input', function(){
    const kw = this.value.trim().toLowerCase();
    if(kw.length < 2){ list.innerHTML = ''; hint.style.display = 'block'; hapusHighlightCariToko(); return; }
    hint.style.display = 'none';
    hasilTerakhir = OUTLET.filter(o => String(o[6] || '').toLowerCase().includes(kw) || String(o[7] || '').toLowerCase().includes(kw));
    if(!hasilTerakhir.length){ list.innerHTML = '<div class="empty" style="padding:14px">Tidak ketemu toko dengan kode/nama itu.<br>Aman untuk didaftarkan sebagai temuan baru.</div>'; return; }
    list.innerHTML = hasilTerakhir.slice(0, 30).map((o, i) =>
      '<div class="tokoRes" data-i="' + i + '"><div style="font-size:13px"><b>' + esc(o[7] || '-') + '</b><br><span class="muted" style="font-size:11.5px">' + esc(o[6] || '-') + ' · ' + esc(o[3]) + ' · ' + esc(o[9] || '-') + '</span></div>' +
      '<div class="dotT" style="background:' + (WT[o[2]] || '#7f8c8d') + '"></div></div>').join('');
    list.querySelectorAll('.tokoRes').forEach(el => el.onclick = function(){
      const o = hasilTerakhir[+this.dataset.i]; if(!map) return;
      hapusHighlightCariToko();
      const icon = L.divIcon({className: '', html: '<div style="width:26px;height:26px;border-radius:50%;background:#fff;border:4px solid #000;box-shadow:0 0 0 6px rgba(0,0,0,0.18);"></div>', iconSize: [26, 26], iconAnchor: [13, 13]});
      markerCariToko = L.marker([o[0], o[1]], {icon: icon, zIndexOffset: 1000}).addTo(map);
      markerCariToko.bindPopup(popupToko(o), POPUP_OPT).openPopup();
      map.flyTo([o[0], o[1]], 18, {duration: 0.8});
      toggleSearchToko();
      markerCariToko.on('popupclose', hapusHighlightCariToko);
    });
  });
})();

/* ============================================================
   POSISI: titik dari native (atau shim) -> jejak, sisir kotak, popup prospek
   ============================================================ */
function mulaiPoll(){ if(!pollTimer){ pollTimer = setInterval(pollFix, 1500); } pollFix(); }
function stopPoll(){ if(pollTimer){ clearInterval(pollTimer); pollTimer = null; } }
function renderSinyalGps(){
  const el = $('gpsLemahBanner'); if(!el) return;
  const st = statusGps(), lemah = st.ditahan_ms > 15000 && screenAktif === 'scrPeta';
  el.style.display = lemah ? 'block' : 'none'; document.body.classList.toggle('gpsLemah', lemah);
  if(lemah) $('gpsLemahDetik').textContent = Math.round(st.ditahan_ms/1000) >= 120 ? Math.round(st.ditahan_ms/60000) + ' mnt' : Math.round(st.ditahan_ms/1000) + ' dtk';
  if(youMarker && youMarker.getElement()) youMarker.getElement().style.opacity = lemah ? '0.35' : '1';
}
function pollFix(){
  if(!sesi) return;
  renderSinyalGps();
  let arr = [];
  try{ arr = JSON.parse(nat().fixSejak(String(lastSeq))); }catch(e){ return; }
  if(!arr.length){
    if(++kosongBeruntun >= 20){
      kosongBeruntun = 0;
      try{ const semua = JSON.parse(nat().fixSejak('0')); if(semua.length && semua[semua.length-1][0] < lastSeq) lastSeq = 0; }catch(e){}
    }
    return;
  }
  kosongBeruntun = 0;
  const sekarang = Date.now();
  arr.forEach(f => {
    lastSeq = f[0];
    prosesFix(f[1], f[2], f[3], f[4], (sekarang - f[4]) > 30000);
  });
  renderPosisi();
  if(screenAktif === 'scrMain' && tabAktif === 'peta') petaSemuaPerbarui();
}
window.lastPosGlobal = () => lastPos;
function prosesFix(lat, lon, acc, t, replay){
  if(lastPos && lastPos.t > t) return;
  lastPos = {lat: lat, lon: lon, acc: acc, t: t, brg: lastPos ? bearing(lastPos.lat, lastPos.lon, lat, lon) : 0};
  if(!replay) perbaruiArah(lat, lon, acc);
  catatJejakGambar(lat, lon, acc, t);
  if(!replay) cekPopupProspek(lat, lon, t, acc);
  prosesSisir(lat, lon, t);
  if(typeof jlProsesFix === 'function') jlProsesFix(lat, lon, acc, t, replay);
  if(!replay && typeof PD !== 'undefined' && PD.aktif) pdPerbarui();
}
function warnaSegmen(a, b){ return (b.t - a.t) > GAP_HITAM_MS ? '#1a1a1a' : '#00BFA5'; }
function gambarSegmenJejak(a, b){
  if(!trailLayer) return;
  const warna = warnaSegmen(a, b);
  if(!trailRunLine || warna !== trailRunWarna){ trailRunWarna = warna; trailRunLine = L.polyline([[a.lat, a.lon], [b.lat, b.lon]], {color: warna, weight: 6, opacity: 0.9}).addTo(trailLayer); }
  else trailRunLine.addLatLng([b.lat, b.lon]);
}
function gambarUlangSeluruhJejak(){
  if(!trailLayer) return;
  trailRunLine = null; trailRunWarna = null;
  let run = [], runWarna = null;
  const tutupRun = () => { if(run.length >= 2) L.polyline(run, {color: runWarna, weight: 6, opacity: 0.9}).addTo(trailLayer); run = []; };
  for(let i = 1; i < trailPoints.length; i++){
    const a = trailPoints[i-1], b = trailPoints[i], w = warnaSegmen(a, b);
    if(w !== runWarna){ tutupRun(); runWarna = w; run = [[a.lat, a.lon]]; }
    run.push([b.lat, b.lon]);
  }
  tutupRun();
}
function catatJejakGambar(lat, lon, acc, t){
  if(acc && acc > AKURASI_BUANG_M) return;
  const ambang = Math.max(JARAK_MIN_M, acc || JARAK_MIN_M);
  let simpan = !lastSaved;
  if(lastSaved){ simpan = haversine(lastSaved.lat, lastSaved.lon, lat, lon) >= ambang || (t - lastSaved.t) >= DIAM_HEARTBEAT_MS; }
  if(!simpan) return;
  const titik = {lat: lat, lon: lon, t: t};
  if(trailPoints.length) gambarSegmenJejak(trailPoints[trailPoints.length-1], titik);
  trailPoints.push(titik); lastSaved = titik;
  if(trailPoints.length > 3000) trailPoints.splice(0, 500);
}
function insideZone(lat, lon){ return LAT0 != null && lat >= LAT0 && lat <= LAT1 && lon >= LON0 && lon <= LON1; }
function cellIndex(lat, lon){
  const r = Math.floor((lat-LAT0)/cellLat), c = Math.floor((lon-LON0)/cellLon);
  if(r < 0 || r >= GRID_N || c < 0 || c >= GRID_N) return null;
  return cells.find(x => x.r === r && x.c === c);
}

function prosesSisir(lat, lon, t){
  if(!map || !zonaAktif || !cells.length){ return; }
  if(!insideZone(lat, lon)){ cellLastT = null; return; }
  const cell = cellIndex(lat, lon);
  const jlZ = (typeof jlAda === 'function' && jlAda() && !zonaAktif.manual && jlPetak(zonaAktif.key_petak));
  if(cell && cell.aktif !== false && !(jlZ && jlKotakBerjalan(zonaAktif.key_petak, cell.r*GRID_N + cell.c))){   // kotak berjalan: selesai lewat jalan yang dilewati (jalan.js)
    const dt = cellLastT ? Math.max(0, Math.min(t - cellLastT, DWELL_CAP_MS)) : 0;
    cell.dwellMs = (cell.dwellMs || 0) + dt;
    if(!cell.visited && cell.dwellMs >= DWELL_KOTAK_MS){
      cell.visited = true;
      const k = zonaAktif.key_petak + ':' + cell.r + ':' + cell.c;
      gridSet.add(k); lsSet('sl2_grid_' + sesi.kode, Array.from(gridSet));
      obPut({id: 'g_' + sesi.kode + '_' + k, tipe: 'grid', kode: sesi.kode, t: Date.now(), tries: 0,
        payload: {key_petak: zonaAktif.key_petak, cell_r: cell.r, cell_c: cell.c, lat: lat, lon: lon, waktu: new Date(t).toISOString()}}).then(prosesOutbox).catch(() => {});
      if(typeof petTip === 'function') petTip('Kotak ' + ('ABCD'[GRID_N - 1 - cell.r] || '') + (cell.c + 1) + ' selesai disisir!', 2600);
    }
  }
  cellLastT = t;
}

let petakLbl = null;
function setSubNav(html){ const el = $('zoneSub'); if(el && el.dataset.sig !== html){ el.innerHTML = html; el.dataset.sig = html; } }
function tapKartuNav(){
  const c = $('topcardNav'); c.classList.toggle('open');
  if(c.classList.contains('open')){ clearTimeout(tapKartuNav.t); tapKartuNav.t = setTimeout(() => c.classList.remove('open'), 6000); }
  if(document.body.classList.contains('menuju')) panKeZonaAktif();
}
function renderPosisi(paksa){
  if(!map || !zonaAktif) return;
  const sw = $('sweepcard'), nv = $('navcard'), zs = $('zoneSheet');
  const lastPos = (typeof PD !== 'undefined' && PD.aktif) ? (pdPos() || window.lastPosGlobal()) : window.lastPosGlobal();
  if(lastPos){
    const lat = lastPos.lat, lon = lastPos.lon;
    if(!youMarker){ youMarker = L.marker([lat, lon], {icon: arrowIcon(degPanah())}).addTo(map); }
    else { youMarker.setLatLng([lat, lon]); youMarker.setIcon(arrowIcon(degPanah())); }
    if(followMode && (insideZone(lat, lon) || (typeof PD !== 'undefined' && PD.aktif))) map.panTo([lat, lon], {animate: true});
    terapkanArahPeta();
  }
  if($('searchTokoPanel').style.display === 'block') return;
  const dalam = !!lastPos && insideZone(lastPos.lat, lastPos.lon);
  const aktifCells = cells.filter(x => x.aktif !== false);
  const n = aktifCells.filter(x => x.visited).length, N = aktifCells.length;
  const keyZ = zonaAktif.manual ? null : zonaAktif.key_petak;
  cells.forEach(x => {
    if(x.aktif === false){   // kotak tanpa rumah (hutan/sawah): redup, tanpa label, tidak dihitung
      if(!x.rect._map) x.rect.addTo(cellLayer);
      x.rect.setStyle({opacity: 0, fillColor: '#111827', fillOpacity: dalam ? 0.42 : 0.3});
      if(x.label._map) cellLayer.removeLayer(x.label);
      return;
    }
    if(dalam){
      if(!x.rect._map) x.rect.addTo(cellLayer); if(!x.label._map) x.label.addTo(cellLayer);
      x.rect.setStyle(x.visited ? {opacity: 1, fillColor: '#1F2C4F', fillOpacity: 0.5, color: '#ffffff', weight: 1.5} : {opacity: 1, fillColor: '#ffffff', fillOpacity: 0.1, color: '#ffffff', weight: 1.5});
      if(x._vis !== x.visited){ x._vis = x.visited; x.label.setIcon(labelKotak(x.r, x.c, x.visited)); }
    } else { x.rect.setStyle({opacity: 0, fillOpacity: 0}); if(x.label._map) cellLayer.removeLayer(x.label); }
  });
  document.body.classList.toggle('menuju', !dalam);
  if(dalam){
    nv.style.display = 'none'; sw.style.display = 'flex';
    setSubNav('<i class="gdot ok"></i>Di dalam zona' + (N ? ' <span class="sep">•</span> ' + n + '/' + N + ' kotak' : ''));
    if(petakLbl && petakLbl._map) map.removeLayer(petakLbl);
    const z = zonaAktif.z;
    const sisa = N - n, adaJl = !!(keyZ && typeof jlPetak === 'function' && jlPetak(keyZ));
    const rbMini = adaJl ? jlRingkasBesar([keyZ]) : null;
    const mini = '<button type="button" class="swMini" onclick="toggleSweep()" aria-label="Buka detail zona"><b>' + (N ? n + '/' + N + ' kotak' : 'Tanpa permukiman') + '</b>' + (N ? segKotakHtml(n, N, 'flex:1;min-width:40px') : '<span style="flex:1"></span>') +
      (rbMini && rbMini.tot > 0 ? '<span class="mono swKm">' + jlKm(rbMini.mkn) + '/' + jlKm(rbMini.tot) + ' km</span>' : '') + '<i class="swChev">▼</i></button>';
    const html = sweepMin ? mini : (N ? '<div class="row" style="justify-content:space-between"><span style="font-size:13px;font-weight:700;color:var(--navy)">Kamu di dalam zona</span>' + (sisa ? '<span style="font-size:13px;font-weight:800;color:var(--orange-ink)">Sisa ' + sisa + ' kotak</span>' : '<span style="font-size:13px;font-weight:800;color:var(--navy)">Semua kotak selesai ✓</span>') + '</div>' +
      '<div style="display:flex;align-items:baseline;gap:6px"><b style="font-size:34px;line-height:1">' + n + '</b><span class="muted" style="font-size:15px;font-weight:600">/ ' + N + ' kotak' + (adaJl && N < 16 ? ' berpenghuni' : '') + '</span></div>' +
      segKotakHtml(n, N, 'flex:none') +
      '<div class="muted" style="font-size:12px">' + (adaJl ? 'Susuri jalan di tiap kotak sampai jadi teal. Kotak gelap = tanpa rumah, tidak dihitung.' : 'Jelajahi tiap kotak ±1 menit (jalan-jalan keliling kotaknya) supaya dianggap disisir. Rute terekam otomatis walau layar mati.') + '</div>'
      : '<div class="jlKosong"><b>Petak ini tidak ada permukiman</b><span>Tidak perlu disisir — tidak ada atap rumah di citra satelit. Lanjut ke zona lain ya!</span></div>') +
      (adaJl ? jlKartuHtml(keyZ, zInfoOpen) : '') +
      (z ? '<button type="button" onclick="zInfoOpen=!zInfoOpen;renderPosisi()" style="border:0;background:var(--ground);border-radius:12px;padding:10px;font-size:13px;font-weight:700;min-height:42px">' + (adaJl ? 'Nama jalan & info zona ' : 'Info zona lengkap ') + (zInfoOpen ? '▲' : '▼') + '</button>' + (zInfoOpen ? infoZonaHtml(z) : '') : '') + (sweepMin ? '' : '<button type="button" class="swKecil" onclick="toggleSweep()">Kecilkan kartu ▲</button>');
    if($('zoneEta').textContent) $('zoneEta').textContent = '';
    sw.classList.toggle('swmin', !!sweepMin);
    if(sw.dataset.sig !== html){ sw.innerHTML = html; sw.dataset.sig = html; }
    const sh = '<i class="grab"></i><div class="bar-actions"><button class="btn or" style="flex:2" onclick="bukaWizard()">' + ico('plus', 'stroke-width:2.4') + 'Catat temuan</button><button class="btn gh" style="flex:1;white-space:nowrap" onclick="toggleSearchToko()">' + ico('search') + 'Cek toko</button></div>';
    if(zs.dataset.sig !== sh){ zs.innerHTML = sh; zs.dataset.sig = sh; }
  } else {
    sw.style.display = 'none'; nv.style.display = 'flex';
    const z = zonaAktif.z;
    const pdSub = (typeof PD !== 'undefined' && PD.aktif) ? pdNavSub() : null;
    const eta = pdSub && typeof pdTiba === 'function' ? pdTiba() : '';
    if($('zoneEta').textContent !== (eta ? 'tiba ±' + eta : '')) $('zoneEta').textContent = eta ? 'tiba ±' + eta : '';
    if(pdSub) setSubNav(pdSub);
    else if(lastPos){
      const b = {lat0: LAT0, lat1: LAT1, lon0: LON0, lon1: LON1};
      const p = titikTerdekat(b, lastPos.lat, lastPos.lon);
      const d = haversine(lastPos.lat, lastPos.lon, p.lat, p.lon);
      const rot = Math.round(bearing(lastPos.lat, lastPos.lon, p.lat, p.lon));
      const mnt = Math.max(1, Math.round((d * FAKTOR_JALAN) / (KECEPATAN_MOTOR_KMH * 1000 / 60)));
      setSubNav('<svg class="narr" viewBox="0 0 24 24" style="transform:rotate(' + rot + 'deg)" aria-hidden="true"><path d="M12 3v18M12 3l-6 6M12 3l6 6" fill="none" stroke="#FE7A1B" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>' +
        fmtJarak(d) + (d < 40 ? ' <span class="sep">•</span> hampir sampai' : ' <span class="sep">•</span> ' + mnt + ' menit <span class="sep">•</span> Motor'));
    } else { setSubNav('<i class="gdot"></i>Mencari lokasi GPS…'); }
    if(petakLbl && !petakLbl._map && map) petakLbl.addTo(map);
    const stat = z
      ? '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px"><div class="stat cp"><span>Bangunan</span><b>' + (z[4] || 0).toLocaleString('id-ID') + '</b></div><div class="stat cp"><span>Toko terdaftar</span><b>' + (z[6] || 0) + '</b></div><div class="stat cp"><span>Disisir</span><b>' + teksKotak(n, N) + '</b></div></div>'
      : '<div class="stat cp"><span>Disisir</span><b>' + teksKotak(n, N) + '</b></div>';
    const bisaPandu = typeof pdTersedia === 'function' && pdTersedia() && !zonaAktif.manual;
    const sh = (typeof PD !== 'undefined' && PD.aktif)
      ? '<i class="grab"></i>' +
        '<button class="btn or" onclick="pdBerhenti()">' + ico('close', 'stroke-width:2.4') + 'Berhenti</button>' +
        '<button class="btn gh sm" onclick="bukaWizard()">' + ico('plus') + 'Catat temuan di sini</button>'
      : '<i class="grab"></i>' + stat + (z ? kartuPrediksiHtml(z) : '') +
        '<div class="banner warn cp" style="justify-content:flex-start">' + ico('info', 'width:16px;height:16px;color:var(--orange-ink)') + '<span>Kotak sisir muncul saat masuk zona</span></div>' +
        (bisaPandu ? '<button class="btn or" onclick="pdMulai()">' + ico('nav') + 'Gass ke petak</button>'
        : '<button class="btn or" onclick="navigasiAktif()">' + ico('nav') + 'Arahkan (Google Maps)</button>') +
        '<button class="btn gh sm" onclick="bukaWizard()">' + ico('plus') + 'Catat temuan</button>';
    if(zs.dataset.sig !== sh){ zs.innerHTML = sh; zs.dataset.sig = sh; }
  }
}
function navigasiAktif(){
  if(!CENTER) return;
  try{ nat().bukaNavigasi(CENTER.lat, CENTER.lon, (zonaAktif && zonaAktif.z && zonaAktif.z[11]) || 'Zona'); }catch(e){ bukaMaps(CENTER.lat, CENTER.lon); }
}

/* ---------- popup prospek (diam lama di dalam petak) ---------- */
function cekPopupProspek(lat, lon, t, acc){
  if(!zonaAktif || !map || !insideZone(lat, lon)){ stillRef = null; askedThisStop = false; keluarRadius = 0; return; }
  if(screenAktif !== 'scrPeta') return;
  if(!stillRef){ stillRef = {lat: lat, lon: lon, t: t}; askedThisStop = false; keluarRadius = 0; return; }
  const radius = Math.max(RADIUS_DIAM_M, 2.5*(acc || 0));
  if(haversine(stillRef.lat, stillRef.lon, lat, lon) > radius){
    keluarRadius++;
    if(keluarRadius >= DEBOUNCE_KELUAR){ stillRef = {lat: lat, lon: lon, t: t}; askedThisStop = false; keluarRadius = 0; }
    return;
  }
  keluarRadius = 0;
  if(!askedThisStop && (t - stillRef.t) >= DIAM_POPUP_MS){ askedThisStop = true; tampilProspek(); }
}
function tampilProspek(){
  try{ const el = $('prospekPin'); if(el && window.SKYPET){ el.innerHTML = window.SKYPET.svg('pinpin', 5, {noFx: true}) + '<span class="qm">?</span>'; } }catch(e){}
  $('popupProspek').style.display = 'flex';
}
function jawabProspekYa(){ $('popupProspek').style.display = 'none'; bukaWizard(); }
function jawabProspekTidak(){ $('popupProspek').style.display = 'none'; }

/* ============================================================
   WIZARD CATAT TEMUAN (4 langkah)
   ============================================================ */
let W = null;
function wizBaru(){ return {step: 1, sudah: null, nama: '', ukuran: '', ke: '', grosir: '', belanja: '', hp: '', foto: null, fotoUrl: null, status: '', sub: '', catatan: '', err: {}, simpan: false}; }
/* ---- posisi untuk temuan: fix perekaman (≤3 mnt) atau GPS sekali-ambil (APK 1.2.2+, jalan walau perekaman mati) ---- */
const POS_TEMUAN_MAKS_MS = 180000;
let gpsSekali = null, gpsSekaliJalan = false;
function posTemuan(){
  const now = Date.now();
  const a = lastPos && (now - lastPos.t) <= POS_TEMUAN_MAKS_MS ? lastPos : null;
  const b = gpsSekali && (now - gpsSekali.t) <= POS_TEMUAN_MAKS_MS ? gpsSekali : null;
  if(a && b) return (b.t > a.t + 30000 || (b.acc || 99) < (a.acc || 99) - 10) ? b : a;
  return a || b || null;
}
function ambilGpsSekali(cb){
  if(gpsSekaliJalan || !navigator.geolocation) return;
  gpsSekaliJalan = true;
  try{
    navigator.geolocation.getCurrentPosition(p => {
      gpsSekaliJalan = false;
      gpsSekali = {lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy || 50, t: Date.now()};
      if(cb) cb();
    }, () => { gpsSekaliJalan = false; }, {enableHighAccuracy: true, timeout: 20000, maximumAge: 30000});
  }catch(e){ gpsSekaliJalan = false; }
}
/* dipanggil saat form temuan dibuka & tiap langkah: kalau fix perekaman tidak segar, ambil GPS sekali */
function siapkanGpsTemuan(){
  const now = Date.now();
  if(lastPos && (now - lastPos.t) <= 60000) return;
  if(gpsSekali && (now - gpsSekali.t) <= 60000) return;
  ambilGpsSekali(() => { if(W && screenAktif === 'scrTemuan') renderWiz(); });
}
function petakUntukTemuan(){
  const lastPos = posTemuan();
  if(zonaAktif && lastPos && screenAktif === 'scrPeta' && insideZone(lastPos.lat, lastPos.lon)){
    return {key: zonaAktif.key_petak, luar: false, label: zonaAktif.manual ? zonaAktif.kecamatan : (zonaAktif.z && zonaAktif.z[11]) || ('Petak ' + zonaAktif.key_petak)};
  }
  if(lastPos){
    const key = keyDari(Math.floor(lastPos.lon / S), Math.floor(lastPos.lat / S));
    const z = zonaList.find(q => keyDari(q[2], q[3]) === key);
    if(z) return {key: key, luar: false, label: z[11] || ('Petak ' + key)};
  }
  return {key: null, luar: true, label: 'Di luar petak penugasan'};
}
function bukaWizard(){
  if(!sesi) return;
  if(W && W.fotoUrl) URL.revokeObjectURL(W.fotoUrl);
  rdLepasFoto(); RD = null;
  W = wizBaru(); wizAktifDariLayar = screenAktif;
  $('popupProspek').style.display = 'none';
  tampil('scrTemuan'); renderWiz(); siapkanGpsTemuan();
}
function tutupWizard(){
  if(W && W.fotoUrl) URL.revokeObjectURL(W.fotoUrl);
  W = null;
  const balik = wizAktifDariLayar === 'scrPeta' && map && zonaAktif ? 'scrPeta' : 'scrMain';
  tampil(balik); if(balik === 'scrMain') bukaTab(tabAktif || 'beranda'); else renderPosisi(true);
}
function gpsChipHtml(){
  const lastPos = posTemuan();
  if(!lastPos) return '<span class="prio pC">GPS: menunggu sinyal…</span>';
  const a = lastPos.acc != null ? Math.round(lastPos.acc) : null;
  return '<span class="prio' + (a != null && a > 30 ? '' : ' pC') + '">GPS ±' + (a == null ? '?' : a) + ' m</span>';
}
function wizHead(judul, sub){
  const kembali = W.step === 1 ? 'tutupWizard()' : 'wizBack()';
  const st = i => i < W.step ? 'done' : (i === W.step ? 'cur' : '');
  return '<div class="wizhead"><div class="row"><button type="button" class="ibtn" onclick="' + kembali + '" aria-label="' + (W.step === 1 ? 'Tutup tanpa menyimpan' : 'Kembali') + '">' + ico(W.step === 1 ? 'close' : 'back') + '</button>' +
    '<div class="col" style="flex:1;min-width:0;gap:2px"><b style="font-size:17px">' + judul + '</b><span class="muted" style="font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + sub + '</span></div><span class="mono muted" style="font-size:13px">' + W.step + '/4</span></div>' +
    '<div class="steps" aria-label="Langkah ' + W.step + ' dari 4"><i class="' + st(1) + '"></i><i class="' + st(2) + '"></i><i class="' + st(3) + '"></i><i class="' + st(4) + '"></i></div></div>';
}
function wizFoot(label, aksi, dis){
  return '<div class="wizfoot">' + (W.step > 1 ? '<button type="button" class="btn gh" style="flex:1" onclick="wizBack()">Kembali</button>' : '') +
    '<button type="button" class="btn or" style="flex:2" id="wizBtn" onclick="' + aksi + '"' + (dis ? ' disabled' : '') + '>' + label + '</button></div>';
}
function chipsHtml(field, vals){
  return vals.map(v => '<button type="button" class="chip' + (W[field] === v ? ' on' : '') + '" onclick="wizPilih(this,\'' + field + '\',\'' + v.replace(/'/g, "\\'") + '\')">' + esc(v) + '</button>').join('');
}
function wizPilih(btn, field, val){
  W[field] = val; W.err[field] = false;
  (btn.closest('[data-f]') || btn.parentElement).querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
  const e = btn.closest('[data-f]'); if(e){ const er = e.querySelector('.err'); if(er) er.style.display = 'none'; }
}
function renderWiz(){
  if(!W) return;
  const pt = petakUntukTemuan(), E = W.err, body = $('wizBody');
  const oldScroll = $('wizScroll') ? $('wizScroll').scrollTop : 0, sameStep = body.dataset.step === String(W.step);
  const lokasiSub = esc(pt.label) + ' · ' + wibJam();
  let h = '';
  if(W.step === 1){
    const opt = (val, t, d, ic) => '<button type="button" class="opt1' + (W.sudah === val ? ' on' : '') + '" onclick="wizSudah(\'' + val + '\')"><span class="bx">' + ico(ic, 'width:26px;height:26px') + '</span><span class="col" style="gap:3px"><b style="font-size:17px">' + t + '</b><span class="muted" style="font-size:13px">' + d + '</span></span></button>';
    h = wizHead('Catat temuan', lokasiSub) +
      '<div class="scrollY" id="wizScroll" style="padding:22px 20px;display:flex;flex-direction:column;gap:16px"><h1 style="font-size:25px;font-weight:800;line-height:1.2">Apakah toko ini sudah didatangi sales Nabati?</h1>' +
      '<p class="muted" style="font-size:15px">Tanyakan ke pemilik toko.</p>' +
      opt('ya', 'Sudah ada sales Nabati', 'Dicatat cepat, tanpa foto', 'check') + opt('tidak', 'Belum ada · calon toko baru', 'Isi data toko, foto, dan hasil', 'store') +
      '<div class="row" style="gap:8px;flex-wrap:wrap">' + gpsChipHtml() + (pt.luar ? '<span class="prio man">Di luar petak · tetap bisa dicatat</span>' : '') + '</div></div>' +
      wizFoot(W.sudah === 'ya' ? 'Simpan cepat' : 'Lanjut', W.sudah === 'ya' ? 'wizCepat()' : 'wizNext()', !W.sudah);
  } else if(W.step === 2){
    h = wizHead('Data toko', 'Calon toko baru · ' + esc(pt.label)) +
      '<div class="scrollY" id="wizScroll" style="padding:18px 20px;display:flex;flex-direction:column;gap:18px">' +
      '<label class="col" style="gap:7px" data-f="nama"><span class="lbl">Nama toko <span class="req">wajib</span></span><input class="in' + (E.nama ? ' bad' : '') + '" value="' + esc(W.nama) + '" placeholder="Contoh: Toko Berkah Jaya" oninput="W.nama=this.value" autocomplete="off">' + (E.nama ? '<span class="err">Isi nama tokonya</span>' : '') + '</label>' +
      '<div class="col" style="gap:7px" data-f="ukuran"><span class="lbl">Ukuran toko <span class="req">wajib</span></span><div class="col" style="gap:8px"><div class="sz">' + [['RT-L', 'Large'], ['RT-M', 'Medium'], ['RT-S', 'Small']].map(v => '<button type="button" class="' + (W.ukuran === v[0] ? 'on' : '') + '" onclick="wizPilih(this,\'ukuran\',\'' + v[0] + '\')"><b>' + v[0] + '</b><span>' + v[1] + '</span></button>').join('') + '</div><div class="sz two">' + [['SG', 'Semi Grosir'], ['GR', 'Grosir']].map(v => '<button type="button" class="' + (W.ukuran === v[0] ? 'on' : '') + '" onclick="wizPilih(this,\'ukuran\',\'' + v[0] + '\')"><b>' + v[0] + '</b><span>' + v[1] + '</span></button>').join('') + '</div></div>' + (E.ukuran ? '<span class="err">Pilih ukuran toko</span>' : '') + '</div>' +
      '<div class="col" style="gap:7px" data-f="ke"><span class="lbl">Biasanya belanja ke mana? <span class="req">wajib</span></span><div class="row" style="gap:8px;flex-wrap:wrap">' + chipsHtml('ke', ['Pasar', 'Toko grosir', 'Lainnya']) + '</div>' + (E.ke ? '<span class="err">Pilih salah satu</span>' : '') + '</div>' +
      '<label class="col" style="gap:7px" data-f="grosir"><span class="lbl">Nama pasar / grosirnya <span class="req">wajib</span></span><input class="in' + (E.grosir ? ' bad' : '') + '" value="' + esc(W.grosir) + '" placeholder="Contoh: Pasar Guntur Ciawitali" oninput="W.grosir=this.value" autocomplete="off">' + (E.grosir ? '<span class="err">Isi nama pasar atau grosir langganannya</span>' : '') + '</label>' +
      '<label class="col" style="gap:7px" data-f="belanja"><span class="lbl">Perkiraan belanja Nabati per bulan (Rp) <span class="req">wajib</span></span><input class="in mono' + (E.belanja ? ' bad' : '') + '" type="number" inputmode="numeric" min="0" value="' + esc(W.belanja) + '" placeholder="Contoh: 500000" oninput="W.belanja=this.value;var p=document.getElementById(\'rpPrev\');if(p)p.textContent=this.value===\'\'?\'\':fmtRp(+this.value)"><span class="muted" id="rpPrev" style="font-size:12.5px">' + (W.belanja !== '' ? fmtRp(+W.belanja) : '') + '</span>' + (E.belanja ? '<span class="err">Isi perkiraan belanja (boleh 0)</span>' : '') + '</label>' +
      '<label class="col" style="gap:7px"><span class="lbl">No HP pemilik <span class="opt">opsional</span></span><input class="in mono" type="tel" inputmode="tel" value="' + esc(W.hp) + '" placeholder="08xx xxxx xxxx" oninput="W.hp=this.value"></label></div>' +
      wizFoot('Lanjut ke foto', 'wizNext()');
  } else if(W.step === 3){
    const st = (val, t, d) => '<button type="button" class="rad' + (W.status === val ? ' on' : '') + '" onclick="wizStatus(this,\'' + val + '\')"><span class="dt"></span><span class="col"><b style="font-size:16px">' + t + '</b><span class="muted" style="font-size:12px">' + d + '</span></span></button>';
    h = wizHead('Foto & hasil kunjungan', esc(W.nama || 'Toko')) +
      '<div class="scrollY" id="wizScroll" style="padding:14px 20px;display:flex;flex-direction:column;gap:12px">' +
      '<div id="wizFoto" data-f="foto"></div>' +
      '<span class="lbl">Hasil kunjungan <span class="req">wajib</span></span>' +
      '<div class="col" style="gap:8px" data-f="status">' + st('lanjut_noo', 'Lanjut NOO', 'Pemilik setuju jadi toko baru') + st('nanti_dikunjungi', 'Nanti dikunjungi lagi', 'Jadwalkan kunjungan ulang') + st('tidak_tertarik', 'Tidak tertarik', 'Catat alasannya') + (E.status ? '<span class="err">Pilih hasil kunjungan</span>' : '') + '</div>' +
      '<div class="col" style="gap:8px;display:' + (W.status === 'nanti_dikunjungi' ? 'flex' : 'none') + '" id="subNantiWrap" data-f="sub"><span class="lbl">Perkiraan kunjungan lagi</span><div class="row" style="gap:8px;flex-wrap:wrap">' +
        [['1_minggu', 'Seminggu lagi'], ['2_minggu', '2 minggu lagi']].map(v => '<button type="button" class="chip' + (W.sub === v[0] ? ' on' : '') + '" onclick="wizPilih(this,\'sub\',\'' + v[0] + '\')">' + v[1] + '</button>').join('') + '</div>' + (E.sub && W.status === 'nanti_dikunjungi' ? '<span class="err">Pilih salah satu</span>' : '') + '</div>' +
      '<div class="col" style="gap:8px;display:' + (W.status === 'tidak_tertarik' ? 'flex' : 'none') + '" id="subTidakWrap" data-f="sub"><span class="lbl">Alasan tidak tertarik</span><div class="row" style="gap:8px;flex-wrap:wrap">' +
        [['grosir_saja', 'Beli di grosir saja'], ['order_kecil', 'Order <100rb']].map(v => '<button type="button" class="chip' + (W.sub === v[0] ? ' on' : '') + '" onclick="wizPilih(this,\'sub\',\'' + v[0] + '\')">' + v[1] + '</button>').join('') + '</div>' + (E.sub && W.status === 'tidak_tertarik' ? '<span class="err">Pilih salah satu</span>' : '') + '</div>' +
      '<button type="button" id="katalogBtn" onclick="bukaKatalog()" style="display:' + (W.status === 'lanjut_noo' ? 'flex' : 'none') + ';gap:12px;align-items:center;border:0;border-radius:16px;padding:12px 14px;background:var(--navy);color:#fff;text-align:left;min-height:56px">' + ico('book', 'color:#FE7A1B') + '<span style="flex:1"><b style="font-size:14px">Tunjukkan katalog Nabati</b><br><span style="font-size:12px;color:#C9D0DE">Opsional · tidak memotong form</span></span>' + ico('chev') + '</button>' +
      '<label class="col" style="gap:7px"><span class="lbl">Catatan <span class="opt">opsional</span></span><textarea rows="2" class="in" style="resize:none" oninput="W.catatan=this.value">' + esc(W.catatan) + '</textarea></label></div>' +
      wizFoot('Lanjut ke ringkasan', 'wizNext()');
  } else {
    const HASIL = {lanjut_noo: 'Lanjut NOO', nanti_dikunjungi: 'Nanti dikunjungi lagi', tidak_tertarik: 'Tidak tertarik'};
    const SUB = {'1_minggu': 'seminggu lagi', '2_minggu': '2 minggu lagi', grosir_saja: 'beli di grosir saja', order_kecil: 'order <100rb'};
    const noo = W.status === 'lanjut_noo';
    h = wizHead('Cek & simpan', esc(W.nama || 'Toko')) +
      '<div class="scrollY" id="wizScroll" style="padding:14px 20px;display:flex;flex-direction:column;gap:12px">' +
      (W.fotoUrl ? '<div class="photo has"><img src="' + W.fotoUrl + '" alt="Foto toko"></div>' : '') +
      '<div class="card" style="padding:4px 16px">' +
      '<div class="sumrow"><span>Lokasi</span><b>' + esc(pt.label) + '</b></div><div class="sumrow"><span>Nama toko</span><b>' + esc(W.nama) + '</b></div>' +
      '<div class="sumrow"><span>Ukuran</span><b>' + esc(W.ukuran) + '</b></div><div class="sumrow"><span>Belanja ke</span><b>' + esc(W.ke) + ' · ' + esc(W.grosir) + '</b></div>' +
      '<div class="sumrow"><span>Belanja Nabati</span><b>' + fmtRp(+W.belanja) + ' / bln</b></div>' + (W.hp ? '<div class="sumrow"><span>No HP</span><b>' + esc(W.hp) + '</b></div>' : '') +
      '<div class="sumrow"><span>Hasil</span><b>' + (HASIL[W.status] || '-') + (SUB[W.sub] ? ' · ' + SUB[W.sub] : '') + '</b></div>' +
      (W.catatan ? '<div class="sumrow"><span>Catatan</span><b>' + esc(W.catatan) + '</b></div>' : '') + '</div>' +
      (noo ? (posTemuan() ? '<div class="banner ok" style="justify-content:flex-start">' + ico('check', 'width:18px;height:18px') + '<span>NOO sah: ada foto dan lokasi GPS' + (pt.luar ? ' (di luar petak tetap dihitung)' : '') + '.</span></div>' : '<div class="banner warn" style="justify-content:flex-start">' + ico('info', 'width:18px;height:18px') + '<span>Lokasi GPS belum didapat. NOO baru dihitung kalau ada foto <b>dan</b> GPS — tunggu sebentar sebelum menyimpan.</span></div>') : '') +
      (pt.luar ? '<div class="banner ok" style="justify-content:flex-start">' + ico('pin', 'width:18px;height:18px') + '<span>Titik ini di luar petak penugasanmu — tetap tersimpan dengan koordinat GPS.</span></div>' : '') + '</div>' +
      wizFoot(W.simpan ? 'Menyimpan…' : 'Simpan temuan', 'wizSimpan()', W.simpan);
  }
  body.innerHTML = h; body.dataset.step = String(W.step);
  if(W.step === 3) renderWizFoto();
  const sc = $('wizScroll'); if(sc && sameStep) sc.scrollTop = oldScroll;
}
function wizSudah(v){ W.sudah = v; renderWiz(); }
function wizBack(){ if(!W) return; if(W.step <= 1){ tutupWizard(); return; } W.step--; renderWiz(); }
function wizStatus(btn, val){
  const barulNoo = val === 'lanjut_noo' && W.status !== 'lanjut_noo';
  W.status = val; W.err.status = false; if(val === 'lanjut_noo') W.sub = ''; else W.sub = '';
  btn.parentElement.querySelectorAll('.rad').forEach(b => b.classList.toggle('on', b === btn));
  $('subNantiWrap').style.display = val === 'nanti_dikunjungi' ? 'flex' : 'none';
  $('subTidakWrap').style.display = val === 'tidak_tertarik' ? 'flex' : 'none';
  $('katalogBtn').style.display = val === 'lanjut_noo' ? 'flex' : 'none';
  document.querySelectorAll('#subNantiWrap .chip, #subTidakWrap .chip').forEach(b => b.classList.remove('on'));
  const er = btn.parentElement.querySelector('.err'); if(er) er.style.display = 'none';
  if(barulNoo) bukaKatalog();   // katalog langsung muncul begitu pemilik setuju (tombol manual tetap ada)
}
function wizNext(){
  const E = {};
  siapkanGpsTemuan();
  if(W.step === 1){ if(!W.sudah) return; W.step = 2; renderWiz(); return; }
  if(W.step === 2){
    if(!W.nama.trim()) E.nama = true;
    if(!W.ukuran) E.ukuran = true;
    if(!W.ke) E.ke = true;
    if(!W.grosir.trim()) E.grosir = true;
    if(W.belanja === '' || isNaN(parseFloat(W.belanja)) || parseFloat(W.belanja) < 0) E.belanja = true;
    W.err = E;
    if(Object.keys(E).length){ renderWiz(); toast('Lengkapi dulu kolom yang bertanda merah', 2600); const f = document.querySelector('#wizBody .in.bad, #wizBody .err'); if(f && f.scrollIntoView) f.scrollIntoView({block: 'center'}); return; }
    W.step = 3; renderWiz(); return;
  }
  if(W.step === 3){
    if(!W.foto) E.foto = true;
    if(!W.status) E.status = true;
    if(W.status === 'nanti_dikunjungi' && !W.sub) E.sub = true;
    if(W.status === 'tidak_tertarik' && !W.sub) E.sub = true;
    W.err = E;
    if(Object.keys(E).length){
      renderWiz();
      toast(E.foto ? 'Foto toko wajib dilampirkan' : (E.status ? 'Pilih dulu hasil kunjungan' : 'Pilih salah satu pilihan di bawah hasil'), 2800);
      return;
    }
    W.step = 4; renderWiz(); return;
  }
}
function renderWizFoto(){
  const box = $('wizFoto'); if(!box) return;
  const bad = W.err && W.err.foto;
  box.innerHTML = W.foto
    ? '<div class="photo has"><img src="' + W.fotoUrl + '" alt="Foto toko"><button type="button" class="retake" onclick="ambilFoto()">' + ico('cam', 'width:16px;height:16px') + 'Ambil ulang</button></div>'
    : '<div class="fotoContoh"><div class="fc ok"><img src="img/contoh_foto_bagus.jpg" alt="Contoh foto bagus"><span><b>✓ Bagus</b>Tampak depan toko utuh, etalase & papan kelihatan</span></div>' +
      '<div class="fc no"><img src="img/contoh_foto_jelek.jpg" alt="Contoh foto kurang"><span><b>✗ Kurang</b>Terlalu dekat, cuma rak/produk</span></div></div>' +
      '<button type="button" class="photo' + (bad ? ' bad' : '') + '" onclick="ambilFoto()">' + ico('cam', 'width:34px;height:34px') + '<b>Ambil foto toko <span class="req">wajib</span></b><span style="font-size:12px;color:' + (bad ? '#9A3412' : 'var(--muted)') + '">' + (bad ? 'Foto toko wajib dilampirkan' : 'Lokasi & waktu ditempel otomatis') + '</span></button>';
}
function ambilFoto(){ $('fotoInput').click(); }
/* ---------- Viewer katalog: cubit zoom, geser, ketuk 2x (Pointer Events, tanpa library) ---------- */
const KAT = {s: 1, tx: 0, ty: 0, MAX: 5, ptr: new Map(), init: false, p0: null, last: null, fling: null, tapT: 0, tapX: 0, tapY: 0, moved: 0, down: 0, raf: 0};
function katDim(){
  const st = $('katStage'), c = $('katContent');
  return {W: st.clientWidth, H: st.clientHeight, cw: c.offsetWidth, ch: c.offsetHeight};
}
function katClamp(){
  const d = katDim(), w = d.cw * KAT.s, h = d.ch * KAT.s;
  KAT.tx = w <= d.W ? (d.W - w) / 2 : Math.min(0, Math.max(d.W - w, KAT.tx));
  KAT.ty = h <= d.H ? Math.max(0, (d.H - h) / 2) : Math.min(0, Math.max(d.H - h, KAT.ty));
}
function katApply(){
  katClamp();
  $('katContent').style.transform = 'translate3d(' + KAT.tx + 'px,' + KAT.ty + 'px,0) scale(' + KAT.s + ')';
  const d = katDim(), im = $('katContent').querySelectorAll('img');
  let pg = 1;
  if(im.length > 1){ const y2 = (im[1].offsetTop) * KAT.s + KAT.ty; if(y2 < d.H * 0.55) pg = 2; }
  $('katPg').textContent = KAT.s <= 1.05 ? 'Hal. 1-2' : 'Hal. ' + pg + '/2';
  $('katReset').style.display = KAT.s > 1.05 ? 'block' : 'none';
}
function katZoomAt(ns, cx, cy){   // zoom ke skala ns dengan titik (cx,cy) di stage tetap
  ns = Math.min(KAT.MAX, Math.max(1, ns));
  const k = ns / KAT.s;
  KAT.tx = cx - (cx - KAT.tx) * k; KAT.ty = cy - (cy - KAT.ty) * k; KAT.s = ns;
}
function katReset(){ KAT.s = 1; KAT.tx = 0; KAT.ty = 0; katApply(); }
function katStop(){ if(KAT.raf){ cancelAnimationFrame(KAT.raf); KAT.raf = 0; } KAT.fling = null; }
function katAnim(fn){ katStop(); const t0 = performance.now(); const step = now => { const t = Math.min(1, (now - t0) / 220); fn(1 - Math.pow(1 - t, 3)); katApply(); if(t < 1) KAT.raf = requestAnimationFrame(step); else KAT.raf = 0; }; KAT.raf = requestAnimationFrame(step); }
function katPos(e){ const r = $('katStage').getBoundingClientRect(); return {x: e.clientX - r.left, y: e.clientY - r.top}; }
function katMid(){ const a = [...KAT.ptr.values()]; return {x: (a[0].x + a[1].x) / 2, y: (a[0].y + a[1].y) / 2, d: Math.hypot(a[0].x - a[1].x, a[0].y - a[1].y) || 1}; }
function katInit(){
  if(KAT.init) return; KAT.init = true;
  const st = $('katStage');
  st.addEventListener('pointerdown', e => {
    katStop(); try{ st.setPointerCapture(e.pointerId); }catch(_){}
    const p = katPos(e); KAT.ptr.set(e.pointerId, p);
    if(KAT.ptr.size === 1){ KAT.moved = 0; KAT.down = performance.now(); KAT.last = {x: p.x, y: p.y, t: KAT.down}; KAT.vx = 0; KAT.vy = 0; }
    if(KAT.ptr.size === 2){ const m = katMid(); KAT.p0 = {d: m.d, s: KAT.s, mx: m.x, my: m.y, cx: (m.x - KAT.tx) / KAT.s, cy: (m.y - KAT.ty) / KAT.s}; KAT.moved = 99; }
    e.preventDefault();
  });
  st.addEventListener('pointermove', e => {
    if(!KAT.ptr.has(e.pointerId)) return;
    const p = katPos(e), prev = KAT.ptr.get(e.pointerId); KAT.ptr.set(e.pointerId, p);
    if(KAT.ptr.size >= 2 && KAT.p0){
      const m = katMid(), ns = Math.min(KAT.MAX, Math.max(1, KAT.p0.s * m.d / KAT.p0.d));
      KAT.s = ns; KAT.tx = m.x - KAT.p0.cx * ns; KAT.ty = m.y - KAT.p0.cy * ns; katApply();
    } else if(KAT.ptr.size === 1){
      const dx = p.x - prev.x, dy = p.y - prev.y; KAT.moved += Math.abs(dx) + Math.abs(dy);
      KAT.tx += dx; KAT.ty += dy; katApply();
      const now = performance.now(), dt = Math.max(1, now - KAT.last.t);
      KAT.vx = 0.8 * KAT.vx + 0.2 * (p.x - KAT.last.x) / dt; KAT.vy = 0.8 * KAT.vy + 0.2 * (p.y - KAT.last.y) / dt; KAT.last = {x: p.x, y: p.y, t: now};
    }
    e.preventDefault();
  });
  const up = e => {
    if(!KAT.ptr.has(e.pointerId)) return;
    const p = KAT.ptr.get(e.pointerId); KAT.ptr.delete(e.pointerId);
    try{ st.releasePointerCapture(e.pointerId); }catch(_){}
    if(KAT.ptr.size === 1){   // dari 2 jari ke 1 jari: lanjut geser dengan jari yang tersisa
      const q = [...KAT.ptr.values()][0]; KAT.last = {x: q.x, y: q.y, t: performance.now()}; KAT.vx = 0; KAT.vy = 0; KAT.p0 = null; return;
    }
    if(KAT.ptr.size > 0) return;
    KAT.p0 = null;
    const now = performance.now();
    if(KAT.s < 1.04){ katAnim(f => { const s0 = KAT.s; KAT.s = s0 + (1 - s0) * f; }); }
    if(KAT.moved < 8 && now - KAT.down < 300){   // ketukan
      if(now - KAT.tapT < 320 && Math.hypot(p.x - KAT.tapX, p.y - KAT.tapY) < 40){
        KAT.tapT = 0;
        const s0 = KAT.s, tx0 = KAT.tx, ty0 = KAT.ty, target = s0 > 1.3 ? 1 : 2.5;
        katAnim(f => { KAT.s = s0; KAT.tx = tx0; KAT.ty = ty0; katZoomAt(s0 + (target - s0) * f, p.x, p.y); });
      } else { KAT.tapT = now; KAT.tapX = p.x; KAT.tapY = p.y; }
      return;
    }
    if(Math.abs(KAT.vx) > 0.25 || Math.abs(KAT.vy) > 0.25){   // momentum
      let vx = KAT.vx * 16, vy = KAT.vy * 16;
      const step = () => { vx *= 0.94; vy *= 0.94; KAT.tx += vx; KAT.ty += vy; katApply(); if(Math.abs(vx) > 0.3 || Math.abs(vy) > 0.3) KAT.raf = requestAnimationFrame(step); else KAT.raf = 0; };
      KAT.raf = requestAnimationFrame(step);
    }
  };
  st.addEventListener('pointerup', up); st.addEventListener('pointercancel', up); st.addEventListener('lostpointercapture', up);
  st.addEventListener('wheel', e => {   // desktop / pratinjau: roda = geser, Ctrl+roda = zoom
    e.preventDefault(); katStop(); const p = katPos(e);
    if(e.ctrlKey || e.metaKey) katZoomAt(KAT.s * Math.exp(-e.deltaY * 0.01), p.x, p.y); else { KAT.tx -= e.deltaX; KAT.ty -= e.deltaY; }
    katApply();
  }, {passive: false});
  st.addEventListener('dblclick', e => { if(e.pointerType) return; const p = katPos(e), s0 = KAT.s, tx0 = KAT.tx, ty0 = KAT.ty, target = s0 > 1.3 ? 1 : 2.5; katAnim(f => { KAT.s = s0; KAT.tx = tx0; KAT.ty = ty0; katZoomAt(s0 + (target - s0) * f, p.x, p.y); }); });
  window.addEventListener('resize', () => { if($('modalKatalog').style.display === 'flex') katApply(); });
  $('katContent').querySelectorAll('img').forEach(im => im.addEventListener('load', katApply));
}
function bukaKatalog(){
  katInit();
  document.querySelectorAll('#katContent img').forEach(img => { if(!img.getAttribute('src')) img.src = img.dataset.src; });
  $('modalKatalog').style.display = 'flex';
  KAT.s = 1; KAT.tx = 0; KAT.ty = 0; KAT.ptr.clear(); katStop(); katApply();
  requestAnimationFrame(katApply);
}
function tutupKatalog(){ katStop(); KAT.ptr.clear(); $('modalKatalog').style.display = 'none'; }

function dasarTemuan(pt){
  const lastPos = posTemuan();
  return {id: uuid(), key_petak: pt.key,
    lat: lastPos ? lastPos.lat : null, lon: lastPos ? lastPos.lon : null,
    akurasi: lastPos && lastPos.acc != null ? Math.round(lastPos.acc) : null,
    ditemukan_grosir: 'form_baru', jumlah_toko_baru: 0, tanggal: new Date().toISOString()};
}
async function wizCepat(){
  const pt = petakUntukTemuan();
  const p = dasarTemuan(pt); p.status_tindak_lanjut = 'sudah_dicover';
  try{
    await obPut({id: 't_' + p.id, tipe: 'temuan', kode: sesi.kode, t: Date.now(), tries: 0, payload: p, foto: null});
    tlUpsert({id: p.id, nama: '', st: 'sudah_dicover', t: Date.now(), key: pt.key, uk: null, luar: pt.luar, kirim: false, d: {lat: p.lat, lon: p.lon, acc: p.akurasi, lbl: pt.label, foto: false}});
    await hitungOutbox(); toast('Tercatat: toko sudah dicover sales Nabati'); prosesOutbox();
  }catch(e){ toast('Gagal menyimpan: ' + e.message, 4000); return; }
  tutupWizard();
}
async function wizSimpan(){
  if(!W || W.simpan) return;
  const pt = petakUntukTemuan();
  if(W.status === 'lanjut_noo' && !posTemuan()){
    if(!(await dialogSL({ikon: 'gps', judul: 'GPS belum didapat', teks: 'Temuan ini TIDAK dihitung sebagai NOO sah (NOO butuh foto dan GPS). Tunggu sebentar di lokasi supaya GPS dapat, atau tetap simpan sekarang.', ok: 'Tetap simpan', batal: 'Tunggu GPS'}))) return;
  }
  W.simpan = true; renderWiz();
  try{
    const p = dasarTemuan(pt);
    Object.assign(p, {nama_toko: W.nama.trim(), ukuran_toko: W.ukuran, belanja_kemana: W.ke, nama_grosir_pasar: W.grosir.trim(), rata_belanja_nabati: parseFloat(W.belanja),
      no_hp: W.hp.trim() || null, status_tindak_lanjut: W.status,
      jadwal_kunjung_lagi: W.status === 'nanti_dikunjungi' ? W.sub : null,
      alasan_tidak_tertarik: W.status === 'tidak_tertarik' ? W.sub : null, catatan: W.catatan.trim() || null});
    await obPut({id: 't_' + p.id, tipe: 'temuan', kode: sesi.kode, t: Date.now(), tries: 0, payload: p, foto: W.foto});
    tlUpsert({id: p.id, nama: p.nama_toko, st: W.status, t: Date.now(), key: pt.key, uk: W.ukuran, luar: pt.luar, kirim: false,
      d: {ke: p.belanja_kemana, gr: p.nama_grosir_pasar, bl: p.rata_belanja_nabati, hp: p.no_hp, jd: p.jadwal_kunjung_lagi, al: p.alasan_tidak_tertarik, cat: p.catatan, lat: p.lat, lon: p.lon, acc: p.akurasi, lbl: pt.label, foto: true}});
    await hitungOutbox();
    const noo = W.status === 'lanjut_noo' && !!p.lat;
    try{ tutupKatalog(); }catch(e){}
    tutupWizard();
    toast(noo ? 'Temuan tersimpan — Lanjut NOO! (terkirim otomatis)' : 'Temuan tersimpan (terkirim otomatis)', 3600);
    if(noo && typeof petSetelahNoo === 'function') petSetelahNoo();
    prosesOutbox();
  }catch(e){ if(W){ W.simpan = false; renderWiz(); } toast('Gagal menyimpan: ' + e.message, 4200); }
}

async function ambilAlamatBalik(lat, lon){
  try{
    const r = await fetchTO('https://nominatim.openstreetmap.org/reverse?format=json&lat=' + lat + '&lon=' + lon + '&zoom=18&addressdetails=1', {headers: {'Accept-Language': 'id'}}, 4000);
    if(r.ok){ const j = await r.json(); if(j && j.display_name) return j.display_name; }
  }catch(e){}
  return null;
}
async function buatFotoBerwatermark(file){
  const img = await new Promise((res, rej) => { const im = new Image(); im.onload = () => res(im); im.onerror = rej; im.src = URL.createObjectURL(file); });
  const MAX = 1600; let w = img.width, h = img.height;
  if(w > MAX || h > MAX){ const sk = MAX/Math.max(w, h); w = Math.round(w*sk); h = Math.round(h*sk); }
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, w, h);
  const pp = posTemuan(), lat = pp ? pp.lat : null, lon = pp ? pp.lon : null, acc = pp ? pp.acc : null;
  const now = new Date();
  const namaToko = (W && W.nama.trim()) || '-';
  let alamat = 'Alamat tidak tersedia (lat/lon saja)';
  if(lat != null){ const a = await ambilAlamatBalik(lat, lon); if(a) alamat = a; }
  const pt = petakUntukTemuan();
  const barH = Math.max(190, Math.round(cv.height*0.17)), barY = cv.height - barH;
  ctx.fillStyle = 'rgba(0,0,0,0.55)'; ctx.fillRect(0, barY, cv.width, barH);
  const pad = Math.round(cv.width*0.03), base = Math.max(16, Math.round(cv.width/45));
  ctx.textBaseline = 'top'; let ty = barY + pad*0.6;
  ctx.fillStyle = '#fff'; ctx.font = 'bold ' + (base+4) + 'px sans-serif'; ctx.fillText(namaToko, pad, ty); ty += base + 10;
  ctx.font = base + 'px sans-serif';
  const maxW = cv.width - pad*2, words = alamat.split(' '); let line = '', lines = [];
  for(const wd of words){ const test = line ? line + ' ' + wd : wd; if(ctx.measureText(test).width > maxW && line){ lines.push(line); line = wd; } else line = test; }
  if(line) lines.push(line);
  lines.slice(0, 2).forEach(l => { ctx.fillText(l, pad, ty); ty += base + 6; });
  ctx.fillStyle = '#ffe082';
  ctx.fillText(lat != null ? ('Lat ' + lat.toFixed(6) + ', Lon ' + lon.toFixed(6) + ' (akurasi ' + (acc != null ? Math.round(acc) : '-') + ' m)') : 'Lat/Lon tidak tersedia', pad, ty); ty += base + 6;
  ctx.fillStyle = '#fff';
  ctx.fillText(now.toLocaleDateString('id-ID', {weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'}) + '  ' + now.toLocaleTimeString('id-ID') + ' WIB', pad, ty); ty += base + 6;
  ctx.fillStyle = '#90caf9';
  ctx.fillText((pt.key != null ? 'Petak ' + pt.key : 'Di luar petak') + ' · ' + sesi.kode + ' - ' + namaBersih(sesi.nama), pad, ty);
  const blob = await new Promise(res => cv.toBlob(res, 'image/jpeg', 0.72));
  URL.revokeObjectURL(img.src);
  return blob;
}
async function onPhoto(input){
  const f = input.files && input.files[0] ? input.files[0] : null; if(!f || !W) return;
  const box = $('wizFoto'); if(box) box.innerHTML = '<div class="photo"><b>Memproses foto…</b></div>';
  let blob;
  try{ blob = await buatFotoBerwatermark(f); }catch(e){ blob = f; }
  if(!W){ input.value = ''; return; }
  if(W.fotoUrl) URL.revokeObjectURL(W.fotoUrl);
  W.foto = blob; W.fotoUrl = URL.createObjectURL(blob); W.err.foto = false;
  input.value = '';
  renderWizFoto();
}

/* ============================================================
   AREA UJI (khusus depot TESTING)
   ============================================================ */
function bukaModalManual(){ $('manualNama').value = ''; $('modalManualBackdrop').style.display = 'flex'; }
function tutupModalManual(){ $('modalManualBackdrop').style.display = 'none'; }
async function submitAreaManual(){
  const nama = $('manualNama').value.trim();
  if(!nama){ toast('Isi dulu nama areanya', 3000); return; }
  if(!lastPos){ toast('Lokasi GPS belum didapat — tunggu sebentar lalu coba lagi', 3800); return; }
  const btn = $('manualSubmitBtn'); btn.disabled = true; btn.textContent = 'Menyimpan…';
  const H = 0.00075, lat = lastPos.lat, lon = lastPos.lon;
  const geojson = {type: 'Polygon', coordinates: [[[lon-H, lat-H], [lon+H, lat-H], [lon+H, lat+H], [lon-H, lat+H], [lon-H, lat-H]]]};
  try{
    const r = await fetchTO(SUPABASE_URL + '/rest/v1/manual_areas', {method: 'POST', headers: hdr({'Content-Type': 'application/json', 'Prefer': 'return=representation'}),
      body: JSON.stringify({depot_id: 'TESTING', kode_salesman: sesi.kode, drawn_by: sesi.kode, name: nama, reason: 'area uji dibuat di HP', geojson: geojson})});
    if(!r.ok) throw new Error('HTTP ' + r.status);
    const j = await r.json(); tutupModalManual(); toast('Area uji dibuat');
    bukaAreaManual(j[0] || {id: uuid(), name: nama, reason: '', geojson: geojson});
  }catch(e){ toast('Gagal membuat area: ' + e.message, 4200); }
  finally{ btn.disabled = false; btn.textContent = 'Buat & buka'; }
}

/* ============================================================
   EVENT DARI ANDROID + TOMBOL BACK + START
   ============================================================ */
window.onNativeEvent = function(n){
  if(n === 'ui_siap'){ toast('Versi baru tampilan sudah diunduh. Aktif saat app dibuka lagi.', 4200); if(typeof tabAktif !== 'undefined' && tabAktif === 'akun' && sesi) renderAkun(); return; }
  if(n === 'ui_apk'){ toast('Ada pembaruan besar: pasang APK terbaru dari tim.', 5000); if(typeof tabAktif !== 'undefined' && tabAktif === 'akun' && sesi) renderAkun(); return; }
  if(n === 'izin' || n === 'resume'){
    segarkanLayarAktif();
    pollFix(); if(sesi){ prosesOutbox(); if(n === 'resume') muatRingkasan(false); }
  }
};
window.onBackNative = function(){
  if(dialogSL.buka){ dialogSL.buka(); return true; }
  if($('apiNoo')){ $('apiNoo').click(); return true; }
  if($('petSheet') && $('petSheet').classList.contains('show')){ petTutup(); return true; }
  if($('modalKatalog').style.display === 'flex'){ tutupKatalog(); return true; }
  if($('popupProspek').style.display === 'flex'){ jawabProspekTidak(); return true; }
  if($('modalManualBackdrop').style.display === 'flex'){ tutupModalManual(); return true; }
  if(screenAktif === 'scrTemuan'){ if(!W && RD){ tutupDetailTemuan(); return true; } wizBack(); return true; }
  if(screenAktif === 'scrPeta'){ if($('searchTokoPanel').style.display === 'block'){ toggleSearchToko(); return true; } kembaliKeDaftar(); return true; }
  if(screenAktif === 'scrSetuju' && sesi){ return false; }
  if(screenAktif === 'scrMain' && tabAktif !== 'beranda'){ bukaTab('beranda'); return true; }
  return false;   // layar paling depan: app cuma disembunyikan (perekaman tetap jalan)
};
document.addEventListener('visibilitychange', () => { if(!document.hidden){ pollFix(); if(sesi){ prosesOutbox(); muatRingkasan(false); } segarkanLayarAktif(); } });
window.addEventListener('online', () => { if(sesi){ prosesOutbox(); muatRingkasan(false); } });
setInterval(() => { if(sesi && !document.hidden) prosesOutbox(); }, 30000);

async function startApp(){
  tampil('scrDepot');
  await hitungOutbox();
  if(sesi && sesi.kode){
    depotAktif = sesi.depot;
    if(/^(AEPDA|GLKDA)\b/i.test(String(sesi.nama || '').trim())){ try{ nat().berhenti(); }catch(e){} sesi = null; lsDel('sl2_sesi'); toast('SkyLens 2.0 khusus sales GDKDA. Silakan pilih nama lagi.', 4500); }
  }
  if(sesi && sesi.kode){
    // validasi diam-diam: kalau kode sudah tidak aktif di server, paksa keluar
    try{ const j = await rpc('sales_login', {p_kode: sesi.kode}); if(j && !j.ok){ sesi = null; lsDel('sl2_sesi'); toast(j.error || 'Sesi tidak valid', 4000); } }catch(e){}
  }
  if(sesi && sesi.kode){ await siapkan(); } else { tampil('scrDepot'); }
  try{ if(ADA_NATIVE && Android.uiSehat) Android.uiSehat(); }catch(e){}   // lapor ke Android: tampilan ini berhasil start
}
