/**
 * Abstract base class for page pattern builders.
 *
 * Provides common functionality for building page layouts with different patterns.
 * Each pattern builder extends this class and implements the build() method.
 */

import { ApplyResponseSchema } from '../../schemas/api-responses.js'
import type { ApplyResponse, LayoutSpec, UserAction } from '../../types.js'
import { first } from '../../utils/array-helpers.js'
import { validateRetValues } from '../../validators/apply-response.js'
import {
  buildLeafLayout,
  buildUpdateLayoutAction,
  buildVerticalSplitLayout,
  processCreateViewSectionResults
} from '../pages-builder.js'
import type { CreateViewSectionResult, PatternBuildResult, PatternContext } from './types.js'

/**
 * Abstract base class for pattern builders.
 *
 * @template TConfig - Configuration type for the specific pattern
 */
export abstract class PatternBuilder<TConfig> {
  constructor(protected readonly context: PatternContext) {}

  /**
   * Build a page with this pattern.
   *
   * @param config - Pattern-specific configuration
   * @returns Result containing page info and created widgets
   */
  abstract build(config: TConfig): Promise<PatternBuildResult>

  /**
   * Execute API call to create view sections.
   */
  protected async executeCreateSections(
    actions: UserAction[],
    contextMessage: string
  ): Promise<CreateViewSectionResult[]> {
    const response = await this.context.client.post<ApplyResponse>(
      `/docs/${this.context.docId}/apply`,
      actions,
      {
        schema: ApplyResponseSchema,
        context: contextMessage
      }
    )

    const retValues = validateRetValues(response, { context: contextMessage })
    return processCreateViewSectionResults(retValues)
  }

  /**
   * Execute API call for general actions.
   */
  protected async executeActions(actions: UserAction[], contextMessage: string): Promise<void> {
    const response = await this.context.client.post<ApplyResponse>(
      `/docs/${this.context.docId}/apply`,
      actions,
      {
        schema: ApplyResponseSchema,
        context: contextMessage
      }
    )

    validateRetValues(response, { context: contextMessage })
  }

  /**
   * Set layout and page name.
   */
  protected async setLayoutAndName(viewRef: number, layout: LayoutSpec): Promise<void> {
    await this.executeActions(
      [
        buildUpdateLayoutAction(viewRef, layout),
        ['UpdateRecord', '_grist_Views', viewRef, { name: this.context.pageName }]
      ],
      'Setting page layout'
    )
  }

  /**
   * Set widget titles.
   */
  protected async setWidgetTitles(sectionRefs: number[], titles: string[]): Promise<void> {
    const actions: UserAction[] = sectionRefs.map((sectionRef, i) => [
      'UpdateRecord',
      '_grist_Views_section',
      sectionRef,
      { title: titles[i] ?? `Widget ${i + 1}` }
    ])

    if (actions.length > 0) {
      await this.executeActions(actions, 'Setting widget titles')
    }
  }

  /**
   * Build a default vertical layout for multiple sections.
   */
  protected buildDefaultVerticalLayout(sectionRefs: ReadonlyArray<number>): LayoutSpec {
    if (sectionRefs.length === 0) {
      throw new Error('Cannot build layout with no sections')
    }

    const firstRef = first(sectionRefs, 'Layout first section')

    if (sectionRefs.length === 1) {
      return buildLeafLayout(firstRef)
    }

    // Safe: we know sectionRefs.length >= 2
    let layout = buildVerticalSplitLayout(firstRef, sectionRefs[1] as number, 0.5)

    for (let i = 2; i < sectionRefs.length; i++) {
      layout = buildVerticalSplitLayout(
        firstRef,
        sectionRefs[i] as number, // Safe: loop bound check
        0.5
      )
    }

    return layout
  }
}
