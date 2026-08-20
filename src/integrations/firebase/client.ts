// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { 
  getFirestore, 
  enableIndexedDbPersistence 
} from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
const auth = getAuth(app);
const db = getFirestore(app);
const storage = getStorage(app);

// Enable offline persistence
try {
  enableIndexedDbPersistence(db)
    .then(() => console.log("Firebase Offline Persistence enabled."))
    .catch((err) => {
      if (err.code === 'failed-precondition') {
        console.warn("Multiple tabs open — persistence not enabled.");
      } else if (err.code === 'unimplemented') {
        console.warn("Browser does not support persistence.");
      }
    });
} catch (err) {
  console.error("Error enabling persistence:", err);
}

export { app, db, auth, storage };
