/**
 * Conditional Formatting Service Module
 *
 * Exports the service and all supporting classes for conditional formatting
 * across row, column, and field scopes.
 */

export { ColumnRuleOwner } from './column-rule-owner.js'
export { FieldRuleOwner } from './field-rule-owner.js'
export { RowRuleOwner } from './row-rule-owner.js'
export { RuleOwner } from './rule-owner.js'
export { ConditionalFormattingService, createRuleOwner } from './service.js'
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
} from './types.js'
