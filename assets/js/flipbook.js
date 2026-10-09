/* Revista Volcanes y Raíces — flipbook (Revista page only). Needs site.js loaded first. */
  const bookEl = document.getElementById('book');
  const loadingEl = document.getElementById('bookLoading');
  const pageNumEl = document.getElementById('pageNum');
  const pageTotalEl = document.getElementById('pageTotal');
  const prevBtn = document.getElementById('prevBtn');
  const nextBtn = document.getElementById('nextBtn');
  const thumbsEl = document.getElementById('thumbs');

  let pdfDoc = null, pageFlip = null, totalPages = 0;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);

  function refreshUI(){
    if(!pageFlip) return;
    const i = pageFlip.getCurrentPageIndex();
    pageNumEl.textContent = i+1;
    prevBtn.disabled = i<=0;
    nextBtn.disabled = i>=totalPages-1;
    document.querySelectorAll('.thumb').forEach((t,idx)=>t.classList.toggle('active', idx===i));
    const activeThumb = document.querySelector('.thumb.active');
    // scroll only the thumbnail strip sideways; scrollIntoView would also jump the whole page to the flipbook
    if(activeThumb) thumbsEl.scrollTo({left: activeThumb.offsetLeft - thumbsEl.clientWidth/2 + activeThumb.clientWidth/2, behavior:'smooth'});
  }

  async function renderPageToCanvas(pageNum, canvas, targetWidthPx){
    const page = await pdfDoc.getPage(pageNum);
    const base = page.getViewport({scale: 1});
    // cap canvas size to stay well under mobile browser limits
    const safeWidth = Math.min(targetWidthPx, 2000);
    const scale = safeWidth / base.width;
    const viewport = page.getViewport({scale});
    // draw off-screen first, then swap in: the visible page never goes blank while it re-renders
    const off = document.createElement('canvas');
    off.width = Math.floor(viewport.width);
    off.height = Math.floor(viewport.height);
    await page.render({canvasContext: off.getContext('2d'), viewport}).promise;
    canvas.width = off.width;
    canvas.height = off.height;
    canvas.getContext('2d').drawImage(off, 0, 0);
    off.width = off.height = 0; // release the temporary buffer right away
  }

  async function initFlipbook(){
    try{
      if(typeof pdfjsLib === 'undefined'){
        throw new Error('pdf.js no se cargó.');
      }
      try{
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/assets/vendor/pdf.worker.min.js';
      }catch(e){ /* fine, will fall back to main-thread rendering */ }

      await revistaPdfReady;
      pdfDoc = await pdfjsLib.getDocument({ url: PDF_HREF, isEvalSupported: false }).promise;
      totalPages = pdfDoc.numPages;
      pageTotalEl.textContent = totalPages;
      const statPages = document.getElementById('statPages');
      if(statPages) statPages.textContent = totalPages;

      // build page + thumb containers
      const frag = document.createDocumentFragment();
      const canvases = [];
      for(let i=1;i<=totalPages;i++){
        const pageDiv = document.createElement('div');
        pageDiv.className = 'page';
        if(i===1 || i===totalPages) pageDiv.setAttribute('data-density','hard');
        const canvas = document.createElement('canvas');
        pageDiv.appendChild(canvas);
        frag.appendChild(pageDiv);
        canvases.push(canvas);
      }
      bookEl.appendChild(frag);

      // fast first pass so the book appears almost instantly
      const FIRST_W = 1000;
      await renderPageToCanvas(1, canvases[0], FIRST_W);
      if(canvases[1]) await renderPageToCanvas(2, canvases[1], FIRST_W);

      // use the PDF's real page proportions so pages are never stretched
      const firstVp = (await pdfDoc.getPage(1)).getViewport({scale: 1});
      const pageRatio = firstVp.height / firstVp.width;
      const isMobile = window.matchMedia('(max-width:640px)').matches;
      const baseW = isMobile ? Math.min(380, window.innerWidth-56) : 480;
      const baseH = Math.round(baseW * pageRatio);
      // keep a whole page visible on screen (room left for the top bar and the controls)
      const fitH = Math.max(340, window.innerHeight - 190);

      pageFlip = new St.PageFlip(bookEl, {
        width: baseW,
        height: baseH,
        size: "stretch",
        minWidth: 240,
        maxWidth: Math.round(Math.min(780, fitH / pageRatio)),
        minHeight: Math.round(240 * pageRatio),
        maxHeight: Math.round(Math.min(780 * pageRatio, fitH)),
        maxShadowOpacity: 0.5,
        showCover: true,
        usePortrait: true,
        mobileScrollSupport: true,
        useMouseEvents: true,
        flippingTime: 600
      });
      pageFlip.loadFromHTML(document.querySelectorAll('#book .page'));
      pageFlip.on('flip', refreshUI);
      pageFlip.on('init', refreshUI);
      refreshUI();
      loadingEl.style.display = 'none';

      prevBtn.addEventListener('click', ()=>{ if(currentScale<=1) pageFlip.flipPrev(); });
      nextBtn.addEventListener('click', ()=>{ if(currentScale<=1) pageFlip.flipNext(); });
      document.addEventListener('keydown', (e)=>{
        if(currentScale>1) return;
        if(e.key==='ArrowRight') pageFlip.flipNext();
        if(e.key==='ArrowLeft') pageFlip.flipPrev();
      });

      // ---- zoom + pan: only the book viewport is clipped; controls stay put below ----
      const viewport = document.getElementById('bookViewport') || bookEl.parentElement;
      const zoomInBtn = document.getElementById('zoomInBtn');
      const zoomOutBtn = document.getElementById('zoomOutBtn');
      if(zoomOutBtn) zoomOutBtn.disabled = true;
      const minScale = 1, maxScale = 3.2, zoomStep = 0.5;

      let currentScale = 1;
      let bookNatW = 0, bookNatH = 0;   // #book natural size
      let naturalLeft = 0, naturalTop = 0; // #book resting position inside the viewport
      let offX = 0, offY = 0;           // visual top-left of #book inside the viewport
      const activePointers = new Map();
      let dragLast = null, pinchStart = null;

      function clamp(v, min, max){ return Math.min(max, Math.max(min, v)); }

      function measureRest(){
        const vr = viewport.getBoundingClientRect();
        const br = bookEl.getBoundingClientRect();
        naturalLeft = br.left - vr.left;
        naturalTop = br.top - vr.top;
        bookNatW = br.width;
        bookNatH = br.height;
      }

      function lockViewport(){
        // freeze the viewport at its resting size so nothing below moves while zoomed
        viewport.style.height = viewport.offsetHeight + 'px';
        viewport.classList.add('zoomed');
      }

      // the part of the book that has a page: cover sits on the right half, back cover on the left
      function pageSpan(){
        let landscape = true;
        try { landscape = pageFlip.getOrientation() === 'landscape'; } catch(e){}
        if(!landscape) return [0, 1];
        const i = pageFlip.getCurrentPageIndex();
        if(i === 0) return [0.5, 1];
        if(i === totalPages - 1 && totalPages % 2 === 0) return [0, 0.5];
        return [0, 1];
      }
      function visibleFrac(){ const s = pageSpan(); return (s[0] + s[1]) / 2; }

      // keep the visible page(s) filling the view; never pan out onto the empty half of the cover spread
      function clampOffset(x, y, scale){
        const vw = viewport.clientWidth, vh = viewport.clientHeight;
        const span = pageSpan();
        const cw = bookNatW * scale, ch = bookNatH * scale;
        const lo = span[0] * cw, hi = span[1] * cw, rw = hi - lo;
        return {
          x: rw <= vw ? (vw - rw) / 2 - lo : clamp(x, vw - hi, -lo),
          y: ch <= vh ? (vh - ch) / 2 : clamp(y, vh - ch, 0)
        };
      }

      function render(){
        bookEl.style.transform = `translate(${offX - naturalLeft}px, ${offY - naturalTop}px) scale(${currentScale})`;
      }

      function resetZoom(){
        currentScale = 1;
        bookEl.style.transform = '';
        viewport.classList.remove('zoomed');
        viewport.style.height = '';
        if(zoomOutBtn) zoomOutBtn.disabled = true;
        if(zoomInBtn) zoomInBtn.disabled = false;
      }

      function syncButtons(){
        if(zoomOutBtn) zoomOutBtn.disabled = currentScale <= minScale;
        if(zoomInBtn) zoomInBtn.disabled = currentScale >= maxScale;
      }

      function setZoom(scale, focusClientX, focusClientY){
        const prevScale = currentScale;
        const newScale = clamp(scale, minScale, maxScale);
        if(newScale === prevScale) return;
        if(newScale === minScale){ resetZoom(); return; }

        if(prevScale === 1){
          measureRest();
          lockViewport();
          offX = naturalLeft; offY = naturalTop;
        }
        const vr = viewport.getBoundingClientRect();
        const vw = viewport.clientWidth, vh = viewport.clientHeight;

        if(prevScale === 1 && focusClientX == null){
          // first zoom from the buttons: bring the visible page to the middle
          const px = bookNatW * visibleFrac(), py = bookNatH / 2;
          offX = vw / 2 - px * newScale;
          offY = vh / 2 - py * newScale;
        } else {
          const fx = focusClientX != null ? focusClientX - vr.left : vw / 2;
          const fy = focusClientY != null ? focusClientY - vr.top : vh / 2;
          const ratio = newScale / prevScale;
          offX = fx - ratio * (fx - offX);
          offY = fy - ratio * (fy - offY);
        }
        currentScale = newScale;
        const c = clampOffset(offX, offY, currentScale);
        offX = c.x; offY = c.y;
        render(); syncButtons();
      }

      if(zoomInBtn) zoomInBtn.addEventListener('click', ()=>setZoom(currentScale + zoomStep));
      if(zoomOutBtn) zoomOutBtn.addEventListener('click', ()=>setZoom(currentScale - zoomStep));
      viewport.addEventListener('dblclick', (e)=>setZoom(currentScale > 1 ? 1 : 2, e.clientX, e.clientY));
      viewport.addEventListener('wheel', (e)=>{
        if(!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        setZoom(currentScale + (e.deltaY > 0 ? -0.3 : 0.3), e.clientX, e.clientY);
      }, {passive:false});
      // a resize (or fullscreen toggle) changes the book size: start again from the whole view
      window.addEventListener('resize', ()=>{ if(currentScale > 1) resetZoom(); });
      pageFlip.on('flip', ()=>{ if(currentScale > 1) resetZoom(); });

      viewport.addEventListener('pointerdown', (e)=>{
        activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
        if(activePointers.size === 1 && currentScale > 1){
          viewport.setPointerCapture(e.pointerId);
          dragLast = {x:e.clientX, y:e.clientY};
        } else if(activePointers.size === 2){
          viewport.setPointerCapture(e.pointerId);
          if(currentScale === 1){ measureRest(); lockViewport(); offX = naturalLeft; offY = naturalTop; }
          const pts = [...activePointers.values()];
          pinchStart = {
            dist: Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y),
            scale: currentScale, offX, offY,
            midX:(pts[0].x+pts[1].x)/2, midY:(pts[0].y+pts[1].y)/2
          };
          dragLast = null;
        }
      });

      viewport.addEventListener('pointermove', (e)=>{
        if(!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
        if(activePointers.size === 2 && pinchStart){
          const pts = [...activePointers.values()];
          const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
          const newScale = clamp(pinchStart.scale * dist / pinchStart.dist, minScale, maxScale);
          if(newScale === minScale){ resetZoom(); return; }
          const vr = viewport.getBoundingClientRect();
          const mx = pinchStart.midX - vr.left, my = pinchStart.midY - vr.top;
          const r = newScale / pinchStart.scale;
          currentScale = newScale;
          const c = clampOffset(mx - (mx - pinchStart.offX) * r, my - (my - pinchStart.offY) * r, currentScale);
          offX = c.x; offY = c.y;
          render(); syncButtons();
        } else if(dragLast && currentScale > 1){
          const dx = e.clientX - dragLast.x, dy = e.clientY - dragLast.y;
          dragLast = {x:e.clientX, y:e.clientY};
          const c = clampOffset(offX + dx, offY + dy, currentScale);
          offX = c.x; offY = c.y;
          render();
        }
      });

      function endPointer(e){
        activePointers.delete(e.pointerId);
        if(activePointers.size < 2) pinchStart = null;
        if(activePointers.size === 1 && currentScale > 1){
          const p = [...activePointers.values()][0];
          dragLast = {x:p.x, y:p.y};
        } else dragLast = null;
        if(activePointers.size === 0 && currentScale === 1) resetZoom();
      }
      viewport.addEventListener('pointerup', endPointer);
      viewport.addEventListener('pointercancel', endPointer);
      viewport.addEventListener('pointerleave', endPointer);

      // thumbnails (small, cheap renders)
      for(let i=1;i<=totalPages;i++){
        const t = document.createElement('div');
        t.className = 'thumb';
        t.title = 'Página ' + i;
        const idx = i-1;
        t.addEventListener('click', ()=>pageFlip.flip(idx));
        thumbsEl.appendChild(t);
      }
      // thumbnails are copied from each page once it is painted (no extra PDF work competing with the book)
      const thumbEls = thumbsEl.querySelectorAll('.thumb');
      function makeThumb(idx){
        const t = thumbEls[idx], src = canvases[idx];
        if(!t || t.style.backgroundImage || !src.width || src.width === 300) return;
        const c = document.createElement('canvas');
        c.width = 104; c.height = Math.round(104 * src.height / src.width);
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        t.style.backgroundImage = `url(${c.toDataURL('image/jpeg', 0.7)})`;
      }
      makeThumb(0); makeThumb(1);

      // memory-aware rendering: base quality for all pages, high quality only near the current page.
      // Keeping every page at high res exceeds mobile canvas-memory limits and blanks the whole book.
      const BASE_W = Math.min(900, Math.round(window.innerWidth * dpr));
      const HI_W = Math.min(1700, Math.round(1000 * dpr));
      const canvasRes = new Array(totalPages).fill(0); // current rendered width per page
      canvasRes[0] = FIRST_W; if(totalPages > 1) canvasRes[1] = FIRST_W; // painted by the fast first pass
      const renderQueue = [];
      let rendering = false;

      function enqueueRender(idx, width){
        // replace any pending job for the same page
        const existing = renderQueue.findIndex(j => j.idx === idx);
        if(existing !== -1) renderQueue.splice(existing, 1);
        if(canvasRes[idx] === width) return;
        renderQueue.push({idx, width});
        pumpQueue();
      }

      function pumpQueue(){
        if(rendering || renderQueue.length === 0) return;
        rendering = true;
        const job = renderQueue.shift();
        renderPageToCanvas(job.idx + 1, canvases[job.idx], job.width)
          .then(()=>{ canvasRes[job.idx] = job.width; makeThumb(job.idx); })
          .catch((err)=>{ console.warn('No se pudo dibujar la página', job.idx + 1, err); })
          .finally(()=>{
            rendering = false;
            setTimeout(pumpQueue, 25);
          });
      }

      function updateResolutionWindow(){
        const cur = pageFlip.getCurrentPageIndex();
        // pages near the current view get high res; the rest drop back to base to free memory
        for(let idx = 0; idx < totalPages; idx++){
          const near = Math.abs(idx - cur) <= 2;
          enqueueRender(idx, near ? HI_W : BASE_W);
        }
        // prioritize the visible spread first
        for(const idx of [cur, cur+1, cur-1]){
          if(idx >= 0 && idx < totalPages){
            const j = renderQueue.findIndex(q => q.idx === idx);
            if(j > 0){ const [job] = renderQueue.splice(j,1); renderQueue.unshift(job); }
          }
        }
      }

      // initial pass: pages near the opening spread in high quality, the rest in base quality
      updateResolutionWindow();
      pageFlip.on('flip', updateResolutionWindow);

    }catch(err){
      console.error('No se pudo cargar el PDF para el flipbook:', err);
      loadingEl.innerHTML = 'No se pudo mostrar la revista en este momento. Revisa tu conexión a internet y recarga la página, o <a href="'+PDF_HREF+'" style="color:#F4C64A;text-decoration:underline;" download="Revista-Volcanes-y-Raices.pdf">descárgala en PDF</a>.';
    }
  }
  initFlipbook();
  // ---- fullscreen ----
  const flipSection = document.querySelector('.flip-section');
  const fsBtn = document.getElementById('fsBtn');
  fsBtn.addEventListener('click', ()=>{
    flipSection.classList.toggle('fs-active');
    fsBtn.textContent = flipSection.classList.contains('fs-active') ? '⛶ Salir de pantalla completa' : '⛶ Pantalla completa';
    window.dispatchEvent(new Event('resize'));
  });