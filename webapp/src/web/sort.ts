// sort.ts - Library sort orders (pure, unit tested).
import type { MessageSummary } from "../shared/types";

export type SortKey = "date" | "title" | "drafts" | "published" | "favourites";

export const SORTS: [SortKey, string][] = [
  ["date", "Date (newest first)"],
  ["title", "Title (A–Z)"],
  ["drafts", "Drafts first"],
  ["published", "Published first"],
  ["favourites", "Favourites first"],
];

/** Newest edit first; the other orders group first, then fall back to newest. */
export function sortMessages(items: MessageSummary[], key: SortKey): MessageSummary[] {
  const newest = (a: MessageSummary, b: MessageSummary) => b.updatedAt - a.updatedAt || b.createdAt - a.createdAt;
  const first = (pred: (m: MessageSummary) => boolean) => (a: MessageSummary, b: MessageSummary) => Number(pred(b)) - Number(pred(a)) || newest(a, b);
  const cmp = {
    date: newest,
    title: (a: MessageSummary, b: MessageSummary) => a.title.localeCompare(b.title, undefined, { sensitivity: "base", numeric: true }) || newest(a, b),
    drafts: first((m) => m.status === "draft"),
    published: first((m) => m.status !== "draft"),
    favourites: first((m) => m.favourite),
  }[key];
  return [...items].sort(cmp);
}
