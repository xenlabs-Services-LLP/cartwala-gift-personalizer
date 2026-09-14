(()=>{
  const initRoot=root=>{
    if(root.dataset.cwEditorUiReady==='true')return;
    root.dataset.cwEditorUiReady='true';
    const resetAll=root.querySelector('[data-cw-reset-all]');
    const dialog=root.querySelector('[data-cw-dialog]');
    resetAll?.addEventListener('click',()=>{
      root.querySelectorAll('.cw-personalizer__photo-controls button').forEach(button=>button.click());
      root.querySelectorAll('.cw-personalizer__text-input').forEach(input=>{
        if(input.type==='text'){input.value='';input.dispatchEvent(new Event('input',{bubbles:true}))}
      });
      root.querySelectorAll('.cw-personalizer__font-select').forEach(select=>{
        select.selectedIndex=0;select.dispatchEvent(new Event('change',{bubbles:true}))
      });
    });
    dialog?.addEventListener('click',event=>{
      const field=event.target.closest('.cw-personalizer__field');
      if(!field)return;
      root.querySelectorAll('.cw-personalizer__field').forEach(item=>item.classList.toggle('cw-ui-selected',item===field));
    });
  };
  const init=()=>document.querySelectorAll('[data-cw-personalizer]').forEach(initRoot);
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  document.addEventListener('shopify:section:load',init);
})();