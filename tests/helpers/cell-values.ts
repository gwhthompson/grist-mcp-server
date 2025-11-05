/**
 * CellValue Encoding Helpers
 *
 * Provides utilities for creating and validating Grist CellValues
 * based on the official GristObjCode specification
 */

import type { CellValue } from '../../src/types.js';

/**
 * GristObjCode enum from grist-types.d.ts
 */
export enum GristObjCode {
  List = 'L',
  LookUp = 'l',
  Dict = 'O',
  DateTime = 'D',
  Date = 'd',
  Skip = 'S',
  Censored = 'C',
  Reference = 'R',
  ReferenceList = 'r',
  Exception = 'E',
  Pending = 'P',
  Unmarshallable = 'U',
  Versions = 'V'
}

/**
 * Create a List CellValue: ["L", ...items]
 */
export function createList(...items: Array<string | number | boolean>): CellValue {
  return [GristObjCode.List, ...items];
}

/**
 * Create a DateTime CellValue: ["D", timestamp, timezone]
 */
export function createDateTime(timestamp: number, timezone: string = 'UTC'): CellValue {
  return [GristObjCode.DateTime, timestamp, timezone];
}

/**
 * Create a Date CellValue: ["d", timestamp]
 */
export function createDate(timestamp: number): CellValue {
  return [GristObjCode.Date, timestamp];
}

/**
 * Create a Reference CellValue: ["R", tableId, rowId]
 */
export function createReference(tableId: string, rowId: number): CellValue {
  return [GristObjCode.Reference, tableId, rowId];
}

/**
 * Create a ReferenceList CellValue: ["r", tableId, [rowId1, rowId2, ...]]
 */
export function createReferenceList(tableId: string, rowIds: number[]): CellValue {
  return [GristObjCode.ReferenceList, tableId, rowIds];
}

/**
 * Create a Dict CellValue: ["O", {key: value, ...}]
 */
export function createDict(obj: Record<string, any>): CellValue {
  return [GristObjCode.Dict, obj];
}

/**
 * Create a Censored CellValue: ["C"]
 */
export function createCensored(): CellValue {
  return [GristObjCode.Censored];
}

/**
 * Create an Exception CellValue: ["E", errorName, ...]
 */
export function createException(errorName: string, ...args: any[]): CellValue {
  return [GristObjCode.Exception, errorName, ...args];
}

/**
 * Create a Pending CellValue: ["P"]
 */
export function createPending(): CellValue {
  return [GristObjCode.Pending];
}

/**
 * Create an Unmarshallable CellValue: ["U", textRepresentation]
 */
export function createUnmarshallable(text: string): CellValue {
  return [GristObjCode.Unmarshallable, text];
}

/**
 * Type guards for CellValue validation
 */

export function isList(value: CellValue): value is [GristObjCode.List, ...any[]] {
  return Array.isArray(value) && value[0] === GristObjCode.List;
}

export function isDateTime(value: CellValue): value is [GristObjCode.DateTime, number, string] {
  return Array.isArray(value) && value[0] === GristObjCode.DateTime && value.length === 3;
}

export function isDate(value: CellValue): value is [GristObjCode.Date, number] {
  return Array.isArray(value) && value[0] === GristObjCode.Date && value.length === 2;
}

export function isReference(value: CellValue): value is [GristObjCode.Reference, string, number] {
  return Array.isArray(value) && value[0] === GristObjCode.Reference && value.length === 3;
}

export function isReferenceList(value: CellValue): value is [GristObjCode.ReferenceList, string, number[]] {
  return Array.isArray(value) && value[0] === GristObjCode.ReferenceList && value.length === 3;
}

export function isDict(value: CellValue): value is [GristObjCode.Dict, Record<string, any>] {
  return Array.isArray(value) && value[0] === GristObjCode.Dict && value.length === 2;
}

export function isCensored(value: CellValue): value is [GristObjCode.Censored] {
  return Array.isArray(value) && value[0] === GristObjCode.Censored;
}

export function isException(value: CellValue): value is [GristObjCode.Exception, string, ...any[]] {
  return Array.isArray(value) && value[0] === GristObjCode.Exception;
}

export function isPending(value: CellValue): value is [GristObjCode.Pending] {
  return Array.isArray(value) && value[0] === GristObjCode.Pending;
}

