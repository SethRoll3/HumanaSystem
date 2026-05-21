import { initializeApp, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { readFileSync } from 'fs';
import * as path from 'path';

const newServiceAccountPath = path.resolve('new-service-account.json');
const newServiceAccount = JSON.parse(readFileSync(newServiceAccountPath, 'utf8'));

// Initialize new app
const newApp = initializeApp({
  credential: cert(newServiceAccount)
}, 'newAppAuth');

const newAuth = getAuth(newApp);

const usersData = JSON.parse(readFileSync('users.json', 'utf8')).users;

const hashOptions = {
  hash: {
    algorithm: 'SCRYPT',
    key: Buffer.from('J+wgnl5naJo7UHpFgvpT0Pm3IqF4XM5QxCZV6dpqvSZ3ZOxutzxGXi/tZH2+VIuhNT1P5o3ubO1UAe9x9m++AQ==', 'base64'),
    saltSeparator: Buffer.from('Bw==', 'base64'),
    rounds: 8,
    memoryCost: 14,
  },
};

const usersToImport = usersData.map(u => ({
  uid: u.localId,
  email: u.email,
  emailVerified: u.emailVerified,
  passwordHash: u.passwordHash ? Buffer.from(u.passwordHash, 'base64') : undefined,
  passwordSalt: u.salt ? Buffer.from(u.salt, 'base64') : undefined,
  displayName: u.displayName || undefined,
  photoURL: u.photoUrl || undefined,
  disabled: u.disabled || false,
  metadata: {
    lastSignInTime: u.lastSignedInAt ? new Date(parseInt(u.lastSignedInAt)).toUTCString() : undefined,
    creationTime: u.createdAt ? new Date(parseInt(u.createdAt)).toUTCString() : undefined,
  }
}));

async function importUsers() {
  try {
    const result = await newAuth.importUsers(usersToImport, hashOptions);
    console.log(`Successfully imported ${result.successCount} users.`);
    if (result.failureCount > 0) {
      console.log(`Failed to import ${result.failureCount} users.`);
      result.errors.forEach((err) => {
        console.log(err.error.message);
      });
    }
    process.exit(0);
  } catch (error) {
    console.error('Error importing users:', error);
    process.exit(1);
  }
}

importUsers();
