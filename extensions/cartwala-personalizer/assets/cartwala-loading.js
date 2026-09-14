(()=>{
  if(window.cwLoadingReady)return;window.cwLoadingReady=true;
  let overlay=null,hideTimer=0;
  const ensure=()=>{if(overlay)return overlay;overlay=document.createElement('div');overlay.className='cw-processing-overlay';overlay.innerHTML='<div class="cw-processing-card"><span class="cw-processing-spinner" aria-hidden="true"></span><span class="cw-processing-text">Please wait…</span></div>';document.body.appendChild(overlay);return overlay};
  const show=text=>{clearTimeout(hideTimer);const el=ensure();el.querySelector('.cw-processing-text').textContent=text;el.classList.add('is-visible');document.body.classList.add('cw-processing-active')};
  const hide=()=>{clearTimeout(hideTimer);overlay?.classList.remove('is-visible');document.body.classList.remove('cw-processing-active')};
  document.addEventListener('click',event=>{
    const save=event.target.closest('[data-cw-save]');
    if(save&&!save.disabled){show('Preparing your preview…');hideTimer=setTimeout(hide,20000);return}
    const add=event.target.closest('form[action*="/cart/add"] button[name="add"],form[action*="/cart/add"] input[name="add"],form[action*="/cart/add"] button[type="submit"]');
    if(add){const form=add.closest('form[action*="/cart/add"]');if(form?.querySelector('input[name="properties[_Cartwala Personalization]"][value="Completed"]')){show('Adding your personalised item to cart…');hideTimer=setTimeout(hide,30000)}}
  },true);
  document.addEventListener('submit',event=>{const form=event.target.closest?.('form[action*="/cart/add"]');if(form?.querySelector('input[name="properties[_Cartwala Personalization]"][value="Completed"]')){show('Adding your personalised item to cart…');hideTimer=setTimeout(hide,30000)}},true);
  document.addEventListener('cart:updated',()=>setTimeout(hide,250));
  document.addEventListener('product:added',()=>setTimeout(hide,250));
  const observer=new MutationObserver(()=>{
    const dialog=document.querySelector('[data-cw-dialog]');const save=document.querySelector('[data-cw-save]');
    if(overlay?.classList.contains('is-visible')&&save&&/Preview\s*&\s*Save/i.test(save.textContent||'')&&!dialog?.open){hide()}
  });
  observer.observe(document.documentElement,{childList:true,subtree:true,attributes:true,attributeFilter:['open']});
  window.addEventListener('pageshow',hide);
})();