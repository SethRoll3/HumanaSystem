import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';
import * as path from 'path';

const oldServiceAccountPath = path.resolve('old-service-account.json');
const oldServiceAccount = JSON.parse(readFileSync(oldServiceAccountPath, 'utf8'));

const newServiceAccountPath = path.resolve('new-service-account.json');
const newServiceAccount = JSON.parse(readFileSync(newServiceAccountPath, 'utf8'));

const oldApp = initializeApp({
  credential: cert(oldServiceAccount),
  storageBucket: oldServiceAccount.project_id + '.appspot.com'
}, 'oldApp');

const newApp = initializeApp({
  credential: cert(newServiceAccount),
  // Note the new project uses .firebasestorage.app, let's try that or just appspot
  storageBucket: newServiceAccount.project_id + '.firebasestorage.app'
}, 'newApp');

const oldStorage = getStorage(oldApp);
const newStorage = getStorage(newApp);

async function testStorage() {
  try {
    const buckets = await oldStorage.bucket().getFiles({ maxResults: 10 });
    console.log(`[Old] Files in .appspot.com:`, buckets[0].length);
  } catch (e) {
    console.error(`[Old] Error with .appspot.com:`, e.message);
  }

  try {
    const oldAppAlt = initializeApp({
      credential: cert(oldServiceAccount),
      storageBucket: oldServiceAccount.project_id + '.firebasestorage.app'
    }, 'oldAppAlt');
    const oldStorageAlt = getStorage(oldAppAlt);
    const buckets = await oldStorageAlt.bucket().getFiles({ maxResults: 10 });
    console.log(`[Old] Files in .firebasestorage.app:`, buckets[0].length);
  } catch (e) {
    console.error(`[Old] Error with .firebasestorage.app:`, e.message);
  }

  try {
    const buckets = await newStorage.bucket().getFiles({ maxResults: 10 });
    console.log(`[New] Files in .firebasestorage.app:`, buckets[0].length);
  } catch (e) {
    console.error(`[New] Error with .firebasestorage.app:`, e.message);
  }

  try {
    const newAppAlt = initializeApp({
      credential: cert(newServiceAccount),
      storageBucket: newServiceAccount.project_id + '.appspot.com'
    }, 'newAppAlt');
    const newStorageAlt = getStorage(newAppAlt);
    const buckets = await newStorageAlt.bucket().getFiles({ maxResults: 10 });
    console.log(`[New] Files in .appspot.com:`, buckets[0].length);
  } catch (e) {
    console.error(`[New] Error with .appspot.com:`, e.message);
  }

  process.exit(0);
}

testStorage();
