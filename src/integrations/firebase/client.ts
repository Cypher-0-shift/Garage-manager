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
  apiKey: "AIzaSyAznJUaTZn6IHJ8FaEyuXpvIqrkY4WpSpE",
  authDomain: "garage-manager-115b0.firebaseapp.com",
  projectId: "garage-manager-115b0",
  storageBucket: "garage-manager-115b0.firebasestorage.app", 
  messagingSenderId: "242966721788",
  appId: "1:242966721788:web:d339748015ba01a5089379"
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
