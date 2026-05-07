"use client";

import { Canvas, useThree } from "@react-three/fiber";
import { Bounds, Grid, OrbitControls, TransformControls } from "@react-three/drei";
import { Download, Move3D, RotateCcw, Sparkles, UploadCloud } from "lucide-react";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { STLExporter } from "three-stdlib";
import { ADDITION, Brush, Evaluator, SUBTRACTION } from "three-bvh-csg";
import { acceleratedRaycast, computeBoundsTree, disposeBoundsTree } from "three-mesh-bvh";

const LAMBDA = 0.5;
const MU = -0.53;
const CSG_MATERIAL = new THREE.MeshStandardMaterial({ color: "#d2d7dc", roughness: 0.58 });

if (typeof window !== "undefined" && !THREE.BufferGeometry.prototype.computeBoundsTree) {
  THREE.BufferGeometry.prototype.computeBoundsTree = computeBoundsTree;
  THREE.BufferGeometry.prototype.disposeBoundsTree = disposeBoundsTree;
  THREE.Mesh.prototype.raycast = acceleratedRaycast;
}

function createMountGeometries() {
  const material = new THREE.MeshStandardMaterial({
    color: "#d2d7dc",
    roughness: 0.62,
    metalness: 0.12
  });

  const hookMaterial = new THREE.MeshStandardMaterial({
    color: "#9aa4ad",
    roughness: 0.55,
    metalness: 0.22
  });

  const plate = new THREE.BoxGeometry(120, 8, 84);
  const hookStem = new THREE.BoxGeometry(5, 18, 22);
  const hookLip = new THREE.BoxGeometry(5, 16, 5);
  const hookCap = new THREE.CylinderGeometry(2.5, 2.5, 18, 24);
  hookCap.rotateX(Math.PI / 2);

  return { plate, hookStem, hookLip, hookCap, material, hookMaterial };
}

function Mount({ mountRef }) {
  const assets = useMemo(createMountGeometries, []);

  return (
    <group ref={mountRef} position={[0, 0, 0]}>
      <mesh geometry={assets.plate} material={assets.material} castShadow receiveShadow />
      {[-32, 32].map((x) => (
        <group key={x} position={[x, -12, 0]}>
          <mesh geometry={assets.hookStem} material={assets.hookMaterial} position={[0, 0, 22]} castShadow />
          <mesh geometry={assets.hookLip} material={assets.hookMaterial} position={[0, -9, 32]} castShadow />
          <mesh geometry={assets.hookCap} material={assets.hookMaterial} position={[0, -9, 35]} castShadow />
        </group>
      ))}
    </group>
  );
}

function SceneLighting() {
  return (
    <>
      <ambientLight intensity={0.55} />
      <directionalLight position={[120, 160, 90]} intensity={1.25} castShadow />
      <pointLight position={[-90, 80, -80]} intensity={0.55} color="#6bd1c0" />
    </>
  );
}

function CameraHome({ hasScan }) {
  const { camera } = useThree();

  useEffect(() => {
    camera.position.set(155, 130, 165);
    camera.lookAt(0, 0, 0);
  }, [camera]);

  return hasScan ? <Bounds fit clip observe margin={1.4} /> : null;
}

function MoldBlockPreview({ visible }) {
  if (!visible) return null;

  return (
    <mesh position={[0, 20, 0]}>
      <boxGeometry args={[126, 34, 90]} />
      <meshStandardMaterial color="#f5c84b" transparent opacity={0.14} roughness={0.65} />
    </mesh>
  );
}

function ThreeViewport({ scanGeometry, mode, scanRef, mountRef, exportMode }) {
  return (
    <Canvas shadows camera={{ position: [155, 130, 165], fov: 46 }} gl={{ antialias: true }}>
      <color attach="background" args={["#0f1217"]} />
      <Suspense fallback={null}>
        <SceneLighting />
        <Grid
          args={[260, 26]}
          position={[0, -44, 0]}
          cellColor="#38404a"
          sectionColor="#6bd1c0"
          fadeDistance={360}
          fadeStrength={1.4}
        />
        <Mount mountRef={mountRef} />
        <MoldBlockPreview visible={exportMode === "negative"} />
        {scanGeometry && (
          <TransformControls mode={mode} translationSnap={2.5} rotationSnap={THREE.MathUtils.degToRad(5)}>
            <group ref={scanRef} position={[0, 26, 0]}>
              <mesh geometry={scanGeometry} castShadow receiveShadow>
                <meshStandardMaterial color="#69d0be" roughness={0.48} metalness={0.05} />
              </mesh>
            </group>
          </TransformControls>
        )}
        <OrbitControls makeDefault enableDamping dampingFactor={0.08} />
        <CameraHome hasScan={Boolean(scanGeometry)} />
      </Suspense>
    </Canvas>
  );
}

