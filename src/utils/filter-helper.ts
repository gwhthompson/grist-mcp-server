export interface Nameable {
  name: string
}

export function filterByName<T extends Nameable>(items: T[], searchTerm?: string): T[] {
  if (!searchTerm || searchTerm.trim() === '') {
    return items
  }

  const lowerSearch = searchTerm.toLowerCase()
  return items.filter((item) => item.name.toLowerCase().includes(lowerSearch))
}

export function filterByProperty<T, K extends keyof T>(items: T[], property: K, value: T[K]): T[] {
  if (value === undefined || value === null) {
    return items
  }

  if (typeof value === 'string') {
    const lowerValue = value.toLowerCase()
    return items.filter((item) => {
      const itemValue = item[property]
      if (typeof itemValue === 'string') {
        return itemValue.toLowerCase() === lowerValue
      }
      return itemValue === value
    })
  }

  return items.filter((item) => item[property] === value)
}

export function filterByPredicate<T>(items: T[], predicate: (item: T) => boolean): T[] {
  if (items.length === 0) {
    return items
  }

  return items.filter(predicate)
}

export function filterWithAnd<T>(items: T[], filters: Array<(item: T) => boolean>): T[] {
  if (filters.length === 0) {
    return items
  }

  return items.filter((item) => filters.every((filter) => filter(item)))
}

export function filterWithOr<T>(items: T[], filters: Array<(item: T) => boolean>): T[] {
  if (filters.length === 0) {
    return items
  }

  return items.filter((item) => filters.some((filter) => filter(item)))
}

export function composeFiltersAnd<T>(filters: Array<(item: T) => boolean>): (item: T) => boolean {
  return (item: T) => filters.every((filter) => filter(item))
}

export function composeFiltersOr<T>(filters: Array<(item: T) => boolean>): (item: T) => boolean {
  return (item: T) => filters.some((filter) => filter(item))
}

export function searchAcrossProperties<T>(
  items: T[],
  searchTerm: string | undefined,
  properties: Array<keyof T>
): T[] {
  if (!searchTerm || searchTerm.trim() === '') {
    return items
  }

  const lowerSearch = searchTerm.toLowerCase()

  return items.filter((item) => {
    return properties.some((prop) => {
      const value = item[prop]
      if (typeof value === 'string') {
        return value.toLowerCase().includes(lowerSearch)
      }
      return false
    })
  })
}
