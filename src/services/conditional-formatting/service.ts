/**
 * Conditional Formatting Service
 *
 * Manages conditional formatting rules across row, column, and field scopes.
 * Uses scope configuration instead of inheritance for scope-specific behavior.
 *
 * Architecture:
 * - SCOPE_CONFIG: static configuration per scope (metadata table, style property, etc.)
 * - RuleOwner: concrete class that uses scope config + switch for scope-specific queries
 * - ConditionalFormattingService: orchestrates CRUD operations using RuleOwner
 */

import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import type { ConditionalFormatOptions } from '../../schemas/conditional-rules.js'
import type { ApplyResponse, SQLQueryResponse } from '../../types.js'
import { first } from '../../utils/array-helpers.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import { validateRetValues } from '../../validators/apply-response.js'
import type { GristClient } from '../grist-client.js'
import {
  encodeGristList,
  parseGristJson,
  parseGristList,
  parseStyleOptions,
  validatePythonFormula
} from '../rule-utilities.js'

// =============================================================================
// Types
// =============================================================================

/** Rule scope type - determines where formatting is stored and applied */
export type RuleScope = 'row' | 'column' | 'field'

/** Configuration for a rule owner scope */
export interface RuleOwnerConfig {
  metadataTable: '_grist_Tables_column' | '_grist_Views_section' | '_grist_Views_section_field'
  rulesProperty: 'rules'
  styleProperty: 'widgetOptions' | 'options'
  stylesInWidgetOptions: boolean
  helperColumnPrefix: 'gristHelper_ConditionalRule' | 'gristHelper_RowConditionalRule'
  scopeName: 'row' | 'column' | 'field'
}

/** Parameters for looking up rule owner reference */
export interface OwnerLookupParams {
  tableId: string
  colId?: string
  sectionId?: number
  fieldColId?: string
}

/** Context for rule operations */
export interface RuleContext {
  docId: string
  tableId: string
  ownerRef: number
  tableRef?: number
}

/** Current rules and styles state */
export interface RulesAndStyles {
  helperColRefs: readonly number[]
  styles: Array<Record<string, unknown>>
}

/** Updates to apply to owner's rules and styles */
export interface RulesAndStylesUpdate {
  helperColRefs: readonly number[]
  styles: Array<Record<string, unknown>>
}

/** Display representation of a conditional rule */
export interface ConditionalRuleDisplay {
  index: number
  formula: string
  style: ConditionalFormatOptions
}

/** Result from add/update/list operations */
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

/** Result from remove operation */
export interface RuleRemoveResult {
  message: string
  remainingRules: number
}

// =============================================================================
// Scope Configuration
// =============================================================================

const SCOPE_CONFIG: Record<RuleScope, RuleOwnerConfig> = {
  column: {
    metadataTable: '_grist_Tables_column',
    rulesProperty: 'rules',
    styleProperty: 'widgetOptions',
    stylesInWidgetOptions: true,
    helperColumnPrefix: 'gristHelper_ConditionalRule',
    scopeName: 'column'
  },
  field: {
    metadataTable: '_grist_Views_section_field',
    rulesProperty: 'rules',
    styleProperty: 'widgetOptions',
    stylesInWidgetOptions: true,
    helperColumnPrefix: 'gristHelper_ConditionalRule',
    scopeName: 'field'
  },
  row: {
    metadataTable: '_grist_Views_section',
    rulesProperty: 'rules',
    styleProperty: 'options',
    stylesInWidgetOptions: false,
    helperColumnPrefix: 'gristHelper_RowConditionalRule',
    scopeName: 'row'
  }
} as const

// =============================================================================
// Polling Configuration
// =============================================================================

const POLLING_MAX_ATTEMPTS = 20
const POLLING_FAST_THRESHOLD = 5
const POLLING_MEDIUM_THRESHOLD = 10
const POLLING_DELAY_FAST_MS = 10
const POLLING_DELAY_MEDIUM_MS = 50
const POLLING_DELAY_SLOW_MS = 100

