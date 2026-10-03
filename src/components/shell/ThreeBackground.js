"use client";
import { useEffect, useRef, useState } from "react";
import { usePrefs } from "@/lib/store";

/** Accent + theme as three.js-friendly hex strings, read from the live CSS variables (on the background layer, which may carry the admin's colour). */
function readPalette(el) {
  const cs = getComputedStyle(el ?? document.documentElement);
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
/**
 * A scene's update in pieces of at most `max` seconds (0.05 s, the step the scenes are tuned for). The host passes the
 * frame time × the admin's speed (up to 2×), so on a slow device one frame can be 0.1 s: clamping that to 0.05 s ran
 * boats, gondolas and flocks slower than the set speed; this keeps the full time and the safe step. At most eight pieces.
 */
function sceneStep(frame, max = 0.05) {
  return (dt, t) => {
    let left = Math.min(Math.max(0, dt), max * 8);
    do { const s = Math.min(left, max); left -= s; frame(s, t - left); } while (left > 1e-6);
  };
}
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
  const chunks = parts.map(([geo, m]) => { const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(m); return g; }); // extruded shapes have no index already
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
/** A red-crowned crane flying to the left, and one wing drawn upwards from the shoulder (bottom edge), swept back. */
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
    // mirrored, so the wing sweeps BACK towards the tail: a wing swept towards the head makes the bird read as flying backwards
    g.translate(270, 0); g.scale(-1, 1);
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

/* ---------- Rainy window: raindrops on the glass, each a tiny sharp upside-down picture of the blurred city behind ---------- */
// the city is drawn twice a frame: out of focus (uBokeh = 1, what the glass shows) and sharp (uBokeh = 0, what each drop shows)
const RAIN_QUAD_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const RAIN_SKY_FS = /* glsl */ `
  uniform vec3 uTop; uniform vec3 uMid; uniform vec3 uLow; uniform vec3 uGlow;
  varying vec2 vUv;
  void main() {
    vec3 col = mix(uLow, uMid, smoothstep(0.0, 0.55, vUv.y));
    col = mix(col, uTop, smoothstep(0.5, 1.0, vUv.y));
    col += uGlow * exp(-pow((vUv.y - 0.56) / 0.2, 2.0)); // the city's own light in the low clouds, just above the roofs
    gl_FragColor = vec4(col, 1.0);
  }
`;
const RAIN_LAYER_FS = /* glsl */ `
  uniform sampler2D uSharp; uniform sampler2D uSoft; uniform float uBokeh; uniform vec3 uHaze; uniform float uHazeAmount;
  varying vec2 vUv;
  void main() {
    vec4 t = mix(texture2D(uSharp, vUv), texture2D(uSoft, vUv), uBokeh); // premultiplied: soft edges without dark fringes
    gl_FragColor = vec4(mix(t.rgb, uHaze * t.a, uHazeAmount), t.a); // rain in the air washes the far blocks out
  }
`;
// city lights: tiny sharp points in one pass, big round bokeh discs with a brighter rim in the other
const RAIN_LIGHT_VS = /* glsl */ `
  uniform float uBokeh;
  attribute vec4 aLight; // x, y, sharp radius, bokeh radius
  attribute vec4 aColor; // rgb, strength
  varying vec2 vP; varying vec4 vColor;
  void main() {
    vP = position.xy * 2.0;
    vColor = aColor;
    float r = mix(aLight.z, aLight.w, uBokeh);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(aLight.xy + position.xy * 2.0 * r, 0.0, 1.0);
  }
`;
const RAIN_LIGHT_FS = /* glsl */ `
  uniform float uBokeh;
  varying vec2 vP; varying vec4 vColor;
  void main() {
    float r = length(vP);
    if (r > 1.0) discard;
    float sharp = exp(-r * r * 5.0) + 0.6 * exp(-r * r * 40.0);
    float disc = smoothstep(1.0, 0.9, r) * (0.42 + 0.3 * smoothstep(0.55, 0.95, r)); // bokeh: an even disc with a bright rim
    float k = mix(sharp, disc, uBokeh) * vColor.a;
    gl_FragColor = vec4(vColor.rgb, k); // added on top: colour × k
  }
`;
const RAIN_STREAK_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uOpacity;
  varying vec2 vUv;
  void main() {
    float a = (1.0 - abs(vUv.x - 0.5) * 2.0) * smoothstep(0.0, 0.3, vUv.y) * smoothstep(1.0, 0.6, vUv.y);
    gl_FragColor = vec4(uColor, a * uOpacity);
  }
`;
// the drop map: every drop a little hemisphere; rgb = its surface normal and height, a = coverage (normal blending premultiplies)
const RAIN_DROP_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }
`;
const RAIN_DROP_FS = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(p * 0.5 + 0.5, sqrt(1.0 - r2), smoothstep(1.0, 0.8, sqrt(r2)));
  }
`;
// the condensation: sliding drops wipe it away (white), and it slowly mists over again (a faint black veil every frame)
const RAIN_STAMP_FS = /* glsl */ `
  uniform float uAlpha;
  varying vec2 vUv;
  void main() {
    float r = length(vUv * 2.0 - 1.0);
    gl_FragColor = vec4(1.0, 1.0, 1.0, smoothstep(1.0, 0.35, r) * uAlpha);
  }
`;
const RAIN_VEIL_FS = /* glsl */ `
  uniform float uAlpha;
  void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, uAlpha); }
`;
const RAIN_GLASS_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy * 2.0, 0.0, 1.0); } // always the whole screen
`;
const RAIN_GLASS_FS = /* glsl */ `
  uniform sampler2D tSoft; uniform sampler2D tSharp; uniform sampler2D tDrops; uniform sampler2D tWipe;
  uniform float uAspect; uniform float uFog; uniform vec3 uFogColor; uniform float uRefract;
  uniform vec3 uSpec; uniform vec3 uLamp; uniform vec2 uLampPos; uniform float uGather; uniform float uSoftMix;
  varying vec2 vUv;
  void main() {
    vec2 uv = vUv;
    vec4 d = texture2D(tDrops, uv);
    float cov = d.a;
    vec3 enc = d.rgb / max(cov, 0.004);
    vec2 n = enc.xy * 2.0 - 1.0;
    float wipe = texture2D(tWipe, uv).r;
    float fog = uFog * (1.0 - 0.7 * wipe) * (0.8 + 0.35 * smoothstep(0.7, 0.0, uv.y)); // more mist low on the pane
    vec3 view = texture2D(tSoft, uv, fog * 2.2).rgb; // misted glass blurs the view further
    view = mix(view, uFogColor, fog * 0.45);
    // inside a drop: the city behind, sharp, small and upside down, darker towards the drop's edge
    vec2 ruv = uv - n * vec2(1.0 / uAspect, 1.0) * uRefract * (0.4 + 0.6 * enc.z);
    vec2 cuv = clamp(ruv, 0.002, 0.998);
    vec3 drop = mix(texture2D(tSharp, cuv).rgb, texture2D(tSoft, cuv).rgb, uSoftMix); // the glow of the lights comes along
    float edge = smoothstep(0.55, 1.0, length(n));
    drop *= uGather * (1.0 - 0.38 * edge); // water gathers light in the middle, bends in the dark at the edge
    drop += uSpec * 0.4 * edge * smoothstep(0.2, 0.9, dot(n, vec2(0.45, -0.9))); // light focused into a crescent at the lower edge
    vec3 N = normalize(vec3(n * 1.3, 0.35 + enc.z));
    drop += uSpec * 1.1 * pow(max(dot(N, normalize(vec3(-0.5, 0.6, 0.62))), 0.0), 20.0); // a glint of the room's lamp
    vec3 col = mix(view, drop, cov);
    vec2 q = (uv - uLampPos) * vec2(uAspect, 1.0);
    col += uLamp * exp(-dot(q, q) * 5.0); // the lamp behind you, reflected in the glass
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** A soft blur that works in every browser: halve the picture a few times, then scale it back up smoothly. */
function rainBlur(src, w, h, steps) {
  let cur = src, cw = src.width, ch = src.height;
  for (let i = 0; i < steps; i++) {
    const c = document.createElement("canvas");
    c.width = Math.max(2, cw >> 1); c.height = Math.max(2, ch >> 1);
    const g = c.getContext("2d");
    g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
    g.drawImage(cur, 0, 0, c.width, c.height);
    cur = c; cw = c.width; ch = c.height;
  }
  const out = document.createElement("canvas");
  out.width = w; out.height = h;
  const g = out.getContext("2d");
  g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(cur, 0, 0, w, h);
  return out;
}
const RAIN_LAYERS = [ // far to near: building tops (y, screen half-heights), widths and window cells in canvas px
  { seed: 11, top: [-0.12, 0.42], w: [34, 96], cell: [7, 9], haze: 0.55 },
  { seed: 23, top: [-0.36, 0.14], w: [54, 140], cell: [10, 13], haze: 0.28 },
  { seed: 37, top: [-0.62, -0.12], w: [84, 210], cell: [14, 18], haze: 0.08 },
];
/**
 * One layer of the skyline (8 units wide, from y -1 to 0.5) as a sharp picture and a soft one.
 * The soft one also gets a round glow on every lit window, so out of focus they bloom like real lights.
 */
function rainSkyline(THREE, L, dark, W, H) {
  const r = koiRng(L.seed * 97 + (dark ? 1 : 2));
  const rowOf = (y) => H * (0.5 - y) / 1.5;
  const sharp = document.createElement("canvas");
  sharp.width = W; sharp.height = H;
  const g = sharp.getContext("2d");
  const k = W / 1536; // sizes were chosen for the full-size canvas
  const facade = dark ? ["#10131f", "#141827", "#0d1019", "#171a24"] : ["#6c7782", "#5f6a75", "#77828c", "#66717c"];
  const unlit = dark ? "rgba(70,80,110,0.35)" : "rgba(40,48,58,0.4)";
  const litCols = dark ? ["#ffcf8a", "#ffd9a0", "#ffe7c2", "#bcd4ff", "#ffb870"] : ["#f4e2b8", "#f0dcae", "#dfe7f2"];
  const litP = dark ? 0.34 : 0.16; // a dark rainy afternoon: plenty of lights on
  const glows = [];
  let x = 0;
  while (x < W) {
    const bw = r(L.w[0], L.w[1]) * k, top = rowOf(r(L.top[0], L.top[1])), cw = r(L.cell[0], L.cell[1]) * k, ch = cw * 1.25;
    g.fillStyle = facade[(r() * facade.length) | 0];
    g.fillRect(x, top, bw - 2 * k, H - top);
    if (r() < 0.35) { g.fillRect(x + bw * r(0.2, 0.6), top - 10 * k, 3 * k, 10 * k); } // an antenna
    if (r() < 0.25) { g.fillRect(x + bw * 0.15, top - 7 * k, bw * 0.25, 7 * k); } // a water tank or roof room
    for (let wy = top + cw * 0.8; wy < H - ch; wy += ch) {
      for (let wx = x + cw * 0.6; wx < x + bw - cw; wx += cw) {
        const lit = r() < litP;
        g.fillStyle = lit ? litCols[(r() * litCols.length) | 0] : unlit;
        g.fillRect(wx, wy, cw * 0.55, ch * 0.55);
        if (lit) glows.push([wx + cw * 0.27, wy + ch * 0.27, g.fillStyle]);
      }
    }
    x += bw;
  }
  const softW = Math.max(64, W >> 1), softH = Math.max(16, H >> 1);
  const soft = rainBlur(sharp, softW, softH, 3);
  const sg = soft.getContext("2d");
  sg.globalCompositeOperation = "lighter";
  const s = softW / W, rad = L.cell[1] * k * s * 2.2;
  for (const [gx, gy, col] of glows) {
    const grad = sg.createRadialGradient(gx * s, gy * s, 0, gx * s, gy * s, rad);
    grad.addColorStop(0, col); grad.addColorStop(1, "rgba(0,0,0,0)");
    sg.globalAlpha = dark ? 0.35 : 0.2;
    sg.fillStyle = grad; sg.fillRect(gx * s - rad, gy * s - rad, rad * 2, rad * 2);
  }
  sg.globalAlpha = 1; sg.globalCompositeOperation = "source-over";
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; return t; };
  return { sharp: tex(sharp), soft: tex(soft) };
}
/** A neon sign (sharp and soft), redrawn when the accent or the theme changes. */
function rainSign(THREE, w, h) {
  const sharp = document.createElement("canvas");
  sharp.width = w; sharp.height = h;
  const soft = document.createElement("canvas");
  soft.width = w >> 1; soft.height = h >> 1;
  const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.premultiplyAlpha = true; return t; };
  const out = { sharp: tex(sharp), soft: tex(soft) };
  out.draw = (color, dark, text, vertical, font) => {
    const g = sharp.getContext("2d");
    g.clearRect(0, 0, w, h);
    const pad = Math.min(w, h) * 0.08, rad = Math.min(w, h) * 0.1;
    g.fillStyle = dark ? "rgba(14,14,20,0.92)" : "rgba(60,64,72,0.92)";
    g.beginPath(); g.roundRect(pad, pad, w - pad * 2, h - pad * 2, rad); g.fill();
    const tube = (fn, wide) => { // a glass tube: coloured glow, then a paler core
      g.lineCap = "round"; g.lineJoin = "round";
      g.shadowColor = color; g.shadowBlur = dark ? 14 : 0;
      g.strokeStyle = color; g.lineWidth = wide; g.globalAlpha = dark ? 1 : 0.75; fn(); g.stroke();
      g.shadowBlur = 0; g.strokeStyle = dark ? "rgba(255,255,255,0.85)" : "rgba(255,255,255,0.35)"; g.lineWidth = wide * 0.3; g.globalAlpha = 1; fn(); g.stroke();
    };
    tube(() => { g.beginPath(); g.roundRect(pad * 1.7, pad * 1.7, w - pad * 3.4, h - pad * 3.4, rad * 0.7); }, Math.max(2, w * 0.025));
    g.font = font; g.textAlign = "center"; g.textBaseline = "middle";
    const chars = vertical ? [...text] : [text];
    chars.forEach((c, i) => {
      const cx = w / 2, cy = vertical ? h * (0.5 + (i - (chars.length - 1) / 2) * (0.7 / chars.length)) : h / 2;
      g.shadowColor = color; g.shadowBlur = dark ? 18 : 0; g.lineWidth = Math.max(2, w * 0.035); g.strokeStyle = color; g.strokeText(c, cx, cy);
      g.shadowBlur = 0; g.lineWidth = Math.max(1, w * 0.011); g.strokeStyle = dark ? "rgba(255,255,255,0.9)" : "rgba(255,255,255,0.4)"; g.strokeText(c, cx, cy);
    });
    const blurred = rainBlur(sharp, soft.width, soft.height, 4);
    const sg = soft.getContext("2d");
    sg.clearRect(0, 0, soft.width, soft.height);
    sg.drawImage(blurred, 0, 0);
    if (dark) { sg.globalCompositeOperation = "lighter"; sg.globalAlpha = 0.9; sg.drawImage(blurred, 0, 0); sg.globalAlpha = 1; sg.globalCompositeOperation = "source-over"; } // neon blooms
    out.sharp.needsUpdate = out.soft.needsUpdate = true;
  };
  return out;
}

function rainwindow(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(4711);
  let A = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // corrected by resize() right after the build
  const AMAX = 4; // the skyline and the street are 8 units wide: enough for screens up to 4 : 1
  const quad = keep(new THREE.PlaneGeometry(1, 1));

  /* --- the city behind the glass, in its own scene; everything is flat and laid out in screen half-heights --- */
  const city = new THREE.Scene();
  const cityCam = new THREE.OrthographicCamera(-A, A, 1, -1, -10, 10);
  cityCam.position.z = 5;
  const bokeh = { value: 1 };
  const flat = (fs, uniforms, extra = {}) => keep(new THREE.ShaderMaterial({ uniforms, vertexShader: RAIN_QUAD_VS, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false, ...extra }));
  const put = (mesh, x, y, w, h, order) => { mesh.position.set(x, y, 0); mesh.scale.set(w, h, 1); mesh.renderOrder = order; mesh.frustumCulled = false; city.add(mesh); return mesh; };

  const skyUni = { uTop: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uLow: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() } };
  put(new THREE.Mesh(quad, flat(RAIN_SKY_FS, skyUni, { transparent: false })), 0, 0, 2 * AMAX, 2, 0);

  const LW = preview ? 768 : 1536, LH = preview ? 144 : 288;
  const layerUnis = RAIN_LAYERS.map((L) => ({ uSharp: { value: null }, uSoft: { value: null }, uBokeh: bokeh, uHaze: { value: new THREE.Color() }, uHazeAmount: { value: L.haze } }));
  RAIN_LAYERS.forEach((L, i) => put(new THREE.Mesh(quad, flat(RAIN_LAYER_FS, layerUnis[i], { premultipliedAlpha: true })), 0, -0.25, 2 * AMAX, 1.5, 1 + i));
  let layerTex = [];
  function buildLayers(dark) { // redrawn only when the theme flips
    layerTex.forEach((t) => { t.sharp.dispose(); t.soft.dispose(); });
    layerTex = RAIN_LAYERS.map((L) => rainSkyline(THREE, L, dark, LW, LH));
    layerTex.forEach((t, i) => { layerUnis[i].uSharp.value = t.sharp; layerUnis[i].uSoft.value = t.soft; });
  }

  // lights: street lamps, two lanes of traffic, signals, lit windows and shop fronts; laid out once over the whole 8 units
  const L = []; // { x, y, sr, br, hex, night, day, speed, kind }
  const add = (o) => { L.push({ speed: 0, kind: "fixed", accent: false, phase: r(0, 6.28), ...o }); return L[L.length - 1]; };
  for (let x = -AMAX + 0.2; x < AMAX; x += r(0.42, 0.6)) add({ x, y: -0.655 + r(-0.01, 0.01), sr: 0.009, br: 0.085, hex: "#ffae55", night: 1, day: 0.06 });
  const cars = [];
  for (const lane of [{ y: -0.845, hex: "#fff0d2", dir: 1, night: 0.95, day: 0.6 }, { y: -0.765, hex: "#ff2a2a", dir: -1, night: 0.9, day: 0.65 }]) {
    for (let x = -AMAX; x < AMAX; x += r(0.35, 0.9)) {
      const car = { x, dir: lane.dir, speed: r(0.13, 0.22), a: null, b: null };
      car.a = add({ x, y: lane.y, sr: 0.0055, br: 0.055, hex: lane.hex, night: lane.night, day: lane.day, kind: "car" });
      car.b = add({ x: x + 0.026, y: lane.y, sr: 0.0055, br: 0.055, hex: lane.hex, night: lane.night, day: lane.day, kind: "car" });
      cars.push(car);
    }
  }
  const SIGNAL = ["#3dff8a", "#ffc233", "#ff3b3b"];
  const signals = [];
  for (let x = -AMAX + 0.9; x < AMAX; x += r(1.6, 2.4)) signals.push(add({ x, y: -0.585, sr: 0.006, br: 0.042, hex: SIGNAL[0], night: 0.85, day: 0.55, kind: "signal", t0: r(0, 12) }));
  const HERO = ["#ffd08a", "#ffe2b0", "#ffffff", "#9cc8ff", "#ff7eb3", "#66e6ff", "#ffb870"];
  const heroes = [];
  for (let i = 0; i < (preview ? 34 : 64); i++) heroes.push(add({ x: r(-AMAX, AMAX), y: r(-0.56, 0.2), sr: r(0.004, 0.0075), br: r(0.028, 0.072), hex: HERO[(r() * HERO.length) | 0], night: r(0.45, 0.9), day: r(0.06, 0.16), kind: "hero", accent: i % 11 === 3, blink: r() < 0.25 }));
  const N = L.length;
  const lightGeo = keep(new THREE.PlaneGeometry(1, 1));
  const aLight = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  const aColor = new THREE.InstancedBufferAttribute(new Float32Array(N * 4), 4);
  aLight.setUsage(THREE.DynamicDrawUsage); aColor.setUsage(THREE.DynamicDrawUsage);
  lightGeo.setAttribute("aLight", aLight); lightGeo.setAttribute("aColor", aColor);
  const lightMesh = new THREE.InstancedMesh(lightGeo, keep(new THREE.ShaderMaterial({ uniforms: { uBokeh: bokeh }, vertexShader: RAIN_LIGHT_VS, fragmentShader: RAIN_LIGHT_FS, transparent: true, depthTest: false, depthWrite: false, blending: THREE.AdditiveBlending })), N);
  lightMesh.frustumCulled = false; lightMesh.renderOrder = 6;
  city.add(lightMesh);

  // neon signs: 咖啡 in the accent colour on the right, a small OPEN on the left
  const cafe = rainSign(THREE, preview ? 64 : 128, preview ? 160 : 320), open = rainSign(THREE, preview ? 96 : 192, preview ? 40 : 80);
  [cafe.sharp, cafe.soft, open.sharp, open.soft].forEach(keep);
  const signMat = (s) => flat(RAIN_LAYER_FS, { uSharp: { value: s.sharp }, uSoft: { value: s.soft }, uBokeh: bokeh, uHaze: { value: new THREE.Color() }, uHazeAmount: { value: 0 } }, { premultipliedAlpha: true });
  const cafeSign = put(new THREE.Mesh(quad, signMat(cafe)), 0, -0.18, 0.13, 0.33, 7);
  const openSign = put(new THREE.Mesh(quad, signMat(open)), 0, -0.47, 0.17, 0.07, 7);
  const CJK = '"PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif';

  // rain falling between the window and the city: only in the out-of-focus picture
  const STREAKS = preview ? 24 : 70;
  const streakUni = { uColor: { value: new THREE.Color() }, uOpacity: { value: 0.1 } };
  const streaks = new THREE.InstancedMesh(quad, keep(new THREE.ShaderMaterial({ uniforms: streakUni, vertexShader: RAIN_DROP_VS, fragmentShader: RAIN_STREAK_FS, transparent: true, depthTest: false, depthWrite: false })), STREAKS);
  streaks.frustumCulled = false; streaks.renderOrder = 8;
  city.add(streaks);
  const drips = [];
  for (let i = 0; i < STREAKS; i++) drips.push({ x: r(-AMAX, AMAX), y: r(-1.2, 1.2), speed: r(2.2, 3.4), len: r(0.08, 0.16) });
  const M4 = new THREE.Matrix4(), Q = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.12), V = new THREE.Vector3(), S = new THREE.Vector3(), Q0 = new THREE.Quaternion();

  // what the passes render into: the city out of focus and sharp (with mipmaps, so mist can blur it further), the drops, the wiped mist
  const rtOpts = { minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, generateMipmaps: true };
  const softRT = keep(new THREE.WebGLRenderTarget(4, 4, rtOpts)), sharpRT = keep(new THREE.WebGLRenderTarget(4, 4, rtOpts));
  softRT.texture.colorSpace = sharpRT.texture.colorSpace = THREE.SRGBColorSpace; // stored as sRGB: no banding in the dark sky
  const dropRT = keep(new THREE.WebGLRenderTarget(4, 4)), wipeRT = keep(new THREE.WebGLRenderTarget(4, 4));

  /* --- the drops on the glass: rain beads up, drops merge, the heavy ones slide down in fits and starts --- */
  const DS = preview ? 1.8 : 1; // a preview tile is small: bigger drops
  const MAXD = preview ? 420 : 1600, R_SLIDE = 0.021 * DS;
  const px = new Float32Array(MAXD), py = new Float32Array(MAXD), pr = new Float32Array(MAXD), pv = new Float32Array(MAXD);
  const stall = new Float32Array(MAXD), trailY = new Float32Array(MAXD), seed = new Float32Array(MAXD);
  const alive = new Uint8Array(MAXD), sliding = new Uint8Array(MAXD);
  const free = [], dying = []; // an index freed this frame is reused only after the grid is rebuilt
  for (let i = MAXD - 1; i >= 0; i--) free.push(i);
  let hi = 0;
  const G = 0.07, GC = Math.ceil((2 * AMAX) / G) + 3, GR = Math.ceil(2.6 / G) + 3;
  const head = new Int32Array(GC * GR), next = new Int32Array(MAXD);
  const cellX = (x) => Math.min(GC - 2, Math.max(1, Math.floor((x + AMAX) / G) + 1)), cellY = (y) => Math.min(GR - 2, Math.max(1, Math.floor((y + 1.3) / G) + 1));
  const gridAdd = (i) => { const c = cellX(px[i]) + cellY(py[i]) * GC; next[i] = head[c]; head[c] = i; };
  function gridBuild() {
    head.fill(-1);
    while (dying.length) free.push(dying.pop());
    for (let i = 0; i < hi; i++) if (alive[i]) gridAdd(i);
  }
  /** Another live drop that i overlaps, or -1. */
  function hit(i) {
    const cx = cellX(px[i]), cy = cellY(py[i]);
    for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
      for (let j = head[cx + ox + (cy + oy) * GC]; j !== -1; j = next[j]) {
        if (j === i || !alive[j]) continue;
        const dx = px[j] - px[i], dy = py[j] - py[i], rr = (pr[i] + pr[j]) * 0.82;
        if (dx * dx + dy * dy < rr * rr) return j;
      }
    }
    return -1;
  }
  const kill = (i) => { alive[i] = 0; dying.push(i); };
  /** i swallows j: the areas add up, the merged drop sits between them, weighted by size. */
  function absorb(i, j) {
    const a = pr[i] * pr[i], b = pr[j] * pr[j];
    if (!sliding[i]) { px[i] = (px[i] * a + px[j] * b) / (a + b); py[i] = (py[i] * a + py[j] * b) / (a + b); }
    pr[i] = Math.sqrt(a + b);
    kill(j);
  }
  function spawn(x, y, rad) {
    if (!free.length) return -1;
    const i = free.pop();
    px[i] = x; py[i] = y; pr[i] = rad; pv[i] = 0; stall[i] = 0; trailY[i] = y; seed[i] = r(0, 100); alive[i] = 1; sliding[i] = 0;
    if (i >= hi) hi = i + 1;
    let j = hit(i), survivor = i;
    for (let guard = 0; j !== -1 && guard < 4; guard++) { // landing on drops merges into them
      if (pr[j] >= pr[survivor]) { absorb(j, survivor); survivor = j; } else absorb(survivor, j);
      j = hit(survivor);
    }
    if (survivor === i) gridAdd(i);
    return survivor;
  }
  const wipes = []; // the drops sliding this frame: they clear a track through the mist
  let rainAcc = 0;
  function stepDrops(dt, t) {
    gridBuild();
    const width = Math.min(A, AMAX);
    rainAcc += dt * (preview ? 40 : 95) * (width / 1.6);
    while (rainAcc >= 1) { // rain hitting the glass
      rainAcc -= 1;
      const big = r() < 0.08, mid = r() < 0.3;
      spawn(r(-width, width), r(-1, 1.08), (big ? r(0.017, 0.024) : mid ? r(0.008, 0.015) : r(0.0032, 0.0072)) * DS);
    }
    if (free.length < MAXD * 0.12) for (let k = 0; k < 6; k++) { const i = (r() * hi) | 0; if (alive[i] && !sliding[i] && pr[i] < 0.008 * DS) kill(i); } // the smallest beads dry up
    wipes.length = 0;
    for (let i = 0; i < hi; i++) {
      if (!alive[i]) continue;
      if (pr[i] < (sliding[i] ? R_SLIDE * 0.72 : R_SLIDE)) { sliding[i] = 0; continue; } // once running, a drop keeps going until it is much smaller
      sliding[i] = 1;
      if (stall[i] > 0) { stall[i] -= dt; pv[i] *= Math.exp(-dt * 10); } // held back by the glass for a moment
      else {
        pv[i] += (0.11 + (pr[i] - R_SLIDE) * 10 / DS - pv[i]) * Math.min(1, dt * 5);
        if (r() < dt * 0.3) stall[i] = r(0.12, 0.7);
      }
      const step = pv[i] * dt;
      py[i] -= step;
      px[i] += (Math.sin(t * 1.9 + seed[i]) + 0.6 * Math.sin(t * 4.3 + seed[i] * 1.7)) * step * 0.14; // small jogs sideways
      if (trailY[i] - py[i] > pr[i] * 1.5) { // a bead left behind
        trailY[i] = py[i];
        const tr = pr[i] * r(0.12, 0.22), rest = pr[i] * pr[i] - tr * tr;
        if (rest > 0) { pr[i] = Math.sqrt(rest); spawn(px[i] + r(-0.25, 0.25) * pr[i], py[i] + (pr[i] + tr) * 0.95, tr); }
      }
      let j = hit(i);
      for (let guard = 0; j !== -1 && guard < 4; guard++) { absorb(i, j); j = hit(i); } // it swallows what it runs into
      if (py[i] < -1.15) kill(i);
      else wipes.push(i);
    }
    while (hi > 0 && !alive[hi - 1]) hi--;
  }

  const dropScene = new THREE.Scene(), wipeScene = new THREE.Scene();
  const dropMesh = new THREE.InstancedMesh(quad, keep(new THREE.ShaderMaterial({ vertexShader: RAIN_DROP_VS, fragmentShader: RAIN_DROP_FS, transparent: true, depthTest: false, depthWrite: false })), MAXD);
  dropMesh.frustumCulled = false;
  dropScene.add(dropMesh);
  const veilUni = { uAlpha: { value: 0.01 } }, stampUni = { uAlpha: { value: 0.6 } };
  const veil = new THREE.Mesh(quad, keep(new THREE.ShaderMaterial({ uniforms: veilUni, vertexShader: RAIN_GLASS_VS, fragmentShader: RAIN_VEIL_FS, transparent: true, depthTest: false, depthWrite: false })));
  const stampMesh = new THREE.InstancedMesh(quad, keep(new THREE.ShaderMaterial({ uniforms: stampUni, vertexShader: RAIN_DROP_VS, fragmentShader: RAIN_STAMP_FS, transparent: true, depthTest: false, depthWrite: false })), MAXD);
  veil.frustumCulled = stampMesh.frustumCulled = false;
  veil.renderOrder = 0; stampMesh.renderOrder = 1;
  wipeScene.add(veil, stampMesh);
  function writeDrops() {
    for (let i = 0; i < hi; i++) {
      if (!alive[i]) { M4.makeScale(0, 0, 0); dropMesh.setMatrixAt(i, M4); continue; }
      const d = pr[i] * 2, s = sliding[i];
      M4.compose(V.set(px[i], py[i] + (s ? pr[i] * 0.08 : 0), 0), Q0, S.set(d * (s ? 0.9 : 1), d * (s ? 1.18 : 1), 1));
      dropMesh.setMatrixAt(i, M4);
    }
    dropMesh.count = hi;
    dropMesh.instanceMatrix.needsUpdate = true;
  }
  function writeStamps(list) {
    const n = Math.min(list.length, MAXD);
    for (let k = 0; k < n; k++) { const [x, y, rad] = list[k]; M4.compose(V.set(x, y, 0), Q0, S.set(rad * 3, rad * 3.4, 1)); stampMesh.setMatrixAt(k, M4); }
    stampMesh.count = n;
    stampMesh.instanceMatrix.needsUpdate = true;
  }
  const liveStamps = () => wipes.map((i) => [px[i], py[i], pr[i]]);

  // warm up: twenty seconds of rain, so the first frame (and the still one) already has drops, trails and cleared tracks
  const warm = [];
  for (let k = 0; k < 300; k++) {
    stepDrops(1 / 15, k / 15);
    if (k > 225 && k % 2 === 0) for (const i of wipes) if (warm.length < 6000) warm.push([px[i], py[i], pr[i]]); // the last five seconds of tracks
  }

  /* --- the glass: the whole screen --- */
  const glassUni = {
    tSoft: { value: softRT.texture }, tSharp: { value: sharpRT.texture }, tDrops: { value: dropRT.texture }, tWipe: { value: wipeRT.texture },
    uAspect: { value: A }, uFog: { value: 0.5 }, uFogColor: { value: new THREE.Color() }, uRefract: { value: 0.38 },
    uSpec: { value: new THREE.Color() }, uLamp: { value: new THREE.Color() }, uLampPos: { value: new THREE.Vector2(0.84, 0.16) },
    uGather: { value: 1.2 }, uSoftMix: { value: 0.3 },
  };
  const glass = new THREE.Mesh(quad, keep(new THREE.ShaderMaterial({ uniforms: glassUni, vertexShader: RAIN_GLASS_VS, fragmentShader: RAIN_GLASS_FS, depthTest: false, depthWrite: false })));
  glass.frustumCulled = false;
  scene.add(glass);
  const buf = new THREE.Vector2(), prevClear = new THREE.Color();
  const fit = (rt, w, h) => { w = Math.max(2, Math.round(w)); h = Math.max(2, Math.round(h)); if (rt.width !== w || rt.height !== h) rt.setSize(w, h); };
  glass.onBeforeRender = (renderer) => { // like three's Reflector: draw the city and the drops first, then the glass samples them
    renderer.getDrawingBufferSize(buf);
    const cs = preview ? 0.6 : 0.5;
    fit(softRT, buf.x * cs, buf.y * cs); fit(sharpRT, buf.x * cs, buf.y * cs); fit(dropRT, buf.x * 0.75, buf.y * 0.75); fit(wipeRT, buf.x * 0.25, buf.y * 0.25);
    const before = renderer.getRenderTarget(), auto = renderer.autoClear, alpha = renderer.getClearAlpha();
    renderer.getClearColor(prevClear);
    renderer.setClearColor(0x000000, 1);
    bokeh.value = 1; streaks.visible = true;
    renderer.setRenderTarget(softRT); renderer.render(city, cityCam);
    bokeh.value = 0; streaks.visible = false;
    renderer.setRenderTarget(sharpRT); renderer.render(city, cityCam);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(dropRT); renderer.render(dropScene, cityCam);
    renderer.setRenderTarget(wipeRT);
    renderer.autoClear = false;
    if (warm.length) { // the first frame: the tracks the warm-up rain left
      renderer.setClearColor(0x000000, 1); renderer.clear();
      veil.visible = false;
      for (let k = 0; k < warm.length; k += MAXD) { writeStamps(warm.slice(k, k + MAXD)); renderer.render(wipeScene, cityCam); }
      veil.visible = true; warm.length = 0;
      writeStamps(liveStamps());
    }
    renderer.render(wipeScene, cityCam);
    renderer.autoClear = auto;
    renderer.setClearColor(prevClear, alpha);
    renderer.setRenderTarget(before);
  };

  /* --- colours: day or night, and the accent on the 咖啡 sign and a few shop fronts --- */
  const tmp = new THREE.Color();
  const LS = preview ? 1.35 : 1; // bokeh a little bigger in the small preview
  L.forEach((l, i) => aLight.setXYZW(i, l.x, l.y, l.sr * LS, l.br * LS));
  aLight.needsUpdate = true;
  let themeDark = null, signKey = "";
  const CAFE_FONT = preview ? 40 : 80, OPEN_FONT = preview ? 22 : 44;
  const colourOf = (l, i, dark, on = 1) => { tmp.set(l.accent ? pal.accent : l.hex); aColor.setXYZW(i, tmp.r, tmp.g, tmp.b, (dark ? l.night : l.day) * on); };
  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    if (themeDark !== d) { themeDark = d; buildLayers(d); }
    skyUni.uTop.value.set(d ? "#060914" : "#6f7b88"); skyUni.uMid.value.set(d ? "#121832" : "#9aa4ae");
    skyUni.uLow.value.set(d ? "#2b2340" : "#bcc3ca"); skyUni.uGlow.value.set(d ? "#46304a" : "#000000");
    layerUnis.forEach((u) => u.uHaze.value.set(d ? "#262c48" : "#b3bbc3"));
    L.forEach((l, i) => colourOf(l, i, d));
    aColor.needsUpdate = true;
    streakUni.uColor.value.set(d ? "#a9b8e0" : "#f4f6f8"); streakUni.uOpacity.value = d ? 0.1 : 0.16;
    glassUni.uFog.value = d ? 0.5 : 0.46;
    glassUni.uFogColor.value.set(d ? "#1b2238" : "#d3d9df");
    glassUni.uSpec.value.set(d ? "#ffd8a6" : "#ffffff").multiplyScalar(d ? 0.9 : 0.75);
    glassUni.uLamp.value.set("#ff9a45").multiplyScalar(d ? 0.2 : 0.03);
    glassUni.uGather.value = d ? 1.55 : 1.1; glassUni.uSoftMix.value = d ? 0.45 : 0.2;
    const key = p.accent + (d ? "d" : "l");
    if (signKey !== key) {
      signKey = key;
      cafe.draw(p.accent, d, "咖啡", true, `bold ${CAFE_FONT}px ${CJK}`);
      open.draw(d ? "#ff5a7a" : "#d6485f", d, "OPEN", false, `bold ${OPEN_FONT}px "Helvetica Neue", Arial, sans-serif`);
    }
  }
  applyPalette(pal);

  function frame(dt, t) {
    const a = camera.aspect || A;
    if (Math.abs(a - A) > 1e-3) { A = a; cityCam.left = -A; cityCam.right = A; cityCam.updateProjectionMatrix(); }
    glassUni.uAspect.value = A;
    cafeSign.position.x = A * 0.52; openSign.position.x = -A * 0.56;
    for (const c of cars) { // traffic along the street, both ways
      c.x += c.dir * c.speed * dt;
      if (c.dir > 0 && c.x > AMAX + 0.1) c.x -= 2 * AMAX + 0.2;
      if (c.dir < 0 && c.x < -AMAX - 0.1) c.x += 2 * AMAX + 0.2;
      c.a.x = c.x; c.b.x = c.x + 0.026;
    }
    for (const s of signals) { const ph = (t + s.t0) % 13; s.hex = SIGNAL[ph < 6 ? 0 : ph < 8 ? 1 : 2]; } // green, amber, red
    const d = pal.dark;
    L.forEach((l, i) => {
      aLight.setX(i, l.x);
      if (l.kind === "signal") colourOf(l, i, d);
      else if (l.blink) colourOf(l, i, d, Math.sin(t * 0.11 + l.phase * 7) > 0.82 ? 0 : 1); // someone switches a light off for a while
    });
    aLight.needsUpdate = aColor.needsUpdate = true;
    drips.forEach((p, i) => { // rain falling in the street
      p.y -= p.speed * dt;
      if (p.y < -1.3) { p.y = 1.3; p.x = r(-AMAX, AMAX); }
      M4.compose(V.set(p.x, p.y, 0), Q, S.set(0.0035, p.len, 1));
      streaks.setMatrixAt(i, M4);
    });
    streaks.instanceMatrix.needsUpdate = true;
    stepDrops(dt, t);
    writeDrops();
    writeStamps(liveStamps());
    veilUni.uAlpha.value = 1 - Math.exp(-dt / 14); // the mist creeps back over the tracks in about a quarter of a minute
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { let n = 0; for (let i = 0; i < hi; i++) n += alive[i]; return { drops: n, sliding: wipes.length }; }, // for checking by hand
    dispose() { layerTex.forEach((x) => { x.sharp.dispose(); x.soft.dispose(); }); disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Sky lanterns: 天灯 rising over a lake town, the whole scene mirrored in the rippling water ---------- */
// the sky is a sphere around the viewer; the direction is taken in world space, so the mirrored pass mirrors the gradient too
const LANTERN_SKY_VS = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vDir = normalize(w.xyz - cameraPosition);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const LANTERN_SKY_FS = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow; uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSun;
  varying vec3 vDir;
  void main() {
    vec3 dir = vec3(vDir.x, abs(vDir.y), vDir.z); // below the horizon only the mirrored pass looks: it sees the sky upside down
    float h = dir.y;
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, h));
    col = mix(col, uZenith, smoothstep(0.16, 0.75, h));
    col += uGlow * exp(-abs(h) * 16.0); // the warm band low over the town: its lights at night, the sunset at dusk
    float sd = distance(dir, uSunDir);
    col += uSunColor * uSun * (smoothstep(0.034, 0.029, sd) + 0.45 * exp(-sd * 10.0) + 0.2 * exp(-sd * 2.5));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// the town and the hills: an opaque canvas whose channels are masks (R silhouette, G lit windows, B red eave lanterns), coloured here
const LANTERN_LAYER_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const LANTERN_TOWN_FS = /* glsl */ `
  uniform sampler2D uMask; uniform vec3 uWall; uniform vec3 uWindow; uniform vec3 uEave; uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec3 m = texture2D(uMask, vUv).rgb;
    float flick = 0.85 + 0.15 * sin(uTime * 3.0 + vUv.x * 900.0) * sin(uTime * 1.7 + vUv.x * 430.0);
    vec3 col = uWall * m.r + uWindow * m.g * flick + uEave * m.b * (0.8 + 0.2 * flick);
    gl_FragColor = vec4(col, m.r);
    #include <colorspace_fragment>
  }
`;
const LANTERN_HILLS_FS = /* glsl */ `
  uniform sampler2D uMask; uniform vec3 uFar; uniform vec3 uNear;
  varying vec2 vUv;
  void main() {
    vec3 m = texture2D(uMask, vUv).rgb;
    gl_FragColor = vec4(mix(uFar, uNear, m.g), max(m.r, m.g));
    #include <colorspace_fragment>
  }
`;
// lanterns: camera-facing quads; the texture's R is light (lantern and halo), G is the paper body that hides what is behind it.
// Premultiplied output: the halo adds light, the body covers. In the mirrored pass (uFlip = -1) the picture is turned upside down.
const LANTERN_VS = /* glsl */ `
  uniform float uFlip;
  attribute vec4 aLantern; // size, flicker seed, brightness, opacity
  attribute vec3 aTint;
  varying vec2 vUv; varying vec3 vTint; varying float vLight; varying float vAlpha;
  uniform float uTime;
  void main() {
    vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    c.xy += position.xy * aLantern.x * 2.0;
    gl_Position = projectionMatrix * c;
    vUv = vec2(uv.x, uFlip > 0.0 ? uv.y : 1.0 - uv.y);
    vTint = aTint;
    float f = aLantern.y;
    vLight = aLantern.z * (0.86 + 0.09 * sin(uTime * 7.3 + f * 13.0) + 0.05 * sin(uTime * 17.1 + f * 7.0));
    vAlpha = aLantern.w;
  }
`;
const LANTERN_FS = /* glsl */ `
  uniform sampler2D uMap; uniform float uHalo;
  varying vec2 vUv; varying vec3 vTint; varying float vLight; varying float vAlpha;
  void main() {
    vec3 m = texture2D(uMap, vUv).rgb;
    // the sprite was painted as display values: back to linear light, or its faintest 8-bit step
    // (1/255) comes out of the sRGB conversion at 12/255 and draws a visible ring on the night sky
    float light = pow(m.r, 2.2) * mix(uHalo, 1.0, m.g); // the halo is dimmed by day, the paper is not
    gl_FragColor = vec4(vTint * light * vLight * vAlpha, m.g * vAlpha);
    #include <colorspace_fragment>
  }
`;
// the lake: the mirrored scene (rendered into a texture first), broken up by ripples that stretch the lights into streaks
const LANTERN_LAKE_VS = /* glsl */ `
  varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const LANTERN_LAKE_FS = /* glsl */ `
  uniform sampler2D tReflect; uniform vec2 uRes; uniform float uTime; uniform vec3 uDeep; uniform vec3 uSheen;
  varying vec3 vWorld;
  float lh(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  float ln(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f); return mix(mix(lh(i), lh(i + vec2(1, 0)), f.x), mix(lh(i + vec2(0, 1)), lh(i + vec2(1, 1)), f.x), f.y); }
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam.xz);
    float near = clamp(14.0 / (dist + 14.0), 0.04, 1.0); // ripples look smaller and calmer far away
    float r1 = ln(vec2(vWorld.x * 0.22 + uTime * 0.06, vWorld.z * 1.1 + uTime * 0.45));
    float r2 = ln(vec2(vWorld.x * 0.08 - uTime * 0.04, vWorld.z * 0.4 + uTime * 0.25));
    vec2 off = vec2((r2 - 0.5) * 0.006, (r1 - 0.5) * 0.05 + (r2 - 0.5) * 0.03) * near;
    vec3 refl = texture2D(tReflect, clamp(uv + off, 0.001, 0.999)).rgb;
    float grazing = 1.0 - clamp(normalize(toCam).y, 0.0, 1.0);
    vec3 col = mix(uDeep, refl, 0.12 + 0.88 * pow(grazing, 5.0)); // Fresnel: a mirror far away, darker water close by
    col += uSheen * pow(r1, 8.0) * near * 0.5; // glints on the crests close by
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;

/** A sky lantern, computed pixel by pixel: R = light (paper glowing from the flame, the halo around it), G = the paper that hides what is behind. */
function lanternSprite(THREE) {
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d"), img = g.createImageData(S, S), d = img.data;
  const top = 64, bot = 192, cx = 128;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = (y * S + x) * 4, dx = x + 0.5 - cx;
    const hd = Math.hypot(dx, y - 150);
    const rc = Math.hypot(dx, y + 0.5 - 128), ramp = Math.min(1, Math.max(0, (rc - 36) / 88));
    const edge = 1 - ramp * ramp * (3 - 2 * ramp); // round, and zero well before the border: faint light shows a lot on a dark sky
    let light = (0.34 * Math.exp(-((hd / 42) ** 2)) + 0.07 * Math.exp(-((hd / 72) ** 2))) * edge, body = 0;
    if (y >= top && y <= bot) {
      const t = (y - top) / (bot - top), k = Math.max(0, (top + 22 - y) / 22);
      const hw = (46 - 10 * t) * Math.sqrt(Math.max(0, 1 - k * k)); // tapering paper, a rounded crown
      const e = Math.abs(dx) / Math.max(hw, 0.001);
      if (e <= 1) {
        let l = (0.5 + 0.42 * t) * (1 - 0.38 * e * e); // brighter low down, where the flame is; darker at the sides
        for (const rib of [-0.55, 0, 0.55]) if (Math.abs(dx - rib * hw) < 1.2) l *= 0.82; // bamboo ribs
        if (Math.abs(y - (top + 45)) < 1 || Math.abs(y - (top + 88)) < 1) l *= 0.9; // paper seams
        l += 0.55 * Math.exp(-((dx / 20) ** 2) - (((y - 176) / 16) ** 2)); // the flame shining through
        if (y > bot - 4) l *= 0.62; // the wire ring at the mouth
        light = Math.min(1, l);
        body = Math.min(1, (1 - e) * 6); // soft, anti-aliased edge
      }
    }
    if (Math.abs(dx) < 9 && Math.abs(y - (bot + 4)) < 6) light = Math.max(light, 1 - Math.hypot(dx / 9, (y - bot - 4) / 6)); // the flame below the mouth
    d[o] = Math.round(255 * Math.min(1, light)); d[o + 1] = Math.round(255 * body); d[o + 2] = 0; d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; // data, not colour
  return tex;
}
/**
 * The water town on the far shore, 1000 × 60 units, as masks in an opaque canvas (so the channels stay independent):
 * R = silhouette, G = lit windows, B = red lanterns under the eaves. Huizhou houses with stepped gables and curved roofs,
 * a seven-storey pagoda, a stone arch bridge whose opening is really open, a pavilion, trees.
 */
function lanternTown(THREE, W, H) {
  const r = koiRng(1717), c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const X = (u) => (u + 500) * W / 1000, Y = (v) => H - (v * H) / 60, SX = (u) => (u * W) / 1000, SY = (v) => (v * H) / 60;
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  const SIL = "rgb(255,0,0)", WIN = "rgb(0,255,0)", EAVE = "rgb(0,0,255)";
  const rect = (col, x, y, w, h) => { g.fillStyle = col; g.fillRect(X(x), Y(y + h), SX(w), SY(h)); };
  const dot = (col, x, y, rad) => { g.fillStyle = col; g.beginPath(); g.ellipse(X(x), Y(y), SX(rad), SY(rad), 0, 0, 6.29); g.fill(); };
  /** A roof: eaves overhanging `over`, ridge `rh` high, tips turned up. */
  const roof = (x0, x1, y, rh, over) => {
    g.fillStyle = SIL; g.beginPath();
    g.moveTo(X(x0 - over), Y(y + over * 0.45));
    g.quadraticCurveTo(X(x0 - over * 0.2), Y(y - 0.1), X(x0 + (x1 - x0) * 0.18), Y(y + rh * 0.55));
    g.lineTo(X(x0 + (x1 - x0) * 0.3), Y(y + rh)); g.lineTo(X(x1 - (x1 - x0) * 0.3), Y(y + rh));
    g.lineTo(X(x1 - (x1 - x0) * 0.18), Y(y + rh * 0.55));
    g.quadraticCurveTo(X(x1 + over * 0.2), Y(y - 0.1), X(x1 + over), Y(y + over * 0.45));
    g.lineTo(X(x1 + over * 0.6), Y(y)); g.lineTo(X(x0 - over * 0.6), Y(y)); g.closePath(); g.fill();
  };
  const BRIDGE = [4, 34], PAGODA = [-28, -12], PAVILION = [52, 64];
  const free = (x0, x1) => ![BRIDGE, PAGODA, PAVILION].some(([a, b]) => x1 > a - 1 && x0 < b + 1);
  // the embankment along the water, open under the bridge
  rect(SIL, -500, 0, 500 + 8.5, 1.3); rect(SIL, 29.5, 0, 470.5, 1.3);
  for (let x = -500; x < 500;) {
    const w = r(7, 15);
    if (!free(x, x + w)) { x += 2; continue; }
    if (r() < 0.14) { // a tree
      const th = r(6, 10);
      rect(SIL, x + w / 2 - 0.35, 0, 0.7, th * 0.6);
      for (let k = 0; k < 4; k++) dot(SIL, x + w / 2 + r(-2.2, 2.2), th * 0.62 + r(-0.6, 1.8), r(1.8, 3));
    } else {
      const hw = r(4.5, 8.5), rh = r(2, 3.2);
      rect(SIL, x, 0, w, hw);
      if (r() < 0.5) { // Huizhou "horse-head" gable: the wall climbs in steps, each step capped with a line of tiles
        for (const [a0, a1, up] of [[0, 0.2, 0.8], [0.2, 0.4, 1.8], [0.4, 0.6, 2.7], [0.6, 0.8, 1.8], [0.8, 1, 0.8]]) {
          rect(SIL, x + w * a0, hw, w * (a1 - a0), up);
          rect(SIL, x + w * a0 - 0.28, hw + up, w * (a1 - a0) + 0.56, 0.32);
        }
      } else roof(x, x + w, hw, rh, 1.1);
      const nw = Math.max(1, Math.floor(w / 4.5));
      for (let k = 0; k < nw; k++) for (const wy of hw > 6.5 ? [hw * 0.28, hw * 0.62] : [hw * 0.4]) {
        if (r() < 0.62) rect(WIN, x + (w / (nw + 1)) * (k + 1) - 0.45, wy, 0.9, 1.1);
      }
      if (r() < 0.32) for (const lx of [x + 1, x + w - 1]) { rect(SIL, lx - 0.04, hw - 0.9, 0.08, 0.9); dot(EAVE, lx, hw - 1.2, 0.38); }
    }
    x += w + r(0, 1.5);
  }
  // the pagoda: seven storeys, windows lit, lanterns at the corners
  for (let i = 0; i < 7; i++) {
    const bw = 10 - i * 1.05, y = 1.3 + i * 4.6, cx = -20;
    rect(SIL, cx - bw / 2, y, bw, 4.6);
    roof(cx - bw / 2, cx + bw / 2, y + 3.4, 1.4, 1.7);
    rect(WIN, cx - 0.5, y + 1, 1, 1.5);
    if (i > 0) { rect(WIN, cx - bw / 2 + 1, y + 1, 0.7, 1.3); rect(WIN, cx + bw / 2 - 1.7, y + 1, 0.7, 1.3); }
    dot(EAVE, cx - bw / 2 - 1.3, y + 3.2, 0.42); dot(EAVE, cx + bw / 2 + 1.3, y + 3.2, 0.42);
  }
  rect(SIL, -20.3, 1.3 + 7 * 4.6 + 0.5, 0.6, 4.5); dot(SIL, -20, 1.3 + 7 * 4.6 + 2.5, 0.7); // the spire
  // the arch bridge: one path with the opening cut out (even-odd), so the water shows through it
  g.fillStyle = SIL; g.beginPath();
  g.moveTo(X(BRIDGE[0]), Y(0)); g.lineTo(X(BRIDGE[0]), Y(2.2));
  g.quadraticCurveTo(X(19), Y(11.5), X(BRIDGE[1]), Y(2.2)); g.lineTo(X(BRIDGE[1]), Y(0)); g.closePath();
  g.moveTo(X(19 + 7.2), Y(0)); g.ellipse(X(19), Y(0), SX(7.2), SY(7.2), 0, 0, Math.PI, true); g.closePath();
  g.fill("evenodd");
  for (let bx = 7; bx <= 31; bx += 2) { const t = (bx - 19) / 15, by = 7.2 - 5.6 * t * t; rect(SIL, bx - 0.12, by, 0.24, 1.1); } // the balustrade
  // a pavilion on the right: a roof with turned-up corners on four open pillars
  for (const px of [53, 56.7, 60.3, 64]) rect(SIL, px - 0.25, 1.3, 0.5, 4.2);
  roof(52, 65, 5.4, 3.4, 2.4); dot(SIL, 58.5, 9.4, 0.6);
  dot(EAVE, 51.2, 5, 0.45); dot(EAVE, 65.8, 5, 0.45);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 4;
  return tex;
}
/** Two ranges of hills behind the town, 2400 × 160 units: R the far one, G the near one. */
function lanternHills(THREE, W, H) {
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  const h1 = (n) => { const s = Math.sin(n * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
  const n1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h1(i) * (1 - u) + h1(i + 1) * u; };
  const fb = (x) => { let s = 0, a = 0.5; for (let o = 0; o < 4; o++) { s += a * n1(x); x = x * 2.1 + 5.3; a *= 0.5; } return s / 0.9375; };
  for (const [col, base, amp, freq, seed] of [["rgb(255,0,0)", 42, 95, 0.0045, 3], ["rgb(0,255,0)", 14, 42, 0.009, 11]]) {
    g.fillStyle = col; g.beginPath(); g.moveTo(0, H);
    for (let px = 0; px <= W; px += 2) { const u = (px / W) * 2400 - 1200; g.lineTo(px, H - ((base + amp * Math.pow(fb(u * freq + seed), 1.6)) * H) / 160); }
    g.lineTo(W, H); g.closePath(); g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
/** The pier in front, 6 × 3 units, with two people: one holding a lantern up to let it go, a child pointing at the sky. White: tinted by the material. */
function lanternPier(THREE) {
  const W = 512, H = 256, c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const X = (u) => (u * W) / 6, Y = (v) => H - (v * H) / 3;
  g.fillStyle = g.strokeStyle = "#fff"; g.lineCap = "round"; g.lineJoin = "round";
  g.fillRect(X(0), Y(0.62), X(6), Y(0.45) - Y(0.62)); // the deck
  for (const px of [0.4, 1.9, 3.4, 4.9]) g.fillRect(X(px), Y(0.62), X(0.12), Y(0) - Y(0.62)); // posts into the water
  const person = (fx, h, arms) => {
    const s = h / 1.72, foot = 0.62, hip = foot + 0.86 * s, sh = foot + 1.42 * s, head = foot + 1.6 * s;
    g.lineWidth = X(0.13 * s);
    g.beginPath(); g.moveTo(X(fx - 0.09 * s), Y(foot)); g.lineTo(X(fx - 0.05 * s), Y(hip)); g.moveTo(X(fx + 0.09 * s), Y(foot)); g.lineTo(X(fx + 0.05 * s), Y(hip)); g.stroke(); // legs
    g.beginPath(); g.moveTo(X(fx - 0.14 * s), Y(hip)); g.lineTo(X(fx - 0.2 * s), Y(sh)); g.lineTo(X(fx + 0.2 * s), Y(sh)); g.lineTo(X(fx + 0.14 * s), Y(hip)); g.closePath(); g.fill(); // body
    g.beginPath(); g.ellipse(X(fx), Y(head), X(0.11 * s), X(0.13 * s), 0, 0, 6.29); g.fill(); // head
    g.lineWidth = X(0.085 * s); g.beginPath();
    for (const [ex, ey, hx, hy] of arms) { g.moveTo(X(fx + ex * s), Y(sh - 0.02)); g.quadraticCurveTo(X(fx + (ex + hx) * 0.5 * s), Y(sh + (hy - 0.02) * 0.5 * s), X(fx + hx * s), Y(sh + hy * s)); }
    g.stroke();
  };
  person(3.3, 1.72, [[-0.16, 0, 0.02, 0.5], [0.16, 0, 0.14, 0.52]]); // both hands up under the lantern
  person(4.05, 1.18, [[-0.14, 0, -0.3, -0.35], [0.14, 0, 0.42, 0.46]]); // a child pointing at the sky
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** A lotus lantern floating on the water: pale petals around a candle. */
function lanternLotus(THREE) {
  const S = 128, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const halo = g.createRadialGradient(64, 70, 2, 64, 70, 60);
  halo.addColorStop(0, "rgba(255,200,120,0.55)"); halo.addColorStop(1, "rgba(255,200,120,0)");
  g.fillStyle = halo; g.fillRect(0, 0, S, S);
  const petal = (px, py, rx, ry, rot, col) => { g.save(); g.translate(px, py); g.rotate(rot); g.fillStyle = col; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, 6.29); g.fill(); g.restore(); };
  for (const [a, col] of [[-1.05, "#f3b6c8"], [1.05, "#f3b6c8"], [-0.55, "#f8cfdc"], [0.55, "#f8cfdc"], [0, "#fde6ee"]]) petal(64 + Math.sin(a) * 22, 80 - Math.cos(a) * 12, 10, 22, a, col);
  const flame = g.createRadialGradient(64, 66, 1, 64, 66, 12);
  flame.addColorStop(0, "rgba(255,250,220,1)"); flame.addColorStop(1, "rgba(255,170,60,0)");
  g.fillStyle = flame; g.beginPath(); g.arc(64, 66, 12, 0, 6.29); g.fill();
  g.fillStyle = "#6b4a3a"; g.fillRect(40, 92, 48, 5); // the base on the water
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function skylanterns(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(2026);
  const EYE = 1.6, PITCH = 0.12; // standing at the water's edge, looking a little up
  camera.fov = 50; camera.near = 0.1; camera.far = 2600;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  const TAN = Math.tan((camera.fov * Math.PI) / 360);
  const halfW = (dist) => dist * TAN * camera.aspect; // half the visible width at that distance
  const time = { value: 0 };
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  // double-sided because the mirrored pass turns every face around; one pass each (three draws transparent double-sided things twice by default)
  const shader = (vs, fs, uniforms, extra = {}) => keep(new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, ...extra }));
  const plain = (opts) => keep(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, ...opts }));
  // everything above the water lives in `world`: it is drawn twice, the second time mirrored in the water (scale.y = -1)
  const world = new THREE.Group();
  scene.add(world);
  const layer = (mat, x, y, z, w, h, order) => { const m = new THREE.Mesh(quad, mat); m.position.set(x, y, z); m.scale.set(w, h, 1); m.renderOrder = order; m.frustumCulled = false; world.add(m); return m; };

  const skyUni = {
    uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(Math.sin(0.34), 0.105, -Math.cos(0.34)).normalize() }, uSunColor: { value: new THREE.Color("#fff0c4") }, uSun: { value: 0 },
  };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(2200, 40, 24)), shader(LANTERN_SKY_VS, LANTERN_SKY_FS, skyUni, { transparent: false }));
  sky.position.set(0, EYE, 0); sky.renderOrder = 0; sky.frustumCulled = false;
  world.add(sky);
  const STARS = preview ? 300 : 900, starPos = new Float32Array(STARS * 3);
  for (let i = 0; i < STARS; i++) { const a = r(0, 6.283), e = Math.asin(r(0.05, 1)); starPos.set([Math.cos(a) * Math.cos(e) * 2000, EYE + Math.sin(e) * 2000, Math.sin(a) * Math.cos(e) * 2000], i * 3); }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = keep(new THREE.PointsMaterial({ color: 0xe8eeff, size: preview ? 1.1 : 1.5, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = 1; stars.frustumCulled = false;
  world.add(stars);
  const mistTex = keep(inkMist(THREE)); // the soft band texture of the ink painting: fades to nothing at every edge
  const cloudMat = plain({ map: mistTex });
  const clouds = [];
  for (let i = 0; i < (preview ? 3 : 6); i++) clouds.push({ m: layer(cloudMat, r(-900, 900), r(110, 330), -1500, r(500, 900), r(40, 80), 2), speed: r(1.5, 4) });
  const hillUni = { uMask: { value: keep(lanternHills(THREE, preview ? 1024 : 2048, preview ? 96 : 160)) }, uFar: { value: new THREE.Color() }, uNear: { value: new THREE.Color() } };
  layer(shader(LANTERN_LAYER_VS, LANTERN_HILLS_FS, hillUni), 0, 80, -640, 2400, 160, 3);
  const mistMat = plain({ map: mistTex });
  const mists = [[-380, 12, 1500, 34, 4], [-205, 2.5, 900, 9, 7], [-160, 1.2, 600, 5, 7]].map(([z, y, w, h, order], i) => ({ m: layer(mistMat, r(-200, 200), y, z, w, h, order), speed: [1.2, 0.6, 0.9][i] }));
  const townUni = { uMask: { value: keep(lanternTown(THREE, preview ? 2048 : 4096, preview ? 128 : 256)) }, uWall: { value: new THREE.Color() }, uWindow: { value: new THREE.Color() }, uEave: { value: new THREE.Color() }, uTime: time };
  layer(shader(LANTERN_LAYER_VS, LANTERN_TOWN_FS, townUni), 0, 30, -220, 1000, 60, 6);
  // lotus lanterns floating on the water close by
  const lotusMat = plain({ map: keep(lanternLotus(THREE)) });
  const lotuses = [];
  for (let i = 0; i < (preview ? 4 : 10); i++) { const z = r(14, 60); lotuses.push({ m: layer(lotusMat, r(-1, 1) * halfW(z), 0.24, -z, 0.8, 0.8, 8), z, u: r(-0.95, 0.95), speed: r(0.02, 0.06) * (r() < 0.5 ? -1 : 1), phase: r(0, 6.28) }); }
  // the pier in front, and the two people letting lanterns go
  const PIER_Z = 11;
  const pierMat = plain({ map: keep(lanternPier(THREE)) });
  const pier = layer(pierMat, 0, 1.5, -PIER_Z, 6, 3, 10);

  // the lake: not part of `world`. Before the sky is drawn, the whole world is drawn mirrored into a texture the lake shows.
  const reflectRT = keep(new THREE.WebGLRenderTarget(4, 4));
  reflectRT.texture.colorSpace = THREE.SRGBColorSpace;
  const lakeUni = { tReflect: { value: reflectRT.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: time, uDeep: { value: new THREE.Color() }, uSheen: { value: new THREE.Color() } };
  const lakeGeo = keep(new THREE.PlaneGeometry(6000, 6000));
  lakeGeo.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lakeGeo, shader(LANTERN_LAKE_VS, LANTERN_LAKE_FS, lakeUni, { transparent: false }));
  lake.position.z = -2900; lake.renderOrder = 5; lake.frustumCulled = false;
  scene.add(lake);
  const RS = 0.5, buf = new THREE.Vector2(); // the reflection: half resolution, the ripples blur it anyway
  let reflecting = false, onFlip = () => {};
  sky.onBeforeRender = (renderer, sc, cam) => {
    if (reflecting) return; // the mirrored pass draws the sky too
    reflecting = true;
    renderer.getDrawingBufferSize(buf);
    lakeUni.uRes.value.copy(buf);
    const w = Math.max(2, Math.round(buf.x * RS)), h = Math.max(2, Math.round(buf.y * RS));
    if (reflectRT.width !== w || reflectRT.height !== h) reflectRT.setSize(w, h);
    world.scale.y = -1; lake.visible = false; onFlip(-1); // the mirror image of everything above the water
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(reflectRT);
    renderer.render(sc, cam);
    renderer.setRenderTarget(before);
    world.scale.y = 1; lake.visible = true; onFlip(1);
    world.updateMatrixWorld(true); // the mirrored pass left mirrored matrices behind
    reflecting = false;
  };

  /* --- the lanterns: launched from the town and the shore, rising, drifting with the breeze, burning out high up --- */
  const NL = preview ? 160 : 520;
  const lanternGeo = keep(new THREE.PlaneGeometry(1, 1));
  const aLantern = new THREE.InstancedBufferAttribute(new Float32Array(NL * 4), 4), aTint = new THREE.InstancedBufferAttribute(new Float32Array(NL * 3), 3);
  aLantern.setUsage(THREE.DynamicDrawUsage); aTint.setUsage(THREE.DynamicDrawUsage);
  lanternGeo.setAttribute("aLantern", aLantern); lanternGeo.setAttribute("aTint", aTint);
  const lanternUni = { uMap: { value: keep(lanternSprite(THREE)) }, uFlip: { value: 1 }, uTime: time, uHalo: { value: 1 } };
  const lanternMat = shader(LANTERN_VS, LANTERN_FS, lanternUni, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor });
  const lanternMesh = new THREE.InstancedMesh(lanternGeo, lanternMat, NL);
  lanternMesh.frustumCulled = false; lanternMesh.renderOrder = 9; lanternMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(lanternMesh);
  onFlip = (s) => { lanternUni.uFlip.value = s; }; // mirrored lanterns hang upside down
  const WARM = ["#ffb45a", "#ff9c45", "#ffc56e", "#ff8a3d", "#ffd08a", "#ffa850"].map((c) => new THREE.Color(c));
  const accentCol = new THREE.Color();
  const Ls = [];
  let wind = 0.9, bright = 1.6;
  const topOfView = (l) => { const dist = Math.max(1, -l.z); return (l.y - EYE) / dist > Math.tan(PITCH + Math.atan(TAN)) + 0.08; };
  /** A lantern goes up: from the town (most of them) or from boats and the shore closer by. */
  function launch(l, spread) {
    const town = r() < 0.72;
    const dist = town ? r(150, 222) : r(30, 140);
    l.z = -dist; l.x = r(-1.25, 1.25) * halfW(dist) - wind * r(0, 20);
    l.y = town ? r(4, 14) : r(0.8, 2.5);
    l.vy = r(0.9, 1.9); l.vx = r(-0.3, 0.3); l.vz = r(-0.4, 0.05);
    l.size = r(1.6, 2.3); l.seed = r(0, 100); l.top = r(170, 340); l.age = 0; // the quad: a paper body about a metre tall, and its halo
    l.warm = WARM[(r() * WARM.length) | 0]; l.accent = r() < 0.14;
    if (spread) { // already on the way when the scene starts
      const tt = Math.pow(r(), 0.85) * (l.top - l.y) / l.vy;
      l.y += l.vy * tt; l.x += (l.vx + wind) * tt; l.z += l.vz * tt; l.age = 99;
      const hw = halfW(-l.z) * 1.2;
      l.x = ((((l.x + hw) % (2 * hw)) + 2 * hw) % (2 * hw)) - hw; // the breeze carried it off to the side: bring it back into view at the same height
      if (topOfView(l)) { l.y = town ? r(4, 60) : r(1, 25); }
    }
  }
  for (let i = 0; i < NL; i++) { const l = { i }; launch(l, true); Ls.push(l); }
  // the two people's lanterns: held up for a few seconds, let go, and on their way while the next one is lit
  const heroes = [Ls[0], Ls[1]];
  const hands = new THREE.Vector3();
  heroes.forEach((h, k) => { h.hero = true; h.state = k === 0 ? "held" : "wait"; h.timer = k === 0 ? r(2.5, 4) : 9; h.size = 2; h.accent = k === 1; h.warm = WARM[0]; });
  function stepHero(h, dt) {
    h.timer -= dt;
    if (h.state === "wait") { h.alpha = 0; if (h.timer <= 0) { h.state = "held"; h.timer = r(3, 5); h.age = 0; } return; }
    if (h.state === "held") {
      h.size = hands.size; h.x = hands.x; h.y = hands.y + Math.sin(h.age * 1.7) * 0.03; h.z = hands.z; h.age += dt;
      h.alpha = Math.min(1, h.age / 1.2);
      if (h.timer <= 0) { h.state = "rise"; h.vy = 0.15; h.vx = 0; h.vz = -0.12; h.age = 0; }
      return;
    }
    h.age += dt;
    h.vy = Math.min(1.25, h.vy + dt * 0.25); h.vx += (wind * 0.8 - h.vx) * Math.min(1, dt * 0.25);
    h.x += h.vx * dt; h.y += h.vy * dt; h.z += h.vz * dt; h.alpha = 1;
    if (topOfView(h) || h.y > 120) { h.state = "wait"; h.timer = r(3, 7); const other = heroes[heroes.indexOf(h) ^ 1]; if (other.state === "wait") other.timer = Math.min(other.timer, 0.5); }
  }
  const order = Ls.map((_, i) => i);
  const M4 = new THREE.Matrix4();
  function stepLanterns(dt) {
    for (const l of Ls) {
      if (l.hero) { stepHero(l, dt); continue; }
      l.age += dt;
      l.x += (l.vx + wind) * dt + Math.sin(l.age * 0.5 + l.seed) * 0.05 * dt; l.y += l.vy * dt; l.z += l.vz * dt;
      const burn = 1 - Math.max(0, Math.min(1, (l.y - l.top * 0.82) / (l.top * 0.18))); // burning out near the top of the flight
      l.alpha = Math.min(1, l.age / 1.5) * burn;
      if (burn <= 0 || topOfView(l) || l.x > halfW(-l.z) * 1.35 + 5) launch(l, false);
    }
    order.sort((a, b) => Ls[a].z - Ls[b].z); // far first: the paper of a near lantern must cover a far one
    order.forEach((idx, k) => {
      const l = Ls[idx];
      M4.makeTranslation(l.x, l.y, l.z);
      lanternMesh.setMatrixAt(k, M4);
      aLantern.setXYZW(k, l.size * 0.5, l.seed, bright * (l.hero ? 1.25 : 1), l.alpha);
      const c = l.accent ? accentCol : l.warm;
      aTint.setXYZ(k, c.r, c.g, c.b);
    });
    lanternMesh.instanceMatrix.needsUpdate = aLantern.needsUpdate = aTint.needsUpdate = true;
  }

  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    skyUni.uZenith.value.set(d ? "#050a1c" : "#3a5698"); skyUni.uMid.value.set(d ? "#0f1b42" : "#d48a94");
    skyUni.uHorizon.value.set(d ? "#27366a" : "#ffc27e"); skyUni.uGlow.value.set(d ? "#5c3f48" : "#ffb36a").multiplyScalar(d ? 0.9 : 0.6);
    skyUni.uSun.value = d ? 0 : 1;
    starMat.opacity = d ? 0.85 : 0;
    cloudMat.color.set(d ? "#1c2852" : "#ffb49c"); cloudMat.opacity = d ? 0.45 : 0.6;
    hillUni.uFar.value.set(d ? "#111b3d" : "#8a6f96"); hillUni.uNear.value.set(d ? "#0a1129" : "#5d4872");
    mistMat.color.set(d ? "#2c3b6c" : "#ffd6b6"); mistMat.opacity = d ? 0.4 : 0.5;
    townUni.uWall.value.set(d ? "#04060f" : "#231a2e");
    townUni.uWindow.value.set(d ? "#ffb45c" : "#ffc676").multiplyScalar(d ? 1.7 : 1.25);
    townUni.uEave.value.set("#ff3b2c").multiplyScalar(d ? 1.5 : 1.1);
    lakeUni.uDeep.value.set(d ? "#02040c" : "#5a4a6c");
    lakeUni.uSheen.value.set(d ? "#ffcf8a" : "#fff0d2").multiplyScalar(d ? 0.6 : 0.9);
    lanternUni.uHalo.value = d ? 2.6 : 0.7;
    bright = d ? 2.4 : 1.6;
    accentCol.set(p.accent).multiplyScalar(1.15);
    pierMat.color.set(d ? "#03050c" : "#19131f");
    lotusMat.color.set(d ? "#ffffff" : "#f2e6ea");
  }
  applyPalette(pal);

  const look = new THREE.Vector3();
  function frame(dt, t) {
    time.value = t;
    wind = 0.9 + 0.5 * Math.sin(t * 0.031) + 0.25 * Math.sin(t * 0.077); // a slow breeze, left to right
    const cx = Math.sin(t * 0.023) * 0.4; // the viewer shifts a little: town, hills and lanterns part
    camera.position.set(cx, EYE + Math.sin(t * 0.05) * 0.03, 0);
    camera.lookAt(look.set(cx * 0.3, EYE + Math.tan(PITCH) * 100, -100));
    // the pier stays at the lower left on every screen shape
    const s = Math.min(1, 0.55 + 0.3 * camera.aspect), px = cx - halfW(PIER_Z) * 0.42;
    pier.scale.set(6 * s, 3 * s, 1);
    pier.position.set(px - 0.3 * s, 1.5 * s, -PIER_Z);
    hands.size = 2 * s; // the paper body rests on the raised hands
    hands.set(px + 0.08 * s, (0.62 + 1.42 + 0.52) * s + 0.25 * hands.size, -PIER_Z + 0.05);
    for (const c of clouds) { c.m.position.x += c.speed * dt; if (c.m.position.x > 1300) c.m.position.x = -1300; }
    for (const m of mists) { m.m.position.x += m.speed * dt; if (m.m.position.x > 350) m.m.position.x = -350; }
    for (const L of lotuses) {
      L.u += L.speed * dt * 0.05;
      if (L.u > 1.1) L.u = -1.1; else if (L.u < -1.1) L.u = 1.1;
      L.m.position.set(cx + L.u * halfW(L.z), 0.24 + Math.sin(t * 1.1 + L.phase) * 0.02, -L.z);
    }
    stepLanterns(dt);
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    dispose() { disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Snow globe: a winter village in a globe of water on a desk; move the mouse and the snow swirls up ---------- */
// The glass is not a mesh: for every pixel a ray is traced into a sphere of water. Behind it the room shows upside down
// (in through the front, across the water, out at the back, as in a real globe), the village inside is magnified,
// and the glass reflects the lamp and a window. tWorld = the room, desk and base; tInside = the village and the snow.
const GLOBE_GLASS_FS = /* glsl */ `
  uniform sampler2D tWorld; uniform sampler2D tInside;
  uniform mat4 uInvProj; uniform mat4 uCamWorld; uniform mat4 uViewProj;
  uniform vec3 uCentre; uniform float uR; uniform float uCollarY; uniform float uIor; uniform float uIorIn;
  uniform vec3 uTint; uniform vec3 uRoom; uniform vec3 uLampDir; uniform vec3 uLamp; uniform vec3 uWinDir; uniform vec3 uWin;
  varying vec2 vUv;
  vec2 toUv(vec3 w) { vec4 c = uViewProj * vec4(w, 1.0); return c.w > 0.0 ? c.xy / c.w * 0.5 + 0.5 : vUv; }
  vec3 behind(vec3 P, vec3 N, vec3 dir, float ior) {
    vec3 r1 = refract(dir, N, 1.0 / ior);
    vec3 pc = P - uCentre;
    float b2 = dot(pc, r1);
    float t2 = -b2 + sqrt(max(b2 * b2 - dot(pc, pc) + uR * uR, 0.0));
    vec3 P2 = P + r1 * t2;
    vec3 N2 = normalize(P2 - uCentre);
    vec3 r2 = refract(r1, -N2, ior);
    if (dot(r2, r2) < 0.5) r2 = reflect(r1, -N2); // total internal reflection at the rim
    return texture2D(tWorld, clamp(toUv(P2 + r2 * 4.0), 0.002, 0.998), 1.5).rgb; // a little softer: the room is out of focus
  }
  void main() {
    vec3 base = texture2D(tWorld, vUv).rgb;
    vec4 v = uInvProj * vec4(vUv * 2.0 - 1.0, 1.0, 1.0);
    vec3 dir = normalize((uCamWorld * vec4(v.xyz / v.w, 0.0)).xyz);
    vec3 oc = cameraPosition - uCentre;
    float b = dot(oc, dir);
    float miss = sqrt(max(dot(oc, oc) - b * b, 0.0)); // how far the ray passes from the centre
    float aa = max(fwidth(miss), 1e-4) * 1.2;
    float cover = (1.0 - smoothstep(uR - aa, uR, miss)) * step(b, 0.0);
    vec3 col = base;
    if (cover > 0.0) {
      float t = -b - sqrt(max(b * b - dot(oc, oc) + uR * uR, 0.0));
      vec3 P = cameraPosition + dir * t;
      vec3 N = normalize(P - uCentre);
      // the room behind, upside down; each colour bends a little differently: rainbow fringes at the rim
      float disp = (uIor - 1.0) * 0.06;
      vec3 bg = vec3(behind(P, N, dir, uIor).r, behind(P, N, dir, uIor + disp).g, behind(P, N, dir, uIor + disp * 2.0).b);
      // the village inside, magnified by the water
      vec3 ri = refract(dir, N, 1.0 / uIorIn);
      vec3 fwd = normalize(uCentre - cameraPosition);
      float tc = dot(uCentre - P, fwd) / max(dot(ri, fwd), 0.2);
      vec4 inside = texture2D(tInside, clamp(toUv(P + ri * tc), 0.002, 0.998));
      vec3 glass = inside.rgb + (1.0 - inside.a) * bg * uTint;
      // what the glass reflects: the room, a window behind you (its panes and cross), the lamp
      vec3 R = reflect(dir, N);
      float ndv = clamp(dot(N, -dir), 0.0, 1.0);
      float F = 0.035 + 0.965 * pow(1.0 - ndv, 5.0);
      glass = mix(glass, uRoom, F);
      vec3 wr = normalize(cross(uWinDir, vec3(0.0, 1.0, 0.0))), wu = cross(wr, uWinDir);
      float wx = dot(R, wr), wy = dot(R, wu);
      float pane = smoothstep(0.34, 0.3, abs(wx)) * smoothstep(0.42, 0.38, abs(wy)) * step(0.0, dot(R, uWinDir));
      pane *= smoothstep(0.012, 0.028, abs(wx)) * smoothstep(0.012, 0.028, abs(wy));
      glass += uWin * pane * (0.18 + 0.82 * F);
      float lamp = max(dot(R, uLampDir), 0.0);
      glass += uLamp * (pow(lamp, 900.0) * 3.0 + pow(lamp, 70.0) * 0.25);
      glass *= 1.0 - 0.3 * smoothstep(0.3, 0.02, ndv); // thicker glass, seen edge-on
      float collar = smoothstep(uCollarY - 0.006, uCollarY + 0.006, P.y); // below this the wooden collar hides the glass
      col = mix(base, glass, cover * collar);
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
const GLOBE_SNOW_VS = /* glsl */ `
  uniform float uPx; uniform float uTime;
  attribute vec3 aFlake; // size, kind (0 snow, 1 gold glitter, 2 accent glitter), phase
  varying float vKind; varying float vGlint;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    vKind = aFlake.y;
    vGlint = aFlake.y > 0.5 ? pow(max(0.0, sin(uTime * 4.0 + aFlake.z * 6.2831)), 18.0) : 0.0; // glitter catches the light as it turns
    gl_PointSize = clamp(aFlake.x * uPx / -mv.z, 1.5, 28.0);
  }
`;
const GLOBE_SNOW_FS = /* glsl */ `
  uniform vec3 uSnow; uniform vec3 uGold; uniform vec3 uAccent;
  varying float vKind; varying float vGlint;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    vec3 col = vKind < 0.5 ? uSnow : (vKind < 1.5 ? uGold : uAccent);
    gl_FragColor = vec4(col * (1.0 + vGlint * 3.0), (1.0 - r2) * (vKind < 0.5 ? 0.9 : 0.8 + 0.2 * vGlint));
    #include <colorspace_fragment>
  }
`;

/**
 * The room behind the globe as one flat painting (designed at 1600 × 900; the wall is 16 × 9 units, 100 px a unit):
 * a window with a snowy town outside, curtains, a picture, a bookshelf, a lamp on a sideboard. Blurred afterwards.
 */
function globeRoom(W, H, dark) {
  const r = koiRng(dark ? 404 : 505);
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  const k = W / 1600;
  const X = (u) => u * k;
  const rect = (col, x0, y0, x1, y1) => { g.fillStyle = col; g.fillRect(X(x0), X(y0), X(x1 - x0), X(y1 - y0)); };
  const poly = (col, pts) => { g.fillStyle = col; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(X(x), X(y)) : g.moveTo(X(x), X(y)))); g.closePath(); g.fill(); };
  // the wall, papered in faint stripes, and wainscoting below
  const wall = g.createLinearGradient(0, 0, 0, H);
  wall.addColorStop(0, dark ? "#1c1620" : "#efe6d8"); wall.addColorStop(1, dark ? "#2e2420" : "#e0d2bd");
  g.fillStyle = wall; g.fillRect(0, 0, W, H);
  for (let x = 0; x < 1600; x += 40) rect(dark ? "rgba(255,225,190,0.035)" : "rgba(120,90,60,0.05)", x, 0, x + 14, 720);
  rect(dark ? "#231a17" : "#d6c6ae", 0, 720, 1600, 900);
  rect(dark ? "#3b2c25" : "#c4b196", 0, 712, 1600, 724);
  g.lineWidth = X(3); g.strokeStyle = dark ? "rgba(0,0,0,0.35)" : "rgba(0,0,0,0.07)";
  for (let x = 30; x < 1600; x += 230) g.strokeRect(X(x), X(752), X(190), X(120));
  // the window: a snowy town outside, the moon at night
  const wx0 = 170, wx1 = 590, wy0 = 120, wy1 = 600;
  const sky = g.createLinearGradient(0, X(wy0), 0, X(wy1));
  sky.addColorStop(0, dark ? "#0a1430" : "#bccde2"); sky.addColorStop(1, dark ? "#26395f" : "#eef2f5");
  g.fillStyle = sky; g.fillRect(X(wx0), X(wy0), X(wx1 - wx0), X(wy1 - wy0));
  if (dark) {
    for (let i = 0; i < 70; i++) { g.fillStyle = `rgba(255,255,255,${r(0.3, 0.9)})`; g.fillRect(X(r(wx0, wx1)), X(r(wy0, wy0 + 280)), X(2.2), X(2.2)); } // stars
    const moon = g.createRadialGradient(X(492), X(205), 0, X(492), X(205), X(80));
    moon.addColorStop(0, "rgba(255,250,236,1)"); moon.addColorStop(0.33, "rgba(255,250,236,0.95)"); moon.addColorStop(0.42, "rgba(190,205,255,0.28)"); moon.addColorStop(1, "rgba(190,205,255,0)");
    g.fillStyle = moon; g.fillRect(X(412), X(125), X(160), X(160));
  }
  const farRoof = dark ? "#1d2a4a" : "#aebccb", nearRoof = dark ? "#131b33" : "#8e9eaf", snow = dark ? "#c9d4ee" : "#ffffff";
  for (let i = 0; i < 7; i++) { // rooftops across the street, snow along their ridges
    const x0 = wx0 - 20 + i * 70 + r(-10, 10), w = r(60, 90), y = r(430, 480), ridge = y - r(30, 50), col = i % 2 ? farRoof : nearRoof;
    poly(col, [[x0, wy1], [x0, y], [x0 + w / 2, ridge], [x0 + w, y], [x0 + w, wy1]]);
    g.strokeStyle = snow; g.lineWidth = X(5); g.beginPath(); g.moveTo(X(x0), X(y)); g.lineTo(X(x0 + w / 2), X(ridge)); g.lineTo(X(x0 + w), X(y)); g.stroke();
    if (dark && r() < 0.7) rect("#ffc877", x0 + w * 0.3, y + 25, x0 + w * 0.3 + 12, y + 40);
  }
  for (let i = 0; i < 5; i++) { const px = wx0 + 30 + i * 95 + r(-15, 15), py = r(520, 560), ph = r(60, 90); poly(dark ? "#0e1528" : "#6f8090", [[px - 22, py], [px, py - ph], [px + 22, py]]); }
  rect(dark ? "#dfe6f5" : "#ffffff", wx0, 560, wx1, wy1); // snow on the ground
  // the window frame and its cross
  const frame = dark ? "#3b2a22" : "#f6f2ea";
  rect(frame, wx0 - 16, wy0 - 16, wx1 + 16, wy0); rect(frame, wx0 - 16, wy1, wx1 + 16, wy1 + 16);
  rect(frame, wx0 - 16, wy0, wx0, wy1); rect(frame, wx1, wy0, wx1 + 16, wy1);
  rect(frame, (wx0 + wx1) / 2 - 6, wy0, (wx0 + wx1) / 2 + 6, wy1); rect(frame, wx0, (wy0 + wy1) / 2 - 6, wx1, (wy0 + wy1) / 2 + 6);
  rect(dark ? "#4a372c" : "#e8e1d4", wx0 - 34, wy1 + 16, wx1 + 34, wy1 + 34); // the sill
  // curtains, gathered at the sides
  const curtain = (x0, x1) => {
    const gr = g.createLinearGradient(X(x0), 0, X(x1), 0);
    const base = dark ? [90, 42, 48] : [205, 186, 158];
    for (let i = 0; i <= 8; i++) { const f = 0.78 + 0.22 * Math.sin(i * 1.9); gr.addColorStop(i / 8, `rgb(${base.map((v) => Math.round(v * f)).join(",")})`); }
    g.fillStyle = gr; g.beginPath(); g.moveTo(X(x0), X(70)); g.lineTo(X(x1), X(70)); g.quadraticCurveTo(X(x1 - 10), X(420), X(x1 + 12), X(700)); g.lineTo(X(x0 - 12), X(700)); g.quadraticCurveTo(X(x0 + 10), X(420), X(x0), X(70)); g.fill();
  };
  curtain(95, 205); curtain(555, 665);
  rect(dark ? "#5a4636" : "#b8a488", 70, 62, 690, 72); // the rod
  // a picture on the wall
  rect(dark ? "#6b5130" : "#b58f55", 720, 190, 920, 350);
  const art = g.createLinearGradient(0, X(205), 0, X(335));
  art.addColorStop(0, dark ? "#2b3a58" : "#9fbad0"); art.addColorStop(1, dark ? "#3f4f3a" : "#9db38a");
  g.fillStyle = art; g.fillRect(X(735), X(205), X(170), X(130));
  poly(dark ? "#22301f" : "#6f8a5f", [[735, 335], [790, 270], [840, 300], [905, 250], [905, 335]]);
  // the bookshelf
  const wood = dark ? "#3a281e" : "#8a6446";
  rect(wood, 1180, 120, 1200, 712); rect(wood, 1520, 120, 1540, 712); rect(wood, 1180, 120, 1540, 140);
  const BOOKS = dark ? ["#6b2f2f", "#2f4a6b", "#4a5f3a", "#7a5a2a", "#50305a", "#2a4a4a", "#8a3a2a", "#34385a"] : ["#a64b45", "#4d6f96", "#6b8a55", "#c9973f", "#7a568a", "#4f8a86", "#c26a4a", "#5a6394"];
  for (const sy of [260, 390, 520, 650]) {
    rect(wood, 1200, sy, 1520, sy + 14);
    for (let x = 1206; x < 1500;) {
      const bw = r(14, 30), bh = r(72, 112), lean = r() < 0.08;
      if (x + bw > 1512) break;
      if (lean) { poly(BOOKS[(r() * 8) | 0], [[x, sy], [x + bw, sy], [x + bw + 26, sy - bh + 6], [x + 26, sy - bh + 6]]); x += bw + 30; continue; }
      rect(BOOKS[(r() * 8) | 0], x, sy - bh, x + bw, sy);
      rect(dark ? "rgba(255,220,160,0.18)" : "rgba(255,255,255,0.35)", x + 3, sy - bh + 12, x + bw - 3, sy - bh + 16);
      x += bw + r(1, 4);
    }
  }
  poly(dark ? "#2f4a33" : "#5f8f5a", [[1440, 240], [1420, 195], [1450, 215], [1462, 180], [1478, 218], [1500, 200], [1490, 240]]); // a plant on the top shelf
  rect(dark ? "#6b4a3a" : "#b8764e", 1438, 236, 1492, 260);
  // a sideboard with a lamp; at night the shade glows and throws light up and down the wall
  rect(dark ? "#2e211b" : "#7c5a40", 940, 690, 1160, 712);
  rect(dark ? "#3b2a22" : "#8f6a4c", 1042, 575, 1058, 690);
  if (dark) {
    g.globalCompositeOperation = "lighter";
    for (const [y, rad] of [[470, 240], [640, 180]]) {
      const pool = g.createRadialGradient(X(1050), X(y), 0, X(1050), X(y), X(rad));
      pool.addColorStop(0, "rgba(255,190,110,0.32)"); pool.addColorStop(1, "rgba(255,190,110,0)");
      g.fillStyle = pool; g.fillRect(X(1050 - rad), X(y - rad), X(rad * 2), X(rad * 2));
    }
    g.globalCompositeOperation = "source-over";
  }
  const shade = g.createLinearGradient(0, X(480), 0, X(575));
  shade.addColorStop(0, dark ? "#ffe2b0" : "#f1e6d2"); shade.addColorStop(1, dark ? "#ffc27a" : "#dccbb0");
  poly(shade, [[1008, 480], [1092, 480], [1116, 575], [984, 575]]);
  return c;
}
/** Wood grain along x, seamless across the width: a desk top, or the rings of a turned base. */
function globeWood(THREE, W, H, baseHex, seed) {
  const r = koiRng(seed);
  const tex = canvasTexture(THREE, W, H, (g) => {
    g.fillStyle = baseHex; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 110; i++) {
      const y = r(0, H), amp = r(1.5, 7), n = 1 + ((r() * 3) | 0), ph = r(0, 6.28), fr = (Math.PI * 2 * n) / W;
      g.strokeStyle = r() < 0.62 ? `rgba(35,18,8,${r(0.07, 0.2)})` : `rgba(255,222,180,${r(0.04, 0.11)})`;
      g.lineWidth = r(0.8, 3.5); g.beginPath();
      for (let x = 0; x <= W; x += 6) g.lineTo(x, y + Math.sin(x * fr + ph) * amp + Math.sin(x * fr * 2 + ph * 1.7) * amp * 0.3);
      g.stroke();
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Placed geometries, each in its own colour, as one: a whole crafted village is a single draw. */
function mergeColored(THREE, parts) {
  const chunks = parts.map(([geo, m, hex]) => { const g = geo.index ? geo.toNonIndexed() : geo; g.applyMatrix4(m); return [g, new THREE.Color(hex)]; }); // a roof prism has no index already
  const n = chunks.reduce((s, [g]) => s + g.attributes.position.count, 0);
  const pos = new Float32Array(n * 3), nrm = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const [g, c] of chunks) {
    const cnt = g.attributes.position.count;
    pos.set(g.attributes.position.array, o * 3); nrm.set(g.attributes.normal.array, o * 3);
    for (let i = 0; i < cnt; i++) { col[(o + i) * 3] = c.r; col[(o + i) * 3 + 1] = c.g; col[(o + i) * 3 + 2] = c.b; }
    o += cnt;
    g.dispose();
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  out.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return out;
}
/** A roof: the ridge along x (−0.5…0.5) at y = 1, the eaves along z = ±0.5 at y = 0. */
function roofPrism(THREE) {
  const P = [[-0.5, 0, -0.5], [-0.5, 0, 0.5], [-0.5, 1, 0], [0.5, 0, -0.5], [0.5, 0, 0.5], [0.5, 1, 0]];
  const T = [[0, 1, 2], [3, 5, 4], [0, 2, 5], [0, 5, 3], [1, 4, 5], [1, 5, 2], [0, 3, 4], [0, 4, 1]];
  const pos = new Float32Array(T.length * 9);
  T.forEach((t, i) => t.forEach((k, j) => pos.set(P[k], i * 9 + j * 3)));
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}
/**
 * The village on the snowy ground inside the globe (world units; the ground's height comes from groundY).
 * Returns one geometry for everything that is lit, one for the windows that glow, the lamp heads,
 * the lights on the big tree and the snowman's frame (his scarf is added in the accent colour).
 */
function globeVillage(THREE, groundY, r) {
  const box = new THREE.BoxGeometry(1, 1, 1), roof = roofPrism(THREE), cone7 = new THREE.ConeGeometry(1, 1, 7), cone4 = new THREE.ConeGeometry(1, 1, 4);
  const ball = new THREE.SphereGeometry(1, 12, 9), cyl = new THREE.CylinderGeometry(1, 1, 1, 10), puck = new THREE.CylinderGeometry(1, 1, 1, 28);
  const parts = [], windows = [], lamps = [], treeLights = [];
  const SNOW = "#f3f6fb", LIT = "#ffc877";
  const UP = new THREE.Vector3(0, 1, 0);
  const frame = (x, z, ry) => new THREE.Matrix4().compose(new THREE.Vector3(x, 0, z), new THREE.Quaternion().setFromAxisAngle(UP, ry), new THREE.Vector3(1, 1, 1));
  const add = (F, geo, lx, ly, lz, sx, sy, sz, hex, list = parts, rot = null) => {
    const m = new THREE.Matrix4().compose(new THREE.Vector3(lx, ly, lz), rot ? new THREE.Quaternion().setFromEuler(rot) : new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
    list.push([geo, new THREE.Matrix4().multiplyMatrices(F, m), hex]);
  };
  function house(x, z, w, h, d, ry, wall) {
    const F = frame(x, z, ry), y0 = groundY(x, z) - 0.004;
    add(F, box, 0, y0 + h / 2, 0, w, h, d, wall);
    add(F, roof, 0, y0 + h, 0, w * 1.14, h * 0.62, d * 1.2, SNOW);
    add(F, box, w * 0.26, y0 + h * 1.36, -d * 0.16, 0.026, 0.07, 0.026, "#7a4a3a"); // chimney
    add(F, box, w * 0.26, y0 + h * 1.36 + 0.037, -d * 0.16, 0.032, 0.01, 0.032, SNOW);
    add(F, box, -w * 0.2, y0 + h * 0.23, d / 2 + 0.002, w * 0.2, h * 0.46, 0.004, "#4a3326"); // door
    add(F, box, w * 0.2, y0 + h * 0.56, d / 2 + 0.003, 0.034, 0.036, 0.004, LIT, windows);
    add(F, box, w / 2 + 0.003, y0 + h * 0.56, 0, 0.004, 0.036, 0.034, LIT, windows);
    add(F, box, -w / 2 - 0.003, y0 + h * 0.56, 0, 0.004, 0.036, 0.034, LIT, windows);
    add(F, ball, w * 0.42, y0, d * 0.5, 0.05, 0.022, 0.04, SNOW); // a drift against the wall
  }
  function church(x, z) {
    const F = frame(x, z, 0), y0 = groundY(x, z) - 0.004, WHITE = "#ece4d4";
    add(F, box, 0, y0 + 0.11, -0.03, 0.2, 0.22, 0.3, WHITE);
    add(F, roof, 0, y0 + 0.22, -0.03, 0.34, 0.13, 0.24, SNOW, parts, new THREE.Euler(0, Math.PI / 2, 0));
    add(F, box, 0, y0 + 0.17, 0.15, 0.1, 0.34, 0.1, WHITE); // the tower
    add(F, cone4, 0, y0 + 0.44, 0.15, 0.08, 0.2, 0.08, "#3c4654", parts, new THREE.Euler(0, Math.PI / 4, 0)); // the steeple
    add(F, box, 0, y0 + 0.565, 0.15, 0.008, 0.05, 0.008, "#d4a94a"); add(F, box, 0, y0 + 0.575, 0.15, 0.03, 0.008, 0.008, "#d4a94a"); // a gilded cross
    add(F, box, 0, y0 + 0.045, 0.203, 0.042, 0.09, 0.004, "#4a3326"); // the door
    add(F, box, 0, y0 + 0.25, 0.2 + 0.003, 0.03, 0.034, 0.004, "#ffe0a0", windows); // a round window over it
    for (const wz of [-0.13, -0.03]) for (const sx of [-1, 1]) add(F, box, sx * 0.103, y0 + 0.12, wz, 0.004, 0.07, 0.03, "#ffcf7a", windows); // tall windows
  }
  function pine(x, z, s, lights = 0) {
    const y0 = groundY(x, z) - 0.004, F = frame(x, z, r(0, 6.28));
    add(F, cyl, 0, y0 + 0.02 * s, 0, 0.01 * s, 0.04 * s, 0.01 * s, "#5a3b28");
    const tiers = [[0.075, 0.12, 0.08], [0.06, 0.1, 0.15], [0.043, 0.085, 0.215]];
    tiers.forEach(([rad, h, y], i) => {
      add(F, cone7, 0, y0 + y * s, 0, rad * s, h * s, rad * s, i % 2 ? "#2f5d3a" : "#285233");
      add(F, cone7, 0, y0 + (y + h * 0.33) * s, 0, rad * 0.5 * s, h * 0.3 * s, rad * 0.5 * s, SNOW); // snow on the branches
    });
    add(F, box, 0, y0 + 0.268 * s, 0, 0.012 * s, 0.012 * s, 0.012 * s, "#e8c35a", parts, new THREE.Euler(0.6, 0.6, 0.6)); // a star on top
    for (let i = 0; i < lights; i++) { // a garland of lights spiralling down the tree
      const f = (i + 0.5) / lights, y = 0.06 + f * 0.19, a = f * Math.PI * 7;
      const tier = tiers.find(([, h, ty]) => y <= ty + h / 2) || tiers[2];
      const rad = tier[0] * Math.max(0.12, 1 - (y - (tier[2] - tier[1] / 2)) / tier[1]) * 1.06;
      treeLights.push(new THREE.Vector3(x + Math.cos(a) * rad * s, y0 + y * s, z + Math.sin(a) * rad * s));
    }
  }
  function snowman(x, z) {
    const y0 = groundY(x, z) - 0.004, F = frame(x, z, -0.35), INK = "#1f1f24";
    add(F, ball, 0, y0 + 0.04, 0, 0.045, 0.042, 0.045, SNOW);
    add(F, ball, 0, y0 + 0.1, 0, 0.033, 0.032, 0.033, SNOW);
    add(F, ball, 0, y0 + 0.148, 0, 0.024, 0.024, 0.024, SNOW);
    add(F, cyl, 0, y0 + 0.183, 0, 0.017, 0.03, 0.017, INK); add(F, cyl, 0, y0 + 0.169, 0, 0.026, 0.004, 0.026, INK); // his hat
    add(F, cone7, 0, y0 + 0.148, 0.032, 0.005, 0.024, 0.005, "#e8742c", parts, new THREE.Euler(Math.PI / 2, 0, 0)); // carrot nose
    for (const ex of [-0.008, 0.008]) add(F, ball, ex, y0 + 0.156, 0.021, 0.0032, 0.0032, 0.0032, INK);
    for (const by of [0.09, 0.106]) add(F, ball, 0, y0 + by, 0.032, 0.0032, 0.0032, 0.0032, INK);
    add(F, cyl, 0.046, y0 + 0.112, 0, 0.0022, 0.05, 0.0022, "#5a3b28", parts, new THREE.Euler(0, 0, 1.0));
    add(F, cyl, -0.046, y0 + 0.112, 0, 0.0022, 0.05, 0.0022, "#5a3b28", parts, new THREE.Euler(0, 0, -1.0));
    return new THREE.Matrix4().multiplyMatrices(F, new THREE.Matrix4().makeTranslation(0, y0 + 0.126, 0));
  }
  function lamp(x, z) {
    const y0 = groundY(x, z) - 0.004, F = frame(x, z, 0), IRON = "#2a2a30";
    add(F, cyl, 0, y0 + 0.08, 0, 0.005, 0.16, 0.005, IRON);
    add(F, box, 0, y0 + 0.165, 0, 0.022, 0.026, 0.022, IRON);
    add(F, box, 0, y0 + 0.165, 0, 0.016, 0.02, 0.0235, "#ffd98a", windows);
    add(F, box, 0, y0 + 0.165, 0, 0.0235, 0.02, 0.016, "#ffd98a", windows);
    add(F, cone4, 0, y0 + 0.187, 0, 0.02, 0.02, 0.02, IRON, parts, new THREE.Euler(0, Math.PI / 4, 0));
    lamps.push(new THREE.Vector3(x, y0 + 0.165, z));
  }
  church(0, -0.34);
  house(-0.42, -0.1, 0.2, 0.15, 0.17, 0.35, "#b5423a");
  house(0.4, -0.14, 0.18, 0.14, 0.16, -0.4, "#c9973f");
  house(-0.2, 0.2, 0.16, 0.13, 0.15, 0.2, "#5e7a93");
  house(0.27, 0.19, 0.19, 0.14, 0.16, -0.25, "#4f7a5a");
  pine(0.03, -0.04, 1.45, 22); // the big tree in the middle, with its lights
  for (const [x, z] of [[-0.2, -0.47], [0.22, -0.46], [-0.46, 0.14], [0.5, 0.05]]) pine(x, z, r(0.85, 1.05));
  for (const [x, z] of [[-0.62, -0.4], [0.6, -0.44], [-0.72, 0.1], [0.72, 0.16], [0.1, -0.74]]) pine(x, z, r(0.75, 0.9));
  const scarfAt = snowman(0.14, 0.4);
  lamp(-0.06, 0.3); lamp(0.43, 0.3);
  add(frame(-0.3, 0.4, 0), puck, 0, groundY(-0.3, 0.4) - 0.001, 0, 0.09, 0.005, 0.09, "#a9c7de"); // a frozen pond
  // the railway round the village
  const TR = 0.62, ty = groundY(TR, 0);
  for (const rr of [TR - 0.014, TR + 0.014]) parts.push([new THREE.TorusGeometry(rr, 0.0035, 5, 120), new THREE.Matrix4().makeRotationX(Math.PI / 2).setPosition(0, ty + 0.006, 0), "#3a3a42"]);
  for (let i = 0; i < 64; i++) { const a = (i / 64) * Math.PI * 2; add(frame(Math.cos(a) * TR, Math.sin(a) * TR, Math.PI / 2 - a), box, 0, ty + 0.002, 0, 0.012, 0.004, 0.05, "#5a4030"); }
  const out = { village: mergeColored(THREE, parts), windows: mergeColored(THREE, windows), lamps, treeLights, scarfAt, trackR: TR, trackY: ty + 0.008 };
  [box, roof, cone7, cone4, ball, cyl, puck].forEach((g) => g.dispose());
  parts.forEach(([g]) => { if (g.type === "TorusGeometry") g.dispose(); });
  return out;
}
/** A little steam engine and its carriages, facing +x, standing on the rails at y = 0. */
function globeTrain(THREE) {
  const box = new THREE.BoxGeometry(1, 1, 1), cyl = new THREE.CylinderGeometry(1, 1, 1, 14), ball = new THREE.SphereGeometry(1, 10, 8);
  const Z = (x, y, z, sx, sy, sz, rot) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), rot ? new THREE.Quaternion().setFromEuler(rot) : new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  const alongX = new THREE.Euler(0, 0, Math.PI / 2), axle = new THREE.Euler(Math.PI / 2, 0, 0);
  const IRON = "#26262c", WHEEL = "#1c1c22", SNOW = "#f3f6fb", LIT = "#ffd98a";
  const wheels = (xs) => xs.flatMap((wx) => [-0.024, 0.024].map((wz) => [cyl, Z(wx, 0.013, wz, 0.013, 0.006, 0.013, axle), WHEEL]));
  const out = {
    engineAccent: mergeParts(THREE, [[cyl, Z(0.012, 0.036, 0, 0.022, 0.07, 0.022, alongX)], [box, Z(-0.04, 0.045, 0, 0.042, 0.05, 0.05)]]),
    engineDark: mergeColored(THREE, [
      [box, Z(-0.005, 0.01, 0, 0.12, 0.012, 0.042), IRON], [cyl, Z(0.035, 0.066, 0, 0.007, 0.03, 0.007), IRON], [cyl, Z(0.035, 0.083, 0, 0.011, 0.006, 0.011), IRON],
      [ball, Z(0.005, 0.058, 0, 0.009, 0.009, 0.009), "#d4a94a"], [box, Z(-0.04, 0.073, 0, 0.05, 0.006, 0.058), SNOW],
      [box, Z(0.062, 0.01, 0, 0.012, 0.014, 0.04, new THREE.Euler(0, 0, 0.5)), "#b8322c"],
      [box, Z(-0.03, 0.048, 0.026, 0.02, 0.02, 0.002), LIT], [box, Z(-0.03, 0.048, -0.026, 0.02, 0.02, 0.002), LIT],
      ...wheels([-0.04, -0.005, 0.03]),
    ]),
    carAccent: mergeParts(THREE, [[box, Z(0, 0.04, 0, 0.08, 0.042, 0.044)]]),
    carDark: mergeColored(THREE, [
      [box, Z(0, 0.01, 0, 0.086, 0.012, 0.04), IRON], [box, Z(0, 0.064, 0, 0.088, 0.008, 0.05), SNOW],
      ...[-0.024, 0, 0.024].flatMap((wx) => [[box, Z(wx, 0.045, 0.0225, 0.016, 0.016, 0.002), LIT], [box, Z(wx, 0.045, -0.0225, 0.016, 0.016, 0.002), LIT]]),
      ...wheels([-0.028, 0.028]),
    ]),
  };
  [box, cyl, ball].forEach((g) => g.dispose());
  return out;
}

function snowglobe(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(1225);
  const V = new THREE.Vector3();
  camera.fov = 32; camera.near = 0.1; camera.far = 120;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  const TAN = Math.tan((camera.fov * Math.PI) / 360);
  const C = new THREE.Vector3(0, 1.35, 0), R = 1, COLLAR = 0.6, TOP = 0.86; // the globe; where its wooden collar ends; the crown of the snow inside
  const sphereR = (y) => Math.sqrt(Math.max(0, R * R - (y - C.y) ** 2));
  const groundY = (x, z) => { const rr = Math.min(0.84, Math.hypot(x, z)); return TOP - 0.038 * (rr / 0.65) ** 2; };
  const time = { value: 0 };
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  const flat = keep(new THREE.PlaneGeometry(1, 1));
  flat.rotateX(-Math.PI / 2);
  const glow = keep(glowTexture(THREE));
  const world = new THREE.Scene(), inside = new THREE.Scene(); // the room, desk and base; the village and the snow in the water
  const LAMP = new THREE.Vector3(4, 5.2, 3.2), WINDOW = new THREE.Vector3(-5.5, 4.2, 1.2);

  /* --- the room: a painting out of focus, with fairy lights, snow falling outside the window and the lamp's glow --- */
  const roomMat = keep(new THREE.MeshBasicMaterial());
  const wall = new THREE.Mesh(quad, roomMat);
  world.add(wall);
  const RW = preview ? 800 : 1600, RH = preview ? 450 : 900, WALL_Z = -7;
  let roomTex = null;
  function buildRoom(dark) { // redrawn only when the theme flips
    roomTex?.dispose();
    roomTex = new THREE.CanvasTexture(rainBlur(globeRoom(RW, RH, dark), RW >> 1, RH >> 1, 2));
    roomTex.colorSpace = THREE.SRGBColorSpace;
    roomMat.map = roomTex; roomMat.needsUpdate = true;
  }
  const deco = new THREE.Group(); // in painting units: 16 × 9, origin at the bottom centre of the wall
  world.add(deco);
  const NB = 28, bulbs = [];
  const bulbGeo = keep(new THREE.PlaneGeometry(1, 1));
  const aLight = new THREE.InstancedBufferAttribute(new Float32Array(NB * 4), 4), aColor = new THREE.InstancedBufferAttribute(new Float32Array(NB * 4), 4);
  aColor.setUsage(THREE.DynamicDrawUsage);
  bulbGeo.setAttribute("aLight", aLight); bulbGeo.setAttribute("aColor", aColor);
  for (let i = 0; i < NB; i++) { // a string of fairy lights sagging across the top of the wall
    const u = -1 + (2 * i) / (NB - 1);
    aLight.setXYZW(i, u * 7.6, 5.55 - 0.5 * (1 - u * u) + r(-0.04, 0.04), 0.02, r(0.13, 0.2));
    bulbs.push({ accent: i % 5 === 2, phase: r(0, 6.28), speed: r(0.6, 1.4) });
  }
  const bulbMesh = new THREE.InstancedMesh(bulbGeo, keep(new THREE.ShaderMaterial({ uniforms: { uBokeh: { value: 1 } }, vertexShader: RAIN_LIGHT_VS, fragmentShader: RAIN_LIGHT_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })), NB);
  bulbMesh.frustumCulled = false; bulbMesh.position.z = 0.02; bulbMesh.renderOrder = 2;
  deco.add(bulbMesh);
  const NW = preview ? 0 : 46, wsPos = new Float32Array(Math.max(1, NW) * 3), wsDrift = [];
  for (let i = 0; i < NW; i++) { wsPos.set([r(-6.2, -2.2), r(3.1, 7.7), 0.03], i * 3); wsDrift.push([r(0.22, 0.45), r(0, 6.28)]); }
  const wsGeo = keep(new THREE.BufferGeometry());
  wsGeo.setAttribute("position", new THREE.BufferAttribute(wsPos, 3).setUsage(THREE.DynamicDrawUsage));
  const wsMat = keep(new THREE.PointsMaterial({ map: glow, size: 0.12, transparent: true, depthWrite: false }));
  const windowSnow = new THREE.Points(wsGeo, wsMat);
  windowSnow.frustumCulled = false; windowSnow.renderOrder = 1; windowSnow.visible = NW > 0;
  deco.add(windowSnow);
  // flat on the wall: a camera-facing sprite leans back into the wall when the camera looks down, and gets cut off along a line
  const lampGlowMat = keep(new THREE.MeshBasicMaterial({ map: glow, color: 0xffb865, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const lampGlow = new THREE.Mesh(quad, lampGlowMat);
  lampGlow.position.set(2.5, 3.8, 0.04); lampGlow.scale.set(3, 3, 1); lampGlow.renderOrder = 3;
  deco.add(lampGlow);

  /* --- the desk, and the globe's turned wooden base with brass rings and a plaque in the accent colour --- */
  const deskTex = keep(globeWood(THREE, 1024, 512, "#8b5b3c", 5151));
  deskTex.repeat.set(3, 1);
  const deskGeo = keep(new THREE.PlaneGeometry(40, 26));
  deskGeo.rotateX(-Math.PI / 2);
  const desk = new THREE.Mesh(deskGeo, keep(new THREE.MeshStandardMaterial({ map: deskTex, roughness: 0.55 })));
  desk.position.z = 6; // from the wall to well behind the camera
  world.add(desk);
  const baseTex = keep(globeWood(THREE, 512, 256, "#4b2f20", 77));
  baseTex.repeat.set(2, 1);
  const profile = [[0.001, 0], [1.02, 0], [1.06, 0.03], [1.05, 0.11], [0.99, 0.15], [0.95, 0.3], [0.9, 0.42], [0.85, 0.5], [0.8, 0.56], [0.77, 0.6], [0.66, 0.6], [0.62, 0.5]].map(([x, y]) => new THREE.Vector2(x, y));
  world.add(new THREE.Mesh(keep(new THREE.LatheGeometry(profile, preview ? 48 : 96)), keep(new THREE.MeshStandardMaterial({ map: baseTex, roughness: 0.38, side: THREE.DoubleSide }))));
  const brass = keep(new THREE.MeshPhongMaterial({ color: 0xc9a14a, specular: 0xfff0c8, shininess: 70 }));
  for (const [rad, tube, y] of [[1.04, 0.02, 0.125], [0.785, 0.016, 0.592]]) {
    const ring = new THREE.Mesh(keep(new THREE.TorusGeometry(rad, tube, 10, preview ? 64 : 128)), brass);
    ring.rotation.x = Math.PI / 2; ring.position.y = y;
    world.add(ring);
  }
  const plaqueCanvas = document.createElement("canvas");
  plaqueCanvas.width = 256; plaqueCanvas.height = 72;
  const plaqueTex = keep(new THREE.CanvasTexture(plaqueCanvas));
  plaqueTex.colorSpace = THREE.SRGBColorSpace;
  let plaqueKey = "";
  function drawPlaque(hex) {
    const g = plaqueCanvas.getContext("2d"), w = 256, h = 72;
    const gold = g.createLinearGradient(0, 0, 0, h);
    gold.addColorStop(0, "#f3d58a"); gold.addColorStop(0.5, "#b8862f"); gold.addColorStop(1, "#e2bd66");
    g.fillStyle = gold; g.fillRect(0, 0, w, h);
    const enamel = g.createLinearGradient(0, 8, 0, h - 8);
    enamel.addColorStop(0, hex); enamel.addColorStop(1, "#000000");
    g.fillStyle = hex; g.fillRect(8, 8, w - 16, h - 16);
    g.globalAlpha = 0.25; g.fillStyle = enamel; g.fillRect(8, 8, w - 16, h - 16); g.globalAlpha = 1;
    g.strokeStyle = "rgba(255,244,214,0.95)"; g.lineWidth = 3; g.lineCap = "round";
    for (const cx of [w / 2]) for (let k = 0; k < 6; k++) { // a snowflake: six arms with little branches
      const a = (k * Math.PI) / 3, ex = cx + Math.cos(a) * 22, ey = h / 2 + Math.sin(a) * 22;
      g.beginPath(); g.moveTo(cx, h / 2); g.lineTo(ex, ey); g.stroke();
      for (const [f, sgn] of [[0.55, 1], [0.55, -1]]) { const bx = cx + Math.cos(a) * 22 * f, by = h / 2 + Math.sin(a) * 22 * f; g.beginPath(); g.moveTo(bx, by); g.lineTo(bx + Math.cos(a + sgn * 0.8) * 8, by + Math.sin(a + sgn * 0.8) * 8); g.stroke(); }
    }
    for (const dx of [-70, 70]) { g.beginPath(); g.arc(w / 2 + dx, h / 2, 3, 0, 6.29); g.fillStyle = "rgba(255,244,214,0.9)"; g.fill(); }
    plaqueTex.needsUpdate = true;
  }
  const plaqueMat = keep(new THREE.MeshPhongMaterial({ map: plaqueTex, shininess: 80, specular: 0x999999 }));
  const plaque = new THREE.Mesh(keep(new THREE.BoxGeometry(0.44, 0.12, 0.02)), plaqueMat);
  plaque.position.set(0, 0.3, 0.96); plaque.rotation.x = -0.32;
  world.add(plaque);
  // a soft contact shadow, the globe's shadow away from the light, and the bright spot the water focuses into it
  const shadowTex = keep(glowTexture(THREE, "rgba(0,0,0,1)", "rgba(0,0,0,0)"));
  const contact = new THREE.Mesh(flat, keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.55, depthWrite: false })));
  contact.position.y = 0.002; contact.scale.set(2.9, 1, 2.9);
  const cast = new THREE.Mesh(flat, keep(new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: 0.32, depthWrite: false })));
  const causticMat = keep(new THREE.MeshBasicMaterial({ map: glow, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const caustic = new THREE.Mesh(flat, causticMat);
  contact.renderOrder = cast.renderOrder = 1; caustic.renderOrder = 2;
  world.add(contact, cast, caustic);
  const lightsFor = (sc) => { const L = { hemi: new THREE.HemisphereLight(0xffffff, 0x000000, 1), key: new THREE.DirectionalLight(0xffffff, 1), fill: new THREE.DirectionalLight(0xffffff, 1) }; sc.add(L.hemi, L.key, L.fill); return L; };
  const lights = [lightsFor(world), lightsFor(inside)];
  const lampPool = new THREE.PointLight(0xffb46a, 0, 14, 1.4); // at night the lamp on the sideboard lights the back of the desk
  lampPool.position.set(3.2, 2.4, -5.6);
  world.add(lampPool);
  const villageLight = new THREE.PointLight(0xffb45c, 0, 1.4, 1.6); // the village's own glow at night
  villageLight.position.set(0, 1.0, 0.05);
  inside.add(villageLight);

  /* --- inside the globe: the snowy ground, the village, the train, the snow --- */
  const vil = globeVillage(THREE, groundY, r);
  const villageMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.82, flatShading: true, side: THREE.DoubleSide }));
  inside.add(new THREE.Mesh(keep(vil.village), villageMat));
  const windowMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  inside.add(new THREE.Mesh(keep(vil.windows), windowMat));
  const groundProfile = [[0.001, TOP], [0.25, groundY(0.25, 0)], [0.45, groundY(0.45, 0)], [0.65, groundY(0.65, 0)], [sphereR(0.8) * 0.99, 0.8], [sphereR(0.7) * 0.99, 0.7], [sphereR(0.62) * 0.99, 0.62], [sphereR(0.57) * 0.99, 0.57]].map(([x, y]) => new THREE.Vector2(x, y));
  inside.add(new THREE.Mesh(keep(new THREE.LatheGeometry(groundProfile, preview ? 48 : 96)), keep(new THREE.MeshStandardMaterial({ color: 0xf3f6fb, roughness: 0.95, side: THREE.DoubleSide }))));
  const accentIn = keep(new THREE.MeshStandardMaterial({ roughness: 0.55 }));
  const scarfTorus = new THREE.TorusGeometry(0.027, 0.0075, 6, 18), scarfTail = new THREE.BoxGeometry(0.013, 0.036, 0.006);
  const scarf = new THREE.Mesh(keep(mergeParts(THREE, [[scarfTorus, new THREE.Matrix4().makeRotationX(Math.PI / 2)], [scarfTail, new THREE.Matrix4().compose(new THREE.Vector3(0.012, -0.018, 0.028), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, 0, 0.25)), new THREE.Vector3(1, 1, 1))]])), accentIn);
  scarfTorus.dispose(); scarfTail.dispose();
  scarf.matrixAutoUpdate = false; scarf.matrix.copy(vil.scarfAt); // round the snowman's neck
  inside.add(scarf);
  const trainGeo = globeTrain(THREE);
  Object.values(trainGeo).forEach(keep);
  const trainMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, flatShading: true }));
  const cars = [[trainGeo.engineAccent, trainGeo.engineDark], [trainGeo.carAccent, trainGeo.carDark], [trainGeo.carAccent, trainGeo.carDark]].map(([a, d]) => {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(a, accentIn), new THREE.Mesh(d, trainMat));
    inside.add(g);
    return g;
  });
  const SPACING = 0.115 / vil.trackR;
  let trainAngle = r(0, 6.28);
  const headMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffe2a8, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const headlight = new THREE.Sprite(headMat);
  headlight.scale.setScalar(0.07);
  inside.add(headlight);
  const puffs = [];
  for (let i = 0; i < 7; i++) { const m = keep(new THREE.SpriteMaterial({ map: glow, transparent: true, opacity: 0, depthWrite: false })); const s = new THREE.Sprite(m); inside.add(s); puffs.push({ s, m, age: 99 }); }
  let puffT = 0;
  const lampMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffc46e, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  vil.lamps.forEach((p) => { const s = new THREE.Sprite(lampMat); s.position.copy(p); s.scale.setScalar(0.09); inside.add(s); });
  const NT = vil.treeLights.length, tlPos = new Float32Array(NT * 3), tlCol = new Float32Array(NT * 3);
  vil.treeLights.forEach((p, i) => tlPos.set([p.x, p.y, p.z], i * 3));
  const tlGeo = keep(new THREE.BufferGeometry());
  tlGeo.setAttribute("position", new THREE.BufferAttribute(tlPos, 3));
  tlGeo.setAttribute("color", new THREE.BufferAttribute(tlCol, 3).setUsage(THREE.DynamicDrawUsage));
  const tlMat = keep(new THREE.PointsMaterial({ map: glow, size: 0.05, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  inside.add(new THREE.Points(tlGeo, tlMat));
  const TL = ["#ffd27a", "#ff6b6b", "#7bd88f", "#ffe9b0", "#6fb7ff"].map((c) => new THREE.Color(c));

  // the snow: resting on the ground or drifting in the water; the glitter catches the light
  const NF = preview ? 320 : 1100, RI = 0.94;
  const fx = new Float32Array(NF), fy = new Float32Array(NF), fz = new Float32Array(NF), vx = new Float32Array(NF), vy = new Float32Array(NF), vz = new Float32Array(NF), fall = new Float32Array(NF);
  const rest = new Uint8Array(NF), flakePos = new Float32Array(NF * 3), flakeAttr = new Float32Array(NF * 3);
  function place(i, onGround) {
    for (let k = 0; k < 30; k++) {
      const x = r(-RI, RI), y = C.y + r(-RI, RI), z = r(-RI, RI);
      if (x * x + (y - C.y) ** 2 + z * z > RI * RI) continue;
      if (onGround) { if (Math.hypot(x, z) > 0.8) continue; fx[i] = x; fz[i] = z; fy[i] = groundY(x, z) + 0.004; rest[i] = 1; return; }
      if (y > groundY(x, z) + 0.03) { fx[i] = x; fy[i] = y; fz[i] = z; rest[i] = 0; return; }
    }
    fx[i] = 0; fy[i] = C.y; fz[i] = 0; rest[i] = 0;
  }
  for (let i = 0; i < NF; i++) {
    place(i, r() < 0.45);
    fall[i] = r(0.05, 0.12);
    const kind = r() < 0.12 ? 1 : r() < 0.07 ? 2 : 0;
    flakeAttr.set([kind ? r(0.013, 0.02) : r(0.012, 0.026), kind, r(0, 1)], i * 3);
  }
  const snowGeo = keep(new THREE.BufferGeometry());
  snowGeo.setAttribute("position", new THREE.BufferAttribute(flakePos, 3).setUsage(THREE.DynamicDrawUsage));
  snowGeo.setAttribute("aFlake", new THREE.BufferAttribute(flakeAttr, 3));
  const snowUni = { uPx: { value: 700 }, uTime: time, uSnow: { value: new THREE.Color() }, uGold: { value: new THREE.Color() }, uAccent: { value: new THREE.Color() } };
  const snow = new THREE.Points(snowGeo, keep(new THREE.ShaderMaterial({ uniforms: snowUni, vertexShader: GLOBE_SNOW_VS, fragmentShader: GLOBE_SNOW_FS, transparent: true, depthWrite: false })));
  snow.frustumCulled = false; snow.renderOrder = 5;
  const buf = new THREE.Vector2();
  snow.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); snowUni.uPx.value = buf.y / (2 * TAN); };
  inside.add(snow);
  let energy = 1.1, spin = 0.8; // how stirred up the water is, and which way it turns
  function stepSnow(dt, t) {
    energy *= Math.exp(-dt / 2.4);
    spin *= Math.exp(-dt / 3.2);
    const k = Math.min(1, dt * 2.2);
    for (let i = 0; i < NF; i++) {
      let x = fx[i], y = fy[i], z = fz[i];
      if (rest[i]) { // lying on the ground: a strong enough stir lifts it again
        if (energy > 0.3 && r() < (energy - 0.25) * dt * 3) { rest[i] = 0; vy[i] = r(0.25, 0.6) * energy; vx[i] = -z * spin * 0.6; vz[i] = x * spin * 0.6; } else continue;
      }
      // the water rolls like a real shaken globe (Hill's spherical vortex: up through the middle, out along the top,
      // down the glass, back in along the bottom, never through the glass), turns round the middle, and is churned a little
      const hx = x / RI, hy = (y - C.y) / RI, hz = z / RI, A = energy * 0.75;
      const ur = A * hy, uy = A * (1 - 2 * (hx * hx + hz * hz) - hy * hy);
      const tw = energy * 0.3, wob = 0.012 * Math.sin(t * 0.7 + i * 1.3); // churn while stirred; a gentle drift as it falls
      const tx = tw * Math.sin(4.1 * y + 2.3 * t) * Math.cos(3.7 * z) + wob, tz = tw * Math.sin(3.3 * x - 1.9 * t) * Math.cos(4.3 * y) + wob * Math.cos(i);
      const ty = tw * Math.sin(3.9 * z + 1.3 * t) * Math.cos(3.1 * x);
      vx[i] += (-z * spin + ur * hx + tx - vx[i]) * k;
      vz[i] += (x * spin + ur * hz + tz - vz[i]) * k;
      vy[i] += (uy + ty - fall[i] - vy[i]) * k;
      x += vx[i] * dt; y += vy[i] * dt; z += vz[i] * dt;
      let qx = x, qy = y - C.y, qz = z;
      const d = Math.hypot(qx, qy, qz);
      if (d > RI) { // the glass
        const s = RI / d; qx *= s; qy *= s; qz *= s; x = qx; y = C.y + qy; z = qz;
        const vn = (vx[i] * qx + vy[i] * qy + vz[i] * qz) / RI;
        if (vn > 0) { vx[i] -= (vn * qx) / RI; vy[i] -= (vn * qy) / RI; vz[i] -= (vn * qz) / RI; }
      }
      const g = groundY(x, z) + 0.004;
      if (y < g) { y = g; if (energy < 0.3) { rest[i] = 1; vx[i] = vy[i] = vz[i] = 0; } else vy[i] = Math.abs(vy[i]) * 0.25; }
      fx[i] = x; fy[i] = y; fz[i] = z;
    }
    for (let i = 0; i < NF; i++) { flakePos[i * 3] = fx[i]; flakePos[i * 3 + 1] = fy[i]; flakePos[i * 3 + 2] = fz[i]; }
    snowGeo.attributes.position.needsUpdate = true;
  }
  for (let i = 0; i < 150; i++) stepSnow(1 / 60, i / 60); // it was shaken a moment ago: the still frame is snowing

  // the mouse shakes it: how far it moved stirs the water, which way it went turns it
  let moved = 0, swirlIn = 0, lastX = null, lastY = null, lastT = 0, idle = 0;
  const onMove = (e) => {
    if (lastX !== null && e.timeStamp - lastT < 250) { const dx = e.clientX - lastX, dy = e.clientY - lastY; moved += Math.hypot(dx, dy); swirlIn += dx; }
    lastX = e.clientX; lastY = e.clientY; lastT = e.timeStamp;
  };
  if (!preview) window.addEventListener("pointermove", onMove, { passive: true });

  /* --- the passes: the room into one picture, the inside of the globe into another, then the glass over both --- */
  const rtOpts = { samples: preview ? 0 : 4 };
  const worldRT = keep(new THREE.WebGLRenderTarget(4, 4, { ...rtOpts, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter })), insideRT = keep(new THREE.WebGLRenderTarget(4, 4, rtOpts));
  worldRT.texture.colorSpace = insideRT.texture.colorSpace = THREE.SRGBColorSpace;
  const glassUni = {
    tWorld: { value: worldRT.texture }, tInside: { value: insideRT.texture },
    uInvProj: { value: new THREE.Matrix4() }, uCamWorld: { value: new THREE.Matrix4() }, uViewProj: { value: new THREE.Matrix4() },
    uCentre: { value: C }, uR: { value: R }, uCollarY: { value: COLLAR }, uIor: { value: 1.13 }, uIorIn: { value: 1.2 }, // gentler than water: true water turns the whole desk upside down into the top half
    uTint: { value: new THREE.Color() }, uRoom: { value: new THREE.Color() }, uLampDir: { value: LAMP.clone().normalize() }, uLamp: { value: new THREE.Color() },
    uWinDir: { value: new THREE.Vector3(-1.3, 0.8, 1.2).normalize() }, uWin: { value: new THREE.Color() },
  };
  const glass = new THREE.Mesh(quad, keep(new THREE.ShaderMaterial({ uniforms: glassUni, vertexShader: RAIN_GLASS_VS, fragmentShader: GLOBE_GLASS_FS, depthTest: false, depthWrite: false })));
  glass.frustumCulled = false;
  scene.add(glass);
  const prevClear = new THREE.Color();
  const fit = (rt, w, h) => { if (rt.width !== w || rt.height !== h) rt.setSize(w, h); };
  glass.onBeforeRender = (renderer) => {
    renderer.getDrawingBufferSize(buf);
    const w = Math.max(2, Math.round(buf.x)), h = Math.max(2, Math.round(buf.y));
    fit(worldRT, w, h); fit(insideRT, w, h);
    glassUni.uInvProj.value.copy(camera.projectionMatrixInverse);
    glassUni.uCamWorld.value.copy(camera.matrixWorld);
    glassUni.uViewProj.value.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    const before = renderer.getRenderTarget(), alpha = renderer.getClearAlpha();
    renderer.getClearColor(prevClear);
    renderer.setClearColor(0x000000, 1);
    renderer.setRenderTarget(worldRT); renderer.render(world, camera);
    renderer.setClearColor(0x000000, 0);
    renderer.setRenderTarget(insideRT); renderer.render(inside, camera);
    renderer.setClearColor(prevClear, alpha);
    renderer.setRenderTarget(before);
  };

  /* --- day and night, and the accent --- */
  let themeDark = null;
  const warm = new THREE.Color("#ffd9a0"), accent = new THREE.Color();
  function applyPalette(p) {
    const d = p.dark;
    if (themeDark !== d) { themeDark = d; buildRoom(d); }
    pal = p;
    accent.set(p.accent);
    for (const L of lights) {
      L.hemi.color.set(d ? "#6d5f78" : "#f4f2ee"); L.hemi.groundColor.set(d ? "#1c1411" : "#b9a78e"); L.hemi.intensity = d ? 0.55 : 1.05;
      L.key.color.set(d ? "#ffc27a" : "#f3f7ff"); L.key.intensity = d ? 2.6 : 2.1; L.key.position.copy(d ? LAMP : WINDOW);
      L.fill.color.set(d ? "#7d93d8" : "#ffe3c0"); L.fill.intensity = d ? 0.35 : 0.45; L.fill.position.copy(d ? WINDOW : LAMP);
    }
    villageLight.intensity = d ? 0.9 : 0;
    lampPool.intensity = d ? 18 : 0;
    windowMat.color.set(d ? "#ffffff" : "#70747c").multiplyScalar(d ? 1.5 : 1);
    lampMat.opacity = d ? 0.85 : 0; headMat.opacity = d ? 0.9 : 0; tlMat.opacity = d ? 1 : 0.3; lampGlowMat.opacity = d ? 0.55 : 0;
    wsMat.color.set(d ? "#dfe8ff" : "#ffffff"); wsMat.opacity = d ? 0.5 : 0.65;
    snowUni.uSnow.value.set(d ? "#e9eefb" : "#ffffff"); snowUni.uGold.value.set(d ? "#ffcf73" : "#e8bf5e"); snowUni.uAccent.value.copy(accent);
    accentIn.color.copy(accent);
    if (plaqueKey !== p.accent) { plaqueKey = p.accent; drawPlaque(p.accent); }
    glassUni.uTint.value.set(d ? "#dce9f5" : "#d3e5ec"); // water and glass: a cool tint, a little light lost on the way through
    glassUni.uRoom.value.set(d ? "#120c0b" : "#6d6a66");
    glassUni.uLamp.value.set(d ? "#ffcb8a" : "#fff4e4").multiplyScalar(d ? 1.3 : 0.5);
    glassUni.uWin.value.set(d ? "#6f84b8" : "#ffffff").multiplyScalar(d ? 0.45 : 0.9);
    // the globe's shadow falls away from the light; the water focuses that light into a bright spot inside it
    const L = (d ? LAMP : WINDOW).clone().normalize(), ox = (-L.x / L.y) * C.y, oz = (-L.z / L.y) * C.y;
    cast.position.set(ox * 0.8, 0.003, oz * 0.8); cast.rotation.y = Math.atan2(-oz, ox); cast.scale.set(2.8, 1, 1.9);
    caustic.position.set(ox * 0.95, 0.004, oz * 0.95); caustic.rotation.y = cast.rotation.y; caustic.scale.set(0.75, 1, 0.42);
    causticMat.color.set(d ? "#ffc27a" : "#fff5e0"); causticMat.opacity = d ? 0.5 : 0.28;
  }
  applyPalette(pal);

  const target = new THREE.Vector3(0, 1.32, 0);
  function placeCamera(t) {
    const A = camera.aspect || 1, pitch = 0.13, yaw = Math.sin(t * 0.06) * 0.11; // a slow sway: the room slides behind the glass
    const dist = Math.max(6.4, 1.32 / (TAN * A)); // portrait phones step back until the whole globe fits
    camera.position.set(Math.sin(yaw) * Math.cos(pitch) * dist, target.y + Math.sin(pitch) * dist, Math.cos(yaw) * Math.cos(pitch) * dist);
    camera.lookAt(target);
    const toWall = camera.position.z - WALL_Z, halfW = toWall * TAN * A;
    const top = camera.position.y + Math.tan(Math.atan(TAN) - pitch) * toWall;
    const s = Math.max(1, (2.3 * halfW) / 16, (1.15 * top) / (9 - 1.7)); // the wall always covers the view
    const sink = 1.7 * s; // the bottom of the painting (the wainscoting) sits behind the desk
    wall.scale.set(16 * s, 9 * s, 1); wall.position.set(0, 4.5 * s - sink, WALL_Z);
    deco.scale.set(s, s, 1); deco.position.set(0, -sink, WALL_Z);
    wsMat.size = 0.12 * s;
  }
  function frame(dt, t) {
    time.value = t;
    placeCamera(t);
    if (moved > 0) {
      energy = Math.min(1.6, energy + moved * 0.0005);
      spin = Math.max(-2.6, Math.min(2.6, spin + swirlIn * 0.0014));
      moved = 0; swirlIn = 0; idle = 0;
    } else if ((idle += dt) > (preview ? 7 : 40)) { // nobody about: now and then it gets a gentle shake anyway
      energy = Math.min(1.6, energy + 0.95); spin += (r() < 0.5 ? -1 : 1) * 1.3; idle = 0;
    }
    stepSnow(dt, t);
    trainAngle += dt * 0.24;
    cars.forEach((g, k) => { const a = trainAngle - k * SPACING; g.position.set(Math.cos(a) * vil.trackR, vil.trackY, Math.sin(a) * vil.trackR); g.rotation.y = -(a + Math.PI / 2); });
    cars[0].updateMatrixWorld();
    headlight.position.copy(V.set(0.075, 0.035, 0).applyMatrix4(cars[0].matrixWorld));
    if ((puffT += dt) > 0.42) { // steam from the chimney
      puffT = 0;
      const p = puffs.find((q) => q.age >= 2.2) || puffs[0];
      p.age = 0; p.s.position.copy(V.set(0.035, 0.1, 0).applyMatrix4(cars[0].matrixWorld));
    }
    for (const p of puffs) {
      if (p.age >= 2.2) { p.m.opacity = 0; continue; }
      p.age += dt; p.s.position.y += dt * 0.05;
      const f = Math.min(1, p.age / 2.2);
      p.s.scale.setScalar(0.03 + f * 0.07);
      p.m.opacity = Math.sin(Math.PI * f) * (pal.dark ? 0.35 : 0.6);
    }
    for (let i = 0; i < NT; i++) { const c = TL[i % TL.length], b = 0.55 + 0.45 * Math.sin(t * 2.2 + i * 1.7); tlCol[i * 3] = c.r * b; tlCol[i * 3 + 1] = c.g * b; tlCol[i * 3 + 2] = c.b * b; }
    tlGeo.attributes.color.needsUpdate = true;
    bulbs.forEach((b, i) => { const c = b.accent ? accent : warm; aColor.setXYZW(i, c.r, c.g, c.b, (0.75 + 0.25 * Math.sin(t * b.speed + b.phase)) * (pal.dark ? 0.9 : 0.12)); });
    aColor.needsUpdate = true;
    for (let i = 0; i < NW; i++) { // snow falling outside the window
      let y = wsPos[i * 3 + 1] - dt * wsDrift[i][0];
      if (y < 3.1) y = 7.7;
      wsPos[i * 3 + 1] = y; wsPos[i * 3] += Math.sin(t * 0.8 + wsDrift[i][1]) * dt * 0.08;
    }
    wsGeo.attributes.position.needsUpdate = NW > 0;
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { let n = 0; for (let i = 0; i < NF; i++) n += rest[i]; return { flakes: NF, resting: n, energy: +energy.toFixed(2), spin: +spin.toFixed(2) }; }, // for checking by hand
    shake(amount = 1) { energy = Math.min(1.6, energy + amount); spin += amount; },
    dispose() { window.removeEventListener("pointermove", onMove); roomTex?.dispose(); disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Lighthouse: a storm at night (the beam sweeping through the rain, waves breaking on the rocks, lightning); by day the calm after it ---------- */
// One tileable noise texture (two independent fbm channels) does the clouds, the ripples, the foam and the haze in the beams.
const LH_SKY_VS = /* glsl */ `
  varying vec3 vDir;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vDir = w.xyz - cameraPosition; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const LH_SKY_FS = /* glsl */ `
  uniform sampler2D uNoise; uniform float uTime;
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uCloudDark; uniform vec3 uCloudLight; uniform float uCover;
  uniform vec3 uOrbDir; uniform vec3 uOrbCol; uniform float uOrbSize; uniform float uFlash; uniform vec3 uFlashDir;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    float h = max(d.y, 0.0);
    vec3 col = mix(uHorizon, uZenith, pow(smoothstep(-0.02, 0.6, h), 0.8));
    // a deck of cloud overhead, squeezed together towards the horizon, drifting with the wind
    vec2 p = d.xz / (h + 0.08) * 0.15 - vec2(uTime * 0.0016, uTime * 0.0006);
    float n = texture2D(uNoise, p).r * 0.6 + texture2D(uNoise, p * 2.7 + 0.37).g * 0.4;
    float cover = smoothstep(1.0 - uCover, 1.0 - uCover + 0.28, n) * smoothstep(-0.01, 0.12, d.y);
    vec3 cloud = mix(uCloudDark, uCloudLight, smoothstep(0.35, 0.85, texture2D(uNoise, p * 1.6 + 0.61).r));
    cloud += vec3(0.7, 0.78, 1.0) * uFlash * (0.25 + 2.6 * exp(-distance(d, uFlashDir) * 3.5)) * (0.3 + n); // lightning inside the clouds
    col += vec3(0.4, 0.46, 0.66) * uFlash * 0.15;
    float od = distance(d, uOrbDir);
    col += uOrbCol * (smoothstep(uOrbSize, uOrbSize * 0.8, od) + 0.35 * exp(-od * 8.0)) * (1.0 - cover * 0.92); // the sun, or the moon behind the storm
    col = mix(col, cloud, cover);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// the sea: five Gerstner waves (the spray and the ship read the same ones on the CPU), ripples, foam, the lamp and the beams on it
const LH_SEA_VS = /* glsl */ `
  uniform float uTime; uniform vec4 uWave[8]; uniform float uSteep[8]; uniform float uAmp; uniform float uSteepSum;
  varying vec3 vWorld; varying vec3 vNormal; varying float vCrest; varying float vDist;
  void main() {
    vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
    float dist = length(p.xz - cameraPosition.xz);
    vec3 q = p, n = vec3(0.0, 1.0, 0.0);
    float crest = 0.0;
    for (int i = 0; i < 8; i++) {
      vec4 w = uWave[i];
      float k = w.z, L = 6.2832 / k;
      float att = 1.0 - smoothstep(L * 3.0, L * 6.0, dist); // a wave finer than the grid out there melts away (instead of a moiré)
      float A = w.w * uAmp * att, s = uSteep[i] * uAmp * att;
      float th = k * dot(w.xy, p.xz) - sqrt(9.8 * k) * uTime;
      float c = cos(th), sn = sin(th);
      q.x += s / k * w.x * c; q.z += s / k * w.y * c; q.y += A * sn;
      n.x -= w.x * k * A * c; n.z -= w.y * k * A * c; n.y -= s * sn;
      crest += s * sn; // where the surface bunches up into a sharp crest: whitecaps
    }
    vWorld = q; vNormal = n; vCrest = crest / uSteepSum; vDist = dist;
    gl_Position = projectionMatrix * viewMatrix * vec4(q, 1.0);
  }
`;
const LH_SEA_FS = /* glsl */ `
  uniform sampler2D uNoise; uniform float uTime; uniform vec3 uDeep; uniform vec3 uScatter; uniform vec3 uZenith; uniform vec3 uHorizon;
  uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar; uniform float uRipple; uniform float uRippleScale; uniform float uReflect;
  uniform vec3 uOrbDir; uniform vec3 uOrbCol; uniform float uGlitter;
  uniform vec3 uLampPos; uniform vec3 uLampCol; uniform float uLampOn; uniform float uGlint; uniform vec3 uShipPos; uniform vec3 uShipCol;
  uniform vec3 uBeamA; uniform vec3 uBeamB; uniform vec2 uBeamCos; uniform float uBeamOn; uniform float uFlash; uniform vec3 uFoamCol; uniform float uFoamOn; uniform vec4 uRocks[2];
  varying vec3 vWorld; varying vec3 vNormal; varying float vCrest; varying float vDist;
  float beamAt(vec3 p) { vec3 d = normalize(p - uLampPos); return max(smoothstep(uBeamCos.x, uBeamCos.y, dot(d, uBeamA)), smoothstep(uBeamCos.x, uBeamCos.y, dot(d, uBeamB))); }
  void main() {
    vec3 N = normalize(vNormal);
    float near = 1.0 - smoothstep(40.0, 400.0, vDist);
    vec2 uv = vWorld.xz, ru = uv * uRippleScale; // a calm sea only has small ripples
    // three layers, each turned its own way so the tile never lines up; each fades out where it gets finer than the pixels (moiré)
    float fine = vDist * uRippleScale;
    vec2 rp = (texture2D(uNoise, mat2(0.825, 0.565, -0.565, 0.825) * ru * 0.07 + vec2(uTime * 0.013, uTime * 0.021)).rg - 0.5) * 0.9 * (1.0 - smoothstep(80.0, 260.0, fine))
      + (texture2D(uNoise, mat2(0.454, -0.891, 0.891, 0.454) * ru * 0.19 - vec2(uTime * 0.027, uTime * 0.011)).gr - 0.5) * 0.6 * (1.0 - smoothstep(30.0, 100.0, fine))
      + (texture2D(uNoise, mat2(-0.667, 0.745, -0.745, -0.667) * uv * 0.017 + vec2(uTime * 0.004, 0.0)).rg - 0.5) * 0.5; // gusts: always the broad scale
    N = normalize(N + vec3(rp.x, 0.0, rp.y) * uRipple); // chop and ripples on the swell (far off the mipmaps smooth them out)
    vec3 V = normalize(cameraPosition - vWorld);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 R = reflect(-V, N);
    R.y = abs(R.y);
    vec3 col = mix(uDeep + uScatter * smoothstep(0.05, 0.6, vCrest), mix(uHorizon, uZenith, smoothstep(0.0, 0.5, R.y)), fres * uReflect);
    float rough = smoothstep(15.0, 600.0, vDist); // further off the ripples are too small to see: one broad, softer highlight
    col += uOrbCol * pow(max(dot(R, uOrbDir), 0.0), mix(380.0, 70.0, rough)) * uGlitter * mix(1.0, 0.3, rough); // glitter on the water
    vec3 toL = uLampPos - vWorld;
    float dl = length(toL);
    col += uLampCol * uLampOn * (pow(max(dot(R, toL / dl), 0.0), mix(700.0, 160.0, rough)) * (0.1 + 0.9 * uGlint) * mix(1.0, 0.45, rough) + 6.0 / (dl * dl + 120.0)); // the lamp's broken path on the water (flaring as a beam swings past), a little glow round the rocks
    col += uShipCol * pow(max(dot(R, normalize(uShipPos - vWorld)), 0.0), 900.0) * 1.2;
    col += uLampCol * uBeamOn * beamAt(vWorld) * 0.2; // where a beam sweeps low over the water, far out
    float fn = texture2D(uNoise, uv * 0.05 + vec2(uTime * 0.01, 0.0)).r, fd = texture2D(uNoise, uv * 0.21 - vec2(0.0, uTime * 0.02)).g;
    float patches = smoothstep(0.38, 0.62, texture2D(uNoise, uv * 0.023 + vec2(0.0, uTime * 0.006)).g); // whitecaps come and go along a crest
    float foam = smoothstep(0.24, 0.52, vCrest + (fn - 0.5) * 0.4) * (0.3 + 0.7 * fd) * (0.25 + 0.75 * patches) * near * uFoamOn;
    for (int i = 0; i < 2; i++) { // white water round the rocks
      float d = distance(vWorld.xz, uRocks[i].xy) - uRocks[i].z;
      foam = max(foam, (1.0 - smoothstep(0.0, 10.0, d)) * uRocks[i].w * smoothstep(0.3, 0.65, texture2D(uNoise, uv * 0.09 - uTime * 0.03).g * 0.8 + (1.0 - smoothstep(-2.0, 5.0, d)) * 0.5));
    }
    col = mix(col, uFoamCol * (1.0 + uFlash * 1.2), clamp(foam, 0.0, 1.0) * 0.85);
    col += vec3(0.5, 0.6, 0.85) * uFlash * 0.2 * (0.3 + fres);
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, vDist));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// a beam: an open cone from the lamp, bright through the middle of the shaft and soft at its edges, the rain and mist drifting through it
const LH_BEAM_VS = /* glsl */ `
  uniform float uLen;
  varying float vT; varying vec3 vWorld; varying vec3 vN; varying vec3 vAxis;
  void main() {
    vT = position.y / uLen;
    vec4 w = modelMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix) * normal);
    vAxis = normalize(mat3(modelMatrix) * vec3(0.0, 1.0, 0.0));
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const LH_BEAM_FS = /* glsl */ `
  uniform sampler2D uNoise; uniform vec3 uColor; uniform float uStrength; uniform float uTime;
  varying float vT; varying vec3 vWorld; varying vec3 vN; varying vec3 vAxis;
  void main() {
    vec3 V = normalize(cameraPosition - vWorld);
    float body = pow(abs(dot(normalize(vN), V)), 2.2);
    float along = pow(1.0 - vT, 2.6) * smoothstep(0.0, 0.01, vT);
    float haze = 0.45 + 1.1 * texture2D(uNoise, vWorld.xz * 0.012 - vec2(uTime * 0.02, 0.0)).r * texture2D(uNoise, vec2(vWorld.x + vWorld.z, vWorld.y) * 0.02 + vec2(0.0, uTime * 0.05)).g;
    haze *= 0.8 + 0.4 * texture2D(uNoise, vec2((vWorld.x - vWorld.z) * 0.07 + vWorld.y * 0.01, vWorld.y * 0.01 + uTime * 0.3)).r; // rain streaking down through the light
    float fwd = 1.0 + 3.0 * pow(max(dot(V, vAxis), 0.0), 8.0); // brighter when it swings towards you
    gl_FragColor = vec4(uColor * body * along * haze * fwd * uStrength, 1.0);
  }
`;
// rain round the viewer: streaks falling on the wind; a drop inside a beam lights up
const LH_RAIN_VS = /* glsl */ `
  uniform float uTime; uniform vec3 uFall; uniform float uLen; uniform float uWidth; uniform float uPix;
  uniform vec3 uLampPos; uniform vec3 uBeamA; uniform vec3 uBeamB; uniform vec2 uBeamCos; uniform float uBeamOn; uniform float uFlash;
  attribute vec4 aDrop; attribute vec3 aBoxC; attribute vec3 aBoxS;
  varying float vAcross; varying float vAlong; varying float vLight; varying float vBeam; varying float vFade;
  void main() {
    vec3 vel = uFall * aDrop.w;
    vec3 p = aBoxC + mod(aDrop.xyz * aBoxS + vel * uTime, aBoxS) - aBoxS * 0.5;
    vec3 tail = p - normalize(vel) * uLen * aDrop.w;
    vec4 a = viewMatrix * vec4(p, 1.0), b = viewMatrix * vec4(tail, 1.0);
    vec2 s = normalize(b.xy - a.xy + vec2(1e-5, 0.0));
    float w = max(uWidth, uPix * -a.z); // never thinner than a pixel
    vec4 v = mix(a, b, position.y);
    v.xy += vec2(-s.y, s.x) * w * position.x;
    gl_Position = projectionMatrix * v;
    vec3 d = normalize(p - uLampPos);
    vBeam = uBeamOn * max(smoothstep(uBeamCos.x, uBeamCos.y, dot(d, uBeamA)), smoothstep(uBeamCos.x, uBeamCos.y, dot(d, uBeamB))) * 4.0 / (1.0 + distance(p, uLampPos) * 0.015);
    vLight = 1.0 + uFlash * 2.5;
    vFade = uWidth / w * smoothstep(0.6, 3.0, -a.z); // a pixel-wide streak far off is fainter; one right against the eye is gone
    vAcross = position.x; vAlong = position.y;
  }
`;
const LH_RAIN_FS = /* glsl */ `
  uniform vec3 uColor; uniform vec3 uBeamCol; uniform float uAlpha;
  varying float vAcross; varying float vAlong; varying float vLight; varying float vBeam; varying float vFade;
  void main() {
    float a = (1.0 - abs(vAcross) * 2.0) * sin(vAlong * 3.14159);
    gl_FragColor = vec4(uColor * vLight + uBeamCol * vBeam, a * uAlpha * max(vFade, min(1.0, vBeam)));
    #include <colorspace_fragment>
  }
`;
// the rain the beams light up. Only the drops near the two beams are drawn: every instance shows one cell of a grid fixed round
// the lamp (angle × distance), so the drops stay put while a beam sweeps across them, and new cells come in dark at its leading edge
const LH_BEAMRAIN_VS = /* glsl */ `
  uniform float uTime; uniform float uPhi; uniform vec3 uLamp; uniform float uTilt; uniform float uCone; uniform float uCell; uniform float uCells;
  uniform float uR0; uniform float uRatio; uniform float uSpeed; uniform vec2 uDrift; uniform float uLen; uniform float uPix;
  uniform vec3 uBeamA; uniform vec3 uBeamB;
  attribute vec4 aSlot; // slot across the beam, ring, drop in the cell, which beam
  varying float vAcross; varying float vAlong; varying float vBeam;
  float h1(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
  void main() {
    float c = mod(floor((uPhi + aSlot.w * 3.14159265 - uCone * 1.4) / uCell) + aSlot.x, uCells);
    float r0 = uR0 * pow(uRatio, aSlot.y + 0.5);
    float band = 2.8 * r0 * tan(uCone) + 1.5; // the height of the beam out there, and a little more
    vec3 seed = vec3(c, aSlot.y, aSlot.z);
    float ph = h1(seed + 3.1) * band + uSpeed * (0.85 + 0.3 * h1(seed + 5.3)) * uTime;
    float cyc = floor(ph / band), f = ph - cyc * band;
    vec3 s2 = seed + vec3(0.0, 0.0, cyc * 7.0); // every fall a new drop somewhere else in the cell
    float th = (c + h1(s2)) * uCell, rr = uR0 * pow(uRatio, aSlot.y + h1(s2 + 1.7));
    vec3 p = uLamp + vec3(sin(th) * rr, rr * tan(uTilt) + band * 0.5 - f, -cos(th) * rr);
    p.xz += uDrift * f;
    vec3 d = normalize(p - uLamp);
    float lit = max(smoothstep(cos(uCone * 1.25), cos(uCone * 0.4), dot(d, uBeamA)), smoothstep(cos(uCone * 1.25), cos(uCone * 0.4), dot(d, uBeamB)));
    lit *= step(h1(s2 + 9.1), clamp(pow(rr / 70.0, 1.5), 0.06, 1.0)); // fewer drops close to the lamp, where the cells are tiny
    vBeam = lit * 3.0 / (1.0 + rr * 0.012);
    vec3 vel = normalize(vec3(uDrift.x, -1.0, uDrift.y));
    vec4 a = viewMatrix * vec4(p, 1.0), b = viewMatrix * vec4(p - vel * uLen, 1.0);
    vec2 s = normalize(b.xy - a.xy + vec2(1e-5, 0.0));
    vec4 v = mix(a, b, position.y);
    v.xy += vec2(-s.y, s.x) * max(0.02, uPix * -a.z) * position.x;
    gl_Position = vBeam > 0.001 ? projectionMatrix * v : vec4(2.0, 2.0, 2.0, 1.0); // dark drops are not drawn at all
    vAcross = position.x; vAlong = position.y;
  }
`;
const LH_BEAMRAIN_FS = /* glsl */ `
  uniform vec3 uColor;
  varying float vAcross; varying float vAlong; varying float vBeam;
  void main() { gl_FragColor = vec4(uColor * vBeam * (1.0 - abs(vAcross) * 2.0) * sin(vAlong * 3.14159), 1.0); }
`;
const LH_SPRAY_VS = /* glsl */ `
  uniform float uPx;
  attribute float aSize; attribute float aLife;
  varying float vLife;
  void main() {
    vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aLife > 0.0 ? clamp(aSize * uPx / -mv.z, 1.0, 96.0) : 0.0;
  }
`;
const LH_SPRAY_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uFlash; uniform float uAlpha;
  varying float vLife;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0 || vLife <= 0.0) discard;
    gl_FragColor = vec4(uColor * (1.0 + uFlash * 1.5), (1.0 - r2) * (1.0 - r2) * min(1.0, vLife * 2.5) * uAlpha);
    #include <colorspace_fragment>
  }
`;
// gulls: the wings bend at the wrist (a gull's shallow M when gliding) and beat from the shoulder
const LH_GULL_VS = /* glsl */ `
  attribute vec2 aGull; attribute float aTone;
  varying float vTone; varying float vShade;
  void main() {
    float ax = abs(position.x), sx = sign(position.x);
    float beat = sin(aGull.x) * aGull.y;
    float a1 = 0.16 + beat, a2 = -0.24 + beat * 1.5;
    float inner = min(ax, 0.4), outer = max(ax - 0.4, 0.0);
    vec3 p = vec3(sx * (inner * cos(a1) + outer * cos(a2)), position.y + inner * sin(a1) + outer * sin(a2), position.z);
    vTone = aTone; vShade = 0.82 + 0.18 * cos(beat * 2.0);
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(p, 1.0);
  }
`;
const LH_GULL_FS = /* glsl */ `
  uniform vec3 uBody; uniform vec3 uWing; uniform vec3 uTip;
  varying float vTone; varying float vShade;
  void main() {
    vec3 c = mix(mix(uBody, uWing, smoothstep(0.0, 0.5, vTone)), uTip, smoothstep(0.6, 1.0, vTone));
    gl_FragColor = vec4(c * vShade, 1.0);
    #include <colorspace_fragment>
  }
`;
/** Two independent tileable fbm noises in r and g (256², wraps both ways). */
function lhNoise(THREE) {
  const N = 256, data = new Uint8Array(N * N * 4), r = koiRng(911);
  const OCT = [[4, 0.5], [8, 0.25], [16, 0.125], [32, 0.0625]];
  const grids = [0, 1].map(() => OCT.map(([c]) => Float32Array.from({ length: c * c }, () => r())));
  const acc = new Float32Array(N * N);
  for (let ch = 0; ch < 2; ch++) {
    acc.fill(0);
    OCT.forEach(([c, w], o) => {
      const g = grids[ch][o];
      for (let y = 0; y < N; y++) {
        const fy = (y / N) * c, iy = Math.floor(fy), ty0 = fy - iy, ty = ty0 * ty0 * (3 - 2 * ty0), y0 = (iy % c) * c, y1 = ((iy + 1) % c) * c;
        for (let x = 0; x < N; x++) {
          const fx = (x / N) * c, ix = Math.floor(fx), tx0 = fx - ix, tx = tx0 * tx0 * (3 - 2 * tx0), x0 = ix % c, x1 = (ix + 1) % c;
          acc[y * N + x] += w * ((g[y0 + x0] * (1 - tx) + g[y0 + x1] * tx) * (1 - ty) + (g[y1 + x0] * (1 - tx) + g[y1 + x1] * tx) * ty);
        }
      }
    });
    for (let i = 0; i < N * N; i++) data[i * 4 + ch] = Math.round((acc[i] / 0.9375) * 255);
  }
  for (let i = 0; i < N * N; i++) data[i * 4 + 3] = 255;
  const tex = new THREE.DataTexture(data, N, N, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.anisotropy = 8; // the sea is seen at a grazing angle (three caps it at what the GPU allows)
  tex.needsUpdate = true;
  return tex;
}
/** A round glow on black, stored gamma-encoded: its faint tail stays smooth instead of stepping into a ring on a dark sky. */
function lhGlow(THREE) {
  const S = 128, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d"), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2);
      const v = d >= 1 ? 0 : Math.exp(-d * d * 6) * (1 - d * d) ** 2 * 0.8 + 0.2 * Math.max(0, 1 - d * 5) ** 2; // a soft halo round a hot core
      const e = Math.round(Math.pow(v, 1 / 2.2) * 255), o = (y * S + x) * 4;
      img.data[o] = img.data[o + 1] = img.data[o + 2] = e;
      img.data[o + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
/** Three lightning bolts side by side (each 256 × 512, on black for additive drawing), fading into the cloud at the top. */
function lhBolts(THREE) {
  return canvasTexture(THREE, 768, 512, (g, w, h) => {
    g.fillStyle = "#000"; g.fillRect(0, 0, w, h);
    const r = koiRng(313);
    for (let k = 0; k < 3; k++) {
      const x0 = 128 + k * 256;
      const bolt = (x, y, len, lean, width, depth) => {
        const pts = [[x, y]], steps = Math.max(3, Math.round(len / 13));
        let cx = x, cy = y;
        for (let i = 1; i <= steps; i++) {
          cx = Math.max(x0 - 112, Math.min(x0 + 112, cx + r(-10, 10) + lean * 4));
          cy = y + (len * i) / steps;
          pts.push([cx, cy]);
          if (depth < 2 && i < steps - 2 && r() < 0.12) bolt(cx, cy, len * r(0.18, 0.4) * (1 - i / steps), r() < 0.5 ? -1 : 1, width * 0.55, depth + 1);
        }
        for (const [lw, a, blur] of [[width * 5, 0.16, 18], [width * 2.2, 0.4, 7], [width, 1, 0]]) {
          g.strokeStyle = `rgba(255,255,255,${a})`; g.lineWidth = lw; g.lineJoin = "round";
          g.shadowColor = "rgba(185,205,255,0.9)"; g.shadowBlur = blur;
          g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(px, py) : g.moveTo(px, py))); g.stroke();
        }
      };
      bolt(x0 + r(-20, 20), 0, h - 6, r(-0.5, 0.5), 2.4, 0);
    }
    g.shadowBlur = 0;
    g.globalCompositeOperation = "multiply"; // the top reaches up into the cloud
    const fade = g.createLinearGradient(0, 0, 0, h * 0.3);
    fade.addColorStop(0, "#000"); fade.addColorStop(1, "#fff");
    g.fillStyle = fade; g.fillRect(0, 0, w, h * 0.3);
    g.globalCompositeOperation = "source-over";
  });
}
/** A distant rain shaft: slanted streaks of grey hanging from the cloud (white rgb, the shape in alpha: no dark fringes). */
function lhCurtain(THREE) {
  const W = 256, H = 128, r = koiRng(515), data = new Uint8Array(W * H * 4);
  const cols = Float32Array.from({ length: 48 }, () => r());
  const band = (u) => { const f = (((u % 1) + 1) % 1) * 48, i = Math.floor(f), t = f - i, s = t * t * (3 - 2 * t); return cols[i] * (1 - s) + cols[(i + 1) % 48] * s; };
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  for (let y = 0; y < H; y++) {
    const v = y / (H - 1); // row 0 is the bottom of the quad
    const vert = sm(0, 0.3, v) * (1 - sm(0.72, 1, v));
    for (let x = 0; x < W; x++) {
      const u = x / (W - 1), env = Math.pow(Math.sin(Math.PI * u), 0.8);
      const s = band(u * 0.9 + v * 0.1) * 0.6 + band(u * 3.1 + v * 0.25 + 0.5) * 0.4;
      const o = (y * W + x) * 4;
      data[o] = data[o + 1] = data[o + 2] = 255;
      data[o + 3] = Math.round(255 * env * vert * (0.2 + 0.8 * s * s));
    }
  }
  const tex = new THREE.DataTexture(data, W, H, THREE.RGBAFormat);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}
/** The sea: rows spaced further apart with distance (even on screen), each row as wide as the view out there. */
function lhSeaGrid(THREE, cols, rows, near, far, spread) {
  const pos = new Float32Array((cols + 1) * (rows + 1) * 3);
  for (let j = 0; j <= rows; j++) {
    const z = -near * Math.pow(far / near, j / rows), hw = -z * spread + 40;
    for (let i = 0; i <= cols; i++) pos.set([((i / cols) * 2 - 1) * hw, 0, z], (j * (cols + 1) + i) * 3);
  }
  const idx = new Uint32Array(cols * rows * 6);
  let o = 0;
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) { const a = j * (cols + 1) + i, b = a + 1, c = a + cols + 1, d = c + 1; idx.set([a, b, c, b, d, c], o); o += 6; }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}
/** Smooth 3D value noise for shaping rocks (0…1). */
function lhNoise3(x, y, z) {
  const h = (a, b, c) => { const s = Math.sin(a * 127.1 + b * 311.7 + c * 74.7) * 43758.5453; return s - Math.floor(s); };
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), sm = (t) => t * t * (3 - 2 * t);
  const fx = sm(x - ix), fy = sm(y - iy), fz = sm(z - iz), L = (a, b, t) => a + (b - a) * t;
  return L(L(L(h(ix, iy, iz), h(ix + 1, iy, iz), fx), L(h(ix, iy + 1, iz), h(ix + 1, iy + 1, iz), fx), fy),
    L(L(h(ix, iy, iz + 1), h(ix + 1, iy, iz + 1), fx), L(h(ix, iy + 1, iz + 1), h(ix + 1, iy + 1, iz + 1), fx), fy), fz);
}
/** The island: lumpy boulders round a flattened top for the tower, a shoulder for the keeper's house, a few rocks awash. */
function lhRocks(THREE) {
  const BLOBS = [ // centre, size
    [0, 0.8, 0, 14, 5.6, 11], [-9, 0.4, 3.5, 9.5, 4.8, 7.5], [9, -0.2, 3, 8.5, 4.4, 7], [3, 0.2, -8, 11, 4.6, 7], [-8, -0.5, -6, 8, 4.2, 6],
    [17, -1.2, -1, 5, 3.2, 4.2], [-19, -1.5, 4, 4.5, 2.9, 4], [25, -2, 7, 3.2, 2.6, 2.8], [-27, -2.2, -5, 3.4, 2.7, 3.2], [13, -1.6, 11, 3.5, 2.5, 3],
  ];
  const STONE = [new THREE.Color("#3b3733"), new THREE.Color("#5e5850")], GRASS = new THREE.Color("#56693a"), c = new THREE.Color();
  const pos = [], col = [];
  const a = new THREE.Vector3(), b = new THREE.Vector3(), d = new THREE.Vector3(), e = new THREE.Vector3(), n = new THREE.Vector3();
  BLOBS.forEach(([cx, cy, cz, sx, sy, sz], k) => {
    const g = new THREE.IcosahedronGeometry(1, 3), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
      const s = 1 + 0.32 * (lhNoise3(x * 1.3 + k * 7, y * 1.3, z * 1.3) - 0.5) + 0.16 * (lhNoise3(x * 2.6, y * 2.6 + k * 3, z * 2.6) - 0.5);
      let wy = cy + y * s * sy;
      if (wy > 5.6) wy = 5.6 + (wy - 5.6) * 0.25; // the flat top the tower stands on
      p.setXYZ(i, cx + x * s * sx, wy, cz + z * s * sz);
    }
    for (let f = 0; f < p.count; f += 3) {
      a.fromBufferAttribute(p, f); b.fromBufferAttribute(p, f + 1); d.fromBufferAttribute(p, f + 2);
      n.subVectors(b, a).cross(e.subVectors(d, a)).normalize();
      const my = (a.y + b.y + d.y) / 3, mx = (a.x + b.x + d.x) / 3, mz = (a.z + b.z + d.z) / 3;
      c.copy(STONE[0]).lerp(STONE[1], lhNoise3(mx * 0.35, my * 0.35, mz * 0.35));
      if (my < 1.4) c.multiplyScalar(0.62); // wet and dark where the sea reaches
      const up = Math.abs(n.y);
      if (up > 0.72 && my > 3.2) c.lerp(GRASS, 0.55 + 0.4 * lhNoise3(mx * 0.5, 0, mz * 0.5));
      for (const v of [a, b, d]) { pos.push(v.x, v.y, v.z); col.push(c.r, c.g, c.b); }
    }
    g.dispose();
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  geo.computeVertexNormals();
  return geo;
}
/** The lighthouse and the keeper's house (sea level at y = 0): white parts, parts in the accent colour, dark metal, the lantern glass, windows. */
function lhTower(THREE) {
  const at = (x, y, z, ry = 0, sx = 1, sy = 1, sz = 1, rx = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, 0)), new THREE.Vector3(sx, sy, sz));
  const white = [], accent = [], dark = [], glass = [], windows = [];
  const BASE = 5.2, TOP = 30.6, R0 = 3.3, R1 = 2.4, NB = 7;
  const rad = (y) => R0 + ((R1 - R0) * (y - BASE)) / (TOP - BASE);
  white.push([new THREE.CylinderGeometry(3.8, 4.1, 2.4, 40), at(0, 4.2, 0), "#bdb7ac"]); // the stone plinth
  for (let i = 0; i < NB; i++) { // bands up the tapering tower
    const y0 = BASE + (i * (TOP - BASE)) / NB, y1 = BASE + ((i + 1) * (TOP - BASE)) / NB;
    (i % 2 ? accent : white).push([new THREE.CylinderGeometry(rad(y1), rad(y0), y1 - y0, 40, 1, true), at(0, (y0 + y1) / 2, 0), "#ffffff"]);
  }
  white.push([new THREE.CylinderGeometry(3.15, R1, 0.8, 40, 1, true), at(0, TOP + 0.4, 0), "#ebe8e1"]); // the corbel under the gallery
  dark.push([new THREE.CylinderGeometry(3.45, 3.45, 0.28, 40), at(0, 31.54, 0), "#2b2f35"]);
  for (let i = 0; i < 18; i++) { const a = (i / 18) * Math.PI * 2; dark.push([new THREE.CylinderGeometry(0.045, 0.045, 1.05, 5), at(Math.sin(a) * 3.35, 32.2, Math.cos(a) * 3.35), "#2b2f35"]); }
  dark.push([new THREE.TorusGeometry(3.35, 0.055, 5, 48), at(0, 32.72, 0, 0, 1, 1, 1, Math.PI / 2), "#2b2f35"]);
  dark.push([new THREE.TorusGeometry(3.35, 0.035, 4, 48), at(0, 32.2, 0, 0, 1, 1, 1, Math.PI / 2), "#2b2f35"]);
  dark.push([new THREE.CylinderGeometry(1.95, 1.95, 0.75, 32), at(0, 32.05, 0), "#30353c"]);
  glass.push([new THREE.CylinderGeometry(1.75, 1.75, 2.5, 24, 1, true), at(0, 33.68, 0), "#ffffff"]);
  for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2 + 0.2; dark.push([new THREE.BoxGeometry(0.09, 2.5, 0.09), at(Math.sin(a) * 1.77, 33.68, Math.cos(a) * 1.77, a), "#2b2f35"]); }
  dark.push([new THREE.CylinderGeometry(1.98, 1.98, 0.22, 32), at(0, 35.04, 0), "#2b2f35"]);
  accent.push([new THREE.SphereGeometry(2.05, 32, 10, 0, Math.PI * 2, 0, Math.PI / 2), at(0, 35.15, 0, 0, 1, 0.75, 1), "#ffffff"]); // the dome
  dark.push([new THREE.SphereGeometry(0.32, 12, 8), at(0, 36.94, 0), "#2b2f35"]);
  dark.push([new THREE.CylinderGeometry(0.035, 0.05, 1.5, 5), at(0, 37.9, 0), "#2b2f35"]);
  for (const [y, a] of [[11, 0.15], [17.5, -0.2], [24, 0.1]]) windows.push([new THREE.PlaneGeometry(0.55, 0.95), at(Math.sin(a) * (rad(y) + 0.03), y, Math.cos(a) * (rad(y) + 0.03), a), "#ffffff"]);
  dark.push([new THREE.PlaneGeometry(1.3, 2.3), at(0, BASE + 1.15, rad(BASE + 1.15) + 0.03), "#3a2f2a"]); // the door
  // the keeper's house on the shoulder to the left, a little in front
  white.push([new THREE.BoxGeometry(7.5, 6.4, 5), at(-8.6, 4.7, 2.6), "#efeae0"]);
  dark.push([roofPrism(THREE), at(-8.6, 7.9, 2.6, 0, 8.3, 2.1, 5.8), "#6b4638"]);
  dark.push([new THREE.BoxGeometry(0.7, 1.8, 0.7), at(-11.2, 9.5, 2.0), "#8a8378"]);
  dark.push([new THREE.PlaneGeometry(1.0, 2.0), at(-8.8, 5.3, 5.12), "#3a2f2a"]);
  for (const x of [-11.2, -6.4]) windows.push([new THREE.PlaneGeometry(0.9, 1.1), at(x, 6.2, 5.12), "#ffffff"]);
  windows.push([new THREE.PlaneGeometry(0.9, 1.1), at(-12.37, 6.2, 2.6, -Math.PI / 2), "#ffffff"]);
  return { white: mergeColored(THREE, white), accent: mergeColored(THREE, accent), dark: mergeColored(THREE, dark), glass: mergeColored(THREE, glass), windows: mergeColored(THREE, windows), lamp: 33.7 };
}
/** A small coaster (bow towards +x, waterline at y = 0): hull and superstructure, containers in the accent colour, lit windows. */
function lhShip(THREE) {
  const at = (x, y, z, ry = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new THREE.Vector3(1, 1, 1));
  const hull = new THREE.BoxGeometry(28, 6.4, 6, 8, 1, 1), p = hull.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = (p.getX(i) + 14) / 28;
    let z = p.getZ(i), y = p.getY(i);
    if (t > 0.7) z *= 1 - Math.pow((t - 0.7) / 0.3, 1.5) * 0.96; // the bow comes to a point
    if (y > 0) y += Math.pow(t, 3) * 1.3; // and rises a little
    p.setXYZ(i, p.getX(i), y, z);
  }
  hull.computeVertexNormals();
  const body = [[hull, at(0, -0.8, 0), "#22303d"]], accent = [], lit = [];
  body.push([new THREE.BoxGeometry(5.5, 4.3, 5.2), at(-7.5, 4.55, 0), "#e8ebee"]);
  body.push([new THREE.BoxGeometry(6.2, 0.3, 6.5), at(-7.5, 6.85, 0), "#e8ebee"]);
  body.push([new THREE.CylinderGeometry(0.85, 0.95, 6, 12), at(-11.5, 5.4, 0), "#2a2e33"]);
  body.push([new THREE.CylinderGeometry(0.1, 0.12, 6.5, 6), at(-7.5, 10.2, 0), "#2a2e33"]);
  body.push([new THREE.BoxGeometry(0.15, 0.15, 2.8), at(-7.5, 12, 0), "#2a2e33"]);
  body.push([new THREE.CylinderGeometry(0.1, 0.12, 6, 6), at(10.5, 5.7, 0), "#2a2e33"]);
  accent.push([new THREE.CylinderGeometry(0.9, 0.9, 1.0, 12), at(-11.5, 7.2, 0), "#ffffff"]);
  accent.push([new THREE.BoxGeometry(4.8, 2.5, 5.2), at(-1.5, 3.65, 0), "#ffffff"]);
  accent.push([new THREE.BoxGeometry(4.8, 2.5, 5.2), at(3.6, 3.65, 0), "#b8b8b8"]);
  accent.push([new THREE.BoxGeometry(4.8, 2.5, 5.2), at(-1.5, 6.15, 0), "#dcdcdc"]);
  for (const z of [-1.6, -0.55, 0.55, 1.6]) lit.push([new THREE.PlaneGeometry(0.7, 0.55), at(-4.73, 5.9, z, Math.PI / 2), "#ffffff"]);
  for (const x of [-9.5, -8.3, -7.1, -5.9]) lit.push([new THREE.PlaneGeometry(0.6, 0.5), at(x, 5.9, 2.62), "#ffffff"]);
  for (const x of [-9.5, -7.5, -5.5]) lit.push([new THREE.PlaneGeometry(0.4, 0.4), at(x, 3.9, 2.62), "#ffffff"]);
  return { body: mergeColored(THREE, body), accent: mergeColored(THREE, accent), lit: mergeColored(THREE, lit), lights: { mast: [-7.5, 13.6, 0], fore: [10.5, 8.9, 0], side: [-7.5, 7.1, 3.3] } };
}
/** A gull flying towards −z: a small body and two wings, their tips black (aTone: 0 body, 0.5 wing, 1 tip). */
function lhGull(THREE) {
  const P = { head: [0, 0, -0.34], tail: [0, 0, 0.38], bl: [-0.06, 0, 0.02], br: [0.06, 0, 0.02] };
  const tris = [[P.head, P.bl, P.br, 0, 0, 0], [P.tail, P.br, P.bl, 0, 0, 0]];
  for (const s of [-1, 1]) {
    const rl = [0.05 * s, 0, -0.1], rt = [0.05 * s, 0, 0.14], el = [0.42 * s, 0, -0.11], et = [0.42 * s, 0, 0.12], tip = [0.98 * s, 0, 0.16], tt = [0.8 * s, 0, 0.22];
    tris.push([rl, rt, et, 0.3, 0.3, 0.5], [rl, et, el, 0.3, 0.5, 0.5], [el, et, tt, 0.5, 0.5, 0.85], [el, tt, tip, 0.5, 0.85, 1]);
  }
  const pos = [], tone = [];
  for (const [a, b, c, ta, tb, tc] of tris) { pos.push(...a, ...b, ...c); tone.push(ta, tb, tc); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aTone", new THREE.Float32BufferAttribute(tone, 1));
  return g;
}
function lighthouse(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(1890);
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), E = new THREE.Euler(0, 0, 0, "YXZ"), SC = new THREE.Vector3(), UP = new THREE.Vector3(0, 1, 0);
  const EYE = 9, D = 150, SHIP_Z = -380; // eye height on the headland, the lighthouse and the ship out at sea
  camera.fov = 45; camera.near = 0.5; camera.far = 6000;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  let TAN = Math.tan((camera.fov * Math.PI) / 360);
  const halfW = (dist) => dist * TAN * camera.aspect; // half the visible width at that distance
  const sm = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
  const time = { value: 0 };
  const noise = keep(lhNoise(THREE)), glow = keep(lhGlow(THREE));
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  const accent = new THREE.Color(), warm = new THREE.Color("#ffc98a");
  scene.fog = new THREE.Fog(0x000000, 80, 1200);

  /* --- light: sky and ground, the sun (or the moon behind the storm), and the lightning --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const key = new THREE.DirectionalLight(0xffffff, 1);
  const flashLight = new THREE.DirectionalLight(0xd6e0ff, 0);
  scene.add(hemi, key, flashLight);

  /* --- the sky: a gradient under a deck of cloud that the lightning lights from inside --- */
  const skyUni = {
    uNoise: { value: noise }, uTime: time, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uCloudDark: { value: new THREE.Color() }, uCloudLight: { value: new THREE.Color() },
    uCover: { value: 0.8 }, uOrbDir: { value: new THREE.Vector3() }, uOrbCol: { value: new THREE.Color() }, uOrbSize: { value: 0.02 }, uFlash: { value: 0 }, uFlashDir: { value: new THREE.Vector3(0, 0.3, -1).normalize() },
  };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(4000, 48, 24)), keep(new THREE.ShaderMaterial({ uniforms: skyUni, vertexShader: LH_SKY_VS, fragmentShader: LH_SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false })));
  sky.renderOrder = -2; sky.frustumCulled = false;
  scene.add(sky);

  /* --- the sea --- */
  const WAVES = [[0.25, 1, 90, 1.8, 0.22], [-0.35, 1, 55, 1.1, 0.18], [0.6, 0.8, 33, 0.8, 0.14], [-0.5, 0.86, 21, 0.55, 0.12], [0.1, 1, 13, 0.35, 0.1], [0.8, 0.6, 8, 0.2, 0.08], [-0.7, 0.7, 5, 0.12, 0.07], [0.35, 0.94, 3.2, 0.06, 0.06]].map(([x, z, L, A, s]) => {
    const n = Math.hypot(x, z), k = (2 * Math.PI) / L; // direction, wavelength, height, sharpness of the crest
    return { x: x / n, z: z / n, L, k, A, s, w: Math.sqrt(9.8 * k) };
  });
  const seaUni = {
    uTime: time, uNoise: { value: noise }, uWave: { value: WAVES.map((w) => new THREE.Vector4(w.x, w.z, w.k, w.A)) }, uSteep: { value: WAVES.map((w) => w.s) },
    uAmp: { value: 1 }, uSteepSum: { value: WAVES.reduce((s, w) => s + w.s, 0) },
    uDeep: { value: new THREE.Color() }, uScatter: { value: new THREE.Color() }, uZenith: skyUni.uZenith, uHorizon: skyUni.uHorizon,
    uFog: skyUni.uHorizon, uFogNear: { value: 150 }, uFogFar: { value: 1400 }, uRipple: { value: 0.3 }, uRippleScale: { value: 1 }, uReflect: { value: 1 },
    uOrbDir: skyUni.uOrbDir, uOrbCol: { value: new THREE.Color() }, uGlitter: { value: 0 },
    uLampPos: { value: new THREE.Vector3() }, uLampCol: { value: new THREE.Color() }, uLampOn: { value: 1 }, uGlint: { value: 0 }, uShipPos: { value: new THREE.Vector3() }, uShipCol: { value: new THREE.Color() },
    uBeamA: { value: new THREE.Vector3(0, 0, -1) }, uBeamB: { value: new THREE.Vector3(0, 0, 1) }, uBeamCos: { value: new THREE.Vector2(Math.cos(0.036 * 1.3), Math.cos(0.036 * 0.45)) }, uBeamOn: { value: 1 }, uFlash: skyUni.uFlash,
    uFoamCol: { value: new THREE.Color() }, uFoamOn: { value: 1 }, uRocks: { value: [new THREE.Vector4(), new THREE.Vector4()] },
  };
  const sea = new THREE.Mesh(keep(lhSeaGrid(THREE, preview ? 120 : 240, preview ? 130 : 260, 2, 3600, 1.55)), keep(new THREE.ShaderMaterial({ uniforms: seaUni, vertexShader: LH_SEA_VS, fragmentShader: LH_SEA_FS })));
  sea.frustumCulled = false;
  scene.add(sea);
  let amp = 1; // the waves' height: a storm at night, the calm after it by day
  /** The sea's height at (x, z) as drawn (the fine waves fade with distance there), or the whole sea for dist = 0. */
  function waveH(x, z, t, dist) {
    let h = 0;
    for (const w of WAVES) h += w.A * (dist > 0 ? 1 - sm(w.L * 3, w.L * 6, dist) : 1) * Math.sin(w.k * (w.x * x + w.z * z) - w.w * t);
    return h * amp;
  }

  /* --- the lighthouse on its island, and the keeper's house --- */
  const lh = new THREE.Group();
  scene.add(lh);
  const T = lhTower(THREE), LAMP_Y = T.lamp;
  const rockMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 }));
  const whiteMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }));
  const accentMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.65 }));
  const darkMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.2 }));
  const glassMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  const winMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  for (const [geo, mat] of [[lhRocks(THREE), rockMat], [T.white, whiteMat], [T.accent, accentMat], [T.dark, darkMat], [T.glass, glassMat], [T.windows, winMat]]) lh.add(new THREE.Mesh(keep(geo), mat));
  const lamp = new THREE.Vector3();
  const glowMat = (hex, depthTest) => keep(new THREE.SpriteMaterial({ map: glow, color: hex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest, fog: false, transparent: true }));
  const lampGlowMat = glowMat(0xffd9a0, false), flareMat = glowMat(0xfff0d6, false), streakMat = glowMat(0xffe0b0, false);
  const lampGlow = new THREE.Sprite(lampGlowMat), flare = new THREE.Sprite(flareMat), streak = new THREE.Sprite(streakMat);
  lampGlow.renderOrder = 30; flare.renderOrder = 31; streak.renderOrder = 31;
  scene.add(lampGlow, flare, streak);

  /* --- the beams: two opposite cones turning once every 16 s, tilted a little down to the horizon --- */
  const BEAM_LEN = preview ? 520 : 760, CONE = 0.036, TILT = -0.02, OMEGA = (2 * Math.PI) / 16, PHI0 = -Math.PI / 2 - 0.3;
  const beamGeo = keep(new THREE.CylinderGeometry(BEAM_LEN * Math.tan(CONE), 0, BEAM_LEN, 32, 24, true));
  beamGeo.translate(0, BEAM_LEN / 2, 0); // the apex at the lamp, opening along +y
  const beamUni = { uNoise: { value: noise }, uTime: time, uLen: { value: BEAM_LEN }, uColor: { value: new THREE.Color("#fff2dc") }, uStrength: { value: 0.75 } };
  const beamMat = keep(new THREE.ShaderMaterial({ uniforms: beamUni, vertexShader: LH_BEAM_VS, fragmentShader: LH_BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  const beams = [0, 1].map(() => { const m = new THREE.Mesh(beamGeo, beamMat); m.frustumCulled = false; m.renderOrder = 12; scene.add(m); return m; });
  const beamDir = (phi, out) => out.set(Math.sin(phi) * Math.cos(TILT), Math.sin(TILT), -Math.cos(phi) * Math.cos(TILT));
  const dirA = new THREE.Vector3(), dirB = new THREE.Vector3(), toCam = new THREE.Vector3();

  /* --- rain: streaks round the viewer and further out; and the drops the beams light up --- */
  const rainBase = keep(new THREE.PlaneGeometry(1, 1));
  rainBase.translate(0, 0.5, 0); // x across the streak, y from its head (0) to its tail (1)
  const streakGeo = (n) => { const g = keep(new THREE.InstancedBufferGeometry()); g.index = rainBase.index; g.setAttribute("position", rainBase.attributes.position); g.instanceCount = n; return g; };
  const NR = preview ? 700 : 2400, NRM = preview ? 150 : 500; // near, and the rest further out
  const rainGeo = streakGeo(NR + NRM);
  const drop = new Float32Array((NR + NRM) * 4), boxC = new Float32Array((NR + NRM) * 3), boxS = new Float32Array((NR + NRM) * 3);
  for (let i = 0; i < NR + NRM; i++) {
    drop.set([r(), r(), r(), r(0.85, 1.15)], i * 4);
    if (i < NR) { boxC.set([0, EYE, -27], i * 3); boxS.set([66, 34, 50], i * 3); } else { boxC.set([20, 25, -95], i * 3); boxS.set([240, 60, 90], i * 3); }
  }
  rainGeo.setAttribute("aDrop", new THREE.InstancedBufferAttribute(drop, 4));
  rainGeo.setAttribute("aBoxC", new THREE.InstancedBufferAttribute(boxC, 3));
  rainGeo.setAttribute("aBoxS", new THREE.InstancedBufferAttribute(boxS, 3));
  const rainUni = {
    uTime: time, uFall: { value: new THREE.Vector3(4.5, -15, 1.2) }, uLen: { value: 0.7 }, uWidth: { value: 0.028 }, uPix: { value: 0.001 },
    uLampPos: seaUni.uLampPos, uBeamA: seaUni.uBeamA, uBeamB: seaUni.uBeamB, uBeamCos: seaUni.uBeamCos, uBeamOn: seaUni.uBeamOn, uFlash: skyUni.uFlash,
    uColor: { value: new THREE.Color() }, uBeamCol: { value: new THREE.Color("#ffe2b0") }, uAlpha: { value: 0.3 },
  };
  const rain = new THREE.Mesh(rainGeo, keep(new THREE.ShaderMaterial({ uniforms: rainUni, vertexShader: LH_RAIN_VS, fragmentShader: LH_RAIN_FS, transparent: true, depthWrite: false })));
  rain.frustumCulled = false; rain.renderOrder = 14;
  scene.add(rain);
  const BR_CELLS = 840, BR_K = 18, BR_J = preview ? 24 : 36, BR_M = preview ? 2 : 3; // cells round the lamp; slots across a beam, rings out from it, drops per cell
  const brGeo = streakGeo(BR_K * BR_J * BR_M * 2);
  const slot = new Float32Array(BR_K * BR_J * BR_M * 2 * 4);
  for (let b = 0, o = 0; b < 2; b++) for (let k = 0; k < BR_K; k++) for (let j = 0; j < BR_J; j++) for (let m = 0; m < BR_M; m++, o += 4) slot.set([k, j, m, b], o);
  brGeo.setAttribute("aSlot", new THREE.InstancedBufferAttribute(slot, 4));
  const brUni = {
    uTime: time, uPhi: { value: 0 }, uLamp: seaUni.uLampPos, uTilt: { value: TILT }, uCone: { value: CONE }, uCell: { value: (2 * Math.PI) / BR_CELLS }, uCells: { value: BR_CELLS },
    uR0: { value: 7 }, uRatio: { value: Math.pow(300 / 7, 1 / BR_J) }, uSpeed: { value: 14 }, uDrift: { value: new THREE.Vector2(0.3, 0.08) }, uLen: { value: 0.9 }, uPix: rainUni.uPix,
    uBeamA: seaUni.uBeamA, uBeamB: seaUni.uBeamB, uColor: { value: new THREE.Color("#ffe6bf") },
  };
  const beamRain = new THREE.Mesh(brGeo, keep(new THREE.ShaderMaterial({ uniforms: brUni, vertexShader: LH_BEAMRAIN_VS, fragmentShader: LH_BEAMRAIN_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  beamRain.frustumCulled = false; beamRain.renderOrder = 15;
  scene.add(beamRain);
  // rain shafts hanging from the cloud far out to sea
  const curtainMat = keep(new THREE.MeshBasicMaterial({ map: keep(lhCurtain(THREE)), transparent: true, depthWrite: false, fog: false }));
  const curtainCol = new THREE.Color();
  const curtains = [];
  for (let i = 0; i < (preview ? 2 : 4); i++) {
    const m = new THREE.Mesh(quad, curtainMat), dist = 650 + i * 260 + r(0, 120), w = r(300, 560);
    m.position.set(r(-1, 1) * halfW(dist), 115, -dist); m.scale.set(w, 250, 1); m.renderOrder = 2; m.frustumCulled = false;
    scene.add(m); curtains.push({ m, dist, w, speed: r(2.5, 4.5) });
  }
  // lightning: a flash inside the cloud, now and then a bolt down to the sea on the horizon
  const boltTex = keep(lhBolts(THREE));
  boltTex.repeat.set(1 / 3, 1);
  const boltMat = keep(new THREE.MeshBasicMaterial({ map: boltTex, color: 0xdfe8ff, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, fog: false, side: THREE.DoubleSide, opacity: 0 }));
  const bolt = new THREE.Mesh(quad, boltMat);
  bolt.visible = false; bolt.renderOrder = 3; bolt.frustumCulled = false;
  scene.add(bolt);

  /* --- spray: thrown up where a crest meets the rocks --- */
  const NS = preview ? 260 : 900;
  const sPos = new Float32Array(NS * 3), sVel = new Float32Array(NS * 3), sAge = new Float32Array(NS).fill(9), sMax = new Float32Array(NS).fill(1), sLife = new Float32Array(NS), sSize = new Float32Array(NS);
  const sprayGeo = keep(new THREE.BufferGeometry());
  sprayGeo.setAttribute("position", new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sprayGeo.setAttribute("aLife", new THREE.BufferAttribute(sLife, 1).setUsage(THREE.DynamicDrawUsage));
  sprayGeo.setAttribute("aSize", new THREE.BufferAttribute(sSize, 1).setUsage(THREE.DynamicDrawUsage));
  const sprayUni = { uPx: { value: 600 }, uColor: { value: new THREE.Color() }, uFlash: skyUni.uFlash, uAlpha: { value: 0.45 } };
  const spray = new THREE.Points(sprayGeo, keep(new THREE.ShaderMaterial({ uniforms: sprayUni, vertexShader: LH_SPRAY_VS, fragmentShader: LH_SPRAY_FS, transparent: true, depthWrite: false })));
  spray.frustumCulled = false; spray.renderOrder = 13;
  scene.add(spray);
  const buf = new THREE.Vector2();
  spray.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); sprayUni.uPx.value = buf.y / (2 * TAN); rainUni.uPix.value = (2 * TAN) / Math.max(1, buf.y); };
  const IMPACTS = [-2.8, -2.3, -1.9, -1.57, -1.25, -0.85, -0.4, 0, 0.35, 3.14, 2.8, 2.45].map((a) => ({ a, prev: 0, cool: 0 })); // round the island: its seaward side and both flanks
  let sNext = 0, lhX = 0;
  function burst(x, y, z, nx, nz, power) {
    const n = Math.round((preview ? 18 : 48) * power);
    for (let i = 0; i < n; i++) {
      const k = sNext;
      sNext = (sNext + 1) % NS;
      sPos[k * 3] = x + r(-3.5, 3.5); sPos[k * 3 + 1] = y + r(-0.5, 1.5); sPos[k * 3 + 2] = z + r(-3.5, 3.5);
      const up = r(8, 22) * power * (pal.dark ? 1 : 0.35); // a plume: most of it low and wide, some of it thrown high up the rocks
      sVel[k * 3] = -nx * r(0.5, 3) + r(-1.5, 1.5) + 1.5; sVel[k * 3 + 1] = up; sVel[k * 3 + 2] = -nz * r(0.5, 3) + r(-1.5, 1.5) + 1;
      sAge[k] = 0; sMax[k] = r(1.6, 3.2) * (pal.dark ? 1 : 0.6); sSize[k] = r(2.5, 6) * (0.5 + 0.5 * power) * (pal.dark ? 1 : 0.55);
    }
  }
  function stepSpray(dt, t) {
    for (const p of IMPACTS) {
      const x = lhX + Math.cos(p.a) * 13, z = -D + Math.sin(p.a) * 10.5, h = waveH(x, z, t, D), thr = 0.75 * amp;
      p.cool -= dt;
      if (h > thr && p.prev <= thr && p.cool <= 0) { burst(x, h, z, Math.cos(p.a), Math.sin(p.a), Math.min(1.3, 0.6 + (h - thr) / (1.4 * amp))); p.cool = 1.5; }
      p.prev = h;
    }
    const drag = Math.max(0, 1 - 0.7 * dt);
    for (let k = 0; k < NS; k++) {
      if (sAge[k] >= sMax[k]) { sLife[k] = 0; continue; }
      sAge[k] += dt;
      sVel[k * 3] = sVel[k * 3] * drag + 3 * dt; sVel[k * 3 + 1] = sVel[k * 3 + 1] * drag - 6.5 * dt; sVel[k * 3 + 2] *= drag; // the wind carries it off to the right
      sPos[k * 3] += sVel[k * 3] * dt; sPos[k * 3 + 1] += sVel[k * 3 + 1] * dt; sPos[k * 3 + 2] += sVel[k * 3 + 2] * dt;
      sSize[k] *= 1 + 0.35 * dt; // the spray spreads into mist
      sLife[k] = sPos[k * 3 + 1] < -1 ? 0 : 1 - sAge[k] / sMax[k];
    }
    sprayGeo.attributes.position.needsUpdate = sprayGeo.attributes.aLife.needsUpdate = sprayGeo.attributes.aSize.needsUpdate = true;
  }

  /* --- a small ship out at sea: its lights ride the swell at night; the lighthouse beam catches it as it passes --- */
  const SH = lhShip(THREE);
  const ship = new THREE.Group();
  const shipBodyMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.7 }));
  const shipAccentMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
  const shipLitMat = keep(new THREE.MeshBasicMaterial({ vertexColors: true }));
  for (const [geo, mat] of [[SH.body, shipBodyMat], [SH.accent, shipAccentMat], [SH.lit, shipLitMat]]) ship.add(new THREE.Mesh(keep(geo), mat));
  const navLights = [[SH.lights.mast, 0xfff2dc, 5], [SH.lights.fore, 0xfff2dc, 4], [SH.lights.side, 0x5dffa0, 4]].map(([p, hex, s]) => {
    const m = new THREE.Sprite(glowMat(hex, true));
    m.position.set(p[0], p[1], p[2]); m.scale.setScalar(s); m.renderOrder = 16;
    ship.add(m);
    return m;
  });
  scene.add(ship);
  let shipX = -halfW(-SHIP_Z) * 0.45;
  const mastTop = new THREE.Vector3(...SH.lights.mast);
  function stepShip(dt, t) {
    const hw = halfW(-SHIP_Z) * 1.12 + 25;
    shipX += dt * 3.2;
    if (shipX > hw) shipX = -hw;
    const z = SHIP_Z, h = waveH(shipX, z, t, 0), bow = waveH(shipX + 10, z, t, 0), stern = waveH(shipX - 10, z, t, 0), near = waveH(shipX, z + 3, t, 0), far = waveH(shipX, z - 3, t, 0);
    ship.position.set(shipX, h * 0.75 - 0.2, z);
    ship.rotation.set(-Math.atan2(near - far, 6) * 0.6, 0, Math.atan2(bow - stern, 20) * 0.9);
    ship.updateMatrixWorld();
    seaUni.uShipPos.value.copy(mastTop).applyMatrix4(ship.matrixWorld);
    // the beam sweeping past lights the hull for a moment
    V.set(shipX - lamp.x, 0, z - lamp.z).normalize();
    const hit = pal.dark ? Math.max(sm(0.9975, 0.9995, V.x * dirA.x + V.z * dirA.z), sm(0.9975, 0.9995, V.x * dirB.x + V.z * dirB.z)) : 0;
    shipBodyMat.emissive.copy(warm).multiplyScalar(hit * 0.55); shipAccentMat.emissive.copy(warm).multiplyScalar(hit * 0.4);
  }

  /* --- gulls by day: circling the lighthouse, and now and then one gliding past closer by --- */
  const NG = preview ? 5 : 9;
  const gullGeo = keep(lhGull(THREE));
  const aGull = new THREE.InstancedBufferAttribute(new Float32Array(NG * 2), 2);
  aGull.setUsage(THREE.DynamicDrawUsage);
  gullGeo.setAttribute("aGull", aGull);
  const gullUni = { uBody: { value: new THREE.Color("#f5f7f9") }, uWing: { value: new THREE.Color("#c2c9d1") }, uTip: { value: new THREE.Color("#1c2025") } };
  const gullMesh = new THREE.InstancedMesh(gullGeo, keep(new THREE.ShaderMaterial({ uniforms: gullUni, vertexShader: LH_GULL_VS, fragmentShader: LH_GULL_FS, side: THREE.DoubleSide })), NG);
  gullMesh.frustumCulled = false; gullMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(gullMesh);
  const gulls = Array.from({ length: NG }, (_, i) => ({ cross: i >= NG - 2, a: r(0, 6.28), R: r(16, 55), w: (r() < 0.5 ? -1 : 1) * r(0.14, 0.26), h: r(16, 46), ph: r(0, 6.28), beat: r(0, 6.28), amp: 0.3, flap: r() < 0.5, timer: r(0.5, 4), s: r(1.2, 1.6), yaw: 0, first: true }));
  function spawnCrosser(g) {
    g.dist = r(40, 85); g.dir = r() < 0.5 ? -1 : 1; g.x = -g.dir * (halfW(g.dist) * 1.15 + 5); g.h = r(12, 26); g.speed = r(8, 11); g.first = true;
  }
  gulls.forEach((g) => { if (g.cross) { spawnCrosser(g); g.x = r(-1, 1) * halfW(g.dist); } });
  const gp = new THREE.Vector3(), gv = new THREE.Vector3();
  function stepGulls(dt, t) {
    gulls.forEach((g, i) => {
      if ((g.timer -= dt) <= 0) { g.flap = !g.flap; g.timer = g.flap ? r(1.5, 3.5) : r(2.5, 6); } // a few beats, then a long glide
      g.amp += ((g.flap ? 0.5 : 0.05) - g.amp) * Math.min(1, dt * 3);
      g.beat += dt * (g.flap ? 8.5 : 2);
      if (g.cross) {
        g.x += g.dir * g.speed * dt;
        if (Math.abs(g.x) > halfW(g.dist) * 1.2 + 6) spawnCrosser(g);
        gp.set(g.x, g.h + Math.sin(t * 0.5 + g.ph) * 1.5, -g.dist);
        gv.set(g.dir * g.speed, Math.cos(t * 0.5 + g.ph) * 0.75, 0);
      } else {
        g.a += g.w * dt;
        const y = g.h + Math.sin(g.a * 0.7 + g.ph) * 3;
        gp.set(lhX + Math.cos(g.a) * g.R, y, -D + Math.sin(g.a) * g.R * 0.8);
        gv.set(-Math.sin(g.a) * g.R * g.w, Math.cos(g.a * 0.7 + g.ph) * 2.1 * g.w, Math.cos(g.a) * g.R * 0.8 * g.w);
      }
      const yaw = Math.atan2(-gv.x, -gv.z);
      let turn = g.first ? 0 : yaw - g.yaw;
      turn = Math.atan2(Math.sin(turn), Math.cos(turn)) / Math.max(dt, 1e-3);
      g.yaw = yaw; g.first = false;
      E.set(Math.atan2(gv.y, Math.hypot(gv.x, gv.z)) * 0.6, yaw, Math.max(-0.6, Math.min(0.6, turn * 1.4)), "YXZ");
      gullMesh.setMatrixAt(i, M4.compose(gp, Q.setFromEuler(E), SC.setScalar(g.s)));
      aGull.setXY(i, g.beat, g.amp);
    });
    gullMesh.instanceMatrix.needsUpdate = aGull.needsUpdate = true;
  }

  /* --- lightning: 2–4 flickers per strike, every few seconds --- */
  let flash = 0, nextStrike = 2.5, pulses = [], boltUntil = 0;
  function stepLightning(t) {
    if (!pal.dark) { flash = 0; bolt.visible = false; return; }
    const last = pulses.length ? pulses[pulses.length - 1][0] : -9;
    if (t >= nextStrike && t > last + 0.8) {
      const az = r(-0.85, 0.85) * Math.atan(TAN * camera.aspect), el = r(0.1, 0.36);
      skyUni.uFlashDir.value.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
      flashLight.position.set(Math.sin(az) * 60, 100, -Math.cos(az) * 60);
      pulses = [];
      let t0 = t;
      for (let i = 0, n = 2 + Math.floor(r(0, 3)); i < n; i++) { pulses.push([t0, r(0.45, 1)]); t0 += r(0.05, 0.2); }
      nextStrike = t0 + r(4, 11);
      boltUntil = 0;
      if (r() < 0.45) { // now and then a bolt comes down to the sea on the horizon
        const dist = r(1300, 2100), h = dist * Math.tan(el + 0.05);
        bolt.position.set(Math.sin(az) * dist, h / 2 - 4, -Math.cos(az) * dist);
        bolt.scale.set(h * 0.5 * (r() < 0.5 ? -1 : 1), h, 1);
        bolt.rotation.set(0, Math.atan2(camera.position.x - bolt.position.x, camera.position.z - bolt.position.z), 0);
        boltTex.offset.x = Math.floor(r(0, 3)) / 3;
        boltUntil = t0 + 0.25;
      }
    }
    flash = 0;
    for (const [t0, a] of pulses) if (t >= t0) flash = Math.max(flash, a * Math.exp(-(t - t0) * 14));
    bolt.visible = t < boltUntil && flash > 0.02;
    boltMat.opacity = Math.min(1, flash * 1.5);
  }

  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    accent.set(p.accent);
    skyUni.uZenith.value.set(d ? "#05080f" : "#3d7fcf");
    skyUni.uHorizon.value.set(d ? "#1a2230" : "#d4e8f5");
    skyUni.uCloudDark.value.set(d ? "#080c14" : "#b4c4d4");
    skyUni.uCloudLight.value.set(d ? "#232d3d" : "#ffffff");
    skyUni.uCover.value = d ? 0.86 : 0.5;
    const oa = d ? -0.5 : -0.42, oe = d ? 0.42 : 0.24; // the moon high behind the storm; the sun over the sea to the left
    skyUni.uOrbDir.value.set(Math.sin(oa) * Math.cos(oe), Math.sin(oe), -Math.cos(oa) * Math.cos(oe));
    skyUni.uOrbCol.value.set(d ? "#8494b4" : "#fff3dc").multiplyScalar(d ? 0.7 : 1.6);
    skyUni.uOrbSize.value = d ? 0.018 : 0.016;
    scene.fog.color.copy(skyUni.uHorizon.value); scene.fog.near = d ? 60 : 400; scene.fog.far = d ? 1100 : 4200;
    hemi.color.set(d ? "#2a3650" : "#d8e8f7"); hemi.groundColor.set(d ? "#07090d" : "#7c705e"); hemi.intensity = d ? 1.3 : 1.4;
    key.color.set(d ? "#8da2c8" : "#fff2de"); key.intensity = d ? 0.25 : 2.8;
    key.position.set(d ? -40 : -80, d ? 70 : 55, d ? -30 : 25);
    amp = d ? 1 : 0.22;
    seaUni.uAmp.value = amp;
    seaUni.uDeep.value.set(d ? "#03070d" : "#0c4a74");
    seaUni.uScatter.value.set(d ? "#0a1c24" : "#1d8f95").multiplyScalar(d ? 0.6 : 0.5);
    seaUni.uFogNear.value = d ? 120 : 700; seaUni.uFogFar.value = d ? 1500 : 3400;
    seaUni.uRipple.value = d ? 0.55 : 0.17; seaUni.uRippleScale.value = d ? 1 : 6;
    seaUni.uOrbCol.value.set("#fff3dc"); seaUni.uGlitter.value = d ? 0 : 4.5; seaUni.uReflect.value = d ? 1 : 0.8;
    seaUni.uLampCol.value.set("#ffe2b8"); seaUni.uLampOn.value = d ? 1 : 0;
    seaUni.uShipCol.value.set(d ? "#fff0d8" : "#000000").multiplyScalar(0.8);
    seaUni.uBeamOn.value = d ? 1 : 0;
    seaUni.uFoamCol.value.set(d ? "#8494a8" : "#f4f8fb"); seaUni.uFoamOn.value = d ? 1 : 0.2;
    rockFoam = d ? 0.95 : 0.6;
    glassMat.color.set(d ? "#ffd9a0" : "#8fa6b4").multiplyScalar(d ? 1.6 : 1);
    winMat.color.set(d ? "#ffc27a" : "#37424c").multiplyScalar(d ? 1.4 : 1);
    accentMat.color.copy(accent); shipAccentMat.color.copy(accent);
    shipLitMat.color.set(d ? "#ffcf8a" : "#3a4550").multiplyScalar(d ? 1.3 : 1);
    for (const o of [lampGlow, flare, streak, rain, beamRain, ...beams, ...navLights]) o.visible = d;
    curtains.forEach((c) => { c.m.visible = d; });
    gullMesh.visible = !d;
    rainUni.uColor.value.set("#a4b3c8"); rainUni.uAlpha.value = 0.4;
    sprayUni.uColor.value.set(d ? "#a3b1c4" : "#ffffff"); sprayUni.uAlpha.value = d ? 0.5 : 0.55;
    curtainCol.set("#3a4658");
  }
  let rockFoam = 0.9;
  applyPalette(pal);

  const look = new THREE.Vector3();
  function layout() {
    const A = camera.aspect || 1, fov = A >= 1 ? 45 : 45 + (1 - A) * 22; // a phone held upright gets a wider lens
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); TAN = Math.tan((fov * Math.PI) / 360); }
    lhX = halfW(D) * (0.1 + 0.3 * sm(0.45, 1.3, A)); // the lighthouse at the right third; nearer the middle on a phone
    lh.position.set(lhX, 0, -D);
    lamp.set(lhX, LAMP_Y, -D);
    seaUni.uLampPos.value.copy(lamp);
    seaUni.uRocks.value[0].set(lhX, -D, 12.5, rockFoam);
    seaUni.uRocks.value[1].set(lhX + 23, -D + 5, 4, rockFoam);
  }
  function frame(dt, t) {
    time.value = t;
    layout();
    const cx = Math.sin(t * 0.021) * 2.5; // standing on the headland, shifting a little
    camera.position.set(cx, EYE + Math.sin(t * 0.047) * 0.25, 0);
    camera.lookAt(look.set(cx * 0.3, EYE - 13.5, -300));
    sky.position.copy(camera.position);
    // the beams
    const phi = (((PHI0 + t * OMEGA) % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    beamDir(phi, dirA); beamDir(phi + Math.PI, dirB);
    seaUni.uBeamA.value.copy(dirA); seaUni.uBeamB.value.copy(dirB);
    beams[0].position.copy(lamp); beams[0].quaternion.setFromUnitVectors(UP, dirA);
    beams[1].position.copy(lamp); beams[1].quaternion.setFromUnitVectors(UP, dirB);
    brUni.uPhi.value = phi;
    // how squarely a beam swings towards the viewer (only the direction round the tower counts: the lens throws a tall fan of light)
    toCam.subVectors(camera.position, lamp).setY(0).normalize();
    const face = sm(Math.cos(0.2), Math.cos(0.01), Math.max(dirA.x * toCam.x + dirA.z * toCam.z, dirB.x * toCam.x + dirB.z * toCam.z) / Math.cos(TILT));
    lampGlow.position.copy(lamp); lampGlow.scale.setScalar(9 + face * 8); lampGlowMat.opacity = 0.9;
    flare.position.copy(lamp); flare.scale.setScalar(12 + face * 80); flareMat.opacity = Math.pow(face, 1.5);
    seaUni.uGlint.value = face;
    streak.position.copy(lamp); streak.scale.set(14 + face * 260, 3 + face * 5, 1); streakMat.opacity = face * face * 0.7;
    stepLightning(t);
    flashLight.intensity = flash * 5;
    curtainMat.color.copy(curtainCol).multiplyScalar(1 + flash * 2.5); curtainMat.opacity = 0.35;
    for (const c of curtains) {
      c.m.position.x += c.speed * dt;
      const lim = halfW(c.dist) * 1.3 + c.w / 2;
      if (c.m.position.x > lim) c.m.position.x = -lim;
    }
    stepSpray(dt, t);
    stepShip(dt, t);
    navLights.forEach((m, i) => { m.material.opacity = 0.85 + 0.15 * Math.sin(t * (2.1 + i) + i); });
    if (!pal.dark) stepGulls(dt, t);
  }
  for (let k = 0; k < 60; k++) frame(0.05, -3 + k * 0.05); // spray already in the air on the first (or only) frame
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { let n = 0; for (let k = 0; k < NS; k++) n += sLife[k] > 0 ? 1 : 0; return { spray: n, flash: +flash.toFixed(2), shipX: Math.round(shipX), lhX: Math.round(lhX) }; }, // for checking by hand
    dispose() { scene.fog = null; disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Clockwork: inside a clock tower. Brass wheels driven through a real escapement, the pendulum, and the great dial seen from behind with the real time ---------- */
// The dial is seen from inside the tower, backlit frosted glass with the hands outside it as soft shadows. It reads the right
// way round from the room (a real one would be mirrored from in here, and read as wrong numbers). p = a point on the dial, x to the right, radius 1.
const CW_DIAL_COMMON = /* glsl */ `
  uniform sampler2D uMask; uniform float uHour; uniform float uMinute;
  vec4 cwMask(vec2 p) { return texture2D(uMask, p * 0.5 + 0.5); } // r ironwork, g paint, b pane tint
  float cwHand(vec2 p, float ang, float len, float w, float tail, float blur) {
    vec2 q = p, d = vec2(sin(ang), cos(ang)); // clockwise from twelve
    float along = dot(q, d), across = abs(q.x * d.y - q.y * d.x);
    float inLen = smoothstep(-tail - blur, -tail + blur, along) * (1.0 - smoothstep(len - blur, len + blur, along));
    float wd = w * mix(1.0, 0.45, clamp(along / len, 0.0, 1.0));
    return inLen * (1.0 - smoothstep(wd - blur, wd + blur, across));
  }
  float cwHands(vec2 p, float blur) { return max(cwHand(p, uHour, 0.52, 0.05, 0.12, blur), cwHand(p, uMinute, 0.84, 0.034, 0.15, blur)); }
  // how much light comes through at p: none through the ironwork, less through the paint and in the hands' shadows
  float cwPass(vec2 p, float blur) {
    vec4 m = cwMask(p);
    return (1.0 - m.r) * (1.0 - m.g * 0.9) * (1.0 - cwHands(p, blur) * 0.85) * step(length(p), 0.995);
  }
`;
const CW_DIAL_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const CW_DIAL_FS = /* glsl */ `
  ${CW_DIAL_COMMON}
  uniform vec3 uOutTop; uniform vec3 uOutBottom; uniform vec3 uGlow; uniform vec2 uGlowPos; uniform float uGlowSize;
  uniform vec3 uIron; uniform vec3 uCity; uniform float uNight; uniform float uTime;
  varying vec2 vUv;
  float cwHash(vec2 q) { return fract(sin(dot(q, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    vec4 m = cwMask(p);
    vec3 light = mix(uOutBottom, uOutTop, smoothstep(-1.0, 1.0, p.y)) + uGlow * exp(-distance(p, uGlowPos) * uGlowSize); // the sky, and the sun or moon behind the glass
    light *= 0.86 + 0.28 * m.b; // each pane a little different
    if (uNight > 0.0) { // the town below, its lights soft and round through the frosted glass
      vec2 g = p * 8.0, cell = floor(g), f = fract(g) - 0.5;
      float h = cwHash(cell), d = length(f - (vec2(cwHash(cell + 3.1), cwHash(cell + 7.7)) - 0.5) * 0.6);
      float lit = step(0.42, h) * smoothstep(0.34, 0.08, d) * smoothstep(0.05, -0.5, p.y) * (0.75 + 0.25 * sin(uTime * (0.4 + h * 1.5) + h * 40.0));
      vec3 lc = mix(vec3(1.0, 0.7, 0.38), vec3(0.72, 0.84, 1.0), step(0.82, cwHash(cell + 1.3)));
      light += (lc * lit * 0.55 + uCity * smoothstep(0.25, -0.95, p.y)) * uNight;
    }
    light *= (1.0 - m.g * 0.9) * (1.0 - cwHands(p, 0.03) * 0.85);
    gl_FragColor = vec4(mix(light, uIron, m.r), 1.0);
    #include <colorspace_fragment>
  }
`;
// god rays: the volume the dial lets light into is traced per pixel (the ray's shadow on the glass is a straight line,
// so where it enters and leaves is a quadratic), sampling the ironwork, the numerals and the hands on the way
const CW_WORLD_VS = /* glsl */ `
  varying vec3 vWorld;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const CW_SHAFT_FS = /* glsl */ `
  ${CW_DIAL_COMMON}
  uniform vec3 uL; uniform vec3 uD; uniform float uR; uniform float uGlassZ; uniform float uLen; uniform float uFloorY; uniform vec3 uColor; uniform float uTime;
  uniform sampler2D uNoise;
  varying vec3 vWorld;
  vec2 onGlass(vec3 x) { return (x.xy + uL.xy * (uGlassZ - x.z) / uL.z - uD.xy) / uR; }
  void main() {
    vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
    vec2 q0 = onGlass(ro), qd = (rd.xy - uL.xy * rd.z / uL.z) / uR;
    float a = dot(qd, qd), b = 2.0 * dot(q0, qd), c = dot(q0, q0) - 1.0, disc = b * b - 4.0 * a * c;
    if (disc <= 0.0 || a < 1e-8) discard;
    float sq = sqrt(disc), t0 = (-b - sq) / (2.0 * a), t1 = (-b + sq) / (2.0 * a);
    float s0 = (ro.z - uGlassZ) / -uL.z, sd = rd.z / -uL.z; // distance into the room along the light
    if (abs(sd) > 1e-5) { float ta = -s0 / sd, tb = (uLen - s0) / sd; t0 = max(t0, min(ta, tb)); t1 = min(t1, max(ta, tb)); }
    if (rd.y < 0.0) t1 = min(t1, (uFloorY - ro.y) / rd.y);
    t0 = max(t0, 0.0);
    if (t1 <= t0) discard;
    float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715)))); // per-pixel jitter instead of banding
    float dt = (t1 - t0) / float(CW_STEPS), sum = 0.0;
    for (int i = 0; i < CW_STEPS; i++) {
      vec3 x = ro + rd * (t0 + dt * (float(i) + j));
      float s = (x.z - uGlassZ) / -uL.z;
      float haze = 0.55 + 0.9 * texture2D(uNoise, x.xz * 0.11 + vec2(x.y * 0.05, uTime * 0.004)).r;
      sum += cwPass(onGlass(x), 0.04) * pow(max(1.0 - s / uLen, 0.0), 1.4) * haze;
    }
    gl_FragColor = vec4(uColor * sum * dt, 1.0);
  }
`;
// the dial's light on the floor (and its shadows of ironwork, numerals and hands)
const CW_PATCH_FS = /* glsl */ `
  ${CW_DIAL_COMMON}
  uniform vec3 uL; uniform vec3 uD; uniform float uR; uniform float uGlassZ; uniform vec3 uColor; uniform sampler2D uFloor; uniform vec2 uFloorRep;
  varying vec3 vWorld;
  void main() {
    vec2 q = (vWorld.xy + uL.xy * (uGlassZ - vWorld.z) / uL.z - uD.xy) / uR;
    float pass = cwPass(q, 0.015 + 0.02 * length(q));
    gl_FragColor = vec4(uColor * texture2D(uFloor, vWorld.xz * uFloorRep).rgb * pass, 1.0);
  }
`;
// dust drifting in the room, glinting where the light from the dial falls on it
const CW_DUST_VS = /* glsl */ `
  ${CW_DIAL_COMMON}
  uniform vec3 uL; uniform vec3 uD; uniform float uR; uniform float uGlassZ; uniform vec3 uBox; uniform vec3 uBoxC; uniform float uPx; uniform float uTime;
  attribute vec4 aSeed;
  varying float vLit; varying float vTw;
  void main() {
    vec3 p = aSeed.xyz * uBox + vec3(sin(uTime * 0.07 + aSeed.w * 6.3), sin(uTime * 0.05 + aSeed.w * 12.1) * 0.6 - uTime * 0.015, cos(uTime * 0.06 + aSeed.w * 9.2)) * 0.7;
    p = uBoxC + mod(p, uBox) - uBox * 0.5;
    vLit = cwPass((p.xy + uL.xy * (uGlassZ - p.z) / uL.z - uD.xy) / uR, 0.04) * step(uGlassZ, p.z);
    vTw = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed.w * 2.0) + aSeed.w * 30.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((0.014 + 0.012 * aSeed.w) * uPx / -mv.z, 1.0, 7.0);
  }
`;
const CW_DUST_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uBase;
  varying float vLit; varying float vTw;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float a = smoothstep(1.0, 0.2, length(p));
    gl_FragColor = vec4(uColor * (uBase + vLit * vTw) * a, 1.0);
  }
`;
/** A clock wheel or pinion (teeth ≤ 12 get a pinion's rounder leaves), extruded along z and centred on z = 0; `spokes` cuts crossings. */
function cwWheel(THREE, teeth, m, depth, spokes = 0, detail = 8) {
  const rp = (m * teeth) / 2, ra = rp + m * 0.95, rr = rp - m * 1.2, p = (2 * Math.PI) / teeth;
  const prof = teeth <= 12 ? [[rr, 0.3], [rp, 0.26], [rp + 0.5 * (ra - rp), 0.23], [ra - 0.2 * (ra - rp), 0.17], [ra, 0.09]] : [[rr, 0.29], [rp, 0.25], [rp + 0.55 * (ra - rp), 0.2], [ra, 0.12]];
  const shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const c = i * p, pts = [[rr, c - p / 2], ...prof.map(([r, w]) => [r, c - w * p]), ...prof.slice().reverse().map(([r, w]) => [r, c + w * p])];
    pts.forEach(([r, a], k) => (i === 0 && k === 0 ? shape.moveTo(Math.cos(a) * r, Math.sin(a) * r) : shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)));
  }
  shape.closePath();
  if (spokes) cwCrossings(THREE, shape, spokes, rr - Math.max(m * 1.6, rp * 0.1), Math.max(rp * 0.2, 0.09), Math.max(0.035, rp * 0.1));
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: Math.min(0.012, depth * 0.15), bevelSize: Math.min(0.01, m * 0.15), bevelSegments: 1, curveSegments: detail });
  geo.translate(0, 0, -depth / 2);
  return geo;
}
/** Cut the openings between a wheel's crossings (spokes), between the rim (ri) and the hub (rh). */
function cwCrossings(THREE, shape, spokes, ri, rh, sw) {
  for (let k = 0; k < spokes; k++) {
    const a0 = (k / spokes) * Math.PI * 2 + Math.PI / 2, a1 = a0 + (Math.PI * 2) / spokes;
    const o0 = Math.asin(sw / 2 / ri), o1 = Math.asin(Math.min(0.95, sw / 2 / rh));
    const hole = new THREE.Path();
    hole.absarc(0, 0, ri, a0 + o0, a1 - o0, false);
    hole.absarc(0, 0, rh, a1 - o1, a0 + o1, true);
    hole.closePath();
    shape.holes.push(hole);
  }
}
/** The escape wheel: pointed teeth leaning the way it turns (clockwise), four crossings. */
function cwEscapeWheel(THREE, R, depth, teeth = 15) {
  const rr = R * 0.78, p = (2 * Math.PI) / teeth, shape = new THREE.Shape();
  for (let i = 0; i < teeth; i++) {
    const c = i * p;
    [[rr, c], [R, c - 0.12 * p], [R * 0.95, c + 0.1 * p], [rr * 1.04, c + 0.45 * p], [rr, c + 0.6 * p]].forEach(([r, a], k) => (i === 0 && k === 0 ? shape.moveTo(Math.cos(a) * r, Math.sin(a) * r) : shape.lineTo(Math.cos(a) * r, Math.sin(a) * r)));
  }
  shape.closePath();
  cwCrossings(THREE, shape, 4, rr - R * 0.1, R * 0.22, R * 0.1);
  const geo = new THREE.ExtrudeGeometry(shape, { depth, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 1, curveSegments: 6 });
  geo.translate(0, 0, -depth / 2);
  return geo;
}
/** Placed boxes and cylinders as one geometry: frames, brackets, the anchor. Bars: [x1, y1, x2, y2, width]; bosses: [x, y, radius]. */
function cwBars(THREE, bars, bosses, depth) {
  const parts = [];
  for (const [x1, y1, x2, y2, w] of bars) {
    const len = Math.hypot(x2 - x1, y2 - y1);
    parts.push([new THREE.BoxGeometry(len + w * 0.6, w, depth), new THREE.Matrix4().compose(new THREE.Vector3((x1 + x2) / 2, (y1 + y2) / 2, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.atan2(y2 - y1, x2 - x1))), new THREE.Vector3(1, 1, 1))]);
  }
  for (const [x, y, r, d = depth * 1.3] of bosses) parts.push([new THREE.CylinderGeometry(r, r, d, 28), new THREE.Matrix4().compose(new THREE.Vector3(x, y, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1))]);
  return mergeParts(THREE, parts);
}
/** The great dial as seen from the room: r = ironwork, g = paint (numerals, minute track), b = each pane's tint. */
function cwDialMask(S) {
  const c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d"), k = S / 2, r = koiRng(4242), TAU = Math.PI * 2;
  g.fillStyle = "#000"; g.fillRect(0, 0, S, S);
  g.translate(k, k);
  g.globalCompositeOperation = "lighter";
  const sector = (r0, r1, a0, a1) => { g.beginPath(); g.arc(0, 0, r1 * k, a0, a1); g.arc(0, 0, r0 * k, a1, a0, true); g.closePath(); g.fill(); };
  for (const [r0, r1, n] of [[0.08, 0.41, 12], [0.4, 0.71, 24], [0.7, 0.97, 12]]) {
    for (let i = 0; i < n; i++) { g.fillStyle = `rgb(0,0,${Math.round(r(70, 255))})`; sector(r0, r1, (i / n) * TAU - 0.01, ((i + 1) / n) * TAU + 0.01); }
  }
  // paint: the minute track and the numerals, the tops of the numerals towards the rim
  g.fillStyle = g.strokeStyle = "rgb(0,255,0)";
  g.lineWidth = 0.007 * k;
  for (const rr of [0.878, 0.952]) { g.beginPath(); g.arc(0, 0, rr * k, 0, TAU); g.stroke(); }
  for (let i = 0; i < 60; i++) {
    const a = (i / 60) * TAU, big = i % 5 === 0, w = (big ? 0.016 : 0.007) * k;
    g.save(); g.rotate(a); g.fillRect(-w / 2, -0.95 * k, w, (big ? 0.07 : 0.045) * k); g.restore();
  }
  const NUM = ["XII", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI"];
  g.font = `bold ${Math.round(0.108 * k)}px "Times New Roman", Georgia, serif`;
  g.textAlign = "center"; g.textBaseline = "middle";
  NUM.forEach((t, i) => { const a = (i / 12) * TAU; g.fillText(t, Math.sin(a) * 0.79 * k, -Math.cos(a) * 0.79 * k); }); // upright, so every numeral reads the right way up
  // ironwork: rings, the bars between the panes, the hub
  g.fillStyle = g.strokeStyle = "rgb(255,0,0)";
  for (const [rr, w] of [[0.982, 0.036], [0.705, 0.022], [0.405, 0.02], [0.12, 0.03]]) { g.lineWidth = w * k; g.beginPath(); g.arc(0, 0, rr * k, 0, TAU); g.stroke(); }
  g.beginPath(); g.arc(0, 0, 0.085 * k, 0, TAU); g.fill();
  const bar = (a, r0, r1, w) => { g.save(); g.rotate(a); g.fillRect(-w * k / 2, -r1 * k, w * k, (r1 - r0) * k); g.restore(); };
  for (let i = 0; i < 12; i++) { bar((i / 12) * TAU + TAU / 24, 0.7, 0.97, 0.013); bar((i / 12) * TAU, 0.1, 0.41, 0.012); }
  for (let i = 0; i < 24; i++) bar((i / 24) * TAU, 0.4, 0.71, 0.01);
  return c;
}
/** The setting dial on the movement: white enamel, read from the room the right way round. */
function cwSettingFace(THREE, S) {
  return canvasTexture(THREE, S, S, (g) => {
    const k = S / 2, TAU = Math.PI * 2;
    g.translate(k, k);
    const grad = g.createRadialGradient(-0.3 * k, -0.3 * k, 0, 0, 0, k);
    grad.addColorStop(0, "#fbf8f1"); grad.addColorStop(1, "#e4ddcd");
    g.fillStyle = grad; g.beginPath(); g.arc(0, 0, k, 0, TAU); g.fill();
    g.fillStyle = g.strokeStyle = "#1d1c1a";
    g.lineWidth = 0.012 * k;
    for (const rr of [0.93, 0.83]) { g.beginPath(); g.arc(0, 0, rr * k, 0, TAU); g.stroke(); }
    for (let i = 0; i < 60; i++) { const w = (i % 5 ? 0.008 : 0.022) * k; g.save(); g.rotate((i / 60) * TAU); g.fillRect(-w / 2, -0.93 * k, w, 0.1 * k); g.restore(); }
    g.font = `${Math.round(0.15 * k)}px "Times New Roman", Georgia, serif`;
    g.textAlign = "center"; g.textBaseline = "middle";
    for (let i = 1; i <= 12; i++) { const a = (i / 12) * TAU; g.fillText(String(i), Math.sin(a) * 0.68 * k, -Math.cos(a) * 0.68 * k); }
  });
}
/** Old brick in a running bond (a 4 m × 2 m tile). */
function cwBrick(THREE, W, H) {
  const r = koiRng(77);
  const tex = canvasTexture(THREE, W, H, (g) => {
    g.fillStyle = "#2c211c"; g.fillRect(0, 0, W, H);
    const bw = W / 17.4, bh = H / 26.7, gap = Math.max(1, W / 512);
    for (let row = 0, y = 0; y < H; row++, y += bh) {
      for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) {
        const l = r(0.75, 1.15), h = r(-8, 8);
        g.fillStyle = `hsl(${14 + h}, ${r(30, 45)}%, ${Math.round(24 * l)}%)`;
        g.fillRect(x + gap, y + gap, bw - gap * 2, bh - gap * 2);
        for (let s = 0; s < 3; s++) { g.fillStyle = `rgba(${r() < 0.5 ? "0,0,0" : "255,220,190"},${r(0.03, 0.08)})`; g.fillRect(x + r(0, bw * 0.7), y + r(0, bh * 0.6), r(bw * 0.1, bw * 0.4), r(bh * 0.15, bh * 0.4)); }
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
/** Worn floorboards running away from the viewer (a 4 m × 4 m tile). */
function cwPlanks(THREE, W, H) {
  const r = koiRng(515);
  const tex = canvasTexture(THREE, W, H, (g) => {
    const pw = W / 20;
    for (let i = 0; i < 20; i++) {
      const x0 = i * pw;
      for (let y = -r(0, H), n = 0; y < H && n < 6; n++) {
        const len = r(H * 0.4, H * 1.1), l = r(0.8, 1.15);
        g.fillStyle = `hsl(${26 + r(-4, 4)}, ${r(30, 42)}%, ${Math.round(22 * l)}%)`;
        g.fillRect(x0, y, pw, len);
        for (let s = 0; s < 7; s++) { g.strokeStyle = `rgba(${r() < 0.6 ? "20,10,4" : "255,215,170"},${r(0.05, 0.14)})`; g.lineWidth = r(0.6, 2); g.beginPath(); const gx = x0 + r(2, pw - 2); g.moveTo(gx, y); g.bezierCurveTo(gx + r(-3, 3), y + len * 0.3, gx + r(-3, 3), y + len * 0.7, gx + r(-2, 2), y + len); g.stroke(); }
        g.fillStyle = "rgba(10,6,3,0.7)"; g.fillRect(x0, y + len - 1.5, pw, 1.5);
        y += len;
      }
      g.fillStyle = "rgba(8,5,3,0.8)"; g.fillRect(x0, 0, Math.max(1, W / 700), H);
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
/** What the brass reflects: the tower room with a dial in each of its four walls (and at night the work lamp). */
function cwEnv(THREE, dark) {
  const tex = canvasTexture(THREE, 512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, dark ? "#06070b" : "#241a13"); grad.addColorStop(0.42, dark ? "#141824" : "#6e4d36");
    grad.addColorStop(0.58, dark ? "#0f111a" : "#5e412d"); grad.addColorStop(1, dark ? "#060608" : "#35261a");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (const u of [0, 0.25, 0.5, 0.75, 1]) { // equirect: u 0.25 = −z (the dial ahead), 0.75 = +z (behind the viewer)
      const cx = u * w, cy = h * 0.4, rad = h * (u === 0.25 ? 0.16 : 0.12);
      const rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
      rg.addColorStop(0, dark ? "rgba(150,170,230,1)" : "rgba(255,248,232,1)"); rg.addColorStop(0.75, dark ? "rgba(80,95,160,0.9)" : "rgba(255,222,172,0.95)"); rg.addColorStop(1, "rgba(0,0,0,0)");
      g.fillStyle = rg; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    }
    // the room behind the viewer (what a wheel's face mirrors): warm light on the far wall, at night from the lamp
    const cx = w * 0.75, cy = h * 0.5, rad = h * 0.34, rg = g.createRadialGradient(cx, cy, 0, cx, cy, rad);
    rg.addColorStop(0, dark ? "rgba(255,196,130,0.9)" : "rgba(255,226,180,0.75)"); rg.addColorStop(1, "rgba(255,170,90,0)");
    g.fillStyle = rg; g.fillRect(cx - rad, cy - rad, rad * 2, rad * 2);
    if (dark) { const lx = w * 0.62, ly = h * 0.3, lg = g.createRadialGradient(lx, ly, 0, lx, ly, h * 0.12); lg.addColorStop(0, "rgba(255,220,170,1)"); lg.addColorStop(1, "rgba(255,160,80,0)"); g.fillStyle = lg; g.fillRect(lx - h * 0.12, ly - h * 0.12, h * 0.24, h * 0.24); }
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
/** The light's volume behind a round window: its walls run from the window's rim along −L (an oblique cylinder, outward-facing). */
function cwShell(THREE, L, R, len, segs = 64, rings = 12) {
  const pos = new Float32Array((segs + 1) * (rings + 1) * 3), idx = [];
  for (let j = 0; j <= rings; j++) {
    const s = (len * j) / rings;
    for (let i = 0; i <= segs; i++) { const a = (i / segs) * Math.PI * 2; pos.set([Math.cos(a) * R - L.x * s, Math.sin(a) * R - L.y * s, -L.z * s], (j * (segs + 1) + i) * 3); }
  }
  for (let j = 0; j < rings; j++) for (let i = 0; i < segs; i++) { const a = j * (segs + 1) + i, b = a + 1, c = a + segs + 1, d = c + 1; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setIndex(idx);
  return g;
}
/** A soft ring of light round the window on the wall (on black, gamma-encoded like lhGlow). */
function cwRimGlow(THREE) {
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d"), img = g.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const d = Math.hypot(x + 0.5 - S / 2, y + 0.5 - S / 2) / (S / 2); // 0.625 = the window's rim
    const v = d < 0.62 || d > 1 ? 0 : Math.exp(-(d - 0.62) * 16) * Math.pow(1 - d, 0.5);
    const e = Math.round(Math.pow(v, 1 / 2.2) * 255), o = (y * S + x) * 4;
    img.data[o] = img.data[o + 1] = img.data[o + 2] = e; img.data[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
function clockwork(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const TAU = Math.PI * 2;
  const r = koiRng(1859);
  const V = new THREE.Vector3();
  camera.fov = 50; camera.near = 0.1; camera.far = 80;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  const D = new THREE.Vector3(3.1, 4.0, 0), R = 3.0, GLASS_Z = -0.3; // the great dial: centre, radius, the glass set back in the wall
  const time = { value: 0 };
  const noise = keep(lhNoise(THREE)), glow = keep(lhGlow(THREE));
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  const at = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(1, 1, 1));
  const zAxis = (geo) => { geo.rotateX(Math.PI / 2); return geo; }; // cylinders along z (arbours, bosses)

  /* --- light: the sky and the room, the sun (or the moon) through the dial, the work lamp at night, and what the brass reflects --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.target.position.copy(D);
  const lampLight = new THREE.PointLight(0xffb870, 0, 0, 2);
  scene.add(hemi, sun, sun.target, lampLight);
  let envTex = null;
  const buildEnv = (dark) => { envTex?.dispose(); envTex = cwEnv(THREE, dark); scene.environment = envTex; }; // a new texture: three keeps the old one's PMREM otherwise

  /* --- materials --- */
  const brass = keep(new THREE.MeshStandardMaterial({ color: 0xd8ac58, metalness: 1, roughness: 0.26 }));
  const polished = keep(new THREE.MeshStandardMaterial({ color: 0xe6bd6a, metalness: 1, roughness: 0.15 }));
  const steel = keep(new THREE.MeshStandardMaterial({ color: 0xbcc2ca, metalness: 1, roughness: 0.24 }));
  const blued = keep(new THREE.MeshStandardMaterial({ color: 0x27314a, metalness: 0.85, roughness: 0.3 }));
  const paint = keep(new THREE.MeshStandardMaterial({ metalness: 0.1, roughness: 0.6, envMapIntensity: 0.5 })); // the cast-iron frame, painted in the accent colour
  const iron = keep(new THREE.MeshStandardMaterial({ color: 0x25272b, metalness: 0.6, roughness: 0.55 }));
  const wood = keep(new THREE.MeshStandardMaterial({ map: keep(globeWood(THREE, 512, 256, "#4a3222", 2121)), roughness: 0.8, envMapIntensity: 0.35 })); // the room's reflection map is for the metal: it would wash out wood, brick and boards
  const secMat = keep(new THREE.MeshBasicMaterial()), charcoal = new THREE.Color("#23252b");

  /* --- the room: a brick wall with the dial set into it, floorboards, beams --- */
  const brickTex = keep(cwBrick(THREE, preview ? 512 : 1024, preview ? 256 : 512));
  brickTex.repeat.set(1 / 4, 1 / 2); // a tile is 4 m × 2 m of wall
  const wallShape = new THREE.Shape();
  wallShape.moveTo(-15, -1); wallShape.lineTo(15, -1); wallShape.lineTo(15, 12); wallShape.lineTo(-15, 12); wallShape.closePath();
  const hole = new THREE.Path();
  hole.absarc(D.x, D.y, R + 0.02, 0, TAU, true);
  wallShape.holes.push(hole);
  const wallMat = keep(new THREE.MeshStandardMaterial({ map: brickTex, roughness: 0.95, envMapIntensity: 0.35 }));
  scene.add(new THREE.Mesh(keep(new THREE.ShapeGeometry(wallShape, 48)), wallMat));
  const reveal = new THREE.Mesh(keep(zAxis(new THREE.CylinderGeometry(R + 0.02, R + 0.02, -GLASS_Z + 0.04, 72, 1, true))), keep(new THREE.MeshStandardMaterial({ color: 0x8c7b6a, roughness: 0.9, side: THREE.BackSide, envMapIntensity: 0.35 })));
  reveal.position.set(D.x, D.y, GLASS_Z / 2);
  scene.add(reveal);
  const plankTex = keep(cwPlanks(THREE, preview ? 512 : 1024, preview ? 512 : 1024));
  const floorGeo = keep(new THREE.PlaneGeometry(30, 18));
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0, 8);
  const fp = floorGeo.attributes.position, fuv = floorGeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) fuv.setXY(i, fp.getX(i) / 4, -fp.getZ(i) / 4); // world-based, so the light patch can sample the same boards
  const floorMat = keep(new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.78, envMapIntensity: 0.35 }));
  scene.add(new THREE.Mesh(floorGeo, floorMat));
  const ceilGeo = keep(new THREE.PlaneGeometry(30, 18));
  ceilGeo.rotateX(Math.PI / 2);
  const ceiling = new THREE.Mesh(ceilGeo, keep(new THREE.MeshStandardMaterial({ map: plankTex, color: 0x6b5d52, roughness: 0.9, envMapIntensity: 0.35 })));
  ceiling.position.set(0, 9.2, 8);
  scene.add(ceiling);
  scene.add(new THREE.Mesh(keep(mergeParts(THREE, [
    [new THREE.BoxGeometry(34, 0.42, 0.38), at(0, 8.95, 1.1)], [new THREE.BoxGeometry(34, 0.42, 0.38), at(0, 8.95, 5.6)],
    [new THREE.BoxGeometry(0.38, 0.42, 16), at(7.4, 8.5, 6)], [new THREE.BoxGeometry(0.42, 9.2, 0.42), at(7.8, 4.4, 2.2)], [new THREE.BoxGeometry(0.42, 9.2, 0.42), at(-8.6, 4.4, 2.2)],
  ])), wood));

  /* --- the great dial, backlit; the ring of light it throws on the wall --- */
  const maskTex = keep(new THREE.CanvasTexture(cwDialMask(preview ? 512 : 1024)));
  maskTex.anisotropy = 4;
  const dialUni = {
    uMask: { value: maskTex }, uHour: { value: 0 }, uMinute: { value: 0 }, uOutTop: { value: new THREE.Color() }, uOutBottom: { value: new THREE.Color() },
    uGlow: { value: new THREE.Color() }, uGlowPos: { value: new THREE.Vector2() }, uGlowSize: { value: 3 }, uIron: { value: new THREE.Color() }, uCity: { value: new THREE.Color() }, uNight: { value: 0 }, uTime: time,
  };
  const dial = new THREE.Mesh(keep(new THREE.CircleGeometry(R, 96)), keep(new THREE.ShaderMaterial({ uniforms: dialUni, vertexShader: CW_DIAL_VS, fragmentShader: CW_DIAL_FS })));
  dial.position.set(D.x, D.y, GLASS_Z);
  scene.add(dial);
  const rimMat = keep(new THREE.MeshBasicMaterial({ map: keep(cwRimGlow(THREE)), blending: THREE.AdditiveBlending, transparent: true, depthWrite: false }));
  const rim = new THREE.Mesh(quad, rimMat);
  rim.position.set(D.x, D.y, 0.02); rim.scale.setScalar((2 * R) / 0.62);
  scene.add(rim);

  /* --- the light through the dial: god rays (traced per pixel), its patch on the floor, dust glinting in it --- */
  const common = { uMask: dialUni.uMask, uHour: dialUni.uHour, uMinute: dialUni.uMinute };
  const shaftUni = { ...common, uL: { value: new THREE.Vector3(0, 0, -1) }, uD: { value: D.clone() }, uR: { value: R }, uGlassZ: { value: GLASS_Z }, uLen: { value: 12 }, uFloorY: { value: 0 }, uColor: { value: new THREE.Color() }, uTime: time, uNoise: { value: noise } };
  const shaftMat = keep(new THREE.ShaderMaterial({ uniforms: shaftUni, vertexShader: CW_WORLD_VS, fragmentShader: CW_SHAFT_FS, defines: { CW_STEPS: preview ? 8 : 14 }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  const patchUni = { ...common, uL: shaftUni.uL, uD: shaftUni.uD, uR: shaftUni.uR, uGlassZ: shaftUni.uGlassZ, uColor: { value: new THREE.Color() }, uFloor: { value: plankTex }, uFloorRep: { value: new THREE.Vector2(0.25, -0.25) } };
  const patchGeo = keep(new THREE.PlaneGeometry(1, 1));
  patchGeo.rotateX(-Math.PI / 2);
  const patch = new THREE.Mesh(patchGeo, keep(new THREE.ShaderMaterial({ uniforms: patchUni, vertexShader: CW_WORLD_VS, fragmentShader: CW_PATCH_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  patch.renderOrder = 4;
  scene.add(patch);
  let shaft = null;
  function buildShaft(L) { // the light's volume and its patch on the floor follow the sun (or the moon)
    if (shaft) { scene.remove(shaft); shaft.geometry.dispose(); }
    const len = (D.y + R) / L.y + 0.5;
    shaftUni.uLen.value = len * 1.25;
    shaft = new THREE.Mesh(cwShell(THREE, L, R, len, preview ? 40 : 64), shaftMat);
    shaft.position.set(D.x, D.y, GLASS_Z); shaft.frustumCulled = false; shaft.renderOrder = 5;
    scene.add(shaft);
    let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (let i = 0; i < 24; i++) {
      const a = (i / 24) * TAU, qx = D.x + Math.cos(a) * R, qy = D.y + Math.sin(a) * R, s = qy / L.y;
      const x = qx - L.x * s, z = GLASS_Z - L.z * s;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x); z0 = Math.min(z0, z); z1 = Math.max(z1, z);
    }
    z0 = Math.max(z0, 0.02);
    patch.position.set((x0 + x1) / 2, 0.006, (z0 + z1) / 2); patch.scale.set(x1 - x0 + 0.4, 1, Math.max(0.1, z1 - z0 + 0.4));
  }
  const ND = preview ? 200 : 900, dustSeed = new Float32Array(ND * 4);
  for (let i = 0; i < ND; i++) dustSeed.set([r(), r(), r(), r()], i * 4);
  const dustGeo = keep(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ND * 3), 3));
  dustGeo.setAttribute("aSeed", new THREE.BufferAttribute(dustSeed, 4));
  const dustUni = { ...common, uL: shaftUni.uL, uD: shaftUni.uD, uR: shaftUni.uR, uGlassZ: shaftUni.uGlassZ, uBox: { value: new THREE.Vector3(13, 8.5, 8) }, uBoxC: { value: new THREE.Vector3(0.5, 4.4, 4.2) }, uPx: { value: 600 }, uTime: time, uColor: { value: new THREE.Color() }, uBase: { value: 0.05 } };
  const dust = new THREE.Points(dustGeo, keep(new THREE.ShaderMaterial({ uniforms: dustUni, vertexShader: CW_DUST_VS, fragmentShader: CW_DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  dust.frustumCulled = false; dust.renderOrder = 6;
  scene.add(dust);
  const buf = new THREE.Vector2();
  dust.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); dustUni.uPx.value = buf.y / (2 * Math.tan((camera.fov * Math.PI) / 360)); };

  /* --- the movement: great wheel → centre wheel (one turn an hour) → third wheel → escape wheel (one turn a minute), anchor and pendulum --- */
  // the movement stands on a timber bed out in the room, nearer the viewer than the dial; its centre arbour level with the dial's
  const mv = new THREE.Group(), MS = 0.85, MX = 0.25, MY = D.y * (1 - MS), MZ = 1.3;
  mv.position.set(MX, MY, MZ); mv.scale.setScalar(MS);
  scene.add(mv);
  const M1 = 0.0375, M2 = 0.03, M3 = 0.025, det = preview ? 4 : 8; // tooth sizes of the three meshings
  const toward = (p, d, deg) => [p[0] + d * Math.cos((deg * Math.PI) / 180), p[1] + d * Math.sin((deg * Math.PI) / 180)];
  const PC = [-2.7, D.y], PG = toward(PC, (M1 * (96 + 12)) / 2, 230), PT = toward(PC, (M2 * (80 + 8)) / 2, 140), PE = toward(PT, (M3 * (60 + 10)) / 2, 60), PA = [PE[0], PE[1] + 0.72];
  const FRONT = 3.35, BACK = 0.75;
  const arbour = (p, parts) => { // one arbour: everything on it turns together, one mesh per material
    const g = new THREE.Group(), byMat = new Map();
    g.position.set(p[0], p[1], 0);
    for (const [geo, mat, z] of parts) { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push([geo, at(0, 0, z)]); }
    for (const [mat, list] of byMat) g.add(new THREE.Mesh(keep(mergeParts(THREE, list)), mat));
    mv.add(g);
    return g;
  };
  const shaftGeo = (rad, z0, z1) => { const g = zAxis(new THREE.CylinderGeometry(rad, rad, z1 - z0, 12)); g.translate(0, 0, (z0 + z1) / 2); return g; };
  const collar = (rad, z) => [zAxis(new THREE.CylinderGeometry(rad, rad, 0.06, 20)), brass, z];
  const gArb = arbour(PG, [[cwWheel(THREE, 96, M1, 0.1, 6, det), brass, 1.55], [shaftGeo(0.05, BACK - 0.08, FRONT + 0.1), steel, 0], collar(0.14, 1.66),
    [zAxis(new THREE.CylinderGeometry(0.5, 0.5, 0.8, 48)), wood, 2.5], [zAxis(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 48)), brass, 2.08], [zAxis(new THREE.CylinderGeometry(0.62, 0.62, 0.05, 48)), brass, 2.92]]);
  const cArb = arbour(PC, [[cwWheel(THREE, 12, M1, 0.24, 0, det), steel, 1.55], [cwWheel(THREE, 80, M2, 0.08, 5, det), brass, 2.2], [shaftGeo(0.045, 0.28, FRONT + 0.1), steel, 0], collar(0.12, 2.29)]);
  const tArb = arbour(PT, [[cwWheel(THREE, 8, M2, 0.2, 0, det), steel, 2.2], [cwWheel(THREE, 60, M3, 0.07, 5, det), brass, 2.85], [shaftGeo(0.035, BACK - 0.08, FRONT + 0.1), steel, 0], collar(0.09, 2.93)]);
  const eArb = arbour(PE, [[cwWheel(THREE, 10, M3, 0.16, 0, det), steel, 2.85], [cwEscapeWheel(THREE, 0.45, 0.05), brass, 3.1], [shaftGeo(0.03, BACK - 0.08, FRONT + 0.1), steel, 0], collar(0.07, 3.16)]);
  // the frame: two cast-iron plates of posts and rails, painted, bosses where the arbours run, a cock on top for the pendulum
  const XL = -5.75, XR = -1.2, YT = 6.6, YB = 0.1, TP = [PA[0], PA[1] + 0.62];
  const frameGeo = keep(cwBars(THREE, [
    [XL, YB, XL, YT, 0.11], [XR, YB, XR, YT, 0.11], [XL, YT, XR, YT, 0.1], [XL, YB, XR, YB, 0.12],
    [XL, PG[1], PG[0], PG[1], 0.07], [PC[0], PC[1], XR, PC[1], 0.07], [...PG, ...PC, 0.06], [...PC, ...PT, 0.06], [...PT, XL, PT[1], 0.06], [PE[0], PE[1], PE[0], YT, 0.06], [...PT, ...PE, 0.05],
    [PA[0] - 0.42, YT, ...TP, 0.07], [PA[0] + 0.42, YT, ...TP, 0.07],
    [XL, YT - 0.65, XL + 0.65, YT, 0.05], [XR, YT - 0.65, XR - 0.65, YT, 0.05], [XL, YB + 0.65, XL + 0.65, YB, 0.05], [XR, YB + 0.65, XR - 0.65, YB, 0.05],
  ], [[...PG, 0.12], [...PC, 0.11], [...PT, 0.09], [...PE, 0.08], [...PA, 0.08], [...TP, 0.09], [XL, YT, 0.09], [XR, YT, 0.09], [XL, YB, 0.09], [XR, YB, 0.09]], 0.08));
  for (const z of [FRONT, BACK]) { const m = new THREE.Mesh(frameGeo, paint); m.position.z = z; mv.add(m); }
  mv.add(new THREE.Mesh(keep(mergeParts(THREE, [[XL, YT], [XR, YT], [XL, YB], [XR, YB]].map((p) => [zAxis(new THREE.CylinderGeometry(0.05, 0.05, FRONT - BACK, 12)), at(p[0], p[1], (FRONT + BACK) / 2)]))), paint));
  const bed = new THREE.Mesh(keep(new THREE.BoxGeometry((XR - XL) * MS + 0.7, MY, (FRONT - BACK) * MS + 0.7)), wood); // the timber bed it stands on
  bed.position.set(MX + ((XL + XR) / 2) * MS, MY / 2, MZ + ((FRONT + BACK) / 2) * MS);
  scene.add(bed);
  // the leading-off work: from the centre arbour back towards the wall, then across to the dial's motion work (turning once an hour: it looks still)
  const cx = PC[0] * MS + MX, cz = 0.28 * MS + MZ;
  scene.add(new THREE.Mesh(keep(mergeParts(THREE, [
    [new THREE.BoxGeometry(0.28, 0.28, 0.26), at(cx, D.y, 0.3)], [new THREE.BoxGeometry(0.28, 0.28, 0.26), at(D.x, D.y, 0.3)],
    [new THREE.BoxGeometry(0.1, 0.1, 0.32), at(D.x - R - 0.55, D.y, 0.14)], [new THREE.BoxGeometry(0.3, 0.3, 0.1), at(D.x - R - 0.55, D.y, 0.02)], // a wall bracket beside the dial, not over it
  ])), iron));
  scene.add(new THREE.Mesh(keep(mergeParts(THREE, [
    [zAxis(new THREE.CylinderGeometry(0.035, 0.035, cz - 0.3, 10)), at(cx, D.y, (cz + 0.3) / 2)],
    [new THREE.CylinderGeometry(0.03, 0.03, D.x - cx, 10), at((cx + D.x) / 2, D.y, 0.3, 0, 0, Math.PI / 2)],
    [zAxis(new THREE.CylinderGeometry(0.03, 0.03, 0.5, 10)), at(D.x, D.y, 0.0)],
  ])), steel));
  const motion = new THREE.Group(); // the motion work at the dial's centre: minute wheel and hour wheel, dark against the glass
  motion.position.set(D.x, D.y, 0);
  const minWheel = new THREE.Mesh(keep(cwWheel(THREE, 40, 0.0125, 0.03, 4, det)), brass), hourWheel = new THREE.Mesh(keep(cwWheel(THREE, 48, 0.0135, 0.03, 4, det)), brass);
  minWheel.position.set(0, 0, -0.07); hourWheel.position.set(0, 0, -0.14);
  motion.add(minWheel, hourWheel);
  scene.add(motion);
  // escapement and pendulum: the anchor rocks with the pendulum and lets the escape wheel on half a tooth at every swing
  const anchor = new THREE.Group();
  anchor.position.set(PA[0], PA[1], 3.1);
  anchor.add(new THREE.Mesh(keep(cwBars(THREE, [[0, 0, -0.25, -0.33, 0.07], [0, 0, 0.25, -0.33, 0.07], [-0.25, -0.33, -0.27, -0.43, 0.05], [0.25, -0.33, 0.27, -0.43, 0.05]], [[0, 0, 0.09]], 0.05)), blued));
  const crutch = new THREE.Mesh(keep(mergeParts(THREE, [[zAxis(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 8)), at(0, 0, 0.25)], [new THREE.CylinderGeometry(0.02, 0.02, 0.92, 8), at(0, -0.46, 0.5)], [new THREE.BoxGeometry(0.02, 0.08, 0.05), at(-0.045, -0.92, 0.52)], [new THREE.BoxGeometry(0.02, 0.08, 0.05), at(0.045, -0.92, 0.52)]])), steel);
  anchor.add(crutch);
  mv.add(anchor);
  const PEND_L = 4.2;
  const pend = new THREE.Group();
  pend.position.set(PA[0], PA[1] + 0.22, 3.62);
  pend.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.02, 0.02, PEND_L - 0.2, 8).translate(0, -(PEND_L - 0.2) / 2, 0)), steel));
  const bob = new THREE.Mesh(keep(new THREE.SphereGeometry(0.42, 40, 24)), polished);
  bob.position.y = -PEND_L; bob.scale.set(1, 1, 0.3);
  pend.add(bob);
  pend.add(new THREE.Mesh(keep(new THREE.CylinderGeometry(0.05, 0.05, 0.16, 12).translate(0, -PEND_L - 0.42, 0)), steel));
  mv.add(pend);
  mv.add(new THREE.Mesh(keep(mergeParts(THREE, [[new THREE.BoxGeometry(0.24, 0.26, 0.5), at(PA[0], PA[1] + 0.36, 3.42)], [new THREE.BoxGeometry(0.1, 0.12, 0.06), at(PA[0], PA[1] + 0.24, 3.62)]])), iron)); // the suspension bracket
  // the setting dial on the frame: the right way round, so the time can be read from the room
  const setDial = new THREE.Group();
  setDial.position.set(-1.38, 1.8, FRONT + 0.1);
  setDial.add(new THREE.Mesh(keep(new THREE.CircleGeometry(0.34, 48)), keep(new THREE.MeshStandardMaterial({ map: keep(cwSettingFace(THREE, preview ? 256 : 512)), roughness: 0.35 }))));
  setDial.add(new THREE.Mesh(keep(new THREE.TorusGeometry(0.345, 0.026, 8, 48)), polished));
  const back = new THREE.Mesh(keep(zAxis(new THREE.CylinderGeometry(0.37, 0.37, 0.08, 40))), paint);
  back.position.z = -0.045;
  setDial.add(back);
  const handGeo = (pts) => { const s = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return keep(new THREE.ShapeGeometry(s)); };
  const hHand = new THREE.Mesh(handGeo([[-0.017, -0.04], [0.017, -0.04], [0.012, 0.13], [0, 0.18], [-0.012, 0.13]]), blued);
  const mHand = new THREE.Mesh(handGeo([[-0.011, -0.05], [0.011, -0.05], [0.007, 0.24], [0, 0.28], [-0.007, 0.24]]), blued);
  const sHand = new THREE.Mesh(handGeo([[-0.005, -0.08], [0.005, -0.08], [0.0025, 0.3], [-0.0025, 0.3]]), secMat);
  hHand.position.z = 0.006; mHand.position.z = 0.011; sHand.position.z = 0.016;
  const cap = new THREE.Mesh(keep(zAxis(new THREE.CylinderGeometry(0.022, 0.022, 0.02, 16))), polished);
  cap.position.z = 0.02;
  setDial.add(hHand, mHand, sHand, cap);
  mv.add(setDial);
  // the work lamp, lit at night: a caged bulb on a cord
  const lamp = new THREE.Group();
  lamp.position.set(-0.45, 5.35, 5.9);
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: 0xffe0b0 }));
  lamp.add(new THREE.Mesh(keep(new THREE.SphereGeometry(0.075, 16, 12)), bulbMat));
  lamp.add(new THREE.Mesh(keep(mergeParts(THREE, [[new THREE.TorusGeometry(0.12, 0.006, 4, 24), at(0, 0.02, 0, Math.PI / 2)], [new THREE.TorusGeometry(0.12, 0.006, 4, 24), at(0, 0, 0)], [new THREE.TorusGeometry(0.12, 0.006, 4, 24), at(0, 0, 0, 0, Math.PI / 2)], [new THREE.CylinderGeometry(0.05, 0.07, 0.1, 12), at(0, 0.14, 0)], [new THREE.CylinderGeometry(0.008, 0.008, 2.5, 6), at(0, 1.44, 0)]])), iron));
  const lampGlowMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffc27a, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  const lampGlow = new THREE.Sprite(lampGlowMat);
  lampGlow.scale.setScalar(1.3);
  lamp.add(lampGlow);
  scene.add(lamp);
  lampLight.position.set(-0.45, 5.2, 5.9);

  /* --- the gears' angles from the time: each meshing keeps a tooth of one in a gap of the other --- */
  const mesh = (beta, pDriven, ratio, driver) => (beta * Math.PI) / 180 + Math.PI - pDriven / 2 - ratio * (driver - (beta * Math.PI) / 180);
  const backOut = (x) => { const c1 = 1.0, c3 = c1 + 1, u = x - 1; return 1 + c3 * u * u * u + c1 * u * u; };
  let tz = new Date().getTimezoneOffset(), tzCheck = 0, shown = 0, beat = 0, swing = 0;
  function tick(now, t) {
    if (t - tzCheck > 60) { tz = new Date().getTimezoneOffset(); tzCheck = t; } // summer time comes and goes
    const s = (((now / 1000 - tz * 60) % 86400) + 86400) % 86400; // local seconds since midnight
    beat = Math.floor(s / 2);
    const f = s - beat * 2;
    shown = beat * 2 - 2 + 2 * backOut(Math.min(1, f / 0.16)); // at each tick the train jumps on two seconds, overshooting a little
    swing = 0.07 * Math.sin((Math.PI * s) / 2); // the pendulum passes the middle as it ticks
    const thC = -TAU * (shown / 3600);
    const thT = mesh(140, TAU / 8, 80 / 8, thC), thE = mesh(60, TAU / 10, 60 / 10, thT), thG = mesh(230, TAU / 96, 12 / 96, thC);
    cArb.rotation.z = thC; tArb.rotation.z = thT; eArb.rotation.z = thE; gArb.rotation.z = thG;
    anchor.rotation.z = swing; pend.rotation.z = swing;
    const minuteA = TAU * ((shown % 3600) / 3600), hourA = TAU * (((shown / 3600) % 12) / 12);
    dialUni.uMinute.value = minuteA; dialUni.uHour.value = hourA;
    minWheel.rotation.z = -minuteA; hourWheel.rotation.z = -hourA;
    mHand.rotation.z = -minuteA; hHand.rotation.z = -hourA; sHand.rotation.z = -TAU * ((shown % 60) / 60);
  }

  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    paint.color.set(p.accent).lerp(charcoal, 0.4).multiplyScalar(0.42); secMat.color.set(p.accent); // painted cast iron: the accent, deepened
    buildEnv(d);
    dialUni.uOutTop.value.set(d ? "#0b1332" : "#fff4de"); dialUni.uOutBottom.value.set(d ? "#1d1833" : "#ffd29a");
    dialUni.uGlow.value.set(d ? "#c2cfff" : "#fffaf0").multiplyScalar(d ? 0.45 : 1.0);
    dialUni.uGlowPos.value.set(d ? -0.45 : 0.42, d ? 0.52 : 0.46); dialUni.uGlowSize.value = d ? 6 : 2.4;
    dialUni.uIron.value.set(d ? "#141519" : "#2b2622"); dialUni.uCity.value.set("#ff9a50").multiplyScalar(0.35); dialUni.uNight.value = d ? 1 : 0;
    const L = (d ? V.set(-0.28, 0.52, -0.8) : V.set(0.32, 0.72, -0.62)).normalize(); // towards the moon, or the sun: high on the right behind the dial
    shaftUni.uL.value.copy(L);
    buildShaft(L);
    shaftUni.uColor.value.set(d ? "#8ea4ff" : "#ffd79c").multiplyScalar(d ? 0.09 : 0.32);
    patchUni.uColor.value.set(d ? "#9fb2ff" : "#ffe0b0").multiplyScalar(d ? 0.35 : 2);
    // no shadows here, so a strong sun would light the whole room through the wall: the rays and the patch on the floor draw the direct light, this is only its glow
    sun.color.set(d ? "#9fb2e8" : "#ffe4bf"); sun.intensity = d ? 0.25 : 0.45; sun.position.copy(D).addScaledVector(L, 20);
    hemi.color.set(d ? "#34405e" : "#ffe6c8"); hemi.groundColor.set(d ? "#0b0a08" : "#4a3322"); hemi.intensity = d ? 0.35 : 0.62;
    lampLight.intensity = d ? 28 : 0; lamp.visible = d;
    dustUni.uColor.value.set(d ? "#b9c7ff" : "#fff0d4"); dustUni.uBase.value = d ? 0.03 : 0.06;
    rimMat.color.set(d ? "#5f70a8" : "#ffcf94"); rimMat.opacity = d ? 0.18 : 0.32;
    wallMat.color.set(d ? "#a9abbd" : "#ffffff"); floorMat.color.set(d ? "#9ea1b4" : "#ffffff");
  }
  applyPalette(pal);

  // wide screens look at the wall with the movement on the left and the dial on the right; a phone held upright looks
  // diagonally past the movement to the dial behind it
  const look = new THREE.Vector3(), CAM = { wide: [-0.9, 5.0, 11, 0.3, 3.4, 0, 50], tall: [-6.3, 4.7, 9.4, 1.4, 3.9, 0, 62] };
  function frame(dt, t) {
    time.value = t;
    tick(Date.now(), t);
    const k = THREE.MathUtils.smoothstep(camera.aspect || 1, 0.6, 1.25), c = CAM.tall.map((v, i) => v + (CAM.wide[i] - v) * k); // 1 = wide, 0 = upright
    if (Math.abs(camera.fov - c[6]) > 0.01) { camera.fov = c[6]; camera.updateProjectionMatrix(); }
    const sway = Math.sin(t * 0.05) * 0.45;
    camera.position.set(c[0] + sway, c[1] + Math.sin(t * 0.037) * 0.12, c[2]);
    camera.lookAt(look.set(c[3] + sway * 0.3, c[4], c[5]));
    lampGlowMat.opacity = 0.85 + 0.05 * Math.sin(t * 7.3) * Math.sin(t * 3.1);
  }
  frame(0, 0);

  return {
    update(dt, t) { frame(dt, t); },
    setPalette: applyPalette,
    stats() { const s = shown % 86400; return { time: `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(Math.floor(s % 60)).padStart(2, "0")}`, beat, swing: +swing.toFixed(3) }; }, // for checking by hand
    dispose() { scene.environment = null; envTex?.dispose(); shaft?.geometry.dispose(); disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Sakura and Fuji: Mount Fuji behind a five-storey pagoda in cherry blossom, petals drifting onto a mirror lake; lanterns and a full moon at night ---------- */
// Mount Fuji, drawn in its quad: a concave cone with a flat crater rim, snow reaching down the gullies, lit from the right, hazy at the foot
const SAKURA_FUJI_FS = /* glsl */ `
  uniform vec3 uRock; uniform vec3 uRockLit; uniform vec3 uSnow; uniform vec3 uSnowShade; uniform vec3 uForest; uniform vec3 uHaze;
  varying vec2 vUv;
  float fh(float x) { return fract(sin(x * 127.1) * 43758.5453); }
  float fn(float x) { float i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f); return mix(fh(i), fh(i + 1.0), f); }
  void main() {
    float x = vUv.x * 2.0 - 1.0, y = vUv.y;
    float s = max(abs(x), 0.045);
    float h = 0.95 * pow(1.0 - s, 1.62) + 0.006 * fn(x * 80.0) * step(abs(x), 0.045) + 0.012 * exp(-pow((x - 0.3) / 0.05, 2.0)); // the crater rim; the Hoei bump on the right flank
    float edge = fwidth(y) * 1.5;
    float inside = 1.0 - smoothstep(h - edge, h + edge, y);
    if (inside <= 0.001) discard;
    float fall = x / max(1.0 - y, 0.05); // constant along a line down from the summit: the gullies
    float gully = fn(fall * 30.0) * 0.6 + fn(fall * 85.0) * 0.4;
    float snowLine = 0.53 + 0.07 * fn(x * 6.0 + 3.0) - 0.14 * pow(gully, 2.5);
    float snow = smoothstep(snowLine - 0.015, snowLine + 0.015, y);
    float lit = smoothstep(-0.3, 0.45, x);
    vec3 rock = mix(uRock, uRockLit, lit) * (0.82 + 0.3 * gully);
    vec3 col = mix(rock, mix(uSnowShade, uSnow, 0.3 + 0.7 * lit) * (0.94 + 0.08 * gully), snow);
    col = mix(uForest, col, smoothstep(0.1, 0.3, y));
    col = mix(col, uHaze, 0.1 + 0.4 * (1.0 - smoothstep(0.0, 0.75, y))); // the air between: the foot of the mountain hazier
    gl_FragColor = vec4(col, inside);
    #include <colorspace_fragment>
  }
`;
// cherry canopies: clusters of blossom as camera-facing quads (a 2 × 2 atlas), swaying in the breeze; near a lantern they glow warm at night
const SAKURA_BLOOM_VS = /* glsl */ `
  uniform float uFlip; uniform float uTime;
  attribute vec4 aBloom; // size, atlas cell, sway phase, lantern light
  attribute vec3 aTint;
  varying vec2 vUv; varying vec3 vTint; varying float vLamp;
  void main() {
    vec4 c = modelViewMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    float sway = sin(uTime * 0.8 + aBloom.z) * 0.05 + sin(uTime * 1.9 + aBloom.z * 2.3) * 0.02;
    vec2 q = position.xy;
    q = vec2(q.x * cos(sway) - q.y * sin(sway), q.x * sin(sway) + q.y * cos(sway));
    c.xy += q * aBloom.x * 2.0;
    gl_Position = projectionMatrix * c;
    vec2 t = vec2(uv.x, uFlip > 0.0 ? uv.y : 1.0 - uv.y);
    vUv = (t + vec2(mod(aBloom.y, 2.0), 1.0 - floor(aBloom.y / 2.0))) * 0.5;
    vTint = aTint; vLamp = aBloom.w;
  }
`;
const SAKURA_BLOOM_FS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uLight; uniform vec3 uLamp;
  varying vec2 vUv; varying vec3 vTint; varying float vLamp;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.06) discard;
    gl_FragColor = vec4(t.rgb * (vTint * uLight + uLamp * vLamp), t.a);
    #include <colorspace_fragment>
  }
`;
// petals: falling on the breeze and tumbling as they go (a box of them round the viewer, wrapping)
const SAKURA_PETAL_VS = /* glsl */ `
  uniform float uTime; uniform vec3 uBoxC; uniform vec3 uBox; uniform vec2 uWind; uniform float uSize;
  attribute vec4 aSeed;
  varying vec2 vUv; varying float vShade;
  void main() {
    float sp = 0.6 + 0.8 * fract(aSeed.w * 7.13);
    vec3 drift = vec3(uWind.x, -0.5 * sp, uWind.y) * uTime + vec3(sin(uTime * 0.7 + aSeed.w * 20.0), 0.0, cos(uTime * 0.5 + aSeed.w * 13.0)) * 0.8;
    vec3 p = uBoxC + mod(aSeed.xyz * uBox + drift, uBox) - uBox * 0.5;
    float a1 = uTime * (1.2 + 2.0 * fract(aSeed.w * 3.7)) + aSeed.w * 30.0, a2 = uTime * (0.7 + 1.4 * fract(aSeed.w * 5.3)) + aSeed.w * 11.0;
    vec3 q = vec3(position.xy * uSize * (0.7 + 0.6 * fract(aSeed.w * 9.1)), 0.0);
    q = vec3(q.x, q.y * cos(a1), q.y * sin(a1));
    q = vec3(q.x * cos(a2) + q.z * sin(a2), q.y, -q.x * sin(a2) + q.z * cos(a2));
    vShade = 0.72 + 0.28 * abs(cos(a1));
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(p + q, 1.0);
  }
`;
// petals afloat on the lake, drifting with the current, rocking a little
const SAKURA_FLOAT_VS = /* glsl */ `
  uniform float uTime; uniform vec3 uBoxC; uniform vec3 uBox; uniform float uSize;
  attribute vec4 aSeed;
  varying vec2 vUv; varying float vShade;
  void main() {
    vec3 p = uBoxC + mod(aSeed.xyz * uBox + vec3(0.12, 0.0, 0.03) * uTime, uBox) - uBox * 0.5;
    float a = aSeed.w * 40.0 + sin(uTime * 0.3 + aSeed.w * 9.0) * 0.4, s = uSize * (0.7 + 0.6 * fract(aSeed.w * 9.1));
    vec2 q = position.xy * s;
    q = vec2(q.x * cos(a) - q.y * sin(a), q.x * sin(a) + q.y * cos(a));
    p += vec3(q.x, 0.02 + 0.01 * sin(uTime * 1.3 + aSeed.w * 17.0), q.y);
    vShade = 0.85 + 0.15 * fract(aSeed.w * 4.7);
    vUv = uv;
    gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
  }
`;
const SAKURA_PETAL_FS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uLight;
  varying vec2 vUv; varying float vShade;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.05) discard;
    gl_FragColor = vec4(t.rgb * uLight * vShade, t.a);
    #include <colorspace_fragment>
  }
`;
// paper lanterns (drawn with LANTERN_VS): plain paper with black rims and a painted 桜 by day, lit from inside at night with a halo
const SAKURA_CHOCHIN_FS = /* glsl */ `
  uniform sampler2D uMap; uniform float uNight;
  varying vec2 vUv; varying vec3 vTint; varying float vLight; varying float vAlpha;
  void main() {
    vec3 m = texture2D(uMap, vUv).rgb;
    vec3 day = vTint * (0.92 - 0.84 * m.b) * m.g;
    vec3 night = vTint * pow(m.r, 2.2) * vLight;
    gl_FragColor = vec4(mix(day, night, uNight) * vAlpha, m.g * vAlpha); // premultiplied: the halo adds light, the paper covers
    #include <colorspace_fragment>
  }
`;
/** One cherry blossom: five notched petals round a deep pink heart. */
function sakuraFlower(g, x, y, rad, fill, rot) {
  g.save(); g.translate(x, y); g.rotate(rot);
  g.fillStyle = fill;
  for (let p = 0; p < 5; p++) {
    g.beginPath(); g.moveTo(0, 0);
    g.bezierCurveTo(-rad * 0.6, -rad * 0.3, -rad * 0.55, -rad * 0.95, -rad * 0.13, -rad);
    g.lineTo(0, -rad * 0.84); g.lineTo(rad * 0.13, -rad);
    g.bezierCurveTo(rad * 0.55, -rad * 0.95, rad * 0.6, -rad * 0.3, 0, 0);
    g.fill();
    g.rotate((Math.PI * 2) / 5);
  }
  g.fillStyle = "rgba(200,55,95,0.9)"; g.beginPath(); g.arc(0, 0, rad * 0.2, 0, Math.PI * 2); g.fill();
  g.restore();
}
const SAKURA_PINKS = ["#ffe3ec", "#ffd3e1", "#ffc2d5", "#fbb0c7", "#fff0f4"];
/** Four clusters of blossom in a 2 × 2 atlas: twigs peeking through, lighter on top where the sky lights them. */
function sakuraClusters(THREE, S) {
  return canvasTexture(THREE, S, S, (g) => {
    const r = koiRng(3141), cell = S / 2;
    for (let c = 0; c < 4; c++) {
      const ox = (c % 2) * cell, oy = Math.floor(c / 2) * cell, cx = ox + cell / 2, cy = oy + cell / 2;
      g.save(); g.beginPath(); g.rect(ox, oy, cell, cell); g.clip();
      g.strokeStyle = "rgba(58,36,34,0.95)"; g.lineCap = "round";
      for (let t = 0; t < 5; t++) {
        g.lineWidth = r(1.2, 3) * (S / 512); g.beginPath();
        g.moveTo(cx + r(-0.15, 0.15) * cell, cy + r(0.25, 0.48) * cell);
        g.quadraticCurveTo(cx + r(-0.25, 0.25) * cell, cy + r(-0.05, 0.1) * cell, cx + r(-0.42, 0.42) * cell, cy + r(-0.42, -0.1) * cell);
        g.stroke();
      }
      const flowers = [];
      for (let k = 0; k < 95; k++) {
        const a = r(0, Math.PI * 2), d = Math.pow(r(), 0.6) * cell * 0.4;
        flowers.push([cx + Math.cos(a) * d, cy + Math.sin(a) * d * 0.82, r(0.042, 0.068) * cell]);
      }
      flowers.sort((p, q) => q[1] - p[1] + (p[2] - q[2]) * 0.1); // the lower, shaded ones first, the sunlit top ones over them
      for (const [fx, fy, fr] of flowers) {
        const low = (fy - oy) / cell; // 0 top … 1 bottom
        const i = Math.min(SAKURA_PINKS.length - 1, Math.max(0, Math.round(low * 3.2 + r(-0.8, 0.8))));
        sakuraFlower(g, fx, fy, fr, SAKURA_PINKS[[4, 0, 1, 2, 3][i]], r(0, 6.28));
      }
      for (let b = 0; b < 8; b++) { g.fillStyle = "rgba(226,92,130,0.95)"; g.beginPath(); g.arc(cx + r(-0.38, 0.38) * cell, cy + r(-0.33, 0.33) * cell, r(0.012, 0.02) * cell, 0, Math.PI * 2); g.fill(); }
      g.restore();
    }
  });
}
/** A branch in bloom reaching in from a top corner, close to the viewer (soft, a little out of focus). Transparent. */
function sakuraBranch(THREE, S, seed) {
  const r = koiRng(seed), main = [], c = document.createElement("canvas");
  c.width = c.height = S;
  ((g) => {
    const k = S / 1024, blooms = [];
    const limb = (x, y, a, len, w, depth, path) => {
      const steps = 6;
      let px = x, py = y;
      for (let i = 1; i <= steps; i++) {
        a += r(-0.18, 0.18);
        const nx = px + Math.cos(a) * (len / steps), ny = py + Math.sin(a) * (len / steps);
        g.strokeStyle = "#3a2826"; g.lineCap = "round"; g.lineWidth = w * (1 - (0.55 * i) / steps);
        g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
        g.strokeStyle = "rgba(150,110,100,0.35)"; g.lineWidth = Math.max(1, w * 0.18 * (1 - (0.55 * i) / steps));
        g.beginPath(); g.moveTo(px, py - w * 0.2); g.lineTo(nx, ny - w * 0.2); g.stroke();
        if (path) path.push([nx, ny]);
        if (i > 1 && r() < 0.8) blooms.push([nx, ny, depth]);
        if (depth < 2 && i > 1 && r() < 0.4) limb(nx, ny, a + (r() < 0.6 ? -1 : 1) * r(0.3, 0.75), len * r(0.28, 0.45), w * 0.5, depth + 1);
        px = nx; py = ny;
      }
      blooms.push([px, py, depth]);
    };
    limb(-20 * k, 120 * k, 0.16, 760 * k, 34 * k, 0, main);
    for (const [bx, by, depth] of blooms) {
      const n = depth === 0 ? 12 : 16;
      for (let f = 0; f < n; f++) {
        const a = r(0, 6.28), d = r(0, 55) * k;
        sakuraFlower(g, bx + Math.cos(a) * d, by + Math.sin(a) * d * 0.8 + 10 * k, r(13, 22) * k, SAKURA_PINKS[(r() * 5) | 0], r(0, 6.28));
      }
      g.fillStyle = "rgba(222,86,126,0.95)";
      for (let b = 0; b < 3; b++) { g.beginPath(); g.arc(bx + r(-40, 40) * k, by + r(-30, 30) * k, r(3, 5) * k, 0, Math.PI * 2); g.fill(); }
    }
    // whatever reaches the right or the bottom edge fades out there, so the quad's border never shows as a cut
    g.globalCompositeOperation = "destination-out";
    const fr = g.createLinearGradient(S * 0.8, 0, S, 0); fr.addColorStop(0, "rgba(0,0,0,0)"); fr.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = fr; g.fillRect(S * 0.8, 0, S * 0.2, S);
    const fb = g.createLinearGradient(0, S * 0.75, 0, S); fb.addColorStop(0, "rgba(0,0,0,0)"); fb.addColorStop(1, "rgba(0,0,0,1)");
    g.fillStyle = fb; g.fillRect(0, S * 0.75, S, S * 0.25);
    g.globalCompositeOperation = "source-over";
  })(c.getContext("2d"));
  // softened by a trip through half size (ctx.filter would be simpler, but Chrome drew nothing at all with a blur set for this many strokes)
  const tex = new THREE.CanvasTexture(rainBlur(c, S, S, 1));
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.userData.main = main.map(([x, y]) => [x / S, y / S]); // where the main limb runs, for lanterns to hang from
  return tex;
}
/** A falling petal: notched at its tip, pinker at its base. */
function sakuraPetalTex(THREE) {
  return canvasTexture(THREE, 64, 64, (g) => {
    const grad = g.createLinearGradient(32, 60, 32, 4);
    grad.addColorStop(0, "#f59ab6"); grad.addColorStop(0.5, "#ffd0de"); grad.addColorStop(1, "#fff1f5");
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(32, 62);
    g.bezierCurveTo(8, 48, 6, 10, 24, 4); g.lineTo(32, 12); g.lineTo(40, 4); g.bezierCurveTo(58, 10, 56, 48, 32, 62);
    g.fill();
  });
}
/** The full moon: a pale disc with its seas, a little darker at the rim. */
function sakuraMoon(THREE) {
  return canvasTexture(THREE, 256, 256, (g) => {
    const grad = g.createRadialGradient(118, 116, 10, 128, 128, 124);
    grad.addColorStop(0, "#fffdf4"); grad.addColorStop(0.8, "#f1ecdc"); grad.addColorStop(1, "#d8d2c2");
    g.fillStyle = grad; g.beginPath(); g.arc(128, 128, 122, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(150,146,140,0.35)";
    for (const [x, y, rx, ry] of [[92, 88, 34, 26], [150, 80, 26, 20], [120, 132, 22, 30], [170, 140, 30, 22], [96, 170, 18, 14], [150, 190, 22, 12]]) { g.beginPath(); g.ellipse(x, y, rx, ry, 0.4, 0, Math.PI * 2); g.fill(); }
  });
}
/** A paper chōchin: R = its light (and halo), G = the paper that covers what is behind, B = ink (black caps, the character 桜). */
function sakuraChochin(THREE) {
  const S = 256, c = document.createElement("canvas");
  c.width = c.height = S;
  const g = c.getContext("2d");
  const ink = document.createElement("canvas");
  ink.width = ink.height = S;
  const ig = ink.getContext("2d");
  ig.fillStyle = "#fff"; ig.font = `bold 58px "Hiragino Mincho ProN", "Yu Mincho", "Songti SC", "Noto Serif CJK JP", serif`; ig.textAlign = "center"; ig.textBaseline = "middle";
  ig.fillText("桜", 128, 132);
  const inkA = ig.getImageData(0, 0, S, S).data, img = g.createImageData(S, S), d = img.data;
  const cy = 130, ry = 66, rx = 50;
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const o = (y * S + x) * 4, dx = x + 0.5 - 128, dy = y + 0.5 - cy;
    const rc = Math.hypot(dx / 1.1, dy), ramp = Math.min(1, Math.max(0, (rc - 50) / 72));
    let light = (0.3 * Math.exp(-((rc / 60) ** 2)) + 0.08 * Math.exp(-((rc / 95) ** 2))) * (1 - ramp * ramp * (3 - 2 * ramp)), body = 0, inkV = 0;
    const e = (dx / rx) ** 2 + (dy / ry) ** 2;
    if (e <= 1 && Math.abs(dy) < ry - 2) {
      let l = 0.95 - 0.35 * e; // brightest in the middle
      if (Math.abs(((dy + ry) % 11) - 5.5) < 0.9) l *= 0.8; // the bamboo ribs
      const cap = Math.abs(dy) > ry - 12; // black lacquered rims
      if (cap) { l = 0.05; inkV = 1; }
      const ia = inkA[o + 3] / 255;
      if (ia > 0 && !cap) { l *= 1 - 0.8 * ia; inkV = Math.max(inkV, ia); }
      light = Math.min(1, l);
      body = Math.min(1, (1 - Math.sqrt(e)) * 8);
    }
    if (Math.abs(dx) < 2 && y < cy - ry && y > cy - ry - 16) { body = 1; inkV = 1; light = 0; } // the hook
    d[o] = Math.round(255 * Math.min(1, light)); d[o + 1] = Math.round(255 * body); d[o + 2] = Math.round(255 * inkV); d[o + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
/** A pagoda roof: four concave slopes from a small top to wide eaves whose corners sweep up. */
function sakuraRoof(THREE, top, eave, H, lift, n = 10) {
  const pos = [], idx = [];
  for (let side = 0; side < 4; side++) {
    const base = pos.length / 3, c = Math.cos((side * Math.PI) / 2), s = Math.sin((side * Math.PI) / 2);
    for (let j = 0; j <= 5; j++) {
      const v = j / 5, half = top / 2 + (eave / 2 - top / 2) * v, y = H * (1 - v) * (1 - v);
      for (let i = 0; i <= n; i++) {
        const u = (i / n) * 2 - 1, lx = u * half, lz = half, up = lift * Math.pow(Math.abs(u), 3) * v * v;
        pos.push(lx * c + lz * s, y + up, -lx * s + lz * c);
      }
    }
    for (let j = 0; j < 5; j++) for (let i = 0; i < n; i++) { const a = base + j * (n + 1) + i, b = a + 1, cc = a + n + 1, d = cc + 1; idx.push(a, cc, b, b, cc, d); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** A five-storey pagoda standing at y = 0: vermilion posts and beams, white walls, dark roofs, railings (in the accent colour), a bronze spire. */
function sakuraPagoda(THREE) {
  const at = (x, y, z, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz));
  const box = new THREE.BoxGeometry(1, 1, 1), red = [], white = [], roofs = [], trim = [], gold = [];
  const Hs = [3.4, 2.6, 2.5, 2.4, 2.3];
  white.push([box, at(0, 0.8, 0, 11, 1.6, 11)]); // the stone platform (tinted by the wall material)
  let y = 1.6;
  Hs.forEach((h, i) => {
    const w = 6.4 - i * 0.5;
    white.push([box, at(0, y + h / 2, 0, w, h, w)]);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) red.push([box, at((sx * w) / 2, y + h / 2, (sz * w) / 2, 0.42, h, 0.42)]);
    for (const off of [-w / 6, w / 6]) for (const [ax, az] of [[off, w / 2], [off, -w / 2], [w / 2, off], [-w / 2, off]]) red.push([box, at(ax, y + h / 2, az, 0.3, h, 0.3)]);
    red.push([box, at(0, y + h - 0.22, 0, w + 0.14, 0.44, w + 0.14)]);
    red.push([box, at(0, y + h + 0.25, 0, w * 1.22, 0.5, w * 1.22)]); // the bracket layer under the eaves
    if (i === 0) roofs.push([box, at(0, y + 1.3, w / 2 + 0.01, 1.6, 2.4, 0.05)]); // the door
    if (i > 0) { // a balcony railing round each upper storey
      const rw = w + 1.1;
      for (const [sx, sz] of [[rw, 0.12], [0.12, rw]]) for (const s of [-1, 1]) trim.push([box, at(sx === rw ? 0 : (s * rw) / 2, y + 0.55, sz === rw ? 0 : (s * rw) / 2, sx, 0.14, sz)]);
      for (let k = 0; k < 4; k++) for (const s of [-1, 1]) { const t = -rw / 2 + (k + 0.5) * (rw / 4); trim.push([box, at(t, y + 0.3, (s * rw) / 2, 0.1, 0.5, 0.1)]); trim.push([box, at((s * rw) / 2, y + 0.3, t, 0.1, 0.5, 0.1)]); }
    }
    roofs.push([sakuraRoof(THREE, w * 0.9, w * 2.05, 1.35, 0.75), at(0, y + h + 0.45, 0)]);
    y += h + 1.5;
  });
  gold.push([new THREE.CylinderGeometry(0.16, 0.2, 9, 10), at(0, y + 4.1, 0)]);
  for (let k = 0; k < 9; k++) gold.push([new THREE.TorusGeometry(0.55 - k * 0.02, 0.08, 6, 20), new THREE.Matrix4().compose(new THREE.Vector3(0, y + 1.4 + k * 0.6, 0), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1))]);
  gold.push([new THREE.SphereGeometry(0.34, 12, 8), at(0, y + 8.9, 0)]);
  gold.push([new THREE.ConeGeometry(0.28, 1.0, 10), at(0, y + 9.6, 0)]);
  return { red: mergeParts(THREE, red), white: mergeParts(THREE, white), roof: mergeParts(THREE, roofs), trim: mergeParts(THREE, trim), gold: mergeParts(THREE, gold), height: y + 10 };
}
/** Grass strewn with fallen cherry petals, tiling. */
function sakuraGrass(THREE, S) {
  const r = koiRng(606);
  const tex = canvasTexture(THREE, S, S, (g) => {
    g.fillStyle = "#4f6d3c"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < S * 6; i++) { // blades and tufts in a few greens
      g.strokeStyle = ["#3d5a30", "#5f7f45", "#6e8f4e", "#46663a"][(r() * 4) | 0]; g.lineWidth = r(0.6, 1.6) * (S / 512);
      const x = r(0, S), y = r(0, S); g.beginPath(); g.moveTo(x, y); g.lineTo(x + r(-2, 2), y - r(2, 6) * (S / 512)); g.stroke();
    }
    for (let i = 0; i < S * 1.4; i++) { // fallen petals, gathered in drifts
      const x = r(0, S), y = r(0, S), drift = 0.5 + 0.5 * Math.sin(x * 0.02 + Math.sin(y * 0.015) * 2);
      if (r() > drift) continue;
      g.fillStyle = SAKURA_PINKS[(r() * 5) | 0]; g.beginPath(); g.ellipse(x, y, r(1.2, 2.4) * (S / 512), r(0.8, 1.5) * (S / 512), r(0, 3.14), 0, Math.PI * 2); g.fill();
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
/** The mound the pagoda stands on: a grassy hill rising out of the lake (textured, shaded by vertex colours). */
function sakuraMound(THREE) {
  const g = new THREE.SphereGeometry(1, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), p = g.attributes.position, uv = g.attributes.uv, col = [];
  const c = new THREE.Color(), earth = new THREE.Color("#4a3e30");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const n = lhNoise3(x * 3 + 2, y * 3, z * 3);
    p.setXYZ(i, x * 95, y * (12 + 3 * n) - 0.6, z * 34);
    uv.setXY(i, (x * 95) / 24, (z * 34) / 24); // the grass texture tiles every 24 m, seen from above
    c.setScalar(0.8 + 0.25 * n + 0.1 * y);
    if (y < 0.12) c.lerp(earth, 0.7); // bare and wet where the lake laps
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
function sakura(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(2204);
  const EYE = 6, PITCH = 0.05; // standing on the shore, looking a little up at the mountain
  camera.fov = 50; camera.near = 0.1; camera.far = 5000;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  const TAN = Math.tan((camera.fov * Math.PI) / 360);
  const halfW = (dist) => dist * TAN * camera.aspect;
  const time = { value: 0 };
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  const glow = keep(lhGlow(THREE));
  const accent = new THREE.Color();
  // everything above the water is in `world`: drawn twice, the second time mirrored into the lake. Double-sided (the mirror turns faces round), one pass each.
  const shader = (vs, fs, uniforms, extra = {}) => keep(new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, ...extra }));
  const plain = (opts) => keep(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: false, ...opts }));
  const std = (opts) => keep(new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, forceSinglePass: true, ...opts }));
  const world = new THREE.Group();
  scene.add(world);
  const layer = (mat, x, y, z, w, h, order, parent = world) => { const m = new THREE.Mesh(quad, mat); m.position.set(x, y, z); m.scale.set(w, h, 1); m.renderOrder = order; m.frustumCulled = false; parent.add(m); return m; };

  /* --- light for the pagoda, the mound and the trees (mirrored along with them in the reflection) --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  const flood = new THREE.PointLight(0xffb070, 0, 0, 2); // the floodlights on the pagoda at night
  scene.add(hemi, sun, flood);

  /* --- the sky, the stars and the full moon --- */
  const skyUni = {
    uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0.66, 0.64, -0.38).normalize() }, uSunColor: { value: new THREE.Color("#fff4dc") }, uSun: { value: 0 },
  };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(4200, 40, 24)), shader(LANTERN_SKY_VS, LANTERN_SKY_FS, skyUni, { transparent: false, depthTest: false }));
  sky.position.set(0, EYE, 0); sky.renderOrder = -10; sky.frustumCulled = false;
  world.add(sky);
  const NSTAR = preview ? 300 : 900, starPos = new Float32Array(NSTAR * 3);
  for (let i = 0; i < NSTAR; i++) { const a = r(0, 6.283), e = Math.asin(r(0.04, 1)); starPos.set([Math.cos(a) * Math.cos(e) * 3800, EYE + Math.sin(e) * 3800, Math.sin(a) * Math.cos(e) * 3800], i * 3); }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = keep(new THREE.PointsMaterial({ color: 0xe8eeff, size: preview ? 1.1 : 1.5, sizeAttenuation: false, transparent: true, depthWrite: false }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = 1; stars.frustumCulled = false;
  world.add(stars);
  const moonHalo = layer(plain({ map: glow, blending: THREE.AdditiveBlending, color: 0x9fb2e0 }), 0, 0, -2560, 700, 700, 2);
  const moon = layer(plain({ map: keep(sakuraMoon(THREE)) }), 0, 0, -2550, 160, 160, 2);

  /* --- Mount Fuji, clouds on its flanks, the far shore --- */
  const fujiUni = { uRock: { value: new THREE.Color() }, uRockLit: { value: new THREE.Color() }, uSnow: { value: new THREE.Color() }, uSnowShade: { value: new THREE.Color() }, uForest: { value: new THREE.Color() }, uHaze: skyUni.uHorizon };
  const FUJI_W = 5400, FUJI_H = 820;
  const fuji = layer(shader(LANTERN_LAYER_VS, SAKURA_FUJI_FS, fujiUni), 0, FUJI_H / 2 - 40, -2600, FUJI_W, FUJI_H, 3);
  const mist = keep(inkMist(THREE));
  const cloudMat = plain({ map: mist });
  const clouds = [[0, 800, 620, 46], [-900, 330, 1500, 90], [800, 250, 1300, 80]].map(([x, y, w, h]) => ({ m: layer(cloudMat, x, y, -2540, w, h, 4), x, speed: r(1.5, 3) }));
  const hillUni = { uMask: { value: keep(lanternHills(THREE, preview ? 1024 : 2048, preview ? 96 : 160)) }, uFar: { value: new THREE.Color() }, uNear: { value: new THREE.Color() } };
  layer(shader(LANTERN_LAYER_VS, LANTERN_HILLS_FS, hillUni), 0, 38, -1100, 3800, 76, 5);
  const hazeMat = plain({ map: mist });
  const haze = layer(hazeMat, 0, 6, -900, 3200, 26, 6); // morning mist lying on the water by the far shore

  /* --- the pagoda on its mound among the cherry trees --- */
  const pg = new THREE.Group();
  world.add(pg);
  const moundMat = std({ vertexColors: true, roughness: 1, map: keep(sakuraGrass(THREE, preview ? 256 : 512)) });
  const MOX = -32; // the hill's middle lies left of the pagoda; it runs on off the left edge
  const mound = new THREE.Mesh(keep(sakuraMound(THREE)), moundMat);
  mound.position.x = MOX;
  pg.add(mound);
  const moundY = (x, z) => { const q = 1 - ((x - MOX) / 95) ** 2 - (z / 34) ** 2; return q > 0 ? 12.4 * Math.sqrt(q) - 0.6 : -0.6; };
  const P = sakuraPagoda(THREE);
  const redMat = std({ color: 0xc53a22, roughness: 0.7 }), whiteMat = std({ color: 0xefe8dc, roughness: 0.85 }), roofMat = std({ color: 0x3b4047, roughness: 0.75 });
  const trimMat = std({ roughness: 0.6 }), goldMat = std({ color: 0xb8913f, metalness: 0.6, roughness: 0.4 }), barkMat = std({ color: 0x3a2a26, roughness: 0.9 });
  const pagoda = new THREE.Group();
  pagoda.position.set(0, moundY(0, 0) - 0.4, 0);
  for (const [geo, mat] of [[P.red, redMat], [P.white, whiteMat], [P.roof, roofMat], [P.trim, trimMat], [P.gold, goldMat]]) pagoda.add(new THREE.Mesh(keep(geo), mat));
  pg.add(pagoda);
  flood.position.set(0, 14, 16); // follows the group in layout()
  // cherry trees round the pagoda: a trunk and branches, a canopy of blossom clusters (smaller ones in front, framing the pagoda's foot)
  const TREES = [[-36, 4, 6.8], [-24, -12, 7.2], [-13, 15, 5.2], [14, 13, 5.6], [25, -9, 7.6], [37, 7, 6.2], [-47, -3, 5.2], [48, -2, 5.4], [3, -21, 6.6], [-4, 22, 4.2], [31, 19, 4.6], [-30, 20, 4.4],
    [-62, 8, 7], [-74, -10, 7.8], [-88, 6, 6.4], [-100, -6, 7.2], [-58, 24, 4.6], [-84, 22, 4.2], [-112, 12, 6], [52, 16, 3.6], [-120, -8, 6.8]];
  const LANTERN_PATH = [];
  for (let i = 0; i < 14; i++) { const x = -44 + (i * 88) / 13, z = 24 + 3 * Math.sin(i * 0.9); LANTERN_PATH.push([x, Math.max(0.2, moundY(x, z)) + 2.0, z]); }
  const trunkParts = [], blooms = [];
  for (const [tx, tz, R] of TREES) {
    const gy = Math.max(0, moundY(tx, tz)), th = R * 0.95, lean = r(-0.12, 0.12);
    const top = new THREE.Vector3(tx + lean * th, gy + th, tz);
    const trunk = new THREE.CylinderGeometry(R * 0.045, R * 0.08, th, 7);
    trunk.translate(0, th / 2, 0);
    trunkParts.push([trunk, new THREE.Matrix4().compose(new THREE.Vector3(tx, gy, tz), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, -lean)), new THREE.Vector3(1, 1, 1))]);
    for (let b = 0; b < 3; b++) {
      const a = (b / 3) * Math.PI * 2 + r(0, 1), len = R * r(0.7, 1.0), br = new THREE.CylinderGeometry(R * 0.02, R * 0.045, len, 5);
      br.translate(0, len / 2, 0);
      const dir = new THREE.Vector3(Math.cos(a) * 0.8, 0.6, Math.sin(a) * 0.5).normalize();
      trunkParts.push([br, new THREE.Matrix4().compose(top, new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir), new THREE.Vector3(1, 1, 1))]);
    }
    const n = Math.round(8 + R * 2.2);
    for (let k = 0; k < n; k++) {
      const u = r(0, Math.PI * 2), v = Math.acos(r(-0.3, 1)), rr = Math.cbrt(r(0.3, 1));
      const p = new THREE.Vector3(top.x + Math.cos(u) * Math.sin(v) * R * 1.15 * rr, top.y + R * 0.35 + Math.cos(v) * R * 0.6 * rr, top.z + Math.sin(u) * Math.sin(v) * R * 0.9 * rr);
      let lamp = 0;
      for (const [lx, ly, lz] of LANTERN_PATH) lamp = Math.max(lamp, Math.max(0, 1 - Math.hypot(p.x - lx, p.y - ly, p.z - lz) / 11));
      lamp = Math.max(lamp * lamp, 0.35 * Math.max(0, 1 - Math.hypot(p.x, p.z - 6) / 26)); // and the floodlit pagoda
      blooms.push({ p, size: R * r(0.42, 0.62), cell: (r() * 4) | 0, phase: r(0, 6.28), lamp, tint: r(0.9, 1.05) });
    }
  }
  pg.add(new THREE.Mesh(keep(mergeParts(THREE, trunkParts)), barkMat));
  const clusterTex = keep(sakuraClusters(THREE, preview ? 256 : 512));
  const bloomGeo = keep(new THREE.PlaneGeometry(1, 1));
  const aBloom = new THREE.InstancedBufferAttribute(new Float32Array(blooms.length * 4), 4), aTint = new THREE.InstancedBufferAttribute(new Float32Array(blooms.length * 3), 3);
  bloomGeo.setAttribute("aBloom", aBloom); bloomGeo.setAttribute("aTint", aTint);
  const bloomUni = { uMap: { value: clusterTex }, uFlip: { value: 1 }, uTime: time, uLight: { value: new THREE.Color() }, uLamp: { value: new THREE.Color() } };
  const bloomMesh = new THREE.InstancedMesh(bloomGeo, keep(new THREE.ShaderMaterial({ uniforms: bloomUni, vertexShader: SAKURA_BLOOM_VS, fragmentShader: SAKURA_BLOOM_FS, side: THREE.DoubleSide, forceSinglePass: true, alphaToCoverage: true })), blooms.length);
  const M4 = new THREE.Matrix4();
  blooms.sort((a, b) => a.p.z - b.p.z).forEach((b, i) => { bloomMesh.setMatrixAt(i, M4.makeTranslation(b.p.x, b.p.y, b.p.z)); aBloom.setXYZW(i, b.size, b.cell, b.phase, b.lamp); aTint.setXYZ(i, b.tint, b.tint * r(0.96, 1.02), b.tint); });
  bloomMesh.frustumCulled = false;
  pg.add(bloomMesh);
  // lanterns along the path round the mound (lit at night), reflected in the lake
  const chochin = keep(sakuraChochin(THREE));
  const makeLanterns = (count, parent, order) => {
    const geo = keep(new THREE.PlaneGeometry(1, 1)), aL = new THREE.InstancedBufferAttribute(new Float32Array(count * 4), 4), aT = new THREE.InstancedBufferAttribute(new Float32Array(count * 3), 3);
    geo.setAttribute("aLantern", aL); geo.setAttribute("aTint", aT);
    const uni = { uMap: { value: chochin }, uFlip: { value: 1 }, uTime: time, uNight: { value: 0 } };
    const mesh = new THREE.InstancedMesh(geo, shader(LANTERN_VS, SAKURA_CHOCHIN_FS, uni, { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor }), count);
    mesh.frustumCulled = false; mesh.renderOrder = order;
    parent.add(mesh);
    return { mesh, aL, aT, uni };
  };
  const far = makeLanterns(LANTERN_PATH.length, pg, 12);
  const lanternTints = [new THREE.Color("#fff3e0"), new THREE.Color("#ff6a4a"), accent]; // white paper, red paper, and the accent colour
  LANTERN_PATH.forEach(([x, y, z], i) => { far.mesh.setMatrixAt(i, M4.makeTranslation(x, y, z)); far.aL.setXYZW(i, 0.9, r(0, 10), 1.6, 1); });

  /* --- the lake: the mirrored world, broken by ripples --- */
  const reflectRT = keep(new THREE.WebGLRenderTarget(4, 4, { samples: preview ? 0 : 4 })); // multisampled: the blossom cut-outs stay smooth in the mirror
  reflectRT.texture.colorSpace = THREE.SRGBColorSpace;
  const lakeUni = { tReflect: { value: reflectRT.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: time, uDeep: { value: new THREE.Color() }, uSheen: { value: new THREE.Color() } };
  const lakeGeo = keep(new THREE.PlaneGeometry(8000, 8000));
  lakeGeo.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lakeGeo, keep(new THREE.ShaderMaterial({ uniforms: lakeUni, vertexShader: LANTERN_LAKE_VS, fragmentShader: LANTERN_LAKE_FS })));
  lake.position.z = -3900; lake.renderOrder = -5; lake.frustumCulled = false;
  scene.add(lake);

  /* --- close by: branches in bloom at the top corners, a string of lanterns between them, petals in the air and on the water --- */
  const near = new THREE.Group(); // not in the reflection
  scene.add(near);
  const branchMat = plain({ map: keep(sakuraBranch(THREE, preview ? 512 : 1024, 77)) });
  const branches = [-1, 1].map((side) => { const pivot = new THREE.Group(), m = new THREE.Mesh(quad, branchMat); m.position.set(0.5, -0.5, 0); m.renderOrder = 22; m.frustumCulled = false; pivot.add(m); pivot.scale.x = -side; near.add(pivot); return { pivot, m, side }; });
  const HANG = [[-1, 0.3, 0.9], [-1, 0.52, 0.55], [-1, 0.74, 1.05], [1, 0.4, 0.7], [1, 0.63, 1.0]]; // branch, how far along its limb, cord length
  const FEST = HANG.length, fest = makeLanterns(FEST, near, 21);
  const cordMat = keep(new THREE.MeshBasicMaterial({ color: 0x2a1c1a }));
  let cords = null, hungAt = 0;
  const NP = preview ? 160 : 560, petalGeo = keep(new THREE.InstancedBufferGeometry()), petalBase = keep(new THREE.PlaneGeometry(1, 1));
  petalGeo.index = petalBase.index; petalGeo.setAttribute("position", petalBase.attributes.position); petalGeo.setAttribute("uv", petalBase.attributes.uv);
  petalGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(Float32Array.from({ length: NP * 4 }, () => r()), 4));
  petalGeo.instanceCount = NP;
  const petalTex = keep(sakuraPetalTex(THREE));
  const petalUni = { uTime: time, uBoxC: { value: new THREE.Vector3(0, 8, -24) }, uBox: { value: new THREE.Vector3(70, 16, 44) }, uWind: { value: new THREE.Vector2(1.1, 0.25) }, uSize: { value: 0.13 }, uMap: { value: petalTex }, uLight: { value: new THREE.Color() } };
  const petals = new THREE.Mesh(petalGeo, keep(new THREE.ShaderMaterial({ uniforms: petalUni, vertexShader: SAKURA_PETAL_VS, fragmentShader: SAKURA_PETAL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
  petals.frustumCulled = false; petals.renderOrder = 20;
  near.add(petals);
  const NF = preview ? 120 : 420, floatGeo = keep(new THREE.InstancedBufferGeometry()), fseed = new Float32Array(NF * 4);
  floatGeo.index = petalBase.index; floatGeo.setAttribute("position", petalBase.attributes.position); floatGeo.setAttribute("uv", petalBase.attributes.uv);
  for (let i = 0; i < NF; i++) { const c = (i * 7) % 11, cxs = ((c * 0.618) % 1), czs = ((c * 0.377) % 1); fseed.set([cxs + r(-0.05, 0.05), 0.5, czs + r(-0.06, 0.06), r()], i * 4); } // drifting in loose rafts
  floatGeo.setAttribute("aSeed", new THREE.InstancedBufferAttribute(fseed, 4));
  floatGeo.instanceCount = NF;
  const floatUni = { uTime: time, uBoxC: { value: new THREE.Vector3(0, 0, -34) }, uBox: { value: new THREE.Vector3(70, 1, 60) }, uSize: { value: 0.16 }, uMap: { value: petalTex }, uLight: petalUni.uLight };
  const floating = new THREE.Mesh(floatGeo, keep(new THREE.ShaderMaterial({ uniforms: floatUni, vertexShader: SAKURA_FLOAT_VS, fragmentShader: SAKURA_PETAL_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide })));
  floating.frustumCulled = false; floating.renderOrder = 2;
  near.add(floating);

  /* --- the reflection: before the sky is drawn, the world is drawn mirrored into a texture the lake shows --- */
  const RS = 0.5, buf = new THREE.Vector2();
  let reflecting = false;
  const flip = (s) => {
    bloomUni.uFlip.value = s; far.uni.uFlip.value = s;
    sun.position.y = Math.abs(sun.position.y) * s; flood.position.y = Math.abs(flood.position.y) * s; // the light comes from below in the mirror image
    const c = hemi.color.clone(); hemi.color.copy(hemi.groundColor); hemi.groundColor.copy(c);
  };
  sky.onBeforeRender = (renderer, sc, cam) => {
    if (reflecting) return;
    reflecting = true;
    renderer.getDrawingBufferSize(buf);
    lakeUni.uRes.value.copy(buf);
    const w = Math.max(2, Math.round(buf.x * RS)), h = Math.max(2, Math.round(buf.y * RS));
    if (reflectRT.width !== w || reflectRT.height !== h) reflectRT.setSize(w, h);
    world.scale.y = -1; lake.visible = false; near.visible = false; flip(-1);
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(reflectRT);
    renderer.render(sc, cam);
    renderer.setRenderTarget(before);
    world.scale.y = 1; lake.visible = true; near.visible = true; flip(1);
    world.updateMatrixWorld(true);
    reflecting = false;
  };

  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    accent.set(p.accent);
    skyUni.uZenith.value.set(d ? "#040a1c" : "#3f7cc9"); skyUni.uMid.value.set(d ? "#0c1838" : "#94c0e8"); skyUni.uHorizon.value.set(d ? "#22305a" : "#e4eff6");
    skyUni.uGlow.value.set(d ? "#3c2c3a" : "#fff0dc").multiplyScalar(d ? 0.5 : 0.25); skyUni.uSun.value = d ? 0 : 1;
    starMat.opacity = d ? 0.85 : 0; moon.visible = moonHalo.visible = d; moonHalo.material.opacity = 0.55;
    fujiUni.uRock.value.set(d ? "#131a2b" : "#62768f"); fujiUni.uRockLit.value.set(d ? "#1e2842" : "#8395ad"); fujiUni.uSnow.value.set(d ? "#b6c3e0" : "#f8fafd");
    fujiUni.uSnowShade.value.set(d ? "#6b7ca3" : "#c3d0e2"); fujiUni.uForest.value.set(d ? "#0b111f" : "#3f5a57");
    cloudMat.color.set(d ? "#2c3a64" : "#ffffff"); cloudMat.opacity = d ? 0.3 : 0.85;
    hazeMat.color.set(d ? "#1a2548" : "#ffffff"); hazeMat.opacity = d ? 0.25 : 0.55;
    hillUni.uFar.value.set(d ? "#101a33" : "#7d9aaf"); hillUni.uNear.value.set(d ? "#0a1024" : "#56766f");
    hemi.color.set(d ? "#2e3a62" : "#dcebff"); hemi.groundColor.set(d ? "#0a0a10" : "#6a5c48"); hemi.intensity = d ? 0.55 : 1.3;
    sun.color.set(d ? "#aab8e0" : "#fff2dc"); sun.intensity = d ? 0.45 : 2.2;
    sun.position.set(d ? 25 : 66, d ? 36 : 64, d ? -90 : -38); // the moon ahead to the right; the morning sun high on the right
    flood.intensity = d ? 700 : 0;
    redMat.emissive.set(d ? "#46140b" : "#000000"); whiteMat.emissive.set(d ? "#32281e" : "#000000"); roofMat.emissive.set(d ? "#0b0c10" : "#000000");
    trimMat.color.copy(accent);
    bloomUni.uLight.value.set(d ? "#6570a0" : "#ffffff").multiplyScalar(d ? 0.6 : 1); bloomUni.uLamp.value.set("#ffae6a").multiplyScalar(d ? 1.1 : 0);
    lakeUni.uDeep.value.set(d ? "#02040c" : "#284d69"); lakeUni.uSheen.value.set(d ? "#ffcf8a" : "#ffffff").multiplyScalar(d ? 0.3 : 0.45);
    petalUni.uLight.value.set(d ? "#8088b8" : "#ffffff").multiplyScalar(d ? 0.75 : 1);
    branchMat.color.set(d ? "#7a80a8" : "#ffffff");
    far.uni.uNight.value = fest.uni.uNight.value = d ? 1 : 0; far.mesh.visible = d; // far off, unlit paper lanterns only read as confetti
    const tintAll = (L, count) => { for (let i = 0; i < count; i++) { const c = lanternTints[i % 3 === 2 ? 2 : i % 2]; L.aT.setXYZ(i, c.r, c.g, c.b); } L.aT.needsUpdate = true; };
    tintAll(far, LANTERN_PATH.length); tintAll(fest, FEST);
  }
  applyPalette(pal);

  const look = new THREE.Vector3();
  function layout() {
    const A = camera.aspect || 1;
    const fx = halfW(2600) * 0.12;
    fuji.position.x = fx;
    moon.position.set(fx + 400, 860, -2550); moonHalo.position.set(fx + 400, 860, -2560); // rising over the mountain's right shoulder
    pg.position.set(-halfW(125) * (A >= 1 ? 0.5 : 0.38), 0, -125);
    flood.position.set(pg.position.x, 14, -109);
    // the branches hang into the top corners, the lanterns on a rope between them
    const z = 9, hw = halfW(z), top = EYE + Math.tan(Math.atan(TAN) + PITCH) * z, s = Math.max(3.4, hw * 0.75); // they frame the top corners, no more
    for (const b of branches) { b.pivot.position.set(b.side * (hw + 0.4), top + 0.25, -z); b.m.scale.set(s, s, 1); b.m.position.set(s / 2, -s / 2, 0); } // hung from its top corner
    if (hungAt !== s + A) { // lanterns on cords from points along each branch's main limb
      hungAt = s + A;
      const main = branchMat.map.userData.main, parts = [];
      HANG.forEach(([side, f, cord], i) => {
        const [u, v] = main[Math.min(main.length - 1, Math.round(f * (main.length - 1)))];
        const b = branches[side < 0 ? 0 : 1], x = b.pivot.position.x - side * u * s, y = b.pivot.position.y - v * s;
        if (camera.aspect >= 0.8 || i % 2 === 0) parts.push([new THREE.CylinderGeometry(0.01, 0.01, cord, 4), new THREE.Matrix4().makeTranslation(x, y - cord / 2, -z - 0.05)]);
        fest.mesh.setMatrixAt(i, M4.makeTranslation(x, y - cord - 0.3, -z - 0.05));
        fest.aL.setXYZW(i, 0.58, r(0, 10), 1.5, camera.aspect < 0.8 && i % 2 ? 0 : 1); // a narrow screen only has room for every other one
      });
      fest.mesh.instanceMatrix.needsUpdate = fest.aL.needsUpdate = true;
      if (cords) { near.remove(cords); cords.geometry.dispose(); }
      cords = new THREE.Mesh(mergeParts(THREE, parts), cordMat);
      cords.renderOrder = 21;
      near.add(cords);
    }
  }
  function frame(dt, t) {
    time.value = t;
    layout();
    const cx = Math.sin(t * 0.02) * 0.6;
    camera.position.set(cx, EYE + Math.sin(t * 0.045) * 0.04, 0);
    camera.lookAt(look.set(cx * 0.3, EYE + Math.tan(PITCH) * 100, -100));
    for (const c of clouds) { c.m.position.x = c.x + fuji.position.x + Math.sin(t * 0.01 * c.speed) * 60; }
    for (const b of branches) b.pivot.rotation.z = b.side * (Math.sin(t * 0.5 + b.side) * 0.012 + Math.sin(t * 1.3) * 0.004);
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    dispose() { cords?.geometry.dispose(); disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Observatory: inside a domed observatory; the telescope tracks the sky, the moon in today's real phase, the stars turning with the real time ---------- */
// The light of the sun (or the moon) only reaches a point if its ray towards the sun leaves the dome through the slit.
// The dome is a sphere (centre uDomeC, radius uDomeR); the slit is the band |x| < uSlitHalf from its south foot up over the top to z = uSlitEnd.
const OBS_SLIT = /* glsl */ `
  uniform vec3 uLightDir; uniform vec3 uDomeC; uniform float uDomeR; uniform float uSlitHalf; uniform float uSlitEnd;
  float obsSlit(vec3 p) {
    vec3 q = p - uDomeC;
    float b = dot(q, uLightDir), c = dot(q, q) - uDomeR * uDomeR, disc = b * b - c;
    if (disc < 0.0) return 0.0;
    vec3 e = q + uLightDir * (-b + sqrt(disc)); // where the ray leaves the dome
    if (e.y < 0.0) return 0.0; // through the wall below the dome: blocked
    return smoothstep(uSlitHalf + 0.05, uSlitHalf - 0.05, abs(e.x)) * smoothstep(uSlitEnd + 0.05, uSlitEnd - 0.05, e.z);
  }
`;
const OBS_SKY_VS = /* glsl */ `
  varying vec3 vDir;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vDir = normalize(w.xyz - cameraPosition); gl_Position = projectionMatrix * viewMatrix * w; }
`;
const OBS_SKY_FS = /* glsl */ `
  uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uSun;
  varying vec3 vDir;
  void main() {
    vec3 col = mix(uHorizon, uZenith, smoothstep(0.0, 0.7, vDir.y));
    float sd = distance(vDir, uSunDir);
    col += uSunCol * uSun * (smoothstep(0.03, 0.024, sd) * 2.5 + 0.35 * exp(-sd * 14.0) + 0.06 * exp(-sd * 3.0)); // the slit is narrow: keep the glare tight
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// stars: size and colour from the catalogue, a gentle twinkle
const OBS_STAR_VS = /* glsl */ `
  uniform float uTime; uniform float uPx;
  attribute vec4 aStar; // size in px, colour index, twinkle seed, brightness
  varying vec3 vCol; varying float vB;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aStar.x * uPx;
    float k = aStar.y;
    vCol = k < 0.5 ? vec3(0.75, 0.85, 1.0) : k < 1.5 ? vec3(1.0) : k < 2.5 ? vec3(1.0, 0.95, 0.82) : k < 3.5 ? vec3(1.0, 0.8, 0.6) : vec3(1.0, 0.65, 0.5);
    vB = aStar.w * (0.8 + 0.2 * sin(uTime * (1.5 + aStar.z * 3.0) + aStar.z * 40.0));
  }
`;
const OBS_STAR_FS = /* glsl */ `
  uniform float uAlpha;
  varying vec3 vCol; varying float vB;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float a = exp(-dot(p, p) * 4.0);
    gl_FragColor = vec4(vCol * vB * a * uAlpha, 1.0);
  }
`;
// the moon in today's phase: lit where its surface faces the sun, a faint earthshine on the rest
const OBS_MOON_FS = /* glsl */ `
  uniform sampler2D uMap; uniform float uPhase; uniform vec3 uTint; uniform float uOn;
  varying vec2 vUv;
  void main() {
    vec2 p = vUv * 2.0 - 1.0;
    float r2 = dot(p, p);
    float disc = smoothstep(1.0, 0.96, sqrt(r2));
    if (disc <= 0.0) discard;
    vec3 n = vec3(p, sqrt(max(0.0, 1.0 - r2)));
    float th = 6.2831853 * uPhase;
    float lit = smoothstep(-0.04, 0.08, dot(n, vec3(sin(th), 0.0, -cos(th))));
    vec3 tex = texture2D(uMap, vUv).rgb;
    vec3 col = tex * uTint * (lit * (0.55 + 0.45 * n.z) + 0.035); // limb darkening; earthshine
    gl_FragColor = vec4(col * uOn, disc * uOn);
    #include <colorspace_fragment>
  }
`;
const OBS_WORLD_VS = /* glsl */ `
  varying vec3 vWorld; varying vec2 vUv;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
// the shaft of light: marched along the view ray inside the dome, each sample lit or not by obsSlit
const OBS_BEAM_FS = /* glsl */ `
  ${OBS_SLIT}
  uniform sampler2D uNoise; uniform vec3 uColor; uniform float uTime; uniform float uFloorY;
  varying vec3 vWorld;
  void main() {
    vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
    vec3 q = ro - uDomeC;
    float b = dot(q, rd), c = dot(q, q) - uDomeR * uDomeR, disc = b * b - c;
    if (disc <= 0.0) discard;
    float t1 = -b + sqrt(disc);
    if (rd.y < 0.0) t1 = min(t1, (uFloorY - ro.y) / rd.y);
    float t0 = 0.0; // the viewer is inside the dome: from the eye to where the ray leaves it (or meets the floor)
    if (t1 <= t0) discard;
    float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float dt = (t1 - t0) / float(OBS_STEPS), sum = 0.0;
    for (int i = 0; i < OBS_STEPS; i++) {
      vec3 x = ro + rd * (t0 + dt * (float(i) + j));
      float haze = 0.6 + 0.8 * texture2D(uNoise, x.xz * 0.23 + vec2(x.y * 0.07, uTime * 0.006)).r;
      sum += obsSlit(x) * haze;
    }
    float toward = max(dot(rd, uLightDir), 0.0); // looking along the shaft at the sun it would pile up into a blank glare: keep that part faint
    gl_FragColor = vec4(uColor * sum * dt * (1.0 - 0.88 * toward * toward * toward), 1.0);
  }
`;
const OBS_DUST_VS = /* glsl */ `
  ${OBS_SLIT}
  uniform float uTime; uniform float uPx; uniform vec3 uBox; uniform vec3 uBoxC;
  attribute vec4 aSeed;
  varying float vLit; varying float vTw;
  void main() {
    vec3 p = aSeed.xyz * uBox + vec3(sin(uTime * 0.07 + aSeed.w * 6.3), sin(uTime * 0.05 + aSeed.w * 12.1) * 0.5 - uTime * 0.012, cos(uTime * 0.06 + aSeed.w * 9.2)) * 0.6;
    p = uBoxC + mod(p, uBox) - uBox * 0.5;
    vLit = obsSlit(p);
    vTw = 0.55 + 0.45 * sin(uTime * (0.8 + aSeed.w * 2.0) + aSeed.w * 30.0);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = clamp((0.012 + 0.01 * aSeed.w) * uPx / -mv.z, 1.0, 6.0);
  }
`;
const OBS_DUST_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uBase;
  varying float vLit; varying float vTw;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    gl_FragColor = vec4(uColor * (uBase + vLit * vTw) * smoothstep(1.0, 0.2, length(p)), 1.0);
  }
`;
/**
 * The dome with its slit (centre at the origin, radius R, the slit the band |x| < SH from the south foot over the top to z = zEnd).
 * Built as two halves of half-circles in planes x = const, so the slit's edges are exact curves; faces point inwards.
 */
function obsDome(THREE, R, SH, zEnd, nA = 18, nP = 56) {
  const pos = [], nrm = [], uv = [], idx = [];
  const put = (x, y, z) => {
    const l = Math.hypot(x, y, z);
    pos.push(x, y, z); nrm.push(-x / l, -y / l, -z / l);
    uv.push((Math.atan2(x, -z) / (Math.PI * 2) + 0.5) * 24, (Math.asin(Math.min(1, y / l)) / (Math.PI / 2)) * 6); // 24 panels round, 6 rows up
    return pos.length / 3 - 1;
  };
  const grid = (rows, cols, at, flip) => {
    const base = pos.length / 3;
    for (let i = 0; i <= rows; i++) for (let j = 0; j <= cols; j++) put(...at(i / rows, j / cols));
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = base + i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
      if (flip) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  };
  const b0 = Math.asin(SH / R);
  for (const s of [1, -1]) grid(nA, nP, (u, v) => { // the halves beside the slit
    const a = Math.sin(b0 + (Math.PI / 2 - b0) * u), rr = R * Math.sqrt(Math.max(0, 1 - a * a)), psi = Math.PI * v;
    return [s * a * R, rr * Math.sin(psi), -rr * Math.cos(psi)];
  }, s < 0);
  grid(8, 20, (u, v) => { // behind the end of the slit
    const x = SH * (2 * u - 1), rr = Math.sqrt(R * R - x * x), p0 = Math.acos(Math.max(-1, Math.min(1, -zEnd / rr))), psi = p0 + (Math.PI - p0) * v;
    return [x, rr * Math.sin(psi), -rr * Math.cos(psi)];
  }, false);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/** The dome's iron: meridian ribs and rings that stop at the slit, the shutter rails along it, the base ring. */
function obsRibs(THREE, R, SH, zEnd) {
  const parts = [], inSlit = (p) => Math.abs(p.x) < SH + 0.12 && p.z < zEnd + 0.12, r = R - 0.1;
  const tube = (pts, rad) => { if (pts.length > 1) parts.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), pts.length * 2, rad, 6), new THREE.Matrix4()]); };
  for (let k = 0; k < 24; k++) {
    const phi = (k / 24) * Math.PI * 2, pts = [];
    for (let i = 0; i <= 24; i++) {
      const th = (i / 24) * (Math.PI / 2 - 0.02), p = new THREE.Vector3(Math.cos(th) * Math.sin(phi) * r, Math.sin(th) * r, -Math.cos(th) * Math.cos(phi) * r);
      if (inSlit(p)) break;
      pts.push(p);
    }
    tube(pts, 0.06);
  }
  for (const th of [0.02, 0.45, 0.9]) { // rings, broken by the slit
    let pts = [];
    for (let i = 0; i <= 96; i++) {
      const phi = (i / 96) * Math.PI * 2, p = new THREE.Vector3(Math.cos(th) * Math.sin(phi) * r, Math.sin(th) * r, -Math.cos(th) * Math.cos(phi) * r);
      if (th > 0.05 && inSlit(p)) { tube(pts, 0.05); pts = []; } else pts.push(p);
    }
    tube(pts, th < 0.05 ? 0.12 : 0.05);
  }
  for (const s of [-1, 1]) { // the shutter rails
    const a = (SH + 0.08) / R, rr = r * Math.sqrt(1 - a * a), pts = [];
    for (let i = 0; i <= 40; i++) { const psi = (i / 40) * Math.PI, z = -rr * Math.cos(psi); if (z > zEnd + 0.1) break; pts.push(new THREE.Vector3(s * a * r, rr * Math.sin(psi), z)); }
    tube(pts, 0.1);
  }
  const ye = Math.sqrt(r * r - zEnd * zEnd);
  tube([new THREE.Vector3(-SH - 0.1, ye, zEnd + 0.05), new THREE.Vector3(0, Math.sqrt(r * r - zEnd * zEnd), zEnd + 0.05), new THREE.Vector3(SH + 0.1, ye, zEnd + 0.05)], 0.1);
  return mergeParts(THREE, parts);
}
/** The dome's inside: painted steel panels with seams and rivets (one panel per texture tile). */
function obsPanels(THREE) {
  const tex = canvasTexture(THREE, 256, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, w, 0);
    grad.addColorStop(0, "#d9d6cf"); grad.addColorStop(0.5, "#e6e3dc"); grad.addColorStop(1, "#d5d2ca");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    g.fillStyle = "rgba(90,80,70,0.35)"; g.fillRect(0, 0, 3, h); g.fillRect(0, 0, w, 3);
    g.fillStyle = "rgba(90,80,70,0.45)";
    for (let i = 8; i < h; i += 24) { g.beginPath(); g.arc(8, i, 2.2, 0, Math.PI * 2); g.fill(); g.beginPath(); g.arc(i, 8, 2.2, 0, Math.PI * 2); g.fill(); }
    const r = koiRng(81);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(120,105,90,${r(0.02, 0.06)})`; g.fillRect(r(0, w), r(0, h), r(10, 60), r(20, 120)); } // weathering
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
/** The moon's face: its seas where they really are (roughly), Tycho with its rays, a darker limb. */
function obsMoonTex(THREE) {
  return canvasTexture(THREE, 256, 256, (g) => {
    const grad = g.createRadialGradient(128, 128, 20, 128, 128, 128);
    grad.addColorStop(0, "#f4f1e8"); grad.addColorStop(1, "#d9d4c6");
    g.fillStyle = grad; g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(118,116,112,0.55)";
    for (const [x, y, rx, ry, a] of [[92, 74, 34, 28, 0.3], [132, 80, 20, 18, 0], [150, 108, 24, 20, 0.2], [178, 96, 14, 16, 0], [62, 120, 30, 46, 0.2], [118, 150, 18, 14, 0.4], [150, 142, 16, 12, 0], [96, 176, 22, 12, 0.3]]) { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, Math.PI * 2); g.fill(); }
    const r = koiRng(9);
    g.strokeStyle = "rgba(90,88,84,0.25)"; g.lineWidth = 1.2;
    for (let i = 0; i < 70; i++) { const x = r(20, 236), y = r(20, 236); if (Math.hypot(x - 128, y - 128) > 118) continue; g.beginPath(); g.arc(x, y, r(1.5, 6), 0, Math.PI * 2); g.stroke(); }
    g.strokeStyle = "rgba(255,255,250,0.28)"; g.lineWidth = 1.5; // Tycho's rays
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2 + r(-0.1, 0.1); g.beginPath(); g.moveTo(112, 206); g.lineTo(112 + Math.cos(a) * r(30, 80), 206 + Math.sin(a) * r(30, 80)); g.stroke(); }
    g.fillStyle = "rgba(255,255,250,0.8)"; g.beginPath(); g.arc(112, 206, 4, 0, Math.PI * 2); g.fill();
  });
}
// the brightest stars: right ascension (hours), declination (degrees), magnitude, colour (0 blue … 4 red)
const OBS_STARS = [
  [6.752, -16.72, -1.46, 1], [6.399, -52.7, -0.74, 1], [14.66, -60.83, -0.27, 2], [14.261, 19.18, -0.05, 3], [18.616, 38.78, 0.03, 1], [5.278, 45.99, 0.08, 2],
  [5.242, -8.2, 0.13, 0], [7.655, 5.22, 0.34, 2], [5.919, 7.41, 0.5, 4], [1.629, -57.24, 0.46, 0], [19.846, 8.87, 0.76, 1], [12.443, -63.1, 0.77, 0],
  [4.599, 16.51, 0.86, 3], [13.42, -11.16, 0.97, 0], [16.49, -26.43, 1.06, 4], [7.755, 28.03, 1.14, 3], [22.961, -29.62, 1.16, 1], [20.69, 45.28, 1.25, 1],
  [12.795, -59.69, 1.25, 0], [10.139, 11.97, 1.35, 0], [6.977, -28.97, 1.5, 0], [7.577, 31.89, 1.58, 1], [12.52, -57.11, 1.63, 4], [5.418, 6.35, 1.64, 0],
  [5.438, 28.61, 1.65, 0], [5.604, -1.2, 1.69, 0], [5.679, -1.94, 1.74, 0], [5.533, -0.3, 2.23, 0], [5.796, -9.67, 2.09, 0], [11.062, 61.75, 1.79, 3],
  [11.031, 56.38, 2.37, 1], [11.897, 53.69, 2.44, 1], [12.257, 57.03, 3.31, 1], [12.9, 55.96, 1.77, 1], [13.399, 54.93, 2.23, 1], [13.792, 49.31, 1.86, 0],
  [2.53, 89.26, 1.98, 2], [0.675, 56.54, 2.24, 3], [0.153, 59.15, 2.28, 1], [0.945, 60.72, 2.47, 0], [1.43, 60.24, 2.68, 1], [1.907, 63.67, 3.37, 0],
  [3.791, 24.11, 2.87, 0], [3.747, 24.37, 3.7, 0], [3.82, 24.05, 3.64, 0], [16.836, -34.29, 2.29, 3], [17.56, -37.1, 1.62, 0], [17.622, -43.0, 1.86, 1],
  [15.981, -26.11, 2.89, 0], [16.005, -22.62, 2.32, 0], [2.119, 23.46, 2.0, 3], [23.063, 28.08, 2.42, 4], [0.14, 29.09, 2.06, 0], [23.079, 15.21, 2.49, 0],
  [21.736, 9.88, 2.39, 3], [19.771, 10.61, 2.72, 3], [20.37, 40.26, 2.23, 2], [19.512, 27.96, 3.08, 3], [18.921, -26.3, 2.05, 0], [18.403, -34.38, 1.85, 0],
];
/** The celestial sphere (unit vectors in equatorial coordinates, radius `rad`): the bright stars above, a field of faint ones and the Milky Way. */
function obsStarGeometry(THREE, rad, count) {
  const r = koiRng(4471), pos = [], star = [];
  const eq = (raH, decD) => { const a = (raH / 24) * Math.PI * 2, d = (decD * Math.PI) / 180; return [Math.cos(d) * Math.cos(a) * rad, Math.cos(d) * Math.sin(a) * rad, Math.sin(d) * rad]; };
  for (const [ra, dec, mag, col] of OBS_STARS) { pos.push(...eq(ra, dec)); star.push(Math.max(1.4, 4.6 - mag * 1.1), col, r(), Math.min(1.6, 1.25 - mag * 0.2)); }
  const gnp = new THREE.Vector3(...eq(12.857, 27.13)).normalize(), gu = new THREE.Vector3(0, 0, 1).cross(gnp).normalize(), gv = gnp.clone().cross(gu);
  for (let i = 0; i < count; i++) {
    let p;
    if (i % 5 < 2) { // two in five along the Milky Way
      const a = r(0, Math.PI * 2), lat = (r() + r() + r() - 1.5) * 0.16;
      p = gu.clone().multiplyScalar(Math.cos(a) * Math.cos(lat)).addScaledVector(gv, Math.sin(a) * Math.cos(lat)).addScaledVector(gnp, Math.sin(lat)).multiplyScalar(rad);
    } else { const z = r(-1, 1), a = r(0, Math.PI * 2), s = Math.sqrt(1 - z * z); p = new THREE.Vector3(s * Math.cos(a) * rad, s * Math.sin(a) * rad, z * rad); }
    const m = r();
    pos.push(p.x, p.y, p.z); star.push(0.8 + 1.6 * m * m * m, ((r() * 5) | 0) % 4 + (r() < 0.6 ? 0 : 0), r(), 0.25 + 0.6 * m * m);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aStar", new THREE.Float32BufferAttribute(star, 4));
  return g;
}
/** A planisphere pinned to the wall: the star disc, constellation lines, a date ring. */
function obsChart(THREE) {
  return canvasTexture(THREE, 512, 512, (g) => {
    g.fillStyle = "#e9dfc6"; g.fillRect(0, 0, 512, 512);
    g.fillStyle = "#1c2a4a"; g.beginPath(); g.arc(256, 256, 220, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#8a6d3b"; g.lineWidth = 6; g.stroke();
    g.strokeStyle = "rgba(233,223,198,0.35)"; g.lineWidth = 1;
    for (const rr of [60, 120, 180]) { g.beginPath(); g.arc(256, 256, rr, 0, Math.PI * 2); g.stroke(); }
    for (let i = 0; i < 12; i++) { const a = (i / 12) * Math.PI * 2; g.beginPath(); g.moveTo(256, 256); g.lineTo(256 + Math.cos(a) * 220, 256 + Math.sin(a) * 220); g.stroke(); }
    const r = koiRng(12);
    const pts = Array.from({ length: 140 }, () => { const a = r(0, 6.28), d = Math.sqrt(r()) * 210; return [256 + Math.cos(a) * d, 256 + Math.sin(a) * d, r(0.6, 2.6)]; });
    g.strokeStyle = "rgba(233,223,198,0.55)"; g.lineWidth = 1.2;
    for (let c = 0; c < 9; c++) { const k = (r() * 130) | 0; g.beginPath(); g.moveTo(pts[k][0], pts[k][1]); for (let s = 1; s < 5; s++) g.lineTo(pts[k + s][0], pts[k + s][1]); g.stroke(); }
    g.fillStyle = "#f6efdc";
    for (const [x, y, s] of pts) { g.beginPath(); g.arc(x, y, s, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#6b5530"; g.font = "bold 22px Georgia, serif"; g.textAlign = "center";
    g.fillText("PLANISPHAERIUM", 256, 30); g.fillText("COELESTE", 256, 500);
  });
}
/** The brass lamp's glow and the room, as the telescope's paint and brass mirror them: the slit a bright band to the south. */
function obsEnv(THREE, dark) {
  const tex = canvasTexture(THREE, 512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, dark ? "#0b0e16" : "#d9d4c8"); grad.addColorStop(0.5, dark ? "#141824" : "#b8b0a0"); grad.addColorStop(1, dark ? "#08090c" : "#5a4a3a");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const sx = w * 0.25, band = g.createLinearGradient(sx - 30, 0, sx + 30, 0); // the slit, straight up from the south
    band.addColorStop(0, "rgba(0,0,0,0)"); band.addColorStop(0.5, dark ? "rgba(70,90,150,1)" : "rgba(200,225,255,1)"); band.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = band; g.fillRect(sx - 30, 0, 60, h * 0.5);
    const gx = w * (dark ? 0.9 : 0.25), gy = h * (dark ? 0.45 : 0.2), rg = g.createRadialGradient(gx, gy, 0, gx, gy, h * 0.14);
    rg.addColorStop(0, dark ? "rgba(255,196,130,1)" : "rgba(255,250,235,1)"); rg.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = rg; g.fillRect(gx - h * 0.14, gy - h * 0.14, h * 0.28, h * 0.28); // the lamp by night, the sun by day
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
function observatory(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const TAU = Math.PI * 2;
  const r = koiRng(1609);
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4();
  camera.fov = 60; camera.near = 0.05; camera.far = 200;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  const R = 7, WALL = 2.6, C = new THREE.Vector3(0, WALL, 0), SH = 1.5, Z_END = 1.8; // the dome; the slit's half-width and where it ends past the top
  const LAT = 30; // an assumed latitude (the browser does not know where we are); the longitude comes from the time zone
  const dirAt = (elevDeg, x = 0) => new THREE.Vector3(x, Math.sin((elevDeg * Math.PI) / 180), -Math.cos((elevDeg * Math.PI) / 180)).normalize();
  const MOON = dirAt(42), SUN = dirAt(40), PLANET = dirAt(31, 0.07), STAR = dirAt(55, -0.06);
  const time = { value: 0 }, accent = new THREE.Color();
  const noise = keep(lhNoise(THREE)), glow = keep(lhGlow(THREE));
  const quad = keep(new THREE.PlaneGeometry(1, 1));

  /* --- light from the sky only reaches what sees it through the slit: a test added to every lit material --- */
  const slitUni = { uLightDir: { value: SUN.clone() }, uDomeC: { value: C }, uDomeR: { value: R - 0.05 }, uSlitHalf: { value: SH }, uSlitEnd: { value: Z_END } };
  const lightsChunk = THREE.ShaderChunk.lights_fragment_begin.replace("getDirectionalLightInfo( directionalLight, directLight );", "getDirectionalLightInfo( directionalLight, directLight );\n\t\tdirectLight.color *= obsSlit( vObsWorld );");
  const lit = (opts) => {
    const mat = new THREE.MeshStandardMaterial(opts);
    mat.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, slitUni);
      sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nvarying vec3 vObsWorld;").replace("#include <begin_vertex>", "#include <begin_vertex>\nvObsWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      sh.fragmentShader = sh.fragmentShader.replace("#include <common>", `#include <common>\nvarying vec3 vObsWorld;\n${OBS_SLIT}`).replace("#include <lights_fragment_begin>", lightsChunk);
    };
    mat.customProgramCacheKey = () => "obs-slit";
    return keep(mat);
  };
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const sky1 = new THREE.DirectionalLight(0xffffff, 1); // the sun, or the moon
  sky1.target.position.copy(C);
  const lampLight = new THREE.PointLight(0xffb46a, 0, 0, 2);
  scene.add(hemi, sky1, sky1.target, lampLight);
  let envTex = null;
  const buildEnv = (dark) => { envTex?.dispose(); envTex = obsEnv(THREE, dark); scene.environment = envTex; };

  /* --- the sky through the slit: gradient and sun, the stars turning with the real time, the moon in its real phase, clouds, meteors --- */
  const skyUni = { uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uSunDir: { value: SUN }, uSunCol: { value: new THREE.Color("#fff6e0") }, uSun: { value: 0 } };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(90, 32, 16)), keep(new THREE.ShaderMaterial({ uniforms: skyUni, vertexShader: OBS_SKY_VS, fragmentShader: OBS_SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false })));
  sky.position.copy(C); sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  const starUni = { uTime: time, uPx: { value: 1 }, uAlpha: { value: 1 } };
  const stars = new THREE.Points(keep(obsStarGeometry(THREE, 70, preview ? 1500 : 4200)), keep(new THREE.ShaderMaterial({ uniforms: starUni, vertexShader: OBS_STAR_VS, fragmentShader: OBS_STAR_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  stars.matrixAutoUpdate = false; stars.frustumCulled = false; stars.renderOrder = -5;
  scene.add(stars);
  const phi = (LAT * Math.PI) / 180, Mer = new THREE.Vector3(0, Math.cos(phi), -Math.sin(phi)), East = new THREE.Vector3(-1, 0, 0), Pole = new THREE.Vector3(0, Math.sin(phi), Math.cos(phi));
  const skyBasis = new THREE.Matrix4().makeBasis(Mer, East, Pole), spin = new THREE.Matrix4(), place = new THREE.Matrix4().makeTranslation(C.x, C.y, C.z);
  const moonUni = { uMap: { value: keep(obsMoonTex(THREE)) }, uPhase: { value: 0.5 }, uTint: { value: new THREE.Color(1, 1, 1) }, uOn: { value: 1 } };
  const moon = new THREE.Mesh(quad, keep(new THREE.ShaderMaterial({ uniforms: moonUni, vertexShader: LANTERN_LAYER_VS, fragmentShader: OBS_MOON_FS, transparent: true, depthWrite: false })));
  moon.position.copy(C).addScaledVector(MOON, 60); moon.scale.setScalar(3.4); moon.renderOrder = -4;
  scene.add(moon);
  const haloMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0x9fb2d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  const halo = new THREE.Sprite(haloMat);
  halo.position.copy(moon.position); halo.scale.setScalar(16); halo.renderOrder = -6;
  scene.add(halo);
  const planet = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0xfff1d6, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
  planet.position.copy(C).addScaledVector(PLANET, 60); planet.scale.setScalar(0.9); planet.renderOrder = -4;
  scene.add(planet);
  const cloudMat = keep(new THREE.MeshBasicMaterial({ map: keep(cloudTexture(THREE)), transparent: true, depthWrite: false, fog: false }));
  const clouds = Array.from({ length: preview ? 3 : 5 }, (_, i) => { const m = new THREE.Mesh(quad, cloudMat); m.renderOrder = -3; m.frustumCulled = false; scene.add(m); return { m, u: r(-1, 1), el: 26 + i * 9 + r(-3, 3), speed: r(0.012, 0.025), w: r(14, 22) }; });
  const meteorGeo = keep(new THREE.BufferGeometry());
  meteorGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(6), 3).setUsage(THREE.DynamicDrawUsage));
  meteorGeo.setAttribute("color", new THREE.BufferAttribute(new Float32Array([1, 1, 1, 0, 0, 0]), 3));
  const meteor = new THREE.Line(meteorGeo, keep(new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })));
  meteor.frustumCulled = false; meteor.renderOrder = -3; meteor.visible = false;
  scene.add(meteor);
  let meteorT = -1, nextMeteor = 4;
  const mFrom = new THREE.Vector3(), mDir = new THREE.Vector3();

  /* --- the room: the dome with its ribs and shutter rails, the wooden wall, the floor --- */
  const domeMat = lit({ map: keep(obsPanels(THREE)), roughness: 0.85, envMapIntensity: 0.25 });
  const dome = new THREE.Mesh(keep(obsDome(THREE, R, SH, Z_END, preview ? 10 : 18, preview ? 32 : 56)), domeMat);
  dome.position.copy(C);
  scene.add(dome);
  const ironMat = lit({ color: 0x2c2f35, metalness: 0.5, roughness: 0.55 });
  const ribs = new THREE.Mesh(keep(obsRibs(THREE, R, SH, Z_END)), ironMat);
  ribs.position.copy(C);
  scene.add(ribs);
  const wallTex = keep(globeWood(THREE, 1024, 256, "#6b4a33", 314));
  wallTex.repeat.set(6, 1);
  const wallMat = lit({ map: wallTex, roughness: 0.8, side: THREE.BackSide, envMapIntensity: 0.25 });
  const wall = new THREE.Mesh(keep(new THREE.CylinderGeometry(R, R, WALL, 64, 1, true)), wallMat);
  wall.position.y = WALL / 2;
  scene.add(wall);
  const floorGeo = keep(new THREE.CircleGeometry(R, 64));
  floorGeo.rotateX(-Math.PI / 2);
  const fp = floorGeo.attributes.position, fu = floorGeo.attributes.uv;
  for (let i = 0; i < fp.count; i++) fu.setXY(i, fp.getX(i) / 4, -fp.getZ(i) / 4);
  const floorMat = lit({ map: keep(cwPlanks(THREE, preview ? 512 : 1024, preview ? 512 : 1024)), roughness: 0.75, envMapIntensity: 0.25 });
  scene.add(new THREE.Mesh(floorGeo, floorMat));
  // on the south-west wall: a planisphere and a brass lamp (lit at night)
  const onWall = (az, y, off = 0.12) => new THREE.Vector3(Math.sin(az) * (R - off), y, -Math.cos(az) * (R - off));
  const chart = new THREE.Mesh(quad, lit({ map: keep(obsChart(THREE)), roughness: 0.9, envMapIntensity: 0.2 }));
  chart.position.copy(onWall(-0.62, 1.55, 0.06)); chart.scale.setScalar(1.1); chart.lookAt(0, 1.55, 0);
  scene.add(chart);
  const brass = lit({ color: 0xd4a856, metalness: 1, roughness: 0.3 });
  const lamp = new THREE.Group();
  lamp.position.copy(onWall(-0.3, 2.1, 0.08)); lamp.lookAt(0, 2.1, 0);
  lamp.add(new THREE.Mesh(keep(mergeParts(THREE, [[new THREE.CylinderGeometry(0.09, 0.09, 0.03, 20), new THREE.Matrix4().makeRotationX(Math.PI / 2)], [new THREE.CylinderGeometry(0.015, 0.015, 0.3, 8), new THREE.Matrix4().compose(new THREE.Vector3(0, 0, 0.15), new THREE.Quaternion().setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0)), new THREE.Vector3(1, 1, 1))], [new THREE.CylinderGeometry(0.07, 0.15, 0.16, 24, 1, true), new THREE.Matrix4().makeTranslation(0, -0.02, 0.32)]])), brass));
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: 0xffe2b0 }));
  const bulb = new THREE.Mesh(keep(new THREE.SphereGeometry(0.045, 12, 8)), bulbMat);
  bulb.position.set(0, -0.08, 0.32);
  lamp.add(bulb);
  const lampGlowMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffb870, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  const lampGlow = new THREE.Sprite(lampGlowMat);
  lampGlow.position.set(0, -0.1, 0.32); lampGlow.scale.setScalar(0.9);
  lamp.add(lampGlow);
  scene.add(lamp);
  lamp.updateMatrixWorld();
  lampLight.position.copy(bulb.getWorldPosition(V));

  /* --- the telescope: a refractor on a German equatorial mount, its polar axis aimed at the celestial pole --- */
  const P = Pole.clone(), H0 = new THREE.Vector3(0, 1.42, 0), HD = H0.clone().addScaledVector(P, 0.45);
  const alongZ = (g) => { g.rotateX(Math.PI / 2); return g; }, alongX = (g) => { g.rotateZ(-Math.PI / 2); return g; };
  const paint = lit({ metalness: 0.35, roughness: 0.32 }), steel = lit({ color: 0xb7bdc6, metalness: 1, roughness: 0.25 }), mountMat = lit({ color: 0x3a3f47, metalness: 0.4, roughness: 0.5 });
  scene.add(new THREE.Mesh(keep(mergeParts(THREE, [[new THREE.CylinderGeometry(0.29, 0.35, 1.3, 32), new THREE.Matrix4().makeTranslation(0, 0.65, 0)], [new THREE.CylinderGeometry(0.55, 0.58, 0.06, 32), new THREE.Matrix4().makeTranslation(0, 0.03, 0)], [new THREE.BoxGeometry(0.36, 0.26, 0.36), new THREE.Matrix4().makeTranslation(H0.x, H0.y, H0.z)],
    [new THREE.CylinderGeometry(0.13, 0.13, 0.75, 24), new THREE.Matrix4().compose(H0.clone().addScaledVector(P, 0.22), new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), P), new THREE.Vector3(1, 1, 1))]])), mountMat));
  const scope = new THREE.Group(); // local x = declination axis, z = where the tube points
  scope.position.copy(HD);
  scene.add(scope);
  const TX = 0.62;
  const part = (geo, mat, x, y, z) => { geo.translate(x, y, z); const m = new THREE.Mesh(keep(geo), mat); scope.add(m); return m; };
  part(alongX(new THREE.CylinderGeometry(0.1, 0.1, 0.5, 20)), mountMat, 0.25, 0, 0);
  part(alongX(new THREE.CylinderGeometry(0.035, 0.035, 1.0, 10)), steel, -0.5, 0, 0);
  for (const x of [-0.6, -0.8]) part(alongX(new THREE.CylinderGeometry(0.17, 0.17, 0.15, 28)), mountMat, x, 0, 0);
  part(alongZ(new THREE.CylinderGeometry(0.19, 0.19, 2.5, 40)), paint, TX, 0, 0.2);
  part(alongZ(new THREE.CylinderGeometry(0.215, 0.215, 0.55, 40, 1, true)), paint, TX, 0, 1.68);
  for (const z of [-0.25, 0.75]) part(new THREE.TorusGeometry(0.205, 0.028, 8, 32), brass, TX, 0, z);
  part(alongZ(new THREE.CylinderGeometry(0.21, 0.21, 0.05, 40)), brass, TX, 0, 1.43);
  part(alongZ(new THREE.CylinderGeometry(0.07, 0.07, 0.34, 16)), brass, TX, 0, -1.2);
  part(new THREE.BoxGeometry(0.1, 0.1, 0.1), mountMat, TX, 0, -1.4);
  part(new THREE.CylinderGeometry(0.035, 0.035, 0.14, 12), brass, TX, 0.1, -1.4);
  part(alongZ(new THREE.CylinderGeometry(0.045, 0.045, 0.6, 14)), paint, TX, 0.29, 0.35);
  for (const z of [0.15, 0.55]) part(new THREE.BoxGeometry(0.03, 0.1, 0.03), mountMat, TX, 0.23, z);
  const lensMat = keep(new THREE.MeshStandardMaterial({ color: 0x0a0f18, metalness: 0.9, roughness: 0.08 }));
  part(new THREE.CircleGeometry(0.19, 32), lensMat, TX, 0, 1.46); // the objective behind the dew shield (a circle already faces along the tube)
  const filterMat = keep(new THREE.MeshStandardMaterial({ color: 0x3a2a12, metalness: 0.6, roughness: 0.3 }));
  const filter = part(alongZ(new THREE.CylinderGeometry(0.235, 0.235, 0.05, 40)), filterMat, TX, 0, 1.97); // a solar filter over the lens by day
  const aim = MOON.clone(), aimFrom = MOON.clone(), aimTo = MOON.clone(), basis = new THREE.Matrix4(), Dx = new THREE.Vector3(), Uy = new THREE.Vector3();
  let targets = [MOON, PLANET, MOON, STAR], ti = 0, slewT = 1, nextSlew = 40;
  function pointAt(T) { // declination axis square to the polar axis and the tube
    Dx.crossVectors(P, T).normalize(); Uy.crossVectors(T, Dx);
    scope.quaternion.setFromRotationMatrix(basis.makeBasis(Dx, Uy, T));
  }

  /* --- the air: god rays through the slit (traced inside the dome), dust in them --- */
  const beamUni = { ...slitUni, uNoise: { value: noise }, uColor: { value: new THREE.Color() }, uTime: time, uFloorY: { value: 0 } };
  const beamGeo = keep(new THREE.SphereGeometry(R - 0.1, 32, 16));
  const beam = new THREE.Mesh(beamGeo, keep(new THREE.ShaderMaterial({ uniforms: beamUni, vertexShader: OBS_WORLD_VS, fragmentShader: OBS_BEAM_FS, defines: { OBS_STEPS: preview ? 7 : 12 }, side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  beam.position.copy(C); beam.frustumCulled = false; beam.renderOrder = 5;
  scene.add(beam);
  const ND = preview ? 200 : 700, dust = new THREE.BufferGeometry();
  dust.setAttribute("position", new THREE.BufferAttribute(new Float32Array(ND * 3), 3));
  dust.setAttribute("aSeed", new THREE.BufferAttribute(Float32Array.from({ length: ND * 4 }, () => r()), 4));
  keep(dust);
  const dustUni = { ...slitUni, uTime: time, uPx: { value: 600 }, uBox: { value: new THREE.Vector3(11, 8, 11) }, uBoxC: { value: new THREE.Vector3(0, 4.5, -0.5) }, uColor: { value: new THREE.Color() }, uBase: { value: 0.03 } };
  const motes = new THREE.Points(dust, keep(new THREE.ShaderMaterial({ uniforms: dustUni, vertexShader: OBS_DUST_VS, fragmentShader: OBS_DUST_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  motes.frustumCulled = false; motes.renderOrder = 6;
  scene.add(motes);
  const buf = new THREE.Vector2();
  motes.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); dustUni.uPx.value = buf.y / (2 * Math.tan((camera.fov * Math.PI) / 360)); starUni.uPx.value = Math.max(1, buf.y / 900); };

  /* --- today's moon and the turning sky --- */
  let night = true;
  function skyNow(ms) {
    const phase = ((((ms - Date.UTC(2000, 0, 6, 18, 14)) / 86400000 / 29.530588853) % 1) + 1) % 1; // 0 new, ½ full
    moonUni.uPhase.value = phase;
    const lon = (-new Date(ms).getTimezoneOffset() / 60) * 15; // roughly, from the time zone
    const d = ms / 86400000 + 2440587.5 - 2451545.0, lst = (((280.46061837 + 360.98564736629 * d + lon) % 360) + 360) % 360;
    stars.matrix.copy(place).multiply(skyBasis).multiply(spin.makeRotationZ((-lst * Math.PI) / 180));
    stars.matrixWorldNeedsUpdate = true; // its matrix is set by hand
    return phase;
  }

  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    night = d;
    accent.set(p.accent);
    paint.color.copy(accent);
    buildEnv(d);
    skyUni.uZenith.value.set(d ? "#050a1a" : "#3b7fd4"); skyUni.uHorizon.value.set(d ? "#16213f" : "#bcdcf5"); skyUni.uSun.value = d ? 0 : 1;
    starUni.uAlpha.value = d ? 1 : 0; stars.visible = d;
    moon.visible = halo.visible = planet.visible = d; haloMat.opacity = 0.5;
    clouds.forEach((c) => { c.m.visible = !d; });
    cloudMat.color.set("#ffffff"); cloudMat.opacity = 0.92;
    slitUni.uLightDir.value.copy(d ? MOON : SUN);
    sky1.color.set(d ? "#b8c8f0" : "#fff1d8"); sky1.intensity = d ? 0.9 : 4.2; sky1.position.copy(C).addScaledVector(slitUni.uLightDir.value, 20);
    hemi.color.set(d ? "#27324e" : "#d9e6f5"); hemi.groundColor.set(d ? "#0b0a0c" : "#7a6452"); hemi.intensity = d ? 0.24 : 0.5;
    lampLight.intensity = d ? 5 : 0; bulbMat.color.set(d ? "#ffe2b0" : "#8a8474"); lampGlow.visible = d;
    beamUni.uColor.value.set(d ? "#9fb4ff" : "#ffe6b8").multiplyScalar(d ? 0.04 : 0.035);
    dustUni.uColor.value.set(d ? "#b9c7ff" : "#fff0d4"); dustUni.uBase.value = d ? 0.008 : 0; // only the dust in the light glints
    filter.visible = !d;
    targets = d ? [MOON, PLANET, MOON, STAR] : [SUN, SUN]; ti = 0; aimFrom.copy(aim); aimTo.copy(targets[0]); slewT = 0;
  }
  applyPalette(pal);

  const look = new THREE.Vector3();
  function frame(dt, t) {
    time.value = t;
    skyNow(Date.now());
    // the camera: standing by the wall, looking up the slit; a phone held upright gets a taller view
    const A = camera.aspect || 1, fov = A >= 1 ? 64 : 64 + (1 - A) * 24;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const sway = Math.sin(t * 0.045) * 0.25;
    camera.position.set(0.5 + sway, 1.7, 6.2); // by the north wall: the whole telescope under the slit
    camera.lookAt(look.set(-0.1 + sway * 0.4, 1.7 + Math.tan(((A >= 1 ? 17 : 24) * Math.PI) / 180) * 10, -3.8));
    moon.lookAt(camera.position);
    // slewing now and then from one target to the next, easing in and out
    if ((nextSlew -= dt) <= 0) { ti = (ti + 1) % targets.length; aimFrom.copy(aim); aimTo.copy(targets[ti]); slewT = 0; nextSlew = r(35, 55); }
    if (slewT < 1) { slewT = Math.min(1, slewT + dt / 6); const e = slewT * slewT * (3 - 2 * slewT); aim.copy(aimFrom).lerp(aimTo, e).normalize(); }
    pointAt(aim);
    for (const c of clouds) {
      c.u += c.speed * dt;
      if (c.u > 1.2) c.u = -1.2;
      const az = c.u * 0.45, el = (c.el * Math.PI) / 180;
      c.m.position.set(C.x + Math.sin(az) * Math.cos(el) * 55, C.y + Math.sin(el) * 55, C.z - Math.cos(az) * Math.cos(el) * 55);
      c.m.lookAt(C); c.m.scale.set(c.w, c.w * 0.45, 1);
    }
    if (night && t > nextMeteor && meteorT < 0) { // a meteor across the slit now and then
      meteorT = 0; nextMeteor = t + r(7, 16);
      mFrom.set(r(-0.14, 0.14), Math.sin(r(0.5, 1.0)), -1).normalize();
      mDir.set(r(-1, 1), r(-0.6, -0.2), r(-0.2, 0.2)).normalize();
    }
    if (meteorT >= 0) {
      meteorT += dt;
      const k = meteorT / 0.7, head = V.copy(mFrom).addScaledVector(mDir, 0.25 * k).normalize().multiplyScalar(65).add(C);
      const tail = mFrom.clone().addScaledVector(mDir, Math.max(0, 0.25 * k - 0.12)).normalize().multiplyScalar(65).add(C);
      const pa = meteorGeo.attributes.position;
      pa.setXYZ(0, head.x, head.y, head.z); pa.setXYZ(1, tail.x, tail.y, tail.z); pa.needsUpdate = true;
      const b = Math.sin(Math.PI * Math.min(1, k)), ca = meteorGeo.attributes.color;
      ca.setXYZ(0, b, b, b); ca.needsUpdate = true;
      meteor.visible = true;
      if (k >= 1) { meteorT = -1; meteor.visible = false; }
    }
    lampGlowMat.opacity = 0.8 + 0.06 * Math.sin(t * 5.3) * Math.sin(t * 2.1);
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { const ph = moonUni.uPhase.value, names = ["new moon", "waxing crescent", "first quarter", "waxing gibbous", "full moon", "waning gibbous", "last quarter", "waning crescent"]; return { phase: +ph.toFixed(3), moon: names[Math.round(ph * 8) % 8], target: ti }; }, // for checking by hand
    dispose() { scene.environment = null; envTex?.dispose(); disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Hot-air balloons: sunrise over a fairy-chimney valley, dozens of balloons drifting up it; at night they glow like lanterns when a burner fires ---------- */
// the envelope: gores and bands in two colours per balloon, lit by the sun, glowing where the sun is behind it, and lit from inside by the burner
const HOTAIR_ENV_VS = /* glsl */ `
  attribute vec3 aColA; attribute vec3 aColB; attribute vec4 aInfo; // pattern, seed, burner, spare
  varying vec3 vN; varying vec2 vUv; varying vec3 vColA; varying vec3 vColB; varying vec4 vInfo; varying vec3 vWorld;
  void main() {
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = w.xyz;
    vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    vUv = uv; vColA = aColA; vColB = aColB; vInfo = aInfo;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const HOTAIR_ENV_FS = /* glsl */ `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uSkyCol; uniform vec3 uGroundCol; uniform vec3 uBurnCol; uniform float uBurnGain;
  uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  varying vec3 vN; varying vec2 vUv; varying vec3 vColA; varying vec3 vColB; varying vec4 vInfo; varying vec3 vWorld;
  void main() {
    float gore = mod(floor(vUv.x * 16.0), 2.0), band = mod(floor(vUv.y * 6.0 + 0.5), 2.0), p = vInfo.x, k;
    if (p < 0.5) k = gore; else if (p < 1.5) k = band; else if (p < 2.5) k = mod(gore + band, 2.0);
    else if (p < 3.5) k = mix(gore, 1.0, step(0.58, vUv.y)); else k = step(0.36, vUv.y) * (1.0 - step(0.5, vUv.y));
    vec3 base = mix(vColA, vColB, k) * (1.0 - 0.18 * pow(abs(fract(vUv.x * 16.0) - 0.5) * 2.0, 10.0)); // the gores' seams
    vec3 N = normalize(vN);
    float diff = max(dot(N, uSunDir), 0.0), back = pow(max(dot(-N, uSunDir), 0.0), 1.5);
    vec3 col = base * (mix(uGroundCol, uSkyCol, N.y * 0.5 + 0.5) + uSunCol * diff + uSunCol * 0.45 * back);
    col += base * uBurnCol * vInfo.z * uBurnGain * exp(-vUv.y * 2.4); // the burner's glow inside, brightest at the throat
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, distance(vWorld, cameraPosition)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// the burner flames: a point each, sized by the balloon and how hard it is burning
const HOTAIR_FLAME_VS = /* glsl */ `
  uniform float uPx;
  attribute float aSize; attribute float aBurn;
  varying float vBurn;
  void main() {
    vBurn = aBurn;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aBurn > 0.02 ? clamp(aSize * (0.6 + 0.4 * aBurn) * uPx / -mv.z, 2.0, 90.0) : 0.0;
  }
`;
const HOTAIR_FLAME_FS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uColor; uniform float uGain;
  varying float vBurn;
  void main() {
    float m = pow(texture2D(uMap, gl_PointCoord).a, 2.2); // the sprite was painted as display values
    gl_FragColor = vec4(uColor * m * vBurn * uGain, 1.0);
  }
`;
/** The valley's height at (x, z): soft eroded ridges, a winding valley floor, and the ridge the viewer stands on at the origin. */
function hotairHeight(x, z) {
  const n = (s, o) => lhNoise3(x * s + o, 7.3, z * s + o);
  const ridges = 1 - Math.abs(2 * n(0.0032, 3) - 1);
  let h = 22 * ridges + 26 * n(0.0075, 11) + 9 * n(0.02, 5) + 3 * n(0.05, 1);
  const vx = 70 + 60 * Math.sin(z * 0.005 + 1); // the valley floor winds up the view
  h -= 24 * Math.exp(-(((x - vx) / 150) ** 2));
  h += 42 * Math.exp(-(x * x + (z - 26) * (z - 26)) / (52 * 52)); // the outcrop the viewer stands on: its top behind, the drop in front
  const far = Math.min(1, Math.max(0, (-z - 450) / 500));
  h += 55 * far * far * (1 - Math.abs(2 * n(0.0018, 21) - 1)); // higher hills close the valley off far away
  return Math.max(0, h);
}
/** Tuff strata: bands of cream, rose and tan with a little grain; contours on the ground, rings round a chimney. */
function hotairRock(THREE, S) {
  const r = koiRng(2718), k = S / 512;
  const tex = canvasTexture(THREE, S, S, (g) => {
    const cols = ["#ecd3b6", "#dfae94", "#d4987e", "#e6c3a4", "#cf9680", "#f1dcc4", "#dcae92"];
    g.fillStyle = "#e3c7a8"; g.fillRect(0, 0, S, S);
    for (let y = 0; y < S;) {
      const h = r(6, 26) * k;
      g.fillStyle = cols[(r() * cols.length) | 0]; g.beginPath(); g.moveTo(0, y);
      for (let x = 0; x <= S; x += 16) g.lineTo(x, y + Math.sin(x * 0.02 + y) * 2 * k);
      g.lineTo(S, y + h); g.lineTo(0, y + h); g.closePath(); g.fill();
      y += h;
    }
    for (let i = 0; i < S * 4; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "90,60,40" : "255,240,220"},${r(0.03, 0.09)})`; g.fillRect(r(0, S), r(0, S), r(1, 3) * k, r(1, 2) * k); }
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(110,70,50,${r(0.05, 0.14)})`; const x = r(0, S); g.fillRect(x, 0, r(1, 3) * k, S); } // erosion channels
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
/** Mottled tuff for the ground, erosion channels running down the slopes; tiles. */
function hotairGround(THREE, S) {
  const r = koiRng(1414), k = S / 512;
  const tex = canvasTexture(THREE, S, S, (g) => {
    g.fillStyle = "#e6cdb0"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 260; i++) {
      const x = r(0, S), y = r(0, S), rad = r(12, 70) * k, c = ["232,205,176", "214,168,140", "240,224,200", "200,150,125", "225,190,160"][(r() * 5) | 0], a = r(0.25, 0.6);
      for (const ox of [0, -S, S]) for (const oy of [0, -S, S]) { // drawn wrapped, so the tile has no seam
        if (x + ox < -rad || x + ox > S + rad || y + oy < -rad || y + oy > S + rad) continue;
        const gr = g.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
        gr.addColorStop(0, `rgba(${c},${a})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
      }
    }
    for (let i = 0; i < 70; i++) {
      const x0 = r(0, S);
      g.strokeStyle = `rgba(120,80,60,${r(0.025, 0.07)})`; g.lineWidth = r(1.5, 4) * k; g.beginPath();
      for (let y = 0; y <= S; y += 16) g.lineTo(x0 + Math.sin((y / S) * Math.PI * 6 + x0) * 3 * k, y);
      g.stroke();
    }
    for (let i = 0; i < S * 3; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "90,60,40" : "255,245,225"},${r(0.04, 0.1)})`; g.fillRect(r(0, S), r(0, S), r(1, 3) * k, r(1, 2) * k); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
/** The valley as a heightfield in world coordinates (its middle at z = zc): vertex colours pale on the ridges, rosy on the slopes, olive on the floor. */
function hotairTerrain(THREE, W, D, nx, nz, zc, height) {
  const g = new THREE.PlaneGeometry(W, D, nx, nz);
  g.rotateX(-Math.PI / 2);
  g.translate(0, 0, zc);
  const p = g.attributes.position, uv = g.attributes.uv, col = [], c = new THREE.Color();
  const pale = new THREE.Color("#f2e3cd"), rose = new THREE.Color("#c99a86"), floor = new THREE.Color("#9c9c72");
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i), h = height(x, z);
    p.setY(i, h);
    uv.setXY(i, x / 30, z / 30);
    const n = lhNoise3(x * 0.01 + 9, 0, z * 0.01);
    c.copy(rose).lerp(pale, Math.min(1, Math.max(0, (h - 10) / 45)) * 0.8 + n * 0.3);
    if (h < 12) c.lerp(floor, Math.min(1, (12 - h) / 10));
    c.multiplyScalar(0.85 + 0.3 * n);
    col.push(c.r, c.g, c.b);
  }
  g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** A fairy chimney: a tapering cone of tuff; kind 0 with a cap of harder rock, 1 a slender spire, 2 a stout one under a broad cap. */
function hotairChimney(THREE, kind) {
  const profs = [
    [[3.4, 0], [2.5, 3], [1.8, 6], [1.4, 9], [1.25, 11.4], [1.45, 11.6], [2.1, 12.4], [2.15, 13.4], [1.6, 14.4], [0.7, 15.2], [0, 15.5]],
    [[3.0, 0], [2.2, 3], [1.5, 6.5], [1.05, 10], [0.7, 13.5], [0.35, 16], [0, 17.5]],
    [[4.0, 0], [3.2, 2.5], [2.6, 5], [2.3, 7.5], [2.05, 9.5], [2.3, 9.8], [2.9, 10.6], [2.8, 11.6], [2.0, 12.4], [0.8, 13.0], [0, 13.2]],
  ];
  const capY = [11.5, 99, 9.7][kind];
  const g = new THREE.LatheGeometry(profs[kind].map(([x, y]) => new THREE.Vector2(x, y)), kind === 1 ? 8 : 9), p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) col.set(p.getY(i) > capY ? [0.58, 0.5, 0.46] : [1, 1, 1], i * 3);
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  return g;
}
/** A balloon envelope (units of its widest radius; the throat at y = 0, the crown at 2.36). */
function hotairEnvelope(THREE, segs) {
  const prof = [[0.27, 0], [0.55, 0.22], [0.8, 0.5], [0.95, 0.85], [1, 1.22], [0.97, 1.58], [0.84, 1.9], [0.58, 2.16], [0.24, 2.32], [0, 2.36]].map(([x, y]) => new THREE.Vector2(x, y));
  return new THREE.LatheGeometry(prof, segs);
}
/** The basket, burner and ropes below the throat, in the envelope's units, as one coloured geometry. */
function hotairBasket(THREE) {
  const at = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const parts = [
    [new THREE.BoxGeometry(0.16, 0.12, 0.14), at(0, -0.5, 0), "#7d5a36"], [new THREE.BoxGeometry(0.17, 0.02, 0.15), at(0, -0.45, 0), "#5a3f26"],
    [new THREE.BoxGeometry(0.07, 0.05, 0.07), at(0, -0.31, 0), "#3b3b3f"],
    [new THREE.TorusGeometry(0.26, 0.012, 6, 24), new THREE.Matrix4().makeRotationX(Math.PI / 2), "#8f8f95"],
  ];
  const up = new THREE.Vector3(0, 1, 0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    parts.push([new THREE.CylinderGeometry(0.008, 0.008, 0.16, 5), at(sx * 0.055, -0.36, sz * 0.05), "#4a4a50"]); // the burner frame
    const a = new THREE.Vector3(sx * 0.075, -0.44, sz * 0.065), b = new THREE.Vector3(sx * 0.19, 0, sz * 0.17), d = b.clone().sub(a);
    parts.push([new THREE.CylinderGeometry(0.006, 0.006, d.length(), 4), new THREE.Matrix4().compose(a.add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(up, d.normalize()), new THREE.Vector3(1, 1, 1)), "#cfc6b4"]);
  }
  return mergeColored(THREE, parts);
}
function hotair(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(1783);
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), E = new THREE.Euler();
  camera.fov = 55; camera.near = 0.5; camera.far = 6000;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  const time = { value: 0 };
  const glow = keep(glowTexture(THREE)), mist = keep(inkMist(THREE));
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  const accent = new THREE.Color();
  const ground = hotairHeight;
  const SUN = new THREE.Vector3(0.6, 0.26, -0.76).normalize(), MOON = new THREE.Vector3(-0.37, 0.29, -0.88).normalize(); // the sun low over the valley's far right; the moon over the hills on the left

  /* --- light: the sky and ground, the low sun (or the moon); the sun casts real shadows, so the balloons' shadows slide over the rock --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.target.position.set(40, 20, -330);
  if (!preview) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -560, right: 560, top: 560, bottom: -560, near: 1, far: 2400 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0006; sun.shadow.normalBias = 1.5;
  }
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0xffffff, 300, 1600);

  /* --- the sky: a sunrise gradient with the sun; stars and the moon at night; cirrus far off --- */
  const skyUni = { uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunDir: { value: SUN.clone() }, uSunColor: { value: new THREE.Color("#fff3d8") }, uSun: { value: 1 } };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(3800, 40, 20)), keep(new THREE.ShaderMaterial({ uniforms: skyUni, vertexShader: LANTERN_SKY_VS, fragmentShader: LANTERN_SKY_FS, side: THREE.BackSide, depthWrite: false, depthTest: false })));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  const NS = preview ? 300 : 900, sp = new Float32Array(NS * 3);
  for (let i = 0; i < NS; i++) { const a = r(0, 6.283), e = Math.asin(r(0.03, 1)); sp.set([Math.cos(a) * Math.cos(e) * 3600, Math.sin(e) * 3600, Math.sin(a) * Math.cos(e) * 3600], i * 3); }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(sp, 3));
  const stars = new THREE.Points(starGeo, keep(new THREE.PointsMaterial({ color: 0xe8eeff, size: preview ? 1.1 : 1.5, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false, fog: false })));
  stars.renderOrder = -9; stars.frustumCulled = false;
  scene.add(stars);
  const moon = new THREE.Mesh(quad, keep(new THREE.MeshBasicMaterial({ map: keep(sakuraMoon(THREE)), transparent: true, depthWrite: false, depthTest: false, fog: false })));
  moon.position.copy(MOON).multiplyScalar(3400); moon.scale.setScalar(150); moon.lookAt(0, 40, 0); moon.renderOrder = -8;
  scene.add(moon);
  const haloMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0x8fa3d8, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false, opacity: 0.45 }));
  const halo = new THREE.Sprite(haloMat);
  halo.position.copy(moon.position); halo.scale.setScalar(520); halo.renderOrder = -9;
  scene.add(halo);
  const cloudMat = keep(new THREE.MeshBasicMaterial({ map: mist, transparent: true, depthWrite: false, depthTest: false, fog: false }));
  const clouds = Array.from({ length: preview ? 3 : 6 }, (_, i) => { const m = new THREE.Mesh(quad, cloudMat); m.renderOrder = -7; m.frustumCulled = false; scene.add(m); return { m, x: r(-1800, 1800), y: r(380, 820), z: -2300 - i * 120, w: r(700, 1400), h: r(28, 60), speed: r(2, 5) }; });

  /* --- the valley: tuff terrain, fairy chimneys, a village on the floor, mist lying in the low ground --- */
  const rockTex = keep(hotairRock(THREE, preview ? 256 : 512));
  const rockMat = keep(new THREE.MeshStandardMaterial({ map: rockTex, vertexColors: true, roughness: 0.95 }));
  const groundMat = keep(new THREE.MeshStandardMaterial({ map: keep(hotairGround(THREE, preview ? 256 : 512)), vertexColors: true, roughness: 0.95 }));
  const terrain = new THREE.Mesh(keep(hotairTerrain(THREE, 1700, 1500, preview ? 70 : 140, preview ? 62 : 124, -450, ground)), groundMat);
  terrain.receiveShadow = terrain.castShadow = !preview;
  scene.add(terrain);
  const vx = (z) => 70 + 60 * Math.sin(z * 0.005 + 1);
  const spots = [[], [], []];
  const spot = (x, z, s) => spots[(r() * 3) | 0].push([x, z, s]);
  for (const z of [-150, -270, -420, -600, -800]) for (const side of [-1, 1]) { // groups along both sides of the valley
    const cx = vx(z) + side * r(70, 120), n = preview ? 5 : Math.round(r(9, 16));
    for (let i = 0; i < n; i++) spot(cx + r(-55, 55), z + r(-45, 45), r(0.7, 1.7));
  }
  for (let i = 0; i < 8; i++) spot((i < 4 ? -1 : 1) * r(30, 95), -r(30, 120), r(1.1, 2.0)); // and a few close by, below the viewer on both sides
  spots.forEach((list, kind) => {
    const mesh = new THREE.InstancedMesh(keep(hotairChimney(THREE, kind)), rockMat, Math.max(1, list.length));
    list.forEach(([x, z, sc], i) => mesh.setMatrixAt(i, M4.compose(V.set(x, ground(x, z) - 0.6, z), Q.setFromEuler(E.set(r(-0.05, 0.05), r(0, 6.28), r(-0.05, 0.05))), S3.set(sc * r(0.85, 1.15), sc, sc * r(0.85, 1.15)))));
    mesh.count = list.length; mesh.castShadow = mesh.receiveShadow = !preview; mesh.frustumCulled = false;
    scene.add(mesh);
  });
  const VZ = -330, VX = vx(VZ), NH = preview ? 24 : 60;
  const houseMat = keep(new THREE.MeshStandardMaterial({ color: 0xe2d2bc, roughness: 0.9 }));
  const houses = new THREE.InstancedMesh(keep(new THREE.BoxGeometry(1, 1, 1)), houseMat, NH);
  const lampPos = [];
  for (let i = 0; i < NH; i++) {
    const x = VX + (r() + r() - 1) * 90, z = VZ + (r() + r() - 1) * 70, w = r(5, 9), h = r(3.5, 7), dpt = r(5, 9), gy = ground(x, z);
    houses.setMatrixAt(i, M4.compose(V.set(x, gy + h / 2 - 0.5, z), Q.setFromEuler(E.set(0, r(0, 6.28), 0)), S3.set(w, h, dpt)));
    for (let k = 0; k < 2; k++) lampPos.push(x + r(-w / 2, w / 2), gy + r(1.2, h - 0.5), z + r(-dpt / 2, dpt / 2));
  }
  houses.castShadow = houses.receiveShadow = !preview; houses.frustumCulled = false;
  scene.add(houses);
  const lampGeo = keep(new THREE.BufferGeometry());
  lampGeo.setAttribute("position", new THREE.Float32BufferAttribute(lampPos, 3));
  const lamps = new THREE.Points(lampGeo, keep(new THREE.PointsMaterial({ map: glow, color: 0xffb060, size: 6, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })));
  lamps.frustumCulled = false; lamps.renderOrder = 8;
  scene.add(lamps);
  const hazeMat = keep(new THREE.MeshBasicMaterial({ map: mist, transparent: true, depthWrite: false, fog: false }));
  const hazes = [-230, -420, -650].map((z) => { const m = new THREE.Mesh(quad, hazeMat); m.position.set(vx(z), ground(vx(z), z) + 8, z); m.scale.set(700, 34, 1); m.renderOrder = 7; m.frustumCulled = false; scene.add(m); return m; });

  /* --- the balloons: an envelope, a basket and a flame each; dozens of them drifting up the valley on the wind --- */
  const NB = preview ? 14 : 40, SCHEMES = [["#e63946", "#f1faee"], ["#f4a261", "#264653"], ["#ffd166", "#ef476f"], ["#06a77d", "#f8f1e5"], ["#3a6ff0", "#ffffff"], ["#8338ec", "#ffbe0b"], ["#ff6b35", "#ffffff"], ["#2ec4b6", "#ffffff"], ["#d62828", "#fcbf49"], ["#ffffff", "#1d3557"], ["#ff8fab", "#ffffff"], ["#1b998b", "#f46036"]];
  const envGeo = keep(hotairEnvelope(THREE, preview ? 18 : 28));
  const aColA = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3), aColB = new THREE.InstancedBufferAttribute(new Float32Array(NB * 3), 3), aInfo = new THREE.InstancedBufferAttribute(new Float32Array(NB * 4), 4);
  aColA.setUsage(THREE.DynamicDrawUsage); aColB.setUsage(THREE.DynamicDrawUsage); aInfo.setUsage(THREE.DynamicDrawUsage);
  envGeo.setAttribute("aColA", aColA); envGeo.setAttribute("aColB", aColB); envGeo.setAttribute("aInfo", aInfo);
  const envUni = { uSunDir: { value: SUN.clone() }, uSunCol: { value: new THREE.Color() }, uSkyCol: { value: new THREE.Color() }, uGroundCol: { value: new THREE.Color() }, uBurnCol: { value: new THREE.Color("#ffa848") }, uBurnGain: { value: 0.35 }, uFog: { value: new THREE.Color() }, uFogNear: { value: 300 }, uFogFar: { value: 1600 } };
  const envelopes = new THREE.InstancedMesh(envGeo, keep(new THREE.ShaderMaterial({ uniforms: envUni, vertexShader: HOTAIR_ENV_VS, fragmentShader: HOTAIR_ENV_FS })), NB);
  envelopes.castShadow = !preview; envelopes.frustumCulled = false; envelopes.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(envelopes);
  const basketMat = keep(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 }));
  const baskets = new THREE.InstancedMesh(keep(hotairBasket(THREE)), basketMat, NB);
  baskets.castShadow = !preview; baskets.frustumCulled = false; baskets.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(baskets);
  const flameGeo = keep(new THREE.BufferGeometry());
  const fPos = new Float32Array(NB * 3), fSize = new Float32Array(NB), fBurn = new Float32Array(NB);
  flameGeo.setAttribute("position", new THREE.BufferAttribute(fPos, 3).setUsage(THREE.DynamicDrawUsage));
  flameGeo.setAttribute("aSize", new THREE.BufferAttribute(fSize, 1));
  flameGeo.setAttribute("aBurn", new THREE.BufferAttribute(fBurn, 1).setUsage(THREE.DynamicDrawUsage));
  const flameUni = { uPx: { value: 600 }, uMap: { value: glow }, uColor: { value: new THREE.Color("#ffb36a") }, uGain: { value: 1 } };
  const flames = new THREE.Points(flameGeo, keep(new THREE.ShaderMaterial({ uniforms: flameUni, vertexShader: HOTAIR_FLAME_VS, fragmentShader: HOTAIR_FLAME_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  flames.frustumCulled = false; flames.renderOrder = 9;
  scene.add(flames);
  const buf = new THREE.Vector2();
  flames.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); flameUni.uPx.value = buf.y / (2 * Math.tan((camera.fov * Math.PI) / 360)); };
  const B = [];
  const paint = (b, i) => {
    const a = b.accent ? [accent, b.white] : b.scheme;
    aColA.setXYZ(i, a[0].r, a[0].g, a[0].b); aColB.setXYZ(i, a[1].r, a[1].g, a[1].b);
  };
  function spawn(b, i, first) {
    b.size = r(6.5, 9);
    b.z = first ? r(-70, -720) : r(-110, -720);
    if (b.z > -140 && r() < 0.6) b.z -= 220; // only a few in the near lane
    b.x = first ? r(-430, 430) : r(-520, -450);
    b.low = i % 6 === 0; // one in six stays low over the near plain, its shadow sliding over the rock in view
    if (b.low) { b.z = r(-280, -470); if (first) b.x = r(-100, 300); }
    const floor = ground(b.x, b.z) + 3.2 * b.size + 4;
    b.y = b.low ? floor + r(2, 22) : Math.max(floor, r(20, 175)); b.targetY = b.y; b.vy = 0;
    b.dx = r(-0.15, 0.15); b.dz = r(-0.1, 0.1);
    b.burn = 0; b.burnLen = 0; b.burnT = r(1, 9); b.retarget = r(6, 30);
    b.accent = r() < 0.3;
    b.scheme = SCHEMES[(r() * SCHEMES.length) | 0].map((c) => new THREE.Color(c));
    b.white = new THREE.Color(r() < 0.5 ? "#ffffff" : "#f6efe0");
    b.pattern = (r() * 5) | 0;
    paint(b, i);
    aInfo.setXYZW(i, b.pattern, r(), 0, 0);
    fSize[i] = b.size * 0.6;
  }
  for (let i = 0; i < NB; i++) { const b = {}; spawn(b, i, true); B.push(b); }
  aColA.needsUpdate = aColB.needsUpdate = aInfo.needsUpdate = true;
  function stepBalloons(dt) {
    for (let i = 0; i < NB; i++) {
      const b = B[i];
      if ((b.retarget -= dt) <= 0) { const floor = ground(b.x, b.z) + 3.2 * b.size + 5; b.targetY = b.low ? floor + r(2, 26) : Math.min(190, Math.max(floor, b.y + r(-45, 55))); b.retarget = r(12, 35); }
      const want = Math.max(-1.2, Math.min(1.4, (b.targetY - b.y) * 0.08));
      b.vy += (want - b.vy) * Math.min(1, dt * 0.4);
      if (b.burnLen > 0) { b.burnLen -= dt; b.burn += (1 - b.burn) * Math.min(1, dt * 8); }
      else {
        b.burn += (0 - b.burn) * Math.min(1, dt * 3);
        b.burnT -= dt * (want > 0.25 ? 1 : 0.3); // climbing takes long burns; level flight the odd short one
        if (b.burnT <= 0) { b.burnLen = want > 0.25 ? r(1.5, 4) : r(0.5, 1.4); b.burnT = (want > 0.25 ? r(3, 10) : r(8, 25)) * (pal.dark ? 0.4 : 1); } // a night glow: burners far busier
      }
      b.x += (0.9 + 0.003 * b.y + b.dx) * dt; b.z += (0.32 + b.dz) * dt; b.y += b.vy * dt;
      if (b.x > 480 || b.z > -40) spawn(b, i, false);
      envelopes.setMatrixAt(i, M4.compose(V.set(b.x, b.y, b.z), Q.identity(), S3.setScalar(b.size)));
      baskets.setMatrixAt(i, M4);
      aInfo.setZ(i, b.burn);
      fPos[i * 3] = b.x; fPos[i * 3 + 1] = b.y - 0.3 * b.size; fPos[i * 3 + 2] = b.z; fBurn[i] = b.burn;
    }
    envelopes.instanceMatrix.needsUpdate = baskets.instanceMatrix.needsUpdate = aInfo.needsUpdate = true;
    flameGeo.attributes.position.needsUpdate = flameGeo.attributes.aBurn.needsUpdate = true;
  }

  // real shadows are switched on from the first draw (the renderer is only reachable there) and a second frame follows at once:
  // it renders the shadow maps, and the materials are rebuilt to read them. A still frame is drawn only once, so it needs that too.
  let shadowsOn = false, gone = false;
  sky.onBeforeRender = (renderer) => {
    if (preview || shadowsOn) return;
    shadowsOn = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap; renderer.shadowMap.enabled = true;
    setTimeout(() => { if (gone) return; rockMat.needsUpdate = groundMat.needsUpdate = houseMat.needsUpdate = basketMat.needsUpdate = true; renderer.render(scene, camera); }, 0);
  };

  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    accent.set(p.accent);
    B.forEach((b, i) => { if (b.accent) paint(b, i); });
    aColA.needsUpdate = aColB.needsUpdate = true;
    skyUni.uZenith.value.set(d ? "#040816" : "#3e6cb4"); skyUni.uMid.value.set(d ? "#0b1530" : "#d8a190"); skyUni.uHorizon.value.set(d ? "#1b2748" : "#ffd6a6");
    skyUni.uGlow.value.set(d ? "#2a2c48" : "#ff9f60").multiplyScalar(0.5); skyUni.uSun.value = d ? 0 : 1;
    stars.visible = moon.visible = halo.visible = d;
    cloudMat.color.set(d ? "#141c36" : "#ffc9a0"); cloudMat.opacity = d ? 0.5 : 0.85;
    const L = d ? MOON : SUN;
    sun.color.set(d ? "#95a6d6" : "#ffd9a8"); sun.intensity = d ? 0.7 : 2.4; sun.position.copy(sun.target.position).addScaledVector(L, 900);
    hemi.color.set(d ? "#26304f" : "#b9c8e6"); hemi.groundColor.set(d ? "#0c0a0a" : "#a07a5c"); hemi.intensity = d ? 0.85 : 1.0;
    scene.fog.color.set(d ? "#0f1730" : "#f6d3b0"); scene.fog.near = d ? 200 : 250; scene.fog.far = d ? 1200 : 1500;
    envUni.uFog.value.copy(scene.fog.color); envUni.uFogNear.value = scene.fog.near; envUni.uFogFar.value = scene.fog.far;
    envUni.uSunDir.value.copy(L); envUni.uSunCol.value.set(d ? "#8090c0" : "#ffdcae").multiplyScalar(d ? 0.6 : 1.1);
    envUni.uSkyCol.value.set(d ? "#2a3560" : "#a8bde6").multiplyScalar(d ? 0.8 : 0.9); envUni.uGroundCol.value.set(d ? "#0a0a10" : "#8a6a52").multiplyScalar(0.8);
    envUni.uBurnGain.value = d ? 2.8 : 0.35;
    flameUni.uGain.value = d ? 1.6 : 0.9;
    rockMat.color.set(d ? "#8d97b8" : "#ffffff"); groundMat.color.copy(rockMat.color); houseMat.color.set(d ? "#8a90a8" : "#e8dcc8"); basketMat.color.set(d ? "#7a80a0" : "#ffffff");
    lamps.visible = d;
    hazeMat.color.set(d ? "#1e2846" : "#ffd9b0"); hazeMat.opacity = d ? 0.3 : 0.38;
  }
  applyPalette(pal);

  const eyeY = ground(0, 0) + 2.2, look = new THREE.Vector3();
  function frame(dt, t) {
    time.value = t;
    const A = camera.aspect || 1, fov = A >= 1 ? 55 : 55 + (1 - A) * 24;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const cx = Math.sin(t * 0.03) * 1.5;
    camera.position.set(cx, eyeY + Math.sin(t * 0.07) * 0.15, 0);
    camera.lookAt(look.set(cx * 0.5, eyeY - 11, -150));
    for (const c of clouds) { c.x += c.speed * dt; if (c.x > 2400) c.x = -2400; c.m.position.set(c.x, c.y, c.z); c.m.scale.set(c.w, c.h, 1); }
    stepBalloons(dt);
  }
  for (let k = 0; k < 40; k++) stepBalloons(0.5); // a spread of burners already going on the first frame
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { let burning = 0, lo = 1e9, hi = 0; for (const b of B) { if (b.burn > 0.5) burning++; lo = Math.min(lo, b.y); hi = Math.max(hi, b.y); } return { balloons: NB, burning, lowest: Math.round(lo), highest: Math.round(hi), shadows: shadowsOn }; }, // for checking by hand
    dispose() { gone = true; scene.fog = null; disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Coral reef: on the sand of a sunlit reef; rays and caustics, corals swaying, a turtle passing, a school of fish round the pointer ---------- */
// the caustic pattern: where two ridged noises cross, the light the surface focuses on to whatever is below
const REEF_CAUST = /* glsl */ `
  uniform sampler2D uNoise; uniform float uTime;
  float reefCaust(vec2 p) {
    float a = texture2D(uNoise, p * 0.06 + vec2(uTime * 0.018, uTime * 0.011)).r;
    float b = texture2D(uNoise, p * 0.09 - vec2(uTime * 0.014, -uTime * 0.02)).g;
    float rr = (1.0 - abs(2.0 * a - 1.0)) * (1.0 - abs(2.0 * b - 1.0));
    return pow(rr, 1.6) * 2.5 + pow(rr, 6.0) * 6.0;
  }
`;
// the water all round: deep blue below, brighter towards the surface, the sky in Snell's window overhead, the sun above it
const REEF_WATER_FS = /* glsl */ `
  ${REEF_CAUST}
  uniform vec3 uDeep; uniform vec3 uMid; uniform vec3 uUp; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uWindow;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vDir);
    vec3 col = mix(uDeep, uMid, smoothstep(-0.35, 0.12, d.y));
    col = mix(col, uUp, smoothstep(0.08, 0.75, d.y));
    vec2 sp = d.xz / max(d.y, 0.06) * 6.0;
    float rip = texture2D(uNoise, sp * 0.04 + uTime * 0.01).r;
    float win = smoothstep(0.22, 0.6, d.y + (rip - 0.5) * 0.35);
    float crest = smoothstep(0.55, 0.72, texture2D(uNoise, sp * 0.09 - vec2(uTime * 0.02, uTime * 0.013)).g); // the surface's waves seen from below
    col += uUp * win * uWindow * (0.28 + 0.05 * reefCaust(sp) + 0.25 * crest);
    float sd = distance(d, uSunDir);
    col += uSunCol * (0.7 * exp(-sd * 9.0) + 0.18 * exp(-sd * 2.2)) * smoothstep(0.0, 0.3, d.y);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// the rays: marched from the eye; each sample is lit by the caustic at the surface point its light came through, fading with depth
const REEF_RAY_FS = /* glsl */ `
  ${REEF_CAUST}
  uniform vec3 uSunDir; uniform vec3 uColor; uniform float uSurf; uniform float uFloorY; uniform float uAbsorb;
  varying vec3 vWorld;
  void main() {
    vec3 ro = cameraPosition, rd = normalize(vWorld - cameraPosition);
    float t1 = REEF_RANGE;
    if (rd.y < 0.0) t1 = min(t1, (uFloorY - ro.y) / rd.y);
    if (rd.y > 0.0) t1 = min(t1, (uSurf - ro.y) / rd.y);
    float j = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
    float dt = t1 / float(REEF_STEPS), sum = 0.0;
    for (int i = 0; i < REEF_STEPS; i++) {
      float t = dt * (float(i) + j);
      vec3 x = ro + rd * t;
      vec2 s = x.xz + uSunDir.xz * (uSurf - x.y) / uSunDir.y;
      sum += max(reefCaust(s * 0.5) - 0.8, 0.0) * exp(-(uSurf - x.y) * uAbsorb) * exp(-t * 0.03);
    }
    float toward = 1.0 + 1.5 * pow(max(dot(rd, uSunDir), 0.0), 4.0);
    gl_FragColor = vec4(uColor * (sum * dt / REEF_RANGE) * toward, 1.0); // the average along the ray, so the gain is in plain units
  }
`;
const REEF_FLOOR_VS = /* glsl */ `
  varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vTint;
  void main() { vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vTint = color; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const REEF_FLOOR_FS = /* glsl */ `
  ${REEF_CAUST}
  uniform sampler2D uMap; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform float uCaustic; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  varying vec3 vWorld; varying vec3 vN; varying vec2 vUv; varying vec3 vTint;
  void main() {
    vec2 e = vec2(0.012, 0.0);
    float h0 = texture2D(uMap, vUv).g, hx = texture2D(uMap, vUv + e.xy).g, hz = texture2D(uMap, vUv + e.yx).g;
    vec3 N = normalize(vN + vec3(h0 - hx, 0.0, h0 - hz) * 2.5); // the ripples catch the light
    vec3 sand = texture2D(uMap, vUv).rgb * vTint * (0.9 + 0.2 * texture2D(uNoise, vWorld.xz * 0.05).r);
    vec3 col = sand * (uAmb + uSunCol * (max(dot(N, uSunDir), 0.0) * 0.8 + reefCaust(vWorld.xz) * uCaustic));
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, distance(vWorld, cameraPosition)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// corals, fans and weed: one shader for every kind; aSway says how far each vertex follows the surge (0 at the base)
const REEF_CORAL_VS = /* glsl */ `
  uniform float uTime;
  attribute float aSway;
  varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying float vSway; varying float vLocalY;
  void main() {
    vec3 p = position;
    vec2 at = instanceMatrix[3].xz;
    float ph = at.x * 0.7 + at.y * 0.9;
    float s = aSway * (0.12 * sin(uTime * 1.1 + ph) + 0.05 * sin(uTime * 2.3 + ph * 1.7));
    p.x += s; p.z += s * 0.6;
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vWorld = w.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3(1.0);
    #endif
    vUv = uv; vSway = aSway; vLocalY = position.y;
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const REEF_CORAL_FS = /* glsl */ `
  ${REEF_CAUST}
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uAmbDown; uniform float uCaustic; uniform float uGlow;
  uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  uniform float uKind; // 0 staghorn, 1 boulder, 2 table, 3 fan, 4 anemone, 5 grass
  #ifdef REEF_MAP
    uniform sampler2D uMap;
  #endif
  varying vec3 vWorld; varying vec3 vN; varying vec3 vCol; varying vec2 vUv; varying float vSway; varying float vLocalY;
  void main() {
    vec3 base = vCol;
    #ifdef REEF_MAP
      vec4 t = texture2D(uMap, vUv);
      if (t.a < 0.5) discard;
      base *= t.rgb;
    #endif
    vec3 P = vWorld;
    float d1 = texture2D(uNoise, P.xz * 1.7 + P.y * 0.9).r, d2 = texture2D(uNoise, (P.xy + P.zx) * 4.5).g;
    float polyp = smoothstep(0.64, 0.74, d2); // the little polyps, lighter dots all over the skeleton
    base *= (0.78 + 0.44 * d1) * (1.0 + 0.3 * polyp);
    if (uKind < 0.5) base = mix(base, vec3(0.86, 0.9, 1.0), 0.55 * smoothstep(0.5, 1.0, vLocalY)); // staghorn tips go pale
    if (uKind > 0.5 && uKind < 1.5) base *= 1.0 - 0.5 * (1.0 - smoothstep(0.03, 0.14, abs(2.0 * texture2D(uNoise, P.xz * 2.2 + P.y * 1.4).r - 1.0))); // the brain's grooves
    if (uKind > 3.5 && uKind < 4.5) base = mix(base, vec3(0.75, 0.95, 0.72), 0.45 * smoothstep(0.7, 1.0, vLocalY)); // anemone tentacles tip green
    float ao = mix(0.5, 1.0, smoothstep(0.0, 0.38, vLocalY)); // shadowed where it meets the sand
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 V = normalize(cameraPosition - P);
    bool thin = uKind > 2.5 && uKind != 4.0;
    float diff = thin ? abs(dot(N, uSunDir)) * 0.8 + 0.2 : max(dot(N, uSunDir), 0.0);
    float rim = pow(1.0 - max(dot(N, V), 0.0), 3.0);
    float spec = (uKind < 2.5) ? pow(max(dot(reflect(-uSunDir, N), V), 0.0), 18.0) * 0.22 : 0.0; // the wet sheen of a hard coral
    vec3 col = base * ao * (mix(uAmbDown, uAmb, N.y * 0.5 + 0.5) * (1.0 + 0.7 * rim) + uSunCol * (diff * 0.9 + reefCaust(P.xz) * uCaustic * max(N.y, 0.0))) + uSunCol * spec;
    col += base * base * uGlow; // fluorescence at night
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, distance(P, cameraPosition)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// painted soft corals and sponges: upright billboards from a 2 × 2 atlas, the base on the sand, swaying from the base up
const REEF_SPRITE_VS = /* glsl */ `
  uniform float uTime;
  attribute vec4 aSprite; // size, atlas cell, sway phase, spare
  varying vec2 vUv; varying vec3 vWorld; varying vec3 vCol; varying float vLocalY;
  void main() {
    vec4 root = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
    vec4 c = viewMatrix * root;
    float sway = (0.05 * sin(uTime * 1.0 + aSprite.z) + 0.025 * sin(uTime * 2.2 + aSprite.z * 1.3)) * position.y;
    c.xy += vec2((position.x + sway) * aSprite.x, position.y * aSprite.x * 1.15);
    gl_Position = projectionMatrix * c;
    vUv = (uv + vec2(mod(aSprite.y, 2.0), 1.0 - floor(aSprite.y / 2.0))) * 0.5;
    vWorld = root.xyz;
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3(1.0);
    #endif
    vLocalY = position.y;
  }
`;
const REEF_SPRITE_FS = /* glsl */ `
  ${REEF_CAUST}
  uniform sampler2D uMap; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uAmbDown; uniform float uCaustic; uniform float uGlow;
  uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  varying vec2 vUv; varying vec3 vWorld; varying vec3 vCol; varying float vLocalY;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.5) discard;
    vec3 base = t.rgb * vCol;
    float ao = mix(0.55, 1.0, smoothstep(0.0, 0.3, vLocalY));
    vec3 col = base * ao * (mix(uAmbDown, uAmb, 0.5 + 0.5 * vLocalY) + uSunCol * (0.55 + reefCaust(vWorld.xz + vLocalY * 0.7) * uCaustic * 0.8));
    col += base * base * uGlow;
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, distance(vWorld, cameraPosition)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// the fish: a tail that beats faster the faster it swims, silver bellies
const REEF_FISH_VS = /* glsl */ `
  uniform float uTime;
  attribute vec2 aFish; // phase, beat
  varying vec3 vN; varying vec3 vCol; varying vec3 vWorld; varying float vBelly;
  void main() {
    vec3 p = position;
    p.x += sin(uTime * 9.0 * aFish.y + aFish.x - p.z * 5.0) * 0.14 * smoothstep(0.25, -0.55, p.z);
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vWorld = w.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3(1.0);
    #endif
    vBelly = smoothstep(0.1, -0.3, position.y);
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const REEF_FISH_FS = /* glsl */ `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uAmbDown; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  varying vec3 vN; varying vec3 vCol; varying vec3 vWorld; varying float vBelly;
  void main() {
    vec3 N = normalize(vN);
    if (!gl_FrontFacing) N = -N;
    vec3 base = mix(vCol, vec3(0.92, 0.94, 0.96), vBelly * 0.7);
    vec3 V = normalize(cameraPosition - vWorld);
    vec3 col = base * (mix(uAmbDown, uAmb, N.y * 0.5 + 0.5) + uSunCol * max(dot(N, uSunDir), 0.0)) + uSunCol * pow(max(dot(reflect(-uSunDir, N), V), 0.0), 24.0) * 0.5; // scales catch the light
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, distance(vWorld, cameraPosition)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// plankton that lights up in a fish's wake at night: a ring buffer of sparks, each born at a time and fading out
const REEF_SPARK_VS = /* glsl */ `
  uniform float uTime; uniform float uPx;
  attribute float aBorn; attribute float aSize;
  varying float vA;
  void main() {
    float age = uTime - aBorn;
    vA = aBorn < 0.0 ? 0.0 : smoothstep(0.0, 0.1, age) * (1.0 - smoothstep(0.6, 1.6, age));
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = vA > 0.001 ? clamp(aSize * (1.0 + age) * uPx / -mv.z, 1.0, 24.0) : 0.0;
  }
`;
const REEF_SPARK_FS = /* glsl */ `
  uniform vec3 uColor;
  varying float vA;
  void main() { vec2 p = gl_PointCoord * 2.0 - 1.0; float r2 = dot(p, p); if (r2 > 1.0) discard; gl_FragColor = vec4(uColor * (1.0 - r2) * (1.0 - r2) * vA, 1.0); }
`;
const REEF_BOMMIES = [[-9, -14, 4.5, 2.6], [10, -18, 5.5, 3.2], [-3, -28, 6, 3.6], [16, -9, 3.5, 1.8], [-16, -22, 4, 2.2], [4, -40, 8, 4.5]]; // x, z, radius, height
/** The sea floor: rippled sand with a few rocky mounds (bommies) that the corals grow on. */
function reefFloorHeight(x, z) {
  let h = 0.5 * lhNoise3(x * 0.06 + 3, 0, z * 0.06) + 0.22 * lhNoise3(x * 0.2, 1, z * 0.2 + 5);
  for (const [bx, bz, rad, bh] of REEF_BOMMIES) h += bh * Math.exp(-(((x - bx) ** 2 + (z - bz) ** 2) / (rad * rad)) * 1.6) * (0.85 + 0.3 * lhNoise3(x * 0.5, 2, z * 0.5));
  return h;
}
function reefRockiness(x, z) { let k = 0; for (const [bx, bz, rad] of REEF_BOMMIES) k += Math.exp(-(((x - bx) ** 2 + (z - bz) ** 2) / (rad * rad)) * 1.6); return Math.min(1, k * 1.4); }
/** Sand: pale, rippled by the surge, speckled; tiles. */
function reefSand(THREE, S) {
  const r = koiRng(808), k = S / 512;
  const tex = canvasTexture(THREE, S, S, (g) => {
    g.fillStyle = "#d9c9a4"; g.fillRect(0, 0, S, S);
    for (let i = 0; i < 24; i++) { // ripples: soft bands across, wandering a little (periodic in S so the tile joins)
      g.strokeStyle = `rgba(150,125,90,${r(0.07, 0.16)})`; g.lineWidth = r(6, 14) * k; g.beginPath();
      const y0 = (i / 24) * S;
      for (let x = 0; x <= S; x += 8) g.lineTo(x, y0 + Math.sin((x / S) * Math.PI * 4 + i) * 9 * k);
      g.stroke();
    }
    for (let i = 0; i < S * 5; i++) { g.fillStyle = `rgba(${r() < 0.45 ? "110,85,60" : "255,250,235"},${r(0.05, 0.14)})`; g.fillRect(r(0, S), r(0, S), r(1, 2.5) * k, r(1, 2.5) * k); }
    for (let i = 0; i < 30; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "230,190,180" : "250,246,236"},0.8)`; g.beginPath(); g.ellipse(r(0, S), r(0, S), r(2, 4) * k, r(1.5, 3) * k, r(0, 3), 0, Math.PI * 2); g.fill(); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 4;
  return tex;
}
/** A sea fan: a lattice of branches spreading up from the base, white on transparent (the instance colour tints it). */
function reefFanTex(THREE, S) {
  const r = koiRng(4040);
  return canvasTexture(THREE, S, S, (g) => {
    g.strokeStyle = "#ffffff"; g.lineCap = "round";
    const limb = (x, y, a, len, w, depth) => {
      const steps = 5;
      let px = x, py = y;
      for (let i = 1; i <= steps; i++) {
        a += r(-0.22, 0.22);
        const nx = px + Math.cos(a) * (len / steps), ny = py - Math.sin(a) * (len / steps);
        g.lineWidth = w * (1 - (0.5 * i) / steps); g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
        if (depth < 4 && i > 1 && r() < 0.7) limb(nx, ny, a + (r() < 0.5 ? -1 : 1) * r(0.35, 0.8), len * r(0.4, 0.62), w * 0.6, depth + 1);
        px = nx; py = ny;
      }
    };
    g.fillStyle = "rgba(255,255,255,0.42)"; g.beginPath(); g.moveTo(S * 0.5, S * 0.98); // the mesh between the branches, a translucent fan shape
    for (let i = 0; i <= 24; i++) { const a = Math.PI + (i / 24) * Math.PI, rad = S * (0.72 + 0.1 * Math.sin(i * 1.7)); g.lineTo(S * 0.5 + Math.cos(a) * rad * 0.62, S * 0.98 + Math.sin(a) * rad); }
    g.closePath(); g.fill();
    for (let k = 0; k < 9; k++) limb(S * 0.5, S * 0.98, Math.PI / 2 + (k - 4) * 0.27 + r(-0.08, 0.08), S * r(0.55, 0.85), 13 * (S / 512), 0);
    g.lineWidth = 3.2 * (S / 512); g.strokeStyle = "rgba(255,255,255,0.85)";
    for (let i = 0; i < 2600; i++) { const x = r(S * 0.05, S * 0.95), y = r(S * 0.1, S * 0.94), a = r(0, 6.28), l = r(5, 16) * (S / 512); if (Math.hypot((x - S / 2) / 0.62, y - S) > S * 0.78) continue; g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
  });
}
/** A turtle's shell: olive scutes with dark seams. */
function reefScutes(THREE) {
  return canvasTexture(THREE, 256, 256, (g) => {
    g.fillStyle = "#7a8a4c"; g.fillRect(0, 0, 256, 256);
    const rr = koiRng(66);
    for (let row = 0; row < 6; row++) for (let col = 0; col < 6; col++) {
      const cx = col * 44 + (row % 2 ? 22 : 0), cy = row * 40 + 20, rad = 22;
      g.fillStyle = `hsl(${78 + rr(-8, 8)}, ${rr(30, 42)}%, ${rr(38, 50)}%)`; g.beginPath();
      for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2 + 0.52; g.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad); }
      g.closePath(); g.fill(); g.strokeStyle = "#2f3a22"; g.lineWidth = 3; g.stroke();
    }
  });
}
/** A bubble: a thin ring with a highlight, on transparent. */
function reefRing(THREE) {
  return canvasTexture(THREE, 64, 64, (g) => {
    g.strokeStyle = "rgba(255,255,255,0.9)"; g.lineWidth = 3; g.beginPath(); g.arc(32, 32, 26, 0, Math.PI * 2); g.stroke();
    g.fillStyle = "rgba(255,255,255,0.35)"; g.beginPath(); g.arc(32, 32, 24, 0, Math.PI * 2); g.fill();
    g.fillStyle = "rgba(255,255,255,0.95)"; g.beginPath(); g.ellipse(22, 20, 6, 4, -0.6, 0, Math.PI * 2); g.fill();
  });
}
/** A second atlas of painted things: an anemone, a tuft of sea grass, a lettuce coral, a finger coral. */
function reefSoftAtlas2(THREE, S) {
  const r = koiRng(7171), cell = S / 2, k = S / 1024;
  return canvasTexture(THREE, S, S, (g) => {
    const cellAt = (i, draw) => { g.save(); g.translate((i % 2) * cell, Math.floor(i / 2) * cell); g.beginPath(); g.rect(0, 0, cell, cell); g.clip(); draw(cell); g.restore(); };
    const taper = (x0, y0, x1, y1, cx, cy, w0, w1, col0, col1, steps = 9) => { // a stroke narrowing from w0 to w1 along a curve, shading from col0 to col1
      let px = x0, py = y0;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps, u = 1 - t, x = u * u * x0 + 2 * u * t * cx + t * t * x1, y = u * u * y0 + 2 * u * t * cy + t * t * y1;
        g.strokeStyle = t < 0.5 ? col0 : col1; g.lineWidth = w0 + (w1 - w0) * t; g.lineCap = "round"; g.beginPath(); g.moveTo(px, py); g.lineTo(x, y); g.stroke();
        px = x; py = y;
      }
    };
    cellAt(0, (c) => { // an anemone: a column and a crown of tentacles, pink with pale tips
      const gr = g.createLinearGradient(c * 0.3, 0, c * 0.7, 0); gr.addColorStop(0, "#8a5a58"); gr.addColorStop(0.5, "#c88a86"); gr.addColorStop(1, "#7a4c4a");
      g.fillStyle = gr; g.beginPath(); g.moveTo(c * 0.3, c * 0.98); g.quadraticCurveTo(c * 0.28, c * 0.74, c * 0.5, c * 0.72); g.quadraticCurveTo(c * 0.72, c * 0.74, c * 0.7, c * 0.98); g.closePath(); g.fill();
      const tents = [];
      for (let i = 0; i < 130; i++) { const u = r(-1, 1), y0 = c * (0.72 + 0.03 * u * u), x0 = c * (0.5 + u * 0.2), len = c * r(0.2, 0.4), a = -Math.PI / 2 + u * 1.25 + r(-0.3, 0.3); tents.push([x0, y0, x0 + Math.cos(a) * len, y0 + Math.sin(a) * len, u]); }
      tents.sort((p, q) => Math.abs(q[4]) - Math.abs(p[4])); // the outer ones first, the middle ones over them
      for (const [x0, y0, x1, y1] of tents) { taper(x0, y0, x1, y1, (x0 + x1) / 2 + r(-8, 8) * k, (y0 + y1) / 2 - 10 * k, 13 * k, 4 * k, "#d98a9e", "#f7d3dc"); g.fillStyle = "#fff0f3"; g.beginPath(); g.arc(x1, y1, 3.2 * k, 0, Math.PI * 2); g.fill(); }
    });
    cellAt(1, (c) => { // sea grass: a tuft of blades bending in the surge
      for (let i = 0; i < 11; i++) {
        const u = r(-1, 1), x1 = c * (0.5 + u * 0.42), y1 = c * r(0.08, 0.42), lean = r(-0.15, 0.15);
        taper(c * (0.5 + u * 0.06), c * 0.98, x1, y1, c * (0.5 + u * 0.3 + lean), c * 0.6, 13 * k, 2 * k, ["#3f7a45", "#4d8c4e", "#356e4a"][(r() * 3) | 0], ["#7fc46a", "#98d07c", "#6ab86a"][(r() * 3) | 0], 11);
      }
    });
    cellAt(2, (c) => { // a lettuce coral: ruffled plates stacked up, lighter along their rims
      for (let layer = 0; layer < 7; layer++) {
        const y = c * (0.96 - layer * 0.11), w = c * (0.44 - layer * 0.04), hue = 30 + layer * 3;
        g.fillStyle = `hsl(${hue}, 55%, ${34 + layer * 4}%)`; g.beginPath(); g.moveTo(c * 0.5 - w, y);
        for (let x = -w; x <= w; x += w / 8) g.lineTo(c * 0.5 + x, y - c * 0.07 - Math.sin(x / w * Math.PI * 4 + layer) * c * 0.025);
        g.lineTo(c * 0.5 + w, y); g.closePath(); g.fill();
        g.strokeStyle = `hsl(${hue}, 60%, ${62 + layer * 3}%)`; g.lineWidth = 3 * k; g.beginPath();
        for (let x = -w; x <= w; x += w / 16) g.lineTo(c * 0.5 + x, y - c * 0.07 - Math.sin(x / w * Math.PI * 4 + layer) * c * 0.025);
        g.stroke();
      }
    });
    cellAt(3, (c) => { // a finger coral: fat yellow fingers with polyp dots
      const fingers = [[0.5, 0.1, 0.09], [0.32, 0.22, 0.08], [0.68, 0.2, 0.085], [0.41, 0.36, 0.07], [0.6, 0.38, 0.075], [0.22, 0.42, 0.065], [0.78, 0.44, 0.065]];
      for (const [x, top, w] of fingers) {
        const cx = x * c, ty = top * c, ww = w * c;
        const gr = g.createLinearGradient(cx - ww, 0, cx + ww, 0); gr.addColorStop(0, "#9a6a1e"); gr.addColorStop(0.4, "#e8b84a"); gr.addColorStop(1, "#8a5c1a");
        g.fillStyle = gr; g.beginPath(); g.moveTo(cx - ww, c * 0.98); g.lineTo(cx - ww, ty + ww); g.arc(cx, ty + ww, ww, Math.PI, 0); g.lineTo(cx + ww, c * 0.98); g.closePath(); g.fill();
        g.fillStyle = "rgba(255,240,190,0.75)";
        for (let i = 0; i < 40; i++) { const yy = r(ty + ww * 0.3, c * 0.96), xx = cx + r(-0.85, 0.85) * ww; g.beginPath(); g.arc(xx, yy, r(1.2, 2.4) * k, 0, Math.PI * 2); g.fill(); }
      }
    });
  });
}
/** Give a geometry its sway weights from a rule on each vertex's position. */
function reefSway(THREE, geo, fn) {
  const p = geo.attributes.position, a = new Float32Array(p.count);
  for (let i = 0; i < p.count; i++) a[i] = fn(p.getX(i), p.getY(i), p.getZ(i));
  geo.setAttribute("aSway", new THREE.BufferAttribute(a, 1));
  return geo;
}
const reefAt = (THREE, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), new THREE.Vector3(sx, sy, sz));
/** Staghorn coral: a stem forking into branches that fork again, base at y = 0, about 1 unit tall. */
function reefStaghorn(THREE, r) {
  const parts = [], up = new THREE.Vector3(0, 1, 0);
  const branch = (from, dir, len, rad, depth) => {
    const to = from.clone().addScaledVector(dir, len), mid = from.clone().add(to).multiplyScalar(0.5);
    parts.push([new THREE.CylinderGeometry(rad * 0.6, rad, len, 8), new THREE.Matrix4().compose(mid, new THREE.Quaternion().setFromUnitVectors(up, dir), new THREE.Vector3(1, 1, 1))]);
    if (depth >= 3) return;
    for (let k = 0; k < (depth === 0 ? 4 : 2); k++) {
      const d = dir.clone().add(new THREE.Vector3(r(-0.8, 0.8), r(0.3, 0.9), r(-0.8, 0.8))).normalize();
      branch(to, d, len * r(0.55, 0.8), rad * 0.65, depth + 1);
    }
  };
  branch(new THREE.Vector3(0, 0, 0), up, 0.32, 0.075, 0);
  return reefSway(THREE, mergeParts(THREE, parts), (x, y) => Math.max(0, y) * 0.2);
}
/** A boulder or brain coral: a lumpy, squashed ball half sunk in the sand. */
function reefBoulder(THREE, seed) {
  const g = new THREE.SphereGeometry(1, 26, 16), p = g.attributes.position; // indexed, so the normals stay smooth (an icosahedron shows every facet)
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), s = 0.86 + 0.28 * lhNoise3(x * 2 + seed, y * 2, z * 2 + seed); p.setXYZ(i, x * s, y * s * 0.7 + 0.35, z * s); }
  g.computeVertexNormals();
  return reefSway(THREE, g, () => 0);
}
/** Painted soft corals and sponges in a 2 × 2 atlas: a cauliflower soft coral, tube sponges, a brain coral, a red gorgonian; the base at the bottom middle of each cell. */
function reefSoftAtlas(THREE, S) {
  const r = koiRng(9090), cell = S / 2;
  return canvasTexture(THREE, S, S, (g) => {
    const blob = (x, y, rad, hi, lo, a = 1) => { const gr = g.createRadialGradient(x - rad * 0.3, y - rad * 0.35, rad * 0.1, x, y, rad); gr.addColorStop(0, hi); gr.addColorStop(1, lo); g.globalAlpha = a; g.fillStyle = gr; g.beginPath(); g.arc(x, y, rad, 0, Math.PI * 2); g.fill(); g.globalAlpha = 1; };
    const cellAt = (i, draw) => { g.save(); g.translate((i % 2) * cell, Math.floor(i / 2) * cell); g.beginPath(); g.rect(0, 0, cell, cell); g.clip(); draw(cell); g.restore(); };
    cellAt(0, (c) => { // a cauliflower soft coral: a short stalk and a head of lobes, cream to pink
      g.fillStyle = "#d9b7a0"; g.fillRect(c * 0.44, c * 0.62, c * 0.12, c * 0.38);
      const lobes = [];
      for (let i = 0; i < 90; i++) { const a = r(0, 6.28), d = Math.sqrt(r()) * c * 0.3; lobes.push([c * 0.5 + Math.cos(a) * d * 1.15, c * 0.44 + Math.sin(a) * d * 0.85, r(0.045, 0.085) * c]); }
      lobes.sort((p, q) => q[1] - p[1]);
      for (const [x, y, rad] of lobes) blob(x, y, rad, ["#ffe9dc", "#ffd9d0", "#ffe4c8"][(r() * 3) | 0], ["#d98c8c", "#c97f92", "#d9a07f"][(r() * 3) | 0]);
      g.fillStyle = "rgba(255,255,255,0.7)";
      for (let i = 0; i < 260; i++) { const a = r(0, 6.28), d = Math.sqrt(r()) * c * 0.3; g.beginPath(); g.arc(c * 0.5 + Math.cos(a) * d * 1.15, c * 0.44 + Math.sin(a) * d * 0.85, r(1, 2.2) * (S / 1024), 0, Math.PI * 2); g.fill(); }
    });
    cellAt(1, (c) => { // tube sponges: a cluster of tubes leaning apart, a dark mouth in each
      const tubes = [[0.5, 0.12, 0.09, 0], [0.34, 0.26, 0.075, -0.18], [0.66, 0.24, 0.08, 0.16], [0.42, 0.4, 0.06, -0.08], [0.6, 0.42, 0.065, 0.1]];
      for (const [x, top, w, lean] of tubes) {
        const cx = x * c, ty = top * c, ww = w * c, bx = c * 0.5 + (cx - c * 0.5) * 0.35;
        const gr = g.createLinearGradient(cx - ww, 0, cx + ww, 0); gr.addColorStop(0, "#5a3d8a"); gr.addColorStop(0.45, "#a884d9"); gr.addColorStop(1, "#4a2f74");
        g.fillStyle = gr; g.beginPath(); g.moveTo(bx - ww * 0.8, c * 0.98); g.lineTo(cx - ww, ty); g.lineTo(cx + ww, ty); g.lineTo(bx + ww * 0.8, c * 0.98); g.closePath(); g.fill();
        g.fillStyle = "#2a1a44"; g.beginPath(); g.ellipse(cx, ty, ww, ww * 0.42, 0, 0, Math.PI * 2); g.fill();
        g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2 * (S / 1024); g.beginPath(); g.ellipse(cx, ty, ww, ww * 0.42, 0, Math.PI, Math.PI * 2); g.stroke();
        g.strokeStyle = "rgba(40,20,70,0.25)"; for (let k = 0; k < 6; k++) { const yy = ty + ((k + 1) / 7) * (c * 0.98 - ty); g.beginPath(); g.moveTo(cx - ww * (1 + 0.2 * k / 6), yy); g.lineTo(cx + ww * (1 + 0.2 * k / 6), yy); g.stroke(); }
      }
    });
    cellAt(2, (c) => { // a brain coral: a dome with winding grooves
      const gr = g.createRadialGradient(c * 0.4, c * 0.5, c * 0.05, c * 0.5, c * 0.65, c * 0.5); gr.addColorStop(0, "#d8c27a"); gr.addColorStop(1, "#8a7a3e");
      g.fillStyle = gr; g.beginPath(); g.ellipse(c * 0.5, c * 0.62, c * 0.46, c * 0.37, 0, 0, Math.PI * 2); g.fill();
      const sh = g.createLinearGradient(0, c * 0.7, 0, c * 0.99); sh.addColorStop(0, "rgba(40,30,10,0)"); sh.addColorStop(1, "rgba(40,30,10,0.55)");
      g.fillStyle = sh; g.beginPath(); g.ellipse(c * 0.5, c * 0.62, c * 0.46, c * 0.37, 0, 0, Math.PI * 2); g.fill(); // darker underneath
      g.strokeStyle = "rgba(70,55,20,0.6)"; g.lineWidth = 2.6 * (S / 1024); g.lineCap = "round";
      for (let i = 0; i < 26; i++) {
        let x = r(c * 0.1, c * 0.9), y = r(c * 0.38, c * 0.9), a = r(0, 6.28);
        g.beginPath(); g.moveTo(x, y);
        for (let k = 0; k < 14; k++) { a += r(-0.9, 0.9); x += Math.cos(a) * c * 0.03; y += Math.sin(a) * c * 0.018; if (Math.hypot((x - c * 0.5) / 0.46, (y - c * 0.62) / 0.37) > c * 0.94) break; g.lineTo(x, y); }
        g.stroke();
      }
      g.strokeStyle = "rgba(255,245,200,0.35)"; g.lineWidth = 2 * (S / 1024);
      for (let i = 0; i < 26; i++) { let x = r(c * 0.1, c * 0.9), y = r(c * 0.4, c * 0.9), a = r(0, 6.28); g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 10; k++) { a += r(-0.9, 0.9); x += Math.cos(a) * c * 0.03; y += Math.sin(a) * c * 0.018; g.lineTo(x, y); } g.stroke(); }
    });
    cellAt(3, (c) => { // a red gorgonian: knobbly branches spreading up from a stem
      const limb = (x, y, a, len, w, depth) => {
        const steps = 6;
        let px = x, py = y;
        for (let i = 1; i <= steps; i++) {
          a += r(-0.25, 0.25);
          const nx = px + Math.cos(a) * (len / steps), ny = py - Math.sin(a) * (len / steps);
          g.strokeStyle = "#b8362e"; g.lineCap = "round"; g.lineWidth = w * (1 - (0.45 * i) / steps); g.beginPath(); g.moveTo(px, py); g.lineTo(nx, ny); g.stroke();
          blob(nx, ny, w * 0.7, "#ff8f7a", "#9c2a22", 0.9);
          if (depth < 3 && i > 1 && r() < 0.6) limb(nx, ny, a + (r() < 0.5 ? -1 : 1) * r(0.4, 0.9), len * r(0.45, 0.65), w * 0.68, depth + 1);
          px = nx; py = ny;
        }
      };
      for (let k = 0; k < 3; k++) limb(c * 0.5, c * 0.98, Math.PI / 2 + (k - 1) * 0.45 + r(-0.1, 0.1), c * r(0.45, 0.6), 14 * (S / 1024), 0);
      g.fillStyle = "rgba(255,230,200,0.8)";
      for (let i = 0; i < 300; i++) { const x = r(c * 0.1, c * 0.9), y = r(c * 0.15, c * 0.95); const d = g.getImageData(x | 0, y | 0, 1, 1).data; if (d[3] > 100 && d[0] > 120) { g.beginPath(); g.arc(x, y, r(1, 2) * (S / 1024), 0, Math.PI * 2); g.fill(); } }
    });
  });
}
/** A table coral: a flat plate on a short stalk. */
function reefTable(THREE) {
  const plate = new THREE.CylinderGeometry(1.1, 0.9, 0.14, 14), p = plate.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), z = p.getZ(i), d = Math.hypot(x, z); if (d > 0.5) { const s = 1 + 0.12 * Math.sin(Math.atan2(z, x) * 5); p.setXYZ(i, x * s, p.getY(i), z * s); } }
  plate.computeVertexNormals();
  return reefSway(THREE, mergeParts(THREE, [[new THREE.CylinderGeometry(0.12, 0.2, 0.55, 8), reefAt(THREE, 0, 0.27, 0)], [plate, reefAt(THREE, 0, 0.6, 0)]]), () => 0);
}
/** A sea fan: a flat quad, base at y = 0, swaying more the higher up. */
function reefFan(THREE) {
  const g = new THREE.PlaneGeometry(1.1, 1.3, 1, 4);
  g.translate(0, 0.65, 0);
  return reefSway(THREE, g, (x, y) => Math.pow(y / 1.3, 1.2));
}
/** A tuft of sea grass: three blades at different angles. */
function reefGrass(THREE, r) {
  const parts = [];
  for (let k = 0; k < 3; k++) {
    const b = new THREE.PlaneGeometry(0.12, 1.6, 1, 6), bp = b.attributes.position;
    for (let i = 0; i < bp.count; i++) bp.setX(i, bp.getX(i) * (1 - 0.8 * (bp.getY(i) + 0.8) / 1.6)); // narrowing to the tip
    b.translate(0, 0.8, 0);
    parts.push([b, reefAt(THREE, r(-0.08, 0.08), 0, r(-0.08, 0.08), r(-0.12, 0.12), r(0, 6.28), r(-0.15, 0.15))]);
  }
  return reefSway(THREE, mergeParts(THREE, parts), (x, y) => Math.pow(Math.max(0, y) / 1.6, 1.5));
}
/** An anemone: a disc with a crown of tentacles leaning outwards. */
function reefAnemone(THREE, r) {
  const parts = [[new THREE.CylinderGeometry(0.34, 0.28, 0.16, 12), reefAt(THREE, 0, 0.08, 0)]];
  for (let k = 0; k < 18; k++) {
    const a = (k / 18) * Math.PI * 2 + r(-0.15, 0.15), lean = r(0.25, 0.75), rad = r(0.06, 0.28);
    parts.push([new THREE.CylinderGeometry(0.02, 0.045, 0.55, 5), reefAt(THREE, Math.cos(a) * rad, 0.16 + 0.24, Math.sin(a) * rad, Math.sin(a) * lean, 0, -Math.cos(a) * lean)]);
  }
  return reefSway(THREE, mergeParts(THREE, parts), (x, y) => Math.max(0, (y - 0.16) / 0.55));
}
/** A small fish, nose towards +z, about 1.2 units long. */
function reefFish(THREE) {
  const tri = (pts) => { const sh = new THREE.Shape(); pts.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y))); sh.closePath(); const g = new THREE.ShapeGeometry(sh); g.rotateY(-Math.PI / 2); return g; }; // drawn in (z, y), then stood along the body
  const tail = tri([[0, 0], [-0.36, 0.24], [-0.26, 0], [-0.36, -0.24]]), dorsal = tri([[0.15, 0], [-0.1, 0.2], [-0.25, 0]]), belly = tri([[0.05, 0], [-0.08, -0.14], [-0.2, 0]]);
  return mergeParts(THREE, [[new THREE.SphereGeometry(1, 10, 7), reefAt(THREE, 0, 0, 0, 0, 0, 0, 0.11, 0.3, 0.56)], [tail, reefAt(THREE, 0, 0, -0.5)], [dorsal, reefAt(THREE, 0, 0.28, 0.05)], [belly, reefAt(THREE, 0, -0.26, -0.1)]]);
}
function reef(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(2468);
  const V = new THREE.Vector3(), V2 = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), E = new THREE.Euler();
  camera.fov = 60; camera.near = 0.1; camera.far = 400;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  const SURF = 9, EYE = 2.4;
  const time = { value: 0 };
  const noise = keep(lhNoise(THREE)), glow = keep(glowTexture(THREE));
  const accent = new THREE.Color();
  const SUN = new THREE.Vector3(0.25, 0.9, -0.36).normalize();
  const floorAt = reefFloorHeight;
  const fogUni = { uFog: { value: new THREE.Color() }, uFogNear: { value: 6 }, uFogFar: { value: 60 } };
  const lightUni = { uSunDir: { value: SUN.clone() }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uAmbDown: { value: new THREE.Color() }, uCaustic: { value: 0.5 } };
  const common = { uNoise: { value: noise }, uTime: time, ...fogUni, ...lightUni };

  /* --- light for the turtle (a standard material), and the fog for it --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.copy(SUN).multiplyScalar(30);
  scene.add(hemi, sun);
  scene.fog = new THREE.Fog(0x1e8fc0, 6, 60);

  /* --- the water: all round, with the surface overhead; the rays, marched through it --- */
  const waterUni = { ...common, uDeep: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uUp: { value: new THREE.Color() }, uWindow: { value: 1 } };
  const water = new THREE.Mesh(keep(new THREE.SphereGeometry(300, 32, 20)), keep(new THREE.ShaderMaterial({ uniforms: waterUni, vertexShader: LANTERN_SKY_VS, fragmentShader: REEF_WATER_FS, side: THREE.BackSide, depthWrite: false, depthTest: false })));
  water.renderOrder = -10; water.frustumCulled = false;
  scene.add(water);
  const rayUni = { ...common, uColor: { value: new THREE.Color() }, uSurf: { value: SURF }, uFloorY: { value: 0 }, uAbsorb: { value: 0.09 } };
  const rays = new THREE.Mesh(keep(new THREE.SphereGeometry(80, 24, 12)), keep(new THREE.ShaderMaterial({ uniforms: rayUni, vertexShader: OBS_WORLD_VS, fragmentShader: REEF_RAY_FS, defines: { REEF_STEPS: preview ? 7 : 12, REEF_RANGE: "55.0" }, side: THREE.BackSide, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending })));
  rays.renderOrder = 6; rays.frustumCulled = false;
  scene.add(rays);

  /* --- the sand and the bommies --- */
  const floorGeo = keep(new THREE.PlaneGeometry(220, 220, preview ? 60 : 110, preview ? 60 : 110));
  floorGeo.rotateX(-Math.PI / 2);
  floorGeo.translate(0, 0, -40);
  {
    const p = floorGeo.attributes.position, uv = floorGeo.attributes.uv, col = new Float32Array(p.count * 3);
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), z = p.getZ(i), rock = reefRockiness(x, z);
      p.setY(i, floorAt(x, z));
      uv.setXY(i, x / 6, z / 6);
      col.set([1 - 0.42 * rock, 1 - 0.52 * rock, 1 - 0.6 * rock], i * 3); // the bommies' rock is browner and darker than the sand
    }
    floorGeo.setAttribute("color", new THREE.BufferAttribute(col, 3));
    floorGeo.computeVertexNormals();
  }
  const floorUni = { ...common, uMap: { value: keep(reefSand(THREE, preview ? 256 : 512)) } };
  const floor = new THREE.Mesh(floorGeo, keep(new THREE.ShaderMaterial({ uniforms: floorUni, vertexShader: REEF_FLOOR_VS, fragmentShader: REEF_FLOOR_FS, vertexColors: true })));
  floor.frustumCulled = false;
  scene.add(floor);

  /* --- the corals: six kinds, instanced, growing thickest on the bommies --- */
  const coralUni = { ...common, uGlow: { value: 0 } };
  const coralMatFor = (kind, extra = {}, uni = {}) => keep(new THREE.ShaderMaterial({ uniforms: { ...coralUni, uKind: { value: kind }, ...uni }, vertexShader: REEF_CORAL_VS, fragmentShader: REEF_CORAL_FS, ...extra }));
  const fanMat = coralMatFor(3, { defines: { REEF_MAP: 1 }, side: THREE.DoubleSide, alphaToCoverage: true }, { uMap: { value: keep(reefFanTex(THREE, preview ? 256 : 512)) } });
  const spriteMat = (tex) => keep(new THREE.ShaderMaterial({ uniforms: { ...coralUni, uMap: { value: keep(tex) } }, vertexShader: REEF_SPRITE_VS, fragmentShader: REEF_SPRITE_FS, side: THREE.DoubleSide, alphaToCoverage: true }));
  const softMat = spriteMat(reefSoftAtlas(THREE, preview ? 512 : 1024)), softMat2 = spriteMat(reefSoftAtlas2(THREE, preview ? 512 : 1024));
  const accentFans = [];
  const spotFor = (near) => { // a place on the floor: most on or beside a bommie, the rest anywhere on the reef, never right at the viewer's feet
    for (let tries = 0; tries < 20; tries++) {
      let x, z;
      if (r() < near) { const [bx, bz, rad] = REEF_BOMMIES[(r() * REEF_BOMMIES.length) | 0]; const a = r(0, 6.28), d = rad * Math.sqrt(r()) * 1.25; x = bx + Math.cos(a) * d; z = bz + Math.sin(a) * d; }
      else { const a = r(-1.35, 1.35), d = r(6, 46); x = Math.sin(a) * d; z = -Math.cos(a) * d; }
      if (z > -4 || (Math.abs(x) < 2.5 && z > -7)) continue;
      return [x, z];
    }
    return [r(-20, 20), -20];
  };
  const plant = (geo, mat, n, near, sizes, colours, tilt = 0.1, fixed = []) => { // `fixed`: places given outright (the foreground), the rest found on the reef
    const mesh = new THREE.InstancedMesh(keep(geo), mat, n);
    const c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const [x, z] = i < fixed.length ? fixed[i] : spotFor(near), s = r(sizes[0], sizes[1]);
      mesh.setMatrixAt(i, M4.compose(V.set(x, floorAt(x, z) - 0.04, z), Q.setFromEuler(E.set(r(-tilt, tilt), r(0, 6.28), r(-tilt, tilt))), S3.set(s * r(0.85, 1.15), s, s * r(0.85, 1.15))));
      const pick = colours[(r() * colours.length) | 0];
      if (pick === "accent") { accentFans.push({ mesh, i }); c.copy(accent); } else c.set(pick);
      c.multiplyScalar(r(0.85, 1.1));
      mesh.setColorAt(i, c);
    }
    mesh.frustumCulled = false;
    scene.add(mesh);
    return mesh;
  };
  const k = preview ? 0.33 : 1;
  plant(reefStaghorn(THREE, r), coralMatFor(0), Math.round(50 * k), 0.75, [0.9, 2.2], ["#c8a888", "#d6b694", "#b9a0c8", "#a9b8c8", "#dcc4a4", "#c9a294"]);
  plant(reefBoulder(THREE, 3), coralMatFor(1), Math.round(22 * k), 0.8, [0.5, 1.4], ["#b09a58", "#a8a06a", "#9a7a52", "#8fa070", "#c4a262"], 0.3);
  plant(reefBoulder(THREE, 11), coralMatFor(1), Math.round(20 * k), 0.8, [0.4, 1.1], ["#a89a5a", "#a8865a", "#8aa084", "#b8946a"], 0.3);
  plant(reefTable(THREE), coralMatFor(2), Math.round(18 * k) + 2, 0.7, [0.7, 1.6], ["#a8a878", "#b8a882", "#a89a6c", "#b0b088"], 0.1, [[-4.6, -5.2], [5.2, -6.4]]);
  plant(reefBoulder(THREE, 7), coralMatFor(1), 2, 0.8, [0.85, 1.1], ["#9a7a52", "#b09a58"], 0.3, [[-4.4, -5.0], [4.8, -5.8]]);
  plant(reefFan(THREE), fanMat, Math.round(45 * k), 0.7, [0.8, 1.8], ["#b04a7a", "#d4553d", "#7a4fb8", "#e08a3a", "accent", "accent"], 0.15);
  // painted things: upright billboards from the two atlases; `fixed` places the foreground ones, with their cell
  const sprinkle = (mat, n, near, sizes, cells, fixed) => {
    const spriteGeo = keep(new THREE.PlaneGeometry(1, 1));
    spriteGeo.translate(0, 0.5, 0);
    const aSprite = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4);
    spriteGeo.setAttribute("aSprite", aSprite);
    const mesh = new THREE.InstancedMesh(spriteGeo, mat, n), c = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const [x, z, cell] = i < fixed.length ? fixed[i] : [...spotFor(near), cells[(r() * cells.length) | 0]];
      mesh.setMatrixAt(i, M4.makeTranslation(x, floorAt(x, z) - 0.03, z));
      aSprite.setXYZW(i, r(sizes[0], sizes[1]), cell, r(0, 6.28), 0);
      mesh.setColorAt(i, c.setScalar(r(0.85, 1.05)));
    }
    mesh.frustumCulled = false;
    scene.add(mesh);
  };
  sprinkle(softMat, Math.round(46 * k) + 4, 0.8, [0.9, 1.9], [0, 1, 2, 3], [[-3.0, -4.6, 2], [3.4, -4.4, 0], [-5.8, -6.0, 3], [6.0, -6.6, 1]]);
  sprinkle(softMat2, Math.round(110 * k) + 9, 0.5, [0.55, 1.3], [0, 1, 1, 1, 2, 3], [[-2.6, -3.6, 0], [3.1, -4.1, 0], [-5.4, -3.4, 3], [-1.9, -3.2, 1], [-3.2, -3.0, 1], [2.2, -3.4, 1], [3.6, -3.0, 1], [-6.2, -4.6, 2], [6.4, -4.4, 1]]);

  /* --- the school: a couple of hundred small fish that hold a loose shape round a point and swirl about it; the point follows the pointer --- */
  const NF = preview ? 80 : 220;
  const fishGeo = keep(reefFish(THREE));
  const aFish = new THREE.InstancedBufferAttribute(new Float32Array(NF * 2), 2);
  fishGeo.setAttribute("aFish", aFish);
  const fishMat = keep(new THREE.ShaderMaterial({ uniforms: { uTime: time, ...fogUni, ...lightUni }, vertexShader: REEF_FISH_VS, fragmentShader: REEF_FISH_FS, side: THREE.DoubleSide }));
  const school = new THREE.InstancedMesh(fishGeo, fishMat, NF);
  school.frustumCulled = false; school.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(school);
  const FISH_COLS = ["#ffb347", "#f2c14e", "#4f8fe0", "#e86f4a", "#ffd166", "#7fd8ff", "#ff6b9d", "#9be564"];
  const F = [], accentFish = [];
  const home = new THREE.Vector3(0, 3.5, -14), att = home.clone(), want = new THREE.Vector3(), tang = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < NF; i++) {
    const f = { p: home.clone().add(V.set(r(-3, 3), r(-1.2, 1.2), r(-3, 3))), v: new THREE.Vector3(r(-1, 1), 0, r(-1, 1)), off: new THREE.Vector3(r(-3.2, 3.2), r(-1.3, 1.3), r(-3.2, 3.2)), size: r(0.4, 0.6), accent: r() < 0.3 };
    F.push(f);
    aFish.setXY(i, r(0, 6.28), r(0.8, 1.3));
    if (f.accent) accentFish.push(i); else school.setColorAt(i, new THREE.Color(FISH_COLS[(r() * FISH_COLS.length) | 0]));
  }
  let pointerT = -99;
  const ndc = new THREE.Vector2();
  const onMove = (e) => { ndc.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1); pointerT = time.value; };
  if (!preview) window.addEventListener("pointermove", onMove);
  function stepFish(dt, t) {
    if (t - pointerT < 5) { // the pointer's ray, met by a plane a little way in front
      V.set(ndc.x, ndc.y, 0.5).unproject(camera).sub(camera.position).normalize();
      const s = (-11 - camera.position.z) / V.z;
      if (s > 0) V2.copy(camera.position).addScaledVector(V, s); else V2.copy(home);
    } else V2.set(12 * Math.sin(t * 0.13), 3.5 + 1.5 * Math.sin(t * 0.21), -14 + 5 * Math.cos(t * 0.09));
    V2.y = Math.min(SURF - 1.2, Math.max(floorAt(V2.x, V2.z) + 1.2, V2.y));
    att.lerp(V2, Math.min(1, dt * 2.5));
    for (let i = 0; i < NF; i++) {
      const f = F[i];
      want.copy(att).add(f.off).sub(f.p);
      const d = want.length();
      tang.crossVectors(up, V.copy(f.p).sub(att)).normalize();
      want.multiplyScalar(Math.min(2.6, d * 0.8) / Math.max(d, 1e-3)).addScaledVector(tang, 1.1);
      f.v.lerp(want, Math.min(1, dt * 1.6));
      const sp = f.v.length();
      if (sp < 0.5) f.v.multiplyScalar(0.5 / Math.max(sp, 1e-3)); else if (sp > 3.5) f.v.multiplyScalar(3.5 / sp);
      f.p.addScaledVector(f.v, dt);
      const fl = floorAt(f.p.x, f.p.z) + 0.5;
      if (f.p.y < fl) { f.p.y = fl; f.v.y = Math.abs(f.v.y) * 0.5 + 0.3; }
      if (f.p.y > SURF - 0.8) { f.p.y = SURF - 0.8; f.v.y = -Math.abs(f.v.y); }
      const yaw = Math.atan2(f.v.x, f.v.z), pitch = Math.atan2(f.v.y, Math.hypot(f.v.x, f.v.z));
      school.setMatrixAt(i, M4.compose(f.p, Q.setFromEuler(E.set(-pitch, yaw, 0)), S3.setScalar(f.size)));
    }
    school.instanceMatrix.needsUpdate = true;
  }

  /* --- a green turtle gliding by on a long loop through the reef --- */
  const shellMat = keep(new THREE.MeshStandardMaterial({ map: keep(reefScutes(THREE)), roughness: 0.6 }));
  const skinMat = keep(new THREE.MeshStandardMaterial({ color: 0x8c9a66, roughness: 0.8 }));
  const ball = keep(new THREE.SphereGeometry(1, 20, 14));
  const turtle = new THREE.Group();
  const shell = new THREE.Mesh(ball, shellMat); shell.scale.set(0.62, 0.3, 0.8);
  const plastron = new THREE.Mesh(ball, keep(new THREE.MeshStandardMaterial({ color: 0xc9c08f, roughness: 0.8 }))); plastron.scale.set(0.56, 0.17, 0.72); plastron.position.y = -0.1;
  const head = new THREE.Mesh(ball, skinMat); head.scale.set(0.15, 0.13, 0.2); head.position.set(0, 0.02, 0.88);
  turtle.add(shell, plastron, head);
  const flippers = [[1, 0.42, 0.42, 0.14], [-1, 0.42, 0.42, 0.14], [1, -0.5, 0.26, 0.1], [-1, -0.5, 0.26, 0.1]].map(([side, z, len, w]) => {
    const pivot = new THREE.Group(); pivot.position.set(side * 0.5, -0.06, z);
    const m = new THREE.Mesh(ball, skinMat); m.scale.set(len, 0.045, w); m.position.x = side * len * 0.9; m.rotation.y = side * -0.35;
    pivot.add(m); turtle.add(pivot);
    return { pivot, side, front: z > 0 };
  });
  turtle.scale.setScalar(1.9);
  scene.add(turtle);
  let ta = r(0, 6.28);

  /* --- bubbles rising from the rocks, plankton drifting; at night the fish leave sparks behind them --- */
  const NBUB = preview ? 20 : 60, bub = new Float32Array(NBUB * 3), bubSpot = [];
  for (let i = 0; i < NBUB; i++) { const [bx, bz] = REEF_BOMMIES[i % 4]; const x = bx + r(-1.5, 1.5), z = bz + r(-1.5, 1.5); bubSpot.push([x, z, r(0.5, 0.9)]); bub.set([x, floorAt(x, z) + r(0, SURF - 2), z], i * 3); }
  const bubGeo = keep(new THREE.BufferGeometry());
  bubGeo.setAttribute("position", new THREE.BufferAttribute(bub, 3).setUsage(THREE.DynamicDrawUsage));
  const bubbles = new THREE.Points(bubGeo, keep(new THREE.PointsMaterial({ map: keep(reefRing(THREE)), size: 0.16, transparent: true, depthWrite: false, opacity: 0.7, fog: false })));
  bubbles.frustumCulled = false; bubbles.renderOrder = 7;
  scene.add(bubbles);
  const NM = preview ? 150 : 650, mote = new Float32Array(NM * 3), moteV = [];
  for (let i = 0; i < NM; i++) { mote.set([r(-25, 25), r(0.3, SURF - 0.3), r(-50, 4)], i * 3); moteV.push([r(-0.04, 0.04), r(-0.02, 0.03), r(-0.04, 0.04)]); }
  const moteGeo = keep(new THREE.BufferGeometry());
  moteGeo.setAttribute("position", new THREE.BufferAttribute(mote, 3).setUsage(THREE.DynamicDrawUsage));
  const moteMat = keep(new THREE.PointsMaterial({ map: glow, size: 0.1, transparent: true, depthWrite: false, opacity: 0.45, fog: true }));
  const motes = new THREE.Points(moteGeo, moteMat);
  motes.frustumCulled = false; motes.renderOrder = 7;
  scene.add(motes);
  const NSP = preview ? 150 : 500, spPos = new Float32Array(NSP * 3), spBorn = new Float32Array(NSP).fill(-1), spSize = new Float32Array(NSP);
  for (let i = 0; i < NSP; i++) spSize[i] = r(0.05, 0.11);
  const sparkGeo = keep(new THREE.BufferGeometry());
  sparkGeo.setAttribute("position", new THREE.BufferAttribute(spPos, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute("aBorn", new THREE.BufferAttribute(spBorn, 1).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute("aSize", new THREE.BufferAttribute(spSize, 1));
  const sparkUni = { uTime: time, uPx: { value: 600 }, uColor: { value: new THREE.Color("#7fffd4") } };
  const sparks = new THREE.Points(sparkGeo, keep(new THREE.ShaderMaterial({ uniforms: sparkUni, vertexShader: REEF_SPARK_VS, fragmentShader: REEF_SPARK_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
  sparks.frustumCulled = false; sparks.renderOrder = 8;
  scene.add(sparks);
  let spHead = 0, spAcc = 0;
  const buf = new THREE.Vector2();
  sparks.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); sparkUni.uPx.value = buf.y / (2 * Math.tan((camera.fov * Math.PI) / 360)); };

  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    accent.set(p.accent);
    const c = new THREE.Color();
    for (const { mesh, i } of accentFans) { mesh.setColorAt(i, c.copy(accent).multiplyScalar(1.1)); mesh.instanceColor.needsUpdate = true; }
    for (const i of accentFish) school.setColorAt(i, c.copy(accent).multiplyScalar(1.15));
    school.instanceColor.needsUpdate = true;
    waterUni.uDeep.value.set(d ? "#02101f" : "#063a66"); waterUni.uMid.value.set(d ? "#041a30" : "#1277ab"); waterUni.uUp.value.set(d ? "#0a2c4a" : "#4cbde4"); waterUni.uWindow.value = d ? 0.3 : 1;
    lightUni.uSunCol.value.set(d ? "#5d7fb0" : "#fff2d8").multiplyScalar(d ? 0.28 : 0.55);
    lightUni.uAmb.value.set(d ? "#12243a" : "#5a90b8").multiplyScalar(d ? 1 : 0.5); lightUni.uAmbDown.value.set(d ? "#050c16" : "#22405c");
    lightUni.uCaustic.value = d ? 0.05 : 0.27;
    rayUni.uColor.value.set(d ? "#6f90c0" : "#cfe8ff").multiplyScalar(d ? 0.2 : 1.1);
    coralUni.uGlow.value = d ? 0.5 : 0;
    fogUni.uFog.value.set(d ? "#041226" : "#187db2"); fogUni.uFogNear.value = d ? 4 : 6; fogUni.uFogFar.value = d ? 40 : 60;
    scene.fog.color.copy(fogUni.uFog.value); scene.fog.near = fogUni.uFogNear.value; scene.fog.far = fogUni.uFogFar.value;
    hemi.color.set(d ? "#1b3350" : "#a6d6f0"); hemi.groundColor.set(d ? "#040a12" : "#3a6a88"); hemi.intensity = d ? 0.6 : 1.6;
    sun.color.set(d ? "#6d8fc0" : "#fff2d8"); sun.intensity = d ? 0.5 : 2.0;
    moteMat.color.set(d ? "#9fd8ff" : "#ffffff"); moteMat.opacity = d ? 0.25 : 0.45;
    sparks.visible = d;
  }
  applyPalette(pal);

  const look = new THREE.Vector3();
  function frame(dt, t) {
    time.value = t;
    const A = camera.aspect || 1, fov = A >= 1 ? 60 : 60 + (1 - A) * 22;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.position.set(Math.sin(t * 0.11) * 0.25, EYE + Math.sin(t * 0.17) * 0.12, 0); // a diver hanging in the water
    camera.lookAt(look.set(Math.sin(t * 0.07) * 0.8, EYE - 0.25, -12));
    camera.rotateZ(Math.sin(t * 0.13) * 0.012);
    stepFish(dt, t);
    // the turtle on its loop, banked into the turn, flippers stroking
    ta += dt * 0.055;
    const tx = 24 * Math.cos(ta), tz = -18 + 11 * Math.sin(ta), ty = 3.4 + 0.7 * Math.sin(ta * 2 + 1);
    turtle.position.set(tx, ty, tz);
    turtle.lookAt(tx - 24 * Math.sin(ta), ty + 0.4 * Math.cos(ta * 2 + 1), tz + 11 * Math.cos(ta));
    turtle.rotateZ(-0.22);
    for (const f of flippers) f.pivot.rotation.z = f.side * (f.front ? 0.35 + 0.45 * Math.sin(t * 2.0) : 0.2 + 0.25 * Math.sin(t * 2.0 + 1));
    for (let i = 0; i < NBUB; i++) { // bubbles wobble up and start again at their rock
      const [x, z, sp] = bubSpot[i];
      let y = bub[i * 3 + 1] + sp * dt;
      if (y > SURF - 0.3) y = floorAt(x, z) + 0.2;
      bub[i * 3] = x + Math.sin(t * 2.1 + i) * 0.12; bub[i * 3 + 1] = y; bub[i * 3 + 2] = z + Math.cos(t * 1.7 + i * 1.3) * 0.12;
    }
    bubGeo.attributes.position.needsUpdate = true;
    for (let i = 0; i < NM; i++) { // plankton adrift
      const v = moteV[i];
      let x = mote[i * 3] + v[0] * dt, y = mote[i * 3 + 1] + v[1] * dt + Math.sin(t * 0.5 + i) * 0.002, z = mote[i * 3 + 2] + v[2] * dt;
      if (x < -25) x = 25; else if (x > 25) x = -25;
      if (y < 0.3) y = SURF - 0.3; else if (y > SURF - 0.3) y = 0.3;
      if (z < -50) z = 4; else if (z > 4) z = -50;
      mote[i * 3] = x; mote[i * 3 + 1] = y; mote[i * 3 + 2] = z;
    }
    moteGeo.attributes.position.needsUpdate = true;
    if (pal.dark) { // sparks in the fishes' wakes
      spAcc += dt * 45;
      while (spAcc > 1) {
        spAcc -= 1;
        const f = F[(r() * NF) | 0];
        spPos.set([f.p.x - f.v.x * 0.15 + r(-0.1, 0.1), f.p.y + r(-0.1, 0.1), f.p.z - f.v.z * 0.15 + r(-0.1, 0.1)], spHead * 3);
        spBorn[spHead] = t;
        spHead = (spHead + 1) % NSP;
      }
      sparkGeo.attributes.position.needsUpdate = sparkGeo.attributes.aBorn.needsUpdate = true;
    }
  }
  for (let k2 = 0; k2 < 60; k2++) stepFish(0.05, -3 + k2 * 0.05); // the school already in formation on the first frame
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { let n = 0; for (let i = 0; i < NSP; i++) if (spBorn[i] >= 0 && time.value - spBorn[i] < 1.6) n++; return { fish: NF, following: time.value - pointerT < 5 ? "pointer" : "wandering", school: [att.x, att.y, att.z].map((v) => +v.toFixed(1)), turtle: +ta.toFixed(2), sparks: n }; }, // for checking by hand
    dispose() { window.removeEventListener("pointermove", onMove); scene.fog = null; disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Northern lights lake: aurora curtains over a still lake in Lapland, mirrored in the water; a lit cabin, pines and a canoe on the snowy shore ---------- */
// the sky: a night gradient with three aurora curtains (or a low winter sun by day); below the horizon only the mirrored pass looks
const AURORA_SKY_FS = /* glsl */ `
  uniform sampler2D uNoise; uniform float uTime; uniform vec3 uZenith; uniform vec3 uMid; uniform vec3 uHorizon; uniform vec3 uGlow;
  uniform vec3 uSunDir; uniform vec3 uSunColor; uniform float uSun; uniform float uAurora;
  varying vec3 vDir;
  void main() {
    vec3 d = normalize(vec3(vDir.x, abs(vDir.y), vDir.z));
    float el = d.y, az = atan(d.x, -d.z);
    vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.2, el));
    col = mix(col, uZenith, smoothstep(0.16, 0.75, el));
    col += uGlow * exp(-el * 14.0);
    float sd = distance(d, uSunDir);
    col += uSunColor * uSun * (smoothstep(0.03, 0.026, sd) + 0.5 * exp(-sd * 9.0) + 0.22 * exp(-sd * 2.5));
    if (uAurora > 0.0) {
      vec3 ac = vec3(0.0);
      for (int i = 0; i < 3; i++) {
        float fi = float(i);
        float fold = texture2D(uNoise, vec2(az * 0.35 + uTime * 0.012 * (1.0 + 0.3 * fi) + fi * 0.37, 0.2 + fi * 0.3)).r - 0.5
          + 0.5 * (texture2D(uNoise, vec2(az * 1.1 - uTime * 0.02 + fi * 0.7, 0.5 + fi * 0.2)).g - 0.5); // the curtain's folds, large and small, drifting
        float lower = 0.17 + 0.12 * fi + fold * 0.22; // where its lower edge hangs
        float h = el - lower;
        float body = smoothstep(0.0, 0.02, h) * (exp(-h * (7.0 - fi)) + 0.6 * exp(-h * 30.0)); // a bright foot, fading up into the dark
        float rays = 0.45 + 0.55 * texture2D(uNoise, vec2(az * 7.0 + fold * 3.0 + uTime * 0.03, fi * 0.5 + h * 0.4)).g; // the vertical striations
        float bright = texture2D(uNoise, vec2(az * 0.9 + uTime * 0.04 + fi * 0.2, 0.7 + fi * 0.15)).r; // brightness travelling along the curtain
        float stretch = texture2D(uNoise, vec2(az * 2.3 - uTime * 0.025 + fi * 1.3, 0.35 + fi * 0.25)).r; // and whole stretches that fade away ("patch" is a GLSL reserved word)
        float k = body * rays * smoothstep(0.25, 0.7, bright) * smoothstep(0.25, 0.55, stretch) * (0.75 + 0.25 * sin(uTime * 0.6 + fi * 2.0));
        vec3 cc = mix(vec3(0.25, 1.0, 0.5), vec3(0.7, 0.3, 0.95), smoothstep(0.04, 0.4, h)); // green below, violet above
        cc = mix(cc, vec3(1.0, 0.4, 0.55), 0.5 * smoothstep(-0.01, 0.015, h) * (1.0 - smoothstep(0.015, 0.06, h))); // a pink fringe at the foot
        ac += cc * k;
      }
      col += ac * uAurora * 1.6;
    }
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// snow falling round the viewer: a box of flakes that wraps, each drifting a little on its way down
const AURORA_SNOW_VS = /* glsl */ `
  uniform float uTime; uniform vec3 uBox; uniform vec3 uBoxC; uniform float uPx; uniform float uSize;
  attribute vec4 aSeed;
  varying float vA;
  void main() {
    float sp = 0.45 + 0.6 * fract(aSeed.w * 7.1);
    vec3 p = aSeed.xyz * uBox + vec3(sin(uTime * 0.6 + aSeed.w * 20.0) * 0.6 + uTime * 0.25, -uTime * sp, cos(uTime * 0.5 + aSeed.w * 13.0) * 0.4);
    p = uBoxC + mod(p, uBox) - uBox * 0.5;
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float near = -mv.z;
    vA = smoothstep(0.4, 2.0, near); // a flake right against the eye is gone
    gl_PointSize = clamp(uSize * (0.6 + 0.8 * fract(aSeed.w * 3.3)) * uPx / near, 1.0, 26.0);
  }
`;
const AURORA_SNOW_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uAlpha;
  varying float vA;
  void main() {
    vec2 p = gl_PointCoord * 2.0 - 1.0;
    float r2 = dot(p, p);
    if (r2 > 1.0) discard;
    gl_FragColor = vec4(uColor, (1.0 - r2) * (1.0 - r2) * uAlpha * vA);
    #include <colorspace_fragment>
  }
`;
/** A ridge line for the painted hills and banks: smooth noise in x. */
function auroraRidge(seed) {
  const h1 = (n) => { const s = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453; return s - Math.floor(s); };
  const n1 = (x) => { const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f); return h1(i) * (1 - u) + h1(i + 1) * u; };
  return (x) => { let s = 0, a = 0.5, q = x; for (let o = 0; o < 4; o++) { s += a * n1(q); q = q * 2.1 + 5.3; a *= 0.5; } return s / 0.9375; };
}
/** Snowy hills on the far shore, two ridges, the back one paler; transparent above. */
function auroraHills(THREE, W, H) {
  return canvasTexture(THREE, W, H, (g) => {
    for (const [seed, base, amp, top, bottom] of [[3, 0.42, 0.5, "#c9d4e6", "#a6b6d0"], [11, 0.2, 0.42, "#93a6c6", "#6f86ab"]]) {
      const f = auroraRidge(seed), grad = g.createLinearGradient(0, 0, 0, H);
      grad.addColorStop(0, top); grad.addColorStop(1, bottom);
      g.fillStyle = grad; g.beginPath(); g.moveTo(0, H);
      for (let x = 0; x <= W; x += 3) g.lineTo(x, H - (base + amp * Math.pow(f((x / W) * 7 + seed), 1.4)) * H);
      g.lineTo(W, H); g.closePath(); g.fill();
    }
  });
}
/** A treeline of spruces on a snowy bank, dark, some with snow on their tops; transparent above. */
function auroraTreeline(THREE, W, H) {
  const r = koiRng(2121);
  return canvasTexture(THREE, W, H, (g) => {
    const bank = g.createLinearGradient(0, H * 0.7, 0, H);
    bank.addColorStop(0, "#c9d6e8"); bank.addColorStop(1, "#8fa2c0");
    g.fillStyle = bank; g.fillRect(0, H * 0.72, W, H * 0.28);
    for (let x = -10; x < W + 10; x += r(6, 14) * (W / 2048)) {
      const th = r(0.35, 0.95) * H, tw = th * r(0.16, 0.24), base = H * r(0.72, 0.8), tiers = 4 + ((r() * 3) | 0);
      g.fillStyle = r() < 0.5 ? "#101f18" : "#15261d";
      for (let k = 0; k < tiers; k++) { const y = base - th + (k / tiers) * th * 0.85, w = tw * (0.25 + (k / (tiers - 1)) * 0.75), hh = th / tiers * 1.3; g.beginPath(); g.moveTo(x, y); g.lineTo(x + w, y + hh); g.lineTo(x - w, y + hh); g.closePath(); g.fill(); }
      if (r() < 0.6) { g.fillStyle = "rgba(225,234,245,0.85)"; for (let k = 0; k < tiers; k++) { const y = base - th + (k / tiers) * th * 0.85, w = tw * (0.25 + (k / (tiers - 1)) * 0.75); g.beginPath(); g.moveTo(x, y); g.lineTo(x + w * 0.5, y + th / tiers * 0.55); g.lineTo(x - w * 0.5, y + th / tiers * 0.55); g.closePath(); g.fill(); } }
    }
  });
}
/** One spruce close by: a solid mass of drooping boughs with a ragged needle fringe, snow lying in clumps on the outer boughs; W × H canvas, the trunk at the bottom middle. */
function auroraPine(THREE, W, H, seed) {
  const r = koiRng(seed);
  return canvasTexture(THREE, W, H, (g) => {
    const k = W / 512, cx = W / 2, top = H * 0.03, base = H * 0.97;
    g.strokeStyle = "#3a2a20"; g.lineCap = "round"; g.lineWidth = 10 * k; g.beginPath(); g.moveTo(cx, top + H * 0.1); g.lineTo(cx, base); g.stroke();
    const N = 14;
    for (let i = N - 1; i >= 0; i--) { // from the bottom up, so each bough lies over the one below
      const t = i / (N - 1), y = top + H * 0.05 + t * H * 0.84, len = W * (0.06 + 0.42 * Math.pow(t, 0.95)) * r(0.9, 1.08), droop = len * r(0.35, 0.5), fr = H * (0.05 + 0.05 * t);
      for (const side of [-1, 1]) {
        const tipX = cx + side * len, tipY = y + droop;
        const topAt = (u) => [cx + side * len * u, y + droop * u * u - droop * 0.08 * Math.sin(u * Math.PI)]; // the bough's upper edge: out, a little up, then drooping to the tip
        g.fillStyle = t < 0.35 ? "#2a4c36" : t < 0.7 ? "#22412d" : "#1b3626";
        g.beginPath(); g.moveTo(cx, y - 3 * k);
        for (let j = 1; j <= 8; j++) { const [px, py] = topAt(j / 8); g.lineTo(px, py); }
        for (let j = 8; j >= 0; j--) { const u = j / 8, [px, py] = topAt(u); g.lineTo(px + side * (j % 2 ? 3 : -3) * k, py + fr * (0.55 + 0.45 * Math.sin(u * Math.PI)) + (j % 2 ? r(3, 10) : r(0, 4)) * k); } // the ragged needle fringe underneath
        g.closePath(); g.fill();
        if (i % 2 === 0 || t > 0.75) { // snow lying on the outer part of the bough, heavier towards the drooping tip
          g.fillStyle = "rgba(244,248,253,0.96)";
          g.beginPath();
          const [sx, sy] = topAt(0.3); g.moveTo(sx, sy + 1 * k);
          for (let j = 3; j <= 8; j++) { const u = j / 8, [px, py] = topAt(u); g.lineTo(px, py - (2 + 8 * (u - 0.3)) * k); }
          g.lineTo(tipX, tipY + 4 * k);
          for (let j = 7; j >= 3; j--) { const u = j / 8, [px, py] = topAt(u); g.lineTo(px, py + (3 + 3 * (u - 0.3)) * k); }
          g.closePath(); g.fill();
        }
      }
    }
    g.fillStyle = "#2a4c36"; g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + 12 * k, top + H * 0.09); g.lineTo(cx - 12 * k, top + H * 0.09); g.closePath(); g.fill(); // the leader
    g.fillStyle = "rgba(244,248,253,0.9)"; g.beginPath(); g.moveTo(cx, top); g.lineTo(cx + 7 * k, top + H * 0.05); g.lineTo(cx - 7 * k, top + H * 0.05); g.closePath(); g.fill();
  });
}
/** The log cabin: a log gable under a thick snow roof with overhanging eaves, framed windows lit at night, a door in the accent colour with a lantern and a step. Redrawn when the palette changes. */
function auroraCabinDraw(g, W, H, accent, lit) {
  g.clearRect(0, 0, W, H);
  const k = W / 512, L = W * 0.14, R = W * 0.86, wallTop = H * 0.46, wallBot = H * 0.9, apexY = H * 0.16, midX = W * 0.5;
  const drift = g.createLinearGradient(0, wallBot - 14 * k, 0, H); drift.addColorStop(0, "rgba(233,238,246,0)"); drift.addColorStop(0.4, "#e9eef6"); drift.addColorStop(1, "#d6dfec");
  g.fillStyle = drift; g.beginPath(); g.ellipse(midX, wallBot + 4 * k, (R - L) * 0.62, 16 * k, 0, 0, Math.PI * 2); g.fill(); // snow drifted against the foot
  g.save(); g.beginPath(); g.moveTo(L, wallBot); g.lineTo(L, wallTop); g.lineTo(midX, apexY + 10 * k); g.lineTo(R, wallTop); g.lineTo(R, wallBot); g.closePath(); g.clip(); // the walls and the gable, all logs
  for (let y = apexY; y < wallBot; y += 15 * k) {
    const grad = g.createLinearGradient(0, y, 0, y + 15 * k);
    grad.addColorStop(0, "#9a6b42"); grad.addColorStop(0.5, "#7a4f2e"); grad.addColorStop(1, "#52331d");
    g.fillStyle = grad; g.fillRect(L - 10 * k, y, R - L + 20 * k, 14 * k);
    g.fillStyle = "rgba(40,22,10,0.5)"; g.fillRect(L - 10 * k, y + 13 * k, R - L + 20 * k, 1.5 * k);
  }
  g.restore();
  for (let y = wallTop; y < wallBot; y += 15 * k) { for (const x of [L, R]) { g.fillStyle = "#6a4326"; g.beginPath(); g.arc(x, y + 7 * k, 7.5 * k, 0, Math.PI * 2); g.fill(); g.fillStyle = "#c79a6a"; g.beginPath(); g.arc(x, y + 7 * k, 4 * k, 0, Math.PI * 2); g.fill(); } } // the log ends, crossing at the corners
  for (const wx of [W * 0.21, W * 0.63]) { // the windows: frame, four panes, warm light at night
    g.fillStyle = "#3a2a1a"; g.fillRect(wx - 4 * k, H * 0.55 - 4 * k, W * 0.16 + 8 * k, H * 0.17 + 8 * k);
    g.fillStyle = lit ? "#ffd27a" : "#2b3a52"; g.fillRect(wx, H * 0.55, W * 0.16, H * 0.17);
    if (lit) { const gl = g.createRadialGradient(wx + W * 0.08, H * 0.63, 0, wx + W * 0.08, H * 0.63, W * 0.1); gl.addColorStop(0, "rgba(255,255,225,0.9)"); gl.addColorStop(1, "rgba(255,200,100,0)"); g.fillStyle = gl; g.fillRect(wx, H * 0.55, W * 0.16, H * 0.17); }
    g.fillStyle = "#e8dcc4"; g.fillRect(wx + W * 0.08 - 1.5 * k, H * 0.55, 3 * k, H * 0.17); g.fillRect(wx, H * 0.635 - 1.5 * k, W * 0.16, 3 * k);
    g.fillStyle = "#f2f5fa"; g.fillRect(wx - 5 * k, H * 0.55 - 8 * k, W * 0.16 + 10 * k, 5 * k); // snow on the sill and the frame's top
    if (lit) { const sp = g.createLinearGradient(0, wallBot, 0, H); sp.addColorStop(0, "rgba(255,190,90,0.45)"); sp.addColorStop(1, "rgba(255,190,90,0)"); g.fillStyle = sp; g.beginPath(); g.moveTo(wx - W * 0.04, wallBot); g.lineTo(wx + W * 0.2, wallBot); g.lineTo(wx + W * 0.26, H); g.lineTo(wx - W * 0.1, H); g.closePath(); g.fill(); } // its light on the snow
  }
  g.fillStyle = "#3a2a1a"; g.fillRect(W * 0.435, H * 0.6, W * 0.13, wallBot - H * 0.6 + 2 * k); // the door frame
  const dg = g.createLinearGradient(W * 0.44, 0, W * 0.56, 0); dg.addColorStop(0, accent); dg.addColorStop(1, accent);
  g.fillStyle = accent; g.fillRect(W * 0.445, H * 0.61, W * 0.11, wallBot - H * 0.61);
  g.fillStyle = "rgba(0,0,0,0.28)"; g.fillRect(W * 0.445, H * 0.61, W * 0.11, wallBot - H * 0.61); // deepened, so the accent reads as paint on wood
  g.fillStyle = accent; g.fillRect(W * 0.455, H * 0.63, W * 0.09, H * 0.1); g.fillRect(W * 0.455, H * 0.75, W * 0.09, wallBot - H * 0.77); // the panels
  g.fillStyle = lit ? "#ffd27a" : "#2b3a52"; g.fillRect(W * 0.47, H * 0.645, W * 0.06, H * 0.06); // a small pane
  g.fillStyle = "#e8d29a"; g.beginPath(); g.arc(W * 0.535, H * 0.79, 2.5 * k, 0, Math.PI * 2); g.fill(); // the handle
  g.fillStyle = "#c9b79a"; g.fillRect(W * 0.42, wallBot, W * 0.16, 6 * k); g.fillStyle = "#f2f5fa"; g.fillRect(W * 0.42, wallBot - 2 * k, W * 0.16, 3 * k); // the step
  g.fillStyle = "#2a2a30"; g.fillRect(W * 0.6, H * 0.6, 3 * k, 22 * k); g.fillRect(W * 0.585, H * 0.6, 12 * k, 3 * k); // the lantern by the door
  g.fillStyle = lit ? "#ffcf6a" : "#565a66"; g.beginPath(); g.arc(W * 0.6 + 1.5 * k, H * 0.6 + 26 * k, 5 * k, 0, Math.PI * 2); g.fill();
  if (lit) { const lg = g.createRadialGradient(W * 0.6, H * 0.6 + 26 * k, 0, W * 0.6, H * 0.6 + 26 * k, 34 * k); lg.addColorStop(0, "rgba(255,200,110,0.55)"); lg.addColorStop(1, "rgba(255,200,110,0)"); g.fillStyle = lg; g.fillRect(W * 0.5, H * 0.5, W * 0.2, H * 0.35); }
  // the roof: a dark underside at the eaves, then thick snow slabs on both slopes, overhanging the walls
  g.fillStyle = "#2c1e12"; g.beginPath(); g.moveTo(W * 0.05, wallTop + 10 * k); g.lineTo(midX, apexY + 4 * k); g.lineTo(W * 0.95, wallTop + 10 * k); g.lineTo(W * 0.95, wallTop + 18 * k); g.lineTo(midX, apexY + 14 * k); g.lineTo(W * 0.05, wallTop + 18 * k); g.closePath(); g.fill();
  const snow = g.createLinearGradient(0, apexY - 20 * k, 0, wallTop + 10 * k); snow.addColorStop(0, "#f8fafd"); snow.addColorStop(1, "#c8d4e4");
  g.strokeStyle = snow; g.lineCap = "round"; g.lineJoin = "round"; g.lineWidth = 26 * k;
  g.beginPath(); g.moveTo(W * 0.06, wallTop + 2 * k); g.lineTo(midX, apexY - 8 * k); g.lineTo(W * 0.94, wallTop + 2 * k); g.stroke();
  g.strokeStyle = "rgba(160,180,205,0.5)"; g.lineWidth = 4 * k; g.beginPath(); g.moveTo(W * 0.06, wallTop + 14 * k); g.lineTo(midX, apexY + 4 * k); g.lineTo(W * 0.94, wallTop + 14 * k); g.stroke(); // the snow's lower edge, in shadow
  for (let i = 0; i < 12; i++) { const x = W * (0.07 + i * 0.075), y = i < 6 ? wallTop + 16 * k - (5 - i) * (wallTop - apexY) / 6 * 0.1 : wallTop + 16 * k - (i - 6) * (wallTop - apexY) / 6 * 0.1; g.fillStyle = "#dfe8f4"; g.beginPath(); g.moveTo(x - 3 * k, y); g.lineTo(x + 3 * k, y); g.lineTo(x, y + (9 + (i % 3) * 5) * k); g.closePath(); g.fill(); } // icicles along the eaves
  const chx = W * 0.7, chTop = apexY + (wallTop - apexY) * 0.42 - 34 * k; // the chimney, rising from the right slope
  g.fillStyle = "#5b6470"; g.fillRect(chx, chTop, W * 0.08, (apexY + (wallTop - apexY) * 0.42) - chTop + 8 * k);
  g.fillStyle = "#3f4650"; g.fillRect(chx + W * 0.06, chTop, W * 0.02, (apexY + (wallTop - apexY) * 0.42) - chTop + 8 * k);
  g.fillStyle = "#f2f5fa"; g.beginPath(); g.roundRect(chx - 3 * k, chTop - 6 * k, W * 0.08 + 6 * k, 8 * k, 3 * k); g.fill(); // its snow cap
}
/** The canoe pulled up on the snow, in the accent colour, seen a little from above: the inside with its ribs and thwarts, a paddle across it, snow drifted against the hull. */
function auroraCanoeDraw(g, W, H, accent) {
  g.clearRect(0, 0, W, H);
  const k = W / 256;
  g.fillStyle = "rgba(70,90,125,0.4)"; g.beginPath(); g.ellipse(W * 0.5, H * 0.88, W * 0.44, H * 0.09, 0, 0, Math.PI * 2); g.fill(); // its shadow on the snow
  const bow = [W * 0.03, H * 0.36], stern = [W * 0.97, H * 0.36];
  g.fillStyle = accent; g.beginPath(); g.moveTo(...bow); g.quadraticCurveTo(W * 0.5, H * 1.02, ...stern); g.quadraticCurveTo(W * 0.5, H * 0.62, ...bow); g.closePath(); g.fill(); // the hull side
  const shade = g.createLinearGradient(0, H * 0.45, 0, H * 0.85); shade.addColorStop(0, "rgba(255,255,255,0.18)"); shade.addColorStop(0.5, "rgba(0,0,0,0.12)"); shade.addColorStop(1, "rgba(0,0,0,0.5)");
  g.fillStyle = shade; g.beginPath(); g.moveTo(...bow); g.quadraticCurveTo(W * 0.5, H * 1.02, ...stern); g.quadraticCurveTo(W * 0.5, H * 0.62, ...bow); g.closePath(); g.fill();
  g.fillStyle = "#4a3320"; g.beginPath(); g.moveTo(...bow); g.quadraticCurveTo(W * 0.5, H * 0.62, ...stern); g.quadraticCurveTo(W * 0.5, H * 0.14, ...bow); g.closePath(); g.fill(); // the inside, seen from above
  g.strokeStyle = "rgba(255,225,190,0.35)"; g.lineWidth = 1.5 * k; // the ribs
  for (let i = 1; i < 12; i++) { const u = i / 12, x = bow[0] + (stern[0] - bow[0]) * u, d = Math.sin(u * Math.PI); g.beginPath(); g.moveTo(x, H * 0.36 - d * H * 0.2); g.lineTo(x, H * 0.36 + d * H * 0.24); g.stroke(); }
  g.fillStyle = "#b08a5a"; for (const u of [0.3, 0.7]) { const x = bow[0] + (stern[0] - bow[0]) * u, d = Math.sin(u * Math.PI); g.fillRect(x - 3 * k, H * 0.36 - d * H * 0.19, 6 * k, d * H * 0.42); } // the thwarts
  g.strokeStyle = "#e8dcc8"; g.lineWidth = 3 * k; g.beginPath(); g.moveTo(...bow); g.quadraticCurveTo(W * 0.5, H * 0.62, ...stern); g.stroke(); // the gunwale
  g.strokeStyle = "rgba(255,255,255,0.35)"; g.lineWidth = 2 * k; g.beginPath(); g.moveTo(W * 0.06, H * 0.34); g.quadraticCurveTo(W * 0.5, H * 0.12, W * 0.94, H * 0.34); g.stroke(); // the far gunwale
  g.strokeStyle = "#c9a26a"; g.lineWidth = 3.5 * k; g.beginPath(); g.moveTo(W * 0.28, H * 0.08); g.lineTo(W * 0.62, H * 0.5); g.stroke(); // the paddle, lying across
  g.fillStyle = "#c9a26a"; g.beginPath(); g.ellipse(W * 0.66, H * 0.55, 9 * k, 5 * k, 0.85, 0, Math.PI * 2); g.fill();
  const drift = g.createLinearGradient(0, H * 0.7, 0, H); drift.addColorStop(0, "rgba(238,242,248,0)"); drift.addColorStop(0.35, "#eef2f8"); drift.addColorStop(1, "#dfe6f0");
  g.fillStyle = drift; g.beginPath(); g.ellipse(W * 0.5, H * 0.93, W * 0.5, H * 0.14, 0, Math.PI, Math.PI * 2); g.fill(); // snow drifted against the hull
}
/** The snowy shore under the viewer's feet: a flat quad, the water side (u → 1) fading out along an uneven edge with a rim of ice. */
function auroraShore(THREE, W, H) {
  const r = koiRng(4242), f = auroraRidge(9);
  const tex = canvasTexture(THREE, W, H, (g) => {
    const grad = g.createLinearGradient(0, 0, W, 0);
    grad.addColorStop(0, "#f0f4fa"); grad.addColorStop(1, "#d9e2ef");
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    for (let i = 0; i < 60; i++) { const gr = g.createRadialGradient(0, 0, 0, 0, 0, 1); g.save(); g.translate(r(0, W), r(0, H)); g.scale(r(30, 90) * (W / 1024), r(12, 30) * (W / 1024)); gr.addColorStop(0, "rgba(150,170,200,0.28)"); gr.addColorStop(1, "rgba(150,170,200,0)"); g.fillStyle = gr; g.beginPath(); g.arc(0, 0, 1, 0, Math.PI * 2); g.fill(); g.restore(); } // drifts and hollows
    for (let i = 0; i < 9; i++) { const x = r(0, W * 0.7), y = r(0, H), rad = r(8, 22) * (W / 1024); g.fillStyle = "#5a6272"; g.beginPath(); g.ellipse(x, y, rad, rad * 0.6, r(0, 3), 0, Math.PI * 2); g.fill(); g.fillStyle = "#eef2f8"; g.beginPath(); g.ellipse(x, y - rad * 0.3, rad * 0.9, rad * 0.32, 0, 0, Math.PI * 2); g.fill(); } // rocks capped with snow
    g.globalCompositeOperation = "destination-out"; // the water's edge, uneven
    g.beginPath(); g.moveTo(W, 0);
    for (let y = 0; y <= H; y += 4) g.lineTo(W * (0.78 + 0.14 * f((y / H) * 6)), y);
    g.lineTo(W, H); g.closePath(); g.fill();
    g.globalCompositeOperation = "source-over";
    g.strokeStyle = "rgba(210,228,245,0.9)"; g.lineWidth = 6 * (W / 1024); g.beginPath(); // a rim of ice along the edge
    for (let y = 0; y <= H; y += 4) g.lineTo(W * (0.78 + 0.14 * f((y / H) * 6)) - 2, y);
    g.stroke();
  });
  return tex;
}
function northernlights(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(6301);
  const EYE = 1.6, PITCH = 0.14; // standing on the shore, looking up at the sky
  camera.fov = 52; camera.near = 0.1; camera.far = 6000;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  let TAN = Math.tan((camera.fov * Math.PI) / 360);
  const halfW = (dist) => dist * TAN * camera.aspect;
  const time = { value: 0 };
  const noise = keep(lhNoise(THREE)), glow = keep(glowTexture(THREE)), mist = keep(inkMist(THREE));
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  const accent = new THREE.Color();
  // everything above the water is in `world`: drawn twice, the second time mirrored into the lake. Double-sided (the mirror turns faces round), one pass each.
  const shader = (vs, fs, uniforms, extra = {}) => keep(new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, ...extra }));
  const plain = (opts) => keep(new THREE.MeshBasicMaterial({ transparent: true, depthTest: false, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: false, ...opts }));
  const world = new THREE.Group();
  scene.add(world);
  const layer = (mat, x, y, z, w, h, order, parent = world) => { const m = new THREE.Mesh(quad, mat); m.position.set(x, y, z); m.scale.set(w, h, 1); m.renderOrder = order; m.frustumCulled = false; parent.add(m); return m; };

  /* --- the sky with the aurora, and the stars --- */
  const skyUni = {
    uNoise: { value: noise }, uTime: time, uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(-0.5, 0.07, -0.86).normalize() }, uSunColor: { value: new THREE.Color("#ffe2b0") }, uSun: { value: 0 }, uAurora: { value: 1 },
  };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(4200, 40, 24)), shader(LANTERN_SKY_VS, AURORA_SKY_FS, skyUni, { transparent: false, depthTest: false }));
  sky.position.set(0, EYE, 0); sky.renderOrder = -10; sky.frustumCulled = false;
  world.add(sky);
  const NSTAR = preview ? 400 : 1300, starPos = new Float32Array(NSTAR * 3);
  for (let i = 0; i < NSTAR; i++) { const a = r(0, 6.283), e = Math.asin(r(0.03, 1)); starPos.set([Math.cos(a) * Math.cos(e) * 3900, EYE + Math.sin(e) * 3900, Math.sin(a) * Math.cos(e) * 3900], i * 3); }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = keep(new THREE.PointsMaterial({ color: 0xe8eeff, size: preview ? 1.1 : 1.6, sizeAttenuation: false, transparent: true, depthWrite: false, depthTest: false }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9; stars.frustumCulled = false;
  world.add(stars);

  /* --- the far shore: snowy hills, a treeline, mist on the water by day --- */
  const hillMat = plain({ map: keep(auroraHills(THREE, preview ? 1024 : 2048, preview ? 128 : 256)) });
  layer(hillMat, 0, 150, -1600, 5200, 300, 1);
  const treeMat = plain({ map: keep(auroraTreeline(THREE, preview ? 1024 : 2048, preview ? 96 : 192)) });
  layer(treeMat, 0, 45, -900, 3000, 90, 2);
  const mistMat = plain({ map: mist });
  const mists = [[-700, 3, 2600, 20], [-420, 2, 1600, 12], [-220, 1.2, 900, 7]].map(([z, y, w, h], i) => ({ m: layer(mistMat, r(-100, 100), y, z, w, h, 3), speed: [1.0, 0.6, 0.4][i] }));

  /* --- the near shore on the left: snow underfoot, the cabin with its lit windows and smoking chimney, pines, the canoe --- */
  const shoreGeo = keep(new THREE.PlaneGeometry(1, 1));
  shoreGeo.rotateX(-Math.PI / 2); // lying flat: local x → world x, local y → towards −z
  const shoreMat = plain({ map: keep(auroraShore(THREE, preview ? 512 : 1024, preview ? 256 : 512)) });
  const shore = new THREE.Mesh(shoreGeo, shoreMat);
  shore.renderOrder = 4; shore.frustumCulled = false;
  world.add(shore);
  const CW = 512, CH = 320, cabinCanvas = document.createElement("canvas");
  cabinCanvas.width = CW; cabinCanvas.height = CH;
  const cabinTex = keep(new THREE.CanvasTexture(cabinCanvas));
  cabinTex.colorSpace = THREE.SRGBColorSpace;
  const cabinMat = plain({ map: cabinTex });
  const cabin = layer(cabinMat, 0, 5, -60, 16, 10, 6);
  const KW = 256, KH = 96, canoeCanvas = document.createElement("canvas");
  canoeCanvas.width = KW; canoeCanvas.height = KH;
  const canoeTex = keep(new THREE.CanvasTexture(canoeCanvas));
  canoeTex.colorSpace = THREE.SRGBColorSpace;
  const canoeMat = plain({ map: canoeTex });
  const canoe = layer(canoeMat, 0, 0.8, -30, 4.6, 1.72, 8);
  const pineMats = [1, 2, 3].map((seed) => plain({ map: keep(auroraPine(THREE, preview ? 256 : 512, preview ? 384 : 768, seed * 77)) }));
  const PINES = [[-0.84, 46, 15, 0], [-0.56, 78, 19, 1], [-0.72, 118, 22, 2], [-0.36, 150, 17, 0], [-0.98, 92, 20, 1]]; // fraction of the half-width, distance, height, which painting
  const pines = PINES.map(([fx, z, h, k]) => ({ m: layer(pineMats[k], 0, h / 2, -z, h * 0.667, h, 5), fx, z }));
  const windowGlowMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffb060, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false }));
  const windowGlows = [0.2, 0.66].map((u) => { const s = new THREE.Sprite(windowGlowMat); s.renderOrder = 7; world.add(s); return { s, u }; });
  const smokeMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xc8d0dc, depthWrite: false, depthTest: false, transparent: true, fog: false, opacity: 0.3 }));
  const puffs = Array.from({ length: 5 }, () => { const s = new THREE.Sprite(smokeMat); s.renderOrder = 7; world.add(s); return { s, age: 9, life: 5 }; });
  let puffT = 0;

  /* --- the lake: the mirrored world, broken by ripples --- */
  const reflectRT = keep(new THREE.WebGLRenderTarget(4, 4, { samples: preview ? 0 : 4 }));
  reflectRT.texture.colorSpace = THREE.SRGBColorSpace;
  const lakeUni = { tReflect: { value: reflectRT.texture }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: time, uDeep: { value: new THREE.Color() }, uSheen: { value: new THREE.Color() } };
  const lakeGeo = keep(new THREE.PlaneGeometry(8000, 8000));
  lakeGeo.rotateX(-Math.PI / 2);
  const lake = new THREE.Mesh(lakeGeo, keep(new THREE.ShaderMaterial({ uniforms: lakeUni, vertexShader: LANTERN_LAKE_VS, fragmentShader: LANTERN_LAKE_FS })));
  lake.position.z = -3900; lake.renderOrder = -5; lake.frustumCulled = false;
  scene.add(lake);
  const RS = 0.5, buf = new THREE.Vector2();
  let reflecting = false;
  sky.onBeforeRender = (renderer, sc, cam) => {
    if (reflecting) return;
    reflecting = true;
    renderer.getDrawingBufferSize(buf);
    lakeUni.uRes.value.copy(buf);
    const w = Math.max(2, Math.round(buf.x * RS)), h = Math.max(2, Math.round(buf.y * RS));
    if (reflectRT.width !== w || reflectRT.height !== h) reflectRT.setSize(w, h);
    world.scale.y = -1; lake.visible = false; snow.visible = false;
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(reflectRT);
    renderer.render(sc, cam);
    renderer.setRenderTarget(before);
    world.scale.y = 1; lake.visible = true; snow.visible = snowOn;
    world.updateMatrixWorld(true);
    reflecting = false;
  };

  /* --- snow falling round the viewer (not in the reflection) --- */
  const NSNOW = preview ? 500 : 1600, snowGeo = keep(new THREE.BufferGeometry());
  snowGeo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(NSNOW * 3), 3));
  snowGeo.setAttribute("aSeed", new THREE.BufferAttribute(Float32Array.from({ length: NSNOW * 4 }, () => r()), 4));
  const snowUni = { uTime: time, uBox: { value: new THREE.Vector3(70, 16, 46) }, uBoxC: { value: new THREE.Vector3(0, 6, -20) }, uPx: { value: 600 }, uSize: { value: 0.09 }, uColor: { value: new THREE.Color("#ffffff") }, uAlpha: { value: 0.8 } };
  const snow = new THREE.Points(snowGeo, keep(new THREE.ShaderMaterial({ uniforms: snowUni, vertexShader: AURORA_SNOW_VS, fragmentShader: AURORA_SNOW_FS, transparent: true, depthWrite: false })));
  snow.frustumCulled = false; snow.renderOrder = 20;
  scene.add(snow);
  let snowOn = true;
  snow.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); snowUni.uPx.value = buf.y / (2 * TAN); };

  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    accent.set(p.accent);
    auroraCabinDraw(cabinCanvas.getContext("2d"), CW, CH, p.accent, d); cabinTex.needsUpdate = true;
    auroraCanoeDraw(canoeCanvas.getContext("2d"), KW, KH, p.accent); canoeTex.needsUpdate = true;
    skyUni.uZenith.value.set(d ? "#02051a" : "#6f9ed8"); skyUni.uMid.value.set(d ? "#071033" : "#c6d6ea"); skyUni.uHorizon.value.set(d ? "#142446" : "#f6dcb8");
    skyUni.uGlow.value.set(d ? "#1e2c52" : "#ffd9a0").multiplyScalar(d ? 0.4 : 0.5); skyUni.uSun.value = d ? 0 : 1; skyUni.uAurora.value = d ? 1 : 0;
    starMat.opacity = d ? 0.9 : 0;
    hillMat.color.set(d ? "#5c6d94" : "#ffffff"); treeMat.color.set(d ? "#7d8fb4" : "#ffffff");
    mistMat.color.set(d ? "#2a3860" : "#ffffff"); mistMat.opacity = d ? 0.18 : 0.6;
    shoreMat.color.set(d ? "#8593b8" : "#ffffff"); cabinMat.color.set(d ? "#aab4cc" : "#ffffff"); canoeMat.color.set(d ? "#aab4cc" : "#ffffff");
    for (const m of pineMats) m.color.set(d ? "#8e9dc0" : "#ffffff");
    windowGlowMat.opacity = d ? 0.75 : 0; smokeMat.color.set(d ? "#8e98b0" : "#e8ecf2"); smokeMat.opacity = d ? 0.22 : 0.3;
    lakeUni.uDeep.value.set(d ? "#02040c" : "#4f6f8c"); lakeUni.uSheen.value.set(d ? "#9fe8c0" : "#ffffff").multiplyScalar(d ? 0.22 : 0.5);
    snowUni.uAlpha.value = d ? 0.35 : 0.85; snowOn = true; snow.visible = true;
  }
  applyPalette(pal);

  const look = new THREE.Vector3();
  function layout() {
    const A = camera.aspect || 1, fov = A >= 1 ? 52 : 52 + (1 - A) * 24; // a phone held upright sees more of the sky
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); TAN = Math.tan((fov * Math.PI) / 360); }
    const hw60 = halfW(60);
    shore.position.set(-hw60 * 0.62 - 1, 0.03, -56); shore.scale.set(hw60 * 1.5 + 4, 1, 126); // the snow underfoot, from the left edge to the water
    cabin.position.set(-hw60 * (A >= 1 ? 0.62 : 0.5), 5, -60);
    windowGlows.forEach(({ s, u }) => { s.position.set(cabin.position.x + (u + 0.07 - 0.5) * 16, 5 + (0.5 - 0.58) * 10, -59.9); s.scale.set(4.5, 4.5, 1); });
    canoe.position.set(-halfW(30) * (A >= 1 ? 0.3 : 0.22), 0.8, -30);
    for (const p of pines) p.m.position.x = p.fx * halfW(p.z) * (A >= 1 ? 1 : 0.8);
  }
  function frame(dt, t) {
    time.value = t;
    layout();
    const cx = Math.sin(t * 0.02) * 0.4;
    camera.position.set(cx, EYE + Math.sin(t * 0.045) * 0.04, 0);
    camera.lookAt(look.set(cx * 0.3, EYE + Math.tan(PITCH) * 100, -100));
    for (const m of mists) { m.m.position.x += m.speed * dt; if (m.m.position.x > 400) m.m.position.x = -400; }
    if ((puffT += dt) > 0.75) { // smoke from the chimney
      puffT = 0;
      const p = puffs.find((q) => q.age >= q.life) || puffs[0];
      p.age = 0; p.life = r(4, 6); p.s.position.set(cabin.position.x + (0.72 - 0.5) * 16, 5 + (0.5 - 0.08) * 10, -59.8);
    }
    for (const p of puffs) {
      if (p.age >= p.life) { p.s.scale.setScalar(0.001); continue; }
      p.age += dt; p.s.position.y += dt * 0.9; p.s.position.x += dt * 0.6;
      const f = p.age / p.life;
      p.s.scale.setScalar(1.2 + f * 4.5);
      p.s.material.opacity = Math.sin(Math.PI * f) * (pal.dark ? 0.22 : 0.3);
    }
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { return { aurora: skyUni.uAurora.value, snow: NSNOW, snowAlpha: snowUni.uAlpha.value, puffs: puffs.filter((p) => p.age < p.life).length }; }, // for checking by hand
    dispose() { disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Venice canal: palazzi on both banks mirrored in the canal, gondolas gliding under a stone bridge; golden hour, or a lamplit night ---------- */
// The facades are paintings on quads down each bank (a fine canvas for the near stretch, a coarser one further on). Their mask holds the
// window glass (g), which windows are lit at night (r) and the shutters painted in the accent colour (b). By day the sun is low over the
// rooftops ahead on the left: the right bank's upper floors catch it above the shadow of the roofs across the canal (read from uRoof).
const VENICE_FACADE_VS = /* glsl */ `
  varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
  void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }
`;
const VENICE_FACADE_FS = /* glsl */ `
  uniform sampler2D uMap; uniform sampler2D uMask; uniform sampler2D uRoof;
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uBounce; uniform vec3 uSkyRefl; uniform vec3 uAccent; uniform vec3 uWarm;
  uniform float uNight; uniform float uFlip; uniform float uHW; uniform float uRoofZ;
  uniform vec4 uLamps[VENICE_LAMPS];
  uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  varying vec2 vUv; varying vec3 vWorld; varying vec3 vN;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.04) discard;
    vec3 m = texture2D(uMask, vUv).rgb;
    vec3 base = mix(t.rgb, t.rgb * uAccent * 1.35, m.b);
    vec3 P = vec3(vWorld.x, vWorld.y * uFlip, vWorld.z), N = normalize(vN); // lit as the real facade, also in the mirrored pass
    float ndl = max(dot(N, uSunDir), 0.0), lit = 0.0;
    if (ndl > 0.0) { // the ray to the sun crosses the canal: lit only above the roofs on the other bank
      vec3 Q = P + uSunDir * (2.0 * uHW / max(abs(uSunDir.x), 1e-3));
      float roof = -Q.z < uRoofZ ? texture2D(uRoof, vec2(clamp(-Q.z / uRoofZ, 0.0, 1.0), 0.5)).r * 30.0 : 0.0;
      lit = smoothstep(roof - 0.5, roof + 0.5, Q.y);
    }
    vec3 col = base * (uAmb + uBounce * clamp(P.y / 18.0, 0.2, 1.0) + uSunCol * ndl * lit);
    col = mix(col, uSkyRefl * (0.55 + 0.45 * lit), m.g * 0.26 * (1.0 - uNight)); // window glass mirrors a little of the sky by day
    if (uNight > 0.0) {
      float pool = 0.0;
      for (int i = 0; i < VENICE_LAMPS; i++) { vec3 d = P - uLamps[i].xyz; pool += uLamps[i].w / (1.0 + dot(d, d) * 0.45); }
      col += (base * pool * 1.3 + m.r * 1.6) * uWarm * uNight;
    }
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, distance(vWorld, cameraPosition)));
    gl_FragColor = vec4(col, t.a);
    #include <colorspace_fragment>
  }
`;
// the canal: the mirrored world broken by wavelets that run across it and stretch the lights into streaks; jade green where you look down into it
const VENICE_WATER_FS = /* glsl */ `
  uniform sampler2D tReflect; uniform sampler2D uNoise; uniform vec2 uRes; uniform float uTime; uniform vec3 uDeep; uniform vec3 uSheen;
  varying vec3 vWorld;
  void main() {
    vec2 uv = gl_FragCoord.xy / uRes;
    vec3 toCam = cameraPosition - vWorld;
    float dist = length(toCam.xz);
    float near = clamp(20.0 / (dist + 20.0), 0.05, 1.0);
    vec2 w = vWorld.xz;
    float a = texture2D(uNoise, w * vec2(0.05, 0.17) + vec2(uTime * 0.01, uTime * 0.05)).r;
    float b = texture2D(uNoise, w * vec2(0.13, 0.36) - vec2(uTime * 0.02, -uTime * 0.07)).g;
    vec2 off = vec2((b - 0.5) * 0.012, (a - 0.5) * 0.07 + (b - 0.5) * 0.04) * near;
    vec3 refl = texture2D(tReflect, clamp(uv + off, 0.001, 0.999)).rgb;
    float grazing = 1.0 - clamp(normalize(toCam).y, 0.0, 1.0);
    vec3 col = mix(uDeep, refl, 0.2 + 0.8 * pow(grazing, 4.0));
    col += uSheen * pow(a, 6.0) * near * 0.35;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// the far shore at the canal's end, as masks: r = silhouette, g = windows lit at night, b = the rim the low sun lights
const VENICE_FAR_FS = /* glsl */ `
  uniform sampler2D uMask; uniform vec3 uBody; uniform vec3 uRim; uniform vec3 uWin; uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec3 m = texture2D(uMask, vUv).rgb;
    if (m.r < 0.02) discard;
    vec3 col = uBody * (0.9 + 0.1 * vUv.y) + uRim * m.b + uWin * m.g * (0.85 + 0.15 * sin(uTime * 1.7 + vUv.x * 310.0));
    gl_FragColor = vec4(col, m.r);
    #include <colorspace_fragment>
  }
`;
// mooring poles: white with a spiral stripe in the instance colour, dark and slimy where the water reaches
const VENICE_POLE_VS = /* glsl */ `
  varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec3 vCol;
  void main() {
    vLocal = position;
    vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
    vWorld = w.xyz; vN = normalize(mat3(modelMatrix * instanceMatrix) * normal);
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const VENICE_POLE_FS = /* glsl */ `
  uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform float uFlip; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  varying vec3 vWorld; varying vec3 vLocal; varying vec3 vN; varying vec3 vCol;
  void main() {
    float y = vWorld.y * uFlip, ang = atan(vLocal.z, vLocal.x) / 6.2831853;
    float stripe = step(0.5, fract(y * 1.25 + ang));
    vec3 base = mix(vec3(0.9, 0.88, 0.84), vCol, stripe);
    base = mix(vec3(0.1, 0.14, 0.11), base, smoothstep(0.3, 0.95, y));
    vec3 N = normalize(vN);
    vec3 col = base * (uAmb + uSunCol * max(dot(N, uSunDir), 0.0) * 0.8);
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, distance(vWorld, cameraPosition)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// laundry on the lines across the canal: each garment hangs from its top edge and sways
const VENICE_CLOTH_VS = /* glsl */ `
  uniform float uTime;
  attribute vec2 aCloth; // atlas cell, sway phase
  varying vec2 vUv; varying vec3 vCol; varying vec3 vWorld;
  void main() {
    vec3 p = position; // y from -1 (hem) to 0 (the line)
    float sw = (0.16 * sin(uTime * 1.3 + aCloth.y) + 0.07 * sin(uTime * 2.9 + aCloth.y * 1.7)) * -p.y;
    p.z += sw; p.x += 0.035 * sin(uTime * 2.1 + aCloth.y + p.y * 3.0) * -p.y;
    vec4 w = modelMatrix * instanceMatrix * vec4(p, 1.0);
    vWorld = w.xyz;
    vUv = (uv + vec2(mod(aCloth.x, 4.0), 1.0 - floor(aCloth.x / 4.0))) * vec2(0.25, 0.5);
    #ifdef USE_INSTANCING_COLOR
      vCol = instanceColor;
    #else
      vCol = vec3(1.0);
    #endif
    gl_Position = projectionMatrix * viewMatrix * w;
  }
`;
const VENICE_CLOTH_FS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uLight; uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  varying vec2 vUv; varying vec3 vCol; varying vec3 vWorld;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.5) discard;
    vec3 col = t.rgb * vCol * uLight;
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, distance(vWorld, cameraPosition)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// the café's awning: stripes in the accent colour, a scalloped valance
const VENICE_AWNING_VS = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const VENICE_AWNING_FS = /* glsl */ `
  uniform vec3 uAccent; uniform vec3 uLight; uniform vec3 uUnder; uniform float uStripes;
  varying vec2 vUv;
  void main() {
    float f = fract(vUv.x * uStripes), s = step(0.5, f);
    if (vUv.y < 0.2) { float sc = abs(f - 0.5) * 2.0; if (vUv.y < 0.11 * (1.0 - sqrt(max(0.0, 1.0 - sc * sc)))) discard; } // the scallops along the valance: lowest in the middle of each
    vec3 base = mix(vec3(0.95, 0.92, 0.85), uAccent, s);
    gl_FragColor = vec4(base * (gl_FrontFacing ? uLight : uUnder), 1.0);
    #include <colorspace_fragment>
  }
`;
// the lanterns' halos at night, all in one draw: camera-facing quads, each breathing a little
const VENICE_GLOW_VS = /* glsl */ `
  uniform float uTime;
  attribute vec4 aGlow; // position, size
  varying vec2 vUv;
  void main() {
    vUv = uv;
    vec4 mv = modelViewMatrix * vec4(aGlow.xyz, 1.0);
    mv.xy += position.xy * aGlow.w * (0.94 + 0.06 * sin(uTime * 6.1 + aGlow.x * 3.7 + aGlow.z) * sin(uTime * 2.3 + aGlow.z * 1.3));
    gl_Position = projectionMatrix * mv;
  }
`;
const VENICE_GLOW_FS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uColor;
  varying vec2 vUv;
  void main() {
    gl_FragColor = vec4(texture2D(uMap, vUv).rgb * uColor, 1.0);
    #include <colorspace_fragment>
  }
`;
// the palazzi's near side walls, where a house rises above the one in front of it: plaster in the house's colour, damp streaks,
// the coppi along the pitched gable and their shadow; lit like the facades that face away from the sun
const VENICE_SIDE_VS = /* glsl */ `
  attribute vec3 aSide; // metres below the wall's top edge, a seed, metres from the facade
  attribute vec3 aTint;
  varying vec3 vWorld; varying vec3 vSide; varying vec3 vTint;
  void main() { vSide = aSide; vTint = aTint; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const VENICE_SIDE_FS = /* glsl */ `
  uniform sampler2D uNoise; uniform vec3 uAmb; uniform vec3 uBounce; uniform vec3 uTile; uniform float uFlip;
  uniform vec3 uFog; uniform float uFogNear; uniform float uFogFar;
  varying vec3 vWorld; varying vec3 vSide; varying vec3 vTint;
  void main() {
    float y = vWorld.y * uFlip, u = vSide.z + vSide.y;
    float blot = texture2D(uNoise, vec2(u, y) * 0.07).r, grain = texture2D(uNoise, vec2(u, y) * 0.9).g;
    float streak = texture2D(uNoise, vec2(u * 0.3, y * 0.015 + vSide.y)).g; // damp running down from the gable
    vec3 base = vTint * (0.78 + 0.4 * blot + 0.1 * grain) * (1.0 - 0.3 * smoothstep(0.5, 0.72, streak) * (1.0 - smoothstep(2.0, 9.0, vSide.x)));
    if (vSide.x < 0.3) base = uTile * (0.78 + 0.3 * step(0.5, fract(vSide.z * 3.6))); // the ends of the coppi along the gable
    else base *= 1.0 - 0.45 * exp(-(vSide.x - 0.3) * 5.0); // their shadow on the wall
    vec3 col = base * (uAmb + uBounce * clamp(y / 18.0, 0.2, 1.0));
    col = mix(col, uFog, smoothstep(uFogNear, uFogFar, distance(vWorld, cameraPosition)));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
const VENICE_WALLS = ["#d9a066", "#c8694e", "#e3a58a", "#d98f8f", "#e9d7b3", "#b8563f", "#d88a4a", "#e8c67e", "#c98d8d", "#d6b9a0", "#a9564a", "#dcae84"];
const VENICE_SHUTTERS = ["#3d6a4d", "#2f5a44", "#56704f", "#6b4a33", "#7d8a70", "#3d6a4d"];
/** A row of palazzi along one bank, near to far (z decreasing): width, height, wall colour, how far it stands forward. */
function veniceRow(r, zNear, zFar) {
  const out = [];
  for (let z = zNear; z > zFar + 3; ) {
    const w = Math.min(z - zFar, r(7.5, 15));
    out.push({ z0: z, z1: z - w, h: r(12.5, 21.5), color: VENICE_WALLS[(r() * VENICE_WALLS.length) | 0], off: r() < 0.3 ? r(0.3, 0.9) : 0, seed: (r() * 1e6) | 0 });
    z -= w;
  }
  return out;
}
/** Two small tiles: mottled plaster (an overlay, wraps) and brick. */
function veniceTiles() {
  const plaster = document.createElement("canvas");
  plaster.width = plaster.height = 256;
  const pg = plaster.getContext("2d"), r = koiRng(55);
  for (let i = 0; i < 150; i++) { // soft blotches, lighter and darker, drawn wrapped so the tile joins
    const x = r(0, 256), y = r(0, 256), rad = r(8, 46), dark = r() < 0.55, a = r(0.04, 0.15);
    for (const ox of [-256, 0, 256]) for (const oy of [-256, 0, 256]) {
      if (x + ox < -rad || x + ox > 256 + rad || y + oy < -rad || y + oy > 256 + rad) continue;
      const gr = pg.createRadialGradient(x + ox, y + oy, 0, x + ox, y + oy, rad);
      gr.addColorStop(0, dark ? `rgba(60,40,30,${a})` : `rgba(255,245,230,${a})`); gr.addColorStop(1, "rgba(0,0,0,0)");
      pg.fillStyle = gr; pg.fillRect(x + ox - rad, y + oy - rad, rad * 2, rad * 2);
    }
  }
  for (let i = 0; i < 1400; i++) { pg.fillStyle = `rgba(${r() < 0.5 ? "70,50,40" : "255,250,240"},${r(0.05, 0.14)})`; pg.fillRect(r(0, 256), r(0, 256), r(1, 2.5), r(1, 2.5)); } // grain
  const brick = document.createElement("canvas");
  brick.width = 64; brick.height = 32;
  const bg = brick.getContext("2d");
  bg.fillStyle = "#8a5646"; bg.fillRect(0, 0, 64, 32);
  for (let row = 0; row < 4; row++) for (let k = -1; k < 3; k++) { bg.fillStyle = ["#a45a42", "#b06548", "#96503c", "#b8704f"][(row + k + 4) % 4]; bg.fillRect(k * 32 + (row % 2 ? 16 : 0) + 1, row * 8 + 1, 30, 6); }
  return { plaster, brick };
}
/** A window's outline: 0 square-headed, 1 round-arched, 2 pointed, 3 ogee (the Venetian Gothic "inflected" arch). yTop is the top of the arch. */
function veniceWinPath(g, x, yTop, w, h, style) {
  g.beginPath();
  if (!style) { g.rect(x, yTop, w, h); return; }
  const a = style === 1 ? w / 2 : style === 2 ? w * 0.75 : w * 0.95, yA = yTop + a, cx = x + w / 2;
  g.moveTo(x, yTop + h); g.lineTo(x, yA);
  if (style === 1) g.arc(cx, yA, w / 2, Math.PI, 0);
  else if (style === 2) { g.quadraticCurveTo(x, yTop + a * 0.35, cx, yTop); g.quadraticCurveTo(x + w, yTop + a * 0.35, x + w, yA); }
  else { g.bezierCurveTo(x, yTop + a * 0.4, cx - w * 0.06, yTop + a * 0.52, cx, yTop); g.bezierCurveTo(cx + w * 0.06, yTop + a * 0.52, x + w, yTop + a * 0.4, x + w, yA); }
  g.lineTo(x + w, yTop + h); g.closePath();
}
/** A slatted shutter; in the accent colour it is painted grey here and tinted in the shader (mask b). */
function venicePanel(g, mk, x, y, w, h, o) {
  g.fillStyle = o.accent ? "#d6d6d6" : o.col; g.fillRect(x, y, w, h);
  g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = Math.max(1, h * 0.012);
  for (let yy = y + h * 0.07; yy < y + h * 0.97; yy += Math.max(2, h * 0.065)) { g.beginPath(); g.moveTo(x + w * 0.12, yy); g.lineTo(x + w * 0.88, yy); g.stroke(); }
  g.strokeStyle = "rgba(0,0,0,0.38)"; g.lineWidth = Math.max(1, w * 0.07); g.strokeRect(x, y, w, h);
  mk.fillStyle = o.accent ? "rgb(0,0,255)" : "rgb(0,0,0)"; mk.fillRect(x, y, w, h);
}
/** A window box of geraniums, some stems trailing. */
function veniceFlowers(g, x, y, w, r) {
  g.fillStyle = "#7a4a30"; g.fillRect(x, y - w * 0.06, w, w * 0.1);
  for (let i = 0; i < 24; i++) { g.fillStyle = r() < 0.5 ? "#3f6b34" : "#557f3e"; g.beginPath(); g.arc(x + r(0, w), y - w * 0.07 - r(0, w * 0.16), w * r(0.03, 0.06), 0, Math.PI * 2); g.fill(); }
  const pink = r() < 0.45;
  for (let i = 0; i < 16; i++) { g.fillStyle = pink ? (r() < 0.5 ? "#e85a8a" : "#f07aa0") : (r() < 0.5 ? "#d8283a" : "#ea4a4a"); g.beginPath(); g.arc(x + r(0.05, 0.95) * w, y - w * 0.09 - r(0, w * 0.18), w * r(0.02, 0.04), 0, Math.PI * 2); g.fill(); }
  g.strokeStyle = "#4a7a3a"; g.lineWidth = Math.max(1, w * 0.02);
  for (let i = 0; i < 4; i++) { const fx = x + r(0, w); g.beginPath(); g.moveTo(fx, y); g.quadraticCurveTo(fx + r(-3, 3), y + w * 0.25, fx + r(-4, 4), y + w * r(0.25, 0.55)); g.stroke(); }
}
/** A window: stone surround and sill, glass with the sky in it, glazing bars, shutters open or shut, a rain streak below, perhaps flowers. */
function veniceWindow(g, mk, x, yTop, w, h, style, o) {
  const f = Math.max(1, w * 0.13);
  g.fillStyle = "#ece6d8"; veniceWinPath(g, x - f, yTop - f, w + 2 * f, h + f * 1.4, style); g.fill();
  const streak = g.createLinearGradient(0, yTop + h + f, 0, yTop + h + f + h * 0.9);
  streak.addColorStop(0, "rgba(40,30,25,0.14)"); streak.addColorStop(1, "rgba(40,30,25,0)");
  g.fillStyle = streak; g.fillRect(x, yTop + h + f, w, h * 0.9);
  g.fillStyle = "#e2dbcb"; g.fillRect(x - f * 1.6, yTop + h + f * 0.35, w + f * 3.2, f * 0.85);
  g.fillStyle = "rgba(0,0,0,0.24)"; g.fillRect(x - f * 1.6, yTop + h + f * 1.2, w + f * 3.2, f * 0.35);
  const gl = g.createLinearGradient(x, yTop, x + w, yTop + h);
  gl.addColorStop(0, "#44505f"); gl.addColorStop(0.5, "#29323d"); gl.addColorStop(1, "#1b222b");
  g.fillStyle = gl; veniceWinPath(g, x, yTop, w, h, style); g.fill();
  g.strokeStyle = "rgba(225,232,240,0.16)"; g.lineWidth = Math.max(1, w * 0.12); g.beginPath(); g.moveTo(x + w * 0.2, yTop + h); g.lineTo(x + w * 0.85, yTop + h * 0.35); g.stroke();
  g.strokeStyle = "#e6e0d2"; g.lineWidth = Math.max(1, w * 0.05);
  g.beginPath(); g.moveTo(x + w / 2, yTop + (style ? w * 0.35 : 0)); g.lineTo(x + w / 2, yTop + h); g.moveTo(x, yTop + h * 0.55); g.lineTo(x + w, yTop + h * 0.55); g.stroke();
  mk.fillStyle = `rgb(${Math.round(o.lit * 255)},255,0)`; veniceWinPath(mk, x, yTop, w, h, style); mk.fill();
  if (o.shutter === "open") { for (const sx of [x - f - w * 0.5, x + w + f]) venicePanel(g, mk, sx, yTop + (style ? w * 0.35 : 0), w * 0.5, h - (style ? w * 0.35 : 0), o); }
  else if (o.shutter === "closed") venicePanel(g, mk, x, yTop + (style ? w * 0.35 : 0), w, h - (style ? w * 0.35 : 0), o);
  if (o.box) veniceFlowers(g, x - f, yTop + h + f * 0.35, w + 2 * f, o.r);
}
/** A barred window on the ground floor. */
function veniceGrille(g, mk, x, y, w, h, lit) {
  g.fillStyle = "#e6dfcf"; g.fillRect(x - 0.1 * w, y - 0.1 * w, w * 1.2, h + 0.2 * w);
  g.fillStyle = "#1e2229"; g.fillRect(x, y, w, h);
  g.strokeStyle = "#101010"; g.lineWidth = Math.max(1, w * 0.05);
  for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(x + (w * k) / 5, y); g.lineTo(x + (w * k) / 5, y + h); g.stroke(); }
  g.beginPath(); g.moveTo(x, y + h / 2); g.lineTo(x + w, y + h / 2); g.stroke();
  mk.fillStyle = `rgb(${Math.round(lit * 170)},255,0)`; mk.fillRect(x, y, w, h);
}
/** A stone balcony across the piano nobile: slab, balusters, rail, its shadow on the wall below. */
function veniceBalcony(g, x, y, w, s) {
  const h = 0.95 * s;
  g.fillStyle = "rgba(0,0,0,0.3)"; g.fillRect(x + 0.1 * s, y + 0.16 * s, w - 0.2 * s, 0.45 * s);
  g.fillStyle = "#e6dfcf"; g.fillRect(x, y, w, 0.16 * s); g.fillRect(x, y - h, w, 0.12 * s);
  for (let bx = x + 0.12 * s; bx < x + w - 0.1 * s; bx += 0.24 * s) {
    g.beginPath(); g.ellipse(bx + 0.06 * s, y - h * 0.32, 0.065 * s, h * 0.26, 0, 0, Math.PI * 2); g.fill();
    g.fillRect(bx + 0.035 * s, y - h * 0.92, 0.05 * s, h * 0.92);
  }
  g.fillStyle = "rgba(0,0,0,0.2)"; g.fillRect(x, y - h + 0.12 * s, w, 0.04 * s);
}
/** A water door: a round-arched opening with steps down into the canal and a wooden gate half open. Returns its size in metres. */
function veniceWaterDoor(g, mk, cx, base, s, r) {
  const w = r(1.9, 2.5) * s, h = r(2.9, 3.4) * s, x = cx - w / 2, yTop = base - h;
  g.fillStyle = "#e4ddcf"; veniceWinPath(g, x - 0.24 * s, yTop - 0.24 * s, w + 0.48 * s, h + 0.24 * s, 1); g.fill();
  g.fillStyle = "#16120f"; veniceWinPath(g, x, yTop, w, h, 1); g.fill();
  for (let k = 0; k < 3; k++) { g.fillStyle = `rgba(210,205,190,${0.55 - k * 0.15})`; g.fillRect(x, base - (0.95 - k * 0.3) * s, w, 0.09 * s); }
  g.fillStyle = "#3a2a1c"; g.fillRect(x + w * 0.62, yTop + w * 0.5, w * 0.38, h - w * 0.5);
  g.strokeStyle = "rgba(0,0,0,0.45)"; g.lineWidth = Math.max(1, 0.03 * s);
  for (let k = 1; k < 5; k++) { g.beginPath(); g.moveTo(x + w * 0.62 + (w * 0.38 * k) / 5, yTop + w * 0.5); g.lineTo(x + w * 0.62 + (w * 0.38 * k) / 5, base); g.stroke(); }
  if (r() < 0.35) { mk.fillStyle = "rgb(90,0,0)"; veniceWinPath(mk, x, yTop, w * 0.62, h, 1); mk.fill(); } // a light somewhere inside
  return { w: w / s, h: h / s };
}
/** An iron wall lantern on its bracket; lit at night through the mask. */
function veniceLantern(g, mk, x, y, s) {
  g.strokeStyle = "#1c1c1e"; g.fillStyle = "#1c1c1e"; g.lineWidth = Math.max(1, 0.05 * s);
  g.fillRect(x - 0.1 * s, y - 0.75 * s, 0.2 * s, 0.1 * s);
  g.beginPath(); g.moveTo(x, y - 0.65 * s); g.lineTo(x, y - 0.36 * s); g.stroke();
  g.beginPath(); g.arc(x + 0.1 * s, y - 0.55 * s, 0.1 * s, Math.PI * 0.5, Math.PI * 1.5); g.stroke();
  g.beginPath(); g.moveTo(x - 0.17 * s, y - 0.24 * s); g.lineTo(x + 0.17 * s, y - 0.24 * s); g.lineTo(x, y - 0.38 * s); g.closePath(); g.fill();
  g.fillStyle = "#efe4c4"; g.fillRect(x - 0.12 * s, y - 0.24 * s, 0.24 * s, 0.36 * s);
  g.strokeRect(x - 0.12 * s, y - 0.24 * s, 0.24 * s, 0.36 * s);
  g.fillStyle = "#1c1c1e"; g.fillRect(x - 0.14 * s, y + 0.12 * s, 0.28 * s, 0.05 * s);
  mk.fillStyle = "rgb(255,0,0)"; mk.fillRect(x - 0.12 * s, y - 0.24 * s, 0.24 * s, 0.36 * s);
}
/** The cornice and the band of roof tiles above it (the chimneys are solid, on the roofs: see veniceBlocks). */
function veniceRoof(g, X0, X1, top, s, r) {
  g.fillStyle = "rgba(0,0,0,0.34)"; g.fillRect(X0, top + 0.36 * s, X1 - X0, 0.2 * s);
  g.fillStyle = "#e8e0cf"; g.fillRect(X0 - 0.15 * s, top, X1 - X0 + 0.3 * s, 0.4 * s);
  g.fillStyle = "rgba(0,0,0,0.18)"; for (let x = X0; x < X1; x += 0.3 * s) g.fillRect(x, top + 0.26 * s, 0.14 * s, 0.1 * s);
  g.fillStyle = "#a9543a"; g.fillRect(X0 - 0.2 * s, top - 0.45 * s, X1 - X0 + 0.4 * s, 0.45 * s);
  g.fillStyle = "rgba(255,205,165,0.22)"; for (let x = X0 - 0.2 * s; x < X1 + 0.2 * s; x += 0.22 * s) g.fillRect(x, top - 0.45 * s, 0.08 * s, 0.45 * s);
}
/** The café's ground floor behind the walkway: arched glazed fronts (lit at night) and a signboard, lettered to read from the canal. */
function veniceShopFront(g, mk, X0, X1, base, s, mirrorText, addLamp) {
  const Y = (m) => base - m * s, W = X1 - X0, n = Math.max(1, Math.floor(W / s / 3.6)), sp = W / n;
  g.fillStyle = "#d9d2c3"; g.fillRect(X0, Y(0.9), W, 0.9 * s);
  for (let i = 0; i < n; i++) {
    const cx = X0 + sp * (i + 0.5), w = 2.3 * s, h = 2.75 * s, x = cx - w / 2, yTop = Y(0.55) - h;
    g.fillStyle = "#e6dfcf"; veniceWinPath(g, x - 0.22 * s, yTop - 0.22 * s, w + 0.44 * s, h + 0.22 * s, 1); g.fill();
    const gl = g.createLinearGradient(0, yTop, 0, yTop + h); gl.addColorStop(0, "#3d3631"); gl.addColorStop(1, "#1f1a17");
    g.fillStyle = gl; veniceWinPath(g, x, yTop, w, h, 1); g.fill();
    g.strokeStyle = "#2c1d12"; g.lineWidth = Math.max(1, 0.07 * s);
    g.beginPath(); g.moveTo(x + w / 3, yTop + w * 0.4); g.lineTo(x + w / 3, yTop + h); g.moveTo(x + (2 * w) / 3, yTop + w * 0.4); g.lineTo(x + (2 * w) / 3, yTop + h); g.moveTo(x, yTop + h * 0.42); g.lineTo(x + w, yTop + h * 0.42); g.stroke();
    mk.fillStyle = "rgb(255,160,0)"; veniceWinPath(mk, x, yTop, w, h, 1); mk.fill();
    if (i < n - 1) { const lx = X0 + sp * (i + 1); veniceLantern(g, mk, lx, Y(3.3), s); addLamp(lx, 3.25); }
  }
  const bx = X0 + sp * 0.5, bw = 2.6 * s, bh = 0.5 * s, by = Y(3.85);
  g.fillStyle = "#1f4a36"; g.fillRect(bx - bw / 2, by, bw, bh);
  g.strokeStyle = "#caa24a"; g.lineWidth = Math.max(1, 0.04 * s); g.strokeRect(bx - bw / 2 + 0.06 * s, by + 0.06 * s, bw - 0.12 * s, bh - 0.12 * s);
  g.save(); g.translate(bx, by + bh / 2); if (mirrorText) g.scale(-1, 1);
  g.fillStyle = "#ecc96a"; g.font = `italic ${Math.max(6, Math.round(0.33 * s))}px Georgia, "Times New Roman", serif`; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("Caffè", 0, 0);
  g.restore();
}
/** One palazzo's facade, from the waterline to the chimneys. */
function veniceFacade(g, mk, X0, X1, base, s, b, pats, addLamp, addDoor, mirrorText) {
  const r = koiRng(b.seed), W = X1 - X0, wm = W / s, top = base - b.h * s, Y = (m) => base - m * s;
  const lit = () => (r() < 0.42 ? r(0.55, 1) : 0), col = VENICE_SHUTTERS[(r() * VENICE_SHUTTERS.length) | 0];
  const opts = () => { const q = r(); return { lit: lit(), shutter: q < 0.55 ? "open" : q < 0.75 ? "closed" : null, col, accent: r() < 0.16, box: r() < 0.3, r }; };
  g.save(); g.beginPath(); g.rect(X0, top, W, base - top); g.clip();
  g.fillStyle = b.color; g.fillRect(X0, top, W, base - top);
  g.fillStyle = pats.plaster; g.fillRect(X0, top, W, base - top);
  for (let k = 0, n = 1 + ((r() * 3.5) | 0); k < n; k++) { // plaster fallen away, the brick showing
    const cx = X0 + r(0.08, 0.92) * W, cy = Y(r(1.8, b.h - 1.5)), rx = r(0.5, 1.8) * s, ry = r(0.35, 1.2) * s, ph = r(0, 6.28), n = 22;
    const blob = () => { g.beginPath(); for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2, k = 0.72 + 0.2 * Math.sin(a * 3 + ph) + 0.12 * Math.sin(a * 7 + ph * 2) + r(-0.06, 0.06); g.lineTo(cx + Math.cos(a) * rx * k, cy + Math.sin(a) * ry * k); } g.closePath(); }; // a ragged edge, not an ellipse
    g.save(); blob(); g.clip(); g.fillStyle = pats.brick; g.fillRect(cx - rx, cy - ry, rx * 2, ry * 2); g.restore();
    g.strokeStyle = "rgba(90,60,45,0.3)"; g.lineWidth = Math.max(1, s * 0.04); blob(); g.stroke();
  }
  for (const hh of [4.4, 8.0]) if (hh < b.h - 1) { g.fillStyle = "rgba(236,230,216,0.9)"; g.fillRect(X0, Y(hh), W, 0.16 * s); g.fillStyle = "rgba(0,0,0,0.16)"; g.fillRect(X0, Y(hh) + 0.16 * s, W, 0.06 * s); } // string courses
  if (!b.shop) { // damp rising from the water, the Istrian stone plinth, algae at the waterline
    const damp = g.createLinearGradient(0, Y(2.6), 0, base); damp.addColorStop(0, "rgba(50,60,48,0)"); damp.addColorStop(0.55, "rgba(50,60,48,0.3)"); damp.addColorStop(1, "rgba(28,38,30,0.75)");
    g.fillStyle = damp; g.fillRect(X0, Y(2.6), W, 2.6 * s);
    g.fillStyle = "#dcd6c8"; g.fillRect(X0, Y(1.35), W, 0.42 * s);
    g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(X0, Y(0.93), W, 0.05 * s);
    const tide = g.createLinearGradient(0, Y(1.0), 0, Y(0.45)); tide.addColorStop(0, "rgba(58,76,50,0)"); tide.addColorStop(1, "rgba(48,66,44,0.5)"); // the green tide line
    g.fillStyle = tide; g.fillRect(X0, Y(1.0), W, 0.55 * s);
    g.fillStyle = "#1f2b24"; g.beginPath(); g.moveTo(X0, base); // algae at the waterline: a level band, its top edge only a little ragged
    for (let x = X0; x <= X1 + s * 0.2; x += s * 0.2) g.lineTo(x, Y(0.46 + 0.04 * Math.sin((x / s) * 2.3) + r(-0.025, 0.025)));
    g.lineTo(X1, base); g.closePath(); g.fill();
  }
  g.restore();
  if (b.shop) veniceShopFront(g, mk, X0, X1, base, s, mirrorText, addLamp);
  else {
    const dx = X0 + W * r(0.3, 0.7), door = veniceWaterDoor(g, mk, dx, base, s, r);
    addDoor(dx);
    const lx = dx + (door.w / 2 + 0.75) * s * (r() < 0.5 ? -1 : 1);
    veniceLantern(g, mk, lx, Y(door.h + 0.3), s); addLamp(lx, door.h + 0.25);
    for (const gx of [X0 + W * 0.14, X1 - W * 0.14]) if (Math.abs(gx - dx) > (door.w / 2 + 1.2) * s) veniceGrille(g, mk, gx - 0.4 * s, Y(3.0), 0.8 * s, 1.1 * s, lit());
  }
  const sill = 5.1;
  if (wm > 8.5 && r() < 0.8) { // the piano nobile: a group of arched lights with a balcony, single windows either side
    const n = wm > 12 ? 4 + (r() < 0.4 ? 1 : 0) : 3, ww = 0.95 * s, gap = 0.3 * s, gw = n * ww + (n - 1) * gap, gx = X0 + (W - gw) / 2, st = r() < 0.55 ? 3 : 2, hh = 2.8 * s, yTop = Y(sill) - hh, L = lit();
    for (let i = 0; i < n; i++) veniceWindow(g, mk, gx + i * (ww + gap), yTop, ww, hh, st, { lit: L * r(0.8, 1), shutter: null, box: false, r });
    g.fillStyle = "#ebe5d6"; for (let i = 1; i < n; i++) g.fillRect(gx + i * (ww + gap) - gap * 0.72, yTop + ww * 0.6, gap * 0.44, hh - ww * 0.6);
    veniceBalcony(g, gx - 0.45 * s, Y(sill), gw + 0.9 * s, s);
    for (const sx of [gx - 2.0 * s, gx + gw + 1.05 * s]) if (sx > X0 + 0.6 * s && sx + ww < X1 - 0.6 * s) veniceWindow(g, mk, sx, Y(sill) - 2.2 * s, ww, 2.2 * s, st === 3 ? 1 : 2, opts());
  } else {
    const n = Math.max(2, Math.floor(wm / 2.7)), sp = W / n;
    for (let i = 0; i < n; i++) veniceWindow(g, mk, X0 + sp * (i + 0.5) - 0.5 * s, Y(sill) - 2.2 * s, 1.0 * s, 2.2 * s, r() < 0.4 ? 1 : 0, opts());
  }
  for (let fs = 8.5; fs + 2.1 < b.h - 0.7; fs += 3.2) { // the upper floors
    const n = Math.max(2, Math.floor(wm / 2.6)), sp = W / n, ww = 0.95 * s, hh = 1.8 * s, st = r() < 0.3 ? 1 : 0;
    for (let i = 0; i < n; i++) veniceWindow(g, mk, X0 + sp * (i + 0.5) - ww / 2, Y(fs) - hh, ww, hh, st, opts());
  }
  veniceRoof(g, X0, X1, top, s, r);
}
/** Paint a stretch of one bank: each palazzo in its own column of the canvas (colour + alpha above the roof) with a 4 px gutter either
 *  side holding copies of its edge columns, so texture filtering at a quad's edge only ever meets that house's own pixels (a shared
 *  boundary let a taller neighbour's edge show as a hairline in the sky); the mask at half size, laid out the same way. */
function venicePaintRow(list, s, HMAX, tiles, mirrorText) {
  const G = 4, H = Math.ceil(HMAX * s), cols = [];
  let cursor = G;
  for (const b of list) { const w = 2 * Math.max(1, Math.round(((b.z0 - b.z1) * s) / 2)); cols.push([cursor, cursor + w]); cursor += w + 2 * G; } // even: the half-size mask lines up
  const W = cursor - G, c = document.createElement("canvas"), mc = document.createElement("canvas");
  c.width = W; c.height = H; mc.width = W / 2; mc.height = Math.ceil(H / 2);
  const g = c.getContext("2d"), mk = mc.getContext("2d");
  mk.fillStyle = "#000"; mk.fillRect(0, 0, mc.width, mc.height); mk.scale(0.5, 0.5);
  const pats = { plaster: g.createPattern(tiles.plaster, "repeat"), brick: g.createPattern(tiles.brick, "repeat") };
  pats.plaster.setTransform(new DOMMatrix().scale(s / 32)); pats.brick.setTransform(new DOMMatrix().scale(Math.max(0.15, s / 115)));
  const lamps = [], doors = [];
  list.forEach((b, i) => {
    const [X0, X1] = cols[i], zAt = (x) => b.z0 - (x - X0) / s;
    for (const k of [g, mk]) { k.save(); k.beginPath(); k.rect(X0 - G, 0, X1 - X0 + 2 * G, H); k.clip(); } // a cornice's overhang stays in its own gutter
    veniceFacade(g, mk, X0, X1, H, s, b, pats, (x, h) => lamps.push({ z: zAt(x), h, b }), (x) => doors.push({ z: zAt(x), b }), mirrorText);
    g.restore(); mk.restore();
  });
  mk.setTransform(1, 0, 0, 1, 0, 0);
  for (const [X0, X1] of cols) { // the gutters: each house's first and last columns, repeated outwards
    g.drawImage(c, X0, 0, 1, H, X0 - G, 0, G, H); g.drawImage(c, X1 - 1, 0, 1, H, X1, 0, G, H);
    mk.drawImage(mc, X0 / 2, 0, 1, mc.height, X0 / 2 - G / 2, 0, G / 2, mc.height); mk.drawImage(mc, X1 / 2 - 1, 0, 1, mc.height, X1 / 2, 0, G / 2, mc.height);
  }
  return { c, mc, lamps, doors, cols };
}
/** The walkway's height across the bridge: from the quays at its ends up to the crown. */
const VENICE_DECK = (x) => 1.25 + 2.25 * Math.pow(Math.cos((Math.min(1, Math.abs(x) / 10.8) * Math.PI) / 2), 1.4);
/** The stone bridge as seen along the canal: brick spandrels, a ring of white voussoirs, the opening cut out, a balustrade, two lanterns. 21.6 × 5.6 m. */
function veniceBridge(THREE, S, tiles) {
  const W = Math.round(21.6 * S), H = Math.round(5.6 * S), c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d"), X = (m) => (m + 10.8) * S, Y = (m) => H - m * S;
  const brick = g.createPattern(tiles.brick, "repeat");
  brick.setTransform(new DOMMatrix().scale(Math.max(0.15, S / 115)));
  g.beginPath(); g.moveTo(X(-10.8), Y(0)); for (let x = -10.8; x <= 10.81; x += 0.2) g.lineTo(X(x), Y(VENICE_DECK(x))); g.lineTo(X(10.8), Y(0)); g.closePath();
  g.fillStyle = "#9a5b45"; g.fill();
  g.save(); g.clip(); g.fillStyle = brick; g.fillRect(0, 0, W, H);
  const damp = g.createLinearGradient(0, Y(1.7), 0, Y(0)); damp.addColorStop(0, "rgba(30,40,32,0)"); damp.addColorStop(1, "rgba(30,40,32,0.75)");
  g.fillStyle = damp; g.fillRect(0, Y(1.7), W, 1.7 * S);
  g.restore();
  const R = 8.69, cy = -5.79, R2 = R + 0.62, dy = 0.3 - cy, Cx = X(0), Cy = Y(cy);
  const aL = Math.atan2(-dy, -6.2), aR = Math.atan2(-dy, 6.2), o = Math.sqrt(R2 * R2 - dy * dy), aL2 = Math.atan2(-dy, -o), aR2 = Math.atan2(-dy, o);
  g.fillStyle = "#e5dfd2"; g.beginPath(); g.arc(Cx, Cy, R2 * S, aL2, aR2); g.lineTo(X(6.2), Y(0.3)); g.arc(Cx, Cy, R * S, aR, aL, true); g.closePath(); g.fill();
  g.strokeStyle = "rgba(0,0,0,0.22)"; g.lineWidth = Math.max(1, 0.03 * S);
  for (let a = aL; a < aR; a += 0.06) { g.beginPath(); g.moveTo(Cx + Math.cos(a) * R * S, Cy + Math.sin(a) * R * S); g.lineTo(Cx + Math.cos(a) * R2 * S, Cy + Math.sin(a) * R2 * S); g.stroke(); }
  g.fillStyle = "#ece6da"; g.beginPath(); g.moveTo(Cx - 0.28 * S, Cy - R * S); g.lineTo(Cx - 0.38 * S, Cy - (R2 + 0.12) * S); g.lineTo(Cx + 0.38 * S, Cy - (R2 + 0.12) * S); g.lineTo(Cx + 0.28 * S, Cy - R * S); g.closePath(); g.fill(); // the keystone
  g.save(); g.globalCompositeOperation = "destination-out"; // the opening
  g.beginPath(); g.moveTo(X(-6.2), Y(0) + 2); g.lineTo(X(-6.2), Y(0.3)); g.arc(Cx, Cy, R * S, aL, aR); g.lineTo(X(6.2), Y(0) + 2); g.closePath(); g.fill();
  g.restore();
  const along = (off, width, color) => { g.strokeStyle = color; g.lineWidth = width * S; g.lineCap = "round"; g.beginPath(); for (let x = -10.8; x <= 10.81; x += 0.2) { const y = Y(VENICE_DECK(x) + off); x === -10.8 ? g.moveTo(X(x), y) : g.lineTo(X(x), y); } g.stroke(); };
  along(-0.08, 0.22, "#e6e0d2"); along(-0.24, 0.08, "rgba(0,0,0,0.22)"); along(0.12, 0.14, "#e2dccf");
  g.fillStyle = "#ddd7ca";
  for (let x = -10.5; x <= 10.5; x += 0.34) { const y0 = VENICE_DECK(x); g.beginPath(); g.ellipse(X(x), Y(y0 + 0.4), 0.075 * S, 0.2 * S, 0, 0, Math.PI * 2); g.fill(); g.fillRect(X(x) - 0.035 * S, Y(y0 + 0.9), 0.07 * S, 0.75 * S); }
  along(0.95, 0.2, "#efe9dd"); along(0.84, 0.05, "rgba(0,0,0,0.2)");
  const lamps = [];
  for (const lx of [-6.8, 6.8]) { // iron lanterns on posts at the ends of the crown
    const y0 = VENICE_DECK(lx) + 1.05;
    g.fillStyle = "#1c1c1e"; g.fillRect(X(lx) - 0.05 * S, Y(y0 + 1.2), 0.1 * S, 1.2 * S); g.fillRect(X(lx) - 0.14 * S, Y(y0 + 0.05), 0.28 * S, 0.08 * S);
    g.beginPath(); g.moveTo(X(lx) - 0.2 * S, Y(y0 + 1.55)); g.lineTo(X(lx) + 0.2 * S, Y(y0 + 1.55)); g.lineTo(X(lx), Y(y0 + 1.72)); g.closePath(); g.fill();
    g.fillStyle = "#efe4c4"; g.fillRect(X(lx) - 0.14 * S, Y(y0 + 1.55), 0.28 * S, 0.35 * S);
    lamps.push([lx, y0 + 1.38]);
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  tex.userData.lamps = lamps;
  return tex;
}
/** The far shore where the canal opens: a domed basilica with its smaller dome and bell towers, a campanile, low houses. Masks: r body, g windows, b sunlit rim. 160 × 80 m. */
function veniceFarShore(THREE, W) {
  const s = W / 160, H = Math.round(80 * s), r = koiRng(4545), c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d"), X = (m) => (m + 80) * s, Y = (m) => H - m * s;
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  const body = "rgb(255,0,0)", win = "rgb(0,255,0)", rim = "rgb(0,0,255)";
  const box = (x0, x1, y0, y1, col = body) => { g.fillStyle = col; g.fillRect(X(x0), Y(y1), (x1 - x0) * s, (y1 - y0) * s); };
  for (let x = -80; x < 80; ) { // the houses along the water
    const w = r(6, 13), h = r(8, 15);
    box(x, x + w, 0, h); box(x, x + 0.7, 2, h, rim);
    for (let fy = 3; fy < h - 1.5; fy += 3) for (let fx = x + 1.2; fx < x + w - 1; fx += 2.2) if (r() < 0.4) box(fx, fx + 0.8, fy, fy + 1.2, win);
    x += w;
  }
  box(-14, 26, 0, 22); box(-14, -12.8, 4, 22, rim); // the basilica's octagon
  g.fillStyle = body; for (const vx of [-9.5, 21.5]) { g.beginPath(); g.arc(X(vx), Y(23.5), 3.4 * s, 0, Math.PI * 2); g.fill(); } // its great volutes
  box(-8, 20, 22, 36); box(-8, -7, 22, 36, rim); // the drum
  for (let k = 0; k < 5; k++) box(-5 + k * 5.2, -3.6 + k * 5.2, 26, 32, win);
  g.fillStyle = body; g.beginPath(); g.ellipse(X(6), Y(36), 15 * s, 17 * s, 0, Math.PI, Math.PI * 2); g.fill(); // the dome
  g.strokeStyle = rim; g.lineWidth = 1.6 * s; g.beginPath(); g.ellipse(X(6), Y(36), 14.2 * s, 16.2 * s, 0, Math.PI, Math.PI * 1.45); g.stroke();
  box(3, 9, 52, 58); g.fillStyle = body; g.beginPath(); g.ellipse(X(6), Y(58), 3.6 * s, 3.4 * s, 0, Math.PI, Math.PI * 2); g.fill(); box(5.7, 6.3, 60, 67); box(4.6, 7.4, 64.5, 65.2); // the lantern, its cross
  box(25, 39, 18, 28); g.fillStyle = body; g.beginPath(); g.ellipse(X(32), Y(28), 7 * s, 8 * s, 0, Math.PI, Math.PI * 2); g.fill(); box(31, 33, 35, 40); // the smaller dome
  for (const tx of [41, 47]) { box(tx, tx + 3, 16, 44); g.fillStyle = body; g.beginPath(); g.moveTo(X(tx - 0.3), Y(44)); g.lineTo(X(tx + 1.5), Y(51)); g.lineTo(X(tx + 3.3), Y(44)); g.closePath(); g.fill(); box(tx, tx + 0.5, 16, 44, rim); }
  box(-56, -49, 0, 52); box(-56, -55.2, 2, 52, rim); box(-57, -48, 44, 46); // a campanile, its belfry
  for (const bx of [-55, -53, -51]) box(bx, bx + 1.2, 46.5, 50.5, win);
  g.fillStyle = body; g.beginPath(); g.moveTo(X(-56.5), Y(52)); g.lineTo(X(-52.5), Y(66)); g.lineTo(X(-48.5), Y(52)); g.closePath(); g.fill(); box(-52.8, -52.2, 66, 69);
  box(-36, -24, 0, 17); g.fillStyle = body; g.beginPath(); g.ellipse(X(-30), Y(17), 6 * s, 7 * s, 0, Math.PI, Math.PI * 2); g.fill(); box(-30.4, -29.6, 23, 27); // a smaller domed church
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
/** Istrian stone for the coping of the bridge the viewer stands on: pale, weathered, two joints. Repeats twice along it. */
function veniceCoping(THREE) {
  const r = koiRng(606);
  const tex = canvasTexture(THREE, 1024, 128, (g, w, h) => {
    g.fillStyle = "#dcd6c9"; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(${r() < 0.7 ? "96,88,76" : "84,104,64"},${r(0.04, 0.12)})`; g.beginPath(); g.ellipse(r(0, w), r(0, h), r(10, 70), r(3, 16), 0, 0, Math.PI * 2); g.fill(); }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.5 ? "70,64,58" : "255,255,250"},${r(0.05, 0.2)})`; g.fillRect(r(0, w), r(0, h), r(1, 2.2), r(1, 2.2)); }
    g.fillStyle = "rgba(60,54,46,0.4)"; for (const x of [r(0.22, 0.3) * w, r(0.66, 0.74) * w]) g.fillRect(x, 0, 2, h);
  });
  tex.wrapS = THREE.RepeatWrapping; tex.repeat.set(2, 1); tex.anisotropy = 8;
  return tex;
}
/** A covered gondola's tarpaulin: stretched over the gunwales from the seat forward and aft, following the hull (same formulas as veniceHull). */
function veniceCover(THREE) {
  const NX = 30, NS = 8, L = 5.5, pos = [], idx = [];
  for (let i = 0; i <= NX; i++) {
    const u = -0.74 + (1.48 * i) / NX, e = Math.abs(u), x = u * L;
    const hw = (0.7 * Math.pow(Math.max(0, 1 - e * e), 0.6) + 0.02) * 1.03, top = 0.3 + 0.65 * Math.pow(e, 3);
    for (let j = 0; j <= NS; j++) { const f = (j / NS - 0.5) * Math.PI; pos.push(x, top + 0.02 + 0.13 * Math.cos(f) * Math.min(1, (0.74 - e) * 6), hw * Math.sin(f)); }
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j, b = a + NS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** A gondolier from behind, rowing on his right: a straw boater with a ribbon, a striped shirt, the long oar down into the water. 1.3 × 2.6 m, the stern deck at 0.62 m. */
function veniceGondolier(THREE) {
  return canvasTexture(THREE, 256, 512, (g) => {
    const s = 512 / 2.6, Y = (m) => 512 - m * s, cx = 118;
    g.strokeStyle = "#c8a26a"; g.lineCap = "round"; g.lineWidth = 7; // the oar: from above the hands down into the water on the right
    g.beginPath(); g.moveTo(cx - 20, Y(1.95)); g.lineTo(250, Y(-0.05)); g.stroke();
    g.fillStyle = "#b8925a"; g.beginPath(); g.ellipse(246, Y(0.12), 7, 26, -0.55, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1c2236"; g.fillRect(cx - 17, Y(1.25), 15, 0.63 * s); g.fillRect(cx + 3, Y(1.25), 15, 0.63 * s); // legs
    g.fillStyle = "#101010"; g.fillRect(cx - 19, Y(0.66), 18, 8); g.fillRect(cx + 2, Y(0.66), 18, 8);
    g.fillStyle = "#f4f2ec"; g.beginPath(); g.moveTo(cx - 26, Y(1.25)); g.lineTo(cx - 29, Y(1.9)); g.lineTo(cx + 29, Y(1.9)); g.lineTo(cx + 26, Y(1.25)); g.closePath(); g.fill(); // the shirt
    g.save(); g.clip(); g.fillStyle = "#1d2a52"; for (let y = Y(1.9); y < Y(1.25); y += 12) g.fillRect(cx - 32, y, 64, 6); g.restore();
    g.strokeStyle = "#f4f2ec"; g.lineWidth = 11; // arms, reaching to the oar on the right
    g.beginPath(); g.moveTo(cx + 24, Y(1.85)); g.quadraticCurveTo(cx + 40, Y(1.7), cx + 50, Y(1.62)); g.moveTo(cx - 24, Y(1.85)); g.quadraticCurveTo(cx + 5, Y(1.66), cx + 28, Y(1.72)); g.stroke();
    g.fillStyle = "#d9a883"; g.beginPath(); g.arc(cx + 52, Y(1.62), 6, 0, Math.PI * 2); g.arc(cx + 30, Y(1.72), 6, 0, Math.PI * 2); g.fill(); // hands
    g.fillStyle = "#c99a78"; g.fillRect(cx - 7, Y(2.0), 14, 14); // neck
    g.fillStyle = "#3a2a1e"; g.beginPath(); g.ellipse(cx, Y(2.12), 20, 23, 0, 0, Math.PI * 2); g.fill(); // the back of his head
    g.fillStyle = "#ecd394"; g.beginPath(); g.ellipse(cx, Y(2.28), 44, 9, 0, 0, Math.PI * 2); g.fill(); g.fillRect(cx - 23, Y(2.46), 46, 0.18 * s); // the boater
    g.fillStyle = "#b8202c"; g.fillRect(cx - 23, Y(2.34), 46, 7);
  });
}
/** Three walkers in profile, facing right: a woman in a coat with a bag, a man in a cap, a tourist with a rucksack. 3 cells of 0.85 × 1.7 m. */
function venicePeople(THREE) {
  return canvasTexture(THREE, 768, 512, (g) => {
    const s = 512 / 1.7, Y = (m) => 512 - m * s;
    const walker = (ox, coat, legs, head, extra) => {
      const cx = ox + 128;
      g.strokeStyle = legs; g.lineCap = "round"; g.lineWidth = 22;
      g.beginPath(); g.moveTo(cx, Y(0.9)); g.lineTo(cx - 34, Y(0.05)); g.moveTo(cx, Y(0.9)); g.lineTo(cx + 38, Y(0.06)); g.stroke();
      g.fillStyle = "#1a1a1a"; g.fillRect(cx - 50, Y(0.06), 30, 12); g.fillRect(cx + 30, Y(0.07), 30, 12);
      g.fillStyle = coat; g.beginPath(); g.moveTo(cx - 34, Y(0.72)); g.lineTo(cx - 30, Y(1.42)); g.quadraticCurveTo(cx, Y(1.5), cx + 30, Y(1.42)); g.lineTo(cx + 38, Y(0.72)); g.closePath(); g.fill();
      g.strokeStyle = coat; g.lineWidth = 18; g.beginPath(); g.moveTo(cx + 10, Y(1.36)); g.quadraticCurveTo(cx + 40, Y(1.1), cx + 52, Y(0.9)); g.stroke();
      g.fillStyle = "#d9a883"; g.beginPath(); g.arc(cx + 4, Y(1.58), 26, 0, Math.PI * 2); g.fill();
      g.fillStyle = head; g.beginPath(); g.arc(cx - 4, Y(1.62), 26, Math.PI * 0.85, Math.PI * 2.05); g.fill();
      extra(cx);
    };
    walker(0, "#7a3438", "#2a2a36", "#4a2e1e", (cx) => { g.fillStyle = "#c8a05a"; g.fillRect(cx - 62, Y(1.0), 30, 34); g.strokeStyle = "#c8a05a"; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - 47, Y(1.0)); g.lineTo(cx - 20, Y(1.38)); g.stroke(); g.fillStyle = "#e0c070"; g.fillRect(cx - 24, Y(1.46), 52, 14); });
    walker(256, "#2e3a4e", "#3a3530", "#2a2320", (cx) => { g.fillStyle = "#4a4038"; g.beginPath(); g.ellipse(cx + 2, Y(1.76), 32, 10, 0, 0, Math.PI * 2); g.fill(); g.fillRect(cx - 26, Y(1.84), 50, 16); });
    walker(512, "#8fb8d8", "#c8b08a", "#6a4a2a", (cx) => { g.fillStyle = "#c86a3a"; g.fillRect(cx - 64, Y(1.42), 34, 52); g.fillStyle = "#1a1a1a"; g.fillRect(cx + 16, Y(1.3), 20, 14); });
  });
}
/** Café tables on the walkway, seen from the canal: 0 a table for two with a candle, 1 a couple sitting at one. 2 cells of 2.2 × 1.65 m. */
function veniceCafeTables(THREE) {
  return canvasTexture(THREE, 1024, 384, (g) => {
    const s = 384 / 1.65, Y = (m) => 384 - m * s;
    const table = (ox, people) => {
      const cx = ox + 256;
      const chair = (x, dir) => { // a bentwood chair, its back away from the table
        g.strokeStyle = "#3a2618"; g.lineWidth = 6; g.lineCap = "round";
        g.beginPath(); g.moveTo(x - 30, Y(0.46)); g.lineTo(x - 34, Y(0)); g.moveTo(x + 30, Y(0.46)); g.lineTo(x + 34, Y(0)); g.stroke();
        g.fillStyle = "#4a3020"; g.beginPath(); g.ellipse(x, Y(0.46), 40, 9, 0, 0, Math.PI * 2); g.fill();
        g.beginPath(); g.moveTo(x - dir * 28, Y(0.46)); g.bezierCurveTo(x - dir * 44, Y(0.8), x - dir * 30, Y(0.98), x - dir * 12, Y(0.95)); g.stroke();
      };
      chair(cx - 120, -1); chair(cx + 120, 1);
      if (people) { // two figures leaning towards each other
        for (const [dx, coat, hair] of [[-110, "#3a4a6a", "#2a1e16"], [110, "#e8c8a0", "#6a3a22"]]) {
          const x = cx + dx;
          g.fillStyle = coat; g.beginPath(); g.moveTo(x - 30, Y(0.5)); g.quadraticCurveTo(x - 34, Y(1.05), x, Y(1.12)); g.quadraticCurveTo(x + 34, Y(1.05), x + 30, Y(0.5)); g.closePath(); g.fill();
          g.strokeStyle = coat; g.lineWidth = 16; g.beginPath(); g.moveTo(x - Math.sign(dx) * 12, Y(0.98)); g.lineTo(x - Math.sign(dx) * 60, Y(0.8)); g.stroke();
          g.fillStyle = "#d9a883"; g.beginPath(); g.arc(x - Math.sign(dx) * 6, Y(1.28), 22, 0, Math.PI * 2); g.fill();
          g.fillStyle = hair; g.beginPath(); g.arc(x, Y(1.32), 22, Math.PI, Math.PI * 2); g.fill();
        }
      }
      g.fillStyle = "#262626"; g.fillRect(cx - 4, Y(0.74), 8, 0.72 * s); g.beginPath(); g.ellipse(cx, Y(0.03), 36, 7, 0, 0, Math.PI * 2); g.fill(); // the table's pedestal
      g.fillStyle = "#efebe2"; g.beginPath(); g.ellipse(cx, Y(0.76), 88, 15, 0, 0, Math.PI * 2); g.fill(); g.fillStyle = "#c8c2b6"; g.fillRect(cx - 88, Y(0.76), 176, 6);
      g.fillStyle = "rgba(255,240,200,0.9)"; g.fillRect(cx - 5, Y(0.86), 10, 14); g.fillStyle = "#ffcc66"; g.beginPath(); g.ellipse(cx, Y(0.9), 3, 6, 0, 0, Math.PI * 2); g.fill(); // the candle in its glass
      g.strokeStyle = "rgba(255,255,255,0.7)"; g.lineWidth = 2; g.beginPath(); g.moveTo(cx + 30, Y(0.77)); g.lineTo(cx + 30, Y(0.86)); g.stroke(); g.fillStyle = "rgba(140,30,40,0.8)"; g.beginPath(); g.arc(cx + 30, Y(0.9), 7, 0, Math.PI); g.fill(); // a glass of wine
    };
    table(0, false); table(512, true);
  });
}
/** Laundry: shirt, trousers, striped towel, sheet, dress, socks, T-shirt, pillowcase; pale, tinted per garment. 4 × 2 cells, each hanging from its top edge. */
function veniceLaundry(THREE) {
  const r = koiRng(12);
  return canvasTexture(THREE, 1024, 512, (g) => {
    const cell = (i, draw) => { g.save(); g.translate((i % 4) * 256, Math.floor(i / 4) * 256); draw(); g.restore(); };
    const peg = (x) => { g.fillStyle = "#b08a5a"; g.fillRect(x - 3, 0, 6, 16); };
    const shade = (x0, x1) => { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, "rgba(0,0,0,0.12)"); gr.addColorStop(0.5, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.14)"); g.fillStyle = gr; g.fillRect(x0, 0, x1 - x0, 256); };
    g.fillStyle = "#f4f2ec";
    cell(0, () => { g.fillStyle = "#f4f2ec"; g.beginPath(); g.moveTo(70, 8); g.lineTo(186, 8); g.lineTo(240, 60); g.lineTo(210, 90); g.lineTo(186, 70); g.lineTo(186, 250); g.lineTo(70, 250); g.lineTo(70, 70); g.lineTo(46, 90); g.lineTo(16, 60); g.closePath(); g.fill(); shade(70, 186); g.fillStyle = "rgba(0,0,0,0.15)"; for (let y = 40; y < 240; y += 36) g.fillRect(126, y, 4, 4); peg(80); peg(176); });
    cell(1, () => { g.fillStyle = "#f4f2ec"; g.beginPath(); g.moveTo(60, 6); g.lineTo(196, 6); g.lineTo(206, 252); g.lineTo(140, 252); g.lineTo(128, 90); g.lineTo(116, 252); g.lineTo(50, 252); g.closePath(); g.fill(); shade(50, 206); peg(70); peg(186); });
    cell(2, () => { g.fillStyle = "#f4f2ec"; g.fillRect(56, 6, 144, 230); g.fillStyle = "rgba(60,80,140,0.45)"; for (let y = 30; y < 220; y += 40) g.fillRect(56, y, 144, 12); shade(56, 200); peg(66); peg(190); });
    cell(3, () => { g.fillStyle = "#f4f2ec"; g.beginPath(); g.moveTo(8, 6); g.lineTo(248, 6); g.lineTo(244, 240); g.quadraticCurveTo(128, 256, 12, 240); g.closePath(); g.fill(); shade(8, 248); g.strokeStyle = "rgba(0,0,0,0.08)"; g.lineWidth = 3; for (const x of [70, 128, 190]) { g.beginPath(); g.moveTo(x, 8); g.lineTo(x + 6, 240); g.stroke(); } peg(30); peg(128); peg(226); });
    cell(4, () => { g.fillStyle = "#f4f2ec"; g.beginPath(); g.moveTo(96, 6); g.lineTo(160, 6); g.lineTo(170, 70); g.lineTo(226, 250); g.lineTo(30, 250); g.lineTo(86, 70); g.closePath(); g.fill(); g.fillStyle = "rgba(200,80,110,0.35)"; for (let i = 0; i < 40; i++) { g.beginPath(); g.arc(60 + r() * 140, 80 + r() * 160, 5, 0, Math.PI * 2); g.fill(); } shade(30, 226); peg(104); peg(152); });
    cell(5, () => { g.fillStyle = "#f4f2ec"; for (const ox of [70, 150]) { g.beginPath(); g.moveTo(ox, 6); g.lineTo(ox + 36, 6); g.lineTo(ox + 36, 120); g.quadraticCurveTo(ox + 40, 160, ox + 10, 160); g.lineTo(ox - 14, 160); g.quadraticCurveTo(ox - 20, 130, ox, 120); g.closePath(); g.fill(); peg(ox + 18); } });
    cell(6, () => { g.fillStyle = "#f4f2ec"; g.beginPath(); g.moveTo(76, 8); g.lineTo(180, 8); g.lineTo(226, 50); g.lineTo(200, 80); g.lineTo(180, 64); g.lineTo(180, 200); g.lineTo(76, 200); g.lineTo(76, 64); g.lineTo(56, 80); g.lineTo(30, 50); g.closePath(); g.fill(); shade(76, 180); peg(86); peg(170); });
    cell(7, () => { g.fillStyle = "#f4f2ec"; g.fillRect(40, 6, 176, 150); g.strokeStyle = "rgba(0,0,0,0.1)"; g.lineWidth = 4; g.strokeRect(50, 16, 156, 130); shade(40, 216); peg(52); peg(204); });
  });
}
/** The walkway's paving (3.6 m square, repeats along it): trachyte blocks, the Istrian stone kerb on the canal side (u = 0). */
function veniceWalkTop(THREE, S) {
  const W = Math.round(3.6 * S), r = koiRng(77);
  const tex = canvasTexture(THREE, W, W, (g) => {
    g.fillStyle = "#5e5c58"; g.fillRect(0, 0, W, W);
    const bw = 0.9 * S, bh = 0.45 * S;
    for (let row = 0; row * bh < W; row++) for (let x = row % 2 ? -bw / 2 : 0; x < W; x += bw) { const t = r(0.72, 1.08); g.fillStyle = `rgb(${Math.round(120 * t)},${Math.round(118 * t)},${Math.round(113 * t)})`; g.fillRect(x + 2, row * bh + 2, bw - 4, bh - 4); }
    g.fillStyle = "#dcd6c8"; g.fillRect(0, 0, 0.35 * S, W); g.fillStyle = "rgba(0,0,0,0.25)"; g.fillRect(0.35 * S, 0, 3, W);
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.anisotropy = 8;
  return tex;
}
/** The walkway's edge above the canal: the Istrian kerb, damp stone, algae at the waterline (1.35 m tall; 0.8 m of it under water). */
function veniceKerb(THREE) {
  const tex = canvasTexture(THREE, 512, 64, (g, w, h) => {
    const Y = (m) => h - ((m + 0.8) / 1.35) * h;
    g.fillStyle = "#6a6860"; g.fillRect(0, 0, w, h);
    g.fillStyle = "#dcd6c8"; g.fillRect(0, 0, w, Y(0.3));
    const damp = g.createLinearGradient(0, Y(0.3), 0, Y(0)); damp.addColorStop(0, "rgba(40,50,40,0.2)"); damp.addColorStop(1, "rgba(28,40,30,0.9)"); g.fillStyle = damp; g.fillRect(0, Y(0.3), w, Y(0) - Y(0.3));
    g.fillStyle = "#1f2b24"; g.fillRect(0, Y(0.1), w, h - Y(0.1));
  });
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}
/** What the glossy gondolas mirror: the sky down the canal, warm walls either side, the low sun (or the lanterns at night). */
function veniceEnv(THREE, dark) {
  const tex = canvasTexture(THREE, 512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, dark ? "#070b1c" : "#7d98cc"); grad.addColorStop(0.46, dark ? "#1a2448" : "#f3c49a"); grad.addColorStop(0.54, dark ? "#10162a" : "#6a4a3a"); grad.addColorStop(1, dark ? "#05070c" : "#23332e");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    for (const u of [0.0, 0.5, 1.0]) { const wg = g.createLinearGradient(u * w - 60, 0, u * w + 60, 0); wg.addColorStop(0, "rgba(0,0,0,0)"); wg.addColorStop(0.5, dark ? "rgba(40,34,40,0.9)" : "rgba(120,80,64,0.7)"); wg.addColorStop(1, "rgba(0,0,0,0)"); g.fillStyle = wg; g.fillRect(u * w - 60, h * 0.1, 120, h * 0.42); } // the walls either side
    if (!dark) { const sx = w * 0.16, sy = h * 0.4, rg = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.22); rg.addColorStop(0, "rgba(255,238,200,1)"); rg.addColorStop(1, "rgba(255,200,140,0)"); g.fillStyle = rg; g.fillRect(sx - h * 0.22, sy - h * 0.22, h * 0.44, h * 0.44); }
    else { const rr = koiRng(3); for (let i = 0; i < 16; i++) { const x = rr(0, w), y = rr(h * 0.3, h * 0.48), rg = g.createRadialGradient(x, y, 0, x, y, 9); rg.addColorStop(0, "rgba(255,200,130,1)"); rg.addColorStop(1, "rgba(255,160,80,0)"); g.fillStyle = rg; g.fillRect(x - 9, y - 9, 18, 18); } }
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
/** A gondola's hull, bow towards +x: long and narrow, rising to both ends, open on top. 11 m. */
function veniceHull(THREE) {
  const NX = 44, NS = 12, L = 5.5, pos = [], idx = [];
  for (let i = 0; i <= NX; i++) {
    const u = -1 + (2 * i) / NX, e = Math.abs(u), x = u * L;
    const hw = 0.7 * Math.pow(Math.max(0, 1 - e * e), 0.6) + 0.02, top = 0.3 + 0.65 * Math.pow(e, 3), bot = -0.2 + 0.45 * Math.pow(e, 4);
    for (let j = 0; j <= NS; j++) { const f = (j / NS - 0.5) * Math.PI; pos.push(x, bot + (top - bot) * Math.pow(1 - Math.cos(f), 0.8), hw * Math.sin(f)); }
  }
  for (let i = 0; i < NX; i++) for (let j = 0; j < NS; j++) { const a = i * (NS + 1) + j, b = a + NS + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}
/** The ferro, the gondola's iron prow: a curving blade with six teeth. Flat, in the x–y plane. */
function veniceFerro(THREE) {
  const blade = new THREE.Shape();
  blade.moveTo(-0.05, 0); blade.lineTo(0.06, 0); blade.bezierCurveTo(0.12, 0.25, 0.08, 0.45, 0.18, 0.62); blade.bezierCurveTo(0.28, 0.76, 0.36, 0.8, 0.42, 0.9);
  blade.lineTo(0.3, 0.95); blade.bezierCurveTo(0.12, 0.9, 0.0, 0.78, -0.04, 0.62); blade.closePath();
  const parts = [[new THREE.ShapeGeometry(blade, 6), new THREE.Matrix4()]];
  for (let k = 0; k < 6; k++) { const t = new THREE.Shape(), y = 0.1 + k * 0.075; t.moveTo(0.05, y); t.lineTo(0.3, y + 0.01); t.lineTo(0.3, y + 0.035); t.lineTo(0.05, y + 0.04); t.closePath(); parts.push([new THREE.ShapeGeometry(t), new THREE.Matrix4()]); }
  const g = mergeParts(THREE, parts);
  g.scale(1.25, 1.25, 1.25);
  return g;
}
/** The café's awning in world space: a sloping canopy from the wall and its scalloped valance (u along the canal, v from the valance's hem to the wall). */
function veniceAwning(THREE, xWall, xFront, yWall, yFront, z0, z1) {
  const valance = 0.36, pos = [xWall, yWall, z0, xWall, yWall, z1, xFront, yFront, z1, xFront, yFront, z0, xFront, yFront, z0, xFront, yFront, z1, xFront, yFront - valance, z1, xFront, yFront - valance, z0];
  const uv = [0, 1, 1, 1, 1, 0.2, 0, 0.2, 0, 0.2, 1, 0.2, 1, 0, 0, 0];
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex([0, 1, 2, 0, 2, 3, 4, 5, 6, 4, 6, 7]);
  g.computeVertexNormals();
  return g;
}
/** The facade quads of one stretch of one bank: each palazzo its own quad (standing forward by b.off) over its own column of the canvas. */
function veniceFacadeGeo(THREE, side, list, cols, W, HW, HMAX) {
  const pos = [], nrm = [], uv = [], idx = [];
  list.forEach((b, i) => {
    const x = side * (HW - b.off), u0 = cols[i][0] / W, u1 = cols[i][1] / W, k = pos.length / 3;
    pos.push(x, 0, b.z0, x, 0, b.z1, x, HMAX, b.z1, x, HMAX, b.z0);
    for (let n = 0; n < 4; n++) nrm.push(-side, 0, 0);
    uv.push(u0, 0, u1, 0, u1, 1, u0, 1);
    idx.push(k, k + 1, k + 2, k, k + 2, k + 3);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
/** Depth behind the painted facades: each palazzo's near side wall (facing the viewer, from the facade back D metres) up to a
 *  pitched gable, one mesh for both banks; and where its chimneys stand: 1–2 on the roof just behind the cornice, and a flue up
 *  the side wall where it rises above the house in front. */
function veniceBlocks(THREE, rows, HW, r) {
  const pos = [], aSide = [], aTint = [], idx = [], stacks = [];
  const c = new THREE.Color(), grey = new THREE.Color();
  for (const side of [-1, 1]) {
    rows[side].forEach((b, i) => {
      const p = rows[side][i - 1], D = r(12, 17), pitch = r(0.32, 0.42), tp = Math.tan(pitch), eave = b.h + 0.45, ridge = eave + (D / 2) * tp, seed = r(0, 40);
      const X = (d) => side * (HW - b.off + d), z = b.z0, k = pos.length / 3;
      c.set(b.color); grey.setScalar(c.r * 0.3 + c.g * 0.59 + c.b * 0.11); c.lerp(grey, 0.25).multiplyScalar(0.92); // plainer than the front
      // 0 foot at the facade, 1 eave at the facade, 2 ridge, 3 eave at the back, 4 foot at the back, 5 foot under the ridge
      for (const [d, y, below] of [[0, 0, eave], [0, eave, 0], [D / 2, ridge, 0], [D, eave, 0], [D, 0, eave], [D / 2, 0, ridge]]) {
        pos.push(X(d), y, z); aSide.push(below, seed, d); aTint.push(c.r, c.g, c.b);
      }
      idx.push(k, k + 5, k + 2, k, k + 2, k + 1, k + 5, k + 4, k + 3, k + 5, k + 3, k + 2);
      for (let n = r() < 0.45 ? 2 : 1, j = 0; j < n; j++) { // on the roof, just behind the cornice: seen rising over it
        const w = r(0.6, 0.85), d = r(0.5, 2.0) + w / 2;
        stacks.push({ x: X(d), z: r(b.z1 + 1.2, b.z0 - 1.2), y0: eave + (d - w / 2) * tp - 0.25, h: r(1.0, 2.0), w, dz: w * r(0.75, 1), f: r(0.7, 1.0), brick: r() < 0.45 });
      }
      if (p && b.h > p.h + 1.2 && r() < 0.55) { // a flue up the exposed side wall, its pot above the gable
        const d = D * r(0.22, 0.7), top = eave + Math.min(d, D - d) * tp, w = r(0.8, 1.05);
        stacks.push({ x: X(d), z: z + 0.22, y0: p.h - 1, h: top - p.h + 1 + r(0.8, 1.5), w, dz: 0.44, f: r(0.8, 1.1), brick: r() < 0.5 });
      }
    });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aSide", new THREE.Float32BufferAttribute(aSide, 3));
  g.setAttribute("aTint", new THREE.Float32BufferAttribute(aTint, 3));
  g.setIndex(idx);
  return { walls: g, stacks };
}
function venice(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(1797);
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, "YXZ");
  const EYE = 5.2, PITCH = -0.035, HW = 10, HMAX = 26, ZEND = -312, BRIDGE_Z = -70; // standing on a bridge over the canal, looking down it
  camera.fov = 50; camera.near = 0.5; camera.far = 4000;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  let TAN = Math.tan((camera.fov * Math.PI) / 360);
  const halfW = (dist) => dist * TAN * camera.aspect;
  const time = { value: 0 };
  const noise = keep(lhNoise(THREE)), glow = keep(lhGlow(THREE)), mist = keep(inkMist(THREE));
  const quad = keep(new THREE.PlaneGeometry(1, 1));
  const accent = new THREE.Color();
  const SUN = new THREE.Vector3(-0.42, 0.16, -0.89).normalize(); // low over the rooftops ahead on the left
  // everything above the water is in `world`: drawn twice, the second time mirrored into the canal
  const world = new THREE.Group(), near = new THREE.Group();
  scene.add(world, near);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1), sun = new THREE.DirectionalLight(0xffffff, 1);
  scene.add(hemi, sun);
  scene.fog = new THREE.Fog(0xffffff, 150, 900);
  let envTex = null;
  const buildEnv = (dark) => { envTex?.dispose(); envTex = veniceEnv(THREE, dark); scene.environment = envTex; };
  const flip = { value: 1 };
  const fogU = { uFog: { value: new THREE.Color() }, uFogNear: { value: 150 }, uFogFar: { value: 900 } };
  const litU = { uSunDir: { value: SUN.clone() }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uFlip: flip };
  const shader = (vs, fs, uniforms, extra = {}) => keep(new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, side: THREE.DoubleSide, ...extra }));
  const lampMat = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffbf78, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false }));
  const glowPts = []; // the lanterns' halos: [x, y, z, size], drawn together at the end of the build

  /* --- the sky: a golden-hour gradient (the sun itself behind the roofs on the left), or night with stars and the moon over the canal's end --- */
  const skyUni = {
    uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    uSunDir: { value: SUN.clone() }, uSunColor: { value: new THREE.Color("#fff0d0") }, uSun: { value: 1 },
  };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(3200, 40, 20)), shader(LANTERN_SKY_VS, LANTERN_SKY_FS, skyUni, { depthWrite: false, depthTest: false }));
  sky.position.set(0, EYE, 0); sky.renderOrder = -10; sky.frustumCulled = false;
  world.add(sky);
  const NSTAR = preview ? 300 : 900, starPos = new Float32Array(NSTAR * 3);
  for (let i = 0; i < NSTAR; i++) { const a = r(0, 6.283), e = Math.asin(r(0.04, 1)); starPos.set([Math.cos(a) * Math.cos(e) * 3000, EYE + Math.sin(e) * 3000, Math.sin(a) * Math.cos(e) * 3000], i * 3); }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = keep(new THREE.PointsMaterial({ color: 0xe8eeff, size: preview ? 1.1 : 1.5, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false })); // depth-tested: the roofs hide them
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9; stars.frustumCulled = false;
  world.add(stars);
  const plainMat = (opts) => keep(new THREE.MeshBasicMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, forceSinglePass: true, fog: false, ...opts }));
  const moon = new THREE.Mesh(quad, plainMat({ map: keep(sakuraMoon(THREE)) }));
  moon.position.set(70, 385, -2400); moon.scale.setScalar(95); moon.renderOrder = -8;
  const moonHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0x8fa3d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.5 })));
  moonHalo.position.copy(moon.position); moonHalo.scale.setScalar(620); moonHalo.renderOrder = -9;
  world.add(moon, moonHalo);
  const cloudMat = plainMat({ map: mist });
  const clouds = [[-300, 330, 1400, 80], [380, 430, 1600, 90], [-60, 570, 1300, 70], [620, 700, 1500, 90], [-640, 820, 1700, 110]].map(([x, y, w, h]) => { const m = new THREE.Mesh(quad, cloudMat); m.position.set(x, y, -2500); m.scale.set(w, h, 1); m.renderOrder = -7; m.frustumCulled = false; world.add(m); return { m, speed: r(3, 6) }; });

  /* --- the far shore where the canal opens: a domed basilica against the sky --- */
  const farUni = { uMask: { value: keep(veniceFarShore(THREE, preview ? 512 : 1024)) }, uBody: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uWin: { value: new THREE.Color() }, uTime: time };
  const farMesh = new THREE.Mesh(quad, shader(LANTERN_LAYER_VS, VENICE_FAR_FS, farUni, { transparent: true, depthWrite: false, forceSinglePass: true }));
  farMesh.position.set(0, 40, -620); farMesh.scale.set(160, 80, 1); farMesh.renderOrder = 1; farMesh.frustumCulled = false;
  world.add(farMesh);

  /* --- the palazzi on both banks --- */
  const tiles = veniceTiles(), S_NEAR = preview ? 14 : 32, S_FAR = preview ? 5 : 10;
  // alpha-to-coverage cut-outs write their texture alpha into the canvas: at a soft edge the page behind the canvas showed through as a
  // light seam. The colour replaces, the alpha the sky already wrote (1) is kept.
  const KEEP_ALPHA = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
  const lampList = [], doorList = [], rows = {};
  const facadeUni = {
    ...litU, ...fogU, uBounce: { value: new THREE.Color() }, uSkyRefl: { value: new THREE.Color() }, uAccent: { value: accent }, uWarm: { value: new THREE.Color("#ffb46a") },
    uNight: { value: 0 }, uHW: { value: HW }, uRoofZ: { value: 330 }, uRoof: { value: null }, uLamps: { value: Array.from({ length: 24 }, () => new THREE.Vector4()) },
  };
  for (const side of [-1, 1]) {
    const row = veniceRow(r, -2, ZEND);
    if (side === 1) for (const b of row) if (b.z0 > -36 && b.z1 < -6) { b.shop = true; b.off = 0; } // the café's houses on the right, behind a walkway
    rows[side] = row;
    let split = row.findIndex((b) => b.z1 < -84);
    if (split < 0) split = row.length - 1;
    for (const [list, s] of [[row.slice(0, split + 1), S_NEAR], [row.slice(split + 1), S_FAR]]) {
      if (!list.length) continue;
      const { c, mc, lamps, doors, cols } = venicePaintRow(list, s, HMAX, tiles, side === 1); // the right bank reads mirrored: its sign is lettered backwards
      const tex = keep(new THREE.CanvasTexture(c)), mtex = keep(new THREE.CanvasTexture(mc));
      tex.colorSpace = THREE.SRGBColorSpace; mtex.colorSpace = THREE.NoColorSpace;
      tex.anisotropy = mtex.anisotropy = 8; // seen at a grazing angle all the way down the canal
      const mesh = new THREE.Mesh(keep(veniceFacadeGeo(THREE, side, list, cols, c.width, HW, HMAX)), shader(VENICE_FACADE_VS, VENICE_FACADE_FS, { ...facadeUni, uMap: { value: tex }, uMask: { value: mtex } }, { defines: { VENICE_LAMPS: 24 }, alphaToCoverage: true, ...KEEP_ALPHA }));
      mesh.frustumCulled = false;
      world.add(mesh);
      for (const L of lamps) lampList.push(new THREE.Vector3(side * (HW - L.b.off - 0.3), L.h, L.z));
      for (const D of doors) doorList.push({ side, z: D.z, off: D.b.off });
    }
  }
  const ROOFZ = 330, roofData = new Uint8Array(1024 * 4); // the left bank's roofline: what shades the right bank's facades
  for (let i = 0; i < 1024; i++) { const z = -((i + 0.5) / 1024) * ROOFZ, b = rows[-1].find((q) => z <= q.z0 && z > q.z1); roofData.set([b ? Math.min(255, Math.round(((b.h + 0.45) / 30) * 255)) : 0, 0, 0, 255], i * 4); }
  const roofTex = keep(new THREE.DataTexture(roofData, 1024, 1));
  roofTex.magFilter = roofTex.minFilter = THREE.LinearFilter; roofTex.needsUpdate = true;
  facadeUni.uRoof.value = roofTex;
  const blocks = veniceBlocks(THREE, rows, HW, koiRng(2024)); // the houses' depth: side walls with gables, chimneys on the roofs (own random stream: the rest of the scene stays as it was)
  const sideUni = { uNoise: { value: noise }, uAmb: litU.uAmb, uBounce: facadeUni.uBounce, uTile: { value: new THREE.Color("#b35a3c") }, uFlip: flip, ...fogU };
  const sideWalls = new THREE.Mesh(keep(blocks.walls), shader(VENICE_SIDE_VS, VENICE_SIDE_FS, sideUni));
  sideWalls.frustumCulled = false;
  world.add(sideWalls);
  const stackGeo = keep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0)), potGeo = keep(new THREE.CylinderGeometry(0.5, 0.2, 1, 10).translate(0, 0.5, 0)); // a stack, a funnel pot on it
  const chimMat = keep(new THREE.MeshStandardMaterial({ roughness: 0.92, envMapIntensity: 0.25 }));
  const stackMesh = new THREE.InstancedMesh(stackGeo, chimMat, blocks.stacks.length), potMesh = new THREE.InstancedMesh(potGeo, chimMat, blocks.stacks.length);
  const CREAM = new THREE.Color("#ddd0bd"), BRICK = new THREE.Color("#a95c40"), SOOTED = new THREE.Color("#b3a795");
  blocks.stacks.forEach((cm, i) => {
    stackMesh.setMatrixAt(i, M4.compose(V.set(cm.x, cm.y0, cm.z), Q.identity(), S3.set(cm.w, cm.h, cm.dz)));
    potMesh.setMatrixAt(i, M4.compose(V.set(cm.x, cm.y0 + cm.h, cm.z), Q.identity(), S3.set(cm.w * 1.75, cm.f, cm.w * 1.75)));
    stackMesh.setColorAt(i, cm.brick ? BRICK : CREAM); potMesh.setColorAt(i, cm.brick ? BRICK : SOOTED);
  });
  stackMesh.frustumCulled = potMesh.frustumCulled = false;
  world.add(stackMesh, potMesh);

  /* --- the stone bridge down the canal, and people crossing it --- */
  const bridgeTex = keep(veniceBridge(THREE, preview ? 24 : 48, tiles));
  const bridge = new THREE.Mesh(quad, keep(new THREE.MeshStandardMaterial({ map: bridgeTex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9, envMapIntensity: 0.25 })));
  bridge.position.set(0, 2.8, BRIDGE_Z); bridge.scale.set(21.6, 5.6, 1);
  world.add(bridge);
  for (const [lx, ly] of bridgeTex.userData.lamps) lampList.push(new THREE.Vector3(lx, ly, BRIDGE_Z + 0.1));
  const peopleMat = keep(new THREE.MeshBasicMaterial({ map: keep(venicePeople(THREE)), alphaTest: 0.5, side: THREE.DoubleSide }));
  const walkers = [0, 1, 2].map((k) => {
    const geo = keep(new THREE.PlaneGeometry(1, 1)), uvs = geo.attributes.uv;
    geo.translate(0, 0.5, 0);
    for (let i = 0; i < uvs.count; i++) uvs.setX(i, (k + uvs.getX(i)) / 3);
    const m = new THREE.Mesh(geo, peopleMat);
    world.add(m);
    return { m, x: r(-9, 9), dir: r() < 0.5 ? -1 : 1, speed: r(1.0, 1.4), k };
  });

  /* --- the café on the right: a walkway along the houses, tables, a striped awning --- */
  const shops = rows[1].filter((b) => b.shop), zW0 = shops[0].z0, zW1 = shops[shops.length - 1].z1, walkL = zW0 - zW1;
  const walkTex = keep(veniceWalkTop(THREE, preview ? 48 : 96));
  walkTex.repeat.set(1, walkL / 3.6);
  const walkTop = new THREE.Mesh(keep(new THREE.PlaneGeometry(3.6, walkL).rotateX(-Math.PI / 2)), keep(new THREE.MeshStandardMaterial({ map: walkTex, roughness: 0.9, side: THREE.DoubleSide, envMapIntensity: 0.2 })));
  walkTop.position.set(8.2, 0.55, (zW0 + zW1) / 2);
  const kerbTex = keep(veniceKerb(THREE));
  kerbTex.repeat.set(walkL / 3.75, 1);
  const kerb = new THREE.Mesh(keep(new THREE.PlaneGeometry(walkL, 1.35).rotateY(-Math.PI / 2)), keep(new THREE.MeshStandardMaterial({ map: kerbTex, roughness: 0.95, side: THREE.DoubleSide, envMapIntensity: 0.2 })));
  kerb.position.set(6.4, -0.125, (zW0 + zW1) / 2);
  world.add(walkTop, kerb);
  const cafe = shops.reduce((a, b) => (Math.abs((b.z0 + b.z1) / 2 + 16) < Math.abs((a.z0 + a.z1) / 2 + 16) ? b : a)); // the house nearest 16 m off has the café
  const aw0 = cafe.z0 - 0.6, aw1 = Math.max(cafe.z1 + 0.6, aw0 - 14);
  const awnUni = { uAccent: { value: accent }, uLight: { value: new THREE.Color() }, uUnder: { value: new THREE.Color() }, uStripes: { value: Math.round((aw0 - aw1) / 1.05) } };
  world.add(new THREE.Mesh(keep(veniceAwning(THREE, 9.95, 7.4, 3.45, 2.75, aw0, aw1)), shader(VENICE_AWNING_VS, VENICE_AWNING_FS, awnUni)));
  const tableMat = keep(new THREE.MeshBasicMaterial({ map: keep(veniceCafeTables(THREE)), alphaTest: 0.5, side: THREE.DoubleSide }));
  const tableGeos = [0, 1].map((k) => { const geo = keep(new THREE.PlaneGeometry(1, 1)), uvs = geo.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setX(i, (k + uvs.getX(i)) / 2); return geo; });
  const nTab = Math.max(2, Math.floor((aw0 - aw1) / 3.1)), tables = [];
  for (let i = 0; i < nTab; i++) {
    const z = aw0 - ((aw0 - aw1) * (i + 0.5)) / nTab, m = new THREE.Mesh(tableGeos[(i + (r() < 0.5 ? 0 : 1)) % 2], tableMat);
    m.position.set(8.5, 0.55 + 0.825, z); m.scale.set(2.2, 1.65, 1);
    world.add(m); tables.push(m);
    glowPts.push([8.5, 0.55 + 0.9, z, 0.55]);
  }

  /* --- mooring poles by the water doors and the moored gondolas --- */
  const poleSpots = [];
  for (const d of doorList) if (d.z > -230) for (const dz of [-1.3, 1.3]) if (r() < 0.8) poleSpots.push([d.side * (HW - d.off - 1.0), d.z + dz, r(3.0, 4.6)]);
  for (const z of [-18.2, -24.4, -30.6]) poleSpots.push([-5.35, z, r(3.4, 4.3)]); // where the two covered gondolas are tied up
  const poleGeo = keep(new THREE.CylinderGeometry(0.11, 0.13, 1, 10));
  poleGeo.translate(0, 0.5, 0);
  const poleMesh = new THREE.InstancedMesh(poleGeo, shader(VENICE_POLE_VS, VENICE_POLE_FS, { ...litU, ...fogU }), poleSpots.length);
  const capMesh = new THREE.InstancedMesh(keep(new THREE.SphereGeometry(0.17, 10, 8)), keep(new THREE.MeshStandardMaterial({ color: 0xc9a045, metalness: 0.8, roughness: 0.35 })), poleSpots.length);
  const POLE_COLS = ["#2a4a8a", "#b8282a", "#2f6a44", "#1c1c1c"].map((c) => new THREE.Color(c)), accentPoles = [];
  poleSpots.forEach(([x, z, h], i) => {
    E.set(r(-0.05, 0.05), 0, r(-0.05, 0.05), "YXZ");
    poleMesh.setMatrixAt(i, M4.compose(V.set(x, -0.6, z), Q.setFromEuler(E), S3.set(1, h + 0.6, 1)));
    capMesh.setMatrixAt(i, M4.compose(V.set(x, h, z), Q.identity(), S3.set(1, 1, 1)));
    if (r() < 0.3) accentPoles.push(i); else poleMesh.setColorAt(i, POLE_COLS[(r() * POLE_COLS.length) | 0]);
  });
  if (accentPoles.length) poleMesh.setColorAt(accentPoles[0], accent);
  poleMesh.frustumCulled = capMesh.frustumCulled = false;
  world.add(poleMesh, capMesh);

  /* --- laundry on lines across the canal --- */
  const lineParts = [], clothes = [];
  for (const [z, y0, sag] of [[-44, 10.6, 0.9], [-128, 12.2, 1.1]]) {
    const xa = -HW + 0.2, xb = HW - 0.2, yAt = (x) => y0 - sag * (1 - (x / HW) ** 2), pts = [];
    for (let i = 0; i <= 16; i++) { const x = xa + ((xb - xa) * i) / 16; pts.push(new THREE.Vector3(x, yAt(x), z)); }
    lineParts.push([new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.02, 4), new THREE.Matrix4()]);
    for (let x = xa + r(0.8, 1.6); x < xb - 0.8; x += r(1.3, 2.3)) clothes.push({ x, y: yAt(x) + 0.02, z, cell: (r() * 8) | 0 });
  }
  world.add(new THREE.Mesh(keep(mergeParts(THREE, lineParts)), keep(new THREE.MeshBasicMaterial({ color: 0x2e2e2e }))));
  const SIZES = [[0.95, 0.95], [0.75, 1.15], [0.75, 1.05], [1.7, 1.55], [0.85, 1.2], [0.5, 0.5], [0.8, 0.75], [0.75, 0.55]];
  const CLOTH_COLS = ["#ffffff", "#bcd4ec", "#f2cccc", "#f2e0a0", "#ffffff", "#d0e8d0"].map((c) => new THREE.Color(c)), accentCloth = [];
  const clothGeo = keep(new THREE.PlaneGeometry(1, 1));
  clothGeo.translate(0, -0.5, 0);
  const aCloth = new THREE.InstancedBufferAttribute(new Float32Array(clothes.length * 2), 2);
  clothGeo.setAttribute("aCloth", aCloth);
  const clothUni = { uTime: time, uMap: { value: keep(veniceLaundry(THREE)) }, uLight: { value: new THREE.Color() }, ...fogU };
  const clothMesh = new THREE.InstancedMesh(clothGeo, shader(VENICE_CLOTH_VS, VENICE_CLOTH_FS, clothUni), clothes.length);
  clothes.forEach((cl, i) => {
    const [w, h] = SIZES[cl.cell];
    clothMesh.setMatrixAt(i, M4.compose(V.set(cl.x, cl.y, cl.z), Q.identity(), S3.set(w, h, 1)));
    aCloth.setXY(i, cl.cell, r(0, 6.28));
    if (i % 5 === 2) accentCloth.push(i); else clothMesh.setColorAt(i, CLOTH_COLS[(r() * CLOTH_COLS.length) | 0]);
  });
  if (accentCloth.length) clothMesh.setColorAt(accentCloth[0], accent);
  clothMesh.frustumCulled = false;
  world.add(clothMesh);

  /* --- gondolas: two gliding along the canal (out from under our bridge, and back towards it), two moored under covers --- */
  const hullGeo = keep(veniceHull(THREE)), ferroGeo = keep(veniceFerro(THREE));
  const seatGeo = keep(new THREE.CapsuleGeometry(0.12, 0.64, 4, 10).rotateX(Math.PI / 2).scale(4.2, 0.9, 1)), backGeo = keep(new THREE.CapsuleGeometry(0.13, 0.62, 4, 10).rotateX(Math.PI / 2)), deckGeo = keep(new THREE.BoxGeometry(8.4, 0.05, 1.0)), sternGeo = keep(new THREE.BoxGeometry(0.9, 0.06, 0.55));
  const tarpGeo = keep(veniceCover(THREE));
  const lacquer = keep(new THREE.MeshStandardMaterial({ color: 0x06070a, roughness: 0.3, metalness: 0, side: THREE.DoubleSide, envMapIntensity: 0.4 })); // black lacquer: a sheen, not a mirror
  const silver = keep(new THREE.MeshStandardMaterial({ color: 0xd2d5da, roughness: 0.28, metalness: 1, side: THREE.DoubleSide }));
  const cushion = keep(new THREE.MeshStandardMaterial({ roughness: 0.75, envMapIntensity: 0.3 }));
  const woodMat = keep(new THREE.MeshStandardMaterial({ color: 0x4a3322, roughness: 0.8, envMapIntensity: 0.3 }));
  const tarpMat = keep(new THREE.MeshStandardMaterial({ color: 0x24375e, roughness: 0.8, side: THREE.DoubleSide, envMapIntensity: 0.25 }));
  const makeGondola = (covered) => {
    const g = new THREE.Group(), add = (geo, mat, x, y) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, 0); g.add(m); };
    add(hullGeo, lacquer, 0, 0); add(ferroGeo, silver, 5.2, 0.62); add(deckGeo, woodMat, 0, -0.04);
    if (covered) add(tarpGeo, tarpMat, 0, 0);
    else { add(seatGeo, cushion, 0.62, 0.17); add(backGeo, cushion, 0.02, 0.4); add(sternGeo, woodMat, -4.5, 0.6); } // the passengers' little sofa: an upholstered seat and a bolster back
    world.add(g);
    return g;
  };
  const gondolierMat = keep(new THREE.MeshBasicMaterial({ map: keep(veniceGondolier(THREE)), alphaTest: 0.5, side: THREE.DoubleSide }));
  const standGeo = keep(new THREE.PlaneGeometry(1, 1));
  standGeo.translate(0, 0.5, 0);
  const movers = [[-1, 2.2, -26], [1, -2.2, -120], [-1, 2.2, -205]].map(([dir, x, z]) => {
    const man = new THREE.Mesh(standGeo, gondolierMat);
    world.add(man);
    const lamp = new THREE.Sprite(lampMat);
    lamp.scale.setScalar(1.3); lamp.renderOrder = 20;
    world.add(lamp);
    return { g: makeGondola(false), man, lamp, dir, x, z, speed: 1.12, phase: r(0, 6.28) };
  });
  const moored = [[-8.05, -24.9], [-6.45, -23.9]].map(([x, z]) => { const g = makeGondola(true); g.position.set(x, 0, z); return { g, p: r(0, 6.28) }; }); // side by side along the left bank
  const stern = new THREE.Vector3(), bow = new THREE.Vector3();
  function stepGondolas(dt, t) {
    for (const m of movers) {
      m.phase += dt * 2.1; // a stroke of the oar every three seconds
      m.z += m.dir * m.speed * (0.85 + 0.3 * Math.max(0, Math.sin(m.phase))) * dt;
      if (m.dir < 0 && m.z < -335) m.z = 14;
      if (m.dir > 0 && m.z > 14) m.z = -335;
      m.g.position.set(m.x + Math.sin(t * 0.21 + m.x) * 0.12, 0.02 * Math.sin(t * 1.1 + m.x), m.z);
      m.g.rotation.set(0.012 * Math.sin(t * 0.9 + m.x), (m.dir < 0 ? Math.PI / 2 : -Math.PI / 2) + 0.025 * Math.sin(m.phase), 0, "YXZ");
      m.g.updateMatrixWorld();
      stern.set(-4.4, 0, 0).applyMatrix4(m.g.matrixWorld); bow.set(5.0, 1.0, 0).applyMatrix4(m.g.matrixWorld); // the sprite stands in the water: its feet are painted 0.62 m up, on the stern deck
      m.man.position.copy(stern);
      m.man.rotation.set(0, Math.atan2(camera.position.x - stern.x, camera.position.z - stern.z), 0.05 * Math.sin(m.phase), "YXZ"); // leaning into the stroke
      m.man.scale.set(m.dir < 0 ? 1.3 : -1.3, 2.6, 1); // coming towards us the oar is on our left
      m.lamp.position.copy(bow);
    }
    for (const mo of moored) { mo.g.position.y = 0.03 * Math.sin(t * 0.8 + mo.p); mo.g.rotation.set(0.02 * Math.sin(t * 0.7 + mo.p), Math.PI / 2, 0, "YXZ"); }
  }
  function stepWalkers(dt, t) {
    for (const w of walkers) {
      w.x += w.dir * w.speed * dt;
      if (Math.abs(w.x) > 10.4) { w.x = -w.dir * 10.4; w.speed = r(1.0, 1.4); }
      w.m.position.set(w.x, VENICE_DECK(w.x) + Math.abs(Math.sin(t * 6 + w.k)) * 0.03, BRIDGE_Z - 0.8);
      w.m.scale.set(0.85 * w.dir, 1.7, 1);
    }
  }

  /* --- gulls over the rooftops by day --- */
  const NGULL = preview ? 2 : 4, gullGeo = keep(lhGull(THREE)), aGull = new THREE.InstancedBufferAttribute(new Float32Array(NGULL * 2), 2);
  aGull.setUsage(THREE.DynamicDrawUsage);
  gullGeo.setAttribute("aGull", aGull);
  const gullMesh = new THREE.InstancedMesh(gullGeo, shader(LH_GULL_VS, LH_GULL_FS, { uBody: { value: new THREE.Color("#f5f7f9") }, uWing: { value: new THREE.Color("#c2c9d1") }, uTip: { value: new THREE.Color("#1c2025") } }), NGULL);
  gullMesh.frustumCulled = false; gullMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  world.add(gullMesh);
  const gulls = Array.from({ length: NGULL }, () => ({ a: r(0, 6.28), R: r(9, 17), w: (r() < 0.5 ? -1 : 1) * r(0.12, 0.2), h: r(26, 40), cz: r(-110, -60), beat: r(0, 6.28), amp: 0.3, flap: r() < 0.5, timer: r(1, 4) }));
  function stepGulls(dt) {
    gulls.forEach((g, i) => {
      if ((g.timer -= dt) <= 0) { g.flap = !g.flap; g.timer = g.flap ? r(1.5, 3) : r(3, 6); }
      g.amp += ((g.flap ? 0.5 : 0.05) - g.amp) * Math.min(1, dt * 3);
      g.beat += dt * (g.flap ? 8.5 : 2);
      g.a += g.w * dt;
      V.set(Math.cos(g.a) * g.R, g.h + Math.sin(g.a * 0.7) * 2, g.cz + Math.sin(g.a) * g.R * 0.7);
      const vx = -Math.sin(g.a) * g.R * g.w, vz = Math.cos(g.a) * g.R * 0.7 * g.w;
      E.set(0, Math.atan2(-vx, -vz), g.w > 0 ? 0.3 : -0.3, "YXZ");
      gullMesh.setMatrixAt(i, M4.compose(V, Q.setFromEuler(E), S3.setScalar(1.3)));
      aGull.setXY(i, g.beat, g.amp);
    });
    gullMesh.instanceMatrix.needsUpdate = aGull.needsUpdate = true;
  }

  /* --- the lanterns at night: glows on the walls and the bridge; the nearest light the walls round them --- */
  for (const L of lampList) if (!(L.x > 0 && L.y < 3.8 && L.z < aw0 + 0.6 && L.z > aw1 - 0.6)) glowPts.push([L.x, L.y, L.z, 1.6]); // the café's lanterns are under its awning
  const glowQuad = keep(new THREE.PlaneGeometry(1, 1)), glowGeo = keep(new THREE.InstancedBufferGeometry());
  glowGeo.setIndex(glowQuad.index); glowGeo.setAttribute("position", glowQuad.attributes.position); glowGeo.setAttribute("uv", glowQuad.attributes.uv);
  glowGeo.setAttribute("aGlow", new THREE.InstancedBufferAttribute(new Float32Array(glowPts.flat()), 4));
  glowGeo.instanceCount = glowPts.length;
  const glowMesh = new THREE.Mesh(glowGeo, shader(VENICE_GLOW_VS, VENICE_GLOW_FS, { uMap: { value: glow }, uColor: { value: new THREE.Color("#ffbf78") }, uTime: time }, { transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  glowMesh.frustumCulled = false; glowMesh.renderOrder = 20; // halos are in the eye: a wall does not cut them off
  world.add(glowMesh);
  const lamps24 = lampList.slice().sort((a, b) => b.z - a.z).slice(0, 24);

  /* --- the canal: the mirrored world, broken by wavelets --- */
  const reflectRT = keep(new THREE.WebGLRenderTarget(4, 4, { samples: preview ? 0 : 4 })); // multisampled: the roof edges stay smooth in the mirror
  reflectRT.texture.colorSpace = THREE.SRGBColorSpace;
  const waterUni = { tReflect: { value: reflectRT.texture }, uNoise: { value: noise }, uRes: { value: new THREE.Vector2(1, 1) }, uTime: time, uDeep: { value: new THREE.Color() }, uSheen: { value: new THREE.Color() } };
  const waterGeo = keep(new THREE.PlaneGeometry(1400, 1500));
  waterGeo.rotateX(-Math.PI / 2);
  const water = new THREE.Mesh(waterGeo, keep(new THREE.ShaderMaterial({ uniforms: waterUni, vertexShader: LANTERN_LAKE_VS, fragmentShader: VENICE_WATER_FS })));
  water.position.z = -740; water.renderOrder = -5; water.frustumCulled = false;
  scene.add(water);

  /* --- close by: the stone coping of the bridge we stand on (not in the reflection) --- */
  const copingMat = keep(new THREE.MeshStandardMaterial({ map: keep(veniceCoping(THREE)), roughness: 0.9, envMapIntensity: 0.35, fog: false }));
  const coping = new THREE.Mesh(keep(new THREE.BoxGeometry(1, 1, 1)), copingMat);
  coping.frustumCulled = false;
  near.add(coping);

  const RS = 0.5, buf = new THREE.Vector2();
  let reflecting = false;
  const flipLights = (s) => { flip.value = s; sun.position.y = Math.abs(sun.position.y) * s; const c0 = hemi.color.clone(); hemi.color.copy(hemi.groundColor); hemi.groundColor.copy(c0); }; // the mirror image is lit from below
  sky.onBeforeRender = (renderer, sc, cam) => {
    if (reflecting) return;
    reflecting = true;
    renderer.getDrawingBufferSize(buf);
    waterUni.uRes.value.copy(buf);
    const w = Math.max(2, Math.round(buf.x * RS)), h = Math.max(2, Math.round(buf.y * RS));
    if (reflectRT.width !== w || reflectRT.height !== h) reflectRT.setSize(w, h);
    world.scale.y = -1; water.visible = false; near.visible = false; flipLights(-1);
    const before = renderer.getRenderTarget();
    renderer.setRenderTarget(reflectRT);
    renderer.render(sc, cam);
    renderer.setRenderTarget(before);
    world.scale.y = 1; water.visible = true; near.visible = true; flipLights(1);
    world.updateMatrixWorld(true);
    reflecting = false;
  };

  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    accent.set(p.accent);
    buildEnv(d);
    skyUni.uZenith.value.set(d ? "#050a1c" : "#6f93cf"); skyUni.uMid.value.set(d ? "#0c1634" : "#e9b39a"); skyUni.uHorizon.value.set(d ? "#1c2a50" : "#ffd6a2");
    skyUni.uGlow.value.set(d ? "#2c2640" : "#ffb070").multiplyScalar(0.45); skyUni.uSun.value = d ? 0 : 1.8;
    starMat.opacity = d ? 0.85 : 0; stars.visible = moon.visible = moonHalo.visible = d;
    cloudMat.color.set(d ? "#26345e" : "#fff0e4"); cloudMat.opacity = d ? 0.35 : 0.6;
    litU.uSunCol.value.set(d ? "#8fa2d0" : "#ffcb8c").multiplyScalar(d ? 0.3 : 1.4);
    litU.uAmb.value.set(d ? "#1c2544" : "#8093b6").multiplyScalar(d ? 0.55 : 0.6);
    facadeUni.uBounce.value.set(d ? "#000000" : "#e2a070").multiplyScalar(0.22);
    facadeUni.uSkyRefl.value.set(d ? "#141c34" : "#b4c6de");
    facadeUni.uNight.value = d ? 1 : 0;
    lamps24.forEach((L, i) => facadeUni.uLamps.value[i].set(L.x, L.y, L.z, d ? 1 : 0));
    fogU.uFog.value.set(d ? "#121a34" : "#f0cfaa"); fogU.uFogNear.value = d ? 90 : 140; fogU.uFogFar.value = d ? 700 : 950;
    scene.fog.color.copy(fogU.uFog.value); scene.fog.near = fogU.uFogNear.value; scene.fog.far = fogU.uFogFar.value;
    sun.color.set(d ? "#8fa2d0" : "#ffd29a"); sun.intensity = d ? 0.35 : 2.2; sun.position.copy(SUN).multiplyScalar(100);
    hemi.color.set(d ? "#27325a" : "#a8bce0"); hemi.groundColor.set(d ? "#0a0a10" : "#6a4a38"); hemi.intensity = d ? 0.5 : 1.0;
    waterUni.uDeep.value.set(d ? "#03111a" : "#2d5a4e"); waterUni.uSheen.value.set(d ? "#ffcf8a" : "#fff2d8").multiplyScalar(d ? 0.25 : 0.5);
    farUni.uBody.value.set(d ? "#141a30" : "#a39cb4"); farUni.uRim.value.set("#ffc890").multiplyScalar(d ? 0 : 0.8); farUni.uWin.value.set(d ? "#ffbe6a" : "#000000");
    glowMesh.visible = d; for (const m of movers) m.lamp.visible = d;
    awnUni.uLight.value.set(d ? "#6a6f88" : "#e0d8d0"); awnUni.uUnder.value.set(d ? "#ffb870" : "#b8a898").multiplyScalar(d ? 0.9 : 0.8);
    tableMat.color.set(d ? "#c8a07a" : "#d8d0c8");
    cushion.color.copy(accent);
    for (const i of accentPoles) poleMesh.setColorAt(i, accent);
    if (poleMesh.instanceColor) poleMesh.instanceColor.needsUpdate = true;
    for (const i of accentCloth) clothMesh.setColorAt(i, accent);
    if (clothMesh.instanceColor) clothMesh.instanceColor.needsUpdate = true;
    clothUni.uLight.value.set(d ? "#4a5270" : "#f2e6d8");
    gondolierMat.color.set(d ? "#6a6f88" : "#f0e0d0"); peopleMat.color.copy(gondolierMat.color);
    gullMesh.visible = !d; walkers[2].m.visible = !d;
    copingMat.color.set(d ? "#8a90a8" : "#fff4ea");
  }
  applyPalette(pal);

  const look = new THREE.Vector3();
  function layout() {
    const A = camera.aspect || 1, fov = A >= 1 ? 50 : 50 + (1 - A) * 22; // a phone held upright sees more sky and water
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); TAN = Math.tan((fov * Math.PI) / 360); }
    const drop = 1.77 * Math.tan(Math.atan(0.82 * TAN) - PITCH); // its far edge 82% of the way down from the middle, whatever the field of view
    coping.scale.set(2 * halfW(1.9) + 1.6, 0.2, 0.3); coping.position.set(0, EYE - drop - 0.1, -1.62); // its top a band along the foot of any screen
    coping.updateMatrixWorld();
  }
  scene.onBeforeRender = layout; // before the frustum is taken, on every render: a still frame gets no update() call
  function frame(dt, t) {
    time.value = t;
    const cx = Math.sin(t * 0.02) * 0.35;
    camera.position.set(cx, EYE + Math.sin(t * 0.05) * 0.03, 0);
    camera.lookAt(look.set(cx * 0.3, EYE + Math.tan(PITCH) * 100, -100));
    for (const c of clouds) { c.m.position.x += c.speed * dt; if (c.m.position.x > 2200) c.m.position.x = -2200; }
    stepGondolas(dt, t);
    stepWalkers(dt, t);
    if (!pal.dark) stepGulls(dt);
    for (const tb of tables) tb.rotation.y = Math.atan2(camera.position.x - tb.position.x, camera.position.z - tb.position.z);
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { return { gondolas: movers.map((m) => Math.round(m.z)), walkers: walkers.map((w) => +w.x.toFixed(1)), lamps: lampList.length, poles: poleSpots.length, laundry: clothes.length, chimneys: blocks.stacks.length }; }, // for checking by hand
    dispose() { scene.environment = null; scene.fog = null; envTex?.dispose(); disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Santorini sunset: a Cycladic village cascading down the caldera rim above the sea at sunset; lit up at night ---------- */
// The houses are solid rounded blocks (the Venice lesson: painted cards read as cardboard), lit by a low sun that casts real shadows.
// The sea needs no mirror pass: from a hundred metres up it only has to mirror the sky. Its slopes come from three drifting noise
// scales; the sun's (or the moon's) glitter path, the boats' wakes and the haze at the horizon are added on top.
const SANTORINI_SEA_FS = /* glsl */ `
  uniform sampler2D uNoise; uniform float uTime; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform float uGlint;
  uniform vec3 uDeep; uniform vec3 uZenith; uniform vec3 uHorizon; uniform vec3 uHaze; uniform vec3 uFoam; uniform vec4 uBoats[3];
  varying vec3 vWorld;
  void main() {
    vec3 toEye = cameraPosition - vWorld; float dist = length(toEye); vec3 V = toEye / dist;
    vec2 p = vWorld.xz;
    // three noise scales, each turned a different way so their lattices never line up (value noise shows its grid when they do)
    vec2 p1 = mat2(0.8, -0.6, 0.6, 0.8) * p, p2 = mat2(0.36, 0.93, -0.93, 0.36) * p, p3 = mat2(-0.5, 0.87, -0.87, -0.5) * p;
    float nearby = 1.0 - smoothstep(250.0, 900.0, dist);
    vec2 s = (texture2D(uNoise, p1 * 0.0031 + uTime * vec2(0.0011, 0.0016)).rg - 0.5) * 0.55
           + (texture2D(uNoise, p2 * 0.0137 - uTime * vec2(0.0042, 0.0031)).rg - 0.5) * 0.8
           + (texture2D(uNoise, p3 * 0.0593 + uTime * vec2(0.009, -0.011)).rg - 0.5) * 0.7 * nearby;
    float calm = 1.0 / (1.0 + dist * 0.0011); // far off the slopes average out
    vec3 N = normalize(vec3(s.x * 0.45 * calm, 1.0, s.y * 0.45 * calm));
    vec3 R = reflect(-V, N); R.y = abs(R.y);
    float fres = 0.02 + 0.98 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
    vec3 col = mix(uDeep, mix(uHorizon, uZenith, smoothstep(0.0, 0.45, R.y)), fres);
    float sd = max(dot(R, uSunDir), 0.0);
    col += uSunCol * (pow(sd, 1400.0) * 12.0 * uGlint + pow(sd, 90.0) * 0.45 + pow(sd, 10.0) * 0.05);
    for (int i = 0; i < 3; i++) { // wakes: a V of two arms at the Kelvin angle and a churned trail
      vec2 q = p - uBoats[i].xy; float c = cos(uBoats[i].z), sn = sin(uBoats[i].z);
      float behind = -(c * q.x + sn * q.y), across = -sn * q.x + c * q.y;
      if (behind > -3.0 && behind < 300.0) {
        float fade = 1.0 - clamp(behind / 300.0, 0.0, 1.0), b = max(behind, 0.0);
        float arms = exp(-abs(abs(across) - b * 0.34) * 0.8) * fade * fade * smoothstep(0.0, 6.0, b);
        float trail = exp(-abs(across) * 0.5) * exp(-b * 0.014);
        col = mix(col, uFoam, clamp((arms * 0.5 + trail * 0.75) * uBoats[i].w, 0.0, 0.85));
      }
    }
    col = mix(col, uHaze, smoothstep(1800.0, 16000.0, dist));
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// a deck of altocumulus far overhead: thin edges glow in the sunset, thick middles shade lilac; fades out towards the horizon
const SANTORINI_CLOUD_FS = /* glsl */ `
  uniform sampler2D uNoise; uniform float uTime; uniform vec3 uSunDir; uniform vec3 uLit; uniform vec3 uShade; uniform vec3 uGlow; uniform vec3 uHaze;
  varying vec3 vWorld;
  void main() {
    vec2 p = vWorld.xz;
    float n = texture2D(uNoise, p * vec2(0.00008, 0.0002) + vec2(uTime * 0.0003, 0.0)).r * 0.62
            + texture2D(uNoise, p * vec2(0.00029, 0.00075) - vec2(uTime * 0.0006, 0.0)).g * 0.38;
    float cover = smoothstep(0.5, 0.64, n);
    if (cover < 0.01) discard;
    vec3 d = normalize(vWorld - cameraPosition);
    float dist = length(vWorld.xz - cameraPosition.xz);
    float towards = pow(max(dot(normalize(d.xz), normalize(uSunDir.xz)), 0.0), 4.0);
    float thin = 1.0 - smoothstep(0.56, 0.8, n);
    vec3 col = mix(uShade, uLit, 0.3 + 0.7 * thin) + uGlow * towards * (0.35 + 0.65 * thin);
    col = mix(col, uHaze, smoothstep(5000.0, 26000.0, dist) * 0.75);
    gl_FragColor = vec4(col, cover * (1.0 - smoothstep(12000.0, 32000.0, dist)));
    #include <colorspace_fragment>
  }
`;
// the caldera wall across the bay: strata, gullies, the sunset on its face; the villages along its top, their lights at night
const SANTORINI_RIM_VS = /* glsl */ `
  attribute vec3 aRim; // metres above the sea, metres along the rim, how far up the face (0 foot, 1 top)
  varying vec3 vWorld; varying vec3 vN; varying vec3 vRim;
  void main() { vRim = aRim; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; vN = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * w; }
`;
const SANTORINI_RIM_FS = /* glsl */ `
  uniform sampler2D uNoise; uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uAmb; uniform vec3 uHaze; uniform vec3 uWarm; uniform float uNight; uniform float uTime;
  varying vec3 vWorld; varying vec3 vN; varying vec3 vRim;
  void main() {
    float y = vRim.x, s = vRim.y, up = vRim.z;
    float gully = texture2D(uNoise, vec2(s * 0.004, y * 0.0016)).r, band = texture2D(uNoise, vec2(s * 0.0006, y * 0.011)).g;
    vec3 rock = mix(vec3(0.15, 0.1, 0.09), vec3(0.45, 0.22, 0.14), smoothstep(0.2, 0.45, up));
    rock = mix(rock, vec3(0.7, 0.62, 0.52), smoothstep(0.55, 0.6, band) * smoothstep(0.45, 0.75, up)); // a pale pumice band
    rock = mix(rock, vec3(0.32, 0.13, 0.09), smoothstep(0.62, 0.68, band + up * 0.2) * (1.0 - smoothstep(0.86, 0.94, up)));
    rock *= 0.72 + 0.56 * gully;
    float town = smoothstep(0.89, 0.92, up) * smoothstep(0.38, 0.52, texture2D(uNoise, vec2(s * 0.011, 0.31)).r);
    vec3 col = mix(rock, vec3(0.93, 0.91, 0.87), town) * (uAmb + uSunCol * max(dot(normalize(vN), uSunDir), 0.0));
    col += uWarm * town * smoothstep(0.58, 0.66, texture2D(uNoise, vec2(s * 0.05, y * 0.12)).g) * (0.8 + 0.2 * sin(uTime * 2.0 + s)) * uNight * 3.0;
    col = mix(col, uHaze, smoothstep(500.0, 9000.0, distance(vWorld, cameraPosition)) * 0.72);
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
// the islands in the caldera as masks: r silhouette, g the sunlit rim along the top, b village lights at night
const SANTORINI_ISLE_FS = /* glsl */ `
  uniform sampler2D uMask; uniform vec3 uBody; uniform vec3 uRim; uniform vec3 uLights; uniform float uTime;
  varying vec2 vUv;
  void main() {
    vec3 m = texture2D(uMask, vUv).rgb;
    if (m.r < 0.02) discard;
    vec3 col = uBody * (0.86 + 0.14 * vUv.y) + uRim * m.g + uLights * m.b * (0.8 + 0.2 * sin(uTime * 1.6 + vUv.x * 230.0));
    gl_FragColor = vec4(col, m.r);
    #include <colorspace_fragment>
  }
`;
// bougainvillea hanging over the walls: camera-facing cascades that stir a little
const SANTORINI_FLOWER_VS = /* glsl */ `
  uniform float uTime;
  attribute vec4 aFlower; // where it hangs from, its size
  attribute vec2 aFlower2; // atlas cell, phase
  varying vec2 vUv;
  void main() {
    vec4 mv = modelViewMatrix * vec4(aFlower.xyz, 1.0);
    vec2 q = position.xy; // from (-0.5, -1) to (0.5, 0): it hangs from its top
    q.x += sin(uTime * 0.9 + aFlower2.y) * 0.035 * -q.y;
    mv.xy += q * aFlower.w;
    vUv = vec2((uv.x + aFlower2.x) / 3.0, uv.y);
    gl_Position = projectionMatrix * mv;
  }
`;
const SANTORINI_FLOWER_FS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uLight;
  varying vec2 vUv;
  void main() {
    vec4 t = texture2D(uMap, vUv);
    if (t.a < 0.04) discard;
    gl_FragColor = vec4(t.rgb * uLight, t.a);
    #include <colorspace_fragment>
  }
`;
/** The land: a crest falling away ahead of us, the west slope stepping down to the caldera edge, the edge curving round in front to the
 *  promontory's tip, the cliff below it; the east slope down to the Aegean on the left. */
function santoriniRidge(z) { return 96 - Math.max(0, -z) * 0.1 + 2.5 * Math.sin(z * 0.013); }
function santoriniEdge(z) { return 70 + 8 * Math.sin(z * 0.011 + 1) - (z < -140 ? Math.pow((-140 - z) / 170, 1.6) * 115 : 0); }
function santoriniGround(x, z) {
  const R = santoriniRidge(z), edge = santoriniEdge(z), RX = -46;
  let h;
  if (x <= RX) h = R - Math.pow(Math.min(1, (RX - x) / 280), 1.25) * (R + 8);
  else if (x <= edge) h = R - 30 * Math.pow((x - RX) / Math.max(20, edge - RX), 1.3);
  else h = R - 30 - (x - edge) * 2.6;
  if (z < -330) h -= (-330 - z) * 1.2;
  if (z > 40) h -= (z - 40) * 1.2;
  return Math.max(h, -8);
}
/** A whitewashed block with softly rounded edges (the RoundedBoxGeometry recipe; seg 0 = a plain box), no floor face, non-indexed. */
function santoriniBlockGeo(THREE, w, h, d, rad, seg) {
  const n = 2 * seg + 1, hs = 0.5 / n, R = seg ? Math.min(rad, w / 2, h / 2, d / 2) * 0.999 : 0, B = [w / 2 - R, h / 2 - R, d / 2 - R], S = [w, h, d];
  const pos = [], nrm = [], p = [0, 0, 0], q = [0, 0, 0];
  const faces = [[0, 1, 2, 1], [0, 1, 2, -1], [1, 2, 0, 1], [2, 0, 1, 1], [2, 0, 1, -1]]; // +x, −x, +y, +z, −z
  for (const [ax, ua, va, sg] of faces) for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const u0 = -0.5 + i / n, u1 = u0 + 1 / n, v0 = -0.5 + j / n, v1 = v0 + 1 / n;
    const tri = sg > 0 ? [[u0, v0], [u1, v0], [u1, v1], [u0, v0], [u1, v1], [u0, v1]] : [[u0, v0], [u1, v1], [u1, v0], [u0, v0], [u0, v1], [u1, v1]];
    for (const [u, v] of tri) {
      p[ax] = 0.5 * sg; p[ua] = u; p[va] = v;
      if (!seg) { for (let k = 0; k < 3; k++) { pos.push(p[k] * S[k]); nrm.push(k === ax ? sg : 0); } continue; }
      for (let k = 0; k < 3; k++) q[k] = p[k] - Math.sign(p[k]) * hs;
      const l = Math.hypot(q[0], q[1], q[2]);
      for (let k = 0; k < 3; k++) { q[k] /= l; pos.push(B[k] * Math.sign(p[k]) + q[k] * R); nrm.push(q[k]); }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
/** A barrel vault (the cave houses' roofs): a half cylinder along z, its ends closed, non-indexed. */
function santoriniVaultGeo(THREE, rad, len, seg) {
  const pos = [], nrm = [], P = (a, z) => [Math.cos(a) * rad, Math.sin(a) * rad, z];
  for (let i = 0; i < seg; i++) {
    const a0 = (Math.PI * i) / seg, a1 = (Math.PI * (i + 1)) / seg, zf = len / 2, zb = -len / 2;
    const A = P(a0, zf), B = P(a1, zf), C = P(a1, zb), D = P(a0, zb);
    for (const [pt, a] of [[A, a0], [D, a0], [C, a1], [A, a0], [C, a1], [B, a1]]) { pos.push(...pt); nrm.push(Math.cos(a), Math.sin(a), 0); }
    for (const [pt, s] of [[[0, 0, zf], 1], [P(a0, zf), 1], [P(a1, zf), 1], [[0, 0, zb], -1], [P(a1, zb), -1], [P(a0, zb), -1]]) { pos.push(...pt); nrm.push(0, 0, s); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nrm, 3));
  return g;
}
/** Doors, windows and a lantern for the walls, 4 × 2 cells: 0 arched door, 1 panelled door, 2 shutters shut, 3 shutters open, 4 small
 *  window, 5 arched window, 6 round window, 7 wall lantern. Mask: r = glass lit at night, g = painted in the accent colour. */
function santoriniDecals(THREE) {
  const W = 1024, H = 512, c = document.createElement("canvas"), mc = document.createElement("canvas");
  c.width = mc.width = W; c.height = mc.height = H;
  const g = c.getContext("2d"), mk = mc.getContext("2d");
  mk.fillStyle = "#000"; mk.fillRect(0, 0, W, H);
  const cell = (i, draw) => { for (const k of [g, mk]) { k.save(); k.translate((i % 4) * 256, Math.floor(i / 4) * 256); k.beginPath(); k.rect(0, 0, 256, 256); k.clip(); } draw(); g.restore(); mk.restore(); };
  const glass = (path) => { const gr = g.createLinearGradient(0, 0, 256, 256); gr.addColorStop(0, "#3b4a5c"); gr.addColorStop(0.55, "#222c38"); gr.addColorStop(1, "#171d25"); g.fillStyle = gr; path(g); g.fill(); mk.fillStyle = "rgb(255,0,0)"; path(mk); mk.fill(); };
  const paint = (path, base) => { g.fillStyle = base; path(g); g.fill(); mk.fillStyle = "rgb(0,255,0)"; path(mk); mk.fill(); };
  const arch = (k, x0, x1, y0, y1, ry) => { k.beginPath(); k.moveTo(x0, y1); k.lineTo(x0, y0 + ry); k.ellipse((x0 + x1) / 2, y0 + ry, (x1 - x0) / 2, ry, 0, Math.PI, 0); k.lineTo(x1, y1); k.closePath(); };
  const planks = (x0, x1, y0, y1, n) => { g.strokeStyle = "rgba(0,0,0,0.28)"; g.lineWidth = 3; for (let i = 1; i < n; i++) { const x = x0 + ((x1 - x0) * i) / n; g.beginPath(); g.moveTo(x, y0); g.lineTo(x, y1); g.stroke(); } };
  const louvres = (x0, x1, y0, y1) => { g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 3; for (let y = y0 + 10; y < y1 - 6; y += 13) { g.beginPath(); g.moveTo(x0 + 8, y); g.lineTo(x1 - 8, y); g.stroke(); } g.strokeStyle = "rgba(0,0,0,0.35)"; g.lineWidth = 5; g.strokeRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4); };
  const frame = "#d8d2c8";
  cell(0, () => { // arched door, 1.2 × 2.3 m: the arch's rise is 0.6 m = 67 px
    g.fillStyle = frame; arch(g, 0, 256, 0, 256, 67); g.fill();
    glass((k) => arch(k, 16, 240, 14, 70, 55));
    g.strokeStyle = frame; g.lineWidth = 6; g.beginPath(); for (const a of [0.25, 0.5, 0.75]) { g.moveTo(128, 70); g.lineTo(128 - Math.cos(Math.PI * a) * 112, 70 - Math.sin(Math.PI * a) * 55); } g.stroke();
    paint((k) => { k.beginPath(); k.rect(16, 74, 224, 170); }, "#9d9d9d"); planks(16, 240, 74, 244, 6);
    g.fillStyle = "#3a3a3a"; g.beginPath(); g.arc(200, 168, 6, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#cfc8bc"; g.fillRect(0, 244, 256, 12);
  });
  cell(1, () => { // panelled door with a small pane, 1.0 × 2.1 m
    g.fillStyle = frame; g.fillRect(0, 0, 256, 256);
    paint((k) => { k.beginPath(); k.rect(18, 14, 220, 230); }, "#a2a2a2");
    g.strokeStyle = "rgba(0,0,0,0.3)"; g.lineWidth = 5; for (const [x, y, w, h] of [[38, 110, 76, 58], [142, 110, 76, 58], [38, 180, 76, 56], [142, 180, 76, 56]]) g.strokeRect(x, y, w, h);
    glass((k) => { k.beginPath(); k.rect(52, 30, 152, 62); });
    g.fillStyle = frame; g.fillRect(126, 30, 6, 62);
    g.fillStyle = "#cfc8bc"; g.fillRect(0, 244, 256, 12);
  });
  cell(2, () => { // shutters shut, 0.95 × 1.2 m
    g.fillStyle = frame; g.fillRect(0, 0, 256, 256);
    paint((k) => { k.beginPath(); k.rect(14, 14, 228, 228); }, "#a6a6a6");
    louvres(14, 128, 14, 242); louvres(128, 242, 14, 242);
  });
  cell(3, () => { // shutters open either side of the glass, 1.7 × 1.2 m
    paint((k) => { k.beginPath(); k.rect(0, 10, 60, 236); k.rect(196, 10, 60, 236); }, "#a6a6a6");
    louvres(0, 60, 10, 246); louvres(196, 256, 10, 246);
    g.fillStyle = frame; g.fillRect(62, 0, 132, 256);
    glass((k) => { k.beginPath(); k.rect(74, 14, 108, 226); });
    g.fillStyle = frame; g.fillRect(124, 14, 8, 226); g.fillRect(74, 108, 108, 7);
  });
  cell(4, () => { // small window, 0.7 × 0.7 m
    g.fillStyle = frame; g.fillRect(0, 0, 256, 256);
    glass((k) => { k.beginPath(); k.rect(26, 26, 204, 204); });
    g.fillStyle = frame; g.fillRect(122, 26, 12, 204); g.fillRect(26, 122, 204, 12);
  });
  cell(5, () => { // arched window, 0.9 × 1.35 m: the arch's rise 0.45 m = 85 px
    g.fillStyle = frame; arch(g, 0, 256, 0, 256, 85); g.fill();
    glass((k) => arch(k, 22, 234, 20, 240, 68));
    g.fillStyle = frame; g.fillRect(122, 20, 12, 220); g.fillRect(22, 140, 212, 10);
  });
  cell(6, () => { // round window, 0.75 m
    g.fillStyle = frame; g.beginPath(); g.arc(128, 128, 126, 0, Math.PI * 2); g.fill();
    glass((k) => { k.beginPath(); k.arc(128, 128, 98, 0, Math.PI * 2); });
    g.fillStyle = frame; g.fillRect(122, 30, 12, 196); g.fillRect(30, 122, 196, 12);
  });
  cell(7, () => { // wall lantern, 0.35 × 0.55 m
    g.fillStyle = "#1e1e20"; g.fillRect(118, 0, 20, 60); g.fillRect(40, 52, 176, 22); g.beginPath(); g.moveTo(40, 74); g.lineTo(216, 74); g.lineTo(128, 30); g.closePath(); g.fill();
    glass((k) => { k.beginPath(); k.rect(62, 74, 132, 132); });
    g.fillStyle = "rgba(255,240,210,0.35)"; g.fillRect(62, 74, 132, 132);
    g.strokeStyle = "#1e1e20"; g.lineWidth = 10; g.strokeRect(62, 74, 132, 132); g.fillStyle = "#1e1e20"; g.fillRect(52, 206, 152, 18); g.fillRect(118, 224, 20, 32);
  });
  const map = new THREE.CanvasTexture(c), mask = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace; mask.colorSpace = THREE.NoColorSpace;
  map.anisotropy = mask.anisotropy = 4;
  return { map, mask };
}
/** Bougainvillea spilling over a wall, three cascades: dense at the top, trailing below; leaves and magenta bracts. */
function santoriniFlowers(THREE) {
  const r = koiRng(808);
  return canvasTexture(THREE, 768, 256, (g) => {
    for (let k = 0; k < 3; k++) {
      const ox = k * 256, trails = [r(40, 90), r(110, 150), r(170, 220)].slice(0, 2 + (k % 2));
      const spot = () => { if (r() < 0.62) { const y = Math.pow(r(), 1.6) * 120, half = 118 - y * 0.35; return [ox + 128 + r(-half, half), y + 8]; } const t = trails[(r() * trails.length) | 0], y = r(60, 240); return [ox + t + r(-18, 18) * (1 - y / 300), y]; };
      for (let i = 0; i < 520; i++) { const [x, y] = spot(); g.fillStyle = r() < 0.5 ? "#2c5427" : "#3f6c33"; g.beginPath(); g.ellipse(x, y, r(5, 10), r(3.5, 6.5), r(0, 3), 0, Math.PI * 2); g.fill(); }
      for (let i = 0; i < 150; i++) {
        const [x, y] = spot(), col = ["#c81e72", "#dd3a92", "#b0165f", "#ef66a6", "#d92c80"][(r() * 5) | 0];
        for (let j = 0; j < 5; j++) { g.fillStyle = col; g.beginPath(); g.ellipse(x + r(-7, 7), y + r(-6, 6), r(3.5, 6), r(3, 5), r(0, 3), 0, Math.PI * 2); g.fill(); }
        g.fillStyle = "rgba(255,210,235,0.5)"; g.beginPath(); g.arc(x + r(-3, 3), y + r(-3, 3), 1.8, 0, Math.PI * 2); g.fill();
      }
    }
  });
}
/** A kampanario: the whitewashed bell gable with two arches and a small one above, bronze bells, a cross on the curved top. 3.6 × 5.4 m. */
function santoriniBelfry(THREE) {
  return canvasTexture(THREE, 256, 384, (g) => {
    const s = 256 / 3.6, Y = (m) => 384 - m * s, X = (m) => 128 + m * s;
    g.fillStyle = "#f3efe8";
    g.beginPath(); g.moveTo(X(-1.8), Y(0)); g.lineTo(X(-1.8), Y(3.3)); g.quadraticCurveTo(X(-1.8), Y(4.1), X(-1.0), Y(4.2)); g.quadraticCurveTo(X(-0.6), Y(4.75), X(0), Y(4.8)); g.quadraticCurveTo(X(0.6), Y(4.75), X(1.0), Y(4.2)); g.quadraticCurveTo(X(1.8), Y(4.1), X(1.8), Y(3.3)); g.lineTo(X(1.8), Y(0)); g.closePath(); g.fill();
    g.fillRect(X(-0.07), Y(5.35), 0.14 * s, 0.6 * s); g.fillRect(X(-0.25), Y(5.15), 0.5 * s, 0.13 * s); // the cross
    g.fillStyle = "rgba(0,0,0,0.06)"; g.fillRect(X(-1.8), Y(1.5), 3.6 * s, 0.08 * s);
    g.save(); g.globalCompositeOperation = "destination-out";
    const opening = (cx, y0, w, h) => { g.beginPath(); g.moveTo(X(cx - w / 2), Y(y0)); g.lineTo(X(cx - w / 2), Y(y0 + h - w / 2)); g.arc(X(cx), Y(y0 + h - w / 2), (w / 2) * s, Math.PI, 0); g.lineTo(X(cx + w / 2), Y(y0)); g.closePath(); g.fill(); };
    opening(-0.8, 1.9, 0.95, 1.55); opening(0.8, 1.9, 0.95, 1.55); opening(0, 3.65, 0.6, 0.8);
    g.restore();
    const bell = (cx, top, w) => { g.fillStyle = "#1c1c1c"; g.fillRect(X(cx - 0.02), Y(top + 0.12), 0.04 * s, 0.14 * s); const gr = g.createLinearGradient(X(cx - w / 2), 0, X(cx + w / 2), 0); gr.addColorStop(0, "#5a4220"); gr.addColorStop(0.4, "#b48a44"); gr.addColorStop(1, "#4a3418"); g.fillStyle = gr; g.beginPath(); g.moveTo(X(cx - w * 0.28), Y(top)); g.quadraticCurveTo(X(cx - w * 0.34), Y(top - w * 0.55), X(cx - w / 2), Y(top - w * 0.8)); g.lineTo(X(cx + w / 2), Y(top - w * 0.8)); g.quadraticCurveTo(X(cx + w * 0.34), Y(top - w * 0.55), X(cx + w * 0.28), Y(top)); g.closePath(); g.fill(); };
    bell(-0.8, 3.0, 0.62); bell(0.8, 3.0, 0.56); bell(0, 4.2, 0.36);
    g.fillStyle = "#1c1c1c"; for (const [x, y] of [[-0.8, 3.2], [0.8, 3.2], [0, 4.33]]) g.fillRect(X(x - 0.5), Y(y), 1.0 * s, 0.05 * s);
  });
}
/** An island seen across the caldera, as masks: r body, g the sunlit rim along its crest, b village lights. prof(u) = height 0…1. */
function santoriniIsle(THREE, W, H, prof, lights, seed) {
  const r = koiRng(seed), c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d");
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.globalCompositeOperation = "lighter";
  const top = (x) => H - 2 - prof(x / W) * (H - 6);
  g.fillStyle = "rgb(255,0,0)"; g.beginPath(); g.moveTo(0, H); for (let x = 0; x <= W; x += 2) g.lineTo(x, top(x)); g.lineTo(W, H); g.closePath(); g.fill();
  g.strokeStyle = "rgb(0,160,0)"; g.lineWidth = 2; g.beginPath(); for (let x = 0; x <= W; x += 2) { const y = top(x) + 1; x ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke();
  for (let i = 0; i < lights; i++) { const x = r(0.1, 0.9) * W, y = top(x) + r(2, 7); g.fillStyle = "rgb(0,0,255)"; g.fillRect(x, y, 2, 2); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
/** The caldera wall across the bay (Imerovigli to Fira): a leaning face along a curve, its top uneven; aRim for the shader. */
function santoriniRimGeo(THREE) {
  const P0 = [-1500, -1100], P1 = [-1350, -3500], P2 = [-760, -6500], NU = 110, NV = 9, pos = [], rim = [], idx = [];
  const at = (u) => [(1 - u) * (1 - u) * P0[0] + 2 * (1 - u) * u * P1[0] + u * u * P2[0], (1 - u) * (1 - u) * P0[1] + 2 * (1 - u) * u * P1[1] + u * u * P2[1]];
  let s = 0, prev = at(0);
  for (let i = 0; i <= NU; i++) {
    const u = i / NU, [x, z] = at(u), [x2, z2] = at(Math.min(1, u + 0.001)), [x1, z1] = at(Math.max(0, u - 0.001));
    s += Math.hypot(x - prev[0], z - prev[1]); prev = [x, z];
    let nx = z2 - z1, nz = -(x2 - x1); const l = Math.hypot(nx, nz); nx /= l; nz /= l; // the caldera side
    if (nx < 0) { nx = -nx; nz = -nz; }
    const Hh = (215 + 70 * Math.sin(u * 2.6 + 0.4) + 22 * Math.sin(u * 19) + 11 * Math.sin(u * 47) + 5 * Math.sin(u * 131)) * (1 - Math.pow(Math.max(0, (u - 0.72) / 0.28), 1.6) * 0.96); // sinks into the sea at its far end
    for (let j = 0; j <= NV; j++) {
      const v = j / NV, y = -6 + (Hh + 6) * v, back = Hh * 0.32 * Math.pow(v, 1.4) + 6 * Math.sin(u * 60 + v * 4) * v;
      pos.push(x - nx * back, y, z - nz * back);
      rim.push(y, s, v);
    }
  }
  for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("aRim", new THREE.Float32BufferAttribute(rim, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal; // face the caldera whatever the winding came out as
  if (n.getX(Math.floor(n.count / 2)) < 0) { for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); }
  return g;
}
/** The ground under and around the village: whitewashed lanes among the houses, volcanic soil and scrub beyond, the strata of the cliff. */
function santoriniTerrainGeo(THREE, nx, nz) {
  const X0 = -330, X1 = 140, Z0 = 70, Z1 = -540, g = new THREE.PlaneGeometry(X1 - X0, Z0 - Z1, nx, nz);
  g.rotateX(-Math.PI / 2); g.translate((X0 + X1) / 2, 0, (Z0 + Z1) / 2);
  const pos = g.attributes.position, col = new Float32Array(pos.count * 3), c = new THREE.Color(), r = koiRng(31);
  const lane = new THREE.Color("#e7e0d5"), lane2 = new THREE.Color("#cfc7ba"), soil = new THREE.Color("#8d6a55"), soil2 = new THREE.Color("#9b5d45"), scrub = new THREE.Color("#5c5e3b");
  const strata = [new THREE.Color("#2e2522"), new THREE.Color("#7c4431"), new THREE.Color("#c7b59b"), new THREE.Color("#5b3a2f"), new THREE.Color("#a0654a")];
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), z = pos.getZ(i), y = santoriniGround(x, z), edge = santoriniEdge(z);
    pos.setY(i, y);
    if (x > edge + 1.5) c.copy(strata[Math.floor((y + 30 + 8 * Math.sin(x * 0.05 + z * 0.02)) / 14) % strata.length]).multiplyScalar(r(0.85, 1.1));
    else if (x > Math.max(-150, edge - 128) && z < 26 && z > -385) c.copy(r() < 0.3 ? lane2 : lane).multiplyScalar(r(0.94, 1.03));
    else c.copy(r() < 0.18 ? scrub : r() < 0.5 ? soil : soil2).multiplyScalar(r(0.85, 1.08));
    col.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute("color", new THREE.BufferAttribute(col, 3));
  g.computeVertexNormals();
  return g;
}
/** Lay out the village: houses stepping down the slope to the caldera edge (flat roofs, some barrel vaults, chimneys, a few pools),
 *  three churches with domes (and bell gables), two windmills on the crest; and where the doors, windows, lanterns and bougainvillea go. */
function santoriniVillage(THREE, preview) {
  const r = koiRng(2718), G = santoriniGround, T = (x, y, z) => new THREE.Matrix4().makeTranslation(x, y, z);
  const white = [], domes = [], decals = [], flowers = [], lamps = [], pools = [], belfries = [], mills = [], taken = [];
  const WHITE = ["#f5f1ea", "#f2ede4", "#f7f4ef", "#efe9df", "#f3eee6"], PASTEL = ["#e6c48c", "#dc9d80", "#ead9b2", "#c3d3e0", "#e9bca6", "#d9b48a"];
  const SIZE = [[1.2, 2.3], [1.0, 2.1], [0.95, 1.2], [1.7, 1.2], [0.7, 0.7], [0.9, 1.35], [0.75, 0.75], [0.35, 0.55]];
  const segAt = (x, z) => { const d = Math.hypot(x, z - 20); return preview ? (d < 110 ? 1 : 0) : d < 80 ? 2 : d < 220 ? 1 : 0; };
  const free = (x, z, rad) => taken.every(([tx, tz, tr]) => Math.hypot(tx - x, tz - z) > tr + rad);
  // doors and windows on a face: (cx, cz) its middle, (nx, nz) its normal, span its width, top the roof
  const dress = (cx, cz, nx, nz, span, top, doorOk) => {
    const tx = -nz, tz = nx, slots = span > 5.2 ? 3 : span > 3.4 ? 2 : 1, rot = Math.atan2(nx, nz);
    for (let k = 0; k < slots; k++) {
      const t = slots === 1 ? 0 : (k / (slots - 1) - 0.5) * (span - 1.9), px = cx + tx * t, pz = cz + tz * t;
      const gy = G(px + nx * 0.8, pz + nz * 0.8), room = top - gy;
      if (room < 1.7) continue;
      const out = (cell, y, lit) => { const [w, h] = SIZE[cell]; decals.push({ x: px + nx * 0.05, y, z: pz + nz * 0.05, w, h, rot, cell, lit }); };
      if (doorOk && k === (slots >> 1) && room > 2.7 && r() < 0.6) {
        const cell = r() < 0.55 ? 0 : 1, h = SIZE[cell][1];
        out(cell, gy + h / 2 - 0.05, 0);
        if (r() < 0.8) { const lx = px + tx * 1.0, lz = pz + tz * 1.0; decals.push({ x: lx + nx * 0.06, y: gy + 2.45, z: lz + nz * 0.06, w: 0.35, h: 0.55, rot, cell: 7, lit: 1 }); lamps.push([lx + nx * 0.35, gy + 2.4, lz + nz * 0.35]); }
      } else {
        const q = r(), cell = q < 0.26 ? 2 : q < 0.46 ? 3 : q < 0.7 ? 4 : q < 0.9 ? 5 : 6, h = SIZE[cell][1];
        if (room > 2.4) out(cell, gy + 1.15 + h / 2, r() < 0.7 ? r(0.55, 1) : 0);
        if (room > 5.6) { const c2 = r() < 0.5 ? 4 : 2; out(c2, gy + 3.9 + SIZE[c2][1] / 2, r() < 0.65 ? r(0.55, 1) : 0); }
      }
    }
  };
  // the churches, their domes, a bell gable beside two of them
  for (const [x, z, s, gable] of [[20, -58, 1.2, true], [-22, -118, 0.95, true], [42, -128, 0.85, false], [-64, -34, 0.8, false], [4, -196, 0.85, false], [-30, -232, 0.8, true]]) {
    const w = 6.2 * s, h = 5.2 * s, y0 = Math.min(G(x - w / 2, z), G(x + w / 2, z), G(x, z - w / 2), G(x, z + w / 2)) - 0.6, top = Math.max(G(x - w / 2, z), G(x + w / 2, z)) + h;
    white.push([santoriniBlockGeo(THREE, w, top - y0, w, 0.3, 2), T(x, (y0 + top) / 2, z), "#f6f3ee"]);
    white.push([new THREE.CylinderGeometry(2.1 * s, 2.1 * s, 1.3 * s, 22, 1, true), T(x, top + 0.6 * s, z), "#f6f3ee"]);
    domes.push([new THREE.SphereGeometry(2.4 * s, 26, 10, 0, Math.PI * 2, 0, Math.PI / 2), T(x, top + 1.2 * s, z)]);
    white.push([new THREE.CylinderGeometry(0.3 * s, 0.34 * s, 0.7 * s, 10), T(x, top + 3.85 * s, z), "#f6f3ee"]);
    white.push([new THREE.BoxGeometry(0.13 * s, 1.1 * s, 0.13 * s), T(x, top + 4.7 * s, z), "#f6f3ee"], [new THREE.BoxGeometry(0.62 * s, 0.13 * s, 0.13 * s), T(x, top + 4.95 * s, z), "#f6f3ee"]);
    dress(x, z + w / 2, 0, 1, w, top, true); dress(x + (x < 0 ? w / 2 : -w / 2), z, x < 0 ? 1 : -1, 0, w, top, false);
    if (gable) belfries.push([x + (x < 0 ? -1 : 1) * (w / 2 + 1.9 * s), G(x + (x < 0 ? -1 : 1) * (w / 2 + 1.9 * s), z + 1) - 0.3, z + 1.2, s]);
    taken.push([x, z, 7.5 * s]);
  }
  // two windmills on the crest: a round tower, a thatched cone (their sails are animated by the builder)
  for (const [x, z, s] of [[-60, -98, 1.3], [-72, -168, 1.15]]) { // on open ground along the crest, each on a low whitewashed terrace
    const y0 = G(x, z) + 1.6;
    white.push([santoriniBlockGeo(THREE, 9.5 * s, 3.4, 9.5 * s, 0.3, 1), T(x, y0 - 1.7, z), "#f1ece3"]);
    white.push([new THREE.CylinderGeometry(3.15 * s, 3.55 * s, 8.6 * s, 26, 1), T(x, y0 + 4.3 * s, z), "#f5f1ea"]);
    white.push([new THREE.ConeGeometry(3.75 * s, 3.3 * s, 24), T(x, y0 + 8.6 * s + 1.6 * s, z), "#8e7a62"]);
    decals.push({ x, y: y0 + 1.7 * s, z: z + 3.52 * s + 0.05, w: 1.1 * s, h: 2.1 * s, rot: 0, cell: 1, lit: 0 }, { x: x + 2.3 * s, y: y0 + 5.2 * s, z: z + 2.6 * s, w: 0.7 * s, h: 0.7 * s, rot: 0.72, cell: 4, lit: 0.8 }); // on the tapering tower's face
    mills.push([x, y0 + 8.9 * s, z, s]);
    taken.push([x, z, 11 * s]);
  }
  // the houses, lot by lot down the slope
  for (let z = 12; z > -376; z -= 8.4) for (let x = -150; x < 80; x += 8.4) {
    const hx = x + r(-1.8, 1.8), hz = z + r(-1.8, 1.8), edge = santoriniEdge(hz);
    if (hx > edge - 4.5 || (hz > 8 && Math.abs(hx) < 8)) continue; // not over the cliff, not under our feet
    const east = Math.max(0, (-44 - hx) / 90);
    if (r() < 0.2 + east * 0.55 || !free(hx, hz, 4)) continue; // lanes and gardens; the far side of the crest thins out
    const w = r(4.6, 7.6), d = r(4.6, 7.4), h = r() < 0.18 ? r(5.4, 7.2) : r(3.3, 5.0), seg = segAt(hx, hz);
    const g4 = [G(hx - w / 2, hz - d / 2), G(hx + w / 2, hz - d / 2), G(hx - w / 2, hz + d / 2), G(hx + w / 2, hz + d / 2)];
    const y0 = Math.min(...g4) - 0.8, top = Math.max(...g4) + h, pool = hx > edge - 30 && r() < 0.26;
    const col = r() < 0.82 ? WHITE[(r() * WHITE.length) | 0] : PASTEL[(r() * PASTEL.length) | 0];
    const Top = top;
    white.push([santoriniBlockGeo(THREE, w, Top - y0, d, 0.34, seg), T(hx, (y0 + Top) / 2, hz), col]);
    taken.push([hx, hz, 3.2]);
    if (pool) { // a roof terrace with a pool looking over the caldera, its water glowing at night
      pools.push([hx, Top + 0.04, hz, w - 1.2, d - 1.2]);
      const t = 0.3, ph = 0.55;
      white.push([new THREE.BoxGeometry(w, ph, t), T(hx, Top + ph / 2 - 0.05, hz + d / 2 - t / 2), col], [new THREE.BoxGeometry(w, ph, t), T(hx, Top + ph / 2 - 0.05, hz - d / 2 + t / 2), col],
        [new THREE.BoxGeometry(t, ph, d - 2 * t), T(hx + w / 2 - t / 2, Top + ph / 2 - 0.05, hz), col], [new THREE.BoxGeometry(t, ph, d - 2 * t), T(hx - w / 2 + t / 2, Top + ph / 2 - 0.05, hz), col]);
      if (seg) dress(hx, hz + d / 2, 0, 1, w, Top, true);
      continue;
    }
    const q = r();
    if (q < 0.14) { // a cave house: a barrel vault along its longer side
      const along = w > d, rad = (along ? d : w) / 2 - 0.05, len = (along ? w : d) - 0.1, m = T(hx, Top - 0.2, hz);
      if (along) m.multiply(new THREE.Matrix4().makeRotationY(Math.PI / 2));
      white.push([santoriniVaultGeo(THREE, rad, len, seg ? 12 : 6), m, col]);
    } else if (q < 0.3) { // a room on the roof, set back uphill
      const w2 = w * r(0.45, 0.6), d2 = d * r(0.45, 0.65), h2 = r(2.4, 3.0), x2 = hx - (w - w2) / 2 + 0.2, z2 = hz - (d - d2) / 2 + 0.2;
      white.push([santoriniBlockGeo(THREE, w2, h2, d2, 0.28, Math.min(seg, 1)), T(x2, Top + h2 / 2 - 0.05, z2), col]);
      if (seg) dress(x2, z2 + d2 / 2, 0, 1, w2, Top + h2, false);
    } else {
      if (q < 0.55) { // a chimney
        const cx = hx + (r() < 0.5 ? -1 : 1) * (w / 2 - 0.7), cz = hz - d / 2 + 0.7;
        white.push([new THREE.BoxGeometry(0.6, 1.2, 0.6), T(cx, Top + 0.5, cz), col], [new THREE.BoxGeometry(0.9, 0.16, 0.9), T(cx, Top + 1.15, cz), col]);
      }
      if (seg && r() < 0.55) { // a low parapet round the roof terrace
        const t = 0.26, ph = 0.5;
        white.push([new THREE.BoxGeometry(w, ph, t), T(hx, Top + ph / 2 - 0.05, hz + d / 2 - t / 2), col], [new THREE.BoxGeometry(w, ph, t), T(hx, Top + ph / 2 - 0.05, hz - d / 2 + t / 2), col],
          [new THREE.BoxGeometry(t, ph, d - 2 * t), T(hx + w / 2 - t / 2, Top + ph / 2 - 0.05, hz), col], [new THREE.BoxGeometry(t, ph, d - 2 * t), T(hx - w / 2 + t / 2, Top + ph / 2 - 0.05, hz), col]);
        const near = Math.hypot(hx, hz - 20) < 110, k = r();
        if (near && k < 0.42) { // a café table under an umbrella in the accent colour, two chairs
          const tx = hx + r(-0.25, 0.25) * w, tz = hz + r(-0.2, 0.2) * d;
          white.push([new THREE.CylinderGeometry(0.4, 0.4, 0.05, 12), T(tx, Top + 0.75, tz), "#f4f0e8"], [new THREE.CylinderGeometry(0.04, 0.04, 2.3, 6), T(tx, Top + 1.15, tz), "#8a7a66"],
            [new THREE.BoxGeometry(0.42, 0.45, 0.42), T(tx - 0.75, Top + 0.22, tz), "#6f5a44"], [new THREE.BoxGeometry(0.42, 0.45, 0.42), T(tx + 0.75, Top + 0.22, tz), "#6f5a44"]);
          domes.push([new THREE.ConeGeometry(1.35, 0.45, 14, 1, true), T(tx, Top + 2.18, tz)]);
        } else if (near && k < 0.75) { // potted plants
          for (let n = 0; n < 2; n++) { const px = hx + r(-0.35, 0.35) * w, pz = hz + r(-0.35, 0.35) * d, ps = r(0.7, 1.1); white.push([new THREE.CylinderGeometry(0.28 * ps, 0.2 * ps, 0.45 * ps, 10), T(px, Top + 0.22 * ps, pz), "#b8603c"], [new THREE.IcosahedronGeometry(0.42 * ps, 1), T(px, Top + 0.62 * ps, pz), "#4f7a3a"]); }
        }
      }
    }
    if (!seg && Math.hypot(hx, hz - 20) > 300) continue; // too far off for doors and windows to show
    dress(hx, hz + d / 2, 0, 1, w, Top, true);
    if (hx < -4) dress(hx + w / 2, hz, 1, 0, d, Top, true); else if (hx > 4) dress(hx - w / 2, hz, -1, 0, d, Top, false);
    if (r() < 0.14) { const sx = hx + (r() < 0.5 ? -1 : 1) * (w / 2 - 0.9); flowers.push([sx, Top + 0.25, hz + d / 2 + 0.45, r(2.6, 4.2), (r() * 3) | 0]); } // bougainvillea over the wall
  }
  return { white, domes, decals, flowers, lamps, pools, belfries, mills };
}
function santorini(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(4747);
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, "YXZ");
  const EYE = santoriniGround(0, 20) + 21, CZ = 20, PITCH = -0.17; // on a roof terrace high in the village, looking down over it towards the sunset
  camera.fov = 50; camera.near = 0.5; camera.far = 45000;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  const time = { value: 0 }, nightU = { value: 0 };
  const noise = keep(lhNoise(THREE)), glow = keep(lhGlow(THREE)), quad = keep(new THREE.PlaneGeometry(1, 1));
  const accent = new THREE.Color();
  const SUN = new THREE.Vector3(0.5, 0.14, -0.86).normalize(), MOON = new THREE.Vector3(0.36, 0.14, -0.92).normalize();
  // alpha-to-coverage cut-outs keep the alpha the sky wrote (1): otherwise the page behind the canvas shows through their soft edges
  const KEEP_ALPHA = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
  const shader = (vs, fs, uniforms, extra = {}) => keep(new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, ...extra }));

  /* --- light: the sky and the warm ground, the low sun (the moon at night) casting real shadows through the village --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1), sun = new THREE.DirectionalLight(0xffffff, 1);
  const TARGET = new THREE.Vector3(-10, 70, -140);
  sun.target.position.copy(TARGET);
  if (!preview) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -230, right: 230, top: 110, bottom: -110, near: 400, far: 1700 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.5;
  }
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0xffffff, 700, 16000);

  /* --- the sky: sunset gradient and the sun; night with stars and the moon; a deck of cloud overhead --- */
  const skyUni = { uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunDir: { value: SUN.clone() }, uSunColor: { value: new THREE.Color("#fff0c8") }, uSun: { value: 1 } };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(40000, 40, 20)), shader(LANTERN_SKY_VS, LANTERN_SKY_FS, skyUni, { side: THREE.BackSide, depthWrite: false, depthTest: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  const NSTAR = preview ? 300 : 1000, starPos = new Float32Array(NSTAR * 3);
  for (let i = 0; i < NSTAR; i++) { const a = r(0, 6.283), e = Math.asin(r(0.03, 1)); starPos.set([Math.cos(a) * Math.cos(e) * 30000, Math.sin(e) * 30000, Math.sin(a) * Math.cos(e) * 30000], i * 3); }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = keep(new THREE.PointsMaterial({ color: 0xe8eeff, size: preview ? 1.1 : 1.5, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9; stars.frustumCulled = false;
  scene.add(stars);
  const moon = new THREE.Mesh(quad, keep(new THREE.MeshBasicMaterial({ map: keep(sakuraMoon(THREE)), transparent: true, depthWrite: false, fog: false })));
  moon.position.copy(MOON).multiplyScalar(30000); moon.position.y += EYE; moon.scale.setScalar(780); moon.lookAt(0, EYE, 0); moon.renderOrder = -8;
  const moonHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0x8fa3d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.55 })));
  moonHalo.position.copy(moon.position); moonHalo.scale.setScalar(5200); moonHalo.renderOrder = -9;
  scene.add(moon, moonHalo);
  const cloudUni = { uNoise: { value: noise }, uTime: time, uSunDir: { value: SUN.clone() }, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() } };
  const cloudGeo = keep(new THREE.PlaneGeometry(80000, 80000));
  cloudGeo.rotateX(Math.PI / 2); // facing down
  const clouds = new THREE.Mesh(cloudGeo, shader(LANTERN_LAKE_VS, SANTORINI_CLOUD_FS, cloudUni, { transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  clouds.position.set(0, 2400, -20000); clouds.renderOrder = -6; clouds.frustumCulled = false;
  scene.add(clouds);

  /* --- across the caldera: the wall with its villages on the left, Nea Kameni in the bay, Thirasia under the sun --- */
  const rimUni = { uNoise: { value: noise }, uSunDir: { value: SUN.clone() }, uSunCol: { value: new THREE.Color() }, uAmb: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uWarm: { value: new THREE.Color("#ffb46a") }, uNight: nightU, uTime: time };
  const rim = new THREE.Mesh(keep(santoriniRimGeo(THREE)), shader(SANTORINI_RIM_VS, SANTORINI_RIM_FS, rimUni));
  rim.frustumCulled = false;
  scene.add(rim);
  const isleUni = (tex) => ({ uMask: { value: tex }, uBody: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uLights: { value: new THREE.Color() }, uTime: time });
  const isles = [
    [santoriniIsle(THREE, preview ? 1024 : 2048, 128, (u) => Math.pow(Math.sin(Math.PI * Math.min(1, u * 1.08)), 0.55) * (0.82 + 0.12 * Math.sin(u * 17) + 0.06 * Math.sin(u * 53)), 26, 9), 2950, -5700, 4200, 330], // Thirasia
    [santoriniIsle(THREE, 512, 64, (u) => Math.pow(Math.max(0, 1 - (2 * u - 1) ** 2), 0.7) * (0.75 + 0.2 * Math.sin(u * 23) + 0.1 * Math.sin(u * 61)), 0, 3), 760, -2500, 1100, 105], // Nea Kameni
  ].map(([tex, x, z, w, h]) => {
    keep(tex);
    const uni = isleUni(tex), m = new THREE.Mesh(quad, shader(LANTERN_LAYER_VS, SANTORINI_ISLE_FS, uni, { transparent: true, depthWrite: false }));
    m.position.set(x, h / 2 - 4, z); m.scale.set(w, h, 1); m.lookAt(0, h / 2 - 4, CZ); m.renderOrder = 2; m.frustumCulled = false;
    scene.add(m);
    return uni;
  });

  /* --- the sea --- */
  const seaUni = { uNoise: { value: noise }, uTime: time, uSunDir: { value: SUN.clone() }, uSunCol: { value: new THREE.Color() }, uGlint: { value: 1 }, uDeep: { value: new THREE.Color() }, uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() }, uFoam: { value: new THREE.Color() }, uBoats: { value: [0, 1, 2].map(() => new THREE.Vector4()) } };
  const seaGeo = keep(new THREE.PlaneGeometry(60000, 60000));
  seaGeo.rotateX(-Math.PI / 2);
  const sea = new THREE.Mesh(seaGeo, shader(LANTERN_LAKE_VS, SANTORINI_SEA_FS, seaUni));
  sea.position.set(0, 0, -20000); sea.frustumCulled = false;
  scene.add(sea);

  /* --- the village --- */
  const V_ = santoriniVillage(THREE, preview);
  const shadowMats = [];
  const std = (opts) => { const m = keep(new THREE.MeshStandardMaterial(opts)); shadowMats.push(m); return m; };
  const groundMat = std({ vertexColors: true, roughness: 1, envMapIntensity: 0 });
  const ground = new THREE.Mesh(keep(santoriniTerrainGeo(THREE, preview ? 80 : 118, preview ? 100 : 150)), groundMat);
  const houseMat = std({ vertexColors: true, roughness: 0.92 });
  const houses = new THREE.Mesh(keep(mergeColored(THREE, V_.white)), houseMat);
  const domeMat = std({ color: 0x2a55b0, roughness: 0.5, emissive: 0x000000, side: THREE.DoubleSide }); // domes, and the café umbrellas
  const domes = new THREE.Mesh(keep(mergeParts(THREE, V_.domes.map(([geo, m]) => [geo, m]))), domeMat);
  for (const m of [ground, houses, domes]) { m.castShadow = m.receiveShadow = !preview; m.frustumCulled = false; scene.add(m); }
  // doors, windows and lanterns: one instanced draw on an atlas; shutters and doors in the accent colour, windows lit at night
  const atlas = santoriniDecals(THREE);
  keep(atlas.map); keep(atlas.mask);
  const decalGeo = keep(new THREE.PlaneGeometry(1, 1)), aDecal = new THREE.InstancedBufferAttribute(new Float32Array(V_.decals.length * 2), 2);
  decalGeo.setAttribute("aDecal", aDecal);
  const decalMat = std({ map: atlas.map, roughness: 0.8, alphaToCoverage: true, ...KEEP_ALPHA, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -4 });
  decalMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, { uMask: { value: atlas.mask }, uAccent: { value: accent }, uNight: nightU, uWarm: { value: new THREE.Color("#ffb45e") } });
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\nattribute vec2 aDecal; varying vec2 vDecal;")
      .replace("#include <uv_vertex>", "#include <uv_vertex>\n  vMapUv = (uv + vec2(mod(aDecal.x, 4.0), 1.0 - floor(aDecal.x / 4.0))) * vec2(0.25, 0.5); vDecal = aDecal;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\nuniform sampler2D uMask; uniform vec3 uAccent; uniform float uNight; uniform vec3 uWarm; varying vec2 vDecal;")
      .replace("#include <map_fragment>", "#include <map_fragment>\n  vec3 dm = texture2D(uMask, vMapUv).rgb;\n  diffuseColor.rgb = mix(diffuseColor.rgb, uAccent * (0.4 + 0.8 * dot(diffuseColor.rgb, vec3(0.3333))), dm.g);")
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += uWarm * dm.r * uNight * vDecal.y * 1.6;");
  };
  const decals = new THREE.InstancedMesh(decalGeo, decalMat, V_.decals.length);
  V_.decals.forEach((dc, i) => {
    E.set(0, dc.rot, 0, "YXZ");
    decals.setMatrixAt(i, M4.compose(V.set(dc.x, dc.y, dc.z), Q.setFromEuler(E), S3.set(dc.w, dc.h, 1)));
    aDecal.setXY(i, dc.cell, dc.lit);
  });
  decals.receiveShadow = !preview; decals.frustumCulled = false;
  scene.add(decals);
  // pools on the terraces near the edge
  const poolMat = std({ color: 0x3cc3d2, roughness: 0.12, metalness: 0, emissive: 0x000000 });
  const poolParts = V_.pools.map(([x, y, z, w, d]) => [new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), new THREE.Matrix4().makeTranslation(x, y, z)]);
  if (poolParts.length) { const pm = new THREE.Mesh(keep(mergeParts(THREE, poolParts)), poolMat); pm.receiveShadow = !preview; pm.frustumCulled = false; scene.add(pm); }
  // bell gables beside two churches
  const belfryMat = std({ map: keep(santoriniBelfry(THREE)), alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.9 });
  for (const [x, y, z, s] of V_.belfries) { const b = new THREE.Mesh(quad, belfryMat); b.position.set(x, y + 2.7 * s, z); b.scale.set(3.6 * s, 5.4 * s, 1); b.rotation.y = x < 0 ? 0.35 : -0.35; b.castShadow = b.receiveShadow = !preview; scene.add(b); }
  // windmill sails: eight spokes with triangular canvas, turning slowly
  const spokeGeo = keep(new THREE.BoxGeometry(0.16, 7.4, 0.16).translate(0, 3.7, 0));
  const sailGeo = keep(new THREE.BufferGeometry());
  sailGeo.setAttribute("position", new THREE.Float32BufferAttribute([0, 1.3, 0, 0, 7.0, 0, -2.1, 6.2, -0.25], 3)); sailGeo.computeVertexNormals();
  const spokeMat = std({ color: 0x8a7058, roughness: 0.9 }), sailMat = std({ color: 0xf6efe4, roughness: 1, side: THREE.DoubleSide, emissive: 0x000000 }); // canvas: glows when the sun is behind it
  const sails = V_.mills.map(([x, y, z, s], k) => {
    const hub = new THREE.Group(), head = new THREE.Group();
    head.position.set(x, y, z); head.rotation.y = 0.35 - k * 0.15; head.scale.setScalar(s); // the cap turned to the wind, the sails facing us
    hub.position.set(0, 0, 3.9);
    for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2, sp = new THREE.Mesh(spokeGeo, spokeMat), sl = new THREE.Mesh(sailGeo, sailMat); sp.rotation.z = a; sl.rotation.z = a; hub.add(sp, sl); }
    const axle = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.28, 0.28, 4.2, 8).rotateX(Math.PI / 2).translate(0, 0, 2.0)), spokeMat);
    head.add(axle, hub);
    scene.add(head);
    return { hub, speed: 0.22 + k * 0.05 };
  });
  // bougainvillea
  const NF = V_.flowers.length, flowerGeo = keep(new THREE.InstancedBufferGeometry()), fq = keep(new THREE.PlaneGeometry(1, 1).translate(0, -0.5, 0));
  flowerGeo.setIndex(fq.index); flowerGeo.setAttribute("position", fq.attributes.position); flowerGeo.setAttribute("uv", fq.attributes.uv);
  flowerGeo.setAttribute("aFlower", new THREE.InstancedBufferAttribute(new Float32Array(V_.flowers.flatMap(([x, y, z, s]) => [x, y, z, s])), 4));
  flowerGeo.setAttribute("aFlower2", new THREE.InstancedBufferAttribute(new Float32Array(V_.flowers.flatMap(([, , , , c]) => [c, r(0, 6.28)])), 2));
  flowerGeo.instanceCount = NF;
  const flowerUni = { uMap: { value: keep(santoriniFlowers(THREE)) }, uLight: { value: new THREE.Color() }, uTime: time };
  const flowerMesh = new THREE.Mesh(flowerGeo, shader(SANTORINI_FLOWER_VS, SANTORINI_FLOWER_FS, flowerUni, { alphaToCoverage: true, ...KEEP_ALPHA }));
  flowerMesh.frustumCulled = false;
  scene.add(flowerMesh);
  // lantern halos at night, all in one draw
  const glowQuad = keep(new THREE.PlaneGeometry(1, 1)), glowGeo = keep(new THREE.InstancedBufferGeometry());
  glowGeo.setIndex(glowQuad.index); glowGeo.setAttribute("position", glowQuad.attributes.position); glowGeo.setAttribute("uv", glowQuad.attributes.uv);
  glowGeo.setAttribute("aGlow", new THREE.InstancedBufferAttribute(new Float32Array(V_.lamps.flatMap(([x, y, z]) => [x, y, z, 2.1])), 4));
  glowGeo.instanceCount = V_.lamps.length;
  const glowMesh = new THREE.Mesh(glowGeo, shader(VENICE_GLOW_VS, VENICE_GLOW_FS, { uMap: { value: glow }, uColor: { value: new THREE.Color("#ffbf78") }, uTime: time }, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowMesh.frustumCulled = false; glowMesh.renderOrder = 20;
  scene.add(glowMesh);

  /* --- boats on the caldera: a yacht, a catamaran, a small launch --- */
  const hullMat = std({ color: 0xf4f2ee, roughness: 0.4 }), boatSail = std({ color: 0xfbf6ee, roughness: 1, side: THREE.DoubleSide });
  const hullGeo = keep(new THREE.CylinderGeometry(0.8, 0.5, 9, 10, 1).rotateZ(Math.PI / 2).scale(1, 0.6, 1.4));
  const sailTri = keep(new THREE.BufferGeometry());
  sailTri.setAttribute("position", new THREE.Float32BufferAttribute([0, 0.8, 0, 0, 12, 0, -4.6, 0.8, 0], 3)); sailTri.computeVertexNormals();
  const boatLamp = keep(new THREE.SpriteMaterial({ map: glow, color: 0xffe2b0, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false }));
  const boats = [[420, -1100, 2.6, 2.4, 1.0, true], [1150, -2100, -0.35, 3.0, 1.3, true], [260, -620, 3.35, 5.5, 0.8, false]].map(([x, z, head, speed, sc, sailing]) => {
    const g = new THREE.Group(), hull = new THREE.Mesh(hullGeo, hullMat);
    g.add(hull);
    if (sailing) { const s = new THREE.Mesh(sailTri, boatSail); s.position.x = 1.2; g.add(s); }
    const lamp = new THREE.Sprite(boatLamp); lamp.position.set(0, 3, 0); lamp.scale.setScalar(9); g.add(lamp);
    g.scale.setScalar(sc * 2.2);
    scene.add(g);
    return { g, lamp, x, z, head, speed };
  });
  function stepBoats(dt) {
    boats.forEach((b, i) => {
      b.x += Math.cos(b.head) * b.speed * dt; b.z += Math.sin(b.head) * b.speed * dt;
      if (Math.hypot(b.x - 900, b.z + 1800) > 2600) { b.head += Math.PI; } // turn back before sailing out of the bay
      b.g.position.set(b.x, 0.4, b.z); b.g.rotation.set(0, -b.head, 0);
      seaUni.uBoats.value[i].set(b.x, b.z, b.head, 1);
    });
  }

  /* --- gulls over the edge by day --- */
  const NGULL = preview ? 2 : 4, gullGeo = keep(lhGull(THREE)), aGull = new THREE.InstancedBufferAttribute(new Float32Array(NGULL * 2), 2);
  aGull.setUsage(THREE.DynamicDrawUsage);
  gullGeo.setAttribute("aGull", aGull);
  const gullMesh = new THREE.InstancedMesh(gullGeo, shader(LH_GULL_VS, LH_GULL_FS, { uBody: { value: new THREE.Color("#f7f2ee") }, uWing: { value: new THREE.Color("#c9c4c8") }, uTip: { value: new THREE.Color("#1c2025") } }), NGULL);
  gullMesh.frustumCulled = false; gullMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(gullMesh);
  const gulls = Array.from({ length: NGULL }, () => ({ a: r(0, 6.28), R: r(18, 34), w: (r() < 0.5 ? -1 : 1) * r(0.08, 0.14), h: r(98, 118), cx: r(40, 110), cz: r(-190, -90), beat: r(0, 6.28), amp: 0.3, flap: r() < 0.5, timer: r(1, 4) }));
  function stepGulls(dt) {
    gulls.forEach((g, i) => {
      if ((g.timer -= dt) <= 0) { g.flap = !g.flap; g.timer = g.flap ? r(1.2, 2.5) : r(3, 7); }
      g.amp += ((g.flap ? 0.5 : 0.05) - g.amp) * Math.min(1, dt * 3);
      g.beat += dt * (g.flap ? 8 : 2); g.a += g.w * dt;
      V.set(g.cx + Math.cos(g.a) * g.R, g.h + Math.sin(g.a * 0.6) * 3, g.cz + Math.sin(g.a) * g.R);
      const vx = -Math.sin(g.a) * g.R * g.w, vz = Math.cos(g.a) * g.R * g.w;
      E.set(0, Math.atan2(-vx, -vz), g.w > 0 ? 0.3 : -0.3, "YXZ");
      gullMesh.setMatrixAt(i, M4.compose(V, Q.setFromEuler(E), S3.setScalar(1.6)));
      aGull.setXY(i, g.beat, g.amp);
    });
    gullMesh.instanceMatrix.needsUpdate = aGull.needsUpdate = true;
  }

  // real shadows from the first draw (the renderer is only reachable there); the village stands still, so the map is drawn once
  // (and again when night swaps the sun for the moon), never every frame
  let shadowsOn = false, gone = false, rend = null;
  sky.onBeforeRender = (renderer) => {
    rend = renderer;
    if (preview || shadowsOn) return;
    shadowsOn = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    setTimeout(() => { if (gone) return; for (const m of shadowMats) m.needsUpdate = true; renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); }, 0);
  };

  function applyPalette(p) {
    pal = p;
    const d = p.dark, L = d ? MOON : SUN;
    accent.set(p.accent);
    nightU.value = d ? 1 : 0;
    skyUni.uZenith.value.set(d ? "#050a1e" : "#4b5c98"); skyUni.uMid.value.set(d ? "#0e1a3c" : "#e39aa8"); skyUni.uHorizon.value.set(d ? "#223358" : "#ffc28a");
    skyUni.uGlow.value.set(d ? "#34304e" : "#ff9c58").multiplyScalar(0.5); skyUni.uSun.value = d ? 0 : 1.6;
    starMat.opacity = d ? 0.85 : 0; stars.visible = moon.visible = moonHalo.visible = d;
    cloudUni.uSunDir.value.copy(L);
    cloudUni.uLit.value.set(d ? "#3a4668" : "#ffcaa8"); cloudUni.uShade.value.set(d ? "#1a2036" : "#9c84ae"); cloudUni.uGlow.value.set(d ? "#46557e" : "#ffb070").multiplyScalar(d ? 0.35 : 0.7); cloudUni.uHaze.value.set(d ? "#1c2848" : "#f6c0a4");
    sun.position.copy(L).multiplyScalar(1000).add(TARGET);
    sun.color.set(d ? "#9fb4e8" : "#ffa25c"); sun.intensity = d ? 0.5 : 4.2;
    hemi.color.set(d ? "#27335e" : "#d9c6d6"); hemi.groundColor.set(d ? "#1a140f" : "#c49a7c"); hemi.intensity = d ? 0.55 : 1.15; // the sunset sky's pink on the roofs
    scene.fog.color.set(d ? "#131c36" : "#f2bca4");
    seaUni.uSunDir.value.copy(L); seaUni.uSunCol.value.set(d ? "#c9d6ff" : "#ffd79a").multiplyScalar(d ? 0.7 : 1.3); seaUni.uGlint.value = d ? 0.6 : 1;
    seaUni.uDeep.value.set(d ? "#030a16" : "#1c3c66"); seaUni.uZenith.value.set(d ? "#0a1430" : "#5d6fab"); seaUni.uHorizon.value.set(d ? "#1c2a50" : "#ffc39c"); seaUni.uHaze.value.set(d ? "#16203c" : "#f3bea6"); seaUni.uFoam.value.set(d ? "#4a5a78" : "#fff0e0");
    rimUni.uSunDir.value.copy(L); rimUni.uSunCol.value.set(d ? "#6a7cb0" : "#ffac68").multiplyScalar(d ? 0.25 : 1.35); rimUni.uAmb.value.set(d ? "#141a30" : "#6a6f9c").multiplyScalar(d ? 0.7 : 0.75); rimUni.uHaze.value.set(d ? "#141c38" : "#eab4a6");
    for (const u of isles) { u.uBody.value.set(d ? "#171b31" : "#8d7aa2"); u.uRim.value.set("#ffd29a").multiplyScalar(d ? 0 : 0.3); u.uLights.value.set(d ? "#ffbe6a" : "#000000"); }
    domeMat.color.copy(accent).multiplyScalar(0.85); domeMat.emissive.copy(accent).multiplyScalar(d ? 0.12 : 0);
    poolMat.emissive.set(d ? "#1fb8d0" : "#000000"); poolMat.emissiveIntensity = d ? 0.55 : 0;
    sailMat.emissive.set(d ? "#0c1020" : "#8f6a4c");
    flowerUni.uLight.value.set(d ? "#3c4264" : "#ffe6d8");
    glowMesh.visible = d; for (const b of boats) b.lamp.visible = d;
    gullMesh.visible = !d;
    if (rend && shadowsOn) rend.shadowMap.needsUpdate = true; // the moon throws its shadows from elsewhere
  }
  applyPalette(pal);

  const look = new THREE.Vector3();
  let sway = 0;
  function layout() { // on every render, before the frustum is taken: a still frame gets no update() call
    const A = camera.aspect || 1, fov = A >= 1 ? 50 : 50 + (1 - A) * 22, yaw = A >= 1 ? 0 : (1 - A) * 0.63; // a phone turns towards the sun
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    camera.position.set(Math.sin(sway) * 0.6, EYE + Math.sin(sway * 1.7) * 0.08, CZ);
    camera.lookAt(look.set(camera.position.x + Math.sin(yaw) * 1000, EYE + Math.tan(PITCH) * 1000, CZ - Math.cos(yaw) * 1000));
    camera.updateMatrixWorld();
  }
  scene.onBeforeRender = layout;
  function frame(dt, t) {
    time.value = t;
    sway = t * 0.03;
    for (const s of sails) s.hub.rotation.z = -t * s.speed;
    stepBoats(dt);
    if (!pal.dark) stepGulls(dt);
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { return { houses: V_.white.length, decals: V_.decals.length, lamps: V_.lamps.length, flowers: NF, pools: V_.pools.length, boats: boats.map((b) => [Math.round(b.x), Math.round(b.z)]), shadows: shadowsOn }; }, // for checking by hand
    dispose() { gone = true; scene.fog = null; disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Paris rooftops: a sea of zinc roofs at dusk from a high balcony, the boulevard leading to the Eiffel Tower ---------- */
// Every building is solid (walls, a mansard, dormers, chimney stacks); what is drawn on them comes from `aFace` = (kind, u, v, seed),
// u and v in metres on that face: 0 facade (a window in every 3.2 m bay, 3 m storeys over a 4.2 m shop floor, the iron balconies of
// the 2nd and 5th floors, planters in the accent colour), 1 dormer front, 2 slate, 3 zinc, 4 chimney stack, 5 blank wall. Injected
// into MeshStandardMaterial, so the low sun's shadows and the fog come for free; at night the windows light and the streets glow.
const PARIS_BLD_VERT_PARS = /* glsl */ `
  attribute vec4 aFace; varying vec4 vFace;
`;
const PARIS_BLD_FRAG_PARS = /* glsl */ `
  uniform vec3 uAccent; uniform float uNight; uniform float uLitAmt; uniform vec3 uStreet; uniform vec3 uSkyGlass;
  varying vec4 vFace;
  float parisHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
`;
const PARIS_BLD_FRAG = /* glsl */ `
  vec3 winLight = vec3(0.0);
  {
    float kind = vFace.x, seed = vFace.w; vec2 q = vFace.yz;
    vec3 c = diffuseColor.rgb;
    if (kind < 0.5) { // a facade
      float bayI = floor(q.x / 3.2), bx = fract(q.x / 3.2);
      if (q.y < 4.2) { // the shop floor: big openings, some lit
        float open = step(abs(bx - 0.5), 0.36) * step(0.3, q.y) * step(q.y, 3.5);
        c = mix(c * 0.9, vec3(0.12, 0.11, 0.1), open);
        winLight += open * step(0.35, parisHash(vec2(bayI, seed))) * vec3(1.0, 0.7, 0.4);
      } else {
        float fy = q.y - 4.2, storey = floor(fy / 3.0), wy = fract(fy / 3.0), h = parisHash(vec2(bayI + seed * 7.13, storey));
        c *= 0.95 + 0.05 * step(0.5, fract(q.y * 2.0)); // stone courses
        float win = step(abs(bx - 0.5), 0.19) * step(0.13, wy) * step(wy, 0.83);
        float frame = step(abs(bx - 0.5), 0.23) * step(0.09, wy) * step(wy, 0.87) - win;
        c = mix(c, vec3(0.94, 0.92, 0.88), frame);
        c = mix(c, mix(vec3(0.11, 0.13, 0.17), uSkyGlass, 0.1 + 0.22 * h), win);
        winLight += win * step(0.4, h) * mix(vec3(1.0, 0.6, 0.28), vec3(1.0, 0.78, 0.5), fract(h * 13.0));
        float balcony = (1.0 - step(0.5, abs(storey - 1.0))) + (1.0 - step(0.5, abs(storey - 4.0))); // the 2nd and 5th floors
        float rail = balcony * step(0.1, wy) * step(wy, 0.32);
        c = mix(c, vec3(0.07, 0.07, 0.08), rail * (0.45 + 0.55 * step(0.55, fract(q.x * 5.0))));
        c = mix(c, c * 0.62, balcony * step(0.05, wy) * step(wy, 0.1)); // its shadow on the stone
        float box = step(parisHash(vec2(bayI * 1.7, storey + seed)), 0.2) * (1.0 - balcony) * step(abs(bx - 0.5), 0.22); // window boxes in the accent colour, flowers in them
        float planter = box * step(0.1, wy) * step(wy, 0.2), bloom = box * step(0.2, wy) * step(wy, 0.28) * step(0.35, parisHash(floor(q * vec2(9.0, 14.0))));
        c = mix(c, uAccent * 0.95, planter);
        c = mix(c, mix(vec3(0.75, 0.12, 0.16), vec3(0.24, 0.42, 0.2), step(0.62, parisHash(floor(q * vec2(9.0, 14.0)) + 3.1))), bloom);
      }
    } else if (kind < 1.5) { // a dormer's window
      float win = step(0.2, q.x) * step(q.x, 1.0) * step(0.22, q.y) * step(q.y, 1.6);
      float frame = step(0.14, q.x) * step(q.x, 1.06) * step(0.16, q.y) * step(q.y, 1.66) - win;
      c = mix(mix(c, vec3(0.93, 0.91, 0.87), frame), mix(vec3(0.11, 0.13, 0.17), uSkyGlass, 0.2), win);
      winLight += win * step(0.45, parisHash(vec2(seed, 5.0))) * vec3(1.0, 0.66, 0.36);
    } else if (kind < 2.5) { // slate: courses and a little variation
      c *= (0.9 + 0.1 * step(0.3, fract(q.y * 4.0))) * (0.92 + 0.08 * parisHash(floor(q * vec2(3.3, 4.0))));
    } else if (kind < 3.5) { // zinc: standing seams every 0.55 m, each sheet a shade of its own
      float seam = abs(fract(q.x / 0.55 + 0.5) - 0.5) * 0.55;
      c *= (0.84 + 0.16 * smoothstep(0.0, 0.045, seam)) * (0.95 + 0.08 * parisHash(vec2(floor(q.x / 0.55), seed)));
    } else if (kind < 4.5) { // a chimney stack, sooty at the top
      c *= 1.0 - 0.35 * smoothstep(0.6, 1.0, q.y);
    } else { // a blank party wall: old plaster in patches, the pale traces of flues running up it, grimier low down
      c *= 0.9 + 0.12 * parisHash(floor(q / vec2(2.6, 2.2)) + seed);
      c *= 1.0 + 0.07 * step(0.8, fract(q.x / 3.7 + seed));
      c *= 0.9 + 0.1 * smoothstep(0.0, 8.0, q.y);
    }
    diffuseColor.rgb = c;
    winLight *= uLitAmt;
    winLight += uStreet * uNight * (1.0 - step(0.5, kind)) * exp(-q.y / 4.5) * 0.7; // the street lights on the lower floors
  }
`;
// the Eiffel Tower as masks on a camera-facing quad: r the iron, g its sparkling bulbs, b the platforms' lights
const PARIS_TOWER_FS = /* glsl */ `
  uniform sampler2D uMask; uniform vec3 uIron; uniform vec3 uRim; uniform vec3 uGold; uniform float uNight; uniform float uTime; uniform float uSparkle;
  uniform vec3 uHaze; uniform float uHazeAmt;
  varying vec2 vUv;
  void main() {
    vec3 m = texture2D(uMask, vUv).rgb;
    if (m.r < 0.03) discard;
    vec3 col = uIron * (0.8 + 0.2 * vUv.y) + uRim * smoothstep(0.62, 0.3, vUv.x) * (1.0 - uNight);
    vec3 gold = uGold * (0.62 + 0.38 * m.b + 0.15 * (1.0 - vUv.y));
    col = mix(col, gold, uNight);
    float tw = fract(sin(dot(floor(vUv * vec2(260.0, 700.0)), vec2(12.9898, 78.233))) * 43758.5453);
    float flash = step(0.62, sin(uTime * (9.0 + tw * 7.0) + tw * 60.0)) * m.g;
    col += vec3(1.0, 0.98, 0.92) * flash * uSparkle * 2.2;
    col = mix(col, uHaze, uHazeAmt * (1.0 - 0.6 * uNight));
    gl_FragColor = vec4(col, m.r);
    #include <colorspace_fragment>
  }
`;
// the beacon's beams from the top: a flat fan of light along +x, bright at the lamp, fading away and to its edges
const PARIS_BEAM_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uAmt;
  varying vec2 vUv;
  void main() {
    float along = vUv.x, across = abs(vUv.y - 0.5) * 2.0;
    float a = pow(1.0 - along, 3.0) * (1.0 - smoothstep(0.1 + 0.9 * along, 1.0, across + 0.02)) * uAmt;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
  }
`;
// lights with a colour each (car headlights and tail lights, street lamps), all in one draw
const PARIS_GLOW_VS = /* glsl */ `
  attribute vec4 aGlow; attribute vec3 aTint;
  uniform float uTime;
  varying vec2 vUv; varying vec3 vTint;
  void main() {
    vUv = uv; vTint = aTint;
    vec4 mv = modelViewMatrix * vec4(aGlow.xyz, 1.0);
    mv.xy += position.xy * aGlow.w * (0.95 + 0.05 * sin(uTime * 5.3 + aGlow.x * 0.7 + aGlow.z));
    gl_Position = projectionMatrix * mv;
  }
`;
const PARIS_GLOW_FS = /* glsl */ `
  uniform sampler2D uMap; uniform float uAmt;
  varying vec2 vUv; varying vec3 vTint;
  void main() {
    gl_FragColor = vec4(texture2D(uMap, vUv).rgb * vTint * uAmt, 1.0);
    #include <colorspace_fragment>
  }
`;
// the railing in front: its texture repeats along it (uRep = repeat, offset); the flower box takes the accent colour
const PARIS_RAIL_FS = /* glsl */ `
  uniform sampler2D uMap; uniform sampler2D uMask; uniform vec3 uAccent; uniform vec3 uTint; uniform vec2 uRep;
  varying vec2 vUv;
  void main() {
    vec2 uv = vec2(vUv.x * uRep.x + uRep.y, vUv.y);
    vec4 t = texture2D(uMap, uv);
    if (t.a < 0.04) discard;
    float m = texture2D(uMask, uv).r;
    vec3 col = mix(t.rgb, uAccent * (0.25 + 0.62 * t.r), m) * uTint;
    gl_FragColor = vec4(col, t.a);
    #include <colorspace_fragment>
  }
`;
/** The Eiffel Tower seen face on, as masks (black ground, channels added): r the iron (its lattice open to the sky), g the sparkle bulbs,
 *  b the platforms' lights. 125 × 330 m: half-width of the legs' outer edge 62.5·e^(−y/95), the legs parting below 180 m. */
function parisTower(THREE) {
  const W = 512, H = 1352, s = W / 125, r = koiRng(1889), c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d"), X = (m) => W / 2 + m * s, Y = (m) => H - m * s;
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H);
  g.globalCompositeOperation = "lighter";
  const outer = (y) => 62.5 * Math.exp(-y / 95), leg = (y) => 23 * Math.exp(-y / 120), inner = (y) => (y < 180 ? Math.max(0, outer(y) - leg(y)) * Math.min(1, (180 - y) / 60) : 0);
  const IRON = "rgb(255,0,0)", line = (x0, y0, x1, y1, wdt, colr = IRON) => { g.strokeStyle = colr; g.lineWidth = wdt; g.beginPath(); g.moveTo(X(x0), Y(y0)); g.lineTo(X(x1), Y(y1)); g.stroke(); };
  g.lineCap = "round";
  // the two legs we see (and, faintly, the pair behind through the lattice), then the single shaft
  for (const side of [-1, 1]) {
    for (let y = 0; y < 180; y += 1) { line(side * outer(y), y, side * outer(y + 1), y + 1, 8.5); if (inner(y) > 0.5) line(side * inner(y), y, side * inner(y + 1), y + 1, 6.5); } // the legs' edges
    let prev = 0;
    for (const y of [0, 7, 15, 24, 34, 45, 57, 64, 74, 86, 99, 115, 120, 134, 150, 166, 180]) { // cross-bracing between struts
      if (y > 0) {
        const xo0 = side * outer(prev), xo1 = side * outer(y), xi0 = side * inner(prev), xi1 = side * inner(y);
        line(xo0, prev, xi1, y, 3.4); line(xi0, prev, xo1, y, 3.4); line(xo1, y, xi1, y, 3.6);
        const m0 = (xo0 + xi0) / 2, m1 = (xo1 + xi1) / 2; line(m0, prev, m1, y, 2.4); // a middle chord
      }
      prev = y;
    }
  }
  for (let y = 180; y < 276; y += 1) for (const side of [-1, 1]) line(side * outer(y), y, side * outer(y + 1), y + 1, 6.5);
  for (let y = 180, k = 0; y < 272; y += 9 + k * 0.4, k++) { const y2 = Math.min(276, y + 9 + k * 0.4); line(-outer(y), y, outer(y2), y2, 2.8); line(outer(y), y, -outer(y2), y2, 2.8); line(-outer(y2), y2, outer(y2), y2, 3.2); }
  // the great arch between the legs under the first platform, its spandrels latticed
  g.strokeStyle = IRON; g.lineWidth = 3.4 * s * 0.25; g.beginPath(); g.ellipse(X(0), Y(0), inner(4) * s, 39 * s, 0, Math.PI, 2 * Math.PI); g.stroke();
  g.lineWidth = 1.2; g.beginPath(); g.ellipse(X(0), Y(0), (inner(4) - 2.2) * s, 36.5 * s, 0, Math.PI, 2 * Math.PI); g.stroke();
  for (let a = 0.08; a < 1; a += 0.08) { const ang = Math.PI + a * Math.PI, px = Math.cos(ang) * inner(4), py = -Math.sin(ang) * 39; line(px, py, px * 1.06, Math.min(57, py + 18 * (1 - Math.abs(Math.cos(ang)))), 1.2); }
  // the platforms: the first with its arcade frieze, the second, the top; their lights in b
  const band = (y0, y1, extra) => { const hw = outer(y0) + extra; g.fillStyle = IRON; g.fillRect(X(-hw), Y(y1), hw * 2 * s, (y1 - y0) * s); g.fillStyle = "rgb(0,0,255)"; g.fillRect(X(-hw), Y(y1), hw * 2 * s, (y1 - y0) * s); };
  band(57, 64.5, 2.5); band(115, 119.5, 1.6); band(274, 279, 1.2);
  g.fillStyle = "rgb(0,0,0)"; g.globalCompositeOperation = "destination-out";
  for (let x = -outer(57) - 1.5; x < outer(57) + 1.5; x += 3.1) { g.beginPath(); g.ellipse(X(x), Y(59.5), 1.0 * s, 1.5 * s, 0, 0, Math.PI * 2); g.fill(); } // the arcade of the frieze
  g.globalCompositeOperation = "lighter";
  // the lantern at the top and the antenna
  g.fillStyle = IRON; g.fillRect(X(-3.2), Y(290), 6.4 * s, 11 * s); g.beginPath(); g.ellipse(X(0), Y(290), 3.4 * s, 3 * s, 0, Math.PI, 2 * Math.PI); g.fill();
  line(0, 292, 0, 330, 2.6); for (const y of [298, 306, 314]) line(-1.6, y, 1.6, y, 1.6);
  g.fillStyle = "rgb(0,0,255)"; g.fillRect(X(-3.2), Y(290), 6.4 * s, 11 * s);
  // sparkle bulbs, scattered over the iron (only where there is iron)
  const img = g.getImageData(0, 0, W, H).data;
  g.fillStyle = "rgb(0,255,0)";
  for (let i = 0; i < 2600; i++) { const x = (r() * W) | 0, y = (r() * H) | 0; if (img[(y * W + x) * 4] > 90) g.fillRect(x - 1, y - 1, 2.5, 2.5); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace; tex.anisotropy = 4;
  return tex;
}
/** A wrought-iron balcony railing, 2 × 1.3 m (the top rail at 1 m), repeating: a frieze of scrolls under the rail, bars below;
 *  a small flower box hooked over the rail (u 0.75–0.95 of each 2 m; `mask` marks it for the accent colour) with geraniums in it. */
function parisRailing(THREE, W) {
  const H = Math.round(W * 0.65), s = W / 2, r = koiRng(77);
  const c = document.createElement("canvas"), mc = document.createElement("canvas");
  c.width = mc.width = W; c.height = mc.height = H;
  const g = c.getContext("2d"), mk = mc.getContext("2d"), Y = (m) => H - m * s, X = (m) => m * s;
  mk.fillStyle = "#000"; mk.fillRect(0, 0, W, H);
  g.fillStyle = "#141414"; g.strokeStyle = "#141414"; g.lineCap = "round";
  g.fillRect(0, Y(1.0), W, 0.032 * s); g.fillRect(0, Y(0.852), W, 0.014 * s); g.fillRect(0, Y(0.55), W, 0.014 * s); // the rails
  g.lineWidth = 0.009 * s;
  for (let x = 0; x < 2.01; x += 0.125) { // the frieze: a pair of scrolls in each panel, a ring where they meet
    g.beginPath(); g.moveTo(X(x), Y(0.955)); g.bezierCurveTo(X(x + 0.035), Y(0.955), X(x + 0.055), Y(0.9), X(x + 0.0625), Y(0.905)); g.bezierCurveTo(X(x + 0.07), Y(0.9), X(x + 0.09), Y(0.955), X(x + 0.125), Y(0.955)); g.stroke();
    g.beginPath(); g.moveTo(X(x), Y(0.866)); g.bezierCurveTo(X(x + 0.035), Y(0.866), X(x + 0.055), Y(0.91), X(x + 0.0625), Y(0.905)); g.bezierCurveTo(X(x + 0.07), Y(0.91), X(x + 0.09), Y(0.866), X(x + 0.125), Y(0.866)); g.stroke();
    g.beginPath(); g.arc(X(x + 0.0625), Y(0.905), 0.012 * s, 0, Math.PI * 2); g.stroke();
    g.beginPath(); g.moveTo(X(x), Y(0.968)); g.lineTo(X(x), Y(0.852)); g.stroke();
  }
  g.lineWidth = 0.012 * s; for (let x = 0.03; x < 2; x += 0.0625) { g.beginPath(); g.moveTo(X(x), Y(0.845)); g.lineTo(X(x), Y(0)); g.stroke(); }
  // the flower box over the rail: painted grey here, the shader tints it (lit top edge, shaded foot, the hooks)
  const bx0 = 1.5, bx1 = 1.9, by0 = 0.955, by1 = 1.04, grad = g.createLinearGradient(0, Y(by1), 0, Y(by0)); // a small box: at arm's length it is big enough
  grad.addColorStop(0, "#e2e2e2"); grad.addColorStop(0.15, "#c4c4c4"); grad.addColorStop(1, "#8c8c8c");
  g.fillStyle = grad; g.fillRect(X(bx0), Y(by1), (bx1 - bx0) * s, (by1 - by0) * s);
  mk.fillStyle = "#fff"; mk.fillRect(X(bx0), Y(by1), (bx1 - bx0) * s, (by1 - by0) * s);
  g.fillStyle = "rgba(0,0,0,0.35)"; g.fillRect(X(bx0), Y(by0 + 0.012), (bx1 - bx0) * s, 0.012 * s);
  for (let i = 0; i < 230; i++) { const x = r(bx0 + 0.01, bx1 - 0.01), y = r(by1 - 0.01, by1 + 0.05) - Math.pow(Math.abs(x - 1.7) / 0.2, 4) * 0.03; g.fillStyle = r() < 0.5 ? "#2f5a2a" : "#467a36"; g.beginPath(); g.ellipse(X(x), Y(y), r(0.01, 0.022) * s, r(0.008, 0.017) * s, r(0, 3), 0, Math.PI * 2); g.fill(); }
  for (let i = 0; i < 16; i++) { const x = r(bx0 + 0.03, bx1 - 0.03), y = r(by1 + 0.02, by1 + 0.06) - Math.pow(Math.abs(x - 1.7) / 0.2, 4) * 0.025; for (let k = 0; k < 7; k++) { g.fillStyle = r() < 0.5 ? "#d62a35" : "#ee4b4b"; g.beginPath(); g.arc(X(x + r(-0.011, 0.011)), Y(y + r(-0.011, 0.011)), 0.008 * s, 0, Math.PI * 2); g.fill(); } }
  const map = new THREE.CanvasTexture(c), mask = new THREE.CanvasTexture(mc);
  map.colorSpace = THREE.SRGBColorSpace; mask.colorSpace = THREE.NoColorSpace;
  map.wrapS = mask.wrapS = THREE.RepeatWrapping;
  return { map, mask };
}
/** La Défense far off in the haze: towers and the Grande Arche as masks (r body, g lit windows, b the sunlit edges). 2400 × 260 m. */
function parisSkyline(THREE, W) {
  const s = W / 2400, H = Math.round(260 * s), r = koiRng(92), c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d"), X = (m) => (m + 1200) * s, Y = (m) => H - m * s;
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.globalCompositeOperation = "lighter";
  for (let x = -1180; x < 1150; ) {
    const w = r(40, 95), h = r() < 0.3 ? r(150, 245) : r(60, 140);
    g.fillStyle = "rgb(255,0,0)"; g.fillRect(X(x), Y(h), w * s, h * s);
    g.fillStyle = "rgb(0,0,255)"; g.fillRect(X(x), Y(h), Math.max(1, w * s * 0.12), h * s);
    for (let wy = 8; wy < h - 6; wy += 7) for (let wx = x + 4; wx < x + w - 4; wx += 6) if (r() < 0.3) { g.fillStyle = "rgb(0,255,0)"; g.fillRect(X(wx), Y(wy), Math.max(1, 2 * s), Math.max(1, 2 * s)); }
    x += w + r(15, 70);
  }
  g.fillStyle = "rgb(255,0,0)"; g.fillRect(X(-80), Y(110), 110 * s, 110 * s); // the Grande Arche: a hollow cube
  g.globalCompositeOperation = "source-over"; g.fillStyle = "#000"; g.fillRect(X(-62), Y(95), 74 * s, 95 * s);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
/** What the gilded dome and the window glass mirror: the dusk sky, the sun low on the left (or the city's glow at night). */
function parisEnv(THREE, dark) {
  const tex = canvasTexture(THREE, 512, 256, (g, w, h) => {
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, dark ? "#070b1c" : "#6d86c4"); grad.addColorStop(0.45, dark ? "#1c2448" : "#f2b99a"); grad.addColorStop(0.52, dark ? "#3a2c30" : "#b08070"); grad.addColorStop(1, dark ? "#0a0a10" : "#3a3440");
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    if (!dark) { const sx = w * 0.4, sy = h * 0.44, rg = g.createRadialGradient(sx, sy, 0, sx, sy, h * 0.3); rg.addColorStop(0, "rgba(255,236,190,1)"); rg.addColorStop(1, "rgba(255,190,130,0)"); g.fillStyle = rg; g.fillRect(0, 0, w, h); }
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
/** The city: blocks between the streets, the boulevard (x 12…48) running away from us towards the Tower. Near blocks are rings of
 *  Haussmann buildings round their courtyards (walls, slate-and-zinc mansards hipped at the corners, gable ends on the party walls,
 *  dormers over the window bays, chimney stacks with rows of pots); farther ones have fewer, simpler buildings; far ones are one each. */
function parisCity(THREE, preview, CAM, holes) {
  const r = koiRng(1889), col = new THREE.Color();
  const mk = () => ({ P: [], N: [], C: [], F: [] }), near = mk(), far = mk(), pots = [];
  const STONE = ["#e8dcc6", "#dfd2ba", "#ebe0cb", "#dccfb7", "#e4d5bc", "#d8c9b0", "#e0cfb0"], SLATE = ["#535c6f", "#4c5568", "#596275"], ZINC = ["#8591a1", "#7d8999", "#8a95a4"];
  const pick = (a) => a[(r() * a.length) | 0];
  // one face (a convex polygon), its normal turned to `out`, each corner with its (u, v) in metres
  const face = (G, pts, uvs, kind, hex, seed, out) => {
    const [a, b, c] = pts;
    let nx = (b[1] - a[1]) * (c[2] - a[2]) - (b[2] - a[2]) * (c[1] - a[1]), ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]), nz = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
    const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    let P = pts, U = uvs;
    if (nx * out[0] + ny * out[1] + nz * out[2] < 0) { P = pts.slice().reverse(); U = uvs.slice().reverse(); nx = -nx; ny = -ny; nz = -nz; }
    col.set(hex);
    for (let i = 1; i < P.length - 1; i++) for (const k of [0, i, i + 1]) { G.P.push(P[k][0], P[k][1], P[k][2]); G.N.push(nx, ny, nz); G.C.push(col.r, col.g, col.b); G.F.push(kind, U[k][0], U[k][1], seed); }
  };
  function building(G, cx, cz, ang, W, D, H, o) {
    const ca = Math.cos(ang), sa = Math.sin(ang), seed = r(0, 50);
    const T = (x, y, z) => [cx + x * ca + z * sa, y, cz - x * sa + z * ca], R = (x, y, z) => [x * ca + z * sa, y, -x * sa + z * ca];
    const f = (pts, uvs, kind, hex, out) => face(G, pts.map((p) => T(p[0], p[1], p[2])), uvs, kind, hex, seed, R(out[0], out[1], out[2]));
    const w = W / 2, d = D / 2, stone = pick(STONE), slate = pick(SLATE), zinc = pick(ZINC);
    f([[-w, 0, d], [w, 0, d], [w, H, d], [-w, H, d]], [[0, 0], [W, 0], [W, H], [0, H]], o.street.F ? 0 : 5, stone, [0, 0, 1]);
    f([[w, 0, -d], [-w, 0, -d], [-w, H, -d], [w, H, -d]], [[0, 0], [W, 0], [W, H], [0, H]], o.street.B ? 0 : 5, stone, [0, 0, -1]);
    f([[w, 0, d], [w, 0, -d], [w, H, -d], [w, H, d]], [[0, 0], [D, 0], [D, H], [0, H]], o.street.R ? 0 : 5, stone, [1, 0, 0]);
    f([[-w, 0, -d], [-w, 0, d], [-w, H, d], [-w, H, -d]], [[0, 0], [D, 0], [D, H], [0, H]], o.street.L ? 0 : 5, stone, [-1, 0, 0]);
    // the steep slate slope, then a low zinc slope rising almost to a ridge (a narrow flat along the top)
    const simple = o.lod === 2, h1 = 3.2, h2 = simple ? 0 : 1.7, i1 = 1.0, i2 = simple ? 0 : Math.max(0.5, d - i1 - 0.4), ix2 = simple ? 0 : Math.min(i2, Math.max(0.5, w / (o.hip.L && o.hip.R ? 1 : 2) - i1 - 0.4));
    const inL = o.hip.L ? 1 : 0, inR = o.hip.R ? 1 : 0, Y0 = H, Y1 = H + h1, Y2 = H + h1 + h2;
    const Kx0 = -w + i1 * inL, Kx1 = w - i1 * inR, Kz0 = -d + i1, Kz1 = d - i1, Tx0 = -w + (i1 + ix2) * inL, Tx1 = w - (i1 + ix2) * inR, Tz0 = -d + i1 + i2, Tz1 = d - i1 - i2;
    const sl = Math.hypot(h1, i1), sl2 = Math.hypot(h2, i2);
    f([[-w, Y0, d], [w, Y0, d], [Kx1, Y1, Kz1], [Kx0, Y1, Kz1]], [[0, 0], [W, 0], [Kx1 + w, sl], [Kx0 + w, sl]], 2, slate, [0, 0.3, 1]);
    f([[w, Y0, -d], [-w, Y0, -d], [Kx0, Y1, Kz0], [Kx1, Y1, Kz0]], [[0, 0], [W, 0], [w - Kx0, sl], [w - Kx1, sl]], 2, slate, [0, 0.3, -1]);
    if (h2) {
      f([[Kx0, Y1, Kz1], [Kx1, Y1, Kz1], [Tx1, Y2, Tz1], [Tx0, Y2, Tz1]], [[Kx0 + w, 0], [Kx1 + w, 0], [Tx1 + w, sl2], [Tx0 + w, sl2]], 3, zinc, [0, 1, 0.4]);
      f([[Kx1, Y1, Kz0], [Kx0, Y1, Kz0], [Tx0, Y2, Tz0], [Tx1, Y2, Tz0]], [[w - Kx1, 0], [w - Kx0, 0], [w - Tx0, sl2], [w - Tx1, sl2]], 3, zinc, [0, 1, -0.4]);
    }
    for (const [key, sx] of [["R", 1], ["L", -1]]) {
      const xe = sx * w, xk = sx > 0 ? Kx1 : Kx0, xt = sx > 0 ? Tx1 : Tx0;
      if (o.hip[key]) { // a hipped end at the street corner
        f([[xe, Y0, d], [xe, Y0, -d], [xk, Y1, Kz0], [xk, Y1, Kz1]], [[0, 0], [D, 0], [D - i1, sl], [i1, sl]], 2, slate, [sx, 0.3, 0]);
        if (h2) f([[xk, Y1, Kz1], [xk, Y1, Kz0], [xt, Y2, Tz0], [xt, Y2, Tz1]], [[i1, 0], [D - i1, 0], [D - i1 - i2, Math.hypot(h2, ix2)], [i1 + i2, Math.hypot(h2, ix2)]], 3, zinc, [sx, 1, 0]);
      } else { // a gable: the mansard's profile rising as a blank party wall
        const pts = h2 ? [[xe, Y0, -d], [xe, Y0, d], [xe, Y1, Kz1], [xe, Y2, Tz1], [xe, Y2, Tz0], [xe, Y1, Kz0]] : [[xe, Y0, -d], [xe, Y0, d], [xe, Y1, Kz1], [xe, Y1, Kz0]];
        f(pts, pts.map((p) => [p[2] + d, p[1]]), 5, stone, [sx, 0, 0]);
      }
    }
    if (Tx1 > Tx0 + 0.2 && Tz1 > Tz0 + 0.2) f([[Tx0, Y2, Tz1], [Tx1, Y2, Tz1], [Tx1, Y2, Tz0], [Tx0, Y2, Tz0]], [[Tx0 + w, 0], [Tx1 + w, 0], [Tx1 + w, Tz1 - Tz0], [Tx0 + w, Tz1 - Tz0]], 3, zinc, [0, 1, 0]);
    if (o.lod === 0) for (let x = -w + 1.6; x < w - 1.2; x += 3.2) { // dormers over the window bays of the street side
      if (x - 0.7 < Kx0 || x + 0.7 > Kx1 || r() < 0.22) continue;
      const hw = 0.62, zf = d - 0.2, zb = d - 1.3, yb = Y0 + 0.35, yt = Y0 + 2.15, yr = yt + 0.5;
      f([[x - hw, yb, zf], [x + hw, yb, zf], [x + hw, yt, zf], [x - hw, yt, zf]], [[0, 0], [1.24, 0], [1.24, 1.8], [0, 1.8]], 1, stone, [0, 0, 1]);
      f([[x + hw, yb, zf], [x + hw, yb, zb], [x + hw, yt, zb], [x + hw, yt, zf]], [[0, 0], [1.1, 0], [1.1, 1.8], [0, 1.8]], 3, zinc, [1, 0, 0]);
      f([[x - hw, yb, zb], [x - hw, yb, zf], [x - hw, yt, zf], [x - hw, yt, zb]], [[0, 0], [1.1, 0], [1.1, 1.8], [0, 1.8]], 3, zinc, [-1, 0, 0]);
      f([[x - hw - 0.1, yt - 0.05, zf + 0.1], [x, yr, zf + 0.1], [x, yr, zb], [x - hw - 0.1, yt - 0.05, zb]], [[0, 0], [0.8, 0], [0.8, 1.2], [0, 1.2]], 3, zinc, [-1, 1.3, 0]);
      f([[x, yr, zf + 0.1], [x + hw + 0.1, yt - 0.05, zf + 0.1], [x + hw + 0.1, yt - 0.05, zb], [x, yr, zb]], [[0, 0], [0.8, 0], [0.8, 1.2], [0, 1.2]], 3, zinc, [1, 1.3, 0]);
      f([[x - hw, yt, zf + 0.02], [x + hw, yt, zf + 0.02], [x, yr, zf + 0.02]], [[0, 0], [1.24, 0], [0.62, 0.5]], 5, stone, [0, 0, 1]);
    }
    if (o.lod < 2 && !o.hip.R && r() < 0.85) { // a chimney stack on the party wall, a row of pots on it
      const L = Math.min(D - 7, r(2.4, 5.4)), zc = r(-d + 3.5 + L / 2, d - 3.5 - L / 2), yb = Y2 - 1.0, yt = Y2 + r(1.2, 2.4), brick = r() < 0.35;
      const hx = 0.42, z0 = zc - L / 2, z1 = zc + L / 2, hexc = brick ? "#a8634c" : "#d9ccb8", hgt = yt - yb;
      f([[w - hx, yb, z1], [w + hx, yb, z1], [w + hx, yt, z1], [w - hx, yt, z1]], [[0, 0], [0.84, 0], [0.84, 1], [0, 1]], 4, hexc, [0, 0, 1]);
      f([[w + hx, yb, z0], [w - hx, yb, z0], [w - hx, yt, z0], [w + hx, yt, z0]], [[0, 0], [0.84, 0], [0.84, 1], [0, 1]], 4, hexc, [0, 0, -1]);
      f([[w + hx, yb, z1], [w + hx, yb, z0], [w + hx, yt, z0], [w + hx, yt, z1]], [[0, 0], [L, 0], [L, 1], [0, 1]], 4, hexc, [1, 0, 0]);
      f([[w - hx, yb, z0], [w - hx, yb, z1], [w - hx, yt, z1], [w - hx, yt, z0]], [[0, 0], [L, 0], [L, 1], [0, 1]], 4, hexc, [-1, 0, 0]);
      f([[w - hx, yt, z1], [w + hx, yt, z1], [w + hx, yt, z0], [w - hx, yt, z0]], [[0, 1], [0.84, 1], [0.84, 1], [0, 1]], 4, hexc, [0, 1, 0]);
      if (o.lod === 0 && hgt > 0) for (let z = z0 + 0.26; z < z1 - 0.12; z += 0.42) pots.push([...T(w, yt, z), r(0.5, 0.95)]);
    }
  }
  // the grid of blocks
  const xs = [], zs = [];
  for (let x = 12, i = 0; i < 28; i++) { const b = r(58, 72); xs.push([x - b, x]); x -= b + 12; }
  for (let x = 48, i = 0; i < 24; i++) { const b = r(58, 72); xs.push([x, x + b]); x += b + 12; }
  for (let z = 16, i = 0; i < 42; i++) { const b = r(54, 66); zs.push([z - b, z]); z -= b + 12; }
  let nBld = 0;
  // nearest blocks first: triangles are drawn in buffer order, so the near roofs fill the depth buffer before the far ones are shaded
  const blocks = [];
  for (const [bx0, bx1] of xs) for (const [bz0, bz1] of zs) blocks.push([bx0, bx1, bz0, bz1, Math.hypot((bx0 + bx1) / 2 - CAM[0], (bz0 + bz1) / 2 - CAM[1])]);
  blocks.sort((a, b) => a[4] - b[4]);
  for (const [bx0, bx1, bz0, bz1, dist] of blocks) {
    const cx = (bx0 + bx1) / 2, cz = (bz0 + bz1) / 2, az = Math.atan2(cx - CAM[0], -(cz - CAM[1]));
    if (dist > 2350 || az < -1.25 || az > 0.75 || cz > CAM[1] + 40) continue;
    if (holes.some(([hx, hz, hr]) => Math.hypot(cx - hx, cz - hz) < hr)) continue; // the Champ de Mars, the Invalides
    const lod = dist < (preview ? 180 : 270) ? 0 : dist < (preview ? 700 : 950) ? 1 : 2, G = lod === 2 ? far : near;
    const base = r() < 0.12 ? r(13.5, 16) : r(18.5, 21);
    const Hh = () => Math.max(12, base + (r() < 0.1 ? r(-4, 3.5) : r(-1.2, 1.2)));
    if (lod === 2) { building(G, cx, cz, 0, bx1 - bx0, bz1 - bz0, Hh(), { lod, street: { F: true, B: true, L: true, R: true }, hip: { L: true, R: true } }); nBld++; continue; }
    const D = r(14, 17), wMin = lod === 0 ? 10 : 17, wMax = lod === 0 ? 17 : 32;
    for (const [zc, ang] of [[bz1 - D / 2, 0], [bz0 + D / 2, Math.PI]]) { // the rows along the streets in front and behind, corners hipped
      for (let xx = bx0; xx < bx1 - 0.1; ) {
        let wL = Math.min(r(wMin, wMax), bx1 - xx);
        if (bx1 - xx - wL < wMin * 0.7) wL = bx1 - xx;
        const first = xx === bx0, last = xx + wL >= bx1 - 0.1, hip = ang === 0 ? { L: first, R: last } : { L: last, R: first };
        building(G, xx + wL / 2, zc, ang, wL, D, Hh(), { lod, street: { F: true, B: false, L: hip.L, R: hip.R }, hip });
        nBld++; xx += wL;
      }
    }
    for (const [xc, ang] of [[bx0 + D / 2, -Math.PI / 2], [bx1 - D / 2, Math.PI / 2]]) { // the sides between the rows
      for (let zz = bz0 + D; zz < bz1 - D - 0.1; ) {
        let wL = Math.min(r(wMin, wMax), bz1 - D - zz);
        if (bz1 - D - zz - wL < wMin * 0.7) wL = bz1 - D - zz;
        building(G, xc, zz + wL / 2, ang, wL, D, Hh(), { lod, street: { F: true, B: false, L: false, R: false }, hip: { L: false, R: false } });
        nBld++; zz += wL;
      }
    }
  }
  const geo = (G) => {
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(G.P, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(G.N, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(G.C, 3));
    g.setAttribute("aFace", new THREE.Float32BufferAttribute(G.F, 4));
    return g;
  };
  return { near: geo(near), far: geo(far), pots, buildings: nBld };
}
function paris(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(1789);
  const V = new THREE.Vector3(), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), S3 = new THREE.Vector3(), E = new THREE.Euler(0, 0, 0, "YXZ");
  const CAM = [8, 6], EYE = 44, PITCH = -0.1, YAW = 0.28; // a high balcony by the boulevard, turned a little left of it
  const TOWER = [30, -1320], DOME = [-420, -980];
  camera.fov = 50; camera.near = 0.5; camera.far = 45000;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  let TAN = Math.tan((camera.fov * Math.PI) / 360);
  const time = { value: 0 }, nightU = { value: 0 };
  const noise = keep(lhNoise(THREE)), glow = keep(lhGlow(THREE)), quad = keep(new THREE.PlaneGeometry(1, 1));
  const accent = new THREE.Color();
  const SUN = new THREE.Vector3(-0.55, 0.14, -0.82).normalize(), MOON = new THREE.Vector3(-0.42, 0.3, -0.86).normalize();
  const KEEP_ALPHA = { blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.ZeroFactor, blendSrcAlpha: THREE.ZeroFactor, blendDstAlpha: THREE.OneFactor };
  const shader = (vs, fs, uniforms, extra = {}) => keep(new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, ...extra }));
  const shadowMats = [];
  const std = (opts) => { const m = keep(new THREE.MeshStandardMaterial(opts)); shadowMats.push(m); return m; };

  /* --- light: the low sun on the left (the moon at night) casts real shadows over the near roofs --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1), sun = new THREE.DirectionalLight(0xffffff, 1);
  const TARGET = new THREE.Vector3(-20, 20, -330);
  sun.target.position.copy(TARGET);
  if (!preview) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -420, right: 420, top: 160, bottom: -160, near: 500, far: 2600 });
    sun.shadow.camera.updateProjectionMatrix();
    sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.6;
  }
  scene.add(hemi, sun, sun.target);
  scene.fog = new THREE.Fog(0xffffff, 350, 3400);
  let envTex = null;

  /* --- the sky: dusk with the sun low on the left, a deck of cloud; night with a few stars and the moon --- */
  const skyUni = { uZenith: { value: new THREE.Color() }, uMid: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uSunDir: { value: SUN.clone() }, uSunColor: { value: new THREE.Color("#fff0c8") }, uSun: { value: 1 } };
  const sky = new THREE.Mesh(keep(new THREE.SphereGeometry(40000, 40, 20)), shader(LANTERN_SKY_VS, LANTERN_SKY_FS, skyUni, { side: THREE.BackSide, depthWrite: false, depthTest: false }));
  sky.renderOrder = -10; sky.frustumCulled = false;
  scene.add(sky);
  const NSTAR = preview ? 150 : 420, starPos = new Float32Array(NSTAR * 3);
  for (let i = 0; i < NSTAR; i++) { const a = r(0, 6.283), e = Math.asin(r(0.12, 1)); starPos.set([Math.cos(a) * Math.cos(e) * 30000, Math.sin(e) * 30000, Math.sin(a) * Math.cos(e) * 30000], i * 3); }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  const starMat = keep(new THREE.PointsMaterial({ color: 0xe8eeff, size: preview ? 1.1 : 1.4, sizeAttenuation: false, transparent: true, depthWrite: false, fog: false }));
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = -9; stars.frustumCulled = false;
  scene.add(stars);
  const moon = new THREE.Mesh(quad, keep(new THREE.MeshBasicMaterial({ map: keep(sakuraMoon(THREE)), transparent: true, depthWrite: false, fog: false })));
  moon.position.copy(MOON).multiplyScalar(30000); moon.position.y += EYE; moon.scale.setScalar(700); moon.lookAt(CAM[0], EYE, CAM[1]); moon.renderOrder = -8;
  const moonHalo = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0x8fa3d8, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false, opacity: 0.5 })));
  moonHalo.position.copy(moon.position); moonHalo.scale.setScalar(4800); moonHalo.renderOrder = -9;
  scene.add(moon, moonHalo);
  const cloudUni = { uNoise: { value: noise }, uTime: time, uSunDir: { value: SUN.clone() }, uLit: { value: new THREE.Color() }, uShade: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() }, uHaze: { value: new THREE.Color() } };
  const cloudGeo = keep(new THREE.PlaneGeometry(80000, 80000));
  cloudGeo.rotateX(Math.PI / 2);
  const clouds = new THREE.Mesh(cloudGeo, shader(LANTERN_LAKE_VS, SANTORINI_CLOUD_FS, cloudUni, { transparent: true, depthWrite: false, side: THREE.DoubleSide }));
  clouds.position.set(0, 2600, -20000); clouds.renderOrder = -6; clouds.frustumCulled = false;
  scene.add(clouds);

  /* --- the city --- */
  const city = parisCity(THREE, preview, CAM, [[TOWER[0], TOWER[1], 190], [DOME[0], DOME[1], 95]]);
  const cityU = { uAccent: { value: accent }, uNight: nightU, uLitAmt: { value: 0.1 }, uStreet: { value: new THREE.Color("#ff9a4a") }, uSkyGlass: { value: new THREE.Color() } };
  const cityMat = std({ vertexColors: true, roughness: 0.86, envMapIntensity: 0.3 });
  cityMat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, cityU);
    sh.vertexShader = sh.vertexShader.replace("#include <common>", "#include <common>\n" + PARIS_BLD_VERT_PARS).replace("#include <begin_vertex>", "#include <begin_vertex>\n  vFace = aFace;");
    sh.fragmentShader = sh.fragmentShader.replace("#include <common>", "#include <common>\n" + PARIS_BLD_FRAG_PARS).replace("#include <color_fragment>", "#include <color_fragment>\n" + PARIS_BLD_FRAG)
      .replace("#include <emissivemap_fragment>", "#include <emissivemap_fragment>\n  totalEmissiveRadiance += winLight;");
  };
  const nearCity = new THREE.Mesh(keep(city.near), cityMat), farCity = new THREE.Mesh(keep(city.far), cityMat);
  nearCity.castShadow = nearCity.receiveShadow = !preview; // the far city lies beyond the shadow map anyway
  nearCity.frustumCulled = farCity.frustumCulled = false;
  scene.add(nearCity, farCity);
  const groundMat = std({ color: 0x57524e, roughness: 1, envMapIntensity: 0.1, emissive: 0x000000 });
  const groundGeo = keep(new THREE.PlaneGeometry(9000, 9000));
  groundGeo.rotateX(-Math.PI / 2);
  const ground = new THREE.Mesh(groundGeo, groundMat);
  ground.position.set(0, 0, -2500); ground.receiveShadow = !preview; ground.frustumCulled = false;
  scene.add(ground);
  // terracotta pots on the chimney stacks
  const potGeo = keep(new THREE.CylinderGeometry(0.17, 0.19, 1, 7, 1, true).translate(0, 0.5, 0));
  const potMat = std({ color: 0xb4623e, roughness: 0.9, side: THREE.DoubleSide });
  const pots = new THREE.InstancedMesh(potGeo, potMat, Math.max(1, city.pots.length));
  city.pots.forEach(([x, y, z, h], i) => pots.setMatrixAt(i, M4.compose(V.set(x, y - 0.05, z), Q.identity(), S3.set(1, h, 1))));
  pots.count = city.pots.length; pots.castShadow = !preview; pots.frustumCulled = false;
  scene.add(pots);

  /* --- the boulevard: plane trees, lamps, the traffic --- */
  const trees = [];
  for (const x of [17.5, 42.5]) for (let z = -8 + r(0, 4); z > -1180; z += -r(8.5, 10.5)) trees.push([x + r(-0.4, 0.4), z, r(3.4, 4.4)]);
  const treeGeo = keep(mergeParts(THREE, [[0, 0.1, 0, 0.8], [0.45, -0.1, 0.2, 0.62], [-0.42, 0, -0.18, 0.66], [0.05, 0.45, -0.3, 0.55]].map(([x, y, z, k]) => [new THREE.IcosahedronGeometry(k, 0), new THREE.Matrix4().makeTranslation(x, y, z)])));
  const treeMat = std({ roughness: 0.95, emissive: 0x000000, envMapIntensity: 0.15, flatShading: true });
  const treeMesh = new THREE.InstancedMesh(treeGeo, treeMat, trees.length);
  const TREE_COLS = ["#4a6634", "#42602f", "#526e39", "#476433"].map((c) => new THREE.Color(c));
  trees.forEach(([x, z, s], i) => { treeMesh.setMatrixAt(i, M4.compose(V.set(x, 8.5 + s * 0.3, z), Q.identity(), S3.set(s * 1.05, s * 0.85, s * 1.05))); treeMesh.setColorAt(i, TREE_COLS[i % 4]); });
  treeMesh.castShadow = treeMesh.receiveShadow = !preview; treeMesh.frustumCulled = false;
  scene.add(treeMesh);
  const lamps = [];
  for (const [x, off] of [[15.2, 0], [44.8, 12]]) for (let z = -6 - off; z > -1200; z -= 24) lamps.push([x, 5.2, z]);
  const glowGeo = (n, dyn) => { const q = keep(new THREE.PlaneGeometry(1, 1)), g = keep(new THREE.InstancedBufferGeometry()); g.setIndex(q.index); g.setAttribute("position", q.attributes.position); g.setAttribute("uv", q.attributes.uv); const a = new THREE.InstancedBufferAttribute(new Float32Array(n * 4), 4), t = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3); if (dyn) a.setUsage(THREE.DynamicDrawUsage); g.setAttribute("aGlow", a); g.setAttribute("aTint", t); g.instanceCount = n; return g; };
  const glowMat = (amt) => shader(PARIS_GLOW_VS, PARIS_GLOW_FS, { uMap: { value: glow }, uAmt: { value: amt }, uTime: time }, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  const lampGeo = glowGeo(lamps.length, false), lampGlow = new THREE.Mesh(lampGeo, glowMat(1));
  lamps.forEach(([x, y, z], i) => { lampGeo.attributes.aGlow.setXYZW(i, x, y, z, 3.4); lampGeo.attributes.aTint.setXYZ(i, 1.0, 0.72, 0.4); });
  lampGlow.frustumCulled = false; lampGlow.renderOrder = 20;
  scene.add(lampGlow);
  const cars = [];
  for (const [x, dir] of [[22.5, 1], [26.5, 1], [33.5, -1], [37.5, -1]]) for (let k = 0; k < 7; k++) cars.push({ x, dir, z: r(-1500, 20), v: r(8.5, 13.5) });
  const carGeo = keep(new THREE.BoxGeometry(1.8, 1.4, 4.4));
  const carMat = std({ roughness: 0.4, envMapIntensity: 0.5 });
  const carMesh = new THREE.InstancedMesh(carGeo, carMat, cars.length);
  const CAR_COLS = ["#1c1f24", "#c9ccd1", "#f2f2f0", "#7a1f25", "#2b3a55", "#5d6168", "#12151a"].map((c) => new THREE.Color(c));
  cars.forEach((c, i) => carMesh.setColorAt(i, CAR_COLS[(r() * CAR_COLS.length) | 0]));
  carMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); carMesh.frustumCulled = false;
  scene.add(carMesh);
  const carLightGeo = glowGeo(cars.length * 2, true), carGlow = new THREE.Mesh(carLightGeo, glowMat(1));
  cars.forEach((c, i) => { const [cr, cg, cb] = c.dir > 0 ? [1.0, 0.95, 0.85] : [1.0, 0.12, 0.08]; carLightGeo.attributes.aTint.setXYZ(2 * i, cr, cg, cb); carLightGeo.attributes.aTint.setXYZ(2 * i + 1, cr, cg, cb); });
  carGlow.frustumCulled = false; carGlow.renderOrder = 21;
  scene.add(carGlow);
  function stepCars(dt) {
    const ag = carLightGeo.attributes.aGlow;
    cars.forEach((c, i) => {
      c.z += c.dir * c.v * dt;
      if (c.z > 30) c.z = -1500; if (c.z < -1500) c.z = 30;
      carMesh.setMatrixAt(i, M4.compose(V.set(c.x, 0.75, c.z), Q.identity(), S3.set(1, 1, 1)));
      const zf = c.z + c.dir * 2.25; // the lights on the end facing us: headlights coming, tail lights going
      ag.setXYZW(2 * i, c.x - 0.62, 0.8, zf, c.dir > 0 ? 2.2 : 1.5); ag.setXYZW(2 * i + 1, c.x + 0.62, 0.8, zf, c.dir > 0 ? 2.2 : 1.5);
    });
    carMesh.instanceMatrix.needsUpdate = true; ag.needsUpdate = true;
  }

  /* --- the Eiffel Tower at the end of the boulevard: bronze against the dusk; gold at night, sparkling now and then, its beacon sweeping --- */
  const towerU = { uMask: { value: keep(parisTower(THREE)) }, uIron: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uGold: { value: new THREE.Color("#ffb347") }, uNight: nightU, uTime: time, uSparkle: { value: 0 }, uHaze: { value: new THREE.Color() }, uHazeAmt: { value: 0.3 } };
  const tower = new THREE.Mesh(quad, shader(LANTERN_LAYER_VS, PARIS_TOWER_FS, towerU, { transparent: true, depthWrite: false }));
  tower.position.set(TOWER[0], 163, TOWER[1]); tower.scale.set(125, 330, 1); tower.lookAt(CAM[0], 163, CAM[1]); tower.renderOrder = 2; tower.frustumCulled = false;
  scene.add(tower);
  const beamU = { uColor: { value: new THREE.Color("#fff1d0") }, uAmt: { value: 0 } };
  const beamGeo = keep(new THREE.PlaneGeometry(1800, 12).translate(900, 0, 0));
  const beamMat = shader(LANTERN_LAYER_VS, PARIS_BEAM_FS, beamU, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  const beacon = new THREE.Group(); // each beam: two crossed planes, rolled about the beam, tilted up, then turned to its bearing
  beacon.position.set(TOWER[0], 318, TOWER[1]);
  for (const a of [0, Math.PI]) for (const roll of [0, Math.PI / 2]) { const b = new THREE.Mesh(beamGeo, beamMat); b.rotation.set(roll, a, 0.035, "YZX"); b.frustumCulled = false; b.renderOrder = 3; beacon.add(b); }
  scene.add(beacon);
  const redLight = new THREE.Sprite(keep(new THREE.SpriteMaterial({ map: glow, color: 0xff3020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false })));
  redLight.position.set(TOWER[0], 331, TOWER[1]); redLight.scale.setScalar(14); redLight.renderOrder = 4;
  scene.add(redLight);

  /* --- the Invalides' gilded dome over the roofs on the left; La Défense far off in the haze --- */
  const stoneMat = std({ color: 0xdcd0b8, roughness: 0.9, envMapIntensity: 0.2 });
  const goldMat = std({ color: 0xe0b24a, metalness: 0.85, roughness: 0.3, envMapIntensity: 1.2, emissive: 0x000000 });
  const domeParts = [
    [keep(new THREE.BoxGeometry(76, 24, 64)), stoneMat, 12], [keep(new THREE.CylinderGeometry(16, 17, 30, 36)), stoneMat, 39],
    [keep(new THREE.SphereGeometry(15.5, 36, 14, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 1.35, 1)), goldMat, 54], [keep(new THREE.CylinderGeometry(3, 3.4, 9, 12)), goldMat, 79],
    [keep(new THREE.ConeGeometry(1.6, 22, 8)), goldMat, 94.5],
  ];
  for (const [g, m, y] of domeParts) { const mesh = new THREE.Mesh(g, m); mesh.position.set(DOME[0], y, DOME[1]); mesh.castShadow = mesh.receiveShadow = !preview; scene.add(mesh); }
  const skyU = { uMask: { value: keep(parisSkyline(THREE, preview ? 1024 : 2048)) }, uBody: { value: new THREE.Color() }, uRim: { value: new THREE.Color() }, uLights: { value: new THREE.Color() }, uTime: time };
  const skyline = new THREE.Mesh(quad, shader(LANTERN_LAYER_VS, SANTORINI_ISLE_FS, skyU, { transparent: true, depthWrite: false }));
  skyline.position.set(1700, 126, -9000); skyline.scale.set(2400, 260, 1); skyline.lookAt(CAM[0], 126, CAM[1]); skyline.renderOrder = 1; skyline.frustumCulled = false;
  scene.add(skyline);

  /* --- pigeons wheeling over the roofs by day --- */
  const NP = preview ? 3 : 6, pigeonGeo = keep(lhGull(THREE)), aGull = new THREE.InstancedBufferAttribute(new Float32Array(NP * 2), 2);
  aGull.setUsage(THREE.DynamicDrawUsage);
  pigeonGeo.setAttribute("aGull", aGull);
  const pigeons = new THREE.InstancedMesh(pigeonGeo, shader(LH_GULL_VS, LH_GULL_FS, { uBody: { value: new THREE.Color("#8b9097") }, uWing: { value: new THREE.Color("#a3a9b1") }, uTip: { value: new THREE.Color("#2b2d31") } }), NP);
  pigeons.frustumCulled = false; pigeons.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  scene.add(pigeons);
  const flock = Array.from({ length: NP }, (_, i) => ({ a: (i / NP) * 6.28 + r(-0.2, 0.2), R: r(16, 26), h: r(46, 58), beat: r(0, 6.28) }));
  function stepPigeons(dt, t) {
    flock.forEach((p, i) => {
      p.a += 0.32 * dt; p.beat += dt * 11;
      const cx = -40 + Math.sin(t * 0.05) * 20, cz = -95;
      V.set(cx + Math.cos(p.a) * p.R, p.h + Math.sin(p.a * 2 + i) * 2.5, cz + Math.sin(p.a) * p.R * 0.6);
      const vx = -Math.sin(p.a) * p.R, vz = Math.cos(p.a) * p.R * 0.6;
      E.set(0, Math.atan2(-vx, -vz), 0.35, "YXZ");
      pigeons.setMatrixAt(i, M4.compose(V, Q.setFromEuler(E), S3.setScalar(0.55)));
      aGull.setXY(i, p.beat, 0.45);
    });
    pigeons.instanceMatrix.needsUpdate = aGull.needsUpdate = true;
  }

  /* --- close by: the balcony's wrought-iron railing, a flower box in the accent colour on it --- */
  const railTex = parisRailing(THREE, preview ? 1024 : 2048);
  keep(railTex.map); keep(railTex.mask);
  const railU = { uMap: { value: railTex.map }, uMask: { value: railTex.mask }, uAccent: { value: accent }, uTint: { value: new THREE.Color() }, uRep: { value: new THREE.Vector2(1, 0) } };
  const rail = new THREE.Mesh(quad, shader(LANTERN_LAYER_VS, PARIS_RAIL_FS, railU, { alphaToCoverage: true, ...KEEP_ALPHA, side: THREE.DoubleSide }));
  rail.frustumCulled = false;
  scene.add(rail);

  // real shadows from the first draw; the city stands still, so the map is drawn once (and again when night swaps in the moon)
  let shadowsOn = false, gone = false, rend = null;
  sky.onBeforeRender = (renderer) => {
    rend = renderer;
    if (preview || shadowsOn) return;
    shadowsOn = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.enabled = true; renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    setTimeout(() => { if (gone) return; for (const m of shadowMats) m.needsUpdate = true; renderer.shadowMap.needsUpdate = true; renderer.render(scene, camera); }, 0);
  };

  function applyPalette(p) {
    pal = p;
    const d = p.dark, L = d ? MOON : SUN;
    accent.set(p.accent);
    nightU.value = d ? 1 : 0;
    envTex?.dispose(); envTex = parisEnv(THREE, d); goldMat.envMap = envTex; goldMat.needsUpdate = true; // only the gilding mirrors the sky: cheaper than an environment for every roof
    skyUni.uZenith.value.set(d ? "#050a1e" : "#4d66a8"); skyUni.uMid.value.set(d ? "#0e1834" : "#dd9ca8"); skyUni.uHorizon.value.set(d ? "#2c2a48" : "#ffc48e");
    skyUni.uGlow.value.set(d ? "#7a4632" : "#ffa060").multiplyScalar(0.5); skyUni.uSun.value = d ? 0 : 1.4;
    starMat.opacity = d ? 0.55 : 0; stars.visible = moon.visible = moonHalo.visible = d;
    cloudUni.uSunDir.value.copy(L);
    cloudUni.uLit.value.set(d ? "#40384e" : "#ffc9a8"); cloudUni.uShade.value.set(d ? "#1a1c30" : "#9c86ae"); cloudUni.uGlow.value.set(d ? "#8a5a48" : "#ffb070").multiplyScalar(d ? 0.3 : 0.6); cloudUni.uHaze.value.set(d ? "#1e2038" : "#f4c0a8");
    sun.position.copy(L).multiplyScalar(1500).add(TARGET);
    sun.color.set(d ? "#9fb4e8" : "#ffa862"); sun.intensity = d ? 0.45 : 4.0;
    hemi.color.set(d ? "#222c52" : "#cdbad6"); hemi.groundColor.set(d ? "#3a2a20" : "#9a7a64"); hemi.intensity = d ? 0.6 : 0.85;
    scene.fog.color.set(d ? "#1b1f3a" : "#eac2ae");
    cityU.uLitAmt.value = d ? 1.1 : 0.1; cityU.uSkyGlass.value.set(d ? "#121a30" : "#c9c3d8");
    groundMat.emissive.set(d ? "#b8622a" : "#000000"); groundMat.emissiveIntensity = d ? 0.02 : 0;
    treeMat.emissive.set(d ? "#3a2810" : "#000000");
    towerU.uIron.value.set(d ? "#2a2026" : "#4b3a37"); towerU.uRim.value.set("#ffb070").multiplyScalar(0.55); towerU.uHaze.value.copy(scene.fog.color); towerU.uHazeAmt.value = d ? 0.15 : 0.32;
    beamU.uAmt.value = d ? 0.1 : 0; beacon.visible = redLight.visible = d;
    goldMat.emissive.set(d ? "#b8862e" : "#000000"); goldMat.emissiveIntensity = d ? 0.35 : 0;
    skyU.uBody.value.set(d ? "#141830" : "#c2b4c4"); skyU.uRim.value.set("#ffd0a0").multiplyScalar(d ? 0 : 0.18); skyU.uLights.value.set(d ? "#ffd9a0" : "#000000").multiplyScalar(0.9);
    lampGlow.visible = carGlow.visible = d;
    pigeons.visible = !d;
    railU.uTint.value.set(d ? "#4a5068" : "#fff2e6");
    if (rend && shadowsOn) rend.shadowMap.needsUpdate = true;
  }
  applyPalette(pal);

  const look = new THREE.Vector3(), fwd = new THREE.Vector3(), right = new THREE.Vector3();
  let sway = 0;
  function layout() { // on every render: a still frame gets no update() call
    const A = camera.aspect || 1, fov = A >= 1 ? 50 : 50 + (1 - A) * 22, yaw = A >= 1 ? YAW : YAW - (1 - A) * 0.35; // a phone turns towards the Tower
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); TAN = Math.tan((fov * Math.PI) / 360); }
    camera.position.set(CAM[0] + Math.sin(sway) * 0.3, EYE + Math.sin(sway * 1.7) * 0.05, CAM[1]);
    fwd.set(-Math.sin(yaw), 0, -Math.cos(yaw)); right.set(Math.cos(yaw), 0, -Math.sin(yaw));
    camera.lookAt(look.copy(camera.position).addScaledVector(fwd, 1000).setY(EYE + Math.tan(PITCH) * 1000));
    camera.updateMatrixWorld();
    const dist = 1.3, drop = dist * Math.tan(Math.atan(0.86 * TAN) - PITCH), half = dist * TAN * Math.max(A, 0.3), Wq = 2 * half + 0.6;
    rail.position.copy(camera.position).addScaledVector(fwd, dist).setY(EYE - drop - 0.35); rail.rotation.set(0, yaw, 0); rail.scale.set(Wq, 1.3, 1); // the top rail at EYE − drop
    const xf = 0.7 * half; // the flower box near the right edge of any screen
    railU.uRep.value.set(Wq / 2, ((0.85 - (xf + Wq / 2) / 2) % 1 + 1) % 1);
    rail.updateMatrixWorld();
  }
  scene.onBeforeRender = layout;
  function frame(dt, t) {
    time.value = t;
    sway = t * 0.025;
    stepCars(dt);
    if (!pal.dark) stepPigeons(dt, t);
    beacon.rotation.y = t * 0.55;
    const show = (t % 60) < 11; // the Tower sparkles for a while every minute (every hour, in Paris)
    towerU.uSparkle.value = pal.dark && show ? 1 : 0;
    redLight.material.opacity = 0.35 + 0.65 * (Math.sin(t * 2.4) > 0.2 ? 1 : 0.15);
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { return { buildings: city.buildings, pots: city.pots.length, trees: trees.length, lamps: lamps.length, cars: cars.slice(0, 3).map((c) => Math.round(c.z)), sparkle: towerU.uSparkle.value, shadows: shadowsOn }; }, // for checking by hand
    dispose() { gone = true; scene.fog = null; envTex?.dispose(); disposables.forEach((x) => x.dispose()); },
  };
}

/* ---------- Steam engine room: a horizontal mill engine at work in its engine house; sunbeams through tall windows by day, gas light at night ---------- */
// The engine is solid and runs on one crank angle: crosshead, connecting rod, crank and flywheel follow it exactly; the sun comes
// through the windows of the back wall (an alpha-tested wall, so the floor gets the window light, mullions and turning spokes
// as real shadows). The beams themselves are crossed planes along the light, the dust a cloud of points inside them.
const STEAM_SHAFT_VS = /* glsl */ `
  attribute vec2 aShaft; // along the beam (0 at the glass, 1 at its end), across it (0…1)
  varying vec2 vS; varying vec3 vWorld;
  void main() { vS = aShaft; vec4 w = modelMatrix * vec4(position, 1.0); vWorld = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }
`;
const STEAM_SHAFT_FS = /* glsl */ `
  uniform sampler2D uNoise; uniform float uTime; uniform vec3 uColor; uniform float uAmt;
  varying vec2 vS; varying vec3 vWorld;
  void main() {
    float along = vS.x, across = abs(vS.y - 0.5) * 2.0;
    vec3 N = normalize(cross(dFdx(vWorld), dFdy(vWorld)));
    float facing = abs(dot(N, normalize(cameraPosition - vWorld))); // a plane seen edge-on would show as a hard bright line
    float n = texture2D(uNoise, vec2(vWorld.x * 0.07 + vWorld.z * 0.05 + uTime * 0.008, vWorld.y * 0.09 - uTime * 0.005)).r;
    float a = (1.0 - along) * (1.0 - along) * smoothstep(0.0, 0.06, along) * (1.0 - smoothstep(0.45, 1.0, across)) * smoothstep(0.08, 0.5, facing) * (0.55 + 0.7 * n) * uAmt;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
  }
`;
const STEAM_DUST_VS = /* glsl */ `
  uniform float uTime; uniform float uPx;
  attribute vec4 aDust; // phase, speed, size, brightness
  varying float vB;
  void main() {
    float ph = aDust.x, sp = aDust.y;
    vec3 p = position + vec3(sin(uTime * 0.19 * sp + ph) * 0.3, sin(uTime * 0.11 * sp + ph * 1.7) * 0.22 + sin(uTime * 0.05 + ph) * 0.3, cos(uTime * 0.15 * sp + ph * 0.7) * 0.3);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vB = aDust.w * (0.55 + 0.45 * sin(uTime * (1.3 + sp) + ph * 9.0));
    gl_PointSize = max(1.0, aDust.z * uPx / -mv.z);
    gl_Position = projectionMatrix * mv;
  }
`;
const STEAM_DUST_FS = /* glsl */ `
  uniform vec3 uColor; uniform float uAmt;
  varying float vB;
  void main() {
    float a = smoothstep(0.5, 0.05, length(gl_PointCoord - 0.5)) * vB * uAmt;
    gl_FragColor = vec4(uColor * a, 1.0);
    #include <colorspace_fragment>
  }
`;
// puffs of steam: camera-facing quads that swell and fade over their life
const STEAM_PUFF_VS = /* glsl */ `
  attribute vec4 aPuff; // where, how big
  attribute float aLife; // 0 just out … 1 gone; below 0: not in use
  varying vec2 vUv; varying float vLife;
  void main() {
    vUv = uv; vLife = aLife;
    vec4 mv = modelViewMatrix * vec4(aPuff.xyz + vec3(0.0, aLife * aLife * 1.1, aLife * 0.55), 1.0); // blown out towards us, then rising
    mv.xy += position.xy * (aLife < 0.0 ? 0.0 : aPuff.w * (0.35 + 1.3 * aLife));
    gl_Position = projectionMatrix * mv;
  }
`;
const STEAM_PUFF_FS = /* glsl */ `
  uniform sampler2D uMap; uniform vec3 uColor;
  varying vec2 vUv; varying float vLife;
  void main() {
    float a = texture2D(uMap, vUv).a * smoothstep(0.0, 0.06, vLife) * (1.0 - smoothstep(0.4, 1.0, vLife)) * 0.8;
    if (a < 0.005) discard;
    gl_FragColor = vec4(uColor, a);
    #include <colorspace_fragment>
  }
`;
// the view through the windows, as masks: r the mill's buildings and its chimney, g their lit windows; the sky is a gradient
const STEAM_OUTSIDE_FS = /* glsl */ `
  uniform sampler2D uMask; uniform vec3 uSkyLow; uniform vec3 uSkyHigh; uniform vec3 uBody; uniform vec3 uLit;
  varying vec2 vUv;
  void main() {
    vec3 m = texture2D(uMask, vUv).rgb;
    vec3 col = mix(uSkyLow, uSkyHigh, smoothstep(0.1, 0.9, vUv.y));
    col = mix(col, uBody, m.r) + uLit * m.g;
    gl_FragColor = vec4(col, 1.0);
    #include <colorspace_fragment>
  }
`;
/** Encaustic floor tiles, 2.4 m square, repeating: terracotta and cream squares, small black squares where they meet, worn a little. */
function steamFloor(THREE) {
  const r = koiRng(1712);
  const tex = canvasTexture(THREE, 512, 512, (g, w) => {
    const t = w / 8;
    g.fillStyle = "#3a302a"; g.fillRect(0, 0, w, w);
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) {
      const c = (i + j) % 2 ? ["#8e5340", "#955a46", "#88503d"][(r() * 3) | 0] : ["#c4b497", "#bfae90", "#c8b99c"][(r() * 3) | 0];
      g.fillStyle = c; g.fillRect(i * t + 1.5, j * t + 1.5, t - 3, t - 3);
      if ((i + j) % 2 === 0) { g.fillStyle = "rgba(122,62,44,0.35)"; g.save(); g.translate(i * t + t / 2, j * t + t / 2); g.rotate(Math.PI / 4); g.fillRect(-t * 0.16, -t * 0.16, t * 0.32, t * 0.32); g.restore(); }
    }
    for (let i = 0; i <= 8; i++) for (let j = 0; j <= 8; j++) { g.fillStyle = "#3a2e27"; g.fillRect(i * t - t * 0.09, j * t - t * 0.09, t * 0.18, t * 0.18); }
    for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(${r() < 0.6 ? "40,30,24" : "255,245,230"},${r(0.03, 0.09)})`; g.fillRect(r(0, w), r(0, w), r(1, 3), r(1, 3)); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}
/** The back wall, 28 × 9.6 m: cream glazed brick over a green tiled dado, a maroon frieze; four tall arched windows (panes cut out, the
 *  iron glazing bars kept, so the sun throws their pattern on the floor) and the arched doorway to the boiler room. */
function steamWall(THREE, W) {
  const s = W / 28, H = Math.round(9.6 * s), r = koiRng(1851), c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d"), X = (m) => (m + 14) * s, Y = (m) => H - m * s;
  g.fillStyle = "#e4d9c2"; g.fillRect(0, 0, W, H);
  for (let y = 1.5, row = 0; y < 9.6; y += 0.075, row++) { // glazed bricks in stretcher bond
    g.fillStyle = "rgba(120,100,80,0.22)"; g.fillRect(0, Y(y), W, Math.max(1, 0.008 * s));
    for (let x = -14 + (row % 2) * 0.115; x < 14; x += 0.23) { g.fillRect(X(x), Y(y + 0.075), Math.max(1, 0.008 * s), 0.075 * s); if (r() < 0.25) { g.fillStyle = `rgba(${r() < 0.5 ? "255,250,240" : "150,130,100"},0.12)`; g.fillRect(X(x), Y(y + 0.075), 0.23 * s, 0.075 * s); g.fillStyle = "rgba(120,100,80,0.22)"; } }
  }
  g.fillStyle = "#2c4f40"; g.fillRect(0, Y(1.4), W, 1.4 * s); // the dado: green glazed tiles
  g.fillStyle = "rgba(0,0,0,0.18)"; for (let x = -14; x < 14; x += 0.15) g.fillRect(X(x), Y(1.4), Math.max(1, 0.006 * s), 1.4 * s);
  for (let y = 0.15; y < 1.4; y += 0.15) g.fillRect(0, Y(y), W, Math.max(1, 0.006 * s));
  g.fillStyle = "#d8ccb0"; g.fillRect(0, Y(1.52), W, 0.12 * s); g.fillStyle = "#6a2a26"; g.fillRect(0, Y(1.56), W, 0.03 * s);
  g.fillStyle = "#6a2a26"; g.fillRect(0, Y(8.35), W, 0.3 * s); g.fillStyle = "#d8ccb0"; g.fillRect(0, Y(8.42), W, 0.07 * s); // the frieze
  const arch = (cx, y0, w, top) => { const rr = w / 2; g.beginPath(); g.moveTo(X(cx - rr), Y(y0)); g.lineTo(X(cx - rr), Y(top - rr)); g.arc(X(cx), Y(top - rr), rr * s, Math.PI, 0); g.lineTo(X(cx + rr), Y(y0)); g.closePath(); };
  for (const cx of [-9, -3, 3, 9]) { // the windows
    g.fillStyle = "#d4c7aa"; arch(cx, 1.85, 3.1, 7.85); g.fill(); // a stone surround and sill
    g.fillStyle = "#c2b392"; g.fillRect(X(cx - 1.65), Y(2.0), 3.3 * s, 0.15 * s); g.beginPath(); g.moveTo(X(cx - 0.2), Y(7.95)); g.lineTo(X(cx + 0.2), Y(7.95)); g.lineTo(X(cx + 0.14), Y(7.45)); g.lineTo(X(cx - 0.14), Y(7.45)); g.closePath(); g.fill(); // the keystone
    g.save(); g.globalCompositeOperation = "destination-out"; arch(cx, 2.1, 2.6, 7.6); g.fill(); g.restore(); // the opening
    g.strokeStyle = "#262626"; g.lineWidth = 0.05 * s; g.lineCap = "butt"; // its iron glazing bars
    for (const dx of [-0.65, 0, 0.65]) { g.beginPath(); g.moveTo(X(cx + dx), Y(2.1)); g.lineTo(X(cx + dx), Y(6.3 + Math.sqrt(Math.max(0, 1.3 * 1.3 - dx * dx)))); g.stroke(); }
    for (let y = 2.75; y < 6.3; y += 0.6) { g.beginPath(); g.moveTo(X(cx - 1.3), Y(y)); g.lineTo(X(cx + 1.3), Y(y)); g.stroke(); }
    g.beginPath(); g.moveTo(X(cx - 1.3), Y(6.3)); g.lineTo(X(cx + 1.3), Y(6.3)); g.stroke();
    g.beginPath(); g.arc(X(cx), Y(6.3), 0.72 * s, Math.PI, 0); g.stroke();
    for (const a of [0.2, 0.4, 0.6, 0.8]) { g.beginPath(); g.moveTo(X(cx + Math.cos(Math.PI * a) * 0.72), Y(6.3 + Math.sin(Math.PI * a) * 0.72)); g.lineTo(X(cx + Math.cos(Math.PI * a) * 1.3), Y(6.3 + Math.sin(Math.PI * a) * 1.3)); g.stroke(); }
    g.lineWidth = 0.09 * s; arch(cx, 2.1, 2.6, 7.6); g.stroke(); // the frame
  }
  g.fillStyle = "#d4c7aa"; arch(-6, 0, 2.7, 4.05); g.fill(); // the doorway to the boiler room
  g.save(); g.globalCompositeOperation = "destination-out"; arch(-6, 0, 2.2, 3.8); g.fill(); g.restore();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}
/** What the windows look out on, as masks: r the mill across the yard (a weaving shed's sawtooth roofs, a tall chimney), g its lit windows. 32 × 9 m. */
function steamOutside(THREE) {
  const W = 1024, s = W / 32, H = Math.round(9 * s), r = koiRng(77), c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d"), X = (m) => (m + 16) * s, Y = (m) => H - m * s;
  g.fillStyle = "#000"; g.fillRect(0, 0, W, H); g.globalCompositeOperation = "lighter";
  g.fillStyle = "rgb(255,0,0)";
  for (let x = -16; x < 16; x += 1.6) { g.beginPath(); g.moveTo(X(x), Y(0)); g.lineTo(X(x), Y(3.2)); g.lineTo(X(x + 1.2), Y(4.2)); g.lineTo(X(x + 1.2), Y(3.2)); g.lineTo(X(x + 1.6), Y(3.2)); g.lineTo(X(x + 1.6), Y(0)); g.closePath(); g.fill(); } // the sheds
  g.fillRect(X(4), Y(5.6), 9 * s, 5.6 * s); // the spinning block
  g.beginPath(); g.moveTo(X(-5.6), Y(0)); g.lineTo(X(-5.1), Y(9)); g.lineTo(X(-4.3), Y(9)); g.lineTo(X(-3.8), Y(0)); g.closePath(); g.fill(); // the chimney
  for (let y = 0.8; y < 5; y += 1.1) for (let x = 4.4; x < 12.6; x += 0.9) if (r() < 0.6) { g.fillStyle = "rgb(0,255,0)"; g.fillRect(X(x), Y(y + 0.6), 0.4 * s, 0.6 * s); }
  for (let x = -15.6; x < 4; x += 1.6) if (r() < 0.5) { g.fillStyle = "rgb(0,200,0)"; g.fillRect(X(x + 1.25), Y(4.0), 0.25 * s, 0.6 * s); }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}
/** Mahogany lagging round the cylinder: planks with grain and a varnish sheen (u around, v along). */
function steamLagging(THREE) {
  const r = koiRng(31);
  return canvasTexture(THREE, 512, 128, (g, w, h) => {
    const n = 26, pw = w / n;
    for (let i = 0; i < n; i++) {
      const t = r(0.8, 1.1); g.fillStyle = `rgb(${Math.round(110 * t)},${Math.round(48 * t)},${Math.round(30 * t)})`; g.fillRect(i * pw, 0, pw, h);
      g.strokeStyle = "rgba(40,14,8,0.35)"; g.lineWidth = 1; for (let k = 0; k < 4; k++) { const x = i * pw + r(2, pw - 2); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + r(-3, 3), h * 0.3, x + r(-3, 3), h * 0.7, x + r(-2, 2), h); g.stroke(); }
      g.fillStyle = "rgba(20,8,4,0.6)"; g.fillRect(i * pw, 0, 1.2, h);
    }
  });
}
/** A cylinder cover: turned steel, a ring of bolts, the boss in the middle. */
function steamCover(THREE) {
  return canvasTexture(THREE, 256, 256, (g) => {
    const gr = g.createRadialGradient(110, 100, 10, 128, 128, 128); gr.addColorStop(0, "#e8eaec"); gr.addColorStop(0.6, "#a9adb3"); gr.addColorStop(1, "#7d8288");
    g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
    g.strokeStyle = "rgba(0,0,0,0.1)"; for (let rr = 8; rr < 128; rr += 5) { g.beginPath(); g.arc(128, 128, rr, 0, Math.PI * 2); g.stroke(); }
    for (let k = 0; k < 16; k++) { const a = (k / 16) * Math.PI * 2, x = 128 + Math.cos(a) * 108, y = 128 + Math.sin(a) * 108; g.fillStyle = "#4a4e54"; g.beginPath(); for (let j = 0; j < 6; j++) g.lineTo(x + Math.cos(j * 1.047) * 7, y + Math.sin(j * 1.047) * 7); g.closePath(); g.fill(); g.fillStyle = "#c8ccd0"; g.beginPath(); g.arc(x - 1, y - 1, 2.5, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = "#8e9298"; g.beginPath(); g.arc(128, 128, 30, 0, Math.PI * 2); g.fill(); g.fillStyle = "#d8dbde"; g.beginPath(); g.arc(122, 122, 16, 0, Math.PI * 2); g.fill();
  });
}
/** The two gauges' dials side by side: white enamel, ticks and figures over 270°, a red line; STEAM left, VACUUM right. */
function steamDials(THREE) {
  return canvasTexture(THREE, 512, 256, (g) => {
    ["STEAM", "VACUUM"].forEach((label, i) => {
      const cx = 128 + i * 256;
      g.fillStyle = "#f4f0e6"; g.beginPath(); g.arc(cx, 128, 124, 0, Math.PI * 2); g.fill();
      g.strokeStyle = "#1a1a1a";
      for (let k = 0; k <= 40; k++) { const a = Math.PI * 0.75 + (k / 40) * Math.PI * 1.5, l = k % 5 ? 10 : 20; g.lineWidth = k % 5 ? 2 : 4; g.beginPath(); g.moveTo(cx + Math.cos(a) * 112, 128 + Math.sin(a) * 112); g.lineTo(cx + Math.cos(a) * (112 - l), 128 + Math.sin(a) * (112 - l)); g.stroke(); }
      g.fillStyle = "#1a1a1a"; g.font = "bold 22px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
      for (let k = 0; k <= 8; k++) { const a = Math.PI * 0.75 + (k / 8) * Math.PI * 1.5; g.fillText(String(k * 25), cx + Math.cos(a) * 74, 128 + Math.sin(a) * 74); }
      g.strokeStyle = "#c0202a"; g.lineWidth = 7; g.beginPath(); g.arc(cx, 128, 104, Math.PI * 0.75 + Math.PI * 1.5 * 0.8, Math.PI * 0.75 + Math.PI * 1.5 * 0.86); g.stroke();
      g.font = "italic 15px Georgia, serif"; g.fillText(label, cx, 178);
    });
  });
}
/** The engine-house clock's face: cream enamel, Roman hours (IIII, as clockmakers paint it), minute ticks. XII at the top. */
function steamClockFace(THREE) {
  return canvasTexture(THREE, 256, 256, (g) => {
    g.fillStyle = "#f2ead6"; g.beginPath(); g.arc(128, 128, 127, 0, Math.PI * 2); g.fill();
    g.strokeStyle = "#1c1a16"; g.lineWidth = 3; g.beginPath(); g.arc(128, 128, 117, 0, Math.PI * 2); g.stroke(); g.lineWidth = 2; g.beginPath(); g.arc(128, 128, 100, 0, Math.PI * 2); g.stroke();
    for (let k = 0; k < 60; k++) { const a = (k / 60) * Math.PI * 2, r0 = k % 5 ? 108 : 101; g.lineWidth = k % 5 ? 1.5 : 4; g.beginPath(); g.moveTo(128 + Math.sin(a) * r0, 128 - Math.cos(a) * r0); g.lineTo(128 + Math.sin(a) * 116, 128 - Math.cos(a) * 116); g.stroke(); }
    g.fillStyle = "#1c1a16"; g.font = "bold 23px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle";
    ["XII", "I", "II", "III", "IIII", "V", "VI", "VII", "VIII", "IX", "X", "XI"].forEach((t, k) => { const a = (k / 12) * Math.PI * 2; g.fillText(t, 128 + Math.sin(a) * 80, 128 - Math.cos(a) * 80); });
    g.font = "italic 12px Georgia, serif"; g.fillText("IRONBRIDGE", 128, 168);
  });
}
/** The flywheel's rim face: rope grooves across it (u round the wheel, v across the rim). */
function steamRope(THREE) {
  const tex = canvasTexture(THREE, 64, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, "#8b9096"); gr.addColorStop(1, "#6d7278"); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 7; k++) { const y = (k + 0.5) * (h / 7); g.fillStyle = "#2c2e31"; g.fillRect(0, y - 9, w, 18); g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(0, y - 11, w, 2); }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
/** The maker's plate on the bed: cast brass letters on a black ground. */
function steamPlate(THREE) {
  return canvasTexture(THREE, 512, 128, (g) => {
    g.fillStyle = "#b8923e"; g.beginPath(); g.ellipse(256, 64, 250, 60, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#1c1a16"; g.beginPath(); g.ellipse(256, 64, 238, 50, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = "#e0c070"; g.font = "bold 40px Georgia, serif"; g.textAlign = "center"; g.textBaseline = "middle"; g.fillText("IRONBRIDGE WORKS", 256, 50); g.font = "italic 26px Georgia, serif"; g.fillText("No. 7 · 1891", 256, 90);
  });
}
/** What the polished steel and brass mirror: the bright windows on one side, warm walls, a dark floor (night: lamplight spots). */
function steamEnv(THREE, dark) {
  const tex = canvasTexture(THREE, 512, 256, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, dark ? "#0c0c12" : "#4a4238"); gr.addColorStop(0.45, dark ? "#2a2018" : "#b8a684"); gr.addColorStop(0.55, dark ? "#1a140e" : "#6a5a46"); gr.addColorStop(1, dark ? "#0a0806" : "#2a221c");
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    for (let k = 0; k < 4; k++) { const x = w * (0.32 + k * 0.08); if (dark) { const rg = g.createRadialGradient(x, h * 0.42, 0, x, h * 0.42, 14); rg.addColorStop(0, "rgba(255,190,120,1)"); rg.addColorStop(1, "rgba(255,150,80,0)"); g.fillStyle = rg; g.fillRect(x - 14, h * 0.42 - 14, 28, 28); } else { g.fillStyle = "#fff6e0"; g.fillRect(x - 9, h * 0.22, 18, h * 0.24); g.beginPath(); g.arc(x, h * 0.22, 9, Math.PI, 0); g.fill(); } }
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  return tex;
}
/** A soft puff of steam. */
function steamPuffTex(THREE) {
  const r = koiRng(5);
  return canvasTexture(THREE, 128, 128, (g) => {
    for (let i = 0; i < 11; i++) { const x = 64 + r(-20, 20), y = 64 + r(-16, 16), rad = r(22, 42), gr = g.createRadialGradient(x, y, 0, x, y, rad); gr.addColorStop(0, "rgba(255,255,255,0.6)"); gr.addColorStop(0.6, "rgba(255,255,255,0.25)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  });
}
function steamengine(THREE, scene, camera, pal, preview) {
  const disposables = [];
  const keep = (d) => { disposables.push(d); return d; };
  const r = koiRng(1769);
  const AX = 1.7, CRANK = 4.6, R = 0.9, L = 4.5, FLY_Z = -1.9, FLY_R = 3.6, WALL_Z = -6, DOOR = -6; // the centre line, crankshaft, crank, rod, flywheel; the boiler-room door
  camera.fov = 50; camera.near = 0.1; camera.far = 200;
  camera.aspect = preview ? 16 / 9 : window.innerWidth / Math.max(1, window.innerHeight); // resize() corrects it right after the build
  camera.updateProjectionMatrix();
  const time = { value: 0 };
  const noise = keep(lhNoise(THREE)), glow = keep(lhGlow(THREE));
  const SUN = new THREE.Vector3(-0.3, 0.6, -1).normalize(), D = SUN.clone().negate(); // the afternoon sun, low behind the windows: the light comes in towards us
  const shader = (vs, fs, uniforms, extra = {}) => keep(new THREE.ShaderMaterial({ uniforms, vertexShader: vs, fragmentShader: fs, ...extra }));
  const shadowMats = [], envMats = [];
  const std = (o, env = 0) => { const m = keep(new THREE.MeshStandardMaterial(o)); shadowMats.push(m); if (env) { m.envMapIntensity = env; envMats.push(m); } return m; };
  const E = new THREE.Euler(), Q = new THREE.Quaternion(), ONE = new THREE.Vector3(1, 1, 1);
  const at = (x, y, z, rx = 0, ry = 0, rz = 0) => new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), Q.setFromEuler(E.set(rx, ry, rz)), ONE);
  // everything that stands still is merged per material: one draw each (the moving parts get the same treatment per part)
  const bucket = () => { const parts = new Map(); return { put(geo, mat, x = 0, y = 0, z = 0, rx, ry, rz) { if (!parts.has(mat)) parts.set(mat, []); parts.get(mat).push([geo, at(x, y, z, rx, ry, rz)]); }, flush(parent = scene, cast = true) { const out = []; for (const [mat, list] of parts) { const m = new THREE.Mesh(keep(mergeParts(THREE, list)), mat); m.castShadow = cast && !preview; m.receiveShadow = !preview; parent.add(m); out.push(m); } parts.clear(); return out; } }; };
  const still = bucket(), quiet = bucket(); // quiet: lamps and the like, which cast no shadow
  const put = still.put;
  const cylX = (rad, len, seg = 32, open = false) => new THREE.CylinderGeometry(rad, rad, len, seg, 1, open).rotateZ(Math.PI / 2); // along x
  const cylZ = (rad, len, seg = 32, open = false) => new THREE.CylinderGeometry(rad, rad, len, seg, 1, open).rotateX(Math.PI / 2); // along z
  const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
  const inward = (g) => { const n = g.attributes.normal, ix = g.index; for (let i = 0; i < n.count; i++) n.setXYZ(i, -n.getX(i), -n.getY(i), -n.getZ(i)); for (let i = 0; i < ix.count; i += 3) { const a = ix.getX(i + 1); ix.setX(i + 1, ix.getX(i + 2)); ix.setX(i + 2, a); } return g; };

  /* --- materials: polished steel, brass and copper mirror the room; the frame and the flywheel in the accent colour, lined in gold --- */
  const steel = std({ color: 0xc9cdd3, metalness: 1, roughness: 0.22 }, 1), brass = std({ color: 0xd4a84e, metalness: 1, roughness: 0.27 }, 1), copper = std({ color: 0xc47b4f, metalness: 1, roughness: 0.32 }, 1);
  const paint = std({ roughness: 0.3 }, 0.45), iron = std({ color: 0x24282c, roughness: 0.55 }, 0.3), stone = std({ color: 0xb4a994, roughness: 0.85 });
  const wood = std({ map: keep(steamLagging(THREE)), roughness: 0.38 }, 0.5), board = std({ color: 0x5c2c1c, roughness: 0.45 }, 0.3);
  const cover = std({ map: keep(steamCover(THREE)), metalness: 1, roughness: 0.25 }, 1);

  /* --- light: the sun through the windows (the moon at night) casts real shadows; gas light and the boiler's fire at night --- */
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1), sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.position.copy(SUN).multiplyScalar(45); sun.target.position.set(0, 0, 0);
  if (!preview) {
    sun.castShadow = true; sun.shadow.mapSize.set(1536, 1536); // the frustum hugs what the camera sees in the sun's view (floor, wall, engine): 2.3 × 1 cm a texel
    Object.assign(sun.shadow.camera, { left: -18, right: 17, top: 10.5, bottom: -6, near: 15, far: 75 });
    sun.shadow.camera.updateProjectionMatrix(); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.03;
  }
  const lamps = [[-3.2, 4.7, 0.6], [2.4, 4.7, 0.6]].map(([x, y, z]) => { const l = new THREE.PointLight(0xffb468, 0, 16, 2); l.position.set(x, y, z); scene.add(l); return l; });
  const fill = new THREE.DirectionalLight(0xfff1dc, 0); // daylight bouncing back from the open hall behind us: the wall and the engine's faces
  fill.position.set(5, 6, 20); fill.target.position.set(0, 2, 0);
  const fire = new THREE.PointLight(0xff7a30, 0, 10, 2);
  fire.position.set(DOOR, 1.4, WALL_Z - 2.0);
  scene.add(hemi, sun, sun.target, fill, fill.target, fire);
  scene.fog = new THREE.Fog(0xffffff, 14, 46);

  /* --- the engine house: tiled floor round the flywheel pit, the windowed back wall, the roof that shades the sun --- */
  const floorMat = std({ map: keep(steamFloor(THREE)), roughness: 0.36 }, 0.35);
  const PIT = [0.55, 8.65, -2.45, -1.35]; // x0 x1 z0 z1
  const floorRect = (x0, x1, z0, z1) => { const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0).rotateX(-Math.PI / 2), uv = g.attributes.uv, p = g.attributes.position; for (let i = 0; i < uv.count; i++) uv.setXY(i, (p.getX(i) + (x0 + x1) / 2) / 2.4, -(p.getZ(i) + (z0 + z1) / 2) / 2.4); return [g, at((x0 + x1) / 2, 0, (z0 + z1) / 2)]; };
  const floor = new THREE.Mesh(keep(mergeParts(THREE, [floorRect(-16, PIT[0], WALL_Z, 14), floorRect(PIT[1], 16, WALL_Z, 14), floorRect(PIT[0], PIT[1], PIT[3], 14), floorRect(PIT[0], PIT[1], WALL_Z, PIT[2])])), floorMat);
  floor.receiveShadow = !preview; scene.add(floor);
  const pitMat = std({ color: 0x2a2521, roughness: 0.9 });
  put(box(PIT[1] - PIT[0], 0.05, PIT[3] - PIT[2]), pitMat, (PIT[0] + PIT[1]) / 2, -2.45, (PIT[2] + PIT[3]) / 2);
  for (const [w, d, x, z] of [[PIT[1] - PIT[0], 0.05, (PIT[0] + PIT[1]) / 2, PIT[2]], [PIT[1] - PIT[0], 0.05, (PIT[0] + PIT[1]) / 2, PIT[3]], [0.05, PIT[3] - PIT[2], PIT[0], (PIT[2] + PIT[3]) / 2], [0.05, PIT[3] - PIT[2], PIT[1], (PIT[2] + PIT[3]) / 2]]) put(box(w, 2.45, d), pitMat, x, -1.225, z);
  const wallMat = std({ map: keep(steamWall(THREE, preview ? 1024 : 2048)), alphaTest: 0.5, roughness: 0.75, side: THREE.DoubleSide }, 0.15);
  const wall = new THREE.Mesh(keep(new THREE.PlaneGeometry(28, 9.6)), wallMat);
  wall.position.set(0, 4.8, WALL_Z); wall.castShadow = wall.receiveShadow = !preview; scene.add(wall);
  const plain = std({ color: 0xcfc3aa, roughness: 0.85 });
  put(box(34, 0.4, 22), plain, 0, 9.8, 4); // the roof: only the windows let the sun in
  put(box(0.4, 10, 22), plain, -14.2, 5, 4); put(box(0.4, 10, 22), plain, 14.2, 5, 4); // the side walls meet the back wall's ends
  put(box(34, 2.6, 0.4), plain, 0, 11.1, WALL_Z - 0.1);
  for (const z of [-3.2, 0.8, 4.8, 8.8, 12.8]) { put(box(32, 0.34, 0.3), iron, 0, 9.43, z); for (const x of [-12, -6, 0, 6, 12]) put(box(0.16, 0.16, 4), iron, x, 9.52, z + 2); } // the roof's tie beams and purlins
  for (const [x, z] of [[-11.4, -3.9], [11.6, -3.9]]) { put(new THREE.CylinderGeometry(0.17, 0.21, 9.6, 24), iron, x, 4.8, z); put(new THREE.CylinderGeometry(0.3, 0.3, 0.12, 24), brass, x, 1.25, z); put(new THREE.CylinderGeometry(0.34, 0.26, 0.4, 24), iron, x, 9.4, z); } // cast-iron columns, seen on wide screens
  const outU = { uMask: { value: keep(steamOutside(THREE)) }, uSkyLow: { value: new THREE.Color() }, uSkyHigh: { value: new THREE.Color() }, uBody: { value: new THREE.Color() }, uLit: { value: new THREE.Color() } };
  const outside = new THREE.Mesh(keep(new THREE.PlaneGeometry(36, 10.5)), shader(LANTERN_LAYER_VS, STEAM_OUTSIDE_FS, outU));
  outside.position.set(0, 5.25, WALL_Z - 4.6); scene.add(outside);
  // the boiler room behind the doorway: a Lancashire boiler's front with its two fire doors
  const sooty = std({ color: 0x5a4334, roughness: 0.95, side: THREE.DoubleSide }); // brick, blackened
  const room = inward(box(3.8, 4.4, 3.2)); room.setIndex([...room.index.array.slice(0, 24), ...room.index.array.slice(30)]); // open towards the doorway
  put(room, sooty, DOOR, 2.2, WALL_Z - 1.65);
  put(cylZ(1.45, 0.3, 40), iron, DOOR, 1.75, WALL_Z - 3.05);
  for (const dx of [-0.55, 0.55]) put(new THREE.TorusGeometry(0.3, 0.04, 8, 24), brass, DOOR + dx, 1.05, WALL_Z - 2.89);
  const fireMat = keep(new THREE.MeshBasicMaterial({ color: 0xff8a3a })), fireBase = new THREE.Color();
  const fireDoors = new THREE.Mesh(keep(mergeParts(THREE, [-0.55, 0.55].map((dx) => [new THREE.CircleGeometry(0.27, 24), at(DOOR + dx, 1.05, WALL_Z - 2.88)]))), fireMat);
  scene.add(fireDoors);

  /* --- the engine: bed, cylinder, guides, crosshead, rod, crank, flywheel, governor --- */
  const BED = [-7.4, 2.4];
  put(box(BED[1] - BED[0] + 0.3, 0.16, 1.6), stone, (BED[0] + BED[1]) / 2, 0.08, 0); // the stone plinth
  put(box(BED[1] - BED[0], 0.9, 1.24), paint, (BED[0] + BED[1]) / 2, 0.61, 0); // the bed
  put(box(BED[1] - BED[0] + 0.08, 0.08, 1.32), paint, (BED[0] + BED[1]) / 2, 1.02, 0); // its top moulding
  for (const y of [0.92, 0.26]) put(box(BED[1] - BED[0] - 0.3, 0.025, 0.01), brass, (BED[0] + BED[1]) / 2, y, 0.625); // gold lining in panels
  for (let x = BED[0] + 0.15; x <= BED[1] - 0.1; x += (BED[1] - BED[0] - 0.3) / 4) put(box(0.025, 0.66, 0.01), brass, x, 0.59, 0.625);
  put(box(3.4, 0.16, 1.1), stone, 3.85, 0.08, -0.95); put(box(3.2, 0.9, 0.8), paint, 3.85, 0.61, -0.95); put(box(3.28, 0.08, 0.88), paint, 3.85, 1.02, -0.95); // the bed's arm to the main bearing
  const plate = new THREE.Mesh(keep(new THREE.PlaneGeometry(1.4, 0.35)), std({ map: keep(steamPlate(THREE)), metalness: 0.6, roughness: 0.35 }, 0.8));
  plate.position.set(BED[0] + 0.15 + (BED[1] - BED[0] - 0.3) * 0.625, 0.59, 0.627); scene.add(plate); // in the middle of the third panel
  put(cylX(0.78, 3.6, 48, true), wood, -5.1, AX, 0); // the cylinder in its mahogany lagging
  for (const x of [-6.6, -5.6, -4.6, -3.6]) put(new THREE.TorusGeometry(0.79, 0.035, 8, 48), brass, x, AX, 0, 0, Math.PI / 2, 0);
  for (const [x, sd] of [[-6.97, -1], [-3.23, 1]]) { put(cylX(0.84, 0.14, 48, true), steel, x, AX, 0); put(new THREE.CircleGeometry(0.84, 48), cover, x + sd * 0.07, AX, 0, 0, sd * Math.PI / 2, 0); }
  put(cylX(0.17, 0.26, 24), brass, -3.05, AX, 0); // the gland
  put(box(2.8, 0.42, 0.9), paint, -5.1, AX + 0.99, 0); put(box(2.86, 0.05, 0.96), brass, -5.1, AX + 1.22, 0); // the valve chest
  put(new THREE.CylinderGeometry(0.09, 0.11, 0.3, 16), brass, -4.2, AX + 1.4, 0); put(new THREE.SphereGeometry(0.1, 14, 8), brass, -4.2, AX + 1.58, 0); // a lubricator
  for (const y of [AX + 0.33, AX - 0.33]) put(box(3.2, 0.1, 0.32), steel, 0.1, y, 0); // the slide bars
  for (const x of [-1.45, 1.65]) for (const z of [0.3, -0.3]) put(box(0.22, AX + 0.38 - 1.06, 0.08), paint, x, (1.06 + AX + 0.38) / 2, z); // their cheeks
  const crosshead = new THREE.Group(); scene.add(crosshead);
  const ch = bucket();
  ch.put(box(0.6, 0.5, 0.46), steel); for (const y of [0.255, -0.255]) ch.put(box(0.62, 0.035, 0.3), brass, 0, y, 0);
  ch.put(cylZ(0.075, 0.62, 16), steel); ch.put(new THREE.CylinderGeometry(0.06, 0.07, 0.18, 12), brass, 0, 0.36, 0); // the pin, an oil cup
  ch.flush(crosshead);
  const pistonRod = new THREE.Mesh(keep(cylX(0.075, 1, 16)), steel); pistonRod.position.y = AX; pistonRod.castShadow = pistonRod.receiveShadow = !preview; scene.add(pistonRod);
  const rod = new THREE.Group(); scene.add(rod); // the connecting rod, from the crosshead pin to the crank pin
  const rb = bucket();
  rb.put(new THREE.CylinderGeometry(0.13, 0.1, L - 0.72, 20).rotateZ(-Math.PI / 2), steel, L / 2, 0, 0);
  rb.put(box(0.42, 0.38, 0.32), steel); rb.put(box(0.6, 0.6, 0.34), steel, L, 0, 0);
  for (const y of [0.33, -0.33]) rb.put(box(0.64, 0.08, 0.36), brass, L, y, 0);
  rb.flush(rod);
  const crank = new THREE.Group(); crank.position.set(CRANK, AX, 0); scene.add(crank); // an overhung disc crank, polished at the rim
  const cb = bucket();
  cb.put(cylZ(1.1, 0.3, 56), paint, 0, 0, -0.32); cb.put(new THREE.TorusGeometry(1.1, 0.03, 6, 56), steel, 0, 0, -0.17);
  cb.put(new THREE.CylinderGeometry(0.95, 0.95, 0.4, 32, 1, false, Math.PI, Math.PI).rotateX(Math.PI / 2), paint, 0, 0, -0.32); // the counterweight, opposite the pin
  cb.put(cylZ(0.12, 0.5, 20), steel, R, 0, -0.04); cb.put(cylZ(0.24, 0.16, 24), steel, 0, 0, -0.1);
  cb.flush(crank);
  put(cylZ(0.2, 3.1, 32), steel, CRANK, AX, -1.75); // the crankshaft through the flywheel
  put(box(1.25, 1.2, 0.8), stone, CRANK, 0.6, -2.95); // the outer bearing's pedestal; the main bearing sits on the bed's arm
  for (const [z, y0] of [[-0.95, 1.06], [-2.95, 1.2]]) { put(box(0.9, 1.92 - y0, 0.5), paint, CRANK, (y0 + 1.92) / 2, z); put(box(0.62, 0.16, 0.52), brass, CRANK, 2.0, z); put(new THREE.CylinderGeometry(0.06, 0.07, 0.2, 12), brass, CRANK, 2.18, z); }
  const fly = new THREE.Group(); fly.position.set(CRANK, AX, FLY_Z); scene.add(fly);
  const ropeTex = keep(steamRope(THREE)); ropeTex.repeat.set(36, 1);
  const fb = bucket();
  fb.put(new THREE.CylinderGeometry(FLY_R, FLY_R, 0.6, 120, 1, true).rotateX(Math.PI / 2), std({ map: ropeTex, metalness: 0.9, roughness: 0.35 }, 0.8));
  fb.put(inward(new THREE.CylinderGeometry(FLY_R - 0.45, FLY_R - 0.45, 0.6, 120, 1, true)).rotateX(Math.PI / 2), paint);
  for (const z of [0.3, -0.3]) { fb.put(new THREE.RingGeometry(FLY_R - 0.45, FLY_R, 120), paint, 0, 0, z, 0, z > 0 ? 0 : Math.PI, 0); fb.put(new THREE.TorusGeometry(FLY_R - 0.22, 0.018, 6, 160), brass, 0, 0, z * 1.01); }
  for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2, m = (0.6 + FLY_R - 0.45) / 2; fb.put(new THREE.CylinderGeometry(0.1, 0.17, FLY_R - 1.05, 14).scale(1, 1, 1.6), paint, Math.cos(a) * m, Math.sin(a) * m, 0, 0, 0, a - Math.PI / 2); }
  fb.put(cylZ(0.66, 0.92, 40), paint); fb.put(cylZ(0.4, 0.96, 32), steel);
  fb.flush(fly);
  // the governor on the end of the bed, its balls flying out as the engine runs
  const GOV = [2.1, -0.42];
  put(box(0.5, 0.12, 0.5), paint, GOV[0], 1.12, GOV[1]); put(new THREE.CylinderGeometry(0.09, 0.14, 1.3, 16), paint, GOV[0], 1.83, GOV[1]); put(new THREE.CylinderGeometry(0.18, 0.13, 0.16, 16), brass, GOV[0], 2.56, GOV[1]);
  const gov = new THREE.Group(); gov.position.set(GOV[0], 2.64, GOV[1]); scene.add(gov);
  const gb = bucket();
  gb.put(new THREE.CylinderGeometry(0.022, 0.022, 1.2, 10), steel, 0, 0.6, 0); gb.put(new THREE.SphereGeometry(0.05, 12, 8), brass, 0, 1.22, 0);
  gb.flush(gov);
  const armGeo = (len, rad) => new THREE.CylinderGeometry(rad, rad, len, 8).translate(0, -len / 2, 0);
  const arms = [-1, 1].map((sd) => { const pivot = new THREE.Group(); pivot.position.set(0, 1.1, 0); gov.add(pivot); const b = bucket(); b.put(armGeo(0.5, 0.016), steel); b.put(new THREE.SphereGeometry(0.1, 20, 14), brass, 0, -0.52, 0); b.flush(pivot); pivot.userData.side = sd; return pivot; });
  const links = [-1, 1].map(() => { const m = new THREE.Mesh(keep(armGeo(1, 0.012)), steel); m.castShadow = !preview; gov.add(m); return m; });
  const sleeve = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.06, 0.12, 14)), brass); sleeve.castShadow = !preview; gov.add(sleeve);
  // the gauge board by the cylinder: steam and vacuum
  put(new THREE.CylinderGeometry(0.05, 0.08, 1.75, 12), iron, -2.15, 0.88, 1.45); put(box(0.98, 0.52, 0.06), board, -2.15, 1.98, 1.45, 0, 0.2, 0);
  const dialMat = std({ map: keep(steamDials(THREE)), roughness: 0.3 }, 0.6), dialParts = [];
  const needles = [["STEAM", -0.23, 0.62], ["VACUUM", 0.23, 0.45]].map(([, dx, base], i) => {
    const x = -2.15 + dx * Math.cos(0.2), z = 1.49 - dx * Math.sin(0.2);
    const g = new THREE.CircleGeometry(0.18, 40), uv = g.attributes.uv; for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / 2);
    dialParts.push([g, at(x, 1.98, z, 0, 0.2, 0)]);
    put(new THREE.TorusGeometry(0.185, 0.022, 8, 40), brass, x + 0.012 * Math.sin(0.2), 1.98, z + 0.012 * Math.cos(0.2), 0, 0.2, 0);
    const n = new THREE.Mesh(keep(new THREE.BoxGeometry(0.008, 0.14, 0.004).translate(0, 0.06, 0)), iron); n.position.set(x + 0.02 * Math.sin(0.2), 1.98, z + 0.02 * Math.cos(0.2)); n.rotation.order = "YXZ"; n.rotation.y = 0.2; scene.add(n);
    return { n, base, ph: r(0, 6) };
  });
  scene.add(new THREE.Mesh(keep(mergeParts(THREE, dialParts)), dialMat));
  // the steam main from the wall, its stop valve and handwheel
  put(cylZ(0.11, 5.7, 20), copper, -5.1, 6.15, -3.15); put(cylZ(0.2, 0.06, 20), brass, -5.1, 6.15, WALL_Z + 0.03); put(new THREE.TorusGeometry(0.3, 0.11, 12, 24, Math.PI / 2), copper, -5.1, 5.85, -0.3, 0, -Math.PI / 2, 0);
  put(new THREE.CylinderGeometry(0.11, 0.11, 3.0, 20), copper, -5.1, 4.35, 0); put(new THREE.SphereGeometry(0.24, 20, 14), brass, -5.1, 3.95, 0);
  for (const y of [5.6, 3.0]) put(new THREE.CylinderGeometry(0.16, 0.16, 0.06, 20), brass, -5.1, y, 0); // flanges
  put(cylZ(0.025, 0.42, 8), steel, -5.1, 3.95, 0.21); put(new THREE.TorusGeometry(0.28, 0.025, 8, 36), iron, -5.1, 3.95, 0.42);
  for (let k = 0; k < 4; k++) put(box(0.56, 0.025, 0.025), iron, -5.1, 3.95, 0.42, 0, 0, (k * Math.PI) / 4);
  // the engine-house clock between the middle windows, on real time; its minute hand jumps once a minute, like a slave clock's
  const CK = [0, 6.5, WALL_Z];
  put(cylZ(0.7, 0.12, 48), board, CK[0], CK[1], CK[2] + 0.06); put(new THREE.TorusGeometry(0.6, 0.035, 8, 48), brass, CK[0], CK[1], CK[2] + 0.125);
  const clockFace = new THREE.Mesh(keep(new THREE.CircleGeometry(0.58, 48)), std({ map: keep(steamClockFace(THREE)), roughness: 0.35 }, 0.4));
  clockFace.position.set(CK[0], CK[1], CK[2] + 0.122); scene.add(clockFace);
  const hand = (w, len, z) => { const m = new THREE.Mesh(keep(new THREE.BoxGeometry(w, len, 0.012).translate(0, len / 2 - 0.08, 0)), iron); m.position.set(CK[0], CK[1], CK[2] + z); scene.add(m); return m; };
  const hourHand = hand(0.05, 0.42, 0.135), minuteHand = hand(0.032, 0.6, 0.15);
  let clockMin = -1;
  const setClock = () => { const d = new Date(), m = d.getHours() * 60 + d.getMinutes(); if (m === clockMin) return; clockMin = m; minuteHand.rotation.z = -(d.getMinutes() / 60) * Math.PI * 2; hourHand.rotation.z = -((m % 720) / 720) * Math.PI * 2; };
  setClock();
  // railings round the pit and along the engine's front
  const rail = (x0, z0, x1, z1) => { const len = Math.hypot(x1 - x0, z1 - z0), a = Math.atan2(z1 - z0, x1 - x0); for (const y of [1.0, 0.55]) put(new THREE.CylinderGeometry(0.025, 0.025, len, 8).rotateZ(Math.PI / 2), brass, (x0 + x1) / 2, y, (z0 + z1) / 2, 0, -a, 0); for (let k = 0, n = Math.max(1, Math.round(len / 1.8)); k <= n; k++) put(new THREE.CylinderGeometry(0.028, 0.032, 1.0, 8), iron, x0 + ((x1 - x0) * k) / n, 0.5, z0 + ((z1 - z0) * k) / n); };
  const [px0, px1, pz0, pz1] = [PIT[0] - 0.15, PIT[1] + 0.15, PIT[2] - 0.15, PIT[3] + 0.15];
  rail(px0, pz1, 2.15, pz1); rail(5.55, pz1, px1, pz1); rail(px0, pz0, CRANK - 0.75, pz0); rail(CRANK + 0.75, pz0, px1, pz0); rail(px0, pz0, px0, pz1); rail(px1, pz0, px1, pz1);
  rail(-7.2, 1.9, -2.7, 1.9);
  // gas lamps: two pendants over the engine, brackets on the wall between the windows and over the boiler-room door
  const globeMat = std({ color: 0xf2e6d0, roughness: 0.2 }, 0.5), shadeMat = std({ color: 0x2a4a38, roughness: 0.45, side: THREE.DoubleSide }, 0.4);
  const glowPts = [];
  for (const l of lamps) { const { x, y, z } = l.position; quiet.put(new THREE.CylinderGeometry(0.012, 0.012, 9.6 - (y + 0.25), 6), iron, x, (9.6 + y + 0.25) / 2, z); quiet.put(new THREE.ConeGeometry(0.44, 0.3, 28, 1, true), shadeMat, x, y + 0.15, z); quiet.put(new THREE.SphereGeometry(0.11, 16, 10), globeMat, x, y - 0.02, z); glowPts.push([x, y - 0.02, z, 1.6]); }
  for (const [x, y] of [[0, 3.55], [6, 3.55], [DOOR, 4.6]]) { quiet.put(new THREE.CylinderGeometry(0.02, 0.02, 0.5, 6).rotateX(Math.PI / 2), brass, x, y - 0.15, WALL_Z + 0.25); quiet.put(new THREE.SphereGeometry(0.12, 16, 10), globeMat, x, y, WALL_Z + 0.5); glowPts.push([x, y, WALL_Z + 0.5, 1.4]); }
  still.flush(); quiet.flush(scene, false);
  const glowQuad = keep(new THREE.PlaneGeometry(1, 1)), glowGeo = keep(new THREE.InstancedBufferGeometry());
  glowGeo.setIndex(glowQuad.index); glowGeo.setAttribute("position", glowQuad.attributes.position); glowGeo.setAttribute("uv", glowQuad.attributes.uv);
  glowGeo.setAttribute("aGlow", new THREE.InstancedBufferAttribute(new Float32Array(glowPts.flat()), 4)); glowGeo.instanceCount = glowPts.length;
  const glowMesh = new THREE.Mesh(glowGeo, shader(VENICE_GLOW_VS, VENICE_GLOW_FS, { uMap: { value: glow }, uColor: { value: new THREE.Color("#ffbf78") }, uTime: time }, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  glowMesh.frustumCulled = false; glowMesh.renderOrder = 20; scene.add(glowMesh);
  const fireGeo = keep(new THREE.InstancedBufferGeometry()); // the glow of the fire doors, seen through the doorway only
  fireGeo.setIndex(glowQuad.index); fireGeo.setAttribute("position", glowQuad.attributes.position); fireGeo.setAttribute("uv", glowQuad.attributes.uv);
  fireGeo.setAttribute("aGlow", new THREE.InstancedBufferAttribute(new Float32Array([DOOR - 0.55, 1.05, WALL_Z - 2.8, 1.5, DOOR + 0.55, 1.05, WALL_Z - 2.8, 1.5, DOOR, 2.6, WALL_Z - 1.8, 3.6]), 4)); fireGeo.instanceCount = 3; // the doors, and the firelight in the room
  const fireGlowU = { uMap: { value: glow }, uColor: { value: new THREE.Color("#ff7a30") }, uTime: time };
  const fireGlow = new THREE.Mesh(fireGeo, shader(VENICE_GLOW_VS, VENICE_GLOW_FS, fireGlowU, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fireGlow.frustumCulled = false; fireGlow.renderOrder = 20; scene.add(fireGlow);

  /* --- sunbeams through the four windows, and the dust floating in them --- */
  const shaftPos = [], shaftUv = [], dustPos = [], dustAttr = [];
  for (const cx of [-9, -3, 3, 9]) {
    const len = 4.4, dustLen = 13;
    for (const [a, b] of [[[cx - 1.3, 4.7, WALL_Z], [cx + 1.3, 4.7, WALL_Z]], [[cx, 2.1, WALL_Z], [cx, 7.4, WALL_Z]]]) {
      const a2 = [a[0] + D.x * len, a[1] + D.y * len, a[2] + D.z * len], b2 = [b[0] + D.x * len, b[1] + D.y * len, b[2] + D.z * len];
      for (const [p, uv] of [[a, [0, 0]], [b, [0, 1]], [b2, [1, 1]], [a, [0, 0]], [b2, [1, 1]], [a2, [1, 0]]]) { shaftPos.push(...p); shaftUv.push(...uv); }
    }
    for (let k = 0; k < (preview ? 60 : 240); k++) { // motes inside the beam's volume all the way to the floor, brighter near the glass
      const t = r(0.03, 0.97) * dustLen, px = cx + r(-1.25, 1.25) + D.x * t, py = r(2.2, 7.3) + D.y * t, pz = WALL_Z + D.z * t;
      if (py < 0.2) continue;
      dustPos.push(px, py, pz); dustAttr.push(r(0, 6.28), r(0.6, 1.4), r(0.012, 0.03), Math.pow(1 - t / dustLen, 0.8) * r(0.4, 1));
    }
  }
  const shaftGeo = keep(new THREE.BufferGeometry());
  shaftGeo.setAttribute("position", new THREE.Float32BufferAttribute(shaftPos, 3)); shaftGeo.setAttribute("aShaft", new THREE.Float32BufferAttribute(shaftUv, 2));
  const shaftU = { uNoise: { value: noise }, uTime: time, uColor: { value: new THREE.Color("#ffe2b4") }, uAmt: { value: 0 } };
  const shafts = new THREE.Mesh(shaftGeo, shader(STEAM_SHAFT_VS, STEAM_SHAFT_FS, shaftU, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  shafts.frustumCulled = false; shafts.renderOrder = 10; scene.add(shafts);
  const dustGeo = keep(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.Float32BufferAttribute(dustPos, 3)); dustGeo.setAttribute("aDust", new THREE.Float32BufferAttribute(dustAttr, 4));
  const dustU = { uTime: time, uPx: { value: 500 }, uColor: { value: new THREE.Color("#fff0d0") }, uAmt: { value: 0 } };
  const dust = new THREE.Points(dustGeo, shader(STEAM_DUST_VS, STEAM_DUST_FS, dustU, { transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  dust.frustumCulled = false; dust.renderOrder = 11; scene.add(dust);
  const buf = new THREE.Vector2();
  dust.onBeforeRender = (renderer) => { renderer.getDrawingBufferSize(buf); dustU.uPx.value = buf.y / (2 * Math.tan((camera.fov * Math.PI) / 360)); };

  /* --- steam: a puff from the drain cocks at each end of every stroke, a wisp at the stop valve --- */
  const NPUFF = 26, puffQuad = keep(new THREE.PlaneGeometry(1, 1)), puffGeo = keep(new THREE.InstancedBufferGeometry());
  puffGeo.setIndex(puffQuad.index); puffGeo.setAttribute("position", puffQuad.attributes.position); puffGeo.setAttribute("uv", puffQuad.attributes.uv);
  const aPuff = new THREE.InstancedBufferAttribute(new Float32Array(NPUFF * 4), 4), aLife = new THREE.InstancedBufferAttribute(new Float32Array(NPUFF).fill(-1), 1);
  aPuff.setUsage(THREE.DynamicDrawUsage); aLife.setUsage(THREE.DynamicDrawUsage);
  puffGeo.setAttribute("aPuff", aPuff); puffGeo.setAttribute("aLife", aLife); puffGeo.instanceCount = NPUFF;
  const puffU = { uMap: { value: keep(steamPuffTex(THREE)) }, uColor: { value: new THREE.Color() } };
  const puffs = new THREE.Mesh(puffGeo, shader(STEAM_PUFF_VS, STEAM_PUFF_FS, puffU, { transparent: true, depthWrite: false }));
  puffs.frustumCulled = false; puffs.renderOrder = 12; scene.add(puffs);
  const life = new Float32Array(NPUFF).fill(-1), dur = new Float32Array(NPUFF).fill(2);
  let nextPuff = 0;
  const emit = (x, y, z, size, d) => { const i = nextPuff; nextPuff = (nextPuff + 1) % NPUFF; aPuff.setXYZW(i, x + r(-0.05, 0.05), y, z + r(-0.05, 0.05), size); life[i] = 0; dur[i] = d; };

  // real shadows from the first draw; the engine moves, so the map follows it every frame
  let shadowsOn = false, gone = false;
  outside.onBeforeRender = (renderer) => {
    if (preview || shadowsOn) return;
    shadowsOn = true;
    renderer.shadowMap.type = THREE.PCFShadowMap; renderer.shadowMap.enabled = true;
    setTimeout(() => { if (gone) return; for (const m of shadowMats) m.needsUpdate = true; renderer.render(scene, camera); }, 0);
  };

  let env = null;
  function applyPalette(p) {
    pal = p;
    const d = p.dark;
    env?.dispose(); env = steamEnv(THREE, d);
    for (const m of envMats) m.envMap = env;
    paint.color.set(p.accent).multiplyScalar(0.8);
    sun.color.set(d ? "#8fa4d8" : "#ffe0b0"); sun.intensity = d ? 0.5 : preview ? 1.1 : 3.8; // the preview has no shadows: no roof to hold the sun off the floor
    hemi.color.set(d ? "#1c2234" : "#d6c4a6"); hemi.groundColor.set(d ? "#0e0a08" : "#4a3a2c"); hemi.intensity = d ? 0.2 : 0.55;
    fill.intensity = d ? 0 : 0.85;
    for (const l of lamps) l.intensity = d ? 38 : 0;
    globeMat.emissive.set(d ? "#ffc27a" : "#000000"); globeMat.emissiveIntensity = d ? 1.6 : 0;
    glowMesh.visible = d;
    fireBase.set(d ? "#ff8a3a" : "#c8642c"); fireGlowU.uColor.value.set(d ? "#ff7a30" : "#000000");
    scene.fog.color.set(d ? "#0e0c10" : "#cbb89c"); scene.fog.near = d ? 10 : 14; scene.fog.far = d ? 34 : 46;
    shaftU.uAmt.value = d ? 0.05 : 0.24; shaftU.uColor.value.set(d ? "#8fa4d8" : "#ffe2b4");
    dustU.uAmt.value = d ? 0.2 : 1; dustU.uColor.value.set(d ? "#9fb0d8" : "#fff0d0");
    outU.uSkyLow.value.set(d ? "#18233f" : "#f8f0e2"); outU.uSkyHigh.value.set(d ? "#070b1a" : "#d4e2ee"); outU.uBody.value.set(d ? "#0b0d14" : "#b9a594"); outU.uLit.value.set(d ? "#ffc070" : "#000000").multiplyScalar(0.85);
    puffU.uColor.value.set(d ? "#b8a898" : "#f4f0ea");
  }
  applyPalette(pal);

  const look = new THREE.Vector3(), V = new THREE.Vector3();
  let theta = 0.6, gspin = 0, sway = 0, lastTurn = Math.floor(theta / Math.PI);
  function layout() { // on every render: a still frame gets no update() call
    const A = camera.aspect || 1, k = A >= 1 ? 0 : Math.min(1, (1 - A) / 0.54), fov = 50 + k * 12;
    if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
    const s = Math.sin(sway) * 0.25;
    camera.position.set(1.2 + k * 2.6 + s, 2.75 + k * 0.25, 9.8 + k * 1.9); // a phone stands a step back, before the crank and the flywheel
    camera.lookAt(look.set(0.6 + k * 3.3 + s * 0.4, 2.1 + k * 0.3, 0));
    camera.updateMatrixWorld();
  }
  scene.onBeforeRender = layout;
  function frame(dt, t) {
    time.value = t;
    sway = t * 0.05;
    const w = 1.9 * (1 + 0.025 * Math.sin(t * 0.31)); // about 18 rpm, the governor holding it
    theta += w * dt;
    const px = CRANK + R * Math.cos(theta), py = AX + R * Math.sin(theta), cx = px - Math.sqrt(L * L - (py - AX) * (py - AX)); // the crank pin; the crosshead pin
    crosshead.position.set(cx, AX, 0);
    const rodStart = -3.05, rodEnd = cx - 0.3; pistonRod.position.x = (rodStart + rodEnd) / 2; pistonRod.scale.x = rodEnd - rodStart;
    rod.position.set(cx, AX, 0); rod.rotation.z = Math.atan2(py - AX, px - cx);
    crank.rotation.z = theta; fly.rotation.z = theta;
    gspin += dt * w * 7.2; gov.rotation.y = gspin;
    const alpha = 0.62 + 0.05 * Math.sin(t * 0.31 - 0.6); // the balls fly out as the engine runs fast
    for (const a of arms) a.rotation.z = a.userData.side * alpha;
    const sy = 0.38 + (1 - Math.cos(alpha)) * 0.6; sleeve.position.y = sy;
    for (const [i, a] of arms.entries()) { const sd = a.userData.side, mx = sd * Math.sin(alpha) * 0.25, my = 1.1 - Math.cos(alpha) * 0.25, ln = links[i]; V.set(sd * 0.06 - mx, sy - my, 0); ln.position.set(mx, my, 0); ln.scale.y = V.length(); ln.rotation.z = Math.atan2(V.x, -V.y); } // the links from the arms down to the sleeve
    for (const g of needles) g.n.rotation.z = -(g.base - 0.5) * 4.7 + 0.03 * Math.sin(t * 7 + g.ph) + 0.02 * Math.sin(t * 2.3 + g.ph * 2);
    setClock();
    const turn = Math.floor(theta / Math.PI); // a stroke ends: steam from the drain cock at that end
    if (turn !== lastTurn) { lastTurn = turn; const front = turn % 2 === 0; emit(front ? -3.45 : -6.75, 1.15, 0.85, 0.95, 2.4); }
    if (r() < dt * 1.4) emit(-5.1 + r(-0.05, 0.05), 3.75, 0.25, 0.4, 1.8); // the stop valve's gland
    if (r() < dt * 0.9) emit(-2.88, AX + 0.06, 0.12, 0.2, 1.4); // and the piston rod's
    for (let i = 0; i < NPUFF; i++) { if (life[i] < 0) continue; life[i] += dt / dur[i]; if (life[i] >= 1) life[i] = -1; aLife.setX(i, life[i]); }
    aLife.needsUpdate = aPuff.needsUpdate = true;
    const f = 0.78 + 0.22 * Math.sin(t * 9.1) * Math.sin(t * 3.7 + 1.3); // the fire breathing
    if (pal.dark) { fire.intensity = 46 * f; for (const [i, l] of lamps.entries()) l.intensity = 38 * (0.96 + 0.04 * Math.sin(t * 5.3 + i * 2)); } else fire.intensity = 8 * f;
    fireMat.color.copy(fireBase).multiplyScalar(0.7 + 0.3 * f);
  }
  frame(0, 0);

  return {
    update: sceneStep(frame),
    setPalette: applyPalette,
    stats() { return { rpm: +((1.9 * 60) / (2 * Math.PI)).toFixed(1), crank: +(theta % (2 * Math.PI)).toFixed(2), crosshead: +crosshead.position.x.toFixed(2), puffs: Array.from(life).filter((v) => v >= 0).length, dust: dustPos.length / 3, shadows: shadowsOn }; }, // for checking by hand
    dispose() { gone = true; scene.fog = null; env?.dispose(); disposables.forEach((x) => x.dispose()); },
  };
}

const BUILDERS = { galaxy, terrain, crystals, earth, neon, island, bloodmoon, ocean, balloons, hearts, jellyfish, ghosts, portal, wisps, saturn, nebula, orbits, meadow, citydrive, neural, frostpeaks, luckycat, campsite, koipond, inkwash, rainwindow, skylanterns, snowglobe, lighthouse, clockwork, sakura, observatory, hotair, reef, northernlights, venice, santorini, paris, steamengine };

/**
 * WebGL background. three.js is loaded on demand (only when one of these styles is active),
 * the loop pauses when the tab is hidden or animation is off, colours follow the theme and
 * accent, and everything is disposed when the style changes or the component unmounts.
 */
export default function ThreeBackground({ style, preview = false, speed = 1, color = null }) {
  const ref = useRef(null);
  const animate = usePrefs((s) => s.bgAnimate);
  const reduce = usePrefs((s) => s.reduceMotion);
  const running = useRef(true);
  useEffect(() => {
    running.current = animate && !reduce;
  }, [animate, reduce]);
  // the admin's look: the scene's clock runs at `speed`; a new `color` repaints the scene without rebuilding it
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  const repaint = useRef(() => {});
  useEffect(() => {
    repaint.current();
  }, [color]);

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
        built = BUILDERS[style](THREE, scene, camera, readPalette(el), preview);
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
      repaint.current = () => built.setPalette(readPalette(el));
      const mo = new MutationObserver(() => built.setPalette(readPalette(el)));
      mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "style"] });
      let last = performance.now();
      let clock = last / 1000; // the scene's own time, at the admin's speed
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
        const step = dt * speedRef.current;
        clock += step;
        try {
          built.update(step, clock);
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
        repaint.current = () => {};
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
