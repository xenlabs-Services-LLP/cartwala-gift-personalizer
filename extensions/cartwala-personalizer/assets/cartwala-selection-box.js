(()=>{
  const initRoot=root=>{
    if(root.dataset.cwSelectionReady==='true')return;
    root.dataset.cwSelectionReady='true';
    const stage=root.querySelector('[data-cw-stage]');
    const dialog=root.querySelector('[data-cw-dialog]');
    const result=root.querySelector('[data-cw-result]');
    if(!stage)return;

    const forceCover=viewport=>{
      const image=viewport?.querySelector('.cw-personalizer__photo');
      if(!image)return;
      image.style.position='absolute';
      image.style.inset='0';
      image.style.width='100%';
      image.style.height='100%';
      image.style.maxWidth='none';
      image.style.maxHeight='none';
      image.style.objectFit='cover';
      image.style.objectPosition='50% 50%';
      image.style.transformOrigin='50% 50%';
    };
    const forceAllCovers=()=>stage.querySelectorAll('.cw-personalizer__photo-viewport').forEach(forceCover);
    forceAllCovers();

    const box=document.createElement('div');
    box.className='cw-personalizer__photo-selection';
    box.hidden=true;
    box.setAttribute('aria-hidden','true');
    box.style.pointerEvents='none';
    for(let i=0;i<4;i++){
      const handle=document.createElement('span');
      handle.className=`cw-personalizer__photo-selection-handle cw-personalizer__photo-selection-handle--${i+1}`;
      handle.dataset.cwResizeHandle='true';
      box.appendChild(handle);
    }
    stage.appendChild(box);

    let selected=null;let resize=null;
    const choose=viewport=>{if(viewport){selected=viewport;forceCover(viewport);requestAnimationFrame(update)}};
    const zoomInput=viewport=>{
      const index=viewport?.dataset.index;
      if(index==null)return null;
      return root.querySelector(`[data-photo-index="${index}"] input[type="range"]`);
    };
    const imageOf=viewport=>viewport?.querySelector('.cw-personalizer__photo');
    const currentTransform=image=>{
      const value=image?.style.transform||'';
      const tx=value.match(/translate\(\s*(-?[\d.]+)px\s*,\s*(-?[\d.]+)px\s*\)/i);
      const sc=value.match(/scale\(\s*([\d.]+)\s*\)/i);
      const ro=value.match(/rotate\(\s*(-?[\d.]+)deg\s*\)/i);
      return {x:tx?Number(tx[1]):0,y:tx?Number(tx[2]):0,scale:sc?Number(sc[1]):1,angle:ro?Number(ro[1]):0};
    };
    const update=()=>{
      const viewport=selected||stage.querySelector('.cw-personalizer__photo-viewport.is-active');
      const image=imageOf(viewport);
      if(!viewport||!image||!image.src||getComputedStyle(image).display==='none'||!dialog?.open||result?.hidden===false){box.hidden=true;return}
      selected=viewport;forceCover(viewport);
      const stageRect=stage.getBoundingClientRect();
      const viewportRect=viewport.getBoundingClientRect();
      const vw=viewport.clientWidth,vh=viewport.clientHeight;
      const nw=image.naturalWidth||vw,nh=image.naturalHeight||vh;
      if(!vw||!vh||!nw||!nh){box.hidden=true;return}
      const state=currentTransform(image);
      const imageRatio=nw/nh,viewportRatio=vw/vh;
      const coverW=imageRatio>viewportRatio?vh*imageRatio:vw;
      const coverH=imageRatio>viewportRatio?vh:vw/imageRatio;
      const photoW=coverW*state.scale,photoH=coverH*state.scale;
      const angle=state.angle*Math.PI/180,cos=Math.abs(Math.cos(angle)),sin=Math.abs(Math.sin(angle));
      box.style.left=`${viewportRect.left-stageRect.left+viewportRect.width/2+state.x}px`;
      box.style.top=`${viewportRect.top-stageRect.top+viewportRect.height/2+state.y}px`;
      box.style.width=`${photoW*cos+photoH*sin}px`;
      box.style.height=`${photoW*sin+photoH*cos}px`;
      box.style.transform='translate(-50%,-50%)';
      box.hidden=false;
    };

    box.addEventListener('pointerdown',event=>{
      const handle=event.target.closest('[data-cw-resize-handle]');if(!handle||!selected)return;
      const input=zoomInput(selected);if(!input)return;
      event.preventDefault();event.stopPropagation();handle.setPointerCapture(event.pointerId);
      const rect=box.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      resize={pointerId:event.pointerId,input,startDistance:Math.max(1,Math.hypot(event.clientX-cx,event.clientY-cy)),startZoom:Number(input.value)||100};
    });
    box.addEventListener('pointermove',event=>{
      if(!resize||resize.pointerId!==event.pointerId)return;
      event.preventDefault();event.stopPropagation();
      const rect=box.getBoundingClientRect(),cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      const distance=Math.max(1,Math.hypot(event.clientX-cx,event.clientY-cy));
      const value=Math.max(Number(resize.input.min)||100,Math.min(Number(resize.input.max)||500,resize.startZoom*distance/resize.startDistance));
      resize.input.value=String(Math.round(value));resize.input.dispatchEvent(new Event('input',{bubbles:true}));requestAnimationFrame(update);
    });
    const finish=event=>{if(resize?.pointerId===event.pointerId){resize=null;requestAnimationFrame(update)}};
    box.addEventListener('pointerup',finish);box.addEventListener('pointercancel',finish);

    stage.addEventListener('load',event=>{if(event.target?.classList?.contains('cw-personalizer__photo')){forceCover(event.target.closest('.cw-personalizer__photo-viewport'));requestAnimationFrame(update)}},true);
    stage.addEventListener('pointerdown',event=>{const viewport=event.target.closest('.cw-personalizer__photo-viewport');if(viewport)choose(viewport)},true);
    const observer=new MutationObserver(()=>{forceAllCovers();requestAnimationFrame(update)});observer.observe(stage,{subtree:true,attributes:true,childList:true,attributeFilter:['class','style','src','hidden']});
    stage.addEventListener('pointermove',()=>requestAnimationFrame(update),{passive:true});stage.addEventListener('pointerup',()=>requestAnimationFrame(update),{passive:true});stage.addEventListener('wheel',()=>requestAnimationFrame(update),{passive:true});
    root.addEventListener('input',()=>requestAnimationFrame(update),true);root.addEventListener('change',()=>{forceAllCovers();requestAnimationFrame(update)},true);
    root.querySelector('[data-cw-open]')?.addEventListener('click',()=>setTimeout(()=>{forceAllCovers();choose(stage.querySelector('.cw-personalizer__photo-viewport.is-active')||stage.querySelector('.cw-personalizer__photo-viewport'))},0));
    root.querySelector('[data-cw-save]')?.addEventListener('click',()=>{box.hidden=true});root.querySelector('[data-cw-close]')?.addEventListener('click',()=>{box.hidden=true});dialog?.addEventListener('close',()=>{box.hidden=true});
    new ResizeObserver(()=>requestAnimationFrame(update)).observe(stage);
  };
  const init=()=>document.querySelectorAll('[data-cw-personalizer]').forEach(initRoot);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();document.addEventListener('shopify:section:load',init);
})();