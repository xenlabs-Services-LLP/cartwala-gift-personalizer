(()=>{
  // Cartwala personalised products must stay on the product page after Add to Cart.
  // Checkout is only entered when the customer explicitly presses the cart drawer Checkout button.
  if(window.cwDirectCheckoutReady)return;window.cwDirectCheckoutReady=true;
  const revealCart=()=>{
    document.documentElement.classList.remove('cw-direct-checkout-active');
    document.body?.classList.remove('cw-cart-preparing');
  };
  document.addEventListener('cartwala:cart-start',()=>{
    revealCart();
  },true);
  document.addEventListener('cartwala:cart-complete',event=>{
    revealCart();
    // Let cartwala-cart-fix refresh the drawer, attach the personalised preview,
    // open the popup and then emit cartwala:drawer-ready for the 100% loader.
    document.dispatchEvent(new CustomEvent('cartwala:item-added',{bubbles:true,detail:event.detail||{}}));
  },true);
  document.addEventListener('cartwala:compatibility-cart-add',event=>{
    revealCart();
    document.dispatchEvent(new CustomEvent('cartwala:item-added',{bubbles:true,detail:event.detail||{}}));
  },true);
  document.addEventListener('cartwala:cart-error',revealCart,true);
  revealCart();
})();
