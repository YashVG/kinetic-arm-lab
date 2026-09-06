'use client';
import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  BASE_HEIGHT,
  forward,
  HOME,
  HOME_JOINTS,
  type Joints,
  type Vec3,
} from '@/lib/kinematics';
export type SceneState = {
  joints: Joints;
  target: Vec3;
  trail: Vec3[];
  engaged: boolean;
};
export default function ArmScene({
  state,
}: {
  state: React.RefObject<SceneState>;
}) {
  const host = useRef<HTMLDivElement>(null);
  const failure = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (!host.current) return;
    const element = host.current;
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      if (failure.current) failure.current.hidden = false;
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x0c1418, 1);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.setAttribute(
      'aria-label',
      'Simulated robot arm. Drag to orbit; scroll to zoom.',
    );
    element.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x0c1418, 3, 7);
    const camera = new THREE.PerspectiveCamera(39, 1, 0.01, 20);
    camera.position.set(1.45, 1.17, 1.65);
    const orbit = new OrbitControls(camera, renderer.domElement);
    orbit.target.set(0.22, 0.35, 0);
    orbit.enableDamping = true;
    orbit.minDistance = 1;
    orbit.maxDistance = 4;
    orbit.maxPolarAngle = Math.PI / 2 - 0.05;
    orbit.enablePan = false;
    scene.add(new THREE.HemisphereLight(0xd7fff5, 0x233039, 2.8));
    const light = new THREE.DirectionalLight(0xffffff, 3.5);
    light.position.set(1.5, 3, 2);
    light.castShadow = true;
    light.shadow.mapSize.set(1024, 1024);
    scene.add(light);
    const fill = new THREE.PointLight(0x70edc3, 2, 3);
    fill.position.set(-0.4, 1, 0.4);
    scene.add(fill);
    const floor = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshStandardMaterial({ color: 0x0c1418, roughness: 0.92 }),
    );
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -0.012;
    floor.receiveShadow = true;
    scene.add(floor);
    scene.add(new THREE.GridHelper(4, 40, 0x34434b, 0x1e2b32));
    const pale = new THREE.MeshStandardMaterial({
      color: 0xc5d3d3,
      roughness: 0.32,
      metalness: 0.65,
    });
    const dark = new THREE.MeshStandardMaterial({
      color: 0x334b55,
      roughness: 0.5,
      metalness: 0.65,
    });
    const mint = new THREE.MeshStandardMaterial({
      color: 0x91f1c2,
      emissive: 0x185e44,
      emissiveIntensity: 0.4,
      metalness: 0.25,
      roughness: 0.3,
    });
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 0.07, 48),
      dark,
    );
    base.position.y = 0.035;
    base.castShadow = true;
    scene.add(base);
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.055, 0.065, BASE_HEIGHT - 0.06, 32),
      pale,
    );
    stem.position.y = (BASE_HEIGHT + 0.06) / 2;
    stem.castShadow = true;
    scene.add(stem);
    const links = [0, 1].map(() => {
      const m = new THREE.Mesh(
        new THREE.CylinderGeometry(0.035, 0.044, 1, 16),
        pale,
      );
      m.castShadow = true;
      scene.add(m);
      return m;
    });
    const joints = [0, 1, 2].map((i) => {
      const m = new THREE.Mesh(
        new THREE.SphereGeometry(i === 2 ? 0.038 : 0.057, 24, 24),
        i === 2 ? mint : dark,
      );
      m.castShadow = true;
      scene.add(m);
      return m;
    });
    const target = new THREE.Group();
    for (let i = 0; i < 3; i++) {
      const r = new THREE.Mesh(
        new THREE.TorusGeometry(0.035, 0.0018, 8, 40),
        new THREE.MeshBasicMaterial({
          color: 0xa2f7c8,
          transparent: true,
          opacity: 0.85,
        }),
      );
      if (i === 1) r.rotation.x = Math.PI / 2;
      if (i === 2) r.rotation.y = Math.PI / 2;
      target.add(r);
    }
    scene.add(target);
    const projection = new THREE.Line(
      new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(),
        new THREE.Vector3(),
      ]),
      new THREE.LineDashedMaterial({
        color: 0x7fb69d,
        dashSize: 0.018,
        gapSize: 0.012,
        transparent: true,
        opacity: 0.5,
      }),
    );
    scene.add(projection);
    const trailGeometry = new THREE.BufferGeometry();
    const trail = new THREE.Line(
      trailGeometry,
      new THREE.LineBasicMaterial({
        color: 0x80efbf,
        transparent: true,
        opacity: 0.45,
      }),
    );
    scene.add(trail);
    for (const [direction, color] of [
      [new THREE.Vector3(1, 0, 0), 0xe88776],
      [new THREE.Vector3(0, 1, 0), 0xa0e5bd],
      [new THREE.Vector3(0, 0, 1), 0x779ae5],
    ] as const)
      scene.add(
        new THREE.ArrowHelper(
          direction,
          new THREE.Vector3(0, 0.005, 0),
          0.25,
          color,
          0.022,
          0.012,
        ),
      );
    const resize = () => {
      const w = element.clientWidth,
        h = element.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(element);
    resize();
    let frame = 0;
    const draw = () => {
      const current = state.current ?? {
        joints: HOME_JOINTS,
        target: HOME,
        trail: [],
        engaged: false,
      };
      const points = forward(current.joints).map(
        (v) => new THREE.Vector3(...v),
      );
      joints.forEach((m, i) => m.position.copy(points[i]));
      links.forEach((m, i) => {
        const delta = points[i + 1].clone().sub(points[i]);
        m.position
          .copy(points[i])
          .add(points[i + 1])
          .multiplyScalar(0.5);
        m.scale.y = delta.length();
        m.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          delta.normalize(),
        );
      });
      target.position.set(...current.target);
      const p = current.target;
      projection.geometry.setFromPoints([
        new THREE.Vector3(p[0], 0.005, p[2]),
        new THREE.Vector3(...p),
      ]);
      projection.computeLineDistances();
      trailGeometry.setFromPoints(
        current.trail.map((v) => new THREE.Vector3(...v)),
      );
      target.visible = current.engaged;
      projection.visible = current.engaged;
      orbit.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(draw);
    };
    draw();
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      orbit.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh || o instanceof THREE.Line) {
          o.geometry.dispose();
          const materials = Array.isArray(o.material)
            ? o.material
            : [o.material];
          materials.forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, [state]);
  return (
    <div className="arm-scene" ref={host}>
      <p ref={failure} hidden className="scene-error">
        3D rendering needs WebGL. Open this app in a current Chrome or Edge
        browser.
      </p>
    </div>
  );
}
