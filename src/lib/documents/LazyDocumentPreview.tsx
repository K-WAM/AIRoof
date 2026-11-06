"use client";
import dynamic from "next/dynamic";
import type { DocumentPreviewProps } from "./DocumentPreview";
import { PanelSkeleton } from "@/components/ui/PanelSkeleton";
const loading = () => <PanelSkeleton label="Loading document" document />;
const StandardDocument = dynamic(() => import("./StandardDocument").then(m => m.StandardDocument), { ssr: false, loading });
const ClassicDocument = dynamic(() => import("./ClassicDocument").then(m => m.ClassicDocument), { ssr: false, loading });
export function LazyDocumentPreview(props: DocumentPreviewProps) {
  return props.brand.documentStyle === "classic" ? <ClassicDocument {...props} /> : <StandardDocument {...props} />;
}
