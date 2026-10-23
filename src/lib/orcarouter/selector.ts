/**
 * Pure option-building for the OrcaRouter model control, so the exact list
 * handed to the selector can be asserted in tests.
 */

import type { PublicOrcaModel } from "@/lib/orcarouter/catalog";

export interface OrcaModelOptionsInput {
  catalog: PublicOrcaModel[];
  /** True when the pending message uploads images. */
  requiresImageInput: boolean;
}

export function buildOrcaModelOptions({ catalog, requiresImageInput }: OrcaModelOptionsInput): PublicOrcaModel[] {
  if (!requiresImageInput) return catalog;
  // Fail closed: only models whose catalog metadata declares image input.
  return catalog.filter((model) => model.inputModalities.includes("image"));
}

/** A restored or previously selected model must still be in the options. */
export function isCompatibleSelection(modelId: string, options: PublicOrcaModel[]): boolean {
  return options.some((model) => model.id === modelId);
}
