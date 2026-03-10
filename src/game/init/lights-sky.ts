import * as THREE from "three";
import { getShadowMapSize } from "../../graphics-settings";
import { SUN_DISTANCE } from "../../atmosphere";

const RAIN_PARTICLE_COUNT = 3500;
const RAIN_BOX_WIDTH = 40;
const RAIN_BOX_HEIGHT = 20;
const RAIN_BOX_DEPTH = 40;

export interface LightsAndSky {
  sunLight: THREE.DirectionalLight;
  sunMesh: THREE.Mesh;
  moonMesh: THREE.Mesh;
  sky: THREE.Mesh;
  clouds: THREE.Group;
  cloudMaterial: THREE.MeshBasicMaterial;
  stars: THREE.Points;
  rain: THREE.Points;
  ambientLight: THREE.AmbientLight;
  hemiLight: THREE.HemisphereLight;
}

export function initLightsAndSky(
  scene: THREE.Scene,
  shadowRadius: number
): LightsAndSky {
  const ambientLight = new THREE.AmbientLight(0xffffff, 0.25);
  scene.add(ambientLight);
  const hemiLight = new THREE.HemisphereLight(0x87ceeb, 0x665544, 0.6);
  scene.add(hemiLight);

  const sunLight = new THREE.DirectionalLight(0xfffaf0, 1.2);
  sunLight.castShadow = true;
  const shadowSize = getShadowMapSize();
  sunLight.shadow.mapSize.width = shadowSize;
  sunLight.shadow.mapSize.height = shadowSize;
  sunLight.shadow.camera.near = 0.5;
  sunLight.shadow.camera.far = SUN_DISTANCE + 80;
  sunLight.shadow.camera.left = -shadowRadius;
  sunLight.shadow.camera.right = shadowRadius;
  sunLight.shadow.camera.top = shadowRadius;
  sunLight.shadow.camera.bottom = -shadowRadius;
  sunLight.shadow.camera.updateProjectionMatrix();
  sunLight.shadow.bias = -0.0003;
  sunLight.shadow.normalBias = 0.008;
  const initSunDir = new THREE.Vector3(1, 0.3, 0.5).normalize();
  sunLight.position.copy(initSunDir).multiplyScalar(SUN_DISTANCE);
  sunLight.target.position.set(0, 0, 0);
  scene.add(sunLight);
  scene.add(sunLight.target);

  const sunGeometry = new THREE.SphereGeometry(12, 24, 24);
  const sunMaterial = new THREE.MeshBasicMaterial({
    color: 0xfff4c4,
    fog: false,
  });
  const sunMesh = new THREE.Mesh(sunGeometry, sunMaterial);
  sunMesh.castShadow = false;
  sunMesh.receiveShadow = false;
  scene.add(sunMesh);

  const moonGeometry = new THREE.SphereGeometry(8, 16, 16);
  const moonMaterial = new THREE.MeshBasicMaterial({
    color: 0xe6ecff,
    fog: false,
  });
  const moonMesh = new THREE.Mesh(moonGeometry, moonMaterial);
  moonMesh.castShadow = false;
  moonMesh.receiveShadow = false;
  scene.add(moonMesh);

  const skyGeo = new THREE.SphereGeometry(500, 32, 32);
  skyGeo.scale(-1, 1, 1);
  const skyMat = new THREE.ShaderMaterial({
    vertexShader: `
      varying float vHeight;
      void main() {
        vHeight = normalize(position).y * 0.5 + 0.5;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uTopColor;
      uniform vec3 uHorizonColor;
      uniform vec3 uBottomColor;
      uniform float uSunHeight;
      varying float vHeight;
      void main() {
        vec3 color;
        if (vHeight < 0.5) {
          color = mix(uBottomColor, uHorizonColor, vHeight * 2.0);
        } else {
          color = mix(uHorizonColor, uTopColor, (vHeight - 0.5) * 2.0);
        }
        float sunset = smoothstep(-0.45, 0.25, uSunHeight) *
          (1.0 - smoothstep(0.25, 0.65, uSunHeight));
        sunset = min(1.0, sunset * 1.4);
        vec3 sunsetColor = vec3(1.0, 0.35, 0.05);
        float morning = smoothstep(0.08, 0.35, uSunHeight) *
          (1.0 - smoothstep(0.35, 0.75, uSunHeight));
        morning = min(1.0, morning * 1.2);
        vec3 morningColor = vec3(1.0, 0.75, 0.5);
        float horizonBand = 2.0 * min(vHeight, 1.0 - vHeight);
        color = mix(color, sunsetColor, sunset * horizonBand);
        color = mix(color, morningColor, morning * horizonBand);
        float night = clamp(-uSunHeight * 2.0, 0.0, 1.0);
        color = mix(color, vec3(0.01, 0.02, 0.05), night);
        gl_FragColor = vec4(color, 1.0);
      }
    `,
    uniforms: {
      uTopColor: { value: new THREE.Color(0x87ceeb) },
      uHorizonColor: { value: new THREE.Color(0xb8dce8) },
      uBottomColor: { value: new THREE.Color(0xdceef7) },
      uSunHeight: { value: 1.0 },
    },
    depthWrite: false,
    side: THREE.BackSide,
    fog: false,
  });
  const sky = new THREE.Mesh(skyGeo, skyMat);
  sky.castShadow = false;
  sky.receiveShadow = false;
  scene.add(sky);

  const clouds = new THREE.Group();
  const cloudMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.9,
    depthWrite: false,
  });
  const cloudHeight = 120;
  const cloudArea = 300;
  for (let i = 0; i < 40; i++) {
    const cloud = new THREE.Group();
    const blocks = 4 + Math.floor(Math.random() * 6);
    for (let j = 0; j < blocks; j++) {
      const box = new THREE.Mesh(
        new THREE.BoxGeometry(4, 1, 4),
        cloudMaterial
      );
      box.castShadow = false;
      box.receiveShadow = false;
      box.position.set(
        (Math.random() - 0.5) * 12,
        0,
        (Math.random() - 0.5) * 12
      );
      cloud.add(box);
    }
    cloud.position.set(
      (Math.random() - 0.5) * cloudArea,
      cloudHeight,
      (Math.random() - 0.5) * cloudArea
    );
    clouds.add(cloud);
  }
  scene.add(clouds);

  const starGeometry = new THREE.BufferGeometry();
  const starCount = 2000;
  const starPositions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 450;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.random() * Math.PI;
    starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPositions[i * 3 + 1] = r * Math.cos(phi);
    starPositions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  starGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(starPositions, 3)
  );
  const starMaterial = new THREE.PointsMaterial({
    color: 0xffffff,
    size: 1,
    sizeAttenuation: false,
    transparent: true,
  });
  const stars = new THREE.Points(starGeometry, starMaterial);
  stars.castShadow = false;
  stars.receiveShadow = false;
  scene.add(stars);

  const rainPositions = new Float32Array(RAIN_PARTICLE_COUNT * 3);
  for (let i = 0; i < RAIN_PARTICLE_COUNT; i++) {
    rainPositions[i * 3] = (Math.random() - 0.5) * RAIN_BOX_WIDTH;
    rainPositions[i * 3 + 1] = Math.random() * RAIN_BOX_HEIGHT;
    rainPositions[i * 3 + 2] = (Math.random() - 0.5) * RAIN_BOX_DEPTH;
  }
  const rainGeometry = new THREE.BufferGeometry();
  rainGeometry.setAttribute(
    "position",
    new THREE.BufferAttribute(rainPositions, 3)
  );
  const rainMaterial = new THREE.PointsMaterial({
    color: 0xccccdd,
    size: 0.15,
    transparent: true,
    opacity: 0.7,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const rain = new THREE.Points(rainGeometry, rainMaterial);
  rain.castShadow = false;
  rain.receiveShadow = false;
  rain.visible = false;
  scene.add(rain);

  return {
    sunLight,
    sunMesh,
    moonMesh,
    sky,
    clouds,
    cloudMaterial,
    stars,
    rain,
    ambientLight,
    hemiLight,
  };
}
