// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { expect, it } from "vitest";
import { useNewRowIds } from "./useNewRowIds";
it("only highlights ids introduced after the first load", () => {
  const { result } = renderHook(() => useNewRowIds<{ id: string }>((item) => item.id));
  act(() => result.current.track([{ id: "a" }]));
  expect(result.current.newIds.size).toBe(0);
  act(() => result.current.track([{ id: "a" }, { id: "b" }]));
  expect([...result.current.newIds]).toEqual(["b"]);
});
