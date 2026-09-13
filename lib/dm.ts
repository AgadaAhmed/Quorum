// Direct-message helpers. A DM room id is deterministic from the two user ids
// (sorted) so both participants resolve the same room without a lookup.

export function dmRoomId(a: string, b: string): string {
  return `dm__${[a, b].sort().join('__')}`;
}

/** The two uids encoded in a dm room id, or [] if it isn't a dm room. */
export function dmParticipantsOf(roomId: string): string[] {
  return roomId.startsWith('dm__') ? roomId.slice(4).split('__').filter(Boolean) : [];
}

/**
 * Whether the current user may DM a target. Friends can always DM each other;
 * a non-friend may DM only if the target allows DMs (allowDMs defaults to true
 * when unset). `isFriend` is computed by the caller from the friends list.
 */
export function canDirectMessage(opts: { isFriend: boolean; targetAllowsDMs?: boolean }): boolean {
  if (opts.isFriend) return true;
  return opts.targetAllowsDMs !== false; // undefined => allowed
}
