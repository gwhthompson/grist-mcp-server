/**
 * ConditionalFormattingService
 *
 * Orchestrates CRUD operations for conditional formatting rules across all scopes.
 * Uses RuleOwner strategy pattern to handle scope-specific storage differences.
 */

import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import type { ApplyResponse, SQLQueryResponse } from '../../types.js'
import { first } from '../../utils/array-helpers.js'
import { extractFields } from '../../utils/grist-field-extractor.js'
import type { GristClient } from '../grist-client.js'
import { parseGristJson, parseStyleOptions, validatePythonFormula } from '../rule-utilities.js'
import { ColumnRuleOwner } from './column-rule-owner.js'
import { FieldRuleOwner } from './field-rule-owner.js'
import { RowRuleOwner } from './row-rule-owner.js'
import type { RuleOwner } from './rule-owner.js'
import type {
  ConditionalRuleDisplay,
  OwnerLookupParams,
  RuleOperationResult,
  RuleRemoveResult,
  RuleScope
} from './types.js'

/**
 * Factory function to create the appropriate RuleOwner for a scope
 */
export function createRuleOwner(scope: RuleScope): RuleOwner {
  switch (scope) {
    case 'column':
      return new ColumnRuleOwner()
    case 'row':
      return new RowRuleOwner()
    case 'field':
      return new FieldRuleOwner()
    default: {
      const _exhaustive: never = scope
      throw new Error(`Unknown scope: ${_exhaustive}`)
    }
  }
}

/**
 * Service for managing conditional formatting rules
 */
export class ConditionalFormattingService {
  private readonly client: GristClient
  private readonly ruleOwner: RuleOwner
  private readonly scope: RuleScope

  constructor(client: GristClient, scope: RuleScope) {
    this.client = client
    this.scope = scope
    this.ruleOwner = createRuleOwner(scope)
  }

  /**
   * Add a new conditional formatting rule.
   *
   * Uses atomic bundle to create helper column and update rules/styles together.
   * Retries up to 2 times if helper column name prediction fails.
   */
  async addRule(
    docId: string,
    tableId: string,
    ownerParams: OwnerLookupParams,
    rule: { formula: string; style: Record<string, unknown> }
  ): Promise<RuleOperationResult> {
    const MAX_RETRIES = 2

    // Validate formula syntax
    const validation = validatePythonFormula(rule.formula)
    if (!validation.valid && validation.error) {
      let errorMsg = `Invalid formula: ${validation.error}`
      if (validation.suggestions && validation.suggestions.length > 0) {
        errorMsg += `\nSuggestions:\n${validation.suggestions.map((s) => `- ${s}`).join('\n')}`
      }
      throw new Error(errorMsg)
    }

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        // Get owner reference and current state
        const ownerRef = await this.ruleOwner.getOwnerRef(this.client, docId, ownerParams)
        const [predictedColId, currentState] = await Promise.all([
          this.ruleOwner.predictNextHelperColId(this.client, docId, tableId),
          this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)
        ])

        // Build AddEmptyRule parameters for this scope
        const [fieldRef, colRef] = this.ruleOwner.getAddEmptyRuleParams({
          docId,
          tableId,
          ownerRef
        })

        // Prepare updated styles
        const updatedStyles = [...currentState.styles, rule.style]

        // Get current storage options for merging
        const currentOptions = await this.getOwnerOptions(docId, ownerRef)
        const updatedOptions = {
          ...currentOptions,
          rulesOptions: updatedStyles
        }

