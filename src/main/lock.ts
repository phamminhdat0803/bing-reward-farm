// Khoa theo profile: chi mot tac vu duoc dung user-data-dir cua mot profile tai mot thoi diem.
// Ly do: Chromium bao "Opening in existing browser session" neu mo lan hai, va mo CDP vao luc
// dang co phien khac se khong len cong.
const locks = new Map<string, Promise<unknown>>()

export function withProfileLock<T>(profileId: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(profileId) ?? Promise.resolve()
  const run = prev.then(fn, fn)
  locks.set(
    profileId,
    run.catch(() => undefined)
  )
  return run
}
