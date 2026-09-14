(()=>{
  const initialize=()=>document.querySelectorAll('[data-cw-personalizer]').forEach(root=>{
    if(root.dataset.cwPhotoSelectionReady==='true')return;
    root.dataset.cwPhotoSelectionReady='true';
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
      box.appendChild(handle);
    }
    stage.appendChild(box);

    let selected=null;
    const select=viewport=>{
      if(!viewport)return;
      selected=viewport;
      update();
    };

    const update=()=>{
      const viewport=selected;
      const image=viewport?.querySelector('.cw-personalizer__photo');
      const visible=Boolean(viewport&&image&&image.src&&image.style.display!=='none'&&dialog?.open&&result?.hidden!==false);
      if(!visible){box.hidden=true;return}

      const stageRect=stage.getBoundingClientRect();
      const viewportRect=viewport.getBoundingClientRect();
      const vw=viewport.clientWidth;
      const vh=viewport.clientHeight;
      const nw=image.naturalWidth||vw;
      const nh=image.naturalHeight||vh;
      if(!vw||!vh||!nw||!nh){box.hidden=true;return}

      const fit=Math.max(vw/nw,vh/nh);
      const baseW=nw*fit;
      const baseH=nh*fit;
      const transform=getComputedStyle(image).transform;
      let tx=0,ty=0,sx=1,angle=0;
      if(transform&&transform!=='none'){
        try{
          const matrix=new DOMMatrixReadOnly(transform);
          tx=matrix.m41;ty=matrix.m42;
          sx=Math.hypot(matrix.a,matrix.b)||1;
          angle=Math.atan2(matrix.b,matrix.a)*180/Math.PI;
        }catch(error){/* keep safe defaults */}
      }

      const centerX=viewportRect.left-stageRect.left+viewportRect.width/2+tx;
      const centerY=viewportRect.top-stageRect.top+viewportRect.height/2+ty;
      box.style.left=`${centerX}px`;
      box.style.top=`${centerY}px`;
      box.style.width=`${baseW}px`;
      box.style.height=`${baseH}px`;
      box.style.transform=`translate(-50%,-50%) scale(${sx}) rotate(${angle}deg)`;
      box.hidden=false;
    };

    stage.addEventListener('pointerdown',event=>{
      const viewport=event.target.closest('.cw-personalizer__photo-viewport');
      if(viewport)select(viewport);
    },true);
    root.addEventListener('change',()=>requestAnimationFrame(update),true);
    root.addEventListener('input',()=>requestAnimationFrame(update),true);
    stage.addEventListener('wheel',()=>requestAnimationFrame(update),{passive:true});
    stage.addEventListener('pointermove',()=>requestAnimationFrame(update),{passive:true});
    dialog?.addEventListener('close',()=>{box.hidden=true});
    root.querySelector('[data-cw-open]')?.addEventListener('click',()=>setTimeout(()=>{
      const active=stage.querySelector('.cw-personalizer__photo-viewport.is-active')||stage.querySelector('.cw-personalizer__photo-viewport');
      if(active)select(active);
    },0));
    new ResizeObserver(()=>requestAnimationFrame(update)).observe(stage);
    new MutationObserver(()=>requestAnimationFrame(update)).observe(stage,{subtree:true,attributes:true,attributeFilter:['class','style','src','hidden']});
  });
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',initialize);else initialize();
  document.addEventListener('shopify:section:load',initialize);
})();
