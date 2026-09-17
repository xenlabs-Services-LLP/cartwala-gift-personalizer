(()=>{
  if(window.cwPhotoCoverFixReady)return;window.cwPhotoCoverFixReady=true;
  const initRoot=root=>{
    const stage=root.querySelector('[data-cw-stage]'),save=root.querySelector('[data-cw-save]');
    if(!stage||!save)return;
    const minCoverZoom=viewport=>{
      const img=viewport?.querySelector('.cw-personalizer__photo');
      if(!img?.naturalWidth||!img?.naturalHeight||!viewport.clientWidth||!viewport.clientHeight)return 100;
      const contain=Math.min(viewport.clientWidth/img.naturalWidth,viewport.clientHeight/img.naturalHeight);
      const cover=Math.max(viewport.clientWidth/img.naturalWidth,viewport.clientHeight/img.naturalHeight);
      return Math.max(100,Math.min(500,Math.ceil(100*cover/contain)));
    };
    const applyCover=viewport=>{
      const index=viewport?.dataset.index;
      if(index==null)return;
      const card=root.querySelector(`[data-photo-index="${index}"]`),zoom=card?.querySelector('input[type="range"]'),img=viewport.querySelector('.cw-personalizer__photo');
      if(!zoom||!img?.src)return;
      const value=minCoverZoom(viewport);
      zoom.min=String(value);zoom.value=String(value);zoom.dispatchEvent(new Event('input',{bubbles:true}));
      save.disabled=false;
    };
    stage.addEventListener('load',e=>{if(e.target.matches?.('.cw-personalizer__photo'))requestAnimationFrame(()=>applyCover(e.target.closest('.cw-personalizer__photo-viewport')))},true);
    root.addEventListener('change',e=>{if(!e.target.matches?.('[data-photo-index] input[type="file"]'))return;setTimeout(()=>{const card=e.target.closest('[data-photo-index]'),v=stage.querySelector(`.cw-personalizer__photo-viewport[data-index="${card?.dataset.photoIndex}"]`);if(v)applyCover(v)},60)},true);
    root.querySelector('[data-cw-reset-all]')?.addEventListener('click',()=>setTimeout(()=>stage.querySelectorAll('.cw-personalizer__photo-viewport').forEach(v=>{if(v.querySelector('.cw-personalizer__photo')?.src)applyCover(v)}),0));
  };
  const init=()=>document.querySelectorAll('[data-cw-personalizer]').forEach(initRoot);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();document.addEventListener('shopify:section:load',init);
})();