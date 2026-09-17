(()=>{
  if(window.cwPhotoCoverFixReady)return;window.cwPhotoCoverFixReady=true;
  const initRoot=root=>{
    const stage=root.querySelector('[data-cw-stage]'),save=root.querySelector('[data-cw-save]');
    if(!stage||!save)return;
    const getParts=viewport=>{const index=viewport?.dataset.index,card=index==null?null:root.querySelector(`[data-photo-index="${index}"]`),zoom=card?.querySelector('input[type="range"]'),img=viewport?.querySelector('.cw-personalizer__photo');return{zoom,img}};
    const forceFill=viewport=>{
      const {zoom,img}=getParts(viewport);if(!viewport||!img?.src)return;
      const run=()=>{
        if(!img.naturalWidth||!img.naturalHeight||!viewport.clientWidth||!viewport.clientHeight)return;
        /* CSS object-fit:cover already fills the mask. Scale 1 is therefore the true minimum. */
        img.style.objectFit='cover';
        if(zoom){zoom.min='100';zoom.value='100';zoom.dispatchEvent(new Event('input',{bubbles:true}))}
        /* Re-assert cover after the core input handler so it cannot fall back to contain. */
        requestAnimationFrame(()=>{img.style.objectFit='cover';if(getComputedStyle(img).display==='none')img.style.display='block';save.disabled=false});
      };
      if(img.complete&&img.naturalWidth)run();else img.addEventListener('load',run,{once:true});
    };
    const findViewportFromInput=input=>{const card=input?.closest('[data-photo-index]'),index=card?.dataset.photoIndex;return index==null?null:stage.querySelector(`.cw-personalizer__photo-viewport[data-index="${index}"]`)};
    root.addEventListener('change',e=>{if(!e.target.matches?.('[data-photo-index] input[type="file"]'))return;const input=e.target;[0,50,150,350].forEach(ms=>setTimeout(()=>forceFill(findViewportFromInput(input)),ms))},true);
    stage.addEventListener('load',e=>{if(e.target.matches?.('.cw-personalizer__photo'))forceFill(e.target.closest('.cw-personalizer__photo-viewport'))},true);
    root.querySelector('[data-cw-change-photo]')?.addEventListener('click',()=>{const v=stage.querySelector('.cw-personalizer__photo-viewport.is-active');if(v)setTimeout(()=>forceFill(v),250)});
    root.querySelector('[data-cw-reset-all]')?.addEventListener('click',()=>setTimeout(()=>stage.querySelectorAll('.cw-personalizer__photo-viewport').forEach(v=>{if(v.querySelector('.cw-personalizer__photo')?.src)forceFill(v)}),0));
    new MutationObserver(muts=>{for(const m of muts){const img=m.target;if(img.matches?.('.cw-personalizer__photo')&&img.src)requestAnimationFrame(()=>forceFill(img.closest('.cw-personalizer__photo-viewport')))}}).observe(stage,{subtree:true,attributes:true,attributeFilter:['src']});
  };
  const init=()=>document.querySelectorAll('[data-cw-personalizer]').forEach(initRoot);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();document.addEventListener('shopify:section:load',init);
})();