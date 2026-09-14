(()=>{
  if(window.cartwalaCartFixFast)return;window.cartwalaCartFixFast=true;
  const normalize=text=>String(text||'').replace(/\s+/g,' ').trim();
  const isCdnValue=text=>/cdn\.shopify\.com\/s\/files\//i.test(text||'');
  let timer=0,lastDesign='';

  const cartRoot=()=>document.querySelector('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer')||document;
  const rows=root=>[...root.querySelectorAll('.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item')];

  const hideNameRows=root=>{
    root.querySelectorAll('dt').forEach(dt=>{
      if(!/^Your\s+Name\s*:?$/i.test(normalize(dt.textContent)))return;
      dt.style.setProperty('display','none','important');
      const dd=dt.nextElementSibling;if(dd?.tagName==='DD')dd.style.setProperty('display','none','important');
    });
    root.querySelectorAll('.product-option,.cart-item__property,[class*="property"],li,p,dd').forEach(node=>{
      const text=normalize(node.textContent);
      if(/^Your\s+Name\s*:\s*.+$/i.test(text)||/^Name\s*:\s*.+$/i.test(text))node.style.setProperty('display','none','important');
    });
  };

  const cleanPrivateRows=root=>{
    if(!root)return;
    root.querySelectorAll('.product-option,.cart-item__property,[class*="property"],li,dd,p').forEach(node=>{
      const text=normalize(node.textContent);
      if(isCdnValue(text)||/^_?Personalised\s+Preview\s*:/i.test(text)||/^_?Cartwala\s+/i.test(text))node.style.setProperty('display','none','important');
    });
    root.querySelectorAll('a').forEach(link=>{
      if(!isCdnValue(link.href)&&!isCdnValue(link.textContent))return;
      const row=link.closest('.product-option,.cart-item__property,li,dd,p');
      (row||link).style?.setProperty?.('display','none','important');
    });
    hideNameRows(root);
  };

  const getDraft=designId=>new Promise(resolve=>{
    if(!designId||!('indexedDB'in window)){resolve(null);return}
    const request=indexedDB.open('cartwala-designs',1);
    request.onerror=()=>resolve(null);
    request.onsuccess=()=>{try{const tx=request.result.transaction('drafts','readonly');const get=tx.objectStore('drafts').get(`cart:${designId}`);get.onsuccess=()=>resolve(get.result||null);get.onerror=()=>resolve(null)}catch{resolve(null)}};
  });

  const restorePreview=async root=>{
    let designId='';try{designId=sessionStorage.getItem('cartwala-last-design')||''}catch{}
    if(!designId||designId===lastDesign)return;
    const list=rows(root);const row=list[list.length-1];if(!row)return;
    const image=row.querySelector('.cart-item__image,img');if(!image)return;
    const record=await getDraft(designId);if(!record?.blob)return;
    const url=URL.createObjectURL(record.blob);
    image.removeAttribute('srcset');image.removeAttribute('sizes');
    image.closest('picture')?.querySelectorAll('source').forEach(source=>{source.removeAttribute('srcset');source.removeAttribute('sizes')});
    image.src=url;image.dataset.cwDraftId=designId;image.style.objectFit='contain';lastDesign=designId;
  };

  const refresh=()=>{const root=cartRoot();cleanPrivateRows(root);restorePreview(root)};
  const schedule=(delay=20)=>{clearTimeout(timer);timer=setTimeout(refresh,delay)};

  new MutationObserver(()=>schedule(10)).observe(document.documentElement,{childList:true,subtree:true,characterData:true});
  document.addEventListener('cart:updated',()=>schedule(0));
  document.addEventListener('product:added',()=>schedule(0));
  document.addEventListener('cartwala:compatibility-cart-add',()=>schedule(0));
  document.addEventListener('DOMContentLoaded',()=>schedule(0),{once:true});
  window.addEventListener('pageshow',()=>schedule(0));
  schedule(0);
})();
