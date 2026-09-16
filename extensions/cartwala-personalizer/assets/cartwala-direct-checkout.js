(()=>{
  if(window.cwDirectCheckoutReady)return;window.cwDirectCheckoutReady=true;
  let active=false,redirectTimer=0;
  const root=()=>window.Shopify?.routes?.root||'/';
  const checkout=()=>{if(!active)return;active=false;clearTimeout(redirectTimer);location.assign(root()+'checkout')};
  const ensureBridge=()=>{
    if(document.querySelector('cart-drawer,[data-cart-drawer],.cart-drawer'))return;
    const bridge=document.createElement('div');bridge.className='cart-drawer cw-direct-checkout-bridge';bridge.hidden=true;bridge.setAttribute('aria-hidden','true');document.body.appendChild(bridge);
  };
  const start=()=>{active=true;ensureBridge();document.documentElement.classList.add('cw-direct-checkout-active')};
  const added=()=>{
    if(!active)return;
    document.dispatchEvent(new CustomEvent('cartwala:direct-cart-complete',{bubbles:true}));
    setTimeout(()=>document.dispatchEvent(new CustomEvent('cartwala:drawer-ready',{bubbles:true,detail:{directCheckout:true}})),900);
    redirectTimer=setTimeout(checkout,1450);
  };
  const error=()=>{active=false;clearTimeout(redirectTimer);document.documentElement.classList.remove('cw-direct-checkout-active')};
  const style=document.createElement('style');style.textContent='html.cw-direct-checkout-active cart-drawer,html.cw-direct-checkout-active #CartDrawer,html.cw-direct-checkout-active [data-cart-drawer],html.cw-direct-checkout-active .cart-drawer{visibility:hidden!important;opacity:0!important;pointer-events:none!important}';document.head.appendChild(style);
  document.addEventListener('cartwala:cart-start',start,true);
  document.addEventListener('cartwala:cart-complete',added,true);
  document.addEventListener('cartwala:compatibility-cart-add',added,true);
  document.addEventListener('cartwala:cart-error',error,true);
  document.addEventListener('DOMContentLoaded',ensureBridge,{once:true});
  if(document.body)ensureBridge();
})();
