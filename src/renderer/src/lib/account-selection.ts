export type AccountSelectionIntent = { toggle?: boolean; range?: boolean }

/** Only explicit selection gestures change the batch target; viewing a drawer does not. */
export function selectAccount(
  selected: string[], visible: string[], id: string, anchor: string | null, intent: AccountSelectionIntent = {}
): { ids: string[]; anchor: string } {
  const end = visible.indexOf(id), start = anchor ? visible.indexOf(anchor) : -1
  if (intent.range && start >= 0 && end >= 0) {
    const range = visible.slice(Math.min(start, end), Math.max(start, end) + 1)
    return { ids: intent.toggle ? [...new Set([...selected, ...range])] : range, anchor: anchor! }
  }
  return {
    ids: intent.toggle ? selected.includes(id) ? selected.filter(value => value !== id) : [...selected, id] : [id],
    anchor: id
  }
}

/** A filtered select-all toggles visible rows, preserving explicitly selected hidden rows. */
export function toggleVisibleAccounts(selected: string[], visible: string[]): string[] {
  if (!visible.length) return selected
  const selectedSet = new Set(selected), visibleSet = new Set(visible)
  return visible.every(id => selectedSet.has(id))
    ? selected.filter(id => !visibleSet.has(id))
    : [...new Set([...selected, ...visible])]
}
