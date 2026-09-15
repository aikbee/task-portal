"use client";
import { useEffect, useRef, useState } from "react";
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

/* ---------- shared helpers for the cute / supernatural / astronomy scenes ---------- */
function starField(THREE, scene, n, radius, pal, size = 0.14) {
  const pos = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) pos.set(onSphere(radius * rand(0.7, 1)), i * 3);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: new THREE.Color(pal.dark ? "#ffffff" : "#475569"), size, transparent: true, opacity: pal.dark ? 0.85 : 0.55, depthWrite: false });
  scene.add(new THREE.Points(geo, mat));
  return {
    setPalette(p) { mat.color.set(p.dark ? "#ffffff" : "#475569"); mat.opacity = p.dark ? 0.85 : 0.55; },
    dispose() { geo.dispose(); mat.dispose(); },
  };
}
/** Vertical gradient of bands; a sphere's v coordinate maps latitude onto it (gas giants). */
function bandTexture(THREE, stops) {
  const c = document.createElement("canvas");
  c.width = 8; c.height = 256;
  const g = c.getContext("2d");
  const grad = g.createLinearGradient(0, 0, 0, 256);
  stops.forEach((col, i) => grad.addColorStop(i / (stops.length - 1), col));
  g.fillStyle = grad;
  g.fillRect(0, 0, 8, 256);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Concentric translucent bands for a planetary ring (RingGeometry UVs are planar). */
function ringTexture(THREE, inner, outer, [r, g, b]) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  const grad = ctx.createRadialGradient(128, 128, 128 * (inner / outer), 128, 128, 128);
  const alphas = [0, 0.55, 0.2, 0.75, 0.35, 0.8, 0.1, 0.6, 0.45, 0.65, 0.05];
  alphas.forEach((a, i) => grad.addColorStop(i / (alphas.length - 1), `rgba(${r},${g},${b},${a})`));
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 256, 256);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Switch a material between additive glow (dark theme) and plain blending (light theme). */
function blend(THREE, mat, dark) {
  mat.blending = dark ? THREE.AdditiveBlending : THREE.NormalBlending;
  mat.needsUpdate = true;
}

/* ---------- Balloons: pastel party balloons drifting up on strings ---------- */
function balloons(THREE, scene, camera, pal, preview) {
  const colors = ["#f472b6", "#fb923c", "#facc15", "#4ade80", "#38bdf8", "#a78bfa", pal.accent];
  const n = preview ? 8 : 18;
  const bodyGeo = new THREE.SphereGeometry(1, 24, 18);
  bodyGeo.scale(1, 1.18, 1);
  const knotGeo = new THREE.ConeGeometry(0.16, 0.24, 8);
  const stringMat = new THREE.LineBasicMaterial({ color: new THREE.Color(pal.dark ? "#cbd5e1" : "#475569"), transparent: true, opacity: 0.6 });
  const items = [];
  const disposables = [bodyGeo, knotGeo, stringMat];
  const accentMats = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const color = colors[i % colors.length];
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.35, metalness: 0.05 });
    if (color === pal.accent) accentMats.push(mat);
    disposables.push(mat);
    const knot = new THREE.Mesh(knotGeo, mat);
    knot.position.y = -1.28;
    knot.rotation.x = Math.PI;
    const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(0, -1.4, 0), new THREE.Vector3(0.18, -2.3, 0.05), new THREE.Vector3(-0.1, -3.3, -0.05)]);
    const lineGeo = new THREE.BufferGeometry().setFromPoints(curve.getPoints(12));
    disposables.push(lineGeo);
    g.add(new THREE.Mesh(bodyGeo, mat), knot, new THREE.Line(lineGeo, stringMat));
    g.scale.setScalar(rand(0.55, 1.1));
    g.position.set(rand(-13, 13), rand(-10, 10), rand(-8, 2));
    scene.add(g);
    items.push({ g, speed: rand(0.35, 0.8), phase: rand(0, 6.28), sway: rand(0.3, 0.8) });
  }
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.6 : 1.1);
  const key = new THREE.DirectionalLight(0xffffff, pal.dark ? 1.4 : 1.8);
  key.position.set(4, 8, 6);
  scene.add(amb, key);
  camera.position.set(0, 0, 14);
  camera.lookAt(0, 0, 0);
  return {
    update(dt, t) {
      for (const it of items) {
        it.g.position.y += dt * it.speed;
        it.g.position.x += Math.sin(t * 0.6 + it.phase) * dt * it.sway;
        it.g.rotation.z = Math.sin(t * 0.8 + it.phase) * 0.12;
        if (it.g.position.y > 12) { it.g.position.y = -12; it.g.position.x = rand(-13, 13); }
      }
    },
    setPalette(p) { amb.intensity = p.dark ? 0.6 : 1.1; key.intensity = p.dark ? 1.4 : 1.8; stringMat.color.set(p.dark ? "#cbd5e1" : "#475569"); accentMats.forEach((m) => m.color.set(p.accent)); },
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}

