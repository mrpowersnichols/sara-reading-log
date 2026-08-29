import React, { useState, useEffect, useMemo, useRef } from "react";
import { BookOpen, Plus, Star, X, Library, ListChecks, Users, ChevronRight, BookMarked, RotateCcw, Search, Flag, Barcode, Heart, Pencil, Trash2, Sparkles, RefreshCw, AlertTriangle, TrendingUp, Award, MessageSquare, Archive } from "lucide-react";
import { watchAuthState, signInWithGoogle, signOutUser, SCHOOL_DOMAIN } from "./firebase";
import {
  ensureStudentDoc, subscribeStudents, addToSomeday, removeFromSomeday,
  subscribeReadingLog, addLogEntry, finishEntry, abandonEntry, editEntry, deleteEntry,
  subscribeLibraryBooks, subscribeCopies, addLibraryBook as fsAddLibraryBook, checkOutCopy, checkInCopy, bulkCheckIn as fsBulkCheckIn,
  subscribeWishlist, addWishlistRequest, voteWishlist as fsVoteWishlist,
  lookupISBN, searchByTitle, isTeacherEmail, subscribeReadingStatus, addReadingStatus,
  subscribeVaultEntries, addVaultEntry,
} from "./firestore-data-layer";

// TODO: once you're running more than one class period through this, swap this
// constant for a real class-switcher (e.g. a code students enter, or a
// subdomain/query-param per class). Every Firestore doc is already tagged with
// classId, so the data model doesn't need to change — only this line does.
const CLASS_ID = "default";

// ---------- Design tokens ----------
const STYLES = `
  .rl-root {
    --paper: #EDE6D6;
    --paper-card: #F7F2E6;
    --ink: #2B2E26;
    --ink-soft: #5B5A4E;
    --green: #3F5B4F;
    --green-deep: #2C4239;
    --brass: #A9803F;
    --brass-light: #C9A56A;
    --rust: #A64B2A;
    --line: #C9BFA6;
    font-family: Georgia, 'Times New Roman', serif;
    background: var(--paper);
    color: var(--ink);
    min-height: 100%;
    padding: 0;
  }
  .rl-shell { max-width: 1020px; margin: 0 auto; padding: 28px 20px 60px; }
  .rl-header { display: flex; align-items: baseline; justify-content: space-between; flex-wrap: wrap; gap: 12px; border-bottom: 3px double var(--green-deep); padding-bottom: 14px; margin-bottom: 4px; }
  .rl-title { font-size: 28px; font-weight: 700; letter-spacing: 0.3px; color: var(--green-deep); }
  .rl-title small { display: block; font-family: 'Courier New', monospace; font-size: 11px; letter-spacing: 2px; text-transform: uppercase; color: var(--brass); margin-top: 2px; }
  .rl-student { font-family: 'Courier New', monospace; font-size: 12px; color: var(--ink-soft); }

  .rl-shelf { display: flex; gap: 6px; margin: 22px 0 24px; border-bottom: 4px solid var(--green-deep); }
  .rl-spine {
    flex: 1; cursor: pointer; border: none; border-top-left-radius: 4px; border-top-right-radius: 4px;
    padding: 14px 6px 10px; font-family: 'Courier New', monospace; font-size: 12px; letter-spacing: 1px;
    text-transform: uppercase; display: flex; flex-direction: column; align-items: center; gap: 6px;
    color: var(--paper-card); background: var(--ink-soft); opacity: 0.55; transition: opacity 0.15s, transform 0.1s;
  }
  .rl-spine:hover { opacity: 0.8; }
  .rl-spine.active { opacity: 1; background: var(--green-deep); transform: translateY(-2px); }
  .rl-spine svg { width: 16px; height: 16px; }

  .rl-note { font-family: 'Courier New', monospace; font-size: 11.5px; color: var(--ink-soft); background: var(--paper-card); border: 1px dashed var(--line); padding: 8px 12px; border-radius: 3px; margin-bottom: 20px; }

  .rl-section-title { display: flex; align-items: center; gap: 8px; font-size: 15px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--green-deep); margin: 26px 0 12px; font-family: 'Courier New', monospace; }
  .rl-section-title .rl-count { background: var(--brass); color: var(--paper-card); font-size: 10px; padding: 1px 7px; border-radius: 10px; }

  .rl-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 14px; }

  .rl-card {
    background: var(--paper-card); border: 1px solid var(--line); border-left: 5px solid var(--green);
    border-radius: 3px; padding: 12px 14px 12px; box-shadow: 1px 2px 0 rgba(43,46,38,0.05);
  }
  .rl-card.abandoned { border-left-color: var(--rust); opacity: 0.9; }
  .rl-card-body { display: flex; gap: 10px; }
  .rl-cover { width: 44px; height: 64px; object-fit: cover; border: 1px solid var(--line); border-radius: 2px; background: #ddd6c4; flex-shrink: 0; }
  .rl-cover-fallback { width: 44px; height: 64px; flex-shrink: 0; border: 1px solid var(--line); border-radius: 2px; background: var(--green); color: var(--paper-card); display: flex; align-items: center; justify-content: center; font-family: Georgia, serif; font-weight: 700; font-size: 18px; }
  .rl-card-text { flex: 1; min-width: 0; }
  .rl-card-title { font-weight: 700; font-size: 15px; line-height: 1.25; }
  .rl-card-author { font-size: 12.5px; color: var(--ink-soft); margin-top: 1px; }
  .rl-tagrow { display: flex; align-items: center; justify-content: space-between; margin-top: 8px; font-family: 'Courier New', monospace; font-size: 10.5px; color: var(--ink-soft); flex-wrap: wrap; gap: 4px; }
  .rl-genre-tag { background: var(--green); color: var(--paper-card); padding: 2px 7px; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.5px; }
  .rl-reason-tag { background: var(--rust); color: var(--paper-card); padding: 2px 7px; border-radius: 2px; text-transform: uppercase; letter-spacing: 0.5px; font-size: 10px; margin-top: 6px; display: inline-block; }
  .rl-flag { background: var(--rust); color: #fff; font-family: 'Courier New', monospace; font-size: 10px; padding: 3px 7px; border-radius: 2px; margin-top: 8px; display: inline-flex; align-items: center; gap: 4px; }
  .rl-btnrow { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }

  .rl-btn { font-family: 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; border: 1px solid var(--green-deep); background: transparent; color: var(--green-deep); padding: 6px 9px; border-radius: 2px; cursor: pointer; display: flex; align-items: center; gap: 5px; }
  .rl-btn:hover { background: var(--green-deep); color: var(--paper-card); }
  .rl-btn.solid { background: var(--green-deep); color: var(--paper-card); }
  .rl-btn.solid:hover { background: var(--green); }
  .rl-btn.rust { border-color: var(--rust); color: var(--rust); }
  .rl-btn.rust:hover { background: var(--rust); color: var(--paper-card); }
  .rl-btn.small { padding: 4px 7px; font-size: 10px; }
  .rl-btn:disabled { opacity: 0.4; cursor: not-allowed; }
  .rl-btn:disabled:hover { background: transparent; color: var(--green-deep); }

  .rl-stars { display: flex; align-items: center; gap: 2px; margin-top: 8px; }
  .rl-stars span { font-family: 'Courier New', monospace; font-size: 11px; color: var(--brass); margin-left: 4px; }
  .rl-review { font-size: 12.5px; line-height: 1.5; margin-top: 8px; font-style: italic; color: var(--ink); border-top: 1px dotted var(--line); padding-top: 8px; }

  .rl-empty { font-family: 'Courier New', monospace; font-size: 12px; color: var(--ink-soft); padding: 18px; border: 1px dashed var(--line); border-radius: 3px; text-align: center; }

  .rl-overlay { position: fixed; inset: 0; background: rgba(43,46,38,0.45); display: flex; align-items: center; justify-content: center; z-index: 40; padding: 16px; overflow-y: auto; }
  .rl-modal { background: var(--paper-card); border: 1px solid var(--line); border-top: 6px solid var(--green-deep); width: 100%; max-width: 440px; padding: 20px; border-radius: 3px; position: relative; margin: auto; }
  .rl-modal h3 { font-size: 17px; margin-bottom: 12px; color: var(--green-deep); }
  .rl-close { position: absolute; top: 12px; right: 12px; cursor: pointer; color: var(--ink-soft); background: none; border: none; }
  .rl-field { margin-bottom: 12px; }
  .rl-field label { display: block; font-family: 'Courier New', monospace; font-size: 10.5px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-soft); margin-bottom: 4px; }
  .rl-field input, .rl-field select, .rl-field textarea { width: 100%; padding: 7px 9px; border: 1px solid var(--line); border-radius: 2px; background: #fff; font-family: Georgia, serif; font-size: 13.5px; color: var(--ink); }
  .rl-field textarea { min-height: 70px; resize: vertical; }
  .rl-isbn-row { display: flex; gap: 6px; }
  .rl-isbn-row input { flex: 1; }
  .rl-isbn-status { font-family: 'Courier New', monospace; font-size: 10.5px; margin-top: 5px; color: var(--ink-soft); }
  .rl-autocomplete-wrap { position: relative; }
  .rl-autocomplete-list { position: absolute; top: 100%; left: 0; right: 0; z-index: 30; background: #fff; border: 1px solid var(--line); border-top: none; border-radius: 0 0 3px 3px; max-height: 220px; overflow-y: auto; box-shadow: 0 4px 10px rgba(43,46,38,0.15); }
  .rl-autocomplete-item { display: flex; align-items: center; gap: 8px; padding: 7px 9px; cursor: pointer; font-size: 13px; border-bottom: 1px solid var(--paper); }
  .rl-autocomplete-item:last-child { border-bottom: none; }
  .rl-autocomplete-item:hover { background: var(--paper); }
  .rl-autocomplete-item img { width: 24px; height: 34px; object-fit: cover; flex-shrink: 0; background: #ddd6c4; }
  .rl-autocomplete-item .a { color: var(--ink-soft); font-size: 11.5px; }
  .rl-rating-row { display: flex; gap: 4px; flex-wrap: wrap; }
  .rl-rate-pip { width: 26px; height: 26px; border-radius: 50%; border: 1px solid var(--brass); background: transparent; color: var(--brass); font-family: 'Courier New', monospace; font-size: 11px; cursor: pointer; }
  .rl-rate-pip.on { background: var(--brass); color: #fff; }

  .rl-lib-recos { background: var(--green-deep); color: var(--paper-card); border-radius: 4px; padding: 14px 16px; margin-bottom: 20px; }
  .rl-lib-recos h4 { font-family: 'Courier New', monospace; font-size: 11px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--brass-light); margin-bottom: 8px; }
  .rl-reco-list { display: flex; gap: 10px; flex-wrap: wrap; }
  .rl-reco-pill { background: rgba(255,255,255,0.08); border: 1px solid rgba(255,255,255,0.25); padding: 6px 10px; border-radius: 3px; font-size: 12.5px; display: flex; align-items: center; gap: 8px; }

  .rl-stat-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; margin-bottom: 22px; }
  .rl-stat { background: var(--paper-card); border: 1px solid var(--line); border-radius: 3px; padding: 12px 14px; }
  .rl-stat.clickable { cursor: pointer; transition: border-color 0.15s; }
  .rl-stat.clickable:hover { border-color: var(--green-deep); }
  .rl-stat .num { font-size: 24px; font-weight: 700; color: var(--green-deep); }
  .rl-stat .label { font-family: 'Courier New', monospace; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--ink-soft); }

  .rl-bar-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; font-family: 'Courier New', monospace; font-size: 11.5px; }
  .rl-bar-label { width: 150px; flex-shrink: 0; color: var(--ink-soft); }
  .rl-bar-track { flex: 1; background: var(--line); height: 12px; border-radius: 2px; overflow: hidden; }
  .rl-bar-fill { background: var(--green); height: 100%; }
  .rl-bar-fill.rust { background: var(--rust); }
  .rl-bar-val { width: 24px; text-align: right; color: var(--ink-soft); }

  .rl-student-row { display: flex; align-items: center; justify-content: space-between; padding: 9px 12px; background: var(--paper-card); border: 1px solid var(--line); border-radius: 3px; margin-bottom: 6px; font-size: 13px; }
  .rl-student-row .name { font-weight: 700; }
  .rl-student-row .meta { font-family: 'Courier New', monospace; font-size: 10.5px; color: var(--ink-soft); }

  .rl-filter-bar { display: flex; gap: 8px; margin-bottom: 16px; flex-wrap: wrap; align-items: center; }
  .rl-filter-bar input, .rl-filter-bar select { font-family: 'Courier New', monospace; font-size: 12px; padding: 7px 9px; border: 1px solid var(--line); border-radius: 2px; background: var(--paper-card); color: var(--ink); }
  .rl-filter-bar label { font-family: 'Courier New', monospace; font-size: 11px; color: var(--ink-soft); display: flex; align-items: center; gap: 5px; }

  .rl-copy-dots { display: flex; gap: 4px; margin-top: 8px; }
  .rl-dot { width: 11px; height: 11px; border-radius: 50%; background: var(--line); border: 1px solid var(--ink-soft); }
  .rl-dot.avail { background: var(--green); border-color: var(--green-deep); }
  .rl-dot.out { background: var(--brass); border-color: var(--brass); }

  .rl-wish-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; background: var(--paper-card); border: 1px solid var(--line); border-left: 4px solid var(--brass); border-radius: 3px; padding: 10px 12px; margin-bottom: 8px; flex-wrap: wrap; }
  .rl-wish-row .info { font-size: 13px; }
  .rl-wish-row .info .t { font-weight: 700; }
  .rl-wish-row .info .a { color: var(--ink-soft); font-size: 12px; }
  .rl-wish-row .votes { font-family: 'Courier New', monospace; font-size: 11px; color: var(--brass); display: flex; align-items: center; gap: 6px; }

  .rl-checkout-row { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 8px 12px; border-bottom: 1px dotted var(--line); font-size: 12.5px; }
  .rl-checkout-row:last-child { border-bottom: none; }
  .rl-checkout-row .who { font-weight: 700; }
  .rl-checkout-row .days { font-family: 'Courier New', monospace; font-size: 11px; color: var(--rust); }

  .rl-icon-btn { border: 1px solid var(--line); background: var(--paper-card); color: var(--ink-soft); width: 24px; height: 24px; border-radius: 2px; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0; }
  .rl-icon-btn:hover { border-color: var(--green-deep); color: var(--green-deep); }
  .rl-icon-btn.danger:hover { border-color: var(--rust); color: var(--rust); }
  .rl-card-corner { display: flex; gap: 4px; margin-left: auto; }

  .rl-identity { background: linear-gradient(135deg, var(--green-deep), var(--green)); color: var(--paper-card); border-radius: 4px; padding: 16px 18px; margin-bottom: 22px; display: flex; flex-wrap: wrap; gap: 22px; align-items: center; }
  .rl-identity h4 { font-family: 'Courier New', monospace; font-size: 10.5px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--brass-light); margin-bottom: 10px; width: 100%; display: flex; align-items: center; gap: 6px; }
  .rl-identity-stat { text-align: left; }
  .rl-identity-stat .num { font-size: 20px; font-weight: 700; }
  .rl-identity-stat .label { font-family: 'Courier New', monospace; font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.85; }

  .rl-social-proof { font-family: 'Courier New', monospace; font-size: 10px; color: var(--brass); margin-top: 6px; display: flex; align-items: center; gap: 4px; }

  .rl-spoiler-hint { display: flex; align-items: flex-start; gap: 6px; font-family: 'Courier New', monospace; font-size: 10px; color: var(--ink-soft); margin-top: 5px; }
  .rl-spoiler-hint.warn { color: var(--rust); }

  .rl-bulk-bar { display: flex; justify-content: flex-end; margin-bottom: 4px; }

  .rl-gate { min-height: 60vh; display: flex; align-items: center; justify-content: center; }

  .rl-poster-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; margin-bottom: 24px; }
  .rl-poster-card { background: var(--paper-card); border: 1px solid var(--line); border-radius: 4px; overflow: hidden; box-shadow: 2px 3px 0 rgba(43,46,38,0.08); text-align: center; }
  .rl-poster-rank { background: var(--green-deep); color: var(--paper-card); font-family: 'Courier New', monospace; font-size: 11px; padding: 3px; letter-spacing: 1px; }
  .rl-poster-cover { width: 100%; height: 180px; object-fit: cover; background: #ddd6c4; display: block; }
  .rl-poster-cover-fallback { width: 100%; height: 180px; background: var(--green); color: var(--paper-card); display: flex; align-items: center; justify-content: center; font-size: 34px; font-weight: 700; font-family: Georgia, serif; }
  .rl-poster-info { padding: 10px 10px 12px; }
  .rl-poster-info .t { font-weight: 700; font-size: 13px; line-height: 1.3; }
  .rl-poster-info .a { font-size: 11px; color: var(--ink-soft); margin-top: 2px; }

  .rl-rank-row { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-bottom: 1px dotted var(--line); }
  .rl-rank-row:last-child { border-bottom: none; }
  .rl-rank-num { font-family: 'Courier New', monospace; font-size: 13px; color: var(--brass); width: 22px; flex-shrink: 0; }
  .rl-rank-row .t { font-weight: 700; font-size: 13.5px; }
  .rl-rank-row .a { color: var(--ink-soft); font-size: 12px; margin-left: 4px; }
  .rl-rank-row .score { margin-left: auto; font-family: 'Courier New', monospace; font-size: 12px; color: var(--green-deep); white-space: nowrap; }

  .rl-review-item { border-bottom: 1px dotted var(--line); padding: 10px 0; }
  .rl-review-item:last-child { border-bottom: none; }
  .rl-review-item .who { font-weight: 700; font-size: 13px; }

  .rl-locked { text-align: center; padding: 40px 20px; font-family: 'Courier New', monospace; font-size: 12.5px; color: var(--ink-soft); }
`;

