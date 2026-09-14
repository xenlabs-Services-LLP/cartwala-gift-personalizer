(()=>{
  const initRoot=root=>{
    if(root.dataset.cwEditorUiReady==='true')return;
    root.dataset.cwEditorUiReady='true';
    const resetAll=root.querySelector('[data-cw-reset-all]');
    const changePhoto=root.querySelector('[data-cw-change-photo]');
    const textTools=root.querySelector('[data-cw-text-tools]');
    const dialog=root.querySelector('[data-cw-dialog]');
    const stage=root.querySelector('[data-cw-stage]');

    const classifyFields=()=>{
      root.querySelectorAll('.cw-personalizer__field').forEach(field=>{
        if(field.matches('[data-photo-index]'))field.classList.add('cw-field-photo');
        if(field.querySelector('.cw-personalizer__text-input[type="text"]'))field.classList.add('cw-field-text');
        if(field.querySelector('.cw-personalizer__font-select'))field.classList.add('cw-field-has-font');
      });
    };

    const activePhotoCard=()=>{
      const active=stage?.querySelector('.cw-personalizer__photo-viewport.is-active')||stage?.querySelector('.cw-personalizer__photo-viewport');
      const index=active?.dataset.index;
      return index==null?null:root.querySelector(`[data-photo-index="${index}"]`);
    };

    resetAll?.addEventListener('click',()=>{
      root.querySelectorAll('.cw-personalizer__photo-controls button').forEach(button=>button.click());
      root.querySelectorAll('.cw-personalizer__text-input').forEach(input=>{
        if(input.type==='text'){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))}
      });
      root.querySelectorAll('.cw-personalizer__font-select').forEach(select=>{
        select.selectedIndex=0;select.dispatchEvent(new Event('change',{bubbles:true}))
      });
    });

    changePhoto?.addEventListener('click',()=>{
      const card=activePhotoCard();
      const inputs=card?.querySelectorAll('input[type="file"]');
      const input=inputs?.[inputs.length-1];
      input?.click();
    });

    const syncTopFont=()=>{
      if(!textTools)return;
      const source=root.querySelector('.cw-personalizer__font-select');
      textTools.innerHTML='';
      if(!source){textTools.hidden=true;return}
      textTools.hidden=false;
      const select=document.createElement('select');
      select.className='cw-personalizer__toolbar-font';
      [...source.options].forEach(option=>select.add(new Option(option.text,option.value,option.defaultSelected,option.selected)));
      select.value=source.value;
      select.addEventListener('change',()=>{source.value=select.value;source.dispatchEvent(new Event('change',{bubbles:true}))});
      source.addEventListener('change',()=>{select.value=source.value});
      textTools.appendChild(select);
    };

    dialog?.addEventListener('click',event=>{
      const field=event.target.closest('.cw-personalizer__field');
      if(!field)return;
      root.querySelectorAll('.cw-personalizer__field').forEach(item=>item.classList.toggle('cw-ui-selected',item===field));
    });

    const observer=new MutationObserver(()=>{classifyFields();syncTopFont()});
    const fields=root.querySelector('[data-cw-editor-fields]');
    if(fields)observer.observe(fields,{childList:true,subtree:true});
    classifyFields();syncTopFont();
  };
  const init=()=>document.querySelectorAll('[data-cw-personalizer]').forEach(initRoot);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  document.addEventListener('shopify:section:load',init);
})();