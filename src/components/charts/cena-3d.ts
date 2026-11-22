import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

/**
 * Cena 3D dos gráficos dos relatórios (three.js). Só é carregada pelo componente <Grafico3D>,
 * com import dinâmico, para o three.js não pesar nas outras telas.
 *
 * Grade x × z de colunas arredondadas, empilhadas por série (regional), com régua de valores na parede
 * do fundo, rótulos dos eixos, valor em cima das colunas do mês escolhido, anel pulsando no dia de hoje,
 * brilho no tema escuro e reflexo suave no tema claro.
 */

export type CamName = "iso" | "front" | "top";
export type SceneCell = { x: number; z: number; values: number[] };
export type SceneOpts = {
  xLabels: string[];
  zLabels: string[];
  cells: SceneCell[];
  highlightX: number | null;
  todayIndex: number | null;
  /** Altura da coluna mais alta. */
  maxH: number;
  /** Quantas linhas na régua (inclui o zero). */
  ticks: number;
  fmtTick: (v: number) => string;
  /** Contagens: arredonda o topo da régua para os degraus caírem em números inteiros. */
  integer?: boolean;
  /** Texto em cima de cada coluna do mês destacado (vazio = sem rótulo). */
  valueLabel?: (cell: number, hidden: Set<number>) => string;
  reduced: boolean;
  onHover: (cell: number | null, e: PointerEvent) => void;
  onSelect: (cell: number | null) => void;
  onSpin: (on: boolean) => void;
};
export type SceneApi = {
  setHidden(h: Set<number>): void;
  select(cell: number | null): void;
  goCam(name: CamName): void;
  setSpin(on: boolean): void;
  paint(): void;
  /** Canvas com o quadro atual (para a imagem PNG). */
  snapshot(): HTMLCanvasElement;
  dispose(): void;
};

const LBL = "pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 whitespace-nowrap text-[11px] tabular-nums";
const LBL_AXIS = `${LBL} text-muted-foreground`;
const LBL_HI = `${LBL} font-bold text-foreground`;
const LBL_TICK = `${LBL} text-[10px] text-muted-foreground/90`;
const LBL_VAL = `${LBL} rounded-md border bg-card/85 px-1.5 py-px font-bold text-foreground`;

const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
export const serieVar = (i: number) => `--serie-${(i % 8) + 1}`;

