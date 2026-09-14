(()=>{
  if(window.cwLoadingReady)return;window.cwLoadingReady=true;
  let overlay=null,hideTimer=0,progressTimer=0,watchdog=0,progress=0,mode='',shownAt=0,activeRequests=0;
  const ensure=()=>{if(overlay)return overlay;overlay=document.createElement('div');overlay.className='cw-processing-overlay';overlay.innerHTML='<div class="cw-processing-card"><div class="cw-progress-ring"><span class="cw-progress-value">0%</span></div><div class="cw-processing-copy"><span class="cw-processing-text">Please wait…</span><span class="cw-processing-subtext">Please do not close this page</span></div></div>';document.body.appendChild(overlay);return overlay};
  const paint=value=>{progress=Math.max(0,Math.min(100,Math.round(value)));const el=ensure();el.querySelector('.cw-progress-value').textContent=progress+'%';el.querySelector('.cw-progress-ring').style.setProperty('--cw-progress',progress*3.6+'deg')};
  const stopTimers=()=>{clearInterval(progressTimer);progressTimer=0;clearTimeout(watchdog);watchdog=0};
  const start=(text,startAt=5,timeout=45000)=>{clearTimeout(hideTimer);stopTimers();mode=text;shownAt=Date.now();const el=ensure();el.querySelector('.cw-processing-text').textContent=text;paint(startAt);el.classList.add('is-visible');document.body.classList.add('cw-processing-active');progressTimer=setInterval(()=>{if(progress>=94)return;const step=progress<35?5:progress<70?3:progress<88?2:1;paint(Math.min(94,progress+step))},240);watchdog=setTimeout(()=>{console.warn('Cartwala operation timed out:',mode);hide()},timeout)};
  const hide=()=>{clearTimeout(hideTimer);stopTimers();overlay?.classList.remove('is-visible');document.body.classList.remove('cw-processing-active');progress=0;mode='';shownAt=0;activeRequests=0};
  const complete=()=>{if(!overlay?.classList.contains('is-visible'))return;stopTimers();paint(100);const wait=Math.max(0,700-(Date.now()-shownAt));hideTimer=setTimeout(hide,wait+250)};
  const beginPreview=()=>start('Preparing your preview…',5,30000);
  const beginCart=()=>{activeRequests++;if(!overlay?.classList.contains('is-visible')||!mode.includes('cart'))start('Adding your personalised item to cart…',5,45000)};
  const finishCart=ok=>{activeRequests=Math.max(0,activeRequests-1);if(activeRequests>0)return;if(ok)complete();else hide()};
  const looksLikeAdd=target=>{const button=target?.closest?.('button,input[type="submit"],[role="button"]');if(!button||button.closest('[data-cw-personalizer]'))return false;const text=((button.value||'')+' '+(button.textContent||'')).replace(/\s+/g,' ').trim();if(/add\s*to\s*cart/i.test(text))return true;return Boolean(button.closest('form[action*="/cart/add"]')&&button.type==='submit')};

  document.addEventListener('click',event=>{if(event.target?.closest?.('[data-cw-save]'))beginPreview();else if(looksLikeAdd(event.target))beginCart()},true);
  document.addEventListener('submit',event=>{const form=event.target?.closest?.('form[action*="/cart/add"]');if(form)beginCart()},true);
  document.addEventListener('cartwala:preview-start',beginPreview);
  document.addEventListener('cartwala:preview-complete',complete);
  document.addEventListener('cartwala:preview-error',hide);
  document.addEventListener('cartwala:cart-start',beginCart);
  document.addEventListener('cartwala:cart-complete',complete);
  document.addEventListener('cartwala:cart-error',hide);

  const nativeFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input?.url||'');
    const isCartAdd=/\/cart\/add(?:\.js)?(?:\?|$)/.test(url)&&String(init?.method||'GET').toUpperCase()==='POST';
    if(isCartAdd)beginCart();
    try{const response=await nativeFetch(input,init);if(isCartAdd)finishCart(response.ok);return response}catch(error){if(isCartAdd)finishCart(false);throw error}
  };

  document.addEventListener('cart:updated',()=>{if(mode.includes('cart'))complete()});
  document.addEventListener('product:added',()=>{if(mode.includes('cart'))complete()});
  document.addEventListener('cartwala:compatibility-cart-add',()=>{if(mode.includes('cart'))complete()});
  window.addEventListener('pageshow',hide);
})();