const GENRES = ["Realistic Fiction", "Fantasy", "Sci-Fi", "Mystery/Thriller", "Historical Fiction", "Graphic Novel", "Memoir/Nonfiction", "Horror", "Poetry", "Adventure"];
const ABANDON_REASONS = [
  "Didn't interview the book properly",
  "Peer-pressure read (friends were reading it)",
  "Loyalty read (liked the author's other work)",
  "Too early — too challenging for me right now",
  "Series-loyalty read",
  "Parent read (gift or recommendation)",
  "Author spread the series thin",
  "Reading in too-small chunks",
  "Theme didn't match my mood",
  "Other (write your own)",
];
const ABANDON_OTHER = "Other (write your own)";

const INTERVIEW_TECHNIQUES = [
  "Read the blurb",
  "Sampled a page or two",
  "Checked for tough vocabulary",
  "Asked a friend or teacher",
  "Recognized the author",
  "Continuing a series",
  "Cover or title caught my eye",
];

const PRE_ABANDON_CHECKLIST = [
  "Read at least 25 pages",
  "Asked a friend or teacher if it gets better",
  "Skipped or skimmed ahead",
  "Read the last two chapters",
  "Checked the chapter titles",
  "Re-read the blurb",
  "Pushed through unfamiliar names",
];

const MOOD_OPTIONS = [
  { emoji: "🔥", label: "Love it! Can't put it down." },
  { emoji: "😁", label: "It's good, I want to read it." },
  { emoji: "😐", label: "It's ok, but I drift a little or have to be reminded." },
  { emoji: "😴", label: "It's really boring, I need a new book." },
];

// Taxonomy, category -> tags -> follow-up question bank. Teacher-authored
// and code-managed for now (see the comment on editing this in chat).
const VAULT_TAXONOMY = [
  {
    category: "Characters",
    tags: [
      { name: "Motivation", questions: [
        "What do you think is really driving this choice?",
        "Is there a moment earlier in the book that explains this reaction?",
      ]},
      { name: "Change", questions: [
        "What's different about this character now compared to where they started?",
        "What do you think caused that shift?",
      ]},
    ],
  },
  {
    category: "Questions",
    tags: [
      { name: "I'm Confused About...", questions: [
        "What specifically is unclear — the event itself, or why it happened?",
        "What would need to happen next for this to make sense?",
      ]},
      { name: "I Wonder...", questions: [
        "What in the text made you wonder that?",
        "What do you think the answer might be, based on what you've read so far?",
      ]},
    ],
  },
  {
    category: "Connections",
    tags: [
      { name: "To My Life", questions: [
        "What about your own experience made this moment resonate?",
        "How is your situation similar, and how is it different?",
      ]},
      { name: "To Another Text", questions: [
        "What's the strongest similarity between the two?",
        "Do the two moments mean the same thing, or something different?",
      ]},
    ],
  },
  {
    category: "Writing Techniques",
    tags: [
      { name: "Symbol", questions: [
        "What does this object or image seem to represent beyond its literal meaning?",
        "Where else has this shown up in the book?",
      ]},
      { name: "Foreshadowing", questions: [
        "What do you think this is hinting at?",
        "What makes you suspect that?",
      ]},
      { name: "Imagery", questions: [
        "Which sense does this image pull on most strongly?",
        "What feeling does this image leave you with?",
      ]},
    ],
  },
  {
    category: "Plot Elements",
    tags: [
      { name: "Turning Point", questions: [
        "What makes this feel like a turning point to you?",
        "What changed right before this moment?",
      ]},
      { name: "Setting", questions: [
        "What about this setting stood out to you just now?",
        "How is this place shaping what's happening?",
      ]},
      { name: "Pacing", questions: [
        "What made you notice the pace here?",
        "What effect is that speed — fast or slow — having on you as a reader?",
      ]},
      { name: "Rising Action", questions: [
        "What's building here that makes you think things are about to get more intense?",
        "How does this moment raise the stakes compared to what came before?",
      ]},
      { name: "Leads (Exposition)", questions: [
        "What does this opening tell you about what kind of story this is going to be?",
        "What questions does this lead leave you with?",
      ]},
      { name: "Resolution", questions: [
        "What loose ends does this resolve, and what (if anything) stays unresolved?",
        "How does this ending compare to what you expected earlier in the book?",
      ]},
    ],
  },
  {
    category: "Conflict",
    tags: [
      { name: "Internal Struggle", questions: [
        "What's pulling this character in two directions?",
        "Which side do you think will win out, and why?",
      ]},
      { name: "External Struggle", questions: [
        "Who or what is standing in the way here?",
        "What would it take to resolve this?",
      ]},
      { name: "Stakes", questions: [
        "What does this character stand to lose?",
        "Why do these stakes matter to you as a reader?",
      ]},
    ],
  },
  {
    category: "Big Ideas",
    tags: [
      { name: "Theme I'm Noticing", questions: [
        "Where else in the book have you seen this idea show up?",
        "Why do you think this idea matters to the story?",
      ]},
      { name: "Life Lesson", questions: [
        "How might this lesson apply outside the book?",
        "Do you agree with what this seems to be teaching?",
      ]},
      { name: "Universal Truth", questions: [
        "Do you think this is true beyond just this story?",
        "What makes you believe that?",
      ]},
    ],
  },
];

const todayStr = () => new Date().toISOString().slice(0, 10);
const daysSince = (dateStr) => Math.floor((Date.now() - new Date(dateStr + "T00:00:00").getTime()) / 86400000);
const STALL_DAYS = 10;

// Pulls every question attached to the selected tags, dedupes, and returns
// a random sample of up to `count` — used to populate the required
// follow-up popup after a vault entry is submitted.
function pickFollowUpQuestions(selectedTagNames, count = 3) {
  const pool = [];
  VAULT_TAXONOMY.forEach((cat) => {
    cat.tags.forEach((tag) => {
      if (selectedTagNames.includes(tag.name)) {
        tag.questions.forEach((q) => { if (!pool.includes(q)) pool.push(q); });
      }
    });
  });
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

// Firestore Timestamps come through as objects with .toMillis()/.seconds, not
// plain numbers — this normalizes that (and tolerates a still-pending
// serverTimestamp(), which briefly reads as null right after a write).
function tsMillis(ts) {
  if (!ts) return 0;
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.seconds === "number") return ts.seconds * 1000;
  return 0;
}

// Sorts status check-ins newest-first: by date, then by the exact moment
// they were created (so same-day entries land in true chronological order
// instead of whatever arbitrary order Firestore happened to return).
function sortStatusDesc(entries) {
  return [...entries].sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1;
    return tsMillis(b.createdAt) - tsMillis(a.createdAt);
  });
}
function sortStatusAsc(entries) {
  return [...sortStatusDesc(entries)].reverse();
}

function guessGenre(subjects = []) {
  const s = subjects.join(" ").toLowerCase();
  if (s.includes("fantasy")) return "Fantasy";
  if (s.includes("science fiction")) return "Sci-Fi";
  if (s.includes("mystery") || s.includes("thriller")) return "Mystery/Thriller";
  if (s.includes("historical")) return "Historical Fiction";
  if (s.includes("graphic novel") || s.includes("comic")) return "Graphic Novel";
  if (s.includes("biography") || s.includes("memoir") || s.includes("nonfiction")) return "Memoir/Nonfiction";
  if (s.includes("horror")) return "Horror";
  if (s.includes("poetry")) return "Poetry";
  if (s.includes("adventure")) return "Adventure";
  return "Realistic Fiction";
}

const SPOILER_PHRASES = ["at the end", "in the end", "turns out", "dies", "kills", "the ending", "spoiler", "twist is"];
function spoilerCheck(text) {
  const low = text.toLowerCase();
  return SPOILER_PHRASES.find((p) => low.includes(p)) || null;
}

function countSentences(text) {
  const matches = (text || "").match(/[^.!?]+[.!?]+/g);
  if (matches) return matches.length;
  return (text || "").trim() ? 1 : 0;
}

// Booktalks are stored as four parts (hook/setup/stakes/pitch) so each can be
// checked separately, but read as one flowing paragraph. Falls back to the
// old single "review" field for entries saved before this existed.
function composeBookTalk(entry) {
  if (entry.hook || entry.setup || entry.stakes || entry.pitch) {
    return [entry.hook, entry.setup, entry.stakes, entry.pitch].filter(Boolean).join(" ");
  }
  return entry.review || "";
}

function Cover({ src, title }) {
  const [failed, setFailed] = useState(false);
  if (!src || failed) {
    return <div className="rl-cover-fallback">{title?.[0] || "?"}</div>;
  }
  return <img className="rl-cover" src={src} alt="" onError={() => setFailed(true)} />;
}

function Stars({ value }) {
  return (
    <div className="rl-stars">
      {"★".repeat(Math.round(value / 2)).padEnd(5, "☆").split("").map((c, i) => (
        <span key={i} style={{ fontSize: 14, marginLeft: i === 0 ? 0 : -2 }}>{c}</span>
      ))}
      <span>{value}/10</span>
    </div>
  );
}

