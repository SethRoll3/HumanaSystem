import { initializeApp, cert } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync, unlinkSync } from 'fs';
import * as path from 'path';

const oldServiceAccountPath = path.resolve('old-service-account.json');
const newServiceAccountPath = path.resolve('new-service-account.json');

const oldServiceAccount = JSON.parse(readFileSync(oldServiceAccountPath, 'utf8'));
const newServiceAccount = JSON.parse(readFileSync(newServiceAccountPath, 'utf8'));

// Initialize old app
const oldApp = initializeApp({
  credential: cert(oldServiceAccount),
  storageBucket: oldServiceAccount.project_id + '.firebasestorage.app'
}, 'oldApp');

// Initialize new app
const newApp = initializeApp({
  credential: cert(newServiceAccount),
  storageBucket: newServiceAccount.project_id + '.firebasestorage.app'
}, 'newApp');

const oldStorage = getStorage(oldApp);
const newStorage = getStorage(newApp);

async function asyncPool(poolLimit, array, iteratorFn) {
  const ret = [];
  const executing = [];
  for (const item of array) {
    const p = Promise.resolve().then(() => iteratorFn(item, array));
    ret.push(p);

    if (poolLimit <= array.length) {
      const e = p.then(() => executing.splice(executing.indexOf(e), 1));
      executing.push(e);
      if (executing.length >= poolLimit) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(ret);
}

let copiedCount = 0;
let skippedCount = 0;
let errorCount = 0;

async function copyFile(file, destBucket) {
  const destFile = destBucket.file(file.name);
  
  try {
    const [exists] = await destFile.exists();
    if (exists) {
      skippedCount++;
      if (skippedCount % 100 === 0) console.log(`Skipped ${skippedCount} existing files...`);
      return; 
    }

    const tempFilePath = path.resolve(`./temp_${Date.now()}_${Math.floor(Math.random()*100000)}.tmp`);
    
    try {
      await file.download({ destination: tempFilePath });
      await destBucket.upload(tempFilePath, {
        destination: file.name,
        metadata: { contentType: file.metadata.contentType }
      });
      copiedCount++;
      if (copiedCount % 50 === 0) console.log(`Copied ${copiedCount} files...`);
    } finally {
      try { unlinkSync(tempFilePath); } catch(e){}
    }
  } catch (e) {
    console.error(`Error processing ${file.name}:`, e.message);
    errorCount++;
  }
}

async function migrateStorage() {
  console.log('Starting Storage Migration...');
  const sourceBucket = oldStorage.bucket();
  const destBucket = newStorage.bucket();

  console.log(`Reading files from ${sourceBucket.name}...`);
  const [files] = await sourceBucket.getFiles();
  console.log(`Found ${files.length} files in Storage.`);

  console.log('Migrating files with concurrency of 10...');
  await asyncPool(10, files, (file) => copyFile(file, destBucket));
  
  console.log(`\nStorage Migration Complete.`);
  console.log(`Copied: ${copiedCount}`);
  console.log(`Skipped: ${skippedCount}`);
  console.log(`Errors: ${errorCount}`);
}

async function main() {
  try {
    await migrateStorage();
    process.exit(0);
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  }
}

main();