function pollingDelay(attempt: number): number {
  if (attempt < POLLING_FAST_THRESHOLD) return POLLING_DELAY_FAST_MS
  if (attempt < POLLING_MEDIUM_THRESHOLD) return POLLING_DELAY_MEDIUM_MS
  return POLLING_DELAY_SLOW_MS
}

// =============================================================================
// RuleOwner - Concrete class with scope-based behavior
// =============================================================================

/**
 * RuleOwner handles scope-specific behavior for conditional formatting.
 * Uses scope configuration and switch statements instead of inheritance.
 */
export class RuleOwner {
  readonly config: RuleOwnerConfig

  constructor(readonly scope: RuleScope) {
    this.config = SCOPE_CONFIG[scope]
  }

  /**
   * Get AddEmptyRule action parameters for this scope.
   * Returns [fieldRef, colRef] tuple.
   */
  getAddEmptyRuleParams(context: RuleContext): [number, number] {
    switch (this.scope) {
      case 'column':
        return [0, context.ownerRef]
      case 'field':
        return [context.ownerRef, 0]
      case 'row':
        return [0, 0]
    }
  }

  /**
   * Get the owner's reference ID (colRef, sectionRef, or fieldRef).
   */
  async getOwnerRef(
    client: GristClient,
    docId: string,
    params: OwnerLookupParams
  ): Promise<number> {
    switch (this.scope) {
      case 'column':
        return await this.getColumnOwnerRef(client, docId, params)
      case 'field':
        return await this.getFieldOwnerRef(client, docId, params)
      case 'row':
        return await this.getRowOwnerRef(client, docId, params)
    }
  }

