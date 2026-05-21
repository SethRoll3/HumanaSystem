import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import * as path from 'path';

const oldServiceAccountPath = path.resolve('old-service-account.json');
const newServiceAccountPath = path.resolve('new-service-account.json');

const oldServiceAccount = JSON.parse(readFileSync(oldServiceAccountPath, 'utf8'));
const newServiceAccount = JSON.parse(readFileSync(newServiceAccountPath, 'utf8'));

const oldApp = initializeApp({ credential: cert(oldServiceAccount) }, 'oldAppStatus');
const newApp = initializeApp({ credential: cert(newServiceAccount) }, 'newAppStatus');

const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

async function checkStatus() {
  const collections = await oldDb.listCollections();
  
  for (const collection of collections) {
    const oldSnap = await oldDb.collection(collection.id).count().get();
    const newSnap = await newDb.collection(collection.id).count().get();
    
    console.log(`Collection: ${collection.id} -> Old: ${oldSnap.data().count}, New: ${newSnap.data().count}`);
  }
  process.exit(0);
}

checkStatus();
