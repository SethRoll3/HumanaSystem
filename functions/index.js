const functions = require('firebase-functions');
const admin = require('firebase-admin');

if (!admin.apps.length) {
  admin.initializeApp();
}

exports.updateUserAuth = functions.https.onCall(async (data, context) => {
  try {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Autenticación requerida.');
    }
    const callerDoc = await admin.firestore().doc(`users/${context.auth.uid}`).get();
    const callerRole = callerDoc.exists ? callerDoc.data().role : null;
    if (callerRole !== 'admin') {
      throw new functions.https.HttpsError('permission-denied', 'Permisos insuficientes.');
    }
    const uid = data && typeof data.uid === 'string' ? data.uid.trim() : '';
    if (!uid) {
      throw new functions.https.HttpsError('invalid-argument', 'UID inválido.');
    }
    const updates = {};
    if (data.email && typeof data.email === 'string') {
      updates.email = data.email.trim();
    }
    if (data.password && typeof data.password === 'string') {
      if (data.password.trim().length < 6) {
        throw new functions.https.HttpsError('invalid-argument', 'Contraseña inválida.');
      }
      updates.password = data.password;
    }
    if (!Object.keys(updates).length) {
      return { ok: true };
    }
    await admin.auth().updateUser(uid, updates);
    return { ok: true };
  } catch (error) {
    console.error("Error in updateUserAuth:", error);
    // Return explicit error so it doesn't crash the container (which causes CORS)
    if (error instanceof functions.https.HttpsError) {
        throw error;
    }
    throw new functions.https.HttpsError('internal', error.message || 'Error interno del servidor');
  }
});
