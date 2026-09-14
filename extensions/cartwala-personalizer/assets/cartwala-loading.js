(()=>{
  if(window.cwLoadingReady)return;window.cwLoadingReady=true;
  let overlay=null,hideTimer=0,progressTimer=0,progress=0,mode='',shownAt=0;
  const ensure=()=>{if(overlay)return overlay;overlay=document.createElement('div');overlay.className='cw-processing-overlay';overlay.innerHTML='<div class="cw-processing-card"><div class="cw-progress-ring"><span class="cw-progress-value">0%</span></div><div class="cw-processing-copy"><span class="cw-processing-text">Please wait…</span><span class="cw-processing-subtext">Please do not close this page</span></div></div>';document.body.appendChild(overlay);return overlay};
  const paint=value=>{progress=Math.max(0,Math.min(100,Math.round(value)));const el=ensure();el.querySelector('.cw-progress-value').textContent=progress+'%';el.querySelector('.cw-progress-ring').style.setProperty('--cw-progress',progress*3.6+'deg')};
  const stopProgress=()=>{clearInterval(progressTimer);progressTimer=0};
  const startProgress=(text,start=8)=>{clearTimeout(hideTimer);stopProgress();mode=text;shownAt=Date.now();const el=ensure();el.querySelector('.cw-processing-text').textContent=text;paint(start);el.classList.add('is-visible');document.body.classList.add('cw-processing-active');progressTimer=setInterval(()=>{if(progress>=94)return;const step=progress<45?4:progress<75?2:1;paint(Math.min(94,progress+step))},260)};
  const hide=()=>{clearTimeout(hideTimer);stopProgress();overlay?.classList.remove('is-visible');document.body.classList.remove('cw-processing-active');progress=0;mode='';shownAt=0};
  const complete=()=>{if(!overlay?.classList.contains('is-visible'))return;stopProgress();paint(100);const wait=Math.max(0,900-(Date.now()-shownAt));hideTimer=setTimeout(hide,wait+350)};
  const looksLikeAddButton=element=>{const button=element?.closest?.('button,input[type="submit"],[role="button"]');if(!button||button.closest('[data-cw-personalizer]'))return false;const text=((button.value||'')+' '+(button.textContent||'')).replace(/\s+/g,' ').trim();if(/add\s*to\s*cart/i.test(text))return true;const form=button.closest('form[action*="/cart/add"]');return Boolean(form&&(/add/i.test(button.name||'')||button.type==='submit'))};
  const beginCart=()=>startProgress('Adding your personalised item to cart…',5);

  document.addEventListener('click',event=>{
    const save=event.target.closest?.('[data-cw-save]');
    if(save&&!save.disabled){startProgress('Preparing your preview…',4);hideTimer=setTimeout(hide,30000);return}
    if(looksLikeAddButton(event.target))beginCart();
  },true);

  document.addEventListener('submit',event=>{
    const form=event.target?.closest?.('form[action*="/cart/add"]');
    if(form&&!event.target.closest?.('[data-cw-personalizer]'))beginCart();
  },true);

  const originalFetch=window.fetch.bind(window);
  window.fetch=async(input,init)=>{
    const url=typeof input==='string'?input:(input?.url||'');
    const isCartAdd=/\/cart\/add(?:\.js)?(?:\?|$)/.test(url);
    if(isCartAdd)beginCart();
    try{
      const response=await originalFetch(input,init);
      if(isCartAdd){if(response.ok)complete();else hide()}
      return response;
    }catch(error){if(isCartAdd)hide();throw error}
  };

  document.addEventListener('cart:updated',complete);
  document.addEventListener('product:added',complete);
  document.addEventListener('cartwala:compatibility-cart-add',complete);
  const observer=new MutationObserver(()=>{
    const dialog=document.querySelector('[data-cw-dialog]');const save=document.querySelector('[data-cw-save]');
    if(overlay?.classList.contains('is-visible')&&mode.startsWith('Preparing')&&save&&/Preview\s*&\s*Save/i.test(save.textContent||'')&&!dialog?.open)complete()
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  window.addEventListener('pageshow',hide);
})();