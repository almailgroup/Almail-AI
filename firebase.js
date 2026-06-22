import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

import { getFirestore } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

const firebaseConfig = {
  // ← PASTE YOUR REAL FIREBASE CONFIG HERE
  apiKey: "AIzaSyDBD6WhVr38XJRubzcI1S_75EqIUIi2r0o",
  authDomain: "azsco-ai.firebaseapp.com",
  projectId: "azsco-ai",
  storageBucket: "azsco-ai.firebasestorage.app",
  messagingSenderId: "938850504673",
  appId: "1:938850504673:web:b0f9e3ab5615079c940ca0"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const db = getFirestore(app);

export {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
};