function buildNeighbors(geometry) {
  const position = geometry.attributes.position;
  const vertexCount = position.count;
  const neighbors = Array.from({ length: vertexCount }, () => new Set());
  const index = geometry.index?.array;

  const connect = (a, b, c) => {
    neighbors[a].add(b);
    neighbors[a].add(c);
    neighbors[b].add(a);
    neighbors[b].add(c);
    neighbors[c].add(a);
    neighbors[c].add(b);
  };

  if (index) {
    for (let i = 0; i < index.length; i += 3) connect(index[i], index[i + 1], index[i + 2]);
  } else {
    for (let i = 0; i < vertexCount; i += 3) connect(i, i + 1, i + 2);
  }

  return neighbors.map((set) => Array.from(set));
}

function laplacianPass(source, neighbors, factor) {
  const output = new Float32Array(source.length);

  for (let i = 0; i < neighbors.length; i += 1) {
    const x = source[i * 3];
    const y = source[i * 3 + 1];
    const z = source[i * 3 + 2];
    const ring = neighbors[i];

    if (!ring.length) {
      output[i * 3] = x;
      output[i * 3 + 1] = y;
      output[i * 3 + 2] = z;
      continue;
    }

    let ax = 0;
    let ay = 0;
    let az = 0;
    for (const n of ring) {
      ax += source[n * 3];
      ay += source[n * 3 + 1];
      az += source[n * 3 + 2];
    }

    const inv = 1 / ring.length;
    output[i * 3] = x + factor * (ax * inv - x);
    output[i * 3 + 1] = y + factor * (ay * inv - y);
    output[i * 3 + 2] = z + factor * (az * inv - z);
  }

  return output;
}

function taubinSmoothGeometry(sourceGeometry, iterations) {
  const geometry = sourceGeometry.clone();
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();

  const position = geometry.attributes.position;
  const neighbors = buildNeighbors(geometry);
  let values = new Float32Array(position.array);

  for (let i = 0; i < iterations; i += 1) {
    const expanded = laplacianPass(values, neighbors, LAMBDA);
    values = laplacianPass(expanded, neighbors, MU);
  }

  position.array.set(values);
  position.needsUpdate = true;
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeBoundsTree?.();
  return geometry;
}

function smoothGeometryAsync(sourceGeometry, iterations, onDone) {
  const run = () => onDone(taubinSmoothGeometry(sourceGeometry, iterations));

  if ("requestIdleCallback" in window) {
    window.requestIdleCallback(run, { timeout: 120 });
    return;
  }

  window.requestAnimationFrame(() => window.requestAnimationFrame(run));
}

function normalizeGeometry(geometry) {
  const normalized = geometry.clone();
  normalized.computeBoundingBox();
  const box = normalized.boundingBox;
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxSide = Math.max(size.x, size.y, size.z) || 1;
  const scale = 78 / maxSide;
  normalized.translate(-center.x, -center.y, -center.z);
  normalized.scale(scale, scale, scale);
  normalized.rotateX(-Math.PI / 2);
  normalized.computeVertexNormals();
  normalized.computeBoundsTree?.();
  return normalized;
}

function cleanGeometryForCsg(sourceGeometry, matrixWorld, scale = 1) {
  let geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry.clone();
  geometry.applyMatrix4(matrixWorld);

  if (scale !== 1) {
    geometry.computeBoundingBox();
    const center = new THREE.Vector3();
    geometry.boundingBox.getCenter(center);
    geometry.translate(-center.x, -center.y, -center.z);
    geometry.scale(scale, scale, scale);
    geometry.translate(center.x, center.y, center.z);
  }

  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
  }

  geometry.clearGroups();
  geometry.setDrawRange(0, Infinity);
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.computeBoundsTree?.();
  return geometry;
}

