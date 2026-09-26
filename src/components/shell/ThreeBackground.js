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

/* ---------- City drive: the driver's view, cruising down a city avenue at a steady, moderate speed ---------- */
/** Building facades: a 6×6 block of windows tiled over each wall (`day`), and the subset lit at night (`lit`). */
function facadeTextures(THREE) {
  const cells = 6, px = 32, size = cells * px;
  const day = document.createElement("canvas"), lit = document.createElement("canvas");
  day.width = day.height = lit.width = lit.height = size;
  const d = day.getContext("2d"), l = lit.getContext("2d");
  d.fillStyle = "#ffffff";
  d.fillRect(0, 0, size, size);
  l.fillStyle = "#000000";
  l.fillRect(0, 0, size, size);
  const warm = ["#ffe9b0", "#ffd98a", "#fff3d1", "#dbeaff", "#ffe4c4"];
  for (let y = 0; y < cells; y++) {
    for (let x = 0; x < cells; x++) {
      const wx = x * px + 7, wy = y * px + 6, ww = px - 14, wh = px - 12;
      d.fillStyle = "#46566f";
      d.fillRect(wx, wy, ww, wh);
      d.fillStyle = "rgba(255,255,255,0.4)";
      d.fillRect(wx, wy, ww, 3);
      if (Math.random() < 0.5) {
        l.globalAlpha = rand(0.45, 1);
        l.fillStyle = warm[Math.floor(Math.random() * warm.length)];
        l.fillRect(wx, wy, ww, wh);
        l.globalAlpha = 1;
      }
    }
  }
  const mk = (c) => {
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };
  return { day: mk(day), lit: mk(lit) };
}
/** One 14 m × 12 m stretch of two-way road (asphalt, solid edge lines, dashed lane lines) that tiles along the avenue. */
function roadTexture(THREE) {
  const w = 256, h = 512;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const g = c.getContext("2d");
  g.fillStyle = "#3d3e44";
  g.fillRect(0, 0, w, h);
  for (let i = 0; i < 2400; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? "255,255,255" : "0,0,0"},${rand(0.03, 0.12).toFixed(3)})`;
    g.fillRect(Math.random() * w, Math.random() * h, rand(1, 3), rand(1, 3));
  }
  const X = (m) => ((m + 7) / 14) * w, Y = (m) => (m / 12) * h;
  g.fillStyle = "#e6e4dc";
  for (const m of [-6.75, 6.75]) g.fillRect(X(m) - 2, 0, 4, h);
  for (const m of [-3.5, 3.5]) g.fillRect(X(m) - 2, Y(0.5), 4, Y(3));
  g.fillStyle = "#efe8c4";
  g.fillRect(X(0) - 2, Y(4), 4, Y(5));
  const t = new THREE.CanvasTexture(c);
  t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
/** A shop signboard: dark board, a border and a few blocky "characters"; the instance colour tints the light parts. */
function signTexture(THREE) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 64;
  const g = c.getContext("2d");
  g.fillStyle = "#000000";
  g.fillRect(0, 0, 128, 64);
  g.strokeStyle = "#ffffff";
  g.lineWidth = 3;
  g.strokeRect(4, 4, 120, 56);
  g.fillStyle = "#ffffff";
  const n = 3 + Math.floor(Math.random() * 3);
  const w = 100 / n;
  for (let i = 0; i < n; i++) {
    const x0 = 14 + i * w;
    for (let k = 0; k < 4; k++) g.fillRect(x0 + rand(0, w - 16), rand(14, 42), rand(5, w - 12), rand(3, 7));
  }
  const t = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
function citydrive(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const SPEED = 13.5; // metres per second, about 50 km/h
  const BLOCK = 78, GAP = 13, BLOCKS = preview ? 2 : 3;
  const L = (BLOCK + GAP) * BLOCKS; // the street repeats every L metres
  const NEAR = 12, FAR = L - NEAR; // scrolling objects live at z ∈ (-FAR, NEAR]
  const LANE = -1.75; // left-hand traffic: our lane is the one beside the centre line
  const fogColor = (dark) => (dark ? "#262347" : "#dcecf7");
  const skyStops = (dark) => (dark ? ["#03050c", "#0a0f22", "#262347", "#262347", "#262347"] : ["#3b86dd", "#8cc4ff", "#dcecf7", "#dcecf7", "#dcecf7"]);
  camera.far = 340;
  camera.updateProjectionMatrix();

  // everything on the street bends sideways with distance (in view space), so the avenue curves gently as we drive
  const bendMats = [];
  const bendable = (mat) => {
    mat.onBeforeCompile = (shader) => {
      shader.uniforms.uBend = { value: 0 };
      let v = shader.vertexShader.replace("#include <common>", "#include <common>\nuniform float uBend;");
      if (v.includes("#include <project_vertex>")) v = v.replace("#include <project_vertex>", THREE.ShaderChunk.project_vertex);
      shader.vertexShader = v.replace("gl_Position = projectionMatrix * mvPosition;", "mvPosition.x += uBend * mvPosition.z * mvPosition.z;\n\tgl_Position = projectionMatrix * mvPosition;");
      mat.userData.shader = shader;
    };
    mat.customProgramCacheKey = () => "city-bend";
    bendMats.push(mat);
    disposables.push(mat);
    return mat;
  };
  const geo = (g) => {
    disposables.push(g);
    return g;
  };

  // sky dome, sun by day, moon and stars by night
  let skyTex = bandTexture(THREE, skyStops(pal.dark));
  const skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
  scene.add(new THREE.Mesh(geo(new THREE.SphereGeometry(330, 24, 16)), skyMat));
  const glowTex = glowTexture(THREE);
  const sunMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color("#fff1c2"), transparent: true, opacity: pal.dark ? 0 : 0.95, depthWrite: false, fog: false });
  const sun = new THREE.Sprite(sunMat);
  sun.scale.setScalar(90);
  sun.position.set(120, 130, -290);
  const moonMat = new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color("#e6ecff"), transparent: true, opacity: pal.dark ? 0.85 : 0, depthWrite: false, fog: false });
  const moon = new THREE.Sprite(moonMat);
  moon.scale.setScalar(30);
  moon.position.set(-110, 120, -290);
  scene.add(sun, moon);
  const starN = preview ? 120 : 450;
  const sPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    let p;
    do p = onSphere(310); while (p[1] < 25);
    sPos.set(p, i * 3);
  }
  const starGeo = geo(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  const starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.6, transparent: true, opacity: pal.dark ? 0.8 : 0, depthWrite: false, fog: false });
  scene.add(new THREE.Points(starGeo, starMat));
  disposables.push(skyMat, glowTex, sunMat, moonMat, starMat);

  // the far skyline: a hazy silhouette that never scrolls
  const skylineMat = bendable(new THREE.MeshBasicMaterial({ color: new THREE.Color(pal.dark ? "#1a1935" : "#c4d6e7"), fog: false }));
  const boxGeo = geo(new THREE.BoxGeometry(1, 1, 1));
  const skylineN = preview ? 26 : 52;
  const skyline = new THREE.InstancedMesh(boxGeo, skylineMat, skylineN);
  const m4 = new THREE.Matrix4(), q0 = new THREE.Quaternion(), v3 = new THREE.Vector3(), sc = new THREE.Vector3(), tmp = new THREE.Color();
  for (let i = 0; i < skylineN; i++) {
    const w = rand(9, 22), h = rand(28, 120);
    v3.set(-290 + (i + rand(0.1, 0.9)) * (580 / skylineN), h / 2, rand(-262, -240));
    sc.set(w, h, rand(10, 20));
    m4.compose(v3, q0, sc);
    skyline.setMatrixAt(i, m4);
  }
  scene.add(skyline);

  // ground, road, kerbs
  const groundMat = bendable(new THREE.MeshLambertMaterial({ color: new THREE.Color("#5a5b60") }));
  const ground = new THREE.Mesh(geo(new THREE.PlaneGeometry(600, L + 60, 6, 48)), groundMat);
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(0, -0.03, -(L + 60) / 2 + NEAR + 20);
  scene.add(ground);
  const roadTex = roadTexture(THREE);
  roadTex.repeat.set(1, (L + 60) / 12);
  const roadMat = bendable(new THREE.MeshLambertMaterial({ map: roadTex }));
  const road = new THREE.Mesh(geo(new THREE.PlaneGeometry(14, L + 60, 1, 72)), roadMat);
  road.rotation.x = -Math.PI / 2;
  road.position.copy(ground.position).setY(0);
  scene.add(road);
  const kerbMat = bendable(new THREE.MeshLambertMaterial({ color: new THREE.Color("#b4b3ad") }));
  const kerbGeo = geo(new THREE.BoxGeometry(3.6, 0.16, L + 60, 1, 1, 72));
  for (const side of [-1, 1]) {
    const k = new THREE.Mesh(kerbGeo, kerbMat);
    k.position.set(side * 8.8, 0.08, ground.position.z);
    scene.add(k);
  }
  disposables.push(roadTex);

  // things that scroll past: their base z is fixed, the drawn z wraps with the distance driven
  let driven = 0;
  const wrapZ = (z0) => {
    let z = (z0 + driven) % L;
    if (z < 0) z += L;
    return z - FAR;
  };
  const instanced = [];
  const addInstanced = (g, mat, capacity) => {
    const mesh = new THREE.InstancedMesh(g, mat, capacity);
    mesh.count = 0;
    scene.add(mesh);
    const entry = { mesh, items: [] };
    instanced.push(entry);
    return entry;
  };
  const place = (entry, x, y, z, sx, sy, sz, color) => {
    const i = entry.items.length;
    entry.items.push({ x, y, z, sx, sy, sz });
    entry.mesh.count = i + 1;
    if (color) entry.mesh.setColorAt(i, tmp.set(color));
  };

  // buildings: three size classes so the windows keep a sensible size, two rows deep, tall ones behind
  const tex = facadeTextures(THREE);
  const wallMat = bendable(new THREE.MeshLambertMaterial({ map: tex.day, emissiveMap: tex.lit, emissive: new THREE.Color("#ffd27a"), emissiveIntensity: pal.dark ? 1 : 0 }));
  const roofMat = bendable(new THREE.MeshLambertMaterial({ color: new THREE.Color("#3a3d46") }));
  const wallMats = [wallMat, wallMat, roofMat, roofMat, wallMat, wallMat];
  const facadeGeo = (cols, rows) => {
    const g = geo(new THREE.BoxGeometry(1, 1, 1));
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * cols, uv.getY(i) * rows);
    return g;
  };
  const classes = {
    low: { entry: addInstanced(facadeGeo(4, 3), wallMats, 60), h: [6, 11], w: [9, 15], d: [12, 16] },
    mid: { entry: addInstanced(facadeGeo(5, 6), wallMats, 60), h: [12, 24], w: [10, 17], d: [12, 18] },
    tall: { entry: addInstanced(facadeGeo(6, 15), wallMats, 40), h: [30, 72], w: [14, 24], d: [14, 22] },
  };
  const shades = ["#e8e2d6", "#d9d4c7", "#c9c2b8", "#b6bcc6", "#a8b4bf", "#d6c4b0", "#b89a86", "#9aa6b2", "#e2d9cc", "#c7ced8", "#d4b8a6", "#bcc8c0"];
  const signTex = signTexture(THREE);
  disposables.push(signTex);
  const signMat = bendable(new THREE.MeshBasicMaterial({ map: signTex, color: new THREE.Color(pal.dark ? "#ffffff" : "#8a8a8a") }));
  const signs = addInstanced(geo(new THREE.BoxGeometry(2.2, 1.1, 0.16)), signMat, 40);
  const neon = ["#ff4fa3", "#22d3ee", "#fbbf24", "#a78bfa", "#34d399", "#fb7185", "#f97316"];
  const fillRow = (side, front, cls, gap, signsToo) => {
    for (let b = 0; b < BLOCKS; b++) {
      let cursor = -FAR + b * (BLOCK + GAP) + 1;
      const end = cursor + BLOCK - 1;
      while (cursor < end - 8) {
        const c = classes[typeof cls === "function" ? cls() : cls];
        const w = Math.min(rand(c.w[0], c.w[1]), end - cursor), h = rand(c.h[0], c.h[1]), d = rand(c.d[0], c.d[1]);
        const z = cursor + w / 2, x = side * (front + d / 2);
        place(c.entry, x, h / 2, z, d, h, w, shades[Math.floor(Math.random() * shades.length)]);
        if (signsToo && Math.random() < 0.5 && signs.items.length < 40) place(signs, side * (front - 1.0), rand(3.4, Math.min(h - 1.5, 7.5)), z + rand(-w / 3, w / 3), rand(0.8, 1.3), rand(0.8, 1.3), 1, neon[Math.floor(Math.random() * neon.length)]);
        cursor += w + rand(gap[0], gap[1]);
      }
    }
  };
  for (const side of [-1, 1]) {
    fillRow(side, 10.6, () => (Math.random() < 0.6 ? "mid" : "low"), [0.6, 2.2], true);
    fillRow(side, 30, "tall", [2, 9], false);
  }
  for (const c of Object.values(classes)) {
    c.entry.mesh.instanceColor.needsUpdate = true;
  }
  signs.mesh.instanceColor.needsUpdate = true;

  // cross streets and zebra crossings at the block gaps
  const streetMat = bendable(new THREE.MeshLambertMaterial({ color: new THREE.Color("#45464c") }));
  const streets = addInstanced(geo(new THREE.BoxGeometry(1, 1, 1)), streetMat, BLOCKS * 2);
  const stripeMat = bendable(new THREE.MeshLambertMaterial({ color: new THREE.Color("#e8e6df") }));
  const stripes = addInstanced(geo(new THREE.BoxGeometry(0.6, 0.02, 2.6)), stripeMat, BLOCKS * 12);
  for (let b = 0; b < BLOCKS; b++) {
    const zGap = -FAR + b * (BLOCK + GAP) + BLOCK + GAP / 2;
    for (const side of [-1, 1]) place(streets, side * 37, 0.085, zGap, 60, 0.17, GAP - 2);
    for (let s = 0; s < 12; s++) place(stripes, -6.05 + s * 1.1, 0.01, zGap - GAP / 2 + 2.6, 1, 1, 1);
  }

  // street lamps (alternating sides) with a glow and a pool of light at night, trees between them
  const metalMat = bendable(new THREE.MeshLambertMaterial({ color: new THREE.Color("#4a4d55") }));
  const poles = addInstanced(geo(new THREE.CylinderGeometry(0.08, 0.13, 8, 6)), metalMat, 14);
  const arms = addInstanced(geo(new THREE.BoxGeometry(3.4, 0.12, 0.12)), metalMat, 14);
  const heads = addInstanced(geo(new THREE.BoxGeometry(0.7, 0.2, 0.3)), metalMat, 14);
  const lampGlowMat = bendable(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color("#ffe3a3"), transparent: true, opacity: pal.dark ? 0.95 : 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const poolMat = bendable(new THREE.MeshBasicMaterial({ map: glowTex, color: new THREE.Color("#ffd28a"), transparent: true, opacity: pal.dark ? 0.32 : 0, depthWrite: false, blending: THREE.AdditiveBlending }));
  const poolGeo = geo(new THREE.PlaneGeometry(10, 16));
  const lamps = [];
  const trunkMat = bendable(new THREE.MeshLambertMaterial({ color: new THREE.Color("#6b4a2f") }));
  const crownMat = bendable(new THREE.MeshLambertMaterial({ flatShading: true }));
  const trunks = addInstanced(geo(new THREE.CylinderGeometry(0.12, 0.2, 2.4, 5)), trunkMat, 30);
  const crowns = addInstanced(geo(new THREE.IcosahedronGeometry(1.5, 0)), crownMat, 30);
  for (let z = -FAR + 8, i = 0; z < NEAR; z += 28, i++) {
    const side = i % 2 ? 1 : -1;
    place(poles, side * 8.6, 4, z, 1, 1, 1);
    place(arms, side * 6.9, 7.95, z, 1, 1, 1);
    place(heads, side * 5.4, 7.85, z, 1, 1, 1);
    const glow = new THREE.Sprite(lampGlowMat);
    glow.scale.set(2.6, 1.8, 1);
    const pool = new THREE.Mesh(poolGeo, poolMat);
    pool.rotation.x = -Math.PI / 2;
    scene.add(glow, pool);
    lamps.push({ z, side, glow, pool });
    for (const s of [-1, 1]) {
      const tz = z + 14 + rand(-3, 3);
      if (tz < NEAR - 2) {
        const k = rand(0.8, 1.3);
        place(trunks, s * 9.4, 1.36, tz, 1, 1, 1);
        place(crowns, s * 9.4, 3.5, tz, k, k * rand(0.9, 1.3), k, ["#3f8a3a", "#4f9d3f", "#2f7a33", "#6aa84f"][i % 4]);
      }
    }
  }
  crowns.mesh.instanceColor.needsUpdate = true;

  // other traffic: oncoming cars on the far side, slower and faster cars in our lanes
  const carBodyGeo = geo(new THREE.BoxGeometry(1.8, 0.62, 4.3)), cabinGeo = geo(new THREE.BoxGeometry(1.6, 0.55, 2.2)), wheelGeo = geo(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 10));
  wheelGeo.rotateZ(Math.PI / 2);
  const glassMat = bendable(new THREE.MeshPhongMaterial({ color: new THREE.Color("#1f2937"), shininess: 90, specular: new THREE.Color("#8899aa") }));
  const tyreMat = bendable(new THREE.MeshLambertMaterial({ color: new THREE.Color("#15171c") }));
  const carMats = ["#e5e7eb", "#1f2937", "#b91c1c", "#1d4ed8", "#9ca3af", "#f59e0b", "#0f766e", "#f3f4f6"].map((c) => bendable(new THREE.MeshPhongMaterial({ color: new THREE.Color(c), shininess: 70, specular: new THREE.Color("#777777") })));
  const headMat = bendable(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color("#fff7d6"), transparent: true, opacity: pal.dark ? 0.95 : 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  const tailMat = bendable(new THREE.SpriteMaterial({ map: glowTex, color: new THREE.Color("#ff2a2a"), transparent: true, opacity: pal.dark ? 0.9 : 0.55, depthWrite: false, blending: THREE.AdditiveBlending }));
  const makeCar = (oncoming) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(carBodyGeo, carMats[Math.floor(Math.random() * carMats.length)]);
    body.position.y = 0.62;
    const cabin = new THREE.Mesh(cabinGeo, glassMat);
    cabin.position.set(0, 1.18, 0.2);
    g.add(body, cabin);
    for (const [wx, wz] of [[0.86, 1.35], [-0.86, 1.35], [0.86, -1.35], [-0.86, -1.35]]) {
      const w = new THREE.Mesh(wheelGeo, tyreMat);
      w.position.set(wx, 0.34, wz);
      g.add(w);
    }
    for (const x of [-0.62, 0.62]) {
      const h = new THREE.Sprite(headMat);
      h.scale.set(1, 0.55, 1);
      h.position.set(x, 0.66, -2.2);
      const t = new THREE.Sprite(tailMat);
      t.scale.set(0.6, 0.35, 1);
      t.position.set(x, 0.72, 2.2);
      g.add(h, t);
    }
    if (oncoming) g.rotation.y = Math.PI;
    scene.add(g);
    return g;
  };
  const oncoming = [], ahead = [];
  for (let i = 0; i < (preview ? 2 : 4); i++) oncoming.push({ g: makeCar(true), x: Math.random() < 0.5 ? 1.75 : 5.25, z: rand(-FAR, NEAR), speed: rand(10, 16) });
  for (let i = 0; i < (preview ? 1 : 3); i++) {
    const inOurLane = i === 0;
    ahead.push({ g: makeCar(false), x: inOurLane ? LANE : -5.25, tx: inOurLane ? LANE : -5.25, z: rand(-FAR + 20, -30), rel: inOurLane ? rand(-2.5, -0.5) : rand(-3, 3) });
  }

  // our car: bonnet in the accent colour and a steering wheel, with the camera in the driver's seat
  const car = new THREE.Group();
  car.position.set(LANE, 0, 0);
  scene.add(car);
  const bonnetMat = new THREE.MeshPhongMaterial({ color: new THREE.Color(pal.accent), shininess: 110, specular: new THREE.Color("#b8bcc4") });
  // the bonnet is a shallow arc (a slice of a wide cylinder) so it shades softly, nose dipping slightly
  const bonnet = new THREE.Mesh(geo(new THREE.CylinderGeometry(3, 3, 1.3, 20, 1, true, -0.3, 0.6)), bonnetMat);
  bonnet.rotation.x = -Math.PI / 2;
  bonnet.position.set(0, -3 + 0.8, -1.7);
  const nose = new THREE.Group();
  nose.rotation.x = -0.05;
  nose.add(bonnet);
  const cowlMat = new THREE.MeshPhongMaterial({ color: new THREE.Color("#1a1c22"), shininess: 20 });
  const cowl = new THREE.Mesh(geo(new THREE.BoxGeometry(1.9, 0.06, 0.16)), cowlMat);
  cowl.position.set(0, 0.84, -1.02);
  car.add(nose, cowl);
  const wheel = new THREE.Group();
  wheel.position.set(0.4, 1.06, -0.5);
  wheel.rotation.x = -0.55;
  const rim = new THREE.Group();
  const wheelMat = new THREE.MeshPhongMaterial({ color: new THREE.Color("#1c1e24"), shininess: 40, specular: new THREE.Color("#666a72") });
  rim.add(new THREE.Mesh(geo(new THREE.TorusGeometry(0.17, 0.02, 8, 28)), wheelMat));
  const hub = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.06, 0.06, 0.03, 12)), wheelMat);
  hub.rotation.x = Math.PI / 2;
  rim.add(hub);
  const spokeGeo = geo(new THREE.BoxGeometry(0.022, 0.15, 0.022));
  for (const a of [0, Math.PI, -Math.PI / 2]) {
    const s = new THREE.Mesh(spokeGeo, wheelMat);
    s.position.set(Math.cos(a) * 0.09, Math.sin(a) * 0.09, 0);
    s.rotation.z = a + Math.PI / 2;
    rim.add(s);
  }
  wheel.add(rim);
  car.add(wheel);
  camera.position.set(0.4, 1.42, 0);
  camera.rotation.set(-0.02, 0, 0);
  car.add(camera);
  const cabinLight = new THREE.PointLight(new THREE.Color("#ffd9a0"), pal.dark ? 0.5 : 0, 3, 1.5);
  cabinLight.position.set(0.1, 1.15, -0.7);
  car.add(cabinLight);
  const headlights = new THREE.SpotLight(new THREE.Color("#fff4d6"), pal.dark ? 90 : 0, 80, 0.62, 0.8, 1.1);
  headlights.position.set(0, 0.75, -2.6);
  headlights.target.position.set(0, -0.2, -40);
  car.add(headlights, headlights.target);
  disposables.push(bonnetMat, cowlMat, wheelMat);
  const crownTint = (dark) => (dark ? "#8a9a86" : "#ffffff");
  crownMat.color.set(crownTint(pal.dark));

  // light and fog
  const hemi = new THREE.HemisphereLight(new THREE.Color(pal.dark ? "#2a3060" : "#cfe3ff"), new THREE.Color(pal.dark ? "#0e0e16" : "#8d8a80"), pal.dark ? 0.5 : 1.15);
  const key = new THREE.DirectionalLight(new THREE.Color(pal.dark ? "#8fa2ff" : "#fff0d2"), pal.dark ? 0.25 : 1.7);
  key.position.set(60, 90, -110);
  scene.add(hemi, key);
  scene.fog = new THREE.Fog(new THREE.Color(fogColor(pal.dark)), pal.dark ? 25 : 35, preview ? 120 : pal.dark ? 170 : 185);

  let bend = 0;
  const applyItems = (entry) => {
    for (let i = 0; i < entry.items.length; i++) {
      const it = entry.items[i];
      v3.set(it.x, it.y, wrapZ(it.z));
      sc.set(it.sx, it.sy, it.sz);
      m4.compose(v3, q0, sc);
      entry.mesh.setMatrixAt(i, m4);
    }
    entry.mesh.instanceMatrix.needsUpdate = true;
  };
  return {
    update(dt, t) {
      driven = (driven + SPEED * dt) % L;
      roadTex.offset.y = (roadTex.offset.y + (SPEED * dt) / 12) % 1;
      // the road curves: a slow wander of the bend, the wheel and a touch of yaw follow it
      const target = 0.00055 * Math.sin(t * 0.05) + 0.00035 * Math.sin(t * 0.13 + 1);
      bend += (target - bend) * Math.min(1, dt * 0.8);
      for (const m of bendMats) if (m.userData.shader) m.userData.shader.uniforms.uBend.value = bend;
      for (const e of instanced) applyItems(e);
      for (const l of lamps) {
        const z = wrapZ(l.z);
        l.glow.position.set(l.side * 5.4, 7.7, z);
        l.pool.position.set(l.side * 5.2, 0.02, z + 0.5);
      }
      for (const c of oncoming) {
        c.z += (SPEED + c.speed) * dt;
        if (c.z > NEAR + 6) {
          c.z = -FAR - rand(0, 40);
          c.x = Math.random() < 0.5 ? 1.75 : 5.25;
          c.speed = rand(10, 16);
        }
        c.g.position.set(c.x, 0, c.z);
      }
      for (const c of ahead) {
        c.z += c.rel * dt;
        if (c.x > -3 && c.z > -18 && c.rel > -0.3) c.tx = -5.25; // a slower car in our lane pulls over to let us by
        c.x += (c.tx - c.x) * Math.min(1, dt * 2.2);
        if (c.z < -FAR - 10) {
          c.z = NEAR + 8;
          c.x = c.tx = -5.25;
          c.rel = rand(-3.5, -1);
        } else if (c.z > NEAR + 8) {
          c.z = -FAR - rand(0, 30);
          c.x = c.tx = Math.random() < 0.5 ? LANE : -5.25;
          c.rel = rand(0.6, 3);
        }
        c.g.position.set(c.x, 0, c.z);
        c.g.rotation.y = (c.tx - c.x) * 0.25;
      }
      // the car drifts a little in its lane, the road hums through the seat, the wheel steers into the curve
      car.position.x = LANE + 0.18 * Math.sin(t * 0.29) + 0.05 * Math.sin(t * 0.9);
      car.position.y = 0.012 * Math.sin(t * 6.1) + 0.007 * Math.sin(t * 9.7);
      camera.rotation.set(-0.02 + 0.004 * Math.sin(t * 1.7), bend * 45 + 0.006 * Math.sin(t * 0.37), 0.004 * Math.sin(t * 2.3));
      rim.rotation.z = THREE.MathUtils.clamp(-bend * 420, -0.55, 0.55) + 0.02 * Math.sin(t * 1.1);
    },
    setPalette(p) {
      skyTex.dispose();
      skyTex = bandTexture(THREE, skyStops(p.dark));
      skyMat.map = skyTex;
      skyMat.needsUpdate = true;
      sunMat.opacity = p.dark ? 0 : 0.95;
      moonMat.opacity = p.dark ? 0.85 : 0;
      starMat.opacity = p.dark ? 0.8 : 0;
      skylineMat.color.set(p.dark ? "#1a1935" : "#c4d6e7");
      wallMat.emissiveIntensity = p.dark ? 1 : 0;
      signMat.color.set(p.dark ? "#ffffff" : "#8a8a8a");
      crownMat.color.set(crownTint(p.dark));
      cabinLight.intensity = p.dark ? 0.5 : 0;
      lampGlowMat.opacity = p.dark ? 0.95 : 0;
      poolMat.opacity = p.dark ? 0.32 : 0;
      headMat.opacity = p.dark ? 0.95 : 0.35;
      tailMat.opacity = p.dark ? 0.9 : 0.55;
      headlights.intensity = p.dark ? 90 : 0;
      bonnetMat.color.set(p.accent);
      hemi.color.set(p.dark ? "#2a3060" : "#cfe3ff");
      hemi.groundColor.set(p.dark ? "#0e0e16" : "#8d8a80");
      hemi.intensity = p.dark ? 0.5 : 1.15;
      key.color.set(p.dark ? "#8fa2ff" : "#fff0d2");
      key.intensity = p.dark ? 0.25 : 1.7;
      scene.fog.color.set(fogColor(p.dark));
      scene.fog.near = p.dark ? 25 : 35;
      scene.fog.far = preview ? 120 : p.dark ? 170 : 185;
    },
    dispose() {
      disposables.forEach((d) => d.dispose());
      skyTex.dispose();
      tex.day.dispose();
      tex.lit.dispose();
      scene.fog = null;
    },
  };
}

/* ---------- Neural network: hundreds of glowing nodes, links that come and go, signals hopping along them ---------- */
const NEURAL_COMMON = /* glsl */ `
  uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3;
  uniform vec2 uPointer; uniform float uPointerOn; uniform float uAspect;
  attribute float aHue;
  varying vec3 vCol;
  /* hue < 0 leans to the third colour, > 0 to the second, 0 is the accent */
  vec3 hueColor(float h) { return mix(uC1, h < 0.0 ? uC3 : uC2, abs(h)); }
  /* 1 next to the mouse pointer, 0 away from it (screen space, so it costs nothing on the CPU) */
  float nearPointer(vec4 clip) {
    vec2 d = (clip.xy / clip.w - uPointer) * vec2(uAspect, 1.0);
    return exp(-dot(d, d) * 14.0) * uPointerOn;
  }
  float depthFade(float viewZ) { return mix(1.0, 0.36, clamp((-viewZ - 10.0) / 13.0, 0.0, 1.0)); }
