import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type D20RollPhase = 'idle' | 'rolling' | 'landed';

interface D20ThreeCanvasProps {
  rollTrigger: number;
  targetFace: number | null;
  phase: D20RollPhase;
  surfaceHex: string;
  textHex: string;
  accentHex: string;
  canvasBgHex: string;
  isDark: boolean;
  onDieClick: () => void;
  onRollSettled: (face: number) => void;
}

interface AtlasPalette {
  surfaceHex: string;
  textHex: string;
  accentHex: string;
  isDark: boolean;
}

const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _vecC = new THREE.Vector3();
const _centroid = new THREE.Vector3();
const _normal = new THREE.Vector3();
const _upDir = new THREE.Vector3();
const _rightDir = new THREE.Vector3();
const _edgeAB = new THREE.Vector3();
const _edgeAC = new THREE.Vector3();
const _tempEuler = new THREE.Euler();
const _deltaQuat = new THREE.Quaternion();
const _spinAxis = new THREE.Vector3(0.45, 0.85, 0.25).normalize();

function detectSoftwareWebGL(): boolean {
  try {
    const probeCanvas = document.createElement('canvas');
    const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    const grad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0, 0, 0, 0.62)');
    grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.22)');
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}

function drawD20AtlasTexture(
  palette: AtlasPalette,
  existingCanvas?: HTMLCanvasElement
): HTMLCanvasElement {
  const cols = 5;
  const rows = 4;
  const cellW = 256;
  const cellH = 256;
  const canvas = existingCanvas || document.createElement('canvas');
  canvas.width = cols * cellW;
  canvas.height = rows * cellH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  const faceFill = palette.isDark ? '#141418' : '#F4F4F6';
  const bevelFill = palette.isDark ? '#2A2A32' : '#D4D4D8';
  const numeralColor = palette.isDark ? '#FAFAFA' : '#09090B';
  const numeralStroke = palette.isDark ? '#09090B' : '#FFFFFF';

  ctx.fillStyle = faceFill;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (let f = 0; f < 20; f++) {
    const num = f + 1;
    const col = f % cols;
    const row = Math.floor(f / cols);
    const cx = col * cellW + cellW / 2;
    const cy = row * cellH + cellH / 2;

    // Subtle inset facet bevel matching equilateral triangle orientation
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(cx, cy - 102);
    ctx.lineTo(cx + 89, cy + 54);
    ctx.lineTo(cx - 89, cy + 54);
    ctx.closePath();
    ctx.fillStyle = faceFill;
    ctx.fill();
    ctx.lineWidth = 4;
    ctx.strokeStyle = bevelFill;
    ctx.stroke();

    // Engraved crisp numeral with contrasting stroke halo so front specular glare never washes it out
    ctx.font = '800 68px "Cinzel", Georgia, serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    ctx.lineWidth = 9;
    ctx.strokeStyle = numeralStroke;
    ctx.strokeText(String(num), cx, cy + 4);
    ctx.fillStyle = numeralColor;
    ctx.fillText(String(num), cx, cy + 4);

    // Unambiguous underline marker for 6 and 9
    if (num === 6 || num === 9) {
      ctx.fillStyle = numeralStroke;
      ctx.fillRect(cx - 16, cy + 37, 32, 6);
      ctx.fillStyle = numeralColor;
      ctx.fillRect(cx - 14, cy + 38, 28, 4);
    }
    ctx.restore();
  }

  return canvas;
}

