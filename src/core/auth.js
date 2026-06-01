/** Auth Google. Espone stato corrente + subscribe. */
import { auth, provider } from './firebase.js';
import {
    signInWithPopup, signOut, onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.6.0/firebase-auth.js";

let currentUser = null;
const subs = new Set();

onAuthStateChanged(auth, (user) => {
    currentUser = user;
    subs.forEach(fn => fn(user));
});

export const getUser = () => currentUser;
export const onAuth = (fn) => { subs.add(fn); if (currentUser !== undefined) fn(currentUser); return () => subs.delete(fn); };
export const login = () => signInWithPopup(auth, provider);
export const logout = () => signOut(auth);

/** Promise che risolve quando auth è pronto (primo stato noto). */
export function authReady() {
    if (auth.currentUser) return Promise.resolve(auth.currentUser);
    return new Promise(res => {
        const unsub = onAuthStateChanged(auth, u => { unsub(); res(u); });
    });
}
