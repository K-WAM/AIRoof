import { describe, expect, it } from "vitest";
import { addressOf, buildFrom, extractInlineImages, htmlToText } from "@/lib/comms/prepare";

describe("extractInlineImages", () => {
  it("swaps base64 data-URI images for cid references and returns the attachments", () => {
    const html = `<img src="data:image/jpeg;base64,QUJD" alt="a"/><img src='data:image/png;base64,REVG'/>`;
    const out = extractInlineImages(html);
    expect(out.html).not.toContain("data:image");
    expect(out.html).toContain('src="cid:img1@luxor"');
    expect(out.html).toContain("src='cid:img2@luxor'");
    expect(out.attachments).toHaveLength(2);
    expect(out.attachments[0]).toMatchObject({ content: "QUJD", contentType: "image/jpeg", contentId: "img1@luxor", filename: "image-1.jpg" });
    expect(out.attachments[1].contentType).toBe("image/png");
  });

  it("ships a repeated image once", () => {
    const html = `<img src="data:image/png;base64,QUJD"/><img src="data:image/png;base64,QUJD"/>`;
    const out = extractInlineImages(html);
    expect(out.attachments).toHaveLength(1);
    expect(out.html.match(/cid:img1@luxor/g)).toHaveLength(2);
  });

  it("leaves normal https images and plain html alone", () => {
    const html = `<img src="https://x.test/logo.png"/><p>hi</p>`;
    expect(extractInlineImages(html)).toEqual({ html, attachments: [] });
  });
});

describe("htmlToText", () => {
  it("strips tags, keeps line structure and decodes entities", () => {
    const text = htmlToText(`<style>p{}</style><div>Invoice &amp; Quote</div><p>Total&nbsp;$5</p>`);
    expect(text).toContain("Invoice & Quote");
    expect(text).toContain("Total $5");
    expect(text).not.toContain("<");
  });
});

describe("buildFrom / addressOf", () => {
  it("extracts the bare address", () => {
    expect(addressOf("Luxor <no-reply@luxordev.com>")).toBe("no-reply@luxordev.com");
    expect(addressOf("no-reply@luxordev.com")).toBe("no-reply@luxordev.com");
  });
  it("puts the tenant name on the verified address", () => {
    expect(buildFrom("no-reply@luxordev.com", "Apex Roofing")).toBe('"Apex Roofing" <no-reply@luxordev.com>');
    expect(buildFrom("Luxor <no-reply@luxordev.com>", "Apex Roofing")).toBe('"Apex Roofing" <no-reply@luxordev.com>');
  });
  it("strips header-injection characters and falls back when there is no name", () => {
    expect(buildFrom("a@b.co", 'Evil"\r\nBcc: x@y.z <h>')).not.toMatch(/[\r\n<>]{2}/);
    expect(buildFrom("a@b.co", 'Evil"\r\nBcc: x@y.z')).toBe('"Evil Bcc: x@y.z" <a@b.co>');
    expect(buildFrom("Luxor <a@b.co>", "  ")).toBe("Luxor <a@b.co>");
    expect(buildFrom("Luxor <a@b.co>", null)).toBe("Luxor <a@b.co>");
  });
});
