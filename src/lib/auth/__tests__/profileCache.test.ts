import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearCachedProfile, readCachedProfile, writeCachedProfile } from "@/lib/auth/profileCache";

// This module's whole job is talking to sessionStorage, which vitest's
// "node" environment doesn't provide — stub a minimal in-memory Storage
// rather than pulling in jsdom just for this one file (see Tooltip.test.tsx
// for the alternative, when a test actually needs a DOM).
function fakeStorage(): Storage {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => (store.has(key) ? store.get(key)! : null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => store.clear(),
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    get length() {
      return store.size;
    },
  } as Storage;
}

interface Profile {
  uid: string;
  role: string;
}

describe("profileCache", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", fakeStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("misses when nothing has been cached yet", () => {
    expect(readCachedProfile<Profile>("user-1")).toBeNull();
  });

  it("returns what was written, for the same uid", () => {
    writeCachedProfile<Profile>({ uid: "user-1", role: "owner" });
    expect(readCachedProfile<Profile>("user-1")).toEqual({ uid: "user-1", role: "owner" });
  });

  it("misses when the cached profile belongs to a different uid", () => {
    // Guards the sign-out/sign-in-as-someone-else edge case: user-2 must
    // never render user-1's stale cached profile, even for an instant.
    writeCachedProfile<Profile>({ uid: "user-1", role: "owner" });
    expect(readCachedProfile<Profile>("user-2")).toBeNull();
  });

  it("clearCachedProfile removes the entry so the next read misses", () => {
    writeCachedProfile<Profile>({ uid: "user-1", role: "owner" });
    clearCachedProfile();
    expect(readCachedProfile<Profile>("user-1")).toBeNull();
  });

  it("a later write for a new uid replaces the old entry", () => {
    writeCachedProfile<Profile>({ uid: "user-1", role: "owner" });
    writeCachedProfile<Profile>({ uid: "user-2", role: "staff" });
    expect(readCachedProfile<Profile>("user-1")).toBeNull();
    expect(readCachedProfile<Profile>("user-2")).toEqual({ uid: "user-2", role: "staff" });
  });

  it("treats corrupt JSON as a miss instead of throwing", () => {
    sessionStorage.setItem("air_auth_profile_v1", "{not valid json");
    expect(() => readCachedProfile<Profile>("user-1")).not.toThrow();
    expect(readCachedProfile<Profile>("user-1")).toBeNull();
  });

  it("treats an unavailable sessionStorage as a miss/no-op instead of throwing", () => {
    vi.stubGlobal("sessionStorage", {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {
        throw new Error("storage disabled");
      },
      removeItem: () => {
        throw new Error("storage disabled");
      },
    });

    expect(() => writeCachedProfile<Profile>({ uid: "user-1", role: "owner" })).not.toThrow();
    expect(() => readCachedProfile<Profile>("user-1")).not.toThrow();
    expect(readCachedProfile<Profile>("user-1")).toBeNull();
    expect(() => clearCachedProfile()).not.toThrow();
  });
});
