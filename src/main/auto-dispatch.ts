/** Worker pool: a slot stays occupied until a profile's complete auto flow settles. */
export async function dispatchAutoProfiles<T>(
  profiles: T[], parallel: number, run: (profile: T) => Promise<void>,
  shouldStop: () => boolean, onError: (profile: T, error: unknown) => void
): Promise<void> {
  const limit = Number.isSafeInteger(parallel) && parallel > 0 ? parallel : 1
  let cursor = 0
  const worker = async (): Promise<void> => {
    while (!shouldStop() && cursor < profiles.length) {
      const profile = profiles[cursor++]
      try { await run(profile) } catch (error) { onError(profile, error) }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, profiles.length) }, worker))
}
