(() => {
  if (window.cartwalaPrintMetadataReady) return;
  window.cartwalaPrintMetadataReady = true;
  const number = (value, fallback = 0) => {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
  };
  const parseConfig = (root) => {
    try {
      return JSON.parse(
        root.querySelector("[data-cw-config]")?.dataset?.cwConfig || "{}",
      );
    } catch {
      return {};
    }
  };
  const matrixFor = (element) => {
    try {
      const value = getComputedStyle(element).transform;
      if (!value || value === "none") return null;
      return new DOMMatrixReadOnly(value);
    } catch {
      return null;
    }
  };
  const saveMetadata = (root) => {
    const dialog = root.querySelector("[data-cw-dialog]");
    const result = root.querySelector("[data-cw-result]");
    if (dialog?.open || !result || result.hidden) return false;
    const stage = root.querySelector("[data-cw-stage]");
    if (!stage || !stage.clientWidth || !stage.clientHeight) return false;
    const area =
      root.closest(
        ".product__info-container,.product-info,.product__info-wrapper,.shopify-section",
      ) ||
      root.closest("section") ||
      document;
    const form =
      area.querySelector('form[action*="/cart/add"]') ||
      document.querySelector('form[action*="/cart/add"]');
    if (!form) return false;
    const config = parseConfig(root);
    const photoFields = Array.isArray(config.photoFields)
      ? config.photoFields
      : [];
    const textFields = Array.isArray(config.textFields)
      ? config.textFields
      : [];
    const photos = photoFields
      .map((field, index) => {
        const viewport = root.querySelector(
          `.cw-personalizer__photo-viewport[data-index="${index}"]`,
        );
        const image = viewport?.querySelector(".cw-personalizer__photo");
        if (!viewport || !image || !image.getAttribute("src")) return null;
        const matrix = matrixFor(image);
        const scale = matrix ? Math.hypot(matrix.a, matrix.b) : 1;
        const angle = matrix
          ? (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
          : 0;
        return {
          i: String(field.id ?? index),
          l: String(field.label || `Photo ${index + 1}`),
          x: number(field.x, 50),
          y: number(field.y, 50),
          w: number(field.width, 24),
          h: number(field.height, 24),
          m: String(field.maskUrl || ""),
          ox: matrix ? matrix.e / stage.clientWidth : 0,
          oy: matrix ? matrix.f / stage.clientHeight : 0,
          s: number(scale, 1),
          a: number(angle, 0),
        };
      })
      .filter(Boolean);
    const inputs = [...root.querySelectorAll(".cw-personalizer__text-input")];
    const fontSelects = [
      ...root.querySelectorAll(".cw-personalizer__font-select"),
    ];
    const textLayers = [
      ...root.querySelectorAll(".cw-personalizer__text-preview"),
    ];
    const texts = textFields
      .map((field, index) => {
        const layer = textLayers[index],
          matrix = layer ? matrixFor(layer) : null,
          style = layer ? getComputedStyle(layer) : null;
        return {
          i: String(field.id ?? index),
          l: String(field.label || `Text ${index + 1}`),
          v: String(inputs[index]?.value || field.defaultValue || ""),
          x: number(layer?.dataset.cwX, number(field.x, 50)),
          y: number(layer?.dataset.cwY, number(field.y, 50)),
          z: number(layer?.dataset.cwFontSize, number(field.fontSize, 60)),
          c: String(layer?.dataset.cwColor || field.color || "#111111"),
          f: String(fontSelects[index]?.value || field.fontFamily || "Arial"),
          a: number(
            layer?.dataset.cwRotation,
            matrix
              ? (Math.atan2(matrix.b, matrix.a) * 180) / Math.PI
              : number(field.rotation, 0),
          ),
        };
      })
      .filter((item) => item.v.trim());
    const payload = {
      v: 1,
      r: String(config.canvasRatio || "1:1"),
      o: String(root.dataset.overlay || config.overlayUrl || ""),
      p: photos,
      t: texts,
    };
    let input = form.querySelector("input[data-cw-print-metadata]");
    if (!input) {
      input = document.createElement("input");
      input.type = "hidden";
      input.name = "properties[_Cartwala Design JSON]";
      input.dataset.cwPrintMetadata = "true";
      form.appendChild(input);
    }
    input.value = JSON.stringify(payload);
    return true;
  };
  const init = (root) => {
    if (root.dataset.cwPrintMetadataReady === "true") return;
    root.dataset.cwPrintMetadataReady = "true";
    const dialog = root.querySelector("[data-cw-dialog]");
    const result = root.querySelector("[data-cw-result]");
    const save = root.querySelector("[data-cw-save]");
    let timer = 0;
    const schedule = (delay = 60) => {
      clearTimeout(timer);
      timer = setTimeout(() => saveMetadata(root), delay);
    };
    save?.addEventListener(
      "click",
      () => {
        let attempts = 0;
        const poll = () => {
          attempts++;
          if (saveMetadata(root) || attempts > 120) return;
          setTimeout(poll, 100);
        };
        setTimeout(poll, 100);
      },
      true,
    );
    if (dialog)
      new MutationObserver(() => schedule()).observe(dialog, {
        attributes: true,
        attributeFilter: ["open"],
      });
    if (result)
      new MutationObserver(() => schedule()).observe(result, {
        attributes: true,
        attributeFilter: ["hidden"],
      });
    window.addEventListener("pageshow", () => schedule(300));
  };
  const boot = () =>
    document.querySelectorAll("[data-cw-personalizer]").forEach(init);
  boot();
  document.addEventListener("shopify:section:load", boot);
})();