`;
const NEURAL_POINT_VS = /* glsl */ `
  ${NEURAL_COMMON}
  uniform float uTime; uniform float uPx;
  attribute float aSize; attribute float aSeed; attribute float aAct;
  varying float vGlow; varying float vAct;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vAct = clamp(aAct + nearPointer(gl_Position) * 0.7, 0.0, 1.0);
    vGlow = depthFade(mv.z) * (0.82 + 0.18 * sin(uTime * 0.9 + aSeed));
    vCol = hueColor(aHue);
    gl_PointSize = min(128.0, aSize * (1.0 + vAct * 0.6) * uPx / -mv.z);
  }
`;
const NEURAL_POINT_FS = /* glsl */ `
  uniform float uDark;
  varying vec3 vCol; varying float vGlow; varying float vAct;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    float core = 1.0 - smoothstep(0.15, 0.3, sqrt(r2));
    float halo = exp(-r2 * 5.0) * (1.0 - r2);
    if (uDark > 0.5) {
      float k = clamp(halo * (0.5 + vAct) + core, 0.0, 1.0);
      gl_FragColor = vec4(vCol + vec3(core * (0.2 + 0.8 * vAct)), k * vGlow);
    } else {
      float a = clamp(core * 0.9 + halo * (0.28 + 0.6 * vAct), 0.0, 1.0);
      gl_FragColor = vec4(vCol * (1.0 - core * vAct * 0.45), a * vGlow); // on a pale page a firing node deepens instead of whitening
    }
    #include <colorspace_fragment>
  }
`;
const NEURAL_LINE_VS = /* glsl */ `
  ${NEURAL_COMMON}
  attribute float aAlpha;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vCol = hueColor(aHue);
    vA = min(1.0, aAlpha * (1.0 + nearPointer(gl_Position) * 1.6)) * depthFade(mv.z);
  }
`;
const NEURAL_LINE_FS = /* glsl */ `
  uniform float uLine;
  varying vec3 vCol; varying float vA;
  void main() {
    gl_FragColor = vec4(vCol, vA * uLine);
    #include <colorspace_fragment>
  }
`;

function neural(THREE, scene, camera, pal, preview) {
  const MAXN = preview ? 70 : 340; // nodes; how many are live depends on the window's shape
  const MAXL = preview ? 320 : 1600; // link segments
  const MAXP = preview ? 10 : 48; // signals in flight
  const NB = 6; // neighbours remembered per node: where a signal may hop next
  const DOT = preview ? 2 : 1; // a preview tile is a few hundred pixels wide: bigger dots keep it readable
  const CAM_Z = 14, Z_FAR = -8, Z_NEAR = 3, MARGIN = 1.18, LINKS_PER_NODE = 5.2;
  const TAN = Math.tan((camera.fov * Math.PI) / 360);
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.position.set(0, 0, CAM_Z);
  camera.lookAt(0, 0, -2);

  // Nodes live in a unit box (u, v in -1..1) that is stretched over the view frustum at their own
  // depth, so the net fills a phone in portrait as well as an ultra-wide monitor.
  const u = new Float32Array(MAXN), v = new Float32Array(MAXN), z0 = new Float32Array(MAXN);
  const heading = new Float32Array(MAXN), turn = new Float32Array(MAXN), speed = new Float32Array(MAXN);
  const seed = new Float32Array(MAXN), hub = new Float32Array(MAXN), reach = new Float32Array(MAXN);
  const pos = new Float32Array(MAXN * 3), hue = new Float32Array(MAXN), size = new Float32Array(MAXN), act = new Float32Array(MAXN);
  const nb = new Int16Array(MAXN * NB), nbCount = new Uint8Array(MAXN);
  const hubs = [];
  for (let i = 0; i < MAXN; i++) {
    u[i] = rand(-1, 1); v[i] = rand(-1, 1);
    z0[i] = CAM_Z - Math.cbrt(rand((CAM_Z - Z_NEAR) ** 3, (CAM_Z - Z_FAR) ** 3)); // even density: the far end of the frustum is wider
    heading[i] = rand(0, 6.28); turn[i] = rand(-0.12, 0.12); speed[i] = rand(0.12, 0.36);
    seed[i] = rand(0, 6.28);
    const isHub = i % 17 === 5; // spread through the index range, so every live count keeps a few
    hub[i] = isHub ? 1.4 : 1;
    if (isHub) hubs.push(i);
    size[i] = (isHub ? rand(1.05, 1.35) : rand(0.46, 0.72)) * DOT;
    const h = Math.random();
    hue[i] = h < 0.5 ? rand(0, 0.25) : h < 0.8 ? rand(0.45, 1) : -rand(0.45, 1);
  }

  const uni = {
    uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() }, uC3: { value: new THREE.Color() },
    uDark: { value: 1 }, uLine: { value: 0.5 }, uTime: { value: 0 }, uPx: { value: 700 }, uAspect: { value: camera.aspect },
    uPointer: { value: new THREE.Vector2(0, 0) }, uPointerOn: { value: 0 },
  };
  const shader = (vs, fs) => new THREE.ShaderMaterial({ uniforms: uni, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: false });
  const pointMat = shader(NEURAL_POINT_VS, NEURAL_POINT_FS);
  const lineMat = shader(NEURAL_LINE_VS, NEURAL_LINE_FS);
  const dyn = (arr, n) => { const a = new THREE.BufferAttribute(arr, n); a.setUsage(THREE.DynamicDrawUsage); return a; };

  const nodeGeo = new THREE.BufferGeometry();
  const nodePos = dyn(pos, 3), nodeAct = dyn(act, 1);
  nodeGeo.setAttribute("position", nodePos);
  nodeGeo.setAttribute("aHue", new THREE.BufferAttribute(hue, 1));
  nodeGeo.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
  nodeGeo.setAttribute("aSeed", new THREE.BufferAttribute(seed, 1));
  nodeGeo.setAttribute("aAct", nodeAct);
  const nodes = new THREE.Points(nodeGeo, pointMat);

  const lPos = new Float32Array(MAXL * 6), lHue = new Float32Array(MAXL * 2), lAlpha = new Float32Array(MAXL * 2);
  const lineGeo = new THREE.BufferGeometry();
  const linePos = dyn(lPos, 3), lineHue = dyn(lHue, 1), lineAlpha = dyn(lAlpha, 1);
  lineGeo.setAttribute("position", linePos);
  lineGeo.setAttribute("aHue", lineHue);
  lineGeo.setAttribute("aAlpha", lineAlpha);
  const lines = new THREE.LineSegments(lineGeo, lineMat);

  // signals: bright sparks that run from one node to a neighbour and make it fire in turn
  const pFrom = new Int16Array(MAXP).fill(-1), pTo = new Int16Array(MAXP), pHops = new Uint8Array(MAXP);
  const pT = new Float32Array(MAXP), pRate = new Float32Array(MAXP);
  const pPos = new Float32Array(MAXP * 3), pHue = new Float32Array(MAXP), pSize = new Float32Array(MAXP);
  const pulseGeo = new THREE.BufferGeometry();
  const pulsePos = dyn(pPos, 3), pulseHue = dyn(pHue, 1), pulseSize = dyn(pSize, 1);
  pulseGeo.setAttribute("position", pulsePos);
  pulseGeo.setAttribute("aHue", pulseHue);
  pulseGeo.setAttribute("aSize", pulseSize);
  pulseGeo.setAttribute("aSeed", new THREE.BufferAttribute(new Float32Array(MAXP), 1));
  pulseGeo.setAttribute("aAct", new THREE.BufferAttribute(new Float32Array(MAXP).fill(1), 1));
  const pulses = new THREE.Points(pulseGeo, pointMat);

  [lines, nodes, pulses].forEach((o, i) => { o.frustumCulled = false; o.renderOrder = i + 1; scene.add(o); });
  const buf = new THREE.Vector2();
  lines.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(buf);
    uni.uPx.value = buf.y / (2 * TAN);
    uni.uAspect.value = buf.x / Math.max(1, buf.y);
  };

  // a few big soft glows far behind the net give it depth
  const glow = glowTexture(THREE);
  const hazes = [];
  for (let i = 0; i < (preview ? 2 : 3); i++) {
    const mat = new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, depthTest: false });
    const s = new THREE.Sprite(mat);
    s.scale.setScalar(rand(20, 28));
    s.position.set([-0.55, 0.6, 0.05][i], [0.3, -0.35, 0.75][i], -12);
    s.renderOrder = 0;
    scene.add(s);
    hazes.push({ s, mat, x: s.position.x, y: s.position.y, phase: rand(0, 6.28) });
  }

  function applyPalette(p) {
    pal = p;
    uni.uC1.value.set(p.dark ? p.accent : p.strong);
    uni.uC2.value.set(p.dark ? p.second : "#0891b2");
    uni.uC3.value.set(p.dark ? p.third : "#db2777");
    uni.uDark.value = p.dark ? 1 : 0;
    uni.uLine.value = (p.dark ? 0.8 : 0.62) * (preview ? 1.25 : 1);
    blend(THREE, pointMat, p.dark);
    blend(THREE, lineMat, p.dark);
    hazes.forEach((h, i) => {
      h.mat.color.set([p.accent, p.second, p.third][i]);
      h.mat.opacity = p.dark ? 0.17 : 0.13;
      blend(THREE, h.mat, p.dark);
    });
  }
  applyPalette(pal);

  let n = MAXN; // live nodes
  function launch(from, to, hops) {
    for (let k = 0; k < MAXP; k++) {
      if (pFrom[k] >= 0) continue;
      const dx = pos[to * 3] - pos[from * 3], dy = pos[to * 3 + 1] - pos[from * 3 + 1], dz = pos[to * 3 + 2] - pos[from * 3 + 2];
      pFrom[k] = from; pTo[k] = to; pHops[k] = hops; pT[k] = 0;
      pRate[k] = 4.2 / Math.max(0.6, Math.sqrt(dx * dx + dy * dy + dz * dz)); // about 4 units a second
      pHue[k] = hue[from];
      return;
    }
  }
  /** Node i lights up and, while the signal has hops left, passes it on to one or more neighbours. */
  function fire(i, hops, from) {
    act[i] = 1;
    const c = nbCount[i];
    if (!hops || !c) return;
    const outs = from < 0 ? (hub[i] > 1 ? 3 : 2) : Math.random() < 0.28 ? 2 : 1;
    for (let o = 0; o < outs; o++) {
      const j = nb[i * NB + ((Math.random() * c) | 0)];
      if (j !== from && j < n) launch(i, j, hops - 1);
    }
  }

  let nextSpark = 0.2, nextBurst = preview ? 3 : 6;
  function step(dt, t) {
    const aspect = camera.aspect;
    n = preview ? MAXN : Math.max(90, Math.min(MAXN, Math.round(165 * aspect)));
    // link radius that gives each node LINKS_PER_NODE neighbours on average in the frustum slab
    const vol = (4 * TAN * TAN * MARGIN * MARGIN * aspect * ((CAM_Z - Z_FAR) ** 3 - (CAM_Z - Z_NEAR) ** 3)) / 3;
    const R = Math.min(6, Math.max(2.6, Math.cbrt((3 * LINKS_PER_NODE * vol) / (4 * Math.PI * n))));
    const decay = Math.exp(-dt * 2.1);

    for (let i = 0; i < n; i++) {
      heading[i] += (turn[i] + 0.22 * Math.sin(t * 0.21 + seed[i])) * dt;
      const z = z0[i] + Math.sin(t * 0.17 + seed[i] * 2) * 1.3;
      const halfH = (CAM_Z - z) * TAN * MARGIN, halfW = halfH * aspect;
      u[i] += (Math.cos(heading[i]) * speed[i] * dt) / halfW;
      v[i] += (Math.sin(heading[i]) * speed[i] * dt) / halfH;
      if (u[i] > 1 || u[i] < -1) { u[i] = Math.max(-1, Math.min(1, u[i])); heading[i] = Math.PI - heading[i]; }
      if (v[i] > 1 || v[i] < -1) { v[i] = Math.max(-1, Math.min(1, v[i])); heading[i] = -heading[i]; }
      pos[i * 3] = u[i] * halfW; pos[i * 3 + 1] = v[i] * halfH; pos[i * 3 + 2] = z;
      // every node's reach breathes, so links come and go even between nodes that barely move
      reach[i] = R * hub[i] * (0.92 + 0.28 * Math.sin(t * 0.31 + seed[i] * 3));
      act[i] *= decay;
    }

    let L = 0;
    nbCount.fill(0);
    for (let a = 0; a < n; a++) {
      const ax = pos[a * 3], ay = pos[a * 3 + 1], az = pos[a * 3 + 2], ra = reach[a];
      for (let b = a + 1; b < n; b++) {
        const D = (ra + reach[b]) * 0.5;
        const dx = pos[b * 3] - ax;
        if (dx > D || dx < -D) continue;
        const dy = pos[b * 3 + 1] - ay;
        if (dy > D || dy < -D) continue;
        const dz = pos[b * 3 + 2] - az;
        const k = 1 - (dx * dx + dy * dy + dz * dz) / (D * D);
        if (k <= 0) continue;
        if (nbCount[a] < NB) nb[a * NB + nbCount[a]++] = b;
        if (nbCount[b] < NB) nb[b * NB + nbCount[b]++] = a;
        if (L >= MAXL) continue;
        const alpha = Math.min(1, k * 1.5) * (1 + 1.8 * Math.max(act[a], act[b])); // a firing node flashes its links
        const o = L * 6;
        lPos[o] = ax; lPos[o + 1] = ay; lPos[o + 2] = az;
        lPos[o + 3] = ax + dx; lPos[o + 4] = ay + dy; lPos[o + 5] = az + dz;
        lHue[L * 2] = hue[a]; lHue[L * 2 + 1] = hue[b];
        lAlpha[L * 2] = alpha; lAlpha[L * 2 + 1] = alpha;
        L++;
      }
    }

    for (let k = 0; k < MAXP; k++) {
      if (pFrom[k] < 0) { pSize[k] = 0; continue; }
      pT[k] += dt * pRate[k];
      const a = pFrom[k], b = pTo[k];
      if (pT[k] >= 1 || a >= n || b >= n) {
        pFrom[k] = -1; pSize[k] = 0;
        if (b < n) fire(b, pHops[k], a);
        continue;
      }
      const e = pT[k] * pT[k] * (3 - 2 * pT[k]);
      for (let c = 0; c < 3; c++) pPos[k * 3 + c] = pos[a * 3 + c] + (pos[b * 3 + c] - pos[a * 3 + c]) * e;
      pSize[k] = (0.34 + 0.2 * Math.sin(Math.PI * pT[k])) * DOT;
    }
    nextSpark -= dt;
    if (nextSpark <= 0) {
      nextSpark = preview ? rand(0.7, 1.5) : rand(0.3, 0.8);
      fire((Math.random() * n) | 0, 2 + ((Math.random() * 4) | 0), -1);
    }
    nextBurst -= dt;
    if (nextBurst <= 0) { // now and then a hub sets off a longer chain: a "thought" crossing the net
      nextBurst = rand(9, 15);
      const live = hubs.filter((i) => i < n);
      if (live.length) fire(live[(Math.random() * live.length) | 0], 8, -1);
    }

    const hazeH = (CAM_Z + 12) * TAN;
    for (const h of hazes) h.s.position.set(h.x * hazeH * aspect + Math.sin(t * 0.05 + h.phase) * 2, h.y * hazeH + Math.cos(t * 0.04 + h.phase) * 1.5, -12);

    nodeGeo.setDrawRange(0, n);
    lineGeo.setDrawRange(0, L * 2);
    nodePos.needsUpdate = nodeAct.needsUpdate = true;
    linePos.needsUpdate = lineHue.needsUpdate = lineAlpha.needsUpdate = true;
    pulsePos.needsUpdate = pulseHue.needsUpdate = pulseSize.needsUpdate = true;
    uni.uTime.value = t;
  }
  // warm up, so the very first frame (and the still frame shown when animation is off) is already a living net
  for (let i = 0; i < 45; i++) step(1 / 30, i / 30);

  // the net notices the mouse: nodes and links near the pointer glow a little (done in the shaders)
  const target = new THREE.Vector2();
  let movedAt = -1e9;
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    target.set((e.clientX / Math.max(1, window.innerWidth)) * 2 - 1, 1 - (e.clientY / Math.max(1, window.innerHeight)) * 2);
    movedAt = performance.now();
  };
  if (!preview) window.addEventListener("pointermove", onMove, { passive: true });

  return {
    update(dt, t) {
      step(dt, t);
      const on = performance.now() - movedAt < 3500 ? 1 : 0;
      uni.uPointerOn.value += (on - uni.uPointerOn.value) * Math.min(1, dt * 3);
      uni.uPointer.value.lerp(target, Math.min(1, dt * 7));
      camera.position.set(Math.sin(t * 0.07) * 0.9 * Math.min(1, camera.aspect), Math.cos(t * 0.05) * 0.5, CAM_Z);
      camera.lookAt(0, 0, -2);
    },
    setPalette: applyPalette,
    dispose() {
      window.removeEventListener("pointermove", onMove);
      [nodeGeo, lineGeo, pulseGeo, pointMat, lineMat, glow].forEach((d) => d.dispose());
      hazes.forEach((h) => h.mat.dispose());
    },
  };
}

/* ---------- Frozen peaks: ice mountains under falling snow — valley mist, a glowing lake, aurora, a lone climber ---------- */
const FROST_SNOW_VS = /* glsl */ `
  uniform float uTime; uniform float uPx; uniform float uWind; uniform vec3 uBox; uniform vec3 uOrigin;
  attribute vec3 aSeed; // fall speed, sway phase, flake size
  varying float vAlpha;
  void main() {
    // the whole snowfall is animated here: flakes fall, sway and drift, and wrap inside a box around the camera
    vec3 p = position;
    p.y = mod(position.y - uTime * aSeed.x, uBox.y);
    p.x = mod(position.x + uTime * uWind * (0.6 + aSeed.x * 0.25) + sin(uTime * 0.7 + aSeed.y) * 0.5, uBox.x);
    p.z = mod(position.z + cos(uTime * 0.5 + aSeed.y) * 0.4, uBox.z);
    vec4 mv = modelViewMatrix * vec4(p + uOrigin, 1.0);
    gl_Position = projectionMatrix * mv;
    float px = aSeed.z * uPx / -mv.z;
    gl_PointSize = clamp(px, 1.5, 72.0);
    // close flakes are big and out of focus: the same light spread over a larger disc
    vAlpha = clamp(8.0 / px, 0.3, 1.0) * smoothstep(0.3, 1.6, -mv.z) * (1.0 - 0.7 * smoothstep(28.0, 60.0, -mv.z));
  }
`;
const FROST_SNOW_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying float vAlpha;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float a = 1.0 - dot(p, p);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(uColor, a * a * vAlpha * uOpacity);
    #include <colorspace_fragment>
  }
`;
const FROST_AURORA_VS = /* glsl */ `
  uniform float uTime; uniform float uPhase;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec3 p = position;
    p.z += sin(p.x * 0.045 + uTime * 0.12 + uPhase) * 9.0 + sin(p.x * 0.11 - uTime * 0.2) * 3.5;
    p.y += sin(p.x * 0.03 + uTime * 0.1 + uPhase * 2.0) * 3.0;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const FROST_AURORA_FS = /* glsl */ `
  uniform float uTime; uniform float uPhase; uniform float uOpacity; uniform vec3 uLow; uniform vec3 uHigh;
  varying vec2 vUv;
  void main() {
    float x = vUv.x * 40.0;
    float rays = 0.55 + 0.45 * sin(x + sin(x * 0.37 + uTime * 0.3) * 2.0 + uTime * 0.25 + uPhase);
    rays *= 0.7 + 0.3 * sin(x * 2.7 - uTime * 0.4);
    float curtain = smoothstep(0.0, 0.1, vUv.y) * pow(1.0 - vUv.y, 1.7); // bright lower hem, fading upwards
    float ends = smoothstep(0.0, 0.18, vUv.x) * smoothstep(1.0, 0.82, vUv.x);
    gl_FragColor = vec4(mix(uLow, uHigh, smoothstep(0.04, 0.45, vUv.y)), curtain * rays * ends * uOpacity);
    #include <colorspace_fragment>
  }
