(()=>{
  if(window.__cwPreviewFitFix)return;window.__cwPreviewFitFix=true;
  const original=CanvasRenderingContext2D.prototype.drawImage;
  CanvasRenderingContext2D.prototype.drawImage=function(image,...args){
    try{
      if(image instanceof HTMLImageElement&&args.length===4&&image.src&&image.src.startsWith('blob:')){
        const root=document.querySelector('[data-cw-personalizer]');
        const stage=root?.querySelector('[data-cw-stage]');
        const configNode=root?.querySelector('[data-cw-config]');
        if(root&&stage&&configNode&&this.canvas!==stage&&this.canvas.width>=600){
          let raw={};try{raw=JSON.parse(configNode.dataset.cwConfig||'{}')}catch(_){raw={}}
          const fields=Array.isArray(raw.photoFields)?raw.photoFields:[];
          const photos=[...root.querySelectorAll('.cw-personalizer__photo')];
          const index=photos.findIndex(photo=>photo.src===image.src);
          const field=fields[index];
          if(field&&image.naturalWidth&&image.naturalHeight){
            const slotW=this.canvas.width*(Number(field.width)||24)/100;
            const slotH=this.canvas.height*(Number(field.height)||24)/100;
            const fit=Math.max(slotW/image.naturalWidth,slotH/image.naturalHeight);
            const width=image.naturalWidth*fit;
            const height=image.naturalHeight*fit;
            return original.call(this,image,-width/2,-height/2,width,height);
          }
        }
      }
    }catch(error){console.warn('Cartwala preview fit fallback',error)}
    return original.call(this,image,...args);
  };
})();
