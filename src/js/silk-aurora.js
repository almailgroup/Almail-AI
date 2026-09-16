/**
 * Silk Aurora — the animated sidebar backdrop.
 *
 * Vanilla port of the Silk Aurora component from componentry.dev
 * (@componentry/silk-aurora). The original is a React client component built
 * on Next.js, Tailwind and shadcn; this app is build-free vanilla ES modules,
 * so the GLSL is carried over verbatim and the React lifecycle — context
 * setup, uniform plumbing, resize, pointer tracking, rAF loop, teardown — is
 * rewritten against the DOM directly.
 *
 * Deviations from the original, all deliberate:
 *  - Renders into the sidebar rather than a full-page hero, so the canvas is
 *    sized from the panel and the headline/subtitle markup is dropped.
 *  - The loop pauses when the tab is hidden and when the panel is collapsed or
 *    off-screen. The original runs a 5-octave fbm every frame forever, which on
 *    a persistent chat sidebar is a real battery cost for pixels nobody sees.
 *  - Handles WebGL context loss, which a long-lived canvas will eventually hit.
 */

const VERTEX_SHADER = `
attribute vec2 position;

void main() {
  gl_Position = vec4(position, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec2 u_res;
uniform vec2 u_mouse;
uniform float u_time;
uniform float u_speed;
uniform float u_intensity;
uniform float u_grain;
uniform float u_vignette;
uniform float u_mouseInfluence;
uniform vec3 u_base;
uniform vec3 u_mid;
uniform vec3 u_sheen;
uniform vec3 u_accent;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(41.93, 289.17))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);

  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));

  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

float fbm(vec2 p) {
  float value = 0.0;
  float amp = 0.5;
  mat2 rot = mat2(0.82, 0.57, -0.57, 0.82);

  for (int i = 0; i < 5; i++) {
    value += amp * noise(p);
    p = rot * p * 2.03;
    amp *= 0.5;
  }

  return value;
}

float ribbon(vec2 p, float offset, float width, float softness) {
  float y = p.y + sin(p.x * 1.8 + offset) * 0.18;
  y += sin(p.x * 4.2 - offset * 0.7) * 0.045;
  return smoothstep(width + softness, width, abs(y));
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_res;
  float aspect = u_res.x / max(u_res.y, 1.0);
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0);

  vec2 mouse = (u_mouse - 0.5) * vec2(aspect, 1.0);
  float t = u_time * 0.12 * u_speed;
  float pointerFalloff = smoothstep(0.72, 0.0, length(p - mouse));
  p += (mouse - p) * pointerFalloff * 0.05 * u_mouseInfluence;

  vec2 silk = p;
  silk.x += fbm(p * 1.6 + vec2(t * 0.8, -t * 0.35)) * 0.16;
  silk.y += fbm(p * 2.2 + vec2(-t * 0.25, t * 0.7)) * 0.10;

  float veilA = ribbon(silk + vec2(-0.18, 0.08), t * 2.1, 0.055, 0.22);
  float veilB = ribbon(silk * vec2(0.86, 1.18) + vec2(0.2, -0.14), -t * 2.8 + 1.7, 0.038, 0.18);
  float veilC = ribbon(silk * vec2(1.18, 0.9) + vec2(-0.08, 0.24), t * 1.4 - 2.1, 0.03, 0.16);

  float atmosphere = fbm(p * 1.35 + vec2(t * 0.22, -t * 0.1));
  float pearlescent = pow(max(0.0, sin((p.x - p.y) * 7.5 + atmosphere * 4.0 - t * 2.5)), 5.0);
  float glint = pow(max(0.0, noise(gl_FragCoord.xy * 0.065 + t * 18.0) - 0.72), 5.0);

  vec3 col = u_base;
  col = mix(col, u_mid, smoothstep(-0.45, 0.75, p.y + atmosphere * 0.75));
  col += u_accent * veilA * 0.72 * u_intensity;
  col += u_sheen * veilB * 0.64 * u_intensity;
  col += mix(u_sheen, u_accent, 0.35) * veilC * 0.42 * u_intensity;
  col += u_sheen * pearlescent * 0.075 * u_intensity;
  col += vec3(1.0, 0.93, 0.82) * glint * 0.22 * u_intensity;
  col += u_sheen * pointerFalloff * 0.08 * u_mouseInfluence;

  float vignette = smoothstep(1.25, 0.22, length(p));
  col *= mix(1.0 - u_vignette * 0.42, 1.06, vignette);

  float grain = (hash(gl_FragCoord.xy + t * 90.0) - 0.5) * 0.08 * u_grain;
  col += grain;

  gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
}
`;

