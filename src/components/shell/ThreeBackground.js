"use client";
import { useEffect, useRef } from "react";
import { usePrefs } from "@/lib/store";

/** Accent + theme as three.js-friendly hex strings, read from the live CSS variables. */
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const accent = cs.getPropertyValue("--accent").trim() || "#6366f1";
  const strong = cs.getPropertyValue("--accent-strong").trim() || "#4f46e5";
  const dark = document.documentElement.dataset.theme === "dark";
  return { accent, strong, second: "#06b6d4", third: "#ec4899", dark };
}

const rand = (a, b) => a + Math.random() * (b - a);

/* ---------- Galaxy: a spiral of additive particles ---------- */
function galaxy(THREE, scene, camera, pal, preview) {
  const N = preview ? 900 : 3200;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const c1 = new THREE.Color(pal.accent);
  const c2 = new THREE.Color(pal.second);
  const c3 = new THREE.Color(pal.third);
  const tmp = new THREE.Color();
  for (let i = 0; i < N; i++) {
    const arm = i % 3;
    const r = Math.pow(Math.random(), 0.6) * 7 + 0.2;
    const a = r * 0.9 + (arm * Math.PI * 2) / 3 + rand(-0.35, 0.35);
    pos[i * 3] = Math.cos(a) * r + rand(-0.25, 0.25);
    pos[i * 3 + 1] = rand(-0.35, 0.35) * (1 - r / 9) + Math.sin(r * 2) * 0.1;
    pos[i * 3 + 2] = Math.sin(a) * r + rand(-0.25, 0.25);
    const t = r / 7;
    tmp.copy(c1).lerp(t < 0.5 ? c2 : c3, t < 0.5 ? t * 2 : (t - 0.5) * 2);
    col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: preview ? 0.09 : 0.06, vertexColors: true, transparent: true, opacity: pal.dark ? 0.9 : 0.75, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true });
  const points = new THREE.Points(geo, mat);
  scene.add(points);
  camera.position.set(0, 5.5, 9.5);
  camera.lookAt(0, 0, 0);
  return {
    update(dt, t) {
      points.rotation.y += dt * 0.04;
      camera.position.y = 5.5 + Math.sin(t * 0.15) * 0.6;
      camera.lookAt(0, 0, 0);
    },
    setPalette(p) { mat.opacity = p.dark ? 0.9 : 0.75; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}

/* ---------- Terrain: a rippling wireframe plane ---------- */
function terrain(THREE, scene, camera, pal, preview) {
  const seg = preview ? 40 : 90;
  const geo = new THREE.PlaneGeometry(44, 44, seg, seg);
  const base = geo.attributes.position.array.slice();
  const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.accent), wireframe: true, transparent: true, opacity: pal.dark ? 0.45 : 0.4 });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2 + 0.28;
  mesh.position.y = -2.2;
  scene.add(mesh);
  const glowGeo = new THREE.PlaneGeometry(44, 44, seg / 2, seg / 2);
  const glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.second), wireframe: true, transparent: true, opacity: 0.12 });
  const glow = new THREE.Mesh(glowGeo, glowMat);
  glow.rotation.copy(mesh.rotation);
  glow.position.y = -2.6;
  scene.add(glow);
  scene.fog = new THREE.FogExp2(0x000000, 0.0001);
  camera.position.set(0, 4.5, 13);
  camera.lookAt(0, -1, 0);
  const pos = geo.attributes.position;
  return {
    update(dt, t) {
      const arr = pos.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i], y = base[i + 1];
        arr[i + 2] = Math.sin(x * 0.35 + t * 0.7) * 0.8 + Math.cos(y * 0.45 - t * 0.5) * 0.6 + Math.sin((x + y) * 0.2 + t * 0.3) * 0.5;
      }
      pos.needsUpdate = true;
      mesh.rotation.z = Math.sin(t * 0.05) * 0.05;
    },
    setPalette(p) { mat.color.set(p.accent); mat.opacity = p.dark ? 0.45 : 0.4; glowMat.color.set(p.second); },
    dispose() { geo.dispose(); mat.dispose(); glowGeo.dispose(); glowMat.dispose(); },
  };
}

