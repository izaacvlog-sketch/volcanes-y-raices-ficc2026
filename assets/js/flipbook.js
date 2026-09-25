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

      // ---- zoom + pan controls (fully custom, doesn't depend on native scroll) ----
      const bookStage = document.querySelector('.book-stage');
      const zoomInBtn = document.getElementById('zoomInBtn');
      const zoomOutBtn = document.getElementById('zoomOutBtn');
      if(zoomOutBtn) zoomOutBtn.disabled = true;
      const minScale = 1, maxScale = 3.2, zoomStep = 0.5;

      let currentScale = 1;
      let bookNatW = 0, bookNatH = 0;         // #book's natural (unscaled) size
      let naturalLeft = 0, naturalTop = 0; // #book's resting position relative to the stage (it's centered by flexbox)
      let offX = 0, offY = 0;           // ABSOLUTE visual position of #book's top-left corner, relative to the stage
      const activePointers = new Map(); // pointerId -> {x,y}
      let dragLast = null;
      let pinchStart = null;

      function clamp(v, min, max){ return Math.min(max, Math.max(min, v)); }

      function measureRest(){
        const stageRect = bookStage.getBoundingClientRect();
        const bookRect = bookEl.getBoundingClientRect();
        naturalLeft = bookRect.left - stageRect.left;
        naturalTop = bookRect.top - stageRect.top;
        bookNatW = bookRect.width;
        bookNatH = bookRect.height;
      }

      function clampOffset(x, y, scale){
        const stageW = bookStage.clientWidth;
        const stageH = bookStage.clientHeight;
        const contentW = bookNatW * scale;
        const contentH = bookNatH * scale;
        const minX = Math.min(0, stageW - contentW);
        const maxX = Math.max(0, stageW - contentW);
        const minY = Math.min(0, stageH - contentH);
        const maxY = Math.max(0, stageH - contentH);
        return {
          x: contentW <= stageW ? (stageW - contentW) / 2 : clamp(x, minX, maxX),
          y: contentH <= stageH ? (stageH - contentH) / 2 : clamp(y, minY, maxY)
        };
      }

      function render(){
        bookEl.style.transform = `translate(${offX - naturalLeft}px, ${offY - naturalTop}px) scale(${currentScale})`;
      }

      function resetZoom(){
        currentScale = 1;
        bookEl.style.transform = '';
        bookStage.classList.remove('zoomed');
        bookStage.style.touchAction = 'pan-y';
        if(zoomOutBtn) zoomOutBtn.disabled = true;
        if(zoomInBtn) zoomInBtn.disabled = false;
      }

      function setZoom(scale, focusClientX, focusClientY){
        const prevScale = currentScale;
        const newScale = clamp(scale, minScale, maxScale);
        if(newScale === prevScale) return;

        if(prevScale === 1){
          measureRest();
          offX = naturalLeft;
          offY = naturalTop;
        }

        const stageRect = bookStage.getBoundingClientRect();
        const fx = focusClientX != null ? focusClientX - stageRect.left : bookStage.clientWidth / 2;
        const fy = focusClientY != null ? focusClientY - stageRect.top : bookStage.clientHeight / 2;

        if(newScale === minScale){
          resetZoom();
          return;
        }

        bookStage.classList.add('zoomed');
        bookStage.style.touchAction = 'none';
        const ratio = newScale / prevScale;
        offX = fx - ratio * (fx - offX);
        offY = fy - ratio * (fy - offY);
        currentScale = newScale;
        const clamped = clampOffset(offX, offY, currentScale);
        offX = clamped.x; offY = clamped.y;
        render();
        if(zoomOutBtn) zoomOutBtn.disabled = false;
        if(zoomInBtn) zoomInBtn.disabled = currentScale >= maxScale;
      }

      if(zoomInBtn) zoomInBtn.addEventListener('click', ()=>setZoom(currentScale + zoomStep));
      if(zoomOutBtn) zoomOutBtn.addEventListener('click', ()=>setZoom(currentScale - zoomStep));
      bookStage.addEventListener('dblclick', (e)=>setZoom(currentScale > 1 ? 1 : 2, e.clientX, e.clientY));

      // ctrl/cmd + mouse wheel to zoom (desktop)
      bookStage.addEventListener('wheel', (e)=>{
        if(!e.ctrlKey && !e.metaKey) return;
        e.preventDefault();
        setZoom(currentScale + (e.deltaY > 0 ? -0.3 : 0.3), e.clientX, e.clientY);
      }, {passive:false});

      // pointer-based pan (mouse drag or single-finger drag, only while zoomed) + pinch-to-zoom (two fingers)
      bookStage.style.touchAction = 'pan-y';

      bookStage.addEventListener('pointerdown', (e)=>{
        activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});
        if(activePointers.size === 1 && currentScale > 1){
          bookStage.setPointerCapture(e.pointerId);
          dragLast = {x:e.clientX, y:e.clientY};
        } else if(activePointers.size === 2){
          bookStage.setPointerCapture(e.pointerId);
          bookStage.style.touchAction = 'none';
          if(currentScale === 1) measureRest();
          const pts = [...activePointers.values()];
          const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
          pinchStart = {
            dist, scale: currentScale,
            offX: currentScale === 1 ? naturalLeft : offX,
            offY: currentScale === 1 ? naturalTop : offY,
            midX:(pts[0].x+pts[1].x)/2, midY:(pts[0].y+pts[1].y)/2
          };
          dragLast = null;
        }
        // single pointer at scale 1: don't capture — let it pass through to native scroll / page-flip drag
      });

      bookStage.addEventListener('pointermove', (e)=>{
        if(!activePointers.has(e.pointerId)) return;
        activePointers.set(e.pointerId, {x:e.clientX, y:e.clientY});

        if(activePointers.size === 2 && pinchStart){
          const pts = [...activePointers.values()];
          const dist = Math.hypot(pts[0].x-pts[1].x, pts[0].y-pts[1].y);
          const ratio = dist / pinchStart.dist;
          const newScale = clamp(pinchStart.scale * ratio, minScale, maxScale);
          if(newScale === minScale){
            resetZoom();
          } else {
            const scaleRatio = newScale / pinchStart.scale;
            const stageRect = bookStage.getBoundingClientRect();
            const midX = pinchStart.midX - stageRect.left;
            const midY = pinchStart.midY - stageRect.top;
            offX = midX - (midX - pinchStart.offX) * scaleRatio;
            offY = midY - (midY - pinchStart.offY) * scaleRatio;
            currentScale = newScale;
            bookStage.classList.add('zoomed');
            const clamped = clampOffset(offX, offY, currentScale);
            offX = clamped.x; offY = clamped.y;
            render();
            if(zoomOutBtn) zoomOutBtn.disabled = false;
            if(zoomInBtn) zoomInBtn.disabled = currentScale >= maxScale;
          }
        } else if(dragLast && currentScale > 1){
          const dx = e.clientX - dragLast.x;
          const dy = e.clientY - dragLast.y;
          dragLast = {x:e.clientX, y:e.clientY};
          const clamped = clampOffset(offX + dx, offY + dy, currentScale);
          offX = clamped.x; offY = clamped.y;
          render();
        }
      });

      function endPointer(e){
        activePointers.delete(e.pointerId);
        if(activePointers.size < 2) pinchStart = null;
        if(activePointers.size === 1 && currentScale > 1){
          const p = [...activePointers.values()][0];
          dragLast = {x:p.x, y:p.y};
        } else {
          dragLast = null;
        }
      }
      bookStage.addEventListener('pointerup', endPointer);
      bookStage.addEventListener('pointercancel', endPointer);
      bookStage.addEventListener('pointerleave', endPointer);

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