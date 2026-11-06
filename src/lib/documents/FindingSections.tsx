import { groupFindingsByCategory, type DocumentFinding } from "./findingGroups";

/** Shared by both paper styles and their print copies. A category prints once, even across many findings. */
export function FindingSections({ findings, classic = false }: { findings: readonly DocumentFinding[]; classic?: boolean }) {
  return <>{groupFindingsByCategory(findings).map(group => <section key={group.category} className="document-finding-category" style={{ padding: classic ? "10px 0" : "18px 0", fontSize: classic ? 13 : undefined }}>
    <h3 style={{ margin: "0 0 8px", breakAfter: "avoid", ...(classic ? { fontSize: 13, textTransform: "uppercase", textDecoration: "underline" } : {}) }}>{group.category}</h3>
    <ol style={{ margin: 0, paddingLeft: 24, listStyleType: "decimal" }}>
      {group.findings.map((finding, index) => <li key={index} className="document-finding" style={{ padding: "0 0 10px 4px", whiteSpace: "pre-wrap", breakInside: "avoid" }}>
        <p style={{ margin: "4px 0" }}><strong>Problem:</strong> {finding.problem}</p>
        <p style={{ margin: "4px 0" }}><strong>Corrective Action:</strong> {finding.solution}</p>
        {finding.note?.trim() && <p style={{ margin: "4px 0" }}><em>Inspector&apos;s note: {finding.note.trim()}</em></p>}
      </li>)}
    </ol>
  </section>)}</>;
}
