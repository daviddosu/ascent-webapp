/** Browser-facing exports for the canonical specialist registry. */
export {
  REASONING_MODEL_ID,
  SPECIALIST_REGISTRY_SCHEMA_VERSION,
  createSpecialistHandoff,
  getSpecialist,
  routeTask,
  routeTaskWithSemanticSpecialist,
  safeSemanticSpecialist,
  specialistCanUseTool,
  specialistIdentity,
  specialistIds,
  specialistRegistry,
  specialistRequiredEffects,
  specialistVersion,
  legacySpecialistRoute,
  nextSpecialistForCapabilityRequest,
  nextSpecialistForTool,
  taskContracts,
  unsupportedRoute,
  type ApplicationBoundary,
  type RequiredEffect,
  type RouteClassification,
  type RouteConfidence,
  type SpecialistHandoff,
  type SpecialistId,
  type SpecialistRegistryEntry,
  type SpecialistRoute,
  type SpecialistStage,
  type SpecialistVersion,
  type LegacySpecialistRoute,
  type TaskContract,
} from '../../supabase/functions/_shared/specialists'

import { routeTask, type SpecialistId, type SpecialistRoute } from '../../supabase/functions/_shared/specialists'

export function specialistRouteForTask(title: string, description = ''): SpecialistRoute {
  return routeTask(title, description)
}

export function specialistForTask(title: string, description = ''): SpecialistId | null {
  return routeTask(title, description).primarySpecialistId
}