/* ---------- Crystals: floating low-poly shapes under soft light ---------- */
function crystals(THREE, scene, camera, pal, preview) {
  const N = preview ? 8 : 16;
  const geos = [new THREE.IcosahedronGeometry(1, 0), new THREE.OctahedronGeometry(1, 0), new THREE.TetrahedronGeometry(1.1, 0), new THREE.DodecahedronGeometry(0.9, 0)];
  const colors = [pal.accent, pal.second, pal.third, pal.strong];
  const items = [];
  const mats = [];
  for (let i = 0; i < N; i++) {
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(colors[i % colors.length]), flatShading: true, roughness: 0.35, metalness: 0.25, transparent: true, opacity: pal.dark ? 0.85 : 0.8 });
    mats.push(mat);
    const m = new THREE.Mesh(geos[i % geos.length], mat);
    const s = rand(0.5, 1.6);
    m.scale.setScalar(s);
    m.position.set(rand(-9, 9), rand(-5, 5), rand(-8, 2));
    m.rotation.set(rand(0, 6), rand(0, 6), 0);
    scene.add(m);
    items.push({ m, rx: rand(-0.4, 0.4), ry: rand(-0.5, 0.5), bob: rand(0.2, 0.6), phase: rand(0, 6), y0: m.position.y });
  }
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.35 : 0.8);
  const key = new THREE.DirectionalLight(0xffffff, pal.dark ? 1.4 : 1.1);
  key.position.set(4, 6, 8);
  const fill = new THREE.PointLight(new THREE.Color(pal.accent), pal.dark ? 60 : 30, 40);
  fill.position.set(-6, -2, 4);
  scene.add(amb, key, fill);
  camera.position.set(0, 0, 14);
  return {
    update(dt, t) {
      for (const it of items) {
        it.m.rotation.x += it.rx * dt;
        it.m.rotation.y += it.ry * dt;
        it.m.position.y = it.y0 + Math.sin(t * it.bob + it.phase) * 0.6;
      }
      camera.position.x = Math.sin(t * 0.08) * 1.5;
      camera.lookAt(0, 0, 0);
    },
    setPalette(p) {
      const cols = [p.accent, p.second, p.third, p.strong];
      mats.forEach((m, i) => { m.color.set(cols[i % cols.length]); m.opacity = p.dark ? 0.85 : 0.8; });
      amb.intensity = p.dark ? 0.35 : 0.8; key.intensity = p.dark ? 1.4 : 1.1; fill.color.set(p.accent); fill.intensity = p.dark ? 60 : 30;
    },
    dispose() { geos.forEach((g) => g.dispose()); mats.forEach((m) => m.dispose()); },
  };
}


