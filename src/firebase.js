import { initializeApp } from 'firebase/app'
import { getFirestore } from 'firebase/firestore'

const firebaseConfig = {
  apiKey: "AIzaSyDphpDXXhSczuThMzV5BIHEdHKbcS7nJAg",
  authDomain: "aisultanmarket.firebaseapp.com",
  projectId: "aisultanmarket",
  storageBucket: "aisultanmarket.firebasestorage.app",
  messagingSenderId: "18948865168",
  appId: "1:18948865168:web:a251287c3bd17cdb492c15",
}

export const app = initializeApp(firebaseConfig)
export const db = getFirestore(app)
