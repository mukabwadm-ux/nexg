'use client';

import type * as Anime from 'animejs';
import * as React from 'react';
import type * as ThreeModule from 'three';

type Three = typeof ThreeModule;

/**
 * Gold motes behind the Join section, drawn with three.js.
 *
 * When the section comes into view they drift up from below and settle in
 * a loose band along the dotted path, an anime.js tween driving the rise,
 * then keep moving gently. three.js loads only when the section is about to
 * be seen; the drawing pauses while it is off screen or the tab is hidden;
 * nothing is drawn at all for reduced motion or without WebGL.
 */
export function JoinParticles() {
  const host = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const element = host.current;
    if (!element || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    let disposed = false;
    let stop = () => {};
    const near = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        near.disconnect();
        void Promise.all([import('three'), import('animejs')])
          .then(([three, anime]) => {
            if (!disposed) stop = draw(three, anime, element);
          })
          .catch(() => {});
      },
      { rootMargin: '400px 0px' },
    );
    near.observe(element);
    return () => {
      disposed = true;
      near.disconnect();
      stop();
    };
  }, []);

  return (
    <div
      ref={host}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
    />
  );
}

const VERTEX = /* glsl */ `
  attribute vec3 aStart;
  attribute float aSeed;
  attribute float aSize;
  attribute float aDelay;
  uniform float uTime;
  uniform float uProgress;
  uniform float uPixel;
  varying float vAlpha;
  varying float vTone;

  void main() {
    float p = clamp((uProgress - aDelay) / (1.0 - aDelay), 0.0, 1.0);
    p = 1.0 - pow(1.0 - p, 4.0);
    vec3 pos = mix(aStart, position, p);
    pos.x += sin(uTime * 0.22 + aSeed * 6.2831) * 0.04;
    pos.y += cos(uTime * 0.31 + aSeed * 12.566) * 0.035;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
    gl_PointSize = aSize * uPixel * (0.55 + 0.45 * p);
    vAlpha = p * (0.3 + 0.5 * fract(aSeed * 7.13));
    vTone = fract(aSeed * 3.7);
  }
`;

const FRAGMENT = /* glsl */ `
  uniform vec3 uGold;
  uniform vec3 uAmber;
  varying float vAlpha;
  varying float vTone;

  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    gl_FragColor = vec4(mix(uGold, uAmber, vTone), a * vAlpha);
  }
`;

function draw(THREE: Three, anime: typeof Anime, element: HTMLElement) {
  let renderer: InstanceType<Three['WebGLRenderer']>;
  try {
    renderer = new THREE.WebGLRenderer({
      alpha: true,
      antialias: false,
      powerPreference: 'low-power',
    });
  } catch {
    return () => {};
  }
  const pixel = Math.min(window.devicePixelRatio || 1, 1.5);
  renderer.setPixelRatio(pixel);
  renderer.setClearColor(0x000000, 0);
  const canvas = renderer.domElement;
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.display = 'block';
  element.appendChild(canvas);

  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 10);
  camera.position.z = 1;
  const scene = new THREE.Scene();

  /* Fewer on a phone: the same look for less work. */
  const count = element.clientWidth < 640 ? 120 : 260;
  const positions = new Float32Array(count * 3);
  const starts = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  const sizes = new Float32Array(count);
  const delays = new Float32Array(count);
  const random = (seed: number) => {
    const x = Math.sin(seed * 127.1) * 43758.5453;
    return x - Math.floor(x);
  };

  const geometry = new THREE.BufferGeometry();
  const material = new THREE.ShaderMaterial({
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uPixel: { value: pixel },
      uGold: { value: new THREE.Color('#FDD128') },
      uAmber: { value: new THREE.Color('#C9971B') },
    },
  });

  /* Laid out in the section's own proportions, so the band follows the
     dotted path at any width. */
  const layout = (aspect: number) => {
    for (let i = 0; i < count; i += 1) {
      const x = (random(i + 1) * 2 - 1) * aspect * 1.05;
      const spread = (random(i + 101) + random(i + 211) - 1) * 0.42;
      const y = 0.22 * Math.sin((x / aspect) * 3.1 + 0.4) + spread;
      positions.set([x, y, 0], i * 3);
      starts.set([x + (random(i + 307) - 0.5) * 0.3, y - 1.5 - random(i + 401) * 0.8, 0], i * 3);
      seeds[i] = random(i + 503);
      sizes[i] = 2.5 + random(i + 601) * 5.5;
      /* Left to right, the way the line draws. */
      delays[i] = Math.min(0.6, ((x / aspect + 1) / 2) * 0.45 + random(i + 701) * 0.15);
    }
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aStart', new THREE.BufferAttribute(starts, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    geometry.setAttribute('aDelay', new THREE.BufferAttribute(delays, 1));
  };

  const resize = () => {
    const width = element.clientWidth;
    const height = element.clientHeight;
    if (!width || !height) return;
    const aspect = width / height;
    renderer.setSize(width, height, false);
    camera.left = -aspect;
    camera.right = aspect;
    camera.updateProjectionMatrix();
    layout(aspect);
  };
  resize();
  scene.add(new THREE.Points(geometry, material));

  /* Drawn only while visible and the tab is in front. */
  let frame = 0;
  let visible = false;
  const started = performance.now();
  const tick = (now: number) => {
    material.uniforms.uTime!.value = (now - started) / 1000;
    renderer.render(scene, camera);
    frame = visible && !document.hidden ? requestAnimationFrame(tick) : 0;
  };
  const wake = () => {
    if (!frame && visible && !document.hidden) frame = requestAnimationFrame(tick);
  };

  /* The rise: once, when a quarter of the section is in view, slow. */
  let rising: ReturnType<typeof anime.animate> | null = null;
  const seen = new IntersectionObserver(
    (entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible && !rising)
        rising = anime.animate(material.uniforms.uProgress!, {
          value: [0, 1],
          duration: 4200,
          ease: 'outSine',
        });
      wake();
    },
    { threshold: [0, 0.25], rootMargin: '0px 0px -20% 0px' },
  );
  seen.observe(element);
  const sizeWatch = new ResizeObserver(resize);
  sizeWatch.observe(element);
  document.addEventListener('visibilitychange', wake);

  return () => {
    cancelAnimationFrame(frame);
    rising?.pause();
    seen.disconnect();
    sizeWatch.disconnect();
    document.removeEventListener('visibilitychange', wake);
    geometry.dispose();
    material.dispose();
    renderer.dispose();
    canvas.remove();
  };
}