/** Soft radial glow as a sprite texture (no external assets). */
function glowTexture(THREE, inner = "rgba(255,255,255,1)", outer = "rgba(255,255,255,0)") {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(0.35, inner.replace(/[\d.]+\)$/, "0.55)"));
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
/** Blurry blob texture for clouds. */
function cloudTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 256; c.height = 128;
  const g = c.getContext("2d");
  for (let i = 0; i < 14; i++) {
    const x = rand(30, 226), y = rand(30, 98), r = rand(22, 54);
    const grad = g.createRadialGradient(x, y, 0, x, y, r);
    grad.addColorStop(0, "rgba(255,255,255,0.9)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = grad;
    g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.needsUpdate = true;
  return tex;
}
const onSphere = (r) => {
  const u = Math.random(), v = Math.random();
  const th = 2 * Math.PI * u, ph = Math.acos(2 * v - 1);
  return [r * Math.sin(ph) * Math.cos(th), r * Math.cos(ph), r * Math.sin(ph) * Math.sin(th)];
};

/* ---------- Earth links: a wireframe globe with arcs between random cities ---------- */
function earth(THREE, scene, camera, pal, preview) {
  const group = new THREE.Group();
  const R = 4;
  const sphereGeo = new THREE.SphereGeometry(R, preview ? 24 : 40, preview ? 16 : 28);
  const sphereMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.accent), wireframe: true, transparent: true, opacity: pal.dark ? 0.16 : 0.14 });
  group.add(new THREE.Mesh(sphereGeo, sphereMat));
  const fillGeo = new THREE.SphereGeometry(R * 0.985, 32, 24);
  const fillMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.dark ? "#0b1020" : "#e9ecf6"), transparent: true, opacity: 0.9 });
  group.add(new THREE.Mesh(fillGeo, fillMat));
  // dotted continents-ish: random points on the sphere
  const N = preview ? 500 : 1400;
  const pts = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) { const [x, y, z] = onSphere(R * 1.005); pts.set([x, y, z], i * 3); }
  const ptsGeo = new THREE.BufferGeometry();
  ptsGeo.setAttribute("position", new THREE.BufferAttribute(pts, 3));
  const ptsMat = new THREE.PointsMaterial({ color: new THREE.Color(pal.second), size: preview ? 0.08 : 0.06, transparent: true, opacity: 0.75, depthWrite: false });
  group.add(new THREE.Points(ptsGeo, ptsMat));
  // links: arcs lifted above the surface, each with a travelling spark
  const L = preview ? 10 : 22;
  const arcs = [];
  const arcMat = new THREE.LineBasicMaterial({ color: new THREE.Color(pal.accent), transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false });
  const sparkGeo = new THREE.SphereGeometry(0.07, 8, 8);
  const sparkMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#ffffff") });
  const disposables = [sphereGeo, sphereMat, fillGeo, fillMat, ptsGeo, ptsMat, arcMat, sparkGeo, sparkMat];
  for (let i = 0; i < L; i++) {
    const a = new THREE.Vector3(...onSphere(R)), b = new THREE.Vector3(...onSphere(R));
    const mid = a.clone().add(b).multiplyScalar(0.5).normalize().multiplyScalar(R + a.distanceTo(b) * 0.45);
    const curve = new THREE.QuadraticBezierCurve3(a, mid, b);
    const geo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48));
    disposables.push(geo);
    group.add(new THREE.Line(geo, arcMat));
    const spark = new THREE.Mesh(sparkGeo, sparkMat);
    group.add(spark);
    arcs.push({ curve, spark, t: Math.random(), speed: rand(0.08, 0.2) });
  }
  group.rotation.z = 0.35;
  scene.add(group);
  camera.position.set(0, 1.5, 11.5);
  camera.lookAt(0, 0, 0);
  return {
    update(dt) {
      group.rotation.y += dt * 0.08;
      for (const l of arcs) { l.t = (l.t + dt * l.speed) % 1; l.spark.position.copy(l.curve.getPoint(l.t)); }
    },
    setPalette(p) { sphereMat.color.set(p.accent); ptsMat.color.set(p.second); arcMat.color.set(p.accent); fillMat.color.set(p.dark ? "#0b1020" : "#e9ecf6"); sphereMat.opacity = p.dark ? 0.16 : 0.14; },
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}

/* ---------- Neon energy: glowing tubes pulsing, with sparks racing along them ---------- */
function neon(THREE, scene, camera, pal, preview) {
  const colors = [pal.accent, pal.third, pal.second, "#a3e635"];
  const B = preview ? 5 : 9;
  const beams = [];
  const disposables = [];
  const glow = glowTexture(THREE);
  disposables.push(glow);
  for (let i = 0; i < B; i++) {
    const pts = [];
    const y0 = rand(-5, 5), z0 = rand(-6, 0);
    for (let k = 0; k <= 6; k++) pts.push(new THREE.Vector3(-14 + k * (28 / 6), y0 + rand(-2.5, 2.5), z0 + rand(-1.5, 1.5)));
    const curve = new THREE.CatmullRomCurve3(pts);
    const geo = new THREE.TubeGeometry(curve, preview ? 40 : 90, 0.035, 6, false);
    const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i % colors.length]), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
    const haloGeo = new THREE.TubeGeometry(curve, preview ? 40 : 90, 0.16, 6, false);
    const haloMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(colors[i % colors.length]), transparent: true, opacity: 0.18, blending: THREE.AdditiveBlending, depthWrite: false });
    scene.add(new THREE.Mesh(geo, mat), new THREE.Mesh(haloGeo, haloMat));
    const sparkMat = new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(colors[i % colors.length]), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    const sparks = [];
    for (let s = 0; s < 3; s++) { const sp = new THREE.Sprite(sparkMat); sp.scale.setScalar(0.9); scene.add(sp); sparks.push({ sp, t: Math.random(), speed: rand(0.12, 0.3) }); }
    disposables.push(geo, mat, haloGeo, haloMat, sparkMat);
    beams.push({ curve, mat, haloMat, sparks, phase: rand(0, 6), base: colors[i % colors.length] });
  }
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 0, 0);
  return {
    update(dt, t) {
      for (const b of beams) {
        const pulse = 0.55 + 0.45 * Math.sin(t * 1.6 + b.phase);
        b.mat.opacity = 0.5 + 0.5 * pulse;
        b.haloMat.opacity = 0.08 + 0.18 * pulse;
        for (const s of b.sparks) { s.t = (s.t + dt * s.speed) % 1; s.sp.position.copy(b.curve.getPoint(s.t)); }
      }
      camera.position.y = Math.sin(t * 0.2) * 0.8;
      camera.lookAt(0, 0, 0);
    },
    setPalette(p) { const cols = [p.accent, p.third, p.second, "#a3e635"]; beams.forEach((b, i) => { b.mat.color.set(cols[i % 4]); b.haloMat.color.set(cols[i % 4]); b.sparks[0].sp.material.color.set(cols[i % 4]); }); },
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}

