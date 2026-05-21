import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';
import * as path from 'path';

const oldServiceAccountPath = path.resolve('old-service-account.json');
const newServiceAccountPath = path.resolve('new-service-account.json');

const oldServiceAccount = JSON.parse(readFileSync(oldServiceAccountPath, 'utf8'));
const newServiceAccount = JSON.parse(readFileSync(newServiceAccountPath, 'utf8'));

// Initialize old app
const oldApp = initializeApp({
  credential: cert(oldServiceAccount),
  storageBucket: oldServiceAccount.project_id + '.appspot.com'
}, 'oldApp');

// Initialize new app
const newApp = initializeApp({
  credential: cert(newServiceAccount),
  storageBucket: newServiceAccount.project_id + '.appspot.com'
}, 'newApp');

const oldDb = getFirestore(oldApp);
const newDb = getFirestore(newApp);

const oldStorage = getStorage(oldApp);
const newStorage = getStorage(newApp);

async function copyCollection(sourceCollectionRef, targetCollectionRef) {
  const snapshot = await sourceCollectionRef.get();
  let count = 0;
  for (const doc of snapshot.docs) {
    await targetCollectionRef.doc(doc.id).set(doc.data());
    
    // Copy subcollections
    const subcollections = await doc.ref.listCollections();
    for (const subcollection of subcollections) {
      await copyCollection(subcollection, targetCollectionRef.doc(doc.id).collection(subcollection.id));
    }
    count++;
  }
  return count;
}

const collectionsToMigrate = [
  'notifications',
  'pathologies',
  'patients',
  'pharmacy_sales_reports',
  'quality_reviews',
  'specialties',
  'specialty_forms',
  'system_counters',
  'system_settings',
  'users'
];

async function migrateFirestore() {
  console.log('Resuming Firestore Migration...');
  
  for (const collectionId of collectionsToMigrate) {
    console.log(`Migrating collection: ${collectionId}...`);
    const count = await copyCollection(oldDb.collection(collectionId), newDb.collection(collectionId));
    console.log(`Copied ${count} documents for collection ${collectionId}.`);
  }
  console.log('Firestore Migration Complete.');
}

async function migrateStorage() {
  console.log('Starting Storage Migration...');
  const sourceBucket = oldStorage.bucket();
  const destBucket = newStorage.bucket();

  const [files] = await sourceBucket.getFiles();
  console.log(`Found ${files.length} files in Storage.`);

  for (const file of files) {
    const destFile = destBucket.file(file.name);
    const [exists] = await destFile.exists();
    if (!exists) {
        console.log(`Copying file: ${file.name}...`);
        const [fileBuffer] = await file.download();
        await destFile.save(fileBuffer, {
        metadata: {
            contentType: file.metadata.contentType,
        }
        });
    } else {
        console.log(`Skipping file: ${file.name} (Already exists)`);
    }
  }
  
  console.log('Storage Migration Complete.');
}

async function main() {
  try {
    await migrateFirestore();
    await migrateStorage();
    console.log('All migrations completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
