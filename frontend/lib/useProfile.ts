"use client";
import { useLiveQuery } from "dexie-react-hooks";
import { db } from "./offline";

/** Profile from the local mirror (kept fresh by <Sync/>). null until the first sync. */
export function useProfile() {
  return useLiveQuery(() => db.profile.toCollection().first()) ?? null;
}
