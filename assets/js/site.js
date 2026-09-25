/* Revista Volcanes y Raíces — shared site script (all pages) */

  // ---- old single-page links (/#ficc, /#flipbook…) now live on their own pages ----
  (function(){
    if(location.pathname !== '/' && location.pathname !== '/index.html') return;
    const map = {
      '#ficc':'/ficc-2026', '#grano-de-oro':'/ficc-2026#grano-de-oro',
      '#flipbook':'/revista-volcanes-y-raices#ediciones', '#contenido':'/revista-volcanes-y-raices#articulos',
      '#editorial':'/revista-volcanes-y-raices#presentacion', '#negocios':'/revista-volcanes-y-raices#comercio',
      '#descubre':'/revista-volcanes-y-raices#fotografias', '#contacto':'/contacto'
    };
    if(map[location.hash]) location.replace(map[location.hash]);
  })();

  // ---- scroll nav state ----
  const nav = document.getElementById('nav');
  const setNavSolid = () => nav.classList.toggle('solid', window.scrollY > 40 || nav.classList.contains('menu-open'));
  window.addEventListener('scroll', setNavSolid, {passive:true});
  setNavSolid();

  // ---- mobile menu ----
  const navToggle = document.getElementById('navToggle');
  if(navToggle){
    const closeMenu = () => {
      nav.classList.remove('menu-open');
      navToggle.setAttribute('aria-expanded','false');
      navToggle.setAttribute('aria-label','Abrir menú');
      setNavSolid();
    };
    navToggle.addEventListener('click', ()=>{
      const open = !nav.classList.contains('menu-open');
      nav.classList.toggle('menu-open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      navToggle.setAttribute('aria-label', open ? 'Cerrar menú' : 'Abrir menú');
      setNavSolid();
    });
    document.querySelectorAll('#navMenu a').forEach(a=>a.addEventListener('click', closeMenu));
    document.addEventListener('keydown', e=>{ if(e.key === 'Escape' && nav.classList.contains('menu-open')){ closeMenu(); navToggle.focus(); } });
    window.matchMedia('(min-width:1061px)').addEventListener('change', e=>{ if(e.matches) closeMenu(); });
  }

  // ---- in-page section menu (FICC 2026 and Revista): highlight the section in view ----
  (function(){
    const links = [...document.querySelectorAll('.subnav a[href^="#"]')];
    if(!links.length) return;
    const targets = links.map(a=>document.querySelector(a.getAttribute('href'))).filter(Boolean);
    const setActive = (id) => links.forEach(a=>{
      const on = a.getAttribute('href') === '#'+id;
      a.classList.toggle('active', on);
      if(on){
        a.setAttribute('aria-current','true');
        const bar = a.closest('.subnav-scroll');
        if(bar) bar.scrollTo({left: a.offsetLeft - bar.clientWidth/2 + a.clientWidth/2, behavior:'smooth'});
      } else a.removeAttribute('aria-current');
    });
    const spy = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{ if(e.isIntersecting) setActive(e.target.id); });
    }, {rootMargin:'-45% 0px -50% 0px'});
    targets.forEach(t=>spy.observe(t));
  })();

  // ---- reveal on scroll ----
  const io = new IntersectionObserver((entries)=>{
    entries.forEach(e=>{ if(e.isIntersecting){ e.target.classList.add('in'); io.unobserve(e.target);} });
  }, {threshold:.15});
  document.querySelectorAll('[data-reveal]').forEach(el=>io.observe(el));

  // ---- current edition of the magazine ----
  // Comes from /api/current (the PDF the admin uploaded to Vercel Blob);
  // falls back to the revista.pdf that ships with the site.
  let PDF_HREF = '/revista.pdf';
  function setDownloadLinks(href){
    document.querySelectorAll('[data-pdf-link]').forEach(a=>{ a.href = href; });
  }
  setDownloadLinks(PDF_HREF);

  async function resolveCurrentPdf(){
    try{
      const ctrl = new AbortController();
      const timer = setTimeout(()=>ctrl.abort(), 4000);
      const res = await fetch('/api/current', {cache:'no-store', signal: ctrl.signal});
      clearTimeout(timer);
      if(!res.ok) return;
      const data = await res.json();
      if(data && data.url){
        PDF_HREF = data.url;
        setDownloadLinks(data.downloadUrl || data.url);
      }
    }catch(e){ /* no admin upload yet, or running locally: keep the bundled revista.pdf */ }
  }
  const revistaPdfReady = resolveCurrentPdf();

  // ---- gallery lightbox (Galería page and any [data-lightbox] link) ----
  (function(){
    const items = [...document.querySelectorAll('a[data-lightbox]')];
    if(!items.length) return;
    const box = document.createElement('dialog');
    box.className = 'lightbox';
    box.innerHTML = '<button type="button" class="lb-close" aria-label="Cerrar">×</button><button type="button" class="lb-prev" aria-label="Foto anterior">‹</button><figure><img alt=""><figcaption></figcaption></figure><button type="button" class="lb-next" aria-label="Foto siguiente">›</button>';
    document.body.appendChild(box);
    const img = box.querySelector('img'), cap = box.querySelector('figcaption');
    let idx = 0;
    const visible = () => items.filter(a=>!a.closest('[hidden]') && a.offsetParent !== null);
    function show(i){
      const list = visible(); if(!list.length) return;
      idx = (i + list.length) % list.length;
      const a = list[idx];
      img.src = a.getAttribute('href');
      img.alt = a.querySelector('img') ? a.querySelector('img').alt : '';
      cap.textContent = a.dataset.caption || '';
    }
    items.forEach(a=>a.addEventListener('click', e=>{
      if(typeof box.showModal !== 'function') return; // very old browsers: just open the image
      e.preventDefault();
      show(visible().indexOf(a));
      box.showModal();
    }));
    box.querySelector('.lb-close').addEventListener('click', ()=>box.close());
    box.querySelector('.lb-prev').addEventListener('click', ()=>show(idx-1));
    box.querySelector('.lb-next').addEventListener('click', ()=>show(idx+1));
    box.addEventListener('click', e=>{ if(e.target === box) box.close(); });
    box.addEventListener('keydown', e=>{ if(e.key==='ArrowRight') show(idx+1); if(e.key==='ArrowLeft') show(idx-1); });
  })();

  // ---- simple filter chips (Galería, Artículos) ----
  document.querySelectorAll('[data-filter-group]').forEach(group=>{
    const chips = group.querySelectorAll('[data-filter]');
    const targetSel = group.getAttribute('data-filter-group');
    const items = document.querySelectorAll(targetSel);
    const empty = document.querySelector(group.getAttribute('data-empty') || '#__none');
    chips.forEach(chip=>chip.addEventListener('click', ()=>{
      const f = chip.getAttribute('data-filter');
      chips.forEach(c=>c.setAttribute('aria-pressed', String(c === chip)));
      let shown = 0;
      items.forEach(it=>{
        const cats = (it.getAttribute('data-cat') || '').split(' ');
        const on = f === 'todos' || cats.includes(f);
        it.hidden = !on; if(on) shown++;
      });
      if(empty){ empty.hidden = shown > 0; if(!shown) empty.querySelector('[data-empty-label]').textContent = chip.textContent.trim(); }
    }));
  });

  // ---- preselect a form option from the link (?registro=patrocinador, ?interes=publicidad) ----
  (function(){
    const p = new URLSearchParams(location.search);
    const reg = {'grano-de-oro':'Concurso Grano de Oro','patrocinador':'Patrocinador','expositor':'Expositor / stand comercial','visitante':'Visitante','productor':'Productor de café'}[p.get('registro')];
    const tipo = document.getElementById('fc-tipo');
    if(reg && tipo){ tipo.value = reg; tipo.dispatchEvent(new Event('change')); }
    const int = {'publicidad':'Publicidad en la revista','colaboracion':'Colaboración','suscripcion':'Suscripción'}[p.get('interes')];
    const interes = document.getElementById('cf-interes');
    if(int && interes) interes.value = int;
  })();

  // ---- FICC 3D button in the hero: gentle idle sway, tilts toward the pointer on hover ----
  (function(){
    const link = document.getElementById('heroFicc');
    if(!link || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const card = link.querySelector('.hf-card');
    let cur = {rx:0, ry:0, ty:0}, target = {rx:0, ry:0, ty:0};
    let hovering = false, visible = true, raf = null, t0 = performance.now();

    function frame(now){
      const t = (now - t0) / 1000;
      if(!hovering){ // slow figure-eight sway while idle
        target.rx = Math.sin(t * 1.1) * 5;
        target.ry = Math.sin(t * 0.7) * 10;
        target.ty = Math.sin(t * 1.1) * -4;
      }
      cur.rx += (target.rx - cur.rx) * 0.12;
      cur.ry += (target.ry - cur.ry) * 0.12;
      cur.ty += (target.ty - cur.ty) * 0.12;
      card.style.setProperty('--rx', cur.rx.toFixed(2) + 'deg');
      card.style.setProperty('--ry', cur.ry.toFixed(2) + 'deg');
      card.style.setProperty('--ty', cur.ty.toFixed(2) + 'px');
      raf = visible ? requestAnimationFrame(frame) : null;
    }
    function start(){ if(!raf) raf = requestAnimationFrame(frame); }

    link.addEventListener('pointermove', (e)=>{
      if(e.pointerType !== 'mouse') return;
      hovering = true;
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width, py = (e.clientY - r.top) / r.height;
      target.ry = (px - 0.5) * 26;
      target.rx = (0.5 - py) * 18;
      target.ty = -6;
      card.style.setProperty('--mx', (px * 100).toFixed(1) + '%');
      card.style.setProperty('--my', (py * 100).toFixed(1) + '%');
    });
    link.addEventListener('pointerleave', ()=>{ hovering = false; card.style.setProperty('--mx','50%'); card.style.setProperty('--my','50%'); });
    link.addEventListener('pointerdown', ()=>{ target.ty = 2; });

    new IntersectionObserver((entries)=>{
      visible = entries[0].isIntersecting;
      if(visible) start();
    }).observe(link);
    start();
  })();

  // ---- FICC 2026: countdown + registration form (FormSubmit AJAX to the festival's email) ----
  (function(){
    const countEl = document.getElementById('ficcCount');
    if(countEl){
      // festival runs Dec 18–22, 2026 (Mexico City time)
      const start = new Date('2026-12-18T00:00:00-06:00');
      const end = new Date('2026-12-23T00:00:00-06:00');
      const now = new Date();
      if(now < start){
        const days = Math.ceil((start - now) / 86400000);
        countEl.innerHTML = `<strong>${days}</strong><span>${days === 1 ? 'día' : 'días'} para el festival</span>`;
      } else if(now < end){
        countEl.innerHTML = '<strong>¡Hoy!</strong><span>El festival está en curso en el Parque Central</span>';
      } else {
        countEl.innerHTML = '<span>Gracias por acompañarnos en la edición 2026</span>';
      }
    }

    const form = document.getElementById('ficcForm');
    if(!form) return;
    const btn = document.getElementById('fcBtn');
    const errEl = document.getElementById('fcError');
    const okEl = document.getElementById('fcSuccess');
    const checkLabel = document.getElementById('fcCheckLabel');
    const val = (id) => document.getElementById(id).value.trim();

    // Concurso Grano de Oro: extra fields appear (and become required) only for contest participants
    const tipoSel = document.getElementById('fc-tipo');
    const gdoFields = document.getElementById('gdoFields');
    const gdoCheckLabel = document.getElementById('gdoCheckLabel');
    const GDO = 'Concurso Grano de Oro';
    const isGdo = () => tipoSel.value === GDO;
    function syncGdo(){
      const on = isGdo();
      gdoFields.hidden = !on;
      gdoFields.querySelectorAll('[data-gdo-required]').forEach(el=>{ el.required = on; });
      document.getElementById('gd-muestras').required = on;
    }
    tipoSel.addEventListener('change', syncGdo);
    document.getElementById('gd-muestras').addEventListener('change', e=>{ if(e.target.checked) gdoCheckLabel.classList.remove('bad'); });
    document.getElementById('fc-acepto').addEventListener('change', e=>{ if(e.target.checked) checkLabel.classList.remove('bad'); });
    syncGdo();
    // buttons/links that jump to the form with an option already chosen (Grano de Oro, expositor…)
    document.querySelectorAll('#gdoJoin, [data-registro]').forEach(el=>el.addEventListener('click', (e)=>{
      e.preventDefault();
      tipoSel.value = el.getAttribute('data-registro') || GDO;
      syncGdo();
      form.scrollIntoView({behavior:'smooth', block:'start'});
      setTimeout(()=>document.getElementById('fc-nombre').focus({preventScroll:true}), 600);
    }));

    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      errEl.hidden = true;
      if(form.querySelector('[name="_honey"]').value) return; // bot

      let valid = true;
      form.querySelectorAll('[required]').forEach(el=>{
        el.classList.add('touched');
        if(!el.checkValidity()) valid = false;
      });
      const accepted = document.getElementById('fc-acepto').checked;
      checkLabel.classList.toggle('bad', !accepted);
      const samplesOk = !isGdo() || document.getElementById('gd-muestras').checked;
      gdoCheckLabel.classList.toggle('bad', !samplesOk);
      if(!valid || !accepted || !samplesOk){
        errEl.textContent = 'Completa los campos obligatorios marcados con *.';
        errEl.hidden = false;
        const firstBad = form.querySelector('[required]:invalid');
        if(firstBad) firstBad.focus();
        return;
      }

      const tipo = val('fc-tipo');
      const nombre = val('fc-nombre');
      btn.disabled = true;
      btn.textContent = 'Enviando…';
      try{
        const gdo = isGdo();
        const payload = {
          _subject: gdo ? `Registro Concurso Grano de Oro - ${nombre}` : `Nuevo registro FICC 2026 - ${tipo} - ${nombre}`,
          _template: 'table',
          _captcha: 'false',
          _autoresponse: 'Gracias por registrarte al Festival Internacional del Café Cacahoatán 2026 (18 al 22 de diciembre, Parque Central de Cacahoatán, Chiapas). El comité organizador te contactará pronto. Informes por WhatsApp: 962 257 0907.',
          'Tipo de registro': tipo,
          'Nombre': nombre,
          'email': val('fc-correo'),
          'WhatsApp / teléfono': val('fc-tel'),
          'Ciudad y estado': val('fc-ciudad') || '—',
          'País': val('fc-pais') || '—',
          'Empresa, finca o marca': val('fc-empresa') || '—',
          'Personas que asistirán': val('fc-personas') || '1',
          'Comentarios': val('fc-msg') || '—',
          'Acepta ser contactado': 'Sí'
        };
        if(gdo){
          payload._autoresponse = 'Gracias por inscribirte al Concurso Grano de Oro del Festival Internacional del Café Cacahoatán 2026. Recuerda entregar dos muestras (una Arábica y una Robusta) en bolsas de papel selladas e identificadas con: nombre del productor, ubicación de la parcela, altitud, variedad, fecha de cosecha y tipo de beneficiado. El comité te contactará con la fecha y el lugar de entrega. Informes por WhatsApp: 962 257 0907.';
          Object.assign(payload, {
            'Productor': nombre,
            'Ubicación de la parcela': val('gd-parcela'),
            'Altitud (msnm)': val('gd-altitud'),
            'Fecha de cosecha': val('gd-cosecha'),
            'Tipo de beneficiado': val('gd-beneficio'),
            'Variedades': 'Arábica y Robusta (2 muestras)',
            'Confirma entrega de muestras': 'Sí'
          });
        }
        const res = await fetch('https://formsubmit.co/ajax/ficc.cacahoatan2026@gmail.com', {
          method:'POST',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body: JSON.stringify(payload)
        });
        if(!res.ok) throw new Error('send failed');
        form.querySelectorAll('.field, .field-row, .ficc-check, .form-submit, .form-intro, .gdo-fields').forEach(el=>el.style.display='none');
        if(gdo) okEl.innerHTML = '<strong>¡Inscripción recibida!</strong><br>Ya estás registrado en el Concurso Grano de Oro. El comité te contactará con la fecha y el lugar para entregar tus dos muestras.';
        okEl.hidden = false;
        okEl.scrollIntoView({behavior:'smooth', block:'center'});
      }catch(err){
        errEl.textContent = 'No se pudo enviar tu registro en este momento. Intenta de nuevo o escribe por WhatsApp al 962 257 0907.';
        errEl.hidden = false;
        btn.disabled = false;
        btn.textContent = 'Enviar mi registro';
      }
    });
  })();
  // ---- contact form (FormSubmit AJAX: no backend needed, sends straight to the magazine's email) ----
  const infoForm = document.getElementById('infoForm');
  if(infoForm){
    const formBtn = document.getElementById('formBtn');
    const formError = document.getElementById('formError');
    const formSuccess = document.getElementById('formSuccess');

    infoForm.addEventListener('submit', async (e)=>{
      e.preventDefault();
      formError.hidden = true;

      // honeypot: silently drop bot submissions
      if(infoForm.querySelector('[name="_honey"]').value){ return; }

      // validate required fields
      let valid = true;
      infoForm.querySelectorAll('[required]').forEach(el=>{
        el.classList.add('touched');
        if(!el.checkValidity()) valid = false;
      });
      const emailEl = document.getElementById('cf-correo');
      if(!emailEl.checkValidity()) valid = false;
      if(!valid){
        formError.hidden = false;
        return;
      }

      formBtn.disabled = true;
      formBtn.textContent = 'Enviando…';
      try{
        const payload = {
          _subject: 'Nueva solicitud de información - Revista Volcanes y Raíces',
          _template: 'table',
          _captcha: 'false',
          'Nombre': document.getElementById('cf-nombre').value.trim(),
          'Empresa': document.getElementById('cf-empresa').value.trim() || '—',
          'Correo': emailEl.value.trim(),
          'Telefono': document.getElementById('cf-celular').value.trim() || '—',
          'Ciudad': document.getElementById('cf-ciudad').value.trim() || '—',
          'Tipo de interes': document.getElementById('cf-interes').value,
          'Mensaje': document.getElementById('cf-mensaje').value.trim()
        };
        const res = await fetch('https://formsubmit.co/ajax/revista.volcanesyraices@gmail.com', {
          method:'POST',
          headers:{'Content-Type':'application/json','Accept':'application/json'},
          body: JSON.stringify(payload)
        });
        if(!res.ok) throw new Error('send failed');
        infoForm.querySelectorAll('.field, .field-row, .form-submit').forEach(el=>el.style.display='none');
        formSuccess.hidden = false;
      }catch(err){
        formError.textContent = 'No se pudo enviar en este momento. Intenta de nuevo o escríbenos directo a revista.volcanesyraices@gmail.com';
        formError.hidden = false;
        formBtn.disabled = false;
        formBtn.textContent = 'Enviar solicitud';
      }
    });
  }