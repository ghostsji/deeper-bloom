import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

// Looks: a final colour-grading pass over the finished frame, picked in Options → Display.
// Every look is the same shader with different settings (so switching never recompiles):
// colour (saturation, contrast, a tint and a lift), a vignette, film grain, chromatic fringing,
// posterised colour and scanlines. "Clean" turns the pass off entirely.

const BASE = { sat: 1, contrast: 1, tint: [1, 1, 1], lift: [0, 0, 0], vignette: 0, grain: 0, chroma: 0, poster: 0, scan: 0 };
export const LOOKS = [
  { id: 'clean', name: 'Clean', desc: 'The game as it is, nothing added.' },
  { id: 'cinema', name: 'Deep cinema', desc: 'A soft vignette, fine film grain and a touch of lens fringing.',
    sat: 1.06, contrast: 1.08, tint: [1.0, 0.99, 0.96], vignette: 0.45, grain: 0.045, chroma: 1.2 },
  { id: 'glow', name: 'Bioluminescent', desc: 'Richer colour and deeper blacks, so everything that glows really glows.',
    sat: 1.45, contrast: 1.16, tint: [0.92, 1.0, 1.08], lift: [0, 0.006, 0.014], vignette: 0.35 },
  { id: 'murk', name: 'Murky water', desc: 'Silty, green and close. Harder to see, more to feel.',
    sat: 0.62, contrast: 0.92, tint: [0.86, 1.0, 0.82], lift: [0.02, 0.04, 0.03], vignette: 0.62, grain: 0.035 },
  { id: 'camera', name: 'Old dive camera', desc: 'Footage from a 90s housing: banded colour, scanlines, grain and colour bleed.',
    sat: 0.82, contrast: 1.05, tint: [0.96, 1.04, 0.92], vignette: 0.5, grain: 0.08, chroma: 2.2, poster: 7, scan: 0.22 },
  { id: 'sonar', name: 'Sonar mono', desc: 'Black-and-green, like the old sonar screens on the outpost.',
    sat: 0, contrast: 1.12, tint: [0.62, 1.22, 0.78], vignette: 0.5, grain: 0.07, scan: 0.18 },
  { id: 'warm', name: 'Shallows', desc: 'Warm and sunlit, as if the water were half as deep.',
    sat: 1.12, contrast: 1.02, tint: [1.08, 1.02, 0.9], lift: [0.015, 0.01, 0], vignette: 0.25 },
].map((l) => ({ ...BASE, ...l }));

const LookShader = {
  uniforms: {
    tDiffuse: { value: null }, time: { value: 0 }, res: { value: [1, 1] },
    sat: { value: 1 }, contrast: { value: 1 }, tint: { value: [1, 1, 1] }, lift: { value: [0, 0, 0] },
    vignette: { value: 0 }, grain: { value: 0 }, chroma: { value: 0 }, poster: { value: 0 }, scan: { value: 0 },
  },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `
    uniform sampler2D tDiffuse; uniform float time; uniform vec2 res;
    uniform float sat, contrast, vignette, grain, chroma, poster, scan; uniform vec3 tint, lift;
    varying vec2 vUv;
    float hash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main() {
      vec2 d = vUv - 0.5;
      // Chromatic fringing: red and blue pulled apart towards the edges.
      vec2 off = d * chroma / res.x * 2.0;
      vec3 c = vec3(texture2D(tDiffuse, vUv + off).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - off).b);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, sat);
      c = (c - 0.5) * contrast + 0.5;
      c = c * tint + lift;
      if (poster > 0.5) c = floor(c * poster + 0.5) / poster;
      if (scan > 0.0) c *= 1.0 - scan * (0.5 + 0.5 * sin(vUv.y * res.y * 3.14159));
      c += (hash(vUv * res + fract(time) * 91.7) - 0.5) * grain;
      c *= 1.0 - vignette * smoothstep(0.25, 0.85, length(d * vec2(res.x / res.y, 1.0)));
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

/** The grading pass; add it after the OutputPass. set(id) picks a look; tick(t) moves the grain. */
export function createLookPass() {
  const pass = new ShaderPass(LookShader);
  const u = pass.uniforms;
  let current = 'clean', still = false;
  pass.enabled = false;
  return {
    pass,
    get current() { return current; },
    set(id) {
      const look = LOOKS.find((l) => l.id === id) || LOOKS[0];
      current = look.id;
      pass.enabled = look.id !== 'clean';
      for (const k of ['sat', 'contrast', 'vignette', 'grain', 'chroma', 'poster', 'scan']) u[k].value = look[k];
      u.tint.value = look.tint; u.lift.value = look.lift;
    },
    /** With reduced flashing on, the grain holds still instead of crawling. */
    setStill(v) { still = !!v; },
    setSize(w, h) { u.res.value = [w, h]; },
    tick(t) { if (!still) u.time.value = t; },
  };
}
