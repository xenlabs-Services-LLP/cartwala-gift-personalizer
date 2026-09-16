(()=>{
  if(window.cartwalaCartRetryLoaded)return;
  window.cartwalaCartRetryLoaded=true;

  const nativeFetch=window.fetch.bind(window);
  const isCartAdd=input=>{const value=typeof input==='string'?input:input?.url;return typeof value==='string'&&/\/cart\/add(?:\.js)?(?:\?|$)/.test(value)};
  const isFileValue=value=>typeof File!=='undefined'&&value instanceof File;
  const isImageFile=file=>isFileValue(file)&&/^image\//i.test(file.type||'');
  const retryHeaders=headers=>{const next=new Headers(headers||{});next.set('Accept','application/json');next.delete('Content-Type');return next};

  const decodeFile=file=>new Promise((resolve,reject)=>{const url=URL.createObjectURL(file);const image=new Image();const cleanup=()=>URL.revokeObjectURL(url);image.onload=()=>{cleanup();resolve(image)};image.onerror=()=>{cleanup();reject(new Error('Could not read personalization image'))};image.src=url});
  const compressImage=async(file,key)=>{
    try{
      if(!isImageFile(file))return file;
      const image=await decodeFile(file);const isPreview=/Personalised\s+Preview/i.test(key||'');const maxSide=isPreview?1100:1600;
      const longest=Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height)||1;const scale=Math.min(1,maxSide/longest);const width=Math.max(1,Math.round((image.naturalWidth||image.width)*scale));const height=Math.max(1,Math.round((image.naturalHeight||image.height)*scale));
      if(scale===1&&file.size<900000)return file;
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');if(!ctx)return file;ctx.drawImage(image,0,0,width,height);
      const quality=isPreview?0.78:0.82;const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));if(!blob||blob.size>=file.size)return file;
      const base=(file.name||'photo').replace(/\.[^.]+$/,'');return new File([blob],`${base}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
    }catch(error){console.warn('Cartwala image compression skipped',error);return file}
  };

  // Prepare every uploaded photo concurrently. The previous serial loop made 3-photo products
  // wait for image 1, then 2, then 3 before the cart request could even start on mobile.
  const optimizeForm=async source=>{
    const entries=[...source.entries()];
    const values=await Promise.all(entries.map(async([key,value])=>[key,isImageFile(value)?await compressImage(value,key):value]));
    const target=new FormData();for(const [key,value] of values)target.append(key,value);return target;
  };
  const lightweightForm=source=>{const target=new FormData();for(const [key,value] of source.entries()){if(isFileValue(value))continue;target.append(key,value)}target.set('properties[_Cartwala Upload Mode]','Compatibility fallback');return target};

  window.fetch=async(input,init)=>{
    if(!isCartAdd(input)||String(init?.method||'GET').toUpperCase()!=='POST'||!(init?.body instanceof FormData))return nativeFetch(input,init);
    document.dispatchEvent(new CustomEvent('cartwala:cart-start',{bubbles:true}));
    const optimizedBody=await optimizeForm(init.body);const optimizedInit={...init,body:optimizedBody,headers:retryHeaders(init.headers)};let firstResponse=null;
    try{firstResponse=await nativeFetch(input,optimizedInit);if(firstResponse.ok){document.dispatchEvent(new CustomEvent('cartwala:cart-complete',{bubbles:true}));return firstResponse}}catch(error){console.warn('Cartwala optimized cart request failed; trying compatibility mode',error)}
    try{const fallbackInit={...init,body:lightweightForm(init.body),headers:retryHeaders(init.headers)};const fallback=await nativeFetch(input,fallbackInit);if(fallback.ok){document.dispatchEvent(new CustomEvent('cartwala:compatibility-cart-add',{bubbles:true}));document.dispatchEvent(new CustomEvent('cartwala:cart-complete',{bubbles:true}));return fallback}document.dispatchEvent(new CustomEvent('cartwala:cart-error',{bubbles:true}));return fallback}catch(error){console.error('Cartwala compatibility cart request failed',error);document.dispatchEvent(new CustomEvent('cartwala:cart-error',{bubbles:true}));if(firstResponse)return firstResponse;throw error}
  };
})();