/* ---------- Hearts: glossy extruded hearts bobbing in a pink haze ---------- */
function heartGeometry(THREE) {
  const s = new THREE.Shape();
  s.moveTo(0.5, 0.5);
  s.bezierCurveTo(0.5, 0.5, 0.4, 0, 0, 0);
  s.bezierCurveTo(-0.6, 0, -0.6, 0.7, -0.6, 0.7);
  s.bezierCurveTo(-0.6, 1.1, -0.3, 1.54, 0.5, 1.9);
  s.bezierCurveTo(1.2, 1.54, 1.6, 1.1, 1.6, 0.7);
  s.bezierCurveTo(1.6, 0.7, 1.6, 0, 1, 0);
  s.bezierCurveTo(0.7, 0, 0.5, 0.5, 0.5, 0.5);
  const geo = new THREE.ExtrudeGeometry(s, { depth: 0.45, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 4, curveSegments: 14 });
  geo.center();
  geo.rotateZ(Math.PI); // the shape is drawn tip-up
  return geo;
}
function hearts(THREE, scene, camera, pal, preview) {
  const geo = heartGeometry(THREE);
  const colors = ["#f43f5e", "#fb7185", "#f472b6", "#fda4af", "#e11d48", "#ec4899", pal.accent];
  const n = preview ? 10 : 24;
  const items = [];
  const disposables = [geo];
  const accentMats = [];
  for (let i = 0; i < n; i++) {
    const color = colors[i % colors.length];
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.3, metalness: 0.1, emissive: new THREE.Color(color), emissiveIntensity: pal.dark ? 0.15 : 0.02 });
    if (color === pal.accent) accentMats.push(mat);
    disposables.push(mat);
    const m = new THREE.Mesh(geo, mat);
    m.scale.setScalar(rand(0.35, 1));
    m.position.set(rand(-12, 12), rand(-8, 8), rand(-8, 2));
    m.rotation.set(rand(-0.3, 0.3), rand(0, 6.28), rand(-0.2, 0.2));
    scene.add(m);
    items.push({ m, y0: m.position.y, phase: rand(0, 6.28), spin: rand(0.2, 0.7), rise: rand(0.15, 0.4) });
  }
  const S = preview ? 60 : 180;
  const spos = new Float32Array(S * 3);
  for (let i = 0; i < S; i++) spos.set([rand(-14, 14), rand(-9, 9), rand(-9, 3)], i * 3);
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
  const sMat = new THREE.PointsMaterial({ color: new THREE.Color(pal.dark ? "#fecdd3" : "#be123c"), size: 0.09, transparent: true, opacity: 0.8, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
  scene.add(new THREE.Points(sGeo, sMat));
  disposables.push(sGeo, sMat);
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.5 : 1);
  const key = new THREE.DirectionalLight(0xffffff, pal.dark ? 1.6 : 1.9);
  key.position.set(5, 6, 8);
  const fill = new THREE.PointLight(new THREE.Color("#fb7185"), pal.dark ? 60 : 30, 60);
  fill.position.set(-6, -4, 4);
  scene.add(amb, key, fill);
  camera.position.set(0, 0, 14);
  camera.lookAt(0, 0, 0);
  return {
    update(dt, t) {
      for (const it of items) {
        it.m.rotation.y += dt * it.spin;
        it.m.position.y += dt * it.rise;
        it.m.position.x += Math.sin(t * 0.5 + it.phase) * dt * 0.3;
        if (it.m.position.y > 10) it.m.position.y = -10;
      }
      sMat.opacity = 0.6 + Math.sin(t * 2) * 0.25;
    },
    setPalette(p) {
      items.forEach((it) => { it.m.material.emissiveIntensity = p.dark ? 0.15 : 0.02; });
      accentMats.forEach((m) => { m.color.set(p.accent); m.emissive.set(p.accent); });
      sMat.color.set(p.dark ? "#fecdd3" : "#be123c");
      blend(THREE, sMat, p.dark);
      amb.intensity = p.dark ? 0.5 : 1; key.intensity = p.dark ? 1.6 : 1.9; fill.intensity = p.dark ? 60 : 30;
    },
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}

/* ---------- Jellyfish: glowing bells pulsing upward through plankton ---------- */
function jellyfish(THREE, scene, camera, pal, preview) {
  const n = preview ? 4 : 8;
  const T = 6, K = 12; // tentacles per jelly, points per tentacle
  const bellGeo = new THREE.SphereGeometry(1, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const colors = ["#f472b6", "#22d3ee", "#a78bfa", "#34d399", "#fb7185", "#60a5fa"];
  const glow = glowTexture(THREE);
  const jellies = [];
  const disposables = [bellGeo, glow];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const col = new THREE.Color(colors[i % colors.length]);
    const mat = new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: pal.dark ? 0.5 : 0.15, transparent: true, opacity: pal.dark ? 0.55 : 0.75, side: THREE.DoubleSide, roughness: 0.4, depthWrite: false });
    const sMat = new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: pal.dark ? 0.45 : 0.2, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
    const lMat = new THREE.LineBasicMaterial({ color: col, transparent: true, opacity: pal.dark ? 0.7 : 0.85 });
    disposables.push(mat, sMat, lMat);
    const sprite = new THREE.Sprite(sMat);
    sprite.scale.setScalar(3.2);
    sprite.position.y = 0.2;
    g.add(new THREE.Mesh(bellGeo, mat), sprite);
    const tentacles = [];
    for (let j = 0; j < T; j++) {
      const a = (j / T) * Math.PI * 2;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(K * 3), 3));
      disposables.push(geo);
      g.add(new THREE.Line(geo, lMat));
      tentacles.push({ geo, x0: Math.cos(a) * 0.7, z0: Math.sin(a) * 0.7, phase: rand(0, 6.28) });
    }
    const base = rand(0.5, 1.1);
    g.position.set(rand(-11, 11), rand(-8, 8), rand(-6, 1));
    g.rotation.z = rand(-0.25, 0.25);
    scene.add(g);
    jellies.push({ g, mat, sMat, lMat, tentacles, base, phase: rand(0, 6.28), speed: rand(0.25, 0.55), drift: rand(-0.2, 0.2), rate: rand(1.2, 2) });
  }
  const P = preview ? 80 : 260;
  const ppos = new Float32Array(P * 3);
  for (let i = 0; i < P; i++) ppos.set([rand(-14, 14), rand(-9, 9), rand(-8, 2)], i * 3);
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(ppos, 3));
  const pMat = new THREE.PointsMaterial({ color: new THREE.Color(pal.dark ? "#a5f3fc" : "#0e7490"), size: 0.07, transparent: true, opacity: 0.5, depthWrite: false });
  scene.add(new THREE.Points(pGeo, pMat));
  disposables.push(pGeo, pMat);
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.5 : 1);
  const top = new THREE.DirectionalLight(0xbfefff, pal.dark ? 1.2 : 1.4);
  top.position.set(0, 10, 4);
  scene.add(amb, top);
  scene.fog = new THREE.Fog(new THREE.Color(pal.dark ? "#06121f" : "#cfe8f5"), 8, 26);
  camera.position.set(0, 0, 13);
  camera.lookAt(0, 0, 0);
  const pp = pGeo.attributes.position;
  return {
    update(dt, t) {
      for (const j of jellies) {
        const pulse = Math.sin(t * j.rate + j.phase);
        j.g.scale.set((1 - pulse * 0.08) * j.base, (1 + pulse * 0.12) * j.base, (1 - pulse * 0.08) * j.base);
        j.g.position.y += dt * j.speed * (0.5 + Math.max(0, pulse));
        j.g.position.x += dt * j.drift;
        if (j.g.position.y > 10) { j.g.position.y = -10; j.g.position.x = rand(-11, 11); }
        for (const tn of j.tentacles) {
          const arr = tn.geo.attributes.position.array;
          for (let k = 0; k < K; k++) {
            arr[k * 3] = tn.x0 + Math.sin(t * 2 + k * 0.5 + tn.phase) * 0.06 * k;
            arr[k * 3 + 1] = -k * 0.26;
            arr[k * 3 + 2] = tn.z0 + Math.cos(t * 1.7 + k * 0.4 + tn.phase) * 0.05 * k;
          }
          tn.geo.attributes.position.needsUpdate = true;
        }
      }
      const arr = pp.array;
      for (let i = 1; i < arr.length; i += 3) { arr[i] += dt * 0.12; if (arr[i] > 9) arr[i] = -9; }
      pp.needsUpdate = true;
    },
    setPalette(p) {
      for (const j of jellies) { j.mat.emissiveIntensity = p.dark ? 0.5 : 0.15; j.mat.opacity = p.dark ? 0.55 : 0.75; j.sMat.opacity = p.dark ? 0.45 : 0.2; blend(THREE, j.sMat, p.dark); j.lMat.opacity = p.dark ? 0.7 : 0.85; }
      pMat.color.set(p.dark ? "#a5f3fc" : "#0e7490");
      amb.intensity = p.dark ? 0.5 : 1; top.intensity = p.dark ? 1.2 : 1.4;
      scene.fog.color.set(p.dark ? "#06121f" : "#cfe8f5");
    },
    dispose() { disposables.forEach((d) => d.dispose()); scene.fog = null; },
  };
}