`;

function frostpeaks(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  camera.far = 420; // resize() rebuilds the projection right after the build
  const CAM = { x: 0, y: 7, z: 14 };

  // value noise with a fixed seed: the range is composed (main summit right of centre, climber in the middle), not random
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263 + 1013904223) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; };
  const noise = (x, y) => {
    const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi;
    const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  };
  const ridged = (x, z, octaves) => { // sharp crests: folded noise, each octave turned so the grid never shows
    let sum = 0, norm = 0, a = 0.5;
    for (let o = 0; o < octaves; o++) { // keep the finest octave coarser than the mesh, or flat shading turns it into a checkerboard
      const n = 1 - Math.abs(noise(x, z) * 2 - 1);
      sum += n * n * a; norm += a; a *= 0.5;
      const nx = (x * 0.8 - z * 0.6) * 2.03, nz = (x * 0.6 + z * 0.8) * 2.03;
      x = nx + 17.3; z = nz - 9.1;
    }
    return sum / norm;
  };
  const bump = (x, z, px, pz, r, h) => h * Math.exp(-((x - px) ** 2 + (z - pz) ** 2) / (r * r));
  const LAKE = { x: 13, z: -36 };
  const mountainH = (x, z) => {
    const d = -z;
    const env = Math.max(smooth(24, 72, d), 0.6 * smooth(22, 60, Math.abs(x)) * smooth(-5, 25, d)); // a valley in front, flanks closing in
    const r = ridged(x * 0.022, z * 0.022, 4);
    let h = env * (3 + 30 * Math.pow(r, 1.7));
    const peaks = bump(x, z, 9, -80, 14, 36) + bump(x, z, -9, -72, 10, 20) + bump(x, z, -24, -86, 12, 27) + bump(x, z, 30, -88, 11, 22)
      + bump(x, z, -52, -92, 14, 24) + bump(x, z, 58, -96, 15, 21) + bump(x, z, -84, -74, 15, 16) + bump(x, z, 92, -84, 16, 15);
    h += peaks * (0.42 + 0.85 * r); // the crests of the noise carve each summit into aretes
    h += (noise(x * 0.15, z * 0.15) - 0.5) * 1.2 * (0.3 + env);
    return h - 2.8 * Math.exp(-(((x - LAKE.x) / 21) ** 2 + ((z - LAKE.z) / 13) ** 2)); // basin for the lake
  };
  const foreH = (x, z) => {
    const summit = 5.6 * Math.exp(-(x * x + z * z) / 5); // the pinnacle the climber stands on
    const t = smooth(-1, 12, z);
    const sx = x + 1.6 * t; // the ridge bends away to the left as it runs back under the camera
    const spine = (4.5 - 2.2 * t) * Math.exp(-(sx * sx) / (8 + 30 * t)) * smooth(-5, 0.5, z);
    const shoulder = bump(x, z, 3.4, 2.2, 2.4, 3.4) + bump(x, z, -4.2, 4.5, 2.8, 2.6);
    const base = Math.max(summit, spine, shoulder);
    const rough = (ridged(x * 0.16 + 9, z * 0.16 + 4, 2) - 0.45) * 3.2;
    return base + rough * (0.3 + 0.16 * base) * smooth(0, 1.5, x * x + z * z) - 0.6 - 4 * smooth(7, 14, Math.abs(x)) - 4 * smooth(-7, -13, z);
  };

  /** A flat-shaded height field with snow on the gentle faces and bare rock on the steep ones. */
  const TONES = { // rock far / rock near / valley ice / snow
    dark: ["#1a2540", "#131b30", "#34507f", "#eef5ff"].map((c) => new THREE.Color(c)),
    light: ["#56657f", "#475266", "#c9dcef", "#ffffff"].map((c) => new THREE.Color(c)),
  };
  const tmp = new THREE.Color(), white = new THREE.Color();
  const lands = [];
  const landMat = keep(new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
  function land(w, d, sx, sz, cz, heightAt, near) {
    const geo = keep(new THREE.PlaneGeometry(w, d, sx, sz));
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, cz);
    const p = geo.attributes.position, cell = (w / sx) * 0.3;
    for (let i = 0; i < p.count; i++) { // nudge the grid so the facets are not all alike
      const x = p.getX(i) + (hash(i, 7) - 0.5) * cell * 2, z = p.getZ(i) + (hash(i, 13) - 0.5) * cell * 2;
      p.setXYZ(i, x, heightAt(x, z), z);
    }
    geo.computeVertexNormals();
    // how much snow lies on each vertex, and how white it is: baked once, coloured per theme in paint()
    const nrm = geo.attributes.normal, snowK = new Float32Array(p.count), whiteK = new Float32Array(p.count);
    for (let i = 0; i < p.count; i++) {
      const h = p.getY(i);
      const ny = nrm.getY(i);
      // far range: snow above the snow line except on the steepest faces, bare dark slopes below, ice on the valley floor;
      // the outcrop in front: dark rock with snow only where it can lie
      snowK[i] = near ? smooth(0.78, 0.95, ny) * smooth(0.35, 0.6, noise(p.getX(i) * 0.5, p.getZ(i) * 0.5)) : Math.min(1, smooth(5, 16, h) * (1 - 0.9 * smooth(0.5, 0.78, 1 - ny)) + smooth(0.86, 0.97, ny));
      whiteK[i] = near ? 0.7 : smooth(1, 7, h);
    }
    const col = new THREE.BufferAttribute(new Float32Array(p.count * 3), 3);
    geo.setAttribute("color", col);
    scene.add(new THREE.Mesh(geo, landMat));
    lands.push((dark) => {
      const [rockFar, rockNear, ice, snow] = TONES[dark ? "dark" : "light"];
      for (let i = 0; i < p.count; i++) {
        tmp.copy(near ? rockNear : rockFar).lerp(white.copy(ice).lerp(snow, whiteK[i]), snowK[i]);
        col.setXYZ(i, tmp.r, tmp.g, tmp.b);
      }
      col.needsUpdate = true;
    });
  }
  land(320, 160, preview ? 84 : 176, preview ? 44 : 92, -62, mountainH, false);
  land(30, 26, preview ? 26 : 44, preview ? 22 : 38, -1, foreH, true);

  // sky: a gradient dome, stars, the moon (the sun on the light theme)
  const skyStops = (dark) => (dark
    ? [[0, "#020617"], [0.3, "#06122e"], [0.43, "#0c2554"], [0.5, "#1a3f7c"], [0.56, "#0a1a3d"], [1, "#0a1a3d"]]
    : [[0, "#3f86d6"], [0.3, "#79b6ee"], [0.43, "#b7dbf7"], [0.5, "#e8f4fd"], [0.56, "#dcebf7"], [1, "#dcebf7"]]);
  function skyTexture(dark) {
    const c = document.createElement("canvas");
    c.width = 8; c.height = 512;
    const g = c.getContext("2d");
    const grad = g.createLinearGradient(0, 0, 0, 512);
    skyStops(dark).forEach(([at, col]) => grad.addColorStop(at, col));
    g.fillStyle = grad;
    g.fillRect(0, 0, 8, 512);
    const tex = new THREE.CanvasTexture(c);
    if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  let skyTex = null; // made by applyPalette, again whenever the theme flips
  const skyMat = keep(new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false }));
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(320, 24, 24)), skyMat);
  sky.renderOrder = -3;
  scene.add(sky);

  const STARS = preview ? 220 : 700;
  const starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const a = rand(0, 6.28), e = Math.asin(rand(0.04, 1)); // upper hemisphere only
    starPos.set([Math.cos(a) * Math.cos(e) * 300, Math.sin(e) * 300, Math.sin(a) * Math.cos(e) * 300], i * 3);
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = keep(new THREE.PointsMaterial({ color: 0xe0ecff, size: preview ? 1.2 : 1.7, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -2;
  scene.add(stars);

  const glow = keep(glowTexture(THREE));
  const moonMat = keep(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, fog: false }));
  const moon = new THREE.Sprite(moonMat);
  const moonCore = new THREE.Sprite(moonMat);
  moon.position.set(-40, 101, -180); // in front of the aurora, clear of the summits, and near enough to the middle for a phone in portrait
  moonCore.position.copy(moon.position);
  moon.renderOrder = moonCore.renderOrder = -1;
  scene.add(moon, moonCore);

  // aurora: curtains of light far behind the range (dark theme only)
  const auroras = [];
  for (let i = 0; i < (preview ? 1 : 3); i++) {
    const mat = keep(new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPhase: { value: i * 2.1 }, uOpacity: { value: 0 }, uLow: { value: new THREE.Color() }, uHigh: { value: new THREE.Color() } },
      vertexShader: FROST_AURORA_VS, fragmentShader: FROST_AURORA_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    }));
    const m = new THREE.Mesh(keep(new THREE.PlaneGeometry(300, 60, preview ? 40 : 96, 1)), mat);
    m.position.set([-30, 60, -100][i], [112, 124, 104][i], [-215, -245, -190][i]);
    m.rotation.y = [0.15, -0.25, 0.4][i];
    scene.add(m);
    auroras.push({ mat, strength: [1, 0.7, 0.55][i] });
  }

  // the frozen lake glows up through the mist
  const lakeMat = keep(new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, fog: false }));
  const lakeGeo = keep(new THREE.PlaneGeometry(1, 1));
  lakeGeo.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lakeGeo, lakeMat);
  lake.position.set(LAKE.x, 0.35, LAKE.z);
  lake.scale.set(44, 1, 30);
  const lakeHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, fog: false })));
  lakeHalo.position.set(LAKE.x, 1.6, LAKE.z);
  lakeHalo.scale.set(46, 7, 1);
  scene.add(lake, lakeHalo);

  // mist lying in the valley, and spindrift streaming off the main summit
  const cloudTex = keep(cloudTexture(THREE));
  const mistMat = keep(new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false }));
  const mistGeo = keep(new THREE.PlaneGeometry(34, 9));
  const mists = [];
  for (let i = 0; i < (preview ? 4 : 10); i++) {
    const m = new THREE.Mesh(mistGeo, mistMat);
    m.position.set(rand(-90, 90), rand(0.5, 5), rand(-58, -10));
    m.scale.set(rand(1, 2.4), rand(0.8, 1.5), 1);
    scene.add(m);
    mists.push({ m, speed: rand(0.25, 0.7) });
  }
  const plumeMat = keep(new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false }));
  const plume = new THREE.Mesh(mistGeo, plumeMat);
  const TOP = { x: 9, z: -80 };
  plume.position.set(TOP.x + 13, mountainH(TOP.x, TOP.z) - 1, TOP.z - 2);
  plume.scale.set(1.1, 0.55, 1);
  scene.add(plume);

  // the climber: a small figure on the pinnacle, jacket in the accent colour
  const jacketMat = keep(new THREE.MeshLambertMaterial());
  const packMat = keep(new THREE.MeshLambertMaterial());
  const darkMat = keep(new THREE.MeshLambertMaterial({ color: 0x1e293b }));
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const climber = new THREE.Group();
  const part = (mat, w, h, d, x, y, z, parent = climber) => { const m = new THREE.Mesh(box, mat); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; };
  part(darkMat, 0.075, 0.27, 0.085, -0.055, 0.135, 0);
  part(darkMat, 0.075, 0.27, 0.085, 0.055, 0.135, 0);
  part(jacketMat, 0.21, 0.27, 0.13, 0, 0.4, 0);
  part(jacketMat, 0.06, 0.24, 0.075, -0.135, 0.39, 0);
  part(jacketMat, 0.06, 0.24, 0.075, 0.135, 0.39, 0);
  part(packMat, 0.16, 0.21, 0.085, 0, 0.41, 0.105);
  const head = new THREE.Group();
  head.position.set(0, 0.6, 0);
  part(jacketMat, 0.135, 0.135, 0.135, 0, 0, 0, head);
  climber.add(head);
  part(darkMat, 0.014, 0.5, 0.014, 0.19, 0.25, -0.05).rotation.z = -0.12; // trekking pole
  climber.position.set(0, foreH(0, 0) - 0.02, 0);
  climber.scale.setScalar(1.7);
  scene.add(climber);
  const lampMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffc46b, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  const lamp = new THREE.Sprite(lampMat);
  lamp.position.set(0, climber.position.y + 1.03, -0.15);
  lamp.scale.setScalar(1.05);
  scene.add(lamp);

  // snowfall
  const FLAKES = preview ? 600 : 3200;
  const BOX = { x: 64, y: 36, z: 62 };
  const flakePos = new Float32Array(FLAKES * 3), flakeSeed = new Float32Array(FLAKES * 3);
  for (let i = 0; i < FLAKES; i++) {
    flakePos.set([rand(0, BOX.x), rand(0, BOX.y), rand(0, BOX.z)], i * 3);
    flakeSeed.set([rand(0.9, 2.4), rand(0, 6.28), (i % 7 === 0 ? rand(0.18, 0.34) : rand(0.06, 0.15)) * (preview ? 1.8 : 1)], i * 3);
  }
  const snowGeo = keep(new THREE.BufferGeometry());
  snowGeo.setAttribute("position", new THREE.BufferAttribute(flakePos, 3));
  snowGeo.setAttribute("aSeed", new THREE.BufferAttribute(flakeSeed, 3));
  const snowUni = {
    uTime: { value: 0 }, uPx: { value: 700 }, uWind: { value: 0.9 }, uColor: { value: new THREE.Color() }, uOpacity: { value: 1 },
    uBox: { value: new THREE.Vector3(BOX.x, BOX.y, BOX.z) }, uOrigin: { value: new THREE.Vector3(-BOX.x / 2, -7, CAM.z + 1 - BOX.z) },
  };
  const snowMat = keep(new THREE.ShaderMaterial({ uniforms: snowUni, vertexShader: FROST_SNOW_VS, fragmentShader: FROST_SNOW_FS, transparent: true, depthWrite: false }));
  const snow = new THREE.Points(snowGeo, snowMat);
  snow.frustumCulled = false;
  snow.renderOrder = 5;
  const buf = new THREE.Vector2();
  const TAN = Math.tan((camera.fov * Math.PI) / 360);
  snow.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); snowUni.uPx.value = buf.y / (2 * TAN); };
  scene.add(snow);

  // a shooting star now and then (dark theme only)
  const streakMat = keep(new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  const streak = new THREE.Mesh(keep(new THREE.PlaneGeometry(16, 0.5)), streakMat);
  streak.visible = false;
  scene.add(streak);
  const shot = { at: -1, next: rand(4, 9), x: 0, y: 0, dx: 0, dy: 0 };

  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(-70, 60, 45);
  scene.add(hemi, key);
  scene.fog = new THREE.FogExp2(0x0a1a3d, 0.0062);

  const mixed = new THREE.Color();
  function applyPalette(p) {
    if (!skyTex || p.dark !== pal.dark) { // only when the theme flips: a new sky and repainted slopes
      skyTex?.dispose(); skyTex = skyTexture(p.dark); skyMat.map = skyTex; skyMat.needsUpdate = true;
      lands.forEach((paint) => paint(p.dark));
    }
    pal = p;
    scene.fog.color.set(p.dark ? "#0a1a3d" : "#dcebf7");
    hemi.color.set(p.dark ? "#3559a8" : "#e3f0ff"); hemi.groundColor.set(p.dark ? "#0a1226" : "#93a7c2"); hemi.intensity = p.dark ? 0.95 : 1.3;
    key.color.set(p.dark ? "#bcd3ff" : "#fff1d6"); key.intensity = p.dark ? 4.6 : 2.3;
    starMat.opacity = p.dark ? 0.9 : 0;
    moonMat.color.set(p.dark ? "#dbe7ff" : "#fff4d6"); moonMat.opacity = p.dark ? 0.7 : 0.9;
    moon.scale.setScalar(p.dark ? 52 : 120); moonCore.scale.setScalar(p.dark ? 14 : 34);
    for (const a of auroras) { a.mat.uniforms.uLow.value.set("#34d399"); a.mat.uniforms.uHigh.value.set(p.accent); a.mat.uniforms.uOpacity.value = p.dark ? 0.85 * a.strength : 0; }
    lakeMat.color.copy(mixed.set("#7dd3fc").lerp(tmp.set(p.accent), 0.12)); lakeMat.opacity = p.dark ? 1 : 0.5;
    lakeHalo.material.color.copy(lakeMat.color); lakeHalo.material.opacity = p.dark ? 0.95 : 0.2;
    blend(THREE, lakeMat, p.dark); blend(THREE, lakeHalo.material, p.dark);
    mistMat.color.set(p.dark ? "#4473cf" : "#ffffff"); mistMat.opacity = p.dark ? 0.36 : 0.6;
    plumeMat.color.set(p.dark ? "#9db9ee" : "#ffffff"); plumeMat.opacity = p.dark ? 0.3 : 0.7;
    jacketMat.color.set(p.accent); jacketMat.emissive.set(p.accent); jacketMat.emissiveIntensity = p.dark ? 0.55 : 0.1;
    packMat.color.set(p.strong); packMat.emissive.set(p.strong); packMat.emissiveIntensity = p.dark ? 0.25 : 0;
    lampMat.opacity = p.dark ? 0.55 : 0;
    snowUni.uColor.value.set(p.dark ? "#eaf2ff" : "#ffffff"); snowUni.uOpacity.value = p.dark ? 0.95 : 1;
    blend(THREE, snowMat, p.dark);
  }
  applyPalette(pal);

  camera.position.set(CAM.x, CAM.y, CAM.z);
  camera.lookAt(0, 11, -40);
  return {
    update(dt, t) {
      snowUni.uTime.value = t;
      snowUni.uWind.value = 0.9 + Math.sin(t * 0.13) * 0.6; // gusts
      for (const a of auroras) a.mat.uniforms.uTime.value = t;
      for (const c of mists) { c.m.position.x += dt * c.speed; if (c.m.position.x > 110) c.m.position.x = -110; }
      plumeMat.opacity = (pal.dark ? 0.3 : 0.7) * (0.75 + 0.25 * Math.sin(t * 0.5));
      plume.scale.x = 1.1 + Math.sin(t * 0.31) * 0.14;
      head.rotation.y = Math.sin(t * 0.23) * 0.5; // looking along the range
      climber.scale.y = 1.7 * (1 + Math.sin(t * 1.4) * 0.008);
      lamp.scale.setScalar(1.05 + Math.sin(t * 7.3) * 0.04 + Math.sin(t * 2.1) * 0.06);
      if (pal.dark) {
        if (shot.at < 0 && (shot.next -= dt) <= 0) {
          const dir = Math.random() < 0.5 ? -1 : 1, ang = rand(0.25, 0.6);
          Object.assign(shot, { at: 0, x: rand(-120, 120), y: rand(95, 150), dx: Math.cos(ang) * dir * 150, dy: -Math.sin(ang) * 150 });
          streak.rotation.z = Math.atan2(shot.dy, shot.dx);
          streak.visible = true;
        }
        if (shot.at >= 0) {
          shot.at += dt / 0.8;
          streak.position.set(shot.x + shot.dx * shot.at * 0.8, shot.y + shot.dy * shot.at * 0.8, -260);
          streakMat.opacity = Math.sin(Math.PI * Math.min(1, shot.at)) * 0.9;
          if (shot.at >= 1) { shot.at = -1; shot.next = rand(7, 16); streak.visible = false; }
        }
      } else if (streak.visible) { streak.visible = false; shot.at = -1; }
      camera.position.set(CAM.x + Math.sin(t * 0.06) * 1.1, CAM.y + Math.sin(t * 0.09) * 0.35, CAM.z + Math.cos(t * 0.05) * 0.6);
      camera.lookAt(0, 11, -40);
    },
    setPalette: applyPalette,
    dispose() { disposables.forEach((d) => d.dispose()); skyTex?.dispose(); scene.fog = null; },
  };
}

/* ---------- Lucky cat: a beckoning maneki-neko among gold, with coins and notes raining down ---------- */
const LUCKY_SPARK_VS = /* glsl */ `
  uniform float uTime; uniform float uPx; uniform float uMaxPx;
  attribute float aPhase; attribute float aSize;
  varying float vA;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    float tw = 0.5 + 0.5 * sin(uTime * 2.6 + aPhase); // each sparkle blinks on its own beat
    vA = tw * tw;
    gl_PointSize = clamp(aSize * (0.5 + tw) * uPx / -mv.z, 2.0, uMaxPx);
  }
`;
const LUCKY_SPARK_FS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uColor; uniform float uOpacity;
  varying float vA;
  void main() {
    vec4 t = texture2D(uMap, gl_PointCoord);
    gl_FragColor = vec4(uColor, t.a * vA * uOpacity);
    #include <colorspace_fragment>
  }
`;
/** Draw with a 2D canvas and hand it over as a texture. */
function canvasTexture(THREE, w, h, draw) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  draw(c.getContext("2d"), w, h);
  const tex = new THREE.CanvasTexture(c);
  if (THREE.SRGBColorSpace) tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Several placed geometries as one, so a whole ingot or lantern is a single draw. */
function mergeParts(THREE, parts) {
  const chunks = parts.map(([geo, m]) => { const g = geo.toNonIndexed(); g.applyMatrix4(m); return g; });
  const n = chunks.reduce((s, g) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), uv = new Float32Array(n * 2);
  let o = 0;
  for (const g of chunks) {
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, o * 2);
    o += g.attributes.position.count;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return out;
}

