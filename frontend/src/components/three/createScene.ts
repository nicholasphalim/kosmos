import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { RoundedBoxGeometry } from "three/examples/jsm/geometries/RoundedBoxGeometry.js";

export type VarianScene = "astronot" | "tukang";

type Pointer = { x: number; y: number };
type Isi = { update: (t: number, dt: number, pointer: Pointer) => void; jarakKamera: (aspek: number) => number };

const PARTIKEL_VERTEX = /* glsl */ `
  attribute float aSize;
  attribute float aPhase;
  attribute vec3 aColor;
  uniform float uPixel;
  uniform float uTime;
  uniform vec3 uLubang;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = aSize * uPixel * (9.0 / -mv.z);
    vColor = aColor;
    vAlpha = 0.62 + 0.38 * sin(uTime * 0.9 + aPhase);
    // Area bebas partikel (xy, radius) agar debu tidak menutupi karakter.
    if (uLubang.z > 0.0) {
      float jarak = length((mv.xy - uLubang.xy) * vec2(1.0, 0.62));
      vAlpha *= smoothstep(uLubang.z, uLubang.z + 0.28, jarak);
    }
  }
`;

const PARTIKEL_FRAGMENT = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float d = length(gl_PointCoord - 0.5);
    float a = smoothstep(0.5, 0.05, d);
    if (a <= 0.0) discard;
    gl_FragColor = vec4(vColor, a * vAlpha);
  }
