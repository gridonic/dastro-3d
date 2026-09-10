import type { AstroBuiltinAttributes } from 'astro';

export type ClassValue = AstroBuiltinAttributes['class:list'];

export interface RgbaColorValue {
  red: number;
  green: number;
  blue: number;
  alpha?: number | null;
}

export interface BackgroundColorValue {
  hex?: string | null;
  rgba?: RgbaColorValue | string | null;
}

/**
 * The Viewer Contract.
 *
 * Mirrors the `model_3d` block in DatoCMS by hand — nothing links the two at
 * compile time, exactly as dastro's `VideoPlayerData` mirrors its fragment.
 * The project owns the GraphQL fragment; this file owns the shape it must match.
 *
 * @see CONTEXT.md — "The Viewer Contract (v1)"
 */
export interface ModelViewerData {
  __typename?: 'Model3dRecord';
  /** Click-to-load button label. Carries stega — render as text, do not strip. */
  viewLabel?: string | null;
  model: {
    __typename?: 'FileField';
    url: string;
    size?: number | null;
    mimeType?: string | null;
  };
  poster?: ModelPosterData | null;
  /** DatoCMS select field. Carries stega — narrow with `parseLoadTrigger`. */
  loadTrigger?: string | null;
  /** DatoCMS select field. Carries stega — narrow with `parseEnvironment`. */
  environment?: string | null;
  /** Canvas background. Replaces `environment` when set. */
  backgroundColor?: string | BackgroundColorValue | null;
  /** Initial camera distance multiplier after auto-framing. */
  zoom?: number | null;
  autoRotate?: boolean | null;
  /** When `false`, orbit and zoom are disabled. Default `true`. */
  isInteractive?: boolean | null;
}

/**
 * Structurally compatible with dastro's `ImageAssetData`, which dastro does not
 * export. Kept loose enough to hand straight to dastro's `<ImageAsset>`.
 *
 * Mirrors the boilerplate's `...ResponsiveImage` fragment. `alt` belongs on
 * `responsiveImage`, not on the file field — that is where `@datocms/astro`
 * reads it from, and the Poster is the no-WebGL fallback, so it must carry one.
 */
export interface ModelPosterData {
  __typename?: 'FileField';
  responsiveImage?: {
    __typename?: 'ResponsiveImage';
    src: string;
    width: number;
    height: number;
    alt?: string | null;
    title?: string | null;
    /** Blur-up placeholder, shown while the Poster image itself loads. */
    base64?: string | null;
    bgColor?: string | null;
    sizes?: string | null;
  } | null;
}

/**
 * Re-exported so the components keep a single types facade. The definitions
 * live in `client/stage.types.ts`, which imports nothing — see the note there.
 */
export type { LoadTrigger, ModelEnvironment } from '../client/stage.types';
export { parseEnvironment, parseLoadTrigger } from '../client/stage.types';