function luckycat(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), E = new THREE.Euler(), S = new THREE.Vector3();
  const place = (x, y, z, rx = 0, ry = 0, rz = 0, s = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(s, s, s));

  // shared shapes and materials
  const sphere = keep(new THREE.SphereGeometry(1, 28, 20));
  const blob = keep(new THREE.SphereGeometry(1, 14, 10)); // for the small merged shapes
  const box = keep(new THREE.BoxGeometry(1, 1, 1));
  const fur = keep(new THREE.MeshStandardMaterial({ color: 0xfffaf4, roughness: 0.62 }));
  const pink = keep(new THREE.MeshStandardMaterial({ color: 0xffa3b1, roughness: 0.7 }));
  const blushMat = keep(new THREE.MeshBasicMaterial({ color: 0xffb3bd, transparent: true, opacity: 0.8 }));
  const dark = keep(new THREE.MeshStandardMaterial({ color: 0x3b2a2a, roughness: 0.5 }));
  const red = keep(new THREE.MeshStandardMaterial({ color: 0xe0343f, roughness: 0.55 }));
  const gold = keep(new THREE.MeshPhongMaterial({ color: 0xf6c544, specular: 0xfff0c2, shininess: 80, emissive: 0x4a3205 }));
  const accentMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.5 }));

  const mesh = (geo, mat, x, y, z, sx = 1, sy = sx, sz = sx, parent = scene) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.scale.set(sx, sy, sz);
    parent.add(m);
    return m;
  };

  /* --- the cat --- */
  const cat = new THREE.Group();
  scene.add(cat);
  mesh(sphere, fur, 0, 1.02, 0, 1.08, 1, 0.95); // body
  const headPivot = new THREE.Group();
  headPivot.position.set(0, 1.85, 0.05);
  cat.add(headPivot);
  const head = mesh(sphere, fur, 0, 0.55, 0, 1.02, 0.9, 0.92, headPivot);
  const face = new THREE.Group(); // features sit just outside the head sphere
  face.position.set(0, 0.55, 0);
  headPivot.add(face);
  const earGeo = keep(new THREE.ConeGeometry(0.3, 0.6, 20));
  const innerEarGeo = keep(new THREE.CircleGeometry(0.19, 3)); // a flat pink triangle
  innerEarGeo.rotateZ(Math.PI / 2);
  for (const side of [-1, 1]) {
    const ear = mesh(earGeo, fur, side * 0.56, 1.3, -0.04, 1, 1, 0.5, headPivot);
    ear.rotation.z = -side * 0.3;
    const inner = mesh(innerEarGeo, pink, 0, -0.05, 0.17, 0.62, 0.95, 1, ear); // just in front of the cone's face
    inner.rotation.x = -0.2;
  }
  const arc = keep(new THREE.TorusGeometry(0.15, 0.03, 8, 20, Math.PI));
  for (const side of [-1, 1]) {
    const eye = mesh(arc, dark, side * 0.34, 0.12, 0.84, 1, 1, 1, face); // ^ ^ happy closed eyes
    eye.rotation.set(0, 0, 0);
    mesh(sphere, blushMat, side * 0.6, -0.14, 0.72, 0.17, 0.11, 0.06, face); // blush
    for (let w = 0; w < 3; w++) { // three whisker strokes fanning out from the cheek
      const stroke = mesh(box, red, side * 0.86, -0.04 - w * 0.1, 0.6, 0.34, 0.024, 0.02, face);
      stroke.rotation.set(0, side * 0.95, side * (1 - w) * 0.22);
    }
  }
  mesh(sphere, pink, 0, -0.03, 0.92, 0.08, 0.055, 0.05, face); // nose
  const halfDisc = keep(new THREE.CircleGeometry(1, 24, Math.PI, Math.PI)); // lower half, flat edge on top
  mesh(halfDisc, keep(new THREE.MeshBasicMaterial({ color: 0x5a2028 })), 0, -0.11, 0.93, 0.2, 0.2, 1, face); // open mouth
  mesh(sphere, keep(new THREE.MeshBasicMaterial({ color: 0xff7a86 })), 0, -0.24, 0.935, 0.1, 0.055, 0.02, face); // tongue
  const lip = mesh(keep(new THREE.TorusGeometry(0.2, 0.022, 8, 28, Math.PI)), dark, 0, -0.11, 0.94, 1, 1, 1, face);
  lip.rotation.z = Math.PI; // bows down: a wide smile
  // collar with a bell and a bow in the accent colour
  const collar = mesh(keep(new THREE.TorusGeometry(0.8, 0.075, 10, 40)), accentMat, 0, 1.98, 0.08, 1, 1, 1, cat);
  collar.rotation.x = Math.PI / 2 - 0.42;
  const bell = mesh(sphere, gold, 0, 1.72, 0.84, 0.13, 0.13, 0.13, cat);
  const bow = new THREE.Group();
  bow.position.set(0.5, 1.9, 0.66);
  bow.rotation.y = 0.6;
  cat.add(bow);
  mesh(sphere, accentMat, -0.16, 0.05, 0, 0.17, 0.11, 0.07, bow);
  mesh(sphere, accentMat, 0.16, 0.05, 0, 0.17, 0.11, 0.07, bow);
  mesh(sphere, accentMat, 0, 0.03, 0.02, 0.07, 0.07, 0.07, bow);
  // ingot on the head, like a little crown
  const ingotGeo = keep(mergeParts(THREE, [
    [blob, place(0, 0, 0, 0, 0, 0, 1).scale(new THREE.Vector3(0.5, 0.2, 0.3))],
    [blob, place(0, 0.14, 0, 0, 0, 0, 1).scale(new THREE.Vector3(0.28, 0.2, 0.24))],
    [blob, place(-0.44, 0.14, 0, 0, 0, 0, 1).scale(new THREE.Vector3(0.14, 0.17, 0.2))],
    [blob, place(0.44, 0.14, 0, 0, 0, 0, 1).scale(new THREE.Vector3(0.14, 0.17, 0.2))],
  ]));
  mesh(ingotGeo, gold, 0, 1.36, 0.1, 0.55, 0.55, 0.55, headPivot);
  // the beckoning paw: pivot at the shoulder, waving from the elbow
  const arm = new THREE.Group();
  arm.position.set(0.86, 1.55, 0.25);
  cat.add(arm);
  const capsule = keep(new THREE.CapsuleGeometry(0.24, 0.5, 6, 14));
  mesh(capsule, fur, 0, 0.35, 0, 1, 1, 1, arm);
  const paw = new THREE.Group();
  paw.position.set(0, 0.78, 0);
  arm.add(paw);
  mesh(sphere, fur, 0, 0, 0, 0.3, 0.28, 0.24, paw);
  mesh(sphere, pink, 0, -0.03, 0.2, 0.13, 0.11, 0.05, paw); // big pad
  for (let i = 0; i < 3; i++) mesh(sphere, pink, (i - 1) * 0.13, 0.16 - Math.abs(i - 1) * 0.03, 0.2, 0.055, 0.055, 0.04, paw);
  // the other paw rests on a plaque
  const shoulder = new THREE.Vector3(-0.8, 1.42, 0.38), restPaw = new THREE.Vector3(-0.5, 1.02, 1.1); // on top of the plaque
  const restArm = new THREE.Group();
  restArm.position.copy(shoulder);
  restArm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), restPaw.clone().sub(shoulder).normalize()); // capsule axis along the arm
  cat.add(restArm);
  const restLen = restPaw.distanceTo(shoulder);
  mesh(keep(new THREE.CapsuleGeometry(0.23, restLen - 0.2, 6, 14)), fur, 0, restLen / 2 - 0.05, 0, 1, 1, 1, restArm);
  mesh(sphere, fur, restPaw.x, restPaw.y, restPaw.z, 0.27, 0.22, 0.27, cat); // the paw on the plaque
  const plaqueTex = keep(canvasTexture(THREE, 256, 256, (g, w, h) => {
    g.fillStyle = "#fffaf2"; g.fillRect(0, 0, w, h);
    g.lineWidth = 14; g.strokeStyle = "#c9a227"; g.strokeRect(14, 14, w - 28, h - 28);
    g.fillStyle = "#d4a017"; g.font = "bold 170px 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("發", w / 2, h / 2 + 10);
  }));
  const plaqueMat = keep(new THREE.MeshStandardMaterial({ map: plaqueTex, roughness: 0.6 }));
  const plaqueGeo = keep(new THREE.BoxGeometry(1, 1, 1));
  const plaque = new THREE.Mesh(plaqueGeo, [fur, fur, fur, fur, plaqueMat, fur]);
  plaque.position.set(-0.5, 0.48, 1.16);
  plaque.scale.set(0.78, 0.88, 0.08);
  plaque.rotation.set(-0.1, 0.12, 0);
  cat.add(plaque);
  // feet and tail
  for (const side of [-1, 1]) {
    const foot = mesh(sphere, fur, side * 0.55, 0.3, 0.72, 0.36, 0.3, 0.34, cat);
    mesh(sphere, pink, 0, 0.1, 0.8, 0.45, 0.4, 0.2, foot);
  }
  const tail = mesh(keep(new THREE.TorusGeometry(0.5, 0.14, 10, 24, Math.PI * 0.9)), fur, 0.7, 0.5, -0.55, 1, 1, 1, cat);
  tail.rotation.set(0.3, 0.9, 0.2);
  // shadow blob under the cat
  const shadowTex = keep(glowTexture(THREE, "rgba(0,0,0,1)", "rgba(0,0,0,0)"));
  const shadow = mesh(keep(new THREE.PlaneGeometry(1, 1)), keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.35, depthWrite: false })), 0, 0.01, 0.1, 3.4, 2.2, 1);
  shadow.rotation.x = -Math.PI / 2;

  /* --- the wealthy room: sunburst, floor, lanterns, piles of gold --- */
  const burstTex = keep(canvasTexture(THREE, 512, 512, (g, w) => {
    const c = w / 2;
    for (let i = 0; i < 24; i++) {
      const a0 = (i / 24) * Math.PI * 2, a1 = a0 + Math.PI / 24;
      g.beginPath(); g.moveTo(c, c); g.arc(c, c, c, a0, a1); g.closePath();
      g.fillStyle = "rgba(255,255,255,0.9)"; g.fill();
    }
    const fade = g.createRadialGradient(c, c, 0, c, c, c);
    fade.addColorStop(0, "rgba(255,255,255,0)"); fade.addColorStop(0.25, "rgba(255,255,255,0)"); fade.addColorStop(1, "rgba(255,255,255,1)");
    g.globalCompositeOperation = "destination-out"; g.fillStyle = fade; g.fillRect(0, 0, w, w);
  }));
  const burstMat = keep(new THREE.MeshBasicMaterial({ map: burstTex, transparent: true, depthWrite: false, fog: false }));
  const burst = mesh(keep(new THREE.PlaneGeometry(1, 1)), burstMat, 0, 2, -3, 14, 14, 1);
  const glow = keep(glowTexture(THREE));
  const discMat = keep(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, fog: false }));
  const disc = new THREE.Sprite(discMat);
  disc.position.set(0, 2.1, -2.5);
  disc.scale.setScalar(7.5);
  scene.add(disc);
  const wallMat = keep(new THREE.MeshBasicMaterial({ fog: false }));
  const wall = mesh(keep(new THREE.PlaneGeometry(1, 1)), wallMat, 0, 4, -8, 70, 40, 1);
  const floorMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.75 }));
  const floor = mesh(keep(new THREE.PlaneGeometry(1, 1)), floorMat, 0, 0, 0, 70, 40, 1);
  floor.rotation.x = -Math.PI / 2;
  const sheen = mesh(keep(new THREE.PlaneGeometry(1, 1)), keep(new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0.35, depthWrite: false, color: 0xffd58a })), 0, 0.02, 0.4, 9, 5, 1);
  sheen.rotation.x = -Math.PI / 2;
  wall.renderOrder = -2; burst.renderOrder = -1;

  const lanternGeo = keep(mergeParts(THREE, [
    [blob, place(0, 0, 0).scale(new THREE.Vector3(0.5, 0.42, 0.5))],
    [keep(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16)), place(0, 0.42, 0)],
    [keep(new THREE.CylinderGeometry(0.22, 0.22, 0.08, 16)), place(0, -0.42, 0)],
  ]));
  const lanterns = [];
  for (const side of [-1, 1]) {
    const pivot = new THREE.Group();
    pivot.position.set(side * 3.6, 5.6, -1.2);
    scene.add(pivot);
    mesh(lanternGeo, red, 0, -1.4, 0, 1, 1, 1, pivot);
    mesh(box, gold, 0, -0.95, 0, 0.05, 0.9, 0.05, pivot); // cord
    mesh(box, gold, 0, -2.05, 0, 0.05, 0.4, 0.05, pivot); // tassel
    lanterns.push({ pivot, phase: side });
  }
  // gold at the cat's feet: ingots and stacks of coins
  const coinTex = keep(canvasTexture(THREE, 256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = "#f6c544"; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#b8860b"; g.lineWidth = 10; g.beginPath(); g.arc(c, c, c - 12, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "#8a6508"; g.fillRect(c - 34, c - 34, 68, 68); // the square hole
    g.strokeStyle = "#8a6508"; g.lineWidth = 8; g.strokeRect(c - 50, c - 50, 100, 100);
    g.fillStyle = "#7a5a06"; g.font = "bold 48px 'PingFang SC', 'Noto Sans CJK SC', 'Microsoft YaHei', serif"; g.textAlign = "center"; g.textBaseline = "middle";
    [["福", c, 60], ["財", c, w - 60], ["招", 60, c], ["進", w - 60, c]].forEach(([t, x, y]) => g.fillText(t, x, y));
  }));
  const coinMat = keep(new THREE.MeshPhongMaterial({ map: coinTex, specular: 0x7a6238, shininess: 40 })); // soft highlight: a hard one blows a face out to a white disc
  const coinGeo = keep(new THREE.CylinderGeometry(0.24, 0.24, 0.05, 28));
  const N_PILE_INGOTS = 14, N_PILE_COINS = 34;
  const pileIngots = new THREE.InstancedMesh(ingotGeo, gold, N_PILE_INGOTS);
  const pileCoins = new THREE.InstancedMesh(coinGeo, coinMat, N_PILE_COINS);
  scene.add(pileIngots, pileCoins);
  for (let i = 0; i < N_PILE_INGOTS; i++) {
    const a = -0.5 + (i / (N_PILE_INGOTS - 1)) * (Math.PI + 1), r = 1.75 + (i % 3) * 0.35;
    pileIngots.setMatrixAt(i, place(Math.cos(a) * r * 1.15, 0.08 + (i % 2) * 0.1, 0.9 + Math.sin(a) * r * 0.55, 0, a + i, 0, 0.42 + (i % 3) * 0.08));
  }
  let ci = 0;
  for (const [sx, sz, n] of [[-2.4, 1.6, 7], [2.5, 1.5, 6], [-1.7, 2.4, 5], [1.9, 2.5, 8], [-3.1, 0.6, 4], [3.2, 0.7, 4]]) {
    for (let k = 0; k < n && ci < N_PILE_COINS; k++, ci++) pileCoins.setMatrixAt(ci, place(sx + (k % 2) * 0.03, 0.03 + k * 0.05, sz, 0, k * 0.4, 0));
  }
  pileIngots.instanceMatrix.needsUpdate = pileCoins.instanceMatrix.needsUpdate = true;

  /* --- money raining down --- */
  const noteTex = keep(canvasTexture(THREE, 256, 128, (g, w, h) => {
    g.fillStyle = "#d9ecc9"; g.fillRect(0, 0, w, h);
    g.strokeStyle = "#5f8f5a"; g.lineWidth = 6; g.strokeRect(10, 10, w - 20, h - 20);
    g.strokeStyle = "#8db989"; g.lineWidth = 2; g.strokeRect(20, 20, w - 40, h - 40);
    g.fillStyle = "#6c9a67"; g.beginPath(); g.arc(w / 2, h / 2, 34, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#f2f7ea"; g.font = "bold 44px sans-serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("$", w / 2, h / 2 + 2);
    g.fillStyle = "#5f8f5a"; g.font = "bold 22px sans-serif"; g.fillText("100", 42, 40); g.fillText("100", w - 42, h - 40);
  }));
  const noteMat = keep(new THREE.MeshStandardMaterial({ map: noteTex, roughness: 0.8, side: THREE.DoubleSide }));
  const noteGeo = keep(new THREE.PlaneGeometry(0.66, 0.33));
  // crypto: BTC, ETH, USDT and USDC faces drawn by hand (no font has every symbol)
  const cryptoFace = (bg, draw) => keep(canvasTexture(THREE, 256, 256, (g, w) => {
    const c = w / 2;
    g.fillStyle = bg; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(0,0,0,0.12)"; g.beginPath(); g.arc(c, c, c, 0, Math.PI * 2); g.arc(c, c, c - 14, 0, Math.PI * 2, true); g.fill(); // rim
    g.fillStyle = g.strokeStyle = "#ffffff"; g.textAlign = "center"; g.textBaseline = "middle"; g.lineCap = "round";
    draw(g, c);
  }));
  const CRYPTO = [
    { color: "#f7931a", tex: cryptoFace("#f7931a", (g, c) => { // the tilted B with its two bars
      g.save(); g.translate(c, c); g.rotate(-0.24); g.font = "bold 168px Arial, Helvetica, sans-serif"; g.fillText("B", 0, 6);
      g.lineWidth = 14; for (const x of [-14, 14]) { g.beginPath(); g.moveTo(x, -84); g.lineTo(x, -66); g.moveTo(x, 66); g.lineTo(x, 84); g.stroke(); } g.restore();
    }) },
    { color: "#627eea", tex: cryptoFace("#627eea", (g, c) => { // the diamond
      const tri = (pts, a) => { g.fillStyle = `rgba(255,255,255,${a})`; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(c + x, c + y) : g.moveTo(c + x, c + y))); g.closePath(); g.fill(); };
      tri([[0, -96], [-66, 12], [0, 40]], 0.65); tri([[0, -96], [66, 12], [0, 40]], 1);
      tri([[0, 54], [-66, 26], [0, 96]], 0.65); tri([[0, 54], [66, 26], [0, 96]], 1);
    }) },
    { color: "#26a17b", tex: cryptoFace("#26a17b", (g, c) => { // the T over a flat ring
      g.fillRect(c - 68, c - 88, 136, 30); g.fillRect(c - 15, c - 88, 30, 150);
      g.lineWidth = 16; g.beginPath(); g.ellipse(c, c - 14, 84, 30, 0, 0, Math.PI * 2); g.stroke();
      g.fillStyle = "#26a17b"; g.fillRect(c - 15, c - 40, 30, 52); g.fillStyle = "#ffffff"; g.fillRect(c - 15, c - 40, 30, 22);
    }) },
    { color: "#2775ca", tex: cryptoFace("#2775ca", (g, c) => { // the $ inside a ring with two gaps
      g.lineWidth = 18; g.beginPath(); g.arc(c, c, 84, Math.PI * 0.62, Math.PI * 1.38); g.stroke();
      g.beginPath(); g.arc(c, c, 84, Math.PI * 1.62, Math.PI * 2.38); g.stroke();
      g.font = "bold 132px Arial, Helvetica, sans-serif"; g.fillText("$", c, c + 4);
    }) },
  ];
  const cryptoGeo = keep(new THREE.CylinderGeometry(0.34, 0.34, 0.07, 32));
  const cryptoMeshes = CRYPTO.map(({ color, tex }) => {
    const side = keep(new THREE.MeshPhongMaterial({ color, specular: 0x666666, shininess: 40 }));
    const cap = keep(new THREE.MeshPhongMaterial({ map: tex, specular: 0x555555, shininess: 40 }));
    const m = new THREE.InstancedMesh(cryptoGeo, [side, cap, cap], 2);
    m.frustumCulled = false;
    scene.add(m);
    return m;
  });
  const N_COINS = preview ? 18 : 56, N_NOTES = preview ? 8 : 26, N_INGOTS = preview ? 4 : 10;
  const rainCoins = new THREE.InstancedMesh(coinGeo, coinMat, N_COINS);
  const rainNotes = new THREE.InstancedMesh(noteGeo, noteMat, N_NOTES);
  const rainIngots = new THREE.InstancedMesh(ingotGeo, gold, N_INGOTS);
  for (const m of [rainCoins, rainNotes, rainIngots]) { m.frustumCulled = false; scene.add(m); }
  const TOP = 8, FLOOR = 0.08;
  let spreadX = 5;
  const drops = [];
  const spawn = (d, fresh) => {
    d.x = rand(-spreadX, spreadX); d.z = rand(-2.6, 1.1);
    d.y = fresh ? rand(FLOOR, TOP) : TOP + rand(0, 2);
    d.rx = rand(0, 6.28); d.ry = rand(0, 6.28); d.rz = rand(0, 6.28);
    d.phase = rand(0, 6.28);
    d.speed = d.kind === 1 ? rand(0.55, 0.95) : d.kind === 2 ? rand(1.2, 1.7) : rand(1.1, 2);
    d.spin = d.kind === 1 ? rand(1, 2) : rand(2, 5);
  };
  [[rainCoins, N_COINS, 0], [rainNotes, N_NOTES, 1], [rainIngots, N_INGOTS, 2]].forEach(([m, n, kind]) => {
    for (let i = 0; i < n; i++) { const d = { m, i, kind }; spawn(d, true); drops.push(d); }
  });
  function placeDrops(t) {
    for (const d of drops) {
      const sway = d.kind === 1 ? Math.sin(t * 1.3 + d.phase) * 0.35 : Math.sin(t * 0.8 + d.phase) * 0.1;
      const k = Math.min(1, (d.y - FLOOR) / 0.35); // shrink away as it reaches the floor
      V.set(d.x + sway, d.y, d.z);
      if (d.kind === 1) E.set(Math.sin(t * 2.1 + d.phase) * 0.9 + 0.3, d.ry + Math.sin(t * 0.7 + d.phase) * 0.6, Math.sin(t * 1.7 + d.phase) * 0.5);
      else E.set(d.rx, d.ry, d.rz);
      S.setScalar(k * (d.kind === 2 ? 0.5 : 1));
      M4.compose(V, Q.setFromEuler(E), S);
      d.m.setMatrixAt(d.i, M4);
    }
    rainCoins.instanceMatrix.needsUpdate = rainNotes.instanceMatrix.needsUpdate = rainIngots.instanceMatrix.needsUpdate = true;
  }
  placeDrops(0);
  // a crypto coin now and then: one falls slowly, turning so the logo can be read, then the next one comes
  const cryptos = [];
  cryptoMeshes.forEach((m, type) => { for (let i = 0; i < 2; i++) cryptos.push({ m, i, type, on: false, x: 0, y: 0, z: 0, phase: 0, speed: 1 }); });
  let nextCrypto = preview ? 1 : 2;
  function placeCryptos(t) {
    for (const d of cryptos) {
      if (!d.on) { S.setScalar(0); M4.compose(V.set(0, -5, 0), Q.identity(), S); d.m.setMatrixAt(d.i, M4); continue; }
      const k = Math.min(1, (d.y - FLOOR) / 0.4);
      V.set(d.x + Math.sin(t * 0.7 + d.phase) * 0.15, d.y, d.z);
      E.set(Math.PI / 2 + 0.12 + Math.sin(t * 0.9 + d.phase) * 0.18, Math.sin(t * 1.1 + d.phase) * 0.75, Math.sin(t * 0.6 + d.phase) * 0.15, "YXZ"); // faces the camera, turning gently
      S.setScalar(k);
      M4.compose(V, Q.setFromEuler(E), S);
      d.m.setMatrixAt(d.i, M4);
    }
    for (const m of cryptoMeshes) m.instanceMatrix.needsUpdate = true;
  }
  placeCryptos(0);

  /* --- sparkles --- */
  const sparkTex = keep(canvasTexture(THREE, 64, 64, (g, w) => {
    const c = w / 2;
    const rg = g.createRadialGradient(c, c, 0, c, c, c);
    rg.addColorStop(0, "rgba(255,255,255,1)"); rg.addColorStop(0.3, "rgba(255,255,255,0.35)"); rg.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = rg; g.fillRect(0, 0, w, w);
    g.strokeStyle = "rgba(255,255,255,0.95)"; g.lineWidth = 3; g.lineCap = "round";
    g.beginPath(); g.moveTo(c, 4); g.lineTo(c, w - 4); g.moveTo(4, c); g.lineTo(w - 4, c); g.stroke();
  }));
  const N_SPARK = preview ? 16 : 40;
  const sPos = new Float32Array(N_SPARK * 3), sPhase = new Float32Array(N_SPARK), sSize = new Float32Array(N_SPARK);
  for (let i = 0; i < N_SPARK; i++) { sPos.set([rand(-4.5, 4.5), rand(0.3, 6), rand(-2, 2.5)], i * 3); sPhase[i] = rand(0, 6.28); sSize[i] = rand(0.08, 0.2); }
  const sparkGeo = keep(new THREE.BufferGeometry());
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3));
  sparkGeo.setAttribute("aPhase", new THREE.BufferAttribute(sPhase, 1));
  sparkGeo.setAttribute("aSize", new THREE.BufferAttribute(sSize, 1));
  const sparkUni = { uTime: { value: 0 }, uPx: { value: 700 }, uMaxPx: { value: 24 }, uMap: { value: sparkTex }, uColor: { value: new THREE.Color() }, uOpacity: { value: 0.9 } };
  const sparkMat = keep(new THREE.ShaderMaterial({ uniforms: sparkUni, vertexShader: LUCKY_SPARK_VS, fragmentShader: LUCKY_SPARK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const sparks = new THREE.Points(sparkGeo, sparkMat);
  sparks.frustumCulled = false;
  const buf = new THREE.Vector2();
  const TAN = Math.tan((camera.fov * Math.PI) / 360);
  sparks.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); sparkUni.uPx.value = buf.y / (2 * TAN); sparkUni.uMaxPx.value = 22 * renderer.getPixelRatio(); };
  scene.add(sparks);

  /* --- light and colour --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  key.position.set(-4, 7, 6);
  const fill = new THREE.DirectionalLight(0xffffff, 1);
  fill.position.set(5, 3, 4);
  scene.add(hemi, key, fill);
  scene.fog = new THREE.Fog(0xffffff, 9, 18); // the far floor melts into the wall, so there is no hard horizon
  const tmp = new THREE.Color();
  function applyPalette(p) {
    pal = p;
    accentMat.color.set(p.accent);
    wallMat.color.set(p.dark ? "#2a0810" : "#fff1de"); scene.fog.color.copy(wallMat.color);
    floorMat.color.set(p.dark ? "#4a0f1c" : "#e6c28f");
    burstMat.color.set(p.dark ? "#ffb347" : "#ffd591"); burstMat.opacity = p.dark ? 0.35 : 0.55;
    blend(THREE, burstMat, p.dark);
    discMat.color.set(p.dark ? "#ff9f43" : "#ffe3a8"); discMat.opacity = p.dark ? 0.55 : 0.8;
    blend(THREE, discMat, p.dark);
    sheen.material.opacity = p.dark ? 0.5 : 0.35;
    blend(THREE, sheen.material, p.dark);
    hemi.color.set(p.dark ? "#d8c8d4" : "#fff6ea"); hemi.groundColor.set(p.dark ? "#5a2a30" : "#c9a37c"); hemi.intensity = p.dark ? 1.2 : 1.15;
    key.color.set(p.dark ? "#fff6e8" : "#fff3dc"); key.intensity = p.dark ? 3.4 : 2.3;
    fill.color.set(p.dark ? "#ffb08a" : "#ffdcc2"); fill.intensity = p.dark ? 0.8 : 0.8;
    sparkUni.uColor.value.copy(tmp.set(p.dark ? "#fff1b8" : "#e2a522").lerp(new THREE.Color(p.accent), 0.25));
    sparkUni.uOpacity.value = p.dark ? 1 : 0.8;
    blend(THREE, sparkMat, p.dark);
    fur.emissive.set(p.dark ? "#2a2226" : "#000000"); // lifts the shadow side at night so the cat stays white
    shadow.material.opacity = p.dark ? 0.5 : 0.3;
  }
  applyPalette(pal);

  const CAM = { y: 1.9, z: 7.4 };
  camera.position.set(0, CAM.y, CAM.z);
  camera.lookAt(0, 1.7, 0);
  return {
    update(dt, t) {
      // the beckoning wave, a bob and a little head tilt
      arm.rotation.x = -0.35 + Math.sin(t * 5.2) * 0.4;
      arm.rotation.z = -0.25 + Math.sin(t * 5.2 + 1) * 0.08;
      paw.rotation.x = Math.sin(t * 5.2 + 0.6) * 0.35;
      cat.position.y = Math.sin(t * 2.6) * 0.03;
      headPivot.rotation.z = 0.06 + Math.sin(t * 1.3) * 0.06;
      headPivot.rotation.y = Math.sin(t * 0.7) * 0.08;
      bell.position.x = Math.sin(t * 5.2 - 0.5) * 0.03;
      tail.rotation.y = 0.9 + Math.sin(t * 1.9) * 0.25;
      for (const l of lanterns) l.pivot.rotation.z = Math.sin(t * 1.1 + l.phase) * 0.08;
      burst.rotation.z = t * 0.05;
      disc.scale.setScalar(7.5 + Math.sin(t * 1.4) * 0.3);
      sparkUni.uTime.value = t;
      // money keeps falling; the sideways spread follows the window shape
      spreadX = Math.max(2.4, Math.min(9, 4.4 * camera.aspect));
      for (const d of drops) {
        d.y -= dt * d.speed;
        if (d.kind !== 1) { d.rx += dt * d.spin; d.ry += dt * d.spin * 0.6; }
        if (d.y < FLOOR - 0.05) spawn(d, false);
      }
      placeDrops(t);
      nextCrypto -= dt;
      if (nextCrypto <= 0) {
        nextCrypto = preview ? rand(5, 9) : rand(3, 6);
        const type = (Math.random() * CRYPTO.length) | 0;
        const free = cryptos.find((d) => d.type === type && !d.on);
        if (free) Object.assign(free, { on: true, x: rand(-spreadX * 0.8, spreadX * 0.8), y: TOP + rand(0, 1), z: rand(-2.2, 0.8), phase: rand(0, 6.28), speed: rand(0.7, 1) });
      }
      for (const d of cryptos) if (d.on && (d.y -= dt * d.speed) < FLOOR - 0.05) d.on = false;
      placeCryptos(t);
      // portrait phones step back so the whole cat stays in frame
      const back = Math.max(0, 1 / camera.aspect - 1) * 3.4;
      camera.position.set(Math.sin(t * 0.25) * 0.25, CAM.y + Math.sin(t * 0.4) * 0.08, CAM.z + back);
      camera.lookAt(0, 1.7, 0);
    },
    setPalette: applyPalette,
    dispose() { disposables.forEach((d) => d.dispose()); scene.fog = null; },
  };
}

/* ---------- Campsite: a forest clearing with a crackling campfire, a tent lit from inside, fireflies under the stars ---------- */
const CAMP_NOISE = /* glsl */ `
  float campHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float campNoise(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(mix(campHash(i), campHash(i + vec2(1.0, 0.0)), f.x), mix(campHash(i + vec2(0.0, 1.0)), campHash(i + vec2(1.0, 1.0)), f.x), f.y);
  }
  float campFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * campNoise(p); p *= 2.03; a *= 0.5; } return s; }
`;
const CAMP_FLAME_VS = /* glsl */ `
  uniform vec2 uSize;
  varying vec2 vUv;
  void main() {
    vUv = uv;
    // a billboard standing on its bottom edge: whatever the camera does, the flame faces it
    vec4 mv = modelViewMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    mv.xy += vec2(position.x * uSize.x, (position.y + 0.5) * uSize.y);
    gl_Position = projectionMatrix * mv;
  }
`;
const CAMP_FLAME_FS = /* glsl */ `
  ${CAMP_NOISE}
  uniform float uTime; uniform float uSeed; uniform float uStrength;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    float t = uTime + uSeed * 7.0;
    float n = campFbm(vec2(uv.x * 3.0 + uSeed * 5.0, uv.y * 2.2 - t * 2.4)); // turbulence climbing the flame
    float x = (uv.x - 0.5) * 2.0 + (n - 0.5) * 0.9 * uv.y; // the tip sways more than the base
    float width = mix(0.9, 0.08, pow(uv.y, 0.75));
    float h = uv.y + (n - 0.5) * 0.45;
    float body = (1.0 - smoothstep(width * 0.45, width, abs(x))) * (1.0 - smoothstep(0.45, 0.95, h)) * smoothstep(0.0, 0.1, uv.y);
    body *= 1.0 - smoothstep(0.55, 0.88, uv.y); // no thread of flame left standing at the very top of the quad
    float core = (1.0 - smoothstep(0.0, 0.45, h)) * (1.0 - smoothstep(0.0, 0.55, abs(x) / max(width, 0.05)));
    vec3 col = mix(vec3(0.85, 0.16, 0.02), vec3(1.0, 0.55, 0.1), smoothstep(0.1, 0.7, body));
    col = mix(col, vec3(1.0, 0.92, 0.62), core * body);
    gl_FragColor = vec4(col, clamp(body * uStrength, 0.0, 1.0));
    #include <colorspace_fragment>
  }
`;
const CAMP_EMBER_VS = /* glsl */ `
  uniform float uTime; uniform float uPx; uniform float uRise; uniform float uWind;
  attribute vec3 aSeed; // rise speed, phase, size
  varying float vLife;
  void main() {
    float life = fract(uTime * aSeed.x / uRise + aSeed.y); // each spark climbs, fades and starts again at the fire
    vLife = life;
    float h = life * uRise;
    float swirl = aSeed.y * 6.2831 + uTime * (1.2 + aSeed.x);
    vec3 p = position;
    p.x += sin(swirl) * 0.22 * life + uWind * h * h * 0.06;
    p.z += cos(swirl) * 0.22 * life;
    p.y += h;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp(aSeed.z * (1.0 - life * 0.6) * uPx / -mv.z, 1.0, 20.0);
  }
`;
const CAMP_EMBER_FS = /* glsl */ `
  uniform float uOpacity;
  varying float vLife;
  void main() {
    vec2 d = gl_PointCoord * 2.0 - 1.0;
    float r = dot(d, d);
    if (r > 1.0) discard;
    vec3 col = mix(vec3(1.0, 0.88, 0.45), vec3(1.0, 0.32, 0.04), vLife);
    gl_FragColor = vec4(col, (1.0 - r) * pow(1.0 - vLife, 1.3) * uOpacity);
    #include <colorspace_fragment>
  }
`;
const CAMP_FLY_VS = /* glsl */ `
  uniform float uTime; uniform float uPx; uniform float uSize;
  attribute vec3 aSeed; // blink speed, phase, drift
  varying float vA;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 0.37 + aSeed.y * 3.1) * aSeed.z;
    p.y += sin(uTime * 0.53 + aSeed.y * 1.7) * aSeed.z * 0.5;
    p.z += cos(uTime * 0.41 + aSeed.y * 2.3) * aSeed.z;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float blink = pow(max(0.0, sin(uTime * aSeed.x + aSeed.y * 6.2831)), 4.0); // mostly dark, now and then a soft flash
    vA = blink;
    gl_PointSize = clamp(uSize * uPx / -mv.z, 2.0, 18.0) * (0.6 + 0.4 * blink);
  }
`;
const CAMP_FLY_FS = /* glsl */ `
  uniform float uOpacity;
  varying float vA;
  void main() {
    vec2 d = gl_PointCoord * 2.0 - 1.0;
    float r = dot(d, d);
    if (r > 1.0) discard;
    vec3 col = mix(vec3(0.8, 1.0, 0.4), vec3(1.0, 1.0, 0.85), exp(-r * 8.0));
    gl_FragColor = vec4(col, exp(-r * 3.5) * vA * uOpacity);
    #include <colorspace_fragment>
  }
`;

function campsite(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), E = new THREE.Euler(), S = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0), tmp = new THREE.Color();
  const place = (x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = sx, sz = sx) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
  /** A unit cylinder stretched from a to b: logs, tripod legs, the chain. */
  const between = (a, b, r) => { const d = new THREE.Vector3().subVectors(b, a); const len = d.length(); return new THREE.Matrix4().compose(new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(UP, d.normalize()), new THREE.Vector3(r, len, r)); };
  const add = (geo, mat, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); parent.add(m); return m; };
  const P3 = (x, y, z) => new THREE.Vector3(x, y, z);
  // a fixed seed: the trees always stand in the same places, so none grows through the tent or in front of the fire
  let seed = 20260927;
  const rnd = (a = 0, b = 1) => { seed = (seed * 16807) % 2147483647; return a + ((seed - 1) / 2147483646) * (b - a); };
  const smooth = (a, b, x) => { const k = Math.min(1, Math.max(0, (x - a) / (b - a))); return k * k * (3 - 2 * k); };
  camera.far = 420; // resize() rebuilds the projection right after the build
  const TAN = Math.tan((camera.fov * Math.PI) / 360);
  const buf = new THREE.Vector2();
  const pxFor = (uni) => (renderer) => { renderer.getDrawingBufferSize(buf); uni.uPx.value = buf.y / (2 * TAN); };

  const glow = keep(glowTexture(THREE));
  const cloudTex = keep(cloudTexture(THREE));
  const unitCyl = keep(new THREE.CylinderGeometry(1, 1, 1, 8)); // radius 1, height 1: stretched into logs, legs and trunks
  const blob = keep(new THREE.SphereGeometry(1, 8, 6));
  const ball = keep(new THREE.SphereGeometry(1, 14, 10));
  const quad = keep(new THREE.PlaneGeometry(1, 1));

  /* --- sky: a gradient dome, stars and the Milky Way at night, a low sun and clouds by day --- */
  const skyStops = (dark) => (dark
    ? [[0, "#02040f"], [0.3, "#081230"], [0.44, "#16275a"], [0.5, "#2a3268"], [0.52, "#0b1022"], [1, "#0b1022"]]
    : [[0, "#4f93d6"], [0.3, "#86bde8"], [0.4, "#bcd8ec"], [0.46, "#f6dcb8"], [0.5, "#ffd29e"], [0.52, "#efd2b0"], [1, "#efd2b0"]]);
  function skyTexture(dark) {
    return canvasTexture(THREE, 8, 512, (g) => {
      const grad = g.createLinearGradient(0, 0, 0, 512);
      skyStops(dark).forEach(([at, col]) => grad.addColorStop(at, col));
      g.fillStyle = grad;
      g.fillRect(0, 0, 8, 512);
    });
  }
  let skyTex = null; // made by applyPalette, again whenever the theme flips
  const skyMat = keep(new THREE.MeshBasicMaterial({ side: THREE.BackSide, fog: false, depthWrite: false }));
  add(keep(new THREE.SphereGeometry(320, 24, 24)), skyMat).renderOrder = -3;

  const STARS = preview ? 260 : 900;
  const starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) {
    const a = rand(0, 6.28), e = Math.asin(rand(0.06, 1)); // upper half of the sky only
    starPos.set([Math.cos(a) * Math.cos(e) * 300, Math.sin(e) * 300, Math.sin(a) * Math.cos(e) * 300], i * 3);
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = keep(new THREE.PointsMaterial({ color: 0xe6eeff, size: preview ? 1.2 : 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -2;
  scene.add(stars);
  const milkyMat = keep(new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  for (const [x, y, sx, sy] of [[-150, 118, 150, 34], [-30, 146, 175, 42], [100, 170, 150, 30]]) {
    const m = add(quad, milkyMat, x, y, -250);
    m.rotation.z = 0.24;
    m.scale.set(sx, sy, 1);
    m.renderOrder = -2;
  }
  const SUN = P3(-55, 62, -225), MOON = P3(55, 72, -230); // both low enough to be in view, the sun half behind the tree tops
  const orbMat = keep(new THREE.SpriteMaterial({ map: glow, transparent: true, depthWrite: false, fog: false }));
  const orbHalo = new THREE.Sprite(orbMat), orbCore = new THREE.Sprite(orbMat);
  orbHalo.renderOrder = orbCore.renderOrder = -1.2;
  scene.add(orbHalo, orbCore);
  const cloudMat = keep(new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }));
  const clouds = [];
  for (let i = 0; i < (preview ? 3 : 5); i++) {
    const m = add(quad, cloudMat, rand(-200, 200), rand(48, 88), rand(-240, -215));
    m.scale.set(rand(60, 120), rand(14, 22), 1);
    m.renderOrder = -1.5;
    clouds.push({ m, speed: rand(0.6, 1.4) });
  }
  // two ranges of distant mountains: flat silhouettes, a lighter one behind a darker one
  const ridge = (off, rough) => keep(canvasTexture(THREE, 1024, 128, (g, w, h) => {
    g.fillStyle = "#fff";
    g.beginPath();
    g.moveTo(0, h);
    for (let x = 0; x <= w; x += 6) g.lineTo(x, h * Math.max(0.04, 0.42 + 0.22 * Math.sin(x * 0.006 + off) + 0.12 * Math.sin(x * 0.021 + off * 3) + 0.05 * rough * Math.sin(x * 0.07 + off * 7)));
    g.lineTo(w, h);
    g.closePath();
    g.fill();
  }));
  const farMat = keep(new THREE.MeshBasicMaterial({ map: ridge(1.3, 1), transparent: true, depthWrite: false, fog: false }));
  const nearMat = keep(new THREE.MeshBasicMaterial({ map: ridge(4.1, 1.6), transparent: true, depthWrite: false, fog: false }));
  const farRidge = add(quad, farMat, 0, 24, -230), nearRidge = add(quad, nearMat, 30, 15, -185);
  farRidge.scale.set(820, 64, 1);
  nearRidge.scale.set(700, 48, 1);
  farRidge.renderOrder = nearRidge.renderOrder = -1;

  /* --- the ground: a gently rolling forest floor and a trodden patch of earth around the fire --- */
  const groundY = (x, z) => smooth(10, 40, Math.hypot(x, z)) * (Math.sin(x * 0.05) * Math.cos(z * 0.04) * 1.6 + Math.sin(x * 0.13 + z * 0.09) * 0.6);
  const gSeg = preview ? 40 : 70;
  const groundGeo = keep(new THREE.PlaneGeometry(500, 500, gSeg, gSeg));
  groundGeo.rotateX(-Math.PI / 2);
  const gp = groundGeo.attributes.position, gCol = new Float32Array(gp.count * 3);
  const grassNear = new THREE.Color("#4d7a3a"), grassFar = new THREE.Color("#2f5530");
  for (let i = 0; i < gp.count; i++) {
    const x = gp.getX(i), z = gp.getZ(i);
    gp.setY(i, groundY(x, z));
    tmp.copy(grassNear).lerp(grassFar, smooth(8, 40, Math.hypot(x, z)));
    gCol.set([tmp.r, tmp.g, tmp.b], i * 3);
  }
  groundGeo.setAttribute("color", new THREE.BufferAttribute(gCol, 3));
  groundGeo.computeVertexNormals();
  add(groundGeo, keep(new THREE.MeshLambertMaterial({ vertexColors: true })));
  const dirtTex = keep(canvasTexture(THREE, 256, 256, (g, w) => {
    const c = w / 2, grad = g.createRadialGradient(c, c, 0, c, c, c);
    grad.addColorStop(0, "rgba(122,98,70,1)");
    grad.addColorStop(0.62, "rgba(112,90,64,0.95)");
    grad.addColorStop(1, "rgba(112,90,64,0)");
    g.fillStyle = grad;
    g.fillRect(0, 0, w, w);
    for (let i = 0; i < 300; i++) {
      const a = rnd(0, 6.28), r = Math.sqrt(rnd()) * c * 0.8;
      g.fillStyle = rnd() < 0.5 ? "rgba(70,56,40,0.4)" : "rgba(150,128,98,0.35)";
      g.fillRect(c + Math.cos(a) * r, c + Math.sin(a) * r, 2, 2);
    }
  }));
  const dirt = add(keep(new THREE.CircleGeometry(4.3, 40)), keep(new THREE.MeshLambertMaterial({ map: dirtTex, transparent: true, depthWrite: false })), -0.4, 0.015, 0.2);
  dirt.rotation.x = -Math.PI / 2;

  /* --- the campfire: a ring of stones, crossed logs, flames drawn by a shader, sparks, smoke and a flickering light --- */
  const stoneParts = [];
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + rnd(-0.1, 0.1);
    stoneParts.push([blob, place(Math.cos(a) * 0.82, 0.07, Math.sin(a) * 0.82, rnd(-0.3, 0.3), rnd(0, 6.28), rnd(-0.3, 0.3), rnd(0.16, 0.22), rnd(0.1, 0.14), rnd(0.14, 0.2))]);
  }
  add(keep(mergeParts(THREE, stoneParts)), keep(new THREE.MeshLambertMaterial({ color: 0x8a8d94, flatShading: true })));
  const logParts = [];
  for (let i = 0; i < 5; i++) { // a teepee of logs leaning together over the fire
    const a = (i / 5) * Math.PI * 2 + 0.3;
    logParts.push([unitCyl, between(P3(Math.cos(a) * 0.52, 0.05, Math.sin(a) * 0.52), P3(Math.cos(a) * -0.08, 0.78, Math.sin(a) * -0.08), 0.075)]);
  }
  logParts.push([unitCyl, between(P3(-0.62, 0.09, 0.2), P3(0.6, 0.09, -0.25), 0.09)], [unitCyl, between(P3(-0.3, 0.09, -0.6), P3(0.35, 0.09, 0.55), 0.085)]);
  const barkMat = keep(new THREE.MeshLambertMaterial({ color: 0x5a3a22 }));
  add(keep(mergeParts(THREE, logParts)), barkMat);
  const bedMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xff7a1a, transparent: true, depthWrite: false }));
  const bed = new THREE.Sprite(bedMat); // the glowing embers under the flames
  bed.position.set(0, 0.25, 0);
  scene.add(bed);
  const floorGlowMat = keep(new THREE.MeshBasicMaterial({ map: glow, color: 0xff8a3a, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const floorGlow = add(quad, floorGlowMat, 0, 0.03, 0);
  floorGlow.rotation.x = -Math.PI / 2;
  floorGlow.scale.set(11, 11, 1);
  const fireTime = { value: 0 }, fireStrength = { value: 1 };
  const flames = [[0, 0.12, 0, 1.3, 1.9, 0], [-0.22, 0.1, 0.08, 0.9, 1.3, 3.1], [0.24, 0.1, -0.05, 0.85, 1.4, 5.7]].map(([x, y, z, w, h, s]) => {
    const mat = keep(new THREE.ShaderMaterial({ uniforms: { uTime: fireTime, uStrength: fireStrength, uSeed: { value: s }, uSize: { value: new THREE.Vector2(w, h) } }, vertexShader: CAMP_FLAME_VS, fragmentShader: CAMP_FLAME_FS, transparent: true, depthWrite: false }));
    const m = add(quad, mat, x, y, z);
    m.frustumCulled = false; // the billboard is bigger than the unit plane it starts from
    m.renderOrder = 2;
    return mat;
  });
  const EMBERS = preview ? 40 : 120;
  const ePos = new Float32Array(EMBERS * 3), eSeed = new Float32Array(EMBERS * 3);
  for (let i = 0; i < EMBERS; i++) {
    const a = rand(0, 6.28), r = rand(0, 0.35);
    ePos.set([Math.cos(a) * r, 0.4, Math.sin(a) * r], i * 3);
    eSeed.set([rand(0.8, 1.8), Math.random(), rand(0.03, 0.07) * (preview ? 1.6 : 1)], i * 3);
  }
  const emberGeo = keep(new THREE.BufferGeometry());
  emberGeo.setAttribute("position", new THREE.BufferAttribute(ePos, 3));
  emberGeo.setAttribute("aSeed", new THREE.BufferAttribute(eSeed, 3));
  const emberUni = { uTime: { value: 0 }, uPx: { value: 700 }, uRise: { value: 4.5 }, uWind: { value: 0.4 }, uOpacity: { value: 1 } };
  const emberMat = keep(new THREE.ShaderMaterial({ uniforms: emberUni, vertexShader: CAMP_EMBER_VS, fragmentShader: CAMP_EMBER_FS, transparent: true, depthWrite: false }));
  const embers = new THREE.Points(emberGeo, emberMat);
  embers.frustumCulled = false;
  embers.renderOrder = 3;
  embers.onBeforeRender = pxFor(emberUni);
  scene.add(embers);
  const smoke = [];
  for (let i = 0, n = preview ? 4 : 7; i < n; i++) {
    const mat = keep(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false }));
    const s = new THREE.Sprite(mat);
    s.renderOrder = 1;
    scene.add(s);
    smoke.push({ s, mat, phase: i / n, drift: rnd(-0.4, 0.4) });
  }
  // a pot hanging from a tripod over the flames
  const apex = P3(0, 2.5, 0);
  // legs at 60°, 180° and 300°: none straight behind the fire (seen from the front that one looked like a glowing stick
  // rising through the flames) and none straight in front of it; one leg on the viewer's side is unavoidable with three
  const tripodParts = [0, 1, 2].map((i) => { const a = (i / 3) * Math.PI * 2 + Math.PI / 3; return [unitCyl, between(P3(Math.cos(a) * 1.1, 0, Math.sin(a) * 1.1), apex, 0.035)]; });
  tripodParts.push([unitCyl, between(apex, P3(0, 2.0, 0), 0.012)]);
  add(keep(mergeParts(THREE, tripodParts)), keep(new THREE.MeshLambertMaterial({ color: 0x4a3526 })));
  add(keep(mergeParts(THREE, [[keep(new THREE.CylinderGeometry(0.26, 0.2, 0.3, 16)), place(0, 0, 0)], [keep(new THREE.TorusGeometry(0.24, 0.012, 6, 20, Math.PI)), place(0, 0.14, 0)]])),
    keep(new THREE.MeshStandardMaterial({ color: 0x2a2c33, metalness: 0.5, roughness: 0.45 })), 0, 1.62, 0);

  /* --- the tent: an A-frame in the accent colour, door flap open, lit from inside at night --- */
  function tentGeometry(w, h, L, dw, dh) {
    const f = L / 2, b = -L / 2;
    const v = { lf: [-w, 0, f], lb: [-w, 0, b], Rf: [w, 0, f], Rb: [w, 0, b], rf: [0, h, f], rb: [0, h, b], dl: [-dw, 0, f], dr: [dw, 0, f], dt: [0, dh, f], flap: [dw * 2.1, dh * 0.15, f + 0.55] };
    const tris = [["lf", "lb", "rb"], ["lf", "rb", "rf"], ["Rf", "rf", "rb"], ["Rf", "rb", "Rb"], ["lb", "Rb", "rb"], // roof and back
      ["lf", "dl", "dt"], ["lf", "dt", "rf"], ["dt", "dr", "Rf"], ["dt", "Rf", "rf"], // the front, with the door left open
      ["dt", "dr", "flap"]]; // the door flap folded out
    const pos = new Float32Array(tris.length * 9);
    tris.forEach((t, i) => t.forEach((k, j) => pos.set(v[k], i * 9 + j * 3)));
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.computeVertexNormals();
    return g;
  }
  const tent = new THREE.Group();
  tent.position.set(-3.1, 0, -1.3);
  tent.rotation.y = 0.45; // the door opens towards the fire and the viewer
  scene.add(tent);
  const tentMat = keep(new THREE.MeshLambertMaterial({ side: THREE.DoubleSide }));
  add(keep(tentGeometry(1.25, 1.55, 2.5, 0.52, 1.1)), tentMat, 0, 0, 0, tent);
  const sheet = add(quad, keep(new THREE.MeshLambertMaterial({ color: 0x3a3f4a })), 0, 0.01, 0, tent);
  sheet.rotation.x = -Math.PI / 2;
  sheet.scale.set(2.4, 2.5, 1);
  const ropeGeo = keep(new THREE.BufferGeometry().setFromPoints([P3(0, 1.55, 1.25), P3(0, 0, 2.35), P3(0, 1.55, -1.25), P3(0, 0, -2.35)]));
  tent.add(new THREE.LineSegments(ropeGeo, keep(new THREE.LineBasicMaterial({ color: 0xd6d3d1, transparent: true, opacity: 0.7 }))));
  const tentLight = new THREE.PointLight(0xffb45c, 0, 6, 2);
  tentLight.position.set(0, 0.7, 0.1);
  tent.add(tentLight);
  const tentGlowMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffc070, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const tentGlow = new THREE.Sprite(tentGlowMat);
  tentGlow.position.set(0, 0.55, 0.9);
  tentGlow.scale.setScalar(1.6);
  tent.add(tentGlow);
  const packMat = keep(new THREE.MeshLambertMaterial());
  const bag = add(keep(mergeParts(THREE, [[ball, place(0, 0, 0, 0, 0, 0, 0.26, 0.34, 0.18)], [ball, place(0, -0.08, 0.15, 0, 0, 0, 0.18, 0.15, 0.08)]])), packMat, 1.5, 0.33, 1.15, tent);
  bag.rotation.set(-0.12, 0.3, -0.12);
  const roll = add(unitCyl, keep(new THREE.MeshLambertMaterial({ color: 0xd9c9a3 })), 1.5, 0.72, 1.12, tent); // a sleeping mat strapped on top
  roll.scale.set(0.1, 0.5, 0.1);
  roll.rotation.set(0, 0.3, Math.PI / 2);

  /* --- log benches, and a stump with a lantern on it --- */
  const benchMat = keep(new THREE.MeshLambertMaterial({ color: 0x7a5234 }));
  add(keep(mergeParts(THREE, [[unitCyl, between(P3(1.55, 0.21, 1.45), P3(2.6, 0.21, -0.2), 0.21)], [unitCyl, between(P3(-2.3, 0.21, 2.05), P3(-0.5, 0.21, 2.6), 0.21)]])), benchMat);
  const cutMat = keep(new THREE.MeshLambertMaterial({ color: 0xc8a574 }));
  const LX = 2.85, LY = 0.55, LZ = -1.25;
  add(keep(new THREE.CylinderGeometry(0.34, 0.4, 0.55, 12)), [benchMat, cutMat, cutMat], LX, 0.275, LZ);
  add(keep(mergeParts(THREE, [[unitCyl, place(0, 0.02, 0, 0, 0, 0, 0.11, 0.04, 0.11)], [unitCyl, place(0, 0.34, 0, 0, 0, 0, 0.1, 0.04, 0.1)], [keep(new THREE.ConeGeometry(0.1, 0.08, 8)), place(0, 0.4, 0)], [keep(new THREE.TorusGeometry(0.06, 0.008, 6, 14, Math.PI)), place(0, 0.44, 0)]])),
    keep(new THREE.MeshLambertMaterial({ color: 0x1f2937 })), LX, LY, LZ);
  const glassMat = keep(new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.92 }));
  add(unitCyl, glassMat, LX, LY + 0.18, LZ).scale.set(0.085, 0.28, 0.085);
  const lanternGlowMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffb45c, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const lanternGlow = new THREE.Sprite(lanternGlowMat);
  lanternGlow.position.set(LX, LY + 0.2, LZ);
  scene.add(lanternGlow);

  /* --- the forest: instanced pines, a few autumn trees, mist between the trunks --- */
  const coneGeo = keep(new THREE.ConeGeometry(1, 1, 7));
  const pineGeo = keep(mergeParts(THREE, [[coneGeo, place(0, 1.9, 0, 0, 0, 0, 1.45, 2.0, 1.45)], [coneGeo, place(0, 3.0, 0, 0, 0.4, 0, 1.12, 1.8, 1.12)], [coneGeo, place(0, 4.0, 0, 0, 0.8, 0, 0.78, 1.6, 0.78)]]));
  const crownGeo = keep(mergeParts(THREE, [[blob, place(0, 2.6, 0, 0, 0, 0, 1.3, 1.1, 1.3)], [blob, place(0.6, 3.1, 0.2, 0, 0, 0, 0.9, 0.8, 0.9)], [blob, place(-0.55, 3.2, -0.2, 0, 0, 0, 0.85, 0.8, 0.85)], [blob, place(0, 3.7, 0, 0, 0, 0, 0.8, 0.7, 0.8)]]));
  const clearOf = (x, z) => Math.hypot(x, z) > 6.2 && Math.hypot(x + 3.1, z + 1.3) > 3.2 && Math.hypot(x - LX, z - LZ) > 1.6 && !(z > -1 && Math.abs(x) < 8.5);
  const pines = [], rounds = [];
  const plant = (list, x, z, s) => { if (clearOf(x, z)) list.push({ x, z, s, y: groundY(x, z), ry: rnd(0, 6.28) }); };
  for (let i = 0; i < (preview ? 34 : 70); i++) { const a = rnd(Math.PI * 0.93, Math.PI * 2.07), r = rnd(6.3, 12.5); plant(pines, Math.cos(a) * r * 1.25, Math.sin(a) * r - 1, rnd(0.85, 1.25)); }
  for (let i = 0; i < (preview ? 70 : 230); i++) { const x = rnd(-70, 70), z = rnd(-60, -9); plant(pines, x, z, rnd(0.9, 1.5) * (1 + Math.max(0, -z - 15) * 0.01)); }
  for (const [x, z] of [[-6.8, -4.6], [5.6, -5.4], [-9.5, 0.2], [9.2, -2.2], [1.8, -8.8]]) plant(rounds, x, z, rnd(0.95, 1.2));
  const leafMat = keep(new THREE.MeshLambertMaterial({ flatShading: true }));
  const trunkMat = keep(new THREE.MeshLambertMaterial({ color: 0x4a3322 }));
  const pineMesh = new THREE.InstancedMesh(pineGeo, leafMat, pines.length);
  const crownMesh = new THREE.InstancedMesh(crownGeo, leafMat, rounds.length);
  const trunkMesh = new THREE.InstancedMesh(unitCyl, trunkMat, pines.length + rounds.length);
  const greens = ["#1f4d2b", "#24583a", "#2c5f33", "#1b4332", "#2f6b3a"].map((c) => new THREE.Color(c));
  const autumn = ["#c26a12", "#cf5a1c", "#b0831a", "#a3531a", "#b2461c"].map((c) => new THREE.Color(c));
  pines.forEach((t, i) => {
    pineMesh.setMatrixAt(i, place(t.x, t.y, t.z, 0, t.ry, 0, t.s));
    pineMesh.setColorAt(i, greens[i % greens.length]);
    trunkMesh.setMatrixAt(i, place(t.x, t.y + 0.6 * t.s, t.z, 0, 0, 0, 0.16 * t.s, 1.2 * t.s, 0.16 * t.s));
  });
  rounds.forEach((t, i) => {
    crownMesh.setMatrixAt(i, place(t.x, t.y, t.z, 0, t.ry, 0, t.s));
    crownMesh.setColorAt(i, autumn[i % autumn.length]);
    trunkMesh.setMatrixAt(pines.length + i, place(t.x, t.y + 1.1 * t.s, t.z, 0, 0, 0, 0.2 * t.s, 2.2 * t.s, 0.2 * t.s));
  });
  for (const m of [pineMesh, crownMesh, trunkMesh]) { m.frustumCulled = false; scene.add(m); }
  const mistMat = keep(new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false }));
  const mists = [];
  for (let i = 0; i < (preview ? 3 : 7); i++) {
    const m = add(quad, mistMat, rand(-40, 40), rand(0.6, 2.2), rand(-26, -9));
    m.scale.set(rand(26, 46), rand(4, 6.5), 1);
    mists.push({ m, speed: rand(0.2, 0.5) });
  }

  /* --- small lives: fireflies and an owl at night, falling leaves always, birds by day --- */
  const FLIES = preview ? 22 : 70;
  const fPos = new Float32Array(FLIES * 3), fSeed = new Float32Array(FLIES * 3);
  for (let i = 0; i < FLIES; i++) {
    const a = rand(Math.PI * 0.9, Math.PI * 2.1), r = rand(3.2, 11);
    fPos.set([Math.cos(a) * r * 1.2, rand(0.3, 3.2), Math.sin(a) * r + rand(-1, 3)], i * 3);
    fSeed.set([rand(0.6, 1.6), rand(0, 6.28), rand(0.3, 0.9)], i * 3);
  }
  const flyGeo = keep(new THREE.BufferGeometry());
  flyGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
  flyGeo.setAttribute("aSeed", new THREE.BufferAttribute(fSeed, 3));
  const flyUni = { uTime: { value: 0 }, uPx: { value: 700 }, uSize: { value: preview ? 0.26 : 0.16 }, uOpacity: { value: 1 } };
  const flies = new THREE.Points(flyGeo, keep(new THREE.ShaderMaterial({ uniforms: flyUni, vertexShader: CAMP_FLY_VS, fragmentShader: CAMP_FLY_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  flies.frustumCulled = false;
  flies.renderOrder = 3;
  flies.onBeforeRender = pxFor(flyUni);
  scene.add(flies);
  // drawn over the foliage: a perch is often behind a nearer tree, and the eyes then simply sit in that one
  const eyeMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xfde047, transparent: true, depthWrite: false, depthTest: false, fog: false, blending: THREE.AdditiveBlending }));
  const eyes = [new THREE.Sprite(eyeMat), new THREE.Sprite(eyeMat)];
  eyes.forEach((e) => { e.visible = false; e.scale.setScalar(0.24); e.renderOrder = 4; scene.add(e); });
  const perches = pines.filter((t) => t.z < -5 && t.z > -12 && Math.abs(t.x) < 9);
  const owl = { on: false, left: rand(3, 6), blink: 0 };
  const streakMat = keep(new THREE.MeshBasicMaterial({ map: glow, transparent: true, opacity: 0, depthWrite: false, fog: false, blending: THREE.AdditiveBlending }));
  const streak = add(keep(new THREE.PlaneGeometry(16, 0.5)), streakMat);
  streak.visible = false;
  const shot = { at: -1, next: rand(5, 10), x: 0, y: 0, dx: 0, dy: 0 };
  const LEAVES = preview ? 8 : 22;
  const leafTex = keep(canvasTexture(THREE, 64, 64, (g) => { // a leaf with a stem; the instance colour tints it
    g.fillStyle = "#fff";
    g.beginPath(); g.moveTo(6, 32); g.quadraticCurveTo(30, 6, 58, 32); g.quadraticCurveTo(30, 58, 6, 32); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 2; g.beginPath(); g.moveTo(2, 32); g.lineTo(54, 32); g.stroke();
  }));
  const leaves = new THREE.InstancedMesh(keep(new THREE.PlaneGeometry(0.2, 0.2)), keep(new THREE.MeshLambertMaterial({ map: leafTex, alphaTest: 0.5, side: THREE.DoubleSide })), LEAVES);
  leaves.frustumCulled = false;
  scene.add(leaves);
  const drops = [];
  const spawnLeaf = (d, fresh) => Object.assign(d, { x: rand(-7, 7), z: rand(-5, 3), y: fresh ? rand(0.1, 7) : rand(7, 8.5), phase: rand(0, 6.28), speed: rand(0.35, 0.7), spin: rand(1, 2.4) });
  for (let i = 0; i < LEAVES; i++) { leaves.setColorAt(i, autumn[i % autumn.length]); drops.push(spawnLeaf({ i }, true)); }
  const wingGeo = keep(new THREE.BufferGeometry());
  wingGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array([0, 0, 0, 1, 0.18, 0, 0.42, -0.1, 0]), 3));
  const birdMat = keep(new THREE.MeshBasicMaterial({ color: 0x3b3340, side: THREE.DoubleSide, fog: false }));
  const birds = [0, 1, 2].map((i) => {
    const g = new THREE.Group(), l = new THREE.Mesh(wingGeo, birdMat), r = new THREE.Mesh(wingGeo, birdMat);
    r.scale.x = -1;
    g.add(l, r);
    g.scale.setScalar(1.3);
    scene.add(g);
    return { g, l, r, x: -60 + i * 16 + rand(-5, 5), y: 24 + i * 2.5, z: -70 - i * 5, speed: rand(3, 4.5), phase: rand(0, 6.28) };
  });

  /* --- light --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  const fireLight = new THREE.PointLight(0xff8a3a, 0, 0, 2);
  fireLight.position.set(0, 0.95, 0);
  scene.add(hemi, key, fireLight);
  scene.fog = new THREE.FogExp2(0x0b1022, 0.03);
  let fireBase = 30, tentBase = 0, smokeAlpha = 0.2;

  const warm = new THREE.Color(0xffb45c);
  function applyPalette(p) {
    if (!skyTex || p.dark !== pal.dark) { skyTex?.dispose(); skyTex = skyTexture(p.dark); skyMat.map = skyTex; skyMat.needsUpdate = true; }
    pal = p;
    const d = p.dark;
    scene.fog.color.set(d ? "#0b1022" : "#efd2b0");
    scene.fog.density = d ? 0.03 : 0.018;
    hemi.color.set(d ? "#34467e" : "#fff0d8"); hemi.groundColor.set(d ? "#0a0e18" : "#6b5a3a"); hemi.intensity = d ? 0.7 : 1.25;
    key.color.set(d ? "#9fb4ff" : "#ffd6a0"); key.intensity = d ? 0.55 : 2.2; // moonlight, or a low warm sun (from the front, so nothing turns to silhouette)
    key.position.set(d ? 30 : -40, d ? 40 : 30, d ? 25 : 40);
    starMat.opacity = d ? 0.9 : 0;
    milkyMat.color.set("#8f86d8"); milkyMat.opacity = d ? 0.28 : 0;
    orbMat.color.set(d ? "#e2e8ff" : "#ffe2a8"); orbMat.opacity = d ? 0.85 : 0.95;
    orbHalo.position.copy(d ? MOON : SUN); orbCore.position.copy(d ? MOON : SUN);
    orbHalo.scale.setScalar(d ? 48 : 150); orbCore.scale.setScalar(d ? 13 : 40);
    cloudMat.color.set(d ? "#394271" : "#fff4e4"); cloudMat.opacity = d ? 0.25 : 0.85;
    farMat.color.set(d ? "#1a2650" : "#c9b4c6"); nearMat.color.set(d ? "#0f1836" : "#a58fa6");
    fireStrength.value = d ? 1 : 0.95;
    flames.forEach((m) => blend(THREE, m, d));
    fireBase = d ? 34 : 7;
    fireLight.intensity = fireBase * 0.9;
    bedMat.opacity = d ? 0.85 : 0.4; bed.scale.set(2.2, 1.2, 1);
    blend(THREE, bedMat, d);
    floorGlowMat.opacity = d ? 0.5 : 0;
    emberUni.uOpacity.value = d ? 1 : 0.8;
    blend(THREE, emberMat, d);
    smokeAlpha = d ? 0.16 : 0.32;
    smoke.forEach((s) => s.mat.color.set(d ? "#6b7280" : "#c9ccd2"));
    tentMat.color.set(p.accent);
    tentMat.emissive.copy(tmp.set(p.accent).lerp(warm, 0.55)); tentMat.emissiveIntensity = d ? 0.32 : 0; // lit from inside at night
    tentBase = d ? 3.5 : 0;
    tentLight.intensity = tentBase;
    tentGlowMat.opacity = d ? 0.5 : 0;
    packMat.color.set(p.strong);
    glassMat.color.set(d ? "#ffd08a" : "#f5e6c8");
    lanternGlowMat.opacity = d ? 0.75 : 0.12; lanternGlow.scale.setScalar(1.3);
    flyUni.uOpacity.value = d ? 1 : 0;
    mistMat.color.set(d ? "#3a4a7a" : "#fff1e0"); mistMat.opacity = d ? 0.22 : 0.32;
    birds.forEach((b) => { b.g.visible = !d; });
    if (!d) { eyes.forEach((e) => { e.visible = false; }); owl.on = false; streak.visible = false; shot.at = -1; }
  }
  applyPalette(pal);

  function placeLeaves(t) {
    for (const d of drops) {
      V.set(d.x + Math.sin(t * 0.9 + d.phase) * 0.6, d.y, d.z + Math.cos(t * 0.7 + d.phase) * 0.3);
      E.set(Math.sin(t * d.spin + d.phase) * 1.2, t * 0.6 + d.phase, Math.cos(t * d.spin * 0.8 + d.phase) * 0.9);
      S.setScalar(Math.min(1, d.y / 0.2));
      M4.compose(V, Q.setFromEuler(E), S);
      leaves.setMatrixAt(d.i, M4);
    }
    leaves.instanceMatrix.needsUpdate = true;
  }
  function placeSmoke(t) {
    for (const s of smoke) {
      const life = (t * 0.07 + s.phase) % 1;
      s.s.position.set(s.drift * life + life * life * 2.2, 1.7 + life * 6, -life * 0.6);
      s.s.scale.setScalar(0.8 + life * 3.4);
      s.mat.opacity = Math.sin(Math.PI * life) * smokeAlpha;
    }
  }
  function placeBirds(t) {
    for (const b of birds) {
      const flap = Math.sin(t * 6 + b.phase) * 0.55;
      b.l.rotation.z = flap; b.r.rotation.z = -flap;
      b.g.position.set(b.x, b.y + Math.sin(t * 0.8 + b.phase) * 0.6, b.z);
    }
  }
  const CAM = { x: 0.3, y: 1.9, z: 6.4 }, LOOK = P3(-0.6, 1.0, -1.2);
  const look = new THREE.Vector3();
  function placeCamera(t) {
    // portrait phones step back so the fire and the tent stay in frame, and look up a little:
    // the camp sits in the lower part of the screen with the trees and the sky above it, not over an empty foreground
    const tall = Math.max(0, 1 / camera.aspect - 1);
    camera.position.set(CAM.x + Math.sin(t * 0.07) * 0.5, CAM.y + tall * 0.35 + Math.sin(t * 0.11) * 0.12, CAM.z + tall * 4);
    camera.lookAt(look.set(LOOK.x - tall * 0.35, LOOK.y + tall * 1.7, LOOK.z));
  }
  placeLeaves(0); placeSmoke(0); placeBirds(0); placeCamera(0);

  return {
    update(dt, t) {
      fireTime.value = emberUni.uTime.value = flyUni.uTime.value = t;
      const flick = 0.82 + 0.1 * Math.sin(t * 13.1) + 0.06 * Math.sin(t * 23.7 + 1.3) + 0.05 * Math.sin(t * 7.3 + 0.4);
      fireLight.intensity = fireBase * flick;
      fireLight.position.x = Math.sin(t * 9.1) * 0.06;
      bed.scale.set(2.2 * (0.95 + 0.05 * flick), 1.2 * flick, 1);
      tentLight.intensity = tentBase * (0.92 + 0.08 * Math.sin(t * 5.3));
      lanternGlow.scale.setScalar(1.3 * (0.95 + 0.05 * Math.sin(t * 6.1)));
      emberUni.uWind.value = 0.4 + Math.sin(t * 0.21) * 0.3;
      placeSmoke(t);
      for (const d of drops) { d.y -= dt * d.speed; if (d.y < 0.02) spawnLeaf(d, false); }
      placeLeaves(t);
      for (const c of clouds) { c.m.position.x += dt * c.speed; if (c.m.position.x > 230) c.m.position.x = -230; }
      for (const m of mists) { m.m.position.x += dt * m.speed; if (m.m.position.x > 50) m.m.position.x = -50; }
      if (pal.dark) {
        // now and then two eyes open in the trees, blink a few times and are gone again
        owl.left -= dt;
        if (!owl.on && owl.left <= 0 && perches.length) {
          const p = perches[(Math.random() * perches.length) | 0], y = p.y + 2.7 * p.s, z = p.z + 1.25 * p.s;
          eyes[0].position.set(p.x - 0.13, y, z); eyes[1].position.set(p.x + 0.13, y, z);
          Object.assign(owl, { on: true, left: rand(6, 9), blink: rand(1, 2) });
        } else if (owl.on && owl.left <= 0) Object.assign(owl, { on: false, left: rand(12, 22) });
        owl.blink -= dt;
        if (owl.blink < -0.16) owl.blink = rand(1.5, 3);
        const open = owl.blink > 0 ? 1 : 0.12;
        eyes.forEach((e) => { e.visible = owl.on; e.scale.set(0.24, 0.24 * open, 1); });
        if (shot.at < 0 && (shot.next -= dt) <= 0) {
          const dir = Math.random() < 0.5 ? -1 : 1, ang = rand(0.25, 0.6);
          Object.assign(shot, { at: 0, x: rand(-120, 120), y: rand(110, 160), dx: Math.cos(ang) * dir * 150, dy: -Math.sin(ang) * 150 });
          streak.rotation.z = Math.atan2(shot.dy, shot.dx);
          streak.visible = true;
        }
        if (shot.at >= 0) {
          shot.at += dt / 0.8;
          streak.position.set(shot.x + shot.dx * shot.at * 0.8, shot.y + shot.dy * shot.at * 0.8, -260);
          streakMat.opacity = Math.sin(Math.PI * Math.min(1, shot.at)) * 0.9;
          if (shot.at >= 1) { shot.at = -1; shot.next = rand(8, 16); streak.visible = false; }
        }
      } else {
        for (const b of birds) { b.x += dt * b.speed; if (b.x > 95) b.x = -95; }
        placeBirds(t);
      }
      placeCamera(t);
    },
    setPalette: applyPalette,
    dispose() { disposables.forEach((d) => d.dispose()); skyTex?.dispose(); scene.fog = null; },
  };
}

/* ---------- Koi pond: seen from above — koi gliding under real ripples, light dancing on the pebbles, lotus on the water ---------- */
const KOI_NOISE = /* glsl */ `
  vec2 koiHash2(vec2 p) { p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3))); return fract(sin(p) * 43758.5453); }
  // distance between the nearest and the second nearest drifting cell point: near zero on cell borders, where caustics gather
  float koiCells(vec2 p, float t) {
    vec2 i = floor(p), f = fract(p);
    float d1 = 8.0, d2 = 8.0;
    for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
      vec2 g = vec2(float(x), float(y));
      vec2 o = 0.5 + 0.42 * sin(t + 6.2831 * koiHash2(i + g));
      float d = length(g + o - f);
      if (d < d1) { d2 = d1; d1 = d; } else if (d < d2) { d2 = d; }
    }
    return d2 - d1;
  }
  float koiCaustics(vec2 p, float t) {
    p += 0.35 * vec2(sin(p.y * 0.9 + t * 0.4), cos(p.x * 0.8 - t * 0.35)); // a slow warp, so the web never looks like a grid
    float a = pow(max(0.0, 1.0 - koiCells(p * 0.8, t * 0.55) / 0.22), 3.0); // soft filaments, brightest where they meet
    float b = pow(max(0.0, 1.0 - koiCells(p * 1.25 + 4.1, -t * 0.45) / 0.16), 3.0);
    float patches = smoothstep(-0.2, 0.9, sin(p.x * 0.33 + t * 0.07) * cos(p.y * 0.29 - t * 0.05) + 0.25); // brighter where more sun gets through
    return (a * 0.7 + b * 0.45) * patches;
  }
`;
const KOI_WORLD_VS = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const KOI_BOTTOM_FS = /* glsl */ `
  ${KOI_NOISE}
  uniform sampler2D uMap; uniform float uTime; uniform vec3 uLight; uniform vec3 uAmbient; uniform vec3 uDeep; uniform float uCaustic;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    vec3 stones = texture2D(uMap, p * 0.16).rgb;
    float deep = 0.5 + 0.5 * sin(p.x * 0.23 + 1.3) * cos(p.y * 0.19 - 0.7); // gentle hollows and shallows
    vec3 col = stones * uAmbient * mix(1.0, 0.72, deep);
    col += uLight * koiCaustics(p * 1.6, uTime) * uCaustic * mix(1.0, 0.55, deep);
    col = mix(col, uDeep, 0.38 + 0.25 * deep); // seen through the water column
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
const KOI_FISH_VS = /* glsl */ `
  attribute vec4 aKoi; // atlas cell, swim phase, tail swing, body curve
  varying vec2 vUv; varying vec3 vWorld;
  void main() {
    vec3 p = position; // a flat body along x: tail at -0.5, head at +0.5; width along z
    float back = 0.5 - p.x; // 0 at the head, 1 at the tip of the tail
    p.z += sin(aKoi.y - back * 5.2) * aKoi.z * back * back * 0.5; // a wave running from head to tail, growing towards the tail
    p.z += aKoi.w * back * back; // turning bends the whole body
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vUv = vec2((uv.x + mod(aKoi.x, 2.0)) * 0.5, (uv.y + floor(aKoi.x / 2.0)) * 0.25);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const KOI_FISH_FS = /* glsl */ `
  ${KOI_NOISE}
  uniform sampler2D uMap; uniform float uTime; uniform vec3 uLight; uniform vec3 uAmbient; uniform vec3 uDeep; uniform float uCaustic; uniform float uShade;
  varying vec2 vUv; varying vec3 vWorld;
  void main() {
    #ifdef SHADOW
      float a = texture2D(uMap, vUv, 2.5).a; // a blurred silhouette on the pebbles
      gl_FragColor = vec4(0.0, 0.0, 0.0, a * uShade);
    #else
      vec4 t = texture2D(uMap, vUv);
      if (t.a < 0.01) discard;
      vec3 col = t.rgb * uAmbient + t.rgb * uLight * koiCaustics(vWorld.xz * 1.6, uTime) * uCaustic * 0.4;
      col = mix(col, uDeep, clamp(-vWorld.y * 0.32, 0.0, 0.45)); // deeper fish sink into the green
      gl_FragColor = vec4(col, t.a);
    #endif
    #include <colorspace_fragment>
  }
`;
const KOI_WATER_FS = /* glsl */ `
  uniform sampler2D uUnder; uniform sampler2D uRipple; uniform vec2 uResolution; uniform vec3 uGrid; // grid centre x, z and side
  uniform float uTime; uniform vec3 uTint; uniform vec3 uSky; uniform vec3 uLightDir; uniform vec3 uLightColor; uniform float uSpec; uniform float uSheen;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    vec2 rings = (texture2D(uRipple, (p - uGrid.xy) / uGrid.z + 0.5).rg - 0.5) * 2.0;
    vec2 slope = rings;
    // the breeze: fine ripples that never stop
    slope += 0.045 * vec2(sin(p.x * 2.3 + uTime * 1.1 + sin(p.y * 1.7 + uTime * 0.6)), cos(p.y * 2.1 - uTime * 0.9 + sin(p.x * 1.4 - uTime * 0.4)));
    slope += 0.02 * vec2(sin(p.y * 5.3 - uTime * 1.7), cos(p.x * 4.9 + uTime * 1.5));
    vec3 N = normalize(vec3(-slope.x, 1.0, -slope.y));
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 under = texture2D(uUnder, gl_FragCoord.xy / uResolution + slope * 0.06 + rings * 0.12).rgb; // rings bend the view more than the breeze // what lies below bends with the ripples
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 col = mix(under, uTint, 0.16);
    col = mix(col, uSky, clamp(0.025 + fres * 2.0, 0.0, 0.6));
    float nh = max(dot(N, normalize(uLightDir + V)), 0.0);
    float live = smoothstep(0.02, 0.12, length(rings)); // glints only on the rings a koi or a petal sets off: the breeze alone smears the sun into a blob
    float facing = dot(normalize(vec3(-rings.x, 1.0, -rings.y)), uLightDir) - uLightDir.y; // ring crests tilted towards the light catch it, the far sides fall into shade
    col += (uLightColor * 0.8 + uSky * 0.4) * max(facing, 0.0) * 2.4;
    col *= 1.0 - max(-facing, 0.0) * 2.0;
    col += uLightColor * (pow(nh, 1400.0) * uSpec * live + pow(nh, 60.0) * uSheen); // glints on the ripples, and a soft sheen
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** A small seeded random, so the pond's textures come out the same every time. */
function koiRng(seed) { let s = seed; return (a = 0, b = 1) => { s = (s * 16807) % 2147483647; return a + ((s - 1) / 2147483646) * (b - a); }; }
/** Pebbles and silt on the pond floor, tileable. */
function koiPebbles(THREE) {
  const r = koiRng(4242);
  const tex = canvasTexture(THREE, 512, 512, (g, w) => {
    g.fillStyle = "#3f4a35"; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "30,40,25" : "150,150,120"},${r(0.08, 0.2)})`; g.fillRect(r(0, w), r(0, w), 2, 2); }
    const cols = ["#6d6a58", "#7a7260", "#5e5d4f", "#857b64", "#66644f", "#736d5a", "#55574a", "#8a8068", "#6a6552"];
    for (let i = 0; i < 170; i++) {
      const x = r(0, w), y = r(0, w), rx = r(9, 30), ry = rx * r(0.6, 1), a = r(0, 3.14), c = cols[(r() * cols.length) | 0];
      for (const dx of [-w, 0, w]) for (const dy of [-w, 0, w]) {
        const px = x + dx, py = y + dy;
        if (px < -30 || px > w + 30 || py < -30 || py > w + 30) continue; // drawn again across the edges: the texture tiles
        g.save(); g.translate(px, py); g.rotate(a);
        g.fillStyle = "rgba(0,0,0,0.16)"; g.beginPath(); g.ellipse(1.5, 2, rx, ry, 0, 0, 6.29); g.fill();
        const gr = g.createLinearGradient(-rx, -ry, rx, ry); // lit a little from the upper left, no hard rim
        gr.addColorStop(0, "rgba(255,255,240,0.1)"); gr.addColorStop(1, "rgba(0,0,0,0.12)");
        g.fillStyle = c; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 6.29); g.fill();
        g.fillStyle = gr; g.fill();
        g.restore();
      }
    }
    g.fillStyle = "rgba(63,74,53,0.3)"; g.fillRect(0, 0, w, w); // silt settles over everything and softens it
    for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(60,100,45,${r(0.12, 0.25)})`; g.beginPath(); g.ellipse(r(0, w), r(0, w), r(20, 60), r(12, 35), r(0, 3), 0, 6.29); g.fill(); } // algae
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
const KOI_KINDS = [ // base colour, fins, blotches [colour, count, size], extras
  { base: "#f7f3ea", fin: "rgba(250,246,238,0.6)", spots: [["#e0431c", 4, 1]] }, // kohaku
  { base: "#f7f3ea", fin: "rgba(250,246,238,0.6)", spots: [["#df4a20", 3, 1], ["#1d1d22", 5, 0.45]] }, // sanke
  { base: "#e9e7e1", fin: "rgba(245,245,240,0.6)", spots: [], sheen: true }, // platinum (a black showa vanished in the dark water)
  { base: "#f2b33d", fin: "rgba(250,214,120,0.55)", spots: [], sheen: true }, // ogon, gold
  { base: "#ef7a22", fin: "rgba(250,170,100,0.55)", spots: [["#f7efe2", 2, 0.7]], sheen: true }, // orange
  { base: "#f7f3ea", fin: "rgba(250,246,238,0.6)", spots: [], crown: true }, // tancho: one red crown
  { base: "#7d97ad", fin: "rgba(200,210,220,0.5)", spots: [["#e2672a", 3, 0.8]], net: true }, // asagi, blue-grey
  { base: "#f7f3ea", fin: "rgba(250,246,238,0.6)", spots: [["#e44b21", 6, 0.8]] }, // kohaku, busier
];
/** Eight koi seen from above, head to the right, in a 2 × 4 atlas of 512 × 256 cells. */
function koiAtlas(THREE) {
  const r = koiRng(777);
  return canvasTexture(THREE, 1024, 1024, (g) => {
    KOI_KINDS.forEach((k, n) => {
      const ox = (n % 2) * 512, y0 = Math.floor(n / 2) * 256 + 128;
      const hw = (u) => (u < 0.7 ? 8 + 38 * Math.pow(u / 0.7, 0.7) : 46 * Math.sqrt(Math.max(0, 1 - ((u - 0.7) / 0.3) ** 2)));
      const body = () => {
        g.beginPath();
        for (let i = 0; i <= 40; i++) { const u = i / 40; g.lineTo(ox + 108 + u * 344, y0 - hw(u)); }
        for (let i = 40; i >= 0; i--) { const u = i / 40; g.lineTo(ox + 108 + u * 344, y0 + hw(u)); }
        g.closePath();
      };
      const fin = (pts) => { g.beginPath(); g.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 4) g.quadraticCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3]); g.closePath(); g.fill(); };
      g.fillStyle = k.fin;
      for (const s of [-1, 1]) {
        fin([ox + 360, y0 + s * 38, ox + 332, y0 + s * 96, ox + 284, y0 + s * 104, ox + 318, y0 + s * 70, ox + 330, y0 + s * 40]); // pectoral
        fin([ox + 268, y0 + s * 34, ox + 250, y0 + s * 64, ox + 222, y0 + s * 68, ox + 240, y0 + s * 46, ox + 246, y0 + s * 32]); // pelvic
      }
      g.beginPath(); g.moveTo(ox + 118, y0 - 7); // the tail, a fan with a notch
      g.bezierCurveTo(ox + 86, y0 - 18, ox + 52, y0 - 58, ox + 20, y0 - 68); g.quadraticCurveTo(ox + 48, y0 - 20, ox + 40, y0);
      g.quadraticCurveTo(ox + 48, y0 + 20, ox + 20, y0 + 68); g.bezierCurveTo(ox + 52, y0 + 58, ox + 86, y0 + 18, ox + 118, y0 + 7);
      g.closePath(); g.fill();
      g.strokeStyle = "rgba(255,255,255,0.22)"; g.lineWidth = 1.5;
      for (let i = -5; i <= 5; i++) { g.beginPath(); g.moveTo(ox + 116, y0 + i); g.lineTo(ox + 30 + Math.abs(i) * 3, y0 + i * 12); g.stroke(); }
      g.save(); body(); g.fillStyle = k.base; g.fill(); g.clip();
      for (const [col, count, size] of k.spots) for (let i = 0; i < count; i++) {
        const cx = ox + 108 + r(0.12, 0.95) * 344, cy = y0 + r(-26, 26), rx = r(22, 44) * size, ry = r(14, 26) * size;
        g.fillStyle = col;
        for (let j = 0; j < 3; j++) { g.beginPath(); g.ellipse(cx + r(-rx, rx) * 0.4, cy + r(-ry, ry) * 0.4, rx * r(0.6, 1), ry * r(0.6, 1), r(-0.4, 0.4), 0, 6.29); g.fill(); }
      }
      if (k.crown) { g.fillStyle = "#d9361c"; g.beginPath(); g.ellipse(ox + 398, y0, 20, 17, 0, 0, 6.29); g.fill(); }
      if (k.net) { g.strokeStyle = "rgba(30,50,70,0.35)"; g.lineWidth = 1.2; for (let x = ox + 130; x < ox + 440; x += 13) for (let y = y0 - 44; y < y0 + 44; y += 11) { g.beginPath(); g.arc(x + ((y / 11) % 2) * 6, y, 6, 0.2, 2.9); g.stroke(); } }
      const shade = g.createLinearGradient(0, y0 - 46, 0, y0 + 46); // the body is round: dark flanks, a bright back
      shade.addColorStop(0, "rgba(0,0,0,0.3)"); shade.addColorStop(0.44, "rgba(255,255,255,0.08)"); shade.addColorStop(0.5, "rgba(255,255,255,0.16)"); shade.addColorStop(0.56, "rgba(255,255,255,0.08)"); shade.addColorStop(1, "rgba(0,0,0,0.3)");
      g.fillStyle = shade; g.fillRect(ox, y0 - 60, 512, 120);
      if (k.sheen) { const s = g.createRadialGradient(ox + 330, y0 - 10, 2, ox + 330, y0, 120); s.addColorStop(0, "rgba(255,250,220,0.5)"); s.addColorStop(1, "rgba(255,250,220,0)"); g.fillStyle = s; g.fillRect(ox, y0 - 60, 512, 120); }
      g.fillStyle = "rgba(0,0,0,0.12)"; g.beginPath(); g.ellipse(ox + 262, y0, 72, 4, 0, 0, 6.29); g.fill(); // the dorsal ridge
      g.restore();
      g.fillStyle = "#15151a";
      for (const s of [-1, 1]) { g.beginPath(); g.ellipse(ox + 424, y0 + s * 15, 4.5, 3.2, 0, 0, 6.29); g.fill(); }
    });
  });
}
/** A lily pad with its notch, and its soft shadow. */
function koiPads(THREE) {
  const shape = (g) => { g.beginPath(); g.moveTo(128, 128); g.arc(128, 128, 116, -0.2, -0.55 + Math.PI * 2); g.closePath(); };
  const pad = canvasTexture(THREE, 256, 256, (g) => {
    const gr = g.createRadialGradient(128, 128, 6, 128, 128, 118);
    gr.addColorStop(0, "#86b84e"); gr.addColorStop(0.7, "#54903a"); gr.addColorStop(1, "#3c6f2a");
    shape(g); g.fillStyle = gr; g.fill();
    g.save(); shape(g); g.clip();
    g.strokeStyle = "rgba(40,80,25,0.35)"; g.lineWidth = 2;
    for (let i = 0; i < 22; i++) { const a = -0.2 + (i / 22) * (Math.PI * 2 - 0.35); g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * 116, 128 + Math.sin(a) * 116); g.stroke(); }
    g.restore();
    shape(g); g.strokeStyle = "rgba(30,60,20,0.5)"; g.lineWidth = 3; g.stroke();
  });
  const shadow = canvasTexture(THREE, 256, 256, (g) => { g.filter = "blur(7px)"; shape(g); g.fillStyle = "#000"; g.fill(); });
  return { pad, shadow };
}
/** Lotus petals, tips in the accent colour (redrawn when it changes), and the golden centre. */
function koiLotusDraw(g, accent) {
  g.clearRect(0, 0, 256, 256);
  const ring = (n, dist, len, wid, off) => {
    for (let i = 0; i < n; i++) {
      const a = off + (i / n) * Math.PI * 2;
      g.save(); g.translate(128 + Math.cos(a) * dist, 128 + Math.sin(a) * dist); g.rotate(a);
      const gr = g.createLinearGradient(-len, 0, len, 0);
      gr.addColorStop(0, "#ffffff"); gr.addColorStop(0.55, "#fdf7fa"); gr.addColorStop(1, accent);
      g.fillStyle = gr; g.beginPath(); g.ellipse(0, 0, len, wid, 0, 0, 6.29); g.fill();
      g.strokeStyle = "rgba(0,0,0,0.1)"; g.lineWidth = 1.5; g.stroke();
      g.restore();
    }
  };
  ring(10, 64, 58, 24, 0);
  ring(8, 42, 42, 20, 0.39);
}
function koiLotusCenter(THREE) {
  return canvasTexture(THREE, 128, 128, (g) => {
    g.strokeStyle = "#f4b93a"; g.lineWidth = 3;
    for (let i = 0; i < 28; i++) { const a = (i / 28) * 6.283; g.beginPath(); g.moveTo(64 + Math.cos(a) * 22, 64 + Math.sin(a) * 22); g.lineTo(64 + Math.cos(a) * 40, 64 + Math.sin(a) * 40); g.stroke(); }
    const gr = g.createRadialGradient(60, 60, 2, 64, 64, 24); gr.addColorStop(0, "#f8e27a"); gr.addColorStop(1, "#c9a227");
    g.fillStyle = gr; g.beginPath(); g.arc(64, 64, 22, 0, 6.29); g.fill();
    g.fillStyle = "#8a6d12"; for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.283; g.beginPath(); g.arc(64 + Math.cos(a) * 11, 64 + Math.sin(a) * 11, 2.5, 0, 6.29); g.fill(); }
  });
}
function koiPetal(THREE) {
  return canvasTexture(THREE, 64, 64, (g) => {
    const gr = g.createRadialGradient(32, 40, 2, 32, 34, 30); gr.addColorStop(0, "#fff6f8"); gr.addColorStop(1, "#f6a9c0");
    g.fillStyle = gr; g.beginPath(); g.moveTo(32, 60); g.bezierCurveTo(8, 44, 6, 16, 22, 6); g.lineTo(32, 14); g.lineTo(42, 6); g.bezierCurveTo(58, 16, 56, 44, 32, 60); g.fill();
  });
}
/** A floating paper lantern seen from above: a lit square in a wooden frame. */
function koiLantern(THREE) {
  return canvasTexture(THREE, 128, 128, (g) => {
    const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, "#fff6d0"); gr.addColorStop(0.45, "#ffc766"); gr.addColorStop(1, "#d96f2a");
    g.fillStyle = gr; g.fillRect(18, 18, 92, 92);
    g.strokeStyle = "#4a2f1c"; g.lineWidth = 8; g.strokeRect(18, 18, 92, 92);
    g.lineWidth = 3; g.beginPath(); g.moveTo(64, 18); g.lineTo(64, 110); g.moveTo(18, 64); g.lineTo(110, 64); g.stroke();
  });
}

function koipond(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(20260927);
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), S = new THREE.Vector3(), E = new THREE.Euler(), UPY = new THREE.Vector3(0, 1, 0);
  const TAN = Math.tan((camera.fov * Math.PI) / 360);
  const BOTTOM = -1.2; // the pond floor lies 1.2 below the surface
  const time = { value: 0 };
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.up.set(0, 0, -1); // looking straight down: the top of the screen is -z
  // what the camera sees at the water line; the pond has no edges, so fish, pads and lanterns are laid out over that area
  const view = { hw: 8, hh: 5, h: 9.4 };
  const measure = () => {
    const tall = Math.max(0, 1 / camera.aspect - 1);
    view.h = 9.4 * (1 + tall * 0.3); // portrait phones look from a little higher, so the koi are not too big for the narrow screen
    view.hh = view.h * TAN;
    view.hw = view.hh * camera.aspect;
  };
  measure();
  const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  const edgeOf = (v, lim) => Math.max(0, Math.min(1, (v - lim * 0.72) / (lim * 0.28)));
  const shadowDir = { x: 0.32, z: 0.42 }; // light from the upper left: shadows fall down and to the right

  /* --- below the surface: pebbles with light dancing on them, the koi and their shadows; rendered into a texture every frame --- */
  const under = new THREE.Scene();
  const underUni = { uTime: time, uLight: { value: new THREE.Color() }, uAmbient: { value: new THREE.Color() }, uDeep: { value: new THREE.Color() }, uCaustic: { value: 0.35 } };
  const plane = keep(new THREE.PlaneGeometry(1, 1));
  plane.rotateX(-Math.PI / 2);
  const bottom = new THREE.Mesh(plane, keep(new THREE.ShaderMaterial({ uniforms: { ...underUni, uMap: { value: keep(koiPebbles(THREE)) } }, vertexShader: KOI_WORLD_VS, fragmentShader: KOI_BOTTOM_FS })));
  bottom.scale.set(90, 1, 90);
  bottom.position.y = BOTTOM;
  under.add(bottom);

  const FISH = preview ? 7 : 14;
  const fishGeo = keep(new THREE.PlaneGeometry(1, 0.5, 24, 1));
  fishGeo.rotateX(-Math.PI / 2);
  const koiAttr = new THREE.InstancedBufferAttribute(new Float32Array(FISH * 4), 4);
  koiAttr.setUsage(THREE.DynamicDrawUsage);
  fishGeo.setAttribute("aKoi", koiAttr);
  const fishUni = { ...underUni, uMap: { value: keep(koiAtlas(THREE)) }, uShade: { value: 0.3 } };
  const fishMesh = new THREE.InstancedMesh(fishGeo, keep(new THREE.ShaderMaterial({ uniforms: fishUni, vertexShader: KOI_FISH_VS, fragmentShader: KOI_FISH_FS, transparent: true, depthWrite: false })), FISH);
  const shadowMesh = new THREE.InstancedMesh(fishGeo, keep(new THREE.ShaderMaterial({ uniforms: fishUni, vertexShader: KOI_FISH_VS, fragmentShader: KOI_FISH_FS, transparent: true, depthWrite: false, defines: { SHADOW: "" } })), FISH);
  shadowMesh.renderOrder = 2;
  fishMesh.renderOrder = 3;
  for (const m of [shadowMesh, fishMesh]) { m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage); under.add(m); }
  const fish = [];
  for (let i = 0; i < FISH; i++) {
    fish.push({
      x: r(-0.8, 0.8) * view.hw, z: r(-0.8, 0.8) * view.hh, y: r(-0.9, -0.3), yGoal: -0.6, yNext: r(2, 9),
      heading: r(0, 6.283), speed: 0.5, base: r(0.42, 0.68), turn: 0, curve: 0, phase: r(0, 6.283),
      kind: i % KOI_KINDS.length, size: r(1.3, 1.8) * (preview ? 1.1 : 1), seed: r(0, 100), dripAt: 0,
    });
  }
  const pointer = { x: 0, z: 0, lx: 0, lz: 0, on: 0, at: -1e9 };
  /** Wandering, keeping to the visible water, a little company, and curiosity about the mouse pointer. */
  function stepFish(dt, t) {
    const hw = view.hw * 0.9, hh = view.hh * 0.88;
    for (const f of fish) {
      let want = 0.55 * Math.sin(t * 0.21 + f.seed) + 0.35 * Math.sin(t * 0.47 + f.seed * 1.7); // desired turn, radians a second
      const edge = Math.max(edgeOf(Math.abs(f.x), hw), edgeOf(Math.abs(f.z), hh));
      if (edge > 0) want += wrapAngle(Math.atan2(-f.z, -f.x) - f.heading) * 2.2 * edge;
      let ax = 0, az = 0, n = 0;
      for (const o of fish) {
        if (o === f) continue;
        const dx = o.x - f.x, dz = o.z - f.z, d2 = dx * dx + dz * dz;
        if (d2 < 2.4) want += wrapAngle(Math.atan2(-dz, -dx) - f.heading) * (2.4 - d2) * 0.7; // too close: veer away
        else if (d2 < 9) { ax += Math.cos(o.heading); az += Math.sin(o.heading); n++; }
      }
      if (n) want += wrapAngle(Math.atan2(az, ax) - f.heading) * 0.25; // drift along with the neighbours
      let slow = 1;
      if (pointer.on > 0.01) {
        const dx = pointer.x - f.x, dz = pointer.z - f.z, d = Math.hypot(dx, dz);
        if (d < 4.5) {
          const toward = wrapAngle(Math.atan2(dz, dx) - f.heading);
          want += (d > 1.1 ? toward * 1.1 : -Math.sign(toward || 1) * 0.9) * pointer.on * (1 - d / 4.5); // come closer, then circle
          slow = 0.6 + 0.4 * Math.min(1, d / 1.6);
        }
      }
      want = Math.max(-1.3, Math.min(1.3, want));
      f.turn += (want - f.turn) * Math.min(1, dt * 2.5);
      f.heading += f.turn * dt;
      f.curve += (Math.max(-0.26, Math.min(0.26, f.turn * 0.22)) - f.curve) * Math.min(1, dt * 3);
      const goal = f.base * slow * (1 + 0.8 * Math.max(0, Math.sin(t * 0.3 + f.seed * 3)) ** 8); // now and then a short burst
      f.speed += (goal - f.speed) * Math.min(1, dt * 1.5);
      f.x += Math.cos(f.heading) * f.speed * dt;
      f.z += Math.sin(f.heading) * f.speed * dt;
      f.phase += dt * (2.2 + f.speed * 7 + Math.abs(f.turn) * 2);
      // depth: wander between the floor and the surface; now and then come up and touch the water
      if ((f.yNext -= dt) <= 0) {
        const up = r() < 0.45;
        f.yGoal = up ? -0.08 : r(-0.95, -0.3);
        f.yNext = up ? 3 : r(5, 11);
      }
      f.y += (f.yGoal - f.y) * Math.min(1, dt * 0.9);
    }
  }
  const order = fish.map((_, i) => i);
  /** Deepest first: the koi are blended, so a fish nearer the surface must be drawn over one below it. */
  function placeFish() {
    order.sort((a, b) => fish[a].y - fish[b].y);
    order.forEach((idx, slot) => {
      const f = fish[idx];
      Q.setFromAxisAngle(UPY, -f.heading); // the body's +x (its head) points along the heading
      M4.compose(V.set(f.x, f.y, f.z), Q, S.set(f.size, 1, f.size));
      fishMesh.setMatrixAt(slot, M4);
      const lift = f.y - BOTTOM, grow = 1 + lift * 0.12;
      M4.compose(V.set(f.x + shadowDir.x * lift, BOTTOM + 0.01, f.z + shadowDir.z * lift), Q, S.set(f.size * grow, 1, f.size * grow));
      shadowMesh.setMatrixAt(slot, M4);
      koiAttr.setXYZW(slot, f.kind, f.phase, 0.14 + f.speed * 0.22 + Math.abs(f.turn) * 0.08, f.curve);
    });
    fishMesh.instanceMatrix.needsUpdate = shadowMesh.instanceMatrix.needsUpdate = koiAttr.needsUpdate = true;
  }

  /* --- the water: a small wave simulation gives real ripples; the surface bends the view of everything below it --- */
  const N = preview ? 64 : 128;
  const hgt = new Float32Array(N * N), vel = new Float32Array(N * N), damp = new Float32Array(N * N);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) { const e = Math.min(i, j, N - 1 - i, N - 1 - j); damp[j * N + i] = e < 8 ? 0.995 - (8 - e) * 0.03 : 0.995; } // the rim swallows waves
  const rippleData = new Uint8Array(N * N * 4).fill(128);
  const rippleTex = keep(new THREE.DataTexture(rippleData, N, N, THREE.RGBAFormat, THREE.UnsignedByteType));
  rippleTex.magFilter = rippleTex.minFilter = THREE.LinearFilter;
  rippleTex.needsUpdate = true;
  const grid = { side: Math.max(view.hw, view.hh) * 2.3 };
  const cellOf = (x, z) => { const i = Math.round((x / grid.side + 0.5) * N), j = Math.round((z / grid.side + 0.5) * N); return i > 0 && j > 0 && i < N - 1 && j < N - 1 ? j * N + i : -1; };
  /** A ring starts here: a fish touching the surface, a petal landing, the mouse pointer. */
  function drop(x, z, radius, amount) {
    const cx = (x / grid.side + 0.5) * N, cz = (z / grid.side + 0.5) * N, rc = Math.max(1.5, radius / (grid.side / N));
    for (let j = Math.max(1, Math.floor(cz - rc)); j <= Math.min(N - 2, Math.ceil(cz + rc)); j++) {
      for (let i = Math.max(1, Math.floor(cx - rc)); i <= Math.min(N - 2, Math.ceil(cx + rc)); i++) {
        const d = Math.hypot(i - cx, j - cz) / rc;
        if (d < 1) hgt[j * N + i] += amount * (0.5 + 0.5 * Math.cos(Math.PI * d));
      }
    }
  }
  function stepWater() {
    const k = Math.min(0.45, (1.9 / 60 / (grid.side / N)) ** 2); // waves travel about 1.9 units a second
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const o = j * N + i;
      vel[o] = (vel[o] + k * (hgt[o - 1] + hgt[o + 1] + hgt[o - N] + hgt[o + N] - 4 * hgt[o])) * damp[o];
    }
    for (let o = 0; o < N * N; o++) hgt[o] += vel[o];
  }
  /** Slopes into the texture's red and green: the shader turns them into a bent surface. */
  function packWater() {
    const inv = 127 / (2 * (grid.side / N));
    for (let j = 1; j < N - 1; j++) for (let i = 1; i < N - 1; i++) {
      const o = j * N + i;
      rippleData[o * 4] = Math.max(0, Math.min(255, 128 + (hgt[o + 1] - hgt[o - 1]) * inv));
      rippleData[o * 4 + 1] = Math.max(0, Math.min(255, 128 + (hgt[o + N] - hgt[o - N]) * inv));
    }
    rippleTex.needsUpdate = true;
  }
  const rt = keep(new THREE.WebGLRenderTarget(4, 4));
  rt.texture.colorSpace = THREE.SRGBColorSpace; // stored as sRGB, read back as linear: no banding in the dark water
  const buf = new THREE.Vector2();
  const waterUni = {
    uTime: time, uUnder: { value: rt.texture }, uRipple: { value: rippleTex }, uResolution: { value: new THREE.Vector2(1, 1) }, uGrid: { value: new THREE.Vector3(0, 0, grid.side) },
    uTint: { value: new THREE.Color() }, uSky: { value: new THREE.Color() }, uLightDir: { value: new THREE.Vector3(0, 1, 0) }, uLightColor: { value: new THREE.Color() }, uSpec: { value: 1 }, uSheen: { value: 0.1 },
  };
  const water = new THREE.Mesh(plane, keep(new THREE.ShaderMaterial({ uniforms: waterUni, vertexShader: KOI_WORLD_VS, fragmentShader: KOI_WATER_FS })));
  water.scale.set(90, 1, 90);
  scene.add(water);
  const RT_SCALE = preview ? 0.5 : 0.8; // under water nothing needs to be razor sharp
  water.onBeforeRender = (renderer) => { // like three's Reflector: draw what is under the water first, from the same camera
    renderer.getDrawingBufferSize(buf);
    waterUni.uResolution.value.copy(buf);
    const w = Math.max(2, Math.round(buf.x * RT_SCALE)), h = Math.max(2, Math.round(buf.y * RT_SCALE));
    if (rt.width !== w || rt.height !== h) rt.setSize(w, h);
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(rt);
    renderer.render(under, camera);
    renderer.setRenderTarget(before);
  };

  /* --- on the water: lily pads (their shadows on the pebbles), lotus in the accent colour, sakura petals; lanterns and fireflies at night --- */
  const padTex = koiPads(THREE);
  keep(padTex.pad); keep(padTex.shadow);
  // placed in view units (-1…1), so every screen shape gets its share, most of them near the edges
  const PAD_SPOTS = [[-0.78, -0.62, 1.3], [-0.6, -0.76, 0.9], [-0.92, -0.38, 0.75], [0.74, 0.58, 1.2], [0.88, 0.34, 0.8], [0.56, 0.8, 0.95], [0.82, -0.72, 1.0], [-0.84, 0.7, 0.85], [0.12, -0.88, 0.7], [-0.22, 0.86, 0.75], [0.95, -0.2, 0.65], [-0.5, 0.18, 0.6]];
  const spots = (preview ? PAD_SPOTS.slice(0, 7) : PAD_SPOTS).map(([u, v, s], i) => ({ u, v, s: s * 1.25, rot: r(0, 6.283), spin: r(-0.04, 0.04), bob: r(0, 6.283), lotus: i % 3 === 0, x: 0, z: 0 }));
  const padMat = keep(new THREE.MeshLambertMaterial({ map: padTex.pad, alphaTest: 0.5 }));
  const padShadowMat = keep(new THREE.MeshBasicMaterial({ color: 0x000000, map: padTex.shadow, transparent: true, opacity: 0.35, depthWrite: false }));
  const pads = new THREE.InstancedMesh(plane, padMat, spots.length), padShadows = new THREE.InstancedMesh(plane, padShadowMat, spots.length);
  padShadows.renderOrder = 1;
  pads.frustumCulled = padShadows.frustumCulled = false;
  scene.add(pads);
  under.add(padShadows);
  const lotusCanvas = document.createElement("canvas");
  lotusCanvas.width = lotusCanvas.height = 256;
  const lotusTex = keep(new THREE.CanvasTexture(lotusCanvas));
  lotusTex.colorSpace = THREE.SRGBColorSpace;
  const flowers = spots.filter((s) => s.lotus);
  const lotusMat = keep(new THREE.MeshLambertMaterial({ map: lotusTex, transparent: true, depthWrite: false }));
  const lotus = new THREE.InstancedMesh(plane, lotusMat, flowers.length);
  const centers = new THREE.InstancedMesh(plane, keep(new THREE.MeshLambertMaterial({ map: keep(koiLotusCenter(THREE)), transparent: true, depthWrite: false })), flowers.length);
  lotus.renderOrder = 3; centers.renderOrder = 4;
  for (const m of [lotus, centers]) { m.frustumCulled = false; scene.add(m); }
  let lotusAccent = "";

  const PETALS = preview ? 10 : 26;
  const petals = new THREE.InstancedMesh(plane, keep(new THREE.MeshLambertMaterial({ map: keep(koiPetal(THREE)), transparent: true, depthWrite: false, side: THREE.DoubleSide })), PETALS);
  petals.frustumCulled = false; petals.renderOrder = 5;
  scene.add(petals);
  const spawnPetal = (p, floating) => Object.assign(p, { x: r(-1, 1) * view.hw, z: r(-1, 1) * view.hh, y: floating ? 0.035 : r(2.5, 4.5), rot: r(0, 6.283), spin: r(-0.6, 0.6), life: floating ? r(4, 22) : r(18, 28), vx: r(-0.08, 0.08), vz: r(-0.06, 0.06), s: r(0.16, 0.24) });
  const petalState = [];
  for (let i = 0; i < PETALS; i++) petalState.push(spawnPetal({}, i % 2 === 0)); // half of them still on their way down

  const glow = keep(glowTexture(THREE));
  const lanternMat = keep(new THREE.MeshBasicMaterial({ map: keep(koiLantern(THREE)), transparent: true, depthWrite: false }));
  const poolMat = keep(new THREE.MeshBasicMaterial({ map: glow, color: 0xffa94d, transparent: true, opacity: 0.42, depthWrite: false, blending: THREE.AdditiveBlending }));
  const lanterns = [];
  for (let i = 0; i < (preview ? 2 : 5); i++) {
    const body = new THREE.Mesh(plane, lanternMat), pool = new THREE.Mesh(plane, poolMat);
    body.renderOrder = 6; pool.renderOrder = 2;
    scene.add(body, pool);
    const n = preview ? 2 : 5;
    lanterns.push({ body, pool, u: -0.8 + (i / Math.max(1, n - 1)) * 1.6 + r(-0.1, 0.1), v: (i % 2 ? 0.45 : -0.4) + r(-0.25, 0.25), du: r(0.006, 0.014) * (r() < 0.5 ? -1 : 1), dv: r(-0.004, 0.004), rot: r(0, 1.5), phase: r(0, 6.283) });
  }
  const FLIES = preview ? 12 : 36;
  const fPos = new Float32Array(FLIES * 3), fSeed = new Float32Array(FLIES * 3);
  for (let i = 0; i < FLIES; i++) { fPos.set([r(-9, 9), r(0.4, 1.8), r(-6, 6)], i * 3); fSeed.set([r(0.6, 1.6), r(0, 6.28), r(0.3, 0.8)], i * 3); }
  const flyGeo = keep(new THREE.BufferGeometry());
  flyGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3));
  flyGeo.setAttribute("aSeed", new THREE.BufferAttribute(fSeed, 3));
  const flyUni = { uTime: time, uPx: { value: 700 }, uSize: { value: preview ? 0.2 : 0.13 }, uOpacity: { value: 1 } };
  const flies = new THREE.Points(flyGeo, keep(new THREE.ShaderMaterial({ uniforms: flyUni, vertexShader: CAMP_FLY_VS, fragmentShader: CAMP_FLY_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  flies.frustumCulled = false; flies.renderOrder = 7;
  flies.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); flyUni.uPx.value = buf.y / (2 * TAN); };
  scene.add(flies);

  const moon = new THREE.Mesh(plane, keep(new THREE.MeshBasicMaterial({ map: glow, color: 0xdfe8ff, transparent: true, opacity: 0.32, depthWrite: false, blending: THREE.AdditiveBlending })));
  moon.renderOrder = 1;
  scene.add(moon);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x445544, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.set(-3, 10, -4);
  scene.add(hemi, sun);
  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    underUni.uAmbient.value.set(d ? "#44587e" : "#e8efe0");
    underUni.uLight.value.set(d ? "#9fb8e8" : "#fff4d6");
    underUni.uDeep.value.set(d ? "#061426" : "#14443a");
    underUni.uCaustic.value = d ? 0.03 : 0.5;
    fishUni.uShade.value = d ? 0.12 : 0.3;
    waterUni.uTint.value.set(d ? "#081a2a" : "#1f5b50");
    waterUni.uSky.value.set(d ? "#0d1b33" : "#cfe6ea");
    waterUni.uLightColor.value.set(d ? "#dfe8ff" : "#fff6e0");
    waterUni.uSpec.value = d ? 1.1 : 1.3;
    waterUni.uSheen.value = d ? 0.02 : 0.03;
    waterUni.uLightDir.value.set(d ? 0.35 : -0.35, 1, d ? -0.38 : -0.45).normalize(); // the moon glints on the right, the sun on the left
    moon.visible = d;
    hemi.color.set(d ? "#4a5f8a" : "#ffffff"); hemi.groundColor.set(d ? "#101820" : "#5c7a55"); hemi.intensity = d ? 0.6 : 1.25;
    sun.color.set(d ? "#aac0ff" : "#fff2d8"); sun.intensity = d ? 0.35 : 1.6;
    lotusMat.emissive.set(d ? p.accent : "#000000"); lotusMat.emissiveIntensity = d ? 0.35 : 0; // at night the lotus glows softly
    padShadowMat.opacity = d ? 0.12 : 0.35;
    flyUni.uOpacity.value = d ? 1 : 0;
    lanterns.forEach((l) => { l.body.visible = l.pool.visible = d; });
    if (lotusAccent !== p.accent) { lotusAccent = p.accent; koiLotusDraw(lotusCanvas.getContext("2d"), p.accent); lotusTex.needsUpdate = true; }
  }
  applyPalette(pal);

  function placePads(t) {
    spots.forEach((s, i) => {
      s.x = s.u * view.hw; s.z = s.v * view.hh;
      const c = cellOf(s.x, s.z), sc = s.s * (1 + (c >= 0 ? hgt[c] : 0) * 1.5); // pads ride the passing ripples
      Q.setFromAxisAngle(UPY, s.rot + t * s.spin + Math.sin(t * 0.5 + s.bob) * 0.04);
      M4.compose(V.set(s.x, 0.02, s.z), Q, S.set(sc, 1, sc)); pads.setMatrixAt(i, M4);
      M4.compose(V.set(s.x + shadowDir.x * 1.2, BOTTOM + 0.005, s.z + shadowDir.z * 1.2), Q, S.set(sc * 1.08, 1, sc * 1.08)); padShadows.setMatrixAt(i, M4);
    });
    flowers.forEach((s, i) => {
      Q.setFromAxisAngle(UPY, s.rot * 0.5 + t * 0.03);
      M4.compose(V.set(s.x + 0.08 * s.s, 0.06, s.z - 0.05 * s.s), Q, S.set(s.s * 0.62, 1, s.s * 0.62)); lotus.setMatrixAt(i, M4);
      M4.compose(V.set(s.x + 0.08 * s.s, 0.07, s.z - 0.05 * s.s), Q, S.set(s.s * 0.22, 1, s.s * 0.22)); centers.setMatrixAt(i, M4);
    });
    pads.instanceMatrix.needsUpdate = padShadows.instanceMatrix.needsUpdate = lotus.instanceMatrix.needsUpdate = centers.instanceMatrix.needsUpdate = true;
  }
  /** Petals flutter down, land with a small ring, float for a while and shrink away; then another one falls. */
  function stepPetals(dt, t) {
    petalState.forEach((p, i) => {
      const falling = p.y > 0.036;
      if (falling) {
        p.y -= dt * 0.9; p.x += Math.sin(t * 1.3 + i) * dt * 0.25; p.rot += p.spin * dt * 3;
        if (p.y <= 0.036) { p.y = 0.035; drop(p.x, p.z, 0.4, 0.12); }
      } else {
        p.x += (p.vx + Math.sin(t * 0.2 + i) * 0.03) * dt; p.z += p.vz * dt; p.rot += p.spin * dt * 0.3;
      }
      if ((p.life -= dt) <= 0) spawnPetal(p, false);
      const sc = p.s * Math.min(1, Math.max(0.01, p.life / 1.2));
      Q.setFromEuler(E.set(falling ? Math.sin(t * 3 + i) * 0.6 : 0, p.rot, falling ? Math.cos(t * 2.3 + i) * 0.5 : 0));
      M4.compose(V.set(p.x, p.y, p.z), Q, S.set(sc, 1, sc));
      petals.setMatrixAt(i, M4);
    });
    petals.instanceMatrix.needsUpdate = true;
  }
  function placeLanterns(dt, t) {
    for (const l of lanterns) {
      l.u += l.du * dt; l.v += l.dv * dt;
      if (l.u > 1.15) l.u = -1.15; else if (l.u < -1.15) l.u = 1.15;
      if (l.v > 1.1) l.v = -1.1; else if (l.v < -1.1) l.v = 1.1;
      const x = l.u * view.hw, z = l.v * view.hh;
      l.body.position.set(x, 0.16, z);
      l.body.rotation.y = l.rot + Math.sin(t * 0.9 + l.phase) * 0.06;
      l.body.scale.set(0.55, 1, 0.55);
      const flick = 2.4 * (0.95 + 0.04 * Math.sin(t * 7.1 + l.phase) + 0.03 * Math.sin(t * 13.3 + l.phase * 2));
      l.pool.position.set(x, 0.012, z);
      l.pool.scale.set(flick, 1, flick);
    }
  }
  function placeMoon() { // the moon's reflection sits where its light glints: the light direction mirrored through the camera
    const L = waterUni.uLightDir.value, h = view.h;
    moon.position.set(camera.position.x + (L.x / L.y) * h, 0.006, camera.position.z + (L.z / L.y) * h);
    moon.scale.set(2.2, 1, 2.2);
  }
  function placeCamera(t) {
    const cx = Math.sin(t * 0.05) * 0.25, cz = Math.cos(t * 0.04) * 0.2; // a slow drift: the pads, the fish and the pebbles move apart a little
    camera.position.set(cx, view.h, cz);
    camera.lookAt(cx, 0, cz);
    placeMoon();
  }
  const onMove = (e) => {
    if (e.pointerType && e.pointerType !== "mouse") return;
    const nx = (e.clientX / Math.max(1, window.innerWidth)) * 2 - 1, ny = 1 - (e.clientY / Math.max(1, window.innerHeight)) * 2;
    pointer.x = camera.position.x + nx * view.hw;
    pointer.z = camera.position.z - ny * view.hh;
    pointer.at = performance.now();
  };
  if (!preview) window.addEventListener("pointermove", onMove, { passive: true });

  // warm up: two seconds of swimming and a few settling rings, so the first frame (and the still one) is already alive
  for (let i = 0; i < 60; i++) stepFish(1 / 30, i / 30);
  drop(0.3 * view.hw, -0.2 * view.hh, 0.45, 0.1); // one faint ring: with animation off this frame stays on screen
  for (let i = 0; i < 70; i++) stepWater();
  packWater(); placeFish(); placePads(0); stepPetals(0, 0); placeLanterns(0, 0); placeCamera(0);

  let acc = 0, bugAt = 1.5;
  return {
    update(dt, t) {
      time.value = t;
      measure();
      const side = Math.max(view.hw, view.hh) * 2.3;
      if (Math.abs(side - grid.side) / grid.side > 0.12) { grid.side = side; hgt.fill(0); vel.fill(0); } // the window changed shape a lot
      waterUni.uGrid.value.set(0, 0, grid.side);
      placeCamera(t);
      const now = performance.now();
      pointer.on += ((now - pointer.at < 4000 ? 1 : 0) - pointer.on) * Math.min(1, dt * 2);
      if (now - pointer.at < 120 && Math.hypot(pointer.x - pointer.lx, pointer.z - pointer.lz) > 0.9) { drop(pointer.x, pointer.z, 0.5, 0.12); pointer.lx = pointer.x; pointer.lz = pointer.z; }
      stepFish(dt, t);
      for (const f of fish) if (f.y > -0.14 && (f.dripAt -= dt) <= 0) { drop(f.x + Math.cos(f.heading) * 0.36 * f.size, f.z + Math.sin(f.heading) * 0.36 * f.size, 0.45, 0.2); f.dripAt = r(0.35, 0.7); }
      placeFish();
      stepPetals(dt, t);
      if ((bugAt -= dt) <= 0) { drop(r(-0.85, 0.85) * view.hw, r(-0.85, 0.85) * view.hh, 0.35, 0.1); bugAt = r(1.5, 4); }
      acc = Math.min(acc + dt, 0.1);
      let steps = 0;
      while (acc >= 1 / 60 && steps < 3) { stepWater(); acc -= 1 / 60; steps++; }
      if (steps) packWater();
      placePads(t);
      if (pal.dark) placeLanterns(dt, t);
    },
    setPalette: applyPalette,
    dispose() { window.removeEventListener("pointermove", onMove); disposables.forEach((d) => d.dispose()); },
  };
}

/* ---------- Ink-wash landscape: 水墨山水 — ridges painted in ink on rice paper, mist, a boat on the river, cranes, a pine, a poem and a seal ---------- */
const INK_NOISE = /* glsl */ `
  float inkH(float n) { return fract(sin(n) * 43758.5453); }
  float inkN(vec2 p) {
    vec2 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    float n = dot(i, vec2(1.0, 57.0));
    return mix(mix(inkH(n), inkH(n + 1.0), f.x), mix(inkH(n + 57.0), inkH(n + 58.0), f.x), f.y);
  }
  float inkFbm(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 3; i++) { s += a * inkN(p); p = p * 2.03 + 17.1; a *= 0.5; } return s / 0.875; }