`;

function buatPartikel(titik: Array<{ p: THREE.Vector3; ukuran: number; warna: THREE.Color }>) {
  const n = titik.length;
  const posisi = new Float32Array(n * 3);
  const warna = new Float32Array(n * 3);
  const ukuran = new Float32Array(n);
  const fase = new Float32Array(n);
  titik.forEach((t, i) => {
    t.p.toArray(posisi, i * 3);
    warna.set([t.warna.r, t.warna.g, t.warna.b], i * 3);
    ukuran[i] = t.ukuran;
    fase[i] = Math.random() * Math.PI * 2;
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(posisi, 3));
  geo.setAttribute("aColor", new THREE.BufferAttribute(warna, 3));
  geo.setAttribute("aSize", new THREE.BufferAttribute(ukuran, 1));
  geo.setAttribute("aPhase", new THREE.BufferAttribute(fase, 1));
  const mat = new THREE.ShaderMaterial({
    vertexShader: PARTIKEL_VERTEX,
    fragmentShader: PARTIKEL_FRAGMENT,
    uniforms: { uPixel: { value: 1 }, uTime: { value: 0 }, uLubang: { value: new THREE.Vector3() } },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
  });
  return new THREE.Points(geo, mat);
}

function buatBintang(jumlah: number) {
  const putih = new THREE.Color(0.95, 0.93, 1);
  const lilac = new THREE.Color(0.72, 0.62, 1);
  return buatPartikel(
    Array.from({ length: jumlah }, () => ({
      p: new THREE.Vector3((Math.random() - 0.5) * 18, (Math.random() - 0.5) * 11, -2 - Math.random() * 7),
      ukuran: 0.55 + Math.random() ** 3 * 1.7,
      warna: Math.random() > 0.72 ? lilac : putih,
    })),
  );
}

function buatCincin(jumlah: number, dalam: number, luar: number) {
  const a = new THREE.Color(0.86, 0.79, 1);
  const b = new THREE.Color(0.47, 0.34, 0.95);
  return buatPartikel(
    Array.from({ length: jumlah }, () => {
      const u = Math.random();
      const celah = u > 0.58 && u < 0.63 ? 0.66 : u;
      const r = dalam + (luar - dalam) * celah ** 1.25;
      const sudut = Math.random() * Math.PI * 2;
      return {
        p: new THREE.Vector3(Math.cos(sudut) * r, (Math.random() - 0.5) * 0.045, Math.sin(sudut) * r),
        ukuran: 0.5 + Math.random() ** 4 * 1.35,
        warna: a.clone().lerp(b, celah),
      };
    }),
  );
}

function isiAstronot(scene: THREE.Scene, pelengkap: THREE.Points[], tukang: boolean): Isi {
  const fisik = (color: number, roughness = 0.42, clearcoat = 0.55) =>
    new THREE.MeshPhysicalMaterial({ color, roughness, clearcoat, clearcoatRoughness: 0.28 });
  const baju = fisik(0xf6f2ff);
  const aksen = fisik(0x8a6ff0, 0.32, 0.7);
  const gelap = fisik(0x33247a, 0.4, 0.6);
  const ransel = fisik(0xd8cbff, 0.48, 0.4);
  const kaca = new THREE.MeshPhysicalMaterial({
    color: 0x120a30,
    metalness: 0.82,
    roughness: 0.07,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMapIntensity: 2.4,
  });
  const nyala = new THREE.MeshBasicMaterial({ color: 0xe6dcff, toneMapped: false });
  const pipi = new THREE.MeshBasicMaterial({ color: 0xff9fd0, transparent: true, opacity: 0.5, toneMapped: false });

  const mesh = (geo: THREE.BufferGeometry, mat: THREE.Material, x = 0, y = 0, z = 0) => {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    return m;
  };

  const root = new THREE.Group();

  // Kepala: helm bulat besar dengan visor dan wajah kecil.
  const kepala = new THREE.Group();
  kepala.position.y = 1;
  kepala.add(mesh(new THREE.SphereGeometry(0.98, 64, 48), baju));
  const visor = mesh(new THREE.SphereGeometry(0.76, 56, 40), kaca, 0, 0.02, 0.58);
  visor.scale.set(1, 0.78, 0.62);
  kepala.add(visor);

  const bola = new THREE.SphereGeometry(1, 24, 18);
  const mata = [-0.27, 0.27].map((x) => {
    const m = mesh(bola, nyala, x, 0.06, 1.015);
    m.scale.set(0.085, 0.12, 0.03);
    m.rotation.y = x * 0.55;
    kepala.add(m);
    return m;
  });
  [-0.47, 0.47].forEach((x) => {
    const m = mesh(bola, pipi, x, -0.12, 0.925);
    m.scale.set(0.105, 0.06, 0.02);
    m.rotation.y = x * 1.05;
    kepala.add(m);
  });
  const senyum = mesh(new THREE.TorusGeometry(0.115, 0.021, 12, 36, Math.PI), nyala, 0, -0.1, 1.035);
  senyum.rotation.z = Math.PI;
  kepala.add(senyum);

  const tutupTelinga = new THREE.CylinderGeometry(0.22, 0.22, 0.14, 40);
  [-0.97, 0.97].forEach((x) => {
    const m = mesh(tutupTelinga, aksen, x, 0, 0);
    m.rotation.z = Math.PI / 2;
    kepala.add(m);
  });
  const antena = mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.42, 12), gelap, 0.47, 1, 0);
  antena.rotation.z = -0.44;
  const ujung = mesh(new THREE.SphereGeometry(0.09, 24, 18), nyala, 0.57, 1.2, 0);
  if (!tukang) kepala.add(antena, ujung);
  root.add(kepala);

  // Badan.
  root.add(mesh(new THREE.CapsuleGeometry(0.6, 0.42, 14, 36), baju, 0, -0.28, 0));
  const leher = mesh(new THREE.TorusGeometry(0.54, 0.085, 18, 56), aksen, 0, 0.2, 0);
  leher.rotation.x = Math.PI / 2;
  root.add(leher);
  root.add(mesh(new RoundedBoxGeometry(1.16, 1.18, 0.52, 6, 0.16), ransel, 0, -0.16, -0.56));
  root.add(mesh(new RoundedBoxGeometry(0.62, 0.42, 0.14, 5, 0.06), gelap, 0, -0.25, 0.56));
  const tombol = new THREE.SphereGeometry(0.052, 18, 14);
  root.add(mesh(tombol, nyala, -0.16, -0.25, 0.64), mesh(tombol, pipi, 0, -0.25, 0.64), mesh(tombol, aksen, 0.16, -0.25, 0.64));

  // Lengan: pivot di bahu supaya bisa melambai.
  const buatLengan = (sisi: 1 | -1) => {
    const pivot = new THREE.Group();
    pivot.position.set(sisi * 0.58, 0.04, 0.02);
    pivot.add(mesh(new THREE.CapsuleGeometry(0.19, 0.44, 10, 24), baju, 0, -0.36, 0));
    const manset = mesh(new THREE.TorusGeometry(0.18, 0.045, 12, 32), aksen, 0, -0.62, 0);
    manset.rotation.x = Math.PI / 2;
    pivot.add(manset, mesh(new THREE.SphereGeometry(0.235, 28, 20), aksen, 0, -0.8, 0));
    pivot.rotation.z = sisi * 0.48;
    root.add(pivot);
    return pivot;
  };
  const lenganKanan = buatLengan(1);
  const lenganKiri = buatLengan(-1);

  // Kaki.
  const kaki = ([-1, 1] as const).map((sisi) => {
    const pivot = new THREE.Group();
    pivot.position.set(sisi * 0.29, -0.72, 0);
    pivot.add(mesh(new THREE.CapsuleGeometry(0.235, 0.2, 10, 24), baju, 0, -0.2, 0));
    const sepatu = mesh(new THREE.SphereGeometry(0.29, 28, 20), aksen, 0, -0.5, 0.07);
    sepatu.scale.set(1, 0.72, 1.28);
    pivot.add(sepatu);
    root.add(pivot);
    return pivot;
  });

  const wadah = new THREE.Group();
  wadah.position.y = tukang ? -0.2 : -0.34;
  wadah.add(root);

  // Perlengkapan tukang: helm proyek, toolbox berwajah, dan alat yang melayang.
  const logam = new THREE.MeshPhysicalMaterial({ color: 0xe8e3f7, metalness: 0.55, roughness: 0.24, clearcoat: 0.8 });
  const buatKunciPas = () => {
    const g = new THREE.Group();
    g.add(mesh(new RoundedBoxGeometry(0.17, 0.74, 0.09, 4, 0.04), logam));
    const c = mesh(new THREE.TorusGeometry(0.18, 0.075, 14, 30, Math.PI * 1.45), logam, 0, 0.47, 0);
    c.rotation.z = Math.PI * 0.78; // Rahang terbuka menghadap ke atas.
    g.add(c);
    return g;
  };
  const buatPalu = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CapsuleGeometry(0.06, 0.72, 8, 18), aksen));
    g.add(mesh(new RoundedBoxGeometry(0.52, 0.23, 0.23, 5, 0.06), logam, 0, 0.45, 0));
    g.add(mesh(new RoundedBoxGeometry(0.12, 0.27, 0.27, 4, 0.05), gelap, 0.2, 0.45, 0));
    return g;
  };
  const buatObeng = () => {
    const g = new THREE.Group();
    g.add(mesh(new THREE.CapsuleGeometry(0.105, 0.26, 8, 20), aksen, 0, -0.24, 0));
    g.add(mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.56, 12), logam, 0, 0.2, 0));
    g.add(mesh(new THREE.ConeGeometry(0.05, 0.11, 4), logam, 0, 0.52, 0));
    return g;
  };
  const buatMeteran = () => {
    const g = new THREE.Group();
    g.add(mesh(new RoundedBoxGeometry(0.56, 0.52, 0.24, 6, 0.1), aksen));
    const putar = mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.04, 28), nyala, 0, 0, 0.13);
    putar.rotation.x = Math.PI / 2;
    g.add(putar, mesh(new RoundedBoxGeometry(0.42, 0.05, 0.14, 2, 0.02), logam, 0.38, -0.22, 0));
    return g;
  };

  const gantung = new THREE.Group();
  const alatMelayang: Array<{ alat: THREE.Group; x: number; y: number; fase: number; putar: number }> = [];
  if (tukang) {
    const topi = new THREE.Group();
    topi.position.y = 0.36;
    const kubah = mesh(new THREE.SphereGeometry(1, 56, 28, 0, Math.PI * 2, 0, Math.PI * 0.42), aksen);
    kubah.scale.set(0.88, 0.9, 0.88);
    const lingkar = mesh(new THREE.TorusGeometry(0.87, 0.065, 14, 60), ransel, 0, 0.225, 0);
    lingkar.rotation.x = Math.PI / 2;
    const rusuk = mesh(new THREE.TorusGeometry(0.9, 0.075, 12, 40, Math.PI), ransel);
    rusuk.rotation.y = Math.PI / 2;
    const pet = mesh(new THREE.SphereGeometry(1, 32, 16), ransel, 0, 0.21, 0.74);
    pet.scale.set(0.6, 0.06, 0.34);
    const lencana = mesh(bola, nyala, 0, 0.56, 0.72);
    lencana.scale.set(0.11, 0.11, 0.03);
    lencana.rotation.x = -0.65;
    topi.add(kubah, lingkar, rusuk, pet, lencana);
    kepala.add(topi);

    const kotak = new THREE.Group();
    kotak.position.y = -0.62;
    kotak.scale.setScalar(0.86);
    kotak.add(mesh(new RoundedBoxGeometry(1.2, 0.64, 0.62, 5, 0.09), aksen));
    kotak.add(mesh(new RoundedBoxGeometry(1.27, 0.2, 0.68, 4, 0.07), gelap, 0, 0.39, 0));
    kotak.add(mesh(new THREE.TorusGeometry(0.25, 0.042, 12, 30, Math.PI), logam, 0, 0.47, 0));
    [-0.42, 0.42].forEach((x) => kotak.add(mesh(new RoundedBoxGeometry(0.13, 0.17, 0.05, 2, 0.02), logam, x, 0.26, 0.34)));
    [-0.21, 0.21].forEach((x) => {
      const m = mesh(bola, kaca, x, 0.02, 0.315);
      m.scale.set(0.06, 0.085, 0.02);
      kotak.add(m);
    });
    [-0.37, 0.37].forEach((x) => {
      const m = mesh(bola, pipi, x, -0.08, 0.315);
      m.scale.set(0.075, 0.042, 0.012);
      kotak.add(m);
    });
    const mulut = mesh(new THREE.TorusGeometry(0.075, 0.016, 10, 28, Math.PI), kaca, 0, -0.07, 0.32);
    mulut.rotation.z = Math.PI;
    kotak.add(mulut);
    const paluKecil = buatPalu();
    paluKecil.position.set(-0.42, 0.72, 0);
    paluKecil.rotation.z = 0.22;
    paluKecil.scale.setScalar(0.62);
    const obengKecil = buatObeng();
    obengKecil.position.set(0.43, 0.68, 0);
    obengKecil.rotation.z = -0.2;
    obengKecil.scale.setScalar(0.72);
    kotak.add(paluKecil, obengKecil);
    gantung.position.set(0, -0.8, 0.12);
    gantung.add(kotak);
    lenganKiri.add(gantung);

    const pegangan = buatKunciPas();
    pegangan.position.set(0, -0.9, 0.16);
    pegangan.rotation.z = Math.PI * 1.1;
    pegangan.scale.setScalar(0.92);
    lenganKanan.add(pegangan);

    [
      { alat: buatPalu(), x: -2.25, y: 1.25, fase: 0.4, putar: 0.5 },
      { alat: buatObeng(), x: 2.2, y: 1.2, fase: 2.1, putar: -0.65 },
      { alat: buatMeteran(), x: 2.35, y: -0.95, fase: 3.6, putar: 0.2 },
      { alat: buatKunciPas(), x: -2.55, y: -0.65, fase: 5, putar: -0.35 },
    ].forEach((a) => {
      a.alat.position.set(a.x, a.y, -0.25);
      wadah.add(a.alat);
      alatMelayang.push(a);
    });
  }

  const bintang = buatBintang(150);
  const cincin = tukang ? null : buatCincin(4200, 2.2, 3.35);
  const poros = new THREE.Group();
  poros.rotation.set(0.26, 0, -0.28);
  poros.position.y = -0.05;
  if (cincin) {
    poros.add(cincin);
    pelengkap.push(cincin);
  }
  scene.add(bintang, poros, wadah);
  pelengkap.push(bintang);

  return {
    jarakKamera(aspek) {
      if (tukang) return 9.4 * Math.max(1, 1.25 / aspek);
      // Layar sempit: astronot bergeser ke kiri, memberi ruang untuk balon sapaan.
      const geser = aspek > 0.8 && aspek < 1.4 ? -0.85 : 0;
      wadah.position.x = geser;
      poros.position.x = geser;
      if (cincin) (cincin.material as THREE.ShaderMaterial).uniforms.uLubang.value.set(geser, -0.04, 1.28);
      return 11.2 * Math.max(1, 0.8 / aspek);
    },
    update(t, dt, pointer) {
      const k = Math.min(t / 1.15, 1) - 1;
      const masuk = 1 + 2.4 * k ** 3 + 1.4 * k ** 2;
      root.scale.setScalar(Math.max(masuk, 0.001));
      root.position.y = Math.sin(t * 0.9) * 0.12 + (1 - Math.min(t / 1.15, 1)) ** 3 * -1.2;
      root.rotation.z = Math.sin(t * 0.55) * 0.055 + 0.05;
      const lerp = Math.min(dt * 5, 1);
      root.rotation.y += (-0.22 + pointer.x * 0.16 + Math.sin(t * 0.4) * 0.06 - root.rotation.y) * lerp;

      kepala.rotation.y += (pointer.x * 0.38 - kepala.rotation.y) * lerp;
      kepala.rotation.x += (-pointer.y * 0.2 - kepala.rotation.x) * lerp;

      const melambai = t < 3.6 || t % 8 < 2;
      const target = melambai ? 2.52 + Math.sin(t * 9) * 0.28 : 0.48 + Math.sin(t * 0.8) * 0.06;
      lenganKanan.rotation.z += (target - lenganKanan.rotation.z) * Math.min(dt * 8, 1);
      lenganKiri.rotation.z = (tukang ? -0.3 : -0.5) + Math.sin(t * 0.8 + 1.2) * 0.07;
      // Toolbox selalu menggantung tegak walau lengan dan badan bergoyang.
      gantung.rotation.z = -lenganKiri.rotation.z - root.rotation.z;
      alatMelayang.forEach((a) => {
        a.alat.position.y = a.y + Math.sin(t * 0.8 + a.fase) * 0.13;
        a.alat.rotation.z = a.putar + Math.sin(t * 0.6 + a.fase) * 0.22;
        a.alat.rotation.y = Math.sin(t * 0.45 + a.fase) * 0.55;
      });
      kaki[0].rotation.x = Math.sin(t * 0.7) * 0.12;
      kaki[1].rotation.x = -Math.sin(t * 0.7) * 0.12;

      const kedip = t % 3.7 < 0.12 ? 0.012 : 0.12;
      mata.forEach((m) => (m.scale.y = kedip));
      if (cincin) cincin.rotation.y = t * 0.05;
      bintang.position.x = -pointer.x * 0.12;
      bintang.position.y = -pointer.y * 0.08;
    },
  };
}

/** Membuat scene di dalam `host`. Mengembalikan fungsi pembersih, atau null bila WebGL tidak tersedia. */
export function createScene(host: HTMLElement, varian: VarianScene): (() => void) | null {
  let renderer: THREE.WebGLRenderer;
  try {
    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "high-performance" });
  } catch {
    return null;
  }

  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  renderer.setPixelRatio(dpr);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  const canvas = renderer.domElement;
  canvas.style.cssText = "display:block;width:100%;height:100%;opacity:0;transition:opacity 1s cubic-bezier(.16,1,.3,1)";
  host.appendChild(canvas);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(32, 1, 0.1, 60);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const ruang = new RoomEnvironment();
  const env = pmrem.fromScene(ruang, 0.04);
  scene.environment = env.texture;
  scene.environmentIntensity = 0.42;

  const kunci = new THREE.DirectionalLight(0xffffff, 2.5);
  kunci.position.set(-3.5, 4.5, 5);
  const tepi = new THREE.DirectionalLight(0x8a6ff0, 4.2);
  tepi.position.set(4, 1.5, -4);
  const isian = new THREE.DirectionalLight(0xc9b8ff, 0.7);
  isian.position.set(2, -3, 4);
  scene.add(kunci, tepi, isian);

  const partikel: THREE.Points[] = [];
  const isi = isiAstronot(scene, partikel, varian === "tukang");

  const seragam = (p: THREE.Points) => (p.material as THREE.ShaderMaterial).uniforms;
  const hemat = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const pointer: Pointer = { x: 0, y: 0 };
  const targetPointer: Pointer = { x: 0, y: 0 };
  let waktu = hemat ? 2 : 0;
  let terakhir = performance.now();
  let raf = 0;
  let terlihat = true;

  const gambar = (dt: number) => {
    partikel.forEach((p) => (seragam(p).uTime.value = waktu));
    isi.update(waktu, dt, pointer);
    renderer.render(scene, camera);
  };

  const ukur = () => {
    const w = host.clientWidth;
    const h = host.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.position.z = isi.jarakKamera(camera.aspect);
    camera.updateProjectionMatrix();
    partikel.forEach((p) => (seragam(p).uPixel.value = dpr * (h / 520)));
    if (hemat) gambar(1);
  };

  const putar = (now: number) => {
    raf = requestAnimationFrame(putar);
    // Batas longgar: perangkat lambat tetap menyelesaikan animasi masuk tepat waktu.
    // Jeda saat tab tersembunyi tidak terhitung karena `terakhir` direset di sinkron().
    const dt = Math.min((now - terakhir) / 1000, 1);
    terakhir = now;
    waktu += dt;
    pointer.x += (targetPointer.x - pointer.x) * Math.min(dt * 4, 1);
    pointer.y += (targetPointer.y - pointer.y) * Math.min(dt * 4, 1);
    gambar(dt);
  };

  const sinkron = () => {
    cancelAnimationFrame(raf);
    raf = 0;
    if (!hemat && terlihat && !document.hidden) {
      terakhir = performance.now();
      raf = requestAnimationFrame(putar);
    }
  };

  const gerak = (e: PointerEvent) => {
    targetPointer.x = (e.clientX / window.innerWidth) * 2 - 1;
    targetPointer.y = -((e.clientY / window.innerHeight) * 2 - 1);
  };

  const pengamatUkuran = new ResizeObserver(ukur);
  pengamatUkuran.observe(host);
  const pengamatLayar = new IntersectionObserver(([e]) => {
    terlihat = e.isIntersecting;
    sinkron();
  });
  pengamatLayar.observe(host);
  document.addEventListener("visibilitychange", sinkron);
  if (!hemat) window.addEventListener("pointermove", gerak, { passive: true });

  ukur();
  gambar(hemat ? 1 : 0);
  sinkron();
  requestAnimationFrame(() => (canvas.style.opacity = "1"));

  return () => {
    cancelAnimationFrame(raf);
    pengamatUkuran.disconnect();
    pengamatLayar.disconnect();
    document.removeEventListener("visibilitychange", sinkron);
    window.removeEventListener("pointermove", gerak);
    scene.traverse((o) => {
      if (o instanceof THREE.Mesh || o instanceof THREE.Points) {
        o.geometry.dispose();
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
      }
    });
    ruang.dispose();
    env.dispose();
    pmrem.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    canvas.remove();
  };
}