function buildD20GeometryAndTargets(
  radius: number,
  cameraPos: THREE.Vector3
): {
  geometry: THREE.BufferGeometry;
  targetQuats: THREE.Quaternion[];
  uniqueVertices: THREE.Vector3[];
} {
  const geometry = new THREE.IcosahedronGeometry(radius, 0);
  const posAttr = geometry.getAttribute('position') as THREE.BufferAttribute;
  const faceCount = Math.floor(posAttr.count / 3);
  const uvArray = new Float32Array(posAttr.count * 2);

  // Camera view basis (die center is at origin; camera sits at cameraPos)
  const zCam = cameraPos.clone().normalize();
  const worldUp = new THREE.Vector3(0, 1, 0);
  const xCam = new THREE.Vector3().crossVectors(worldUp, zCam).normalize();
  const yCam = new THREE.Vector3().crossVectors(zCam, xCam).normalize();
  const mCam = new THREE.Matrix4().makeBasis(xCam, yCam, zCam);
  const mFace = new THREE.Matrix4();
  const mRot = new THREE.Matrix4();

  const targetQuats: THREE.Quaternion[] = [];
  const uniqueVertices: THREE.Vector3[] = [];

  for (let i = 0; i < posAttr.count; i++) {
    const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
    if (!uniqueVertices.some((uv) => uv.distanceToSquared(v) < 1e-4)) {
      uniqueVertices.push(v);
    }
  }

  const cols = 5;
  const rows = 4;

  for (let f = 0; f < faceCount; f++) {
    const i0 = f * 3;
    const i1 = f * 3 + 1;
    const i2 = f * 3 + 2;

    _vecA.fromBufferAttribute(posAttr, i0);
    _vecB.fromBufferAttribute(posAttr, i1);
    _vecC.fromBufferAttribute(posAttr, i2);

    _centroid.copy(_vecA).add(_vecB).add(_vecC).divideScalar(3);

    _edgeAB.subVectors(_vecB, _vecA);
    _edgeAC.subVectors(_vecC, _vecA);
    _normal.crossVectors(_edgeAB, _edgeAC).normalize();
    if (_normal.dot(_centroid) < 0) {
      _normal.negate();
    }

    // Pick a stable upright direction on this face pointing toward the vertex furthest along +Y (or +Z tiebreak)
    const verts = [_vecA, _vecB, _vecC];
    let topVert = verts[0];
    for (const v of verts) {
      if (v.y > topVert.y + 1e-4 || (Math.abs(v.y - topVert.y) <= 1e-4 && v.z > topVert.z)) {
        topVert = v;
      }
    }

    _upDir.subVectors(topVert, _centroid).normalize();
    _rightDir.crossVectors(_upDir, _normal).normalize();
    _upDir.crossVectors(_normal, _rightDir).normalize();

    const col = f % cols;
    const row = Math.floor(f / cols);
    const uCenter = (col + 0.5) / cols;
    const vCenter = 1 - (row + 0.5) / rows;
    const maxR = Math.max(
      _vecA.distanceTo(_centroid),
      _vecB.distanceTo(_centroid),
      _vecC.distanceTo(_centroid)
    );
    // Match triangle apex in canvas cell (cy - 102px out of 256px cell => 0.398 of cell height)
    const uvScaleU = (0.398 / cols) / maxR;
    const uvScaleV = (0.398 / rows) / maxR;

    const faceVerts = [_vecA, _vecB, _vecC];
    for (let k = 0; k < 3; k++) {
      const rel = faceVerts[k].clone().sub(_centroid);
      const lx = rel.dot(_rightDir);
      const ly = rel.dot(_upDir);
      const vIdx = (i0 + k) * 2;
      uvArray[vIdx] = uCenter + lx * uvScaleU;
      uvArray[vIdx + 1] = vCenter + ly * uvScaleV;
    }

    mFace.makeBasis(_rightDir.clone(), _upDir.clone(), _normal.clone());
    mRot.multiplyMatrices(mCam, mFace.clone().transpose());
    targetQuats.push(new THREE.Quaternion().setFromRotationMatrix(mRot));
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uvArray, 2));
  return { geometry, targetQuats, uniqueVertices };
}

