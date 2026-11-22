export interface AdminVerifier {
  verifyUser(): Promise<{ userId: string | null; error?: unknown }>;
  checkAdmin(): Promise<{ isAdmin: boolean; error?: unknown }>;
}

export type AdminAuthorization =
  | { ok: true; userId: string }
  | { ok: false; status: 401 | 403 | 500; message: string };

export async function authorizeAdmin(
  authorization: string | null,
  createVerifier: (accessToken: string) => AdminVerifier,
): Promise<AdminAuthorization> {
  const match = authorization?.match(/^Bearer\s+(\S+)$/i);
  if (!match) return { ok: false, status: 401, message: 'Authentication required' };

  try {
    const verifier = createVerifier(match[1]);
    const user = await verifier.verifyUser();
    if (user.error || !user.userId) {
      return { ok: false, status: 401, message: 'Authentication required' };
    }

    const admin = await verifier.checkAdmin();
    if (admin.error) {
      return { ok: false, status: 500, message: 'Could not verify administrator access' };
    }
    if (!admin.isAdmin) {
      return { ok: false, status: 403, message: 'Administrator access required' };
    }

    return { ok: true, userId: user.userId };
  } catch {
    return { ok: false, status: 500, message: 'Could not verify administrator access' };
  }
}