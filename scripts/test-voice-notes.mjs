// The chat remembers what the owner tells it (3 Nov idea): "remember ..." is saved, "my notes" reads it back, and a
// note comes up again when that address is read.
import assert from "node:assert/strict";
import { loadLib } from "./daily-report.mjs";

const { parseCommand } = await loadLib("voice-agent");
const { notesFor, parseRemember } = await loadLib("voice-notes");
const c = parseCommand("Remember the super at 123 Main Street is in the basement.");
assert.equal(c.intent, "remember");
assert.equal(c.text, "the super at 123 Main Street is in the basement");
assert.equal(parseCommand("remember that the gate code is on the left").intent, "remember");
assert.equal(parseCommand("note to Claude make the buttons bigger").intent, "app-request");
for (const s of ["what did I tell you", "my notes", "show me my notes", "what do you remember"]) assert.equal(parseCommand(s).intent, "my-notes", s);
assert.equal(parseRemember("hello there"), null);
const notes = [{ text: "the super at 123 Main Street is in the basement", at: "x" }, { text: "dog at 55 Park Avenue", at: "x" }];
assert.equal(notesFor("123 Main Street, Bronx, NY 10451", notes).length, 1);
assert.equal(notesFor("55 Park Ave, Bronx", notes.slice(1)).length, 1);
assert.equal(notesFor("1230 Main Street", notes).length, 0);
console.log("PASS chat notes: remember, my notes, and the note comes back for the right address only");
