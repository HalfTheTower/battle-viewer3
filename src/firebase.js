// firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCPJ0-2dDkdfOSQjVw505nq0CHzMfzgNiM",
  authDomain: "battlelog-4d4e9.firebaseapp.com",
  projectId: "battlelog-4d4e9",
  storageBucket: "battlelog-4d4e9.firebasestorage.app",
  messagingSenderId: "536489537804",
  appId: "1:536489537804:web:ba1eab8417831d56b0d929"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
