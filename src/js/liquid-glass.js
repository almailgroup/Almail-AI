/**
 * Liquid glass — the sidebar material.
 *
 * Port of the SDF displacement-map refraction technique from
 * https://github.com/samasante/liquid-glass (MIT, © 2026 Sam Asante). That
 * library is React-only and this app has no build step, so the technique is
 * reimplemented here in plain ES modules rather than pulled in as a package.
 *
 * How it works
 * ------------
 * A rounded-rect lens is baked into an offscreen canvas where each pixel
 * encodes, in 8-bit channels:
 *
 *   R — X displacement   (128 = neutral)
 *   G — Y displacement   (128 = neutral)
 *   B — specular mask    (128 = none, 255 = full)
 *
 * That canvas becomes the `in2` of an SVG `feDisplacementMap`, which bends the
 * pixels behind the element. Running the displacement three times at slightly
 * different scales and recombining the R, G and B channels produces chromatic
 * aberration — the coloured fringing real glass has at its edges. The map's B
 * channel is then lifted into a bright sheen and added on top.
 *
 * The one hard browser limit (web-platform physics, not a choice)
 * --------------------------------------------------------------
 * Bending the LIVE page behind an element needs `backdrop-filter: url(#…)`,
 * which ships in Chromium only. Safari and Firefox support
 * `backdrop-filter: blur()` but not `url()`, and a value they can't parse drops
 * the WHOLE declaration — meaning no frost at all. So the engine is sniffed and
 * the bias is toward a false negative: unsure means `url()` stays off, and that
 * browser still gets frost + saturate + tint + the CSS rim light, which is most
 * of what reads as glass.
 */

// ── Math ──────────────────────────────────────────────────
// erf(x) ≈ tanh(√π · x): cheap, smooth and monotone — enough for an edge feather.
const ERF_K = Math.sqrt(Math.PI);
const erf = (x) => Math.tanh(ERF_K * x);

// The red pass is displaced this much more than blue, green half that.
const DISPERSION_SPREAD = 0.22;

// Mean of the dome gradient x/√(R²−x²) over [0, halfExtent]. The integral has a
// closed form — ∫₀ᴴ x/√(R²−x²) dx = R − √(R²−H²) — so no numerical quadrature is
// needed. Used to normalise the spherical-cap profile so mean displacement lands
// at 0.5 (neutral).
const domeGradientMean = (radius, halfExtent) =>
  halfExtent > 0
    ? (radius - Math.sqrt(radius * radius - halfExtent * halfExtent)) / halfExtent
    : 0;

// Spherical-cap radius from chord half-width `a` and cap height `h`:
// R = (a² + h²) / 2h.
function computeDomeConstants(capDepth, halfW, halfH) {
  const cap = Math.max(0.01, Math.min(capDepth, Math.min(halfW, halfH) - 1));
  const Rx = (halfW * halfW + cap * cap) / (2 * cap);
  const Ry = (halfH * halfH + cap * cap) / (2 * cap);
  const meanX = domeGradientMean(Rx, halfW);
  const meanY = domeGradientMean(Ry, halfH);
  return {
    Rx, Ry,
    scaleX: meanX > 0 ? 0.5 / meanX : 1,
    scaleY: meanY > 0 ? 0.5 / meanY : 1,
  };
}

function domeGradient(distance, radius, scale) {
  // Hold the sample just inside the radius so the √ stays real at the rim.
  const inside = Math.min(distance, radius * (1 - 1e-3));
  return (inside / Math.sqrt(radius * radius - inside * inside)) * scale;
}

// 8-bit encode: displacement signed around 128, specular lifted 128 → 255.
const encodeAxis = (signed) => ((0.5 + signed) * 255 + 0.5) | 0;
const encodeSpec = (spec) => (127 * spec + 128 + 0.5) | 0;

// ── The look ──────────────────────────────────────────────
// Tuned for a large upright panel rather than a loupe: a thin refracting band
// hugging the rim with a neutral middle, so the sidebar reads as a sheet of
// glass instead of a magnifying lens over your chat list.
const SIDEBAR_OPTICS = {
  mapSize: 512,
  depth: 0.17,        // how far the bend reaches in from the edge (0..1 of the panel)
  curvature: 0.42,    // body dome — gated by `depth`, so the centre stays flat
  bend: 0.55,         // the liquid lip: an extra inward bend hugging the contour
  bendWidth: 0.13,
  dispersion: 0.45,   // chromatic aberration strength
  strength: 0.03,     // max displacement as a fraction of the panel diagonal
  sheen: 0.45,        // directional rim shine
  sheenWidth: 2.5,
  sheenFalloff: 1.4,
  sheenAngle: 45,
  glow: 0.1,          // soft inner glow
  glowSpread: 0.45,
  glowFalloff: 0.8,
  specular: 1,
  softEdge: true,
  clipToShape: true,
};