function brushFromGeometry(geometry) {
  const brush = new Brush(geometry, CSG_MATERIAL);
  brush.updateMatrixWorld(true);
  return brush;
}

function brushesFromGroup(root, scale = 1) {
  const brushes = [];
  root.updateWorldMatrix(true, true);
  root.traverse((child) => {
    if (!child.isMesh || !child.geometry) return;
    brushes.push(brushFromGeometry(cleanGeometryForCsg(child.geometry, child.matrixWorld, scale)));
  });
  return brushes;
}

function evaluateBrushes(brushes, operation = ADDITION) {
  if (!brushes.length) return null;
  const evaluator = new Evaluator();
  evaluator.useGroups = false;

  return brushes.slice(1).reduce((result, brush) => {
    const next = evaluator.evaluate(result, brush, operation);
    next.geometry = finalizeCsgGeometry(next.geometry);
    next.updateMatrixWorld(true);
    return next;
  }, brushes[0]);
}

function finalizeCsgGeometry(sourceGeometry) {
  let geometry = sourceGeometry.index ? sourceGeometry.toNonIndexed() : sourceGeometry.clone();
  const drawStart = geometry.drawRange.start || 0;
  const drawCount = geometry.drawRange.count;

  if (drawCount !== Infinity && drawCount < geometry.attributes.position.count) {
    const start = drawStart * 3;
    const end = start + drawCount * 3;
    const sliced = new THREE.BufferGeometry();
    sliced.setAttribute("position", new THREE.BufferAttribute(geometry.attributes.position.array.slice(start, end), 3));
    geometry = sliced;
  }

  for (const name of Object.keys(geometry.attributes)) {
    if (name !== "position" && name !== "normal") geometry.deleteAttribute(name);
  }

  geometry.clearGroups();
  geometry.setDrawRange(0, Infinity);
  geometry.deleteAttribute("normal");
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  return geometry;
}

function makeCradleBrush() {
  const block = new THREE.BoxGeometry(126, 34, 90);
  const matrix = new THREE.Matrix4().makeTranslation(0, 20, 0);
  return brushFromGeometry(cleanGeometryForCsg(block, matrix));
}

function buildAttachmentBrush(mountRef, scanRef) {
  const mount = evaluateBrushes(brushesFromGroup(mountRef.current), ADDITION);
  const scan = evaluateBrushes(brushesFromGroup(scanRef.current), ADDITION);
  if (!mount || !scan) return null;

  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  const result = evaluator.evaluate(mount, scan, ADDITION);
  result.geometry = finalizeCsgGeometry(result.geometry);
  return result;
}

function buildNegativeMoldBrush(mountRef, scanRef, toleranceScale) {
  const mount = evaluateBrushes(brushesFromGroup(mountRef.current), ADDITION);
  const scan = evaluateBrushes(brushesFromGroup(scanRef.current, toleranceScale), ADDITION);
  if (!mount || !scan) return null;

  const evaluator = new Evaluator();
  evaluator.useGroups = false;
  const cradle = evaluator.evaluate(makeCradleBrush(), scan, SUBTRACTION);
  cradle.geometry = finalizeCsgGeometry(cradle.geometry);
  cradle.updateMatrixWorld(true);

  const result = evaluator.evaluate(mount, cradle, ADDITION);
  result.geometry = finalizeCsgGeometry(result.geometry);
  return result;
}

