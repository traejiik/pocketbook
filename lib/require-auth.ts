import { auth } from '@/lib/auth'

export async function requireAuthenticatedUser() {
  const session = await auth()
  if (!session?.user) throw new Error('Unauthorised')
  return session.user
}