// ── Displacement map ──────────────────────────────────────
// Only the top-left quadrant is computed; the other three are written by
// reflecting the displacement signs, which is what makes this cheap enough to
// regenerate on a resize.
function createLensMapGenerator(size) {
  let canvas = null, ctx = null, image = null;

  return function generate(shape) {
    if (!canvas) {
      canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      ctx = canvas.getContext("2d", { willReadFrequently: true });
      image = ctx.createImageData(size, size);
    }
    const {
      halfW, halfH, borderRadius, depth, clipToShape, softEdge,
      sheenAngle, glow, glowSpread, glowFalloff,
      sheen, sheenWidth, sheenFalloff, curvature, bend, bendWidth,
    } = shape;

    const data = image.data;
    const half = size >> 1;
    const radius = Math.min(borderRadius, Math.min(halfW, halfH));

    // `depth` is a 0..1 fraction of the panel, so the band auto-scales with size.
    const minHalf = Math.min(halfW, halfH);
    const depthPx = Math.min(depth * minHalf, minHalf - 1);
    const innerHalfW = Math.max(0, halfW - depthPx);
    const innerHalfH = Math.max(0, halfH - depthPx);
    const innerRadius = Math.max(0, Math.min(borderRadius, Math.min(innerHalfW, innerHalfH)));
    // erf width: the feather spans ~depthPx; 1/√2 absorbs the erf scale.
    const falloff = depthPx > 0 ? Math.SQRT1_2 / depthPx : 1e6;

    const hasSpecular = glow > 0 || sheen > 0;
    const angle = (sheenAngle * Math.PI) / 180;
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);
    const edgeInv = sheenWidth > 0 ? 1 / sheenWidth : 0;
    const glowReachInv = 1 / Math.max(2, glowSpread * Math.min(halfW, halfH));

    const stepX = (2 * halfW) / size;
    const stepY = (2 * halfH) / size;
    const invW = 1 / halfW;
    const invH = 1 / halfH;

    const hasDome = curvature > 0;
    const domeCap = curvature * Math.min(halfW, halfH);
    const dome = hasDome ? computeDomeConstants(domeCap, halfW, halfH) : null;

    const hasEdgeRefract = bend > 0;
    const erInv = 1 / Math.max(2, bendWidth * Math.min(halfW, halfH));
    const sheenNorm = Math.SQRT1_2; // normalises the diagonal projection

    // Distance to the rounded-corner arc — shared by the outer SDF and the feather.
    const cornerDistance = (ox, oy) => (ox > 0 || oy > 0 ? Math.sqrt(ox * ox + oy * oy) : 0);

    // Per-column dome lookup, so the inner loop isn't doing a sqrt per pixel.
    let domeLut = null;
    if (hasDome) {
      domeLut = new Float32Array(half);
      const r2 = dome.Rx * dome.Rx;
      const rMax = dome.Rx * (1 - 1e-3);
      for (let col = 0; col < half; col += 1) {
        const px = -((col + 0.5) * stepX - halfW);
        const clamped = px < rMax ? px : rMax;
        domeLut[col] = (clamped / Math.sqrt(r2 - clamped * clamped)) * dome.scaleX;
      }
    }

    for (let row = 0; row < half; row += 1) {
      const mirrorRow = size - 1 - row;
      const py = -((row + 0.5) * stepY - halfH);
      const edgeY = py - halfH + radius;
      const innerEdgeY = softEdge ? py - innerHalfH + innerRadius : 0;
      const dirYBase = hasDome
        ? domeGradient(py, dome.Ry, dome.scaleY)
        : Math.min(1, py * invH);
      const normY = Math.min(1, py * invH);
      const rowBase = row * size;
      const mirrorRowBase = mirrorRow * size;

      for (let col = 0; col < half; col += 1) {
        const mirrorCol = size - 1 - col;
        const px = -((col + 0.5) * stepX - halfW);
        const edgeX = px - halfW + radius;
        // Signed distance to the rounded rect: negative inside, 0 at the contour.
        const sdf =
          cornerDistance(edgeX > 0 ? edgeX : 0, edgeY > 0 ? edgeY : 0) +
          (edgeX > edgeY ? (edgeX > 0 ? 0 : edgeX) : edgeY > 0 ? 0 : edgeY) -
          radius;

        // The four mirror targets for this quadrant pixel.
        const i00 = (rowBase + col) * 4;                // top-left (canonical)
        const i01 = (rowBase + mirrorCol) * 4;          // top-right (mirror X)
        const i10 = (mirrorRowBase + col) * 4;          // bottom-left (mirror Y)
        const i11 = (mirrorRowBase + mirrorCol) * 4;    // bottom-right (mirror XY)

        if (clipToShape && sdf >= 0) {
          // Outside the shape: neutral grey — no displacement, no specular.
          data[i00] = data[i01] = data[i10] = data[i11] = 128;
          data[i00 + 1] = data[i01 + 1] = data[i10 + 1] = data[i11 + 1] = 128;
          data[i00 + 2] = data[i01 + 2] = data[i10 + 2] = data[i11 + 2] = 128;
          data[i00 + 3] = data[i01 + 3] = data[i10 + 3] = data[i11 + 3] = 255;
          continue;
        }

        const dirX = hasDome ? domeLut[col] : Math.min(1, px * invW);
        const dirY = dirYBase;

        // Feather the displacement to nothing before the inner edge, so the
        // middle of the panel stays optically flat.
        let edgeOpacity = 1;
        if (softEdge) {
          const ix = px - innerHalfW + innerRadius;
          const innerSdf =
            cornerDistance(ix > 0 ? ix : 0, innerEdgeY > 0 ? innerEdgeY : 0) +
            (ix > innerEdgeY ? (ix > 0 ? 0 : ix) : innerEdgeY > 0 ? 0 : innerEdgeY) -
            innerRadius;
          edgeOpacity = 0.5 * (1 + erf(innerSdf * falloff));
        }

        let dx = 0.5 * dirX * edgeOpacity;
        let dy = 0.5 * dirY * edgeOpacity;

        if (hasEdgeRefract) {
          // The meniscus. `s` runs 1 at the contour → 0 a band inward, and the
          // bump s²(1−s) peaks a third of the way IN (6.75 = 27/4 normalises its
          // peak to 1). It is zero at the rim itself, so the background wraps
          // just inside the lip rather than shearing on the clip line.
          const s = sdf < 0 ? Math.max(0, 1 + sdf * erInv) : 0;
          if (s > 0) {
            const len = Math.sqrt(dirX * dirX + dirY * dirY);
            if (len > 1e-4) {
              const m = 6.75 * s * s * (1 - s);
              const a = (0.5 * bend * m * edgeOpacity) / len;
              dx += dirX * a;
              dy += dirY * a;
            }
          }
        }

        // Specular. `specMain` rides the TL↔BR diagonal and `specCross` the
        // TR↔BL one, because the highlight axis flips with each mirror.
        let specMain = 0, specCross = 0;
        if (hasSpecular) {
          const normX = Math.min(1, px * invW);
          // Project onto the light axis and its perpendicular, so the highlight
          // pools on the corners facing the light instead of ringing the edge.
          const axisMain = Math.min(1, Math.abs(normX * cosA + normY * sinA) * sheenNorm);
          const axisCross = Math.min(1, Math.abs(normX * cosA - normY * sinA) * sheenNorm);

          if (sheen > 0) {
            const band = sdf < 0 ? Math.max(0, 1 + sdf * edgeInv) : 0;
            const b = sheen * Math.pow(band, sheenFalloff);
            // The 0.16 floor keeps a faint rim all the way round so it still
            // reads as glass on the unlit side.
            specMain += b * (0.16 + 0.84 * Math.pow(axisMain, 1.6));
            specCross += b * (0.16 + 0.84 * Math.pow(axisCross, 1.6));
          }
          if (glow > 0) {
            // Smoothstep on distance in from the edge: zero slope at both ends,
            // so there's no hard ring where the glow stops.
            const reach = sdf < 0 ? Math.min(1, -sdf * glowReachInv) : 1;
            const t = 1 - reach;
            const g = glow * Math.pow(t * t * (3 - 2 * t), glowFalloff) * edgeOpacity;
            specMain += g * (0.6 + 0.4 * axisMain);
            specCross += g * (0.6 + 0.4 * axisCross);
          }
          specMain = Math.max(-1, Math.min(1, specMain));
          specCross = Math.max(-1, Math.min(1, specCross));
        }

        const rPos = encodeAxis(dx), rNeg = encodeAxis(-dx);
        const gPos = encodeAxis(dy), gNeg = encodeAxis(-dy);
        const bMain = encodeSpec(specMain), bCross = encodeSpec(specCross);

        data[i00] = rPos; data[i00 + 1] = gPos; data[i00 + 2] = bMain; data[i00 + 3] = 255;
        data[i01] = rNeg; data[i01 + 1] = gPos; data[i01 + 2] = bCross; data[i01 + 3] = 255;
        data[i10] = rPos; data[i10 + 1] = gNeg; data[i10 + 2] = bCross; data[i10 + 3] = 255;
        data[i11] = rNeg; data[i11 + 1] = gNeg; data[i11 + 2] = bMain; data[i11 + 3] = 255;
      }
    }

    ctx.putImageData(image, 0, 0);
    return canvas.toDataURL();
  };
}

