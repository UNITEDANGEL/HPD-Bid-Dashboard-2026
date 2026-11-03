"use client";

import { useEffect, useState } from "react";

// Bigger words switch (owner idea, 3 Nov): one switch makes the words on every screen bigger, remembered on this phone.
// The layout script sets data-big-words before the first paint; app/globals.css does the sizing.
export default function BigWordsSwitch() {
  const [on, setOn] = useState(false);
  useEffect(() => {
    setOn(document.documentElement.hasAttribute("data-big-words"));
  }, []);
  const flip = () => {
    const next = !on;
    setOn(next);
    if (next) document.documentElement.setAttribute("data-big-words", "1");
    else document.documentElement.removeAttribute("data-big-words");
    try {
      localStorage.setItem("hpd-big-words", next ? "1" : "0");
    } catch {}
  };
  return (
    <button type="button" className="ios-settings-row hpd-big-words-switch" data-hpd-smoke="big-words-switch" aria-pressed={on} onClick={flip}>
      <span className="ios-list-icon">A+</span>
      <span>
        <strong>Bigger words</strong>
        <small>{on ? "On: all words are bigger. Tap to go back." : "Off. Tap to make all words bigger."}</small>
      </span>
      <span aria-hidden="true">{on ? "ON" : "OFF"}</span>
    </button>
  );
}