`;
// every layer is a strip whose top edge is its ridge line; X and Y are in screen half-heights, so each layer keeps its size on screen
const INK_LAYER_VS = /* glsl */ `
  uniform float uScale; // world units per screen half-height at this layer's depth
  attribute float aTop;
  varying float vX; varying float vY; varying float vTop;
  void main() {
    vX = position.x / uScale; vY = position.y / uScale; vTop = aTop;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;
const INK_MOUNTAIN_FS = /* glsl */ `
  ${INK_NOISE}
  uniform vec3 uInk; uniform vec3 uMist; uniform vec3 uRim; uniform sampler2D uPaper;
  uniform float uWash; uniform float uEdge; uniform float uFade; uniform float uStroke; uniform float uDots; uniform float uSeed; uniform float uNight; uniform float uLow;
  varying float vX; varying float vY; varying float vTop;
  void main() {
    float d = vTop - vY; // how far below the ridge line
    float fibre = inkN(vec2(vX * 38.0 + uSeed, d * 300.0)); // the dry brush: fibres along the stroke, and gaps where it ran out of ink
    float rim = exp(-d * uEdge) * mix(0.45, 1.0, fibre) * smoothstep(uLow - 0.35, uLow, vTop); // a ridge that runs low dissolves into the mist
    float wash = uWash * (1.0 - smoothstep(0.0, uFade, d)) * (0.65 + 0.5 * inkFbm(vec2(vX, vY) * 7.0 + uSeed)); // cloudy, fading into the mist
    float streak = smoothstep(0.6, 0.88, inkN(vec2((vX + vY * 0.45) * 55.0 + uSeed, vY * 14.0))) * smoothstep(0.3, 0.7, inkN(vec2(vX * 5.0 + uSeed, vY * 2.5))) * uStroke * (1.0 - smoothstep(0.0, uFade * 0.5, d)); // texture strokes down the slopes, slanted, in clusters
    vec2 cell = floor(vec2(vX, vY) * 90.0), f = fract(vec2(vX, vY) * 90.0) - 0.5;
    float dots = uDots * step(0.82, inkH(dot(cell, vec2(12.9898, 78.233)) + uSeed)) * (1.0 - smoothstep(0.18, 0.32, length(f))) * (1.0 - smoothstep(0.02, 0.09, d)); // moss dots on the ridges
    float k = clamp(rim * 0.85 + wash + streak * 0.45 + dots, 0.0, 1.0);
    vec3 col = mix(uMist, uInk, k);
    col += uRim * uNight * 0.45 * exp(-d * uEdge * 2.2) * fibre; // moonlight catching the ridges
    col *= mix(0.94, 1.04, texture2D(uPaper, gl_FragCoord.xy / 512.0).r);
    gl_FragColor = vec4(col, smoothstep(0.0, 0.01, d + (fibre - 0.5) * 0.014));
    #include <colorspace_fragment>
  }
`;
const INK_SKY_FS = /* glsl */ `
  ${INK_NOISE}
  uniform vec3 uSky; uniform vec3 uSkyTop; uniform sampler2D uPaper; uniform float uTime;
  varying float vX; varying float vY; varying float vTop;
  void main() {
    vec3 col = mix(uSky, uSkyTop, smoothstep(-0.2, 1.0, vY));
    col = mix(col, uSkyTop, smoothstep(0.55, 0.9, inkFbm(vec2(vX * 1.4 + uTime * 0.004, vY * 3.0))) * 0.25); // faint washes in the sky
    col *= mix(0.94, 1.04, texture2D(uPaper, gl_FragCoord.xy / 512.0).r);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
const INK_WATER_FS = /* glsl */ `
  ${INK_NOISE}
  uniform vec3 uMist; uniform vec3 uLine; uniform vec3 uGlow; uniform sampler2D uPaper; uniform float uTime; uniform float uGlowX;
  varying float vX; varying float vY; varying float vTop;
  void main() {
    float below = vTop - vY; // 0 at the far shore, growing towards the viewer
    float band = mix(260.0, 60.0, smoothstep(0.0, 0.8, below)); // ripple lines, finer in the distance
    float line = smoothstep(0.62, 0.95, inkN(vec2(vX * mix(14.0, 4.0, smoothstep(0.0, 0.8, below)) + uTime * 0.03, vY * band)));
    float shore = 0.12 * exp(-below * 14.0) * inkN(vec2(vX * 30.0, 3.0)); // the far bank's shadow in the water
    float glint = exp(-pow((vX - uGlowX) / 0.07, 2.0)) * line * smoothstep(0.02, 0.2, below); // the sun or moon, broken up by ripples
    vec3 col = mix(uMist, uLine, clamp(line * 0.35 + shore, 0.0, 1.0));
    col = mix(col, uGlow, glint * 0.8);
    col *= mix(0.94, 1.04, texture2D(uPaper, gl_FragCoord.xy / 512.0).r);
    float edge = smoothstep(0.0, 0.05, below + (inkN(vec2(vX * 9.0, 7.0)) - 0.5) * 0.03); // the far shore fades in, unevenly, instead of a ruled line
    gl_FragColor = vec4(col, edge);
    #include <colorspace_fragment>
  }
`;

const INK_FONT = '"Kaiti SC", "STKaiti", "KaiTi", "BiauKai", "Noto Serif CJK SC", "Songti SC", serif'; // brush-style Chinese faces first
/** Rice-paper grain (grey: the shaders read how much lighter or darker the paper is here). */
function inkPaper(THREE) {
  const r = koiRng(9001);
  const tex = canvasTexture(THREE, 512, 512, (g, w) => {
    g.fillStyle = "#808080"; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 5000; i++) { const v = r() < 0.5 ? 60 : 200; g.fillStyle = `rgba(${v},${v},${v},${r(0.05, 0.18)})`; g.fillRect(r(0, w), r(0, w), r(1, 2.5), r(1, 2.5)); }
    g.lineWidth = 1;
    for (let i = 0; i < 900; i++) { // the fibres
      const x = r(0, w), y = r(0, w), a = r(0, 6.28), l = r(6, 26), v = r() < 0.6 ? 215 : 70;
      g.strokeStyle = `rgba(${v},${v},${v},${r(0.08, 0.22)})`;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + Math.cos(a + 0.6) * l * 0.5, y + Math.sin(a + 0.6) * l * 0.5, x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    }
  });
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
function inkSun(THREE) {
  const r = koiRng(31);
  return canvasTexture(THREE, 256, 256, (g) => {
    const gr = g.createRadialGradient(118, 116, 10, 128, 128, 100);
    gr.addColorStop(0, "#e2553a"); gr.addColorStop(0.85, "#c9381f"); gr.addColorStop(1, "#b52f1a");
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i <= 64; i++) { const a = (i / 64) * 6.283, rad = 98 + r(-1.5, 1.5); g.lineTo(128 + Math.cos(a) * rad, 128 + Math.sin(a) * rad); }
    g.fill();
    for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(255,235,210,${r(0.03, 0.1)})`; g.fillRect(r(40, 216), r(40, 216), r(1, 3), r(1, 3)); } // paper showing through the pigment
  });
}
function inkMoon(THREE) {
  return canvasTexture(THREE, 256, 256, (g) => {
    const halo = g.createRadialGradient(128, 128, 40, 128, 128, 128);
    halo.addColorStop(0, "rgba(240,236,220,0.45)"); halo.addColorStop(1, "rgba(240,236,220,0)");
    g.fillStyle = halo; g.fillRect(0, 0, 256, 256);
    const disc = g.createRadialGradient(118, 118, 6, 128, 128, 58);
    disc.addColorStop(0, "#fbf7ea"); disc.addColorStop(1, "#e6dfc8");
    g.fillStyle = disc; g.beginPath(); g.arc(128, 128, 56, 0, 6.29); g.fill();
  });
}
/** A worn square seal, 山水清音 carved out of it (the paper shows through the characters). */
function inkSealDraw(g, color) {
  const r = koiRng(77);
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = color; g.fillRect(10, 10, 108, 108);
  g.globalCompositeOperation = "destination-out";
  for (let i = 0; i < 60; i++) g.fillRect(r() < 0.5 ? r(8, 14) : r(114, 120), r(8, 120), r(1, 3), r(2, 5));
  for (let i = 0; i < 60; i++) g.fillRect(r(8, 120), r() < 0.5 ? r(8, 14) : r(114, 120), r(2, 5), r(1, 3));
  for (let i = 0; i < 40; i++) g.fillRect(r(14, 114), r(14, 114), r(1, 2.5), r(1, 2.5));
  g.font = `bold 44px ${INK_FONT}`; g.textAlign = "center"; g.textBaseline = "middle";
  [["山", 88, 40], ["水", 88, 88], ["清", 40, 40], ["音", 40, 88]].forEach(([c, x, y]) => g.fillText(c, x, y + 2)); // read right column first
  g.globalCompositeOperation = "source-over";
}
/** Two lines of a poem in vertical columns, read from the right. */
function inkVerseDraw(g, lines, color) {
  const r = koiRng(5);
  g.clearRect(0, 0, 256, 640);
  g.fillStyle = color; g.textAlign = "center"; g.textBaseline = "middle"; g.font = `64px ${INK_FONT}`;
  lines.forEach((line, col) => [...line].forEach((c, i) => { g.globalAlpha = r(0.8, 0.95); g.fillText(c, col ? 70 : 186, 60 + i * 118); }));
  g.globalAlpha = 1;
}
function inkBoat(THREE) {
  return canvasTexture(THREE, 256, 128, (g) => {
    const ink = "#1b1b1d";
    g.fillStyle = "rgba(27,27,29,0.18)"; g.beginPath(); g.ellipse(128, 92, 96, 7, 0, 0, 6.29); g.fill(); // its blurred reflection
    g.fillStyle = ink;
    g.beginPath(); g.moveTo(22, 70); g.quadraticCurveTo(128, 96, 238, 62); g.quadraticCurveTo(200, 84, 128, 86); g.quadraticCurveTo(58, 86, 22, 70); g.fill(); // hull
    g.globalAlpha = 0.85; g.beginPath(); g.moveTo(74, 76); g.quadraticCurveTo(104, 40, 144, 76); g.closePath(); g.fill(); g.globalAlpha = 1; // the canopy
    g.beginPath(); g.moveTo(177, 74); g.lineTo(184, 52); g.lineTo(191, 74); g.closePath(); g.fill(); // the fisherman
    g.beginPath(); g.moveTo(169, 53); g.lineTo(184, 42); g.lineTo(199, 53); g.closePath(); g.fill(); // his straw hat
    g.strokeStyle = ink; g.lineWidth = 2; g.beginPath(); g.moveTo(186, 58); g.quadraticCurveTo(214, 32, 246, 20); g.stroke(); // the rod
    g.lineWidth = 1; g.globalAlpha = 0.6; g.beginPath(); g.moveTo(246, 20); g.lineTo(243, 88); g.stroke(); g.globalAlpha = 1;
    g.fillStyle = "rgba(27,27,29,0.35)"; for (let i = 0; i < 4; i++) g.fillRect(4 + i * 3, 74 + i * 4, 20 - i * 4, 1.5); // the wake
  });
}
/** A red-crowned crane flying to the left, and one wing drawn upwards from the shoulder (bottom edge). */
function inkCrane(THREE) {
  const body = canvasTexture(THREE, 256, 128, (g) => {
    g.lineCap = "round";
    g.strokeStyle = "#1c1c1e"; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(178, 66); g.lineTo(250, 74); g.moveTo(178, 70); g.lineTo(248, 80); g.stroke(); // legs trailing behind
    g.fillStyle = "#1c1c1e"; g.beginPath(); g.ellipse(190, 62, 18, 8, 0.1, 0, 6.29); g.fill(); // black tail feathers
    g.fillStyle = "#f7f4ec"; g.strokeStyle = "rgba(28,28,30,0.7)"; g.lineWidth = 1.5;
    g.beginPath(); g.ellipse(146, 62, 36, 13, 0, 0, 6.29); g.fill(); g.stroke();
    g.strokeStyle = "#1c1c1e"; g.lineWidth = 6; g.beginPath(); g.moveTo(114, 58); g.quadraticCurveTo(84, 50, 50, 54); g.stroke(); // black neck
    g.fillStyle = "#f7f4ec"; g.beginPath(); g.ellipse(44, 54, 8, 6, 0, 0, 6.29); g.fill();
    g.fillStyle = "#c8321f"; g.beginPath(); g.arc(44, 50, 3.2, 0, 6.29); g.fill(); // the red crown
    g.strokeStyle = "#6b6258"; g.lineWidth = 2.5; g.beginPath(); g.moveTo(37, 55); g.lineTo(12, 57); g.stroke(); // beak
  });
  const wing = canvasTexture(THREE, 256, 128, (g) => {
    g.fillStyle = "#f7f4ec"; g.strokeStyle = "rgba(28,28,30,0.6)"; g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(100, 126); g.quadraticCurveTo(80, 60, 30, 14); g.quadraticCurveTo(110, 40, 170, 126); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = "#1c1c1e"; // black flight feathers at the tip and along the trailing edge
    g.beginPath(); g.moveTo(30, 14); g.quadraticCurveTo(70, 34, 112, 70); g.lineTo(96, 74); g.quadraticCurveTo(66, 46, 30, 14); g.fill();
    for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(40 + i * 12, 22 + i * 9); g.lineTo(30 + i * 12, 10 + i * 9); g.lineTo(46 + i * 12, 20 + i * 9); g.fill(); }
  });
  return { body, wing };
}
/**
 * A long band of mist that fades to nothing at every edge (the shared cloud texture has blobs cut off at its borders:
 * straight seams). Handed over as white pixels with only the alpha varying: a canvas stores see-through pixels as black,
 * and filtering blends that black into the fading edge, which along a long flat outline shows as a thin grey line.
 */
