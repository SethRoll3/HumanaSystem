
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { getStorage } from "firebase/storage";

export const firebaseConfig = {
  apiKey: "AIzaSyDVnHdVLhqCQxisnI4pqUh4-HsF4za6wjI",
  authDomain: "sistema-hospital-farmacia.firebaseapp.com",
  projectId: "sistema-hospital-farmacia",
  storageBucket: "sistema-hospital-farmacia.firebasestorage.app", // Reverted to standard Firebase bucket domain
  messagingSenderId: "60902139396",
  appId: "1:60902139396:web:c977b1cf642d3cc57c3751"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export default app;