/* ---------- Ghosts: friendly sheet ghosts with waving hems drifting through mist ---------- */
function ghosts(THREE, scene, camera, pal, preview) {
  const profile = [[0, 1.6], [0.45, 1.55], [0.8, 1.25], [0.95, 0.8], [0.9, 0.2], [0.95, -0.4], [1, -1], [1, -1.4]].map(([x, y]) => new THREE.Vector2(x, y));
  const proto = new THREE.LatheGeometry(profile, preview ? 20 : 32);
  const base = proto.attributes.position.array.slice();
  const eyeGeo = new THREE.SphereGeometry(0.11, 10, 8);
  const mouthGeo = new THREE.SphereGeometry(0.07, 8, 6);
  const faceMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#1e1b4b") });
  const glow = glowTexture(THREE, "rgba(199,210,254,1)", "rgba(199,210,254,0)");
  const n = preview ? 3 : 6;
  const items = [];
  const disposables = [proto, eyeGeo, mouthGeo, faceMat, glow];
  for (let i = 0; i < n; i++) {
    const g = new THREE.Group();
    const geo = proto.clone();
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.dark ? "#e0e7ff" : "#cbd5e1"), emissive: new THREE.Color("#818cf8"), emissiveIntensity: pal.dark ? 0.35 : 0.08, transparent: true, opacity: pal.dark ? 0.75 : 0.9, roughness: 0.9, side: THREE.DoubleSide });
    const sMat = new THREE.SpriteMaterial({ map: glow, transparent: true, opacity: pal.dark ? 0.35 : 0.12, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
    disposables.push(geo, mat, sMat);
    const sprite = new THREE.Sprite(sMat);
    sprite.scale.setScalar(4.5);
    sprite.position.z = -0.5;
    const eyeL = new THREE.Mesh(eyeGeo, faceMat);
    const eyeR = new THREE.Mesh(eyeGeo, faceMat);
    const mouth = new THREE.Mesh(mouthGeo, faceMat);
    eyeL.position.set(-0.32, 0.78, 0.86);
    eyeR.position.set(0.32, 0.78, 0.86);
    mouth.position.set(0, 0.42, 0.93);
    g.add(new THREE.Mesh(geo, mat), eyeL, eyeR, mouth, sprite);
    g.scale.setScalar(rand(0.7, 1.3));
    g.position.set(rand(-10, 10), rand(-3, 4), rand(-6, 1));
    scene.add(g);
    items.push({ g, geo, mat, sMat, y0: g.position.y, phase: rand(0, 6.28), drift: rand(0.15, 0.4) * (Math.random() < 0.5 ? -1 : 1) });
  }
  const cloudTex = cloudTexture(THREE);
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: pal.dark ? 0.3 : 0.35, color: new THREE.Color(pal.dark ? "#312e81" : "#94a3b8"), depthWrite: false });
  const cloudGeo = new THREE.PlaneGeometry(10, 5);
  const mist = [];
  for (let i = 0; i < (preview ? 3 : 7); i++) {
    const m = new THREE.Mesh(cloudGeo, cloudMat);
    m.position.set(rand(-14, 14), rand(-7, -4), rand(-5, 2));
    m.scale.setScalar(rand(1, 2));
    scene.add(m);
    mist.push({ m, speed: rand(0.1, 0.3) });
  }
  disposables.push(cloudTex, cloudMat, cloudGeo);
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.5 : 1);
  const moon = new THREE.PointLight(new THREE.Color("#a5b4fc"), pal.dark ? 80 : 30, 80);
  moon.position.set(6, 8, 4);
  scene.add(amb, moon);
  scene.fog = new THREE.Fog(new THREE.Color(pal.dark ? "#0b0a1a" : "#e2e8f0"), 10, 30);
  camera.position.set(0, 0.5, 13);
  camera.lookAt(0, 0, 0);
  return {
    update(dt, t) {
      for (const it of items) {
        it.g.position.y = it.y0 + Math.sin(t * 0.9 + it.phase) * 0.5;
        it.g.position.x += dt * it.drift;
        if (it.g.position.x > 13) it.g.position.x = -13;
        if (it.g.position.x < -13) it.g.position.x = 13;
        it.g.rotation.y = Math.sin(t * 0.5 + it.phase) * 0.35;
        it.g.rotation.z = Math.sin(t * 0.7 + it.phase) * 0.08;
        const arr = it.geo.attributes.position.array;
        for (let i = 0; i < arr.length; i += 3) {
          const by = base[i + 1];
          if (by >= -0.3) continue;
          const k = (-by - 0.3) / 1.1;
          arr[i + 1] = by + Math.sin(Math.atan2(base[i + 2], base[i]) * 5 + t * 3 + it.phase) * 0.14 * k;
        }
        it.geo.attributes.position.needsUpdate = true;
      }
      for (const c of mist) { c.m.position.x += dt * c.speed; if (c.m.position.x > 16) c.m.position.x = -16; }
    },
    setPalette(p) {
      for (const it of items) { it.mat.color.set(p.dark ? "#e0e7ff" : "#cbd5e1"); it.mat.emissiveIntensity = p.dark ? 0.35 : 0.08; it.mat.opacity = p.dark ? 0.75 : 0.9; it.sMat.opacity = p.dark ? 0.35 : 0.12; blend(THREE, it.sMat, p.dark); }
      cloudMat.opacity = p.dark ? 0.3 : 0.35; cloudMat.color.set(p.dark ? "#312e81" : "#94a3b8");
      amb.intensity = p.dark ? 0.5 : 1; moon.intensity = p.dark ? 80 : 30;
      scene.fog.color.set(p.dark ? "#0b0a1a" : "#e2e8f0");
    },
    dispose() { disposables.forEach((d) => d.dispose()); scene.fog = null; },
  };
}

