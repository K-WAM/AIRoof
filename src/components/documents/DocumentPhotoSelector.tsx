"use client";

import { Toggle } from "@/components/ui/Toggle";
import type { JobPhotoMeta } from "@/types/jobs";

const MAX_DOCUMENT_PHOTOS = 16;

export function selectedDocumentPhotoIds(photos: JobPhotoMeta[], photoIds?: string[]): string[] {
  return photoIds ?? photos.filter((photo) => photo.includeInReport).map((photo) => photo.photoId);
}

export function DocumentPhotoSelector({ photos, photoIds, onChange, disabled = false }: {
  photos: JobPhotoMeta[];
  photoIds?: string[];
  onChange: (photoIds: string[]) => void;
  disabled?: boolean;
}) {
  const selected = selectedDocumentPhotoIds(photos, photoIds);
  const selectedSet = new Set(selected);
  const defaults = photos.filter((photo) => photo.includeInReport).map((photo) => photo.photoId);
  const includePhotos = selected.length > 0;

  return (
    <div className="no-print" style={{ display: "grid", gap: 8 }}>
      <label style={{ display: "flex", gap: 10, alignItems: "flex-start", cursor: disabled || photos.length === 0 ? "not-allowed" : "pointer" }}>
        <Toggle
          checked={includePhotos}
          onChange={(next) => onChange(next ? (defaults.length ? defaults : photos.slice(0, MAX_DOCUMENT_PHOTOS).map((photo) => photo.photoId)) : [])}
          label="Include photos"
          disabled={disabled || photos.length === 0}
          size="sm"
        />
        <span style={{ minWidth: 0 }}>
          <strong style={{ fontSize: 14 }}>Include photos</strong>
          <br />
          <small style={{ color: "var(--text-muted)" }}>
            {photos.length === 0 ? "Add photos to this job first." : "Starts with the photos marked In report. Choose up to 16."}
          </small>
        </span>
      </label>
      {includePhotos && (
        <div role="group" aria-label="Photos included in this document" style={{ display: "grid", gap: 6, paddingLeft: 36 }}>
          {photos.map((photo) => {
            const checked = selectedSet.has(photo.photoId);
            const atLimit = !checked && selected.length >= MAX_DOCUMENT_PHOTOS;
            return (
              <label key={photo.photoId} style={{ display: "flex", gap: 8, alignItems: "center", cursor: disabled || atLimit ? "not-allowed" : "pointer", opacity: atLimit ? 0.6 : 1 }}>
                <input type="checkbox" checked={checked} disabled={disabled || atLimit} onChange={(event) => {
                  onChange(event.target.checked ? [...selected, photo.photoId] : selected.filter((id) => id !== photo.photoId));
                }} />
                <span>{photo.phase === "before" ? "Before" : photo.phase === "after" ? "After" : "Photo"}: {photo.label}</span>
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
