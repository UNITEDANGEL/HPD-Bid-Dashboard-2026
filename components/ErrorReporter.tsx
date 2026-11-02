"use client";

import { useEffect } from "react";
import { installErrorReporting } from "../lib/app-errors";

// Script errors and failed promises on every page go to Claude (lib/app-errors), without names or numbers.
export default function ErrorReporter() {
  useEffect(() => {
    installErrorReporting(process.env.NEXT_PUBLIC_APP_NUMBER || process.env.NEXT_PUBLIC_APP_COMMIT || "");
  }, []);
  return null;
}
