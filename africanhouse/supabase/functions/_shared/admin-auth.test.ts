import { authorizeAdmin, AdminVerifier } from './admin-auth';

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

async function run(): Promise<void> {
  let verifierCreated = false;
  const missing = await authorizeAdmin(null, () => {
    verifierCreated = true;
    return {} as AdminVerifier;
  });
  assert(!missing.ok && missing.status === 401, 'missing bearer token must be rejected');
  assert(!verifierCreated, 'missing bearer token must not create an auth client');

  const invalidUser = await authorizeAdmin('Bearer invalid', () => ({
    verifyUser: async () => ({ userId: null, error: new Error('invalid') }),
    checkAdmin: async () => ({ isAdmin: true }),
  }));
  assert(!invalidUser.ok && invalidUser.status === 401, 'invalid user must be rejected');

  const nonAdmin = await authorizeAdmin('Bearer user-token', () => ({
    verifyUser: async () => ({ userId: 'user-1' }),
    checkAdmin: async () => ({ isAdmin: false }),
  }));
  assert(!nonAdmin.ok && nonAdmin.status === 403, 'non-admin user must be rejected');

  const adminCheckFailure = await authorizeAdmin('Bearer user-token', () => ({
    verifyUser: async () => ({ userId: 'user-1' }),
    checkAdmin: async () => ({ isAdmin: false, error: new Error('rpc failed') }),
  }));
  assert(!adminCheckFailure.ok && adminCheckFailure.status === 500, 'admin RPC failure must fail closed');

  const admin = await authorizeAdmin('Bearer admin-token', token => ({
    verifyUser: async () => ({ userId: token === 'admin-token' ? 'admin-1' : null }),
    checkAdmin: async () => ({ isAdmin: true }),
  }));
  assert(admin.ok && admin.userId === 'admin-1', 'verified administrator must be allowed');
}

void run();