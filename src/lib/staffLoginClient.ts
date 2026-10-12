const UNAVAILABLE = 'Sign-in is temporarily unavailable. Please try again shortly.'
const TIMEOUT = 'Sign-in took too long. Please wait a moment and try again.'

type LoginResult = { success: true; role: string; assigneeId: string | null }

export async function signInStaff(username: string, password: string, timeoutMs = 20_000): Promise<LoginResult> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const response = await fetch('/api/admin/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
      signal: controller.signal,
    })
    if (response.status === 429) throw new Error('Too many sign-in attempts. Please wait before trying again.')
    if (response.status >= 500) throw new Error(UNAVAILABLE)
    const result = await response.json().catch(() => null)
    if (!response.ok || result?.success !== true) {
      throw new Error(response.status === 401 ? 'Invalid username or password.' : UNAVAILABLE)
    }
    if (typeof result.role !== 'string' || (result.role === 'agent' && !result.assigneeId)) {
      throw new Error('This account is not linked to an agent portal. Please contact Secure Cleaning.')
    }
    return result
  } catch (error) {
    if (controller.signal.aborted) throw new Error(TIMEOUT)
    if (error instanceof TypeError) throw new Error('Unable to connect. Please check your connection and try again.')
    throw error
  } finally {
    clearTimeout(timer)
  }
}
