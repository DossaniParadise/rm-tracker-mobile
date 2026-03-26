import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getDatabase } from 'firebase/database';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
    apiKey: "AIzaSyDf0W5a8UPpuZbo873nWfed6VvNExL4BjM",
    authDomain: "dossani-paradise-rm-tracker.firebaseapp.com",
    databaseURL: "https://dossani-paradise-rm-tracker-default-rtdb.firebaseio.com",
    projectId: "dossani-paradise-rm-tracker",
    storageBucket: "dossani-paradise-rm-tracker.firebasestorage.app",
    messagingSenderId: "328034984226",
    appId: "1:328034984226:web:2b2ddb58d935bec201857b"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