function inkMist(THREE) {
  const r = koiRng(271);
  const c = document.createElement("canvas");
  c.width = 512; c.height = 128;
  ((g, w, h) => {
    for (let i = 0; i < 26; i++) {
      const x = r(60, w - 60), y = r(44, h - 44), rad = r(26, 44);
      const gr = g.createRadialGradient(x, y, 0, x, y, rad);
      gr.addColorStop(0, "rgba(255,255,255,0.85)"); gr.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  })(c.getContext("2d"), 512, 128);
  // the outline billows: a wandering centre line and a thickness that swells and thins (an ellipse's flat top reads as a ruled line)
  const n1 = (x, k) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f), h1 = (n) => { const q = Math.sin(n * 91.7 + k * 17.3) * 43758.5453; return q - Math.floor(q); }; return h1(i) * (1 - u) + h1(i + 1) * u; };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const img = c.getContext("2d").getImageData(0, 0, 512, 128).data;
  for (let x = 0; x < 512; x++) {
    const u = x / 511, env = Math.pow(Math.sin(Math.PI * u), 0.7);
    const mid = 0.5 + 0.16 * (n1(u * 4, 1) - 0.5), thick = 0.46 * env * (0.45 + 0.55 * n1(u * 7, 2));
    for (let y = 0; y < 128; y++) {
      const v = y / 127, o = (y * 512 + x) * 4;
      const mask = (1 - sm(0.3, 1, Math.abs(v - mid) / Math.max(thick, 1e-3))) * Math.sqrt(Math.sin(Math.PI * v));
      img[o] = img[o + 1] = img[o + 2] = 255;
      img[o + 3] = Math.round(img[o + 3] * mask);
    }
  }
  const tex = new THREE.DataTexture(img, 512, 128, THREE.RGBAFormat);
  tex.flipY = true;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