  /**
   * Get current rules and styles from the owner record.
   */
  async getRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number
  ): Promise<RulesAndStyles> {
    const { metadataTable, styleProperty } = this.config

    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT rules, ${styleProperty} FROM ${metadataTable} WHERE id = ?`,
      args: [ownerRef]
    })

    if (response.records.length === 0) {
      return { helperColRefs: [], styles: [] }
    }

    const fields = extractFields(first(response.records, `${metadataTable} rules query`))
    const helperColRefs = parseGristList(fields.rules)
    const options = parseGristJson<{ rulesOptions?: Array<Record<string, unknown>> }>(
      fields[styleProperty],
      {}
    )
    const styles = options.rulesOptions ?? []

    return { helperColRefs, styles }
  }

  /**
   * Update the owner's rules and styles.
   */
  async updateRulesAndStyles(
    client: GristClient,
    docId: string,
    ownerRef: number,
    update: RulesAndStylesUpdate
  ): Promise<void> {
    const { metadataTable, styleProperty, scopeName } = this.config

    // Get current options to preserve other settings
    const fullOptionsResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT ${styleProperty} FROM ${metadataTable} WHERE id = ?`,
      args: [ownerRef]
    })

    const currentOptions =
      fullOptionsResp.records.length > 0
        ? parseGristJson<Record<string, unknown>>(
            extractFields(first(fullOptionsResp.records, `${scopeName} options query`))[
              styleProperty
            ],
            {}
          )
        : {}

    const updatedOptions = {
      ...currentOptions,
      rulesOptions: update.styles
    }

    const response = await client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [
        [
          'UpdateRecord',
          metadataTable,
          ownerRef,
          {
            rules: encodeGristList(update.helperColRefs),
            [styleProperty]: JSON.stringify(updatedOptions)
          }
        ]
      ],
      {
        schema: ApplyResponseSchema,
        context: `Updating ${scopeName} conditional rules`
      }
    )

    validateRetValues(response, { context: `Updating ${scopeName} conditional rules` })
  }

  /**
   * Predict the next helper column name using Grist's naming logic.
   * Mirrors `_maybe_add_suffix` from sandbox/grist/identifiers.py.
   */
  async predictNextHelperColId(
    client: GristClient,
    docId: string,
    tableId: string
  ): Promise<string> {
    const baseName = this.config.helperColumnPrefix

    const response = await client.post<{
      records: Array<{ id: number; fields?: { colId?: string }; colId?: string }>
    }>(`/docs/${docId}/sql`, {
      sql: `SELECT c.colId
            FROM _grist_Tables_column c
            JOIN _grist_Tables t ON c.parentId = t.id
            WHERE t.tableId = ?
            AND c.colId LIKE ?`,
      args: [tableId, `${baseName}%`]
    })

    const existingNames = new Set(
      response.records.map((r) => {
        const colId = r.fields?.colId ?? r.colId
        return typeof colId === 'string' ? colId.toUpperCase() : ''
      })
    )

    if (!existingNames.has(baseName.toUpperCase())) {
      return baseName
    }

    let num = 2
    while (existingNames.has(`${baseName}${num}`.toUpperCase())) {
      num++
    }
    return `${baseName}${num}`
  }

  /**
   * Get formulas from helper columns with polling for async creation.
   */
  async getHelperColumnFormulas(
    client: GristClient,
    docId: string,
    helperColRefs: readonly number[]
  ): Promise<string[]> {
    if (helperColRefs.length === 0) {
      return []
    }

    let response: {
      records: Array<{ id: number; fields?: { formula?: string | null }; formula?: string | null }>
    }

    for (let attempt = 0; attempt < POLLING_MAX_ATTEMPTS; attempt++) {
      response = await client.get<{
        records: Array<{
          id: number
          fields?: { formula?: string | null }
          formula?: string | null
        }>
      }>(`/docs/${docId}/tables/_grist_Tables_column/records`, {
        params: { _: Date.now().toString() }
      })

      const foundWithFormulas = helperColRefs.filter((colRef) => {
        const rec = response.records.find((r) => r.id === colRef)
        const formula = rec?.fields?.formula ?? rec?.formula
        return formula !== null && formula !== undefined && formula !== ''
      }).length

      if (foundWithFormulas === helperColRefs.length) {
        break
      }

      await new Promise((resolve) => setTimeout(resolve, pollingDelay(attempt)))
    }

    return helperColRefs.map((colRef) => {
      const rec = response?.records.find((r) => r.id === colRef)
      const formula = rec?.fields?.formula ?? rec?.formula
      return formula ?? ''
    })
  }

  // ---------------------------------------------------------------------------
  // Scope-specific owner reference lookups
  // ---------------------------------------------------------------------------

  private async getColumnOwnerRef(
    client: GristClient,
    docId: string,
    params: OwnerLookupParams
  ): Promise<number> {
    if (!params.colId) {
      throw new Error('colId is required for column scope')
    }

    const response = await client.get<{
      columns: Array<{ id: string; fields: { colRef: number } }>
    }>(`/docs/${docId}/tables/${params.tableId}/columns`)

    const column = response.columns.find((c) => c.id === params.colId)
    if (!column) {
      throw new Error(
        `Column "${params.colId}" not found in table "${params.tableId}". ` +
          `Verify colId is correct. Use grist_get_tables with detail_level="full_schema" to list columns.`
      )
    }

    return column.fields.colRef
  }

  private async getFieldOwnerRef(
    client: GristClient,
    docId: string,
    params: OwnerLookupParams
  ): Promise<number> {
    if (!params.sectionId) {
      throw new Error('sectionId is required for field scope')
    }
    if (!params.fieldColId) {
      throw new Error('colId (fieldColId) is required for field scope')
    }

    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT f.id as fieldId
            FROM _grist_Views_section_field f
            JOIN _grist_Tables_column c ON f.colRef = c.id
            WHERE f.parentId = ? AND c.colId = ?`,
      args: [params.sectionId, params.fieldColId]
    })

    if (response.records.length === 0) {
      const availableFieldsResp = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
        sql: `SELECT c.colId
              FROM _grist_Views_section_field f
              JOIN _grist_Tables_column c ON f.colRef = c.id
              WHERE f.parentId = ?
              ORDER BY c.colId`,
        args: [params.sectionId]
      })

      const availableFields = availableFieldsResp.records
        .map((r) => extractFields(r).colId)
        .filter((id) => typeof id === 'string')
        .join(', ')

      throw new Error(
        `Field "${params.fieldColId}" not found in widget (sectionId=${params.sectionId}). ` +
          `Available fields: ${availableFields || 'none'}. ` +
          `Column names are case-sensitive. ` +
          `Use grist_get_pages to find widget details.`
      )
    }

    const fields = extractFields(first(response.records, `Field "${params.fieldColId}"`))
    const fieldId = fields.fieldId

    if (typeof fieldId !== 'number' || fieldId <= 0) {
      throw new Error(
        `Invalid field ID returned for "${params.fieldColId}" in widget ${params.sectionId}`
      )
    }

    return fieldId
  }

  private async getRowOwnerRef(
    client: GristClient,
    docId: string,
    params: OwnerLookupParams
  ): Promise<number> {
    const response = await client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT rawViewSectionRef
            FROM _grist_Tables
            WHERE tableId = ?`,
      args: [params.tableId]
    })

    if (response.records.length === 0) {
      throw new Error(
        `Table "${params.tableId}" not found. Use grist_get_tables to list available tables.`
      )
    }

    const fields = extractFields(first(response.records, `Table "${params.tableId}"`))
    const rawViewSectionRef = fields.rawViewSectionRef

    if (typeof rawViewSectionRef !== 'number' || rawViewSectionRef <= 0) {
      throw new Error(
        `Table "${params.tableId}" has no rawViewSectionRef. ` +
          `This may indicate a corrupt table metadata state.`
      )
    }

    return rawViewSectionRef
  }
}

