import { useEffect, useRef, useState } from 'react';
import type { Box3, Material, Mesh, Object3D, Texture } from 'three';
import type { Article } from './model';
import { Button } from './ui';

export interface ModelPosition {
  x: number;
  y: number;
  markerHeight: number;
}

type Marker = Pick<Article, 'id' | 'title' | 'x' | 'y' | 'markerHeight'>;

function disposeModel(object: Object3D) {
  const geometries = new Set<Mesh['geometry']>();
  const materials = new Set<Material>();
  const textures = new Set<Texture>();
  object.traverse(child => {
    const mesh = child as Mesh;
    if (!mesh.isMesh) return;
    geometries.add(mesh.geometry);
    const list = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of list) {
      materials.add(material);
      for (const value of Object.values(material)) {
        if (value?.isTexture) textures.add(value as Texture);
      }
    }
  });
  geometries.forEach(geometry => geometry.dispose());
  materials.forEach(material => material.dispose());
  textures.forEach(texture => texture.dispose());
}

export function ModelViewer({ source, markers = [], selected, onSelect, onPlace, onReady, onFailure }: {
  source: string; markers?: Marker[]; selected?: string;
  onSelect?: (id: string) => void; onPlace?: (position: ModelPosition) => void;
  onReady?: () => void; onFailure?: () => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  const data = useRef({ markers, onPlace, onReady, onFailure });
  data.current = { markers, onPlace, onReady, onFailure };
  const sceneControls = useRef<{ reset: () => void; rotate: () => void; zoom: () => void; draw: () => void } | null>(null);
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [positions, setPositions] = useState<{ id: string; left: number; top: number }[]>([]);

  useEffect(() => sceneControls.current?.draw(), [markers]);

  useEffect(() => {
    const abort = new AbortController();
    let dispose: (() => void) | undefined;
    let model: Object3D | undefined;
    setStatus('loading');
    setPositions([]);

    async function mount() {
      try {
        const [THREE, { GLTFLoader }, { OrbitControls }, response] = await Promise.all([
          import('three'), import('three/addons/loaders/GLTFLoader.js'),
          import('three/addons/controls/OrbitControls.js'), fetch(source, { signal: abort.signal, credentials: 'same-origin' }),
        ]);
        if (!response.ok) throw new Error('Unable to open model');
        const manager = new THREE.LoadingManager();
        manager.setURLModifier(url => {
          if (url.startsWith('blob:') || url.startsWith('data:')) return url;
          throw new Error('The GLB file references an external resource');
        });
        const bytes = await response.arrayBuffer();
        const { scene: content } = await new GLTFLoader(manager).parseAsync(bytes, '');
        if (abort.signal.aborted || !host.current) {
          disposeModel(content);
          return;
        }
        model = content;
        const bounds = new THREE.Box3().setFromObject(content);
        const center = bounds.getCenter(new THREE.Vector3());
        const extent = bounds.getSize(new THREE.Vector3());
        const span = Math.max(extent.x, extent.y, extent.z);
        if (!Number.isFinite(span) || span <= 0) throw new Error('The model has no visible geometry');

        const mountNode = host.current;
        const modelRoot = new THREE.Group();
        modelRoot.add(content);
        modelRoot.scale.setScalar(1 / span);
        modelRoot.position.copy(center).multiplyScalar(-1 / span);
        modelRoot.updateMatrixWorld(true);
        const frame: Box3 = new THREE.Box3().setFromObject(modelRoot);
        const size = frame.getSize(new THREE.Vector3());

        const scene = new THREE.Scene();
        scene.background = new THREE.Color('#edf3f4');
        scene.add(modelRoot, new THREE.HemisphereLight('#ffffff', '#809397', 2.3));
        const light = new THREE.DirectionalLight('#fff9ed', 2.4);
        light.position.set(2, 5, 4);
        scene.add(light);
        const camera = new THREE.PerspectiveCamera(37, 1, 0.01, 30);
        camera.position.set(1.55, 1.3, 1.7);
        const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'low-power' });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        const canvas = renderer.domElement;
        canvas.setAttribute('aria-label', 'Interactive 3D model. Drag to rotate or use the controls.');
        canvas.setAttribute('role', 'img');
        mountNode.appendChild(canvas);
        const controls = new OrbitControls(camera, canvas);
        controls.enablePan = false;
        controls.minDistance = .35;
        controls.maxDistance = 5;
        controls.update();
        controls.saveState();

        function draw() {
          renderer.render(scene, camera);
          const positions = data.current.markers.flatMap(marker => {
            if (marker.x === undefined || marker.y === undefined) return [];
            const projected = new THREE.Vector3(
              frame.min.x + size.x * marker.x / 100,
              frame.min.y + size.y * (marker.markerHeight ?? 45) / 100,
              frame.min.z + size.z * marker.y / 100,
            ).project(camera);
            if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1 || projected.z < -1 || projected.z > 1) return [];
            return [{ id: marker.id, left: (projected.x + 1) * 50, top: (1 - projected.y) * 50 }];
          });
          setPositions(positions);
        }

        const observer = new ResizeObserver(() => {
          const width = Math.max(1, mountNode.clientWidth);
          const height = Math.max(1, mountNode.clientHeight);
          renderer.setSize(width, height);
          camera.aspect = width / height;
          camera.updateProjectionMatrix();
          draw();
        });
        observer.observe(mountNode);
        controls.addEventListener('change', draw);
        let pointer: { x: number; y: number } | null = null;
        const pointerDown = (event: PointerEvent) => { pointer = { x: event.clientX, y: event.clientY }; };
        const placeMarker = (event: PointerEvent) => {
          const start = pointer;
          pointer = null;
          if (!data.current.onPlace || !start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > 7) return;
          const rect = canvas.getBoundingClientRect();
          const cursor = new THREE.Vector2((event.clientX - rect.left) / rect.width * 2 - 1, 1 - (event.clientY - rect.top) / rect.height * 2);
          const ray = new THREE.Raycaster();
          ray.setFromCamera(cursor, camera);
          const hit = ray.intersectObject(modelRoot, true)[0];
          if (!hit) return;
          const percent = (value: number, lower: number, span: number) => Math.round(THREE.MathUtils.clamp((value - lower) / Math.max(span, .000001), 0, 1) * 100);
          data.current.onPlace({ x: percent(hit.point.x, frame.min.x, size.x), y: percent(hit.point.z, frame.min.z, size.z),
            markerHeight: percent(hit.point.y, frame.min.y, size.y) });
        };
        const onLost = (event: Event) => {
          event.preventDefault();
          setStatus('error');
          data.current.onFailure?.();
        };
        canvas.addEventListener('pointerdown', pointerDown);
        canvas.addEventListener('pointerup', placeMarker);
        canvas.addEventListener('webglcontextlost', onLost);
        sceneControls.current = {
          draw, reset: () => controls.reset(),
          rotate: () => { camera.position.applyAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 8); controls.update(); },
          zoom: () => { camera.position.multiplyScalar(.82); controls.update(); },
        };
        dispose = () => {
          observer.disconnect();
          controls.removeEventListener('change', draw);
          controls.dispose();
          canvas.removeEventListener('pointerdown', pointerDown);
          canvas.removeEventListener('pointerup', placeMarker);
          canvas.removeEventListener('webglcontextlost', onLost);
          renderer.dispose();
          canvas.remove();
        };
        draw();
        setStatus('ready');
        data.current.onReady?.();
      } catch {
        if (!abort.signal.aborted) {
          setStatus('error');
          data.current.onFailure?.();
        }
      }
    }
    void mount();
    return () => {
      abort.abort();
      sceneControls.current = null;
      dispose?.();
      if (model) disposeModel(model);
    };
  }, [source]);

  return <div className="connected-model">
    <div className="connected-model-stage" data-model-status={status}>
      <div className="connected-model-canvas" ref={host} />
      {status === 'loading' && <p className="connected-model-message" role="status">Opening 3D model…</p>}
      {status === 'error' && <p className="connected-model-message" role="alert">Unable to open this 3D model. Use the floor plan or text guide if available.</p>}
      {status === 'ready' && positions.map(position => {
        const index = markers.findIndex(marker => marker.id === position.id);
        const marker = markers[index];
        return marker && <button type="button" key={marker.id} className="guide-marker"
          style={{ left: position.left + '%', top: position.top + '%' }}
          aria-label={marker.title} aria-pressed={selected === marker.id} onClick={() => onSelect?.(marker.id)}>{index + 1}</button>;
      })}
    </div>
    {status === 'ready' && <div className="connected-model-controls">
      <Button onClick={() => sceneControls.current?.rotate()}>Rotate</Button>
      <Button onClick={() => sceneControls.current?.zoom()}>Zoom in</Button>
      <Button onClick={() => sceneControls.current?.reset()}>Reset view</Button>
    </div>}
  </div>;
}
