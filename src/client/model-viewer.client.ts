import { BaseComponent, log } from 'dastro/client';
import {
  parseEnvironment,
  parseLoadTrigger,
} from '../components/component.types';
import type { ModelStage } from './stage.client';

/** How early an `approach` viewer starts loading, ahead of entering the viewport. */
const APPROACH_ROOT_MARGIN = '200px';

function parseOptionalZoom(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;

  const zoom = Number.parseFloat(value);
  return Number.isFinite(zoom) ? zoom : undefined;
}

/**
 * Owns *when* the Model loads, never *how* it renders.
 *
 * Everything three.js lives behind the dynamic `import('./stage.client')` below.
 * Keep it that way: a static import here would pull three.js into the page's
 * main bundle and defeat the Viewer Chunk entirely.
 */
export class ModelViewer extends BaseComponent {
  private stage: ModelStage | null = null;
  private loading = false;

  init(): void {
    if (!this.supportsWebGl()) {
      // The Poster is already rendered and is the fallback. Nothing to do.
      log.debug('ModelViewer: no WebGL support, keeping poster');
      return;
    }

    const trigger = parseLoadTrigger(this.$el.dataset.loadTrigger);

    if (trigger === 'click') {
      this.$el
        .querySelector('.button')
        ?.addEventListener('click', () => void this.load(), { once: true });
      return;
    }

    this.observeApproach();
  }

  private observeApproach(): void {
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;

        observer.disconnect();
        void this.load();
      },
      { rootMargin: APPROACH_ROOT_MARGIN },
    );

    observer.observe(this.$el);
  }

  private async load(): Promise<void> {
    if (this.loading || this.stage) return;
    this.loading = true;

    const url = this.$el.dataset.modelUrl;
    const $canvas = this.$el.querySelector('canvas');

    if (!url || !($canvas instanceof HTMLCanvasElement)) {
      log.debug('ModelViewer: missing model url or canvas');
      return;
    }

    this.$el.classList.add('-loading');

    try {
      const { ModelStage } = await import('./stage.client');

      const backgroundColor = this.$el.dataset.backgroundColor;

      const stage = new ModelStage($canvas, {
        environment: backgroundColor
          ? undefined
          : parseEnvironment(this.$el.dataset.environment),
        autoRotate:
          this.$el.dataset.autoRotate === 'true' &&
          !this.prefersReducedMotion(),
        backgroundColor,
        zoom: parseOptionalZoom(this.$el.dataset.zoom),
      });

      await stage.load(url);
      stage.start();

      this.stage = stage;
      this.$el.classList.remove('-loading');
      this.$el.classList.add('-ready');

      this.pauseWhenOffscreen(stage);
      this.followReducedMotion(stage);
    } catch (error) {
      // Leave the Poster in place — a failed model should not blank the page.
      this.$el.classList.remove('-loading');
      log.debug(`ModelViewer: failed to load ${url}`, error);
    } finally {
      this.loading = false;
    }
  }

  /** An off-screen RAF loop renders frames nobody sees and drains battery. */
  private pauseWhenOffscreen(stage: ModelStage): void {
    new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        stage.start();
      } else {
        stage.stop();
      }
    }).observe(this.$el);
  }

  private followReducedMotion(stage: ModelStage): void {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');

    query.addEventListener('change', () => {
      stage.setAutoRotate(
        this.$el.dataset.autoRotate === 'true' && !query.matches,
      );
    });
  }

  private prefersReducedMotion(): boolean {
    return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  private supportsWebGl(): boolean {
    try {
      return !!document.createElement('canvas').getContext('webgl2');
    } catch {
      return false;
    }
  }
}
