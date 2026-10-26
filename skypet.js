
// Pinpin & Rovi with arms + 10 animated emotions. Shared by page (browser) and SVG export (node).
(function (root) {
  const O = '#FE7A1B', OD = '#E2600C', OL = '#FFC08F', N = '#1F2C4F', NI = '#1C212D', NL = '#4A5878', NT = '#C9D2E3', W = '#FFFFFF';
  const R2D = 180 / Math.PI;

  const CH = {
    pinpin: {
      id: 'pinpin', name: 'Pinpin', group: 'Oranye',
      body: `
        <path d="M100 26 C142 26 168 56 168 94 C168 136 122 160 100 186 C78 160 32 136 32 94 C32 56 58 26 100 26 Z" fill="${O}"/>
        <ellipse cx="64" cy="54" rx="11" ry="6" transform="rotate(-38 64 54)" fill="${W}" opacity=".35"/>
        <circle cx="100" cy="92" r="40" fill="${W}"/>`,
      wheels: '',
      face: { eyes: [[86, 87], [114, 87]], er: 7, mx: 100, my: 104, mw: 18, blush: OL },
      arm: { type: 'paddle', S: [[48, 104], [152, 104]], len: 46, w: 21, col: '#D9530A' },
      fx: [150, 34],
      targets: { chin: [113, 128], tuckL: [104, 152], tuckR: [96, 152] }
    },
    orbi: {
      id: 'orbi', name: 'Orbi', group: 'Oranye',
      body: `
        <g class="ant"><line x1="100" y1="58" x2="100" y2="34" stroke="${NI}" stroke-width="5" stroke-linecap="round"/>
        <circle cx="100" cy="29" r="8" fill="${O}"/><circle cx="97" cy="26" r="2.5" fill="${W}" opacity=".7"/></g>
        <ellipse cx="82" cy="168" rx="13" ry="8" fill="${NI}"/><ellipse cx="118" cy="168" rx="13" ry="8" fill="${NI}"/>
        <circle cx="100" cy="110" r="56" fill="${O}"/>
        <ellipse cx="74" cy="76" rx="14" ry="7" transform="rotate(-32 74 76)" fill="${W}" opacity=".3"/>
        <circle cx="100" cy="114" r="37" fill="${W}"/>`,
      wheels: '',
      face: { eyes: [[86, 108], [114, 108]], er: 7, mx: 100, my: 125, mw: 18, blush: OL },
      arm: { type: 'panel', S: [[60, 108], [140, 108]], len: 56, w: 32, col: N },
      fx: [148, 40],
      targets: { chin: [110, 166], tuckL: [88, 196], tuckR: [112, 196] }
    },
    rovi: {
      id: 'rovi', name: 'Rovi', group: 'Navy',
      body: `
        <line x1="100" y1="54" x2="100" y2="30" stroke="${NI}" stroke-width="5" stroke-linecap="round"/>
        <circle cx="100" cy="27" r="8" fill="${O}"/><circle cx="97" cy="24" r="2.5" fill="${W}" opacity=".7"/>
        <line x1="140" y1="56" x2="150" y2="42" stroke="${NI}" stroke-width="4" stroke-linecap="round"/>
        <ellipse cx="152" cy="40" rx="13" ry="6" transform="rotate(-30 152 40)" fill="${O}"/>
        <rect x="40" y="136" width="120" height="20" rx="10" fill="${NI}"/>
        __WHEELS__
        <rect x="44" y="52" width="112" height="88" rx="24" fill="${N}"/>
        <rect x="58" y="66" width="84" height="58" rx="15" fill="#E9EEF7"/>`,
      wheels: [[60, 164], [100, 166], [140, 164]].map(([x, y]) => `<g transform="translate(${x} ${y})"><circle r="16" fill="${NI}"/><g class="wheel"><rect x="-1.6" y="-12" width="3.2" height="24" rx="1.6" fill="${NL}"/><rect x="-12" y="-1.6" width="24" height="3.2" rx="1.6" fill="${NL}"/></g><circle r="6" fill="${O}"/></g>`).join(''),
      face: { eyes: [[86, 92], [114, 92]], er: 7, mx: 100, my: 108, mw: 16, blush: OL },
      arm: { S: [[50, 100], [150, 100]], L1: 25, L2: 23, w: 12, col: '#56658A', hand: (r) => `<circle r="${r}" fill="${O}"/><circle r="${r * 0.36}" fill="${NI}"/>`, hr: 10, joint: `<circle r="6.5" fill="${O}"/>` },
      fx: [44, 34],
      targets: { chin: [114, 126], hipL: [42, 134], cheekL: [66, 104], cheekR: [134, 104], tuckL: [86, 128], tuckR: [114, 128] }
    }
  };

  // ---- IK: returns [theta1, theta2] in degrees (clockwise from "hanging down"), elbow pushed away from x=100
  function ik(S, T, L1, L2) {
    let dx = T[0] - S[0], dy = T[1] - S[1], d = Math.hypot(dx, dy);
    d = Math.min(d, L1 + L2 - 0.5); d = Math.max(d, Math.abs(L1 - L2) + 0.5);
    const base = Math.atan2(dy, dx), ca = (L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), al = Math.acos(Math.max(-1, Math.min(1, ca)));
    const sols = [1, -1].map((s) => { const p1 = base + s * al, E = [S[0] + L1 * Math.cos(p1), S[1] + L1 * Math.sin(p1)]; const p2 = Math.atan2(T[1] - E[1], T[0] - E[0]); return { p1, p2, E }; });
    sols.sort((a, b) => (Math.abs(b.E[0] - 100) + b.E[1] * 0.3) - (Math.abs(a.E[0] - 100) + a.E[1] * 0.3));
    const s = sols[0]; let t1 = s.p1 * R2D - 90, t2 = (s.p2 - s.p1) * R2D;
    const n = (a) => { while (a > 180) a -= 360; while (a < -180) a += 360; return a; };
    return [n(t1), n(t2)];
  }
  // pose spec per arm: [a,b] outward convention, or {t:'chin'} target name
  function armAngles(c, side, spec) {
    if (c.arm.type) {
      if (Array.isArray(spec)) return [spec[0] * (side === 0 ? 1 : -1), 0];
      const S = c.arm.S[side], T = c.targets[spec.t];
      return [Math.atan2(T[1] + (spec.dy || 0) - S[1], T[0] + (spec.dx || 0) - S[0]) * R2D - 90, 0];
    }
    if (Array.isArray(spec)) { const s = side === 0 ? 1 : -1; return [spec[0] * s, spec[1] * s]; }
    const T = c.targets[spec.t].slice(); if (spec.dx) T[0] += spec.dx; if (spec.dy) T[1] += spec.dy;
    return ik(c.arm.S[side], T, c.arm.L1, c.arm.L2);
  }

  const REST = [12, -8], PR = [18, 0];
  // Each emotion: per-character arm frames [{L,R}], body frames, duration, extras; orbi also antenna angles
  const EMO = [
    { k: 'menyapa', label: 'Menyapa', when: 'Pertama buka aplikasi atau kembali ke Beranda.',
      chat: 'Halo Ade! Ada 3 zona hari ini, mulai dari Jayaraga ya.',
      face: 'normal', dur: 0.5, dir: 'alternate',
      fr: { rovi: [{ L: REST, R: [150, -40] }, { L: REST, R: [150, 22] }],
            pinpin: [{ L: PR, R: [132, 0] }, { L: PR, R: [168, 0] }],
            orbi: [{ L: [90, 0], R: [128, 0] }, { L: [84, 0], R: [166, 0] }] }, ant: [-6, 6],
      body: { dur: 2.4, dir: 'alternate', f: ['translateY(0)', 'translateY(-4px)'] } },
    { k: 'senang', label: 'Senang', when: 'Satu kotak selesai disisir atau data berhasil terkirim.',
      chat: 'Yes! Kotak C2 beres, tinggal 7 lagi.',
      face: 'happy', dur: 0.42, dir: 'alternate',
      fr: { rovi: [{ L: [150, 18], R: [150, 18] }, { L: [172, -4], R: [172, -4] }],
            pinpin: [{ L: [146, 0], R: [146, 0] }, { L: [170, 0], R: [170, 0] }],
            orbi: [{ L: [142, 0], R: [142, 0] }, { L: [168, 0], R: [168, 0] }] }, ant: [-14, 14],
      body: { dur: 0.42, dir: 'alternate', f: ['translateY(0) scale(1.03,.97)', 'translateY(-14px) scale(.98,1.02)'] }, fx: 'spark', spin: true },
    { k: 'menari', label: 'Menari sambil siul', when: 'Rute terekam lancar dan semua data aman.',
      chat: 'Rute terekam lancar, sinyal aman. Lanjut santai.',
      face: 'whistle', dur: 1.0, dir: 'normal',
      fr: { rovi: [{ L: [55, 70], R: [150, -30] }, { L: [150, -30], R: [55, 70] }, { L: [55, 70], R: [150, -30] }],
            pinpin: [{ L: [40, 0], R: [150, 0] }, { L: [150, 0], R: [40, 0] }, { L: [40, 0], R: [150, 0] }],
            orbi: [{ L: [55, 0], R: [135, 0] }, { L: [135, 0], R: [55, 0] }, { L: [55, 0], R: [135, 0] }] }, ant: [-18, 18],
      body: { dur: 1.0, dir: 'normal', f: ['rotate(-6deg)', 'rotate(6deg) translateY(-3px)', 'rotate(-6deg)'] }, fx: 'notes', spin: true },
    { k: 'semangat', label: 'Semangat, ayo jalan', when: 'Tombol JALAN ditekan dan masih ada kotak tersisa.',
      chat: 'Ayo jalan! Kotak D1 tinggal 80 m ke barat daya.',
      face: 'go', dur: 0.32, dir: 'alternate',
      fr: { rovi: [{ L: [22, -70], R: [78, 92] }, { L: [32, -58], R: [100, 112] }],
            pinpin: [{ L: [22, 0], R: [156, 0] }, { L: [34, 0], R: [180, 0] }],
            orbi: [{ L: [78, 0], R: [160, 0] }, { L: [86, 0], R: [182, 0] }] }, ant: [-12, 12],
      body: { dur: 0.32, dir: 'alternate', f: ['translateY(0)', 'translateY(-6px)'] }, fx: 'speed', spin: true },
    { k: 'bangga', label: 'Bangga, NOO berhasil', when: 'Temuan disimpan dengan status Lanjut NOO.',
      chat: 'Toko Berkah Jaya Lanjut NOO. Hebat!',
      face: 'proud', dur: 0.9, dir: 'alternate', item: 'star',
      fr: { rovi: [{ L: { t: 'hipL' }, R: [150, 4] }, { L: { t: 'hipL' }, R: [162, -6] }],
            pinpin: [{ L: [-22, 0], R: [148, 0] }, { L: [-22, 0], R: [162, 0] }],
            orbi: [{ L: [62, 0], R: [148, 0] }, { L: [62, 0], R: [160, 0] }] }, ant: [0, 8],
      body: { dur: 0.9, dir: 'alternate', f: ['translateY(0) scale(1,1)', 'translateY(-4px) scale(1.02,1.02)'] }, fx: 'spark2' },
    { k: 'berpikir', label: 'Berpikir', when: 'Sinyal lemah, data menunggu dikirim dari HP.',
      chat: 'Sinyal lemah, temuan disimpan dulu di HP.',
      face: 'think', dur: 0.7, dir: 'alternate', front: true,
      fr: { rovi: [{ L: [8, -24], R: { t: 'chin' } }, { L: [8, -24], R: { t: 'chin', dy: -3, dx: 2 } }],
            pinpin: [{ L: [14, 0], R: { t: 'chin' } }, { L: [14, 0], R: { t: 'chin', dy: -3 } }],
            orbi: [{ L: [80, 0], R: { t: 'chin' } }, { L: [80, 0], R: { t: 'chin', dy: -4 } }] }, ant: [10, 18],
      body: { dur: 1.8, dir: 'alternate', f: ['rotate(0deg)', 'rotate(4deg)'] }, fx: 'dots' },
    { k: 'bingung', label: 'Bingung', when: 'Posisi di luar petak atau GPS belum akurat.',
      chat: 'Lokasi kamu di luar petak. Mau dibuka arahnya?',
      face: 'confused', dur: 0.7, dir: 'alternate',
      fr: { rovi: [{ L: [42, 72], R: [42, 72] }, { L: [52, 84], R: [52, 84] }],
            pinpin: [{ L: [96, 0], R: [96, 0] }, { L: [110, 0], R: [110, 0] }],
            orbi: [{ L: [112, 0], R: [112, 0] }, { L: [126, 0], R: [126, 0] }] }, ant: [-14, 14],
      body: { dur: 0.7, dir: 'alternate', f: ['translateY(0)', 'translateY(-3px)'] }, fx: 'q' },
    { k: 'sedih', label: 'Sedih', when: 'Izin lokasi mati atau penghemat baterai memutus rute.',
      chat: 'Izin lokasi mati, rute tidak terekam. Perbaiki yuk.',
      face: 'sad', dur: 2.0, dir: 'alternate',
      fr: { rovi: [{ L: [2, 4], R: [2, 4] }, { L: [6, 0], R: [6, 0] }],
            pinpin: [{ L: [3, 0], R: [3, 0] }, { L: [7, 0], R: [7, 0] }],
            orbi: [{ L: [26, 0], R: [26, 0] }, { L: [32, 0], R: [32, 0] }] }, ant: [30, 36],
      body: { dur: 2.0, dir: 'alternate', f: ['translateY(4px)', 'translateY(7px)'] }, fx: 'drop' },
    { k: 'kaget', label: 'Kaget, peringatan', when: 'Baterai hampir habis atau ada temuan yang gagal terkirim.',
      chat: 'Baterai tinggal 10%! Simpan temuan sekarang.',
      face: 'shock', dur: 0.14, dir: 'alternate',
      fr: { rovi: [{ L: { t: 'cheekL' }, R: { t: 'cheekR' } }, { L: { t: 'cheekL', dy: -2 }, R: { t: 'cheekR', dy: -2 } }],
            pinpin: [{ L: [158, 0], R: [158, 0] }, { L: [164, 0], R: [164, 0] }],
            orbi: [{ L: [172, 0], R: [172, 0] }, { L: [178, 0], R: [178, 0] }] }, ant: [-3, 3],
      body: { dur: 0.14, dir: 'alternate', f: ['translate(-1.5px,0)', 'translate(1.5px,-2px)'] }, fx: 'bang' },
    { k: 'tidur', label: 'Tidur', when: 'Di luar jam kerja 05.00–21.00 atau perekaman dijeda.',
      chat: 'Sudah di luar jam kerja. Sampai besok pagi.',
      face: 'sleep', dur: 2.4, dir: 'alternate', front: true,
      fr: { rovi: [{ L: { t: 'tuckL' }, R: { t: 'tuckR' } }, { L: { t: 'tuckL', dy: 1.5 }, R: { t: 'tuckR', dy: 1.5 } }],
            pinpin: [{ L: { t: 'tuckL' }, R: { t: 'tuckR' } }, { L: { t: 'tuckL', dy: 2 }, R: { t: 'tuckR', dy: 2 } }],
            orbi: [{ L: { t: 'tuckL' }, R: { t: 'tuckR' } }, { L: { t: 'tuckL', dy: 2 }, R: { t: 'tuckR', dy: 2 } }] }, ant: [24, 28],
      body: { dur: 2.4, dir: 'alternate', f: ['scale(1,1)', 'scale(1.025,.975)'] }, fx: 'z' },
    { k: 'nangis', label: 'Nangis', when: 'Pinpin diketuk saat belum ada NOO hari ini.', chat: 'Huaaa... belum ada NOO hari ini. Ayo cari satu aja dulu!',
      face: 'cry', dur: 0.28, dir: 'alternate',
      fr: { pinpin: [{ L: [-132, 0], R: [-132, 0] }, { L: [-150, 0], R: [-150, 0] }] },
      body: { dur: 0.28, dir: 'alternate', f: ['translateY(0) scale(1,1)', 'translateY(3px) scale(1.035,.965)'] }, fx: 'tears' },
    { k: 'joget', label: 'Joget', when: 'Pinpin diketuk setelah dapat NOO.', chat: 'Yeay NOO masuk! Joget dulu ah!',
      face: 'happy', dur: 0.9, dir: 'normal',
      fr: { pinpin: [{ L: [170, 0], R: [55, 0] }, { L: [120, 0], R: [120, 0] }, { L: [55, 0], R: [170, 0] }, { L: [120, 0], R: [120, 0] }, { L: [170, 0], R: [55, 0] }] },
      body: { dur: 0.9, dir: 'normal', f: ['rotate(-10deg) translateY(0)', 'rotate(0deg) translateY(-16px)', 'rotate(10deg) translateY(0)', 'rotate(0deg) translateY(-16px)', 'rotate(-10deg) translateY(0)'] }, fx: 'party' }
  ];

  // ---- face
  function face(f, m) {
    const er = f.er, L = NI, sw = 4;
    let out = '';
    const eyes = f.eyes;
    const dot = (x, y, r) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${L}"/><circle cx="${x - r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.36}" fill="${W}"/>`;
    const arcUp = (x, y) => `<path d="M${x - er} ${y + er * 0.35} Q${x} ${y - er * 0.95} ${x + er} ${y + er * 0.35}" fill="none" stroke="${L}" stroke-width="${sw}" stroke-linecap="round"/>`;
    const arcDn = (x, y) => `<path d="M${x - er} ${y} Q${x} ${y + er * 0.85} ${x + er} ${y}" fill="none" stroke="${L}" stroke-width="${sw}" stroke-linecap="round"/>`;
    const blink = (inner, i) => `<g class="eye" style="animation-delay:${i * 0.04}s">${inner}</g>`;
    const [l, r] = eyes;
    if (m === 'happy' || m === 'whistle' || m === 'proud') out += arcUp(...l) + arcUp(...r);
    else if (m === 'sleep') out += arcDn(...l) + arcDn(...r);
    else if (m === 'cry') out += `<path d="M${l[0] - er} ${l[1] - 3} L${l[0] + er * 0.7} ${l[1] + 1} L${l[0] - er} ${l[1] + 5}" fill="none" stroke="${L}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/><path d="M${r[0] + er} ${r[1] - 3} L${r[0] - er * 0.7} ${r[1] + 1} L${r[0] + er} ${r[1] + 5}" fill="none" stroke="${L}" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    else if (m === 'think') out += blink(dot(l[0] + 2, l[1] - 2.5, er), 0) + blink(dot(r[0] + 2, r[1] - 2.5, er), 1);
    else if (m === 'sad') out += blink(dot(l[0], l[1] + 2, er), 0) + blink(dot(r[0], r[1] + 2, er), 1);
    else if (m === 'shock') out += `<circle cx="${l[0]}" cy="${l[1] - 1}" r="${er * 1.3}" fill="${L}"/><circle cx="${l[0] - 2.5}" cy="${l[1] - 4}" r="2.8" fill="${W}"/><circle cx="${r[0]}" cy="${r[1] - 1}" r="${er * 1.3}" fill="${L}"/><circle cx="${r[0] - 2.5}" cy="${r[1] - 4}" r="2.8" fill="${W}"/>`;
    else if (m === 'confused') out += blink(dot(l[0], l[1], er), 0) + blink(dot(r[0], r[1] + 1, er * 0.8), 1);
    else out += blink(dot(l[0], l[1], er), 0) + blink(dot(r[0], r[1], er), 1);
    // brows
    const by = l[1] - er * 1.7;
    if (m === 'go') out += `<path d="M${l[0] - 8} ${by - 2} L${l[0] + 6} ${by + 3} M${r[0] + 8} ${by - 2} L${r[0] - 6} ${by + 3}" stroke="${L}" stroke-width="3.6" stroke-linecap="round"/>`;
    if (m === 'cry') out += `<path d="M${l[0] - 8} ${by + 4} L${l[0] + 6} ${by - 3} M${r[0] + 8} ${by + 4} L${r[0] - 6} ${by - 3}" stroke="${L}" stroke-width="3.6" stroke-linecap="round"/>`;
    if (m === 'sad') out += `<path d="M${l[0] - 8} ${by + 3} L${l[0] + 6} ${by - 2} M${r[0] + 8} ${by + 3} L${r[0] - 6} ${by - 2}" stroke="${L}" stroke-width="3.6" stroke-linecap="round"/>`;
    if (m === 'think') out += `<path d="M${r[0] - 7} ${by - 1} Q${r[0]} ${by - 7} ${r[0] + 8} ${by - 2}" fill="none" stroke="${L}" stroke-width="3.6" stroke-linecap="round"/>`;
    if (m === 'confused') out += `<path d="M${l[0] - 7} ${by - 1} Q${l[0]} ${by - 8} ${l[0] + 7} ${by - 3} M${r[0] - 7} ${by + 2} L${r[0] + 7} ${by + 2}" fill="none" stroke="${L}" stroke-width="3.6" stroke-linecap="round"/>`;
    if (m === 'shock') out += `<path d="M${l[0] - 7} ${by - 4} Q${l[0]} ${by - 9} ${l[0] + 7} ${by - 4} M${r[0] - 7} ${by - 4} Q${r[0]} ${by - 9} ${r[0] + 7} ${by - 4}" fill="none" stroke="${L}" stroke-width="3.6" stroke-linecap="round"/>`;
    // blush
    if (m === 'happy' || m === 'proud' || m === 'whistle') out += `<ellipse cx="${l[0] - 6}" cy="${l[1] + 11}" rx="6" ry="3.6" fill="${f.blush}"/><ellipse cx="${r[0] + 6}" cy="${r[1] + 11}" rx="6" ry="3.6" fill="${f.blush}"/>`;
    // mouth
    const { mx, my, mw } = f;
    if (m === 'happy' || m === 'go') { const k = m === 'go' ? 0.8 : 1, w = mw * 0.6 * k, h = mw * 0.8 * k; out += `<path d="M${mx - w} ${my} L${mx + w} ${my} Q${mx + w * 0.9} ${my + h} ${mx} ${my + h} Q${mx - w * 0.9} ${my + h} ${mx - w} ${my} Z" fill="${L}" stroke="${L}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="${mx}" cy="${my + h * 0.66}" rx="${w * 0.48}" ry="${h * 0.2}" fill="${O}"/>`; }
    else if (m === 'whistle') out += `<ellipse cx="${mx + 5}" cy="${my + 3}" rx="3.6" ry="4.4" fill="${L}"/>`;
    else if (m === 'proud') out += `<path d="M${mx - mw * 0.6} ${my - 1} Q${mx} ${my + mw * 0.6} ${mx + mw * 0.6} ${my - 1}" fill="none" stroke="${L}" stroke-width="4" stroke-linecap="round"/>`;
    else if (m === 'think') out += `<path d="M${mx + 1} ${my + 3} L${mx + 9} ${my + 1}" stroke="${L}" stroke-width="4" stroke-linecap="round"/>`;
    else if (m === 'confused') out += `<path d="M${mx - 8} ${my + 3} l4 -3 4 3 4 -3 4 3" fill="none" stroke="${L}" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
    else if (m === 'sad') out += `<path d="M${mx - mw * 0.42} ${my + 6} Q${mx} ${my - 2} ${mx + mw * 0.42} ${my + 6}" fill="none" stroke="${L}" stroke-width="4" stroke-linecap="round"/>`;
    else if (m === 'cry') out += `<path d="M${mx - 11} ${my + 12} Q${mx - 10} ${my - 1} ${mx} ${my - 1} Q${mx + 10} ${my - 1} ${mx + 11} ${my + 12} Z" fill="${L}" stroke="${L}" stroke-width="2" stroke-linejoin="round"/><ellipse cx="${mx}" cy="${my + 9}" rx="5.5" ry="2.6" fill="${O}"/>`;
    else if (m === 'shock') out += `<ellipse cx="${mx}" cy="${my + 4}" rx="5" ry="7" fill="${L}"/>`;
    else if (m === 'sleep') out += `<ellipse cx="${mx}" cy="${my + 3}" rx="3" ry="2.2" fill="${L}"/>`;
    else out += `<path d="M${mx - mw / 2} ${my} Q${mx} ${my + mw * 0.5} ${mx + mw / 2} ${my}" fill="none" stroke="${L}" stroke-width="4" stroke-linecap="round"/>`;
    return out;
  }

  function star(cx, cy, r, fill, cls) {
    const s = r * 0.32;
    return `<path class="${cls || ''}" d="M${cx} ${cy - r} L${cx + s} ${cy - s} L${cx + r} ${cy} L${cx + s} ${cy + s} L${cx} ${cy + r} L${cx - s} ${cy + s} L${cx - r} ${cy} L${cx - s} ${cy - s} Z" fill="${fill}"/>`;
  }
  const note = (x, y, cls) => `<g class="${cls}"><ellipse cx="${x}" cy="${y}" rx="5.5" ry="4.2" transform="rotate(-20 ${x} ${y})" fill="${N}"/><rect x="${x + 3.6}" y="${y - 18}" width="2.6" height="18" fill="${N}"/><path d="M${x + 6} ${y - 18} q7 2 7 9" fill="none" stroke="${N}" stroke-width="2.6" stroke-linecap="round"/></g>`;

  function fx(c, kind) {
    const [x, y] = c.fx;
    if (kind === 'spark') return `<g>${star(26, 50, 10, O, 'sp s1')}${star(174, 56, 8, O, 'sp s2')}${star(20, 130, 6, OL, 'sp s3')}${star(180, 128, 10, O, 'sp s4')}</g>`;
    if (kind === 'spark2') return `<g>${star(186, 22, 7, OL, 'sp s1')}${star(196, 58, 5, O, 'sp s3')}</g>`;
    if (kind === 'notes') return note(x, y + 6, 'nt n1') + note(x + 22, y - 10, 'nt n2');
    if (kind === 'speed' && c.id === 'orbi') return '';
    if (kind === 'speed') return `<g class="spd" stroke="${O}" stroke-width="5" stroke-linecap="round"><path d="M6 96 h18"/><path d="M0 114 h24"/><path d="M8 132 h16"/></g>`;
    if (kind === 'dots') return `<g class="dots"><circle cx="${x}" cy="${y + 8}" r="5" fill="${NT}"/><circle cx="${x + 14}" cy="${y - 6}" r="7" fill="${NT}"/><circle cx="${x + 32}" cy="${y - 20}" r="9" fill="${NT}"/></g>`;
    if (kind === 'q') return `<text class="qm" x="${x}" y="${y + 6}" font-family="'Plus Jakarta Sans',system-ui,sans-serif" font-weight="800" font-size="34" fill="${O}">?</text>`;
    if (kind === 'bang') return `<g class="bang" stroke="${O}" stroke-width="5" stroke-linecap="round"><path d="M${x} ${y - 14} v16"/><path d="M${x - 16} ${y - 6} l8 8"/><path d="M${x + 16} ${y - 6} l-8 8"/></g>`;
    if (kind === 'drop') return `<path class="drop" d="M${x + 8} ${y} C${x + 8} ${y} ${x - 2} ${y + 14} ${x - 2} ${y + 20} a10 10 0 0 0 20 0 C${x + 18} ${y + 14} ${x + 8} ${y} ${x + 8} ${y} Z" fill="#9AA5BC"/>`;
    if (kind === 'tears') { const d = (cls, dl) => `<path class="${cls}" style="animation-delay:${dl}s" d="M0 -6 C0 -6 -5 1 -5 4 a5 5 0 0 0 10 0 C5 1 0 -6 0 -6 Z" fill="#6EC3F0"/>`; const side = (x, y, c) => `<g transform="translate(${x} ${y})">${[0, .25, .5, .75].map((t) => d(c, t)).join('')}</g>`; return side(78, 94, 'tl') + side(122, 94, 'tr') + `<ellipse class="pud" cx="100" cy="194" rx="34" ry="4" fill="#6EC3F0" opacity=".35"/>`; }
    if (kind === 'party') return note(x, y + 6, 'nt n1') + note(x - 128, y + 4, 'nt n2') + `<g>${star(24, 112, 7, O, 'sp s1')}${star(178, 120, 8, OL, 'sp s3')}</g>`;
    if (kind === 'z') return `<g class="zz" font-family="'Plus Jakarta Sans',system-ui,sans-serif" font-weight="800" fill="${NL}"><text x="${x}" y="${y + 10}" font-size="24">Z</text><text x="${x + 22}" y="${y - 10}" font-size="15">z</text></g>`;
    return '';
  }

  function arm(c, side, ang, emoIdx, item) {
    const a = c.arm, [sx, sy] = a.S[side], s = side === 0 ? 'l' : 'r';
    if (a.type === 'paddle' || a.type === 'panel') {
      let geo;
      if (a.type === 'paddle') geo = `<ellipse cx="0" cy="${a.len / 2 - 4}" rx="${a.w / 2}" ry="${a.len / 2 + 4}" fill="${a.col}"/>`;
      else geo = `<rect x="-4.5" y="-2" width="9" height="18" rx="2" fill="${NI}"/><rect x="-16" y="14" width="32" height="42" rx="5" fill="${N}"/><path d="M-15 28h30M-15 42h30M0 15v40" stroke="${W}" stroke-opacity=".35" stroke-width="2"/>`;
      const it = item === 'star' && side === 1 ? `<g transform="translate(0 ${a.len + 14})">${star(0, 0, 20, O)}${star(0, 0, 8, '#FFD3AE')}</g>` : '';
      return `<g transform="translate(${sx} ${sy})"><g class="seg ${s}u" style="transform:rotate(${ang[0].toFixed(1)}deg)">${geo}${it}</g></g>`;
    }
    const cap = (L) => `<rect x="${-a.w / 2}" y="${-a.w / 2}" width="${a.w}" height="${L + a.w}" rx="${a.w / 2}" fill="${a.col}"/>`;
    const it = item === 'star' && side === 1 ? `<g transform="translate(0 ${a.L2 + 20})">${star(0, 0, 21, O)}${star(0, 0, 9, '#FFD3AE')}</g>` : '';
    return `<g transform="translate(${sx} ${sy})"><g class="seg ${s}u" style="transform:rotate(${ang[0].toFixed(1)}deg)">${cap(a.L1)}<g transform="translate(0 ${a.L1})"><g class="seg ${s}f" style="transform:rotate(${ang[1].toFixed(1)}deg)">${a.joint}${cap(a.L2)}<g transform="translate(0 ${a.L2})">${a.hand(a.hr)}</g>${it}</g></g></g></g>`;
  }

  function svg(cid, ei, opts) {
    opts = opts || {};
    const c = CH[cid], e = EMO[ei], f0 = e.fr[cid][0];
    const L = armAngles(c, 0, f0.L), R = armAngles(c, 1, f0.R);
    const body = c.body.replace('__WHEELS__', c.wheels);
    const shadow = `<ellipse class="shadow" cx="100" cy="${cid === 'pinpin' ? 192 : 186}" rx="46" ry="6" fill="${NI}" opacity=".12"/>`;
    const attrs = opts.standalone ? ' xmlns="http://www.w3.org/2000/svg" width="400" height="400"' : '';
    const cls = `mx ${cid} e-${e.k}${opts.cls ? ' ' + opts.cls : ''}`;
    const arms = arm(c, 0, L, ei, e.item) + arm(c, 1, R, ei, e.item);
    const behind = cid === 'orbi' && !e.front;
    return `<svg${attrs} viewBox="0 0 200 200" class="${cls}" role="img" aria-label="${c.name} ${e.label}"><title>${c.name}: ${e.label}</title>${shadow}<g class="rig">${behind ? arms : ''}${body}<g class="face">${face(c.face, e.face)}</g>${behind ? '' : arms}</g>${opts.noFx ? '' : fx(c, e.fx)}</svg>`;
  }

  // CSS keyframes for all characters x emotions
  function css() {
    let s = '';
    ['pinpin'].forEach((cid) => {
      const c = CH[cid], segs = c.arm.type ? ['lu', 'ru'] : ['lu', 'lf', 'ru', 'rf'];
      EMO.forEach((e) => {
        const fr = e.fr[cid], n = fr.length;
        segs.forEach((seg) => {
          const side = seg[0] === 'l' ? 0 : 1, part = seg[1] === 'u' ? 0 : 1;
          const name = `${cid}-${e.k}-${seg}`;
          const ks = fr.map((f, i) => `${(n === 1 ? 0 : (i / (n - 1)) * 100).toFixed(0)}%{transform:rotate(${armAngles(c, side, side === 0 ? f.L : f.R)[part].toFixed(1)}deg)}`).join('');
          s += `@keyframes ${name}{${ks}}.${cid}.e-${e.k}:not(.still) .${seg}{animation:${name} ${e.dur}s ease-in-out infinite ${e.dir}}\n`;
        });
        const bn = `${cid}-${e.k}-body`, bf = e.body.f, bnn = bf.length;
        s += `@keyframes ${bn}{${bf.map((t, i) => `${(i / (bnn - 1) * 100).toFixed(0)}%{transform:${t}}`).join('')}}.${cid}.e-${e.k}:not(.still) .rig{animation:${bn} ${e.body.dur}s ease-in-out infinite ${e.body.dir}}\n`;
        if (e.spin) s += `.${cid}.e-${e.k}:not(.still) .wheel{animation:spin .8s linear infinite}\n`;
        if (cid === 'orbi' && e.ant) { const an = `orbi-${e.k}-ant`, ad = e.k === 'semangat' || e.k === 'kaget' ? 0.16 : e.k === 'sedih' || e.k === 'tidur' ? 2 : 0.5; s += `@keyframes ${an}{0%{transform:rotate(${e.ant[0]}deg)}100%{transform:rotate(${e.ant[1]}deg)}}.orbi.e-${e.k} .ant{transform:rotate(${e.ant[0]}deg)}.orbi.e-${e.k}:not(.still) .ant{animation:${an} ${ad}s ease-in-out infinite alternate}\n`; }
      });
    });
    return s;
  }

  const api = { CH, EMO, svg, css };
  if (typeof module !== 'undefined') module.exports = api; else root.SKYPET = api;
})(this);