export const D20ThreeCanvas: React.FC<D20ThreeCanvasProps> = ({
  rollTrigger,
  targetFace,
  phase,
  surfaceHex,
  textHex,
  accentHex,
  canvasBgHex,
  isDark,
  onDieClick,
  onRollSettled,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const [webglUnavailable, setWebglUnavailable] = useState(false);

  const onDieClickRef = useRef(onDieClick);
  const onRollSettledRef = useRef(onRollSettled);
  onDieClickRef.current = onDieClick;
  onRollSettledRef.current = onRollSettled;

  const sceneRefs = useRef<{
    scene?: THREE.Scene;
    renderer?: THREE.WebGLRenderer;
    atlasCanvas?: HTMLCanvasElement;
    atlasTexture?: THREE.CanvasTexture;
    trayMat?: THREE.MeshStandardMaterial;
    rimMat?: THREE.MeshStandardMaterial;
    edgeMat?: THREE.LineBasicMaterial;
    studMat?: THREE.MeshStandardMaterial;
    dieGroup?: THREE.Group;
    targetQuats: THREE.Quaternion[];
    startRoll?: (face: number) => void;
    requestRender?: () => void;
    setColors?: (palette: {
      canvasBgHex: string;
      surfaceHex: string;
      textHex: string;
      accentHex: string;
      isDark: boolean;
    }) => void;
  }>({ targetQuats: [] });

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const isSoftwareGl = detectSoftwareWebGL();
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        alpha: false,
        powerPreference: 'high-performance',
      });
    } catch {
      setWebglUnavailable(true);
      return;
    }

    const width = Math.max(container.clientWidth || 480, 260);
    const height = Math.max(container.clientHeight || 360, 260);

    renderer.setSize(width, height);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.08;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    renderer.domElement.style.display = 'block';
    renderer.domElement.style.width = '100%';
    renderer.domElement.style.height = '100%';
    renderer.domElement.style.cursor = 'pointer';
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const bgColor = new THREE.Color(canvasBgHex || (isDark ? '#09090B' : '#FAFAFA'));
    scene.background = bgColor;
    scene.fog = new THREE.FogExp2(bgColor.getHex(), 0.045);

    const cameraPos = new THREE.Vector3(0, 1.55, 5.55);
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 40);
    camera.position.copy(cameraPos);
    camera.lookAt(0, -0.18, 0);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const envTex = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = envTex;
    pmremGenerator.dispose();

    // 3-Point Studio Lighting Rig (angled to avoid frontal specular blowout on landed numeral)
    const hemiLight = new THREE.HemisphereLight(0xfafafa, 0x27272a, 0.72);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff4e6, 1.32);
    keyLight.position.set(4.6, 6.8, 3.2);
    if (!isSoftwareGl) {
      keyLight.castShadow = true;
      keyLight.shadow.mapSize.set(1024, 1024);
      keyLight.shadow.camera.near = 1;
      keyLight.shadow.camera.far = 16;
      keyLight.shadow.camera.left = -3.2;
      keyLight.shadow.camera.right = 3.2;
      keyLight.shadow.camera.top = 3.2;
      keyLight.shadow.camera.bottom = -3.2;
      keyLight.shadow.bias = -0.0005;
      keyLight.shadow.normalBias = 0.02;
    }
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.75);
    rimLight.position.set(-4.2, 2.5, -4.0);
    scene.add(rimLight);

    // Composite Hero Group 1: The d20 Die (Core + Metallic Edge Cage + 12 Corner Vertex Studs)
    const dieGroup = new THREE.Group();
    dieGroup.position.set(0, 0.12, 0);
    scene.add(dieGroup);

    const { geometry: d20Geo, targetQuats, uniqueVertices } = buildD20GeometryAndTargets(
      1.12,
      cameraPos
    );

    const atlasCanvas = drawD20AtlasTexture({
      surfaceHex,
      textHex,
      accentHex,
      isDark,
    });
    const atlasTexture = new THREE.CanvasTexture(atlasCanvas);
    atlasTexture.colorSpace = THREE.SRGBColorSpace;
    atlasTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    atlasTexture.needsUpdate = true;

    const dieMat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      map: atlasTexture,
      roughness: 0.64,
      metalness: 0.06,
      clearcoat: 0.22,
      clearcoatRoughness: 0.48,
      envMapIntensity: 0.45,
    });

    const dieMesh = new THREE.Mesh(d20Geo, dieMat);
    dieMesh.castShadow = !isSoftwareGl;
    dieMesh.receiveShadow = !isSoftwareGl;
    dieGroup.add(dieMesh);

    const edgesGeo = new THREE.EdgesGeometry(d20Geo);
    const edgeMat = new THREE.LineBasicMaterial({
      color: isDark ? 0xa1a1aa : 0x18181b,
      transparent: true,
      opacity: 0.76,
    });
    const edgeLines = new THREE.LineSegments(edgesGeo, edgeMat);
    edgeLines.scale.setScalar(1.003);
    dieGroup.add(edgeLines);

    const studGeo = new THREE.SphereGeometry(0.052, 10, 8);
    const studMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0xe4e4e7 : 0x18181b,
      metalness: 0.88,
      roughness: 0.2,
    });
    const studInstances = new THREE.InstancedMesh(studGeo, studMat, uniqueVertices.length);
    const dummyMat4 = new THREE.Matrix4();
    uniqueVertices.forEach((v, idx) => {
      dummyMat4.makeTranslation(v.x * 1.002, v.y * 1.002, v.z * 1.002);
      studInstances.setMatrixAt(idx, dummyMat4);
    });
    studInstances.instanceMatrix.needsUpdate = true;
    studInstances.computeBoundingSphere();
    dieGroup.add(studInstances);

    // Start angled cleanly showing face 20 upright-adjacent
    dieGroup.quaternion.copy(targetQuats[19]);

    // Grounded Rolling Pedestal Tray + Metallic Rim + Radial Contact Shadow Disc
    const trayGroup = new THREE.Group();
    trayGroup.position.set(0, -1.36, 0);
    scene.add(trayGroup);

    const trayGeo = new THREE.CylinderGeometry(1.88, 1.98, 0.14, 48);
    const trayMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x121216 : 0xe4e4e7,
      roughness: 0.86,
      metalness: 0.08,
    });
    const trayDisc = new THREE.Mesh(trayGeo, trayMat);
    trayDisc.receiveShadow = !isSoftwareGl;
    trayGroup.add(trayDisc);

    const rimGeo = new THREE.TorusGeometry(1.91, 0.062, 16, 64);
    const rimMat = new THREE.MeshStandardMaterial({
      color: isDark ? 0x52525b : 0x27272a,
      roughness: 0.24,
      metalness: 0.84,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.rotation.x = Math.PI / 2;
    rimMesh.position.y = 0.07;
    trayGroup.add(rimMesh);

    const shadowTex = createContactShadowTexture();
    const shadowGeo = new THREE.CircleGeometry(1.55, 32);
    const shadowMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
    contactShadow.rotation.x = -Math.PI / 2;
    contactShadow.position.y = 0.098;
    trayGroup.add(contactShadow);

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Animation state inside effect (zero React re-renders at 60Hz)
    let animMode: 'idle' | 'rolling' | 'landed' = phase === 'landed' ? 'landed' : 'idle';
    let rollElapsed = 0;
    const rollDuration = 1.25;
    let rollTargetFace = 20;
    const startQuat = new THREE.Quaternion().copy(dieGroup.quaternion);
    const midQuat = new THREE.Quaternion();
    let lastTimestamp = performance.now();
    let frameId = 0;
    let disposed = false;
    let renderBusy = false;
    let renderDirty = false;

    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    function afterDraw(cb: () => void) {
      if (disposed) return;
      const gl = renderer.getContext() as WebGL2RenderingContext;
      if (!gl || typeof gl.fenceSync !== 'function') {
        frameId = window.setTimeout(cb, 80);
        return;
      }
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function requestRender() {
      if (disposed) return;
      if (renderBusy) {
        renderDirty = true;
        return;
      }
      renderBusy = true;
      frameId = requestAnimationFrame(() => {
        if (disposed) return;
        renderDirty = false;
        renderer.render(scene, camera);
        const done = () => {
          renderBusy = false;
          if (renderDirty && !disposed) requestRender();
        };
        if (isSoftwareGl) afterDraw(done);
        else done();
      });
    }

    function stepAndSchedule(now: number) {
      if (disposed) return;
      const dt = Math.min(0.05, Math.max(0.001, (now - lastTimestamp) / 1000));
      lastTimestamp = now;

      if (animMode === 'idle') {
        if (!prefersReducedMotion) {
          _deltaQuat.setFromAxisAngle(_spinAxis, dt * 0.55);
          dieGroup.quaternion.premultiply(_deltaQuat).normalize();
          dieGroup.position.y = 0.15 + Math.sin(now * 0.0022) * 0.065;
          const shadowScale = 1 - Math.sin(now * 0.0022) * 0.06;
          contactShadow.scale.setScalar(shadowScale);
        }
        renderer.render(scene, camera);
        if (isSoftwareGl) afterDraw(() => stepAndSchedule(performance.now()));
        else frameId = requestAnimationFrame(stepAndSchedule);
        return;
      }

      if (animMode === 'rolling') {
        rollElapsed += dt;
        const t = Math.min(1, rollElapsed / rollDuration);

        // Bounce trajectory onto the rolling tray and back to center display hover
        const bounce = Math.abs(Math.sin(t * Math.PI * 2.5)) * (1 - t) * 0.95;
        dieGroup.position.y = -0.18 + bounce + t * 0.24;
        dieGroup.position.x = Math.sin(t * Math.PI * 3) * (1 - t) * 0.42;
        contactShadow.scale.setScalar(1.08 - bounce * 0.25);

        if (t < 0.55) {
          // High-speed physical tumble phase
          const spinSpeed = (1 - t * 0.6) * 14;
          _tempEuler.set(dt * spinSpeed, dt * spinSpeed * 1.25, dt * spinSpeed * 0.85);
          _deltaQuat.setFromEuler(_tempEuler);
          dieGroup.quaternion.premultiply(_deltaQuat).normalize();
          midQuat.copy(dieGroup.quaternion);
        } else {
          // Smooth quaternion slerp landing on the exact rolled face facing camera
          const settleT = (t - 0.55) / 0.45;
          const eased = 1 - Math.pow(1 - settleT, 3);
          const targetQ = targetQuats[Math.max(0, Math.min(19, rollTargetFace - 1))];
          dieGroup.quaternion.copy(midQuat).slerp(targetQ, eased);
        }

        renderer.render(scene, camera);

        if (t >= 1) {
          animMode = 'landed';
          const finalQ = targetQuats[Math.max(0, Math.min(19, rollTargetFace - 1))];
          dieGroup.quaternion.copy(finalQ);
          dieGroup.position.set(0, 0.06, 0);
          contactShadow.scale.setScalar(1);
          renderer.render(scene, camera);
          onRollSettledRef.current(rollTargetFace);
          return;
        }

        if (isSoftwareGl) afterDraw(() => stepAndSchedule(performance.now()));
        else frameId = requestAnimationFrame(stepAndSchedule);
        return;
      }

      // Landed: render on demand cleanly
      renderer.render(scene, camera);
    }

    const startRoll = (face: number) => {
      window.clearTimeout(frameId);
      cancelAnimationFrame(frameId);
      rollTargetFace = Math.max(1, Math.min(20, Math.round(face)));

      if (prefersReducedMotion) {
        animMode = 'landed';
        dieGroup.quaternion.copy(targetQuats[rollTargetFace - 1]);
        dieGroup.position.set(0, 0.06, 0);
        requestRender();
        onRollSettledRef.current(rollTargetFace);
        return;
      }

      startQuat.copy(dieGroup.quaternion);
      midQuat.copy(dieGroup.quaternion);
      rollElapsed = 0;
      animMode = 'rolling';
      lastTimestamp = performance.now();
      stepAndSchedule(lastTimestamp);
    };

    const handleResize = () => {
      if (!container || disposed) return;
      const nextW = Math.max(container.clientWidth || 480, 260);
      const nextH = Math.max(container.clientHeight || 360, 260);
      camera.aspect = nextW / nextH;
      camera.updateProjectionMatrix();
      renderer.setSize(nextW, nextH);
      requestRender();
    };

    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(container);

    const handleContextLost = (e: Event) => {
      e.preventDefault();
      setWebglUnavailable(true);
    };
    const handleContextRestored = () => {
      setWebglUnavailable(false);
      requestRender();
    };
    renderer.domElement.addEventListener('webglcontextlost', handleContextLost);
    renderer.domElement.addEventListener('webglcontextrestored', handleContextRestored);

    const handleCanvasClick = () => {
      onDieClickRef.current();
    };
    renderer.domElement.addEventListener('click', handleCanvasClick);

    sceneRefs.current = {
      scene,
      renderer,
      atlasCanvas,
      atlasTexture,
      trayMat,
      rimMat,
      edgeMat,
      studMat,
      dieGroup,
      targetQuats,
      startRoll,
      requestRender,
      setColors: (nextPalette) => {
        const nextBg = new THREE.Color(nextPalette.canvasBgHex);
        scene.background = nextBg;
        if (scene.fog instanceof THREE.FogExp2) {
          scene.fog.color.copy(nextBg);
        }
        drawD20AtlasTexture(nextPalette, atlasCanvas);
        atlasTexture.needsUpdate = true;
        trayMat.color.setHex(nextPalette.isDark ? 0x121216 : 0xe4e4e7);
        rimMat.color.setHex(nextPalette.isDark ? 0x52525b : 0x27272a);
        edgeMat.color.setHex(nextPalette.isDark ? 0xa1a1aa : 0x27272a);
        studMat.color.setHex(nextPalette.isDark ? 0xe4e4e7 : 0x18181b);
        requestRender();
      },
    };

    // Start gentle idle showcase loop
    stepAndSchedule(performance.now());

    return () => {
      disposed = true;
      window.clearTimeout(frameId);
      cancelAnimationFrame(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('click', handleCanvasClick);
      renderer.domElement.removeEventListener('webglcontextlost', handleContextLost);
      renderer.domElement.removeEventListener('webglcontextrestored', handleContextRestored);
      d20Geo.dispose();
      edgesGeo.dispose();
      studGeo.dispose();
      trayGeo.dispose();
      rimGeo.dispose();
      shadowGeo.dispose();
      dieMat.dispose();
      edgeMat.dispose();
      studMat.dispose();
      trayMat.dispose();
      rimMat.dispose();
      shadowMat.dispose();
      atlasTexture.dispose();
      shadowTex.dispose();
      envTex.dispose();
      renderer.dispose();
      container.innerHTML = '';
    };
  }, []);

  // Sync theme colors dynamically without recreating WebGL context
  useEffect(() => {
    sceneRefs.current.setColors?.({
      canvasBgHex,
      surfaceHex,
      textHex,
      accentHex,
      isDark,
    });
  }, [canvasBgHex, surfaceHex, textHex, accentHex, isDark]);

  // Trigger physical 3D roll when rollTrigger increments
  useEffect(() => {
    if (rollTrigger > 0 && targetFace !== null) {
      sceneRefs.current.startRoll?.(targetFace);
    }
  }, [rollTrigger, targetFace]);

  if (webglUnavailable) {
    return (
      <button
        type="button"
        onClick={onDieClick}
        data-testid="d20-3d-fallback"
        aria-label="Rolar d20"
        className="w-full h-full min-h-[280px] rounded-2xl border border-[var(--border-subtle)] bg-[var(--bg-elevated)] flex flex-col items-center justify-center gap-3 p-6 text-center cursor-pointer"
      >
        <div className="w-28 h-28 rounded-2xl border-2 border-[var(--accent-color)] bg-[var(--bg-surface)] flex items-center justify-center font-display text-4xl font-bold text-[var(--text-primary)]">
          {targetFace ?? 20}
        </div>
        <span className="text-xs text-[var(--text-muted)]">
          Toque para rolar o dado d20
        </span>
      </button>
    );
  }

  return (
    <div
      ref={mountRef}
      data-testid="d20-3d-canvas-container"
      data-roll-state={phase}
      data-rolled-face={targetFace ?? ''}
      aria-label="Dado d20 3D interativo — clique para rolar"
      className="w-full h-full min-h-[280px] sm:min-h-[340px] rounded-2xl overflow-hidden select-none"
    />
  );
};
