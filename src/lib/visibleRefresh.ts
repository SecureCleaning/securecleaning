// One in-flight read per controller; a mutation during a read queues one fresh read.
export function createVisibleRefresh(options: {
  run: (signal: AbortSignal) => Promise<void>
  visible: () => boolean
  onError: (error: unknown) => void
}) {
  const abort = new AbortController()
  let running: Promise<void> | null = null
  let pending = false
  async function drain() {
    while (pending && !abort.signal.aborted && options.visible()) {
      pending = false
      try { await options.run(abort.signal) }
      catch (error) { if (!abort.signal.aborted) options.onError(error) }
    }
  }
  return {
    refresh() {
      if (abort.signal.aborted) return Promise.resolve()
      pending = true
      if (!running && options.visible()) running = drain().finally(() => { running = null })
      return running ?? Promise.resolve()
    },
    stop() { pending = false; abort.abort() },
  }
}
