(()=>{
  if(window.cwLoadingReady)return;window.cwLoadingReady=true;
  let overlay=null,hideTimer=0,progressTimer=0,watchdog=0,progress=0,shownAt=0,cartConfirmed=false;
  const ensureStyle=()=>{if(document.getElementById('cw-cart-preparing-style'))return;const style=document.createElement('style');style.id='cw-cart-preparing-style';style.textContent='body.cw-cart-preparing cart-drawer,body.cw-cart-preparing #CartDrawer,body.cw-cart-preparing [data-cart-drawer],body.cw-cart-preparing .cart-drawer{visibility:hidden!important;opacity:0!important;pointer-events:none!important}';document.head.appendChild(style)};
  const ensure=()=>{if(overlay)return overlay;ensureStyle();overlay=document.createElement('div');overlay.className='cw-processing-overlay';overlay.innerHTML='<div class="cw-processing-card"><div class="cw-progress-ring"><span class="cw-progress-value">0%</span></div><div class="cw-processing-copy"><span class="cw-processing-text">Adding your personalised item…</span><span class="cw-processing-subtext">Please do not close this page</span></div></div>';document.body.appendChild(overlay);return overlay};
  const paint=value=>{progress=Math.max(0,Math.min(100,Math.round(value)));const el=ensure();el.querySelector('.cw-progress-value').textContent=progress+'%';el.querySelector('.cw-progress-ring').style.setProperty('--cw-progress',progress*3.6+'deg')};
  const stopTimers=()=>{clearInterval(progressTimer);progressTimer=0;clearTimeout(watchdog);watchdog=0};
  const hide=()=>{clearTimeout(hideTimer);stopTimers();overlay?.classList.remove('is-visible');document.body.classList.remove('cw-processing-active','cw-cart-preparing');progress=0;shownAt=0;cartConfirmed=false};
  const complete=()=>{if(!document.body.classList.contains('cw-cart-preparing'))return;stopTimers();paint(100);const wait=Math.max(0,400-(Date.now()-shownAt));hideTimer=setTimeout(hide,wait+180)};
  const start=()=>{clearTimeout(hideTimer);stopTimers();cartConfirmed=false;shownAt=Date.now();const el=ensure();el.querySelector('.cw-processing-text').textContent='Adding your personalised item…';el.querySelector('.cw-processing-subtext').textContent='Please do not close this page';paint(5);el.classList.add('is-visible');document.body.classList.add('cw-processing-active','cw-cart-preparing');progressTimer=setInterval(()=>{const ceiling=cartConfirmed?99:92;if(progress>=ceiling)return;const step=progress<35?5:progress<70?3:progress<88?2:1;paint(Math.min(ceiling,progress+step))},220);watchdog=setTimeout(()=>{if(document.body.classList.contains('cw-cart-preparing')){el.querySelector('.cw-processing-subtext').textContent=cartConfirmed?'Preparing your cart…':'Still uploading your photos…';paint(cartConfirmed?99:92)}},15000)};
  const confirmed=()=>{cartConfirmed=true;paint(100);setTimeout(complete,150)};
  document.addEventListener('cartwala:cart-start',start);
  document.addEventListener('cartwala:cart-complete',confirmed);
  document.addEventListener('cartwala:item-added',confirmed);
  document.addEventListener('cartwala:drawer-ready',complete);
  document.addEventListener('cartwala:drawer-error',()=>{if(cartConfirmed)complete();else hide()});
  document.addEventListener('cartwala:cart-error',hide);
  window.addEventListener('pagehide',hide);window.addEventListener('pageshow',hide);
})();