export function isUnmarshallable(value: CellValue): value is [GristObjCode.Unmarshallable, string] {
  return Array.isArray(value) && value[0] === GristObjCode.Unmarshallable;
}

export function isPrimitive(value: CellValue): value is string | number | boolean | null {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null;
}

/**
 * Extract values from encoded CellValues
 */

export function extractListItems(value: CellValue): any[] | null {
  if (!isList(value)) return null;
  return value.slice(1);
}

export function extractDateTime(value: CellValue): { timestamp: number; timezone: string } | null {
  if (!isDateTime(value)) return null;
  return { timestamp: value[1], timezone: value[2] };
}

export function extractDate(value: CellValue): number | null {
  if (!isDate(value)) return null;
  return value[1];
}

export function extractReference(value: CellValue): { tableId: string; rowId: number } | null {
  if (!isReference(value)) return null;
  return { tableId: value[1], rowId: value[2] };
}

export function extractReferenceList(value: CellValue): { tableId: string; rowIds: number[] } | null {
  if (!isReferenceList(value)) return null;
  return { tableId: value[1], rowIds: value[2] };
}

export function extractDict(value: CellValue): Record<string, any> | null {
  if (!isDict(value)) return null;
  return value[1];
}

/**
 * Sample CellValues for testing (all GristObjCode types)
 */
export const SAMPLE_CELL_VALUES = {
  // Primitives
  primitiveString: 'Hello World',
  primitiveNumber: 42,
  primitiveBoolean: true,
  primitiveNull: null,

  // List (Choice/ChoiceList)
  list: createList('cat', 'dog', 'bird'),
  listNumbers: createList(1, 2, 3, 4, 5),
  emptyList: createList(),

  // DateTime
  dateTime: createDateTime(1704945919, 'UTC'),
  dateTimeNewYork: createDateTime(1704945919, 'America/New_York'),
  dateTimeLondon: createDateTime(1704945919, 'Europe/London'),

  // Date
  date: createDate(1704844800),
  dateEpoch: createDate(0),

  // Reference
  reference: createReference('People', 17),
  referenceOrders: createReference('Orders', 1),

  // ReferenceList
  referenceList: createReferenceList('People', [1, 2, 3]),
  referenceListEmpty: createReferenceList('People', []),
  referenceListSingle: createReferenceList('Tags', [5]),

  // Dict
  dict: createDict({ name: 'John', age: 30, active: true }),
  emptyDict: createDict({}),
  nestedDict: createDict({ user: { id: 1, name: 'Alice' }, meta: { created: 123456 } }),

  // Special types
  censored: createCensored(),
  exception: createException('ValueError', 'Invalid input'),
  pending: createPending(),
  unmarshallable: createUnmarshallable('unparseable data')
} as const;

/**
 * Validate CellValue structure
 */
export function validateCellValue(value: unknown): value is CellValue {
  if (value === null) return true;
  if (typeof value === 'string') return true;
  if (typeof value === 'number') return true;
  if (typeof value === 'boolean') return true;

  if (Array.isArray(value)) {
    if (value.length === 0) return false;
    if (typeof value[0] !== 'string') return false;
    if (value[0].length !== 1) return false;
    // Valid GristObjCode
    return Object.values(GristObjCode).includes(value[0] as any);
  }

  return false;
}

/**
 * Get the type of a CellValue
 */
export function getCellValueType(value: CellValue): string {
  if (isPrimitive(value)) {
    if (value === null) return 'null';
    return typeof value;
  }

  if (Array.isArray(value) && value.length > 0) {
    const code = value[0];
    switch (code) {
      case GristObjCode.List: return 'List';
      case GristObjCode.LookUp: return 'LookUp';
      case GristObjCode.Dict: return 'Dict';
      case GristObjCode.DateTime: return 'DateTime';
      case GristObjCode.Date: return 'Date';
      case GristObjCode.Skip: return 'Skip';
      case GristObjCode.Censored: return 'Censored';
      case GristObjCode.Reference: return 'Reference';
      case GristObjCode.ReferenceList: return 'ReferenceList';
      case GristObjCode.Exception: return 'Exception';
      case GristObjCode.Pending: return 'Pending';
      case GristObjCode.Unmarshallable: return 'Unmarshallable';
      case GristObjCode.Versions: return 'Versions';
      default: return 'Unknown';
    }
  }

  return 'Invalid';
}
