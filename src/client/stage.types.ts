/**
 * The vocabulary the Stage and its callers share, with no import of anything.
 *
 * These live here rather than in `component.types.ts` because that file imports
 * `AstroBuiltinAttributes` from `astro`. The package has no build step, so the
 * `./stage` entry point ships raw `.ts` and a consumer typechecks this graph
 * itself — a non-Astro consumer (the DatoCMS preview plugin, ADR-0003) would
 * have to install `astro` just to satisfy a type it never uses. Keep this file
 * import-free.
 */

/** When three.js and the Model are fetched. */
export type LoadTrigger = 'approach' | 'click';

/** Lighting preset. Named environments are built in code, not fetched. */
export type ModelEnvironment = 'studio' | 'neutral' | 'dark';

const LOAD_TRIGGERS: readonly LoadTrigger[] = ['approach', 'click'];
const ENVIRONMENTS: readonly ModelEnvironment[] = ['studio', 'neutral', 'dark'];

/**
 * Dato select fields arrive stega-encoded in draft mode, so the raw value never
 * matches a union member directly. Callers must strip stega before narrowing.
 */
export function parseLoadTrigger(
  value: string | null | undefined,
): LoadTrigger {
  return LOAD_TRIGGERS.includes(value as LoadTrigger)
    ? (value as LoadTrigger)
    : 'approach';
}

export function parseEnvironment(
  value: string | null | undefined,
): ModelEnvironment {
  return ENVIRONMENTS.includes(value as ModelEnvironment)
    ? (value as ModelEnvironment)
    : 'studio';
}
