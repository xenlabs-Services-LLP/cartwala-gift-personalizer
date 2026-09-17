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

      // Match the blue frame to the photo as it is actually rendered. The
      // viewport clips the image, so intersect the transformed image bounds
      // with the slot bounds instead of drawing the frame around the whole slot.
      const imageRect=image.getBoundingClientRect();
      const left=Math.max(viewportRect.left,imageRect.left);
      const top=Math.max(viewportRect.top,imageRect.top);
      const right=Math.min(viewportRect.right,imageRect.right);
      const bottom=Math.min(viewportRect.bottom,imageRect.bottom);
      if(right<=left||bottom<=top){box.hidden=true;return}
      box.style.left=`${left-stageRect.left+(right-left)/2}px`;
      box.style.top=`${top-stageRect.top+(bottom-top)/2}px`;
      box.style.width=`${right-left}px`;
      box.style.height=`${bottom-top}px`;
      box.style.transform='translate(-50%,-50%)';
      box.hidden=false;
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