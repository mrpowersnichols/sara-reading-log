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

// Someday books that came from Books We Love and aren't on the class shelf.
// item = { title, author, genre, cover }; pass the stored object back to remove it.
export async function addToSomedayExtra(studentId, item) {
  return updateDoc(doc(db, "students", studentId), { somedayExtra: arrayUnion(item) });
}
export async function removeFromSomedayExtra(studentId, item) {
  return updateDoc(doc(db, "students", studentId), { somedayExtra: arrayRemove(item) });
}

// ---------- Reading log ----------

export function subscribeReadingLog(classId, callback) {
  const q = query(collection(db, "readingLog"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))));
}

export async function addLogEntry(studentId, classId, { title, author, genre, dateStarted, isbn, cover, whyThisBook, interviewTechniques, priorKnowledge, totalPages, fromHome }) {
  return addDoc(collection(db, "readingLog"), {
    studentId, classId, title, author, genre,
    isbn: isbn || null, cover: cover || null,
    dateStarted, dateFinished: null, dateAbandoned: null,
    status: "reading", rating: null, review: null, reason: null,
    hook: null, setup: null, stakes: null, pitch: null,
    pagesReadAtAbandon: null, reflectionToAuthor: null, reflectionNextTime: null,
    whyThisBook: whyThisBook || "", interviewTechniques: interviewTechniques || [], priorKnowledge: priorKnowledge || "",
    totalPages: totalPages || null,
    fromHome: !!fromHome,
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

// Teacher-only (enforced by Firestore rules): hides a stalled-book flag until
// the book goes quiet again. Writes only stallDismissedAt, nothing else.
export async function dismissStall(entryIds, dateStr) {
  return Promise.all(entryIds.map((id) => updateDoc(doc(db, "readingLog", id), { stallDismissedAt: dateStr })));
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

export async function addLibraryBook(classId, { title, author, genre, isbn, cover, copies, totalPages, location }) {
  const bookRef = await addDoc(collection(db, "libraryBooks"), {
    classId, title, author, genre, isbn: isbn || null, cover: cover || null, totalPages: totalPages || null,
    location: location || null, createdAt: serverTimestamp(),
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

export async function updateLibraryBook(bookId, updates) {
  return updateDoc(doc(db, "libraryBooks", bookId), updates);
}

export async function addCopiesToBook(bookId, classId, n) {
  const writes = [];
  for (let i = 0; i < n; i++) {
    writes.push(addDoc(collection(db, "copies"), { bookId, classId, status: "available", holderStudentId: null, since: null }));
  }
  return Promise.all(writes);
}

export async function deleteCopy(copyId) {
  return deleteDoc(doc(db, "copies", copyId));
}

// Deletes a title and every one of its copies. Caller is responsible for
// confirming with the user first, especially if any copies are checked out.
export async function deleteLibraryBook(bookId, copyIds) {
  await Promise.all(copyIds.map((id) => deleteDoc(doc(db, "copies", id))));
  return deleteDoc(doc(db, "libraryBooks", bookId));
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

// Private conference notes attached to a status check-in. Kept in their own
// collection because readingStatus is readable by every student; the security
// rules make this one teacher-only. Only call subscribeStatusNotes for teachers.
export function subscribeStatusNotes(classId, callback) {
  const q = query(collection(db, "statusNotes"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => callback([]));
}

export async function addStatusNote(classId, { statusId, studentId, logEntryId, title, date, text, authorName }) {
  return addDoc(collection(db, "statusNotes"), {
    classId, statusId, studentId, logEntryId: logEntryId || "", title: title || "", date, text, authorName: authorName || "",
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
  followUpQuestion, followUpAnswer, thatStatement, enteredByName,
  kind, hook, setup, stakes, pitch,
  strategy, prompt, meaning, fixUps,
}) {
  const data = {
    classId, studentId, logEntryId, title, author,
    page: page ?? null, date, quote: quote || "", idea, tags,
    followUpQuestion: followUpQuestion || "", followUpAnswer: followUpAnswer || "", thatStatement: thatStatement || "",
    enteredByName: enteredByName || "",
    // kind: "booktalk" marks the entry a student writes when finishing a book.
    kind: kind || "",
    hook: hook || "", setup: setup || "", stakes: stakes || "", pitch: pitch || "",
    // Check-in entries (kind "checkin"): the strategy tile and prompt used, the
    // student's own meaning check, and any fix-up moves they chose.
    strategy: strategy || "", prompt: prompt || "", meaning: meaning || "", fixUps: fixUps || [],
    createdAt: serverTimestamp(),
  };
  // A book has exactly one booktalk entry: its id comes from the log entry, so
  // a second write for the same book can't make a duplicate. (The rules refuse
  // it, because it would be an update.) Callers treat that refusal as "already there".
  if (kind === "booktalk" && logEntryId) {
    return setDoc(doc(db, "vaultEntries", `booktalk_${logEntryId}`), data);
  }
  return addDoc(collection(db, "vaultEntries"), data);
}

export async function deleteVaultEntry(entryId) {
  return deleteDoc(doc(db, "vaultEntries", entryId));
}

// ---------- Vault comments (teacher feedback and student replies) ----------

// Teachers pass no studentId and get the whole class; a student passes their own
// id, since the security rules only let them read comments on their own entries.
export function subscribeVaultComments(classId, studentId, callback) {
  const q = studentId
    ? query(collection(db, "vaultComments"), where("classId", "==", classId), where("studentId", "==", studentId))
    : query(collection(db, "vaultComments"), where("classId", "==", classId));
  return onSnapshot(q, (snap) => callback(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => callback([]));
}

// studentId = the student who owns the Vault entry (not necessarily the author).
export async function addVaultComment(classId, { entryId, studentId, authorId, authorName, authorRole, text, date }) {
  return addDoc(collection(db, "vaultComments"), {
    classId, entryId, studentId, authorId, authorName: authorName || "", authorRole, text, date,
    createdAt: serverTimestamp(),
  });
}

// ---------- Class roster (for onboarding: who's expected vs. who's signed in) ----------

export function subscribeRoster(classId, callback) {
  return onSnapshot(doc(db, "classRoster", classId), (snap) => callback(snap.exists() ? (snap.data().students || []) : []));
}

// Teacher-edited Vault categories / questions / starters. If the doc doesn't
// exist (or can't be read yet), callers fall back to the built-in lists.
export function subscribeVaultConfig(classId, callback) {
  return onSnapshot(
    doc(db, "vaultConfig", classId),
    (snap) => callback(snap.exists() ? snap.data() : null),
    () => callback(null),
  );
}

export async function saveVaultConfig(classId, config) {
  return setDoc(doc(db, "vaultConfig", classId), { ...config, updatedAt: serverTimestamp() });
}

export async function resetVaultConfig(classId) {
  return deleteDoc(doc(db, "vaultConfig", classId));
}

export async function setRoster(classId, students) {
  return setDoc(doc(db, "classRoster", classId), { students, updatedAt: serverTimestamp() });
}
