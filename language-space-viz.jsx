import { useState, useEffect, useRef, useCallback } from "react";
import * as THREE from "three";

const COLORS = {
  bg: "#0a0a0f",
  bubbleDense: "#3b82f6",
  bubbleMoE: "#f59e0b",
  safetyWall: "#ef4444",
  attackVector: "#10b981",
  grid: "#1a1a2e",
  text: "#e2e8f0",
  dim: "#64748b",
  accent: "#8b5cf6",
};

export default function LanguageSpaceViz() {
  const mountRef = useRef(null);
  const sceneRef = useRef(null);
  const rendererRef = useRef(null);
  const cameraRef = useRef(null);
  const animRef = useRef(null);
  const meshesRef = useRef({});
  const mouseRef = useRef({ x: 0, y: 0, down: false, prevX: 0, prevY: 0 });
  const rotRef = useRef({ x: 0.3, y: 0 });
  const timeRef = useRef(0);

  const [mode, setMode] = useState("dense");
  const [showSafety, setShowSafety] = useState(true);
  const [showAttack, setShowAttack] = useState(false);
  const [timeFlow, setTimeFlow] = useState(false);
  const [tValue, setTValue] = useState(0);

  const buildScene = useCallback(() => {
    if (!mountRef.current) return;
    const w = mountRef.current.clientWidth;
    const h = mountRef.current.clientHeight;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(COLORS.bg);
    scene.fog = new THREE.FogExp2(COLORS.bg, 0.015);

    const camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 200);
    camera.position.set(0, 2, 12);
    camera.lookAt(0, 0, 0);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    mountRef.current.innerHTML = "";
    mountRef.current.appendChild(renderer.domElement);

    // Lights
    const ambient = new THREE.AmbientLight(0x404060, 0.6);
    scene.add(ambient);
    const dir1 = new THREE.DirectionalLight(0x8888ff, 0.8);
    dir1.position.set(5, 8, 5);
    scene.add(dir1);
    const dir2 = new THREE.DirectionalLight(0xff8844, 0.4);
    dir2.position.set(-5, -3, -5);
    scene.add(dir2);
    const point = new THREE.PointLight(0x6666ff, 0.5, 30);
    point.position.set(0, 0, 0);
    scene.add(point);

    // Infinite space grid (represents the full language space)
    const gridSize = 60;
    const gridDiv = 40;
    const gridGeo = new THREE.BufferGeometry();
    const gridPositions = [];
    const gridColors = [];
    const half = gridSize / 2;
    const step = gridSize / gridDiv;
    for (let i = 0; i <= gridDiv; i++) {
      const pos = -half + i * step;
      const fade = 1 - Math.abs(pos) / half;
      const alpha = fade * 0.15;
      gridPositions.push(-half, -4, pos, half, -4, pos);
      gridPositions.push(pos, -4, -half, pos, -4, half);
      for (let j = 0; j < 4; j++) {
        gridColors.push(0.1, 0.1, 0.2, alpha);
      }
    }
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(gridPositions, 3));
    gridGeo.setAttribute("color", new THREE.Float32BufferAttribute(gridColors, 4));
    const gridMat = new THREE.LineBasicMaterial({ vertexColors: true, transparent: true });
    const grid = new THREE.LineSegments(gridGeo, gridMat);
    scene.add(grid);

    // Axis labels as sprites
    const makeLabel = (text, pos, color) => {
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 64;
      const ctx = canvas.getContext("2d");
      ctx.fillStyle = color || COLORS.dim;
      ctx.font = "bold 28px monospace";
      ctx.textAlign = "center";
      ctx.fillText(text, 128, 40);
      const tex = new THREE.CanvasTexture(canvas);
      const mat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.7 });
      const sprite = new THREE.Sprite(mat);
      sprite.position.set(...pos);
      sprite.scale.set(3, 0.75, 1);
      scene.add(sprite);
    };
    makeLabel("語彙・統語 (Lexical/Syntactic)", [8, -3.5, 0]);
    makeLabel("語用・文化 (Pragmatic/Cultural)", [0, -3.5, 8]);
    makeLabel("時間 t (Temporal)", [0, 5, 0]);

    // Scattered dim stars = full language space extent
    const starGeo = new THREE.BufferGeometry();
    const starPos = [];
    const starCol = [];
    for (let i = 0; i < 2000; i++) {
      const r = 5 + Math.random() * 25;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      starPos.push(
        r * Math.sin(phi) * Math.cos(theta),
        r * Math.sin(phi) * Math.sin(theta) - 1,
        r * Math.cos(phi)
      );
      const brightness = 0.1 + Math.random() * 0.2;
      starCol.push(brightness * 0.5, brightness * 0.5, brightness);
    }
    starGeo.setAttribute("position", new THREE.Float32BufferAttribute(starPos, 3));
    starGeo.setAttribute("color", new THREE.Float32BufferAttribute(starCol, 3));
    const starMat = new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.6 });
    scene.add(new THREE.Points(starGeo, starMat));

    // ---- Main bubble (LLM coverage) ----
    const bubbleGeo = new THREE.SphereGeometry(1, 64, 64);
    const bubbleMat = new THREE.MeshPhysicalMaterial({
      color: COLORS.bubbleDense,
      transparent: true,
      opacity: 0.25,
      roughness: 0.2,
      metalness: 0.1,
      transmission: 0.3,
      side: THREE.DoubleSide,
      wireframe: false,
    });
    const bubble = new THREE.Mesh(bubbleGeo, bubbleMat);
    scene.add(bubble);

    // Wireframe overlay
    const wireGeo = new THREE.SphereGeometry(1, 24, 24);
    const wireMat = new THREE.MeshBasicMaterial({
      color: COLORS.bubbleDense,
      wireframe: true,
      transparent: true,
      opacity: 0.15,
    });
    const wireframe = new THREE.Mesh(wireGeo, wireMat);
    scene.add(wireframe);

    // Safety constraint patches (red zones on surface)
    const safetyPatches = [];
    const patchPositions = [
      { theta: 0, phi: Math.PI / 2, label: "English\nExplicit Harm" },
      { theta: Math.PI / 4, phi: Math.PI / 3, label: "Known\nJailbreaks" },
      { theta: -Math.PI / 3, phi: Math.PI / 2.5, label: "Violence\nKeywords" },
    ];
    patchPositions.forEach((p) => {
      const patchGeo = new THREE.SphereGeometry(0.35, 16, 16, 0, Math.PI * 2, 0, Math.PI / 2);
      const patchMat = new THREE.MeshBasicMaterial({
        color: COLORS.safetyWall,
        transparent: true,
        opacity: 0.4,
        side: THREE.DoubleSide,
      });
      const patch = new THREE.Mesh(patchGeo, patchMat);
      patch.position.set(
        Math.sin(p.phi) * Math.cos(p.theta) * 2.8,
        Math.cos(p.phi) * 2.8,
        Math.sin(p.phi) * Math.sin(p.theta) * 2.8
      );
      patch.lookAt(0, 0, 0);
      scene.add(patch);
      safetyPatches.push(patch);
    });

    // Attack vectors (green arrows from outside)
    const attackArrows = [];
    const attackDirs = [
      { from: [5, 1, 4], label: "Semantic\nSmoothing" },
      { from: [-4, 2, 5], label: "日本語\n婉曲表現" },
      { from: [3, -2, -5], label: "Multi-agent\nBypass" },
    ];
    attackDirs.forEach((a) => {
      const origin = new THREE.Vector3(...a.from);
      const dir = new THREE.Vector3(0, 0, 0).sub(origin).normalize();
      const len = origin.length() - 2.5;
      const arrowGeo = new THREE.CylinderGeometry(0.03, 0.03, len, 8);
      const arrowMat = new THREE.MeshBasicMaterial({
        color: COLORS.attackVector,
        transparent: true,
        opacity: 0.7,
      });
      const arrow = new THREE.Mesh(arrowGeo, arrowMat);
      const mid = origin.clone().add(dir.clone().multiplyScalar(len / 2));
      arrow.position.copy(mid);
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(arrow);

      // Arrowhead
      const headGeo = new THREE.ConeGeometry(0.1, 0.3, 8);
      const head = new THREE.Mesh(headGeo, arrowMat.clone());
      const tip = origin.clone().add(dir.clone().multiplyScalar(len));
      head.position.copy(tip);
      head.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
      scene.add(head);

      // Glow point at penetration
      const glowGeo = new THREE.SphereGeometry(0.15, 16, 16);
      const glowMat = new THREE.MeshBasicMaterial({
        color: COLORS.attackVector,
        transparent: true,
        opacity: 0.8,
      });
      const glow = new THREE.Mesh(glowGeo, glowMat);
      glow.position.copy(tip);
      scene.add(glow);

      attackArrows.push({ arrow, head, glow, origin: a.from });
    });

    // English-heavy zone indicator
    const enGeo = new THREE.RingGeometry(2.5, 3.5, 32);
    const enMat = new THREE.MeshBasicMaterial({
      color: COLORS.bubbleDense,
      transparent: true,
      opacity: 0.06,
      side: THREE.DoubleSide,
    });
    const enRing = new THREE.Mesh(enGeo, enMat);
    enRing.rotation.x = -Math.PI / 2;
    enRing.position.y = 0;
    scene.add(enRing);

    meshesRef.current = {
      bubble, wireframe, safetyPatches, attackArrows, enRing,
      bubbleMat, wireMat,
    };
    sceneRef.current = scene;
    rendererRef.current = renderer;
    cameraRef.current = camera;
  }, []);

  // Update visuals based on state
  const updateVisuals = useCallback(() => {
    const m = meshesRef.current;
    if (!m.bubble) return;

    const isDense = mode === "dense";
    const baseColor = isDense ? COLORS.bubbleDense : COLORS.bubbleMoE;
    const t = tValue;

    m.bubbleMat.color.set(baseColor);
    m.wireMat.color.set(baseColor);

    // Deform the bubble based on mode + time
    const geo = m.bubble.geometry;
    const wireGeo = m.wireframe.geometry;
    const pos = geo.attributes.position;
    const wirePos = wireGeo.attributes.position;

    const baseRadius = isDense ? 3.0 : 2.2;
    const englishBias = isDense ? 0.3 : 0.6;
    const safetySquish = showSafety ? 0.4 : 0;
    const timeDecay = t * 0.15;

    for (let i = 0; i < pos.count; i++) {
      const theta = Math.atan2(pos.getZ(i) || 0.001, pos.getX(i));
      const phi = Math.acos(Math.max(-1, Math.min(1, pos.getY(i))));

      let r = baseRadius;
      // English bias: elongated toward theta=0 (English axis)
      r += englishBias * Math.max(0, Math.cos(theta)) * Math.sin(phi);
      // Japanese/Korean suppression: compressed at theta=PI (far from English)
      r -= englishBias * 0.5 * Math.max(0, Math.cos(theta + Math.PI)) * Math.sin(phi);
      // Safety patches compress specific regions
      if (showSafety) {
        const safetyEffect = Math.exp(-((theta - 0) ** 2) / 0.5) * Math.sin(phi);
        r -= safetySquish * safetyEffect;
      }
      // Time decay: bubble shrinks unevenly
      r -= timeDecay * (0.5 + 0.5 * Math.sin(theta * 3 + phi * 2));
      // MoE creates more irregular shape
      if (!isDense) {
        r += 0.2 * Math.sin(theta * 5) * Math.sin(phi * 3) * 0.5;
      }
      r = Math.max(0.3, r);

      const nx = r * Math.sin(phi) * Math.cos(theta);
      const ny = r * Math.cos(phi);
      const nz = r * Math.sin(phi) * Math.sin(theta);

      pos.setXYZ(i, nx, ny, nz);
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // Sync wireframe roughly
    for (let i = 0; i < wirePos.count; i++) {
      const theta = Math.atan2(wirePos.getZ(i) || 0.001, wirePos.getX(i));
      const phi = Math.acos(Math.max(-1, Math.min(1, wirePos.getY(i))));
      let r = baseRadius;
      r += englishBias * Math.max(0, Math.cos(theta)) * Math.sin(phi);
      r -= englishBias * 0.5 * Math.max(0, Math.cos(theta + Math.PI)) * Math.sin(phi);
      if (showSafety) {
        const safetyEffect = Math.exp(-((theta - 0) ** 2) / 0.5) * Math.sin(phi);
        r -= safetySquish * safetyEffect;
      }
      r -= timeDecay * (0.5 + 0.5 * Math.sin(theta * 3 + phi * 2));
      if (!isDense) r += 0.2 * Math.sin(theta * 5) * Math.sin(phi * 3) * 0.5;
      r = Math.max(0.3, r);
      wirePos.setXYZ(i, r * Math.sin(phi) * Math.cos(theta), r * Math.cos(phi), r * Math.sin(phi) * Math.sin(theta));
    }
    wirePos.needsUpdate = true;

    // Safety patch visibility
    m.safetyPatches.forEach((p) => (p.visible = showSafety));

    // Attack vector visibility
    m.attackArrows.forEach((a) => {
      a.arrow.visible = showAttack;
      a.head.visible = showAttack;
      a.glow.visible = showAttack;
      if (showAttack) {
        a.glow.scale.setScalar(1 + 0.3 * Math.sin(Date.now() * 0.005));
      }
    });

    m.bubbleMat.opacity = isDense ? 0.25 : 0.18;
    m.wireMat.opacity = isDense ? 0.15 : 0.25;
  }, [mode, showSafety, showAttack, tValue]);

  // Animation loop
  useEffect(() => {
    buildScene();
    const animate = () => {
      animRef.current = requestAnimationFrame(animate);
      if (!sceneRef.current || !rendererRef.current || !cameraRef.current) return;

      if (timeFlow) {
        timeRef.current += 0.003;
        setTValue(Math.min(5, timeRef.current));
      }

      rotRef.current.y += 0.002;
      const r = 12;
      const mx = mouseRef.current.x;
      const my = mouseRef.current.y;
      cameraRef.current.position.x = r * Math.sin(rotRef.current.y + mx * 0.01);
      cameraRef.current.position.z = r * Math.cos(rotRef.current.y + mx * 0.01);
      cameraRef.current.position.y = 2 + my * 0.01;
      cameraRef.current.lookAt(0, 0, 0);

      updateVisuals();
      rendererRef.current.render(sceneRef.current, cameraRef.current);
    };
    animate();
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      if (rendererRef.current) rendererRef.current.dispose();
    };
  }, [buildScene, updateVisuals, timeFlow]);

  // Resize
  useEffect(() => {
    const onResize = () => {
      if (!mountRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      rendererRef.current.setSize(w, h);
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Mouse drag
  useEffect(() => {
    const el = mountRef.current;
    if (!el) return;
    const onDown = (e) => {
      mouseRef.current.down = true;
      mouseRef.current.prevX = e.clientX || e.touches?.[0]?.clientX || 0;
      mouseRef.current.prevY = e.clientY || e.touches?.[0]?.clientY || 0;
    };
    const onMove = (e) => {
      if (!mouseRef.current.down) return;
      const cx = e.clientX || e.touches?.[0]?.clientX || 0;
      const cy = e.clientY || e.touches?.[0]?.clientY || 0;
      mouseRef.current.x += cx - mouseRef.current.prevX;
      mouseRef.current.y += cy - mouseRef.current.prevY;
      mouseRef.current.prevX = cx;
      mouseRef.current.prevY = cy;
    };
    const onUp = () => { mouseRef.current.down = false; };
    el.addEventListener("mousedown", onDown);
    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseup", onUp);
    el.addEventListener("mouseleave", onUp);
    el.addEventListener("touchstart", onDown, { passive: true });
    el.addEventListener("touchmove", onMove, { passive: true });
    el.addEventListener("touchend", onUp);
    return () => {
      el.removeEventListener("mousedown", onDown);
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseup", onUp);
      el.removeEventListener("mouseleave", onUp);
      el.removeEventListener("touchstart", onDown);
      el.removeEventListener("touchmove", onMove);
      el.removeEventListener("touchend", onUp);
    };
  }, []);

  const btnStyle = (active) => ({
    padding: "6px 14px",
    border: `1px solid ${active ? "#fff" : "#333"}`,
    borderRadius: "4px",
    background: active ? "#fff1" : "transparent",
    color: active ? "#fff" : COLORS.dim,
    cursor: "pointer",
    fontSize: "12px",
    fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
    transition: "all 0.2s",
    letterSpacing: "0.02em",
  });

  return (
    <div style={{ width: "100%", height: "100vh", background: COLORS.bg, display: "flex", flexDirection: "column", fontFamily: "'JetBrains Mono', 'Fira Code', monospace" }}>
      {/* Header */}
      <div style={{ padding: "16px 20px 8px", color: COLORS.text, borderBottom: `1px solid ${COLORS.grid}` }}>
        <div style={{ fontSize: "14px", fontWeight: 700, letterSpacing: "0.08em", color: COLORS.dim }}>
          LANGUAGE SPACE TOPOLOGY
        </div>
        <div style={{ fontSize: "11px", color: COLORS.dim, marginTop: "4px" }}>
          全言語空間 L における安全制約の幾何学 — 3次元射影
        </div>
      </div>

      {/* Controls */}
      <div style={{ padding: "10px 20px", display: "flex", flexWrap: "wrap", gap: "8px", alignItems: "center", borderBottom: `1px solid ${COLORS.grid}` }}>
        <div style={{ display: "flex", gap: "4px" }}>
          <button style={btnStyle(mode === "dense")} onClick={() => setMode("dense")}>
            <span style={{ color: COLORS.bubbleDense }}>●</span> Dense
          </button>
          <button style={btnStyle(mode === "moe")} onClick={() => setMode("moe")}>
            <span style={{ color: COLORS.bubbleMoE }}>●</span> MoE
          </button>
        </div>
        <div style={{ width: "1px", height: "20px", background: COLORS.grid }} />
        <button style={btnStyle(showSafety)} onClick={() => setShowSafety(!showSafety)}>
          <span style={{ color: COLORS.safetyWall }}>●</span> Safety制約
        </button>
        <button style={btnStyle(showAttack)} onClick={() => setShowAttack(!showAttack)}>
          <span style={{ color: COLORS.attackVector }}>●</span> 攻撃Vector
        </button>
        <div style={{ width: "1px", height: "20px", background: COLORS.grid }} />
        <button style={btnStyle(timeFlow)} onClick={() => { setTimeFlow(!timeFlow); if (!timeFlow) timeRef.current = tValue; }}>
          {timeFlow ? "⏸" : "▶"} 時間経過
        </button>
        <button style={{ ...btnStyle(false), fontSize: "11px" }} onClick={() => { setTValue(0); timeRef.current = 0; }}>
          t=0 reset
        </button>
        <span style={{ fontSize: "11px", color: COLORS.dim, marginLeft: "4px" }}>
          t = {tValue.toFixed(2)}
        </span>
      </div>

      {/* 3D viewport */}
      <div ref={mountRef} style={{ flex: 1, cursor: "grab", minHeight: 0 }} />

      {/* Legend */}
      <div style={{ padding: "10px 20px", display: "flex", flexWrap: "wrap", gap: "16px", fontSize: "10px", color: COLORS.dim, borderTop: `1px solid ${COLORS.grid}` }}>
        <span>散布点 = 全言語空間（無限の広がり）</span>
        <span><span style={{ color: COLORS.bubbleDense }}>■</span> Dense泡 = 全param活性、内圧高</span>
        <span><span style={{ color: COLORS.bubbleMoE }}>■</span> MoE泡 = 部分活性、内圧低</span>
        <span><span style={{ color: COLORS.safetyWall }}>■</span> Safety = 英語既知パターン遮断</span>
        <span><span style={{ color: COLORS.attackVector }}>■</span> 攻撃 = 制約の薄い面を貫通</span>
        <span>▶ 時間 = 泡と空間のミスマッチ拡大</span>
        <span>ドラッグで回転</span>
      </div>
    </div>
  );
}