// ── Engine support ────────────────────────────────────────
/**
 * Can this engine run a custom SVG filter on the backdrop?
 *
 * Blink can; WebKit and Gecko support `backdrop-filter: blur()` but not
 * `url()`. `@supports` is unreliable here — engines parse the `url()` syntax
 * without being able to render it — so the engine is sniffed instead.
 *
 * Biased toward a false negative on purpose: a wrongly-disabled Blink merely
 * loses the bend and still frosts, whereas a wrongly-enabled Safari gets a
 * value it can't parse and drops the entire backdrop-filter, leaving the
 * sidebar with no frost at all.
 */
function supportsBackdropUrl() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  // Chromium exposes userAgentData; Safari and Firefox don't. On iOS every
  // browser is really WebKit (CriOS / EdgiOS / FxiOS), so those are ruled out.
  const hasUAData = navigator.userAgentData != null;
  return (
    hasUAData ||
    (/\b(?:Chrome|Chromium|Edg)\//.test(ua) &&
      !/\b(?:CriOS|EdgiOS|FxiOS|OPiOS)\b/.test(ua) &&
      !/iPhone|iPad|iPod/.test(ua))
  );
}

// ── Mount ─────────────────────────────────────────────────
const SVG_NS = "http://www.w3.org/2000/svg";
const el = (name, attrs) => {
  const node = document.createElementNS(SVG_NS, name);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  return node;
};

