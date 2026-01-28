/**
 * Conditional Formatting Service Module
 *
 * Single-file module for conditional formatting across row, column, and field scopes.
 */

export type {
  ConditionalRuleDisplay,
  OwnerLookupParams,
  RuleContext,
  RuleOperationResult,
  RuleOwnerConfig,
  RuleRemoveResult,
  RuleScope,
  RulesAndStyles,
  RulesAndStylesUpdate
} from './service.js'
export { ConditionalFormattingService, createRuleOwner, RuleOwner } from './service.js'
