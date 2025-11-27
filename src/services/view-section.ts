// Reference: docs/reference/grist-database-schema.md

import {
  ViewLayoutSpecSchema,
  type ViewSectionRecord,
  ViewSectionRecordSchema
} from '../schemas/api-responses.js'
import type { SectionId, ViewId } from '../types/advanced.js'
import type { SQLQueryResponse } from '../types.js'
import { extractFields } from '../utils/grist-field-extractor.js'
import type { GristClient } from './grist-client.js'

export class ViewSectionService {
  constructor(private readonly client: GristClient) {}

  async getViewSection(docId: string, sectionId: SectionId): Promise<ViewSectionRecord> {
    const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: `
          SELECT
            id, parentId, tableRef, parentKey, title, description,
            linkSrcSectionRef, linkSrcColRef, linkTargetColRef,
            sortColRefs, filterSpec, borderWidth,
            chartType, options
          FROM _grist_Views_section
          WHERE id = ?
        `,
      args: [sectionId]
    })

    if (response.records.length === 0) {
      throw new Error(
        `ViewSection ${sectionId} not found in _grist_Views_section. ` +
          `Widget may have been deleted or section ID is incorrect.`
      )
    }

    return this.parseViewSectionRecord(response.records[0])
  }

  async getLayoutSpec(docId: string, viewId: ViewId): Promise<string> {
    const response = await this.client.post<SQLQueryResponse>(`/docs/${docId}/sql`, {
      sql: 'SELECT id, layoutSpec FROM _grist_Views WHERE id = ?',
      args: [viewId]
    })

    if (response.records.length === 0) {
      throw new Error(`View ${viewId} not found in _grist_Views`)
    }

    const fields = extractFields(response.records[0])

    const result = ViewLayoutSpecSchema.safeParse(fields)
    if (!result.success) {
      throw new Error(`Invalid layoutSpec from _grist_Views: ${result.error.message}`)
    }

    return result.data.layoutSpec || '{}'
  }

  private parseViewSectionRecord(record: Record<string, unknown>): ViewSectionRecord {
    const fields = extractFields(record)

    const result = ViewSectionRecordSchema.safeParse(fields)

    if (!result.success) {
      throw new Error(
        `Invalid ViewSection record: ${result.error.message}. ` +
          `This may indicate an API response format change. ` +
          `Received fields: ${Object.keys(fields).join(', ')}`
      )
    }

    return result.data
  }
}

export type ViewSectionUpdate = {
  tableRef?: number
  title?: string
  description?: string
  parentKey?: string
  linkSrcSectionRef?: number | null
  linkSrcColRef?: number | null
  linkTargetColRef?: number | null
  sortColRefs?: string | null
  filterSpec?: string | null
  chartType?: string
  options?: string
}

export function buildViewSectionUpdate(
  existing: ViewSectionRecord,
  updates: ViewSectionUpdate
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    tableRef: existing.tableRef,
    parentId: existing.parentId,
    borderWidth: existing.borderWidth,
    linkSrcSectionRef: existing.linkSrcSectionRef,
    linkSrcColRef: existing.linkSrcColRef,
    linkTargetColRef: existing.linkTargetColRef
  }

  for (const [key, value] of Object.entries(updates)) {
    if (value !== undefined) {
      payload[key] = value
    }
  }

  return payload
}

export function validateViewSectionUpdate(updates: ViewSectionUpdate): void {
  const errors: string[] = []

  if (updates.parentKey !== undefined) {
    const validTypes = ['record', 'single', 'detail', 'chart', 'form', 'custom']
    if (!validTypes.includes(updates.parentKey)) {
      errors.push(
        `Invalid widget type "${updates.parentKey}". ` + `Must be one of: ${validTypes.join(', ')}`
      )
    }
  }

  if (updates.sortColRefs !== undefined && updates.sortColRefs !== null) {
    try {
      JSON.parse(updates.sortColRefs)
    } catch {
      errors.push('sortColRefs must be valid JSON array string')
    }
  }

  if (errors.length > 0) {
    throw new Error(`Invalid ViewSection update:\n${errors.map((e) => `  - ${e}`).join('\n')}`)
  }
}
