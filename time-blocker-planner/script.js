(() => {
  const HOUR_H = 60;      // tinggi satu jam (px), samakan dengan --hour-h di CSS
  const SNAP = 30;        // satuan terkecil (menit)
  const DAY = 1440;
  const KEY = 'timeblocker.v1';
  const $ = (s) => document.querySelector(s);
  const pad = (n) => String(n).padStart(2, '0');

  /* ---------- Data ---------- */
  const defaultCats = [
    { id: 'kuliah',    name: 'Kuliah',          color: '#4f6df5' },
    { id: 'belajar',   name: 'Belajar mandiri', color: '#12a08a' },
    { id: 'proyek',    name: 'Proyek & tugas',  color: '#8b5cf6' },
    { id: 'istirahat', name: 'Istirahat',       color: '#f0a030' },
    { id: 'olahraga',  name: 'Olahraga',        color: '#43a047' },
    { id: 'pribadi',   name: 'Pribadi',         color: '#e8548a' },
  ];

  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parseYmd = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
  const fmt = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  function load() {
    try {
      const raw = JSON.parse(localStorage.getItem(KEY));
      if (raw && Array.isArray(raw.cats) && Array.isArray(raw.blocks)) return raw;
    } catch (e) { /* abaikan, pakai data awal */ }
    const t = ymd(new Date());
    return {
      cats: defaultCats,
      blocks: [
        { id: uid(), date: t, title: 'Kuliah pagi',     cat: 'kuliah',    start: 480,  end: 600,  locked: true },
        { id: uid(), date: t, title: 'Makan & istirahat', cat: 'istirahat', start: 720,  end: 780,  locked: false },
        { id: uid(), date: t, title: 'Kerjakan proyek UAS', cat: 'proyek',  start: 810,  end: 930,  locked: false },
        { id: uid(), date: t, title: 'Olahraga ringan',  cat: 'olahraga',  start: 1020, end: 1080, locked: false },
      ],
    };
  }
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { toast('Penyimpanan browser tidak tersedia, data tidak akan tersimpan.'); }
  }

  let state = load();
  let currentDate = ymd(new Date());

  const catOf = (id) => state.cats.find((c) => c.id === id) || state.cats[0];
  const dayBlocks = () => state.blocks.filter((b) => b.date === currentDate).sort((a, b) => a.start - b.start);
  const findConflict = (date, start, end, ignoreId) =>
    state.blocks.find((b) => b.date === date && b.id !== ignoreId && b.start < end && start < b.end);

  function onColor(hex) {
    const n = parseInt(hex.slice(1), 16);
    const r = n >> 16, g = (n >> 8) & 255, b = n & 255;
    return (0.299 * r + 0.587 * g + 0.114 * b) > 150 ? '#14181f' : '#ffffff';
  }

  /* ---------- Elemen ---------- */
  const labels = $('#labels'), slots = $('#slots'), ghost = $('#ghost'), scroller = $('#scroller');
  const dlg = $('#dlg'), form = $('#blockForm');
  const fTitle = $('#fTitle'), fCat = $('#fCat'), fStart = $('#fStart'), fEnd = $('#fEnd'), fLock = $('#fLock');
  const fError = $('#fError'), fDelete = $('#fDelete');
  let editId = null;

  const LOCK_SVG = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-label="Terkunci"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>';

  /* ---------- Toast ---------- */
  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }

  /* ---------- Render ---------- */
  function buildGrid() {
    for (let h = 0; h < 24; h++) {
      const d = document.createElement('div');
      d.className = 'hour';
      d.style.top = h * HOUR_H + 'px';
      d.textContent = `${pad(h)}:00`;
      labels.appendChild(d);
    }
  }

  function fillTimeOptions() {
    fStart.innerHTML = ''; fEnd.innerHTML = '';
    for (let m = 0; m < DAY; m += SNAP) fStart.add(new Option(fmt(m), m));
    for (let m = SNAP; m <= DAY; m += SNAP) fEnd.add(new Option(fmt(m), m));
  }

  function fillCatOptions(selected) {
    fCat.innerHTML = '';
    state.cats.forEach((c) => fCat.add(new Option(c.name, c.id)));
    if (selected) fCat.value = selected;
  }

  function render() {
    const d = parseYmd(currentDate);
    $('#dateLabel').textContent = d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    $('#datePick').value = currentDate;

    slots.querySelectorAll('.block, .nowline').forEach((n) => n.remove());

    dayBlocks().forEach((b) => {
      const c = catOf(b.cat);
      const el = document.createElement('div');
      el.className = 'block' + (b.locked ? ' locked' : '');
      el.dataset.id = b.id;
      el.tabIndex = 0;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', `${b.title}, ${fmt(b.start)} sampai ${fmt(b.end)}, ${c.name}${b.locked ? ', terkunci' : ''}`);
      el.style.setProperty('--c', c.color);
      el.style.setProperty('--on-c', onColor(c.color));
      placeBlock(el, b.start, b.end);

      const name = document.createElement('div');
      name.className = 'name';
      if (b.locked) name.insertAdjacentHTML('beforeend', LOCK_SVG);
      const t = document.createElement('span');
      t.textContent = b.title;
      name.appendChild(t);
      const time = document.createElement('div');
      time.className = 'time';
      time.textContent = `${fmt(b.start)} – ${fmt(b.end)}`;
      el.append(name, time);

      if (!b.locked) {
        const h = document.createElement('div');
        h.className = 'resize';
        el.appendChild(h);
      }
      slots.appendChild(el);
    });

    renderNow();
    renderSummary();
  }

  function placeBlock(el, start, end) {
    el.style.top = (start / 60) * HOUR_H + 1 + 'px';
    el.style.height = ((end - start) / 60) * HOUR_H - 2 + 'px';
    el.classList.toggle('short', end - start <= 30);
    const time = el.querySelector('.time');
    if (time) time.textContent = `${fmt(start)} – ${fmt(end)}`;
  }

  function renderNow() {
    slots.querySelectorAll('.nowline').forEach((n) => n.remove());
    if (currentDate !== ymd(new Date())) return;
    const now = new Date();
    const m = now.getHours() * 60 + now.getMinutes();
    const line = document.createElement('div');
    line.className = 'nowline';
    line.style.top = (m / 60) * HOUR_H + 'px';
    line.setAttribute('aria-hidden', 'true');
    slots.appendChild(line);
  }

  function renderSummary() {
    const blocks = dayBlocks();
    const total = blocks.reduce((s, b) => s + (b.end - b.start), 0);
    $('#summary').textContent = `${blocks.length} blok · ${(total / 60).toFixed(1).replace('.0', '')} jam terjadwal, ${((DAY - total) / 60).toFixed(1).replace('.0', '')} jam masih kosong`;
    const ul = $('#legend');
    ul.innerHTML = '';
    state.cats.forEach((c) => {
      const mins = blocks.filter((b) => b.cat === c.id).reduce((s, b) => s + (b.end - b.start), 0);
      const li = document.createElement('li');
      li.style.setProperty('--c', c.color);
      const sw = document.createElement('span'); sw.className = 'swatch';
      const nm = document.createElement('span'); nm.textContent = c.name;
      const hr = document.createElement('span'); hr.className = 'hrs';
      hr.textContent = (mins / 60).toFixed(1).replace('.0', '') + ' jam';
      const bar = document.createElement('div'); bar.className = 'bar';
      bar.innerHTML = `<i style="width:${(mins / DAY) * 100}%"></i>`;
      li.append(sw, nm, hr, bar);
      ul.appendChild(li);
    });
  }

  /* ---------- Dialog ---------- */
  function openDialog(opts) {
    editId = opts.id || null;
    const b = editId ? state.blocks.find((x) => x.id === editId) : null;
    fillCatOptions(b ? b.cat : opts.cat || state.cats[0].id);
    fTitle.value = b ? b.title : '';
    fStart.value = b ? b.start : opts.start;
    fEnd.value = b ? b.end : opts.end;
    fLock.checked = b ? b.locked : false;
    fError.textContent = '';
    const locked = !!(b && b.locked);
    [fTitle, fCat, fStart, fEnd].forEach((el) => (el.disabled = locked));
    fDelete.style.display = b ? '' : 'none';
    fDelete.disabled = locked;
    $('#dlgTitle').textContent = b ? (locked ? 'Blok terkunci' : 'Edit blok') : 'Blok baru';
    if (locked) fError.textContent = 'Buka kunci dulu jika ingin mengubah, memindah, atau menghapus blok ini.';
    dlg.showModal();
    if (!locked) fTitle.focus();
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const existing = editId ? state.blocks.find((x) => x.id === editId) : null;

    if (existing && existing.locked) {          // hanya status kunci yang boleh berubah
      existing.locked = fLock.checked;
      save(); render(); dlg.close();
      if (!existing.locked) toast('Kunci dibuka.');
      return;
    }

    const start = Number(fStart.value), end = Number(fEnd.value);
    if (end <= start) { fError.textContent = 'Jam selesai harus lebih besar dari jam mulai.'; return; }
    const clash = findConflict(currentDate, start, end, editId);
    if (clash) {
      fError.textContent = `Bentrok dengan "${clash.title}" (${fmt(clash.start)}–${fmt(clash.end)})${clash.locked ? ', yang sedang terkunci' : ''}.`;
      return;
    }
    const data = {
      title: fTitle.value.trim() || catOf(fCat.value).name,
      cat: fCat.value, start, end, locked: fLock.checked,
    };
    if (existing) Object.assign(existing, data);
    else state.blocks.push({ id: uid(), date: currentDate, ...data });
    save(); render(); dlg.close();
  });

  $('#fCancel').addEventListener('click', () => dlg.close());
  fDelete.addEventListener('click', () => {
    if (!editId) return;
    state.blocks = state.blocks.filter((b) => b.id !== editId);
    save(); render(); dlg.close(); toast('Blok dihapus.');
  });
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });

  /* ---------- Interaksi grid ---------- */
  const yToMin = (clientY) => {
    const r = slots.getBoundingClientRect();
    return clamp(((clientY - r.top) / HOUR_H) * 60, 0, DAY);
  };
  const snapDown = (m) => Math.floor(m / SNAP) * SNAP;

  slots.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    const blockEl = e.target.closest('.block');
    if (blockEl) startBlockDrag(e, blockEl);
    else startSelect(e);
  });

  // Layar sentuh: ketuk = buat blok 1 jam / buka blok
  slots.addEventListener('click', (e) => {
    if (e.pointerType !== 'touch') return;
    const blockEl = e.target.closest('.block');
    if (blockEl) return openDialog({ id: blockEl.dataset.id });
    const start = clamp(Math.floor(yToMin(e.clientY) / 60) * 60, 0, DAY - 60);
    openDialog({ start, end: start + 60 });
  });

  slots.addEventListener('keydown', (e) => {
    const blockEl = e.target.closest('.block');
    if (blockEl && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      openDialog({ id: blockEl.dataset.id });
    }
  });

  function startSelect(e) {
    const anchor = snapDown(yToMin(e.clientY));
    let start = anchor, end = anchor + SNAP, moved = false;
    const draw = () => {
      ghost.style.display = 'block';
      ghost.style.top = (start / 60) * HOUR_H + 'px';
      ghost.style.height = ((end - start) / 60) * HOUR_H + 'px';
      ghost.classList.toggle('bad', !!findConflict(currentDate, start, end));
    };
    const move = (ev) => {
      const cur = snapDown(yToMin(ev.clientY));
      start = Math.min(anchor, cur);
      end = Math.min(DAY, Math.max(anchor, cur) + SNAP);
      moved = true;
      draw();
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      ghost.style.display = 'none';
      const clash = findConflict(currentDate, start, end);
      if (clash) {
        toast(`Waktu itu bentrok dengan "${clash.title}"${clash.locked ? ' (terkunci)' : ''}.`);
        return;
      }
      openDialog({ start, end: moved ? end : Math.min(DAY, start + 60) });
    };
    draw();
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  function startBlockDrag(e, el) {
    const b = state.blocks.find((x) => x.id === el.dataset.id);
    if (!b) return;
    if (b.locked) {                      // blok terkunci: hanya bisa dibuka detailnya
      const up = () => { window.removeEventListener('pointerup', up); openDialog({ id: b.id }); };
      window.addEventListener('pointerup', up);
      return;
    }
    const mode = e.target.classList.contains('resize') ? 'resize' : 'move';
    const startY = e.clientY, dur = b.end - b.start;
    let moved = false, ns = b.start, ne = b.end;

    const move = (ev) => {
      const dy = ev.clientY - startY;
      if (Math.abs(dy) > 4) moved = true;
      if (!moved) return;
      el.classList.add('dragging');
      const delta = Math.round(((dy / HOUR_H) * 60) / SNAP) * SNAP;
      if (mode === 'move') {
        ns = clamp(b.start + delta, 0, DAY - dur);
        ne = ns + dur;
      } else {
        ns = b.start;
        ne = clamp(b.end + delta, b.start + SNAP, DAY);
      }
      placeBlock(el, ns, ne);
      el.classList.toggle('conflict', !!findConflict(currentDate, ns, ne, b.id));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      if (!moved) return openDialog({ id: b.id });
      const clash = findConflict(currentDate, ns, ne, b.id);
      if (clash) {
        toast(`Tidak bisa dipindah: bentrok dengan "${clash.title}"${clash.locked ? ' (terkunci)' : ''}.`);
      } else {
        b.start = ns; b.end = ne; save();
      }
      render();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
  }

  /* ---------- Kontrol lain ---------- */
  const shiftDay = (n) => { const d = parseYmd(currentDate); d.setDate(d.getDate() + n); currentDate = ymd(d); render(); };
  $('#prev').addEventListener('click', () => shiftDay(-1));
  $('#next').addEventListener('click', () => shiftDay(1));
  $('#today').addEventListener('click', () => { currentDate = ymd(new Date()); render(); scrollToNow(); });
  $('#datePick').addEventListener('change', (e) => { if (e.target.value) { currentDate = e.target.value; render(); } });

  $('#addBtn').addEventListener('click', () => {
    const taken = dayBlocks();
    let start = 0;
    for (let m = 6 * 60; m <= DAY - 60; m += SNAP) {       // cari jam kosong pertama sejak 06:00
      if (!findConflict(currentDate, m, m + 60)) { start = m; break; }
    }
    openDialog({ start, end: Math.min(DAY, start + 60) });
  });

  $('#lockAll').addEventListener('click', () => {
    const list = dayBlocks();
    if (!list.length) return toast('Belum ada blok di hari ini.');
    list.forEach((b) => (b.locked = true));
    save(); render(); toast('Semua blok hari ini dikunci.');
  });
  $('#unlockAll').addEventListener('click', () => {
    dayBlocks().forEach((b) => (b.locked = false));
    save(); render(); toast('Semua kunci hari ini dibuka.');
  });

  $('#catForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#catName').value.trim();
    if (!name) return;
    if (state.cats.some((c) => c.name.toLowerCase() === name.toLowerCase())) return toast('Nama kategori sudah ada.');
    state.cats.push({ id: 'c' + uid(), name, color: $('#catColor').value });
    $('#catName').value = '';
    save(); render(); toast(`Kategori "${name}" ditambahkan.`);
  });

  function scrollToNow() {
    const isToday = currentDate === ymd(new Date());
    const now = new Date();
    const m = isToday ? now.getHours() * 60 + now.getMinutes() : 7 * 60;
    scroller.scrollTop = Math.max(0, (m / 60) * HOUR_H - 120);
  }

  /* ---------- Mulai ---------- */
  buildGrid();
  fillTimeOptions();
  render();
  scrollToNow();
  setInterval(renderNow, 60000);
})();