// =============================================================================
// Factory function
// =============================================================================

/** Create a RuleOwner for the given scope */
export function createRuleOwner(scope: RuleScope): RuleOwner {
  return new RuleOwner(scope)
}

// =============================================================================
// ConditionalFormattingService
// =============================================================================

/**
 * Service for managing conditional formatting rules.
 * Orchestrates CRUD operations using RuleOwner for scope-specific behavior.
 */
export class ConditionalFormattingService {
  private readonly client: GristClient
  private readonly ruleOwner: RuleOwner
  private readonly scope: RuleScope

  constructor(client: GristClient, scope: RuleScope) {
    this.client = client
    this.scope = scope
    this.ruleOwner = new RuleOwner(scope)
  }

  /** Validate formula and throw formatted error if invalid */
  private validateFormula(formula: string): void {
    const validation = validatePythonFormula(formula)
    if (!validation.valid && validation.error) {
      const suggestions = validation.suggestions ?? []
      const suggestionText =
        suggestions.length > 0
          ? `\nSuggestions:\n${suggestions.map((s) => `- ${s}`).join('\n')}`
          : ''
      throw new Error(`Invalid formula: ${validation.error}${suggestionText}`)
    }
  }

  /** Check if error is a column not found error (retry-worthy) */
  private isColumnNotFoundError(error: unknown): boolean {
    if (!(error instanceof Error)) return false
    return (
      error.message.includes('not found') ||
      error.message.includes('Invalid column') ||
      error.message.includes('KeyError')
    )
  }