function saveBlob(text, fileName) {
  const blob = new Blob([text], { type: "model/stl" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Home() {
  const [baseGeometry, setBaseGeometry] = useState(null);
  const [scanGeometry, setScanGeometry] = useState(null);
  const [fileName, setFileName] = useState("");
  const [iterations, setIterations] = useState(8);
  const [exportMode, setExportMode] = useState("attachment");
  const [negativeScale, setNegativeScale] = useState(102);
  const [mode, setMode] = useState("translate");
  const [isDragging, setIsDragging] = useState(false);
  const [status, setStatus] = useState("Drop a binary or ASCII STL to begin.");
  const scanRef = useRef(null);
  const mountRef = useRef(null);

  const loadStl = useCallback(async (file) => {
    if (!file) return;
    setStatus("Parsing STL scan...");
    const buffer = await file.arrayBuffer();
    const geometry = new STLLoader().parse(buffer);
    const normalized = normalizeGeometry(geometry);
    setBaseGeometry(normalized);
    setScanGeometry(normalized.clone());
    setFileName(file.name);
    setStatus("Scan loaded. Smooth the mesh, then align it to the fixed mount.");
  }, []);

  const handleDrop = useCallback(
    (event) => {
      event.preventDefault();
      setIsDragging(false);
      const file = Array.from(event.dataTransfer.files).find((item) => item.name.toLowerCase().endsWith(".stl"));
      if (!file) {
        setStatus("Please drop an STL file.");
        return;
      }
      loadStl(file);
    },
    [loadStl]
  );

  useEffect(() => {
    const prevent = (event) => event.preventDefault();
    window.addEventListener("dragover", prevent);
    window.addEventListener("drop", prevent);
    return () => {
      window.removeEventListener("dragover", prevent);
      window.removeEventListener("drop", prevent);
    };
  }, []);

  const smoothScan = useCallback(() => {
    if (!baseGeometry) {
      setStatus("Load a scan before smoothing.");
      return;
    }
    setStatus(`Running Taubin smoothing: ${iterations} iterations...`);
    smoothGeometryAsync(baseGeometry, iterations, (smoothed) => {
      setScanGeometry(smoothed);
      setStatus("Smoothing complete. Use the transform handles to seat the scan.");
    });
  }, [baseGeometry, iterations]);

  const resetScan = useCallback(() => {
    if (!baseGeometry) return;
    setScanGeometry(baseGeometry.clone());
    if (scanRef.current) {
      scanRef.current.position.set(0, 26, 0);
      scanRef.current.rotation.set(0, 0, 0);
      scanRef.current.scale.set(1, 1, 1);
    }
    setStatus("Scan reset to the imported geometry.");
  }, [baseGeometry]);

  const exportScene = useCallback(() => {
    if (!scanRef.current || !mountRef.current) {
      setStatus("Load and position a scan before exporting.");
      return;
    }

    setStatus(exportMode === "negative" ? "Building negative mold with CSG subtraction..." : "Joining mount and scan with CSG union...");

    window.requestAnimationFrame(() => {
      const result =
        exportMode === "negative"
          ? buildNegativeMoldBrush(mountRef, scanRef, negativeScale / 100)
          : buildAttachmentBrush(mountRef, scanRef);

      if (!result?.geometry) {
        setStatus("CSG failed. Check that the scan is watertight and intersects the mount or cradle block.");
        return;
      }

      const mesh = new THREE.Mesh(finalizeCsgGeometry(result.geometry), CSG_MATERIAL);
      const stl = new STLExporter().parse(mesh, { binary: false });
      saveBlob(stl, exportMode === "negative" ? "skadis-negative-mold.stl" : "skadis-scan-attachment.stl");
      setStatus(exportMode === "negative" ? "Exported negative mold STL with tolerance offset." : "Exported CSG-union attachment STL.");
    });
  }, [exportMode, negativeScale]);

  const modeLabel = exportMode === "negative" ? "Negative Mold" : "Attachment";

  return (
    <main
      className="relative h-screen w-screen overflow-hidden bg-graphite text-slate-50"
      onDrop={handleDrop}
      onDragEnter={() => setIsDragging(true)}
      onDragLeave={() => setIsDragging(false)}
    >
      <ThreeViewport scanGeometry={scanGeometry} mode={mode} scanRef={scanRef} mountRef={mountRef} exportMode={exportMode} />

      <aside className="absolute left-5 top-5 z-20 flex max-h-[calc(100vh-2.5rem)] w-[340px] max-w-[calc(100vw-2.5rem)] flex-col gap-4 overflow-y-auto rounded-lg border border-white/14 bg-panel p-5 shadow-glass backdrop-blur-2xl">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-teal-200">Skadis LiDAR Aligner</p>
          <h1 className="mt-2 text-2xl font-semibold leading-tight text-white">Smooth, align, export.</h1>
        </div>

        <label className="flex cursor-pointer items-center justify-center gap-3 rounded-md border border-dashed border-teal-200/45 bg-white/7 px-4 py-5 text-sm text-slate-100 transition hover:border-teal-200 hover:bg-white/10">
          <UploadCloud size={20} />
          <span>{fileName || "Drop STL anywhere, or choose file"}</span>
          <input
            type="file"
            accept=".stl,model/stl"
            className="sr-only"
            onChange={(event) => loadStl(event.target.files?.[0])}
          />
        </label>

        <div className="rounded-md border border-white/12 bg-black/22 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">Mode</span>
            <span className="rounded bg-teal-300/14 px-2 py-1 text-sm text-teal-100">{modeLabel}</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setExportMode("attachment")}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                exportMode === "attachment" ? "border-teal-200 bg-teal-200/16 text-teal-50" : "border-white/12 bg-white/7 text-slate-200"
              }`}
            >
              Attachment
            </button>
            <button
              type="button"
              onClick={() => setExportMode("negative")}
              className={`rounded-md border px-3 py-2 text-sm transition ${
                exportMode === "negative" ? "border-amber-200 bg-amber-200/16 text-amber-50" : "border-white/12 bg-white/7 text-slate-200"
              }`}
            >
              Negative
            </button>
          </div>
        </div>

        <div className="rounded-md border border-white/12 bg-black/22 p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium text-slate-100">Iterations</span>
            <span className="rounded bg-teal-300/14 px-2 py-1 text-sm text-teal-100">{iterations}</span>
          </div>
          <input
            className="range-track w-full"
            min="0"
            max="30"
            step="1"
            type="range"
            value={iterations}
            onChange={(event) => setIterations(Number(event.target.value))}
          />
          <button
            type="button"
            onClick={smoothScan}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-md bg-teal-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-teal-200"
          >
            <Sparkles size={17} />
            Smooth Scan
          </button>
        </div>

        {exportMode === "negative" && (
          <div className="rounded-md border border-white/12 bg-black/22 p-4">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-sm font-medium text-slate-100">Negative Scale</span>
              <span className="rounded bg-amber-300/18 px-2 py-1 text-sm text-amber-100">{negativeScale}%</span>
            </div>
            <input
              className="range-track w-full"
              min="100"
              max="108"
              step="0.5"
              type="range"
              value={negativeScale}
              onChange={(event) => setNegativeScale(Number(event.target.value))}
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setMode("translate")}
            className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
              mode === "translate" ? "border-teal-200 bg-teal-200/16 text-teal-50" : "border-white/12 bg-white/7 text-slate-200"
            }`}
          >
            <Move3D size={17} />
            Move
          </button>
          <button
            type="button"
            onClick={() => setMode("rotate")}
            className={`flex items-center justify-center gap-2 rounded-md border px-3 py-2 text-sm transition ${
              mode === "rotate" ? "border-teal-200 bg-teal-200/16 text-teal-50" : "border-white/12 bg-white/7 text-slate-200"
            }`}
          >
            <RotateCcw size={17} />
            Rotate
          </button>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={resetScan}
            className="rounded-md border border-white/12 bg-white/7 px-3 py-2 text-sm text-slate-200 transition hover:bg-white/12"
          >
            Reset
          </button>
          <button
            type="button"
            onClick={exportScene}
            className="flex items-center justify-center gap-2 rounded-md bg-amber-300 px-3 py-2 text-sm font-semibold text-slate-950 transition hover:bg-amber-200"
          >
            <Download size={17} />
            Export STL
          </button>
        </div>

        <p className="rounded-md border border-white/12 bg-black/24 px-3 py-3 text-sm leading-relaxed text-slate-200">{status}</p>
      </aside>

      <div className="absolute bottom-5 left-1/2 z-20 -translate-x-1/2 rounded-full border border-white/12 bg-black/35 px-5 py-3 text-sm text-slate-100 shadow-glass backdrop-blur-xl">
        1. Drop Scan -&gt; 2. Smooth -&gt; 3. Align -&gt; 4. Export.
      </div>

      {isDragging && (
        <div className="pointer-events-none absolute inset-0 z-30 grid place-items-center border-2 border-teal-200 bg-teal-200/10 backdrop-blur-sm">
          <div className="rounded-lg border border-teal-100/45 bg-slate-950/78 px-8 py-6 text-lg font-semibold text-white shadow-glass">
            Drop STL to load scan
          </div>
        </div>
      )}
    </main>
  );
}