/** A pine leaning out from a cliff: the trunk starts at the bottom left. */
function inkPine(THREE) {
  const r = koiRng(1234);
  return canvasTexture(THREE, 512, 512, (g) => {
    const ink = (a) => `rgba(24,24,26,${a})`;
    g.lineCap = "round"; g.lineJoin = "round";
    for (let k = 0; k < 3; k++) { // the trunk: overlapping rough strokes
      g.strokeStyle = ink(0.55 + k * 0.15); g.lineWidth = 26 - k * 7;
      g.beginPath(); g.moveTo(40 + k * 3, 505); g.bezierCurveTo(70, 400, 30 + k * 4, 320, 120, 250); g.bezierCurveTo(190, 196, 260, 210, 330, 170); g.stroke();
    }
    const branch = (x0, y0, x1, y1, w) => { g.strokeStyle = ink(0.75); g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.quadraticCurveTo((x0 + x1) / 2, Math.min(y0, y1) - 20, x1, y1); g.stroke(); };
    branch(120, 250, 250, 150, 7); branch(200, 205, 410, 190, 6); branch(90, 330, 20, 250, 6); branch(300, 180, 470, 120, 5);
    const pad = (cx, cy, rx, ry) => { // needles in fans of short strokes, over a light wash
      g.fillStyle = ink(0.18); g.beginPath(); g.ellipse(cx, cy + ry * 0.3, rx, ry * 0.7, 0, 0, 6.29); g.fill();
      g.strokeStyle = ink(0.75); g.lineWidth = 1.6;
      for (let i = 0; i < rx * 1.8; i++) {
        const x = cx + r(-rx, rx), y = cy + r(-ry, ry) * (1 - (Math.abs(x - cx) / rx) * 0.6);
        for (let j = 0; j < 5; j++) { const a = -Math.PI / 2 + (j - 2) * 0.35 + r(-0.1, 0.1); g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * 9, y + Math.sin(a) * 9); g.stroke(); }
      }
    };
    pad(250, 142, 60, 16); pad(410, 182, 70, 16); pad(470, 112, 40, 12); pad(30, 240, 36, 12); pad(330, 160, 40, 12);
  });
}

