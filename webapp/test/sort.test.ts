import { describe, expect, it } from "vitest";

import type { MessageSummary } from "../src/shared/types";
import { sortMessages } from "../src/web/sort";

const m = (id: string, title: string, status: MessageSummary["status"], updatedAt: number, favourite = false): MessageSummary =>
  ({ id, title, status, updatedAt, favourite, createdAt: 0, showAt: null, surprise: false, queuePos: null, hasPhoto: false });

const items = [
  m("a", "banana", "draft", 10),
  m("b", "Apple", "queued", 30, true),
  m("c", "cherry", "shown", 20),
  m("d", "apple 2", "draft", 40, true),
  m("e", "Apple 10", "scheduled", 5),
];
const ids = (k: Parameters<typeof sortMessages>[1]) => sortMessages(items, k).map((x) => x.id).join("");

describe("library sort", () => {
  it("date: newest edit first", () => expect(ids("date")).toBe("dbcae"));
  it("title: A-Z, ignoring case, numbers in order", () => expect(ids("title")).toBe("bdeac"));
  it("drafts first, then newest", () => expect(ids("drafts")).toBe("dabce"));
  it("published first, then newest", () => expect(ids("published")).toBe("bceda"));
  it("favourites first, then newest", () => expect(ids("favourites")).toBe("dbcae"));
  it("doesn't change the list it was given", () => {
    const before = items.map((x) => x.id).join("");
    sortMessages(items, "title");
    expect(items.map((x) => x.id).join("")).toBe(before);
  });
});