/* ---------- Island: a low-poly island bobbing on water, with a few trees ---------- */
function island(THREE, scene, camera, pal, preview) {
  const group = new THREE.Group();
  const seg = preview ? 28 : 48;
  const landGeo = new THREE.CircleGeometry(6, seg);
  const pos = landGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i);
    const r = Math.hypot(x, y) / 6;
    const h = Math.max(0, 1 - r) * 2.2 + Math.sin(x * 1.7) * 0.18 + Math.cos(y * 1.3) * 0.18;
    pos.setZ(i, h * (r < 0.98 ? 1 : 0));
  }
  landGeo.computeVertexNormals();
  const landMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#4ade80"), flatShading: true, roughness: 0.9 });
  const land = new THREE.Mesh(landGeo, landMat);
  land.rotation.x = -Math.PI / 2;
  group.add(land);
  const sandGeo = new THREE.CylinderGeometry(6.2, 6.6, 0.5, seg);
  const sandMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#fde68a"), flatShading: true, roughness: 1 });
  const sand = new THREE.Mesh(sandGeo, sandMat);
  sand.position.y = -0.25;
  group.add(sand);
  const trunkGeo = new THREE.CylinderGeometry(0.08, 0.12, 1.4, 5);
  const trunkMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#92400e"), flatShading: true });
  const leafGeo = new THREE.ConeGeometry(0.7, 1.4, 6);
  const leafMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#16a34a"), flatShading: true });
  const trees = [[1.2, 0.8], [-1.6, 0.4], [0.3, -1.7], [-0.6, 1.9], [2.2, -1.1]];
  for (const [x, z] of trees) {
    const r = Math.hypot(x, z) / 6;
    const h = Math.max(0, 1 - r) * 2.2;
    const trunk = new THREE.Mesh(trunkGeo, trunkMat);
    trunk.position.set(x, h + 0.7, z);
    const leaf = new THREE.Mesh(leafGeo, leafMat);
    leaf.position.set(x, h + 1.9, z);
    group.add(trunk, leaf);
  }
  scene.add(group);
  const waterGeo = new THREE.PlaneGeometry(80, 80, preview ? 30 : 60, preview ? 30 : 60);
  const waterBase = waterGeo.attributes.position.array.slice();
  const waterMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.dark ? "#0e7490" : "#38bdf8"), flatShading: true, transparent: true, opacity: 0.85, roughness: 0.6, metalness: 0.1 });
  const water = new THREE.Mesh(waterGeo, waterMat);
  water.rotation.x = -Math.PI / 2;
  water.position.y = -0.6;
  scene.add(water);
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.5 : 1.0);
  const sun = new THREE.DirectionalLight(0xfff4d6, pal.dark ? 1.2 : 1.6);
  sun.position.set(6, 10, 4);
  scene.add(amb, sun);
  camera.position.set(0, 6, 15);
  camera.lookAt(0, 0.5, 0);
  const wpos = waterGeo.attributes.position;
  return {
    update(dt, t) {
      group.position.y = Math.sin(t * 0.6) * 0.15;
      group.rotation.y += dt * 0.05;
      const arr = wpos.array;
      for (let i = 0; i < arr.length; i += 3) arr[i + 2] = Math.sin(waterBase[i] * 0.4 + t) * 0.25 + Math.cos(waterBase[i + 1] * 0.5 + t * 0.8) * 0.25;
      wpos.needsUpdate = true;
      waterGeo.computeVertexNormals();
    },
    setPalette(p) { waterMat.color.set(p.dark ? "#0e7490" : "#38bdf8"); amb.intensity = p.dark ? 0.5 : 1.0; sun.intensity = p.dark ? 1.2 : 1.6; },
    dispose() { [landGeo, landMat, sandGeo, sandMat, trunkGeo, trunkMat, leafGeo, leafMat, waterGeo, waterMat].forEach((d) => d.dispose()); },
  };
}

