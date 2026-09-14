(()=>{
  const isCdnValue=text=>/cdn\.shopify\.com\/s\/files\//i.test(text||'');
  const money=cents=>new Intl.NumberFormat('en-IN',{style:'currency',currency:'INR',maximumFractionDigits:0}).format((Number(cents)||0)/100);
  const productCache=new Map();

  const cleanPrivateRows=root=>{
    if(!root)return;
    root.querySelectorAll('dl,ul,.product-option,.cart-item__details,.cart-item__properties,.properties').forEach(container=>{
      const children=[...container.children];
      for(let i=0;i<children.length;i++){
        const node=children[i];
        const text=(node.textContent||'').trim();
        if(isCdnValue(text)){
          const previous=node.previousElementSibling;
          if(previous&&/^\s*(?:1|2|3|photo\s*\d*)\s*:?\s*$/i.test(previous.textContent||''))previous.remove();
          node.remove();continue;
        }
        if(/^\s*(?:1|2|3|photo\s*\d*)\s*:\s*https?:\/\/cdn\.shopify\.com\/s\/files\//i.test(text))node.remove();
      }
    });
    root.querySelectorAll('a').forEach(link=>{
      if(!isCdnValue(link.href)&&!isCdnValue(link.textContent))return;
      const row=link.closest('.product-option,li,dd,p,div');
      if(row&&row!==root)row.remove();else link.remove();
    });
    root.querySelectorAll('.product-option,.cart-item__property,dd,p,li').forEach(node=>{
      const text=(node.textContent||'').trim();
      if(/^Your\s+Name\s*:/i.test(text))node.remove();
    });
  };

  const getDraft=designId=>new Promise((resolve,reject)=>{
    if(!designId||!('indexedDB'in window)){resolve(null);return}
    const request=indexedDB.open('cartwala-designs',1);
    request.onerror=()=>reject(request.error);
    request.onsuccess=()=>{const db=request.result;try{const tx=db.transaction('drafts','readonly');const get=tx.objectStore('drafts').get(`cart:${designId}`);get.onsuccess=()=>resolve(get.result||null);get.onerror=()=>reject(get.error)}catch(error){reject(error)}};
  });

  const replaceNewestCartImage=async()=>{
    const designId=sessionStorage.getItem('cartwala-last-design');if(!designId)return;
    try{const record=await getDraft(designId);if(!record?.blob)return;const drawer=document.querySelector('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer');if(!drawer)return;const rows=[...drawer.querySelectorAll('.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item')];const row=rows[rows.length-1]||drawer;const image=row.querySelector('.cart-item__image,img');if(!image||image.dataset.cwDraftId===designId)return;const url=URL.createObjectURL(record.blob);image.removeAttribute('srcset');image.removeAttribute('sizes');image.closest('picture')?.querySelectorAll('source').forEach(source=>{source.removeAttribute('srcset');source.removeAttribute('sizes')});image.src=url;image.dataset.cwDraftId=designId;image.style.objectFit='contain'}catch(error){console.warn('Cartwala cart preview restore unavailable',error)}
  };

  const getProduct=async handle=>{
    if(!handle)return null;if(productCache.has(handle))return productCache.get(handle);
    const promise=fetch((window.Shopify?.routes?.root||'/')+`products/${handle}.js`,{headers:{Accept:'application/json'}}).then(r=>r.ok?r.json():null).catch(()=>null);productCache.set(handle,promise);return promise;
  };

  const findRows=root=>[...root.querySelectorAll('.cart-item,[data-cart-item],cart-drawer-item,.drawer__cart-item')];
  const enhancePrices=async root=>{
    if(!root)return;
    let cart;try{const r=await fetch((window.Shopify?.routes?.root||'/')+'cart.js',{headers:{Accept:'application/json'},cache:'no-store'});if(!r.ok)return;cart=await r.json()}catch{return}
    const rows=findRows(root);
    for(let i=0;i<rows.length;i++){
      const row=rows[i],item=cart.items[i];if(!item)continue;
      let sale=Number(item.final_price??item.price??0),compare=Number(item.original_price??0);
      const product=await getProduct(item.handle);
      const variant=product?.variants?.find(v=>String(v.id)===String(item.variant_id));
      if(variant){sale=Number(variant.price??sale);compare=Math.max(compare,Number(variant.compare_at_price||0));}
      let block=row.querySelector('.cw-cart-price-block');if(!block){block=document.createElement('div');block.className='cw-cart-price-block';const anchor=row.querySelector('.cart-item__details,[class*="details"],a[href*="/products/"]')?.parentElement||row;anchor.appendChild(block)}
      const discount=compare>sale&&compare>0?Math.round((compare-sale)*100/compare):0;
      block.innerHTML=`<span class="cw-cart-sale">${money(sale)}</span>${compare>sale?` <span class="cw-cart-compare">${money(compare)}</span> <span class="cw-cart-discount">${discount}% OFF</span>`:''}`;
      row.querySelectorAll('.cart-item__totals .price,.cart-item__price-wrapper,.price--end').forEach(el=>{if(!el.closest('.cw-cart-price-block'))el.style.display='none'});
    }
  };

  let timer=0;
  const refresh=()=>{clearTimeout(timer);timer=setTimeout(()=>{const drawer=document.querySelector('cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer');const root=drawer||document;cleanPrivateRows(root);replaceNewestCartImage();enhancePrices(root)},40)};
  new MutationObserver(refresh).observe(document.documentElement,{childList:true,subtree:true});
  document.addEventListener('cart:updated',refresh);document.addEventListener('DOMContentLoaded',refresh,{once:true});window.addEventListener('pageshow',refresh);refresh();
})();