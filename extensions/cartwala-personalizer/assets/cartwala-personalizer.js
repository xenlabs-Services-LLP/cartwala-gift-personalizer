(() => {
  const clamp = (value, min, max, fallback) => {
    const number = Number(value);
    return Math.min(
      max,
      Math.max(min, Number.isFinite(number) ? number : fallback),
    );
  };
  const array = (value) => (Array.isArray(value) ? value : []);
  const MAX_FIELDS = 200;
  const MAX_FONTS = 50;
  const createId = () => {
    try {
      if (
        typeof crypto !== "undefined" &&
        typeof crypto.randomUUID === "function"
      )
        return crypto.randomUUID();
    } catch (error) {
      /* fall through to the manual id below */
    }
    return (
      "cw-" +
      Date.now().toString(36) +
      "-" +
      Math.random().toString(36).slice(2, 10)
    );
  };
  const normalize = (raw) => {
    const input = raw && typeof raw === "object" ? raw : {};
    let photos = [];
    let texts = [];
    if (Array.isArray(input.photoFields))
      photos = input.photoFields.slice(0, MAX_FIELDS).map((field, index) => ({
        id: String(field?.id || index),
        label: String(field?.label || `Photo ${index + 1}`),
        maskUrl: String(field?.maskUrl || ""),
        x: clamp(field?.x, 0, 100, 50),
        y: clamp(field?.y, 0, 100, 50),
        width: clamp(field?.width, 2, 100, 24),
        height: clamp(field?.height, 2, 100, 24),
        rotationEnabled: field?.rotationEnabled === true,
        required: field?.required !== false,
      }));
    else {
      const legacyType = String(input.customizationType || "photo");
      const count =
        legacyType === "text" ? 0 : clamp(input.photoFields, 0, MAX_FIELDS, 1);
      photos = Array.from({ length: count }, (_, index) => ({
        id: String(index),
        label: `Photo ${index + 1}`,
        maskUrl: index === 0 ? String(input.maskUrl || "") : "",
        x: ((index + 1) / (count + 1)) * 100,
        y: 50,
        width: 24,
        height: 24,
        rotationEnabled: input.rotationEnabled === true,
        required: true,
      }));
    }
    if (Array.isArray(input.textFields))
      texts = input.textFields.slice(0, MAX_FIELDS).map((field, index) => ({
        id: String(field?.id || index),
        label: String(field?.label || `Text ${index + 1}`),
        placeholder: String(
          field?.placeholder ||
            field?.defaultValue ||
            field?.label ||
            `Text ${index + 1}`,
        ).slice(0, 500),
        defaultValue: Object.prototype.hasOwnProperty.call(
          field || {},
          "placeholder",
        )
          ? String(field?.defaultValue || "").slice(0, 500)
          : "",
        maxLength: clamp(field?.maxLength, 1, 500, 100),
        maxLines: clamp(field?.maxLines, 1, 5, 1),
        color: /^#[0-9a-f]{6}$/i.test(String(field?.color))
          ? String(field.color)
          : "#111111",
        x: clamp(field?.x, 0, 100, 50),
        y: clamp(field?.y, 0, 100, 50),
        width: clamp(field?.width, 2, 100, 30),
        height: clamp(field?.height, 2, 100, 12),
        alignment: ["left", "center", "right"].includes(
          String(field?.alignment),
        )
          ? String(field.alignment)
          : "center",
        fitToBox: field?.fitToBox === true,
        fontSize: clamp(field?.fontSize, 8, 300, 60),
        fontFamily: String(field?.fontFamily || "Arial"),
        allowFontChoice: field?.allowFontChoice === true,
        movable: field?.movable === true,
        scalable: field?.scalable === true,
        rotatable: field?.rotatable === true,
        allowColorChoice: field?.allowColorChoice === true,
        rotation: clamp(field?.rotation, -180, 180, 0),
        required: field?.required !== false,
      }));
    else if (String(input.customizationType || "").includes("text"))
      texts = [
        {
          id: "0",
          label: String(input.textLabel || "Text 1"),
          placeholder: String(input.textLabel || "Your Text"),
          defaultValue: "",
          maxLength: clamp(input.textMaxLength, 1, 500, 100),
          color: String(input.textColor || "#111111"),
          x: 50,
          y: 50,
          width: 30,
          height: 12,
          alignment: "center",
          fitToBox: false,
          fontSize: 60,
          fontFamily: "Arial",
          allowFontChoice: false,
          movable: false,
          scalable: false,
          rotatable: false,
          allowColorChoice: false,
          rotation: 0,
          required: true,
        },
      ];
    const files = array(input.fileFields)
      .slice(0, MAX_FIELDS)
      .map((field, index) => ({
        id: String(field?.id || index),
        label: String(field?.label || `Design file ${index + 1}`),
        accept: String(field?.accept || ".psd,.pdf,.ai,.eps,.cdr,.zip"),
        maxSizeMb: clamp(field?.maxSizeMb, 1, 200, 50),
        required: field?.required !== false,
      }));
    const links = array(input.linkFields)
      .slice(0, MAX_FIELDS)
      .map((field, index) => ({
        id: String(field?.id || index),
        label: String(field?.label || `Canva link ${index + 1}`),
        placeholder: String(
          field?.placeholder || "Paste the Canva design link",
        ),
        required: field?.required !== false,
      }));
    const fonts = array(input.customFonts)
      .slice(0, MAX_FONTS)
      .map((font, index) => ({
        id: String(font?.id || index),
        name: String(font?.name || `Custom font ${index + 1}`),
        url: String(font?.url || ""),
      }))
      .filter((font) => font.url);
    const ratio = /^\d{1,5}:\d{1,5}$/.test(String(input.canvasRatio))
      ? String(input.canvasRatio)
      : "1:1";
    return { photos, texts, files, links, fonts, ratio };
  };

  const createMugGeometry = (mugModel) => {
    const vertices = [];
    const indices = [];
    const surface = (rows, columns, point) => {
      const offset = vertices.length / 9;
      for (let row = 0; row <= rows; row += 1) {
        for (let column = 0; column <= columns; column += 1) {
          vertices.push(...point(row / rows, column / columns));
          if (row < rows && column < columns) {
            const a = offset + row * (columns + 1) + column;
            const b = a + columns + 1;
            indices.push(a, b, a + 1, a + 1, b, b + 1);
          }
        }
      }
    };
    const lathe = (profile, material) => {
      surface(profile.length - 1, 160, (v, u) => {
        const index = Math.round(v * (profile.length - 1));
        const [radius, height] = profile[index];
        const before = profile[Math.max(0, index - 1)];
        const after = profile[Math.min(profile.length - 1, index + 1)];
        const dr = after[0] - before[0];
        const dy = after[1] - before[1];
        const length = Math.hypot(dr, dy) || 1;
        const angle = u * Math.PI * 2;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return [
          radius * cos,
          height,
          radius * sin,
          (cos * dy) / length,
          -dr / length,
          (sin * dy) / length,
          u,
          (height + 1.1) / 2.2,
          material,
        ];
      });
    };
    lathe(
      [
        [0.95, -1.12],
        [0.98, -1.1],
        [1, -1.04],
        [1, 1.1],
      ],
      0,
    );
    lathe(
      [
        [1, 1.1],
        [0.995, 1.125],
        [0.976, 1.145],
        [0.95, 1.15],
        [0.924, 1.145],
        [0.905, 1.125],
        [0.9, 1.1],
        [0.9, -0.91],
        [0.87, -0.98],
        [0.8, -1.01],
        [0, -1.01],
      ],
      1,
    );
    lathe(
      [
        [0, -1.105],
        [0.76, -1.105],
        [0.78, -1.135],
        [0.9, -1.135],
        [0.95, -1.12],
      ],
      3,
    );
    const segments =
      mugModel === "love-handle"
        ? [
            [
              [0.94, 0.7],
              [1.18, 0.8],
              [1.25, 0.73],
              [1.34, 0.53],
            ],
            [
              [1.34, 0.53],
              [1.38, 0.44],
              [1.39, 0.44],
              [1.48, 0.5],
            ],
            [
              [1.48, 0.5],
              [1.88, 0.77],
              [2.08, 0.25],
              [1.78, -0.1],
            ],
            [
              [1.78, -0.1],
              [1.54, -0.38],
              [1.2, -0.61],
              [0.94, -0.61],
            ],
          ]
        : [
            [
              [0.94, 0.69],
              [1.12, 0.69],
              [1.6, 0.77],
              [1.7, 0.41],
            ],
            [
              [1.7, 0.41],
              [1.77, 0.14],
              [1.77, -0.14],
              [1.7, -0.41],
            ],
            [
              [1.7, -0.41],
              [1.6, -0.77],
              [1.12, -0.69],
              [0.94, -0.69],
            ],
          ];
    const tangents = segments.map(([a, b, c, d], index) => {
      const previous = segments[index - 1];
      const next = segments[index + 1];
      const start = previous
        ? [b[0] - previous[2][0], b[1] - previous[2][1]]
        : [b[0] - a[0], b[1] - a[1]];
      const end = next
        ? [next[1][0] - c[0], next[1][1] - c[1]]
        : [d[0] - c[0], d[1] - c[1]];
      return { start, end };
    });
    segments.forEach(([a, b, c, d], index) => {
      surface(24, 16, (t, u) => {
        const s = 1 - t;
        const x =
          s ** 3 * a[0] +
          3 * s * s * t * b[0] +
          3 * s * t * t * c[0] +
          t ** 3 * d[0];
        const y =
          s ** 3 * a[1] +
          3 * s * s * t * b[1] +
          3 * s * t * t * c[1] +
          t ** 3 * d[1];
        let dx =
          3 * s * s * (b[0] - a[0]) +
          6 * s * t * (c[0] - b[0]) +
          3 * t * t * (d[0] - c[0]);
        let dy =
          3 * s * s * (b[1] - a[1]) +
          6 * s * t * (c[1] - b[1]) +
          3 * t * t * (d[1] - c[1]);
        if (t === 0) [dx, dy] = tangents[index].start;
        if (t === 1) [dx, dy] = tangents[index].end;
        const length = Math.hypot(dx, dy) || 1;
        const cos = Math.cos(u * Math.PI * 2);
        const sin = Math.sin(u * Math.PI * 2);
        const nx = (-dy / length) * cos;
        const ny = (dx / length) * cos;
        return [
          x + nx * 0.115,
          y + ny * 0.115,
          sin * 0.115,
          nx,
          ny,
          sin,
          0,
          0,
          2,
        ];
      });
    });
    return {
      vertices: new Float32Array(vertices),
      indices: new Uint16Array(indices),
    };
  };

  const mugRotationMatrix = (pitch, yaw) => {
    const x = (-pitch * Math.PI) / 180;
    const y = (yaw * Math.PI) / 180;
    const cx = Math.cos(x),
      sx = Math.sin(x),
      cy = Math.cos(y),
      sy = Math.sin(y);
    return [cy, sx * sy, -cx * sy, 0, cx, sx, sy, -sx * cy, cx * cy];
  };

  const mugFrame = (
    vertices,
    rotation,
    aspect,
    gallery = false,
    footprint = 3.05,
  ) => {
    const bounds = [Infinity, Infinity, -Infinity, -Infinity];
    for (let i = 0; i < vertices.length; i += 9) {
      const x =
        rotation[0] * vertices[i] +
        rotation[3] * vertices[i + 1] +
        rotation[6] * vertices[i + 2];
      const y =
        rotation[1] * vertices[i] +
        rotation[4] * vertices[i + 1] +
        rotation[7] * vertices[i + 2];
      bounds[0] = Math.min(bounds[0], x);
      bounds[1] = Math.min(bounds[1], y);
      bounds[2] = Math.max(bounds[2], x);
      bounds[3] = Math.max(bounds[3], y);
    }
    return {
      center: [
        (bounds[0] + bounds[2]) / 2,
        gallery ? 0 : (bounds[1] + bounds[3]) / 2,
      ],
      // Shared envelope keeps all three gallery views and mug models the same size.
      // The freely rotating dialog still fits its complete projected geometry.
      scale: gallery
        ? Math.min(1.74 / 2.75, (1.96 * aspect) / footprint)
        : Math.min(
            1.62 / (bounds[3] - bounds[1]),
            (1.78 * aspect) / (bounds[2] - bounds[0]),
          ),
    };
  };

  const createMugRenderer = (scene, mugModel, geometry, fallbackLabel) => {
    const canvas = document.createElement("canvas");
    canvas.className = "cw-mug-preview__canvas";
    canvas.setAttribute("aria-hidden", "true");
    const fallback = document.createElement("img");
    fallback.className = "cw-mug-preview__fallback";
    fallback.alt = fallbackLabel;
    fallback.hidden = true;
    scene.append(canvas, fallback);
    let gl;
    try {
      gl = canvas.getContext("webgl", { alpha: true, antialias: true });
    } catch {
      gl = null;
    }
    let program, buffer, indexBuffer, texture, brandTexture, locations;
    let image = null;
    let latestState = null;
    let imageVersion = 0;
    let textureReady = false;
    let disposed = false;
    const showFallback = () => {
      canvas.hidden = true;
      fallback.hidden = !image;
      scene.dataset.cwRenderState = "fallback";
    };
    const uploadTexture = () => {
      if (!image || !gl || gl.isContextLost()) return;
      const limit = Math.min(2048, gl.getParameter(gl.MAX_TEXTURE_SIZE));
      const scale = Math.min(
        1,
        limit / Math.max(image.naturalWidth, image.naturalHeight),
      );
      const source = document.createElement("canvas");
      source.width = Math.max(1, Math.round(image.naturalWidth * scale));
      source.height = Math.max(1, Math.round(image.naturalHeight * scale));
      source
        .getContext("2d")
        .drawImage(image, 0, 0, source.width, source.height);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        source,
      );
      textureReady = true;
      canvas.hidden = false;
      fallback.hidden = true;
      scene.dataset.cwRenderState = "ready";
    };
    const setup = () => {
      if (!gl) return;
      const shader = (type, code) => {
        const result = gl.createShader(type);
        gl.shaderSource(result, code);
        gl.compileShader(result);
        if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) {
          const message = gl.getShaderInfoLog(result);
          gl.deleteShader(result);
          throw new Error(message);
        }
        return result;
      };
      const vertex = shader(
        gl.VERTEX_SHADER,
        `
        attribute vec3 aPosition;
        attribute vec3 aNormal;
        attribute vec2 aUV;
        attribute float aMaterial;
        uniform mat3 uRotation;
        uniform vec2 uCenter;
        uniform vec2 uScale;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUV;
        varying float vMaterial;
        void main() {
          vec3 p = uRotation * aPosition;
          gl_Position = vec4((p.xy - uCenter) * uScale, -p.z / 8.0, 1.0);
          vNormal = uRotation * aNormal;
          vPosition = aPosition;
          vUV = aUV;
          vMaterial = aMaterial;
        }`,
      );
      const fragment = shader(
        gl.FRAGMENT_SHADER,
        `
        precision mediump float;
        uniform sampler2D uTexture;
        uniform sampler2D uBrand;
        uniform vec3 uBody;
        uniform vec3 uInner;
        uniform vec3 uHandle;
        uniform float uReveal;
        uniform float uTextured;
        varying vec3 vNormal;
        varying vec3 vPosition;
        varying vec2 vUV;
        varying float vMaterial;
        void main() {
          vec3 colour = uBody;
          if (vMaterial > 2.5) {
            vec4 brand = texture2D(uBrand, vPosition.xz / 1.5 + 0.5);
            colour = mix(vec3(0.94), brand.rgb, brand.a);
          }
          else if (vMaterial > 1.5) {
            // Trim embedded handle ends in local space, including when tilted.
            if (dot(vPosition.xz, vPosition.xz) < 1.0) discard;
            colour = uHandle;
          }
          else if (vMaterial > 0.5) colour = uInner;
          else if (vUV.x > 0.075 && vUV.x < 0.925 && vUV.y > 0.018 && vUV.y < 0.982) {
            vec2 uv = vec2((0.925 - vUV.x) / 0.85, (vUV.y - 0.018) / 0.964);
            vec4 art = texture2D(uTexture, uv);
            colour = mix(uBody, mix(vec3(1.0), art.rgb, art.a), uReveal * uTextured);
          }
          vec3 normal = normalize(vNormal);
          vec3 light = normalize(vec3(-0.6, 1.1, 1.8));
          float diffuse = max(0.0, dot(normal, light));
          float shine = pow(max(0.0, dot(normal, normalize(light + vec3(0.0, 0.0, 1.0)))), 65.0);
          float interior = vMaterial > 0.5 && vMaterial < 1.5 ? 0.88 : 1.0;
          gl_FragColor = vec4(colour * (0.64 + 0.36 * diffuse) * interior + vec3(0.14 * shine), 1.0);
        }`,
      );
      program = gl.createProgram();
      gl.attachShader(program, vertex);
      gl.attachShader(program, fragment);
      gl.linkProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS))
        throw new Error(gl.getProgramInfoLog(program));
      gl.useProgram(program);
      buffer = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, geometry.vertices, gl.STATIC_DRAW);
      [
        ["aPosition", 3, 0],
        ["aNormal", 3, 12],
        ["aUV", 2, 24],
        ["aMaterial", 1, 32],
      ].forEach(([name, size, offset]) => {
        const attribute = gl.getAttribLocation(program, name);
        gl.enableVertexAttribArray(attribute);
        gl.vertexAttribPointer(attribute, size, gl.FLOAT, false, 36, offset);
      });
      indexBuffer = gl.createBuffer();
      gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
      gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, geometry.indices, gl.STATIC_DRAW);
      locations = Object.fromEntries(
        [
          "uRotation",
          "uCenter",
          "uScale",
          "uBody",
          "uInner",
          "uHandle",
          "uReveal",
          "uTextured",
        ].map((key) => [key, gl.getUniformLocation(program, key)]),
      );
      texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        1,
        1,
        0,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        new Uint8Array([255, 255, 255, 255]),
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      const stamp = document.createElement("canvas");
      stamp.width = stamp.height = 512;
      const ink = stamp.getContext("2d");
      ink.clearRect(0, 0, 512, 512);
      ink.fillStyle = "#777777";
      ink.font = "56px Arial, sans-serif";
      ink.textAlign = "center";
      ink.textBaseline = "middle";
      ink.fillText("Cartwala", 256, 216);
      ink.font = "72px Arial, sans-serif";
      ink.fillText("Preview", 256, 288);
      brandTexture = gl.createTexture();
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, brandTexture);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(
        gl.TEXTURE_2D,
        0,
        gl.RGBA,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        stamp,
      );
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.uniform1i(gl.getUniformLocation(program, "uBrand"), 1);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.enable(gl.DEPTH_TEST);
      textureReady = false;
      uploadTexture();
    };
    const rgb = (hex) => {
      const value = hex.replace("#", "");
      const full =
        value.length === 3
          ? value
              .split("")
              .map((c) => c + c)
              .join("")
          : value;
      return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255);
    };
    const render = (state = latestState) => {
      latestState = state;
      if (disposed || !state || !gl || !program || gl.isContextLost()) return;
      const { width, height } = scene.getBoundingClientRect();
      if (!width || !height) return;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = Math.round(width * dpr),
        h = Math.round(height * dpr);
      if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w;
        canvas.height = h;
      }
      const rotation = mugRotationMatrix(state.rotationX, state.rotationY);
      const frame = mugFrame(
        geometry.vertices,
        rotation,
        width / height,
        Boolean(scene.closest?.(".cw-mug-preview__views")),
        Number(scene.dataset.cwRotationY) === 90 ? 2.05 : 3.05,
      );
      gl.viewport(0, 0, w, h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      gl.useProgram(program);
      gl.uniformMatrix3fv(locations.uRotation, false, rotation);
      gl.uniform2fv(locations.uCenter, frame.center);
      gl.uniform2f(
        locations.uScale,
        frame.scale / (width / height),
        frame.scale,
      );
      gl.uniform3fv(
        locations.uBody,
        rgb(mugModel === "magic" && !state.heated ? "#171717" : "#ffffff"),
      );
      gl.uniform3fv(locations.uInner, rgb(state.innerColour));
      gl.uniform3fv(locations.uHandle, rgb(state.handleColour));
      gl.uniform1f(
        locations.uReveal,
        mugModel !== "magic" || state.heated ? 1 : 0,
      );
      gl.uniform1f(locations.uTextured, textureReady ? 1 : 0);
      gl.drawElements(
        gl.TRIANGLES,
        geometry.indices.length,
        gl.UNSIGNED_SHORT,
        0,
      );
    };
    try {
      setup();
    } catch (error) {
      program = null;
      console.warn("Cartwala mug preview:", error);
      showFallback();
    }
    if (!gl) showFallback();
    const observer = new ResizeObserver(() => render());
    observer.observe(scene);
    canvas.addEventListener("webglcontextlost", (event) => {
      event.preventDefault();
      showFallback();
    });
    canvas.addEventListener("webglcontextrestored", () => {
      if (disposed) return;
      try {
        setup();
        render();
      } catch {
        program = null;
        showFallback();
      }
    });
    return {
      render,
      setTexture: (url) => {
        const version = ++imageVersion;
        const next = new Image();
        next.crossOrigin = "anonymous";
        next.onload = () => {
          if (disposed || version !== imageVersion) return;
          image = next;
          fallback.src = url;
          try {
            if (gl && program && !gl.isContextLost()) {
              uploadTexture();
              render();
            } else showFallback();
          } catch {
            showFallback();
          }
        };
        next.onerror = () => {
          if (disposed || version !== imageVersion) return;
          image = next;
          fallback.src = url;
          showFallback();
        };
        next.src = url;
      },
      dispose: () => {
        disposed = true;
        observer.disconnect();
        if (!gl) return;
        gl.deleteBuffer(buffer);
        gl.deleteBuffer(indexBuffer);
        gl.deleteTexture(texture);
        gl.deleteTexture(brandTexture);
        gl.deleteProgram(program);
      },
    };
  };

  const initializeMugPreview = (root) => {
    const preview = root.querySelector("[data-cw-mug-preview]");
    if (!preview || preview.dataset.cwMugReady === "true") return;
    preview.dataset.cwMugReady = "true";
    const mugDialog = root.querySelector("[data-cw-mug-dialog]");
    const mugModel = root.dataset.cwMugModel || "white";
    const stage = root.querySelector("[data-cw-mug-stage]");
    const open = preview.querySelector("[data-cw-mug-open]");
    const close = mugDialog?.querySelector("[data-cw-mug-close]");
    const magicToggles = Array.from(
      root.querySelectorAll("[data-cw-magic-toggle]"),
    );
    let heated = false;
    const sceneElements = Array.from(
      root.querySelectorAll("[data-cw-mug-scene]"),
    );
    if (!mugDialog || !stage || !open || !close || !sceneElements.length)
      return;

    const mountPreviewInGallery = () => {
      if (preview.dataset.cwGalleryMounted === "true") return;
      const scope = root.closest("main") || document;
      const images = Array.from(
        scope.querySelectorAll(
          "[data-gallery-main] img,.product__media img,[data-product-media] img,.product-gallery img,.product__media-item img,.slider-mobile-gutter img",
        ),
      );
      const image = images.find(
        (candidate) =>
          !preview.contains(candidate) && candidate.offsetParent !== null,
      );
      if (!image) return;
      const host =
        image.closest(
          ".product__media-item,[data-product-media],.product-media-container,.product__media",
        ) || image.parentElement;
      if (!host) return;
      host.classList.add("cw-mug-gallery-host");
      host.querySelectorAll("[data-cw-mug-preview]").forEach((existing) => {
        if (existing !== preview) existing.hidden = true;
      });
      preview.classList.add("cw-mug-preview--gallery");
      host.appendChild(preview);
      preview.dataset.cwGalleryMounted = "true";
    };

    const geometry = createMugGeometry(mugModel);
    const scenes = sceneElements.map((scene) => {
      scene.dataset.cwMugModel = mugModel;
      return {
        scene,
        renderer: createMugRenderer(
          scene,
          mugModel,
          geometry,
          preview.dataset.cwRenderFallback || "",
        ),
        rotationX: Number(scene.dataset.cwRotationX ?? -18),
        rotationY: Number(scene.dataset.cwRotationY ?? 90),
        handleColour: "#ffffff",
        innerColour: "#ffffff",
      };
    });
    const interactive = scenes.find(({ scene }) => stage.contains(scene));
    if (!interactive) return;

    const colourMap = {
      white: "#ffffff",
      black: "#171717",
      "light green": "#8cdb72",
      green: "#48c95d",
      orange: "#ee6c2d",
      yellow: "#f2df31",
      red: "#df3e43",
      pink: "#ed6d9a",
      blue: "#347bd1",
      purple: "#8756c7",
    };
    const colourFromName = (value) => {
      const normalized = String(value || "")
        .trim()
        .toLowerCase();
      if (/^#[0-9a-f]{3,8}$/i.test(normalized)) return normalized;
      return colourMap[normalized] || "#ffffff";
    };
    const selectedColourName = () => {
      const controls = Array.from(
        document.querySelectorAll('select, input[type="radio"]:checked'),
      );
      const colourControl = controls.find((control) => {
        const fieldset = control.closest("fieldset");
        const label = control.id
          ? document.querySelector(`label[for="${CSS.escape(control.id)}"]`)
          : null;
        const descriptor = [
          control.name,
          control.id,
          control.dataset.optionName,
          fieldset?.querySelector("legend")?.textContent,
          label?.dataset.optionName,
        ]
          .filter(Boolean)
          .join(" ");
        return /colou?r/i.test(descriptor);
      });
      if (!colourControl) return "";
      if (colourControl.tagName === "SELECT") {
        return (
          colourControl.selectedOptions[0]?.textContent || colourControl.value
        );
      }
      return colourControl.value || colourControl.dataset.value || "White";
    };
    const applyColour = () => {
      const selectedColour = selectedColourName();
      const optionColour = selectedColour ? colourFromName(selectedColour) : "";
      const handleColour =
        optionColour ||
        (mugModel === "magic"
          ? "#171717"
          : mugModel === "red"
            ? "#d92f3f"
            : "#ffffff");
      const rimColour =
        optionColour || (mugModel === "red" ? "#d92f3f" : "#ffffff");
      scenes.forEach((model) => {
        model.handleColour = handleColour;
        model.innerColour = rimColour;
        renderScene(model);
      });
    };

    let pointerStartX = 0;
    let pointerStartY = 0;
    let rotationStartX = interactive.rotationX;
    let rotationStartY = interactive.rotationY;
    let dragging = false;
    const renderScene = (model) => {
      model.renderer.render({ ...model, heated });
    };
    const render = () => scenes.forEach(renderScene);
    const setHeated = (value) => {
      heated = value;
      root.classList.toggle("is-magic-heated", heated);
      preview.classList.toggle("is-magic-heated", heated);
      mugDialog.classList.toggle("is-magic-heated", heated);
      magicToggles.forEach((toggle) => {
        toggle.textContent = heated
          ? toggle.dataset.hotLabel
          : toggle.dataset.coldLabel;
        toggle.setAttribute("aria-pressed", String(heated));
      });
      render();
    };
    const usesThreeViewArtwork = () => {
      try {
        const config = JSON.parse(
          root.querySelector("[data-cw-config]")?.dataset.cwConfig || "{}",
        );
        return config.canvasRatio === "1536:1024";
      } catch {
        return false;
      }
    };
    const threeViewTexture = (url) =>
      new Promise((resolve) => {
        const source = new Image();
        source.crossOrigin = "anonymous";
        source.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = 1536;
          canvas.height = 512;
          const context = canvas.getContext("2d");
          const panels = [
            [180, 235, 365, 500],
            [570, 235, 395, 500],
            [990, 235, 370, 500],
          ];
          panels.forEach((panel, index) => {
            context.drawImage(
              source,
              panel[0],
              panel[1],
              panel[2],
              panel[3],
              index * 512,
              0,
              512,
              512,
            );
          });
          resolve(canvas.toDataURL("image/png"));
        };
        source.onerror = () => resolve(url);
        source.src = url;
      });
    const applyTexture = async (url) => {
      if (typeof url !== "string" || !url) return;
      const textureUrl = usesThreeViewArtwork()
        ? await threeViewTexture(url)
        : url;
      scenes.forEach(({ renderer }) => renderer.setTexture(textureUrl));
      mountPreviewInGallery();
      preview.hidden = false;
      setHeated(mugModel === "magic");
    };

    const openMugDialog = () => {
      if (mugDialog.open) return;
      if (typeof mugDialog.showModal === "function") {
        mugDialog.showModal();
      } else {
        mugDialog.setAttribute("open", "");
      }
      requestAnimationFrame(() => renderScene(interactive));
    };
    const closeMugDialog = () => {
      if (typeof mugDialog.close === "function" && mugDialog.open) {
        mugDialog.close();
      } else {
        mugDialog.removeAttribute("open");
      }
    };

    open.addEventListener("click", openMugDialog);
    close.addEventListener("click", closeMugDialog);
    magicToggles.forEach((toggle) =>
      toggle.addEventListener("click", () => setHeated(!heated)),
    );
    preview.addEventListener("click", (event) => event.stopPropagation());
    mugDialog.addEventListener("click", (event) => {
      if (event.target === mugDialog) closeMugDialog();
    });
    stage.addEventListener("keydown", (event) => {
      if (
        !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
      )
        return;
      event.preventDefault();
      if (event.key === "ArrowLeft") interactive.rotationY -= 12;
      if (event.key === "ArrowRight") interactive.rotationY += 12;
      if (event.key === "ArrowUp")
        interactive.rotationX = Math.max(-110, interactive.rotationX - 8);
      if (event.key === "ArrowDown")
        interactive.rotationX = Math.min(110, interactive.rotationX + 8);
      renderScene(interactive);
    });
    stage.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0) return;
      dragging = true;
      pointerStartX = event.clientX;
      pointerStartY = event.clientY;
      rotationStartX = interactive.rotationX;
      rotationStartY = interactive.rotationY;
      stage.setPointerCapture?.(event.pointerId);
      stage.classList.add("is-dragging");
    });
    stage.addEventListener("pointermove", (event) => {
      if (!dragging) return;
      interactive.rotationY =
        rotationStartY + (event.clientX - pointerStartX) * 0.75;
      interactive.rotationX = Math.max(
        -110,
        Math.min(110, rotationStartX - (event.clientY - pointerStartY) * 0.55),
      );
      renderScene(interactive);
    });
    const stopDragging = (event) => {
      if (!dragging) return;
      dragging = false;
      if (stage.hasPointerCapture?.(event.pointerId))
        stage.releasePointerCapture(event.pointerId);
      stage.classList.remove("is-dragging");
    };
    stage.addEventListener("pointerup", stopDragging);
    stage.addEventListener("pointercancel", stopDragging);
    stage.addEventListener("lostpointercapture", stopDragging);
    const section = root.closest(".shopify-section");
    section?.addEventListener(
      "shopify:section:unload",
      () => {
        scenes.forEach(({ renderer }) => renderer.dispose());
        document.removeEventListener("change", applyColour);
        document.removeEventListener("variant:change", applyColour);
        document.removeEventListener("product:variant-change", applyColour);
        if (!root.contains(preview)) preview.remove();
      },
      { once: true },
    );
    document.addEventListener("change", applyColour);
    document.addEventListener("variant:change", applyColour);
    document.addEventListener("product:variant-change", applyColour);
    root.addEventListener("cartwala:preview-ready", (event) => {
      applyTexture(event.detail?.url);
    });
    applyColour();
    render();
  };

  const initialize = () =>
    document.querySelectorAll("[data-cw-personalizer]").forEach((root) => {
      if (root.dataset.cwReady === "true") return;
      root.dataset.cwReady = "true";
      try {
        initializeMugPreview(root);
        const dialog = root.querySelector("[data-cw-dialog]");
        const stage = root.querySelector("[data-cw-stage]");
        const photoLayers = root.querySelector("[data-cw-photo-layers]");
        const textLayers = root.querySelector("[data-cw-text-layers]");
        const fields = root.querySelector("[data-cw-editor-fields]");
        const overlay = root.querySelector("[data-cw-overlay]");
        const save = root.querySelector("[data-cw-save]");
        const saveLabel = save.textContent;
        const result = root.querySelector("[data-cw-result]");
        const resultImage = root.querySelector("[data-cw-result-image]");
        let saved = false;
        let busy = false;
        let previewUrl = null;
        let revision = 0;
        let designId = createId();
        let raw = {};
        try {
          raw = JSON.parse(
            root.querySelector("[data-cw-config]").dataset.cwConfig || "{}",
          );
        } catch (error) {
          console.error("Cartwala configuration is invalid", error);
        }
        const config = normalize(raw);
        root.style.setProperty("--cw-accent", root.dataset.accent || "#ff6200");
        root.style.setProperty("--cw-ratio", config.ratio.replace(":", "/"));
        const [canvasWidth, canvasHeight] = config.ratio.split(":").map(Number);
        root.style.setProperty(
          "--cw-stage-ratio",
          String(canvasWidth / canvasHeight || 1),
        );
        config.fonts.forEach((font) => {
          const style = document.createElement("style");
          const name = font.name.replace(/["\\]/g, "");
          const url = font.url.replace(/["\\]/g, "");
          style.textContent = `@font-face{font-family:"${name}";src:local("${name}"),url("${url}");font-display:swap}`;
          document.head.appendChild(style);
          document.fonts
            ?.load(`16px "${name}"`)
            .catch((error) =>
              console.warn("Cartwala custom font could not be loaded", error),
            );
        });
        if (root.dataset.overlay) overlay.src = root.dataset.overlay;
        else overlay.hidden = true;
        if (!config.photos.length && !config.texts.length) stage.hidden = true;

        const productArea =
          root.closest(
            ".product__info-container,.product-info,.product__info-wrapper,.shopify-section",
          ) ||
          root.closest("section") ||
          document;
        const productForm =
          productArea.querySelector('form[action*="/cart/add"]') ||
          document.querySelector('form[action*="/cart/add"]');
        if (productForm) productForm.enctype = "multipart/form-data";
        const productScope = root.closest(".shopify-section") || document;
        const hideBuyNow = () =>
          productScope
            .querySelectorAll(
              '.shopify-payment-button,[data-shopify="payment-button"],shopify-buy-it-now-button',
            )
            .forEach((element) => {
              element.hidden = true;
              element.style.display = "none";
            });
        hideBuyNow();
        new MutationObserver(hideBuyNow).observe(productScope, {
          childList: true,
          subtree: true,
        });
        const purchaseSelector =
          'button[name="add"],input[name="add"],button[type="submit"]';
        const purchaseButtons = () =>
          [...productArea.querySelectorAll('form[action*="/cart/add"]')]
            .flatMap((form) => [...form.querySelectorAll(purchaseSelector)])
            .filter(
              (button) =>
                !button.closest(".shopify-payment-button") &&
                !button.closest("[data-cw-personalizer]"),
            );
        const setPurchaseReady = (ready) =>
          purchaseButtons().forEach((button) => {
            if (button.dataset.cwDisplay === undefined)
              button.dataset.cwDisplay = button.style.display || "";
            button.hidden = !ready;
            button.style.display = ready ? button.dataset.cwDisplay : "none";
            button.disabled = !ready;
            button.setAttribute("aria-hidden", ready ? "false" : "true");
          });
        const lockButtons = () => {
          if (!saved) setPurchaseReady(false);
        };
        lockButtons();
        const observer = productForm ? new MutationObserver(lockButtons) : null;
        if (observer)
          observer.observe(productForm, { childList: true, subtree: true });
        const renderCartSections = (sections) => {
          if (!sections || typeof sections !== "object") return;
          Object.entries(sections).forEach(([id, html]) => {
            if (typeof html !== "string" || !html) return;
            const parsed = new DOMParser().parseFromString(html, "text/html");
            const replacement =
              parsed.getElementById(`shopify-section-${id}`) ||
              parsed.body.firstElementChild;
            const current = document.getElementById(`shopify-section-${id}`);
            if (current && replacement) current.replaceWith(replacement);
          });
        };
        const replaceCartRowImage = (row, url) => {
          const image = row?.querySelector(".cart-item__image,img");
          if (!image) return false;
          image.removeAttribute("srcset");
          image.removeAttribute("sizes");
          image
            .closest("picture")
            ?.querySelectorAll("source")
            .forEach((source) => {
              source.removeAttribute("srcset");
              source.removeAttribute("sizes");
            });
          image.src = url;
          image.dataset.cwPreview = url;
          image.style.objectFit = "contain";
          image.style.background = "transparent";
          return true;
        };
        const showCartPreview = async (url, id) => {
          try {
            const response = await fetch(
              (window.Shopify?.routes?.root || "/") + "cart.js",
              { headers: { Accept: "application/json" }, cache: "no-store" },
            );
            if (!response.ok) return false;
            const cart = await response.json();
            const index = cart.items.findIndex(
              (item) => item?.properties?.["_Cartwala Design ID"] === id,
            );
            if (index < 0) return false;
            const item = cart.items[index];
            const drawer = document.querySelector(
              "cart-drawer,#CartDrawer,[data-cart-drawer],.cart-drawer",
            );
            if (!drawer) return false;
            const rows = [
              ...drawer.querySelectorAll(
                "[data-cart-line-key],[data-line-key],[data-cart-item],cart-drawer-item,.cart-item,.drawer__cart-item",
              ),
            ].filter(
              (row, rowIndex, all) =>
                all.findIndex(
                  (candidate) => candidate === row || candidate.contains(row),
                ) === rowIndex,
            );
            const row =
              rows.find(
                (candidate) =>
                  candidate.dataset.cartLineKey === item.key ||
                  candidate.dataset.lineKey === item.key,
              ) ||
              drawer.querySelector(
                `#CartDrawer-Item-${index + 1},[data-index="${index + 1}"]`,
              ) ||
              rows[index];
            return replaceCartRowImage(row, url);
          } catch (error) {
            console.warn("Cartwala immediate cart preview unavailable", error);
            return false;
          }
        };
        const openCart = () => {
          const drawer = document.querySelector(
            "cart-drawer,[data-cart-drawer],.cart-drawer",
          );
          if (!drawer) {
            location.assign((window.Shopify?.routes?.root || "/") + "cart");
            return;
          }
          if (typeof drawer.open === "function") drawer.open();
          drawer.classList.add("active", "is-open");
          drawer.setAttribute("open", "");
          drawer.setAttribute("aria-hidden", "false");
          document.body.classList.add("overflow-hidden");
          document.dispatchEvent(
            new CustomEvent("cart:updated", { bubbles: true }),
          );
        };
        const invalidate = () => {
          revision++;
          saved = false;
          setPurchaseReady(false);
          result.hidden = true;
        };
        let cartSubmitting = false;
        productForm?.addEventListener(
          "submit",
          async (event) => {
            event.preventDefault();
            event.stopImmediatePropagation();
            if (!saved || busy) {
              dialog.showModal();
              return;
            }
            if (cartSubmitting) return;
            cartSubmitting = true;
            purchaseButtons().forEach((button) => (button.disabled = true));
            try {
              const formData = new FormData(productForm);
              stagedFiles.forEach((file, name) => {
                const propertyName = name.startsWith("_") ? name : `_${name}`;
                formData.set(
                  `properties[${propertyName}]`,
                  file,
                  file.name || "upload",
                );
              });
              formData.set("sections", "cart-drawer,cart-icon-bubble");
              formData.set("sections_url", location.pathname);
              const response = await fetch(
                (window.Shopify?.routes?.root || "/") + "cart/add.js",
                {
                  method: "POST",
                  body: formData,
                  headers: { Accept: "application/json" },
                },
              );
              if (!response.ok) {
                const failure = await response.json().catch(() => ({}));
                throw new Error(
                  failure.description ||
                    failure.message ||
                    "The personalised item could not be added to cart.",
                );
              }
              const added = await response.json();
              renderCartSections(added.sections);
              sessionStorage.setItem("cartwala-last-design", designId);
              setTimeout(() => {
                openCart();
                showCartPreview(previewUrl, designId);
              }, 50);
              setTimeout(() => showCartPreview(previewUrl, designId), 300);
              cartSubmitting = false;
            } catch (error) {
              cartSubmitting = false;
              setPurchaseReady(true);
              window.alert(
                error instanceof Error
                  ? error.message
                  : "The personalised item could not be added to cart.",
              );
            }
          },
          true,
        );
        let activePhoto = 0;
        const pointers = new Map();
        let gesture = null;

        const photoStates = config.photos.map((field, index) => {
          const viewport = document.createElement("div");
          viewport.className = "cw-personalizer__photo-viewport";
          viewport.dataset.index = String(index);
          viewport.style.left = `${field.x - field.width / 2}%`;
          viewport.style.top = `${field.y - field.height / 2}%`;
          viewport.style.width = `${field.width}%`;
          viewport.style.height = `${field.height}%`;
          viewport.style.right = "auto";
          viewport.style.bottom = "auto";
          if (field.maskUrl) {
            viewport.style.maskImage = `url("${field.maskUrl}")`;
            viewport.style.webkitMaskImage = `url("${field.maskUrl}")`;
            viewport.style.maskSize = "100% 100%";
            viewport.style.webkitMaskSize = "100% 100%";
            viewport.style.maskPosition = "center";
            viewport.style.webkitMaskPosition = "center";
            viewport.style.maskRepeat = "no-repeat";
            viewport.style.webkitMaskRepeat = "no-repeat";
          }
          const image = document.createElement("img");
          image.className = "cw-personalizer__photo";
          image.alt = field.label;
          viewport.appendChild(image);
          photoLayers.appendChild(viewport);
          const card = document.createElement("section");
          card.className = "cw-personalizer__field";
          card.dataset.photoIndex = String(index);
          const title = document.createElement("div");
          title.className = "cw-personalizer__field-title";
          title.textContent =
            field.label +
            (field.required
              ? ` (${root.dataset.labelRequired || "Required"})`
              : "");
          const slot = document.createElement("button");
          slot.type = "button";
          slot.className = "cw-personalizer__slot";
          slot.innerHTML =
            '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5M5 14v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4"/></svg><span></span>';
          slot.querySelector("span").textContent =
            config.photos.length > 1
              ? String(index + 1)
              : root.dataset.labelUpload || "Upload photo";
          slot.title = `${field.label} — ${root.dataset.labelUpload || "Upload photo"}`;
          slot.setAttribute(
            "aria-label",
            field.label + " — " + (root.dataset.labelUpload || "Upload photo"),
          );
          slot.style.left = `${field.x}%`;
          slot.style.top = `${field.y}%`;
          slot.style.width = `${field.width}%`;
          slot.style.height = `${field.height}%`;
          slot.style.transform = "translate(-50%,-50%)";
          slot.style.position = "absolute";
          slot.style.zIndex = "6";
          slot.dataset.cwPhotoSlot = String(index);
          stage.appendChild(slot);
          const fileLabel = document.createElement("label");
          fileLabel.className = "cw-personalizer__file";
          fileLabel.textContent = root.dataset.labelUpload || "Upload photo";
          const fileInput = document.createElement("input");
          fileInput.type = "file";
          fileInput.accept = "image/jpeg,image/png,image/webp";
          fileLabel.appendChild(fileInput);
          const controls = document.createElement("div");
          controls.className = "cw-personalizer__photo-controls";
          controls.hidden = true;
          const resetButton = document.createElement("button");
          resetButton.type = "button";
          resetButton.textContent = root.dataset.labelReset || "Reset";
          const zoomLabel = document.createElement("label");
          zoomLabel.append(root.dataset.labelZoom || "Zoom");
          const zoom = document.createElement("input");
          zoom.type = "range";
          zoom.min = "100";
          zoom.max = "500";
          zoom.value = "100";
          zoomLabel.appendChild(zoom);
          const rotationLabel = document.createElement("label");
          rotationLabel.append(root.dataset.labelRotation || "Rotation");
          const rotation = document.createElement("input");
          rotation.type = "range";
          rotation.min = "-180";
          rotation.max = "180";
          rotation.value = "0";
          rotationLabel.appendChild(rotation);
          if (!field.rotationEnabled) rotationLabel.hidden = true;
          const changeLabel = document.createElement("label");
          changeLabel.className = "cw-personalizer__file";
          changeLabel.textContent = root.dataset.labelChange || "Change photo";
          const changeInput = document.createElement("input");
          changeInput.type = "file";
          changeInput.accept = "image/jpeg,image/png,image/webp";
          changeLabel.appendChild(changeInput);
          controls.append(resetButton, zoomLabel, rotationLabel, changeLabel);
          card.append(title, controls);
          fileLabel.hidden = true;
          card.append(fileLabel);
          slot.addEventListener("click", () => {
            selectPhoto(index);
            if (!photoStates[index]?.file) fileInput.click();
          });
          fields.appendChild(card);
          card.addEventListener("pointerdown", () => {
            selectPhoto(index);
          });
          viewport.addEventListener("pointerdown", () => selectPhoto(index));
          return {
            slot,
            field,
            index,
            viewport,
            image,
            card,
            fileLabel,
            fileInput,
            changeInput,
            controls,
            zoom,
            rotation,
            resetButton,
            x: 0,
            y: 0,
            scale: 1,
            angle: 0,
            file: null,
            objectUrl: null,
          };
        });
        const selectPhoto = (index) => {
          activePhoto = index;
          photoStates.forEach((state, stateIndex) => {
            const active = stateIndex === index;
            state.card.hidden = !active;
            state.card.classList.toggle("is-active", active);
            state.viewport.classList.toggle(
              "is-active",
              active && Boolean(state.file),
            );
            state.controls.hidden = !active || !state.file;
            state.slot.hidden = Boolean(state.file);
            state.slot.classList.toggle("is-active", active);
          });
          positionSlots?.();
        };

        const fontNames = [
          "Arial",
          "Georgia",
          "Times New Roman",
          "Verdana",
          "Trebuchet MS",
          "Courier New",
          ...config.fonts.map((font) => font.name),
        ];
        const textStates = config.texts.map((field) => {
          const previewText = document.createElement("div");
          previewText.className = "cw-personalizer__text-preview";
          previewText.dataset.cwTextId = field.id;
          const textContent = document.createElement("span");
          textContent.className = "cw-personalizer__text-content";
          previewText.appendChild(textContent);
          let scaleHandle = null;
          let rotateHandle = null;
          if (field.scalable) {
            scaleHandle = document.createElement("button");
            scaleHandle.type = "button";
            scaleHandle.className =
              "cw-personalizer__text-handle cw-personalizer__text-handle--scale";
            scaleHandle.textContent = "↘";
            scaleHandle.setAttribute("aria-label", "Resize text");
            previewText.appendChild(scaleHandle);
          }
          if (field.rotatable) {
            rotateHandle = document.createElement("button");
            rotateHandle.type = "button";
            rotateHandle.className =
              "cw-personalizer__text-handle cw-personalizer__text-handle--rotate";
            rotateHandle.textContent = "↻";
            rotateHandle.setAttribute("aria-label", "Rotate text");
            previewText.appendChild(rotateHandle);
          }
          if (field.movable || field.scalable || field.rotatable)
            previewText.classList.add("is-transformable");
          previewText.hidden = true;
          textLayers.appendChild(previewText);
          const card = document.createElement("label");
          card.className = "cw-personalizer__field";
          const title = document.createElement("span");
          title.className = "cw-personalizer__field-title";
          title.textContent =
            field.label +
            (field.required
              ? ` (${root.dataset.labelRequired || "Required"})`
              : "");
          const input = document.createElement(
            field.maxLines > 1 ? "textarea" : "input",
          );
          if (field.maxLines > 1) {
            input.rows = field.maxLines;
            input.dataset.cwMaxLines = String(field.maxLines);
          } else input.type = "text";
          input.maxLength = field.maxLength;
          input.value = field.defaultValue || "";
          input.placeholder = field.placeholder || field.label || "Your Text";
          input.className = "cw-personalizer__text-input";
          card.append(title, input);
          let fontSelect = null;
          if (field.allowFontChoice) {
            const fontLabel = document.createElement("span");
            fontLabel.textContent = root.dataset.labelFont || "Font";
            fontSelect = document.createElement("select");
            fontSelect.className = "cw-personalizer__font-select";
            fontNames.forEach((name) => {
              const option = document.createElement("option");
              option.value = name;
              option.textContent = name;
              option.selected = name === field.fontFamily;
              fontSelect.appendChild(option);
            });
            card.append(fontLabel, fontSelect);
          }
          let colorInput = null;
          if (field.allowColorChoice) {
            const colorLabel = document.createElement("label");
            colorLabel.className = "cw-personalizer__color-control";
            const colorText = document.createElement("span");
            colorText.textContent = "Text color";
            colorInput = document.createElement("input");
            colorInput.type = "color";
            colorInput.value = field.color;
            colorInput.setAttribute("aria-label", "Text color");
            colorLabel.append(colorText, colorInput);
            card.appendChild(colorLabel);
          }
          fields.appendChild(card);
          return {
            field,
            input,
            fontSelect,
            colorInput,
            previewText,
            textContent,
            scaleHandle,
            rotateHandle,
            x: field.x,
            y: field.y,
            width: field.width,
            height: field.height,
            fontSize: field.fontSize,
            fittedFontSize: field.fontSize,
            angle: field.rotation,
            color: field.color,
          };
        });
        const fileStates = config.files.map((field) => {
          const card = document.createElement("label");
          card.className = "cw-personalizer__field";
          const title = document.createElement("span");
          title.className = "cw-personalizer__field-title";
          title.textContent =
            field.label +
            (field.required
              ? ` (${root.dataset.labelRequired || "Required"})`
              : "");
          const input = document.createElement("input");
          input.type = "file";
          input.accept = field.accept;
          card.append(title, input);
          fields.appendChild(card);
          return { field, input, file: null };
        });
        const linkStates = config.links.map((field) => {
          const card = document.createElement("label");
          card.className = "cw-personalizer__field";
          const title = document.createElement("span");
          title.className = "cw-personalizer__field-title";
          title.textContent =
            field.label +
            (field.required
              ? ` (${root.dataset.labelRequired || "Required"})`
              : "");
          const input = document.createElement("input");
          input.type = "url";
          input.placeholder = field.placeholder;
          input.className = "cw-personalizer__text-input";
          card.append(title, input);
          fields.appendChild(card);
          return { field, input };
        });

        const renderTextState = (state) => {
          state.x = clamp(state.x, 0, 100, state.field.x);
          state.y = clamp(state.y, 0, 100, state.field.y);
          state.fontSize = clamp(state.fontSize, 8, 300, state.field.fontSize);
          state.angle = clamp(state.angle, -180, 180, state.field.rotation);
          state.previewText.style.left = `${state.x}%`;
          state.previewText.style.top = `${state.y}%`;
          state.previewText.style.width = state.field.fitToBox
            ? `${state.width}%`
            : "max-content";
          state.previewText.style.height = state.field.fitToBox
            ? `${state.height}%`
            : "auto";
          state.previewText.style.overflow = state.field.fitToBox
            ? "hidden"
            : "visible";
          state.previewText.style.textAlign = state.field.fitToBox
            ? state.field.alignment
            : "center";
          state.previewText.style.justifyContent = !state.field.fitToBox
            ? "center"
            : state.field.alignment === "left"
              ? "flex-start"
              : state.field.alignment === "right"
                ? "flex-end"
                : "center";
          const nominalSize = (state.fontSize * stage.clientWidth) / 1200;
          state.previewText.style.fontSize = `${nominalSize}px`;
          state.previewText.style.transform = `translate(-50%,-50%) rotate(${state.angle}deg)`;
          state.previewText.style.color = state.color;
          const contentBounds = state.textContent.getBoundingClientRect();
          const availableWidth = Math.max(1, state.previewText.clientWidth - 6);
          const availableHeight = Math.max(
            1,
            state.previewText.clientHeight - 6,
          );
          const fit = state.field.fitToBox
            ? Math.min(
                1,
                availableWidth / Math.max(1, contentBounds.width),
                availableHeight / Math.max(1, contentBounds.height),
              )
            : 1;
          const fittedSize = Math.max(1, nominalSize * fit);
          state.previewText.style.fontSize = `${fittedSize}px`;
          state.fittedFontSize =
            stage.clientWidth > 0
              ? (fittedSize * 1200) / stage.clientWidth
              : state.fontSize;
          state.previewText.dataset.cwX = String(state.x);
          state.previewText.dataset.cwY = String(state.y);
          state.previewText.dataset.cwWidth = String(state.width);
          state.previewText.dataset.cwHeight = String(state.height);
          state.previewText.dataset.cwAlignment = state.field.alignment;
          state.previewText.dataset.cwFitToBox = String(state.field.fitToBox);
          state.previewText.dataset.cwFontSize = String(state.fittedFontSize);
          state.previewText.dataset.cwRotation = String(state.angle);
          state.previewText.dataset.cwColor = state.color;
        };
        const refreshTextSizes = () => textStates.forEach(renderTextState);
        refreshTextSizes();
        window.addEventListener("resize", refreshTextSizes);
        const constrainPhoto = (state) => {
          state.x = Number.isFinite(Number(state.x)) ? Number(state.x) : 0;
          state.y = Number.isFinite(Number(state.y)) ? Number(state.y) : 0;
          const viewportWidth = state.viewport.clientWidth;
          const viewportHeight = state.viewport.clientHeight;
          const imageWidth = state.image.naturalWidth;
          const imageHeight = state.image.naturalHeight;
          if (!viewportWidth || !viewportHeight || !imageWidth || !imageHeight)
            return;
          const coverScale = Math.max(
            viewportWidth / imageWidth,
            viewportHeight / imageHeight,
          );
          const coveredWidth = imageWidth * coverScale;
          const coveredHeight = imageHeight * coverScale;
          const maxX = Math.max(
            0,
            (coveredWidth * state.scale - viewportWidth) / 2,
          );
          const maxY = Math.max(
            0,
            (coveredHeight * state.scale - viewportHeight) / 2,
          );
          state.x = clamp(state.x, -maxX, maxX, 0);
          state.y = clamp(state.y, -maxY, maxY, 0);
        };
        const apply = (state) => {
          invalidate();
          state.scale = clamp(state.scale, 1, 5, 1);
          constrainPhoto(state);
          const objectOffsetX = state.x / state.scale;
          const objectOffsetY = state.y / state.scale;
          state.image.style.objectPosition = `calc(50% + ${objectOffsetX}px) calc(50% + ${objectOffsetY}px)`;
          state.image.style.transform = `scale(${state.scale}) rotate(${state.angle}deg)`;
          state.image.dataset.cwX = String(state.x);
          state.image.dataset.cwY = String(state.y);
          state.image.dataset.cwScale = String(state.scale);
          state.image.dataset.cwRotation = String(state.angle);
          state.zoom.value = String(Math.round(state.scale * 100));
          state.rotation.value = String(Math.round(state.angle));
        };
        const reset = (state) => {
          state.x = 0;
          state.y = 0;
          state.scale = 1;
          state.angle = 0;
          apply(state);
        };
        const isReady = () =>
          !photoStates.some((state) => state.field.required && !state.file) &&
          !textStates.some(
            (state) => state.field.required && !state.input.value.trim(),
          ) &&
          !fileStates.some((state) => state.field.required && !state.file) &&
          !linkStates.some(
            (state) => state.field.required && !state.input.value.trim(),
          ) &&
          photoStates.length +
            textStates.length +
            fileStates.length +
            linkStates.length >
            0;
        const updateReady = () => {
          save.disabled = busy || !isReady();
        };
        const loadPhoto = (state, file) => {
          if (!file) return;
          if (!/^image\/(jpeg|png|webp)$/.test(file.type)) {
            window.alert("Please upload a JPG, PNG, or WebP image.");
            return;
          }
          if (file.size > 25 * 1024 * 1024) {
            window.alert("Please upload an image smaller than 25 MB.");
            return;
          }
          if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
          state.file = file;
          state.objectUrl = URL.createObjectURL(file);
          state.image.src = state.objectUrl;
          state.image.style.display = "block";
          state.image.style.objectFit = "cover";
          state.fileLabel.hidden = true;
          state.slot.hidden = true;
          selectPhoto(state.index);
          reset(state);
          updateReady();
        };
        const clearPhoto = (state) => {
          if (state.objectUrl) URL.revokeObjectURL(state.objectUrl);
          state.file = null;
          state.objectUrl = null;
          state.fileInput.value = "";
          state.changeInput.value = "";
          state.image.removeAttribute("src");
          state.image.style.display = "none";
          state.image.style.transform = "";
          state.x = 0;
          state.y = 0;
          state.scale = 1;
          state.angle = 0;
          state.zoom.value = "100";
          state.rotation.value = "0";
          state.slot.hidden = false;
          invalidate();
          selectPhoto(state.index);
          positionSlots();
          updateReady();
        };
        photoStates.forEach((state) => {
          state.fileInput.addEventListener("change", (event) => {
            loadPhoto(state, event.target.files[0]);
            event.target.value = "";
          });
          state.changeInput.addEventListener("change", (event) => {
            loadPhoto(state, event.target.files[0]);
            event.target.value = "";
          });
          state.zoom.addEventListener("input", () => {
            selectPhoto(state.index);
            state.scale = Number(state.zoom.value) / 100;
            apply(state);
          });
          state.rotation.addEventListener("input", () => {
            selectPhoto(state.index);
            if (state.field.rotationEnabled) {
              state.angle = Number(state.rotation.value);
              apply(state);
            }
          });
          state.resetButton.addEventListener("click", () => clearPhoto(state));
        });
        textStates.forEach((state) => {
          const refresh = () => {
            invalidate();
            if (state.field.maxLines > 1) {
              const lines = state.input.value.replace(/\r/g, "").split("\n");
              if (lines.length > state.field.maxLines)
                state.input.value = lines
                  .slice(0, state.field.maxLines)
                  .join("\n");
            }
            const customerValue = state.input.value;
            const previewValue = customerValue.trim()
              ? customerValue
              : state.field.placeholder || state.field.label || "Your Text";
            state.textContent.textContent = previewValue;
            state.previewText.hidden = !previewValue;
            state.previewText.classList.toggle(
              "is-placeholder",
              !customerValue.trim(),
            );
            const font = state.fontSelect?.value || state.field.fontFamily;
            state.previewText.style.fontFamily = font;
            if (state.colorInput) state.color = state.colorInput.value;
            renderTextState(state);
            document.fonts
              ?.load(`${state.fontSize}px "${font}"`)
              .then(() => renderTextState(state))
              .catch(() => undefined);
            updateReady();
          };
          state.input.addEventListener("input", refresh);
          state.fontSelect?.addEventListener("change", refresh);
          state.colorInput?.addEventListener("input", refresh);
          refresh();
        });
        let textGesture = null;
        const beginTextGesture = (event, state, mode) => {
          event.preventDefault();
          event.stopPropagation();
          const rect = state.previewText.getBoundingClientRect();
          textGesture = {
            state,
            mode,
            pointerId: event.pointerId,
            startX: event.clientX,
            startY: event.clientY,
            x: state.x,
            y: state.y,
            fontSize: state.fontSize,
            angle: state.angle,
            centerX: rect.left + rect.width / 2,
            centerY: rect.top + rect.height / 2,
            startAngle: Math.atan2(
              event.clientY - (rect.top + rect.height / 2),
              event.clientX - (rect.left + rect.width / 2),
            ),
          };
          state.previewText.setPointerCapture?.(event.pointerId);
        };
        textStates.forEach((state) => {
          if (state.field.movable)
            state.previewText.addEventListener("pointerdown", (event) => {
              if (event.target.closest("button")) return;
              beginTextGesture(event, state, "move");
            });
          state.scaleHandle?.addEventListener("pointerdown", (event) =>
            beginTextGesture(event, state, "scale"),
          );
          state.rotateHandle?.addEventListener("pointerdown", (event) =>
            beginTextGesture(event, state, "rotate"),
          );
        });
        window.addEventListener(
          "pointermove",
          (event) => {
            if (!textGesture || event.pointerId !== textGesture.pointerId)
              return;
            event.preventDefault();
            const { state, mode } = textGesture;
            if (mode === "move") {
              state.x =
                textGesture.x +
                ((event.clientX - textGesture.startX) * 100) /
                  stage.clientWidth;
              state.y =
                textGesture.y +
                ((event.clientY - textGesture.startY) * 100) /
                  stage.clientHeight;
            } else if (mode === "scale") {
              state.fontSize =
                textGesture.fontSize +
                ((event.clientX - textGesture.startX) * 1200) /
                  stage.clientWidth;
            } else if (mode === "rotate") {
              const angle = Math.atan2(
                event.clientY - textGesture.centerY,
                event.clientX - textGesture.centerX,
              );
              state.angle =
                textGesture.angle +
                ((angle - textGesture.startAngle) * 180) / Math.PI;
            }
            renderTextState(state);
            invalidate();
            updateReady();
          },
          { passive: false },
        );
        const endTextGesture = (event) => {
          if (textGesture && event.pointerId === textGesture.pointerId)
            textGesture = null;
        };
        window.addEventListener("pointerup", endTextGesture);
        window.addEventListener("pointercancel", endTextGesture);
        fileStates.forEach((state) =>
          state.input.addEventListener("change", (event) => {
            invalidate();
            const file = event.target.files[0];
            if (file && file.size > state.field.maxSizeMb * 1024 * 1024) {
              event.target.value = "";
              state.file = null;
              window.alert(
                `Please upload a file smaller than ${state.field.maxSizeMb} MB.`,
              );
            } else state.file = file || null;
            updateReady();
          }),
        );
        linkStates.forEach((state) =>
          state.input.addEventListener("input", () => {
            invalidate();
            updateReady();
          }),
        );

        root.querySelector("[data-cw-open]").addEventListener("click", () => {
          dialog.showModal();
          refreshTextSizes();
          positionSlots();
        });
        root
          .querySelector("[data-cw-close]")
          .addEventListener("click", () => dialog.close());
        stage.addEventListener(
          "wheel",
          (event) => {
            const state = photoStates[activePhoto];
            if (!state?.file) return;
            event.preventDefault();
            state.scale = clamp(
              state.scale + (event.deltaY < 0 ? 0.08 : -0.08),
              1,
              5,
              1,
            );
            apply(state);
          },
          { passive: false },
        );
        const gestureStart = () => {
          const state = photoStates[activePhoto];
          if (!state?.file) return;
          const points = [...pointers.values()];
          if (points.length === 1)
            gesture = {
              type: "drag",
              index: activePhoto,
              startX: points[0].x,
              startY: points[0].y,
              x: state.x,
              y: state.y,
            };
          if (points.length >= 2)
            gesture = {
              type: "pinch",
              index: activePhoto,
              distance: Math.hypot(
                points[0].x - points[1].x,
                points[0].y - points[1].y,
              ),
              scale: state.scale,
            };
        };
        stage.addEventListener("pointerdown", (event) => {
          if (event.target.closest("button")) return;
          const viewport = event.target.closest(
            ".cw-personalizer__photo-viewport",
          );
          if (viewport) selectPhoto(Number(viewport.dataset.index));
          const state = photoStates[activePhoto];
          if (!state?.file) return;
          event.preventDefault();
          stage.setPointerCapture(event.pointerId);
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          gestureStart();
        });
        stage.addEventListener("pointermove", (event) => {
          if (!pointers.has(event.pointerId) || !gesture) return;
          event.preventDefault();
          pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
          const state = photoStates[gesture.index];
          const points = [...pointers.values()];
          if (gesture.type === "drag" && points.length === 1) {
            state.x = gesture.x + points[0].x - gesture.startX;
            state.y = gesture.y + points[0].y - gesture.startY;
            apply(state);
          } else if (points.length >= 2) {
            if (gesture.type !== "pinch") gestureStart();
            const current = [...pointers.values()];
            const distance = Math.hypot(
              current[0].x - current[1].x,
              current[0].y - current[1].y,
            );
            state.scale = clamp(
              (gesture.scale * distance) / Math.max(gesture.distance, 1),
              1,
              5,
              1,
            );
            apply(state);
          }
        });
        const endPointer = (event) => {
          pointers.delete(event.pointerId);
          gesture = null;
          if (pointers.size) gestureStart();
        };
        stage.addEventListener("pointerup", endPointer);
        stage.addEventListener("pointercancel", endPointer);
        stage.addEventListener("lostpointercapture", endPointer);

        const stagedFiles = new Map();
        const putFile = (form, name, file) => {
          if (file) stagedFiles.set(name, file);
          else stagedFiles.delete(name);
        };
        const putText = (form, name, value) => {
          let input = form.querySelector(
            `input[data-cw-text-property="${CSS.escape(name)}"]`,
          );
          if (!input) {
            input = document.createElement("input");
            input.type = "hidden";
            input.name = `properties[${name}]`;
            input.dataset.cwTextProperty = name;
            form.appendChild(input);
          }
          input.value = value;
        };
        const loadRemote = async (url) => {
          const image = new Image();
          image.crossOrigin = "anonymous";
          image.src = url;
          if (typeof image.decode === "function") {
            try {
              await image.decode();
            } catch (error) {
              await new Promise((resolve, reject) => {
                image.onload = resolve;
                image.onerror = reject;
              });
            }
          } else
            await new Promise((resolve, reject) => {
              image.onload = resolve;
              image.onerror = reject;
            });
          return image;
        };
        const canvasDimensions = () => {
          const [width, height] = config.ratio.split(":").map(Number);
          const longest = window.matchMedia?.("(max-width:900px)").matches
            ? 1200
            : 1600;
          return width >= height
            ? { width: longest, height: Math.round((longest * height) / width) }
            : {
                width: Math.round((longest * width) / height),
                height: longest,
              };
        };
        const attach = async () => {
          if (!productForm || !isReady() || busy) return;
          busy = true;
          saved = false;
          lockButtons();
          const startRevision = revision;
          updateReady();
          save.textContent = "Preparing preview…";
          try {
            productForm
              .querySelectorAll("[data-cw-property],[data-cw-text-property]")
              .forEach((input) => input.remove());
            stagedFiles.clear();
            const dimensions = canvasDimensions();
            const canvas = document.createElement("canvas");
            canvas.width = dimensions.width;
            canvas.height = dimensions.height;
            const context = canvas.getContext("2d");
            if (!context) throw new Error("Canvas is unavailable");
            for (const state of photoStates) {
              if (!state.file) continue;
              putFile(productForm, state.field.label, state.file);
              const layer = document.createElement("canvas");
              layer.width = dimensions.width;
              layer.height = dimensions.height;
              const layerContext = layer.getContext("2d");
              const base = new Image();
              base.src = state.image.src;
              if (typeof base.decode === "function") {
                try {
                  await base.decode();
                } catch (error) {
                  await new Promise((resolve, reject) => {
                    base.onload = resolve;
                    base.onerror = reject;
                  });
                }
              }
              const slotW = (dimensions.width * state.field.width) / 100;
              const slotH = (dimensions.height * state.field.height) / 100;
              const slotX = (dimensions.width * state.field.x) / 100;
              const slotY = (dimensions.height * state.field.y) / 100;
              layerContext.save();
              layerContext.beginPath();
              layerContext.rect(
                slotX - slotW / 2,
                slotY - slotH / 2,
                slotW,
                slotH,
              );
              layerContext.clip();
              layerContext.translate(
                slotX + (state.x * dimensions.width) / stage.clientWidth,
                slotY + (state.y * dimensions.height) / stage.clientHeight,
              );
              layerContext.rotate((state.angle * Math.PI) / 180);
              layerContext.scale(state.scale, state.scale);
              const fit = Math.max(slotW / base.width, slotH / base.height);
              layerContext.drawImage(
                base,
                (-base.width * fit) / 2,
                (-base.height * fit) / 2,
                base.width * fit,
                base.height * fit,
              );
              layerContext.restore();
              if (state.field.maskUrl) {
                const mask = await loadRemote(state.field.maskUrl);
                layerContext.globalCompositeOperation = "destination-in";
                layerContext.drawImage(
                  mask,
                  slotX - slotW / 2,
                  slotY - slotH / 2,
                  slotW,
                  slotH,
                );
                layerContext.globalCompositeOperation = "source-over";
              }
              context.drawImage(layer, 0, 0);
              putText(
                productForm,
                `_${state.field.label} Position`,
                `Slot ${state.field.x}%,${state.field.y}% ${state.field.width}%×${state.field.height}% · photo offset ${Math.round(state.x)},${Math.round(state.y)} · zoom ${Math.round(state.scale * 100)}% · rotation ${Math.round(state.angle)}°`,
              );
            }
            if (root.dataset.overlay) {
              const frame = await loadRemote(root.dataset.overlay);
              context.drawImage(
                frame,
                0,
                0,
                dimensions.width,
                dimensions.height,
              );
            }
            for (const state of textStates) {
              const value = state.input.value.trim();
              if (!value) continue;
              const font = state.fontSelect?.value || state.field.fontFamily;
              putText(productForm, state.field.label, value);
              putText(productForm, `_${state.field.label} Font`, font);
              putText(
                productForm,
                `_${state.field.label} Style`,
                JSON.stringify({
                  x: state.x,
                  y: state.y,
                  width: state.width,
                  height: state.height,
                  alignment: state.field.alignment,
                  fitToBox: state.field.fitToBox,
                  fontSize: state.fittedFontSize,
                  rotation: state.angle,
                  color: state.color,
                }),
              );
              try {
                await document.fonts?.load(`${state.fontSize}px "${font}"`);
              } catch (error) {
                console.warn("Cartwala font preload skipped", error);
              }
              context.save();
              context.translate(
                (dimensions.width * state.x) / 100,
                (dimensions.height * state.y) / 100,
              );
              context.rotate((state.angle * Math.PI) / 180);
              context.fillStyle = state.color;
              const boxWidth = (dimensions.width * state.width) / 100;
              const boxHeight = (dimensions.height * state.height) / 100;
              const baseSize =
                ((state.fittedFontSize || state.fontSize) * dimensions.width) /
                1200;
              context.font = `700 ${baseSize}px "${font}", sans-serif`;
              const lines = value
                .replace(/\r/g, "")
                .split("\n")
                .slice(0, state.field.maxLines || 1);
              const measuredWidth = Math.max(
                1,
                ...lines.map((line) => context.measureText(line).width),
              );
              const lineHeight = baseSize * 1.08;
              const fittedSize = Math.max(
                1,
                baseSize *
                  (state.field.fitToBox
                    ? Math.min(
                        1,
                        boxWidth / measuredWidth,
                        boxHeight / (lineHeight * lines.length),
                      )
                    : 1),
              );
              context.textAlign = state.field.fitToBox
                ? state.field.alignment
                : "center";
              context.textBaseline = "middle";
              context.font = `700 ${fittedSize}px "${font}", sans-serif`;
              const textX = !state.field.fitToBox
                ? 0
                : state.field.alignment === "left"
                  ? -boxWidth / 2
                  : state.field.alignment === "right"
                    ? boxWidth / 2
                    : 0;
              const fittedLineHeight = fittedSize * 1.08;
              const firstLineY = -((lines.length - 1) * fittedLineHeight) / 2;
              lines.forEach((line, index) =>
                context.fillText(
                  line,
                  textX,
                  firstLineY + index * fittedLineHeight,
                ),
              );
              context.restore();
            }
            fileStates.forEach((state) =>
              putFile(productForm, state.field.label, state.file),
            );
            linkStates.forEach((state) => {
              if (state.input.value.trim())
                putText(
                  productForm,
                  state.field.label,
                  state.input.value.trim(),
                );
            });
            if (startRevision !== revision)
              throw new Error(
                "Design changed while rendering. Please preview again.",
              );
            const blob = await new Promise((resolve) =>
              canvas.toBlob(resolve, "image/png"),
            );
            if (!blob) throw new Error("Preview could not be generated");
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(blob);
            resultImage.src = previewUrl;
            result.hidden = false;
            designId = createId();
            putFile(
              productForm,
              "_Personalised Preview",
              new File([blob], `cartwala-preview-${designId}.png`, {
                type: "image/png",
              }),
            );
            putText(productForm, "_Cartwala Design ID", designId);
            const printDesign = {
              v: 1,
              r: config.ratio,
              o: root.dataset.overlay || "",
              p: photoStates
                .filter((s) => s.file)
                .map((s) => ({
                  i: s.field.id,
                  l: s.field.label,
                  x: s.field.x,
                  y: s.field.y,
                  w: s.field.width,
                  h: s.field.height,
                  m: s.field.maskUrl,
                  ox: s.x / stage.clientWidth,
                  oy: s.y / stage.clientHeight,
                  s: s.scale,
                  a: s.angle,
                })),
              t: textStates
                .filter((s) => s.input.value.trim())
                .map((s) => ({
                  i: s.field.id,
                  l: s.field.label,
                  v: s.input.value.trim(),
                  x: s.x,
                  y: s.y,
                  w: s.width,
                  h: s.height,
                  q: s.field.alignment,
                  b: s.field.fitToBox,
                  z: s.fittedFontSize || s.fontSize,
                  c: s.color,
                  f: s.fontSelect?.value || s.field.fontFamily,
                  a: s.angle,
                })),
            };
            putText(
              productForm,
              "_Cartwala Design JSON",
              JSON.stringify(printDesign),
            );
            persist(blob, printDesign).catch((error) =>
              console.warn("Cartwala local draft save skipped", error),
            );
            showProductPreview(previewUrl);
            root.dispatchEvent(
              new CustomEvent("cartwala:preview-ready", {
                detail: { url: previewUrl },
              }),
            );
            saved = true;
            setPurchaseReady(true);
            putText(productForm, "_Cartwala Personalization", "Completed");
            root.querySelector("[data-cw-open]").textContent =
              root.dataset.labelEdit || "Edit Again";
            dialog.close();
          } catch (error) {
            console.error("Cartwala personalizer preview failed", error);
            window.alert(
              error?.message ||
                "Preview could not be prepared. Please try again.",
            );
          } finally {
            busy = false;
            save.textContent = saveLabel;
            updateReady();
          }
        };

        const showProductPreview = (url) => {
          if (root.dataset.productKind === "mug") return;
          const scope = root.closest(".shopify-section") || document;
          const main =
            scope.querySelector(
              "[data-gallery-main] img,.product__media img,[data-product-media] img,.product-gallery img",
            ) ||
            document.querySelector(
              "[data-gallery-main] img,.product__media img",
            );
          if (main) {
            main.removeAttribute("srcset");
            main
              .closest("picture")
              ?.querySelectorAll("source")
              .forEach((source) => source.removeAttribute("srcset"));
            main.src = url;
            main.alt = root.dataset.labelSaved || "Your personalized design";
          }
        };
        const draftKey =
          location.pathname +
          ":" +
          root.dataset.productId +
          ":" +
          JSON.stringify(raw);
        const database = new Promise((resolve, reject) => {
          try {
            const request = indexedDB.open("cartwala-designs", 1);
            request.onupgradeneeded = () =>
              request.result.createObjectStore("drafts");
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
          } catch (error) {
            reject(error);
          }
        });
        database.catch(() => {});
        const persist = async (blob, printDesign) => {
          const record = {
            designId,
            updated: Date.now(),
            blob,
            printDesign,
            photos: photoStates.map((s) => ({
              file: s.file,
              x: s.x / stage.clientWidth,
              y: s.y / stage.clientHeight,
              scale: s.scale,
              angle: s.angle,
            })),
            texts: textStates.map((s) => ({
              value: s.input.value,
              font: s.fontSelect?.value,
              color: s.color,
              x: s.x,
              y: s.y,
              fontSize: s.fontSize,
              angle: s.angle,
            })),
            files: fileStates.map((s) => s.file),
            links: linkStates.map((s) => s.input.value),
          };
          const db = await database;
          await new Promise((resolve, reject) => {
            const tx = db.transaction("drafts", "readwrite");
            const store = tx.objectStore("drafts");
            store.put(record, draftKey);
            store.put(record, `cart:${designId}`);
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
          });
        };
        const positionSlots = () =>
          photoStates.forEach((state) => {
            const slotWidth = Math.max(
              1,
              (stage.clientWidth * state.field.width) / 100,
            );
            const slotHeight = Math.max(
              1,
              (stage.clientHeight * state.field.height) / 100,
            );
            state.slot.style.left = state.field.x + "%";
            state.slot.style.top = state.field.y + "%";
            const compact = photoStates.length > 1;
            state.slot.style.width =
              (compact
                ? Math.max(28, Math.min(92, slotWidth * 0.9))
                : Math.max(34, Math.min(190, slotWidth * 0.78))) + "px";
            state.slot.style.height =
              (compact
                ? Math.max(26, Math.min(54, slotHeight * 0.55))
                : Math.max(28, Math.min(64, slotHeight * 0.36))) + "px";
            state.slot.style.fontSize =
              (compact
                ? Math.max(
                    6,
                    Math.min(10, Math.min(slotWidth, slotHeight) * 0.11),
                  )
                : Math.max(
                    7,
                    Math.min(14, Math.min(slotWidth, slotHeight) * 0.105),
                  )) + "px";
            state.slot.style.setProperty(
              "--cw-slot-icon",
              Math.max(
                9,
                Math.min(
                  compact ? 16 : 22,
                  Math.min(slotWidth, slotHeight) * 0.18,
                ),
              ) + "px",
            );
            const label = state.slot.querySelector("span");
            if (label)
              label.textContent = compact
                ? state.field.label
                : root.dataset.labelUpload || "Upload photo";
          });
        if (photoStates.length) selectPhoto(0);
        positionSlots();
        window.addEventListener("resize", positionSlots);
        database
          .then(
            (db) =>
              new Promise((resolve, reject) => {
                const request = db
                  .transaction("drafts")
                  .objectStore("drafts")
                  .get(draftKey);
                request.onsuccess = () => resolve(request.result);
                request.onerror = () => reject(request.error);
              }),
          )
          .then((record) => {
            if (!record || Date.now() - record.updated > 7 * 86400000) return;
            designId = record.designId;
            photoStates.forEach((s, i) => {
              const stored = record.photos[i];
              if (!stored?.file) return;
              loadPhoto(s, stored.file);
              s.scale = stored.scale;
              s.angle = stored.angle;
              s.relativeX = stored.x;
              s.relativeY = stored.y;
            });
            textStates.forEach((s, i) => {
              const stored = record.texts[i] || {};
              s.input.value = stored.value || "";
              if (s.fontSelect && stored.font) s.fontSelect.value = stored.font;
              if (s.colorInput && stored.color)
                s.colorInput.value = stored.color;
              s.color = stored.color || s.field.color;
              s.x = Number.isFinite(Number(stored.x))
                ? Number(stored.x)
                : s.field.x;
              s.y = Number.isFinite(Number(stored.y))
                ? Number(stored.y)
                : s.field.y;
              s.fontSize = Number.isFinite(Number(stored.fontSize))
                ? Number(stored.fontSize)
                : s.field.fontSize;
              s.angle = Number.isFinite(Number(stored.angle))
                ? Number(stored.angle)
                : s.field.rotation;
              s.input.dispatchEvent(new Event("input"));
            });
            fileStates.forEach((s, i) => {
              s.file = record.files[i] || null;
            });
            linkStates.forEach((s, i) => {
              s.input.value = record.links[i] || "";
            });
            previewUrl = URL.createObjectURL(record.blob);
            showProductPreview(previewUrl);
            root.dispatchEvent(
              new CustomEvent("cartwala:preview-ready", {
                detail: { url: previewUrl },
              }),
            );
            if (productForm && isReady()) {
              stagedFiles.clear();
              if (record.printDesign)
                putText(
                  productForm,
                  "_Cartwala Design JSON",
                  JSON.stringify(record.printDesign),
                );
              photoStates.forEach((s, i) => {
                putFile(productForm, s.field.label, s.file);
                putText(
                  productForm,
                  `_${s.field.label} Position`,
                  JSON.stringify(
                    record.photos[i] && {
                      x: record.photos[i].x,
                      y: record.photos[i].y,
                      scale: s.scale,
                      angle: s.angle,
                    },
                  ),
                );
              });
              textStates.forEach((s) => {
                putText(productForm, s.field.label, s.input.value);
                putText(
                  productForm,
                  `_${s.field.label} Font`,
                  s.fontSelect?.value || s.field.fontFamily,
                );
                putText(
                  productForm,
                  `_${s.field.label} Style`,
                  JSON.stringify({
                    x: s.x,
                    y: s.y,
                    fontSize: s.fontSize,
                    rotation: s.angle,
                    color: s.color,
                  }),
                );
              });
              fileStates.forEach((s) =>
                putFile(productForm, s.field.label, s.file),
              );
              linkStates.forEach((s) =>
                putText(productForm, s.field.label, s.input.value),
              );
              putFile(
                productForm,
                "_Personalised Preview",
                new File([record.blob], `cartwala-preview-${designId}.png`, {
                  type: "image/png",
                }),
              );
              putText(productForm, "_Cartwala Design ID", designId);
              putText(productForm, "_Cartwala Personalization", "Completed");
              saved = true;
              setPurchaseReady(true);
            }
            root.querySelector("[data-cw-open]").textContent =
              root.dataset.labelEdit || "Edit Again";
            updateReady();
          })
          .catch((error) =>
            console.warn("Cartwala draft restore unavailable", error),
          );
        root.querySelector("[data-cw-open]").addEventListener("click", () => {
          photoStates.forEach((s) => {
            if (s.relativeX !== undefined) {
              s.x = s.relativeX * stage.clientWidth;
              s.y = s.relativeY * stage.clientHeight;
              delete s.relativeX;
              delete s.relativeY;
              apply(s);
            }
          });
        });

        save.addEventListener("click", attach);
        updateReady();
      } catch (error) {
        console.error(
          "Cartwala personalizer failed to initialize for this block.",
          error,
        );
      }
    });
  initialize();
  document.addEventListener("shopify:section:load", initialize);
  document.addEventListener(
    "click",
    (event) => {
      const openButton = event.target.closest?.("[data-cw-mug-open]");
      if (!openButton) return;
      const root = openButton.closest("[data-cw-personalizer]");
      const mugDialog = root?.querySelector("[data-cw-mug-dialog]");
      if (!mugDialog) return;
      setTimeout(() => {
        if (mugDialog.open) return;
        if (typeof mugDialog.showModal === "function") {
          mugDialog.showModal();
        } else {
          mugDialog.setAttribute("open", "");
        }
      });
    },
    true,
  );
})();