/* ---------- Portal: an arcane ring, a vortex of particles and crackling arcs ---------- */
function portal(THREE, scene, camera, pal, preview) {
  const group = new THREE.Group();
  group.rotation.x = 0.35;
  scene.add(group);
  const ringGeo = new THREE.TorusGeometry(3.4, 0.22, 16, 90);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.dark ? "#c084fc" : "#7e22ce") });
  const ring = new THREE.Mesh(ringGeo, ringMat);
  group.add(ring);
  const glow = glowTexture(THREE, "rgba(192,132,252,1)", "rgba(192,132,252,0)");
  const glowMat = new THREE.SpriteMaterial({ map: glow, transparent: true, opacity: pal.dark ? 0.75 : 0.35, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false, color: new THREE.Color(pal.dark ? "#ffffff" : "#6d28d9") });
  const glowSprite = new THREE.Sprite(glowMat);
  glowSprite.scale.setScalar(11);
  group.add(glowSprite);
  const N = preview ? 500 : 1600;
  const pos = new Float32Array(N * 3);
  const col = new Float32Array(N * 3);
  const r = new Float32Array(N), a = new Float32Array(N), sp = new Float32Array(N);
  for (let i = 0; i < N; i++) { r[i] = rand(0.2, 3.3); a[i] = rand(0, 6.28); sp[i] = rand(0.6, 1.4); }
  const inner = new THREE.Color(pal.dark ? "#a855f7" : "#6d28d9");
  const outer = new THREE.Color(pal.dark ? "#22d3ee" : "#0e7490");
  const tmp = new THREE.Color();
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(col, 3));
  const mat = new THREE.PointsMaterial({ size: 0.08, vertexColors: true, transparent: true, opacity: 0.95, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
  group.add(new THREE.Points(geo, mat));
  const S = preview ? 60 : 160;
  const spos = new Float32Array(S * 3);
  const sdir = new Float32Array(S * 3);
  const slife = new Float32Array(S);
  const resetSpark = (i) => {
    const ang = rand(0, 6.28);
    spos.set([Math.cos(ang) * 3.4, Math.sin(ang) * 3.4, 0], i * 3);
    sdir.set([Math.cos(ang) * rand(1, 3), Math.sin(ang) * rand(1, 3), rand(-1, 1)], i * 3);
    slife[i] = rand(0.4, 1.4);
  };
  for (let i = 0; i < S; i++) { resetSpark(i); slife[i] *= Math.random(); }
  const sGeo = new THREE.BufferGeometry();
  sGeo.setAttribute("position", new THREE.BufferAttribute(spos, 3));
  const sMat = new THREE.PointsMaterial({ color: new THREE.Color(pal.dark ? "#f5d0fe" : "#7e22ce"), size: 0.1, transparent: true, opacity: 0.9, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
  group.add(new THREE.Points(sGeo, sMat));
  const A = preview ? 3 : 5, AP = 9;
  const arcMat = new THREE.LineBasicMaterial({ color: new THREE.Color(pal.dark ? "#e9d5ff" : "#6d28d9"), transparent: true, opacity: 0.85 });
  const arcs = [];
  for (let i = 0; i < A; i++) {
    const ag = new THREE.BufferGeometry();
    ag.setAttribute("position", new THREE.BufferAttribute(new Float32Array(AP * 3), 3));
    group.add(new THREE.Line(ag, arcMat));
    arcs.push(ag);
  }
  const jolt = () => {
    for (const ag of arcs) {
      const ang = rand(0, 6.28);
      const arr = ag.attributes.position.array;
      for (let k = 0; k < AP; k++) {
        const f = k / (AP - 1);
        const j = (1 - f) * 0.4;
        arr[k * 3] = Math.cos(ang) * 3.4 * (1 - f) + rand(-j, j);
        arr[k * 3 + 1] = Math.sin(ang) * 3.4 * (1 - f) + rand(-j, j);
        arr[k * 3 + 2] = rand(-j, j);
      }
      ag.attributes.position.needsUpdate = true;
    }
  };
  jolt();
  camera.position.set(0, 0.5, 11);
  camera.lookAt(0, 0, 0);
  let acc = 0;
  const pp = geo.attributes.position, cc = geo.attributes.color, spp = sGeo.attributes.position;
  return {
    update(dt, t) {
      for (let i = 0; i < N; i++) {
        r[i] -= dt * sp[i] * 0.6;
        a[i] += dt * (1.2 + 2 / (r[i] + 0.3));
        if (r[i] < 0.15) { r[i] = 3.3; a[i] = rand(0, 6.28); }
        pos[i * 3] = Math.cos(a[i]) * r[i];
        pos[i * 3 + 1] = Math.sin(a[i]) * r[i];
        pos[i * 3 + 2] = Math.sin(a[i] * 3 + t) * 0.15 * (r[i] / 3.3);
        tmp.copy(outer).lerp(inner, 1 - r[i] / 3.3);
        col[i * 3] = tmp.r; col[i * 3 + 1] = tmp.g; col[i * 3 + 2] = tmp.b;
      }
      pp.needsUpdate = true; cc.needsUpdate = true;
      for (let i = 0; i < S; i++) {
        slife[i] -= dt;
        if (slife[i] <= 0) { resetSpark(i); continue; }
        spos[i * 3] += sdir[i * 3] * dt; spos[i * 3 + 1] += sdir[i * 3 + 1] * dt; spos[i * 3 + 2] += sdir[i * 3 + 2] * dt;
      }
      spp.needsUpdate = true;
      acc += dt;
      if (acc > 0.1) { acc = 0; jolt(); }
      ring.rotation.z += dt * 0.25;
      group.rotation.y = Math.sin(t * 0.3) * 0.2;
      glowMat.opacity = (pal.dark ? 0.75 : 0.35) * (0.85 + Math.sin(t * 2.2) * 0.15);
    },
    setPalette(p) {
      pal = p;
      ringMat.color.set(p.dark ? "#c084fc" : "#7e22ce");
      glowMat.color.set(p.dark ? "#ffffff" : "#6d28d9"); blend(THREE, glowMat, p.dark);
      inner.set(p.dark ? "#a855f7" : "#6d28d9"); outer.set(p.dark ? "#22d3ee" : "#0e7490"); blend(THREE, mat, p.dark);
      sMat.color.set(p.dark ? "#f5d0fe" : "#7e22ce"); blend(THREE, sMat, p.dark);
      arcMat.color.set(p.dark ? "#e9d5ff" : "#6d28d9");
    },
    dispose() { [ringGeo, ringMat, glow, glowMat, geo, mat, sGeo, sMat, arcMat, ...arcs].forEach((d) => d.dispose()); },
  };
}

/* ---------- Wisps: spirit lights with trails over a misty pine forest ---------- */
function wisps(THREE, scene, camera, pal, preview) {
  const groundGeo = new THREE.PlaneGeometry(90, 40);
  const groundMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.dark ? "#0a1410" : "#94a3b8"), roughness: 1 });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -3;
  scene.add(ground);
  const treeGeo = new THREE.ConeGeometry(1, 5, 7);
  const treeMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(pal.dark ? "#06100c" : "#475569"), roughness: 1, flatShading: true });
  for (let i = 0; i < (preview ? 12 : 30); i++) {
    const s = rand(0.7, 1.8);
    const tree = new THREE.Mesh(treeGeo, treeMat);
    tree.scale.setScalar(s);
    tree.position.set(rand(-26, 26), -3 + 2.5 * s, rand(-20, -6));
    scene.add(tree);
  }
  const cloudTex = cloudTexture(THREE);
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: pal.dark ? 0.25 : 0.4, color: new THREE.Color(pal.dark ? "#1f3a33" : "#cbd5e1"), depthWrite: false });
  const cloudGeo = new THREE.PlaneGeometry(12, 5);
  const mist = [];
  for (let i = 0; i < (preview ? 3 : 6); i++) {
    const m = new THREE.Mesh(cloudGeo, cloudMat);
    m.position.set(rand(-16, 16), rand(-3, -1.5), rand(-8, 2));
    m.scale.setScalar(rand(1, 2.2));
    scene.add(m);
    mist.push({ m, speed: rand(0.1, 0.25) });
  }
  const glow = glowTexture(THREE);
  const colors = ["#5eead4", "#a3e635", "#c084fc", "#67e8f9", "#fde68a", "#f0abfc", "#86efac"];
  const W = preview ? 4 : 7, TR = 28;
  const items = [];
  const disposables = [groundGeo, groundMat, treeGeo, treeMat, cloudTex, cloudMat, cloudGeo, glow];
  for (let i = 0; i < W; i++) {
    const col = new THREE.Color(colors[i % colors.length]);
    const sMat = new THREE.SpriteMaterial({ map: glow, color: col, transparent: true, opacity: pal.dark ? 0.95 : 0.6, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
    const sprite = new THREE.Sprite(sMat);
    sprite.scale.setScalar(rand(1.2, 2));
    scene.add(sprite);
    const tpos = new Float32Array(TR * 3);
    const tcol = new Float32Array(TR * 3);
    const tGeo = new THREE.BufferGeometry();
    tGeo.setAttribute("position", new THREE.BufferAttribute(tpos, 3));
    tGeo.setAttribute("color", new THREE.BufferAttribute(tcol, 3));
    const tMat = new THREE.PointsMaterial({ size: 0.16, vertexColors: true, transparent: true, opacity: 0.9, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
    scene.add(new THREE.Points(tGeo, tMat));
    disposables.push(sMat, tGeo, tMat);
    let light = null;
    if (i < 4) { light = new THREE.PointLight(col, pal.dark ? 25 : 8, 20); scene.add(light); }
    items.push({ sprite, sMat, tGeo, tMat, tpos, tcol, col, light, head: 0, cx: rand(-11, 11), cz: rand(-6, 2), ax: rand(2, 5), az: rand(1, 3), fx: rand(0.15, 0.35), fy: rand(0.4, 0.9), fz: rand(0.2, 0.4), p1: rand(0, 6.28), p2: rand(0, 6.28), p3: rand(0, 6.28) });
    for (let k = 0; k < TR; k++) tpos.set([items[i].cx, -1, items[i].cz], k * 3);
  }
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.25 : 0.9);
  const moon = new THREE.DirectionalLight(0xc7d2fe, pal.dark ? 0.6 : 1);
  moon.position.set(-4, 10, -6);
  scene.add(amb, moon);
  scene.fog = new THREE.Fog(new THREE.Color(pal.dark ? "#050a08" : "#cbd5e1"), 10, 45);
  camera.position.set(0, 0.5, 14);
  camera.lookAt(0, -1, 0);
  return {
    update(dt, t) {
      for (const w of items) {
        const x = w.cx + Math.sin(t * w.fx + w.p1) * w.ax;
        const y = -0.6 + Math.sin(t * w.fy + w.p2) * 0.9;
        const z = w.cz + Math.cos(t * w.fz + w.p3) * w.az;
        w.sprite.position.set(x, y, z);
        if (w.light) w.light.position.set(x, y, z);
        w.head = (w.head + 1) % TR;
        w.tpos.set([x + rand(-0.08, 0.08), y + rand(-0.08, 0.08), z], w.head * 3);
        const fade = pal.dark ? [0, 0, 0] : [0.8, 0.84, 0.9]; // additive trails fade to black, plain ones into the mist
        for (let k = 0; k < TR; k++) {
          const age = ((w.head - k + TR) % TR) / TR;
          const b = (1 - age) * (1 - age);
          w.tcol[k * 3] = w.col.r * b + fade[0] * (1 - b); w.tcol[k * 3 + 1] = w.col.g * b + fade[1] * (1 - b); w.tcol[k * 3 + 2] = w.col.b * b + fade[2] * (1 - b);
        }
        w.tGeo.attributes.position.needsUpdate = true;
        w.tGeo.attributes.color.needsUpdate = true;
        w.sMat.opacity = (pal.dark ? 0.95 : 0.6) * (0.8 + Math.sin(t * 3 + w.p1) * 0.2);
      }
      for (const c of mist) { c.m.position.x += dt * c.speed; if (c.m.position.x > 20) c.m.position.x = -20; }
    },
    setPalette(p) {
      pal = p;
      groundMat.color.set(p.dark ? "#0a1410" : "#94a3b8"); treeMat.color.set(p.dark ? "#06100c" : "#475569");
      cloudMat.opacity = p.dark ? 0.25 : 0.4; cloudMat.color.set(p.dark ? "#1f3a33" : "#cbd5e1");
      for (const w of items) { blend(THREE, w.sMat, p.dark); blend(THREE, w.tMat, p.dark); if (w.light) w.light.intensity = p.dark ? 25 : 8; }
      amb.intensity = p.dark ? 0.25 : 0.9; moon.intensity = p.dark ? 0.6 : 1;
      scene.fog.color.set(p.dark ? "#050a08" : "#cbd5e1");
    },
    dispose() { disposables.forEach((d) => d.dispose()); scene.fog = null; },
  };
}

/* ---------- Ringed planet: a banded gas giant, translucent rings and two moons ---------- */
function saturn(THREE, scene, camera, pal, preview) {
  const stars = starField(THREE, scene, preview ? 300 : 1200, 60, pal);
  const group = new THREE.Group();
  group.rotation.set(0.42, 0, 0.18);
  group.position.x = 1.5;
  scene.add(group);
  const planetGeo = new THREE.SphereGeometry(2.4, 48, 32);
  const bands = bandTexture(THREE, ["#c9a97a", "#e8d3a6", "#b78d5a", "#f1e2bd", "#caa570", "#e2c48e", "#a67c4e", "#e8d3a6", "#c9a97a", "#d9bf8c"]);
  const planetMat = new THREE.MeshStandardMaterial({ map: bands, roughness: 0.9 });
  const planet = new THREE.Mesh(planetGeo, planetMat);
  group.add(planet);
  const ringGeo = new THREE.RingGeometry(3.1, 5.4, 128);
  const ringTex = ringTexture(THREE, 3.1, 5.4, [232, 214, 176]);
  const ringMat = new THREE.MeshStandardMaterial({ map: ringTex, transparent: true, side: THREE.DoubleSide, roughness: 0.9, depthWrite: false });
  const rings = new THREE.Mesh(ringGeo, ringMat);
  rings.rotation.x = -Math.PI / 2;
  group.add(rings);
  const RP = preview ? 400 : 1400;
  const rpos = new Float32Array(RP * 3);
  for (let i = 0; i < RP; i++) { const rr = rand(3.2, 5.3), ang = rand(0, 6.28); rpos.set([Math.cos(ang) * rr, rand(-0.04, 0.04), Math.sin(ang) * rr], i * 3); }
  const rpGeo = new THREE.BufferGeometry();
  rpGeo.setAttribute("position", new THREE.BufferAttribute(rpos, 3));
  const rpMat = new THREE.PointsMaterial({ color: new THREE.Color("#f5e9cf"), size: 0.045, transparent: true, opacity: 0.8, depthWrite: false });
  const ringDust = new THREE.Points(rpGeo, rpMat);
  group.add(ringDust);
  const moonGeo = new THREE.SphereGeometry(0.22, 16, 12);
  const moonMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#d6d3d1"), roughness: 1 });
  const moons = [{ r: 6.6, speed: 0.35, a: rand(0, 6.28), s: 1 }, { r: 7.9, speed: 0.22, a: rand(0, 6.28), s: 0.7 }].map((m) => {
    const mesh = new THREE.Mesh(moonGeo, moonMat);
    mesh.scale.setScalar(m.s);
    group.add(mesh);
    return { ...m, mesh };
  });
  const sun = new THREE.DirectionalLight(0xfff4e0, 2.4);
  sun.position.set(-8, 4, 6);
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.25 : 0.6);
  scene.add(sun, amb);
  camera.position.set(0, 1.5, 11);
  camera.lookAt(1, 0, 0);
  return {
    update(dt, t) {
      planet.rotation.y += dt * 0.12;
      ringDust.rotation.y += dt * 0.05;
      for (const m of moons) { m.a += dt * m.speed; m.mesh.position.set(Math.cos(m.a) * m.r, 0, Math.sin(m.a) * m.r); }
      camera.position.y = 1.5 + Math.sin(t * 0.2) * 0.4;
      camera.lookAt(1, 0, 0);
    },
    setPalette(p) { stars.setPalette(p); amb.intensity = p.dark ? 0.25 : 0.6; },
    dispose() { stars.dispose(); [planetGeo, bands, planetMat, ringGeo, ringTex, ringMat, rpGeo, rpMat, moonGeo, moonMat].forEach((d) => d.dispose()); },
  };
}

/* ---------- Nebula: layered gas clouds, a dense starfield and a few bright stars ---------- */
function nebula(THREE, scene, camera, pal, preview) {
  const stars = starField(THREE, scene, preview ? 400 : 1800, 50, pal, 0.1);
  const cloud = cloudTexture(THREE);
  const darkCols = ["#7c3aed", "#db2777", "#0891b2", "#4f46e5", "#be185d", "#0e7490"];
  const lightCols = ["#a78bfa", "#f472b6", "#67e8f9", "#818cf8", "#f9a8d4", "#5eead4"];
  const N = preview ? 8 : 16;
  const planeGeo = new THREE.PlaneGeometry(10, 5);
  const clouds = [];
  for (let i = 0; i < N; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: cloud, color: new THREE.Color((pal.dark ? darkCols : lightCols)[i % 6]), transparent: true, opacity: pal.dark ? 0.35 : 0.45, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
    const m = new THREE.Mesh(planeGeo, mat);
    m.position.set(rand(-10, 10), rand(-6, 6), rand(-12, -2));
    m.scale.setScalar(rand(1.2, 3.2));
    m.rotation.z = rand(0, 6.28);
    scene.add(m);
    clouds.push({ m, mat, i, rot: rand(-0.05, 0.05), phase: rand(0, 6.28) });
  }
  const glow = glowTexture(THREE);
  const brightCols = ["#ffffff", "#bfdbfe", "#fbcfe8", "#fef3c7"];
  const bright = [];
  for (let i = 0; i < (preview ? 4 : 9); i++) {
    const mat = new THREE.SpriteMaterial({ map: glow, color: new THREE.Color(pal.dark ? brightCols[i % 4] : "#a5b4fc"), transparent: true, opacity: pal.dark ? 0.9 : 0.55, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(rand(0.6, 1.8));
    s.position.set(rand(-12, 12), rand(-7, 7), rand(-10, -1));
    scene.add(s);
    bright.push({ s, mat, phase: rand(0, 6.28), base: s.scale.x });
  }
  camera.position.set(0, 0, 10);
  camera.lookAt(0, 0, -5);
  return {
    update(dt, t) {
      for (const c of clouds) { c.m.rotation.z += dt * c.rot; c.mat.opacity = (pal.dark ? 0.35 : 0.45) + Math.sin(t * 0.4 + c.phase) * 0.08; }
      for (const b of bright) { const k = 0.8 + Math.sin(t * 1.8 + b.phase) * 0.25; b.s.scale.setScalar(b.base * k); }
      camera.position.set(Math.sin(t * 0.08) * 1.2, Math.cos(t * 0.06) * 0.8, 10);
      camera.lookAt(0, 0, -5);
    },
    setPalette(p) {
      pal = p;
      stars.setPalette(p);
      for (const c of clouds) { c.mat.color.set((p.dark ? darkCols : lightCols)[c.i % 6]); blend(THREE, c.mat, p.dark); }
      bright.forEach((b, i) => { b.mat.color.set(p.dark ? brightCols[i % 4] : "#a5b4fc"); b.mat.opacity = p.dark ? 0.9 : 0.55; blend(THREE, b.mat, p.dark); });
    },
    dispose() { stars.dispose(); cloud.dispose(); planeGeo.dispose(); glow.dispose(); clouds.forEach((c) => c.mat.dispose()); bright.forEach((b) => b.mat.dispose()); },
  };
}

/* ---------- Solar system: planets on their orbits around a glowing sun ---------- */
function orbits(THREE, scene, camera, pal, preview) {
  const stars = starField(THREE, scene, preview ? 300 : 1000, 70, pal, 0.12);
  const sys = new THREE.Group();
  scene.add(sys);
  const sunGeo = new THREE.SphereGeometry(1.3, 32, 24);
  const sunMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#fbbf24") });
  sys.add(new THREE.Mesh(sunGeo, sunMat));
  const glow = glowTexture(THREE, "rgba(251,191,36,1)", "rgba(251,146,60,0)");
  const glowMat = new THREE.SpriteMaterial({ map: glow, transparent: true, opacity: pal.dark ? 0.9 : 0.6, blending: pal.dark ? THREE.AdditiveBlending : THREE.NormalBlending, depthWrite: false });
  const sunGlow = new THREE.Sprite(glowMat);
  sunGlow.scale.setScalar(6.5);
  sys.add(sunGlow);
  const light = new THREE.PointLight(0xfff1c0, 140, 90);
  sys.add(light);
  const amb = new THREE.AmbientLight(0xffffff, pal.dark ? 0.15 : 0.5);
  scene.add(amb);
  const PLANETS = [
    { r: 2.6, size: 0.18, color: "#a3a3a3", speed: 1.6 },
    { r: 3.5, size: 0.3, color: "#f59e0b", speed: 1.15 },
    { r: 4.6, size: 0.32, color: "#3b82f6", speed: 0.9, moon: true },
    { r: 5.7, size: 0.24, color: "#ef4444", speed: 0.7 },
    { r: 7.4, size: 0.7, color: "#d4a373", speed: 0.42 },
    { r: 9.2, size: 0.58, color: "#fcd34d", speed: 0.3, ring: true },
    { r: 10.8, size: 0.4, color: "#67e8f9", speed: 0.22 },
  ];
  const sphere = new THREE.SphereGeometry(1, 20, 14);
  const orbitMat = new THREE.LineBasicMaterial({ color: new THREE.Color(pal.dark ? "#64748b" : "#94a3b8"), transparent: true, opacity: pal.dark ? 0.45 : 0.7 });
  const moonMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#d6d3d1"), roughness: 1 });
  const ringGeo = new THREE.RingGeometry(1.4, 2.2, 48);
  const ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color("#eab308"), transparent: true, opacity: 0.6, side: THREE.DoubleSide, depthWrite: false });
  const disposables = [sunGeo, sunMat, glow, glowMat, sphere, orbitMat, moonMat, ringGeo, ringMat];
  const bodies = [];
  for (const p of PLANETS) {
    const pivot = new THREE.Group();
    pivot.rotation.y = rand(0, 6.28);
    sys.add(pivot);
    const mat = new THREE.MeshStandardMaterial({ color: new THREE.Color(p.color), roughness: 0.8 });
    disposables.push(mat);
    const mesh = new THREE.Mesh(sphere, mat);
    mesh.scale.setScalar(p.size);
    mesh.position.x = p.r;
    pivot.add(mesh);
    const pts = new THREE.EllipseCurve(0, 0, p.r, p.r, 0, Math.PI * 2, false, 0).getPoints(preview ? 64 : 128).map((v) => new THREE.Vector3(v.x, 0, v.y));
    const og = new THREE.BufferGeometry().setFromPoints(pts);
    disposables.push(og);
    sys.add(new THREE.LineLoop(og, orbitMat));
    let moonPivot = null;
    if (p.moon) {
      moonPivot = new THREE.Group();
      moonPivot.position.x = p.r;
      const moon = new THREE.Mesh(sphere, moonMat);
      moon.scale.setScalar(0.09);
      moon.position.x = 0.7;
      moonPivot.add(moon);
      pivot.add(moonPivot);
    }
    if (p.ring) {
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.scale.setScalar(p.size);
      ring.position.x = p.r;
      ring.rotation.x = -Math.PI / 2 + 0.4;
      pivot.add(ring);
    }
    bodies.push({ pivot, mesh, moonPivot, speed: p.speed });
  }
  camera.position.set(0, 8.5, 14);
  camera.lookAt(0, 0, 0);
  return {
    update(dt, t) {
      for (const b of bodies) { b.pivot.rotation.y += dt * b.speed * 0.35; b.mesh.rotation.y += dt * 0.8; if (b.moonPivot) b.moonPivot.rotation.y += dt * 2.2; }
      sys.rotation.y += dt * 0.02;
      glowMat.opacity = (pal.dark ? 0.9 : 0.6) * (0.9 + Math.sin(t * 1.5) * 0.1);
    },
    setPalette(p) {
      pal = p;
      stars.setPalette(p);
      orbitMat.color.set(p.dark ? "#64748b" : "#94a3b8"); orbitMat.opacity = p.dark ? 0.45 : 0.7;
      amb.intensity = p.dark ? 0.15 : 0.5;
      blend(THREE, glowMat, p.dark);
    },
    dispose() { stars.dispose(); disposables.forEach((d) => d.dispose()); },
  };
}


/* ---------- Meadow: a quiet grassland — wind in the grass, clouds drifting, cows grazing and wandering ---------- */
function meadow(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const groundH = (x, z) => 0.9 * Math.sin(x * 0.09 + 0.5) * Math.cos(z * 0.07) + 0.45 * Math.sin(x * 0.23 + z * 0.11) + 0.2 * Math.cos(x * 0.4 - z * 0.3);
  const skyStops = (dark) => (dark ? ["#0b1230", "#16204a", "#3b3f7a", "#6b5a8a"] : ["#6fb8ff", "#a9d8ff", "#dff0ff", "#f6e7c8"]);
  const grassTint = (dark) => (dark ? "#6f8f5a" : "#ffffff");
  const groundLow = (dark) => new THREE.Color(dark ? "#17361c" : "#3f8b3a");
  const groundHigh = (dark) => new THREE.Color(dark ? "#2d6a34" : "#86c95c");

  // sky dome + sun (moon on the dark theme)
  let skyTex = bandTexture(THREE, skyStops(pal.dark));
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  const skyGeo = new THREE.SphereGeometry(140, 24, 16);
  scene.add(new THREE.Mesh(skyGeo, skyMat));
  const sunTex = glowTexture(THREE, "rgba(255,246,220,1)", "rgba(255,246,220,0)");
  const sunMat = new THREE.SpriteMaterial({ map: sunTex, transparent: true, opacity: pal.dark ? 0.7 : 0.95, depthWrite: false, fog: false });
  const sun = new THREE.Sprite(sunMat);
  sun.scale.setScalar(pal.dark ? 26 : 46);
  sun.position.set(-48, 42, -96);
  scene.add(sun);
  disposables.push(skyMat, skyGeo, sunTex, sunMat);

  // clouds drifting with the wind
  const cloudTex = cloudTexture(THREE);
  const cloudMat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, opacity: pal.dark ? 0.28 : 0.9, color: new THREE.Color(pal.dark ? "#8b93c7" : "#ffffff"), depthWrite: false, fog: false });
  const cloudGeo = new THREE.PlaneGeometry(30, 13);
  const clouds = [];
  for (let i = 0; i < (preview ? 3 : 7); i++) {
    const m = new THREE.Mesh(cloudGeo, cloudMat);
    m.position.set(rand(-90, 90), rand(22, 40), rand(-95, -55));
    m.scale.set(rand(0.9, 2), rand(0.7, 1.3), 1);
    scene.add(m);
    clouds.push({ m, speed: rand(0.35, 0.8) });
  }
  disposables.push(cloudTex, cloudMat, cloudGeo);

  // rolling ground with height-tinted vertex colours
  const gSeg = preview ? 40 : 90;
  const groundGeo = new THREE.PlaneGeometry(220, 220, gSeg, gSeg);
  const gp = groundGeo.attributes.position;
  const gCol = new Float32Array(gp.count * 3);
  const lo = groundLow(pal.dark), hi = groundHigh(pal.dark), tmp = new THREE.Color();
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = -gp.getY(i);
    const h = groundH(x, z);
    gp.setZ(i, h);
    tmp.copy(lo).lerp(hi, THREE.MathUtils.clamp((h + 1.2) / 2.6, 0, 1));
    gCol.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  groundGeo.setAttribute("color", new THREE.BufferAttribute(gCol, 3));
  groundGeo.computeVertexNormals();
  const groundMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);
  disposables.push(groundGeo, groundMat);

  // grass: instanced tapered blades, swayed by a travelling wind field in the vertex shader
  const bladeH = 0.7;
  const bladeGeo = new THREE.PlaneGeometry(0.14, bladeH, 1, 3);
  bladeGeo.translate(0, bladeH / 2, 0);
  const bp = bladeGeo.attributes.position;
  const bCol = new Float32Array(bp.count * 3);
  const bBase = new THREE.Color("#2f6a25"), bTip = new THREE.Color("#a3d86a");
  for (let i = 0; i < bp.count; i++) {
    const k = bp.getY(i) / bladeH;
    bp.setX(i, bp.getX(i) * (1 - k * 0.85));
    tmp.copy(bBase).lerp(bTip, k);
    bCol.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  bladeGeo.setAttribute("color", new THREE.BufferAttribute(bCol, 3));
  const grassMat = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, color: new THREE.Color(grassTint(pal.dark)) });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.uniforms.uWind = { value: 1 };
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `vec3 transformed = vec3(position);
        #ifdef USE_INSTANCING
          vec3 ip = instanceMatrix[3].xyz;
          float k = clamp(position.y / ${bladeH.toFixed(2)}, 0.0, 1.0);
          float wave = sin(uTime * 1.7 + ip.x * 0.32 + ip.z * 0.21) * 0.55 + sin(uTime * 0.8 - ip.x * 0.12 + ip.z * 0.16) * 0.45;
          float gust = 0.5 + 0.5 * sin(uTime * 0.37 + ip.x * 0.045 - ip.z * 0.03);
          float sway = (wave * 0.3 + gust * 0.32) * uWind * k * k;
          transformed.x += sway;
          transformed.z += sway * 0.4;
          transformed.y -= abs(sway) * 0.25;
        #endif`
      );
    grassMat.userData.shader = shader;
  };
  grassMat.customProgramCacheKey = () => "meadow-grass";
  const blades = preview ? 1400 : 9000;
  const grass = new THREE.InstancedMesh(bladeGeo, grassMat, blades);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v3 = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < blades; i++) {
    const x = rand(-42, 42), z = rand(-50, 8);
    e.set(0, rand(0, Math.PI), 0);
    q.setFromEuler(e);
    v3.set(x, groundH(x, z) - 0.02, z);
    sc.set(rand(0.8, 1.4), rand(0.55, 1.25), 1);
    m4.compose(v3, q, sc);
    grass.setMatrixAt(i, m4);
    grass.setColorAt(i, tmp.setScalar(rand(0.8, 1.1)));
  }
  grass.instanceMatrix.needsUpdate = true;
  grass.instanceColor.needsUpdate = true;
  scene.add(grass);
  disposables.push(bladeGeo, grassMat);

  // a scattering of small flowers
  const flowerGeo = new THREE.CircleGeometry(0.11, 6);
  const flowerMat = new THREE.MeshLambertMaterial({ vertexColors: false, side: THREE.DoubleSide });
  const flowers = new THREE.InstancedMesh(flowerGeo, flowerMat, preview ? 60 : 320);
  const petals = ["#fef3c7", "#fde047", "#fbcfe8", "#ffffff", "#c4b5fd"];
  for (let i = 0; i < flowers.count; i++) {
    const x = rand(-40, 40), z = rand(-46, 7);
    e.set(-Math.PI / 2 + rand(-0.4, 0.4), rand(0, 6.28), 0);
    q.setFromEuler(e);
    v3.set(x, groundH(x, z) + rand(0.25, 0.5), z);
    sc.setScalar(rand(0.7, 1.3));
    m4.compose(v3, q, sc);
    flowers.setMatrixAt(i, m4);
    flowers.setColorAt(i, tmp.set(petals[i % petals.length]));
  }
  flowers.instanceMatrix.needsUpdate = true;
  flowers.instanceColor.needsUpdate = true;
  scene.add(flowers);
  disposables.push(flowerGeo, flowerMat);

  // cows: box-built, grazing then wandering to a fresh patch
  const white = new THREE.MeshStandardMaterial({ color: new THREE.Color("#f8fafc"), flatShading: true, roughness: 0.9 });
  const black = new THREE.MeshStandardMaterial({ color: new THREE.Color("#1f2937"), flatShading: true, roughness: 0.9 });
  const brown = new THREE.MeshStandardMaterial({ color: new THREE.Color("#8b5a2b"), flatShading: true, roughness: 0.9 });
  const pink = new THREE.MeshStandardMaterial({ color: new THREE.Color("#f9a8d4"), flatShading: true, roughness: 0.9 });
  const horn = new THREE.MeshStandardMaterial({ color: new THREE.Color("#e7e5e4"), flatShading: true, roughness: 0.8 });
  const bodyGeo = new THREE.BoxGeometry(1.7, 0.95, 0.85);
  const headGeo = new THREE.BoxGeometry(0.62, 0.52, 0.5);
  const snoutGeo = new THREE.BoxGeometry(0.28, 0.26, 0.42);
  const earGeo = new THREE.BoxGeometry(0.1, 0.16, 0.3);
  const hornGeo = new THREE.ConeGeometry(0.06, 0.24, 5);
  const legGeo = new THREE.BoxGeometry(0.22, 0.62, 0.22);
  legGeo.translate(0, -0.31, 0);
  const tailGeo = new THREE.BoxGeometry(0.06, 0.55, 0.06);
  tailGeo.translate(0, -0.27, 0);
  const patchGeo = new THREE.BoxGeometry(0.55, 0.42, 0.05);
  const eyeGeo = new THREE.SphereGeometry(0.045, 6, 5);
  disposables.push(white, black, brown, pink, horn, bodyGeo, headGeo, snoutGeo, earGeo, hornGeo, legGeo, tailGeo, patchGeo, eyeGeo);
  const cows = [];
  const inField = (x, z) => x > -15 && x < 15 && z > -18 && z < 3;
  const makeCow = (x, z) => {
    const g = new THREE.Group();
    const coat = Math.random() < 0.3 ? brown : white;
    const patch = coat === brown ? white : black;
    const body = new THREE.Mesh(bodyGeo, coat);
    body.position.y = 1.02;
    g.add(body);
    for (let i = 0; i < 3; i++) {
      const p = new THREE.Mesh(patchGeo, patch);
      const side = i % 2 ? 1 : -1;
      p.position.set(rand(-0.55, 0.55), 1.02 + rand(-0.2, 0.25), side * 0.44);
      p.scale.set(rand(0.6, 1.3), rand(0.7, 1.4), 1);
      g.add(p);
    }
    const neck = new THREE.Group();
    neck.position.set(0.85, 1.25, 0);
    const head = new THREE.Mesh(headGeo, coat);
    head.position.set(0.3, 0, 0);
    const snout = new THREE.Mesh(snoutGeo, pink);
    snout.position.set(0.5, -0.12, 0);
    const earL = new THREE.Mesh(earGeo, coat), earR = new THREE.Mesh(earGeo, coat);
    earL.position.set(0.15, 0.18, 0.3);
    earR.position.set(0.15, 0.18, -0.3);
    const hornL = new THREE.Mesh(hornGeo, horn), hornR = new THREE.Mesh(hornGeo, horn);
    hornL.position.set(0.2, 0.36, 0.16);
    hornR.position.set(0.2, 0.36, -0.16);
    const eyeL = new THREE.Mesh(eyeGeo, black), eyeR = new THREE.Mesh(eyeGeo, black);
    eyeL.position.set(0.5, 0.1, 0.26);
    eyeR.position.set(0.5, 0.1, -0.26);
    neck.add(head, snout, earL, earR, hornL, hornR, eyeL, eyeR);
    g.add(neck);
    const legs = [[0.6, 0.3], [0.6, -0.3], [-0.6, 0.3], [-0.6, -0.3]].map(([lx, lz]) => {
      const l = new THREE.Mesh(legGeo, coat);
      l.position.set(lx, 0.62, lz);
      g.add(l);
      return l;
    });
    const tail = new THREE.Mesh(tailGeo, coat);
    tail.position.set(-0.85, 1.35, 0);
    g.add(tail);
    g.position.set(x, groundH(x, z), z);
    g.rotation.y = rand(0, 6.28);
    g.scale.setScalar(rand(0.85, 1.1));
    scene.add(g);
    return { g, neck, legs, tail, state: "graze", timer: rand(4, 12), target: null, phase: rand(0, 6.28), yaw: g.rotation.y, speed: rand(0.55, 0.85) };
  };
  const spots = preview ? [[-2, -7], [3.5, -3]] : [[-6, -9], [2, -12], [7, -5], [-2.5, -3.5], [10, -13], [-10, -6]];
  for (const [x, z] of spots) cows.push(makeCow(x + rand(-1, 1), z + rand(-1, 1)));

  // light, fog, camera
  const hemi = new THREE.HemisphereLight(new THREE.Color(pal.dark ? "#3b4a8a" : "#bfe3ff"), new THREE.Color(pal.dark ? "#1a2e1c" : "#4d8a3c"), pal.dark ? 0.7 : 1.4);
  const key = new THREE.DirectionalLight(new THREE.Color(pal.dark ? "#c7d2fe" : "#fff3d6"), pal.dark ? 0.9 : 1.9);
  key.position.set(-24, 38, 30);
  scene.add(hemi, key);
  scene.fog = new THREE.Fog(new THREE.Color(pal.dark ? "#2a2f5a" : "#dfeffb"), 28, 95);
  const camY = groundH(0, 14) + 3.4;
  camera.position.set(0, camY, 14);
  camera.lookAt(0, 0.9, -10);

  const wrapAngle = (a) => ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return {
    update(dt, t) {
      const wind = 0.75 + 0.35 * Math.sin(t * 0.21) + 0.2 * Math.sin(t * 0.83 + 1.7);
      const sh = grassMat.userData.shader;
      if (sh) {
        sh.uniforms.uTime.value = t;
        sh.uniforms.uWind.value = wind;
      }
      for (const c of clouds) {
        c.m.position.x += dt * c.speed * (0.6 + wind * 0.5);
        if (c.m.position.x > 120) c.m.position.x = -120;
      }
      for (const c of cows) {
        c.timer -= dt;
        if (c.state === "graze") {
          // head down, slow chewing, the odd look up
          const lift = Math.sin(t * 0.23 + c.phase) > 0.93 ? 0.5 : 0;
          c.neck.rotation.z = THREE.MathUtils.lerp(c.neck.rotation.z, -(0.95 - lift) + Math.sin(t * 3.2 + c.phase) * 0.04, dt * 2.5);
          c.legs.forEach((l) => (l.rotation.z = THREE.MathUtils.lerp(l.rotation.z, 0, dt * 4)));
          if (c.timer <= 0) {
            let tx, tz, tries = 0;
            do { tx = c.g.position.x + rand(-7, 7); tz = c.g.position.z + rand(-6, 6); } while (!inField(tx, tz) && ++tries < 8);
            if (inField(tx, tz)) { c.target = [tx, tz]; c.state = "walk"; }
            else c.timer = rand(3, 6);
          }
        } else {
          const dx = c.target[0] - c.g.position.x, dz = c.target[1] - c.g.position.z;
          const dist = Math.hypot(dx, dz);
          const want = Math.atan2(-dz, dx);
          c.yaw += wrapAngle(want - c.yaw) * Math.min(1, dt * 1.6);
          c.g.rotation.y = c.yaw;
          const step = Math.min(dist, c.speed * dt);
          c.g.position.x += Math.cos(c.yaw) * step;
          c.g.position.z += -Math.sin(c.yaw) * step;
          c.g.position.y = groundH(c.g.position.x, c.g.position.z) + Math.abs(Math.sin(t * 5 + c.phase)) * 0.03;
          const swing = Math.sin(t * 5 + c.phase) * 0.45;
          c.legs[0].rotation.z = swing; c.legs[3].rotation.z = swing;
          c.legs[1].rotation.z = -swing; c.legs[2].rotation.z = -swing;
          c.neck.rotation.z = THREE.MathUtils.lerp(c.neck.rotation.z, -0.2 + Math.sin(t * 5 + c.phase) * 0.05, dt * 3);
          if (dist < 0.25) { c.state = "graze"; c.timer = rand(6, 16); }
        }
        c.tail.rotation.x = Math.sin(t * 1.3 + c.phase) * 0.35 + Math.sin(t * 4.1 + c.phase) * 0.1;
      }
      camera.position.x = Math.sin(t * 0.07) * 0.8;
      camera.position.y = camY + Math.sin(t * 0.11) * 0.12;
      camera.lookAt(Math.sin(t * 0.05) * 1.5, 0.9, -10);
    },
    setPalette(p) {
      skyTex.dispose();
      skyTex = bandTexture(THREE, skyStops(p.dark));
      skyMat.map = skyTex;
      skyMat.needsUpdate = true;
      sunMat.opacity = p.dark ? 0.7 : 0.95;
      sun.scale.setScalar(p.dark ? 26 : 46);
      cloudMat.opacity = p.dark ? 0.28 : 0.9;
      cloudMat.color.set(p.dark ? "#8b93c7" : "#ffffff");
      grassMat.color.set(grassTint(p.dark));
      const l = groundLow(p.dark), h = groundHigh(p.dark), col = groundGeo.attributes.color;
      for (let i = 0; i < gp.count; i++) {
        tmp.copy(l).lerp(h, THREE.MathUtils.clamp((gp.getZ(i) + 1.2) / 2.6, 0, 1));
        col.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      col.needsUpdate = true;
      hemi.color.set(p.dark ? "#3b4a8a" : "#bfe3ff"); hemi.groundColor.set(p.dark ? "#1a2e1c" : "#4d8a3c"); hemi.intensity = p.dark ? 0.7 : 1.4;
      key.color.set(p.dark ? "#c7d2fe" : "#fff3d6"); key.intensity = p.dark ? 0.9 : 1.9;
      scene.fog.color.set(p.dark ? "#2a2f5a" : "#dfeffb");
    },
    dispose() { disposables.forEach((d) => d.dispose()); skyTex.dispose(); scene.fog = null; },
  };
}