function inkwash(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(8848);
  const TAN = Math.tan((camera.fov * Math.PI) / 360);
  const time = { value: 0 };
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.far = 400;
  // the ridge lines: 1D value noise with a fixed seed, so it is the same painting every time
  const hash1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const noise1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return hash1(i) * (1 - u) + hash1(i + 1) * u; };
  const fbm1 = (x) => { let s = 0, a = 0.5; for (let o = 0; o < 5; o++) { s += a * noise1(x); x = x * 2.07 + 11.3; a *= 0.5; } return s / 0.96875; };
  const peak = (X, c, w, h) => h * Math.exp(-(((X - c) / w) ** 2));
  const COLS = preview ? 220 : 480, W = 4.4; // the layers reach well past the widest screens
  /** A strip at depth D whose top edge follows top(X); X and Y in screen half-heights, so every layer keeps its size on screen. */
  function strip(D, top, x0, x1, bottom = -1.3, cols = COLS) {
    const s = D * TAN, pos = new Float32Array((cols + 1) * 6), tops = new Float32Array((cols + 1) * 2), idx = [];
    for (let c = 0; c <= cols; c++) {
      const X = x0 + ((x1 - x0) * c) / cols, T = top(X);
      pos.set([X * s, T * s, 0, X * s, bottom * s, 0], c * 6);
      tops[c * 2] = tops[c * 2 + 1] = T;
      if (c < cols) { const a = c * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = keep(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aTop", new THREE.BufferAttribute(tops, 1));
    g.setIndex(idx);
    return g;
  }
  const paper = keep(inkPaper(THREE));
  const layerMat = (fs, uniforms) => keep(new THREE.ShaderMaterial({ uniforms, vertexShader: INK_LAYER_VS, fragmentShader: fs, transparent: true, depthWrite: false, depthTest: false }));
  // painted back to front: every layer is drawn in its order, nothing is depth-tested
  const place = (mesh, D, order) => { mesh.position.z = -D; mesh.renderOrder = order; mesh.frustumCulled = false; scene.add(mesh); return mesh; };
  const quad = keep(new THREE.PlaneGeometry(1, 1));

  const skyUni = { uSky: { value: new THREE.Color() }, uSkyTop: { value: new THREE.Color() }, uPaper: { value: paper }, uTime: time, uScale: { value: 150 * TAN } };
  place(new THREE.Mesh(strip(150, () => 1.4, -W - 0.5, W + 0.5, -1.4, 8), layerMat(INK_SKY_FS, skyUni)), 150, 0);
  const sunTex = keep(inkSun(THREE)), moonTex = keep(inkMoon(THREE));
  const orbMat = keep(new THREE.MeshBasicMaterial({ map: sunTex, transparent: true, depthWrite: false, depthTest: false }));
  const orb = place(new THREE.Mesh(quad, orbMat), 140, 1);
  const SUN = { X: -0.28, Y: 0.55 };

  const mist = { value: new THREE.Color() }, rimCol = { value: new THREE.Color("#8e9cba") }, night = { value: 0 };
  const LAYERS = [ // far to near: paler, softer and higher at the back, darker and sharper in front
    { D: 90, order: 2, wash: 0.55, edge: 22, fade: 0.32, stroke: 0.08, dots: 0, top: (X) => 0.28 + 0.22 * fbm1(X * 1.1 + 3) + peak(X, -0.9, 0.35, 0.18) + peak(X, 1.1, 0.4, 0.2) + peak(X, 2.4, 0.5, 0.15) + peak(X, -2.3, 0.5, 0.17) },
    { D: 62, order: 4, wash: 0.7, edge: 28, fade: 0.36, stroke: 0.25, dots: 0.25, top: (X) => 0.1 + 0.2 * fbm1(X * 1.6 + 9) + peak(X, 0.35, 0.2, 0.42) + peak(X, -1.5, 0.3, 0.25) + peak(X, 1.9, 0.35, 0.28) + peak(X, -3, 0.4, 0.2) + peak(X, 3.2, 0.4, 0.22) },
    { D: 42, order: 6, wash: 0.85, edge: 34, fade: 0.3, stroke: 0.6, dots: 0.6, top: (X) => -0.06 + 0.18 * fbm1(X * 2.2 + 21) + peak(X, -0.62, 0.24, 0.3) + peak(X, 0.98, 0.3, 0.26) + peak(X, -1.9, 0.35, 0.28) + peak(X, 2.5, 0.4, 0.25) },
    { D: 22, order: 10, wash: 1, edge: 40, fade: 0.26, stroke: 0.8, dots: 0.9, top: (X) => -0.66 + 0.1 * fbm1(X * 3 + 5) + peak(X, -1.35, 0.5, 0.62) + peak(X, 1.5, 0.55, 0.56) + peak(X, -2.8, 0.6, 0.72) + peak(X, 3.0, 0.7, 0.66) },
  ];
  const inkCols = LAYERS.map(() => ({ value: new THREE.Color() }));
  const mountainUni = (L, i, seed) => ({ uInk: inkCols[i], uMist: mist, uRim: rimCol, uNight: night, uPaper: { value: paper }, uWash: { value: L.wash }, uEdge: { value: L.edge }, uFade: { value: L.fade }, uStroke: { value: L.stroke }, uDots: { value: L.dots }, uSeed: { value: seed }, uLow: { value: L.low ?? -3 }, uScale: { value: L.D * TAN } });
  LAYERS.forEach((L, i) => place(new THREE.Mesh(strip(L.D, L.top, -W, W), layerMat(INK_MOUNTAIN_FS, mountainUni(L, i, i * 17.3))), L.D, L.order));

  const WATER_Y = -0.2; // the river between the middle mountains and the near banks
  const waterUni = { uMist: mist, uLine: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uPaper: { value: paper }, uTime: time, uGlowX: { value: SUN.X }, uScale: { value: 30 * TAN } };
  place(new THREE.Mesh(strip(30, () => WATER_Y, -W, W, -1.3, 8), layerMat(INK_WATER_FS, waterUni)), 30, 8);

  // mist: unpainted paper drifting across the feet of the mountains
  const mistMat = keep(new THREE.MeshBasicMaterial({ map: keep(inkMist(THREE)), transparent: true, depthWrite: false, depthTest: false }));
  const MISTS = [[80, 0.16, 3], [80, 0.3, 3], [55, 0.02, 5], [55, 0.12, 5], [36, -0.14, 7], [18, -0.5, 11], [18, -0.62, 11]];
  const mists = (preview ? MISTS.filter((_, i) => i % 2 === 0) : MISTS).map(([D, Y, order], i) => {
    const m = place(new THREE.Mesh(quad, mistMat), D, order);
    m.scale.set(r(2.2, 3.4) * D * TAN, r(0.2, 0.32) * D * TAN, 1);
    return { m, D, Y, X: r(-3, 3), speed: r(0.004, 0.01) * (i % 2 ? 1 : -1) };
  });

  // a cliff coming in from the left edge, with a pine leaning out over the water (kept to the edge on every screen shape)
  const cliffTop = (X) => 0.08 - 1.36 * (X < 0.05 ? 0 : X > 1.05 ? 1 : (1 - Math.cos(Math.PI * (X - 0.05))) / 2) + 0.06 * fbm1(X * 6 + 40) + peak(X, 0.12, 0.1, 0.06);
  const cliff = place(new THREE.Mesh(strip(15, cliffTop, -0.5, 1.1, -1.3, preview ? 80 : 160), layerMat(INK_MOUNTAIN_FS, mountainUni({ D: 15, wash: 1, edge: 40, fade: 0.3, stroke: 0.9, dots: 1, low: -0.45 }, 3, 91.7))), 15, 12);
  const pineGeo = keep(new THREE.PlaneGeometry(1, 1));
  pineGeo.translate(0.42, 0.5, 0); // the trunk's foot (8 % in from the left of the picture) sits on the origin
  const pine = place(new THREE.Mesh(pineGeo, keep(new THREE.MeshBasicMaterial({ map: keep(inkPine(THREE)), transparent: true, depthWrite: false, depthTest: false }))), 15, 13);

  const boatMat = keep(new THREE.MeshBasicMaterial({ map: keep(inkBoat(THREE)), transparent: true, depthWrite: false, depthTest: false }));
  const boat = place(new THREE.Mesh(quad, boatMat), 30, 9);
  const lampMat = keep(new THREE.MeshBasicMaterial({ map: keep(glowTexture(THREE)), color: 0xffb35c, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  const lamp = place(new THREE.Mesh(quad, lampMat), 30, 9.5);
  const drift = { boat: -0.35 }; // in the water layer's own units

  const craneTex = inkCrane(THREE);
  keep(craneTex.body); keep(craneTex.wing);
  const craneMat = (map, opacity = 1) => keep(new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false, depthTest: false }));
  const bodyMat = craneMat(craneTex.body), nearWingMat = craneMat(craneTex.wing), farWingMat = craneMat(craneTex.wing, 0.55);
  const wingGeo = keep(new THREE.PlaneGeometry(1, 0.5));
  wingGeo.translate(0, 0.25, 0); // the shoulder is the bottom edge: flapping flips the wing about it
  const CRANE_D = 50, cranes = [];
  for (let i = 0; i < 3; i++) {
    const g = new THREE.Group();
    const far = new THREE.Mesh(wingGeo, farWingMat), body = new THREE.Mesh(quad, bodyMat), near = new THREE.Mesh(wingGeo, nearWingMat);
    body.scale.set(1, 0.5, 1);
    far.position.set(0.03, 0.03, 0); near.position.set(0.02, 0.02, 0);
    far.renderOrder = 5; body.renderOrder = 5.1; near.renderOrder = 5.2;
    for (const m of [far, body, near]) m.frustumCulled = false;
    g.add(far, body, near);
    g.position.z = -CRANE_D;
    scene.add(g);
    cranes.push({ g, far, near, phase: r(0, 6.28) });
  }
  const flight = { X: (camera.aspect || 1) * 0.35, Y: 0.66, wait: 0 }; // the first pass is already under way

  // a poem and a seal in the top right corner, as a painter would sign
  const verseCanvas = document.createElement("canvas");
  verseCanvas.width = 256; verseCanvas.height = 640;
  const verseTex = keep(new THREE.CanvasTexture(verseCanvas));
  verseTex.colorSpace = THREE.SRGBColorSpace;
  const verse = place(new THREE.Mesh(quad, keep(new THREE.MeshBasicMaterial({ map: verseTex, transparent: true, depthWrite: false, depthTest: false }))), 10, 14);
  const sealCanvas = document.createElement("canvas");
  sealCanvas.width = sealCanvas.height = 128;
  const sealTex = keep(new THREE.CanvasTexture(sealCanvas));
  sealTex.colorSpace = THREE.SRGBColorSpace;
  const seal = place(new THREE.Mesh(quad, keep(new THREE.MeshBasicMaterial({ map: sealTex, transparent: true, depthWrite: false, depthTest: false }))), 10, 14);
  let sealColor = "", verseNight = null;

  const INK_DAY = ["#8e9aa6", "#5d6a76", "#353b42", "#1c1e22"], INK_NIGHT = ["#2b3446", "#1f2738", "#151b28", "#0a0d14"];
  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    skyUni.uSky.value.set(d ? "#1c2231" : "#efe7d5"); skyUni.uSkyTop.value.set(d ? "#10141d" : "#e4d9c2");
    mist.value.set(d ? "#2f384b" : "#efe7d5");
    night.value = d ? 1 : 0;
    inkCols.forEach((c, i) => c.value.set((d ? INK_NIGHT : INK_DAY)[i]));
    waterUni.uLine.value.set(d ? "#56627c" : "#6f757b");
    waterUni.uGlow.value.set(d ? "#e9e4d2" : "#d4553a");
    mistMat.color.set(d ? "#2f384b" : "#efe7d5"); mistMat.opacity = d ? 0.7 : 0.82;
    orbMat.map = d ? moonTex : sunTex; orbMat.needsUpdate = true;
    lampMat.opacity = d ? 0.85 : 0;
    cranes.forEach((c) => { c.g.visible = !d; }); // white cranes by day; the night sky belongs to the moon
    if (sealColor !== p.accent) { sealColor = p.accent; inkSealDraw(sealCanvas.getContext("2d"), p.accent); sealTex.needsUpdate = true; }
    if (verseNight !== d) { // 王维《山居秋暝》: its rainy autumn evening by day, its moonlit pines by night
      verseNight = d;
      inkVerseDraw(verseCanvas.getContext("2d"), d ? ["明月松间照", "清泉石上流"] : ["空山新雨后", "天气晚来秋"], d ? "#c9cdd6" : "#2a2a2c");
      verseTex.needsUpdate = true;
    }
  }
  applyPalette(pal);

  function frame(dt, t) {
    const A = camera.aspect, cx = Math.sin(t * 0.017) * 0.9, cy = Math.sin(t * 0.013) * 0.06;
    camera.position.set(cx, cy, 0);
    camera.lookAt(cx, cy, -100); // a slow sideways drift: the layers slide past each other
    const so = 140 * TAN, sunX = SUN.X * so;
    orb.position.set(sunX, SUN.Y * so, -140);
    orb.scale.setScalar((pal.dark ? 0.42 : 0.24) * so);
    waterUni.uGlowX.value = cx / (30 * TAN) + (sunX - cx) / so; // its reflection lies straight below it on screen
    for (const m of mists) {
      m.X += m.speed * dt;
      if (m.X > 3.6) m.X = -3.6; else if (m.X < -3.6) m.X = 3.6;
      m.m.position.set(m.X * m.D * TAN, m.Y * m.D * TAN, -m.D);
    }
    const k = Math.min(1, Math.max(0.55, A / 1.6)), s15 = 15 * TAN; // narrow screens get a narrower cliff
    cliff.position.x = cx + (-A + 0.02) * s15;
    cliff.scale.x = k;
    pine.position.set(cliff.position.x + 0.14 * s15 * k, (cliffTop(0.14) - 0.02) * s15, -15);
    pine.scale.set(0.62 * s15 * k, 0.62 * s15 * k, 1);
    pine.rotation.z = Math.sin(t * 0.4) * 0.008;
    const s30 = 30 * TAN, view30 = cx / s30;
    drift.boat += dt * 0.012;
    if (drift.boat - view30 > A + 0.3) drift.boat = view30 - A - 0.3;
    const bob = Math.sin(t * 0.9) * 0.004;
    boat.position.set(drift.boat * s30, (-0.36 + bob) * s30, -30);
    boat.scale.set(0.2 * s30, 0.1 * s30, 1);
    boat.rotation.z = Math.sin(t * 0.7) * 0.012;
    lamp.position.set((drift.boat + 0.014) * s30, (-0.357 + bob) * s30, -29.9);
    lamp.scale.setScalar(0.07 * s30 * (0.95 + 0.05 * Math.sin(t * 6.3)));
    const s50 = CRANE_D * TAN;
    if (flight.wait > 0) flight.wait -= dt;
    else {
      flight.X -= dt * 0.035;
      if (flight.X < -A - 0.8) { flight.X = A + 0.4; flight.Y = r(0.58, 0.76); flight.wait = r(18, 34); }
    }
    cranes.forEach((c, i) => {
      c.g.position.set(cx + (flight.X + i * 0.1) * s50, (flight.Y - i * 0.035 + Math.sin(t * 0.8 + i) * 0.006) * s50, -CRANE_D);
      c.g.scale.setScalar(0.15 * s50);
      const flap = Math.cos(t * 7.5 + c.phase);
      c.near.scale.y = flap; c.far.scale.y = Math.cos(t * 7.5 + c.phase - 0.35) * 0.9;
    });
    const s10 = 10 * TAN;
    verse.position.set(cx + (A - 0.1 - 0.08) * s10, 0.58 * s10, -10);
    verse.scale.set(0.16 * s10, 0.4 * s10, 1);
    seal.position.set(cx + (A - 0.1 - 0.06) * s10, (0.58 - 0.2 - 0.07) * s10, -10);
    seal.scale.set(0.1 * s10, 0.1 * s10, 1);
  }
  frame(0, 0);

  return {
    update(dt, t) { time.value = t; frame(dt, t); },
    setPalette: applyPalette,
    dispose() { disposables.forEach((d) => d.dispose()); },
  };
}

const BUILDERS = { galaxy, terrain, crystals, earth, neon, island, bloodmoon, ocean, balloons, hearts, jellyfish, ghosts, portal, wisps, saturn, nebula, orbits, meadow, citydrive, neural, frostpeaks, luckycat, campsite, koipond, inkwash };

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