/* ---------- Blood moon: a crimson moon with a halo, drifting clouds and rising embers ---------- */
function bloodmoon(THREE, scene, camera, pal, preview) {
  const moonGeo = new THREE.SphereGeometry(3.2, 40, 30);
  const moonMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#7f1d1d"), emissive: new THREE.Color("#b91c1c"), emissiveIntensity: 0.9, roughness: 1 });
  const moon = new THREE.Mesh(moonGeo, moonMat);
  moon.position.set(4, 3, -6);
  scene.add(moon);
  const halo = glowTexture(THREE, "rgba(239,68,68,1)", "rgba(239,68,68,0)");
  const haloMat = new THREE.SpriteMaterial({ map: halo, color: 0xffffff, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
  const haloSprite = new THREE.Sprite(haloMat);
  haloSprite.scale.setScalar(13);
  haloSprite.position.copy(moon.position);
  scene.add(haloSprite);
  const cloudTex = cloudTexture(THREE);
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: pal.dark ? 0.35 : 0.45, color: new THREE.Color(pal.dark ? "#3b0a0a" : "#7f1d1d"), depthWrite: false });
  const clouds = [];
  const cloudGeo = new THREE.PlaneGeometry(9, 4.5);
  for (let i = 0; i < (preview ? 4 : 7); i++) {
    const m = new THREE.Mesh(cloudGeo, cloudMat);
    m.position.set(rand(-14, 14), rand(-2, 5), rand(-4, 2));
    m.scale.setScalar(rand(0.8, 1.8));
    scene.add(m);
    clouds.push({ m, speed: rand(0.15, 0.4) });
  }
  const E = preview ? 80 : 220;
  const epos = new Float32Array(E * 3);
  const evel = new Float32Array(E);
  for (let i = 0; i < E; i++) { epos.set([rand(-14, 14), rand(-8, 6), rand(-3, 3)], i * 3); evel[i] = rand(0.2, 0.7); }
  const emberGeo = new THREE.BufferGeometry();
  emberGeo.setAttribute("position", new THREE.BufferAttribute(epos, 3));
  const emberMat = new THREE.PointsMaterial({ color: new THREE.Color("#fb923c"), size: 0.09, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  scene.add(new THREE.Points(emberGeo, emberMat));
  const light = new THREE.PointLight(new THREE.Color("#ef4444"), 40, 60);
  light.position.copy(moon.position);
  scene.add(light, new THREE.AmbientLight(0x220000, 0.6));
  camera.position.set(0, 0, 12);
  camera.lookAt(0, 1, 0);
  const ep = emberGeo.attributes.position;
  return {
    update(dt, t) {
      for (const c of clouds) { c.m.position.x += dt * c.speed; if (c.m.position.x > 16) c.m.position.x = -16; }
      const arr = ep.array;
      for (let i = 0; i < E; i++) { arr[i * 3 + 1] += dt * evel[i]; arr[i * 3] += Math.sin(t + i) * dt * 0.15; if (arr[i * 3 + 1] > 7) arr[i * 3 + 1] = -8; }
      ep.needsUpdate = true;
      haloMat.opacity = 0.7 + Math.sin(t * 0.8) * 0.1;
      moon.rotation.y += dt * 0.03;
    },
    setPalette(p) { cloudMat.opacity = p.dark ? 0.35 : 0.45; cloudMat.color.set(p.dark ? "#3b0a0a" : "#7f1d1d"); },
    dispose() { [moonGeo, moonMat, halo, haloMat, cloudTex, cloudMat, cloudGeo, emberGeo, emberMat].forEach((d) => d.dispose()); },
  };
}

/* ---------- Ocean: a rolling flat-shaded sea under a low sun ---------- */
function ocean(THREE, scene, camera, pal, preview) {
  const seg = preview ? 40 : 100;
  const geo = new THREE.PlaneGeometry(90, 90, seg, seg);
  const base = geo.attributes.position.array.slice();
  const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.dark ? "#0c4a6e" : "#0ea5e9"), flatShading: true, roughness: 0.55, metalness: 0.15, transparent: true, opacity: 0.95 });
  const sea = new THREE.Mesh(geo, mat);
  sea.rotation.x = -Math.PI / 2;
  sea.position.y = -2;
  scene.add(sea);
  const sunTex = glowTexture(THREE, "rgba(255,214,140,1)", "rgba(255,214,140,0)");
  const sunMat = new THREE.SpriteMaterial({ map: sunTex, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false });
  const sunSprite = new THREE.Sprite(sunMat);
  sunSprite.scale.setScalar(12);
  sunSprite.position.set(-6, 3.5, -30);
  scene.add(sunSprite);
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.35 : 0.8);
  const sun = new THREE.DirectionalLight(0xffe0b0, pal.dark ? 1.5 : 1.8);
  sun.position.set(-6, 6, -20);
  scene.add(amb, sun);
  scene.fog = new THREE.Fog(new THREE.Color(pal.dark ? "#0b1020" : "#dbeafe"), 20, 70);
  camera.position.set(0, 3.5, 14);
  camera.lookAt(0, 0, -10);
  const pos = geo.attributes.position;
  return {
    update(dt, t) {
      const arr = pos.array;
      for (let i = 0; i < arr.length; i += 3) {
        const x = base[i], y = base[i + 1];
        arr[i + 2] = Math.sin(x * 0.25 + t * 0.9) * 0.55 + Math.sin((x + y) * 0.18 - t * 0.6) * 0.45 + Math.cos(y * 0.3 + t * 0.4) * 0.35;
      }
      pos.needsUpdate = true;
      geo.computeVertexNormals();
      camera.position.y = 3.5 + Math.sin(t * 0.5) * 0.15;
      camera.lookAt(0, 0, -10);
    },
    setPalette(p) { mat.color.set(p.dark ? "#0c4a6e" : "#0ea5e9"); amb.intensity = p.dark ? 0.35 : 0.8; sun.intensity = p.dark ? 1.5 : 1.8; scene.fog.color.set(p.dark ? "#0b1020" : "#dbeafe"); },
    dispose() { [geo, mat, sunTex, sunMat].forEach((d) => d.dispose()); scene.fog = null; },
  };
}

