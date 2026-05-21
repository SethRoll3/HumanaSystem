
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";
import { getFunctions } from "firebase/functions";

export const firebaseConfig = {
  apiKey: "AIzaSyBtwC_KKs0XPtsU3BlrxOCs2mZ6EctNBFs",
  authDomain: "asociacionhumanasys.firebaseapp.com",
  projectId: "asociacionhumanasys",
  storageBucket: "asociacionhumanasys.firebasestorage.app",
  messagingSenderId: "309508795879",
  appId: "1:309508795879:web:c48096859ea67991b7a142"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const functions = getFunctions(app, "us-central1");
export default app;
