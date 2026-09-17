(()=>{
  const initRoot=root=>{
    if(root.dataset.cwSelectionReady==='true')return;
    root.dataset.cwSelectionReady='true';
    const stage=root.querySelector('[data-cw-stage]');
    const dialog=root.querySelector('[data-cw-dialog]');
    const result=root.querySelector('[data-cw-result]');
    if(!stage)return;
    const box=document.createElement('div');box.className='cw-personalizer__photo-selection';box.hidden=true;box.setAttribute('aria-hidden','true');
    for(let i=0;i<4;i++){const h=document.createElement('span');h.className=`cw-personalizer__photo-selection-handle cw-personalizer__photo-selection-handle--${i+1}`;h.dataset.cwResizeHandle='true';box.appendChild(h)}stage.appendChild(box);
    let selected=null,resize=null;
    const choose=v=>{if(v){selected=v;requestAnimationFrame(update)}};
    const zoomInput=v=>{const i=v?.dataset.index;return i==null?null:root.querySelector(`[data-photo-index="${i}"] input[type="range"]`)};
    const update=()=>{
      const v=selected||stage.querySelector('.cw-personalizer__photo-viewport.is-active'),img=v?.querySelector('.cw-personalizer__photo');
      if(!v||!img||!img.src||getComputedStyle(img).display==='none'||!dialog?.open||result?.hidden===false){box.hidden=true;return}
      const sr=stage.getBoundingClientRect(),vr=v.getBoundingClientRect();
      if(!vr.width||!vr.height){box.hidden=true;return}
      /* Selection handles follow the editable/visible photo viewport. The image itself may be cover-cropped inside it. */
      box.style.left=`${vr.left-sr.left+vr.width/2}px`;
      box.style.top=`${vr.top-sr.top+vr.height/2}px`;
      box.style.width=`${vr.width}px`;
      box.style.height=`${vr.height}px`;
      box.style.transform='translate(-50%,-50%)';
      box.hidden=false;
    };
    box.addEventListener('pointerdown',e=>{const h=e.target.closest('[data-cw-resize-handle]');if(!h||!selected)return;const input=zoomInput(selected);if(!input)return;e.preventDefault();e.stopPropagation();h.setPointerCapture(e.pointerId);const r=box.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2;resize={pointerId:e.pointerId,input,startDistance:Math.max(1,Math.hypot(e.clientX-cx,e.clientY-cy)),startZoom:Number(input.value)||100}});
    box.addEventListener('pointermove',e=>{if(!resize||resize.pointerId!==e.pointerId)return;e.preventDefault();e.stopPropagation();const r=box.getBoundingClientRect(),cx=r.left+r.width/2,cy=r.top+r.height/2,d=Math.max(1,Math.hypot(e.clientX-cx,e.clientY-cy)),value=Math.max(Number(resize.input.min)||100,Math.min(Number(resize.input.max)||500,resize.startZoom*d/resize.startDistance));resize.input.value=String(Math.round(value));resize.input.dispatchEvent(new Event('input',{bubbles:true}));requestAnimationFrame(update)});
    const finish=e=>{if(resize&&resize.pointerId===e.pointerId){e.preventDefault();e.stopPropagation();resize=null}};box.addEventListener('pointerup',finish);box.addEventListener('pointercancel',finish);
    stage.addEventListener('pointerdown',e=>{const v=e.target.closest('.cw-personalizer__photo-viewport');if(v)choose(v)},true);
    new MutationObserver(()=>requestAnimationFrame(update)).observe(stage,{subtree:true,attributes:true,attributeFilter:['class','style','src','hidden']});
    ['pointermove','pointerup','wheel'].forEach(n=>stage.addEventListener(n,()=>requestAnimationFrame(update),{passive:true}));root.addEventListener('input',()=>requestAnimationFrame(update),true);root.addEventListener('change',()=>requestAnimationFrame(update),true);
    root.querySelector('[data-cw-open]')?.addEventListener('click',()=>setTimeout(()=>choose(stage.querySelector('.cw-personalizer__photo-viewport.is-active')||stage.querySelector('.cw-personalizer__photo-viewport')),0));root.querySelector('[data-cw-save]')?.addEventListener('click',()=>box.hidden=true);root.querySelector('[data-cw-close]')?.addEventListener('click',()=>box.hidden=true);dialog?.addEventListener('close',()=>box.hidden=true);new ResizeObserver(()=>requestAnimationFrame(update)).observe(stage);
  };
  const init=()=>document.querySelectorAll('[data-cw-personalizer]').forEach(initRoot);if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();document.addEventListener('shopify:section:load',init);
})();