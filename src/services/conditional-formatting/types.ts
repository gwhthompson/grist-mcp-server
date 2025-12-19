/**
 * Shared types for conditional formatting service
 */

import type { ConditionalFormatOptions } from '../../schemas/conditional-rules.js'

/**
 * Rule scope type - determines where formatting is stored and applied
 */
export type RuleScope = 'row' | 'column' | 'field'

/**
 * Configuration for a rule owner (strategy pattern)
 */
export interface RuleOwnerConfig {
  /** Metadata table storing the owner record */
  metadataTable: '_grist_Tables_column' | '_grist_Views_section' | '_grist_Views_section_field'

  /** Property name for rules list on the owner record */
  rulesProperty: 'rules'

  /** Property name for style options storage */
  styleProperty: 'widgetOptions' | 'options'

  /** Whether styles are nested in widgetOptions.rulesOptions or options.rulesOptions */
  stylesInWidgetOptions: boolean

  /** Helper column prefix for this scope */
  helperColumnPrefix: 'gristHelper_ConditionalRule' | 'gristHelper_RowConditionalRule'

  /** Human-readable scope name for error messages */
  scopeName: 'row' | 'column' | 'field'
}

/**
 * Parameters for looking up rule owner reference
 */
export interface OwnerLookupParams {
  tableId: string
  // For column scope
  colId?: string
  // For row/field scope - widget identification
  sectionId?: number
  // For field scope
  fieldColId?: string
}

/**
 * Context for rule operations
 */
export interface RuleContext {
  docId: string
  tableId: string
  ownerRef: number // colRef, sectionRef, or fieldRef
  tableRef?: number // For operations needing table reference
}

/**
 * Result of getRulesAndStyles operation
 */
export interface RulesAndStyles {
  /** Array of helper column references (from rules RefList) */
  helperColRefs: readonly number[]
  /** Array of style options (parallel to helperColRefs) */
  styles: Array<Record<string, unknown>>
}

/**
 * Updates to apply to owner's rules and styles
 */
export interface RulesAndStylesUpdate {
  /** Updated array of helper column references */
  helperColRefs: readonly number[]
  /** Updated array of style options */
  styles: Array<Record<string, unknown>>
}

/**
 * Display representation of a conditional rule
 */
export interface ConditionalRuleDisplay {
  index: number
  formula: string
  style: ConditionalFormatOptions
}

/**
 * Result from add/update/list operations
 */
export interface RuleOperationResult {
  rules: ConditionalRuleDisplay[]
  totalRules: number
  scope: RuleScope
  target: {
    tableId: string
    colId?: string
    sectionId?: number
    fieldId?: number
  }
}

/**
 * Result from remove operation
 */
export interface RuleRemoveResult {
  message: string
  remainingRules: number
}
