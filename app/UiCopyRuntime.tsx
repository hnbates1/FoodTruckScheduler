"use client";

import { useEffect } from "react";

const COPY_REPLACEMENTS = new Map<string, string>([
  // Authentication and account access.
  ["Create administrator", "Create Administrator"],
  ["Welcome back", "Welcome Back"],
  ["Sign in", "Sign In"],
  ["Sign out", "Sign Out"],
  ["Administrator access required", "Administrator Access Required"],
  ["← Back to dashboard", "← Back to Dashboard"],
  ["Add a coworker", "Add a Coworker"],
  ["Public schedule link", "Public Schedule Link"],
  ["Create account", "Create Account"],
  ["Copy link", "Copy Link"],
  ["Rotate link", "Rotate Link"],
  ["Create public schedule link", "Create Public Schedule Link"],

  // Main navigation and scheduling actions.
  ["Schedule a food truck", "Schedule a Food Truck"],
  ["Create truck profile", "Create Truck Profile"],
  ["Search again", "Search Again"],
  ["Use this listing", "Use This Listing"],
  ["Record outcome", "Record Outcome"],
  ["× Delete shift", "× Delete Shift"],
  ["＋ Add shift here", "＋ Add Shift Here"],
  ["Schedule this truck →", "Schedule This Truck →"],

  // Truck profile headings and controls.
  ["Weekly availability", "Weekly Availability"],
  ["Operations notes", "Operations Notes"],
  ["Google rating", "Google Rating"],
  ["Review summary", "Review Summary"],
  ["No truck profiles yet", "No Truck Profiles Yet"],
  ["No available match", "No Available Match"],
  ["Change logo", "Change Logo"],
  ["＋ Add logo", "＋ Add Logo"],
  ["Remove logo", "Remove Logo"],
  ["Load live Google rating", "Load Live Google Rating"],
  ["Try again", "Try Again"],
  ["Find Google listing", "Find Google Listing"],
  ["Refresh live rating", "Refresh Live Rating"],
  ["Change match", "Change Match"],

  // Comments and history.
  ["Comments & history", "Comments & History"],
  ["Save comment", "Save Comment"],
  ["Save changes", "Save Changes"],

  // Insights and location.
  ["Cuisine mix", "Cuisine Mix"],
  ["Hours of operation", "Hours of Operation"],
  ["Scheduled closures", "Scheduled Closures"],
  ["Site notes for vendors", "Site Notes for Vendors"],
  ["✎ Edit details", "✎ Edit Details"],
  ["Save location profile", "Save Location Profile"],

  // Forms, dialogs, and recovery screens.
  ["Accepted payment types", "Accepted Payment Types"],
  ["How reliability is averaged", "How Reliability Is Averaged"],
  ["Save outcome and recalculate", "Save Outcome and Recalculate"],
  ["Add to schedule", "Add to Schedule"],
  ["That schedule view hit a bad record", "That Schedule View Hit a Bad Record"],

  // Public schedule and legal pages.
  ["Schedule unavailable", "Schedule Unavailable"],
  ["No upcoming visits", "No Upcoming Visits"],
  ["Terms of use", "Terms of Use"],
  ["Online ratings", "Online Ratings"],
  ["Google business information", "Google Business Information"],
  ["Account information", "Account Information"],
  ["Google terms", "Google Terms"],
]);

const SIMPLE_TEXT_SELECTOR = [
  "h1",
  "h2",
  "h3",
  "h4",
  "legend",
  "button",
  "a",
  ".google-summary > strong",
].join(",");

function replaceSimpleText(element: Element) {
  const current = element.textContent?.trim() || "";
  const replacement = COPY_REPLACEMENTS.get(current);
  if (!replacement || replacement === current) return;

  // Replace only elements whose visible label is plain text. This avoids
  // removing icons, badges, or other nested controls from structured buttons.
  if (element.children.length === 0) {
    element.textContent = replacement;
  }
}

function replaceDynamicHeading(element: Element) {
  if (element.children.length !== 0) return;
  const current = element.textContent || "";

  if (current.startsWith("Record outcome for ")) {
    element.textContent = `Record Outcome for ${current.slice("Record outcome for ".length)}`;
  }
}

function standardizeVisibleCopy() {
  document.querySelectorAll(SIMPLE_TEXT_SELECTOR).forEach((element) => {
    replaceSimpleText(element);
    replaceDynamicHeading(element);
  });
}

export default function UiCopyRuntime() {
  useEffect(() => {
    const timers = new Set<number>();
    let initialPolls = 0;

    function schedule(delay: number) {
      const timer = window.setTimeout(() => {
        timers.delete(timer);
        standardizeVisibleCopy();
      }, delay);
      timers.add(timer);
    }

    function handleInteraction() {
      schedule(0);
      schedule(75);
      schedule(300);
      schedule(900);
    }

    // Cover the initial authenticated render and asynchronously loaded panels,
    // then stop polling. Later view changes are handled by interaction events.
    const initialTimer = window.setInterval(() => {
      initialPolls += 1;
      standardizeVisibleCopy();
      if (initialPolls >= 20) window.clearInterval(initialTimer);
    }, 400);

    standardizeVisibleCopy();
    document.addEventListener("click", handleInteraction, { passive: true });
    document.addEventListener("change", handleInteraction, { passive: true });
    document.addEventListener("focusin", handleInteraction, { passive: true });

    return () => {
      window.clearInterval(initialTimer);
      timers.forEach((timer) => window.clearTimeout(timer));
      document.removeEventListener("click", handleInteraction);
      document.removeEventListener("change", handleInteraction);
      document.removeEventListener("focusin", handleInteraction);
    };
  }, []);

  return null;
}
