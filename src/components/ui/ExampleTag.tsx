// A small muted "Example" pill for records Luxor made up to show a screen working (provenance.origin "luxor-sample",
// src/types/provenance.ts). Never put it on the client's own data. Styles live in the L3 block of globals.css.

export const EXAMPLE_TAG_TEXT = "Sample data added by Luxor to show how this works. Replace it with your own any time.";

export function ExampleTag() {
  return (
    <span className="example-tag" title={EXAMPLE_TAG_TEXT} aria-label={EXAMPLE_TAG_TEXT}>Example</span>
  );
}
