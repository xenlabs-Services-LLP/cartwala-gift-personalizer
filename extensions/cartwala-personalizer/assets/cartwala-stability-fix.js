/* eslint-disable no-empty -- Invalid legacy config blocks are skipped independently. */
(()=>{
  if(window.cwStabilityFixReady)return;window.cwStabilityFixReady=true;

  const normalize=value=>String(value||'').replace(/\s+/g,' ').trim();
  const personalizationLabels=()=>{
    const labels=new Set(['Your Name','Name']);
    document.querySelectorAll('[data-cw-config]').forEach(node=>{
      try{
        const config=JSON.parse(node.dataset.cwConfig||'{}');
        (Array.isArray(config.textFields)?config.textFields:[]).forEach(field=>{if(field?.label)labels.add(normalize(field.label))});
      }catch{}
    });
    return labels;
  };

  // Keep customer-entered personalization text private in Shopify line-item properties.
  const NativeFormData=window.FormData;
  if(NativeFormData&&!NativeFormData.__cwWrapped){
    const SafeFormData=function(form,submitter){
      const data=submitter===undefined?new NativeFormData(form):new NativeFormData(form,submitter);
      const labels=personalizationLabels();
      [...data.entries()].forEach(([key,value])=>{
        const match=/^properties\[([^\]]+)\]$/.exec(key);
        if(!match)return;
        const label=normalize(match[1]);
        if(label.startsWith('_')||!labels.has(label))return;
        data.delete(key);
        data.append(`properties[_${label}]`,value);
      });
      return data;
    };
    SafeFormData.prototype=NativeFormData.prototype;
    Object.setPrototypeOf(SafeFormData,NativeFormData);
    SafeFormData.__cwWrapped=true;
    window.FormData=SafeFormData;
  }

  // Safari/iOS can occasionally return null from canvas.toBlob under memory pressure.
  const proto=window.HTMLCanvasElement?.prototype;
  if(proto?.toBlob&&!proto.toBlob.__cwWrapped){
    const nativeToBlob=proto.toBlob;
    const wrapped=function(callback,type='image/png',quality){
      const canvas=this;
      const fallback=()=>{
        try{
          const dataUrl=canvas.toDataURL(type,quality);
          fetch(dataUrl).then(r=>r.blob()).then(blob=>callback(blob)).catch(()=>callback(null));
        }catch{callback(null)}
      };
      try{nativeToBlob.call(canvas,blob=>blob?callback(blob):fallback(),type,quality)}catch{fallback()}
    };
    wrapped.__cwWrapped=true;proto.toBlob=wrapped;
  }

  const applySavedPreview=root=>{
    const src=root?.querySelector('[data-cw-result-image]')?.src;
    if(!src||!src.startsWith('blob:'))return;
    const scope=root.closest('.shopify-section')||document;
    const candidates=scope.querySelectorAll('[data-gallery-main] img,.product__media img,[data-product-media] img,.product-gallery img,.product__media-item img,.slider-mobile-gutter img');
    const image=[...candidates].find(img=>img.offsetParent!==null)||candidates[0];
    if(!image)return;
    image.removeAttribute('srcset');image.removeAttribute('sizes');
    image.closest('picture')?.querySelectorAll('source').forEach(source=>{source.removeAttribute('srcset');source.removeAttribute('sizes')});
    image.src=src;image.dataset.cwSavedPreview='true';image.style.objectFit='contain';
  };

  document.addEventListener('click',event=>{
    const save=event.target.closest?.('[data-cw-save]');if(!save||save.disabled)return;
    const root=save.closest('[data-cw-personalizer]');
    let tries=0;const timer=setInterval(()=>{
      tries++;const dialog=root?.querySelector('[data-cw-dialog]');
      const result=root?.querySelector('[data-cw-result-image]');
      if(result?.src?.startsWith('blob:'))applySavedPreview(root);
      if((dialog&&!dialog.open&&result?.src)||tries>=40){clearInterval(timer);if(dialog&&!dialog.open)document.dispatchEvent(new CustomEvent('cartwala:preview-saved',{bubbles:true}))}
    },150);
  },true);

  const isPersonalizationText=text=>{
    const value=normalize(text);
    if(!value)return false;
    for(const label of personalizationLabels()){
      const escaped=label.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
      if(new RegExp(`^${escaped}\\s*:`,'i').test(value))return true;
    }
    return /^Your\s+Name\s*:/i.test(value);
  };

  const hidePersonalizationRows=root=>{
    const scope=root||document;
    scope.querySelectorAll('.product-option,.cart-item__property,[class*="property"],dt,dd,li,p').forEach(node=>{
      const text=normalize(node.textContent);
      if(!isPersonalizationText(text))return;
      let target=node.closest('.product-option,.cart-item__property,li')||node;
      if(target.tagName==='DT'){
        target.style.setProperty('display','none','important');
        target.nextElementSibling?.style?.setProperty('display','none','important');
      }else target.style.setProperty('display','none','important');
    });
  };

  const scrub=()=>hidePersonalizationRows(document.querySelector('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer')||document);
  let timer=0;new MutationObserver(()=>{clearTimeout(timer);timer=setTimeout(scrub,20)}).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  document.addEventListener('cart:updated',scrub);document.addEventListener('product:added',scrub);document.addEventListener('DOMContentLoaded',scrub,{once:true});
  scrub();
})();
