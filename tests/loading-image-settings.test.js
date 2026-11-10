const test = require("node:test");
const assert = require("node:assert/strict");

const { normalizeLoadingImage, readLoadingImageFile } = require("../src/loading-image-settings.js");

test("loading image accepts GIF, PNG, and JPEG data only", () => {
  for (const [name, mimeType, dataUrl] of [
    ["custom.gif", "image/gif", "data:image/gif;base64,R0lGODlh"],
    ["custom.png", "image/png", "data:image/png;base64,iVBORw0KGgo="],
    ["custom.jpg", "image/jpeg", "data:image/jpeg;base64,/9j/4AAQ"]
  ]) {
    const result = normalizeLoadingImage({ name, mimeType, dataUrl });
    assert.equal(result.ok, true);
    assert.deepEqual(result.value, { name, mimeType, dataUrl });
  }
  for (const value of [
    { name: "x.webp", mimeType: "image/webp", dataUrl: "data:image/webp;base64,AAAA" },
    { name: "x.svg", mimeType: "image/svg+xml", dataUrl: "data:image/svg+xml;base64,AAAA" },
    { name: "x.png", mimeType: "image/jpeg", dataUrl: "data:image/jpeg;base64,AAAA" },
    { name: "x.jpg", mimeType: "image/jpeg", dataUrl: "not-data" }
  ]) assert.equal(normalizeLoadingImage(value).ok, false);
});

test("loading image reader rejects other file types before reading", async () => {
  let reads = 0;
  class Reader { readAsDataURL() { reads += 1; } }
  await assert.rejects(
    readLoadingImageFile({ name: "x.webp", type: "image/webp" }, Reader),
    /GIF, PNG, or JPEG/
  );
  assert.equal(reads, 0);
});

test("loading image reader returns normalized persisted data", async () => {
  class Reader {
    readAsDataURL() {
      this.result = "data:image/png;base64,iVBORw0KGgo=";
      this.onload();
    }
  }
  const result = await readLoadingImageFile({ name: "space.png", type: "image/png" }, Reader);
  assert.deepEqual(result, {
    name: "space.png", mimeType: "image/png", dataUrl: "data:image/png;base64,iVBORw0KGgo="
  });
});
