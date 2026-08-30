// Data-access layer for The Reading Log.
// This is the module the React app's next revision will import from —
// it swaps the current in-memory useState logic for real Firestore reads/writes.
// Every function here maps 1:1 to something the current prototype already does
// with local state, so wiring it in should mostly be a find-and-replace job.

import {
  collection, doc, addDoc, updateDoc, deleteDoc, setDoc, getDoc,
  query, where, onSnapshot, serverTimestamp, arrayUnion, arrayRemove,
} from "firebase/firestore";
import { db } from "./firebase";

// ---------- Students ----------

// Creates or updates the student doc for this Google account.
export async function ensureStudentDoc(studentId, name, email, classId) {
  await setDoc(doc(db, "students", studentId), { name, email, classId, createdAt: serverTimestamp() }, { merge: true });
}

export function subscribeStudents(classId, callback) {
  const q = query(collection(db, "students"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

// The "someday" list lives as an array field on the student's own doc,
// so no separate collection is needed for it.
export async function addToSomeday(studentId, bookId) {
  return updateDoc(doc(db, "students", studentId), { someday: arrayUnion(bookId) });
}
export async function removeFromSomeday(studentId, bookId) {
  return updateDoc(doc(db, "students", studentId), { someday: arrayRemove(bookId) });
}

// ---------- Reading log ----------

export function subscribeReadingLog(classId, callback) {
  const q = query(collection(db, "readingLog"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function addLogEntry(studentId, classId, { title, author, genre, dateStarted, isbn, cover, whyThisBook, interviewTechniques, priorKnowledge, totalPages }) {
  return addDoc(collection(db, "readingLog"), {
    studentId, classId, title, author, genre,
    isbn: isbn || null, cover: cover || null,
    dateStarted, dateFinished: null, dateAbandoned: null,
    status: "reading", rating: null, review: null, reason: null,
    hook: null, setup: null, stakes: null, pitch: null,
    pagesReadAtAbandon: null, reflectionToAuthor: null, reflectionNextTime: null,
    whyThisBook: whyThisBook || "", interviewTechniques: interviewTechniques || [], priorKnowledge: priorKnowledge || "",
    totalPages: totalPages || null,
    createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
  });
}

export async function finishEntry(entryId, { dateFinished, rating, hook, setup, stakes, pitch }) {
  return updateDoc(doc(db, "readingLog", entryId), {
    status: "finished", dateFinished, rating, hook, setup, stakes, pitch, updatedAt: serverTimestamp(),
  });
}

export async function abandonEntry(entryId, { dateAbandoned, reason, pagesReadAtAbandon, reflectionToAuthor, reflectionNextTime }) {
  return updateDoc(doc(db, "readingLog", entryId), {
    status: "abandoned", dateAbandoned, reason, pagesReadAtAbandon: pagesReadAtAbandon ?? null,
    reflectionToAuthor, reflectionNextTime, updatedAt: serverTimestamp(),
  });
}

export async function editEntry(entryId, updates) {
  return updateDoc(doc(db, "readingLog", entryId), { ...updates, updatedAt: serverTimestamp() });
}

export async function deleteEntry(entryId) {
  return deleteDoc(doc(db, "readingLog", entryId));
}

// ---------- Library ----------

export function subscribeLibraryBooks(classId, callback) {
  const q = query(collection(db, "libraryBooks"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export function subscribeCopies(classId, callback) {
  const q = query(collection(db, "copies"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function addLibraryBook(classId, { title, author, genre, isbn, cover, copies, totalPages }) {
  const bookRef = await addDoc(collection(db, "libraryBooks"), {
    classId, title, author, genre, isbn: isbn || null, cover: cover || null, totalPages: totalPages || null, createdAt: serverTimestamp(),
  });
  const writes = [];
  for (let i = 0; i < copies; i++) {
    writes.push(addDoc(collection(db, "copies"), {
      bookId: bookRef.id, classId, status: "available", holderStudentId: null, since: null,
    }));
  }
  await Promise.all(writes);
  return bookRef.id;
}

export async function checkOutCopy(copyId, studentId, since) {
  return updateDoc(doc(db, "copies", copyId), { status: "checked_out", holderStudentId: studentId, since });
}

export async function checkInCopy(copyId) {
  return updateDoc(doc(db, "copies", copyId), { status: "available", holderStudentId: null, since: null });
}

// Resets every copy in a class back to available — used by the Teacher View
// "Check In All Copies" button. Caller is responsible for confirming with the user first.
export async function bulkCheckIn(copyDocs) {
  return Promise.all(copyDocs.map((c) => checkInCopy(c.id)));
}

// ---------- Wishlist ----------

export function subscribeWishlist(classId, callback) {
  const q = query(collection(db, "wishlist"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function addWishlistRequest(classId, title, author, studentId) {
  return addDoc(collection(db, "wishlist"), {
    classId, title, author, votes: [studentId], createdAt: serverTimestamp(),
  });
}

export async function voteWishlist(wishId, studentId) {
  return updateDoc(doc(db, "wishlist", wishId), { votes: arrayUnion(studentId) });
}

// ---------- ISBN lookup (via the Cloudflare Worker, not Open Library directly) ----------

import { ISBN_LOOKUP_URL } from "./firebase";

export async function lookupISBN(isbn) {
  const clean = isbn.replace(/[^0-9Xx]/g, "");
  if (!clean) return null;
  const res = await fetch(`${ISBN_LOOKUP_URL}/?isbn=${clean}`);
  if (!res.ok) throw new Error("lookup failed");
  const data = await res.json();
  if (!data.found) return null;
  return { title: data.title, author: data.author, cover: data.cover, isbn: clean, subjects: data.subjects, pages: data.pages || null };
}

// Fuzzy title search for the autocomplete dropdown — returns up to 6 candidates.
export async function searchByTitle(query) {
  const q = query.trim();
  if (q.length < 3) return [];
  const res = await fetch(`${ISBN_LOOKUP_URL}/?title=${encodeURIComponent(q)}`);
  if (!res.ok) throw new Error("search failed");
  const data = await res.json();
  return data.results || [];
}

// ---------- Teacher status ----------

// Checks the allowlist doc at teachers/{email}. Managed by hand in the
// Firestore console — see the comment in firestore.rules.
export async function isTeacherEmail(email) {
  if (!email) return false;
  const snap = await getDoc(doc(db, "teachers", email));
  return snap.exists();
}

// ---------- Reading status (page/date check-ins for pace tracking) ----------

export function subscribeReadingStatus(classId, callback) {
  const q = query(collection(db, "readingStatus"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function addReadingStatus(classId, { studentId, logEntryId, title, page, date, note, mood, enteredByName }) {
  return addDoc(collection(db, "readingStatus"), {
    classId, studentId, logEntryId, title, page, date,
    note: note || "", mood: mood || "", enteredByName: enteredByName || "",
    createdAt: serverTimestamp(),
  });
}

// ---------- Thought Vault ----------

export function subscribeVaultEntries(classId, callback) {
  const q = query(collection(db, "vaultEntries"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function addVaultEntry(classId, {
  studentId, logEntryId, title, author, page, date, quote, idea, tags,
  followUpQuestion, followUpAnswer, enteredByName,
}) {
  return addDoc(collection(db, "vaultEntries"), {
    classId, studentId, logEntryId, title, author,
    page, date, quote: quote || "", idea, tags,
    followUpQuestion, followUpAnswer, enteredByName: enteredByName || "",
    createdAt: serverTimestamp(),
  });
}

// ---------- Class roster (for onboarding: who's expected vs. who's signed in) ----------

export function subscribeRoster(classId, callback) {
  return onSnapshot(doc(db, "classRoster", classId), (snap) => callback(snap.exists() ? (snap.data().students || []) : []));
}

export async function setRoster(classId, students) {
  return setDoc(doc(db, "classRoster", classId), { students, updatedAt: serverTimestamp() });
}
