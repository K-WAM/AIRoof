"use client";

import {
  DndContext,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, Pencil, Trash2 } from "lucide-react";
import { Toggle } from "@/components/ui/Toggle";
import type { JobPhotoMeta } from "@/types/jobs";

type PairRow = { before?: JobPhotoMeta; after?: JobPhotoMeta };

/** Explicit pairs win. Old photos without pairId retain the established positional pairing. */
function photoRows(photos: JobPhotoMeta[]): { pairs: PairRow[]; other: JobPhotoMeta[] } {
  const ordered = [...photos].sort((a, b) => (a.sort ?? a.createdAt) - (b.sort ?? b.createdAt));
  const before = ordered.filter((photo) => photo.phase === "before");
  const after = ordered.filter((photo) => photo.phase === "after");
  const pairedAfterIds = new Set<string>();
  const pairs: PairRow[] = before.map((beforePhoto) => {
    const paired = after.find((afterPhoto) => afterPhoto.pairId === beforePhoto.photoId);
    if (paired) pairedAfterIds.add(paired.photoId);
    return { before: beforePhoto, ...(paired ? { after: paired } : {}) };
  });
  const legacyAfter = after.filter((photo) => !photo.pairId && !pairedAfterIds.has(photo.photoId));
  let legacyIndex = 0;
  for (const row of pairs) {
    if (!row.after && legacyAfter[legacyIndex]) row.after = legacyAfter[legacyIndex++];
  }
  const unpaired = [...legacyAfter.slice(legacyIndex), ...after.filter((photo) => photo.pairId && !pairedAfterIds.has(photo.photoId))];
  const other = [...ordered.filter((photo) => photo.phase === "other" || !photo.phase), ...unpaired];
  return { pairs, other };
}

function DraggablePhoto({ photo, onOpen, onEdit, onDelete, onToggle }: {
  photo: JobPhotoMeta;
  onOpen: (photo: JobPhotoMeta) => void;
  onEdit: (photo: JobPhotoMeta) => void;
  onDelete: (photo: JobPhotoMeta) => void;
  onToggle: (photo: JobPhotoMeta) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: photo.photoId });
  return (
    <div ref={setNodeRef} style={{ border: "1px solid #e2e8f0", borderRadius: 10, overflow: "hidden", background: "#fff", opacity: isDragging ? 0.45 : 1, transform: CSS.Transform.toString(transform), transition }}>
      <img src={`data:image/jpeg;base64,${photo.thumbB64}`} alt={photo.label} onClick={() => onOpen(photo)} style={{ width: "100%", height: 120, objectFit: "cover", cursor: "pointer", display: "block" }} />
      <div style={{ padding: "8px 10px" }}>
        {photo.phase && photo.phase !== "other" && <span style={{ display: "inline-block", marginBottom: 6, fontSize: 9, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 4, color: "#fff", background: photo.phase === "before" ? "#64748b" : "var(--accent)" }}>{photo.phase}</span>}
        <p style={{ margin: "0 0 6px", fontSize: 12, color: "#334155", lineHeight: 1.4, display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>{photo.label}</p>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: "#475569" }}><Toggle checked={!!photo.includeInReport} onChange={() => onToggle(photo)} label={`Include ${photo.label} in report`} size="sm" />In report</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button type="button" {...attributes} {...listeners} title="Reorder" aria-label={`Reorder ${photo.label}`} className="icon-del"><GripVertical size={14} strokeWidth={1.75} /></button>
            <button type="button" onClick={() => onEdit(photo)} title="Edit" aria-label={`Edit ${photo.label}`} className="icon-del"><Pencil size={14} strokeWidth={1.75} /></button>
            <button type="button" onClick={() => onDelete(photo)} title="Delete" aria-label={`Delete ${photo.label}`} className="icon-del"><Trash2 size={15} strokeWidth={1.75} /></button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function SortablePhotoGrid({ photos, onOpen, onEdit, onDelete, onToggle, onReorder }: {
  photos: JobPhotoMeta[];
  onOpen: (photo: JobPhotoMeta) => void;
  onEdit: (photo: JobPhotoMeta) => void;
  onDelete: (photo: JobPhotoMeta) => void;
  onToggle: (photo: JobPhotoMeta) => void;
  onReorder: (order: string[], pair?: { afterId: string; beforeId: string }) => void;
}) {
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );
  const { pairs, other } = photoRows(photos);
  const order = [...pairs.flatMap((row) => [row.before, row.after]), ...other].filter((photo): photo is JobPhotoMeta => !!photo).map((photo) => photo.photoId);

  function dragEnd(event: DragEndEvent) {
    const activeId = String(event.active.id);
    const overId = event.over ? String(event.over.id) : null;
    if (!overId || activeId === overId) return;
    const activeIndex = order.indexOf(activeId);
    const overIndex = order.indexOf(overId);
    if (activeIndex < 0 || overIndex < 0) return;
    const active = photos.find((photo) => photo.photoId === activeId);
    const over = photos.find((photo) => photo.photoId === overId);
    onReorder(arrayMove(order, activeIndex, overIndex), active?.phase === "after" && over?.phase === "before" ? { afterId: activeId, beforeId: overId } : undefined);
  }

  return <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={dragEnd} accessibility={{ announcements: {
    onDragStart: ({ active }) => `Picked up ${photos.find((photo) => photo.photoId === active.id)?.label ?? "photo"}.`,
    onDragOver: ({ over }) => over ? `Over ${photos.find((photo) => photo.photoId === over.id)?.label ?? "photo"}.` : "Not over a photo.",
    onDragEnd: ({ active, over }) => over ? `Dropped ${photos.find((photo) => photo.photoId === active.id)?.label ?? "photo"} before ${photos.find((photo) => photo.photoId === over.id)?.label ?? "photo"}.` : "Photo dropped.",
    onDragCancel: () => "Photo reorder cancelled.",
  } }}><SortableContext items={order}>
    {pairs.length > 0 && <section aria-label="Before and After pairs"><h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Before / After pairs</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 14 }}>{pairs.flatMap((row, index) => [row.before ? <DraggablePhoto key={row.before.photoId} photo={row.before} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} /> : <div key={`before-${index}`} aria-label="Empty Before slot" />, row.after ? <DraggablePhoto key={row.after.photoId} photo={row.after} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} /> : <div key={`after-${index}`} aria-label="Empty After slot" style={{ minHeight: 120, border: "1px dashed var(--border)", borderRadius: 10, display: "grid", placeItems: "center", color: "var(--text-muted)", fontSize: 12 }}>Drop After here</div>])}</div></section>}
    {other.length > 0 && <section aria-label="Other photos" style={{ marginTop: pairs.length ? 20 : 0 }}><h3 style={{ margin: "0 0 8px", fontSize: 14 }}>Other</h3><div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 14 }}>{other.map((photo) => <DraggablePhoto key={photo.photoId} photo={photo} onOpen={onOpen} onEdit={onEdit} onDelete={onDelete} onToggle={onToggle} />)}</div></section>}
  </SortableContext></DndContext>;
}
