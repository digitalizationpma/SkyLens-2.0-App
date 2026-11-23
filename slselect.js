/* SLSelect — dropdown bermerek SkyLens sebagai pengganti <select> bawaan browser/Android.
   Pakai: SLSelect.init({sheet:false})   // dashboard: popover di bawah tombol
          SLSelect.init({sheet:true})    // app HP: lembar dari bawah
   - Semua <select> di halaman otomatis diganti (kecuali yang ber-atribut data-native), termasuk yang dibuat belakangan.
   - <select> asli tetap ada (disembunyikan) dan tetap jadi sumber nilai: kode lama (.value, .options, change event) tidak perlu diubah.
   - Perubahan lewat kode (select.value = x, isi ulang option) ikut tersinkron. */
(function(){
  'use strict';
  var CFG = {sheet: false};
  var open = null;   // {sel, btn, pop, onKey}
  var css = '' +
  '.slsel{position:relative;display:block;width:100%}' +
  '.slsel-nat{position:absolute!important;opacity:0!important;pointer-events:none!important;width:1px!important;height:1px!important;left:0;bottom:0}' +
  '.slsel-btn{display:flex;align-items:center;justify-content:space-between;gap:10px;width:100%;text-align:left;cursor:pointer;font:inherit;color:inherit;' +
    'background:var(--slsel-bg,var(--card,var(--surface,#fff)));border:1px solid var(--slsel-line,var(--line,#DDE2EC));border-radius:12px;padding:10px 12px;min-height:40px;' +
    'background-image:none!important;-webkit-appearance:none;appearance:none}' +
  '.slsel-btn:focus-visible{outline:2px solid var(--or,#FE7A1B);outline-offset:1px}' +
  '.slsel-btn[disabled]{opacity:.55;cursor:not-allowed}' +
  '.slsel-lab{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}' +
  '.slsel-lab.ph{color:var(--muted,#6B7488);font-weight:500}' +
  '.slsel-car{flex:none;width:18px;height:18px;transition:transform .15s;color:var(--muted,#6B7488)}' +
  '.slsel-btn[aria-expanded=true] .slsel-car{transform:rotate(180deg)}' +
  '.slsel-pop{position:fixed;z-index:100000;background:var(--slsel-pop,var(--card,var(--surface,#fff)));color:var(--ink,#1C212D);border:1px solid var(--slsel-line,var(--line,#DDE2EC));' +
    'border-radius:14px;box-shadow:0 14px 40px rgba(15,23,42,.22);overflow:auto;padding:6px;overscroll-behavior:contain;font-family:inherit;animation:slselIn .12s ease-out}' +
  '@keyframes slselIn{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}' +
  '.slsel-grp{padding:10px 10px 4px;font-size:11px;font-weight:800;letter-spacing:.06em;text-transform:uppercase;color:var(--muted,#6B7488)}' +
  '.slsel-opt{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 12px;border-radius:10px;cursor:pointer;font-size:14px;font-weight:600;line-height:1.3}' +
  '.slsel-opt:hover,.slsel-opt.hi{background:var(--slsel-hi,rgba(254,122,27,.12))}' +
  '.slsel-opt.sel{color:var(--or-ink,#B9480A);background:var(--slsel-sel,rgba(254,122,27,.16))}' +
  '.slsel-opt.dis{opacity:.45;cursor:not-allowed}' +
  '.slsel-opt .ck{width:16px;height:16px;flex:none;opacity:0}.slsel-opt.sel .ck{opacity:1}' +
  '.slsel-opt .sub{display:block;font-size:12px;font-weight:500;color:var(--muted,#6B7488)}' +
  '.slsel-ov{position:fixed;inset:0;z-index:99999;background:rgba(15,23,42,.45);animation:slselOv .15s ease-out}' +
  '@keyframes slselOv{from{opacity:0}to{opacity:1}}' +
  '.slsel-sheet{position:fixed;left:0;right:0;bottom:0;z-index:100000;background:var(--slsel-pop,var(--card,var(--surface,#fff)));color:var(--ink,#1C212D);border-radius:22px 22px 0 0;' +
    'padding:8px 10px calc(14px + env(safe-area-inset-bottom,0px));max-height:72vh;display:flex;flex-direction:column;box-shadow:0 -10px 40px rgba(15,23,42,.25);animation:slselUp .18s ease-out}' +
  '@keyframes slselUp{from{transform:translateY(40px);opacity:.6}to{transform:none;opacity:1}}' +
  '.slsel-sheet .grab{width:40px;height:4px;border-radius:4px;background:var(--slsel-line,#D5DAE5);margin:4px auto 10px;flex:none}' +
  '.slsel-sheet .ttl{font-size:15px;font-weight:800;padding:0 10px 8px;flex:none}' +
  '.slsel-sheet .lst{overflow:auto;overscroll-behavior:contain}' +
  '.slsel-sheet .slsel-opt{padding:13px 12px;font-size:15px}';
  var CARET = '<svg class="slsel-car" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 8l5 5 5-5"/></svg>';
  var CHECK = '<svg class="ck" viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5l4 4 8-9"/></svg>';

  function esc(s){ return String(s == null ? '' : s).replace(/[&<>"]/g, function(c){ return {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]; }); }
  function injectCss(){ if(document.getElementById('slsel-css')) return; var st = document.createElement('style'); st.id = 'slsel-css'; st.textContent = css; (document.head || document.documentElement).appendChild(st); }

  function label(sel){
    var o = sel.options[sel.selectedIndex];
    var txt = o ? (o.textContent || '').trim() : '';
    var ph = !o || o.value === '' ;
    return {txt: txt || ' ', ph: ph};
  }
  function refresh(sel){
    var b = sel.__slbtn; if(!b) return;
    var l = label(sel), lab = b.querySelector('.slsel-lab');
    lab.textContent = l.txt; lab.classList.toggle('ph', l.ph);
    b.disabled = !!sel.disabled;
    var vis = !(sel.hidden || sel.style.display === 'none');
    b.parentNode.style.display = vis ? '' : 'none';
  }
  function enhance(sel){
    if(sel.__slbtn || sel.hasAttribute('data-native') || sel.multiple || sel.size > 1) return;
    var wrap = document.createElement('span'); wrap.className = 'slsel';
    var cs = sel.className ? ' ' + sel.className : '';
    var btn = document.createElement('button'); btn.type = 'button'; btn.className = 'slsel-btn' + cs;
    btn.setAttribute('aria-haspopup', 'listbox'); btn.setAttribute('aria-expanded', 'false');
    btn.innerHTML = '<span class="slsel-lab"></span>' + CARET;
    if(sel.getAttribute('aria-label')) btn.setAttribute('aria-label', sel.getAttribute('aria-label'));
    if(sel.id) btn.setAttribute('data-for', sel.id);
    sel.parentNode.insertBefore(wrap, sel); wrap.appendChild(btn); wrap.appendChild(sel);
    sel.classList.add('slsel-nat'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    sel.__slbtn = btn;
    btn.addEventListener('click', function(e){ e.preventDefault(); e.stopPropagation(); if(open && open.sel === sel) close(); else openList(sel); });
    sel.addEventListener('change', function(){ refresh(sel); });
    new MutationObserver(function(){ refresh(sel); }).observe(sel, {childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['disabled', 'hidden', 'style']});
    refresh(sel);
  }
  function scan(root){ (root || document).querySelectorAll('select').forEach(enhance); }

  function items(sel){
    var out = [];
    Array.prototype.forEach.call(sel.children, function(ch){
      if(ch.tagName === 'OPTGROUP'){
        out.push({g: ch.label});
        Array.prototype.forEach.call(ch.children, function(o){ out.push({o: o}); });
      } else if(ch.tagName === 'OPTION') out.push({o: ch});
    });
    return out;
  }
  function openList(sel){
    close();
    var btn = sel.__slbtn; if(!btn || sel.disabled) return;
    var its = items(sel), html = '', idx = 0;
    its.forEach(function(it){
      if(it.g != null){ html += '<div class="slsel-grp">' + esc(it.g) + '</div>'; return; }
      var o = it.o; if(o.hidden) return;
      var ph = o.value === '' && /^\s*[—–-]*\s*(pilih|semua)/i.test(o.textContent) && false;
      html += '<div class="slsel-opt' + (o.selected ? ' sel' : '') + (o.disabled ? ' dis' : '') + '" role="option" data-i="' + Array.prototype.indexOf.call(sel.options, o) + '"><span>' + esc(o.textContent.trim()) + '</span>' + CHECK + '</div>';
    });
    var pop, ov = null;
    if(CFG.sheet){
      ov = document.createElement('div'); ov.className = 'slsel-ov';
      pop = document.createElement('div'); pop.className = 'slsel-sheet';
      var t = sel.getAttribute('aria-label') || (sel.id && document.querySelector('label[for="' + sel.id + '"]') ? document.querySelector('label[for="' + sel.id + '"]').textContent : '') || '';
      pop.innerHTML = '<div class="grab"></div>' + (t ? '<div class="ttl">' + esc(t.trim()) + '</div>' : '') + '<div class="lst">' + html + '</div>';
      document.body.appendChild(ov); document.body.appendChild(pop);
      ov.addEventListener('click', close);
    } else {
      pop = document.createElement('div'); pop.className = 'slsel-pop'; pop.innerHTML = html; document.body.appendChild(pop);
      var r = btn.getBoundingClientRect(), vh = window.innerHeight, below = vh - r.bottom - 12, above = r.top - 12;
      var h = Math.min(pop.scrollHeight + 2, 360), up = below < Math.min(h, 220) && above > below;
      pop.style.minWidth = r.width + 'px'; pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - Math.max(r.width, 200) - 8)) + 'px';
      pop.style.maxHeight = Math.max(140, Math.min(360, up ? above : below)) + 'px';
      if(up){ pop.style.bottom = (vh - r.top + 6) + 'px'; } else { pop.style.top = (r.bottom + 6) + 'px'; }
    }
    btn.setAttribute('aria-expanded', 'true');
    var st = {sel: sel, btn: btn, pop: pop, ov: ov, hi: -1};
    var els = function(){ return Array.prototype.slice.call(pop.querySelectorAll('.slsel-opt:not(.dis)')); };
    pop.addEventListener('click', function(e){
      var o = e.target.closest('.slsel-opt'); if(!o || o.classList.contains('dis')) return;
      pick(sel, +o.getAttribute('data-i'));
    });
    st.onKey = function(e){
      var l = els(); if(!l.length) return;
      var cur = l.findIndex(function(x){ return x.classList.contains('hi'); });
      if(cur < 0) cur = l.findIndex(function(x){ return x.classList.contains('sel'); });
      if(e.key === 'Escape'){ e.preventDefault(); close(); btn.focus(); }
      else if(e.key === 'ArrowDown' || e.key === 'ArrowUp'){
        e.preventDefault(); cur = e.key === 'ArrowDown' ? Math.min(l.length - 1, cur + 1) : Math.max(0, cur - 1);
        l.forEach(function(x){ x.classList.remove('hi'); }); l[cur].classList.add('hi'); l[cur].scrollIntoView({block: 'nearest'});
      } else if(e.key === 'Enter' || e.key === ' '){
        if(cur >= 0){ e.preventDefault(); pick(sel, +l[cur].getAttribute('data-i')); }
      }
    };
    document.addEventListener('keydown', st.onKey, true);
    st.onDoc = function(e){ if(!pop.contains(e.target) && !btn.contains(e.target)) close(); };
    setTimeout(function(){ document.addEventListener('pointerdown', st.onDoc, true); }, 0);
    st.onScroll = function(e){ if(!CFG.sheet && !pop.contains(e.target)) close(); };
    window.addEventListener('scroll', st.onScroll, true); window.addEventListener('resize', close);
    open = st;
    var s = pop.querySelector('.slsel-opt.sel'); if(s) s.scrollIntoView({block: 'center'});
  }
  function pick(sel, i){
    var changed = sel.selectedIndex !== i;
    sel.selectedIndex = i;
    close();
    refresh(sel);
    if(changed){ sel.dispatchEvent(new Event('input', {bubbles: true})); sel.dispatchEvent(new Event('change', {bubbles: true})); }
  }
  function close(){
    if(!open) return;
    var st = open; open = null;
    st.btn.setAttribute('aria-expanded', 'false');
    document.removeEventListener('keydown', st.onKey, true);
    document.removeEventListener('pointerdown', st.onDoc, true);
    window.removeEventListener('scroll', st.onScroll, true); window.removeEventListener('resize', close);
    if(st.pop.parentNode) st.pop.parentNode.removeChild(st.pop);
    if(st.ov && st.ov.parentNode) st.ov.parentNode.removeChild(st.ov);
  }

  function init(cfg){
    if(cfg) for(var k in cfg) CFG[k] = cfg[k];
    injectCss();
    // sinkronkan kalau kode memakai select.value = ... / selectedIndex = ...
    ['value', 'selectedIndex'].forEach(function(p){
      var d = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, p);
      if(!d || !d.set || d.set.__sl) return;
      var set = d.set; var nw = function(v){ set.call(this, v); if(this.__slbtn) refresh(this); };
      nw.__sl = 1; Object.defineProperty(HTMLSelectElement.prototype, p, {get: d.get, set: nw, configurable: true});
    });
    scan(document);
    new MutationObserver(function(muts){
      muts.forEach(function(m){ m.addedNodes.forEach(function(n){
        if(n.nodeType !== 1) return;
        if(n.tagName === 'SELECT') enhance(n); else if(n.querySelectorAll) scan(n);
      }); });
    }).observe(document.documentElement, {childList: true, subtree: true});
  }
  window.SLSelect = {init: init, scan: scan, close: close, refresh: refresh};
})();