function LibraryBookCard({ book, uid, communityReadCounts, reviewCountsByTitle, mySomeday, onToggleSomeday, onCheckIn, onCheckOut, onShowReviews }) {
  const b = book;
  const available = b.copies.filter((c) => c.status === "available").length;
  const myCopy = b.copies.find((c) => c.holderStudentId === uid);
  return (
    <div className="rl-card">
      <div className="rl-card-body">
        <Cover src={b.cover} title={b.title} />
        <div className="rl-card-text">
          <div className="rl-card-title">{b.title}</div>
          <div className="rl-card-author">{b.author}</div>
          <div className="rl-tagrow"><span className="rl-genre-tag">{b.genre}</span><span>{available}/{b.copies.length} on shelf</span></div>
          <div className="rl-copy-dots">
            {b.copies.map((c) => <div key={c.id} className={`rl-dot ${c.status === "available" ? "avail" : "out"}`} title={c.status === "available" ? "Available" : "Checked out"} />)}
          </div>
          {communityReadCounts[b.title] > 0 && (
            <div className="rl-social-proof"><Users size={10} /> {communityReadCounts[b.title]} {communityReadCounts[b.title] === 1 ? "classmate has" : "classmates have"} read this</div>
          )}
          {reviewCountsByTitle[b.title] > 0 && (
            <button className="rl-btn small" style={{ marginTop: 6 }} onClick={() => onShowReviews(b.title)}>
              <MessageSquare size={11} /> {reviewCountsByTitle[b.title]} review{reviewCountsByTitle[b.title] > 1 ? "s" : ""}
            </button>
          )}
        </div>
      </div>
      <div className="rl-btnrow">
        {myCopy ? (
          <button className="rl-btn" onClick={() => onCheckIn(b.id)}>Return My Copy</button>
        ) : (
          <button className="rl-btn" disabled={available === 0} onClick={() => onCheckOut(b.id)}>{available === 0 ? "All checked out" : "Check Out"}</button>
        )}
        <button className="rl-btn small" onClick={() => onToggleSomeday(b.id)}>{mySomeday.includes(b.id) ? "★" : "☆"}</button>
      </div>
    </div>
  );
}

