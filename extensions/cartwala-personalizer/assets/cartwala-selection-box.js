(()=>{
  const initRoot=root=>{
    if(root.dataset.cwSelectionReady==='true')return;
    root.dataset.cwSelectionReady='true';
    const stage=root.querySelector('[data-cw-stage]');
    if(!stage)return;
    const box=document.createElement('div');
    box.className='cw-personalizer__selection-box';
    Object.assign(box.style,{position:'absolute',zIndex:'8',pointerEvents:'none',display:'none',boxSizing:'border-box',border:'2px solid #2684ff',boxShadow:'0 0 0 1px #fff8',background:'transparent'});
    stage.appendChild(box);
    const update=()=>{
      const viewport=stage.querySelector('.cw-personalizer__photo-viewport.is-active');
      const image=viewport?.querySelector('.cw-personalizer__photo');
      if(!viewport||!image||!image.src||getComputedStyle(image).display==='none'||viewport.offsetParent===null){box.style.display='none';return;}
      const stageRect=stage.getBoundingClientRect();
      const rect=viewport.getBoundingClientRect();
      box.style.display='block';
      box.style.left=`${rect.left-stageRect.left}px`;
      box.style.top=`${rect.top-stageRect.top}px`;
      box.style.width=`${rect.width}px`;
      box.style.height=`${rect.height}px`;
      const mask=getComputedStyle(viewport).maskImage||getComputedStyle(viewport).webkitMaskImage;
      if(mask&&mask!=='none'){
        box.style.borderRadius='4px';
      }else{
        box.style.borderRadius=getComputedStyle(viewport).borderRadius||'0';
      }
    };
    const observer=new MutationObserver(()=>requestAnimationFrame(update));
    observer.observe(stage,{subtree:true,attributes:true,attributeFilter:['class','style','src','hidden']});
    stage.addEventListener('pointerdown',()=>requestAnimationFrame(update),true);
    stage.addEventListener('pointermove',()=>requestAnimationFrame(update),true);
    stage.addEventListener('pointerup',()=>requestAnimationFrame(update),true);
    stage.addEventListener('wheel',()=>requestAnimationFrame(update),{passive:true});
    root.querySelector('[data-cw-open]')?.addEventListener('click',()=>setTimeout(update,0));
    root.querySelector('[data-cw-save]')?.addEventListener('click',()=>{box.style.display='none'});
    root.querySelector('[data-cw-close]')?.addEventListener('click',()=>{box.style.display='none'});
    new ResizeObserver(update).observe(stage);
    window.addEventListener('resize',update);
    update();
  };
  const init=()=>document.querySelectorAll('[data-cw-personalizer]').forEach(initRoot);
  init();
  document.addEventListener('DOMContentLoaded',init,{once:true});
  document.addEventListener('shopify:section:load',init);
})();