const BUILDERS = { galaxy, terrain, crystals, earth, neon, island, bloodmoon, ocean, balloons, hearts, jellyfish, ghosts, portal, wisps, saturn, nebula, orbits, meadow };

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

  // Previews (the admin Backgrounds page shows every scene at once) only hold a WebGL context
  // while they are on screen: browsers allow about 16 live contexts per page.
  const [visible, setVisible] = useState(!preview);
  useEffect(() => {
    const el = ref.current;
    if (!preview || !el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: "80px" });
    io.observe(el);
    return () => io.disconnect();
  }, [preview]);

  useEffect(() => {
    const el = ref.current;
    if (!el || !BUILDERS[style] || !visible) return;
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
      let built;
      try {
        built = BUILDERS[style](THREE, scene, camera, readPalette(), preview);
      } catch (err) {
        console.error(`Background "${style}" failed to build`, err);
        renderer.dispose();
        renderer.domElement.remove();
        return;
      }
      if (process.env.NODE_ENV !== "production" && !preview) window.__bgScene = { style, scene, camera, renderer, built };
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
        try {
          built.update(dt, now / 1000);
        } catch (err) {
          console.error(`Background "${style}" failed while animating`, err);
          cancelAnimationFrame(raf);
          return;
        }
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
  }, [style, preview, visible]);

  return <div ref={ref} className="three bg-anim" />;
}