  /** Wait for rules RefList to propagate with exponential backoff */
  private async waitForRulePropagation(
    docId: string,
    ownerRef: number,
    expectedCount: number
  ): Promise<void> {
    for (let waitAttempt = 0; waitAttempt < POLLING_MAX_ATTEMPTS; waitAttempt++) {
      const updatedState = await this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)
      if (updatedState.helperColRefs.length >= expectedCount) return

      await new Promise((resolve) => setTimeout(resolve, pollingDelay(waitAttempt)))
    }
  }

  /**
   * Add a new conditional formatting rule.
   * Uses atomic bundle to create helper column and update rules/styles together.
   */
  async addRule(
    docId: string,
    tableId: string,
    ownerParams: OwnerLookupParams,
    rule: { formula: string; style: Record<string, unknown> }
  ): Promise<RuleOperationResult> {
    const MAX_RETRIES = 2
    this.validateFormula(rule.formula)

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const ownerRef = await this.ruleOwner.getOwnerRef(this.client, docId, ownerParams)
        const [predictedColId, currentState] = await Promise.all([
          this.ruleOwner.predictNextHelperColId(this.client, docId, tableId),
          this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)
        ])

        const [fieldRef, colRef] = this.ruleOwner.getAddEmptyRuleParams({
          docId,
          tableId,
          ownerRef
        })

        const updatedStyles = [...currentState.styles, rule.style]
        const currentOptions = await this.getOwnerOptions(docId, ownerRef)
        const updatedOptions = {
          ...currentOptions,
          rulesOptions: updatedStyles
        }

        await this.client.post<ApplyResponse>(
          `/docs/${docId}/apply`,
          [
            ['AddEmptyRule', tableId, fieldRef, colRef],
            ['ModifyColumn', tableId, predictedColId, { formula: rule.formula }],
            [
              'UpdateRecord',
              this.ruleOwner.config.metadataTable,
              ownerRef,
              {
                [this.ruleOwner.config.styleProperty]: JSON.stringify(updatedOptions)
              }
            ]
          ],
          {
            schema: ApplyResponseSchema,
            context: `Adding ${this.scope} conditional rule`
          }
        )

        await this.waitForRulePropagation(docId, ownerRef, currentState.helperColRefs.length + 1)
        return this.listRules(docId, tableId, ownerParams)
      } catch (error) {
        if (this.isColumnNotFoundError(error) && attempt < MAX_RETRIES) {
          continue
        }
        throw error
      }
    }

    throw new Error('Failed to add rule after maximum retries')
  }

  /**
   * Update an existing conditional formatting rule.
   */
  async updateRule(
    docId: string,
    tableId: string,
    ownerParams: OwnerLookupParams,
    ruleIndex: number,
    rule: { formula: string; style: Record<string, unknown> }
  ): Promise<RuleOperationResult> {
    this.validateFormula(rule.formula)

    const ownerRef = await this.ruleOwner.getOwnerRef(this.client, docId, ownerParams)
    const currentState = await this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)

    if (ruleIndex < 0 || ruleIndex >= currentState.helperColRefs.length) {
      throw new Error(
        `Invalid ruleIndex: ${ruleIndex}. Must be between 0 and ${currentState.helperColRefs.length - 1}. ` +
          `Use action="list" to see current rule indexes.`
      )
    }

    const helperColRef = currentState.helperColRefs[ruleIndex]
    await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [['UpdateRecord', '_grist_Tables_column', helperColRef, { formula: rule.formula }]],
      {
        schema: ApplyResponseSchema,
        context: `Updating ${this.scope} rule ${ruleIndex} formula`
      }
    )

    const updatedStyles = [...currentState.styles]
    updatedStyles[ruleIndex] = rule.style

    await this.ruleOwner.updateRulesAndStyles(this.client, docId, ownerRef, {
      helperColRefs: currentState.helperColRefs,
      styles: updatedStyles
    })

    return this.listRules(docId, tableId, ownerParams)
  }

  /**
   * Remove a conditional formatting rule.
   */
  async removeRule(
    docId: string,
    _tableId: string,
    ownerParams: OwnerLookupParams,
    ruleIndex: number
  ): Promise<RuleRemoveResult> {
    const ownerRef = await this.ruleOwner.getOwnerRef(this.client, docId, ownerParams)
    const currentState = await this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)

    if (ruleIndex < 0 || ruleIndex >= currentState.helperColRefs.length) {
      throw new Error(
        `Invalid ruleIndex: ${ruleIndex}. Must be between 0 and ${currentState.helperColRefs.length - 1}. ` +
          `Use action="list" to see current rule indexes.`
      )
    }

    const updatedHelperRefs = currentState.helperColRefs.filter((_, idx) => idx !== ruleIndex)
    const updatedStyles = currentState.styles.filter((_, idx) => idx !== ruleIndex)

    await this.ruleOwner.updateRulesAndStyles(this.client, docId, ownerRef, {
      helperColRefs: updatedHelperRefs,
      styles: updatedStyles
    })

    const targetDesc = this.formatTargetDescription(ownerParams)
    return {
      message: `Successfully removed rule ${ruleIndex + 1} from ${targetDesc}. ${updatedHelperRefs.length} rule(s) remaining.`,
      remainingRules: updatedHelperRefs.length
    }
  }

  /**
   * Replace all conditional formatting rules with a new set.
   */
  async replaceAllRules(
    docId: string,
    tableId: string,
    ownerParams: OwnerLookupParams,
    rules: Array<{ formula: string; style: Record<string, unknown> }>
  ): Promise<RuleOperationResult> {
    const ownerRef = await this.ruleOwner.getOwnerRef(this.client, docId, ownerParams)
    const currentState = await this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)

    if (currentState.helperColRefs.length > 0) {
      await this.ruleOwner.updateRulesAndStyles(this.client, docId, ownerRef, {
        helperColRefs: [],
        styles: []
      })
    }

    for (const rule of rules) {
      await this.addRule(docId, tableId, ownerParams, rule)
    }

    return this.listRules(docId, tableId, ownerParams)
  }

  /**
   * List all conditional formatting rules.
   */
  async listRules(
    docId: string,
    tableId: string,
    ownerParams: OwnerLookupParams
  ): Promise<RuleOperationResult> {
    const ownerRef = await this.ruleOwner.getOwnerRef(this.client, docId, ownerParams)
    const currentState = await this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)

    if (currentState.helperColRefs.length === 0) {
      return {
        rules: [],
        totalRules: 0,
        scope: this.scope,
        target: this.buildTarget(tableId, ownerParams, ownerRef)
      }
    }

    const formulas = await this.ruleOwner.getHelperColumnFormulas(
      this.client,
      docId,
      currentState.helperColRefs
    )

    const rules: ConditionalRuleDisplay[] = currentState.helperColRefs.map((_colRef, index) => ({
      index,
      formula: formulas[index] || '',
      style: parseStyleOptions(currentState.styles[index] || {})
    }))

    return {
      rules,
      totalRules: rules.length,
      scope: this.scope,
      target: this.buildTarget(tableId, ownerParams, ownerRef)
    }
  }

  /** Get owner's current options/widgetOptions */
  private async getOwnerOptions(docId: string, ownerRef: number): Promise<Record<string, unknown>> {
    const styleProperty = this.ruleOwner.config.styleProperty

    const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `SELECT ${styleProperty} FROM ${this.ruleOwner.config.metadataTable} WHERE id = ?`,
      args: [ownerRef]
    })

    if (response.records.length === 0) {
      return {}
    }

    return parseGristJson<Record<string, unknown>>(
      extractFields(first(response.records, 'Rule style query'))[styleProperty],
      {}
    )
  }

  /** Build target info for response */
  private buildTarget(
    tableId: string,
    ownerParams: OwnerLookupParams,
    ownerRef: number
  ): RuleOperationResult['target'] {
    const target: RuleOperationResult['target'] = { tableId }

    if (ownerParams.colId) {
      target.colId = ownerParams.colId
    } else if (ownerParams.fieldColId) {
      target.colId = ownerParams.fieldColId
    }

    if (ownerParams.sectionId) {
      target.sectionId = ownerParams.sectionId
    }

    if (this.scope === 'field') {
      target.fieldId = ownerRef
    }

    return target
  }

  /** Format target description for messages */
  private formatTargetDescription(ownerParams: OwnerLookupParams): string {
    switch (this.scope) {
      case 'column':
        return `column "${ownerParams.colId}" in ${ownerParams.tableId}`
      case 'row':
        return `rows in ${ownerParams.tableId}`
      case 'field':
        return `field "${ownerParams.fieldColId}" in widget ${ownerParams.sectionId} (${ownerParams.tableId})`
      default:
        return 'target'
    }
  }
}
