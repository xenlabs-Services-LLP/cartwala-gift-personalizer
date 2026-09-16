(()=>{
  if(window.cartwalaCartFixFast)return;window.cartwalaCartFixFast=true;
  const normalize=text=>String(text||'').replace(/\s+/g,' ').trim();
  const isCdnValue=text=>/cdn\.shopify\.com\/s\/files\//i.test(text||'');
  let lightTimer=0,previewTimer=0,lastDesign='';
  const drawerSelector='cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer';
  const cartRoot=()=>document.querySelector(drawerSelector)||document;
  const rows=root=>[...root.querySelectorAll('.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item')];

  const cleanPrivateRows=root=>{
    if(!root)return;
    root.querySelectorAll('dt').forEach(dt=>{if(!/^Your\s+Name\s*:?$/i.test(normalize(dt.textContent)))return;dt.style.setProperty('display','none','important');const dd=dt.nextElementSibling;if(dd?.tagName==='DD')dd.style.setProperty('display','none','important')});
    root.querySelectorAll('.product-option,.cart-item__property,[class*="property"],li,p,dd,span').forEach(node=>{const text=normalize(node.textContent);if(/^Your\s+Name\s*:\s*.+$/i.test(text)||/^Name\s*:\s*.+$/i.test(text)||isCdnValue(text)||/^_?Personalised\s+Preview\s*:/i.test(text)||/^_?Cartwala\s+/i.test(text))node.style.setProperty('display','none','important')});
    root.querySelectorAll('a').forEach(link=>{if(!isCdnValue(link.href)&&!isCdnValue(link.textContent))return;const row=link.closest('.product-option,.cart-item__property,li,dd,p');(row||link).style?.setProperty?.('display','none','important')});
  };

  const getDraft=designId=>new Promise(resolve=>{if(!designId||!('indexedDB'in window)){resolve(null);return}const request=indexedDB.open('cartwala-designs',1);request.onerror=()=>resolve(null);request.onsuccess=()=>{try{const tx=request.result.transaction('drafts','readonly');const get=tx.objectStore('drafts').get(`cart:${designId}`);get.onsuccess=()=>resolve(get.result||null);get.onerror=()=>resolve(null)}catch{resolve(null)}}});
  const applyPreview=async(root,designId)=>{if(!root||!designId)return false;const list=rows(root);const row=list[list.length-1];if(!row)return false;const image=row.querySelector('.cart-item__image,img');if(!image)return false;const record=await getDraft(designId);if(!record?.blob)return false;const url=URL.createObjectURL(record.blob);image.removeAttribute('srcset');image.removeAttribute('sizes');image.closest('picture')?.querySelectorAll('source').forEach(source=>{source.removeAttribute('srcset');source.removeAttribute('sizes')});image.src=url;image.dataset.cwDraftId=designId;image.style.objectFit='contain';image.style.background='transparent';await new Promise(resolve=>{if(image.complete&&image.naturalWidth>0){resolve();return}const done=()=>resolve();image.addEventListener('load',done,{once:true});image.addEventListener('error',done,{once:true});setTimeout(done,1200)});lastDesign=designId;return true};
  const restorePreview=async()=>{let designId='';try{designId=sessionStorage.getItem('cartwala-last-design')||''}catch{}if(!designId||designId===lastDesign)return false;return applyPreview(cartRoot(),designId)};
  const lightRefresh=()=>cleanPrivateRows(cartRoot());
  const scheduleLight=(delay=0)=>{clearTimeout(lightTimer);lightTimer=setTimeout(lightRefresh,delay)};
  const schedulePreview=(delay=60)=>{clearTimeout(previewTimer);previewTimer=setTimeout(restorePreview,delay)};

  const openDrawer=drawer=>{document.body.classList.remove('cw-cart-preparing');if(typeof drawer?.open==='function'){drawer.open();return}drawer?.classList.add('active','animate','is-open');drawer?.setAttribute('open','');drawer?.setAttribute('aria-hidden','false');document.body.classList.add('overflow-hidden')};
  const sectionIds=drawer=>{const ids=[];const add=id=>{if(id&&!ids.includes(id))ids.push(id)};add(drawer?.dataset?.section);add(drawer?.getAttribute?.('data-section-id'));add(drawer?.closest?.('[id^="shopify-section-"]')?.id?.replace('shopify-section-',''));add('cart-drawer');add('cart-icon-bubble');return ids};
  const refreshAndOpenCart=async()=>{
    const drawer=document.querySelector(drawerSelector);if(!drawer)return;
    let designId='';try{designId=sessionStorage.getItem('cartwala-last-design')||''}catch{}
    try{
      const ids=sectionIds(drawer);const root=window.Shopify?.routes?.root||'/';
      const response=await fetch(`${root}?sections=${encodeURIComponent(ids.join(','))}&_cw=${Date.now()}`,{credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}});
      if(response.ok){
        const sections=await response.json();let freshDrawer=null;
        for(const id of ids){const html=sections?.[id];if(!html)continue;const doc=new DOMParser().parseFromString(html,'text/html');freshDrawer=doc.querySelector(drawerSelector);if(freshDrawer)break}
        if(freshDrawer){drawer.innerHTML=freshDrawer.innerHTML;drawer.className=freshDrawer.className;drawer.classList.remove('is-empty')}
        const bubbleHtml=sections?.['cart-icon-bubble'];if(bubbleHtml){const doc=new DOMParser().parseFromString(bubbleHtml,'text/html');const fresh=doc.querySelector('#cart-icon-bubble,.cart-count-bubble,[data-cart-count]');const current=document.querySelector('#cart-icon-bubble,.cart-count-bubble,[data-cart-count]');if(fresh&&current&&fresh!==current)current.replaceWith(fresh)}
      }
    }catch(error){console.warn('Cartwala cart drawer refresh skipped',error)}
    lastDesign='';cleanPrivateRows(drawer);
    // Critical ordering: fresh cart HTML -> personalized preview -> decoded image -> open drawer.
    // This prevents the empty/stale drawer flash seen on mobile and desktop.
    if(designId)await applyPreview(drawer,designId);
    cleanPrivateRows(drawer);openDrawer(drawer);
    document.dispatchEvent(new CustomEvent('cartwala:drawer-ready',{bubbles:true,detail:{designId}}));
  };

  const observer=new MutationObserver(mutations=>{let cartChanged=false;for(const mutation of mutations){for(const node of mutation.addedNodes){if(!(node instanceof Element))continue;if(node.matches?.(`${drawerSelector},.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item`)||node.querySelector?.('.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item')){cartChanged=true;break}}if(cartChanged)break}scheduleLight(0);if(cartChanged&&!document.body.classList.contains('cw-cart-preparing'))schedulePreview(40)});
  observer.observe(document.documentElement,{childList:true,subtree:true});
  ['cart:updated','product:added','cartwala:compatibility-cart-add'].forEach(name=>document.addEventListener(name,()=>{scheduleLight(0);if(!document.body.classList.contains('cw-cart-preparing'))schedulePreview(20)}));
  document.addEventListener('cartwala:cart-complete',refreshAndOpenCart);
  document.addEventListener('DOMContentLoaded',()=>{scheduleLight(0);schedulePreview(50)},{once:true});
  window.addEventListener('pageshow',()=>{scheduleLight(0);schedulePreview(50)});
  scheduleLight(0);schedulePreview(50);
})();
