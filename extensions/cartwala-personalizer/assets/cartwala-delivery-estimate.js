(() => {
  const DAY_MS = 86400000;

  const addDays = (date, days) => new Date(date.getTime() + days * DAY_MS);

  const formatDate = (date) => {
    const locale = document.documentElement.lang || "en-IN";
    return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short" }).format(date);
  };

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

  const hideLegacyDeliveryText = (widget) => {
    const scope = widget.closest(".shopify-section") || document;
    const legacyPattern = /Production:\s*\d+\s*day\(s\)[\s\S]*?Delivery:\s*\d+\s*day\(s\)/i;
    const candidates = Array.from(scope.querySelectorAll("div, p, li, span")).filter((element) => {
      if (element.closest("[data-cw-delivery-estimate]")) return false;
      const text = element.textContent.replace(/\s+/g, " ").trim();
      return text.length <= 100 && legacyPattern.test(text);
    });

    const legacyText = candidates.sort((a, b) => a.textContent.length - b.textContent.length)[0];
    if (!legacyText) return;

    let container = legacyText;
    while (container.parentElement && container.parentElement !== scope) {
      const parent = container.parentElement;
      const parentText = parent.textContent.replace(/\s+/g, " ").trim();
      if (parentText.length > 110 || !legacyPattern.test(parentText)) break;
      container = parent;
    }
    container.hidden = true;
    container.setAttribute("data-cw-legacy-delivery-hidden", "true");
    container.style.setProperty("display", "none", "important");
  };

  const render = (widget) => {
    hideLegacyDeliveryText(widget);
    if (widget.dataset.cwReady === "true") return;

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    let dispatchStart = Number(widget.dataset.dispatchStart || 2);
    let dispatchEnd = Number(widget.dataset.dispatchEnd || 3);
    let deliveryStart = Number(widget.dataset.deliveryStart || 7);
    let deliveryEnd = Number(widget.dataset.deliveryEnd || 8);

    // Upgrade blocks saved with the previous 1–2 / 8–9 day defaults.
    if (dispatchStart === 1 && dispatchEnd === 2 && deliveryStart === 8 && deliveryEnd === 9) {
      dispatchStart = 2;
      dispatchEnd = 3;
      deliveryStart = 7;
      deliveryEnd = 8;
    }

    widget.querySelector("[data-cw-ordered-date]").textContent = formatDate(today);

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

  const watchForLegacyText = () => {
    const observer = new MutationObserver(init);
    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => observer.disconnect(), 5000);
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      init();
      watchForLegacyText();
    }, { once: true });
  } else {
    init();
    watchForLegacyText();
  }

  document.addEventListener("shopify:section:load", init);
})();
