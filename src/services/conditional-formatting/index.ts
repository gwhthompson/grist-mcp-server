/**
 * Conditional Formatting Service Module
 *
 * Exports the service and all supporting classes for conditional formatting
 * across row, column, and field scopes.
 */

export { ConditionalFormattingService, createRuleOwner } from './service.js'
export { RuleOwner } from './rule-owner.js'
export { ColumnRuleOwner } from './column-rule-owner.js'
export { RowRuleOwner } from './row-rule-owner.js'
export { FieldRuleOwner } from './field-rule-owner.js'
export type {
  RuleScope,
  RuleOwnerConfig,
  OwnerLookupParams,
  RuleContext,
  RulesAndStyles,
  RulesAndStylesUpdate,
  ConditionalRuleDisplay,
  RuleOperationResult,
  RuleRemoveResult
} from './types.js'
