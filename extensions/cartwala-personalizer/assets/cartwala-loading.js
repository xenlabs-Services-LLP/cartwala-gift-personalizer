(()=>{
  if(window.cwLoadingReady)return;window.cwLoadingReady=true;
  let overlay=null,hideTimer=0,progressTimer=0,watchdog=0,progress=0,shownAt=0,observer=null;
  const ensureStyle=()=>{if(document.getElementById('cw-cart-preparing-style'))return;const style=document.createElement('style');style.id='cw-cart-preparing-style';style.textContent='body.cw-cart-preparing cart-drawer,body.cw-cart-preparing #CartDrawer,body.cw-cart-preparing [data-cart-drawer],body.cw-cart-preparing .cart-drawer{visibility:hidden!important;opacity:0!important;pointer-events:none!important}';document.head.appendChild(style)};
  const ensure=()=>{if(overlay)return overlay;ensureStyle();overlay=document.createElement('div');overlay.className='cw-processing-overlay';overlay.innerHTML='<div class="cw-processing-card"><div class="cw-progress-ring"><span class="cw-progress-value">0%</span></div><div class="cw-processing-copy"><span class="cw-processing-text">Adding your personalised item…</span><span class="cw-processing-subtext">Please do not close this page</span></div></div>';document.body.appendChild(overlay);return overlay};
  const paint=value=>{progress=Math.max(0,Math.min(100,Math.round(value)));const el=ensure();el.querySelector('.cw-progress-value').textContent=progress+'%';el.querySelector('.cw-progress-ring').style.setProperty('--cw-progress',progress*3.6+'deg')};
  const stopTimers=()=>{clearInterval(progressTimer);progressTimer=0;clearTimeout(watchdog);watchdog=0};
  const hide=()=>{clearTimeout(hideTimer);stopTimers();observer?.disconnect();observer=null;overlay?.classList.remove('is-visible');document.body.classList.remove('cw-processing-active','cw-cart-preparing');progress=0;shownAt=0};
  const complete=()=>{if(!document.body.classList.contains('cw-cart-preparing'))return;stopTimers();paint(100);const wait=Math.max(0,450-(Date.now()-shownAt));hideTimer=setTimeout(hide,wait+180)};
  const previewImages=()=>[...document.querySelectorAll('cart-drawer img[data-cw-preview],#CartDrawer img[data-cw-preview],[data-cart-drawer] img[data-cw-preview],.cart-drawer img[data-cw-preview],cart-drawer img[data-cw-draft-id],#CartDrawer img[data-cw-draft-id],[data-cart-drawer] img[data-cw-draft-id],.cart-drawer img[data-cw-draft-id]')];
  const checkReady=()=>{const images=previewImages();if(!images.length)return false;const image=images[images.length-1];const ready=()=>{if(image.complete&&image.naturalWidth>0)complete();else image.addEventListener('load',complete,{once:true})};try{const decoded=image.decode?.();if(decoded&&typeof decoded.then==='function')decoded.then(complete).catch(ready);else ready()}catch{ready()}return true};
  const start=()=>{clearTimeout(hideTimer);stopTimers();observer?.disconnect();shownAt=Date.now();const el=ensure();el.querySelector('.cw-processing-text').textContent='Adding your personalised item…';paint(5);el.classList.add('is-visible');document.body.classList.add('cw-processing-active','cw-cart-preparing');progressTimer=setInterval(()=>{if(progress>=94)return;const step=progress<35?5:progress<70?3:progress<88?2:1;paint(Math.min(94,progress+step))},220);observer=new MutationObserver(checkReady);observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['src','data-cw-preview','data-cw-draft-id']});checkReady();watchdog=setTimeout(()=>{console.warn('Cartwala cart preview readiness timed out');hide()},60000)};

  // Preview & Save is deliberately instant: it only returns to the product page with the preview.
  // The 5→100 progress UI belongs exclusively to Add to Cart and remains until the cart preview image is ready.
  document.addEventListener('cartwala:cart-start',start);
  document.addEventListener('cartwala:cart-error',hide);
  document.addEventListener('cartwala:compatibility-cart-add',checkReady);
  document.addEventListener('cart:updated',checkReady);
  document.addEventListener('product:added',checkReady);
  window.addEventListener('pagehide',hide);
  window.addEventListener('pageshow',hide);
})();
