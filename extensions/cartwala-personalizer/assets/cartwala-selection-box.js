(()=>{
  const initRoot=root=>{
    if(root.dataset.cwSelectionReady==='true')return;
    root.dataset.cwSelectionReady='true';
    const stage=root.querySelector('[data-cw-stage]');
    const dialog=root.querySelector('[data-cw-dialog]');
    const result=root.querySelector('[data-cw-result]');
    if(!stage)return;

    const box=document.createElement('div');
    box.className='cw-personalizer__photo-selection';
    box.hidden=true;
    box.setAttribute('aria-hidden','true');
    for(let i=0;i<4;i++){
      const handle=document.createElement('span');
      handle.className=`cw-personalizer__photo-selection-handle cw-personalizer__photo-selection-handle--${i+1}`;
      handle.dataset.cwResizeHandle='true';
      box.appendChild(handle);
    }
    stage.appendChild(box);

    let selected=null;let resize=null;
    const choose=viewport=>{if(viewport){selected=viewport;requestAnimationFrame(update)}};
    const zoomInput=viewport=>{
      const index=viewport?.dataset.index;
      if(index==null)return null;
      return root.querySelector(`[data-photo-index="${index}"] input[type="range"]`);
    };
    const update=()=>{
      const viewport=selected||stage.querySelector('.cw-personalizer__photo-viewport.is-active');
      const image=viewport?.querySelector('.cw-personalizer__photo');
      if(!viewport||!image||!image.src||getComputedStyle(image).display==='none'||!dialog?.open||result?.hidden===false){box.hidden=true;return}
      const stageRect=stage.getBoundingClientRect();
      const viewportRect=viewport.getBoundingClientRect();
      const vw=viewport.clientWidth,vh=viewport.clientHeight;
      const nw=image.naturalWidth||vw,nh=image.naturalHeight||vh;
      if(!vw||!vh||!nw||!nh){box.hidden=true;return}
      const fit=Math.max(vw/nw,vh/nh);const baseW=nw*fit,baseH=nh*fit;
      let tx=0,ty=0,scale=1,angle=0;const transform=getComputedStyle(image).transform;
      if(transform&&transform!=='none')try{const matrix=new DOMMatrixReadOnly(transform);tx=matrix.m41;ty=matrix.m42;scale=Math.hypot(matrix.a,matrix.b)||1;angle=Math.atan2(matrix.b,matrix.a)*180/Math.PI}catch(error){}
      box.style.left=`${viewportRect.left-stageRect.left+viewportRect.width/2+tx}px`;
      box.style.top=`${viewportRect.top-stageRect.top+viewportRect.height/2+ty}px`;
      box.style.width=`${baseW}px`;box.style.height=`${baseH}px`;
      box.style.transform=`translate(-50%,-50%) scale(${scale}) rotate(${angle}deg)`;box.hidden=false;
    };

    box.addEventListener('pointerdown',event=>{
      const handle=event.target.closest('[data-cw-resize-handle]');if(!handle||!selected)return;
      const input=zoomInput(selected);if(!input)return;
      event.preventDefault();event.stopPropagation();handle.setPointerCapture(event.pointerId);
      const rect=box.getBoundingClientRect();const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      resize={pointerId:event.pointerId,input,startDistance:Math.max(1,Math.hypot(event.clientX-cx,event.clientY-cy)),startZoom:Number(input.value)||100};
    });
    box.addEventListener('pointermove',event=>{
      if(!resize||resize.pointerId!==event.pointerId)return;event.preventDefault();event.stopPropagation();
      const rect=box.getBoundingClientRect();const cx=rect.left+rect.width/2,cy=rect.top+rect.height/2;
      const distance=Math.max(1,Math.hypot(event.clientX-cx,event.clientY-cy));
      const value=Math.max(Number(resize.input.min)||100,Math.min(Number(resize.input.max)||500,resize.startZoom*distance/resize.startDistance));
      resize.input.value=String(Math.round(value));resize.input.dispatchEvent(new Event('input',{bubbles:true}));requestAnimationFrame(update);
    });
    const finishResize=event=>{if(resize&&resize.pointerId===event.pointerId){event.preventDefault();event.stopPropagation();resize=null}};
    box.addEventListener('pointerup',finishResize);box.addEventListener('pointercancel',finishResize);

    stage.addEventListener('pointerdown',event=>{const viewport=event.target.closest('.cw-personalizer__photo-viewport');if(viewport)choose(viewport)},true);
    const observer=new MutationObserver(()=>requestAnimationFrame(update));observer.observe(stage,{subtree:true,attributes:true,attributeFilter:['class','style','src','hidden']});
    stage.addEventListener('pointermove',()=>requestAnimationFrame(update),{passive:true});stage.addEventListener('pointerup',()=>requestAnimationFrame(update),{passive:true});stage.addEventListener('wheel',()=>requestAnimationFrame(update),{passive:true});
    root.addEventListener('input',()=>requestAnimationFrame(update),true);root.addEventListener('change',()=>requestAnimationFrame(update),true);
    root.querySelector('[data-cw-open]')?.addEventListener('click',()=>setTimeout(()=>choose(stage.querySelector('.cw-personalizer__photo-viewport.is-active')||stage.querySelector('.cw-personalizer__photo-viewport')),0));
    root.querySelector('[data-cw-save]')?.addEventListener('click',()=>{box.hidden=true});root.querySelector('[data-cw-close]')?.addEventListener('click',()=>{box.hidden=true});dialog?.addEventListener('close',()=>{box.hidden=true});
    new ResizeObserver(()=>requestAnimationFrame(update)).observe(stage);
  };
  const init=()=>document.querySelectorAll('[data-cw-personalizer]').forEach(initRoot);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();document.addEventListener('shopify:section:load',init);
})();