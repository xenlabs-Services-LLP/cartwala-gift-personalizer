(() => {
  const DAY_MS = 86400000;

  const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

  const formatRange = (start, end) => {
    const locale = document.documentElement.lang || "en-IN";
    const day = new Intl.DateTimeFormat(locale, { day: "numeric" });
    const month = new Intl.DateTimeFormat(locale, { month: "long" });
    const year = new Intl.DateTimeFormat(locale, { year: "numeric" });
    const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();

    if (sameMonth) {
      return `${day.format(start)}–${day.format(end)} ${month.format(end)} ${year.format(end)}`;
    }

    return `${day.format(start)} ${month.format(start)}–${day.format(end)} ${month.format(end)} ${year.format(end)}`;
  };

  const findPlacement = (widget) => {
    const scope = widget.closest(".shopify-section") || document;
    const paymentButton = scope.querySelector(".shopify-payment-button, [data-shopify='payment-button']");
    if (paymentButton) return paymentButton;

    const productForm = scope.querySelector("product-form, form[action*='/cart/add']");
    if (!productForm) return null;

    return productForm.querySelector(".product-form__buttons, [data-buy-buttons]") || productForm;
  };

  const render = (widget) => {
    if (widget.dataset.cwReady === "true") return;

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const dispatchStart = Number(widget.dataset.dispatchStart || 1);
    const dispatchEnd = Number(widget.dataset.dispatchEnd || 2);
    const deliveryStart = Number(widget.dataset.deliveryStart || 8);
    const deliveryEnd = Number(widget.dataset.deliveryEnd || 9);

    widget.querySelector("[data-cw-dispatch-dates]").textContent = formatRange(
      addDays(today, dispatchStart),
      addDays(today, Math.max(dispatchStart, dispatchEnd)),
    );
    widget.querySelector("[data-cw-delivery-dates]").textContent = formatRange(
      addDays(today, deliveryStart),
      addDays(today, Math.max(deliveryStart, deliveryEnd)),
    );

    const placement = findPlacement(widget);
    if (placement && placement.nextElementSibling !== widget) placement.insertAdjacentElement("afterend", widget);
    widget.dataset.cwReady = "true";
  };

  const init = () => document.querySelectorAll("[data-cw-delivery-estimate]").forEach(render);

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init, { once: true });
  else init();

  document.addEventListener("shopify:section:load", init);
})();
