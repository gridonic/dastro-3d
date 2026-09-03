import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  MathUtils,
  PMREMGenerator,
  PerspectiveCamera,
  Scene,
  Sphere,
  WebGLRenderer,
  type Object3D,
} from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js';
import type { ModelEnvironment } from '../components/component.types';

/**
 * The Viewer Chunk.
 *
 * This module is only ever reached through a dynamic import, which is what
 * keeps three.js out of the page's main bundle. Nothing here is exported from
 * the package — three.js is not public API (ADR-0001).
 */

interface StageOptions {
  /** Lighting preset. Defaults to `studio` when omitted (e.g. a custom background is set). */
  environment?: ModelEnvironment;
  autoRotate: boolean;
  /** Replaces the environment preset's background when set. */
  backgroundColor?: string;
  zoom?: number;
}

/**
 * Lighting presets are generated in code via `RoomEnvironment`. They must never
 * depend on an HDRI file: a sealed package cannot install assets into the
 * consuming project's `public/`, the same constraint that rules out Draco
 * (ADR-0002).
 */
const ENVIRONMENTS: Record<
  ModelEnvironment,
  { background: number; exposure: number; intensity: number }
> = {
  studio: { background: 0xf2f2f2, exposure: 1.0, intensity: 1.0 },
  neutral: { background: 0xffffff, exposure: 0.9, intensity: 0.8 },
  dark: { background: 0x1a1a1a, exposure: 1.2, intensity: 0.6 },
};

const AUTO_ROTATE_SPEED = 0.75;
/** Leaves a little air around the model once framed. */
const FRAMING_MARGIN = 1.25;

export class ModelStage {
  private readonly scene = new Scene();
  private readonly renderer: WebGLRenderer;
  private readonly camera: PerspectiveCamera;
  private readonly controls: OrbitControls;
  private readonly pmrem: PMREMGenerator;
  private readonly resizeObserver: ResizeObserver;
  private readonly zoom: number;

  private model: Object3D | null = null;
  private frameId: number | null = null;

  constructor(
    private readonly $canvas: HTMLCanvasElement,
    options: StageOptions,
  ) {
    const preset = ENVIRONMENTS[options.environment ?? 'studio'];
    this.zoom = options.zoom ?? FRAMING_MARGIN;

    this.renderer = new WebGLRenderer({
      canvas: $canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = preset.exposure;

    this.scene.background = options.backgroundColor
      ? new Color(options.backgroundColor)
      : new Color(preset.background);
    this.scene.environmentIntensity = preset.intensity;

    this.pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;

    this.camera = new PerspectiveCamera(45, 1, 0.1, 1000);

    this.controls = new OrbitControls(this.camera, $canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.autoRotate = options.autoRotate;
    this.controls.autoRotateSpeed = AUTO_ROTATE_SPEED;

    this.controls.addEventListener('start', () => {
      $canvas.classList.add('-dragging');
    });
    this.controls.addEventListener('end', () => {
      $canvas.classList.remove('-dragging');
    });

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe($canvas);
    this.resize();
  }

  async load(url: string): Promise<void> {
    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    const gltf = await loader.loadAsync(url);

    this.model = gltf.scene;
    this.scene.add(this.model);
    this.frameModel(this.model);
  }

  /** Centres the model at the origin and pulls the camera back to fit it. */
  private frameModel($model: Object3D): void {
    const box = new Box3().setFromObject($model);
    const sphere = box.getBoundingSphere(new Sphere());

    $model.position.sub(sphere.center);

    const fov = MathUtils.degToRad(this.camera.fov);
    const distance = (sphere.radius / Math.sin(fov / 2)) * this.zoom;

    this.camera.position.set(0, sphere.radius * 0.25, distance);
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();

    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private resize(): void {
    const { clientWidth, clientHeight } = this.$canvas;
    if (!clientWidth || !clientHeight) return;

    this.renderer.setSize(clientWidth, clientHeight, false);
    this.camera.aspect = clientWidth / clientHeight;
    this.camera.updateProjectionMatrix();
  }

  start(): void {
    if (this.frameId !== null) return;

    const tick = () => {
      this.controls.update();
      this.renderer.render(this.scene, this.camera);
      this.frameId = requestAnimationFrame(tick);
    };

    this.frameId = requestAnimationFrame(tick);
  }

  /** Called whenever the viewer leaves the viewport — an idle RAF loop still burns battery. */
  stop(): void {
    if (this.frameId === null) return;

    cancelAnimationFrame(this.frameId);
    this.frameId = null;
  }

  setAutoRotate(autoRotate: boolean): void {
    this.controls.autoRotate = autoRotate;
  }

  dispose(): void {
    this.stop();
    this.resizeObserver.disconnect();
    this.controls.dispose();

    this.model?.traverse((object) => {
      const mesh = object as Partial<{
        geometry: { dispose(): void };
        material: { dispose(): void } | { dispose(): void }[];
      }>;

      mesh.geometry?.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : mesh.material
          ? [mesh.material]
          : [];
      materials.forEach((material) => material.dispose());
    });

    this.scene.environment?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
  }
}