        // Single atomic bundle - AddEmptyRule handles rules RefList for ALL scopes
        await this.client.post<ApplyResponse>(
          `/docs/${docId}/apply`,
          [
            // 1. Create helper column and update rules RefList atomically
            ['AddEmptyRule', tableId, fieldRef, colRef],

            // 2. Set formula on the newly created helper column
            ['ModifyColumn', tableId, predictedColId, { formula: rule.formula }],

            // 3. Update owner's options with merged rulesOptions
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

        // Wait for rules RefList to propagate before returning
        const expectedCount = currentState.helperColRefs.length + 1
        for (let waitAttempt = 0; waitAttempt < 20; waitAttempt++) {
          const updatedState = await this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)
          if (updatedState.helperColRefs.length >= expectedCount) {
            break
          }
          const delay = waitAttempt < 5 ? 10 : waitAttempt < 10 ? 50 : 100
          await new Promise((resolve) => setTimeout(resolve, delay))
        }

        return this.listRules(docId, tableId, ownerParams)
      } catch (error) {
        // Check if this is a ModifyColumn failure due to wrong column name prediction
        const isColumnNotFoundError =
          error instanceof Error &&
          (error.message.includes('not found') ||
            error.message.includes('Invalid column') ||
            error.message.includes('KeyError'))

        if (isColumnNotFoundError && attempt < MAX_RETRIES) {
          // Retry with fresh prediction - bundle already rolled back
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
    // Validate formula syntax
    const validation = validatePythonFormula(rule.formula)
    if (!validation.valid && validation.error) {
      let errorMsg = `Invalid formula: ${validation.error}`
      if (validation.suggestions && validation.suggestions.length > 0) {
        errorMsg += `\nSuggestions:\n${validation.suggestions.map((s) => `- ${s}`).join('\n')}`
      }
      throw new Error(errorMsg)
    }

    const ownerRef = await this.ruleOwner.getOwnerRef(this.client, docId, ownerParams)
    const currentState = await this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)

    // Validate index
    if (ruleIndex < 0 || ruleIndex >= currentState.helperColRefs.length) {
      throw new Error(
        `Invalid ruleIndex: ${ruleIndex}. Must be between 0 and ${currentState.helperColRefs.length - 1}. ` +
          `Use action="list" to see current rule indexes.`
      )
    }

    // Update formula on helper column
    const helperColRef = currentState.helperColRefs[ruleIndex]
    await this.client.post<ApplyResponse>(
      `/docs/${docId}/apply`,
      [['UpdateRecord', '_grist_Tables_column', helperColRef, { formula: rule.formula }]],
      {
        schema: ApplyResponseSchema,
        context: `Updating ${this.scope} rule ${ruleIndex} formula`
      }
    )

    // Update style in rulesOptions
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

    // Validate index
    if (ruleIndex < 0 || ruleIndex >= currentState.helperColRefs.length) {
      throw new Error(
        `Invalid ruleIndex: ${ruleIndex}. Must be between 0 and ${currentState.helperColRefs.length - 1}. ` +
          `Use action="list" to see current rule indexes.`
      )
    }

    // Remove from arrays
    const updatedHelperRefs = currentState.helperColRefs.filter((_, idx) => idx !== ruleIndex)
    const updatedStyles = currentState.styles.filter((_, idx) => idx !== ruleIndex)

    // Update owner
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
   * Clears existing rules first, then adds new ones.
   * Used for entity-level CRUD where users provide the complete rules array.
   */
  async replaceAllRules(
    docId: string,
    tableId: string,
    ownerParams: OwnerLookupParams,
    rules: Array<{ formula: string; style: Record<string, unknown> }>
  ): Promise<RuleOperationResult> {
    const ownerRef = await this.ruleOwner.getOwnerRef(this.client, docId, ownerParams)
    const currentState = await this.ruleOwner.getRulesAndStyles(this.client, docId, ownerRef)

    // Clear existing rules if any
    if (currentState.helperColRefs.length > 0) {
      await this.ruleOwner.updateRulesAndStyles(this.client, docId, ownerRef, {
        helperColRefs: [],
        styles: []
      })
    }

    // Add new rules one by one (addRule handles helper column creation)
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

    // Get formulas from helper columns
    const formulas = await this.ruleOwner.getHelperColumnFormulas(
      this.client,
      docId,
      currentState.helperColRefs
    )

    // Combine into display format
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

  /**
   * Get owner's current options/widgetOptions
   */
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

  /**
   * Build target info for response
   */
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

  /**
   * Format target description for messages
   */
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