// The "Champagne" preset — the variant in the reference screenshot.
const SETTINGS = {
  baseColor: "#060505",
  midColor: "#19130f",
  sheenColor: "#ffe2a9",
  accentColor: "#c58d5d",
  speed: 0.75,
  intensity: 0.9,
  grain: 0.85,
  vignette: 1,
  mouseInfluence: 1,
  interactive: true,
};

const HEX_COLOR_REGEX = /^#?[0-9a-fA-F]{6}$/;

function hexToRgb01(hex, fallback) {
  const raw = String(hex ?? "").trim();
  const safe = HEX_COLOR_REGEX.test(raw) ? raw : fallback;
  const n = safe.replace("#", "");
  return [
    parseInt(n.slice(0, 2), 16) / 255,
    parseInt(n.slice(2, 4), 16) / 255,
    parseInt(n.slice(4, 6), 16) / 255,
  ];
}

export function mountSidebarAurora(target) {
  const sidebar = target || document.getElementById("sidebar");
  if (!sidebar) return;

  const canvas = document.createElement("canvas");
  canvas.className = "sidebar-aurora";
  canvas.setAttribute("aria-hidden", "true");
  // First child, so it paints beneath everything else in the panel.
  sidebar.prepend(canvas);
  sidebar.classList.add("has-aurora");

  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

  let gl = null, program = null, buffer = null;
  let vertexShader = null, fragmentShader = null;
  let rafId = 0, running = false, visible = true;
  const start = performance.now();

  const mouse = { x: 0.5, y: 0.5 };
  const targetMouse = { x: 0.5, y: 0.5 };

  const onPointerMove = (event) => {
    if (!SETTINGS.interactive) return;
    const rect = sidebar.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    targetMouse.x = (event.clientX - rect.left) / rect.width;
    targetMouse.y = 1 - (event.clientY - rect.top) / rect.height;
  };
  const onPointerLeave = () => { targetMouse.x = 0.5; targetMouse.y = 0.5; };

  function compile(type, source) {
    const shader = gl.createShader(type);
    if (!shader) return null;
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error("Silk Aurora shader failed:", gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  // If anything about WebGL is unavailable the canvas is removed entirely, so
  // the sidebar falls back to its plain themed background rather than sitting
  // behind a dead black rectangle.
  function bail() {
    stop();
    canvas.remove();
    sidebar.classList.remove("has-aurora");
  }

  let uniforms = null;

  function init() {
    try {
      gl = canvas.getContext("webgl", { antialias: false, alpha: false });
    } catch (_) { gl = null; }
    if (!gl) return bail();

    vertexShader = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    fragmentShader = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vertexShader || !fragmentShader) return bail();

    program = gl.createProgram();
    if (!program) return bail();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.error("Silk Aurora link failed:", gl.getProgramInfoLog(program));
      return bail();
    }
    gl.useProgram(program);

    const position = gl.getAttribLocation(program, "position");
    buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

    const u = (name) => gl.getUniformLocation(program, name);
    uniforms = {
      res: u("u_res"), mouse: u("u_mouse"), time: u("u_time"),
      speed: u("u_speed"), intensity: u("u_intensity"), grain: u("u_grain"),
      vignette: u("u_vignette"), mouseInfluence: u("u_mouseInfluence"),
      base: u("u_base"), mid: u("u_mid"), sheen: u("u_sheen"), accent: u("u_accent"),
    };
    if (Object.values(uniforms).some((loc) => !loc)) return bail();

    const base = hexToRgb01(SETTINGS.baseColor, "#050507");
    const mid = hexToRgb01(SETTINGS.midColor, "#14151d");
    const sheen = hexToRgb01(SETTINGS.sheenColor, "#f4dfb8");
    const accent = hexToRgb01(SETTINGS.accentColor, "#6ed6c9");
    gl.uniform3f(uniforms.base, base[0], base[1], base[2]);
    gl.uniform3f(uniforms.mid, mid[0], mid[1], mid[2]);
    gl.uniform3f(uniforms.sheen, sheen[0], sheen[1], sheen[2]);
    gl.uniform3f(uniforms.accent, accent[0], accent[1], accent[2]);

    resize();
    return true;
  }

  function resize() {
    if (!gl || !uniforms) return;
    // Cap the pixel ratio at 2: this shader runs five octaves of fbm per
    // fragment, so a 3x panel triples that cost for no visible gain.
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const { width, height } = sidebar.getBoundingClientRect();
    const w = Math.max(1, Math.floor(width * dpr));
    const h = Math.max(1, Math.floor(height * dpr));
    if (canvas.width === w && canvas.height === h) return;
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
    gl.uniform2f(uniforms.res, w, h);
  }

  function frame(now) {
    if (!running || !gl) return;
    mouse.x += (targetMouse.x - mouse.x) * 0.045;
    mouse.y += (targetMouse.y - mouse.y) * 0.045;

    // Reduced motion: hold a fixed, good-looking moment instead of animating.
    const elapsed = reducedMotion ? 8 : (now - start) / 1000;

    gl.uniform2f(uniforms.mouse, mouse.x, mouse.y);
    gl.uniform1f(uniforms.time, elapsed);
    gl.uniform1f(uniforms.speed, reducedMotion ? 0 : SETTINGS.speed);
    gl.uniform1f(uniforms.intensity, SETTINGS.intensity);
    gl.uniform1f(uniforms.grain, SETTINGS.grain);
    gl.uniform1f(uniforms.vignette, SETTINGS.vignette);
    gl.uniform1f(uniforms.mouseInfluence,
      SETTINGS.interactive && !reducedMotion ? SETTINGS.mouseInfluence : 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // A still frame needs drawing once, not sixty times a second.
    if (reducedMotion) { running = false; return; }
    rafId = requestAnimationFrame(frame);
  }

  function play() {
    if (running || !gl) return;
    running = true;
    rafId = requestAnimationFrame(frame);
  }
  function stop() {
    running = false;
    cancelAnimationFrame(rafId);
  }
  // Paint one frame while paused — used when the panel resizes off-screen so
  // it isn't blank the instant it becomes visible again.
  function drawOnce() {
    if (!gl) return;
    running = true;
    frame(performance.now());
    running = false;
    cancelAnimationFrame(rafId);
  }

  function updateActivity() {
    const rect = sidebar.getBoundingClientRect();
    const onScreen = rect.width > 8 && rect.height > 8 &&
      rect.right > 0 && rect.left < window.innerWidth;
    if (visible && onScreen) play(); else stop();
  }

  if (init() === true) {
    sidebar.addEventListener("pointermove", onPointerMove);
    sidebar.addEventListener("pointerleave", onPointerLeave);

    // Collapsing the sidebar or sliding it off-screen on mobile should stop the
    // loop — it's the same shader cost whether or not anyone can see it.
    const ro = new ResizeObserver(() => {
      resize();
      updateActivity();
      if (!running) drawOnce();
    });
    ro.observe(sidebar);

    document.addEventListener("visibilitychange", () => {
      visible = !document.hidden;
      updateActivity();
    });

    // A long-lived canvas will lose its context eventually (GPU reset, tab
    // backgrounded for hours). Without this it would stay black forever.
    canvas.addEventListener("webglcontextlost", (e) => { e.preventDefault(); stop(); });
    canvas.addEventListener("webglcontextrestored", () => {
      if (init() === true) updateActivity();
    });

    updateActivity();
  }
}

mountSidebarAurora();
