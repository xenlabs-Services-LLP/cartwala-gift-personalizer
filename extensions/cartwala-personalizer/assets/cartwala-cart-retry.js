(()=>{
  if(window.cartwalaCartRetryLoaded)return;
  window.cartwalaCartRetryLoaded=true;

  const nativeFetch=window.fetch.bind(window);
  const isCartAdd=input=>{
    const value=typeof input==='string'?input:input?.url;
    return typeof value==='string'&&/\/cart\/add(?:\.js)?(?:\?|$)/.test(value);
  };
  const isFileValue=value=>typeof File!=='undefined'&&value instanceof File;
  const lightweightForm=source=>{
    const target=new FormData();
    for(const [key,value] of source.entries()){
      if(isFileValue(value))continue;
      target.append(key,value);
    }
    target.set('properties[_Cartwala Upload Mode]','Compatibility fallback');
    return target;
  };
  const retryHeaders=headers=>{
    const next=new Headers(headers||{});
    next.set('Accept','application/json');
    next.delete('Content-Type');
    return next;
  };

  window.fetch=async(input,init)=>{
    if(!isCartAdd(input)||String(init?.method||'GET').toUpperCase()!=='POST'||!(init?.body instanceof FormData)){
      return nativeFetch(input,init);
    }

    let firstResponse=null;
    try{
      firstResponse=await nativeFetch(input,init);
      if(firstResponse.ok)return firstResponse;
    }catch(error){
      console.warn('Cartwala full upload cart request failed; trying compatibility mode',error);
    }

    try{
      const fallbackInit={...init,body:lightweightForm(init.body),headers:retryHeaders(init.headers)};
      const fallback=await nativeFetch(input,fallbackInit);
      if(fallback.ok){
        document.dispatchEvent(new CustomEvent('cartwala:compatibility-cart-add',{bubbles:true}));
        return fallback;
      }
      return fallback;
    }catch(error){
      console.error('Cartwala compatibility cart request failed',error);
      if(firstResponse)return firstResponse;
      throw error;
    }
  };
})();
