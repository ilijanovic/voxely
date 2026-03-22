import type { PipelineOverrideHook } from './pipeline-types'

/**
 * Default pipeline override hook used by the chunk generator.
 * Currently a no-op, but kept as a single import point so debug tooling can override
 * stages without changing the generator signature.
 */
export const override: PipelineOverrideHook = () => {
  // Intentionally empty.
}