const BUILDERS = { galaxy, terrain, crystals, earth, neon, island, bloodmoon, ocean };

/**
 * WebGL background. three.js is loaded on demand (only when one of these styles is active),
 * the loop pauses when the tab is hidden or animation is off, colours follow the theme and
 * accent, and everything is disposed when the style changes or the component unmounts.
 */
export default function ThreeBackground({ style, preview = false }) {
  const ref = useRef(null);
  const animate = usePrefs((s) => s.bgAnimate);
  const reduce = usePrefs((s) => s.reduceMotion);
  const running = useRef(true);
  useEffect(() => {
    running.current = animate && !reduce;
  }, [animate, reduce]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !BUILDERS[style]) return;
    let disposed = false;
    let raf = 0;
    let cleanup = () => {};
    (async () => {
      const THREE = await import("three");
      if (disposed) return;
      let renderer;
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !preview, powerPreference: "low-power" });
      } catch {
        return; // no WebGL: the plain background stays
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, preview ? 1 : 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block";
      el.appendChild(renderer.domElement);
      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(58, 1, 0.1, 200);
      const built = BUILDERS[style](THREE, scene, camera, readPalette(), preview);
      const resize = () => {
        const w = el.clientWidth || 1;
        const h = el.clientHeight || 1;
        renderer.setSize(w, h, false);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      resize();
      const ro = new ResizeObserver(resize);
      ro.observe(el);
      const mo = new MutationObserver(() => built.setPalette(readPalette()));
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
      let last = performance.now();
      let staticDrawn = false;
      const loop = (now) => {
        raf = requestAnimationFrame(loop);
        if (document.hidden) return;
        const dt = Math.min(0.05, (now - last) / 1000);
        last = now;
        if (!running.current) {
          if (!staticDrawn) { renderer.render(scene, camera); staticDrawn = true; }
          return;
        }
        staticDrawn = false;
        built.update(dt, now / 1000);
        renderer.render(scene, camera);
      };
      raf = requestAnimationFrame(loop);
      cleanup = () => {
        cancelAnimationFrame(raf);
        ro.disconnect();
        mo.disconnect();
        built.dispose();
        renderer.dispose();
        renderer.domElement.remove();
      };
    })();
    return () => {
      disposed = true;
      cleanup();
    };
  }, [style, preview]);

  return <div ref={ref} className="three bg-anim" />;
}
