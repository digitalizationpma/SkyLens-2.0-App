/* Pinpin — maskot SkyLens di app sales.
   Dimuat SETELAH app.js (memakai: sesi, screenAktif, hitungRingkasan, hitungMisi, flameSvg, ico, esc, $, TARGET_NOO_HARIAN).
   API yang dipanggil app.js: petAtur, petRender, petBuka, petTutup, petTip, petSetelahNoo. */
(function(){
  'use strict';
  var M = window.SKYPET;
  var E = {senang: 1, sedih: 7, nangis: 10, joget: 11};
  var app = document.getElementById('app');
  var pet = document.getElementById('pet'), petIn = document.getElementById('petIn'), tipEl = document.getElementById('petTip');
  var sheet = document.getElementById('petSheet'), scrim = document.getElementById('petScrim');
  var hopper = document.getElementById('hopper');
  if(!M || !app || !pet) { window.petAtur = window.petRender = window.petBuka = window.petTutup = window.petTip = window.petSetelahNoo = function(){}; return; }

  // CSS bawaan modul maskot (animasi ekspresi)
  try{ var st = document.createElement('style'); st.textContent = M.css(); document.head.appendChild(st); }catch(e){}

  var SZ = 76, PAD = 6, TOP = 56;
  var KEY = 'sl2_pet';
  var fx = 1, fy = null;               // posisi sebagai pecahan lebar/tinggi (1 = mepet kanan); fy null = default (kanan bawah, di atas navigasi)
  var px = 0, py = 0, drag = null;
  var reaksi = null, reaksiTimer = null, tipTimer = null, moodTerakhir = null, lencanaTerakhir = null;
  try{ var s = JSON.parse(localStorage.getItem(KEY) || 'null'); if(s && isFinite(s.fx) && s.fy != null && isFinite(s.fy)){ fx = s.fx; fy = s.fy; } }catch(e){}

  function dim(){ return {W: app.clientWidth || 390, H: app.clientHeight || 800}; }
  function batasBawah(){
    var d = dim();
    var nav = (document.body.classList.contains('nonav')) ? 0 : 72;
    return d.H - nav - SZ - PAD;
  }
  function tempatkan(){
    var d = dim();
    px = Math.max(PAD, Math.min(d.W - SZ - PAD, px));
    py = Math.max(TOP, Math.min(batasBawah(), py));
    pet.style.transform = 'translate(' + px + 'px,' + py + 'px)';
  }
  function dariPecahan(){
    var d = dim();
    px = fx >= 0.5 ? d.W - SZ - PAD : PAD;
    py = fy == null ? batasBawah() - 8 : Math.round(fy * d.H);
    tempatkan();
  }
  function simpanPosisi(){
    var d = dim();
    fx = (px + SZ / 2) / d.W; fy = py / d.H;
    try{ localStorage.setItem(KEY, JSON.stringify({fx: fx, fy: fy})); }catch(e){}
  }

  function ringkas(){ try{ return hitungRingkasan(); }catch(e){ return {hari_ini: {temuan: 0, noo: 0, kotak: 0}, bulan_ini: {temuan: 0, noo: 0}, total_noo: 0, streak: 0, streak_nyala: false}; } }
  function senang(rk){ return (rk || ringkas()).hari_ini.noo > 0; }
  function mood(rk){ return reaksi != null ? reaksi : (senang(rk) ? E.senang : E.sedih); }
  function esk(x){ return (typeof esc === 'function') ? esc(x) : String(x); }
  function panelBuka(){ return sheet.classList.contains('show'); }

  /* ---------- pet mengambang ---------- */
  function renderPet(){
    var rk = ringkas(), h = senang(rk);
    var kunci = (h ? 1 : 0) + '|' + rk.streak + '|' + (rk.streak_nyala ? 1 : 0);
    if(kunci === moodTerakhir) return;
    moodTerakhir = kunci;
    petIn.innerHTML = M.svg('pinpin', h ? E.senang : E.sedih, {noFx: h});
    var b = document.getElementById('petBadge');
    b.innerHTML = flameSvg(h, '', 'width:11px;height:13px') + rk.streak;
    pet.setAttribute('aria-label', 'Pinpin, streak ' + rk.streak + ' hari. Ketuk untuk buka panel, geser untuk pindah');
  }

  /* ---------- gelembung omongan ---------- */
  function petTip(teks, ms){
    if(!pet || pet.style.display === 'none' || panelBuka()) return;
    tipEl.textContent = teks;
    var d = dim(), kiri = px + SZ / 2 < d.W / 2, lebar = Math.min(200, d.W - SZ - PAD * 3);
    tipEl.style.maxWidth = lebar + 'px';
    tipEl.style.left = ''; tipEl.style.right = '';
    tipEl.style.top = Math.max(TOP, Math.min(d.H - 150, py + 8)) + 'px';
    if(kiri){ tipEl.style.left = (px + SZ + 4) + 'px'; tipEl.style.transformOrigin = 'left center'; }
    else { tipEl.style.right = (d.W - px + 4) + 'px'; tipEl.style.transformOrigin = 'right center'; }
    tipEl.classList.add('show');
    clearTimeout(tipTimer); tipTimer = setTimeout(function(){ tipEl.classList.remove('show'); }, ms || 3200);
  }

  /* ---------- tampil / sembunyi ---------- */
  function petAtur(){
    var perlu = !!(typeof sesi !== 'undefined' && sesi) && (screenAktif === 'scrMain' || screenAktif === 'scrPeta') && !document.getElementById('sambut');
    var tadi = pet.style.display;
    pet.style.display = perlu ? 'block' : 'none';
    if(!perlu){ tipEl.classList.remove('show'); if(panelBuka()) petTutup(); }
    else if(tadi !== 'block'){ dariPecahan(); renderPet(); }
    else tempatkan();   // nav bisa berubah (peta tanpa nav)
  }

  /* ---------- seret + tempel ke tepi ---------- */
  pet.addEventListener('pointerdown', function(ev){
    try{ pet.setPointerCapture(ev.pointerId); }catch(e){}
    pet.classList.remove('snap');
    drag = {sx: ev.clientX, sy: ev.clientY, ox: px, oy: py, moved: false, lx: ev.clientX, vx: 0};
  });
  pet.addEventListener('pointermove', function(ev){
    if(!drag) return;
    var dx = ev.clientX - drag.sx, dy = ev.clientY - drag.sy;
    if(!drag.moved && Math.hypot(dx, dy) > 8){ drag.moved = true; pet.classList.add('drag'); tipEl.classList.remove('show'); }
    if(!drag.moved) return;
    var d = dim();
    px = Math.max(PAD, Math.min(d.W - SZ - PAD, drag.ox + dx));
    py = Math.max(TOP, Math.min(batasBawah(), drag.oy + dy));
    drag.vx = drag.vx * 0.7 + (ev.clientX - drag.lx) * 0.3; drag.lx = ev.clientX;
    petIn.style.transform = 'rotate(' + Math.max(-28, Math.min(28, drag.vx * 2.2)).toFixed(1) + 'deg) scale(1.08)';
    pet.style.transform = 'translate(' + px + 'px,' + py + 'px)';
  });
  function akhir(ev){
    if(!drag) return;
    var geser = drag.moved; drag = null;
    pet.classList.remove('drag'); petIn.style.transform = '';
    if(!geser){ petBuka(); return; }
    var d = dim();
    px = (px + SZ / 2 < d.W / 2) ? PAD : d.W - SZ - PAD;      // tempel ke kiri/kanan
    pet.classList.add('snap'); tempatkan(); simpanPosisi();
  }
  pet.addEventListener('pointerup', akhir);
  pet.addEventListener('pointercancel', function(){ if(!drag) return; drag.moved = true; akhir(); });
  pet.addEventListener('keydown', function(ev){ if(ev.key === 'Enter' || ev.key === ' '){ ev.preventDefault(); petBuka(); } });
  window.addEventListener('resize', function(){ if(pet.style.display === 'block') dariPecahan(); });

  /* ---------- panel ---------- */
  var CATATAN = [3, 7, 30, 100, 200];
  var CEK = '<svg viewBox="0 0 24 24" style="width:14px;height:14px" aria-hidden="true"><path d="m5 12 4.5 4.5L19 7" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  var GEMBOK = '<svg viewBox="0 0 24 24" style="width:13px;height:13px" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>';

  function renderBesar(boing){
    var rk = ringkas(), h = senang(rk), m = mood(rk), n = rk.hari_ini.noo;
    hopper.innerHTML = M.svg('pinpin', m);
    if(boing){ hopper.classList.remove('boing'); void hopper.offsetWidth; hopper.classList.add('boing'); }
    var baris = {};
    baris[E.sedih] = rk.streak > 0 && !rk.streak_nyala
      ? 'Belum ada NOO hari ini... streak ' + rk.streak + ' hari bisa putus nih.'
      : 'Belum ada NOO hari ini. Cari satu aja dulu, aku temenin!';
    baris[E.senang] = 'Mantap! ' + n + ' NOO hari ini. Streak aman, lanjut kejar target ya!';
    baris[E.nangis] = 'Huaaa... belum ada NOO. Ayo cari satu aja dulu, aku temenin!';
    baris[E.joget] = 'Yeay ' + n + ' NOO masuk! Joget dulu ah!';
    document.getElementById('pSay').textContent = baris[m] || '';
    document.getElementById('bigHit').setAttribute('aria-label', h ? 'Pinpin senang. Ketuk biar dia joget' : 'Pinpin sedih. Ketuk dan dia nangis');
  }

  function renderPanel(){
    var rk = ringkas(), h = senang(rk), mm;
    try{ mm = hitungMisi(); }catch(e){ mm = {misi: [], selesai: 0}; }
    var T = (typeof TARGET_NOO_HARIAN === 'number') ? TARGET_NOO_HARIAN : 3, n = rk.hari_ini.noo;
    var nama = (typeof sesi !== 'undefined' && sesi && typeof namaDepan === 'function') ? namaDepan(sesi.nama) : '';
    document.getElementById('petWho').textContent = 'SkyLens 2.0';
    document.getElementById('pStreak').textContent = rk.streak;
    document.getElementById('pTotal').textContent = rk.total_noo;
    document.getElementById('pStreakIco').innerHTML = flameSvg(rk.streak_nyala, 'flame' + (rk.streak_nyala ? '' : ' off'));
    document.getElementById('pStreakNote').textContent = rk.streak_nyala ? 'Streak hari ini sudah nyala' : 'Dapat NOO setiap hari';
    document.getElementById('pTodayNote').textContent = '+' + n + ' hari ini';
    var pct = Math.min(100, n / T * 100);
    document.getElementById('pBarFill').style.width = pct + '%';
    document.getElementById('pBarTxt').textContent = n + '/' + T + ' NOO hari ini';
    document.getElementById('pBarWrap').setAttribute('aria-label', n + ' dari ' + T + ' NOO hari ini');
    var _cap = document.getElementById('pBarCap'); _cap.style.display = (n < T && !h) ? 'none' : ''; _cap.textContent = n >= T ? 'Target harian tercapai. Pinpin bangga!' : (h ? 'Kurang ' + (T - n) + ' NOO lagi untuk target harian' : '');

    document.getElementById('pMissions').innerHTML = mm.misi.map(function(x, i){
      var tanda = x.done ? CEK : (x.kunci ? GEMBOK : '<b style="font-size:12px;color:#5E6678">' + (i + 1) + '</b>');
      var pil = '';
      if(x.kunci) pil = '<span class="pill2 n">' + esk(x.tag || 'Segera') + '</span>';
      else if(x.tL != null) pil = '<span class="pill2">RT-L ' + Math.min(x.aL, x.tL) + '/' + x.tL + '</span><span class="pill2 n">RT-S/M ' + Math.min(x.aM, x.tM) + '/' + x.tM + '</span>';
      var bar = (!x.kunci && x.p != null) ? '<div class="mini"><i style="width:' + Math.round(x.p * 100) + '%"></i></div>' : '';
      return '<div class="pms' + (x.kunci ? ' lock' : '') + '"><span class="pck' + (x.done ? ' done' : '') + '">' + tanda + '</span><div style="flex:1;min-width:0"><div class="t">' + x.teks + '</div>' +
        (pil ? '<div class="m">' + pil + '</div>' : '') + bar + '</div></div>';
    }).join('');
    var aktif = mm.misi.filter(function(x){ return !x.kunci; }).length;
    document.getElementById('pMisiCount').textContent = mm.selesai + '/' + aktif + ' selesai';

    document.getElementById('pBadges').innerHTML = CATATAN.map(function(d, i){
      return (i ? '<span class="dash"></span>' : '') + '<span class="bd">' + flameSvg(rk.streak >= d, '') + d + ' hari</span>';
    }).join('');
    renderBesar(false);
  }

  function petRender(){
    renderPet();
    if(panelBuka() && reaksi == null) renderPanel();
  }

  var bukaAt = 0;   // klik sintetis yang menyusul sentuhan (±300 ms) jatuh ke scrim & langsung menutup panel -> abaikan
  function petBuka(){
    bukaAt = Date.now();
    tipEl.classList.remove('show');
    renderPanel();
    scrim.classList.add('show'); sheet.classList.add('show'); sheet.setAttribute('aria-hidden', 'false');
    document.getElementById('petBody').scrollTop = 0;
    renderBesar(true);
    setTimeout(function(){ try{ document.getElementById('petClose').focus({preventScroll: true}); }catch(e){} }, 320);
  }
  function petTutup(){
    scrim.classList.remove('show'); sheet.classList.remove('show'); sheet.setAttribute('aria-hidden', 'true');
    hentikanReaksi();
  }
  function hentikanReaksi(){ clearTimeout(reaksiTimer); if(reaksi != null){ reaksi = null; renderBesar(false); } }

  document.getElementById('petClose').addEventListener('click', function(){ if(Date.now() - bukaAt > 500) petTutup(); });
  scrim.addEventListener('click', function(){ if(Date.now() - bukaAt > 500) petTutup(); });
  document.addEventListener('keydown', function(ev){ if(ev.key === 'Escape' && panelBuka()) petTutup(); });

  // ketuk Pinpin besar: joget kalau sudah ada NOO, nangis kalau belum
  document.getElementById('bigHit').addEventListener('click', function(){
    if(Date.now() - bukaAt < 500) return;
    clearTimeout(reaksiTimer);
    reaksi = senang() ? E.joget : E.nangis;
    renderBesar(true);
    reaksiTimer = setTimeout(function(){ reaksi = null; renderBesar(true); }, 3600);
  });

  function konfeti(){
    var c = document.getElementById('pConfetti'), warna = ['#FE7A1B', '#1F2C4F', '#FFC08F', '#FFFFFF', '#E2600C'], h = '';
    for(var i = 0; i < 46; i++){
      h += '<i style="left:' + (Math.random() * 100) + '%;background:' + warna[Math.floor(Math.random() * warna.length)] + ';--dx:' + Math.round(Math.random() * 120 - 60) + 'px;--r:' + Math.round(Math.random() * 720 - 360) + 'deg;animation-delay:' + (Math.random() * 0.35).toFixed(2) + 's;width:' + (6 + Math.random() * 5).toFixed(0) + 'px"></i>';
    }
    c.innerHTML = h;
    setTimeout(function(){ c.innerHTML = ''; }, 2400);
  }

  /* ---------- Pinpin berapi: layar penuh setelah NOO sah tersimpan ---------- */
  var apiTimer = null, apiCount = null;
  function apiCss(){
    if(document.getElementById('apiNooCss')) return;
    var st = document.createElement('style'); st.id = 'apiNooCss';
    st.textContent =
'#apiNoo{position:absolute;inset:0;z-index:2700;display:flex;align-items:center;justify-content:center;overflow:hidden;background:radial-gradient(ellipse at 50% 45%,rgba(40,24,18,.72) 0,rgba(12,16,28,.9) 70%);opacity:0;transition:opacity .28s;touch-action:manipulation;-webkit-tap-highlight-color:transparent}' +
'#apiNoo.on{opacity:1}' +
'#apiNoo .ni-stage{position:relative;width:300px;max-width:92%;display:flex;flex-direction:column;align-items:center;margin-top:-18px}' +
'#apiNoo .ni-title{font-size:27px;font-weight:800;color:#fff;letter-spacing:-.4px;text-shadow:0 2px 14px rgba(254,122,27,.7);opacity:0;transform:translateY(-14px) scale(.9)}' +
'#apiNoo.go .ni-title{animation:niTitle .55s .25s cubic-bezier(.2,1.4,.4,1) forwards}' +
'#apiNoo .ni-fw{position:relative;width:250px;height:290px;margin-top:6px}' +
'#apiNoo .ni-rays{position:absolute;left:50%;top:52%;width:720px;height:720px;margin:-360px 0 0 -360px;background:repeating-conic-gradient(from 0deg,rgba(255,196,96,.34) 0 5deg,rgba(255,196,96,0) 5deg 15deg);-webkit-mask-image:radial-gradient(circle,#000 8%,transparent 62%);mask-image:radial-gradient(circle,#000 8%,transparent 62%);opacity:0;pointer-events:none}' +
'#apiNoo.go .ni-rays{animation:niRays 1.2s .7s ease-out forwards,niSpin 22s linear infinite}' +
'#apiNoo .ni-glow{position:absolute;left:50%;top:55%;width:420px;height:420px;margin:-210px 0 0 -210px;background:radial-gradient(circle,rgba(255,150,40,.55) 0,rgba(254,122,27,.18) 45%,rgba(254,122,27,0) 70%);opacity:0;pointer-events:none}' +
'#apiNoo.go .ni-glow{animation:niGlow 1.4s .35s ease-out forwards,niPulse 1.6s 1.8s ease-in-out infinite}' +
'#apiNoo .ni-flame{position:absolute;left:0;right:0;bottom:0;height:100%;transform-origin:50% 92%;opacity:0;transform:scale(.12) rotate(-26deg) translateY(40px)}' +
'#apiNoo.go .ni-flame{animation:niIgnite 1.15s .1s cubic-bezier(.22,1.2,.36,1) forwards}' +
'#apiNoo .ni-flame svg{width:100%;height:100%;overflow:visible;display:block}' +
'#apiNoo .ni-f1{transform-origin:50% 96%;transform-box:fill-box}' +
'#apiNoo.go .ni-f1{animation:niFlick 1.05s 1.2s ease-in-out infinite alternate}' +
'#apiNoo .ni-f2{transform-origin:50% 96%;transform-box:fill-box}' +
'#apiNoo.go .ni-f2{animation:niFlick2 .8s 1.2s ease-in-out infinite alternate}' +
'#apiNoo .ni-pin{position:absolute;left:50%;bottom:48px;width:150px;height:150px;margin-left:-75px;opacity:0;transform:scale(.2)}' +
'#apiNoo .ni-pin svg{width:100%;height:100%;display:block;overflow:visible}' +
'#apiNoo.go .ni-pin{animation:niPin .6s .8s cubic-bezier(.2,1.5,.4,1) forwards}' +
'#apiNoo .ni-rib{position:relative;width:268px;height:70px;margin-top:-34px;opacity:0;transform:translateY(16px) scaleX(.4)}' +
'#apiNoo.go .ni-rib{animation:niRib .55s 1.0s cubic-bezier(.2,1.3,.4,1) forwards}' +
'#apiNoo .ni-rib svg{position:absolute;inset:0;width:100%;height:100%;filter:drop-shadow(0 6px 10px rgba(0,0,0,.35))}' +
'#apiNoo .ni-rtx{position:absolute;left:44px;right:44px;top:7px;bottom:12px;display:flex;align-items:center;justify-content:center;gap:9px;color:#fff}' +
'#apiNoo .ni-num{font-size:34px;font-weight:800;line-height:1;color:#FFC24A;font-variant-numeric:tabular-nums;text-shadow:0 2px 0 rgba(0,0,0,.25)}' +
'#apiNoo .ni-lbl{font-size:12px;font-weight:700;line-height:1.15;text-transform:uppercase;letter-spacing:.8px;text-align:left}' +
'#apiNoo .ni-sub{margin-top:12px;font-size:14px;font-weight:600;color:#FFE3C9;text-align:center;opacity:0;padding:0 18px}' +
'#apiNoo.go .ni-sub{animation:niFade .5s 1.5s ease-out forwards}' +
'#apiNoo .ni-sub b{color:#fff}' +
'#apiNoo .ni-hint{position:absolute;left:0;right:0;bottom:calc(130px + env(safe-area-inset-bottom,0px));text-align:center;font-size:12px;color:rgba(255,255,255,.55);opacity:0}' +
'#apiNoo.go .ni-hint{animation:niFade .5s 2s ease-out forwards}' +
'#apiNoo .ni-st{position:absolute;left:50%;top:56%;width:5px;height:34px;margin:-17px 0 0 -2.5px;border-radius:3px;background:linear-gradient(180deg,#FFD27A,rgba(255,210,122,0));opacity:0;transform-origin:50% 50%}' +
'#apiNoo.go .ni-st{animation:niStreak .9s var(--d,.5s) ease-out forwards}' +
'#apiNoo .ni-sp{position:absolute;width:var(--s,16px);height:var(--s,16px);opacity:0;transform:scale(0)}' +
'#apiNoo.go .ni-sp{animation:niSpark 1.5s var(--d,1s) ease-in-out infinite}' +
'#apiNoo .ni-conf{position:absolute;inset:0;pointer-events:none;overflow:hidden}' +
'#apiNoo .ni-conf i{position:absolute;top:-14px;border-radius:2px;opacity:0}' +
'#apiNoo.go .ni-conf i{animation:niConf 2.6s var(--d,1s) ease-in forwards}' +
'@keyframes niTitle{to{opacity:1;transform:none}}' +
'@keyframes niFade{to{opacity:1}}' +
'@keyframes niIgnite{0%{opacity:0;transform:scale(.12) rotate(-26deg) translateY(40px)}30%{opacity:1;transform:scale(.5) rotate(-16deg) translateY(10px)}65%{transform:scale(1.14) rotate(5deg) translateY(0)}85%{transform:scale(.97) rotate(-1.5deg)}100%{opacity:1;transform:scale(1) rotate(0)}}' +
'@keyframes niFlick{0%{transform:scale(1,1) skewX(0)}50%{transform:scale(.97,1.05) skewX(-2.2deg)}100%{transform:scale(1.02,.97) skewX(2deg)}}' +
'@keyframes niFlick2{0%{transform:scale(1,1) skewX(0)}100%{transform:scale(.94,1.1) skewX(3deg)}}' +
'@keyframes niPin{0%{opacity:0;transform:scale(.2)}100%{opacity:1;transform:scale(1)}}' +
'@keyframes niRib{to{opacity:1;transform:none}}' +
'@keyframes niRays{to{opacity:1}}' +
'@keyframes niSpin{to{transform:rotate(360deg)}}' +
'@keyframes niGlow{to{opacity:1}}' +
'@keyframes niPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.08)}}' +
'@keyframes niStreak{0%{opacity:0;transform:rotate(var(--a)) translateY(-40px) scaleY(.4)}25%{opacity:1}100%{opacity:0;transform:rotate(var(--a)) translateY(-170px) scaleY(1.2)}}' +
'@keyframes niSpark{0%,100%{opacity:0;transform:scale(0) rotate(0)}50%{opacity:1;transform:scale(1) rotate(45deg)}}' +
'@keyframes niConf{0%{opacity:0;transform:translateY(0) translateX(0) rotate(0)}10%{opacity:1}100%{opacity:1;transform:translateY(var(--h,640px)) translateX(var(--dx,0)) rotate(var(--r,360deg))}}' +
'@media (prefers-reduced-motion:reduce){#apiNoo *{animation:none!important}#apiNoo .ni-title,#apiNoo .ni-flame,#apiNoo .ni-pin,#apiNoo .ni-rib,#apiNoo .ni-sub,#apiNoo .ni-hint,#apiNoo .ni-rays,#apiNoo .ni-glow{opacity:1!important;transform:none!important}#apiNoo .ni-st,#apiNoo .ni-sp,#apiNoo .ni-conf{display:none}}';
    document.head.appendChild(st);
  }
  var NI_FLAME = '<svg viewBox="0 0 200 260" aria-hidden="true"><defs>' +
    '<linearGradient id="niG1" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFC24A"/><stop offset=".42" stop-color="#FF8A1F"/><stop offset="1" stop-color="#F04E00"/></linearGradient>' +
    '<linearGradient id="niG2" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFF3C4"/><stop offset="1" stop-color="#FFC95E"/></linearGradient></defs>' +
    '<g class="ni-f1"><path d="M100 4C104 44 142 62 156 108C172 160 150 246 100 252C50 246 28 160 44 108C50 90 60 80 66 62C72 76 78 82 84 80C80 54 92 30 100 4Z" fill="url(#niG1)"/>' +
    '<path d="M44 128C26 112 24 80 36 58C40 82 52 92 58 104Z" fill="#FF8A1F"/><path d="M156 124C176 108 178 78 166 56C160 80 150 92 144 104Z" fill="#FFA32E"/></g>' +
    '<g class="ni-f2"><path d="M100 64C108 98 140 116 140 164C140 204 120 236 100 236C80 236 60 204 60 164C60 116 92 98 100 64Z" fill="url(#niG2)"/></g></svg>';
  var NI_RIB = '<svg viewBox="0 0 268 70" preserveAspectRatio="none" aria-hidden="true"><path d="M0 14H30V56H0L12 35Z" fill="#141D38"/><path d="M268 14H238V56H268L256 35Z" fill="#141D38"/>' +
    '<path d="M22 6H246V58H22Z" fill="#1F2C4F"/><path d="M22 6H246V12H22Z" fill="#FE7A1B"/><path d="M22 52H246V58H22Z" fill="#FE7A1B"/></svg>';
  var NI_SPARK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 0C13 7 17 11 24 12C17 13 13 17 12 24C11 17 7 13 0 12C7 11 11 7 12 0Z" fill="#FFE9A8"/></svg>';

  function apiTutup(){
    clearTimeout(apiTimer); clearInterval(apiCount);
    var el = document.getElementById('apiNoo');
    if(!el) return;
    el.classList.remove('on');
    setTimeout(function(){ if(el.parentNode) el.parentNode.removeChild(el); }, 320);
  }
  function apiBerapi(rk){
    apiCss();
    var lama = document.getElementById('apiNoo'); if(lama) lama.parentNode.removeChild(lama);
    var n = rk.hari_ini.noo, st = Math.max(rk.streak || 0, 1), pertama = n === 1;
    var dari = pertama ? Math.max(st - 1, 0) : st;
    var h = '<div class="ni-stage"><div class="ni-title">NOO tercatat!</div><div class="ni-fw"><div class="ni-rays"></div><div class="ni-glow"></div>';
    for(var a = 0; a < 14; a++) h += '<i class="ni-st" style="--a:' + (a * 360 / 14 + 8) + 'deg;--d:' + (0.45 + (a % 3) * 0.08).toFixed(2) + 's"></i>';
    h += '<div class="ni-flame">' + NI_FLAME + '</div><div class="ni-pin">' + M.svg('pinpin', E.joget, {noFx: true}) + '</div>';
    var sp = [[8, 30, 18, 1.2], [88, 22, 14, 1.5], [4, 62, 11, 1.8], [94, 58, 17, 1.35], [24, 8, 10, 2.0], [74, 6, 12, 1.65]];
    for(var q = 0; q < sp.length; q++) h += '<span class="ni-sp" style="left:' + sp[q][0] + '%;top:' + sp[q][1] + '%;--s:' + sp[q][2] + 'px;--d:' + sp[q][3] + 's">' + NI_SPARK + '</span>';
    h += '</div><div class="ni-rib">' + NI_RIB + '<div class="ni-rtx"><span class="ni-num" id="niNum">' + dari + '</span><span class="ni-lbl">hari<br>streak</span></div></div>';
    h += '<div class="ni-sub">' + (pertama ? 'NOO pertama hari ini — streak <b>naik jadi ' + st + ' hari</b>' : '<b>NOO ke-' + n + '</b> hari ini, streak <b>' + st + ' hari</b> terjaga') + '</div></div>';
    var warna = ['#FE7A1B', '#FFC24A', '#FFFFFF', '#FF5A00', '#FFE3C9'], c = '<div class="ni-conf">';
    for(var i = 0; i < 40; i++){
      c += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;width:' + (5 + Math.random() * 5).toFixed(0) + 'px;height:' + (9 + Math.random() * 8).toFixed(0) + 'px;background:' + warna[i % warna.length] + ';--d:' + (0.9 + Math.random() * 1.1).toFixed(2) + 's;--dx:' + Math.round(Math.random() * 90 - 45) + 'px;--r:' + Math.round(Math.random() * 900 - 450) + 'deg;--h:' + (((app.clientHeight || 800) + 40)) + 'px"></i>';
    }
    c += '</div>';
    var el = document.createElement('div');
    el.id = 'apiNoo'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'NOO tercatat');
    el.innerHTML = h + c + '<div class="ni-hint">Ketuk untuk menutup</div>';
    app.appendChild(el);
    el.addEventListener('click', apiTutup);
    void el.offsetWidth;
    el.classList.add('on'); el.classList.add('go');
    // angka streak naik (hanya jika NOO pertama hari ini)
    if(dari !== st){
      var num = document.getElementById('niNum');
      setTimeout(function(){
        if(num) num.textContent = st;
        if(num && num.animate) num.animate([{transform: 'scale(1.7)'}, {transform: 'scale(1)'}], {duration: 420, easing: 'cubic-bezier(.2,1.5,.4,1)'});
      }, 1450);
    }
    clearTimeout(apiTimer); apiTimer = setTimeout(apiTutup, 4600);
  }
  window.apiBerapi = function(){ apiBerapi(ringkas()); };

  /** Dipanggil app.js setelah sales menyimpan temuan "Lanjut NOO". */
  function petSetelahNoo(){
    var rk = ringkas(), n = rk.hari_ini.noo;
    moodTerakhir = null; renderPet();
    try{ apiBerapi(rk); }catch(e){}
    if(panelBuka()){
      clearTimeout(reaksiTimer); reaksi = E.joget; renderPanel(); renderBesar(true); konfeti();
      reaksiTimer = setTimeout(function(){ reaksi = null; renderBesar(true); }, 3600);
      return;
    }
    var pertama = n === 1;
    var lencana = CATATAN.indexOf(rk.streak) >= 0 && pertama;
    petTip(lencana ? 'Lencana ' + rk.streak + ' hari terbuka! Mantap!' : (pertama ? 'Yeay, NOO pertama hari ini! Streak jadi ' + rk.streak + ' hari' : 'NOO ke-' + n + ' hari ini, mantap!'), 3800);
  }


  /* ---------- sambutan Pinpin: intro 3 tahap (sekali per hari per sales; di demo setiap kali dibuka) ---------- */
  var sbTyper = null, splashBeres = (window.parent === window), MODE_DEMO = (window.parent !== window);
  window.addEventListener('message', function(ev){ var m = ev.data || {}; if(m.demo === 'splashSelesai'){ splashBeres = true; } });
  function sambutKunci(){ return (typeof sesi !== 'undefined' && sesi) ? 'sl2_sambut_' + sesi.kode : null; }
  function sambutTutup(){
    var el = document.getElementById('sambut'); if(!el || el.classList.contains('out')) return;
    clearInterval(sbTyper);
    var fly = el.querySelector('.sbFly'), bob = el.querySelector('.sbBob');
    // posisi tujuan = posisi pet mengambang
    dariPecahan();
    var ar = app.getBoundingClientRect(), r = fly.getBoundingClientRect();
    fly.style.animation = 'none'; fly.style.opacity = '1'; fly.style.transform = 'none'; bob.style.animation = 'none';
    var cx = r.left - ar.left + r.width / 2, cy = r.top - ar.top + r.height / 2;
    var dx = (px + SZ / 2) - cx, dy = (py + SZ / 2) - cy, sk = SZ / r.width;
    el.classList.add('out');
    var selesai = function(){
      if(el.parentNode) el.parentNode.removeChild(el);
      pet.style.display = 'none'; petAtur();
      try{ pet.querySelector('.hopW').animate([{transform: 'none'}, {transform: 'translateY(-14px) scale(.95,1.06)'}, {transform: 'scale(1.06,.94)'}, {transform: 'none'}], {duration: 520}); }catch(e){}
    };
    if(fly.animate){
      var a = fly.animate([
        {transform: 'translate(0,0) scale(1) rotate(0)'},
        {transform: 'translate(' + (dx * 0.35) + 'px,' + (dy * 0.2 - 70) + 'px) scale(' + (0.75 + sk * 0.25) + ') rotate(-14deg)', offset: 0.45},
        {transform: 'translate(' + dx + 'px,' + dy + 'px) scale(' + sk + ') rotate(0)'}
      ], {duration: 850, easing: 'cubic-bezier(.45,0,.3,1)', fill: 'forwards'});
      a.onfinish = selesai;
    } else setTimeout(selesai, 300);
  }
  function sambutTampil(){
    if(typeof kalimatSambutan !== 'function') return;
    var lama = document.getElementById('sambut'); if(lama) lama.parentNode.removeChild(lama);
    if(panelBuka()) petTutup();
    var K = kalimatSambutan(new Date()), D = K.data, L3 = K.langkah, now = new Date(), idx = 0;
    var el = document.createElement('div'); el.id = 'sambut'; el.setAttribute('role', 'dialog'); el.setAttribute('aria-label', 'Sambutan Pinpin');
    var trail = ''; for(var i = 0; i < 5; i++) trail += '<i style="width:' + (60 + i * 14) + 'px;right:' + (120 + i * 6) + 'px;top:' + (40 + i * 22) + 'px;transform:rotate(-38deg);opacity:' + (1 - i * .15) + '"></i>';
    el.innerHTML = '<button type="button" class="sbSkip" aria-label="Lewati sambutan">Lewati</button>' +
      '<div class="sbTrail">' + trail + '</div>' +
      '<div class="sbFly"><div class="sbBob"><div class="sbPin"></div></div></div>' +
      '<div class="sbCard"><div class="sbHead"><span class="sbDate">' + tanggalPanjang(now) + '</span>' + (D.kode_jks ? '<span class="sbJks">JKS ' + esk(D.kode_jks) + '</span>' : '') + '</div>' +
      '<div class="sbBody" id="sbBody"></div>' +
      '<div class="sbStep"><div class="sbDots" id="sbDots"></div><span class="sbNo" id="sbNo"></span></div>' +
      '<div class="sbNav"><button type="button" class="sbPrev" id="sbPrev">Sebelumnya</button><button type="button" class="sbGo" id="sbGo">Lanjut</button></div></div>';
    app.appendChild(el);
    pet.style.display = 'none'; tipEl.classList.remove('show');
    var pin = el.querySelector('.sbPin'), body = el.querySelector('#sbBody');
    function render(animasi){
      var st = L3[idx];
      pin.innerHTML = M.svg('pinpin', st.emo);
      if(animasi){ var b = el.querySelector('.sbBob'); b.classList.remove('sbPop'); void b.offsetWidth; b.classList.add('sbPop'); }
      var toko = '';
      if(st.toko){
        var ts = (D.toko_sedotan || []);
        toko = '<div class="sbToko"><div class="ls">' + ts.slice(0, 8).map(function(t){ return '<span>' + esk(t.nama || '-') + (t.kode ? '<b>' + esk(t.kode) + '</b>' : '') + '</span>'; }).join('') + (ts.length > 8 ? '<span>+' + (ts.length - 8) + ' lagi</span>' : '') + '</div>' + (D.contoh ? '<span class="lb">data contoh</span>' : '') + '</div>';
      }
      body.innerHTML = '<div class="sbMsg sbFade" id="sbMsg"></div>' + toko;
      if(toko){ var tk = body.querySelector('.sbToko'); tk.style.opacity = 0; }
      var msg = body.querySelector('#sbMsg'), full = st.html, pos = 0;
      clearInterval(sbTyper);
      var beres = function(){ clearInterval(sbTyper); msg.innerHTML = full; var t = body.querySelector('.sbToko'); if(t){ t.style.transition = 'opacity .3s'; t.style.opacity = 1; } };
      sbTyper = setInterval(function(){
        if(pos >= full.length){ beres(); return; }
        if(full[pos] === '<'){ pos = full.indexOf('>', pos) + 1; } else if(full[pos] === '&'){ pos = full.indexOf(';', pos) + 1; } else pos += 2;
        msg.innerHTML = full.slice(0, pos) + '<span class="cur"></span>';
      }, 18);
      msg.onclick = beres;
      el.querySelector('#sbDots').innerHTML = L3.map(function(_, i){ return '<i class="' + (i === idx ? 'on' : (i < idx ? 'done' : '')) + '"></i>'; }).join('');
      el.querySelector('#sbNo').textContent = (idx + 1) + ' / ' + L3.length;
      el.querySelector('#sbPrev').hidden = idx === 0;
      el.querySelector('#sbGo').textContent = idx === L3.length - 1 ? 'Yuk mulai!' : 'Lanjut';
    }
    render(false);
    void el.offsetWidth; el.classList.add('on');
    setTimeout(function(){ el.classList.add('landed'); }, 1050);
    el.querySelector('#sbGo').addEventListener('click', function(){ if(idx < L3.length - 1){ idx++; render(true); } else sambutTutup(); });
    el.querySelector('#sbPrev').addEventListener('click', function(){ if(idx > 0){ idx--; render(true); } });
    el.querySelector('.sbSkip').addEventListener('click', sambutTutup);
    try{ var k = sambutKunci(); if(k) localStorage.setItem(k, tglKunci(new Date())); }catch(e){}
  }
  /** Dipanggil app.js setelah masuk ke layar utama. Produksi: sekali per hari per sales. Demo (dalam bingkai HP): setiap kali dibuka. */
  function pinpinSambut(paksa){
    var k = sambutKunci(); if(!k) return;
    var sudah = null; try{ sudah = localStorage.getItem(k); }catch(e){}
    if(!paksa && !MODE_DEMO && sudah === tglKunci(new Date())) return;
    var coba = 0;
    (function tunggu(){
      coba++;
      var siap = splashBeres && screenAktif === 'scrMain' && document.visibilityState !== 'hidden' && (typeof JL === 'undefined' || !!JL.data || coba > 30);   // tunggu data jalan (maks ±4,5 dtk) supaya nama jalan besar ikut tampil
      if(siap || coba > 60) { if(screenAktif === 'scrMain') sambutTampil(); return; }
      setTimeout(tunggu, 150);
    })();
  }
  document.getElementById('btnSambutLagi').addEventListener('click', function(){ petTutup(); setTimeout(function(){ pinpinSambut(true); }, 380); });
  window.pinpinSambut = pinpinSambut;

  window.petAtur = petAtur;
  window.petRender = petRender;
  window.petBuka = petBuka;
  window.petTutup = petTutup;
  window.petTip = petTip;
  window.petSetelahNoo = petSetelahNoo;

  petAtur();
})();