export default function ReadingLogApp() {
  const [user, setUser] = useState(null); // Firebase Auth user object, or null
  const [authChecked, setAuthChecked] = useState(false);
  const [signInError, setSignInError] = useState("");
  const [isTeacher, setIsTeacher] = useState(false);

  const [students, setStudents] = useState([]);
  const [readingLog, setReadingLog] = useState([]);
  const [libraryBooks, setLibraryBooks] = useState([]);
  const [copies, setCopies] = useState([]);
  const [wishlist, setWishlist] = useState([]);
  const [statusEntries, setStatusEntries] = useState([]);
  const [vaultEntries, setVaultEntries] = useState([]);

  const [view, setView] = useState("log");
  const [addOpen, setAddOpen] = useState(false);
  const [closeOpen, setCloseOpen] = useState(null);
  const [libAddOpen, setLibAddOpen] = useState(false);
  const [editEntryState, setEditEntryState] = useState(null);
  const [reviewsFor, setReviewsFor] = useState(null); // title string, or null
  const [studentDetailId, setStudentDetailId] = useState(null); // student id, or null
  const [showFinishedList, setShowFinishedList] = useState(false);
  const [statusFor, setStatusFor] = useState(null); // book entry, or null
  const [vaultFor, setVaultFor] = useState(null); // book entry, or null

  const [search, setSearch] = useState("");
  const [genreFilter, setGenreFilter] = useState("All");
  const [availOnly, setAvailOnly] = useState(false);

  const uid = user?.uid || null;

  // Watch auth state. Once signed in, create/update their student profile
  // from their Google account, check teacher status, then subscribe to
  // everything for the class.
  useEffect(() => {
    let dataUnsubs = [];
    const authUnsub = watchAuthState((u) => {
      setUser(u);
      setAuthChecked(true);
      dataUnsubs.forEach((fn) => fn && fn());
      dataUnsubs = [];
      if (u) {
        ensureStudentDoc(u.uid, u.displayName || u.email, u.email, CLASS_ID);
        isTeacherEmail(u.email).then(setIsTeacher);
        dataUnsubs = [
          subscribeStudents(CLASS_ID, setStudents),
          subscribeReadingLog(CLASS_ID, setReadingLog),
          subscribeLibraryBooks(CLASS_ID, setLibraryBooks),
          subscribeCopies(CLASS_ID, setCopies),
          subscribeWishlist(CLASS_ID, setWishlist),
          subscribeReadingStatus(CLASS_ID, setStatusEntries),
          subscribeVaultEntries(CLASS_ID, setVaultEntries),
        ];
      } else {
        setIsTeacher(false);
      }
    });
    return () => {
      authUnsub && authUnsub();
      dataUnsubs.forEach((fn) => fn && fn());
    };
  }, []);

  async function handleSignIn() {
    setSignInError("");
    try {
      await signInWithGoogle();
    } catch (err) {
      setSignInError(err.message || "Sign-in failed. Try again.");
    }
  }

  const me = students.find((s) => s.id === uid);
  const myName = me?.name || user?.displayName || null;
  const mySomeday = me?.someday || [];

  const library = useMemo(
    () => libraryBooks.map((b) => ({ ...b, copies: copies.filter((c) => c.bookId === b.id) })),
    [libraryBooks, copies]
  );

  const current = readingLog.filter((e) => e.studentId === uid);
  const reading = current.filter((b) => b.status === "reading");
  const finished = current.filter((b) => b.status === "finished");
  const abandoned = current.filter((b) => b.status === "abandoned");

  // "Top Genre" and recommendations are now driven by how a student actually
  // RATED finished books, not just how often they picked a genre — a genre
  // read five times at a 4/10 shouldn't outrank one read twice at 9/10.
  const genreRatings = useMemo(() => {
    const scores = {};
    finished.forEach((b) => {
      if (!scores[b.genre]) scores[b.genre] = { total: 0, count: 0 };
      scores[b.genre].total += b.rating;
      scores[b.genre].count += 1;
    });
    return Object.entries(scores)
      .map(([genre, s]) => ({ genre, avg: s.total / s.count, count: s.count }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);
  }, [finished]);
  const favoriteGenre = genreRatings[0]?.genre || null;

  const authorRatings = useMemo(() => {
    const scores = {};
    finished.forEach((b) => {
      if (!scores[b.author]) scores[b.author] = { total: 0, count: 0 };
      scores[b.author].total += b.rating;
      scores[b.author].count += 1;
    });
    return Object.entries(scores)
      .map(([author, s]) => ({ author, avg: s.total / s.count, count: s.count }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count);
  }, [finished]);
  const favoriteAuthor = authorRatings[0]?.author || null;

  // Don't recommend anything already logged OR already sitting on the someday list.
  const readTitles = new Set(current.map((b) => b.title));
  const somedayTitles = new Set(mySomeday.map((id) => library.find((b) => b.id === id)?.title).filter(Boolean));
  const excludedTitles = new Set([...readTitles, ...somedayTitles]);

  const recos = library
    .filter((b) => !excludedTitles.has(b.title) && (b.genre === favoriteGenre || b.author === favoriteAuthor))
    .sort((a, b) => (b.author === favoriteAuthor ? 1 : 0) - (a.author === favoriteAuthor ? 1 : 0))
    .slice(0, 3);

  const communityReadCounts = useMemo(() => {
    const counts = {};
    const seenPerStudent = {};
    readingLog.forEach((e) => {
      if (e.studentId === uid) return;
      if (e.status !== "finished" && e.status !== "reading") return;
      seenPerStudent[e.studentId] = seenPerStudent[e.studentId] || new Set();
      if (!seenPerStudent[e.studentId].has(e.title)) {
        seenPerStudent[e.studentId].add(e.title);
        counts[e.title] = (counts[e.title] || 0) + 1;
      }
    });
    return counts;
  }, [readingLog, uid]);

  // Reviews are per book TITLE across the whole class, not just what you
  // wrote yourself — this is what powers the "See reviews" buttons.
  const reviewCountsByTitle = useMemo(() => {
    const counts = {};
    readingLog.forEach((e) => {
      if (e.status === "finished" && composeBookTalk(e)) counts[e.title] = (counts[e.title] || 0) + 1;
    });
    return counts;
  }, [readingLog]);

  function getReviewsForTitle(title) {
    return readingLog
      .filter((e) => e.title === title && e.status === "finished" && composeBookTalk(e))
      .map((e) => ({ ...e, studentName: students.find((s) => s.id === e.studentId)?.name || "A classmate" }))
      .sort((a, b) => b.rating - a.rating);
  }

  async function addBook({ title, author, genre, dateStarted, isbn, cover, whyThisBook, interviewTechniques, priorKnowledge, totalPages }) {
    await addLogEntry(uid, CLASS_ID, { title, author, genre, dateStarted, isbn, cover, whyThisBook, interviewTechniques, priorKnowledge, totalPages });
    setAddOpen(false);
  }

  async function closeBook(id, mode, data) {
    if (mode === "finish") {
      await finishEntry(id, { dateFinished: data.date, rating: data.rating, hook: data.hook, setup: data.setup, stakes: data.stakes, pitch: data.pitch });
    } else {
      await abandonEntry(id, {
        dateAbandoned: data.date, reason: data.reason, pagesReadAtAbandon: data.pagesRead,
        reflectionToAuthor: data.reflectionToAuthor, reflectionNextTime: data.reflectionNextTime,
      });
    }
    setCloseOpen(null);
  }

  async function deleteBook(id) {
    if (!window.confirm("Delete this entry from your log? This can't be undone.")) return;
    await deleteEntry(id);
  }

  async function saveEditedEntry(id, updates) {
    await editEntry(id, updates);
    setEditEntryState(null);
  }

  async function toggleSomeday(bookId) {
    if (mySomeday.includes(bookId)) await removeFromSomeday(uid, bookId);
    else await addToSomeday(uid, bookId);
  }

  async function startFromSomeday(bookId) {
    const book = library.find((b) => b.id === bookId);
    if (!book) return;
    await addLogEntry(uid, CLASS_ID, { title: book.title, author: book.author, genre: book.genre, dateStarted: todayStr(), isbn: book.isbn, cover: book.cover });
    await doCheckOut(bookId);
    await removeFromSomeday(uid, bookId);
    setView("log");
  }

  async function doCheckOut(bookId) {
    const book = library.find((b) => b.id === bookId);
    const avail = book?.copies.find((c) => c.status === "available");
    if (!avail) return;
    await checkOutCopy(avail.id, uid, todayStr());
  }

  async function doCheckIn(bookId) {
    const book = library.find((b) => b.id === bookId);
    const mine = book?.copies.find((c) => c.holderStudentId === uid);
    if (!mine) return;
    await checkInCopy(mine.id);
  }

  async function doBulkCheckIn() {
    if (!window.confirm("Check in every copy currently checked out across the whole shelf?")) return;
    const out = copies.filter((c) => c.status === "checked_out");
    await fsBulkCheckIn(out);
  }

  async function handleAddLibraryBook({ title, author, genre, isbn, cover, copies: n, totalPages }) {
    await fsAddLibraryBook(CLASS_ID, { title, author, genre, isbn, cover, copies: n, totalPages });
    setLibAddOpen(false);
  }

  // Same as above but doesn't close the modal — used by the batch-add panel,
  // which needs to add many titles in a row while staying open to show progress.
  async function addLibraryBookQuiet({ title, author, genre, isbn, cover, copies: n, totalPages }) {
    await fsAddLibraryBook(CLASS_ID, { title, author, genre, isbn, cover, copies: n, totalPages });
  }

  async function requestWishlist(title, author) {
    const existing = wishlist.find((w) => w.title.toLowerCase() === title.toLowerCase());
    if (existing) {
      if (!existing.votes.includes(uid)) await fsVoteWishlist(existing.id, uid);
    } else {
      await addWishlistRequest(CLASS_ID, title, author, uid);
    }
  }

  async function doVoteWishlist(id) {
    await fsVoteWishlist(id, uid);
  }

  // Safety net: hides Teacher View's data even if view state were ever forced
  // to "teacher" some other way (e.g. browser back/forward through history).
  useEffect(() => {
    if ((view === "teacher" || view === "status") && !isTeacher) setView("log");
  }, [view, isTeacher]);

  async function handleAddReadingStatus(payload) {
    await addReadingStatus(CLASS_ID, payload);
  }

  async function handleQuickStatus({ logEntryId, title, page, mood }) {
    await addReadingStatus(CLASS_ID, { studentId: uid, logEntryId, title, page, date: todayStr(), mood, enteredByName: myName });
    setStatusFor(null);
  }

  async function handleAddVaultEntry(payload) {
    await addVaultEntry(CLASS_ID, { studentId: uid, enteredByName: myName, ...payload });
    setVaultFor(null);
  }

  const filteredLibrary = library.filter((b) => {
    const matchesSearch = !search || b.title.toLowerCase().includes(search.toLowerCase()) || b.author.toLowerCase().includes(search.toLowerCase());
    const matchesGenre = genreFilter === "All" || b.genre === genreFilter;
    const matchesAvail = !availOnly || b.copies.some((c) => c.status === "available");
    return matchesSearch && matchesGenre && matchesAvail;
  });

  const myCheckedOut = library.filter((b) => b.copies.some((c) => c.holderStudentId === uid));

  // Top 10 highest-rated books across the WHOLE class, for Books We Love.
  const topRatedBooks = useMemo(() => {
    const map = {};
    readingLog.forEach((e) => {
      if (e.status !== "finished" || !e.rating) return;
      if (!map[e.title]) map[e.title] = { title: e.title, author: e.author, genre: e.genre, cover: e.cover, total: 0, count: 0 };
      map[e.title].total += e.rating;
      map[e.title].count += 1;
      if (!map[e.title].cover && e.cover) map[e.title].cover = e.cover;
    });
    return Object.values(map)
      .map((t) => ({ ...t, avg: t.total / t.count }))
      .sort((a, b) => b.avg - a.avg || b.count - a.count)
      .slice(0, 10);
  }, [readingLog]);

  // Teacher aggregate stats (across the whole class)
  const allEntries = readingLog;
  const genreCounts = {};
  allEntries.forEach((b) => { genreCounts[b.genre] = (genreCounts[b.genre] || 0) + 1; });
  const maxGenreCount = Math.max(1, ...Object.values(genreCounts));
  const finishedAll = allEntries.filter((b) => b.status === "finished");
  const avgRating = finishedAll.length ? (finishedAll.reduce((a, b) => a + b.rating, 0) / finishedAll.length).toFixed(1) : "—";
  const abandonRate = allEntries.length ? Math.round((allEntries.filter((b) => b.status === "abandoned").length / allEntries.length) * 100) : 0;
  const stalledAll = allEntries.filter((b) => b.status === "reading" && daysSince(b.dateStarted) >= STALL_DAYS);
  const reasonCounts = {};
  allEntries.filter((b) => b.status === "abandoned" && b.reason).forEach((b) => { reasonCounts[b.reason] = (reasonCounts[b.reason] || 0) + 1; });
  const maxReasonCount = Math.max(1, ...Object.values(reasonCounts), 0);
  const checkedOutCopies = library.flatMap((b) => b.copies.filter((c) => c.status === "checked_out").map((c) => ({ ...c, title: b.title, holderName: students.find((s) => s.id === c.holderStudentId)?.name || "Unknown" }))).sort((a, b) => (daysSince(a.since) < daysSince(b.since) ? 1 : -1));

  const shelfGenreCounts = {};
  const outGenreCounts = {};
  library.forEach((b) => {
    shelfGenreCounts[b.genre] = (shelfGenreCounts[b.genre] || 0) + b.copies.length;
    outGenreCounts[b.genre] = (outGenreCounts[b.genre] || 0) + b.copies.filter((c) => c.status === "checked_out").length;
  });
  const maxShelfCount = Math.max(1, ...Object.values(shelfGenreCounts));

  if (!authChecked) {
    return (
      <div className="rl-root">
        <style>{STYLES}</style>
        <div className="rl-gate"><div className="rl-note">Connecting...</div></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="rl-root">
        <style>{STYLES}</style>
        <div className="rl-gate">
          <div className="rl-modal" style={{ position: "static" }}>
            <h3>Welcome to The Reading Log</h3>
            <div className="rl-note" style={{ marginBottom: 14 }}>
              Sign in with your school Google account (@{SCHOOL_DOMAIN}) to see your reading log
              and someday list from any device.
            </div>
            <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center" }} onClick={handleSignIn}>
              Sign in with Google <ChevronRight size={14} />
            </button>
            {signInError && <div className="rl-spoiler-hint warn" style={{ marginTop: 10 }}><AlertTriangle size={12} /> {signInError}</div>}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="rl-root">
      <style>{STYLES}</style>
      <div className="rl-shell">
        <div className="rl-header">
          <div className="rl-title">The Reading Log<small>Independent Reading &middot; Workshop Edition</small></div>
          <div className="rl-student">
            Reading as <strong>{myName}</strong>
            <button className="rl-btn small" style={{ marginLeft: 10 }} onClick={signOutUser}>Sign out</button>
          </div>
        </div>

        <nav className="rl-shelf">
          <button className={`rl-spine ${view === "log" ? "active" : ""}`} onClick={() => setView("log")}><BookOpen /> My Log</button>
          <button className={`rl-spine ${view === "library" ? "active" : ""}`} onClick={() => setView("library")}><Library /> Library Shelf</button>
          <button className={`rl-spine ${view === "someday" ? "active" : ""}`} onClick={() => setView("someday")}><ListChecks /> Someday List{mySomeday.length ? ` (${mySomeday.length})` : ""}</button>
          <button className={`rl-spine ${view === "loved" ? "active" : ""}`} onClick={() => setView("loved")}><Award /> Books We Love</button>
          {isTeacher && <button className={`rl-spine ${view === "status" ? "active" : ""}`} onClick={() => setView("status")}><TrendingUp /> Reading Status</button>}
          {isTeacher && <button className={`rl-spine ${view === "teacher" ? "active" : ""}`} onClick={() => setView("teacher")}><Users /> Teacher View</button>}
        </nav>

        {view === "log" && (
          <>
            {current.length > 0 && (
              <div className="rl-identity">
                <h4><Sparkles size={12} /> {myName}'s Reading Log</h4>
                <div className="rl-identity-stat"><div className="num">{current.length}</div><div className="label">Books Logged</div></div>
                <div className="rl-identity-stat"><div className="num">{finished.length}</div><div className="label">Finished</div></div>
                <div className="rl-identity-stat"><div className="num">{finished.length ? (finished.reduce((a, b) => a + b.rating, 0) / finished.length).toFixed(1) : "—"}</div><div className="label">Avg. Rating</div></div>
                <div className="rl-identity-stat"><div className="num" style={{ fontSize: 15 }}>{favoriteGenre || "—"}</div><div className="label">Best-Rated Genre</div></div>
              </div>
            )}
            <div className="rl-section-title">
              Currently Reading <span className="rl-count">{reading.length}</span>
              <span style={{ marginLeft: "auto" }}>
                <button className="rl-btn solid" onClick={() => setAddOpen(true)}><Plus size={13} /> Start a New Book</button>
              </span>
            </div>
            {reading.length === 0 ? (
              <div className="rl-empty">Nothing in progress. Start a new book above.</div>
            ) : (
              <div className="rl-grid">
                {reading.map((b) => {
                  const stalled = daysSince(b.dateStarted) >= STALL_DAYS;
                  return (
                    <div className="rl-card" key={b.id}>
                      <div className="rl-card-body">
                        <Cover src={b.cover} title={b.title} />
                        <div className="rl-card-text">
                          <div className="rl-card-title">{b.title}</div>
                          <div className="rl-card-author">{b.author}</div>
                          <div className="rl-tagrow"><span className="rl-genre-tag">{b.genre}</span><span>started {b.dateStarted}</span></div>
                          {stalled && <div className="rl-flag"><Flag size={10} /> {daysSince(b.dateStarted)} days, no update — check in?</div>}
                        </div>
                      </div>
                      <div className="rl-btnrow">
                        <button className="rl-btn" onClick={() => setStatusFor(b)}><TrendingUp size={13} /> Status</button>
                        <button className="rl-btn" onClick={() => setVaultFor(b)}><Archive size={13} /> Vault</button>
                        <button className="rl-btn" onClick={() => setCloseOpen({ id: b.id, mode: "finish" })}><BookMarked size={13} /> Finish</button>
                        <button className="rl-btn rust" onClick={() => setCloseOpen({ id: b.id, mode: "abandon" })}><RotateCcw size={13} /> Abandon</button>
                        <span className="rl-card-corner">
                          <button className="rl-icon-btn" title="Edit" onClick={() => setEditEntryState(b)}><Pencil size={12} /></button>
                          <button className="rl-icon-btn danger" title="Delete" onClick={() => deleteBook(b.id)}><Trash2 size={12} /></button>
                        </span>
                      </div>
                      {(() => {
                        const fromStatus = statusEntries.filter((s) => s.logEntryId === b.id && s.page != null);
                        const fromVault = vaultEntries
                          .filter((v) => v.logEntryId === b.id && v.page != null)
                          .map((v) => ({ date: v.date, page: v.page, createdAt: v.createdAt }));
                        const latest = sortStatusDesc([...fromStatus, ...fromVault])[0];
                        if (!b.totalPages || !latest) return null;
                        const pct = Math.min(100, Math.round((latest.page / b.totalPages) * 100));
                        return (
                          <div style={{ marginTop: 10 }}>
                            <div className="rl-isbn-status" style={{ marginBottom: 4 }}>{pct}% through — page {latest.page} of {b.totalPages}</div>
                            <div className="rl-bar-track" style={{ height: 8 }}><div className="rl-bar-fill" style={{ width: `${pct}%` }} /></div>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="rl-section-title">Finished <span className="rl-count">{finished.length}</span></div>
            {finished.length === 0 ? <div className="rl-empty">No finished books yet.</div> : (
              <div className="rl-grid">
                {finished.map((b) => (
                  <div className="rl-card" key={b.id}>
                    <div className="rl-card-body">
                      <Cover src={b.cover} title={b.title} />
                      <div className="rl-card-text">
                        <div className="rl-card-title">{b.title}</div>
                        <div className="rl-card-author">{b.author}</div>
                        <div className="rl-tagrow"><span className="rl-genre-tag">{b.genre}</span><span>{b.dateStarted} → {b.dateFinished}</span></div>
                        <Stars value={b.rating} />
                      </div>
                    </div>
                    <div className="rl-review">&ldquo;{composeBookTalk(b)}&rdquo;</div>
                    <div className="rl-btnrow">
                      <span className="rl-card-corner">
                        <button className="rl-icon-btn" title="Edit" onClick={() => setEditEntryState(b)}><Pencil size={12} /></button>
                        <button className="rl-icon-btn danger" title="Delete" onClick={() => deleteBook(b.id)}><Trash2 size={12} /></button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="rl-section-title">Abandoned <span className="rl-count">{abandoned.length}</span></div>
            {abandoned.length === 0 ? <div className="rl-empty">No abandoned books.</div> : (
              <div className="rl-grid">
                {abandoned.map((b) => (
                  <div className="rl-card abandoned" key={b.id}>
                    <div className="rl-card-body">
                      <Cover src={b.cover} title={b.title} />
                      <div className="rl-card-text">
                        <div className="rl-card-title">{b.title}</div>
                        <div className="rl-card-author">{b.author}</div>
                        <div className="rl-tagrow"><span className="rl-genre-tag">{b.genre}</span><span>{b.dateStarted} → {b.dateAbandoned}</span></div>
                        {b.reason && <span className="rl-reason-tag">{b.reason}</span>}
                      </div>
                    </div>
                    <div className="rl-btnrow">
                      <span className="rl-card-corner">
                        <button className="rl-icon-btn" title="Edit" onClick={() => setEditEntryState(b)}><Pencil size={12} /></button>
                        <button className="rl-icon-btn danger" title="Delete" onClick={() => deleteBook(b.id)}><Trash2 size={12} /></button>
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {view === "library" && (
          <>
            {recos.length > 0 && (
              <div className="rl-lib-recos">
                <h4>Because you've rated {favoriteGenre} books highly{favoriteAuthor ? ` (and love ${favoriteAuthor})` : ""}</h4>
                <div className="rl-reco-list">
                  {recos.map((b) => (
                    <div className="rl-reco-pill" key={b.id}>
                      {b.title} — {b.author}
                      <button className="rl-btn small" style={{ borderColor: "rgba(255,255,255,0.4)", color: "#fff" }} onClick={() => toggleSomeday(b.id)}>
                        {mySomeday.includes(b.id) ? "Added" : "+ Someday"}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {myCheckedOut.length > 0 && (
              <>
                <div className="rl-section-title">Currently Checked Out <span className="rl-count">{myCheckedOut.length}</span></div>
                <div className="rl-grid" style={{ marginBottom: 24 }}>
                  {myCheckedOut.map((b) => (
                    <LibraryBookCard
                      key={b.id} book={b} uid={uid}
                      communityReadCounts={communityReadCounts} reviewCountsByTitle={reviewCountsByTitle}
                      mySomeday={mySomeday} onToggleSomeday={toggleSomeday}
                      onCheckIn={doCheckIn} onCheckOut={doCheckOut} onShowReviews={setReviewsFor}
                    />
                  ))}
                </div>
              </>
            )}

            <div className="rl-section-title">
              Classroom Shelf <span className="rl-count">{filteredLibrary.length} of {library.length}</span>
              <span style={{ marginLeft: "auto" }}>
                <button className="rl-btn solid" onClick={() => setLibAddOpen(true)}><Barcode size={13} /> Add Title to Shelf</button>
              </span>
            </div>

            <div className="rl-filter-bar">
              <input placeholder="Search title or author..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ minWidth: 200 }} />
              <select value={genreFilter} onChange={(e) => setGenreFilter(e.target.value)}>
                <option>All</option>
                {GENRES.map((g) => <option key={g}>{g}</option>)}
              </select>
              <label><input type="checkbox" checked={availOnly} onChange={(e) => setAvailOnly(e.target.checked)} /> Available only</label>
            </div>

            {filteredLibrary.length === 0 ? <div className="rl-empty">No titles yet. Use "Add Title to Shelf" above to get started.</div> : (
              <div className="rl-grid">
                {filteredLibrary.map((b) => (
                  <LibraryBookCard
                    key={b.id} book={b} uid={uid}
                    communityReadCounts={communityReadCounts} reviewCountsByTitle={reviewCountsByTitle}
                    mySomeday={mySomeday} onToggleSomeday={toggleSomeday}
                    onCheckIn={doCheckIn} onCheckOut={doCheckOut} onShowReviews={setReviewsFor}
                  />
                ))}
              </div>
            )}

            <div className="rl-section-title">Class Wishlist <span className="rl-count">{wishlist.length}</span></div>
            <div className="rl-note" style={{ marginBottom: 12 }}>Don't see a book you want on the shelf? Request it — if someone already has, add your vote instead.</div>
            {[...wishlist].sort((a, b) => b.votes.length - a.votes.length).map((w) => (
              <div className="rl-wish-row" key={w.id}>
                <div className="info"><span className="t">{w.title}</span>{w.author && <span className="a"> — {w.author}</span>}</div>
                <div className="votes">
                  <Heart size={12} /> {w.votes.length} {w.votes.length === 1 ? "student wants this" : "students want this"}
                  <button className="rl-btn small" disabled={w.votes.includes(uid)} onClick={() => doVoteWishlist(w.id)}>{w.votes.includes(uid) ? "You voted" : "+1 Me too"}</button>
                </div>
              </div>
            ))}
            <WishlistForm onSubmit={requestWishlist} />
          </>
        )}

        {view === "someday" && (
          <>
            <div className="rl-section-title">Someday List <span className="rl-count">{mySomeday.length}</span></div>
            {mySomeday.length === 0 ? (
              <div className="rl-empty">Nothing saved yet. Browse the Library Shelf and tap the star to add a book here.</div>
            ) : (
              <div className="rl-grid">
                {mySomeday.map((id) => {
                  const b = library.find((x) => x.id === id);
                  if (!b) return null;
                  const available = b.copies.filter((c) => c.status === "available").length;
                  return (
                    <div className="rl-card" key={id}>
                      <div className="rl-card-body">
                        <Cover src={b.cover} title={b.title} />
                        <div className="rl-card-text">
                          <div className="rl-card-title">{b.title}</div>
                          <div className="rl-card-author">{b.author}</div>
                          <div className="rl-tagrow"><span className="rl-genre-tag">{b.genre}</span><span>{available}/{b.copies.length} available</span></div>
                        </div>
                      </div>
                      <div className="rl-btnrow">
                        <button className="rl-btn solid" disabled={available === 0} onClick={() => startFromSomeday(id)}>{available === 0 ? "All checked out" : "Start Reading"}</button>
                        <button className="rl-btn small" onClick={() => toggleSomeday(id)}><X size={12} /></button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {view === "loved" && (
          <>
            <div className="rl-section-title">Books We Love <span className="rl-count">Top {topRatedBooks.length}</span></div>
            {topRatedBooks.length === 0 ? (
              <div className="rl-empty">No rated books yet — once a few finished reviews come in, the class favorites will show up here.</div>
            ) : (
              <>
                <div className="rl-poster-grid">
                  {topRatedBooks.slice(0, 5).map((b, i) => (
                    <div className="rl-poster-card" key={b.title}>
                      <div className="rl-poster-rank">#{i + 1}</div>
                      {b.cover ? <img className="rl-poster-cover" src={b.cover} alt="" /> : <div className="rl-poster-cover-fallback">{b.title[0]}</div>}
                      <div className="rl-poster-info">
                        <div className="t">{b.title}</div>
                        <div className="a">{b.author}</div>
                        <Stars value={Math.round(b.avg * 10) / 10} />
                        <div className="rl-isbn-status">{b.count} rating{b.count > 1 ? "s" : ""}</div>
                        {reviewCountsByTitle[b.title] > 0 && (
                          <button className="rl-btn small" style={{ marginTop: 6, width: "100%", justifyContent: "center" }} onClick={() => setReviewsFor(b.title)}>
                            <MessageSquare size={11} /> Reviews
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
                {topRatedBooks.length > 5 && (
                  <div className="rl-card" style={{ padding: "4px 12px" }}>
                    {topRatedBooks.slice(5).map((b, i) => (
                      <div className="rl-rank-row" key={b.title}>
                        <span className="rl-rank-num">#{i + 6}</span>
                        <span><span className="t">{b.title}</span><span className="a">— {b.author}</span></span>
                        <span className="score">{b.avg.toFixed(1)}/10 ({b.count})</span>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </>
        )}

        {view === "status" && !isTeacher && (
          <div className="rl-locked">Reading Status is only available to teacher accounts. Use the "Status" button on a book you're reading instead.</div>
        )}

        {view === "status" && isTeacher && (
          <ReadingStatusPanel
            uid={uid}
            myName={myName}
            isTeacher={isTeacher}
            students={students}
            readingLog={readingLog}
            statusEntries={statusEntries}
            onAdd={handleAddReadingStatus}
          />
        )}

        {view === "teacher" && !isTeacher && (
          <div className="rl-locked">Teacher View is only available to teacher accounts.</div>
        )}

        {view === "teacher" && isTeacher && (
          <>
            <div className="rl-section-title">Class Snapshot</div>
            <div className="rl-stat-grid">
              <div className="rl-stat"><div className="num">{students.length}</div><div className="label">Students Logging</div></div>
              <div className="rl-stat"><div className="num">{allEntries.length}</div><div className="label">Books Logged</div></div>
              <div className="rl-stat clickable" onClick={() => setShowFinishedList(true)} title="Click to see all finished titles"><div className="num">{finishedAll.length}</div><div className="label">Finished</div></div>
              <div className="rl-stat"><div className="num">{avgRating}</div><div className="label">Avg. Rating</div></div>
              <div className="rl-stat"><div className="num">{abandonRate}%</div><div className="label">Abandon Rate</div></div>
              <div className="rl-stat"><div className="num">{stalledAll.length}</div><div className="label">Stalled Books</div></div>
            </div>

            {stalledAll.length > 0 && (
              <>
                <div className="rl-section-title">Stalled Books — Worth a Conference</div>
                {stalledAll.map((b) => (
                  <div className="rl-checkout-row" key={b.id}>
                    <span className="who">{students.find((s) => s.id === b.studentId)?.name || "Unknown"} — {b.title}</span>
                    <span className="days">{daysSince(b.dateStarted)} days, no update</span>
                  </div>
                ))}
              </>
            )}

            <div className="rl-section-title">Genre Trends, Whole Class</div>
            {Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).map(([genre, count]) => (
              <div className="rl-bar-row" key={genre}>
                <div className="rl-bar-label">{genre}</div>
                <div className="rl-bar-track"><div className="rl-bar-fill" style={{ width: `${(count / maxGenreCount) * 100}%` }} /></div>
                <div className="rl-bar-val">{count}</div>
              </div>
            ))}

            {Object.keys(reasonCounts).length > 0 && (
              <>
                <div className="rl-section-title">Why Students Abandon Books</div>
                {Object.entries(reasonCounts).sort((a, b) => b[1] - a[1]).map(([reason, count]) => (
                  <div className="rl-bar-row" key={reason}>
                    <div className="rl-bar-label">{reason}</div>
                    <div className="rl-bar-track"><div className="rl-bar-fill rust" style={{ width: `${(count / maxReasonCount) * 100}%` }} /></div>
                    <div className="rl-bar-val">{count}</div>
                  </div>
                ))}
              </>
            )}

            <div className="rl-section-title">Collection Balance — On Shelf vs. Checked Out</div>
            {Object.entries(shelfGenreCounts).sort((a, b) => b[1] - a[1]).map(([genre, count]) => (
              <div key={genre} style={{ marginBottom: 10 }}>
                <div className="rl-bar-row">
                  <div className="rl-bar-label">{genre}</div>
                  <div className="rl-bar-track"><div className="rl-bar-fill" style={{ width: `${(count / maxShelfCount) * 100}%` }} /></div>
                  <div className="rl-bar-val">{count}</div>
                </div>
                <div className="rl-bar-row">
                  <div className="rl-bar-label" style={{ opacity: 0.6 }}>↳ checked out</div>
                  <div className="rl-bar-track"><div className="rl-bar-fill rust" style={{ width: `${((outGenreCounts[genre] || 0) / maxShelfCount) * 100}%` }} /></div>
                  <div className="rl-bar-val">{outGenreCounts[genre] || 0}</div>
                </div>
              </div>
            ))}

            {checkedOutCopies.length > 0 && (
              <>
                <div className="rl-section-title">
                  Currently Checked Out <span className="rl-count">{checkedOutCopies.length}</span>
                </div>
                <div className="rl-bulk-bar">
                  <button className="rl-btn small rust" onClick={doBulkCheckIn}><RefreshCw size={11} /> Check In All Copies</button>
                </div>
                {checkedOutCopies.map((c) => (
                  <div className="rl-checkout-row" key={c.id}>
                    <span><span className="who">{c.holderName}</span> — {c.title}</span>
                    <span className="days">{daysSince(c.since)} days</span>
                  </div>
                ))}
              </>
            )}

            <div className="rl-section-title">By Student <span style={{ fontWeight: 400, textTransform: "none", letterSpacing: 0, fontFamily: "Georgia, serif", fontSize: 12, color: "var(--ink-soft)", marginLeft: 8 }}>(click a name for details)</span></div>
            {students.map((s) => (
              <div className="rl-student-row" key={s.id} style={{ cursor: "pointer" }} onClick={() => setStudentDetailId(s.id)}>
                <span className="name">{s.name}</span>
                <span className="meta">
                  {readingLog.filter((b) => b.studentId === s.id && b.status === "reading").length} reading &middot;
                  {" "}{readingLog.filter((b) => b.studentId === s.id && b.status === "finished").length} finished &middot;
                  {" "}{readingLog.filter((b) => b.studentId === s.id && b.status === "abandoned").length} abandoned
                </span>
              </div>
            ))}
          </>
        )}
      </div>

      {addOpen && <AddBookModal onClose={() => setAddOpen(false)} onSave={addBook} library={library} />}
      {closeOpen && (
        <CloseBookModal
          mode={closeOpen.mode}
          book={reading.find((b) => b.id === closeOpen.id)}
          statusEntries={statusEntries.filter((s) => s.logEntryId === closeOpen.id)}
          onClose={() => setCloseOpen(null)}
          onSave={(data) => closeBook(closeOpen.id, closeOpen.mode, data)}
        />
      )}
      {libAddOpen && <AddLibraryBookModal onClose={() => setLibAddOpen(false)} onSave={handleAddLibraryBook} onBatchAddOne={addLibraryBookQuiet} />}
      {editEntryState && <EditEntryModal book={editEntryState} onClose={() => setEditEntryState(null)} onSave={(updates) => saveEditedEntry(editEntryState.id, updates)} />}
      {reviewsFor && <ReviewsModal title={reviewsFor} reviews={getReviewsForTitle(reviewsFor)} onClose={() => setReviewsFor(null)} />}
      {statusFor && <QuickStatusModal book={statusFor} onClose={() => setStatusFor(null)} onSave={handleQuickStatus} />}
      {vaultFor && <VaultEntryModal book={vaultFor} onClose={() => setVaultFor(null)} onSave={handleAddVaultEntry} />}
      {showFinishedList && (
        <FinishedTitlesModal
          entries={finishedAll}
          students={students}
          onSelectTitle={(title) => { setShowFinishedList(false); setReviewsFor(title); }}
          onClose={() => setShowFinishedList(false)}
        />
      )}
      {studentDetailId && isTeacher && (
        <StudentDetailModal
          student={students.find((s) => s.id === studentDetailId)}
          entries={readingLog.filter((e) => e.studentId === studentDetailId)}
          statusEntries={statusEntries.filter((e) => e.studentId === studentDetailId)}
          vaultEntries={vaultEntries.filter((e) => e.studentId === studentDetailId)}
          onClose={() => setStudentDetailId(null)}
        />
      )}
    </div>
  );
}

function QuickStatusModal({ book, onClose, onSave }) {
  const [page, setPage] = useState("");
  const [mood, setMood] = useState(`${MOOD_OPTIONS[0].emoji} ${MOOD_OPTIONS[0].label}`);
  const [saving, setSaving] = useState(false);

  async function handleSubmit() {
    if (!page) return;
    setSaving(true);
    try {
      await onSave({ logEntryId: book.id, title: book.title, page: parseInt(page, 10), mood });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose}><X size={18} /></button>
        <h3>Status — {book.title}</h3>
        <div className="rl-field"><label>What page are you on?</label><input type="number" min="0" value={page} onChange={(e) => setPage(e.target.value)} placeholder="e.g. 142" autoFocus /></div>
        <div className="rl-field">
          <label>How's it going?</label>
          <select value={mood} onChange={(e) => setMood(e.target.value)}>
            {MOOD_OPTIONS.map((m) => (
              <option key={m.label} value={`${m.emoji} ${m.label}`}>{m.emoji} {m.label}</option>
            ))}
          </select>
        </div>
        <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center" }} disabled={saving || !page} onClick={handleSubmit}>
          {saving ? "Saving..." : "Save Status"}
        </button>
      </div>
    </div>
  );
}

function VaultEntryModal({ book, onClose, onSave }) {
  const [step, setStep] = useState(0); // 0 = entry, 1 = required follow-up
  const [page, setPage] = useState("");
  const [date, setDate] = useState(todayStr());
  const [quote, setQuote] = useState("");
  const [idea, setIdea] = useState("");
  const [selectedTags, setSelectedTags] = useState([]);
  const [saving, setSaving] = useState(false);

  const [candidateQuestions, setCandidateQuestions] = useState([]);
  const [chosenQuestion, setChosenQuestion] = useState("");
  const [followUpAnswer, setFollowUpAnswer] = useState("");

  const canSubmitEntry = page && idea.trim() && selectedTags.length > 0;
  const canSubmitFollowUp = chosenQuestion && followUpAnswer.trim();

  function toggleTag(tagName) {
    setSelectedTags((prev) => (prev.includes(tagName) ? prev.filter((t) => t !== tagName) : [...prev, tagName]));
  }

  function goToFollowUp() {
    setCandidateQuestions(pickFollowUpQuestions(selectedTags));
    setStep(1);
  }

  async function handleFinalSave() {
    setSaving(true);
    try {
      await onSave({
        logEntryId: book.id, title: book.title, author: book.author,
        page: parseInt(page, 10), date, quote, idea, tags: selectedTags,
        followUpQuestion: chosenQuestion, followUpAnswer: followUpAnswer.trim(),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose}><X size={18} /></button>
        <h3>Thought Vault — {book.title}</h3>

        {step === 0 && (
          <>
            <div className="rl-field"><label>Page</label><input type="number" min="0" value={page} onChange={(e) => setPage(e.target.value)} placeholder="What page are you on?" autoFocus /></div>
            <div className="rl-field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="rl-field"><label>Quote (optional)</label><textarea value={quote} onChange={(e) => setQuote(e.target.value)} placeholder="What line or moment are you noticing?" /></div>
            <div className="rl-field"><label>Your idea, reaction, or question</label><textarea value={idea} onChange={(e) => setIdea(e.target.value)} placeholder="What are you thinking about right now?" /></div>
            <div className="rl-field">
              <label>Tags (pick as many as fit)</label>
              {VAULT_TAXONOMY.map((cat) => (
                <div key={cat.category} style={{ marginBottom: 8 }}>
                  <div className="rl-isbn-status" style={{ marginBottom: 3, textTransform: "uppercase" }}>{cat.category}</div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
                    {cat.tags.map((tag) => (
                      <label key={tag.name} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontFamily: "Georgia, serif" }}>
                        <input type="checkbox" checked={selectedTags.includes(tag.name)} onChange={() => toggleTag(tag.name)} /> {tag.name}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center" }} disabled={!canSubmitEntry} onClick={goToFollowUp}>
              Continue <ChevronRight size={14} />
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <div className="rl-note" style={{ marginBottom: 14 }}>One quick question before this is saved to your vault — pick whichever fits best.</div>
            <div className="rl-field">
              {candidateQuestions.map((q) => (
                <label key={q} style={{ display: "flex", alignItems: "flex-start", gap: 8, fontSize: 13, marginBottom: 8, fontFamily: "Georgia, serif" }}>
                  <input type="radio" name="followup" checked={chosenQuestion === q} onChange={() => setChosenQuestion(q)} style={{ marginTop: 3 }} /> {q}
                </label>
              ))}
            </div>
            {chosenQuestion && (
              <div className="rl-field"><label>Your answer</label><textarea value={followUpAnswer} onChange={(e) => setFollowUpAnswer(e.target.value)} autoFocus /></div>
            )}
            <div className="rl-btnrow">
              <button className="rl-btn" onClick={() => setStep(0)}>Back</button>
              <button className="rl-btn solid" style={{ flex: 1, justifyContent: "center" }} disabled={saving || !canSubmitFollowUp} onClick={handleFinalSave}>
                {saving ? "Saving..." : "Save to Vault"}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function FinishedTitlesModal({ entries, students, onSelectTitle, onClose }) {
  const nameFor = (id) => students.find((s) => s.id === id)?.name || "Unknown";
  const sorted = [...entries].sort((a, b) => (a.dateFinished < b.dateFinished ? 1 : -1));

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" style={{ maxWidth: 520 }} onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose}><X size={18} /></button>
        <h3>All Finished Books <span style={{ fontWeight: 400, fontSize: 13, color: "var(--ink-soft)" }}>({entries.length})</span></h3>
        {sorted.length === 0 ? (
          <div className="rl-empty">No finished books yet.</div>
        ) : (
          <div style={{ maxHeight: 420, overflowY: "auto" }}>
            {sorted.map((e) => (
              <div className="rl-checkout-row" key={e.id} style={{ cursor: "pointer" }} onClick={() => onSelectTitle(e.title)}>
                <span><span className="who">{e.title}</span> <span style={{ color: "var(--ink-soft)" }}>by {e.author} — {nameFor(e.studentId)}</span></span>
                <span className="days" style={{ color: "var(--brass)" }}>{e.rating}/10</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ReviewsModal({ title, reviews, onClose }) {
  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose}><X size={18} /></button>
        <h3>Reviews — {title}</h3>
        {reviews.length === 0 ? (
          <div className="rl-empty">No reviews yet.</div>
        ) : (
          <div style={{ maxHeight: 360, overflowY: "auto" }}>
            {reviews.map((r) => (
              <div className="rl-review-item" key={r.id}>
                <div className="who">{r.studentName}</div>
                <Stars value={r.rating} />
                <div className="rl-review" style={{ borderTop: "none", paddingTop: 4 }}>&ldquo;{composeBookTalk(r)}&rdquo;</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StudentDetailModal({ student, entries, statusEntries, vaultEntries, onClose }) {
  if (!student) return null;
  const finished = entries.filter((e) => e.status === "finished");
  const reading = entries.filter((e) => e.status === "reading");
  const abandoned = entries.filter((e) => e.status === "abandoned");
  const avgRating = finished.length ? (finished.reduce((a, b) => a + b.rating, 0) / finished.length).toFixed(1) : "—";

  const genreCounts = {};
  entries.forEach((e) => { genreCounts[e.genre] = (genreCounts[e.genre] || 0) + 1; });
  const maxGenre = Math.max(1, ...Object.values(genreCounts));

  const reasonCounts = {};
  abandoned.forEach((e) => { if (e.reason) reasonCounts[e.reason] = (reasonCounts[e.reason] || 0) + 1; });

  // Pace: group this student's status check-ins by book, compute pages/day
  // between their first and last check-in for each currently-reading book.
  const byBook = {};
  statusEntries.forEach((e) => {
    byBook[e.logEntryId] = byBook[e.logEntryId] || [];
    byBook[e.logEntryId].push(e);
  });
  const paceRows = Object.entries(byBook).map(([logEntryId, arr]) => {
    const sorted = sortStatusAsc(arr);
    const first = sorted[0], last = sorted[sorted.length - 1];
    if (sorted.length < 2) return null;
    const days = Math.max(1, daysSince(first.date) - daysSince(last.date));
    const pages = last.page - first.page;
    return { title: last.title, pages, days, rate: (pages / days).toFixed(1) };
  }).filter(Boolean);

  const sortedEntries = [...entries].sort((a, b) => (a.dateStarted < b.dateStarted ? 1 : -1));

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" style={{ maxWidth: 560 }} onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose}><X size={18} /></button>
        <h3>{student.name}</h3>

        <div className="rl-stat-grid">
          <div className="rl-stat"><div className="num">{entries.length}</div><div className="label">Total Books</div></div>
          <div className="rl-stat"><div className="num">{finished.length}</div><div className="label">Finished</div></div>
          <div className="rl-stat"><div className="num">{reading.length}</div><div className="label">Reading Now</div></div>
          <div className="rl-stat"><div className="num">{abandoned.length}</div><div className="label">Abandoned</div></div>
          <div className="rl-stat"><div className="num">{avgRating}</div><div className="label">Avg. Rating</div></div>
        </div>

        {paceRows.length > 0 && (
          <>
            <div className="rl-section-title" style={{ marginTop: 4 }}>Reading Pace</div>
            {paceRows.map((p, i) => (
              <div className="rl-checkout-row" key={i}>
                <span>{p.title}</span>
                <span className="days" style={{ color: "var(--green-deep)" }}>{p.pages} pages / {p.days} days (~{p.rate}/day)</span>
              </div>
            ))}
          </>
        )}

        {statusEntries.length > 0 && (
          <>
            <div className="rl-section-title">Recent Check-Ins</div>
            {sortStatusDesc(statusEntries).slice(0, 8).reverse().map((e) => (
              <div className="rl-checkout-row" key={e.id}>
                <span>{e.title} — page {e.page}{e.mood ? ` — ${e.mood}` : ""}</span>
                <span className="days" style={{ color: "var(--ink-soft)" }}>{e.date}</span>
              </div>
            ))}
          </>
        )}

        {vaultEntries && vaultEntries.length > 0 && (
          <>
            <div className="rl-section-title">Thought Vault <span className="rl-count">{vaultEntries.length}</span></div>
            <div style={{ maxHeight: 340, overflowY: "auto" }}>
              {[...vaultEntries].sort((a, b) => (a.date < b.date ? 1 : -1)).map((e) => (
                <div className="rl-card" key={e.id} style={{ marginBottom: 8 }}>
                  <div className="rl-tagrow" style={{ marginTop: 0 }}>
                    <span className="rl-genre-tag">{e.title}</span>
                    <span>page {e.page} &middot; {e.date}</span>
                  </div>
                  {e.quote && <div className="rl-review" style={{ borderTop: "none", paddingTop: 6, marginTop: 6 }}>&ldquo;{e.quote}&rdquo;</div>}
                  <div style={{ fontSize: 13, marginTop: 6 }}>{e.idea}</div>
                  {(e.tags || []).length > 0 && (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {e.tags.map((t) => <span key={t} className="rl-reason-tag" style={{ background: "var(--brass)" }}>{t}</span>)}
                    </div>
                  )}
                  {e.followUpQuestion && (
                    <div className="rl-note" style={{ marginTop: 8, marginBottom: 0 }}>
                      <strong>{e.followUpQuestion}</strong><br />{e.followUpAnswer}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}

        {Object.keys(genreCounts).length > 0 && (
          <>
            <div className="rl-section-title">Genres</div>
            {Object.entries(genreCounts).sort((a, b) => b[1] - a[1]).map(([genre, count]) => (
              <div className="rl-bar-row" key={genre}>
                <div className="rl-bar-label">{genre}</div>
                <div className="rl-bar-track"><div className="rl-bar-fill" style={{ width: `${(count / maxGenre) * 100}%` }} /></div>
                <div className="rl-bar-val">{count}</div>
              </div>
            ))}
          </>
        )}

        {Object.keys(reasonCounts).length > 0 && (
          <>
            <div className="rl-section-title">Abandon Reasons</div>
            {Object.entries(reasonCounts).map(([reason, count]) => (
              <div className="rl-checkout-row" key={reason}>
                <span>{reason}</span>
                <span className="days">{count}</span>
              </div>
            ))}
          </>
        )}

        <div className="rl-section-title">All Books</div>
        <div style={{ maxHeight: 220, overflowY: "auto" }}>
          {sortedEntries.map((e) => (
            <div className="rl-checkout-row" key={e.id}>
              <span>{e.title} <span style={{ color: "var(--ink-soft)" }}>({e.status}{e.status === "finished" ? `, ${e.rating}/10` : ""})</span></span>
              <span className="days" style={{ color: "var(--ink-soft)" }}>{e.dateStarted}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ReadingStatusPanel({ uid, myName, isTeacher, students, readingLog, statusEntries, onAdd }) {
  const [targetStudentId, setTargetStudentId] = useState(isTeacher ? "" : uid);
  const [logEntryId, setLogEntryId] = useState("");
  const [page, setPage] = useState("");
  const [date, setDate] = useState(todayStr());
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const effectiveStudentId = isTeacher ? targetStudentId : uid;
  const candidateBooks = readingLog.filter((e) => e.studentId === effectiveStudentId && e.status === "reading");

  async function handleSubmit() {
    if (!effectiveStudentId || !logEntryId || !page) return;
    const entry = candidateBooks.find((e) => e.id === logEntryId);
    if (!entry) return;
    setSaving(true);
    try {
      await onAdd({ studentId: effectiveStudentId, logEntryId, title: entry.title, page: parseInt(page, 10), date, note, enteredByName: myName });
      setPage("");
      setNote("");
    } finally {
      setSaving(false);
    }
  }

  // Group all check-ins by which book they're tracking, sorted oldest-first,
  // so pace (pages/day) can be computed between consecutive entries.
  const byLogEntry = {};
  statusEntries.forEach((e) => {
    byLogEntry[e.logEntryId] = byLogEntry[e.logEntryId] || [];
    byLogEntry[e.logEntryId].push(e);
  });
  Object.keys(byLogEntry).forEach((k) => { byLogEntry[k] = sortStatusAsc(byLogEntry[k]); });

  const myPace = !isTeacher
    ? candidateBooks.map((book) => {
        const entries = byLogEntry[book.id] || [];
        if (entries.length < 2) return null;
        const first = entries[0], last = entries[entries.length - 1];
        const days = Math.max(1, daysSince(first.date) - daysSince(last.date));
        const pages = last.page - first.page;
        return { title: book.title, pages, days, rate: (pages / days).toFixed(1) };
      }).filter(Boolean)
    : [];

  // Class-wide momentum (teacher only): total pages logged in the last 7
  // days, and which students haven't checked in for a week or more.
  let weeklyPages = 0;
  Object.values(byLogEntry).forEach((arr) => {
    for (let i = 1; i < arr.length; i++) {
      const delta = arr[i].page - arr[i - 1].page;
      if (delta > 0 && daysSince(arr[i].date) <= 7) weeklyPages += delta;
    }
  });
  const lastUpdatePerStudent = {};
  statusEntries.forEach((e) => {
    if (!lastUpdatePerStudent[e.studentId] || e.date > lastUpdatePerStudent[e.studentId]) {
      lastUpdatePerStudent[e.studentId] = e.date;
    }
  });
  const noRecentUpdate = isTeacher
    ? students.filter((s) => !lastUpdatePerStudent[s.id] || daysSince(lastUpdatePerStudent[s.id]) > 7)
    : [];

  const recent = sortStatusDesc(statusEntries)
    .slice(0, 15)
    .reverse()
    .map((e) => ({ ...e, studentName: students.find((s) => s.id === e.studentId)?.name || "Unknown" }));

  return (
    <>
      <div className="rl-section-title">Log a Status Update</div>
      <div className="rl-card" style={{ marginBottom: 22 }}>
        {isTeacher && (
          <div className="rl-field">
            <label>For which student?</label>
            <select value={targetStudentId} onChange={(e) => { setTargetStudentId(e.target.value); setLogEntryId(""); }}>
              <option value="">Choose a student...</option>
              {students.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
        <div className="rl-field">
          <label>Which book?</label>
          <select value={logEntryId} onChange={(e) => setLogEntryId(e.target.value)} disabled={!effectiveStudentId}>
            <option value="">{effectiveStudentId ? "Choose a book..." : "Pick a student first"}</option>
            {candidateBooks.map((b) => <option key={b.id} value={b.id}>{b.title}</option>)}
          </select>
          {effectiveStudentId && candidateBooks.length === 0 && (
            <div className="rl-isbn-status">No books currently in progress for this student.</div>
          )}
        </div>
        <div className="rl-field"><label>Page</label><input type="number" min="0" value={page} onChange={(e) => setPage(e.target.value)} placeholder="e.g. 142" /></div>
        <div className="rl-field"><label>Date</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
        <div className="rl-field"><label>Note (optional)</label><textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth flagging — stuck on a section, reading ahead, etc." /></div>
        <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center" }} disabled={saving || !logEntryId || !page} onClick={handleSubmit}>
          {saving ? "Saving..." : "Log Status Update"}
        </button>
      </div>

      {!isTeacher && myPace.length > 0 && (
        <>
          <div className="rl-section-title">Your Pace</div>
          {myPace.map((p, i) => (
            <div className="rl-checkout-row" key={i}>
              <span>{p.title}</span>
              <span className="days" style={{ color: "var(--green-deep)" }}>{p.pages} pages / {p.days} days (~{p.rate}/day)</span>
            </div>
          ))}
        </>
      )}

      {isTeacher && (
        <>
          <div className="rl-section-title">Class Momentum</div>
          <div className="rl-stat-grid">
            <div className="rl-stat"><div className="num">{weeklyPages}</div><div className="label">Pages This Week</div></div>
            <div className="rl-stat"><div className="num">{noRecentUpdate.length}</div><div className="label">No Update in 7+ Days</div></div>
          </div>
          {noRecentUpdate.length > 0 && (
            <div className="rl-card" style={{ marginBottom: 20 }}>
              {noRecentUpdate.map((s) => (
                <div className="rl-checkout-row" key={s.id}>
                  <span>{s.name}</span>
                  <span className="days">{lastUpdatePerStudent[s.id] ? `${daysSince(lastUpdatePerStudent[s.id])} days ago` : "no check-ins yet"}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      <div className="rl-section-title">Recent Check-Ins</div>
      {recent.length === 0 ? (
        <div className="rl-empty">No status updates logged yet.</div>
      ) : (
        <div className="rl-card">
          {recent.map((e) => (
            <div className="rl-checkout-row" key={e.id}>
              <span><span className="who">{e.studentName}</span> — {e.title}: page {e.page}</span>
              <span className="days" style={{ color: "var(--ink-soft)" }}>{e.date}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function WishlistForm({ onSubmit }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  return (
    <div className="rl-card" style={{ marginTop: 4 }}>
      <div className="rl-field"><label>Book Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="A book you wish we had..." /></div>
      <div className="rl-field"><label>Author (if known)</label><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" /></div>
      <button className="rl-btn solid" disabled={!title.trim()} onClick={() => { onSubmit(title.trim(), author.trim()); setTitle(""); setAuthor(""); }}>
        Request This Book
      </button>
    </div>
  );
}

function EditEntryModal({ book, onClose, onSave }) {
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);
  const [genre, setGenre] = useState(book.genre);
  const [dateStarted, setDateStarted] = useState(book.dateStarted);
  const [dateFinished, setDateFinished] = useState(book.dateFinished || "");
  const [dateAbandoned, setDateAbandoned] = useState(book.dateAbandoned || "");
  const [rating, setRating] = useState(book.rating || 0);
  const [hook, setHook] = useState(book.hook || "");
  const [setup, setSetup] = useState(book.setup || "");
  const [stakes, setStakes] = useState(book.stakes || "");
  const [pitch, setPitch] = useState(book.pitch || "");
  const legacyReview = !book.hook && !book.setup && !book.stakes && !book.pitch ? (book.review || "") : "";
  const isKnownReason = ABANDON_REASONS.includes(book.reason);
  const [reason, setReason] = useState(isKnownReason ? book.reason : ABANDON_OTHER);
  const [customReason, setCustomReason] = useState(isKnownReason ? "" : (book.reason || ""));
  const isOther = reason === ABANDON_OTHER;
  const [reflectionToAuthor, setReflectionToAuthor] = useState(book.reflectionToAuthor || "");
  const [reflectionNextTime, setReflectionNextTime] = useState(book.reflectionNextTime || "");
  const [pagesReadAtAbandon, setPagesReadAtAbandon] = useState(book.pagesReadAtAbandon ?? "");
  const [totalPages, setTotalPages] = useState(book.totalPages ?? "");

  function handleSave() {
    const updates = { title, author, genre, dateStarted, totalPages: totalPages === "" ? null : parseInt(totalPages, 10) };
    if (book.status === "finished") {
      updates.dateFinished = dateFinished;
      updates.rating = rating;
      updates.hook = hook;
      updates.setup = setup;
      updates.stakes = stakes;
      updates.pitch = pitch;
    }
    if (book.status === "abandoned") {
      updates.dateAbandoned = dateAbandoned;
      updates.reason = isOther ? customReason.trim() : reason;
      updates.reflectionToAuthor = reflectionToAuthor;
      updates.reflectionNextTime = reflectionNextTime;
      updates.pagesReadAtAbandon = pagesReadAtAbandon === "" ? null : parseInt(pagesReadAtAbandon, 10);
    }
    onSave(updates);
  }

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose}><X size={18} /></button>
        <h3>Edit Entry</h3>
        <div className="rl-field"><label>Title</label><input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        <div className="rl-field"><label>Author</label><input value={author} onChange={(e) => setAuthor(e.target.value)} /></div>
        <div className="rl-field"><label>Genre</label>
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="rl-field"><label>Date Started</label><input type="date" value={dateStarted} onChange={(e) => setDateStarted(e.target.value)} /></div>
        <div className="rl-field"><label>Total Pages</label><input type="number" min="1" value={totalPages} onChange={(e) => setTotalPages(e.target.value)} placeholder="e.g. 320" /></div>
        {book.status === "finished" && (
          <>
            <div className="rl-field"><label>Date Finished</label><input type="date" value={dateFinished} onChange={(e) => setDateFinished(e.target.value)} /></div>
            <div className="rl-field">
              <label>Rating (1–10)</label>
              <div className="rl-rating-row">
                {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                  <button key={n} type="button" className={`rl-rate-pip ${rating >= n ? "on" : ""}`} onClick={() => setRating(n)}>{n}</button>
                ))}
              </div>
            </div>
            {legacyReview && (
              <div className="rl-note" style={{ marginBottom: 10 }}>This was saved before the booktalk format — old review: &ldquo;{legacyReview}&rdquo; Fill in the fields below to replace it.</div>
            )}
            <div className="rl-field"><label>The Hook</label><textarea value={hook} onChange={(e) => setHook(e.target.value)} /></div>
            <div className="rl-field"><label>The Setup</label><textarea value={setup} onChange={(e) => setSetup(e.target.value)} /></div>
            <div className="rl-field"><label>The Stakes</label><textarea value={stakes} onChange={(e) => setStakes(e.target.value)} /></div>
            <div className="rl-field"><label>The Pitch</label><textarea value={pitch} onChange={(e) => setPitch(e.target.value)} /></div>
          </>
        )}
        {book.status === "abandoned" && (
          <>
            <div className="rl-field"><label>Date Abandoned</label><input type="date" value={dateAbandoned} onChange={(e) => setDateAbandoned(e.target.value)} /></div>
            <div className="rl-field"><label>Reason</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {ABANDON_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {isOther && (
              <div className="rl-field"><label>In your own words</label><textarea value={customReason} onChange={(e) => setCustomReason(e.target.value)} /></div>
            )}
            <div className="rl-field"><label>Pages Read</label><input type="number" min="0" value={pagesReadAtAbandon} onChange={(e) => setPagesReadAtAbandon(e.target.value)} /></div>
            <div className="rl-field"><label>To the author</label><textarea value={reflectionToAuthor} onChange={(e) => setReflectionToAuthor(e.target.value)} /></div>
            <div className="rl-field"><label>Next time</label><textarea value={reflectionNextTime} onChange={(e) => setReflectionNextTime(e.target.value)} /></div>
          </>
        )}
        <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center" }} disabled={!title || !author} onClick={handleSave}>
          Save Changes
        </button>
      </div>
    </div>
  );
}

// Searches only the classroom's own shelf (already-loaded data, no API call) —
// used for students starting a new book, so lookup can't wander off to any
// book in the world, only what's actually in the room.
function LibraryOnlyAutocomplete({ value, onChange, onPick, library }) {
  const [open, setOpen] = useState(false);

  const matches = value.trim().length >= 2
    ? library.filter((b) =>
        b.title.toLowerCase().includes(value.trim().toLowerCase()) ||
        b.author.toLowerCase().includes(value.trim().toLowerCase())
      ).slice(0, 6)
    : [];

  function pick(book) {
    onPick(book);
    setOpen(false);
  }

  return (
    <div className="rl-field rl-autocomplete-wrap">
      <label>Title</label>
      <input
        value={value}
        onChange={(e) => { onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Search the classroom shelf..."
        autoComplete="off"
      />
      {open && matches.length > 0 && (
        <div className="rl-autocomplete-list">
          {matches.map((b) => (
            <div key={b.id} className="rl-autocomplete-item" onMouseDown={() => pick(b)}>
              {b.cover ? <img src={b.cover} alt="" /> : null}
              <span><strong>{b.title}</strong><span className="a"> — {b.author}</span></span>
            </div>
          ))}
        </div>
      )}
      {open && value.trim().length >= 2 && matches.length === 0 && (
        <div className="rl-autocomplete-list"><div className="rl-autocomplete-item" style={{ cursor: "default", color: "var(--ink-soft)" }}>Not on the shelf — you can still type the title in manually below if you're reading it from elsewhere.</div></div>
      )}
    </div>
  );
}

function TitleAutocomplete({ value, onChange, onPick }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const debounceRef = useRef(null);

  function handleChange(e) {
    const val = e.target.value;
    onChange(val);
    clearTimeout(debounceRef.current);
    if (val.trim().length < 3) {
      setResults([]);
      setOpen(false);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await searchByTitle(val);
        setResults(r);
        setOpen(r.length > 0);
      } catch {
        setResults([]);
        setOpen(false);
      } finally {
        setSearching(false);
      }
    }, 350);
  }

  function pick(r) {
    onPick(r);
    setOpen(false);
  }

  return (
    <div className="rl-field rl-autocomplete-wrap">
      <label>Title</label>
      <input
        value={value}
        onChange={handleChange}
        onFocus={() => results.length > 0 && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        placeholder="Start typing a title..."
        autoComplete="off"
      />
      {searching && <div className="rl-isbn-status">Searching...</div>}
      {open && (
        <div className="rl-autocomplete-list">
          {results.map((r, i) => (
            <div key={i} className="rl-autocomplete-item" onMouseDown={() => pick(r)}>
              {r.cover ? <img src={r.cover} alt="" /> : null}
              <span><strong>{r.title}</strong>{r.author ? <span className="a"> — {r.author}</span> : null}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function IsbnLookupField({ onFound }) {
  const [isbn, setIsbn] = useState("");
  const [status, setStatus] = useState("");

  async function handleLookup() {
    if (!isbn.trim()) return;
    setStatus("Looking up...");
    try {
      const result = await lookupISBN(isbn.trim());
      if (result) {
        setStatus(`Found: ${result.title}`);
        onFound({ ...result, genre: guessGenre(result.subjects || []) });
      } else {
        setStatus("No match found — enter details manually below.");
      }
    } catch {
      setStatus("Couldn't reach the lookup service — enter details manually below.");
    }
  }

  return (
    <div className="rl-field">
      <label>ISBN (optional — auto-fills title, author, cover)</label>
      <div className="rl-isbn-row">
        <input value={isbn} onChange={(e) => setIsbn(e.target.value)} placeholder="e.g. 9780062498533" />
        <button type="button" className="rl-btn" onClick={handleLookup}><Search size={12} /> Look Up</button>
      </div>
      {status && <div className="rl-isbn-status">{status}</div>}
    </div>
  );
}

function AddBookModal({ onClose, onSave, library }) {
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [dateStarted, setDateStarted] = useState(todayStr());
  const [totalPages, setTotalPages] = useState("");
  const [isbn, setIsbn] = useState(null);
  const [cover, setCover] = useState(null);
  const [whyThisBook, setWhyThisBook] = useState("");
  const [interviewTechniques, setInterviewTechniques] = useState([]);
  const [priorKnowledge, setPriorKnowledge] = useState("");

  function handlePick(book) {
    setTitle(book.title);
    setAuthor(book.author);
    setGenre(book.genre);
    setIsbn(book.isbn);
    setCover(book.cover);
    if (book.totalPages) setTotalPages(String(book.totalPages));
  }

  function toggleTechnique(t) {
    setInterviewTechniques((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose}><X size={18} /></button>
        <h3>Start a New Book</h3>
        <LibraryOnlyAutocomplete value={title} onChange={setTitle} onPick={handlePick} library={library} />
        <div className="rl-field"><label>Author</label><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" /></div>
        <div className="rl-field"><label>Genre</label>
          <select value={genre} onChange={(e) => setGenre(e.target.value)}>
            {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
          </select>
        </div>
        <div className="rl-field"><label>Date Started</label><input type="date" value={dateStarted} onChange={(e) => setDateStarted(e.target.value)} /></div>
        <div className="rl-field"><label>Total Pages (optional — powers your progress bar)</label><input type="number" min="1" value={totalPages} onChange={(e) => setTotalPages(e.target.value)} placeholder="e.g. 320" /></div>

        <div className="rl-field"><label>Why this book, now?</label><textarea value={whyThisBook} onChange={(e) => setWhyThisBook(e.target.value)} placeholder="What made you pick this one, today?" /></div>
        <div className="rl-field">
          <label>How did you interview it? (check any that apply)</label>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "6px 14px" }}>
            {INTERVIEW_TECHNIQUES.map((t) => (
              <label key={t} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 12.5, fontFamily: "Georgia, serif" }}>
                <input type="checkbox" checked={interviewTechniques.includes(t)} onChange={() => toggleTechnique(t)} /> {t}
              </label>
            ))}
          </div>
        </div>
        <div className="rl-field"><label>What do you already know or are familiar with about the story?</label><textarea value={priorKnowledge} onChange={(e) => setPriorKnowledge(e.target.value)} placeholder="Anything you already know — from a movie, a friend, the series, class..." /></div>

        <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center" }} disabled={!title || !author} onClick={() => onSave({ title, author, genre, dateStarted, isbn, cover, whyThisBook, interviewTechniques, priorKnowledge, totalPages: totalPages ? parseInt(totalPages, 10) : null })}>
          Add to My Log <ChevronRight size={14} />
        </button>
      </div>
    </div>
  );
}

function AddLibraryBookModal({ onClose, onSave, onBatchAddOne }) {
  const [mode, setMode] = useState("single"); // "single" | "batch"
  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("");
  const [genre, setGenre] = useState(GENRES[0]);
  const [isbn, setIsbn] = useState(null);
  const [cover, setCover] = useState(null);
  const [copies, setCopies] = useState(1);
  const [totalPages, setTotalPages] = useState("");

  function handleFound(result) {
    setTitle(result.title);
    setAuthor(result.author);
    setGenre(result.genre);
    setIsbn(result.isbn);
    setCover(result.cover);
    if (result.pages) setTotalPages(String(result.pages));
  }

  function handlePick(result) {
    setTitle(result.title);
    setAuthor(result.author);
    setGenre(guessGenre(result.subjects || []));
    setIsbn(result.isbn);
    setCover(result.cover);
  }

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose}><X size={18} /></button>
        <h3>Add Title{mode === "batch" ? "s" : ""} to Shelf</h3>
        <div className="rl-btnrow" style={{ marginTop: -4, marginBottom: 14 }}>
          <button className={`rl-btn small ${mode === "single" ? "solid" : ""}`} onClick={() => setMode("single")}>One at a Time</button>
          <button className={`rl-btn small ${mode === "batch" ? "solid" : ""}`} onClick={() => setMode("batch")}>Batch Add</button>
        </div>

        {mode === "single" ? (
          <>
            <TitleAutocomplete value={title} onChange={setTitle} onPick={handlePick} />
            <div className="rl-note" style={{ marginTop: -6, marginBottom: 12 }}>Or look it up by ISBN instead:</div>
            <IsbnLookupField onFound={handleFound} />
            <div className="rl-field"><label>Author</label><input value={author} onChange={(e) => setAuthor(e.target.value)} placeholder="Author name" /></div>
            <div className="rl-field"><label>Genre</label>
              <select value={genre} onChange={(e) => setGenre(e.target.value)}>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div className="rl-field"><label>Number of Copies</label><input type="number" min="1" max="20" value={copies} onChange={(e) => setCopies(Math.max(1, parseInt(e.target.value) || 1))} /></div>
            <div className="rl-field">
              <label>Total Pages</label>
              <input type="number" min="1" value={totalPages} onChange={(e) => setTotalPages(e.target.value)} placeholder="e.g. 320" />
              <div className="rl-isbn-status">Auto-filled by ISBN lookup when available — not every book has this data, so check it or fill it in.</div>
            </div>
            <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center" }} disabled={!title || !author} onClick={() => onSave({ title, author, genre, isbn, cover, copies, totalPages: totalPages ? parseInt(totalPages, 10) : null })}>
              Add to Shelf <ChevronRight size={14} />
            </button>
          </>
        ) : (
          <BatchAddPanel onAddOne={onBatchAddOne} onDone={onClose} />
        )}
      </div>
    </div>
  );
}

function BatchAddPanel({ onAddOne, onDone }) {
  const [text, setText] = useState("");
  const [rows, setRows] = useState([]);
  const [running, setRunning] = useState(false);

  function parseLines() {
    return text
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .map((line) => {
        const parts = line.split(",").map((s) => s.trim());
        const isbn = parts[0];
        const copies = Math.max(1, parseInt(parts[1], 10) || 1);
        return { isbn, copies };
      });
  }

  async function runBatch() {
    const parsed = parseLines();
    setRows(parsed.map((p) => ({ ...p, status: "pending", message: "" })));
    setRunning(true);
    for (let i = 0; i < parsed.length; i++) {
      const { isbn, copies } = parsed[i];
      try {
        const result = await lookupISBN(isbn);
        if (!result) {
          setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "error", message: "ISBN not found" } : r)));
          continue;
        }
        await onAddOne({
          title: result.title, author: result.author,
          genre: guessGenre(result.subjects || []),
          isbn: result.isbn, cover: result.cover, copies,
          totalPages: result.pages || null,
        });
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "ok", message: result.title } : r)));
      } catch {
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, status: "error", message: "Lookup failed" } : r)));
      }
    }
    setRunning(false);
  }

  const doneCount = rows.filter((r) => r.status !== "pending").length;

  return (
    <div>
      <div className="rl-field">
        <label>Paste ISBNs, one per line</label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={"9780062498533\n9780786838653, 3\n9781442472426"}
          style={{ minHeight: 130, fontFamily: "'Courier New', monospace", fontSize: 12.5 }}
        />
        <div className="rl-isbn-status">Add ", 3" after an ISBN for 3 copies — otherwise it defaults to 1 copy.</div>
      </div>
      <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center" }} disabled={running || !text.trim()} onClick={runBatch}>
        {running ? `Adding... (${doneCount}/${rows.length})` : "Add All to Shelf"}
      </button>
      {rows.length > 0 && (
        <div style={{ marginTop: 12, maxHeight: 220, overflowY: "auto", border: "1px solid var(--line)", borderRadius: 3 }}>
          {rows.map((r, i) => (
            <div className="rl-checkout-row" key={i}>
              <span>{r.status === "ok" ? r.message : r.isbn}</span>
              <span style={{ fontFamily: "'Courier New', monospace", fontSize: 11, color: r.status === "error" ? "var(--rust)" : r.status === "ok" ? "var(--green)" : "var(--ink-soft)" }}>
                {r.status === "pending" ? "…" : r.status === "ok" ? "✓ added" : `✗ ${r.message}`}
              </span>
            </div>
          ))}
        </div>
      )}
      {!running && rows.length > 0 && doneCount === rows.length && (
        <button className="rl-btn" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} onClick={onDone}>
          Done — Close
        </button>
      )}
    </div>
  );
}

function CloseBookModal({ mode, book, statusEntries, onClose, onSave }) {
  const isFinish = mode === "finish";

  // ---- Finish (booktalk) state ----
  const [date, setDate] = useState(todayStr());
  const [rating, setRating] = useState(0);
  const [hook, setHook] = useState("");
  const [setup, setSetup] = useState("");
  const [stakes, setStakes] = useState("");
  const [pitch, setPitch] = useState("");
  const combinedTalk = [hook, setup, stakes, pitch].filter(Boolean).join(" ");
  const sentenceCount = countSentences(combinedTalk);
  const talkSpoiler = spoilerCheck(combinedTalk);
  const canFinish = rating > 0 && sentenceCount >= 8;

  // ---- Abandon (3-step) state ----
  const [step, setStep] = useState(0); // 0 = nudge, 1 = reason, 2 = reflection
  const mostRecentStatus = sortStatusDesc(statusEntries || [])[0];
  const [checkedTried, setCheckedTried] = useState([]);
  const [pagesRead, setPagesRead] = useState(mostRecentStatus ? String(mostRecentStatus.page) : "");
  const [reason, setReason] = useState(ABANDON_REASONS[0]);
  const [customReason, setCustomReason] = useState("");
  const isOther = reason === ABANDON_OTHER;
  const [reflectionToAuthor, setReflectionToAuthor] = useState("");
  const [reflectionNextTime, setReflectionNextTime] = useState("");
  const canAbandon = (!isOther || customReason.trim().length > 0)
    && reflectionToAuthor.trim().length > 0 && reflectionNextTime.trim().length > 0;

  function toggleTried(item) {
    setCheckedTried((prev) => (prev.includes(item) ? prev.filter((x) => x !== item) : [...prev, item]));
  }

  function handleFinishSave() {
    onSave({ date, rating, hook, setup, stakes, pitch });
  }

  function handleAbandonSave() {
    onSave({
      date, reason: isOther ? customReason.trim() : reason,
      pagesRead: pagesRead ? parseInt(pagesRead, 10) : null,
      reflectionToAuthor: reflectionToAuthor.trim(),
      reflectionNextTime: reflectionNextTime.trim(),
    });
  }

  if (isFinish) {
    return (
      <div className="rl-overlay" onClick={onClose}>
        <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
          <button className="rl-close" onClick={onClose}><X size={18} /></button>
          <h3>Finish This Book — Give It a Booktalk</h3>
          <div className="rl-field"><label>Date Finished</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
          <div className="rl-field">
            <label>Rating (1–10)</label>
            <div className="rl-rating-row">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                <button key={n} type="button" className={`rl-rate-pip ${rating >= n ? "on" : ""}`} onClick={() => setRating(n)}>{n}</button>
              ))}
            </div>
          </div>
          <div className="rl-field"><label>The Hook — one line that makes someone want to pick this up</label><textarea value={hook} onChange={(e) => setHook(e.target.value)} placeholder="A question, a bold claim, a moment — no spoilers." /></div>
          <div className="rl-field"><label>The Setup — who is this about, and what's their situation?</label><textarea value={setup} onChange={(e) => setSetup(e.target.value)} /></div>
          <div className="rl-field"><label>The Stakes — what's the central problem or question driving the story?</label><textarea value={stakes} onChange={(e) => setStakes(e.target.value)} /></div>
          <div className="rl-field"><label>The Pitch — who'd love this, and why? What did it leave you thinking about?</label><textarea value={pitch} onChange={(e) => setPitch(e.target.value)} /></div>
          <div className="rl-isbn-status" style={{ marginBottom: 8 }}>
            {sentenceCount} sentence{sentenceCount === 1 ? "" : "s"} so far {sentenceCount < 8 ? "(need at least 8)" : "— nice, you're there"}
          </div>
          {talkSpoiler ? (
            <div className="rl-spoiler-hint warn"><AlertTriangle size={12} /> That might give away what happens — double check before you save.</div>
          ) : (
            <div className="rl-spoiler-hint">Save the ending for someone who reads the book themselves.</div>
          )}
          <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center", marginTop: 10 }} disabled={!canFinish} onClick={handleFinishSave}>
            Save & Finish
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rl-overlay" onClick={onClose}>
      <div className="rl-modal" onClick={(e) => e.stopPropagation()}>
        <button className="rl-close" onClick={onClose}><X size={18} /></button>
        <h3>Abandon This Book</h3>

        {step === 0 && (
          <>
            <div className="rl-note" style={{ marginBottom: 12 }}>Before you decide, have you tried any of these?</div>
            {PRE_ABANDON_CHECKLIST.map((item) => (
              <label key={item} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, marginBottom: 6, fontFamily: "Georgia, serif" }}>
                <input type="checkbox" checked={checkedTried.includes(item)} onChange={() => toggleTried(item)} /> {item}
              </label>
            ))}
            <div className="rl-field" style={{ marginTop: 14 }}>
              <label>How many pages did you read?</label>
              <input type="number" min="0" value={pagesRead} onChange={(e) => setPagesRead(e.target.value)} placeholder="e.g. 40" />
              {mostRecentStatus && <div className="rl-isbn-status">Pulled from your last Reading Status check-in — change it if that's not right.</div>}
            </div>
            <button className="rl-btn solid" style={{ width: "100%", justifyContent: "center", background: "#A64B2A", borderColor: "#A64B2A" }} onClick={() => setStep(1)}>
              I've Tried Enough — Continue <ChevronRight size={14} />
            </button>
          </>
        )}

        {step === 1 && (
          <>
            <div className="rl-field">
              <label>Why are you abandoning it?</label>
              <select value={reason} onChange={(e) => setReason(e.target.value)}>
                {ABANDON_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            {isOther && (
              <div className="rl-field">
                <label>In your own words</label>
                <textarea value={customReason} onChange={(e) => setCustomReason(e.target.value)} placeholder="What made you stop reading this one?" />
              </div>
            )}
            <div className="rl-field"><label>Date Abandoned</label><input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>
            <div className="rl-btnrow">
              <button className="rl-btn" onClick={() => setStep(0)}>Back</button>
              <button className="rl-btn solid" style={{ flex: 1, justifyContent: "center", background: "#A64B2A", borderColor: "#A64B2A" }} disabled={isOther && !customReason.trim()} onClick={() => setStep(2)}>
                Continue <ChevronRight size={14} />
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            {book && book.whyThisBook && (
              <div className="rl-note" style={{ marginBottom: 14 }}>
                <strong>What you said when you started this book:</strong><br />
                &ldquo;{book.whyThisBook}&rdquo;
              </div>
            )}
            <div className="rl-field">
              <label>List one specific reason you abandoned this book — address it directly to the author.</label>
              <textarea value={reflectionToAuthor} onChange={(e) => setReflectionToAuthor(e.target.value)} placeholder={`I thought that ${book && book.author ? book.author : "the author"} could have...`} />
            </div>
            <div className="rl-field">
              <label>What could you do differently next time when interviewing a book? List two, be specific.</label>
              <textarea value={reflectionNextTime} onChange={(e) => setReflectionNextTime(e.target.value)} placeholder="Next time I could..." />
            </div>
            <div className="rl-btnrow">
              <button className="rl-btn" onClick={() => setStep(1)}>Back</button>
              <button className="rl-btn solid" style={{ flex: 1, justifyContent: "center", background: "#A64B2A", borderColor: "#A64B2A" }} disabled={!canAbandon} onClick={handleAbandonSave}>
                Mark as Abandoned
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
