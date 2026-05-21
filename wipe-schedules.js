import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';
import * as path from 'path';

const newServiceAccountPath = path.resolve('new-service-account.json');
const newServiceAccount = JSON.parse(readFileSync(newServiceAccountPath, 'utf8'));

const app = initializeApp({
  credential: cert(newServiceAccount),
});

const db = getFirestore(app);

async function deleteCollection(collectionPath) {
  const collectionRef = db.collection(collectionPath);
  const query = collectionRef.orderBy('__name__').limit(500);

  return new Promise((resolve, reject) => {
    deleteQueryBatch(query, resolve).catch(reject);
  });
}

async function deleteQueryBatch(query, resolve) {
  const snapshot = await query.get();

  if (snapshot.size === 0) {
    resolve();
    return;
  }

  const batch = db.batch();
  snapshot.docs.forEach((doc) => {
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`Deleted batch of ${snapshot.size} schedules...`);

  process.nextTick(() => {
    deleteQueryBatch(query, resolve);
  });
}

async function main() {
  console.log('Deleting all schedules...');
  await deleteCollection('doctor_day_schedules');
  console.log('All schedules deleted successfully.');
  process.exit(0);
}

main();
