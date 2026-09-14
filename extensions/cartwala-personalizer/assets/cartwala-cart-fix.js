(()=>{
  const isCdnValue=text=>/cdn\.shopify\.com\/s\/files\//i.test(text||'');
  const cleanPrivatePhotoRows=root=>{
    if(!root)return;
    root.querySelectorAll('dl,ul,.product-option,.cart-item__details,.cart-item__properties,.properties').forEach(container=>{
      const children=[...container.children];
      for(let i=0;i<children.length;i++){
        const node=children[i];
        const text=(node.textContent||'').trim();
        if(isCdnValue(text)){
          const previous=node.previousElementSibling;
          if(previous&&/^\s*(?:1|2|3|photo\s*\d*)\s*:?\s*$/i.test(previous.textContent||''))previous.remove();
          node.remove();
          continue;
        }
        if(/^\s*(?:1|2|3|photo\s*\d*)\s*:\s*https?:\/\/cdn\.shopify\.com\/s\/files\//i.test(text))node.remove();
      }
    });
    root.querySelectorAll('a').forEach(link=>{
      if(!isCdnValue(link.href)&&!isCdnValue(link.textContent))return;
      const row=link.closest('.product-option,li,dd,p,div');
      if(row&&row!==root)row.remove();else link.remove();
    });
  };

  const getDraft=designId=>new Promise((resolve,reject)=>{
    if(!designId||!('indexedDB'in window)){resolve(null);return}
    const request=indexedDB.open('cartwala-designs',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{
      const db=request.result;
      try{
        const tx=db.transaction('drafts','readonly');
        const get=tx.objectStore('drafts').get(`cart:${designId}`);
        get.onsuccess=()=>resolve(get.result||null);get.onerror=()=>reject(get.error);
      }catch(error){reject(error)}
    };
  });
  const replaceNewestCartImage=async()=>{
    const designId=sessionStorage.getItem('cartwala-last-design');
    if(!designId)return;
    try{
      const record=await getDraft(designId);if(!record?.blob)return;
      const drawer=document.querySelector('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer');if(!drawer)return;
      const rows=[...drawer.querySelectorAll('.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item')];
      const row=rows[rows.length-1]||drawer;
      const image=row.querySelector('.cart-item__image,img');if(!image)return;
      if(image.dataset.cwDraftId===designId)return;
      const url=URL.createObjectURL(record.blob);
      image.removeAttribute('srcset');image.removeAttribute('sizes');
      image.closest('picture')?.querySelectorAll('source').forEach(source=>{source.removeAttribute('srcset');source.removeAttribute('sizes')});
      image.src=url;image.dataset.cwDraftId=designId;image.style.objectFit='contain';
    }catch(error){console.warn('Cartwala cart preview restore unavailable',error)}
  };
  let timer=0;
  const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{const drawer=document.querySelector('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer');cleanPrivatePhotoRows(drawer||document);replaceNewestCartImage()},30)};
  const observer=new MutationObserver(refresh);observer.observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('cart:updated',refresh);document.addEventListener('DOMContentLoaded',refresh,{once:true});refresh();
})();