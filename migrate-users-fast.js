import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import * as path from 'path';

const oldServiceAccountPath = path.resolve('old-service-account.json');
const newServiceAccountPath = path.resolve('new-service-account.json');

const oldServiceAccount = JSON.parse(readFileSync(oldServiceAccountPath, 'utf8'));
const newServiceAccount = JSON.parse(readFileSync(newServiceAccountPath, 'utf8'));

// Initialize old app
const oldApp = initializeApp({
  credential: cert(oldServiceAccount)
}, 'oldAppFast');

// Initialize new app
const newApp = initializeApp({
  credential: cert(newServiceAccount)
}, 'newAppFast');

const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

async function migrateUsers() {
  console.log('Migrating users collection fast...');
  const snapshot = await oldDb.collection('users').get();
  let count = 0;
  for (const doc of snapshot.docs) {
    await newDb.collection('users').doc(doc.id).set(doc.data());
    count++;
  }
  console.log(`Copied ${count} users.`);
  process.exit(0);
}

migrateUsers();
