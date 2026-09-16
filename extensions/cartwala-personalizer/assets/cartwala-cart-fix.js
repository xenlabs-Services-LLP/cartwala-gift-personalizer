(()=>{
  if(window.cartwalaCartFixFast)return;window.cartwalaCartFixFast=true;
  const normalize=text=>String(text||'').replace(/\s+/g,' ').trim();
  const isCdnValue=text=>/cdn\.shopify\.com\/s\/files\//i.test(text||'');
  let lightTimer=0,previewTimer=0,lastDesign='';

  const cartRoot=()=>document.querySelector('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer')||document;
  const rows=root=>[...root.querySelectorAll('.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item')];

  const cleanPrivateRows=root=>{
    if(!root)return;
    root.querySelectorAll('dt').forEach(dt=>{
      if(!/^Your\s+Name\s*:?$/i.test(normalize(dt.textContent)))return;
      dt.style.setProperty('display','none','important');
      const dd=dt.nextElementSibling;if(dd?.tagName==='DD')dd.style.setProperty('display','none','important');
    });
    root.querySelectorAll('.product-option,.cart-item__property,[class*="property"],li,p,dd,span').forEach(node=>{
      const text=normalize(node.textContent);
      if(/^Your\s+Name\s*:\s*.+$/i.test(text)||/^Name\s*:\s*.+$/i.test(text)||isCdnValue(text)||/^_?Personalised\s+Preview\s*:/i.test(text)||/^_?Cartwala\s+/i.test(text))node.style.setProperty('display','none','important');
    });
    root.querySelectorAll('a').forEach(link=>{if(!isCdnValue(link.href)&&!isCdnValue(link.textContent))return;const row=link.closest('.product-option,.cart-item__property,li,dd,p');(row||link).style?.setProperty?.('display','none','important')});
  };

  const getDraft=designId=>new Promise(resolve=>{
    if(!designId||!('indexedDB'in window)){resolve(null);return}
    const request=indexedDB.open('cartwala-designs',1);
    request.onerror=()=>resolve(null);
    request.onsuccess=()=>{try{const tx=request.result.transaction('drafts','readonly');const get=tx.objectStore('drafts').get(`cart:${designId}`);get.onsuccess=()=>resolve(get.result||null);get.onerror=()=>resolve(null)}catch{resolve(null)}};
  });

  const restorePreview=async()=>{
    const root=cartRoot();let designId='';try{designId=sessionStorage.getItem('cartwala-last-design')||''}catch{}
    if(!designId||designId===lastDesign)return;
    const list=rows(root);const row=list[list.length-1];if(!row)return;
    const image=row.querySelector('.cart-item__image,img');if(!image)return;
    const record=await getDraft(designId);if(!record?.blob)return;
    const url=URL.createObjectURL(record.blob);
    image.removeAttribute('srcset');image.removeAttribute('sizes');image.closest('picture')?.querySelectorAll('source').forEach(source=>{source.removeAttribute('srcset');source.removeAttribute('sizes')});image.src=url;image.dataset.cwDraftId=designId;image.style.objectFit='contain';lastDesign=designId;
  };

  const lightRefresh=()=>cleanPrivateRows(cartRoot());
  const scheduleLight=(delay=0)=>{clearTimeout(lightTimer);lightTimer=setTimeout(lightRefresh,delay)};
  const schedulePreview=(delay=60)=>{clearTimeout(previewTimer);previewTimer=setTimeout(restorePreview,delay)};

  const refreshAndOpenCart=async()=>{
    try{
      const drawer=document.querySelector('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer');
      if(!drawer)return;
      const sectionId=drawer.dataset?.section||drawer.getAttribute('data-section-id')||drawer.closest('[id^="shopify-section-"]')?.id?.replace('shopify-section-','')||'cart-drawer';
      const response=await fetch(`${window.Shopify?.routes?.root||'/'}?sections=${encodeURIComponent(sectionId)}`,{credentials:'same-origin',headers:{Accept:'application/json'}});
      if(response.ok){
        const sections=await response.json();
        const html=sections?.[sectionId];
        if(html){
          const doc=new DOMParser().parseFromString(html,'text/html');
          const fresh=doc.querySelector('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer');
          if(fresh){drawer.innerHTML=fresh.innerHTML;drawer.classList.remove('is-empty');}
        }
      }
      scheduleLight(0);schedulePreview(20);
      if(typeof drawer.open==='function')drawer.open();
      else{
        drawer.classList.add('active','animate');
        drawer.setAttribute('open','');drawer.setAttribute('aria-hidden','false');
        document.body.classList.add('overflow-hidden');
      }
    }catch(error){console.warn('Cartwala cart drawer refresh skipped',error)}
  };

  const observer=new MutationObserver(mutations=>{
    let cartChanged=false;
    for(const mutation of mutations){for(const node of mutation.addedNodes){if(!(node instanceof Element))continue;if(node.matches?.('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer,.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item')||node.querySelector?.('.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item')){cartChanged=true;break}}if(cartChanged)break}
    scheduleLight(0);if(cartChanged)schedulePreview(40);
  });
  observer.observe(document.documentElement,{childList:true,subtree:true});

  ['cart:updated','product:added','cartwala:compatibility-cart-add'].forEach(name=>document.addEventListener(name,()=>{scheduleLight(0);schedulePreview(20)}));
  document.addEventListener('cartwala:cart-complete',()=>{refreshAndOpenCart()});
  document.addEventListener('DOMContentLoaded',()=>{scheduleLight(0);schedulePreview(50)},{once:true});
  window.addEventListener('pageshow',()=>{scheduleLight(0);schedulePreview(50)});
  scheduleLight(0);schedulePreview(50);
})();