export function mountSidebarGlass(target) {
  const sidebar = target || document.getElementById("sidebar");
  if (!sidebar) return;

  // Respect a stated preference for less transparency: the frosted panel is
  // exactly what this setting exists to turn off.
  const reduceTransparency =
    window.matchMedia?.("(prefers-reduced-transparency: reduce)")?.matches;
  if (reduceTransparency) return;

  const canBend = supportsBackdropUrl();
  // The class is what the stylesheet keys its translucent fill off, so it goes
  // on for every engine — frost and tint work everywhere, only the bend doesn't.
  sidebar.classList.add("glass");
  if (!canBend) {
    sidebar.classList.add("glass-no-bend");
    return;
  }

  const generate = createLensMapGenerator(SIDEBAR_OPTICS.mapSize);
  const baseId = `almail-glass-${Math.random().toString(36).slice(2, 8)}`;

  const svg = el("svg", { "aria-hidden": "true", width: 0, height: 0 });
  svg.style.cssText = "position:absolute;width:0;height:0;pointer-events:none";
  const defs = el("defs", {});
  svg.appendChild(defs);
  document.body.appendChild(svg);

  let version = 0;
  let lastKey = "";
  let frame = 0;

  function build(w, h) {
    const radius = parseFloat(getComputedStyle(sidebar).borderTopLeftRadius) || 16;
    const key = `${Math.round(w)}x${Math.round(h)}r${Math.round(radius)}`;
    if (key === lastKey) return;
    lastKey = key;

    const o = SIDEBAR_OPTICS;
    const mapUrl = generate({
      halfW: w / 2,
      halfH: h / 2,
      borderRadius: radius,
      depth: o.depth,
      clipToShape: o.clipToShape,
      softEdge: o.softEdge,
      sheenAngle: o.sheenAngle,
      glow: o.glow,
      glowSpread: o.glowSpread,
      glowFalloff: o.glowFalloff,
      sheen: o.sheen,
      sheenWidth: o.sheenWidth,
      sheenFalloff: o.sheenFalloff,
      curvature: o.curvature,
      bend: o.bend,
      bendWidth: o.bendWidth,
    });

    // Displacement reach in px. The filter region is grown by `margin` so the
    // bend near the box edge samples real page from just outside it, instead of
    // smearing a transparent-black fringe inward.
    const dispScale = o.strength * Math.sqrt((w * w + h * h) / 2);
    const margin = Math.ceil(dispScale * (o.dispersion > 0 ? 1.2 : 1) * 0.5 + 28);

    // Blink caches backdrop-filter output by filter id, so a changed map needs a
    // new id to be picked up.
    version += 1;
    const id = `${baseId}-v${version}`;

    const filter = el("filter", {
      id,
      filterUnits: "userSpaceOnUse",
      primitiveUnits: "userSpaceOnUse",
      "color-interpolation-filters": "sRGB",
      x: -margin, y: -margin,
      width: w + 2 * margin, height: h + 2 * margin,
    });

    // Back the map with neutral grey across the whole margin-extended region.
    // The feImage only covers the box, so without this the map is
    // transparent-black outside it and the resampling drags a dark fringe in.
    filter.appendChild(el("feFlood", {
      "flood-color": "rgb(128,128,128)", "flood-opacity": "1", result: "mapBg",
    }));
    filter.appendChild(el("feImage", {
      href: mapUrl, x: 0, y: 0, width: w, height: h,
      preserveAspectRatio: "none", result: "rawMap",
    }));
    filter.appendChild(el("feComposite", {
      in: "rawMap", in2: "mapBg", operator: "over", result: "map",
    }));

    // Three displacement passes at slightly different scales, each keeping only
    // one colour channel, summed back together: chromatic aberration.
    const pass = (scale, matrix, result) => {
      filter.appendChild(el("feDisplacementMap", {
        in: "SourceGraphic", in2: "map", scale,
        xChannelSelector: "R", yChannelSelector: "G",
      }));
      filter.appendChild(el("feColorMatrix", { type: "matrix", values: matrix, result }));
    };
    const d = o.dispersion;
    pass(dispScale * (1 + DISPERSION_SPREAD * d),
      "1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0", "refractR");
    pass(dispScale * (1 + DISPERSION_SPREAD * 0.5 * d),
      "0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0", "refractG");
    pass(dispScale,
      "0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0", "refractB");

    const add = (a, b, result) => filter.appendChild(el("feComposite", {
      in: a, in2: b, operator: "arithmetic", k1: 0, k2: 1, k3: 1, k4: 0, result,
    }));
    add("refractR", "refractG", "refractRG");
    add("refractRG", "refractB", "lensOut");

    // Lift the map's B channel into a sheen mask (128→0, 255→1) and add it over
    // the refracted backdrop: the rim shine and inner glow.
    filter.appendChild(el("feColorMatrix", {
      in: "map", type: "matrix",
      values: `0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 1 0 ${-128 / 255}`,
      result: "sheenMask",
    }));
    filter.appendChild(el("feComposite", {
      in: "sheenMask", in2: "lensOut", operator: "arithmetic",
      k1: 0, k2: o.specular, k3: 1, k4: 0,
    }));

    defs.replaceChildren(filter);

    const value = `blur(var(--glass-blur)) saturate(var(--glass-saturate)) url(#${id})`;
    sidebar.style.backdropFilter = value;
    sidebar.style.webkitBackdropFilter = value;
  }

  // The panel changes shape on collapse and on window resize; the map is keyed
  // on shape, so a move or a repaint never regenerates it.
  const schedule = (w, h) => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => build(w, h));
  };

  const ro = new ResizeObserver((entries) => {
    const r = entries[0]?.contentRect;
    if (!r || r.width < 8 || r.height < 8) return;
    const cs = getComputedStyle(sidebar);
    // contentRect excludes padding and border; the filter needs the border box.
    const w = r.width + parseFloat(cs.borderLeftWidth) + parseFloat(cs.borderRightWidth);
    const h = r.height + parseFloat(cs.borderTopWidth) + parseFloat(cs.borderBottomWidth);
    schedule(w, h);
  });
  ro.observe(sidebar);
}

mountSidebarGlass();
