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
import type { ModelEnvironment } from './stage.types';

/**
 * The Viewer Chunk, and the `dastro-3d/stage` entry point (ADR-0003).
 *
 * The Astro components only ever reach it through a dynamic import, which is
 * what keeps three.js out of the page's main bundle.
 *
 * What is public is the `load`/`start`/`stop`/`dispose` lifecycle. `scene`,
 * `renderer` and `camera` stay private and no escape hatch is added — three.js
 * itself is not public API (ADR-0001).
 */

export type { LoadTrigger, ModelEnvironment } from './stage.types';
export { parseEnvironment, parseLoadTrigger } from './stage.types';

export interface StageOptions {
  /** Lighting preset. Defaults to `studio` when omitted (e.g. a custom background is set). */
  environment?: ModelEnvironment;
  autoRotate: boolean;
  /** When `false`, orbit and zoom are disabled. Default `true`. */
  interactive?: boolean;
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

  private environment: ModelEnvironment;
  private backgroundColor: string | undefined;
  private zoom: number;

  private model: Object3D | null = null;
  /** Bounding radius of the framed Model, so the camera can be re-placed without re-centring it. */
  private radius = 0;
  private frameId: number | null = null;

  constructor(
    private readonly $canvas: HTMLCanvasElement,
    options: StageOptions,
  ) {
    this.environment = options.environment ?? 'studio';
    this.backgroundColor = options.backgroundColor;
    this.zoom = options.zoom ?? FRAMING_MARGIN;

    this.renderer = new WebGLRenderer({
      canvas: $canvas,
      antialias: true,
      powerPreference: 'high-performance',
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = ACESFilmicToneMapping;

    // The irradiance map is the same for all three presets — they differ only
    // in background, exposure and intensity — so changing preset later never
    // has to regenerate it.
    this.pmrem = new PMREMGenerator(this.renderer);
    this.scene.environment = this.pmrem.fromScene(
      new RoomEnvironment(),
      0.04,
    ).texture;

    this.applyEnvironment();

    this.camera = new PerspectiveCamera(45, 1, 0.1, 1000);

    this.controls = new OrbitControls(this.camera, $canvas);
    this.controls.enableDamping = true;
    this.controls.enablePan = false;
    this.controls.enableRotate = options.interactive !== false;
    this.controls.enableZoom = options.interactive !== false;
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
    this.radius = sphere.radius;

    this.positionCamera();
  }

  private positionCamera(): void {
    if (!this.radius) return;

    const fov = MathUtils.degToRad(this.camera.fov);
    const distance = (this.radius / Math.sin(fov / 2)) * this.zoom;

    this.camera.position.set(0, this.radius * 0.25, distance);
    this.camera.near = distance / 100;
    this.camera.far = distance * 100;
    this.camera.updateProjectionMatrix();

    this.controls.target.set(0, 0, 0);
    this.controls.update();
  }

  private applyEnvironment(): void {
    const preset = ENVIRONMENTS[this.environment];

    this.renderer.toneMappingExposure = preset.exposure;
    this.scene.environmentIntensity = preset.intensity;
    this.scene.background = new Color(
      this.backgroundColor ?? preset.background,
    );
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

  /** Ignored for the background while a `backgroundColor` is set. */
  setEnvironment(environment: ModelEnvironment): void {
    this.environment = environment;
    this.applyEnvironment();
  }

  /** Pass `undefined` to restore the current preset's own background. */
  setBackgroundColor(backgroundColor: string | undefined): void {
    this.backgroundColor = backgroundColor;
    this.applyEnvironment();
  }

  /** Re-frames the Model, which discards any orbiting the user has done. */
  setZoom(zoom: number): void {
    this.zoom = zoom;
    this.positionCamera();
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
