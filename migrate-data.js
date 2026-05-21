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

async function migrateFirestore() {
  console.log('Starting Firestore Migration...');
  const collections = await oldDb.listCollections();
  
  for (const collection of collections) {
    console.log(`Migrating collection: ${collection.id}...`);
    const count = await copyCollection(collection, newDb.collection(collection.id));
    console.log(`Copied ${count} documents for collection ${collection.id}.`);
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
    console.log(`Copying file: ${file.name}...`);
    const destFile = destBucket.file(file.name);
    
    // Check if the destination bucket already has the file (optional optimization)
    // but we will just overwrite to be safe.
    
    // Download to memory buffer and upload
    const [fileBuffer] = await file.download();
    await destFile.save(fileBuffer, {
      metadata: {
        contentType: file.metadata.contentType,
      }
    });
    
    // If we want to keep it public, we could do:
    // await destFile.makePublic();
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
