(()=>{
  if(window.cwLoadingReady)return;window.cwLoadingReady=true;
  let overlay=null,hideTimer=0,progressTimer=0,watchdog=0,progress=0,mode='',shownAt=0;
  const ensure=()=>{if(overlay)return overlay;overlay=document.createElement('div');overlay.className='cw-processing-overlay';overlay.innerHTML='<div class="cw-processing-card"><div class="cw-progress-ring"><span class="cw-progress-value">0%</span></div><div class="cw-processing-copy"><span class="cw-processing-text">Please wait…</span><span class="cw-processing-subtext">Please do not close this page</span></div></div>';document.body.appendChild(overlay);return overlay};
  const paint=value=>{progress=Math.max(0,Math.min(100,Math.round(value)));const el=ensure();el.querySelector('.cw-progress-value').textContent=progress+'%';el.querySelector('.cw-progress-ring').style.setProperty('--cw-progress',progress*3.6+'deg')};
  const stopTimers=()=>{clearInterval(progressTimer);progressTimer=0;clearTimeout(watchdog);watchdog=0};
  const start=(text,startAt=5,timeout=30000)=>{clearTimeout(hideTimer);stopTimers();mode=text;shownAt=Date.now();const el=ensure();el.querySelector('.cw-processing-text').textContent=text;paint(startAt);el.classList.add('is-visible');document.body.classList.add('cw-processing-active');progressTimer=setInterval(()=>{if(progress>=94)return;const step=progress<35?5:progress<70?3:progress<88?2:1;paint(Math.min(94,progress+step))},220);watchdog=setTimeout(hide,timeout)};
  const hide=()=>{clearTimeout(hideTimer);stopTimers();overlay?.classList.remove('is-visible');document.body.classList.remove('cw-processing-active');progress=0;mode='';shownAt=0};
  const complete=()=>{if(!overlay?.classList.contains('is-visible'))return;stopTimers();paint(100);const wait=Math.max(0,500-(Date.now()-shownAt));hideTimer=setTimeout(hide,wait+150)};
  const beginPreview=()=>start('Preparing your preview…',5,30000);

  // Heavy personalization work belongs to Preview & Save. Add to Cart should stay native and fast.
  document.addEventListener('click',event=>{if(event.target?.closest?.('[data-cw-save]'))beginPreview()},true);
  document.addEventListener('cartwala:preview-start',beginPreview);
  document.addEventListener('cartwala:preview-complete',complete);
  document.addEventListener('cartwala:preview-error',hide);

  // Never leave the preview overlay on screen while the cart/drawer/page updates.
  ['cartwala:cart-start','cartwala:cart-complete','cartwala:cart-error','cart:updated','product:added','cartwala:compatibility-cart-add'].forEach(name=>document.addEventListener(name,hide));
  window.addEventListener('pagehide',hide);
  window.addEventListener('pageshow',hide);
})();