/** Lança erro se o computador não tiver WebGL (o componente cai para o 2D). */
export function createScene(el: HTMLElement, o: SceneOpts): SceneApi {
  const W = o.xLabels.length;
  const D = o.zLabels.length;
  const gap = 1.3;
  const cx = ((W - 1) * gap) / 2;
  const cz = ((D - 1) * gap) / 2;
  let hidden = new Set<number>();

  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.domElement.className = "block size-full cursor-grab outline-none active:cursor-grabbing";
  el.prepend(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envTex;
  const bgCanvas = document.createElement("canvas");
  bgCanvas.width = bgCanvas.height = 512;
  const bgTex = new THREE.CanvasTexture(bgCanvas);
  bgTex.colorSpace = THREE.SRGBColorSpace;
  scene.background = bgTex;

  const camera = new THREE.PerspectiveCamera(36, 1, 0.1, 300);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 7;
  controls.maxDistance = 46;
  controls.maxPolarAngle = Math.PI / 2.02;
  controls.autoRotateSpeed = 0.55;

  const hemi = new THREE.HemisphereLight(0xffffff, 0x222233, 0.65);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xffffff, 1.5);
  sun.position.set(7, 14, 9);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.radius = 6;
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0xffffff, 0.45);
  rim.position.set(-9, 7, -8);
  scene.add(rim);

  const floorW = W * gap + 1.6;
  const floorD = D * gap + 1.6;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(floorW, floorD), new THREE.MeshStandardMaterial({ roughness: 0.9 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const lineMat = new THREE.LineBasicMaterial({ transparent: true });
  const pts: number[] = [];
  for (let i = 0; i <= W; i++) {
    const x = i * gap - cx - gap / 2;
    pts.push(x, 0.003, -cz - gap / 2, x, 0.003, cz + gap / 2);
  }
  for (let j = 0; j <= D; j++) {
    const z = j * gap - cz - gap / 2;
    pts.push(-cx - gap / 2, 0.003, z, cx + gap / 2, 0.003, z);
  }
  const wallZ = -cz - gap / 2;
  for (let i = 0; i < o.ticks; i++) {
    const y = (i / (o.ticks - 1)) * o.maxH;
    pts.push(-cx - gap / 2, y, wallZ, cx + gap / 2, y, wallZ);
  }
  pts.push(-cx - gap / 2, 0, wallZ, -cx - gap / 2, o.maxH, wallZ, cx + gap / 2, 0, wallZ, cx + gap / 2, o.maxH, wallZ);
  const lineGeo = new THREE.BufferGeometry();
  lineGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.LineSegments(lineGeo, lineMat));
  const wall = new THREE.Mesh(new THREE.PlaneGeometry(floorW, o.maxH), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.25, depthWrite: false }));
  wall.position.set(0, o.maxH / 2, wallZ - 0.001);
  scene.add(wall);

  type Block = THREE.Mesh<RoundedBoxGeometry, THREE.MeshPhysicalMaterial> & {
    userData: { cell: number; s: number; v: number; h: number; y: number; base: number; target: number; targetY: number };
  };
  const geo = new RoundedBoxGeometry(0.86, 1, 0.86, 3, 0.06);
  geo.translate(0, 0.5, 0);
  const blocks: Block[] = [];
  const byCell: Block[][] = o.cells.map(() => []);
  const tops = o.cells.map(() => 0);
  o.cells.forEach((c, ci) => {
    c.values.forEach((v, s) => {
      if (!v) return;
      const m = new THREE.Mesh(geo, new THREE.MeshPhysicalMaterial({ clearcoat: 0.6, clearcoatRoughness: 0.25, transparent: true })) as unknown as Block;
      m.castShadow = true;
      m.receiveShadow = true;
      m.position.set(c.x * gap - cx, 0, c.z * gap - cz);
      m.scale.y = 0.0001;
      m.userData = { cell: ci, s, v, h: 0, y: 0, base: 0, target: 0, targetY: 0 };
      scene.add(m);
      blocks.push(m);
      byCell[ci].push(m);
    });
  });
  let ring: THREE.Mesh<THREE.RingGeometry, THREE.MeshBasicMaterial> | null = null;
  if (o.todayIndex != null) {
    const c = o.cells[o.todayIndex];
    ring = new THREE.Mesh(new THREE.RingGeometry(0.55, 0.63, 48), new THREE.MeshBasicMaterial({ transparent: true }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(c.x * gap - cx, 0.012, c.z * gap - cz);
    scene.add(ring);
  }

  // Rótulos: texto da página posicionado sobre o 3D (nítido em qualquer zoom).
  const labelEls: HTMLElement[] = [];
  const mk = (cls: string, text: string) => {
    const d = document.createElement("div");
    d.className = cls;
    d.dataset.lbl = "";
    d.textContent = text;
    el.appendChild(d);
    labelEls.push(d);
    return d;
  };
  type Lbl = { el: HTMLElement; pos: THREE.Vector3 };
  const axisLabels: Lbl[] = [
    ...o.xLabels.map((t, x) => ({ el: mk(x === o.highlightX ? LBL_HI : LBL_AXIS, t), pos: new THREE.Vector3(x * gap - cx, 0, cz + gap * 0.95) })),
    ...o.zLabels.map((t, z) => ({ el: mk(LBL_AXIS, t), pos: new THREE.Vector3(-cx - gap * 1.05, 0, z * gap - cz) })),
  ];
  const tickLabels: Lbl[] = Array.from({ length: o.ticks }, (_, i) => ({ el: mk(LBL_TICK, ""), pos: new THREE.Vector3(cx + gap * 0.95, (i / (o.ticks - 1)) * o.maxH, wallZ) }));
  const valueLabels = o.valueLabel
    ? o.cells.flatMap((c, ci) => (c.x === o.highlightX ? [{ ci, el: mk(LBL_VAL, ""), pos: new THREE.Vector3(c.x * gap - cx, 0, c.z * gap - cz) }] : []))
    : [];

  function layout() {
    const vis = (c: SceneCell) => c.values.reduce((t, v, s) => t + (hidden.has(s) ? 0 : v), 0);
    const raw = Math.max(1, ...o.cells.map(vis));
    const steps = o.ticks - 1;
    const max = o.integer ? Math.ceil(raw / steps) * steps : raw;
    o.cells.forEach((c, ci) => {
      let y = 0;
      for (const b of byCell[ci]) {
        const h = hidden.has(b.userData.s) ? 0 : (b.userData.v / max) * o.maxH;
        b.userData.targetY = y;
        b.userData.target = h;
        y += h;
      }
      tops[ci] = y;
    });
    tickLabels.forEach((t, i) => (t.el.textContent = o.fmtTick((i / (o.ticks - 1)) * max)));
  }

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.55, 0.6, 0.32);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let hoverCell: number | null = null;
  let selected: number | null = null;
  function glow() {
    for (const b of blocks) b.material.emissiveIntensity = b.userData.cell === hoverCell || b.userData.cell === selected ? 1.1 : b.userData.base;
  }

  function paint() {
    const dark = document.documentElement.classList.contains("dark");
    // Claro: sem correção de luz, sem brilho (o fundo branco "vaza" e lava as cores), menos metal e mais reflexo suave.
    renderer.toneMapping = dark ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
    hemi.intensity = dark ? 0.65 : 0.35;
    sun.intensity = dark ? 1.5 : 1.6;
    scene.environmentIntensity = dark ? 0.12 : 0.9;
    const g = bgCanvas.getContext("2d")!;
    const grad = g.createRadialGradient(256, 200, 20, 256, 256, 400);
    grad.addColorStop(0, dark ? "#1d1d24" : "#ffffff");
    grad.addColorStop(1, dark ? css("--card") : "#e9ebf2");
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    bgTex.needsUpdate = true;
    floor.material.color.set(dark ? 0x0f0f13 : 0xf3f4f8);
    wall.material.color.set(css("--card")).lerp(new THREE.Color(css("--border")), 0.5);
    lineMat.color.set(css("--border"));
    if (ring) ring.material.color.set(css("--primary"));
    for (const b of blocks) {
      const col = new THREE.Color(css(serieVar(b.userData.s)));
      const on = o.highlightX == null || o.cells[b.userData.cell].x === o.highlightX;
      b.material.color.copy(col);
      b.material.emissive.copy(col);
      b.material.metalness = dark ? 0.35 : 0.1;
      b.material.roughness = dark ? 0.28 : 0.32;
      b.material.clearcoat = dark ? 0.15 : 0.6;
      b.userData.base = on ? (dark ? 0.26 : 0.16) : dark ? 0.05 : 0.04;
      b.material.opacity = on ? (dark ? 0.97 : 1) : dark ? 0.38 : 0.75;
    }
    glow();
    bloom.enabled = dark;
  }
  paint();
  layout();

  const target = new THREE.Vector3(0, o.maxH * 0.32, 0);
  const R = Math.max(W, D) * gap;
  const CAMS: Record<CamName, THREE.Vector3> = {
    iso: new THREE.Vector3(R * 0.95, R * 0.72 + 3, R * 1.05 + 4),
    front: new THREE.Vector3(0, o.maxH * 0.55, R * 1.35 + 4),
    top: new THREE.Vector3(0.001, R * 1.55 + 6, 0.6),
  };
  camera.position.copy(CAMS.iso);
  controls.target.copy(target);
  let tween: { from: THREE.Vector3; to: THREE.Vector3; t0: number; dur: number } | null = null;
  function setSpin(on: boolean) {
    controls.autoRotate = on;
    o.onSpin(on);
  }
  setSpin(!o.reduced);

  const ray = new THREE.Raycaster();
  const mouse = new THREE.Vector2();
  function pick(e: PointerEvent) {
    const r = renderer.domElement.getBoundingClientRect();
    mouse.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(mouse, camera);
    const hit = ray.intersectObjects(blocks.filter((b) => b.userData.target > 0), false)[0]?.object as Block | undefined;
    return hit ? hit.userData.cell : null;
  }
  const cv = renderer.domElement;
  const onMove = (e: PointerEvent) => {
    hoverCell = pick(e);
    cv.style.cursor = hoverCell == null ? "" : "pointer";
    glow();
    o.onHover(hoverCell, e);
  };
  const onLeave = (e: PointerEvent) => {
    hoverCell = null;
    glow();
    o.onHover(null, e);
  };
  let downAt: [number, number] | null = null;
  const onDown = (e: PointerEvent) => {
    downAt = [e.clientX, e.clientY];
    setSpin(false);
  };
  const onUp = (e: PointerEvent) => {
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 4) return;
    selected = pick(e);
    glow();
    o.onSelect(selected);
  };
  const onWheel = () => setSpin(false);
  cv.addEventListener("pointermove", onMove);
  cv.addEventListener("pointerleave", onLeave);
  cv.addEventListener("pointerdown", onDown);
  cv.addEventListener("pointerup", onUp);
  cv.addEventListener("wheel", onWheel, { passive: true });

  function resize() {
    const w = el.clientWidth;
    const h = el.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  const ro = new ResizeObserver(resize);
  ro.observe(el);
  resize();

  const v = new THREE.Vector3();
  const place = (l: Lbl, y = 0) => {
    v.copy(l.pos);
    v.y += y;
    v.project(camera);
    l.el.style.left = ((v.x + 1) / 2) * el.clientWidth + "px";
    l.el.style.top = ((1 - v.y) / 2) * el.clientHeight + "px";
    l.el.style.display = v.z < 1 ? "" : "none";
  };
  let raf = 0;
  const loop = (now: number) => {
    raf = requestAnimationFrame(loop);
    if (!el.offsetParent) return;
    const k = o.reduced ? 1 : 0.12;
    for (const b of blocks) {
      const u = b.userData;
      u.h += (u.target - u.h) * k;
      u.y += (u.targetY - u.y) * k;
      b.scale.y = Math.max(0.0001, u.h);
      b.position.y = u.y;
      b.visible = u.h > 0.002;
    }
    if (tween) {
      const p = Math.min(1, (now - tween.t0) / tween.dur);
      camera.position.lerpVectors(tween.from, tween.to, 1 - Math.pow(1 - p, 3));
      if (p >= 1) tween = null;
    }
    if (ring) ring.material.opacity = 0.55 + 0.45 * Math.sin(now / 400);
    controls.update();
    composer.render();
    axisLabels.forEach((l) => place(l));
    tickLabels.forEach((l) => place(l));
    for (const l of valueLabels) {
      l.el.textContent = o.valueLabel!(l.ci, hidden);
      place(l, tops[l.ci] + 0.45);
      l.el.style.visibility = tops[l.ci] > 0.01 && l.el.textContent ? "visible" : "hidden";
    }
  };
  raf = requestAnimationFrame(loop);

  return {
    setHidden(h) {
      hidden = new Set(h);
      layout();
    },
    select(c) {
      selected = c;
      glow();
    },
    goCam(name) {
      setSpin(false);
      tween = { from: camera.position.clone(), to: CAMS[name].clone(), t0: performance.now(), dur: o.reduced ? 1 : 900 };
    },
    setSpin,
    paint,
    snapshot() {
      composer.render();
      return renderer.domElement;
    },
    dispose() {
      cancelAnimationFrame(raf);
      ro.disconnect();
      cv.removeEventListener("pointermove", onMove);
      cv.removeEventListener("pointerleave", onLeave);
      cv.removeEventListener("pointerdown", onDown);
      cv.removeEventListener("pointerup", onUp);
      cv.removeEventListener("wheel", onWheel);
      controls.dispose();
      for (const b of blocks) b.material.dispose();
      ring?.geometry.dispose();
      ring?.material.dispose();
      geo.dispose();
      lineGeo.dispose();
      lineMat.dispose();
      floor.geometry.dispose();
      floor.material.dispose();
      wall.geometry.dispose();
      wall.material.dispose();
      bgTex.dispose();
      envTex.dispose();
      pmrem.dispose();
      composer.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      cv.remove();
      labelEls.forEach((l) => l.remove());
    },
  };
}
